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
