// S2: the writer already holds V2 (heard from a peer, filled with the FIRST rollback's lines) when a SECOND rollback's conflict on V is found: the copy loop of selfForkNow appends onto whatever V2 holds.
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
describe('S4 a self-fork that runs longer than the 120 s step ceiling (here: 100 ms) lets the queue move on while it is still copying', () => {
  it('a line acknowledged saved while the self-fork is still running is not lost', async () => {
    w = await repWorld(['A', 'B'], { discoveryMs: 600_000, stepLimitMs: 100 }); const world = w; const V = wireId('s4');
    const acked: string[] = []; const say = async (ls: Buffer[]) => { const r = await world.append('A', V, ls); expect(r.result).toBe('saved'); acked.push(...ls.map(String)); };
    await world.create('A', V); await say(lineSet(5, 'old')); await world.settle();
    const bk = nodePath.join(world.dirs.A, '..', 'bk-s4'); snap(world, 'A', bk);
    await say(lineSet(2, 'mid', 5)); await world.settle();
    await down(world, 'A'); restore(world, 'A', bk); world.devs.B.carrier.setOnline(false);
    await world.restart('A'); await world.elapse(8_000, 1_000, true);
    await say(lineSet(5, 'NEW', 5));
    // the store of A gets slow (a big chat, a slow disk): every read takes 400 ms real time from now on
    const st = world.devs.A.store as any; const orig = st.read.bind(st); let slow = true; st.read = async (...a: any[]) => { if (slow) await new Promise((r) => setTimeout(r, 400)); return orig(...a); };
    world.devs.B.carrier.setOnline(true);
    const t0 = Date.now(); let late: string[] = [];
    // keep chatting while the self-fork is running
    let n = 0; let tries = 0;
    while (Date.now() - t0 < 25_000 && world.devs.A.rep.selfForks().length === 0) {
      await world.clock.advance(1_000); await new Promise((r) => setTimeout(r, 120));
      if ((world.devs.A.rep.counters()['writer-self-fork'] ?? 0) > 0 && tries < 6) { tries++; try { const ls = lineSet(1, 'LATE' + n++, 50); const r = await world.append('A', V, ls); if (r.result === 'saved') { late.push(...ls.map(String)); acked.push(...ls.map(String)); } console.log('append during self-fork:', r.result, JSON.stringify(world.devs.A.rep.counters())); } catch (e) { console.log('refused during self-fork', (e as Error).message); } }
    }
    slow = false;
    await world.elapse(300_000, 10_000, true);
    const m = await missing(world, acked);
    for (const [k, ls] of await allLines(world)) console.log(k, ls.length);
    console.log('selfForks', world.devs.A.rep.selfForks().length, 'late appends', late.length, 'MISSING', m.length, m.map((x) => (x.match(/(LATE\d+|NEW \d+)/) ?? [])[0]), JSON.stringify(world.devs.A.rep.counters()));
    expect(m).toEqual([]);
  });
});
