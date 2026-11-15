// Roster/removal mini-simulator for the simplify study (section "the removal part").
// Rule set under test ("first at the relay"):
//   R-a  a removal entry is {signer, target, prev}; prev = id of the roster head the signer had seen.
//   R-b  the relay (single-threaded) accepts an entry only if prev == its current head AND the signer and target are members at that head;
//        otherwise it refuses (the device is told "someone changed the devices first; look again").
//   R-c  a device replays entries by following prev links. Entries that share a prev ("siblings", only possible with no relay or a lying relay):
//        mutual (A removes B, B removes A) -> both removals stand; one-sided (B removes C while A removes B) -> B's entry is void
//        (its signer was removed by a sibling that stands); optional R-d: a sibling removal is also void if its signer is removed by TWO different siblings.
// Scenario: n devices (3..5), one of them (the thief X) becomes hostile at a random moment and may hold a pre-signed "stash" entry;
// the honest owner removes X; the thief tries to remove an honest device. Arrival order at the relay is random.
// NOT modelled: signatures, the unlock prompt, key rotation (the new secret travels in the same unit as the removal), junk-entry spam,
// ghosts (devices a thief added), rate limits, the 30-day offer, a thief that is not yet known to be a thief.
'use strict';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const mulberry = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// membership from a SET of entries (order of arrival does not matter): walk the prev-tree from 'g'
function members(all, entries, twoRemovers) {
  let mem = new Set(all); let heads = ['g']; const done = new Set();
  for (let guard = 0; guard < 50; guard++) {
    const kids = entries.filter((e) => heads.includes(e.prev) && !done.has(e.id));
    if (!kids.length) break;
    for (const k of kids) done.add(k.id);
    // candidates: signer is a member at this point
    let cand = kids.filter((e) => mem.has(e.signer) && mem.has(e.target));
    // R-c: signers removed by a standing sibling lose their entry; mutual pairs both stand
    const targetsOf = (list) => list.reduce((m, e) => { (m[e.target] ||= new Set()).add(e.signer); return m; }, {});
    const t = targetsOf(cand);
    const standing = cand.filter((e) => {
      const removers = t[e.signer]; if (!removers) return true;                 // nobody removes my signer
      const mutual = [...removers].some((r) => cand.some((o) => o.signer === r && o.target === e.signer) && e.target === r); // I remove one of my removers
      if (twoRemovers && removers.size >= 2) return false;                       // R-d
      return mutual;                                                            // mutual: both stand; one-sided: mine is void
    });
    for (const e of standing) mem.delete(e.target);
    heads = kids.map((k) => k.id);
  }
  return mem;
}

export function run(seed, mode, twoRemovers) {
  const r = mulberry(seed); const n = 3 + Math.floor(r() * 3);
  const all = Array.from({ length: n }, (_, i) => 'd' + i); const X = 'd' + Math.floor(r() * n);
  const honest = all.filter((d) => d !== X); const A = honest[Math.floor(r() * honest.length)];
  const hasStash = r() < 0.5; const secondRemover = r() < 0.3 && honest.length > 1; const B = honest.find((d) => d !== A);
  const victim = honest[Math.floor(r() * honest.length)];                    // whom the thief tries to remove (often A)
  // times of the four possible signings/arrivals at the relay
  const tHon = r() * 10, tThief = r() * 10, tHon2 = r() * 10;
  let id = 0; const E = (signer, target, prev) => ({ id: 'e' + (++id), signer, target, prev });
  // arrival schedule at the relay: honest removal of X (A), thief removal of victim, optional second honest removal of X (B)
  const arrivals = [{ t: tHon, kind: 'hon', signer: A, target: X }, { t: tThief, kind: 'thief', signer: X, target: victim }];
  if (secondRemover) arrivals.push({ t: tHon2, kind: 'hon2', signer: B, target: X });
  if (victim === X) arrivals.splice(1, 1);
  arrivals.sort((a, b) => a.t - b.t);
  let truthFirst = arrivals[0].kind;
  let entries = []; let relayHead = 'g'; const rejected = [];
  if (mode === 'relay') {
    // each signer builds its entry on the head IT knew when it signed. The thief's stash is signed at 'g' (before any change); live entries are
    // signed on the head current at their arrival time (they retry once on refusal, as an honest device would, but the thief is removed by then).
    for (const a of arrivals) {
      const stash = a.kind === 'thief' && hasStash;
      const prev = stash ? 'g' : relayHead;
      const e = E(a.signer, a.target, prev);
      const mem = members(all, entries, twoRemovers);
      if (prev === relayHead && mem.has(e.signer) && mem.has(e.target)) { entries.push(e); relayHead = e.id; }
      else {
        rejected.push(a.kind);
        if (a.kind !== 'thief') { // honest device is told the head moved, looks again, and retries on the new head if it still wants to
          const e2 = E(a.signer, a.target, relayHead); if (members(all, entries, twoRemovers).has(e2.signer) && members(all, entries, twoRemovers).has(e2.target)) { entries.push(e2); relayHead = e2.id; }
        }
      }
    }
  } else { // no relay or a lying relay: every entry is signed on 'g' (nobody had seen the others) and all of them exist
    for (const a of arrivals) entries.push(E(a.signer, a.target, 'g'));
  }
  const mem = members(all, entries, twoRemovers);
  // each device's view: the same set (they exchange entries when they meet) -> same function -> same answer. Order independence check:
  const shuffled = entries.slice().sort(() => r() - 0.5); const mem2 = members(all, shuffled, twoRemovers);
  const agree = [...mem].sort().join() === [...mem2].sort().join();
  const honestLost = honest.filter((d) => !mem.has(d)); const thiefIn = mem.has(X);
  return { n, agree, honestLost, thiefIn, truthFirst, hasStash, secondRemover, victim, X, A, mem: [...mem], rejected };
}

if (process.argv[1] && process.argv[1].endsWith('roster-sim.mjs')) {
  const runs = +arg('runs', 10000), seed0 = +arg('seed', 1);
  for (const [mode, two] of [['relay', false], ['norelay', false], ['norelay', true]]) {
    const t = { runs: 0, disagree: 0, thiefStays: 0, honestLostAny: 0, thiefFirstHonestLost: 0, honestFirstHonestLost: 0, honestFirstThiefStays: 0, stashBlockedByRelay: 0, bothOut_twoDevicesRemoveEachOther: 0, honestFirst: 0, thiefFirst: 0, honestLostWithStash: 0, honestLostNoStash: 0 };
    for (let s = seed0; s < seed0 + runs; s++) {
      const q = run(s, mode, two); t.runs++;
      if (!q.agree) t.disagree++;
      if (q.thiefIn) t.thiefStays++;
      if (q.honestLost.length) t.honestLostAny++;
      if (q.truthFirst === 'thief') { t.thiefFirst++; if (q.honestLost.length) t.thiefFirstHonestLost++; } else { t.honestFirst++; if (q.honestLost.length) t.honestFirstHonestLost++; if (q.thiefIn) t.honestFirstThiefStays++; }
      if (q.honestLost.length) { if (q.hasStash) t.honestLostWithStash++; else t.honestLostNoStash++; }
      if (mode === 'relay' && q.hasStash && q.rejected.includes('thief')) t.stashBlockedByRelay++;
    }
    console.log(JSON.stringify({ mode, twoRemovers: two, ...t }));
  }
}
