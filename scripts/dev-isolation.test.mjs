// dev-isolation.test.mjs — scripts/dev-isolation.sh: a throwaway HOME must never reach the real account, and the launch must survive odd machines.
// Run: node --test scripts/dev-isolation.test.mjs   (the bus tests are skipped where there is no dbus-daemon, i.e. not Linux)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, chmodSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'dev-isolation.sh');
const hasBus = process.platform === 'linux' && spawnSync('sh', ['-c', 'command -v dbus-daemon']).status === 0;
const tmp = () => mkdtempSync(join(tmpdir(), 'deviso-'));

/** A getent that names `home` as this user's real home (or fails, or is absent). */
function shim(mode, home) {
  const d = tmp(); const bin = join(d, 'bin'); mkdirSync(bin);
  const link = (name) => { const r = spawnSync('sh', ['-c', `command -v ${name}`]).stdout.toString().trim(); if (r) symlinkSync(r, join(bin, name)); };
  for (const t of ['id', 'cut', 'readlink', 'realpath', 'mkdir', 'tr', 'grep', 'sed', 'head', 'rm', 'mktemp', 'uname', 'kill', 'dbus-daemon', 'cat', 'printf', 'dirname', 'env', 'sleep']) link(t);
  if (mode === 'fail') { writeFileSync(join(bin, 'getent'), '#!/bin/sh\nexit 2\n'); chmodSync(join(bin, 'getent'), 0o755); }
  if (mode === 'ok') { writeFileSync(join(bin, 'getent'), `#!/bin/sh\necho "u:x:1:1::${home}:/bin/sh"\n`); chmodSync(join(bin, 'getent'), 0o755); }
  return { dir: d, bin };
}

/** Source the script under the strict mode run-dev.sh uses, call dev_isolate_accounts, and report what it did. */
function run({ home, bin, env = {}, after = '' }) {
  const state = join(tmp(), 'state');
  const code = `set -euo pipefail; source '${SCRIPT}'; dev_isolate_accounts '${state}'; ` +
    `echo "mode=\${DEV_ISOLATION_MODE:-none} cfg=\${GH_CONFIG_DIR:-unset} ssh=\${SSH_AUTH_SOCK:-unset} aws=\${AWS_SECRET_ACCESS_KEY:-unset} key=\${ANTHROPIC_API_KEY:-unset} cc=\${CLAUDE_CODE_OAUTH_TOKEN:-unset} gh=\${GH_TOKEN:-unset}"; ${after}`;
  const r = spawnSync('/bin/bash', ['-c', code], { env: { PATH: bin, HOME: home, ...env }, encoding: 'utf8' });
  return { out: r.stdout, err: r.stderr, status: r.status, state };
}

test('getent failing does not end the launch (set -euo pipefail), and says why', () => {
  const s = shim('fail'); const home = tmp();
  const r = run({ home, bin: s.bin });
  assert.equal(r.status, 0);
  assert.match(r.err, /cannot tell which home is the real one/);
  assert.match(r.out, /mode=none/);
});

test('getent absent (Git Bash) does not end the launch either', () => {
  const s = shim('absent'); const home = tmp();
  const r = run({ home, bin: s.bin });
  assert.equal(r.status, 0);
  assert.match(r.err, /cannot tell/);
});

test('the real home, under any spelling or link, is never treated as a throwaway', () => {
  const real = tmp(); const s = shim('ok', real);
  const link = join(tmp(), 'linkhome'); symlinkSync(real, link);
  for (const home of [real, real + '/', real + '//', link]) {
    const r = run({ home, bin: s.bin, env: { SSH_AUTH_SOCK: '/agent' } });
    assert.equal(r.status, 0, home);
    assert.match(r.out, /mode=none cfg=unset ssh=\/agent/, `${home}: nothing was isolated or unset`);
    if (home !== real) assert.match(r.err, /resolves to the real home/, `${home}: a warning was printed`);
    else assert.equal(r.err, '', 'the exact real home is silent');
  }
  const parent = dirname(real); // a HOME that CONTAINS the real home reaches it too
  assert.match(run({ home: parent, bin: s.bin }).out, /mode=none/);
});

test('a throwaway HOME is isolated: config inside it, credential variables gone, wallet prompt switched off', { skip: !hasBus }, () => {
  const real = tmp(); const s = shim('ok', real); const home = tmp();
  const r = run({ home, bin: s.bin, env: { SSH_AUTH_SOCK: '/agent', AWS_SECRET_ACCESS_KEY: 'a', ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_OAUTH_TOKEN: 't', GH_TOKEN: 'g' } });
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, new RegExp(`mode=private-bus cfg=${home}/.config/gh ssh=unset aws=unset key=unset cc=unset gh=unset`));
  assert.match(readFileSync(join(home, '.config', 'kwalletrc'), 'utf8'), /Enabled=false/);
  const [pid] = readFileSync(r.state, 'utf8').split('\n');
  process.kill(Number(pid)); // the test's own cleanup
});

test('cleanup ends the bus daemon and whatever runs on that bus, by exact pid, and nothing else', { skip: !hasBus }, async () => {
  const real = tmp(); const s = shim('ok', real); const home = tmp();
  const state = join(tmp(), 'state');
  const code = `source '${SCRIPT}'; dev_isolate_accounts '${state}'; echo "$DBUS_SESSION_BUS_ADDRESS"`;
  const r = spawnSync('/bin/bash', ['-c', code], { env: { PATH: s.bin, HOME: home }, encoding: 'utf8' });
  const addr = r.stdout.trim().split('\n').pop();
  const [daemonPid] = readFileSync(state, 'utf8').split('\n').map(Number);
  const onBus = spawn('sleep', ['60'], { env: { PATH: s.bin, DBUS_SESSION_BUS_ADDRESS: addr } });
  const other = spawn('sleep', ['60'], { env: { PATH: s.bin, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/somewhere/else' } });
  const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
  try {
    assert.ok(alive(daemonPid) && alive(onBus.pid) && alive(other.pid));
    spawnSync('/bin/bash', ['-c', `source '${SCRIPT}'; dev_isolation_cleanup '${state}'`], { env: { PATH: s.bin, HOME: home } });
    await new Promise((res) => setTimeout(res, 300));
    assert.ok(!alive(daemonPid), 'the bus daemon is gone');
    assert.ok(onBus.exitCode !== null || onBus.signalCode !== null || !alive(onBus.pid), 'the process on the private bus is gone');
    assert.ok(alive(other.pid), 'a process on another bus is untouched');
    assert.ok(!existsSync(state), 'the state file is removed');
  } finally { onBus.kill(); other.kill(); try { process.kill(daemonPid); } catch {} rmSync(home, { recursive: true, force: true }); }
});

// WHY (2026-10-04): a state file left by a crashed launch can name a pid the OS has since given to something unrelated; cleanup must
// not kill it. Runs on Linux only because the proof of identity is read from /proc (elsewhere cleanup kills nothing, by design).
test('a stale state file never makes cleanup kill an unrelated process, at cleanup or at the next launch', { skip: process.platform !== 'linux' }, async () => {
  const s = shim('ok', tmp()); const home = tmp();
  const bystander = spawn('sleep', ['60'], { env: { PATH: s.bin } });
  const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
  try {
    const state = join(tmp(), 'state');
    writeFileSync(state, `${bystander.pid}\nunix:path=/nonexistent-stale-bus\n`);
    spawnSync('/bin/bash', ['-c', `source '${SCRIPT}'; dev_isolation_cleanup '${state}'`], { env: { PATH: s.bin, HOME: home } });
    await new Promise((res) => setTimeout(res, 200));
    assert.ok(alive(bystander.pid), 'an unrelated process that reused the pid is not killed by cleanup');
    assert.ok(!existsSync(state), 'the stale state file is removed');
    // And a new launch over a stale file clears it first (the launch itself may or may not start a bus; either way the bystander lives).
    writeFileSync(state, `${bystander.pid}\nunix:path=/nonexistent-stale-bus\n`);
    const r = spawnSync('/bin/bash', ['-c', `source '${SCRIPT}'; dev_isolate_accounts '${state}'; echo "mode=\${DEV_ISOLATION_MODE:-none}"; dev_isolation_cleanup '${state}'`], { env: { PATH: s.bin, HOME: home }, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.ok(alive(bystander.pid), 'an unrelated process is not killed by a fresh launch either');
  } finally { bystander.kill(); rmSync(home, { recursive: true, force: true }); }
});
