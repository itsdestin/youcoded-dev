import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planExperiment } from './experiment-plan.mjs';
import * as planner from './experiment-plan.mjs';
const models=[{id:'anthropic/haiku',inputUsdPerMillion:0.1,outputUsdPerMillion:0.5},{id:'qwen/flash',inputUsdPerMillion:0.15,outputUsdPerMillion:0.47}];
const tasks=[{id:'task',domain:'coding',requiredCapabilities:['filesystem']}];
const adapters=[{id:'youcoded',models:['*'],capabilities:['filesystem'],transportReady:false},{id:'claude-code',models:['anthropic/*'],capabilities:['filesystem'],transportReady:false}];
const options={models,tasks,adapters,repetitions:3,assumedInputTokens:20000,assumedOutputTokens:1000};

test('comparison tracks isolate harness and model effects with distinct trial identities',()=>{
 const p=planner.planComparisonTracks({...options,tasks:tasks.map(t=>({...t,split:'evaluation-only'})),harnessModel:'anthropic/haiku',modelHarness:'youcoded'});
 assert.ok(p.cells.every(c=>c.split==='evaluation-only'));
 assert.ok(p.tracks.harnessComparison.cells.every(c=>c.model==='anthropic/haiku'));
 assert.ok(p.tracks.modelComparison.cells.every(c=>c.agent==='youcoded'));
 assert.equal(p.canRun,false);assert.equal(new Set(p.cells.map(c=>c.trialKey)).size,p.cells.length);
 assert.equal(p.plannedCells,12); // six harness cells plus six model cells, in separate cohorts.
 assert.ok(p.sharedBaseline.includes('separate'));
});

test('full planned matrix records unsupported combinations, never drops them',()=>{
 const p=planExperiment(options);
 assert.equal(p.cells.length,12);
 assert.equal(p.cells.filter(c=>c.unsupported.includes('model')).length,3);
 assert.equal(p.canRun,false);
 assert.equal(p.priceKind,'illustrative catalog estimate, not spending authorization or hard ceiling');
});
test('comprehensive profile fails closed on missing capabilities and task domains',()=>{
 const p=planExperiment({...options,requiredDomains:['coding','continuation'],tasks:[...tasks,{id:'resume',domain:'continuation',requiredCapabilities:['resume']} ]});
 assert.ok(p.blockers.some(x=>x.includes('resume')));
 assert.equal(p.canRun,false);
});
test('zero cost is allowed, absent cost is unknown, bad repeats rejected',()=>{
 assert.throws(()=>planExperiment({...options,repetitions:0}),/repetitions/);
 const p=planExperiment({...options,models:[{id:'x',inputUsdPerMillion:null,outputUsdPerMillion:0}]});
 assert.equal(p.estimatedTotalUsd,null);
});
test('transport receipts qualify only their exact client/model pair',()=>{
 const p=planExperiment({...options,adapters:[{...adapters[0],transportReadyModels:['qwen/flash']}]});
 assert.ok(p.cells.filter(c=>c.model==='qwen/flash').every(c=>c.transportReady));
 assert.ok(p.cells.filter(c=>c.model==='anthropic/haiku').every(c=>!c.transportReady));
 assert.equal(p.canRun,false);
});

test('long-history task estimates override the generic task-size assumption explicitly',()=>{
 const p=planExperiment({...options,tasks:[{...tasks[0],estimatedInputTokens:100000}],models:[models[0]],adapters:[adapters[0]]});
 assert.equal(p.cells[0].assumedInputTokens,100000);assert.equal(p.cells[0].estimatedUsd,0.0105);
});

test('planner never grants execution even when synthetic capabilities say ready',()=>{
 const p=planExperiment({...options,adapters:[{id:'fake',models:['*'],capabilities:['filesystem'],transportReady:true}]});
 assert.equal(p.canRun,false);
 assert.ok(p.blockers.some(x=>x.includes('build-only')));
});
