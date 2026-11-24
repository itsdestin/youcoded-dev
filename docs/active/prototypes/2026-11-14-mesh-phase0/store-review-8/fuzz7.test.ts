// Reviewer-7 targeted fuzz (own generator, own oracle). Divergent histories: takeovers (setAsideTail) replace a history, new lines are appended, parks are made
// before takeovers, snapshots of the version folder are taken all along, and ONE fault (or a classed rollback) is applied; then reopen and judge.
// Oracle: every acknowledged line of the CURRENT history is served byte-identical at its position, or is covered by (flag | typed error | verified tail).
// Never an untyped exception. Run the same seeds against R7_SRC=old and R7_SRC=new and diff: the differential isolates what the diff changed.
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
const BASE = process.env.R7_BASE ?? '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-8';
// the BUILD phase always runs on the new code (it writes the markers and epoch-sealed parks); the CHECK phase (after the fault) runs on R7_SRC, so old and new read the SAME disk image
const SRCS: Record<string, any> = { old: await import(BASE + '/old/store'), new: await import(BASE + '/new/store') };
const { StoreError } = await import(BASE + '/new/errors');
const { StoreError: StoreErrorOld } = await import(BASE + '/old/errors');
import { VFS, Crash } from './vfs';

const CRASHALL = !!process.env.R7_CRASHALL;
const FROM = Number(process.env.R7_FROM ?? 1), TO = Number(process.env.R7_TO ?? 100);
const OUT = process.env.R7_OUT ?? BASE + '/out-' + (process.env.R7_SRC ?? 'new') + '.jsonl';
const ONLY = process.env.R7_FAULTS ? process.env.R7_FAULTS.split(',') : null;
function prng(seed: number) { let a = (seed * 2654435761 + 12345) >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }
const STATS: Record<string, number> = {};
const bump = (k: string) => { STATS[k] = (STATS[k] ?? 0) + 1; };
export interface Viol { seed: number; kind: string; sev: 'DATA' | 'INFO'; detail: string; fault: string; outcome: string; trace: string[] }

async function run(seed: number): Promise<{ viols: Viol[]; outcome: string }> {
  const r = prng(seed);
  const tmp = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r7-'));
  const root = nodePath.join(tmp, 'store'); await fsp.mkdir(root);
  const vfs = new VFS(r);
  { let p = ''; for (const seg of root.split('/').filter(Boolean)) { p += '/' + seg; vfs.base.set(p, 'D'); vfs.vol.set(p, 'D'); } }
  const trace: string[] = []; const viols: Viol[] = [];
  let faultDesc = 'none'; let faultClass = 'none'; let outcome = '';
  const note = (s: string) => trace.push(s);
  const seen = new Set<string>();
  const viol = (kind: string, sev: Viol['sev'], detail: string) => { const k = kind + sev; if (seen.has(k)) return; seen.add(k); viols.push({ seed, kind, sev, detail, fault: faultDesc, outcome, trace: trace.slice(-60) }); };
  const typed = (e: unknown) => e instanceof StoreError || e instanceof StoreErrorOld;
  let chk = 'new'; const r2 = prng(seed + 777777);
  const err = (e: any) => (typed(e) ? `StoreError(${e.code}): ${e.message}` : `${e?.constructor?.name}: ${e?.message}\n${String(e?.stack).split('\n').slice(1, 4).join('|')}`);

  const chat = 'r7:chat'; const id = Buffer.from([0xb1, 1, 7, 9]); const key = id.toString('hex');
  const seedHash = createHash('sha256').update(Buffer.from(chat)).update(Buffer.alloc(4)).digest();
  const refAll = (ls: Buffer[]) => { let h = seedHash; const o = [h.toString('hex')]; for (const l of ls) { h = createHash('sha256').update(h).update(l).digest(); o.push(h.toString('hex')); } return o; };
  let gen = 0; let ctr = 0;
  const mk = (): Buffer => { const pad = 'x'.repeat(Math.floor(r() * 150)); const nonce = Math.floor(r() * 1e9).toString(16); return Buffer.from(JSON.stringify({ type: r() < 0.5 ? 'user' : 'assistant', uuid: `g${gen}-${ctr++}-${nonce}`, message: { role: 'user', content: `g${gen}#${ctr}#${pad}`, ...(r() < 0.5 ? { stop_reason: 'end_turn' } : {}) } }) + '\n'); };
  let cur: Buffer[] = [];                 // acknowledged lines of the current history
  const tails: { tid: string; from: number; lines: Buffer[]; ack: boolean }[] = [];
  let parkWant: { from: number; gen: number; lines: Buffer[] }[] = [];
  const drainModel = () => { for (let again = true; again;) { again = false; for (const p of parkWant) if (p.gen === gen && p.from === cur.length) { cur = cur.concat(p.lines); again = true; } } };
  const chunkBytes = [700, 1500, 4000, 16 << 20][Math.floor(r() * 4)];
  let clock = 1_700_000_000_000;
  const dropLock = async () => { for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(nodePath.join(root, n), { force: true }); };
  const opts = () => ({ fs: vfs as any, chunkBytes, scrubOnOpenBytes: r2() < 0.5 ? 0 : 1 << 20, proofVerifier: () => true, now: () => (clock += 1000) });
  const snaps: { files: Map<string, Buffer>; cur: number; gen: number }[] = [];
  const pre = root + `/versions/${key}/`;
  const snap = () => { snaps.push({ files: vfs.dirSnapshot(root + '/'), cur: cur.length, gen }); if (snaps.length > 7) snaps.splice(Math.floor(r() * 6), 1); };

  async function openStore(): Promise<any> {
    for (let a = 0; a < 2; a++) {
      try {
        const s = await SRCS[chk].ChatStore.open(root, opts());
        try { await s.registerVersion(id, { chatId: chat, runtime: 'claude-code' }); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; note('register ' + err(e)); if (!typed(e)) viol('untyped-register', 'DATA', err(e)); }
        return s;
      } catch (e: any) {
        if (e instanceof Crash || vfs.dead) throw e;
        if (typed(e) && /store-locked/.test(e.code) && a === 0) { await dropLock(); continue; }
        note('open ' + err(e)); if (!typed(e)) viol('untyped-open', 'DATA', err(e)); return null;
      }
    }
    return null;
  }

  // ---------- build: appends, parks, takeovers (with optional crashes + retries), snapshots ----------
  let s: any = await openStore();
  const nOps = 6 + Math.floor(r() * 10);
  const crashAtTakeover = r() < 0.5;
  for (let k = 0; k < nOps && s; k++) {
    const op = r();
    if (op < 0.35 || cur.length < 4) {
      let cnt = 1 + Math.floor(r() * 30);
      const pk = parkWant.filter((p) => p.gen === gen && p.from > cur.length).sort((a, b) => a.from - b.from)[0];
      if (pk && r() < 0.6) cnt = pk.from - cur.length;       // land exactly on a park's first line: the drain moment
      if (cnt < 1) cnt = 1;
      const lines = Array.from({ length: cnt }, mk);
      let res: string;
      try {
        if (CRASHALL && r() < 0.5) vfs.arm(1 + Math.floor(r() * 30), (['none', 'prefix', 'garbage'] as const)[Math.floor(r() * 3)]);
        res = await s.append(id, 0, cur.length, lines); vfs.disarm();
      } catch (e: any) {
        if (e instanceof Crash || vfs.dead) { vfs.disarm(); vfs.settle(r() < 0.5 ? 'power' : 'kill'); await dropLock(); bump('crash-append'); note(`CRASH in append ${cur.length}+${cnt}`); s = await openStore(); if (!s) break;
          // a caller whose append was not acknowledged sends the SAME lines again from the same position (the replicator's rule); the retry must be accepted and the head must then be exactly model+lines
          try { const rr = await s.append(id, 0, cur.length, lines); note(`retry append -> ${rr}`); if (rr === 'ok') { cur = cur.concat(lines); drainModel(); } else viol('retry-after-crash-refused:' + rr, 'DATA', `pos=${cur.length}`); } catch (e2: any) { if (typed(e2)) viol('retry-after-crash-threw:' + e2.code, 'DATA', err(e2)); else viol('untyped-retry', 'DATA', err(e2)); }
          snap(); continue; }
        note('append threw ' + err(e)); if (!typed(e)) viol('untyped-append', 'DATA', err(e)); break;
      }
      note(`append ${cur.length}+${cnt} gen${gen} -> ${res}`);
      if (res === 'ok') { cur = cur.concat(lines); drainModel(); }
      else viol('build-append-refused:' + res, 'INFO', '');
      const hd = await s.head(id); if (hd.lines !== cur.length) viol('build-head-mismatch', 'DATA', `head=${hd.lines} model=${cur.length} (stale park drained?)`);
    } else if (op < 0.5) {
      const lastEnd = Math.max(0, ...parkWant.filter((p) => p.gen === gen).map((p) => p.from + p.lines.length)); const from = Math.max(cur.length + 1 + Math.floor(r() * 3), lastEnd + (lastEnd ? Math.floor(r() * 2) : 0)); if (parkWant.some((p) => p.gen === gen && from < p.from + p.lines.length && from + 4 > p.from) && false) continue; const lines = Array.from({ length: 1 + Math.floor(r() * 4) }, mk);
      const res = await s.append(id, 0, from, lines); note(`park ${from}+${lines.length} gen${gen} -> ${res}`);
      if (res === 'parked') parkWant.push({ from, gen, lines });
    } else if (op < 0.78) {
      const from = Math.floor(r() * (cur.length + 1)); const tid = Math.floor(r() * 2 ** 48).toString(16).padStart(12, '0');
      const expect = cur.slice(from); const t = { tid, from, lines: expect, ack: false }; tails.push(t);
      note(`takeover ${tid} from ${from} (head ${cur.length}) crash=${crashAtTakeover}`);
      let done = false; let tries = 0;
      while (!done && tries++ < 5) {
        try {
          if (crashAtTakeover && tries === 1 && r() < 0.8) vfs.arm(1 + Math.floor(r() * 40), (['none', 'prefix', 'garbage'] as const)[Math.floor(r() * 3)]);
          const rr = await s.setAsideTail(tid, id, from); if (process.env.R7_DBG) note(`DBGR try${tries} -> ${JSON.stringify(rr)}`); done = true; vfs.disarm();
        } catch (e: any) {
          if (e instanceof Crash || vfs.dead) {
            vfs.disarm(); vfs.settle(r() < 0.5 ? 'power' : 'kill'); await dropLock(); bump('crash'); note('CRASH in takeover');
            s = await openStore(); if (!s) break; continue;
          }
          note('takeover threw ' + err(e)); if (!typed(e)) viol('untyped-takeover', 'DATA', err(e)); break;
        }
      }
      if (!done) { viol('build-takeover-failed', 'INFO', ''); break; }
      if (process.env.R7_DBG) note(`DBGT tries=${tries} tails=${vfs.files().filter((f) => f.includes('/tails/')).map((f) => f.split('/tails/')[1]).join(',')}`);
      t.ack = true; cur = cur.slice(0, from); gen++;
      try { const tr = await s.tail(tid, id); if (!tr || tr.fromLine !== from || tr.lines.length !== expect.length || !tr.lines.every((l: any, i: number) => Buffer.from(l).equals(expect[i]))) viol('build-tail-wrong', 'DATA', `tr=${tr ? tr.lines.length : null} expect=${expect.length}`); } catch (e: any) { viol('build-tail-threw', 'DATA', err(e)); }
    } else if (op < 0.9) {
      note('close+reopen'); await s.close(); s = await openStore();
    } else { note('scrub'); try { await s.scrubStep(id, { maxBytes: 1 << 20 }); } catch (e: any) { if (!typed(e)) viol('untyped-scrub', 'DATA', err(e)); } }
    snap();
  }
  if (s) { try { await s.close(); } catch { /* */ } snap(); }
  if (!s) { await fsp.rm(tmp, { recursive: true, force: true }); return { viols, outcome: 'build-failed' }; }

  vfs.settle('kill');   // reviewer 8: make everything durable BEFORE the fault, so vfs.put() (which edits volatile+base only) is not undone by the unsynced directory log replaying at the next settle
  // ---------- ONE fault ----------
  const FAULTS = ['older1', 'older1', 'olderIdx', 'olderIdx', 'olderCk', 'olderCk', 'olderBody', 'olderPair', 'olderPair', 'olderTails', 'rbExact', 'rbOverlay', 'delete', 'flip', 'trunc', 'delBegun', 'putBackBegun', 'delDone', 'delTail', 'olderTail', 'none'];
  const preFault = process.env.R7_DUMP ? vfs.dirSnapshot(root + '/') : null;
  const fault = ONLY ? ONLY[Math.floor(r() * ONLY.length)] : FAULTS[Math.floor(r() * FAULTS.length)];
  const vfiles = () => vfs.files().filter((f) => f.startsWith(pre));
  const cls = (f: string) => { const n = f.slice(pre.length); if (n === 'index.bin') return 'idx'; if (n === 'checkpoint.bin') return 'ck'; if (/^body-/.test(n)) return 'body'; if (n.startsWith('tails/')) return 'tails'; if (n.startsWith('parked/')) return 'parked'; return 'other'; };
  const sn = snaps.length ? snaps[Math.floor(r() * snaps.length)] : null;
  const restore = (files: string[]) => { if (!sn) return false; let ch = false; for (const f of files) { const o = sn.files.get(f) ?? null; const c = vfs.get(f); if ((o === null && c === null) || (o && c && o.equals(c))) continue; vfs.put(f, o); ch = true; } return ch; };
  const universe = () => { const all = new Set<string>(vfiles()); if (sn) for (const f of sn.files.keys()) if (f.startsWith(pre)) all.add(f); return [...all]; };
  const byClass = (cs: string[]) => universe().filter((f) => cs.includes(cls(f)));
  let did = false;
  if (fault === 'older1') { const u = universe(); did = u.length > 0 && restore([u[Math.floor(r() * u.length)]]); faultDesc = 'older1'; }
  else if (fault === 'olderIdx') { did = restore(byClass(['idx'])); faultDesc = 'olderIdx'; }
  else if (fault === 'olderCk') { did = restore(byClass(['ck'])); faultDesc = 'olderCk'; }
  else if (fault === 'olderBody') { did = restore(byClass(['body'])); faultDesc = 'olderBody'; }
  else if (fault === 'olderPair') { const pairs = [['idx', 'ck'], ['idx', 'body'], ['ck', 'body'], ['idx', 'ck', 'tails']]; const p = pairs[Math.floor(r() * pairs.length)]; did = restore(byClass(p)); faultDesc = 'olderPair:' + p.join('+'); }
  else if (fault === 'olderTails') { did = restore(byClass(['tails'])); faultDesc = 'olderTails'; }
  else if (fault === 'rbExact') { if (sn) { for (const f of vfiles()) vfs.put(f, null); did = true; for (const [f, b] of sn.files) if (f.startsWith(pre)) vfs.put(f, b); } faultDesc = 'rbExact'; }
  else if (fault === 'rbOverlay') { did = restore(universe().filter((f) => sn?.files.has(f))); faultDesc = 'rbOverlay'; }
  else if (['delete', 'flip', 'trunc'].includes(fault)) {
    const pool = vfiles().filter((f) => !/\/body-/.test(f) || r() < 0.5); const t = pool[Math.floor(r() * pool.length)];
    if (t) { const b = vfs.get(t)!; if (fault === 'delete') vfs.put(t, null); else if (fault === 'flip' && b.length) { const c = Buffer.from(b); c[Math.floor(r() * b.length)] ^= 1 << Math.floor(r() * 8); vfs.put(t, c); } else if (fault === 'trunc' && b.length > 1) vfs.put(t, b.subarray(0, 1 + Math.floor(r() * (b.length - 1)))); else vfs.put(t, null); did = true; faultDesc = `${fault} ${t.slice(pre.length)}`; }
  }
  else if (fault === 'delBegun' || fault === 'putBackBegun' || fault === 'delDone' || fault === 'delTail' || fault === 'olderTail') {
    const ext = fault === 'delBegun' ? '.begun' : fault === 'delDone' ? '.done' : fault === 'putBackBegun' ? '.begun' : '.tail';
    const pool = (fault === 'putBackBegun' ? universe() : vfiles()).filter((f) => f.endsWith(ext) && f.includes('/tails/'));
    const t = pool[Math.floor(r() * pool.length)];
    if (t) { if (fault === 'putBackBegun') { const o = sn?.files.get(t) ?? [...snaps].reverse().map((x) => x.files.get(t)).find(Boolean); if (o && !vfs.get(t)) { vfs.put(t, o); did = true; } } else if (fault === 'olderTail') { did = restore([t]); } else { vfs.put(t, null); did = true; } faultDesc = `${fault} ${t.slice(pre.length)}`; }
  }
  faultClass = did ? fault : 'none'; if (!did) faultDesc = 'none';
  if (process.env.R7_DBG) { const hwm = await import(BASE + '/new/highwater'); const hh = await hwm.readHw(vfs as any, root, key); note(`DBG hw=${JSON.stringify(hh.st.value && { count: hh.st.value.count, tk: hh.st.value.takeovers })} kind=${hh.st.kind} files=${vfiles().map((f) => f.slice(pre.length)).filter((n) => n.startsWith('tails/')).join(',')}`); }
  note(`FAULT ${faultDesc} snap(cur=${sn?.cur},gen=${sn?.gen}) now(cur=${cur.length},gen=${gen})`);
  bump('fault-' + faultClass);
  chk = process.env.R7_SRC ?? 'new';
  // optional crash during the first reopen's repair
  if (did && r() < 0.3) {
    vfs.disarm(); vfs.arm(1 + Math.floor(r() * 50), (['none', 'prefix', 'garbage'] as const)[Math.floor(r() * 3)]);
    try { const x = await openStore(); if (x) { try { await x.head(id); await x.scrubStep(id, { maxBytes: 1 << 20 }); await x.close(); } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; } } } catch (e: any) { if (!(e instanceof Crash) && !vfs.dead && !typed(e)) viol('untyped-repair', 'DATA', err(e)); }
    vfs.disarm(); vfs.settle(r() < 0.5 ? 'power' : 'kill'); await dropLock(); note('repair crash');
  }
  if (process.env.R7_DBG) { const hwm = await import(BASE + '/new/highwater'); const hh = await hwm.readHw(vfs as any, root, key); note(`DBG3 chunk=${chunkBytes} files=${vfiles().map((f) => f.slice(pre.length) + ':' + (vfs.get(f)?.length ?? 0)).join(' ')}`); note(`DBG2 hw=${JSON.stringify(hh.st.value && { count: hh.st.value.count, tk: hh.st.value.takeovers })} kind=${hh.st.kind} tails=${vfiles().map((f) => f.slice(pre.length)).filter((n) => n.startsWith('tails/')).join(',')} aside=${vfs.files().filter((f) => f.includes('/aside/')).length}`); }
  chk = process.env.R7_SRC ?? 'new';
  if (process.env.R7_DUMP) { const D = process.env.R7_DUMP + '/' + seed; for (const f of vfs.files()) { if (!f.startsWith(root + '/')) continue; const dst = D + '/' + f.slice(root.length + 1); fs.mkdirSync(nodePath.dirname(dst), { recursive: true }); fs.writeFileSync(dst, vfs.get(f)!); } const dumpSet = (m: Map<string, Buffer> | null | undefined, tag: string) => { if (!m) return; for (const [f, b] of m) { if (!f.startsWith(root + '/')) continue; const dst = D + tag + '/' + f.slice(root.length + 1); fs.mkdirSync(nodePath.dirname(dst), { recursive: true }); fs.writeFileSync(dst, b); } }; dumpSet(preFault, '.pre'); dumpSet(sn?.files, '.snap'); fs.writeFileSync(D + '.model.json', JSON.stringify({ cur: cur.map((b) => b.toString('base64')), chunkBytes, id: id.toString('hex'), chat, fault: faultDesc })); }
  // ---------- check ----------
  const ref = refAll(cur);
  async function check(tag: string, prev: number | null): Promise<number> {
    const st = await openStore(); if (!st) { outcome += `${tag}:open-refused;`; return -1; }
    let head: any;
    try { head = await st.head(id); } catch (e: any) {
      note(`${tag} head ${err(e)}`);
      if (!typed(e)) { viol('untyped-head', 'DATA', err(e)); outcome += `${tag}:untyped;`; } else outcome += `${tag}:headErr(${e.code});`;
      try { await st.close(); } catch { /* */ } return -1;
    }
    const lost = (head.lostTakeovers ?? 0) > 0;
    const flagged = head.damagedFromLine !== null || head.rolledBack !== null || lost;
    const flagFrom = lost ? 0 : Math.min(head.damagedFromLine ?? Infinity, head.rolledBack?.from ?? Infinity);
    let corrupt = 0;
    outcome += `${tag}:lost=${head.lostTakeovers},rej=${head.rejectedParks},evict=${head.evictedLines}:head=${head.lines}${flagged ? `,flag(${head.damagedFromLine}|${head.rolledBack ? head.rolledBack.from : '-'})` : ''};`;
    if (head.lines > cur.length) viol(flagged && flagFrom <= cur.length ? 'head-beyond-model-FLAGGED' : 'HEAD-BEYOND-MODEL', flagged && flagFrom <= cur.length ? 'INFO' : 'DATA', `head=${head.lines} model=${cur.length} flag=${flagFrom}`);
    else if (head.hash !== ref[head.lines]) viol('head-hash-differs-from-current-history', flagged ? 'INFO' : 'DATA', `head=${head.lines} flagged=${flagged}`);
    for (let i = 0; i < head.lines; i++) {
      let got: any;
      try { got = await st.read(id, 0, i, i + 1); } catch (e: any) { if (!typed(e)) { viol('untyped-read', 'DATA', err(e)); break; } corrupt++; continue; }
      if (got === 'evicted') continue;
      if (i >= cur.length || !Buffer.from(got[0]).equals(cur[i])) { const fl = flagged && flagFrom <= i; viol(fl ? 'wrong-line-served-FLAGGED' : 'WRONG-LINE-SERVED', fl ? 'INFO' : 'DATA', `line ${i} head=${head.lines} flagged=${flagged} snapGen=${sn?.gen}`); break; }
    }
    if (corrupt) outcome += `corruptReads=${corrupt};`;
    const cover: { from: number; to: number }[] = [];
    for (const t of tails) { try { const tr = await st.tail(t.tid, id); if (tr) { if (tr.lines.length !== t.lines.length || !tr.lines.every((l: any, i: number) => Buffer.from(l).equals(t.lines[i]))) viol('tail-WRONG-BYTES', 'DATA', t.tid); else cover.push({ from: tr.fromLine, to: tr.fromLine + tr.lines.length }); } else viol('tail-vanished', 'INFO', t.tid); } catch (e: any) { if (!typed(e)) viol('untyped-tail', 'DATA', err(e)); else outcome += `tailErr(${e.code});`; } }
    let silent = 0; let first = -1;
    for (let i = head.lines; i < cur.length; i++) { if (flagged && flagFrom <= i) continue; if (cover.some((c) => i >= c.from && i < c.to)) continue; if (silent++ === 0) first = i; }
    if (silent) viol('SILENT-SHRINK', 'DATA', `head=${head.lines} acked=${cur.length} silent=${silent} first=${first}`);
    if (prev !== null && prev >= 0 && head.lines < prev && !flagged) viol('second-open-shrank', 'DATA', `${prev} -> ${head.lines}`);
    if (prev === null) {
      try {
        let from = head.damagedFromLine !== null ? Math.min(head.damagedFromLine, head.lines) : head.lines; if (head.evictedLines > from) from = head.lines;
        const target = cur.length; let g = 0;
        while (from < target && g++ < 20) { const to = Math.min(target, from + 60); const res = await st.append(id, 0, from, cur.slice(from, to)); if (res !== 'ok') { viol('resend-refused:' + res, 'INFO', `from=${from}`); break; } from = to; }
        const h2 = await st.head(id);
        if ((h2.lines > cur.length || h2.hash !== ref[h2.lines]) && !(flagged && h2.lines >= (flagFrom))) viol('head-wrong-after-resend', 'DATA', `lines=${h2.lines}`);
        for (let i = 0; i < h2.lines; i++) { let gg: any; try { gg = await st.read(id, 0, i, i + 1); } catch (e: any) { if (!typed(e)) viol('untyped-read-after-resend', 'DATA', err(e)); else viol('read-threw-after-resend', 'INFO', `line ${i} ${err(e)}`); break; } if (gg !== 'evicted' && !(i < cur.length && Buffer.from(gg[0]).equals(cur[i])) && !(flagged && i >= flagFrom)) { viol('WRONG-LINE-after-resend', 'DATA', `line ${i}`); break; } }
      } catch (e: any) { if (!typed(e)) viol('untyped-resend', 'DATA', err(e)); else viol('resend-threw:' + e.code, 'INFO', err(e)); }
    }
    try { await st.verify(id); } catch (e: any) { if (!typed(e)) viol('untyped-verify', 'DATA', err(e)); }
    try { await st.close(); } catch (e: any) { if (!typed(e)) viol('untyped-close', 'DATA', err(e)); }
    return head.lines;
  }
  try { const h1 = await check('first', null); await check('second', h1); } catch (e: any) { if (e instanceof Crash) viol('harness-crash', 'INFO', ''); else viol('harness-error', 'INFO', err(e)); }
  await fsp.rm(tmp, { recursive: true, force: true });
  return { viols, outcome, faultDesc } as any;
}

test('r7 fuzz', async () => {
  let n = 0;
  for (let seed = FROM; seed <= TO; seed++) {
    let v: { viols: Viol[]; outcome: string };
    try { v = await run(seed); } catch (e: any) { v = { viols: [{ seed, kind: 'HARNESS-THROW', sev: 'INFO', detail: String(e?.stack).slice(0, 300), fault: '', outcome: '', trace: [] }], outcome: 'harness-throw' }; }
    n++;
    fs.appendFileSync(OUT, JSON.stringify({ seed, outcome: v.outcome, kinds: v.viols.map((x) => `${x.sev}:${x.kind}`), fault: (v as any).faultDesc ?? v.viols[0]?.fault ?? '' }) + '\n');
    for (const x of v.viols) if (x.sev === 'DATA' || process.env.R7_INFO) fs.appendFileSync(OUT + '.detail', JSON.stringify(x) + '\n');
  }
  fs.appendFileSync(OUT + '.stats', JSON.stringify({ from: FROM, to: TO, n, STATS }) + '\n');
}, 7 * 24 * 3600 * 1000);
