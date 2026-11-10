// The verbs behind dev-chat.mjs, written against a "tab" (the object engine.mjs's attachPage
// returns: evaluate / send / png / close) so a stub page can test them without any app.
//
// STATUS: UNPROVEN AGAINST A REAL WINDOW. Written 2026-11-10 without launching a dev app (a test
// copy currently shares the owner's real settings and chat history, an open decision of his).
// What a first real run must confirm is listed in docs/local-dev.md -> "Driving a dev window's
// Claude Code chat".
//
// WHY this exists (card #209): testing a Claude Code feature in a dev window took ~25 ad hoc CDP calls.
// WHY real key events for `say`: long messages sent with session.sendInput stuck in Claude Code's
// box, and a synthetic Enter (a dispatched KeyboardEvent) or a send-button click after setting the
// textarea's value did not send (card #209; the old recipe in docs/local-dev.md: "React's Enter
// handler is flaky with synthetic KeyboardEvents"). CDP Input.* events are what the browser
// itself would deliver, so the page sees a real keystroke.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Attaching: dev windows only ─────────────────────────────────────────────
/**
 * The ONLY way this script reaches a window. findDevWindow (engine.mjs) returns a marker only
 * when run-dev.sh, which Destin's installed app (/opt/YouCoded) never goes through, is alive and
 * wrote it. This adds three checks of its own so a wrong marker cannot become an attach to the
 * real app: numeric ports, the marker's process is run-dev.sh, and — after attaching — the
 * page's address must be the dev server's http://localhost:<vitePort>, which the installed app
 * (a packaged file page) never is.
 */
export function assertDevMarker(marker, readCmd = (pid) => readFileSync(`/proc/${pid}/cmdline`, 'utf8')) {
  if (!marker || !Number.isInteger(marker.devtoolsPort) || !Number.isInteger(marker.vitePort) || !marker.pid) {
    throw new Error('dev-chat: refusing to attach — no valid dev-window marker (run-dev.sh writes one)');
  }
  // Asserted again here (findDevWindow checks it too) because this is the rule that keeps the
  // installed app out: only run-dev.sh writes a marker, and the installed app is never run-dev.sh.
  let cmd = null; try { cmd = readCmd(marker.pid); } catch { /* no /proc */ }
  if (cmd !== null && !cmd.includes('run-dev.sh')) throw new Error('dev-chat: refusing to attach — the marker\'s process is not run-dev.sh');
  return marker;
}

export async function attachDev(checkout, { findDevWindow, attachPage, readCmd }) {
  const marker = assertDevMarker(findDevWindow(checkout), readCmd);
  const prefix = `http://localhost:${marker.vitePort}`;
  const tab = await attachPage(marker.devtoolsPort, prefix);
  const origin = await tab.evaluate('location.origin').catch(() => null);
  if (origin !== prefix) {
    await tab.close?.();
    throw new Error(`dev-chat: refusing to drive a page at ${origin} — a dev window serves ${prefix}`);
  }
  if (!(await tab.evaluate('Boolean(window.claude?.session?.create)'))) {
    await tab.close?.();
    throw new Error('dev-chat: the page has no window.claude bridge yet — wait for the dev window to finish loading');
  }
  return tab;
}

// ─── In-page helpers (as source text, run through tab.evaluate) ──────────────
const VISIBLE = `(el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.disabled; }`;

// The message box: the textarea inside a <form> (docs/local-dev.md: there are two textareas).
const BOX = `(() => { const vis = ${VISIBLE}; return [...document.querySelectorAll('form textarea')].filter(vis)[0] || null; })()`;

/** Where a button with this label is, or why it cannot be clicked. Exact match first, then a unique partial one. */
const locateLabel = (label) => `(() => {
  const vis = ${VISIBLE}; const want = ${JSON.stringify(label)}.trim().toLowerCase();
  const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().toLowerCase();
  const all = [...document.querySelectorAll('button,[role=button],[role=menuitem],a')].filter(vis);
  let hits = all.filter((el) => name(el) === want);
  if (hits.length === 0) hits = all.filter((el) => name(el).includes(want));
  if (hits.length === 0) return { none: true, seen: all.map(name).filter(Boolean).slice(0, 25) };
  if (hits.length > 1) return { ambiguous: hits.map(name).slice(0, 10) };
  const el = hits[0]; el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  if (!top || !(top === el || el.contains(top))) return { covered: true, by: (top && (top.getAttribute('aria-label') || top.tagName)) || 'something' };
  return { x, y, label: name(el) };
})()`;

// ─── The verbs ───────────────────────────────────────────────────────────────
/** A real left click at a point: move, press, release. */
async function mouseClick(tab, x, y) {
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'mouse' });
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
}

export async function clickLabel(tab, label, { sleep = sleepReal } = {}) {
  const p = await tab.evaluate(locateLabel(label));
  if (p.none) throw new Error(`no visible button called "${label}". Buttons on screen: ${p.seen.join(' | ') || '(none)'}`);
  if (p.ambiguous) throw new Error(`"${label}" matches more than one button (${p.ambiguous.join(' | ')}) — use more of the label`);
  if (p.covered) throw new Error(`the "${label}" button is covered by ${p.by}`);
  await mouseClick(tab, p.x, p.y);
  await sleep(150);
  return `clicked "${p.label}"`;
}

/** Click the mode chip (title "Click to cycle permission mode") until it reads the wanted mode. */
export async function setMode(tab, mode, { sleep = sleepReal } = {}) {
  const wanted = { normal: /^NORMAL$/i, auto: /^AUTO MODE$|^AUTO$/i }[mode];
  if (!wanted) throw new Error('mode is "normal" or "auto"');
  const read = () => tab.evaluate(`(() => { const vis = ${VISIBLE}; const el = [...document.querySelectorAll('button')].filter(vis).find((b) => /cycle permission mode|permission mode/i.test(b.closest('[title]')?.getAttribute('title') || b.getAttribute('title') || '') || /^(NORMAL|ACCEPT CHANGES|PLAN MODE|AUTO MODE|BYPASS PERMISSIONS|ASK FIRST|AUTO EDIT|FULL AUTO)$/.test(b.innerText.trim())); if (!el) return null; const r = el.getBoundingClientRect(); return { text: el.innerText.trim(), x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (let i = 0; i < 6; i++) {
    const chip = await read();
    if (!chip) throw new Error('could not find the permission-mode chip on screen');
    if (wanted.test(chip.text)) return `mode is now ${chip.text}`;
    await mouseClick(tab, chip.x, chip.y);
    await sleep(400);
  }
  const last = await read();
  throw new Error(`the mode chip would not reach "${mode}" after 6 clicks (it reads "${last?.text}") — this profile may not offer it`);
}

/** New Claude Code chat in `folder`, then say yes to the trust-folder prompt if one appears. */
export async function newChat(tab, folder, { sleep = sleepReal, trustWaitMs = 30_000 } = {}) {
  const cwd = resolve(folder);
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error(`${cwd} is not a folder`);
  // Same call the app's own "new chat" makes (preload: session.create). skipPermissions:false so
  // the permission cards can show; claude = Claude Code, not the native runtime.
  const args = { name: `dev-chat ${cwd.split('/').pop()}`, cwd, skipPermissions: false, provider: 'claude' };
  const made = await tab.evaluate(`(async () => { try { const s = await window.claude.session.create(${JSON.stringify(args)}); return { id: s && s.id }; } catch (e) { return { error: String((e && e.message) || e) }; } })()`);
  if (made.error || !made.id) throw new Error(`session.create failed: ${made.error ?? 'no id returned'}`);
  const sid = JSON.stringify(made.id);
  let shown = false;
  for (let i = 0; i < 100 && !shown; i++) {
    shown = await tab.evaluate(`[...document.querySelectorAll('[data-chat-session-id]')].some((x) => x.dataset.chatSessionId === ${sid} && !x.closest('[aria-hidden="true"]'))`);
    if (!shown) await sleep(100);
  }
  // The trust prompt is a pair of buttons ("Yes, I trust this folder" / "No, exit"). Only a button
  // whose label says trust (and not "don't") is ever clicked here.
  let trusted = false;
  const t0 = Date.now();
  while (Date.now() - t0 < trustWaitMs) {
    const p = await tab.evaluate(`(() => { const vis = ${VISIBLE}; const b = [...document.querySelectorAll('button')].filter(vis).find((x) => /trust/i.test(x.innerText) && !/don.?t|no,/i.test(x.innerText)); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.innerText.trim() }; })()`);
    if (p) { await mouseClick(tab, p.x, p.y); trusted = true; await sleep(500); break; }
    // Once the message box exists with no prompt in sight, the folder was already trusted.
    if (await tab.evaluate(BOX)) break;
    await sleep(250);
  }
  return `session ${made.id}${shown ? '' : ' (not yet on screen)'}${trusted ? ', trusted the folder' : ''}`;
}

/** Type `text` into the message box with real input events and press a real Enter. Never retries. */
export async function say(tab, text, { sleep = sleepReal, waitMs = 5000 } = {}) {
  if (!text) throw new Error('nothing to say');
  const boxed = await tab.evaluate(`(() => { const t = ${BOX}; if (!t) return false; t.focus(); return document.activeElement === t; })()`);
  if (!boxed) throw new Error('no message box is on screen (is a chat open?)');
  await tab.send('Input.insertText', { text });
  const typed = await tab.evaluate(`(() => { const t = ${BOX}; return t ? t.value : null; })()`);
  if (typeof typed !== 'string' || typed.length < text.length) {
    throw new Error(`the box holds ${typed === null ? 'nothing' : typed.length + ' of ' + text.length + ' characters'} after typing — not sending`);
  }
  const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, text: '\r', unmodifiedText: '\r' });
  await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  // The box empties when the message goes. One Enter only: a second one is how a message got sent twice.
  for (let t0 = Date.now(); Date.now() - t0 < waitMs; await sleep(100)) {
    const left = await tab.evaluate(`(() => { const t = ${BOX}; return t ? t.value.length : 0; })()`);
    if (left === 0) return `sent (${text.length} characters)`;
  }
  throw new Error('Enter was pressed but the text is still in the box — it may be stuck; NOT pressed again (a repeat can send it twice)');
}

export async function shot(tab, outFile, { write }) {
  write(outFile, await tab.png());
  return outFile;
}
