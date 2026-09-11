// scripts/perf-lab/tests/profile-open.test.mjs
//
// THE POINT OF THIS FILE: profile-open.mjs answers "which functions made this
// step slow?", and that answer decides which code gets changed. Fold the samples
// wrongly — count a child's time as its parent's, drop the last sample, bucket
// highlight.js as app code — and it does not fail loudly; it names the wrong
// subsystem, with a number beside it. The same trap explain.mjs's tests guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selfTimes, buckets } from '../profile-open.mjs';

/** A V8 profile shaped exactly as Profiler.stop returns one. */
const profile = ({ nodes, samples, timeDeltas }) => ({ nodes, samples, timeDeltas });
const node = (id, functionName, url, lineNumber = 0) =>
  ({ id, callFrame: { functionName, url, lineNumber, columnNumber: 0 } });

test('self time is per SAMPLE, and a parent is not charged for its child', () => {
  // parent(1) called child(2); only child was ON the stack top for 30ms.
  const p = profile({
    nodes: [node(1, 'parent', 'file:///a/dist/renderer/x.js'), node(2, 'child', 'file:///a/dist/renderer/x.js')],
    samples: [1, 2, 2, 2],
    timeDeltas: [10_000, 10_000, 10_000, 10_000],   // µs
  });
  const rows = selfTimes(p);
  assert.equal(rows[0].name.split('  ')[0], 'child');
  assert.equal(rows[0].ms, 30);
  assert.equal(rows.find((r) => r.name.startsWith('parent')).ms, 10);
});

test('the same function under two call paths is ONE row', () => {
  // V8 emits a node per call path. Reporting those separately would split a
  // 200ms function into ten 20ms rows and bury the actual cost.
  const p = profile({
    nodes: [node(1, 'walk', 'file:///a/dist/renderer/x.js', 5), node(2, 'walk', 'file:///a/dist/renderer/x.js', 5)],
    samples: [1, 2, 1, 2],
    timeDeltas: [5_000, 5_000, 5_000, 5_000],
  });
  const rows = selfTimes(p);
  assert.equal(rows.length, 1, JSON.stringify(rows));
  assert.equal(rows[0].ms, 20);
});

test('rows come back sorted by cost, worst first', () => {
  const p = profile({
    nodes: [node(1, 'cheap', 'x.js'), node(2, 'dear', 'x.js')],
    samples: [1, 2],
    timeDeltas: [1_000, 50_000],
  });
  assert.deepEqual(selfTimes(p).map((r) => r.name.split('  ')[0]), ['dear', 'cheap']);
});

test('a sample naming an unknown node is skipped, not counted as zero-cost noise', () => {
  const p = profile({ nodes: [node(1, 'real', 'x.js')], samples: [1, 99], timeDeltas: [4_000, 4_000] });
  const rows = selfTimes(p);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ms, 4);
});

test('a negative delta cannot subtract time from a function', () => {
  // Deltas are wall-clock differences and have been seen negative across a
  // suspend. Summed naively that reads as a function that took less than no time.
  const p = profile({ nodes: [node(1, 'f', 'x.js')], samples: [1, 1], timeDeltas: [10_000, -50_000] });
  assert.equal(selfTimes(p)[0].ms, 10);
});

test('buckets name the subsystem a reader would act on', () => {
  const rows = [
    { name: 'exec  dist/x.js:254', ms: 0 },   // ranked by the rules, not the name alone
    { name: 'highlight  node_modules/highlight.js/lib/core.js', ms: 100 },
    { name: 'micromark  node_modules/micromark/index.js', ms: 50 },
    { name: 'commitRoot  node_modules/react-dom/client.js', ms: 25 },
    { name: 'openFile  dist/renderer/assets/index.js', ms: 10 },
    { name: '(garbage collector)  ', ms: 5 },
  ];
  const got = Object.fromEntries(buckets(rows).map((b) => [b.name, b.ms]));
  assert.equal(got['syntax highlighting (lowlight/highlight.js)'], 100);
  assert.equal(got['markdown parse (remark/micromark/mdast)'], 50);
  assert.equal(got['React render + reconcile'], 25);
  assert.equal(got['V8 / GC / runtime'], 5);
});

test('every millisecond lands in exactly one bucket', () => {
  // A bucket list that drops rows under-reports the very thing being chased.
  const rows = [
    { name: 'a  node_modules/highlight.js/x.js', ms: 3 },
    { name: 'b  something/unmatched.js', ms: 7 },
    { name: 'c  dist/renderer/assets/index.js', ms: 11 },
  ];
  const total = buckets(rows).reduce((s, b) => s + b.ms, 0);
  assert.equal(total, 21);
  assert.ok(buckets(rows).some((b) => b.name === 'other'), 'an unmatched frame must still be visible');
});

test('an empty profile answers empty rather than throwing', () => {
  assert.deepEqual(selfTimes(profile({ nodes: [], samples: [], timeDeltas: [] })), []);
  assert.deepEqual(buckets([]), []);
});
