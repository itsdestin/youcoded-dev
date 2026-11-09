import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWorkPatterns} from './work-patterns.mjs';
const e=(type,time,data={})=>({type,timestamp:time,data,sessionId:'root'});
const use=(id,t,name='Edit',input={file_path:'a',old_string:'a',new_string:'b'})=>e('tool-use',t,{toolUseId:id,toolName:name,toolInput:input});
const done=(id,t,isError=false)=>e('tool-result',t,{toolUseId:id,isError});

test('edit chains report measured gaps without treating them as proven waste',()=>{
 const r=analyzeWorkPatterns([e('user-message',0),use('a',10),done('a',11),use('b',1011),done('b',1012),use('c',3012),done('c',3013)],{eventsComplete:true});
 assert.equal(r.editChains.length,1);assert.equal(r.editChains[0].calls,3);assert.equal(r.editChains[0].betweenEditsMs,3000);
 assert.equal(r.editChains[0].submissionToResultMs,3);assert.equal(r.editChains[0].removableWasteMs,null);
});
test('parallel submissions and intervening tools/notices do not become sequential chains',()=>{
 const r=analyzeWorkPatterns([use('a',0),use('b',1),done('a',2),done('b',3),
 e('user-message',4,{injected:'specialist-report'}),use('c',5),done('c',6),use('d',7,'Read'),done('d',8),use('e',9),done('e',10)],{eventsComplete:true});
 assert.equal(r.editChains.length,0);
});
test('duplicate failed signatures are observations, not a model-mistake verdict',()=>{
 const r=analyzeWorkPatterns([use('a',0,'Bash',{command:'npm test'}),done('a',1,true),use('b',3,'Bash',{command:'npm test'}),done('b',4,true)],{eventsComplete:true});
 assert.equal(r.explicitToolErrors,2);assert.equal(r.repeatedFailedCalls,1);assert.equal(r.modelMistakes,null);
});
test('missing or reversed timestamps stay unknown and partial coverage exposes observed only',()=>{
 const events=[use('a',10),done('a',9),use('b',null),done('b',12),use('c',13),done('c',14)];
 const r=analyzeWorkPatterns(events,{eventsComplete:false});
 assert.equal(r.explicitToolErrors,null);assert.equal(r.observed.calls,3);assert.ok(r.observed.invalidTimingPairs>0);
});
test('observes repeated reads, declared categories and result-to-action gaps without inferring execution',()=>{
 const r=analyzeWorkPatterns([use('r1',0,'Read'),done('r1',5),use('r2',10,'Read'),done('r2',15),use('e',20),done('e',25),use('b',30,'Bash',{command:'npm test'})]);
 assert.equal(r.observed.repeatedIdenticalReads,1);
 assert.deepEqual(r.observed.toolSequence.map(x=>x.category),['read','read','edit','opaque']);
 assert.deepEqual(r.observed.resultToNextAction.map(x=>x.gapMs),[5,5,5]);
 assert.equal(r.observed.toolLatencies[0].submissionToResultMs,5);
 assert.equal(r.observed.toolLatencies.at(-1).submissionToResultMs,null);
});
test('request segmentation uses explicit input timestamps and counts specialist attempts',()=>{
 const events=[e('user-message',1000),use('a',1500),done('a',1600),e('user-message',2000,{injected:'report'}),e('user-message',3000)];
 const requests=[{id:'a',startedAt:new Date(1100).toISOString(),role:'main'},
 {id:'b',startedAt:new Date(2100).toISOString(),role:'specialist'},
 {id:'c',startedAt:new Date(3100).toISOString(),role:'main'},{id:'j',startedAt:new Date(3200).toISOString(),role:'judge'}];
 const r=analyzeWorkPatterns(events,{eventsComplete:true,requestsComplete:true,requests});
 assert.deepEqual(r.inputSegments.map(s=>s.modelRequests),[2,1]);
 assert.equal(r.inputSegments[0].underlyingOperations,null); // omitted rather than inferred
 assert.equal(r.realHumanInterventions,null);
});
