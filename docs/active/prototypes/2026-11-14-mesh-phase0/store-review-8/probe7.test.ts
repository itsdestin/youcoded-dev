// "Backup restored over the folder without deleting newer files" (rbOverlay): version folder snapshot taken BEFORE a takeover, takeover + new lines, then every file of the snapshot copied back over the folder (files created later stay).
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
const BASE = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-8';
const SRCS: Record<string, any> = { old: await import(BASE + '/old/store'), new: await import(BASE + '/new/store') };
const line = (t: string, i: number) => Buffer.from(JSON.stringify({ type: i % 2 ? 'assistant' : 'user', uuid: `${t}-${i}`, message: { role: 'user', content: `${t} ${i} ${'x'.repeat(t === 'A' ? 120 : 4)}` } }) + '\n');
const id = Buffer.from([0xa7, 1, 7, 9]);
const out = (s: string) => fs.appendFileSync(BASE + '/probe7.out', s + '\n');
async function walk(d: string, base = d): Promise<string[]> { const r: string[] = []; for (const e of await fsp.readdir(d, { withFileTypes: true })) { const p = nodePath.join(d, e.name); if (e.isDirectory()) r.push(...await walk(p, base)); else r.push(nodePath.relative(base, p)); } return r; }
test('probe7', async () => {
  for (const src of ['old', 'new']) for (const chunk of [700, 1500, 4000]) for (const tail of ['takeover-at-20', 'takeover-at-0']) {
    const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r8p6-')); const r = root + '/s'; await fsp.mkdir(r);
    const S = SRCS[src].ChatStore; const o = { chunkBytes: chunk };
    let s = await S.open(r, o); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    const A = Array.from({ length: 55 }, (_, i) => line('A', i)); await s.append(id, 0, 0, A); await s.close();
    const vd = (await fsp.readdir(r + '/versions'))[0]; const V = `${r}/versions/${vd}`;
    await fsp.cp(V, root + '/snapV', { recursive: true });
    const cut = tail === 'takeover-at-20' ? 20 : 0;
    s = await S.open(r, o); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
    await s.setAsideTail('aa11bb22cc33', id, cut); const B = Array.from({ length: 41 - cut }, (_, i) => line('B', cut + i)); await s.append(id, 0, cut, B); await s.close();
    for (const f of await walk(root + '/snapV')) { await fsp.mkdir(nodePath.dirname(`${V}/${f}`), { recursive: true }); await fsp.copyFile(`${root}/snapV/${f}`, `${V}/${f}`); }
    for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(`${r}/${n}`, { force: true });
    const cur = A.slice(0, cut).concat(B);
    let res = '';
    try {
      s = await S.open(r, o); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
      const h = await s.head(id); let wrongUnflagged = 0, firstBad = -1, thrown = 0;
      const from = Math.min(h.damagedFromLine ?? Infinity, h.rolledBack?.from ?? Infinity, h.lostTakeovers > 0 ? 0 : Infinity);
      for (let i = 0; i < h.lines; i++) { try { const g = await s.read(id, 0, i, i + 1); if (g !== 'evicted' && !(i < cur.length && Buffer.from(g[0]).equals(cur[i])) && i < from) { wrongUnflagged++; if (firstBad < 0) firstBad = i; } } catch { thrown++; } }
      res = `head=${h.lines} damaged=${h.damagedFromLine} rolledBack=${JSON.stringify(h.rolledBack)} lost=${h.lostTakeovers} QUIET-WRONG=${wrongUnflagged}${firstBad >= 0 ? '@' + firstBad : ''} readThrows=${thrown}`;
      await s.close();
    } catch (e: any) { res = `THROWS ${e.code ?? e.constructor.name}`; }
    out(`${src} chunk=${chunk} ${tail}: ${res}`);
    await fsp.rm(root, { recursive: true, force: true });
  }
}, 600000);
