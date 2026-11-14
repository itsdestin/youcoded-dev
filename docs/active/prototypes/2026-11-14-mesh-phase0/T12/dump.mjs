// usage: node dump.mjs <seed> <prop> [--fixed] [--noRemove]  -> shrink, then print every control entry and the final decision
import { ablate as profile } from './profiles.mjs';
import { gen, runCase, check, view, C, fmtEvent } from './sim.mjs';
import { shrink } from './shrink.mjs';
const seed = Number(process.argv[2]), prop = process.argv[3];
const rules = profile(process.argv);
const { cfg, events } = gen(seed, { rules, noRemove: process.argv.includes('--noRemove'), len: process.argv.includes('--len') ? Number(process.argv[process.argv.indexOf('--len') + 1]) : undefined });
const min = shrink(cfg, events, prop);
min.forEach((e, i) => console.log(i, fmtEvent(e)));
const { w, rounds } = runCase(cfg, min); console.log('settle rounds', rounds);
const s6 = (x) => x.slice(0, 6); const sh = (j) => j.replace(/"([0-9a-f]{64})"/g, (m, h) => '"' + s6(h) + '"');
const d = w.devs[0]; const v = view(w, d);
const t0 = [...d.pool.values()].filter((e) => e.kind !== 'witness').sort((a, b) => a.at - b.at);
for (const e of t0) console.log(s6(e.id), e.kind.padEnd(9), (e.by ? e.by + '>' : '') + e.device, 'seen=' + e.seen.map(s6).join(','), sh(JSON.stringify(e.body || e.cutoff || {})));
console.log('VERSIONS', sh(JSON.stringify(v.chats[C] && v.chats[C].versions)));
console.log('TAILS', sh(JSON.stringify(v.chats[C] && v.chats[C].tails)));
console.log('void', v.void.map(s6), 'members', JSON.stringify(v.members));
for (const x of w.devs) console.log(x.id, 'chain', x.chain.map((l) => l.id + (l.end ? '$' : '')).join(' '), 'tails', Object.entries(x.tails).map(([k, t]) => s6(k) + ':' + t.map((l) => l.id).join('/')).join(' '));
for (const f of check(w).filter((f) => f.prop === prop)) console.log('FAIL', f.prop, f.detail);
if (prop === 'P2-agree') {
  const { canon } = await import('./decide.mjs');
  const act = w.devs.filter((d) => d.active); const base = JSON.parse(canon(view(w, act[0])));
  for (const d of act.slice(1)) { const o = JSON.parse(canon(view(w, d)));
    const walk = (x, y, p) => { if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '.' + k); } else console.log(d.id, p.slice(0, 90), JSON.stringify(x)?.slice(0, 70), 'vs', JSON.stringify(y)?.slice(0, 70)); };
    walk(base, o, ''); console.log(d.id, 'pool', d.pool.size, 'vs', act[0].pool.size); }
}
