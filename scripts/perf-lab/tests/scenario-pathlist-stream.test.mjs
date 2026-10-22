// Unit tests for scenario-pathlist-stream.mjs — planning, windows, typing maths, row classification, proof checks. No app.
// Run: node --test scripts/perf-lab/tests/scenario-pathlist-stream.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { splitDeltas } from '../fake-provider.mjs';
import {
  BASE_PER_SEC, MAX_STREAM_MS, PATHLIST_THRESHOLDS, TYPING_EVERY_MS, aggregateRounds, alignClocks, awaitFinalPaintSource, buildWindows, classifyRung,
  decoyAt, longtaskWindows, loopWindows, naturalDeltaCount, pathAt, paneComplete, paneStateSource, planRung, planRungs, proofProblems, ratePerSec,
  renderComparison, replyText, startTypingTrain, summariseTyping,
} from '../scenario-pathlist-stream.mjs';
import { parseCli } from '../pathlist-stream-run.mjs';

// ── planning ──
test('naturalDeltaCount matches splitDeltas exactly: the whole reply streams, nothing truncated or padded', () => {
  for (const [v, n] of [['code', 7], ['prose', 40], ['control', 40], ['code', 100]]) {
    const text = replyText(v, n), count = naturalDeltaCount(text);
    assert.equal(splitDeltas(text, count).join(''), text, `${v}-${n}`);
    assert.notEqual(splitDeltas(text, count - 1).join(''), text, 'one fewer delta would cut the reply');
  }
});

test('replies: code is one fence, prose is bullets outside any fence, control has the same length and no path', () => {
  const code = replyText('code', 5), prose = replyText('prose', 5), control = replyText('control', 5);
  assert.equal(code.match(/```/g).length, 2);
  assert.ok(!prose.includes('```'));
  assert.equal(prose.split('\n').filter((l) => l.startsWith('- /home/user/project/src/dir')).length, 5);
  assert.equal(code.length, control.length, 'control is the same length as the code reply');
  assert.ok(!control.slice(control.indexOf('```')).includes('/home'), 'no slash-paths in the control');
  assert.equal(pathAt(26), '/home/user/project/src/dir1/file26.ts');
  assert.equal(decoyAt(26).length, pathAt(26).length);
  assert.ok(!decoyAt(26).includes('/'));
  assert.equal(new Set(Array.from({ length: 500 }, (_, i) => pathAt(i))).size, 500, 'every path unique');
});

test('rate: cloud speed where the stream fits, faster only as needed, never slower', () => {
  assert.equal(ratePerSec(1000), BASE_PER_SEC);
  assert.equal(ratePerSec(150 * 45), BASE_PER_SEC);
  assert.equal(ratePerSec(55_000), Math.ceil(55_000 / 45));
  assert.ok(planRung('code', 5000).streamMs <= MAX_STREAM_MS + 50);
  assert.equal(planRung('code', 100).atCloudSpeed, true);
  assert.equal(planRung('code', 5000).atCloudSpeed, false);
});

test('ladder: 4 code + 4 prose + control rungs, ids unique, expected chips right, control expects none', () => {
  const plans = planRungs();
  assert.deepEqual(plans.map((p) => p.id), ['pathlist-code-100', 'pathlist-code-500', 'pathlist-code-2000', 'pathlist-code-5000',
    'pathlist-prose-100', 'pathlist-prose-500', 'pathlist-prose-2000', 'pathlist-prose-5000', 'pathlist-control-2000', 'pathlist-control-5000']);
  assert.equal(plans.find((p) => p.id === 'pathlist-code-500').expectedChips, 500);
  const c = plans.find((p) => p.id === 'pathlist-control-2000');
  assert.equal(c.expectedChips, 0); assert.equal(c.lastPath, null); assert.equal(c.lastDecoy, decoyAt(1999));
  assert.throws(() => replyText('nope', 3)); assert.throws(() => replyText('code', 0));
});

// ── page sources ──
test('page sources parse; paneState and the completion check agree', async () => {
  const plan = planRung('code', 3);
  assert.doesNotThrow(() => new Function(`return ${paneStateSource(plan)}`));
  assert.doesNotThrow(() => new Function(`return ${awaitFinalPaintSource(plan, 1000)}`));
  assert.equal(paneComplete(plan, { panes: 1, chips: 3, lastChip: pathAt(2), hasOutro: true }), true);
  assert.equal(paneComplete(plan, { panes: 1, chips: 2, lastChip: pathAt(1), hasOutro: true }), false, 'half-drawn list is not complete');
  assert.equal(paneComplete(plan, { panes: 1, chips: 3, lastChip: pathAt(2), hasOutro: false }), false);
  assert.equal(paneComplete(plan, { panes: 2 }), false);
  const ctl = planRung('control', 3);
  assert.equal(paneComplete(ctl, { panes: 1, chips: 0, hasOutro: true, hasLastDecoy: true }), true);
  assert.equal(paneComplete(ctl, { panes: 1, chips: 1, hasOutro: true, hasLastDecoy: true }), false, 'a chip in the control means the decoy matched a path');
});

test('the in-page state source counts chips in a fake DOM', () => {
  const plan = planRung('prose', 2);
  const chips = [pathAt(0), pathAt(1)].map((p) => ({ getAttribute: () => p }));
  const pane = { closest: () => null, querySelectorAll: () => chips, textContent: `x ${plan.outro}` };
  const ctx = { document: { querySelectorAll: () => [pane] } };
  const s = vm.runInNewContext(paneStateSource(plan), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), { panes: 1, chips: 2, lastChip: pathAt(1), hasOutro: true, hasLastDecoy: null });
  assert.equal(paneComplete(plan, s), true);
});

// ── windows ──
test('windows need ordered finite times; otherwise null, never an empty window', () => {
  assert.deepEqual(buildWindows({ sendMs: 10, streamEndMs: 20, paintedMs: 35 }), { stream: [10, 20], settle: [20, 35] });
  assert.deepEqual(buildWindows({ sendMs: 10, streamEndMs: 5, paintedMs: 35 }), { stream: null, settle: null });
  assert.deepEqual(buildWindows({ sendMs: 10, streamEndMs: 20, paintedMs: null }), { stream: null, settle: null });
});

test('long tasks split by start time into stream and settle; unsupported observer gives null not 0', () => {
  const probe = { t0: 1000, longtaskSupported: true, log: [['longtask', 100, 80], ['longtask', 150, 300], ['longtask', 600, 900], ['frame-gap', 700, 60], ['longtask', 5000, 40]] };
  const w = { stream: [1000, 1400], settle: [1400, 2000] };
  const r = longtaskWindows(probe, w);
  assert.deepEqual(r.stream, { count: 2, maxMs: 300, totalMs: 380, frameGapMaxMs: 0 });
  assert.deepEqual(r.settle, { count: 1, maxMs: 900, totalMs: 900, frameGapMaxMs: 60 });
  assert.deepEqual(longtaskWindows({ ...probe, longtaskSupported: false }, w), { stream: null, settle: null });
  assert.deepEqual(longtaskWindows(probe, { stream: null, settle: null }), { stream: null, settle: null });
});

test('timer-delay events are placed by their start (end minus delay)', () => {
  const loop = { available: true, startedAt: 500, events: [{ atMs: 200, delayMs: 100 }, { atMs: 1000, delayMs: 700 }], truncated: false };
  const r = loopWindows(loop, { stream: [500, 650], settle: [650, 2000] });
  assert.equal(r.stream.count, 1); assert.equal(r.stream.maxDelayMs, 100);
  assert.equal(r.settle.count, 1); assert.equal(r.settle.maxDelayMs, 700);
  assert.equal(loopWindows({ available: false }, { stream: [0, 1], settle: [1, 2] }).stream, null);
});

// ── clocks and typing ──
const exchange = (before, renderer, after) => ({ beforeMs: before, rendererMs: renderer, afterMs: after });
test('clock alignment bounds the offset and refuses uncertainty', () => {
  const ok = alignClocks([exchange(0, 1000, 2), exchange(5, 1006, 7), exchange(60000, 61001, 60002)]);
  assert.equal(ok.valid, true); assert.ok(ok.lower <= 1000 && ok.upper >= 999);
  assert.equal(alignClocks([exchange(0, 1000, 500), exchange(600, 1601, 1100)]).valid, false, 'wide brackets = unknown offset');
  assert.equal(alignClocks([exchange(0, 1000, 2)]).valid, false);
  assert.equal(alignClocks([exchange(0, 1000, 2), exchange(1, 1001, 3)]).valid, false, 'overlapping exchanges are not monotonic');
});

const typingFixture = (receiptDelays, sentAt, { trusted = true } = {}) => {
  const samples = sentAt.map((t, i) => ({ token: i, plannedMs: t, actualMs: t, ackMs: t + 1 }));
  const receipts = sentAt.map((t, i) => ({ token: i, trusted, correctTarget: true, atMs: t + 1000 + receiptDelays[i] }));   // renderer clock = controller + 1000
  return { train: { samples, skippedSlots: 0, failed: 0, maxInflight: 1, maxOutstanding: 16, exhausted: false }, receipts, clocks: alignClocks([exchange(0, 1000, 0.5), exchange(1, 1001.2, 1.6)]) };
};
test('typing delay is split into idle / stream / settle by send time and reports the worst of each', () => {
  const sent = [0, 250, 500, 750, 1000, 1250];
  const f = typingFixture([2, 3, 40, 900, 700, 5], sent);
  const t = summariseTyping({ ...f, windows: { stream: [1400, 2000], settle: [2000, 2300] } });   // renderer clock; keys sent at ~1000+t
  assert.equal(t.complete, true);
  assert.ok(t.idleMaxMs < 10);
  assert.ok(t.streamMaxMs >= 899 && t.streamMaxMs < 910);
  assert.ok(t.settleMaxMs < 10 && t.keysSettle >= 1);
});
test('typing evidence that cannot support a reading says why', () => {
  const f = typingFixture([1, 1, 1], [0, 250, 500]);
  const win = { stream: [1000, 1400], settle: [1400, 1600] };
  assert.equal(summariseTyping({ ...f, receipts: f.receipts.slice(1), windows: win }).complete, false);
  assert.match(summariseTyping({ ...f, receipts: f.receipts.slice(1), windows: win }).reasons.join(), /receipts for 3 keys/);
  assert.equal(summariseTyping({ ...typingFixture([1], [0], { trusted: false }), windows: win }).complete, false);
  assert.equal(summariseTyping({ ...f, clocks: { valid: false, error: 'x' }, windows: win }).complete, false);
  assert.equal(summariseTyping({ ...f, windows: { stream: null, settle: null } }).complete, false);
});

test('the typing train sends on a schedule, caps outstanding keys and records skipped slots under a frozen renderer', async () => {
  let t = 0; const timers = []; const sent = [];
  const cdp = { send: (_m, p) => { sent.push(p.type); return new Promise(() => {}); } };   // never acks: a frozen renderer
  const train = startTypingTrain(cdp, { now: () => t, schedule: (fn, ms) => { timers.push([fn, t + ms]); return timers.length; }, cancel: () => {}, everyMs: 250, maxOutstanding: 3, maxSamples: 10 });
  for (let i = 0; i < 12 && timers.length; i++) { const [fn, at] = timers.shift(); t = Math.max(t, at); fn(); }
  const s = train.snapshot();
  assert.equal(s.samples.length, 3, 'stops sending at maxOutstanding');
  assert.ok(s.skippedSlots > 0 && s.maxInflight === 3);
  train.cancel();
  assert.equal(TYPING_EVERY_MS, 250);
});

// ── classification ──
const goodRaw = (plan, over = {}) => ({
  fakeRecord: { aborted: false, deltasSent: plan.deltas },
  final: { ok: true, state: { chips: plan.expectedChips, hasOutro: true } }, sessionVisible: true,
  windows: { stream: [0, 1000], settle: [1000, 1300] },
  longtasks: { stream: { count: 2, maxMs: 80, totalMs: 120 }, settle: { count: 1, maxMs: 60, totalMs: 60 } },
  loop: { stream: { maxDelayMs: 70 }, settle: { maxDelayMs: 60 } },
  typing: { complete: true, reasons: [], idleMaxMs: 3, streamMaxMs: 90, settleMaxMs: 40, saturated: false },
  main: { maxDelayMs: 10, totalStallMs: 0 }, memory: { peakPssMb: 900 }, interference: { verdict: 'clean', reasons: [] },
  ...over,
});
test('a clean rung is measured and carries every number', () => {
  const plan = planRung('code', 100), r = classifyRung(plan, goodRaw(plan));
  assert.equal(r.status, 'measured');
  assert.equal(r.worstLongtaskMs, 80); assert.equal(r.worstTypingMs, 90); assert.equal(r.endToPaintMs, 300); assert.equal(r.peakPssMb, 900); assert.equal(r.chipsRendered, 100);
  assert.equal(r.worstStalledMs, 180);
});
test('breaching a named threshold makes it slow and keeps the breach', () => {
  const plan = planRung('code', 100);
  const r = classifyRung(plan, goodRaw(plan, { longtasks: { stream: { count: 1, maxMs: 40, totalMs: 40 }, settle: { count: 1, maxMs: 1200, totalMs: 1200 } },
    typing: { complete: true, reasons: [], streamMaxMs: 300, settleMaxMs: 1500, idleMaxMs: 2 }, windows: { stream: [0, 1000], settle: [1000, 3500] } }));
  assert.equal(r.status, 'slow');
  assert.deepEqual(r.breaches.map((b) => b.metric).sort(), ['endToPaintMs', 'worstLongtaskMs', 'worstTypingMs']);
  assert.equal(PATHLIST_THRESHOLDS.rendererMaxDelayMs, 250);
});
test('control must show no chips; a control with chips is not a valid control', () => {
  const plan = planRung('control', 2000);
  assert.equal(classifyRung(plan, goodRaw(plan)).status, 'measured');
  const bad = goodRaw(plan, { final: { ok: false, state: { chips: 4, hasOutro: true } } });
  assert.equal(classifyRung(plan, bad).status, 'failed:settle-timeout');
});
test('proof: short stream, aborted stream, missing server record, hidden session, missing final paint', () => {
  const plan = planRung('prose', 100);
  assert.deepEqual(proofProblems(plan, goodRaw(plan)), []);
  assert.match(proofProblems(plan, goodRaw(plan, { fakeRecord: { aborted: false, deltasSent: 5 } })).join(), /sent 5 of/);
  assert.match(proofProblems(plan, goodRaw(plan, { fakeRecord: { aborted: true, deltasSent: plan.deltas } })).join(), /aborted/);
  assert.match(proofProblems(plan, goodRaw(plan, { fakeRecord: null })).join(), /never recorded/);
  assert.match(proofProblems(plan, goodRaw(plan, { sessionVisible: false })).join(), /not the one on screen/);
  assert.match(proofProblems(plan, goodRaw(plan, { final: null })).join(), /never read/);
  assert.equal(classifyRung(plan, goodRaw(plan, { fakeRecord: { aborted: false, deltasSent: 5 } })).status, 'failed:evidence-incomplete');
});
test('watchdog failures and missing evidence become failed rows with a reason, never zeros', () => {
  const plan = planRung('code', 5000);
  const t = classifyRung(plan, { failure: { status: 'timeout', error: 'External case deadline 1 ms\nstack' }, memory: { peakPssMb: 3000 } });
  assert.equal(t.status, 'failed:timeout'); assert.equal(t.reason, 'External case deadline 1 ms'); assert.equal(t.worstLongtaskMs, null); assert.equal(t.peakPssMb, 3000);
  assert.equal(classifyRung(plan, { failure: { status: 'memory-limit', error: 'cap' } }).status, 'failed:memory-limit');
  const noTyping = classifyRung(plan, goodRaw(plan, { typing: { complete: false, reasons: ['no keys were sent'] } }));
  assert.equal(noTyping.status, 'failed:evidence-incomplete'); assert.match(noTyping.reason, /no keys/);
  const noLt = classifyRung(plan, goodRaw(plan, { longtasks: { stream: null, settle: null } }));
  assert.equal(noLt.status, 'failed:evidence-incomplete'); assert.equal(noLt.streamLongtaskMaxMs, null);
});

// ── across rounds ──
test('aggregation: median and range per rung and side; missing values are counted out and flagged, failures stay visible', () => {
  const plan = planRung('code', 100);
  const row = (ms, over = {}) => classifyRung(plan, goodRaw(plan, { longtasks: { stream: { count: 1, maxMs: ms, totalMs: ms }, settle: { count: 0, maxMs: 0, totalMs: 0 } }, ...over }));
  const rows = [{ side: 'old', row: row(100) }, { side: 'old', row: row(300) }, { side: 'old', row: row(200) },
    { side: 'new', row: row(10) }, { side: 'new', row: row(20) }, { side: 'new', row: classifyRung(plan, { failure: { status: 'timeout', error: 'x' } }) }];
  const a = aggregateRounds(rows);
  assert.deepEqual(a[plan.id].old.metrics.streamLongtaskMaxMs, { median: 200, min: 100, max: 300, n: 3, of: 3 });
  assert.deepEqual(a[plan.id].new.metrics.streamLongtaskMaxMs, { median: 15, min: 10, max: 20, n: 2, of: 3 });
  const md = renderComparison(a);
  assert.match(md, /pathlist-code-100 \| 200 \(100-300\) \| 15 \(10-20\) n=2\/3/);
  assert.match(md, /1x failed:timeout/);
});

// ── CLI ──
test('cli: needs --a, validates rounds and variants, accepts the lab\'s always-on flags', () => {
  assert.throws(() => parseCli([]), /--a/);
  assert.throws(() => parseCli(['--a', '/x', '--rounds', '0']), /rounds/);
  assert.throws(() => parseCli(['--a', '/x', '--only', 'bogus']), /--only/);
  assert.throws(() => parseCli(['--a', '/x', '--wat']), /unknown/);
  const c = parseCli(['--a', '/x', '--b', '/y', '--cached-only', '--busy-machine', '--sizes', '100,500', '--only', 'code,control']);
  assert.deepEqual(c.sizes, [100, 500]); assert.deepEqual(c.only, ['code', 'control']); assert.equal(c.rounds, 3);
});

test('the final-paint wait actually runs against a fake DOM and reports renderer-clock times', async () => {
  const plan = planRung('code', 2);
  const chips = [pathAt(0), pathAt(1)].map((p) => ({ getAttribute: () => p }));
  const pane = { closest: () => null, querySelectorAll: () => chips, textContent: plan.outro };
  const ctx = { document: { querySelectorAll: () => [pane] }, performance: { now: () => 5, timeOrigin: 1 }, setTimeout, requestAnimationFrame: (f) => f() };
  const r = await vm.runInNewContext(awaitFinalPaintSource(plan, 1000), ctx);
  assert.equal(r.ok, true); assert.equal(r.state.chips, 2);
  const short = await vm.runInNewContext(awaitFinalPaintSource(plan, 0), { ...ctx, document: { querySelectorAll: () => [{ ...pane, querySelectorAll: () => chips.slice(1) }] } });
  assert.equal(short.ok, false, 'a half-drawn list never reports ok');
});
