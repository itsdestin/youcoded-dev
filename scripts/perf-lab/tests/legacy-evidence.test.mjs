import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacyExecution, legacyEvidenceProblems, LEGACY_PHASES, legacyTailRegressions } from '../legacy-evidence.mjs';
import { PRIMARY } from '../compare.mjs';
import { LEGACY_CONTRACTS } from '../legacy-evidence.mjs';
import { validateReport, parseArgs, PHASES } from '../run.mjs';
import { SWITCH_COUNT, GLYPH_LINES } from '../scenario-terminal.mjs';
import { SWITCHES_DURING_STREAM, STREAM_DELTAS } from '../scenario-native-stream.mjs';
import { PAINTED_SAMPLES_PER_SESSION } from '../scenario-workload.mjs';
import { SCROLL_SIZES } from '../scenario-scrollback.mjs';
import { validLegacyReport } from './legacy-fixture.mjs';

for (const phase of ['startup', 'history', 'workload', 'shots', 'stall', 'artifacts', 'projects', 'terminal', 'native-stream', 'native-resume', 'scrollback']) {
  test(`${phase}: complete selected contract passes; missing, failed and nonfinite evidence fails`, () => {
    const report = validLegacyReport([phase]);
    assert.deepEqual(legacyEvidenceProblems(report, { primary: PRIMARY }), []);
    assert.deepEqual(validateReport(report, new Set([phase])), []);
    const spec = report.legacyExecution.phases[phase];
    assert.equal(spec.expectedRepeats, phase === 'shots' ? 1 : 3);
    if (phase === 'shots') {
      report.screens.names.pop();
    } else {
      const group = spec.groups[0];
      const rows = group.split('.').reduce((a, k) => a[k], report).runs;
      rows.pop();
    }
    assert.ok(legacyEvidenceProblems(report, { primary: PRIMARY }).length, phase);
    assert.ok(validateReport(report, new Set([phase])).length, phase);
    if (phase !== 'shots') {
      const get = (o, p) => p.split('.').reduce((a, k) => a[k], o);
      for (const change of [r => { r.timedOut = true; }, r => { r.ok = false; }, r => {
        const p = LEGACY_CONTRACTS[phase].finite[0].split('.'), key = p.pop();
        const at = p.reduce((a, k) => a[k], r); at[key] = NaN;
      }]) {
        const broken = validLegacyReport([phase]);
        change(get(broken, spec.groups[0]).runs[2]);
        assert.ok(legacyEvidenceProblems(broken, { primary: PRIMARY }).length, phase);
        assert.ok(validateReport(broken, new Set([phase])).length, phase);
      }
    }
  });
}

test('all CLI phases and actual scenario dimensions are pinned by the contract', () => {
  assert.deepEqual(LEGACY_PHASES, PHASES);
  const cfg = parseArgs(['--only', 'startup,terminal', '--runs', '7', '--terminal-repeats', '5']);
  const m = buildLegacyExecution(cfg);
  assert.equal(m.phases.startup.expectedRepeats, 7);
  assert.equal(m.phases.terminal.expectedRepeats, 5);
  assert.equal(m.phases.terminal.options.switchCount, SWITCH_COUNT);
  assert.equal(m.phases.terminal.options.glyphLines, GLYPH_LINES);
  assert.equal(LEGACY_CONTRACTS['native-stream'].options.switchCount, SWITCHES_DURING_STREAM);
  assert.equal(LEGACY_CONTRACTS['native-stream'].options.deltas, STREAM_DELTAS);
  assert.equal(LEGACY_CONTRACTS.workload.arrays[0].paintedFirst, PAINTED_SAMPLES_PER_SESSION * 6);
  assert.deepEqual(LEGACY_CONTRACTS.scrollback.required.map(p => p.split('.')[1]).sort(), [...SCROLL_SIZES].sort());
});

test('execution counts come from actual cfg and old missing manifests fail closed', () => {
  const manifest = buildLegacyExecution({ only: new Set(['history', 'terminal']), historyRepeats: 5, terminalRepeats: 7 });
  assert.equal(manifest.phases.history.expectedRepeats, 5);
  assert.equal(manifest.phases.terminal.expectedRepeats, 7);
  assert.deepEqual(Object.keys(manifest.phases), ['history', 'terminal']);
  const r = validLegacyReport(['startup']); delete r.legacyExecution;
  assert.match(legacyEvidenceProblems(r, { primary: PRIMARY }).join(' '), /manifest/i);
});

test('a missing/nonfinite/timeout third repeat is not filtered away', () => {
  for (const mutate of [r => r.history.medium.runs.pop(), r => { r.history.medium.runs[2].resumeStableMs = NaN; }, r => { r.history.medium.runs[2].stability = 'timeout'; }]) {
    const r = validLegacyReport(['history']); mutate(r);
    assert.ok(legacyEvidenceProblems(r, { primary: PRIMARY }).length);
  }
});

test('conditional project switch is absent only when the intended project was already open', () => {
  const r = validLegacyReport(['projects']);
  r.projects.runs[2].switchToBig = null;
  assert.deepEqual(legacyEvidenceProblems(r, { primary: PRIMARY }), []);
  r.projects.runs[2].open.hero = 'different-project';
  assert.ok(legacyEvidenceProblems(r, { primary: PRIMARY }).some(p => p.includes('switchToBig')));
  r.projects.runs[2].switchToBig = { ...structuredClone(r.projects.runs[2].open), ok: true, ms: 100 };
  assert.deepEqual(legacyEvidenceProblems(r, { primary: PRIMARY }), []);
});

test('manifest contract identities cannot be weakened to match missing evidence', () => {
  for (const mutate of [
    r => { r.legacyExecution.phases.projects.steps.pop(); },
    r => { r.legacyExecution.phases.projects.rows.pop(); },
    r => { r.legacyExecution.phases.projects.options.thrashRounds = 7; },
    r => { r.legacyExecution.revision = 0; },
  ]) {
    const r = validLegacyReport(['projects']); mutate(r);
    assert.ok(legacyEvidenceProblems(r, { primary: PRIMARY }).length);
  }
});

test('required step and row identities cannot disappear behind successful summaries', () => {
  for (const [phase, mutate] of [
    ['artifacts', r => { delete r.artifacts.runs[2].open.mdSmall; }],
    ['artifacts', r => { r.artifacts.runs[2].htmlNav.swaps[2].ok = false; }],
    ['projects', r => { r.projects.runs[2].thrash.toFiles.samples.pop(); }],
    ['terminal', r => { r.terminal.runs[2].switches[2].i = 1; }],
    ['native-resume', r => { r.nativeResume.runs[2].pageUp.timedOut = true; }],
    ['native-stream', r => { r.nativeStream.runs[2].hidden.aborted = true; }],
    ['scrollback', r => { r.scrollback.runs[2].perSize.huge.reachedTop = false; }],
    ['workload', r => { r.workload.runs[2].switches[2].ms = Infinity; }],
  ]) {
    const r = validLegacyReport([phase]); mutate(r);
    assert.ok(legacyEvidenceProblems(r, { primary: PRIMARY }).length, phase);
  }
});

test('two fast repeats and one disaster veto even when median improves, including target', () => {
  const b = validLegacyReport(['history']), c = validLegacyReport(['history']);
  for (const r of b.history.medium.runs) r.resumeStableMs = 100;
  for (const [i, r] of c.history.medium.runs.entries()) r.resumeStableMs = [50, 50, 5000][i];
  const tails = legacyTailRegressions(b, c, ['history.medium.median.resumeStableMs'], { regressMaxPct: 3, zeroFloor: 1 });
  assert.equal(tails.length, 1);
  assert.equal(tails[0].cand, 5000);
  assert.equal(tails[0].repeat, 2);
});

test('tail threshold uses strict configured margin plus baseline spread and a one-unit floor', () => {
  const path = 'history.medium.median.resumeStableMs';
  const b = validLegacyReport(['history']), c = validLegacyReport(['history']);
  for (const [base, candidate, rejected] of [[100, 103, false], [100, 104, true], [0, 1, false], [0, 2, true]]) {
    b.history.medium.runs.forEach(r => { r.resumeStableMs = base; });
    c.history.medium.runs.forEach(r => { r.resumeStableMs = candidate; });
    assert.equal(legacyTailRegressions(b, c, [path], { regressMaxPct: 3, zeroFloor: 1 }).length > 0, rejected);
  }
});

test('malformed selection and screen identities return validity problems rather than throwing', () => {
  const invalidCount = validLegacyReport(['shots']); invalidCount.legacyExecution.phases.shots.expectedRepeats = 2;
  assert.ok(legacyEvidenceProblems(invalidCount).some(p => /exactly 1/.test(p)));
  const orphanIdle = validLegacyReport(['history']); orphanIdle.idle = { cpuPct: { runs: [1, 1, 1], median: 1 } };
  assert.ok(legacyEvidenceProblems(orphanIdle).some(p => /startup.*manifest/.test(p)));
  const r = validLegacyReport(['shots']); r.screens.names = {};
  assert.ok(legacyEvidenceProblems(r).length);
  r.legacyExecution.phases.toString = {};
  assert.ok(legacyEvidenceProblems(r).some(p => /unknown phase/.test(p)));
});

test('tail noise guard respects baseline spread and rounding floor; ignores numeric context and document controls', () => {
  const b = validLegacyReport(['history']), c = validLegacyReport(['history']);
  b.history.medium.runs.forEach((r, i) => { r.resumeStableMs = [80, 100, 120][i]; });
  c.history.medium.runs.forEach(r => { r.resumeStableMs = 130; });
  c.artifacts = { documents: { controls: [{ operationMs: 999999 }] } };
  assert.deepEqual(legacyTailRegressions(b, c, ['history.medium.median.resumeStableMs'], { regressMaxPct: 3, zeroFloor: 1 }), []);
  assert.equal(LEGACY_PHASES.length, 11);
});
