// MY OWN world for the replicator review (independent of tests/mesh/replicator-world.ts and replicator-model.ts).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { generateIdentity, setIdFor, signWith, verifySig, type DeviceIdentity } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/identity';
import { makeAddEntry, makeGenesisEntry, seenForNextEntry } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/roster';
import { newSetSecret } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/crypto/keys';
import { MemoryHub, type MemoryCarrier } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/carrier-memory';
import { Link } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/link';
import { RosterStore } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/roster-store';
import { ChatStore } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store';
import { realFs } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store/fsio';
import { FaultFs } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store/fault-fs';
import { chainStep, defaultChainSeeds } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store/chain';
import { Replicator } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator';
import type { Clock } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator';
import { repairFrom, chatGroup } from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/ctx';
import * as W from '/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/replicator/wire';

export { W, chatGroup, repairFrom, chainStep, signWith, verifySig };
export const wid = (n: string | number): Buffer => createHash('sha256').update(`review-version-${n}`).digest();
export const mkline = (tag: string, i: number, pad = 30): Buffer => Buffer.from(`${JSON.stringify({ type: i % 2 ? 'assistant' : 'user', message: { content: `${tag} ${i} ${'x'.repeat(pad)}` } })}\n`);
export const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export class VClock implements Clock {
  #t = 1_000_000; #timers: Array<{ at: number; fn: () => void; dead: boolean }> = [];
  now(): number { return this.#t; }
  setTimeout(fn: () => void, ms: number): { cancel(): void } { const t = { at: this.#t + ms, fn, dead: false }; this.#timers.push(t); return { cancel: () => { t.dead = true; } }; }
  async advance(ms: number): Promise<void> {
    const end = this.#t + ms;
    for (;;) {
      const due = this.#timers.filter((t) => !t.dead && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.#t = Math.max(this.#t, due.at); due.dead = true; due.fn();
      await new Promise<void>((r) => setImmediate(r));
    }
    this.#t = end; this.#timers = this.#timers.filter((t) => !t.dead);
  }
}

export interface Dev { name: string; id: DeviceIdentity; dir: string; carrier: MemoryCarrier; link: Link; store: ChatStore; rep: Replicator; roster: RosterStore; ffs: FaultFs; down: boolean }
export interface Cap { lines: Array<{ from: Buffer; body: W.LinesBody }>; live: Array<{ from: Buffer; kind: string; body: unknown; group: string }> }

const secret = newSetSecret();
export const incId = (v: Buffer, n: number): Buffer => (createHash('sha256').update('youcoded-mesh/v1/incarnation\0').update(v).update(`\0${n}`).digest());

export async function mkWorld(names: string[], o: { discoveryMs?: number; stallMs?: number; withM?: boolean; stepLimitMs?: number } = {}) {
  const hub = new MemoryHub(); const clock = new VClock();
  const all = o.withM ? [...names, 'M'] : names;
  const ids = Object.fromEntries(all.map((n) => [n, generateIdentity()])) as Record<string, DeviceIdentity>;
  const first = ids[names[0]]; const setId = setIdFor(first.signKey);
  const entries = [makeGenesisEntry(first, names[0], 'linux', 1)];
  for (const n of all.slice(1)) entries.push(makeAddEntry(first, { name: n, platform: 'linux', signKey: ids[n].signKey, agreeKey: ids[n].agreeKey }, seenForNextEntry(entries, first.deviceId), 2));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rv2-'));
  const dirs = Object.fromEntries(all.map((n) => [n, path.join(base, n)]));
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
  const saves = Object.fromEntries(all.map((n) => [n, { n: 0 }]));
  const devs: Record<string, Dev> = {};
  const cap: Cap = { lines: [], live: [] };

  async function make(n: string): Promise<Dev> {
    const roster = new RosterStore(dirs[n]); await roster.load();
    if (roster.size === 0) for (const e of entries) await roster.append(e);
    const carrier = hub.members.get(n) ?? hub.carrier(n);
    carrier.deviceHex = ids[n].deviceId.toString('hex');
    const ffs = new FaultFs(0, {});
    const store = await ChatStore.open(path.join(dirs[n], 'store'), { fs: ffs, proofVerifier: () => true });
    let rep: Replicator | null = null;
    const link = new Link({
      identity: ids[n], setId, carrier, meshDir: dirs[n], secrets: () => new Map([[1, secret]]), signKeyFor: (d) => roster.signKeyFor(d), isRemoved: (d) => roster.isRemoved(d),
      counter: { get: () => saves[n].n, set: async (v) => { saves[n].n = Math.max(saves[n].n, v); } },
      onFrame: (f) => (rep ? rep.onFrame(f) : undefined),
    });
    await link.start([]);
    rep = await Replicator.create({
      store, link, dir: path.join(dirs[n], 'replicator'), setId, clock, fs: ffs, stepLimitMs: o.stepLimitMs, discoveryMs: o.discoveryMs ?? 60_000, stallMs: o.stallMs ?? 20_000,
      crypto: { self: ids[n].deviceId, sign: (m) => signWith(ids[n], m), knows: (d) => roster.signKeyFor(d) !== undefined && !roster.isRemoved(d), verify: (d, m, s) => { const k = roster.signKeyFor(d); return !!k && verifySig(k, m, s); } },
      devices: () => names.filter((x) => x !== n).map((x) => ids[x].deviceId),
    });
    carrier.onConnected(() => rep?.hello());
    await rep.start();
    return { name: n, id: ids[n], dir: dirs[n], carrier, link, store, rep, roster, ffs, down: false };
  }
  for (const n of names) devs[n] = await make(n);

  // the hostile paired device: a real Link on the roster, no replicator; it records every frame it can read (it holds the set secret like any paired device)
  let M: { id: DeviceIdentity; link: Link; carrier: MemoryCarrier } | null = null;
  if (o.withM) {
    const roster = new RosterStore(dirs.M); await roster.load(); for (const e of entries) await roster.append(e);
    const carrier = hub.carrier('M'); carrier.deviceHex = ids.M.deviceId.toString('hex');
    const link = new Link({
      identity: ids.M, setId, carrier, meshDir: dirs.M, secrets: () => new Map([[1, secret]]), signKeyFor: (d) => roster.signKeyFor(d), isRemoved: (d) => roster.isRemoved(d),
      counter: { get: () => saves.M.n, set: async (v) => { saves.M.n = Math.max(saves.M.n, v); } },
      onFrame: async (f) => {
        try {
          if (f.header.kind === W.KIND_LINES) cap.lines.push({ from: f.header.from, body: W.parseLinesBody(f.body) });
          else cap.live.push({ from: f.header.from, kind: f.header.kind, body: f.body, group: f.group });
        } catch { /* benign (test): M records what it can parse */ }
      },
    });
    await link.start([]);
    M = { id: ids.M, link, carrier };
  }

  const snapshot = async (): Promise<string> => {
    const parts: string[] = [String(hub.stored.length)];
    for (const n of names) { const d = devs[n]; if (d.down) continue; parts.push(n, String(d.carrier.passed), JSON.stringify(d.rep.counters())); }
    return parts.join('|');
  };
  const world = {
    hub, clock, devs, ids, setId, dirs, names, M, cap, base, secret,
    async settle(maxMs = 30_000, pollMs = 20, rounds = 4): Promise<void> {
      const t0 = Date.now(); let last = ''; let same = 0;
      while (Date.now() - t0 < maxMs) {
        for (const n of names) if (!devs[n].down) await devs[n].rep.idle().catch(() => undefined);
        await new Promise((r) => setTimeout(r, pollMs));
        const now = await snapshot(); same = now === last ? same + 1 : 0; last = now;
        if (same >= rounds) return;
      }
      throw new Error('world did not settle');
    },
    async elapse(ms: number, step = 10_000): Promise<void> { for (let t = 0; t < ms; t += step) { await clock.advance(Math.min(step, ms - t)); await world.settle().catch(() => undefined); } },
    async create(n: string, version: Buffer, chatId: string, parent: { v: Buffer; line: number; hash: string; token: string } | null = null): Promise<void> {
      await devs[n].rep.createVersion({ version, chatId, runtime: 'claude-code', parent: parent ? parent.v : null, forkLine: parent ? parent.line : null, forkHash: parent ? Buffer.from(parent.hash, 'hex') : null, token: parent ? parent.token : null });
    },
    /** crash or stop a device: its folder stays; `crash` leaves the LOCK stale like a killed process */
    async stopDev(n: string, crash: boolean): Promise<void> {
      const d = devs[n]; if (d.down) return;
      await d.rep.idle().catch(() => undefined); d.rep.stop(); d.link.stop(); d.down = true; d.carrier.online = false;
      if (!crash) await d.store.close().catch(() => undefined);
      else { const lp = path.join(dirs[n], 'store', 'LOCK'); if (fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ ...JSON.parse(fs.readFileSync(lp, 'utf8')), pid: 2147483646, start: 'dead' })); }
    },
    async startDev(n: string): Promise<Dev> { const d = await make(n); devs[n] = d; d.carrier.online = true; return d; },
    async current(n: string, v: Buffer): Promise<Buffer | null> {
      for (let i = 0; i < 12; i++) {
        const local = incId(v, i);
        try { await devs[n].store.head(local); return local; } catch (e) { const c = (e as { code?: string }).code; if (c === 'damaged') continue; if (c === 'unknown-version') return null; throw e; }
      }
      return null;
    },
    cleanup(): void { fs.rmSync(base, { recursive: true, force: true, maxRetries: 3 }); },
    async stopAll(): Promise<void> { for (const n of names) { const d = devs[n]; try { d.rep.stop(); d.link.stop(); await d.store.close(); } catch { /* benign (teardown) */ } } M?.link.stop(); },
  };
  return world;
}
export type World = Awaited<ReturnType<typeof mkWorld>>;

/** Independent chain value: fold of chainStep over the oracle's lines from the store's published seed (the store's seed rule is the only thing taken from the store). */
export function oracleChain(chatId: string, version: Buffer, lines: Buffer[], k: number): string {
  let c = defaultChainSeeds({ chatId, version, segment: 0 }).raw;
  for (let i = 0; i < k; i++) c = chainStep(c, lines[i]);
  return c.toString('hex');
}
export const OUT = process.env.REVIEW_OUT ?? '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-2/out.log';
export const log = (...a: unknown[]): void => { fs.appendFileSync(OUT, a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n'); };
