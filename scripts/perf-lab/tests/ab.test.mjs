// Acceptance A1/A2/A6 orchestration, with run.mjs's main() replaced by a fake: no build,
// no app, no display, no process is launched. Proves argument identity across A/B, refusal of
// stale builds, preserved earlier results, control scoping and the preflight output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODES, claimComparisonDir, parseAbArgs, runAb, sequenceFor } from '../ab.mjs';
import { CONTROL_ENV } from '../control.mjs';
import { EXIT } from '../run.mjs';
import { validLegacyReport } from './legacy-fixture.mjs';
import { STALL_MEASUREMENT_REVISION } from '../stall-attribution.mjs';
import { MEASURES as TERMINAL_MEASURES } from '../scenario-terminal.mjs';

const machine = { cpu: 'CPU', ramGb: 32, kernel: '6', node: 'v26', renderer: { source: 'SystemInfo', glRenderer: 'llvmpipe', accelerated: false, featureStatus: { gpu_compositing: 'disabled_software' }, error: null } };
const report = (runs) => {
  const r = { stallMeasurementRevision: STALL_MEASUREMENT_REVISION, machine, noise: { loadAvgBefore: 0.5, machineBusyPctBefore: 1, maxLoadAvgAccepted: 1, maxBusyPctAccepted: 2, discardedRuns: 0 },
    aborted: null, incomplete: [], measures: { terminal: TERMINAL_MEASURES }, ...validLegacyReport(['terminal']) };
  r.terminal.runs.forEach((row, i) => { row.switchPaintedMedianMs = runs[i]; });
  r.terminal.median.switchPaintedMedianMs = runs[1];
  return r;
};

function harness({ stale = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ab-'));
  const calls = [], logs = [], reports = new Map(), env = {};
  const deps = {
    // WHY: these tests never touch real model assets; present means no refusal and no network.
    assetPreflight: () => ({ needed: true, state: 'present', detail: 'stub' }),
    root, env, log: (...a) => logs.push(a.join(' ')),
    buildFreshness: async (checkout) => (stale.includes(checkout) ? { error: 'cached stamp does not match current source fingerprint', haveBinary: false, fresh: false }
      : { sha: checkout.includes('b') ? 'b'.repeat(40) : 'a'.repeat(40), branch: 'x', dirty: 'c0ffee000000', haveBinary: true, appDir: `${checkout}/app`, fresh: true, builtAt: 'then' }),
    packageIdentity: async (appDir) => ({ executableSha256: 'e'.repeat(64), asarSha256: appDir.includes('/b') ? '2'.repeat(64) : '1'.repeat(64) }),
    instrumentIdentity: () => ({ hashes: {}, combined: 'f'.repeat(64) }),
    requireDiskHeadroom: () => ({ checkedPath: root, availableBytes: 50 * 1024 ** 3 }),
    acquireRunLock: () => { calls.push('lock'); return { release: () => calls.push('unlock') }; },
    now: () => new Date('2026-10-21T10:15:00Z'),
    readReport: (path) => reports.get(path),
    main: async (argv, ctx) => {
      const checkout = argv[argv.indexOf('--checkout') + 1], out = argv[argv.indexOf('--out') + 1], label = argv[argv.indexOf('--label') + 1];
      calls.push({ argv, checkout, label, controlEnv: env[CONTROL_ENV], lockHeld: ctx.lockHeld });
      ctx.jsonPath = join(out, `${label}.json`);
      reports.set(ctx.jsonPath, label === 'b' && env[CONTROL_ENV] ? report([502, 503, 504]) : report([100, 102, 101]));
      return EXIT.OK;
    },
  };
  return { root, calls, logs, deps, reports, env, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('parseAbArgs: defaults, presets, and explicit refusals', () => {
  const p = parseAbArgs(['--a', '/x/a', '--b', '/x/b'], { root: '/r' });
  assert.equal(p.mode, 'quick');
  assert.deepEqual([...p.cfg.only], MODES.quick.only.split(','));
  assert.ok(p.common.includes('--cached-only'), 'cached builds only by default');
  assert.equal(parseAbArgs(['--a', '/x/a', '--b', '/x/b', '--build'], { root: '/r' }).common.includes('--cached-only'), false);
  assert.equal(parseAbArgs(['--a', '/x/a', '--b', '/x/b', '--mode', 'full'], { root: '/r' }).cfg.only.size, 11);
  assert.deepEqual([...parseAbArgs(['--a', '/x/a', '--b', '/x/b', '--only', 'terminal'], { root: '/r' }).cfg.only], ['terminal']);
  assert.throws(() => parseAbArgs(['--a', '/x/a'], { root: '/r' }), /both --a and --b/);
  assert.throws(() => parseAbArgs(['--a', '/x/a', '--b-package', '/p'], { root: '/r' }), /not supported/);
  assert.throws(() => parseAbArgs(['--a', '/x/a', '--b', '/x/b', '--mode', 'fast'], { root: '/r' }), /quick, full, energy or workloads/);
  assert.throws(() => parseAbArgs(['--a', '/x/a', '--b', '/x/b', '--only', 'nope'], { root: '/r' }), /unknown phase/);
  assert.throws(() => parseAbArgs(['--a', '/x/a', '--b', '/x/b', '--control-b-delay-ms', '0'], { root: '/r' }), /whole number/);
});

test('sequenceFor: A, B, and A again only with --repeat-a; control only on B', () => {
  const base = parseAbArgs(['--a', '/x/a', '--b', '/x/b', '--control-b-delay-ms', '300', '--repeat-a'], { root: '/r' });
  assert.deepEqual(sequenceFor(base).map((s) => [s.key, s.control]), [['a', false], ['b', true], ['a2', false]]);
  assert.equal(sequenceFor(parseAbArgs(['--a', '/x/a', '--b', '/x/b'], { root: '/r' })).length, 2);
});

test('--check prints both identities, build validity, work, boots and bounds and launches nothing', async () => {
  const h = harness();
  try {
    const code = await runAb(['--a', '/x/a', '--b', '/x/b', '--check', '--out', join(h.root, 'ab')], h.deps);
    assert.equal(code, EXIT.OK);
    assert.equal(h.calls.length, 0, 'no run, no lock');
    const out = h.logs.join('\n');
    assert.match(out, /candidate A\s+\/x\/a/); assert.match(out, /candidate B\s+\/x\/b/);
    assert.match(out, /executable eeeeeeeeeeee, app\.asar 111111111111/);
    assert.match(out, /app\.asar 222222222222/);
    assert.match(out, /usable \(built then\)/);
    assert.match(out, /boots\s+\d+ per run x 2 runs/);
    assert.match(out, /hard cap 90 min per run = 180 min total/);
    assert.match(out, /A -> B/);
  } finally { h.cleanup(); }
});

test('a stale or missing cached build is refused before any run, unless --build', async () => {
  const h = harness({ stale: ['/x/b'] });
  try {
    const code = await runAb(['--a', '/x/a', '--b', '/x/b', '--out', join(h.root, 'ab')], h.deps);
    assert.equal(code, EXIT.ERROR);
    assert.equal(h.calls.filter((c) => typeof c === 'object').length, 0);
    assert.match(h.logs.join('\n'), /NOT usable.*pass --build/);
  } finally { h.cleanup(); }
});

test('A then B run sequentially with identical options under one lock, then one comparison is written', async () => {
  const h = harness();
  try {
    const out = join(h.root, 'ab');
    const code = await runAb(['--a', '/x/a', '--b', '/x/b', '--only', 'terminal', '--out', out], h.deps);
    assert.equal(code, EXIT.OK);
    const runs = h.calls.filter((c) => typeof c === 'object');
    assert.deepEqual(h.calls.filter((c) => typeof c === 'string'), ['lock', 'unlock']);
    assert.equal(runs.length, 2);
    const strip = (argv) => argv.filter((_, i, all) => !['--checkout', '--label'].includes(all[i - 1]) && !['--checkout', '--label'].includes(all[i]));
    assert.deepEqual(strip(runs[0].argv.slice().map((v) => v)), strip(runs[1].argv.slice()), 'identical options except checkout/label');
    assert.deepEqual(runs.map((r) => r.checkout), ['/x/a', '/x/b']);
    assert.ok(runs.every((r) => r.lockHeld === true && r.controlEnv === undefined));
    const dir = join(out, '2026-10-21-1015-aaaaaaa-vs-bbbbbbb');
    assert.ok(existsSync(join(dir, 'comparison.md')) && existsSync(join(dir, 'comparison.json')));
    assert.match(readFileSync(join(dir, 'comparison.md'), 'utf8'), /Primary metrics/);
  } finally { h.cleanup(); }
});

test('a second comparison never overwrites the first', async () => {
  const h = harness();
  try {
    const out = join(h.root, 'ab');
    await runAb(['--a', '/x/a', '--b', '/x/b', '--only', 'terminal', '--out', out], h.deps);
    const first = readFileSync(join(out, '2026-10-21-1015-aaaaaaa-vs-bbbbbbb', 'comparison.md'), 'utf8');
    await runAb(['--a', '/x/a', '--b', '/x/b', '--only', 'terminal', '--out', out], h.deps);
    assert.ok(existsSync(join(out, '2026-10-21-1015-aaaaaaa-vs-bbbbbbb-2', 'comparison.md')));
    assert.equal(readFileSync(join(out, '2026-10-21-1015-aaaaaaa-vs-bbbbbbb', 'comparison.md'), 'utf8'), first);
  } finally { h.cleanup(); }
});

test('--repeat-a runs A, B, A and writes the A1-vs-A2 noise table; the control reaches only B and is restored', async () => {
  const h = harness();
  try {
    h.env[CONTROL_ENV] = '77';   // a pre-existing value must be restored afterwards
    const out = join(h.root, 'ab');
    const code = await runAb(['--a', '/x/a', '--b', '/x/b', '--only', 'terminal', '--repeat-a', '--control-b-delay-ms', '400', '--out', out], h.deps);
    assert.equal(code, EXIT.OK);
    const runs = h.calls.filter((c) => typeof c === 'object');
    assert.deepEqual(runs.map((r) => r.label), ['a', 'b', 'a2']);
    assert.deepEqual(runs.map((r) => r.controlEnv), [undefined, '400', undefined]);
    assert.equal(h.env[CONTROL_ENV], '77');
    const dir = join(out, '2026-10-21-1015-aaaaaaa-vs-bbbbbbb-CONTROL');
    assert.ok(existsSync(join(dir, 'noise-a1-vs-a2.md')));
    assert.match(h.logs.join('\n'), /A1-vs-A2 noise table/);
    assert.match(h.logs.join('\n'), /terminal\.median\.switchPaintedMedianMs.*inconclusive/);
  } finally { h.cleanup(); }
});

test('a failed run stops the sequence, still releases the lock, and writes no comparison', async () => {
  const h = harness();
  try {
    const original = h.deps.main;
    h.deps.main = async (argv, ctx) => { const code = await original(argv, ctx); return argv.includes('/x/a') ? EXIT.TIMEOUT : code; };
    const code = await runAb(['--a', '/x/a', '--b', '/x/b', '--only', 'terminal', '--out', join(h.root, 'ab')], h.deps);
    assert.equal(code, EXIT.TIMEOUT);
    assert.equal(h.calls.filter((c) => typeof c === 'object').length, 1);
    assert.ok(h.calls.includes('unlock'));
  } finally { h.cleanup(); }
});

test('claimComparisonDir picks the first free directory name', () => {
  const root = mkdtempSync(join(tmpdir(), 'ab-claim-'));
  try {
    const first = claimComparisonDir(root, 's'); const second = claimComparisonDir(root, 's'); const third = claimComparisonDir(root, 's');
    assert.deepEqual([first, second, third].map((p) => p.slice(root.length + 1)), ['s', 's-2', 's-3']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('parseAbArgs: --mode energy selects the opt-in energy lane alone', () => {
  const plan = parseAbArgs(['--a', '/x/a', '--b', '/x/b', '--mode', 'energy'], { root: '/r' });
  assert.deepEqual([...plan.cfg.only], ['energy']);
  assert.equal(MODES.energy.only, 'energy');
});
