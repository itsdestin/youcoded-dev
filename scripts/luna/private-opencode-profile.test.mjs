import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, lstat, readdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stagePrivateOpenCodeProfile } from './private-opencode-profile.mjs';

test('stages only the experiment OAuth credential into fresh private state, then removes the copy', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'luna-source-fixture-'));
  const data = path.join(source, 'data', 'opencode');
  await mkdir(data, { mode: 0o700, recursive: true });
  await writeFile(path.join(data, 'auth.json'), 'SENTINEL_FAKE_TOKEN', { mode: 0o600 });
  await writeFile(path.join(data, 'opencode.db'), 'unrelated private history', { mode: 0o600 });
  let staged;
  try {
    staged = await stagePrivateOpenCodeProfile({ sourceRoot: source });
    assert.equal(staged.env.OPENCODE_PURE, '1');
    assert.equal(staged.env.YOUCODED_LUNA_EXPERIMENT, '1');
    assert.deepEqual(await readdir(staged.authRoot), ['auth.json']);
    assert.equal((await lstat(path.join(staged.authRoot, 'auth.json'))).mode & 0o777, 0o600);
    assert.notEqual(staged.authRoot, data);
    for (const key of ['HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR']) {
      assert.equal((await lstat(staged.env[key])).mode & 0o777, 0o700);
    }
    await staged.cleanup();
    await assert.rejects(lstat(staged.root), { code: 'ENOENT' });
    assert.equal((await lstat(path.join(data, 'auth.json'))).isFile(), true);
  } finally { if (staged) await staged.cleanup(); await rm(source, { recursive:true, force:true }); }
});

test('refuses a symlinked source auth without creating a run profile', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'luna-source-fixture-'));
  const data = path.join(source, 'data', 'opencode');
  await mkdir(data, { mode: 0o700, recursive: true });
  await writeFile(path.join(source, 'outside'), 'fake', { mode: 0o600 });
  await symlink(path.join(source, 'outside'), path.join(data, 'auth.json'));
  try { await assert.rejects(stagePrivateOpenCodeProfile({ sourceRoot: source }), /auth|symlink/); }
  finally { await rm(source, { recursive:true, force:true }); }
});
