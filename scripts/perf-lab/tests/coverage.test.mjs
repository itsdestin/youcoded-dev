import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANES, buildCoverage, renderCoverageMarkdown, readCoverageReport, parseCoverageArgs, inspectReport } from '../coverage.mjs';
import { PHASES, parseArgs } from '../run.mjs';
import { parseOptions as lifecycleOptions, runCycles, summariseCycles } from '../short-lifecycle.mjs';
import { summariseSettle } from '../natural-settle.mjs';
import { captureCheckpoint, RESOURCE_METRICS } from '../resource-checkpoint.mjs';
import { parseOptions as realismOptions } from '../realism.mjs';
import { parseSensorArgs } from '../energy-sensors.mjs';
import { parseDomOptions } from '../../ui-review/dom-options.mjs';
import { DOCUMENT_CASE_IDS, DOCUMENT_INSTRUMENT_FILES } from '../document-report.mjs';
import { DOCUMENT_ADAPTER_REVISION, DOCUMENT_CONTROL_TYPES } from '../document-input.mjs';
import { documentEvidence, setDocumentOperation, shiftDocumentInput } from './document-evidence-fixture.mjs';
import { validLegacyReport } from './legacy-fixture.mjs';
import { STALL_MEASUREMENT_REVISION } from '../stall-attribution.mjs';
import { finishMixedPresentation } from '../mixed-presentation.mjs';
import { preservedChurnCycle } from './lifecycle-churn-fixture.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('inventory pins all standard phases, bounded document subset and existing source entrypoints', () => {
  assert.deepEqual(LANES.filter(l => l.kind === 'standard').map(l => l.phase), PHASES);
  assert.deepEqual(LANES.find(l => l.id === 'documents').cases, DOCUMENT_CASE_IDS);
  for (const lane of LANES) for (const entry of lane.sources) assert.ok(existsSync(join(root, entry)), `${lane.id}: ${entry}`);
  assert.equal(LANES.find(l => l.id === 'images').integration, 'opt-in-api');
  assert.equal(LANES.find(l => l.id === 'background-cost').integration, 'api-only');
});

const imageReport = 'scratch/image-stalls-runtime-wSQUqA/runtime-report.json';
test('actual small-PNG saved report is recognized conservatively without standard image acceptance', { skip: !existsSync(join(root, imageReport)) }, () => {
  const imported = readCoverageReport(imageReport);
  assert.equal(imported.status, 'available');
  const r = inspectReport('images', imported.report);
  assert.equal(r.status, 'unreviewed', JSON.stringify(r));
  assert.equal(r.standardAcceptance, false);
  assert.ok(r.observedSelection.length === 1);
  assert.equal(r.claimSource, 'saved report producer claims; current input/image policy not independently revalidated by coverage');
  const md = renderCoverageMarkdown(buildCoverage({ reports: [{ lane: 'images', path: imageReport }] }));
  assert.match(md, /producer-declared revisions/);
  assert.ok(md.includes(JSON.stringify(r.declaredRevisions)));
  assert.match(md, /not independent current-policy validation/);
});

const savedDocumentReport = 'scratch/document-stalls-runtime-jNljbL/runtime-report.json';
test('saved single document adapter attempt remains distinct from standard repeated document acceptance', { skip: !existsSync(join(root, savedDocumentReport)) }, () => {
  const read = readCoverageReport(savedDocumentReport);
  assert.equal(read.status, 'available');
  const result = inspectReport('documents', read.report);
  assert.equal(result.status, 'unreviewed', JSON.stringify(result));
  assert.equal(result.standardAcceptance, false);
  assert.deepEqual(result.observedSelection, ['csv-rows-64kib']);
  assert.match(result.claimSource, /not standard runner/);
});

async function rendererSettleReport() {
  let clock = 100, serial = 0, ids = ['anchor'];
  const now = () => clock;
  const driver = {
    state: async () => ({ ids: [...ids], pills: [...ids], mounted: ids.length, visible: 1 }),
    verifyAnchor: async () => true, switchTo: async () => {}, records: async () => 1,
    create: async () => { const id = `owned-${++serial}`; ids.push(id); return id; },
    close: async id => { ids = ids.filter(x => x !== id); },
    send: async () => ({ deltasSent: 20, plannedDeltas: 20, chars: 100, shown: true, exact: true, persistedExact: true, turnComplete: true, aborted: false }),
    sample: async () => captureCheckpoint({ phase: 'released', domain: 'renderer', now,
      identity: { source: 'reported-package-source', run: 'run', target: 'target' },
      readEpoch: async () => ({ documentEpoch: '100', url: 'app://' }),
      cdp: { send: async () => { clock += 2; return { metrics: RESOURCE_METRICS.map(name => ({ name, value: 10 })) }; } } }),
  };
  const cycles = await runCycles(null, null, { cycles: 3, driver, settleCheckpoints: true, settleDomain: 'renderer',
    anchor: 'anchor', now, wait: async ms => { clock += ms; }, deadline: 100000 });
  return { descriptor: { revision: 5, lane: 'short-lifecycle-natural-settle' }, status: 'incomplete',
    options: { settleDomain: 'renderer', cycles: 3 }, cycles, settleSummary: { status: 'forged-do-not-trust' } };
}
test('renderer settle subdomain is revalidated without whole-app memory or stored summary credit', async () => {
  const result = inspectReport('lifecycle', await rendererSettleReport());
  assert.equal(result.status, 'measured-renderer-only', JSON.stringify(result));
  assert.equal(result.standardAcceptance, false);
  assert.equal(result.wholeAppStatus, 'incomplete');
  assert.equal(result.observations.effectivePointCount, 24);
  assert.equal(result.observations.process.status, 'not-collected');
});
test('renderer settle missing points, effective steps, revisions and identities cannot inherit a successful summary', async () => {
  const original = await rendererSettleReport();
  const defects = [
    r => { r.cycles.pop(); },
    r => { r.cycles[2].settle[1].points.pop(); },
    r => { r.cycles[1].output.pop(); },
    r => { r.cycles[1].index = 99; },
    r => { r.cycles[1].gcRequested = true; },
    r => { r.cycles[1].settle[0].points[1].sample.metrics.Nodes = -1; },
    r => { r.cycles[1].settle[0].points[1].sample.process.status = 'measured'; },
    r => { r.cycles[0].closed.pop(); },
    r => { r.cycles[1].settle[0].kind = 'workload'; },
    ...['source', 'run', 'target', 'documentEpoch', 'documentUrl'].map(key => r => { r.cycles[1].settle[0].points[1].sample.identity[key] = 'changed'; }),
    r => { r.cycles[1].settle[0].points[1].sample.metrics.TaskDuration = 0; },
    r => { r.descriptor.revision = 4; }, r => { r.descriptor.revision = 999; },
  ];
  for (const defect of defects) {
    const report = structuredClone(original); defect(report);
    report.settleSummary = { status: 'measured-renderer-only', effectivePointCount: 24 };
    assert.equal(inspectReport('lifecycle', report).status, 'incomplete');
  }
});
test('renderer released workload sample must structurally join its settle point, not a second coherent sample series', async () => {
  const original = await rendererSettleReport();
  for (const defect of ['source', 'run', 'target', 'documentEpoch', 'documentUrl', 'metric', 'time', 'workload-metric', 'workload-time']) {
    const report = structuredClone(original);
    for (const c of report.cycles) {
      // Break the producer's alias so only the separately stored released slot changes.
      c.natural = structuredClone(c.natural);
      if (defect === 'metric') c.natural.metrics.Nodes += 1;
      else if (defect === 'time') c.natural.startedAt += 0.25;
      else if (defect === 'workload-metric') c.settle[1].points[0].sample.metrics.Nodes += 1;
      else if (defect === 'workload-time') c.settle[1].points[0].sample.startedAt += 0.25;
      else c.natural.identity[defect] = `other-coherent-${defect}`;
    }
    assert.ok(summariseCycles(report.cycles).cycles.every(c => c.rendererValid), `standalone released series: ${defect}`);
    assert.equal(summariseSettle(report.cycles).status, 'measured-renderer-only', `standalone settle series: ${defect}`);
    assert.equal(inspectReport('lifecycle', report).status, 'incomplete', defect);
  }
  const reordered = structuredClone(original);
  for (const c of reordered.cycles) c.natural = Object.fromEntries(Object.entries(c.natural).reverse());
  assert.equal(inspectReport('lifecycle', reordered).status, 'measured-renderer-only', 'object key order is not sample identity');
});

test('current full-resource descriptor preserves revalidated renderer evidence and incomparable family PSS', () => {
  const report = { descriptor: { revision: 3, lane: 'short-lifecycle-diagnostic' }, options: { cycles: 1, resourceCheckpoints: true },
    status: 'measured', cycles: [preservedChurnCycle()], build: { sha: 'reported-current-source' } };
  const result = inspectReport('lifecycle', report);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.observations.rendererValid, true);
  assert.equal(result.observations.familyPssTrend.status, 'incomparable');
  assert.equal(result.provenance.sha, 'reported-current-source');
  assert.equal(result.standardAcceptance, false);
  // Stored delta/validity claims cannot conceal raw source discontinuity.
  report.cycles[0].checkpoints.grown.identity.source = 'changed';
  assert.equal(inspectReport('lifecycle', report).observations.rendererValid, false);
});
test('full-resource natural and GC-intervened producer trajectories stay distinct in JSON and Markdown', async () => {
  for (const postGc of [false, true]) {
    let clock = 100, serial = 0, ids = ['anchor'];
    const driver = {
      state: async () => ({ ids: [...ids], mounted: ids.length }),
      create: async () => { const id = `owned-${++serial}`; ids.push(id); return id; },
      close: async id => { ids = ids.filter(x => x !== id); }, switchTo: async () => {}, records: async () => 1,
      send: async () => ({ deltasSent: 20, plannedDeltas: 20, chars: 100, shown: true, exact: true, persistedExact: true, turnComplete: true, aborted: false }),
      collectGc: async () => {},
      sample: async (phase, gcPolicy) => captureCheckpoint({ phase, gcPolicy, now: () => clock++,
        identity: { source: 'source', run: 'run', target: 'target' }, readEpoch: async () => ({ documentEpoch: '100', url: 'app://' }),
        family: () => [123], readProcessStart: () => 'start-123',
        readPss: () => ({ totalMb: 12, perPid: [{ pid: 123, mb: 12 }] }),
        cdp: { send: async () => ({ metrics: RESOURCE_METRICS.map(name => ({ name, value: 10 })) }) } }),
    };
    const cycles = await runCycles(null, null, { cycles: 2, driver, resourceCheckpoints: true, postGc });
    const result = inspectReport('lifecycle', { descriptor: { revision: 3, lane: 'short-lifecycle-diagnostic' },
      options: { cycles: 2, resourceCheckpoints: true }, cycles });
    assert.equal(result.status, 'unreviewed');
    assert.equal(result.observations.gcPolicy, postGc ? 'intervened' : 'natural');
    assert.equal(result.observations.preCollectionPolicy, postGc ? 'gc-intervened-pre-collection' : 'natural');
    assert.equal(result.observations.trajectories.natural === null, postGc);
    assert.equal(result.observations.trajectories.forcedGc === null, !postGc);
    const c = buildCoverage();
    c.lanes.find(l => l.id === 'lifecycle').evidence.push({ reference: { path: 'synthetic.json' }, assessment: result });
    const md = renderCoverageMarkdown(c);
    assert.match(md, postGc ? /gc-intervened-pre-collection/ : /pre-collection policy: natural/);
    assert.match(md, postGc ? /forcedGc/ : /natural/);
    assert.equal(result.standardAcceptance, false);
  }
});

test('supported sensor import requires nonempty valid domain readings, not successful envelope claims', () => {
  const sensor = { id: '/sys/devices/fake/energy_uj', path: '/sys/devices/fake/energy_uj', kind: 'powercap', unit: 'microjoule', scope: 'cpu-package-domain', source: 'linux-powercap' };
  const valid = { schema: 1, lane: 'sensor-only-diagnostic', standardAcceptance: false, appAttributable: false, status: 'supported', lostCheckpoints: 0,
    discovery: { status: 'supported', sensors: [sensor] }, samples: [{ atMs: 0, readElapsedMs: 3, readings: [
      { status: 'supported', sensor, sourceIdentity: sensor.path, startMs: 1, atMs: 2, value: '10', range: '1000', unit: 'microjoule' },
    ] }] };
  for (const wrapped of [valid, { report: valid }]) {
    assert.equal(inspectReport('sensors', wrapped).status, 'unreviewed');
    assert.equal(inspectReport('sensors', wrapped).standardAcceptance, false);
  }
  for (const defect of [
    r => { r.samples[0].readings = []; }, r => { r.discovery.sensors = []; r.samples[0].readings = []; },
    r => { r.samples[0].readings[0] = { status: 'failed', reason: 'Permission unavailable: EACCES' }; },
    r => { r.samples[0].readings[0].value = 'NaN'; }, r => { r.samples[0].readings[0].range = '5'; },
    r => { r.samples[0].readings[0].unit = 'joule'; }, r => { r.samples[0].readings[0].atMs = Infinity; },
    r => { r.samples[0].readings[0].sourceIdentity = '/sys/other'; }, r => { r.discovery.sensors.push(structuredClone(r.discovery.sensors[0])); },
  ]) {
    const report = structuredClone(valid); defect(report);
    const result = inspectReport('sensors', report);
    assert.equal(result.status, 'incomplete', JSON.stringify(report));
    assert.ok(result.reasons.length);
    assert.equal(new Set(result.reasons).size, result.reasons.length);
    if (report.samples[0].readings[0]?.status === 'failed') assert.match(result.reasons.join(' '), /EACCES/);
  }
});

test('no supplied reports means unavailable runtime, not healthy based on implemented source', () => {
  const c = buildCoverage();
  assert.equal(c.standardAcceptance, false);
  assert.ok(c.lanes.every(l => l.evidence.length === 0));
  assert.ok(c.lanes.every(l => l.runtime === 'not-imported'));
  const md = renderCoverageMarkdown(c);
  for (const l of c.lanes) assert.ok(md.includes(l.id));
  assert.match(md, /not.*acceptance/i);
});

test('valid legacy observations, incomplete samples, stale revision and unreviewed diagnostics stay distinct', () => {
  const r = { schemaVersion: 1, ...validLegacyReport(['startup']), aborted: null, incomplete: [], sha: 'abc', machine: { cpu: 'unit' } };
  assert.equal(inspectReport('startup', r).status, 'measured');
  r.startup.runs.pop();
  assert.equal(inspectReport('startup', r).status, 'incomplete');
  r.legacyExecution.revision = 0;
  assert.equal(inspectReport('startup', r).status, 'stale-revision');
  assert.equal(inspectReport('images', { descriptor: { revision: 3, imageCoverage: { revision: 1 } }, cases: [{ status: 'measured', imageDiagnostic: true }] }).status, 'unreviewed');
  assert.equal(inspectReport('gpu-cost', { tool: 'gpu-cost.mjs', status: 'complete', suite: 'control', machine: {} }).status, 'unreviewed');
  assert.equal(inspectReport('startup', {}).status, 'incomplete');
});

test('actual presentation producer result imports directly and from mixed-activity nativePresentation wrapper', () => {
  const result = finishMixedPresentation({ stopped: true, legs: [{ name: 'mixed', engaged: true }],
    trace: { status: 'complete', markerPairs: { status: 'complete' } } }, { protocolCapture: { error: null, truncated: false } },
    { protocolDebug: 'off', out: '/not-read-control' }, { appStopped: true });
  assert.equal(result.status, 'control-no-presentation');
  assert.equal(inspectReport('presentation', result).status, 'unreviewed');
  assert.equal(inspectReport('presentation', { nativePresentation: result }).status, 'unreviewed');
  // Protocol summary belongs INSIDE the result, not at the workload-leg level.
  const conditional = { ...result, status: 'conditional-surface-evidence', presentation: { status: 'conditional-surface', presented: 2, legs: [{ name: 'mixed' }] } };
  assert.equal(inspectReport('presentation', conditional).status, 'unreviewed');
  assert.equal(inspectReport('presentation', { nativePresentation: conditional }).status, 'unreviewed');
  assert.equal(inspectReport('presentation', { presentation: conditional.presentation }).status, 'incomplete');
  assert.equal(inspectReport('presentation', { nativePresentation: {}, ...conditional }).status, 'incomplete', 'explicit malformed wrapper cannot fall back to unrelated outer evidence');
});

test('stall-bearing standard imports require current measurement revision while startup/history do not', () => {
  for (const phase of ['stall', 'artifacts', 'projects', 'terminal', 'native-stream', 'native-resume']) {
    const report = { schemaVersion: 1, ...validLegacyReport([phase]), aborted: null, incomplete: [], stallMeasurementRevision: STALL_MEASUREMENT_REVISION };
    assert.equal(inspectReport(phase, report).status, 'measured', phase);
    for (const revision of [undefined, 0, 1, 999]) {
      report.stallMeasurementRevision = revision;
      assert.equal(inspectReport(phase, report).status, 'stale-revision', `${phase}:${revision}`);
    }
  }
  for (const phase of ['startup', 'history']) {
    const report = { schemaVersion: 1, ...validLegacyReport([phase]), aborted: null, incomplete: [] };
    assert.equal(inspectReport(phase, report).status, 'measured', phase);
  }
});

const savedSensorPath = 'scratch/sensor-runs/preflight-20261020T221551Z-16573/report.json';
test('actual saved sensor preflight retains reading-level EACCES with empty discovery errors', { skip: !existsSync(join(root, savedSensorPath)) }, () => {
  const read = readCoverageReport(savedSensorPath);
  assert.equal(read.status, 'available');
  assert.deepEqual(read.report.discovery.errors, []);
  assert.equal(read.report.discovery.truncated, true);
  assert.ok(read.report.samples.some(s => s.readings.some(r => /EACCES/.test(r.reason ?? ''))));
  const assessment = inspectReport('sensors', read.report);
  assert.equal(assessment.status, 'incomplete');
  assert.match(assessment.reasons.join(' '), /EACCES/);
  assert.equal(assessment.reasons.filter(r => /EACCES/.test(r)).length, 1);
  assert.ok(assessment.reasons.length <= 32 && assessment.reasons.every(r => r.length <= 512));
  const coverage = buildCoverage({ reports: [{ lane: 'sensors', path: savedSensorPath }] });
  assert.match(renderCoverageMarkdown(coverage), /EACCES/);
});

function documents() {
  const caseId = 'csv-rows-64kib';
  const sourceHashes = ['XlsxView.tsx', 'CsvView.tsx', 'DocxView.tsx', 'HtmlView.tsx'].map(name => ({ file: `/checkout/desktop/src/renderer/components/artifact-views/${name}`, sha256: 'a'.repeat(64) }));
  const fingerprint = { sha: 'a'.repeat(40), dirty: 'a'.repeat(12), branch: 'test' };
  const row = id => ({ ...documentEvidence(id), status: 'measured', fixture: { bytes: 123, sha256: 'a'.repeat(64), shape: { rows: 10 } } });
  const calibrations = DOCUMENT_CONTROL_TYPES.map(control => {
    const r = row(`control-${control}`); r.proof.control = control;
    if (control === 'renderer-block') { r.renderer.maxDelayMs = 400; setDocumentOperation(r, 600); shiftDocumentInput(r, 390); }
    if (control === 'main-block') { r.main.maxDelayMs = 400; setDocumentOperation(r, 400); }
    if (control === 'slow-async') setDocumentOperation(r, 400);
    if (control === 'renderer-congestion') { setDocumentOperation(r, 800); r.renderer.totalExcessMs = 200; r.renderer.maxDelayMs = 40; shiftDocumentInput(r, 20); Object.assign(r.proof, { shortTaskCount: 24, shortTaskBusyMs: 720, shortTaskMaxMs: 35 }); }
    return r;
  });
  return { expectedRepeats: 1, requiredCaseIds: [caseId], provenance: { profile: 'smoke', caseIds: [caseId], checkout: '/checkout',
    build: { ...fingerprint, binary: '/checkout/app' }, labSource: fingerprint, node: 'v26', platform: 'linux', arch: 'x64', memoryPolicy: 'RSS cap', renderingPolicy: 'software',
    instrumentHashes: Object.fromEntries(DOCUMENT_INSTRUMENT_FILES.map(f => [f, 'a'.repeat(64)])), sourceHashes },
    runs: [{ descriptor: { revision: DOCUMENT_ADAPTER_REVISION, calibrationValid: true, buildVerified: true, buildStampSha256: 'a'.repeat(64),
      checkout: '/checkout', binary: '/checkout/app', buildStamp: fingerprint, sourceHashes, calibrations }, cases: [row(caseId)] }] };
}

test('document observations preserve measured-slow, incomplete, stale and exact selected subset without budgeting controls', () => {
  const d = documents();
  const healthy = inspectReport('documents', d);
  assert.equal(healthy.status, 'measured', JSON.stringify(healthy));
  assert.deepEqual(healthy.observedSelection, ['csv-rows-64kib']);
  assert.deepEqual(healthy.breaches, [], 'injected 400ms controls are not performance cases');
  d.runs[0].cases[0].renderer.maxDelayMs = 12000;
  const slow = inspectReport('documents', d);
  assert.equal(slow.status, 'measured-slow', JSON.stringify(slow));
  assert.equal(slow.breaches[0].value, 12000);
  d.runs[0].cases[0].input.latencyMs = null;
  assert.equal(inspectReport('documents', d).status, 'incomplete');
  d.runs[0].descriptor.revision = 1;
  assert.equal(inspectReport('documents', d).status, 'stale-revision');
});

test('partial DOM growth retains observed cap and reset proof without saturation credit', () => {
  const r = { revision: 1, descriptor: { lane: 'workbench-dom-growth-diagnostic' }, status: 'incomplete', rows: [{ surface: 'projects/conversations',
    growth: { status: 'incomplete', reason: 'checkpoint cap exhausted', reachedEnd: false, initial: { snapshot: { effectiveRows: 2000 } },
      checkpoints: [{ snapshot: { renderedRows: 550 } }], reset: { proven: true }, source: { sha256: 'a'.repeat(64) } } }] };
  const result = inspectReport('dom-growth', r);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.observations[0].renderedRows, 550);
  assert.equal(result.observations[0].effectiveRows, 2000);
  assert.equal(result.observations[0].resetProven, true);
  assert.equal(result.standardAcceptance, false);
  r.status = 'measured';
  assert.equal(inspectReport('dom-growth', r).status, 'incomplete');
});

test('sensor EACCES and truncated discovery are incomplete domain evidence, never app energy', () => {
  const result = inspectReport('sensors', { schema: 1, lane: 'sensor-only-diagnostic', status: 'incomplete', appAttributable: false,
    discovery: { status: 'incomplete', truncated: true, errors: [{ reason: 'EACCES' }] }, samples: [] });
  assert.equal(result.status, 'incomplete');
  assert.match(result.reasons.join(' '), /EACCES|truncat/);
  assert.equal(result.standardAcceptance, false);
});

test('nested sensor reasons are bounded and deduplicated independently of discovery', () => {
  const r = { schema: 1, lane: 'sensor-only-diagnostic', appAttributable: false, status: 'incomplete',
    discovery: { status: 'incomplete', errors: [], truncated: true }, samples: [{ readings: [
      { reason: 'Permission unavailable: EACCES' }, { reason: 'Permission unavailable: EACCES' },
      ...Array.from({ length: 80 }, (_, i) => ({ reason: `${i}:${'x'.repeat(800)}` })),
    ] }] };
  const result = inspectReport('sensors', r);
  assert.equal(result.status, 'incomplete');
  assert.ok(result.reasons.length <= 32);
  assert.ok(result.reasons.includes('Sensor discovery truncated'));
  assert.ok(result.reasons.every(reason => reason.length <= 512));
  assert.equal(result.reasons.filter(reason => reason.includes('EACCES')).length, 1);
});

test('explicit report import is byte bounded, confined, regular-file only and hashes actual bytes', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'coverage-')));
  try {
    mkdirSync(join(dir, 'reports')); const file = join(dir, 'reports/a.json');
    writeFileSync(file, '{"schemaVersion":1}');
    const read = readCoverageReport(file, { root: dir });
    assert.equal(read.status, 'available'); assert.match(read.sha256, /^[a-f0-9]{64}$/);
    assert.equal(read.bytes, Buffer.byteLength('{"schemaVersion":1}'));
    const old = read.sha256; writeFileSync(file, '{"schemaVersion":2}');
    assert.notEqual(readCoverageReport(file, { root: dir }).sha256, old);
    assert.equal(readCoverageReport(join(dir, 'missing.json'), { root: dir }).status, 'unavailable');
    writeFileSync(file, 'x'.repeat(4097));
    assert.equal(readCoverageReport(file, { root: dir, maxBytes: 4096 }).status, 'unavailable');
    const confinedRoot = join(dir, 'confined'); mkdirSync(confinedRoot);
    const outside = join(dir, 'outside.json'); writeFileSync(outside, '{"private":"must not read"}');
    const rejected = readCoverageReport(outside, { root: confinedRoot });
    assert.equal(rejected.status, 'unavailable');
    assert.match(rejected.reason, /inside this workspace/);
    assert.equal(rejected.sha256, undefined, 'outside file must be refused before reading/hashing');
    if (process.platform !== 'win32') {
      symlinkSync(join(dir, 'reports'), join(dir, 'alias'));
      assert.equal(readCoverageReport(join(dir, 'alias/a.json'), { root: dir }).status, 'unavailable');
      symlinkSync(file, join(dir, 'link.json'));
      assert.equal(readCoverageReport(join(dir, 'link.json'), { root: dir }).status, 'unavailable');
    }
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); }
});

test('documented existing profile options parse without executing runtime or sensor preflight', () => {
  for (const phase of PHASES) assert.ok(parseArgs(['--only', phase, '--checkout', join(root, 'youcoded'), '--label', 'inventory', '--check']).only.has(phase));
  assert.deepEqual(parseArgs(['--only', 'artifacts', '--document-cases', 'csv-rows-64kib', '--check']).documentCaseIds, ['csv-rows-64kib']);
  assert.equal(lifecycleOptions(['--checkout', join(root, 'youcoded'), '--resource-checkpoints', '--cycles', '3', '--out', join(root, 'scratch/report.json')]).resourceCheckpoints, true);
  const settle = lifecycleOptions(['--checkout', join(root, 'youcoded'), '--app-dir', join(root, 'youcoded/desktop/release/linux-unpacked'),
    '--model-free', '--supervised', '--settle-checkpoints', '--settle-domain', 'renderer', '--cycles', '3',
    '--max-minutes', '5', '--max-rss-mb', '2048', '--cleanup-reserve-ms', '20000', '--out', join(root, 'scratch/fresh.json')]);
  assert.equal(settle.settleDomain, 'renderer');
  assert.equal(settle.supervised, true);
  assert.equal(realismOptions(['--preset', 'real-use', '--checkout', join(root, 'youcoded')]).preset, 'real-use');
  assert.equal(parseSensorArgs(['--out', join(root, 'scratch/sensor-runs/inventory/report.json'), '--seconds', '5', '--interval-ms', '2000']).command, 'sensors');
  assert.equal(parseDomOptions(['--growth', '--only', 'projects/conversations', '--rows', '2000'], 8000).growth, true);
});

test('malformed evidence is incomplete rather than throwing or promoting a status string', () => {
  assert.equal(inspectReport('documents', { runs: [{}], requiredCaseIds: 'bad' }).status, 'stale-revision');
  const nested = {}; let at = nested; for (let i = 0; i < 80; i++) at = (at.child = {});
  assert.equal(inspectReport('startup', nested).status, 'incomplete');
  assert.equal(inspectReport('images', { status: 'measured' }).status, 'incomplete');
});

test('explicit imported references distinguish available bytes from valid measured evidence', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'coverage-import-')));
  try {
    writeFileSync(join(dir, 'old.json'), JSON.stringify({ schemaVersion: 1, legacyExecution: { revision: 0 } }));
    const c = buildCoverage({ root: dir, reports: [{ lane: 'startup', path: 'old.json' }, { lane: 'sensors', path: 'missing.json' }] });
    const startup = c.lanes.find(l => l.id === 'startup').evidence[0];
    assert.equal(startup.reference.status, 'available');
    assert.equal(startup.assessment.status, 'stale-revision');
    assert.match(startup.reference.sha256, /^[a-f0-9]{64}$/);
    assert.equal(c.lanes.find(l => l.id === 'sensors').evidence[0].assessment.status, 'unavailable');
    assert.equal(c.standardAcceptance, false);
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); }
});

test('CLI only imports explicit bounded lane=path selections and never executes a lane', () => {
  assert.deepEqual(parseCoverageArgs([]), { format: 'json', reports: [] });
  assert.deepEqual(parseCoverageArgs(['--format', 'markdown', '--report', 'startup=perf-reports/example.json']).reports, [{ lane: 'startup', path: 'perf-reports/example.json' }]);
  for (const args of [['--run'], ['--report', 'unknown=x'], ['--format', 'html'], ['--report', 'startup='], Array(100).fill('--report')]) assert.throws(() => parseCoverageArgs(args));
});
