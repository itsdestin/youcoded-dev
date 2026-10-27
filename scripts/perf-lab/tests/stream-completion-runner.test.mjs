import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXIT, parseArgs, configureStreamCompletion, streamCompletionProblems, validateReport, renderMarkdown, emptyReport, createNativeStreamFixture, prepareRunnerBuild, buildFreshness } from '../run.mjs';
import { buildLegacyExecution } from '../legacy-evidence.mjs';
import { STREAM_DRAIN_DESCRIPTOR, buildDrainFixture } from '../stream-drain.mjs';
import { inspectReport } from '../coverage.mjs';
import { assessComparability } from '../comparability.mjs';

function runRow() {
  const legs = Object.fromEntries(['visible', 'switching', 'hidden'].map((leg, index) => {
    const fixture = buildDrainFixture(leg, 3000);
    const receipt = { revision: 1, sessionId: 'owned', complete: true, text: fixture.text, textChars: fixture.text.length, textEvents: 3000,
      terminalCount: 1, firstAt: 10, terminalAt: 30, error: null, clock: 'renderer-performance-now' };
    const producer = { index, stream: true, plannedDeltas: 3000, deltasSent: 3000, chars: fixture.text.length, plannedText: fixture.text,
      contentWrites: 3000, writtenTextChars: fixture.text.length, aborted: false, completed: true, finishWritten: true, doneWritten: true,
      endRequested: true, endRequestedAt: 2, writeError: null, prematureClose: false, backpressureWaits: 0, startedAt: 1, endedAt: 2, writeCompletedAt: 2 };
    const view = { sessionId: 'owned', ownedCount: 1, activeCount: 1, activeSessionId: leg === 'hidden' ? 'other' : 'owned', hidden: leg === 'hidden', documentVisibility: 'visible' };
    return [leg, { status: 'measured', standardAcceptance: false, reasons: [], fixture, producer, receipt,
      bridgeDrain: { status: 'measured', receipt, error: null }, visibility: { start: view, end: view }, reducerQueue: { available: false } }];
  }));
  // Literal current scenario producer fields: native is full-list idx 4, huge
  // conversation idx 0; 8 alternating switches, not a synthetic summary count.
  const switches = [
    { i: 0, idx: 0, name: 'cc-0', intoStreaming: false, duringStream: true, ok: true, mode: 'pill', ms: 12, paintedMs: 20, settled: true, entries: 24, reason: null },
    { i: 1, idx: 4, name: 'native-0', intoStreaming: true, duringStream: true, ok: true, mode: 'pill', ms: 12, paintedMs: 20, settled: true, entries: 2, reason: null },
    { i: 2, idx: 0, name: 'cc-0', intoStreaming: false, duringStream: true, ok: true, mode: 'pill', ms: 12, paintedMs: 20, settled: true, entries: 24, reason: null },
    { i: 3, idx: 4, name: 'native-0', intoStreaming: true, duringStream: true, ok: true, mode: 'pill', ms: 12, paintedMs: 20, settled: true, entries: 2, reason: null },
    { i: 4, idx: 0, name: 'cc-0', intoStreaming: false, duringStream: true, ok: true, mode: 'pill', ms: 12, paintedMs: 20, settled: true, entries: 24, reason: null },
    { i: 5, idx: 4, name: 'native-0', intoStreaming: true, duringStream: true, ok: true, mode: 'pill', ms: 12, paintedMs: 20, settled: true, entries: 2, reason: null },
    { i: 6, idx: 0, name: 'cc-0', intoStreaming: false, duringStream: true, ok: true, mode: 'pill', ms: 12, paintedMs: 20, settled: true, entries: 24, reason: null },
    { i: 7, idx: 4, name: 'native-0', intoStreaming: true, duringStream: true, ok: true, mode: 'pill', ms: 12, paintedMs: 20, settled: true, entries: 2, reason: null },
  ];
  return { sessions: { names: ['cc-0', 'cc-1', 'cc-2', 'cc-3', 'native-0', 'native-1'], streaming: 'native-0', huge: 'cc-0' }, switching: { switches },
    deltas: { planned: 3000, perSecTarget: 150 }, completionDiagnostic: { descriptor: STREAM_DRAIN_DESCRIPTOR, status: 'measured', standardAcceptance: false, legs,
    hiddenPostReveal: { status: 'measured', visible: { exact: true, marker: true, documentVisibility: 'visible' }, error: null } } };
}
function report() {
  const cfg = parseArgs(['--only', 'native-stream', '--stream-completion-diagnostics', '--native-stream-repeats', '1']);
  const r = emptyReport(); r.legacyExecution = buildLegacyExecution(cfg); configureStreamCompletion(r, cfg);
  r.nativeStream = { runs: [runRow()], median: {} };
  r.aborted = null; r.incomplete = [];
  return r;
}

test('diagnostic fixture actual builder invocation is model-free but supplies all three journey transcripts; standard unchanged', () => {
  const calls = [];
  const buildFixture = (root, opts) => { calls.push({ root, opts }); return { marker: 'fixture' }; };
  const diagnostic = parseArgs(['--only', 'native-stream', '--stream-completion-diagnostics']);
  assert.equal(createNativeStreamFixture('/private/scratch', diagnostic, { buildFixture }).marker, 'fixture');
  assert.deepEqual(calls[0], { root: '/private/scratch', opts: { fakeProvider: true, seedEngine: false,
    historySizes: { small: 4, medium: 8, huge: 12 }, decoyCount: 0 } });
  createNativeStreamFixture('/private/scratch', parseArgs(['--only', 'native-stream']), { buildFixture });
  assert.deepEqual(calls[1], { root: '/private/scratch', opts: { fakeProvider: true } });
});

test('model-free diagnostic fixture succeeds without any engine assets or provisioning', () => {
  const root = mkdtempSync(join(tmpdir(), 'stream-model-free-')), logs = [];
  try {
    const f = createNativeStreamFixture(root, parseArgs(['--only', 'native-stream', '--stream-completion-diagnostics']), { log: message => logs.push(message) });
    assert.equal(f.seedEngine, false);
    assert.deepEqual(f.historySizes, { small: 4, medium: 8, huge: 12 });
    for (const size of ['small', 'medium', 'huge']) { assert.ok(f.transcripts[size].cwd); assert.ok(f.transcripts[size].path); }
    assert.ok(!logs.some(line => /provision|download/i.test(line)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('actual runner build invocation passes cachedOnly and force conflict rejects in CLI', async () => {
  const cfg = parseArgs(['--only', 'native-stream', '--stream-completion-diagnostics', '--cached-only']);
  assert.equal(cfg.cachedOnly, true);
  let args;
  await prepareRunnerBuild(cfg, { buildApp: async (...values) => { args = values; return { reused: true }; } });
  assert.deepEqual(args, [cfg.checkout, { skipIfFresh: true, cachedOnly: true }]);
  assert.throws(() => parseArgs(['--cached-only', '--force-build']), /conflict|force-build/);
  assert.equal(parseArgs([]).cachedOnly, false);
});

test('cached-only check uses the same no-fallback execution API, not optimistic existsSync freshness', async () => {
  const calls = [], build = async (checkout, options) => {
    calls.push({ checkout, options }); throw Error('cached-only refused stale stamp');
  };
  const result = await buildFreshness('/private/checkout', { cachedOnly: true, build });
  assert.deepEqual(calls, [{ checkout: '/private/checkout', options: { cachedOnly: true, skipIfFresh: true } }]);
  assert.equal(result.fresh, false); assert.match(result.error, /refused stale/);
});

test('cached-only --check refuses missing cache with nonzero exit and never promises a fallback build', () => {
  const root = mkdtempSync(join(tmpdir(), 'stream-cache-check-'));
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../run.mjs', import.meta.url)), '--checkout', root,
      '--only', 'native-stream', '--stream-completion-diagnostics', '--cached-only', '--check'], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, EXIT.ERROR, result.stderr);
    assert.match(result.stdout, /cached-only REFUSED: no build fallback/);
    assert.match(result.stdout, /local engine assets not required or provisioned/);
    assert.ok(!/will rebuild|will be built/.test(result.stdout));
    assert.match(result.stdout, /nothing was launched/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('runner execution routes through tested fixture/build helpers rather than manifest-only options', () => {
  const source = readFileSync(new URL('../run.mjs', import.meta.url), 'utf8');
  assert.match(source, /const build = await prepareRunnerBuild\(cfg\)/);
  assert.match(source, /const fixture = createNativeStreamFixture\(SCRATCH, cfg, \{ log \}\)/);
  assert.match(source, /runNativeStreamScenario\(app, fixture, report\.legacyExecution\.phases\['native-stream'\]\.options\)/);
});

test('exact executed switching rows are mandatory independently of planned 8 switches', () => {
  for (const mutate of [
    r => { delete r.nativeStream.runs[0].switching; },
    r => { r.nativeStream.runs[0].switching.switches.pop(); },
    r => { delete r.nativeStream.runs[0].switching.switches[2]; },
    r => { r.nativeStream.runs[0].switching.switches[2].i = 1; },
    r => { r.nativeStream.runs[0].switching.switches[2].duringStream = false; },
    r => { r.nativeStream.runs[0].switching.switches[2].ok = false; },
    r => { r.nativeStream.runs[0].switching.switches[2].idx = 4; },
    r => { r.nativeStream.runs[0].switching.switches[2].name = 'native-0'; },
    r => { r.nativeStream.runs[0].switching.switches[2].intoStreaming = true; },
    r => { r.nativeStream.runs[0].switching.switches[2].paintedMs = NaN; },
    r => { r.nativeStream.runs[0].switching.switches[2].ms = Infinity; },
    r => { r.nativeStream.runs[0].switching.switches[2].mode = 'none'; },
    r => { r.nativeStream.runs[0].switching.switches[2].settled = false; },
    r => { r.nativeStream.runs[0].switching.switches[2].settled = null; },
    r => { r.nativeStream.runs[0].switching.switches[2].entries = null; },
    r => { r.nativeStream.runs[0].switching.switches[2].reason = 'timed out'; },
  ]) {
    const r = report(); mutate(r);
    assert.ok(streamCompletionProblems(r).some(p => /switch/.test(p)));
    assert.ok(validateReport(r, new Set(['native-stream'])).length);
    assert.equal(inspectReport('stream-completion', r).status, 'incomplete');
  }
});

test('source-only selection is explicit and excludes live/browser/network test families', () => {
  const manifest = JSON.parse(readFileSync(new URL('./offline-unit-manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.revision, 2);
  // WHY: local fake HTTP is authorized separately, never smuggled into offline units.
  assert.deepEqual(manifest.offlineLocalFiles, ['fake-provider.test.mjs']);
  assert.deepEqual(manifest.readOnlyGitFiles, ['selected-checkout.test.mjs']);
  assert.equal(new Set(manifest.files).size, manifest.files.length);
  for (const file of manifest.files) assert.ok(existsSync(new URL(file, import.meta.url)), file);
  for (const file of ['screenshots.test.mjs', 'mixed-provider.test.mjs', 'presentation-capture.test.mjs', 'stall-core.test.mjs', 'build.test.mjs', 'ipc-close-reproducer.integration.mjs', 'supervised-gate-synthetic.integration.mjs', 'supervisor-ipc-synthetic.integration.mjs']) {
    assert.ok(!manifest.files.includes(file)); assert.ok(manifest.excludedEffectfulExamples[file]);
  }
  assert.ok(!manifest.files.includes('fake-provider.test.mjs'));
  for (const file of [...manifest.files, ...manifest.readOnlyGitFiles, ...manifest.offlineLocalFiles]) {
    assert.ok(manifest.notes[file], `missing per-test audit: ${file}`);
  }
  for (const file of [...manifest.uiFiles, ...manifest.pythonFiles]) {
    assert.ok(existsSync(new URL(`../../../${file}`, import.meta.url)), file);
    assert.ok(manifest.notes[file] ?? manifest.notes[file.split('/').at(-1)], file);
  }
});

test('existing run CLI explicitly selects diagnostic-only native stream; defaults unchanged', () => {
  assert.equal(parseArgs([]).streamCompletionDiagnostics, false);
  const cfg = parseArgs(['--only', 'native-stream', '--stream-completion-diagnostics', '--check']);
  assert.equal(cfg.streamCompletionDiagnostics, true); assert.equal(cfg.dryRun, true);
  for (const args of [['--stream-completion-diagnostics'], ['--only', 'startup', '--stream-completion-diagnostics'], ['--only', 'native-stream,history', '--stream-completion-diagnostics']]) assert.throws(() => parseArgs(args), /only native-stream/);
});

test('actual execution/provenance profile distinguishes plain diagnostic timings and cannot compare as standard', () => {
  const r = report();
  assert.equal(r.standardAcceptance, false);
  assert.equal(r.legacyExecution.phases['native-stream'].options.completionDiagnostics, true);
  assert.equal(r.measures.nativeStream.profile, 'plain-completion-diagnostic');
  assert.deepEqual(streamCompletionProblems(r), []);
  assert.deepEqual(validateReport(r, new Set(['native-stream'])), []);
  assert.equal(inspectReport('stream-completion', r).status, 'unreviewed');
  assert.notEqual(inspectReport('native-stream', r).status, 'measured');
  const comparison = assessComparability(r, r);
  assert.equal(comparison.comparable, false);
  assert.match(comparison.reasons.join(' '), /required group\/step\/options contract differs/, 'explicit manifest mismatch blocks even if unrelated provenance is later complete');
  assert.match(renderMarkdown(r, 'unit'), /not.*standard|diagnostic-only/i);
});

test('completion imports revalidate producer/receipt/exact reveal and cleanup, never status alone', () => {
  for (const mutate of [
    r => { r.nativeStream.runs[0].completionDiagnostic.legs.hidden.producer.completed = false; },
    r => { r.nativeStream.runs[0].completionDiagnostic.legs.hidden.receipt.text = 'corrupt'; },
    r => { r.nativeStream.runs[0].completionDiagnostic.legs.hidden.bridgeDrain.error = 'cleanup failed'; },
    r => { r.nativeStream.runs[0].completionDiagnostic.hiddenPostReveal.visible.exact = false; },
    r => { r.nativeStream.runs[0].completionDiagnostic.legs.hidden.visibility.end.hidden = false; },
    r => { r.nativeStream.runs[0].completionDiagnostic.descriptor = { revision: 1 }; },
    r => { r.nativeStream.runs.pop(); },
    r => { r.aborted = 'failed cleanup'; },
    r => { r.nativeStream.runs[0].receiptCleanupError = 'listener left behind'; },
    r => { delete r.diagnosticExecution.instrumentHashes['fake-provider.mjs']; },
    r => { r.legacyExecution.phases['native-stream'].options.deltas = 200; },
    r => { r.legacyExecution.phases['native-stream'].expectedRepeats = 3; },
  ]) {
    const r = report(); mutate(r);
    assert.ok(streamCompletionProblems(r).length);
    assert.equal(inspectReport('stream-completion', r).status, 'incomplete');
  }
});
