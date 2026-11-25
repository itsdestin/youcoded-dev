// P3: older index+checkpoint put back with newer bodies (a "prefix pair"). Outcome per N/M?
import { test } from 'vitest';
import { env, reg, vid, out } from './lib';
test('p3 older idx+ck', async () => {
  const res: Record<string, number> = {}; const ex: Record<string, string> = {};
  for (const chunk of [700, 4000]) for (const M of [3, 10, 40]) for (const N of [M + 1, M + 5, M + 40, M + 300]) for (const evict of [0, 1]) {
    const e = await env(M * 31 + N, chunk); let s = await e.open(); const id = vid(1); await reg(s, id);
    const ls = e.lines('a', N, 20);
    await s.append(id, 0, 0, ls.slice(0, M));
    if (evict) { const t = Math.floor(M / 2); const h = await s.hashAt(id, 0, t); await s.evictBody(id, { kind: 'holders-confirmed', version: id.toString('hex'), through: t, hash: h, acks: [{ holder: 'p', version: id.toString('hex'), lines: t, hash: h, signature: 's' }] }); }
    await s.close(); e.vfs.settle('kill');
    const d = `${e.root}/versions/${id.toString('hex')}/`; const old = { ix: e.vfs.get(d + 'index.bin')!, ck: e.vfs.get(d + 'checkpoint.bin')! };
    s = await e.open();
    await s.append(id, 0, M, ls.slice(M, N)); await s.close(); e.vfs.settle('kill');
    e.vfs.put(d + 'index.bin', old.ix); e.vfs.put(d + 'checkpoint.bin', old.ck);
    s = await e.open(); let r: string;
    try {
      const h = await s.head(id); let bad = 0;
      for (let i = h.evictedLines; i < h.lines; i++) { const g: any = await s.read(id, 0, i, i + 1).catch(() => null); if (!g || !g[0].equals(ls[i])) bad++; }
      r = `head=${h.lines === M ? 'M' : h.lines === N ? 'N' : 'other'} flag=${h.damagedFromLine !== null} rb=${h.rolledBack !== null} bad=${bad > 0}`;
    } catch (x: any) { r = 'ERR ' + x.code + ' ' + String(x.message).slice(0, 60); }
    const k = `evict=${evict} ${r}`; res[k] = (res[k] ?? 0) + 1; ex[k] = `chunk=${chunk} M=${M} N=${N}`;
    await s.close().catch(() => 0); await e.rm();
  }
  out('p3', { res, ex });
});
