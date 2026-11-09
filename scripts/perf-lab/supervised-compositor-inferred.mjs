// KWin-only "inferred executable" ownership proof.
//
// WHY: /usr/bin/kwin_wayland carries file capability cap_sys_nice=ep. The kernel
// therefore refuses this (capability-less) controller read access to the
// process's environ, exe, fd and maps even though it is the same uid (a target
// whose permitted capabilities exceed the caller's cannot be inspected without
// CAP_SYS_PTRACE). stat, status, cmdline, cgroup and /proc/net/unix stay readable.
// This module proves the role from what IS readable. It is NEVER a direct exe
// read and every record it produces says so. It is used only for the kwin role,
// only after EACCES on BOTH environ and exe, and only when status shows the exact
// capability set the file capability would grant. Any other EACCES stays fatal.
import { spawnSync } from 'node:child_process';
import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readBoundedText } from './lifecycle-evidence.mjs';
import { readProc } from './owned-processes.mjs';
import { compositorCommand } from './supervised-compositor-policy.mjs';

const PROOFS = fileURLToPath(new URL('./supervised-compositor-proofs.py', import.meta.url));
export const KWIN_PATH = '/usr/bin/kwin_wayland';
export const KWIN_FILE_CAPABILITY = 'cap_sys_nice=ep';
const CAP_SYS_NICE = 1n << 23n;
export const INFERRED_ENVIRON_TEXT = 'unreadable: kernel denies a capability-bearing process (file capability cap_sys_nice=ep; caller lacks CAP_SYS_PTRACE)';

// vfs_cap_data revision 2: magic_etc, then permitted/inheritable for caps 0-31
// and 32-63. Revision 3 (namespaced rootid), v1, extra bytes or extra bits refuse.
export function describeFileCapability(hex) {
  if (hex === null) return null;
  if (typeof hex !== 'string' || !/^(?:[0-9a-f]{2}){1,64}$/.test(hex)) return 'malformed';
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length !== 20) return `unexpected:${hex}`;
  const magic = bytes.readUInt32LE(0);
  const permitted = BigInt(bytes.readUInt32LE(4)) | (BigInt(bytes.readUInt32LE(12)) << 32n);
  const inheritable = BigInt(bytes.readUInt32LE(8)) | (BigInt(bytes.readUInt32LE(16)) << 32n);
  return magic === 0x02000001 && permitted === CAP_SYS_NICE && inheritable === 0n ? KWIN_FILE_CAPABILITY : `unexpected:${hex}`;
}

const identityOf = st => ({ dev: st.dev, ino: st.ino, uid: st.uid, mode: st.mode });
const sameFields = (a, b, keys) => a && b && keys.every(key => a[key] === b[key]);
const IDENTITY = ['dev', 'ino', 'uid', 'mode'];
const FILE_PROOF = ['size', 'mtimeNs', 'ctimeNs', 'capability'];

export function statBinary(path = KWIN_PATH, lstat = lstatSync) {
  const st = lstat(path, { bigint: true });
  // Bigints would not survive the JSON protocol, and a cache/receipt key only
  // needs exact equality, so every nanosecond field is carried as a decimal string.
  // WHY: Number() silently rounds above 2^53, which could make two different files
  // compare equal. Receipts store Numbers, so refuse any value Number cannot hold exactly.
  const exact = (value, label) => { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error(`kwin ${label} not representable exactly`); return Number(value); };
  return { ...identityOf({ dev: exact(st.dev, 'dev'), ino: exact(st.ino, 'ino'), uid: Number(st.uid), mode: Number(st.mode) }),
    size: String(st.size), mtimeNs: String(st.mtimeNs), ctimeNs: String(st.ctimeNs) };
}

function trustedPython() {
  const python = realpathSync('/usr/bin/python3'), ps = lstatSync(python), hs = lstatSync(PROOFS);
  if (!/^\/usr\/bin\/python3(?:\.\d+)?$/.test(python) || !ps.isFile() || ps.uid !== 0 || (ps.mode & 0o6022)
    || !hs.isFile() || hs.uid !== process.getuid() || (hs.mode & 0o6022) || realpathSync(PROOFS) !== PROOFS) throw Error('Trusted Python/proof helper unavailable');
  return python;
}
function runProofHelper(args) {
  const result = spawnSync(trustedPython(), ['-I', '-S', PROOFS, ...args], { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    encoding: 'utf8', timeout: 3000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0 || result.signal) throw Error(`Proof helper failed: ${String(result.error?.message ?? result.stderr ?? result.signal).slice(0, 200)}`);
  return JSON.parse(result.stdout);
}
export const readKwinCapability = () => runProofHelper(['capability']).capability;
export const readPeerCredentials = socketPath => runProofHelper(['peer', socketPath]);

export function realInferredDeps() {
  const code = error => (typeof error?.code === 'string' ? error.code : 'ERR');
  return {
    probeDenied: pid => {
      const attempt = read => { try { read(); return 'OK'; } catch (error) { return code(error); } };
      return { environ: attempt(() => readBoundedText(`/proc/${pid}/environ`, { maxBytes: 65536 })), exe: attempt(() => readlinkSync(`/proc/${pid}/exe`)) };
    },
    readStatus: pid => readBoundedText(`/proc/${pid}/status`, { maxBytes: 65536 }),
    selfStatus: () => readBoundedText('/proc/self/status', { maxBytes: 65536 }),
    readArgv: pid => { const text = readBoundedText(`/proc/${pid}/cmdline`, { maxBytes: 65536 }); return text.length ? text.replace(/\0$/, '').split('\0') : []; },
    readProc: pid => readProc(pid), statBinary, readCapability: readKwinCapability, peerCredentials: readPeerCredentials,
  };
}
export function createInferredState(deps = realInferredDeps()) {
  // Caches are keyed by exact file/socket identity so a tick never respawns the
  // Python helper unless the identity itself changed; they never skip a stat/proc read.
  return { deps, capability: new Map(), peer: new Map() };
}
let defaultState;
export const defaultInferredState = () => (defaultState ??= createInferredState());

function ids(text, label) {
  const m = new RegExp(`^${label}:\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*$`, 'm').exec(text);
  return m ? m.slice(1, 5).map(Number) : null;
}
function caps(text) {
  const out = {};
  for (const key of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) {
    const m = new RegExp(`^${key}:\\s+([0-9a-f]{16})\\s*$`, 'm').exec(text);
    if (!m) return null;
    out[key] = BigInt(`0x${m[1]}`);
  }
  return out;
}
const refuse = reason => { throw Error(`Inferred KWin proof refused: ${reason}`); };

// Current kwin binary vs the receipt taken at authorization. Used before launch
// (reauthorize) and after launch (every inferred proof). Capability is read only
// when the stat identity (including ctime, which any setcap changes) is new.
export function verifyKwinBinary(receipt, state) {
  const { deps } = state;
  const current = deps.statBinary(receipt.path);
  const expected = receipt.fileProof;
  if (!expected || !sameFields(current, receipt.identity, IDENTITY) || !sameFields(current, expected, ['size', 'mtimeNs', 'ctimeNs'])) refuse('kwin binary stat identity differs from receipt');
  const key = JSON.stringify([current.dev, current.ino, current.size, current.mtimeNs, current.ctimeNs]);
  let capability = state.capability.get(key);
  if (capability === undefined) {
    capability = describeFileCapability(deps.readCapability());
    if (state.capability.size >= 8) state.capability.clear();
    state.capability.set(key, capability);
  }
  if (capability !== expected.capability) refuse('kwin file capability differs from receipt');
  return { capability, current };
}

export function captureKwinFileProof(state = defaultInferredState()) {
  const { deps } = state, current = deps.statBinary(KWIN_PATH), capability = describeFileCapability(deps.readCapability());
  // Only "none" or exactly cap_sys_nice=ep is a known quantity; anything else is refused.
  if (capability !== null && capability !== KWIN_FILE_CAPABILITY) refuse(`kwin file capability is ${capability}`);
  return { size: current.size, mtimeNs: current.mtimeNs, ctimeNs: current.ctimeNs, capability };
}

export function proveInferredKwin({ member, roles, table, plan, receipts, uid, gid = process.getgid(), state = defaultInferredState() }) {
  const { deps } = state, receipt = receipts.kwin_wayland, proofs = [];
  if (!roles.wrapper || roles.kwin || !receipt?.fileProof) refuse('wrapper not yet verified, duplicate kwin, or receipt lacks file proof');
  const before = deps.readProc(member.pid);
  if (!before || before.pid !== member.pid || before.starttime !== member.starttime || ['Z', 'X'].includes(before.state)) refuse('process identity changed');
  // WHY: the ancestry walk below trusts member.ppid from the earlier snapshot; the
  // fresh read must agree with it or a reparented process could pass on stale data.
  if (before.ppid !== member.ppid) refuse('parent changed between snapshot and proof');

  // (a) kernel denial must be exactly EACCES on BOTH files; success or any other
  // errno means this is not the file-capability situation.
  const denied = deps.probeDenied(member.pid);
  if (denied.environ !== 'EACCES' || denied.exe !== 'EACCES') refuse(`environ/exe not both EACCES (${denied.environ}/${denied.exe})`);
  proofs.push('kernel-eacces-environ-and-exe');

  // (b) status identity: owner uid/gid on every id slot, and capability sets that
  // equal exactly the file capability's result. A dumpable ordinary process has
  // empty capability sets and therefore cannot take this path.
  const status = deps.readStatus(member.pid), uids = ids(status, 'Uid'), gids = ids(status, 'Gid'), cap = caps(status), own = caps(deps.selfStatus());
  if (!uids || !gids || !uids.every(v => v === uid) || !gids.every(v => v === gid)) refuse('uid/gid are not the owner');
  if (!cap || !own || cap.CapPrm !== CAP_SYS_NICE || cap.CapEff !== CAP_SYS_NICE || cap.CapAmb !== 0n || cap.CapInh !== own.CapInh) refuse('capability sets are not exactly cap_sys_nice=ep');
  // If the caller already held the capability, EACCES would have another cause.
  if ((own.CapPrm & CAP_SYS_NICE) !== 0n) refuse('caller holds the capability; denial is unexplained');
  proofs.push('uid-gid-owner', 'kernel-capability-sets-exact');

  // (c) argv: exact fixed command including the per-run socket token.
  const expectedArgv = compositorCommand(receipts, plan).argv.slice(4);
  const argv = deps.readArgv(member.pid);
  if (expectedArgv[0] !== receipt.path || argv.length !== expectedArgv.length || argv.some((value, index) => value !== expectedArgv[index])) refuse('argv differs from the fixed command/token');
  proofs.push('argv-exact-with-run-token');

  // (d) ancestry by stat ppid through already strictly verified roles only, ending
  // at the wrapper, with start times not before the wrapper's.
  let cursor = member;
  for (let depth = 0; ; depth++) {
    if (depth >= 4) refuse('parent chain too long');
    const parent = table.get(cursor.ppid);
    if (!parent || ['Z', 'X'].includes(parent.state)) refuse('parent is not a live family member');
    if (parent.pid === roles.wrapper.pid) {
      if (parent.starttime !== roles.wrapper.starttime) refuse('wrapper identity changed');
      break;
    }
    if (!roles.daemon || parent.pid !== roles.daemon.pid || parent.starttime !== roles.daemon.starttime) refuse('parent chain leaves verified roles');
    cursor = parent;
  }
  if (BigInt(member.starttime) < BigInt(roles.wrapper.starttime)) refuse('kwin started before its wrapper');
  proofs.push('parent-chain-to-wrapper', 'start-order-after-wrapper');

  // (e) binary identity and exact file capability, bracketing the process proof.
  const binary = verifyKwinBinary(receipt, state);
  if (binary.capability !== KWIN_FILE_CAPABILITY) refuse('kwin file capability is not exactly cap_sys_nice=ep');
  proofs.push('binary-identity-matches-receipt', 'file-capability-exact');

  const after = deps.readProc(member.pid);
  if (!after || after.starttime !== before.starttime || after.ppid !== before.ppid) refuse('process identity changed during proof');
  // WHY: bracket the whole proof; a binary swapped after the first check but before the
  // last process read would otherwise go unnoticed until the next tick.
  if (verifyKwinBinary(receipt, state).capability !== KWIN_FILE_CAPABILITY) refuse('kwin file capability changed during proof');
  return { pid: member.pid, starttime: member.starttime, inferred: true, evidence: {
    role: 'kwin', exe: 'inferred', environ: INFERRED_ENVIRON_TEXT, directExeRead: false, fileCapability: KWIN_FILE_CAPABILITY, proofs } };
}

// SO_PEERCRED on a connection to the private socket replaces the fd-based
// listener proof for kwin only: the kernel names the process that listen()ed.
export function provePeerOwner({ socketPath, owner, uid, listenerKey, state = defaultInferredState() }) {
  const { deps } = state, key = `${listenerKey}|${owner.pid}|${owner.starttime}`;
  let peer = state.peer.get(key);
  if (!peer) {
    peer = deps.peerCredentials(socketPath);
    if (state.peer.size >= 8) state.peer.clear();
    state.peer.set(key, peer);
  }
  if (peer?.pid !== owner.pid || peer.uid !== uid) refuse('socket peer is not the verified kwin process/uid');
  const now = deps.readProc(owner.pid);
  if (!now || now.pid !== owner.pid || now.starttime !== owner.starttime) refuse('kwin identity changed after peer proof');
  return { pid: peer.pid, uid: peer.uid };
}
