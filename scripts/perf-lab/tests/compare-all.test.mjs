// Acceptance A4 + A6: compareAll shows every metric on both sides with variability, worst
// case and a status; no aggregate score. Includes the known-change control and A/A checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAll, renderComparisonMarkdown, metricRow, PRIMARY } from '../compare.mjs';
import { validLegacyReport } from './legacy-fixture.mjs';
import { STALL_MEASUREMENT_REVISION } from '../stall-attribution.mjs';
import { MEASURES as TERMINAL_MEASURES } from '../scenario-terminal.mjs';
import { sampleIdentity } from '../identity.mjs';

const TERMINAL = 'terminal.median.switchPaintedMedianMs';
const machine = { cpu: 'CPU', ramGb: 32, kernel: '6', node: 'v26', renderer: { source: 'SystemInfo', glRenderer: 'llvmpipe', accelerated: false, featureStatus: { gpu_compositing: 'disabled_software' }, error: null } };
const noise = { loadAvgBefore: 0.5, machineBusyPctBefore: 1, maxLoadAvgAccepted: 1, maxBusyPctAccepted: 2, discardedRuns: 0 };

// A comparable terminal-phase report whose switchPaintedMedianMs runs are `runs` (median = middle).
function terminalReport(runs) {
  const r = { stallMeasurementRevision: STALL_MEASUREMENT_REVISION, machine: structuredClone(machine), noise: { ...noise }, aborted: null, incomplete: [],
    measures: { terminal: TERMINAL_MEASURES }, ...validLegacyReport(['terminal']) };
  setMetric(r, runs);
  return r;
}
function setMetric(r, runs) {
  r.terminal.runs.forEach((row, i) => { row.switchPaintedMedianMs = runs[i]; });
  r.terminal.median.switchPaintedMedianMs = [...runs].sort((a, b) => a - b)[Math.floor(runs.length / 2)];
}
const row = (res, path = TERMINAL) => res.rows.find((r) => r.path === path);
const opts = { paths: [TERMINAL, 'terminal.median.longtaskMaxMs'] };

test('A/A: the same candidate twice is inconclusive, never improved or regressed', () => {
  const a1 = terminalReport([100, 104, 102]), a2 = terminalReport([101, 99, 103]);
  const res = compareAll(a1, a2, opts);
  assert.equal(res.comparability.comparable, true, res.comparability.reasons.join('; '));
  assert.equal(row(res).status, 'inconclusive');
  assert.equal(res.counts.regressed ?? 0, 0);
  assert.equal(res.counts.improved ?? 0, 0);
});

test('known-change control: an injected 400 ms delay is flagged regressed and labelled as a control', () => {
  const a = terminalReport([100, 104, 102]);
  const b = terminalReport([502, 504, 503]);
  b.identity.control = { kind: 'injected-delay', scenario: 'terminal', delayMs: 400, affects: TERMINAL, notARealCandidate: true };
  const res = compareAll(a, b, { ...opts, evidence: { a: '/r/a.json', b: '/r/b.json' } });
  assert.equal(res.comparability.comparable, true, 'a labelled control compares against a normal run');
  const r = row(res);
  assert.equal(r.status, 'regressed');
  assert.equal(r.a, 102); assert.equal(r.b, 503); assert.equal(r.absDelta, 401);
  assert.ok(r.deltaPct > 390 && r.deltaPct < 395);
  const md = renderComparisonMarkdown(res);
  assert.match(md, /CONTROL RUN \(B\).*400 ms/);
  assert.match(md, /\/r\/a\.json/);
});

test('a clear win is improved; a change inside combined noise is inconclusive; one sample cannot rank', () => {
  const a = terminalReport([100, 100, 100]);
  assert.equal(row(compareAll(a, terminalReport([50, 50, 50]), opts)).status, 'improved');
  const noisyA = terminalReport([100, 110, 120]), noisyB = terminalReport([105, 115, 125]);
  assert.equal(row(compareAll(noisyA, noisyB, opts)).status, 'inconclusive');
  const single = metricRow({ path: 'p', a: 100, b: 200, aSamples: [100], bSamples: [200] });
  assert.equal(single.status, 'inconclusive');
  assert.match(single.note, /fewer than 2 samples/);
});

test('missing on either side is "missing" with null values, never zero', () => {
  const a = terminalReport([100, 100, 100]);
  const b = terminalReport([100, 100, 100]);
  delete b.terminal.median.switchPaintedMedianMs;
  const res = compareAll(a, b, opts);
  const r = row(res);
  assert.equal(r.status, 'missing'); assert.equal(r.b, null); assert.equal(r.absDelta, null); assert.equal(r.deltaPct, null);
  assert.match(r.note, /absent in B/);
  const nullSide = metricRow({ path: 'p', a: null, b: 5 });
  assert.equal(nullSide.status, 'missing'); assert.equal(nullSide.a, null);
  assert.equal(metricRow({ path: 'p', a: undefined, b: undefined }).status, 'missing');
  assert.equal(res.counts.missing >= 1, true);
});

test('worst cases are preserved: a frozen repeat shows as a tail regression even when medians hold', () => {
  const a = terminalReport([100, 100, 101]);
  const b = terminalReport([100, 100, 900]);
  const res = compareAll(a, b, opts);
  const r = row(res);
  assert.equal(r.aWorst, 101); assert.equal(r.bWorst, 900); assert.equal(r.worstDelta, 799);
  assert.ok(r.tailRegression, 'legacyTailRegressions flags the raw repeat');
  assert.deepEqual(res.tailRegressions, [TERMINAL]);
  assert.match(renderComparisonMarkdown(res), /TAIL REGRESSION/);
});

test('incompatible runs are marked incomparable with values shown but not ranked', () => {
  const a = terminalReport([100, 100, 100]);
  const b = terminalReport([500, 500, 500]);
  b.identity = sampleIdentity(); b.identity.execution.terminalRepeats = 9;
  const res = compareAll(a, b, opts);
  assert.equal(res.comparability.comparable, false);
  assert.equal(row(res).status, 'incomparable');
  assert.equal(row(res).b, 500);
  assert.match(renderComparisonMarkdown(res), /Comparable: NO/);
  assert.equal(res.counts.regressed, undefined);
});

test('required-lane failures are listed verbatim and no aggregate score exists', () => {
  const a = terminalReport([100, 100, 100]);
  const b = terminalReport([100, 100, 100]);
  b.incomplete = ['terminal: switching never settled']; b.aborted = null;
  const res = compareAll(a, b, opts);
  assert.ok(res.laneFailures.includes('B: terminal: switching never settled'));
  const md = renderComparisonMarkdown(res);
  assert.match(md, /Required-lane failures/);
  assert.match(md, /No aggregate score/);
  assert.equal(Object.keys(res).some((k) => /score|overall|total/i.test(k)), false);
});

test('document cases appear as rows with worst values, and missing stays missing', () => {
  const doc = (ops) => ({ requiredCaseIds: ['csv'], runs: ops.map((operationMs) => ({ cases: [{ id: 'csv', operationMs, renderer: { maxDelayMs: 10 }, main: { maxDelayMs: 10 }, input: { latencyMs: 10 }, memory: { peakRssMb: 300 } }] })) });
  const a = terminalReport([100, 100, 100]); a.artifacts = { documents: doc([100, 105, 110]) };
  const b = terminalReport([100, 100, 100]); b.artifacts = { documents: doc([900, 905, 910]) };
  const res = compareAll(a, b, { paths: [TERMINAL] });
  const op = res.documents.find((r) => r.path === 'documents.csv.operationMs');
  assert.equal(op.kind, 'document'); assert.equal(op.a, 105); assert.equal(op.b, 905); assert.equal(op.bWorst, 910);
  assert.ok(res.documents.length >= 5);
  const none = compareAll(a, terminalReport([100, 100, 100]), { paths: [TERMINAL] });
  assert.ok(none.documents.every((r) => r.status === 'missing' || r.status === 'incomparable'));
  assert.ok(none.documents.every((r) => r.b === null));
});

test('compareAll covers every PRIMARY path by default', () => {
  const res = compareAll(terminalReport([1, 1, 1]), terminalReport([1, 1, 1]));
  assert.deepEqual(res.rows.map((r) => r.path), PRIMARY);
});
