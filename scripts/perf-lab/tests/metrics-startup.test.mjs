import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePerfLog, startupTable } from '../metrics-startup.mjs';

// --- Task 8 Step 1 test, from the plan --------------------------------------
// Every mark in the fixture below is 100ms after the previous one, so each expected
// value is just (that mark's t) − spawnedAt(900). didFinishLoad and postWindowDone are
// both asserted, and must differ: they read different marks, and a change that made
// them agree whenever both fired would be a bug.
test('startupTable converts marks to ms-from-spawn and chore durations', () => {
  const log = ['main:imports-done', 'main:when-ready', 'main:chore:rotate-log:done', 'main:chore:prelude:done', 'main:chore:install-hooks:done', 'main:create-window:start', 'main:create-window:done', 'main:main-window:did-finish-load', 'main:post-window:done']
    .map((name, i) => JSON.stringify({ name, t: 1000 + i * 100, pid: 1 })).join('\n');
  const m = startupTable({ spawnedAt: 900, mainMarks: parsePerfLog(log), timeOrigin: 1500,
    rendererMarks: [{ name: 'yc:modules-evaluated', startTime: 50 }, { name: 'yc:root-render', startTime: 60 }, { name: 'yc:app-mounted', startTime: 120 }, { name: 'yc:sessions-listed', startTime: 200 }],
    paint: [{ name: 'first-paint', startTime: 130 }, { name: 'first-contentful-paint', startTime: 140 }] });
  assert.equal(m.whenReady, 200);
  assert.equal(m.chores.rotateLog, 100);
  assert.equal(m.chores.prelude, 100);
  assert.equal(m.chores.installHooks, 100);
  // documentStart is the page's navigation start (timeOrigin), NOT a product mark:
  // 1500 − 900. modulesEvaluated − documentStart = 50 is the bundle-evaluation window.
  assert.equal(m.documentStart, 600);
  assert.equal(m.modulesEvaluated, 650);
  assert.equal(m.modulesEvaluated - m.documentStart, 50);
  assert.equal(m.createWindow, 100);            // start→done
  assert.equal(m.didFinishLoad, 800);   // main:main-window:did-finish-load t=1700 − spawnedAt 900
  assert.equal(m.appMounted, 720);              // 1500+120-900
  assert.equal(m.firstContentfulPaint, 740);
  assert.equal(m.sessionsListed, 800);
  assert.equal(m.blankWindowMs, 140);           // FCP 740 − createWindowAt 600: how long the user stares at an empty window
  assert.equal(m.postWindowDone, 900);          // main:post-window:done t=1800 − spawnedAt 900
  assert.notEqual(m.postWindowDone, m.didFinishLoad);
});

// --- documentStart -----------------------------------------------------------

// documentStart exists so the bundle-evaluation window is visible. It costs no product
// code: performance.timeOrigin IS the page's navigation start, and the rig already gets
// it. Pinned separately from the big table test because it is the ONE field derived from
// an argument rather than from a mark, so a refactor could drop it without failing a
// mark-based assertion.
test('startupTable: documentStart is timeOrigin relative to spawn, and brackets modulesEvaluated', () => {
  const m = startupTable({
    spawnedAt: 1000,
    mainMarks: parsePerfLog(''),
    rendererMarks: [{ name: 'yc:modules-evaluated', startTime: 420 }],
    timeOrigin: 1250,
    paint: [],
  });
  assert.equal(m.documentStart, 250);        // 1250 − 1000
  assert.equal(m.modulesEvaluated, 670);     // 1250 + 420 − 1000
  // The recovered measurement: page navigation start → end of bundle evaluation.
  assert.equal(m.modulesEvaluated - m.documentStart, 420);
});

test('startupTable: documentStart is present even with an empty perf log and no renderer marks', () => {
  const m = startupTable({ spawnedAt: 900, mainMarks: parsePerfLog(''), rendererMarks: [], timeOrigin: 1500, paint: [] });
  assert.equal(m.documentStart, 600);
  assert.equal(m.modulesEvaluated, null);
});

// --- CHORES: the key set and its ORDER ---------------------------------------

// The rig bills each chore as mark[n] − mark[n−1], so CHORES' order IS the arithmetic.
// This pins the full list against a literal written out here, and the sibling test
// youcoded/desktop/tests/perf-marks-placement.test.ts pins the same order in main.ts's
// source — together they catch a mark added on one side only, or added in the wrong slot.
test('startupTable: every chore key is produced, in main.ts execution order', () => {
  const SUFFIXES = [
    'rotate-log', 'prelude', 'install-hooks', 'hook-relay', 'legacy-cleanup', 'hook-reconcile',
    'prompt-suggestion', 'retention-default', 'symlink-cleanup', 'stale-downloads', 'reconcile-mcp',
    'announcements', 'remote-server', 'ipc-prefs', 'theme-protocol', 'accounts',
  ];
  const KEYS = [
    'rotateLog', 'prelude', 'installHooks', 'hookRelay', 'legacyCleanup', 'hookReconcile',
    'promptSuggestion', 'retentionDefault', 'symlinkCleanup', 'staleDownloads', 'reconcileMcp',
    'announcements', 'remoteServer', 'ipcPrefs', 'themeProtocol', 'accounts',
  ];
  const log = ['main:when-ready', ...SUFFIXES.map((s) => `main:chore:${s}:done`)]
    .map((name, i) => JSON.stringify({ name, t: 1000 + i * 100, pid: 1 })).join('\n');
  const m = startupTable({ spawnedAt: 1000, mainMarks: parsePerfLog(log), rendererMarks: [], timeOrigin: 0, paint: [] });
  assert.deepEqual(Object.keys(m.chores), KEYS);
  // Marks are 100ms apart, so every chore must read exactly 100 — a key mapped to the
  // wrong suffix would come back null instead.
  for (const key of KEYS) assert.equal(m.chores[key], 100, `chores.${key}`);
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
    assert.equal(m.modulesEvaluated, null);
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
  // when-ready @1000, rotate-log:done and prelude:done MISSING, install-hooks:done @1300.
  // installHooks should be 1300 - 1000 = 300 (spans the gap left by the missing marks),
  // not 1300 - <something else> and not null/NaN.
  const log = [
    { name: 'main:when-ready', t: 1000 },
    { name: 'main:chore:install-hooks:done', t: 1300 },
  ].map((o) => JSON.stringify({ ...o, pid: 1 })).join('\n');
  const m = startupTable({ spawnedAt: 900, mainMarks: parsePerfLog(log), rendererMarks: [], timeOrigin: 0, paint: [] });
  assert.equal(m.chores.rotateLog, null);
  assert.equal(m.chores.prelude, null);
  assert.equal(m.chores.installHooks, 300);
  // Every later chore (also missing) stays null rather than inheriting a stale duration.
  assert.equal(m.chores.hookRelay, null);
});

test('startupTable: renderer marks and paint entries absent leaves those fields null (and blankWindowMs null) rather than NaN', () => {
  const log = [{ name: 'main:when-ready', t: 1000 }, { name: 'main:create-window:start', t: 1100 }]
    .map((o) => JSON.stringify({ ...o, pid: 1 })).join('\n');
  const m = startupTable({ spawnedAt: 900, mainMarks: parsePerfLog(log), rendererMarks: [], timeOrigin: 1500, paint: [] });
  assert.equal(m.modulesEvaluated, null);
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
  const log = ['main:imports-done', 'main:when-ready', 'main:chore:rotate-log:done', 'main:create-window:start', 'main:create-window:done', 'main:main-window:did-finish-load', 'main:post-window:done']
    .map((name, i) => JSON.stringify({ name, t: 1000 + i * 100, pid: 1 })).join('\n');
  const mainMarks = parsePerfLog(log);
  const mainMarksBefore = [...mainMarks.entries()];
  const rendererMarks = [{ name: 'yc:modules-evaluated', startTime: 50 }, { name: 'yc:app-mounted', startTime: 120 }];
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
