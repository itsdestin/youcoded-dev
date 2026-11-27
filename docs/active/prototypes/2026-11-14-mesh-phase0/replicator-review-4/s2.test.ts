// S2: the writer already holds V2 (heard from a peer, filled with the FIRST rollback's lines) when a SECOND rollback's conflict on V is found: the copy loop of selfForkNow appends onto whatever V2 holds.
import * as fs from 'node:fs'; import * as nodePath from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repWorld, wireId, lineSet, type World } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
import { missing, allLines } from './oracle';
import { decode } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/cbor';
import { parseIntroBody } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/wire';
let w: World | null = null;
afterEach(async () => { await w?.stopAll(); w?.cleanup(); w = null; });
const down = async (world: World, n: string): Promise<void> => { await world.devs[n].rep.idle(); world.devs[n].rep.stop(); world.devs[n].link.stop(); await world.devs[n].store.close(); };
const KS = ['store', 'replicator', 'witness'];
const snap = (world: World, n: string, to: string): void => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); for (const k of KS) if (fs.existsSync(nodePath.join(world.dirs[n], k))) fs.cpSync(nodePath.join(world.dirs[n], k), nodePath.join(to, k), { recursive: true }); };
const restore = (world: World, n: string, from: string): void => {
  for (const k of KS) { fs.rmSync(nodePath.join(world.dirs[n], k), { recursive: true, force: true }); if (fs.existsSync(nodePath.join(from, k))) fs.cpSync(nodePath.join(from, k), nodePath.join(world.dirs[n], k), { recursive: true }); }
  const lp = nodePath.join(world.dirs[n], 'store', 'LOCK'); if (fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), pid: 2147483646, start: 'dead' }));
};
describe('S2 second rollback while the writer already holds the first rollback\'s second version', () => {
  it('every acknowledged line stays findable and V2 is not a mixture of two histories', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000 }); const world = w; const V = wireId('s2');
    const acked: string[] = [];
    const say = async (ls: Buffer[]) => { const r = await world.append('A', V, ls); expect(r.result).toBe('saved'); acked.push(...ls.map(String)); };
    await world.create('A', V); await say(lineSet(5, 'old')); await world.settle();
    const bk = nodePath.join(world.dirs.A, '..', 'bk-s2'); snap(world, 'A', bk);
    await say(lineSet(5, 'mid', 5)); await world.settle();
    // first rollback: V2 = old(5) + NEW(3)
    await down(world, 'A'); restore(world, 'A', bk); world.devs.B.carrier.setOnline(false);
    await world.restart('A'); await world.elapse(8_000, 1_000, true);
    await say(lineSet(3, 'NEW', 5)); world.devs.B.carrier.setOnline(true); await world.elapse(240_000, 10_000, true);
    const v2 = world.devs.A.rep.selfForks()[0].movedTo; console.log('first self-fork done, V2 lines on A/B', (await world.readAll('A', v2)).length, (await world.readAll('B', v2)).length);
    // second rollback to the SAME backup; the writer hears about V2 (announcement + its lines) BEFORE it hears V's other history
    world.devs.B.carrier.setOnline(false);
    await down(world, 'A'); restore(world, 'A', bk);
    await world.restart('A'); await world.elapse(8_000, 1_000, true);
    await say(lineSet(4, 'THREE', 5));
    const raw = fs.readFileSync(nodePath.join(world.dirs.B, 'replicator', 'intro', v2.toString('hex')));
    await (world.devs.A.rep as any).onIntro(null, parseIntroBody(decode(raw)));
    await world.settle(); await world.elapse(5_000, 1_000, true);
    const l2 = await world.localOf('A', v2); expect(l2).not.toBeNull();
    const bl = await world.readAll('B', v2); const h = await world.devs.A.store.head(l2 as Buffer);
    await world.devs.A.store.append(l2 as Buffer, 0, h.lines, bl.slice(h.lines)); // = what pulling the three NEW lines from B does
    console.log('A V2 now', (await world.readAll('A', v2)).length, 'lines, V', (await world.readAll('A', V)).length);
    world.devs.B.carrier.setOnline(true);
    await world.elapse(300_000, 10_000, true);
    const m = await missing(world, acked);
    for (const [k, ls] of await allLines(world)) console.log(k, ls.length, ls.map((l) => (l.match(/(old|mid|NEW|THREE) (\d+)/) ?? ['', '?', '?']).slice(1).join('')).join(','));
    console.log('selfForks on A', world.devs.A.rep.selfForks().length, 'MISSING acknowledged lines:', m.length, m.map((x) => (x.match(/(THREE|NEW) (\d+)/) ?? [])[0]));
    expect(m).toEqual([]);
  });
});
