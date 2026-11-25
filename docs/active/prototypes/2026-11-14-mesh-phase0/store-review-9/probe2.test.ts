// P2: park at 1 then append 0..8 with a crash anywhere in the append; retry the same append. Expect 'ok'.
import { test } from 'vitest';
import { env, reg, vid, StoreError, out } from './lib';
test('p2 park then crashed append then retry', async () => {
  const res: Record<string, number> = {}; let first = '';
  for (let arm = 1; arm <= 40; arm++) for (const mode of ['none', 'prefix', 'garbage'] as const) for (const cm of ['kill', 'power'] as const) {
    const e = await env(arm * 7 + 1); let s = await e.open(); const id = vid(1); await reg(s, id);
    const pk = e.lines('p', 2); const ls = e.lines('a', 8);
    await s.append(id, 0, 1, pk);                 // parked (gap at line 0)
    e.vfs.arm(arm, mode); let crashed = false;
    try { await s.append(id, 0, 0, ls); } catch (x: any) { crashed = !!e.vfs.dead; if (!crashed) throw x; }
    e.vfs.disarm(); if (crashed) await e.crash(cm); else { await s.close(); }
    s = await e.open(); let r: string;
    try { r = await s.append(id, 0, 0, ls); } catch (x: any) { r = 'THROW ' + x.code; }
    const key = `${crashed ? 'crashed' : 'complete'}->retry=${r}`; res[key] = (res[key] ?? 0) + 1;
    if (r !== 'ok' && !first) first = `arm=${arm} mode=${mode} cm=${cm} r=${r}`;
    await s.close().catch(() => undefined); await e.rm();
  }
  out('p2', { res, first });
});
