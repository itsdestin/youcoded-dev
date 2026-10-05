import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessComparability } from '../comparability.mjs';

const example = () => ({
  machine: { cpu: 'Example CPU', ramGb: 32, kernel: '6.1.0', node: 'v26.0.0', renderer: {
    source: 'SystemInfo', glRenderer: 'llvmpipe (LLVM 19.1.7)', accelerated: false,
    featureStatus: { gpu_compositing: 'disabled_software' }, error: null,
  } },
  noise: { loadAvgBefore: 0.7, machineBusyPctBefore: 2, maxLoadAvgAccepted: 1.1, maxBusyPctAccepted: 4, discardedRuns: 0 },
  measures: { history: { scenario: 'history', question: 'How long does loading a conversation take, at three sizes?',
    configuration: ['one session at a time', 'three sizes: small, medium, huge'],
    clocks: { resumeStableMs: 'resume -> rendered entry count stops changing' }, blindTo: ['multi-session cost'] } },
  aborted: null, incomplete: [],
  history: { medium: { median: { resumeStableMs: 100 } } },
});
const copy = (v) => structuredClone(v);
const compare = (change) => { const b = example(); const c = copy(b); change(c); return assessComparability(b, c); };

test('matched report identities and overlapping descriptors are comparable with a midrun warning', () => {
  const result = assessComparability(example(), example());
  assert.equal(result.comparable, true, result.reasons.join('; '));
  assert.deepEqual(result.reasons, []);
  assert.match(result.warnings.join(' '), /pre-boot.*midrun|midrun.*pre-boot/i);
});

test('machine identity must be present and exactly equal', () => {
  for (const [key, changed] of [['cpu', 'Other CPU'], ['kernel', '6.2'], ['node', 'v27'], ['ramGb', 64]]) {
    const result = compare((c) => { c.machine[key] = changed; });
    assert.equal(result.comparable, false, key);
    assert.match(result.reasons.join(' '), new RegExp(key, 'i'));
  }
  for (const key of ['cpu', 'kernel', 'node', 'ramGb']) {
    for (const invalid of [undefined, null, '', NaN, Infinity, -1]) {
      const result = compare((c) => { c.machine[key] = invalid; });
      assert.equal(result.comparable, false, `${key}: ${String(invalid)}`);
    }
  }
});

test('renderer string, acceleration lane and known compositing must match', () => {
  for (const [key, value] of [['glRenderer', 'AMD Radeon'], ['accelerated', true]]) {
    const result = compare((c) => { c.machine.renderer[key] = value; });
    assert.equal(result.comparable, false);
    assert.match(result.reasons.join(' '), /renderer/);
  }
  assert.equal(compare((c) => { c.machine.renderer.glVersion = 'OpenGL 4.6'; }).comparable, false);
  const changedMode = compare((c) => { c.machine.renderer.featureStatus.gpu_compositing = 'enabled'; });
  assert.equal(changedMode.comparable, false);
  assert.match(changedMode.reasons.join(' '), /gpu_compositing/);
  for (const invalid of [null, {}, { glRenderer: 'llvmpipe', accelerated: false, featureStatus: {} }]) {
    assert.equal(compare((c) => { c.machine.renderer = invalid; }).comparable, false);
  }
  for (const change of [
    (r) => { r.error = 'CDP failed'; }, (r) => { r.glRenderer = ' '; },
    (r) => { r.accelerated = null; }, (r) => { r.featureStatus.gpu_compositing = 'mystery'; },
    (r) => { r.source = 'webgl'; }, (r) => { r.accelerated = true; },
  ]) assert.equal(compare((c) => change(c.machine.renderer)).comparable, false);
});

test('every recorded GPU feature status must be valid and match, not just compositing', () => {
  const b = example(); const c = copy(b);
  b.machine.renderer.featureStatus.rasterization = 'disabled_software';
  c.machine.renderer.featureStatus.rasterization = 'enabled_on';
  const changed = assessComparability(b, c);
  assert.equal(changed.comparable, false);
  assert.match(changed.reasons.join(' '), /featureStatus|rasterization/i);
  for (const invalid of [null, 5, '', ' ', [], { bogus: true }]) {
    const result = compare((report) => { report.machine.renderer.featureStatus.rasterization = invalid; });
    assert.equal(result.comparable, false, `malformed rasterization: ${String(invalid)}`);
  }
  assert.equal(compare((report) => { report.machine.renderer.featureStatus = 'disabled_software'; }).comparable, false);
  assert.equal(compare((report) => { report.machine.renderer.featureStatus = { gpu_compositing: 'disabled_software', rasterization: 'enabled_on' }; }).comparable, false);
});

test('pre-boot noise requires four real accepted samples within runner limits', () => {
  for (const key of ['loadAvgBefore', 'machineBusyPctBefore', 'maxLoadAvgAccepted', 'maxBusyPctAccepted']) {
    for (const invalid of [undefined, null, NaN, Infinity, -1, key.includes('LoadAvg') ? 4 : 10]) {
      const result = compare((c) => { c.noise[key] = invalid; });
      assert.equal(result.comparable, false, `${key}: ${String(invalid)}`);
      assert.match(result.reasons.join(' '), /noise/);
    }
  }
  const loadAtLimit = compare((c) => { c.noise.loadAvgBefore = 4; c.noise.maxLoadAvgAccepted = 4; });
  assert.equal(loadAtLimit.comparable, false, 'loadAvgBefore at 4 must not pass the busy-percent limit of 10');
  assert.match(loadAtLimit.reasons.join(' '), /noise\.loadAvgBefore.*< 4/);
  assert.equal(compare((c) => { c.noise.maxLoadAvgAccepted = 0.2; }).comparable, false);
});

test('aborted, incomplete and malformed reports cannot certify a comparison', () => {
  for (const change of [
    (c) => { c.aborted = 'deadline'; }, (c) => { delete c.aborted; },
    (c) => { c.aborted = undefined; }, (c) => { c.incomplete = ['history.huge']; },
    (c) => { delete c.incomplete; }, (c) => { c.incomplete = null; },
    (c) => { c.measures = {}; }, (c) => { c.measures.history.configuration = [null]; },
  ]) assert.equal(compare(change).comparable, false);
  assert.equal(assessComparability(null, example()).comparable, false);
});

test('overlapping measured descriptors differ or disappear rather than silently match', () => {
  for (const change of [
    (c) => { c.measures.history.configuration[1] = 'four sizes'; },
    (c) => { c.measures.history.clocks.resumeStableMs = 'first message only'; },
    (c) => { delete c.measures.history; },
  ]) {
    const result = compare(change);
    assert.equal(result.comparable, false);
    assert.match(result.reasons.join(' '), /measures\.history/);
  }
  const b = example(); const c = example();
  b.measures.workload = copy(b.measures.history);
  c.measures.workload = copy(c.measures.history);
  assert.equal(assessComparability(b, c).comparable, true);
});

test('app CPU rate is not pre-boot external noise', () => {
  const b = example(); const c = copy(b);
  b.workload = { median: { cpuDuringPct: 30 } };
  c.workload = { median: { cpuDuringPct: 1 } };
  b.measures.workload = copy(b.measures.history);
  c.measures.workload = copy(c.measures.history);
  const result = assessComparability(b, c);
  assert.equal(result.comparable, true, result.reasons.join('; '));
});

test('CLI prints INCONCLUSIVE and exits nonzero for mismatched renderers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-compare-'));
  try {
    const b = example(); const c = copy(b);
    c.machine.renderer.glRenderer = 'AMD Radeon';
    // WHY: an inconclusive verdict must not depend on screenshot files existing.
    // This deliberately points at nonexistent paths, never launches a browser.
    b.screens = { dir: join(dir, 'missing-before'), names: ['welcome'] };
    c.screens = { dir: join(dir, 'missing-after'), names: ['welcome'] };
    const before = join(dir, 'before.json'); const after = join(dir, 'after.json');
    writeFileSync(before, JSON.stringify(b)); writeFileSync(after, JSON.stringify(c));
    const cli = fileURLToPath(new URL('../compare.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, before, after], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /VERDICT: INCONCLUSIVE/);
    assert.doesNotMatch(result.stdout, /VERDICT: KEEP/);
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); }
});
