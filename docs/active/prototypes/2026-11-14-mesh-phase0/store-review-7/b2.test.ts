// Reviewer-7 item 3 (B2 class) and item 2 (B1 class, crash/lose-marker variants): enumerate EVERY disk operation of setAsideTail as the crash point, x tear mode x settle mode,
// then lose / rot / replace each of tail, .begun, .done (one fault), then up to 3 retries (each may crash at a random op). Oracle: end state is "complete tail (and cut finished)" or a typed error;
// every acknowledged line is either still in the version, in a readable tail, or its loss was reported by a typed error from tail()/setAsideTail().
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
const BASE = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-7';
const SRCS: Record<string, any> = { old: await import(BASE + '/old/store'), new: await import(BASE + '/new/store') };
const { StoreError } = await import(BASE + '/new/errors'); const { StoreError: SEO } = await import(BASE + '/old/errors');
import { VFS, Crash } from './vfs';
const SRC = process.env.R7_SRC ?? 'new';
const OUT = BASE + `/b2-${SRC}.jsonl`;
function prng(seed: number) { let a = (seed * 2654435761 + 12345) >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }
const typed = (e: unknown) => e instanceof StoreError || e instanceof SEO;
const line = (t: string, i: number) => Buffer.from(JSON.stringify({ type: i % 2 ? 'assistant' : 'user', uuid: `${t}-${i}`, message: { role: 'user', content: `${t} ${i}` } }) + '\n');
const id = Buffer.from([0xd1, 1, 7, 9]); const key = id.toString('hex');
const FAULTS = ['none', 'delTail', 'delBegun', 'delDone', 'flipTail', 'truncTail', 'zeroTail', 'delTailBegun', 'delTailDone', 'delAllThree'];

async function scenario(seed: number, crashAt: number, tear: 'none' | 'prefix' | 'garbage', settle: 'kill' | 'power', fault: string, prior: boolean, withParks: boolean): Promise<string[]> {
  const r = prng(seed * 1000 + crashAt);
  const tmp = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r7b-')); const root = nodePath.join(tmp, 'store'); await fsp.mkdir(root);
  const vfs = new VFS(r); { let p = ''; for (const seg of root.split('/').filter(Boolean)) { p += '/' + seg; vfs.base.set(p, 'D'); vfs.vol.set(p, 'D'); } }
  const bad: string[] = []; let clock = 1_700_000_000_000;
  const dropLock = async () => { for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(nodePath.join(root, n), { force: true }); };
  const open = async () => { for (let a = 0; a < 2; a++) { try { const s = await SRCS[SRC].ChatStore.open(root, { fs: vfs as any, chunkBytes: 1500, proofVerifier: () => true, now: () => (clock += 1000) }); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' }); return s; } catch (e: any) { if (e instanceof Crash || vfs.dead) throw e; if (typed(e) && /store-locked/.test(e.code) && a === 0) { await dropLock(); continue; } throw e; } } };
  const H = Array.from({ length: 14 }, (_, i) => line('h', i));
  let s = await open();
  if (prior) { await s.append(id, 0, 0, H.slice(0, 6)); await s.setAsideTail('0000000000aa', id, 4); await s.append(id, 0, 4, H.slice(4, 6)); } // an earlier takeover already happened: epoch != genesis
  const base = prior ? 6 : 0;
  await s.append(id, 0, base, H.slice(base, 12)); // head 12 in this history
  if (withParks) { await s.append(id, 0, 14, [line('p', 14), line('p', 15)]); await s.append(id, 0, 17, [line('p', 17)]); }
  await s.close(); await dropLock(); vfs.settle('kill');
  const hd0 = 12; const FROM = 7; const tid = 'bb22cc33dd44';
  const expectTail = (prior ? H.slice(0, 4).concat(H.slice(4, 6)).concat(H.slice(6, 12)) : H.slice(0, 12)).slice(FROM); // model history lines [FROM,12)
  const model = (prior ? H.slice(0, 4).concat(H.slice(4, 6)).concat(H.slice(6, 12)) : H.slice(0, 12));
  // crash during setAsideTail
  s = await open(); let crashed = false;
  vfs.arm(crashAt, tear);
  try { await s.setAsideTail(tid, id, FROM); } catch (e: any) { if (e instanceof Crash || vfs.dead) crashed = true; else { vfs.disarm(); bad.push('first-call-threw ' + (typed(e) ? e.code : 'UNTYPED ' + e?.message)); } }
  vfs.disarm();
  if (!crashed && !vfs.dead) { try { await s.close(); } catch { /* */ } await fsp.rm(tmp, { recursive: true, force: true }); return ['__no-crash']; }
  vfs.settle(settle); await dropLock();
  // one fault
  const pre = root + `/versions/${key}/tails/`;
  const f = (n: string) => pre + `${tid}.${n}`;
  const t = vfs.get(f('tail')); const del = (n: string) => vfs.put(f(n), null);
  if (fault === 'delTail') vfs.put(f('tail'), null); else if (fault === 'delBegun') del('begun'); else if (fault === 'delDone') del('done');
  else if (fault === 'flipTail' && t) { const c = Buffer.from(t); c[Math.floor(r() * c.length)] ^= 1 << Math.floor(r() * 8); vfs.put(f('tail'), c); }
  else if (fault === 'truncTail' && t) vfs.put(f('tail'), t.subarray(0, Math.floor(r() * t.length)));
  else if (fault === 'zeroTail' && t) vfs.put(f('tail'), Buffer.alloc(0));
  else if (fault === 'delAllThree') { vfs.put(f('tail'), null); del('begun'); del('done'); }
  else if (fault === 'delTailBegun') { vfs.put(f('tail'), null); del('begun'); } else if (fault === 'delTailDone') { vfs.put(f('tail'), null); del('done'); }
  // up to 3 retries, each may crash
  let sawTyped = false; let ok = false;
  for (let k = 0; k < 4 && !ok; k++) {
    const last = k === 3; let st: any = null;
    try {
      if (!last && r() < 0.5) vfs.arm(1 + Math.floor(r() * 25), (['none', 'prefix', 'garbage'] as const)[Math.floor(r() * 3)]);
      st = await open();
      const res = await st.setAsideTail(tid, id, FROM); ok = true; vfs.disarm();
      if (res.lines !== expectTail.length) bad.push(`retry-returned-lines=${res.lines} expected ${expectTail.length}`);
      await st.close();
    } catch (e: any) {
      if (e instanceof Crash || vfs.dead) { vfs.disarm(); vfs.settle(r() < 0.5 ? 'power' : 'kill'); await dropLock(); continue; }
      vfs.disarm(); if (typed(e)) { sawTyped = true; if (e.code === 'corrupt' || true) { try { await st?.close(); } catch { /* */ } } break; } bad.push('retry-untyped ' + e?.constructor?.name + ' ' + e?.message);
      try { await st?.close(); } catch { /* */ } break;
    }
  }
  vfs.disarm(); await dropLock();
  // judge end state
  try {
    const st = await open(); const hd = await st.head(id);
    let tailRes: any = 'null'; let tailTyped = false;
    try { const tr = await st.tail(tid, id); tailRes = tr; } catch (e: any) { if (typed(e)) { tailTyped = true; tailRes = 'typed:' + e.code; } else bad.push('tail-untyped ' + e?.message); }
    const tailOK = tailRes && typeof tailRes === 'object' && tailRes.lines.length === expectTail.length && tailRes.lines.every((l: any, i: number) => Buffer.from(l).equals(expectTail[i]));
    if (tailRes && typeof tailRes === 'object' && !tailOK) bad.push(`tail-WRONG len=${tailRes.lines.length} expect=${expectTail.length} from=${tailRes.fromLine}`);
    // every acknowledged line [FROM,12): in the version, in the tail, or reported
    const inVersion = hd.lines; const reported = tailTyped || sawTyped || hd.damagedFromLine !== null || hd.rolledBack !== null;
    for (let i = FROM; i < 12; i++) { const inV = i < inVersion; const inT = !!tailOK; if (!inV && !inT && !reported) { bad.push(`acked-line-${i}-SILENTLY-GONE head=${inVersion} tail=${tailRes === 'null' ? 'null' : tailRes?.lines ? 'wrong' : tailRes}`); break; } }
    // lines present in the version must be the model's lines (or the cut): no stale content
    for (let i = 0; i < inVersion; i++) { let g: any; try { g = await st.read(id, 0, i, i + 1); } catch (e: any) { if (!typed(e)) bad.push('read-untyped'); break; } if (g !== 'evicted' && !(i < model.length && Buffer.from(g[0]).equals(model[i]))) { bad.push(`version-line-${i}-wrong head=${inVersion}`); break; } }
    // end state when the retry reported success: tail complete, cut finished (head == FROM)
    if (ok && (!tailOK || inVersion !== FROM)) bad.push(`retry-ok-but tailOK=${tailOK} head=${inVersion} (want ${FROM})`);
    // parks: any stale park must not be drained: append from FROM the NEW history lines, then head must be exactly what we sent
    if (ok) {
      const nl = Array.from({ length: 5 }, (_, i) => line('n', FROM + i)); let res: any; try { res = await st.append(id, 0, FROM, nl); } catch (e: any) { res = 'threw'; bad.push('post-append-threw ' + (typed(e) ? e.code : 'UNTYPED')); }
      const h2 = await st.head(id); if (res === 'ok' && h2.lines !== FROM + 5) bad.push(`STALE-PARK-DRAINED head=${h2.lines} want ${FROM + 5}`);
    }
    await st.close();
  } catch (e: any) { bad.push('judge-threw ' + (typed(e) ? 'typed:' + e.code : 'UNTYPED ' + e?.message)); }
  await fsp.rm(tmp, { recursive: true, force: true });
  return bad;
}
test('b2 enumerate', async () => {
  fs.rmSync(OUT, { force: true }); let n = 0; const sumBad: Record<string, number> = {};
  for (const prior of [false, true]) for (const withParks of [false, true]) for (let seed = 1; seed <= Number(process.env.R7_SEEDS ?? 6); seed++) for (let crashAt = 1; crashAt <= 80; crashAt++) {
    let done = false;
    for (const tear of ['none', 'prefix', 'garbage'] as const) {
      if (done) break;
      for (const settle of ['kill', 'power'] as const) for (const fault of FAULTS) {
        let bad: string[]; try { bad = await scenario(seed, crashAt, tear, settle, fault, prior, withParks); } catch (e: any) { bad = ['harness ' + String(e?.stack).slice(0, 200)]; }
        if (bad[0] === '__no-crash') { done = true; break; }
        n++;
        if (bad.length) { for (const b of bad) sumBad[b.replace(/\d+/g, 'N')] = (sumBad[b.replace(/\d+/g, 'N')] ?? 0) + 1; fs.appendFileSync(OUT, JSON.stringify({ seed, crashAt, tear, settle, fault, prior, withParks, bad }) + '\n'); }
      }
    }
  }
  fs.appendFileSync(OUT + '.stats', JSON.stringify({ n, sumBad }) + '\n');
}, 7 * 24 * 3600 * 1000);
