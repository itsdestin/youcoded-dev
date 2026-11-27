import realTest from 'node:test';
// WHY (emergency fix 2026-11-27): this file re-runs ITSELF as a child process ('child' mode below).
// Without this guard every child also ran the whole suite, spawning 8+ more children each: an endless
// fork bomb that filled 121 GB RAM and crashed the desktop on 11-18 and twice on 11-27. Children now
// register no tests, so they only do their one lock attempt and exit.
const test = process.argv[2] === 'child' ? () => {} : realTest;
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tryAcquireLock, isStale, processStartTime } from './lock.mjs';

const here = fileURLToPath(import.meta.url);
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const plant = (lock, owner) => { fs.mkdirSync(lock); if (owner) fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify(owner)); };
// A pid that is certainly gone: a child that already exited.
const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid;

test('a free lock is acquired, records its owner, and release removes it', t => {
  const lock = path.join(tmp(t), 'a.lock');
  const got = tryAcquireLock(lock);
  assert.equal(got.acquired, true);
  const owner = JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8'));
  assert.equal(owner.pid, process.pid);
  assert.equal(owner.host, os.hostname());
  got.release();
  assert.equal(fs.existsSync(lock), false);
});

test('a lock held by a live process is respected', t => {
  const lock = path.join(tmp(t), 'a.lock');
  plant(lock, { pid: process.pid, host: os.hostname(), startTime: processStartTime(process.pid), acquiredAt: new Date().toISOString() });
  const got = tryAcquireLock(lock);
  assert.equal(got.acquired, false);
  assert.equal(got.owner.pid, process.pid);
  assert.ok(fs.existsSync(lock));
});

test('a lock whose owner process is gone is taken over', t => {
  const lock = path.join(tmp(t), 'a.lock');
  plant(lock, { pid: deadPid(), host: os.hostname(), acquiredAt: new Date().toISOString() });
  const got = tryAcquireLock(lock);
  assert.equal(got.acquired, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')).pid, process.pid);
  assert.deepEqual(fs.readdirSync(path.dirname(lock)), ['a.lock'], 'no stale leftovers');
});

test('a live pid with a different start time (pid reuse) is stale', t => {
  const lock = path.join(tmp(t), 'a.lock');
  plant(lock, { pid: process.pid, host: os.hostname(), startTime: '1', acquiredAt: new Date().toISOString() });
  assert.equal(isStale(lock).stale, true);
});

test('another machine\'s lock is respected until the age ceiling', t => {
  const lock = path.join(tmp(t), 'a.lock');
  plant(lock, { pid: deadPid(), host: 'some-other-host', acquiredAt: new Date().toISOString() });
  assert.equal(tryAcquireLock(lock).acquired, false);
  assert.equal(tryAcquireLock(lock, { maxAgeMs: -1 }).acquired, true);
});

test('an owner-less lock waits for the ceiling, then is taken over', t => {
  const lock = path.join(tmp(t), 'a.lock');
  plant(lock, null);
  assert.equal(tryAcquireLock(lock).acquired, false);
  assert.equal(tryAcquireLock(lock, { maxAgeMs: -1 }).acquired, true);
});

test('release does not remove a lock someone else now holds', t => {
  const lock = path.join(tmp(t), 'a.lock');
  const first = tryAcquireLock(lock);
  fs.rmSync(lock, { recursive: true });
  plant(lock, { pid: process.pid, host: os.hostname(), acquiredAt: 'other' });
  first.release();
  assert.ok(fs.existsSync(lock));
});

test('a failed owner write leaves no lock behind', t => {
  const lock = path.join(tmp(t), 'a.lock');
  assert.throws(() => tryAcquireLock(lock, { beforeOwnerWrite() { throw new Error('boom'); } }), /boom/);
  assert.equal(fs.existsSync(lock), false);
});

test('concurrent acquire of a free lock: exactly one process wins', async t => {
  const lock = path.join(tmp(t), 'a.lock');
  const run = () => new Promise(res => {
    const p = spawn(process.execPath, [here, 'child', lock], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; p.stdout.on('data', d => { out += d; }); p.on('close', () => res(out.trim()));
  });
  const results = await Promise.all(Array.from({ length: 8 }, run));
  assert.equal(results.filter(r => r === 'won').length, 1, results.join(','));
});

test('concurrent takeover of a dead owner\'s lock: exactly one process wins', async t => {
  for (let round = 0; round < 5; round++) {
    const lock = path.join(tmp(t), 'a.lock');
    plant(lock, { pid: deadPid(), host: os.hostname(), acquiredAt: new Date().toISOString() });
    const run = () => new Promise(res => {
      const p = spawn(process.execPath, [here, 'child', lock], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = ''; p.stdout.on('data', d => { out += d; }); p.on('close', () => res(out.trim()));
    });
    const results = await Promise.all(Array.from({ length: 8 }, run));
    assert.equal(results.filter(r => r === 'won').length, 1, results.join(','));
  }
});

// Child mode: try once, print the result, and STAY ALIVE briefly so a winner's lock stays live while rivals try.
if (process.argv[2] === 'child') {
  const got = tryAcquireLock(process.argv[3]);
  console.log(got.acquired ? 'won' : 'lost');
  setTimeout(() => process.exit(0), 400);
}
