import { it } from 'vitest';
import { mkWorld, mkline } from './world3';
const L = (tag: string, a: number, b: number) => Array.from({ length: b - a }, (_, i) => mkline(tag, a + i));
const same = (x: Buffer[], y: Buffer[]) => x.length === y.length && x.every((b, i) => b.equals(y[i]));
async function st(w: any, n: string, v: Buffer) { const s = await w.devs[n].rep.status(v); return `${s.state}${s.reason ? '(' + s.reason + ')' : ''}:${s.lines}`; }
async function readAll(w: any, n: string, v: Buffer): Promise<Buffer[]> { const l = await w.current(n, v); if (!l) return []; const h = await w.devs[n].store.head(l); return h.lines ? await w.devs[n].store.read(l, 0, 0, h.lines) : []; }
const out: string[] = [];
for (const peerUp of [true, false]) for (const useExpected of [true]) it(`FIRST-APPEND sweep peerUp=${peerUp} expected=${useExpected}`, async () => {
  const hist: Record<string, number> = {};
  for (let K = 1; K <= 60; K++) {
    const w: any = await mkWorld(['A', 'B']);
    const V = await w.createRoot('A', 'chat-1', 'n1');
    await w.elapse(15000); const base: Buffer[] = []; const hh = await w.devs.A.store.head(await w.current('A', V)); const r0 = { lines: 0, hash: hh.hash };
    const next = L('b', 0, 2);
    w.devs.A.ffs.failAt = w.devs.A.ffs.ops + K;
    let first = ''; let firstRes: any = null;
    try { firstRes = await w.devs.A.rep.appendLocal(V, next, useExpected ? { lines: r0.lines, hash: r0.hash } : undefined); first = firstRes.result; } catch (e) { first = 'threw:' + String(e).slice(0, 40); }
    const crashed = w.devs.A.ffs.crashed;
    if (!crashed) { await w.stopAll(); w.cleanup(); if (K > 1 && first !== 'saved') {} hist['nocrash K=' + K + ' first=' + first] = 1; break; }
    await w.stopDev('A', true);
    if (!peerUp) await w.stopDev('B', false);
    await w.startDev('A'); await w.elapse(40000, 10000);
    let second = ''; let secondRes: any = null;
    try { secondRes = await w.devs.A.rep.appendLocal(V, next, useExpected ? { lines: r0.lines, hash: r0.hash } : undefined); second = secondRes.result; } catch (e) { second = 'threw:' + String(e).replace('Error: ', '').slice(0, 50); }
    if (!peerUp) await w.startDev('B');
    await w.elapse(120000, 10000);
    const a = await readAll(w, 'A', V); const b = await readAll(w, 'B', V);
    const exp = [...base, ...next];
    let verdict: string;
    if (same(a, exp) && same(b, exp)) verdict = 'exact-once';
    else if (a.length === 4 && same(a.slice(0, 2), exp) && same(a.slice(2), next)) verdict = 'DUPLICATED-on-A' + (same(b, a) ? '(B same)' : '');
    else if (same(a, base) && same(b, base)) verdict = 'lost-both-never-saved';
    else verdict = `OTHER a=${a.length} b=${b.length}`;
    const sA = await st(w, 'A', V); const sB = await st(w, 'B', V);
    const key = `first=${first} second=${second} => ${verdict} statusA=${sA.replace(/:\d+/, '')} statusB=${sB.replace(/:\d+/, '')}`;
    hist[key] = (hist[key] ?? 0) + 1;
    await w.stopAll(); w.cleanup();
  }
  console.log(`FIRSTSWEEP peerUp=${peerUp} expected=${useExpected}\n` + Object.entries(hist).map(([k, v]) => `  ${v}x ${k}`).join('\n'));
}, 3600000);
