// Two older-file events separated by a takeover. (1) the whole version folder is put back to its 29-line state (loud: rolledBack) and lines 29..34 are not re-sent; (2) a takeover at 23 cuts a tail of lines 23..28;
// (3) an OLD index.bin + bodies from the 35-line time (a backup) are put back over the current ones. The only evidence the load-time proof uses is the takeover tail (23..28), which does not reach line 35.
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
const BASE = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-8';
const SRCS: Record<string, any> = { old: await import(BASE + '/old/store'), new: await import(BASE + '/new/store') };
const line = (t: string, i: number) => Buffer.from(JSON.stringify({ type: i % 2 ? 'assistant' : 'user', uuid: `${t}-${i}`, message: { role: 'user', content: `${t} ${i} ${'x'.repeat(30)}` } }) + '\n');
const id = Buffer.from([0xa8, 1, 7, 9]);
const out = (s: string) => fs.appendFileSync(BASE + '/probe8.out', s + '\n');
test('probe8', async () => {
  for (const src of ['old', 'new']) for (const who of ['index+bodies', 'index+bodies+checkpoint']) {
    const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r8p8-')); const r = root + '/s'; await fsp.mkdir(r);
    const S = SRCS[src].ChatStore; const o = { chunkBytes: 1 << 24 };
    const A = Array.from({ length: 35 }, (_, i) => line('A', i));
    let s = await S.open(r, o); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    await s.append(id, 0, 0, A.slice(0, 29)); await s.close();
    const vd = (await fsp.readdir(r + '/versions'))[0]; const V = `${r}/versions/${vd}`;
    await fsp.cp(V, root + '/snap29', { recursive: true });
    s = await S.open(r, o); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' }); await s.append(id, 0, 29, A.slice(29, 35)); await s.close();
    await fsp.cp(V, root + '/snap35', { recursive: true });
    // fault 1: the whole version folder back to 29 lines
    await fsp.rm(V, { recursive: true, force: true }); await fsp.cp(root + '/snap29', V, { recursive: true });
    for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(`${r}/${n}`, { force: true });
    s = await S.open(r, o); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' }); const h1 = await s.head(id);
    await s.setAsideTail('aa11bb22cc33', id, 23); const B = Array.from({ length: 4 }, (_, i) => line('B', 23 + i)); await s.append(id, 0, 23, B); await s.close();
    const cur = A.slice(0, 23).concat(B);
    // fault 2: index + bodies of the 35-line time back
    for (const f of await fsp.readdir(`${root}/snap35`)) if (f === 'index.bin' || f.startsWith('body-') || (who.includes('checkpoint') && f === 'checkpoint.bin')) await fsp.copyFile(`${root}/snap35/${f}`, `${V}/${f}`);
    for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(`${r}/${n}`, { force: true });
    let res = '';
    try {
      s = await S.open(r, o); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
      const h = await s.head(id); const from = Math.min(h.damagedFromLine ?? Infinity, h.rolledBack?.from ?? Infinity, (h.lostTakeovers ?? 0) > 0 ? 0 : Infinity);
      let wrong = 0, first = -1; for (let i = 0; i < h.lines; i++) { try { const g = await s.read(id, 0, i, i + 1); if (g !== 'evicted' && !(i < cur.length && Buffer.from(g[0]).equals(cur[i])) && i < from) { wrong++; if (first < 0) first = i; } } catch { /* typed throw = loud */ } }
      res = `after fault1 head=${h1.lines} rb=${JSON.stringify(h1.rolledBack)} | after fault2 head=${h.lines} model=${cur.length} damaged=${h.damagedFromLine} rb=${JSON.stringify(h.rolledBack)} lost=${h.lostTakeovers} QUIETWRONG=${wrong}${first >= 0 ? '@' + first : ''}`;
      await s.close();
    } catch (e: any) { res = `THROWS ${e.code ?? e.constructor.name}`; }
    out(`${src} ${who}: ${res}`); await fsp.rm(root, { recursive: true, force: true });
  }
}, 600000);
