import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignDocumentClocks, startDocumentInputTrain, summariseDocumentInput, cleanupDocumentResources } from '../document-input.mjs';

test('clock exchange bounds use monotonic brackets and reject disjoint/uncertain clocks', () => {
  const c = alignDocumentClocks([{beforeMs:10,rendererMs:112,afterMs:14},{beforeMs:100,rendererMs:202,afterMs:104}]);
  assert.equal(c.valid,true); assert.equal(c.offsetLowerMs,97); assert.equal(c.offsetUpperMs,103);
  assert.equal(alignDocumentClocks([{beforeMs:1,rendererMs:1,afterMs:100}]).valid,false);
  assert.equal(alignDocumentClocks([{beforeMs:10,rendererMs:112,afterMs:14},{beforeMs:100,rendererMs:402,afterMs:104}]).valid,false);
  assert.equal(alignDocumentClocks([{beforeMs:NaN,rendererMs:1,afterMs:2}]).valid,false);
});

test('single or reused exchanges cannot establish pre/post clock calibration',()=>{
  const x={beforeMs:0,rendererMs:100,afterMs:0};
  assert.equal(alignDocumentClocks([x]).valid,false);
  assert.equal(alignDocumentClocks([x,x]).valid,false);
});

test('input observation requires temporal bracketing, bounded drift horizon and monotonic receipts',()=>{
  const train={samples:[0,50,100,150].map((actualMs,token)=>({token,plannedMs:actualMs,actualMs,ackMs:actualMs+1})),skippedSlots:0,failed:0,exhausted:false};
  const receipts=[300,260,310,320].map((atMs,token)=>({token,atMs,trusted:true,correctTarget:true,caseId:'case'}));
  const options={actionStartMs:25,actionEndMs:125,caseId:'case'};
  const exchanges=[{beforeMs:-10,rendererMs:90,afterMs:-10},{beforeMs:400,rendererMs:500,afterMs:400}];
  assert.equal(summariseDocumentInput(train,{receipts,overflow:0},alignDocumentClocks(exchanges),options).complete,false);
  const ordered=receipts.map((r,i)=>({...r,atMs:110+i*50}));
  const before=[{beforeMs:-20,rendererMs:80,afterMs:-20},{beforeMs:-10,rendererMs:90,afterMs:-10}];
  assert.equal(summariseDocumentInput(train,{receipts:ordered,overflow:0},alignDocumentClocks(before),options).complete,false);
  const long=[exchanges[0],{beforeMs:13000,rendererMs:13100,afterMs:13000}];
  assert.equal(summariseDocumentInput(train,{receipts:ordered,overflow:0},alignDocumentClocks(long),options).complete,false);
});

test('input train schedules while acknowledgements are blocked, bounds outstanding and never catches up', async () => {
  let t=0, callback, cancelled=0; const sends=[],acks=[];
  const train=startDocumentInputTrain({send:(_method,event)=>{if(event.type==='keyUp')return Promise.resolve();sends.push(t);return new Promise(r=>acks.push(r));}}, {now:()=>t,schedule:fn=>{callback=fn;return 1;},cancel:()=>cancelled++,everyMs:50,maxOutstanding:2,maxDurationMs:500,maxSamples:10});
  assert.deepEqual(sends,[0]); t=50;callback();assert.deepEqual(sends,[0,50]);
  t=100;callback();assert.equal(sends.length,2);
  acks.splice(0).forEach(r=>r());await Promise.resolve();await Promise.resolve();
  t=350;callback(); assert.deepEqual(sends,[0,50,350]);
  assert.ok(train.snapshot().skippedSlots>=4);assert.equal(train.snapshot().maxInflight,2);
  acks.splice(0).forEach(r=>r()); await train.stop();assert.ok(cancelled);assert.equal(train.snapshot().samples.length,3);
});

test('input summary retains latency bounds, rejects missing/truncated receipt and uncertain budget', () => {
  const train={samples:[0,50,100,150].map((t,token)=>({token,plannedMs:t,actualMs:t,ackMs:t+2})),skippedSlots:0,failed:0,exhausted:false};
  const clocks=alignDocumentClocks([{beforeMs:-10,rendererMs:91,afterMs:-8},{beforeMs:600,rendererMs:701,afterMs:602}]);
  const receipts=train.samples.map(s=>({token:s.token,atMs:s.actualMs+110,trusted:true,correctTarget:true,caseId:'case'}));
  const options={actionStartMs:25,actionEndMs:125,caseId:'case'};
  const good=summariseDocumentInput(train,{receipts,overflow:0},clocks,options);
  assert.equal(good.complete,true);assert.equal(good.latencyMs,12);assert.equal(good.samples[0].latencyLowerMs,8);
  assert.equal(summariseDocumentInput(train,{receipts:receipts.slice(1),overflow:0},clocks,options).complete,false);
  assert.equal(summariseDocumentInput({...train,skippedSlots:1},{receipts,overflow:0},clocks,options).complete,false);
  const borderline=receipts.map(r=>({...r,atMs:r.atMs+239}));
  assert.equal(summariseDocumentInput(train,{receipts:borderline,overflow:0},clocks,options).budgetStatus,'inconclusive');
});

test('a missing acknowledgement does not prevent other cleanup attempts', async()=>{
  let release,other=false;
  const done=cleanupDocumentResources([['blocked',()=>new Promise(r=>release=r)],['other',async()=>{other=true;}]]);
  assert.equal(other,true);release();assert.deepEqual(await done,[]);
});

test('input train has a hard duration/sample cap and no post-cancel dispatch',async()=>{
  let t=0,tick;let sent=0;
  const train=startDocumentInputTrain({send:async(_m,e)=>{if(e.type==='rawKeyDown')sent++;}}, {now:()=>t,schedule:fn=>{tick=fn;return 1;},cancel:()=>{},everyMs:50,maxDurationMs:100,maxSamples:2});
  await Promise.resolve();t=50;tick();await Promise.resolve();t=100;tick();
  assert.equal(train.snapshot().exhausted,true);assert.equal(sent,2);train.cancel();t=200;tick();assert.equal(sent,2);await train.stop();
});

test('cleanup attempts every resource and preserves separate errors', async () => {
  const calls=[];const errors=await cleanupDocumentResources([['one',async()=>{calls.push(1);throw Error('primary');}],['two',async()=>calls.push(2)]]);
  assert.deepEqual(calls,[1,2]);assert.deepEqual(errors,['one: primary']);
});
