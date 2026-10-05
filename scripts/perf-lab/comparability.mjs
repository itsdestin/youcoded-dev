import { isDeepStrictEqual } from 'node:util';
import { isSoftwareRenderer } from './gpu.mjs';

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

export function assessComparability(baseline, candidate) {
  const reasons = [];
  const warnings = [
    'Pre-boot noise samples do not prove absence of interference during measurement; midrun interference was not measured.',
  ];
  for (const [label, report] of [['baseline', baseline], ['candidate', candidate]]) {
    if (!record(report)) { reasons.push(`${label}: invalid report`); continue; }
    if (!Object.hasOwn(report, 'aborted') || report.aborted !== null) reasons.push(`${label}: aborted or missing completion status`);
    if (!Array.isArray(report.incomplete) || report.incomplete.length) reasons.push(`${label}: incomplete or missing completion status`);
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
