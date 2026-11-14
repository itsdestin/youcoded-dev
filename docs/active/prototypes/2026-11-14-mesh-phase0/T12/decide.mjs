// T12/T13 throwaway: `decide(entries, roster)` written literally from design 5.1, 5.3, 5.4, 6.2.
// WHY this file exists: the design's control-log rules were written without being executed. Where the
// text is silent or ambiguous, the choice made here is marked "INTERP:" so the report can list it.
// Signatures are stubbed by the `device` / `by` field; ids are SHA-256 of canonical content.
import { createHash } from 'node:crypto';

export const sha = (s) => createHash('sha256').update(s).digest('hex');
const sk = (o) => Array.isArray(o) ? o.map(sk)
  : (o && typeof o === 'object') ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sk(o[k])])) : o;
export const canon = (o) => JSON.stringify(sk(o));
export const seal = (e) => { const { id, ...rest } = e; rest.seen = [...(rest.seen || [])].sort(); return { ...rest, id: sha(canon(rest)) }; };
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const dedupe = (arr) => { const m = new Map(); for (const e of arr) m.set(e.id, e); return [...m.values()].sort((a, b) => cmp(a.id, b.id)); };
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

export const hostDev = (e) => (e.kind === 'claim' ? e.body.host : e.body.to);
// F7: a takeover may name SEVERAL parents (every host entry it saw standing, e.g. while the chat was `pending`).
export const parentsOf = (e) => (e.kind !== 'takeover' || e.body.parent == null ? [] : Array.isArray(e.body.parent) ? e.body.parent : [e.body.parent]);
export const headOf = (e) => (e.kind === 'claim' ? e.body.head : { segment: e.body.segment, lines: e.body.atLines, hash: e.body.atHash });
const hostKinds = new Set(['claim', 'takeover']);

// opts: { restoreAll } — see report finding (restored names ONE deleted id).
export function decide(entriesIn, rosterIn, opts = {}) {
  // MUTATION (harness self-test only): opts.mutateOrder keeps arrival order instead of sorting by id; P1 must catch it.
  const ded = opts.mutateOrder ? (a) => [...new Map(a.map((e) => [e.id, e])).values()] : dedupe;
  const ctrl = ded(entriesIn);
  const rost = ded(rosterIn);
  // F4: a witness has no `seen` in 6.2, so it cannot be ordered against its signer's own removal. Default here: a witness is
  // ignored when its signer is the target of any other removal. opts.witnessEntries = treat it as an ordinary entry with `seen`
  // (tried; it made removal chains converge WORSE in the fuzz, see report).
  const rEntries = opts.witnessEntries ? rost : rost.filter((r) => r.kind !== 'witness');
  const witnesses = rost.filter((r) => r.kind === 'witness');
  const all = new Map();
  for (const e of ctrl) all.set(e.id, e);
  for (const e of rEntries) all.set(e.id, e);

  // ---- causal order: one DAG over control and roster entries (INTERP: `seen` may name either) ----
  const ancM = new Map();
  const anc = (id) => {
    if (ancM.has(id)) return ancM.get(id);
    const s = new Set(); ancM.set(id, s);
    const e = all.get(id);
    if (e) for (const p of e.seen) if (all.has(p)) { s.add(p); for (const q of anc(p)) s.add(q); }
    return s;
  };
  const before = (a, b) => anc(b).has(a);
  const signerOf = (e) => (e.by !== undefined ? e.by : e.device);

  const adds = rEntries.filter((r) => r.kind === 'add');
  const removes = rEntries.filter((r) => r.kind === 'remove');

  let voidSet = new Set(); let known = new Set(); let eff = []; const voidWhy = new Map();
  let cutMemo = new Map();

  // F4: a witness has no `seen`, so it cannot be ordered against a later removal of its own signer. INTERP: it counts only
  // while its signer is not itself removed (opts.anyWitness = count it regardless, the literal reading).
  const witnessOk = (w, R) => known.has(w.device) && w.device !== R.device && (opts.witnessEntries ? !voidSet.has(w.id) : !removes.some((E) => E.device === w.device && E.id !== R.id));
  const computeKnown = (vs) => {
    const k = new Set(); let ch = true;
    const ok = adds.filter((a) => !vs.has(a.id) && a.seen.every((x) => all.has(x)));
    while (ch) {
      ch = false;
      for (const a of ok) {
        if (k.has(a.device)) continue;
        // root = a self-signed add with nothing seen; otherwise the adder must already be known (else parked).
        if ((a.by === a.device && a.seen.length === 0) || k.has(a.by)) { k.add(a.device); ch = true; }
      }
    }
    return k;
  };
  // cut-off = everything in the causal past of any lastEntry named by the removal or a valid witness.
  const cutSet = (R) => {
    if (cutMemo.has(R.id)) return cutMemo.get(R.id);
    const s = new Set(); const heads = [];
    for (const v of Object.values(R.cutoff || {})) heads.push(v.lastEntry);
    for (const w of witnesses) if (w.removal === R.id && witnessOk(w, R))
      for (const v of Object.values(w.held || {})) heads.push(v.lastEntry);
    for (const h of heads) if (all.has(h)) { s.add(h); for (const q of anc(h)) s.add(q); }
    cutMemo.set(R.id, s); return s;
  };
  // INTERP: a device that is removed and then freshly added again is valid from that add on, if the add had seen the removal.
  const readded = (e, R, vs) => adds.some((a) => a.device === R.device && !vs.has(a.id) && anc(a.id).has(R.id) && (a.id === e.id || anc(e.id).has(a.id)));
  const exempt = (e, R, vs) => cutSet(R).has(e.id) || readded(e, R, vs);
  const tenure = (X) => {
    let best = null;
    for (const a of adds) if (a.device === X) { const t = [anc(a.id).size, a.id]; if (!best || t[0] < best[0] || (t[0] === best[0] && t[1] < best[1])) best = t; }
    return best || [1e9, ''];
  };
  // F6 fix (default): removals are decided by dependency, not by tenure order alone. A removal is dead when its signer is
  // removed by an effective removal it is not exempt from. In a cycle (A removes B, B removes C, C removes A -- or the 2-cycle of
  // 5.1) the removal signed by the longest-tenured device stands, is protected, and any removal of its signer is dead.
  // opts.greedyRemovals = the older tenure-order pass ("both stand").
  const effectiveDep = (vs) => {
    const cand = removes.filter((r) => r.seen.every((x) => all.has(x)) && known.has(r.by));
    const advs = (r) => cand.filter((R) => R !== r && R.device === r.by && (!exempt(r, R, vs) || (R.by === r.device && !anc(r.id).has(R.id) && !anc(R.id).has(r.id))));
    const state = new Map(); const prot = []; let left = cand.slice();
    while (left.length) {
      let prog = false;
      for (const r of left) {
        const A = advs(r);
        if (A.every((R) => state.has(R.id))) {
          const dead = A.some((R) => state.get(R.id) === 'eff') || prot.some((p) => p.by === r.device);
          state.set(r.id, dead ? 'dead' : 'eff'); prog = true;
        }
      }
      left = left.filter((r) => !state.has(r.id));
      if (!prog && left.length) {
        left.sort((a, b) => { const ta = tenure(a.by), tb = tenure(b.by); return ta[0] - tb[0] || cmp(ta[1], tb[1]) || cmp(a.id, b.id); });
        const p = left[0]; state.set(p.id, 'eff'); prot.push(p); left = left.slice(1);
      }
    }
    const ef = cand.filter((r) => state.get(r.id) === 'eff'); const gv = new Map(cand.filter((r) => state.get(r.id) === 'dead').map((r) => [r.id, 'dead']));
    return { ef, gv };
  };
  const effective = (vs) => {
    if (opts.dependencyRemovals) return effectiveDep(vs);
    const cand = removes.filter((r) => r.seen.every((x) => all.has(x)) && known.has(r.by));
    cand.sort((a, b) => { const ta = tenure(a.by), tb = tenure(b.by); return ta[0] - tb[0] || cmp(ta[1], tb[1]) || cmp(a.id, b.id); });
    const ef = []; const gv = new Map();
    for (const r of cand) {
      let dead = null;
      for (const R of ef) if (R.device === r.by) {
        // INTERP (5.1 "two devices removing each other: the one in the set longer stands"): longer = lower tenure rank (processed first).
        const mutual = R.by === r.device && !anc(r.id).has(R.id) && !anc(R.id).has(r.id);
        if (mutual || !exempt(r, R, vs)) { dead = R.id; break; }
      }
      if (dead) gv.set(r.id, dead); else ef.push(r);
    }
    return { ef, gv };
  };

  // F6 (default): the roster is replayed in ONE deterministic order: removals sorted by (tenure of signer, entry id). Each removal
  // is accepted or dead at its turn, and an accepted removal is final. A removal is dead when its signer is not a member at that
  // point (its add was voided by an earlier-accepted removal) or when an earlier-accepted removal of its signer does not exempt it
  // (that covers the 2-cycle rule of 5.1 and chains such as "A removes B while B removes C"). Without a fixed replay order the
  // membership rules have more than one consistent answer (see report F6, seed 5397) and an iteration picks one arbitrarily.
  const cand = removes.filter((r) => r.seen.every((x) => all.has(x)));
  cand.sort((a, b) => { const ta = tenure(a.by), tb = tenure(b.by); return ta[0] - tb[0] || cmp(ta[1], tb[1]) || cmp(a.id, b.id); });
  eff = []; cutMemo = new Map();
  for (const r of cand) {
    known = computeKnown(voidSet);
    if (!known.has(r.by)) { voidWhy.set(r.id, 'signer-not-member'); continue; }
    const dead = eff.find((R) => R.device === r.by && (!exempt(r, R, voidSet) || (R.by === r.device && !anc(r.id).has(R.id) && !anc(R.id).has(r.id))));
    if (dead) { voidSet.add(r.id); voidWhy.set(r.id, dead.id); continue; }
    eff.push(r);
    for (const e of all.values()) { if (eff.includes(e)) continue; if (signerOf(e) === r.device && !exempt(e, r, voidSet)) { voidSet.add(e.id); voidWhy.set(e.id, r.id); } }
  }
  known = computeKnown(voidSet);
  // informational: effective removals whose signer is itself removed (concurrent removals that both stand)
  const inconsistent = [];
  for (const r of eff) for (const R of eff) if (R !== r && R.device === r.by && !exempt(r, R, voidSet)) inconsistent.push([r.id, R.id]);

  const readyM = new Map();
  const ready = (id) => {
    if (readyM.has(id)) return readyM.get(id);
    readyM.set(id, false);
    const e = all.get(id);
    const ok = !!e && known.has(signerOf(e)) && e.seen.every((x) => all.has(x) && ready(x));
    readyM.set(id, ok); return ok;
  };
  const removedDev = (D) => eff.some((R) => R.device === D && !adds.some((a) => a.device === D && !voidSet.has(a.id) && anc(a.id).has(R.id)));

  const parked = [...all.keys()].filter((id) => !ready(id)).sort();
  const members = {};
  for (const a of adds) members[a.device] = known.has(a.device) ? (removedDev(a.device) ? 'removed' : 'member') : 'unknown';

  // ---- per chat ----
  const chats = {};
  const byChat = new Map();
  for (const e of ctrl) { if (!byChat.has(e.chat)) byChat.set(e.chat, []); byChat.get(e.chat).push(e); }
  for (const [chat, list] of [...byChat].sort((a, b) => cmp(a[0], b[0]))) {
    let cv = list.filter((e) => ready(e.id) && !voidSet.has(e.id));
    // F3 fix (opts.backed): a host entry signed by a REMOVED device only counts if some remaining device says (in the removal's
    // cut-off or its witness) that it holds that entry's head lines. Otherwise the only copy is on the removed device and the
    // entry cannot be related to anything (its `relation` would be void), so the chat would stay `pending` forever.
    const unbacked = [];
    if (opts.backed) {
      // only a device that is still in the set at the end can vouch that a copy exists (a removed device's copy is gone with it)
      const backedBy = (R) => { const s = new Set(); if (!removedDev(R.by)) for (const v of Object.values(R.cutoff || {})) (v.backed || []).forEach((x) => s.add(x));
        for (const w of witnesses) if (w.removal === R.id && witnessOk(w, R) && !removedDev(w.device)) for (const v of Object.values(w.held || {})) (v.backed || []).forEach((x) => s.add(x)); return s; };
      cv = cv.filter((e) => {
        if (!hostKinds.has(e.kind)) return true;
        for (const R of eff) if (R.device === e.device && !readded(e, R, voidSet) && !backedBy(R).has(e.id)) { unbacked.push(e.id); return false; }
        return true;
      });
    }
    const latest = (es) => {
      if (!es.length) return null;
      const mx = es.filter((e) => !es.some((o) => o !== e && before(e.id, o.id)));
      // MUTATION (harness self-test only): opts.mutateClock breaks the tie by the wall clock instead of the id; P5 must catch it.
      if (!opts.mutateOrder) mx.sort((a, b) => (opts.mutateClock ? cmp(a.at, b.at) : 0) || cmp(a.id, b.id)); return mx[0]; // latest wins; concurrent -> lower id
    };
    const rels = new Map();
    for (const r of cv.filter((e) => e.kind === 'relation')) {
      const k = [r.body.a, r.body.b].sort().join('|');
      if (all.has(r.body.a) && all.has(r.body.b) && (!rels.has(k) || r.id < rels.get(k).id)) rels.set(k, r);
    }
    const relOf = (a, b) => rels.get([a, b].sort().join('|'));
    const entryVersion = {}; const status = {}; const relVoid = new Map(); // entry -> winner
    const versions = {}; const contradictions = [];
    const hostEntriesAll = cv.filter((e) => hostKinds.has(e.kind));

    // opts.seenMaximal = the literal 5.4 reading ("an entry that had seen another is later"): host candidates are the
    // causally-maximal host entries. Default = lineage tips: host entries no valid takeover names as its `parent`.
    // WHY: with the literal reading, once any later entry has SEEN two concurrent host entries, the split between them
    // (versions, loser's tail) is silently forgotten (report finding F1).
    const maximal = (Hs) => {
      if (opts.seenMaximal) return Hs.filter((e) => !Hs.some((o) => o !== e && before(e.id, o.id)));
      const par = new Set(Hs.flatMap((h) => parentsOf(h)));
      return Hs.filter((e) => !par.has(e.id));
    };
    const resolveHs = (Hs) => {
      const M = maximal(Hs).sort((a, b) => cmp(a.id, b.id));
      if (M.length === 0) return { none: true };
      if (M.length === 1) return { clusters: [{ entries: M, host: M[0], losers: [] }], M };
      for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) if (!relOf(M[i].id, M[j].id)) {
        const rest = Hs.filter((h) => !M.includes(h) && M.some((m) => parentsOf(m).includes(h.id)));
        const lk = latest(rest);
        return { pending: true, M, lastKnown: lk ? hostDev(lk) : null };
      }
      const key = (e) => { const h = headOf(e); return [Number(h.segment), h.lines]; };
      const lt = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
      // tie order for identical copies: a `claim` marked ranHere first, then the lower entry id.
      const rank = (e) => [e.kind === 'claim' && e.body.ranHere ? 0 : 1, e.id];
      const better = (y, x) => { const a = rank(y), b = rank(x); return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]); };
      let clusters = [];
      if (opts.naiveCluster) {
        // the literal pairwise reading: "prefix" links join entries into one chat (transitively)
        const par = new Map(M.map((m) => [m.id, m.id])); const find = (x) => (par.get(x) === x ? x : (par.set(x, find(par.get(x))), par.get(x)));
        for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) if (relOf(M[i].id, M[j].id).body.prefix) par.set(find(M[i].id), find(M[j].id));
        const groups = new Map();
        for (const m of M) { const r = find(m.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(m); }
        for (const g of groups.values()) {
          for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (!relOf(g[i].id, g[j].id).body.prefix) contradictions.push([g[i].id, g[j].id]);
          const mx = g.reduce((m, e) => (lt(m, key(e)) ? key(e) : m), [-1, -1]);
          const top = g.filter((e) => !lt(key(e), mx) && !lt(mx, key(e)));
          const host = top.slice().sort((a, b) => (better(a, b) ? -1 : 1))[0];
          clusters.push({ entries: g, host, losers: g.filter((e) => e !== host) });
        }
      } else {
        // INTERP (fix): a copy is absorbed only by a copy it is a prefix of (or an identical, better-ranked one).
        // Every copy that is NOT a prefix of another is its own version. Pairwise-"prefix" is not transitive across versions.
        const dom = (y, x) => { if (y === x) return false; const r = relOf(x.id, y.id); if (!r.body.prefix) return false;
          const kx = key(x), ky = key(y); return lt(kx, ky) || (!lt(ky, kx) && better(y, x)); };
        const top = M.filter((x) => !M.some((y) => dom(y, x)));
        const absorbed = M.filter((x) => !top.includes(x));
        for (const t of top) clusters.push({ entries: [t], host: t, losers: [] });
        for (const x of absorbed) { const doms = top.filter((t) => dom(t, x) || M.some((y) => dom(y, x) && dom(t, y))).sort((a, b) => cmp(a.id, b.id)); const c = clusters.find((q) => q.host === (doms[0] || top[0])); c.entries.push(x); c.losers.push(x); }
      }
      // INTERP: with 3+ clusters "the lower entry id keeps the chat id" is read as: the cluster whose HOSTING entry has the lowest id.
      clusters.sort((a, b) => cmp(a.host.id, b.host.id));
      return { clusters, M };
    };

    const queue = [[chat, null]];
    while (queue.length) {
      const [V, seeds] = queue.shift();
      const labeled = hostEntriesAll.filter((e) => e.version === V);
      const Hs = dedupe([...(seeds || []), ...labeled]);
      for (const h of Hs) if (!(h.id in entryVersion) || seeds === null) entryVersion[h.id] = V;
      const res = resolveHs(Hs);
      const info = { host: null, hostEntry: null, pending: false };
      if (res.none) { /* no host entries */ }
      else if (res.pending) { info.host = 'pending'; info.pending = true; info.candidates = res.M.map((m) => m.id); info.lastKnownHost = res.lastKnown; for (const m of res.M) entryVersion[m.id] = V; }
      else {
        const main = res.clusters[0];
        info.hostEntry = main.host.id;
        const hd = hostDev(main.host);
        info.host = removedDev(hd) ? null : hd; if (removedDev(hd)) info.hostRemoved = hd;
        for (const e of main.entries) entryVersion[e.id] = V;
        for (const l of main.losers) relVoid.set(l.id, main.host.id);
        status[main.host.id] = 'host';
        for (const c of res.clusters.slice(1)) {
          const cid = sha(chat + '|' + main.host.id + '|' + c.host.id); // 5.3 "winning host entry | losing host entry"
          for (const e of c.entries) entryVersion[e.id] = cid;
          for (const l of c.losers) relVoid.set(l.id, c.host.id);
          status[c.host.id] = 'host';
          versions[cid] = { fromSplit: [main.host.id, c.host.id], from: V };
          queue.push([cid, c.entries]);
        }
      }
      versions[V] = Object.assign(versions[V] || {}, info);
    }
    for (const id of relVoid.keys()) status[id] = 'loser';

    // ---- attributes, latest-wins per version ----
    const lab = (v, kind) => cv.filter((e) => e.version === v && e.kind === kind);
    const deletedOf = (v) => {
      const ds = lab(v, 'deleted'); const undone = new Set();
      for (const r of lab(v, 'restored')) {
        if (opts.restoreAll) { for (const d of ds) if (before(d.id, r.id)) undone.add(d.id); }
        else if (ds.some((d) => d.id === r.body.deleted) && before(r.body.deleted, r.id)) undone.add(r.body.deleted);
      }
      return ds.some((d) => !undone.has(d.id));
    };
    const attrs = (v) => {
      const flags = {}; const names = [...new Set(lab(v, 'flag').map((f) => f.body.name))].sort();
      for (const n of names) flags[n] = latest(lab(v, 'flag').filter((f) => f.body.name === n)).body.on;
      const nm = latest(lab(v, 'renamed')); const tk = latest(lab(v, 'talk-only')); const fm = latest(lab(v, 'format')); const sg = latest(lab(v, 'segment'));
      return { name: nm ? nm.body.title : null, flags, talkOnly: tk ? tk.body.on : false, minVersion: fm ? fm.body.minAppVersion : null, segment: sg ? sg.body.segment : 0, deleted: deletedOf(v) };
    };

    // ---- tails and fates ----
    const tails = [];
    const addTail = (E, owner, isLoser) => {
      const ver = entryVersion[E.id] || E.version;
      // F5 fix: `released` carries `owner` (whose lines it describes). Without it, a device that is both the author of a losing
      // takeover and the releaser-on-behalf of the old host files two different tails under the same `takeover` id.
      const rs = cv.filter((r) => r.kind === 'released' && r.body.takeover === E.id &&
        (opts.noOwnerField ? (r.device === owner || (r.body.onBehalfOf === owner && r.device !== owner && removedDev(owner)))
          : (r.body.owner === owner && (r.device === owner || removedDev(owner)))));
      let fate; let tv = null; let rel = null;
      if (!rs.length) fate = (E.kind === 'takeover' && E.body.reason === 'chip' && !isLoser) ? 'none' : 'waiting';
      else {
        // INTERP: several valid `released` for one takeover (own + on behalf): the longest tail wins, lower id on a tie.
        rs.sort((a, b) => b.body.tailLines - a.body.tailLines || cmp(a.id, b.id)); rel = rs[0];
        fate = rel.body.tailLines === 0 ? 'none' : rel.body.lastReplyEndInTail == null ? 'unfinished' : 'version';
      }
      if (deletedOf(ver)) { if (fate !== 'none') fate = 'removed-with-version'; }
      else if (fate === 'version') {
        tv = sha(chat + '|' + E.id + '|tail');
        versions[tv] = Object.assign(versions[tv] || {}, { tail: true, from: ver, atLines: headOf(E).lines, upTo: rel.body.lastReplyEndInTail, ...{} });
      }
      tails.push({ entry: E.id, owner, loser: !!isLoser, fate, version: tv, release: rel ? rel.id : null });
    };
    // F2 fix (default): a host entry owes a release when it is NOT on the winning lineage of its version, even if it was never
    // a frontier loser (e.g. it was superseded by a successor that itself lost). Per author only the latest such entry owes.
    // opts.literalLosers = only entries a `relation` voided (what 5.4 literally says).
    const loserSet = new Set(relVoid.keys());
    if (!opts.literalLosers) {
      const lineage = new Set(); const byId = new Map(hostEntriesAll.map((h) => [h.id, h]));
      for (const [id, st] of Object.entries(status)) if (st === 'host') { const st2 = [byId.get(id)]; while (st2.length) { const c = st2.pop(); if (!c || lineage.has(c.id)) continue; lineage.add(c.id); for (const p of parentsOf(c)) st2.push(byId.get(p)); } }
      const pendingV = new Set(Object.entries(versions).filter(([, v]) => v.pending).map(([k]) => k));
      const off = hostEntriesAll.filter((h) => !lineage.has(h.id) && !pendingV.has(entryVersion[h.id]));
      const byAuthor = new Map(); for (const h of off) { const a = hostDev(h); if (!byAuthor.has(a)) byAuthor.set(a, []); byAuthor.get(a).push(h); }
      for (const [a, es] of byAuthor) { void a; const l = latest(es); if (l) loserSet.add(l.id); }
    }
    for (const E of hostEntriesAll) {
      if (loserSet.has(E.id)) addTail(E, hostDev(E), true);
      else if (E.kind === 'takeover') {
        const ps = parentsOf(E);
        if (!ps.length) addTail(E, null, false);
        for (const pid of ps) { const P = all.get(pid); addTail(E, P && hostKinds.has(P.kind) ? hostDev(P) : null, false); }
      }
    }
    tails.sort((a, b) => cmp(a.entry, b.entry) || cmp(String(a.owner), String(b.owner)));
    for (const v of Object.keys(versions)) Object.assign(versions[v], attrs(v));
    // INTERP: a version created by a split inherits nothing from its parent; entries labelled with the parent apply to the parent only.
    chats[chat] = { versions, tails, status, entryVersion, relVoid: Object.fromEntries(relVoid), contradictions, unbacked: unbacked.sort() };
  }

  const out = { chats, parked, void: [...voidSet].sort(), members, inconsistent };
  Object.defineProperty(out, '_ready', { value: ready, enumerable: false });
  Object.defineProperty(out, '_removed', { value: removedDev, enumerable: false });
  Object.defineProperty(out, '_eff', { value: eff, enumerable: false });
  Object.defineProperty(out, '_voidWhy', { value: voidWhy, enumerable: false });
  Object.defineProperty(out, '_known', { value: known, enumerable: false });
  return out;
}
export const decideCanon = (e, r, o) => canon(decide(e, r, o));
