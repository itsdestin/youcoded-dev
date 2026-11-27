import { describe, it } from 'vitest';
import { mkWorld, wid, mkline, log, W, signWith, type World } from './world';
const lines = (n: number, tag = 's', from = 0): Buffer[] => Array.from({ length: n }, (_, i) => mkline(tag, from + i));
const T = 600_000;
const st = async (w: World, n: string, v: Buffer) => { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}/${s.lines}`; };
const mLive = (w: World, kind: string, body: unknown, to?: string) => w.M!.link.sendLive({ group: W.GROUP_LIVE, kind, body: body as never, ...(to ? { to: w.ids[to].deviceId } : {}) });
describe('t2', () => {
  it('g: hung store call then late completion (appendLocal)', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 600_000, stepLimitMs: 400 }); const V = wid('g');
    await w.create('A', V, 'cg'); await w.devs.A.rep.appendLocal(V, lines(3, 'base')); await w.settle();
    const st0 = w.devs.A.store as unknown as { append: (...a: unknown[]) => Promise<unknown> }; const real = st0.append.bind(w.devs.A.store); let release: () => void = () => undefined; let hung = 0;
    st0.append = (...a: unknown[]) => { if (hung++ === 0) return new Promise((res) => { release = () => res(real(...a)); }); return real(...a); };
    const r1 = await w.devs.A.rep.appendLocal(V, lines(2, 'X', 3)).then(() => 'ok', (e) => String(e));
    const stA = await st(w, 'A', V);
    const r2 = await w.devs.A.rep.appendLocal(V, lines(2, 'Y', 3)).then((x) => `ok ${x.lines}`, (e) => String(e));
    release(); await new Promise((r) => setTimeout(r, 300)); await w.elapse(60_000);
    const l = await w.current('A', V); const h = await w.devs.A.store.head(l!); const rd = (await w.devs.A.store.read(l!, 0, 3, h.lines)) as Buffer[];
    log('g r1(hung)=', r1, '| status while stuck', stA, '| r2(Y same position)=', r2, '| A final lines', h.lines, 'lines 3..:', rd.map((b) => /(X|Y) \d/.exec(b.toString())?.[0]), '| A', await st(w, 'A', V), 'B', await st(w, 'B', V));
    await w.stopAll(); w.cleanup();
  }, T);
  it('h: liar heads claim blocks writer append; how long, which state', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 30_000, withM: true }); const V = wid('h');
    await w.create('A', V, 'ch'); await w.devs.A.rep.appendLocal(V, lines(3)); await w.settle();
    const claim = () => mLive(w, W.KIND_HEADS, W.headsBodyOf({ page: 0, of: 1, ask: false, heads: [{ version: V, lines: 50, hash: Buffer.alloc(32, 5), conversationHash: Buffer.alloc(32), stamp: 0, state: 'ok' }] }), 'A');
    claim(); await w.settle();
    const out: string[] = [];
    for (let m = 0; m < 14; m++) { if (m % 3 === 0 && m < 12) { claim(); await w.settle(); } const r = await w.devs.A.rep.appendLocal(V, lines(1, 'u', 3 + m)).then(() => 'ok', (e) => String(e).replace('Error: ', '')); out.push(`min${m}: ${r} / ${await st(w, 'A', V)}`); await w.elapse(60_000); }
    log('h refreshed-liar timeline:', out);
    await w.stopAll(); w.cleanup();
  }, T);
  it('flood: unknown-version heads growth over time', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 600_000, withM: true });
    const sizes: unknown[] = [];
    for (let min = 0; min < 20; min++) { for (let j = 0; j < 100; j++) mLive(w, W.KIND_HEADS, W.headsBodyOf({ page: 0, of: 1, ask: false, heads: [{ version: wid(`fl-${min}-${j}`), lines: 5, hash: Buffer.alloc(32, 3), conversationHash: Buffer.alloc(32), stamp: 0, state: 'ok' }] }), 'A'); await w.settle(); await w.elapse(61_000, 61_000); if (min % 5 === 4) sizes.push({ min: min + 1, ...w.devs.A.rep.stateSizes() }); }
    log('flood A sizes after 100 unknown-version heads per minute:', sizes);
    await w.stopAll(); w.cleanup();
  }, T);
});
