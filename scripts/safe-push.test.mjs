// Tests for scripts/safe-push.sh (card #195): a push cannot run unless the secrets scan passes.
// Everything runs against temp repos with a LOCAL bare remote — never a real remote.
// Run: node --test scripts/safe-push.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const SCRIPT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'safe-push.sh');
const env = { ...process.env, GIT_AUTHOR_NAME: 'F', GIT_AUTHOR_EMAIL: 'f@example.invalid',
  GIT_COMMITTER_NAME: 'F', GIT_COMMITTER_EMAIL: 'f@example.invalid', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const hasGitleaks = spawnSync('gitleaks', ['version'], { encoding: 'utf8' }).status === 0;

// WHY built at runtime: a literal key-shaped string in this file would trip the repo's own
// pre-push gitleaks hook. Prefix and body are joined only when the test runs.
const FAKE_SECRET = 'ghp' + '_' + 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5';

// Local bare remote + clone with one pushed master commit, and a feature branch checked out.
function fixture(t, branch = 'session/test') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-push-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const remote = path.join(dir, 'remote.git'), clone = path.join(dir, 'clone');
  git(dir, 'init', '-q', '--bare', '-b', 'master', remote);
  git(dir, 'init', '-q', '-b', 'master', clone);
  fs.writeFileSync(path.join(clone, 'a.txt'), 'a\n');
  git(clone, 'add', 'a.txt'); git(clone, 'commit', '-qm', 'init');
  git(clone, 'remote', 'add', 'origin', remote); git(clone, 'push', '-q', 'origin', 'master');
  git(clone, 'checkout', '-q', '-b', branch);
  return { dir, remote, clone, branch };
}
const commit = (clone, file, text, msg) => { fs.writeFileSync(path.join(clone, file), text); git(clone, 'add', file); git(clone, 'commit', '-qm', msg); };
const remoteHas = (remote, branch) => spawnSync('git', ['-C', remote, 'rev-parse', '--verify', '-q', `refs/heads/${branch}`], { env }).status === 0;
// A scanner stand-in that records it ran, so logic tests do not need gitleaks installed (CI has none).
function stub(dir, exitCode) {
  const p = path.join(dir, `scanner-${exitCode}.sh`);
  fs.writeFileSync(p, `#!/usr/bin/env bash\necho "$@" > "${dir}/scanner-args"\nexit ${exitCode}\n`, { mode: 0o755 });
  return p;
}
const run = (args, extraEnv = {}) => spawnSync('bash', [SCRIPT, ...args], { env: { ...env, ...extraEnv }, encoding: 'utf8' });

test('clean range: scanner runs over the outgoing range, then the push happens (new branch, no upstream)', (t) => {
  const f = fixture(t);
  commit(f.clone, 'b.txt', 'b\n', 'work');
  const r = run([f.clone], { SAFE_PUSH_GITLEAKS: stub(f.dir, 0) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(remoteHas(f.remote, f.branch), 'branch should be on the remote');
  assert.match(fs.readFileSync(path.join(f.dir, 'scanner-args'), 'utf8'), /--log-opts=[0-9a-f]{40} --not [0-9a-f]{40}/);
});

test('scanner reports a finding (non-zero): nothing is pushed, exit non-zero', (t) => {
  const f = fixture(t);
  commit(f.clone, 'b.txt', 'b\n', 'work');
  const r = run([f.clone], { SAFE_PUSH_GITLEAKS: stub(f.dir, 1) });
  assert.notEqual(r.status, 0);
  assert.ok(!remoteHas(f.remote, f.branch), 'must NOT push after a failed scan');
});

test('scanner errors / bad flag (exit 2 or 127): nothing is pushed', (t) => {
  for (const code of [2, 127]) {
    const f = fixture(t);
    commit(f.clone, 'b.txt', 'b\n', 'work');
    const r = run([f.clone], { SAFE_PUSH_GITLEAKS: stub(f.dir, code) });
    assert.notEqual(r.status, 0);
    assert.ok(!remoteHas(f.remote, f.branch));
  }
});

test('scanner missing: nothing is pushed, exit non-zero, says how to install', (t) => {
  const f = fixture(t);
  commit(f.clone, 'b.txt', 'b\n', 'work');
  const r = run([f.clone], { SAFE_PUSH_GITLEAKS: path.join(f.dir, 'no-such-scanner') });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not installed/);
  assert.ok(!remoteHas(f.remote, f.branch));
});

test('refuses master/main, detached HEAD, and every option (force, delete, refspec)', (t) => {
  const f = fixture(t);
  const ok = stub(f.dir, 0);
  commit(f.clone, 'b.txt', 'b\n', 'work');
  for (const args of [[f.clone, '--force'], ['-f', f.clone], [f.clone, '--force-with-lease'], ['--delete'], [f.clone, '+HEAD:refs/heads/x'], [f.clone, 'origin', 'extra']]) {
    const r = run(args, { SAFE_PUSH_GITLEAKS: ok });
    assert.notEqual(r.status, 0, `should refuse ${args}`);
  }
  assert.ok(!remoteHas(f.remote, f.branch));
  git(f.clone, 'checkout', '-q', 'master'); commit(f.clone, 'c.txt', 'c\n', 'on master');
  const m = run([f.clone], { SAFE_PUSH_GITLEAKS: ok });
  assert.notEqual(m.status, 0); assert.match(m.stderr, /refusing to push master/);
  assert.equal(git(f.remote, 'rev-list', '--count', 'master'), '1', 'remote master untouched');
  git(f.clone, 'checkout', '-q', '--detach');
  assert.notEqual(run([f.clone], { SAFE_PUSH_GITLEAKS: ok }).status, 0);
});

test('works from a linked worktree (component-repo style) and scans only commits the remote lacks', (t) => {
  const f = fixture(t);
  commit(f.clone, 'b.txt', 'b\n', 'first');
  assert.equal(run([f.clone], { SAFE_PUSH_GITLEAKS: stub(f.dir, 0) }).status, 0);
  git(f.clone, 'checkout', '-q', 'master');
  const wt = path.join(f.dir, 'wt');
  git(f.clone, 'worktree', 'add', '-q', '-b', 'session/wt', wt, 'master');
  commit(wt, 'w.txt', 'w\n', 'wt work');
  const r = run([wt], { SAFE_PUSH_GITLEAKS: stub(f.dir, 0) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(remoteHas(f.remote, 'session/wt'));
  assert.match(r.stderr, /scan clean \(1 commit/);
});

// Real gitleaks (skipped where it is not installed, e.g. the CI runner).
test('REAL gitleaks: clean commit pushes; a planted secret is blocked even if a LATER commit deletes it', { skip: !hasGitleaks && 'gitleaks not installed' }, (t) => {
  const f = fixture(t);
  commit(f.clone, 'b.txt', 'nothing secret\n', 'clean');
  const clean = run([f.clone]);
  assert.equal(clean.status, 0, clean.stderr);
  assert.ok(remoteHas(f.remote, f.branch));

  // Intermediate version: add the secret, then remove it in the next commit. History still has it.
  commit(f.clone, 'k.txt', `token = ${FAKE_SECRET}\n`, 'add key');
  commit(f.clone, 'k.txt', 'removed\n', 'remove key');
  const before = git(f.remote, 'rev-parse', f.branch);
  const bad = run([f.clone]);
  assert.notEqual(bad.status, 0, 'planted secret must block the push');
  assert.equal(git(f.remote, 'rev-parse', f.branch), before, 'remote branch must not move');
  assert.ok(!bad.stderr.includes(FAKE_SECRET), 'secret value must not be printed');
});

// Regression (reviewer, 2026-11-10): a stale remote-tracking ref (branch deleted on the remote)
// at HEAD counted as "already published", so the range was empty and the push ran unscanned.
test('a stale remote-tracking ref (branch gone from the remote) does not hide commits from the scan', (t) => {
  const f = fixture(t);
  commit(f.clone, 'b.txt', 'b\n', 'work');
  git(f.clone, 'update-ref', 'refs/remotes/origin/ghost', 'HEAD');
  const r = run([f.clone], { SAFE_PUSH_GITLEAKS: stub(f.dir, 1) });
  assert.notEqual(r.status, 0, 'the scanner must run and block');
  assert.ok(fs.existsSync(path.join(f.dir, 'scanner-args')), 'scanner must have been run');
  assert.ok(!remoteHas(f.remote, f.branch), 'must NOT push');
});

// Regression: `rev-list | wc -l` turned a git error into "0 commits" and pushed.
test('rev-list failure: nothing is pushed', (t) => {
  const f = fixture(t);
  commit(f.clone, 'b.txt', 'b\n', 'work');
  const real = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const shim = path.join(f.dir, 'shim'); fs.mkdirSync(shim);
  fs.writeFileSync(path.join(shim, 'git'), `#!/usr/bin/env bash\nfor a in "$@"; do [[ "$a" == rev-list ]] && exit 128; done\nexec "${real}" "$@"\n`, { mode: 0o755 });
  const r = run([f.clone], { SAFE_PUSH_GITLEAKS: stub(f.dir, 0), PATH: `${shim}:${process.env.PATH}` });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /rev-list failed/);
  assert.ok(!remoteHas(f.remote, f.branch));
});

// Regression: scan and push were two separate looks at HEAD.
test('a commit made between the scan and the push is not pushed', (t) => {
  const f = fixture(t);
  commit(f.clone, 'b.txt', 'b\n', 'work');
  const scanned = git(f.clone, 'rev-parse', 'HEAD');
  const p = path.join(f.dir, 'committing-scanner.sh');
  fs.writeFileSync(p, `#!/usr/bin/env bash\ncd "${f.clone}" && echo late > late.txt && git add late.txt && git commit -qm late\nexit 0\n`, { mode: 0o755 });
  const r = run([f.clone], { SAFE_PUSH_GITLEAKS: p });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(git(f.clone, 'rev-parse', 'HEAD'), scanned, 'the scanner did add a commit');
  assert.equal(git(f.remote, 'rev-parse', f.branch), scanned, 'only the scanned commit is on the remote');
});
