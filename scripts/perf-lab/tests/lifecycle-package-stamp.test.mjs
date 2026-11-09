import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { loadLifecyclePackageStamp } from '../short-lifecycle.mjs';

const stamp = { sha: 'abcdef123456', dirty: '123456abcdef', builtAt: '2026-10-20T12:00:00.000Z', buildMs: 100 };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lifecycle-stamp-'));
  const checkout = join(root, 'checkout');
  const appDir = join(checkout, 'desktop/release/linux-unpacked');
  mkdirSync(appDir, { recursive: true }); writeFileSync(join(appDir, 'youcoded'), 'fake binary, never executed');
  const parent = join(dirname(appDir), '.perf-lab-build.json'), internal = join(appDir, '.perf-lab-build.json');
  const put = (path, value = stamp) => writeFileSync(path, JSON.stringify(value));
  return { root, checkout, appDir, parent, internal, put, options: { fingerprint: async () => ({ sha: stamp.sha, dirty: stamp.dirty }) } };
}
async function withFixture(fn) { const f = fixture(); try { await fn(f); } finally { rmSync(f.root, { recursive: true, force: true }); } }

test('normal buildApp layout reads authoritative release parent stamp and checks source fingerprint', () => withFixture(async f => {
  f.put(f.parent);
  const build = await loadLifecyclePackageStamp(f, f.options);
  assert.equal(build.stampPath, f.parent); assert.equal(build.stampSource, 'official-parent');
  assert.equal(build.binary, join(f.appDir, 'youcoded')); assert.equal(build.sha, stamp.sha);
  await assert.rejects(loadLifecyclePackageStamp(f, { fingerprint: async () => ({ sha: 'other', dirty: stamp.dirty }) }), /fingerprint.*differs/);
}));

test('preserved packages require their internal stamp and never borrow an arbitrary parent stamp', () => withFixture(async f => {
  const appDir = join(f.root, 'preserved'); mkdirSync(appDir); writeFileSync(join(appDir, 'youcoded'), 'fake');
  f.put(join(f.root, '.perf-lab-build.json'));
  await assert.rejects(loadLifecyclePackageStamp({ checkout: f.checkout, appDir }, f.options), /missing/);
  f.put(join(appDir, '.perf-lab-build.json'));
  const build = await loadLifecyclePackageStamp({ checkout: f.checkout, appDir }, { fingerprint: () => { throw Error('must not fingerprint unrelated checkout'); } });
  assert.equal(build.stampSource, 'preserved-internal'); assert.equal(build.sha, stamp.sha);
  writeFileSync(join(appDir, '.perf-lab-build.json'), '{broken');
  await assert.rejects(loadLifecyclePackageStamp({ checkout: f.checkout, appDir }, f.options), /malformed/);
  writeFileSync(join(appDir, '.perf-lab-build.json'), 'x'.repeat(65537));
  await assert.rejects(loadLifecyclePackageStamp({ checkout: f.checkout, appDir }, f.options), /byte cap/);
}));

test('missing, malformed, conflicting and invalid official stamps fail without fallback', () => withFixture(async f => {
  await assert.rejects(loadLifecyclePackageStamp(f, f.options), /missing/);
  f.put(f.internal);
  await assert.rejects(loadLifecyclePackageStamp(f, f.options), /missing/);
  writeFileSync(f.parent, '{malformed');
  await assert.rejects(loadLifecyclePackageStamp(f, f.options), /malformed/);
  f.put(f.parent); f.put(f.internal, { ...stamp, sha: '999999' });
  await assert.rejects(loadLifecyclePackageStamp(f, f.options), /conflicting/);
  f.put(f.internal);
  assert.equal((await loadLifecyclePackageStamp(f, f.options)).sha, stamp.sha);
  for (const bad of [null, [], {}, { ...stamp, sha: 'bad-sha' }, { ...stamp, dirty: 42 }, { ...stamp, builtAt: 'not a date' }]) {
    f.put(f.parent, bad);
    await assert.rejects(loadLifecyclePackageStamp(f, f.options), /invalid/);
  }
}));

test('official package rejects a dangling internal stamp symlink despite a valid parent stamp', () => withFixture(async f => {
  f.put(f.parent);
  symlinkSync(join(f.root, 'missing-stamp.json'), f.internal);
  await assert.rejects(loadLifecyclePackageStamp(f, f.options), /symbolic link|ELOOP/);
}));

test('both selected and conflicting evidence reads are bounded; stamp symlinks are rejected', () => withFixture(async f => {
  writeFileSync(f.parent, 'x'.repeat(65537));
  await assert.rejects(loadLifecyclePackageStamp(f, f.options), /byte cap/);
  f.put(f.parent); writeFileSync(f.internal, 'x'.repeat(65537));
  await assert.rejects(loadLifecyclePackageStamp(f, f.options), /byte cap/);
  rmSync(f.internal); symlinkSync(f.parent, f.internal);
  await assert.rejects(loadLifecyclePackageStamp(f, f.options), /symbolic link|ELOOP/);
}));
