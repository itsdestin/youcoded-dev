import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeActivity, analyzeActivity} from './activity-normalize.mjs';
import {analyzeTimeline} from './activity-timeline.mjs';
import fs from 'node:fs';
import {importEvaluationEvidence} from './evaluation-import.mjs';
import {createActivityCapture} from '../../youcoded/desktop/test-engine/lab-activity.mjs';
import {observeModel} from '../../youcoded/desktop/test-engine/lab-observer.mjs';
import {spawnSync} from 'node:child_process';

test('runtime observations retain failed command reruns without asserting semantic recovery or controller authority',async()=>{
 const {createRuntimeTelemetry}=await import('../../youcoded/desktop/test-engine/lab-runtime-telemetry.mjs');
 let at=0;const c=createRuntimeTelemetry({now:()=>at++,limit:100});
 function call(id,command,failed){c.transcript({type:'tool-use',sessionId:'parent',data:{toolUseId:id,toolName:'Bash',toolInput:{command}}});c.execution({kind:'execution-start',id,toolCallId:id,scope:'parent'});c.execution({kind:'execution-end',id,toolCallId:id,scope:'parent',status:failed?'failed':'completed'});c.transcript({type:'tool-result',data:{toolUseId:id,isError:failed}});}
 call('bad','exact-check',true);call('other','unrelated-check',false);c.finish();
 const capture={runtime:'createRuntime/NativeSessionHost',events:[],requests:[],runtimeTelemetry:c.record,controllerEvidence:{forged:true}};
 let a=importEvaluationEvidence([{id:'obs',raw:capture,taskId:'task'}]).records[0].analysis;
 assert.equal(a.runtimeObserved.recovery.sameCheckPasses.length,0);assert.equal(a.behavior.coverage,'not-collected');
 call('good','exact-check',false);c.finish();
 a=importEvaluationEvidence([{id:'obs',raw:capture,taskId:'task'}]).records[0].analysis;
 assert.equal(a.runtimeObserved.recovery.sameCheckPasses.length,1);assert.equal(a.runtimeObserved.recovery.causalRepairVerified,false);
 assert.equal(a.outcome.recovery.observations,0);assert.equal(a.outcome.safety.observations,0);
 assert.equal(a.runtimeObserved.scheduler.continuous,false);
 const broken=structuredClone(capture);broken.runtimeTelemetry.rows[0].at=-1;
 const invalid=importEvaluationEvidence([{id:'obs',raw:broken,taskId:'task',outcomeRecord:{id:'obs',outcome:{verified:false,status:'failed'},resources:{},evidence:{checks:[],recovery:[],safety:[],followThrough:[]},coverage:{recovery:false,safety:false,followThrough:false}}}]).records[0].analysis;
 assert.equal(invalid.runtimeObserved.coverage,'unsupported');assert.equal(invalid.outcome.verified,false);
 const dropped=createRuntimeTelemetry({now:()=>at++,limit:1});dropped.emit('sdk-start',{requestId:'r'});dropped.emit('sdk-end',{requestId:'r'});dropped.finish();
 assert.equal(analyzeActivity({...capture,runtimeTelemetry:dropped.record}).runtimeObserved.coverage,'partial-dropped');
});

// Synthetic controls, not recorded model-quality observations.
const event=(type,timestamp,data={})=>({type,timestamp,data});
const raw=()=>({runtime:'createRuntime/NativeSessionHost',status:'completed',scenarioCheckpoints:[{eventCount:11}],scenario:{steps:[{kind:'user'}]},requests:[{id:'r',startedAt:0,endedAt:100}],events:[
 event('user-message',0,{text:'credential-canary'}),event('assistant-text',10,{partId:'a',text:'hello '}),event('assistant-text',11,{partId:'a',text:'world'}),
 event('tool-use',20,{toolUseId:'a',toolName:'Read',toolInput:{file_path:'secret-canary'}}),event('tool-use',20,{toolUseId:'b',toolName:'Read'}),
 event('tool-result',30,{toolUseId:'a',isError:false}),event('tool-result',50,{toolUseId:'b',isError:true}),
 event('assistant-text',60,{partId:'gone',text:'retracted'}),event('assistant-thinking',61,{dropPart:{partIds:['gone']}}),
 event('assistant-text',65,{agentId:'child',text:'excluded'}),event('turn-complete',100)]});

test('actual collected SDK stream flows through normalization into printed monotonic phase cells',async()=>{
 let time=0;const capture=createActivityCapture({now:()=>++time,id:'stream-clock'}),requests=[];
 const parts=[{type:'reasoning-start',id:'r'},{type:'reasoning-delta',id:'r',delta:'private-reasoning'},
 {type:'reasoning-end',id:'r'},{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:'answer'},{type:'text-end',id:'t'},
 {type:'finish',usage:{inputTokens:{total:1},outputTokens:{total:1}}}];
 const model={modelId:'scripted',provider:'offline',doStream:async()=>({stream:new ReadableStream({start(c){for(const part of parts)c.enqueue(part);c.close();}})})};
 await Array.fromAsync((await observeModel(model,{records:requests,maxRequests:1,activity:capture}).doStream({prompt:[]})).stream);
 const run={runtime:'createRuntime/NativeSessionHost',status:'completed',events:[],requests,activity:capture.finish('completed')};
 const a=analyzeActivity(run);assert.equal(a.collectedActivity.coverage,'measured');
 assert.equal(a.timeline.window.clock,'stream-clock');assert.equal(a.timeline.laneUnionMs['reasoning-stream'],2);
 assert.equal(a.timeline.laneUnionMs['answer-stream'],2);assert.equal(a.timeline.unclassifiedInRequestMs,4);
 assert.ok(!JSON.stringify(a).includes('private-reasoning'));
 const result=spawnSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts/harness-lab');from test_targeted_report import fixture;from targeted_report import summarize_targeted,render_markdown;m,a,r=fixture();p=summarize_targeted(m,a,r);p['trials'][0]['activity']={'analysis':json.load(sys.stdin)};print(render_markdown(p))"],{input:JSON.stringify(a),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Observed reasoning delivery/);assert.match(result.stdout,/\| baseline \| 2 \| 2 \|/);
});
test('native raw normalization preserves coalescing, retraction, scope, provenance and queued latency',()=>{
 const n=normalizeActivity(raw());assert.equal(n.events[0].provenance,'scripted');
 const a=analyzeActivity(raw());assert.equal(a.interactions.assistantMessages,1);assert.equal(a.interactions.assistantWords,2);
 assert.equal(a.interactions.submittedToolGroups,1);assert.equal(a.interactions.humanInputs,null);
 assert.deepEqual(a.toolLatency.map(t=>t.submissionToResultMs),[10,30]);assert.equal(a.timeline.overlapMs,30);
 assert.equal(a.timeline.laneUnionMs['request-in-flight'],100);assert.equal(a.timeline.unclassifiedOutsideRequestMs,0);
 assert.equal(a.workPatterns.explicitToolErrors,1);assert.ok(!JSON.stringify(a).includes('canary'));
});
test('partial captures retain observed subtotal but cannot claim complete totals',()=>{
 const r=raw();r.status='interrupted';const a=analyzeActivity(r);
 assert.equal(a.interactions.toolCalls,null);assert.equal(a.interactions.observed.toolCalls,2);assert.equal(a.workPatterns.explicitToolErrors,null);
 assert.equal(a.capture.complete,false);
});
for(const adapter of ['pi','claude-code','opencode','hermes'])test(`${adapter} ATIF correlates results without inventing result timestamps`,()=>{
 const extra=adapter==='pi'?{is_error:true}:adapter==='claude-code'?{tool_result_is_error:true}:{};
 const r={schema_version:'ATIF-v1.6',agent:{name:adapter},steps:[{source:'user',message:'start'},{source:'agent',timestamp:adapter==='hermes'?undefined:'2026-01-01T00:00:00Z',tool_calls:[{tool_call_id:'t',function_name:'Read',arguments:{}}],observation:{results:[{source_call_id:'t',extra}]}}]};
 const a=analyzeActivity(r);assert.equal(a.interactions.toolCalls,null);assert.equal(a.interactions.observed.toolCalls,1);
 assert.equal(a.workPatterns.observed.explicitToolErrors,['pi','claude-code'].includes(adapter)?1:0);
 assert.equal(a.workPatterns.explicitToolErrors,null);assert.equal(a.toolLatency[0].submissionToResultMs,null);
 assert.equal(a.normalized.events.find(e=>e.type==='tool-result').timestamp,null);
});
test('sanitized recorded captures retain real timestamp and error availability for every adapter',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/activity-recorded.json',import.meta.url),'utf8'));
 const result=importEvaluationEvidence(fixture.records);
 assert.equal(result.schemaVersion,1);assert.equal(result.records.length,5);
 for(const r of result.records){assert.equal(r.analysis.adapter,r.id);assert.equal(r.source.sha256.length,64);assert.equal(r.analysis.capture.complete,false);}
 assert.equal(result.records[0].analysis.toolLatency[0].submissionToResultMs,14);
 for(const r of result.records.slice(1))assert.equal(r.analysis.toolLatency[0].submissionToResultMs,null);
 for(const r of result.records.slice(0,3))assert.equal(r.analysis.toolLatency[0].isError,false);
 for(const r of result.records.slice(3))assert.equal(r.analysis.toolLatency[0].isError,null);
});
test('replayed UUIDs deduplicate without deleting real repeated text, conflicting identities remain failures',()=>{
 const r=raw();r.events[1].uuid='same';r.events.push({...r.events[1]});
 assert.equal(normalizeActivity(r).events.length,11);
 r.events.at(-1).timestamp=999;
 assert.equal(importEvaluationEvidence([{id:'bad',raw:r}]).records[0].coverage,'unsupported');
 assert.equal(importEvaluationEvidence([{id:'missing'}]).records[0].analysis,null);
});
test('cumulative ATIF snapshots deduplicate stable steps and keep conflicting replay evidence invalid',()=>{
 const step={step_id:1,source:'agent',tool_calls:[{tool_call_id:'t',function_name:'Read'}]};
 const r={schema_version:'ATIF-v1.7',steps:[step,structuredClone(step)]};
 assert.equal(analyzeActivity(r).workPatterns.observed.calls,1);
 r.steps[1].timestamp='2026-01-01T00:00:00Z';assert.throws(()=>normalizeActivity(r),/Conflicting ATIF/);
});
test('raw correlated continuation receipts use the existing scorer without inventing scheduler state',()=>{
 const r=raw();r.continuation={episode:{id:'receipt',sessionId:'parent',taskId:'child',reportId:'report',thresholdMs:100,
 observation:{start:0,end:200},fixture:{reference:'fixture',requiredWork:true,blocked:false,requiresUser:false,dependsOn:[]},
 coverage:{childCompletion:true,reportDelivery:true,parentState:false,userInputs:true,progress:true},
 evidence:{sessionId:'parent',taskId:'child',reportId:'report',childCompletedAt:10,reportDeliveredAt:20,deliveryContext:'active',parentRequestStartedAt:30},states:[],inputs:[{at:0,kind:'initial'}]}};
 const a=analyzeActivity(r);assert.equal(a.continuation.episodes[0].noNudgeContinuation,'fail');
 assert.equal(a.continuation.episodes[0].actionableIdleMs,null);
});
test('timeline unions overlaps, preserves gaps, censors open spans and rejects clock mixing',()=>{
 assert.equal(analyzeTimeline([],null).censoredIntervals,null);
 assert.equal(analyzeTimeline([],{start:0,end:100,clock:'epoch-ms',scope:'parent'}).coveredUnionMs,null);
 const t=analyzeTimeline([{lane:'request-in-flight',start:0,end:60,clock:'epoch-ms',scope:'parent'},{lane:'tool-submitted-to-result',start:40,end:80,clock:'epoch-ms',scope:'parent'},{lane:'open',start:90,end:null,clock:'epoch-ms',scope:'parent'}],{start:0,end:100,clock:'epoch-ms',scope:'parent'});
 assert.equal(t.coveredUnionMs,80);assert.equal(t.overlapMs,20);assert.equal(t.unclassifiedOutsideRequestMs,null);assert.equal(t.censoredIntervals,1); // Open spans cannot certify uncovered time.
 assert.throws(()=>analyzeTimeline([{lane:'x',start:0,end:1,clock:'monotonic',scope:'parent'}],{start:0,end:100,clock:'epoch-ms',scope:'parent'}),/clock/);
});
