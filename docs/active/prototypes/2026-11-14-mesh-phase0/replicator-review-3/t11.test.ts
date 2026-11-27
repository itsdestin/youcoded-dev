import { it } from 'vitest';
import * as fs from 'node:fs'; import * as path from 'node:path';
import { mkWorld, mkline } from './world3';
import { deriveForkId } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store';
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
it('takeover child cannot be set up on a late device when the only holder lost its signed points; A is gone', async () => {
  const w: any = await mkWorld(['A', 'B', 'C']);
  await w.stopDev('C', false);
  const V = await w.createRoot('A', 'chat-1', 'n1');
  await w.devs.A.rep.appendLocal(V, L('p', 0, 10)); await w.elapse(20000);
  const loc = await w.current('B', V); const hash = (await w.devs.B.store.hashAt(loc, 0, 5)) as string;
  const token = `${w.ids.B.deviceId.toString('hex')}:t1`; const child = deriveForkId(V, 5, hash, token);
  await w.devs.B.rep.createVersion({ version: child, chatId: 'chat-1', runtime: 'claude-code', parent: V, forkLine: 5, forkHash: Buffer.from(hash, 'hex'), token });
  await w.devs.B.rep.appendLocal(child, L('c', 5, 9)); await w.elapse(20000);
  await w.stopDev('A', false); await w.stopDev('B', false);
  fs.rmSync(path.join(w.dirs.B, 'replicator', 'heads'), { recursive: true, force: true });   // B loses only its signed points file
  await w.startDev('B'); await w.startDev('C'); await w.elapse(900000, 30000);
  console.log('C parent:', await st(w, 'C', V), '| C child:', await st(w, 'C', child), '| B parent:', await st(w, 'B', V), '| B child:', await st(w, 'B', child));
  await w.stopAll(); w.cleanup();
}, 600000);
