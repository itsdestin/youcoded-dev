import test from 'node:test';
import assert from 'node:assert/strict';
import { verdict, PRIMARY } from '../compare.mjs';
import { validateReport } from '../run.mjs';
import { LEGACY_PHASES, LEGACY_CONTRACTS } from '../legacy-evidence.mjs';
import { validLegacyReport } from './legacy-fixture.mjs';

const get = (o, p) => p.split('.').reduce((a, k) => a[k], o);
const descriptor = phase => ({ scenario: phase, question: `Measure ${phase}?`, configuration: ['bounded unit fixture'], clocks: { ms: 'monotonic elapsed' }, blindTo: [] });
const report = phases => {
  const r = validLegacyReport(phases);
  return Object.assign(r, {
    stallMeasurementRevision: 2, aborted: null, incomplete: [],
    machine: { cpu: 'unit CPU', ramGb: 32, kernel: 'unit', node: 'v26', renderer: { source: 'SystemInfo', glRenderer: 'llvmpipe', accelerated: false, featureStatus: { gpu_compositing: 'disabled_software' }, error: null } },
    noise: { loadAvgBefore: 0, machineBusyPctBefore: 0, maxLoadAvgAccepted: 1, maxBusyPctAccepted: 1 },
    measures: Object.fromEntries(phases.filter(p => !['startup', 'shots'].includes(p)).map(p => [p === 'stall' ? 'stall' : LEGACY_CONTRACTS[p].section, descriptor(p)])),
  });
};
const target = 'startup.median.sessionsListed';
const improve = r => {
  r.startup.median.sessionsListed = 50;
  for (const row of r.startup.runs) row.sessionsListed = 50;
};

for (const phase of LEGACY_PHASES) {
  test(`${phase}: run and compare refuse missing third/failure evidence; intentional selection remains comparable`, () => {
    const selected = [...new Set(['startup', phase])];
    const b = report(selected), c = structuredClone(b); improve(c);
    assert.deepEqual(validateReport(c, new Set(selected)), []);
    const good = verdict(b, c, { target });
    assert.equal(good.keep, true, JSON.stringify(good));
    const path = c.legacyExecution.phases[phase].groups[0];
    if (phase === 'shots') {
      c.screens.failures.push('missing screenshot');
    } else {
      get(c, path).runs.pop();
    }
    assert.ok(validateReport(c, new Set(selected)).length);
    assert.equal(verdict(b, c, { target }).status, 'inconclusive');
    if (phase !== 'shots') {
      for (const mutate of [row => { row.timedOut = true; }, row => { row.unsupported = true; }, row => {
        const parts = LEGACY_CONTRACTS[phase].finite[0].split('.'), k = parts.pop();
        const at = parts.reduce((a, p) => a[p], row); at[k] = Infinity;
      }]) {
        const broken = structuredClone(b); improve(broken);
        mutate(get(broken, path).runs[2]);
        assert.ok(validateReport(broken, new Set(selected)).length, phase);
        assert.equal(verdict(b, broken, { target }).status, 'inconclusive', phase);
      }
    }
  });
}

test('every actual required IPC step/slot/leg fails both gates when coverage fields disappear or visibility is hidden', () => {
  // Enumerated independently from LEGACY_CONTRACTS to pin real producer paths.
  const paths = {
    artifacts: ['create', 'drawerOpen', 'open.codeSmall', 'open.codeLarge', 'open.mdSmall', 'open.mdLarge', 'open.htmlSmall', 'htmlNav', 'typing.codeSmall', 'typing.codeLarge', 'copy'],
    projects: ['open', 'search', 'searchClear', 'filter', 'scrollFlat', 'listView', 'filterClear', 'switch.small', 'switch.big', 'conversations', 'thrash', 'close', 'reopen'],
    'native-resume': ['createCc', 'browse', 'reveal', 'resume', 'pageUp', 'turn', 'tearoff', 'detachedTurn'],
    terminal: ['switches.0', 'switches.39'],
    'native-stream': ['visible', 'switching', 'hidden'],
  };
  const literal = () => ({ pings: 3, totalStallMs: 0, maxMs: 1, openStallMs: null, rejectedPings: 0,
    sawHidden: false, tickSamples: 2, observedMs: 101, maxTickDelayMs: 0 });
  for (const [phase, steps] of Object.entries(paths)) {
    const selected = ['startup', phase], b = report(selected), good = structuredClone(b); improve(good);
    for (const step of steps) get(good, `${LEGACY_CONTRACTS[phase].section}.runs.2.${step}`).ipc = literal();
    assert.equal(verdict(b, good, { target }).keep, true, phase);
    for (const step of steps) for (const missing of ['pings', 'totalStallMs', 'openStallMs', 'rejectedPings', 'sawHidden', 'tickSamples', 'observedMs', 'maxTickDelayMs', 'maxMs', 'hidden']) {
      const c = structuredClone(good), evidence = get(c, `${LEGACY_CONTRACTS[phase].section}.runs.2.${step}`).ipc;
      if (missing === 'hidden') evidence.sawHidden = true; else delete evidence[missing];
      const label = `${phase}.${step}.${missing}`;
      assert.ok(validateReport(c, new Set(selected)).length, label);
      assert.equal(verdict(b, c, { target }).status, 'inconclusive', label);
    }
  }
});

test('literal project keystroke samples, with no count field, pass both gates', () => {
  const b = report(['startup', 'projects']), c = structuredClone(b); improve(c);
  c.projects.runs.forEach(r => { r.search.keystroke = { samples: [1, 2, 3, 4, 5, 6, 7], dropped: 0, medianMs: 4, p95Ms: 7 }; });
  assert.deepEqual(validateReport(c, new Set(['startup', 'projects'])), []);
  assert.equal(verdict(b, c, { target }).keep, true);
});

test('every PRIMARY raw path rejects a nonfinite third observation in both run and compare', () => {
  const b = report(LEGACY_PHASES);
  for (const path of PRIMARY) {
    const c = structuredClone(b); improve(c);
    const parts = path.split('.'), at = parts.indexOf('median'), group = parts.slice(0, at).join('.');
    const rows = get(c, group).runs, tail = parts.slice(at + 1);
    if (tail.length === 0) rows[2] = NaN;
    else {
      const key = tail.pop(), row = tail.reduce((o, k) => o[k], rows[2]); row[key] = NaN;
    }
    assert.ok(validateReport(c, new Set(LEGACY_PHASES)).some(p => p.includes(path) || p.includes(group)), path);
    assert.equal(verdict(b, c, { target }).status, 'inconclusive', path);
  }
});

test('missing third repeat in every declared group and sparse array holes cannot pass', () => {
  const b = report(LEGACY_PHASES);
  for (const spec of Object.values(b.legacyExecution.phases)) for (const group of spec.groups) {
    for (const sparse of [false, true]) {
      const c = structuredClone(b); improve(c);
      if (sparse) delete get(c, group).runs[2]; else get(c, group).runs.pop();
      assert.ok(validateReport(c, new Set(LEGACY_PHASES)).length, group);
      assert.equal(verdict(b, c, { target }).status, 'inconclusive', group);
    }
  }
});

test('worst raw tail vetoes median improvement for both target and non-target PRIMARY', () => {
  for (const metric of PRIMARY) {
    const b = report(LEGACY_PHASES), c = structuredClone(b); improve(c);
    const parts = metric.split('.'), at = parts.indexOf('median');
    const section = get(c, parts.slice(0, at).join('.')), tail = parts.slice(at + 1);
    if (tail.length === 0) { section.runs = [50, 50, 5000]; section.median = 50; }
    else {
      const key = tail.pop();
      section.runs.forEach((r, i) => { tail.reduce((a, k) => a[k], r)[key] = [50, 50, 5000][i]; });
      tail.reduce((a, k) => a[k], section.median)[key] = 50;
    }
    assert.deepEqual(validateReport(c, new Set(LEGACY_PHASES)), [], metric);
    const result = verdict(b, c, { target });
    assert.equal(result.status, 'reject');
    assert.ok(result.tailRegressions.some(r => r.path === metric && r.repeat === 2 && r.cand === 5000));
    assert.match(result.reasons.join(' '), /severe raw-repeat tail/);
  }
});

test('missing execution manifest cannot masquerade as new semantics on either gate', () => {
  const b = report(['startup']), c = structuredClone(b); improve(c);
  delete b.legacyExecution;
  assert.ok(validateReport(b, new Set(['startup'])).some(p => /manifest/.test(p)));
  assert.equal(verdict(b, c, { target }).status, 'inconclusive');
});

test('only PRIMARY lower-is-better metrics get tail budgets, never numeric context', () => {
  const b = report(['startup']), c = structuredClone(b); improve(c);
  c.startup.runs[2].diagnosticContexts = { throughput: 999999, releaseMb: 999999, controlDuration: 999999 };
  const result = verdict(b, c, { target });
  assert.equal(result.keep, true, JSON.stringify(result));
  assert.ok(result.tailRegressions.every(r => PRIMARY.includes(r.path)));
});
