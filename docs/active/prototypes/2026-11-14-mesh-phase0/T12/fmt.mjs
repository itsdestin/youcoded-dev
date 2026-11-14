// S11 variant: does the concurrent-`format` tie-break pick the LOWER minimum app version? depends only on entry ids, so vary the clock skew.
import { FIXED } from './profiles.mjs';
import { makeWorld, applyEvent, settle, view, C } from './sim.mjs';
const res = { 1: 0, 3: 0 };
for (let k = 0; k < 40; k++) {
  const cfg = { n: 3, skews: [k * 1000, 0, 0], copies: [null, 'none', 'none'], ranHere: [true, false, false], rules: FIXED };
  const w = makeWorld(cfg);
  for (const e of [{ t: 'sync', a: 0, b: 1, frac: 1, lines: false, seed: 1 }, { t: 'format', d: 0, v: 3 }, { t: 'format', d: 1, v: 1 }]) applyEvent(w, e);
  settle(w); res[view(w, w.devs[0]).chats[C].versions[C].minVersion]++;
}
console.log('concurrent format 3 vs 1, 40 clock offsets -> winner minAppVersion counts', JSON.stringify(res));
