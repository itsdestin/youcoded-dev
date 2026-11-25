// Crash at EVERY disk operation of an append call (which now ends with the per-call high-water write), plus of a park-drain, an evict and a restore; kill and power cut; 3 tear modes; several settle seeds.
// Plain crash, no fault: the reopened version must be clean (no flag, no rolledBack, no refused read, no error), head either before or after the call, and a resend must complete it.
import { test } from 'vitest';
import { env, reg, vid, out, Crash } from './lib';
const scen = ['append-new-chunk', 'append-same-chunk', 'append-after-first-ever', 'park-drain', 'evict', 'restore', 'two-appends'] as const;
test('crash windows', async () => {
  let cases = 0, bad = 0; const hist: Record<string, number> = {};
  for (const sc of scen) for (const mode of ['kill', 'power'] as const) for (const tear of ['none', 'prefix', 'garbage'] as const) for (const seed of [1, 2, 3, 4]) for (let k = 1; k <= 45; k++) {
    const chunk = sc === 'append-new-chunk' ? 240 : 100000;
    const e = await env(seed * 31 + k, chunk); let s = await e.open(); const id = vid(1); await reg(s, id);
    const L = e.lines('t', 60, 20);
    let startLines = sc === 'append-after-first-ever' ? 0 : 10; if (startLines) await s.append(id, 0, 0, L.slice(0, startLines));
    if (sc === 'park-drain') { await s.append(id, 0, 14, L.slice(14, 18)); }   // parked behind a gap
    if (sc === 'restore') { const hh = await s.hashAt(id, 0, 6); await s.evictBody(id, { kind: 'holders-confirmed', version: id.toString('hex'), through: 6, hash: hh!, acks: [{ holder: 'p', version: id.toString('hex'), lines: 6, hash: hh!, signature: 's' }] } as any); }
    await s.close(); e.vfs.settle('kill'); s = await e.open(); await s.head(id);
    const call = async () => {
      if (sc === 'park-drain') return s.append(id, 0, 10, L.slice(10, 14));
      if (sc === 'evict') { const hh = await s.hashAt(id, 0, 6); return s.evictBody(id, { kind: 'holders-confirmed', version: id.toString('hex'), through: 6, hash: hh!, acks: [{ holder: 'p', version: id.toString('hex'), lines: 6, hash: hh!, signature: 's' }] } as any); }
      if (sc === 'restore') return s.restoreBody(id, L.slice(0, 6));
      if (sc === 'two-appends') { await s.append(id, 0, startLines, L.slice(startLines, startLines + 3)); return s.append(id, 0, startLines + 3, L.slice(startLines + 3, startLines + 6)); }
      return s.append(id, 0, startLines, L.slice(startLines, startLines + 3));
    };
    e.vfs.arm(k, tear); let crashed = false;
    try { await call(); } catch (x: any) { if (x instanceof Crash || /r5-crash/.test(String(x?.message))) crashed = true; else { bad++; out('crashwin-BAD-untyped', { sc, mode, tear, seed, k, err: String(x?.message ?? x).slice(0, 120) }); } }
    e.vfs.disarm(); if (!crashed) { await e.rm(); hist[sc + ':nocrash'] = (hist[sc + ':nocrash'] ?? 0) + 1; if (k > 30) break; else continue; }
    await e.crash(mode); cases++;
    const fail = (why: string, d: any = {}) => { bad++; out('crashwin-BAD', { sc, mode, tear, seed, k, why, ...d }); };
    try {
      s = await e.open(); const h = await s.head(id);
      if (h.damagedFromLine !== null || h.rolledBack) fail('flag-after-plain-crash', { dmg: h.damagedFromLine, rb: h.rolledBack, n: h.lines });
      for (let i = h.evictedLines; i < h.lines; i++) { try { const g = (await s.read(id, 0, i, i + 1) as any)[0]; if (!g.equals(L[i])) fail('wrong-line', { i }); } catch (x: any) { fail('read-refused-after-plain-crash', { i, c: x.code }); break; } }
      const target = sc === 'park-drain' ? 18 : sc === 'two-appends' ? startLines + 6 : startLines + 3;
      if (sc === 'evict' || sc === 'restore') { /* state-only ops: just require a clean head and a working append */ }
      const res = await s.append(id, 0, Math.max(h.evictedLines, Math.min(h.lines, 8)), L.slice(Math.max(h.evictedLines, Math.min(h.lines, 8)), target + 4)).catch((x: any) => 'ERR:' + x.code);
      if (res !== 'ok') fail('resend-not-ok', { res, n: h.lines });
      const h2 = await s.head(id); if (h2.damagedFromLine !== null || h2.rolledBack || h2.lines < target + 4) fail('unclean-after-resend', { n: h2.lines, dmg: h2.damagedFromLine });
      for (let i = h2.evictedLines; i < h2.lines; i++) { try { const g = (await s.read(id, 0, i, i + 1) as any)[0]; if (!g.equals(L[i])) fail('wrong-line2', { i }); } catch (x: any) { fail('read-refused-after-resend', { i, c: x.code }); break; } }
      hist[sc + ':head' + h.lines] = (hist[sc + ':head' + h.lines] ?? 0) + 1;
      await s.close();
      // second reopen after a second plain crash must still be clean
      e.vfs.settle(mode); await e.dropLock(); s = await e.open(); const h3 = await s.head(id); if (h3.damagedFromLine !== null || h3.rolledBack) fail('flag-after-second-crash', {}); await s.close();
    } catch (x: any) { fail('threw', { code: x?.code, msg: String(x?.message).slice(0, 100) }); }
    await e.rm();
  }
  out('crashwin-summary', { cases, bad, hist });
}, 3600000);
