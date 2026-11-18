import { test } from 'vitest';
import * as fsp from 'node:fs/promises'; import * as nodePath from 'node:path';
import { ChatStore } from '../src/main/mesh/store/store';
const mk = (tag: string, n: number) => Array.from({ length: n }, (_, i) => Buffer.from(JSON.stringify({ type: 'user', uuid: tag + i, message: { role: 'user', content: tag + 'x'.repeat(40) + i } }) + '\n'));
test('sibling swaps', async () => {
  const out: string[] = [];
  const tmp = await fsp.mkdtemp(nodePath.join(process.env.TMPDIR!, 'sib-')); const root = nodePath.join(tmp, 's');
  const id = Buffer.from([9, 9, 9]); const opts = { chunkBytes: 100000, proofVerifier: () => true };
  let s = await ChatStore.open(root, opts); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
  const base = mk('base', 5), A = mk('AAAA', 3), B = mk('BBBB', 2), fill = mk('fill', 3);
  await s.append(id, 0, 0, base);
  const rA = await s.append(id, 0, 8, A); const rB = await s.append(id, 0, 12, B);
  out.push(`park results ${rA} ${rB}`);
  const plist = await s.parkedList(id); out.push('parked ' + JSON.stringify(plist)); await s.close();
  const vdir = nodePath.join(root, 'versions', id.toString('hex')); const pd = nodePath.join(vdir, 'parked');
  const names = (await fsp.readdir(pd)).sort(); out.push('files ' + names.join(','));
  const pa = nodePath.join(pd, names[0]), pb = nodePath.join(pd, names[1]); const ba = await fsp.readFile(pa), bb = await fsp.readFile(pb);
  if (process.env.SINGLE) await fsp.writeFile(pb, ba); else { await fsp.writeFile(pa, bb); await fsp.writeFile(pb, ba); }   // single fault class: sibling files swapped (each has a valid checksum)
  s = await ChatStore.open(root, opts); await s.registerVersion(id, { chatId: 'c', runtime: 'claude-code' });
  const r = await s.append(id, 0, 5, fill); if (process.env.SINGLE) { await s.append(id, 0, 11, mk('gap2', 1)); } const h = await s.head(id); out.push(`fill -> ${r}, head.lines=${h.lines} damaged=${h.damagedFromLine}`);
  const h2 = await s.head(id); out.push('head after gap2 ' + h2.lines); const got = await s.read(id, 0, 8, h2.lines) as Buffer[]; if (process.env.SINGLE) out.push('line12==B0 ' + got[4]?.equals(B[0]) + ' line12==A0 ' + got[4]?.equals(A[0]) + ' head ' + h2.lines); const want = [...A, ...B];
  out.push(`lines 8..${h.lines - 1} equal the ones the caller sent (A then B at 8 and 12)? line8==A0: ${got[0]?.equals(A[0])}, line8==B0: ${got[0]?.equals(B[0])}`);
  await s.close(); await fsp.rm(tmp, { recursive: true, force: true });
  await fsp.writeFile(process.env.TMPDIR + '/sib' + (process.env.SINGLE ? '1' : '2') + '.out', out.join('\n'));
});
