import { it } from 'vitest';
import { mkWorld, mkline } from './world3';
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
it('writer says in-sync while a reachable device is stuck behind', async () => {
  const w: any = await mkWorld(['A', 'B']);
  const V = await w.createRoot('A', 'chat-1', 'n1');
  await w.devs.A.rep.appendLocal(V, L('x', 0, 5)); await w.elapse(15000);
  w.devs.B.ffs.opts.enospcFrom = w.devs.B.ffs.allocs + 1;   // B's disk is full from now on
  await w.devs.A.rep.appendLocal(V, L('x', 5, 8)); await w.elapse(300000, 15000);
  console.log('A:', await st(w, 'A', V), '| B:', await st(w, 'B', V), '(B holds 5, A holds 8)');
  await w.elapse(1500000, 60000);
  console.log('after 30 min: A:', await st(w, 'A', V), '| B:', await st(w, 'B', V));
  await w.stopAll(); w.cleanup();
}, 300000);
