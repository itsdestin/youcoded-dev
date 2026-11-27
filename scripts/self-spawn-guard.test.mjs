// WHY: pins the fork-bomb lesson of 2026-11-27 (scripts/self-spawn-guard.mjs explains). This file reads
// test files as text and spawns nothing except one `git ls-files`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSelfSpawns, workspaceTestFiles } from './self-spawn-guard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('no workspace test file starts a copy of itself or a test suite as a child process', () => {
  const offenders = [];
  for (const file of workspaceTestFiles(ROOT)) {
    if (file.endsWith('self-spawn-guard.test.mjs')) continue; // its fixtures below are the bad pattern, as text
    for (const hit of findSelfSpawns(fs.readFileSync(file, 'utf8'), file)) offenders.push(`${path.relative(ROOT, file)}:${hit.line} (${hit.call}: ${hit.why})`);
  }
  assert.deepEqual(offenders, [], `A test file can re-run itself or a whole suite in a child process. Each child would start more children (the 2026-11-27 fork bomb). Move the child's job into its own file with no tests, like scripts/lib/lock-child.mjs:\n  ${offenders.join('\n  ')}`);
});

const F = '/w/scripts/x.test.mjs';

test('catches the original fork bomb and its variants', () => {
  const bad = [
    "const here = fileURLToPath(import.meta.url);\nspawn(process.execPath, [here, 'child', lock]);",
    "spawn(process.execPath, [fileURLToPath(import.meta.url), 'child']);",
    "execFileSync('node', [import.meta.filename]);",
    "fork(__filename, ['child']);",
    "spawnSync(process.execPath, [process.argv[1], 'x']);",
    "const HERE = dirname(fileURLToPath(import.meta.url));\nspawn('node', [join(HERE, 'x.test.mjs')]);",
    "spawn(process.execPath, [fileURLToPath(new URL('./x.test.mjs', import.meta.url)), 'child']);",
    // review 2026-11-27: argv passed through, other self-path forms, aliases, suite re-runs
    "spawn(process.execPath, process.argv.slice(1));",
    "spawn(process.execPath, [...process.argv.slice(1), 'child']);",
    "spawn(process.execPath, [process.argv.at(1)]);",
    "spawn(process.execPath, [new URL(import.meta.url).pathname]);",
    "const { pathname: me } = new URL(import.meta.url);\nspawn(process.execPath, [me]);",
    "import { spawn as sp } from 'node:child_process';\nsp(process.execPath, [fileURLToPath(import.meta.url)]);",
    "const s = cp.spawn;\ns(process.execPath, [__filename]);",
    "spawn('node', ['--test', 'scripts/']);",
    "execSync('npm test');",
    "spawnSync('npm', ['test']);",
    "execFileSync('npx', ['vitest', 'run']);",
  ];
  for (const src of bad) assert.equal(findSelfSpawns(src, F).length, 1, src);
});

test('allows helpers in their own file and folder-relative paths', () => {
  const ok = [
    "const childScript = fileURLToPath(new URL('./lock-child.mjs', import.meta.url));\nspawn(process.execPath, [childScript, lock]);",
    "const HERE = dirname(fileURLToPath(import.meta.url));\nspawn('node', [join(HERE, 'helper.mjs')]);",
    "spawnSync(process.execPath, ['-e', '0']);",
    "const hereDir = dirname(fileURLToPath(import.meta.url));\nexecFileSync('git', ['status'], { cwd: hereDir });",
    "spawn(process.execPath, ['../worker.mjs'], { cwd: new URL('.', import.meta.url) });",
    "execFileSync(process.execPath, [fileURLToPath(new URL('../run.mjs', import.meta.url))]);",
    "spawn('bash', ['x.sh'], { cwd: dirname(fileURLToPath(import.meta.url)) });",
    "spawn(process.execPath, [helper, ...process.argv.slice(2)]);",
  ];
  for (const src of ok) assert.deepEqual(findSelfSpawns(src, F), [], src);
});
