import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkWorld, wid, mkline, oracleChain, log, W, chatGroup, signWith, incId, type World } from './world';
import { decode } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/cbor';

const lines = (n: number, tag = 's', from = 0): Buffer[] => Array.from({ length: n }, (_, i) => mkline(tag, from + i));
const T = 600_000;
const st = async (w: World, n: string, v: Buffer) => { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}/${s.lines}`; };
const sendLive = (w: World, kind: string, body: unknown, to?: string) => w.M!.link.sendLive({ group: W.GROUP_LIVE, kind, body: body as never, ...(to ? { to: w.ids[to].deviceId } : {}) });
const genuine = (w: World, who: string, v: Buffer, chat: string, ls: Buffer[], k: number): W.SignedHead => { const hash = Buffer.from(oracleChain(chat, v, ls, k), 'hex'); return { lines: k, hash, sig: signWith(w.ids[who], W.headMessage(v, k, hash)) }; };

describe('targeted', () => {
  it('T1 acks: present right after a batch, gone after the next hello', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 20_000 }); const V = wid('t1');
    await w.create('A', V, 'c1'); await w.devs.A.rep.appendLocal(V, lines(5)); await w.settle();
    const before = w.devs.A.rep.peerAcks(V).map((a) => a.lines);
    await w.elapse(25_000);
    const after = w.devs.A.rep.peerAcks(V).map((a) => a.lines);
    log('T1 acks before hello', before, 'after one hello period', after);
    await w.stopAll(); w.cleanup();
  }, T);

  it('T2 stale ack after the holder retires its copy', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 600_000 }); const V = wid('t2'); const ls = lines(5);
    await w.create('A', V, 'c2'); await w.devs.A.rep.appendLocal(V, ls); await w.settle();
    log('T2 A sees ack from B', w.devs.A.rep.peerAcks(V).map((a) => a.lines));
    // B's store declares its copy damaged (what the store does on its own) and B cannot reach A afterwards (so the recopy cannot finish)
    w.devs.B.carrier.passFilter = () => 'drop'; w.devs.A.carrier.passFilter = () => 'drop';
    const local = await w.current('B', V); await w.devs.B.store.setAsideDamaged(local!);
    await w.devs.B.rep.reportCorrupt(V).catch((e) => log('T2 reportCorrupt threw', String(e)));
    await w.devs.B.rep.status(V);
    await w.settle();
    const bl = await w.current('B', V);
    const bh = bl ? await w.devs.B.store.head(bl) : null;
    log('T2 B holds now', bh ? bh.lines : 'no copy', 'incarnation current', bl && bl.equals(V) ? 0 : 'n>0', 'A still reports ack lines', w.devs.A.rep.peerAcks(V).map((a) => a.lines), 'B status', await st(w, 'B', V));
    await w.stopAll(); w.cleanup();
  }, T);

  it('T3 the WRITER retires its own copy: can it recopy from peers?', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 20_000 }); const V = wid('t3'); const ls = lines(6);
    await w.create('A', V, 'c3'); await w.devs.A.rep.appendLocal(V, ls); await w.settle();
    const local = await w.current('A', V); await w.devs.A.store.setAsideDamaged(local!);
    await w.devs.A.rep.reportCorrupt(V).catch(() => undefined);
    await w.elapse(120_000);
    const al = await w.current('A', V); const ah = al ? await w.devs.A.store.head(al) : null;
    log('T3 writer after set-aside: lines', ah?.lines, 'status', await st(w, 'A', V), 'counters', JSON.stringify(w.devs.A.rep.counters()));
    // can the writer append again (would it fork its own history under the same id)?
    const r = await w.devs.A.rep.appendLocal(V, lines(1, 'new', 6)).then((x) => `ok ${x.lines}`, (e) => `refused ${String(e)}`);
    log('T3 writer appendLocal after set-aside:', r);
    await w.elapse(90_000);
    const bl = await w.current('B', V); const bh = await w.devs.B.store.head(bl!); const al2 = await w.current('A', V); const ah2 = await w.devs.A.store.head(al2!);
    log('T3 after writer re-appended: A holds', ah2.lines, 'B holds', bh.lines, 'B status', await st(w, 'B', V), 'A status', await st(w, 'A', V), 'chains equal?', ah2.hash === bh.hash, 'B first line == A first line?', (await w.devs.B.store.read(bl!, 0, 0, 1) as Buffer[])[0].equals((await w.devs.A.store.read(al2!, 0, 0, 1) as Buffer[])[0]));
    await w.stopAll(); w.cleanup();
  }, T);

  it('T4 intro race: a paired device names itself writer of a version before the real writer is heard', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 20_000, withM: true }); const V = wid('t4');
    // M announces V (chat c4) with ITSELF as writer, straight to B, before A has said anything
    const body = { version: V, chatId: 'c4', runtime: 'claude-code' as const, parent: null, forkLine: null, forkHash: null, token: null, writer: w.ids.M.deviceId };
    const sig = signWith(w.ids.M, W.introMessage(body as never));
    sendLive(w, W.KIND_INTRO, W.introBodyOf({ ...body, sig } as never), 'B'); await w.settle();
    log('T4 B knows V writer=M?', (w.devs.B.rep.versions().length), 'B status', await st(w, 'B', V));
    await w.create('A', V, 'c4').catch((e) => log('T4 A create threw', String(e)));
    await w.devs.A.rep.appendLocal(V, lines(4)); await w.elapse(60_000);
    log('T4 after A announced+appended: A', await st(w, 'A', V), 'B', await st(w, 'B', V), 'B counters', JSON.stringify(w.devs.B.rep.counters()));
    // M now feeds B forged-by-M lines for V, validly signed BY M (it is the writer on B's directory)
    const ml = lines(3, 'M-forged');
    const hash = Buffer.from(oracleChain('c4', V, ml, 3), 'hex');
    const head = { lines: 3, hash, sig: signWith(w.ids.M, W.headMessage(V, 3, hash)) };
    await w.M!.link.sendDurable({ group: chatGroup(w.setId, 'c4'), kind: W.KIND_LINES, line: true, to: w.ids.B.deviceId, body: W.linesBody({ version: V, from: 0, lines: ml, head }) });
    await w.elapse(60_000);
    const bl = await w.current('B', V); const bh = bl ? await w.devs.B.store.head(bl) : null;
    log('T4 B holds under A\'s version id:', bh?.lines, 'status', await st(w, 'B', V), 'A holds 4 lines with a different history; ok iff B shows something named');
    // a later append by A: does the named stuck state disappear?
    await w.devs.A.rep.appendLocal(V, lines(2, 'more', 4)); await w.elapse(60_000);
    log('T4 after more A lines: B', await st(w, 'B', V), 'A', await st(w, 'A', V));
    await w.stopAll(); w.cleanup();
  }, T);

  it('T5 two conflicting intros arriving together: who ends up as the writer on B?', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 20_000, withM: true });
    const res: string[] = [];
    for (let trial = 0; trial < 6; trial++) {
      const Vt = wid('t5-' + trial);
      const mk2 = (who: string) => { const body = { version: Vt, chatId: 'c5', runtime: 'claude-code' as const, parent: null, forkLine: null, forkHash: null, token: null, writer: w.ids[who].deviceId }; return { ...body, sig: signWith(w.ids[who], W.introMessage(body as never)) }; };
      const first = trial % 2 ? 'A' : 'M', second = trial % 2 ? 'M' : 'A';
      sendLive(w, W.KIND_INTRO, W.introBodyOf(mk2(first) as never), 'B'); sendLive(w, W.KIND_INTRO, W.introBodyOf(mk2(second) as never), 'B');
      await w.settle();
      const f = path.join(w.dirs.B, 'replicator', 'intro', Vt.toString('hex'));
      const saved = fs.existsSync(f) ? W.parseIntroBody(decode(fs.readFileSync(f))) : null;
      res.push(`trial${trial} first=${first} second=${second} B kept writer=${saved ? (saved.writer.equals(w.ids.A.deviceId) ? 'A' : 'M') : 'none'} status=${await st(w, 'B', Vt)}`);
    }
    log('T5', res);
    await w.stopAll(); w.cleanup();
  }, T);

  it('T6 amplification: one tiny sum frame from a paired device makes a device read every version and answer with a full heads page', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 600_000, withM: true });
    const N = 300;
    for (let i = 0; i < N; i++) await w.create('A', wid('t6-' + i), 'chat-' + i);
    await w.settle();
    let heads = 0; const orig = w.devs.A.store.head.bind(w.devs.A.store);
    (w.devs.A.store as unknown as { head: unknown }).head = (...a: Parameters<typeof orig>) => { heads++; return orig(...a); };
    const passedBefore = w.devs.A.carrier.passed;
    const t0 = Date.now();
    sendLive(w, W.KIND_SUM, W.sumBody({ count: 0, digest: Buffer.alloc(32, 7), ask: true }), 'A');
    await w.settle();
    log('T6 versions', N, 'one sum frame ->', heads, 'store.head() calls on A,', w.devs.A.carrier.passed - passedBefore, 'frames out from A, ms', Date.now() - t0);
    await w.stopAll(); w.cleanup();
  }, T);

  it('T7 a paired device pins the 64 MiB reassembly budget, a real large line cannot arrive', async () => {
    const w = await mkWorld(['A', 'B'], { discoveryMs: 60_000, withM: true }); const V = wid('t7'); const c = 'c7';
    await w.create('A', V, c); const ls = lines(3); await w.devs.A.rep.appendLocal(V, ls); await w.settle();
    const gh = genuine(w, 'A', V, c, ls, 3);
    const PART = W.PART_BYTES; const of = 128; const total = of * PART - 10;
    const part0 = W.linesBody({ version: V, from: 2, lines: [Buffer.alloc(PART, 1)], head: gh, part: { index: 0, of, totalBytes: total } });
    await w.M!.link.sendDurable({ group: chatGroup(w.setId, c), kind: W.KIND_LINES, line: true, to: w.ids.B.deviceId, body: part0 }); await w.settle();
    const big = Buffer.concat([Buffer.from('{"type":"user","message":{"content":"'), Buffer.alloc(3 * 1024 * 1024, 0x61), Buffer.from('"}}\n')]);
    await w.devs.A.rep.appendLocal(V, [big]); await w.elapse(40_000, 5_000);
    const bl = await w.current('B', V); const bh = await w.devs.B.store.head(bl!);
    log('T7 B lines after 40 virtual s with budget pinned:', bh.lines, '(A has 4)', 'counters', JSON.stringify(w.devs.B.rep.counters()), 'status', await st(w, 'B', V));
    await w.elapse(120_000, 10_000);
    const bh2 = await w.devs.B.store.head(bl!);
    log('T7 B lines after another 120 s (hello clears):', bh2.lines);
    await w.stopAll(); w.cleanup();
  }, T);
});
