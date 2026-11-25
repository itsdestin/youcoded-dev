// Review 9 fuzz: own generator, own oracle (written from scratch; shares only the virtual disk idea with review 8).
// Two chats; versions with fork children (same / different continuation), parks (incl. conflicting), eviction + restore, retirement + recopy into a new id.
// Mode mixed: crashes (kill / power cut with torn writes) at random operations, then ONE file fault, then a reopen (optionally crashing again during repair).
// Mode crash: crashes only; no file fault; every alarm (flag, typed error, quarantine) is a violation.
// Oracle (per version, after reopen): every acknowledged line (below eviction) is served byte-identical, or covered by a typed error / damage flag / rollback report / retirement.
//   A served line that differs from the model is ALWAYS a violation (also past a flagged line). A fault in one version never changes another. No untyped exception. A retired id never serves or accepts.
// Env: R9_FROM R9_TO R9_MODE=mixed|crash R9_OUT R9_FAULTS=a,b R9_INFO=1 R9_SRC=<dir with store sources>
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
const BASE = process.env.R9_BASE ?? '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-9';
const SRC = process.env.R9_SRC ?? BASE + '/new';
const { ChatStore, deriveForkId } = await import(SRC + '/store');
const { StoreError } = await import(SRC + '/errors');
import { VFS, Crash } from './vfs';

const MODE = process.env.R9_MODE ?? 'mixed';
const FROM = Number(process.env.R9_FROM ?? 1), TO = Number(process.env.R9_TO ?? 100);
const OUT = process.env.R9_OUT ?? BASE + '/out-' + MODE + '-' + FROM + '.jsonl';
const ONLY = process.env.R9_FAULTS ? process.env.R9_FAULTS.split(',') : null;
function prng(seed: number) { let a = (seed * 2654435761 + 12345) >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }
const sha = (...b: (Buffer | string)[]) => { const h = createHash('sha256'); for (const x of b) h.update(x); return h.digest(); };

interface Ver { id: Buffer; hex: string; chat: string; lines: Buffer[]; retired: boolean; parent: Ver | null; evicted: number; parks: { from: number; lines: Buffer[]; alt?: boolean }[]; recopyOf?: Ver; fixedCrash?: boolean; pending?: boolean; stream: { lines: Buffer[] }; conflict?: boolean }
export interface Viol { kind: string; detail: string }

async function run(seed: number): Promise<any> {
  const r = prng(seed);
  const tmp = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r9-'));
  const root = nodePath.join(tmp, 'store'); await fsp.mkdir(root);
  const vfs = new VFS(r); vfs.dbg = !!process.env.R9_DBG;
  { let p = ''; for (const seg of root.split('/').filter(Boolean)) { p += '/' + seg; vfs.base.set(p, 'D'); vfs.vol.set(p, 'D'); } }
  const trace: string[] = []; const viols: Viol[] = []; const seen = new Set<string>();
  const note = (s: string) => { trace.push(s); if (trace.length > 80) trace.shift(); };
  const viol = (kind: string, detail: string) => { if (seen.has(kind)) return; seen.add(kind); viols.push({ kind, detail }); };
  const typed = (e: any) => e instanceof StoreError;
  const err = (e: any) => (typed(e) ? `StoreError(${e.code}): ${String(e.message).slice(0, 100)}` : `${e?.constructor?.name}: ${e?.message}\n${String(e?.stack).split('\n').slice(1, 4).join('|')}`);
  const crashMode = MODE === 'crash';
  let faultDesc = 'none'; let faultKind = 'none';
  const outcomes: string[] = [];

  const chunkBytes = [700, 1500, 4000][Math.floor(r() * 3)];
  let clock = 1_700_000_000_000;
  const r2 = prng(seed + 99991);
  const dropLock = async () => { for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(nodePath.join(root, n), { force: true }); };
  const opts = () => ({ fs: vfs as any, chunkBytes, scrubOnOpenBytes: r2() < 0.5 ? 0 : 1 << 20, proofVerifier: () => true, now: () => (clock += 1000) });
  let uniq = 0;
  const mk = (tag: string): Buffer => { const pad = 'x'.repeat(Math.floor(r() * 150)); return Buffer.from(JSON.stringify({ type: r() < 0.5 ? 'user' : 'assistant', uuid: `${tag}-${uniq++}`, message: { role: 'user', content: `${tag}#${uniq}#${pad}`, ...(r() < 0.5 ? { stop_reason: 'end_turn' } : {}) } }) + '\n'); };
  const vers: Ver[] = [];
  const chats = ['r9:chatA', 'r9:chatB'];
  let idc = 1;
  const newId = () => Buffer.from([0xc9, idc++ & 255, Math.floor(r() * 256), Math.floor(r() * 256)]);
  const mkVer = (chat: string, parent: Ver | null, id = newId()): Ver => { const v: Ver = { id, hex: id.toString('hex'), chat, lines: [], retired: false, parent, evicted: 0, parks: [], stream: { lines: [] } }; vers.push(v); return v; };
  // the INTENDED history of a version: lines are generated once per position, so a park and the append that later fills the gap carry the same lines (a real park is a piece of the same history)
  const want = (v: Ver, from: number, to: number): Buffer[] => { while (v.stream.lines.length < to) v.stream.lines.push(mk(v.hex)); return v.stream.lines.slice(from, to); };
  const live = () => vers.filter((v) => !v.retired);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const seedOf = (chat: string) => sha(Buffer.from(chat), Buffer.alloc(4));
  const refAll = (ls: Buffer[], chat: string) => { let h = seedOf(chat); const o = [h.toString('hex')]; for (const l of ls) { h = sha(h, l); o.push(h.toString('hex')); } return o; };

  let s: any = null;
  async function openStore(): Promise<any> {
    for (let a = 0; a < 3; a++) {
      try { const x = await ChatStore.open(root, opts()); return x; }
      catch (e: any) {
        if (e instanceof Crash || vfs.dead) throw e;
        if (typed(e) && /store-locked/.test(e.code)) { await dropLock(); continue; }
        note('open ' + err(e)); if (!typed(e)) viol('untyped-open', err(e)); else if (crashMode) viol('alarm-open-refused', err(e)); return null;
      }
    }
    return null;
  }
  const regAll = async () => { for (const v of vers) { if (v.parent || v.recopyOf && false) continue; if (v.fixedCrash) continue; } };
  // registration of a root/recopy version (idempotent)
  const register = async (v: Ver) => { await s.registerVersion(v.id, { chatId: v.chat, runtime: 'claude-code', parent: null }); };
  const registered = new Set<string>();
  const doCrash = async (what: string) => {
    vfs.disarm(); if (process.env.R9_DBG) note('VFSLOG ' + vfs.log.slice(-14).join(' ; ') + ` tear=${vfs.tearMode}`); const sm = r() < 0.5 ? 'power' : 'kill'; vfs.settle(sm); await dropLock(); note('CRASH in ' + what + ' ' + sm); s = await openStore(); if (!s) throw new Error('store would not reopen after crash');
    if (process.env.R9_DUMP) { const D = process.env.R9_DUMP; fs.mkdirSync(D, { recursive: true }); for (const f of vfs.files()) { if (!f.startsWith(root + '/')) continue; const dst = D + '/' + f.slice(root.length + 1); fs.mkdirSync(nodePath.dirname(dst), { recursive: true }); fs.writeFileSync(dst, vfs.get(f)!); } }
    if (process.env.R9_DBG) { for (const v of vers) { try { const h = await s.head(v.id); note(`  after crash ${what}: ${v.hex} head=${h.lines} model=${v.lines.length} files=${vfs.files().filter((f) => f.includes('/versions/' + v.hex + '/')).map((f) => f.split('/').pop() + ':' + vfs.get(f)!.length).join(' ')}`); } catch (e: any) { note(`  after crash ${what}: ${v.hex} ${e.code ?? e}`); } } }
    if (crashMode) await alarms('after-crash ' + what);
  };
  // in crash mode: after a plain crash there must be NO alarm anywhere
  async function alarms(tag: string) {
    for (const v of vers) {
      if (v.retired || v.pending) continue;
      let hd: any;
      try { hd = await s.head(v.id); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; if (typed(e) && e.code === 'unknown-version') continue; viol('alarm-head-threw', `${tag} ${v.hex} ${err(e)}`); continue; }
      if (hd.damagedFromLine !== null || hd.rolledBack !== null) viol('alarm-flag-after-crash', `${tag} ${v.hex} dmg=${hd.damagedFromLine} rb=${JSON.stringify(hd.rolledBack)}`);
    }
  }
  // run an op; on Crash (or armed failure) recover and retry (the caller's retry rule) up to 4 times
  async function guarded<T>(what: string, fn: () => Promise<T>, arm = true): Promise<T | undefined> {
    for (let t = 0; t < 4; t++) {
      try {
        if (arm && (crashMode ? r() < 0.5 : r() < 0.25) && t === 0) vfs.arm(1 + Math.floor(r() * 45), (['none', 'prefix', 'garbage'] as const)[Math.floor(r() * 3)]);
        const x = await fn(); vfs.disarm(); return x;
      } catch (e: any) {
        if (e instanceof Crash || vfs.dead) { await doCrash(what); continue; }
        vfs.disarm(); throw e;
      }
    }
    return undefined;
  }
  const expectTyped = (what: string, e: any, ok: string[]) => { if (!typed(e)) { viol('untyped-' + what, err(e)); return; } if (!ok.includes(e.code)) { viol('unexpected-code-' + what + ':' + e.code, err(e)); } };
  // a park applies when the head reaches (or passes, with identical overlap) its start; a conflicting one (different lines at lines the head already holds) is rejected
  const drainModel = (v: Ver) => { for (let again = true; again;) { again = false; for (const p of v.parks) { const L = v.lines.length; if (p.from > L) continue; const ov = Math.min(p.lines.length, L - p.from); const same = p.lines.slice(0, ov).every((l, i) => l.equals(v.lines[p.from + i])); v.parks = v.parks.filter((q) => q !== p); if (same && p.from + p.lines.length > L) v.lines = v.lines.concat(p.lines.slice(ov)); again = true; break; } } };

  s = await openStore();
  if (!s) { await fsp.rm(tmp, { recursive: true, force: true }); return { seed, outcome: 'open-failed', viols }; }
  const snaps: Map<string, Buffer>[] = [];
  const snap = () => { snaps.push(vfs.dirSnapshot(root + '/')); if (snaps.length > 8) snaps.splice(Math.floor(r() * 6), 1); };
  const rootA = mkVer(chats[0], null), rootB = mkVer(chats[1], null);
  for (const v of [rootA, rootB]) { await guarded('register', () => register(v)); registered.add(v.hex); }
  const retiredSnaps: { v: Ver; snap: Map<string, Buffer> }[] = [];
  const nOps = 10 + Math.floor(r() * 22);
  const stats: Record<string, number> = {};
  const hit = (k: string) => { stats[k] = (stats[k] ?? 0) + 1; };
  for (let k = 0; k < nOps; k++) {
    const lv = live(); const v = pick(lv); const x = r();
    try {
      if (x < 0.34) {                                   // append (sometimes landing exactly where a park begins)
        let cnt = 1 + Math.floor(r() * 25); const pk = v.parks.filter((p) => p.from > v.lines.length).sort((a, b) => a.from - b.from)[0];
        if (pk && r() < 0.6) cnt = pk.from - v.lines.length;
        const at = v.lines.length; const lines = want(v, at, at + Math.max(1, cnt));
        // 'same continuation' for a fork child: copy the parent's own next lines
        const use = lines;
        if (process.env.R9_DUMP && !fs.existsSync(process.env.R9_DUMP + '.use')) fs.writeFileSync(process.env.R9_DUMP + '.use', Buffer.concat(use));
        const res = await guarded('append', () => s.append(v.id, 0, at, use));
        if (process.env.R9_DBG) note(`append ${v.hex} at=${at} n=${use.length} -> ${res} parent=${v.parent?.hex}`);
        if (res === 'ok') { v.lines = v.lines.concat(use); drainModel(v); hit('append'); }
        else if (res === 'not-a-prefix' && v.conflict) {   // a crash left a prefix of the unacknowledged append; a conflicting park then drained over the rest (the documented conflict-park-won): resync to what the store holds, and check it is only park lines
          hit('conflict-park-won'); const hd0 = await s.head(v.id); const got: Buffer[] = hd0.lines > at ? (await s.read(v.id, 0, at, hd0.lines) as Buffer[]) : [];
          const altOk = got.every((g, i) => use[i]?.equals(g) || v.parks.some((p) => p.lines.some((l) => l.equals(g))));
          if (!altOk) viol('conflict-park-served-unknown-lines', v.hex); v.lines = v.lines.slice(0, at).concat(got); v.parks = [];
        }
        else if (res !== undefined) viol('append-answer-' + res, v.hex);
        const hd = await s.head(v.id); if (hd.lines !== v.lines.length) viol('build-head-mismatch', `${v.hex} head=${hd.lines} model=${v.lines.length}`);
      } else if (x < 0.42) {                            // park (a gap), possibly a conflicting one later
        const from = v.lines.length + 1 + Math.floor(r() * 3); const k = 1 + Math.floor(r() * 4); const conflictPark = r() < 0.12; const lines = conflictPark ? Array.from({ length: k }, () => mk(v.hex + 'alt')) : want(v, from, from + k); if (conflictPark) v.conflict = true;
        if (!v.parks.some((p) => from < p.from + p.lines.length && p.from < from + lines.length)) {
          const res = await guarded('park', () => s.append(v.id, 0, from, lines));
          if (process.env.R9_DBG) note(`park ${v.hex} from=${from} k=${k} len=${v.lines.length} -> ${res} conflict=${conflictPark}`);
          if (res === 'parked') { v.parks.push({ from, lines, alt: conflictPark }); hit('park'); }
        }
      } else if (x < 0.56 && v.lines.length >= 1) {     // fork
        const f = Math.floor(r() * (v.lines.length + 1));
        const hAt = await s.hashAt(v.id, 0, f);
        const child = mkVer(v.chat, v, deriveForkId(v.id, f, hAt!, 'tok' + Math.floor(r() * 3)));
        // a same-token fork of the same point yields an existing id: that is the idempotent case
        const existing = vers.find((q) => q !== child && q.hex === child.hex);
        const preParent = vfs.dirSnapshot(`${root}/versions/${v.hex}/`);
        const res: any = await guarded('fork', async () => {
          try { return await s.forkVersion(v.id, f, child.id); }
          catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; return e; }
        });
        if (res instanceof Error || (res && res.code && !('lines' in res))) {
          vers.splice(vers.indexOf(child), 1);
          expectTyped('fork', res, ['evicted', 'corrupt', 'version-conflict', 'damaged', 'bad-argument']);
          note(`fork refused ${(res as any).code}`);
        } else if (res) {
          if (existing) { vers.splice(vers.indexOf(child), 1); if (existing.lines.length < f || !existing.lines.slice(0, f).every((l, i) => l.equals(v.lines[i]))) viol('fork-idempotent-prefix-mismatch', ''); }
          else { child.lines = v.lines.slice(0, f); child.stream = (r() < 0.5 && v.stream.lines.length >= f && v.stream.lines.slice(0, f).every((l, i) => l.equals(child.lines[i]))) ? v.stream : { lines: child.lines.slice() }; hit('fork'); }
          // the parent must be byte-identical (index and bodies) to before the fork
          for (const [p, b] of preParent) { if (!/\/(index\.bin|body-[0-9a-f]+\.bin)$/.test(p)) continue; const now = vfs.get(p); if (!now || !now.equals(b)) { if (!(now && now.length >= b.length && b.equals(now.subarray(0, b.length)) && false)) viol('FORK-CHANGED-PARENT', p.split('/').slice(-2).join('/')); } }
        } else vers.splice(vers.indexOf(child), 1);
      } else if (x < 0.64 && v.lines.length >= 2) {      // evict
        const through = 1 + Math.floor(r() * v.lines.length); const h = await s.hashAt(v.id, 0, through);
        const res = await guarded('evict', async () => { try { return await s.evictBody(v.id, { kind: 'holders-confirmed', version: v.hex, through, hash: h!, acks: [{ holder: 'p', version: v.hex, lines: through, hash: h!, signature: 's' }] }); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; return e; } });
        if (res && !(res instanceof Error)) { v.evicted = Math.max(v.evicted, through); hit('evict'); } else if (res) expectTyped('evict', res, ['corrupt', 'bad-proof', 'damaged']);
      } else if (x < 0.72 && v.evicted > 0) {            // restore from a peer (right bytes, or sometimes WRONG bytes: must refuse)
        const wrong = r() < 0.3; const ls = v.lines.map((l) => Buffer.from(l));
        if (wrong) { const i = Math.floor(r() * v.evicted); const b = Buffer.from(ls[i]); b[Math.floor(r() * (b.length - 1))] ^= 0x01; ls[i] = b; }
        const res = await guarded('restore', async () => { try { return await s.restoreBody(v.id, ls); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; return e; } });
        if (res instanceof Error) { if (!wrong) viol('restore-right-bytes-refused', err(res)); else expectTyped('restore-wrong', res, ['bad-argument', 'corrupt']); }
        else if (res) { if (wrong) viol('RESTORE-ACCEPTED-WRONG-BYTES', v.hex); else { v.evicted = 0; hit('restore'); } }
      } else if (x < 0.8) {                              // resend a random acknowledged range (idempotent)
        if (v.lines.length) { const a = Math.floor(r() * v.lines.length); const b = Math.min(v.lines.length, a + 1 + Math.floor(r() * 12)); const res = await guarded('resend', () => s.append(v.id, 0, a, v.lines.slice(a, b))); if (res !== 'ok' && res !== undefined) viol('resend-answer-' + res, `${v.hex} ${a}-${b}`); }
      } else if (x < 0.86 && v.lines.length) {            // retire + recopy into a new id
        const pre = vfs.dirSnapshot(root + '/'); v.pending = true; const res = await guarded('retire', async () => { try { return await s.setAsideDamaged(v.id); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; return e; } });
        v.pending = false;
        if (res instanceof Error) expectTyped('retire', res, ['damaged', 'unknown-version']);
        else if (res) {
          v.retired = true; retiredSnaps.push({ v, snap: pre }); hit('retire');
          const nv = mkVer(v.chat, null); nv.recopyOf = v; nv.stream = { lines: v.lines.slice() };
          await guarded('register', () => register(nv)); registered.add(nv.hex);
          for (let a = 0; a < v.lines.length; a += 30) { const part = v.lines.slice(a, a + 30); const rr = await guarded('recopy', () => s.append(nv.id, 0, a, part)); if (rr === 'ok') nv.lines = nv.lines.concat(part); }
          // the retired id must refuse an append
          try { await s.append(v.id, 0, v.lines.length, [mk('late')]); viol('RETIRED-ACCEPTED-APPEND', v.hex); } catch (e: any) { if (e instanceof Crash || vfs.dead) { await doCrash('late-append'); } else expectTyped('retired-append', e, ['damaged']); }
        }
      } else if (x < 0.92) { note('close+reopen'); await s.close(); s = await openStore(); if (crashMode) await alarms('reopen'); }
      else { try { await s.scrubStep(v.id, { maxBytes: 1 << 20 }); } catch (e: any) { if (e instanceof Crash || vfs.dead) { await doCrash('scrub'); } else expectTyped('scrub', e, ['damaged', 'corrupt']); } }
    } catch (e: any) {
      if (e instanceof Crash || vfs.dead) { await doCrash('op'); }
      else if (typed(e)) { note('op threw ' + err(e)); if (['damaged', 'corrupt'].includes(e.code) && crashMode) viol('alarm-typed-in-crash-mode', err(e)); }
      else { viol('untyped-op', err(e)); }
    }
    snap();
  }
  try { await s.close(); } catch (e: any) { if (e instanceof Crash || vfs.dead) { await doCrash('close'); try { await s.close(); } catch { /* */ } } else if (!typed(e)) viol('untyped-close', err(e)); }
  if (crashMode) { s = await openStore(); if (s) { await alarms('final'); await s.close(); } }
  vfs.settle('kill');                                    // make every write durable BEFORE the fault (reviewer 8: vfs.put edits the durable image)
  snap();

  // ---------------------------------- ONE fault ----------------------------------
  const targets = new Set<Ver>();
  const dirOf = (v: Ver) => `${root}/versions/${v.hex}/`;
  const files = (v: Ver) => vfs.files().filter((f) => f.startsWith(dirOf(v)));
  const name = (f: string) => f.slice(f.indexOf('/versions/') + 10).split('/').slice(1).join('/');
  const FAULTS = ['flipBody', 'flipBody', 'flipIdx', 'flipCk', 'flipOther', 'zeroBody', 'truncBody', 'truncIdx', 'truncCk', 'deleteOne', 'deleteBody', 'olderOne', 'olderIdx', 'olderCk', 'olderBody', 'olderIdxCk', 'olderIdxBody', 'olderAll', 'rbFolder', 'rbFolder', 'swapIdx', 'swapCk', 'swapBody', 'swapAllSets', 'swapAnyKind', 'swapOtherChat', 'swapOlderSibling', 'retireWitness', 'retirePutBack', 'rbRoot', 'garbleIdx', 'zeroCk'];
  const fault = crashMode ? 'none' : (ONLY ? pick(ONLY) : pick(FAULTS));
  const sn = snaps.length ? pick(snaps.slice(0, snaps.length)) : null;
  const cand = live().filter((v) => files(v).length > 0);
  const restoreFiles = (v: Ver, pred: (n: string) => boolean, from = sn): boolean => {
    if (!from) return false; let ch = false; const d = dirOf(v);
    const all = new Set<string>([...files(v), ...[...from.keys()].filter((f) => f.startsWith(d))]);
    for (const f of all) { if (!pred(name(f))) continue; const o = from.get(f) ?? null; const c = vfs.get(f); if ((o === null && c === null) || (o && c && o.equals(c))) continue; vfs.put(f, o); ch = true; }
    if (ch) targets.add(v); return ch;
  };
  const isIdx = (n: string) => n === 'index.bin', isCk = (n: string) => n === 'checkpoint.bin', isBody = (n: string) => /^body-/.test(n);
  let did = false;
  const V = cand.length ? pick(cand) : null;
  if (fault !== 'none' && V) {
    const fl = files(V); const sibs = vers.filter((q) => q !== V && !q.retired && files(q).length && (q.parent === V || V.parent === q || q.chat === V.chat));
    const sibOf = sibs.length ? pick(sibs) : null;
    const pickFile = (pred: (n: string) => boolean) => { const c = fl.filter((f) => pred(name(f))); return c.length ? pick(c) : null; };
    const mutate = (f: string | null, how: 'flip' | 'zero' | 'trunc' | 'del' | 'garble') => {
      if (!f) return false; const b = vfs.get(f)!; if (how === 'del') vfs.put(f, null);
      else if (!b.length) return false;
      else if (how === 'flip') { const c = Buffer.from(b); c[Math.floor(r() * c.length)] ^= 1 << Math.floor(r() * 8); vfs.put(f, c); }
      else if (how === 'zero') { const c = Buffer.from(b); const a = Math.floor(r() * c.length); c.fill(0, a, Math.min(c.length, a + 1 + Math.floor(r() * 40))); vfs.put(f, c); }
      else if (how === 'garble') { const c = Buffer.from(b); const a = Math.floor(r() * c.length); for (let i = a; i < Math.min(c.length, a + 1 + Math.floor(r() * 40)); i++) c[i] = Math.floor(r() * 256); vfs.put(f, c); }
      else { if (b.length < 2) return false; vfs.put(f, b.subarray(0, 1 + Math.floor(r() * (b.length - 1)))); }
      targets.add(V); faultDesc = `${how} ${name(f)}`; return true;
    };
    const copyKind = (dst: Ver, src: Ver, pred: (n: string) => boolean, fromSnap: Map<string, Buffer> | null = null): boolean => {
      let ch = false; const sd = dirOf(src), dd = dirOf(dst);
      const srcFiles = fromSnap ? [...fromSnap.keys()].filter((f) => f.startsWith(sd)) : files(src);
      const dstBodies = files(dst).filter((f) => isBody(name(f)) && pred(name(f)));
      if (srcFiles.some((f) => isBody(name(f))) && pred('body-0')) for (const f of dstBodies) { vfs.put(f, null); ch = true; }
      for (const f of srcFiles) { const n = name(f); if (!pred(n)) continue; const b = fromSnap ? fromSnap.get(f)! : vfs.get(f)!; const t = dd + n; const cur = vfs.get(t); if (cur && cur.equals(b)) continue; vfs.put(t, b); ch = true; }
      if (ch) { targets.add(dst); } return ch;
    };
    switch (fault) {
      case 'flipBody': did = mutate(pickFile(isBody), 'flip'); break;
      case 'zeroBody': did = mutate(pickFile(isBody), r() < 0.5 ? 'zero' : 'garble'); break;
      case 'truncBody': did = mutate(pickFile(isBody), 'trunc'); break;
      case 'flipIdx': did = mutate(pickFile(isIdx), 'flip'); break;
      case 'garbleIdx': did = mutate(pickFile(isIdx), 'garble'); break;
      case 'truncIdx': did = mutate(pickFile(isIdx), 'trunc'); break;
      case 'flipCk': did = mutate(pickFile(isCk), 'flip'); break;
      case 'zeroCk': did = mutate(pickFile(isCk), 'zero'); break;
      case 'truncCk': did = mutate(pickFile(isCk), 'trunc'); break;
      case 'flipOther': did = mutate(pickFile((n) => !isBody(n) && !isIdx(n) && !isCk(n) && !n.startsWith('torn') && !n.startsWith('healed')), 'flip'); break;
      case 'deleteOne': did = mutate(pickFile(() => true), 'del'); break;
      case 'deleteBody': did = mutate(pickFile(isBody), 'del'); break;
      case 'olderOne': { const u = fl.map(name); const one = u.length ? pick(u) : ''; did = u.length > 0 && restoreFiles(V, (n) => n === one); faultDesc = 'olderOne ' + one; break; }
      case 'olderIdx': did = restoreFiles(V, isIdx); faultDesc = 'olderIdx'; break;
      case 'olderCk': did = restoreFiles(V, isCk); faultDesc = 'olderCk'; break;
      case 'olderBody': did = restoreFiles(V, isBody); faultDesc = 'olderBody'; break;
      case 'olderIdxCk': did = restoreFiles(V, (n) => isIdx(n) || isCk(n)); faultDesc = 'olderIdxCk'; break;
      case 'olderIdxBody': did = restoreFiles(V, (n) => isIdx(n) || isBody(n)); faultDesc = 'olderIdxBody'; break;
      case 'olderAll': did = restoreFiles(V, (n) => isIdx(n) || isBody(n) || isCk(n)); faultDesc = 'olderAll'; break;
      case 'rbFolder': did = restoreFiles(V, () => true); faultDesc = 'rbFolder'; break;
      case 'swapIdx': case 'swapCk': case 'swapBody': case 'swapAnyKind': {
        if (!sibOf) break; const pred = fault === 'swapIdx' ? isIdx : fault === 'swapCk' ? isCk : fault === 'swapBody' ? isBody : ((n: string) => { const c = ['index.bin', 'checkpoint.bin', 'summary.json', 'scrub.json', 'marks.bin']; return c.includes(n) || isBody(n) || n === 'meta.json'; });
        const both = r() < 0.3; // a pair swap: also the reverse
        const anyK = pick(['index.bin', 'checkpoint.bin', 'summary.json', 'scrub.json', 'meta.json', 'meta.copy', 'marks.bin']); const vOrig = vfs.dirSnapshot(dirOf(V)); const predUsed = fault === 'swapAnyKind' ? ((n: string) => n === anyK) : pred; did = copyKind(V, sibOf, predUsed); if (fault === 'swapAnyKind') faultDesc = 'swapAnyKind[' + anyK + ']';
        if (did && both) copyKind(sibOf, V, predUsed, vOrig);   // a true swap: the sibling gets V's ORIGINAL file
        faultDesc = (fault === 'swapAnyKind' ? faultDesc : fault) + (sibOf.parent === V || V.parent === sibOf ? ':kin' : ':samechat') + (both ? ':both' : ''); if (did) targets.add(sibOf) && both; if (!both) targets.delete(sibOf); break; }
      case 'swapAllSets': { if (!sibOf) break; did = copyKind(V, sibOf, (n) => isIdx(n) || isCk(n) || isBody(n) || n === 'summary.json'); faultDesc = 'swapAllSets' + (sibOf.parent === V || V.parent === sibOf ? ':kin' : ':samechat'); break; }
      case 'swapOlderSibling': { if (!sibOf) break; const older = snaps.length ? pick(snaps) : null; if (!older) break; did = copyKind(V, sibOf, (n) => isIdx(n) || isCk(n) || isBody(n), older); faultDesc = 'swapOlderSibling' + (sibOf.parent === V || V.parent === sibOf ? ':kin' : ':samechat'); break; }
      case 'swapOtherChat': { const o = live().filter((q) => q.chat !== V.chat && files(q).length); if (!o.length) break; const q = pick(o); const kinds = pick([isIdx, isCk, isBody, (n: string) => isIdx(n) || isCk(n) || isBody(n)]); did = copyKind(V, q, kinds); faultDesc = 'swapOtherChat'; break; }
      case 'retireWitness': case 'retirePutBack': {
        const rs = retiredSnaps.length ? pick(retiredSnaps) : null; if (!rs) break; const rv = rs.v; const d = dirOf(rv); const aside = vfs.files().filter((f) => f.startsWith(root + '/aside/' + rv.hex + '-'));
        if (fault === 'retirePutBack') { // pre-retirement files put back into every subset of {index, ckpt, bodies, meta}
          const sub = [isIdx, isCk, isBody, (n: string) => n === 'summary.json' || n === 'scrub.json'].filter(() => r() < 0.6); if (!sub.length) sub.push(isIdx);
          const from = rs.snap; let ch = false; for (const [f, b] of from) { if (!f.startsWith(d)) continue; const n = name(f); if (sub.some((p) => p(n))) { vfs.put(f, b); ch = true; } }
          did = ch; faultDesc = 'retirePutBack'; targets.add(rv);
          // full pre-retirement folder put back
          if (r() < 0.4) { for (const [f, b] of from) if (f.startsWith(d)) vfs.put(f, b); faultDesc = 'retirePutBackAll'; }
        } else {
          const retiredJson = d + 'retired.json'; const w = r();
          // subsets of the two witnesses (aside folder, retired.json); "both" is documented limit 5 and is judged in the report
          const delA = w < 0.4 || w > 0.8, delJ = w >= 0.4 && w < 0.8 || w > 0.8; const both = delA && delJ;
          if (delA) for (const f of aside) vfs.put(f, null);
          if (delA) { for (const dd of [...vfs.vol.keys()]) if (dd.startsWith(root + '/aside/' + rv.hex + '-') && vfs.vol.get(dd) === 'D') { vfs.vol.delete(dd); vfs.base.delete(dd); } }
          if (delJ) vfs.put(retiredJson, null);
          did = true; faultDesc = 'retireWitness:' + (both ? 'both' : delA ? 'aside' : 'json'); targets.add(rv);
          // also put pre-retirement files back (what a backup restore would do)
          if (r() < 0.5) { for (const [f, b] of rs.snap) if (f.startsWith(d) && !/retired\.json$/.test(f)) vfs.put(f, b); faultDesc += '+putBack'; }
          if (both) faultDesc += ':LIMIT5';
        }
        break; }
      case 'rbRoot': { if (!sn) break; for (const f of vfs.files()) if (f.startsWith(root + '/') && !f.endsWith('/LOCK')) vfs.put(f, null); for (const [f, b] of sn) vfs.put(f, b); did = true; faultDesc = 'rbRoot'; for (const v of vers) targets.add(v); break; }
    }
  }
  faultKind = did ? faultDesc.split(' ')[0].split(':')[0].split('[')[0].replace(/\+.*/, '') : 'none';
  if (!crashMode && !did) faultDesc = 'none';
  note(`FAULT ${faultDesc} V=${V?.hex} targets=${[...targets].map((t) => t.hex).join(',')}`);
  if (process.env.R9_DBG) for (const v of vers) note(`  state ${v.hex.slice(0, 8)} retired=${v.retired} model=${v.lines.length} ev=${v.evicted} files=${files(v).map((f) => name(f) + ':' + vfs.get(f)!.length).join(' ')}`);
  const faulted = new Set([...targets].map((t) => t.hex));
  // optional crash during the first reopen's repair work
  if (did && r() < 0.3) {
    vfs.arm(1 + Math.floor(r() * 60), (['none', 'prefix', 'garbage'] as const)[Math.floor(r() * 3)]);
    try { const x = await openStore(); if (x) { try { for (const v of vers) { await x.head(v.id).catch(() => undefined); } await x.close(); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; } } } catch (e: any) { if (!(e instanceof Crash) && !vfs.dead && !typed(e)) viol('untyped-repair', err(e)); }
    vfs.disarm(); vfs.settle(r() < 0.5 ? 'power' : 'kill'); await dropLock(); note('repair crash');
  }

  // ---------------------------------- check ----------------------------------
  const quarantined = new Set<string>();
  async function check(tag: string, first: boolean): Promise<void> {
    const st = await openStore(); if (!st) { outcomes.push(`${tag}:open-refused`); viol('open-refused', tag); return; }
    for (const v of vers) {
      const isF = faulted.has(v.hex); const cls = (kind: string) => outcomes.push(`${tag}|${v.hex}|${isF ? 'F' : 'U'}|${kind}`);
      let hd: any;
      try { hd = await st.head(v.id); } catch (e: any) {
        if (!typed(e)) { viol('untyped-head', err(e)); continue; }
        if (e.code === 'damaged') {
          if (v.retired) { cls('retired-ok'); continue; }
          quarantined.add(v.hex); { const cf = vfs.files().find((f) => f.includes('/aside/' + v.hex + '-q') && f.endsWith('/COMPLETE')); cls('QUARANTINED:' + (cf ? vfs.get(cf)!.toString().replace(/\n/g, ' ').slice(0, 160) : String(e.message).slice(0, 60))); } if (!isF) viol('UNFAULTED-VERSION-QUARANTINED', `${v.hex} fault=${faultDesc} ${e.message}`);
          if (crashMode) viol('alarm-quarantine-in-crash-mode', err(e));
          // a retired id must refuse reads and appends
          try { await st.read(v.id, 0, 0, 0); } catch (e2: any) { if (!typed(e2)) viol('untyped-read-retired', err(e2)); }
          try { const a = await st.append(v.id, 0, v.lines.length, [mk('x')]); viol('RETIRED-ACCEPTED-APPEND2', String(a)); } catch (e2: any) { if (!typed(e2)) viol('untyped-append-retired', err(e2)); else if (e2.code !== 'damaged') viol('retired-append-other-code:' + e2.code, err(e2)); }
          continue;
        }
        if (v.retired) { cls('retired-other:' + e.code); continue; }
        cls('HEADERR:' + e.code); if (!isF || crashMode) viol('head-threw-' + e.code, `${v.hex} ${e.message.slice(0, 80)}`); continue;
      }
      if (v.retired) { viol('RETIRED-ID-SERVES', `${v.hex} head=${hd.lines} fault=${faultDesc}`); continue; }
      const flagged = hd.damagedFromLine !== null; const flagFrom = hd.damagedFromLine ?? Infinity;
      if (crashMode && (flagged || hd.rolledBack)) viol('alarm-flag-crash-mode', `${v.hex} ${flagFrom}`);
      if (!isF && flagged) viol('UNFAULTED-VERSION-FLAGGED', `${v.hex} from=${flagFrom} fault=${faultDesc}`);
      let unread = 0; let wrong = -1; let firstUnread = Infinity;
      const limit = Math.min(hd.lines, v.lines.length);
      for (let i = hd.evictedLines; i < limit; i++) {
        let g: any;
        try { g = await st.read(v.id, 0, i, i + 1); } catch (e: any) { if (!typed(e)) { viol('untyped-read', err(e)); break; } unread++; firstUnread = Math.min(firstUnread, i); if (!isF || crashMode) viol('UNFAULTED-READ-THREW:' + e.code, `${v.hex} line ${i}`); if (e.code === 'corrupt' && !flagged && !isF) viol('read-corrupt-unflagged', ''); continue; }
        if (g === 'evicted') continue;
        if (!Buffer.from(g[0]).equals(v.lines[i])) { wrong = i; break; }
      }
      if (wrong >= 0) viol('WRONG-LINE-SERVED', `${v.hex} line ${wrong} fault=${faultDesc} flagged=${flagged}/${flagFrom} head=${hd.lines} model=${v.lines.length}`);
      if (hd.lines > v.lines.length) {
        // more lines than were acknowledged: only parks draining can explain it, and the model already drains. Check the extra lines are NOT served as something else silently
        viol('HEAD-BEYOND-MODEL', `${v.hex} head=${hd.lines} model=${v.lines.length} fault=${faultDesc}`);
      }
      const short = Math.max(0, v.lines.length - hd.lines);
      let kind = 'intact';
      if (short > 0 && !flagged) { kind = 'SILENT-SHRINK'; viol('SILENT-SHRINK', `${v.hex} lost=${short} model=${v.lines.length} head=${hd.lines} fault=${faultDesc}`); }
      else if (short > 0) kind = 'flagged-shrink';
      else if (flagged) kind = 'flagged';
      else if (unread) kind = 'unread';
      if (hd.evictedLines > v.evicted) viol('evicted-more-than-asked', `${v.hex} ${hd.evictedLines}>${v.evicted}`);
      cls(kind + (flagged ? `|from=${flagFrom},model=${v.lines.length}` : '') + (short ? `|short=${short}` : '') + (hd.evictedLines ? '|evicted' : ''));
      if (first && isF && v.lines.length > 0 && hd.evictedLines === 0) {
        // fork FROM a faulted parent (before any heal): a typed refusal, or a child that holds exactly the acknowledged prefix
        try {
          const f = Math.floor(r() * (v.lines.length + 1)); const hAt = await st.hashAt(v.id, 0, f);
          if (hAt !== null) {
            const cid = deriveForkId(v.id, f, hAt, 'post-fault'); let res: any;
            try { res = await st.forkVersion(v.id, f, cid); } catch (e: any) { res = e; }
            if (res instanceof Error) { if (!typed(res)) viol('untyped-fork-from-faulted', err(res)); else if (!['evicted', 'corrupt', 'version-conflict', 'damaged', 'bad-argument'].includes((res as any).code)) viol('fork-from-faulted-code:' + (res as any).code, err(res)); else outcomes.push(`${tag}|${v.hex}|F|fork-refused:${(res as any).code}`); }
            else {
              outcomes.push(`${tag}|${v.hex}|F|fork-made`);
              const ch = await st.head(cid); if (ch.lines !== f) viol('FORK-WRONG-LENGTH', `${v.hex} f=${f} got ${ch.lines} fault=${faultDesc}`);
              for (let i = 0; i < Math.min(f, ch.lines); i++) { let g: any; try { g = await st.read(cid, 0, i, i + 1); } catch (e: any) { viol('FORK-CHILD-UNREADABLE', `${v.hex} line ${i} fault=${faultDesc} ${e?.code}`); break; } if (!Buffer.from(g[0]).equals(v.lines[i])) { viol('FORK-CHILD-WRONG-LINE', `${v.hex} line ${i} f=${f} fault=${faultDesc}`); break; } }
            }
          }
        } catch (e: any) { if (!typed(e)) viol('untyped-fork-probe', err(e)); }
      }
      if (first && (isF || true)) {
        // heal: a caller resends everything it holds; afterwards the version must hold all of it, byte for byte, and nothing may be flagged
        try {
          let from = Math.min(flagged ? Math.min(flagFrom, hd.lines) : hd.lines, firstUnread); if (hd.evictedLines > from) from = Math.min(hd.lines, Math.max(hd.evictedLines, 0));
          const target = v.lines.length; let g = 0; let refused = '';
          while (from < target && g++ < 60) { const to = Math.min(target, from + 40); const res = await st.append(v.id, 0, from, v.lines.slice(from, to)); if (res !== 'ok') { refused = res; break; } from = to; }
          if (refused) { viol('resend-refused:' + refused, `${v.hex} fault=${faultDesc}`); }
          else {
            const h2 = await st.head(v.id);
            if (v.evicted === 0 || hd.evictedLines === 0) {
              if (h2.lines !== v.lines.length) viol('head-wrong-after-resend', `${v.hex} ${h2.lines} vs ${v.lines.length}`);
              for (let i = h2.evictedLines; i < Math.min(h2.lines, v.lines.length); i++) { let g2: any; try { g2 = await st.read(v.id, 0, i, i + 1); } catch (e: any) { if (!typed(e)) viol('untyped-read-after-resend', err(e)); else viol('READ-THREW-AFTER-RESEND:' + e.code, `${v.hex} line ${i} fault=${faultDesc}`); break; } if (g2 !== 'evicted' && !Buffer.from(g2[0]).equals(v.lines[i])) { viol('WRONG-LINE-after-resend', `${v.hex} ${i}`); break; } }
            }
          }
        } catch (e: any) { if (!typed(e)) viol('untyped-resend', err(e)); else if (!['evicted'].includes(e.code)) viol('resend-threw:' + e.code, `${v.hex} fault=${faultDesc} ${e.message.slice(0, 80)}`); }
        try { await st.verify(v.id); } catch (e: any) { if (!typed(e)) viol('untyped-verify', err(e)); }
      }
    }
    try { await st.close(); } catch (e: any) { if (!typed(e)) viol('untyped-close', err(e)); }
  }
  try { await check('first', true); await check('second', false); } catch (e: any) { if (e instanceof Crash) viol('harness-crash', ''); else viol('harness-error', err(e)); }
  await fsp.rm(tmp, { recursive: true, force: true });
  return { seed, fault: faultDesc, faultKind, outcomes, viols: viols.map((x) => `${x.kind}`), viols_detail: viols, stats, trace: (viols.length || process.env.R9_DBG) ? trace : undefined };
}

test('r9 fuzz', async () => {
  for (let seed = FROM; seed <= TO; seed++) {
    let v: any;
    try { v = await run(seed); } catch (e: any) { v = { seed, fault: '', outcomes: [], viols: ['HARNESS-THROW'], viols_detail: [{ kind: 'HARNESS-THROW', detail: String(e?.stack).slice(0, 400) }] }; }
    const slim = { seed: v.seed, fault: v.fault, faultKind: v.faultKind, outcomes: v.outcomes, viols: v.viols, stats: v.stats };
    fs.appendFileSync(OUT, JSON.stringify(slim) + '\n');
    if (v.viols.length || process.env.R9_DBG) fs.appendFileSync(OUT + '.detail', JSON.stringify({ seed: v.seed, fault: v.fault, viols: v.viols_detail, trace: v.trace }) + '\n');
  }
}, 7 * 24 * 3600 * 1000);
