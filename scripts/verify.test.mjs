import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// WHY: with pipefail, grep -q can close a large changed-file pipe early and
// make printf fail with SIGPIPE. That silently dropped the screen gate while
// verify.sh still announced success. Exercise the real dry-run, not a copy.
test('large changed-file lists still schedule screen and journey verification', { skip: process.platform === 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'youcoded-verify-plan-'));
  const script = fileURLToPath(new URL('./verify.sh', import.meta.url));
  try {
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture\n\nSubmitted via YouCoded Assistant']);
    mkdirSync(join(root, 'desktop/node_modules'), { recursive: true });
    mkdirSync(join(root, 'desktop/src/renderer'), { recursive: true });
    mkdirSync(join(root, 'desktop/z'), { recursive: true });
    writeFileSync(join(root, 'desktop/package.json'), '{}');
    writeFileSync(join(root, 'desktop/src/renderer/view.ts'), '');
    for (let i = 0; i < 4096; i++) writeFileSync(join(root, 'desktop/z', `${String(i).padStart(4, '0')}-${'x'.repeat(90)}.ts`), '');
    const out = execFileSync('bash', [script, root, '--base', 'HEAD', '--dry-run'], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    assert.match(out, /shoot\.mjs --check/);
    assert.match(out, /journeys\.mjs/);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

// Close-session friction, proposal 18: a failed test run's files are rerun alone, and the
// summary says which fail on their own and which only failed under load — never as a pass.
import { failedFiles, verdict } from './lib/verify-rerun.mjs';

test('the failed test files are read from a vitest log, each once', () => {
  const log = [' FAIL  |unit| tests/a.test.ts > group > one', ' FAIL  tests/b.test.tsx > two', ' FAIL  |unit| tests/a.test.ts > group > three', '\x1b[31m × \x1b[39m|unit| src/c.test.ts > four', ' ✓ tests/d.test.ts'].join('\n');
  assert.deepEqual(failedFiles(log), ['tests/a.test.ts', 'tests/b.test.tsx', 'src/c.test.ts']);
});

test('the rerun verdict names real failures and load-sensitive ones, and never calls either a pass', () => {
  const first = ' FAIL  tests/a.test.ts > x\n FAIL  tests/b.test.ts > y';
  const alone = ' FAIL  tests/a.test.ts > x';
  assert.deepEqual(verdict(first, alone), [
    'fails on its own too (a real failure): tests/a.test.ts',
    'passed when rerun alone — load-sensitive, STILL TO FIX (a busy machine breaks it): tests/b.test.ts',
  ]);
  assert.deepEqual(verdict('nothing parsable', ''), ['could not tell which test files failed — read the full log']);
});
