#!/usr/bin/env node
// Drives MANY session-pill drags in one workbench page, each one shaped like a hand rather
// than a script, and scores every release on five checks. drag-probe.mjs is the microscope
// (one drag, every frame printed); this is the sweep that says which drag to put under it.
//
// WHY (2026-09-03, R10): five rounds of "still janky on release" were each traced to a
// motion no probe had made — a grab off-centre, a hand that keeps moving after release, a
// cursor rocking at the swap point — on a screen no probe had used (Destin's: 1.5x scale,
// 180Hz, a touchpad and a touchscreen, no mouse). Every fix was real and every one left the
// next fault standing. This sweep randomises all of it at once, many drags in a row on one
// page the way a person uses it, and fails on the FIRST bad frame.
//
// Usage:
//   node scripts/ui-review/drag-fuzz.mjs <url> [count] [seed]
//   CDP_PORT=10330   throw-away Chrome's debug port (fresh per run)
//   OUT_DIR=.        drag-fuzz.json (every scenario's frames) + drag-fuzz.md (the table)
//   DPR=1.5          device scale factor (Destin's panel is 1.5)
//   UNLIMITED=1      lift Chrome's frame-rate cap (a 180Hz panel runs the rAF loop 3x
//                    faster than headless's 60; more frames per pointer event)
//   POINTER=mix      mouse | touch | mix
//
// The five checks, all on the frames from release to release + 700ms:
//   contact     px a visible dot overlaps the settling pill (twin, then the real pill)
//   continuity  largest one-frame change in a dot's visible size — its own image plus every
//               ghost of it — over the whole drag (a blink or a doubled dot is a jump here)
//   reversal    the settling pill's left changing direction by more than 1px
//   others      any other pill, or the bar, moving more than 1px after release (a dot the
//               pill was over at release is allowed to regrow in place — its LEFT still may
//               not move)
//   blink       a frame with neither the twin nor the visible real pill, or both at
//               different places
// Anything non-zero is a defect; the table names the scenario so drag-probe can replay it.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME_FLAGS, waitForCdp } from './cdp-helpers.mjs';

const [url, countArg, seedArg] = process.argv.slice(2);
if (!url) { console.error('usage: drag-fuzz.mjs <url> [count] [seed]'); process.exit(2); }
const COUNT = Number(countArg ?? 24);
let seed = Number(seedArg ?? 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);

const CDP_PORT = Number(process.env.CDP_PORT ?? 10330);
const DPR = Number(process.env.DPR ?? 1.5);
const W = 460, H = 600;
const profile = mkdtempSync(join(tmpdir(), 'drag-fuzz-'));
const flags = CHROME_FLAGS(W, H, CDP_PORT, profile).map((f) => f === '--force-device-scale-factor=1' ? `--force-device-scale-factor=${DPR}` : f);
if (process.env.UNLIMITED) flags.unshift('--disable-frame-rate-limit', '--disable-gpu-vsync');
const chrome = spawn('google-chrome-stable', flags, { stdio: 'ignore' });
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
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme','midnight')}catch{}` });
await send('Page.navigate', { url });
for (let i = 0; i < 80; i++) { if (await evaluate("document.querySelectorAll('[data-session-idx]').length > 3")) break; await sleep(250); }
await sleep(1500);

// The same per-frame sampler as drag-probe.mjs (kept in step by hand — see its comment on
// sampling after paint).
await evaluate(`(() => { window.__log = []; window.__marks = []; window.__cx = null; window.addEventListener('pointermove', (e) => { window.__cx = e.clientX; }, true);
  // Every pointer event that is not a move, with its target: a release handled twice (pill
  // AND bar), a cancel, or a lost capture shows here as a mark.
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture', 'gotpointercapture', 'mouseup', 'click']) window.addEventListener(type, (e) => { const el = e.target; const tag = el && el.tagName ? el.tagName.toLowerCase() + (el.dataset && el.dataset.sessionId ? '#' + el.dataset.sessionId : el.hasAttribute && el.hasAttribute('data-session-strip') ? '[strip]' : '') : String(el); window.__marks.push({ t: performance.now(), name: 'ev:' + type + ' ' + tag + ' ' + (e.pointerType || '') + ' x=' + Math.round(e.clientX || 0) }); }, true);
  const tick = () => { requestAnimationFrame(tick); setTimeout(sample, 0); }; const sample = () => { const t = performance.now(); const rows = [];
  for (const el of document.querySelectorAll('[data-session-strip] [data-session-id]')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); rows.push({ id: el.dataset.sessionId, l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: cs.visibility[0], o: Math.round(parseFloat(cs.opacity)*100)/100 }); }
  const bar = document.querySelector('[data-session-strip]'); if (bar) { const r = bar.getBoundingClientRect(); rows.push({ id: 'BAR', l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: 'v' }); }
  for (const ghost of document.querySelectorAll('[data-session-strip] > [data-ghost]')) { const r = ghost.getBoundingClientRect(); rows.push({ id: 'GHOST:' + ghost.dataset.ghost, l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: 'v', o: 1 }); }
  const twin = document.querySelector('[data-session-strip] > div[aria-hidden]:not([data-ghost])'); if (twin) { const r = twin.getBoundingClientRect(); rows.push({ id: 'TWIN', l: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, v: 'v' }); }
  window.__log.push({ t, rows, cx: window.__cx }); }; requestAnimationFrame(tick); })()`);
const mark = (name) => evaluate(`window.__marks.push({ t: performance.now(), name: ${JSON.stringify(name)} })`);
const resetLog = () => evaluate('window.__log = []; window.__marks = []; true');
// Strip pills only: the All Sessions menu's rows carry [data-session-idx] too, and a tap that
// lands on the menu button leaves the menu open for the next scenario. Escape closes it.
const pills = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(50);
  return evaluate(`Array.from(document.querySelectorAll('[data-session-strip] [data-session-idx]')).map(el => { const r = el.getBoundingClientRect(); return { id: el.dataset.sessionId, l: r.left, r: r.right, y: r.top + r.height / 2 }; })`);
};

// Input: one vocabulary for mouse and touch.
let touchDown = false;
const input = {
  async down(x, y, type) {
    if (type === 'touch') { touchDown = true; await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); }
    else await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  },
  async move(x, y, type, held) {
    if (type === 'touch') { if (touchDown) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }); }
    else await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: held ? 'left' : 'none', buttons: held ? 1 : 0 });
  },
  async up(x, y, type) {
    if (type === 'touch') { touchDown = false; await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  },
};

// ── the scenario ──
async function runScenario(n) {
  const row = await pills();
  if (row.length < 3) return null;
  const pointer = process.env.POINTER === 'mouse' ? 'mouse' : process.env.POINTER === 'touch' ? 'touch' : pick(['mouse', 'mouse', 'touch']);
  const pressFirst = rnd() < 0.5;
  const fromIdx = Math.floor(rnd() * row.length);
  const from = row[fromIdx];
  const y = from.y;
  if (pressFirst) {
    // Select it first, the way a person drags the session they are on.
    const px = from.l + (from.r - from.l) * 0.5;
    await input.move(px, y, pointer, false); await input.down(px, y, pointer); await sleep(50); await input.up(px, y, pointer);
    await input.move(px, y + 150, pointer, false); await sleep(700);
  }
  const row2 = await pills();
  const src = row2.find((p) => p.id === from.id) ?? row2[Math.min(fromIdx, row2.length - 1)];
  const grab = between(0.1, 0.9);
  const ax = src.l + (src.r - src.l) * grab;
  const toIdx = Math.floor(rnd() * row2.length);
  const dst = row2[toIdx];
  const overshoot = rnd() < 0.3 ? (toIdx === 0 ? -between(20, 160) : toIdx === row2.length - 1 ? between(20, 160) : between(-20, 20)) : 0;
  const bx = (dst.l + dst.r) / 2 + overshoot;
  const dragMs = between(120, 900);
  const wobble = rnd() < 0.5 ? between(2, 9) : 0;
  const release = pick(['pause', 'immediate', 'moving']);
  const after = pick(['still', 'hand', 'hand']);
  const delay = pressFirst ? between(0, 60) : between(0, 220);   // drag starting inside the press reflow
  await resetLog();
  await input.move(ax, y, pointer, false); await sleep(200);
  await mark('press');
  await input.down(ax, y, pointer);
  await sleep(delay);
  const steps = Math.max(6, Math.round(dragMs / 16));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = 1 - Math.pow(1 - k, 3);
    const jitter = (rnd() - 0.5) * 2;   // a hand is never a straight line
    await input.move(ax + (bx - ax) * e + jitter, y + (rnd() - 0.5) * 2, pointer, true); await sleep(16);
  }
  if (wobble) { for (let i = 0; i < 24; i++) { await input.move(bx + wobble * Math.sin(i / 2), y, pointer, true); await sleep(16); } }
  let rx = bx;
  if (release === 'pause') await sleep(120);
  else if (release === 'moving') { rx = bx + 6; await input.move(rx, y, pointer, true); }
  await mark('release');
  await input.up(rx, y, pointer);
  if (after === 'hand') {
    for (let i = 0; i < 9; i++) { await input.move(rx + (i % 2 ? 3 : -3), y + (i % 3 ? 1 : -1), pointer, false); await sleep(16); }
    for (let i = 1; i <= 8; i++) { await input.move(rx + 5 * i, y, pointer, false); await sleep(16); }
  }
  await sleep(700);
  const { log, marks } = JSON.parse(await evaluate('JSON.stringify({ log: window.__log, marks: window.__marks })'));
  const desc = { n, pointer, pressFirst, from: from.id, fromIdx, toIdx, grab: +grab.toFixed(2), overshoot: Math.round(overshoot), dragMs: Math.round(dragMs), wobble: +wobble.toFixed(1), release, after, delay: Math.round(delay) };
  return { desc, log, marks, ...score(log, marks, from.id) };
}

// ── the checks ──
function score(log, marks, heldId) {
  const rel = marks.find((m) => m.name === 'release')?.t ?? Infinity;
  const after = log.filter((f) => f.t >= rel && f.t <= rel + 700);
  const before = log.filter((f) => f.t < rel);
  const m = { contact: 0, continuity: 0, reversal: 0, others: 0, blink: 0, longFrame: 0 };
  const where = {};
  const dotIds = new Set();
  for (const f of log) for (const r of f.rows) if (/^[a-z]/.test(r.id) && !r.id.startsWith('GHOST') && r.id !== heldId && r.w <= 30) dotIds.add(r.id);
  // A dot that was ever wider than 30 is the old active pill collapsing — not a dot.
  for (const f of log) for (const r of f.rows) if (r.w > 30 && dotIds.has(r.id)) dotIds.delete(r.id);
  // continuity over the WHOLE drag
  let prev = null;
  for (const f of log) {
    const vis = {};
    for (const r of f.rows) {
      if (r.id.startsWith('GHOST:')) { const d = r.id.slice(6); vis[d] = (vis[d] || 0) + r.w; continue; }
      if (!dotIds.has(r.id) || r.v === 'h' || (r.o !== undefined && r.o < 0.5)) continue;
      vis[r.id] = (vis[r.id] || 0) + r.w;
    }
    if (prev) for (const d of new Set([...Object.keys(vis), ...Object.keys(prev)])) {
      const dlt = Math.abs((vis[d] || 0) - (prev[d] || 0));
      if (dlt > m.continuity) { m.continuity = dlt; where.continuity = { id: d, t: Math.round(f.t - rel) }; }
    }
    prev = vis;
  }
  // long frames (context, not a defect of the strip)
  for (let i = 1; i < log.length; i++) m.longFrame = Math.max(m.longFrame, log[i].t - log[i - 1].t);
  // the settling pill's path, contact, blink, others
  const settleLeft = (f) => {
    const twin = f.rows.find((r) => r.id === 'TWIN');
    const real = f.rows.find((r) => r.id === heldId && r.v !== 'h');
    if (twin && real && Math.abs(twin.l - real.l) > 1) return { l: twin.l, w: twin.w, blink: 'both' };
    if (twin) return { l: twin.l, w: twin.w };
    if (real) return { l: real.l, w: real.w };
    return null;
  };
  const first = after[0];
  const startLefts = new Map();
  const flowedAtRelease = new Set();
  if (first) for (const r of first.rows) {
    if (r.id === 'TWIN' || r.id.startsWith('GHOST:') || r.id === heldId) continue;
    startLefts.set(r.id, r.l);
    if (dotIds.has(r.id) && r.w < 27.5) flowedAtRelease.add(r.id);
  }
  let lastL = null, dir = 0;
  for (const f of after) {
    const p = settleLeft(f);
    const t = Math.round(f.t - rel);
    if (!p) { m.blink++; where.blink ??= { t }; continue; }
    if (p.blink) { m.blink++; where.blink ??= { t, both: true }; }
    if (lastL !== null) {
      const d = p.l - lastL;
      if (Math.abs(d) > 1) { const s = Math.sign(d); if (dir !== 0 && s !== dir) { m.reversal = Math.max(m.reversal, Math.abs(d)); where.reversal ??= { t }; } dir = s; }
    }
    lastL = p.l;
    for (const r of f.rows) {
      if (r.id === 'TWIN' || r.id === heldId) continue;
      if (r.id.startsWith('GHOST:')) continue;
      if (r.id === 'BAR') { const d = Math.abs(r.l - startLefts.get('BAR')); if (d > 1 && d > m.others) { m.others = d; where.others = { id: 'BAR', t }; } continue; }
      if (r.v === 'h' || (r.o !== undefined && r.o < 0.5) || r.w < 1) continue;
      const overlap = Math.min(p.l + p.w, r.l + r.w) - Math.max(p.l, r.l);
      if (overlap > m.contact) { m.contact = overlap; where.contact = { id: r.id, t }; }
      const s = startLefts.get(r.id);
      if (s !== undefined) {
        // A flowed dot regrows in place: its rect's left moves as it un-scales towards its
        // origin, so judge it by the edge that is its origin (left or right), i.e. allow it.
        if (flowedAtRelease.has(r.id)) continue;
        const d = Math.abs(r.l - s);
        if (d > 1 && d > m.others) { m.others = d; where.others = { id: r.id, t }; }
      }
    }
  }
  return { m, where, nAfter: after.length, nBefore: before.length };
}

const results = [];
for (let n = 1; n <= COUNT; n++) {
  const r = await runScenario(n);
  if (!r) break;
  results.push(r);
  const { m, desc } = r;
  process.stdout.write(`#${String(n).padStart(2)} ${desc.pointer.padEnd(5)} ${desc.pressFirst ? 'press+' : 'cold  '} ${desc.fromIdx}→${desc.toIdx}${desc.overshoot ? (desc.overshoot > 0 ? '+' : '') + desc.overshoot : ''} grab ${desc.grab} ${String(desc.dragMs).padStart(3)}ms wob ${desc.wobble} ${desc.release.padEnd(9)} ${desc.after.padEnd(5)} delay ${desc.delay}  | contact ${m.contact.toFixed(1)} cont ${m.continuity.toFixed(1)} rev ${m.reversal.toFixed(1)} others ${m.others.toFixed(1)} blink ${m.blink} frame ${m.longFrame.toFixed(0)}ms\n`);
}
const worst = {};
for (const k of ['contact', 'continuity', 'reversal', 'others', 'blink']) {
  let best = null;
  for (const r of results) if (!best || r.m[k] > best.m[k]) best = r;
  worst[k] = best ? { value: best.m[k], n: best.desc.n, where: best.where[k] } : null;
}
console.log('\nworst: ' + Object.entries(worst).map(([k, v]) => `${k} ${v ? v.value.toFixed(1) + ' (#' + v.n + (v.where ? ' ' + JSON.stringify(v.where) : '') + ')' : '-'}`).join(' · '));
const out = process.env.OUT_DIR ?? '.';
writeFileSync(join(out, 'drag-fuzz.json'), JSON.stringify({ url, DPR, unlimited: !!process.env.UNLIMITED, results }));
writeFileSync(join(out, 'drag-fuzz.md'), results.map((r) => `#${r.desc.n} ${JSON.stringify(r.desc)} → ${JSON.stringify(r.m)} ${JSON.stringify(r.where)}`).join('\n') + '\n');
process.exit(0);
