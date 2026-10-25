import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildFastHelperPlan, validateFastHelperPlan, assertFastHelperOptIn,
  protectedSourceHashes, assertSourcesUnchanged } from './supervised-fast-helper.integration.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const runDir = `${root}/scratch/perf-lab/synthetic-fast-ABC123`;
const identity = { dev: 1, ino: 2, uid: 0, mode: 0o100755 };

test('synthetic builder fixes true argv and environment and refuses caller overrides', () => {
  const plan = buildFastHelperPlan({ runDir, identity, uid: 1000 });
  assert.equal(plan.binary, '/usr/bin/true');
  assert.deepEqual(plan.argv, ['/usr/bin/true']);
  assert.deepEqual(plan.env, { HOME: `${runDir}/home`, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' });
  assert.equal(plan.helperProof.purpose, 'synthetic-fast-true');
  assert.equal(validateFastHelperPlan(plan, plan), plan);
  for (const extra of [{ binary: '/bin/sh' }, { argv: ['x'] }, { env: { DISPLAY: ':0' } }, { inherited: process.env }]) {
    assert.throws(() => buildFastHelperPlan({ runDir, identity, uid: 1000, ...extra }));
  }
  for (const patch of [{ binary: '/bin/true' }, { argv: ['/usr/bin/true', 'extra'] },
    { env: { ...plan.env, LD_PRELOAD: '/foreign' } }, { helperProof: { ...plan.helperProof, uid: 9 } },
    { identity: { ...identity, mode: 0o104755 } }]) {
    assert.throws(() => validateFastHelperPlan({ ...plan, ...patch }, plan));
  }
  assert.throws(() => buildFastHelperPlan({ runDir: '/tmp/not-owned', identity, uid: 1000 }));
});

test('integration requires affirmative exact opt-in, Linux and no command arguments', () => {
  assert.doesNotThrow(() => assertFastHelperOptIn({ argv: [], env: { PERF_LAB_SYNTHETIC_FAST_HELPER: '1' }, platform: 'linux' }));
  for (const patch of [{ argv: ['/usr/bin/true'] }, { env: {} }, { platform: 'darwin' },
    { env: { PERF_LAB_SYNTHETIC_FAST_HELPER: 'yes' } }]) {
    assert.throws(() => assertFastHelperOptIn({ argv: [], env: { PERF_LAB_SYNTHETIC_FAST_HELPER: '1' }, platform: 'linux', ...patch }));
  }
});

test('production source hashes include actual gate, app boundary and compositor policy; changes refuse acceptance', () => {
  const before = protectedSourceHashes();
  assert.equal(Object.keys(before).length, 5);
  for (const [path, digest] of Object.entries(before)) {
    assert.equal(digest, createHash('sha256').update(readFileSync(path)).digest('hex'));
  }
  assert.doesNotThrow(() => assertSourcesUnchanged(before));
  const altered = { ...before, [Object.keys(before)[0]]: '0'.repeat(64) };
  assert.throws(() => assertSourcesUnchanged(altered), /source changed/);
});
