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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

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
/**
 * True only when the process's command line IS run-dev.sh being run: argv[0] is run-dev.sh itself
 * (executed directly) or a shell whose first non-flag argument is run-dev.sh.
 * WHY not "the text appears anywhere": `vim scripts/run-dev.sh`, or a pid reused by something that
 * merely mentions the file, passed the old substring check. (Second review, 2026-11-10.)
 */
export function isRunDevCmdline(cmd) {
  const argv = String(cmd).split('\0').filter((a) => a !== '');
  if (argv.length === 0) return false;
  if (basename(argv[0]) === 'run-dev.sh') return true;
  if (!['bash', 'sh', 'dash', 'zsh', 'env'].includes(basename(argv[0]))) return false;
  const script = argv.slice(1).find((a) => !a.startsWith('-'));
  return script !== undefined && basename(script) === 'run-dev.sh';
}

export function assertDevMarker(marker, readCmd = (pid) => readFileSync(`/proc/${pid}/cmdline`, 'utf8')) {
  if (!marker || !Number.isInteger(marker.devtoolsPort) || !Number.isInteger(marker.vitePort) || !marker.pid) {
    throw new Error('dev-chat: refusing to attach — no valid dev-window marker (run-dev.sh writes one)');
  }
  // Asserted again here (findDevWindow checks it too) because this is the rule that keeps the
  // installed app out: only run-dev.sh writes a marker, and the installed app is never run-dev.sh.
  let cmd = null; try { cmd = readCmd(marker.pid); } catch { /* no /proc */ }
  if (cmd !== null && !isRunDevCmdline(cmd)) throw new Error('dev-chat: refusing to attach — the marker\'s process is not run-dev.sh');
  return marker;
}

const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readMarkers = (checkout) => {
  const dir = join(checkout, 'desktop', '.dev-instances');
  const out = [];
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.json')) : []) {
    try { out.push(JSON.parse(readFileSync(join(dir, f), 'utf8'))); } catch { /* unreadable marker: skip */ }
  }
  return out;
};

/**
 * The marker to drive. WHY counted here: engine.mjs findDevWindow returns the FIRST live marker in
 * directory order, so with two dev instances from one checkout a command could land in whichever
 * window sorted first — a chat message sent to the wrong app. Here more than one live instance is
 * refused unless the caller names one by --offset (the number run-dev.sh recorded in the marker).
 */
export function pickMarker(checkout, offset, { listMarkers = readMarkers, isAlive = pidAlive, readCmd = (pid) => readFileSync(`/proc/${pid}/cmdline`, 'utf8') } = {}) {
  const live = listMarkers(checkout).filter((m) => {
    if (!m || !m.pid || !isAlive(m.pid)) return false;
    let cmd = null; try { cmd = readCmd(m.pid); } catch { /* no /proc */ }
    return cmd === null || isRunDevCmdline(cmd);
  });
  const describe = (m) => `offset ${m.offset} (profile ${m.profile ?? '?'}, port ${m.vitePort})`;
  if (offset !== undefined) {
    const hit = live.filter((m) => String(m.offset) === String(offset));
    if (hit.length === 0) throw new Error(`dev-chat: no live dev window has offset ${offset}. Live: ${live.map(describe).join('; ') || '(none)'}`);
    return hit[0];
  }
  if (live.length > 1) throw new Error(`dev-chat: ${live.length} dev windows are running from this checkout — name one with --offset <n>: ${live.map(describe).join('; ')}`);
  return live[0] ?? null;
}

export async function attachDev(checkout, { findDevWindow, attachPage, readCmd, offset, listMarkers, isAlive }) {
  // Zero live markers: fall through to the engine, whose error says how to start a dev window.
  const picked = pickMarker(checkout, offset, { listMarkers, isAlive, readCmd });
  const marker = assertDevMarker(picked ?? findDevWindow(checkout), readCmd);
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
const VISIBLE = `(el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.disabled && !el.closest('[aria-hidden="true"]'); }`;
// WHY the aria-hidden exclusion lives here: a background chat pane is kept mounted but hidden
// (aria-hidden), and its textarea/buttons have real size, so without it a message could be typed
// into, or a click land on, a chat that is not the one on screen. newChat already excluded them.

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
  // The trust prompt is the app's TrustGate overlay (renderer/components/TrustGate.tsx): a title
  // <p> reading exactly TRUST_PROMPT_TITLE ('Trust This Folder?', shared/ink-select-parser.ts) with
  // its buttons ("Yes, I trust this folder" / "No, exit") in the same container. WHY this narrow:
  // the old "any visible button saying trust" could have clicked a button elsewhere in the app. Now
  // only a "Yes … trust" button inside the container of the one visible title is ever clicked, and
  // more than one candidate is refused.
  let trusted = false;
  const t0 = Date.now();
  while (Date.now() - t0 < trustWaitMs) {
    const p = await tab.evaluate(`(() => { const vis = ${VISIBLE};
      const titles = [...document.querySelectorAll('p')].filter(vis).filter((x) => x.innerText.trim() === 'Trust This Folder?');
      if (titles.length === 0) return null;
      if (titles.length > 1) return { ambiguous: titles.length + ' trust prompts' };
      const all = [...titles[0].parentElement.querySelectorAll('button')].filter(vis);
      const yes = all.filter((x) => /^yes\\b.*\\btrust\\b/i.test(x.innerText.trim()));
      if (yes.length > 1) return { ambiguous: yes.length + ' trust buttons' };
      if (yes.length === 0) return { none: all.map((x) => x.innerText.trim()) };
      const r = yes[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: yes[0].innerText.trim() }; })()`);
    if (p?.ambiguous) throw new Error(`new: not clicking — ${p.ambiguous} on screen`);
    if (p?.none) throw new Error(`new: the trust prompt is up but has no "Yes, I trust…" button (buttons: ${p.none.join(' | ') || 'none'}) — not clicking`);
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
  const readBox = () => tab.evaluate(`(() => { const t = ${BOX}; return t ? t.value : null; })()`);
  // WHY refuse a non-empty box: typing appends, so a half-typed draft ("hello") plus `say "run
  // tests"` would send "hellorun tests". Someone's draft is never cleared for them.
  const before = await readBox();
  if (typeof before === 'string' && before.length > 0) {
    throw new Error(`the message box already holds ${before.length} characters of someone's draft — not typing over it. Send or clear it first.`);
  }
  await tab.send('Input.insertText', { text });
  const typed = await readBox();
  // WHY exact equality (not "at least as long"): anything else in the box goes out with the message.
  if (typed !== text) {
    throw new Error(`the box holds ${typed === null ? 'nothing' : typed.length + ' characters'} after typing, not exactly the ${text.length} typed — not sending`);
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
