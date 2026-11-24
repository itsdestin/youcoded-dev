// Reviewer-6 fuzz: own generator, own oracle, own fault catalogue. The crash model is the virtual disk of reviewer 5 (vfs.ts, copied) - a shim, not an oracle.
// Invariant judged: after reopening, every ACKNOWLEDGED line is present and byte-identical at its position, or the loss is REPORTED
// (typed error / head.damagedFromLine / head.rolledBack / version unavailable with a typed code / a verified set-aside tail). Never silent wrong, never silent missing, never untyped.
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
const SRC = process.env.R6_SRC ?? '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store';
const { ChatStore } = await import(SRC + '/store');
const { StoreError } = await import(SRC + '/errors');
const { readHw } = await import(SRC + '/highwater');
import { VFS, Crash } from './vfs';

const FROM = Number(process.env.R6_FROM ?? 1), TO = Number(process.env.R6_TO ?? 100);
const OUT = process.env.R6_OUT ?? '/tmp/r6-out.jsonl';
const ONLY = process.env.R6_FAULTS ? process.env.R6_FAULTS.split(',') : null;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest();
function prng(seed: number) { let a = (seed * 2654435761 + 12345) >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }
const seed0 = (chat: string) => createHash('sha256').update(Buffer.from(chat)).update(Buffer.alloc(4)).digest();
function chainTo(chat: string, lines: Buffer[], n: number) { let h = seed0(chat); for (let i = 0; i < n; i++) h = createHash('sha256').update(h).update(lines[i]).digest(); return h.toString('hex'); }
function chainAll(chat: string, lines: Buffer[]) { let h = seed0(chat); const out = [h.toString('hex')]; for (const l of lines) { h = createHash('sha256').update(h).update(l).digest(); out.push(h.toString('hex')); } return out; }

interface Ver { id: Buffer; key: string; chat: string; canon: Buffer[]; ref: string[]; acked: number; evictPossible: number; evictEver: number; tails: { tid: string; from: number }[]; pend: { tid: string; from: number }[]; parkedEnd: number; sacrificed: boolean }
export interface Viol { seed: number; kind: string; sev: 'DATA' | 'REPORT' | 'INFO'; detail: string; fault: string; trace: string[] }

const STATS: Record<string, number> = {};
const bump = (k: string) => { STATS[k] = (STATS[k] ?? 0) + 1; };

function mkLine(r: () => number, tag: string, i: number): Buffer {
  const pad = 'x'.repeat(Math.floor(r() * (r() < 0.08 ? 1500 : 220)));
  const nonce = Math.floor(r() * 1e12).toString(16);
  const k = r();
  if (k < 0.5) return Buffer.from(JSON.stringify({ type: 'user', uuid: `${tag}-${i}-${nonce}`, message: { role: 'user', content: `${tag}#${i}#${pad}` } }) + '\n');
  return Buffer.from(JSON.stringify({ type: 'assistant', uuid: `${tag}-${i}-${nonce}`, message: { id: `m${i >> 1}`, stop_reason: r() < 0.5 ? 'end_turn' : 'tool_use', content: [{ type: 'text', text: `${tag}#${i}#${pad}` }] } }) + '\n');
}

const norm = (rel: string) => rel.replace(/versions\/[0-9a-f]+\//, 'V/').replace(/aside\/[^/]+\//, 'A/').replace(/highwater\/[0-9a-f]+/, 'HW').replace(/[0-9a-f]{16,}/g, 'H').replace(/\d+/g, 'N');

async function run(seed: number): Promise<Viol[]> {
  const r = prng(seed);
  const tmp = await fsp.mkdtemp(nodePath.join(process.env.TMPDIR ?? os.tmpdir(), 'r6-'));
  const root = nodePath.join(tmp, 'store'); await fsp.mkdir(root);
  const vfs = new VFS(r);
  { let p = ''; for (const seg of root.split('/').filter(Boolean)) { p += '/' + seg; vfs.base.set(p, 'D'); vfs.vol.set(p, 'D'); } }
  const trace: string[] = []; const viols: Viol[] = [];
  let faultDesc = 'none'; let faultClass = 'none'; let affected: Set<string> = new Set(); let faultTouchesHw = false;
  const note = (s: string) => trace.push(s);
  const seen = new Set<string>();
  const viol = (kind: string, sev: Viol['sev'], detail: string) => { const k = kind + sev + faultClass; if (seen.has(k)) return; seen.add(k); viols.push({ seed, kind, sev, detail, fault: faultDesc, trace: trace.slice(-Number(process.env.R6_TRACE ?? 60)) }); };
  const typed = (e: unknown) => e instanceof StoreError;
  const err = (e: any) => (e instanceof StoreError ? `StoreError(${e.code}): ${e.message}` : `${e?.constructor?.name}: ${e?.message}\n${String(e?.stack).split('\n').slice(1, 4).join('|')}`);

  const long = r() < 0.3;
  const N = long ? 900 : 300;
  const chatA = 'r6:chat-A'; const sameChat = r() < 0.4;
  const chatB = sameChat ? chatA : 'r6:chat-B';
  const A = Array.from({ length: N }, (_, i) => mkLine(r, 'A', i));
  const split = Math.floor(r() * N);
  const B = sameChat ? A.slice(0, split).concat(Array.from({ length: N - split }, (_, i) => mkLine(r, 'B', split + i))) : Array.from({ length: N }, (_, i) => mkLine(r, 'B', i));
  const mk = (id: Buffer, chat: string, canon: Buffer[]): Ver => ({ id, key: id.toString('hex'), chat, canon, ref: chainAll(chat, canon), acked: 0, evictPossible: 0, evictEver: 0, tails: [], pend: [], parkedEnd: 0, sacrificed: false });
  const vers: Ver[] = [mk(Buffer.from([0xa1, 1, 7, 9]), chatA, A), mk(Buffer.from([0xa2, 2, 7, 9]), chatB, B)];
  const chunkBytes = [700, 1500, 4000, 16 << 20][Math.floor(r() * 4)];
  let clock = 1_700_000_000_000;
  const dropLock = async () => { for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(nodePath.join(root, n), { force: true }); };
  const opts = () => ({ fs: vfs as any, chunkBytes, scrubOnOpenBytes: r() < 0.5 ? 0 : 1 << 20, proofVerifier: () => true, now: () => (clock += 1000) });
  const snaps: { files: Map<string, Buffer>; clean: boolean; acked: number[]; hw: number[] }[] = [];
  let buildPhase = true;

  async function openStore(): Promise<any> {
    for (let a = 0; a < 2; a++) {
      try {
        const s = await ChatStore.open(root, opts());
        for (const v of vers) { try { await s.registerVersion(v.id, { chatId: v.chat, runtime: 'claude-code' }); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; note(`register ${v.key.slice(0, 4)} ${err(e)}`); if (!typed(e)) viol('untyped-register', 'DATA', err(e)); else if (buildPhase && faultClass === 'none') viol('register-refused-no-fault', 'REPORT', err(e)); } }
        return s;
      } catch (e: any) {
        if (e instanceof Crash || vfs.dead) throw e;
        if (typed(e) && /store-locked/.test(e.code) && a === 0) { await dropLock(); continue; }
        note('open ' + err(e)); if (!typed(e)) viol('untyped-open', 'DATA', err(e)); else viol('open-refused', faultClass === 'none' ? 'REPORT' : 'INFO', err(e)); return null;
      }
    }
    return null;
  }

  // ---------- one session of random operations; crash optional ----------
  async function session(crashAfter: number | null, tear: 'none' | 'prefix' | 'garbage', power: boolean, nops: number): Promise<boolean> {
    let crashed = false; let s: any = null; vfs.disarm(); let lastPend: { v: Ver; tid: string } | null = null;
    if (crashAfter !== null) vfs.arm(crashAfter, tear);
    try {
      s = await openStore(); if (!s) return false;
      for (const v of vers) for (const p of [...v.pend]) if (r() < 0.5) { try { await s.setAsideTail(p.tid, v.id, p.from); v.tails.push({ tid: p.tid, from: p.from }); v.pend = v.pend.filter((x) => x.tid !== p.tid); note('retry tail ' + p.tid); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; if (!typed(e)) viol('untyped-tail-retry', 'DATA', err(e)); } }
      for (let k = 0; k < nops; k++) {
        const v = vers[r() < 0.7 ? 0 : 1]; const op = r();
        let head: any = null; try { head = await s.head(v.id); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; if (buildPhase && faultClass === 'none') viol('head-threw-in-build', 'REPORT', err(e)); continue; }
        const h = head.lines as number;
        try {
          if (op < 0.45) {
            const back = r() < 0.15 ? Math.min(h, Math.floor(r() * 4)) : 0; const from = h - back; const cnt = 1 + Math.floor(r() * (long ? 260 : 40)); const to = Math.min(v.canon.length, from + cnt); if (to <= from) continue;
            note(`${v.key.slice(0, 4)} append ${from}..${to}`);
            const res = await s.append(v.id, 0, from, v.canon.slice(from, to));
            if (res === 'ok') v.acked = Math.max(v.acked, to); else if (res === 'not-a-prefix') viol('build-append-not-a-prefix', 'DATA', `from=${from} head=${h}`);
          } else if (op < 0.53) {
            const from = h + 2 + Math.floor(r() * 8); const to = Math.min(v.canon.length, from + 1 + Math.floor(r() * 5)); if (to <= from) continue;
            note(`${v.key.slice(0, 4)} park ${from}..${to}`);
            const res = await s.append(v.id, 0, from, v.canon.slice(from, to)); if (res === 'parked') v.parkedEnd = Math.max(v.parkedEnd, to);
          } else if (op < 0.61) {
            if (h < 3) continue; const from = Math.floor(r() * h); const tid = Math.floor(r() * 2 ** 48).toString(16).padStart(12, '0');
            note(`${v.key.slice(0, 4)} setAsideTail ${from} ${tid}`);
            v.pend.push({ tid, from }); lastPend = { v, tid };
            await s.setAsideTail(tid, v.id, from); lastPend = null; v.tails.push({ tid, from }); v.pend = v.pend.filter((p) => p.tid !== tid);
          } else if (op < 0.69) {
            if (h < 3) continue; const through = 1 + Math.floor(r() * h); const hh = await s.hashAt(v.id, 0, through); if (!hh) continue;
            v.evictPossible = Math.max(v.evictPossible, through); v.evictEver = Math.max(v.evictEver, through); note(`${v.key.slice(0, 4)} evict ${through}`);
            await s.evictBody(v.id, { kind: 'holders-confirmed', version: v.key, through, hash: hh, acks: [{ holder: 'p', version: v.key, lines: through, hash: hh, signature: 's' }] });
          } else if (op < 0.75) {
            if (!head.evictedLines) continue; note(`${v.key.slice(0, 4)} restore ${head.evictedLines}`);
            await s.restoreBody(v.id, v.canon.slice(0, head.evictedLines));
            const h2 = await s.head(v.id); if (h2.evictedLines === 0) v.evictPossible = 0;
          } else if (op < 0.83) { note('scrub'); await s.scrubStep(v.id, { maxBytes: 1 << 20 }); }
          else if (op < 0.93) { // close and reopen inside the session
            note('close+reopen'); await s.close(); s = null; s = await openStore(); if (!s) return false;
          } else if (op < 0.945 && !long) { note(`${v.key.slice(0, 4)} setAsideDamaged`); v.sacrificed = true; v.acked = 0; v.tails = []; v.pend = []; v.parkedEnd = 0; await s.setAsideDamaged(v.id); v.evictPossible = 0; try { await s.registerVersion(v.id, { chatId: v.chat, runtime: 'claude-code' }); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; } }
        } catch (e: any) {
          if (e instanceof Crash || vfs.dead) throw e;
          note(`op threw ${err(e)}`); if (lastPend) { lastPend.v.pend = lastPend.v.pend.filter((x) => x.tid !== lastPend!.tid); lastPend = null; }
          if (!typed(e)) viol('untyped-op', 'DATA', err(e));
          else if (buildPhase && faultClass === 'none' && !['limit', 'bad-proof', 'evicted', 'parked-full', 'bad-argument'].includes((e as any).code)) viol('op-refused-no-fault', 'REPORT', err(e));
        }
      }
    } catch (e: any) { if (e instanceof Crash || vfs.dead) crashed = true; else { note('session threw ' + err(e)); viol('session-threw', typed(e) ? 'REPORT' : 'DATA', err(e)); } }
    if (!crashed && s) { try { await s.close(); } catch (e: any) { if (e instanceof Crash || vfs.dead) crashed = true; else { viol('close-threw', typed(e) ? 'REPORT' : 'DATA', err(e)); } } }
    if (vfs.dead) crashed = true;
    vfs.disarm();
    if (crashed) { vfs.settle(power ? 'power' : 'kill'); await dropLock(); bump('crash'); note(`CRASH settle=${power ? 'power' : 'kill'}`); }
    return crashed;
  }
  const snap = (clean: boolean) => { snaps.push({ files: vfs.dirSnapshot(root + '/'), clean, acked: vers.map((v) => v.acked), hw: [0, 0] }); if (snaps.length > 4) snaps.shift(); };

  // ---------- build phase ----------
  const nsess = 2 + Math.floor(r() * 3);
  for (let i = 0; i < nsess; i++) {
    const crash = r() < 0.5; const c = await session(crash ? 1 + Math.floor(r() * (long ? 160 : 70)) : null, (['none', 'prefix', 'garbage'] as const)[Math.floor(r() * 3)], r() < 0.7, 2 + Math.floor(r() * 6));
    snap(!c);
  }
  // targeted preparation: park / evict / tail states exist at the moment of the fault (the shapes F1, F4, F5 and F2 lived in)
  const prepKind = process.env.R6_PREP ?? ['none', 'park', 'evict', 'tail', 'evict2', 'park'][Math.floor(r() * 6)];
  if (prepKind !== 'none') {
    let s: any = null; vfs.disarm();
    try {
      s = await openStore();
      if (s) for (const v of vers) {
        let hd: any; try { hd = await s.head(v.id); } catch { continue; } const h = hd.lines;
        if (prepKind === 'park') { for (const [a, b] of [[3, 6], [9, 12], [20, 25], [4, 8]] as [number, number][]) { const from = h + a, to = Math.min(v.canon.length, h + b); if (to > from) { const res = await s.append(v.id, 0, from, v.canon.slice(from, to)); if (res === 'parked') v.parkedEnd = Math.max(v.parkedEnd, to); } } note('prep park'); }
        if (prepKind === 'evict' || prepKind === 'evict2') {
          if (h < 8) { const to = Math.min(v.canon.length, h + 40); await s.append(v.id, 0, h, v.canon.slice(h, to)); v.acked = Math.max(v.acked, to); }
          const hh0 = (await s.head(v.id)).lines;
          for (const frac of prepKind === 'evict' ? [0.5] : [0.3, 0.7]) { const through = Math.max(1, Math.floor(hh0 * frac)); const hh = await s.hashAt(v.id, 0, through); if (!hh) continue; v.evictPossible = Math.max(v.evictPossible, through); v.evictEver = Math.max(v.evictEver, through); await s.evictBody(v.id, { kind: 'holders-confirmed', version: v.key, through, hash: hh, acks: [{ holder: 'p', version: v.key, lines: through, hash: hh, signature: 's' }] }); if (prepKind === 'evict2') { await s.close(); s = await openStore(); if (!s) break; } }
          note('prep ' + prepKind);
        }
        if (prepKind === 'tail' && h >= 6) { const tid = Math.floor(r() * 2 ** 48).toString(16).padStart(12, '0'); const from = Math.floor(h / 2); v.pend.push({ tid, from }); try { await s.setAsideTail(tid, v.id, from); v.tails.push({ tid, from }); v.pend = v.pend.filter((p) => p.tid !== tid); const to = Math.min(v.canon.length, from + 12); await s.append(v.id, 0, from, v.canon.slice(from, to)); } catch (e: any) { if (e instanceof Crash) throw e; v.pend = v.pend.filter((p) => p.tid !== tid); if (!typed(e)) throw e; } note('prep tail'); }
      }
    } catch (e: any) { if (!(e instanceof Crash) && !typed(e)) viol('prep-untyped', 'DATA', err(e)); }
    try { if (s) await s.close(); } catch { /* */ }
    snap(true);
  }
  // a final clean-ish session so every run has data; sometimes leave a crashed state
  // ---------- ONE fault ----------
  const hwNoted: number[] = [];
  for (const v of vers) { try { const hw = await readHw(vfs as any, root, v.key); hwNoted.push(hw.noted); } catch { hwNoted.push(-1); } }
  const files = () => vfs.files().map((f) => f.slice(root.length + 1)).filter((f) => !/^LOCK/.test(f));
  const keyOfRel = (rel: string) => { const m = /^(?:versions\/|aside\/|highwater\/)([0-9a-f]+)/.exec(rel); if (!m) return null; const k = m[1].replace(/-q?\d+$/, ''); return vers.find((v) => k.startsWith(v.key) || v.key.startsWith(k))?.key ?? null; };
  const FAULTS = ['flip', 'flip', 'overwrite', 'truncate', 'truncrec', 'zero', 'zerorange', 'delete', 'delete', 'older', 'older', 'sibling', 'sibling', 'swap', 'foreign', 'dup', 'rbExact', 'rbOverlay', 'rbPartial', 'hwOlder', 'hwDelete', 'rbPlusHw', 'rbPartialPlusHw', 'none'];
  let fault = ONLY ? ONLY[Math.floor(r() * ONLY.length)] : FAULTS[Math.floor(r() * FAULTS.length)];
  const pickVer = () => vers[r() < 0.7 ? 0 : 1];
  const all = files();
  const inV = (v: Ver) => all.filter((f) => f.startsWith(`versions/${v.key}/`));
  let docClass = '';
  {
    const tv = pickVer(); const pool = r() < 0.9 ? inV(tv) : all.filter((f) => !f.startsWith('versions/'));
    const target = pool.length ? pool[Math.floor(r() * pool.length)] : null;
    const abs = (rel: string) => root + '/' + rel;
    const killcrit = (rel: string) => /index\.bin|checkpoint\.bin|body-|parked|tails|marks|meta|summary/.test(rel);
    const killRe = /index\.bin|checkpoint\.bin|body-|parked|tails|marks|meta|summary/; const focusRe = prepKind === 'park' ? /parked|rejected/ : prepKind === 'tail' ? /tails/ : prepKind.startsWith('evict') ? /index\.bin|checkpoint|marks|\.hw|replaced-index|summary/ : /index\.bin|checkpoint\.bin|body-|parked|tails|marks|meta|summary/; const fAll = [...inV(tv), ...all.filter((f) => f.startsWith('highwater/'))]; const bias = fAll.filter((f) => (prepKind !== 'none' && r() < 0.8 ? focusRe : killRe).test(f)); const tgt = r() < 0.6 && bias.length ? bias[Math.floor(r() * bias.length)] : target;
    const kv = tgt ? keyOfRel(tgt) : tv.key; if (kv) affected.add(kv);
    if (fault === 'none') { faultClass = 'none'; }
    else if (['flip', 'overwrite', 'truncate', 'truncrec', 'zero', 'zerorange', 'delete', 'dup'].includes(fault) && tgt) {
      const b = vfs.get(abs(tgt))!; const pos = Math.floor(r() * Math.max(1, b.length));
      const headerish = r() < 0.3; const p = headerish ? Math.min(b.length - 1, Math.floor(r() * 64)) : pos;
      if (fault === 'flip' && b.length) { const c = Buffer.from(b); c[p] ^= 1 << Math.floor(r() * 8); vfs.put(abs(tgt), c); }
      else if (fault === 'overwrite' && b.length) { const c = Buffer.from(b); c[p] = (c[p] + 1 + Math.floor(r() * 255)) & 255; vfs.put(abs(tgt), c); }
      else if (fault === 'truncate' && b.length > 1) vfs.put(abs(tgt), b.subarray(0, 1 + Math.floor(r() * (b.length - 1))));
      else if (fault === 'truncrec') {
        const cuts: number[] = [];
        if (/index\.bin$/.test(tgt)) for (let o = 36; o < b.length; o += 116) cuts.push(o);
        if (/checkpoint\.bin$|\.hw$|marks\.bin$/.test(tgt)) for (const o of [128, 256, 512, 1024]) cuts.push(o);
        for (let i = b.indexOf(0x0a); i !== -1; i = b.indexOf(0x0a, i + 1)) cuts.push(i + 1);
        for (const o of [4, 8, 16, 32, 37, 64]) for (let q = o; q < b.length; q += o) if (r() < 0.05) cuts.push(q);
        const c = cuts.filter((o) => o < b.length); if (c.length) vfs.put(abs(tgt), b.subarray(0, c[Math.floor(r() * c.length)])); else faultClass = 'none';
      }
      else if (fault === 'zero') vfs.put(abs(tgt), Buffer.alloc(0));
      else if (fault === 'zerorange' && b.length) { const c = Buffer.from(b); c.fill(0, p, Math.min(c.length, p + 1 + Math.floor(r() * 300))); vfs.put(abs(tgt), c); }
      else if (fault === 'delete') vfs.put(abs(tgt), null);
      else if (fault === 'dup' && b.length) vfs.put(abs(tgt), Buffer.concat([b, b.subarray(0, Math.min(b.length, 40))]));
      if (faultClass !== 'none' || true) { faultClass = fault; faultDesc = `${fault} ${tgt}`; }
      if (/^highwater\//.test(tgt)) faultTouchesHw = true;
    } else if (fault === 'older' && tgt) {
      const sn = snaps.length ? snaps[Math.floor(r() * snaps.length)] : null; const ob = sn?.files.get(abs(tgt));
      if (!sn) { faultClass = 'none'; fault = 'none'; } else { const cur = vfs.get(abs(tgt)); if (ob === undefined) vfs.put(abs(tgt), null); else if (cur && cur.equals(ob)) { faultClass = 'none'; fault = 'none'; } else vfs.put(abs(tgt), ob); if (fault !== 'none') { faultClass = 'older'; faultDesc = `older ${tgt}`; if (/^highwater\//.test(tgt)) faultTouchesHw = true; } }
    } else if ((fault === 'sibling' || fault === 'foreign' || fault === 'swap') && tgt) {
      const k = norm(tgt); const b = vfs.get(abs(tgt))!;
      const sameFolder = all.filter((f) => f !== tgt && norm(f) === k && f.split('/').slice(0, 2).join('/') === tgt.split('/').slice(0, 2).join('/') && !vfs.get(abs(f))!.equals(b));
      const other = all.filter((f) => f !== tgt && norm(f) === k && f.split('/').slice(0, 2).join('/') !== tgt.split('/').slice(0, 2).join('/') && !vfs.get(abs(f))!.equals(b));
      // donors from older snapshots too (a sibling of an older state)
      const snapDon: Buffer[] = []; for (const sn of snaps) for (const [f, bb] of sn.files) { const rel = f.slice(root.length + 1); if (rel !== tgt && norm(rel) === k && !bb.equals(b)) snapDon.push(bb); }
      let done = false;
      if (fault === 'swap' && sameFolder.length) { const o = sameFolder[Math.floor(r() * sameFolder.length)]; const ob = vfs.get(abs(o))!; vfs.put(abs(tgt), ob); vfs.put(abs(o), b); faultDesc = `swap ${tgt} <-> ${o}`; done = true; }
      else if (fault === 'sibling') { const pickfrom = r() < 0.5 && sameFolder.length ? sameFolder : sameFolder.length ? sameFolder : []; if (pickfrom.length) { const o = pickfrom[Math.floor(r() * pickfrom.length)]; vfs.put(abs(tgt), vfs.get(abs(o))!); faultDesc = `sibling ${tgt} <- ${o}`; done = true; } else if (snapDon.length) { vfs.put(abs(tgt), snapDon[Math.floor(r() * snapDon.length)]); faultDesc = `sibling(snap) ${tgt}`; done = true; } }
      else if (fault === 'foreign') { if (other.length) { const o = other[Math.floor(r() * other.length)]; vfs.put(abs(tgt), vfs.get(abs(o))!); faultDesc = `foreign ${tgt} <- ${o}`; done = true; } }
      if (done) { faultClass = fault; if (/^highwater\//.test(tgt)) faultTouchesHw = true; } else { faultClass = 'none'; fault = 'none'; }
    } else if (fault.startsWith('rb') || fault.startsWith('hw')) {
      const sn = snaps.length ? snaps[Math.floor(r() * snaps.length)] : null; const pre = root + `/versions/${tv.key}/`; const hwp = root + `/highwater/${tv.key}.hw`;
      if (!sn && !fault.startsWith('hw')) { faultClass = 'none'; fault = 'none'; }
      else {
        const here = vfs.files().filter((f) => f.startsWith(pre)); const then = sn ? [...sn.files.keys()].filter((f) => f.startsWith(pre)) : [];
        if (fault === 'rbExact' || fault === 'rbPlusHw') { for (const f of here) vfs.put(f, null); for (const f of then) vfs.put(f, sn!.files.get(f)!); }
        else if (fault === 'rbOverlay') { for (const f of then) vfs.put(f, sn!.files.get(f)!); }
        else if (fault === 'rbPartial' || fault === 'rbPartialPlusHw') { for (const f of then) if (r() < 0.5) vfs.put(f, sn!.files.get(f)!); for (const f of here) if (!sn!.files.has(f) && r() < 0.3) vfs.put(f, null); }
        if (fault === 'rbPlusHw' || fault === 'rbPartialPlusHw' || fault === 'hwOlder') { const o = sn?.files.get(hwp); vfs.put(hwp, o ?? null); faultTouchesHw = true; }
        if (fault === 'hwDelete') { vfs.put(hwp, null); faultTouchesHw = true; }
        affected.add(tv.key); faultClass = fault; faultDesc = `${fault} v=${tv.key.slice(0, 4)} snapAcked=${sn?.acked[vers.indexOf(tv)]} hwNoted=${hwNoted[vers.indexOf(tv)]}`;
        // documented limit (4): record rolled back WITH the folder is undetectable; record never saw the head: under-reports
        docClass = fault.includes('PlusHw') ? 'doc-limit:hw-rolled-with-folder' : '';
      }
    } else { faultClass = 'none'; fault = 'none'; }
  }
  note(`FAULT ${faultDesc} (hwNoted=${hwNoted})`); if (process.env.R6_DUMP) note('FILES-AFTER-FAULT ' + files().filter((f) => !f.includes('/body-')).join(' '));
  bump('fault-' + faultClass);
  if (process.env.R6_DUMP) for (const v of vers) { try { const hw = await readHw(vfs as any, root, v.key); note(`HW ${v.key.slice(0,4)} ${JSON.stringify(hw.st.value)} kind=${hw.st.kind}`); } catch (e: any) { note('HW err ' + e?.message); } }
  buildPhase = false;
  // optional crash during the repair on first reopen
  if (faultClass !== 'none' && r() < 0.25) { note('repair-crash session'); await session(1 + Math.floor(r() * 40), 'prefix', r() < 0.7, 0); }

  // ---------- check ----------
  const isRollback = faultClass.startsWith('rb') || faultClass === 'older' || faultClass.startsWith('hw');
  const firstRb: ({ from: number; had: number } | null)[] = [null, null];
  async function check(tag: string, prevHeads: number[] | null): Promise<number[] | null> {
    const s = await openStore(); if (!s) { viol('cannot-open-store', faultClass === 'none' ? 'REPORT' : 'INFO', tag); return null; }
    const heads: number[] = [];
    for (let vi = 0; vi < vers.length; vi++) {
      const v = vers[vi]; const collateral = !affected.has(v.key) && faultClass !== 'none';
      let head: any;
      try { head = await s.head(v.id); }
      catch (e: any) {
        note(`${tag} head(${vi}) ${err(e)}`);
        if (!typed(e)) { viol('untyped-head', 'DATA', err(e)); heads.push(-1); continue; }
        if (faultClass === 'none') viol('unavailable-without-fault', 'REPORT', err(e)); else if (collateral) viol('collateral-unavailable', 'DATA', err(e)); else { bump('unavailable-' + faultClass); viol('version-unavailable-' + faultClass, 'INFO', err(e)); }
        heads.push(-1); continue;
      }
      heads.push(head.lines); if (process.env.R6_DUMP) note(`${tag} HEAD v${vi} ${JSON.stringify({ l: head.lines, ev: head.evictedLines, dmg: head.damagedFromLine, rb: head.rolledBack, stale: head.conversationChainStale })} files=${vfs.files().filter((f) => f.includes('/' + v.key + '/') && !f.includes('/body-')).map((f) => f.slice(root.length + 1 + 9 + 8)).join(',')}`);
      if (!prevHeads) firstRb[vi] = head.rolledBack; else if (firstRb[vi] && head.lines < firstRb[vi]!.had && !head.rolledBack && head.damagedFromLine === null) viol('rollback-report-evaporated', 'DATA', `first=${JSON.stringify(firstRb[vi])} second head=${head.lines}`);
      const flagged = head.damagedFromLine !== null || head.rolledBack !== null;
      const flagFrom = Math.min(head.damagedFromLine ?? Infinity, head.rolledBack?.from ?? Infinity);
      if (head.lines > v.canon.length) { viol('head-beyond-canon', 'DATA', `lines=${head.lines}`); continue; }
      if (head.hash !== v.ref[head.lines]) viol('head-hash-wrong', 'DATA', `lines=${head.lines} flagged=${flagged}`);
      const evLim = isRollback ? v.evictEver : v.evictPossible; if (head.evictedLines > evLim) viol('evicted-without-evict', 'DATA', `evictedLines=${head.evictedLines} possible=${v.evictPossible}`);
      if (faultClass === 'none' && flagged && !v.sacrificed) viol('false-alarm-without-fault', 'REPORT', `damagedFromLine=${head.damagedFromLine} rolledBack=${JSON.stringify(head.rolledBack)}`);
      if (faultClass === 'none' && head.rolledBack) viol('rolledBack-without-fault', 'REPORT', JSON.stringify(head.rolledBack));
      // every line the store claims to hold
      let corruptReads = 0;
      for (let i = 0; i < head.lines; i++) {
        let got: any;
        try { got = await s.read(v.id, 0, i, i + 1); }
        catch (e: any) { if (!typed(e)) { viol('untyped-read', 'DATA', err(e)); break; } corruptReads++; if (!flagged) viol('read-threw-unflagged', 'INFO', `line ${i} ${err(e)}`); else if (flagFrom > i && e.code === 'corrupt') viol('read-threw-before-flag', 'INFO', `line ${i} flagFrom=${flagFrom}`); if (faultClass === 'none') viol('read-threw-no-fault', 'REPORT', err(e)); continue; }
        if (got === 'evicted') { if (i >= (isRollback ? v.evictEver : v.evictPossible)) viol('read-evicted-without-evict', 'DATA', `line ${i}`); continue; }
        if (!Array.isArray(got) || got.length !== 1 || !Buffer.from(got[0]).equals(v.canon[i])) { viol('WRONG-LINE-SERVED', 'DATA', `line ${i} head=${head.lines} flagged=${flagged} ${isRollback ? docClass : ''}`); break; }
      }
      if (corruptReads) bump('reads-corrupt-typed');
      // hashAt spot checks
      for (let t = 0; t < 3 && head.lines > 0; t++) { const n = Math.floor(r() * (head.lines + 1)); try { const hh = await s.hashAt(v.id, 0, n); if (typeof hh === 'string' && hh !== v.ref[n]) viol('hashAt-wrong', 'DATA', `n=${n}`); } catch (e: any) { if (!typed(e)) viol('untyped-hashAt', 'DATA', err(e)); } }
      // acknowledged lines past the head
      if (!v.sacrificed) {
        let tailCover: { from: number; to: number }[] = []; const tailReported: number[] = [];
        for (const t of [...v.tails, ...v.pend]) { try { const tr = await s.tail(t.tid, v.id); if (tr) { let ok = true; for (let i = 0; i < tr.lines.length; i++) if (!Buffer.from(tr.lines[i]).equals(v.canon[tr.fromLine + i])) ok = false; if (!ok) viol('tail-WRONG-BYTES', 'DATA', t.tid); else tailCover.push({ from: tr.fromLine, to: tr.fromLine + tr.lines.length }); } else if (v.tails.some((x) => x.tid === t.tid)) viol('tail-vanished', isRollback ? 'INFO' : 'DATA', `tid ${t.tid} from ${t.from} (rollback => documented limit 4 when the tail was set after the snapshot)`); } catch (e: any) { if (!typed(e)) viol('untyped-tail', 'DATA', err(e)); else { bump('tail-typed-' + e.code); tailReported.push(t.from); if (faultClass === 'none') viol('tail-threw-no-fault', 'REPORT', err(e)); } } }
        let firstSilent = -1, silentN = 0;
        for (let i = head.lines; i < v.acked; i++) {
          if (flagged && flagFrom <= i) continue;
          if (tailCover.some((c) => i >= c.from && i < c.to)) continue; if (tailReported.some((f) => i >= f)) continue;
          if (firstSilent < 0) firstSilent = i; silentN++;
        }
        if (silentN) {
          const hw = hwNoted[vi]; const documented = (isRollback && faultClass.startsWith('rb') && (docClass !== '' || faultTouchesHw || head.lines >= hw)) || (faultClass === 'older' && /highwater|hw/.test(faultDesc));
          viol(documented ? 'silent-shrink(documented-limit)' : 'SILENT-SHRINK', documented ? 'INFO' : 'DATA', `head=${head.lines} acked=${v.acked} silentLines=${silentN} first=${firstSilent} hwNoted=${hw} flagged=${flagged}`);
        }
      }
      try { const vr = await s.verify(v.id); void vr; } catch (e: any) { if (!typed(e)) viol('untyped-verify', 'DATA', err(e)); }
      try { const sm = await s.summary(v.id); if (sm.lines !== head.lines) viol('summary-count-mismatch', 'INFO', `summary=${sm.lines} head=${head.lines}`); } catch (e: any) { if (!typed(e)) viol('untyped-summary', 'DATA', err(e)); }
      if (prevHeads && prevHeads[vi] >= 0 && head.lines < prevHeads[vi] && !(flagged)) viol('second-open-shrank', 'DATA', `${prevHeads[vi]} -> ${head.lines}`);
    }
    // convergence: resend the canonical lines (as a peer would) and make sure the store accepts and then serves them correctly
    if (!prevHeads) {
      for (let vi = 0; vi < vers.length; vi++) {
        const v = vers[vi]; if (heads[vi] < 0) continue; const hd = await s.head(v.id).catch(() => null); if (!hd) continue;
        const target = Math.min(v.canon.length, Math.max(v.acked, v.parkedEnd, hd.lines) + 3);
        try {
          let from = hd.damagedFromLine !== null && hd.evictedLines <= hd.damagedFromLine ? Math.min(hd.damagedFromLine, hd.lines) : hd.lines;
          if (hd.evictedLines > from) from = hd.lines;
          let guard = 0; const rlog: string[] = [`from=${from} target=${target} head0=${hd.lines} dmg0=${hd.damagedFromLine} ev0=${hd.evictedLines}`];
          while (from < target && guard++ < 50) { const to = Math.min(target, from + 120); const res = await s.append(v.id, 0, from, v.canon.slice(from, to)); rlog.push(`append ${from}..${to}=${res}`); if (res !== 'ok') { viol('resend-refused:' + res, faultClass === 'none' ? 'REPORT' : 'DATA', `from=${from} to=${to} head=${hd.lines}`); break; } from = to; }
          const h2 = await s.head(v.id);
          if (h2.hash !== v.ref[h2.lines]) viol('head-hash-wrong-after-resend', 'DATA', `lines=${h2.lines}`);
          if (h2.lines < Math.min(target, v.acked) && !v.sacrificed) viol('resend-did-not-extend', 'DATA', `head=${h2.lines} target=${target}`);
          for (let i = 0; i < h2.lines; i++) { let g: any; try { g = await s.read(v.id, 0, i, i + 1); } catch (e: any) { if (!typed(e)) viol('untyped-read-after-resend', 'DATA', err(e)); else viol('read-threw-after-resend', 'REPORT', `line ${i} ${err(e)} damagedFromLine=${h2.damagedFromLine} head=${h2.lines} :: ${rlog.join(' | ')}`); break; } if (g === 'evicted') continue; if (!Buffer.from(g[0]).equals(v.canon[i])) { viol('WRONG-LINE-after-resend', 'DATA', `line ${i}`); break; } }
          if (h2.damagedFromLine !== null && h2.evictedLines === 0 && faultClass !== 'none') viol('still-damaged-after-correct-resend', 'INFO', `from=${h2.damagedFromLine}`);
        } catch (e: any) { if (!typed(e)) viol('untyped-resend', 'DATA', err(e)); else viol('resend-threw:' + e.code, 'INFO', err(e)); }
      }
    }
    try { await s.close(); } catch (e: any) { if (!typed(e)) viol('untyped-close', 'DATA', err(e)); else viol('close-threw', 'REPORT', err(e)); }
    return heads;
  }
  let h1: number[] | null = null;
  try {
    h1 = await check('first', null);
    // snapshot what the first check left, reopen again: the store must not shrink by repairing itself
    if (h1) await check('second', h1.map((x, i) => x));
  } catch (e: any) { viol('harness-error', 'INFO', err(e)); }
  await fsp.rm(tmp, { recursive: true, force: true });
  return viols;
}

test('r6 fuzz', async () => {
  let n = 0; let withV = 0;
  for (let seed = FROM; seed <= TO; seed++) {
    let v: Viol[] = [];
    try { v = await run(seed); } catch (e: any) { v = [{ seed, kind: 'HARNESS-CRASH', sev: 'INFO', detail: String(e?.stack).slice(0, 400), fault: '', trace: [] }]; }
    n++;
    const hits = v.filter((x) => x.sev !== 'INFO' || process.env.R6_INFO);
    if (v.length) fs.appendFileSync(OUT, v.map((x) => JSON.stringify(x)).join('\n') + '\n');
    if (hits.length) withV++;
  }
  fs.appendFileSync(OUT + '.stats', JSON.stringify({ from: FROM, to: TO, n, withV, STATS }) + '\n');
}, 7 * 24 * 3600 * 1000);
