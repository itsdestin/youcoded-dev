import { describe, it } from 'vitest';
import { mkWorld, mkline, W } from './world3';
const ALL = ['store', 'replicator', 'witness'];
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
const tryApp = async (w: any, n: string, v: Buffer, ls: Buffer[], exp?: any) => { try { return JSON.stringify(await w.devs[n].rep.appendLocal(v, ls, exp)); } catch (e) { return 'threw ' + String(e).replace('Error: ', ''); } };
describe('hostile paired M supplies the evidence', () => {
  for (const spoof of ['page0of1-empty', 'page1of2-empty', 'none']) it(spoof, async () => {
    const w: any = await mkWorld(['A', 'B'], { withM: true });
    const V = await w.createRoot('A', 'chat-1', 'n1');
    await w.devs.A.rep.appendLocal(V, L('old', 0, 5)); await w.elapse(15000);
    w.snap('A', ALL, 'bk');
    await w.devs.A.rep.appendLocal(V, L('old', 5, 10)); await w.elapse(15000);
    await w.stopDev('B', false); await w.stopDev('A', false); w.restore('A', ALL, 'bk'); await w.startDev('A');
    const send = (page: number, of: number) => w.M.link.sendLive({ group: W.GROUP_LIVE, kind: W.KIND_HEADS, body: W.headsBodyOf({ page, of, ask: false, heads: [] }), to: w.ids.A.deviceId });
    if (spoof === 'page0of1-empty') send(0, 1); if (spoof === 'page1of2-empty') send(1, 2);
    await w.elapse(2000, 1000);
    console.log(spoof, 'at +2s append ->', await tryApp(w, 'A', V, L('NEW', 5, 6)), await st(w, 'A', V));
    await w.startDev('B'); await w.elapse(120000, 10000);
    console.log(spoof, 'after B returns:', await st(w, 'A', V), await st(w, 'B', V));
    await w.stopAll(); w.cleanup();
  }, 300000);
});
