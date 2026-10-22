import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  CompositorConfiguration, helperCommand, helperEnvironment,
  parseKScreen, parseWaylandOutput, verifyHelperIdentity, createHelperOutputCollector, HELPER_CAPS,
  HelperExecEvidence,
} from '../supervised-compositor-helpers.mjs';
import { compositorPlan } from '../supervised-compositor-policy.mjs';
import { CompositorSession } from '../supervised-compositor-core.mjs';
import { bindSupervisorProtocol } from '../supervised-launch-worker.mjs';
import { assertProtocolEnvelope } from '../supervised-protocol.mjs';
import { CLEANUP_BUDGET } from '../supervised-launch-core.mjs';
import { COMPOSITOR_CAPS } from '../supervised-compositor-policy.mjs';
import { proveCompositorBusSocket } from '../supervised-compositor-linux.mjs';

const plan = compositorPlan('/tmp/perf-lab-helper/reservation', 'perf-0123456789abcdef');
const receipts = Object.fromEntries(['kscreen-doctor', 'wayland-info'].map((name, i) => [name, {
  path: `/usr/bin/${name}`, identity: { dev: 1, ino: 10 + i, uid: 0, mode: 0o100755 },
}]));
const json = (patch = {}) => JSON.stringify({ outputs: [{
  id: 1, name: 'Virtual-0', connected: true, enabled: true, currentModeId: '7',
  scale: 1.5, rotation: 1, pos: { x: 0, y: 0 },
  modes: [{ id: '7', size: { width: 2560, height: 1600 }, refreshRate: 60 }],
  ...patch,
}] });
const wayland = `interface: 'wl_output', version: 4, name: 9
\tname: Virtual-0
\txdg_output_v1
\t\tname: 'Virtual-0'
\t\tlogical_width: 1707, logical_height: 1067
\tmode:
\t\twidth: 2560 px, height: 1600 px, refresh: 60.000 Hz,
\t\tflags: current preferred
`;
const proof = () => ({ owned: true, socketPath: plan.socketPath, filesystemDevice: 1,
  filesystemInode: 40, kernelInode: '80', owners: [{ pid: 20, starttime: '200' }] });
function rig(options = {}) {
  const events = [], gates = [];
  let time = 0, calls = 0, checks = 0;
  const deps = {
    now: () => time,
    note: (type) => events.push(type),
    proveSocket: () => {
      checks++;
      if (options.replaceAt === checks) return { ...proof(), kernelInode: '81' };
      return proof();
    },
    spawnHelper: async (step, selection) => {
      const index = calls++;
      events.push(`spawn:${step}`);
      const family = {
        leader: { pid: 30 + index, starttime: String(index + 100) },
        sample: () => ({ members: [], rssMb: 1 }),
        cleanup: async () => {
          events.push(`cleanup:${step}`);
          return { cleanupConfirmed: options.badRetirement !== index, survivors: [] };
        },
      };
      const gate = {
        family,
        capture: async () => { if (options.partialCapture === index) throw Error('partial capture'); },
        release: () => events.push(`release:${step}`),
        corroborate: async () => { if (options.roleSwap === index) throw Error('role swapped'); },
        abort: () => events.push(`abort:${step}`),
        waitResult: async () => {
          if (options.timeout === index) { time += 3001; throw Error('helper timeout'); }
          if (options.failedExit === index) throw Error('helper exit nonzero');
          const stdout = step === 'wayland' ? wayland : step === 'apply' ? '' : json();
          const role = step === 'wayland' ? 'wayland-info' : 'kscreen-doctor';
          return { stdout: options.output?.(step, stdout) ?? stdout, stderrBytes: 0, code: 0, signal: null,
            execution: { kind: 'authorized_fdexec_completed', runtimeExeObserved: false, observed: null,
              receiptPipeEOF: true, exit: { code: 0, signal: null },
              authorizer: { revision: 1, kind: 'authorized_fdexec', pid: 30 + index, uid: 1000,
                home: plan.home, purpose: step, identity: receipts[role].identity, planDigest: 'a'.repeat(64) },
              capturedGate: { pid: 30 + index, starttime: String(index + 100), ppid: 10,
                expectedExe: '/usr/bin/python3', uid: 1000, home: plan.home } } };
        },
        waitClosed: async () => ({ exited: true, closed: options.openPipes !== index, error: null, code: 0, signal: null }),
        disposeLocal: () => { events.push(`dispose:${step}`); return { errors: [] }; },
      };
      gates.push(gate);
      return gate;
    },
  };
  return { deps, events, gates, get calls() { return calls; }, setTime: n => { time = n; },
    make: () => new CompositorConfiguration(plan, receipts, deps, 52000) };
}
test('fast helper completion requires bound gate receipt, EOF and normal exit without fabricated live proof', () => {
  const expected = { pid: 30, uid: 1000, home: plan.home, purpose: 'initial',
    planDigest: 'a'.repeat(64), identity: receipts['kscreen-doctor'].identity };
  const receipt = { revision: 1, kind: 'authorized_fdexec', ...expected };
  const evidence = new HelperExecEvidence(expected);
  evidence.append(Buffer.from('G'));
  const packet = Buffer.from(JSON.stringify(receipt) + '\n');
  evidence.append(packet.subarray(0, 10)); evidence.append(packet.subarray(10)); evidence.end();
  const completed = { released: true, connected: true, exited: true, closed: true, code: 0, signal: null };
  // Actual adapter's polling decision, with exit delivered before its first poll.
  const result = evidence.corroborate(completed, () => assert.fail('fast exited child has no live exe'),
    null, null, plan, 1000, '/usr/bin/python3');
  assert.equal(result.kind, 'authorized_fdexec_completed');
  assert.equal(result.runtimeExeObserved, false);
  assert.equal(evidence.corroborate({ ...completed, closed: false }, () => assert.fail('no inspect after exit')), false);
  // WHY (race 1): with the pre-exec receipt in hand, a process that is already gone from /proc is still a
  // proven release; it must not depend on catching the helper alive.
  assert.equal(evidence.corroborate({ ...completed, exited: false }, () => {
    throw Object.assign(Error('already gone'), { code: 'ENOENT' });
  }), true);
  const noReceipt = new HelperExecEvidence(expected); noReceipt.append(Buffer.from('G'));
  assert.equal(noReceipt.corroborate({ ...completed, exited: false }, () => {
    throw Object.assign(Error('already gone'), { code: 'ENOENT' });
  }), false, 'no receipt and no exit yet: keep waiting (bounded by the helper wall)');
  const leader = { pid: 30, starttime: '300', ppid: 10, pgrp: 30, session: 30 };
  assert.throws(() => evidence.corroborate({ ...completed, exited: false }, () => ({ ...leader,
    uid: 1000, home: plan.home, exe: '/usr/bin/foreign', executableIdentity: expected.identity }),
  leader, receipts['kscreen-doctor'], plan, 1000, '/usr/bin/python3'), /role executable/);
  evidence.observe({ ...leader, uid: 1000, home: plan.home, exe: receipts['kscreen-doctor'].path,
    executableIdentity: expected.identity }, leader, receipts['kscreen-doctor'], plan, 1000, '/usr/bin/python3');
  assert.equal(evidence.completed(completed).kind, 'observed_postexec');
  for (const patch of [{ connected: false }, { released: false }, { code: 68 }, { signal: 'SIGTERM' }, { closed: false }]) {
    assert.throws(() => evidence.completed({ released: true, connected: true, exited: true, closed: true, code: 0, signal: null, ...patch }));
  }
  for (const patch of [{ uid: 9 }, { home: '/real/home' }, { pid: 31 }, { planDigest: 'b'.repeat(64) },
    { identity: { ...expected.identity, ino: 99 } }]) {
    const wrong = new HelperExecEvidence(expected); wrong.append(Buffer.from('G'));
    assert.throws(() => wrong.append(Buffer.from(JSON.stringify({ ...receipt, ...patch }) + '\n')));
  }
  const missing = new HelperExecEvidence(expected); missing.append(Buffer.from('G')); missing.end();
  assert.throws(() => missing.completed({ released: true, connected: true, exited: true, closed: true, code: 0, signal: null }));
  const flood = new HelperExecEvidence(expected);
  assert.throws(() => flood.append(Buffer.alloc(4097)));
});
test('fixed helper contract admits only four purposes, validated IDs and private environment', () => {
  const selected = parseKScreen(json());
  assert.deepEqual(helperCommand(receipts, 'initial', null).argv, ['/usr/bin/kscreen-doctor', '-j']);
  assert.deepEqual(helperCommand(receipts, 'apply', selected).argv,
    ['/usr/bin/kscreen-doctor', 'output.1.mode.7', 'output.1.scale.1.5']);
  assert.deepEqual(helperCommand(receipts, 'wayland', null).argv, ['/usr/bin/wayland-info']);
  assert.throws(() => helperCommand(receipts, 'exec', selected));
  for (const id of ['7.scale.2', '../7', '07', '-1', '7;bad']) {
    assert.throws(() => helperCommand(receipts, 'apply', { ...selected, modeId: id }));
  }
  const env = helperEnvironment(plan);
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS, `unix:path=${plan.runtime}/bus`);
  assert.equal(env.DBUS_SYSTEM_BUS_ADDRESS, `unix:path=${plan.runtime}/no-system-bus`);
  assert.equal(env.WAYLAND_DISPLAY, plan.socketName);
  for (const key of ['DISPLAY', 'XAUTHORITY', 'QT_PLUGIN_PATH', 'NODE_OPTIONS']) assert.equal(env[key], undefined);
});
test('strict metadata rejects truncation, ambiguous outputs, inactive state, unexpected IDs and missing exact mode', () => {
  assert.throws(() => parseKScreen(json().slice(0, -1)));
  const cases = [
    { id: '1' }, { name: 'eDP-1' }, { enabled: false }, { connected: false },
    { currentModeId: 'unknown' }, { scale: 0 }, { rotation: 2 },
    { modes: [{ id: '7.scale.2', size: { width: 2560, height: 1600 }, refreshRate: 60 }] },
    { modes: [{ id: '7', size: { width: 2560, height: 1600 }, refreshRate: 120 }] },
  ];
  for (const patch of cases) assert.throws(() => parseKScreen(json(patch)));
  const twice = JSON.parse(json()); twice.outputs.push(twice.outputs[0]);
  assert.throws(() => parseKScreen(JSON.stringify(twice)));
  assert.throws(() => parseKScreen(' '.repeat(262145)));
  assert.throws(() => parseKScreen(json({ scale: 1 }), { effective: true }));
  assert.throws(() => parseWaylandOutput(wayland.replace('60.000', '120.000')));
  assert.throws(() => parseWaylandOutput(wayland.replace('1707', '2560')));
  assert.throws(() => parseWaylandOutput(wayland.replace('current preferred', 'preferred')));
  assert.throws(() => parseWaylandOutput(wayland + wayland));
});
test('four serial owned helpers retire before the next; observed readbacks certify metadata only', async () => {
  const f = rig({ output: (step, stdout) => step === 'initial' ? json({ scale: 1, currentModeId: '6',
    modes: [{ id: '6', size: { width: 2560, height: 1600 }, refreshRate: 120 },
      { id: '7', size: { width: 2560, height: 1600 }, refreshRate: 60 }] }) : stdout }), config = f.make();
  const result = await config.inspect();
  assert.equal(result.modeVerified, true);
  assert.doesNotThrow(() => assertProtocolEnvelope({ event: { revision: 1, type: 'configuration-observed', ...result } }));
  const observedProofs = structuredClone(result);
  for (const helper of observedProofs.helpers) {
    helper.executionKind = 'observed_postexec';
    helper.runtimeExeObserved = true;
  }
  assert.doesNotThrow(() => assertProtocolEnvelope({ id: 1, result: observedProofs }));
  assert.equal(result.observed.refreshHz, 60);
  assert.equal(result.observed.scale, 1.5);
  assert.equal(result.wayland.logicalWidth, 1707);
  assert.equal(result.helpers.length, 4);
  assert.equal(result.helpers.every(r => r.cleanupConfirmed), true);
  assert.equal(f.calls, 4);
  assert.ok(f.events.indexOf('dispose:initial') < f.events.indexOf('spawn:apply'));
  await config.inspect(); assert.equal(f.calls, 4);
});
test('socket replacement, role swaps, capture failure and unconfirmed retirement prevent later helpers', async () => {
  for (const options of [{ replaceAt: 3 }, { roleSwap: 0 }, { partialCapture: 0 },
    { badRetirement: 1 }, { openPipes: 1 }, { timeout: 0 }, { failedExit: 0 }]) {
    const f = rig(options), config = f.make();
    await assert.rejects(config.inspect());
    const calls = f.calls;
    await assert.rejects(config.inspect()); assert.equal(f.calls, calls);
    assert.ok(f.events.some(e => e.startsWith('cleanup:')));
    assert.ok(f.events.some(e => e.startsWith('dispose:')));
    assert.ok(calls < 4);
  }
});
test('effective metadata mismatch rolls back despite successful command exits', async () => {
  const f = rig({ output: (step, stdout) => step === 'final' ? json({ scale: 1 }) : stdout });
  await assert.rejects(f.make().inspect()); assert.equal(f.calls, 3);
});
test('helper bus proof binds private socket to the tracked exact D-Bus daemon, not KWin or a foreign FD', () => {
  const roles = ['dbus-run-session', 'kwin_wayland', 'dbus-daemon'];
  const approved = Object.fromEntries(roles.map((role, index) => [role, {
    path: `/usr/bin/${role}`, identity: { dev: 1, ino: index + 20, uid: 0, mode: 0o100755 },
  }]));
  const members = roles.map((role, index) => ({ pid: 20 + index, ppid: index ? 20 : 10,
    starttime: String(200 + index), session: 20, pgrp: 20, state: 'S', rssMb: 1,
    home: plan.home, uid: 1000, exe: approved[role].path, executableIdentity: approved[role].identity }));
  const family = { leader: members[0], known: new Map(members.map(row => [row.pid, row])),
    sample: () => ({ members, rssMb: 3 }), protect: () => {} };
  const options = { uid: 1000, canonical: path => path,
    lstat: () => ({ uid: 1000, dev: 3, ino: 44, isSocket: () => true, isSymbolicLink: () => false }),
    table: () => `header\n0000: 00000002 00000000 00010000 0001 01 88 ${plan.runtime}/bus\n`,
    fds: pid => pid === 22 ? ['socket:[88]'] : [], inspect: pid => members.find(row => row.pid === pid) };
  const bus = proveCompositorBusSocket(family, plan, approved, options);
  assert.equal(bus.kernelInode, '88'); assert.equal(bus.filesystemInode, 44); assert.equal(bus.owners[0].pid, 22);
  options.fds = () => []; assert.throws(() => proveCompositorBusSocket(family, plan, approved, options), /owner/);
});
test('producer caps stdout/stderr before retention and never certifies a truncated prefix', () => {
  for (const [name, cap] of [['stdout', HELPER_CAPS.stdoutBytes], ['stderr', HELPER_CAPS.stderrBytes]]) {
    const collector = createHelperOutputCollector();
    collector.append(name, Buffer.alloc(cap));
    assert.doesNotThrow(() => collector.check());
    collector.append(name, Buffer.from('!'));
    assert.throws(() => collector.check(), /cap/);
    assert.throws(() => collector.result(), /cap/);
  }
  const flood = createHelperOutputCollector();
  for (let i = 0; i <= HELPER_CAPS.outputPackets; i++) flood.append('stdout', Buffer.from('a'));
  assert.throws(() => flood.result(), /packet cap/);
  const invalid = createHelperOutputCollector();
  invalid.append('stdout', Buffer.from([0xc0, 0xaf]));
  assert.throws(() => invalid.result());
});
test('fixed helper work and active rollback fit sequence and compositor cleanup reserve', () => {
  const helperRetirement = HELPER_CAPS.termMs + HELPER_CAPS.killMs + HELPER_CAPS.closeMs + CLEANUP_BUDGET.stabilizeMs;
  assert.ok(HELPER_CAPS.count * (HELPER_CAPS.wallMs + helperRetirement) < HELPER_CAPS.sequenceMs);
  const rollback = COMPOSITOR_CAPS.startupMs + helperRetirement + CLEANUP_BUDGET.termMs +
    CLEANUP_BUDGET.killMs + CLEANUP_BUDGET.exitCloseMs + CLEANUP_BUDGET.stabilizeMs + COMPOSITOR_CAPS.pollMs + 250;
  assert.ok(rollback < COMPOSITOR_CAPS.cleanupReserveMs);
});
test('deadline and final output identity mismatch prohibit additional helpers', async () => {
  const f = rig(), config = f.make(); f.setTime(HELPER_CAPS.sequenceMs + 1);
  await assert.rejects(config.inspect()); assert.equal(f.calls, 0);
  const changed = rig({ output: (step, stdout) => step === 'final' ? json({ id: 2 }) : stdout });
  await assert.rejects(changed.make().inspect(), /identity/); assert.equal(changed.calls, 3);
});
test('helper post-exec identity must match captured worker child, fixed ELF role and HOME', () => {
  const leader = { pid: 30, ppid: 10, starttime: '300', session: 30, pgrp: 30 };
  const actual = { ...leader, uid: 1000, home: plan.home, exe: receipts['kscreen-doctor'].path,
    executableIdentity: receipts['kscreen-doctor'].identity };
  assert.equal(verifyHelperIdentity(actual, leader, receipts['kscreen-doctor'], plan, 1000, '/usr/bin/python3'), true);
  for (const patch of [{ exe: '/bin/sh' }, { ppid: 1 }, { starttime: '301' }, { uid: 9 },
    { executableIdentity: { ...actual.executableIdentity, ino: 99 } }]) {
    assert.throws(() => verifyHelperIdentity({ ...actual, ...patch }, leader, receipts['kscreen-doctor'], plan, 1000, '/usr/bin/python3'));
  }
});
test('race: unreadable HOME mid-exec is transient; every definite mismatch still fails closed', () => {
  const leader = { pid: 30, ppid: 10, starttime: '300', session: 30, pgrp: 30 };
  const role = receipts['kscreen-doctor'], gate = '/usr/bin/python3';
  const actual = { ...leader, uid: 1000, home: plan.home, exe: role.path, executableIdentity: role.identity };
  for (const home of [undefined, null]) {
    assert.equal(verifyHelperIdentity({ ...actual, home }, leader, role, plan, 1000, gate), null);
    const ev = new HelperExecEvidence({ identity: role.identity });
    assert.equal(ev.observe({ ...actual, home }, leader, role, plan, 1000, gate), false);
    assert.equal(ev.observed, null, 'unreadable HOME is never recorded as an observation');
  }
  assert.throws(() => verifyHelperIdentity({ ...actual, home: '/real/home' }, leader, role, plan, 1000, gate), /\(home\)/);
  assert.throws(() => verifyHelperIdentity({ ...actual, home: undefined, pid: 31 }, leader, role, plan, 1000, gate), /pid/);
  assert.throws(() => verifyHelperIdentity({ ...actual, home: undefined, uid: 9 }, leader, role, plan, 1000, gate), /uid/);
  assert.throws(() => verifyHelperIdentity({ ...actual, home: undefined, ppid: 1 }, leader, role, plan, 1000, gate), /ppid/);
});
test('race: exiting/changing process is transient for the tolerant poll; foreign errors and executables are not', () => {
  const leader = { pid: 30, ppid: 10, starttime: '300', session: 30, pgrp: 30 }, role = receipts['kscreen-doctor'];
  const ev = new HelperExecEvidence({ identity: role.identity });
  for (const code of ['ENOENT', 'ESRCH', 'EIDENTITYCHANGED']) {
    assert.equal(ev.tryObserve(() => { throw Object.assign(Error('gone'), { code }); }, leader, role, plan, 1000, '/usr/bin/python3'), false);
  }
  assert.equal(ev.tryObserve(() => null, leader, role, plan, 1000, '/usr/bin/python3'), false);
  assert.throws(() => ev.tryObserve(() => { throw Object.assign(Error('denied'), { code: 'EACCES' }); },
    leader, role, plan, 1000, '/usr/bin/python3'), /denied/);
  assert.equal(ev.tryObserve(() => ({ ...leader, uid: 1000, home: plan.home, exe: '/usr/bin/python3',
    executableIdentity: role.identity }), leader, role, plan, 1000, '/usr/bin/python3'), false, 'still the gate before execve');
});
test('race: slow helper (receipt first, exit much later) is released by the receipt, completed only by clean exit', () => {
  const expected = { pid: 30, uid: 1000, home: plan.home, purpose: 'initial', planDigest: 'a'.repeat(64), identity: receipts['kscreen-doctor'].identity };
  const ev = new HelperExecEvidence(expected);
  ev.append(Buffer.from('G'));
  const state = { released: true, connected: true, disposed: false, exited: false, closed: false, code: null, signal: null };
  const gone = () => { throw Object.assign(Error('x'), { code: 'ESRCH' }); };
  assert.equal(ev.corroborate(state, gone), false, 'before the receipt: not yet proven');
  ev.append(Buffer.from(JSON.stringify({ revision: 1, kind: 'authorized_fdexec', ...expected }) + '\n'));
  assert.equal(ev.corroborate(state, gone), true, 'receipt alone releases corroboration regardless of helper runtime');
  assert.throws(() => ev.completed(state), /unconfirmed/);
  ev.end();
  assert.throws(() => ev.completed({ ...state, exited: true, closed: true, code: 68 }), /unconfirmed/, 'failed exec after receipt stays fail-closed');
  assert.equal(ev.completed({ ...state, exited: true, closed: true, code: 0 }).kind, 'authorized_fdexec_completed');
});
test('helper time bounds are sized to real kscreen-doctor behavior and still fit the sequence', () => {
  assert.ok(HELPER_CAPS.wallMs >= 5000 && HELPER_CAPS.gateReadyMs <= HELPER_CAPS.wallMs);
  assert.ok(COMPOSITOR_CAPS.startupMs + HELPER_CAPS.sequenceMs + 3000 < COMPOSITOR_CAPS.wallMs - COMPOSITOR_CAPS.cleanupReserveMs);
});
test('active helper disconnect cancels remaining sequence and rolls back before compositor family', async () => {
  const f = rig(), config = f.make(), spawn = f.deps.spawnHelper;
  let enteredOutput, cancelOutput;
  const outputEntered = new Promise(resolve => { enteredOutput = resolve; });
  f.deps.spawnHelper = async (...args) => {
    const gate = await spawn(...args), dispose = gate.disposeLocal;
    gate.waitResult = () => { enteredOutput(); return new Promise((_, reject) => { cancelOutput = reject; }); };
    gate.disposeLocal = () => { cancelOutput(Error('local resources disposed')); return dispose(); };
    return gate;
  };
  const family = { leader: { pid: 20 }, cleanup: async () => {
    f.events.push('compositor-cleanup'); return { cleanupConfirmed: true };
  } };
  const gate = { child: { pid: 20 }, family, capture: async () => {}, release: () => {},
    corroborate: async () => {}, abort: () => {}, waitClosed: async () => ({ exited: true, closed: true }) };
  const s = new CompositorSession(plan, { now: () => 0, persist: () => {}, emit: () => {},
    spawnGate: async () => gate, inspect: proof, createConfiguration: () => config });
  s.ready(); await s.handle({ type: 'start' });
  const channel = new EventEmitter();
  const detach = bindSupervisorProtocol(channel, s, { finish: reason => s.stop(reason), send: () => {}, isStopping: () => !!s.stopping });
  const inspection = s.handle({ type: 'inspect' }); await outputEntered;
  channel.emit('disconnect'); await s.stopping; const result = await inspection; detach();
  assert.equal(f.calls, 1); assert.equal(result.status, 'inspection-incomplete');
  assert.ok(f.events.indexOf('dispose:initial') < f.events.indexOf('compositor-cleanup'));
});
test('failed helper retirement poisons acquisition rollback and cannot restart configuration', async () => {
  const f = rig({ badRetirement: 0 }), config = f.make();
  const family = { leader: { pid: 20 }, cleanup: async () => ({ cleanupConfirmed: true }) };
  const gate = { child: { pid: 20 }, family, capture: async () => {}, release: () => {},
    corroborate: async () => {}, abort: () => {}, waitClosed: async () => ({ exited: true, closed: true }) };
  const s = new CompositorSession(plan, { now: () => 0, persist: () => {}, emit: () => {},
    spawnGate: async () => gate, inspect: proof, createConfiguration: () => config });
  s.ready(); await s.handle({ type: 'start' });
  const result = await s.handle({ type: 'inspect' });
  assert.equal(result.status, 'inspection-incomplete'); assert.equal(result.modeVerified, false);
  assert.equal(s.receipt.cleanupConfirmed, false); assert.equal(s.receipt.helpers.cleanupConfirmed, false);
  await assert.rejects(s.handle({ type: 'inspect' })); assert.equal(f.calls, 1);
});
test('actual session inspect command uses helper sequence and disconnect retires helpers before compositor', async () => {
  const f = rig(), config = f.make(), order = f.events;
  const family = { leader: { pid: 20 }, sample: () => ({ rssMb: 10, members: [{ pid: 20, state: 'S' }] }),
    cleanup: async () => { order.push('compositor-cleanup'); return { cleanupConfirmed: true }; } };
  const gate = { child: { pid: 20 }, family, capture: async () => {}, release: () => {},
    corroborate: async () => {}, abort: () => {}, waitClosed: async () => ({ exited: true, closed: true }) };
  const s = new CompositorSession(plan, { now: () => 0, persist: () => {}, emit: () => {},
    spawnGate: async () => gate, inspect: proof, createConfiguration: () => config });
  s.ready(); await s.handle({ type: 'start' });
  const channel = new EventEmitter(); let reply;
  const detach = bindSupervisorProtocol(channel, s, { finish: reason => s.stop(reason), send: value => { reply = value; }, isStopping: () => !!s.stopping });
  const observed = await s.handle({ type: 'inspect' });
  assert.equal(observed.modeVerified, true);
  assert.equal(observed.helpers.length, 4);
  channel.emit('disconnect'); await s.stopping; detach();
  assert.ok(order.indexOf('dispose:wayland') < order.indexOf('compositor-cleanup'));
  assert.equal(s.receipt.cleanupConfirmed, true);
  assert.equal(reply, undefined);
});
// WHY (helper-hardening-1): realistic FULL helper receipts are ~100 protocol records each; four of them
// overflowed the 512-record IPC budget and the retirement receipt was never delivered.
const fullReceipt = step => ({ step, cleanupConfirmed: true, error: null, familyError: null, memoryComplete: true,
  survivors: [], localErrors: [],
  pipes: { exited: true, closed: true, code: 0, signal: null, error: null,
    spawnedChild: { pid: 1, identityVerified: true, observedIdentity: { pid: 1, starttime: '2' }, starttime: '2' },
    gateEvidence: { kind: 'incomplete_helper_execution', receiptPipeEOF: true, runtimeExeObserved: false, observed: null,
      authorizer: { revision: 1, kind: 'authorized_fdexec', pid: 1, uid: 1000, home: plan.home, purpose: step,
        identity: { dev: 1, ino: 2, uid: 0, mode: 33261 }, planDigest: 'a'.repeat(64) } } },
  execution: { kind: 'authorized_fdexec_completed', runtimeExeObserved: false, observed: null, receiptPipeEOF: true,
    exit: { code: 0, signal: null }, capturedGate: { pid: 1, starttime: '2', ppid: 3, expectedExe: '/usr/bin/python3', uid: 1000, home: plan.home },
    authorizer: { revision: 1, kind: 'authorized_fdexec', pid: 1, uid: 1000, home: plan.home, purpose: step,
      identity: { dev: 1, ino: 2, uid: 0, mode: 33261 }, planDigest: 'a'.repeat(64) } } });
test('race: four realistic helper receipts are summarised to fit the IPC budget without losing verdicts', async () => {
  const { summarizeHelperRetirement } = await import('../supervised-compositor-helpers.mjs');
  const { fitRetirementReceipt } = await import('../supervised-compositor-core.mjs');
  const full = { cleanupConfirmed: true, receipts: ['initial', 'apply', 'final', 'wayland'].map(fullReceipt) };
  const fat = { reason: 'inspection-failed', cleanupConfirmed: true, abortError: null, family: { cleanupConfirmed: true, survivors: [] },
    pipes: { exited: true, closed: true }, helpers: full, descriptor: {} };
  assert.throws(() => assertProtocolEnvelope({ final: fat }), /record/, 'precondition: unsummarised receipts overflow');
  const slim = { ...fat, helpers: summarizeHelperRetirement(full) };
  assert.doesNotThrow(() => assertProtocolEnvelope({ final: slim }));
  assert.equal(slim.helpers.receipts[1].executionKind, 'authorized_fdexec_completed');
  assert.equal(slim.helpers.receipts.every(r => r.cleanupConfirmed && r.exited && r.closed && r.code === 0), true);
  // Even a receipt that is oversized for another reason keeps its verdicts instead of throwing.
  const huge = { ...fat, family: { cleanupConfirmed: true, survivors: [], procFailures: { records: Array.from({ length: 600 }, (_, i) => ({ i })) } } };
  const fitted = fitRetirementReceipt(huge);
  assert.doesNotThrow(() => assertProtocolEnvelope({ final: fitted }));
  assert.equal(fitted.cleanupConfirmed, true); assert.match(fitted.truncated, /ipc-record-budget/);
  assert.equal(fitRetirementReceipt({ ...huge, cleanupConfirmed: false }).cleanupConfirmed, false, 'a failed cleanup is never upgraded');
});
test('wayland geometry refusal names the observed values', () => {
  assert.throws(() => parseWaylandOutput(wayland.replace('1707', '1706')), /logical=1706x1067 intScale= modes=2560x1600@60\.000\*/);
});
// WHY: shape copied from the real kwin 6.7.5 report in scratch/perflab/containment-1 (no xdg_output block).
test('kwin 6.7 wl_output without logical size passes only with integer scale ceil(1.5)=2', () => {
  const real = `interface: 'wl_output', version: 4, name: 66
\tname: Virtual-0
\tdescription: Virtual-0
\tx: 0, y: 0, scale: 2,
\tphysical_width: -1 mm, physical_height: -1 mm,
\tmode:
\t\twidth: 2560 px, height: 1600 px, refresh: 60.000 Hz,
\t\tflags: current
`;
  const r = parseWaylandOutput(real);
  assert.equal(r.logicalSize, 'not-reported-by-compositor'); assert.equal(r.wlOutputIntegerScale, 2); assert.equal(r.refreshHz, 60);
  assert.throws(() => parseWaylandOutput(real.replace('scale: 2,', 'scale: 1,')), /intScale=1/);
  assert.throws(() => parseWaylandOutput(real.replace('\tx: 0, y: 0, scale: 2,\n', '')), /incomplete report/);
  assert.throws(() => parseWaylandOutput(real.replace('\tx: 0, y: 0, scale: 2,\n', '\tx: 0, y: 0, scale: 2,\n\tx: 0, y: 0, scale: 2,\n')));
});
test('wayland readback failure keeps a bounded wl_output excerpt as evidence', async () => {
  const { waylandOutputExcerpt } = await import('../supervised-compositor-helpers.mjs');
  // No logical size AND no integer scale line: still an incomplete report that must refuse.
  const noLogical = wayland.replace(/\t\tlogical_width.*\n/, '');
  const ex = waylandOutputExcerpt(noLogical + "interface: 'zwp_linux_dmabuf_v1', version: 4, name: 3\n" + 'x'.repeat(50000));
  assert.match(ex, /wl_output/); assert.match(ex, /refresh: 60\.000 Hz/); assert.ok(ex.length < 4200);
  assert.doesNotThrow(() => assertProtocolEnvelope({ event: { type: 'wayland-report-excerpt', revision: 1, excerpt: ex } }));
  const f = rig({ output: (step, stdout) => step === 'wayland' ? noLogical : stdout }), notes = [];
  const original = f.deps.note; f.deps.note = (type, fields) => { notes.push(type); return original(type, fields); };
  await assert.rejects(f.make().inspect(), /Wayland geometry/);
  assert.ok(notes.includes('wayland-report-excerpt') || f.events.includes('wayland-report-excerpt'));
});
// WHY (helper-hardening-3): a helper whose exec proof never succeeded still has a spawn-time identity;
// it must be retired through that family, not abandoned because family.leader was never set.
test('helper failing before its exec proof is retired through its spawn-time identity', async () => {
  const f = rig(), config = f.make(), spawn = f.deps.spawnHelper;
  let cleanups = 0;
  f.deps.spawnHelper = async (...args) => {
    const gate = await spawn(...args);
    gate.family = { spawned: { pid: 30, starttime: '100' }, sample: () => ({ members: [], rssMb: 0 }),
      cleanup: async () => { cleanups++; return { cleanupConfirmed: true, survivors: [] }; } };
    gate.capture = async () => { throw Error('gate never ready'); };
    return gate;
  };
  await assert.rejects(config.run('initial'), /gate never ready/);
  assert.equal(cleanups, 1);
  assert.equal(config.handles[0].receipt.cleanupConfirmed, true);
  assert.equal(config.sampleResources().members, 0); // spawn-only family has no sampleable leader and must not throw
});
