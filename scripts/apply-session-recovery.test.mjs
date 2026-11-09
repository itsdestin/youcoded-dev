import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageRecovery, applyRecovery, appIsRunning } from './apply-session-recovery.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const sourceHash = hash('original\n');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'session-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 3 }));
  const target = join(root, 'conversation.jsonl');
  await writeFile(target, 'original\n');
  return { root, target, staging: join(root, 'private') };
}

test('staging leaves the original untouched and applying preserves its exact backup', async t => {
  const { target, staging } = await fixture(t);
  const manifest = await stageRecovery(staging, [{ target, expectedOriginalSha256: sourceHash, contents: 'repaired\n', reason: 'pairing repair' }]);
  assert.equal(await readFile(target, 'utf8'), 'original\n');
  await applyRecovery(manifest, { appIsRunning: async () => false });
  assert.equal(await readFile(target, 'utf8'), 'repaired\n');
  assert.equal(await readFile(join(staging, '0.original'), 'utf8'), 'original\n');
});

test('refuses staging a candidate derived from a stale source snapshot', async t => {
  const { target, staging } = await fixture(t);
  const expectedOriginalSha256 = createHash('sha256').update('original\n').digest('hex');
  await writeFile(target, 'new user work\n');
  await assert.rejects(stageRecovery(staging, [{ target, contents: 'repaired\n', expectedOriginalSha256 }]), /changed/);
  assert.equal(await readFile(target, 'utf8'), 'new user work\n');
});

test('refuses every replacement while the app is running', async t => {
  const { target, staging } = await fixture(t);
  const manifest = await stageRecovery(staging, [{ target, expectedOriginalSha256: sourceHash, contents: 'repaired\n', reason: 'repair' }]);
  await assert.rejects(applyRecovery(manifest, { appIsRunning: async () => true }), /running/);
  assert.equal(await readFile(target, 'utf8'), 'original\n');
});

test('refuses a transcript changed after staging without overwriting it', async t => {
  const { target, staging } = await fixture(t);
  const manifest = await stageRecovery(staging, [{ target, expectedOriginalSha256: sourceHash, contents: 'repaired\n', reason: 'repair' }]);
  await writeFile(target, 'new user work\n');
  await assert.rejects(applyRecovery(manifest, { appIsRunning: async () => false }), /changed/);
  assert.equal(await readFile(target, 'utf8'), 'new user work\n');
});

test('preflights the entire batch before replacing any transcript', async t => {
  const { target, staging, root } = await fixture(t);
  const other = join(root, 'other.jsonl');
  await writeFile(other, 'second original\n');
  const manifest = await stageRecovery(staging, [
    { target, expectedOriginalSha256: sourceHash, contents: 'repaired\n', reason: 'repair' },
    { target: other, expectedOriginalSha256: hash('second original\n'), contents: 'second repaired\n', reason: 'repair' },
  ]);
  await writeFile(other, 'new user work\n');
  await assert.rejects(applyRecovery(manifest, { appIsRunning: async () => false }), /changed/);
  assert.equal(await readFile(target, 'utf8'), 'original\n');
});

test('refuses a modified candidate or backup', async t => {
  const { target, staging } = await fixture(t);
  const manifest = await stageRecovery(staging, [{ target, expectedOriginalSha256: sourceHash, contents: 'repaired\n', reason: 'repair' }]);
  await writeFile(join(staging, '0.repaired'), 'unexpected\n');
  await assert.rejects(applyRecovery(manifest, { appIsRunning: async () => false }), /candidate/);
  assert.equal(await readFile(target, 'utf8'), 'original\n');
});

test('requires the candidate producer source checksum', async t => {
  const { target, staging } = await fixture(t);
  await assert.rejects(stageRecovery(staging, [{ target, contents: 'repaired\n' }]), /source checksum/);
});

test('refuses a corrupted original backup', async t => {
  const { target, staging } = await fixture(t);
  const manifest = await stageRecovery(staging, [{ target, expectedOriginalSha256: sourceHash, contents: 'repaired\n' }]);
  await writeFile(join(staging, '0.original'), 'corrupted\n');
  await assert.rejects(applyRecovery(manifest, { appIsRunning: async () => false }), /backup/);
  assert.equal(await readFile(target, 'utf8'), 'original\n');
});

test('a late app launch refuses replacement and removes the temporary file', async t => {
  const { target, staging, root } = await fixture(t);
  const manifest = await stageRecovery(staging, [{ target, expectedOriginalSha256: sourceHash, contents: 'repaired\n' }]);
  let checks = 0;
  await assert.rejects(applyRecovery(manifest, { appIsRunning: async () => ++checks >= 3 }), /running/);
  assert.equal(await readFile(target, 'utf8'), 'original\n');
  assert.ok(!(await readdir(root)).some(name => name.includes('.recovery-')));
});

test('same-user permission errors fail closed, while vanished and other-user processes do not block', async () => {
  const io = {
    readdir: async () => ['1'],
    lstat: async () => ({ uid: 1000 }),
    readlink: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); },
  };
  await assert.rejects(appIsRunning({ io, uid: 1000 }), /inspect/);
  assert.equal(await appIsRunning({ io: { ...io, lstat: async () => ({ uid: 0 }) }, uid: 1000 }), false);
  assert.equal(await appIsRunning({ io: { ...io, readlink: async () => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }); } }, uid: 1000 }), false);
});

test('known protected OS daemons are identified without weakening unknown-process refusals', async () => {
  const identities = [
    ['systemd', '/usr/lib/systemd/systemd'], ['(sd-pam)', '(sd-pam)'],
    ['gpg-agent', 'gpg-agent'], ['scdaemon', 'scdaemon'],
    ['kwin_wayland', '/usr/bin/kwin_wayland'], ['polkit-kde-auth', '/usr/lib/polkit-kde-authentication-agent-1'],
  ];
  for (const [comm, executable] of identities) {
    assert.equal(await appIsRunning({ uid: 1000, io: {
      readdir: async () => ['1'], lstat: async () => ({ uid: 1000 }),
      readlink: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); },
      readFile: async file => Buffer.from(file.endsWith('/comm') ? comm + '\n' : executable + '\0'),
    } }), false, comm);
  }
});

test('process guard recognizes installed and development app executables', async () => {
  for (const executable of ['/opt/YouCoded/youcoded', '/work/node_modules/electron/dist/electron', '/work/node_modules/electron/dist/electron (deleted)']) {
    assert.equal(await appIsRunning({ uid: 1000, io: {
      readdir: async () => ['1'], lstat: async () => ({ uid: 1000 }), readlink: async () => executable,
      readFile: async () => Buffer.from(`${executable}\0`),
    } }), true);
  }
});

test('orphan Chromium helpers without transcript handles do not prevent offline recovery', async () => {
  for (const type of ['zygote', 'gpu-process', 'renderer', 'utility']) {
    const io = {
      readdir: async file => file === '/proc' ? ['1'] : [],
      lstat: async () => ({ uid: 1000 }),
      readlink: async () => '/opt/YouCoded/youcoded',
      readFile: async () => Buffer.from(`/opt/YouCoded/youcoded\0--type=${type}\0`),
    };
    assert.equal(await appIsRunning({ uid: 1000, io }), false, type);
  }
});

test('a helper holding a native transcript open still blocks recovery', async () => {
  const io = {
    readdir: async file => file === '/proc' ? ['1'] : ['9'],
    lstat: async () => ({ uid: 1000 }),
    readlink: async file => file.endsWith('/exe') ? '/opt/YouCoded/youcoded' : '/home/user/.youcoded/sessions/project/session.jsonl',
    readFile: async () => Buffer.from('/opt/YouCoded/youcoded\0--type=utility\0'),
  };
  assert.equal(await appIsRunning({ uid: 1000, io }), true);
});

test('helper inspection failures and unknown Chromium types fail closed', async () => {
  const io = {
    readdir: async file => { if (file === '/proc') return ['1']; throw Object.assign(new Error('denied'), { code: 'EACCES' }); },
    lstat: async () => ({ uid: 1000 }), readlink: async () => '/opt/YouCoded/youcoded',
    readFile: async () => Buffer.from('/opt/YouCoded/youcoded\0--type=utility\0'),
  };
  await assert.rejects(appIsRunning({ uid: 1000, io }), /inspect/);
  assert.equal(await appIsRunning({ uid: 1000, io: { ...io, readFile: async () => Buffer.from('/opt/YouCoded/youcoded\0--type=unknown\0') } }), true);
});

test('a main app process blocks even when helpers are listed first', async () => {
  const io = {
    readdir: async file => file === '/proc' ? ['1', '2'] : [],
    lstat: async () => ({ uid: 1000 }), readlink: async () => '/opt/YouCoded/youcoded',
    readFile: async file => Buffer.from(`/opt/YouCoded/youcoded\0${file.includes('/1/') ? '--type=zygote\0' : ''}`),
  };
  assert.equal(await appIsRunning({ uid: 1000, io }), true);
});

test('a partially applied batch can resume without changing original backups', async t => {
  const { target, staging, root } = await fixture(t);
  const other = join(root, 'other.jsonl');
  await writeFile(other, 'second original\n');
  const manifest = await stageRecovery(staging, [
    { target, expectedOriginalSha256: sourceHash, contents: 'repaired\n' },
    { target: other, expectedOriginalSha256: hash('second original\n'), contents: 'second repaired\n' },
  ]);
  let checks = 0;
  await assert.rejects(applyRecovery(manifest, { appIsRunning: async () => ++checks >= 4 }), /running/);
  assert.equal(await readFile(target, 'utf8'), 'repaired\n');
  assert.equal(await readFile(other, 'utf8'), 'second original\n');
  const results = await applyRecovery(manifest, { appIsRunning: async () => false });
  assert.deepEqual(results.map(result => result.status), ['already-applied', 'applied']);
  assert.equal(await readFile(join(staging, '0.original'), 'utf8'), 'original\n');
  assert.equal(await readFile(join(staging, '1.original'), 'utf8'), 'second original\n');
});

test('a repeated apply is an idempotent verified no-op', async t => {
  const { target, staging } = await fixture(t);
  const manifest = await stageRecovery(staging, [{ target, expectedOriginalSha256: sourceHash, contents: 'repaired\n', reason: 'repair' }]);
  await applyRecovery(manifest, { appIsRunning: async () => false });
  const result = await applyRecovery(manifest, { appIsRunning: async () => false });
  assert.equal(result[0].status, 'already-applied');
  assert.equal(await readFile(target, 'utf8'), 'repaired\n');
});
