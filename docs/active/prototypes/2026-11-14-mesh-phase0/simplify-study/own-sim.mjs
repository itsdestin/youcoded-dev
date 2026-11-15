// Simplify-study simulator: "one owner per chat; whatever does not fit becomes a copy" (candidates A+B of simplify-study.md).
// Written fresh: T12b's sim.mjs is welded to decide(), which this model deletes. Same spirit: seeded random schedules,
// every device acts only on its OWN beliefs, only the oracle reads ground truth.
//
// usage: node own-sim.mjs --runs N --seed S --mode AB|copyonly|ungated [--lie 0..1] [--mutate nofork|nodedupe|nofence] [--len 60]
//
// MODEL (what it is):
//  - one chat 'X' (copies are new chats with their own ids), 2..5 devices, one relay (honest or lying), direct links.
//  - a chat = array of lines {id, ep (owner epoch when written), w (writer), end (reply finished), kind}.
//  - relay holds per chat: reg {owner, epoch, mark} (compare-and-swap) and the line chain; it accepts lines only
//    from the registered owner, only as an extension of its own chain (the "fence").
//  - a device that finds lines of its own that do not extend the agreed chain keeps them as a COPY chat with a
//    deterministic id (chat ~ first tail line); unfinished (no reply end) tail lines are dropped (design 2.7: "unfinished reply dropped").
//  - Continue here: owner reachable -> hand-over (owner gives everything, no tail); owner unreachable ->
//    in place only if this device holds everything up to the owner's "all sent" mark (mode AB), else "Continue as a copy".
// WHAT IT DOES NOT MODEL: real files/hashes/signatures, Claude Code housekeeping lines (assumed ignored by the
// conversation-chain compare, as T21), several chats at once, relay limits/30-day rules, device removal (see roster-sim.mjs),
// real sleep timing, native vs Claude Code differences, the live lane, extras/project files.
'use strict';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const mulberry = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const lastEnd = (ch) => { for (let i = ch.length - 1; i >= 0; i--) if (ch[i].end) return i + 1; return 0; };
const common = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i].id === b[i].id) i++; return i; };
const isPre = (a, b) => a.length <= b.length && common(a, b) === a.length;
const regBetter = (a, b) => a.epoch > b.epoch || (a.epoch === b.epoch && a.owner < b.owner); // a wins over b: higher epoch; at equal epoch the lower id
const cfBetter = (a, b) => !b || (a && a.epoch > b.epoch);
const deadAgainst = (x, cf) => cf && x.epoch >= cf.epoch && x.anc[cf.epoch] !== cf.owner;  // x descends from a swap the relay refused

export function runOne(seed, opt) {
  const r = mulberry(seed);
  const n = 2 + Math.floor(r() * 4);
  const MODE = opt.mode, MUT = opt.mutate || '';
  const w = { devs: [], link: [], R: { up: true, reg: {}, chain: {}, snap: null }, acked: new Map(), ctr: 0, grants: {}, takes: {},
    st: { stale: 0, inplace: 0, copyOffered: 0, copyUser: 0, copyAuto: 0, partialDropped: 0, doubleGrant: 0, relayFork: 0, handover: 0, handoverAbort: 0, casFail: 0, excused: 0, relayOnlyDestroyed: 0, endOwnerless: 0, endMultiOwner: 0, endOwnerViewsDiffer: 0, terminal: 0, restore: 0, straddle: 0, lieUsed: 0 },
    feat: new Set(), copyCauses: {}, lieP: opt.lie || 0 };
  for (let i = 0; i < n; i++) { w.devs.push({ i, id: 'd' + i, awake: true, online: true, unchecked: false, chats: {}, snaps: {} }); w.link.push(Array(n).fill(false)); }
  const nid = (p) => p + (++w.ctr);
  // start: d0 wrote the first reply; everyone is paired and in sync
  const g = [{ id: nid('l'), ep: 0, w: 'd0', end: true, kind: 'n' }];
  w.acked.set(g[0].id, { excused: false });
  const reg0 = { owner: 'd0', epoch: 0, mark: 1, anc: ['d0'] };
  for (const d of w.devs) d.chats.X = { chain: g.slice(), reg: { ...reg0 } };
  w.R.reg.X = { ...reg0 }; w.R.chain.X = g.slice();

  const up = (d) => w.R.up && d.online && d.awake;
  const snapshot = () => { w.R.snap = { reg: JSON.parse(JSON.stringify(w.R.reg)), chain: JSON.parse(JSON.stringify(w.R.chain)) }; };
  const grant = (c, reg) => { const k = c + '#' + reg.epoch; const s = (w.grants[k] ||= new Set()); s.add(reg.owner); if (s.size > 1) w.st.doubleGrant++; };
  const lie = () => w.lieP > 0 && r() < w.lieP;

  // the relay replaces what it holds for a chat. Honest relay: only ever unfinished lines are dropped. Lying relay may destroy more; lines that
  // ONLY the relay held then are gone for everyone (no design can prevent a relay deleting its own storage): counted, and excused in the oracle.
  function setChain(c, nc) {
    const old = w.R.chain[c] || []; const keep = new Set(nc.map((l) => l.id));
    for (const l of old) if (l.end && !keep.has(l.id) && w.acked.has(l.id) && !w.acked.get(l.id).excused) {
      const onDev = w.devs.some((x) => Object.values(x.chats).some((y) => y.chain.some((z) => z.id === l.id)));
      if (!onDev) { w.acked.get(l.id).excused = true; w.st.relayOnlyDestroyed++; }
    }
    w.R.chain[c] = nc;
  }
  // ---- the one fork rule -------------------------------------------------------------------------------------
  // d holds `s.chain`; the agreed chain is `canon`. Lines of d that do not extend canon become a copy chat (or, if unfinished, are dropped).
  function reconcile(d, c, canon, cause, replace) {
    const s = d.chats[c]; const k = common(s.chain, canon);
    if (k === s.chain.length) { if (canon.length > k) s.chain = canon.slice(); return; }   // d only behind, or equal
    if (k === canon.length && !replace) return;                                              // d's chain extends canon: nothing to fix
    if (MUT === 'nofork') { s.chain = canon.slice(); return; }                               // MUTANT: silently discard the tail
    forkTail(d, c, s.chain, canon, cause);
    s.chain = canon.slice();
  }
  // put the lines of `own` that do not fit `canon` into a copy chat (deterministic id: chat ~ first line of the run). If a copy with that id
  // already exists and has gone its own way, the same rule applies one level down (copy of the copy) - so nothing is ever merged or dropped.
  function forkTail(d, c, own, canon, cause) {
    const k = common(own, canon); const tail = own.slice(k); const e = lastEnd(tail);
    if (e === 0) { if (tail.length) w.st.partialDropped++; return; }                       // only an unfinished reply: dropped by design (2.7)
    const t2 = tail.slice(0, e); const cid = MUT === 'nodedupe' ? nid(c + '~' + d.id + '~') : c + '~' + t2[0].id;
    const cc = (d.chats[cid] ||= { chain: [], reg: { owner: t2[0].w, epoch: 0, mark: -1, anc: [t2[0].w] } });
    const nc = own.slice(0, k).concat(t2);
    const key = cause + (t2.some((l) => l.kind === 't') ? '+terminal' : '');
    if (isPre(cc.chain, nc)) { if (nc.length > cc.chain.length) cc.chain = nc; }
    else if (isPre(nc, cc.chain)) { /* already have a longer run under this id */ }
    else { forkTail(d, cid, nc, cc.chain, 'nested'); }
    if (opt.trace) console.log('  COPY by', d.id, cause, 'id', cid, 'tail', t2.map((l) => l.id + '@' + l.ep + l.w).join(' '));
    w.copyCauses[key] = (w.copyCauses[key] || 0) + 1; w.st.copyAuto++; w.feat.add('copy');
  }
  const mergeReg = (s, reg) => {
    const cf = cfBetter(reg.cfe, s.reg.cfe) ? reg.cfe : s.reg.cfe;
    if (reg.epoch === s.reg.epoch && reg.owner === s.reg.owner) { if (reg.mark > s.reg.mark) s.reg.mark = reg.mark; s.reg.cfe = cf; return; }
    const da = deadAgainst(s.reg, cf), db = deadAgainst(reg, cf);
    let pick; if (da !== db) pick = da ? reg : s.reg; else if (da && db) pick = null; else pick = regBetter(reg, s.reg) ? reg : s.reg;
    if (pick === null) { /* both dead: the relay's own entry is the truth; ask later */ s.reg = { ...s.reg, owner: cf.owner, epoch: cf.epoch, anc: s.reg.anc.slice(0, cf.epoch).concat(cf.owner), mark: -1, cfe: cf }; return; }
    if (pick === reg) s.reg = { ...reg }; s.reg.cfe = cf;
  };
  const confirm = (x) => { x.cfe = { epoch: x.epoch, owner: x.owner }; return x; };

  // ---- relay talks -------------------------------------------------------------------------------------------
  function relayView(c) { // what the relay says (a lying relay may serve an old snapshot; devices never go backwards: mergeReg)
    if (w.lieP > 0 && w.R.snap && w.R.snap.reg[c] && r() < w.lieP / 2) { w.st.lieUsed++; return { reg: w.R.snap.reg[c], chain: w.R.snap.chain[c] }; }
    return { reg: w.R.reg[c], chain: w.R.chain[c] };
  }
  function syncChat(d, c, skipMark) {
    if (!up(d)) return;
    const s = d.chats[c]; const R = w.R; const rv = relayView(c);
    if (!rv.reg) { if (s.reg.owner === d.id) { R.reg[c] = confirm({ ...s.reg }); confirm(s.reg); setChain(c, s.chain.slice()); grant(c, s.reg); } return; } // create (new chat id)
    if (s.reg.owner === d.id) {
      const cur = R.reg[c];
      if (cur.owner === d.id && cur.epoch === s.reg.epoch) {                // normal: I am the registered owner
        if (isPre(R.chain[c], s.chain) || (w.lieP > 0 && lie())) {
          if (!isPre(R.chain[c], s.chain)) w.st.relayFork++;
          setChain(c, s.chain.slice());
          if (!skipMark && s.chain.length && s.chain[s.chain.length - 1].end) { cur.mark = s.chain.length; s.reg.mark = cur.mark; }
        } else { reconcile(d, c, R.chain[c], 'relay'); mergeReg(s, cur); }   // relay has lines I lack / mine do not extend: I do not hold the agreed chain
      } else if (s.reg.epoch > cur.epoch && s.reg.anc[cur.epoch] === cur.owner) { // I took over while offline: swap my entry in
        const okChain = common(R.chain[c], s.chain) >= lastEnd(R.chain[c]);   // relay may hold only an unfinished reply that I do not
        if ((okChain && s.reg.mark !== -2) || (w.lieP > 0 && lie())) {
          if (!okChain) w.st.relayFork++;
          if (cur.epoch + 1 === s.reg.epoch && cur.owner !== d.id) { /* cas ok */ }
          grant(c, s.reg); R.reg[c] = confirm({ owner: d.id, epoch: s.reg.epoch, mark: -1, anc: s.reg.anc }); confirm(s.reg); setChain(c, s.chain.slice()); s.reg.mark = -1;
          if (s.chain.length && s.chain[s.chain.length - 1].end) { R.reg[c].mark = s.chain.length; s.reg.mark = s.chain.length; }
        } else { w.st.casFail++; s.reg = { ...cur }; reconcile(d, c, R.chain[c], 'cas-lost'); }
      } else { w.st.casFail++; s.reg = { ...cur }; reconcile(d, c, R.chain[c], 'lost-ownership'); } // someone else owns it now (or epoch skipped)
    } else {                                                                 // watcher: fetch
      const behind = rv.reg.epoch < s.reg.epoch && s.reg.anc[rv.reg.epoch] === rv.reg.owner;   // the relay has not yet heard of a hand-over I know about: its chain is simply old
      mergeReg(s, rv.reg);
      if (rv.chain && !(behind && MUT === 'skipbehind')) reconcile(d, c, rv.chain, 'watcher');   // (tried skipping when the relay is behind: it can dead-lock after a restore, so no)
    }
  }
  const syncAll = (d, skipMark) => { if (!up(d)) return; const ids = new Set([...Object.keys(d.chats), ...Object.keys(w.R.reg)]); for (const c of ids) { if (!d.chats[c]) { const rv = relayView(c); if (!rv.reg) continue; d.chats[c] = { chain: [], reg: { ...rv.reg } }; } syncChat(d, c, skipMark); } d.unchecked = false; };

  // ---- peer talks (direct link) ------------------------------------------------------------------------------
  function peer(a, b) {
    if (!a.awake || !b.awake || !w.link[a.i][b.i]) return;
    const ids = new Set([...Object.keys(a.chats), ...Object.keys(b.chats)]);
    for (const c of ids) {
      if (!a.chats[c]) a.chats[c] = { chain: [], reg: { ...b.chats[c].reg } };
      if (!b.chats[c]) b.chats[c] = { chain: [], reg: { ...a.chats[c].reg } };
      const sa = a.chats[c], sb = b.chats[c];
      const ra = { ...sa.reg }, rb = { ...sb.reg }; mergeReg(sa, rb); mergeReg(sb, ra);
      const k = common(sa.chain, sb.chain);
      if (k === sa.chain.length && sb.chain.length > k) sa.chain = sb.chain.slice();
      else if (k === sb.chain.length && sa.chain.length > k) sb.chain = sa.chain.slice();
      else if (k < sa.chain.length && k < sb.chain.length) {                 // diverged: deterministic winner, loser forks
        const la = sa.chain[k], lb = sb.chain[k];
        const anc = sa.reg.anc; const va = anc[la.ep] === la.w, vb = anc[lb.ep] === lb.w;   // a line is valid if its writer owned that epoch in the winning register
        const aWins = va !== vb ? va : la.ep !== lb.ep ? la.ep > lb.ep : la.w !== lb.w ? la.w < lb.w : la.id < lb.id;
        if (aWins) reconcile(b, c, sa.chain, 'peer'); else reconcile(a, c, sb.chain, 'peer');
      }
    }
  }

  // ---- ownership moves -----------------------------------------------------------------------------------------
  function becomeOwner(t, c, epoch, cut) { (w.takes[c] ||= []).push([epoch, t.id]); const s = t.chats[c]; s.chain = s.chain.slice(0, cut); s.reg = { owner: t.id, epoch, mark: -1, anc: s.reg.anc.concat(t.id) }; if (cut && s.chain[cut - 1].end) s.reg.mark = -1; }
  function chip(t) {
    const c = pickChat(t); if (!c) return; const s = t.chats[c]; if (!t.awake || s.reg.owner === t.id) return;
    const upT = up(t);
    if (upT) syncChat(t, c);                                                  // learn the freshest register + lines first
    if (s.reg.owner === t.id) return;
    const o = w.devs[+s.reg.owner.slice(1)];
    const reach = o.awake && !!o.chats[c] && ((upT && up(o)) || w.link[t.i][o.i]);
    let handoverDone = false;
    if (reach && o.chats[c].reg.owner !== o.id) { mergeReg(s, o.chats[c].reg); w.st.handoverAbort++; if (s.reg.owner === t.id) return; }  // the device I thought owned it says "not mine any more": I now know better; treat as unreachable so nobody is ever stuck
    if (reach && o.chats[c].reg.owner === o.id) {                             // hand-over: owner confirms it has sent everything
      const so = o.chats[c];
      const cut = lastEnd(so.chain); const chain = so.chain.slice(0, cut);
      if (upT) { const cur = w.R.reg[c]; if (cur && !(cur.owner === o.id && cur.epoch === so.reg.epoch) && !(w.lieP > 0 && lie())) { w.st.casFail++; syncChat(t, c); return; } }
      reconcile(t, c, chain, 'handover-in', true);                                  // t had nothing of its own beyond (it is a watcher); keeps anything else as a copy
      const nreg = { owner: t.id, epoch: so.reg.epoch + 1, mark: -1, anc: so.reg.anc.concat(t.id) }; (w.takes[c] ||= []).push([nreg.epoch, t.id]);
      so.chain = chain.slice(); so.reg = { ...nreg }; s.reg = { ...nreg }; s.chain = chain.slice();
      if (upT) { grant(c, nreg); w.R.reg[c] = confirm({ ...nreg }); confirm(s.reg); confirm(so.reg); setChain(c, chain.slice()); } // taker publishes (hand-over reads as one swap)
      w.st.handover++; w.feat.add('handover'); return;
    }
    // owner unreachable
    const P = lastEnd(s.chain); let allowed = false;
    if (MODE === 'ungated') allowed = true;
    else if (MODE === 'AB') {
      const known = s.reg; let consistent = true;
      if (upT && w.R.chain[c]) consistent = isPre(w.R.chain[c].slice(0, known.mark), s.chain);
      allowed = known.mark >= 0 && s.chain.length >= known.mark && consistent;
    }
    if (allowed) {
      const ep = s.reg.epoch + 1; let viaRelay = false;
      if (upT) { // swap at the relay
        const cur = w.R.reg[c] || { epoch: s.reg.epoch, owner: s.reg.owner, anc: s.reg.anc }; if (!w.R.reg[c]) setChain(c, []); const ok = (cur.epoch === s.reg.epoch && common(w.R.chain[c], s.chain) >= lastEnd(w.R.chain[c])) || (w.lieP > 0 && lie());
        if (!ok) { w.st.casFail++; syncChat(t, c); return; }
        if (w.lieP > 0 && cur.epoch !== s.reg.epoch) w.st.lieUsed++;
        grant(c, { owner: t.id, epoch: ep }); w.R.reg[c] = confirm({ owner: t.id, epoch: ep, mark: -1, anc: s.reg.anc.concat(t.id) }); setChain(c, s.chain.slice(0, P)); viaRelay = true;
      }
      becomeOwner(t, c, ep, P); if (viaRelay) confirm(t.chats[c].reg); w.st.inplace++; w.feat.add('inplace');
      if (s.chain.length) { /* nothing */ }
      // stale-owner ground truth: the old owner may still be writing
      return;
    }
    // not allowed in place: offer a copy
    w.st.copyOffered++;
    if (r() < 0.75) { const cid = nid(c + '~u' + t.id + '~'); t.chats[cid] = { chain: s.chain.slice(0, P), reg: { owner: t.id, epoch: 0, mark: -1, anc: [t.id] } }; w.st.copyUser++; w.feat.add('copy'); w.feat.add('choice'); }
  }
  const pickChat = (d) => { const ids = Object.keys(d.chats); return ids[Math.floor(r() * ids.length)]; };

  // ---- writes ---------------------------------------------------------------------------------------------------
  function write(d, partial, term) {
    if (!d.awake) return;
    const ids = Object.keys(d.chats).filter((c) => term ? d.chats[c].reg.owner !== d.id : d.chats[c].reg.owner === d.id);
    if (!ids.length) return; const c = ids[Math.floor(r() * ids.length)]; const s = d.chats[c];
    if (!term && up(d) && !d.unchecked && MUT !== 'nofence') { syncChat(d, c); if (s.reg.owner !== d.id) return; } // checks before a reply (the register read)
    const truth = (w.takes[c] || []).some(([f, o]) => o !== d.id && f >= s.reg.epoch);
    if (!term && truth) { if (opt.trace) console.log('  STALE write by', d.id, 'chat', c, 'epoch', s.reg.epoch, JSON.stringify(w.takes[c])); w.st.stale++; w.feat.add('stale'); if (d.unchecked) { w.st.straddle++; w.feat.add('straddle'); } }
    if (term) { w.st.terminal++; w.feat.add('terminal'); }
    if (term) { // the adapter sees the runtime file grow on a device that does not own the chat: the new lines are filed as a copy at once
      const k2 = 1 + Math.floor(r() * 3); const nl = []; for (let j = 0; j < k2; j++) nl.push({ id: nid('l'), ep: s.reg.epoch, w: d.id, end: j === k2 - 1, kind: 't' });
      const cid = c + '~' + nl[0].id; d.chats[cid] = { chain: s.chain.slice(0, lastEnd(s.chain)).concat(nl), reg: { owner: d.id, epoch: 0, mark: -1, anc: [d.id] } };
      w.acked.set(nl[k2 - 1].id, { excused: false }); w.feat.add('copy'); w.st.copyAuto++; w.copyCauses['terminal'] = (w.copyCauses['terminal'] || 0) + 1; return;
    }
    const k = 1 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) {
      const last = j === k - 1; const ln = { id: nid('l'), ep: s.reg.epoch, w: d.id, end: !partial && last, kind: term ? 't' : 'n' };
      s.chain.push(ln); if (ln.end) w.acked.set(ln.id, { excused: false });
    }
    if (!term && up(d) && !d.unchecked) syncChat(d, c, r() < 0.15);          // lines go out as written; sometimes the mark does not land
    if (partial && r() < 0.7) { d.awake = false; d.online = false; }
  }

  // ---- other events ---------------------------------------------------------------------------------------------
  function sleep(d) { if (!d.awake) return; if (up(d) && r() < 0.5) syncAll(d); d.awake = false; d.online = false; }
  function wake(d) { if (d.awake) return; d.awake = true; d.online = r() < 0.7; d.unchecked = true; if (up(d) && r() < 0.6) syncAll(d); }
  function restore(d) {
    const ids = Object.keys(d.snaps).filter((c) => d.chats[c]); if (!ids.length) return; const c = ids[Math.floor(r() * ids.length)];
    const sn = d.snaps[c]; const pick = sn[Math.floor(r() * sn.length)]; const s = d.chats[c];
    const lost = s.chain.slice(pick.len);
    for (const l of lost) if (l.end) { const held = w.devs.some((x) => x !== d && Object.values(x.chats).some((y) => y.chain.some((z) => z.id === l.id))) || Object.values(w.R.chain).some((ch) => ch.some((z) => z.id === l.id)); if (!held) { w.acked.get(l.id).excused = true; w.st.excused++; } }
    s.chain = s.chain.slice(0, pick.len); s.reg = { ...pick.reg }; w.st.restore++; w.feat.add('restore');
  }
  const note = (d) => { for (const [c, s] of Object.entries(d.chats)) (d.snaps[c] ||= []).push({ len: s.chain.length, reg: { ...s.reg } }); };

  const dump = () => w.devs.map((d) => d.id + (d.awake ? '' : 'z') + (d.online ? '' : '-') + ' ' + Object.entries(d.chats).map(([c, s]) => c.slice(0, 8) + '[' + s.chain.map((l) => l.id + (l.end ? '.' : '') + '@' + l.ep + l.w[1]).join(' ') + ']' + s.reg.owner[1] + '@' + s.reg.epoch + 'm' + s.reg.mark).join(' ')).join('\n   ') + '\n   RELAY ' + (w.R.up ? '' : 'DOWN ') + Object.entries(w.R.reg).map(([c, g]) => c.slice(0, 8) + g.owner[1] + '@' + g.epoch + 'm' + g.mark + '[' + (w.R.chain[c] || []).map((l) => l.id + (l.end ? '.' : '')).join(' ') + ']').join(' ');
  // event mix. 'chaos' (default) is deliberately hostile: everything toggles all the time. 'everyday' is a gentle week: mostly writing
  // and syncing, a device sleeps now and then, the relay is rarely down, nobody restores or uses a plain terminal. Cumulative thresholds.
  const MIX = opt.everyday
    ? [['write', 0.30], ['writePartial', 0.31], ['chip', 0.38], ['sleep', 0.46], ['wake', 0.58], ['net', 0.62], ['relayToggle', 0.63], ['link', 0.68], ['sync', 0.90], ['peer', 0.97], ['snapshot', 1.0]]
    : [['write', 0.22], ['writePartial', 0.26], ['chip', 0.34], ['sleep', 0.42], ['wake', 0.50], ['net', 0.58], ['relayToggle', 0.64], ['link', 0.74], ['sync', 0.82], ['peer', 0.90], ['terminal', 0.93], ['restore', 0.95], ['snapshot', 0.97], ['check', 1.0]];
  function step() {
    const d = w.devs[Math.floor(r() * n)]; const x = r(); const nm = MIX.find(([, th]) => x < th)[0];
    if (nm === 'write') write(d, false, false);
    else if (nm === 'writePartial') write(d, true, false);
    else if (nm === 'chip') chip(d);
    else if (nm === 'sleep') sleep(d);
    else if (nm === 'wake') wake(d);
    else if (nm === 'net') d.online = !d.online;
    else if (nm === 'relayToggle') { w.R.up = !w.R.up; if (w.R.up && r() < 0.5) snapshot(); }
    else if (nm === 'link') { const e = w.devs[Math.floor(r() * n)]; if (e !== d) { w.link[d.i][e.i] = w.link[e.i][d.i] = !w.link[d.i][e.i]; } }
    else if (nm === 'sync') { syncAll(d); note(d); }
    else if (nm === 'peer') { const e = w.devs[Math.floor(r() * n)]; if (e !== d) { peer(d, e); note(d); note(e); } }
    else if (nm === 'terminal') { if (!opt.noterminal) write(d, false, true); }
    else if (nm === 'restore') { if (opt.restores) restore(d); }
    else if (nm === 'snapshot') snapshot();
    else d.unchecked = false;
    if (opt.trace) console.log(nm, d.id, '\n   ' + dump());
    // step invariant: no finished reply ever vanishes from everything (all holders + relay)
    if (opt.stepcheck) { for (const [id, a] of w.acked) if (!a.excused && !held(id)) return { lostLive: id }; }
  }
  const held = (id) => w.devs.some((x) => Object.values(x.chats).some((y) => y.chain.some((z) => z.id === id))) || Object.values(w.R.chain).some((ch) => ch.some((z) => z.id === id));

  const len = opt.len || 60; let bad = null;
  for (let i = 0; i < len && !bad; i++) { const o = step(); if (o && o.lostLive) bad = { prop: 'P0-live-loss', id: o.lostLive }; }

  // ---- heal: relay honest and up, everybody awake, everybody linked ---------------------------------------------
  w.lieP = 0; w.R.up = true; w.R.snap = null;
  for (const d of w.devs) { d.awake = true; d.online = true; d.unchecked = false; for (const e of w.devs) if (e !== d) w.link[d.i][e.i] = true; }
  const sig = () => JSON.stringify([w.devs.map((d) => Object.entries(d.chats).sort().map(([c, s]) => [c, s.chain.map((l) => l.id).join(','), s.reg.owner, s.reg.epoch]))]);
  let prev = '', rounds = 0;
  for (; rounds < 12; rounds++) {
    for (const d of w.devs) syncAll(d);
    for (const a of w.devs) for (const b of w.devs) if (a !== b) peer(a, b);
    for (const d of w.devs) syncAll(d);
    const s = sig(); if (s === prev) break; prev = s;
  }
  if (opt.trace) console.log('FINAL\n   ' + dump());
  const fails = [];
  if (bad) fails.push(bad);
  if (rounds >= 12) fails.push({ prop: 'P5-no-quiesce' });
  for (const [id, a] of w.acked) {
    if (a.excused) continue;
    for (const d of w.devs) if (!Object.values(d.chats).some((s) => s.chain.some((l) => l.id === id))) { fails.push({ prop: 'P1-reply-lost', id, dev: d.id }); break; }
  }
  const allChats = new Set(); for (const d of w.devs) for (const c of Object.keys(d.chats)) allChats.add(c);
  for (const c of allChats) {
    const base = w.devs.find((d) => d.chats[c]); const ref = base.chats[c].chain.map((l) => l.id).join(',');
    for (const d of w.devs) { const s = d.chats[c]; if (!s || s.chain.map((l) => l.id).join(',') !== ref) { fails.push({ prop: 'P2-not-converged', chat: c }); break; } }
    const claims = w.devs.filter((d) => d.chats[c] && d.chats[c].reg.owner === d.id).length;   // devices that believe they own it
    const owners = new Set(w.devs.map((d) => d.chats[c] && d.chats[c].reg.owner + '@' + d.chats[c].reg.epoch));
    if (opt.lie) { if (claims === 0) w.st.endOwnerless++; else if (claims > 1) w.st.endMultiOwner++; if (owners.size > 1) w.st.endOwnerViewsDiffer++; }
    else if (owners.size > 1 || claims !== 1) fails.push({ prop: 'P3-owner-disagree', chat: c });
  }
  if (!opt.lie && w.st.relayOnlyDestroyed) fails.push({ prop: 'P7-honest-relay-destroyed-data' });
  if (!opt.lie && w.st.doubleGrant) fails.push({ prop: 'P4-double-grant-honest' });
  if (!opt.lie && w.st.relayFork) fails.push({ prop: 'P4b-relay-chain-forked-honest' });
  // explained copies: a copy may only appear if one of the named causes happened in the schedule
  const copies = allChats.size - 1;
  const explained = ['stale', 'terminal', 'restore', 'straddle', 'choice', 'inplace'].concat(opt.strict ? [] : ['handover']).some((f) => w.feat.has(f)) || opt.lie > 0;
  if (copies > 0 && !explained && MODE !== 'ungated') fails.push({ prop: 'P6-unexplained-copy', copies });
  return { fails, staleNoRestore: (w.st.stale > 0 && !w.feat.has('restore')) ? 1 : 0, st: w.st, copies, feat: [...w.feat], causes: w.copyCauses, acked: w.acked.size };
}

if (process.argv[1] && process.argv[1].endsWith('own-sim.mjs')) {
  const runs = +arg('runs', 1000), seed0 = +arg('seed', 1);
  const opt = { mode: arg('mode', 'AB'), lie: +arg('lie', 0), mutate: arg('mutate', ''), len: +arg('len', 60), restores: !process.argv.includes('--norestore'), stepcheck: !process.argv.includes('--nostep'), trace: process.argv.includes('--trace'), noterminal: process.argv.includes('--noterminal'), everyday: process.argv.includes('--everyday'), strict: process.argv.includes('--strict') };
  const tally = {}, first = {}, tot = {}; let staleNoRestore = 0, withCopy = 0, withStale = 0, withInplace = 0, withHand = 0, withCopyOffer = 0, copyChats = 0, takeoverRuns = 0, withLieUsed = 0, withDbl = 0, expl = {};
  for (let s = seed0; s < seed0 + runs; s++) {
    const res = runOne(s, opt);
    staleNoRestore += res.staleNoRestore;
    for (const [k, v] of Object.entries(res.st)) tot[k] = (tot[k] || 0) + v;
    if (res.copies) { withCopy++; copyChats += res.copies; }
    if (res.st.stale) withStale++; if (res.st.inplace) withInplace++; if (res.st.handover) withHand++; if (res.st.copyOffered) withCopyOffer++; if (res.st.inplace || res.st.handover) takeoverRuns++;
    if (res.st.doubleGrant) withDbl++; if (res.st.lieUsed || res.st.relayFork) withLieUsed++;
    for (const [k, v] of Object.entries(res.causes)) expl[k] = (expl[k] || 0) + 1;
    const seen = new Set(); for (const f of res.fails) if (!seen.has(f.prop)) { seen.add(f.prop); tally[f.prop] = (tally[f.prop] || 0) + 1; (first[f.prop] ||= []).push(s); }
  }
  console.log(JSON.stringify({ runs, seed0, opt, schedulesWith: { anyCopy: withCopy, staleOwnerWrite: withStale, inPlaceTakeover: withInplace, handover: withHand, copyOfferedToUser: withCopyOffer, someTakeover: takeoverRuns, doubleGrant: withDbl, lyingRelayEffect: withLieUsed, staleOwnerWriteWithoutRestore: staleNoRestore }, copyChatsTotal: copyChats, totals: tot, copyCauseSchedules: expl, failuresByProperty: tally }, null, 1));
  for (const [k, v] of Object.entries(first)) console.log(k, 'first seeds:', JSON.stringify(v.slice(0, 10)));
}
