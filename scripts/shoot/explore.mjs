#!/usr/bin/env node
// explore — click through the practice app one step at a time, the way a person would.
// The app stays open between steps. Every step answers with a picture, the numbered list
// of what can be clicked, and the stack of open layers; you pick a number.
//
//   explore start [--scenario empty] [--screen settings] [--width 390] [--theme light]
//                 [--latency 150] [--params gpus=2&sync=auth-error] [--worktree X] [--dev]
//   explore look [--all]            picture + controls (--all: also those scrolled out of view)
//   explore click 7 | double-click 7 | right-click 7 | hover 7
//   explore type "hello"            types into whatever has focus (type 7 "hello": click 7 first)
//   explore key Escape | key Ctrl+K | key Enter
//   explore drag 4 to 9             a real drag, with hover states on the way
//   explore scroll down [7]         the wheel, over control 7 or the middle of the window
//   explore open settings/sync      jump to a named screen (explore screens lists them)
//   explore back                    undo the last step (starts over and replays the others)
//   explore stack                   the open layers, top first, and what has focus
//   explore errors                  every page error so far
//   explore save <name>             keep this session's steps as a journey
//   explore replay <name>           run a saved journey in a fresh session
//   explore stop
//
// One session per workspace worktree; it stops itself after 10 minutes idle, and `start`
// stops any earlier one. Pictures: scratch/explore/<time>/. Spec:
// docs/active/specs/2026-09-24-shoot-and-explore.md → "Tool 2: explore".
//
// --dev attaches to an isolated dev window started by `bash scripts/run-dev.sh` — only one
// that left its marker file (desktop/.dev-instances/). The installed app never writes one,
// so it can never be attached to.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachPage, ensureBuild, findDevWindow, openBrowser, resolveCheckout, serve } from './engine.mjs';
import { hideTags, hits, inPage, layoutSignature, listControls, listLayers, locate, showTags } from './explore-page.mjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = dirname(SELF);
const WORKSPACE = resolve(HERE, '..', '..');
const JOURNEYS = join(HERE, 'journeys');
const STATE_DIR = join(tmpdir(), 'youcoded-shoot', 'explore');
const KEY = createHash('sha1').update(WORKSPACE).digest('hex').slice(0, 12);
const STATE = join(STATE_DIR, `${KEY}.json`);
const LOG = join(STATE_DIR, `${KEY}.log`);
const IDLE_MS = 10 * 60_000;
const MAX_LISTED = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

if (process.argv[2] === '__serve') daemon(JSON.parse(process.argv[3])).catch((e) => fail(e));
else client(process.argv.slice(2)).catch((e) => { console.error(`explore: ${e.message}`); process.exit(1); });

function fail(e) {
  try { writeFileSync(STATE, JSON.stringify({ error: e.message, pid: process.pid })); } catch { /* nothing to tell */ }
  console.error(e.stack ?? e.message);
  process.exit(1);
}

// ═══ The command you type ═══════════════════════════════════════════════════

async function client(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help') { console.log(help()); return; }
  if (cmd === 'start') return start(parseStart(rest), null);
  if (cmd === 'replay') {
    const name = rest[0]; if (!name) throw new Error('replay needs a journey name');
    const file = join(JOURNEYS, `${name.replace(/\.json$/, '')}.json`);
    if (!existsSync(file)) throw new Error(`no journey named "${name}" (${readdirSync(JOURNEYS, { withFileTypes: true }).filter((d) => d.name.endsWith('.json')).map((d) => d.name.slice(0, -5)).join(', ') || 'none saved yet'})`);
    const journey = JSON.parse(readFileSync(file, 'utf8'));
    return start({ ...journey.start, worktree: parseStart(rest.slice(1)).worktree }, journey);
  }
  if (cmd === 'stop') { const s = session(); if (!s) { console.log('no explore session is running'); return; } await stopSession(s); console.log('stopped'); return; }
  const s = session();
  if (!s) throw new Error('no explore session is running — start one with: explore start');
  const out = await ask(s, { cmd, args: rest });
  process.stdout.write(out.text.endsWith('\n') ? out.text : out.text + '\n');
  process.exit(out.exit ?? 0);
}

// The comment block at the top of this file is the help.
function help() { return readFileSync(SELF, 'utf8').split('\n').slice(1).filter((l, i, a) => a.slice(0, i + 1).every((x) => x.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'); }

function parseStart(args) {
  const o = { scenario: 'default', screen: null, width: 1440, height: null, theme: 'meadow-mist', latency: 0, params: '', worktree: null, dev: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]; const next = () => { const v = args[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--scenario') o.scenario = next();
    else if (a === '--screen') o.screen = next();
    else if (a === '--width') o.width = Number(next());
    else if (a === '--height') o.height = Number(next());
    else if (a === '--theme') o.theme = next();
    else if (a === '--latency') o.latency = Number(next());
    else if (a === '--params') o.params = next();
    else if (a === '--worktree') o.worktree = next();
    else if (a === '--dev') o.dev = true;
    else throw new Error(`unknown start option ${a} (see explore --help)`);
  }
  o.height ??= o.width < 640 ? 844 : 900;
  return o;
}

/** The running session for this worktree, or null. A record whose process is gone is cleared. */
function session() {
  if (!existsSync(STATE)) return null;
  let s; try { s = JSON.parse(readFileSync(STATE, 'utf8')); } catch { return null; }
  if (!s.pid || !alive(s.pid)) { rmSync(STATE, { force: true }); return null; }
  return s.port ? s : null;
}

async function ask(s, body, ms = 120_000) {
  const r = await fetch(`http://127.0.0.1:${s.port}/`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  return r.json();
}

async function stopSession(s) {
  await ask(s, { cmd: 'stop' }, 10_000).catch(() => {});
  for (let i = 0; i < 50 && alive(s.pid); i++) await sleep(100);
  // Only ever our own helper: its command line names this file and the __serve switch.
  if (alive(s.pid)) {
    let cmd = ''; try { cmd = readFileSync(`/proc/${s.pid}/cmdline`, 'utf8'); } catch { /* not Linux, or gone */ }
    if (cmd.includes(SELF) && cmd.includes('__serve')) process.kill(s.pid, 'SIGKILL');
  }
  rmSync(STATE, { force: true });
}

async function start(o, journey) {
  mkdirSync(STATE_DIR, { recursive: true });
  const old = session(); if (old) await stopSession(old);
  rmSync(STATE, { force: true });
  o.checkout = o.worktree ? resolveCheckout(o.worktree) : defaultCheckout();
  if (o.dev) o.marker = findDevWindow(o.checkout);
  // Built here, where its progress shows; the helper then finds it cached.
  else await ensureBuild(o.checkout, (m) => console.error(`[explore] ${m}`));
  const child = spawn(process.execPath, [SELF, '__serve', JSON.stringify(o)], { detached: true, stdio: ['ignore', openSync(LOG, 'w'), openSync(LOG, 'a')] });
  child.unref();
  let s = null;
  for (let t0 = Date.now(); Date.now() - t0 < 60_000; await sleep(100)) {
    if (!existsSync(STATE)) continue;
    try { s = JSON.parse(readFileSync(STATE, 'utf8')); } catch { continue; }
    if (s.error) throw new Error(`could not start: ${s.error}`);
    if (s.port) break;
    s = null;
  }
  if (!s) throw new Error(`the session did not start within 60 s (log: ${LOG})`);
  const out = await ask(s, journey ? { cmd: '__replay', steps: journey.steps } : { cmd: 'look', args: [], first: true });
  process.stdout.write(out.text.endsWith('\n') ? out.text : out.text + '\n');
  process.exit(out.exit ?? 0);
}

// This workspace's own app checkout, the same default `shoot` uses.
function defaultCheckout() {
  const local = join(WORKSPACE, 'youcoded');
  return existsSync(join(local, 'desktop')) ? local : resolveCheckout('');
}

// ═══ The helper that keeps the app open ═════════════════════════════════════

async function daemon(o) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const outDir = join(WORKSPACE, 'scratch', 'explore', stamp);
  mkdirSync(outDir, { recursive: true });

  let server = null, browser = null, tab = null, base = '';
  const allErrors = []; let newErrors = [];
  let steps = []; let stepNo = 0; let lastPng = null; let lastList = [];
  let pointer = { x: 0, y: 0 };

  const noteErrors = (t) => t.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300);
      newErrors.push(text); allErrors.push(text);
    }
  });
  const takeErrors = () => { const ex = tab.takeErrors(); allErrors.push(...ex); const e = [...new Set([...newErrors, ...ex])]; newErrors = []; return e; };

  // ─── Opening the app ─────────────────────────────────────────────────────
  async function fresh() {
    if (o.dev) return;
    await tab?.close();
    tab = await browser.newTab();
    noteErrors(tab);
    await tab.prepare({ theme: o.theme, width: o.width, height: o.height });
    const q = new URLSearchParams({ mode: 'workbench', child: '1', latency: String(o.latency), scenario: o.scenario });
    for (const [k, v] of new URLSearchParams(o.params)) q.set(k, v);
    await tab.navigate(`${base}?${q}`);
    for (const t0 = Date.now(); ; await sleep(50)) {
      if (await tab.evaluate('!!window.__youcodedScreens && document.body.innerText.trim().length > 20', 5000).catch(() => false)) break;
      if (Date.now() - t0 > 20_000) throw new Error('the app did not start within 20 s');
    }
    await tab.still(3000);
    if (o.screen) await openScreen(o.screen);
    pointer = { x: 0, y: 0 };
  }

  async function openScreen(name) {
    const r = await tab.evaluate(`window.__youcodedScreens ? window.__youcodedScreens.open(${JSON.stringify(name)}) : { ok: false, reason: 'named screens exist only in the practice app, not the dev window' }`, 20_000);
    if (!r?.ok) throw new Error(`could not open ${name}: ${r?.reason ?? 'no answer'}`);
    await tab.still(3000);
  }

  if (o.dev) {
    tab = await attachPage(o.marker.devtoolsPort, `http://localhost:${o.marker.vitePort}`);
    noteErrors(tab);
  } else {
    server = await serve(await ensureBuild(o.checkout));
    base = `http://127.0.0.1:${server.port}/index.html`;
    browser = await openBrowser({ width: o.width, height: o.height });
    await fresh();
  }

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

  // ─── Finding a control ───────────────────────────────────────────────────
  // By number from the last list. If that element was redrawn since, it is found again by
  // what a person sees — its role and label (and which of equals it was).
  // The point is checked against what is really under it just before use: a row that
  // arrived late once pushed the message box down, and the click landed on a quick chip.
  async function where(target, n) {
    if (n) { const p = await tab.evaluate(inPage(locate, n)); if (p && await tab.evaluate(inPage(hits, n, p.x, p.y))) return p; }
    await settle();
    await tab.evaluate(inPage(listLayers));
    const { controls } = await tab.evaluate(inPage(listControls, { all: true }));
    const same = controls.filter((c) => c.role === target.role && c.label === target.label);
    const hit = same[(target.nth ?? 1) - 1] ?? same[0];
    if (hit) { const p = await tab.evaluate(inPage(locate, hit.n)); if (p && await tab.evaluate(inPage(hits, hit.n, p.x, p.y))) return p; }
    const shown = controls.slice(0, 60).map((c) => `${c.role} "${c.label}"`).join(', ');
    throw Object.assign(new Error(`${describe(target)} is not on screen. On screen: ${shown}${controls.length > 60 ? ', …' : ''}`), { quiet: true });
  }
  const describe = (t) => `${t.role} "${t.label}"${t.nth > 1 ? ` (#${t.nth})` : ''}`;
  function pick(arg) {
    const n = Number(arg);
    if (!Number.isInteger(n) || n < 1) throw new Error(`"${arg ?? ''}" is not a control number — run explore look`);
    const c = lastList[n - 1];
    if (!c) throw new Error(`there is no control ${n} (the last list had ${lastList.length}) — run explore look`);
    return { n, target: { role: c.role, label: c.label, nth: c.nth } };
  }

  // ─── Doing one step (also how `back` and journeys replay) ─────────────────
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
        const p = step.target ? await where(step.target, n) : { x: o.width / 2, y: o.height / 2 };
        await moveTo(p.x, p.y);
        await mouse('mouseWheel', p.x, p.y, { deltaX: 0, deltaY: step.dir === 'up' ? -400 : 400 });
        break;
      }
      case 'open': await openScreen(step.screen); break;
      default: throw new Error(`unknown step "${step.do}"`);
    }
    await tab.still(3000);
  }

  // ─── What every step answers with ────────────────────────────────────────
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
  async function report(label, { all = false, first = false } = {}) {
    await settle();
    const { layers, base: baseScreens, focus } = await tab.evaluate(inPage(listLayers), 15_000);
    const { controls, covered, offscreen } = await tab.evaluate(inPage(listControls, { all }), 15_000);
    lastList = controls;
    const file = join(outDir, `${String(stepNo).padStart(2, '0')}-${label.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}`);
    const png = await tab.png();
    writeFileSync(`${file}.png`, png);
    await tab.evaluate(inPage(showTags, controls));
    try { writeFileSync(`${file}.numbers.png`, await tab.png()); } finally { await tab.evaluate(inPage(hideTags)).catch(() => {}); }
    const unchanged = !first && lastPng && png.equals(lastPng);
    lastPng = png;
    const errs = takeErrors();
    const lines = [];
    lines.push(`picture: ${file}.png`);
    lines.push(`numbered: ${file}.numbers.png`);
    if (unchanged) lines.push('NOTHING ON SCREEN CHANGED after this step.');
    lines.push(`layers: ${layerLine(layers, baseScreens)}`);
    if (focus) lines.push(`focus: ${focus}`);
    lines.push(errs.length ? `errors (${errs.length} new): ${errs.map((e) => e.split('\n')[0]).join(' | ')}` : 'errors: none');
    const extra = [covered && `${covered} behind the top layer, not listed`, offscreen && `${offscreen} scrolled out of view (look --all)`].filter(Boolean).join('; ');
    lines.push(`controls: ${controls.length}${extra ? ` (${extra})` : ''}`);
    let group = -1;
    for (const c of controls.slice(0, MAX_LISTED)) {
      // A heading per layer, top first, so a menu's items read as that menu's.
      if (c.layer !== group && layers.length) lines.push(c.layer < layers.length ? ` in ${layers[c.layer].kind} "${layers[c.layer].name}":` : ' in the app:');
      group = c.layer;
      const st = c.state.length ? ` [${c.state.join(', ')}]` : '';
      lines.push(`  ${String(c.n).padStart(3)}  ${c.role} ${c.label ? `"${c.label}"` : '(no label)'}${st}  @${c.x},${c.y}${c.off ? ' (out of view)' : ''}`);
    }
    if (controls.length > MAX_LISTED) lines.push(`  … ${controls.length - MAX_LISTED} more — scroll, or open a narrower screen`);
    return lines.join('\n');
  }
  const layerLine = (layers, baseScreens) => {
    const named = (l) => `${l.kind} "${l.name}"${l.screen ? ` (${l.screen})` : ''}${l.covered ? ' [partly covered]' : ''}`;
    const baseName = `the app${baseScreens.length ? ` (${baseScreens.join(', ')})` : ''}`;
    return [...layers.map(named), baseName].join(' › over ');
  };

  // ─── Commands ────────────────────────────────────────────────────────────
  async function command({ cmd, args = [], first, steps: journeySteps }) {
    const verb = cmd;
    if (verb === 'look') return report('look', { all: args.includes('--all'), first });
    if (verb === 'stack') { const { layers, base: b, focus } = await tab.evaluate(inPage(listLayers)); return `layers: ${layerLine(layers, b)}${focus ? `\nfocus: ${focus}` : ''}`; }
    if (verb === 'errors') return allErrors.length ? allErrors.map((e, i) => `${i + 1}. ${e}`).join('\n') : 'no page errors this session';
    if (verb === 'screens') { const list = await tab.evaluate('window.__youcodedScreens ? window.__youcodedScreens.list() : null'); return list ? list.map((s) => `${s.name}${s.tags?.length ? `  [${s.tags.join(', ')}]` : ''}`).join('\n') : 'named screens exist only in the practice app'; }
    if (verb === 'save') {
      const name = args[0]; if (!name || !/^[a-z0-9-]+$/.test(name)) throw new Error('save needs a name of lowercase letters, digits and dashes');
      if (o.dev) throw new Error('a journey is replayed on the practice app; a dev-window session cannot be saved');
      mkdirSync(JOURNEYS, { recursive: true });
      const { scenario, screen, width, height, theme, latency, params } = o;
      const f = join(JOURNEYS, `${name}.json`);
      writeFileSync(f, JSON.stringify({ start: { scenario, screen, width, height, theme, latency, params }, steps }, null, 2) + '\n');
      return `saved ${steps.length} step(s) to ${f}`;
    }
    if (verb === 'back') {
      if (o.dev) throw new Error('back starts the app over, which a dev window cannot do — undo by hand (key Escape, click Close…)');
      if (!steps.length) throw new Error('nothing to undo');
      steps = steps.slice(0, -1);
      await fresh();
      for (const [i, s] of steps.entries()) { try { await perform(s); } catch (e) { throw new Error(`replaying step ${i + 1} (${s.do}) failed: ${e.message}`); } }
      stepNo++;
      return report('back');
    }
    if (verb === '__replay') {
      for (const [i, s] of journeySteps.entries()) {
        stepNo++;
        try { await perform(s); steps.push(s); }
        catch (e) { return { text: `JOURNEY FAILED at step ${i + 1} of ${journeySteps.length}: ${s.do}${s.target ? ` ${describe(s.target)}` : ''}${s.screen ? ` ${s.screen}` : ''}\n${e.message}\n\n${await report(`failed-${s.do}`)}`, exit: 1 }; }
        await tab.still(3000);
        const png = await tab.png(); writeFileSync(join(outDir, `${String(stepNo).padStart(2, '0')}-${s.do}.png`), png);
      }
      return `journey passed: ${journeySteps.length} step(s), pictures in ${outDir}\n\n${await report('end')}`;
    }

    // Steps that change the app.
    let step, n, toN;
    if (['click', 'double-click', 'right-click', 'hover'].includes(verb)) { const p = pick(args[0]); n = p.n; step = { do: verb, target: p.target }; }
    else if (verb === 'type') {
      if (args.length >= 2 && /^\d+$/.test(args[0])) { const p = pick(args[0]); n = p.n; step = { do: 'type', target: p.target, text: args.slice(1).join(' ') }; }
      else if (args.length) step = { do: 'type', text: args.join(' ') };
      else throw new Error('type needs text: explore type "hello"');
    } else if (verb === 'key') { if (!args[0]) throw new Error('key needs a key: explore key Escape'); step = { do: 'key', key: args[0] }; }
    else if (verb === 'drag') {
      if (args[1] !== 'to' || !args[2]) throw new Error('drag needs two numbers: explore drag 4 to 9');
      const a = pick(args[0]), b = pick(args[2]); n = a.n; toN = b.n;
      step = { do: 'drag', target: a.target, to: b.target };
    } else if (verb === 'scroll') {
      if (!['up', 'down'].includes(args[0])) throw new Error('scroll needs a direction: explore scroll down [7]');
      step = { do: 'scroll', dir: args[0] };
      if (args[1]) { const p = pick(args[1]); n = p.n; step.target = p.target; }
    } else if (verb === 'open') { if (!args[0]) throw new Error('open needs a screen name (explore screens lists them)'); step = { do: 'open', screen: args[0] }; }
    else throw new Error(`unknown command "${verb}" — see explore --help`);

    await perform({ ...step, toN }, n);
    steps.push(step); stepNo++;
    const what = step.target ? `${step.do} ${describe(step.target)}${step.to ? ` to ${describe(step.to)}` : ''}` : `${step.do} ${step.key ?? step.text ?? step.screen ?? step.dir ?? ''}`;
    return `step ${stepNo}: ${what}\n${await report(step.do)}`;
  }

  // ─── Serving commands, one at a time ─────────────────────────────────────
  let idle = null; let queue = Promise.resolve();
  const shutdown = async () => {
    try { await tab?.close(); } catch { /* going anyway */ }
    browser?.close(); server?.close(); http.close();
    rmSync(STATE, { force: true });
    process.exit(0);
  };
  const touch = () => { clearTimeout(idle); idle = setTimeout(shutdown, IDLE_MS); };
  const http = createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      touch();
      const msg = JSON.parse(body || '{}');
      if (msg.cmd === 'stop') { res.end(JSON.stringify({ text: 'stopped' })); setTimeout(shutdown, 50); return; }
      queue = queue.then(async () => {
        let out;
        try {
          // A step that hangs fails alone; the session stays usable.
          const r = await Promise.race([command(msg), sleep(90_000).then(() => { throw new Error('this step took over 90 s'); })]);
          out = typeof r === 'string' ? { text: r } : r;
        } catch (e) { out = { text: `FAILED: ${e.message}`, exit: 1 }; }
        res.end(JSON.stringify(out));
      });
    });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  touch();
  writeFileSync(STATE, JSON.stringify({ pid: process.pid, port: http.address().port, out: outDir, checkout: o.checkout, dev: o.dev }));
}
