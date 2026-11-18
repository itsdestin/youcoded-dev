import { test } from 'vitest';
import * as fsp from 'node:fs/promises'; import * as nodePath from 'node:path';
import { createHash } from 'node:crypto';
import { ChatStore } from '../src/main/mesh/store/store';
import { VFS } from './vfs';
const seed0 = (chat: string) => createHash('sha256').update(Buffer.from(chat)).update(Buffer.alloc(4)).digest();
const refHash = (chat: string, lines: Buffer[], n: number) => { let h = seed0(chat); for (let i = 0; i < n; i++) h = createHash('sha256').update(h).update(lines[i]).digest(); return h.toString('hex'); };
test('restore then power loss', async () => {
  const res: Record<string, number> = {}; const ex: string[] = [];
  for (const variant of ['plain', 'older-checkpoint'] as const) for (let k = 0; k < 400; k++) {
    let a = k * 7919 + 13; const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    const tmp = await fsp.mkdtemp(nodePath.join(process.env.TMPDIR!, 'rs2-')); const root = nodePath.join(tmp, 's'); await fsp.mkdir(root);
    const vfs = new VFS(rnd); { let p = ''; for (const s of root.split('/').filter(Boolean)) { p += '/' + s; vfs.base.set(p, 'D'); vfs.vol.set(p, 'D'); } }
    const id = Buffer.from([1, 2, 3]); const chat = 'c';
    const lines = Array.from({ length: 30 }, (_, i) => Buffer.from(JSON.stringify({ type: 'user', uuid: 'u' + i, message: { role: 'user', content: 'x'.repeat(150 + i) } }) + '\n'));
    const o = () => ({ fs: vfs, chunkBytes: 700, proofVerifier: () => true });
    const ev = async (s: ChatStore, through: number) => { const hash = refHash(chat, lines, through); await s.evictBody(id, { kind: 'holders-confirmed', version: id.toString('hex'), through, hash, acks: [1, 2].map((q) => ({ holder: 'h' + q, version: id.toString('hex'), lines: through, hash, signature: 's' })) }); };
    let s = await ChatStore.open(root, o()); await s.registerVersion(id, { chatId: chat, runtime: 'claude-code' }); await s.append(id, 0, 0, lines.slice(0, 20));
    await ev(s, 6); const ckf = [...vfs.files()].find((f) => f.endsWith('checkpoint.bin'))!; const oldCk = vfs.get(ckf)!;
    await s.append(id, 0, 20, lines.slice(20)); await ev(s, 14); await s.close(); await fsp.rm(nodePath.join(root, 'LOCK'), { force: true });
    if (variant === 'older-checkpoint') vfs.put(ckf, oldCk);
    s = await ChatStore.open(root, o()); await s.registerVersion(id, { chatId: chat, runtime: 'claude-code' });
    let restored = true; try { await s.restoreBody(id, lines); } catch (e: any) { restored = false; res[variant + ' restoreBody threw ' + e.code] = (res[variant + ' restoreBody threw ' + e.code] ?? 0) + 1; }
    if (restored) {
      await fsp.rm(nodePath.join(root, 'LOCK'), { force: true });
      vfs.settle('power'); // power loss right after an acknowledged restore + clean close
      s = await ChatStore.open(root, o()); await s.registerVersion(id, { chatId: chat, runtime: 'claude-code' });
      const h = await s.head(id); let bad = 0, evd = 0; for (let i = 0; i < 30; i++) { try { const g = await s.read(id, 0, i, i + 1); if (g === 'evicted') evd++; else if (!g[0].equals(lines[i])) bad++; } catch { bad++; } }
      const key = `${variant} restored-then-power: bad=${bad > 0} evicted=${evd > 0} dmg=${h.damagedFromLine !== null}`; res[key] = (res[key] ?? 0) + 1; if ((bad || evd) && ex.length < 3) ex.push(`${variant} k=${k} bad=${bad} evicted=${evd} dmg=${h.damagedFromLine} headEv=${h.evictedLines}`);
    }
    await s.close().catch(() => 0); await fsp.rm(tmp, { recursive: true, force: true });
  }
  await fsp.writeFile(process.env.TMPDIR + '/restore2.out', JSON.stringify(res, null, 1) + '\n' + ex.join('\n'));
}, 900000);
