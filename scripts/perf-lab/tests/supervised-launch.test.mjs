import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { bindSupervisorProtocol } from '../supervised-launch-worker.mjs';
import { parseOptions } from '../short-lifecycle.mjs';
import { SupervisorSession, validateSupervisorPlan } from '../supervised-launch-core.mjs';

const plan = () => ({ revision: 1, runDir: '/tmp/perf-lab/supervised-private', binary: '/isolated/approved/youcoded/desktop/release/linux-unpacked/youcoded',
  packageReceipt: { revision: 1, checkout: '/isolated/approved/youcoded', packageRoot: '/isolated/approved/youcoded/desktop/release/linux-unpacked' },
  home: '/tmp/perf-lab/supervised-private/home', bin: '/tmp/perf-lab/supervised-private/home/bin',
  userData: '/tmp/perf-lab/supervised-private/home/.config/youcoded', perfLog: '/tmp/perf-lab/supervised-private/home/perf-marks.jsonl',
  wallMs: 60000, maxRssMb: 1536, cleanupReserveMs: 8000, cdpPort: 9569, display: ':99' });
function fake({ captureFail = false, cleanupFail = false, badEndpoint = false } = {}) {
  const events = [], child = new EventEmitter(); child.pid = 20;
  let clock = 0, rss = 10, alive = true, released = false, exited = false, closed = false;
  const family = { leader: { pid: 20, starttime: '200', ppid: 10, pgrp: 20, session: 20 }, known: new Map(),
    sample: () => ({ rssMb: rss, members: alive ? [{ pid: 20, state: 'S' }] : [] }),
    cleanup: async () => { events.push('cleanup'); alive = false; return { cleanupConfirmed: !cleanupFail, survivors: cleanupFail ? [{ pid: 21, state: 'Z' }] : [] }; } };
  const deps = {
    now: () => clock, persist: row => events.push(row.type), emit: row => events.push(row.type),
    spawnGate: async () => { events.push('spawn'); return { child, family, capture: async () => { if (captureFail) throw Error('gate identity refused'); events.push('capture'); },
      release: () => { released = true; events.push('release'); }, abort: () => { events.push('gate-abort'); alive = false; },
      corroborate: async () => { events.push('exec-proof'); },
      pipeState: () => ({ exited, closed }), waitClosed: async () => ({ exited, closed }), };
    },
    endpoint: async () => { if (badEndpoint) throw Error('unknown socket'); return { owned: true }; },
  };
  return { events, child, deps, get released() { return released; }, setClock: n => { clock = n; }, setRss: n => { rss = n; }, setAlive: n => { alive = n; },
    setPipes: (e, c) => { exited = e; closed = c; }, make: () => new SupervisorSession(plan(), deps) };
}

test('lifecycle supervised mode requires model-free cached package, explicit caps and fresh output', () => {
  const args = ['--supervised', '--model-free', '--app-dir', '/tmp/cached/youcoded-package', '--out', '/tmp/result.json', '--max-minutes', '2', '--max-rss-mb', '1536', '--cleanup-reserve-ms', '8000'];
  const opts = parseOptions(args);
  assert.equal(opts.supervised, true); assert.equal(opts.maxRssMb, 1536); assert.equal(opts.cleanupReserveMs, 8000);
  for (const flag of ['--model-free','--app-dir','--out','--max-minutes','--max-rss-mb','--cleanup-reserve-ms']) {
    const n = args.indexOf(flag), shortened = args.filter((v, i) => i !== n && (flag === '--model-free' || i !== n + 1));
    assert.throws(() => parseOptions(shortened));
  }
  assert.throws(() => parseOptions(args.map(v => v === '1536' ? '2049' : v)), /rss/i);
});

test('fixed plan refuses missing private identity, unsafe commands, caps and insufficient cleanup reserve', () => {
  assert.equal(validateSupervisorPlan(plan()).maxRssMb, 1536);
  for (const patch of [{ binary: '/opt/YouCoded/youcoded' }, { binary: '/tmp/pkg/sh' }, { home: '/home/destin' }, { maxRssMb: 2049 }, { cleanupReserveMs: 100 }, { argv: ['-e', 'bad'] }, { env: { HOME: '/home/destin' } }, { wallMs: Infinity }, { cdpPort: 80 }]) assert.throws(() => validateSupervisorPlan({ ...plan(), ...patch }));
});

test('acknowledgement precedes one request, gate ownership precedes release/exec and no arbitrary protocol commands exist', async () => {
  const f = fake(), s = f.make(); s.ready();
  await s.handle({ type: 'launch' });
  assert.deepEqual(f.events.filter(x => ['ready','spawn','capture','release','exec-proof','launched'].includes(x)), ['ready','ready','spawn','capture','release','exec-proof','launched','launched']);
  await assert.rejects(s.handle({ type: 'signal', pid: 99 }), /protocol/);
  await assert.rejects(s.handle({ type: 'launch' }), /one launch/);
  f.setPipes(true, true); await s.stop('test');
});

test('controller disconnect before request spawns nothing and retires', async () => {
  const f = fake(), s = f.make(); s.ready();
  const result = await s.stop('controller-disconnect');
  assert.equal(result.cleanupConfirmed, true); assert.equal(f.events.includes('spawn'), false);
  await assert.rejects(s.handle({ type: 'launch' }), /retired/);
});

test('capture failure never releases the gate; gate EOF abort is not misreported as family retirement', async () => {
  const f = fake({ captureFail: true }), s = f.make(); s.ready();
  await assert.rejects(s.handle({ type: 'launch' }), /identity/);
  assert.equal(f.released, false); assert.ok(f.events.includes('gate-abort'));
  assert.equal(s.receipt.cleanupConfirmed, false);
});

test('wall reserve and RSS independently stop work while controller is blocked', async () => {
  for (const reason of ['deadline-reserve', 'memory-limit', 'dead-app']) {
    const f = fake(), s = f.make(); s.ready(); await s.handle({ type: 'launch' });
    f.setPipes(true, true);
    if (reason === 'deadline-reserve') f.setClock(55000);
    if (reason === 'memory-limit') f.setRss(1537);
    if (reason === 'dead-app') f.setAlive(false);
    await s.tick();
    assert.equal(s.receipt.reason, reason); assert.equal(s.receipt.cleanupConfirmed, true);
  }
});

test('unknown CDP socket fails closed before attach and cleanup is independent of controller', async () => {
  const f = fake({ badEndpoint: true }), s = f.make(); s.ready(); await s.handle({ type: 'launch' });
  await assert.rejects(s.handle({ type: 'endpoint' }), /socket/);
  f.setPipes(true, true); const result = await s.stop('disconnect');
  assert.equal(result.cleanupConfirmed, true);
});

test('leader exit is distinct from stdio close, delayed close/reaping and cleanup failure prohibit retirement/retry', async () => {
  for (const failure of ['close', 'family']) {
    const f = fake({ cleanupFail: failure === 'family' }), s = f.make(); s.ready(); await s.handle({ type: 'launch' });
    f.setPipes(true, failure !== 'close');
    const result = await s.stop('controller-disconnect');
    assert.equal(result.cleanupConfirmed, false);
    assert.equal(s.state, 'failed-retirement');
    await assert.rejects(s.handle({ type: 'launch' }), /retired/);
  }
});

test('stdio error or observed family cleanup error remains unconfirmed despite exit and close', async () => {
  const f = fake(), s = f.make(); s.ready(); await s.handle({ type: 'launch' });
  s.gate.waitClosed = async () => ({ exited: true, closed: true, error: 'pipe read failed' });
  assert.equal((await s.stop('test')).cleanupConfirmed, false);
});

test('actual worker protocol handles blocked/disconnected controller and refuses public PID/argv payloads', async () => {
  for (const launched of [false, true]) {
    const f = fake(), s = f.make(), controller = new EventEmitter(), responses = [];
    s.ready(); let finishResult;
    const detach = bindSupervisorProtocol(controller, s, { send: m => responses.push(m), isStopping: () => Boolean(s.stopping), finish: reason => { finishResult = s.stop(reason); return finishResult; } });
    if (launched) {
      controller.emit('message', { id: 1, type: 'launch' }); await new Promise(setImmediate);
      assert.equal(responses[0].result.pid, 20); f.setPipes(true, true);
    }
    controller.emit('disconnect'); await finishResult;
    assert.equal(s.receipt.cleanupConfirmed, true);
    assert.equal(f.events.includes('spawn'), launched);
    detach();
    for (const event of ['message','disconnect','SIGTERM','SIGINT']) assert.equal(controller.listenerCount(event), 0);
  }
  const f = fake(), s = f.make(), controller = new EventEmitter(); s.ready(); let result;
  const detach = bindSupervisorProtocol(controller, s, { send: () => {}, isStopping: () => false, finish: reason => { result = s.stop(reason); return result; } });
  controller.emit('message', { id: 1, type: 'launch', pid: 123, argv: ['/bin/sh'] }); await result;
  assert.equal(f.events.includes('spawn'), false); assert.equal(s.receipt.reason, 'invalid-protocol'); detach();
});

test('stop during a delayed launch prevents release and cannot race a second request', async () => {
  const f = fake(); let finish;
  const gate = await f.deps.spawnGate();
  f.deps.spawnGate = () => new Promise(resolve => { finish = () => resolve(gate); });
  const s = f.make(); s.ready(); const pending = s.handle({ type: 'launch' });
  await s.stop('disconnect'); finish();
  await assert.rejects(pending, /retired/);
  assert.equal(f.released, false); assert.ok(f.events.includes('gate-abort'));
});
