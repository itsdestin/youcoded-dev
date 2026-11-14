// What the wide generator actually produced (events and device counts over the 200,000 seeds), plus the world-level coverage of 20,000 of them.
import { gen, runCase, view, C } from './sim.mjs';
import { FIXED } from './profiles.mjs';
const seeds0 = 1000000, N = 200000; const dev = {}, ev = {}; let lens = 0;
for (let s = seeds0; s < seeds0 + N; s++) { const { cfg, events } = gen(s, { rules: FIXED, wide: true }); dev[cfg.n] = (dev[cfg.n] || 0) + 1; lens += events.length; for (const e of events) ev[e.t + (e.t === 'takeover' ? ':' + e.why : '')] = (ev[e.t + (e.t === 'takeover' ? ':' + e.why : '')] || 0) + 1; }
console.log('devices per run (count of runs):', JSON.stringify(dev)); console.log('events generated over', N, 'runs (avg', (lens / N).toFixed(1), 'per run):', JSON.stringify(ev));
const cov = { runs: 0, removedDevice: 0, concurrentRemovalsBothStand: 0, delete: 0, deleteAndRestore: 0, tookOver: 0, twoPlusVersions: 0, tailVersion: 0, pendingMidRun: 0, parkedMidRun: 0, unknownDeviceAtEnd: 0, hadMutualRemoval: 0 };
for (let s = seeds0; s < seeds0 + 20000; s++) { const { cfg, events } = gen(s, { rules: FIXED, wide: true }); const { w } = runCase(cfg, events); const v = view(w, w.devs[0]); const V = v.chats[C]; cov.runs++;
  if (Object.values(v.members).includes('removed')) cov.removedDevice++; if (Object.values(v.members).includes('unknown')) cov.unknownDeviceAtEnd++; if (w.stat.concurrentRemovalsBothStand) cov.concurrentRemovalsBothStand++;
  if (events.some((e) => e.t === 'mutual')) cov.hadMutualRemoval++; if ([...w.devs[0].pool.values()].some((e) => e.kind === 'deleted')) cov.delete++; if (w.restores.length) cov.deleteAndRestore++;
  if ([...w.devs[0].pool.values()].some((e) => e.kind === 'takeover')) cov.tookOver++; if (V && Object.values(V.versions).filter((x) => !x.tail).length > 1) cov.twoPlusVersions++; if (V && Object.values(V.versions).some((x) => x.tail)) cov.tailVersion++;
  if (w.stat.pendingMoments) cov.pendingMidRun++; if (w.stat.parkedMoments) cov.parkedMidRun++; }
console.log('world coverage of the first 20,000:', JSON.stringify(cov));
