import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeContinuationEpisodes} from './continuation-metrics.mjs';

function fixture(patch = {}) {
  return {id:'episode', sessionId:'parent', taskId:'child', reportId:'report',
    fixture:{reference:'synthetic:approved-followup', requiredWork:true, blocked:false, requiresUser:false, dependsOn:[]},
    observation:{start:0,end:200}, thresholdMs:100,
    coverage:{childCompletion:true,reportDelivery:true,parentState:true,userInputs:true,progress:true},
    evidence:{sessionId:'parent',taskId:'child',reportId:'report',childCompletedAt:10,reportQueuedAt:11,
      reportDeliveredAt:20,deliveryContext:'active',parentRequestStartedAt:25,firstUsefulProgressAt:35,verifiedFollowupAt:50,
      progressReference:'fixture:output-milestone',followupReference:'fixture:verified-output'},
    states:[{start:0,end:25,state:'idle'},{start:25,end:50,state:'model'},{start:50,end:200,state:'idle'}],
    inputs:[{at:0,kind:'initial'}], ...patch};
}
function stalled(patch = {}) {
  const e=fixture();
  Object.assign(e.evidence,{parentRequestStartedAt:null,firstUsefulProgressAt:null,verifiedFollowupAt:null});
  e.states=[{start:0,end:200,state:'idle'}];
  return {...e,...patch};
}
const one = e => analyzeContinuationEpisodes([e]).episodes[0];

test('happy continuation uses verified milestones, not request start', () => {
  const r=one(fixture());
  assert.equal(r.noNudgeContinuation,'success'); assert.equal(r.needsNudge,false);
  assert.equal(r.completionToReportMs,10); assert.equal(r.deliveryToParentStartMs,5);
  assert.equal(r.readyToUsefulProgressMs,25); assert.equal(r.actionableIdleMs,15);
});
test('synthetic negative controls automatically fail without wording or user diagnosis', () => {
  const lost=stalled(); lost.evidence.reportDeliveredAt=null;
  const waiting=stalled(); waiting.evidence.parentRequestStartedAt=25;
  waiting.terminal={at:30,state:'stopped',reference:'fixture:turn-ended'};
  waiting.states=[{start:0,end:25,state:'idle'},{start:25,end:30,state:'model'},{start:30,end:200,state:'idle'}];
  const incomplete=stalled(); incomplete.evidence.parentRequestStartedAt=25; incomplete.evidence.firstUsefulProgressAt=35;
  for(const [e,label] of [[lost,'delivery-stall'],[stalled(),'parent-wakeup-stall'],[waiting,'behavioral-premature-stop'],[incomplete,'incomplete-followthrough']]) {
    const r=one(e); assert.equal(r.noNudgeContinuation,'fail'); assert.equal(r.classification,label);
  }
});
test('a running tool is not idle and a model request is not useful progress', () => {
  const e=stalled(); e.evidence.parentRequestStartedAt=25;
  e.states=[{start:0,end:25,state:'idle'},{start:25,end:200,state:'tool'}];
  const r=one(e); assert.equal(r.noNudgeContinuation,'fail'); assert.equal(r.classification,'unknown');
  assert.equal(r.readyToUsefulProgressMs,null); assert.equal(r.actionableIdleMs,15);
});
test('fixture permission/user blockers and unrequired work are ineligible', () => {
  for(const patch of [{blocked:true},{requiresUser:true},{requiredWork:false}]) {
    const e=stalled(); Object.assign(e.fixture,patch);
    const result=analyzeContinuationEpisodes([e]);
    assert.equal(result.episodes[0].eligible,false); assert.equal(result.episodes[0].noNudgeContinuation,'unknown');
    assert.equal(result.summary.eligible,0); assert.equal(result.summary.successRate,null);
  }
});
test('only declared dependencies defer eligibility, not unrelated specialists', () => {
  const e=stalled(); e.fixture.dependsOn=[{taskId:'other-required',completedAt:null}];
  assert.equal(one(e).eligible,false);
  e.fixture.dependsOn[0].completedAt=150;
  assert.equal(one(e).censored,true);
  assert.equal(one(stalled()).noNudgeContinuation,'fail');
});
test('eventual nudge recovery still fails no-nudge; scripted extra input also fails', () => {
  for(const kind of ['real-nudge','scripted']) {
    const e=fixture({inputs:[{at:0,kind:'initial'},{at:30,kind}]});
    const r=one(e); assert.equal(r.noNudgeContinuation,'fail');
    assert.equal(r.needsNudge,kind==='real-nudge'?true:'unknown');
  }
  const e=fixture(); e.evidence.verifiedFollowupAt=160; e.evidence.firstUsefulProgressAt=150;
  e.inputs.push({at:140,kind:'real-nudge'}); assert.equal(one(e).noNudgeContinuation,'fail');
});
test('automatic notifications are not user input', () => {
  const e=fixture({notifications:[{at:30,kind:'report-ready'}]});
  assert.equal(one(e).noNudgeContinuation,'success');
  e.inputs.push({at:30,kind:'automatic'}); assert.throws(()=>one(e),/input/i);
});
test('wrong session, task, report identities and duplicate episodes are refused', () => {
  for(const key of ['sessionId','taskId','reportId']) {
    const e=fixture(); e.evidence[key]='wrong'; assert.throws(()=>one(e),/correlation/i);
  }
  assert.throws(()=>analyzeContinuationEpisodes([fixture(),fixture()]),/duplicate/i);
});
test('partial coverage stays unknown, even for historical successful helpers', () => {
  for(const key of Object.keys(fixture().coverage).filter(key=>key!=='parentState')) {
    const e=fixture(); e.coverage[key]=false;
    assert.equal(one(e).noNudgeContinuation,'unknown'); assert.equal(one(e).needsNudge,'unknown');
  }
});
test('primary symptom does not require gapless diagnostic parent states',()=>{
 const good=fixture();good.coverage.parentState=false;good.states=[];
 assert.equal(one(good).noNudgeContinuation,'success');assert.equal(one(good).actionableIdleMs,null);
 assert.equal(one(good).deliveryToParentStartMs,5);
 const bad=stalled();bad.coverage.parentState=false;bad.states=[];
 assert.equal(one(bad).noNudgeContinuation,'fail');assert.equal(one(bad).classification,'unknown');
 bad.evidence.reportDeliveredAt=null;assert.equal(one(bad).classification,'delivery-stall');
 const nudged=fixture();nudged.coverage.parentState=false;nudged.states=[];nudged.inputs.push({at:30,kind:'real-nudge'});
 assert.equal(one(nudged).noNudgeContinuation,'fail');assert.equal(one(nudged).needsNudge,true);
});
test('queue notification can follow an already injected report',()=>{
 const e=fixture();e.evidence.reportQueuedAt=60;
 assert.equal(one(e).noNudgeContinuation,'success');
 e.evidence.reportDeliveredAt=9;assert.throws(()=>one(e),/order/i);
});
test('positive blocker conflicts stay eligible unknown even with partial states',()=>{
 const e=fixture();e.coverage.parentState=false;e.states=[{start:25,end:30,state:'blocked'}];
 const result=analyzeContinuationEpisodes([e]);assert.equal(result.episodes[0].noNudgeContinuation,'unknown');
 assert.equal(result.summary.eligible,1);assert.equal(result.summary.unknown,1);
});
test('busy model and resumed busy work are not idle wakeup or premature stop',()=>{
 for(const resumed of [false,true]){
  const e=stalled();e.evidence.parentRequestStartedAt=25;
  e.states=[{start:0,end:25,state:'idle'},{start:25,end:200,state:'model'}];
  if(resumed){e.terminal={at:30,state:'stopped',reference:'fixture:ended'};e.states=[{start:0,end:25,state:'idle'},{start:25,end:30,state:'model'},{start:30,end:40,state:'idle'},{start:40,end:200,state:'model'}];}
  assert.equal(one(e).noNudgeContinuation,'fail');assert.equal(one(e).classification,'unknown');
 }
});
test('short windows censor rather than invent zero latency or failure', () => {
  const e=stalled({observation:{start:0,end:80},states:[{start:0,end:80,state:'idle'}]});
  const r=one(e); assert.equal(r.censored,true); assert.equal(r.noNudgeContinuation,'unknown');
  assert.equal(r.readyToUsefulProgressMs,null);
  const s=analyzeContinuationEpisodes([e]).summary;
  assert.equal(s.censored,1); assert.equal(s.unknown,1); assert.equal(s.assessed,0); assert.equal(s.successRate,null);
});
test('overlap, incomplete claimed state coverage, time reversal and absent verification refuse', () => {
  const overlap=stalled(); overlap.states.push({start:50,end:60,state:'model'});
  assert.throws(()=>one(overlap),/overlap/i);
  const gap=stalled(); gap.states=[{start:1,end:200,state:'idle'}]; assert.throws(()=>one(gap),/coverage/i);
  const reverse=fixture(); reverse.evidence.reportDeliveredAt=9; assert.throws(()=>one(reverse),/order/i);
  const missing=fixture(); delete missing.evidence.followupReference; assert.throws(()=>one(missing),/reference/i);
});
test('terminal label alone or partial idle observations cannot diagnose behavior', () => {
  const e=stalled(); e.terminal={at:30,state:'stopped',reference:'fixture:ended'};
  e.coverage.parentState=false; assert.equal(one(e).classification,'unknown');
});
test('rates have explicit eligible/assessed denominators and unresolved bounds', () => {
  const a=fixture(), b=stalled({id:'bad'}), c=fixture({id:'partial'}); c.coverage.progress=false;
  const s=analyzeContinuationEpisodes([a,b,c]).summary;
  assert.deepEqual({eligible:s.eligible,assessed:s.assessed,unknown:s.unknown,successes:s.successes,failures:s.failures},
    {eligible:3,assessed:2,unknown:1,successes:1,failures:1});
  assert.equal(s.successRate,0.5); assert.deepEqual(s.successRateBounds,{lower:1/3,upper:2/3});
});
test('fixture threshold, not a global timeout, determines failure', () => {
  const e=fixture({thresholdMs:20}); assert.equal(one(e).noNudgeContinuation,'fail');
  e.thresholdMs=40; assert.equal(one(e).noNudgeContinuation,'success');
});
test('held/cancelled injected receipts do not establish a wake-up obligation', () => {
  for(const context of ['held','cancelled']) {
    const e=stalled(); e.evidence.deliveryContext=context;
    assert.equal(one(e).eligible,false); assert.equal(one(e).noNudgeContinuation,'unknown');
  }
  const missing=stalled(); delete missing.evidence.deliveryContext;
  assert.throws(()=>one(missing),/context/i);
});
test('unlabeled prose, late receipts and blocked state cannot manufacture a behavioral diagnosis', () => {
  const e=stalled(); e.evidence.parentRequestStartedAt=25;
  assert.equal(one(e).classification,'unknown');
  e.states=[{start:0,end:25,state:'idle'},{start:25,end:200,state:'awaiting-user'}];
  assert.equal(one(e).noNudgeContinuation,'unknown');
  const late=fixture(); late.evidence.reportDeliveredAt=120; late.evidence.parentRequestStartedAt=130;
  late.evidence.firstUsefulProgressAt=140; late.evidence.verifiedFollowupAt=150;
  assert.equal(one(late).classification,'delivery-stall');
});
test('partial progress coverage does not supply a zero/complete idle duration', () => {
  const e=stalled(); e.coverage.progress=false;
  assert.equal(one(e).actionableIdleMs,null);
});
test('CLI reads a synthetic JSON file and rejects malformed correlation', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'continuation-metrics-'));
  try {
    const filename=path.join(dir,'episodes.json');
    fs.writeFileSync(filename,JSON.stringify([fixture(),stalled({id:'negative'})]));
    const command=['scripts/harness-lab/continuation-metrics.mjs',filename];
    const r=spawnSync(process.execPath,command,{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr); assert.equal(JSON.parse(r.stdout).summary.failures,1);
    const wrong=fixture(); wrong.evidence.reportId='other'; fs.writeFileSync(filename,JSON.stringify([wrong]));
    const bad=spawnSync(process.execPath,command,{encoding:'utf8'});
    assert.equal(bad.status,1); assert.match(bad.stderr,/correlation/i);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI documents the offline observation contract', () => {
  const r=spawnSync(process.execPath,['scripts/harness-lab/continuation-metrics.mjs','--help'],{encoding:'utf8'});
  assert.equal(r.status,0); assert.match(r.stdout,/thresholdMs/); assert.match(r.stdout,/monotonic/);
});
