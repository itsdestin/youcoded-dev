import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./workspace-start.mjs', import.meta.url));
const syncShell = fileURLToPath(new URL('./workspace-sync.sh', import.meta.url));
const env = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'test@example.invalid', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull };
function git(cwd, ...args) { return execFileSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace start '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'shared');
  function repo(name, branch, destination) {
    const remote = path.join(dir, `${name}.git`), seed = path.join(dir, `${name}-seed`);
    fs.mkdirSync(seed); git(seed, 'init', '-b', branch);
    fs.writeFileSync(path.join(seed, 'source.txt'), 'published\n');
    fs.writeFileSync(path.join(seed, '.gitignore'), 'worktrees/\nyoucoded/\nwecoded-themes/\n');
    if (name === 'workspace') {
      fs.mkdirSync(path.join(seed, 'scripts'));
      fs.writeFileSync(path.join(seed, 'scripts', 'workspace-repos.json'), `${JSON.stringify({ workspace: { branch: 'master' } }, null, 2)}\n`);
    }
    git(seed, 'add', '.'); git(seed, 'commit', '-m', 'initial');
    git(dir, 'clone', '--bare', seed, remote); git(dir, 'clone', remote, destination);
    git(seed, 'remote', 'add', 'origin', remote);
    return { remote, seed };
  }
  const workspace = repo('workspace', 'master', root);
  function start(session = 'alpha', repos = [], extra = []) {
    return spawnSync(process.execPath, [cli, '--root', root, '--session', session, '--json', ...repos, ...extra], { env, encoding: 'utf8' });
  }
  function ok(session, repos, extra) {
    const result = start(session, repos, extra);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  return { dir, root, workspace, repo, start, ok };
}

test('new clean workspace advances shared master and starts at the same fetched OID', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.workspace.seed, 'incoming.txt'), 'new upstream\n');
  git(f.workspace.seed, 'add', 'incoming.txt'); git(f.workspace.seed, 'commit', '-m', 'remote update'); git(f.workspace.seed, 'push', 'origin', 'master');
  const out = f.ok('alpha');
  assert.equal(out.reorientation.report.freshness.status, 'fetched');
  assert.equal(out.reorientation.report.action.status, 'fast-forwarded');
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), out.reorientation.report.freshness.fetchedOid);
  assert.equal(git(out.workspace, 'rev-parse', 'HEAD'), out.reorientation.report.freshness.fetchedOid);
});

test('overlapping shared edits are preserved while a new workspace uses the fetched OID', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.workspace.seed, 'source.txt'), 'new upstream\n');
  git(f.workspace.seed, 'commit', '-am', 'remote update'); git(f.workspace.seed, 'push', 'origin', 'master');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'local staged\n'); git(f.root, 'add', 'source.txt');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'local unstaged\n');
  fs.writeFileSync(path.join(f.root, 'untracked.txt'), 'keep');
  const before = [git(f.root, 'rev-parse', 'HEAD'), git(f.root, 'diff', '--cached'), git(f.root, 'diff'), git(f.root, 'status', '--porcelain')];
  const out = f.ok('alpha');
  assert.equal(fs.readFileSync(path.join(out.workspace, 'source.txt'), 'utf8'), 'new upstream\n');
  assert.deepEqual([git(f.root, 'rev-parse', 'HEAD'), git(f.root, 'diff', '--cached'), git(f.root, 'diff'), git(f.root, 'status', '--porcelain')], before);
  assert.equal(fs.readFileSync(path.join(f.root, 'untracked.txt'), 'utf8'), 'keep');
  assert.equal(out.repositories.workspace.status, 'created');
  assert.equal(out.reorientation.report.action.status, 'review-required');
  assert.equal(git(out.workspace, 'rev-parse', 'HEAD'), out.reorientation.report.freshness.fetchedOid);
});

test('resume works offline and preserves dirty files and local commits', t => {
  const f = fixture(t), first = f.ok('alpha');
  fs.writeFileSync(path.join(first.workspace, 'source.txt'), 'session commit');
  git(first.workspace, 'commit', '-am', 'session work');
  const head = git(first.workspace, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(first.workspace, 'source.txt'), 'unfinished');
  git(f.root, 'remote', 'set-url', 'origin', path.join(f.dir, 'offline.git'));
  const again = f.ok('alpha');
  assert.equal(again.workspace, first.workspace);
  assert.equal(again.repositories.workspace.status, 'resumed');
  assert.equal(again.reorientation.report.freshness.status, 'unknown');
  assert.equal(again.reorientation.report.action.status, 'offline');
  assert.equal(git(first.workspace, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.readFileSync(path.join(first.workspace, 'source.txt'), 'utf8'), 'unfinished');
});

test('different session keys produce independent worktrees', t => {
  const f = fixture(t), a = f.ok('alpha'), b = f.ok('beta');
  assert.notEqual(a.workspace, b.workspace);
  fs.writeFileSync(path.join(a.workspace, 'source.txt'), 'alpha');
  assert.equal(fs.readFileSync(path.join(b.workspace, 'source.txt'), 'utf8'), 'published\n');
});

test('adds a component with its main default and resumes every previously added component', t => {
  const f = fixture(t); f.repo('themes', 'main', path.join(f.root, 'wecoded-themes'));
  const first = f.ok('alpha'), added = f.ok('alpha', ['wecoded-themes']);
  assert.equal(added.workspace, first.workspace);
  const component = added.repositories['wecoded-themes'];
  assert.equal(component.path, path.join(first.workspace, 'wecoded-themes'));
  assert.equal(component.status, 'created');
  const resumed = f.ok('alpha');
  assert.equal(resumed.repositories['wecoded-themes'].status, 'resumed');
});

test('component fetch disables repository reference-transaction hooks', t => {
  const f = fixture(t);
  f.repo('themes', 'main', path.join(f.root, 'wecoded-themes'));
  const hookDir = path.join(f.dir, 'component-hooks');
  const marker = path.join(f.dir, 'component-fetch-hook-ran');
  fs.mkdirSync(hookDir);
  fs.writeFileSync(path.join(hookDir, 'reference-transaction'), `#!/bin/sh\ncat | grep -q 'refs/remotes/origin/main' && printf ran > ${JSON.stringify(marker)}\n`, { mode: 0o755 });
  git(path.join(f.root, 'wecoded-themes'), 'config', 'core.hooksPath', hookDir);
  const out = f.ok('alpha', ['wecoded-themes']);
  assert.equal(out.repositories['wecoded-themes'].status, 'created');
  assert.equal(fs.existsSync(marker), false);
  assert.equal(git(path.join(f.root, 'wecoded-themes'), 'config', 'core.hooksPath'), hookDir);
});

test('invalid keys and unknown repositories fail before provisioning', t => {
  const f = fixture(t);
  for (const key of ['../escape', 'Alpha', '-flag', 'a/b', 'a'.repeat(65)]) assert.notEqual(f.start(key).status, 0);
  assert.match(f.start('alpha', ['unknown']).stderr, /Unknown repository/);
  assert.equal(git(f.root, 'worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
});

test('unrelated primary repository is rejected before directory lock fetch or ref mutation', t => {
  const f = fixture(t);
  const unrelated = path.join(f.dir, 'unrelated');
  fs.mkdirSync(unrelated);
  git(unrelated, 'init', '-b', 'master');
  fs.writeFileSync(path.join(unrelated, 'README.md'), 'not the workspace\n');
  git(unrelated, 'add', 'README.md');
  git(unrelated, 'commit', '-m', 'unrelated');
  const before = {
    head: git(unrelated, 'rev-parse', 'HEAD'),
    refs: git(unrelated, 'for-each-ref', '--format=%(refname) %(objectname)'),
    entries: fs.readdirSync(unrelated).sort(),
  };
  const result = spawnSync(process.execPath, [cli, '--root', unrelated, '--session', 'alpha', '--json'], { env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /inventory marker/);
  assert.deepEqual({
    head: git(unrelated, 'rev-parse', 'HEAD'),
    refs: git(unrelated, 'for-each-ref', '--format=%(refname) %(objectname)'),
    entries: fs.readdirSync(unrelated).sort(),
  }, before);
});

test('missing component source fails without silently using the workspace repo', t => {
  const f = fixture(t);
  assert.match(f.start('alpha', ['youcoded']).stderr, /Missing.*youcoded/);
  assert.equal(git(f.root, 'worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
});

test('refuses foreign path and pre-existing branch collisions', t => {
  const f = fixture(t);
  const target = path.join(f.root, 'worktrees', 'sessions', 'alpha');
  fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(path.join(target, 'keep'), 'foreign');
  assert.match(f.start('alpha').stderr, /already exists/);
  assert.equal(fs.readFileSync(path.join(target, 'keep'), 'utf8'), 'foreign');
  git(f.root, 'branch', 'session/beta');
  assert.match(f.start('beta').stderr, /branch.*already exists/i);
});

test('missing recorded worktree is not silently recreated', t => {
  const f = fixture(t), first = f.ok('alpha');
  git(f.root, 'worktree', 'remove', first.workspace);
  assert.match(f.start('alpha').stderr, /Missing.*worktree/i);
  assert.equal(fs.existsSync(first.workspace), false);
});

test('rejects switched branch on resume', t => {
  const f = fixture(t), first = f.ok('alpha');
  git(first.workspace, 'checkout', '-b', 'other');
  assert.match(f.start('alpha').stderr, /branch|ownership/i);
});

test('failed fetch does not create a worktree or session branch', t => {
  const f = fixture(t); git(f.root, 'remote', 'set-url', 'origin', path.join(f.dir, 'offline.git'));
  const failed = f.start('alpha');
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Cannot start a fresh workspace without fetched guidance/);
  assert.match(failed.stderr, /report\.json/);
  assert.equal(git(f.root, 'branch', '--list', 'session/alpha'), '');
  assert.equal(fs.existsSync(path.join(f.root, 'worktrees', 'sessions', 'alpha')), false);
});

test('resolves the primary workspace when called with a linked workspace root', t => {
  const f = fixture(t), first = f.ok('alpha');
  const result = spawnSync(process.execPath, [cli, '--root', first.workspace, '--session', 'beta', '--json'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).workspace, path.join(f.root, 'worktrees', 'sessions', 'beta'));
});

test('a later fetch failure preserves recorded workspace and retry adds the component', t => {
  const f = fixture(t), component = f.repo('app', 'master', path.join(f.root, 'youcoded'));
  git(path.join(f.root, 'youcoded'), 'remote', 'set-url', 'origin', path.join(f.dir, 'offline.git'));
  assert.match(f.start('alpha', ['youcoded']).stderr, /git .*fetch/);
  const partial = f.ok('alpha');
  assert.equal(partial.repositories.workspace.status, 'resumed');
  git(path.join(f.root, 'youcoded'), 'remote', 'set-url', 'origin', component.remote);
  assert.equal(f.ok('alpha', ['youcoded']).repositories.youcoded.status, 'created');
});

test('a mismatched recorded component stops before any workspace sync or new provisioning', t => {
  const f = fixture(t);
  f.repo('themes', 'main', path.join(f.root, 'wecoded-themes'));
  f.repo('app', 'master', path.join(f.root, 'youcoded'));
  const first = f.ok('alpha', ['wecoded-themes']);
  git(first.repositories['wecoded-themes'].path, 'checkout', '-b', 'unexpected');
  fs.writeFileSync(path.join(f.workspace.seed, 'later.txt'), 'remote\n');
  git(f.workspace.seed, 'add', 'later.txt'); git(f.workspace.seed, 'commit', '-m', 'later'); git(f.workspace.seed, 'push', 'origin', 'master');
  const sharedHead = git(f.root, 'rev-parse', 'HEAD');
  const cachedRemote = git(f.root, 'rev-parse', 'refs/remotes/origin/master');
  assert.notEqual(f.start('alpha', ['youcoded']).status, 0);
  assert.equal(fs.existsSync(path.join(first.workspace, 'youcoded')), false);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), sharedHead);
  assert.equal(git(f.root, 'rev-parse', 'refs/remotes/origin/master'), cachedRemote);
});

test('setup and startup use one repository inventory', () => {
  const script = fs.readFileSync(new URL('../setup.sh', import.meta.url), 'utf8');
  assert.match(script, /workspace-repos\.json/);
  assert.doesNotMatch(script, /itsdestin\/youcoded:master/);
});

test('provisions node_modules as a hardlink farm for a configured component', t => {
  const f = fixture(t), app = f.repo('app', 'master', path.join(f.root, 'youcoded'));
  const srcModules = path.join(f.root, 'youcoded', 'desktop', 'node_modules', 'dep');
  fs.mkdirSync(srcModules, { recursive: true });
  fs.writeFileSync(path.join(srcModules, 'index.js'), 'module code\n');
  const out = f.ok('alpha', ['youcoded']);
  const destModules = path.join(out.repositories.youcoded.path, 'desktop', 'node_modules', 'dep', 'index.js');
  assert.equal(fs.readFileSync(destModules, 'utf8'), 'module code\n');
  // Hard linked, not a copy: same inode as the source.
  assert.equal(fs.statSync(destModules).ino, fs.statSync(path.join(srcModules, 'index.js')).ino);
  assert.match(JSON.stringify(out.repositories.youcoded.provisioned), /desktop\/node_modules \(hardlinked\)/);
});

test('a component with no installed deps and a resume both provision nothing', t => {
  const f = fixture(t);
  f.repo('app', 'master', path.join(f.root, 'youcoded'));
  const created = f.ok('alpha', ['youcoded']);
  assert.equal(created.repositories.youcoded.provisioned, undefined);
  // Now add deps to the source AFTER creation: resume must not clobber or copy.
  const srcModules = path.join(f.root, 'youcoded', 'desktop', 'node_modules');
  fs.mkdirSync(srcModules, { recursive: true });
  const resumed = f.ok('alpha', ['youcoded']);
  assert.equal(resumed.repositories.youcoded.status, 'resumed');
  assert.equal(resumed.repositories.youcoded.provisioned, undefined);
  assert.equal(fs.existsSync(path.join(resumed.repositories.youcoded.path, 'desktop', 'node_modules')), false);
});

test('a held startup lock refuses the call and is not deleted', t => {
  const f = fixture(t);
  const lock = path.join(f.root, '.git', 'youcoded-sessions', 'alpha.lock');
  fs.mkdirSync(lock, { recursive: true });
  assert.match(f.start('alpha').stderr, /locked/);
  assert.equal(fs.existsSync(lock), true);
});

test('--help discloses guarded shared updates and prohibited manual or publishing actions', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /fetch/i);
  assert.match(result.stdout, /guarded fast-forward may update the shared workspace/i);
  assert.match(result.stdout, /No manual pull, stash, clean, commit, push or publish/i);
});

test('human output includes briefing/report and warns that file tools are not retargeted', t => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [cli, '--root', f.root, '--session', 'alpha'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Workspace freshness: fetched/);
  assert.match(result.stdout, /Report: .*report\.json/);
  assert.match(result.stdout, new RegExp(path.join(f.root, 'worktrees', 'sessions', 'alpha').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.stdout, /absolute paths for file tools/);
  assert.match(result.stdout, /not a sandbox/);
});

test('later component fetch failure reports successful workspace reorientation', t => {
  const f = fixture(t);
  f.repo('app', 'master', path.join(f.root, 'youcoded'));
  git(path.join(f.root, 'youcoded'), 'remote', 'set-url', 'origin', path.join(f.dir, 'offline-component.git'));
  const failed = f.start('alpha', ['youcoded']);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Workspace reorientation report: .*report\.json/);
  assert.equal(fs.existsSync(path.join(f.root, 'worktrees', 'sessions', 'alpha')), true);
});

test('startup and shell maintenance coordinate on the shared sync lock', t => {
  const f = fixture(t);
  const lock = path.join(f.root, '.git', 'youcoded-sync.lock');
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: 4242 }));
  const maintenance = spawnSync('bash', [syncShell, f.root, 'master'], { env, encoding: 'utf8' });
  assert.equal(maintenance.status, 1);
  assert.match(maintenance.stdout, /Action: busy/);
  const failed = f.start('alpha');
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /without fetched guidance/);
  assert.equal(fs.existsSync(path.join(f.root, 'worktrees', 'sessions', 'alpha')), false);
  assert.equal(fs.existsSync(lock), true);
});

test('refuses symlinked worktree ancestors before workspace fetch or shared mutation', t => {
  for (const ancestor of ['worktrees', path.join('worktrees', 'sessions')]) {
    const f = fixture(t), external = path.join(f.dir, 'external');
    fs.mkdirSync(external);
    if (ancestor.includes(path.sep)) fs.mkdirSync(path.join(f.root, 'worktrees'));
    fs.symlinkSync(external, path.join(f.root, ancestor), 'junction');
    fs.writeFileSync(path.join(f.workspace.seed, 'incoming.txt'), 'remote\n');
    git(f.workspace.seed, 'add', 'incoming.txt'); git(f.workspace.seed, 'commit', '-m', 'incoming'); git(f.workspace.seed, 'push', 'origin', 'master');
    const head = git(f.root, 'rev-parse', 'HEAD');
    const fetched = git(f.root, 'rev-parse', 'refs/remotes/origin/master');
    assert.match(f.start('alpha').stderr, /symlink|real directory/i);
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), head);
    assert.equal(git(f.root, 'rev-parse', 'refs/remotes/origin/master'), fetched);
    assert.deepEqual(fs.readdirSync(external), []);
  }
});

test('errors creating session directories after reorientation include the report path', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.workspace.seed, 'worktrees'), 'incoming collision');
  git(f.workspace.seed, 'add', '-f', 'worktrees'); git(f.workspace.seed, 'commit', '-m', 'incoming worktrees file'); git(f.workspace.seed, 'push', 'origin', 'master');
  const failed = f.start('alpha');
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Workspace reorientation report: .*report\.json/);
});
