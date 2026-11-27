// Review-4 randomized adversarial schedules. Oracle (independent of replicator-model.ts):
//  O1 every line text acknowledged "saved" is held in some live version on some device, unless a restore of the writer's own profile removed the only copy anywhere (computed right after the restore, before anything runs)
//  O2 no version of any device holds the same acknowledged text twice
//  O3 after heal, no device reports faulted/stuck for a version, and the writer can append again to every version it writes (no permanent refusal)
//  O4 two devices that both say in-sync with equal line counts hold identical bytes
import * as fs from 'node:fs'; import * as nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import { repWorld, wireId, lineSet, type World } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/replicator-world';
import { missing, allLines } from './oracle';
const KS = ['store', 'replicator', 'witness'];
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const down = async (world: World, n: string): Promise<void> => { await world.devs[n].rep.idle(); world.devs[n].rep.stop(); world.devs[n].link.stop(); await world.devs[n].store.close(); };
const snap = (world: World, n: string, to: string, kinds = KS): void => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); for (const k of kinds) if (fs.existsSync(nodePath.join(world.dirs[n], k))) fs.cpSync(nodePath.join(world.dirs[n], k), nodePath.join(to, k), { recursive: true }); };
const restore = (world: World, n: string, from: string, kinds: string[]): void => {
  for (const k of kinds) { fs.rmSync(nodePath.join(world.dirs[n], k), { recursive: true, force: true }); if (fs.existsSync(nodePath.join(from, k))) fs.cpSync(nodePath.join(from, k), nodePath.join(world.dirs[n], k), { recursive: true }); }
  const lp = nodePath.join(world.dirs[n], 'store', 'LOCK'); if (fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), pid: 2147483646, start: 'dead' }));
};
export async function oneSchedule(seed: number, nDev: number, steps: number, verbose = false): Promise<string[]> {
  const R = rng(seed); const names = ['A', 'B', 'C'].slice(0, nDev); const problems: string[] = [];
  const world = await repWorld(names, { discoveryMs: 600_000 });
  const log: string[] = []; const L = (s: string) => { log.push(s); if (verbose) console.log(s); };
  try {
    const V = wireId('fz' + seed); let acked: string[] = []; let counter = 0; const snaps: string[] = []; const online = new Set(names);
    await world.create('A', V);
    const say = async (k: number) => { const ls = lineSet(k, 'L' + seed + '-' + (counter++) + '-', 0).map((b, i) => Buffer.from(b.toString().replace(/\n$/, '') + ' #' + counter + '.' + i + '\n')); try { const r = await world.append('A', V, ls); if (r.result === 'saved' || r.result === 'already-saved') { acked.push(...ls.map(String)); L('append ' + k + ' saved'); } else L('append ' + r.result); } catch (e) { L('append refused ' + (e as Error).message); } };
    const find = async () => { const m = await missing(world, acked); return m; };
    for (let s = 0; s < steps; s++) {
      const r = R();
      if (r < 0.30) await say(1 + Math.floor(R() * 4));
      else if (r < 0.40) { const f = nodePath.join(world.dirs.A, '..', 'sn' + seed + '-' + snaps.length); snap(world, 'A', f); snaps.push(f); L('snapshot A'); }
      else if (r < 0.52 && snaps.length) {
        const f = snaps[Math.floor(R() * snaps.length)]; const kind = R(); const kinds = kind < 0.6 ? KS : kind < 0.75 ? ['store'] : kind < 0.9 ? ['replicator'] : ['store', 'witness'];
        await down(world, 'A'); restore(world, 'A', f, kinds); await world.restart('A', { graceful: false, start: false });
        const lost = await find(); if (kinds.includes('store')) { acked = acked.filter((a) => !lost.includes(a)); } L('restore A ' + kinds.join('+') + ' lost-by-restore ' + lost.length);
        await world.devs.A.rep.start();
      }
      else if (r < 0.60) { const n = names[Math.floor(R() * names.length)]; const g = R() < 0.5; await down(world, n); await world.restart(n, { graceful: g }); L('restart ' + n + (g ? '' : ' kill')); }
      else if (r < 0.72 && nDev > 1) { const n = names[1 + Math.floor(R() * (nDev - 1))]; if (online.has(n)) { world.devs[n].carrier.setOnline(false); online.delete(n); L('offline ' + n); } else { world.devs[n].carrier.setOnline(true); online.add(n); L('online ' + n); } }
      else if (r < 0.76 && nDev > 1 && snaps.length) { // restore a non-writer from a copy of ITS older state is covered by restart; here A offline toggles
        const a = world.devs.A.carrier; a.setOnline(false); L('A offline'); await world.elapse(1_000 + Math.floor(R() * 20_000), 1_000, true); a.setOnline(true); L('A online');
      }
      else await world.elapse(500 + Math.floor(R() * 30_000), 1_000, true);
      await world.settle(20_000, 4, 3);
    }
    // heal
    for (const n of names) world.devs[n].carrier.setOnline(true);
    await world.elapse(900_000, 15_000, true);
    const m = await find();
    if (m.length) problems.push('O1 lost acknowledged lines: ' + m.length + ' e.g. ' + m[0].slice(0, 30));
    const all = await allLines(world);
    for (const [k, ls] of all) { const seen = new Set<string>(); for (const l of ls) { if (acked.includes(l)) { if (seen.has(l)) problems.push('O2 duplicate ' + k + ' ' + l.slice(0, 30)); seen.add(l); } } }
    for (const n of names) for (const v of world.devs[n].rep.versions()) {
      const st = await world.devs[n].rep.status(v);
      if (['faulted', 'stuck'].includes(st.state) || (st.state === 'diverged' && n !== 'A')) problems.push('O3 ' + n + '/' + v.toString('hex').slice(0, 8) + ' ' + st.state + ' ' + st.reason);
    }
    // writer can append to its versions again
    for (const v of world.devs.A.rep.versions()) { const d = world.devs.A.rep.describe(v); if (d && d.writer.equals(world.ids.A.deviceId)) { try { const r = await world.append('A', v, lineSet(1, 'post')); if (r.result !== 'saved') problems.push('O3 writer post-heal ' + r.result); } catch (e) { problems.push('O3 writer refuses after heal: ' + (e as Error).message + ' on ' + v.toString('hex').slice(0, 8)); } } }
    await world.elapse(120_000, 10_000, true);
    for (const v of world.devs.A.rep.versions()) {
      const info: Array<{ n: string; st: string; lines: Buffer[] }> = [];
      for (const n of names) { const st = await world.devs[n].rep.status(v); info.push({ n, st: st.state, lines: await world.readAll(n, v) }); }
      for (const a of info) for (const b of info) if (a.n < b.n && a.st === 'in-sync' && b.st === 'in-sync' && a.lines.length === b.lines.length && !a.lines.every((l, i) => l.equals(b.lines[i]))) problems.push('O4 in-sync but different ' + a.n + b.n + ' ' + v.toString('hex').slice(0, 8));
    }
    if (problems.length && process.env.DUMP) { for (const n of names) { const d = world.devs[n]; console.log('DEV ' + n + ' counters ' + JSON.stringify(d.rep.counters())); for (const v of d.rep.versions()) { const st = await d.rep.status(v); const dd = d.rep.describe(v); console.log('  ' + v.toString('hex').slice(0, 8) + ' writer=' + (dd && dd.writer.equals(world.ids.A.deviceId) ? 'A' : '?') + ' parent=' + (dd?.parent ? dd.parent.toString('hex').slice(0, 8) : '-') + ' lines=' + (await world.readAll(n, v)).length + ' ' + st.state + ' ' + st.reason + ' inc=' + st.incarnation + ' tags=' + (await world.readAll(n, v)).map((l) => (l.toString().match(/L\d+-(\d+)-.*?#(\d+\.\d+)/) ?? ['','?','?'])[2]).join(',') + ' peerView=' + JSON.stringify(d.rep.peerView(v).map((x) => x.peer.slice(0, 4) + ':' + x.lines + ':' + x.state))); } } }
    if (problems.length) problems.push('LOG: ' + log.join(' | '));
  } catch (e) { problems.push('EXC ' + (e as Error).stack?.split('\n').slice(0, 4).join(' / ') + ' LOG: ' + log.join(' | ')); }
  finally { await world.stopAll(); world.cleanup(); }
  return problems;
}
describe('fuzz', () => {
  it('schedules', async () => {
    const from = Number(process.env.SEED0 ?? 1); const n = Number(process.env.NSEEDS ?? 20); const nd = Number(process.env.NDEV ?? 2); const steps = Number(process.env.STEPS ?? 14);
    let bad = 0; const out: string[] = [];
    for (let s = from; s < from + n; s++) { const p = await oneSchedule(s, nd, steps, !!process.env.VERBOSE); if (p.length) { bad++; out.push('SEED ' + s + ' ' + p.join('\n   ')); } }
    console.log('SCHEDULES run=' + n + ' bad=' + bad + '\n' + out.join('\n'));
    fs.appendFileSync(process.env.OUTF ?? '/dev/null', 'range ' + from + '+' + n + ' ndev=' + nd + ' bad=' + bad + '\n' + out.join('\n') + '\n');
  }, 3_000_000);
});
