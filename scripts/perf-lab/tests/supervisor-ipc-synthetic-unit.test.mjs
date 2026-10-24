import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { authorizeSyntheticInvocation, finishSyntheticRetirement } from './supervisor-ipc-synthetic-support.mjs';

test('test-only invocation requires affirmative flag and exact worker/controller shape; no executable override accepted',()=>{
  assert.equal(authorizeSyntheticInvocation({PERF_LAB_SYNTHETIC_IPC:'1'},['node','entry']), 'controller');
  assert.equal(authorizeSyntheticInvocation({PERF_LAB_SYNTHETIC_IPC:'1',PERF_LAB_SYNTHETIC_IPC_WORKER:'1'},['node','entry','--fixed-worker']), 'worker');
  for(const env of [{},{PERF_LAB_SYNTHETIC_IPC:'true'}]) assert.throws(()=>authorizeSyntheticInvocation(env,['node','entry']),/explicit/);
  for(const argv of [['node','entry','/bin/sh'],['node','entry','--binary','/usr/bin/sleep'],['node','entry','--fixed-worker']]) assert.throws(()=>authorizeSyntheticInvocation({PERF_LAB_SYNTHETIC_IPC:'1'},argv),/fixed/);
});

test('synthetic finalizer uses actual session stop, records retirement before bounded final disconnect and unregisters handlers',async()=>{
  let stopped,detached=false,persisted,fire,disconnected=false;
  const channel={connected:true,disconnect:()=>{channel.connected=false;disconnected=true;}};
  const receipt={reason:'controller-disconnect',cleanupConfirmed:true};
  const result=await finishSyntheticRetirement({session:{stop:async reason=>{stopped=reason;return receipt;}},reason:'controller-disconnect',
    detach:()=>{detached=true;},save:r=>{persisted=r;},channel,send:()=>true,
    timers:{setTimer:fn=>{fire=fn;return 1;},clearTimer:()=>{}}});
  assert.equal(stopped,'controller-disconnect');assert.equal(detached,true);assert.deepEqual(persisted,receipt);assert.equal(result,receipt);
  fire();assert.equal(disconnected,true);
});
