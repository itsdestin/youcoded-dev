// Review 2 attack fuzz. ORACLE (mine): a LEDGER of authored lines. Every line carries a token "<version-name>#<index>#<nonce>". A line may sit on an honest device only if (a) its token index equals its
// position, (b) the token is in the ledger for that (version-or-ancestor, index) as acked-by-writer or maybe-acked (append threw), never a hostile/forged token. Writers appending at a wrong position
// is checked at ack time. Status honesty is audited at CHECKPOINTS (heal network, everyone online, 3 virtual minutes), where `in-sync` is allowed only if every honest device holds identical lines.
// Sticky faults must stay faulted for the life of a store folder. Acks listed must be true of the holder's store.
import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkWorld, wid, log, W, chatGroup, signWith, incId, mulberry, repairFrom, oracleChain, type World } from './world';

const SEED0 = Number(process.env.SEED0 ?? 1), SEEDS = Number(process.env.SEEDS ?? 5), OPS = Number(process.env.OPS ?? 60);
const RES = process.env.RES ?? '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-2/fuzz-results.jsonl';
const DEVS = ['A', 'B', 'C']; const SAFE = process.env.SAFE === '1'; // SAFE: C writes nothing; folder rollbacks / own-record rot happen only on C (a non-writer), so a quiet result cannot be blamed on a writer losing its own history
interface Ver { v: Buffer; name: string; chat: string; writer: string; parent: Ver | null; forkLine: number; acked: Map<number, Set<string>>; maybe: Map<number, Set<string>>; n: number; doubled: boolean; tainted: string[]; hostile?: boolean }
const tokOf = (b: Buffer): { name: string; idx: number; nonce: string } | null => { try { const c = JSON.parse(b.toString('utf8')).message.content as string; const m = /^(\S+)#(\d+)#(\S+)/.exec(c); return m ? { name: m[1], idx: Number(m[2]), nonce: m[3] } : null; } catch { return null; } };
const mk = (name: string, idx: number, nonce: string, pad: number): Buffer => Buffer.from(`${JSON.stringify({ type: idx % 2 ? 'assistant' : 'user', message: { content: `${name}#${idx}#${nonce} ${'x'.repeat(pad)}` } })}\n`);

async function oneSeed(seed: number) {
  const rng = mulberry(seed * 104729 + 7); const ri = (n: number): number => Math.floor(rng() * n); const pick = <T,>(a: T[]): T => a[ri(a.length)];
  const w = await mkWorld(DEVS, { discoveryMs: 30_000, stallMs: 10_000, withM: true });
  const vers: Ver[] = []; const viol = new Map<string, string>(); const excused = new Map<string, number>(); const stats: Record<string, number> = {}; const trail: string[] = [];
  const bump = (k: string): void => { stats[k] = (stats[k] ?? 0) + 1; }; const V = (cat: string, msg: string): void => { if (!viol.has(cat + msg)) viol.set(cat + msg, `${cat}: ${msg}`); };
  const exc = (k: string): void => { excused.set(k, (excused.get(k) ?? 0) + 1); };
  const live = (n: string): boolean => !w.devs[n].down && !w.devs[n].ffs.crashed;
  const faultSeen = new Map<string, string>(); // `${dev}/${ver}` -> reason, cleared when that device's store folder was restored/rotted away
  const snaps = new Map<string, string>(); let ops = 0, nonce = 0;
  const addVer = async (writer: string, name: string, parent: { v: Ver; line: number } | null = null): Promise<Ver | null> => {
    try {
      let id = wid(`${seed}-${name}`); let par: { v: Buffer; line: number; hash: string; token: string } | null = null;
      if (parent) { const hash = oracleChain(parent.v.chat, parent.v.v, [], 0); void hash; }
      if (parent) return null; // forks: not driven by this fuzz (see report)
      const rec: Ver = { v: id, name, chat: `c-${name}`, writer, parent: null, forkLine: 0, acked: new Map(), maybe: new Map(), n: 0, doubled: false, tainted: [] };
      await w.devs[writer].rep.createVersion({ version: id, chatId: rec.chat, runtime: 'claude-code', parent: null, forkLine: null, forkHash: null, token: null });
      void par; vers.push(rec); return rec;
    } catch (e) { trail.push('addVer failed ' + String(e).slice(0, 80)); return null; }
  };
  const writerState = async (vr: Ver): Promise<{ lines: number } | null> => { const wn = vr.writer; if (!live(wn)) return null; try { const l = await w.current(wn, vr.v); if (!l) return null; const h = await w.devs[wn].store.head(l); return { lines: h.lines }; } catch { return null; } };
  const append = async (vr: Ver): Promise<void> => {
    const wn = vr.writer; if (!live(wn)) return;
    const before = await writerState(vr); const n = 1 + ri(5);
    const big = rng() < 0.02; const ls: Buffer[] = []; for (let i = 0; i < n; i++) ls.push(mk(vr.name, vr.n + i, `n${nonce++}`, big ? 600_000 : ri(40)));
    // my expected position: vr.n = number of lines the writer has acked (and maybe)
    try {
      const r = await w.devs[wn].rep.appendLocal(vr.v, ls);
      // QUIET CHECK 1: accepted, but at a different position than the ledger says
      if (r.lines !== vr.n + n) { V('QUIET-append-at-wrong-position', `${vr.name}: writer ${wn} accepted a line, ledger expected head ${vr.n + n}, store says ${r.lines} (writer store held ${before?.lines} before; folders restored=${vr.tainted.join(',')})`); vr.doubled = true; }
      for (let i = 0; i < n; i++) { const idx = vr.n + i; const s = vr.acked.get(idx) ?? new Set(); s.add(tokOf(ls[i])!.nonce); vr.acked.set(idx, s); }
      vr.n = Math.max(vr.n + n, r.lines); bump('append-ok');
    } catch (e) {
      const m = String(e); const named = /refus|writer-|version-not-ready|not-the-writer|refilling|line-too-large|faulted/.test(m);
      if (named) { bump('append-refused'); exc('append-refused:' + (/writer-[a-z-]+|refilling|version-not-ready|faulted/.exec(m)?.[0] ?? m.slice(0, 30))); }
      else { bump('append-threw'); trail.push('append threw ' + m.slice(0, 90)); for (let i = 0; i < n; i++) { const idx = vr.n + i; const s = vr.maybe.get(idx) ?? new Set(); s.add(tokOf(ls[i])!.nonce); vr.maybe.set(idx, s); } }
    }
  };
  // after a throw the writer's store tells how much really landed (our ledger resolves position by the store, then the rest is "maybe")
  const resolve = async (vr: Ver): Promise<void> => {
    if (!vr.maybe.size) return; const st = await writerState(vr); if (!st) return;
    const l = await w.current(vr.writer, vr.v); if (!l) return;
    for (let i = vr.n; i < st.lines; i++) { const r = await w.devs[vr.writer].store.read(l, 0, i, i + 1); if (r === 'evicted') return; const t = tokOf(r[0]); if (!t || !(vr.maybe.get(i)?.has(t.nonce))) return; const s = vr.acked.get(i) ?? new Set(); s.add(t.nonce); vr.acked.set(i, s); }
    if (st.lines >= vr.n) vr.n = st.lines; vr.maybe.clear();
  };
  const setRelay = (): void => { const pD = rng() < 0.5 ? 0 : 0.15, pU = rng() < 0.5 ? 0 : 0.2, pL = rng() < 0.5 ? 0 : 0.3; for (const n of DEVS) w.devs[n].carrier.passFilter = () => { const r = rng(); return r < pD ? 'drop' : r < pD + pU ? 'dup' : r < pD + pU + pL ? 5 + ri(60) : 'deliver'; }; w.hub.holdFilter = rng() < 0.5 ? null : () => { const r = rng(); return r < 0.04 ? 'drop' : r < 0.12 ? 'dup' : 'store'; }; };
  const lift = (): void => { for (const n of DEVS) { (w.devs[n].ffs as unknown as { failAt: number }).failAt = 0; w.devs[n].carrier.passFilter = null; (w.devs[n].ffs as unknown as { opts: { enospcFrom?: number } }).opts.enospcFrom = undefined; } w.hub.holdFilter = null; };
  const forgetFaults = (n: string): void => { for (const k of [...faultSeen.keys()]) if (k.startsWith(n + '/')) faultSeen.delete(k); };
  const bodies = (n: string, vr: Ver): string[] => { const out: string[] = []; const root = path.join(w.dirs[n], 'store', 'versions'); if (!fs.existsSync(root)) return out; for (let i = 0; i < 4; i++) { const f = path.join(root, incId(vr.v, i).toString('hex')); if (fs.existsSync(f)) for (const x of fs.readdirSync(f)) if (/^body-.*\.bin$/.test(x)) out.push(path.join(f, x)); } return out; };
  const rot = (n: string, vr: Ver): void => { const c = bodies(n, vr); if (!c.length) return; const file = pick(c); const b = fs.readFileSync(file); if (!b.length) return; const k = ri(3), off = ri(b.length); if (k === 0) b[off] ^= 0xff; else if (k === 1) b.fill(0, off, Math.min(b.length, off + 1 + ri(40))); else { fs.writeFileSync(file, b.subarray(0, off)); bump('rot'); return; } fs.writeFileSync(file, b); bump('rot'); };
  const snap = (n: string, what: 'store' | 'replicator' | 'both'): void => { const to = path.join(w.base, `snap-${n}-${what}`); fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); for (const k of what === 'both' ? ['store', 'replicator'] : [what]) if (fs.existsSync(path.join(w.dirs[n], k))) fs.cpSync(path.join(w.dirs[n], k), path.join(to, k), { recursive: true }); snaps.set(`${n}/${what}`, to); bump('snap-' + what); };
  const restoreSnap = (n: string, what: 'store' | 'replicator' | 'both'): boolean => {
    const from = snaps.get(`${n}/${what}`); if (!from) return false;
    for (const k of what === 'both' ? ['store', 'replicator'] : [what]) { fs.rmSync(path.join(w.dirs[n], k), { recursive: true, force: true }); if (fs.existsSync(path.join(from, k))) fs.cpSync(path.join(from, k), path.join(w.dirs[n], k), { recursive: true }); }
    const lp = path.join(w.dirs[n], 'store', 'LOCK'); if (fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), pid: 2147483646, start: 'dead' }));
    bump('restore-' + what); return true;
  };
  const taint = (n: string, why: string): void => { for (const vr of vers) { if (vr.writer === n) vr.tainted.push(why); } };
  const restartDev = async (n: string, mode: 'none' | 'rot' | 'rb-store' | 'rb-rep' | 'rb-both' | 'rot-own', crash: boolean): Promise<void> => {
    await w.stopDev(n, crash);
    const mine = vers.filter((x) => !x.hostile);
    if (mode === 'rot' && mine.length) { rot(n, pick(mine)); forgetFaults(n); }
    if (mode === 'rb-store' && restoreSnap(n, 'store')) { taint(n, 'store-rolled-back'); forgetFaults(n); }
    if (mode === 'rb-rep' && restoreSnap(n, 'replicator')) { taint(n, 'replicator-rolled-back'); }
    if (mode === 'rb-both' && restoreSnap(n, 'both')) { taint(n, 'both-rolled-back'); forgetFaults(n); }
    if (mode === 'rot-own') { const d = path.join(w.dirs[n], 'replicator', 'own'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const b = fs.readFileSync(p); fs.writeFileSync(p, ri(2) ? b.subarray(0, ri(b.length)) : Buffer.alloc(b.length, 0)); bump('rot-own'); taint(n, 'own-record-rotted'); } }
    await w.startDev(n); bump(crash ? 'crash-restart' : 'restart');
  };
  // ---- hostile M: replay genuine batches it captured; forged lines under a real head; flood; intro race
  const mLive = (kind: string, body: unknown, to?: string): void => { w.M!.link.sendLive({ group: W.GROUP_LIVE, kind, body: body as never, ...(to ? { to: w.ids[to].deviceId } : {}) }); };
  const mDur = async (chat: string, body: unknown, to?: string): Promise<void> => { await w.M!.link.sendDurable({ group: chatGroup(w.setId, chat), kind: W.KIND_LINES, line: true, ...(to ? { to: w.ids[to].deviceId } : {}), body: body as never }); };
  const hostile = async (): Promise<void> => {
    const vr = pick(vers); const tgt = pick(DEVS); const k = ri(6); bump('M' + k);
    const cap = w.cap.lines.filter((c) => c.body.version.equals(vr.v));
    if (k === 0 && cap.length) { await mDur(vr.chat, W.linesBody(pick(cap).body), tgt); }                                   // genuine batch replayed verbatim
    else if (k === 1 && cap.length) { const c = pick(cap).body; if (c.lines.length >= 1) await mDur(vr.chat, W.linesBody({ ...c, from: c.from + 1 > c.head.lines ? c.from : c.from + 1, lines: c.lines.slice(1) }), tgt); } // genuine signed point, thinned lines (chain must fail)
    else if (k === 2 && cap.length) { const c = pick(cap).body; await mDur(pick(vers).chat, W.linesBody(c), tgt); }           // genuine batch into another chat's group
    else if (k === 3) { const body = { version: vr.v, chatId: vr.chat, runtime: 'claude-code' as const, parent: null, forkLine: null, forkHash: null, token: null, writer: w.ids.M.deviceId }; mLive(W.KIND_INTRO, W.introBodyOf({ ...body, sig: signWith(w.ids.M, W.introMessage(body as never)) } as never), tgt); } // conflicting intro, M names itself writer
    else if (k === 4) { for (let i = 0; i < 40; i++) mLive(W.KIND_WANT, W.wantBodyOf({ version: wid(`flood-${i}`), haveLines: 0, haveHash: Buffer.alloc(32), through: null, intro: ri(2) === 0 }), tgt); for (let i = 0; i < 30; i++) mLive(W.KIND_HEADS, W.headsBodyOf({ page: 0, of: 1, ask: true, heads: [{ version: wid(`flood-${i}`), lines: 5, hash: Buffer.alloc(32, 3), conversationHash: Buffer.alloc(32), stamp: 0, state: 'ok' }] }), tgt); bump('flood'); }
    else if (k === 5) { // M lies about holding MORE lines than the writer, same version, to the writer
      mLive(W.KIND_HEADS, W.headsBodyOf({ page: 0, of: 1, ask: false, heads: [{ version: vr.v, lines: vr.n + 3, hash: Buffer.alloc(32, 5), conversationHash: Buffer.alloc(32), stamp: 0, state: 'ok' }] }), vr.writer); bump('M-liar-heads');
    }
  };
  // ---- audit at a checkpoint
  const audit = async (stage: string): Promise<void> => {
    const honest = DEVS.filter(live);
    const holds = new Map<string, { n: string; lines: number; hash: string; got: Buffer[] | null }[]>();
    for (const vr of vers) {
      const arr: { n: string; lines: number; hash: string; got: Buffer[] | null }[] = [];
      for (const n of honest) {
        const local = await w.current(n, vr.v).catch(() => null); if (!local) { arr.push({ n, lines: 0, hash: '', got: [] }); continue; }
        const h = await w.devs[n].store.head(local); const rf = repairFrom(h); const readable = rf ?? h.lines; let got: Buffer[] | null = [];
        if (readable > 0) { const rr = await w.devs[n].store.read(local, 0, 0, readable).catch(() => 'throws' as const); got = rr === 'throws' || rr === 'evicted' ? null : rr; }
        arr.push({ n, lines: h.lines, hash: h.hash, got });
        // O1/O2: every line is authored and at its position
        if (got) for (let i = 0; i < got.length; i++) {
          const t = tokOf(got[i]); if (!t) { V('SAFETY-unauthored-line', `${stage} ${n}/${vr.name} pos ${i} carries no author token`); break; }
          if (t.idx !== i) { V('SAFETY-line-at-wrong-position', `${stage} ${n}/${vr.name} pos ${i} holds the line authored for ${t.idx}`); break; }
          let owner: Ver | undefined = vers.find((x) => x.name === t.name); if (!owner) { V('SAFETY-unauthored-line', `${stage} ${n}/${vr.name} pos ${i} owner ${t.name}`); break; }
          const ok = owner.acked.get(i)?.has(t.nonce) || owner.maybe.get(i)?.has(t.nonce);
          if (!ok) { V('SAFETY-line-not-in-ledger', `${stage} ${n}/${vr.name} pos ${i} (${t.name}): token not acked/maybe by its writer`); break; }
          if (owner !== vr) V('SAFETY-line-from-another-version', `${stage} ${n}/${vr.name} pos ${i} comes from ${owner.name}`);
        }
      }
      holds.set(vr.name, arr);
      // status honesty
      const sts = await Promise.all(arr.map(async (a) => ({ ...a, s: await w.devs[a.n].rep.status(vr.v) })));
      const distinct = new Set(arr.map((a) => `${a.lines}/${a.hash}`)); const identical = distinct.size === 1;
      for (const a of sts) {
        const key = `${a.n}/${vr.name}`;
        if (a.s.state === 'faulted') faultSeen.set(key, String(a.s.reason));
        else if (faultSeen.has(key)) V('QUIET-fault-went-away', `${stage} ${key} was faulted(${faultSeen.get(key)}) now ${a.s.state}`);
        if (a.s.state === 'in-sync' && !identical) { const det = sts.map((x) => `${x.n}[${x.s.state}${x.s.reason ? '(' + x.s.reason + ')' : ''} ${x.lines}l inc=${x.s.incarnation} peers=${w.devs[x.n].rep.peerView(vr.v).map((p) => p.peer.slice(0, 2) + ':' + p.lines + ':' + p.state).join(',')} writerIsMe=${x.n === vr.writer} desc=${w.devs[x.n].rep.describe(vr.v) ? w.devs[x.n].rep.describe(vr.v)!.writer.toString('hex').slice(0, 2) : 'none'} c=${JSON.stringify(Object.fromEntries(Object.entries(w.devs[x.n].rep.counters()).filter(([k]) => /conflict|fault|stall|held|skip|not-a-prefix|retire|ahead|drop/.test(k))))}]`).join(' ; '); V('QUIET-in-sync-but-devices-differ', `${stage} ${key} says in-sync; holdings ${JSON.stringify(arr.map((x) => `${x.n}:${x.lines}`))} ${vr.doubled ? '(writer reused positions) ' : ''}writer=${vr.writer} DETAIL ${det}`); }
        if (!identical && !['stuck', 'faulted', 'diverged', 'refilling', 'retired-recopy', 'peer-repairing', 'uncomparable'].includes(a.s.state)) exc(`calm-state-while-differing:${a.s.state}${a.s.reason ? '(' + a.s.reason + ')' : ''}`);
      }
      if (identical && !vr.hostile) for (const a of sts) if (a.s.state !== 'in-sync') exc(`identical-but-status:${a.s.state}${a.s.reason ? '(' + a.s.reason + ')' : ''}`);
      // acks: each listed ack must be true of the holder's store
      for (const n of honest) for (const a of w.devs[n].rep.peerAcks(vr.v)) {
        const hn = DEVS.find((d) => w.ids[d].deviceId.toString('hex') === a.holder); if (!hn || !live(hn)) continue;
        const hl = await w.current(hn, vr.v).catch(() => null); let ok = false;
        if (hl) { try { ok = (await w.devs[hn].store.hashAt(hl, 0, a.lines)) === a.hash; } catch { ok = false; } }
        if (!ok) V('QUIET-ack-not-true-of-holder', `${stage} ${n} lists ack ${hn} ${a.lines} of ${vr.name} but the holder's own store has other/none`);
      }
      // liveness: writer's lines never lost: some device holds >= acked
      if (!vr.doubled) { const mx = Math.max(...arr.map((a) => a.lines)); if (mx < vr.n - [...vr.maybe.keys()].length) { const ws = sts.find((a) => a.n === vr.writer)?.s; const named = ws && ['stuck', 'faulted', 'diverged', 'refilling', 'retired-recopy', 'peer-repairing', 'uncomparable'].includes(ws.state); if (named) exc(`LOUD-acked-lines-held-by-nobody:writer-${ws!.state}${ws!.reason ? '(' + ws!.reason + ')' : ''}`); else V('QUIET-DATA-LOST', `${stage} ${vr.name}: acked ${vr.n}, best holder ${mx}, writer status ${ws ? ws.state : 'down'}`); } }
    }
  };
  const checkpoint = async (stage: string): Promise<void> => {
    lift(); for (const n of DEVS) { if (w.devs[n].down || w.devs[n].ffs.crashed) await restartDev(n, 'none', true); w.devs[n].carrier.online = true; }
    await w.settle().catch(() => undefined);
    for (const vr of vers.filter((x) => !x.hostile)) await resolve(vr);
    for (let i = 0; i < 6; i++) await w.elapse(70_000, 35_000);
    await audit(stage); bump('checkpoint');
  };
  try {
    await addVer('A', 'one'); await addVer('B', 'two');
    for (let i = 0; i < OPS; i++) {
      ops++; const r = ri(100); let what = '';
      try {
        if (r < 30) { const vr = pick(vers.filter((x) => !x.hostile)); what = `append ${vr.writer}/${vr.name}`; if (vr.maybe.size) await resolve(vr); if (!vr.maybe.size) await append(vr); }
        else if (r < 38) { what = 'elapse'; await w.elapse(ri(2) ? 15_000 : 70_000, 15_000); }
        else if (r < 44) { const n = pick(DEVS); what = `toggle ${n}`; if (!w.devs[n].down) w.devs[n].carrier.online = !w.devs[n].carrier.online; }
        else if (r < 49) { what = 'relay'; if (rng() < 0.4) lift(); else setRelay(); }
        else if (r < 55) { const n = pick(DEVS); what = `restart ${n}`; await restartDev(n, 'none', rng() < 0.5); }
        else if (r < 58) { const n = pick(DEVS); what = `restart+rot ${n}`; await restartDev(n, 'rot', true); }
        else if (r < 63) { const n = pick(DEVS); what = `snap ${n}`; if (live(n)) snap(n, pick(['store', 'replicator', 'both'] as const)); }
        else if (r < 69) { const n = SAFE ? 'C' : pick(DEVS); what = `rollback ${n}`; await restartDev(n, pick(['rb-store', 'rb-rep', 'rb-both'] as const), true); }
        else if (r < 71) { const n = SAFE ? 'C' : pick(DEVS); what = `rot-own ${n}`; await restartDev(n, 'rot-own', true); }
        else if (r < 75) { const n = pick(DEVS); what = `crashAt ${n}`; if (live(n)) (w.devs[n].ffs as unknown as { failAt: number }).failAt = w.devs[n].ffs.ops + 1 + ri(60); }
        else if (r < 78) { const n = pick(DEVS); what = `enospc ${n}`; if (live(n)) (w.devs[n].ffs as unknown as { opts: { enospcFrom?: number } }).opts.enospcFrom = w.devs[n].ffs.allocs + ri(8); }
        else if (r < 84) { const n = pick(DEVS); const vr = pick(vers.filter((x) => !x.hostile)); what = `set-aside ${n}/${vr.name}${vr.writer === n ? ' (WRITER)' : ''}`; if (live(n)) { const l = await w.current(n, vr.v).catch(() => null); if (l) { await w.devs[n].store.setAsideDamaged(l).catch(() => undefined); await w.devs[n].rep.reportCorrupt(vr.v).catch(() => undefined); bump(vr.writer === n ? 'set-aside-writer' : 'set-aside-nonwriter'); } } }
        else if (r < 87) { what = 'new-version'; const wn = pick(SAFE ? ['A','B'] : DEVS); if (vers.length < 5 && live(wn)) await addVer(wn, `v${vers.length}`); }
        else if (r < 89) { what = 'checkpoint'; await checkpoint(`mid#${i}`); }
        else { what = 'hostile'; await hostile(); }
      } catch (e) { bump('op-error'); trail.push(`op ${what} error ${String(e).slice(0, 100)}`); }
      trail.push(what);
      for (const n of DEVS) if (w.devs[n].ffs.crashed && !w.devs[n].down) await restartDev(n, 'none', true);
      if (rng() < 0.3) await w.settle().catch(() => undefined);
    }
    await checkpoint('final');
  } catch (e) { V('HARNESS-error', String(e).slice(0, 200)); }
  if (viol.size && process.env.DIAG) {
    for (const vr of vers) for (const n of DEVS) { try { const s = await w.devs[n].rep.status(vr.v); const l = await w.current(n, vr.v); const h = l ? await w.devs[n].store.head(l) : null; trail.push('DIAG ' + n + '/' + vr.name + ' writer=' + vr.writer + ' acked=' + vr.n + ' doubled=' + vr.doubled + ' taint=' + vr.tainted.join('+') + ' ' + JSON.stringify({ status: s, head: h ? { lines: h.lines, rb: h.rolledBack, dmg: h.damagedFromLine, partial: h.partial } : null, peers: w.devs[n].rep.peerView(vr.v).map((x) => `${x.peer.slice(0, 4)}:${x.lines}:${x.state}`), c: w.devs[n].rep.counters() })); } catch (e) { trail.push('DIAG err ' + String(e)); } }
  }
  const memMB = Math.round(process.memoryUsage().rss / 1048576);
  await w.stopAll(); w.cleanup();
  return { ops, viol: [...viol.values()], excused: Object.fromEntries(excused), stats, trail: process.env.DIAG ? trail.slice(-60) : trail.slice(-40), memMB };
}
describe('review 2 attack fuzz', () => {
  it(`seeds ${SEED0}..${SEED0 + SEEDS - 1}`, async () => {
    let total = 0; const cats: Record<string, number> = {};
    for (let s = SEED0; s < SEED0 + SEEDS; s++) {
      const t0 = Date.now(); const r = await oneSeed(s); total += r.ops;
      for (const x of r.viol) { const c = x.split(':')[0]; cats[c] = (cats[c] ?? 0) + 1; }
      fs.appendFileSync(RES, JSON.stringify({ seed: s, ops: r.ops, secs: Math.round((Date.now() - t0) / 1000), memMB: r.memMB, viol: r.viol, excused: r.excused, stats: r.stats, trail: r.viol.length ? r.trail : undefined }) + '\n');
    }
    fs.appendFileSync(RES, JSON.stringify({ summary: true, seeds: [SEED0, SEED0 + SEEDS - 1], total, cats }) + '\n');
  }, 7_200_000);
});
