import { describe, it, expect } from 'vitest';
import { mkWorld, mkline } from './world3';
const ALL = ['store', 'replicator', 'witness'];
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
async function status(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
async function until(w: any, f: () => Promise<boolean>, ms = 120_000) { for (let t = 0; t < ms; t += 5000) { if (await f()) return true; await w.elapse(5000, 5000); } return false; }

describe('a: restore all three from backup', () => {
  for (const variant of ['C-empty-answers-first', 'both-peers-offline-20s']) it(variant, async () => {
    const w: any = await mkWorld(['A', 'B', 'C']);
    await w.stopDev('C', false);
    const V = await w.createRoot('A', 'chat-1', 'n1');
    await w.devs.A.rep.appendLocal(V, L('old', 0, 5)); await w.elapse(20000);
    w.snap('A', ALL, 'bk');
    await w.devs.A.rep.appendLocal(V, L('old', 5, 10)); await w.elapse(20000);
    const bh = (await w.heads?.('B', V)); 
    console.log(variant, 'B before', await status(w, 'B', V));
    await w.stopDev('B', false);
    await w.stopDev('A', false);
    w.restore('A', ALL, 'bk');
    await w.startDev('A');
    if (variant === 'C-empty-answers-first') await w.startDev('C');
    await w.elapse(25000);
    let res = ''; try { const r = await w.devs.A.rep.appendLocal(V, L('NEW', 5, 6)); res = JSON.stringify(r); } catch (e) { res = 'threw ' + String(e); }
    console.log(variant, 'A append ->', res, 'status A', await status(w, 'A', V));
    await w.startDev('B'); if (variant !== 'C-empty-answers-first') await w.startDev('C');
    await w.elapse(120000);
    for (const n of ['A', 'B', 'C']) console.log(variant, n, await status(w, n, V));
    await w.stopAll(); w.cleanup();
  }, 600000);
});
