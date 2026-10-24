import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./idle-pause.sh', import.meta.url));
function run(command, env = {}) {
  assert.ok(existsSync(script), 'Tracked VM idle monitor is missing');
  const r = spawnSync('bash', ['-c', `source "$1"; ${command}`, 'test', script], {
    env: { ...process.env, ...env }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return r.stdout.trim();
}

test('extracts legacy and localhost-bound SSH forwards without matching another service', () => {
  assert.equal(run("printf '%s' '-netdev user,id=n,hostfwd=tcp::22221-:22' | ssh_port_from_cmdline"), '22221');
  assert.equal(run("printf '%s' '-netdev user,id=n,hostfwd=tcp:127.0.0.1:22227-:22' | ssh_port_from_cmdline"), '22227');
  assert.equal(run("printf '%s' 'hostfwd=tcp:127.0.0.1:8028-:80' | ssh_port_from_cmdline"), '');
});

test('importing helper definitions does not create runtime state', () => {
  const root = mkdtempSync(join(tmpdir(), 'vm-idle-import-'));
  try {
    run(':', { XDG_RUNTIME_DIR: root });
    assert.equal(existsSync(join(root, 'vm-idle-pause')), false);
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
});

test('Fedora resume uses its own account, key and known-host file', () => {
  const root = mkdtempSync(join(tmpdir(), 'vm-idle-ssh-'));
  try {
    mkdirSync(join(root, 'bin'));
    const log = join(root, 'args');
    writeFileSync(join(root, 'bin/ssh'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$VM_SSH_LOG"\n', { mode: 0o755 });
    run('sync_clock fedora-44-kde 22227', {
      PATH: join(root, 'bin') + ':' + process.env.PATH, VM_HOME: join(root, 'guests'), VM_SSH_LOG: log,
    });
    const args = readFileSync(log, 'utf8');
    assert.ok(args.includes('keyboardtest@127.0.0.1'));
    assert.ok(args.includes(join(root, 'guests/fedora-44-kde/id_ed25519')));
    assert.ok(args.includes('UserKnownHostsFile=' + join(root, 'guests/fedora-44-kde/known_hosts')));
    assert.ok(args.includes('22227'));
    assert.ok(!args.includes('/vm-key'));
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
});

test('failed monitor resume retains paused state until running is positively confirmed', () => {
  const root = mkdtempSync(join(tmpdir(), 'vm-idle-resume-'));
  try {
    const env = { XDG_RUNTIME_DIR: root };
    const command = `mkdir -p "$STATE"; touch "$STATE/fedora-44-kde.paused";
      sync_clock() { :; }; mon() { return 1; };
      if resume_paused_vm fedora-44-kde 22227; then exit 10; fi;
      test -f "$STATE/fedora-44-kde.paused" || exit 11;
      mon() { echo 'VM status: paused'; };
      if resume_paused_vm fedora-44-kde 22227; then exit 12; fi;
      test -f "$STATE/fedora-44-kde.paused" || exit 13;
      mon() { echo 'VM status: running'; };
      resume_paused_vm fedora-44-kde 22227 || exit 14;
      test ! -e "$STATE/fedora-44-kde.paused" || exit 15; wait`;
    assert.match(run(command, env), /resumed/);
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
});

test('Fedora helper is recognized as an active VM tool', () => {
  const root = mkdtempSync(join(tmpdir(), 'vm-idle-tool-'));
  try {
    mkdirSync(join(root, 'bin'));
    const log = join(root, 'pattern');
    writeFileSync(join(root, 'bin/pgrep'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$VM_PATTERN_LOG"\n', { mode: 0o755 });
    run('vm_tool_running', { PATH: join(root, 'bin') + ':' + process.env.PATH, VM_PATTERN_LOG: log });
    const pattern = readFileSync(log, 'utf8').trim().split('\n').at(-1);
    assert.match('/repo/scripts/vm/fedora.sh start --headless', new RegExp(pattern));
    assert.match('/repo/scripts/vm/vm.sh ubuntu exec cmd', new RegExp(pattern));
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
});
