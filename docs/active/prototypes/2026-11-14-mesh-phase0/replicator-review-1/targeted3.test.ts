import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkWorld, wid, mkline, oracleChain, log, W, chatGroup, signWith, incId, type World } from './world';

const lines = (n: number, tag = 's', from = 0): Buffer[] => Array.from({ length: n }, (_, i) => mkline(tag, from + i));
const T = 900_000;
const st = async (w: World, n: string, v: Buffer) => { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}/${s.lines}/inc${s.incarnation}`; };

describe('targeted3', () => {
  it('T10 the writer\'s WHOLE store folder is put back as it was 3 lines ago (the store cannot see this); peers hold 6. Does the writer fork its own history?', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 20_000, stallMs: 10_000 }); const V = wid('t10');
    await w.create('A', V, 'c10'); await w.devs.A.rep.appendLocal(V, lines(3)); await w.settle();
    await w.stopDev('A', false);
    const snap = path.join(w.base, 'A-store-snap'); fs.cpSync(path.join(w.dirs.A, 'store'), snap, { recursive: true });
    await w.startDev('A'); w.devs.A.carrier.online = true;
    await w.devs.A.rep.appendLocal(V, lines(3, 't', 3)); await w.settle();
    await w.stopDev('A', false);
    fs.rmSync(path.join(w.dirs.A, 'store'), { recursive: true, force: true }); fs.cpSync(snap, path.join(w.dirs.A, 'store'), { recursive: true });
    await w.startDev('A');
    const lh = await w.devs.A.store.head(V);
    log('T10 after restore: A holds', lh.lines, 'B holds 6; A status', await st(w, 'A', V));
    await w.elapse(60_000, 10_000);
    log('T10 A status after 60 s with B online:', await st(w, 'A', V));
    const r = await w.devs.A.rep.appendLocal(V, lines(2, 'FORK', 3)).then((x) => `ok ${x.lines}`, (e) => `refused ${String(e).slice(0, 100)}`);
    log('T10 A appendLocal while it knows peers hold more of its own chain:', r);
    await w.elapse(120_000, 10_000);
    const bl = await w.current('B', V); const bh = await w.devs.B.store.head(bl!); const al = await w.current('A', V); const ah = await w.devs.A.store.head(al!);
    log('T10 end: A', ah.lines, await st(w, 'A', V), '| B', bh.lines, await st(w, 'B', V), '| B counters', JSON.stringify(w.devs.B.rep.counters()));
    await w.stopAll(); w.cleanup();
  }, T);
});
