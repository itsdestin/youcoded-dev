import { describe, it } from 'vitest';
import { mkWorld, wid, mkline, oracleChain, log, W, chatGroup, signWith, incId, type World } from './world';

const lines = (n: number, tag = 's', from = 0): Buffer[] => Array.from({ length: n }, (_, i) => mkline(tag, from + i));
const T = 900_000;
const st = async (w: World, n: string, v: Buffer) => { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}/${s.lines}/inc${s.incarnation}`; };

describe('targeted2', () => {
  it('T8 a single line between 16 MiB and 64 MiB: does it ever arrive?', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 30_000, stallMs: 10_000 }); const V = wid('t8');
    await w.create('A', V, 'c8'); await w.devs.A.rep.appendLocal(V, lines(2)); await w.settle();
    const big = Buffer.concat([Buffer.from('{"type":"user","message":{"content":"'), Buffer.alloc(17 * 1024 * 1024, 0x63), Buffer.from('"}}\n')]);
    const r = await w.devs.A.rep.appendLocal(V, [big]).then((x) => `ok ${x.lines}`, (e) => `REFUSED ${String(e).slice(0, 120)}`);
    log('T8 writer append of a 17 MiB line:', r);
    await w.elapse(300_000, 10_000);
    const bl = await w.current('B', V); const bh = await w.devs.B.store.head(bl!);
    log('T8 after 300 virtual s: B holds', bh.lines, 'of 3; B status', await st(w, 'B', V), 'A status', await st(w, 'A', V), 'A counters', JSON.stringify(w.devs.A.rep.counters()), 'B counters', JSON.stringify(w.devs.B.rep.counters()));
    await w.stopAll(); w.cleanup();
  }, T);

  it('T8b the same 17 MiB line, but the device was away and the relay forgot: the catch-up (want) path', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 30_000, stallMs: 10_000 }); const V = wid('t8b');
    await w.create('A', V, 'c8b'); await w.devs.A.rep.appendLocal(V, lines(2)); await w.settle();
    w.devs.B.carrier.online = false;
    const big = Buffer.concat([Buffer.from('{"type":"user","message":{"content":"'), Buffer.alloc(17 * 1024 * 1024, 0x63), Buffer.from('"}}\n')]);
    await w.devs.A.rep.appendLocal(V, [big]); await w.settle();
    w.hub.releaseThrough(chatGroup(w.setId, 'c8b'), 1_000_000);
    w.devs.B.carrier.online = true; w.devs.B.rep.hello();
    await w.elapse(400_000, 10_000);
    const bl = await w.current('B', V); const bh = await w.devs.B.store.head(bl!);
    log('T8b after 400 virtual s: B holds', bh.lines, 'of 3; B status', await st(w, 'B', V), 'A status', await st(w, 'A', V), 'A counters', JSON.stringify(w.devs.A.rep.counters()), 'B counters', JSON.stringify(w.devs.B.rep.counters()));
    await w.stopAll(); w.cleanup();
  }, T);

  it('T9 id collision: a hostile paired device announces a version whose id is the victim version\'s next incarnation id', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 600_000, stallMs: 600_000, withM: true }); const W1 = wid('t9'); const ls = lines(5);
    await w.create('A', W1, 'c9'); await w.devs.A.rep.appendLocal(W1, ls); await w.settle();
    const W2 = incId(W1, 1);
    const body = { version: W2, chatId: 'c9-M', runtime: 'claude-code' as const, parent: null, forkLine: null, forkHash: null, token: null, writer: w.ids.M.deviceId };
    w.M!.link.sendLive({ group: W.GROUP_LIVE, kind: W.KIND_INTRO, body: W.introBodyOf({ ...body, sig: signWith(w.ids.M, W.introMessage(body as never)) } as never) as never, to: w.ids.B.deviceId }); await w.settle();
    // M feeds B two lines of its own under W2 (signed by M, the named writer of W2)
    const ml = lines(2, 'M-OWN'); const hash = Buffer.from(oracleChain('c9-M', W2, ml, 2), 'hex');
    await w.M!.link.sendDurable({ group: chatGroup(w.setId, 'c9-M'), kind: W.KIND_LINES, line: true, to: w.ids.B.deviceId, body: W.linesBody({ version: W2, from: 0, lines: ml, head: { lines: 2, hash, sig: signWith(w.ids.M, W.headMessage(W2, 2, hash)) } }) }); await w.settle();
    // now B's copy of W1 is declared damaged by the store; A is unreachable so nothing can be recopied
    w.devs.A.carrier.passFilter = () => 'drop'; w.devs.B.carrier.passFilter = () => 'drop';
    const local = await w.current('B', W1); await w.devs.B.store.setAsideDamaged(local!);
    await w.devs.B.rep.reportCorrupt(W1).catch((e) => log('T9 reportCorrupt threw', String(e)));
    await w.settle();
    const lid = await w.devs.B.rep.localId(W1); const h = await w.devs.B.store.head(lid);
    const first = h.lines ? (await w.devs.B.store.read(lid, 0, 0, 1)) as Buffer[] : [];
    log('T9 B\'s current copy of W1 is folder incarnation-1 =', lid.equals(W2), '; it holds', h.lines, 'lines; line 0 is M\'s?', first.length ? first[0].equals(ml[0]) : null, '; B status of W1:', await st(w, 'B', W1), '; B status of W2:', await st(w, 'B', W2));
    await w.stopAll(); w.cleanup();
  }, T);
});
