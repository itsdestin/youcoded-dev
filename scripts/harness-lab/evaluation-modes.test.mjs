import test from 'node:test';
import assert from 'node:assert/strict';
import {planMode, registry, comparisonTasks} from './evaluation-modes.mjs';
const pin='a'.repeat(64);
const arm=(adapter,id=adapter)=>({id,adapter,version:adapter==='youcoded'?'build:'+pin:registry[adapter].version,fingerprint:pin});
const request=(mode)=>({mode,profile:'smoke',arms:mode==='basic'?[arm('youcoded','baseline'),arm('youcoded','candidate')]:mode==='compare'?[arm('youcoded'),arm('claude-code')]:Object.keys(registry).map(x=>arm(x)),taskIds:mode==='basic'?[comparisonTasks[0].id]:undefined,model:'anthropic/claude-haiku-5.5',provider:'Anthropic',network:'controlled-retrieval',limits:{maxRequests:60,timeoutSec:720,verifierTimeoutSec:90},budgetUsd:1,image:'local@sha256:'+pin});
test('basic selects two builds and one to three tasks independently of repetitions',()=>{
 const r=request('basic');let p=planMode(r);assert.equal(p.cells.length,2);assert.deepEqual(p.arms.map(a=>a.adapter),['youcoded','youcoded']);
 r.profile='confirmation';p=planMode(r);assert.equal(p.cells.length,6);assert.equal(p.marketingReady,false);
});
test('compare fixes exactly the reviewed three-task cohort and real competitor arm',()=>{
 const p=planMode(request('compare'));assert.equal(comparisonTasks.length,3);assert.equal(p.tasks.length,3);assert.equal(p.cells.length,6);assert.deepEqual(p.arms.map(a=>a.adapter),['youcoded','claude-code']);
 assert.throws(()=>planMode({...request('compare'),taskIds:[comparisonTasks[0].id]}));
});
test('thorough retains every registry adapter and separately labeled wider evaluation tasks',()=>{
 const p=planMode(request('thorough'));assert.equal(p.arms.length,5);assert.ok(p.tasks.length>3);assert.ok(p.tasks.some(t=>t.split==='evaluation-only'));assert.equal(p.cells.length,p.tasks.length*5);assert.ok(p.tasks.filter(t=>t.split==='evaluation-only').every(t=>t.secrecy==='public-previously-inspected'));
});
test('scope changes, missing pins and unsafe limits are refused rather than omitted',()=>{
 for(const mode of ['basic','compare','thorough']){
  const r=request(mode);assert.throws(()=>planMode({...r,arms:r.arms.slice(1)}));
  assert.throws(()=>planMode({...r,arms:r.arms.map((a,i)=>i?a:{...a,fingerprint:''})}));
  for(const limits of [{maxRequests:20,timeoutSec:180,verifierTimeoutSec:90},{maxRequests:61.1,timeoutSec:720,verifierTimeoutSec:90},{maxRequests:60,timeoutSec:2000,verifierTimeoutSec:90}])assert.throws(()=>planMode({...r,limits}));
 }
 assert.throws(()=>planMode({...request('basic'),taskIds:['missing']}));
 assert.throws(()=>planMode({...request('compare'),executionAuthorized:true}));
});
test('live web and missing capabilities remain explicit blocking cells',()=>{
 const r=request('thorough');let p=planMode({...r,network:'live-web'});assert.ok(p.blockers.length);assert.equal(p.canRun,false);assert.equal(p.cells.length,p.tasks.length*5);
 p=planMode({...r,arms:r.arms.map(a=>a.adapter==='pi'?{...a,capabilities:[]}:a)});assert.ok(p.blockers.some(x=>x.includes('pi')));
});
test('legacy basic tasks retain explicitly selected 20-request/180-second compatibility',()=>{
 const p=planMode({...request('basic'),taskIds:['finish-the-file'],limits:{maxRequests:20,timeoutSec:180,verifierTimeoutSec:30}});assert.equal(p.cells.length,2);assert.equal(p.limits.timeoutSec,180);
});
export {request};
