import { test } from 'vitest';
import * as fsp from 'node:fs/promises'; import * as os from 'node:os'; import * as nodePath from 'node:path'; import * as fsx from 'node:fs';
const SRC = process.env.R6_SRC ?? '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store';
const { ChatStore } = await import(SRC + '/store');
const L = (...a: any[]) => fsx.appendFileSync(process.env.PLOG ?? '/tmp/p.log', a.map(String).join(' ') + '\n');
const mk = (tag: string, i: number) => Buffer.from(JSON.stringify({ type: 'user', uuid: `${tag}-${i}`, message: { role: 'user', content: `${tag}#${i}` } }) + '\n');
const V = Buffer.from([1, 2, 3, 4]); const A = Array.from({ length: 80 }, (_, i) => mk('A', i));
test('tail with no .done marker: crash between cut and marker, retry, then the tail file is lost', async () => {
  const dir = await fsp.mkdtemp(nodePath.join(process.env.TMPDIR ?? os.tmpdir(), 'p3-')); const key = V.toString('hex');
  let s = await ChatStore.open(dir, {}); await s.registerVersion(V, { chatId: 'c', runtime: 'claude-code' });
  await s.append(V, 0, 0, A.slice(0, 40)); await s.setAsideTail('aabbccdd0011', V, 20); await s.close();
  const td = nodePath.join(dir, 'versions', key, 'tails');
  fsx.rmSync(nodePath.join(td, 'aabbccdd0011.done')); L('state after a crash between cut and marker: files', fsx.readdirSync(td).join(','));
  s = await ChatStore.open(dir, {}); await s.registerVersion(V, { chatId: 'c', runtime: 'claude-code' });
  L('caller retries setAsideTail ->', JSON.stringify(await s.setAsideTail('aabbccdd0011', V, 20)), 'files now', fsx.readdirSync(td).join(',')); await s.close();
  fsx.rmSync(nodePath.join(td, 'aabbccdd0011.tail'));   // one lost file
  s = await ChatStore.open(dir, {}); await s.registerVersion(V, { chatId: 'c', runtime: 'claude-code' });
  const h = await s.head(V); L('head', h.lines, 'damaged', h.damagedFromLine);
  L('tail() ->', JSON.stringify(await s.tail('aabbccdd0011', V)), '(20 acknowledged lines 20..39 are gone; nothing reports it)');
  L('retry again ->', JSON.stringify(await s.setAsideTail('aabbccdd0011', V, 20)).slice(0, 80), 'files', fsx.readdirSync(td).join(',')); await s.close();
});
