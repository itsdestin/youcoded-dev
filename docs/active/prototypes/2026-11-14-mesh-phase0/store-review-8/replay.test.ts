// Replay a dumped disk image (from fuzz7 R7_DUMP) on the real file system with the chosen source; print head/flags and which served lines are quietly wrong.
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
const BASE = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-8';
const SRCS: Record<string, any> = { old: await import(BASE + '/old/store'), new: await import(BASE + '/new/store') };
test('replay', async () => {
  const dir = process.env.R8_DIR!; const m = JSON.parse(fs.readFileSync(dir + '.model.json', 'utf8')); const cur: Buffer[] = m.cur.map((x: string) => Buffer.from(x, 'base64'));
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r8rp-')); await fsp.cp(dir, root + '/s', { recursive: true }); const r = root + '/s';
  for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(`${r}/${n}`, { force: true });
  const src = process.env.R8_SRC ?? 'new'; const id = Buffer.from(m.id, 'hex'); let res = '';
  try {
    const s = await SRCS[src].ChatStore.open(r, { chunkBytes: m.chunkBytes, scrubOnOpenBytes: 0, proofVerifier: () => true });
    await s.registerVersion(id, { chatId: m.chat, runtime: 'claude-code' });
    const h = await s.head(id); const from = Math.min(h.damagedFromLine ?? Infinity, h.rolledBack?.from ?? Infinity, (h.lostTakeovers ?? 0) > 0 ? 0 : Infinity);
    let wrong: number[] = [], thrown = 0; for (let i = 0; i < h.lines; i++) { try { const g = await s.read(id, 0, i, i + 1); if (g !== 'evicted' && !(i < cur.length && Buffer.from(g[0]).equals(cur[i])) && i < from) wrong.push(i); } catch { thrown++; } }
    res = `head=${h.lines} model=${cur.length} damaged=${h.damagedFromLine} rb=${JSON.stringify(h.rolledBack)} lost=${h.lostTakeovers} rej=${h.rejectedParks} QUIETWRONG=${wrong.length}${wrong.length ? '@' + wrong[0] + '..' + wrong[wrong.length - 1] : ''} throws=${thrown} fault=${m.fault}`;
    await s.close();
  } catch (e: any) { res = `THROWS ${e.code ?? e.constructor.name} ${String(e.message).slice(0, 80)}`; }
  fs.appendFileSync(BASE + '/replay.out', `${dir.split('/').pop()} ${src}: ${res}\n`);
  await fsp.rm(root, { recursive: true, force: true });
}, 600000);
