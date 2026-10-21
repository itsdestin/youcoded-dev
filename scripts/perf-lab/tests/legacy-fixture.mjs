import { buildLegacyExecution, LEGACY_CONTRACTS, phaseForMetric } from '../legacy-evidence.mjs';
import { PRIMARY } from '../compare.mjs';
import { sampleIdentity } from '../identity.mjs';

const set = (o, path, value) => {
  const parts = path.split('.'), key = parts.pop();
  let at = o;
  for (const part of parts) at = (at[part] ??= {});
  at[key] = value;
};
const get = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
const ipc = () => ({ maxMs: 100, totalStallMs: 0, openStallMs: null, pings: 4, tickSamples: 4, observedMs: 1000, maxTickDelayMs: 1, rejectedPings: 0, sawHidden: false });

export function validLegacyRow(phase, spec, group) {
  const c = LEGACY_CONTRACTS[phase], row = {};
  for (const path of c.required ?? []) set(row, path, {});
  for (const path of c.ipc ?? []) set(row, path, ipc());
  for (const path of c.steps ?? []) set(row, path, { ok: true, ipc: ipc(), probe: { windowMs: 1000, longtaskMaxMs: 100, longtaskSupported: true } });
  for (const path of c.finite ?? []) set(row, path, 100);
  for (const path of c.positive ?? []) set(row, path, 4);
  for (const [path, value] of Object.entries(c.equals ?? {})) set(row, path, value);
  for (const [path, value] of Object.entries(c.expectedCounts ?? {})) set(row, path, value);
  for (const [path, option] of Object.entries(c.counts ?? {})) set(row, path, spec.options[option]);
  for (const a of c.arrays ?? []) set(row, a.path, Array.from({ length: a.fixedCount ?? spec.options[a.count] }, (_, i) => a.numeric ? 100 : {
    ...(a.targetCycle ? { idx: i % a.targetCycle } : {}),
    ...(a.id ? { [a.id]: a.ids?.[i] ?? i } : {}), ...(a.ok ? { ok: true } : {}), ...(a.duringStream ? { duringStream: true } : {}),
    ...Object.fromEntries((a.finite ?? []).map(key => [key, 100])),
    ...(a.painted ? { paintedMs: 100, settled: true, short: false, over: false } : {}), ...(a.ipc ? { ipc: ipc() } : {}),
  }));
  for (const p of PRIMARY.filter(p => p.startsWith(`${group}.median.`))) set(row, p.slice(`${group}.median.`.length), 100);
  if (phase === 'projects') { row.project = { name: 'project' }; row.open.hero = 'project'; }
  if (phase === 'artifacts') row.typing.codeLarge.keystroke.medianMs = 100;
  if (phase === 'native-resume') row.tearoff.windows = 2;
  if (phase === 'stall') {
    row.ipcEvidence = ipc(); row.longtaskSupported = true;
    row.rendererLongtaskCount = 1; row.rendererLongtaskTotalMs = 100; row.rendererLongtaskMaxMs = 100;
  }
  return row;
}

export function validLegacyReport(phases, repeats = 3) {
  const cfg = { only: new Set(phases) };
  for (const c of Object.values(LEGACY_CONTRACTS)) if (c.count) cfg[c.count] = repeats;
  // WHY identity: assessComparability now refuses reports without it (acceptance A3).
  const report = { legacyExecution: buildLegacyExecution(cfg), identity: sampleIdentity() };
  for (const phase of phases) {
    const spec = report.legacyExecution.phases[phase];
    if (phase === 'shots') { report.screens = { names: spec.names.slice(), failures: [] }; continue; }
    for (const group of spec.groups) {
      const rows = Array.from({ length: repeats }, () => group.startsWith('idle.') ? 100 : validLegacyRow(phase, spec, group));
      const med = group.startsWith('idle.') ? 100 : structuredClone(rows[0]);
      set(report, group, { runs: rows, median: med, ...(phase === 'stall' ? { blame: { verdict: 'unknown', why: 'No independent main sample' } } : {}) });
      if (phase === 'scrollback') for (const leg of Object.values(med.perSize)) leg.reachedTopEveryRun = true;
    }
  }
  return report;
}

// Upgrade pre-contract synthetic fixtures with explicit successful observations.
// Called at fixture construction, BEFORE tests deliberately remove/corrupt rows.
// Existing metrics stay intact; absent contract-only observations use valid defaults.
export function addLegacyFixtureEvidence(report, phases, counts = {}) {
  const cfg = { only: new Set(phases) };
  for (const phase of phases) {
    const c = LEGACY_CONTRACTS[phase];
    if (c.count) cfg[c.count] = counts[phase] ?? c.groups.map(g => get(report, `${g}.runs`)?.length).find(n => n !== undefined) ?? 3;
  }
  report.legacyExecution = buildLegacyExecution(cfg);
  report.identity ??= sampleIdentity();
  const fill = (target, defaults) => {
    for (const [key, value] of Object.entries(defaults)) {
      if (target[key] === undefined) target[key] = structuredClone(value);
      else if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) fill(target[key], value);
    }
  };
  for (const phase of phases) {
    const c = LEGACY_CONTRACTS[phase], spec = report.legacyExecution.phases[phase];
    for (const group of spec.groups) {
      if (group.startsWith('idle.')) continue;
      if (!get(report, group)) {
        const row = validLegacyRow(phase, spec, group);
        set(report, group, { runs: Array.from({ length: spec.expectedRepeats }, () => structuredClone(row)), median: structuredClone(row) });
      }
      for (const row of get(report, `${group}.runs`) ?? []) {
        const defaults = validLegacyRow(phase, spec, group);
        if (phase === 'projects' && row.open && row.open.hero === undefined) row.open.hero = row.project?.name ?? 'project';
        fill(row, defaults);
        // Earlier report fixtures used empty arrays as non-medianable placeholders.
        for (const a of c.arrays ?? []) if (get(row, a.path)?.length === 0) set(row, a.path, structuredClone(get(defaults, a.path)));
      }
    }
  }
  return report;
}
