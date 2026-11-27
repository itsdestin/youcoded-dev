// S2: the writer already holds V2 (heard from a peer, filled with the FIRST rollback's lines) when a SECOND rollback's conflict on V is found: the copy loop of selfForkNow appends onto whatever V2 holds.
import * as fs from 'node:fs'; import * as nodePath from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repWorld, wireId, lineSet, type World } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
import { missing, allLines } from './oracle';
import { decode } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/cbor';
import { headMessage, KIND_LINES, linesBody } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/wire';
import { chatGroup } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/ctx';
import { chainStep } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store';
import { signWith } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/identity';
import { CHAT } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
let w: World | null = null;
afterEach(async () => { await w?.stopAll(); w?.cleanup(); w = null; });
const down = async (world: World, n: string): Promise<void> => { await world.devs[n].rep.idle(); world.devs[n].rep.stop(); world.devs[n].link.stop(); await world.devs[n].store.close(); };
const KS = ['store', 'replicator', 'witness'];
const snap = (world: World, n: string, to: string): void => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); for (const k of KS) if (fs.existsSync(nodePath.join(world.dirs[n], k))) fs.cpSync(nodePath.join(world.dirs[n], k), nodePath.join(to, k), { recursive: true }); };
const restore = (world: World, n: string, from: string): void => {
  for (const k of KS) { fs.rmSync(nodePath.join(world.dirs[n], k), { recursive: true, force: true }); if (fs.existsSync(nodePath.join(from, k))) fs.cpSync(nodePath.join(from, k), nodePath.join(world.dirs[n], k), { recursive: true }); }
  const lp = nodePath.join(world.dirs[n], 'store', 'LOCK'); if (fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), pid: 2147483646, start: 'dead' }));
};
describe('S3 a peer is told a second history that the writer later no longer has', () => {
  it('the peer does not stay frozen on a chat whose writer now agrees with the peer', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000 }); const world = w; const V = wireId('s3');
    const st = async (n: string) => { const s = await world.devs[n].rep.status(V); return s.state + (s.reason ? '(' + s.reason + ')' : ''); };
    await world.create('A', V); await world.append('A', V, lineSet(10, 'm')); await world.settle();
    // what A did in an earlier life (restored from an old backup, chatted before it heard B) and then lost again: A's genuine signature over three other lines at positions 5..7
    const other = lineSet(3, 'OTHER', 5);
    const base = Buffer.from((await world.devs.B.store.hashAt(await world.local('B', V), 0, 5)) as string, 'hex');
    const hash = other.reduce((h, l) => chainStep(h, l), base);
    await world.devs.A.link.sendDurable({ group: chatGroup(world.setId, CHAT), kind: KIND_LINES, line: true, body: linesBody({ version: V, from: 5, lines: other, head: { lines: 8, hash, sig: signWith(world.ids.A, headMessage(V, 8, hash)) } }) });
    await world.elapse(60_000, 10_000, true);
    console.log('B after the other history reached it:', await st('B'), 'A:', await st('A'));
    // A (whose copy never held the other history) just keeps chatting
    console.log('A chats:', (await world.append('A', V, lineSet(2, 'after', 10))).result);
    await world.elapse(900_000, 15_000, true);
    console.log('LATER A', await st('A'), (await world.readAll('A', V)).length, 'lines; B', await st('B'), (await world.readAll('B', V)).length, 'lines; B counters', JSON.stringify(world.devs.B.rep.counters()));
    expect((await world.readAll('B', V)).length).toBe(12);
  });
});
