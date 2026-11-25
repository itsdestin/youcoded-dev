import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { VFS, Crash } from './vfs';
export const BASE = '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/docs/active/prototypes/2026-11-14-mesh-phase0/store-review-10';
export const { ChatStore, deriveForkId } = await import((process.env.R10_SRC ?? BASE + '/new') + '/store');
export const { StoreError } = await import((process.env.R10_SRC ?? BASE + '/new') + '/errors');
export { VFS, Crash };
export function prng(seed: number) { let a = (seed * 2654435761 + 12345) >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }
export async function env(seed = 1, chunkBytes = 700) {
  const tmp = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'r10p-')); const root = nodePath.join(tmp, 'store'); await fsp.mkdir(root);
  const r = prng(seed); const vfs = new VFS(r);
  { let p = ''; for (const seg of root.split('/').filter(Boolean)) { p += '/' + seg; vfs.base.set(p, 'D'); vfs.vol.set(p, 'D'); } }
  let clock = 1_700_000_000_000;
  const dropLock = async () => { for (const n of ['LOCK', 'LOCK.takeover']) await fsp.rm(nodePath.join(root, n), { force: true }); };
  const open = async (o: any = {}) => { for (let a = 0; a < 3; a++) { try { return await ChatStore.open(root, { fs: vfs as any, chunkBytes, scrubOnOpenBytes: 1 << 20, proofVerifier: () => true, now: () => (clock += 1000), ...o }); } catch (e: any) { if (/store-locked/.test(e.code)) { await dropLock(); continue; } throw e; } } throw new Error('open'); };
  let n = 0;
  const line = (tag: string, pad = 30) => Buffer.from(JSON.stringify({ type: n % 2 ? 'user' : 'assistant', uuid: `${tag}-${n++}`, message: { role: 'user', content: `${tag}#${n}#${'x'.repeat(pad)}` } }) + '\n');
  const lines = (tag: string, k: number, pad = 30) => Array.from({ length: k }, () => line(tag, pad));
  const crash = async (mode: 'power' | 'kill' = 'kill') => { vfs.disarm(); vfs.settle(mode); await dropLock(); };
  const rm = async () => fsp.rm(tmp, { recursive: true, force: true });
  return { tmp, root, vfs, open, line, lines, crash, rm, dropLock, r };
}
export const vid = (n: number) => Buffer.from([0xaa, n]);
export const CHAT = 'probe:chat';
export async function reg(s: any, id: Buffer, chat = CHAT) { await s.registerVersion(id, { chatId: chat, runtime: 'claude-code', parent: null }); }
export const out = (tag: string, x: unknown) => fs.appendFileSync(BASE + '/probes.log', tag + ' ' + (typeof x === 'string' ? x : JSON.stringify(x)) + '\n');
