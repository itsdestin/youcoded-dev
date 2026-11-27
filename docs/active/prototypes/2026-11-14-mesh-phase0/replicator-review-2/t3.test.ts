import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkWorld, wid, mkline, log, type World } from './world';
const lines = (n: number, tag = 's', from = 0): Buffer[] => Array.from({ length: n }, (_, i) => mkline(tag, from + i));
const st = async (w: World, n: string, v: Buffer) => { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}/${s.lines}`; };
const snap = (w: World, n: string, ks: string[], to: string) => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); for (const k of ks) if (fs.existsSync(path.join(w.dirs[n], k))) fs.cpSync(path.join(w.dirs[n], k), path.join(to, k), { recursive: true }); };
const restore = (w: World, n: string, ks: string[], from: string) => { for (const k of ks) { fs.rmSync(path.join(w.dirs[n], k), { recursive: true, force: true }); if (fs.existsSync(path.join(from, k))) fs.cpSync(path.join(from, k), path.join(w.dirs[n], k), { recursive: true }); } const lp = path.join(w.dirs[n], 'store', 'LOCK'); if (fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), pid: 2147483646, start: 'dead' })); };
describe('b2', () => {
  for (const rollB of [false, true]) it(`writer forks (whole-userData restore on A); B replicator folder rolled back=${rollB}`, async () => {
    const w = await mkWorld(['A', 'B', 'C'], { discoveryMs: 600_000 }); const V = wid('b2' + rollB);
    await w.create('A', V, 'cb');
    await w.settle(); const bk = path.join(w.base, 'bk'); const bkB = path.join(w.base, 'bkB'); snap(w, 'A', ['store', 'replicator'], bk); snap(w, 'B', ['replicator'], bkB);
    await w.devs.A.rep.appendLocal(V, lines(6, 'old')); await w.settle();
    const bbefore = await w.current('B', V); const bh0 = await w.devs.B.store.head(bbefore!);
    await w.stopDev('A', true); await w.stopDev('B', true);
    restore(w, 'A', ['store', 'replicator'], bk); if (rollB) restore(w, 'B', ['replicator'], bkB);
    const A2 = w.devs.C.carrier; A2.passFilter = () => 'drop';
    await w.startDev('B'); await w.startDev('A'); // B up with old store lines (6) ; A rolled back to 0, intro known
    w.devs.B.carrier.passFilter = () => 'drop';
    const r = await w.devs.A.rep.appendLocal(V, lines(7, 'FORK')).then((x) => `ACCEPTED ${x.lines}`, (e) => String(e));
    w.devs.B.carrier.passFilter = null; w.devs.C.carrier.passFilter = null;
    await w.elapse(180_000);
    const out: string[] = [];
    for (const n of ['A', 'B', 'C']) { const l = await w.current(n, V); const h = await w.devs[n].store.head(l!); const first = ((await w.devs[n].store.read(l!, 0, 0, 1)) as Buffer[])[0].toString().match(/(old|FORK) \d/)?.[0]; out.push(`${n}: ${await st(w, n, V)} holds ${h.lines} first=${first} incarn=${l!.toString('hex').slice(0, 4)}`); }
    log(`b2 rollB=${rollB} A append: ${r} | B had ${bh0.lines} | `, out);
    await w.stopAll(); w.cleanup();
  }, 600_000);
});
