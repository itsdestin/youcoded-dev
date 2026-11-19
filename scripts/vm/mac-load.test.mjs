import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Card #16 (d): `vm.sh mac load` — stubs only, no VM is started and nothing touches a network or a guest.
// Real proof needs a Mac guest boot (the xattr/curl line only means anything on macOS).
const cli = fileURLToPath(new URL('./vm.sh', import.meta.url));
function fixture(t, ghFiles) {
  const root = mkdtempSync(join(tmpdir(), 'mac-load-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5 }));
  const bin = join(root, 'bin'); mkdirSync(bin);
  // One stub for every external tool: logs argv as JSON; `gh` creates the files named in FAKE_GH_FILES.
  const fake = `#!/usr/bin/env python3
import os,sys,json,pathlib
cmd=pathlib.Path(sys.argv[0]).name; a=sys.argv[1:]
with open(os.environ['FAKE_LOG'],'a') as f: f.write(json.dumps([cmd]+a)+'\\n')
if cmd=='ss': print('LISTEN 0 5 127.0.0.1:8010 ')
if cmd=='gh':
  dest=pathlib.Path(a[a.index('-D')+1])
  for rel in json.loads(os.environ['FAKE_GH_FILES']):
    p=dest/rel; p.parent.mkdir(parents=True,exist_ok=True); p.write_text('DMG')
`;
  for (const name of ['ssh', 'gh', 'ss']) writeFileSync(join(bin, name), fake, { mode: 0o755 });
  const env = { ...process.env, HOME: root, VM_HOME: join(root, 'vms'), VM_SHOTS: join(root, 'shots'), VM_HTTP_PORT: '8010',
    PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: join(root, 'log'), FAKE_GH_FILES: JSON.stringify(ghFiles) };
  const run = (...args) => spawnSync('bash', [cli, 'mac', ...args], { env, encoding: 'utf8', timeout: 20000 });
  const log = () => existsSync(env.FAKE_LOG) ? readFileSync(env.FAKE_LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  return { root, env, run, log, served: n => existsSync(join(root, 'vms/serve', n)) };
}
const sshCmd = f => f.log().filter(l => l[0] === 'ssh').map(l => l[l.length - 1]).join('\n');

test('mac load of a run whose dmg is not named *-x64.dmg keeps it instead of "nothing matched"', t => {
  const f = fixture(t, ['YouCoded-mac/YouCoded.dmg']);
  const r = f.run('load', 'run:99');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stderr, /nothing matched .*x64\.dmg; using YouCoded\.dmg/);
  assert.ok(f.served('YouCoded.dmg'));
});

test('mac load prefers the x64 dmg when a run holds both architectures', t => {
  const f = fixture(t, ['a/YouCoded-Installer-1.4.0-arm64.dmg', 'a/YouCoded-Installer-1.4.0-x64.dmg', 'a/latest-mac.yml']);
  const r = f.run('load', 'run:99');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(f.served('YouCoded-Installer-1.4.0-x64.dmg'));
  assert.doesNotMatch(r.stderr, /arm64/);
});

test('mac load with only an arm64 dmg warns that the x64 guest cannot run it', t => {
  const f = fixture(t, ['YouCoded-Installer-1.4.0-arm64.dmg']);
  const r = f.run('load', 'run:99');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /arm64 build/);
});

test('mac load with no installer at all says so and fails', t => {
  const f = fixture(t, ['notes.txt']);
  const r = f.run('load', 'run:99');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /nothing matched/);
});

test('a file name with spaces and an apostrophe is encoded in the URL and quoted for the guest shell', t => {
  const f = fixture(t, []);
  const file = join(f.root, "You Coded's Installer-1.0-x64.dmg"); writeFileSync(file, 'DMG');
  const r = f.run('load', file);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const cmd = sshCmd(f);
  assert.match(cmd, /http:\/\/10\.0\.2\.2:8010\/You%20Coded%27s%20Installer-1\.0-x64\.dmg/);
  assert.match(cmd, /-o ~\/Downloads\/You\\ Coded\\'s\\ Installer-1\.0-x64\.dmg /);
  assert.doesNotMatch(cmd, /Downloads\/You Coded/, 'a raw space would split the guest command');
});

// Review 2026-11-10: the "any file in incoming/" fallback was lost, and ties were guessed.
test('a run artifact with another installer type (.zip) still loads, with a note', t => {
  const f = fixture(t, ['pkg/YouCoded-1.4.0.zip', 'pkg/latest-mac.yml']);
  const r = f.run('load', 'run:99');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stderr, /using YouCoded-1\.4\.0\.zip/);
  assert.ok(f.served('YouCoded-1.4.0.zip'));
});

test('several candidates and none matching the installer pattern: refuses and lists them, loads nothing', t => {
  const f = fixture(t, ['a/One.dmg', 'a/Two.dmg']);
  const r = f.run('load', 'run:99');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /One\.dmg/); assert.match(r.stderr, /Two\.dmg/);
  assert.ok(!f.served('One.dmg') && !f.served('Two.dmg'));
  assert.equal(f.log().filter(l => l[0] === 'ssh').length, 0, 'the guest was never contacted');
});

test('several candidates but one matches the installer pattern: that one is chosen', t => {
  const f = fixture(t, ['a/Other.dmg', 'a/YouCoded-Installer-1.4.0-x64.dmg', 'a/Extra.zip']);
  const r = f.run('load', 'run:99');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(f.served('YouCoded-Installer-1.4.0-x64.dmg'));
});
