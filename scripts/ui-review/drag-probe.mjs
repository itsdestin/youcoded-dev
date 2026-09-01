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
// zsh note: pass the three numbers as separate words — `${=args}` if they come
// from a variable, or zsh hands the script "6 1 700" as ONE argument.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME_FLAGS, waitForCdp } from './cdp-helpers.mjs';

const [url, fromIdx, toIdx, msArg, holdArg] = process.argv.slice(2);
const CDP_PORT = Number(process.env.CDP_PORT ?? 10330);
const W = 1440, H = 600;
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
if (!a || !b) { console.error('MISSING pill', JSON.stringify({ a, b, count: await evaluate("document.querySelectorAll('[data-session-idx]').length"), url: await evaluate('location.href') })); process.exit(1); }

// Per-frame logger.
await evaluate(`(() => { window.__log = []; window.__marks = []; const tick = () => { const t = performance.now(); const rows = [];
  for (const el of document.querySelectorAll('[data-session-strip] [data-session-id]')) { const r = el.getBoundingClientRect(); rows.push({ id: el.dataset.sessionId, l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: getComputedStyle(el).visibility[0] }); }
  const twin = document.querySelector('[data-session-strip] > div[aria-hidden]'); if (twin) { const r = twin.getBoundingClientRect(); rows.push({ id: 'TWIN', l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: 'v' }); }
  window.__log.push({ t, rows }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`);
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
// Print the frames from 120ms before release to 400ms after, one row per frame: id:left(width).
for (const f of frames) {
  if (f.t < rel - 120 || f.t > rel + 400) continue;
  const dt = (f.t - rel).toFixed(0).padStart(5);
  console.log(`${dt}ms  ` + f.rows.map((r) => `${r.id.replace('wb-', '')}:${r.l}${r.v === 'h' ? 'h' : ''}${r.id === 'TWIN' ? '(' + r.w + ')' : ''}`).join('  '));
}
process.exit(0);
