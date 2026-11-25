// READ-THREW-AFTER-RESEND (review 9): several foreign chunk files of a sibling put into a version. Does a resend of the true lines (from every plausible start) always heal and read clean?
import { test } from 'vitest';
import { env, reg, vid, out } from './lib';
test('rtar', async () => {
  let cases = 0, bad = 0;
  for (const nfiles of [1, 2, 3, 4, 99]) for (const startMode of ['0', 'dmg', 'head', 'dmg-1', 'chunked']) for (const seed of [1, 2, 3]) for (const swapMode of ['siblingChunks', 'siblingChunksAndIndex', 'siblingAll']) {
    const e = await env(seed, 350); let s = await e.open(); const P = vid(1), C = vid(2); await reg(s, P);
    const L = e.lines('P', 60, 25); await s.append(P, 0, 0, L);
    const FORK = 12 + seed * 5; await s.forkVersion(P, FORK, C);
    const M = e.lines('C', 60 - FORK, 25); await s.append(C, 0, FORK, M);
    await s.close(); e.vfs.settle('kill');
    const dp = `${e.root}/versions/${P.toString('hex')}/`, dc = `${e.root}/versions/${C.toString('hex')}/`;
    const bodies = e.vfs.files().filter((p) => p.startsWith(dc) && /body-/.test(p)).sort();
    const pick = bodies.slice(Math.max(0, bodies.length - (nfiles === 99 ? 99 : nfiles)));
    for (const p of pick) e.vfs.put(dp + p.slice(dc.length), e.vfs.get(p));
    if (swapMode !== 'siblingChunks') for (const f of ['index.bin', ...(swapMode === 'siblingAll' ? ['checkpoint.bin'] : [])]) e.vfs.put(dp + f, e.vfs.get(dc + f));
    cases++;
    let r: any = { nfiles, startMode, seed, swapMode };
    try {
      s = await e.open(); const h = await s.head(P).catch((x: any) => ({ err: x.code }));
      if (h.err) { r.head = h.err; r.outcome = 'loud-head:' + h.err; }
      else {
        r.h0 = { n: h.lines, dmg: h.damagedFromLine, rb: h.rolledBack };
        // resend true lines from chosen start to the end
        const from = startMode === '0' ? 0 : startMode === 'dmg' ? (h.damagedFromLine ?? h.lines) : startMode === 'head' ? h.lines : startMode === 'dmg-1' ? Math.max(0, (h.damagedFromLine ?? h.lines) - 1) : 0;
        const res: any[] = [];
        if (startMode === 'chunked') { for (let a = h.damagedFromLine ?? 0; a < 60; a += 7) res.push(await s.append(P, 0, a, L.slice(a, Math.min(60, a + 7))).catch((x: any) => x.code)); }
        else res.push(await s.append(P, 0, from, L.slice(from)).catch((x: any) => x.code));
        r.res = res;
        const h2 = await s.head(P).catch((x: any) => ({ err: x.code })); r.h1 = h2.err ?? { n: h2.lines, dmg: h2.damagedFromLine, rb: h2.rolledBack };
        let wrong = 0, thrown = 0; let first = -1;
        if (!h2.err) for (let i = 0; i < h2.lines; i++) { try { const g = (await s.read(P, 0, i, i + 1) as any)[0]; if (!g.equals(L[i])) wrong++; } catch { thrown++; if (first < 0) first = i; } }
        r.wrong = wrong; r.thrown = thrown; r.firstThrown = first;
        // second full resend from 0
        if (thrown || (h2.damagedFromLine ?? null) !== null) { r.res2 = await s.append(P, 0, 0, L).catch((x: any) => x.code); const h3 = await s.head(P).catch((x: any) => ({ err: x.code })); let t3 = 0; if (!h3.err) for (let i = 0; i < h3.lines; i++) { try { await s.read(P, 0, i, i + 1); } catch { t3++; } } r.after2 = h3.err ?? { n: h3.lines, dmg: h3.damagedFromLine, thrown: t3 }; }
      }
      await s.close().catch(() => {});
    } catch (x: any) { r.THROW = x.code ?? String(x).slice(0, 100); }
    if (r.wrong || r.THROW || (r.thrown && !(r.after2 && !r.after2.err && r.after2.thrown === 0 && r.after2.dmg === null))) { bad++; out('rtar-BAD', r); }
    else if (r.thrown || r.outcome) out('rtar-loud-then-ok', r);
    await e.rm();
  }
  out('rtar-summary', { cases, bad });
}, 900000);
