// Offline: argv construction, exit classification and the run wrapper with a fake child process. No systemd, no real memory pressure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AS_HEADROOM_MB, BOUND, boundedArgv, chooseBound, classifyBoundedExit, detectBound, runBounded } from '../bounded-exec.mjs';

test('chooseBound prefers the user cgroup scope, falls back to prlimit, never silently unbounded', () => {
  assert.equal(chooseBound({ systemdUser: true, prlimit: true }), BOUND.systemd);
  assert.equal(chooseBound({ systemdUser: false, prlimit: true }), BOUND.prlimit);
  assert.equal(chooseBound({}), BOUND.none);
});

test('boundedArgv builds the exact wrapped command and refuses an unbounded run', () => {
  assert.deepEqual(boundedArgv(BOUND.systemd, 512, ['node', 'x.mjs']), ['systemd-run', '--user', '--scope', '-q', '-p', 'MemoryMax=512M', '-p', 'MemorySwapMax=0', '--', 'node', 'x.mjs']);
  assert.deepEqual(boundedArgv(BOUND.prlimit, 512, ['node']), ['prlimit', `--as=${(512 + AS_HEADROOM_MB) * 1024 * 1024}`, '--', 'node']);
  assert.throws(() => boundedArgv(BOUND.none, 512, ['node']), /unbounded/);
  assert.throws(() => boundedArgv(BOUND.systemd, 10, ['node']), /64..32768/);
  assert.throws(() => boundedArgv(BOUND.systemd, 512, []), /non-empty/);
});

test('detectBound probes each tool with an injected runner', () => {
  const calls = [];
  const run = (cmd) => { calls.push(cmd); return { status: cmd === 'systemd-run' ? 1 : 0 }; };
  assert.deepEqual(detectBound({ run }), { bound: BOUND.prlimit, systemdUser: false, prlimit: true });
  assert.deepEqual(calls, ['systemd-run', 'prlimit']);
  assert.equal(detectBound({ run: () => { throw new Error('no such tool'); } }).bound, BOUND.none);
});

test('classifyBoundedExit: bound kills are their own status; timeouts and ordinary failures are not confused with them', () => {
  assert.equal(classifyBoundedExit({ bound: BOUND.systemd, code: 0, signal: null }), 'ok');
  assert.equal(classifyBoundedExit({ bound: BOUND.systemd, code: null, signal: 'SIGKILL' }), 'failed:memory-bound');
  assert.equal(classifyBoundedExit({ bound: BOUND.systemd, code: 137, signal: null }), 'failed:memory-bound');
  assert.equal(classifyBoundedExit({ bound: BOUND.prlimit, code: 1, signal: null, stderr: "code: 'ERR_MEMORY_ALLOCATION_FAILED'" }), 'failed:memory-bound');
  assert.equal(classifyBoundedExit({ bound: BOUND.prlimit, code: 134, signal: null }), 'failed:memory-bound');
  assert.equal(classifyBoundedExit({ bound: BOUND.prlimit, code: 1, signal: null, stderr: 'FATAL ERROR: Reached heap limit Allocation failed' }), 'failed:memory-bound');
  assert.equal(classifyBoundedExit({ bound: BOUND.systemd, code: 1, signal: null, stderr: 'TypeError: x is not a function' }), 'failed:exit');
  assert.equal(classifyBoundedExit({ bound: BOUND.systemd, code: null, signal: 'SIGTERM', timedOut: true }), 'failed:timeout');
});

const fakeChild = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.killed = []; c.kill = (sig) => { c.killed.push(sig); return true; }; return c; };

test('runBounded: success returns stdout; a bound kill is a recorded row; spawn receives the wrapped argv', async () => {
  const seen = []; let child;
  const spawn = (cmd, args) => { seen.push([cmd, ...args]); child = fakeChild(); return child; };
  const p = runBounded({ argv: ['node', 'job.mjs'], memoryMaxMb: 256, bound: BOUND.systemd, spawn });
  child.stdout.emit('data', '{"ok":true}\n'); child.emit('close', 0, null);
  const ok = await p; assert.equal(ok.status, 'ok'); assert.equal(ok.stdout, '{"ok":true}\n'); assert.equal(seen[0][0], 'systemd-run'); assert.ok(seen[0].includes('MemoryMax=256M'));
  const q = runBounded({ argv: ['node', 'job.mjs'], memoryMaxMb: 256, bound: BOUND.systemd, spawn });
  child.emit('close', null, 'SIGKILL');
  const killed = await q; assert.equal(killed.status, 'failed:memory-bound'); assert.equal(killed.signal, 'SIGKILL');
});

test('runBounded: no available bound is a recorded failure, not an unbounded run; a hung child is stopped by pid on timeout', async () => {
  let spawned = false;
  const none = await runBounded({ argv: ['node'], memoryMaxMb: 256, bound: BOUND.none, spawn: () => { spawned = true; } });
  assert.equal(none.status, 'failed:no-memory-bound'); assert.equal(spawned, false);
  let child;
  const hung = runBounded({ argv: ['node'], memoryMaxMb: 256, bound: BOUND.prlimit, timeoutMs: 20, spawn: () => (child = fakeChild()) });
  await new Promise((r) => setTimeout(r, 60)); assert.deepEqual(child.killed, ['SIGTERM']);
  child.emit('close', null, 'SIGTERM');
  assert.equal((await hung).status, 'failed:timeout');
  const spawnFails = await runBounded({ argv: ['node'], memoryMaxMb: 256, bound: BOUND.prlimit, spawn: () => { throw new Error('ENOENT'); } });
  assert.equal(spawnFails.status, 'failed:exit'); assert.match(spawnFails.stderr, /spawn failed/);
});

test('runBounded: an env is passed to the child so a job spec never has to ride on the command line', async () => {
  let opts, child;
  const spawn = (cmd, args, o) => { opts = o; child = fakeChild(); return child; };
  const p = runBounded({ argv: ['node', 'job.mjs'], memoryMaxMb: 256, bound: BOUND.systemd, env: { A: '1' }, spawn });
  child.emit('close', 0, null); await p;
  assert.deepEqual(opts.env, { A: '1' });
  const q = runBounded({ argv: ['node', 'job.mjs'], memoryMaxMb: 256, bound: BOUND.systemd, spawn });
  child.emit('close', 0, null); await q;
  assert.equal('env' in opts, false, 'no env given -> the default inherited environment');
});
