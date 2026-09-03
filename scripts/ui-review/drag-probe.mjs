#!/usr/bin/env node
// Drives ONE session-pill drag in the workbench over raw CDP and logs every
// pill's left edge on every animation frame, then prints the frames around the
// drop. This is how "slight jank on release" (Destin, 2026-09-01) became two
// numbers: the strip re-centring under the held pill (11px), and the dots
// stepping aside by a computed width 3.4px off the real one. A recording shows
// neither; a table of left edges shows both in one glance.
//
// Usage:
//   node scripts/ui-review/drag-probe.mjs <url> <fromIdx> <toIdx> [dragMs] [holdAfterMs]
//   CDP_PORT=10330  throw-away Chrome's debug port (use a fresh one per run)
//   OUT_DIR=.       where drag-probe.json (the full per-frame log) is written
//
// <url> is a workbench CHILD page, e.g.
//   'http://127.0.0.1:5513/?mode=workbench&child=1&scenario=stress&latency=0&select=press'
// <fromIdx>/<toIdx> index [data-session-idx] pills, measured BEFORE the press.
// Reads: id:left, an `h` suffix = visibility hidden (the in-flow box of the
// pill in hand), TWIN:left(width) = the floating pill. A jump between two
// consecutive rows for any id is the jank; a glide is a run of small steps.
//
// The summary line is the worst STICK-OUT ahead of the pill's leading edge that lasts 4
// consecutive frames (~65ms): how far a neighbour the pill is already over still extends past
// the pill's leading edge. A dot passing under the edge as it steps aside is the step-aside
// itself (with a DOT in hand the yielded neighbour sits under the pill until it is passed —
// Chrome's swap); a dot still sticking out ahead after 65ms has not yielded in time. (Until
// 2026-09-02 this measured the OVERLAP width instead, which scored that swap as 22px of jank.)
// A dot that has faded below half opacity does not count (2026-09-02: dots HOP aside — they
// blink out, jump while invisible, blink in — so geometry the eye cannot see is not a peek).
// Such a frame prints the pill with a `~` suffix.
//
// zsh note: pass the three numbers as separate words — `${=args}` if they come
// from a variable, or zsh hands the script "6 1 700" as ONE argument.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME_FLAGS, waitForCdp } from './cdp-helpers.mjs';

const [url, fromIdx, toIdx, msArg, holdArg] = process.argv.slice(2);
const CDP_PORT = Number(process.env.CDP_PORT ?? 10330);
// PROBE_W: the viewport width — the review deck shows the strip in a 460px pane, and a drag that
// works at 1440 can fail there (fewer pills fit, the held name is capped at the budget).
const W = Number(process.env.PROBE_W ?? 1440), H = 600;
const profile = mkdtempSync(join(tmpdir(), 'drag-probe-'));
const chrome = spawn('google-chrome-stable', CHROME_FLAGS(W, H, CDP_PORT, profile), { stdio: 'ignore' });
process.on('exit', () => { chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch {} });
await waitForCdp(CDP_PORT);
const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
const target = targets.find((t) => t.type === 'page') ?? targets[0];
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme','midnight')}catch{}` });
await send('Page.navigate', { url });
for (let i = 0; i < 80; i++) { if (await evaluate("document.querySelectorAll('[data-session-idx]').length > 3")) break; await sleep(250); }
await sleep(1500);

const rectOf = async (idx) => evaluate(`(() => { const el = document.querySelectorAll('[data-session-idx]')[${idx}]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const a = await rectOf(Number(fromIdx)); const b = await rectOf(Number(toIdx));
// OVERSHOOT_PX: carry the cursor this much past the target pill's centre — how a person
// drags to the END of the row (the pill is clamped there; the cursor is not).
if (b && process.env.OVERSHOOT_PX) b.x += Number(process.env.OVERSHOOT_PX);
if (!a || !b) { console.error('MISSING pill', JSON.stringify({ a, b, count: await evaluate("document.querySelectorAll('[data-session-idx]').length"), url: await evaluate('location.href') })); process.exit(1); }

// Per-frame logger.
await evaluate(`(() => { window.__log = []; window.__marks = []; window.__cx = null; window.addEventListener('pointermove', (e) => { window.__cx = e.clientX; }, true);
  // Sample AFTER the frame has painted (a 0ms timeout queued from rAF), not inside rAF: the
  // strip's own rAF loop runs after this one and writes the twin's position and the veil, so an
  // in-rAF read saw the pre-write state and reported one-frame contacts that were never painted.
  const tick = () => { requestAnimationFrame(tick); setTimeout(sample, 0); }; const sample = () => { const t = performance.now(); const rows = [];
  for (const el of document.querySelectorAll('[data-session-strip] [data-session-id]')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); rows.push({ id: el.dataset.sessionId, l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: cs.visibility[0], o: Math.round(parseFloat(cs.opacity)*100)/100 }); }
  const bar = document.querySelector('[data-session-strip]'); if (bar) { const r = bar.getBoundingClientRect(); rows.push({ id: 'BAR', l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: 'v' }); }
  const ghost = document.querySelector('[data-session-strip] > [data-ghost]'); if (ghost) { const r = ghost.getBoundingClientRect(); rows.push({ id: 'GHOST', l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: 'v', o: 1 }); }
  const twin = document.querySelector('[data-session-strip] > div[aria-hidden]:not([data-ghost])'); if (twin) { const r = twin.getBoundingClientRect(); rows.push({ id: 'TWIN', l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: 'v', sl: twin.style.left }); }
  window.__log.push({ t, rows, cx: window.__cx }); }; requestAnimationFrame(tick); })()`);
const mark = (name) => evaluate(`window.__marks.push({ t: performance.now(), name: ${JSON.stringify(name)} })`);

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
await sleep(300);
await mark('press');
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
await sleep(80);
const ms = Number(msArg ?? 700); const steps = Math.max(8, Math.round(ms / 16));
for (let i = 1; i <= steps; i++) { const k = i / steps, e = 1 - Math.pow(1 - k, 3); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, button: 'left', buttons: 1 }); await sleep(16); }
await sleep(120);
await mark('release');
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
await sleep(Number(holdArg ?? 700));
const log = await evaluate('JSON.stringify({ log: window.__log, marks: window.__marks })');
writeFileSync(join(process.env.OUT_DIR ?? '.', 'drag-probe.json'), log);
const { log: frames, marks } = JSON.parse(log);
const rel = marks.find((m) => m.name === 'release').t;
// Worst "peek" over the whole drag: the twin's leading edge over a pill that still sticks out
// beyond it (it has not yielded yet). Right-going peek = twin.right - pill.left for pills whose
// right edge is past the twin's right; left-going the mirror.
// A neighbour sliding under the pill is expected and brief (one 150ms step-aside); a
// neighbour still sticking out ahead of the pill's leading edge for longer than that is the
// defect. So: the worst peek SUSTAINED over 4 consecutive frames (~65ms), per neighbour.
// Only AHEAD of the pill counts: a dot tucked under the pill's trailing side is hidden by it
// and is where a yielded dot is supposed to be. Direction = where the twin has moved over the
// last few frames.
let worst = 0, worstAt = null, instant = 0;
const recent = new Map(); const twinLefts = [];
for (const f of frames) {
  const twin = f.rows.find((r) => r.id === 'TWIN'); if (!twin) continue;
  twinLefts.push(twin.l); if (twinLefts.length > 4) twinLefts.shift();
  const dir = Math.sign(twin.l - twinLefts[0]);
  for (const r of f.rows) {
    if (r.id === 'TWIN' || r.id === 'BAR' || r.v === 'h' || (r.o !== undefined && r.o < 0.5)) continue;
    if (r.w < 1) continue;   // a dot scaled away to nothing (the flow) has no edge to stick out
    const tr = twin.l + twin.w, rr = r.l + r.w;
    const peek = dir > 0 ? (rr > tr && r.l < tr ? rr - tr : 0)
               : dir < 0 ? (r.l < twin.l && rr > twin.l ? twin.l - r.l : 0) : 0;
    instant = Math.max(instant, peek);
    const hist = recent.get(r.id) ?? []; hist.push(peek); if (hist.length > 4) hist.shift(); recent.set(r.id, hist);
    const sustained = hist.length === 4 ? Math.min(...hist) : 0;
    if (sustained > worst) { worst = sustained; worstAt = { t: (f.t - rel).toFixed(0), id: r.id }; }
  }
}
console.log(`worst SUSTAINED stick-out ahead (4 frames): ${worst.toFixed(1)}px` + (worstAt ? ` (${worstAt.id} at ${worstAt.t}ms)` : '') + `; worst single-frame stick-out ${instant.toFixed(1)}px`);
// Print the frames from 120ms before release to 400ms after, one row per frame: id:left(width).
for (const f of frames) {
  if (f.t < rel - 120 || f.t > rel + 400) continue;
  const dt = (f.t - rel).toFixed(0).padStart(5);
  console.log(`${dt}ms  ` + f.rows.map((r) => `${r.id.replace('wb-', '')}:${r.l}${r.v === 'h' ? 'h' : ''}${r.o !== undefined && r.o < 0.5 ? '~' : ''}${r.id === 'TWIN' ? '(' + r.w + ')' : ''}`).join('  '));
}
process.exit(0);
