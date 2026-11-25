// P5: ONE chunk file of a sibling (fork child / parent / other chat) put into a version folder (same name = replace, new name = an extra chunk that shadows part of the real ones).
// Then: flagged? served wrong? and does ONE full correct resend heal it (all reads ok)?
import { test } from 'vitest';
import { env, reg, vid, deriveForkId, out } from './lib';
test('p5 single foreign chunk', async () => {
  const res: Record<string, number> = {}; const ex: Record<string, string> = {};
  for (let seed = 1; seed <= 300; seed++) {
    const e = await env(seed, [500, 700, 1500][seed % 3]); let s = await e.open(); const P = vid(1); await reg(s, P);
    const nP = 20 + (seed % 30); const Pl = e.lines('p', nP, 10 + (seed % 7) * 11);
    await s.append(P, 0, 0, Pl);
    const f = Math.floor(nP * ((seed % 5) / 5)); const C = deriveForkId(P, f, (await s.hashAt(P, 0, f))!, 't');
    if (f > 0) await s.forkVersion(P, f, C); else await reg(s, C);
    const nC = 15 + (seed % 25); const Cl = Pl.slice(0, f).concat(e.lines('c', nC, 10 + (seed % 5) * 17)); await s.append(C, 0, f, Cl.slice(f));
    await s.close(); e.vfs.settle('kill');
    const dir = (id: Buffer) => `${e.root}/versions/${id.toString('hex')}/`;
    const bodies = (id: Buffer) => e.vfs.files().filter((p) => p.startsWith(dir(id)) && /body-/.test(p));
    for (const dir2 of ['C->P', 'P->C']) {
      const [src, dst, srcL, dstL] = dir2 === 'C->P' ? [C, P, Cl, Pl] : [P, C, Pl, Cl];
      for (const sb of bodies(src)) {
        const e2 = e.vfs; const nm = sb.split('/').pop()!; const target = dir(dst) + nm; const had = e2.get(target);
        const keep = new Map<string, Buffer>(); for (const p of e2.files()) if (p.startsWith(dir(dst))) keep.set(p, e2.get(p)!);
        e2.put(target, e2.get(sb)!);
        let st = await e.open(); let r = '';
        try {
          const h = await st.head(dst); let wrong = 0, thr = 0;
          for (let i = h.evictedLines; i < h.lines; i++) { try { const g: any = await st.read(dst, 0, i, i + 1); if (!g[0].equals(dstL[i])) wrong++; } catch { thr++; } }
          r = (wrong ? 'WRONG-SERVED ' : '') + (thr ? 'unreadable ' : 'all-ok ') + (h.lines < dstL.length ? 'short ' : '') + (h.damagedFromLine !== null ? 'flagged ' : 'unflagged ');
          // heal
          const first = h.damagedFromLine ?? 0; for (let a = Math.min(first, h.lines); a < dstL.length; a += 25) await st.append(dst, 0, a, dstL.slice(a, a + 25));
          let thr2 = 0, wrong2 = 0; const h2 = await st.head(dst); for (let i = 0; i < dstL.length; i++) { try { const g: any = await st.read(dst, 0, i, i + 1); if (!g[0].equals(dstL[i])) wrong2++; } catch { thr2++; } }
          r += `| heal:${h2.lines === dstL.length ? 'len-ok' : 'len-' + h2.lines} ${thr2 ? 'STILL-UNREADABLE' : 'readable'} ${wrong2 ? 'WRONG' : ''}${had ? ' (replace)' : ' (extra file)'}`;
        } catch (x: any) { r = 'ERR ' + x.code; }
        res[`${dir2} ${r}`] = (res[`${dir2} ${r}`] ?? 0) + 1; if (/STILL|WRONG/.test(r)) ex[`${dir2} ${r}`] = `seed=${seed} f=${f} file=${nm}`;
        await st.close().catch(() => 0);
        for (const p of e2.files()) if (p.startsWith(dir(dst)) && !keep.has(p)) e2.put(p, null); for (const [p, b] of keep) e2.put(p, b);
        // also drop quarantine/aside effects: stop at first quarantine (not expected)
      }
    }
    await e.rm();
  }
  out('p5', { res, ex });
}, 3600000);
