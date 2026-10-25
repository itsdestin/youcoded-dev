import test from 'node:test';
import assert from 'node:assert/strict';
import { compositorPlan, compositorCommand } from '../supervised-compositor-policy.mjs';
import { CompositorSession } from '../supervised-compositor-core.mjs';
import { proveCompositorRoles, proveCompositorSocket, proveCompositorBusSocket } from '../supervised-compositor-linux.mjs';
import { describeFileCapability, captureKwinFileProof, verifyKwinBinary, statBinary, createInferredState, INFERRED_ENVIRON_TEXT, KWIN_FILE_CAPABILITY } from '../supervised-compositor-inferred.mjs';

// Fake /proc fixtures only: no real process, socket, xattr or compositor is touched.
const EXACT_CAP = '0100000200008000000000000000000000000000'; // v2, effective, permitted=cap_sys_nice, inheritable=0
const UID = 1000, GID = 1000, SOCKET = 'perf-0123456789abcdef';
const identity = { dev: 1, ino: 2, uid: 0, mode: 0o100755 };
const row = (pid, ppid, extra = {}) => ({ pid, ppid, starttime: String(pid * 10), session: 20, pgrp: 20, state: 'S', rssMb: 10, cmdline: 'private', ...extra });
const statusText = ({ uid = UID, gid = GID, prm = '0000000000800000', eff = '0000000000800000', inh = '0000000800000000', amb = '0000000000000000' } = {}) =>
  `Name:\tkwin_wayland\nState:\tS (sleeping)\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\nGid:\t${gid}\t${gid}\t${gid}\t${gid}\nCapInh:\t${inh}\nCapPrm:\t${prm}\nCapEff:\t${eff}\nCapBnd:\t000001ffffffffff\nCapAmb:\t${amb}\n`;
const ownStatus = statusText({ prm: '0000000000000000', eff: '0000000000000000' });
function fixture() {
  const plan = compositorPlan('/tmp/perf-lab-test/reservation', SOCKET);
  const receipts = Object.fromEntries(['dbus-run-session', 'kwin_wayland', 'dbus-daemon', 'kscreen-doctor', 'wayland-info'].map((name, i) => [name, { path: `/usr/bin/${name}`, identity: { ...identity, ino: i + 10 } }]));
  const binary = { ...receipts.kwin_wayland.identity, size: '5000', mtimeNs: '111', ctimeNs: '222' };
  receipts.kwin_wayland.fileProof = { size: binary.size, mtimeNs: binary.mtimeNs, ctimeNs: binary.ctimeNs, capability: KWIN_FILE_CAPABILITY };
  const wrapper = row(20, 10), daemon = row(22, 20), kwin = row(21, 20);
  const strict = { 20: { ...wrapper, uid: UID, home: plan.home, exe: receipts['dbus-run-session'].path, executableIdentity: receipts['dbus-run-session'].identity },
    22: { ...daemon, uid: UID, home: plan.home, exe: receipts['dbus-daemon'].path, executableIdentity: receipts['dbus-daemon'].identity } };
  const members = [wrapper, kwin, daemon];
  const family = { leader: wrapper, known: new Map(members.map(m => [m.pid, m])), sample: () => ({ rssMb: 30, members }), protect: () => {} };
  const calls = { capability: 0, peer: 0, fds: 0 };
  const deps = {
    probeDenied: () => ({ environ: 'EACCES', exe: 'EACCES' }),
    readStatus: () => statusText(), selfStatus: () => ownStatus,
    readArgv: () => compositorCommand(receipts, plan).argv.slice(4),
    readProc: pid => members.find(m => m.pid === pid) ?? null,
    statBinary: () => ({ ...binary }),
    readCapability: () => { calls.capability++; return EXACT_CAP; },
    peerCredentials: () => { calls.peer++; return { pid: 21, uid: UID, gid: GID }; },
  };
  const state = createInferredState(deps);
  const eacces = () => Object.assign(Error('EACCES: permission denied'), { code: 'EACCES' });
  const inspect = pid => { if (pid === 21) throw eacces(); return strict[pid]; };
  return { plan, receipts, family, members, kwin, wrapper, daemon, deps, state, calls, eacces, inspect, strict, binary };
}
const prove = (f, extra = {}) => proveCompositorRoles(f.family, f.plan, f.receipts, { inspect: f.inspect, uid: UID, gid: GID, inferred: f.state, ...extra });

test('file capability parser accepts exactly cap_sys_nice=ep and refuses every other set', () => {
  assert.equal(describeFileCapability(EXACT_CAP), KWIN_FILE_CAPABILITY);
  assert.equal(describeFileCapability(null), null);
  const withExtra = '0100000200108000000000000000000000000000'; // adds a second permitted bit
  const noEffective = '0000000200008000000000000000000000000000';
  const inheritable = '0100000200008000000080000000000000000000';
  const high = '0100000200008000000000000100000000000000';
  const v3 = '0100000300008000000000000000000000000000e803000';
  for (const hex of [withExtra, noEffective, inheritable, high, v3, EXACT_CAP.slice(0, 16), 'zz']) assert.notEqual(describeFileCapability(hex), KWIN_FILE_CAPABILITY, hex);
  const f = fixture();
  assert.deepEqual(captureKwinFileProof(f.state), f.receipts.kwin_wayland.fileProof);
  f.deps.readCapability = () => withExtra;
  assert.throws(() => captureKwinFileProof(createInferredState(f.deps)), /refused/);
  f.deps.readCapability = () => null;
  assert.equal(captureKwinFileProof(createInferredState(f.deps)).capability, null);
});

test('inferred kwin proof passes with every proof listed and never claims a direct exe read', () => {
  const f = fixture(), roles = prove(f);
  assert.deepEqual([roles.kwin.pid, roles.kwin.starttime, roles.kwin.inferred], [21, '210', true]);
  assert.equal(roles.kwin.evidence.exe, 'inferred');
  assert.equal(roles.kwin.evidence.environ, INFERRED_ENVIRON_TEXT);
  assert.equal(roles.kwin.evidence.directExeRead, false);
  assert.deepEqual(roles.kwin.evidence.proofs, ['kernel-eacces-environ-and-exe', 'uid-gid-owner', 'kernel-capability-sets-exact', 'argv-exact-with-run-token',
    'parent-chain-to-wrapper', 'start-order-after-wrapper', 'binary-identity-matches-receipt', 'file-capability-exact']);
  assert.deepEqual(roles.wrapper, { pid: 20, starttime: '200' }); // strict roles keep their exact shape
  assert.deepEqual(roles.daemon, { pid: 22, starttime: '220' });
});

test('negative: impostor with right argv but wrong parent', () => {
  const f = fixture();
  f.kwin.ppid = 999; assert.throws(() => prove(f), /parent is not a live family member/);
  f.kwin.ppid = 1; assert.throws(() => prove(f), /parent is not a live family member/);
  // Parent is a family member but not a verified role: refuse rather than walk through it.
  const stranger = row(23, 20); f.members.push(stranger); f.kwin.ppid = 23; f.family.known.set(23, stranger);
  f.strict[23] = { ...stranger, uid: UID, home: f.plan.home, exe: '/usr/bin/foreign', executableIdentity: identity };
  assert.throws(() => prove(f), /Unexpected|leaves verified roles/);
});
test('negative: right parent but wrong or missing per-run token', () => {
  const good = fixture().deps.readArgv();
  for (const mutate of [argv => argv.map(v => v === SOCKET ? 'perf-fedcba9876543210' : v), argv => argv.map(v => v === SOCKET ? 'perf-0' : v), argv => argv.filter(v => v !== SOCKET),
    argv => [...argv, '--extra'], argv => ['/usr/bin/other', ...argv.slice(1)], argv => []]) {
    const f = fixture(); f.deps.readArgv = () => mutate(good);
    assert.throws(() => prove(f), /argv differs/);
  }
});
test('negative: kwin started before its wrapper is refused', () => {
  const f = fixture(); f.kwin.starttime = '199'; assert.throws(() => prove(f), /before its wrapper/);
});
test('negative: binary identity changed, capability changed or extra capability', () => {
  for (const patch of [{ ino: 99 }, { dev: 9 }, { uid: 1000 }, { mode: 0o100777 }, { size: '5001' }, { mtimeNs: '112' }, { ctimeNs: '223' }]) {
    const f = fixture(); const original = f.deps.statBinary(); f.deps.statBinary = () => ({ ...original, ...patch });
    assert.throws(() => prove(f), /stat identity differs/, JSON.stringify(patch));
  }
  const extra = fixture(); extra.deps.readCapability = () => '0100000200108000000000000000000000000000';
  assert.throws(() => prove(extra), /file capability differs from receipt/);
  const none = fixture(); none.deps.readCapability = () => null;
  assert.throws(() => prove(none), /file capability differs from receipt/);
  // A receipt that never recorded the file proof cannot support inference at all.
  const bare = fixture(); delete bare.receipts.kwin_wayland.fileProof; assert.throws(() => prove(bare), /lacks file proof/);
});
test('negative: kernel capability sets must equal the file capability exactly, owner uid/gid required', () => {
  for (const status of [statusText({ prm: '0000000000800001' }), statusText({ eff: '0000000000000000' }), statusText({ prm: '0000000000000000', eff: '0000000000000000' }),
    statusText({ amb: '0000000000800000' }), statusText({ inh: '0000000000000000' }), statusText({ uid: 0 }), statusText({ gid: 7 }), 'Name:\tx\nState:\tS (sleeping)\n']) {
    const f = fixture(); f.deps.readStatus = () => status;
    assert.throws(() => prove(f), /capability sets|uid\/gid/);
  }
  const mixed = fixture(); mixed.deps.readStatus = () => statusText().replace(/Uid:\t1000\t1000\t1000\t1000/, 'Uid:\t1000\t1000\t0\t1000');
  assert.throws(() => prove(mixed), /uid\/gid/);
  const caller = fixture(); caller.deps.selfStatus = () => statusText(); // caller itself holds the capability: EACCES would be unexplained
  assert.throws(() => prove(caller), /unexplained/);
});
test('negative: a dumpable ordinary process that hits EACCES stays a hard failure', () => {
  const f = fixture(); f.deps.readStatus = () => statusText({ prm: '0000000000000000', eff: '0000000000000000', inh: '0000000800000000' });
  assert.throws(() => prove(f), /capability sets are not exactly/);
  // EACCES on only one of environ/exe, or any other errno, is also not this situation.
  for (const denied of [{ environ: 'EACCES', exe: 'OK' }, { environ: 'OK', exe: 'EACCES' }, { environ: 'ENOENT', exe: 'EACCES' }, { environ: 'EPERM', exe: 'EPERM' }]) {
    const g = fixture(); g.deps.probeDenied = () => denied; assert.throws(() => prove(g), /not both EACCES/);
  }
  // A non-EACCES inspection error never reaches the inferred path.
  const h = fixture(); h.inspect = pid => { if (pid === 21) throw Object.assign(Error('gone'), { code: 'ENOENT' }); return h.strict[pid]; };
  assert.throws(() => prove(h), /gone/);
});
test('wrapper and daemon roles still require strict environ/exe reads', () => {
  for (const pid of [20, 22]) {
    const f = fixture(); const base = f.inspect; f.inspect = p => { if (p === pid) throw f.eacces(); return base(p); };
    assert.throws(() => prove(f), /EACCES/, `pid ${pid}`);
  }
  // Two unreadable members are never both excused; a strictly readable kwin cannot be shadowed by an inferred one.
  const two = fixture(); const base = two.inspect; two.inspect = p => { if (p === 22 || p === 21) throw two.eacces(); return base(p); };
  assert.throws(() => prove(two), /EACCES/);
  const dup = fixture(); const strictKwin = { ...row(24, 20), uid: UID, home: dup.plan.home, exe: dup.receipts.kwin_wayland.path, executableIdentity: dup.receipts.kwin_wayland.identity };
  dup.members.push(strictKwin); dup.family.known.set(24, strictKwin); dup.strict[24] = strictKwin;
  assert.throws(() => prove(dup), /Duplicate|Unexpected/);
});
test('binary receipt verification is shared by pre-launch and post-launch and caches by identity', () => {
  const f = fixture();
  assert.equal(verifyKwinBinary(f.receipts.kwin_wayland, f.state).capability, KWIN_FILE_CAPABILITY);
  verifyKwinBinary(f.receipts.kwin_wayland, f.state); prove(f); prove(f);
  assert.equal(f.calls.capability, 1, 'xattr helper is not respawned while stat identity is unchanged');
  f.deps.statBinary = () => ({ ...f.binary, ctimeNs: '223' });
  assert.throws(() => verifyKwinBinary(f.receipts.kwin_wayland, f.state), /stat identity/);
});

// ---- listener (SO_PEERCRED) proof ---------------------------------------------------
function listenerFixture() {
  const f = fixture();
  const st = { uid: UID, dev: 3, ino: 40, isSocket: () => true, isSymbolicLink: () => false };
  const table = path => `Num RefCount Protocol Flags Type St Inode Path\n0000: 00000002 00000000 00010000 0001 01 80 ${path}\n`;
  const options = { uid: UID, gid: GID, canonical: x => x, lstat: () => st, table: () => table(f.plan.socketPath), inspect: f.inspect, inferred: f.state,
    fds: () => { f.calls.fds++; throw f.eacces(); } };
  return { ...f, st, table, options };
}
test('inferred kwin listener proof uses SO_PEERCRED instead of unreadable fds and carries evidence', () => {
  const f = listenerFixture(), proof = proveCompositorSocket(f.family, f.plan, f.receipts, f.options);
  assert.equal(proof.owned, true); assert.equal(proof.kernelInode, '80'); assert.deepEqual(proof.owners, [{ pid: 21, starttime: '210' }]);
  assert.equal(f.calls.fds, 0);
  assert.equal(proof.ownerEvidence.exe, 'inferred'); assert.equal(proof.ownerEvidence.peerPid, 21);
  assert.ok(proof.ownerEvidence.proofs.includes('so-peercred-pid-uid-starttime') && proof.ownerEvidence.proofs.includes('unix-table-single-listener'));
  proveCompositorSocket(f.family, f.plan, f.receipts, f.options);
  assert.equal(f.calls.peer, 1, 'peer credentials cached by exact listener+pid+starttime');
});
test('negative: peer pid/uid mismatch, reused kwin identity, ambiguous or foreign listener', () => {
  for (const peer of [{ pid: 22, uid: UID }, { pid: 20, uid: UID }, { pid: 21, uid: 0 }, { pid: 99999, uid: UID }, null]) {
    const f = listenerFixture(); f.deps.peerCredentials = () => peer;
    assert.throws(() => proveCompositorSocket(f.family, f.plan, f.receipts, f.options), /peer|Cannot read/);
  }
  const reused = listenerFixture(); let n = 0; reused.deps.readProc = pid => { const m = reused.members.find(x => x.pid === pid); return pid === 21 && ++n > 3 ? { ...m, starttime: '9999' } : m; };
  assert.throws(() => proveCompositorSocket(reused.family, reused.plan, reused.receipts, reused.options), /identity changed|reuse/);
  const none = listenerFixture(); none.options.table = () => 'Num RefCount Protocol Flags Type St Inode Path\n';
  assert.throws(() => proveCompositorSocket(none.family, none.plan, none.receipts, none.options), /Missing\/ambiguous/);
  const swapped = listenerFixture(); let k = 0; swapped.options.lstat = () => ({ ...swapped.st, ino: ++k });
  assert.throws(() => proveCompositorSocket(swapped.family, swapped.plan, swapped.receipts, swapped.options), /substituted/);
  const foreign = listenerFixture(); foreign.st.uid = 7;
  assert.throws(() => proveCompositorSocket(foreign.family, foreign.plan, foreign.receipts, foreign.options), /Foreign/);
});
test('the dbus-daemon bus listener keeps the strict fd proof even while kwin is inferred', () => {
  const f = listenerFixture(); f.strict[22].exe = '/usr/bin/foreign'; f.options.table = () => f.table(`${f.plan.runtime}/bus`);
  assert.throws(() => proveCompositorBusSocket(f.family, f.plan, f.receipts, f.options), /Unexpected/);
  const g = listenerFixture(); const busPath = `${g.plan.runtime}/bus`; g.options.table = () => g.table(busPath); g.options.fds = () => ['socket:[80]'];
  const proof = proveCompositorBusSocket(g.family, g.plan, g.receipts, g.options);
  assert.deepEqual(proof.owners, [{ pid: 22, starttime: '220' }]); assert.equal(proof.ownerEvidence, undefined);
});

// ---- session records the evidence once ----------------------------------------------
test('session persists inferred owner evidence exactly once', async () => {
  const f = listenerFixture(), rows = [];
  const proof = proveCompositorSocket(f.family, f.plan, f.receipts, f.options);
  const session = new CompositorSession(f.plan, { now: () => 0, persist: row => rows.push(row), emit: () => {}, inspect: () => proof });
  session.family = f.family;
  await session.inspectOwned(); await session.inspectOwned();
  const evidence = rows.filter(r => r.type === 'owner-evidence');
  assert.equal(evidence.length, 1); assert.equal(evidence[0].exe, 'inferred'); assert.equal(evidence[0].directExeRead, false);
});

// ---- review fixes: parent re-read, binary bracket, exact dev/ino ----------------------
test('negative: kwin reparented between the snapshot and the fresh proof read is refused', () => {
  const f = fixture(); const kwin = f.members.find(m => m.pid === 21);
  // The snapshot (member) says ppid 20; the fresh read says 22. The after-read agrees with the before-read, so only the new comparison catches it.
  f.deps.readProc = pid => (pid === 21 ? { ...kwin, ppid: 22 } : f.members.find(m => m.pid === pid) ?? null);
  assert.throws(() => prove(f), /parent changed between snapshot and proof/);
});
test('negative: a binary change seen only after the final process read is refused', () => {
  const f = fixture(); let calls = 0;
  f.deps.statBinary = () => ({ ...f.binary, ctimeNs: ++calls >= 2 ? '223' : f.binary.ctimeNs });
  assert.throws(() => prove(f), /stat identity differs/);
  assert.equal(calls, 2, 'binary is verified before AND after the process re-read');
});
test('statBinary keeps dev/ino exact and refuses values a Number cannot hold', () => {
  const st = (dev, ino) => ({ dev, ino, uid: 0n, mode: 0o100755n, size: 5n, mtimeNs: 1n, ctimeNs: 2n });
  assert.deepEqual(statBinary('/x', () => st(3n, 40n)), { dev: 3, ino: 40, uid: 0, mode: 0o100755, size: '5', mtimeNs: '1', ctimeNs: '2' });
  assert.throws(() => statBinary('/x', () => st(3n, 2n ** 53n + 1n)), /exactly/);
  assert.throws(() => statBinary('/x', () => st(2n ** 60n, 4n)), /exactly/);
});

// ---- Diagnosable role refusals (2026-10-21 inferred-kwin attempt died with a bare message) ----
// WHY: each refusal must say which member and which condition, without ever
// echoing HOME/paths/argv, and without making any refusal an acceptance.
const refusal = (f, extra) => { try { prove(f, extra); } catch (error) { return error; } assert.fail('expected refusal'); };
const addMember = (f, member, record) => {
  f.members.push(member); f.family.known.set(member.pid, member);
  const inspect = f.inspect; f.inspect = pid => (pid === member.pid ? record : inspect(pid));
};

test('refusal reason: unreceipted readable descendant of kwin is no-role with bounded privacy-safe fields', () => {
  const f = fixture();
  const extra = row(30, 21);
  addMember(f, extra, { ...extra, uid: UID, home: f.plan.home, exe: '/usr/bin/Xwayland', executableIdentity: identity });
  const error = refusal(f);
  assert.match(error.message, /^Unexpected compositor descendant\/role executable /);
  // WHY: a /usr distro program's basename is reported (runtime needed it to name plasma-keyboard);
  // it is still 'unreceipted' and still refused.
  assert.deepEqual(error.reason, { condition: 'no-role', pid: 30, starttime: '300', state: 'S', exe: 'unreceipted', systemProgram: 'Xwayland', uidMatches: true, homeMatchesPlan: true, parent: 'child-of-kwin' });
  assert.equal(error.message.includes('/usr/bin'), false); // never the path
  assert.equal(error.message.includes(f.plan.home), false);
  assert.ok(error.message.length <= 450);
});

test('refusal reason: an unreceipted program outside /usr is never named', () => {
  for (const exe of ['/home/someone/bin/secret-tool', '/tmp/zzqtmp', '/usr/bin/../../home/a/zzqdotdot', '/usr/share/zzqshare']) {
    const f = fixture();
    const extra = row(30, 21);
    addMember(f, extra, { ...extra, uid: UID, home: f.plan.home, exe, executableIdentity: identity });
    const error = refusal(f);
    assert.equal(error.reason.systemProgram, null, exe);
    assert.equal(error.message.includes(exe.split('/').pop()), false, exe);
  }
});

test('refusal reason: uid/home booleans and other/wrapper parents are reported without values', () => {
  const f = fixture();
  const extra = row(31, 999);
  addMember(f, extra, { ...extra, uid: 4242, home: '/home/secret-user', exe: '/opt/private/tool', executableIdentity: identity });
  let error = refusal(f);
  assert.deepEqual([error.reason.uidMatches, error.reason.homeMatchesPlan, error.reason.parent, error.reason.exe], [false, false, 'other', 'unreceipted']);
  assert.equal(/secret-user|4242|private/.test(error.message), false);
  f.members.pop();
  const direct = row(32, 20);
  addMember(f, direct, { ...direct, uid: UID, home: f.plan.home, exe: '/usr/bin/foreign', executableIdentity: identity });
  error = refusal(f);
  assert.equal(error.reason.parent, 'child-of-wrapper');
});

test('refusal reason: a second receipted dbus-daemon is duplicate-role:daemon naming only the receipted executable', () => {
  const f = fixture();
  const extra = row(33, 22);
  addMember(f, extra, { ...extra, uid: UID, home: f.plan.home, exe: f.receipts['dbus-daemon'].path, executableIdentity: f.receipts['dbus-daemon'].identity });
  const error = refusal(f);
  assert.deepEqual([error.reason.condition, error.reason.exe, error.reason.pid, error.reason.parent], ['duplicate-role:daemon', 'dbus-daemon', 33, 'child-of-daemon']);
});

test('refusal reason: wrapper with a wrong receipt field is receipt-mismatch:<field>', () => {
  for (const [patch, field, uidOk, homeOk] of [[{ uid: 5 }, 'uid', false, true], [{ home: '/elsewhere' }, 'home', true, false],
    [{ exe: '/usr/bin/sh' }, 'exe', true, true]]) {
    const f = fixture();
    f.strict[20] = { ...f.strict[20], ...patch };
    // wrapper fails the receipt check; leader is always role 'wrapper' by pid
    const error = refusal(f);
    assert.equal(error.reason.condition, `receipt-mismatch:${field}`);
    assert.deepEqual([error.reason.uidMatches, error.reason.homeMatchesPlan], [uidOk, homeOk]);
  }
  const f = fixture();
  f.strict[20] = { ...f.strict[20], executableIdentity: { ...identity, ino: 999 } };
  assert.equal(refusal(f).reason.condition, 'receipt-mismatch:executableIdentity');
});

test('refusal reason: substitution, exited member, second unreadable member and unreadable non-EACCES keep failing closed with a reason', () => {
  let f = fixture();
  let n = 0; const base = f.inspect;
  f.inspect = pid => (pid === 22 ? { ...base(22), starttime: String(++n) } : base(pid));
  assert.equal(refusal(f).reason.condition, 'substitution');
  f = fixture(); f.members[2].state = 'Z';
  assert.deepEqual([refusal(f).reason.condition, refusal(f).reason.state], ['member-exited', 'Z']);
  f = fixture();
  const second = row(34, 20);
  addMember(f, second, null);
  const wasInspect = f.inspect;
  f.inspect = pid => { if (pid === 34) throw f.eacces(); return wasInspect(pid); };
  let error = refusal(f);
  assert.equal(error.code, 'EACCES'); // original error object/code is preserved
  assert.equal(error.reason.condition, 'second-unreadable-member');
  f = fixture();
  f.inspect = pid => { if (pid === 22) throw Object.assign(Error('gone'), { code: 'ENOENT' }); return base(pid); };
  error = refusal(f);
  assert.equal(error.code, 'ENOENT');
  assert.equal(error.reason.condition, 'unreadable:ENOENT');
});

test('refusal reasons never make a refused member acceptable: roles stay unset and a clean family still passes', () => {
  const f = fixture();
  assert.equal(prove(f).kwin.pid, 21);
  const extra = row(35, 21);
  addMember(f, extra, { ...extra, uid: UID, home: f.plan.home, exe: '/usr/bin/foreign', executableIdentity: identity });
  assert.throws(() => prove(f), /Unexpected compositor descendant/);
});
