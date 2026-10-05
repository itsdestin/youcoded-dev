// Unit tests for switch-analysis.mjs — the pure half of the session-switch ping-pong leg.
// Run: node --test scripts/perf-lab/tests/switch-analysis.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyseSwitch, bestClockSync, buildPlan, controlVerdict, echoLatency, estimatePeriod, firstVisible, frameGaps,
  needsRepeat, percentile, settleDetector, splitCold, summarise, summariseSwitches, toPageTime, validateSample,
} from '../switch-analysis.mjs';

// A steady 60 Hz frame list from `from` to `to`, optionally with a freeze (no frames in [freezeFrom, freezeTo)).
const frames = (from, to, step = 16, freeze = null) => {
  const out = [];
  for (let t = from; t <= to; t += step) if (!freeze || t < freeze[0] || t >= freeze[1]) out.push(t);
  return out;
};
const rec = (over = {}) => ({ ft: [], fv: [], mu: [], ls: [], loaf: [], lt: [], tail: [], po: [], ac: [], ...over });

test('percentile is nearest-rank and ignores non-numbers', () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([null, undefined, NaN, 7], 50), 7);
});

test('summarise reports p50/p95/max together and null (never 0) when empty', () => {
  const s = summarise([10, 20, 30, 40, 500]);
  assert.deepEqual([s.n, s.p50, s.p95, s.max, s.min], [5, 30, 500, 500, 10]);
  assert.deepEqual(summarise([]), { n: 0, p50: null, p95: null, max: null, min: null });
});

test('estimatePeriod ignores stalls longer than 100 ms', () => {
  const f = [0, 16.7, 33.4, 50, 300, 316.7, 333.4];
  assert.ok(Math.abs(estimatePeriod(f) - 16.7) < 0.2);
  assert.equal(estimatePeriod([5]), null);
});

test('frameGaps finds gaps over 1.5x the period, not only over 40 ms', () => {
  const f = [0, 16, 32, 64, 80, 96]; // one 32 ms gap = 2 periods: invisible to a 40 ms rule
  const g = frameGaps(f, 0, 100, 16);
  assert.deepEqual(g, [{ atMs: 64, gapMs: 32 }]);
  assert.deepEqual(frameGaps(f, 0, 100, 16, 2.5), []);
  assert.deepEqual(frameGaps(f, 70, 100, 16), []);          // the gap's later frame is outside the window
  assert.deepEqual(frameGaps(f, 0, 50, 16), []);            // ... or beyond it
  assert.deepEqual(frameGaps(f, 0, 100, null), []);
});

test('settleDetector: quiet gap settles at the last activity', () => {
  const r = settleDetector([100, 120, 140, 400], { from: 100, quietMs: 150, observedUntil: 1000 });
  assert.deepEqual([r.status, r.settledAt], ['settled', 140]);
});

test('settleDetector: no activity at all settles at `from`', () => {
  const r = settleDetector([], { from: 100, quietMs: 150, observedUntil: 1000 });
  assert.deepEqual([r.status, r.settledAt], ['settled', 100]);
});

test('settleDetector: activity before `from` is ignored', () => {
  const r = settleDetector([10, 20, 30], { from: 100, quietMs: 150, observedUntil: 1000 });
  assert.equal(r.settledAt, 100);
});

test('settleDetector: continuous activity past the cap is "capped", never settled', () => {
  const ev = []; for (let t = 100; t < 5000; t += 20) ev.push(t);
  const r = settleDetector(ev, { from: 100, quietMs: 150, capMs: 3000, observedUntil: 5000 });
  assert.deepEqual([r.status, r.settledAt], ['capped', null]);
});

test('settleDetector: observation that ends inside the quiet window is "unconfirmed"', () => {
  const r = settleDetector([100, 200], { from: 100, quietMs: 150, observedUntil: 300 });
  assert.deepEqual([r.status, r.settledAt], ['unconfirmed', null]);
});

test('settleDetector: a late burst after a long quiet does not move the settle time', () => {
  const r = settleDetector([100, 130, 900], { from: 100, quietMs: 150, observedUntil: 2000 });
  assert.equal(r.settledAt, 130);
});

test('firstVisible finds the destination frame and the frame after it', () => {
  const ft = [0, 16, 32, 48, 64], fv = [0, 0, 1, 1, 1];
  assert.deepEqual(firstVisible(ft, fv, 10, 1), { domAt: 32, paintedAt: 48, frameIndex: 2 });
  assert.equal(firstVisible(ft, fv, 10, 2), null);
  assert.equal(firstVisible(ft, fv, 50, 0), null);
});

test('validateSample: a no-op click must be reported as no-switch, never as a fast switch', () => {
  assert.deepEqual(validateSample({ before: 1, after: 1, target: 1, domAt: 5, expectNoop: true }), { ok: true, status: 'no-switch', reason: null });
  assert.equal(validateSample({ before: 1, after: 2, target: 1, domAt: 5, expectNoop: true }).status, 'no-op-moved');
});

test('validateSample: wrong pane and never-shown fail the sample', () => {
  assert.equal(validateSample({ before: 0, after: 2, target: 1, domAt: 5 }).status, 'wrong-pane');
  assert.equal(validateSample({ before: 0, after: 0, target: 1, domAt: null }).status, 'never-shown');
  assert.equal(validateSample({ before: 0, after: 1, target: 1, domAt: 5 }).ok, true);
  // superseded by a later click: the final pane is someone else's, that is fine
  assert.equal(validateSample({ before: 0, after: 2, target: 1, domAt: 5, superseded: true }).ok, true);
});

test('analyseSwitch: show and settle are measured from t0, with settle after the last mutation', () => {
  // click at 1000; destination visible at the frame at 1048; mutations until 1190; then quiet
  const ft = frames(904, 4000), fv = ft.map(t => (t >= 1048 ? 1 : 0));
  const r = rec({ ft, fv, mu: [[1040, 1, 3], [1100, 1, 40], [1190, 1, 5], [1100, 0, 9]] });
  const a = analyseSwitch(r, { t0: 1000, target: 1, before: 0, nextT0: null, endObserved: 4000, period: 16 });
  assert.equal(a.ok, true);
  assert.equal(a.showDomMs, 48);
  assert.equal(a.showMs, 64);
  assert.equal(a.settleMs, 190);
  assert.equal(a.settleStatus, 'settled');
  assert.deepEqual(a.otherPaneWork, { 0: { callbacks: 1, records: 9 } });
});

test('analyseSwitch: the positive control — a 200 ms freeze moves show and settle by ~200 ms', () => {
  const run = (freeze) => {
    const ft = frames(904, 5000, 16, freeze), fv = ft.map(t => (t >= 1048 ? 1 : 0));
    // with the freeze the same mutations simply happen 200 ms later (the main thread was busy)
    const shift = freeze ? 200 : 0;
    const r = rec({ ft, fv, mu: [[1100 + shift, 1, 10], [1190 + shift, 1, 5]] });
    return analyseSwitch(r, { t0: 1000, target: 1, before: 0, nextT0: null, endObserved: 5000, period: 16 });
  };
  const plain = run(null), blocked = run([1020, 1220]);
  assert.ok(blocked.showMs - plain.showMs >= 150 && blocked.showMs - plain.showMs <= 260, `show moved ${blocked.showMs - plain.showMs}`);
  assert.ok(blocked.settleMs - plain.settleMs >= 150 && blocked.settleMs - plain.settleMs <= 260);
  assert.equal(blocked.gaps.length, 1);
  assert.ok(blocked.gapMaxMs >= 200);
});

test('analyseSwitch: a switch superseded by the next click has show but no confirmed settle', () => {
  const ft = frames(0, 2000), fv = ft.map(t => (t >= 48 ? 1 : t >= 400 ? 0 : 0));
  const r = rec({ ft, fv, mu: [[60, 1, 1], [200, 1, 1]] });
  const a = analyseSwitch(r, { t0: 0, target: 1, before: 0, nextT0: 250, endObserved: 2000, period: 16 });
  assert.equal(a.ok, true);
  assert.equal(a.showMs, 64);
  assert.equal(a.settleMs, null);
  assert.equal(a.settleStatus, 'unconfirmed');
});

test('analyseSwitch: wrong pane at the end fails the sample', () => {
  const ft = frames(0, 2000), fv = ft.map(() => 2);
  const a = analyseSwitch(rec({ ft, fv }), { t0: 100, target: 1, before: 0, nextT0: null, endObserved: 2000, period: 16 });
  assert.equal(a.ok, false);
  assert.equal(a.status, 'never-shown');
});

test('analyseSwitch: a click on the active session reports no-switch with null times (not 0)', () => {
  const ft = frames(0, 2000), fv = ft.map(() => 1);
  const a = analyseSwitch(rec({ ft, fv }), { t0: 100, target: 1, before: 1, nextT0: null, endObserved: 2000, expectNoop: true, period: 16 });
  assert.equal(a.status, 'no-switch');
  assert.equal(a.ok, true);
  assert.equal(a.showMs, null);
  assert.equal(a.settleMs, null);
});

test('analyseSwitch: a streaming destination never settles by the mutation rule', () => {
  const ft = frames(0, 3000), fv = ft.map(t => (t >= 40 ? 1 : 0));
  const mu = []; for (let t = 50; t < 3000; t += 20) mu.push([t, 1, 2]);
  const a = analyseSwitch(rec({ ft, fv, mu }), { t0: 0, target: 1, before: 0, nextT0: null, endObserved: 3000, streaming: true, period: 16 });
  assert.equal(a.settleStatus, 'n/a-streaming');
  assert.equal(a.settleMs, null);
  assert.ok(a.showMs > 0);
});

test('analyseSwitch (terminal): buffer changes and output arrival in the destination count as activity', () => {
  const ft = frames(0, 4000), fv = ft.map(t => (t >= 48 ? 1 : 0));
  const r = rec({ ft, fv, tail: [[100, 1], [200, 1], [300, 1], [500, 0]], po: [[320, 1, 9000]], ac: [[-5, 4], [60, 5]] });
  const a = analyseSwitch(r, { t0: 0, target: 1, before: 0, nextT0: null, endObserved: 4000, mode: 'terminal', period: 16 });
  assert.equal(a.settleMs, 320);
  assert.equal(a.atlasClears, 1);
});

test('summariseSwitches counts dropped samples by reason and keeps null settles out of the settle stats', () => {
  const s = summariseSwitches([
    { ok: true, showMs: 50, settleMs: 100, showDomMs: 34, gapMaxMs: 0, gaps: [] },
    { ok: true, showMs: 70, settleMs: null, showDomMs: 50, gapMaxMs: 40, gaps: [{}] },
    { ok: false, status: 'wrong-pane' },
  ]);
  assert.equal(s.usable, 2);
  assert.deepEqual(s.dropped, { 'wrong-pane': 1 });
  assert.equal(s.settle.n, 1);
  assert.equal(s.settledCount, 1);
  assert.equal(s.withGaps, 1);
});

test('splitCold separates first visits from revisits', () => {
  const x = splitCold([{ ok: true, showMs: 300, cold: true }, { ok: true, showMs: 50 }, { ok: true, showMs: 60 }]);
  assert.equal(x.cold.usable, 1);
  assert.equal(x.warm.usable, 2);
});

test('needsRepeat flags max > 2x p95 only with enough samples', () => {
  assert.equal(needsRepeat([10, 11, 12, 11, 10, 12, 11, 10, 11, 12, 11, 10, 11, 12, 11, 10, 11, 12, 11, 300]), true);
  assert.equal(needsRepeat([10, 11, 12, 300]), false);
  assert.equal(needsRepeat([10, 11, 12, 11, 10, 12, 11, 10, 11, 12, 11, 10, 11, 12, 11, 10, 11, 12, 11, 20]), false);
});

test('controlVerdict passes when a 200 ms block moved the median by ~200 ms and fails when the instrument did not see it', () => {
  assert.equal(controlVerdict([50, 52, 49], [250, 255, 249]).ok, true);
  assert.equal(controlVerdict([50, 52, 49], [60, 62, 59]).ok, false);
  assert.equal(controlVerdict([], [1]).ok, false);
});

test('echoLatency measures key timestamp to the next frame after the input event', () => {
  assert.equal(echoLatency(100, 105, [90, 110, 126]), 10);
  assert.equal(echoLatency(100, null, [110]), null);
  assert.equal(echoLatency(100, 500, [110]), null);
});

test('clock sync picks the lowest round trip and maps node time to page time', () => {
  const s = bestClockSync([
    { nodeBefore: 1000, nodeAfter: 1010, pageEpoch: 0, pageNow: 500 },
    { nodeBefore: 2000, nodeAfter: 2002, pageEpoch: 0, pageNow: 1501 },
  ]);
  assert.equal(s.rtt, 2);
  assert.equal(toPageTime(2101, s), 1501 + 100);
});

test('buildPlan cadences', () => {
  const roles = { A: 0, B: 1, C: 2, D: 3 };
  const a = buildPlan('a', roles);
  assert.equal(a.length, 20);
  assert.deepEqual(a.slice(0, 3), [{ at: 0, idx: 1 }, { at: 1000, idx: 0 }, { at: 2000, idx: 1 }]);
  assert.equal(buildPlan('b150', roles)[19].at, 19 * 150);
  assert.deepEqual(buildPlan('c', roles).map(s => s.idx).slice(0, 5), [1, 2, 3, 0, 1]);
  assert.equal(buildPlan('c', roles).length, 10);
  assert.deepEqual(buildPlan('d', roles), [{ at: 0, idx: 1 }, { at: 60, idx: 2 }]);
  assert.throws(() => buildPlan('zz', roles));
});
