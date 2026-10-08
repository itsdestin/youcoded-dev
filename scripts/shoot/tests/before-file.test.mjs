// `shoot --before-file <path>@<ref>`: a "before" side that is this checkout with only the named
// files taken from an older commit (submit-ticket friction, proposal 12).
// Run: node --test scripts/shoot/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBeforeFile, prepareBeforeCopy } from '../before-file.mjs';

function fixtureCheckout() {
  const repo = mkdtempSync(join(tmpdir(), 'before-file-'));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  mkdirSync(join(repo, 'desktop', 'src'), { recursive: true });
  mkdirSync(join(repo, 'desktop', 'node_modules', 'vite'), { recursive: true });
  writeFileSync(join(repo, 'desktop', 'node_modules', 'vite', 'index.js'), 'vite');
  writeFileSync(join(repo, '.gitignore'), 'node_modules\n');
  writeFileSync(join(repo, 'desktop', 'src', 'FoldRow.tsx'), 'old fold');
  writeFileSync(join(repo, 'desktop', 'src', 'Other.tsx'), 'old other');
  git('add', '.'); git('commit', '-qm', 'one');
  // The working tree moves on: both files edited, one new file not committed yet.
  writeFileSync(join(repo, 'desktop', 'src', 'FoldRow.tsx'), 'new fold');
  writeFileSync(join(repo, 'desktop', 'src', 'Other.tsx'), 'new other');
  writeFileSync(join(repo, 'desktop', 'src', 'Added.tsx'), 'added');
  return repo;
}

test('a before-file spec names a path and a ref; a path without a ref is refused', () => {
  assert.deepEqual(parseBeforeFile('desktop/src/a.tsx@HEAD~2'), { path: 'desktop/src/a.tsx', ref: 'HEAD~2' });
  assert.deepEqual(parseBeforeFile('youcoded/desktop/src/a.tsx@main'), { path: 'desktop/src/a.tsx', ref: 'main' }, 'a workspace-relative path is taken from the app checkout');
  assert.throws(() => parseBeforeFile('desktop/src/a.tsx'), /<path>@<ref>/);
});

test('the before copy is the working tree with only the named file from the ref', () => {
  const repo = fixtureCheckout();
  const root = mkdtempSync(join(tmpdir(), 'before-file-root-'));
  try {
    const dest = prepareBeforeCopy(repo, [parseBeforeFile('desktop/src/FoldRow.tsx@HEAD')], root);
    assert.equal(readFileSync(join(dest, 'desktop', 'src', 'FoldRow.tsx'), 'utf8'), 'old fold', 'the named file comes from the ref');
    assert.equal(readFileSync(join(dest, 'desktop', 'src', 'Other.tsx'), 'utf8'), 'new other', 'everything else is the working tree');
    assert.equal(readFileSync(join(dest, 'desktop', 'src', 'Added.tsx'), 'utf8'), 'added', 'uncommitted files come too');
    assert.equal(readFileSync(join(repo, 'desktop', 'src', 'FoldRow.tsx'), 'utf8'), 'new fold', 'the real checkout is never touched');
    // Dependencies are linked, not copied, and never a symlink (workspace rule).
    const a = statSync(join(repo, 'desktop', 'node_modules', 'vite', 'index.js'));
    const b = statSync(join(dest, 'desktop', 'node_modules', 'vite', 'index.js'));
    assert.equal(a.ino, b.ino, 'node_modules is a hardlink farm');
    // A second run reuses the folder and keeps the overridden file's time, so the photo-only
    // build's fingerprint (sizes and times) matches and it is not rebuilt.
    const t1 = statSync(join(dest, 'desktop', 'src', 'FoldRow.tsx')).mtimeMs;
    assert.equal(prepareBeforeCopy(repo, [parseBeforeFile('desktop/src/FoldRow.tsx@HEAD')], root), dest);
    assert.equal(statSync(join(dest, 'desktop', 'src', 'FoldRow.tsx')).mtimeMs, t1);
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
});

test('a file the ref does not have is refused, naming it', () => {
  const repo = fixtureCheckout();
  const root = mkdtempSync(join(tmpdir(), 'before-file-root-'));
  try {
    assert.throws(() => prepareBeforeCopy(repo, [parseBeforeFile('desktop/src/Added.tsx@HEAD')], root), /desktop\/src\/Added\.tsx.*HEAD/);
    assert.equal(existsSync(join(repo, 'desktop', 'src', 'Added.tsx')), true);
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
});
