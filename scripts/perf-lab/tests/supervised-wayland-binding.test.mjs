import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { validateSupervisorPlan } from '../supervised-launch-core.mjs';
import { supervisedAppConfiguration, assertPrivateWaylandSocket } from '../supervised-launch-linux.mjs';
import { SupervisorProxy } from '../supervised-launch.mjs';
import { launchSupervisedApp } from '../launch-supervised-app.mjs';

// Pure plan/env/argv builders and injected backend only: no worker, gate, app or socket.
const SOCKET = '/tmp/perf-lab-abc123/reservation/runtime/perf-0123456789abcdef';
const base = () => ({ revision: 1, runDir: '/tmp/perf-lab/supervised-private', binary: '/isolated/approved/youcoded/desktop/release/linux-unpacked/youcoded',
  packageReceipt: { revision: 1, checkout: '/isolated/approved/youcoded', packageRoot: '/isolated/approved/youcoded/desktop/release/linux-unpacked' },
  home: '/tmp/perf-lab/supervised-private/home', bin: '/tmp/perf-lab/supervised-private/home/bin',
  userData: '/tmp/perf-lab/supervised-private/home/.config/youcoded', perfLog: '/tmp/perf-lab/supervised-private/home/perf-marks.jsonl',
  wallMs: 60000, maxRssMb: 1536, cleanupReserveMs: 8000, cdpPort: 9569, display: ':99' });

test('plan accepts only the private per-run compositor socket as waylandSocket', () => {
  assert.equal(validateSupervisorPlan({ ...base(), waylandSocket: SOCKET }).waylandSocket, SOCKET);
  assert.equal(validateSupervisorPlan(base()).waylandSocket, undefined);
  for (const bad of ['/run/user/1000/wayland-0', 'wayland-0', 'perf-0', '/tmp/perf-lab-abc/reservation/runtime/perf-0', '/tmp/perf-lab-abc/reservation/runtime/perf-0123456789ABCDEF',
    '/tmp/perf-lab-abc/reservation/runtime/../perf-0123456789abcdef', `${SOCKET}.lock`, '', null, 7]) {
    assert.throws(() => validateSupervisorPlan({ ...base(), waylandSocket: bad }), /Wayland socket binding/, String(bad));
  }
});
test('Wayland app environment points at the private socket and leaks no host display variables', () => {
  const { env, args } = supervisedAppConfiguration({ ...base(), waylandSocket: SOCKET });
  assert.equal(env.WAYLAND_DISPLAY, SOCKET); assert.equal(env.XDG_SESSION_TYPE, 'wayland'); assert.equal(env.ELECTRON_OZONE_PLATFORM_HINT, 'wayland');
  assert.deepEqual(args, ['--ozone-platform=wayland']);
  for (const key of ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DEBUG', 'DBUS_SESSION_BUS_ADDRESS_HOST']) assert.equal(env[key], undefined, key);
  assert.equal(env.HOME, base().home); assert.match(env.DBUS_SESSION_BUS_ADDRESS, /no-session-bus$/);
  // Host variables in THIS process must not reach the child: it is built from a fixed PATH/LANG whitelist.
  const saved = { d: process.env.DISPLAY, w: process.env.WAYLAND_DISPLAY }; process.env.DISPLAY = ':0'; process.env.WAYLAND_DISPLAY = 'wayland-0';
  try { const again = supervisedAppConfiguration({ ...base(), waylandSocket: SOCKET }).env; assert.equal(again.DISPLAY, undefined); assert.equal(again.WAYLAND_DISPLAY, SOCKET); }
  finally { for (const [k, v] of [['DISPLAY', saved.d], ['WAYLAND_DISPLAY', saved.w]]) v === undefined ? delete process.env[k] : (process.env[k] = v); }
});
test('absent waylandSocket keeps the exact previous X11 lane', () => {
  const { env, args } = supervisedAppConfiguration(base());
  assert.equal(env.DISPLAY, ':99'); assert.equal(env.WAYLAND_DISPLAY, undefined); assert.equal(env.XDG_SESSION_TYPE, 'x11'); assert.deepEqual(args, ['--ozone-platform=x11']);
});
// Fake lstat/peer/proc only: no real socket or process is touched.
function socketFixture() {
  const sock = { isSocket: () => true, isDirectory: () => false, isSymbolicLink: () => false, uid: 1000, dev: 3, ino: 40, mode: 0o140755 };
  const dir = { isSocket: () => false, isDirectory: () => true, isSymbolicLink: () => false, uid: 1000, mode: 0o40700 };
  const proof = { socketPath: SOCKET, filesystemDevice: 3, filesystemInode: 40, kernelInode: '80', owners: [{ pid: 21, starttime: '210' }] };
  const o = { sock, dir, proof, dirs: {}, peerCalls: 0, uid: 1000, canonical: x => x };
  o.lstat = path => (path === SOCKET ? o.sock : o.dirs[path] ?? o.dir);
  o.peer = () => { o.peerCalls++; return o.peerResult ?? { pid: 21, uid: 1000 }; };
  o.inspect = pid => (pid === 21 ? { pid: 21, starttime: '210' } : null);
  o.options = () => ({ lstat: o.lstat, canonical: o.canonical, uid: o.uid, proof: o.proof, peer: o.peer, inspect: o.inspect });
  return o;
}
test('private socket must be an owned canonical socket before the app is released', () => {
  const f = socketFixture();
  assert.doesNotThrow(() => assertPrivateWaylandSocket(SOCKET, f.options()));
  assert.equal(f.peerCalls, 2, 'peer is checked, then re-checked immediately');
  for (const patch of [{ isSocket: () => false }, { isSymbolicLink: () => true }, { uid: 9 }]) {
    const g = socketFixture(); g.sock = { ...g.sock, ...patch };
    assert.throws(() => assertPrivateWaylandSocket(SOCKET, g.options()), /owned canonical/);
  }
  const h = socketFixture(); h.canonical = () => '/elsewhere';
  assert.throws(() => assertPrivateWaylandSocket(SOCKET, h.options()), /owned canonical/);
});
test('negative: a stale socket at the right path that kwin did not prove is refused', () => {
  const none = socketFixture(); none.proof = undefined;
  assert.throws(() => assertPrivateWaylandSocket(SOCKET, none.options()), /no compositor ownership proof/);
  const otherPath = socketFixture(); otherPath.proof = { ...otherPath.proof, socketPath: SOCKET.replace('0123', '4567') };
  assert.throws(() => assertPrivateWaylandSocket(SOCKET, otherPath.options()), /no compositor ownership proof/);
  const stranger = socketFixture(); stranger.peerResult = { pid: 999, uid: 1000 };
  assert.throws(() => assertPrivateWaylandSocket(SOCKET, stranger.options()), /peer is not the verified kwin/);
  const reused = socketFixture(); reused.inspect = () => ({ pid: 21, starttime: '9999' });
  assert.throws(() => assertPrivateWaylandSocket(SOCKET, reused.options()), /identity changed/);
});
test('negative: inode swapped after the proof, or between the check and the re-check, is refused', () => {
  const swapped = socketFixture(); swapped.sock = { ...swapped.sock, ino: 41 };
  assert.throws(() => assertPrivateWaylandSocket(SOCKET, swapped.options()), /inode differs/);
  const late = socketFixture(); let n = 0; late.lstat = path => (path === SOCKET ? { ...late.sock, ino: ++n === 1 ? 40 : 77 } : late.dir);
  assert.throws(() => assertPrivateWaylandSocket(SOCKET, late.options()), /replaced during verification/);
});
test('negative: run directories with wrong mode, wrong owner or a symlink are refused', () => {
  const runDir = '/tmp/perf-lab-abc123';
  for (const patch of [{ mode: 0o40755 }, { mode: 0o40770 }, { uid: 9 }, { isSymbolicLink: () => true }, { isDirectory: () => false }]) {
    const f = socketFixture(); f.dirs[runDir] = { ...f.dir, ...patch };
    assert.throws(() => assertPrivateWaylandSocket(SOCKET, f.options()), /private 0700 directory/, JSON.stringify(Object.keys(patch)));
  }
  const nested = socketFixture(); nested.dirs[`${runDir}/reservation/runtime`] = { ...nested.dir, mode: 0o40755 };
  assert.throws(() => assertPrivateWaylandSocket(SOCKET, nested.options()), /private 0700 directory/);
  const moved = socketFixture(); moved.canonical = p => (p === runDir ? '/tmp/real-elsewhere' : p);
  assert.throws(() => assertPrivateWaylandSocket(SOCKET, moved.options()), /private 0700 directory/);
});
test('plan carries a socket proof only for its own socket', () => {
  const proof = { socketPath: SOCKET, filesystemDevice: 3, filesystemInode: 40, kernelInode: '80', owners: [{ pid: 21, starttime: '210' }] };
  assert.deepEqual(validateSupervisorPlan({ ...base(), waylandSocket: SOCKET, waylandProof: proof }).waylandProof, proof);
  assert.throws(() => validateSupervisorPlan({ ...base(), waylandProof: proof }), /socket proof/);
  assert.throws(() => validateSupervisorPlan({ ...base(), waylandSocket: SOCKET, waylandProof: { ...proof, socketPath: SOCKET.replace('0123', '4567') } }), /socket proof/);
  assert.throws(() => validateSupervisorPlan({ ...base(), waylandSocket: SOCKET, waylandProof: { ...proof, owners: [] } }), /socket proof/);
});
test('launch binding must match the plan exactly, including the Wayland socket', () => {
  const plan = validateSupervisorPlan({ ...base(), waylandSocket: SOCKET });
  const args = { binary: plan.binary, appDir: plan.packageReceipt.packageRoot, fixture: { home: plan.home, userData: plan.userData }, cdpPort: plan.cdpPort, display: plan.display };
  const check = extra => SupervisorProxy.prototype.assertBinding.call({ plan }, { ...args, ...extra });
  assert.doesNotThrow(() => check({ waylandSocket: SOCKET }));
  assert.throws(() => check({}), /binding mismatch/);
  assert.throws(() => check({ waylandSocket: SOCKET.replace('0123', '4567') }), /binding mismatch/);
  const x11 = validateSupervisorPlan(base());
  assert.throws(() => SupervisorProxy.prototype.assertBinding.call({ plan: x11 }, { ...args, waylandSocket: SOCKET }), /binding mismatch/);
  assert.doesNotThrow(() => SupervisorProxy.prototype.assertBinding.call({ plan: x11 }, args));
});
test('shared-launch route forwards the socket to the binding check; protocol log and extra argv stay refused', async () => {
  const seen = []; let killed = 0;
  const backend = { assertBinding: o => seen.push(o.waylandSocket), spawn: async () => { throw Error('stop before spawn'); }, kill: async () => { killed++; }, disconnect: () => {} };
  const options = { binary: '/tmp/pkg/youcoded', appDir: '/tmp/pkg', fixture: { home: '/tmp/x/home' }, supervisedBackend: backend, waylandSocket: SOCKET };
  const deps = { runtime: new EventEmitter(), findFamily: () => [], ancestors: new Set(), portBusy: async () => false };
  await assert.rejects(launchSupervisedApp(options, deps), /stop before spawn/);
  assert.deepEqual(seen, [SOCKET]);
  await assert.rejects(launchSupervisedApp({ ...options, protocolLog: '/tmp/log' }, deps), /unsupported/);
  await assert.rejects(launchSupervisedApp({ ...options, extraArgs: ['--ozone-platform=x11'] }, deps), /unsupported/);
  assert.equal(seen.length, 1);
});
