import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { parseOptions, prepareLifecycleFixture, assertFreshLifecycleOutput } from '../short-lifecycle.mjs';
import { buildFixture } from '../fixture.mjs';

const args = ['--model-free', '--app-dir', '/tmp/cached-package', '--out', '/tmp/fresh-result.json'];
test('model-free CLI requires an explicit cached package and fresh-output path; defaults to three bounded cycles', () => {
  const opts = parseOptions(args);
  assert.equal(opts.modelFree, true); assert.equal(opts.cycles, 3);
  assert.equal(opts.postGc, undefined);
  assert.equal(parseOptions([...args, '--cycles', '2']).cycles, 2);
  for (const argv of [['--model-free'], ['--model-free', '--app-dir', '/tmp/cache'], ['--model-free', '--out', '/tmp/result']]) assert.throws(() => parseOptions(argv), /model-free/);
  const standard = parseOptions([]);
  assert.equal(standard.modelFree, undefined); assert.equal(standard.cycles, 5);
});

test('actual model-free fixture disables engine/local model and seeds only one two-turn history without decoys or provisioning', t => {
  const root = mkdtempSync(join(tmpdir(), 'lifecycle-model-free-'));
  const original = childProcess.execFileSync;
  let execs = 0, checks = 0, actualOptions;
  childProcess.execFileSync = () => { execs++; throw Error('no subprocess/download/copy permitted'); };
  syncBuiltinESMExports();
  try {
    const fixture = prepareLifecycleFixture(root, parseOptions(args), {
      checkAssets: () => { checks++; throw Error('assets deliberately unavailable'); },
      build: (path, options) => { actualOptions = options; return buildFixture(path, options); },
    });
    assert.deepEqual(actualOptions.historySizes, { small: 2 });
    assert.equal(actualOptions.seedEngine, false); assert.equal(actualOptions.decoyCount, 0);
    assert.equal(actualOptions.nativeSessions, false); assert.equal(actualOptions.fakeProvider, true);
    assert.equal(checks, 0); assert.equal(execs, 0);
    assert.equal(fixture.seedEngine, false); assert.equal(fixture.modelId, null); assert.equal(fixture.engine, null);
    assert.equal(fixture.decoyTranscripts, 0); assert.equal(fixture.transcriptFileCount, 1);
    assert.deepEqual(fixture.historySizes, { small: 2 });
    const providers = JSON.parse(readFileSync(join(fixture.home, '.youcoded/providers.json'), 'utf8'));
    assert.equal(providers.providers.find(p => p.id === 'local').enabled, false);
    assert.equal(providers.providers.find(p => p.type === 'openai-compatible').baseUrl, fixture.fakeProvider.baseUrl);
    assert.deepEqual(readdirSync(join(fixture.userData, 'engine')), []);
    assert.equal(fixture.nativeSessions, null);
  } finally { childProcess.execFileSync = original; syncBuiltinESMExports(); rmSync(root, { recursive: true, force: true }); }
});

test('model-free evidence refuses existing files and dangling symlinks before launch', () => {
  const root = mkdtempSync(join(tmpdir(), 'lifecycle-fresh-output-'));
  const out = join(root, 'result.json');
  const opts = { modelFree: true, out };
  try {
    assert.doesNotThrow(() => assertFreshLifecycleOutput(opts));
    writeFileSync(out, 'prior evidence');
    assert.throws(() => assertFreshLifecycleOutput(opts), /fresh/);
    assert.equal(readFileSync(out, 'utf8'), 'prior evidence');
    rmSync(out); symlinkSync(join(root, 'missing'), out);
    assert.throws(() => assertFreshLifecycleOutput(opts), /fresh/);
    assert.doesNotThrow(() => assertFreshLifecycleOutput({ ...opts, modelFree: false }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('standard mode preserves cached-assets prerequisite and existing default fixture options', () => {
  let built = 0, checks = 0, actualOptions;
  assert.throws(() => prepareLifecycleFixture('/unused', parseOptions([]), { checkAssets: () => null, build: () => { built++; } }), /assets not cached/);
  assert.equal(built, 0);
  const result = prepareLifecycleFixture('/unused', parseOptions([]), { checkAssets: () => { checks++; return {}; }, build: (path, options) => { actualOptions = options; return 'fixture'; } });
  assert.equal(result, 'fixture'); assert.equal(checks, 1);
  assert.equal(actualOptions.fakeProvider, true);
  for (const key of ['seedEngine', 'historySizes', 'decoyCount', 'nativeSessions']) assert.equal(Object.hasOwn(actualOptions, key), false);
});
