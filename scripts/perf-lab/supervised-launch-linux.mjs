// Linux-only internal worker adapters. No exported arbitrary spawn/signal endpoint.
import { spawn } from 'node:child_process';
import { constants, openSync, closeSync, writeSync, realpathSync, statSync, lstatSync, readlinkSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OwnedProcesses, readProc } from './owned-processes.mjs';
import { readBoundedText } from './lifecycle-evidence.mjs';
import { launchConfiguration } from './launch.mjs';
import { assertPackageIdentity, reauthorizeSupervisorPackage } from './supervised-package.mjs';
import { assertProtocolEnvelope } from './supervised-protocol.mjs';
import { readPeerCredentials } from './supervised-compositor-inferred.mjs';
import { verifyPostExecIdentity, validateSupervisorPlan } from './supervised-launch-core.mjs';

const GATE = fileURLToPath(new URL('./supervised-exec-gate.py', import.meta.url));
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function inspectExecIdentity(pid) {
  const a = readProc(pid); if (!a) return null;
  const status = readBoundedText(`/proc/${pid}/status`, { maxBytes: 65536 });
  const uid = /^Uid:\s+(\d+)/m.exec(status);
  const env = readBoundedText(`/proc/${pid}/environ`, { maxBytes: 65536 }).split('\0');
  const exe = readlinkSync(`/proc/${pid}/exe`);
  const executable = statSync(`/proc/${pid}/exe`);
  const b = readProc(pid);
  if (!b || a.starttime !== b.starttime || a.pid !== b.pid) { /* WHY: coded so callers can tell a racing/exiting process from a real failure */ const e = Error('Exec identity changed during inspection'); e.code = 'EIDENTITYCHANGED'; throw e; }
  return { ...b, executableIdentity: { dev: executable.dev, ino: executable.ino, uid: executable.uid, mode: executable.mode }, uid: uid ? Number(uid[1]) : null, exe, home: env.find(s => s.startsWith('HOME='))?.slice(5) };
}
// WHY: one pure builder for the supervised app's environment/argv. With a Wayland
// binding the app gets the private compositor socket, --ozone-platform=wayland and
// NO DISPLAY (launchConfiguration whitelists from PATH/LANG only, so no host
// DISPLAY/WAYLAND_DISPLAY/XAUTHORITY can leak); without it, the unchanged X11 lane.
export function supervisedAppConfiguration(plan) {
  const fixture = { home: plan.home, bin: plan.bin, perfLog: plan.perfLog };
  const { env, args } = launchConfiguration({ fixture, display: plan.display, waylandSocket: plan.waylandSocket, protocolDebug: false, inherited: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  env.XDG_CONFIG_HOME = join(plan.home, '.config'); env.XDG_DATA_HOME = join(plan.home, '.local/share'); env.XDG_CACHE_HOME = join(plan.home, '.cache');
  return { env, args };
}
// WHY: an owned, canonical, well-named socket is not proof it is KWIN's socket (a stale
// or planted socket at the same path would pass). The compositor controller's proof
// (SO_PEERCRED-verified kwin pid+starttime, path, filesystem inode) must match this exact
// path, and is re-checked (inode + live peer) right before the app is spawned.
export function assertPrivateWaylandSocket(path, { lstat = lstatSync, canonical = realpathSync, uid = process.getuid(), proof, peer = readPeerCredentials, inspect = readProc } = {}) {
  const refuse = reason => { throw Error(`Wayland binding refused: ${reason}`); };
  const st = lstat(path);
  if (!st.isSocket() || st.isSymbolicLink() || st.uid !== uid || canonical(path) !== path) throw Error('Wayland binding is not the owned canonical private socket');
  // The per-run directories (/tmp/perf-lab-*/, reservation, runtime) must be ours, 0700, real directories.
  for (let dir = dirname(path), n = 0; n < 3; dir = dirname(dir), n++) {
    const d = lstat(dir);
    if (!d.isDirectory() || d.isSymbolicLink() || d.uid !== uid || (d.mode & 0o777) !== 0o700 || canonical(dir) !== dir) refuse(`${dir} is not a private 0700 directory owned by the owner`);
  }
  if (!proof || proof.socketPath !== path || proof.owners?.length !== 1) refuse('no compositor ownership proof for this exact socket');
  const owner = proof.owners[0];
  const sameInode = s => String(s.dev) === String(proof.filesystemDevice) && String(s.ino) === String(proof.filesystemInode);
  if (!sameInode(st)) refuse('socket is not the one the compositor proof named (inode differs)');
  const verifyPeer = () => {
    const creds = peer(path), live = inspect(owner.pid);
    if (creds?.pid !== owner.pid || creds.uid !== uid) refuse('socket peer is not the verified kwin process');
    if (!live || live.starttime !== owner.starttime) refuse('verified kwin identity changed');
  };
  verifyPeer();
  // Immediate re-check: same inode and same live peer after the first pass.
  const again = lstat(path);
  if (!again.isSocket() || again.isSymbolicLink() || !sameInode(again) || canonical(path) !== path) refuse('socket replaced during verification');
  verifyPeer();
}
function exclusiveJson(path, value) {
  assertProtocolEnvelope(value);
  const data = Buffer.from(JSON.stringify(value));
  if (data.length > 65536) throw Error('Exec plan byte cap');
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeSync(fd, data); } finally { closeSync(fd); }
}
async function boundedWait(predicate, label, ms = 1000) {
  const end = performance.now() + ms;
  while (performance.now() < end) { const value = predicate(); if (value) return value; await sleep(10); }
  throw Error(`Supervisor ${label} timeout`);
}

// Verify listener inode belongs to a currently identity-verified family member.
// A URL/port response alone is never authority to attach DevTools.
export function proveOwnedEndpoint(family, port, { tables = () => ['tcp','tcp6'].map(n => readBoundedText(`/proc/net/${n}`)),
  fds = pid => readdirSync(`/proc/${pid}/fd`).map(fd => { try { return readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { return ''; } }), inspect = readProc } = {}) {
  const snapshot = family.sample();
  const inodes = [];
  for (const text of tables()) for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10 || f[3] !== '0A' || parseInt(f[1].split(':')[1], 16) !== port) continue;
    if (!['0100007F','00000000000000000000000001000000'].includes(f[1].split(':')[0])) throw Error('CDP listener not loopback');
    inodes.push(f[9]);
  }
  if (inodes.length === 0) return { owned: false, pending: true };
  if (inodes.length !== 1) throw Error('Ambiguous CDP socket listener');
  const owners = [];
  for (const member of snapshot.members) {
    const before = inspect(member.pid);
    if (!before || before.starttime !== member.starttime) throw Error('CDP owner identity changed');
    if (fds(member.pid).includes(`socket:[${inodes[0]}]`)) {
      const after = inspect(member.pid);
      if (!after || after.starttime !== before.starttime) throw Error('CDP owner reused');
      owners.push({ pid: after.pid, starttime: after.starttime });
    }
  }
  if (!owners.length) throw Error('Unknown socket owner; refusing CDP attach');
  return { owned: true, port, inode: inodes[0], owners };
}

export function makeLinuxAdapters(plan, { persist, emit, output }) {
  plan = validateSupervisorPlan(plan);
  return {
    now: () => performance.now(), persist, emit,
    endpoint: family => proveOwnedEndpoint(family, plan.cdpPort),
    async spawnGate() {
      await reauthorizeSupervisorPackage(plan);
      const python = realpathSync('/usr/bin/python3');
      const pythonInfo = statSync(python), gateInfo = statSync(GATE);
      if (!python.startsWith('/usr/bin/python3') || !pythonInfo.isFile() || pythonInfo.uid !== 0 || (pythonInfo.mode & 0o022) !== 0
        || !gateInfo.isFile() || gateInfo.uid !== process.getuid() || (gateInfo.mode & 0o022) !== 0 || realpathSync(GATE) !== GATE) throw Error('Trusted Python/gate dependency unavailable or writable by others');
      const fixture = { home: plan.home, bin: plan.bin, perfLog: plan.perfLog };
      const { env, args } = supervisedAppConfiguration(plan);
      const gatePlan = join(plan.runDir, 'exec-plan.json');
      exclusiveJson(gatePlan, { binary: plan.binary, identity: plan.packageReceipt.identity, argv: [plan.binary, `--remote-debugging-port=${plan.cdpPort}`, '--no-sandbox', ...args], env });
      // WHY: last statement before spawn, so no work separates the compositor proof from the app launch.
      if (plan.waylandSocket) assertPrivateWaylandSocket(plan.waylandSocket, { proof: plan.waylandProof });
      const child = spawn(python, ['-I', '-S', GATE, gatePlan], { cwd: plan.home, env, detached: true, stdio: ['ignore','pipe','pipe','pipe','pipe'] });
      let ready = false, exited = false, closed = false, exit = null, failure = null, released = false;
      child.on('error', error => { failure = error; });
      child.on('exit', (code, signal) => { exited = true; exit = { code, signal }; emit({ type: 'app-exit', ...exit }); });
      child.on('close', (code, signal) => { closed = true; emit({ type: 'app-close', code, signal }); });
      child.stdio[4].on('data', b => { if (b.equals(Buffer.from('G'))) ready = true; else failure = Error('Invalid gate readiness'); });
      child.stdio[4].on('error', e => { failure = e; });
      for (const name of ['stdout','stderr']) {
        child[name].on('data', b => output(name, b));
        child[name].on('error', e => { failure = e; });
      }
      child.stdio[3].on('error', e => { failure = e; });
      let family;
      return {
        child, get family() { return family; },
        async capture() {
          await boundedWait(() => { if (failure) throw failure; if (exited) throw Error('Gate exited before capture'); return ready; }, 'gate ready', 2000);
          family = new OwnedProcesses({ leaderPid: child.pid, jobDir: plan.runDir, maxMembers: 128 });
          family.captureExecGate({ expectedExe: python, expectedUid: process.getuid(), expectedHome: plan.home, inspect: inspectExecIdentity });
        },
        release() { if (released || !family.leader || failure || exited) throw Error('Gate release requires captured live identity'); assertPackageIdentity(plan.binary, plan.packageReceipt); released = true; child.stdio[3].end('R'); },
        abort() { if (!released) child.stdio[3].destroy(); },
        async corroborate() {
          await boundedWait(() => {
            if (failure) throw failure;
            const r = inspectExecIdentity(child.pid);
            return verifyPostExecIdentity(r, family.leader, plan, process.getuid(), python);
          }, 'exec corroboration', 2000);
        },
        pipeState: () => ({ exited, closed, exit, error: failure?.message ?? null }),
        async waitClosed(ms) { try { await boundedWait(() => exited && closed, 'app close', ms); } catch { /* retain uncertainty */ } return { exited, closed, exit, error: failure?.message ?? null }; },
      };
    },
  };
}
