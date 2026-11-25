// Minimal repro: folder AND high-water record put back together (whole backup restore = documented limit 4), with a stale CONFLICTING park in the old folder.
// Inventory header claims for limit 4: "(Fewer lines, never different lines.)"
import { test } from 'vitest';
import { env, reg, vid, out } from './lib';
for (const mode of ['folder only (record intact)', 'folder + record back together', 'folder + record deleted']) test('two-fault ' + mode, async () => {
  const e = await env(5, 100000); let s = await e.open(); const id = vid(1); await reg(s, id);
  const L = e.lines('true', 40, 20), Y = e.lines('alt', 2, 20);
  await s.append(id, 0, 0, L.slice(0, 2));
  await s.append(id, 0, 4, Y);                       // a sender with a DIFFERENT history parks lines 4..5 (head is 2)
  await s.close(); e.vfs.settle('kill');
  const d = `${e.root}/versions/${id.toString('hex')}/`, hwp = `${e.root}/highwater/${id.toString('hex')}.hw`;
  const snap = new Map<string, Buffer>(); for (const p of e.vfs.files()) if (p.startsWith(d)) snap.set(p, e.vfs.get(p)!); const hw = e.vfs.get(hwp);
  s = await e.open(); await s.append(id, 0, 2, L.slice(2, 30)); await s.close(); e.vfs.settle('kill');   // true lines 2..29 acknowledged; the park is rejected as a conflict
  for (const p of e.vfs.files()) if (p.startsWith(d)) e.vfs.put(p, null); for (const [p, b] of snap) e.vfs.put(p, b);
  if (mode === 'folder + record back together') e.vfs.put(hwp, hw); if (mode === 'folder + record deleted') e.vfs.put(hwp, null);
  s = await e.open(); const h = await s.head(id);
  const r = await s.append(id, 0, 2, L.slice(2, 4));           // head reaches 4: the stale park drains?
  const r2 = await s.append(id, 0, 4, L.slice(4, 30)).catch((x: any) => x.code);
  const h2 = await s.head(id); const served: string[] = [];
  for (let i = 3; i < 7; i++) { try { const g = (await s.read(id, 0, i, i + 1) as any)[0]; served.push(g.equals(L[i]) ? 'true' : 'DIFFERENT'); } catch (x: any) { served.push('refused:' + x.code); } }
  out('twofault', { mode, head0: { n: h.lines, rb: h.rolledBack, dmg: h.damagedFromLine }, r, r2, head1: { n: h2.lines, rb: h2.rolledBack }, served_3_to_6: served });
  await s.close(); await e.rm();
}, 120000);
