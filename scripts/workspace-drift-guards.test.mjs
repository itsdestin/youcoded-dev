// Tests for the two guards that keep the shared youcoded-dev checkout from
// drifting: scripts/git-hooks/pre-commit and scripts/workspace-sync.sh.
//
// Both are exercised against throwaway git repos in os.tmpdir() -- never against
// this workspace. The 2026-09-03 incident these encode is in each script's header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, appendFileSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYNC = join(REPO, 'scripts/workspace-sync.sh');
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
function runSync(local) {
  try {
    return { code: 0, out: execFileSync('bash', [SYNC, local, 'master'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('up to date: says so and changes nothing', () => {
  const p = makePair();
  const before = git(p.local, 'rev-parse', 'HEAD');
  const r = runSync(p.local);
  assert.equal(r.code, 0);
  assert.match(r.out, /up to date/i);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), before);
  rmSync(p.root, { recursive: true, force: true });
});

test('behind only: fast-forwards', () => {
  const p = makePair();
  remoteCommit(p, 'a.txt', 'two\n', 'upstream edit');
  const r = runSync(p.local);
  assert.equal(r.code, 0);
  assert.match(r.out, /caught up 1 commit/);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), git(p.local, 'rev-parse', 'origin/master'));
  rmSync(p.root, { recursive: true, force: true });
});

test('behind, with an unsaved edit to an UNRELATED file: still fast-forwards, edit survives', () => {
  const p = makePair();
  remoteCommit(p, 'a.txt', 'two\n', 'upstream edit');
  writeFileSync(join(p.local, 'b.txt'), 'my work in progress\n');
  const r = runSync(p.local);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /caught up/);
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
  assert.match(r.out, /NOT updated/);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), head, 'must not move HEAD');
  assert.match(git(p.local, 'show', 'HEAD:a.txt'), /one/);
  rmSync(p.root, { recursive: true, force: true });
});

test('local commits that are DUPLICATES of upstream, clean tree: heals automatically', () => {
  const p = makePair();
  // The same change lands upstream under a different sha -- the exact 2026-09-03
  // shape, where a session copied its commits across by hand from a worktree.
  writeFileSync(join(p.local, 'a.txt'), 'shared change\n');
  git(p.local, 'commit', '-qam', 'local copy');
  remoteCommit(p, 'a.txt', 'shared change\n', 'the same change, pushed from a worktree');
  remoteCommit(p, 'b.txt', 'more\n', 'and another');
  const r = runSync(p.local);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /healed/i);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), git(p.local, 'rev-parse', 'origin/master'));
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
  assert.match(r.out, /ONLY here/);
  assert.match(r.out, new RegExp(mine.slice(0, 7)));
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
  assert.match(r.out, /notes\.md \(untracked\)/);
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
  assert.match(r.out, /git worktree add/);
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

// ---------------------------------------------------------------------------
// The residue cases, measured on the real checkout 2026-09-04. It had been
// stuck 175 commits behind for ~31 hours, and every one of the 19 files
// blocking the sync turned out to hold NO work that was not already upstream:
// 15 were byte-identical to a version already committed on origin/master, and
// the other 4 were older copies of files many sessions append to.
//
// That is not an accident, it is what the workflow produces. A session edits a
// workspace file in the shared checkout (the project root is where CLAUDE.md,
// docs/ and .claude/ live), the pre-commit hook refuses the commit, so the
// change is copied into a throwaway worktree and pushed from there -- and
// NOTHING ever removes the original edit. It becomes permanent residue, and
// since the old script refused whenever an incoming commit touched any edited
// file, one leftover blocked every future sync. At ~100 commits a day from
// concurrent sessions the gap only grows, and each session adds more residue.

/** The file's exact content already exists in a commit on origin/master --
 *  a copy left behind after the change was landed from a worktree. */
test('a stale copy of an already-landed file does not block the sync', () => {
  const p = makePair();
  // Upstream lands the change, then moves on past it.
  remoteCommit(p, 'a.txt', 'landed from a worktree\n', 'the change, pushed from a worktree');
  remoteCommit(p, 'a.txt', 'and upstream moved on\n', 'a later edit to the same file');
  // The shared checkout still holds the copy the session left behind.
  writeFileSync(join(p.local, 'a.txt'), 'landed from a worktree\n');

  const r = runSync(p.local);
  assert.equal(r.code, 0, r.out);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), git(p.local, 'rev-parse', 'origin/master'));
  assert.match(git(p.local, 'show', 'HEAD:a.txt'), /upstream moved on/);
  assert.equal(git(p.local, 'status', '--porcelain').trim(), '', 'residue must be gone, not left dirty');
  rmSync(p.root, { recursive: true, force: true });
});

/** Same residue, but the file was NEW when the session wrote it, so it is
 *  untracked here while being tracked upstream. Five of 2026-09-04's blockers. */
test('an untracked stale copy does not block the sync either', () => {
  const p = makePair();
  remoteCommit(p, 'note.md', 'first draft\n', 'the new doc, pushed from a worktree');
  remoteCommit(p, 'note.md', 'first draft\nplus more\n', 'kept working on it in the worktree');
  writeFileSync(join(p.local, 'note.md'), 'first draft\n');   // untracked here

  const r = runSync(p.local);
  assert.equal(r.code, 0, r.out);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), git(p.local, 'rev-parse', 'origin/master'));
  assert.match(git(p.local, 'show', 'HEAD:note.md'), /plus more/);
  rmSync(p.root, { recursive: true, force: true });
});

/** An older copy of a file many sessions append to: nothing here is unique, but
 *  it matches no single commit, so the blob test alone cannot clear it. Git can
 *  merge it, and a sync that refuses over a mergeable file is the ratchet. */
test('a locally-edited file that merges cleanly is merged, not refused', () => {
  const p = makePair();
  remoteCommit(p, 'roadmap.md', 'top\nupstream item\nbottom\n', 'seed the list');
  git(p.local, 'fetch', '-q', 'origin');   // without this origin/master is stale and the ff is a no-op
  git(p.local, 'merge', '--ff-only', '-q', 'origin/master');
  remoteCommit(p, 'roadmap.md', 'top\nupstream item\nanother upstream item\nbottom\n', 'upstream appends');
  // This session appended its own line at the other end of the file.
  writeFileSync(join(p.local, 'roadmap.md'), 'top\nmy local item\nupstream item\nbottom\n');

  const r = runSync(p.local);
  assert.equal(r.code, 0, r.out);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), git(p.local, 'rev-parse', 'origin/master'));
  const merged = readFileSync(join(p.local, 'roadmap.md'), 'utf8');
  assert.match(merged, /my local item/, "the session's own edit must survive");
  assert.match(merged, /another upstream item/, 'and so must the upstream one');
  rmSync(p.root, { recursive: true, force: true });
});

/** The one case that still needs a person -- and the report must name ONLY it,
 *  not every file that happened to be dirty. */
test('a genuine conflict still refuses, and names only the conflicting file', () => {
  const p = makePair();
  remoteCommit(p, 'a.txt', 'upstream rewrote this line\n', 'upstream edit');
  remoteCommit(p, 'b.txt', 'stale\n', 'a change later left behind here');
  remoteCommit(p, 'b.txt', 'upstream moved on\n', 'and moved on');
  writeFileSync(join(p.local, 'a.txt'), 'this session rewrote the same line\n');  // conflicts
  writeFileSync(join(p.local, 'b.txt'), 'stale\n');                              // residue

  const r = runSync(p.local);
  assert.equal(r.code, 1, r.out);
  assert.equal(git(p.local, 'rev-parse', 'HEAD').trim(), git(p.local, 'rev-parse', 'HEAD').trim());
  assert.match(r.out, /a\.txt/, 'must name the file a person has to look at');
  assert.doesNotMatch(r.out, /^\s+b\.txt$/m, 'must not list residue as something to resolve');
  assert.match(readFileSync(join(p.local, 'a.txt'), 'utf8'), /this session rewrote/,
    'the unsaved edit must still be there');
  rmSync(p.root, { recursive: true, force: true });
});

/** Git refuses to overwrite an untracked file it needs to create EVEN WHEN the
 *  content is byte-identical -- it compares paths, not bytes. The first version
 *  of the residue classifier skipped identical untracked files as "not a
 *  blocker" and the fast-forward then died on git's own error, which is how
 *  this was found: two files, on the real checkout, after the healing had
 *  already run. */
test('an untracked file identical to the one upstream adds is residue, not a blocker', () => {
  const p = makePair();
  remoteCommit(p, 'newdoc.md', 'the doc\n', 'upstream adds a file');
  writeFileSync(join(p.local, 'newdoc.md'), 'the doc\n');   // same bytes, untracked here

  const r = runSync(p.local);
  assert.equal(r.code, 0, r.out);
  assert.equal(git(p.local, 'rev-parse', 'HEAD'), git(p.local, 'rev-parse', 'origin/master'));
  assert.equal(git(p.local, 'status', '--porcelain').trim(), '');
  rmSync(p.root, { recursive: true, force: true });
});
