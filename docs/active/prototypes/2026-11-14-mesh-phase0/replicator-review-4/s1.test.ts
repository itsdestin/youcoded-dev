import * as fs from 'node:fs'; import * as nodePath from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repWorld, wireId, lineSet, type World } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
import { missing, allLines } from './oracle';
let w: World | null = null;
afterEach(async () => { await w?.stopAll(); w?.cleanup(); w = null; });
const down = async (world: World, n: string): Promise<void> => { await world.devs[n].rep.idle(); world.devs[n].rep.stop(); world.devs[n].link.stop(); await world.devs[n].store.close(); };
const KS = ['store', 'replicator', 'witness'];
const snap = (world: World, n: string, to: string): void => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); for (const k of KS) if (fs.existsSync(nodePath.join(world.dirs[n], k))) fs.cpSync(nodePath.join(world.dirs[n], k), nodePath.join(to, k), { recursive: true }); };
const restore = (world: World, n: string, from: string): void => {
  for (const k of KS) { fs.rmSync(nodePath.join(world.dirs[n], k), { recursive: true, force: true }); if (fs.existsSync(nodePath.join(from, k))) fs.cpSync(nodePath.join(from, k), nodePath.join(world.dirs[n], k), { recursive: true }); }
  const lp = nodePath.join(world.dirs[n], 'store', 'LOCK'); if (fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), pid: 2147483646, start: 'dead' }));
};
describe('S1 second rollback to the same backup after a self-fork', () => {
  it('no acknowledged line is lost', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000 }); const world = w; const V = wireId('s1');
    const acked: string[] = [];
    const say = async (n: string, ls: Buffer[]) => { const r = await world.append(n, V, ls); expect(r.result).toBe('saved'); acked.push(...ls.map(String)); };
    await world.create('A', V); await say('A', lineSet(5, 'old')); await world.settle();
    const bk = nodePath.join(world.dirs.A, '..', 'bk-s1'); snap(world, 'A', bk);
    await say('A', lineSet(5, 'mid', 5)); await world.settle();
    for (let round = 0; round < 2; round++) {
      await down(world, 'A'); restore(world, 'A', bk);
      world.devs.B.carrier.setOnline(false);
      await world.restart('A'); await world.elapse(8_000, 1_000, true);
      await say('A', lineSet(3 + round, 'R' + round, 5));
      world.devs.B.carrier.setOnline(true);
      await world.elapse(240_000, 10_000, true);
      const m = await missing(world, acked);
      console.log('ROUND', round, 'missing', m.length, 'selfForks', world.devs.A.rep.selfForks().length);
      for (const [k, ls] of await allLines(world)) console.log(k, ls.length);
      expect(m).toEqual([]);
    }
  }, 600_000);
});
