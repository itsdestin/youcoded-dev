// H4: an unsigned 'nak not-a-prefix' from any roster device marks the WRITER's own version diverged (status), with no signed evidence
import { afterEach, describe, expect, it } from 'vitest';
import { repWorld, wireId, lineSet, type World } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
import { GROUP_LIVE, KIND_NAK, nakBodyOf } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/wire';
let w: World | null = null;
afterEach(async () => { await w?.stopAll(); w?.cleanup(); w = null; });
describe('H4', () => {
  it('a forged nak flips the writer status to diverged', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000 }); const world = w; const V = wireId('h4');
    await world.create('A', V); await world.append('A', V, lineSet(5)); await world.settle();
    const before = (await world.devs.A.rep.status(V)).state;
    world.devs.B.rep.stop();
    world.devs.B.link.sendLive({ group: GROUP_LIVE, kind: KIND_NAK, body: nakBodyOf({ version: V, at: 5, why: 'not-a-prefix', hashAtYourCount: Buffer.alloc(32, 9) }) });
    await world.elapse(3_000, 1_000, true);
    const s = await world.devs.A.rep.status(V); console.log('H4 before', before, 'after forged nak:', s.state, s.reason);
    console.log('H4 append:', (await world.append('A', V, lineSet(1, 'z'))).result);
  });
});
