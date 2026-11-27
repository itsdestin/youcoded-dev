// Closure checks for earlier-review findings that a new guard claims to close (R3-1 idle after restart, R3-5 rotted own record, R3-7 retry with a stale expected head)
import * as fs from 'node:fs'; import * as nodePath from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repWorld, wireId, lineSet, type World } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
let w: World | null = null;
afterEach(async () => { await w?.stopAll(); w?.cleanup(); w = null; });
const tryA = async (world: World, V: Buffer, tag: string): Promise<string> => { try { return (await world.append('A', V, lineSet(1, tag))).result; } catch (e) { return 'REFUSED ' + (e as Error).message; } };
describe('closure', () => {
  it('R3-1: restart, idle 40 minutes with everyone online, then chat', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 60_000 }); const world = w; const V = wireId('c1');
    await world.create('A', V); await world.append('A', V, lineSet(3)); await world.settle();
    await world.restart('A'); await world.elapse(40 * 60_000, 30_000, true);
    expect(await tryA(world, V, 'x')).toBe('saved');
  });
  it('R3-5: one flipped bit in each of the writer\'s two records, separately and together', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000 }); const world = w; const V = wireId('c5');
    await world.create('A', V); await world.append('A', V, lineSet(3)); await world.settle();
    const files = (n: string) => ['replicator/own', 'witness'].map((d) => nodePath.join(world.dirs[n], d, V.toString('hex')));
    const flip = (f: string) => { const b = fs.readFileSync(f); b[3] ^= 0x10; fs.writeFileSync(f, b); };
    flip(files('A')[0]); await world.restart('A'); await world.elapse(20_000, 1_000, true); expect(await tryA(world, V, 'one')).toBe('saved');
    flip(files('A')[0]); flip(files('A')[1]); await world.restart('A'); await world.elapse(20_000, 1_000, true);
    const r = await tryA(world, V, 'both'); console.log('both records rotted ->', r, (await world.devs.A.rep.status(V)).state, (await world.devs.A.rep.status(V)).reason);
    expect(r).toBe('saved');
    fs.rmSync(files('A')[0]); fs.rmSync(files('A')[1]); await world.restart('A'); await world.elapse(20_000, 1_000, true); console.log('both records deleted ->', await tryA(world, V, 'gone'));
  });
  it('R3-7: a retry of lines that are already durable, and a retry on a moved head', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000 }); const world = w; const V = wireId('c7');
    await world.create('A', V); const h0 = await world.heads('A', V);
    const ls = lineSet(2, 'r'); const r1 = await world.devs.A.rep.appendLocal(V, ls, { lines: h0.lines, hash: h0.hash });
    const r2 = await world.devs.A.rep.appendLocal(V, ls, { lines: h0.lines, hash: h0.hash }); // the caller never heard the answer and retries
    expect(r1.result).toBe('saved'); expect(r2.result).toBe('already-saved'); expect((await world.readAll('A', V)).length).toBe(2);
    await world.devs.A.rep.appendLocal(V, lineSet(1, 'q'), { lines: 2, hash: (await world.heads('A', V)).hash });
    await expect(world.devs.A.rep.appendLocal(V, ls, { lines: h0.lines, hash: h0.hash })).rejects.toThrow(/writer-head-moved/);
  });
});
