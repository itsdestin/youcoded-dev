import test from 'node:test';
import assert from 'node:assert/strict';
import { userInfo } from 'node:os';
// Model the actual producer's worker HOME BEFORE loading its ownership modules.
// Policy itself imports ownership, so it too must load AFTER the environment.
// No child, gate, socket, /proc read or signal is used in this regression.
const previous = process.env.HOME;
process.env.HOME = '/tmp/perf-lab-owner-home/reservation/home';
const { compositorPlan, compositorEnvironment } = await import('../supervised-compositor-policy.mjs');
const plan = compositorPlan('/tmp/perf-lab-owner-home/reservation');
assert.equal(process.env.HOME, compositorEnvironment(plan).HOME);
const { OwnedProcesses } = await import('../owned-processes.mjs');
const { prepareCompositorOwnership } = await import('../supervised-compositor-linux.mjs');
if (previous === undefined) delete process.env.HOME; else process.env.HOME = previous;
const ownerHome = userInfo().homedir;
const { accountHome } = await import('../owner-home.mjs');
const accountDeps = () => ({ platform: 'linux', uid: () => 1000, euid: () => 1000,
  account: () => ({ uid: 1000, homedir: '/tmp/owner-account/home' }), realpath: path => path });
test('owner account authority requires filesystem canonical home and ignores environment HOME', () => {
  const deps = accountDeps(), old = process.env.HOME;
  process.env.HOME = '/tmp/untrusted-claimed/home';
  try {
    assert.equal(accountHome(deps), '/tmp/owner-account/home');
    assert.throws(() => accountHome({ ...deps, realpath: () => '/tmp/actual-owner/home' }), /Unverified/);
    for (const code of ['ENOENT', 'EACCES']) assert.throws(() => accountHome({ ...deps,
      realpath: () => { throw Object.assign(Error('canonical home unavailable'), { code }); } }), { code });
  } finally { if (old === undefined) delete process.env.HOME; else process.env.HOME = old; }
});
test('owner account validation retains UID fences and non-Linux performs no account or filesystem reads', () => {
  const deps = accountDeps();
  for (const patch of [{ uid: () => 999 }, { euid: () => 0 },
    { account: () => ({ uid: 999, homedir: '/tmp/owner-account/home' }) }]) {
    assert.throws(() => accountHome({ ...deps, ...patch }), /Unverified/);
  }
  const forbidden = () => { throw Error('non-Linux I/O forbidden'); };
  assert.equal(accountHome({ platform: 'darwin', uid: forbidden, euid: forbidden,
    account: forbidden, realpath: forbidden }), null);
});
const stat = (pid, ppid) => `${pid} (fake gate) S ${ppid} ${pid} ${pid} ${Array(15).fill('0').join(' ')} ${pid * 10}`;
function fixture(jobDir = plan.runDir) {
  const commands = new Map([[10, 'supervisor'], [20, `python ${jobDir}/exec-plan.json`], [21, 'child']]);
  const parents = new Map([[10, 1], [20, 10], [21, 20]]), signals = [];
  const procRead = path => {
    const [, pidText, file] = /^\/proc\/(\d+)\/(\w+)$/.exec(path) ?? [];
    const pid = Number(pidText);
    if (!parents.has(pid)) throw Object.assign(Error('missing fake proc'), { code: 'ENOENT' });
    if (file === 'stat') return stat(pid, parents.get(pid));
    if (file === 'status') return 'Name:\tfake\nState:\tS\nVmRSS:\t1024 kB\n';
    if (file === 'cmdline') return commands.get(pid);
    throw Error('Unexpected fake proc path');
  };
  const options = { leaderPid: 20, parentPid: 10, jobDir, procRead, list: () => [20], signal: (...args) => signals.push(args) };
  const inspect = pid => ({ pid, ppid: parents.get(pid), pgrp: pid, session: pid, starttime: String(pid * 10), exe: '/usr/bin/python3', uid: process.getuid(), home: plan.home });
  return { options, inspect, commands, parents, signals };
}
test('private worker HOME permits its reservation through the actual proc-reader capture pipeline', () => {
  const f = fixture(), family = new OwnedProcesses(f.options);
  family.captureExecGate({ expectedExe: '/usr/bin/python3', expectedUid: process.getuid(), expectedHome: plan.home, inspect: f.inspect });
  assert.equal(family.leader.pid, 20);
  assert.equal(family.known.size, 1);
  assert.deepEqual(f.signals, []);
});
test('original owner paths remain denied despite private or subsequently swapped HOME claims', () => {
  const old = process.env.HOME;
  process.env.HOME = '/tmp/perf-lab-forged-owner/home';
  try {
    for (const jobDir of [ownerHome, `${ownerHome}/.claude/fixture`, `${ownerHome}/.config/youcoded/profile`]) {
      assert.throws(() => new OwnedProcesses({ ...fixture(jobDir).options,
        realHome: '/tmp/perf-lab-forged-owner/home' }), /real home|protected|segments|shorter/);
    }
    const f = fixture(), family = new OwnedProcesses(f.options);
    for (const marker of ['.claude', '.youcoded', '.config/youcoded']) {
      f.commands.set(20, `gate ${ownerHome}/${marker}/protected`);
      assert.throws(() => family.captureExecGate({ expectedExe: '/usr/bin/python3', expectedUid: process.getuid(), expectedHome: plan.home, inspect: f.inspect }), /Protected cmdline/);
      assert.equal(family.leader, undefined);
    }
    family.signalAll('SIGTERM');
    assert.deepEqual(f.signals, []);
  } finally { if (old === undefined) delete process.env.HOME; else process.env.HOME = old; }
});
test('failed identity capture never promotes a spawned numeric PID to signal authority', () => {
  const f = fixture(), family = new OwnedProcesses(f.options);
  assert.throws(() => family.captureExecGate({ expectedExe: '/usr/bin/python3',
    expectedUid: process.getuid(), expectedHome: plan.home,
    inspect: pid => ({ ...f.inspect(pid), home: ownerHome }) }), /identity\/UID\/exe\/HOME/);
  assert.equal(family.leader, undefined);
  assert.equal(family.known.size, 0);
  family.signalAll('SIGKILL');
  assert.deepEqual(f.signals, []);
});
test('pre-spawn ownership validation preserves self and intermediate ancestor fences', () => {
  const f = fixture();
  const family = prepareCompositorOwnership(plan, f.options);
  assert.equal(family.leader, undefined);
  assert.throws(() => family.protect({ pid: 10, ppid: 1, cmdline: 'supervisor' }), /self\/ancestor/);
  f.commands.set(20, `foreign ${ownerHome}/.claude/protected`);
  assert.throws(() => family.protect({ pid: 21, ppid: 20, cmdline: 'child' }), /Protected cmdline\/ancestor/);
  assert.deepEqual(f.signals, []);
  assert.throws(() => prepareCompositorOwnership(plan, { ...f.options, procRead: () => { throw Error('ancestry unavailable'); } }), /ancestry unavailable/);
});
