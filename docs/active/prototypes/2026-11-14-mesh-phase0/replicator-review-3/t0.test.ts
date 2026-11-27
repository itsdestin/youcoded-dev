import { it } from 'vitest';
import { mkWorld, mkline } from './world3';
it('dbg', async () => {
  const w: any = await mkWorld(['A', 'B', 'C'], { bind: process.env.BIND !== '0' });
  const V = await w.createRoot('A', 'chat-1', 'n1');
  await w.elapse(20000);
  console.log('B', JSON.stringify(w.devs.B.rep.counters()), w.devs.B.rep.versions().length, JSON.stringify(Object.fromEntries([...w.devs.B.link ? [] : []])));
  console.log(JSON.stringify(await w.devs.B.rep.status(V)));
  await w.stopAll(); w.cleanup();
});
