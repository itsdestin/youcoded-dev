// One trial: start app + runtime, SIGSTOP both for a random gap (order of stop and of continue
// random), SIGCONT, observe, score. Prints one JSON line.
// argv: mode seed signalLossProb
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
const [mode, , lossP = '0'] = process.argv.slice(2);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't19-'));
const sock = path.join(dir, 'h.sock'), alog = path.join(dir, 'app.log');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const app = spawn('node', [new URL('./app.mjs', import.meta.url).pathname, sock, alog, mode], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => app.stdout.once('data', r));
const rt = spawn('node', [new URL('./runtime.mjs', import.meta.url).pathname, sock, dir], { stdio: 'ignore' });
const ctl = (c) => new Promise((r) => { const s = net.createConnection(sock, () => s.end(JSON.stringify({ ctl: c }) + '\n')); s.on('close', r); s.on('error', r); });

await sleep(rnd(150, 450));                       // runtime busy writing
const signalLost = Math.random() < Number(lossP);
const gap = rnd(500, 1200);                       // the simulated sleep
if (!signalLost && (mode === 'signal' || mode === 'both')) await ctl('SUSPEND');
const first = Math.random() < 0.5 ? [app, rt] : [rt, app];
for (const p of first) process.kill(p.pid, 'SIGSTOP');
const tStop = Date.now();
await sleep(gap);
const second = Math.random() < 0.5 ? [app, rt] : [rt, app];   // either side may wake first
for (const p of second) process.kill(p.pid, 'SIGCONT');
const tCont = Date.now();
// the resume signal arrives late, 0-300 ms after the process runs again (if not lost)
if (!signalLost && (mode === 'signal' || mode === 'both')) { await sleep(rnd(0, 300)); await ctl('RESUME'); }
await sleep(2200);                                // enough for the 1.5 s cap
process.kill(rt.pid, 'SIGKILL'); process.kill(app.pid, 'SIGKILL');

const rd = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const A = rd(alog), W = rd(path.join(dir, 'writes.log'));
const grants = new Map(A.filter((e) => e.k === 'grant').map((e) => [e.id, e.t]));
const rel = A.filter((e) => e.k === 'release' && e.t > tCont).map((e) => e.t)[0];
// End of the forbidden window: the moment the hold released (after the wake check or the cap).
// With no hold at all (baseline) there is no check; use the shortest possible check, 100 ms.
const tEnd = mode === 'baseline' ? tCont + 100 : (rel ?? Infinity);
let slips = 0, straddle = 0, inWindow = 0;
for (const w of W) {
  if (w.t >= tCont && w.t < tEnd) {
    const g = grants.get(w.id);
    if (g !== undefined && g <= tStop) straddle++;      // approved before the sleep, executed after: a command already in flight
    else { slips++; (globalThis.sd ??= []).push({ id: w.id, w: w.t - tCont, g: g === undefined ? null : g - tCont, end: tEnd - tCont, stopToCont: tCont - tStop, first: first[0] === app ? 'app' : 'rt', second: second[0] === app ? 'app' : 'rt', events: A.filter((e) => e.t > tStop - 5 && e.t < tCont + 700).map((e) => [e.k, e.t - tCont, e.why ?? e.id ?? '']).slice(0, 12) }); }
    inWindow++;
  }
}
const out = { slipDetail: globalThis.sd ?? undefined, mode, gapMs: Math.round(gap), signalLost, writes: W.length, afterWake: W.filter((w) => w.t >= tCont).length, slips, straddle, held: A.filter((e) => e.k === 'held').length, released: rel !== undefined, holdWhy: A.find((e) => e.k === 'hold-enter')?.why ?? null, reachable: A.find((e) => e.k === 'check-start')?.reachable ?? null, releaseDelayMs: rel ? rel - tCont : null };
fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify(out));
