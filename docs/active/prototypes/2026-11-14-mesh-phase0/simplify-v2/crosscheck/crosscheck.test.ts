import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { generateIdentity, type DeviceIdentity } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/identity';
import { RosterVerifier, makeAddEntry, makeGenesisEntry, makeRemoveEntry, type SignedEntry, type MutualRule } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/roster';
const scen = JSON.parse(fs.readFileSync(process.env.SCEN as string, 'utf8')) as any[];
const info = (d: DeviceIdentity, name = 'd') => ({ name, platform: 'linux', signKey: d.signKey, agreeKey: d.agreeKey });
const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
describe('crosscheck', () => {
  it('model equals the real verifier', () => {
    let bad = 0, total = 0; const byRule: Record<string, any> = { both: { total: 0, bad: 0, badDup: 0 }, 'first-admitted': { total: 0, bad: 0, badDup: 0 } }; const badSeeds: number[] = []; const detail: any[] = [];
    for (const sc of scen) {
      const ids: DeviceIdentity[] = sc.order.map(() => generateIdentity()); // ids[k] is the device at admission position k
      const pos = new Map<number, number>(sc.order.map((d: number, k: number) => [d, k]));
      for (const rule of ['both', 'first-admitted'] as MutualRule[]) {
        const v = new RosterVerifier(rule);
        const g = makeGenesisEntry(ids[0], 'g', 'linux', 1); v.add(g);
        let last = g; const adds: SignedEntry[] = [g];
        for (let k = 1; k < ids.length; k++) { last = makeAddEntry(ids[0], info(ids[k]), [last.id], 1 + k); v.add(last); adds.push(last); }
        const real = new Map<string, SignedEntry>();
        // entries in order of closure size so every cited entry exists
        const byId = new Map(sc.entries.map((e: any) => [e.id, e]));
        const depth = (e: any): number => 1 + Math.max(0, ...e.seen.map((s: string) => depth(byId.get(s))));
        const order = sc.entries.slice().sort((a: any, b: any) => depth(a) - depth(b) || (a.id < b.id ? -1 : 1));
        let at = 100;
        for (const e of order) {
          const signer = ids[pos.get(e.signer)!], target = ids[pos.get(e.target)!];
          const re = makeRemoveEntry(signer, target.deviceId, [last.id, ...e.seen.map((s: string) => real.get(s)!.id)], at++);
          real.set(e.id, re); try { v.add(re); } catch (err) { throw new Error('add failed ' + (err as Error).message); }
        }
        const got = ids.map((d, k) => (v.removed.has(hex(d.deviceId)) ? sc.order[k] : -1)).filter((x: number) => x >= 0).sort();
        const want = (rule === 'both' ? sc.both : sc.first) as number[];
        total++; byRule[rule].total++;
        const dup = (() => { const seenp = new Set<string>(); for (const e of sc.entries) { const k = e.signer + '>' + e.target; if (seenp.has(k)) return true; seenp.add(k); } return false; })();
        if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; byRule[rule].bad++; if (dup) byRule[rule].badDup++; if (badSeeds.length < 20) { badSeeds.push(sc.seed); if (detail.length < 5) detail.push({ seed: sc.seed, rule, got, want, n: sc.n, order: sc.order, entries: sc.entries }); } }
      }
    }
    console.log('CROSSCHECK total', total, 'mismatch', bad, JSON.stringify(byRule), 'seeds', JSON.stringify(badSeeds)); if (detail.length) console.log('DETAIL', JSON.stringify(detail));
    fs.writeFileSync(process.env.SCEN + '.result', JSON.stringify({ total, bad, byRule, badSeeds, detail }));
    expect(bad).toBe(0);
  });
});
