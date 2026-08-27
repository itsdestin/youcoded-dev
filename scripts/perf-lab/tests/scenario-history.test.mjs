// Unit tests for scenario-history.mjs — the parts that can be checked without an app.
//
// WHY these exist: this module cannot be smoke-tested until a packaged build and Xvfb
// are in place, and its riskiest content is JavaScript SOURCE embedded in template
// literals and shipped to the renderer. A typo there fails at run time inside CDP with
// a useless message. The fake cdp below PARSES every expression the module emits
// (new Function, never executed), so a broken in-page script fails here instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, medianRun, MESSAGE_COUNT_EXPR, NUMERIC_KEYS, runHistoryScenario } from '../scenario-history.mjs';

const fixture = {
  projects: { alpha: '/tmp/perf/alpha' },
  transcripts: {
    small: { sessionId: 'aaa', slug: '-tmp-perf-alpha', turns: 50 },
    medium: { sessionId: 'bbb', slug: '-tmp-perf-alpha', turns: 2500 },
    huge: { sessionId: 'ccc', slug: '-tmp-perf-alpha', turns: 25000 },
  },
};

const SIZE_OF_ID = { aaa: 'small', bbb: 'medium', ccc: 'huge' };

/** Fake CDP: parses each emitted expression, then answers with canned data. */
function fakeApp({ ipc = () => ({}), watch = () => ({}), destroyOk = true } = {}) {
  let size = 'small';
  return {
    cdp: {
      async evaluate(expr) {
        // Parse-only check — proves the generated in-page source is valid JS.
        new Function(`return (${expr});`);
        for (const [id, name] of Object.entries(SIZE_OF_ID)) if (expr.includes(`"${id}"`)) size = name;
        if (expr.includes('loadHistory')) {
          const turns = fixture.transcripts[size].turns;
          return { ok: true, ipcLast10Ms: 5, ipcAllMs: 40, ipcAllCount: 2 * turns, last10: 10, ...ipc(size) };
        }
        if (expr.includes('session.create')) {
          return { ok: true, id: `s-${size}`, samples: 100, maxGapMs: 18, visibility: 'visible', timedOut: false, firstMs: 30, stableMs: 200, count: 100, ...watch(size) };
        }
        if (expr.includes('session.destroy')) return destroyOk ? { ok: true } : { ok: false, error: 'no such session' };
        return 0; // MESSAGE_COUNT_EXPR
      },
    },
  };
}

test('median ignores nulls and returns null when there is nothing numeric', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([null, null]), null);
  assert.equal(median([]), null);
  assert.equal(median([null, 7]), 7);
  // NaN must not survive into a report as a "number".
  assert.equal(median([NaN]), null);
});

test('medianRun covers exactly the numeric keys and keeps an all-null field null', () => {
  const runs = [
    { ipcLast10Ms: 1, ipcAllMs: 10, ipcAllCount: 100, resumeFirstMessageMs: 5, resumeStableMs: null, resumeMessageCount: 50, stability: 'timeout', warnings: ['a'] },
    { ipcLast10Ms: 3, ipcAllMs: 20, ipcAllCount: 100, resumeFirstMessageMs: 7, resumeStableMs: null, resumeMessageCount: 50, stability: 'timeout', warnings: [] },
  ];
  const m = medianRun(runs);
  assert.deepEqual(Object.keys(m).sort(), [...NUMERIC_KEYS].sort());
  assert.equal(m.resumeStableMs, null);
  assert.equal(m.ipcAllMs, 20);
  assert.ok(!('warnings' in m) && !('stability' in m));
});

test('the message-count selector is scoped to the visible ChatView', () => {
  assert.match(MESSAGE_COUNT_EXPR, /\.chat-scroll \.timeline-entry/);
  assert.match(MESSAGE_COUNT_EXPR, /aria-hidden/);
  assert.doesNotMatch(MESSAGE_COUNT_EXPR, /data-message-id/);
  new Function(`return (${MESSAGE_COUNT_EXPR});`);
});

test('happy path produces a run + median per size and emits valid in-page JS', async () => {
  const app = fakeApp();
  const out = await runHistoryScenario(app, fixture, { repeats: 2 });
  assert.deepEqual(Object.keys(out), ['small', 'medium', 'huge']);
  assert.equal(out.huge.runs.length, 2);
  assert.equal(out.huge.median.ipcAllCount, 50000);
  assert.equal(out.huge.median.resumeStableMs, 200);
  assert.equal(out.small.stabilizedRuns, 2);
  assert.deepEqual(out.small.warnings, []);
});

test('a transcript-size disagreement fails loudly with BOTH numbers', async () => {
  const app = fakeApp({ ipc: () => ({ ipcAllCount: 99 }) });
  await assert.rejects(
    () => runHistoryScenario(app, fixture, { repeats: 1 }),
    /returned 99 messages, fixture wrote 50 turns = 100 messages/,
  );
});

test('a never-stabilizing timeline reports null, not 0, and says so', async () => {
  const app = fakeApp({
    watch: (size) => (size === 'small' ? { timedOut: true, firstMs: 40, stableMs: null, count: 7, lastChangeMs: 300, switched: true } : {}),
  });
  const out = await runHistoryScenario(app, fixture, { repeats: 2 });
  assert.equal(out.small.median.resumeStableMs, null);
  assert.equal(out.small.runs[0].resumeStableMs, null);
  assert.notEqual(out.small.runs[0].resumeStableMs, 0);
  assert.equal(out.small.stabilizedRuns, 0);
  assert.match(out.small.warnings.join(' '), /never stabilized/);
});

test('a rejected session.create names the size and repeats the app\'s own words', async () => {
  const app = fakeApp({
    watch: () => ({ ok: false, phase: 'create', error: "Error invoking remote method 'session:create': boom" }),
  });
  await assert.rejects(
    () => runHistoryScenario(app, fixture, { repeats: 1 }),
    /resuming 'small'.*boom/s,
  );
});

test('a failing destroy is a warning, not a lost measurement', async () => {
  const app = fakeApp({ destroyOk: false });
  const out = await runHistoryScenario(app, fixture, { repeats: 1 });
  assert.equal(out.small.runs[0].resumeStableMs, 200);
  assert.match(out.small.warnings.join(' '), /session\.destroy.*no such session/);
});

test('a throttled or hidden renderer is flagged rather than silently trusted', async () => {
  const app = fakeApp({ watch: () => ({ visibility: 'hidden', maxGapMs: 1000 }) });
  const out = await runHistoryScenario(app, fixture, { repeats: 1 });
  assert.match(out.small.warnings.join(' '), /visibilityState was 'hidden'/);
  assert.match(out.small.warnings.join(' '), /stalled up to 1000ms/);
});
