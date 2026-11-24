// B1 class via quarantine/set-aside: parked/ and tails/ STAY when a version is set aside (asides.ts), so a park parked against history A drains onto a recopy of history B.
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
const BASE = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-8';
const SRCS: Record<string, any> = { old: await import(BASE + '/old/store'), new: await import(BASE + '/new/store') };
const line = (t: string, i: number) => Buffer.from(JSON.stringify({ type: i % 2 ? 'assistant' : 'user', uuid: `${t}-${i}`, message: { role: 'user', content: `${t} ${i}` } }) + '\n');
const id = Buffer.from([0xe1, 1, 7, 9]);
test('probe3', async () => {
  for (const src of ['old', 'new']) for (const mode of ['setAsideDamaged', 'takeoverThenSetAside']) {
    const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r7q-')); const r = root + '/s'; await fsp.mkdir(r);
    const S = SRCS[src].ChatStore; let s = await S.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    const A = Array.from({ length: 16 }, (_, i) => line('A', i)); const B = Array.from({ length: 16 }, (_, i) => line('B', i));
    await s.append(id, 0, 0, A.slice(0, 10)); const pr = await s.append(id, 0, 12, A.slice(12, 14));            // park of history A at 12..13
    if (mode === 'takeoverThenSetAside') { await s.setAsideTail('aa11bb22cc33', id, 8); await s.append(id, 0, 8, B.slice(8, 10)); }
    await s.setAsideDamaged(id);                                                                                   // the copy is declared damaged: version restarts empty; parked/ stays
    await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' }).catch(() => {});
    const res = await s.append(id, 0, 0, B.slice(0, 12));                                                          // a peer recopies history B up to the park's position
    const h = await s.head(id); let wrong = 0; for (let i = 0; i < h.lines; i++) { const g = await s.read(id, 0, i, i + 1); if (!Buffer.from(g[0]).equals(B[i] ?? Buffer.alloc(0))) wrong++; }
    fs.appendFileSync(BASE + '/probe3.out', `${src} ${mode.padEnd(22)} park=${pr} recopy=${res} head=${h.lines} (sent 12) wrongLines=${wrong} damaged=${h.damagedFromLine}\n`);
    await s.close(); await fsp.rm(root, { recursive: true, force: true });
  }
}, 600000);
