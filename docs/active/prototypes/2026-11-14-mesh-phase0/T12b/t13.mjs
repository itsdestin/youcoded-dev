// T13: a takeover at every line boundary of a short chat, a third device behind at every count, the old host's tail of every
// length/shape, and the tail arriving in every order. usage: node t13.mjs [--literal]
import { ablate as profile } from './profiles.mjs';
import { makeWorld, applyEvent, runCase, check, view, C } from './sim.mjs';
const rules = profile(process.argv);
const ONLY = process.argv.includes('--only') ? JSON.parse(process.argv[process.argv.indexOf('--only') + 1]) : null;
let cases = 0; const fails = {}; const ex = {};
const N = 6; // finished replies of 2 lines each before the host is cut off: 3 replies, boundaries at 2, 4, 6 (init chain is 4 lines)
for (const shape of [0, 1, 2]) // how the old host's tail ends: nothing | unfinished reply | finished reply
for (const tailLen of shape === 0 ? [0] : [1, 2, 3, 4])
for (const b of [0, 1, 2, 3, 4, 5, 6, 7, 8]) // lines the taker holds when it takes over (reply end at or before b is its point)
for (const c of [0, 1, 2, 3, 4, 5, 6, 7, 8]) // lines the third device holds
for (const thirdActs of [false, true])
for (const order of ['tail-first', 'takeover-first', 'interleaved']) {
  if (ONLY && (ONLY.shape !== shape || ONLY.tailLen !== tailLen || ONLY.b !== b || ONLY.c !== c || ONLY.thirdActs !== thirdActs || ONLY.order !== order)) continue;
  const cfg = { n: 3, skews: [0, 86400000, 30 * 86400000], copies: [null, 'none', 'none'], ranHere: [true, false, false], rules };
  const w = makeWorld(cfg);
  const E = (e) => applyEvent(w, e);
  // everyone learns the roster and the claim; d0 writes up to 8 lines (init 4 + 2 replies)
  E({ t: 'sync', a: 0, b: 1, frac: 1, lines: false, seed: 1 }); E({ t: 'sync', a: 0, b: 2, frac: 1, lines: false, seed: 2 });
  E({ t: 'write', d: 0, k: 2, fin: true }); E({ t: 'write', d: 0, k: 2, fin: true });
  // copy prefixes: d1 gets exactly b lines, d2 exactly c (clamped to what exists)
  const cp = (to, n) => { const a = w.devs[0], t = w.devs[to]; t.chain = a.chain.slice(0, Math.min(n, a.chain.length)).map((l) => ({ ...l })); };
  cp(1, b); cp(2, c);
  E({ t: 'part', groups: [0, 1, thirdActs ? 2 : 0] });
  const tail = () => { if (tailLen) E({ t: 'write', d: 0, k: tailLen, fin: shape === 2 }); };
  const take = () => { E({ t: 'takeover', d: 1, why: 'off', seed: 1 }); E({ t: 'write', d: 1, k: 2, fin: true }); if (thirdActs) { E({ t: 'takeover', d: 2, why: 'off', seed: 1 }); E({ t: 'write', d: 2, k: 2, fin: true }); } };
  if (order === 'tail-first') { tail(); take(); } else if (order === 'takeover-first') { take(); tail(); } else { take(); E({ t: 'sync', a: 1, b: 0, frac: 1, lines: false, seed: 3 }); tail(); }
  // finish: settle + oracle
  const { settle } = await import('./sim.mjs');
  const r = settle(w);
  cases++;
  const f = check(w);
  if (ONLY) { const v = view(w, w.devs[0]); const s6 = (x) => x.slice(0, 6); const sh = (j) => j.replace(/"([0-9a-f]{64})"/g, (m, h) => '"' + s6(h) + '"');
    for (const e of [...w.devs[0].pool.values()].sort((a, b) => a.at - b.at)) if (e.chat === C) console.log(s6(e.id), e.kind.padEnd(9), e.device, 'seen=' + e.seen.map(s6).join(','), sh(JSON.stringify(e.body)));
    console.log('TAILS', sh(JSON.stringify(v.chats[C].tails))); console.log('VERS', sh(JSON.stringify(Object.entries(v.chats[C].versions).map(([k, x]) => [s6(k), x.host, x.tail && x.upTo]))));
    console.log('RELSNAPS', JSON.stringify(Object.values(w.relSnaps))); console.log('REPLIES', JSON.stringify(w.replies.map((r) => [r.id, r.p, r.E.slice(0, 6)])));
    for (const x of w.devs) console.log(x.id, x.chain.map((l) => l.id + (l.end ? '$' : '')).join(' ')); f.forEach((x) => console.log('FAIL', x.prop, x.detail)); }
  if (r < 0) f.push({ prop: 'no-quiesce' });
  const seen = new Set();
  for (const x of f) if (!seen.has(x.prop)) { seen.add(x.prop); fails[x.prop] = (fails[x.prop] || 0) + 1; (ex[x.prop] ||= []).push({ shape, tailLen, b, c, thirdActs, order, detail: (x.detail || '').slice(0, 120) }); }
}
console.log(JSON.stringify({ rules: process.argv.includes('--literal') ? 'LITERAL' : 'FIXED', cases, failuresByProperty: fails }, null, 1));
for (const [k, v] of Object.entries(ex)) console.log(k, 'e.g.', JSON.stringify(v[0]));
