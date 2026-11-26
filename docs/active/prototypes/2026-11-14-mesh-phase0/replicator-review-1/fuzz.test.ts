// Seeded attack fuzz for the replicator, judged by MY OWN oracle (truth = what writers' appendLocal calls returned ok for, plus hostile-device authored lines tracked apart).
import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkWorld, wid, mkline, oracleChain, log, W, chatGroup, signWith, incId, mulberry, repairFrom, type World } from './world';

const SEED0 = Number(process.env.SEED0 ?? 1);
const SEEDS = Number(process.env.SEEDS ?? 10);
const OPS = Number(process.env.OPS ?? 40);
const RES = process.env.REVIEW_RES ?? '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-1/fuzz-results.jsonl';

interface Ver { v: Buffer; chat: string; writer: string; lines: Buffer[]; maybe: Buffer[] | null; hostile?: boolean }
const DEVS = ['A', 'B', 'C'];

async function oneSeed(seed: number): Promise<{ ops: number; violations: Array<{ cat: string; msg: string }>; trail: string[]; stats: Record<string, number> }> {
  const rng = mulberry(seed * 7919 + 13);
  const ri = (n: number): number => Math.floor(rng() * n);
  const pick = <T,>(a: T[]): T => a[ri(a.length)];
  const w = await mkWorld(DEVS, { discoveryMs: 30_000, stallMs: 10_000, withM: true });
  const vers: Ver[] = [];
  const violations: Array<{ cat: string; msg: string }> = [];
  const trail: string[] = []; const stats: Record<string, number> = {};
  const bump = (k: string): void => { stats[k] = (stats[k] ?? 0) + 1; };
  const viol = (cat: string, msg: string): void => { if (!violations.some((x) => x.cat === cat && x.msg === msg)) violations.push({ cat, msg }); };
  const snaps = new Map<string, string>(); // `${dev}/${vhex}` -> snapshot folder
  let ops = 0;
  const addVer = async (writer: string, name: string, parent: { v: Ver; line: number } | null = null): Promise<Ver | null> => {
    const v = wid(`${seed}-${name}`); const chat = `chat-${name}`;
    try {
      const par = parent ? { v: parent.v.v, line: parent.line, hash: oracleChain(parent.v.chat, parent.v.v, parent.v.lines, parent.line), token: `tok-${seed}-${name}` } : null;
      let id = v;
      if (par) { const { deriveForkId } = await import('/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store'); id = deriveForkId(par.v, par.line, par.hash, par.token); }
      const rec: Ver = { v: id, chat, writer, lines: parent ? parent.v.lines.slice(0, parent.line) : [], maybe: null };
      if (parent) { /* child chain seed depends on chat id: a fork keeps the parent's chat id for the seed */ rec.chat = parent.v.chat; }
      await w.devs[writer].rep.createVersion({ version: id, chatId: rec.chat, runtime: 'claude-code', parent: par ? par.v : null, forkLine: par ? par.line : null, forkHash: par ? Buffer.from(par.hash, 'hex') : null, token: par ? par.token : null });
      vers.push(rec); return rec;
    } catch (e) { trail.push(`addVer ${name} failed ${String(e).slice(0, 80)}`); return null; }
  };
  // an append that threw (an injected crash) may or may not be durable: ask the WRITER's own store which, before anything else is appended
  const resolveMaybe = async (vr: Ver): Promise<boolean> => {
    if (!vr.maybe) return true;
    const wn = vr.writer; if (w.devs[wn].down || w.devs[wn].ffs.crashed) return false;
    try {
      const local = await w.current(wn, vr.v); if (!local) return false;
      const h = await w.devs[wn].store.head(local); if (repairFrom(h) !== null) return false;
      if (h.lines === vr.lines.length) { vr.maybe = null; return true; }
      if (h.lines === vr.lines.length + vr.maybe.length) { const rr = await w.devs[wn].store.read(local, 0, vr.lines.length, h.lines); if (rr !== 'evicted' && rr.every((x, i) => x.equals((vr.maybe as Buffer[])[i]))) { vr.lines.push(...vr.maybe); vr.maybe = null; return true; } }
      return false;
    } catch { return false; }
  };
  const live = (n: string): boolean => !w.devs[n].down && !w.devs[n].ffs.crashed;
  const lift = (): void => { for (const n of DEVS) { (w.devs[n].ffs as unknown as { failAt: number }).failAt = 0; w.devs[n].carrier.passFilter = null; (w.devs[n].ffs as unknown as { opts: { enospcFrom?: number } }).opts.enospcFrom = undefined; } w.hub.holdFilter = null; };

  const setRelay = (): void => {
    const pDrop = rng() < 0.5 ? 0 : 0.15, pDup = rng() < 0.5 ? 0 : 0.2, pLate = rng() < 0.5 ? 0 : 0.3;
    for (const n of DEVS) w.devs[n].carrier.passFilter = () => { const r = rng(); if (r < pDrop) return 'drop'; if (r < pDrop + pDup) return 'dup'; if (r < pDrop + pDup + pLate) return 5 + ri(60); return 'deliver'; };
    w.hub.holdFilter = rng() < 0.5 ? null : () => { const r = rng(); return r < 0.04 ? 'drop' : r < 0.12 ? 'dup' : 'store'; };
  };
  const rot = (n: string, vr: Ver): void => {
    // find the version folder(s) for this wire id (any incarnation) and damage a body file: flip, zero a range, or cut
    const root = path.join(w.dirs[n], 'store', 'versions');
    if (!fs.existsSync(root)) return;
    const cands: string[] = [];
    for (let i = 0; i < 4; i++) { const f = path.join(root, incId(vr.v, i).toString('hex')); if (fs.existsSync(f)) for (const x of fs.readdirSync(f)) if (/^body-.*\.bin$/.test(x)) cands.push(path.join(f, x)); }
    if (!cands.length) return;
    const file = pick(cands); const buf = fs.readFileSync(file); if (!buf.length) return;
    const kind = ri(3); const off = ri(buf.length);
    if (kind === 0) buf[off] ^= 0xff; else if (kind === 1) buf.fill(0, off, Math.min(buf.length, off + 1 + ri(40))); else { fs.writeFileSync(file, buf.subarray(0, off)); return; }
    fs.writeFileSync(file, buf); bump('rot');
  };
  const snapshot = (n: string, vr: Ver): void => {
    const src = path.join(w.dirs[n], 'store', 'versions', incId(vr.v, 0).toString('hex')); if (!fs.existsSync(src)) return;
    const dst = path.join(w.base, `snap-${n}-${vr.v.toString('hex').slice(0, 8)}`); fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(src, dst, { recursive: true }); snaps.set(`${n}/${vr.v.toString('hex')}`, dst); bump('snapshot');
  };
  const rollback = (n: string, vr: Ver): void => {
    const dst = snaps.get(`${n}/${vr.v.toString('hex')}`); if (!dst) return;
    const f = path.join(w.dirs[n], 'store', 'versions', incId(vr.v, 0).toString('hex')); if (!fs.existsSync(f)) return;
    fs.rmSync(f, { recursive: true, force: true }); fs.cpSync(dst, f, { recursive: true }); bump('rollback');
  };
  const restart = async (n: string, mutate: 'none' | 'rot' | 'rollback', crash: boolean): Promise<void> => {
    await w.stopDev(n, crash);
    if (mutate === 'rot' && vers.length) rot(n, pick(vers.filter((x) => !x.hostile).length ? vers.filter((x) => !x.hostile) : vers));
    if (mutate === 'rollback' && vers.length) rollback(n, pick(vers));
    await w.startDev(n); bump(crash ? 'crash-restart' : 'restart');
  };

  // genuine head for emulated replay of something M captured (M holds the set secret and reads every frame; here the signature is made with the writer's key to stand for a captured copy)
  const genuine = (vr: Ver, k: number): W.SignedHead => { const hash = Buffer.from(oracleChain(vr.chat, vr.v, vr.lines, k), 'hex'); return { lines: k, hash, sig: signWith(w.ids[vr.writer], W.headMessage(vr.v, k, hash)) }; };
  const mLive = (kind: string, body: unknown, to?: string): void => { w.M!.link.sendLive({ group: W.GROUP_LIVE, kind, body: body as never, ...(to ? { to: w.ids[to].deviceId } : {}) }); };
  const mDur = async (chat: string, body: unknown, to: string): Promise<void> => { await w.M!.link.sendDurable({ group: chatGroup(w.setId, chat), kind: W.KIND_LINES, line: true, to: w.ids[to].deviceId, body: body as never }); };
  const hostile = async (): Promise<void> => {
    const vr = pick(vers); const tgt = pick(DEVS); const k = vr.lines.length; const kind = ri(14); trail.push(`M:${kind}`); bump('M' + kind);
    switch (kind) {
      case 0: if (k >= 1) { const n = 1 + ri(Math.min(3, k)); const g = Array.from({ length: n }, (_, i) => mkline('FORGED', i)); await mDur(vr.chat, W.linesBody({ version: vr.v, from: k - n, lines: g, head: genuine(vr, k) }), tgt); } break;
      case 1: if (k >= 3) { const a = vr.lines.slice(k - 3, k); await mDur(vr.chat, W.linesBody({ version: vr.v, from: k - 3, lines: [a[1], a[0], a[2]], head: genuine(vr, k) }), tgt); } break;
      case 2: if (w.cap.lines.length) { const c = pick(w.cap.lines); await mDur(chatGroupOfChat(vr, c.body.version) ?? vr.chat, W.linesBody(c.body), tgt); } break;
      case 3: { const hv = ri(k + 3); const true_ = oracleChain(vr.chat, vr.v, vr.lines, Math.min(hv, k)); mLive(W.KIND_WANT, W.wantBodyOf({ version: vr.v, haveLines: hv, haveHash: rng() < 0.7 ? Buffer.from(true_, 'hex') : Buffer.alloc(32, 1), through: rng() < 0.5 ? null : ri(k + 3), intro: false }), tgt); break; }
      case 4: { const l = ri(k + 1); const hs = rng() < 0.5 ? Buffer.from(oracleChain(vr.chat, vr.v, vr.lines, l), 'hex') : Buffer.alloc(32, 9); mLive(W.KIND_ACK, W.ackBodyOf({ version: vr.v, lines: l, hash: hs, sig: signWith(w.ids.M, W.ackMessage(w.ids.M.deviceId, vr.v, l, hs)) }), tgt); break; }
      case 5: mLive(W.KIND_NAK, W.nakBodyOf({ version: vr.v, at: ri(k + 2), why: pick(['gap', 'evicted', 'not-a-prefix', 'unavailable', 'disk-full', 'unknown-version'] as const), hashAtYourCount: null }), tgt); break;
      case 6: { const l = ri(k + 6); mLive(W.KIND_HEADS, W.headsBodyOf({ page: 0, of: 1, ask: rng() < 0.3, heads: [{ version: vr.v, lines: l, hash: rng() < 0.4 ? Buffer.from(oracleChain(vr.chat, vr.v, vr.lines, Math.min(l, k)), 'hex') : Buffer.alloc(32, 3), conversationHash: Buffer.alloc(32, 0), stamp: 0, state: pick(['ok', 'refilling', 'damaged'] as const) }] }), tgt); break; }
      case 7: mLive(W.KIND_SUM, W.sumBody({ count: ri(5), digest: Buffer.alloc(32, ri(256)), ask: rng() < 0.5 }), tgt); break;
      case 8: { const body = { version: vr.v, chatId: vr.chat, runtime: 'claude-code' as const, parent: null, forkLine: null, forkHash: null, token: null, writer: w.ids.M.deviceId }; mLive(W.KIND_INTRO, W.introBodyOf({ ...body, sig: signWith(w.ids.M, W.introMessage(body as never)) } as never), tgt); break; }
      case 9: { // a NEW version authored by M, announced and fed to all
        const id = wid(`${seed}-M-${vers.length}`); const chat = `chat-M${vers.length}`;
        const body = { version: id, chatId: chat, runtime: 'claude-code' as const, parent: null, forkLine: null, forkHash: null, token: null, writer: w.ids.M.deviceId };
        mLive(W.KIND_INTRO, W.introBodyOf({ ...body, sig: signWith(w.ids.M, W.introMessage(body as never)) } as never));
        const ls = [mkline('M', 0), mkline('M', 1)]; const hash = Buffer.from(oracleChain(chat, id, ls, 2), 'hex');
        const mv: Ver = { v: id, chat, writer: 'M', lines: ls, maybe: null, hostile: true }; vers.push(mv);
        await w.M!.link.sendDurable({ group: chatGroup(w.setId, chat), kind: W.KIND_LINES, line: true, body: W.linesBody({ version: id, from: 0, lines: ls, head: { lines: 2, hash, sig: signWith(w.ids.M, W.headMessage(id, 2, hash)) } }) });
        break; }
      case 10: if (k >= 1) { // part abuse: out of order, wrong totals, giant claim
        const PART = W.PART_BYTES; const gh = genuine(vr, k); const of = 2 + ri(126); const total = ri(2) ? of * PART - 5 : (of - 1) * PART + 1;
        await mDur(vr.chat, W.linesBody({ version: vr.v, from: k - 1, lines: [Buffer.alloc(PART, 7)], head: gh, part: { index: ri(2) ? 0 : ri(of), of, totalBytes: total } }), tgt); } break;
      case 11: { // a genuine batch, replayed from before: a captured genuine head with the true lines (should be harmless overlap)
        if (k >= 2) { const j = ri(k - 1); await mDur(vr.chat, W.linesBody({ version: vr.v, from: j, lines: vr.lines.slice(j, k), head: genuine(vr, k) }), tgt); } break; }
      case 12: if (k >= 2) { // genuine head but wrong `from` with the same count of lines shifted (base mismatch)
        const n = 1 + ri(Math.min(3, k - 1)); await mDur(vr.chat, W.linesBody({ version: vr.v, from: k - n, lines: vr.lines.slice(k - n - 1, k - 1), head: genuine(vr, k) }), tgt); } break;
      case 13: { // a live frame relabelled into another group
        w.M!.link.sendLive({ group: 'rep.other', kind: W.KIND_WANT, body: W.wantBodyOf({ version: vr.v, haveLines: 0, haveHash: Buffer.from(oracleChain(vr.chat, vr.v, vr.lines, 0), 'hex'), through: null, intro: false }) as never, to: w.ids[tgt].deviceId }); break; }
    }
  };
  const chatGroupOfChat = (vr: Ver, other: Buffer): string | null => { const o = vers.find((x) => x.v.equals(other)); return o ? o.chat : null; };

  // ---------------------------------------------------------------- run
  try {
    const v1 = await addVer('A', 'one'); const v2 = await addVer('B', 'two'); void v1; void v2;
    for (let i = 0; i < OPS; i++) {
      ops++;
      const r = ri(100); let what = ''; if (process.env.TRACE) fs.appendFileSync(process.env.TRACE, `seed ${seed} op ${i} START r=${r}\n`);
      try {
        if (r < 28) { // append by a writer
          const vr = pick(vers.filter((x) => !x.hostile)); const wn = vr.writer; if (!live(wn)) { what = 'append-skip'; }
          else {
            if (vr.maybe && !(await resolveMaybe(vr))) { bump('append-unresolved'); trail.push('append-skip unresolved'); continue; }
            const big = rng() < 0.03; const n = 1 + ri(6);
            const ls = big ? [Buffer.concat([Buffer.from('{"type":"user","message":{"content":"'), Buffer.alloc(700 * 1024 + ri(2000), 0x62), Buffer.from('"}}\n')])] : Array.from({ length: n }, (_, j) => mkline(`${vr.chat}`, vr.lines.length + j, ri(40)));
            what = `append ${wn} ${vr.chat} +${ls.length}${big ? ' BIG' : ''}`;
            try { await w.devs[wn].rep.appendLocal(vr.v, ls); vr.lines.push(...ls); vr.maybe = null; bump('append-ok'); }
            catch (e) { const m = String(e); if (/refilling|version-not-ready|not-the-writer/.test(m)) bump('append-refused'); else { vr.maybe = ls; bump('append-threw'); trail.push('append threw ' + m.slice(0, 80)); } }
          }
        } else if (r < 38) { what = 'elapse'; await w.elapse(ri(2) ? 15_000 : 70_000, 15_000); }
        else if (r < 46) { const n = pick(DEVS); what = `toggle ${n}`; if (!w.devs[n].down) w.devs[n].carrier.online = !w.devs[n].carrier.online; }
        else if (r < 52) { what = 'relay'; if (rng() < 0.4) lift(); else setRelay(); }
        else if (r < 56) { const vr = pick(vers.filter((x) => !x.hostile)); const g = chatGroup(w.setId, vr.chat); what = 'gap'; w.hub.releaseThrough(g, ri(20)); }
        else if (r < 62) { const n = pick(DEVS); what = `restart ${n}`; await restart(n, 'none', rng() < 0.5); }
        else if (r < 66) { const n = pick(DEVS); what = `restart+rot ${n}`; await restart(n, 'rot', true); }
        else if (r < 69) { const n = pick(DEVS); const vr = pick(vers); what = `snapshot ${n}`; if (live(n)) snapshot(n, vr); }
        else if (r < 72) { const n = pick(DEVS); what = `restart+rollback ${n}`; await restart(n, 'rollback', true); }
        else if (r < 77) { const n = pick(DEVS); what = `crashAt ${n}`; if (live(n)) (w.devs[n].ffs as unknown as { failAt: number }).failAt = w.devs[n].ffs.ops + 1 + ri(60); }
        else if (r < 80) { const n = pick(DEVS); what = `enospc ${n}`; if (live(n)) { (w.devs[n].ffs as unknown as { opts: { enospcFrom?: number } }).opts.enospcFrom = w.devs[n].ffs.allocs + ri(8); } }
        else if (r < 82) { const wn = pick(['A', 'B', 'C']); what = `fork by ${wn}`; const par = pick(vers.filter((x) => !x.hostile && x.lines.length >= 2)); if (par && live(wn)) { const lh = await w.devs[wn].store.head((await w.current(wn, par.v)) ?? par.v).catch(() => null); if (lh && lh.lines >= par.lines.length) { const ch = await addVer(wn, `fork${vers.length}`, { v: par, line: Math.max(1, par.lines.length - ri(2)) }); void ch; } } }
        else if (r < 86) { // the store itself declares a copy damaged (set aside); the replicator must recopy it
          const n = pick(DEVS); const vr = pick(vers.filter((x) => !x.hostile)); what = `retire ${n} ${vr.chat}${vr.writer === n ? ' (WRITER)' : ''}`;
          if (live(n) && (vr.writer !== n || process.env.WRITER_RETIRE)) { const local = await w.current(n, vr.v).catch(() => null); if (local) { await w.devs[n].store.setAsideDamaged(local).catch(() => undefined); await w.devs[n].rep.reportCorrupt(vr.v).catch(() => undefined); bump(vr.writer === n ? 'retire-writer' : 'retire-nonwriter'); } }
        }
        else { what = 'hostile'; await hostile(); }
      } catch (e) { bump('op-error'); trail.push(`op ${what} error ${String(e).slice(0, 100)}`); }
      trail.push(what); if (process.env.TRACE) fs.appendFileSync(process.env.TRACE, `seed ${seed} op ${i}: ${what}\n`);
      for (const n of DEVS) if (w.devs[n].ffs.crashed && !w.devs[n].down) { trail.push(`(${n} crashed by injection: restart)`); await restart(n, 'none', true); }
      if (rng() < 0.3) await w.settle().catch(() => undefined);
      if (rng() < 0.3) {
        await w.settle().catch(() => undefined);
        for (const vr of vers.filter((x) => !x.hostile)) for (const n of DEVS) {
          if (!live(n)) continue;
          for (const a of w.devs[n].rep.peerAcks(vr.v)) {
            const hn = DEVS.find((d) => w.ids[d].deviceId.toString('hex') === a.holder); if (!hn || !live(hn)) continue;
            const full = [...vr.lines, ...(vr.maybe ?? [])];
            if (a.lines > full.length || a.hash !== oracleChain(vr.chat, vr.v, full, a.lines)) { viol('SAFETY-ack-not-on-authored-chain(mid-run)', `${n} ack ${hn} ${a.lines} ${vr.chat}`); continue; }
            const hl = await w.current(hn, vr.v).catch(() => null); const hh = hl ? await w.devs[hn].store.head(hl).catch(() => null) : null;
            if (!hh || hh.lines < a.lines) viol('QUIET-ack-for-lines-live-holder-lacks(mid-run)', `${n} reports ${hn} holds ${a.lines} of ${vr.chat}; holder has ${hh ? hh.lines : 0} (steps ${trail.length})`);
          }
        }
      }
    }
    // ---------------------------------------------------------------- final: no faults, everyone up, time passes
    lift();
    for (const n of DEVS) { if (w.devs[n].down || w.devs[n].ffs.crashed) await restart(n, 'none', true); w.devs[n].carrier.online = true; }
    await w.settle().catch(() => undefined);
    for (let i = 0; i < 10; i++) await w.elapse(70_000, 35_000);
    // ---------------------------------------------------------------- audit
    for (const vr of vers) {
      await resolveMaybe(vr);
      const nat = vr.writer === 'M' ? vr.lines : vr.lines;
      // candidate extension when an append threw (it may be durable)
      const accept = (n: string, got: Buffer[]): void => {
        for (let i = 0; i < got.length; i++) {
          let want = nat[i];
          if (!want && vr.maybe && vr.maybe[i - nat.length]) want = vr.maybe[i - nat.length];
          if (!want) { viol('SAFETY-line-beyond-truth', `${n} ${vr.chat} line ${i} exists, nobody authored it`); return; }
          if (!got[i].equals(want)) { viol('SAFETY-line-differs', `${n} ${vr.chat} line ${i} differs from the authored line`); return; }
        }
      };
      const lens: Record<string, number> = {}; const pendingBehind: Array<{ n: string; s: { state: string; reason: string | null }; lines: number }> = [];
      for (const n of DEVS) {
        const local = await w.current(n, vr.v).catch(() => null);
        if (!local) { lens[n] = 0; continue; }
        const h = await w.devs[n].store.head(local);
        const rf = repairFrom(h); const readable = rf ?? h.lines;
        let got: Buffer[] = [];
        if (readable > 0) { const rr = await w.devs[n].store.read(local, 0, 0, readable).catch((e) => { viol('LOUD-read-throws', `${n} ${vr.chat}: ${(e as { code?: string }).code}`); return null; }); if (rr && rr !== 'evicted') got = rr; else if (rr === 'evicted') viol('NOTE-evicted', `${n} ${vr.chat}`); }
        accept(n, got); lens[n] = h.lines;
        const full = [...nat, ...(vr.maybe ?? [])];
        if (got.length && h.hash !== undefined && rf === null && h.lines <= full.length) {
          const want = oracleChain(vr.chat, vr.v, full, h.lines); if (h.hash !== want) viol('SAFETY-head-hash-wrong', `${n} ${vr.chat} head hash is not the chain of the authored lines`);
        }
        const s = await w.devs[n].rep.status(vr.v);
        pendingBehind.push({ n, s, lines: h.lines });
        // acks this device reports: each must be on the authored chain and the holder must really hold that much
        for (const a of w.devs[n].rep.peerAcks(vr.v)) {
          const k = a.lines; const wantH = oracleChain(vr.chat, vr.v, full, Math.min(k, full.length));
          if (k > full.length || a.hash !== wantH) viol('SAFETY-ack-not-on-authored-chain', `${n} reports ack ${a.holder.slice(0, 4)} ${k}`);
          else { const hn = DEVS.find((d) => w.ids[d].deviceId.toString('hex') === a.holder); if (hn) { const hl = await w.current(hn, vr.v).catch(() => null); const hh = hl ? await w.devs[hn].store.head(hl) : null; if (!hh || hh.lines < k) viol('QUIET-ack-for-lines-holder-lacks', `${n} reports ${hn} acked ${k} of ${vr.chat}, holder has ${hh ? hh.lines : 0}`); } }
        }
      }
      for (const b of pendingBehind) {
        if (b.lines >= nat.length || vr.writer === 'M') continue;
        const holderAll = DEVS.some((d) => (lens[d] ?? 0) >= nat.length);
        if (!holderAll) { viol('DATA-LOST-no-device-holds-all', `${vr.chat} truth ${nat.length} lens ${JSON.stringify(lens)}`); continue; }
        if (b.s.state === 'in-sync') viol('QUIET-in-sync-but-behind-truth', `${b.n} ${vr.chat} status in-sync with ${b.lines} of ${nat.length} lines (another device holds all)`);
        const named = ['stuck', 'diverged', 'refilling', 'retired-recopy'].includes(b.s.state);
        viol(named ? 'LOUD-not-converged' : 'UNNAMED-not-converged', `${b.n} ${vr.chat} ${b.lines}/${nat.length} state=${b.s.state}${b.s.reason ? '(' + b.s.reason + ')' : ''}`);
      }
      // all devices equal the same prefix of truth; and equal to each other at the end
      const ls = DEVS.map((n) => lens[n]); if (new Set(ls).size > 1 && vr.writer !== 'M' && DEVS.some((d) => (lens[d] ?? 0) >= nat.length)) viol('DIVERGENT-lengths', `${vr.chat} ${JSON.stringify(lens)}`);
    }
  } catch (e) { viol('HARNESS-error', String(e).slice(0, 200)); }
  if (violations.length && process.env.DIAG) {
    for (const vr of vers.filter((x) => !x.hostile)) for (const n of DEVS) {
      try {
        const s = await w.devs[n].rep.status(vr.v); const local = await w.current(n, vr.v); const h = local ? await w.devs[n].store.head(local) : null;
        trail.push('DIAG ' + n + ' ' + vr.chat + ' ' + JSON.stringify({ status: s, truth: vr.lines.length, head: h ? { lines: h.lines, rb: h.rolledBack, dmg: h.damagedFromLine, partial: h.partial } : null, peers: w.devs[n].rep.peerView(vr.v).map((x) => ({ p: x.peer.slice(0, 4), l: x.lines, st: x.state })), counters: w.devs[n].rep.counters(), down: w.devs[n].down, online: w.devs[n].carrier.online }));
      } catch (e) { trail.push('DIAG error ' + String(e)); }
    }
  }
  await w.stopAll(); w.cleanup();
  return { ops, violations, trail, stats };
}

describe('replicator attack fuzz', () => {
  it(`seeds ${SEED0}..${SEED0 + SEEDS - 1}`, async () => {
    let totalOps = 0; const agg: Record<string, number> = {}; const cats: Record<string, number> = {};
    for (let s = SEED0; s < SEED0 + SEEDS; s++) {
      const r = await oneSeed(s); totalOps += r.ops;
      for (const [k, v] of Object.entries(r.stats)) agg[k] = (agg[k] ?? 0) + v;
      for (const x of r.violations) cats[x.cat] = (cats[x.cat] ?? 0) + 1;
      fs.appendFileSync(RES, JSON.stringify({ seed: s, ops: r.ops, violations: r.violations, trail: r.violations.length ? r.trail.slice(-70) : undefined }) + '\n');
    }
    fs.appendFileSync(RES, JSON.stringify({ summary: true, seeds: [SEED0, SEED0 + SEEDS - 1], totalOps, agg, cats }) + '\n');
  }, 3_600_000);
});
