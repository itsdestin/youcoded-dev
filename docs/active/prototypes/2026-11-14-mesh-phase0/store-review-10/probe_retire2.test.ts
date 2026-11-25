import { test } from 'vitest';
import { env, reg, vid, out, Crash } from './lib';
test('retire files', async () => {
  const e = await env(3, 200); let s = await e.open(); const id = vid(1); await reg(s, id); const L = e.lines('t', 20, 20); await s.append(id, 0, 0, L); await s.close(); e.vfs.settle('kill');
  s = await e.open(); await s.head(id); await s.setAsideDamaged(id); await s.close(); e.vfs.settle('kill');
  out('retire2-clean', e.vfs.files().map((p) => p.slice(e.root.length)).filter((p) => /retired|aside|highwater/.test(p)));
  for (let k = 1; k < 40; k++) {
    const e2 = await env(3, 200); let s2 = await e2.open(); await reg(s2, id); await s2.append(id, 0, 0, L); await s2.close(); e2.vfs.settle('kill'); s2 = await e2.open(); await s2.head(id);
    e2.vfs.arm(k, 'none'); let cr = false; try { await s2.setAsideDamaged(id); } catch { cr = true; } e2.vfs.disarm(); if (!cr) break; await e2.crash('kill');
    s2 = await e2.open(); const r = await s2.setAsideDamaged(id).catch((x: any) => 'ERR' + x.code); await s2.close(); e2.vfs.settle('kill');
    out('retire2-k' + k, { r, files: e2.vfs.files().map((p) => p.slice(e2.root.length)).filter((p) => /retired\/|\/aside\/[^/]*\/COMPLETE|retired.json/.test(p)) });
  }
}, 120000);
