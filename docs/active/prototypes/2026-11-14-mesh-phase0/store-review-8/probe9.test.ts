// F3 follow-up: tails/ folder lost (one fault). Can the version ever take over again? After setAsideDamaged? After a recopy?
import { test } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
const BASE = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-8';
const S = (await import(BASE + '/new/store')).ChatStore;
const line = (t: string, i: number) => Buffer.from(JSON.stringify({ type: i % 2 ? 'assistant' : 'user', uuid: `${t}-${i}`, message: { role: 'user', content: `${t} ${i}` } }) + '\n');
const id = Buffer.from([0xa9, 1, 7, 9]);
const out = (s: string) => fs.appendFileSync(BASE + '/probe9.out', s + '\n');
const t = async (f: () => Promise<any>) => { try { return JSON.stringify(await f()); } catch (e: any) { return `THROWS ${e.code ?? e.constructor.name}`; } };
test('probe9', async () => {
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r8p9-')); const r = root + '/s'; await fsp.mkdir(r);
  let s = await S.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
  const A = Array.from({ length: 20 }, (_, i) => line('A', i)); await s.append(id, 0, 0, A);
  await s.setAsideTail('aa11bb22cc33', id, 10); await s.append(id, 0, 10, Array.from({ length: 6 }, (_, i) => line('B', 10 + i))); await s.close();
  const vd = (await fsp.readdir(r + '/versions'))[0]; await fsp.rm(`${r}/versions/${vd}/tails`, { recursive: true, force: true });   // ONE fault: tails/ gone
  s = await S.open(r, {}); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
  const h = await s.head(id); out(`after tails/ lost: head=${h.lines} lost=${h.lostTakeovers} damaged=${h.damagedFromLine}`);
  out('second takeover (new id) at 12: ' + await t(() => s.setAsideTail('bb22cc33dd44', id, 12)));
  out('read tail(first id): ' + await t(async () => (await s.tail('aa11bb22cc33', id))?.lines.length));
  out('setAsideDamaged: ' + await t(() => s.setAsideDamaged(id)));
  await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' }).catch(() => {});
  await s.append(id, 0, 0, A.slice(0, 12));
  const h2 = await s.head(id); out(`after recopy: head=${h2.lines} lost=${h2.lostTakeovers}`);
  out('takeover after quarantine+recopy at 6: ' + await t(() => s.setAsideTail('cc33dd44ee55', id, 6)));
  await s.close(); await fsp.rm(root, { recursive: true, force: true });
}, 600000);
