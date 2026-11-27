import { it } from 'vitest';
import { mkWorld, mkline } from './world3';
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
it('one transient store error leaves stuck forever (until restart or new lines)', async () => {
  const w: any = await mkWorld(['A', 'B']);
  const V = await w.createRoot('A', 'chat-1', 'n1');
  await w.devs.A.rep.appendLocal(V, L('x', 0, 5)); await w.elapse(15000);
  const store = w.devs.B.store; const orig = store.head.bind(store); let fail = true;
  store.head = async (...a: any[]) => { if (fail) { fail = false; throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return orig(...a); };
  await w.devs.A.rep.appendLocal(V, L('x', 5, 6)); await w.elapse(120000, 10000);   // B's reconsider hits the one-off error
  console.log('B 1 line later (error was once):', await st(w, 'B', V), 'A', await st(w, 'A', V));
  await w.elapse(1800000, 60000);
  console.log('B after 30 min of calm:', await st(w, 'B', V), JSON.stringify(w.devs.B.rep.counters()).slice(0, 200));
  await w.stopAll(); w.cleanup();
}, 300000);
