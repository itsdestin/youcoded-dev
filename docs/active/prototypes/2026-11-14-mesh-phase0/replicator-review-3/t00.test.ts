import { it } from 'vitest';
import { repWorld, wireId } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
it('dbg2', async () => {
  const w: any = await repWorld(['A', 'B', 'C']);
  const V = wireId('x'); await w.create('A', V);
  await w.settle();
  console.log(JSON.stringify(w.devs.B.rep.counters()), w.devs.B.rep.versions().length);
  await w.stopAll(); w.cleanup();
});
