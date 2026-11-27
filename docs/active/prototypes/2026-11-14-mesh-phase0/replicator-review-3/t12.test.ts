import { it } from 'vitest';
import { mkWorld, mkline } from './world3';
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
const tryApp = async (w: any, n: string, v: Buffer, ls: Buffer[]) => { try { return JSON.stringify(await w.devs[n].rep.appendLocal(v, ls)).slice(0, 70); } catch (e) { return 'threw ' + String(e).replace('Error: ', ''); } };
for (const idleMin of [2, 9, 11, 30]) it(`ordinary: app restarted, everything in sync, user types after ${idleMin} idle minutes`, async () => {
  const w: any = await mkWorld(['A', 'B']);
  const V = await w.createRoot('A', 'chat-1', 'n1');
  await w.devs.A.rep.appendLocal(V, L('x', 0, 5)); await w.elapse(30000);
  await w.stopDev('A', false); await w.startDev('A');
  await w.elapse(idleMin * 60000, 30000);
  console.log(`idle ${idleMin} min: status`, await st(w, 'A', V), '| append ->', await tryApp(w, 'A', V, L('y', 5, 6)));
  await w.elapse(120000, 30000);
  console.log(`   2 min later: status`, await st(w, 'A', V), '| append ->', await tryApp(w, 'A', V, L('y', 6, 7)));
  await w.stopAll(); w.cleanup();
}, 600000);
