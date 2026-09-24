import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scan, applyPrune, parseWorktreeList, groupKeyFor, repoDirFor } from './prune-worktrees.mjs';

// Only the FIXTURE's own commits need an author identity (the script under test never
// runs `git commit`), so this env is passed explicitly to the fixture's own git() calls
// rather than mutated onto process.env — same isolation approach as workspace-start.test.mjs.
const env = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'test@example.invalid', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull };
function git(cwd, ...args) { return execFileSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }

// Builds a workspace repo plus one nested "youcoded" component repo, each with its own
// bare remote — the same shape scripts/workspace-repos.json describes for the real
// workspace, small enough to create in a temp dir per test.
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-worktrees-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  function makeRepo(name) {
    const seed = path.join(dir, `${name}-seed`), remote = path.join(dir, `${name}.git`);
    fs.mkdirSync(seed);
    git(seed, 'init', '-b', 'master');
    fs.writeFileSync(path.join(seed, 'README.md'), 'seed\n');
    // WHY 'youcoded/' too, for the workspace repo only: the real root .gitignore excludes
    // nested component checkouts so they don't show up as untracked in the workspace's own
    // `git status` — without this, every session directory reads as "dirty" just because
    // the nested youcoded worktree sits inside it (caught by this fixture the first time).
    fs.writeFileSync(path.join(seed, '.gitignore'), name === 'workspace' ? 'scratch/\nnode_modules/\nyoucoded/\nworktrees/\n' : 'scratch/\nnode_modules/\n');
    git(seed, 'add', '.'); git(seed, 'commit', '-m', 'initial');
    git(dir, 'clone', '--bare', seed, remote);
    git(seed, 'remote', 'add', 'origin', remote);
    git(seed, 'push', 'origin', 'master');
    return remote;
  }
  const workspaceRemote = makeRepo('workspace'), youcodedRemote = makeRepo('youcoded');
  const root = path.join(dir, 'root');
  git(dir, 'clone', workspaceRemote, root);
  git(dir, 'clone', youcodedRemote, path.join(root, 'youcoded'));
  const inventory = { workspace: { branch: 'master' }, youcoded: { branch: 'master' } };

  // Adds a worktree off origin/master. `repo` is 'workspace' or 'youcoded'; `dest` is
  // absolute. Left unpushed by default — real sessions never push a branch just for
  // creating a worktree, and this doubles as the "unpushed branch" shape: apply must
  // not fail when there is nothing on the remote to delete.
  function addWorktree(repo, dest, branch) {
    git(repoDirFor(root, repo), 'worktree', 'add', '-b', branch, dest, 'origin/master');
    return dest;
  }
  function makeDirty(worktreePath) { fs.appendFileSync(path.join(worktreePath, 'README.md'), 'edited\n'); }
  function makeUnmerged(worktreePath) {
    fs.writeFileSync(path.join(worktreePath, 'new-file.txt'), 'local only\n');
    git(worktreePath, 'add', 'new-file.txt'); git(worktreePath, 'commit', '-m', 'local-only commit');
  }
  function push(repo, branch) { git(repoDirFor(root, repo), 'push', 'origin', branch); }
  function remoteHasBranch(repo, branch) { try { git(repoDirFor(root, repo), 'ls-remote', '--exit-code', '--heads', 'origin', branch); return true; } catch { return false; } }
  function localHasBranch(repo, branch) { try { git(repoDirFor(root, repo), 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`); return true; } catch { return false; } }
  return { dir, root, inventory, addWorktree, makeDirty, makeUnmerged, push, remoteHasBranch, localHasBranch };
}

test('parseWorktreeList reads worktree/HEAD/branch blocks, including detached and prunable', () => {
  const out = 'worktree /a\nHEAD aaa\nbranch refs/heads/master\n\nworktree /b\nHEAD bbb\ndetached\n\n' +
    'worktree /c\nHEAD ccc\nbranch refs/heads/feature\nprunable gitdir file points to non-existent location\n';
  const list = parseWorktreeList(out);
  assert.equal(list.length, 3);
  assert.deepEqual([list[0].path, list[0].branch], ['/a', 'refs/heads/master']);
  assert.equal(list[1].detached, true);
  assert.equal(list[2].prunableReason, 'gitdir file points to non-existent location');
});

test('groupKeyFor groups nested session worktrees, leaves standalone ones alone', () => {
  const root = '/root';
  const a = groupKeyFor(root, '/root/worktrees/sessions/alpha');
  const b = groupKeyFor(root, '/root/worktrees/sessions/alpha/youcoded');
  const c = groupKeyFor(root, '/root/worktrees/beta');
  assert.equal(a.dir, b.dir);
  assert.equal(a.kind, 'session');
  assert.equal(c.dir, '/root/worktrees/beta');
  assert.equal(c.kind, 'standalone');
});

test('a clean, merged session (workspace + nested component) is SAFE', t => {
  const f = fixture(t);
  const sessionDir = path.join(f.root, 'worktrees', 'sessions', 'alpha');
  f.addWorktree('workspace', sessionDir, 'session/alpha');
  f.addWorktree('youcoded', path.join(sessionDir, 'youcoded'), 'session/alpha');
  const report = scan({ root: f.root, inventory: f.inventory, invokingCwd: f.dir, fetch: false });
  const c = report.candidates.find(x => x.dir === sessionDir);
  assert.ok(c, 'expected the session to be a candidate');
  assert.equal(c.safe, true);
  assert.equal(c.entries.length, 2);
});

test('a dirty standalone worktree is NOT safe', t => {
  const f = fixture(t);
  const dest = path.join(f.root, 'worktrees', 'delta');
  f.addWorktree('workspace', dest, 'standalone/delta');
  f.makeDirty(dest);
  const report = scan({ root: f.root, inventory: f.inventory, invokingCwd: f.dir, fetch: false });
  const c = report.notSafe.find(x => x.dir === dest);
  assert.ok(c, 'expected the dirty worktree to be reported as not safe');
  assert.ok(c.reasons.includes('dirty'), c.reasons.join(','));
  assert.ok(!report.candidates.some(x => x.dir === dest));
});

test('a worktree with a local-only commit is NOT safe (unmerged)', t => {
  const f = fixture(t);
  const dest = path.join(f.root, 'worktrees', 'epsilon');
  f.addWorktree('workspace', dest, 'standalone/epsilon');
  f.makeUnmerged(dest);
  const report = scan({ root: f.root, inventory: f.inventory, invokingCwd: f.dir, fetch: false });
  const c = report.notSafe.find(x => x.dir === dest);
  assert.ok(c, 'expected the unmerged worktree to be reported as not safe');
  assert.ok(c.reasons.includes('unmerged'), c.reasons.join(','));
});

test('a branch never pushed to origin is still classified as SAFE when it is clean and merged', t => {
  // "unpushed" here means the WORKTREE's branch never went to the remote — addWorktree
  // never pushes by default. It must not be confused with "unmerged": merged-but-unpushed
  // is exactly the shape apply has to handle without erroring on the missing remote ref.
  const f = fixture(t);
  const dest = path.join(f.root, 'worktrees', 'zeta');
  f.addWorktree('workspace', dest, 'standalone/zeta');
  assert.equal(f.remoteHasBranch('workspace', 'standalone/zeta'), false);
  const report = scan({ root: f.root, inventory: f.inventory, invokingCwd: f.dir, fetch: false });
  assert.ok(report.candidates.some(x => x.dir === dest));
});

test('one dirty nested component makes the WHOLE session not safe, not just its own line', t => {
  const f = fixture(t);
  const sessionDir = path.join(f.root, 'worktrees', 'sessions', 'gamma');
  f.addWorktree('workspace', sessionDir, 'session/gamma');
  const nested = f.addWorktree('youcoded', path.join(sessionDir, 'youcoded'), 'session/gamma');
  f.makeDirty(nested);
  const report = scan({ root: f.root, inventory: f.inventory, invokingCwd: f.dir, fetch: false });
  assert.ok(!report.candidates.some(x => x.dir === sessionDir), 'a dirty component must not let the group through as safe');
  const c = report.notSafe.find(x => x.dir === sessionDir);
  assert.ok(c, 'expected the group to be reported not-safe');
  assert.ok(c.reasons.includes('dirty'));
  assert.equal(c.entries.length, 2, 'both worktrees in the group must still be listed');
});

test('a registered worktree whose directory was deleted by hand is reported MISSING, not a candidate', t => {
  const f = fixture(t);
  const dest = path.join(f.root, 'worktrees', 'eta');
  f.addWorktree('workspace', dest, 'standalone/eta');
  fs.rmSync(dest, { recursive: true, force: true }); // deleted without `git worktree remove` — git still has it registered
  const report = scan({ root: f.root, inventory: f.inventory, invokingCwd: f.dir, fetch: false });
  assert.ok(report.missing.some(m => m.repo === 'workspace' && m.path === dest));
  assert.ok(!report.candidates.some(x => x.dir === dest));
  assert.ok(!report.notSafe.some(x => x.dir === dest));
});

test('ignored scratch files are surfaced; regenerable dirs like node_modules are filtered out', t => {
  const f = fixture(t);
  const dest = path.join(f.root, 'worktrees', 'theta');
  f.addWorktree('workspace', dest, 'standalone/theta');
  fs.mkdirSync(path.join(dest, 'scratch'));
  fs.writeFileSync(path.join(dest, 'scratch', 'notes.txt'), 'do not lose this\n');
  fs.mkdirSync(path.join(dest, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'node_modules', 'pkg', 'index.js'), '// regenerable\n');
  const report = scan({ root: f.root, inventory: f.inventory, invokingCwd: f.dir, fetch: false });
  const c = report.candidates.find(x => x.dir === dest);
  assert.ok(c, 'the worktree is otherwise clean and merged, so it must still be a candidate');
  assert.deepEqual(c.ignored, ['scratch/']);
});

test('the current session\'s own worktree is excluded even when otherwise safe', t => {
  const f = fixture(t);
  const dest = path.join(f.root, 'worktrees', 'iota');
  f.addWorktree('workspace', dest, 'standalone/iota');
  const report = scan({ root: f.root, inventory: f.inventory, invokingCwd: dest, fetch: false });
  const c = report.notSafe.find(x => x.dir === dest);
  assert.ok(c, 'the invoking session\'s own worktree must never be a removal candidate');
  assert.ok(c.reasons.includes('current-session'));
});

test('--exclude <key> marks a named session not-safe by key, without touching others', t => {
  const f = fixture(t);
  const sessionDir = path.join(f.root, 'worktrees', 'sessions', 'kappa');
  f.addWorktree('workspace', sessionDir, 'session/kappa');
  const other = path.join(f.root, 'worktrees', 'sessions', 'lambda');
  f.addWorktree('workspace', other, 'session/lambda');
  const report = scan({ root: f.root, inventory: f.inventory, invokingCwd: f.dir, excludeKeys: ['kappa'], fetch: false });
  assert.ok(report.notSafe.some(x => x.dir === sessionDir && x.reasons.includes('excluded')));
  assert.ok(report.candidates.some(x => x.dir === other));
});

test('applyPrune removes only the named safe session, in nested-then-workspace order, and deletes both branches', t => {
  const f = fixture(t);
  const sessionDir = path.join(f.root, 'worktrees', 'sessions', 'merge-me');
  const nested = path.join(sessionDir, 'youcoded');
  f.addWorktree('workspace', sessionDir, 'session/merge-me');
  f.addWorktree('youcoded', nested, 'session/merge-me');
  f.push('workspace', 'session/merge-me');
  f.push('youcoded', 'session/merge-me');
  assert.equal(f.remoteHasBranch('workspace', 'session/merge-me'), true);

  // A second, untouched session — proves apply acts on ONLY the name given.
  const untouchedDir = path.join(f.root, 'worktrees', 'sessions', 'leave-me');
  f.addWorktree('workspace', untouchedDir, 'session/leave-me');

  const results = applyPrune({ root: f.root, inventory: f.inventory, targets: ['merge-me'], invokingCwd: f.dir, fetch: false });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'removed');

  assert.equal(fs.existsSync(sessionDir), false, 'the session directory should be gone entirely');
  assert.equal(f.localHasBranch('workspace', 'session/merge-me'), false);
  assert.equal(f.localHasBranch('youcoded', 'session/merge-me'), false);
  assert.equal(f.remoteHasBranch('workspace', 'session/merge-me'), false);
  assert.equal(f.remoteHasBranch('youcoded', 'session/merge-me'), false);
  assert.doesNotMatch(git(f.root, 'worktree', 'list', '--porcelain'), /merge-me/);
  assert.doesNotMatch(git(path.join(f.root, 'youcoded'), 'worktree', 'list', '--porcelain'), /merge-me/);

  // Untouched session survives byte-for-byte.
  assert.equal(fs.existsSync(untouchedDir), true);
  assert.match(git(f.root, 'worktree', 'list', '--porcelain'), /leave-me/);
});

test('applyPrune refuses an unsafe target and leaves it untouched', t => {
  const f = fixture(t);
  const dest = path.join(f.root, 'worktrees', 'mu');
  f.addWorktree('workspace', dest, 'standalone/mu');
  f.makeDirty(dest);
  const results = applyPrune({ root: f.root, inventory: f.inventory, targets: ['mu'], invokingCwd: f.dir, fetch: false });
  assert.equal(results[0].status, 'refused');
  assert.ok(results[0].reasons.includes('dirty'));
  assert.equal(fs.existsSync(dest), true, 'a refused target must not be removed');
  assert.equal(f.localHasBranch('workspace', 'standalone/mu'), true);
});

test('applyPrune throws rather than accept "apply everything"', t => {
  const f = fixture(t);
  assert.throws(() => applyPrune({ root: f.root, inventory: f.inventory, targets: [] }), /apply all/);
  assert.throws(() => applyPrune({ root: f.root, inventory: f.inventory, targets: undefined }), /apply all/);
});

test('applyPrune reports an unknown/already-gone target as refused, not a crash', t => {
  const f = fixture(t);
  const results = applyPrune({ root: f.root, inventory: f.inventory, targets: ['never-existed'], invokingCwd: f.dir, fetch: false });
  assert.equal(results[0].status, 'refused');
});
