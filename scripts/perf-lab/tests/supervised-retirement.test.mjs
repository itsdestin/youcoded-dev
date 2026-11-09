import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { observeChildRetirement } from '../supervised-retirement.mjs';

function child(){const p=new EventEmitter();p.connected=true;p.stdout=new EventEmitter();p.stderr=new EventEmitter();return p;}
test('actual Node producer ordering: manual disconnect + exit + both pipe closes proves retirement even without aggregate close',async()=>{
 const p=child(),r=observeChildRetirement(p);let done=false;r.done.then(()=>done=true);
 // Ordering recorded from installed v26.10.0: disconnect, stderr close, exit,
 // stdout close. Aggregate child close never arrived; private count was 3/4.
 p.connected=false;p.emit('disconnect');p.stderr.emit('close');p.emit('exit',0,null);
 await Promise.resolve();assert.equal(done,false);
 p.stdout.emit('close');const result=await r.done;
 assert.equal(result.code,0);assert.equal(result.signal,null);assert.equal(result.ipcDisconnected,true);assert.equal(result.pipesClosed,true);
 assert.equal(result.aggregateCloseObserved,false);assert.equal(r.snapshot().complete,true);
});
test('missing exit, IPC or any configured pipe stays incomplete; ignore stdio still requires exit and disconnect',async()=>{
 for(const missing of ['exit','ipc','stdout','stderr']){const p=child(),r=observeChildRetirement(p);if(missing!=='ipc'){p.connected=false;p.emit('disconnect');}if(missing!=='exit')p.emit('exit',0,null);if(missing!=='stdout')p.stdout.emit('close');if(missing!=='stderr')p.stderr.emit('close');assert.equal(r.snapshot().complete,false);r.dispose();}
 const p=new EventEmitter();p.connected=true;const r=observeChildRetirement(p);p.emit('exit',0,null);assert.equal(r.snapshot().complete,false);p.connected=false;p.emit('disconnect');assert.equal((await r.done).complete,true);
});
test('aggregate close is not sufficient and errors remain failed evidence; handler retirement removes listeners',async()=>{
 const p=child(),r=observeChildRetirement(p);p.emit('close',0,null);assert.equal(r.snapshot().complete,false);
 p.emit('error',Error('pipe/worker failure'));p.connected=false;p.emit('disconnect');p.emit('exit',0,null);p.stdout.emit('close');p.stderr.emit('close');
 assert.equal((await r.done).error,'pipe/worker failure');
 for(const e of ['exit','disconnect','close','error'])assert.equal(p.listenerCount(e),0);
});
