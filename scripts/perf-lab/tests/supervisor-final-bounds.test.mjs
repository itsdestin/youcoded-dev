import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedProcPids } from '../owned-processes.mjs';
import { sendFinalAndDisconnect } from '../supervised-protocol.mjs';

function fakeDirectory(names) {
  let reads=0, closes=0;
  return { open:()=>({readSync:()=>{reads++;const name=names(reads);return name===null?null:{name};},closeSync:()=>{closes++;}}), get reads(){return reads;},get closes(){return closes;} };
}
test('actual proc producer streams at most entry cap then closes handle on overflow without whole arrays',()=>{
  const d=fakeDirectory(n=>String(n));
  assert.throws(()=>[...boundedProcPids({open:d.open,maxEntries:10})],/enumeration cap/);
  assert.equal(d.reads,10);assert.equal(d.closes,1);
});
test('proc producer closes on consumer early return, read failure, and natural EOF; non-PID entries count toward cap',()=>{
  const early=fakeDirectory(n=>String(n));for(const pid of boundedProcPids({open:early.open,maxEntries:10})){assert.equal(pid,1);break;}
  assert.equal(early.reads,1);assert.equal(early.closes,1);
  const finite=fakeDirectory(n=>n===1?'self':n===2?'42':null);
  assert.deepEqual([...boundedProcPids({open:finite.open,maxEntries:10})],[42]);assert.equal(finite.closes,1);
  const nonPid=fakeDirectory(()=> 'self');assert.throws(()=>[...boundedProcPids({open:nonPid.open,maxEntries:3})],/cap/);assert.equal(nonPid.reads,3);assert.equal(nonPid.closes,1);
  let closed=false;
  assert.throws(()=>[...boundedProcPids({open:()=>({readSync:()=>{throw Error('denied');},closeSync:()=>{closed=true;}})})],/denied/);assert.equal(closed,true);
});
test('startup fatal final-send stalls cannot retain IPC beyond bounded disconnect timer; no app involved',()=>{
  let callback,timer,disconnected=0,cleared=0;
  const channel={connected:true,disconnect:()=>{channel.connected=false;disconnected++;}};
  const send=(message,done)=>{assert.deepEqual(message,{fatal:'startup failed'});callback=done;return true;};
  sendFinalAndDisconnect(channel,send,{fatal:'startup failed'},{setTimer:(fn,ms)=>{assert.equal(ms,250);timer=fn;return 1;},clearTimer:()=>cleared++});
  assert.equal(disconnected,0);timer();assert.equal(disconnected,1);
  callback();assert.equal(disconnected,1);assert.ok(cleared>=1);
});
test('normal retirement and fatal immediate send failure use identical bounded disconnect path',()=>{
  for(const accepted of [true,false]){
    let disconnected=0,fire;
    const channel={connected:true,disconnect:()=>{channel.connected=false;disconnected++;}};
    sendFinalAndDisconnect(channel,(_m,done)=>{if(accepted)done();return accepted;},{final:{cleanupConfirmed:true}},
      {setTimer:fn=>{fire=fn;return 1;},clearTimer:()=>{}});
    assert.equal(disconnected,1);fire();assert.equal(disconnected,1);
  }
});
