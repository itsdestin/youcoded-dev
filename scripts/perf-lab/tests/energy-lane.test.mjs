// Offline: fake meter/battery/interference/clock/environment only (lane C, energy-lane.mjs). No sensor, app or real thread.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENERGY_LANE, assessCpuCoverage, batteryReader, buildEnergySection, energyLaneProblems, locateBattery, medianOf, runEnergyLane, selectPptMeter, startCpuLoad } from '../energy-lane.mjs';
import { discoverEnergySensors } from '../energy.mjs';
import { shareSensors } from '../energy-helper.mjs';
import { ENERGY_PATHS, compareAll } from '../compare.mjs';
import { PHASES, parseArgs, validateReport } from '../run.mjs';

const FAST = { minWindowMs: 0, restMs: 0, windowMs: 0, cpuWindowMs: 0 };
const clean = (label) => ({ label, verdict: 'clean', reasons: [], offenders: [], platformProfiles: ['quiet'], acStates: [true], durationS: 5 });

// A scripted machine: the "phase" the lane is in decides the watts the fake meter reads.
function rig({ idle = 10, work = 15, cpu = 20, verdictFor = clean, env = () => ({ platformProfile: 'quiet', acOnline: true }), battery = null, options = {} } = {}) {
  const m = { phase: 'idle', n: 0 };
  const level = { idle, work, cpu };
  const interference = { mark: () => { m.phase = 'idle'; return ++m.n; }, verdictSince: (_mark, label) => verdictFor(label) };
  return {
    m,
    deps: {
      meter: { status: 'supported', sensor: { path: '/sys/class/hwmon/hwmon3/power1_input', scope: 'whole-device-or-domain:amdgpu', unit: 'microwatt' }, label: 'PPT', labelVerified: true },
      readMeter: async () => level[m.phase] + (m.n % 2) * 0.1,
      battery: battery ? { kind: 'power_now', name: 'BAT0' } : null,
      readBattery: battery ? async () => ({ watts: battery.watts[m.phase], state: battery.state }) : null,
      interference,
      baseline: async () => { m.phase = 'idle'; },
      workload: async () => { m.phase = 'work'; },
      startCpuLoad: () => { m.phase = 'cpu'; return { threads: 2, stop: async () => {} }; },
      cpuSeconds: (() => { let c = 0; return () => (c += 100); })(),
      readEnv: env,
      // The real poll samples while run() executes; this one samples at stop, when m.phase holds what the window just did.
      poll: (fn) => async () => { await Promise.all(Array.from({ length: 6 }, () => fn())); },
      sleep: async () => {},
      options: { ...FAST, ...options },
    },
  };
}

test('a responsive meter yields a measured differential estimate with median and spread', async () => {
  const { deps } = rig();
  const e = await runEnergyLane(deps);
  assert.equal(e.status, 'measured');
  assert.equal(e.meterRespondsToCpu, true);
  assert.equal(e.counts.clean, 7);
  assert.ok(Math.abs(e.median.deltaWatts - 5) < 0.3, String(e.median.deltaWatts));
  assert.equal(e.runs.length, 7);
  assert.equal(typeof e.spread.deltaWattsRange, 'number');
  assert.match(e.estimateLabel, /ESTIMATE of whole-chip power difference/);
  assert.equal(e.appAttributable, false);
  assert.deepEqual(energyLaneProblems({ energy: e }), []);
  // every window of every repeat carries its interference verdict
  for (const t of e.repeats) assert.equal(t.verdicts.length, 3);
});

test('a meter that does not move under CPU load is insensitive: not zero, not measured, no numbers', async () => {
  const { deps } = rig({ cpu: 10 });
  const e = await runEnergyLane(deps);
  assert.equal(e.status, 'insensitive');
  assert.equal(e.meterRespondsToCpu, false);
  assert.equal(e.median, null);
  assert.deepEqual(e.runs, []);
  assert.equal(e.repeats.length, 0, 'the app workload is not even run');
  assert.match(e.reason, /power cap/);
  assert.match(energyLaneProblems({ energy: e })[0], /insensitive/);
});

test('a disturbed window excludes its repeat, is counted and listed, and is replaced by an extra attempt', async () => {
  const { deps } = rig({ verdictFor: (label) => label === 'energy-2-baseline-a' ? { ...clean(label), verdict: 'disturbed', reasons: ['other programs used 3 cores'] } : clean(label) });
  const e = await runEnergyLane(deps);
  assert.equal(e.status, 'measured');
  assert.equal(e.counts.excluded, 1);
  assert.equal(e.counts.attempted, 8);
  assert.equal(e.excluded[0].repeat, 2);
  assert.match(e.excluded[0].reasons[0], /disturbed/);
  assert.ok(!e.runs.some((r) => r.repeat === 2));
});

test('too few clean repeats makes the run incomplete', async () => {
  const { deps } = rig({ verdictFor: (label) => /^energy-([3-9]|10)-workload$/.test(label) ? { ...clean(label), verdict: 'unknown', reasons: ['no readings'] } : clean(label) });
  const e = await runEnergyLane(deps);
  assert.equal(e.status, 'incomplete');
  assert.match(e.reason, /only 2 clean repeat/);
  assert.equal(e.median, null);
});

test('with no interference watch every window is unknown, so nothing is trusted', async () => {
  const { deps } = rig();
  deps.interference = null;
  const e = await runEnergyLane(deps);
  assert.equal(e.status, 'incomplete');
  assert.equal(e.meterRespondsToCpu, 'inconclusive');
});

test('a power profile or charger change anywhere invalidates the run', async () => {
  let calls = 0;
  const { deps } = rig({ env: () => ({ platformProfile: ++calls > 20 ? 'performance' : 'quiet', acOnline: true }) });
  const e = await runEnergyLane(deps);
  assert.equal(e.status, 'incomplete');
  assert.match(e.reason, /power profile/);
  assert.match(e.reason, /invalid/);
});

test('battery is used only while discharging', async () => {
  const watts = { idle: 8, work: 11, cpu: 14 };
  const on = await runEnergyLane(rig({ battery: { watts, state: 'Discharging' } }).deps);
  assert.equal(on.battery.status, 'measured');
  assert.ok(Math.abs(on.battery.median.deltaWatts - 3) < 0.01);
  const ac = await runEnergyLane(rig({ battery: { watts, state: 'Charging' } }).deps);
  assert.equal(ac.battery.status, 'not-discharging');
  assert.equal(ac.status, 'measured', 'the PPT result does not depend on the battery');
  assert.ok(ac.repeats.every((t) => t.batteryDeltaWatts === undefined));
  const none = await runEnergyLane(rig().deps);
  assert.equal(none.battery.status, 'absent');
});

test('no amdgpu meter is unsupported, never measured', async () => {
  const { deps } = rig();
  deps.meter = await selectPptMeter({ sensors: [{ kind: 'powercap', path: '/sys/x/energy_uj', scope: 'powercap-domain:package-0' }] });
  const e = await runEnergyLane(deps);
  assert.equal(e.status, 'unsupported');
  assert.equal(e.median, null);
});

test('selectPptMeter finds the amdgpu chip by name and insists on the PPT label', async () => {
  const sensors = [
    { kind: 'hwmon-power', path: '/sys/class/hwmon/hwmon2/power1_average', scope: 'whole-device-or-domain:nvme' },
    { kind: 'hwmon-power', path: '/sys/class/hwmon/hwmon7/power1_average', scope: 'whole-device-or-domain:amdgpu' },
    { kind: 'hwmon-power', path: '/sys/class/hwmon/hwmon7/power1_input', scope: 'whole-device-or-domain:amdgpu' },
  ];
  const ok = await selectPptMeter({ sensors }, { read: async () => 'PPT\n' });
  assert.equal(ok.sensor.path, '/sys/class/hwmon/hwmon7/power1_input');
  assert.equal(ok.labelVerified, true);
  const missing = await selectPptMeter({ sensors }, { read: async () => { throw Object.assign(Error('x'), { code: 'ENOENT' }); } });
  assert.equal(missing.status, 'supported');
  assert.equal(missing.labelVerified, false);
  const other = await selectPptMeter({ sensors }, { read: async () => 'vddgfx' });
  assert.equal(other.status, 'unsupported');
});

test('separate discovery budgets: a huge powercap tree cannot hide the battery', async () => {
  const zones = Array.from({ length: 400 }, (_, i) => `intel-rapl:${i}`);
  const files = {
    '/sys/class/powercap': zones, '/sys/class/hwmon': ['hwmon0'], '/sys/class/hwmon/hwmon0': ['name', 'power1_input'],
    '/sys/class/power_supply': ['BAT0'], '/sys/class/power_supply/BAT0': ['type', 'status', 'power_now'],
  };
  const d = await discoverEnergySensors({ list: async (p) => files[p] ?? [], read: async (p) => (p.endsWith('/type') ? 'Battery' : p.endsWith('/name') ? 'amdgpu' : ''), canonical: async (p) => p, maxSensors: 8 });
  assert.ok(d.sensors.some((s) => s.kind === 'battery-power'), 'battery found');
  assert.ok(d.sensors.some((s) => s.kind === 'hwmon-power'), 'hwmon found');
  assert.equal(d.truncated, true, 'the powercap overflow is still reported');
  assert.ok(d.entriesByFamily.powercap <= 256 && d.entriesByFamily.battery > 0);
});

test('shareSensors trims fairly across families and says it trimmed', () => {
  const sensors = [1, 2, 3].map((i) => ({ kind: 'powercap', path: `/p${i}` })).concat([{ kind: 'hwmon-power', path: '/h' }, { kind: 'battery-power', path: '/b' }]);
  const r = shareSensors({ status: 'supported', sensors }, 3);
  assert.deepEqual(r.sensors.map((s) => s.path), ['/p1', '/h', '/b']);
  assert.equal(r.status, 'incomplete');
  assert.equal(shareSensors({ sensors }, 9).sensors.length, 5);
});

test('locateBattery prefers power_now and falls back to current x voltage; reader reports state', async () => {
  const fs = { '/sys/class/power_supply/AC/type': 'Mains', '/sys/class/power_supply/BAT0/type': 'Battery', '/sys/class/power_supply/BAT0/current_now': '1500000', '/sys/class/power_supply/BAT0/voltage_now': '12000000', '/sys/class/power_supply/BAT0/status': 'Discharging' };
  const read = async (p) => { if (!(p in fs)) throw Object.assign(Error('no'), { code: 'ENOENT' }); return fs[p]; };
  const b = await locateBattery({ list: () => ['AC', 'BAT0'], read });
  assert.equal(b.kind, 'current-voltage');
  assert.deepEqual(await batteryReader(b, { read })(), { watts: 18, state: 'Discharging' });
  assert.equal((await locateBattery({ list: () => ['AC'], read })), null);
});

test('CPU-coverage verdicts: responds, flat, mixed, too little evidence', () => {
  const t = (i, base, work, ok = true) => ({ index: i, clean: ok, excludedReasons: ok ? [] : ['x'], deltaWatts: work - base, workloadWatts: work, windows: [{ kind: 'baseline', power: { meanW: base } }, { kind: 'workload', power: { meanW: work } }, { kind: 'baseline', power: { meanW: base } }] });
  assert.equal(assessCpuCoverage([t(1, 10, 20), t(2, 10, 21), t(3, 10, 19)]).meterRespondsToCpu, true);
  const flat = assessCpuCoverage([t(1, 36, 36), t(2, 36, 36.1), t(3, 36, 36)], { env: { acOnline: true, platformProfile: 'quiet' } });
  assert.equal(flat.meterRespondsToCpu, false);
  assert.match(flat.reason, /power cap/);
  assert.equal(assessCpuCoverage([t(1, 10, 20), t(2, 10, 10), t(3, 10, 10.1), t(4, 10, 20)]).meterRespondsToCpu, 'inconclusive');
  assert.equal(assessCpuCoverage([t(1, 10, 20), t(2, 10, 20, false), t(3, 10, 20, false)]).meterRespondsToCpu, 'inconclusive');
  assert.equal(medianOf([]), null);
});

test('startCpuLoad starts the requested worker threads and stop() terminates exactly those', async () => {
  const made = [];
  class FakeWorker { constructor(code, opts) { this.opts = opts; this.terminated = false; made.push(this); } async terminate() { this.terminated = true; } }
  const load = startCpuLoad({ threads: 3, WorkerCtor: FakeWorker });
  assert.equal(made.length, 3);
  assert.ok(made.every((w) => w.opts.eval === true));
  await load.stop();
  assert.ok(made.every((w) => w.terminated));
  assert.equal(new Int32Array(made[0].opts.workerData)[0], 1, 'stop flag set for the busy loops');
});

test('the energy lane is opt-in: --only energy alone, repeats >= 5, never in PHASES', () => {
  assert.ok(!PHASES.includes('energy'));
  const root = '/tmp/x-root';
  const cfg = parseArgs(['--only', 'energy', '--checkout', '/tmp/x-root/youcoded'], { root });
  assert.equal(cfg.energyLane, true);
  assert.equal(cfg.energyRepeats, ENERGY_LANE.repeats);
  assert.throws(() => parseArgs(['--only', 'energy,startup'], { root }), /alone/);
  assert.throws(() => parseArgs(['--only', 'energy', '--energy-repeats', '4'], { root }), /at least 5/);
  assert.equal(parseArgs([], { root }).energyLane, false);
});

test('validateReport applies the energy contract; measured passes, insensitive does not', async () => {
  const { deps } = rig();
  const measured = await runEnergyLane(deps);
  const base = { energyExecution: {}, legacyExecution: { revision: 2, phases: {} }, energy: measured, noise: {}, interference: { windows: [] }, identity: null };
  assert.deepEqual(validateReport(base, new Set(['energy'])), []);
  const flat = await runEnergyLane(rig({ cpu: 10 }).deps);
  assert.match(validateReport({ ...base, energy: flat }, new Set(['energy'])).join('\n'), /insensitive/);
});

test('ab comparison reads the energy paths with their spread', () => {
  const report = (d) => ({ energy: { runs: d.map((deltaWatts) => ({ deltaWatts, baselineWatts: 10 })), median: { deltaWatts: medianOf(d), baselineWatts: 10 } } });
  const r = compareAll(report([4, 5, 6, 5, 5]), report([7, 8, 9, 8, 8]), { paths: ENERGY_PATHS });
  const row = r.rows.find((x) => x.path === 'energy.median.deltaWatts');
  assert.equal(row.a, 5);
  assert.equal(row.b, 8);
  assert.equal(row.aSpread, 2);
  assert.equal(row.aSamples, 5);
  assert.equal(r.rows.find((x) => x.path === 'energy.battery.median.deltaWatts').status, 'missing');
});

test('buildEnergySection of a partial run is incomplete with no median', () => {
  const s = buildEnergySection({ cfg: ENERGY_LANE, meter: { status: 'supported', sensor: { path: '/sys/a', scope: 's', unit: 'microwatt' } }, env0: null, envEnd: null, cpuCoverage: null, triples: [], finished: false });
  assert.equal(s.status, 'incomplete');
  assert.equal(s.median, null);
});
