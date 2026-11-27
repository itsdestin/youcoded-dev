import { describe, it } from 'vitest';
import * as fs from 'node:fs'; import * as path from 'node:path';
import { mkWorld, mkline } from './world3';
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
const tryApp = async (w: any, n: string, v: Buffer, ls: Buffer[], exp?: any) => { try { return JSON.stringify(await w.devs[n].rep.appendLocal(v, ls, exp)); } catch (e) { return 'threw ' + String(e).replace('Error: ', ''); } };

describe('rot of own record (no checksum)', () => {
  for (const kind of ['lines-high-bit-own', 'hash-bit-own', 'hash-bit-witness', 'lines-bit-low-own']) it(kind, async () => {
    const w: any = await mkWorld(['A', 'B']);
    const V = await w.createRoot('A', 'chat-1', 'n1');
    await w.devs.A.rep.appendLocal(V, L('x', 0, 5)); await w.elapse(15000);
    await w.stopDev('A', false);
    const name = V.toString('hex'); const f = path.join(w.dirs.A, kind.endsWith('witness') ? 'witness' : 'replicator/own', name);
    const b = fs.readFileSync(f);
    if (kind.startsWith('lines-high')) b[3] ^= 0x01; else if (kind.startsWith('lines-bit-low')) b[7] ^= 0x04; else b[20] ^= 0x01;
    fs.writeFileSync(f, b);
    await w.startDev('A'); await w.elapse(60000);
    console.log(kind, 'append->', await tryApp(w, 'A', V, L('y', 5, 6)), '| statusA', await st(w, 'A', V), '| statusB', await st(w, 'B', V));
    await w.elapse(900000, 60000);
    console.log(kind, 'later append->', await tryApp(w, 'A', V, L('y', 5, 6)), '| statusA', await st(w, 'A', V));
    await w.stopAll(); w.cleanup();
  }, 600000);
});

describe('claim discount: honest B holds longer tail, cannot deliver for >10 min (lines frames lost)', () => {
  it('whole restore of A, B holds 10, B->A lines dropped', async () => {
    const w: any = await mkWorld(['A', 'B']);
    const ALL = ['store', 'replicator', 'witness'];
    const V = await w.createRoot('A', 'chat-1', 'n1');
    await w.devs.A.rep.appendLocal(V, L('old', 0, 5)); await w.elapse(15000);
    w.snap('A', ALL, 'bk');
    await w.devs.A.rep.appendLocal(V, L('old', 5, 10)); await w.elapse(15000);
    await w.stopDev('A', false); w.restore('A', ALL, 'bk'); await w.startDev('A'); w.t0 = w.clock.now();
    w.hub.holdFilter = (dev: string) => (dev === 'B' ? 'drop' : 'store');
    for (const sec of [30, 300, 560, 620, 900]) {
      await w.elapse(Math.max(0, sec * 1000 - (w.clock.now() - w.t0)), 30000);
      console.log('t+' + sec + 's append ->', await tryApp(w, 'A', V, L('NEW', 5, 6)), await st(w, 'A', V));
      if (!/threw/.test(await tryApp(w, 'A', V, []))) { }
    }
    w.hub.holdFilter = null; await w.elapse(300000, 30000);
    for (const n of ['A', 'B']) console.log('after heal', n, await st(w, n, V));
    await w.stopAll(); w.cleanup();
  }, 600000);
});
