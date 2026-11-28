import realTest from 'node:test';
// WHY (fork bomb, 2026-11-27): this file once re-ran ITSELF as the race child, and every child re-ran the
// whole suite, crashing the desktop three times. Children now run lock-child.mjs, which has no tests. This
// guard stays as a second fence: if anything ever runs this file with 'child' again, it registers nothing.
const test = process.argv[2] === 'child' ? () => {} : realTest;
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tryAcquireLock, isStale, processStartTime, removeIfStillAbandoned, TAKEOVER_STALE_MS } from './lock.mjs';

const childScript = fileURLToPath(new URL('./lock-child.mjs', import.meta.url));
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
    const p = spawn(process.execPath, [childScript, lock], { stdio: ['ignore', 'pipe', 'inherit'] });
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
      const p = spawn(process.execPath, [childScript, lock], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = ''; p.stdout.on('data', d => { out += d; }); p.on('close', () => res(out.trim()));
    });
    const results = await Promise.all(Array.from({ length: 8 }, run));
    assert.equal(results.filter(r => r === 'won').length, 1, results.join(','));
  }
});

// WHY (review 2026-11-27): a slow taker must never remove a LIVE lock that replaced the dead one it judged.
test('takeover leaves alone a live lock that replaced the judged dead one', t => {
  const lock = path.join(tmp(t), 'a.lock');
  const dead = { pid: deadPid(), host: os.hostname(), acquiredAt: new Date().toISOString() };
  plant(lock, dead);
  const judgedIno = fs.statSync(lock).ino;
  fs.rmSync(lock, { recursive: true });                 // another taker cleared it...
  const live = tryAcquireLock(lock);                    // ...and a live process took it
  assert.equal(live.acquired, true);
  assert.equal(removeIfStillAbandoned(lock, judgedIno, dead), false);
  assert.equal(fs.existsSync(path.join(lock, 'owner.json')), true);
  live.release();
});

test('takeover backs off while another taker holds the side lock, and clears an abandoned one', t => {
  const lock = path.join(tmp(t), 'a.lock');
  const dead = { pid: deadPid(), host: os.hostname(), acquiredAt: new Date().toISOString() };
  plant(lock, dead);
  fs.mkdirSync(`${lock}.takeover`);
  assert.equal(tryAcquireLock(lock).acquired, false);   // fresh side lock: wait, remove nothing
  assert.equal(fs.existsSync(lock), true);
  const old = new Date(Date.now() - TAKEOVER_STALE_MS - 5000);
  fs.utimesSync(`${lock}.takeover`, old, old);          // a taker that crashed mid-takeover
  tryAcquireLock(lock);                                 // clears the abandoned side lock
  const got = tryAcquireLock(lock);
  assert.equal(got.acquired, true);
  got.release();
  assert.equal(fs.existsSync(`${lock}.takeover`), false);
});
