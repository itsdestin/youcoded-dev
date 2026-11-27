// WHY: pins the fork-bomb lesson of 2026-11-27 (scripts/self-spawn-guard.mjs explains). This file reads
// test files as text and spawns nothing except one `git ls-files`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSelfSpawns, workspaceTestFiles } from './self-spawn-guard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('no workspace test file starts a copy of itself as a child process', () => {
  const offenders = [];
  for (const file of workspaceTestFiles(ROOT)) {
    if (file.endsWith('self-spawn-guard.test.mjs')) continue; // its fixtures below are the bad pattern, as text
    for (const hit of findSelfSpawns(fs.readFileSync(file, 'utf8'), file)) offenders.push(`${path.relative(ROOT, file)}:${hit.line} (${hit.call})`);
  }
  assert.deepEqual(offenders, [], `A test file hands its own path to a child process. Each child would run the whole suite again and start more children (the 2026-11-27 fork bomb). Move the child's job into its own file with no tests, like scripts/lib/lock-child.mjs:\n  ${offenders.join('\n  ')}`);
});

test('catches the original fork bomb and its variants', () => {
  const bad = [
    "const here = fileURLToPath(import.meta.url);\nspawn(process.execPath, [here, 'child', lock]);",
    "spawn(process.execPath, [fileURLToPath(import.meta.url), 'child']);",
    "execFileSync('node', [import.meta.filename]);",
    "fork(__filename, ['child']);",
    "spawn(process.execPath, [fileURLToPath(new URL('./x.test.mjs', import.meta.url)), 'child']);",
    "spawnSync(process.execPath, [process.argv[1], 'x']);",
    "const HERE = dirname(fileURLToPath(import.meta.url));\nspawn('node', [join(HERE, 'x.test.mjs')]);",
  ];
  for (const src of bad) assert.equal(findSelfSpawns(src, '/w/scripts/x.test.mjs').length, 1, src);
});

test('allows helpers in their own file and folder-relative paths', () => {
  const ok = [
    "const childScript = fileURLToPath(new URL('./lock-child.mjs', import.meta.url));\nspawn(process.execPath, [childScript, lock]);",
    "const HERE = dirname(fileURLToPath(import.meta.url));\nspawn('node', [join(HERE, 'helper.mjs')]);",
    "spawnSync(process.execPath, ['-e', '0']);",
    "spawn(process.execPath, ['../worker.mjs'], { cwd: new URL('.', import.meta.url) });",
    "execFileSync(process.execPath, [fileURLToPath(new URL('../run.mjs', import.meta.url))]);",
    "const hereDir = dirname(fileURLToPath(import.meta.url));\nexecFileSync('git', ['status'], { cwd: hereDir });",
  ];
  for (const src of ok) assert.deepEqual(findSelfSpawns(src, '/w/scripts/x.test.mjs'), [], src);
});
