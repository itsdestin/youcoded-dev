// P7: a CONFLICTING park (other lines than the true history) + whole-folder rollback to a moment when the park was still in parked/ and the head sat right below it.
// Can the park replace lines that were acknowledged before the rollback?
import { test } from 'vitest';
import { env, reg, vid, out } from './lib';
test('p7 conflicting park after folder rollback', async () => {
  const e = await env(7, 100000); let s = await e.open(); const id = vid(1); await reg(s, id);
  const L = e.lines('true', 40, 20), Y = e.lines('alt', 3, 20);
  await s.append(id, 0, 0, L.slice(0, 10));
  await s.append(id, 0, 10 + 0, []);                    // no-op
  await s.append(id, 0, 12, Y);                          // park at 12 with OTHER lines (gap of 2)
  await s.close(); e.vfs.settle('kill');
  const d = `${e.root}/versions/${id.toString('hex')}/`;
  const snap = new Map<string, Buffer>(); for (const p of e.vfs.files()) if (p.startsWith(d)) snap.set(p, e.vfs.get(p)!);   // head 10, park(12) in parked/
  s = await e.open();
  await s.append(id, 0, 10, L.slice(10, 40));            // true lines 10..39 acknowledged; the park is now stale: moved to rejected/ (conflict)
  const h1 = await s.head(id); await s.close(); e.vfs.settle('kill');
  // whole folder back to the snapshot (what a restore of an old backup does); the high-water record (outside the folder) says 40
  for (const p of e.vfs.files()) if (p.startsWith(d)) e.vfs.put(p, null); for (const [p, b] of snap) e.vfs.put(p, b);
  s = await e.open(); const h2 = await s.head(id);
  // the replicator resends the true line 9..11 (an idempotent overlap that ends exactly at 10..12 so the head reaches the park)
  const r1 = await s.append(id, 0, 10, L.slice(10, 12));  // head becomes 12: the park drains?
  const h3 = await s.head(id); let got: any[] = []; for (let i = 0; i < h3.lines; i++) { try { got.push((await s.read(id, 0, i, i + 1) as any)[0]); } catch { got.push(null); } }
  const diff = got.map((g, i) => (g === null ? 'X' : g.equals(L[i]) ? '.' : 'DIFF')).join('');
  const r2 = await s.append(id, 0, 12, L.slice(12, 40)).catch((x: any) => x.code);
  const h4 = await s.head(id);
  out('p7', { h1: h1.lines, h2: { lines: h2.lines, rb: h2.rolledBack, dmg: h2.damagedFromLine }, r1, h3: { lines: h3.lines, rb: h3.rolledBack, dmg: h3.damagedFromLine }, diff, r2, h4: { lines: h4.lines, rb: h4.rolledBack, dmg: h4.damagedFromLine } });
  await s.close();
});
