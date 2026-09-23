import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
// WHY: the networkless jail needs bubblewrap, which GitHub's runners lack; these two cases
// run where the rig runs. The refusal case below needs no bwrap and always runs.
const noBwrap = !existsSync('/usr/bin/bwrap') && 'bubblewrap (/usr/bin/bwrap) not installed';
import { buildFixture } from './fixture.mjs';

const jail = fileURLToPath(new URL('./shell-jail.mjs', import.meta.url));

async function withClone(run) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'luna-jail-test-'));
  try { const fixture = await buildFixture(parent); await run(fixture.roots[0]); }
  finally { await rm(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }); }
}

function jailed(clone, command, extraEnv = {}) {
  return spawnSync(process.execPath, [jail, '-c', command], {
    cwd: clone,
    env: { ...process.env, LUNA_FIXTURE_ROOT: clone, ...extraEnv },
    encoding: 'utf8', timeout: 10_000,
  });
}

test('networkless shell sees its clone but not the real home, credentials or external interfaces', { skip: noBwrap }, async () => withClone(async clone => {
  const command = `node -e 'const fs=require("node:fs");console.log(JSON.stringify({fixture:fs.readFileSync("AGENTS.md","utf8").includes("LUNA-MAPLE"),home:fs.existsSync("/home/destin"),secret:process.env.SECRET_CANARY??null,interfaces:fs.readFileSync("/proc/net/dev","utf8").split("\\n").filter(x=>x.includes(":"))}))'`;
  const result = jailed(clone, command, { SECRET_CANARY: 'DO_NOT_PASS' });
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(result.stdout);
  assert.equal(observed.fixture, true);
  assert.equal(observed.home, false);
  assert.equal(observed.secret, null);
  assert.equal(observed.interfaces.length, 1);
  assert.match(observed.interfaces[0], /\blo:/);
}));

test('networkless shell can write to the current clone only', { skip: noBwrap }, async () => withClone(async clone => {
  const result = jailed(clone, `node -e 'require("node:fs").writeFileSync("sandbox-write", "ok")'`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path.join(clone, 'sandbox-write'), 'utf8'), 'ok');
  const sibling = jailed(clone, `test -e ../clone-2/AGENTS.md`);
  assert.notEqual(sibling.status, 0);
}));

test('missing fixture root refuses before executing shell command', async () => withClone(async clone => {
  const result = jailed(clone, `node -e 'require("node:fs").writeFileSync("should-not-exist", "bad")'`, { LUNA_FIXTURE_ROOT: '' });
  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(path.join(clone, 'should-not-exist')));
}));
