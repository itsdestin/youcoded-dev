import { it } from 'vitest';
import * as fs from 'node:fs'; import * as os from 'node:os'; import * as path from 'node:path';
import { SignedHeads } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/signed-heads';
import { realFs } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store/fsio';
it('SignedHeads.load race: a slow first load overwrites the cache after add() has put its point in', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv3-sh-'));
  let calls = 0;
  const slowFs: any = Object.create(realFs); Object.assign(slowFs, realFs);
  slowFs.readFile = async (p: string) => { const n = ++calls; const got = await realFs.readFile(p); if (n === 1) await new Promise((r) => setTimeout(r, 80)); return got; };
  const sh = new SignedHeads(slowFs, dir); const V = Buffer.alloc(32, 1);
  const first = sh.pointsAfter(V, 0);               // e.g. a status() or serve() call: starts a slow load
  const add = await sh.add(V, { lines: 5, hash: Buffer.alloc(32, 2), sig: Buffer.alloc(64, 3), spanBytes: 10 }); // the receive path: its own (fast) load, then writes the point
  await first;
  console.log('RESULT add=', add, 'file records=', fs.readFileSync(path.join(dir, 'heads', V.toString('hex') + '.sh')).length / 112, 'cache sees', (await sh.pointsAfter(V, 0)).length);
  fs.rmSync(dir, { recursive: true, force: true });
});
