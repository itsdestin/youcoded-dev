// Offline: fake /proc readers only. Proves the mid-window interference watch names offenders, never
// calls an unwatched window clean, excludes the app family, and that A/B pairs with a different power
// profile or charger state are refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInterferenceWatch, summarize, parseProcStat, ownedSet, describeOffenders, topForeignProcesses, interferenceProblems, MAX_SAMPLES } from '../interference-watch.mjs';
import { assessComparability } from '../comparability.mjs';
import { identityMismatches, sampleIdentity } from '../identity.mjs';
import { noiseGate, validateReport } from '../run.mjs';
import { validLegacyReport } from './legacy-fixture.mjs';

// A scripted machine: each step says how many CPU ticks (1/100 s) each fake process burns per 500 ms tick.
function rig({ procs, profile = () => 'quiet', ac = () => false, pressure = () => ({ cpu: 0, io: 0, memory: 0 }), owned = () => [], maxSamples } = {}) {
  let t = 1_000_000, step = 0;
  const ticks = new Map(); // pid -> cumulative
  const state = { idle: 0, total: 0 };
  const watch = createInterferenceWatch({
    autoTimer: false, now: () => t, selfPid: 1, maxSamples,
    readTicks: () => ({ idle: state.idle, total: state.total }),
    readProcs: () => procs(step).map((p) => { ticks.set(p.pid, (ticks.get(p.pid) ?? 0) + (p.burn ?? 0)); return { pid: p.pid, key: `${p.pid}:1`, name: p.name, ppid: p.ppid ?? 1000, ticks: ticks.get(p.pid) }; }),
    pressure, gpuBusy: () => 10, gpuWatts: () => 36, gpuClients: () => null,
    profile: () => profile(step), acOnline: () => ac(step),
  });
  const advance = () => { step++; t += 500; state.total += 800; state.idle += 700; watch.tick(); }; // 8 cpus * 50 ticks
  return { watch, advance, get step() { return step; } };
}
const run = (r, n, owned) => { r.watch.start(owned); for (let i = 0; i < n; i++) r.advance(); return r.watch.stop('t'); };

test('quiet machine: clean verdict, small foreign users are not offences', () => {
  const r = rig({ procs: () => [{ pid: 10, name: 'app', burn: 20 }, { pid: 11, name: 'sshd', burn: 1 }] });
  const v = run(r, 20, () => [10]);
  assert.equal(v.verdict, 'clean', v.reasons.join('; '));
  assert.ok(v.samples >= 20);
});

test('VM spike mid-window: disturbed, names the process, pid and cores', () => {
  const r = rig({ procs: (s) => [{ pid: 10, name: 'app', burn: 10 }, { pid: 77, name: 'qemu-system-x86', burn: s > 6 ? 95 : 0 }] });
  const v = run(r, 20, () => [10]);
  assert.equal(v.verdict, 'disturbed');
  assert.match(v.reasons.join(' '), /qemu-system-x86 \(pid 77\) used \d(\.\d)? cores?/);
  assert.equal(v.offenders[0].name, 'qemu-system-x86');
});

test('short burst over 2 cores for 2 s is disturbed even when the average is low', () => {
  const r = rig({ procs: (s) => [{ pid: 77, name: 'cargo', burn: s >= 10 && s <= 14 ? 130 : 0 }] });
  const v = run(r, 60, () => []);
  assert.ok(v.foreignAvgCores < 1);
  assert.equal(v.verdict, 'disturbed');
  assert.match(v.reasons.join(' '), /burst.*cargo/);
});

test('owned app family, the lab itself and their children are never foreign', () => {
  const r = rig({ procs: () => [
    { pid: 10, name: 'youcoded', burn: 150 }, { pid: 11, name: 'gpu-process', burn: 150, ppid: 10 },
    { pid: 1, name: 'node', burn: 150, ppid: 5 }, { pid: 2, name: 'Xvfb', burn: 100, ppid: 1 },
  ] });
  const v = run(r, 10, () => [10]);
  assert.equal(v.verdict, 'clean', v.reasons.join('; '));
  assert.equal(v.foreignAvgCores, 0);
});

test('power profile or charger changing mid-window is disturbed', () => {
  let v = run(rig({ procs: () => [], profile: (s) => (s > 5 ? 'performance' : 'quiet') }), 10, () => []);
  assert.equal(v.verdict, 'disturbed');
  assert.match(v.reasons.join(' '), /power profile changed during the window \(quiet -> performance\)/);
  v = run(rig({ procs: () => [], ac: (s) => s > 3 }), 10, () => []);
  assert.equal(v.verdict, 'disturbed');
  assert.match(v.reasons.join(' '), /charger/);
});

test('disk or memory pressure above 10 is disturbed; below is not', () => {
  assert.equal(run(rig({ procs: () => [], pressure: () => ({ cpu: 50, io: 9.9, memory: 1 }) }), 6, () => []).verdict, 'clean');
  const v = run(rig({ procs: () => [], pressure: () => ({ cpu: 0, io: 25, memory: 0 }) }), 6, () => []);
  assert.equal(v.verdict, 'disturbed');
  assert.match(v.reasons.join(' '), /disk/);
});

test('sample overflow is unknown, never clean', () => {
  const v = run(rig({ procs: () => [], maxSamples: 5 }), 12, () => []);
  assert.equal(v.verdict, 'unknown');
  assert.equal(v.overflow, true);
  assert.ok(MAX_SAMPLES > 1000);
});

test('too-short window and failed readers are unknown', () => {
  assert.equal(run(rig({ procs: () => [] }), 0, () => []).verdict, 'unknown');
  const w = createInterferenceWatch({ autoTimer: false, readTicks: () => { throw new Error('no /proc'); }, readProcs: () => [], gpuClients: () => null });
  w.start(); w.tick();
  assert.equal(w.stop('x').verdict, 'unknown');
  assert.equal(createInterferenceWatch({ autoTimer: false }).stop('never-started').verdict, 'unknown');
});

test('a pid that vanishes mid-window is tolerated', () => {
  const r = rig({ procs: (s) => [{ pid: 10, name: 'app', burn: 5 }, ...(s < 4 ? [{ pid: 90, name: 'short', burn: 20 }] : [])] });
  const v = run(r, 10, () => [10]);
  assert.equal(v.verdict, 'clean');
});

test('verdictSince gives a sub-window its own verdict from the same samples', () => {
  const r = rig({ procs: (s) => [{ pid: 77, name: 'qemu-system-x86', burn: s > 10 ? 150 : 0 }] });
  r.watch.start(() => []);
  for (let i = 0; i < 8; i++) r.advance();
  const m = r.watch.mark();
  for (let i = 0; i < 4; i++) r.advance();
  for (let i = 0; i < 8; i++) r.advance();
  assert.equal(r.watch.verdictSince(m, 'late').verdict, 'disturbed');
  r.watch.stop('x');
});

test('parseProcStat survives spaces and parens in the process name', () => {
  const line = '123 (my (odd) app) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 99 20';
  const p = parseProcStat(line);
  assert.equal(p.name, 'my (odd) app');
  assert.equal(p.ticks, 23); assert.equal(p.start, 99); assert.equal(p.ppid, 1);
});

test('ownedSet includes descendants', () => {
  const s = ownedSet([{ pid: 2, ppid: 10 }, { pid: 3, ppid: 2 }, { pid: 4, ppid: 99 }], [10], 1);
  assert.deepEqual([...s].sort(), [1, 10, 2, 3]);
});

test('the quiet-wait message names the processes to close', async () => {
  const said = [];
  let la = 9;
  await noiseGate({ quietWaitMs: 0, discardedRuns: 0, loadAvgBefore: null }, {
    pollMs: 1, maxWaitMs: 60_000, say: (m) => said.push(m), sleep: async () => { la = 1; },
    loadAvg: () => la, busyPct: async () => 2,
    whoIsBusy: async () => (la > 4 ? [{ name: 'qemu-system-x86', pids: [1, 2, 3], cores: 3.3 }] : []),
  });
  assert.match(said.join('\n'), /waiting: qemu-system-x86 ×3 using 3\.3 cores/);
  assert.equal(describeOffenders([{ name: 'a', pids: [1], cores: 1 }]), 'a using 1 core');
});

test('topForeignProcesses reports other programs, not the lab', async () => {
  let n = 0;
  const scan = () => { n++; return [{ pid: 1, key: '1:1', name: 'node', ppid: 5, ticks: n * 300 }, { pid: 50, key: '50:1', name: 'qemu-system-x86', ppid: 9, ticks: n * 330 }, { pid: 51, key: '51:1', name: 'qemu-system-x86', ppid: 9, ticks: n * 0 }]; };
  const top = await topForeignProcesses({ seconds: 3, selfPid: 1, readProcs: scan, sleep: async () => {} });
  assert.equal(top.length, 1);
  assert.equal(top[0].name, 'qemu-system-x86');
  assert.equal(Math.round(top[0].cores * 10) / 10, 1.1);
});

const w = (over) => ({ label: 'x', verdict: 'clean', reasons: [], platformProfiles: ['quiet'], acStates: [false], ...over });

test('a disturbed or unknown window makes the report incomplete (numbers kept, never healthy)', () => {
  const rep = { identity: sampleIdentity({ environment: { platformProfile: 'quiet', acOnline: false } }), interference: { windows: [w()] } };
  assert.deepEqual(interferenceProblems(rep), []);
  rep.interference.windows.push(w({ label: 'workload-2', verdict: 'disturbed', reasons: ['qemu-system-x86 (pid 5) used 2 cores'] }));
  rep.interference.windows.push(w({ label: 'stall', verdict: 'unknown', reasons: ['no usable readings'] }));
  const p = interferenceProblems(rep).join('\n');
  assert.match(p, /workload-2.*DISTURBED.*qemu-system-x86 \(pid 5\)/);
  assert.match(p, /stall.*could not be checked/);
  assert.match(validateReport({ ...validLegacyReport(['history']), ...rep }, new Set(['history'])).join('\n'), /DISTURBED/);
  // a clean window under a different profile than the run began with is also a problem
  assert.match(interferenceProblems({ ...rep, interference: { windows: [w({ platformProfiles: ['performance'] })] } }).join(), /different power profile/);
});

test('comparability refuses a disturbed window, a missing record, and a profile/AC mismatch', () => {
  const base = () => {
    const r = { ...validLegacyReport(['history']), interference: { windows: [w()] } };
    r.identity = sampleIdentity({ environment: { platformProfile: 'quiet', acOnline: false } });
    return r;
  };
  const reasons = (a, b) => assessComparability(a, b).reasons.join('\n');
  assert.doesNotMatch(reasons(base(), base()), /interference|power profile|charger/);
  const d = base(); d.interference.windows[0].verdict = 'disturbed';
  assert.match(reasons(base(), d), /candidate: interference: window x was DISTURBED/);
  const none = base(); delete none.interference;
  assert.match(reasons(base(), none), /candidate: no interference record/);
  const p = base(); p.identity.environment.platformProfile = 'performance';
  assert.match(reasons(base(), p), /power profile differs \(quiet vs performance\)/);
  const ac = base(); ac.identity.environment.acOnline = true;
  assert.match(reasons(base(), ac), /charger state differs/);
  assert.match(identityMismatches(sampleIdentity(), sampleIdentity({ environment: { platformProfile: 'quiet', acOnline: true } })).join(), /power profile differs/);
});
