// T12/T13 throwaway simulator: devices holding line chains + control/roster pools, driven by an explicit
// event list (so any failing run can be replayed and shrunk). All device actions are decided from the
// device's OWN decide() view, never from global knowledge; only the oracle reads global knowledge.
import { decide, canon, seal, sha, hostDev, headOf } from './decide.mjs';

export const C = 'chat1';
let RULES = {}; export const setRules = (r) => { RULES = r; };
const ROSTER = new Set(['add', 'remove', 'rename', 'witness']);
export const isRoster = (e) => ROSTER.has(e.kind);

export const W0 = (o) => !!o.wide;
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ph = (chain, n) => sha(chain.slice(0, n).map((l) => l.id).join(','));
const lastEnd = (chain) => { for (let i = chain.length - 1; i >= 0; i--) if (chain[i].end) return i + 1; return 0; };
const DAY = 86400000;

export function makeWorld(cfg) {
  RULES = cfg.rules || {};
  const w = { cfg, t: 0, devs: [], part: null, snaps: {}, relSnaps: {}, replies: [], ctr: 0, seenVersionIds: new Set(), stat: { parkedMoments: 0, entries: 0 }, restores: [], notes: [] };
  const n = cfg.n;
  for (let i = 0; i < n; i++) w.devs.push({ i, id: 'd' + i, skew: cfg.skews[i % cfg.skews.length], pool: new Map(), chain: [], tails: {}, fenced: false, active: false, witnessed: new Set(), cache: null });
  const d0 = w.devs[0]; d0.active = true;
  const init = [0, 1, 2, 3].map((k) => ({ id: 'g' + k, end: k % 2 === 1, era: 'init' }));
  const roster0 = emit(w, d0, { kind: 'add', device: 'd0', by: 'd0', name: 'd0' }, true);
  void roster0;
  const first = Math.min(n, 3);
  for (let i = 1; i < first; i++) { emit(w, d0, { kind: 'add', device: 'd' + i, by: 'd0', name: 'd' + i }, true); pair(w, d0, w.devs[i]); }
  d0.chain = init.map((l) => ({ ...l }));
  claim(w, d0, true);
  for (let i = 1; i < first; i++) {
    const m = cfg.copies[i] || 'none'; const d = w.devs[i];
    if (m === 'none') continue;
    d.chain = init.map((l) => ({ ...l }));
    if (m === 'longer') d.chain.push({ id: 'x' + i + '.0', end: false, era: 'pre' + i }, { id: 'x' + i + '.1', end: true, era: 'pre' + i });
    if (m === 'diff') d.chain = init.slice(0, 2).map((l) => ({ ...l })).concat([{ id: 'y' + i + '.0', end: false, era: 'pre' + i }, { id: 'y' + i + '.1', end: true, era: 'pre' + i }]);
    claim(w, d, !!cfg.ranHere[i]);
  }
  return w;
}
function pair(w, from, to) { for (const [id, e] of from.pool) to.pool.set(id, e); to.active = true; to.cache = null; w.stat.entries += 0; }
function claim(w, d, ran) {
  const e = emit(w, d, { chat: C, version: C, kind: 'claim', body: { host: d.id, head: { segment: 0, lines: d.chain.length, hash: ph(d.chain, d.chain.length) }, ranHere: ran } });
  w.snaps[e.id] = d.chain.map((l) => l.id);
  return e;
}
export function view(w, d) {
  if (d.cache && d.cache.size === d.pool.size) return d.cache.out;
  const es = [], rs = [];
  for (const e of d.pool.values()) (isRoster(e) ? rs : es).push(e);
  const out = decide(es, rs, { stableIds: !!w.cfg.rules.stableIds, formatMax: !!w.cfg.rules.formatMax, roleField: !!w.cfg.rules.roleField, primaryIsChatId: !!w.cfg.rules.primaryIsChatId, parentOwesOnLoss: !!w.cfg.rules.parentOwesOnLoss, mutateClock: !!w.cfg.rules.mutateClock, mutateOrder: !!w.cfg.rules.mutateOrder, restoreAll: !!w.cfg.rules.restoreAll, seenMaximal: !!w.cfg.rules.seenMaximal, literalLosers: !!w.cfg.rules.literalLosers, witnessEntries: !!w.cfg.rules.witnessEntries, noOwnerField: !!w.cfg.rules.noOwnerField, naiveCluster: !!w.cfg.rules.naiveCluster, dependencyRemovals: !!w.cfg.rules.dependencyRemovals, backed: !!w.cfg.rules.backed });
  d.cache = { size: d.pool.size, out };
  if (out.parked.length) w.stat.parkedMoments++;
  const V = out.chats[C]; if (V) for (const id of Object.keys(V.versions)) if (id !== C) { w.seenVersionIds.add(id); (w.seenRoots ||= {})[id] ||= V.versions[id].roots || []; if (V.versions[id].rel) (w.seenRel ||= {})[id] ||= V.versions[id].rel; }
  if (V && Object.values(V.versions).some((x) => x.pending)) w.stat.pendingMoments = (w.stat.pendingMoments || 0) + 1;
  return out;
}
const mainV = (v) => (v.chats[C] ? v.chats[C].versions[v.chats[C].main] : null);
function frontier(w, d) {
  const v = view(w, d); const refd = new Set();
  for (const e of d.pool.values()) if (v._ready(e.id)) for (const s of e.seen) refd.add(s);
  return [...d.pool.values()].filter((e) => v._ready(e.id) && !refd.has(e.id)).map((e) => e.id).sort();
}
function emit(w, d, e, noSeen) {
  const seen = noSeen ? [...d.pool.keys()].sort() : frontier(w, d);
  w.t++;
  // control entries: `device` is the signer; roster entries: `by` is the signer and `device` the subject.
  const base = { ...e, seen, at: w.t * 1000 + d.skew };
  if (!isRoster(e)) base.device = d.id;
  const entry = seal(base);
  d.pool.set(entry.id, entry); d.cache = null; w.stat.entries++;
  return entry;
}
const reach = (w, a, b) => !w.part || w.part[a.i] === w.part[b.i];
const closure = (pool, id) => { const s = new Set(); const st = [id]; while (st.length) { const e = pool.get(st.pop()); if (e) for (const p of e.seen) if (!s.has(p)) { s.add(p); st.push(p); } } return s; };

// A device sets aside lines beyond an effective takeover's point that belong to an older era (5.4 "tail").
function reconcile(w, d) {
  const v = view(w, d); const V = v.chats[C]; if (!V) return;
  // F8: lines set aside under a takeover that LOST (void by relation, or by removal) go back where they were
  for (const [tid0, tl] of Object.entries(d.tails)) {
    const tid = tid0.split('#')[0];
    // R-REVERSIBLE also covers a takeover that became `unbacked` (its signer was removed and no remaining device vouches for its head)
    if (!(V.relVoid[tid] || v.void.includes(tid) || (w.cfg.rules.reversibleSetAside && (V.unbacked.includes(tid) || !v._ready(tid) || !lineageOf(d, V).has(tid))))) continue; // not on the winning lineage (incl. pending): lines go back
    const T = d.pool.get(tid); if (!T) continue;
    if (d.chain.length >= T.body.atLines && ph(d.chain, T.body.atLines) === T.body.atHash) {
      // the lines now sitting after the point were adopted from the losing takeover's author: keep them as that entry's own lines
      const mine = d.chain.slice(T.body.atLines);
      // R-KEEP-LONGER (T12b): only lines the takeover's AUTHOR wrote are "its own lines" to set aside. Lines after the point that came from
      // elsewhere (e.g. the old host's lines this device received later) stay in the chain; the longer of the two prefix-related runs wins.
      const authorOwn = !mine.length || (() => { const e0 = d.pool.get(mine[0].era); return !w.cfg.rules.keepLonger || (e0 ? e0.device : eraDev(d, mine[0].era)) === T.body.to; })();
      if (authorOwn) { if (mine.length) (d.lost ||= {})[tid] = mine; d.chain = d.chain.slice(0, T.body.atLines).concat(tl); }
      else { const pre = (a, b) => a.length <= b.length && a.every((l, i) => b[i].id === l.id); const base = d.chain.slice(0, T.body.atLines);
        if (pre(tl, mine)) { /* chain already holds the longer run */ } else if (pre(mine, tl)) d.chain = base.concat(tl); else { (d.lost ||= {})[tid + '#alt'] = tl; } }
      if (process.env.DBGT) console.log("RESTORE", d.id, tid.slice(0,4), "authorOwn", authorOwn, "mine", mine.map(l=>l.id).join("/"), "tl", tl.map(l=>l.id).join("/")); delete d.tails[tid0];
    }
  }
  // R-REVERSIBLE (T12b): setting lines aside is a pure function of the CURRENT decision, so it must work both ways. A takeover that
  // was void for a while (removal not yet witnessed) and is valid again gets its own lines back into the chain. Seed 108767.
  if (w.cfg.rules.reversibleSetAside) for (const [tid, ls] of Object.entries(d.lost || {})) {
    if (tid.includes('#')) continue;
    const T = d.pool.get(tid); if (!T || !v._ready(tid) || v.void.includes(tid) || V.relVoid[tid]) continue;
    if (!lineageOf(d, V).has(tid)) continue;
    const n = T.body.atLines; if (!(d.chain.length >= n && ph(d.chain, n) === T.body.atHash)) continue;
    if (d.chain.length > n && !d.tails[tid]) d.tails[tid] = d.chain.slice(n);
    d.chain = d.chain.slice(0, n).concat(ls); delete d.lost[tid];
  }
  for (const E of d.pool.values()) {
    if (E.kind !== 'takeover' || E.chat !== C || !v._ready(E.id) || v.void.includes(E.id) || V.relVoid[E.id]) continue;
    // R-LINEAGE (T12b): set lines aside only for a takeover on the winning lineage (a resolved host entry or an ancestor of one).
    // WHY: seed 111374 -- an `unbacked` takeover (signed by a removed device) was not host, yet two devices moved their own finished
    // lines aside for it; the relation that needed those lines could then never be written and the chat stayed pending.
    if (w.cfg.rules.lineageSetAside && !(lineageOf(d, V).has(E.id))) continue;
    if (d.id === E.body.to) continue;
    // do not set lines aside for a takeover whose standing is still `pending`: the relation needs those very lines
    if (Object.values(V.versions).some((x) => x.pending && x.candidates.includes(E.id))) continue;
    const n = E.body.atLines;
    if (d.chain.length > n && ph(d.chain, n) === E.body.atHash) {
      const nxt = d.chain[n];
      // lines already written under this takeover (or a later one) are the new chain, not a tail.
      if (nxt.era === E.id || closure(d.pool, nxt.era).has(E.id)) continue;
      // only lines the PREVIOUS HOST wrote are its tail; a device's own copy of a concurrent claim is not (5.4 "Lines the previous host wrote")
      const pids = Array.isArray(E.body.parent) ? E.body.parent : [E.body.parent]; const Ps = pids.map((x) => d.pool.get(x)).filter(Boolean);
      if (!Ps.length || !Ps.some((P) => eraDev(d, nxt.era) === hostDev(P))) continue;
      // R-NO-OVERWRITE (T12b): setting lines aside never destroys a run already set aside under this takeover (seed 149748: a 1-line set-aside
      // replaced the 7-line one that held a finished reply). The longer of two prefix-related runs is kept; unrelated runs are both kept.
      const nw = d.chain.slice(n); const old = d.tails[E.id];
      if (!old || !w.cfg.rules.noOverwrite) d.tails[E.id] = nw;
      else { const pre = (a, b) => a.length <= b.length && a.every((l, i) => b[i].id === l.id);
        if (pre(old, nw)) d.tails[E.id] = nw; else if (!pre(nw, old)) d.tails[E.id + '#' + nw.map((l) => l.id).join(',')] = nw; }
      d.chain = d.chain.slice(0, n);
    }
  }
}
function lineageOf(d, V) {
  const lin = new Set(); const st = Object.entries(V.status).filter(([, x]) => x === 'host').map(([id]) => id);
  while (st.length) { const id = st.pop(); if (lin.has(id)) continue; lin.add(id); const e = d.pool.get(id); if (e) { const p = e.kind === 'takeover' ? e.body.parent : null; for (const q of (p == null ? [] : Array.isArray(p) ? p : [p])) st.push(q); } }
  return lin;
}
// which device wrote the lines of a given era (initial lines belong to d0, 'preN' to device N)
const eraDev = (d, era) => (era === 'init' ? 'd0' : /^pre\d+$/.test(era) ? 'd' + era.slice(3) : (d.pool.get(era) || {}).device);
const isPrefix = (a, b) => a.length <= b.length && a.every((l, i) => l.id === b[i].id);

// WHY: a witness records what the device held WHEN IT LEARNED of a removal (5.1). So it is taken atomically on first holding the
// removal, not later at some duty time (a late witness would vouch for entries received after learning: laundering).
function learnAll(w) { for (const d of w.devs) if (d.active) witness(w, d); }
export function applyEvent(w, ev) { applyEvent0(w, ev); learnAll(w); }
function applyEvent0(w, ev) {
  const devs = w.devs; const d = ev.d !== undefined ? devs[ev.d] : null;
  const rng = mulberry(ev.seed || 1);
  switch (ev.t) {
    case 'part': w.part = ev.groups; return;
    case 'heal': w.part = null; return;
    case 'sync': {
      const a = devs[ev.a], b = devs[ev.b]; if (a === b || !a.active || !b.active || !reach(w, a, b)) return;
      const ids = [...a.pool.keys()].sort(); const pick = [];
      for (const id of ids) { if (rng() < ev.frac) { pick.push(id); if (rng() < 0.2) pick.push(id); } }
      for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
      for (const id of pick) b.pool.set(id, a.pool.get(id));
      b.cache = null; view(w, b); reconcile(w, b);
      if (ev.lines && accepts(w, b, a)) { adopt(w, a, b, rng, ev.full); if (RULES.reconcileAfterAdopt) reconcile(w, b); }
      return;
    }
    case 'write': {
      if (!d || !d.active) return; if (RULES.reconcileAfterAdopt) reconcile(w, d); const v = view(w, d); const V = mainV(v);
      if (!V || V.host !== d.id || d.fenced || !d.chain.length) return;
      for (let k = 0; k < ev.k; k++) {
        const end = ev.fin && k === ev.k - 1; const id = d.id + '.' + (w.ctr++);
        d.chain.push({ id, end, era: V.hostEntry });
        if (end) w.replies.push({ id, w: d.id, E: V.hostEntry, p: d.chain.length, t: w.t });
      }
      d.cache = null; return;
    }
    case 'takeover': return takeover(w, d, ev);
    case 'release': return release(w, d);
    case 'relate': return relate(w, d);
    case 'witness': return witness(w, d);
    case 'onbehalf': return onbehalf(w, d);
    case 'rename': case 'flag': case 'talk': case 'format': case 'delete': case 'restore': return attr(w, d, ev);
    case 'add': {
      const n = devs[ev.n]; if (!d || !d.active || n.active) return; const v = view(w, d);
      if (v.members[d.id] !== 'member') return;
      emit(w, d, { kind: 'add', device: n.id, by: d.id, name: n.id });
      pair(w, d, n); return;
    }
    case 'remove': return doRemove(w, d, devs[ev.target]);
    // T12b generator: two devices each remove the other at the same moment, neither having seen the other's removal.
    case 'mutual': { const t = devs[ev.target]; if (!d || !t || d === t) return; doRemove(w, d, t); doRemove(w, t, d); return; }
    default: throw new Error('unknown event ' + ev.t);
  }
}
function doRemove(w, d, tg) {
  if (!d || !d.active || !tg || tg === d) return; const v = view(w, d);
  if (v.members[d.id] !== 'member' || v.members[tg.id] !== 'member') return;
  const last = lastBy(w, d, tg.id);
  emit(w, d, { kind: 'remove', device: tg.id, by: d.id, cutoff: { [C]: { lastEntry: last, segment: 0, lines: d.chain.length, backed: backedList(w, d) } } });
}
// R-ROSTER-GATE (T12b, 5.2 "a peer is checked against the roster before any frame is accepted"): a device takes lines only from a
// peer that is a member in ITS OWN view. Removed or not-yet-known devices are not copied from. (Control entries are still exchanged.)
function accepts(w, to, from) { if (!w.cfg.rules.rosterGate) return true; return view(w, to).members[from.id] === 'member'; }
function adopt(w, a, b, rng, full) {
  reconcile(w, b);
  // R-HOST-DOES-NOT-PULL (T12b): the host of a version is the source of its lines and never copies another device's lines onto its own
  // chain (seed 1144542: a taker at point 0 re-adopted the old host's lines on top of its fresh chain, then wrote on them).
  if (RULES.hostNoPull) { const m = mainV(view(w, b)); if (m && m.host === b.id) return; }
  if (isPrefix(b.chain, a.chain) && a.chain.length > b.chain.length) {
    const k = full ? a.chain.length : b.chain.length + 1 + Math.floor(rng() * (a.chain.length - b.chain.length));
    b.chain = a.chain.slice(0, k).map((l) => ({ ...l }));
  }
}
function backedList(w, d) {
  const v = view(w, d); const out = [];
  for (const e of d.pool.values()) if ((e.kind === 'claim' || e.kind === 'takeover') && e.chat === C && v._ready(e.id)) {
    const h = headOf(e); if (d.chain.length >= h.lines && ph(d.chain, h.lines) === h.hash) out.push(e.id);
  }
  return out.sort();
}
function lastBy(w, d, target) {
  let best = null, bs = -1;
  for (const e of d.pool.values()) {
    if (e.kind === 'witness' && !w.cfg.rules.witnessEntries) continue;
    const s = e.by !== undefined ? e.by : e.device; if (s !== target) continue;
    const sz = closure(d.pool, e.id).size; if (sz > bs || (sz === bs && e.id < best)) { bs = sz; best = e.id; }
  }
  if (best) return best;
  for (const e of d.pool.values()) if (e.kind === 'add' && e.device === target) return e.id;
  return null;
}
// R-ORPHAN as an automatic duty (also run in settle): a member holding lines for a chat that has no valid host entry claims it.
function orphan(w, d) {
  if (!w.cfg.rules.orphanClaim || !d || !d.active || !d.chain.length) return;
  const v = view(w, d); const V = mainV(v);
  if (!V || V.pending || v._removed(d.id) || v.members[d.id] !== 'member') return;
  if (V.hostEntry || (w.cfg.rules.backed && (v.chats[C].unbacked || []).length)) {
    // R-ADOPT (T12b): a member whose copy is not a prefix of any copy a valid host entry stands for writes a claim for what it holds.
    // The "is it a prefix" answer stands in for 5.3's `version V: I have N lines ending in H` question to any peer.
    if (!w.cfg.rules.adoptClaim || !w.readded) return;
    const mine = d.chain.map((l) => l.id); const memo = (d.adoptMemo ||= new Set()); const key = mine.join(',');
    if (memo.has(key)) return;
    const refs = []; for (const e of d.pool.values()) if ((e.kind === 'claim' || e.kind === 'takeover') && e.chat === C && v._ready(e.id) && !v.void.includes(e.id) && !v.chats[C].unbacked.includes(e.id)) { if (w.snaps[e.id]) refs.push(w.snaps[e.id]); }
    for (const o of w.devs) if (o !== d && o.active && !v._removed(o.id)) { refs.push(o.chain.map((l) => l.id)); for (const t of Object.values(o.tails)) refs.push(o.chain.map((l) => l.id).concat(t.map((l) => l.id))); }
    const own = []; for (const [tid, t] of Object.entries(d.tails)) own.push(d.chain.concat(t).map((l) => l.id));
    const pre = (a, b) => a.length <= b.length && a.every((id, i) => b[i] === id);
    if (refs.some((r) => pre(mine, r)) || own.some((r) => pre(mine, r))) return;
    memo.add(key); claim(w, d, false); d.fenced = false; return;
  }
  // one orphan claim per distinct copy per device (a claim that others see as void must not be re-written every round: seed 311707)
  const okey = 'orphan:' + d.chain.map((l) => l.id).join(','); const mm = (d.adoptMemo ||= new Set()); if (mm.has(okey)) return; mm.add(okey);
  claim(w, d, false); d.fenced = false;
}
export function readdAll(w) {
  w.readded = true;
  // user re-pairs every device that ended up removed or unknown (a fresh `add` signed by the lowest-id remaining member)
  const m0 = w.devs.find((d) => d.active && view(w, d).members[d.id] === 'member'); if (!m0) return 0; let n = 0;
  for (const t of w.devs) { if (!t.active || t === m0) continue; const v = view(w, m0); if (v.members[t.id] === 'member') continue;
    for (const [id, e] of t.pool) m0.pool.set(id, e); m0.cache = null; // the pairing handshake exchanges what both hold
    emit(w, m0, { kind: 'add', device: t.id, by: m0.id, name: t.id }); pair(w, m0, t); n++; }
  return n;
}
function takeover(w, d, ev) {
  if (!d || !d.active) return; const v = view(w, d); const V = mainV(v);
  if (!V || (V.pending && !w.cfg.rules.pendingTakeover) || v._removed(d.id) || v.members[d.id] !== 'member') return;
  if (V.pending) return takeoverPending(w, d, v, V);
  // R-ORPHAN (T12b): the chat has no valid host entry at all (every claim void or unbacked) and no takeover can name one as parent.
  // A remaining member that holds lines writes a fresh `claim` (not ran-here) for what it holds. Seeds 113098, 119763.
  if (!V.hostEntry && !(w.cfg.rules.backed && (v.chats[C].unbacked || []).length)) {
    if (!w.cfg.rules.orphanClaim || V.pending || d.chain.length === 0) return;
    const e = claim(w, d, false); d.fenced = false; return;
  }
  if (V.host === d.id) return;
  if (d.chain.length === 0) return;
  let reason, n;
  if (V.host === null) { if (!V.hostRemoved && V.hostEntry) return; reason = 'host-removed'; n = lastEnd(d.chain); }
  else {
    const H = w.devs[Number(V.host.slice(1))]; const reachable = H.active && reach(w, d, H);
    if (ev.why === 'chip' && reachable) {
      const hv = mainV(view(w, H));
      if (!hv || hv.host !== H.id || H.fenced) return;
      if (H.chain.length && !H.chain[H.chain.length - 1].end) return; // 2.7: waits for the running reply to end
      if (!(isPrefix(d.chain, H.chain))) return;
      H.fenced = true; d.chain = H.chain.map((l) => ({ ...l })); n = H.chain.length; reason = 'chip';
      // the fenced host's frontier at fence time is known to the taker: copy its pool (it answers the fence message)
      for (const [id, e] of H.pool) d.pool.set(id, e); d.cache = null;
    } else if (!reachable) {
      reason = w.devs.some((o) => o !== d && o.active && reach(w, d, o)) ? 'host-offline' : 'no-connection'; n = lastEnd(d.chain);
    } else return;
  }
  const v2 = view(w, d); const V2 = mainV(v2); if (!V2) return;
  // realism gate (not a design rule): a device only takes over a version whose lines it actually holds up to the point.
  const refDev = V2.host ? w.devs[Number(V2.host.slice(1))] : null; if (!V2.hostEntry && !(v2.chats[C].unbacked || []).length) return;
  const refChain = (refDev ? refDev.chain.concat(Object.values(refDev.tails).flat()) : []).map((l) => l.id);
  const snap = w.snaps[V2.hostEntry] || [];
  const mine = d.chain.slice(0, n).map((l) => l.id);
  const okPrefix = (ref) => mine.every((id, i) => ref[i] === id);
  if (V2.hostEntry && !(okPrefix(snap) || okPrefix(refChain))) return;
  // R-SELF-PARENT (T12b): the takeover also names, as parents, this device's OWN host entries that are still tips (a claim it wrote
  // earlier). Otherwise a device's later takeover and its own earlier claim compete as two "versions" of one author (seed 125960).
  let parent = V2.hostEntry || null;
  if (w.cfg.rules.selfParent) {
    const named = new Set(); for (const e of d.pool.values()) if (e.kind === 'takeover') for (const p of (e.body.parent == null ? [] : Array.isArray(e.body.parent) ? e.body.parent : [e.body.parent])) named.add(p);
    const own = [...d.pool.values()].filter((e) => (e.kind === 'claim' || e.kind === 'takeover') && e.chat === C && hostDev(e) === d.id && v2._ready(e.id) && !v2.void.includes(e.id) && !named.has(e.id) && e.id !== parent).map((e) => e.id);
    if (own.length) parent = [...new Set([...(parent ? [parent] : []), ...own])].sort();
  }
  const e = emit(w, d, { chat: C, version: C, kind: 'takeover', body: { parent, to: d.id, segment: 0, atLines: n, atHash: ph(d.chain, n), reason } });
  if (d.chain.length > n) { d.tails[e.id] = d.chain.slice(n); d.chain = d.chain.slice(0, n); }
  d.fenced = false; w.snaps[e.id] = d.chain.map((l) => l.id);
}
// F7: while the chat is `pending` the user may still Continue here; the takeover names every pending candidate as a parent.
function takeoverPending(w, d, v, V) {
  if (d.chain.length === 0) return;
  const cands = V.candidates; const own = cands.some((id) => d.pool.get(id).device === d.id); if (own) return;
  const n = lastEnd(d.chain);
  const e = emit(w, d, { chat: C, version: C, kind: 'takeover', body: { parent: cands.slice().sort(), to: d.id, segment: 0, atLines: n, atHash: ph(d.chain, n), reason: 'host-offline' } });
  if (d.chain.length > n) { d.tails[e.id] = d.chain.slice(n); d.chain = d.chain.slice(0, n); }
  d.fenced = false; w.snaps[e.id] = d.chain.map((l) => l.id);
}
function makeRelease(w, d, takeoverId, tail, base, onBehalfOf, role) {
  if (process.env.DBGREL) console.log("REL", d.id, takeoverId.slice(0,6), tail.map(l=>l.id), base, onBehalfOf, new Error().stack.split("\n")[2].trim());
  let lastIdx = -1; tail.forEach((l, i) => { if (l.end) lastIdx = i; });
  const body = { takeover: takeoverId, role, owner: onBehalfOf || d.id, segment: 0, tailLines: tail.length, tailHash: sha(tail.map((l) => l.id).join(',')), lastReplyEndInTail: lastIdx < 0 ? null : base + lastIdx + 1 };
  if (onBehalfOf) body.onBehalfOf = onBehalfOf;
  const r = emit(w, d, { chat: C, version: C, kind: 'released', body });
  w.relSnaps[r.id] = tail.slice(0, lastIdx + 1).map((l) => l.id);
  return r;
}
function release(w, d) {
  if (!d || !d.active) return; reconcile(w, d); const v = view(w, d); const V = v.chats[C]; if (!V || v._removed(d.id)) return;
  for (const t of V.tails) {
    if (t.owner !== d.id || t.fate !== 'waiting') continue;
    const E = d.pool.get(t.entry);
    if (t.loser) {
      if (!w.cfg.rules.loserRelease) continue;
      const h = headOf(E);
      // the device's own lines may sit in the main chain OR in a set-aside tail kept under some takeover's id; use the longest that holds the head
      const best = ownLines(d, E, h, d.id, false);
      if (process.env.DBGREL) console.log('LOSERREL', d.id, E.id.slice(0,6), h, best && best.map((l) => l.id));
      if (!best) continue;
      makeRelease(w, d, E.id, ownRun(d, best.slice(h.lines), d.id), h.lines, undefined, 'self'); d.fenced = true; continue;
    }
    const n = E.body.atLines;
    // set-aside lines are found by their chain (hash at the takeover point), not by which takeover id first set them aside:
    // that takeover may have lost a relation (report F8)
    const full = ownLines(d, E, { lines: n, hash: E.body.atHash }, d.id, !!RULES.oldEra);
    if (process.env.DBGREL) console.log("RELDBG", d.id, d.chain.map(l=>l.id), Object.keys(d.tails).map(k=>k.slice(0,6)), full && full.map(l=>l.id), n);
    let tail = full ? (RULES.runFix ? ownRun(d, full.slice(n), d.id) : full.slice(n)) : null;
    if (!tail) { if (d.chain.length > n) continue; tail = []; }
    makeRelease(w, d, E.id, tail, n, undefined, 'parent');
  }
}
function relate(w, d) {
  if (!d || !d.active) return; const v = view(w, d); const V = mainV(v); if (v._removed(d.id)) return; if (!V || !V.pending) return;
  const M = V.candidates.map((id) => d.pool.get(id));
  const have = new Set(); for (const e of d.pool.values()) if (e.kind === 'relation' && v._ready(e.id) && !v.void.includes(e.id)) have.add([e.body.a, e.body.b].sort().join('|'));
  for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
    const key = [M[i].id, M[j].id].sort().join('|'); if (have.has(key)) continue;
    let a = M[i], b = M[j]; let ha = headOf(a), hb = headOf(b);
    if (hb.lines > ha.lines) { [a, b] = [b, a]; [ha, hb] = [hb, ha]; } // a = longer copy
    if (d.chain.length < ha.lines) continue;
    const mine = ph(d.chain, ha.lines);
    if (mine !== ha.hash && !(ha.lines === hb.lines && mine === hb.hash)) continue; // holds neither copy at the longer length
    // same length: identical iff the two stated hashes are equal; otherwise the shorter head must lie on my chain.
    const prefix = ha.lines === hb.lines ? ha.hash === hb.hash : ph(d.chain, hb.lines) === hb.hash;
    emit(w, d, { chat: C, version: C, kind: 'relation', body: { a: M[i].id, b: M[j].id, prefix } });
  }
}
function witness(w, d) {
  if (!d || !d.active) return; const v = view(w, d);
  for (const R of [...d.pool.values()].filter((e) => e.kind === 'remove' && v._ready(e.id))) {
    if (R.device === d.id || d.witnessed.has(R.id)) continue; if (v._removed(d.id)) continue;
    d.witnessed.add(R.id);
    emit(w, d, { kind: 'witness', removal: R.id, held: { [C]: { lastEntry: lastBy(w, d, R.device), segment: 0, lines: d.chain.length, backed: backedList(w, d) } }, device: d.id });
  }
}
function ownLines(d, E, h, owner, oldEraOnly) {
  // longest sequence this device holds that has E's head as a prefix (main chain or any set-aside tail)
  const cands = [d.chain];
  for (const [tid0, tl] of Object.entries(d.tails)) { const tid = tid0.split('#')[0]; const T = d.pool.get(tid); if (T) cands.push(d.chain.slice(0, T.body.atLines).concat(tl)); }
  for (const [tid0, tl] of Object.entries(d.lost || {})) { const tid = tid0.split('#')[0]; const T = d.pool.get(tid); if (T) cands.push(d.chain.slice(0, T.body.atLines).concat(tl)); }
  let best = null;
  // R-OWNLINES (T12b): choose the candidate holding the most lines the OWNER wrote after the head (provenance via eraDev, which also
  // knows the initial and pre-existing eras); old rule judged only the final line and could pick another device's lines (seed 108767).
  if (process.env.DBGREL) console.log('LOSTKEYS', Object.keys(d.lost || {}).map((k) => k.slice(0, 8) + (d.pool.has(k) ? '+' : '-')), 'CANDS', cands.map((c) => c.map((l) => l.id).join(',') + '|' + (c.length >= h.lines && ph(c, h.lines) === h.hash)));
  // R-OLD-ERA (T12b): the tail a takeover's PARENT author owes is the lines it wrote BEFORE that takeover, never lines it wrote after
  // taking over again itself (seed 1133515: the device's newer lines were released as its old tail and the old tail was never described).
  const isNew = (c) => c.length > h.lines && (c[h.lines].era === E.id || closure(d.pool, c[h.lines].era).has(E.id));
  if (oldEraOnly) { const keep = cands.filter((c) => !isNew(c)); if (keep.length) { cands.length = 0; cands.push(...keep); } }
  // R-NEW-ERA: the tail a losing host entry's OWN author owes is the lines written under that entry (era E or later), never its older set-aside lines.
  if (RULES.oldEra && oldEraOnly === false) { const keep = cands.filter((c) => c.length > h.lines && isNew(c)); if (keep.length) { cands.length = 0; cands.push(...keep); } }
  const ownCount = (c) => ownRun(d, c.slice(h.lines), owner).length;
  if (RULES.runFix) { let bn = -1; for (const c of cands) if (c.length >= h.lines && ph(c, h.lines) === h.hash) { const k = ownCount(c); if (k > bn || (k === bn && c.length > best.length)) { bn = k; best = c; } } return best; }
  const own = (c) => { if (c.length <= h.lines) return false; const e = d.pool.get(c[c.length - 1].era); return !!e && e.device === owner; };
  for (const c of cands) if (c.length >= h.lines && ph(c, h.lines) === h.hash && (!best || (owner ? (own(c) && !own(best)) || (own(c) === own(best) && c.length > best.length) : c.length > best.length))) best = c;
  return best;
}
// lines provenance: a device knows which host entry (hence which device) each line came from; a tail only counts lines the owner wrote
// R-TAIL (T12b): the tail is the lines after the head up to the owner's LAST own line (old test looked only at the final line).
// WHY: seed 119382 -- d0 held its own two lines plus a line adopted from a takeover that later became void; the old test looked only
// at the last line (not d0's) and declared the tail empty, so d0's finished reply was discarded.
function ownRun(d, lines, owner) {
  if (!lines.length) return [];
  if (!RULES.runFix) { const e = d.pool.get(lines[lines.length - 1].era); return e && e.device === owner ? lines : []; }
  // tail = lines after the head up to and including the LAST line the owner wrote (trailing lines adopted from others are not its own)
  let k = 0; for (let i = 0; i < lines.length; i++) { const e = d.pool.get(lines[i].era); const dv = e ? e.device : eraDev(d, lines[i].era); if (dv === owner) k = i + 1; }
  return lines.slice(0, k);
}
function onbehalf(w, d) {
  if (!d || !d.active) return; const v = view(w, d); const V = v.chats[C]; if (!V || v._removed(d.id)) return;
  for (const t of V.tails) {
    if (t.owner == null || !v._removed(t.owner)) continue;
    const E = d.pool.get(t.entry);
    const remover = v._eff.some((R) => R.device === t.owner && R.by === d.id);
    if (!w.cfg.rules.anyOnBehalf && !remover) continue;
    let group = [d];
    if (!w.cfg.rules.anyOnBehalf) group = w.devs.filter((o) => o.active && reach(w, d, o));
    let best = null; let base;
    for (const o of group) {
      reconcile(w, o);
      let tl;
      if (t.loser) { const h = headOf(E); const full = ownLines(o, E, h, t.owner, false); base = h.lines; tl = full ? ownRun(o, full.slice(h.lines), t.owner) : null; }
      else { base = E.body.atLines; const full = ownLines(o, E, { lines: base, hash: E.body.atHash }, t.owner, !!RULES.oldEra); tl = full ? (RULES.runFix ? ownRun(o, full.slice(base), t.owner) : full.slice(base)) : []; }
      if (tl && (!best || tl.length > best.length)) best = tl;
    }
    if (!best) continue;
    const have = t.release ? d.pool.get(t.release).body.tailLines : -1;
    // a release this device already wrote for the same (takeover, owner, length) is never written twice, even when others see it void
    // (seed 311707: a release signed by a device whose standing others disagree on was re-written every round and never converged)
    const rk = E.id + '|' + t.owner + '|' + best.length; const rm = (d.relMemo ||= new Set());
    if (best.length > have && !rm.has(rk)) { rm.add(rk); makeRelease(w, d, E.id, best, base, t.owner, t.loser ? 'self' : 'parent'); }
  }
}
function attr(w, d, ev) {
  if (!d || !d.active) return; const v = view(w, d); if (v.members[d.id] !== 'member') return;
  const mk = (kind, body) => emit(w, d, { chat: C, version: C, kind, body });
  if (ev.t === 'rename') mk('renamed', { title: ev.v }); else if (ev.t === 'flag') mk('flag', { name: ev.name, on: ev.on });
  else if (ev.t === 'talk') mk('talk-only', { on: ev.on }); else if (ev.t === 'format') mk('format', { minAppVersion: ev.v });
  else if (ev.t === 'delete') mk('deleted', {});
  else if (ev.t === 'restore') {
    const ds = [...d.pool.values()].filter((e) => e.kind === 'deleted' && v._ready(e.id) && !v.void.includes(e.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!ds.length) return;
    const r = mk('restored', { deleted: ds[0].id }); w.restores.push({ id: r.id, saw: ds.map((x) => x.id) });
  }
}

// ---------- quiescence: heal, everyone exchanges everything, duties run until nothing new appears ----------
// a real fingerprint of everything a duty could change (a sum of sizes can cancel out and end the settle too early)
const stateKey = (w) => sha(w.devs.map((d) => [[...d.pool.keys()].sort().join(','), d.chain.map((l) => l.id).join(','), Object.entries(d.tails).sort().map(([k, v]) => k + ':' + v.map((l) => l.id).join('/')).join(';'), Object.entries(d.lost || {}).sort().map(([k, v]) => k + ':' + v.map((l) => l.id).join('/')).join(';')].join('|')).join('||'));
export function settle(w) {
  w.part = null;
  for (let round = 0; round < 40; round++) {
    const before = stateKey(w);
    for (const a of w.devs) for (const b of w.devs) if (a !== b && a.active && b.active) {
      for (const [id, e] of a.pool) b.pool.set(id, e);
      b.cache = null; reconcile(w, b);
      if (isPrefix(b.chain, a.chain) && accepts(w, b, a) && !(RULES.hostNoPull && (() => { const m = mainV(view(w, b)); return m && m.host === b.id; })())) b.chain = a.chain.map((l) => ({ ...l }));
      learnAll(w);
    }
    for (const d of w.devs) if (d.active) { view(w, d); reconcile(w, d); witness(w, d); relate(w, d); release(w, d); onbehalf(w, d); orphan(w, d); learnAll(w); }
    if (stateKey(w) === before && round > 0) return round;
  }
  return -1;
}

// ---------- oracle ----------
export function check(w, opts = {}) {
  const fails = [...(w.midFails || [])];
  const act = w.devs.filter((d) => d.active);
  const views = act.map((d) => view(w, d));
  const base = canon(views[0]);
  // P2 agreement
  views.forEach((v, i) => { if (canon(v) !== base) fails.push({ prop: 'P2-agree', detail: 'device ' + act[i].id + ' differs' }); });
  const pool = act[0].pool;
  const es = [], rs = [];
  for (const e of pool.values()) (isRoster(e) ? rs : es).push(e);
  const rr = { stableIds: !!w.cfg.rules.stableIds, formatMax: !!w.cfg.rules.formatMax, roleField: !!w.cfg.rules.roleField, primaryIsChatId: !!w.cfg.rules.primaryIsChatId, parentOwesOnLoss: !!w.cfg.rules.parentOwesOnLoss, mutateClock: !!w.cfg.rules.mutateClock, mutateOrder: !!w.cfg.rules.mutateOrder, restoreAll: !!w.cfg.rules.restoreAll, seenMaximal: !!w.cfg.rules.seenMaximal, literalLosers: !!w.cfg.rules.literalLosers, witnessEntries: !!w.cfg.rules.witnessEntries, noOwnerField: !!w.cfg.rules.noOwnerField, naiveCluster: !!w.cfg.rules.naiveCluster, dependencyRemovals: !!w.cfg.rules.dependencyRemovals, backed: !!w.cfg.rules.backed };
  const out = decide(es, rs, rr);
  const rng = mulberry(7);
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  // P1 permutation + duplication
  for (let k = 0; k < 3; k++) {
    const dup = (a) => shuffle([...a, ...a.filter(() => rng() < 0.4)]);
    if (canon(decide(dup(es), dup(rs), rr)) !== canon(out)) fails.push({ prop: 'P1-permute', detail: 'shuffle ' + k });
  }
  // P5 wall clocks: scramble every `at`, keep ids
  const sc = (a) => a.map((e) => ({ ...e, at: Math.floor(rng() * 1e12) }));
  if (canon(decide(sc(es), sc(rs), rr)) !== canon(out)) fails.push({ prop: 'P5-clock', detail: 'output changed when `at` changed' });
  // P4 nothing parked at the end, every entry applied or void-by-removal
  {
    // parked is acceptable only when the signer's `add` is itself void (the introducer was removed before anyone else saw the add)
    const pm = new Map(); for (const e of es) pm.set(e.id, e); for (const e of rs) pm.set(e.id, e);
    const dead = new Set(); const voided = new Set(out.void);
    const signerOf = (e) => (e.by !== undefined ? e.by : e.device);
    let ch = true;
    while (ch) { ch = false; for (const id of out.parked) { if (dead.has(id)) continue; const e = pm.get(id);
      const sg = signerOf(e); const addVoid = rs.some((a) => a.kind === 'add' && a.device === sg && (voided.has(a.id) || dead.has(a.id))) && out.members[sg] === 'unknown';
      if (addVoid || e.seen.some((x) => dead.has(x))) { dead.add(id); ch = true; } } }
    const bad = out.parked.filter((id) => !dead.has(id));
    if (bad.length) fails.push({ prop: 'P4-parked', detail: bad.length + ' entries still parked after full exchange, not explained by a void add' });
    if (out.parked.length) w.stat.parkedAtEnd = out.parked.length;
  }
  // P8 internal consistency
  if (out.inconsistent.some((x) => x[0] === 'no-fixpoint')) fails.push({ prop: 'P8-removal-no-fixpoint', detail: 'void/removal iteration did not settle' });
  if (out.inconsistent.length) w.stat.concurrentRemovalsBothStand = out.inconsistent.length;
  const V = out.chats[C];
  if (V && V.contradictions.length) fails.push({ prop: 'P8-relation-contradiction', detail: JSON.stringify(V.contradictions).slice(0, 120) });
  // P9 liveness: nothing pending at the end
  if (V) for (const [id, v] of Object.entries(V.versions)) if (v.pending) fails.push({ prop: 'P9-pending', detail: 'version ' + id.slice(0, 8) + ' still pending after full exchange' });
  // P10 format: the answer is the highest minAppVersion among valid `format` entries (never an older one)
  if (V) { const fmts = es.filter((e) => e.kind === 'format' && e.version === C && out._ready(e.id) && !out.void.includes(e.id)); const want = fmts.length ? Math.max(...fmts.map((e) => e.body.minAppVersion)) : null;
    if (V.versions[V.main].minVersion !== want) fails.push({ prop: 'P10-format', detail: 'minVersion ' + V.versions[V.main].minVersion + ' expected ' + want }); }
  // P6 restore completeness
  if (V) {
    const pm = new Map(); for (const e of es) pm.set(e.id, e); for (const e of rs) pm.set(e.id, e);
    const live = (e) => out._ready(e.id) && !out.void.includes(e.id);
    const dels = es.filter((e) => e.kind === 'deleted' && e.version === C && live(e));
    const rests = es.filter((e) => e.kind === 'restored' && e.version === C && live(e));
    const expected = dels.some((dd) => !rests.some((r) => closure(pm, r.id).has(dd.id)));
    if (V.versions[V.main].deleted !== expected) fails.push({ prop: 'P6-restore', detail: 'deleted=' + V.versions[V.main].deleted + ' but a restore had seen every delete (expected ' + expected + ')' });
  }
  // P7 version ids that appeared in some device's view but are gone at the end
  // P7s strict: a version id that was shown is still a canonical id at the end. P7 (alias): it is a canonical id OR an alias that
  // still names a version (the root-derived alias table). With stableIds off both are the same old check.
  if (V) for (const id of w.seenVersionIds) { if (!V.versions[id]) fails.push({ prop: 'P7s-canonical-changed', detail: id.slice(0, 8) }); if (!V.versions[id] && V.aliases && V.aliases[id] && V.versions[V.aliases[id]]) fails.push({ prop: 'P7a-alias-resolved', detail: id.slice(0, 8) + '->' + V.aliases[id].slice(0, 8) });
    if (!V.versions[id] && !(V.aliases && V.aliases[id] && V.versions[V.aliases[id]])) {
      // legitimate: every root that defined the id is void (beyond a removal's cut-off) or unbacked at the end (5.1: its lines are void)
      const rts = (w.seenRoots && w.seenRoots[id]) || [];
      const anchorVoid = rts.some((r) => sha(C + '|v|' + r) === id && (out.void.includes(r) || out.parked.includes(r) || V.unbacked.includes(r) || !pool.has(r)));
      const gone = anchorVoid || rts.length && rts.every((r) => out.void.includes(r) || out.parked.includes(r) || V.unbacked.includes(r) || !pool.has(r));
      const relVoided = rts.length === 1 && sha(C + '|' + rts[0] + '|tail') === id && [...pool.values()].some((r) => r.kind === 'released' && r.body.takeover === rts[0] && out.void.includes(r.id));
      const relGone = !!(w.seenRel && w.seenRel[id]) && (!pool.has(w.seenRel[id]) || out.void.includes(w.seenRel[id]));
      const tailGone0 = (relVoided || relGone) && true;
      const winnerGone = rts.length === 1 && sha(C + '|' + rts[0] + '|tail') === id && (V.status[rts[0]] === 'host' || lineageOf({ pool }, V).has(rts[0]));
      const tailGone = rts.length === 1 && V.tails.some((t) => t.entry === rts[0] && t.fate === 'removed-with-version' && sha(C + '|' + t.entry + '|tail') === id);
      if (winnerGone) fails.push({ prop: 'P7w-tail-winner-later-void', detail: id.slice(0, 8) }); else if (tailGone0 && !gone) fails.push({ prop: 'P7v-id-void-by-removal', detail: id.slice(0, 8) }); else if (tailGone) fails.push({ prop: 'P7d-tail-deleted-with-chat', detail: id.slice(0, 8) }); else if (gone) fails.push({ prop: 'P7v-id-void-by-removal', detail: id.slice(0, 8) }); else fails.push({ prop: 'P7-id-vanished', detail: id.slice(0, 8) });
    } }
  // P3 no finished reply discarded
  if (V && !V.versions[V.main].deleted) {
    const A = new Set();
    for (const [vid, v] of Object.entries(V.versions)) if (v.host && v.host !== 'pending') { const hd = w.devs[Number(v.host.slice(1))]; for (const l of hd.chain) A.add(l.id); }
    // a version whose host was removed still has its lines on every remaining device that holds the version's head
    for (const v of Object.values(V.versions)) if (v.host === null && v.hostEntry) { const ref = w.snaps[v.hostEntry] || []; for (const d of act) if (!out._removed(d.id) && ref.every((id, i) => d.chain[i] && d.chain[i].id === id)) for (const l of d.chain) A.add(l.id); }
    for (const [eid, st] of Object.entries(w.snaps)) { if (V.relVoid[eid] || out.void.includes(eid) || !pool.has(eid)) continue; for (const id of st) A.add(id); }
    for (const t of V.tails) if (t.fate === 'version' && t.release) for (const id of (w.relSnaps[t.release] || [])) A.add(id);
    for (const r of w.replies) {
      if (A.has(r.id)) continue;
      if (out.void.includes(r.E) || V.unbacked.includes(r.E)) continue;                      // writer's host entry itself void (beyond removal cut-off)
      // a reply that only a removed device ever held is void by design; one a remaining device holds must be accounted for
      const heldByRemaining = act.some((d) => !out._removed(d.id) && out.members[d.id] === 'member' && (d.chain.some((l) => l.id === r.id) || Object.values(d.tails).some((tl) => tl.some((l) => l.id === r.id)) || Object.values(d.lost || {}).some((tl) => tl.some((l) => l.id === r.id))));
      if (!heldByRemaining) continue;
      const fate = V.tails.filter((t) => t.owner === r.w || t.entry === r.E);
      fails.push({ prop: 'P3-reply-lost', detail: `reply ${r.id} (writer ${r.w}, pos ${r.p}) not in any version; tails: ${JSON.stringify(fate.map((t) => [t.fate, t.owner, t.loser]))}` });
    }
  }
  return fails;
}

// ---------- generator ----------
export function gen(seed, opts = {}) {
  const rng = mulberry(seed); const ri = (n) => Math.floor(rng() * n);
  const n = opts.n || (opts.wide ? 2 + ri(4) : 3 + ri(3));
  const cfg = {
    n, skews: [0, DAY, 30 * DAY, -DAY, 5 * DAY].slice(0, n),
    copies: [null, ['none', 'same', 'longer', 'diff'][ri(4)], ['none', 'same', 'longer', 'diff'][ri(4)]],
    ranHere: [true, rng() < 0.5, rng() < 0.5],
    rules: opts.rules || { loserRelease: false, anyOnBehalf: false, restoreAll: false },
  };
  const evs = []; const len = opts.len || 25 + ri(W0(opts) ? 60 : 40); const P = opts.noRemove ? 0 : 1;
  const W = opts.wide; // T12b: more removals, mutual removals, deletes, restores, takeovers
  const wts = W ? [['sync', 26], ['write', 14], ['takeover', 16], ['release', 5], ['relate', 5], ['part', 6], ['heal', 4], ['rename', 2], ['flag', 1], ['delete', 3], ['restore', 3], ['talk', 1], ['format', 2], ['add', n > 3 ? 4 : 0], ['remove', 7 * P], ['mutual', 4 * P], ['witness', 3 * P], ['onbehalf', 3 * P]] : [['sync', 28], ['write', 14], ['takeover', 12], ['release', 6], ['relate', 6], ['part', 5], ['heal', 4], ['rename', 2], ['flag', 2], ['delete', 1], ['restore', 1], ['talk', 1], ['format', 1], ['add', n > 3 ? 4 : 0], ['remove', 4 * P], ['witness', 3 * P], ['onbehalf', 3 * P]];
  const tot = wts.reduce((s, x) => s + x[1], 0);
  for (let i = 0; i < len; i++) {
    let r = rng() * tot, t = 'sync'; for (const [k, wt] of wts) { if ((r -= wt) < 0) { t = k; break; } }
    const d = ri(n); const ev = { t, d, seed: 1 + ri(1e6) };
    if (t === 'sync') { ev.a = ri(n); ev.b = ri(n); ev.frac = [0.3, 0.7, 1][ri(3)]; ev.lines = rng() < 0.7; }
    if (t === 'write') { ev.k = 1 + ri(3); ev.fin = rng() < 0.75; }
    if (t === 'takeover') ev.why = rng() < 0.4 ? 'chip' : 'off';
    if (t === 'part') { const g = []; for (let k = 0; k < n; k++) g.push(ri(2)); ev.groups = g; }
    if (t === 'rename') ev.v = 'n' + ri(5);
    if (t === 'flag') { ev.name = ['complete', 'star'][ri(2)]; ev.on = rng() < 0.5; }
    if (t === 'talk') ev.on = rng() < 0.5;
    if (t === 'format') ev.v = 1 + ri(4);
    if (t === 'add') ev.n = 3 + ri(Math.max(1, n - 3));
    if (t === 'remove' || t === 'mutual') ev.target = ri(n);
    evs.push(ev);
  }
  return { cfg, events: evs };
}
export function runCase(cfg, events) {
  const w = makeWorld(cfg);
  w.midFails = []; let k = 0;
  for (const ev of events) {
    try { applyEvent(w, ev); } catch (e) { w.notes.push('EXC ' + e.message); throw e; }
    // P1/P5 at every 3rd step on a partial, mid-run pool (a device's own view, parked entries and all)
    if (++k % 3 === 0) {
      const d = w.devs[k % w.devs.length]; if (!d.active) continue;
      const es = [], rs = []; for (const e of d.pool.values()) (isRoster(e) ? rs : es).push(e);
      const o = { stableIds: !!w.cfg.rules.stableIds, formatMax: !!w.cfg.rules.formatMax, roleField: !!w.cfg.rules.roleField, primaryIsChatId: !!w.cfg.rules.primaryIsChatId, parentOwesOnLoss: !!w.cfg.rules.parentOwesOnLoss, restoreAll: !!w.cfg.rules.restoreAll, seenMaximal: !!w.cfg.rules.seenMaximal, literalLosers: !!w.cfg.rules.literalLosers, noOwnerField: !!w.cfg.rules.noOwnerField, naiveCluster: !!w.cfg.rules.naiveCluster, backed: !!w.cfg.rules.backed, witnessEntries: !!w.cfg.rules.witnessEntries, mutateClock: !!w.cfg.rules.mutateClock };
      const base = canon(decide(es, rs, o)); const rng = mulberry(k * 7919);
      const sh = (a) => { const b = [...a, ...a.filter(() => rng() < 0.3)]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
      if (canon(decide(sh(es), sh(rs), o)) !== base) w.midFails.push({ prop: 'P1-permute-midrun', detail: 'step ' + k });
      const sc = (a) => a.map((e) => ({ ...e, at: Math.floor(rng() * 1e12) }));
      if (canon(decide(sc(es), sc(rs), o)) !== base) w.midFails.push({ prop: 'P5-clock-midrun', detail: 'step ' + k });
    }
  }
  const rounds = settle(w);
  return { w, rounds };
}
export function fmtEvent(e) {
  const { t, seed, ...rest } = e; const o = { ...rest }; delete o.seed; return t + ' ' + JSON.stringify(o);
}
