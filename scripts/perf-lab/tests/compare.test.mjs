// scripts/perf-lab/tests/compare.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRIMARY, ZERO_BASELINE_FLOOR, get, runsFor, spreadPct, verdict } from '../compare.mjs';

// A baseline report carrying EVERY path in PRIMARY, with at least two runs behind each.
//
// WHY it has to be complete. This fixture used to stop after the startup/idle/history/
// workload metrics — no `replayStall`, no `artifacts` — and every test in this file still
// passed, including the ones asserting KEEP. That was the bug: verdict() treated a path
// it could not find as a path that had not regressed, so a fixture missing half the
// metrics was silently grading a change on the other half. A partial fixture here means
// partial tests, and partial tests are how a gate quietly stops gating.
const base = {
  startup: {
    runs: [
      { sessionsListed: 1000, blankWindowMs: 200 },
      { sessionsListed: 1050, blankWindowMs: 210 },
      { sessionsListed: 980, blankWindowMs: 190 },
    ],
    median: { sessionsListed: 1000, firstContentfulPaint: 500, blankWindowMs: 200 },
  },
  idle: { pssMb: { median: 400, runs: [400, 405] }, cpuPct: { median: 2, runs: [2, 2.1] } },
  history: {
    medium: { runs: [{ resumeStableMs: 300 }, { resumeStableMs: 310 }], median: { resumeStableMs: 300 } },
    huge: {
      runs: [{ ipcLast10Ms: 200, resumeStableMs: 2000 }, { ipcLast10Ms: 210, resumeStableMs: 2100 }],
      median: { ipcLast10Ms: 200, resumeStableMs: 2000 },
    },
  },
  workload: {
    runs: [
      { switchP95Ms: 20, switchPaintedBySize: { huge: { medianMs: 2400 } }, probe: { longtaskTotalMs: 100 }, pssAfterMb: 600, cpuDuringPct: 30 },
      { switchP95Ms: 24, switchPaintedBySize: { huge: { medianMs: 2500 } }, probe: { longtaskTotalMs: 130 }, pssAfterMb: 605, cpuDuringPct: 31 },
    ],
    median: { switchP95Ms: 20, switchPaintedBySize: { huge: { medianMs: 2400 } }, probe: { longtaskTotalMs: 100 }, pssAfterMb: 600, cpuDuringPct: 30 },
  },
  replayStall: {
    medium: {
      runs: [
        { mainProcessStallMaxMs: 3000, ipcTotalStallMs: 4200 },
        { mainProcessStallMaxMs: 3100, ipcTotalStallMs: 4300 },
      ],
      median: { mainProcessStallMaxMs: 3000, ipcTotalStallMs: 4200 },
    },
    huge: {
      runs: [{ rendererLongtaskMaxMs: 3200 }, { rendererLongtaskMaxMs: 3300 }],
      median: { rendererLongtaskMaxMs: 3200 },
    },
  },
  artifacts: {
    runs: [
      {
        open: { mdLarge: { openMs: 1400 } },
        typing: { codeLarge: { keystroke: { p95Ms: 180 } } },
        htmlNav: { swap: { medianMs: 210 } },
        ipcSumOfSteps: { totalStallMs: 700, pings: 900 },
      },
      {
        open: { mdLarge: { openMs: 1440 } },
        typing: { codeLarge: { keystroke: { p95Ms: 186 } } },
        htmlNav: { swap: { medianMs: 216 } },
        ipcSumOfSteps: { totalStallMs: 720, pings: 900 },
      },
    ],
    median: {
      open: { mdLarge: { openMs: 1400 } },
      typing: { codeLarge: { keystroke: { p95Ms: 180 } } },
      htmlNav: { swap: { medianMs: 210 } },
      ipcSumOfSteps: { totalStallMs: 700, pings: 900 },
    },
  },
  errors: { coldStarts: [0, 0, 0], scenarioBoot: 0 },
};
const clone = () => JSON.parse(JSON.stringify(base));

// The guard on the fixture itself. If PRIMARY gains a path and nobody adds it here, every
// verdict() test below would quietly go back to grading a partial report.
test('the fixture carries every PRIMARY path, or every test below is judging a partial report', () => {
  const gaps = PRIMARY.filter((p) => typeof get(base, p) !== 'number');
  assert.deepEqual(gaps, [], `fixture is missing: ${gaps.join(', ')}`);
});

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

// ── A cost that did not exist before ─────────────────────────────────────────
// The percentage machinery cannot express "0 -> 3000". It used to answer `null` and the
// regression loop skipped every null, so introducing a brand-new three-second freeze
// scored the same as changing nothing at all. This is the failure mode the whole rig was
// built to catch, and it was the one shape of regression that could never be caught.

/** The baseline with one stall metric sitting legitimately at zero — median AND samples. */
const zeroBase = (key) => {
  const b = clone();
  b.replayStall.medium.median[key] = 0;
  for (const r of b.replayStall.medium.runs) r[key] = 0;
  return b;
};

test('a freeze that did not exist before is a regression, not a missing percentage', () => {
  const b = zeroBase('mainProcessStallMaxMs');
  const c = JSON.parse(JSON.stringify(b));
  c.startup.median.sessionsListed = 800;                       // a genuine, well-clear win…
  c.replayStall.medium.median.mainProcessStallMaxMs = 3000;    // …paid for with a new 3s app-wide freeze
  for (const r of c.replayStall.medium.runs) r.mainProcessStallMaxMs = 3000;

  const v = verdict(b, c, { target: 'startup.median.sessionsListed', screens: {} });
  assert.equal(v.keep, false, `kept a change that introduced a 3s freeze: ${JSON.stringify(v.reasons)}`);
  const r = v.regressions.find((x) => x.path === 'replayStall.medium.median.mainProcessStallMaxMs');
  assert.ok(r, `no regression recorded: ${JSON.stringify(v.regressions)}`);
  // No fabricated percentage — the reason quotes the zero and the real number instead.
  assert.equal(r.deltaPct, null);
  assert.match(v.reasons.join(' '), /was ZERO, now 3000/);
});

// The floor is written as LITERALS here, not as ZERO_BASELINE_FLOOR: a test that quotes
// the constant it is checking moves whenever the constant moves and pins nothing. These
// two assertions bracket the value from both sides, so raising OR lowering it fails.
test('one unit of wobble around a zero baseline is tolerated; two units is a regression', () => {
  const b = zeroBase('mainProcessStallMaxMs');
  const judge = (stallMs) => {
    const c = JSON.parse(JSON.stringify(b));
    c.startup.median.sessionsListed = 800;
    c.replayStall.medium.median.mainProcessStallMaxMs = stallMs;
    return verdict(b, c, { target: 'startup.median.sessionsListed', screens: {} });
  };
  assert.equal(ZERO_BASELINE_FLOOR, 1);
  assert.equal(judge(1).keep, true, `1ms of jitter off zero was called a regression: ${judge(1).reasons.join('; ')}`);
  assert.equal(judge(2).keep, false, 'a measured cost above the floor was waved through');
});

test('a target already at zero says so instead of claiming the number is missing', () => {
  const b = clone(); const c = clone();
  b.workload.median.probe.longtaskTotalMs = 0;
  c.workload.median.probe.longtaskTotalMs = 0;
  const v = verdict(b, c, { target: 'workload.median.probe.longtaskTotalMs', screens: {} });
  assert.equal(v.keep, false);
  assert.ok(v.reasons.some((r) => r.includes('already 0')), v.reasons.join('; '));
  assert.ok(!v.reasons.some((r) => r.includes('missing in a report')), v.reasons.join('; '));
});

// ── A metric the gate could not see ──────────────────────────────────────────
// "Absent" and "did not regress" used to be the same answer. They are opposites: one is
// a cleared metric, the other is a metric nobody looked at.

test('a PRIMARY metric absent from the candidate is refused, not read as unchanged', () => {
  const c = clone(); c.startup.median.sessionsListed = 800;
  delete c.artifacts;
  const v = verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} });
  assert.equal(v.keep, false, v.reasons.join('; '));
  assert.ok(v.missing.some((m) => m.path === 'artifacts.median.open.mdLarge.openMs' && m.where === 'candidate'),
    JSON.stringify(v.missing));
});

test('an older baseline that predates a metric cannot certify it', () => {
  // The routine case, not an exotic one: re-judge a change against a baseline captured
  // before the stall phase existed and every stall metric silently stops being judged.
  const b = clone(); delete b.replayStall;
  const c = clone(); c.startup.median.sessionsListed = 800;
  const v = verdict(b, c, { target: 'startup.median.sessionsListed', screens: {} });
  assert.equal(v.keep, false, v.reasons.join('; '));
  assert.equal(v.missing.length, 3);
  assert.ok(v.reasons.some((r) => r.includes('cannot judge 3 PRIMARY metric')), v.reasons.join('; '));
  assert.ok(v.missing.every((m) => m.where === 'baseline'), JSON.stringify(v.missing));
});

test('a complete pair reports nothing missing', () => {
  const c = clone(); c.startup.median.sessionsListed = 850;
  assert.deepEqual(verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} }).missing, []);
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

// `median` has to be a whole path SEGMENT. Searching for the text ".median" anywhere in
// the path also matches the front of a longer segment like ".medianSize" or ".medianMs",
// which splits the path at the wrong dot and finds no samples — and no samples is not an
// error, it is spreadPct() reporting 0% noise, i.e. the gate deciding that every wobble
// on that metric is a proven result. Silent mis-parsing is silent maximum permissiveness.
test('runsFor matches a whole `median` segment, not any segment that starts with it', () => {
  const report = {
    history: {
      medianSize: {   // a plausible future section name whose first segment merely BEGINS with "median"
        runs: [{ resumeMs: 1400 }, { resumeMs: 1500 }],
        median: { resumeMs: 1400 },
      },
    },
  };
  assert.deepEqual(runsFor(report, 'history.medianSize.median.resumeMs'), [1400, 1500]);
  assert.ok(spreadPct(report, 'history.medianSize.median.resumeMs') > 0, 'a mis-parsed path reports 0% noise, which passes anything');
});

test('runsFor finds nothing for a path with no `median` segment at all', () => {
  assert.deepEqual(runsFor({ foo: { swap: { runs: [{ medianMs: 5 }] } } }, 'foo.swap.medianMs'), []);
});

// The premise behind validateReport's two-sample rule, stated here where spreadPct lives:
// under two samples there is no spread to measure and the answer is 0 — which downstream
// reads as "this metric never varies", so any movement clears the noise check.
test('spreadPct reports 0% for a single sample — which is why one run must never reach the gate', () => {
  assert.equal(spreadPct({ a: { runs: [5], median: 5 } }, 'a.median'), 0);
  assert.ok(spreadPct({ a: { runs: [5, 6], median: 5 } }, 'a.median') > 0);
});
