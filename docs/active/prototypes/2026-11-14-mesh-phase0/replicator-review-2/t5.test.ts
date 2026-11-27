import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkWorld, wid, mkline, log, type World } from './world';
const lines = (n: number, tag = 's', from = 0): Buffer[] => Array.from({ length: n }, (_, i) => mkline(tag, from + i));
const st = async (w: World, n: string, v: Buffer) => { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}/${s.lines}`; };
const snap = (w: World, n: string, ks: string[], to: string) => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); for (const k of ks) if (fs.existsSync(path.join(w.dirs[n], k))) fs.cpSync(path.join(w.dirs[n], k), path.join(to, k), { recursive: true }); };
const restore = (w: World, n: string, ks: string[], from: string) => { for (const k of ks) { fs.rmSync(path.join(w.dirs[n], k), { recursive: true, force: true }); if (fs.existsSync(path.join(from, k))) fs.cpSync(path.join(from, k), path.join(w.dirs[n], k), { recursive: true }); } const lp = path.join(w.dirs[n], 'store', 'LOCK'); if (fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), pid: 2147483646, start: 'dead' })); };
describe('strand', () => {
  it('writer B and C lose lines 15..22 (store restored); A holds them but its signed-points file is older', async () => {
    const w = await mkWorld(['A', 'B', 'C'], { discoveryMs: 30_000 }); const V = wid('strand');
    await w.create('B', V, 'cs'); await w.devs.B.rep.appendLocal(V, lines(15, 'a')); await w.settle(); await w.elapse(40_000);
    for (const n of ['A', 'B', 'C']) snap(w, n, ['store', 'replicator'], path.join(w.base, 'bk' + n));
    await w.devs.B.rep.appendLocal(V, lines(7, 'b', 15)); await w.settle(); await w.elapse(40_000);
    for (const n of ['A', 'B', 'C']) await w.stopDev(n, true);
    restore(w, 'A', ['replicator'], path.join(w.base, 'bkA'));             // A: lines 22 in store, signed points only up to 15
    restore(w, 'B', ['store'], path.join(w.base, 'bkB'));                  // B (writer): store back to 15, its own record says 22
    restore(w, 'C', ['store', 'replicator'], path.join(w.base, 'bkC'));    // C: back to 15
    for (const n of ['A', 'B', 'C']) await w.startDev(n);
    await w.elapse(400_000);
    const out: string[] = []; for (const n of ['A', 'B', 'C']) { const l = await w.current(n, V); const h = await w.devs[n].store.head(l!); out.push(`${n}: ${await st(w, n, V)} holds ${h.lines} ${JSON.stringify(Object.fromEntries(Object.entries(w.devs[n].rep.counters()).filter(([k]) => /stall|unavail|nak|held/.test(k))))}`); }
    log('strand after 400 virtual seconds:', out);
    await w.stopAll(); w.cleanup();
  }, 600_000);
});
