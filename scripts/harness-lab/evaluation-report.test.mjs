import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEvaluationReport,renderEvaluationReport} from './evaluation-report.mjs';
const record=(id,verified,status='completed')=>({id,outcome:{verified,status},resources:{tokens:100,elapsedMs:2000,costUsd:0.01},
 evidence:{checks:[],followThrough:[],recovery:[],safety:[]},coverage:{followThrough:false,recovery:false,safety:false},configuration:{},
 run:{status,events:[],requests:[]}});

test('report preserves unknown supervision/safety and never invents overall harness score',()=>{
 const r=buildEvaluationReport({schemaVersion:1,records:[record('a',true)],budgets:[{id:'small',tokens:1000}],comparisons:[]});
 assert.equal(r.records.length,1);assert.equal(r.publicClaimReady,false);
 assert.equal(r.overallScore,undefined);assert.match(renderEvaluationReport(r),/unknown/i);
 assert.doesNotMatch(renderEvaluationReport(r),/```json/); // raw evidence belongs in --json, not the glanceable scorecard
});
test('complete request evidence stays measurable when transcript coverage is missing',()=>{
 const item=record('a',true);item.coverage.requests=true;item.coverage.events=false;
 item.run={runtime:'createRuntime/NativeSessionHost',status:'completed',events:[],requests:[{id:'r',role:'main'}]};
 const r=buildEvaluationReport({schemaVersion:1,records:[item]});
 assert.equal(r.records[0].interactions.modelRequests,1);assert.equal(r.records[0].interactions.toolCalls,null);
});

test('ATIF reports use the shared correlated activity pipeline instead of native-only gating',()=>{
 const item=record('pi',true);item.run={schema_version:'ATIF-v1.6',agent:{name:'pi'},steps:[{source:'agent',timestamp:'2026-01-01T00:00:00Z',tool_calls:[{tool_call_id:'t',function_name:'Read',arguments:{}}],observation:{results:[{source_call_id:'t',extra:{is_error:true}}]}}]};
 const r=buildEvaluationReport({schemaVersion:1,records:[item]});
 assert.equal(r.records[0].activity.adapter,'pi');assert.equal(r.records[0].workPatterns.observed.explicitToolErrors,1);
 assert.equal(r.records[0].activity.toolLatency[0].submissionToResultMs,null);
});
test('scorecard forwards protected behavior and uses the identical shared derived outcome',async()=>{
 const {createBehaviorCollector,behaviorHash}=await import('./behavior-evidence.mjs');
 const item=record('owned',false,'failed');item.taskId='task';item.run={agent:{name:'pi'},steps:[]};
 const c=createBehaviorCollector({runId:item.id,taskId:item.taskId,adapter:'pi'});
 c.checkpoint({id:'answer',start:0,end:0});
 c.safety({id:'protected',checkpointId:'answer',kind:'unrelated-preservation',verdict:'failed',source:'verifier',reference:'host protected-state callback'});
 item.controllerEvidence=c.finish(item.run);item.controllerAuthority={sha256:behaviorHash(item.controllerEvidence),reference:'host journal'};
 const r=buildEvaluationReport({schemaVersion:1,records:[item]}).records[0];
 assert.equal(r.activity.behavior.coverage,'partial');assert.equal(r.outcome.safety.failures,1);
 assert.deepEqual(r.outcome,r.activity.outcome);
 const acceptedTask={...item,outcome:{verified:true,status:'completed'}};
 const budgeted=buildEvaluationReport({schemaVersion:1,records:[acceptedTask],budgets:[{id:'small',tokens:1000}]});
 assert.equal(budgeted.records[0].outcome.acceptable,false);
 assert.equal(budgeted.budgetResults[0].attemptsDetail[0].acceptable,false);
 assert.match(renderEvaluationReport({records:[r],budgetResults:[],comparisons:[],graders:{},interpretation:[]}),/false \| 1/);
 item.controllerAuthority.sha256='stale';
 const invalid=buildEvaluationReport({schemaVersion:1,records:[item]}).records[0];
 assert.equal(invalid.activity.behavior.coverage,'unsupported');assert.equal(invalid.outcome.verified,false);
});

test('fast unsuccessful attempts remain in the resource-budget denominator',()=>{
 const r=buildEvaluationReport({schemaVersion:1,records:[record('a',true),record('b',false,'timeout')],budgets:[{id:'small',tokens:1000}],comparisons:[]});
 assert.equal(r.records.length,2);
 assert.ok(JSON.stringify(r.budgetResults).includes('2'));
});
test('duplicate/missing records and invalid comparison references fail loudly',()=>{
 assert.throws(()=>buildEvaluationReport({schemaVersion:1,records:[record('a',true),record('a',false)]}),/duplicate/i);
 assert.throws(()=>buildEvaluationReport({schemaVersion:1,records:[record('a',true)],comparisons:[{left:'a',right:'missing'}]}),/reference/i);
});
