// F5: an older checkpoint (that records an eviction a later restoreBody undid) put back. Does the store serve the present bodies, or read them as `evicted`?
import { test } from 'vitest';
import { env, reg, vid, out } from './lib';
test('f5', async () => {
  for (const chunkBytes of [200, 100000]) for (const put of ['ckpt', 'ckpt+index', 'ckpt+hwdel', 'ckpt+hwold', 'ckpt+chunkzero', 'ckpt+index+hwdel', 'ckpt+index+chunkflip', 'ckpt+hwdel+chunkflip']) for (const evictThrough of [4, 12]) {
    const e = await env(3, chunkBytes); let s = await e.open(); const id = vid(1); await reg(s, id); const L = e.lines('t', 40, 20); await s.append(id, 0, 0, L.slice(0, 30));
    const hx = id.toString('hex'); const hh = await s.hashAt(id, 0, evictThrough);
    await s.evictBody(id, { kind: 'holders-confirmed', version: hx, through: evictThrough, hash: hh!, acks: [{ holder: 'p', version: hx, lines: evictThrough, hash: hh!, signature: 's' }] } as any);
    await s.close(); e.vfs.settle('kill');
    const d = `${e.root}/versions/${hx}/`, hwp = `${e.root}/highwater/${hx}.hw`;
    const snap = new Map<string, Buffer>(); for (const p of e.vfs.files()) if (p.startsWith(d)) snap.set(p, e.vfs.get(p)!); const hwOld = e.vfs.get(hwp);
    s = await e.open(); await s.restoreBody(id, L.slice(0, evictThrough)); await s.append(id, 0, 30, L.slice(30, 36)); await s.close(); e.vfs.settle('kill');
    const rel = (n: string) => d + n;
    if (put.includes('ckpt')) e.vfs.put(rel('checkpoint.bin'), snap.get(rel('checkpoint.bin')) ?? null);
    if (put.includes('index')) e.vfs.put(rel('index.bin'), snap.get(rel('index.bin')) ?? null);
    if (put.includes('hwdel')) e.vfs.put(hwp, null); if (put.includes('hwold')) e.vfs.put(hwp, hwOld);
    if (put.includes('chunkzero') || put.includes('chunkflip')) { const bp = e.vfs.files().filter((p) => p.startsWith(d) && /body-/.test(p)).sort()[0]; const b = Buffer.from(e.vfs.get(bp)!); if (put.includes('chunkzero')) b.fill(0, 5, Math.min(b.length, 60)); else b[Math.min(b.length - 1, 150)] ^= 1; e.vfs.put(bp, b); }
    s = await e.open(); const r: any = { chunkBytes, put, evictThrough };
    try { const h = await s.head(id); r.head = { n: h.lines, ev: h.evictedLines, dmg: h.damagedFromLine, rb: h.rolledBack }; let ok = 0, evd = 0, ref = 0, wrong = 0; for (let i = 0; i < h.lines; i++) { try { const g = await s.read(id, 0, i, i + 1) as any; if (g === 'evicted') evd++; else if (g[0].equals(L[i])) ok++; else wrong++; } catch { ref++; } } r.reads = { ok, evicted: evd, refused: ref, wrong }; } catch (x: any) { r.head = 'threw ' + x.code; }
    out('f5', r); await s.close().catch(() => {}); await e.rm();
  }
}, 300000);
