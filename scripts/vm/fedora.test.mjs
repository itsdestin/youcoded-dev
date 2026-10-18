import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('./vm.sh', import.meta.url));
function fixture(t, baseline = true) {
  const root = mkdtempSync(join(tmpdir(), 'fedora-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5 }));
  const bin = join(root, 'bin'), home = join(root, 'vms'), dir = join(home, 'fedora-44-kde');
  mkdirSync(bin); mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, 'OVMF_CODE.fd'), 'TEST-FIRMWARE');
  if (baseline) for (const [name, data] of Object.entries({ 'disk.qcow2': 'BASE', 'OVMF_VARS.4m.fd': 'VARS', id_ed25519: 'KEY' })) writeFileSync(join(dir, name), data);
  const fake = `#!/usr/bin/env python3
import os,sys,json,pathlib
cmd=pathlib.Path(sys.argv[0]).name; a=sys.argv[1:]; d=pathlib.Path(os.environ['FAKE_DIR'])
with open(os.environ['FAKE_LOG'],'a') as f: f.write(json.dumps([cmd]+a)+'\\n')
if cmd=='qemu-img':
 if a[0]==os.environ.get('FAIL_IMG'): sys.exit(1)
 if a[0]=='create': pathlib.Path(a[-1]).write_text('SESSION')
 if a[0]=='convert': pathlib.Path(a[-1]).write_text('PROMOTED')
elif cmd=='qemu-system-x86_64':
 (d/'fedora-44-kde.pid').write_text('424242'); (d/'running').write_text('yes'); (d/'args').write_text('qemu-system-x86_64 '+' '.join(a))
elif cmd=='ps':
 if (d/'running').exists(): print((d/'args').read_text())
 else: sys.exit(1)
elif cmd=='socat':
 if sys.stdin.read().strip()=='quit': (d/'running').unlink(missing_ok=True)
elif cmd=='ssh':
 if a[-1]=='true':
  n=int((d/'ssh-probes').read_text()) if (d/'ssh-probes').exists() else 0
  (d/'ssh-probes').write_text(str(n+1))
  if n<int(os.environ.get('FAKE_SSH_FAILURES','0')): sys.exit(255)
 if a[-1].startswith('mktemp '): print('/tmp/youcoded-shot.ABC12345.png')
 if a[-1]=='sudo -n systemctl poweroff --no-block': (d/'running').unlink(missing_ok=True)
elif cmd=='scp':
 if os.environ.get('FAIL_SCP'): sys.exit(1)
 pathlib.Path(a[-1]).write_bytes(b'PNG')
elif cmd=='ss': print('LISTEN 0 5 127.0.0.1:8010 ')
elif cmd=='gh':
 if a[:2]==['release','list']: print('v1.4.0-beta'); sys.exit(0)
 dest=pathlib.Path(a[a.index('-D')+1]); (dest/('YouCoded.rpm' if os.environ.get('VM_LINUX_FMT')=='*.rpm' else 'YouCoded.AppImage')).write_text('APP')
`;
  for (const name of ['qemu-img', 'qemu-system-x86_64', 'ps', 'ssh', 'scp', 'socat', 'ss', 'gh', 'sleep']) writeFileSync(join(bin, name), fake, { mode: 0o755 });
  const env = { ...process.env, HOME: root, VM_HOME: home, VM_FEDORA_CODE: join(root, 'OVMF_CODE.fd'), FAKE_SSH_FAILURES: '0', VM_SHOTS: join(root, 'shots'), VM_HTTP_PORT: '8010', VM_LINUX_FMT: '*.AppImage', FAIL_IMG: '', FAIL_SCP: '', PATH: `${bin}:${process.env.PATH}`, FAKE_DIR: dir, FAKE_LOG: join(root, 'log') };
  const run = (...args) => spawnSync('bash', [cli, ...args], { env, encoding: 'utf8', timeout: 10000 });
  const ok = (...args) => { const r = run(...args); assert.equal(r.status, 0, r.stderr + r.stdout); return r.stdout; };
  const log = () => existsSync(env.FAKE_LOG) ? readFileSync(env.FAKE_LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  return { root, home, dir, env, run, ok, log };
}
const read = (f, n) => readFileSync(join(f.dir, n), 'utf8');

test('Fedora aliases dispatch without creating missing baselines', t => {
  const f = fixture(t, false);
  for (const alias of ['fedora', 'fedora-kde', 'kde']) {
    const r = f.run(alias, 'start', '--headless');
    assert.notEqual(r.status, 0); assert.match(r.stderr, /baseline/i);
  }
  assert.equal(existsSync(join(f.dir, 'session.qcow2')), false); assert.deepEqual(f.log(), []);
  assert.equal(existsSync(join(f.home, 'serve')), false); assert.equal(existsSync(f.env.VM_SHOTS), false);
});
test('headless startup creates isolated COW disk and resumes retained sessions', t => {
  const f = fixture(t); f.ok('kde', 'start', '--headless');
  assert.deepEqual(f.log().find(a => a[0] === 'qemu-img'), ['qemu-img', 'create', '-f', 'qcow2', '-F', 'qcow2', '-b', join(f.dir, 'disk.qcow2'), join(f.dir, 'session.qcow2')]);
  const launch = f.log().find(a => a[0] === 'qemu-system-x86_64'); assert.ok(launch);
  const args = launch.join(' ');
  for (const value of ['-name fedora-44-kde', '-machine q35', '-cpu host', '-smp 4', '-m 8G', 'virtio-vga-gl', 'egl-headless,rendernode=/dev/dri/renderD128', 'hostfwd=tcp:127.0.0.1:22227-:22', join(f.root, 'OVMF_CODE.fd'), 'session-vars.fd', 'qmp.socket', 'agent.sock']) assert.ok(args.includes(value), value);
  assert.ok(args.includes('discard=unmap,detect-zeroes=unmap'), 'Guest trim must work before future baseline compaction');
  assert.doesNotMatch(args, /\.iso|ubuntu|windows|tahoe/);
  assert.equal(read(f, 'disk.qcow2'), 'BASE'); assert.equal(read(f, 'session-vars.fd'), 'VARS');
  f.ok('fedora', 'stop', '--keep'); assert.equal(read(f, 'session.qcow2'), 'SESSION');
  assert.match(f.ok('fedora', 'status'), /not running.*retained/s);
  assert.match(f.ok('fedora', 'start'), /resum/i);
  assert.equal(f.log().filter(a => a[0] === 'qemu-img' && a[1] === 'create').length, 1);
  assert.ok(f.log().some(a => a.includes('gtk,gl=on')));
  assert.match(f.ok('fedora', 'view'), /GTK|shot/);
  f.ok('fedora', 'stop'); assert.equal(existsSync(join(f.dir, 'session.qcow2')), false);
});
test('startup waits for positive guest SSH readiness rather than only a QEMU PID', t => {
  const f = fixture(t); f.env.FAKE_SSH_FAILURES = '2';
  f.ok('fedora', 'start', '--headless');
  assert.equal(read(f, 'ssh-probes'), '3');
});
test('running promotion and mismatched PID refuse without deleting session state', t => {
  const f = fixture(t); f.ok('fedora', 'start', '--headless');
  assert.match(f.run('fedora', 'save-ready').stderr, /stop --keep/);
  writeFileSync(join(f.dir, 'args'), 'unrelated-process');
  for (const cmd of ['stop', 'start', 'save-ready', 'status']) assert.notEqual(f.run('fedora', cmd).status, 0);
  assert.equal(read(f, 'session.qcow2'), 'SESSION'); assert.equal(read(f, 'fedora-44-kde.pid'), '424242');
  assert.equal(f.log().some(a => a[0] === 'socat'), false);
});
for (const failure of ['check', 'compare']) test(`${failure} failure preserves baseline before promotion`, t => {
  const f = fixture(t); f.ok('fedora', 'start', '--headless'); f.ok('fedora', 'stop', '--keep');
  f.env.FAIL_IMG = failure;
  assert.notEqual(f.run('fedora', 'save-ready').status, 0);
  assert.equal(read(f, 'disk.qcow2'), 'BASE'); assert.equal(read(f, 'session.qcow2'), 'SESSION');
  assert.equal(existsSync(join(f.dir, 'disk.previous.qcow2')), false);
});
test('promotion verifies disk and retains guarded previous baseline', t => {
  const f = fixture(t); f.ok('fedora', 'start', '--headless'); f.ok('fedora', 'stop', '--keep'); f.ok('fedora', 'save-ready');
  assert.equal(read(f, 'disk.qcow2'), 'PROMOTED'); assert.equal(read(f, 'disk.previous.qcow2'), 'BASE');
  assert.equal(existsSync(join(f.dir, 'session.qcow2')), false);
  assert.deepEqual(f.log().filter(a => a[0] === 'qemu-img').map(a => a[1]), ['create', 'convert', 'check', 'compare']);
  f.ok('fedora', 'start', '--headless'); f.ok('fedora', 'stop', '--keep');
  assert.match(f.run('fedora', 'save-ready').stderr, /previous|backup/i);
  assert.equal(read(f, 'disk.previous.qcow2'), 'BASE');
});
test('screenshots use private guest Spectacle and dedicated SSH without filename injection', t => {
  const f = fixture(t);
  assert.notEqual(f.run('fedora', 'shot', "x'; touch /tmp/injected").status, 0); assert.deepEqual(f.log(), []);
  f.ok('fedora-kde', 'shot', 'desktop');
  assert.ok(existsSync(join(f.env.VM_SHOTS, 'desktop.png')));
  const ssh = f.log().filter(a => a[0] === 'ssh').map(a => a.join(' ')).join('\n');
  for (const value of ['-F /dev/null', '22227', 'StrictHostKeyChecking=accept-new', `${f.dir}/known_hosts`, `${f.dir}/id_ed25519`, 'keyboardtest@127.0.0.1', 'spectacle', 'mktemp', 'wayland-0', '/run/user/1000']) assert.ok(ssh.includes(value), value);
  f.env.FAIL_SCP = '1'; assert.notEqual(f.run('fedora', 'shot', 'missing').status, 0);
  f.ok('fedora', 'exec', 'id'); assert.ok(f.log().some(a => a[0] === 'ssh' && a.at(-1) === 'id'));
});
test('load uses native release selectors and safe HTTP download names', t => {
  const f = fixture(t);
  for (const selector of ['release', 'beta', 'v1.3.1', 'run:123']) f.ok('fedora', 'load', selector);
  const ssh = f.log().filter(a => a[0] === 'ssh').map(a => a.join(' ')).join('\n');
  assert.match(ssh, /http:\/\/10\.0\.2\.2:8010\/YouCoded.AppImage/); assert.match(ssh, /xattr::xdg\.origin\.url/); assert.doesNotMatch(ssh, /metadata::download-uri/);
  const file = join(f.root, 'local.AppImage'); writeFileSync(file, 'LOCAL'); f.ok('fedora', 'load', file);
  const bad = join(f.root, "x'; echo BAD.AppImage"); writeFileSync(bad, 'BAD');
  assert.notEqual(f.run('fedora', 'load', bad).status, 0);
  assert.equal(f.log().some(a => a[0] === 'ssh' && a.join(' ').includes('echo BAD')), false);
  f.env.VM_LINUX_FMT = '*.rpm'; f.ok('fedora', 'load', 'release');
  assert.ok(f.log().some(a => a[0] === 'ssh' && a.join(' ').includes('YouCoded.rpm')));
});
test('legacy unknown and Ubuntu selection remain unchanged', t => {
  const f = fixture(t); assert.equal(f.run('unknown', 'status').status, 2);
  const r = f.run('ubuntu', 'start', '--headless'); assert.notEqual(r.status, 0); assert.match(r.stderr, /ubuntu-24\.04/);
  assert.equal(f.log().some(a => a[0] === 'qemu-system-x86_64'), false);
});
