// scripts/perf-lab/tests/compare.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict, runsFor } from '../compare.mjs';

const base = {
  startup: { runs: [{ sessionsListed: 1000, blankWindowMs: 200 }, { sessionsListed: 1050, blankWindowMs: 210 }, { sessionsListed: 980, blankWindowMs: 190 }], median: { sessionsListed: 1000, firstContentfulPaint: 500, blankWindowMs: 200 } },
  idle: { pssMb: { median: 400, runs: [400, 405] }, cpuPct: { median: 2, runs: [2, 2.1] } },
  history: { medium: { runs: [{ resumeStableMs: 300 }, { resumeStableMs: 310 }], median: { resumeStableMs: 300 } }, huge: { runs: [{ ipcLast10Ms: 200, resumeStableMs: 2000 }, { ipcLast10Ms: 210, resumeStableMs: 2100 }], median: { ipcLast10Ms: 200, resumeStableMs: 2000 } } },
  workload: { runs: [{ switchP95Ms: 20, probe: { longtaskTotalMs: 100 }, pssAfterMb: 600, cpuDuringPct: 30 }, { switchP95Ms: 24, probe: { longtaskTotalMs: 130 }, pssAfterMb: 605, cpuDuringPct: 31 }], median: { switchP95Ms: 20, probe: { longtaskTotalMs: 100 }, pssAfterMb: 600, cpuDuringPct: 30 } },
  errors: { coldStarts: [0, 0, 0], scenarioBoot: 0 },
};
const clone = () => JSON.parse(JSON.stringify(base));

test('a jittery workload metric does not veto inside its own spread', () => {
  const c = clone(); c.startup.median.sessionsListed = 800; c.workload.median.probe.longtaskTotalMs = 125;   // +25%, but base spread is 30%
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} }).keep, true);
});
test('a longer blank window rejects an otherwise-faster boot', () => {
  const c = clone(); c.startup.median.sessionsListed = 800; c.startup.median.blankWindowMs = 260;   // +30% blank box (E1 failure mode)
  const v = verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} });
  assert.equal(v.keep, false); assert.ok(v.regressions.some((r) => r.path === 'startup.median.blankWindowMs'));
});
test('new error lines reject', () => {
  const c = clone(); c.startup.median.sessionsListed = 800; c.errors.coldStarts = [2, 0, 0];
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} }).keep, false);
});
test('keeps a real win with no regressions', () => {
  const c = clone(); c.startup.median.sessionsListed = 850;
  const v = verdict(base, c, { target: 'startup.median.sessionsListed', screens: { welcome: { pass: true } } });
  assert.equal(v.keep, true); assert.equal(v.target.deltaPct, -15);
});
test('rejects a win inside the baseline spread', () => {
  const c = clone(); c.startup.median.sessionsListed = 945;   // -5.5%, but spread is 7%
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} }).keep, false);
});
test('rejects when another primary metric regresses', () => {
  const c = clone(); c.startup.median.sessionsListed = 800; c.idle.pssMb.median = 460;
  const v = verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} });
  assert.equal(v.keep, false); assert.equal(v.regressions[0].path, 'idle.pssMb.median');
});
test('rejects on a screenshot diff unless ux-bugfix', () => {
  const c = clone(); c.startup.median.sessionsListed = 800;
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: { welcome: { pass: false, pct: 2 } } }).keep, false);
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: { welcome: { pass: false, pct: 2 } }, uxBugfix: true }).keep, true);
});

// Extra coverage (beyond the plan's supplied tests): confirm runsFor resolves
// all four path shapes the interface names. A silent [] here would make
// spreadPct silently return 0 for that shape, which would make verdict()
// treat all noise on that metric as a real signal — worth pinning explicitly.
test('runsFor resolves the startup.median.<key> shape', () => {
  assert.deepEqual(runsFor(base, 'startup.median.sessionsListed'), [1000, 1050, 980]);
});
test('runsFor resolves the history.<size>.median.<key> shape', () => {
  assert.deepEqual(runsFor(base, 'history.huge.median.ipcLast10Ms'), [200, 210]);
});
test('runsFor resolves the workload.median.<nested> shape', () => {
  assert.deepEqual(runsFor(base, 'workload.median.probe.longtaskTotalMs'), [100, 130]);
});
test('runsFor resolves the idle.<key>.median (flat runs) shape', () => {
  assert.deepEqual(runsFor(base, 'idle.pssMb.median'), [400, 405]);
});
