import { ablate as profile } from './profiles.mjs';
import { gen, runCase, check, C } from './sim.mjs';
import { shrink } from './shrink.mjs';
const seed = Number(process.argv[2]); const prop = process.argv[3] || 'P7-id-vanished';
const rules = profile(process.argv); const { cfg, events } = gen(seed, { rules, wide: process.argv.includes('--wide') });
const min = shrink(cfg, events, prop); const { w } = runCase(cfg, min);
const f = check(w).filter((x) => x.prop === prop);
for (const x of f) { const id = [...w.seenVersionIds].find((i) => i.startsWith(x.detail)); console.log(x.detail, 'roots at show', JSON.stringify((w.seenRoots[id] || []).map((r) => r.slice(0, 6)))); }
for (const x of f) { const id = [...w.seenVersionIds].find((i) => i.startsWith(x.detail)); console.log('rel', w.seenRel && w.seenRel[id]); const p = w.devs.map((d) => [...d.pool.keys()].filter((k) => k.startsWith((w.seenRel||{})[id]?.slice(0,6)||'zzz')).length); console.log('pools having it', p); }
