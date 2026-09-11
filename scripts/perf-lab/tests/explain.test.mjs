// scripts/perf-lab/tests/explain.test.mjs
//
// THE POINT OF THIS FILE: explain.mjs answers "which step produced this number?",
// and the answer decides whether a change gets blamed for a stall. If it walks the
// tree wrongly — descends into a probe, misses a nested step, ranks the wrong
// column — it does not fail loudly; it names the wrong step, confidently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepsOf, runsOfPhase, renderExplain, STEP_PHASES } from '../explain.mjs';

const step = (mainStall, mainMax, rendererTotal, rendererMax, verdict) => ({
  ipc: { totalStallMs: mainStall, maxMs: mainMax },
  probe: { longtaskTotalMs: rendererTotal, longtaskMaxMs: rendererMax },
  stall: { verdict },
});

const artifactsRun = () => ({
  create: step(0, 1, 68, 68, 'none'),
  open: {
    mdSmall: step(279, 329, 833, 421, 'renderer'),
    mdLarge: step(1312, 1362, 1360, 743, 'renderer'),
    codeSmall: step(0, 6, 0, 0, 'none'),
  },
  files: { mdLarge: { bytes: 401775 } },   // data, not a step
  warnings: [],
});

test('finds NESTED steps, not just top-level ones', () => {
  const found = stepsOf(artifactsRun()).map((s) => s.path);
  assert.ok(found.includes('open.mdLarge'), found.join(', '));
  assert.ok(found.includes('open.mdSmall'));
  assert.ok(found.includes('create'));
});

test('an object with no ipc and no probe is data, not a step', () => {
  const found = stepsOf(artifactsRun()).map((s) => s.path);
  assert.ok(!found.some((p) => p.startsWith('files')), `data counted as a step: ${found.join(', ')}`);
});

test('never descends INTO a measurement', () => {
  // `ipc` and `probe` are the measurement of a step, not steps of their own. A
  // walk that descended would invent step names like `open.mdLarge.ipc`.
  const found = stepsOf(artifactsRun()).map((s) => s.path);
  assert.ok(!found.some((p) => p.includes('.ipc') || p.includes('.probe')), found.join(', '));
});

test('reads both sides of the freeze, and the scenario verdict that names who', () => {
  const md = stepsOf(artifactsRun()).find((s) => s.path === 'open.mdLarge');
  assert.deepEqual(
    { m: md.mainStallMs, mw: md.mainWorstMs, r: md.rendererMs, rw: md.rendererWorstMs, who: md.verdict },
    { m: 1312, mw: 1362, r: 1360, rw: 743, who: 'renderer' },
  );
});

test('ranks by main-process stall by default and by the renderer on request', () => {
  const report = { artifacts: { runs: [artifactsRun()] } };
  const byMain = renderExplain(report, { phase: 'artifacts', top: 2 });
  assert.ok(byMain.indexOf('open.mdLarge') < byMain.indexOf('open.mdSmall'), byMain);

  // A renderer-ranked read must be able to disagree with the main-process one —
  // that disagreement IS the signal (work moved off main is not work removed).
  const rendererHeavy = { artifacts: { runs: [{
    quick: step(900, 900, 10, 10, 'main'),
    slow: step(5, 5, 4000, 700, 'renderer'),
  }] } };
  const byRenderer = renderExplain(rendererHeavy, { phase: 'artifacts', by: 'renderer', top: 2 });
  assert.ok(byRenderer.indexOf('slow') < byRenderer.indexOf('quick'), byRenderer);
  const byMain2 = renderExplain(rendererHeavy, { phase: 'artifacts', by: 'main', top: 2 });
  assert.ok(byMain2.indexOf('quick') < byMain2.indexOf('slow'), byMain2);
});

test('finds the runs of a SIZED phase, not only a flat one', () => {
  // history and replayStall nest their runs under a size; a walker that only knew
  // the flat shape would silently report "no steps" for half the rig.
  const sized = { replayStall: { medium: { runs: [artifactsRun()] }, huge: { runs: [artifactsRun()] } } };
  const labels = runsOfPhase(sized, 'replayStall').map(([l]) => l);
  assert.deepEqual(labels, ['replayStall.medium#1', 'replayStall.huge#1']);
  assert.deepEqual(runsOfPhase({ artifacts: { runs: [1, 2] } }, 'artifacts').map(([l]) => l),
    ['artifacts#1', 'artifacts#2']);
});

test('--run selects one repeat', () => {
  const report = { artifacts: { runs: [
    { onlyInOne: step(1, 1, 1, 1, 'none') },
    { onlyInTwo: step(2, 2, 2, 2, 'none') },
  ] } };
  const two = renderExplain(report, { phase: 'artifacts', run: 2 });
  assert.ok(two.includes('onlyInTwo'), two);
  assert.ok(!two.includes('onlyInOne'), two);
});

test('says so plainly when a report measured nothing', () => {
  assert.match(renderExplain({ artifacts: null }), /no steps found/);
});

test('every phase that owns runs is walked', () => {
  // A phase added to the rig and forgotten here is a phase explain.mjs is blind
  // to, and the blindness reads exactly like "that step cost nothing".
  for (const p of ['artifacts', 'projects', 'workload', 'scrollback', 'history', 'replayStall', 'startup']) {
    assert.ok(STEP_PHASES.includes(p), `${p} missing from STEP_PHASES`);
  }
});
