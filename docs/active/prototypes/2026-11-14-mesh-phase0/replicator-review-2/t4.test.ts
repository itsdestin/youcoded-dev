import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkWorld, wid, mkline, log, incId, type World } from './world';
const lines = (n: number, tag = 's', from = 0): Buffer[] => Array.from({ length: n }, (_, i) => mkline(tag, from + i));
const st = async (w: World, n: string, v: Buffer) => { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}/${s.lines}`; };
describe('e-ack-while-refilling', () => {
  it('B has rotted bytes (refilling) and receives the writer push: does A list B as holding the full head?', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 600_000, stallMs: 600_000 }); const V = wid('e1');
    await w.create('A', V, 'ce'); await w.devs.A.rep.appendLocal(V, lines(40, 'base')); await w.settle();
    // rot B's body file, then ask B's replicator to scrub (the store reports damage)
    const root = path.join(w.dirs.B, 'store', 'versions', incId(V, 0).toString('hex')); const f = fs.readdirSync(root).find((x) => /^body-.*\.bin$/.test(x))!; const b = fs.readFileSync(path.join(root, f)); b[Math.floor(b.length / 2)] ^= 0xff; fs.writeFileSync(path.join(root, f), b);
    // B is cut off from A's heads: only ONE frame from B may pass after the push (the ack comes first), the rest are lost
    let allow = 0; w.devs.B.carrier.passFilter = () => (allow-- > 0 ? 'deliver' : 'drop');
    w.devs.A.carrier.passFilter = () => 'deliver';
    const lB = await w.current('B', V); await w.devs.B.rep.reportCorrupt(V).catch(() => undefined); // B finds its damage (heads frames dropped)
    const hb = await w.devs.B.store.head(lB!);
    log('e1 B after scrub: lines', hb.lines, 'damagedFrom', hb.damagedFromLine, 'status', await st(w, 'B', V), '| A lists B ack lines:', w.devs.A.rep.peerAcks(V).map((a) => a.lines));
    allow = 1; await w.devs.A.rep.appendLocal(V, lines(5, 'push', 40)); await w.settle();
    const hb2 = await w.devs.B.store.head(lB!);
    log('e1 after writer push: B head', hb2.lines, 'B damagedFrom', hb2.damagedFromLine, 'B status', await st(w, 'B', V), '| A lists B acks:', w.devs.A.rep.peerAcks(V).map((a) => a.lines), '| A peerView of B', w.devs.A.rep.peerView(V), 'A status', await st(w, 'A', V));
    const rd = await w.devs.B.store.read(lB!, 0, 0, 45).then((x) => (x === 'evicted' ? 'evicted' : 'readable'), (e) => 'READ THROWS ' + (e as { code?: string }).code);
    log('e1 can B actually read all 45 lines it was acked for?', rd);
    await w.stopAll(); w.cleanup();
  }, 600_000);
});
