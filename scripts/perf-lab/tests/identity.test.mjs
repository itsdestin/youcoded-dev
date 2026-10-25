// Acceptance A3: every report records instrument / fixture / package / execution identity.
// Deterministic: temp files and fakes only; no app, build, or process is launched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { IDENTITY_REVISION, buildIdentity, executionIdentity, hashFileStream, hashFiles, identityMismatches, identityProblems, instrumentIdentity, listInstrumentFiles, packageIdentity, sampleIdentity } from '../identity.mjs';
import { fixtureIdentity, parseArgs } from '../run.mjs';
import { DOCUMENT_CASE_IDS } from '../document-report.mjs';
import { controlFromEnv, CONTROL_ENV } from '../control.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const withTemp = async (fn) => { const dir = mkdtempSync(join(tmpdir(), 'identity-')); try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test('instrument identity hashes lab source, skips tests/analysis-only files, and changes when a file changes', () => withTemp((dir) => {
  mkdirSync(join(dir, 'tests')); mkdirSync(join(dir, 'gpu-control')); mkdirSync(join(dir, '__pycache__'));
  writeFileSync(join(dir, 'run.mjs'), 'one'); writeFileSync(join(dir, 'compare.mjs'), 'analysis'); writeFileSync(join(dir, 'README.md'), 'doc');
  writeFileSync(join(dir, 'tests', 'x.test.mjs'), 't'); writeFileSync(join(dir, 'gpu-control', 'control.html'), 'h'); writeFileSync(join(dir, '__pycache__', 'a.py'), 'p');
  assert.deepEqual(listInstrumentFiles(dir), ['gpu-control/control.html', 'run.mjs']);
  const first = instrumentIdentity(dir);
  assert.equal(first.hashes['run.mjs'], sha('one'));
  writeFileSync(join(dir, 'compare.mjs'), 'analysis changed');
  assert.equal(instrumentIdentity(dir).combined, first.combined, 'analysis-only files are not instrument');
  writeFileSync(join(dir, 'run.mjs'), 'two');
  assert.notEqual(instrumentIdentity(dir).combined, first.combined);
}));

test('the real lab directory has an instrument that includes run.mjs and fixture.mjs but not tests', () => {
  const files = listInstrumentFiles();
  assert.ok(files.includes('run.mjs') && files.includes('fixture.mjs'));
  assert.ok(!files.some((f) => f.startsWith('tests/')) && !files.includes('compare.mjs') && !files.includes('ab.mjs'));
});

test('hashFiles and streamed package hashing agree with sha256', async () => {
  await withTemp(async (dir) => {
    writeFileSync(join(dir, 'f'), 'abc');
    assert.deepEqual(hashFiles(dir, ['f']), { f: sha('abc') });
    assert.equal(await hashFileStream(join(dir, 'f')), sha('abc'));
    await assert.rejects(hashFileStream(join(dir, 'missing')));
  });
  const seen = [];
  const pkg = await packageIdentity('/app', { hash: async (p) => { seen.push(p); return sha(p); } });
  assert.deepEqual(seen, ['/app/youcoded', '/app/resources/app.asar']);
  assert.equal(pkg.executableSha256, sha('/app/youcoded'));
  assert.equal(pkg.asarSha256, sha('/app/resources/app.asar'));
});

test('execution identity captures selection and every repeat count, and ignores label/out/deadline', () => {
  const a = executionIdentity(parseArgs(['--only', 'history,startup', '--label', 'x', '--max-minutes', '5']));
  const b = executionIdentity(parseArgs(['--only', 'startup,history', '--label', 'y', '--out', '/tmp/o']));
  assert.deepEqual(a, b);
  assert.deepEqual(a.only, ['history', 'startup']);
  for (const [flag, key] of [['--runs', 'runs'], ['--history-repeats', 'historyRepeats'], ['--terminal-repeats', 'terminalRepeats'], ['--document-cases', 'documentCaseIds']]) {
    const changed = executionIdentity(parseArgs(['--only', 'history,startup', flag, flag === '--document-cases' ? DOCUMENT_CASE_IDS[0] : '2']));
    assert.notDeepEqual(changed[key], a[key], key);
  }
});

test('fixture identity records per-phase options and changes with the stream diagnostic profile', () => {
  const standard = fixtureIdentity(parseArgs([]));
  assert.ok(standard.options.artifacts && standard.options.nativeStream && standard.options.nativeResume);
  const diag = fixtureIdentity(parseArgs(['--only', 'native-stream', '--stream-completion-diagnostics']));
  assert.notDeepEqual(standard, diag);
});

test('identityProblems: old reports and every malformed block are named, a good block is clean', () => {
  assert.match(identityProblems({})[0], /no identity block.*remeasure/);
  assert.deepEqual(identityProblems({ identity: sampleIdentity() }), []);
  const bad = (change) => { const id = sampleIdentity(); change(id); return identityProblems({ identity: id }).join(' '); };
  assert.match(bad((id) => { id.revision = 0; }), /revision/);
  assert.match(bad((id) => { id.instrument.hashes = {}; }), /instrument/);
  assert.match(bad((id) => { id.instrument.hashes['run.mjs'] = 'nothex'; }), /instrument/);
  assert.match(bad((id) => { id.fixture = {}; }), /fixture/);
  assert.match(bad((id) => { id.package.asarSha256 = 'x'; }), /package hashes/);
  assert.match(bad((id) => { delete id.package; }), /package hashes/);
  assert.match(bad((id) => { id.execution.only = []; }), /execution/);
  assert.match(bad((id) => { id.execution.terminalRepeats = 0; }), /terminalRepeats/);
});

test('identityMismatches names instrument files, fixture and execution differences; package/control may differ', () => {
  const a = sampleIdentity(), b = sampleIdentity();
  assert.deepEqual(identityMismatches(a, b), []);
  b.package.executableSha256 = sha('other'); b.control = { kind: 'injected-delay' };
  assert.deepEqual(identityMismatches(a, b), [], 'different candidates and a labelled control are the point of an A/B run');
  b.instrument.hashes['run.mjs'] = sha('edited');
  assert.match(identityMismatches(a, b).join(' '), /instrument source differs \(run\.mjs\)/);
  const c = sampleIdentity(); c.fixture.options.artifacts.seedEngine = true;
  assert.match(identityMismatches(a, c).join(' '), /fixture/);
  const d = sampleIdentity(); d.execution.historyRepeats = 5;
  assert.match(identityMismatches(a, d).join(' '), /historyRepeats/);
});

test('buildIdentity assembles the revisioned block', () => {
  const cfg = parseArgs(['--only', 'history']);
  const id = buildIdentity({ cfg, fixture: fixtureIdentity(cfg), instrument: { hashes: {}, combined: 'c' }, pkg: { executableSha256: sha('e'), asarSha256: sha('a') } });
  assert.equal(id.revision, IDENTITY_REVISION);
  assert.equal(id.control, null);
  assert.deepEqual(id.execution.only, ['history']);
});

test('the injected-delay control is off by default, validated, and self-describing', () => {
  assert.equal(controlFromEnv({}), null);
  assert.equal(controlFromEnv({ [CONTROL_ENV]: '' }), null);
  const c = controlFromEnv({ [CONTROL_ENV]: '400' });
  assert.equal(c.delayMs, 400); assert.equal(c.notARealCandidate, true); assert.match(c.affects, /switchPaintedMedianMs/);
  for (const bad of ['0', '-1', '1.5', 'abc', '5001']) assert.throws(() => controlFromEnv({ [CONTROL_ENV]: bad }), /must be a whole number/);
});
