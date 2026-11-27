import { it } from 'vitest';
import { mkWorld, mkline, W } from './world3';
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
const tryApp = async (w: any, n: string, v: Buffer, ls: Buffer[]) => { try { return JSON.stringify(await w.devs[n].rep.appendLocal(v, ls)).slice(0, 60); } catch (e) { return 'threw ' + String(e).replace('Error: ', ''); } };
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
it('hostile M freezes the writer indefinitely by alternating claims', async () => {
  const w: any = await mkWorld(['A', 'B'], { withM: true });
  const V = await w.createRoot('A', 'chat-1', 'n1');
  await w.devs.A.rep.appendLocal(V, L('x', 0, 5)); await w.elapse(15000);
  const claim = (lines: number) => w.M.link.sendLive({ group: W.GROUP_LIVE, kind: W.KIND_HEADS, body: W.headsBodyOf({ page: 0, of: 1, ask: false, heads: [{ version: V, lines, hash: Buffer.alloc(32, 5), conversationHash: Buffer.alloc(32), stamp: 0, state: 'ok' }] }), to: w.ids.A.deviceId });
  claim(8); await w.elapse(1000, 500);
  let t = 0;
  for (const [min, act] of [[1, 'try'], [9, 'reset'], [11, 'try'], [20, 'reset'], [22, 'try'], [31, 'reset'], [33, 'try']] as const) {
    await w.elapse((min - t) * 60000, 20000); t = min;
    if (act === 'reset') { claim(0); await w.elapse(1000, 500); claim(8); await w.elapse(1000, 500); }
    else console.log(`t=${min}min append ->`, await tryApp(w, 'A', V, L('y', 5, 6)), await st(w, 'A', V));
  }
  await w.stopAll(); w.cleanup();
}, 300000);
