// Reviewer-5 fuzz: own generator, own oracle, own virtual disk (vfs.ts).
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { ChatStore } from '../src/main/mesh/store/store';
import { StoreError } from '../src/main/mesh/store/errors';
import { VFS, Crash } from './vfs';
import { inventoryRow } from '../src/main/mesh/store/inventory';

const FROM = Number(process.env.R5_FROM ?? 1), TO = Number(process.env.R5_TO ?? 100);
const OUT = process.env.R5_OUT ?? '/tmp/r5-out.jsonl';
const FAULTS = (process.env.R5_FAULTS ?? 'flip,trunc,zero,zerorange,delete,swap,older,truncrec,dup-extend,foreign').split(',');
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest();
function prng(seed: number) { let a = (seed * 2654435761) >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }
function seed0(chat: string) { return createHash('sha256').update(Buffer.from(chat)).update(Buffer.alloc(4)).digest(); }
function refHash(chat: string, lines: Buffer[], n: number) { let h = seed0(chat); for (let i = 0; i < n; i++) h = createHash('sha256').update(h).update(lines[i]).digest(); return h.toString('hex'); }
const cls = (rel: string) => rel.replace(/versions\/[0-9a-f]+\//, 'versions/V/').replace(/aside\/[^/]+\//, 'aside/A/').replace(/body-[0-9a-f]{16}/, 'body-N').replace(/control\/[0-9a-f]{64}/, 'control/C').replace(/extras\/[0-9a-f]{2}\/[0-9a-f]{64}/, 'extras/X').replace(/\d+-[0-9a-f]{16}\.park/, 'N.park').replace(/\.bad-\d+/, '.bad-N').replace(/-\d+\.bin/, '-N.bin').replace(/line-\d+-\d+/, 'line-N').replace(/\.tmp-\d+-\d+/, '.tmp').replace(/tails\/[0-9a-f]+\./, 'tails/T.');
const ONLY_COPY = (rel: string) => /\/body-[0-9a-f]{16}\.bin$/.test(rel) || /^\/?aside\//.test(rel) || /control\/[0-9a-f]{64}\/log\.bin$/.test(rel) || /^extras\/[0-9a-f]{2}\//.test(rel) || /\/torn\/|\/healed\/|tails\//.test(rel);

interface Ver { id: Buffer; chat: string; acked: Buffer[]; cand: Map<number, Set<string>>; evictedThrough: number; evictTry: number; runtime: 'claude-code' | 'native'; touchedOnly: boolean }
interface Viol { seed: number; kind: string; detail: string; step: number; sig: string; trace: string[] }
const STATS: Record<string, number> = {};
const bump = (k: string) => { STATS[k] = (STATS[k] ?? 0) + 1; };

function mkLine(r: () => number, runtime: string): Buffer {
  const nonce = randomBytes(12).toString('hex'); const pad = 'x'.repeat(Math.floor(r() * (r() < 0.1 ? 2500 : 300))); const k = r();
  if (runtime === 'native') return Buffer.from(JSON.stringify({ type: 'user-message', uuid: nonce, timestamp: 1, data: { text: pad } }) + '\n');
  if (k < 0.5) return Buffer.from(JSON.stringify({ type: 'user', uuid: nonce, message: { role: 'user', content: pad } }) + '\n');
  if (k < 0.85) return Buffer.from(JSON.stringify({ type: 'assistant', uuid: nonce, message: { id: 'm' + nonce.slice(0, 6), stop_reason: r() < .5 ? 'end_turn' : 'tool_use', content: [{ type: 'text' }] }, pad }) + '\n');
  if (k < 0.93) return Buffer.from(`garbage ${nonce} \xff\xfe ${pad}\n`, 'latin1');
  return Buffer.from(JSON.stringify({ type: 'system', subtype: 'turn_duration', n: nonce, pad }) + '\n');
}

async function run(seed: number): Promise<Viol[]> {
  const r = prng(seed);
  const tmp = await fsp.mkdtemp(nodePath.join(process.env.TMPDIR ?? os.tmpdir(), 'r5-'));
  const root = nodePath.join(tmp, 'store'); await fsp.mkdir(root);
  const vfs = new VFS(r);
  { let p = ''; for (const seg of root.split('/').filter(Boolean)) { p += '/' + seg; vfs.base.set(p, 'D'); vfs.vol.set(p, 'D'); } }
  const trace: string[] = []; const viols: Viol[] = []; let step = 0;
  let faults = 0, repairCrashes = 0; let metaFaultOnly = true; let faultRels: string[] = [];
  const sig = () => `f=${Math.min(faults, 3)};rc=${Math.min(repairCrashes, 2)};${metaFaultOnly ? 'meta' : 'only-copy'}`;
  const note = (s: string) => trace.push(`${step}: ${s}`);
  const seen = new Set<string>();
  const viol = (kind: string, detail: string) => { const k = kind + sig(); if (seen.has(k)) return; seen.add(k); viols.push({ seed, kind, detail, step, sig: sig(), trace: trace.slice(process.env.R5_FULL ? -600 : -40) }); };
  const typed = (e: unknown) => e instanceof StoreError;
  const err = (e: any) => (e instanceof StoreError ? `StoreError(${e.code}): ${e.message}` : `${e?.constructor?.name}: ${e?.message}`);
  const nVers = 1 + Math.floor(r() * 2);
  const vers: Ver[] = [];
  for (let i = 0; i < nVers; i++) vers.push({ id: Buffer.from([0xa0 + i, i, 7, ...(r() < 0.1 ? Array(60).fill(i + 1) : [])]), chat: `r5:chat-${r() < 0.3 ? 0 : i}`, acked: [], cand: new Map(), evictedThrough: 0, evictTry: 0, runtime: r() < 0.15 ? 'native' : 'claude-code', touchedOnly: false });
  const ctl = new Map<string, { id: string; chat: string; seen: string[]; body: Buffer }>(); const extras = new Map<string, Buffer>();
  let store: ChatStore | null = null; let clockMs = 1_700_000_000_000;
  const chunkBytes = 1500 + Math.floor(r() * 3000);
  const snaps: Map<string, Buffer>[] = []; const verSnaps: { v: number; prefix: string; snap: Map<string, Buffer>; acked: number }[] = [];
  const dropLock = async () => { for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(nodePath.join(root, n), { force: true }); };
  const opts = () => ({ fs: vfs, chunkBytes, scrubOnOpenBytes: r() < 0.5 ? 0 : 1 << 20, proofVerifier: () => true, now: () => clockMs });
  let ctlFault = false, extraFault = false;

  async function openStore(): Promise<boolean> {
    if (store) return true;
    try { store = await ChatStore.open(root, opts()); }
    catch (e: any) {
      if (e instanceof Crash) { store = null; return false; }
      if (typed(e) && /store-locked/.test(e.code)) { bump('lock-blocked'); await dropLock(); try { store = await ChatStore.open(root, opts()); } catch (e2: any) { if (e2 instanceof Crash) return false; note('open2 ' + err(e2)); if (!typed(e2)) viol('untyped-open', err(e2)); else if (faults === 0) viol('open-refused-no-fault', err(e2)); return false; } }
      else { note('open ' + err(e)); if (!typed(e)) viol('untyped-open', err(e)); else if (faults === 0) viol('open-refused-no-fault', err(e)); return false; }
    }
    for (const v of vers) { try { await store!.registerVersion(v.id, { chatId: v.chat, runtime: v.runtime }); } catch (e: any) { if (e instanceof Crash) { store = null; return false; } note('register ' + err(e)); if (!typed(e)) viol('untyped-register', err(e)); else if (faults === 0) viol('register-refused-no-fault', err(e)); } }
    return true;
  }
  async function closeStore() { if (!store) return; try { await store.close(); } catch (e: any) { if (!(e instanceof Crash)) note('close ' + err(e)); } store = null; await dropLock(); }
  function crashSettle(mode: 'kill' | 'power') { vfs.settle(mode); store = null; }
  const allBytes = () => vfs.files().map((f) => vfs.get(f)!);
  function evidence(lines: Buffer[]): Set<number> { const blobs = allBytes(); const f = new Set<number>(); lines.forEach((l, i) => { const hd = l.subarray(0, Math.min(l.length, 48)), tl = l.subarray(Math.max(0, l.length - 20)); if (blobs.some((b) => b.includes(hd)) && blobs.some((b) => b.includes(tl))) f.add(i); }); return f; }

  async function check(label: string): Promise<boolean> {
    if (!store) return false; let clean = true;
    for (const f of vfs.files()) { const rel = f.slice(root.length + 1); if (inventoryRow(rel) === null && !/\.tmp-|LOCK/.test(rel)) viol('file-not-in-inventory', rel); }
    for (const v of vers) {
      let head;
      try { head = await store.head(v.id); } catch (e: any) { clean = false; if (e instanceof Crash) throw e; if (!typed(e)) viol('untyped-head', err(e)); else if (faults === 0) viol('head-refused-no-fault', `${label} ${err(e)}`);
        if (v.acked.length > v.evictedThrough && !v.touchedOnly) { const ev = evidence(v.acked.slice(v.evictedThrough)); if (ev.size < v.acked.length - v.evictedThrough && (faults === 0 || metaFaultOnly)) viol('bytes-gone-while-reporting', `${label} ${err(e)}`); }
        continue; }
      const an = v.acked.length;
      if (head.damagedFromLine !== null) clean = false;
      if (head.evictedLines > v.evictTry) { viol('evicted-without-proof', `${label} head.evicted=${head.evictedLines} attempted=${v.evictTry}`); clean = false; } else if (head.evictedLines > v.evictedThrough) v.evictedThrough = head.evictedLines;
      if (head.lines < an) { clean = false; if (head.damagedFromLine === null) viol('silent-loss', `${label} head=${head.lines} acked=${an}`); }
      const served: (Buffer | null)[] = []; const threw = new Set<number>();
      for (let i = head.evictedLines; i < head.lines; i++) {
        try {
          const got = await store.read(v.id, 0, i, i + 1);
          if (got === 'evicted') { clean = false; served[i] = null; continue; }
          served[i] = got[0];
          if (i < an) { if (!got[0].equals(v.acked[i])) viol('WRONG-BYTES', `${label} line ${i}`); }
          else { const s = v.cand.get(i); if (!s || !s.has(sha(got[0]).toString('hex'))) viol('foreign-line-served', `${label} line ${i}`); }
        } catch (e: any) { if (e instanceof Crash) throw e; clean = false; served[i] = null; threw.add(i); if (!typed(e)) viol('untyped-read', `${label} ${i} ${err(e)}`); else if (faults === 0 && i < an) viol('read-refused-no-fault', `${label} line ${i} ${err(e)}`); }
      }
      if (head.lines <= an && head.lines > 0 && head.damagedFromLine === null && head.evictedLines === 0 && refHash(v.chat, v.acked, head.lines) !== head.hash) viol('HEAD-HASH-WRONG', `${label} lines=${head.lines}`);
      const bad: number[] = []; for (let i = head.evictedLines; i < an; i++) { const b = served[i]; if (!b || !b.equals(v.acked[i])) { if (i < v.evictedThrough) { if (head.damagedFromLine !== null || threw.has(i)) { clean = false; bump('limitD-evicted-region-reported'); } else viol('evicted-region-silent', `${label} line ${i}`); } else bad.push(i); } }
      if (bad.length) {
        clean = false;
        if (faults === 0) viol('LOSS-NO-DATA-FAULT', `${label} ${bad.length} acked lines unserved (head=${head.lines} dmg=${head.damagedFromLine} acked=${an} first=${bad[0]})`);
        else if (metaFaultOnly && !v.touchedOnly) viol('LOSS-META-FAULT', `${label} faults=${faultRels.join(',')} ${bad.length} unserved (head=${head.lines} dmg=${head.damagedFromLine} acked=${an} first=${bad[0]})`);
        const ev = evidence(bad.map((i) => v.acked[i]));
        if (ev.size < bad.length && !v.touchedOnly && (faults === 0 || metaFaultOnly)) viol('bytes-gone', `${label} ${bad.length - ev.size} of ${bad.length} have no copy anywhere (faults=${faultRels.join(',')})`);
      }
      if (head.damagedFromLine === null && head.lines > an && bad.length === 0) for (let i = an; i < head.lines; i++) { if (served[i]) v.acked.push(served[i]!); else break; }
    }
    for (const chat of new Set([...ctl.values()].map((e) => e.chat))) {
      try {
        const log = await store.controlLog(chat); const dmg = await store.controlDamage(chat); const have = new Set(log.map((e: any) => e.id));
        for (const e of ctl.values()) if (e.chat === chat && !have.has(e.id)) { if (dmg.length === 0) viol('control-silent-loss', `${label} ${e.id.slice(0, 8)}`); else if (faults === 0 || !ctlFault) viol('control-loss-reported-but-no-control-fault', `${label}`); clean = false; }
        for (const e of log as any[]) { const a = ctl.get(e.id); if (a && !Buffer.from(e.body).equals(a.body)) viol('control-WRONG-BYTES', `${label}`); }
      } catch (e: any) { if (e instanceof Crash) throw e; clean = false; if (!typed(e)) viol('untyped-control', err(e)); }
    }
    for (const [h, b] of extras) {
      try { const got = await store.readExtra(h); if (got === null) { if (!extraFault) viol('extra-missing', `${label} ${h.slice(0, 8)}`); clean = false; } else if (!got.equals(b)) viol('extra-WRONG-BYTES', `${label}`); }
      catch (e: any) { if (e instanceof Crash) throw e; clean = false; if (!typed(e)) viol('untyped-extra', err(e)); else if (!extraFault) viol('extra-refused', `${label} ${err(e)}`); }
    }
    return clean;
  }
  const healthyNow = (c: boolean) => { if (c && !vers.some((v) => v.evictedThrough > 0)) { faults = 0; repairCrashes = 0; metaFaultOnly = true; faultRels = []; ctlFault = false; extraFault = false; for (const v of vers) v.touchedOnly = false; } };
  const snapshot = () => { const m = new Map<string, Buffer>(); for (const f of vfs.files()) m.set(f, vfs.get(f)!); snaps.push(m); if (snaps.length > 4) snaps.shift(); vers.forEach((v, i) => { const pre = `${root}/versions/${v.id.toString('hex')}/`; verSnaps.push({ v: i, prefix: pre, snap: vfs.dirSnapshot(pre), acked: v.acked.length }); if (verSnaps.length > 4) verSnaps.shift(); }); };

  async function appends(n: number) {
    for (let k = 0; k < n && store; k++) {
      const v = vers[Math.floor(r() * vers.length)]; const pick = r(); const cnt = 1 + Math.floor(r() * 5);
      let from = v.acked.length; let lines: Buffer[] = []; let wrong = false;
      if (pick < 0.08 && v.acked.length > 0) { from = Math.floor(r() * v.acked.length); lines = v.acked.slice(from, from + cnt); while (lines.length < cnt) lines.push(mkLine(r, v.runtime)); }
      else if (pick < 0.12) { from = v.acked.length + 1 + Math.floor(r() * 3); for (let i = 0; i < cnt; i++) lines.push(mkLine(r, v.runtime)); }
      else if (pick < 0.15 && v.acked.length > v.evictedThrough) { from = v.acked.length - 1; lines = [mkLine(r, v.runtime)]; wrong = true; }
      else for (let i = 0; i < cnt; i++) lines.push(mkLine(r, v.runtime));
      lines.forEach((l, i) => { const s = v.cand.get(from + i) ?? new Set(); s.add(sha(l).toString('hex')); v.cand.set(from + i, s); });
      if (r() < 0.05) clockMs += Math.floor((r() - 0.7) * 1e9);
      try {
        const res = await store.append(v.id, 0, from, lines); note(`append v${v.id[0].toString(16)} from=${from} n=${lines.length} -> ${res} (model ${v.acked.length})`);
        if (res === 'ok') {
          if (wrong) viol('wrong-overlap-acked-ok', 'different bytes over an acked line answered ok');
          for (let i = 0; i < lines.length; i++) if (from + i === v.acked.length) v.acked.push(lines[i]); else if (from + i < v.acked.length && !v.acked[from + i].equals(lines[i])) viol('model', 'overlap');
          const hh = await store.head(v.id);
          if (hh.lines > v.acked.length) { const more = await store.read(v.id, 0, v.acked.length, hh.lines); if (more !== 'evicted') for (const m of more) { const s = v.cand.get(v.acked.length); if (!s || !s.has(sha(m).toString('hex'))) { viol('drained-foreign', 'a drained parked line is not any attempted line'); break; } v.acked.push(m); } }
        }
      } catch (e: any) { note(`append THREW ${err(e)}`); if (e instanceof Crash) return 'crash'; if (!typed(e)) viol('untyped-append', err(e)); }
    }
    return 'ok';
  }
  async function ctlOp() {
    if (!store) return; const body = randomBytes(8 + Math.floor(r() * 40)); const id = sha(body).toString('hex'); const chat = `r5:chat-${Math.floor(r() * 2)}`;
    const sn = r() < 0.5 && ctl.size ? [[...ctl.keys()][Math.floor(r() * ctl.size)]] : [];
    try { const res = await store.appendControl({ id, chat, seen: sn, body }); if (res === 'ok') ctl.set(id, { id, chat, seen: sn, body }); note('control ' + res); } catch (e: any) { if (!typed(e) && !(e instanceof Crash)) viol('untyped-control-append', err(e)); }
  }
  async function extraOp() {
    if (!store) return; const b = randomBytes(20 + Math.floor(r() * 100)); const h = sha(b).toString('hex');
    try { await store.putExtra(h, b); extras.set(h, b); note('extra'); } catch (e: any) { if (!typed(e) && !(e instanceof Crash)) viol('untyped-extra-put', err(e)); }
  }
  async function evictOp() {
    if (!store) return; const v = vers[Math.floor(r() * vers.length)]; if (v.acked.length <= 2) return;
    const through = 1 + Math.floor(r() * (v.acked.length - 1)); const hash = refHash(v.chat, v.acked, through);
    v.evictTry = Math.max(v.evictTry, through);
    try { await store.evictBody(v.id, { kind: 'holders-confirmed', version: v.id.toString('hex'), through, hash, acks: [1, 2].map((n) => ({ holder: 'h' + n, version: v.id.toString('hex'), lines: through, hash, signature: 'sig' })) }); v.evictedThrough = Math.max(v.evictedThrough, through); note(`evict ${through}`); }
    catch (e: any) { if (e instanceof Crash) return; note('evict err ' + err(e)); if (!typed(e)) viol('untyped-evict', err(e)); }
  }
  async function restoreOp() {
    if (!store) return; const v = vers[Math.floor(r() * vers.length)]; if (v.evictedThrough <= 0) return;
    try { await store.restoreBody(v.id, v.acked); v.evictedThrough = 0; note('restore'); } catch (e: any) { if (e instanceof Crash) return; note('restore err ' + err(e)); if (!typed(e)) viol('untyped-restore', err(e)); }
  }

  const steps = 8 + Math.floor(r() * 26);
  try {
    await openStore();
    for (step = 0; step < steps; step++) {
      const a = r();
      if (process.env.R5_DUMP && step >= Number(process.env.R5_DUMP)) { const hs: string[] = []; if (store) for (const v of vers) { try { const h = await store.head(v.id); hs.push(`v${v.id[0].toString(16)} head=${h.lines} ev=${h.evictedLines} dmg=${h.damagedFromLine} oracleEv=${v.evictedThrough}/${v.evictTry} acked=${v.acked.length}`); } catch (e: any) { hs.push('head err ' + err(e)); } } note('DUMP ' + hs.join(' ; ') + ' FILES ' + vfs.files().filter((f) => /versions|aside/.test(f)).map((f) => f.slice(root.length + 1).replace(/versions\/([0-9a-f]{6})[0-9a-f]*/, 'V$1').replace('body-0000000000','b') + ':' + vfs.get(f)!.length).join(' ')); }
      if (!store) { await openStore(); if (store) { const c = await check('reopen'); healthyNow(c); } continue; }
      if (a < 0.28) { await appends(1 + Math.floor(r() * 4)); }
      else if (a < 0.36) { note('close+reopen'); await closeStore(); await openStore(); if (store) healthyNow(await check('reopen')); }
      else if (a < 0.52) {
        const mode = r() < 0.4 ? 'kill' : 'power'; const hadFaults = faults > 0;
        vfs.arm(1 + Math.floor(r() * 70), (['none', 'prefix', 'garbage'] as const)[Math.floor(r() * 3)]); note(`crash armed (${mode}) hadFaults=${hadFaults}`);
        try {
          for (let q = 0; q < 6 && store && !vfs.dead; q++) {
            const w = r();
            if (w < 0.6) { if ((await appends(1)) === 'crash') break; }
            else if (w < 0.75) await ctlOp();
            else if (w < 0.85) await extraOp();
            else if (w < 0.93) await evictOp(); else await restoreOp();
          }
          if (store && !vfs.dead) { await store.close(); store = null; }
        } catch (e: any) { if (!(e instanceof Crash)) note('burst threw ' + err(e)); }
        vfs.disarm(); crashSettle(mode); await dropLock(); if (hadFaults) repairCrashes++;
        await openStore(); if (store) { const c = await check('post-crash'); healthyNow(c); note('post-crash clean=' + c); }
      }
      else if (a < 0.57) {
        note('enospc'); vfs.enospcFrom = vfs.allocs + Math.floor(r() * 20); vfs.tearFull = r() < 0.5;
        await appends(4); await ctlOp(); await extraOp();
        if (store) for (const v of vers) { try { const h = await store.head(v.id); if (h.lines > v.evictedThrough) await store.read(v.id, 0, v.evictedThrough, Math.min(h.lines, v.acked.length)); } catch (e: any) { if (!(e instanceof Crash) && faults === 0) viol('read-failed-on-full-disk', err(e)); } }
        vfs.enospcFrom = -1; await closeStore(); await openStore(); if (store) healthyNow(await check('post-enospc'));
      }
      else if (a < 0.62) { snapshot(); }
      else if (a < 0.66) await ctlOp();
      else if (a < 0.70) await extraOp();
      else if (a < 0.75) await evictOp();
      else if (a < 0.78) await restoreOp();
      else {
        await closeStore();
        const files = vfs.files().filter((f) => !f.endsWith('/LOCK')); if (!files.length) continue;
        const kinds = ['flip', 'trunc', 'zero', 'zerorange', 'delete', 'swap', 'older', 'truncrec', 'dup-extend', 'foreign', 'dirrollback'].filter((k) => FAULTS.includes(k));
        const kind = kinds[Math.floor(r() * kinds.length)];
        const f = files[Math.floor(r() * files.length)]; const rel = f.slice(root.length + 1); const buf = vfs.get(f)!;
        let touched = [rel];
        if (kind === 'dirrollback') {
          const vs = verSnaps.filter((s) => s.acked <= vers[s.v].acked.length); if (!vs.length) continue; const s = vs[Math.floor(r() * vs.length)];
          vfs.dirRestore(s.prefix, s.snap); touched = [`versions/${vers[s.v].id.toString('hex')}/ (whole-folder rollback)`]; note(`FAULT dirrollback v${s.v} to ${s.acked} acked lines`);
        } else {
          let nb: Buffer | null = null;
          if (kind === 'flip' && buf.length) { nb = Buffer.from(buf); nb[Math.floor(r() * buf.length)] ^= 1 << Math.floor(r() * 8); }
          else if (kind === 'trunc' && buf.length) nb = buf.subarray(0, Math.floor(r() * buf.length));
          else if (kind === 'truncrec') nb = buf.subarray(0, Math.max(0, buf.length - [16, 32, 48, 64, 100, 128][Math.floor(r() * 6)]));
          else if (kind === 'zero') nb = Buffer.alloc(buf.length);
          else if (kind === 'zerorange' && buf.length) { nb = Buffer.from(buf); const a0 = Math.floor(r() * buf.length); nb.fill(0, a0, Math.min(buf.length, a0 + 1 + Math.floor(r() * 600))); }
          else if (kind === 'delete') nb = null;
          else if (kind === 'swap') { const o = files.filter((x) => x !== f); if (!o.length) continue; const g = o[Math.floor(r() * o.length)]; const gb = vfs.get(g)!; if (gb.equals(buf)) continue; vfs.put(f, gb); vfs.put(g, buf); touched.push(g.slice(root.length + 1)); nb = gb; }
          else if (kind === 'foreign') { const same = files.filter((x) => x !== f && cls(x.slice(root.length + 1)) === cls(rel) && !vfs.get(x)!.equals(buf)); if (!same.length) continue; nb = vfs.get(same[Math.floor(r() * same.length)])!; }
          else if (kind === 'older') { const sn = snaps.length ? snaps[Math.floor(r() * snaps.length)] : null; if (!sn) continue; const ob = sn.get(f); if (ob === undefined) nb = null; else if (ob.equals(buf)) continue; else nb = ob; }
          else if (kind === 'dup-extend') nb = Buffer.concat([buf, buf.subarray(0, Math.min(buf.length, 40))]);
          else continue;
          if (kind !== 'swap') vfs.put(f, nb);
        }
        faults++; faultRels.push(`${kind}:${cls(touched[0])}`);
        if (!touched.every((t) => !ONLY_COPY(t) && !/whole-folder/.test(t))) metaFaultOnly = false;
        for (const t of touched) { if (t.startsWith('control/')) ctlFault = true; if (t.startsWith('extras')) extraFault = true; }
        if (!metaFaultOnly) for (const v of vers) if (touched.some((t) => t.includes(`versions/${v.id.toString('hex')}/`) || t.startsWith('aside/'))) v.touchedOnly = true;
        note(`FAULT ${kind} ${touched.join('+')}`);
        for (let rr = 0; rr < 3 && r() < (rr === 0 ? 0.4 : 0.5); rr++) {
          vfs.arm(1 + Math.floor(r() * 45), (['none', 'prefix', 'garbage'] as const)[Math.floor(r() * 3)]); const mode = r() < 0.4 ? 'kill' : 'power';
          try { const s2 = await ChatStore.open(root, opts()); store = s2; for (const v of vers) { try { await s2.registerVersion(v.id, { chatId: v.chat, runtime: v.runtime }); } catch (e) { if (e instanceof Crash) throw e; } } for (const v of vers) { try { const h = await s2.head(v.id); if (h.lines > v.evictedThrough) await s2.read(v.id, 0, v.evictedThrough, Math.min(h.lines, 3)); } catch (e) { if (e instanceof Crash) throw e; } } await s2.close(); }
          catch (e: any) { if (!(e instanceof Crash)) note('repair-run threw ' + err(e)); }
          store = null; vfs.disarm(); crashSettle(mode); await dropLock(); repairCrashes++; note(`crash inside repair (${mode})`);
        }
        await openStore(); if (store) { const c = await check('post-fault ' + kind + ' ' + cls(rel)); healthyNow(c); note('post-fault clean=' + c); }
      }
    }
    if (!store) await openStore(); if (store) await check('final'); await closeStore(); await openStore(); if (store) await check('cold-final'); await closeStore();
  } catch (e: any) { viol('harness-or-hang', err(e) + '\n' + (e?.stack ?? '').split('\n').slice(0, 4).join('|')); }
  finally { await fsp.rm(tmp, { recursive: true, force: true }); }
  return viols;
}

test('r5 fuzz', async () => {
  let total = 0, withViol = 0; const byKind: Record<string, number> = {};
  for (let seed = FROM; seed <= TO; seed++) {
    const v = await run(seed); total++;
    if (v.length) { withViol++; for (const x of v) { byKind[x.kind + ' ' + x.sig] = (byKind[x.kind + ' ' + x.sig] ?? 0) + 1; await fsp.appendFile(OUT, JSON.stringify(x) + '\n'); } }
  }
  await fsp.appendFile(OUT, JSON.stringify({ done: true, from: FROM, to: TO, total, withViol, byKind, stats: STATS }) + '\n');
}, 3_600_000);
