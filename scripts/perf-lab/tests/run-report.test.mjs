// scripts/perf-lab/tests/run-report.test.mjs — the orchestrator's report contract.
//
// THE POINT OF THIS FILE: compare.mjs decides keep-or-reject by reading a fixed list
// of dotted paths (PRIMARY) out of a report run.mjs wrote. If run.mjs ever renames a
// field, drops a `runs` array, or stops nesting `probe`, compare.mjs does not crash —
// `get()` just returns undefined and that metric silently stops being judged. The gate
// goes blind on exactly the regression it existed to catch, and nothing says so.
//
// So this suite builds a report through run.mjs's REAL section builders (not a
// hand-copied JSON blob, which would happily keep passing while the writer drifted)
// and asserts that every PRIMARY path resolves to a finite number AND that runsFor()
// finds at least one raw sample behind each one.
//
// Node built-ins only. Run: node --test scripts/perf-lab/tests/*.test.mjs
//   (NOT `node --test <dir>/` — on Node 26 that tries to require() the directory.)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PRIMARY, get, runsFor, spreadPct, verdict } from '../compare.mjs';
import { MEASURES as HISTORY_MEASURES, NUMERIC_KEYS, medianRun } from '../scenario-history.mjs';
import { MEASURES as ARTIFACT_MEASURES, medianRun as artifactMedian } from '../scenario-artifacts.mjs';
import { MEASURES as STALL_MEASURES, SIZES as STALL_SIZES_REAL, medianRun as stallMedian, summarizeBlame } from '../scenario-replay-stall.mjs';
import { SCREEN_NAMES } from '../screenshots.mjs';
import {
  EXIT, NETWORK_PATHS, PHASES, STALL_SIZES, USAGE,
  buildArtifactsSection, buildIdleSection, buildStartupSection, buildWorkloadSection,
  emptyReport, median, medianTree, parseArgs, phaseOfPath, primaryPathsFor,
  renderMarkdown, stemFor, validateReport,
} from '../run.mjs';

// ── Synthetic per-run objects, in the exact shapes the real modules return ────

/**
 * One cold-start run, shaped as metrics-startup.mjs's startupTable() returns it plus
 * the four fields the cold-start loop appends. Every key here exists in that module's
 * return statement — if it renames one, this fixture keeps the OLD name and the
 * PRIMARY assertions below start failing, which is the alarm we want.
 */
const startupRun = (i) => ({
  whenReady: 300 + i,
  chores: {
    rotateLog: 1, prelude: 12, installHooks: 4, hookRelay: 2, legacyCleanup: 1,
    hookReconcile: 3, promptSuggestion: 1, retentionDefault: 1, symlinkCleanup: 1,
    staleDownloads: 1, reconcileMcp: 8, announcements: 140 + i, remoteServer: 20,
    ipcPrefs: 2, themeProtocol: 3, accounts: 6,
  },
  createWindow: 40,
  createWindowAt: 350 + i,
  didFinishLoad: 700 + i,
  postWindowDone: 1200 + i,
  documentStart: 420 + i,
  modulesEvaluated: 900 + i,
  rootRender: 950 + i,
  firstPaint: 980 + i,
  firstContentfulPaint: 1000 + i,
  appMounted: 1010 + i,
  sessionsListed: 1100 + i,
  blankWindowMs: 650 + i,
  idlePssMb: 420 + i,
  idleCpuPct: 1.5 + i / 10,
  errorLines: 0,
  breakdown: [{ pid: 100 + i, type: 'main', mb: 220 }, { pid: 200 + i, type: 'renderer', mb: 200 }],
});

/** One history run, shaped as scenario-history.mjs's measureOnce() returns it. */
const historyRun = (i, { stable = true } = {}) => ({
  ipcLast10Ms: 30 + i,
  ipcAllMs: 500 + i,
  ipcAllCount: 5000,
  resumeFirstMessageMs: 200 + i,
  resumeStableMs: stable ? 1400 + i : null,
  resumeMessageCount: 5000,
  stability: stable ? 'stable' : 'timeout',
  warnings: stable ? [] : [`huge#${i}: timeline never stabilized`],
});

/** A whole history size section, built the way runHistoryScenario builds it. */
const historySize = (n, opts) => {
  const runs = Array.from({ length: n }, (_, i) => historyRun(i, opts));
  return {
    runs,
    median: medianRun(runs),
    stabilizedRuns: runs.filter((r) => r.stability === 'stable').length,
    warnings: [...new Set(runs.flatMap((r) => r.warnings))],
  };
};

/** One workload run, shaped as scenario-workload.mjs's runWorkloadScenario returns it. */
const workloadRun = (i) => ({
  sessionsCreated: 6,
  ccCreateMedianMs: 120 + i,
  nativeCreateMs: 90 + i,
  nativeFirstTokenMs: 3000 + i,
  switchMedianMs: 6 + i,
  switchP95Ms: 18 + i,
  switchPaintedMedianMs: 900 + i,
  switchPaintedP95Ms: 2400 + i,
  switchPaintedBySize: {
    // expectedEntries beside medianEntries: the label is checked against what
    // rendered, and `short` counts switches that never reached it.
    huge: { n: 3, medianMs: 3100 + i, p95Ms: 3600 + i, medianEntries: 7000, expectedEntries: 7000, short: 0, unsettled: 0 },
    medium: { n: 3, medianMs: 1200 + i, p95Ms: 1500 + i, medianEntries: 5000, expectedEntries: 5000, short: 0, unsettled: 0 },
    small: { n: 3, medianMs: 90 + i, p95Ms: 120 + i, medianEntries: 100, expectedEntries: 100, short: 0, unsettled: 0 },
    // The control: an empty conversation renders nothing and switching to it is
    // instant. The first draft of the settle rule required a NON-ZERO count, so
    // this case could never settle and reported the 20s cap — the control became
    // the slowest number in the table. Pinned here so that cannot come back.
    empty: { n: 3, medianMs: 20 + i, p95Ms: 35 + i, medianEntries: 0, expectedEntries: 0, short: 0, unsettled: 0 },
    native: { n: 6, medianMs: 30 + i, p95Ms: 40 + i, medianEntries: 2, expectedEntries: null, short: 0, unsettled: 0 },
  },
  unsettledSwitches: 0,
  switches: [],
  streamedInto: ['medium', 'small'],
  streamedTurnsBySize: { medium: 260, small: 260 },
  sessionSizes: { 'cc-0': 'huge', 'cc-1': 'medium', 'cc-2': 'small', 'cc-3': 'empty', 'native-0': 'native', 'native-1': 'native' },
  warnings: [],
  clickSwitches: 40,
  ipcSwitches: 0,
  streamedLines: 800,
  probe: { longtaskCount: 12 + i, longtaskTotalMs: 900 + i, longtaskMaxMs: 210 + i, frameGapCount: 30 + i, frameGapMaxMs: 120 + i },
  cpuDuringPct: 35 + i,
  pssAfterMb: 900 + i,
  pssBreakdown: [{ pid: 300 + i, type: 'renderer', mb: 500 }],
  sessionIds: ['a', 'b', 'c', 'd', 'e', 'f'],
});

/** One replay-stall run, shaped as scenario-replay-stall.mjs's measureOnce() returns it. */
const stallRun = (i, { stable = true } = {}) => ({
  ipcMedianMs: 4 + i,
  ipcP95Ms: 60 + i,
  ipcMaxMs: 3300 + i,
  ipcOver250ms: 5 + i,
  ipcOver1000ms: 2,
  ipcTotalStallMs: 4200 + i,
  ipcPings: 400,
  ipcMissedTicks: 30 + i,
  ipcMaxPingGapMs: 3300 + i,
  mainProcessStallMs: 3000 + i,
  mainProcessStallMaxMs: 2900 + i,
  rendererStallMs: 1200 + i,
  rendererStallMaxMs: 1100 + i,
  rendererLongtaskCount: 40 + i,
  rendererLongtaskTotalMs: 5000 + i,
  rendererLongtaskMaxMs: 3200 + i,
  renderedEntries: 5000,
  elapsedMs: 20000 + i,
  stability: stable ? 'stable' : 'timeout',
  warnings: stable ? [] : [`stall#${i}: timeline never stabilized`],
});

/** A whole stall size section, built the way runReplayStallScenario builds it. */
const stallSize = (n, opts) => {
  const runs = Array.from({ length: n }, (_, i) => stallRun(i, opts));
  const med = stallMedian(runs);
  return {
    runs,
    median: med,
    blame: summarizeBlame(med.mainProcessStallMs, med.rendererStallMs),
    stabilizedRuns: runs.filter((r) => r.stability === 'stable').length,
    warnings: [...new Set(runs.flatMap((r) => r.warnings))],
  };
};

/** One artifacts run, shaped as scenario-artifacts.mjs's runArtifactScenario returns it. */
const artifactRun = (i) => ({
  open: {
    codeSmall: { ok: true, openMs: 40 + i },
    codeLarge: { ok: true, openMs: 320 + i },
    mdSmall: { ok: true, openMs: 55 + i, fences: 4 },
    mdLarge: { ok: true, openMs: 1400 + i, fences: 90 },
    htmlSmall: { ok: true, openMs: 120 + i },
  },
  htmlNav: {
    ok: true,
    swap: { count: 4, medianMs: 210 + i, p95Ms: 400 + i, maxMs: 420 + i },
    swapSmall: { count: 2, medianMs: 90 + i, p95Ms: 110 + i, maxMs: 115 + i },
    swapLarge: { count: 2, medianMs: 330 + i, p95Ms: 500 + i, maxMs: 510 + i },
  },
  typing: {
    codeSmall: { keystroke: { count: 30, medianMs: 12 + i, p95Ms: 30 + i, maxMs: 40 + i } },
    codeLarge: { keystroke: { count: 30, medianMs: 46 + i, p95Ms: 180 + i, maxMs: 260 + i } },
  },
  copy: { ok: true, clickToCopiedMs: 25 + i },
  probe: { longtaskCount: 20 + i, longtaskTotalMs: 2100 + i, longtaskMaxMs: 380 + i },
  ipcSumOfSteps: { pings: 900, totalStallMs: 700 + i, over250ms: 2, over1000ms: 0, maxMs: 340 + i },
  warnings: [],
});

/** A complete, clean report — assembled ONLY through run.mjs's real builders. */
function completeReport({ runs = 5, historyRepeats = 5, workloadRepeats = 3, stallRepeats = 3, artifactRepeats = 3 } = {}) {
  const cold = Array.from({ length: runs }, (_, i) => startupRun(i));
  const wruns = Array.from({ length: workloadRepeats }, (_, i) => workloadRun(i));
  const report = emptyReport({ label: 'contract', timestamp: '2026-08-26T09:30:00.000Z' });
  Object.assign(report, { sha: 'abcdef1234567890', branch: 'master', dirty: '' });
  report.startup = buildStartupSection(cold);
  report.idle = buildIdleSection(cold);
  report.history = {
    small: historySize(historyRepeats),
    medium: historySize(historyRepeats),
    huge: historySize(historyRepeats),
  };
  report.workload = buildWorkloadSection(wruns);
  report.replayStall = Object.fromEntries(STALL_SIZES.map((s) => [s, stallSize(stallRepeats)]));
  const aruns = Array.from({ length: artifactRepeats }, (_, i) => artifactRun(i));
  // Through run.mjs's REAL builder, not a hand-assembled `{ runs, median }`: the builder
  // is what carries `ipcSumOfSteps.pings` into the median, and a fixture that assembled
  // the section itself would keep passing while the writer stopped carrying it.
  report.artifacts = buildArtifactsSection(aruns, artifactMedian);
  // The REAL MEASURES exports, not hand-copied literals: if a scenario drops or
  // renames its descriptor, this fixture fails to build rather than quietly
  // rendering a report with no configuration section.
  report.measures = { history: HISTORY_MEASURES, stall: STALL_MEASURES, artifacts: ARTIFACT_MEASURES };
  report.errors = { coldStarts: cold.map((r) => r.errorLines), scenarioBoot: 0, stallBoot: 0, artifactsBoot: 0 };
  report.screens = { dir: '/tmp/shots', names: [...SCREEN_NAMES], failures: [] };
  return report;
}

const ALL = new Set(PHASES);

// ── The contract ─────────────────────────────────────────────────────────────

describe('compare.mjs PRIMARY contract', () => {
  it('every PRIMARY path resolves to a finite number in a report run.mjs would write', () => {
    const report = completeReport();
    const broken = PRIMARY.filter((p) => {
      const v = get(report, p);
      return typeof v !== 'number' || !Number.isFinite(v);
    });
    assert.deepEqual(broken, [], `PRIMARY paths that did not resolve: ${broken.join(', ')}`);
    // 12 -> 19 on 2026-08-27, when the stall and artifacts phases were wired into
    // run.mjs (3 stall paths + 4 artifact paths). Bumping this number is not a chore:
    // it is the moment to check that the report builder above actually produces the
    // new paths, which is what the assertion on the line before just proved.
    // 19 -> 20 on 2026-08-27: workload.median.switchPaintedP95Ms. The existing
    // switchP95Ms stops when the pane container swaps, which is not the switch a
    // user sees; both are now judged so a change that speeds the container while
    // the messages arrive just as late cannot read as a win.
    // Still 20 later that day, but switchPaintedP95Ms was SWAPPED for
    // workload.median.switchPaintedBySize.huge.medianMs: the pooled p95 was the
    // maximum of ~18 samples, a third of them the empty control and two buckets
    // at the 20 s cap; the huge bucket is the case Destin lives in and moved 4%
    // run to run.
    assert.equal(PRIMARY.length, 20, 'PRIMARY changed size — re-check that run.mjs still produces every path');
    assert.ok(PRIMARY.includes('workload.median.switchPaintedBySize.huge.medianMs'), 'the clean huge-bucket switch metric must be judged');
    assert.ok(!PRIMARY.includes('workload.median.switchPaintedP95Ms'), 'the pooled p95 is contaminated by the control and by streamed-into buckets');
  });

  it('every PRIMARY path has per-run samples behind it (runsFor finds the sibling runs array)', () => {
    const report = completeReport();
    for (const p of PRIMARY) {
      const samples = runsFor(report, p);
      assert.ok(samples.length >= 1, `${p}: runsFor() found no samples — spreadPct() would report 0% noise and let jitter pass as a proven win`);
      assert.ok(samples.every((s) => typeof s === 'number' && Number.isFinite(s)), `${p}: a sample was not a finite number`);
    }
  });

  it('sample counts match the configured run counts, so spread is measured over real repeats', () => {
    const report = completeReport({ runs: 5, historyRepeats: 5, workloadRepeats: 3 });
    assert.equal(runsFor(report, 'startup.median.sessionsListed').length, 5);
    assert.equal(runsFor(report, 'idle.pssMb.median').length, 5);
    assert.equal(runsFor(report, 'idle.cpuPct.median').length, 5);
    assert.equal(runsFor(report, 'history.medium.median.resumeStableMs').length, 5);
    assert.equal(runsFor(report, 'history.huge.median.ipcLast10Ms').length, 5);
    assert.equal(runsFor(report, 'workload.median.switchP95Ms').length, 3);
    assert.equal(runsFor(report, 'workload.median.probe.longtaskTotalMs').length, 3, 'nested probe.* samples must survive into workload.runs[]');
  });

  it('spreadPct is computable for every PRIMARY path (the gate is spread-aware or it is nothing)', () => {
    const report = completeReport();
    for (const p of PRIMARY) {
      const s = spreadPct(report, p);
      assert.ok(Number.isFinite(s), `${p}: spreadPct returned ${s}`);
    }
  });

  it('two such reports run end-to-end through verdict() without a missing-path reason', () => {
    const base = completeReport();
    const cand = completeReport();
    const v = verdict(base, cand, { target: 'startup.median.sessionsListed' });
    assert.ok(!v.reasons.some((r) => r.includes('missing in a report')), `verdict reported a missing path: ${v.reasons.join('; ')}`);
    assert.equal(typeof v.target.deltaPct, 'number');
  });

  it('every PRIMARY path is owned by a phase run.mjs knows how to produce', () => {
    const orphans = PRIMARY.filter((p) => phaseOfPath(p) === null);
    assert.deepEqual(orphans, [], `PRIMARY paths no --only phase produces: ${orphans.join(', ')}`);
    assert.equal(primaryPathsFor(ALL).length, PRIMARY.length);
    assert.deepEqual(primaryPathsFor(new Set(['workload'])), PRIMARY.filter((p) => p.startsWith('workload.')));
  });
});

describe('validateReport', () => {
  it('passes a complete report with every phase requested', () => {
    assert.deepEqual(validateReport(completeReport(), ALL), []);
  });

  it('flags every PRIMARY path when the report is empty', () => {
    const problems = validateReport(emptyReport(), ALL);
    for (const p of PRIMARY) {
      assert.ok(problems.some((x) => x.includes(`"${p}"`)), `no problem mentioned ${p}`);
    }
  });

  it('ignores a phase that --only deliberately skipped', () => {
    const report = completeReport();
    report.workload = null;
    report.history = null;
    report.screens = null;
    assert.deepEqual(validateReport(report, new Set(['startup'])), []);
  });

  it('catches a median with no samples behind it — the blind-gate case', () => {
    const report = completeReport();
    report.startup.runs = [];   // median survives, evidence does not
    const problems = validateReport(report, new Set(['startup']));
    assert.ok(problems.some((p) => p.includes('NO per-run samples')), problems.join('; '));
    // …and it must name the still-healthy-looking median, since that is what makes
    // this case sneaky: the report reads fine and the gate is silently unarmed.
    assert.ok(problems.some((p) => p.includes('startup.median.sessionsListed') && p.includes('has a median')), problems.join('; '));
  });

  it('catches a renamed field (the drift this whole file exists for)', () => {
    const report = completeReport();
    for (const r of report.startup.runs) { r.sessionsReady = r.sessionsListed; delete r.sessionsListed; }
    report.startup.median.sessionsReady = report.startup.median.sessionsListed;
    delete report.startup.median.sessionsListed;
    const problems = validateReport(report, new Set(['startup']));
    assert.ok(problems.some((p) => p.includes('startup.median.sessionsListed')), problems.join('; '));
  });

  it('refuses a huge history that never stabilized rather than reading null as fast', () => {
    const report = completeReport();
    report.history.huge = historySize(5, { stable: false });
    assert.equal(report.history.huge.median.resumeStableMs, null);
    const problems = validateReport(report, new Set(['history']));
    assert.ok(problems.some((p) => p.includes('history.huge.median.resumeStableMs')), problems.join('; '));
  });

  it('flags a screen that was never captured', () => {
    const report = completeReport();
    report.screens.names = SCREEN_NAMES.slice(0, 2);
    const problems = validateReport(report, new Set(['shots']));
    assert.ok(problems.some((p) => p.includes('UNREVIEWED')), problems.join('; '));
  });

  // The stall phase's entire value is saying WHICH thread froze. If the renderer
  // long-task observer never attaches, attributeStalls reports blame null rather than
  // charging everything to the main process — and a null that slipped through the gate
  // would send the next session optimizing a thread that was never the problem.
  it('refuses a stall size with no thread attribution rather than reading null as "main process"', () => {
    const report = completeReport();
    report.replayStall.medium.blame = null;
    const problems = validateReport(report, new Set(['stall']));
    assert.ok(
      problems.some((p) => p.includes('replayStall.medium') && p.includes('attribution')),
      problems.join('; '),
    );
  });

  // Same shape as the history-never-stabilized case above: the artifacts scenario
  // still returns a run when the keystroke meter fails to arm, with the timings null.
  // Null here means "not measured", and it must never be read as a fast editor.
  it('refuses an artifacts run whose keystroke meter never armed rather than reading null as fast', () => {
    const report = completeReport();
    report.artifacts.median.typing.codeLarge.keystroke.medianMs = null;
    const problems = validateReport(report, new Set(['artifacts']));
    assert.ok(problems.some((p) => p.includes('UNKNOWN, not zero')), problems.join('; '));
  });

  // A report built from ONE run of each phase looks completely healthy: every median is
  // a real number and every path resolves. What it does not have is any evidence of how
  // much a number moves between identical runs — and compare.mjs answers that question
  // with 0%, which reads as "this metric never wobbles" and lets any movement at all
  // through as a proven win. So a single-run report does not weaken the gate, it turns
  // the noise check off, and the report must refuse rather than look fine.
  it('refuses a single-run report: one sample makes the noise gate blind, not merely thin', () => {
    const report = completeReport({ runs: 1 });
    // The premise, stated out loud: the median is perfectly healthy and the spread is 0.
    assert.equal(typeof get(report, 'startup.median.sessionsListed'), 'number');
    assert.equal(spreadPct(report, 'startup.median.sessionsListed'), 0);

    const problems = validateReport(report, new Set(['startup']));
    assert.ok(
      problems.some((p) => p.includes('startup.median.sessionsListed') && p.includes('only 1 sample')),
      problems.join('; '),
    );
    // …and it must say WHAT that costs, not just that the count is low.
    assert.ok(problems.some((p) => p.includes('DISARMED')), problems.join('; '));
  });

  it('still accepts two runs — two is the smallest number that can show a spread', () => {
    assert.deepEqual(validateReport(completeReport({ runs: 2 }), new Set(['startup'])), []);
  });

  // The artifacts IPC stall total is a SUM seeded at zero over probes that are SKIPPED
  // when they error. Fail every probe and the total is 0 — byte-for-byte identical to a
  // run where the app never stalled, and compare.mjs would read it as the best score
  // achievable. `pings` counts the probe replies that actually came back, so it is the
  // only field that separates "no stall" from "no measurement".
  it('refuses a 0 ms artifacts stall total that no probe ever reported', () => {
    const report = completeReport();
    for (const r of report.artifacts.runs) r.ipcSumOfSteps = { pings: 0, totalStallMs: 0, over250ms: 0, over1000ms: 0, maxMs: 0 };
    report.artifacts = buildArtifactsSection(report.artifacts.runs, artifactMedian);
    // The metric itself still looks like a flawless result — that is the whole problem.
    assert.equal(get(report, 'artifacts.median.ipcSumOfSteps.totalStallMs'), 0);

    const problems = validateReport(report, new Set(['artifacts']));
    assert.ok(problems.some((p) => p.includes('UNMEASURED, not because the app stayed responsive')), problems.join('; '));
  });

  it('the ping count reaches the report at all, or the check above can never fire', () => {
    assert.ok(get(completeReport(), 'artifacts.median.ipcSumOfSteps.pings') > 0);
  });
});

describe('every scenario declares what it measures', () => {
  // WHY THIS SUITE EXISTS. Three wrong conclusions in this project came from a
  // number measured in a configuration where the defect could not appear:
  // idle at zero sessions; the freeze attributed from a raw total; switching
  // between empty conversations. None failed loudly — each returned a clean
  // number. The MEASURES descriptors are the anti-recurrence guard, and a guard
  // nothing pins is a guard that quietly disappears.
  //
  // scenario-workload.mjs is loaded DYNAMICALLY here for the same reason run.mjs
  // loads it lazily: a static import would pull the whole scenario tree into
  // every unit test. It is included because a rename there was the one mutation
  // the earlier tests did not catch.
  const load = async () => Object.fromEntries(await Promise.all(
    ['workload', 'replay-stall', 'artifacts', 'history'].map(async (n) => [n, (await import(`../scenario-${n}.mjs`)).MEASURES]),
  ));

  it('exports MEASURES from all four scenario modules', async () => {
    for (const [name, m] of Object.entries(await load())) {
      assert.ok(m && typeof m === 'object', `scenario-${name}.mjs does not export MEASURES`);
    }
  });

  it('every descriptor names its question, its configuration and its blind spots', async () => {
    for (const [name, m] of Object.entries(await load())) {
      assert.equal(typeof m.scenario, 'string', `${name}: no scenario name`);
      assert.ok(m.question?.endsWith('?'), `${name}: question must be a question`);
      assert.ok(Array.isArray(m.configuration) && m.configuration.length > 0, `${name}: no configuration listed`);
      // Blind spots are the load-bearing half. A scenario claiming to be blind to
      // nothing is making the exact claim that has been wrong three times.
      assert.ok(Array.isArray(m.blindTo) && m.blindTo.length > 0, `${name}: claims no blind spots`);
      assert.ok(m.clocks && Object.keys(m.clocks).length > 0, `${name}: does not say where its clocks start and stop`);
    }
  });

  // The specific regression that motivated the whole change: the workload scenario
  // used to switch between six sessions created FRESH (i.e. empty) and report
  // switchP95Ms 118ms as if it meant switching between real conversations.
  it('workload states that its sessions are resumed, and keeps an empty control', async () => {
    const m = (await load()).workload;
    const text = m.configuration.join(' ').toLowerCase();
    assert.match(text, /resumed/, 'workload no longer says its sessions are resumed — if that changed, the switch numbers are measuring empty conversations again');
    assert.match(text, /empty/, 'workload no longer keeps an EMPTY control session, so there is nothing to compare a loaded switch against');
  });

  it('workload distinguishes the two switch clocks', async () => {
    const c = (await load()).workload.clocks;
    assert.match(c.switchMedianMs, /container|pane/i);
    assert.match(c.switchMedianMs, /NOT wait|does not wait/i);
    assert.match(c.switchPaintedMedianMs, /on screen|painted/i);
  });
});

describe('stall phase wiring', () => {
  // run.mjs duplicates the size list rather than importing it (the scenario modules
  // load lazily, and validateReport is a pure function the tests call with no app
  // present). This is the guard that duplication cannot drift.
  it('run.mjs STALL_SIZES matches scenario-replay-stall.mjs SIZES exactly', () => {
    assert.deepEqual(STALL_SIZES, [...STALL_SIZES_REAL]);
  });

  it('every stall and artifacts PRIMARY path is owned by its own phase', () => {
    for (const p of PRIMARY.filter((x) => x.startsWith('replayStall.'))) {
      assert.equal(phaseOfPath(p), 'stall', `${p} is not owned by the stall phase`);
    }
    for (const p of PRIMARY.filter((x) => x.startsWith('artifacts.'))) {
      assert.equal(phaseOfPath(p), 'artifacts', `${p} is not owned by the artifacts phase`);
    }
  });

  // A `—` in the summary is how a missing number reaches a human. For attribution the
  // blank is worse than useless, so the renderer prints an explicit phrase instead.
  it('renderMarkdown names an unavailable attribution instead of leaving it blank', () => {
    const report = completeReport();
    report.replayStall.medium.blame = null;
    const md = renderMarkdown(report, 'test-stem');
    assert.match(md, /attribution unavailable/);
  });

  it('renderMarkdown renders a row for every stall size and for the artifact legs', () => {
    const md = renderMarkdown(completeReport(), 'test-stem');
    for (const size of STALL_SIZES) assert.match(md, new RegExp(`stall\\.${size}`));
    for (const row of ['artifacts.open markdown', 'artifacts.keystroke large', 'artifacts.html swap', 'artifacts IPC stall']) {
      assert.ok(md.includes(row), `summary is missing the "${row}" row`);
    }
  });
});

describe('medianTree', () => {
  it('recurses into nested plain objects', () => {
    const t = medianTree([{ a: 1, n: { b: 10 } }, { a: 3, n: { b: 30 } }, { a: 5, n: { b: 50 } }]);
    assert.deepEqual(t, { a: 3, n: { b: 30 } });
  });

  it('drops arrays instead of recursing into them and inventing 0/1/2 keys', () => {
    const t = medianTree([{ a: 1, list: [1, 2] }, { a: 3, list: [3] }]);
    assert.deepEqual(Object.keys(t), ['a']);
  });

  it('keeps a key that was null everywhere as null, never 0', () => {
    assert.deepEqual(medianTree([{ a: null }, { a: null }]), { a: null });
  });

  it('ignores nulls when some runs did produce a number', () => {
    assert.equal(medianTree([{ a: null }, { a: 4 }, { a: 6 }]).a, 6);
  });

  it('matches scenario-history medianRun on the keys they share', () => {
    const runs = [historyRun(0), historyRun(1), historyRun(2)];
    const mine = medianTree(runs.map(({ stability, warnings, ...rest }) => rest));
    const theirs = medianRun(runs);
    for (const k of NUMERIC_KEYS) assert.equal(mine[k], theirs[k], `${k} disagreed`);
  });
});

describe('median', () => {
  it('returns null (not NaN) for a set with no numbers', () => {
    assert.equal(median([null, undefined, 'x']), null);
    assert.equal(median([]), null);
  });
  it('ignores non-finite values', () => {
    assert.equal(median([NaN, Infinity, 5]), 5);
  });
});

describe('parseArgs', () => {
  it('defaults every option', () => {
    const c = parseArgs([]);
    assert.equal(c.runs, 5);
    assert.equal(c.historyRepeats, 5);
    assert.equal(c.workloadRepeats, 3);
    assert.equal(c.stallRepeats, 3);
    assert.equal(c.artifactRepeats, 3);
    assert.equal(c.maxMinutes, 90);
    assert.deepEqual([...c.only].sort(), [...PHASES].sort());
    assert.equal(c.dryRun, false);
  });

  it('reads values and flags', () => {
    const c = parseArgs(['--runs', '2', '--only', 'startup,shots', '--label', 'E1 blur', '--force-build', '--dry-run']);
    assert.equal(c.runs, 2);
    assert.deepEqual([...c.only].sort(), ['shots', 'startup']);
    assert.equal(c.label, 'E1 blur');
    assert.equal(c.forceBuild, true);
    assert.equal(c.dryRun, true);
  });

  it('rejects a typo rather than silently ignoring it and wasting a 90-minute run', () => {
    assert.throws(() => parseArgs(['--run', '2']), /unknown option --run/);
    assert.throws(() => parseArgs(['--only', 'startup,startpu']), /unknown phase\(s\) startpu/);
    assert.throws(() => parseArgs(['--runs']), /--runs needs a value/);
    assert.throws(() => parseArgs(['--runs', '0']), /whole number >= 1/);
    assert.throws(() => parseArgs(['--runs', '2.5']), /whole number >= 1/);
    assert.throws(() => parseArgs(['5']), /unexpected argument/);
  });

  it('resolves checkout and out to absolute paths', () => {
    const c = parseArgs(['--out', 'perf-reports'], { root: '/w' });
    assert.ok(c.out.startsWith('/'));
    assert.equal(parseArgs([], { root: '/w' }).checkout, '/w/worktrees/perf-lab');
  });

  it('USAGE names every flag it accepts', () => {
    for (const f of [...PHASES]) assert.ok(USAGE.includes(f), `USAGE never mentions phase ${f}`);
    for (const f of ['--runs', '--only', '--dry-run', '--max-minutes', '--force-build', '--label', '--out', '--checkout', '--history-repeats', '--workload-repeats']) {
      assert.ok(USAGE.includes(f), `USAGE never mentions ${f}`);
    }
  });
});

describe('stemFor', () => {
  it('builds date-time-sha, with a sanitized label', () => {
    assert.equal(stemFor({ timestamp: '2026-08-26T09:30:00.000Z', sha: 'abcdef1234', label: '' }), '2026-08-26-0930-abcdef1');
    assert.equal(stemFor({ timestamp: '2026-08-26T09:30:00.000Z', sha: 'abcdef1234', label: 'E1 blur/off' }), '2026-08-26-0930-abcdef1-e1-blur-off');
  });
  it('never emits a trailing dash from a label that sanitizes away', () => {
    assert.equal(stemFor({ timestamp: '2026-08-26T09:30:00.000Z', sha: 'abcdef1234', label: '///' }), '2026-08-26-0930-abcdef1');
  });
  it('does not produce a path separator from a hostile label', () => {
    const stem = stemFor({ timestamp: '2026-08-26T09:30:00.000Z', sha: 'abcdef1234', label: '../../etc/passwd' });
    assert.ok(!stem.includes('/'), stem);
    assert.ok(!stem.includes('..'), stem);
  });
});

describe('renderMarkdown', () => {
  const md = renderMarkdown(completeReport(), '2026-08-26-0930-abcdef1');

  it('has a row for every startup key the plan requires', () => {
    for (const k of ['whenReady', 'createWindowAt', 'blankWindowMs', 'didFinishLoad', 'firstContentfulPaint', 'appMounted', 'sessionsListed', 'postWindowDone']) {
      assert.ok(md.includes(`| startup.${k}`), `no row for startup.${k}`);
    }
  });

  it('has a row for every chore, with the network-bound ones marked', () => {
    for (const c of ['rotateLog', 'prelude', 'installHooks', 'ipcPrefs', 'themeProtocol', 'accounts']) {
      assert.ok(md.includes(`| chore.${c}`), `no row for chore.${c}`);
    }
    assert.ok(md.includes('| chore.announcements (network)'), 'announcements must be marked (network)');
    assert.ok(md.includes('| startup.postWindowDone (network)'), 'postWindowDone contains the release check');
    for (const p of NETWORK_PATHS) assert.ok(phaseOfPath(p) === 'startup', `${p} should be a startup path`);
  });

  it('has idle, per-size history and every workload row', () => {
    assert.ok(md.includes('| idle PSS |'));
    assert.ok(md.includes('| idle CPU |'));
    for (const s of ['small', 'medium', 'huge']) assert.ok(md.includes(`| history.${s} `), `no history.${s} row`);
    for (const row of ['switch, pane swapped', 'switch, messages on screen', 'long tasks', 'frame gaps > 40ms', 'native first token', 'CPU during workload', 'PSS after workload']) {
      assert.ok(md.includes(row), `no "${row}" row`);
    }
    // The per-size breakdown is the comparison the resumed-sessions change exists
    // to make: 'empty' is the control, 'huge' is the case Destin lives in.
    for (const size of ['huge', 'medium', 'small', 'empty']) {
      assert.ok(md.includes(`switch into a '${size}' conversation`), `no per-size switch row for '${size}'`);
    }
    // A capped bucket must SAY it is capped. Measured 2026-08-27: three of five
    // buckets were sitting at the 20s cap and the table presented them as
    // ordinary medians, which made the empty control look like the slowest case.
    const capped = renderMarkdown((() => {
      const rep = completeReport();
      rep.workload.median.switchPaintedBySize.medium.unsettled = 2;
      return rep;
    })(), 'test-stem');
    assert.match(capped, /hit the 20s CAP/, 'a bucket at the cap is rendered as if it were a measurement');
    // A bucket whose pane never showed the whole conversation has an UNVERIFIED
    // label. Measured 2026-08-27: "medium, 319 entries, 1.4 s" was an empty session
    // in the wrong project folder being filled by the streamer.
    const short = renderMarkdown((() => {
      const rep = completeReport();
      rep.workload.median.switchPaintedBySize.medium.short = 3;
      return rep;
    })(), 'test-stem');
    assert.match(short, /never showed the whole conversation, so this label is NOT verified/);
    assert.match(md, /of 7000 expected/, 'the expected count must be printed beside what rendered');
    assert.match(md, /streamed into, during the switches \| medium, small/, 'who was streamed into must be a recorded fact in the summary');
  });

  // The anti-recurrence guard: three wrong conclusions in this project came from a
  // number measured in a configuration where the defect could not appear, and every
  // one of them returned a clean number rather than failing. The configuration now
  // ships beside the numbers, and this pins that it actually reaches the summary.
  it('carries each scenario\'s configuration beside its numbers', () => {
    assert.ok(md.includes('## What was actually measured'), 'no configuration section');
    assert.ok(md.includes('**Question:**'), 'no question line');
    assert.ok(md.includes('**Blind to:**'), 'no blind-spot list');
    assert.ok(md.includes('Where each clock starts and stops'), 'no clock definitions');
  });

  it('footers carry noise and the desktop.log ERROR counts', () => {
    assert.ok(md.includes('noise: load'));
    assert.ok(md.includes('errors (desktop.log "level":"ERROR" lines)'));
  });

  it('renders a missing number as an em dash rather than NaN or undefined', () => {
    const md2 = renderMarkdown(emptyReport(), 'stem');
    assert.ok(md2.includes('| —'), 'expected em-dash cells');
    assert.ok(!/NaN|undefined|\bnull\b/.test(md2), md2);
  });

  it('surfaces history warnings so a null resumeStableMs cannot read as instant', () => {
    const r = completeReport();
    r.history.huge = historySize(5, { stable: false });
    const out = renderMarkdown(r, 'stem');
    assert.ok(out.includes('## History warnings'), out);
    assert.ok(out.includes('never stabilized'), out);
  });

  it('stamps an aborted run and lists the incomplete reasons', () => {
    const r = emptyReport();
    r.aborted = '--max-minutes 45 exceeded';
    r.incomplete = validateReport(r, ALL);
    const out = renderMarkdown(r, 'stem');
    assert.ok(out.includes('**ABORTED:**'), out);
    assert.ok(out.includes('## Incomplete'), out);
  });
});

describe('exit codes', () => {
  it('are distinct, so a wrapper can tell timeout from incomplete from error', () => {
    const vals = Object.values(EXIT);
    assert.equal(new Set(vals).size, vals.length);
    assert.equal(EXIT.OK, 0);
  });
});
