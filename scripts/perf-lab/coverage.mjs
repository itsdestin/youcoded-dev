// Read-only inventory/importer, NOT a launcher, sensor reader or acceptance gate.
import { constants, openSync, closeSync, fstatSync, readSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute, parse, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_EXECUTION_REVISION, legacyEvidenceProblems } from './legacy-evidence.mjs';
import { PRIMARY } from './compare.mjs';
import { streamCompletionProblems } from './run.mjs';
import { replayEvidenceProblems } from './replay-evidence.mjs';
import { STALL_MEASUREMENT_REVISION } from './stall-attribution.mjs';
import { DOCUMENT_CASE_IDS, documentProblems, documentBreaches } from './document-report.mjs';
import { DOCUMENT_ADAPTER_REVISION } from './document-input.mjs';
import { summariseSettle } from './natural-settle.mjs';
import { summariseCycles } from './short-lifecycle.mjs';
import { RESOURCE_METRICS, RESOURCE_DESCRIPTOR, checkpointDelta } from './resource-checkpoint.mjs';
import { isDeepStrictEqual } from 'node:util';
import { encodeSensorFrame } from './energy-controller.mjs';

export const COVERAGE_REVISION = 1;
export const REPORT_BYTE_CAP = 5 * 1024 * 1024;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const lab = name => `scripts/perf-lab/${name}.mjs`;
const standard = [
  ['startup', 'Boot latency and idle CPU/PSS from cold starts', 'run', 'Finite configured repeat window; idle averages are not microstutter or app-energy measurements.'],
  ['history', 'Conversation reload at small/medium/huge sizes', 'scenario-history', 'Single-session history only; every configured size/repeat must complete.'],
  ['workload', 'Six-session streaming and switching', 'scenario-workload', 'Fake native traffic; selected painted switches, not every real-world tool workload.'],
  ['shots', 'Named screen parity', 'screenshots', 'Showing/capturing a screen is not latency, motion or input responsiveness proof.'],
  ['stall', 'Replay response tails and observed renderer delay', 'scenario-replay-stall', 'Renderer IPC cannot independently locate main blocking; residual time stays unknown.'],
  ['artifacts', 'Code/Markdown/HTML files-panel journeys', 'scenario-artifacts', 'Legacy editor/nav steps; bounded document subcases are separately validated.'],
  ['projects', 'Project files/search/filter/conversation-tab thrash', 'scenario-projects', 'Initial list and fixed interactions, not full cumulative list growth.'],
  ['terminal', 'Glyph fill and terminal switch slots', 'scenario-terminal', 'Software baseline does not establish real GPU upload/display cost.'],
  ['native-stream', 'Visible, switching and hidden-session reply legs', 'scenario-native-stream', 'A switched-away session is not an OS-hidden/minimized window; fake text deltas only.'],
  ['native-resume', 'Browse/resume/page/reply/tear-off journey', 'scenario-native-resume', 'Detached-window IPC evidence is not complete multi-window rendering/interaction coverage.'],
  ['scrollback', 'History memory ceiling and page costs', 'scenario-scrollback', 'Must reach top for each size; PSS/heap differences alone do not prove a leak.'],
].map(([id, purpose, entry, limits]) => ({ id, phase: id, kind: 'standard', purpose, sources: [lab(entry), lab('run')],
  command: `node scripts/perf-lab/run.mjs --only ${id} --checkout <absolute-app-worktree> --label <name>`,
  integration: 'standard-runner', implementation: 'implemented', review: 'legacy-contract-unit-tested',
  requested: 'Packaged desktop surface regression evidence', actual: 'Existing isolated runner; renderer lane must be observed in report.machine.renderer',
  scope: 'standard packaged desktop phase', limits: [limits, 'Acceptance still requires provenance, completion, comparison and the applicable review; inventory does not grant it.'],
  budgets: 'Configured repeats; PRIMARY median and raw-repeat tail comparison, not a universal absolute performance budget.' }));
const diagnostic = (id, purpose, sources, command, actual, limits, extra = {}) => ({ id, kind: 'diagnostic', purpose,
  sources, command, implementation: 'implemented', integration: 'standalone-diagnostic', review: 'runtime-not-accepted',
  requested: purpose, actual, scope: actual, limits, budgets: 'Diagnostic-specific bounds; no standard acceptance credit.', ...extra });
const gap = (id, purpose, sources, reason) => ({ id, kind: 'gap', purpose, sources, command: null,
  implementation: 'unsupported', integration: 'not-integrated', review: 'not-covered', requested: purpose, actual: reason,
  scope: reason, limits: [reason], budgets: 'No executed measurement or acceptance budget.' });

// WHY status dimensions are separate: existing source and a completed command do
// not prove runtime capability, calibrated sensors, reviewed UI or standard acceptance.
export const LANES = [
  ...standard,
  diagnostic('documents', 'Nine bounded XLSX/CSV/DOCX/HTML smoke cases', [lab('run'), lab('scenario-document-stalls'), lab('document-report')],
    'node scripts/perf-lab/run.mjs --only artifacts --document-cases csv-rows-64kib --checkout <absolute-app-worktree> --label <name>',
    'Integrated artifacts sublane; exact selected case IDs and revisioned controls/provenance required',
    ['Only selected cases are observed; never expand a CSV result into all nine cases.', 'Hardware discovery, watcher startup, path-list UI and CSV explicit full-read are not this lane.'],
    { kind: 'documents', integration: 'standard-artifacts-sublane', cases: [...DOCUMENT_CASE_IDS], budgets: 'Per-case 15000ms/1536MiB safety caps in run.mjs; document-report budgets preserve individual breaches.', review: 'revision-3-calibration-review-required' }),
  diagnostic('stream-completion', 'Producer writes → bridge receipt → exact post-reveal output', [lab('run'), lab('scenario-native-stream'), lab('stream-drain'), lab('fake-provider')],
    'node scripts/perf-lab/run.mjs --only native-stream --stream-completion-diagnostics --native-stream-repeats 1 --check',
    'Existing runner opt-in plain fixture diagnostic, revision 2; not a standard Markdown timing baseline',
    ['Reducer queue unavailable; bridge receipt is not reducer drain.', 'Hidden-session boundary snapshots are not OS-hidden-window coverage; post-reveal timing is not hidden completion.'],
    { integration: 'existing-runner-opt-in', budgets: '3000 deltas at 150/s; at most 3 repeats; 10000 events/1MiB receipt; bounded 10s bridge/reveal waits.' }),
  diagnostic('images', 'Image open/decode-readiness, zoom/pan/reset, release/reopen', [lab('scenario-images'), lab('scenario-document-stalls'), lab('stall-fixtures')], null,
    'Opt-in passed owned document harness API (images:true); NOT a run.mjs phase/CLI switch',
    ['One small PNG saved report is available for explicit import; parent runtime/visual review is separate, not acceptance.', 'Current producer policy allows observed software compositing plus allowlisted GPU-raster status; coverage does not independently certify that lane. Blob/readiness observer overhead is uncalibrated.', 'DOM unmount is not GPU/decoder cache release; no physical presentation or original decoder CPU attribution.'],
    { integration: 'opt-in-api', review: 'unreviewed', explicitReportExample: 'scratch/image-stalls-runtime-wSQUqA/runtime-report.json', budgets: 'Image API retains 15s/1536MiB per-case limits; generated image plan caps apply.' }),
  diagnostic('lifecycle', 'Growth → switch → release resource checkpoints', [lab('short-lifecycle'), lab('natural-settle'), lab('resource-checkpoint'), lab('lifecycle-evidence'), lab('supervised-launch')],
    'node scripts/perf-lab/short-lifecycle.mjs --checkout <absolute-app-worktree> --app-dir <absolute-cached-package> --model-free --supervised --settle-checkpoints --settle-domain renderer --cycles 3 --max-minutes 5 --max-rss-mb 2048 --cleanup-reserve-ms 20000 --out <absolute-fresh-json>',
    'Chat-only packaged Linux diagnostic; revision-5 renderer-only subdomain can be measured while whole-app memory remains intentionally not collected',
    ['Raw controls/checkpoints/workload steps are revalidated on import; no whole-app runtime acceptance.', 'Marker-family completeness unproven; no terminal/files/previews, OS-hidden window or queue drain proof.'],
    { review: 'implementation-reviewed-runtime-not-accepted', budgets: 'Settle opt-in: at most 3 cycles/5 minutes, 24 points; 5MiB report cap; warmup excluded from slope; natural counter drops are not GC or leak proof.' }),
  diagnostic('dom-growth', 'Cumulative list reveal and close/reopen reset', ['scripts/ui-review/dom-size-sweep.mjs', 'scripts/ui-review/dom-growth.mjs'],
    'node scripts/ui-review/dom-size-sweep.mjs --growth --only projects/conversations --rows 2000',
    'Workbench, projects/conversations only; up to 60 scroll checkpoints (reveals all 2000 rows) and same-document tab reset',
    ['Partial cap-exhaustion observation is incomplete even when reset succeeds.', 'Not every app list; no process RAM, hidden-window or queue measurement.'],
    { budgets: '2000 effective rows; 60 checkpoints; initial 8000-node budget; per-surface deadline 600000ms.' }),
  diagnostic('sensors', 'Read-only domain/device/battery telemetry', [lab('energy-sensors'), lab('energy-helper'), lab('energy')],
    'node scripts/perf-lab/energy-sensors.mjs --out <absolute-fresh-scratch/sensor-runs/run/report.json> --seconds 5 --interval-ms 2000',
    'Sensor-only helper, never app-attributable energy or watts',
    ['Permission failures and truncated discovery are incomplete, not zero energy.', 'No app energy integration; idle-overhead --energy is explicitly refused.'],
    { budgets: 'CLI 1..30 seconds; 1000..10000ms interval; bounded sensors/samples/IPC; no app launch.' }),
  diagnostic('gpu-cost', 'Isolated hardware-virtual GPU engine/theme cost', [lab('gpu-cost'), lab('gpu-cost-parse')],
    'node scripts/perf-lab/gpu-cost.mjs --checkout <absolute-isolated-worktree> --app-dir <absolute-worktree/desktop/release/linux-unpacked> --out <absolute-scratch/perf-lab/gpu/report.json> --check',
    'Runtime BLOCKED pending app exec/CDP and compositor descendant supervisor integration; --check is cached-package/executable readiness only',
    ['No compositor/app/sensor launch permitted by this entry until supervisor integration is independently reviewed.', 'Engine-time counters are not energy or physical display proof.'],
    { integration:'runtime-blocked-check-only',review:'supervisor-integration-required',budgets: 'Configured sample <=30s, <=3 repeats/4 cells; separate trace <=10s/10000 events/2MiB with acquisition/completion deadlines. No executed measurement.' }),
  diagnostic('realism', 'Demand under packaged/dev, history/theme/session/load factors', [lab('realism'), lab('realism-load'), lab('realism-stats')],
    'node scripts/perf-lab/realism.mjs --preset real-use --checkout <absolute-app-worktree>',
    'Existing software factorized workload unchanged; display=gpu BLOCKED before package/fixture/provider preparation',
    ['GPU-display presets/imported runBoot refuse until compositor/app supervisor integration; no GPU execution claim.', 'Software lane unexecuted by this coverage package. Copied real history and explicit factors require independent safety/provenance review.'],
    { budgets: 'Profile defaults: 75-second sequences and maxMinutes 30; caller-controlled factors/limits require review. Not an absolute performance budget.' }),
  diagnostic('presentation', 'Conditional native surface-presentation evidence', [lab('mixed-activity'), lab('mixed-presentation'), lab('presentation-capture')],
    'node scripts/perf-lab/mixed-activity.mjs --checkout <absolute-app-worktree> --out <absolute-fresh-scratch/perf-lab/report.json> --wayland-socket <absolute-owned-socket> --protocol-debug on',
    'Existing mixed workload with opt-in owned Wayland protocol/trace capture',
    ['Conditional whole-leg surface association, not proof for every switch.', 'No physical scanout; no silent X11 fallback; existing lane unexecuted by this package.']),
  diagnostic('idle-overhead', 'Finite-window idle CPU/PSS overhead', [lab('idle-overhead')],
    'node scripts/perf-lab/idle-overhead.mjs --checkout <absolute-app-worktree> --out <absolute-fresh-json> --seconds 120',
    'Existing isolated idle CPU/PSS diagnostic; app-integrated energy refused',
    ['Quiet finite window rules out neither slower cadences nor sub-window microstutters.', 'Legacy display cleanup is not independently exit-certified.'],
    { budgets: 'CLI observation 1..120 seconds, settle 0..120 seconds; CPU/PSS are context, not app-energy or microstutter certification.' }),
  diagnostic('background-cost', 'CPU/context-switch endpoint accounting APIs', [lab('background-cost')], null,
    'Importable Linux counter/delta helpers; no integrated workload lane',
    ['Not app energy; process birth/death gaps remain.', 'No current lane conservation/drain acceptance.'], { integration: 'api-only' }),
  gap('queue-drain', 'Queue conservation, sustained congestion/backlog and drain', [lab('background-cost')], 'Counter helpers are not integrated producer/consumer queue instrumentation or a queue-drain workload.'),
  gap('hidden-window', 'OS-hidden/minimized-window activity', [lab('scenario-native-stream'), lab('resource-checkpoint')], 'Hidden session/switch checkpoints do not prove hidden-window behavior.'),
  gap('mobile', 'Android/remote parity and resource diagnostics', [lab('scenario-images')], 'These imported desktop/workbench lanes do not establish Android or remote-web runtime coverage.'),
  gap('physical-display', 'Physical GPU presentation/scanout', [lab('mixed-presentation'), lab('gpu-cost')], 'Virtual hardware counters and rAF/surface observations are not physical display timing.'),
  gap('app-energy', 'Attributable application energy/battery cost', [lab('idle-overhead'), lab('energy')], 'Sensor-only domain readings, CPU percentages and GPU engine time cannot establish app watts or battery-life impact.'),
];

const finite = n => typeof n === 'number' && Number.isFinite(n);
const record = o => o && typeof o === 'object' && !Array.isArray(o);
const verdict = (status, reasons = [], extra = {}) => ({ status, reasons, standardAcceptance: false, ...extra });

export function inspectReport(id, report) {
  try {
    // Bound traversal before calling existing validators on untrusted JSON. Byte
    // limits alone do not prevent pathological nesting or tiny-record floods.
    const pending = [[report, 0]]; let count = 0;
    while (pending.length) {
      const [value, depth] = pending.pop();
      if (++count > 50000 || depth > 64) return verdict('incomplete', ['Report structure cap exceeded']);
      if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push([child, depth + 1]);
    }
    return inspectKnownReport(id, report);
  } catch { return verdict('incomplete', ['Malformed report evidence; validator could not establish coverage']); }
}
function inspectKnownReport(id, report) {
  const lane = LANES.find(l => l.id === id);
  if (!lane) return verdict('unavailable', ['Unknown lane']);
  if (!record(report)) return verdict('incomplete', ['Expected JSON object report']);
  if (lane.kind === 'gap' || lane.integration === 'api-only') return verdict('unsupported', [lane.actual]);
  if (id === 'stream-completion') {
    const problems = streamCompletionProblems(report);
    return verdict(problems.length ? 'incomplete' : 'unreviewed', problems.length ? problems : ['Raw completion evidence consistent; runtime review required; not standard acceptance.'],
      { observedSelection: report.diagnosticExecution ?? null, provenance: { sha: report.sha ?? null, machine: report.machine ?? null } });
  }
  if (lane.kind === 'standard') {
    if (report.diagnosticExecution?.profile === 'plain-completion-diagnostic') return verdict('unreviewed', ['Diagnostic plain fixture cannot be imported as standard Markdown timing evidence']);
    if (!Object.hasOwn(report, 'schemaVersion')) return verdict('incomplete', ['Missing standard schemaVersion']);
    if (report.schemaVersion !== 1) return verdict('stale-revision', ['Expected standard schemaVersion 1']);
    if (report.legacyExecution?.revision !== LEGACY_EXECUTION_REVISION) return verdict('stale-revision', [`Expected legacy execution revision ${LEGACY_EXECUTION_REVISION}`]);
    // WHY match comparability's section-based semantics: a current execution
    // manifest cannot make old/inferred stall measurements current. Reports that
    // only measured startup/history do not owe a stall revision.
    if (['replayStall', 'idleSessions', 'artifacts', 'projects', 'terminal', 'nativeStream', 'nativeResume']
      .some(section => report[section] != null) && report.stallMeasurementRevision !== STALL_MEASUREMENT_REVISION) {
      return verdict('stale-revision', [`Expected stall measurement revision ${STALL_MEASUREMENT_REVISION}`]);
    }
    const problems = legacyEvidenceProblems(report, { primary: PRIMARY, only: new Set([id]) });
    if (id === 'stall') problems.push(...replayEvidenceProblems(report.replayStall));
    if (report.aborted !== null || !Array.isArray(report.incomplete) || report.incomplete.length) problems.push('Report completion missing, aborted or incomplete');
    return verdict(problems.length ? 'incomplete' : 'measured', problems,
      { observedSelection: report.legacyExecution?.phases?.[id], provenance: { sha: report.sha ?? null, branch: report.branch ?? null, dirty: report.dirty ?? null, machine: report.machine ?? null },
        limitation: 'Contract-level observation only; no baseline comparison, binary attestation or full acceptance performed.' });
  }
  if (id === 'documents') {
    // A saved single owned-adapter attempt is not the standard runner's repeated
    // document section. Preserve its claims without inventing missing provenance.
    if (record(report.report) && report.report.schema === 1 && report.report.scope === 'app-viewer' && Array.isArray(report.report.cases)) {
      const saved = report.report;
      if (saved.descriptor?.revision !== DOCUMENT_ADAPTER_REVISION) return verdict('stale-revision', [`Expected document revision ${DOCUMENT_ADAPTER_REVISION}`]);
      const problems = [saved.descriptor.error, saved.descriptor.cleanupError, saved.descriptor.provenanceError,
        report.cleanup?.complete !== true ? 'Saved owned-attempt cleanup proof missing/incomplete' : null,
        saved.cases.some(row => row.status !== 'measured' || row.error) ? 'Saved case reports incomplete/failed outcome' : null].filter(Boolean);
      return verdict(problems.length ? 'incomplete' : 'unreviewed', problems.length ? problems : ['Saved adapter-attempt evidence available; standard repeated document section/provenance not reconstituted.'],
        { claimSource: 'saved owned-adapter attempt, not standard runner acceptance', observedSelection: report.caseIds ?? saved.cases.map(row => row.id),
          provenance: { build: report.build ?? null, sourceHashes: saved.descriptor.sourceHashes ?? null } });
    }
    const section = report.artifacts?.documents ?? report;
    if (section.runs?.some(r => r.descriptor?.revision !== DOCUMENT_ADAPTER_REVISION)) return verdict('stale-revision', [`Expected document revision ${DOCUMENT_ADAPTER_REVISION}`]);
    let problems;
    try { problems = documentProblems(section); } catch { return verdict('incomplete', ['Malformed document report']); }
    if (!Array.isArray(section.requiredCaseIds) || section.requiredCaseIds.some(id => !DOCUMENT_CASE_IDS.includes(id))) problems.push('Case selection outside integrated document smoke inventory');
    const breaches = problems.length ? [] : documentBreaches(section);
    return verdict(problems.length ? 'incomplete' : breaches.length ? 'measured-slow' : 'measured', problems,
      { breaches, observedSelection: section.requiredCaseIds ?? [], provenance: section.provenance ?? null });
  }
  if (id === 'images') {
    const r = Object.hasOwn(report, 'report') ? report.report : report;
    if (!record(r) || !Array.isArray(r.cases) || !record(r.descriptor?.imageCoverage)
      || !Number.isInteger(r.descriptor?.revision) || !Number.isInteger(r.descriptor.imageCoverage.revision)) return verdict('incomplete', ['Missing image diagnostic wrapper/schema identity']);
    // Conservative import, deliberately NOT a second image-policy validator. The
    // active image worker owns its changing input/7-step/budget policy. Preserve
    // claims and revisions, never elevate a status string into current acceptance.
    const claimSource = 'saved report producer claims; current input/image policy not independently revalidated by coverage';
    const observations = r.cases.map(row => ({ id: row.id, status: row.status, standardAcceptance: row.standardAcceptance,
      steps: (row.imageSteps ?? []).map(step => ({ id: step.id, status: step.status })) }));
    const errors = [r.descriptor.error, r.descriptor.cleanupError, report.cleanup?.complete === false ? 'Saved cleanup incomplete' : null,
      r.cases.some(row => row.status !== 'measured' || row.error || row.cleanupError) ? 'Image producer reports incomplete/failed case' : null].filter(Boolean);
    return verdict(errors.length ? 'incomplete' : 'unreviewed', errors.length ? errors : ['Image diagnostic evidence available; no current-policy or visual acceptance inferred.'],
      { claimSource, observedSelection: r.cases.map(row => row.id), observations, declaredRevisions: { input: r.descriptor.revision, imageCoverage: r.descriptor.imageCoverage.revision },
        provenance: { build: report.build ?? r.descriptor.buildStamp ?? null, sourceHashes: r.descriptor.sourceHashes ?? null } });
  }
  if (id === 'lifecycle' && report.descriptor?.lane === RESOURCE_DESCRIPTOR.lane
    && report.descriptor.revision === RESOURCE_DESCRIPTOR.revision && Array.isArray(report.cycles)) {
    // WHY: descriptor revision 3 separates renderer validity from family churn.
    // Recompute deltas from checkpoints, not the saved valid/resourceDeltas claims.
    const rows = report.cycles.map(c => ({ ...c, resourceDeltas: Object.fromEntries(['grown', 'switched', 'released']
      .map(phase => [phase, checkpointDelta(c.checkpoints?.before, c.checkpoints?.[phase])])) }));
    const summary = summariseCycles(rows), requested = report.options?.cycles;
    const selection = Number.isInteger(requested) && requested >= 1 && requested <= 5 && rows.length === requested
      && report.options?.resourceCheckpoints === true;
    const rendererValid = selection && summary.cycles.every((c, i) => c.index === i + 1 && c.completed === true
      && c.rendererValid && isDeepStrictEqual(c.natural, c.checkpoints?.released));
    return verdict(rendererValid && summary.status === 'measured' ? 'unreviewed' : 'incomplete',
      rendererValid ? summary.reasons : ['Raw resource checkpoints/workload/selection incomplete or renderer identity discontinuity'], {
        observations: { requestedCycles: requested ?? null, observedCycles: rows.length, rendererValid,
          // WHY: forced collection changes subsequent pre-collection observations;
          // preserving only validity/PSS would silently relabel intervened data as natural.
          gcPolicy: summary.gcPolicy, preCollectionPolicy: summary.gcPolicy === 'intervened' ? 'gc-intervened-pre-collection' : 'natural',
          trajectories: summary.trajectories, interpretation: summary.context,
          familyPssTrend: summary.familyPssTrend, familyPssComparable: summary.cycles.map(c => c.familyPssComparable) },
        provenance: report.build ?? null, limitation: 'Enumerated family composition only; no aggregate PSS trend when membership changes, no whole-app acceptance.' });
  }
  // Diagnostic schemas are deliberately NOT promoted to standard acceptance. A
  // recognized shape/status is only an imported observation awaiting lane review.
  if (id==='lifecycle' && report.descriptor?.lane==='short-lifecycle-natural-settle' && report.descriptor.revision===5 && Array.isArray(report.cycles)) {
    // WHY: preserve separate renderer observations without upgrading unrequested
    // process memory (or a producer status string) into whole-app acceptance.
    const summary = summariseSettle(report.cycles), workload = summariseCycles(report.cycles);
    const requested = report.options?.cycles, domain = report.options?.settleDomain ?? 'full';
    const validSelection = Number.isInteger(requested) && requested >= 1 && requested <= 3
      && requested === report.cycles.length && summary.effectivePointCount === requested * 8;
    const rendererOnly = domain === 'renderer' && validSelection && summary.status === 'measured-renderer-only'
      && workload.cycles.every(c => c.completed === true && c.rendererValid)
      && report.cycles.every((c, index) => c.index === index + 1 && c.created.length === 2
        && c.gcRequested === false && c.afterGc?.status === 'unmeasured'
        // WHY: two internally coherent series are not proof of the same released
        // observation. Join the complete raw sample structurally, ignoring key order.
        && isDeepStrictEqual(c.natural, c.settle?.[1]?.points?.[0]?.sample)
        && c.settle.length === 2 && c.settle.every(p => p.domain === 'renderer'
          && p.points.every(({ sample }) => sample.process?.status === 'not-collected'
            && sample.pss?.status === 'not-collected' && sample.pss.totalMb === null
            && RESOURCE_METRICS.every(key => finite(sample.metrics?.[key]) && sample.metrics[key] >= 0))));
    return verdict(rendererOnly ? 'measured-renderer-only' : 'incomplete',
      rendererOnly ? ['Renderer subdomain revalidated from raw checkpoints and workload steps; whole-app memory intentionally not collected.']
        : ['Natural-settle evidence incomplete, wrong domain/selection or invalid workload; stored summary is not validation.'], {
      observedStatus: report.status ?? null, wholeAppStatus: 'incomplete',
      observations: { renderer: rendererOnly ? summary.status : 'incomplete', process: summary.process,
        domain, requestedCycles: requested ?? null, observedCycles: report.cycles.length,
        effectivePointCount: summary.effectivePointCount, trajectories: summary.observed },
      provenance: { build: report.build ?? null, checkpointIdentity: report.cycles[0]?.settle?.[0]?.points?.[0]?.sample?.identity ?? null },
      limitation: 'Reported source identity, not attested packaged bytes. Natural observations are not proof of GC, leaks or whole-app health.' });
  }
  if (id === 'sensors') {
    const r = report.report ?? report;
    if (r.schema !== 1 || r.lane !== 'sensor-only-diagnostic' || r.appAttributable !== false || !Array.isArray(r.samples)) return verdict('incomplete', ['Sensor-only schema/scope missing']);
    // WHY inspect readings too: discovery can enumerate a readable descriptor
    // without permission to read its counter. Preserve nested errno evidence,
    // bounded and deduplicated, instead of replacing EACCES with only truncation.
    const reasons = [], seen = new Set();
    const addReason = reason => {
      if (typeof reason !== 'string' || !reason || reasons.length >= 32) return;
      const bounded = reason.slice(0, 512);
      if (!seen.has(bounded)) { seen.add(bounded); reasons.push(bounded); }
    };
    addReason(r.reason);
    if (r.discovery?.truncated) addReason('Sensor discovery truncated');
    for (const error of r.discovery?.errors ?? []) addReason(error.reason);
    for (const sample of r.samples) for (const reading of sample.readings ?? []) addReason(reading.reason);
    let validFinalEvidence = false;
    if (r.status === 'supported') {
      // WHY: discovery/envelope status cannot certify missing or failed readings.
      // The existing final protocol validator is pure: no helper/worker is started.
      try { encodeSensorFrame({ type: 'result', report: r }); validFinalEvidence = true; }
      catch (error) { addReason(`Sensor evidence invalid: ${error.message}`); }
    }
    return verdict(r.status === 'unsupported' ? 'unsupported' : !validFinalEvidence || r.discovery?.status !== 'supported' || r.discovery?.truncated || !r.samples.length ? 'incomplete' : 'unreviewed', reasons, { appAttributable: false, observedStatus: r.status });
  }
  // mixed-activity saves the finishMixedPresentation RESULT under
  // nativePresentation. Its optional .presentation is only protocol detail;
  // workloadLegs and the authoritative status live on the result itself.
  const presentationResult = Object.hasOwn(report, 'nativePresentation') ? report.nativePresentation : report;
  const presentationShape = r => record(r) && Array.isArray(r.workloadLegs)
    && r.workloadLegs.every(l => record(l) && typeof l.name === 'string' && typeof l.engaged === 'boolean')
    && ['incomplete', 'control-no-presentation', 'conditional-surface-evidence'].includes(r.status)
    && (r.trace === null || record(r.trace)) && typeof r.scope === 'string' && record(r.files)
    && (r.presentation === undefined || record(r.presentation) && Array.isArray(r.presentation.legs));
  const identity = {
    lifecycle: () => report.descriptor?.revision === 2 && report.descriptor?.lane === 'short-lifecycle-diagnostic' && Array.isArray(report.cycles),
    'dom-growth': () => report.revision === 1 && report.descriptor?.lane === 'workbench-dom-growth-diagnostic' && Array.isArray(report.rows),
    images: () => report.descriptor?.imageCoverage?.revision === 1 && Array.isArray(report.cases),
    'gpu-cost': () => report.tool === 'gpu-cost.mjs' && typeof report.suite === 'string',
    realism: () => record(report.factors) && record(report.runs) && record(report.controls),
    presentation: () => presentationShape(presentationResult),
    'idle-overhead': () => finite(report.seconds) && record(report.cleanup),
  };
  if (!identity[id]?.()) return verdict('incomplete', ['Missing/unsupported diagnostic schema identity']);
  const r = id === 'presentation' ? presentationResult : report;
  const observations = id === 'dom-growth' ? report.rows.map(row => ({ surface: row.surface ?? null, status: row.growth?.status ?? null,
    reason: row.growth?.reason ?? row.why ?? null, reachedEnd: row.growth?.reachedEnd ?? null,
    renderedRows: row.growth?.checkpoints?.at(-1)?.snapshot?.renderedRows ?? null,
    effectiveRows: row.growth?.initial?.snapshot?.effectiveRows ?? null, resetProven: row.growth?.reset?.proven === true, source: row.growth?.source ?? null }))
    : id === 'lifecycle' ? { requestedCycles: report.options?.cycles ?? null, observedCycles: report.cycles.length,
      resourceCheckpoints: report.options?.resourceCheckpoints === true, identity: report.identity ?? null, build: report.build ?? null } : null;
  const incompleteGrowth = id === 'dom-growth' && report.rows.some(row => row.growth?.status !== 'measured' || row.growth?.reachedEnd !== true);
  if (incompleteGrowth || ['failed', 'incomplete', 'refused'].includes(r.status) || r.error || r.cleanupError || r.evidenceOmitted) return verdict('incomplete',
    [r.error ?? r.cleanupError ?? `Diagnostic reports ${r.status}`, ...(Array.isArray(observations) ? observations.map(o => o.reason).filter(Boolean) : [])], { observedStatus: r.status, observations, provenance: report.source ?? report.build ?? report.identity ?? null });
  if (r.status === 'unsupported') return verdict('unsupported', [r.reason ?? 'Reported unsupported']);
  return verdict('unreviewed', ['Recognized diagnostic schema; independent raw-evidence/runtime review still required.'],
    { observedStatus: r.status ?? null, observations, provenance: report.source ?? report.build ?? report.identity ?? null });
}

/** Explicit local report paths only. No directory scanning, nested report refs,
 * trace files, arbitrary external paths or symlink ancestors are followed. A cap+1
 * read bounds allocations even if the file grows after fstat. Hash actual bytes. */
export function readCoverageReport(path, { root = ROOT, maxBytes = REPORT_BYTE_CAP } = {}) {
  let fd;
  try {
    if (typeof path !== 'string' || path.length > 4096 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > REPORT_BYTE_CAP) throw Error('Invalid explicit report path/byte cap');
    root = resolve(root); const absolute = resolve(root, path), rel = relative(root, absolute);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('Report must be inside this workspace root');
    let current = parse(absolute).root;
    const identities = [];
    for (const component of absolute.slice(current.length).split(/[\\/]/)) {
      current = join(current, component); const s = lstatSync(current);
      if (s.isSymbolicLink()) throw Error('Report symlink/ancestor refused');
      identities.push({ path: current, dev: s.dev, ino: s.ino });
    }
    fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd); if (!stat.isFile() || stat.size > maxBytes) throw Error('Report must be a bounded regular file');
    const checkIdentity = () => {
      for (const old of identities) { const now = lstatSync(old.path); if (now.isSymbolicLink() || now.dev !== old.dev || now.ino !== old.ino) throw Error('Report path identity changed'); }
      const last = identities.at(-1); if (last.dev !== stat.dev || last.ino !== stat.ino) throw Error('Opened report identity mismatch');
    };
    checkIdentity();
    const buffer = Buffer.alloc(maxBytes + 1); let count = 0;
    while (count <= maxBytes) { const n = readSync(fd, buffer, count, maxBytes + 1 - count, count); if (!n) break; count += n; }
    checkIdentity();
    if (count > maxBytes) throw Error('Report byte cap exceeded');
    const bytes = buffer.subarray(0, count), sha256 = createHash('sha256').update(bytes).digest('hex');
    let report; try { report = JSON.parse(bytes.toString('utf8')); } catch { return { status: 'unavailable', path: rel, bytes: count, sha256, reason: 'Invalid JSON report' }; }
    return { status: 'available', path: rel, bytes: count, sha256, report };
  } catch (error) { return { status: 'unavailable', path, reason: error.code ?? error.message }; }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function buildCoverage({ reports = [], root = ROOT } = {}) {
  if (!Array.isArray(reports) || reports.length > 32) throw Error('At most 32 explicit report imports');
  const imported = reports.map(({ lane, path }) => {
    if (!LANES.some(l => l.id === lane)) throw Error(`Unknown lane ${lane}`);
    const read = readCoverageReport(path, { root });
    const { report, ...reference } = read;
    return { lane, reference, assessment: read.status === 'available' ? inspectReport(lane, report) : verdict('unavailable', [read.reason]) };
  });
  return { schema: COVERAGE_REVISION, tool: 'perf-lab-coverage', standardAcceptance: false,
    scope: 'Source inventory plus explicitly imported local reports; never executes workloads or discovers sensors.',
    lanes: LANES.map(l => { const evidence = imported.filter(r => r.lane === l.id); return { ...l, runtime: evidence.length ? 'imported-see-evidence' : 'not-imported', evidence }; }),
    limits: ['Source implementation is not runtime acceptance.', 'Imported hashes bind only bytes read; paths/build fields inside a report are not followed or independently attested.', 'No report imports means runtime unavailable, not no issues.', 'Broad diagnostic goal remains incomplete: queue/drain, hidden windows, image review, GPU/physical display, mobile and app energy still have gaps.'] };
}
const cell = value => String(value ?? '—').replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
export function renderCoverageMarkdown(c) {
  const lines = ['# Performance lab coverage', '', c.scope, '', '**Inventory is not standard acceptance.** Implemented, integrated, observed and reviewed are separate claims.', '',
    '| lane | implementation / integration / review | runtime evidence | purpose and actual scope | command | limits / budgets |', '|---|---|---|---|---|---|'];
  for (const l of c.lanes) lines.push(`| ${cell(l.id)} | ${cell(`${l.implementation}; ${l.integration}; ${l.review}`)} | ${cell(l.evidence.length ? l.evidence.map(e => `${e.assessment.status}: ${e.reference.path}${e.reference.sha256 ? ` sha256:${e.reference.sha256}` : ''}; ${e.assessment.reasons.join('; ')}`).join('; ') : 'not imported / unavailable')} | ${cell(`${l.purpose}. ${l.actual}`)} | ${l.command ? `\`${cell(l.command)}\`` : 'API/gap only; no runner command'} | ${cell([...l.limits, l.budgets].join(' '))} |`);
  lines.push('', '## Reported source identities — not build attestation', '');
  for (const lane of c.lanes) for (const evidence of lane.evidence) {
    const provenance = evidence.assessment.provenance;
    const source = provenance?.build ?? provenance;
    const identity = record(source) ? Object.fromEntries(['sha', 'dirty', 'builtAt', 'checkout', 'appDir', 'binary']
      .filter(key => source[key] != null).map(key => [key, source[key]])) : {};
    lines.push(`- ${cell(lane.id)} / ${cell(evidence.reference.path)}: ${Object.keys(identity).length ? `\`${cell(JSON.stringify(identity))}\`` : 'No app build identity established by this import.'}`);
  }
  lines.push('', '## Diagnostic distinctions', '');
  for (const lane of c.lanes) for (const evidence of lane.evidence) {
    const observed = evidence.assessment.observations;
    if (observed?.gcPolicy) {
      lines.push(`- ${cell(lane.id)} / ${cell(evidence.reference.path)}: GC policy: ${cell(observed.gcPolicy)}; pre-collection policy: ${cell(observed.preCollectionPolicy)}. ${cell(observed.interpretation)}`);
      lines.push(`  - Recomputed trajectories: \`${cell(JSON.stringify(observed.trajectories))}\``);
    }
    if (evidence.assessment.declaredRevisions) lines.push(`- ${cell(lane.id)} / ${cell(evidence.reference.path)}: producer-declared revisions \`${cell(JSON.stringify(evidence.assessment.declaredRevisions))}\`; not independent current-policy validation.`);
  }
  lines.push('', '## Limits', ...c.limits.map(l => `- ${l}`), '');
  return lines.join('\n');
}

export function parseCoverageArgs(argv) {
  if (!Array.isArray(argv) || argv.length > 68) throw Error('Coverage argument cap');
  const result = { format: 'json', reports: [] }; let formatSeen = false;
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (typeof value !== 'string' || value.length > 4096) throw Error('Coverage option requires bounded value');
    if (key === '--format' && !formatSeen && ['json', 'markdown'].includes(value)) { result.format = value; formatSeen = true; }
    else if (key === '--report') {
      const at = value.indexOf('='), lane = value.slice(0, at), path = value.slice(at + 1);
      if (at < 1 || !path || !LANES.some(l => l.id === lane) || result.reports.length >= 32) throw Error('Expected known-lane=explicit-local-report.json');
      result.reports.push({ lane, path });
    } else throw Error('Only --format json|markdown and repeated --report lane=path are supported');
  }
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCoverageArgs(process.argv.slice(2)), coverage = buildCoverage(options);
    console.log(options.format === 'markdown' ? renderCoverageMarkdown(coverage) : JSON.stringify(coverage, null, 2));
    // This exit code describes importing only, never a performance/acceptance pass.
    if (coverage.lanes.some(l => l.evidence.some(e => e.assessment.status === 'unavailable'))) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
