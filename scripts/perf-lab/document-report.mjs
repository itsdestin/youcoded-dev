// Shared runner/comparison contract. Raw rows, including failures, remain intact.
import { assessViewerEvidence, validateDocumentCalibration } from './scenario-document-stalls.mjs';
import { DOCUMENT_ADAPTER_REVISION, DOCUMENT_CONTROL_IDS } from './document-input.mjs';
import { isDeepStrictEqual } from 'node:util';

// Explicit measurement identity: unlike the broad lab tree fingerprint this does
// not include the app-under-test. A/B app edits must remain allowed, while a new
// timer, frame sampler, adapter or verdict contract requires a new baseline.
export const DOCUMENT_INSTRUMENT_FILES = [
  'run.mjs', 'compare.mjs', 'document-report.mjs', 'atomic-report.mjs',
  'scenario-document-stalls.mjs', 'scenario-images.mjs', 'gpu.mjs', 'document-input.mjs', 'build.mjs', 'main-loop-probe.mjs', 'probe-loop.mjs',
  'probe-ipc.mjs', 'scenario-workload.mjs', 'scenario-artifacts.mjs',
  'stall-fixtures.mjs', 'fixture.mjs', 'cdp.mjs', 'launch.mjs', 'procs.mjs',
];
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const fingerprint = v => /^[a-f0-9]{40}$/.test(v?.sha ?? '') && /^[a-f0-9]{12}$/.test(v?.dirty ?? '') && text(v?.branch);
const appViews = ['XlsxView.tsx', 'CsvView.tsx', 'DocxView.tsx', 'HtmlView.tsx'];

function provenanceProblems(section) {
  const p = section.provenance, problems = [];
  if (!p || p.profile !== 'smoke' || !isDeepStrictEqual(p.caseIds, section.requiredCaseIds)
      || !text(p.checkout) || !fingerprint(p.build) || !text(p.build.binary)
      || !fingerprint(p.labSource) || ![p.node, p.platform, p.arch, p.memoryPolicy, p.renderingPolicy].every(text)) {
    problems.push('documents: missing/invalid provenance (selection, build, lab source, runtime or policies)');
  }
  if (!p?.instrumentHashes || DOCUMENT_INSTRUMENT_FILES.some(file => !hash(p.instrumentHashes[file]))
      || Object.keys(p.instrumentHashes).length !== DOCUMENT_INSTRUMENT_FILES.length) problems.push('documents: missing/invalid provenance instrument hashes');
  if (!Array.isArray(p?.sourceHashes) || appViews.some(name => !p.sourceHashes.some(s =>
    s?.file === `${p.checkout}/desktop/src/renderer/components/artifact-views/${name}` && hash(s.sha256)))) problems.push('documents: missing/invalid provenance app source hashes');
  return problems;
}

export const DOCUMENT_CASE_IDS = ['xlsx-merge-32x32', 'xlsx-sheets-1', 'csv-rows-64kib', 'csv-wide-64kib', 'csv-quoted-64kib', 'docx-paragraphs-100', 'docx-table-25x10', 'html-assets-1x256', 'html-script-250ms'];
export const DOCUMENT_OPTIONAL_COVERAGE = [
  { id: 'path-list', reason: 'Visible UserMessage adapter not implemented; not credited as viewer coverage' },
  { id: 'hardware', reason: 'Not integrated in this document-viewer package' },
  { id: 'watcher-startup', reason: 'Not integrated in this document-viewer package; existing burst scenarios are separate' },
  { id: 'csv-full-read', reason: 'Explicit full-read interaction not implemented; default preview only' },
  { id: 'larger-ladders', reason: 'Only selected bounded smoke cases run; unselected ladders are not measured' },
];
const controls = DOCUMENT_CONTROL_IDS;
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const DOCUMENT_BUDGETS = { 'renderer.maxDelayMs': 250, 'main.maxDelayMs': 250, 'input.latencyMs': 250 };
const get = (r, p) => p.split('.').reduce((a, k) => a?.[k], r);

export async function recordDocumentRepeat(section, execute, onUpdate = async () => {}) {
  const partial = { schema: 1, scope: 'app-viewer', cases: [], descriptor: { calibrationValid: false, calibrations: [] } };
  section.runs.push(partial);
  await onUpdate();
  try {
    const result = await execute(async row => {
      (row.kind === 'calibration' ? partial.descriptor.calibrations : partial.cases).push(row);
      await onUpdate(row);
    });
    Object.assign(partial, result);
    return result;
  } catch (error) {
    partial.descriptor.error = error.stack ?? String(error);
    throw error;
  } finally { await onUpdate(); }
}

export function documentProblems(section) {
  if (!section) return ['documents: required section missing'];
  const problems = provenanceProblems(section), runs = Array.isArray(section.runs) ? section.runs : [], ids = Array.isArray(section.requiredCaseIds) ? section.requiredCaseIds : [];
  if (!Number.isInteger(section.expectedRepeats) || section.expectedRepeats < 1 || runs.length !== section.expectedRepeats) problems.push('documents: incomplete repeat count');
  if (!ids.length || new Set(ids).size !== ids.length) problems.push('documents: required case selection missing/duplicated');
  runs.forEach((run, i) => {
    const label = `documents repeat ${i + 1}`;
    if (run.fatal || run.descriptor?.error || run.descriptor?.cleanupError || run.descriptor?.provenanceError) problems.push(`${label}: adapter/cleanup/provenance failure`);
    const descriptor = run.descriptor;
    if (descriptor?.revision !== DOCUMENT_ADAPTER_REVISION || descriptor?.buildVerified !== true || !hash(descriptor?.buildStampSha256)
        || descriptor?.checkout !== section.provenance?.checkout || descriptor?.binary !== section.provenance?.build?.binary
        || ['sha','dirty','branch'].some(k => descriptor?.buildStamp?.[k] !== section.provenance?.build?.[k])
        || appViews.some(name => !descriptor?.sourceHashes?.some(s => s.file === `${descriptor.checkout}/desktop/src/renderer/components/artifact-views/${name}` && hash(s.sha256) && section.provenance?.sourceHashes?.some(observed=>observed.file===s.file&&observed.sha256===s.sha256)))) problems.push(`${label}: adapter revision or executed-build provenance missing/mismatched`);
    if (descriptor?.calibrationValid !== true || !validateDocumentCalibration(descriptor?.calibrations)) problems.push(`${label}: calibration invalid or incomplete`);
    for (const id of controls) {
      const rows = (run.descriptor?.calibrations ?? []).filter(r => r.id === id);
      if (rows.length !== 1 || rows[0].status !== 'measured' || assessViewerEvidence(rows[0]).status !== 'measured' || Object.keys(DOCUMENT_BUDGETS).some(p => !finite(get(rows[0], p)))) problems.push(`${label}: ${id} missing/failed evidence`);
    }
    for (const id of ids) {
      const rows = (run.cases ?? []).filter(r => r.id === id), row = rows[0];
      if (rows.length !== 1 || row?.status !== 'measured') problems.push(`${label}: ${id} ${row?.status ?? 'missing'} (expected exactly one measured case)`);
      else if (assessViewerEvidence(row).status !== 'measured' || !finite(row.fixture?.bytes) || !/^[a-f0-9]{64}$/.test(row.fixture?.sha256 ?? '') || !row.fixture?.shape || Object.keys(DOCUMENT_BUDGETS).some(p => !finite(get(row, p)))) problems.push(`${label}: ${id} incomplete measurement evidence`);
    }
  });
  return problems;
}

export function documentBreaches(section) {
  // WHY: a valid slow sample is a policy breach, not an invalid instrument. Never
  // median these away or convert a timeout/missing reading into a healthy zero.
  return (section?.runs ?? []).flatMap((run, repeat) => (run.cases ?? []).flatMap(row =>
    Object.entries(DOCUMENT_BUDGETS).flatMap(([metric, limit]) => (metric !== 'input.latencyMs' || row.input?.budgetStatus === 'breach') && finite(get(row, metric)) && get(row, metric) > limit
      ? [{ repeat: repeat + 1, id: row.id, status: row.status, metric, value: get(row, metric), limit }] : [])));
}

export function documentComparabilityProblems(base, cand) {
  if (!base && !cand) return []; // Legacy reports have no document contract.
  const reasons = [...documentProblems(base).map(p => `baseline ${p}`), ...documentProblems(cand).map(p => `candidate ${p}`)];
  if (!base || !cand) return reasons;
  if (JSON.stringify(base.requiredCaseIds) !== JSON.stringify(cand.requiredCaseIds) || base.expectedRepeats !== cand.expectedRepeats || base.provenance?.profile !== cand.provenance?.profile) reasons.push('documents: workload/profile/repeat selection differs');
  if (!isDeepStrictEqual(base.provenance?.instrumentHashes, cand.provenance?.instrumentHashes)) reasons.push('documents: measurement instrument hashes differ (not comparable)');
  for (const field of ['node', 'platform', 'arch', 'memoryPolicy', 'renderingPolicy']) {
    if (base.provenance?.[field] !== cand.provenance?.[field]) reasons.push(`documents: provenance ${field} differs (not comparable)`);
  }
  // labSource/build/sourceHashes are required observations, deliberately NOT an
  // equality gate: the candidate application is the variable under experiment.
  return reasons;
}

export function compareDocuments(base, cand, regressMaxPct = 3) {
  const reasons = documentComparabilityProblems(base, cand);
  if (!base || !cand) return reasons;
  for (const id of base.requiredCaseIds ?? []) {
    const rows = s => (s.runs ?? []).flatMap(r => (r.cases ?? []).filter(c => c.id === id));
    const br = rows(base), cr = rows(cand);
    // Absolute asset paths identify this launch's fixture root, not its workload.
    const identities = rs => [...new Set(rs.map(r => JSON.stringify({ bytes: r.fixture?.bytes, sha256: r.fixture?.sha256, shape: r.fixture?.shape,
      assets: r.fixture?.assets?.map(a => ({ bytes: a.bytes, sha256: a.sha256 })) })))].sort();
    if (JSON.stringify(identities(br)) !== JSON.stringify(identities(cr))) reasons.push(`documents ${id}: fixture identity differs`);
    for (const metric of ['operationMs', ...Object.keys(DOCUMENT_BUDGETS), 'memory.peakRssMb']) {
      const worst = rs => Math.max(...rs.map(r => get(r, metric)).filter(finite));
      const b = worst(br), c = worst(cr);
      if (finite(b) && finite(c) && c > Math.max(b * (1 + regressMaxPct / 100), b + 1)) reasons.push(`documents ${id} worst ${metric} regressed ${b} -> ${c}`);
    }
  }
  for (const b of documentBreaches(cand)) reasons.push(`documents budget breach: repeat ${b.repeat} ${b.id} ${b.metric} ${b.value} > ${b.limit}`);
  return reasons;
}

export function documentMarkdown(section) {
  if (!section) return [];
  return ['', '## Document stalls (raw cases and calibration controls)', '',
    `Profile: ${section.provenance?.profile}; required repeats: ${section.expectedRepeats}. Validity and measured budgets are separate.`, '',
    '| Repeat | Case | Status | Operation ms | Renderer delay ms | Main delay ms | Peak RSS MiB |',
    '|---|---|---|---|---|---|---|',
    ...(section.runs ?? []).flatMap((run, i) => [...(run.descriptor?.calibrations ?? []), ...(run.cases ?? [])].map(r => `| ${i + 1} | ${r.id} | ${r.status} | ${r.operationMs ?? '—'} | ${r.renderer?.maxDelayMs ?? '—'} | ${r.main?.maxDelayMs ?? '—'} | ${r.memory?.peakRssMb ?? '—'} |`)),
    '', ...documentProblems(section).map(p => `- Invalid: ${p}`),
    ...documentBreaches(section).map(b => `- Budget breach: repeat ${b.repeat}, ${b.id}, ${b.metric}: ${b.value} > ${b.limit}`),
    ...(section.optionalCoverage ?? []).map(c => `- Unsupported/unmeasured ${c.id}: ${c.reason}`)];
}
