import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { treeFingerprint, buildApp } from '../build.mjs';

test('refuses a new build before launching tools when disk budget is unavailable', async () => {
  const r = repo();
  try {
    await assert.rejects(buildApp(r.root, { checkSpace: () => { throw new Error('disk budget blocked'); } }), /disk budget blocked/);
  } finally { r.close(); }
});

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-lab-fingerprint-'));
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Lab fixture', '-c', 'user.email=lab@example.invalid', '-c', 'commit.gpgsign=false', ...args], { stdio: 'pipe' });
  git('init', '-q');
  git('commit', '--allow-empty', '-qm', 'Fixture\n\nSubmitted via YouCoded Assistant');
  return { root, git, close: () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }) };
}

test('fingerprint changes when bytes inside an already-untracked directory change', async () => {
  const r = repo();
  try {
    fs.mkdirSync(path.join(r.root, 'new'));
    const file = path.join(r.root, 'new', 'actor.js');
    fs.writeFileSync(file, 'first');
    const before = await treeFingerprint(r.root);
    fs.writeFileSync(file, 'second');
    assert.notEqual((await treeFingerprint(r.root)).dirty, before.dirty);
  } finally { r.close(); }
});

test('fingerprint handles spaces and leading whitespace in untracked names', async () => {
  const r = repo();
  try {
    const file = path.join(r.root, ' leading space.js');
    fs.writeFileSync(file, 'first');
    const before = await treeFingerprint(r.root);
    fs.writeFileSync(file, 'second');
    assert.notEqual((await treeFingerprint(r.root)).dirty, before.dirty);
  } finally { r.close(); }
});

test('fingerprint hashes raw binary bytes rather than replacement-character text', async () => {
  const r = repo();
  try {
    const file = path.join(r.root, 'asset.bin');
    fs.writeFileSync(file, Buffer.from([0x80]));
    const before = await treeFingerprint(r.root);
    fs.writeFileSync(file, Buffer.from([0x81]));
    assert.notEqual((await treeFingerprint(r.root)).dirty, before.dirty);
  } finally { r.close(); }
});

test('fingerprint refuses untracked symlinks instead of reading outside the checkout', { skip: process.platform === 'win32' }, async () => {
  const r = repo();
  const outside = r.root + '-outside';
  try {
    fs.writeFileSync(outside, 'not a build input');
    fs.symlinkSync(outside, path.join(r.root, 'link'));
    await assert.rejects(treeFingerprint(r.root), /regular file|symlink/i);
  } finally { r.close(); fs.rmSync(outside, { force: true }); }
});

test('fingerprint distinguishes two modifications of an already-tracked binary', async () => {
  const r = repo();
  try {
    const file = path.join(r.root, 'asset.bin');
    fs.writeFileSync(file, Buffer.from([0, 1])); r.git('add', 'asset.bin');
    r.git('commit', '-qm', 'Binary fixture\n\nSubmitted via YouCoded Assistant');
    fs.writeFileSync(file, Buffer.from([0, 2])); const before = await treeFingerprint(r.root);
    fs.writeFileSync(file, Buffer.from([0, 3]));
    assert.notEqual((await treeFingerprint(r.root)).dirty, before.dirty);
  } finally { r.close(); }
});
