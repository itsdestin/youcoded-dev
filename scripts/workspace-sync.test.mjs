import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeWorkspace } from './fixtures/workspace-sync.mjs';
import { formatBriefing, parseStatusInventory, syncWorkspace, trackedTypeBlockers } from './workspace-sync.mjs';

test('clean behind workspace fast-forwards', t => {
  const f = makeWorkspace(t);
  f.publish('incoming.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.action.status, 'fast-forwarded');
  assert.equal(f.git(f.root, 'rev-parse', 'HEAD'), out.report.freshness.remoteOid);
  assert.ok(fs.existsSync(out.report.evidence.snapshot));
});

function assertPreserved(f, before) {
  assert.deepEqual(f.capture(), before);
}

function appendCommit(f, relativePath, contents) {
  const target = path.join(f.seed, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  f.git(f.seed, 'add', '--', relativePath);
  f.git(f.seed, 'commit', '-m', `publish ${relativePath}`);
  f.git(f.seed, 'push', 'origin', 'master');
}

test('unrelated staged and unstaged edits preserve exact layers while fast-forwarding', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'staged\n');
  f.git(f.root, 'add', 'source.txt');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'unstaged\n');
  f.publish('incoming.txt', 'remote\n');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  const after = f.capture();
  assert.equal(out.report.action.status, 'fast-forwarded');
  assert.notDeepEqual(after.index, before.index);
  assert.deepEqual(after.staged, before.staged);
  assert.deepEqual(after.unstaged, before.unstaged);
  assert.deepEqual(after.files.find(x => x.path === 'source.txt'), before.files.find(x => x.path === 'source.txt'));
});

test('a concurrent edit is preserved, not rolled back', t => {
  const f = makeWorkspace(t);
  f.publish('source.txt', 'incoming\n');
  const out = syncWorkspace({ root: f.root, beforeApply() {
    fs.writeFileSync(path.join(f.root, 'source.txt'), 'concurrent edit\n');
  } });
  assert.notEqual(out.report.action.status, 'fast-forwarded');
  assert.equal(fs.readFileSync(path.join(f.root, 'source.txt'), 'utf8'), 'concurrent edit\n');
});

test('final recheck refuses unrelated tracked edits and new untracked files before HEAD advances', t => {
  for (const race of ['tracked', 'untracked']) {
    const f = makeWorkspace(t);
    f.publish('incoming.txt', 'remote\n');
    const originalHead = f.git(f.root, 'rev-parse', 'HEAD');
    const racedPath = path.join(f.root, race === 'tracked' ? 'source.txt' : 'created-during-race.txt');
    const racedBytes = `${race} race bytes\n`;
    const out = syncWorkspace({ root: f.root, beforeApply() {
      fs.writeFileSync(racedPath, racedBytes);
    } });
    assert.equal(out.report.action.status, 'review-required', race);
    assert.match(out.report.action.reason, /changed during preparation/);
    assert.equal(f.git(f.root, 'rev-parse', 'HEAD'), originalHead);
    assert.equal(fs.readFileSync(racedPath, 'utf8'), racedBytes);
  }
});

test('lock contention reports busy without fetching or mutating', t => {
  const f = makeWorkspace(t);
  f.publish('incoming.txt', 'remote\n');
  const lock = path.join(f.root, '.git', 'youcoded-sync.lock');
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: 4242, acquiredAt: 'then' }));
  const before = f.capture();
  const cachedBefore = f.git(f.root, 'rev-parse', 'refs/remotes/origin/master');
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.action.status, 'busy');
  assert.equal(out.report.freshness.status, 'unknown');
  assert.deepEqual(out.report.lock.owner, { pid: 4242, acquiredAt: 'then' });
  assert.equal(f.git(f.root, 'rev-parse', 'refs/remotes/origin/master'), cachedBefore);
  assertPreserved(f, before);
  assert.ok(fs.existsSync(lock));
});

test('wrong branch and active merge refuse without changing state', t => {
  const wrong = makeWorkspace(t);
  wrong.git(wrong.root, 'checkout', '-b', 'other');
  const wrongBefore = wrong.capture();
  const wrongOut = syncWorkspace({ root: wrong.root });
  assert.equal(wrongOut.report.action.status, 'review-required');
  assert.match(wrongOut.report.action.reason, /not on symbolic branch master/);
  assertPreserved(wrong, wrongBefore);

  const merging = makeWorkspace(t);
  merging.publish('incoming.txt', 'remote\n');
  fs.writeFileSync(path.join(merging.root, '.git', 'MERGE_HEAD'), merging.git(merging.root, 'rev-parse', 'HEAD'));
  const mergeBefore = merging.capture();
  const out = syncWorkspace({ root: merging.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /active merge/);
  assertPreserved(merging, mergeBefore);
});

test('snapshot failure refuses and leaves HEAD index and files untouched', t => {
  const f = makeWorkspace(t);
  f.publish('incoming.txt', 'remote\n');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root, beforeSnapshot(directory) {
    fs.writeFileSync(path.join(directory, 'snapshot'), 'block directory creation');
  } });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /Snapshot preparation failed/);
  assertPreserved(f, before);
});

test('ignored descendants block an incoming directory-to-file replacement', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.seed, '.gitignore'), 'tree/private.txt\n');
  fs.mkdirSync(path.join(f.seed, 'tree'));
  fs.writeFileSync(path.join(f.seed, 'tree', 'tracked.txt'), 'tracked\n');
  f.git(f.seed, 'add', '.gitignore', 'tree/tracked.txt');
  f.git(f.seed, 'commit', '-m', 'tracked directory');
  f.git(f.seed, 'push', 'origin', 'master');
  f.git(f.root, 'fetch', 'origin');
  f.git(f.root, 'merge', '--ff-only', 'origin/master');
  fs.writeFileSync(path.join(f.root, 'tree', 'private.txt'), 'keep ignored\n');
  fs.rmSync(path.join(f.seed, 'tree'), { recursive: true });
  fs.writeFileSync(path.join(f.seed, 'tree'), 'replacement\n');
  f.git(f.seed, 'add', '-A', '--', 'tree');
  f.git(f.seed, 'commit', '-m', 'directory to file');
  f.git(f.seed, 'push', 'origin', 'master');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /ignored descendants/);
  assert.equal(fs.readFileSync(path.join(f.root, 'tree', 'private.txt'), 'utf8'), 'keep ignored\n');
  assertPreserved(f, before);
});

test('incoming directory/file transition is review-only and unchanged', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.seed, 'node'), 'flat\n');
  f.git(f.seed, 'add', 'node');
  f.git(f.seed, 'commit', '-m', 'add flat node');
  f.git(f.seed, 'push', 'origin', 'master');
  f.git(f.root, 'fetch', 'origin');
  f.git(f.root, 'merge', '--ff-only', 'origin/master');
  fs.rmSync(path.join(f.seed, 'node'));
  fs.mkdirSync(path.join(f.seed, 'node'));
  fs.writeFileSync(path.join(f.seed, 'node', 'child.txt'), 'nested\n');
  f.git(f.seed, 'add', '-A', '--', 'node');
  f.git(f.seed, 'commit', '-m', 'file to directory');
  f.git(f.seed, 'push', 'origin', 'master');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /file into a directory/);
  assertPreserved(f, before);
});

test('user fetch merge and reference-transaction hooks are disabled without modifying config', t => {
  const f = makeWorkspace(t);
  const hookDir = path.join(path.dirname(f.root), 'hooks');
  const mergeMarker = path.join(path.dirname(f.root), 'post-merge-ran');
  const refMarker = path.join(path.dirname(f.root), 'reference-transaction-ran');
  const fetchRefMarker = path.join(path.dirname(f.root), 'fetch-reference-transaction-ran');
  fs.mkdirSync(hookDir);
  fs.writeFileSync(path.join(hookDir, 'post-merge'), `#!/bin/sh\nprintf ran > ${JSON.stringify(mergeMarker)}\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(hookDir, 'reference-transaction'), `#!/bin/sh\ninput=$(cat)\nprintf '%s' "$input" | grep -q 'refs/youcoded-sync/' && printf ran > ${JSON.stringify(refMarker)}\nprintf '%s' "$input" | grep -q 'refs/remotes/origin/master' && printf ran > ${JSON.stringify(fetchRefMarker)}\n`, { mode: 0o755 });
  f.git(f.root, 'config', 'core.hooksPath', hookDir);
  f.publish('incoming.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.action.status, 'fast-forwarded');
  assert.equal(fs.existsSync(mergeMarker), false);
  assert.equal(fs.existsSync(refMarker), false);
  assert.equal(fs.existsSync(fetchRefMarker), false);
  assert.equal(f.git(f.root, 'config', 'core.hooksPath'), hookDir);
});

test('owner metadata write failure removes only the newly acquired sync lock', t => {
  const f = makeWorkspace(t);
  const lock = path.join(f.root, '.git', 'youcoded-sync.lock');
  assert.throws(() => syncWorkspace({ root: f.root, beforeLockOwnerWrite() {
    throw new Error('injected owner write failure');
  } }), /injected owner write failure/);
  assert.equal(fs.existsSync(lock), false);
});

test('Git failure retains snapshot and never rolls back', t => {
  const f = makeWorkspace(t);
  f.publish('incoming.txt', 'remote\n');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root, runMerge() { return { status: 1, stderr: 'injected merge failure' }; } });
  assert.equal(out.report.action.status, 'failed');
  assert.ok(fs.existsSync(out.report.evidence.snapshot));
  assert.match(out.report.action.reason, /injected merge failure/);
  assertPreserved(f, before);
});

test('same-content changed mode and staged deletion overlap are review-only', t => {
  const mode = makeWorkspace(t);
  fs.chmodSync(path.join(mode.root, 'source.txt'), 0o755);
  fs.chmodSync(path.join(mode.seed, 'source.txt'), 0o755);
  mode.git(mode.seed, 'add', 'source.txt');
  mode.git(mode.seed, 'commit', '-m', 'publish same content changed mode');
  mode.git(mode.seed, 'push', 'origin', 'master');
  const modeBefore = mode.capture();
  let out = syncWorkspace({ root: mode.root });
  assert.equal(out.report.action.status, 'review-required');
  assertPreserved(mode, modeBefore);

  const deletion = makeWorkspace(t);
  fs.rmSync(path.join(deletion.root, 'source.txt'));
  deletion.git(deletion.root, 'add', 'source.txt');
  deletion.publish('source.txt', 'incoming\n');
  const deletionBefore = deletion.capture();
  out = syncWorkspace({ root: deletion.root });
  assert.equal(out.report.action.status, 'review-required');
  assertPreserved(deletion, deletionBefore);
});

test('ignored collision and nested component collision are preserved', t => {
  const ignored = makeWorkspace(t);
  fs.writeFileSync(path.join(ignored.root, '.gitignore'), 'ignored.txt\n');
  ignored.git(ignored.root, 'add', '.gitignore');
  ignored.git(ignored.root, 'commit', '-m', 'ignore fixture');
  ignored.git(ignored.root, 'push', 'origin', 'master');
  ignored.git(ignored.seed, 'fetch', 'origin', 'master');
  ignored.git(ignored.seed, 'reset', '--hard', 'origin/master');
  fs.writeFileSync(path.join(ignored.root, 'ignored.txt'), 'local ignored\n');
  fs.writeFileSync(path.join(ignored.seed, 'ignored.txt'), 'incoming\n');
  ignored.git(ignored.seed, 'add', '-f', 'ignored.txt');
  ignored.git(ignored.seed, 'commit', '-m', 'publish ignored collision');
  ignored.git(ignored.seed, 'push', 'origin', 'master');
  const ignoredBefore = ignored.capture();
  let out = syncWorkspace({ root: ignored.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.equal(fs.readFileSync(path.join(ignored.root, 'ignored.txt'), 'utf8'), 'local ignored\n');
  assertPreserved(ignored, ignoredBefore);

  const component = makeWorkspace(t);
  fs.mkdirSync(path.join(component.root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(component.root, 'scripts', 'workspace-repos.json'), JSON.stringify({ workspace: {}, youcoded: {} }));
  component.git(component.root, 'add', 'scripts/workspace-repos.json');
  component.git(component.root, 'commit', '-m', 'component inventory');
  component.git(component.root, 'push', 'origin', 'master');
  component.git(component.seed, 'fetch', 'origin', 'master');
  component.git(component.seed, 'reset', '--hard', 'origin/master');
  fs.mkdirSync(path.join(component.root, 'youcoded'));
  fs.writeFileSync(path.join(component.root, 'youcoded', 'user.txt'), 'keep\n');
  appendCommit(component, 'youcoded/nested.txt', 'incoming\n');
  const componentBefore = component.capture();
  out = syncWorkspace({ root: component.root });
  assert.equal(out.report.action.status, 'review-required');
  assertPreserved(component, componentBefore);
});

test('slashless component root collision is review-only and untouched', t => {
  const f = makeWorkspace(t);
  fs.mkdirSync(path.join(f.root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(f.root, 'scripts', 'workspace-repos.json'), JSON.stringify({ workspace: {}, youcoded: {} }));
  f.git(f.root, 'add', 'scripts/workspace-repos.json');
  f.git(f.root, 'commit', '-m', 'component inventory');
  f.git(f.root, 'push', 'origin', 'master');
  f.git(f.seed, 'fetch', 'origin', 'master');
  f.git(f.seed, 'reset', '--hard', 'origin/master');
  fs.mkdirSync(path.join(f.root, 'youcoded'));
  fs.writeFileSync(path.join(f.root, 'youcoded', 'keep.txt'), 'keep\n');
  fs.writeFileSync(path.join(f.seed, 'youcoded'), 'incoming file\n');
  f.git(f.seed, 'add', 'youcoded');
  f.git(f.seed, 'commit', '-m', 'slashless collision');
  f.git(f.seed, 'push', 'origin', 'master');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /component root/);
  assertPreserved(f, before);
});

test('rename endpoints and an ancestor symlink are preflighted', { skip: process.platform === 'win32' }, t => {
  const renamed = makeWorkspace(t);
  fs.writeFileSync(path.join(renamed.seed, 'old.txt'), 'rename me\n');
  renamed.git(renamed.seed, 'add', 'old.txt');
  renamed.git(renamed.seed, 'commit', '-m', 'add rename source');
  renamed.git(renamed.seed, 'push', 'origin', 'master');
  renamed.git(renamed.root, 'fetch', 'origin');
  renamed.git(renamed.root, 'merge', '--ff-only', 'origin/master');
  renamed.git(renamed.seed, 'mv', 'old.txt', 'new.txt');
  renamed.git(renamed.seed, 'commit', '-m', 'rename path');
  renamed.git(renamed.seed, 'push', 'origin', 'master');
  fs.writeFileSync(path.join(renamed.root, 'new.txt'), 'local destination\n');
  const renameBefore = renamed.capture();
  let out = syncWorkspace({ root: renamed.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /new\.txt/);
  assertPreserved(renamed, renameBefore);

  const ancestor = makeWorkspace(t);
  fs.mkdirSync(path.join(ancestor.seed, 'nested'));
  fs.writeFileSync(path.join(ancestor.seed, 'nested', 'incoming.txt'), 'incoming\n');
  ancestor.git(ancestor.seed, 'add', 'nested/incoming.txt');
  ancestor.git(ancestor.seed, 'commit', '-m', 'nested incoming');
  ancestor.git(ancestor.seed, 'push', 'origin', 'master');
  fs.symlinkSync(path.dirname(ancestor.root), path.join(ancestor.root, 'nested'));
  const ancestorBefore = ancestor.capture();
  out = syncWorkspace({ root: ancestor.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /ancestor|symlink/);
  assertPreserved(ancestor, ancestorBefore);
});

test('unmerged index and incoming gitlink are review-only and preserved', t => {
  const unmerged = makeWorkspace(t);
  unmerged.publish('incoming.txt', 'remote\n');
  const blob = unmerged.git(unmerged.root, 'rev-parse', 'HEAD:source.txt');
  spawnSync('git', ['-C', unmerged.root, 'update-index', '--index-info'], { input: `100644 ${blob} 1\tsource.txt\n100644 ${blob} 2\tsource.txt\n`, encoding: 'utf8' });
  const unmergedBefore = unmerged.capture();
  let out = syncWorkspace({ root: unmerged.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /unmerged/);
  assertPreserved(unmerged, unmergedBefore);

  const gitlink = makeWorkspace(t);
  const target = gitlink.git(gitlink.seed, 'rev-parse', 'HEAD');
  spawnSync('git', ['-C', gitlink.seed, 'update-index', '--add', '--cacheinfo', `160000,${target},module`], { encoding: 'utf8' });
  gitlink.git(gitlink.seed, 'commit', '-m', 'incoming gitlink');
  gitlink.git(gitlink.seed, 'push', 'origin', 'master');
  const gitlinkBefore = gitlink.capture();
  out = syncWorkspace({ root: gitlink.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /Gitlink/);
  assertPreserved(gitlink, gitlinkBefore);
});

test('unsupported tracked modes are classified review-only', () => {
  assert.match(trackedTypeBlockers(['100664'], ['odd'])[0], /Unsupported tracked type/);
  assert.match(trackedTypeBlockers(['160000'], ['module'])[0], /Gitlink/);
  assert.match(trackedTypeBlockers(['120000'], ['link'])[0], /symlink/);
});

test('tracked symlink transition is review-only and untouched', { skip: process.platform === 'win32' }, t => {
  const f = makeWorkspace(t);
  fs.rmSync(path.join(f.seed, 'source.txt'));
  fs.symlinkSync('CLAUDE.md', path.join(f.seed, 'source.txt'));
  f.git(f.seed, 'add', 'source.txt');
  f.git(f.seed, 'commit', '-m', 'symlink transition');
  f.git(f.seed, 'push', 'origin', 'master');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.action.status, 'review-required');
  assertPreserved(f, before);
});

test('snapshot fully copies present file and symlink bytes, modes, and complete patches', { skip: process.platform === 'win32' }, t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.seed, 'second.txt'), 'published second\n');
  f.git(f.seed, 'add', 'second.txt');
  f.git(f.seed, 'commit', '-m', 'add second');
  f.git(f.seed, 'push', 'origin', 'master');
  f.git(f.root, 'fetch', 'origin');
  f.git(f.root, 'merge', '--ff-only', 'origin/master');
  fs.writeFileSync(path.join(f.seed, 'source.txt'), 'incoming source\n');
  fs.writeFileSync(path.join(f.seed, 'second.txt'), 'incoming second\n');
  f.git(f.seed, 'add', 'source.txt', 'second.txt');
  f.git(f.seed, 'commit', '-m', 'change affected files');
  f.git(f.seed, 'push', 'origin', 'master');
  fs.writeFileSync(path.join(f.root, 'unrelated.txt'), 'staged bytes\n');
  f.git(f.root, 'add', 'unrelated.txt');
  fs.writeFileSync(path.join(f.root, 'unrelated.txt'), 'unstaged bytes\n');
  const out = syncWorkspace({ root: f.root, beforeSnapshot() {
    fs.rmSync(path.join(f.root, 'second.txt'));
    fs.symlinkSync('source.txt', path.join(f.root, 'second.txt'));
  } });
  assert.equal(out.report.action.status, 'review-required');
  const snapshot = out.report.evidence.snapshot;
  const manifest = JSON.parse(fs.readFileSync(path.join(snapshot, 'paths.json'), 'utf8'));
  const file = manifest.find(item => item.path === 'source.txt');
  const link = manifest.find(item => item.path === 'second.txt');
  assert.equal(file.type, 'file');
  assert.equal(link.type, 'symlink');
  for (const item of [file, link]) {
    const copy = path.join(snapshot, 'paths', String(item.position));
    assert.equal(fs.statSync(copy).mode & 0o777, 0o600);
    assert.equal(fs.statSync(copy).nlink, 1);
  }
  assert.deepEqual(fs.readFileSync(path.join(snapshot, 'paths', String(file.position))), Buffer.from('published\n'));
  assert.deepEqual(fs.readFileSync(path.join(snapshot, 'paths', String(link.position))), Buffer.from('source.txt'));
  assert.deepEqual(fs.readFileSync(path.join(snapshot, 'staged.patch')), beforePatch(f, true));
  assert.deepEqual(fs.readFileSync(path.join(snapshot, 'unstaged.patch')), beforePatch(f, false));
});

function beforePatch(f, staged) {
  const args = ['-c', 'core.autocrlf=false', '-C', f.root, 'diff', '--binary', '--no-ext-diff', '--no-textconv'];
  if (staged) args.push('--cached');
  return spawnSync('git', args, { encoding: null }).stdout;
}

test('partial snapshot verification failure still exposes recovery evidence', t => {
  const f = makeWorkspace(t);
  f.publish('source.txt', 'incoming\n');
  const out = syncWorkspace({ root: f.root, beforeSnapshotVerify({ snapshotPath }) {
    fs.writeFileSync(path.join(snapshotPath, 'index'), 'corrupt');
  } });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /snapshot verification failed/);
  assert.ok(fs.existsSync(out.report.evidence.snapshot));
  assert.ok(out.report.evidence.recoveryRef);
  assert.equal(out.report.recoveryLocation, out.report.evidence.snapshot);
});

test('snapshot records recovery ref, absent paths, owner-only modes, and non-hardlinked copies', t => {
  const f = makeWorkspace(t);
  f.publish('incoming.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  const snapshot = out.report.evidence.snapshot;
  const manifest = JSON.parse(fs.readFileSync(path.join(snapshot, 'paths.json'), 'utf8'));
  assert.ok(manifest.some(item => item.path === 'incoming.txt' && item.type === 'absent'));
  assert.equal(f.git(f.root, 'rev-parse', out.report.evidence.recoveryRef), out.report.action.beforeHead);
  assert.equal(fs.statSync(snapshot).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(snapshot, 'index')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(snapshot, 'index')).nlink, 1);
  assert.match(fs.readFileSync(path.join(snapshot, 'RECOVERY.txt'), 'utf8'), /Do not restore automatically/);
  assert.ok(fs.existsSync(path.join(out.report.evidence.directory, 'report.md')));
});

test('report separates incoming, staged, unstaged and untracked work', t => {
  const f = makeWorkspace(t);
  f.publish('CLAUDE.md', 'new committed guidance\n');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'staged\n');
  f.git(f.root, 'add', 'source.txt');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'unstaged\n');
  fs.writeFileSync(path.join(f.root, 'new\nnotes.md'), 'proposal\n');
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.freshness.status, 'fetched');
  assert.ok(out.report.shared.incoming.length > 0);
  const edited = out.report.shared.changes.find(x => x.path === 'source.txt');
  assert.equal(edited.indexStatus, 'M');
  assert.equal(edited.worktreeStatus, 'M');
  assert.ok(out.report.shared.changes.some(x => x.path === 'new\nnotes.md'));
  assert.ok(fs.existsSync(out.reportPath));
});

test('inspection preserves HEAD, index, worktree, and untracked bytes', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'index\n');
  f.git(f.root, 'add', 'source.txt');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'worktree\n');
  fs.writeFileSync(path.join(f.root, 'loose.txt'), 'loose\n');
  const before = f.capture();
  syncWorkspace({ root: f.root });
  assert.deepEqual(f.capture(), before);
});

test('classifies unique and patch-equivalent local commits', t => {
  const unique = makeWorkspace(t);
  fs.writeFileSync(path.join(unique.root, 'local.txt'), 'unique\n');
  unique.git(unique.root, 'add', 'local.txt');
  unique.git(unique.root, 'commit', '-m', 'local unique');
  let out = syncWorkspace({ root: unique.root });
  assert.equal(out.report.shared.local[0].patchEquivalence, 'unique');

  const equivalent = makeWorkspace(t);
  fs.writeFileSync(path.join(equivalent.root, 'same.txt'), 'same patch\n');
  equivalent.git(equivalent.root, 'add', 'same.txt');
  equivalent.git(equivalent.root, 'commit', '-m', 'local version');
  equivalent.publish('same.txt', 'same patch\n');
  out = syncWorkspace({ root: equivalent.root });
  assert.equal(out.report.shared.local[0].patchEquivalence, 'equivalent');
});

test('reports a preserved session separately from shared state', t => {
  const f = makeWorkspace(t);
  const session = path.join(path.dirname(f.root), 'session');
  f.git(f.root, 'worktree', 'add', '-b', 'session/test', session);
  fs.writeFileSync(path.join(session, 'session.txt'), 'preserved\n');
  f.git(session, 'add', 'session.txt');
  f.git(session, 'commit', '-m', 'session commit');
  fs.writeFileSync(path.join(session, 'unfinished.txt'), 'unfinished\n');
  f.publish('CLAUDE.md', 'newer guidance\n');
  const out = syncWorkspace({ root: f.root, sessionRoot: session });
  assert.equal(out.report.session.local[0].subject, 'session commit');
  assert.ok(out.report.session.incoming.some(commit => commit.subject.includes('CLAUDE.md')));
  assert.ok(out.report.session.changes.some(change => change.path === 'unfinished.txt'));
  assert.match(out.briefing, /inspect without silently integrating/);
});

test('offline and missing remotes leave freshness unknown with stale evidence labeled', t => {
  for (const removeRemote of [false, true]) {
    const f = makeWorkspace(t);
    if (removeRemote) f.git(f.root, 'remote', 'remove', 'origin');
    else f.git(f.root, 'remote', 'set-url', 'origin', path.join(path.dirname(f.remote), 'absent.git'));
    const out = syncWorkspace({ root: f.root });
    assert.equal(out.report.freshness.status, 'unknown');
    assert.equal(out.report.action.status, 'offline');
    assert.ok(out.report.blockers.length > 0);
    assert.match(out.briefing, /unknown/);
  }
});

test('rejects unsupported branch arguments before mutation and reports a checked-out wrong branch', t => {
  const f = makeWorkspace(t);
  const reports = path.join(f.root, '.git', 'youcoded-sync');
  assert.throws(() => syncWorkspace({ root: f.root, branch: 'main' }), /only master/);
  assert.equal(fs.existsSync(reports), false);
  f.git(f.root, 'checkout', '-b', 'other');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.action.status, 'review-required');
  assert.match(out.report.action.reason, /not on symbolic branch master/);
  assertPreserved(f, before);
});

test('represents unrelated histories rather than crashing', t => {
  const f = makeWorkspace(t);
  f.git(f.seed, 'checkout', '--orphan', 'replacement');
  f.git(f.seed, 'rm', '-rf', '.');
  fs.writeFileSync(path.join(f.seed, 'replacement.txt'), 'new root\n');
  f.git(f.seed, 'add', 'replacement.txt');
  f.git(f.seed, 'commit', '-m', 'replacement history');
  f.git(f.seed, 'push', '--force', 'origin', 'replacement:master');
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.shared.relation, 'unrelated');
  assert.equal(out.report.shared.mergeBase, null);
  assert.ok(out.report.shared.incoming.some(commit => commit.subject === 'replacement history'));
});

test('accounts for renamed, deleted, binary, spaced, tabbed, and newline paths', t => {
  const f = makeWorkspace(t);
  f.publish('docs/old guidance.md', 'old\n');
  f.git(f.seed, 'mv', 'docs/old guidance.md', 'docs/new\tguidance.md');
  f.git(f.seed, 'commit', '-m', 'rename guidance');
  f.git(f.seed, 'push', 'origin', 'master');
  f.publish('CLAUDE.md', null);
  f.publish('binary.dat', Buffer.from([0, 1, 2, 255]));
  fs.writeFileSync(path.join(f.root, 'local space.txt'), 'space\n');
  fs.writeFileSync(path.join(f.root, 'local\ttab.txt'), 'tab\n');
  fs.writeFileSync(path.join(f.root, 'local\nline.txt'), 'line\n');
  const out = syncWorkspace({ root: f.root });
  const incomingPaths = out.report.shared.incoming.flatMap(commit => commit.paths);
  assert.ok(incomingPaths.some(item => item.status === 'R' && item.originalPath === 'docs/old guidance.md' && item.path === 'docs/new\tguidance.md'));
  assert.ok(incomingPaths.some(item => item.status === 'D' && item.path === 'CLAUDE.md'));
  assert.ok(incomingPaths.some(item => item.path === 'binary.dat'));
  for (const name of ['local space.txt', 'local\ttab.txt', 'local\nline.txt']) assert.ok(out.report.shared.changes.some(item => item.path === name));
  const committedDiff = fs.readFileSync(out.report.shared.diffs.committed.path);
  assert.ok(committedDiff.length > 0);
  assert.match(committedDiff.toString('latin1'), /GIT binary patch/);
});

test('records untracked lstat metadata without following symlinks', t => {
  const f = makeWorkspace(t);
  const outside = path.join(path.dirname(f.root), 'outside-secret');
  fs.writeFileSync(outside, 'do not read this target\n');
  fs.writeFileSync(path.join(f.root, 'plain.txt'), '12345');
  fs.symlinkSync(outside, path.join(f.root, 'link.txt'));
  const out = syncWorkspace({ root: f.root });
  const plain = out.report.shared.changes.find(item => item.path === 'plain.txt').metadata;
  const link = out.report.shared.changes.find(item => item.path === 'link.txt').metadata;
  assert.deepEqual({ type: plain.type, size: plain.size }, { type: 'file', size: 5 });
  assert.equal(link.type, 'symlink');
  assert.equal(link.linkTarget, outside);
  assert.notEqual(link.size, fs.statSync(outside).size);
  assert.doesNotMatch(JSON.stringify(out.report), /do not read this target/);
});

test('flags unsupported pathname encodings instead of omitting the path', { skip: process.platform === 'win32' }, t => {
  const f = makeWorkspace(t);
  fs.mkdirSync(path.join(f.root, '.claude'));
  const raw = Buffer.concat([Buffer.from(`${f.root}/.claude/bad-`), Buffer.from([0xff])]);
  fs.writeFileSync(raw, 'raw\n');
  const out = syncWorkspace({ root: f.root });
  const change = out.report.shared.changes.find(item => item.pathnameEncoding === 'unsupported');
  assert.ok(change);
  const guidance = out.report.guidance.find(item => item.scope === 'shared-working' && item.pathBytesBase64 === change.pathBytesBase64);
  assert.equal(guidance?.authority, 'uncommitted-proposal');
  assert.equal(Buffer.from(guidance.pathBytesBase64, 'base64').equals(Buffer.from('.claude/bad-\xff', 'latin1')), true);
});

test('persists owner-only complete large diffs while keeping briefing bounded and prioritized', t => {
  const f = makeWorkspace(t);
  const large = `${'abcdefghij'.repeat(130_000)}\n`;
  fs.writeFileSync(path.join(f.root, 'source.txt'), large);
  f.git(f.root, 'add', 'source.txt');
  for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(f.root, `z-${i}.txt`), `${i}\n`);
  fs.mkdirSync(path.join(f.root, '.claude'));
  fs.writeFileSync(path.join(f.root, '.claude', 'rule.md'), 'proposal\n');
  const out = syncWorkspace({ root: f.root });
  assert.ok(out.report.shared.diffs.staged.bytes > 1024 * 1024);
  assert.equal(fs.readFileSync(out.report.shared.diffs.staged.path).length, out.report.shared.diffs.staged.bytes);
  assert.equal(fs.statSync(out.reportPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(out.reportPath)).mode & 0o777, 0o700);
  for (const diff of Object.values(out.report.shared.diffs)) assert.equal(fs.statSync(diff.path).mode & 0o777, 0o600);
  assert.ok(out.briefing.indexOf('.claude/rule.md') < out.briefing.indexOf('z-0.txt'));
  assert.match(out.briefing, /more in report/);
  assert.ok(out.briefing.length < 3000);
  assert.equal(out.report.shared.changes.length, 22);
});

test('large status and committed path inventories exceed Node default buffers without truncation', t => {
  const f = makeWorkspace(t);
  const paths = [];
  for (let i = 0; i < 14_000; i++) {
    const name = `bulk/${String(i).padStart(5, '0')}-${'x'.repeat(70)}.txt`;
    paths.push(name);
    const target = path.join(f.seed, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'x');
  }
  f.git(f.seed, 'add', 'bulk');
  f.git(f.seed, 'commit', '-m', 'large incoming inventory');
  f.git(f.seed, 'push', 'origin', 'master');
  for (const name of paths) {
    const target = path.join(f.root, `local-${path.basename(name)}`);
    fs.writeFileSync(target, 'x');
  }
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.shared.incoming[0]?.paths.length, paths.length, JSON.stringify(out.report.action));
  assert.equal(out.report.shared.changes.length, paths.length);
});

test('briefing identifies session-relative incoming and local guidance', t => {
  const f = makeWorkspace(t);
  const session = path.join(path.dirname(f.root), 'session');
  f.git(f.root, 'worktree', 'add', '-b', 'session/guidance', session);
  fs.mkdirSync(path.join(session, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(session, '.claude', 'local-rule.md'), 'local proposal\n');
  f.git(session, 'add', '.claude/local-rule.md');
  f.git(session, 'commit', '-m', 'session local guidance');
  f.publish('AGENTS.md', 'new incoming guidance\n');
  const out = syncWorkspace({ root: f.root, sessionRoot: session });
  assert.match(out.briefing, /Session incoming guidance:[^\n]*AGENTS\.md/);
  assert.doesNotMatch(out.briefing, /Session incoming guidance:[^\n]*local-rule/);
  assert.match(out.briefing, /Session-local guidance:[^\n]*\.claude\/local-rule\.md/);
});

test('report guidance contract covers committed and proposed shared/session paths with rename identity', t => {
  const f = makeWorkspace(t);
  f.publish('docs/old\tguide.md', 'old\n');
  f.git(f.seed, 'mv', 'docs/old\tguide.md', 'docs/new\n guide.md');
  f.git(f.seed, 'commit', '-m', 'rename incoming guidance');
  f.git(f.seed, 'push', 'origin', 'master');
  f.publish('AGENTS.md', 'guidance to delete\n');
  f.publish('AGENTS.md', null);
  fs.mkdirSync(path.join(f.root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(f.root, '.claude', 'shared-local.md'), 'shared committed\n');
  f.git(f.root, 'add', '.claude/shared-local.md');
  f.git(f.root, 'commit', '-m', 'shared local guidance');
  fs.mkdirSync(path.join(f.root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(f.root, 'docs', 'shared proposal.md'), 'proposal\n');

  const session = path.join(path.dirname(f.root), 'guidance-session');
  f.git(f.root, 'worktree', 'add', '-b', 'session/guidance-contract', session);
  fs.mkdirSync(path.join(session, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(session, '.claude', 'session-local.md'), 'session committed\n');
  f.git(session, 'add', '.claude/session-local.md');
  f.git(session, 'commit', '-m', 'session local guidance');
  fs.mkdirSync(path.join(session, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(session, 'scripts', 'session proposal.mjs'), 'proposal\n');

  const out = syncWorkspace({ root: f.root, sessionRoot: session });
  const guidance = JSON.parse(fs.readFileSync(out.reportPath, 'utf8')).guidance;
  assert.ok(guidance.some(item => item.scope === 'shared-incoming' && item.authority === 'committed' && item.status === 'R' && item.path === 'docs/new\n guide.md' && item.originalPath === 'docs/old\tguide.md'));
  assert.ok(guidance.some(item => item.scope === 'shared-incoming' && item.authority === 'committed' && item.status === 'D' && item.path === 'AGENTS.md'));
  assert.ok(guidance.some(item => item.scope === 'shared-local' && item.authority === 'committed' && item.path === '.claude/shared-local.md'));
  assert.ok(guidance.some(item => item.scope === 'shared-working' && item.authority === 'uncommitted-proposal' && item.path === 'docs/shared proposal.md'));
  assert.ok(guidance.some(item => item.scope === 'session-incoming' && item.authority === 'committed' && item.path === 'docs/new\n guide.md'));
  assert.ok(guidance.some(item => item.scope === 'session-local' && item.authority === 'committed' && item.path === '.claude/session-local.md'));
  assert.ok(guidance.some(item => item.scope === 'session-working' && item.authority === 'uncommitted-proposal' && item.path === 'scripts/session proposal.mjs'));
  assert.deepEqual(new Set(guidance.map(item => item.authority)), new Set(['committed', 'uncommitted-proposal']));
});

test('briefing prioritizes both endpoints when guidance is renamed', () => {
  const report = {
    freshness: { status: 'fetched', fetchedOid: 'a'.repeat(40) },
    reportPath: '/tmp/report.json',
    shared: {
      relation: 'related', local: [], changes: [],
      incoming: [{ paths: [{ status: 'R', originalPath: 'CLAUDE.md', path: 'misc/renamed.txt' }] }],
    },
  };
  const briefing = formatBriefing(report);
  assert.match(briefing, /CLAUDE\.md/);
  assert.match(briefing, /misc\/renamed\.txt/);
});

test('report schema always includes recovery and candidate locations', t => {
  const f = makeWorkspace(t);
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.recoveryLocation, null);
  assert.equal(out.report.candidateLocation, null);
  assert.equal(out.report.shared.recoveryLocation, null);
  assert.equal(out.report.shared.candidateLocation, null);
});

test('parses staged and worktree renames with Git porcelain two-path order', t => {
  const staged = makeWorkspace(t);
  staged.git(staged.root, 'mv', 'source.txt', 'staged renamed.txt');
  let out = syncWorkspace({ root: staged.root });
  let rename = out.report.shared.changes.find(change => change.indexStatus === 'R');
  assert.equal(rename.path, 'staged renamed.txt');
  assert.equal(rename.originalPath, 'source.txt');

  // Pin worktree-column rename two-path order independently of Git's version-specific rename heuristic.
  [rename] = parseStatusInventory(Buffer.from(' R worktree renamed.txt\0source.txt\0'));
  assert.equal(rename.indexStatus, ' ');
  assert.equal(rename.worktreeStatus, 'R');
  assert.equal(rename.path, 'worktree renamed.txt');
  assert.equal(rename.originalPath, 'source.txt');
});

test('unsupported path bytes retain reversible identity and byte-safe lstat metadata', { skip: process.platform === 'win32' }, t => {
  const f = makeWorkspace(t);
  fs.mkdirSync(path.join(f.root, '.claude'));
  const relative = Buffer.concat([Buffer.from('.claude/raw-'), Buffer.from([0xff, 0xfe])]);
  const absolute = Buffer.concat([Buffer.from(`${f.root}/`), relative]);
  fs.writeFileSync(absolute, 'raw\n', { mode: 0o640 });
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  const item = out.report.shared.changes.find(change => change.pathnameEncoding === 'unsupported');
  assert.deepEqual(Buffer.from(item.pathBytesBase64, 'base64'), relative);
  assert.deepEqual(item.metadata, { type: 'file', size: 4, mode: 0o640 });
  const guidance = JSON.parse(fs.readFileSync(out.reportPath, 'utf8')).guidance.find(entry => entry.pathnameEncoding === 'unsupported');
  assert.equal(guidance.scope, 'shared-working');
  assert.equal(guidance.authority, 'uncommitted-proposal');
  assert.deepEqual(Buffer.from(guidance.pathBytesBase64, 'base64'), relative);
  assert.deepEqual(f.capture(), before);
  const captured = before.files.find(file => file.pathBytes.equals(relative));
  assert.equal(captured.type, 'file');
  assert.equal(captured.mode & 0o777, 0o640);
  assert.deepEqual(captured.bytes, Buffer.from('raw\n'));
});

test('custom fetch timeout is honored in timeout diagnostics', t => {
  const f = makeWorkspace(t);
  const out = syncWorkspace({ root: f.root, fetchTimeoutMs: -1 });
  assert.equal(out.report.action.status, 'offline');
  assert.match(out.report.freshness.detail, /-1 ms/);
});

test('failed fetch marks a cached remote OID as stale evidence only', t => {
  const f = makeWorkspace(t);
  const cached = f.git(f.root, 'rev-parse', 'refs/remotes/origin/master');
  f.git(f.root, 'remote', 'set-url', 'origin', path.join(path.dirname(f.remote), 'offline.git'));
  const out = syncWorkspace({ root: f.root });
  assert.deepEqual(out.report.freshness, {
    status: 'unknown', remoteOid: null, fetchedOid: null, cachedOid: cached, staleEvidence: true,
    detail: out.report.freshness.detail,
  });
  assert.notEqual(out.report.freshness.detail, '');
});

test('briefing bounds variable content while retaining the full absolute report path and next steps', () => {
  const huge = `CLAUDE-${'😀'.repeat(10_000)}.md`;
  const reportPath = `/tmp/${'long-valid-root/'.repeat(500)}report.json`;
  const report = {
    freshness: { status: 'unknown', fetchedOid: null, detail: 'failure '.repeat(10_000) },
    reportPath,
    shared: { relation: 'related', local: [], incoming: [{ paths: [{ path: huge, status: 'M' }] }], changes: [] },
  };
  const briefing = formatBriefing(report);
  const requiredBytes = Buffer.byteLength(`\n… more in report\nComplete private report: ${reportPath}\nInspect relevant diffs, explain major changes, and reread authoritative guidance from the returned workspace.`);
  assert.ok(Buffer.byteLength(briefing, 'utf8') <= 4096 + requiredBytes);
  assert.ok(briefing.includes(`Complete private report: ${reportPath}`));
  assert.match(briefing, /more in report/);
  assert.match(briefing, /inspect relevant diffs/i);
  assert.match(briefing, /explain major changes/i);
  assert.match(briefing, /reread authoritative guidance/i);
});

test('briefing escapes control characters in every displayed shared and session path', () => {
  const hostile = 'docs/line\nrow\ttab\rcarriage\u001b[31mred\u0007bell.md';
  const oldHostile = 'CLAUDE\nOLD\u001b]0;title\u0007.md';
  const report = {
    freshness: { status: 'fetched', fetchedOid: 'a'.repeat(40) }, reportPath: '/tmp/report.json',
    shared: {
      relation: 'related', local: [],
      incoming: [{ paths: [{ path: hostile, originalPath: oldHostile, status: 'R' }] }],
      changes: [{ path: hostile, indexStatus: '?', worktreeStatus: '?', category: 'untracked' }],
    },
    session: {
      incoming: [{ paths: [{ path: `.claude/incoming-${hostile}` }] }],
      local: [{ paths: [{ path: `.claude/${hostile}` }] }],
      changes: [{ path: `scripts/${hostile}` }],
    },
  };
  const briefing = formatBriefing(report);
  assert.equal(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(briefing), false);
  assert.equal(briefing.includes('\nrow'), false);
  assert.equal(briefing.includes('\ttab'), false);
  assert.equal(briefing.includes('\rcarriage'), false);
  assert.match(briefing, /docs\/line\\nrow\\ttab\\rcarriage\\x1b\[31mred\\x07bell\.md/);
  assert.match(briefing, /CLAUDE\\nOLD\\x1b\]0;title\\x07\.md/);
  assert.match(briefing, /Session incoming guidance:[^\n]*\.claude\/incoming-docs\/line\\n/);
  assert.match(briefing, /Session-local guidance:[^\n]*\.claude\//);
});

test('persists complete staged and unstaged binary diffs', t => {
  const f = makeWorkspace(t);
  f.publish('binary.bin', Buffer.from([0, 1, 2, 3]));
  f.git(f.root, 'fetch', 'origin');
  f.git(f.root, 'merge', '--ff-only', 'origin/master');
  fs.writeFileSync(path.join(f.root, 'binary.bin'), Buffer.from([0, 10, 20, 30, 40]));
  f.git(f.root, 'add', 'binary.bin');
  fs.writeFileSync(path.join(f.root, 'binary.bin'), Buffer.from([0, 50, 60, 70, 80]));
  const out = syncWorkspace({ root: f.root });
  const staged = fs.readFileSync(out.report.shared.diffs.staged.path, 'latin1');
  const unstaged = fs.readFileSync(out.report.shared.diffs.unstaged.path, 'latin1');
  assert.match(staged, /GIT binary patch/);
  assert.match(unstaged, /GIT binary patch/);
  assert.equal(Buffer.byteLength(staged, 'latin1'), out.report.shared.diffs.staged.bytes);
  assert.equal(Buffer.byteLength(unstaged, 'latin1'), out.report.shared.diffs.unstaged.bytes);
});

test('final recheck refuses same-HEAD branch and active-operation races', t => {
  for (const race of ['branch', 'operation']) {
    const f = makeWorkspace(t);
    f.publish('incoming.txt', 'remote\n');
    const before = f.capture();
    const out = syncWorkspace({ root: f.root, beforeApply() {
      if (race === 'branch') f.git(f.root, 'checkout', '-b', 'raced');
      else fs.writeFileSync(path.join(f.root, '.git', 'CHERRY_PICK_HEAD'), before.head);
    } });
    assert.equal(out.report.action.status, 'review-required');
    assert.notEqual(f.git(f.root, 'rev-parse', 'HEAD'), out.report.freshness.remoteOid);
    assert.match(out.report.action.reason, /changed during preparation/);
  }
});

test('already-current uncertain states still run preflight', t => {
  for (const state of ['wrong-branch', 'merge', 'rebase', 'cherry-pick', 'revert', 'bisect', 'sparse']) {
    const f = makeWorkspace(t);
    if (state === 'wrong-branch') f.git(f.root, 'checkout', '-b', 'other');
    else if (state === 'sparse') f.git(f.root, 'config', 'core.sparseCheckout', 'true');
    else {
      const markers = { merge: 'MERGE_HEAD', rebase: 'rebase-merge', 'cherry-pick': 'CHERRY_PICK_HEAD', revert: 'REVERT_HEAD', bisect: 'BISECT_LOG' };
      const marker = path.join(f.root, '.git', markers[state]);
      if (state === 'rebase') fs.mkdirSync(marker);
      else fs.writeFileSync(marker, f.git(f.root, 'rev-parse', 'HEAD'));
    }
    const out = syncWorkspace({ root: f.root });
    assert.equal(out.report.action.status, 'review-required', state);
  }
});

test('an exception after merge starts is failed and refreshes exact resulting inspection', t => {
  const f = makeWorkspace(t);
  f.publish('incoming.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root, runMerge({ remoteOid }) {
    f.git(f.root, 'update-ref', 'HEAD', remoteOid);
    throw new Error('failure after mutation');
  } });
  assert.equal(out.report.action.status, 'failed');
  assert.equal(out.report.action.afterHead, f.git(f.root, 'rev-parse', 'HEAD'));
  assert.equal(out.report.shared.head, out.report.action.afterHead);
  assert.equal(out.report.shared.incoming.length, 0);
  assert.match(out.report.action.reason, /failure after mutation/);
  assert.ok(fs.existsSync(out.report.evidence.snapshot));
});

function candidateManifest(out) {
  assert.ok(out.report.evidence.candidate, 'candidate evidence path');
  assert.equal(out.report.candidateLocation, out.report.evidence.candidate);
  return JSON.parse(fs.readFileSync(path.join(out.report.evidence.candidate, 'candidate.json'), 'utf8'));
}

function candidateFile(out, relativePath, encoding = 'utf8') {
  return fs.readFileSync(path.join(out.report.evidence.candidate, 'repo', relativePath), encoding);
}

function refs(f, repository = f.root) {
  return f.git(repository, 'for-each-ref', '--format=%(refname) %(objectname)');
}

test('candidate merges nonoverlapping textual hunks without touching shared layers', t => {
  const f = makeWorkspace(t);
  f.publish('overlap.txt', 'one\ntwo\nthree\nfour\nfive\n');
  f.git(f.root, 'fetch', 'origin');
  f.git(f.root, 'merge', '--ff-only', 'origin/master');
  fs.writeFileSync(path.join(f.root, 'overlap.txt'), 'ONE\ntwo\nthree\nfour\nfive\n');
  f.git(f.root, 'add', 'overlap.txt');
  f.publish('overlap.txt', 'one\ntwo\nthree\nfour\nFIVE\n');
  f.git(f.root, 'fetch', '--no-tags', 'origin', '+refs/heads/master:refs/remotes/origin/master');
  const before = f.capture();
  const refsBefore = refs(f);
  const remoteRefsBefore = f.git(f.root, 'for-each-ref', 'refs/remotes', '--format=%(refname) %(objectname)');
  const publishedRefsBefore = f.git(f.remote, 'for-each-ref', '--format=%(refname) %(objectname)');
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(out.report.action.status, 'review-required');
  assert.equal(manifest.status, 'clean');
  assert.equal(manifest.notice, 'requires semantic review; not applied');
  assert.equal(candidateFile(out, 'overlap.txt'), 'ONE\ntwo\nthree\nfour\nFIVE\n');
  const candidateRepo = path.join(out.report.evidence.candidate, 'repo');
  assert.match(fs.readFileSync(path.join(candidateRepo, '.git', 'HEAD'), 'utf8'), /^[0-9a-f]{40}\n$/);
  assert.equal(f.git(candidateRepo, 'remote'), '');
  assert.equal(f.git(candidateRepo, 'rev-parse', 'HEAD'), out.report.freshness.fetchedOid);
  assert.equal(f.git(candidateRepo, 'rev-list', '--all'), f.git(f.root, 'rev-list', out.report.freshness.fetchedOid));
  assert.deepEqual(f.capture(), before);
  assert.equal(f.git(f.root, 'for-each-ref', 'refs/remotes', '--format=%(refname) %(objectname)'), remoteRefsBefore);
  assert.equal(f.git(f.remote, 'for-each-ref', '--format=%(refname) %(objectname)'), publishedRefsBefore);
  const addedRefs = refs(f).split('\n').filter(line => !line.startsWith('refs/remotes/') && !refsBefore.split('\n').includes(line));
  assert.deepEqual(addedRefs, [`${out.report.evidence.recoveryRef} ${before.head}`]);
});

test('candidate contains conflicting hunks only in its standalone repository', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'local\n');
  f.git(f.root, 'add', 'source.txt');
  f.publish('source.txt', 'remote\n');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(manifest.status, 'partial');
  assert.equal(manifest.layers.find(layer => layer.name === 'staged').status, 'conflict');
  assert.ok(f.git(path.join(out.report.evidence.candidate, 'repo'), 'ls-files', '-u').length > 0);
  assert.deepEqual(f.capture(), before);
});

test('exact-current local copy remains review evidence rather than being normalized', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'remote\n');
  f.git(f.root, 'add', 'source.txt');
  f.publish('source.txt', 'remote\n');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(manifest.layers.find(layer => layer.name === 'staged').status, 'already-present');
  assert.equal(candidateFile(out, 'source.txt'), 'remote\n');
  assert.deepEqual(f.capture(), before);
});

test('matching-historical local copy is retained as an intentional-looking conflict', t => {
  const f = makeWorkspace(t);
  f.publish('source.txt', 'middle\n');
  f.git(f.root, 'fetch', 'origin');
  f.git(f.root, 'merge', '--ff-only', 'origin/master');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'published\n');
  f.git(f.root, 'add', 'source.txt');
  f.publish('source.txt', 'remote\n');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(manifest.status, 'partial');
  assert.equal(manifest.layers.find(layer => layer.name === 'staged').status, 'conflict');
  assert.deepEqual(f.capture(), before);
});

test('candidate layers unique local commits then staged and unstaged patches', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'local.txt'), 'committed\n');
  f.git(f.root, 'add', 'local.txt');
  f.git(f.root, 'commit', '-m', 'local unique');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'staged\n');
  f.git(f.root, 'add', 'source.txt');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'unstaged\n');
  f.publish('remote.txt', 'remote\n');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.deepEqual(manifest.layers.map(layer => [layer.name, layer.status]), [
    ['local-committed', 'applied'], ['staged', 'applied'], ['unstaged', 'applied'],
  ]);
  assert.equal(candidateFile(out, 'local.txt'), 'committed\n');
  assert.equal(candidateFile(out, 'source.txt'), 'unstaged\n');
  assert.deepEqual(f.capture(), before);
});

test('patch-equivalent local commit is explicitly already present in candidate', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'same.txt'), 'same\n');
  f.git(f.root, 'add', 'same.txt');
  f.git(f.root, 'commit', '-m', 'local same');
  f.publish('same.txt', 'same\n');
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(out.report.shared.local[0].patchEquivalence, 'equivalent');
  assert.equal(manifest.layers[0].status, 'already-present');
  assert.equal(candidateFile(out, 'same.txt'), 'same\n');
});

test('binary conflict, rename and deletion are retained in candidate evidence', t => {
  const f = makeWorkspace(t);
  f.publish('binary.bin', Buffer.from([0, 1, 2]));
  f.publish('rename.txt', 'rename\n');
  f.publish('delete.txt', 'delete\n');
  f.git(f.root, 'fetch', 'origin');
  f.git(f.root, 'merge', '--ff-only', 'origin/master');
  fs.writeFileSync(path.join(f.root, 'binary.bin'), Buffer.from([0, 3, 4]));
  f.git(f.root, 'mv', 'rename.txt', 'renamed-local.txt');
  fs.rmSync(path.join(f.root, 'delete.txt'));
  f.git(f.root, 'add', '-A');
  f.publish('binary.bin', Buffer.from([0, 8, 9]));
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(manifest.status, 'partial');
  assert.match(manifest.layers.find(layer => layer.status === 'conflict').detail, /binary|patch|apply/i);
  assert.ok(fs.existsSync(path.join(out.report.evidence.candidate, 'inputs', 'staged.patch')));
  assert.deepEqual(f.capture(), before);
});

test('unrelated history produces evidence-only candidate with no invented merge', t => {
  const f = makeWorkspace(t);
  f.git(f.seed, 'checkout', '--orphan', 'replacement');
  f.git(f.seed, 'rm', '-rf', '.');
  fs.writeFileSync(path.join(f.seed, 'replacement.txt'), 'new root\n');
  f.git(f.seed, 'add', 'replacement.txt');
  f.git(f.seed, 'commit', '-m', 'replacement history');
  f.git(f.seed, 'push', '--force', 'origin', 'replacement:master');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(manifest.status, 'evidence-only');
  assert.match(manifest.blockers.join(' '), /common ancestor/i);
  assert.equal(fs.existsSync(path.join(out.report.evidence.candidate, 'repo')), false);
  assert.deepEqual(f.capture(), before);
});

test('candidate stops after first conflicting layer and retains later unapplied input', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'local.txt'), 'committed\n');
  f.git(f.root, 'add', 'local.txt');
  f.git(f.root, 'commit', '-m', 'local clean layer');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'staged conflict\n');
  f.git(f.root, 'add', 'source.txt');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'unstaged later\n');
  f.publish('source.txt', 'remote conflict\n');
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.deepEqual(manifest.layers.map(layer => layer.status), ['applied', 'conflict', 'not-attempted']);
  assert.ok(fs.statSync(path.join(out.report.evidence.candidate, 'inputs', 'unstaged.patch')).size > 0);
  assert.equal(candidateFile(out, 'local.txt'), 'committed\n');
});

test('candidate failure retains report inputs and fetched OID for a fresh invocation', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'local\n');
  f.git(f.root, 'add', 'source.txt');
  f.publish('source.txt', 'remote\n');
  const first = syncWorkspace({ root: f.root, beforeCandidate() { throw new Error('injected candidate failure'); } });
  assert.equal(first.report.action.status, 'review-required');
  assert.ok(fs.existsSync(first.reportPath));
  assert.match(first.report.blockers.join(' '), /candidate preparation failed/i);
  const second = syncWorkspace({ root: f.root });
  assert.equal(second.report.freshness.fetchedOid, first.report.freshness.fetchedOid);
  assert.ok(second.report.evidence.candidate);
});

test('untracked collision bytes stay outside the candidate tracked tree', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'incoming.txt'), 'private local bytes\n');
  f.publish('incoming.txt', 'published bytes\n');
  const before = f.capture();
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  const collisions = JSON.parse(fs.readFileSync(path.join(out.report.evidence.candidate, 'inputs', 'untracked-collisions.json'), 'utf8'));
  assert.equal(manifest.status, 'clean');
  assert.equal(candidateFile(out, 'incoming.txt'), 'published bytes\n');
  assert.equal(collisions.length, 1);
  assert.equal(fs.readFileSync(collisions[0].bytes, 'utf8'), 'private local bytes\n');
  assert.equal(collisions[0].evidenceOnly, true);
  assert.deepEqual(f.capture(), before);
});

test('nested untracked collision descendants are captured once for directory-to-file review evidence', { skip: process.platform === 'win32' }, t => {
  const f = makeWorkspace(t);
  const nested = path.join(f.root, 'incoming', 'nested.txt');
  const outside = path.join(path.dirname(f.root), 'outside-secret');
  fs.mkdirSync(path.dirname(nested));
  fs.writeFileSync(nested, 'captured nested bytes\n', { mode: 0o640 });
  fs.writeFileSync(outside, 'must never be captured\n');
  f.publish('incoming', 'published file\n');
  const out = syncWorkspace({ root: f.root, beforeSnapshotVerify() {
    fs.rmSync(nested);
    fs.symlinkSync(outside, nested);
  } });
  const candidate = out.report.evidence.candidate;
  const collisions = JSON.parse(fs.readFileSync(path.join(candidate, 'inputs', 'untracked-collisions.json'), 'utf8'));
  const item = collisions.find(collision => collision.path === 'incoming/nested.txt');
  assert.ok(item);
  assert.equal(item.capture.type, 'file');
  assert.equal(item.capture.mode, 0o640);
  assert.equal(fs.readFileSync(item.bytes, 'utf8'), 'captured nested bytes\n');
  assert.doesNotMatch(fs.readFileSync(out.reportPath, 'utf8'), /must never be captured/);
  const snapshotManifest = JSON.parse(fs.readFileSync(path.join(out.report.evidence.snapshot, 'paths.json'), 'utf8'));
  assert.ok(snapshotManifest.some(entry => entry.path === 'incoming/nested.txt' && entry.type === 'file' && entry.mode === 0o640));
});

test('untracked evidence uses captured bytes if the live path is swapped to a symlink', { skip: process.platform === 'win32' }, t => {
  const f = makeWorkspace(t);
  const outside = path.join(path.dirname(f.root), 'outside-secret');
  fs.writeFileSync(outside, 'must never be captured\n');
  fs.writeFileSync(path.join(f.root, 'incoming.txt'), 'captured local bytes\n');
  f.publish('incoming.txt', 'published bytes\n');
  const out = syncWorkspace({ root: f.root, beforeSnapshotVerify() {
    fs.rmSync(path.join(f.root, 'incoming.txt'));
    fs.symlinkSync(outside, path.join(f.root, 'incoming.txt'));
  } });
  const collisions = JSON.parse(fs.readFileSync(path.join(out.report.evidence.candidate, 'inputs', 'untracked-collisions.json'), 'utf8'));
  assert.equal(fs.readFileSync(collisions[0].bytes, 'utf8'), 'captured local bytes\n');
  assert.doesNotMatch(fs.readFileSync(out.reportPath, 'utf8'), /must never be captured/);
  assert.equal(collisions[0].capture.type, 'file');
});

test('large patches and unsafe tracked or index types are evidence-only', { skip: process.platform === 'win32' }, t => {
  const large = makeWorkspace(t);
  fs.writeFileSync(path.join(large.root, 'source.txt'), `${'local-large-line\n'.repeat(1_100_000)}`);
  large.git(large.root, 'add', 'source.txt');
  large.publish('source.txt', 'remote\n');
  let out = syncWorkspace({ root: large.root });
  let manifest = candidateManifest(out);
  assert.equal(manifest.status, 'evidence-only');
  assert.match(manifest.blockers.join(' '), /exceeds|large/i);
  assert.equal(fs.existsSync(path.join(out.report.evidence.candidate, 'repo')), false);

  const stagedLink = makeWorkspace(t);
  fs.rmSync(path.join(stagedLink.root, 'source.txt'));
  fs.symlinkSync('CLAUDE.md', path.join(stagedLink.root, 'source.txt'));
  stagedLink.git(stagedLink.root, 'add', 'source.txt');
  stagedLink.publish('source.txt', 'remote\n');
  out = syncWorkspace({ root: stagedLink.root });
  manifest = candidateManifest(out);
  assert.equal(manifest.status, 'evidence-only');
  assert.match(manifest.blockers.join(' '), /unsafe.*tracked|symlink/i);

  const committedLink = makeWorkspace(t);
  fs.writeFileSync(path.join(committedLink.root, 'local-link-target'), 'target\n');
  fs.symlinkSync('local-link-target', path.join(committedLink.root, 'local-link'));
  committedLink.git(committedLink.root, 'add', 'local-link-target', 'local-link');
  committedLink.git(committedLink.root, 'commit', '-m', 'local tracked symlink');
  committedLink.publish('remote.txt', 'remote\n');
  out = syncWorkspace({ root: committedLink.root });
  manifest = candidateManifest(out);
  assert.equal(manifest.status, 'evidence-only');
  assert.match(manifest.blockers.join(' '), /unsafe.*tracked|symlink/i);
});

test('candidate persists an operable safety wrapper and refuses hooks signing drivers and pushes', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'local.txt'), 'local\n');
  f.git(f.root, 'add', 'local.txt');
  f.git(f.root, 'commit', '-m', 'local candidate work');
  f.publish('remote.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  const candidate = out.report.evidence.candidate;
  const repository = path.join(candidate, 'repo');
  const wrapper = path.join(candidate, 'git-safe.mjs');
  assert.equal(fs.statSync(wrapper).mode & 0o111, 0o100);
  const invoke = (...args) => spawnSync(process.execPath, [wrapper, ...args], { encoding: 'utf8' });
  assert.equal(invoke('config', '--get', 'core.hooksPath').stdout.trim(), path.join(candidate, 'disabled-hooks'));
  assert.equal(invoke('config', '--bool', 'commit.gpgSign').stdout.trim(), 'false');
  assert.equal(invoke('config', '--bool', 'tag.gpgSign').stdout.trim(), 'false');
  assert.equal(invoke('config', '--get', 'diff.external').stdout.trim(), '');
  assert.notEqual(invoke('config', '--get', 'merge.evil.driver').status, 0);
  assert.equal(fs.readFileSync(invoke('config', '--get', 'core.attributesFile').stdout.trim(), 'utf8'), '* -diff -merge\n');
  const hookMarker = path.join(candidate, 'hook-ran');
  fs.writeFileSync(path.join(repository, '.git', 'hooks', 'post-checkout'), `#!/bin/sh\nprintf ran > ${JSON.stringify(hookMarker)}\n`, { mode: 0o755 });
  assert.equal(invoke('checkout', '--detach', out.report.freshness.fetchedOid).status, 0);
  assert.equal(fs.existsSync(hookMarker), false);

  const safeConfigBefore = fs.readFileSync(path.join(repository, '.git', 'config'));
  const hostileHooks = path.join(repository, '.git', 'hooks');
  const includedConfig = path.join(candidate, 'included-config');
  fs.writeFileSync(includedConfig, `[alias]\nowned = !sh -c 'printf owned > ${path.join(candidate, 'include-ran')}'\n`);
  for (const args of [
    ['-c', `core.hooksPath=${hostileHooks}`, 'checkout', '--detach', out.report.freshness.fetchedOid],
    [`-ccore.hooksPath=${hostileHooks}`, 'checkout', '--detach', out.report.freshness.fetchedOid],
    [`-c=core.hooksPath=${hostileHooks}`, 'checkout', '--detach', out.report.freshness.fetchedOid],
    ['--config-env', 'core.hooksPath=YOUCODED_HOSTILE_HOOKS', 'checkout', '--detach', out.report.freshness.fetchedOid],
    ['--config-env=core.hooksPath=YOUCODED_HOSTILE_HOOKS', 'checkout', '--detach', out.report.freshness.fetchedOid],
    ['config', 'core.hooksPath', hostileHooks],
    ['config', '--local', 'include.path', includedConfig],
    ['config', '--add', 'include.path', includedConfig],
    ['config', '--replace-all', 'core.hooksPath', hostileHooks],
    ['remote', 'add', 'escape', f.remote],
    ['submodule', 'init'],
  ]) {
    const denied = spawnSync(process.execPath, [wrapper, ...args], {
      encoding: 'utf8', env: { ...process.env, YOUCODED_HOSTILE_HOOKS: hostileHooks },
    });
    assert.notEqual(denied.status, 0, args.join(' '));
    assert.match(denied.stderr, /prohibited/i, args.join(' '));
    assert.equal(fs.existsSync(hookMarker), false, args.join(' '));
    assert.equal(fs.existsSync(path.join(candidate, 'include-ran')), false, args.join(' '));
    assert.deepEqual(fs.readFileSync(path.join(repository, '.git', 'config')), safeConfigBefore, args.join(' '));
  }

  for (const args of [
    ['push', 'anything'], ['send-pack', 'anything'], ['-c', 'user.name=Someone', 'push', 'anything'],
    ['-c', 'alias.ship=push anything', 'ship'], ['-calias.ship=push anything', 'ship'], ['-c=alias.ship=push anything', 'ship'],
    ['-c', `alias.shell=!sh -c 'printf owned > ${path.join(candidate, 'shell-ran')}'`, 'shell'],
    ['--config-env', 'alias.ship=YOUCODED_CANDIDATE_ALIAS', 'ship'], ['--config-env=alias.ship=YOUCODED_CANDIDATE_ALIAS', 'ship'],
    ['config', 'alias.later', '!sh -c true'],
  ]) {
    const denied = invoke(...args);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /prohibited/i);
  }
  assert.equal(fs.existsSync(path.join(candidate, 'shell-ran')), false);
  assert.equal(f.git(repository, 'remote'), '');
  assert.match(fs.readFileSync(path.join(candidate, 'SAFETY.md'), 'utf8'), /git-safe\.mjs/);
});

test('candidate wrapper cannot retarget allowed mutations outside its repository', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'local.txt'), 'local\n');
  f.git(f.root, 'add', 'local.txt');
  f.git(f.root, 'commit', '-m', 'local candidate work');
  f.publish('remote.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  const candidate = out.report.evidence.candidate;
  const wrapper = path.join(candidate, 'git-safe.mjs');

  const outside = path.join(path.dirname(f.root), 'outside');
  f.git(path.dirname(f.root), 'clone', f.remote, outside);
  const executableDirectory = path.join(candidate, 'hostile-exec');
  fs.mkdirSync(executableDirectory);
  const execMarker = path.join(candidate, 'exec-ran');
  fs.writeFileSync(path.join(executableDirectory, 'git-rm'), `#!/bin/sh\nprintf ran > ${JSON.stringify(execMarker)}\n`, { mode: 0o755 });
  const before = f.capture(outside);
  const outsideConfig = path.join(outside, '.git', 'config');
  const outsideConfigBefore = fs.readFileSync(outsideConfig);
  const hostileEnvironment = {
    ...process.env,
    GIT_DIR: path.join(outside, '.git'),
    GIT_WORK_TREE: outside,
    GIT_COMMON_DIR: path.join(outside, '.git'),
    GIT_NAMESPACE: 'outside',
    GIT_EXEC_PATH: executableDirectory,
    GIT_OBJECT_DIRECTORY: path.join(outside, '.git', 'objects'),
  };
  const cases = [
    ['-C', outside, 'rm', 'source.txt'],
    [`-C${outside}`, 'rm', 'source.txt'],
    ['--git-dir', path.join(outside, '.git'), '--work-tree', outside, 'rm', 'source.txt'],
    [`--git-dir=${path.join(outside, '.git')}`, `--work-tree=${outside}`, 'rm', 'source.txt'],
    ['--namespace', 'outside', 'rm', 'source.txt'],
    ['--namespace=outside', 'rm', 'source.txt'],
    ['--exec-path', executableDirectory, 'rm', 'source.txt'],
    [`--exec-path=${executableDirectory}`, 'rm', 'source.txt'],
  ];
  for (const args of cases) {
    const denied = spawnSync(process.execPath, [wrapper, ...args], { encoding: 'utf8', env: hostileEnvironment });
    assert.notEqual(denied.status, 0, args.join(' '));
    assert.match(denied.stderr, /prohibited/i, args.join(' '));
    assert.deepEqual(f.capture(outside), before, args.join(' '));
    assert.deepEqual(fs.readFileSync(outsideConfig), outsideConfigBefore, args.join(' '));
    assert.equal(fs.existsSync(execMarker), false, args.join(' '));
  }
  const envOnly = spawnSync(process.execPath, [wrapper, 'rm', '--', 'source.txt'], { encoding: 'utf8', env: hostileEnvironment });
  assert.equal(envOnly.status, 0, envOnly.stderr);
  assert.equal(fs.existsSync(path.join(candidate, 'repo', 'source.txt')), false, 'allowed mutation must stay inside candidate');
  assert.deepEqual(f.capture(outside), before, 'Git environment must not retarget the command');
  assert.deepEqual(fs.readFileSync(outsideConfig), outsideConfigBefore);
  assert.equal(fs.existsSync(execMarker), false);
});

test('candidate wrapper enforces per-command options and contains paths and helpers', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'local.txt'), 'local\n');
  f.git(f.root, 'add', 'local.txt');
  f.git(f.root, 'commit', '-m', 'local candidate work');
  f.publish('remote.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  const candidate = out.report.evidence.candidate;
  const repository = path.join(candidate, 'repo');
  const wrapper = path.join(candidate, 'git-safe.mjs');
  const invoke = (...args) => spawnSync(process.execPath, [wrapper, ...args], { encoding: 'utf8' });

  const escaped = path.join(candidate, 'escaped.txt');
  const maliciousPatch = path.join(repository, 'unsafe.patch');
  fs.writeFileSync(maliciousPatch, 'diff --git a/../escaped.txt b/../escaped.txt\nnew file mode 100644\nindex 0000000..257cc56\n--- /dev/null\n+++ b/../escaped.txt\n@@ -0,0 +1 @@\n+outside\n');
  const pagerMarker = path.join(candidate, 'pager-ran');
  const pager = path.join(candidate, 'hostile-pager.sh');
  fs.writeFileSync(pager, `#!/bin/sh\nprintf ran > ${JSON.stringify(pagerMarker)}\n`, { mode: 0o755 });
  for (const args of [
    ['apply', '--unsafe-paths', 'unsafe.patch'],
    ['grep', '--open-files-in-pager', pager, 'published'],
    ['grep', `--open-files-in-pager=${pager}`, 'published'],
    ['diff', '--ext-diff'], ['ls-files', '--exclude-from', maliciousPatch],
    ['status', '--porcelain', '--', '../outside'], ['rm', '--', '../outside'],
    ['restore', '--', escaped], ['mv', '--', 'source.txt', escaped],
  ]) {
    const denied = invoke(...args);
    assert.notEqual(denied.status, 0, args.join(' '));
    assert.match(denied.stderr, /prohibited/i, args.join(' '));
  }
  assert.equal(fs.existsSync(escaped), false);
  assert.equal(fs.existsSync(pagerMarker), false);
  assert.match(fs.readFileSync(path.join(candidate, 'SAFETY.md'), 'utf8'), /per-command|repository-relative|unsafe-paths/i);

  for (const args of [
    ['status', '--short'], ['diff', '--stat'], ['log', '--oneline', '-n', '1'], ['show', '--stat', 'HEAD'],
    ['grep', '-n', 'published', '--', 'source.txt'], ['ls-files', '--', 'source.txt'], ['rev-parse', '--verify', 'HEAD'],
    ['checkout', '--detach', 'HEAD'], ['restore', '--', 'source.txt'], ['add', '--', 'source.txt'],
  ]) assert.equal(invoke(...args).status, 0, args.join(' '));

  fs.writeFileSync(path.join(repository, 'move-me.txt'), 'move\n');
  assert.equal(invoke('add', '--', 'move-me.txt').status, 0);
  assert.equal(invoke('mv', '--', 'move-me.txt', 'moved.txt').status, 0);
  assert.equal(invoke('rm', '-f', '--', 'moved.txt').status, 0);
  const safePatch = path.join(repository, 'safe-review.patch');
  fs.writeFileSync(safePatch, 'diff --git a/source.txt b/source.txt\nindex 407f150..76d4bb8 100644\n--- a/source.txt\n+++ b/source.txt\n@@ -1 +1 @@\n-published\n+reviewed\n');
  assert.equal(invoke('apply', '--check', 'safe-review.patch').status, 0);
  assert.equal(invoke('apply', 'safe-review.patch').status, 0);
  assert.equal(fs.readFileSync(path.join(repository, 'source.txt'), 'utf8'), 'reviewed\n');
});

test('candidate wrapper disables inherited pagers editors askpass and execution helpers in a PTY', { skip: process.platform === 'win32' }, t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'local.txt'), 'local\n');
  f.git(f.root, 'add', 'local.txt');
  f.git(f.root, 'commit', '-m', 'local candidate work');
  f.publish('remote.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  const candidate = out.report.evidence.candidate;
  const wrapper = path.join(candidate, 'git-safe.mjs');
  const marker = path.join(candidate, 'hostile-helper-ran');
  const hostile = path.join(candidate, 'hostile-helper.sh');
  fs.writeFileSync(hostile, `#!/bin/sh\nprintf '%s\\n' "$0" >> ${JSON.stringify(marker)}\nexit 99\n`, { mode: 0o755 });
  const hostileEnv = {
    ...process.env,
    PAGER: hostile,
    GIT_PAGER: hostile,
    GIT_EDITOR: hostile,
    GIT_SEQUENCE_EDITOR: hostile,
    EDITOR: hostile,
    VISUAL: hostile,
    GIT_ASKPASS: hostile,
    SSH_ASKPASS: hostile,
    GIT_SSH: hostile,
    GIT_SSH_COMMAND: hostile,
    GIT_EXTERNAL_DIFF: hostile,
    GIT_DIFF_OPTS: '--ext-diff',
  };
  for (const command of [['log', '--oneline'], ['show', '--stat', 'HEAD'], ['diff', '--stat']]) {
    const quoted = [process.execPath, wrapper, ...command].map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ');
    const result = spawnSync('script', ['-qefc', quoted, os.devNull], { encoding: 'utf8', env: hostileEnv });
    assert.equal(result.status, 0, `${command.join(' ')}: ${result.stdout}${result.stderr}`);
    assert.equal(fs.existsSync(marker), false, command.join(' '));
  }
  assert.equal(spawnSync(process.execPath, [wrapper, 'status', '--short'], { encoding: 'utf8', env: hostileEnv }).status, 0);
  assert.equal(spawnSync(process.execPath, [wrapper, 'checkout', '--detach', 'HEAD'], { encoding: 'utf8', env: hostileEnv }).status, 0);
  assert.equal(fs.existsSync(marker), false);
});

test('candidate explicitly disclaims staging fidelity and carries authoritative recovery checklist', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'local\n');
  f.git(f.root, 'add', 'source.txt');
  f.publish('source.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(manifest.candidateIndexReproducesOriginalStaging, false);
  assert.deepEqual(manifest.recoveryChecklist, out.report.recoveryChecklist);
  const instructions = fs.readFileSync(path.join(out.report.evidence.candidate, 'RECOVERY.txt'), 'utf8');
  for (const required of ['full report', 'original committed, staged, and unstaged layer', 'inside its standalone repository', 'Ask Destin only', 'Do not transplant whole candidate files', 'Recheck current', 'no automatic candidate-apply']) {
    assert.match(instructions, new RegExp(required, 'i'));
  }
});

test('failed candidate construction writes an explicit incomplete manifest', t => {
  const f = makeWorkspace(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'local\n');
  f.git(f.root, 'add', 'source.txt');
  f.publish('source.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root, beforeCandidate() { throw new Error('injected incomplete candidate'); } });
  const manifest = candidateManifest(out);
  assert.equal(manifest.status, 'failed');
  assert.equal(manifest.complete, false);
  assert.match(manifest.blockers.join(' '), /injected incomplete candidate/);
});

test('clean local rename materializes independently in the candidate', t => {
  const f = makeWorkspace(t);
  f.git(f.root, 'mv', 'source.txt', 'renamed.txt');
  f.git(f.root, 'commit', '-m', 'local rename');
  f.publish('remote.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(manifest.status, 'clean');
  assert.equal(fs.existsSync(path.join(out.report.evidence.candidate, 'repo', 'source.txt')), false);
  assert.equal(candidateFile(out, 'renamed.txt'), 'published\n');
});

test('clean local deletion materializes independently in the candidate', t => {
  const f = makeWorkspace(t);
  fs.rmSync(path.join(f.root, 'source.txt'));
  f.git(f.root, 'add', 'source.txt');
  f.git(f.root, 'commit', '-m', 'local deletion');
  f.publish('remote.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  const manifest = candidateManifest(out);
  assert.equal(manifest.status, 'clean');
  assert.equal(fs.existsSync(path.join(out.report.evidence.candidate, 'repo', 'source.txt')), false);
});

test('briefing includes exact action status reason and heads', () => {
  const report = {
    freshness: { status: 'fetched', fetchedOid: 'b'.repeat(40) }, reportPath: '/tmp/report.json',
    action: { status: 'failed', reason: 'postcondition detail', beforeHead: 'a'.repeat(40), afterHead: 'c'.repeat(40) },
    shared: { relation: 'related', local: [], incoming: [], changes: [] },
  };
  const briefing = formatBriefing(report);
  assert.match(briefing, /failed/);
  assert.match(briefing, /postcondition detail/);
  assert.match(briefing, new RegExp(`a{40}.*c{40}`));
});
