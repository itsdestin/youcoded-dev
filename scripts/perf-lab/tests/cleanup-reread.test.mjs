// Cleanup-only malformed /proc read rule (owner decision 2026-10-21). The strict policy for forensics and
// ownership proofs is pinned separately in proc-forensics.test.mjs and must stay unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readProc, readProcForCleanup, OwnedProcesses } from '../owned-processes.mjs';

const stat = (start = '2000') => `20 (x) ${['S', '10', '20', '20', ...Array(15).fill('0'), start].join(' ')}`;
const GOOD = 'Name:\tx\nState:\tS (sleeping)\nVmRSS:\t2048 kB\n';
const gone = () => Object.assign(Error('gone'), { code: 'ENOENT' });
// One scripted sequence of whole-process readings: {stat, status} or an Error for the stat read.
function scripted(readings) {
  let i = 0, pending = null;
  return path => {
    if (path.endsWith('/stat')) {
      if (!pending) pending = readings[Math.min(i++, readings.length - 1)];
      const r = pending; // the same reading serves stat-before; status/stat-after follow it
      if (r instanceof Error) { pending = null; throw r; }
      return r.stat;
    }
    if (path.endsWith('/cmdline')) return 'x\0';
    if (path.endsWith('/status')) { const r = pending; pending = null; return r.status; }
    throw Error('unexpected ' + path);
  };
}
const torn = (start = '2000') => ({ stat: stat(start), status: '' });
const good = (start = '2000') => ({ stat: stat(start), status: GOOD });
const run = (readings, expected = null) => {
  const exited = [], read = scripted(readings);
  const out = () => readProcForCleanup(20, () => readProc(20, { read, intentionalTeardown: true }), { expected, onExited: x => exited.push(x), pause: () => {} });
  return { exited, out };
};

test('cleanup: torn read then ENOENT is recorded exited-during-read and counts as gone', () => {
  const { exited, out } = run([torn(), gone()]);
  assert.equal(out(), null);
  assert.deepEqual(exited.map(e => [e.pid, e.starttime, e.reason]), [[20, '2000', 'exited-during-read']]);
});

test('cleanup: torn read, same identity still torn after the bound stays fatal', () => {
  const { exited, out } = run([torn()]);
  assert.throws(out, /Malformed proc status for 20/);
  assert.deepEqual(exited, []);
});

test('cleanup: torn read then a clean read of the same identity is returned (transient tear), nothing recorded', () => {
  const { exited, out } = run([torn(), good()]);
  assert.equal(out().starttime, '2000');
  assert.deepEqual(exited, []);
});

test('cleanup: torn read then different starttime = original exited; newcomer is not returned (never adopted or signalled)', () => {
  const { exited, out } = run([torn('2000'), good('7777')]);
  assert.equal(out(), null);
  assert.deepEqual(exited.map(e => [e.starttime, e.how]), [['2000', 'pid-reused']]);
});

test('cleanup: a different identity that is itself torn also proves the original gone', () => {
  const { exited, out } = run([torn('2000'), torn('7777')]);
  assert.equal(out(), null);
  assert.equal(exited[0].how, 'pid-reused-torn');
});

test('cleanup: non-malformed errors (permission) are never excused', () => {
  const eacces = Object.assign(Error('denied'), { code: 'EACCES' });
  assert.throws(() => readProcForCleanup(20, () => { throw eacces; }, { pause: () => {} }), /denied/);
});

test('cleanup rule is only active during OwnedProcesses cleanup; outside it a torn read still throws', () => {
  const fake = 777777; let phase = 'torn-then-gone', n = 0;
  const procRead = path => {
    if (!path.startsWith(`/proc/${fake}/`)) return readFileSync(path, 'utf8');
    if (path.endsWith('/stat')) { if (phase === 'torn-then-gone' && n++ > 0) throw gone(); return stat('4242'); }
    if (path.endsWith('/cmdline')) return 'x\0';
    return '';
  };
  const family = new OwnedProcesses({ leaderPid: fake, jobDir: '/tmp/perf-lab/reread-job', procRead });
  family.rereadPause = () => {};
  assert.throws(() => family.read(fake), /Malformed proc status/); // not teardown: fail closed as before
  n = 0; family.intentionalTeardown = true;
  assert.equal(family.read(fake), null);
  assert.equal(family.exitedDuringRead[0].starttime, '4242');
  assert.equal(family.exitedDuringRead[0].reason, 'exited-during-read');
});
