import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { provisionDependencies, dependencyTreeHash } from './workspace-dependencies.mjs';
import * as dependencies from './workspace-dependencies.mjs';

const FAKE = `const fs=require('node:fs'),path=require('node:path');
if(process.argv.includes('--version')){console.log(process.env.FAKE_NPM_VERSION||'12.2.0');process.exit(0)}
if(process.argv.includes('config')){console.log(process.env.FAKE_GLOBAL_CONFIG||'/nonexistent-fixture-global.npmrc');process.exit(0)}
if(!process.argv.includes('ci'))process.exit(2);
fs.appendFileSync(process.env.INSTALL_COUNT,'ci\\n');
if(process.env.INSTALL_FAIL){console.error('simulated install failure');process.exit(1)}
if(process.env.INSTALL_DELAY_MS)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Number(process.env.INSTALL_DELAY_MS));
const lock=JSON.parse(fs.readFileSync('package-lock.json'));
for(const [rel,pkg] of Object.entries(lock.packages)){if(!rel||rel===process.env.OMIT_PACKAGE)continue;fs.mkdirSync(rel,{recursive:true});fs.writeFileSync(path.join(rel,'package.json'),JSON.stringify({version:pkg.version}));fs.writeFileSync(path.join(rel,'index.js'),'original');}
`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exact-deps-'));
  const before = { ...process.env };
  t.after(() => {
    for (const name of Object.keys(process.env)) if (!(name in before)) delete process.env[name];
    Object.assign(process.env, before);
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  });
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  const fake = path.join(root, 'npm.cjs'); fs.writeFileSync(fake, FAKE);
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\nexec '${process.execPath}' '${fake}' "$@"\n`, { mode: 0o755 });
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  process.env.INSTALL_COUNT = path.join(root, 'installs');
  const cache = path.join(root, 'cache');
  function project(name, version = '1.5.0', extra = {}) {
    const dir = path.join(root, name); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', dependencies: { dep: version } }));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'fixture' }, 'node_modules/dep': { version }, ...extra } }));
    return dir;
  }
  const count = () => fs.existsSync(process.env.INSTALL_COUNT) ? fs.readFileSync(process.env.INSTALL_COUNT, 'utf8').trim().split('\n').length : 0;
  return { root, cache, project, count };
}

test('symlink chains cannot escape the real dependency root', t => {
  const f = fixture(t), tree = path.join(f.root, 'tree');
  fs.mkdirSync(tree);
  fs.writeFileSync(path.join(f.root, 'outside'), 'shared external file');
  fs.writeFileSync(path.join(tree, 'outside'), 'lexical decoy');
  fs.symlinkSync('.', path.join(tree, 'x'));
  fs.symlinkSync('x/../outside', path.join(tree, 'y'));
  assert.throws(() => dependencyTreeHash(tree), /escapes/);
});

test('changing effective global npm configuration invalidates the source', t => {
  const f = fixture(t), a = f.project('a');
  process.env.FAKE_GLOBAL_CONFIG = path.join(f.root, 'global.npmrc');
  fs.writeFileSync(process.env.FAKE_GLOBAL_CONFIG, 'install-strategy=hoisted\n');
  provisionDependencies(a, f.cache);
  fs.writeFileSync(process.env.FAKE_GLOBAL_CONFIG, 'install-strategy=nested\n');
  provisionDependencies(a, f.cache);
  assert.equal(f.count(), 2);
});

test('lock waiting covers the complete install timeout and publication', () => {
  assert.ok(dependencies.DEPENDENCY_LOCK_WAIT_MS >= dependencies.DEPENDENCY_INSTALL_TIMEOUT_MS + 60_000);
});

test('a staging allocation failure releases its owned source lock', t => {
  const f = fixture(t), a = f.project('a'), makeTemp = fs.mkdtempSync;
  t.mock.method(fs, 'mkdtempSync', (prefix, ...args) => {
    if (String(prefix).includes('.building-')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    return makeTemp(prefix, ...args);
  });
  assert.throws(() => provisionDependencies(a, f.cache), /disk full/);
  assert.deepEqual(fs.readdirSync(f.cache), []);
});

test('different lockfiles coexist and an unchanged managed resume needs no install', t => {
  const f = fixture(t), a = f.project('a'), b = f.project('b', '1.6.0');
  provisionDependencies(a, f.cache); provisionDependencies(b, f.cache);
  assert.equal(f.count(), 2);
  assert.match(provisionDependencies(a, f.cache).join(), /reused/);
  assert.equal(f.count(), 2);
});

test('postinstall inputs and npm toolchain invalidate the reusable source', t => {
  const f = fixture(t), a = f.project('a');
  fs.mkdirSync(path.join(a, 'scripts'));
  fs.writeFileSync(path.join(a, 'scripts', 'patch.js'), 'first');
  provisionDependencies(a, f.cache);
  fs.writeFileSync(path.join(a, 'scripts', 'patch.js'), 'second');
  provisionDependencies(a, f.cache);
  assert.equal(f.count(), 2);
  process.env.FAKE_NPM_VERSION = '12.3.0';
  provisionDependencies(a, f.cache);
  assert.equal(f.count(), 3);
});

test('consumer writes cannot alter the cache and a patched resume is preserved', t => {
  const f = fixture(t), a = f.project('a'), b = f.project('b');
  provisionDependencies(a, f.cache);
  fs.writeFileSync(path.join(a, 'node_modules/dep/index.js'), 'personal patch');
  assert.throws(() => provisionDependencies(a, f.cache), /Locally modified dependencies preserved/);
  provisionDependencies(b, f.cache);
  assert.equal(f.count(), 1);
  assert.equal(fs.readFileSync(path.join(b, 'node_modules/dep/index.js'), 'utf8'), 'original');
  assert.equal(fs.readFileSync(path.join(a, 'node_modules/dep/index.js'), 'utf8'), 'personal patch');
});

test('unmanaged installs are never overwritten', t => {
  const f = fixture(t), a = f.project('a');
  fs.mkdirSync(path.join(a, 'node_modules'));
  fs.writeFileSync(path.join(a, 'node_modules/keep'), 'mine');
  assert.throws(() => provisionDependencies(a, f.cache), /Unmanaged dependencies preserved/);
  assert.equal(fs.readFileSync(path.join(a, 'node_modules/keep'), 'utf8'), 'mine');
  assert.equal(f.count(), 0);
});

test('a failed install publishes nothing and preserves the previous managed installation', t => {
  const f = fixture(t), a = f.project('a');
  provisionDependencies(a, f.cache);
  const lockFile = path.join(a, 'package-lock.json'), lock = JSON.parse(fs.readFileSync(lockFile));
  lock.packages['node_modules/dep'].version = '1.6.0'; fs.writeFileSync(lockFile, JSON.stringify(lock));
  process.env.INSTALL_FAIL = '1';
  assert.throws(() => provisionDependencies(a, f.cache), /Private npm ci failed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(a, 'node_modules/dep/package.json'))).version, '1.5.0');
  assert.equal(fs.readdirSync(f.cache).filter(n => !n.includes('.')).length, 1);
});

test('native optional packages for this machine are required before publishing', t => {
  const f = fixture(t), a = f.project('a', '1.5.0', { 'node_modules/native': { version: '1.0.0', optional: true, os: [process.platform], cpu: [process.arch] } });
  process.env.OMIT_PACKAGE = 'node_modules/native';
  assert.throws(() => provisionDependencies(a, f.cache), /does not match lockfile: node_modules\/native/);
  assert.deepEqual(fs.readdirSync(f.cache), []);
  assert.equal(fs.existsSync(path.join(a, 'node_modules')), false);
});

test('an offline matching source is reusable and an offline miss fails closed', t => {
  const f = fixture(t), a = f.project('a'), b = f.project('b'), c = f.project('c', '1.6.0');
  provisionDependencies(a, f.cache);
  process.env.INSTALL_FAIL = 'offline';
  provisionDependencies(b, f.cache);
  assert.equal(f.count(), 1);
  assert.throws(() => provisionDependencies(c, f.cache), /Private npm ci failed/);
  assert.equal(fs.existsSync(path.join(c, 'node_modules')), false);
});

test('two concurrent sessions prepare one exact source', async t => {
  const f = fixture(t), a = f.project('a'), b = f.project('b');
  process.env.INSTALL_DELAY_MS = '500';
  const code = `import {provisionDependencies} from ${JSON.stringify(new URL('./workspace-dependencies.mjs', import.meta.url).href)};provisionDependencies(process.argv[1],process.argv[2]);`;
  const start = project => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, project, f.cache], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = ''; child.stderr.on('data', data => { err += data; });
    return once(child, 'exit').then(([status]) => assert.equal(status, 0, err));
  };
  await Promise.all([start(a), start(b)]);
  assert.equal(f.count(), 1);
});
