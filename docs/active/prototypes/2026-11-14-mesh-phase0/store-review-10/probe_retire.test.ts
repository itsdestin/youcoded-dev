// Crash at every disk operation of setAsideDamaged (now writes retired/<vhex>.ret). After the crash: retired (typed damaged on head/append/register) or untouched and fully readable; a retry of setAsideDamaged finishes; then every witness subset deletion keeps the id retired; the id is never served.
import { test } from 'vitest';
import { env, reg, vid, out, Crash } from './lib';
test('retire crash windows + witness subsets', async () => {
  let cases = 0, bad = 0; const hist: Record<string, number> = {};
  for (const mode of ['kill', 'power'] as const) for (const tear of ['none', 'prefix', 'garbage'] as const) for (const seed of [1, 2, 3]) for (let k = 1; k <= 60; k++) {
    const e = await env(seed * 17 + k, 200); let s = await e.open(); const id = vid(1); await reg(s, id); const L = e.lines('t', 20, 20); await s.append(id, 0, 0, L); await s.close(); e.vfs.settle('kill'); s = await e.open(); await s.head(id);
    e.vfs.arm(k, tear); let crashed = false;
    try { await s.setAsideDamaged(id); } catch (x: any) { if (x instanceof Crash || /r5-crash/.test(String(x?.message))) crashed = true; else { bad++; out('retire-BAD-untyped', { k, err: String(x?.message).slice(0, 100) }); } }
    e.vfs.disarm(); if (!crashed) { await e.rm(); break; }
    await e.crash(mode); cases++;
    const fail = (why: string, d: any = {}) => { bad++; out('retire-BAD', { mode, tear, seed, k, why, ...d }); };
    try {
      s = await e.open(); let state = 'unknown';
      try { const h = await s.head(id); state = 'live'; for (let i = 0; i < h.lines; i++) { const g = (await s.read(id, 0, i, i + 1) as any)[0]; if (!g.equals(L[i])) fail('wrong'); } } catch (x: any) { state = 'retired:' + x.code; }
      hist[state] = (hist[state] ?? 0) + 1;
      if (state.startsWith('retired') && !/damaged/.test(state)) fail('retired-but-untyped', { state });
      // retry completes
      const r = await s.setAsideDamaged(id).catch((x: any) => 'ERR:' + x.code); if (typeof r !== 'object') fail('retry-failed', { r });
      for (const op of ['head', 'append', 'register']) { try { if (op === 'head') await s.head(id); else if (op === 'append') await s.append(id, 0, 0, [L[0]]); else await s.registerVersion(id, { chatId: 'probe:chat', runtime: 'claude-code', parent: null }); fail('retired-id-' + op + '-succeeded'); } catch (x: any) { if (x.code !== 'damaged') fail('retired-op-' + op + '-code', { code: x.code }); } }
      await s.close(); e.vfs.settle('kill');
      // delete witness subsets and reopen
      const hexid = id.toString('hex'); const files = e.vfs.files();
      const wit: Record<string, string[]> = { aside: files.filter((p) => p.includes(`/aside/${hexid}-`)), vdir: files.filter((p) => p.includes(`/versions/${hexid}/`)), ret: files.filter((p) => p.endsWith(`/retired/${hexid}.ret`)) };
      const names = Object.keys(wit).filter((n) => wit[n].length);
      if (names.length < 3) hist['witnesses-missing:' + names.join('+')] = (hist['witnesses-missing:' + names.join('+')] ?? 0) + 1;
      for (const sub of [['aside'], ['vdir'], ['ret'], ['aside', 'vdir'], ['aside', 'ret'], ['vdir', 'ret']]) {
        const saved = new Map<string, Buffer>(); for (const n of sub) for (const p of wit[n]) { saved.set(p, e.vfs.get(p)!); e.vfs.put(p, null); }
        s = await e.open();
        let served = false; try { await s.head(id); served = true; } catch {} let reg2 = false; try { await s.registerVersion(id, { chatId: 'probe:chat', runtime: 'claude-code', parent: null }); reg2 = true; } catch {}
        const expectRetired = !(sub.includes('aside') && sub.includes('vdir') && sub.includes('ret'));
        if (expectRetired && (served || reg2)) fail('un-retired-by-subset', { sub, served, reg2, have: names });
        await s.close(); e.vfs.settle('kill'); for (const [p, b] of saved) e.vfs.put(p, b);
        // if the id came back to life (registered), remove the new files for the next subset
        for (const p of e.vfs.files()) if (p.includes(`/versions/${hexid}/`) && !wit.vdir.includes(p) && !saved.has(p)) e.vfs.put(p, null);
      }
    } catch (x: any) { fail('threw', { code: x?.code, msg: String(x?.message).slice(0, 100) }); }
    await e.rm();
  }
  out('retire-summary', { cases, bad, hist });
}, 3600000);
