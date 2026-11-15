// simplify-v2 / roster-v2.mjs -- removal simulator (section B of simplify-study-v2.md). Extends the study's roster-sim.mjs and the reviewer's roster.mjs.
// One scenario = a set of 2..5 devices, one of them a thief X holding a pre-signed "stash" and/or signing live, one honest remover A,
// optionally a second honest remover B, a relay that is honest / absent / withholding / blocking (always "look again", no proof) / colluding with the thief.
// RULE VARIANTS (what decides who is a member from the signed entries):
//   built   the built design (roster.ts as of round 3, MutualRule 'both'): pure function of the signed entries; two removals that remove each other
//           and did not see each other both stand; a removal is void when its signer was removed by an effective removal that did not see it
//   first   the built MutualRule 'first-admitted' (the earlier-admitted signer wins a mutual pair): steerable by whoever holds the oldest device
//   study   simplify-study.md section 7 as written: with a relay a removal counts only if the relay accepted it (prev == head); no relay: both go,
//           and any other same-step clash is settled by lowest entry id (the study leaves this open; lowest id is what a thief can grind)
//   recv    built + OPTIONAL relay receipts (v2 recommendation's later hardening): the relay signs "entry E arrived as number k"; for a MUTUAL pair
//           only, the removal with the lower receipt stands and the other is void; two receipts with the same number for different entries = the relay
//           cheated, all receipts are then ignored. Relay refusals count only if they carry the signed entry that changed the roster (proof).
// ORACLE (after a full heal, every honest device holds everything honest devices ever received):
//   O1 REMOVE   the hostile device X is not a member, whenever any honest path existed (A signed its removal and an honest device other than a
//               thief ever held it)
//   O2 STEER    never "X stays while an honest device is removed" (the thief picked the loser), except the thief's removal reached the relay first
//               (a real race the relay is allowed to decide; counted apart as RACE)
//   O3 AGREE    every honest device computes the same members, in any delivery order
//   O4 BLOCK    no relay behaviour can make a signed honest removal ineffective (same as O1 under relay modes)
// Cost counted (not a violation): LOSTHON = an honest device removed together with the thief (it must be paired again; nothing is lost but the pairing).
// usage: node roster-v2.mjs <seed0> <count> <variant> <relay: honest|none|withhold|block|collude> [--json out.json N]
import fs from 'node:fs';
const [,, S0='1', N='1000', VAR='built', RM='honest'] = process.argv;
function rngf(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// ---- the rule: members from a SET of entries (no order, no clock) ------------------------------------------------
// entry: {id, signer, target, seen:[ids], rc: receipt number or undefined}
export function removedSet(all, entries, variant, admit, receiptsOk, ctx = {}) {
  const byId = new Map(entries.map(e => [e.id, e]));
  const closure = (e) => { const out = new Set(); const st = [...e.seen]; while (st.length) { const x = st.pop(); if (out.has(x) || !byId.has(x)) continue; out.add(x); for (const y of byId.get(x).seen) st.push(y); } return out; };
  const S = new Map(entries.map(e => [e.id, closure(e)]));
  // a removal is a candidate if its signer was not already removed by an effective removal that it saw (computed in the fixpoint below)
  let alive = new Set(entries.map(e => e.id));
  const mutual = (r, q) => q.signer === r.target && r.signer === q.target;     // r and q remove each other
  const kills = (q, r) => alive.has(q.id) && q.target === r.signer && !S.get(q.id).has(r.id); // q (effective) voids r: removes r's signer without having seen r
  for (let round = 0; round < 40; round++) {
    const void_ = new Set();
    for (const r of entries) {
      if (!alive.has(r.id)) continue;
      // signer must be a member in r's own past
      const seenRemovers = [...S.get(r.id)].map(i => byId.get(i)).filter(q => alive.has(q.id) && q.target === r.signer);
      if (seenRemovers.length) { void_.add(r.id); continue; }
      for (const q of entries) {
        if (q.id === r.id || !kills(q, r)) continue;
        if (mutual(r, q)) {                                                   // the exception: each removes the other, neither saw the other
          if (variant === 'first') { const a = admit.get(r.signer) < admit.get(q.signer); if (!a) void_.add(r.id); continue; }  // earlier-admitted signer stands
          if (variant === 'recv' && receiptsOk) { const a = r.rc, b = q.rc; if (a !== undefined && (b === undefined || a < b)) continue; if (b !== undefined && (a === undefined || b < a)) { void_.add(r.id); continue; } }
          if (variant === 'study') continue;                                  // study: no relay => both go
          continue;                                                           // built: both stand
        }
        void_.add(r.id);                                                      // not mutual: the removed signer's unseen entry is void
      }
    }
    // studyid: no relay, two removals on the same step that are not a mutual pair: the lowest entry id wins (what the study leaves open; a thief grinds its ids)
    if (variant === 'studyid') {
      for (const r of entries) for (const q of entries) if (r.id < q.id && alive.has(r.id) && alive.has(q.id) && !S.get(r.id).has(q.id) && !S.get(q.id).has(r.id) && !mutual(r, q)) void_.add(q.id);
    }
    let changed = false; for (const i of void_) { if (alive.has(i)) { alive.delete(i); changed = true; } }
    if (!changed) break;
  }
  const removed = new Set(); for (const e of entries) if (alive.has(e.id)) removed.add(e.target);
  return removed;
}

function run(seed, variant, RMODE) {
  const r = rngf(seed); const R = n => Math.floor(r() * n); const P = p => r() < p;
  const n = 2 + R(4); const all = [...Array(n).keys()];
  const X = R(n); const honest = all.filter(d => d !== X); const A = honest[R(honest.length)];
  const B = honest.length > 1 && P(0.5) ? honest.filter(d => d !== A)[R(honest.length - 1)] : -1;
  const admit = new Map(all.map(d => [d, d === X && P(0.35) ? -1 : d]));            // the thief is the oldest device in about 35% of runs (it also tries to look oldest)
  const grind = P(0.5);                                                             // the thief grinds its entry ids to be the lowest
  let ids = 0; const E = (signer, target, seen) => ({ id: 'e' + (++ids), signer, target, seen: [...seen] });
  const held = all.map(() => new Set());                                           // entries each device holds
  const ent = new Map();
  // an entry arrives together with everything it cites (a device parks an entry whose ancestors it lacks, so a thief cannot hide the entries it cites)
  const give = (d, id) => { const st = [id]; while (st.length) { const x = st.pop(); if (held[d].has(x)) continue; held[d].add(x); for (const y of ent.get(x).seen) st.push(y); } };
  const relay = { up: RMODE !== 'none', accepted: [], removed: new Set(), seq: 0, rc: new Map(), arrivalOrder: [] };
  const online = all.map(() => true);
  const kinds = []; const doStash = P(0.6), doLive = P(0.35);
  let stash = null; if (doStash) { const victim = P(0.8) ? A : honest[R(honest.length)]; stash = E(X, victim, []); if (grind) stash.id = 'a0'; ent.set(stash.id, stash); held[X].add(stash.id); }
  let stashReleased = false, honestSigned = false, hA = null, hB = null, thiefLive = null;
  const members = (d) => { const es = [...held[d]].map(i => ent.get(i)); return removedSet(all, es, variant === 'study' ? 'built' : variant, admit, false); };
  const canRelay = (d) => relay.up && online[d];
  const lie = () => RMODE === 'withhold' && P(0.5);
  // relay admission for variants that use it
  function relaySubmit(e, d) {
    if (!canRelay(d)) return false;
    if (RMODE === 'block') { return false; }                                         // always "devices changed, look again", never with proof
    if (RMODE === 'collude') { if (e.signer === X) { relay.seq++; e.rc = relay.seq; relay.rc.set(e.id, relay.seq); relay.accepted.push(e.id); relay.arrivalOrder.push(e.id); if (thiefArrival === null) thiefArrival = relay.seq; return true; } return false; }  // thief's entries are stamped first; honest ones are refused
    if (lie()) return false;
    // an honest relay refuses a signer it already knows removed, and (study) an entry not built on its current head
    const mem = relay.accepted.map(i => ent.get(i)); const gone = removedSet(all, mem, 'built', admit, false);
    if (gone.has(e.signer)) return false;
    if (variant === 'study') { const head = relay.accepted.slice(); if (!e.seen.every(s => head.includes(s)) || !head.every(h => e.seen.includes(h))) return false; }
    relay.seq++; e.rc = relay.seq; relay.rc.set(e.id, relay.seq); relay.accepted.push(e.id); relay.arrivalOrder.push(e.id); give(d, e.id); if (e.signer === X && thiefArrival === null) thiefArrival = relay.seq; return true;
  }
  const gossip = (a, b) => { if (a === X || b === X) return; const u = new Set([...held[a], ...held[b]]); held[a] = new Set(u); held[b] = new Set(u); };
  const pull = (d) => { if (d === X || !canRelay(d)) return; for (const i of relay.accepted) give(d, i); };
  const T = 36; const tA = 1 + R(14), tr = 1 + R(32), tL = 1 + R(32), tB = tA + R(18), tRelayDown = R(T), tRelayUp = R(T);
  let stashRelayArrival = null, hAArrival = null, thiefArrival = null;
  for (let t = 0; t < T; t++) {
    if (RMODE !== 'none' && RMODE !== 'collude') { if (t === tRelayDown && P(0.4)) relay.up = false; if (t === tRelayUp) relay.up = true; }
    for (const d of all) if (P(0.08)) online[d] = !online[d];
    // honest A removes X when it still thinks it is a member and X is one
    if (t === tA && !honestSigned) { const m = members(A); if (!m.has(A) && !m.has(X)) { hA = E(A, X, [...held[A]]); ent.set(hA.id, hA); held[A].add(hA.id); honestSigned = true; if (relaySubmit(hA, A)) hAArrival = relay.seq; } }
    if (t > tA && honestSigned && !hA.rc) {
      // study rule 2: a refusal ("devices changed; look again") means: read the new head and sign again on it
      if (variant === 'study' && canRelay(A) && (RMODE === 'honest' || RMODE === 'withhold')) { const m = removedSet(all, relay.accepted.map(i => ent.get(i)), 'built', admit, false); for (const i of relay.accepted) give(A, i); if (!m.has(A) && !m.has(X)) { hA = E(A, X, relay.accepted.slice()); ent.set(hA.id, hA); held[A].add(hA.id); } }
      if (relaySubmit(hA, A)) hAArrival = relay.seq; }                                    // A retries every step
    if (B >= 0 && t === tB && honestSigned) { const m = members(B); if (!m.has(B) && !m.has(X) && !held[B].has(hA.id) === !held[B].has(hA.id)) { hB = E(B, X, [...held[B]]); ent.set(hB.id, hB); held[B].add(hB.id); relaySubmit(hB, B); } }
    if (t === tr && stash && !stashReleased) { stashReleased = true; const to = honest[R(honest.length)]; if (P(0.5)) give(to, stash.id); const sub = canRelay(X) && relaySubmit(stash, X); if (sub) stashRelayArrival = relay.seq; held[X].add(stash.id); relay.arrivalOrder.length; if (!sub && RMODE !== 'honest') { /* stays unreceipted */ } }
    if (t === tL && doLive && !thiefLive) { const victim = honest[R(honest.length)]; thiefLive = E(X, victim, P(0.5) ? [...held[X]] : []); if (grind) thiefLive.id = 'a1'; ent.set(thiefLive.id, thiefLive); held[X].add(thiefLive.id); if (canRelay(X)) relaySubmit(thiefLive, X); const to = honest[R(honest.length)]; if (P(0.5)) give(to, thiefLive.id); }
    // honest gossip
    for (let k = 0; k < 2; k++) { const a = honest[R(honest.length)], b = honest[R(honest.length)]; if (a !== b && online[a] && online[b]) gossip(a, b); }
    for (const d of honest) if (P(0.3)) pull(d);
  }
  // heal: the relay (if any) is reachable again; the honest remover retries a few times (a refusal is told to look again, a silence is retried)
  if (RMODE !== 'none' && RMODE !== 'block' && RMODE !== 'collude') { relay.up = true; for (let k = 0; k < 6 && honestSigned && hA.rc === undefined; k++) { online[A] = true; if (variant === 'study') { const m = removedSet(all, relay.accepted.map(i => ent.get(i)), 'built', admit, false); for (const i of relay.accepted) give(A, i); if (!m.has(A) && !m.has(X)) { hA = E(A, X, relay.accepted.slice()); ent.set(hA.id, hA); held[A].add(hA.id); } } if (relaySubmit(hA, A)) hAArrival = relay.seq; } }
  // heal: honest devices share everything; the relay is reachable (except none / block / withhold-forever which keep their behaviour); thief entries that reached anyone count
  const uni = new Set(); for (const d of honest) for (const i of held[d]) uni.add(i); for (const i of relay.accepted) if (RMODE !== 'none') { const st = [i]; while (st.length) { const x = st.pop(); if (uni.has(x)) continue; uni.add(x); for (const y of ent.get(x).seen) st.push(y); } }
  // study: an honest removal that the relay never accepted is not effective at all (the study requires the relay's yes)
  const entriesAll = [...uni].map(i => ent.get(i)).filter(Boolean);
  let usable = entriesAll;
  if (variant === 'study' && RMODE !== 'none') usable = entriesAll.filter(e => e.rc !== undefined);   // with a relay, only relay-accepted removals count
  const recvOk = (() => { if (variant !== 'recv') return false; const seen = new Map(); for (const e of usable) if (e.rc !== undefined) { if (seen.has(e.rc) && seen.get(e.rc) !== e.id) return false; seen.set(e.rc, e.id); } return true; })();
  // recv refusals carry proof: a relay that refuses everything cannot stop the signed entry from being effective, so nothing to filter
  if(process.env.DBGR){console.log('n',n,'X',X,'A',A,'B',B,'honestSigned',honestSigned,'entries',JSON.stringify(entriesAll.map(e=>[e.id,e.signer+'->'+e.target,e.seen.join('+'),e.rc])))}
  const VV = variant === 'study' ? (RMODE === 'none' ? 'studyid' : 'study') : variant;
  if (process.env.DUMP && process.env.DUMPN && globalThis.__dumped < +process.env.DUMPN) { const order = all.slice().sort((a, b) => admit.get(a) - admit.get(b)); globalThis.__dump.push({ seed, n, order, entries: entriesAll.map(e => ({ id: e.id, signer: e.signer, target: e.target, seen: e.seen })), both: [...removedSet(all, entriesAll, 'built', admit, false)].sort(), first: [...removedSet(all, entriesAll, 'first', admit, false)].sort() }); globalThis.__dumped++; }
  const rem = removedSet(all, usable, VV, admit, recvOk);
  // O3: any delivery order gives the same answer (the function takes a set; shuffle to prove no hidden order)
  const sh = usable.slice().sort(() => r() - 0.5); const rem2 = removedSet(all, sh, VV, admit, recvOk);
  const agree = [...rem].sort().join() === [...rem2].sort().join();
  const honestLost = honest.filter(d => rem.has(d)); const thiefIn = !rem.has(X);
  const honestEntryHeld = honestSigned && [...uni].includes(hA.id);
  // a RACE: the thief's removal of an honest device reached the relay before A's (or A never got to sign because it was removed first)
  const race = !honestSigned || (thiefArrival !== null && (hAArrival === null || thiefArrival < hAArrival) && RMODE !== 'collude' && RMODE !== 'block');
  return { n, X, A, B, stash: !!stash, live: !!thiefLive, honestSigned, honestEntryHeld, agree, honestLost, thiefIn, race, grind, thiefOldest: admit.get(X) === -1 };
}
globalThis.__dumped = 0; globalThis.__dump = [];
const t = { runs: 0, signed: 0, o1: 0, o2: 0, o3: 0, race: 0, thiefStays: 0, lostHonest: 0, lostHonestWithStash: 0, lostHonestSecondRemover: 0, stashRuns: 0, stashRunsSigned: 0, honestSafeWithStash: 0, steerSeeds: [], o1Seeds: [], o3Seeds: [], lostHonestAny: 0, twoDev: 0, twoDevDead: 0 };
for (let s = +S0; s < +S0 + +N; s++) {
  const q = run(s, VAR, RM); t.runs++;
  if (!q.agree) { t.o3++; if (t.o3Seeds.length < 8) t.o3Seeds.push(s); }
  if (q.n === 2) { t.twoDev++; if (q.honestSigned && q.honestLost.length) t.twoDevDead++; }
  if (!q.honestSigned) continue;
  t.signed++;
  if (q.stash) { t.stashRunsSigned++; if (!q.honestLost.length && !q.thiefIn) t.honestSafeWithStash++; }
  if (q.thiefIn) { t.thiefStays++; if (!q.race && q.honestEntryHeld) { t.o1++; if (t.o1Seeds.length < 8) t.o1Seeds.push(s); } }
  if (q.honestLost.length) { t.lostHonestAny++; if (q.thiefIn) { if (q.race) t.race++; else { t.o2++; if (t.steerSeeds.length < 8) t.steerSeeds.push(s); } } else { t.lostHonest++; if (q.stash) t.lostHonestWithStash++; if (q.B >= 0) t.lostHonestSecondRemover++; } }
}
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(globalThis.__dump));
console.log(JSON.stringify({ variant: VAR, relay: RM, seed0: +S0, ...t }));
