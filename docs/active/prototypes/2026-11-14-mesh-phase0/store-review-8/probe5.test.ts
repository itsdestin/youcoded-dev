// Whole VERSION folder rolled back to a snapshot taken between two takeovers (tails/ included), high-water record (outside the folder) left alone.
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
const BASE = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-8';
const SRC = await import(BASE + '/new/store');
const line = (t: string, i: number) => Buffer.from(JSON.stringify({ type: i % 2 ? 'assistant' : 'user', uuid: `${t}-${i}`, message: { role: 'user', content: `${t} ${i}` } }) + '\n');
const id = Buffer.from([0xa5, 1, 7, 9]);
const out = (s: string) => fs.appendFileSync(BASE + '/probe5.out', s + '\n');
test('probe5', async () => {
  for (const variant of ['snapAfterT1', 'snapBeforeT1']) {
    const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r8p5-')); const r = root + '/s'; await fsp.mkdir(r);
    let s = await SRC.ChatStore.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    const A = Array.from({ length: 30 }, (_, i) => line('A', i));
    await s.append(id, 0, 0, A); await s.close();
    const vd = (await fsp.readdir(r + '/versions'))[0]; const V = `${r}/versions/${vd}`;
    if (variant === 'snapBeforeT1') await fsp.cp(V, root + '/snapV', { recursive: true });
    s = await SRC.ChatStore.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    await s.setAsideTail('aa11bb22cc33', id, 20); await s.append(id, 0, 20, Array.from({ length: 10 }, (_, i) => line('B', 20 + i))); await s.close();
    if (variant === 'snapAfterT1') await fsp.cp(V, root + '/snapV', { recursive: true });
    s = await SRC.ChatStore.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    await s.setAsideTail('bb22cc33dd44', id, 12); await s.append(id, 0, 12, Array.from({ length: 4 }, (_, i) => line('C', 12 + i))); await s.close();
    // put the whole version folder back to the snapshot (highwater/ outside it stays)
    await fsp.rm(V, { recursive: true, force: true }); await fsp.cp(root + '/snapV', V, { recursive: true });
    for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(`${r}/${n}`, { force: true });
    s = await SRC.ChatStore.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    const h = await s.head(id);
    out(`${variant}: head=${h.lines} damaged=${h.damagedFromLine} rolledBack=${JSON.stringify(h.rolledBack)} lostTakeovers=${h.lostTakeovers}`);
    await s.close(); await fsp.rm(root, { recursive: true, force: true });
  }
}, 600000);
