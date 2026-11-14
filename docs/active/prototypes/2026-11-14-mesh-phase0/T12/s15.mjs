// S15: takeover of a takeover while the first is still `pending` against a concurrent claim (4 devices).
import { FIXED } from './profiles.mjs';
import { makeWorld, applyEvent, settle, view, C, fmtEvent } from './sim.mjs';
const cfg = { n: 4, skews: [0, 86400000, 30 * 86400000, -86400000], copies: [null, 'same', 'none'], ranHere: [true, false, false], rules: FIXED };
const w = makeWorld(cfg); const s6 = (x) => String(x).slice(0, 6);
const ev = [
  { t: 'add', d: 0, n: 3 },
  { t: 'sync', a: 0, b: 2, frac: 1, lines: true, full: true, seed: 1 },
  { t: 'part', groups: [0, 1, 2, 2] },
  { t: 'takeover', d: 2, why: 'off' },                                   // T1 by d2 from d0's claim (d0 unreachable)
  { t: 'sync', a: 2, b: 3, frac: 1, lines: true, full: true, seed: 2 },  // d3 learns T1 (and d0's claim), not d1's
  { t: 'heal' },
  { t: 'sync', a: 1, b: 3, frac: 1, lines: false, seed: 3 },             // d3 now also holds d1's concurrent identical claim: chat pending for d3
  { t: 'part', groups: [0, 1, 2, 3] },
  { t: 'takeover', d: 3, why: 'off' },                                   // d3 tries Continue here while pending
  { t: 'heal' },
];
for (const e of ev) { applyEvent(w, e); const v = view(w, w.devs[3]).chats[C]; const m = v && v.versions[C]; console.log(fmtEvent(e).padEnd(70), '| d3 sees:', m ? (m.pending ? 'PENDING(' + m.candidates.length + ' candidates)' : 'host ' + m.host) : '-'); }
settle(w);
const f = view(w, w.devs[0]); const rel = [...w.devs[0].pool.values()].filter((e) => e.kind === 'relation').length;
console.log('after settle: versions', JSON.stringify(Object.entries(f.chats[C].versions).map(([k, x]) => [k === C ? 'main' : s6(k), x.host, x.tail ? 'tail' : ''])), 'relation entries created:', rel, 'takeovers:', [...w.devs[0].pool.values()].filter((e) => e.kind === 'takeover').length);
