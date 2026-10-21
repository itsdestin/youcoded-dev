// Offline only: no build, launch, sensor, provider, model or lab-slot acquisition.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MERGED_EVALUATION_CHECKOUT as checkout, assertApprovedCheckoutPath, authorizeSupervisorPackage, reauthorizeSupervisorPackage } from '../supervised-package.mjs';
import { readEnginePin } from '../fixture.mjs';
import { treeFingerprint } from '../build.mjs';
import { prepareLifecycleFixture, loadLifecyclePackageStamp, parseOptions } from '../short-lifecycle.mjs';

const appDir = join(checkout, 'desktop/release/linux-unpacked');
test('explicit session mapping selects only canonical approved checkout, never neighboring or production paths', () => {
  assert.equal(checkout, '/home/destin/youcoded-dev/worktrees/sessions/96-merged-evaluation/youcoded');
  assert.equal(assertApprovedCheckoutPath(checkout), checkout);
  for (const path of [checkout + '-neighbor', checkout.replace('youcoded', 'other-repo'), '/tmp/perf-lab/worktrees/youcoded', '/opt/YouCoded', '/usr/bin/youcoded']) {
    assert.throws(() => assertApprovedCheckoutPath(path), /approved/);
  }
  const root = fs.mkdtempSync(join(tmpdir(), 'checkout-alias-'));
  try {
    const alias = join(root, 'youcoded'); fs.symlinkSync(checkout, alias);
    assert.throws(() => assertApprovedCheckoutPath(alias), /approved/);
    assert.throws(() => assertApprovedCheckoutPath(checkout, { canonical: () => alias }), /approved/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('registered merged checkout passes source authorization then refuses an injected missing package without fallback', async () => {
  // WHY: a successful authorized build must not break offline source-authority tests.
  // Inject only package I/O; real Git common-dir, registration and backlink checks
  // still precede the missing package, even when the actual release exists.
  const root = fs.mkdtempSync(join(tmpdir(), 'selected-missing-package-'));
  const missing = join(root, 'linux-unpacked');
  let reachedPackage = false;
  try {
    await assert.rejects(authorizeSupervisorPackage({ checkout, binary: join(appDir, 'youcoded') }, {
      canonical: path => {
        if (path === appDir) { reachedPackage = true; return fs.realpathSync(missing); }
        return fs.realpathSync(path);
      },
    }), error => error.code === 'ENOENT' && error.path === missing);
    assert.equal(reachedPackage, true, 'real source authorization reached package validation');
    await assert.rejects(loadLifecyclePackageStamp({ checkout, appDir: missing }), /ENOENT|stamp/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  const opts = parseOptions(['--checkout', checkout, '--app-dir', appDir, '--out', '/tmp/unused-evaluation.json', '--model-free', '--supervised', '--max-minutes', '1', '--max-rss-mb', '256', '--cleanup-reserve-ms', '8000']);
  assert.equal(opts.checkout, checkout); assert.equal(opts.modelFree, true);
});

test('real registered selected source binds fresh fingerprint and worker receipt without creating a package', async () => {
  const fingerprint = await treeFingerprint(checkout);
  assert.equal(fingerprint.sha, '254ff9983aa3657a937dfd65011beb3c6e6508c9');
  const stamp = { ...fingerprint, builtAt: '2026-10-21T00:00:00.000Z' };
  const binary = join(appDir, 'youcoded');
  // Only absent package I/O is simulated: Git registration, source fingerprint,
  // allowlist and worker reauthorization are the real production implementation.
  const deps = {
    canonical: path => path === appDir || path === binary ? path : fs.realpathSync(path),
    stat: () => ({ dev: 123, ino: 456, uid: process.getuid(), mode: 0o100755, isFile: () => true }),
    productionStat: () => { throw Object.assign(Error('no fixture production alias'), { code: 'ENOENT' }); },
    readStamp: async () => stamp, readOptionalStamp: async () => null,
  };
  const packageReceipt = await authorizeSupervisorPackage({ checkout, binary }, deps);
  assert.equal(packageReceipt.checkoutIdentity.common, '/home/destin/youcoded-dev/youcoded/.git');
  assert.equal(packageReceipt.stamp.sha, fingerprint.sha);
  assert.equal(packageReceipt.stamp.dirty, fingerprint.dirty);
  assert.deepEqual(await reauthorizeSupervisorPackage({ binary, packageReceipt }, deps), packageReceipt);
  await assert.rejects(reauthorizeSupervisorPackage({ binary, packageReceipt }, { ...deps, readRegistration: () => '/forged/.git' }), /registration/);
});

test('engine pin provenance hashes the actual selected checkout source', () => {
  const pin = readEnginePin({ checkout });
  const path = join(checkout, 'desktop/src/main/engine/engine-pin.ts');
  assert.equal(pin.sourcePath, path);
  assert.equal(pin.sourceSha256, createHash('sha256').update(fs.readFileSync(path)).digest('hex'));
  assert.throws(() => readEnginePin({ checkout: checkout + '-neighbor' }), /approved/);
});

test('selected model-free fixture records source but reads no engine pin and seeds no model or engine', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'selected-fixture-'));
  const original = fs.readFileSync;
  try {
    fs.readFileSync = (path, ...args) => {
      if (String(path).endsWith('engine-pin.ts')) throw Error('Model-free must not read any engine pin');
      return original(path, ...args);
    };
    syncBuiltinESMExports();
    const f = prepareLifecycleFixture(join(root, 'fixture'), { modelFree: true, checkout }, { checkAssets: () => { throw Error('Model-free must not check assets'); } });
    assert.deepEqual(f.source, { checkout, enginePin: null });
    assert.equal(f.seedEngine, false); assert.equal(f.engine, null); assert.equal(f.modelId, null);
    assert.deepEqual(fs.readdirSync(join(f.home, 'models')), []);
    assert.deepEqual(fs.readdirSync(join(f.userData, 'engine')), []);
    const config = JSON.parse(fs.readFileSync(join(f.home, '.youcoded/config.json')));
    assert.equal(config.engine.backend, 'cpu'); // inert default, not a pin read
  } finally {
    fs.readFileSync = original; syncBuiltinESMExports();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
