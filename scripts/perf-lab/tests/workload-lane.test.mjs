// Offline: lane F orchestration with fake deps (no app, no fixtures on disk), the rung classifier, support probe, report contract and
// the compare paths. Runtime thresholds are policy inputs here, not wall-clock assertions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transientInstrumentDefect, WORKLOAD_LANE, WORKLOAD_THRESHOLDS, ORIGINAL_JPEG, INSTRUMENT_REASONS, classifyRow, ladderGroups, plannedRungIds, probeCandidateSupport,
  runWorkloadsLane, summariseRow, workloadPaths, workloadsMarkdown, workloadsProblems, WORKLOAD_MEASURES } from '../workload-lane.mjs';
import { compareAll, get, runsFor } from '../compare.mjs';
import { WORKLOAD_PATHS } from '../compare.mjs';

const good = (id, over = {}) => ({ id, status: 'measured', operationMs: 120, renderer: { maxDelayMs: 40, totalStallMs: 10 }, main: { maxDelayMs: 20 }, input: { latencyMs: 30, budgetStatus: 'passed' }, memory: { peakRssMb: 500 }, fixture: { bytes: 10, sha256: 'a'.repeat(64) }, ...over });

test('the ladder covers every family the task names, including 4096x3072 PNG and JPEG and the original JPEG', () => {
  const ids = plannedRungIds();
  for (const id of ['csv-rows-64kib', 'csv-rows-3072kib', 'csv-fullread-5120kib', 'xlsx-merge-400x500', 'xlsx-sheets-32', 'docx-paragraphs-5000', 'docx-table-1000x10', 'html-assets-8x512', 'html-script-250ms',
    'path-list-20000', 'large-diff-20000', 'background-index-large-history', 'image-png-4096x3072', 'image-jpeg-4096x3072', 'image-png-1024x768', ORIGINAL_JPEG.id]) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  const original = ladderGroups().flatMap((g) => g.rungs).find((r) => r.id === ORIGINAL_JPEG.id);
  assert.equal(original.source, 'original'); assert.equal(original.original.sha256, ORIGINAL_JPEG.sha256);
  // every image group carries a <=1024x768 control (the image harness refuses to run without one) and stays within its 4-image cap
  for (const g of ladderGroups().filter((x) => x.mode === 'images')) { assert.ok(g.rungs.length <= 4); assert.ok(g.rungs.some((r) => r.spec ? r.spec.width <= 1024 && r.spec.height <= 768 : false)); }
});

test('compare paths: three metrics per rung, resolvable through get/runsFor, and exposed from compare.mjs', () => {
  const paths = workloadPaths(); assert.equal(paths.length, plannedRungIds().length * 3); assert.deepEqual(WORKLOAD_PATHS, paths);
  const report = { workloads: { runs: [1, 2, 3].map((n) => ({ rungs: { 'csv-rows-64kib': { operationMs: 100 * n, rendererMaxDelayMs: n, mainMaxDelayMs: 0 } } })), median: { rungs: { 'csv-rows-64kib': { operationMs: 200, rendererMaxDelayMs: 2, mainMaxDelayMs: 0 } } } } };
  assert.equal(get(report, 'workloads.median.rungs.csv-rows-64kib.operationMs'), 200);
  assert.deepEqual(runsFor(report, 'workloads.median.rungs.csv-rows-64kib.operationMs').sort(), [100, 200, 300]);
  // a rung with no number (failed/unsupported) reads absent, never zero
  const a = { workloads: report.workloads }, b = { workloads: { runs: [], median: { rungs: {} } } };
  const row = compareAll(a, b, { paths: ['workloads.median.rungs.csv-rows-64kib.operationMs'] }).rows[0];
  assert.equal(row.b, null); assert.match(row.note, /absent in B/);
});

test('classifyRow: measured, slow with named breaches, and every failure shape keeps its own reason', () => {
  assert.equal(classifyRow(good('x')).status, 'measured');
  const slow = classifyRow(good('x', { operationMs: 1500, renderer: { maxDelayMs: 400 }, main: { maxDelayMs: 300 } }));
  assert.equal(slow.status, 'slow'); assert.equal(slow.reasons.length, 3); assert.match(slow.reasons[0], /time to render 1500 ms > 1000 ms/);
  assert.equal(classifyRow(good('x', { operationMs: 1000 })).status, 'measured', 'exactly at the threshold is not slow');
  assert.equal(classifyRow({ id: 'x', status: 'timeout', error: 'External case deadline 15000 ms' }).reason, 'failed:timeout');
  assert.equal(classifyRow({ id: 'x', status: 'memory-limit', error: 'Owned app family RSS exceeds 1536 MiB' }).reason, 'failed:memory-limit');
  assert.equal(classifyRow({ id: 'x', status: 'failed', error: 'Readiness not proved within 10000 ms' }).reason, 'failed:viewer');
  assert.equal(classifyRow({ id: 'x', status: 'failed', error: 'Missing/invalid viewer proof, finite metrics' }).reason, 'failed:evidence-incomplete');
  assert.equal(classifyRow({ id: 'x', status: 'failed', error: 'Workload did not exercise indexing: 0 conversations' }).reason, 'failed:evidence-incomplete');
  assert.equal(classifyRow({ id: 'x', status: 'unreviewed', error: 'Owned app stopped by previous case' }).status, 'not-run');
  assert.equal(classifyRow(good('x', { operationMs: undefined })).reason, 'failed:evidence-incomplete');
  assert.equal(classifyRow(null).reason, 'failed:not-run');
  assert.ok(INSTRUMENT_REASONS.includes('failed:evidence-incomplete') && !INSTRUMENT_REASONS.includes('failed:timeout') && !INSTRUMENT_REASONS.includes('failed:memory-bound'));
});

test('image rows: time-to-render is the open+decode step, long tasks are the worst step, a failed step fails the rung', () => {
  const steps = [good('i/open-decode', { operationMs: 700 }), good('i/zoom-in', { operationMs: 50, renderer: { maxDelayMs: 300 } }), good('i/pan')];
  const row = { id: 'i', status: 'measured', imageDiagnostic: true, imageSteps: steps };
  assert.equal(summariseRow(row).operationMs, 700); assert.equal(summariseRow(row).rendererMaxDelayMs, 300);
  assert.equal(classifyRow(row).status, 'slow');
  const failed = { ...row, status: 'failed', imageSteps: [steps[0], { ...steps[1], status: 'timeout', error: 'deadline' }] };
  assert.equal(classifyRow(failed).reason, 'failed:timeout');
});

test('probeCandidateSupport reports evidence per feature and never claims support for a missing file or pattern', () => {
  const files = { '/c/desktop/src/renderer/components/artifact-views/PartialFileBanner.tsx': 'x Load the whole file y', '/c/desktop/src/renderer/components/artifact-views/ActiveArtifactView.tsx': '{ full: true }' };
  const out = probeCandidateSupport('/c', { exists: (p) => p in files, read: (p) => files[p] });
  assert.equal(out.csvFullRead.supported, true);
  assert.equal(out.largeDiff.supported, false); assert.match(out.largeDiff.evidence.join(' '), /UnifiedDiff.tsx: file not present/);
  assert.equal(out.backgroundIndexing.supported, false);
  const partial = probeCandidateSupport('/c', { exists: () => true, read: () => 'nothing useful' });
  assert.equal(partial.pathList.supported, false); assert.match(partial.pathList.evidence[0], /does not contain "detectFilepaths"/);
});

// A fake world: groups become fixtures with cases; boots hand out a scripted app; runCases returns scripted rows.
function world({ script = {}, support = null, repeats = 1, groups = ladderGroups().filter((g) => ['csv', 'csv-fullread', 'images-jpeg-original'].includes(g.id)) } = {}) {
  const calls = { boots: [], gens: [], windows: [] };
  const deps = {
    makeFixture: (g) => ({ home: `/h/${g.id}` }), rootFor: (f, g) => `${f.home}/${g.id}`,
    generate: async (g, r) => { calls.gens.push(r.id); return script.gen?.[r.id] ?? { status: 'ok', cases: [{ id: r.id, bytes: 5, sha256: 'b'.repeat(64), shape: {} }] }; },
    buildManifest: (g, root, cases) => ({ root, cases }),
    boot: async (fixture, fn, g) => { calls.boots.push(g.id); let n = 0; return fn({ interference: { mark: () => n++, verdictSince: (m, label) => ({ label, verdict: script.verdict?.[g.id] ?? 'clean', reasons: [], offenders: [] }) } }); },
    runCases: async ({ group, caseIds }) => (script.run?.[group.id]?.(caseIds, calls.boots.filter((b) => b === group.id).length) ?? { cases: caseIds.map((id) => good(id)), fatal: false, descriptor: {} }),
    recordInterference: (v) => calls.windows.push(v),
  };
  return { calls, run: () => runWorkloadsLane({ groups, support: support ?? Object.fromEntries(Object.keys(probeCandidateSupport('/nope', { exists: () => true, read: () => 'detectFilepaths UnifiedDiff diffRowsFromStrings bg:chatsearch-refresh requestChatsearchRefresh chatsearchDir Load the whole file full: true data-file-path' }))
    .map((k) => [k, { supported: true, evidence: [] }])), repeats, memoryBound: { bound: 'systemd-run-user-scope' }, deps }) };
}

test('lane run: every rung gets exactly one row per repeat, group windows are recorded, medians use measured+slow rows only', async () => {
  const w = world({ repeats: 2, script: { run: { csv: (ids) => ({ cases: ids.map((id, i) => (i === 0 ? good(id, { operationMs: 1500 }) : good(id))), fatal: false, descriptor: {} }) } } });
  const section = await w.run();
  assert.equal(section.runs.length, 2);
  const csvIds = ladderGroups().find((g) => g.id === 'csv').rungs.map((r) => r.id);
  for (const run of section.runs) for (const id of csvIds) assert.ok(run.rungs[id], id);
  assert.equal(section.runs[0].rungs[csvIds[0]].status, 'slow');
  assert.equal(section.median.rungs[csvIds[0]].operationMs, 1500); assert.equal(section.median.rungs[csvIds[0]].samples, 2);
  assert.equal(w.calls.windows.length, 6, '3 groups x 2 repeats, one verdict each'); assert.ok(w.calls.windows.every((v) => v.verdict === 'clean'));
  assert.equal(section.runs[0].rungs[csvIds[1]].interference, 'clean');
});

test('image controls repeat across boots but each id keeps one ladder row; extras are kept as controlRepeats', async () => {
  const groups = ladderGroups().filter((g) => g.id === 'images-jpeg-2048x1536' || g.id === 'images-jpeg-4096x3072');
  const w = world({ groups });
  const section = await w.run();
  const run = section.runs[0];
  assert.equal(Object.keys(run.rungs).filter((id) => id === 'image-jpeg-1024x768').length, 1);
  assert.equal(run.controlRepeats['image-jpeg-1024x768'].length, 1);
  assert.deepEqual(workloadsProblems({ workloads: section }), []);
});

test('unsupported-by-candidate: no boot, evidence recorded, no numbers, report still complete', async () => {
  const support = { documents: { supported: true, evidence: [] }, csvFullRead: { supported: false, evidence: ['PartialFileBanner.tsx: file not present'] } };
  const w = world({ support, groups: ladderGroups().filter((g) => g.id === 'csv-fullread') });
  const section = await w.run();
  const row = section.runs[0].rungs['csv-fullread-5120kib'];
  assert.equal(row.status, 'unsupported-by-candidate'); assert.match(row.detail, /PartialFileBanner/); assert.equal(row.operationMs, undefined);
  assert.deepEqual(w.calls.boots, []); assert.deepEqual(section.median.rungs, {});
  assert.deepEqual(workloadsProblems({ workloads: section }), []);
});

test('a generation child killed by the memory bound is a recorded failed:memory-bound row and the rest of the group still runs', async () => {
  const csv = ladderGroups().find((g) => g.id === 'csv'), victim = csv.rungs[3].id;
  const w = world({ groups: [csv], script: { gen: { [victim]: { status: 'failed:memory-bound', detail: 'SIGKILL' } } } });
  const section = await w.run();
  const row = section.runs[0].rungs[victim];
  assert.equal(row.status, 'failed'); assert.equal(row.reason, 'failed:memory-bound');
  assert.equal(section.runs[0].rungs[csv.rungs[0].id].status, 'measured');
  assert.deepEqual(workloadsProblems({ workloads: section }), [], 'a bound kill is a finding, not an instrument problem');
});

test('a fatal rung kills the app: it is recorded, the unreached rungs run in a fresh boot, nothing goes missing', async () => {
  const csv = ladderGroups().find((g) => g.id === 'csv'), ids = csv.rungs.map((r) => r.id);
  const w = world({ groups: [csv], script: { run: { csv: (caseIds, boots) => {
    if (boots === 1) return { fatal: true, descriptor: {}, cases: [good(ids[0]), { id: ids[1], status: 'timeout', error: 'External case deadline 15000 ms' }, ...ids.slice(2).filter((id) => caseIds.includes(id)).map((id) => ({ id, status: 'unreviewed', error: 'Owned app stopped by previous case' }))] };
    return { fatal: false, descriptor: {}, cases: caseIds.map((id) => good(id)) };
  } } } });
  const section = await w.run();
  const run = section.runs[0];
  assert.equal(w.calls.boots.length, 2);
  assert.equal(run.rungs[ids[1]].reason, 'failed:timeout');
  for (const id of ids.slice(2)) assert.equal(run.rungs[id].status, 'measured', id);
  assert.equal(run.groups[0].attempts, 2);
  assert.deepEqual(workloadsProblems({ workloads: section }), [], 'a timeout is a finding');
});

test('unreached rungs after a NON-fatal failure (e.g. invalid calibration) are final instrument failures and make the report incomplete', async () => {
  const csv = ladderGroups().find((g) => g.id === 'csv');
  const w = world({ groups: [csv], script: { run: { csv: (ids) => ({ fatal: false, descriptor: { error: 'Error: Calibration controls invalid; workload measurements refused' }, cases: ids.map((id) => ({ id, status: 'unreviewed', error: 'Calibration controls invalid' })) }) } } });
  const section = await w.run();
  assert.equal(w.calls.boots.length, 1);
  assert.equal(section.runs[0].rungs[csv.rungs[0].id].reason, 'failed:instrument');
  assert.ok(workloadsProblems({ workloads: section }).some((p) => /failed:instrument/.test(p)));
});

test('a boot that cannot start fails its rungs as instrument failures; other groups are unaffected', async () => {
  const groups = ladderGroups().filter((g) => ['csv', 'xlsx'].includes(g.id));
  let first = true;
  const deps = { makeFixture: (g) => ({ home: `/h/${g.id}` }), rootFor: (f, g) => `${f.home}/${g.id}`, generate: async (g, r) => ({ status: 'ok', cases: [{ id: r.id, bytes: 1, sha256: 'c'.repeat(64), shape: {} }] }), buildManifest: (g, r, c) => ({ cases: c }),
    boot: async (f, fn, g) => { if (first) { first = false; throw new Error('app did not start'); } return fn({ interference: { mark: () => 0, verdictSince: (m, label) => ({ label, verdict: 'clean', reasons: [] }) } }); },
    runCases: async ({ caseIds }) => ({ cases: caseIds.map((id) => good(id)), fatal: false, descriptor: {} }), recordInterference: () => {} };
  const section = await runWorkloadsLane({ groups, support: {}, repeats: 1, memoryBound: { bound: 'x' }, deps });
  assert.equal(section.runs[0].rungs[groups[0].rungs[0].id].reason, 'failed:instrument');
  assert.equal(section.runs[0].rungs[groups[1].rungs[0].id].status, 'measured');
});

test('interference: a disturbed group window is recorded for the report and stamped on its rows (the report-level mapping makes it INCOMPLETE)', async () => {
  const csv = ladderGroups().find((g) => g.id === 'csv');
  const w = world({ groups: [csv], script: { verdict: { csv: 'disturbed' } } });
  const section = await w.run();
  assert.equal(w.calls.windows[0].verdict, 'disturbed');
  assert.equal(section.runs[0].rungs[csv.rungs[0].id].interference, 'disturbed');
  assert.equal(section.runs[0].groups[0].interference[0].verdict, 'disturbed');
});

test('workloadsProblems: missing rows, missing bound record, wrong repeat count and failed-without-reason are all reported', () => {
  const ids = ['a', 'b'];
  const base = { revision: WORKLOAD_LANE.revision, expectedRepeats: 1, memoryBound: { bound: 'x' }, support: {}, plan: { rungIds: ids }, runs: [{ rungs: { a: { status: 'measured', operationMs: 1 }, b: { status: 'failed' } } }] };
  assert.deepEqual(workloadsProblems({ workloads: base }).length, 1);
  assert.match(workloadsProblems({ workloads: base })[0], /b failed without a recorded reason/);
  assert.ok(workloadsProblems({ workloads: { ...base, memoryBound: null } }).some((p) => /memory bound/.test(p)));
  assert.ok(workloadsProblems({ workloads: { ...base, expectedRepeats: 2 } }).some((p) => /repeat count/.test(p)));
  assert.ok(workloadsProblems({ workloads: { ...base, runs: [{ rungs: {} }] } }).some((p) => /a has no row/.test(p)));
  assert.ok(workloadsProblems({ workloads: { ...base, runs: [{ rungs: { a: { status: 'measured' }, b: { status: 'unsupported-by-candidate' } } }] } }).some((p) => /without a time-to-render/.test(p)));
  assert.deepEqual(workloadsProblems({}), ['workloads: required section missing']);
});

test('descriptor has the shape comparability requires; markdown names bound, thresholds and unsupported features', async () => {
  const m = WORKLOAD_MEASURES;
  assert.ok(m.scenario && m.question && m.configuration.every((c) => typeof c === 'string') && Object.values(m.clocks).every((c) => typeof c === 'string') && m.blindTo.every((c) => typeof c === 'string'));
  const w = world({ support: { documents: { supported: true, evidence: [] }, csvFullRead: { supported: false, evidence: ['PartialFileBanner.tsx: file not present'] } }, groups: ladderGroups().filter((g) => ['csv', 'csv-fullread'].includes(g.id)) });
  const section = await w.run(); section.memoryBound = { bound: 'systemd-run-user-scope', note: 'user cgroup' };
  const md = workloadsMarkdown(section).join('\n');
  assert.match(md, /systemd-run-user-scope/); assert.match(md, /operationMs 1000/); assert.match(md, /Unsupported by candidate, csvFullRead/); assert.match(md, /csv-fullread-5120kib \| csv-fullread \| failed \(failed:instrument\)|unsupported-by-candidate/);
  assert.equal(WORKLOAD_THRESHOLDS.operationMs, 1000);
});

// ── lane F test-drive fixes ──────────────────────────────────────────────────────────────────────────────────────────────────

test('a failed control generation fails the whole image group with the TRUE reason, not a viewer error from the harness', async () => {
  const groups = ladderGroups().filter((g) => g.id === 'images-jpeg-2048x1536');
  const w = world({ groups, script: { gen: { 'image-jpeg-1024x768': { status: 'failed:generation-exit', detail: 'failed:exit (SIGTERM): ' } } } });
  const section = await w.run();
  const big = section.runs[0].rungs['image-jpeg-2048x1536'];
  assert.equal(big.reason, 'failed:generation-exit'); assert.match(big.detail, /small control image-jpeg-1024x768 could not be generated/);
  assert.deepEqual(w.calls.boots, [], 'no app is booted for a group that cannot be measured');
});

test('a later real measurement of a control replaces an earlier failed generation of the same file, and keeps the failure beside it', async () => {
  const groups = ladderGroups().filter((g) => g.id === 'images-jpeg-2048x1536' || g.id === 'images-jpeg-4096x3072');
  let first = true;
  const w = world({ groups, script: { gen: new Proxy({}, { get: (_, id) => (id === 'image-jpeg-1024x768' && first ? (first = false, { status: 'failed:generation-exit', detail: 'SIGTERM' }) : undefined) }) } });
  const run = (await w.run()).runs[0];
  assert.equal(run.rungs['image-jpeg-1024x768'].status, 'measured');
  assert.equal(run.rungs['image-jpeg-1024x768'].earlierFailure.reason, 'failed:generation-exit');
});

test('a cap hit reports the real peak and the cap it was judged against, and stays a finding (not an instrument problem)', () => {
  const row = { id: 'x', status: 'memory-limit', error: 'Lab safety cap: owned app family PSS 1600 MiB exceeded the 1536 MiB cap', memory: { peakRssMb: 2400.04, peakPssMb: 1600.06, capMb: 1536 } };
  const out = classifyRow(row);
  assert.equal(out.reason, 'failed:memory-limit'); assert.match(out.detail, /peak seen 1600\.1 MiB PSS, cap 1536 MiB/);
  assert.equal(out.metrics.peakRssMb, 2400); assert.equal(out.metrics.peakPssMb, 1600.1);
  assert.ok(!INSTRUMENT_REASONS.includes(out.reason));
  assert.match(classifyRow({ id: 'x', status: 'memory-limit', error: 'Owned app family RSS exceeds 1536 MiB', memory: { peakRssMb: 1600 } }).detail, /summed RSS/);
});

test('a blocked-typing row is SLOW with an "at least" reason (a real freeze), never an instrument failure', () => {
  const row = good('x', { input: { latencyMs: null, budgetStatus: 'incomplete', blockedBacklog: { lowerBoundMs: 3523.1, skippedSlots: 53, maxOutstanding: 16 } } });
  const out = classifyRow(row);
  assert.equal(out.status, 'slow'); assert.match(out.reasons.join(' '), /typing blocked for at least 3523\.1 ms \(53 key slots skipped while 16 keys were already waiting\)/);
  assert.equal(out.metrics.inputLatencyMs, 3523.1);
});

// A row the harness rejected only because the controller itself was late (one skipped key slot / clock alignment wider than its limit).
const lateController = (id, reasons = ['Missing, skipped, overflowed or exhausted input train'], over = {}) => ({ ...good(id), status: 'failed', error: 'Missing/invalid viewer proof, finite metrics',
  renderer: { available: true, stopped: true, truncated: false, maxDelayMs: 10 }, main: { available: true, stopped: true, truncated: false, maxDelayMs: 1 }, memory: { complete: true, peakRssMb: 1 }, proof: { correctResult: true },
  input: { complete: false, reasons, skippedSlots: 1, maxInflight: 6, maxOutstanding: 16, failed: 0, receiptOverflow: 0, exhausted: false, ...over } });

test('transientInstrumentDefect: only a late controller qualifies; a saturated key queue (real freeze), failed sends or a missing probe do not', () => {
  assert.equal(transientInstrumentDefect(lateController('x')), true);
  assert.equal(transientInstrumentDefect(lateController('x', ['Clock alignment unavailable/uncertain'], { skippedSlots: 0 })), true);
  for (const bad of [lateController('x', undefined, { maxInflight: 16 }), lateController('x', undefined, { failed: 1 }), lateController('x', undefined, { receiptOverflow: 2 }), lateController('x', undefined, { exhausted: true }),
    lateController('x', ['Input does not cover action and readiness tail']), { ...lateController('x'), memory: { complete: false } }, { ...lateController('x'), main: { available: true, stopped: false, truncated: false } }, { ...lateController('x'), proof: { correctResult: false } }, good('x')]) assert.equal(transientInstrumentDefect(bad), false);
  const steps = { id: 'i', status: 'failed', imageSteps: [good('i/open-decode'), lateController('i/zoom-in', ['Clock alignment unavailable/uncertain'], { skippedSlots: 0 })] };
  assert.equal(transientInstrumentDefect(steps), true);
});

test('a rung lost to a late controller is measured again in a fresh boot and keeps the good result; if it never clears the last failure is recorded', async () => {
  const csv = ladderGroups().find((g) => g.id === 'csv'), victim = csv.rungs[1].id;
  const seen = [];
  const w = world({ groups: [csv], script: { run: { csv: (ids, boots) => { seen.push(ids.length); return { cases: ids.map((id) => (id === victim && boots === 1 ? lateController(id) : good(id))), fatal: false, descriptor: {} }; } } } });
  const section = await w.run();
  assert.equal(section.runs[0].rungs[victim].status, 'measured'); assert.equal(section.runs[0].rungs[victim].attempts, 2);
  assert.deepEqual(seen, [csv.rungs.length, 1], 'only the affected rung is run again');
  assert.deepEqual(workloadsProblems({ workloads: section }), []);
  const always = world({ groups: [csv], script: { run: { csv: (ids) => ({ cases: ids.map((id) => (id === victim ? lateController(id) : good(id))), fatal: false, descriptor: {} }) } } });
  const never = await always.run();
  assert.equal(never.runs[0].rungs[victim].reason, 'failed:evidence-incomplete'); assert.equal(never.runs[0].rungs[victim].attempts, WORKLOAD_LANE.maxAttemptsPerGroup);
});

test('an evidence-incomplete row shows the unvalidated numbers its probes did record and why the input proof failed', () => {
  const row = { ...lateController('x', ['Clock alignment unavailable/uncertain', 'Missing, skipped, overflowed or exhausted input train']), operationMs: 11000, renderer: { available: true, stopped: true, truncated: false, maxDelayMs: 10922 } };
  const out = classifyRow(row);
  assert.equal(out.reason, 'failed:evidence-incomplete');
  assert.match(out.detail, /input proof: Clock alignment unavailable\/uncertain; Missing, skipped/); assert.match(out.detail, /unvalidated, seen: renderer long task 10922 ms, main stall 1 ms, operation 11000 ms/);
});
