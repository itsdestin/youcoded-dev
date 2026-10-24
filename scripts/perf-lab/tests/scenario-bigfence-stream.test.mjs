// Unit tests for scenario-bigfence-stream.mjs and bigfence-stream-run.mjs's CLI - planning, page sources (run in a VM against a fake DOM),
// row classification, aggregation. No app, server, build or boot.
// Run: node --test scripts/perf-lab/tests/scenario-bigfence-stream.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { splitDeltas } from '../fake-provider.mjs';
import {
  APP_HIGHLIGHT_LIMITS, BIGFENCE_MAX_STREAM_MS, JSON_LINE_CHARS, aggregateRounds, awaitFinalPaintSource, classifyRung, codeLineAt, fenceLines, jsonBody,
  paneComplete, paneStateSource, planRung, planRungs, proofProblems, replyText, scrollPassSource,
} from '../scenario-bigfence-stream.mjs';
import { naturalDeltaCount } from '../scenario-pathlist-stream.mjs';
import { parseCli, parseRungId } from '../bigfence-stream-run.mjs';

test('replies: one labelled fence between an intro and an outro; the whole reply streams', () => {
  const t = replyText('code', 30);
  assert.equal(t.match(/```/g).length, 2);
  assert.match(t, /^Here is the full file you asked for:\n\n```ts\n/);
  assert.ok(t.endsWith('```\n\nThat is the whole file.'));
  const n = naturalDeltaCount(t);
  assert.equal(splitDeltas(t, n).join(''), t);
  assert.equal(fenceLines('code', 30).length, 30);
  assert.equal(fenceLines('code', 3)[2], codeLineAt(2));
});

test('json: ~N KB, few LONG lines (not many short ones), valid JSON, or one line when asked', () => {
  const lines = jsonBody(700);
  const chars = lines.join('\n').length;
  assert.ok(chars >= 700_000 && chars < 700_000 + JSON_LINE_CHARS * 2, `${chars}`);
  assert.ok(lines.length < 60 && lines.length > 10, `${lines.length} lines`);
  assert.doesNotThrow(() => JSON.parse(lines.join('\n').replace(/,\n\]$/, '\n]').replace(/,(\n\])/, '$1')));
  const one = jsonBody(50, { oneLine: true });
  assert.equal(one.length, 1);
  assert.doesNotThrow(() => JSON.parse(one[0]));
  assert.throws(() => jsonBody(0)); assert.throws(() => fenceLines('nope', 3)); assert.throws(() => fenceLines('code', 0));
});

test('plans: the default ladder, over-limit labels, stream length bounded, tail is the last line', () => {
  const plans = planRungs();
  assert.deepEqual(plans.map((p) => p.id), ['bigfence-code-2000', 'bigfence-code-20000', 'bigfence-json-700']);
  assert.ok(plans.every((p) => p.overLimit), 'all three default rungs are over the 1,500-line / 100 KB limit');
  assert.equal(planRung('code', 1000).overLimit, false);
  assert.equal(planRung('json', 700).overLimit, true, 'few lines but huge: the size limit alone trips it');
  assert.equal(planRung('json', 700).lineCount < APP_HIGHLIGHT_LIMITS.lines, true);
  for (const p of plans) assert.ok(p.streamMs <= BIGFENCE_MAX_STREAM_MS + 50, `${p.id} ${p.streamMs}`);
  const p = planRung('code', 40);
  assert.ok(codeLineAt(39).endsWith(p.lastTail));
});

test('page sources parse, and the state/complete checks follow a fake DOM', () => {
  const plan = planRung('code', 12);
  assert.doesNotThrow(() => new Function(`return ${paneStateSource(plan)}`));
  assert.doesNotThrow(() => new Function(`return ${awaitFinalPaintSource(plan, 1000)}`));
  assert.doesNotThrow(() => new Function(`return ${scrollPassSource({ durationMs: 10, pxPerSecond: 100 })}`));
  // A fake pane: one <pre> whose text is split across spans (as a coloured block would be) ending in a bare newline.
  const text = (data) => ({ nodeType: 3, data, previousSibling: null });
  const el = (...kids) => { kids.forEach((k, i) => { k.previousSibling = kids[i - 1] ?? null; }); return { nodeType: 1, lastChild: kids[kids.length - 1] ?? null, previousSibling: null, querySelector: () => ({}) }; };
  const tailText = codeLineAt(11);
  const pre = el(text('x\n'), el(text(tailText.slice(0, 20))), text(tailText.slice(20)), text('\n'));
  const run = (outro) => vm.runInNewContext(paneStateSource(plan), { document: { querySelectorAll: () => [{ closest: () => null, querySelectorAll: () => [pre], textContent: outro ? 'blah That is the whole file.' : 'blah' }] } });
  const done = run(true);
  assert.equal(done.tailOk, true); assert.equal(done.hasOutro, true); assert.equal(paneComplete(done), true);
  assert.equal(paneComplete(run(false)), false, 'tail present but outro missing: not complete');
  assert.equal(paneComplete({ panes: 2 }), false);
  assert.equal(paneComplete(null), false);
});

const goodRaw = (plan, over = {}) => ({
  fakeRecord: { aborted: false, deltasSent: plan.deltas }, final: { ok: true }, sessionVisible: true,
  windows: { stream: [0, 1000], settle: [1000, 1500] }, finished: { fenceChars: plan.fenceChars, coloured: false, heapMb: 40, domNodes: 300 },
  scroll: { ok: true, maxFrameGapMs: 20, framesOver50ms: 0 }, scrollTasks: { maxMs: 0, count: 0 },
  longtasks: { stream: { maxMs: 60, totalMs: 60, count: 1, frameGapMaxMs: 30 }, settle: { maxMs: 80, totalMs: 80, count: 1, frameGapMaxMs: 30 } },
  loop: {}, main: { maxDelayMs: 10, totalStallMs: 0 }, memory: { peakPssMb: 700 },
  typing: { complete: true, idleMaxMs: 3, streamMaxMs: 40, settleMaxMs: 30, afterMaxMs: 20, saturated: false, keysStream: 5, keysSettle: 2, keysAfter: 10, exhausted: false },
  ...over,
});

test('classify: measured, slow with named breaches, and every missing-evidence case is failed, never a zero', () => {
  const plan = planRung('code', 40);
  const ok = classifyRung(plan, goodRaw(plan));
  assert.equal(ok.status, 'measured'); assert.equal(ok.coloured, 0); assert.equal(ok.worstLongtaskMs, 80); assert.equal(ok.typingScrollMaxMs, 20);
  const slow = classifyRung(plan, goodRaw(plan, { scrollTasks: { maxMs: 900 }, finished: { fenceChars: plan.fenceChars, coloured: true } }));
  assert.equal(slow.status, 'slow'); assert.equal(slow.coloured, 1);
  assert.deepEqual(slow.breaches.map((b) => b.metric), ['worstLongtaskMs']);
  assert.match(classifyRung(plan, { failure: { status: 'timeout', error: 'x\ny' } }).status, /^failed:timeout$/);
  const cut = classifyRung(plan, goodRaw(plan, { finished: { fenceChars: 10 } }));
  assert.equal(cut.status, 'failed:evidence-incomplete'); assert.match(cut.reason, /fence characters/);
  assert.equal(classifyRung(plan, goodRaw(plan, { final: { ok: false, state: { blocks: 1 } } })).status, 'failed:settle-timeout');
  assert.match(proofProblems(plan, goodRaw(plan, { scroll: { ok: false, reason: 'no visible .chat-scroll' } })).join(), /scroll pass did not run/);
  assert.equal(classifyRung(plan, goodRaw(plan, { typing: { complete: false, reasons: ['no keys were sent'] } })).status, 'failed:evidence-incomplete');
  const noLt = classifyRung(plan, goodRaw(plan, { longtasks: {}, scrollTasks: null }));
  assert.equal(noLt.status, 'failed:evidence-incomplete'); assert.equal(noLt.worstLongtaskMs, null);
});

test('aggregate: median/min/max per rung and side; missing values are counted out and n says so', () => {
  const plan = planRung('code', 40);
  const mk = (side, round, ms) => ({ side, round, row: classifyRung(plan, goodRaw(plan, { longtasks: { stream: { maxMs: ms, totalMs: ms, count: 1 }, settle: { maxMs: 10, totalMs: 10, count: 1 } } })) });
  const failed = { side: 'old', round: 3, row: classifyRung(plan, { failure: { status: 'timeout' } }) };
  const agg = aggregateRounds([mk('old', 1, 100), mk('old', 2, 300), failed, mk('new', 1, 60), mk('new', 2, 70)]);
  const o = agg[plan.id].old.metrics.streamLongtaskMaxMs;
  assert.deepEqual([o.median, o.min, o.max, o.n, o.of], [200, 100, 300, 2, 3]);
  assert.deepEqual(agg[plan.id].old.statuses, ['measured', 'slow', 'failed:timeout']);
  assert.equal(agg[plan.id].new.metrics.streamLongtaskMaxMs.median, 65);
});

test('CLI: rung ids, defaults, refusals', () => {
  assert.deepEqual(parseRungId('code-2000'), ['code', 2000]);
  assert.deepEqual(parseRungId('jsonone-700'), ['jsonone', 700]);
  assert.throws(() => parseRungId('prose-3')); assert.throws(() => parseRungId('code')); assert.throws(() => parseRungId('code-0'));
  const c = parseCli(['--a', '/x', '--b', '/y', '--only', 'code-2000,json-700', '--rounds', '3', '--busy-machine']);
  assert.deepEqual(c.rungs, [['code', 2000], ['json', 700]]); assert.equal(c.rounds, 3); assert.equal(c.b, '/y');
  assert.equal(parseCli(['--a', '/x']).rounds, 2);
  assert.throws(() => parseCli([])); assert.throws(() => parseCli(['--a', '/x', '--rounds', '0'])); assert.throws(() => parseCli(['--a', '/x', '--nope']));
});
