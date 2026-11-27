import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkWorld, wid, mkline, log, type World } from './world';
const lines = (n: number, tag = 's', from = 0): Buffer[] => Array.from({ length: n }, (_, i) => mkline(tag, from + i));
const T = 600_000;
const st = async (w: World, n: string, v: Buffer) => { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}/${s.lines}`; };
const snap = (w: World, n: string, what: 'store' | 'replicator' | 'both', to: string) => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); for (const k of what === 'both' ? ['store', 'replicator'] : [what]) if (fs.existsSync(path.join(w.dirs[n], k))) fs.cpSync(path.join(w.dirs[n], k), path.join(to, k), { recursive: true }); };
const restore = (w: World, n: string, what: 'store' | 'replicator' | 'both', from: string) => { for (const k of what === 'both' ? ['store', 'replicator'] : [what]) { fs.rmSync(path.join(w.dirs[n], k), { recursive: true, force: true }); if (fs.existsSync(path.join(from, k))) fs.cpSync(path.join(from, k), path.join(w.dirs[n], k), { recursive: true }); } const lp = path.join(w.dirs[n], 'store', 'LOCK'); if (fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), pid: 2147483646, start: 'dead' })); };

async function scenario(tag: string, what: 'store' | 'replicator' | 'both', mutateOwn?: (w: World) => void, immediate = true) {
  const w = await mkWorld(['A', 'B'], { discoveryMs: 600_000 }); const V = wid(tag); const bk = path.join(w.base, 'bk');
  await w.create('A', V, 'c-' + tag); await w.devs.A.rep.appendLocal(V, lines(5, 'old')); await w.settle();
  snap(w, 'A', 'both', bk);
  await w.devs.A.rep.appendLocal(V, lines(5, 'mid', 5)); await w.settle();      // B holds 10, signed by A
  await w.stopDev('A', true);
  w.devs.B.carrier.online = true;
  restore(w, 'A', what, bk); mutateOwn?.(w);
  w.devs.B.carrier.passFilter = () => 'drop';  // B unreachable until after the append (worst case: the append races the first hello)
  await w.startDev('A');
  const r = await w.devs.A.rep.appendLocal(V, lines(1, 'NEW', 5)).then((x) => `ACCEPTED lines=${x.lines}`, (e) => `refused ${String(e)}`);
  w.devs.B.carrier.passFilter = undefined as never;
  await w.elapse(120_000);
  const bl = await w.current('B', V); const bh = await w.devs.B.store.head(bl!); const al = await w.current('A', V); const ah = await w.devs.A.store.head(al!);
  log(`${tag} [${what}] appendLocal right after restore:`, r, '| A', await st(w, 'A', V), `holds ${ah.lines} | B`, await st(w, 'B', V), `holds ${bh.lines} | same chain: ${ah.hash === bh.hash}`);
  await w.stopAll(); w.cleanup();
}
describe('2a', () => {
  it('a1 store+replicator folder both rolled back, no peer reachable at append', async () => { await scenario('a1', 'both'); }, T);
  it('a2 only store rolled back', async () => { await scenario('a2', 'store'); }, T);
  it('a3 only replicator folder rolled back (older own record)', async () => { await scenario('a3', 'replicator'); }, T);
  it('a4 both rolled back and own record truncated by rot afterwards', async () => { await scenario('a4', 'both', (w) => { /* nothing */ }); }, T);
  it('a5 store rolled back, own record rotted to 39 bytes', async () => {
    await scenario('a5', 'store', (w) => { const d = path.join(w.dirs.A, 'replicator', 'own'); for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.writeFileSync(p, fs.readFileSync(p).subarray(0, 39)); } });
  }, T);
});
