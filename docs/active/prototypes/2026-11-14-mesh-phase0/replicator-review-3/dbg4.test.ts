import { describe, it } from 'vitest';
import * as fs from 'node:fs'; import * as path from 'node:path';
import { mkWorld, mkline } from './dbgworld';
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
const tryApp = async (w: any, n: string, v: Buffer, ls: Buffer[], exp?: any) => { try { return JSON.stringify(await w.devs[n].rep.appendLocal(v, ls, exp)); } catch (e) { return 'threw ' + String(e).replace('Error: ', ''); } };

describe('replicator folder lost on a non-writer', () => {
  it('B loses replicator/ (heads, faults, intros); A idle', async () => {
    const w: any = await mkWorld(['A', 'B', 'C']);
    await w.stopDev('C', false);
    const V = await w.createRoot('A', 'chat-1', 'n1');
    await w.devs.A.rep.appendLocal(V, L('x', 0, 10)); await w.elapse(20000);
    await w.stopDev('B', false); fs.rmSync(path.join(w.dirs.B, 'replicator'), { recursive: true, force: true }); await w.startDev('B');
    await w.elapse(600000, 30000);
    console.log('B after 10 min', await st(w, 'B', V), '| A', await st(w, 'A', V));
    // a third device arrives while A is offline
    await w.stopDev('A', false); await w.startDev('C'); await w.elapse(600000, 30000);
    console.log('C (A offline, B holds lines w/o signatures)', await st(w, 'C', V), '| B', await st(w, 'B', V), JSON.stringify(w.devs.C.rep.counters()), fs.existsSync(path.join(w.dirs.C,'replicator','heads')) ? fs.readdirSync(path.join(w.dirs.C,'replicator','heads')).map((f: string)=>fs.statSync(path.join(w.dirs.C,'replicator','heads',f)).size) : 'no heads dir', JSON.stringify(w.devs.B.rep.counters()));
    { const hd = path.join(w.dirs.C,'replicator','heads'); for (const f of fs.readdirSync(hd)) { const b = fs.readFileSync(path.join(hd,f)); const loc = await w.current('C', V); console.log('C point lines', Number(b.readBigUInt64BE(0)), b.subarray(8,40).toString('hex').slice(0,12), 'store hash at 10:', ((await w.devs.C.store.hashAt(loc,0,10)) as string).slice(0,12), 'head', (await w.devs.C.store.head(loc)).lines); } }
    { const { SignedHeads } = await import('/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-3/dbg/src/main/mesh/replicator/signed-heads'); const { vouchLines } = await import('/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-3/dbg/src/main/mesh/replicator/ctx'); const { realFs } = await import('/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-3/dbg/src/main/mesh/store/fsio');
      const loc = await w.current('C', V); const h = await w.devs.C.store.head(loc); const desc = w.devs.C.rep.describe(V);
      const sh = new SignedHeads(realFs, path.join(w.dirs.C, 'replicator'));
      console.log('fresh vouch', JSON.stringify(await vouchLines({ heads: sh, store: w.devs.C.store, crypto: { self: w.ids.C.deviceId } } as any, V, loc, desc, h)), 'forkLine', desc.forkLine, 'pts', (await sh.pointsAfter(V, 0)).length, JSON.stringify(h.partial), JSON.stringify(h.rolledBack), h.damagedFromLine); }
    await w.startDev('A'); await w.elapse(300000, 30000);
    console.log('A back, idle:', await st(w, 'A', V), await st(w, 'B', V), await st(w, 'C', V));
    console.log('A appends ->', await tryApp(w, 'A', V, L('y', 10, 11))); await w.elapse(300000, 30000);
    console.log('after write:', await st(w, 'A', V), await st(w, 'B', V), await st(w, 'C', V));
    await w.stopAll(); w.cleanup();
  }, 900000);
});
