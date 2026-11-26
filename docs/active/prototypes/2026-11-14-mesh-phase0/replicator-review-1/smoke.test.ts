import { it, expect } from 'vitest';
import { mkWorld, wid, mkline, oracleChain, log } from './world';
it('smoke', async () => {
  const w = await mkWorld(['A', 'B', 'C'], { discoveryMs: 20_000 });
  const V = wid(1);
  await w.create('A', V, 'chat-x');
  const lines = Array.from({ length: 5 }, (_, i) => mkline('s', i));
  await w.devs.A.rep.appendLocal(V, lines);
  await w.settle(); await w.elapse(30_000);
  for (const n of ['A', 'B', 'C']) {
    const l = await w.current(n, V); const h = await w.devs[n].store.head(l!);
    log(n, h.lines, h.hash === oracleChain('chat-x', V, lines, 5), (await w.devs[n].rep.status(V)).state, JSON.stringify(w.devs[n].rep.peerAcks(V).map(a=>a.lines)));
  }
  await w.stopAll(); w.cleanup();
}, 120000);
