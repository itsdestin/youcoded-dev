import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPostExecIdentity } from '../supervised-launch-core.mjs';
import { OwnedProcesses } from '../owned-processes.mjs';
import { proveOwnedEndpoint } from '../supervised-launch-linux.mjs';
import { launchSupervisedApp } from '../launch-supervised-app.mjs';
import { SupervisorProxy } from '../supervised-launch.mjs';
import { EventEmitter } from 'node:events';

const root = '/tmp/perf-lab/supervised-private';
function rig() {
  const row = (pid, ppid, more = {}) => ({ pid, ppid, pgrp: pid, session: pid, starttime: String(pid * 100), cmdline: 'untagged', state: 'S', rssMb: 3, ...more });
  const table = new Map([[10,row(10,1)],[20,row(20,10)]]), signals = [];
  const family = new OwnedProcesses({ leaderPid: 20, parentPid: 10, jobDir: root, read: pid => table.get(pid), list: () => [...table.keys()], signal: (...args) => signals.push(args) });
  const inspect = pid => ({ ...table.get(pid), exe: '/usr/bin/python3.11', uid: 1000, home: root + '/home' });
  const policy = { expectedExe: '/usr/bin/python3.11', expectedUid: 1000, expectedHome: root + '/home', inspect };
  return { table, family, signals, inspect, policy };
}

test('narrow gate capture proves UID/exe/HOME/direct-parent/session/starttime without relaxing generic marker capture', () => {
  const good = rig(); assert.throws(() => good.family.capture(), /identity/);
  good.family.captureExecGate(good.policy); assert.equal(good.family.leader.starttime, '2000');
  for (const patch of [{ exe: '/bin/sh' }, { uid: 2000 }, { home: '/home/destin' }, { ppid: 1 }, { session: 99 }, { pgrp: 99 }, { starttime: 'reused' }]) {
    const f = rig();
    assert.throws(() => f.family.captureExecGate({ ...f.policy, inspect: pid => ({ ...f.inspect(pid), ...patch }) }), /identity/);
    assert.equal(f.family.known.size, 0); assert.deepEqual(f.signals, []);
  }
});

test('post-exec corroboration requires same leader identity, exact app exe, UID and HOME', () => {
  const f = rig(); const leader = f.table.get(20), plan = { home: root + '/home', binary: '/tmp/perf-lab/package/youcoded', packageReceipt: { identity: { dev: 1, ino: 2, uid: 1000, mode: 0o100755 } } };
  const record = { ...leader, uid: 1000, home: plan.home, exe: plan.binary, executableIdentity: { ...plan.packageReceipt.identity } };
  assert.equal(verifyPostExecIdentity(record, leader, plan, 1000, '/usr/bin/python3.11'), true);
  assert.equal(verifyPostExecIdentity({ ...record, exe: '/usr/bin/python3.11' }, leader, plan, 1000, '/usr/bin/python3.11'), false);
  for (const patch of [{ pid: 21 }, { starttime: 'reused' }, { ppid: 99 }, { session: 99 }, { pgrp: 99 }, { uid: 2000 }, { home: '/home/destin' }, { exe: '/bin/sh' }]) {
    assert.throws(() => verifyPostExecIdentity({ ...record, ...patch }, leader, plan, 1000, '/usr/bin/python3.11'), /identity|executable/);
  }
});

test('gate capture preserves protected ancestry and refuses mixed-time PID reuse', () => {
  const f = rig(); f.table.get(20).cmdline = `${process.env.HOME}/.youcoded/real`;
  assert.throws(() => f.family.captureExecGate(f.policy), /Protected/);
  const g = rig(); let reads = 0;
  assert.throws(() => g.family.captureExecGate({ ...g.policy, inspect: pid => ({ ...g.inspect(pid), starttime: ++reads === 1 ? '2000' : '9999' }) }), /identity/);
  assert.deepEqual(g.signals, []);
});

const tcp = inode => `header\n0: 0100007F:2561 00000000:0000 0A 0 0 0 1000 0 ${inode} 1\n`; // 9569

test('CDP proof binds loopback listener inode and owner starttime; unknown socket and owner reuse never authorize attach', () => {
  const member = { pid: 20, starttime: '2000' }, family = { sample: () => ({ members: [member] }) };
  const deps = { tables: () => [tcp('123')], inspect: () => member, fds: () => ['socket:[123]'] };
  assert.equal(proveOwnedEndpoint(family, 9569, deps).owned, true);
  assert.throws(() => proveOwnedEndpoint(family, 9569, { ...deps, fds: () => ['socket:[other]'] }), /Unknown socket/);
  assert.throws(() => proveOwnedEndpoint(family, 9569, { ...deps, inspect: () => ({ ...member, starttime: 'other' }) }), /identity/);
  assert.equal(proveOwnedEndpoint(family, 9569, { ...deps, tables: () => ['header\n'] }).pending, true);
  assert.throws(() => proveOwnedEndpoint(family, 9569, { ...deps, tables: () => [tcp('123').replace('0100007F','00000000')] }), /loopback/);
});

test('optional shared-launch route refuses conflicts and unsupported scope without spawn/marker cleanup', async () => {
  let spawned = 0, killed = 0;
  const backend = { assertBinding: () => {}, spawn: async () => { spawned++; }, kill: async () => { killed++; } };
  const options = { binary: '/tmp/pkg/youcoded', appDir: '/tmp/pkg', fixture: { home: root + '/home' }, supervisedBackend: backend };
  await assert.rejects(launchSupervisedApp(options, { findFamily: () => [99], ancestors: new Set(), portBusy: async () => false }), /conflict/);
  await assert.rejects(launchSupervisedApp({ ...options, extraArgs: ['--inspect'] }), /unsupported/);
  assert.equal(spawned, 0); assert.equal(killed, 2); // only retires the empty worker; no signal API invoked
});

test('supervised startup proves endpoint before HTTP and again before CDP; normal retirement removes all handlers', async () => {
  const runtime = new EventEmitter(), calls = [];
  const proc = { pid: 20, exitCode: null, signalCode: null };
  const backend = { assertBinding: () => {}, spawn: async () => proc, members: [{ pid: 20 }], output: () => 'tail',
    request: async type => { calls.push(type); return { owned: true }; }, disconnect: () => { calls.push('disconnect'); },
    kill: async () => { calls.push('kill'); return { cleanupConfirmed: true }; } };
  const cdp = { send: async method => calls.push(method), close: () => calls.push('cdp-close') };
  const app = await launchSupervisedApp({ binary: '/tmp/pkg/youcoded', appDir: '/tmp/pkg', fixture: { home: root + '/home' }, supervisedBackend: backend, cdpPort: 9569 },
    { runtime, findFamily: () => [], ancestors: new Set(), portBusy: async () => false,
      listTargets: async () => { calls.push('HTTP'); return [{ type: 'page', url: 'file:///tmp/pkg/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9569/devtools/page/owned' }]; },
      connect: async () => { calls.push('attach'); return cdp; } });
  assert.deepEqual(calls.slice(0,4), ['endpoint','HTTP','endpoint','attach']);
  assert.deepEqual(app.family(), [20]); await app.kill();
  for (const event of ['exit','SIGTERM','SIGINT']) assert.equal(runtime.listenerCount(event), 0);
});

test('localhost websocket target is rejected before any CDP attach despite owned numeric listener', async () => {
  let attached=0,retired=0;
  const runtime=new EventEmitter();
  const backend={assertBinding:()=>{},spawn:async()=>({pid:20,exitCode:null,signalCode:null}),request:async()=>({owned:true}),disconnect:()=>{},kill:async()=>{retired++;return {cleanupConfirmed:true};}};
  await assert.rejects(launchSupervisedApp({binary:'/tmp/pkg/youcoded',appDir:'/tmp/pkg',fixture:{home:root+'/home'},supervisedBackend:backend,cdpPort:9569},
    {runtime,ancestors:new Set(),findFamily:()=>[],portBusy:async()=>false,listTargets:async()=>[{type:'page',url:'file:///tmp/pkg/index.html',webSocketDebuggerUrl:'ws://localhost:9569/devtools/page/other'}],connect:async()=>{attached++;}}),/Untrusted CDP/);
  assert.equal(attached,0);assert.equal(retired,1);
});

test('startup error attempts independent supervisor retirement and propagates cleanup failure; removes controller listeners', async () => {
  const runtime = new EventEmitter(); let kills = 0, attaches = 0;
  const backend = { assertBinding: () => {}, spawn: async () => { throw Error('startup timeout'); }, kill: async () => { kills++; throw Error('unreaped zombie'); }, disconnect: () => {} };
  await assert.rejects(launchSupervisedApp({ binary: '/tmp/pkg/youcoded', appDir: '/tmp/pkg', fixture: { home: root + '/home' }, supervisedBackend: backend },
    { runtime, findFamily: () => [], ancestors: new Set(), portBusy: async () => false, connect: async () => { attaches++; } }), /startup\/cleanup failed/);
  assert.equal(kills, 1); assert.equal(attaches, 0);
  for (const event of ['exit','SIGTERM','SIGINT']) assert.equal(runtime.listenerCount(event), 0);
});

test('proxy accepts real exit+IPC resource retirement without aggregate Node close, still requiring cleanup receipt',async()=>{
 const worker=new EventEmitter();worker.connected=true;worker.send=()=>{};worker.disconnect=()=>{worker.connected=false;worker.emit('disconnect');};
 const proxy=new SupervisorProxy(worker);worker.emit('message',{event:{type:'ready'}});await proxy.ready;
 worker.emit('message',{event:{type:'retirement',cleanupConfirmed:true}});
 worker.disconnect();worker.emit('exit',0,null);
 assert.equal((await proxy.kill()).cleanupConfirmed,true);
});

test('proxy waits for worker close and retirement, not merely app exit; no remote PID signalling API', async () => {
  const worker = new EventEmitter(); worker.connected = true;
  worker.send = (m, done) => { done?.(); queueMicrotask(() => worker.emit('message', { id: m.id, result: { cleanupConfirmed: true } })); };
  worker.disconnect = () => { worker.connected = false; worker.emit('disconnect'); };
  const proxy = new SupervisorProxy(worker);
  worker.emit('message', { event: { type: 'ready' } }); await proxy.ready;
  worker.emit('message', { event: { type: 'app-exit', code: 0, signal: null } });
  assert.equal(proxy.retired, false);
  await assert.rejects(proxy.request('signal'), /unsupported/);
  worker.emit('message', { event: { type: 'retirement', cleanupConfirmed: false, survivors: [{ state: 'Z' }] } });
  worker.emit('exit', 2, null); worker.disconnect(); worker.emit('close', 2, null);
  await assert.rejects(proxy.kill(), /cleanup unconfirmed/);
});
