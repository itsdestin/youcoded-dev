// Review-10 probe7 and variants. Truth L[0..40). Conflicting park Y at 12..14. For each variant: what is served, and can the true history be completed?
import { test } from 'vitest';
import { env, reg, vid, out } from './lib';
type Sub = 'all' | 'index' | 'ckpt' | 'bodies' | 'parked' | 'noparked';
const variants: { name: string; sub: Sub; mid?: 'crash' | 'evict' | 'park-before'; park: 'conflict' | 'true' }[] = [];
for (const park of ['conflict', 'true'] as const) for (const sub of ['all', 'index', 'ckpt', 'bodies', 'parked', 'noparked'] as Sub[]) for (const mid of [undefined, 'crash', 'evict', 'park-before'] as const)
  variants.push({ name: `${park}/${sub}/${mid ?? '-'}`, sub, mid, park });
test('p7 variants', async () => {
  for (const v of variants) {
    const e = await env(7, v.sub === 'bodies' || v.sub === 'all' ? 300 : 100000); let s = await e.open(); const id = vid(1); await reg(s, id);
    const L = e.lines('true', 40, 20), Y = v.park === 'conflict' ? e.lines('alt', 3, 20) : L.slice(12, 15);
    await s.append(id, 0, 0, L.slice(0, 10)); await s.append(id, 0, 12, Y);
    await s.close(); e.vfs.settle('kill');
    const d = `${e.root}/versions/${id.toString('hex')}/`;
    const snap = new Map<string, Buffer>(); for (const p of e.vfs.files()) if (p.startsWith(d)) snap.set(p, e.vfs.get(p)!);
    s = await e.open(); await s.append(id, 0, 10, L.slice(10, 40)); await s.close(); e.vfs.settle('kill');
    const pick = (p: string) => { const f = p.slice(d.length); return v.sub === 'all' ? true : v.sub === 'index' ? f === 'index.bin' : v.sub === 'ckpt' ? f === 'checkpoint.bin' : v.sub === 'bodies' ? f.startsWith('body-') : v.sub === 'parked' ? f.startsWith('parked/') : !f.startsWith('parked/'); };
    for (const p of [...snap.keys()]) if (!pick(p)) snap.delete(p);
    // restore chosen files only: delete files that did not exist in snapshot only for the chosen kinds
    for (const p of e.vfs.files()) if (p.startsWith(d) && pick(p) && !snap.has(p)) e.vfs.put(p, null);
    for (const [p, b] of snap) e.vfs.put(p, b);
    const res: any = { v: v.name };
    try {
      s = await e.open();
      if (v.mid === 'crash') { await e.crash('kill'); s = await e.open(); }
      if (v.mid === 'park-before') { await s.append(id, 0, 12, Y).catch((x: any) => x.code); }
      if (v.mid === 'evict') { try { res.ev = await s.evictBody(id, 0, 4, {}).catch((x: any) => 'ERR ' + x.code); } catch (x: any) { res.ev = 'THROW ' + x.code; } }
      const h2 = await s.head(id).catch((x: any) => ({ err: x.code })); res.h2 = h2.err ?? { n: h2.lines, rb: h2.rolledBack, dmg: h2.damagedFromLine };
      res.r1 = await s.append(id, 0, 10, L.slice(10, 12)).catch((x: any) => x.code);
      const h3 = await s.head(id).catch((x: any) => ({ err: x.code })); 
      let got: string[] = []; if (!h3.err) for (let i = 0; i < h3.lines; i++) { try { const g = (await s.read(id, 0, i, i + 1) as any)[0]; got.push(g.equals(L[i]) ? '.' : 'DIFF'); } catch (x: any) { got.push(x.code === 'evicted' ? 'e' : 'X'); } }
      res.h3 = h3.err ?? h3.lines; res.got = got.join('');
      res.r2 = await s.append(id, 0, 12, L.slice(12, 40)).catch((x: any) => x.code);
      const h4 = await s.head(id).catch((x: any) => ({ err: x.code }));
      let got4: string[] = []; if (!h4.err) for (let i = 0; i < h4.lines; i++) { try { const g = (await s.read(id, 0, i, i + 1) as any)[0]; got4.push(g.equals(L[i]) ? '.' : 'DIFF'); } catch (x: any) { got4.push(x.code === 'evicted' ? 'e' : 'X'); } }
      res.h4 = h4.err ?? { n: h4.lines, rb: h4.rolledBack, dmg: h4.damagedFromLine }; res.got4 = got4.join('');
      // full resend of the truth from 0
      res.r3 = await s.append(id, 0, 0, L).catch((x: any) => x.code);
      const h5 = await s.head(id).catch((x: any) => ({ err: x.code })); res.h5 = h5.err ?? { n: h5.lines, dmg: h5.damagedFromLine, rb: h5.rolledBack };
      await s.close().catch(() => {});
    } catch (x: any) { res.THROW = x.code ?? String(x).slice(0, 80); }
    if (/DIFF/.test(res.got ?? '') || /DIFF/.test(res.got4 ?? '')) res.VIOLATION = 'DIFF';
    out('p7v', res); await e.rm();
  }
}, 600000);
