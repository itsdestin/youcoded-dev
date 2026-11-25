// P4: crash at EVERY disk operation of forkVersion (3 tear modes x kill/power x several settle seeds), reopen, check the child is absent or complete, retry, check the parent is byte-identical.
import { test } from 'vitest';
import { env, reg, vid, deriveForkId, StoreError, Crash, out } from './lib';
const typedErr = (x: any) => x instanceof StoreError;
test('p4 fork crash at every operation', async () => {
  const res: Record<string, number> = {}; const bad: string[] = [];
  const bump = (k: string) => { res[k] = (res[k] ?? 0) + 1; };
  for (const scen of ['clean-multichunk', 'with-park', 'single-chunk']) for (const f of [0, 1, 17, 40]) {
    const chunk = scen === 'single-chunk' ? 1 << 20 : 700;
    // dry run: how many operations does the fork take?
    const dry = await env(5, chunk); let s0 = await dry.open(); const pid = vid(1); await reg(s0, pid);
    const ls = dry.lines('a', 40, 40); await s0.append(pid, 0, 0, ls); if (scen === 'with-park') await s0.append(pid, 0, 45, dry.lines('p', 2));
    await s0.close(); dry.vfs.settle('kill'); s0 = await dry.open(); const cid0 = deriveForkId(pid, f, (await s0.hashAt(pid, 0, f))!, 't');
    const n0 = dry.vfs.ops_n; await s0.forkVersion(pid, f, cid0); const total = dry.vfs.ops_n - n0; await s0.close(); await dry.rm();
    for (let k = 1; k <= total + 1; k++) for (const tear of ['none', 'prefix', 'garbage'] as const) for (const cm of ['kill', 'power'] as const) for (const sd of [1, 2]) {
      const e = await env(k * 13 + sd, chunk); let s = await e.open(); await reg(s, pid);
      await s.append(pid, 0, 0, ls); if (scen === 'with-park') await s.append(pid, 0, 45, e.lines('p', 2));
      await s.close(); e.vfs.settle('kill'); s = await e.open();
      const cid = deriveForkId(pid, f, (await s.hashAt(pid, 0, f))!, 't'); const ck = cid.toString('hex');
      const pd = `${e.root}/versions/${pid.toString('hex')}/`;
      const pre = new Map<string, Buffer>(); for (const p of e.vfs.files()) if (p.startsWith(pd) && /(index\.bin|body-[0-9a-f]+\.bin)$/.test(p)) pre.set(p, e.vfs.get(p)!);
      e.vfs.arm(k, tear); let crashed = false;
      try { await s.forkVersion(pid, f, cid); } catch (x: any) { if (x instanceof Crash || e.vfs.dead) crashed = true; else { bad.push(`fork threw ${x?.code ?? x}`); } }
      e.vfs.disarm(); if (crashed) await e.crash(cm); else await s.close().catch(() => 0);
      const tag = `${scen} f=${f}`;
      s = await e.open();
      // child: absent or complete
      let state = 'absent';
      try { const h = await s.head(cid); if (h.lines !== f) bad.push(`${tag} k=${k} ${tear} ${cm}: child has ${h.lines} lines, want ${f}`); else { state = 'complete'; for (let i = 0; i < f; i++) { const g: any = await s.read(cid, 0, i, i + 1); if (!g[0].equals(ls[i])) bad.push(`${tag} k=${k}: child line ${i} wrong`); } if (h.damagedFromLine !== null) bad.push(`${tag} k=${k}: child flagged`); } }
      catch (x: any) { if (!typedErr(x)) bad.push(`${tag} k=${k} ${tear} ${cm}: untyped ${x?.message}`); else if (x.code !== 'unknown-version') bad.push(`${tag} k=${k} ${tear} ${cm}: child head threw ${x.code} ${x.message.slice(0, 60)}`); }
      // retry
      let r: any; try { r = await s.forkVersion(pid, f, cid); } catch (x: any) { r = null; bad.push(`${tag} k=${k} ${tear} ${cm}: retry threw ${typedErr(x) ? x.code + ' ' + x.message.slice(0, 80) : 'UNTYPED ' + x}`); }
      if (r) { if (r.lines !== f) bad.push(`${tag}: retry lines`); if (state === 'complete' && r.created) bad.push(`${tag} k=${k}: complete child but retry created`); }
      try { const h = await s.head(cid); if (h.lines !== f) bad.push(`${tag} k=${k}: after retry child has ${h.lines}`); for (let i = 0; i < f; i++) { const g: any = await s.read(cid, 0, i, i + 1); if (!g[0].equals(ls[i])) { bad.push(`${tag} k=${k}: after retry child line ${i} wrong`); break; } } } catch (x: any) { bad.push(`${tag} k=${k}: child unreadable after retry ${x?.code}`); }
      // the child must accept an append and stay a prefix-consistent version
      try { const more = e.lines('c', 3); const a = await s.append(cid, 0, f, more); if (a !== 'ok') bad.push(`${tag} k=${k}: child append ${a}`); } catch (x: any) { bad.push(`${tag} k=${k}: child append threw ${x?.code ?? x}`); }
      // parent: index and bodies byte-identical, parent still serves everything
      for (const [p, b] of pre) { const now = e.vfs.get(p); if (!now || !now.equals(b)) bad.push(`${tag} k=${k} ${tear} ${cm}: PARENT CHANGED ${p.split('/').pop()}`); }
      const ph = await s.head(pid); if (ph.lines !== 40 || ph.damagedFromLine !== null) bad.push(`${tag} k=${k}: parent head ${ph.lines} flag=${ph.damagedFromLine}`);
      bump(`${state}${crashed ? '/crashed' : '/done'}`);
      await s.close().catch(() => 0); await e.rm();
    }
  }
  out('p4', { res, nbad: bad.length, bad: [...new Set(bad)].slice(0, 15) });
}, 3600000);
