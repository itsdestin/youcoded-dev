// Deterministic repro of the two recovery relaxations on a REAL disk: build a pre-takeover state, snapshot, takeover + new lines, then put older files back.
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
const BASE = process.env.R7_BASE ?? '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-8';
const SRCS: Record<string, any> = { old: await import(BASE + '/old/store'), new: await import(BASE + '/new/store') };
const line = (t: string, i: number) => Buffer.from(JSON.stringify({ type: i % 2 ? 'assistant' : 'user', uuid: `${t}-${i}`, message: { role: 'user', content: `${t} ${i}` } }) + '\n');
const id = Buffer.from([0xc1, 1, 7, 9]);
async function cp(a: string, b: string) { await fsp.rm(b, { recursive: true, force: true }); await fsp.cp(a, b, { recursive: true }); }
async function build(root: string) {
  const s = await SRCS.new.ChatStore.open(root, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
  const H0 = Array.from({ length: 20 }, (_, i) => line('old', i));
  await s.append(id, 0, 0, H0); await s.close();
  await cp(root, root + '.snap');                                     // the OLD state: 20 lines of history 0
  const s2 = await SRCS.new.ChatStore.open(root, {}); await s2.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
  await s2.setAsideTail('aa11bb22cc33', id, 10);                       // takeover at line 10
  const H1 = Array.from({ length: 6 }, (_, i) => line('new', 10 + i));
  await s2.append(id, 0, 10, H1); await s2.close();
  return { H0, H1, cur: H0.slice(0, 10).concat(H1) };
}
async function probe(name: string, files: string[], src: string, m: any) {
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r7p-')); const r = root + '/s'; await fsp.mkdir(r);
  const mm = await build(r);
  const vd = (await fsp.readdir(r + '/versions'))[0]; const V = `${r}/versions/${vd}`; const SV = `${r}.snap/versions/${vd}`;
  const names = (await fsp.readdir(V)).concat([]);
  const pick = (await fsp.readdir(SV)).filter((n) => files.some((f) => (f.endsWith('*') ? n.startsWith(f.slice(0, -1)) : n === f)));
  for (const n of pick) await fsp.copyFile(`${SV}/${n}`, `${V}/${n}`);
  if (process.env.X_TAILS) await fsp.rm(`${V}/tails`, { recursive: true, force: true });
  if (process.env.X_HW) await fsp.rm(`${r}/highwater`, { recursive: true, force: true });
  for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(`${r}/${n}`, { force: true });
  let out = '';
  try {
    const s = await SRCS[src].ChatStore.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    const h = await s.head(id); out = `head=${h.lines} damagedFrom=${h.damagedFromLine} rolledBack=${JSON.stringify(h.rolledBack)}`;
    let wrong = 0; for (let i = 0; i < h.lines; i++) { try { const g = await s.read(id, 0, i, i + 1); if (!Buffer.from(g[0]).equals(mm.cur[i] ?? Buffer.alloc(0))) wrong++; } catch { out += ` readErr@${i}`; break; } }
    out += ` wrongLines=${wrong} (model=${mm.cur.length}) lost=${(await s.head(id)).lostTakeovers}`;
    await s.close();
  } catch (e: any) { out = `THROWS ${e.code ?? e.constructor.name}: ${String(e.message).slice(0, 90)}`; }
  (await import('node:fs')).appendFileSync(BASE + '/probe10.out', `${name.padEnd(14)} ${src.padEnd(4)} tails-gone=${!!process.env.X_TAILS} hw-gone=${!!process.env.X_HW} ${out}\n`);
  await fsp.rm(root, { recursive: true, force: true });
}
test('probe10', async () => {
  for (const [name, files] of [['idx only', ['index.bin']], ['ck only', ['checkpoint.bin']], ['body only', ['body-*']], ['idx+body', ['index.bin', 'body-*']], ['ck+body', ['checkpoint.bin', 'body-*']], ['idx+ck', ['index.bin', 'checkpoint.bin']], ['idx+ck+body', ['index.bin', 'checkpoint.bin', 'body-*']]] as [string, string[]][])
    for (const src of ['new']) await probe(name, files, src, null);
}, 600000);
