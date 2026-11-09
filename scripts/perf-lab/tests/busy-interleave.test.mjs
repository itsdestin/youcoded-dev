// Busy-machine interleaved comparison (owner decision Q-7): schedule order, the conservative verdict rule, failed-row handling,
// load summary, rendering, and the ab.mjs loop with run.mjs main() replaced by a fake. No app, build, display or process is launched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUSY_TITLE, buildBusySummary, busyVerdict, interleaveSchedule, noiseFromAaSummary, renderBusySummaryMarkdown, summariseLoad } from '../busy-interleave.mjs';
import { parseAbArgs, runAb, sequenceFor } from '../ab.mjs';
import { assessComparability } from '../comparability.mjs';
import { EXIT } from '../run.mjs';

const S = (v, extra = {}) => ({ values: { operationMs: v }, status: v === null ? 'failed' : 'measured', reason: v === null ? 'failed:timeout' : null, interference: 'disturbed', ...extra });
const many = (...vs) => vs.map((v) => S(v));

test('schedule alternates order every round (ABBA) and --aa uses two A slots', () => {
  assert.deepEqual(interleaveSchedule(4).map((s) => s.key).join(''), ['a', 'b', 'b', 'a', 'a', 'b', 'b', 'a'].join(''));
  assert.deepEqual(interleaveSchedule(2, { aa: true }).map((s) => s.key), ['a', 'a2', 'a2', 'a']);
  assert.equal(new Set(interleaveSchedule(5).map((s) => s.label)).size, 10, 'unique labels -> unique report stems');
  assert.throws(() => interleaveSchedule(0));
});

test('verdict: overlapping ranges -> no clear difference', () => {
  const v = busyVerdict(many(100, 120, 140), many(110, 130, 150), 'operationMs');
  assert.equal(v.verdict, 'no clear difference'); assert.match(v.note, /overlap/);
});

test('verdict: separated ranges beyond noise -> faster / slower, in the right direction', () => {
  assert.equal(busyVerdict(many(200, 210, 220), many(100, 110, 120), 'operationMs', { noise: 20 }).verdict, 'B faster');
  assert.equal(busyVerdict(many(100, 110, 120), many(200, 210, 220), 'operationMs').verdict, 'B slower');
});

test('verdict: separated but inside the A/A noise stays no clear difference', () => {
  const v = busyVerdict(many(100, 101, 102), many(105, 106, 107), 'operationMs', { noise: 50 });
  assert.equal(v.verdict, 'no clear difference'); assert.match(v.note, /A\/A noise/);
});

test('verdict: too few measured runs -> no clear difference, even if far apart', () => {
  const v = busyVerdict(many(100, 100), many(900, 900, 900), 'operationMs');
  assert.equal(v.verdict, 'no clear difference'); assert.match(v.note, /too few/);
});

test('verdict: failed or missing rows are never zero; a side with none is not measured (reason)', () => {
  const v = busyVerdict(many(null, null, null), many(100, 100, 100), 'operationMs');
  assert.match(v.verdict, /^not measured \(A: failed:timeout ×3\)/);
  assert.equal(v.medianA, null);
  assert.match(busyVerdict([], many(1, 2, 3), 'operationMs').verdict, /A: no run produced this rung/);
  // failed rows among measured ones are dropped from n, not averaged in as zero
  const mixed = busyVerdict([...many(100, 101, 102), S(null)], many(300, 301, 302), 'operationMs');
  assert.equal(mixed.nA, 3); assert.equal(mixed.medianA, 101); assert.equal(mixed.verdict, 'B slower');
});

const rungRow = (op, status = 'measured', interference = 'disturbed') => ({ status, interference, operationMs: op, rendererMaxDelayMs: 5, mainMaxDelayMs: 1, inputLatencyMs: 2, peakPssMb: 700 });
const win = (cores, offenders = [{ name: 'chrome', cores: cores / 2 }]) => ({ label: 'w', verdict: 'disturbed', foreignAvgCores: cores, offenders });
const fakeReport = (opA) => ({ incomplete: ['x'], workloads: { runs: [{ repeat: 1, rungs: { 'r-one': rungRow(opA), 'r-fail': { status: 'failed', reason: 'failed:timeout', interference: 'disturbed' } } }] }, interference: { windows: [win(2), win(6)] } });
const mkRuns = (a, b) => interleaveSchedule(a.length).map((s, i) => ({ ...s, exit: 4, jsonPath: `/p/${s.label}.json`, report: fakeReport(s.key === 'a' ? a[Math.floor(i / 2)] : b[Math.floor(i / 2)]) }));

test('summary: per-rung rows, counts, load, failed rung never zero, rendering carries the label and rule', () => {
  const runs = mkRuns([100, 102, 101, 103, 99], [200, 201, 202, 203, 204]);
  const plan = { a: '/old', b: '/new', rounds: 5, aa: false };
  const sum = buildBusySummary({ runs, plan });
  const row = sum.rows.find((r) => r.rung === 'r-one' && r.metric === 'operationMs');
  assert.equal(row.medianA, 101); assert.equal(row.medianB, 202); assert.equal(row.verdict, 'B slower'); assert.equal(row.deltaPct, 100);
  assert.equal(row.nDisturbedA, 5);
  assert.match(sum.rows.find((r) => r.rung === 'r-fail' && r.metric === 'operationMs').verdict, /^not measured/);
  assert.equal(sum.load.medianCores, 4); assert.equal(sum.load.maxCores, 6); assert.equal(sum.load.topOffenders[0].name, 'chrome');
  const md = renderBusySummaryMarkdown(sum);
  assert.ok(md.includes(BUSY_TITLE)); assert.match(md, /Verdict rule/); assert.match(md, /\| r-one \| operationMs \| 101 \| 202 \|/); assert.match(md, /Foreign load observed/);
});

test('noise: an A/A summary feeds the verdict rule', () => {
  const aa = buildBusySummary({ runs: mkRuns([100, 100, 100], [150, 150, 150]).map((r) => ({ ...r, key: r.key === 'b' ? 'a2' : r.key })), plan: { a: '/n', b: '/n', rounds: 3, aa: true } });
  assert.equal(aa.aa, true);
  const noise = noiseFromAaSummary(aa);
  assert.equal(noise['r-one.operationMs'], 50);
  const withNoise = buildBusySummary({ runs: mkRuns([100, 101, 102], [140, 141, 142]), plan: { a: '/o', b: '/n', rounds: 3 }, noiseByKey: noise, noiseSource: 'aa.json' });
  assert.equal(withNoise.rows.find((r) => r.rung === 'r-one' && r.metric === 'operationMs').verdict, 'no clear difference');
  assert.throws(() => noiseFromAaSummary({ aa: false, rows: [] }));
});

test('a run that never produced a report is listed and counts as no measurement', () => {
  const runs = mkRuns([100, 100, 100], [100, 100, 100]);
  runs[1] = { ...runs[1], report: null, jsonPath: null, error: 'run threw: boom' };
  const sum = buildBusySummary({ runs, plan: { a: '/o', b: '/n', rounds: 3 } });
  assert.equal(sum.rows.find((r) => r.rung === 'r-one' && r.metric === 'operationMs').nB, 2);
  assert.match(renderBusySummaryMarkdown(sum), /run threw: boom/);
  assert.equal(summariseLoad([], () => 'a').windows, 0);
});

test('strict path still refuses an exploratory report (the busy path does not loosen it)', () => {
  const r = assessComparability({ exploratory: { mode: 'busy-machine' }, aborted: null, incomplete: [] }, { exploratory: { mode: 'busy-machine' }, aborted: null, incomplete: [] });
  assert.equal(r.comparable, false);
  assert.ok(r.reasons.some((x) => /exploratory --busy-machine/.test(x)));
});

test('parseAbArgs: interleave needs --busy-machine, --mode workloads and --rounds; passes one-pass busy flags to every run', () => {
  const base = ['--a', '/o', '--b', '/n', '--mode', 'workloads'];
  assert.throws(() => parseAbArgs([...base, '--interleave', '--rounds', '5'], { root: '/r' }), /busy-machine/);
  assert.throws(() => parseAbArgs([...base, '--interleave', '--busy-machine'], { root: '/r' }), /--rounds/);
  assert.throws(() => parseAbArgs(['--a', '/o', '--b', '/n', '--interleave', '--busy-machine', '--rounds', '2'], { root: '/r' }), /workloads only/);
  assert.throws(() => parseAbArgs([...base, '--rounds', '2'], { root: '/r' }), /only apply with --interleave/);
  const p = parseAbArgs([...base, '--interleave', '--busy-machine', '--rounds', '3'], { root: '/r' });
  assert.ok(p.common.includes('--busy-machine')); assert.equal(p.common[p.common.indexOf('--workloads-repeats') + 1], '1');
  assert.deepEqual(sequenceFor(p).map((s) => s.key + s.checkout).join(','), 'a/o,b/n,b/n,a/o,a/o,b/n');
  const aa = parseAbArgs(['--a', '/o', '--aa', '--interleave', '--busy-machine', '--rounds', '2', '--mode', 'workloads'], { root: '/r' });
  assert.deepEqual(sequenceFor(aa).map((s) => s.checkout), ['/o', '/o', '/o', '/o']);
  assert.equal(parseAbArgs(['--a', '/o', '--b', '/n'], { root: '/r' }).interleave, false);
});

test('runAb --interleave: ABBA order, one lock, a dead run is recorded and the rest continue, summary files written', async () => {
  const root = mkdtempSync(join(tmpdir(), 'busy-'));
  try {
    const calls = [], logs = [], reports = new Map();
    const deps = {
      root, env: {}, log: (...a) => logs.push(a.join(' ')),
      assetPreflight: () => ({ needed: false, state: 'present', detail: 'stub' }),
      buildFreshness: async (c) => ({ sha: (c.endsWith('b') ? 'b' : 'a').repeat(40), branch: 'x', dirty: null, haveBinary: true, appDir: `${c}/app`, fresh: true }),
      packageIdentity: async () => ({ executableSha256: 'e'.repeat(64), asarSha256: '1'.repeat(64) }),
      instrumentIdentity: () => ({ hashes: {}, combined: 'f'.repeat(64) }),
      requireDiskHeadroom: () => ({ checkedPath: root, availableBytes: 50 * 1024 ** 3 }),
      acquireRunLock: () => { calls.push('lock'); return { release: () => calls.push('unlock') }; },
      now: () => new Date('2026-10-22T10:00:00Z'),
      readReport: (p) => reports.get(p),
      main: async (argv, ctx) => {
        const label = argv[argv.indexOf('--label') + 1], out = argv[argv.indexOf('--out') + 1];
        calls.push(label);
        if (label === 'r2-b') throw new Error('app died');
        ctx.jsonPath = join(out, `${label}.json`);
        reports.set(ctx.jsonPath, fakeReport(label.endsWith('a') ? 100 : 200));
        return EXIT.INCOMPLETE;
      },
    };
    const code = await runAb(['--a', '/x/a', '--b', '/x/b', '--mode', 'workloads', '--interleave', '--busy-machine', '--rounds', '3', '--out', join(root, 'ab')], deps);
    assert.equal(code, EXIT.INCOMPLETE);
    assert.deepEqual(calls, ['lock', 'r1-a', 'r1-b', 'r2-b', 'r2-a', 'r3-a', 'r3-b', 'unlock']);
    const dirLine = logs.find((l) => l.startsWith('comparison directory: ')).slice('comparison directory: '.length);
    assert.match(dirLine, /busy-interleaved/);
    const sum = JSON.parse(readFileSync(join(dirLine, 'busy-summary.json'), 'utf8'));
    assert.equal(sum.runs.length, 6); assert.match(sum.runs.find((r) => r.label === 'r2-b').error, /app died/);
    assert.equal(sum.rows.find((r) => r.rung === 'r-one' && r.metric === 'operationMs').nB, 2);
    assert.match(readFileSync(join(dirLine, 'busy-summary.md'), 'utf8'), /interleaved design/);
    writeFileSync(join(root, 'x'), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
