// Making a release tag the "before" side: the helper must refuse clearly, never half-work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestReleaseTag, prepareReleaseCheckout } from '../what-changed/release-checkout.mjs';

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'rel-'));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  mkdirSync(join(repo, 'desktop', 'node_modules', 'dep'), { recursive: true });
  writeFileSync(join(repo, 'desktop', 'node_modules', 'dep', 'i.js'), 'x');
  writeFileSync(join(repo, '.gitignore'), 'node_modules\n');
  writeFileSync(join(repo, 'desktop', 'package-lock.json'), '{"a":1}');
  git('add', '.'); git('commit', '-qm', 'one'); git('tag', 'v1.0.0');
  git('tag', 'v1.10.0'); git('tag', 'v1.2.0');
  return { repo, git, scratch: join(repo, '..', `scr-${Math.random().toString(36).slice(2)}`) };
}

test('the newest v* tag is picked by version, not by letters', () => {
  const f = fixture();
  assert.equal(latestReleaseTag(f.repo), 'v1.10.0');
});

test('an unknown tag is refused and the newest tags are named', () => {
  const f = fixture();
  assert.throws(() => prepareReleaseCheckout({ appRepo: f.repo, tag: 'v9.9.9', afterCheckout: f.repo, scratchRoot: f.scratch }), /no release tag "v9\.9\.9".*v1\.10\.0/);
});

test('a different lockfile is not refused: the packages that changed are named, so the run can say what it cannot see', () => {
  const f = fixture();
  writeFileSync(join(f.repo, 'desktop', 'package-lock.json'), '{"packages":{"node_modules/electron":{"version":"44.0.0"},"node_modules/same":{"version":"1.0.0"}}}');
  f.git('add', '.'); f.git('commit', '-qm', 'two');
  const r = prepareReleaseCheckout({ appRepo: f.repo, tag: 'v1.0.0', afterCheckout: f.repo, scratchRoot: f.scratch });
  assert.ok(r.packagesDiffer.includes('electron'));
  assert.ok(existsSync(join(f.scratch, 'release-v1.0.0')));
});

test('missing packages in the after checkout are refused', () => {
  const f = fixture();
  rmSync(join(f.repo, 'desktop', 'node_modules'), { recursive: true });
  assert.throws(() => prepareReleaseCheckout({ appRepo: f.repo, tag: 'v1.0.0', afterCheckout: f.repo, scratchRoot: f.scratch }), /node_modules is missing/);
});

test('it makes the checkout with a real hardlink copy of node_modules (never a symlink), and reuses it', () => {
  const f = fixture();
  const a = prepareReleaseCheckout({ appRepo: f.repo, tag: 'v1.0.0', afterCheckout: f.repo, scratchRoot: f.scratch });
  const nm = join(a.dir, 'desktop', 'node_modules');
  assert.equal(lstatSync(nm).isSymbolicLink(), false);
  assert.ok(existsSync(join(nm, 'dep', 'i.js')));
  const b = prepareReleaseCheckout({ appRepo: f.repo, tag: 'v1.0.0', afterCheckout: f.repo, scratchRoot: f.scratch });
  assert.equal(b.dir, a.dir);
});

test('a folder that holds some other commit is refused, not reused', () => {
  const f = fixture();
  const a = prepareReleaseCheckout({ appRepo: f.repo, tag: 'v1.0.0', afterCheckout: f.repo, scratchRoot: f.scratch });
  writeFileSync(join(f.repo, 'more.txt'), 'm'); f.git('add', 'more.txt'); f.git('commit', '-qm', 'two'); f.git('tag', 'v2.0.0');
  execFileSync('git', ['-C', a.dir, 'checkout', '-q', 'v2.0.0']);
  assert.throws(() => prepareReleaseCheckout({ appRepo: f.repo, tag: 'v1.0.0', afterCheckout: f.repo, scratchRoot: f.scratch }), /exists but is not v1\.0\.0/);
});
