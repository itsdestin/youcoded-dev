import { isDeepStrictEqual } from 'node:util';
import { completeIpcEvidence } from './stall-attribution.mjs';

// WHY revision 2: IPC setup/drain now extends outside operation marks, and every
// required slot/step/leg owes strict raw coverage rather than just completed totals.
export const LEGACY_EXECUTION_REVISION = 2;
const sizes = ['small', 'medium', 'huge'];
const get = (o, path) => path ? path.split('.').reduce((a, k) => a?.[k], o) : o;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const object = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const keys = o => Object.keys(o ?? {}).sort();
const same = (a, b) => isDeepStrictEqual(a, b);
const indices = n => Array.from({ length: n }, (_, i) => i);
const artifactSteps = ['create', 'drawerOpen', ...['codeSmall', 'codeLarge', 'mdSmall', 'mdLarge', 'htmlSmall'].map(k => `open.${k}`), 'htmlNav', 'typing.codeSmall', 'typing.codeLarge', 'copy'];
const projectSteps = ['open', 'search', 'searchClear', 'filter', 'scrollFlat', 'listView', 'filterClear', 'switch.small', 'switch.big', 'conversations', 'thrash', 'close', 'reopen'];
const resumeSteps = ['createCc', 'browse', 'reveal', 'resume', 'pageUp', 'turn', 'tearoff', 'detachedTurn'];

// WHY one table: counts, required step identities and row policies must agree at
// execution, report validation and comparison. Only named timing/size measurements
// are required; optional diagnostics and unavailable context are not performance gates.
export const LEGACY_CONTRACTS = {
  startup: { section: 'startup', count: 'runs', groups: ['startup', 'idle.pssMb', 'idle.cpuPct'],
    finite: ['sessionsListed', 'firstContentfulPaint', 'blankWindowMs', 'idlePssMb', 'idleCpuPct'] },
  history: { section: 'history', count: 'historyRepeats', groups: sizes.map(s => `history.${s}`),
    finite: ['ipcLast10Ms', 'ipcAllMs', 'resumeFirstMessageMs', 'resumeStableMs'], positive: ['resumeMessageCount'], equals: { stability: 'stable' } },
  workload: { section: 'workload', count: 'workloadRepeats', groups: ['workload'], options: { switchCount: 40 },
    finite: ['switchP95Ms', 'switchPaintedBySize.huge.medianMs', 'probe.longtaskTotalMs', 'pssAfterMb', 'cpuTotalSeconds'],
    equals: { sessionsCreated: 6, failedSwitches: 0, unsettledSwitches: 0, 'probe.longtaskSupported': true }, arrays: [{ path: 'switches', count: 'switchCount', id: 'i', targetCycle: 6, finite: ['ms'], ok: true, painted: true, paintedFirst: 18 }] },
  shots: { section: 'screens', groups: [], options: {} },
  stall: { section: 'replayStall', count: 'stallRepeats', groups: sizes.map(s => `replayStall.${s}`),
    finite: ['ipcMaxMs', 'ipcTotalStallMs', 'rendererLongtaskMaxMs'], positive: ['ipcPings', 'renderedEntries'], equals: { stability: 'stable', longtaskSupported: true } },
  artifacts: { section: 'artifacts', count: 'artifactRepeats', groups: ['artifacts'], steps: artifactSteps,
    options: { keystrokes: 30, htmlSwaps: 4, inPageNavs: 4 },
    finite: ['create.createMs', 'drawerOpen.openMs', ...['codeSmall', 'codeLarge', 'mdSmall', 'mdLarge', 'htmlSmall'].map(k => `open.${k}.openMs`),
      ...['codeSmall', 'codeLarge'].flatMap(k => [`typing.${k}.keystroke.medianMs`, `typing.${k}.keystroke.p95Ms`, `typing.${k}.saveMs`]),
      'copy.clickToCopiedMs', 'htmlNav.swap.medianMs', 'ipcSumOfSteps.totalStallMs'], positive: ['ipcSumOfSteps.pings'],
    arrays: [{ path: 'htmlNav.swaps', count: 'htmlSwaps', id: 'to', ids: ['htmlLarge', 'htmlSmall', 'htmlLarge', 'htmlSmall'], finite: ['ms'], ok: true },
      { path: 'htmlNav.inPageNavs', count: 'inPageNavs', id: 'to', ids: ['#s1', '#s2', '#s3', '#s1'], finite: ['ms'], ok: true }],
    equals: { 'typing.codeSmall.saved': true, 'typing.codeLarge.saved': true },
    counts: { 'typing.codeSmall.keystroke.count': 'keystrokes', 'typing.codeLarge.keystroke.count': 'keystrokes', 'typing.codeSmall.dispatch.count': 'keystrokes', 'typing.codeLarge.dispatch.count': 'keystrokes' } },
  projects: { section: 'projects', count: 'projectsRepeats', groups: ['projects'], steps: projectSteps,
    options: { thrashRounds: 8, typed: 'handler' }, expectedCounts: { 'thrash.rounds': 8 }, equals: { 'search.keystroke.dropped': 0 }, finite: ['thrash.ipcStallMs', 'open.openMs', 'conversations.ms', 'thrash.toConversations.medianMs',
      'search.firstKeyMs', 'search.keystroke.p95Ms', 'filter.codeMs', 'scrollFlat.ms', 'listView.ms', 'switch.smallMs', 'switch.bigMs', 'reopen.openMs'], positive: ['ipcSumOfSteps.pings'],
    arrays: [{ path: 'search.keystroke.samples', fixedCount: 7, numeric: true }, ...['toFiles', 'toConversations'].map(k => ({ path: `thrash.${k}.samples`, count: 'thrashRounds', numeric: true }))] },
  terminal: { section: 'terminal', count: 'terminalRepeats', groups: ['terminal'], options: { switchCount: 40, glyphLines: 2000 },
    finite: ['switchPaintedMedianMs', 'longtaskMaxMs', 'atlasClearsPerSwitch'], positive: ['ipc.pings'], equals: { failedSwitches: 0, 'glyphs.terminals': 4 }, counts: { 'glyphs.lines': 'glyphLines' },
    arrays: [{ path: 'switches', count: 'switchCount', id: 'i', targetCycle: 4, finite: ['ms'], ok: true, ipc: true }, { path: 'glyphs.fillMs', fixedCount: 4, numeric: true }] },
  'native-stream': { section: 'nativeStream', count: 'nativeStreamRepeats', groups: ['nativeStream'], options: { switchCount: 8, deltas: 3000 },
    required: ['visible', 'switching', 'hidden'], ipc: ['visible.ipc', 'switching.ipc', 'hidden.ipc'], finite: ['visible.taskMs', 'switching.switchPaintedMedianMs',
      ...['visible', 'switching', 'hidden'].flatMap(k => [`${k}.turnMs`, `${k}.longtaskMaxMs`, `${k}.windowMs`])],
    positive: ['visible.charsShown', 'visible.ipc.pings', 'switching.verifiedSwitches'], equals: { 'visible.aborted': false, 'hidden.aborted': false },
    counts: { 'visible.deltasSent': 'deltas', 'hidden.deltasSent': 'deltas', 'switching.deltasSent': 'deltas' },
    arrays: [{ path: 'switching.switches', count: 'switchCount', id: 'i', finite: ['paintedMs'], ok: true, duringStream: true }] },
  'native-resume': { section: 'nativeResume', count: 'nativeResumeRepeats', groups: ['nativeResume'], steps: resumeSteps,
    finite: ['createCc.createMs', 'reveal.ms', 'ipcSumOfSteps.totalStallMs', 'browse.openMs', 'resume.paintedMs', 'pageUp.ms', 'tearoff.ms', 'turn.turnMs', 'detachedTurn.turnMs'],
    positive: ['browse.rowsFirst', 'resume.entries', 'ipcSumOfSteps.pings'], equals: { 'turn.aborted': false, 'detachedTurn.aborted': false } },
  scrollback: { section: 'scrollback', count: 'scrollbackRepeats', groups: ['scrollback'], required: sizes.map(s => `perSize.${s}`),
    finite: ['ceilingPssMb', 'deltaPssMb', 'deltaJsHeapMb', ...sizes.map(s => `perSize.${s}.pageMedianMs`)], positive: ['totalPagesLoaded'],
    equals: Object.fromEntries(sizes.map(s => [`perSize.${s}.reachedTop`, true])) },
};
export const LEGACY_PHASES = Object.keys(LEGACY_CONTRACTS);
const rowManifest = c => (c.arrays ?? []).map(a => ({ path: a.path, expectedRows: a.fixedCount ?? c.options[a.count],
  ...(a.id ? { identity: a.id, ids: a.ids ?? indices(c.options[a.count]) } : { identity: 'position' }) }));
export const phaseForMetric = path => path.startsWith('idle.') ? 'startup'
  : LEGACY_PHASES.find(p => LEGACY_CONTRACTS[p].section === path.split('.')[0]);

export function buildLegacyExecution(cfg) {
  const selected = new Set(cfg.only);
  const phases = {};
  for (const phase of selected) {
    const c = Object.hasOwn(LEGACY_CONTRACTS, phase) ? LEGACY_CONTRACTS[phase] : null;
    if (!c) throw new Error(`Unknown legacy phase ${phase}`);
    phases[phase] = {
      expectedRepeats: phase === 'shots' ? 1 : cfg[c.count],
      groups: [...c.groups], steps: [...(c.steps ?? c.required ?? [])], rows: rowManifest(c), options: { ...c.options },
      ...(phase === 'projects' ? { conditionalSteps: { switchToBig: 'required unless open.hero equals project.name' } } : {}),
      ...(phase === 'shots' ? { names: ['welcome', 'chat-medium', 'settings-open', ...(selected.has('workload') ? ['native-chat', 'six-sessions'] : [])] } : {}),
    };
  }
  return { revision: LEGACY_EXECUTION_REVISION, phases };
}

// Inspect explicit failures recursively, without demanding that every optional
// diagnostic numeric field exist. Never enter artifacts.documents: these checks
// operate only on legacy raw repeat rows, not injected calibration controls.
function failures(value, path, problems) {
  if (!object(value) && !Array.isArray(value)) return;
  for (const [key, v] of Object.entries(value)) {
    const at = `${path}.${key}`;
    if ((['ok', 'settled', 'reachedTop', 'supported', 'longtaskSupported'].includes(key) && v === false)
      || (['timedOut', 'aborted', 'unsupported'].includes(key) && v === true)
      || (key === 'stability' && v !== 'stable') || (['threw', 'error', 'missingMark', 'nativeFailure'].includes(key) && v != null && v !== '')
      || (key === 'errors' && Array.isArray(v) && v.length > 0)
      || (['readErrors', 'rejectedPings', 'failedSwitches', 'unsettledSwitches', 'openStalls'].includes(key) && v > 0)
      || (key === 'openStallMs' && v !== null)
      || (key === 'status' && ['failed', 'timeout', 'unsupported', 'incomplete'].includes(v))) problems.push(`${at}: failed/incomplete observation`);
    failures(v, at, problems);
  }
}

function validateRow(row, path, c, spec, problems) {
  const need = (ok, why) => { if (!ok) problems.push(`${path}: ${why}`); };
  need(object(row), 'missing repeat row');
  if (!object(row)) return;
  for (const p of c.finite ?? []) need(finite(get(row, p)), `${p} must be finite`);
  for (const p of c.positive ?? []) need(finite(get(row, p)) && get(row, p) > 0, `${p} must be positive`);
  for (const [p, value] of Object.entries(c.equals ?? {})) need(get(row, p) === value, `${p} must be ${value}`);
  for (const p of c.required ?? []) need(object(get(row, p)), `required ${p} missing`);
  for (const p of c.ipc ?? []) need(completeIpcEvidence(get(row, p)) && finite(get(row, p)?.totalStallMs), `${p} IPC coverage missing/incomplete`);
  const stepEvidence = p => {
    const step = get(row, p);
    need(object(step) && step.ok === true, `required step ${p} missing or unsuccessful`);
    need(completeIpcEvidence(step?.ipc) && finite(step?.ipc?.totalStallMs), `step ${p} IPC coverage missing/incomplete`);
    need(finite(step?.probe?.windowMs) && step.probe.windowMs > 0
      && step.probe.longtaskSupported === true && finite(step?.probe?.longtaskMaxMs), `step ${p} renderer samples missing`);
  };
  // Project View may already open on the big project: switchToBig is then
  // legitimately absent. Otherwise the declared conditional step must succeed.
  if (c.section === 'projects') {
    need(typeof row.project?.name === 'string' && row.project.name.length > 0, 'project identity missing');
    if (row.open?.hero !== row.project?.name || row.switchToBig != null) {
      need(row.switchToBig?.ok === true && finite(row.switchToBig?.ms), 'required conditional switchToBig missing/failed');
      stepEvidence('switchToBig');
    }
  }
  for (const p of c.steps ?? []) stepEvidence(p);
  for (const [p, n] of Object.entries(c.expectedCounts ?? {})) need(get(row, p) === n, `${p} expected ${n}`);
  for (const [p, option] of Object.entries(c.counts ?? {})) need(get(row, p) === spec.options[option], `${p} expected ${spec.options[option]}`);
  for (const a of c.arrays ?? []) {
    const rows = get(row, a.path), n = a.fixedCount ?? spec.options[a.count];
    need(Array.isArray(rows) && rows.length === n, `${a.path} expected all ${n} rows`);
    if (!Array.isArray(rows)) continue;
    if (a.id) need(same(rows.map(r => r?.[a.id]), a.ids ?? indices(n)), `${a.path} missing/duplicate/out-of-order ${a.id} identities`);
    Array.from(rows).forEach((r, i) => {
      if (a.numeric) need(finite(r), `${a.path}[${i}] must be finite`);
      else {
        if (a.targetCycle) need(r?.idx === i % a.targetCycle, `${a.path}[${i}] wrong target index`);
        if (a.ok) need(r?.ok === true, `${a.path}[${i}] did not succeed`);
        if (a.duringStream) need(r?.duringStream === true, `${a.path}[${i}] outside stream`);
        for (const p of a.finite ?? []) need(finite(get(r, p)), `${a.path}[${i}].${p} must be finite`);
        if (a.ipc) need(completeIpcEvidence(r?.ipc) && finite(r?.ipc?.totalStallMs), `${a.path}[${i}] IPC coverage missing/incomplete`);
        if (a.painted && (i < a.paintedFirst || finite(r?.paintedMs))) need(finite(r?.paintedMs) && r.settled === true && !r.short && !r.over, `${a.path}[${i}] painted sample incomplete`);
      }
    });
  }
  failures(row, path, problems);
}

/** All expected repeats, not just >=2 surviving numeric values. `only` narrows a
 * run's requested validation; comparisons inspect every declared/existing phase. */
export function legacyEvidenceProblems(report, { primary = [], only = null } = {}) {
  const problems = [], manifest = report?.legacyExecution;
  if (manifest?.revision !== LEGACY_EXECUTION_REVISION || !object(manifest.phases)) return ['legacy execution manifest missing or unsupported; remeasure'];
  if (Object.keys(manifest.phases).length === 0) problems.push('legacy execution manifest selects no phases');
  const selected = only ? [...only] : [...new Set([...Object.keys(manifest.phases), ...LEGACY_PHASES.filter(p => report?.[LEGACY_CONTRACTS[p].section] != null || (p === 'startup' && report?.idle != null))])];
  for (const phase of selected) {
    const c = Object.hasOwn(LEGACY_CONTRACTS, phase) ? LEGACY_CONTRACTS[phase] : null;
    const spec = manifest.phases[phase];
    if (!c || !object(spec)) { problems.push(`${phase}: execution manifest missing/unknown phase`); continue; }
    if (!Number.isInteger(spec.expectedRepeats) || (phase === 'shots' ? spec.expectedRepeats !== 1 : spec.expectedRepeats < 2)) problems.push(`${phase}: expectedRepeats must declare ${phase === 'shots' ? 'exactly 1' : 'at least 2'}`);
    if (!same(spec.groups, c.groups) || !same(spec.steps, c.steps ?? c.required ?? []) || !same(spec.rows, rowManifest(c)) || !same(spec.options, { ...c.options })) {
      problems.push(`${phase}: required group/step/options contract differs`); continue;
    }
    if (phase === 'projects' && !same(spec.conditionalSteps, { switchToBig: 'required unless open.hero equals project.name' })) problems.push('projects: conditional step contract differs');
    if (phase === 'shots') {
      const expected = ['welcome', 'chat-medium', 'settings-open', ...(manifest.phases.workload ? ['native-chat', 'six-sessions'] : [])];
      const names = report.screens?.names;
      if (!same(spec.names, expected) || !Array.isArray(names) || !same([...names].sort(), [...expected].sort())
        || !Array.isArray(report.screens?.failures) || report.screens.failures.length) problems.push('shots: required screen identities missing, duplicate or failed');
      continue;
    }
    if (['history', 'stall'].includes(phase) && !same(keys(report[c.section]), sizes.slice().sort())) problems.push(`${phase}: required size identities differ`);
    for (const group of c.groups) {
      const section = get(report, group), rows = section?.runs;
      if (!Array.isArray(rows) || rows.length !== spec.expectedRepeats) problems.push(`${group}: expected ${spec.expectedRepeats} repeats, got ${rows?.length ?? 'missing'}`);
      if (!Array.isArray(rows)) continue;
      Array.from(rows).forEach((row, i) => {
        if (group.startsWith('idle.')) { if (!finite(row)) problems.push(`${group}.runs[${i}]: sample must be finite`); }
        else validateRow(row, `${group}.runs[${i}]`, c, spec, problems);
      });
    }
    for (const metric of primary.filter(p => phaseForMetric(p) === phase)) {
      const parts = metric.split('.'), at = parts.indexOf('median');
      const group = parts.slice(0, at).join('.'), tail = parts.slice(at + 1).join('.');
      if (!finite(get(report, metric))) problems.push(`${metric}: median missing/nonfinite`);
      const rows = get(report, `${group}.runs`);
      if (!Array.isArray(rows) || rows.length !== spec.expectedRepeats || Array.from(rows).some(r => !finite(get(r, tail)))) problems.push(`${metric}: every expected raw repeat must be finite`);
    }
  }
  return problems;
}

/** Raw values without filtering: callers must validate before using them. */
export function rawMetricSamples(report, path) {
  const parts = path.split('.'), at = parts.indexOf('median');
  if (at < 1) return [];
  const rows = get(report, `${parts.slice(0, at).join('.')}.runs`);
  return Array.isArray(rows) ? Array.from(rows, r => get(r, parts.slice(at + 1).join('.'))) : [];
}

/** Severe-tail policy: candidate max must exceed baseline max by MORE than both
 * one reporting unit and (configured regression % of baseline max + full baseline
 * raw range). This conservative additive noise guard is evaluated on PRIMARY only,
 * including the target. Context (counts, release, throughput) has no implied direction.
 * Invalid raw arrays are a validity failure elsewhere, never filtered into a win. */
export function legacyTailRegressions(baseline, candidate, primary, { regressMaxPct = 3, zeroFloor = 1 } = {}) {
  const out = [];
  for (const path of primary) {
    const b = rawMetricSamples(baseline, path), c = rawMetricSamples(candidate, path);
    if (b.length < 2 || c.length < 2 || !b.every(finite) || !c.every(finite)) continue;
    const base = Math.max(...b), cand = Math.max(...c), spread = base - Math.min(...b);
    const noiseGuard = Math.max(zeroFloor, Math.abs(base) * regressMaxPct / 100 + spread);
    if (cand - base > noiseGuard) out.push({ path, base, cand, repeat: c.indexOf(cand), noiseGuard });
  }
  return out;
}
