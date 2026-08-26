import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePerfLog, startupTable } from '../metrics-startup.mjs';

// --- Task 8 Step 1 test, from the plan (one expectation corrected) ----------
// The plan asserted didFinishLoad === 800. That was an arithmetic slip in the plan,
// not a code bug: didFinishLoad reads main:main-window:did-finish-load, which this
// fixture puts at t=1600, so with spawnedAt=900 the answer is 700. 800 is the NEXT
// mark (main:post-window:done, t=1700), already asserted separately as postWindowDone.
// Corrected to 700 rather than bending the code, which would have made didFinishLoad
// and postWindowDone report the same number whenever both marks fire.
test('startupTable converts marks to ms-from-spawn and chore durations', () => {
  const log = ['main:module-start', 'main:when-ready', 'main:chore:rotate-log:done', 'main:chore:install-hooks:done', 'main:create-window:start', 'main:create-window:done', 'main:main-window:did-finish-load', 'main:post-window:done']
    .map((name, i) => JSON.stringify({ name, t: 1000 + i * 100, pid: 1 })).join('\n');
  const m = startupTable({ spawnedAt: 900, mainMarks: parsePerfLog(log), timeOrigin: 1500,
    rendererMarks: [{ name: 'yc:index-start', startTime: 50 }, { name: 'yc:root-render', startTime: 60 }, { name: 'yc:app-mounted', startTime: 120 }, { name: 'yc:sessions-listed', startTime: 200 }],
    paint: [{ name: 'first-paint', startTime: 130 }, { name: 'first-contentful-paint', startTime: 140 }] });
  assert.equal(m.whenReady, 200);
  assert.equal(m.chores.rotateLog, 100);
  assert.equal(m.chores.installHooks, 100);
  assert.equal(m.createWindow, 100);            // start→done
  assert.equal(m.didFinishLoad, 700);   // main:main-window:did-finish-load t=1600 − spawnedAt 900
  assert.equal(m.appMounted, 720);              // 1500+120-900
  assert.equal(m.firstContentfulPaint, 740);
  assert.equal(m.sessionsListed, 800);
  assert.equal(m.blankWindowMs, 240);           // FCP 740 − createWindowAt 500: how long the user stares at an empty window
});

// --- parsePerfLog ------------------------------------------------------------

test('parsePerfLog: last occurrence of a duplicated mark name wins', () => {
  const log = [
    JSON.stringify({ name: 'main:when-ready', t: 1000, pid: 1 }),
    JSON.stringify({ name: 'main:when-ready', t: 1050, pid: 1 }), // e.g. a re-exec or a bug that double-marks
  ].join('\n');
  const marks = parsePerfLog(log);
  assert.equal(marks.get('main:when-ready'), 1050);
});

test('parsePerfLog: empty text yields an empty map', () => {
  const marks = parsePerfLog('');
  assert.equal(marks.size, 0);
});

test('parsePerfLog: a truncated final line (crash mid-write) is skipped, not thrown', () => {
  const good = JSON.stringify({ name: 'main:when-ready', t: 1000, pid: 1 });
  const truncated = '{"name":"main:create-window:start","t":140'; // no closing brace — write got cut off
  assert.doesNotThrow(() => {
    const marks = parsePerfLog([good, truncated].join('\n'));
    assert.equal(marks.get('main:when-ready'), 1000);
    assert.equal(marks.has('main:create-window:start'), false);
  });
});

// --- startupTable: missing-mark robustness -----------------------------------

test('startupTable: an empty perf log and no renderer/paint entries produce all-null fields, never NaN/undefined, and does not throw', () => {
  assert.doesNotThrow(() => {
    const m = startupTable({
      spawnedAt: 900,
      mainMarks: parsePerfLog(''),
      rendererMarks: [],
      timeOrigin: 1500,
      paint: [],
    });
    assert.equal(m.whenReady, null);
    assert.equal(m.createWindow, null);
    assert.equal(m.createWindowAt, null);
    assert.equal(m.didFinishLoad, null);
    assert.equal(m.postWindowDone, null);
    assert.equal(m.indexStart, null);
    assert.equal(m.rootRender, null);
    assert.equal(m.firstPaint, null);
    assert.equal(m.firstContentfulPaint, null);
    assert.equal(m.appMounted, null);
    assert.equal(m.sessionsListed, null);
    assert.equal(m.blankWindowMs, null);
    for (const [key] of Object.entries(m.chores)) {
      assert.equal(m.chores[key], null, `chores.${key} should be null, not NaN/undefined`);
    }
    // Belt-and-suspenders: no field anywhere is NaN or undefined.
    const { chores: choresOut, ...topLevel } = m;
    const flat = { ...topLevel, ...choresOut };
    for (const [k, v] of Object.entries(flat)) {
      assert.notEqual(v, undefined, `${k} should never be undefined`);
      if (typeof v === 'number') assert.equal(Number.isNaN(v), false, `${k} should never be NaN`);
    }
  });
});

test('startupTable: a missing MIDDLE chore mark makes that chore null, and the NEXT chore duration spans back to the last mark that DID fire', () => {
  // when-ready @1000, rotate-log:done MISSING, install-hooks:done @1300.
  // installHooks should be 1300 - 1000 = 300 (spans the gap left by the missing rotate-log mark),
  // not 1300 - <something else> and not null/NaN.
  const log = [
    { name: 'main:when-ready', t: 1000 },
    { name: 'main:chore:install-hooks:done', t: 1300 },
  ].map((o) => JSON.stringify({ ...o, pid: 1 })).join('\n');
  const m = startupTable({ spawnedAt: 900, mainMarks: parsePerfLog(log), rendererMarks: [], timeOrigin: 0, paint: [] });
  assert.equal(m.chores.rotateLog, null);
  assert.equal(m.chores.installHooks, 300);
  // Every later chore (also missing) stays null rather than inheriting a stale duration.
  assert.equal(m.chores.hookRelay, null);
});

test('startupTable: renderer marks and paint entries absent leaves those fields null (and blankWindowMs null) rather than NaN', () => {
  const log = [{ name: 'main:when-ready', t: 1000 }, { name: 'main:create-window:start', t: 1100 }]
    .map((o) => JSON.stringify({ ...o, pid: 1 })).join('\n');
  const m = startupTable({ spawnedAt: 900, mainMarks: parsePerfLog(log), rendererMarks: [], timeOrigin: 1500, paint: [] });
  assert.equal(m.indexStart, null);
  assert.equal(m.rootRender, null);
  assert.equal(m.appMounted, null);
  assert.equal(m.sessionsListed, null);
  assert.equal(m.firstPaint, null);
  assert.equal(m.firstContentfulPaint, null);
  // createWindowAt IS available here (its mark fired), but FCP isn't, so blankWindowMs
  // must be null rather than `undefined - 500` (NaN) or silently treating a missing FCP as 0.
  assert.notEqual(m.createWindowAt, null);
  assert.equal(m.blankWindowMs, null);
});

// --- no input mutation --------------------------------------------------------

test('startupTable does not mutate its inputs', () => {
  const log = ['main:module-start', 'main:when-ready', 'main:chore:rotate-log:done', 'main:create-window:start', 'main:create-window:done', 'main:main-window:did-finish-load', 'main:post-window:done']
    .map((name, i) => JSON.stringify({ name, t: 1000 + i * 100, pid: 1 })).join('\n');
  const mainMarks = parsePerfLog(log);
  const mainMarksBefore = [...mainMarks.entries()];
  const rendererMarks = [{ name: 'yc:index-start', startTime: 50 }, { name: 'yc:app-mounted', startTime: 120 }];
  const rendererBefore = JSON.parse(JSON.stringify(rendererMarks));
  const paint = [{ name: 'first-paint', startTime: 130 }, { name: 'first-contentful-paint', startTime: 140 }];
  const paintBefore = JSON.parse(JSON.stringify(paint));
  const args = { spawnedAt: 900, mainMarks, rendererMarks, timeOrigin: 1500, paint };
  const argsKeysBefore = Object.keys(args);

  startupTable(args);

  assert.deepEqual([...mainMarks.entries()], mainMarksBefore);
  assert.deepEqual(rendererMarks, rendererBefore);
  assert.deepEqual(paint, paintBefore);
  assert.deepEqual(Object.keys(args), argsKeysBefore);
  assert.equal(args.spawnedAt, 900);
  assert.equal(args.timeOrigin, 1500);
});
