// Orchestrator: node run-trials.mjs <mode> <count> [signalLossProb]  (max 4 trials at once)
import { spawn } from 'node:child_process';
const [mode, count, loss = '0'] = process.argv.slice(2);
const N = Number(count), PAR = 4;
const results = []; let started = 0, running = 0;
await new Promise((done) => {
  const next = () => {
    while (running < PAR && started < N) {
      started++; running++;
      const p = spawn('node', [new URL('./trial.mjs', import.meta.url).pathname, mode, String(started), loss]);
      let o = ''; p.stdout.on('data', (d) => (o += d));
      p.on('close', () => { try { results.push(JSON.parse(o.trim().split('\n').pop())); } catch { results.push({ error: o }); } running--; if (results.length === N) done(); else next(); });
    }
  };
  next();
});
const ok = results.filter((r) => !r.error);
const sum = (k) => ok.reduce((a, r) => a + r[k], 0);
const lost = ok.filter((r) => r.signalLost);
console.log(JSON.stringify({
  mode, loss: Number(loss), trials: N, errors: results.length - ok.length,
  trialsWithSlip: ok.filter((r) => r.slips > 0).length, totalSlips: sum('slips'),
  trialsWithStraddle: ok.filter((r) => r.straddle > 0).length, totalStraddle: sum('straddle'),
  totalWrites: sum('writes'), writesAfterWake: sum('afterWake'), heldRequests: sum('held'),
  neverReleased: ok.filter((r) => !r.released && mode !== 'baseline').length,
  signalLostTrials: lost.length, slipsInSignalLostTrials: lost.reduce((a, r) => a + r.slips, 0),
  releaseDelayMs: { min: Math.min(...ok.filter((r) => r.releaseDelayMs).map((r) => r.releaseDelayMs)), max: Math.max(...ok.map((r) => r.releaseDelayMs ?? 0)) },
  holdWhy: Object.fromEntries([...new Set(ok.map((r) => r.holdWhy))].map((w) => [w, ok.filter((r) => r.holdWhy === w).length])),
}));
