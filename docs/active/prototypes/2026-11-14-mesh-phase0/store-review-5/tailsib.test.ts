import { test } from 'vitest';
import * as fsp from 'node:fs/promises'; import * as nodePath from 'node:path';
import { ChatStore } from '../src/main/mesh/store/store';
const mk = (tag: string, n: number) => Array.from({ length: n }, (_, i) => Buffer.from(JSON.stringify({ type: 'user', uuid: tag + i, message: { role: 'user', content: tag + 'y'.repeat(30) + i } }) + '\n'));
test('tail sibling', async () => {
  const tmp = await fsp.mkdtemp(nodePath.join(process.env.TMPDIR!, 'ts-')); const root = nodePath.join(tmp, 's'); const id = Buffer.from([7, 7, 7]);
  let s = await ChatStore.open(root, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
  const L = mk('L', 8); await s.append(id, 0, 0, L);
  await s.setAsideTail('aaaaaaaaaaaa', id, 6);           // tail A = lines 6,7
  await s.append(id, 0, 6, mk('M', 4));                    // new host appends
  await s.setAsideTail('bbbbbbbbbbbb', id, 3);            // tail B = lines 3..9
  await s.close();
  const td = nodePath.join(root, 'versions', id.toString('hex'), 'tails');
  await fsp.copyFile(nodePath.join(td, 'bbbbbbbbbbbb.tail'), nodePath.join(td, 'aaaaaaaaaaaa.tail'));   // one file replaced by a valid sibling
  s = await ChatStore.open(root, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
  let res = ''; try { const t = await s.tail('aaaaaaaaaaaa', id); res = t ? `tail aaaa returned fromLine=${t.fromLine} lines=${t.lines.length} (true tail: fromLine=6 lines=2)` : 'null'; } catch (e: any) { res = 'threw ' + e.code; }
  await fsp.writeFile(process.env.TMPDIR + '/ts.out', res); await s.close(); await fsp.rm(tmp, { recursive: true, force: true });
});
