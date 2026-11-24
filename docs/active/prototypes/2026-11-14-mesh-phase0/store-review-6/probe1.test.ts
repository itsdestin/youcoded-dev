import { test } from 'vitest';
import * as fsp from 'node:fs/promises'; import * as os from 'node:os'; import * as nodePath from 'node:path';
const SRC = process.env.R6_SRC ?? '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store';
const { ChatStore } = await import(SRC + '/store');
const mk = (tag: string, i: number) => Buffer.from(JSON.stringify({ type: 'user', uuid: `${tag}-${i}`, message: { role: 'user', content: `${tag}#${i}` } }) + '\n');
import * as fsx from 'node:fs'; const L = (...a: any[]) => fsx.appendFileSync(process.env.PLOG ?? '/tmp/p.log', a.map(String).join(' ') + '\n');
test('park survives a takeover cut and drains into the new history', async () => {
  const dir = await fsp.mkdtemp(nodePath.join(process.env.TMPDIR ?? os.tmpdir(), 'p1-'));
  const s = await ChatStore.open(dir, {}); const V = Buffer.from([1, 2, 3, 4]);
  await s.registerVersion(V, { chatId: 'c', runtime: 'claude-code' });
  const A = Array.from({ length: 80 }, (_, i) => mk('A', i)); const B = Array.from({ length: 80 }, (_, i) => mk('B', i));
  L('append A 0..40', await s.append(V, 0, 0, A.slice(0, 40)));
  L('park A 50..53', await s.append(V, 0, 50, A.slice(50, 53)));
  L('cut at 20', await s.setAsideTail('aabbccdd0011', V, 20));
  L('append B 20..60', await s.append(V, 0, 20, B.slice(20, 50)));  L('append B 50..60 (the real continuation)', await s.append(V, 0, 50, B.slice(50, 60)));
  const h = await s.head(V); L('head', h.lines, 'damaged', h.damagedFromLine);
  for (const i of [49, 50, 51, 52, 53]) { const g = await s.read(V, 0, i, i + 1); L(i, g === 'evicted' ? g : Buffer.from(g[0]).toString().slice(0, 60).trim()); }
  await s.close();
});
