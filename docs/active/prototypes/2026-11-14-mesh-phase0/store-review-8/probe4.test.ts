// Whole-folder rollback (everything incl. parked/ and tails/ put back) then the peer resends the CURRENT history: does a park of the older history drain onto it? Built and read with the SAME source.
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
const BASE = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-8';
const SRCS: Record<string, any> = { old: await import(BASE + '/old/store'), new: await import(BASE + '/new/store') };
const line = (t: string, i: number) => Buffer.from(JSON.stringify({ type: i % 2 ? 'assistant' : 'user', uuid: `${t}-${i}`, message: { role: 'user', content: `${t} ${i}` } }) + '\n');
const id = Buffer.from([0xf1, 1, 7, 9]);
test('probe4', async () => {
  for (const src of ['old', 'new']) {
    const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r7r-')); const r = root + '/s'; await fsp.mkdir(r);
    const S = SRCS[src].ChatStore; let s = await S.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    const A = Array.from({ length: 16 }, (_, i) => line('A', i)); const B = Array.from({ length: 20 }, (_, i) => i < 5 ? A[i] : line('B', i));
    await s.append(id, 0, 0, A.slice(0, 10)); await s.append(id, 0, 12, A.slice(12, 14)); await s.close();
    await fsp.cp(r, r + '.snap', { recursive: true });                                            // the OLD folder: history A, head 10, park of A at 12..13
    s = await S.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    await s.setAsideTail('aa11bb22cc33', id, 5); await s.append(id, 0, 5, B.slice(5, 18)); await s.close();   // history B now, head 18
    await fsp.rm(r, { recursive: true, force: true }); await fsp.cp(r + '.snap', r, { recursive: true });       // whole folder put back
    for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(`${r}/${n}`, { force: true });
    s = await S.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    let h = await s.head(id); const first = `head=${h.lines} rolledBack=${JSON.stringify(h.rolledBack)} damaged=${h.damagedFromLine}`;
    const res = await s.append(id, 0, h.lines, B.slice(h.lines, 12));                                // the peer resends history B up to line 12 (the park's position)
    h = await s.head(id); let wrong = 0; for (let i = 0; i < h.lines; i++) { const g = await s.read(id, 0, i, i + 1); if (!Buffer.from(g[0]).equals(B[i] ?? Buffer.alloc(0))) wrong++; }
    fs.appendFileSync(BASE + '/probe4.out', `${src}: after rollback ${first}; resend B to 12 -> ${res}; head=${h.lines} wrongLines(vs B)=${wrong} rolledBack=${JSON.stringify(h.rolledBack)} damaged=${h.damagedFromLine}\n`);
    await s.close(); await fsp.rm(root, { recursive: true, force: true });
  }
}, 600000);
