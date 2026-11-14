// usage: node shrink.mjs <seed> <property> [--fixed] [--noRemove]   -> minimal event list that still fails <property>
import { ablate as profile } from './profiles.mjs';
import { gen, runCase, check, fmtEvent, view, C } from './sim.mjs';
export function fails(cfg, events, prop) { try { const { w } = runCase(cfg, events); return check(w).filter((f) => f.prop === prop); } catch (e) { return []; } }
export function shrink(cfg, events, prop) {
  let cur = events.slice(); let ch = true;
  while (ch) {
    ch = false;
    for (let size = Math.ceil(cur.length / 2); size >= 1; size = Math.floor(size / 2)) {
      for (let i = 0; i + size <= cur.length; ) {
        const t = cur.slice(0, i).concat(cur.slice(i + size));
        if (fails(cfg, t, prop).length) { cur = t; ch = true; } else i += size;
      }
      if (size === 1) break;
    }
  }
  return cur;
}
if (process.argv[1].endsWith('shrink.mjs')) {
  const seed = Number(process.argv[2]), prop = process.argv[3];
  const rules = profile(process.argv);
  const { cfg, events } = gen(seed, { rules, noRemove: process.argv.includes('--noRemove'), len: process.argv.includes('--len') ? Number(process.argv[process.argv.indexOf('--len') + 1]) : undefined });
  const min = shrink(cfg, events, prop);
  console.log('cfg', JSON.stringify({ n: cfg.n, copies: cfg.copies.slice(1, Math.min(3, cfg.n)), ranHere: cfg.ranHere, rules }));
  console.log('events', events.length, '->', min.length);
  min.forEach((e, i) => console.log(i, fmtEvent(e)));
  const { w } = runCase(cfg, min);
  for (const f of check(w).filter((f) => f.prop === prop)) console.log('FAIL', f.prop, f.detail);
}
