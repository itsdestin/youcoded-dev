// No git repo/commits, build commands, package execution or asset provisioning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../build.mjs';

function cached() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cached-lab-'))), release = join(root, 'desktop/release');
  const appDir = join(release, 'linux-unpacked'), binary = join(appDir, 'youcoded'), stamp = join(release, '.perf-lab-build.json');
  mkdirSync(appDir, { recursive: true }); writeFileSync(binary, 'unit executable bytes');
  const fp = { sha: 'a'.repeat(40), dirty: 'b'.repeat(12), branch: 'unit' };
  writeFileSync(stamp, JSON.stringify({ ...fp, builtAt: '2026-10-20T00:00:00.000Z', buildMs: 20 }));
  const effects = [];
  const deps = { fingerprint: async checkout => { assert.equal(checkout, root); effects.push('fingerprint'); return fp; },
    exec: async () => { effects.push('BUILD'); throw Error('build command must never execute'); } };
  return { root, release, appDir, binary, stamp, fp, deps, effects, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('cachedOnly revalidates current fingerprint and reuses only regular binary/stamp before any build/disk checks', async () => {
  const c = cached();
  try {
    const result = await buildApp(c.root, { cachedOnly: true, _deps: c.deps, checkSpace: () => { throw Error('must not allocate'); } });
    assert.equal(result.binary, c.binary); assert.equal(result.sha, c.fp.sha); assert.equal(result.cachedOnly, true);
    assert.deepEqual(c.effects, ['fingerprint']);
  } finally { c.close(); }
});

for (const mode of ['missing-binary', 'missing-stamp', 'stale', 'malformed', 'empty-binary', 'directory-binary', 'directory-stamp', 'foreign-binary-in-stamp', 'invalid-fingerprint']) {
  test(`cachedOnly ${mode} refuses before any build command and cannot fallback`, async () => {
    const c = cached();
    try {
      if (mode === 'missing-binary') rmSync(c.binary);
      if (mode === 'missing-stamp') rmSync(c.stamp);
      if (mode === 'stale') c.deps.fingerprint = async () => ({ ...c.fp, dirty: 'c'.repeat(12) });
      if (mode === 'malformed') writeFileSync(c.stamp, '{bad');
      if (mode === 'empty-binary') writeFileSync(c.binary, '');
      if (mode === 'directory-binary') { rmSync(c.binary); mkdirSync(c.binary); }
      if (mode === 'directory-stamp') { rmSync(c.stamp); mkdirSync(c.stamp); }
      if (mode === 'foreign-binary-in-stamp') writeFileSync(c.stamp, JSON.stringify({ ...c.fp, builtAt: 'now', binary: '/foreign/app' }));
      if (mode === 'invalid-fingerprint') c.deps.fingerprint = async () => ({ sha: '', dirty: '' });
      await assert.rejects(buildApp(c.root, { cachedOnly: true, _deps: c.deps, checkSpace: () => { c.effects.push('SPACE'); throw Error('unexpected allocation'); } }), /cached.only/i);
      assert.ok(!c.effects.includes('BUILD')); assert.ok(!c.effects.includes('SPACE'));
    } finally { c.close(); }
  });
}

test('build-command guard is wired to real fallback path while default fresh-cache reuse remains unchanged', async () => {
  const c = cached();
  try {
    const reused = await buildApp(c.root, { _deps: c.deps });
    assert.equal(reused.binary, c.binary); assert.equal(reused.cachedOnly, undefined);
    rmSync(c.stamp);
    await assert.rejects(buildApp(c.root, { _deps: c.deps, checkSpace: () => c.effects.push('SPACE') }), /build command must never execute/);
    assert.deepEqual(c.effects, ['fingerprint', 'fingerprint', 'SPACE', 'BUILD']);
  } finally { c.close(); }
});

test('cachedOnly rechecks at every actual call, not just a previous successful plan', async () => {
  const c = cached();
  try {
    await buildApp(c.root, { cachedOnly: true, _deps: c.deps });
    c.fp.dirty = 'd'.repeat(12);
    await assert.rejects(buildApp(c.root, { cachedOnly: true, _deps: c.deps }), /cached.only.*fingerprint/i);
    assert.deepEqual(c.effects, ['fingerprint', 'fingerprint']);
  } finally { c.close(); }
});

test('cachedOnly rejects a release symlink ancestor instead of following package/stamp paths', { skip: process.platform === 'win32' }, async () => {
  const c = cached(), other = realpathSync(mkdtempSync(join(tmpdir(), 'cached-outside-')));
  try {
    rmSync(c.release, { recursive: true }); symlinkSync(other, c.release);
    await assert.rejects(buildApp(c.root, { cachedOnly: true, _deps: c.deps }), /cached.only/i);
    assert.ok(!c.effects.includes('BUILD'));
  } finally { c.close(); rmSync(other, { recursive: true, force: true }); }
});

test('cachedOnly refuses force rebuild before even fingerprint and rejects binary/stamp symlinks', async () => {
  const c = cached();
  try {
    await assert.rejects(buildApp(c.root, { cachedOnly: true, skipIfFresh: false, _deps: c.deps }), /conflict|force|cached.only/i);
    assert.deepEqual(c.effects, []);
    if (process.platform !== 'win32') {
      const outside = join(c.root, 'elsewhere'); writeFileSync(outside, 'other'); rmSync(c.binary); symlinkSync(outside, c.binary);
      await assert.rejects(buildApp(c.root, { cachedOnly: true, _deps: c.deps }), /cached.only/i);
      rmSync(c.binary); writeFileSync(c.binary, 'unit'); rmSync(c.stamp); symlinkSync(outside, c.stamp);
      await assert.rejects(buildApp(c.root, { cachedOnly: true, _deps: c.deps }), /cached.only/i);
    }
    assert.ok(!c.effects.includes('BUILD'));
  } finally { c.close(); }
});
