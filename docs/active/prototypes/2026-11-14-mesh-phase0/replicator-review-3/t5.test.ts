import { it } from 'vitest';
import { mkWorld, mkline } from './world3';
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
it('late device via relay', async () => {
  const w: any = await mkWorld(['A', 'B', 'C']);
  await w.stopDev('C', false);
  const V = await w.createRoot('A', 'chat-1', 'n1');
  await w.devs.A.rep.appendLocal(V, L('x', 0, 10)); await w.elapse(20000);
  await w.startDev('C'); await w.elapse(200000, 20000);
  console.log('C late', await st(w, 'C', V), await st(w, 'B', V), JSON.stringify(w.devs.C.rep.counters()));
  await w.stopAll(); w.cleanup();
});
