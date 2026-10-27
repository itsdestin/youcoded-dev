// Acceptance A5: a run lock that refuses a concurrent run and only reclaims a PROVEN-dead one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireRunLock, procStartTime } from '../run-lock.mjs';

const temp = () => mkdtempSync(join(tmpdir(), 'runlock-'));
const alive = (table) => (pid) => (Object.hasOwn(table, pid) ? table[pid] : null);

test('procStartTime parses starttime even when the command name contains spaces and parentheses', () => {
  const fields = Array.from({ length: 50 }, (_, i) => String(i + 3));          // fields 3.. after ") "
  const stat = `123 (weird) name (x)) ${fields.join(' ')}`;
  // field 22 overall = index 19 after the state field (field 3)
  assert.equal(procStartTime(123, { read: () => stat }), fields[19]);
  assert.equal(procStartTime(1, { read: () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); } }), null);
  assert.throws(() => procStartTime(1, { read: () => '1 (a) S 1' }), /cannot parse/);
});

test('a second concurrent run is refused while the holder is verifiably alive, and nothing is deleted', () => {
  const dir = temp(); const path = join(dir, 'run.lock');
  try {
    const first = acquireRunLock(path, { pid: 10, startTime: alive({ 10: '500' }) });
    assert.throws(() => acquireRunLock(path, { pid: 11, startTime: alive({ 10: '500', 11: '600' }) }), /another perf-lab run holds the lock \(pid 10/);
    assert.ok(existsSync(path));
    first.release();
    assert.equal(existsSync(path), false);
    acquireRunLock(path, { pid: 11, startTime: alive({ 11: '600' }) }).release();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a lock is stale only when its pid is gone or reused with a different start time', () => {
  for (const table of [{ 12: '700' }, { 10: '999', 12: '700' }]) {   // pid 10 gone / pid 10 reused by another process
    const dir = temp(); const path = join(dir, 'run.lock');
    try {
      writeFileSync(path, JSON.stringify({ pid: 10, startTime: '500', createdAt: 'then' }));
      const lock = acquireRunLock(path, { pid: 12, startTime: alive(table) });
      assert.equal(JSON.parse(readFileSync(path, 'utf8')).pid, 12);
      assert.deepEqual(readdirSync(dir), ['run.lock'], 'the stale file was moved aside and removed');
      lock.release();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('an unreadable or malformed lock is refused, never auto-removed', () => {
  for (const body of ['not json', '{"pid":"x"}', '{}']) {
    const dir = temp(); const path = join(dir, 'run.lock');
    try {
      writeFileSync(path, body);
      assert.throws(() => acquireRunLock(path, { pid: 12, startTime: alive({ 12: '700' }) }), /cannot be read|malformed/);
      assert.equal(readFileSync(path, 'utf8'), body);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('release removes only a lock this process still owns', () => {
  const dir = temp(); const path = join(dir, 'run.lock');
  try {
    const mine = acquireRunLock(path, { pid: 10, startTime: alive({ 10: '500' }) });
    writeFileSync(path, JSON.stringify({ pid: 99, startTime: '1' }));       // someone else took over
    mine.release();
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).pid, 99);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
