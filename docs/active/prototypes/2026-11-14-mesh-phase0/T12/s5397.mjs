// The two-answer removal case seen as seed 5397: d1 adds d3; d3 removes d0; d2 removes d1 (concurrent). Two stable answers exist:
// (A) d3 stays a member -> d3's removal of d0 stands -> d0's add of d2 is void -> d2's removal of d1 is not a member's -> d1 stays -> d3 stays.
// (B) d1 is removed -> d1's add of d3 is void -> d3's removal of d0 is not a member's -> d0 stays -> d2 stays -> d1 is removed.
import { FIXED } from './profiles.mjs';
import { gen, makeWorld, applyEvent, settle, view } from './sim.mjs';
const cfg = gen(5397, { rules: FIXED }).cfg; const w = makeWorld(cfg);
for (const e of [{ t: 'add', d: 1, n: 3 }, { t: 'remove', d: 3, target: 0 }, { t: 'remove', d: 2, target: 1 }]) applyEvent(w, e);
settle(w); console.log('fixed replay order answer:', JSON.stringify(view(w, w.devs[0]).members));
