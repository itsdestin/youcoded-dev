import { test } from 'vitest';
import * as fsp from 'node:fs/promises'; import * as os from 'node:os'; import * as nodePath from 'node:path'; import * as fsx from 'node:fs';
const SRC = process.env.R6_SRC ?? '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store';
const { ChatStore } = await import(SRC + '/store');
const L = (...a: any[]) => fsx.appendFileSync(process.env.PLOG ?? '/tmp/p.log', a.map(String).join(' ') + '\n');
const mk = (tag: string, i: number) => Buffer.from(JSON.stringify({ type: 'user', uuid: `${tag}-${i}`, message: { role: 'user', content: `${tag}#${i}` } }) + '\n');
const V = Buffer.from([1, 2, 3, 4]); const A = Array.from({ length: 80 }, (_, i) => mk('A', i));
const proof = (key: string, through: number, hash: string) => ({ kind: 'holders-confirmed', version: key, through, hash, acks: [{ holder: 'p', version: key, lines: through, hash, signature: 's' }] });
async function dump(s: any, label: string) {
  try { const h = await s.head(V); let bad = 0, ev = 0, ok = 0; for (let i = 0; i < h.lines; i++) { try { const g = await s.read(V, 0, i, i + 1); if (g === 'evicted') ev++; else if (Buffer.from(g[0]).equals(A[i])) ok++; else bad++; } catch (e: any) { L('   read', i, e.code); bad += 0; } } L(label, 'head', h.lines, 'ev', h.evictedLines, 'dmg', h.damagedFromLine, 'rb', JSON.stringify(h.rolledBack), 'ok', ok, 'evicted', ev, 'WRONG', bad); }
  catch (e: any) { L(label, 'head threw', e.code, e.message); }
}
async function fresh(): Promise<{ dir: string; key: string }> { const dir = await fsp.mkdtemp(nodePath.join(process.env.TMPDIR ?? os.tmpdir(), 'p2-')); return { dir, key: V.toString('hex') }; }
const feed = async (s: any, from: number, to: number) => { for (let i = from; i < to; i += 5) await s.append(V, 0, i, A.slice(i, Math.min(to, i + 5))); };
const open = async (dir: string) => { const s = await ChatStore.open(dir, { proofVerifier: () => true, chunkBytes: 700 }); await s.registerVersion(V, { chatId: 'c', runtime: 'claude-code' }); return s; };
test('F4: delete index.bin after eviction', async () => {
  const { dir, key } = await fresh(); let s = await open(dir);
  await feed(s, 0, 60); const h = await s.hashAt(V, 0, 30); L('evict30', JSON.stringify(await s.evictBody(V, proof(key, 30, h))), fsx.readdirSync(nodePath.join(dir,'versions',key)).filter((f)=>f.startsWith('body')).length, 'chunks'); await dump(s, 'F4 before delete'); await s.close();
  await fsp.rm(nodePath.join(dir, 'versions', key, 'index.bin')); s = await open(dir); await dump(s, 'F4 delete index'); 
  await s.append(V, 0, 60, A.slice(60, 70)); await dump(s, 'F4 +append'); await s.close();
  // both index and replaced copies
  s = await open(dir); await dump(s, 'F4 reopen'); await s.close();
});
test('F5: older checkpoint after a second eviction', async () => {
  const { dir, key } = await fresh(); let s = await open(dir);
  await feed(s, 0, 60); await s.evictBody(V, proof(key, 10, await s.hashAt(V, 0, 10))); await s.close();
  const old = fsx.readFileSync(nodePath.join(dir, 'versions', key, 'checkpoint.bin'));
  s = await open(dir); await s.evictBody(V, proof(key, 40, await s.hashAt(V, 0, 40))); await s.close();
  fsx.writeFileSync(nodePath.join(dir, 'versions', key, 'checkpoint.bin'), old); s = await open(dir); await dump(s, 'F5 older checkpoint'); await s.close();
  // and older checkpoint + deleted index
  await fsp.rm(nodePath.join(dir, 'versions', key, 'index.bin')); s = await open(dir); await dump(s, 'F5 older ck + deleted index'); await s.close();
  s = await open(dir); await dump(s, 'F5 reopen'); await s.close();
});
test('F3 neighbours: rollback of the folder after eviction; rollback of HW alone; rollback of both', async () => {
  const { dir, key } = await fresh(); let s = await open(dir);
  await feed(s, 0, 40); await s.close();
  const vd = nodePath.join(dir, 'versions', key); const snap = new Map<string, Buffer>(); for (const f of fsx.readdirSync(vd)) if (fsx.statSync(nodePath.join(vd, f)).isFile()) snap.set(f, fsx.readFileSync(nodePath.join(vd, f)));
  const hwsnap = fsx.readFileSync(nodePath.join(dir, 'highwater', key + '.hw'));
  s = await open(dir); await feed(s, 40, 70); await s.evictBody(V, proof(key, 20, await s.hashAt(V, 0, 20))); await s.close();
  const restore = () => { for (const f of fsx.readdirSync(vd)) if (fsx.statSync(nodePath.join(vd, f)).isFile()) fsx.rmSync(nodePath.join(vd, f)); for (const [f, b] of snap) fsx.writeFileSync(nodePath.join(vd, f), b); };
  const cp = fsx.cpSync; const full = nodePath.join(dir + '-copy'); cp(dir, full, { recursive: true });
  restore(); s = await open(dir); await dump(s, 'F3 folder rolled back (evicted since)'); await s.close();
  fsx.rmSync(dir, { recursive: true }); cp(full, dir, { recursive: true });
  fsx.writeFileSync(nodePath.join(dir, 'highwater', key + '.hw'), hwsnap); s = await open(dir); await dump(s, 'F3 HW alone rolled back'); await s.close();
  restore(); fsx.writeFileSync(nodePath.join(dir, 'highwater', key + '.hw'), hwsnap); s = await open(dir); await dump(s, 'F3 both rolled back (documented undetectable)'); await s.close();
});
