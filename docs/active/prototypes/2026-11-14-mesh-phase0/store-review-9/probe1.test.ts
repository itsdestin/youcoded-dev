// P1: garbage tear (random bytes, not a prefix) during the FIRST append of a version: does the store adopt the garbage as acknowledged lines?
import { test } from 'vitest';
import { env, reg, vid, StoreError, out } from './lib';
test('p1 garbage tear on body write', async () => {
  const res: Record<string, number> = {};
  for (let seed = 1; seed <= 400; seed++) {
    const e = await env(seed); let s = await e.open(); const id = vid(1); await reg(s, id);
    const ls = e.lines('a', 8);
    const mode = (['prefix', 'garbage'] as const)[seed % 2];
    e.vfs.arm(1 + (seed % 12), mode);
    let crashed = false;
    try { await s.append(id, 0, 0, ls); } catch (x: any) { crashed = !!(x?.op || e.vfs.dead); if (!crashed) throw x; }
    e.vfs.disarm(); await e.crash(seed % 3 === 0 ? 'power' : 'kill'); s = await e.open();
    let head: any; let r = 'ok';
    try { head = await s.head(id); } catch (x: any) { r = 'ERR ' + x.code; }
    if (head) {
      // every line the store holds must be a prefix of what was being appended
      let bad = 0; for (let i = 0; i < head.lines; i++) { try { const g = await s.read(id, 0, i, i + 1); if (!(g as any)[0].equals(ls[i])) bad++; } catch { bad++; } }
      r = bad ? `GARBAGE-ADOPTED(${mode}) lines=${head.lines} bad=${bad}` : `prefix-ok(${mode})`;
    }
    res[r.replace(/lines=\d+ bad=\d+/, '')] = (res[r.replace(/lines=\d+ bad=\d+/, '')] ?? 0) + 1;
    await s.close(); await e.rm();
  }
  out('p1', res);
});
