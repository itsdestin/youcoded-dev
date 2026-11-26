import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkWorld, wid, mkline, log, incId } from './world';
const lines = (n: number): Buffer[] => Array.from({ length: n }, (_, i) => mkline('s', i));
describe('targeted5', () => {
  it('T14 the only online holder is a non-writer that lost its saved signed points (so it can only say unavailable): hammer?', async () => {
    const w = await mkWorld(['A', 'B', 'C'], { discoveryMs: 600_000, stallMs: 600_000 }); const V = wid('t14');
    await w.create('A', V, 'c14'); await w.devs.A.rep.appendLocal(V, lines(6)); await w.settle();
    await w.stopDev('B', false); fs.rmSync(path.join(w.dirs.B, 'store'), { recursive: true, force: true }); fs.rmSync(path.join(w.dirs.B, 'replicator', 'heads'), { recursive: true, force: true });
    await w.stopDev('C', false); fs.rmSync(path.join(w.dirs.C, 'replicator', 'heads'), { recursive: true, force: true });
    w.devs.A.carrier.online = false;
    await w.startDev('C'); w.devs.C.carrier.online = true;
    await w.startDev('B'); w.devs.B.carrier.online = true;
    const p0 = w.devs.C.carrier.passed + w.devs.B.carrier.passed;
    await new Promise((r) => setTimeout(r, 3000));
    const p1 = w.devs.C.carrier.passed + w.devs.B.carrier.passed;
    log('T14 in 3 real seconds with NO virtual time passing, live frames exchanged between B and C:', p1 - p0, 'C counters', JSON.stringify(w.devs.C.rep.counters()), 'B counters', JSON.stringify(w.devs.B.rep.counters()), 'B status', JSON.stringify(await w.devs.B.rep.status(V)));
    await w.stopAll(); w.cleanup();
  }, 600_000);
  it('T13 the only holder cannot serve (its copy is repairing): does the asker back off or hammer it?', async () => {
    const w = await mkWorld(['A', 'B', 'C'], { discoveryMs: 600_000, stallMs: 600_000 }); const V = wid('t13');
    await w.create('A', V, 'c13'); await w.devs.A.rep.appendLocal(V, lines(6)); await w.settle();
    // C is offline for the whole test; B is wiped (never got anything): take B down, clear its replicator+store, bring it back empty
    await w.stopDev('B', false);
    fs.rmSync(path.join(w.dirs.B, 'store'), { recursive: true, force: true });
    // A's only copy gets a rotted body: A reports damage and refuses to serve (sole copy; nobody else has it)
    await w.stopDev('A', false);
    const root = path.join(w.dirs.A, 'store', 'versions', V.toString('hex'));
    const f = fs.readdirSync(root).find((x) => /^body-.*\.bin$/.test(x))!; const buf = fs.readFileSync(path.join(root, f)); buf[Math.floor(buf.length / 3)] ^= 0xff; fs.writeFileSync(path.join(root, f), buf);
    w.devs.C.carrier.online = false;
    await w.startDev('A'); w.devs.A.carrier.online = true;
    await w.devs.A.rep.reportCorrupt(V).catch(() => undefined);
    await w.startDev('B'); w.devs.B.carrier.online = true;
    const t0 = Date.now(); const p0 = w.devs.A.carrier.passed + w.devs.B.carrier.passed;
    await new Promise((r) => setTimeout(r, 3000));
    const p1 = w.devs.A.carrier.passed + w.devs.B.carrier.passed;
    log('T13 in 3 real seconds with NO virtual time passing, live frames exchanged between A and B:', p1 - p0, 'A counters', JSON.stringify(w.devs.A.rep.counters()), 'B counters', JSON.stringify(w.devs.B.rep.counters()), 'A status', (await w.devs.A.rep.status(V)).state, 'B status', (await w.devs.B.rep.status(V)).state);
    await w.stopAll(); w.cleanup();
  }, 600_000);
});
