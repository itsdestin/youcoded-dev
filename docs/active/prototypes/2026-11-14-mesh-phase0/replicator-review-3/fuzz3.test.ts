// REVIEW 3 attack fuzz. ORACLE (mine, a POSITION LEDGER):
//  Every line the adapter submits has a unique nonce (text "name|nonce|pad"). When the adapter is told saved/already-saved the ledger records ack[version][position] += nonce, where the position
//  is computed from the EXPECTED head the adapter passed (not from what the replicator answered), and the answer's own head is checked against it.
//  O1  a device holding position i of version V holds a nonce the writer was told saved (or may have been saved: a call that threw/durable-not-recorded) for that exact position of V or of
//      V's ancestor (child positions below the fork line belong to the parent).
//  O1b the writer is told saved for TWO different nonces at one position (history reuse) -> category SAVED-POSITION-REUSED (excused only when the writer restored all three own folders at once,
//      the documented limit; counted).
//  O2  every told-saved line is present on some honest device at the end, unless a NAMED state (faulted/stuck/diverged/refilling) covers that version on every honest device that knows it.
//  O3  `in-sync` on a device only if all honest reachable devices hold identical lines for that version (devices that do not know the version count as holding nothing).
//  O4  every peerAcks entry whose holder is honest must be readable on the holder (hashAt + read last line) at the moment of the audit.
//  O5  calm states (comparing/pulling/serving/in-sync/stale/...) at the end-of-checkpoint while honest devices differ are listed as CALM-STALL with the reason string.
//  O6  a sticky fault never disappears while the device's store+replicator folders were not replaced.
//  O7  every `faulted` is attributed: was any dangerous op (rollback / own-record damage / hostile / rot) applied that could account for it? otherwise FAULT-FROM-ORDINARY-OPS.
import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { mkWorld, mulberry, W, chatGroup, signWith, incId, repairFrom, type World, mkline } from './world3';
import { deriveForkId } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store';
import { deriveRootId } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/directory';

void mkline;
const SEED0 = Number(process.env.SEED0 ?? 1), SEEDS = Number(process.env.SEEDS ?? 3), OPS = Number(process.env.OPS ?? 80);
const RES = process.env.RES ?? '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-3/fuzz-results.jsonl';
const DEVS = ['A', 'B', 'C'];
const FOLDERS = ['store', 'replicator', 'witness'] as const;
const NAMED = ['faulted', 'stuck', 'diverged', 'refilling', 'retired-recopy', 'peer-repairing', 'uncomparable'];

interface Ver { v: Buffer; name: string; chat: string; writer: string; parent: Ver | null; forkLine: number; ack: Map<number, Set<string>>; maybe: Map<number, Set<string>>; head: { lines: number; hash: string } | null; pending: { lines: Buffer[]; nonces: string[]; exp: { lines: number; hash: string }; tries: number } | null; all3: boolean; tainted: string[]; }
const textOf = (b: Buffer): { name: string; nonce: string } | null => { try { const c = JSON.parse(b.toString('utf8')).message.content as string; const m = /^(\S+)\|(\S+)\|/.exec(c); return m ? { name: m[1], nonce: m[2] } : null; } catch { return null; } };

async function oneSeed(seed: number) {
  const rng = mulberry(seed * 7919 + 13); const ri = (n: number): number => Math.floor(rng() * n); const pick = <T,>(a: T[]): T => a[ri(a.length)];
  const w: World & Record<string, any> = await mkWorld(DEVS, { discoveryMs: 30_000, stallMs: 10_000, withM: true, scrub: 30_000 }) as never;
  const vers: Ver[] = []; const viol = new Map<string, string>(); const excused = new Map<string, number>(); const stats: Record<string, number> = {}; const trail: string[] = [];
  const bump = (k: string): void => { stats[k] = (stats[k] ?? 0) + 1; };
  const V = (cat: string, msg: string): void => { if (!viol.has(cat + msg.slice(0, 60))) viol.set(cat + msg.slice(0, 60), `${cat}: ${msg}`); };
  const exc = (k: string): void => { excused.set(k, (excused.get(k) ?? 0) + 1); };
  const live = (n: string): boolean => !w.devs[n].down && !w.devs[n].ffs.crashed;
  let nonce = 0; let ops = 0;
  const faultSeen = new Map<string, string>(); const snaps = new Map<string, string>(); const danger = new Map<string, string[]>(); // device -> dangerous ops applied so far
  const dng = (n: string, what: string): void => { danger.set(n, [...(danger.get(n) ?? []), what]); };

  const localHead = async (n: string, vr: Ver): Promise<{ lines: number; hash: string } | null> => { try { const l = await w.current(n, vr.v); if (!l) return null; const h = await w.devs[n].store.head(l); return { lines: h.lines, hash: h.hash }; } catch { return null; } };
  const addRoot = async (writer: string, name: string): Promise<Ver | null> => {
    try {
      const chat = `c-${name}`; const nn = `${name}-${seed}`; const id = await w.createRoot(writer, chat, nn);
      const vr: Ver = { v: id, name, chat, writer, parent: null, forkLine: 0, ack: new Map(), maybe: new Map(), head: null, pending: null, all3: false, tainted: [] };
      vr.head = await localHead(writer, vr); vers.push(vr); return vr;
    } catch (e) { trail.push('addRoot failed ' + String(e).slice(0, 80)); return null; }
  };
  const addTakeover = async (by: string, parent: Ver): Promise<Ver | null> => {
    try {
      if (!live(by)) return null;
      const l = await w.current(by, parent.v); if (!l) return null; const h = await w.devs[by].store.head(l); if (h.lines === 0 || repairFrom(h) !== null) return null;
      const at = 1 + ri(h.lines); const hash = (await w.devs[by].store.hashAt(l, 0, at)) as string;
      const token = `${w.ids[by].deviceId.toString('hex')}:t${vers.length}-${seed}`; const child = deriveForkId(parent.v, at, hash, token);
      const name = `t${vers.length}`;
      await w.devs[by].rep.createVersion({ version: child, chatId: parent.chat, runtime: 'claude-code', parent: parent.v, forkLine: at, forkHash: Buffer.from(hash, 'hex'), token });
      const vr: Ver = { v: child, name, chat: parent.chat, writer: by, parent, forkLine: at, ack: new Map(), maybe: new Map(), head: null, pending: null, all3: false, tainted: [] };
      // positions below the fork line are the parent's: the child's ledger starts at `at`
      vr.head = await localHead(by, vr); vers.push(vr); bump('takeover'); return vr;
    } catch (e) { trail.push('takeover failed ' + String(e).slice(0, 80)); return null; }
  };
  const mkLine = (vr: Ver, pad: number): { b: Buffer; n: string } => { const n = `n${nonce++}`; return { b: Buffer.from(`${JSON.stringify({ type: 'user', message: { content: `${vr.name}|${n}|${'x'.repeat(pad)}` } })}\n`), n }; };
  const addTo = (m: Map<number, Set<string>>, i: number, n: string): void => { const s = m.get(i) ?? new Set(); s.add(n); m.set(i, s); };

  const append = async (vr: Ver, careless = false): Promise<void> => {
    const wn = vr.writer; if (!live(wn)) return;
    let lines: Buffer[]; let nonces: string[]; let exp: { lines: number; hash: string };
    if (vr.pending) { ({ lines, nonces, exp } = vr.pending); vr.pending.tries++; bump('retry'); }
    else {
      const cur = await localHead(wn, vr); if (!cur) return;
      // the adapter's belief of its head is what it last got back; if it has none (or it is stale) it reads the store head
      const e0 = vr.head ?? cur; exp = e0;
      const n = 1 + ri(4); const big = rng() < 0.02; lines = []; nonces = [];
      for (let i = 0; i < n; i++) { const x = mkLine(vr, big ? 700_000 : ri(40)); lines.push(x.b); nonces.push(x.n); }
    }
    const pos0 = exp.lines;
    try {
      const r = await w.devs[wn].rep.appendLocal(vr.v, lines, careless && !vr.pending ? undefined : exp);
      if (r.result === 'durable-not-recorded') { nonces.forEach((x, i) => addTo(vr.maybe, pos0 + i, x)); vr.pending = { lines, nonces, exp, tries: vr.pending?.tries ?? 0 }; bump('dnr'); return; }
      const posEnd = r.lines;
      if (!careless || vr.pending === null) { if (posEnd !== pos0 + lines.length && !(careless)) V('QUIET-saved-at-other-position', `${vr.name}: told ${r.result} head ${posEnd} but expected ${pos0 + lines.length}`); }
      const base = careless ? posEnd - lines.length : pos0;
      nonces.forEach((x, i) => { const s = vr.ack.get(base + i); if (s && s.size && !s.has(x)) { if (vr.all3 || vr.tainted.length) exc('SAVED-POSITION-REUSED(excused: ' + (vr.all3 ? 'all3' : vr.tainted.join('+')) + ')'); else V('SAVED-POSITION-REUSED', `${vr.name} pos ${base + i} told saved for a second, different line (tainted=${vr.tainted.join('+')} danger=${(danger.get(wn) ?? []).join('+')})`); } addTo(vr.ack, base + i, x); });
      vr.head = { lines: r.lines, hash: r.hash }; vr.pending = null; bump('saved-' + r.result);
    } catch (e) {
      const m = String(e).replace('Error: ', ''); bump('append-threw');
      const named = /writer-[a-z-]+|refilling|version-not-ready|not-the-writer|line-too-large/.exec(m)?.[0];
      if (named === 'line-too-large') return;
      // a throw may still have left the lines durable: positions are "maybe"
      nonces.forEach((x, i) => addTo(vr.maybe, pos0 + i, x));
      vr.pending = { lines, nonces, exp, tries: (vr.pending?.tries ?? 0) };
      exc('append-refused:' + (named ?? m.slice(0, 40)));
      if (named === 'writer-head-moved' || (vr.pending.tries ?? 0) > 3) { // the adapter gives up on these lines and re-reads the store head
        const cur = await localHead(wn, vr); vr.pending = null; vr.head = cur; bump('abandon');
      }
    }
  };

  const setRelay = (): void => { const pD = rng() < 0.5 ? 0 : 0.15, pU = rng() < 0.5 ? 0 : 0.2, pL = rng() < 0.5 ? 0 : 0.3; for (const n of DEVS) w.devs[n].carrier.passFilter = () => { const r = rng(); return r < pD ? 'drop' : r < pD + pU ? 'dup' : r < pD + pU + pL ? 5 + ri(60) : 'deliver'; }; w.hub.holdFilter = rng() < 0.5 ? null : () => { const r = rng(); return r < 0.04 ? 'drop' : r < 0.12 ? 'dup' : 'store'; }; };
  const lift = (): void => { for (const n of DEVS) { w.devs[n].ffs.failAt = 0; w.devs[n].carrier.passFilter = null; w.devs[n].ffs.opts.enospcFrom = undefined; } w.hub.holdFilter = null; };
  const bodies = (n: string, vr: Ver): string[] => { const out: string[] = []; const root = path.join(w.dirs[n], 'store', 'versions'); if (!fs.existsSync(root)) return out; for (let i = 0; i < 4; i++) { const f = path.join(root, incId(vr.v, i).toString('hex')); if (fs.existsSync(f)) for (const x of fs.readdirSync(f)) if (/^body-.*\.bin$/.test(x)) out.push(path.join(f, x)); } return out; };
  const rot = (n: string, vr: Ver): void => { const c = bodies(n, vr); if (!c.length) return; const file = pick(c); const b = fs.readFileSync(file); if (!b.length) return; const k = ri(3), off = ri(b.length); if (k === 0) b[off] ^= 0xff; else if (k === 1) b.fill(0, off, Math.min(b.length, off + 1 + ri(40))); else { fs.writeFileSync(file, b.subarray(0, off)); bump('rot'); return; } fs.writeFileSync(file, b); bump('rot'); };
  const snapFolder = (n: string, f: typeof FOLDERS[number]): void => { const to = path.join(w.base, `snap-${n}-${f}`); fs.rmSync(to, { recursive: true, force: true }); const from = path.join(w.dirs[n], f); if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true }); snaps.set(`${n}/${f}`, to); };
  const restoreFolder = (n: string, f: typeof FOLDERS[number]): boolean => { const from = snaps.get(`${n}/${f}`); if (!from) return false; fs.rmSync(path.join(w.dirs[n], f), { recursive: true, force: true }); if (fs.existsSync(from)) fs.cpSync(from, path.join(w.dirs[n], f), { recursive: true }); fs.rmSync(path.join(w.dirs[n], 'store', 'LOCK'), { force: true }); return true; };
  const wipeFaults = (n: string): void => { for (const k of [...faultSeen.keys()]) if (k.startsWith(n + '/')) faultSeen.delete(k); };

  type Mode = { restore?: Array<typeof FOLDERS[number]>; rot?: boolean; rotOwn?: 'trunc' | 'zero' | 'flip' | 'delete' | 'delete-one'; crash: boolean };
  const restartDev = async (n: string, m: Mode): Promise<void> => {
    await w.stopDev(n, m.crash);
    if (m.rot) { const mine = vers.filter((x) => w.devs[n] && bodies(n, x).length); if (mine.length) { const vr = pick(mine); rot(n, vr); wipeFaults(n); dng(n, 'rot'); vr.tainted.push('rot@' + n); } }
    if (m.restore) {
      const done: string[] = []; for (const f of m.restore) if (restoreFolder(n, f)) done.push(f);
      if (done.length) {
        bump('restore-' + done.join('+')); dng(n, 'restore-' + done.join('+'));
        for (const vr of vers) if (vr.writer === n) { vr.tainted.push('restore-' + done.join('+')); if (done.length === 3) vr.all3 = true; }
        // a non-writer's restore can lose lines only it held; a writer's restore of the store alone must be caught by its records
        if (done.includes('store') || done.includes('replicator')) wipeFaults(n);
      }
    }
    if (m.rotOwn) {
      for (const d of ['replicator/own', 'witness']) {
        const dir = path.join(w.dirs[n], d); if (!fs.existsSync(dir)) continue;
        if (m.rotOwn === 'delete' && d === 'witness') { fs.rmSync(dir, { recursive: true, force: true }); continue; }
        for (const f of fs.readdirSync(dir)) {
          if (m.rotOwn === 'delete-one' && d !== 'witness') continue; const p = path.join(dir, f); const b = fs.readFileSync(p);
          if (m.rotOwn === 'trunc') fs.writeFileSync(p, b.subarray(0, ri(b.length))); else if (m.rotOwn === 'zero') fs.writeFileSync(p, Buffer.alloc(b.length, 0)); else if (m.rotOwn === 'flip') { b[ri(b.length)] ^= 1 << ri(8); fs.writeFileSync(p, b); } else fs.rmSync(p);
          bump('rot-own-' + m.rotOwn);
        }
      }
      dng(n, 'rot-own-' + m.rotOwn); for (const vr of vers) if (vr.writer === n) vr.tainted.push('own-record-damaged');
    }
    await w.startDev(n); bump(m.crash ? 'crash-restart' : 'restart');
    if (rng() < 0.4) mLive(W.KIND_HEADS, W.headsBodyOf({ page: 0, of: 1, ask: false, heads: [] }), n); // hostile "all my heads, I hold nothing" right after a start: evidence spoof
  };
  // ---- hostile M
  const mLive = (kind: string, body: unknown, to?: string): void => { w.M!.link.sendLive({ group: W.GROUP_LIVE, kind, body: body as never, ...(to ? { to: w.ids[to].deviceId } : {}) }); };
  const mDur = async (chat: string, body: unknown, to?: string): Promise<void> => { await w.M!.link.sendDurable({ group: chatGroup(w.setId, chat), kind: W.KIND_LINES, line: true, ...(to ? { to: w.ids[to].deviceId } : {}), body: body as never }); };
  const hostile = async (): Promise<void> => {
    const vr = pick(vers); const tgt = pick(DEVS); const k = ri(11); bump('M' + k);
    const cap = w.cap.lines.filter((c: any) => c.body.version.equals(vr.v));
    const zero = Buffer.alloc(32);
    if (k === 0 && cap.length) await mDur(vr.chat, W.linesBody(pick(cap).body), tgt);
    else if (k === 1 && cap.length) { const c = pick(cap).body; if (c.lines.length >= 1) await mDur(vr.chat, W.linesBody({ ...c, from: c.from + 1 > c.head.lines ? c.from : c.from + 1, lines: c.lines.slice(1) }), tgt); }
    else if (k === 2 && cap.length) { const c = pick(cap).body; await mDur(pick(vers).chat, W.linesBody(c), tgt); }
    else if (k === 3) { const body = { version: vr.v, chatId: vr.chat, runtime: 'claude-code' as const, parent: null, forkLine: null, forkHash: null, token: null, writer: w.ids.M.deviceId, nonce: Buffer.alloc(16, 9) }; mLive(W.KIND_INTRO, W.introBodyOf({ ...body, sig: signWith(w.ids.M, W.introMessage(body as never)) } as never), tgt); }
    else if (k === 4) { for (let i = 0; i < 40; i++) mLive(W.KIND_WANT, W.wantBodyOf({ version: createHash('sha256').update(`flood-${i}`).digest(), haveLines: 0, haveHash: zero, through: null, intro: ri(2) === 0, round: 0, cover: null }), tgt); }
    else if (k === 5) mLive(W.KIND_HEADS, W.headsBodyOf({ page: 0, of: 1, ask: false, heads: [{ version: vr.v, lines: (vr.head?.lines ?? 0) + 3, hash: Buffer.alloc(32, 5), conversationHash: zero, stamp: 0, state: 'ok' }] }), vr.writer);
    else if (k === 6) mLive(W.KIND_HEADS, W.headsBodyOf({ page: 0, of: 1, ask: false, heads: [] }), tgt); // complete-looking empty heads
    else if (k === 7 && cap.length) { const c = pick(cap).body; const a = pick(cap).body; mLive(W.KIND_WANT, W.wantBodyOf({ version: pick(vers).v, haveLines: ri(c.head.lines), haveHash: zero, through: null, intro: false, round: 0, cover: { lines: a.head.lines, hash: a.head.hash, sig: a.head.sig } }), tgt); } // replayed genuine point as cover
    else if (k === 8) { const lines = ri(20); const hash = Buffer.alloc(32, 7); mLive(W.KIND_ACK, W.ackBodyOf({ version: vr.v, lines, hash, round: 0, sig: signWith(w.ids.M, W.ackMessage(w.ids.M.deviceId, vr.v, lines, hash, 0)) }), tgt); }
    else if (k === 10) mLive(W.KIND_HEADS, W.headsBodyOf({ page: 1, of: 2, ask: false, heads: [] }), tgt); // only the LAST page of a pretended two-page list: evidence without the first page
    else if (k === 9) { const h = await localHead(vr.writer, vr); if (h && h.lines > 0) mLive(W.KIND_HEADS, W.headsBodyOf({ page: 0, of: 1, ask: false, heads: [{ version: vr.v, lines: h.lines, hash: Buffer.from(h.hash, 'hex'), conversationHash: zero, stamp: 0, state: 'ok' }] }), tgt); } // M echoes a TRUE head
  };

  const lineSnapshot = async (n: string, vr: Ver): Promise<{ lines: number; hash: string; got: Buffer[] | null; rf: number | null } | null> => {
    const local = await w.current(n, vr.v).catch(() => null); if (!local) return { lines: 0, hash: '', got: [], rf: null };
    let h; try { h = await w.devs[n].store.head(local); } catch { return null; }
    const rf = repairFrom(h); const readable = rf ?? h.lines; let got: Buffer[] | null = [];
    if (readable > 0) { const rr = await w.devs[n].store.read(local, 0, 0, readable).catch(() => 'throws' as const); got = rr === 'throws' || rr === 'evicted' ? null : rr; }
    return { lines: h.lines, hash: h.hash, got, rf };
  };
  const ownerOf = (vr: Ver, pos: number): Ver => { let cur = vr; while (cur.parent && pos < cur.forkLine) cur = cur.parent; return cur; };

  const audit = async (stage: string): Promise<void> => {
    const honest = DEVS.filter(live);
    for (const vr of vers) {
      const snap = new Map<string, NonNullable<Awaited<ReturnType<typeof lineSnapshot>>>>();
      for (const n of honest) { const s = await lineSnapshot(n, vr); if (!s) continue; snap.set(n, s);
        // O1
        if (s.got) for (let i = 0; i < s.got.length; i++) {
          const t = textOf(s.got[i]); const own = ownerOf(vr, i);
          if (!t) { V('SAFETY-unauthored-line', `${stage} ${n}/${vr.name} pos ${i}`); break; }
          if (t.name !== own.name) { V('SAFETY-line-from-wrong-version', `${stage} ${n}/${vr.name} pos ${i} line of ${t.name}, owner should be ${own.name}`); break; }
          if (!own.ack.get(i)?.has(t.nonce) && !own.maybe.get(i)?.has(t.nonce)) { V('SAFETY-line-never-saved-at-this-position', `${stage} ${n}/${vr.name} pos ${i} holds ${t.nonce}; writer ${own.writer} was told saved for ${[...(own.ack.get(i) ?? [])].join(',') || '-'}`); break; }
        }
      }
      const arr = [...snap.entries()];
      const sts = await Promise.all(arr.map(async ([n, s]) => ({ n, s, st: await w.devs[n].rep.status(vr.v) })));
      const sig = (x: { s: { lines: number; hash: string; got: Buffer[] | null } }): string => `${x.s.lines}/${createHash('sha1').update(Buffer.concat(x.s.got ?? [Buffer.from('?')])).digest('hex')}`;
      const identical = new Set(arr.map(([, s]) => sig({ s }))).size === 1;
      for (const a of sts) {
        const key = `${a.n}/${vr.name}`;
        if (a.st.state === 'faulted') {
          if (!faultSeen.has(key)) { const d = [...(danger.get(a.n) ?? []), ...(danger.get(vr.writer) ?? [])]; bump('fault-' + String(a.st.reason)); if (!d.length && !/directory-conflict/.test(String(a.st.reason))) V('FAULT-FROM-ORDINARY-OPS', `${stage} ${key} faulted(${a.st.reason}) with no rollback/rot/own-record damage applied to ${a.n} or the writer; M hostile frames are possible`); else exc(`fault ${a.st.reason} after ${d.length ? 'dangerous op' : 'none'}`); }
          faultSeen.set(key, String(a.st.reason));
        } else if (faultSeen.has(key)) V('QUIET-fault-went-away', `${stage} ${key} was faulted(${faultSeen.get(key)}) now ${a.st.state}`);
        // O3
        if (a.st.state === 'in-sync' && !identical) { const pinfo = vr.parent ? await Promise.all(DEVS.map(async (d) => { const ps = await w.devs[d].rep.status(vr.parent!.v); const ph = await localHead(d, vr.parent!); return `parent ${vr.parent!.name}@${d}=${ps.state}${ps.reason ? '(' + ps.reason + ')' : ''}/${ph?.lines}l fork=${vr.forkLine} taker=${vr.writer}`; })) : []; V('QUIET-in-sync-while-differing', `${stage} ${key} ${pinfo.join(' ')} in-sync but ${sts.map((x) => `${x.n}[${x.st.state}${x.st.reason ? '(' + x.st.reason + ')' : ''} ${x.s.lines}l]`).join(' ')} (honest devices without a copy are not listed)`); }
        // O5
        if (!identical && !NAMED.includes(a.st.state)) exc(`CALM-STALL:${a.st.state}${a.st.reason ? '(' + String(a.st.reason).replace(/[0-9a-f]{8}/g, 'XX') + ')' : ''}`);
      }
      // devices that do not know the version at all
      for (const n of honest) if (!snap.has(n) || (snap.get(n)!.lines === 0 && sts.length > 0)) { const anyIn = sts.some((x) => x.st.state === 'in-sync' && x.s.lines > 0); if (anyIn && (!w.devs[n].rep.describe(vr.v))) V('QUIET-in-sync-while-peer-unaware', `${stage} ${n} has never heard of ${vr.name} but another device says in-sync`); }
      // O2
      if (vr.parent === null || true) for (const [pos, set] of vr.ack) for (const nn of set) {
        let found = false; for (const [, s] of snap) { if (s.got && s.got.length > pos && textOf(s.got[pos])?.nonce === nn) { found = true; break; } }
        if (!found) {
          const wst = sts.find((x) => x.n === vr.writer); const cover = sts.length > 0 && sts.every((x) => NAMED.includes(x.st.state)); const writerNamed = !!wst && NAMED.includes(wst.st.state);
          if (cover) exc('lost-but-NAMED:' + [...new Set(sts.map((x) => x.st.state + (x.st.reason ? '(' + x.st.reason + ')' : '')))].join('|'));
          else if (writerNamed) exc('lost-but-WRITER-NAMED(' + wst!.st.state + (wst!.st.reason ? ':' + wst!.st.reason : '') + ') others=' + sts.filter((x) => x.n !== vr.writer).map((x) => x.st.state).join('/'));
          else if (vr.tainted.includes('own-record-damaged') && vr.tainted.some((x) => x.startsWith('restore-') || x === 'set-aside@' + vr.writer || x === 'rot@' + vr.writer)) exc('lost-after-COMPOUND(own-record-damaged + writer data loss) states=' + sts.map((x) => x.st.state).join('/'));
          else if (vr.all3) exc('lost-after-all3-writer-restore(documented limit) states=' + sts.map((x) => x.st.state).join('/'));
          else if (ownerOf(vr, pos) !== vr) { /* child position owned by the parent: judged on the parent */ }
          else if (set.size > 1) { /* a reused position is reported by SAVED-POSITION-REUSED */ }
          else V('QUIET-saved-line-lost', `${stage} ${vr.name} pos ${pos}: told saved, held by no honest device, states ${sts.map((x) => x.n + ':' + x.st.state + (x.st.reason ? '(' + x.st.reason + ')' : '')).join(',')} tainted=${vr.tainted.join('+')}`);
          break;
        }
      }
      // O4
      for (const n of honest) for (const a of w.devs[n].rep.peerAcks(vr.v)) {
        const hn = DEVS.find((d) => w.ids[d].deviceId.toString('hex') === a.holder); if (!hn || !live(hn)) continue;
        const hl = await w.current(hn, vr.v).catch(() => null); let ok = false;
        if (hl) { try { ok = (await w.devs[hn].store.hashAt(hl, 0, a.lines)) === a.hash; if (ok && a.lines > 0) { const rr = await w.devs[hn].store.read(hl, 0, 0, a.lines); ok = rr !== 'evicted'; } } catch { ok = false; } }
        if (!ok) { if ((danger.get(hn) ?? []).length) exc('ack-listed-not-readable (holder had dangerous op)'); else V('QUIET-ack-not-readable-on-holder', `${stage} ${n} lists ack of ${hn} ${a.lines} lines of ${vr.name} round ${a.round}, holder cannot read them`); }
        else bump('ack-listed-readable');
      }
    }
  };
  const checkpoint = async (stage: string): Promise<void> => {
    lift(); for (const n of DEVS) { if (w.devs[n].down || w.devs[n].ffs.crashed) await restartDev(n, { crash: true }); w.devs[n].carrier.online = true; }
    await w.settle().catch(() => undefined);
    for (const vr of vers) if (vr.pending) { for (let i = 0; i < 3 && vr.pending; i++) await append(vr); vr.pending = null; vr.head = await localHead(vr.writer, vr); }
    for (let i = 0; i < 6; i++) await w.elapse(70_000, 35_000);
    for (const n of DEVS) for (const vr of vers) { try { await w.devs[n].rep.solicitAcks(vr.v); } catch { /* benign: harness */ } }
    await w.elapse(20_000, 10_000);
    await audit(stage); bump('checkpoint');
  };
  try {
    await addRoot('A', 'one'); await addRoot('B', 'two'); await addRoot('C', 'three');
    for (let i = 0; i < OPS; i++) {
      ops++; const r = ri(100); let what = '';
      try {
        if (r < 30) { const vr = pick(vers); what = `append ${vr.writer}/${vr.name}`; await append(vr, rng() < 0.1); }
        else if (r < 37) { what = 'elapse'; await w.elapse(ri(3) === 0 ? 70_000 : 15_000, 15_000); }
        else if (r < 42) { const n = pick(DEVS); what = `toggle ${n}`; if (!w.devs[n].down) w.devs[n].carrier.online = !w.devs[n].carrier.online; }
        else if (r < 46) { what = 'relay'; if (rng() < 0.4) lift(); else setRelay(); }
        else if (r < 51) { const n = pick(DEVS); what = `restart ${n}`; await restartDev(n, { crash: rng() < 0.5 }); }
        else if (r < 53) { const n = pick(DEVS); what = `restart+rot ${n}`; await restartDev(n, { crash: true, rot: true }); }
        else if (r < 58) { const n = pick(DEVS); const f = pick([...FOLDERS]); what = `snap ${n}/${f}`; if (live(n)) snapFolder(n, f); }
        else if (r < 63) { const n = pick(DEVS); what = `snapAll ${n}`; if (live(n)) for (const f of FOLDERS) snapFolder(n, f); }
        else if (r < 66) { const n = pick(DEVS); const sub = FOLDERS.filter(() => rng() < 0.6); if (!sub.length) sub.push(pick([...FOLDERS])); what = `rollback ${n} ${sub.join('+')}`; await restartDev(n, { crash: true, restore: sub }); }
        else if (r < 68) { const n = pick(DEVS); what = `rot-own ${n}`; await restartDev(n, { crash: true, rotOwn: pick(['trunc', 'zero', 'flip', 'delete', 'delete-one'] as const) }); }
        else if (r < 72) { const n = pick(DEVS); what = `crashAt ${n}`; if (live(n)) w.devs[n].ffs.failAt = w.devs[n].ffs.ops + 1 + ri(60); }
        else if (r < 75) { const n = pick(DEVS); what = `enospc ${n}`; if (live(n)) w.devs[n].ffs.opts.enospcFrom = w.devs[n].ffs.allocs + ri(8); }
        else if (r < 80) { const n = pick(DEVS); const vr = pick(vers); what = `set-aside ${n}/${vr.name}${vr.writer === n ? ' (WRITER)' : ''}`; if (live(n)) { const l = await w.current(n, vr.v).catch(() => null); if (l) { await w.devs[n].store.setAsideDamaged(l).catch(() => undefined); await w.devs[n].rep.reportCorrupt(vr.v).catch(() => undefined); bump(vr.writer === n ? 'set-aside-writer' : 'set-aside-nonwriter'); dng(n, 'set-aside'); vr.tainted.push('set-aside@' + n); } } }
        else if (r < 83) { what = 'takeover'; const by = pick(DEVS); const par = pick(vers); if (vers.length < 8) await addTakeover(by, par); }
        else if (r < 85) { what = 'checkpoint'; await checkpoint(`mid#${i}`); }
        else { what = 'hostile'; await hostile(); }
      } catch (e) { bump('op-error'); trail.push(`op ${what} error ${String(e).slice(0, 100)}`); }
      trail.push(what);
      for (const n of DEVS) if (w.devs[n].ffs.crashed && !w.devs[n].down) await restartDev(n, { crash: true });
      if (rng() < 0.3) await w.settle().catch(() => undefined);
    }
    await checkpoint('final');
  } catch (e) { V('HARNESS-error', String(e).slice(0, 200)); }
  const sizes = DEVS.map((n) => (w.devs[n].rep as any).stateSizes?.());
  const memMB = Math.round(process.memoryUsage().rss / 1048576);
  await w.stopAll(); w.cleanup();
  return { ops, viol: [...viol.values()], excused: Object.fromEntries(excused), stats, trail: trail.slice(-45), memMB, sizes };
}
describe('review 3 attack fuzz', () => {
  it(`seeds ${SEED0}..${SEED0 + SEEDS - 1}`, async () => {
    let total = 0; const cats: Record<string, number> = {};
    for (let s = SEED0; s < SEED0 + SEEDS; s++) {
      const t0 = Date.now(); let r: Awaited<ReturnType<typeof oneSeed>>;
      try { r = await oneSeed(s); } catch (e) { fs.appendFileSync(RES, JSON.stringify({ seed: s, harnessCrash: String(e).slice(0, 300) }) + '\n'); continue; }
      total += r.ops;
      for (const x of r.viol) { const c = x.split(':')[0]; cats[c] = (cats[c] ?? 0) + 1; }
      fs.appendFileSync(RES, JSON.stringify({ seed: s, ops: r.ops, secs: Math.round((Date.now() - t0) / 1000), memMB: r.memMB, viol: r.viol, excused: r.excused, stats: r.stats, sizes: r.sizes, trail: r.viol.length ? r.trail : undefined }) + '\n');
    }
    fs.appendFileSync(RES, JSON.stringify({ summary: true, seeds: [SEED0, SEED0 + SEEDS - 1], total, cats }) + '\n');
  }, 7_200_000);
});
