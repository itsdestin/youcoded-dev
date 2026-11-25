// Review-10: an id retired by crash-then-retry has only TWO witnesses (no retired/<vhex>.ret). Delete both -> does the id come back?
import { test } from 'vitest';
import { env, reg, vid, out } from './lib';
test('retire crash then retry then delete both witnesses', async () => {
  const id = vid(1);
  for (const k of [1, 3, 5, 6, 7]) for (const retryOpen of ['same-open', 'reopen']) {
    const e = await env(3, 200); let s = await e.open(); await reg(s, id); const L = e.lines('t', 20, 20); await s.append(id, 0, 0, L); await s.close(); e.vfs.settle('kill'); s = await e.open(); await s.head(id);
    e.vfs.arm(k, 'none'); try { await s.setAsideDamaged(id); } catch {} e.vfs.disarm(); await e.crash('kill');
    s = await e.open(); await s.setAsideDamaged(id).catch(() => {}); await s.close(); e.vfs.settle('kill');
    const hexid = id.toString('hex'); const files = e.vfs.files();
    const hasRet = files.some((p) => p.endsWith(`/retired/${hexid}.ret`));
    const rmTree = (pre: string) => { for (const m of [e.vfs.vol, e.vfs.base]) for (const key of [...m.keys()]) if (key === pre || key.startsWith(pre + '/')) m.delete(key); };
    for (const p of files) if (p.includes(`/aside/${hexid}-`) || p.includes(`/versions/${hexid}/`)) e.vfs.put(p, null);
    for (const key of [...e.vfs.vol.keys()]) { if (key.startsWith(`${e.root}/aside/${hexid}-`) && key.split('/').length === e.root.split('/').length + 2) rmTree(key); }
    rmTree(`${e.root}/versions/${hexid}`);
    s = await e.open(); let served = false, regd = false; try { await s.head(id); served = true; } catch {} try { await s.registerVersion(id, { chatId: 'probe:chat', runtime: 'claude-code', parent: null }); regd = true; } catch {}
    out('retire3', { k, hasRet, afterDeletingAsideAndVersionFolder: { headServed: served, registerAccepted: regd } });
    await s.close(); await e.rm();
  }
}, 120000);
