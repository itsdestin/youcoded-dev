// Tests for the two guards that keep the shared youcoded-dev checkout from
// drifting: scripts/git-hooks/pre-commit and scripts/workspace-sync.sh.
//
// Both are exercised against throwaway git repos in os.tmpdir() -- never against
// this workspace. The 2026-09-03 incident these encode is in each script's header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, appendFileSync, copyFileSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYNC = join(REPO, 'scripts/workspace-sync.sh');
const SYNC_NODE = join(REPO, 'scripts/workspace-sync.mjs');
const HOOK = join(REPO, 'scripts/git-hooks/pre-commit');

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// A bare "remote" plus a clone of it, so ahead/behind are real.
function makePair() {
  const root = mkdtempSync(join(tmpdir(), 'ws-drift-'));
  const remote = join(root, 'remote.git');
  const local = join(root, 'local');
  git(root, 'init', '--bare', '-b', 'master', remote);
  const seed = join(root, 'seed');
  mkdirSync(seed);
  git(seed, 'init', '-b', 'master');
  git(seed, 'config', 'user.email', 't@t'); git(seed, 'config', 'user.name', 'T');
  writeFileSync(join(seed, 'a.txt'), 'one\n');
  writeFileSync(join(seed, 'b.txt'), 'bee\n');
  mkdirSync(join(seed, 'scripts'));
  writeFileSync(join(seed, 'scripts', 'workspace-repos.json'), `${JSON.stringify({ workspace: { branch: 'master' } }, null, 2)}\n`);
  git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'seed');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-q', 'origin', 'master');
  git(root, 'clone', '-q', remote, local);
  git(local, 'config', 'user.email', 't@t'); git(local, 'config', 'user.name', 'T');
  return { root, remote, local, seed };
}
// Advance the remote by one commit touching `file`.
function remoteCommit({ seed }, file, body, msg) {
  writeFileSync(join(seed, file), body);
  git(seed, 'add', '.'); git(seed, 'commit', '-qm', msg); git(seed, 'push', '-q', 'origin', 'master');
}
function runCli(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { code: result.status, out: (result.stdout || '') + (result.stderr || '') };
}
function runSync(local, branch = 'master') {
  return runCli('bash', [SYNC, local, branch]);
}
function mutationState(local) {
  return {
    head: git(local, 'rev-parse', 'HEAD').trim(),
    remote: git(local, 'rev-parse', 'refs/remotes/origin/master').trim(),
    status: git(local, 'status', '--porcelain=v1'),
  };
}

test('CLI rejects component-like roots and linked worktrees before sync', () => {
  const p = makePair();
  const component = join(p.root, 'component');
  mkdirSync(component);
  git(component, 'init', '-b', 'master');
  // Set the identity on THIS repo too, exactly as makePair() does for the other two.
  // Without it the commit below inherits the machine's global identity — which exists
  // on Destin's machine and does NOT exist on a CI runner, so this test passed here
  // and failed there with "Author identity unknown". Workspace CI was red on master
  // for at least four consecutive runs on 2026-09-10/11 because of this one line, and
  // a permanently red build hides the next real failure exactly as a silent one does.
  // Reproduce the CI condition locally with:
  //   GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null node --test <this file>
  git(component, 'config', 'user.email', 't@t'); git(component, 'config', 'user.name', 'T');
  writeFileSync(join(component, 'a.txt'), 'component\n');
  git(component, 'add', 'a.txt'); git(component, 'commit', '-qm', 'component');
  const rejected = runSync(component);
  assert.equal(rejected.code, 1);
  assert.match(rejected.out, /inventory marker/);

  const linked = join(p.root, 'linked');
  git(p.local, 'worktree', 'add', '-q', linked, '-b', 'linked');
  const linkedResult = runSync(linked);
  assert.equal(linkedResult.code, 1);
  assert.match(linkedResult.out, /primary worktree/);
  rmSync(p.root, { recursive: true, force: true });
});

test('shell and Node CLIs reject invalid inventory markers and branches before mutation', { skip: process.platform === 'win32' }, () => {
  const cases = [
    ['untracked marker', local => git(local, 'rm', '--cached', '-q', 'scripts/workspace-repos.json'), /must be tracked/],
    ['symlink marker', local => {
      git(local, 'rm', '-q', 'scripts/workspace-repos.json');
      mkdirSync(join(local, 'scripts'), { recursive: true });
      writeFileSync(join(local, 'inventory-target.json'), JSON.stringify({ workspace: { branch: 'master' } }));
      symlinkSync(join(local, 'inventory-target.json'), join(local, 'scripts', 'workspace-repos.json'));
    }, /regular file/],
    ['directory marker', local => {
      git(local, 'rm', '-q', 'scripts/workspace-repos.json');
      mkdirSync(join(local, 'scripts', 'workspace-repos.json'), { recursive: true });
    }, /regular file/],
    ['malformed inventory', local => writeFileSync(join(local, 'scripts', 'workspace-repos.json'), '{bad'), /Invalid workspace inventory/],
    ['wrong inventory branch', local => writeFileSync(join(local, 'scripts', 'workspace-repos.json'), JSON.stringify({ workspace: { branch: 'main' } })), /branch master/],
  ];
  for (const [label, alter, expected] of cases) {
    for (const [command, argsFor] of [['shell', local => ['bash', [SYNC, local, 'master']]], ['node', local => [process.execPath, [SYNC_NODE, local, 'master']]]]) {
      const p = makePair();
      remoteCommit(p, 'a.txt', `${label} remote\n`, label);
      alter(p.local);
      const before = mutationState(p.local);
      const [bin, args] = argsFor(p.local);
      const result = runCli(bin, args);
      assert.equal(result.code, 1, `${command}: ${label}`);
      assert.match(result.out, expected, `${command}: ${label}`);
      assert.deepEqual(mutationState(p.local), before, `${command}: ${label} mutated repository`);
      rmSync(p.root, { recursive: true, force: true });
    }
  }

  for (const [command, bin, argsFor] of [
    ['shell', 'bash', local => [SYNC, local, 'main']],
    ['node', process.execPath, local => [SYNC_NODE, local, 'main']],
  ]) {
    const p = makePair();
    remoteCommit(p, 'a.txt', 'branch remote\n', 'branch remote');
    const before = mutationState(p.local);
    const result = runCli(bin, argsFor(p.local));
    assert.equal(result.code, 1, command);
    assert.match(result.out, /Unsupported workspace branch/);
    assert.deepEqual(mutationState(p.local), before);
    rmSync(p.root, { recursive: true, force: true });
  }
});

test('up to date: says so and changes nothing', () => {
  const p = makePair();
  const before = git(p.local, 'rev-parse', 'HEAD');
  const r = runSync(p.local);
  assert.equal(r.code, 0);
  assert.match(r.out, /Action: unchanged/);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), before);
  rmSync(p.root, { recursive: true, force: true });
});

test('behind only: fast-forwards', () => {
  const p = makePair();
  remoteCommit(p, 'a.txt', 'two\n', 'upstream edit');
  const r = runSync(p.local);
  assert.equal(r.code, 0);
  assert.match(r.out, /Action: fast-forwarded/);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), git(p.local, 'rev-parse', 'origin/master'));
  rmSync(p.root, { recursive: true, force: true });
});

test('behind, with an unsaved edit to an UNRELATED file: still fast-forwards, edit survives', () => {
  const p = makePair();
  remoteCommit(p, 'a.txt', 'two\n', 'upstream edit');
  writeFileSync(join(p.local, 'b.txt'), 'my work in progress\n');
  const r = runSync(p.local);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Action: fast-forwarded/);
  assert.equal(git(p.local, 'status', '--porcelain').trim(), 'M b.txt');
  rmSync(p.root, { recursive: true, force: true });
});

test('behind, but an unsaved edit COLLIDES: refuses, names the file, touches nothing', () => {
  const p = makePair();
  remoteCommit(p, 'a.txt', 'two\n', 'upstream edit');
  writeFileSync(join(p.local, 'a.txt'), 'mine\n');
  const head = git(p.local, 'rev-parse', 'HEAD');
  const r = runSync(p.local);
  assert.equal(r.code, 1);
  assert.match(r.out, /a\.txt/);
  assert.match(r.out, /Action: review-required/);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), head, 'must not move HEAD');
  assert.match(git(p.local, 'show', 'HEAD:a.txt'), /one/);
  rmSync(p.root, { recursive: true, force: true });
});

test('local commits that are duplicates of upstream are preserved for review', () => {
  const p = makePair();
  // The same change lands upstream under a different sha -- the exact 2026-09-03
  // shape, where a session copied its commits across by hand from a worktree.
  writeFileSync(join(p.local, 'a.txt'), 'shared change\n');
  git(p.local, 'commit', '-qam', 'local copy');
  remoteCommit(p, 'a.txt', 'shared change\n', 'the same change, pushed from a worktree');
  remoteCommit(p, 'b.txt', 'more\n', 'and another');
  const head = git(p.local, 'rev-parse', 'HEAD').trim();
  const r = runSync(p.local);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Action: review-required/);
  assert.equal(git(p.local, 'rev-parse', 'HEAD').trim(), head);
  rmSync(p.root, { recursive: true, force: true });
});

test('a local commit that is UNIQUE: refuses and lists it, rather than discarding it', () => {
  const p = makePair();
  writeFileSync(join(p.local, 'ideas.txt'), 'tip jar idea\n');
  git(p.local, 'add', '.'); git(p.local, 'commit', '-qm', 'capture ideas');
  const mine = git(p.local, 'rev-parse', 'HEAD').trim();
  remoteCommit(p, 'b.txt', 'more\n', 'unrelated upstream work');
  const r = runSync(p.local);
  assert.equal(r.code, 1);
  assert.match(r.out, /local-only/);
  const reportPath = /Report: (.+)/.exec(r.out)?.[1];
  assert.ok(reportPath);
  assert.match(readFileSync(reportPath, 'utf8'), new RegExp(mine));
  assert.equal(git(p.local, 'rev-parse', 'HEAD').trim(), mine, 'unique work must survive');
  rmSync(p.root, { recursive: true, force: true });
});

test('duplicate commits but unsaved edits present: refuses rather than reset --hard', () => {
  const p = makePair();
  writeFileSync(join(p.local, 'a.txt'), 'shared change\n');
  git(p.local, 'commit', '-qam', 'local copy');
  remoteCommit(p, 'a.txt', 'shared change\n', 'same change upstream');
  writeFileSync(join(p.local, 'b.txt'), 'unsaved work\n');
  const r = runSync(p.local);
  assert.equal(r.code, 1, r.out);
  assert.match(git(p.local, 'status', '--porcelain'), /b\.txt/, 'unsaved work must survive');
  rmSync(p.root, { recursive: true, force: true });
});

test('an untracked file the remote also adds, with different content, blocks and is named', () => {
  const p = makePair();
  remoteCommit(p, 'notes.md', 'theirs\n', 'add notes');
  writeFileSync(join(p.local, 'notes.md'), 'mine\n');
  const r = runSync(p.local);
  assert.equal(r.code, 1);
  assert.match(r.out, /notes\.md/);
  assert.match(r.out, /review-required/);
  rmSync(p.root, { recursive: true, force: true });
});

// ---- the commit guard ----------------------------------------------------
function installHook(local) {
  const dst = join(git(local, 'rev-parse', '--git-common-dir').trim().startsWith('/')
    ? git(local, 'rev-parse', '--git-common-dir').trim()
    : join(local, git(local, 'rev-parse', '--git-common-dir').trim()), 'hooks');
  mkdirSync(dst, { recursive: true });
  copyFileSync(HOOK, join(dst, 'pre-commit'));
  chmodSync(join(dst, 'pre-commit'), 0o755);
}
function tryCommit(cwd, env = {}) {
  try {
    execFileSync('git', ['commit', '-qam', 'attempt'], { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, ...env } });
    return { code: 0, out: '' };
  } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

test('guard: a commit in the main checkout is refused, with the worktree recipe', () => {
  const p = makePair();
  installHook(p.local);
  appendFileSync(join(p.local, 'a.txt'), 'edit\n');
  const r = tryCommit(p.local);
  assert.notEqual(r.code, 0, 'commit must fail');
  assert.match(r.out, /Refusing to commit in the shared/);
  assert.match(r.out, /workspace-start\.mjs --session/);
  assert.match(r.out, /Do not copy whole shared files/);
  assert.doesNotMatch(r.out, /push origin HEAD:master/);
  assert.match(git(p.local, 'status', '--porcelain'), /a\.txt/, 'the edit must still be there');
  rmSync(p.root, { recursive: true, force: true });
});

test('guard: the same commit from a linked WORKTREE is allowed', () => {
  const p = makePair();
  installHook(p.local);
  const wt = join(p.root, 'wt');
  git(p.local, 'worktree', 'add', '-q', wt, '-b', 'feature');
  appendFileSync(join(wt, 'a.txt'), 'edit\n');
  const r = tryCommit(wt);
  assert.equal(r.code, 0, `worktree commit must succeed:\n${r.out}`);
  rmSync(p.root, { recursive: true, force: true });
});

test('guard: the explicit override lets a deliberate commit through', () => {
  const p = makePair();
  installHook(p.local);
  appendFileSync(join(p.local, 'a.txt'), 'edit\n');
  const r = tryCommit(p.local, { YOUCODED_ALLOW_MAIN_COMMIT: '1' });
  assert.equal(r.code, 0, `override must work:\n${r.out}`);
  rmSync(p.root, { recursive: true, force: true });
});

// Historical matches remain local proposals. These regressions ensure the
// compatibility entry point reports them instead of reviving destructive cleanup.

/** Historical matches are evidence, not permission to delete a local proposal. */
test('a stale copy of an already-landed file is preserved for review', () => {
  const p = makePair();
  // Upstream lands the change, then moves on past it.
  remoteCommit(p, 'a.txt', 'landed from a worktree\n', 'the change, pushed from a worktree');
  remoteCommit(p, 'a.txt', 'and upstream moved on\n', 'a later edit to the same file');
  // The shared checkout still holds the copy the session left behind.
  writeFileSync(join(p.local, 'a.txt'), 'landed from a worktree\n');

  const head = git(p.local, 'rev-parse', 'HEAD');
  const r = runSync(p.local);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /review-required/);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(join(p.local, 'a.txt'), 'utf8'), 'landed from a worktree\n');
  rmSync(p.root, { recursive: true, force: true });
});

/** An untracked historical match is also preserved rather than presumed residue. */
test('an untracked stale copy is preserved for review', () => {
  const p = makePair();
  remoteCommit(p, 'note.md', 'first draft\n', 'the new doc, pushed from a worktree');
  remoteCommit(p, 'note.md', 'first draft\nplus more\n', 'kept working on it in the worktree');
  writeFileSync(join(p.local, 'note.md'), 'first draft\n');   // untracked here

  const head = git(p.local, 'rev-parse', 'HEAD');
  const r = runSync(p.local);
  assert.equal(r.code, 1, r.out);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(join(p.local, 'note.md'), 'utf8'), 'first draft\n');
  rmSync(p.root, { recursive: true, force: true });
});

/** Clean textual merges are prepared as candidates, never applied automatically. */
test('a locally-edited file that merges cleanly is preserved with a candidate', () => {
  const p = makePair();
  remoteCommit(p, 'roadmap.md', 'top\nupstream item\nbottom\n', 'seed the list');
  git(p.local, 'fetch', '-q', 'origin');   // without this origin/master is stale and the ff is a no-op
  git(p.local, 'merge', '--ff-only', '-q', 'origin/master');
  remoteCommit(p, 'roadmap.md', 'top\nupstream item\nanother upstream item\nbottom\n', 'upstream appends');
  // This session appended its own line at the other end of the file.
  writeFileSync(join(p.local, 'roadmap.md'), 'top\nmy local item\nupstream item\nbottom\n');

  const head = git(p.local, 'rev-parse', 'HEAD');
  const r = runSync(p.local);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /review-required/);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), head);
  assert.match(readFileSync(join(p.local, 'roadmap.md'), 'utf8'), /my local item/);
  const reportPath = /Report: (.+)/.exec(r.out)?.[1];
  assert.ok(reportPath);
  assert.match(readFileSync(reportPath, 'utf8'), /candidate/);
  rmSync(p.root, { recursive: true, force: true });
});

/** Every incoming/local overlap is reported conservatively; none is rewritten as residue. */
test('a genuine conflict refuses and reports every preserved incoming overlap', () => {
  const p = makePair();
  remoteCommit(p, 'a.txt', 'upstream rewrote this line\n', 'upstream edit');
  remoteCommit(p, 'b.txt', 'stale\n', 'a change later left behind here');
  remoteCommit(p, 'b.txt', 'upstream moved on\n', 'and moved on');
  writeFileSync(join(p.local, 'a.txt'), 'this session rewrote the same line\n');  // conflicts
  writeFileSync(join(p.local, 'b.txt'), 'stale\n');                              // residue

  const head = git(p.local, 'rev-parse', 'HEAD').trim();
  const r = runSync(p.local);
  assert.equal(r.code, 1, r.out);
  assert.equal(git(p.local, 'rev-parse', 'HEAD').trim(), head);
  const actionLine = r.out.split('\n').find(line => line.startsWith('Action:')) ?? '';
  assert.match(actionLine, /a\.txt/, 'action reason must name the conflicting file');
  assert.match(actionLine, /b\.txt/, 'action reason must retain the other incoming/local overlap for review');
  assert.match(readFileSync(join(p.local, 'a.txt'), 'utf8'), /this session rewrote/,
    'the unsaved edit must still be there');
  rmSync(p.root, { recursive: true, force: true });
});

/** Exact current bytes still do not authorize deleting an untracked local file. */
test('an untracked file identical to the one upstream adds is preserved for review', () => {
  const p = makePair();
  remoteCommit(p, 'newdoc.md', 'the doc\n', 'upstream adds a file');
  writeFileSync(join(p.local, 'newdoc.md'), 'the doc\n');   // same bytes, untracked here

  const head = git(p.local, 'rev-parse', 'HEAD');
  const r = runSync(p.local);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /review-required/);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(join(p.local, 'newdoc.md'), 'utf8'), 'the doc\n');
  rmSync(p.root, { recursive: true, force: true });
});
