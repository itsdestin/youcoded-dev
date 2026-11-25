// P6: cost of ONE rotted byte in one body chunk: how many lines become unreadable, is the version quarantined, does a resend heal it?
import { test } from 'vitest';
import { env, reg, vid, out } from './lib';
test('p6 one flipped byte', async () => {
  const hist: Record<string, number> = {}; let quar = 0, n = 0, healed = 0, flagNull = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const e = await env(seed, [500, 700, 4000][seed % 3]); let s = await e.open(); const id = vid(1); await reg(s, id);
    const ls = e.lines('a', 60, 40); await s.append(id, 0, 0, ls); await s.close(); e.vfs.settle('kill');
    const bodies = e.vfs.files().filter((p) => /body-/.test(p)); const f = bodies[seed % bodies.length]; const b = Buffer.from(e.vfs.get(f)!); b[(seed * 7919) % b.length] ^= 0x04; e.vfs.put(f, b);
    s = await e.open(); n++;
    try {
      const h = await s.head(id); let bad = 0, wrong = 0; if (h.damagedFromLine === null) flagNull++;
      for (let i = 0; i < 60; i++) { try { const g: any = await s.read(id, 0, i, i + 1); if (!g[0].equals(ls[i])) wrong++; } catch { bad++; } }
      hist[`unreadable=${bad} wrong=${wrong}`] = (hist[`unreadable=${bad} wrong=${wrong}`] ?? 0) + 1;
      await s.append(id, 0, 0, ls); let ok = 0; for (let i = 0; i < 60; i++) { try { const g: any = await s.read(id, 0, i, i + 1); if (g[0].equals(ls[i])) ok++; } catch { /* */ } } if (ok === 60) healed++;
    } catch (x: any) { if (x.code === 'damaged') quar++; else hist['ERR ' + x.code] = (hist['ERR ' + x.code] ?? 0) + 1; }
    await s.close().catch(() => 0); await e.rm();
  }
  out('p6', { n, quar, healed, flagNullAtOpen: flagNull, hist });
});
