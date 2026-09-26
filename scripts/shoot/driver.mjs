// Driving one tab of the app like a person: real mouse, keys and drags, controls found by
// what a person sees (role + label), and "expect" checks on the result. Shared by `explore`
// (one step at a time) and `journeys.mjs` (saved journeys, many at once), so a step means
// exactly the same thing in both.
import { hits, inPage, layoutSignature, listControls, listLayers, locate } from './explore-page.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// How long an `expect` waits: a scripted reply takes seconds to stream. Only a failing
// check ever waits this long.
const EXPECT_MS = 10_000;

/** The practice app's address for a start block ({ scenario, latency, params }). */
export function appUrl(base, start) {
  const q = new URLSearchParams({ mode: 'workbench', child: '1', latency: String(start.latency ?? 0), scenario: start.scenario ?? 'default' });
  for (const [k, v] of new URLSearchParams(start.params ?? '')) q.set(k, v);
  return `${base}?${q}`;
}

/** Loads the practice app in `tab` as `start` describes, ready for the first step. */
export async function openApp(tab, base, start) {
  await tab.prepare({ theme: start.theme ?? 'meadow-mist', width: start.width ?? 1440, height: start.height ?? 900 });
  await tab.navigate(appUrl(base, start));
  for (const t0 = Date.now(); ; await sleep(50)) {
    if (await tab.evaluate('!!window.__youcodedScreens && document.body.innerText.trim().length > 20', 5000).catch(() => false)) break;
    if (Date.now() - t0 > 20_000) throw new Error('the app did not start within 20 s');
  }
  await tab.still(3000);
  if (start.screen) await openScreen(tab, start.screen);
}

export async function openScreen(tab, name) {
  const r = await tab.evaluate(`window.__youcodedScreens ? window.__youcodedScreens.open(${JSON.stringify(name)}) : { ok: false, reason: 'named screens exist only in the practice app, not the dev window' }`, 20_000);
  if (!r?.ok) throw new Error(`could not open ${name}: ${r?.reason ?? 'no answer'}`);
  await tab.still(3000);
}

export const describe = (t) => `${t.role} "${t.label}"${t.nth > 1 ? ` (#${t.nth})` : ''}`;

/** One step, in words — for step lines and failure reports. */
export function stepText(s) {
  if (s.do === 'expect') return `expect${s.not ? ' NOT' : ''} ${s.control ? describe(s.control) : s.screen ? `screen ${s.screen}` : `"${s.text}"`}`;
  if (s.target) return `${s.do}${s.dir ? ` ${s.dir}${s.times > 1 ? ` ×${s.times}` : ''} over` : ''} ${describe(s.target)}${s.to ? ` to ${describe(s.to)}` : ''}${s.text ? ` "${s.text}"` : ''}`;
  return `${s.do} ${s.key ?? (s.text !== undefined ? `"${s.text}"` : null) ?? s.screen ?? `${s.dir}${s.times > 1 ? ` ×${s.times}` : ''}`}`;
}

export function makeDriver(tab, { width = 1440, height = 900 } = {}) {
  let pointer = { x: 0, y: 0 };

  // ─── Real input ──────────────────────────────────────────────────────────
  const mouse = (type, x, y, extra = {}) => tab.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'mouse', ...extra });
  async function moveTo(x, y, buttons = 0) {
    // A few in-between points, so hover styles and drag-over targets see the pointer travel.
    const n = Math.max(1, Math.min(8, Math.round(Math.hypot(x - pointer.x, y - pointer.y) / 40)));
    for (let i = 1; i <= n; i++) await mouse('mouseMoved', pointer.x + ((x - pointer.x) * i) / n, pointer.y + ((y - pointer.y) * i) / n, { buttons });
    pointer = { x, y };
  }
  async function press(x, y, button = 'left', clickCount = 1) {
    await moveTo(x, y);
    const buttons = button === 'right' ? 2 : 1;
    for (let c = 1; c <= clickCount; c++) {
      await mouse('mousePressed', x, y, { button, buttons, clickCount: c });
      await mouse('mouseReleased', x, y, { button, buttons: 0, clickCount: c });
    }
  }

  const KEYS = { Enter: [13, '\r'], Escape: [27], Tab: [9], Backspace: [8], Delete: [46], Space: [32, ' '], ArrowLeft: [37], ArrowUp: [38], ArrowRight: [39], ArrowDown: [40], Home: [36], End: [35], PageUp: [33], PageDown: [34] };
  const MODS = { Alt: 1, Ctrl: 2, Control: 2, Meta: 4, Cmd: 4, Shift: 8 };
  async function key(combo) {
    const parts = combo.split('+'); const k = parts.pop(); let modifiers = 0;
    for (const m of parts) { if (!(m in MODS)) throw new Error(`unknown modifier "${m}" (Ctrl, Shift, Alt, Meta)`); modifiers |= MODS[m]; }
    let code, keyName = k, vk, text;
    if (KEYS[k]) { [vk, text] = KEYS[k]; code = k === 'Space' ? 'Space' : k; if (k === 'Space') keyName = ' '; }
    else if (/^F([1-9]|1[0-2])$/.test(k)) { vk = 111 + Number(k.slice(1)); code = k; }
    else if (k.length === 1) {
      vk = k.toUpperCase().charCodeAt(0); code = /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : /\d/.test(k) ? `Digit${k}` : undefined;
      keyName = modifiers & 8 ? k.toUpperCase() : k; text = modifiers & ~8 ? undefined : keyName;
    } else throw new Error(`unknown key "${k}" (Enter, Escape, Tab, Backspace, Delete, Space, Arrow…, Home, End, PageUp, PageDown, F1–F12, or one character)`);
    if (modifiers & ~8) text = undefined;   // Ctrl+K types nothing
    await tab.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers, text, unmodifiedText: text });
    await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  }
  async function typeText(s) {
    for (const ch of s) {
      if (ch === '\n') { await key('Enter'); continue; }
      await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    }
  }

  async function drag(from, to) {
    // Native drags (a draggable element) never start from synthetic mouse events alone, so
    // Chrome is asked to hand the drag over and it is played as drag events instead.
    let dragData = null;
    const off = tab.on((m) => { if (m.method === 'Input.dragIntercepted') dragData = m.params.data; });
    await tab.send('Input.setInterceptDrags', { enabled: true });
    try {
      await moveTo(from.x, from.y);
      await mouse('mousePressed', from.x, from.y, { button: 'left', buttons: 1, clickCount: 1 });
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps, y = from.y + ((to.y - from.y) * i) / steps;
        if (dragData) await tab.send('Input.dispatchDragEvent', { type: i === 1 ? 'dragEnter' : 'dragOver', x, y, data: dragData });
        else await mouse('mouseMoved', x, y, { buttons: 1 });
        pointer = { x, y };
        await sleep(16);
      }
      await sleep(150);   // a hand rests on the target before letting go
      if (dragData) await tab.send('Input.dispatchDragEvent', { type: 'drop', x: to.x, y: to.y, data: dragData });
      await mouse('mouseReleased', to.x, to.y, { button: 'left', buttons: 0, clickCount: 1 });
    } finally { off(); await tab.send('Input.setInterceptDrags', { enabled: false }).catch(() => {}); }
  }

  // ─── Waiting for the page ────────────────────────────────────────────────
  // "Still" (engine) sees fetches and animations, not a row that a timer adds late. So the
  // controls are read until two readings 150 ms apart agree (at most 3 s).
  async function settle() {
    await tab.still(3000);
    let prev = null;
    for (const t0 = Date.now(); Date.now() - t0 < 3000; await sleep(150)) {
      await tab.evaluate(inPage(listLayers));
      await tab.evaluate(inPage(listControls, {}));
      const sig = await tab.evaluate(inPage(layoutSignature));
      if (sig === prev) return;
      prev = sig;
    }
  }

  // ─── Finding a control ───────────────────────────────────────────────────
  // By number from the last list (explore). If that element was redrawn since — or there is
  // no number (a journey) — it is found by what a person sees: role and label, and which of
  // equals it was. The point is checked against what is really under it just before use: a
  // row that arrived late once pushed the message box down, and the click hit a quick chip.
  async function where(target, n) {
    if (n) { const p = await tab.evaluate(inPage(locate, n)); if (p && await tab.evaluate(inPage(hits, n, p.x, p.y))) return p; }
    // A journey step may run before the control has arrived: look again for up to 5 s.
    let controls = [];
    for (const t0 = Date.now(); ; await sleep(250)) {
      await settle();
      await tab.evaluate(inPage(listLayers));
      ({ controls } = await tab.evaluate(inPage(listControls, { all: true })));
      const same = controls.filter((c) => c.role === target.role && c.label === target.label);
      const hit = same[(target.nth ?? 1) - 1] ?? same[0];
      if (hit) { const p = await tab.evaluate(inPage(locate, hit.n)); if (p && await tab.evaluate(inPage(hits, hit.n, p.x, p.y))) return p; }
      if (Date.now() - t0 > 5000) break;
    }
    const shown = controls.slice(0, 60).map((c) => `${c.role} "${c.label}"`).join(', ');
    throw new Error(`${describe(target)} is not on screen. On screen: ${shown}${controls.length > 60 ? ', …' : ''}`);
  }

  // What a person would check with their eyes: some words are showing (or not), or a named
  // screen is showing. Waits up to EXPECT_MS — a reply or a closing animation takes a moment.
  async function expect(step) {
    if (step.control) {
      // A control a person can see, by role and label (labels can be split across elements,
      // so the page's text alone would miss "Haiku | Auto Effort").
      for (const t0 = Date.now(); Date.now() - t0 < EXPECT_MS; await sleep(200)) {
        await tab.evaluate(inPage(listLayers));
        const { controls } = await tab.evaluate(inPage(listControls, {}));
        const there = controls.some((c) => c.role === step.control.role && c.label === step.control.label);
        if (there !== Boolean(step.not)) return;
      }
      throw new Error(`${step.not ? 'still showing' : 'not showing'} after ${EXPECT_MS / 1000} s: ${describe(step.control)}`);
    }
    const probe = step.screen
      // Showing = some copy's section is in the window and visible. A closed drawer stays
      // mounted just off the edge (Settings at x −320), which must not count as showing.
      ? `[...document.querySelectorAll('[data-screen=${JSON.stringify(step.screen)}]')].some((m) => { const p = m.parentElement; if (!p) return false; const r = p.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false; for (let e = p; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; } return true; })`
      : `document.body.innerText.includes(${JSON.stringify(step.text)})`;
    for (const t0 = Date.now(); Date.now() - t0 < EXPECT_MS; await sleep(200)) {
      if (Boolean(await tab.evaluate(probe).catch(() => false)) !== Boolean(step.not)) return;
    }
    throw new Error(`${step.not ? 'still showing' : 'not showing'} after ${EXPECT_MS / 1000} s: ${step.screen ? `screen ${step.screen}` : `"${step.text}"`}`);
  }

  // ─── Doing one step ──────────────────────────────────────────────────────
  async function perform(step, n) {
    switch (step.do) {
      case 'click': case 'double-click': case 'right-click': case 'hover': {
        const p = await where(step.target, n);
        if (step.do === 'hover') await moveTo(p.x, p.y);
        else await press(p.x, p.y, step.do === 'right-click' ? 'right' : 'left', step.do === 'double-click' ? 2 : 1);
        break;
      }
      case 'type': {
        if (step.target) { const p = await where(step.target, n); await press(p.x, p.y); await tab.still(1000); }
        await typeText(step.text);
        break;
      }
      case 'key': await key(step.key); break;
      case 'drag': await drag(await where(step.target, n), await where(step.to, step.toN)); break;
      case 'scroll': {
        const p = step.target ? await where(step.target, n) : { x: width / 2, y: height / 2 };
        await moveTo(p.x, p.y);
        for (let i = 0; i < (step.times ?? 1); i++) { await mouse('mouseWheel', p.x, p.y, { deltaX: 0, deltaY: step.dir === 'up' ? -400 : 400 }); await sleep(30); }
        break;
      }
      case 'open': await openScreen(tab, step.screen); break;
      case 'expect': await expect(step); return;
      default: throw new Error(`unknown step "${step.do}"`);
    }
    await tab.still(3000);
  }

  return { perform, settle, where };
}
