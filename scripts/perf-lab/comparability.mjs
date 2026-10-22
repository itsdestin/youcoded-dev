import { isDeepStrictEqual } from 'node:util';
import { isSoftwareRenderer } from './gpu.mjs';
import { STALL_MEASUREMENT_REVISION } from './stall-attribution.mjs';
import { replayEvidenceProblems } from './replay-evidence.mjs';
import { legacyEvidenceProblems } from './legacy-evidence.mjs';
import { identityMismatches, identityProblems } from './identity.mjs';
import { interferenceProblems } from './interference-watch.mjs';

// A report can contain good-looking numbers without evidence that the two runs
// measured the same thing. Keep this check pure so partial and historical JSON can
// be examined without starting the app.
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const noiseLimits = { loadAvgBefore: 4, machineBusyPctBefore: 10, maxLoadAvgAccepted: 4, maxBusyPctAccepted: 10 };
const machineFields = ['cpu', 'kernel', 'node'];
const compositingModes = new Set(['enabled', 'enabled_on', 'disabled_software', 'disabled_off', 'unavailable_off']);
// run.mjs uses a different section name for replayStall; startup/idle have no
// MEASURES export, so do not invent one just to pass a comparison.
const measuredSections = {
  history: 'history', workload: 'workload', replayStall: 'stall', artifacts: 'artifacts',
  projects: 'projects', terminal: 'terminal', nativeStream: 'nativeStream',
  nativeResume: 'nativeResume', scrollback: 'scrollback',
};

export function assessComparability(baseline, candidate, { primary = [] } = {}) {
  const reasons = [];
  const warnings = [
    'Interference is judged from /proc samples every 500 ms: it names other programs using the CPU, disk or memory, but cannot see everything (e.g. another program holding the graphics chip is only attributed where /proc allows).',
  ];
  for (const [label, report] of [['baseline', baseline], ['candidate', candidate]]) {
    if (!record(report)) { reasons.push(`${label}: invalid report`); continue; }
    if (!Object.hasOwn(report, 'aborted') || report.aborted !== null) reasons.push(`${label}: aborted or missing completion status`);
    if (!Array.isArray(report.incomplete) || report.incomplete.length) reasons.push(`${label}: incomplete or missing completion status`);
    // WHY explicit (not only via `incomplete`): a --busy-machine report must never be compared, even if a later edit
    // stopped listing it as incomplete.
    if (report.exploratory) reasons.push(`${label}: exploratory --busy-machine report (measured without waiting for a quiet machine)`);
    // WHY the missing-newMetric exception must not bridge attribution revisions:
    // old inferred-main numbers cannot stand in for observed raw response tails.
    if (['replayStall', 'idleSessions', 'artifacts', 'projects', 'terminal', 'nativeStream', 'nativeResume']
      .some(section => report[section] != null) && report.stallMeasurementRevision !== STALL_MEASUREMENT_REVISION) {
      reasons.push(`${label}: unsupported or missing stall measurement revision; remeasure with revision ${STALL_MEASUREMENT_REVISION}`);
    }
    reasons.push(...legacyEvidenceProblems(report, { primary }).map(problem => `${label}: ${problem}`));
    reasons.push(...replayEvidenceProblems(report.replayStall).map(problem => `${label}: ${problem}`));
    // WHY (acceptance A3): instrument source, fixture options, package bytes and executed
    // repeat counts decide what a number MEANS. A report without them (every report written
    // before identity existed) is incomparable with an explicit reason, never assumed equal.
    reasons.push(...identityProblems(report).map(problem => `${label}: ${problem}`));
    // WHY (owner request 2026-10-21): a window another program disturbed, or one nobody watched, is not a
    // quiet-machine number. validateReport already makes such a report incomplete; this refuses it again
    // here so a hand-edited or older report cannot slip a disturbed window into a comparison.
    if (!Array.isArray(report.interference?.windows)) reasons.push(`${label}: no interference record (taken before the watch existed); remeasure`);
    else reasons.push(...interferenceProblems(report).map(problem => `${label}: ${problem}`));
    const machine = report.machine;
    for (const key of machineFields) {
      if (!text(machine?.[key])) reasons.push(`${label}: missing or invalid machine.${key}`);
    }
    if (!finite(machine?.ramGb) || machine.ramGb <= 0) reasons.push(`${label}: missing or invalid machine.ramGb`);
    const renderer = machine?.renderer;
    // WHY: WebGL alone cannot establish compositing mode; a fallback renderer
    // string must never certify the software/GPU lane of an experiment.
    const mode = renderer?.featureStatus?.gpu_compositing;
    if (!record(renderer) || renderer.source !== 'SystemInfo'
        || (renderer.error !== null && renderer.error !== undefined)
        || !text(renderer.glRenderer) || typeof renderer.accelerated !== 'boolean'
        || !record(renderer.featureStatus)
        || Object.values(renderer.featureStatus ?? {}).some((value) => !text(value))
        || !compositingModes.has(mode)
        || (compositingModes.has(mode) && renderer.accelerated !== mode.startsWith('enabled'))
        || (isSoftwareRenderer(renderer.glRenderer) === true && renderer.accelerated)) {
      reasons.push(`${label}: missing, failed or unknown renderer / gpu_compositing identity`);
    }
    for (const [key, max] of Object.entries(noiseLimits)) {
      // WHY: loadAvgBefore begins lowercase; substring casing would mistakenly
      // grade it against the 10% busy limit instead of the runner's load < 4.
      const n = report.noise?.[key];
      if (!finite(n) || n < 0 || n >= max) reasons.push(`${label}: invalid or excessive pre-boot noise.${key} (must be < ${max})`);
    }
    if (record(report.noise) && finite(report.noise.loadAvgBefore) && finite(report.noise.maxLoadAvgAccepted)
        && report.noise.maxLoadAvgAccepted < report.noise.loadAvgBefore) reasons.push(`${label}: inconsistent pre-boot load summary`);
    if (record(report.noise) && finite(report.noise.machineBusyPctBefore) && finite(report.noise.maxBusyPctAccepted)
        && report.noise.maxBusyPctAccepted < report.noise.machineBusyPctBefore) reasons.push(`${label}: inconsistent pre-boot busy summary`);
    if (!record(report.measures)) {
      reasons.push(`${label}: missing measured scenario descriptors`);
    } else {
      for (const [section, phase] of Object.entries(measuredSections)) {
        if (report[section] != null && !Object.hasOwn(report.measures, phase)) {
          reasons.push(`${label}: missing measures.${phase} for measured ${section}`);
        }
      }
      for (const [phase, descriptor] of Object.entries(report.measures)) {
        if (!record(descriptor) || !text(descriptor.scenario) || !text(descriptor.question)
            || !Array.isArray(descriptor.configuration) || !descriptor.configuration.length
            || !descriptor.configuration.every(text) || !record(descriptor.clocks)
            || !Object.keys(descriptor.clocks).length || !Object.values(descriptor.clocks).every(text)
            || !Array.isArray(descriptor.blindTo) || !descriptor.blindTo.every(text)) {
          reasons.push(`${label}: malformed measures.${phase}`);
        }
      }
    }
  }
  // WHY selection identity is separate from repeat count: two intentional subsets
  // can compare, but silently omitting a declared phase on one side cannot.
  if (record(baseline?.legacyExecution?.phases) && record(candidate?.legacyExecution?.phases)
      && !isDeepStrictEqual(Object.keys(baseline.legacyExecution.phases).sort(), Object.keys(candidate.legacyExecution.phases).sort())) {
    reasons.push('legacy executed phase selections differ');
  }
  // Only compare identities that are individually well formed; the per-side reasons above
  // already explain a malformed or missing one.
  if (identityProblems(baseline).length === 0 && identityProblems(candidate).length === 0) {
    reasons.push(...identityMismatches(baseline.identity, candidate.identity));
  }
  if (record(baseline?.machine) && record(candidate?.machine)) {
    for (const key of [...machineFields, 'ramGb']) {
      if (baseline.machine[key] !== candidate.machine[key]) reasons.push(`machine.${key} differs`);
    }
    const a = baseline.machine.renderer;
    const b = candidate.machine.renderer;
    if (record(a) && record(b)) {
      // WHY: known driver/vendor revisions are part of the lane too; a
      // missing counterpart is not evidence that the revision stayed equal.
      for (const key of ['glRenderer', 'glVendor', 'glVersion', 'accelerated']) {
        if (a[key] !== b[key]) reasons.push(`renderer.${key} differs`);
      }
      // WHY: an unchanged compositing mode does not establish the same rendering
      // lane if rasterization/WebGL or any other recorded feature changed.
      if (!isDeepStrictEqual(a.featureStatus, b.featureStatus)) reasons.push('renderer.featureStatus differs (including gpu_compositing/rasterization)');
    }
  }
  if (record(baseline?.measures) && record(candidate?.measures)) {
    // WHY: compare only overlapping configurations, not phases intentionally
    // excluded with --only. A descriptor present on just one side is not proof.
    for (const phase of new Set([...Object.keys(baseline.measures), ...Object.keys(candidate.measures)])) {
      const a = baseline.measures[phase];
      const b = candidate.measures[phase];
      if (!a || !b) { reasons.push(`measures.${phase} missing on one side`); continue; }
      if (!isDeepStrictEqual(a, b)) reasons.push(`measures.${phase} differs`);
    }
  }
  return { comparable: reasons.length === 0, reasons, warnings };
}
