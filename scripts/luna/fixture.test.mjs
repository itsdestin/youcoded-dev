import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildFixture, verifyFixture, PROMPTS } from './fixture.mjs';

async function snapshotTree(root) {
  const entries = {};
  async function visit(directory, relative = '') {
    for (const name of await readdir(directory)) {
      const childRelative = path.posix.join(relative, name);
      const child = path.join(directory, name);
      const info = await lstat(child);
      assert.equal(info.isSymbolicLink(), false);
      if (info.isDirectory()) await visit(child, childRelative);
      else entries[childRelative] = await readFile(child);
    }
  }
  await visit(root);
  return entries;
}

async function withTempRoot(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'luna-fixture-test-'));
  try { await run(root); }
  finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }); }
}

test('keeps six exact controller prompts outside every project clone', async () => withTempRoot(async root => {
  const { PROMPTS } = await import('./fixture.mjs');
  assert.equal(PROMPTS.length, 6);
  assert.ok(PROMPTS.every(prompt => typeof prompt === 'string' && prompt.length > 20));
  const { roots } = await buildFixture(root);
  for (const clone of roots) assert.equal((await readdir(clone)).includes('PROMPTS.md'), false);
  assert.match(PROMPTS[2], /check-config\.mjs/);
  assert.match(PROMPTS[3], /check-greeting\.mjs/);
  assert.match(PROMPTS[5], /check\.mjs/);
}));

test('builds six byte-identical deterministic clone roots', async () => withTempRoot(async root => {
  const result = await buildFixture(root);
  assert.equal(result.roots.length, 6);
  assert.ok(result.roots.every(clone => clone.startsWith(`${root}${path.sep}`)));
  const baseline = await snapshotTree(result.roots[0]);
  for (const clone of result.roots.slice(1)) assert.deepEqual(await snapshotTree(clone), baseline);
  assert.deepEqual(await Promise.all(result.roots.map(verifyFixture)), Array(6).fill('initial'));
}));

test('verifier classifies initial, one-change, and both-change states', async () => withTempRoot(async root => {
  const { roots } = await buildFixture(root);
  const clone = roots[0];
  assert.equal(await verifyFixture(clone), 'initial');
  assert.throws(() => execFileSync(process.execPath, ['check.mjs'], { cwd: clone, stdio: 'pipe' }));
  await writeFile(path.join(clone, 'config.json'), '{"theme":"light","retryLimit":3}\n');
  assert.equal(await verifyFixture(clone), 'one-change');
  await writeFile(path.join(clone, 'src', 'app.js'), "export const greeting = 'LUNA-SECOND-CHANGE';\nexport const modules = ['alpha', 'beta', 'gamma'];\n");
  assert.equal(await verifyFixture(clone), 'both-change');
  assert.match(execFileSync(process.execPath, ['check.mjs'], { cwd: clone, encoding: 'utf8' }), /fixture checks passed/);
}));

test('verifier accepts a semantically correct JSON fix regardless of formatting', async () => withTempRoot(async root => {
  const { roots } = await buildFixture(root);
  const clone = roots[0];
  await writeFile(path.join(clone, 'config.json'), '{\n  "retryLimit": 3,\n  "theme": "light"\n}\n');
  assert.equal(await verifyFixture(clone), 'one-change');
}));

test('each independent change has a focused check before the final verifier', async () => withTempRoot(async root => {
  const { roots } = await buildFixture(root);
  const clone = roots[0];
  assert.throws(() => execFileSync(process.execPath, ['check-config.mjs'], { cwd: clone, stdio: 'pipe' }));
  await writeFile(path.join(clone, 'config.json'), '{"theme":"light","retryLimit":3}\n');
  assert.match(execFileSync(process.execPath, ['check-config.mjs'], { cwd: clone, encoding: 'utf8' }), /config check passed/);
  assert.throws(() => execFileSync(process.execPath, ['check-greeting.mjs'], { cwd: clone, stdio: 'pipe' }));
  await writeFile(path.join(clone, 'src', 'app.js'), "export const greeting = 'LUNA-SECOND-CHANGE';\nexport const modules = ['alpha', 'beta', 'gamma'];\n");
  assert.match(execFileSync(process.execPath, ['check-greeting.mjs'], { cwd: clone, encoding: 'utf8' }), /greeting check passed/);
  assert.match(PROMPTS[2], /check-config\.mjs/);
  assert.match(PROMPTS[3], /check-greeting\.mjs/);
}));

test('rejects symlinks rather than following fixture paths', async () => withTempRoot(async root => {
  const { roots } = await buildFixture(root);
  const clone = roots[0];
  await rm(path.join(clone, 'config.json'));
  await symlink(path.join(root, 'outside'), path.join(clone, 'config.json'));
  await assert.rejects(verifyFixture(clone), /symlink/i);
}));

test('verifier refuses a symlinked ancestor of an otherwise valid clone', async () => withTempRoot(async root => {
  const { roots } = await buildFixture(root);
  await symlink(root, path.join(root, 'alias'), 'dir');
  const alias = path.join(root, 'alias', 'luna-six-turns', 'clone-1');
  await assert.rejects(verifyFixture(alias), /fixture|symlink/i);
  assert.equal(await verifyFixture(roots[0]), 'initial');
}));

test('verifier rejects altered fixture instructions', async () => withTempRoot(async root => {
  const { roots } = await buildFixture(root);
  const clone = roots[0];
  await writeFile(path.join(clone, 'AGENTS.md'), 'altered instructions');
  await assert.rejects(verifyFixture(clone), /unexpected|altered/i);
}));

test('verifier refuses a lookalike clone outside the generated roots', async () => withTempRoot(async root => {
  const fixture = await buildFixture(root);
  const forged = path.join(root, 'other', 'luna-six-turns', 'clone-1');
  await mkdir(path.dirname(forged), { recursive: true });
  await cp(fixture.roots[0], forged, { recursive: true });
  await assert.rejects(verifyFixture(forged), /fixture|generated/i);
}));

test('refuses unsafe or non-private fixture parents', async () => withTempRoot(async root => {
  await assert.rejects(buildFixture(path.dirname(root)), /empty|private|caller-owned/i);
  const open = path.join(root, 'open');
  await mkdir(open, { mode: 0o755 });
  await chmod(open, 0o755);
  await assert.rejects(buildFixture(open), /private/i);
}));
