// Claim 1b: a folder whose chain value contradicts the high-water record is retired at load. Also: no false trigger for a prefix-state, a fork, evict/restore.
import { test } from 'vitest';
import { env, reg, vid, out } from './lib';
test('contradiction', async () => {
  const id = vid(1);
  for (const [name, headB] of [['shorter-different (head 10, record 20)', 10], ['longer-different (head 25, record 20)', 25], ['equal-different (head 20, record 20)', 20]] as [string, number][]) {
    const A = await env(1, 300), B = await env(2, 300);
    let sA = await A.open(); await reg(sA, id); const LA = A.lines('A', 30, 20); await sA.append(id, 0, 0, LA.slice(0, 20)); await sA.close(); A.vfs.settle('kill');
    let sB = await B.open(); await reg(sB, id); const LB = B.lines('B', 30, 20); await sB.append(id, 0, 0, LB.slice(0, headB)); await sB.close(); B.vfs.settle('kill');
    const dA = `${A.root}/versions/${id.toString('hex')}/`, dB = `${B.root}/versions/${id.toString('hex')}/`;
    for (const p of A.vfs.files()) if (p.startsWith(dA)) A.vfs.put(p, null);
    for (const p of B.vfs.files()) if (p.startsWith(dB)) A.vfs.put(dA + p.slice(dB.length), B.vfs.get(p));
    sA = await A.open(); let r: any = { name };
    try { const h = await sA.head(id); r.head = { n: h.lines, rb: h.rolledBack, dmg: h.damagedFromLine }; try { const g = await sA.read(id, 0, 0, 1) as any; r.read0 = g[0].equals(LB[0]) ? 'B-line' : g[0].equals(LA[0]) ? 'A-line' : '?'; } catch (x: any) { r.read0 = 'refused:' + x.code; } } catch (x: any) { r.head = 'threw:' + x.code; }
    out('contra', r); await sA.close().catch(() => {}); await A.rm(); await B.rm();
  }
}, 120000);
