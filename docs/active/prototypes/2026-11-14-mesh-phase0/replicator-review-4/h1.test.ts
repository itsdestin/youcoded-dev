// H1: a roster device that is NOT the writer freezes the writer for good (claim + replay of a genuine batch), H2: freezes the gate after a restart with any frame but no heads.
import * as nodePath from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repWorld, wireId, lineSet, CHAT, type World } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
import { chatGroup } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/ctx';
import { GROUP_LIVE, headsBodyOf, KIND_HEADS, KIND_LINES, KIND_SUM, linesBody, sumBody } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/wire';
import { SignedHeads } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/signed-heads';
import { realFs } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store/fsio';
import { randomBytes } from 'node:crypto';
let w: World | null = null;
afterEach(async () => { await w?.stopAll(); w?.cleanup(); w = null; });
const tryAppend = async (world: World, V: Buffer, tag: string): Promise<string> => { try { return (await world.append('A', V, lineSet(1, tag))).result; } catch (e) { return 'REFUSED ' + (e as Error).message; } };
describe('H1/H2 hostile roster device freezes the writer', () => {
  it('H1 claim + replay of a genuine old batch every 9 minutes keeps the writer refusing for hours', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000 }); const world = w; const V = wireId('h1');
    await world.create('A', V); await world.append('A', V, lineSet(10)); await world.settle();
    world.devs.B.rep.stop(); // B no longer answers anything: from here B is driven by hand
    const pt = await new SignedHeads(realFs, nodePath.join(world.dirs.B, 'replicator')).newest(V); expect(pt).not.toBeNull();
    const lines = await world.readAll('B', V);
    const claim = async () => world.devs.B.link.sendLive({ group: GROUP_LIVE, kind: KIND_HEADS, body: headsBodyOf({ page: 0, of: 1, ask: false, heads: [{ version: V, lines: 500, hash: randomBytes(32), conversationHash: randomBytes(32), stamp: 1, state: 'ok' }] }) });
    const replay = async () => world.devs.B.link.sendDurable({ group: chatGroup(world.setId, CHAT), kind: KIND_LINES, line: true, body: linesBody({ version: V, from: 0, lines, head: { lines: 10, hash: (pt as any).hash, sig: (pt as any).sig } }) });
    await claim(); await world.elapse(3_000, 1_000, true); console.log('peerView', JSON.stringify(world.devs.A.rep.peerView(V)), JSON.stringify(world.devs.A.rep.counters()));
    console.log('t=3s', await tryAppend(world, V, 'a1'));
    const res: string[] = [];
    for (let i = 0; i < 8; i++) { await world.elapse(9 * 60_000, 30_000, true); await replay(); await world.elapse(2_000, 1_000, true); await claim(); await world.elapse(2_000, 1_000, true); res.push(await tryAppend(world, V, 'a' + i)); }
    console.log('attempts over 80 minutes with replay each 9 min:', res.join(' | '), 'counters', JSON.stringify(world.devs.A.rep.counters()));
    const st = await world.devs.A.rep.status(V); console.log('status', st.state, st.reason);
    await world.elapse(15 * 60_000, 30_000, true);
    console.log('after 15 more quiet minutes:', await tryAppend(world, V, 'q'));
  });
  it('H1-control the same claim WITHOUT the replay is discounted after 10 minutes (so the replay is what keeps the freeze)', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000 }); const world = w; const V = wireId('h1c');
    await world.create('A', V); await world.append('A', V, lineSet(10)); await world.settle();
    world.devs.B.rep.stop();
    const claim = async () => world.devs.B.link.sendLive({ group: GROUP_LIVE, kind: KIND_HEADS, body: headsBodyOf({ page: 0, of: 1, ask: false, heads: [{ version: V, lines: 500, hash: randomBytes(32), conversationHash: randomBytes(32), stamp: 1, state: 'ok' }] }) });
    const res: string[] = [];
    for (let i = 0; i < 8; i++) { await claim(); await world.elapse(9 * 60_000, 30_000, true); res.push(await tryAppend(world, V, 'c' + i)); }
    console.log('CONTROL attempts:', res.join(' | '));
  });
  it('H2 a device that sends a sum every minute but never heads keeps the restarted writer refusing', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000 }); const world = w; const V = wireId('h2');
    await world.create('A', V); await world.append('A', V, lineSet(3)); await world.settle();
    world.devs.B.rep.stop();
    await world.restart('A'); 
    const res: string[] = [];
    for (let i = 0; i < 20; i++) { await world.devs.B.link.sendLive({ group: GROUP_LIVE, kind: KIND_SUM, body: sumBody({ count: 0, digest: randomBytes(32), ask: false }) }); await world.settle(); await world.elapse(60_000, 1_000, true); res.push(await tryAppend(world, V, 'h' + i)); }
    console.log('H2 counters', JSON.stringify(world.devs.A.rep.counters()), 'peers', world.devs.A.rep.stateSizes()); console.log('H2 results over 20 min:', [...new Set(res)].join(' | '));
    const st = await world.devs.A.rep.status(V); console.log('H2 status', st.state, st.reason);
  });
});
