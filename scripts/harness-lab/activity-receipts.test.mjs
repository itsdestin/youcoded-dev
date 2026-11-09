import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createActivityCapture} from '../../youcoded/desktop/test-engine/lab-activity.mjs';
import {analyzeActivityReceipts} from './activity-receipts.mjs';

test('collector clock accounts overlap and full observation prefix/suffix without inferring idle',()=>{
 let now=0;const c=createActivityCapture({now:()=>now,id:'one'});
 const emit=(at,kind,data={})=>{now=at;c.emit(kind,{requestId:'r',...data});};
 emit(10,'request-start');emit(20,'phase-start',{id:'p',phase:'answer-stream'});emit(25,'phase-delta',{id:'p',phase:'answer-stream'});
 emit(30,'tool-submit',{toolCallId:'t'});emit(40,'execution-start',{id:'t',toolCallId:'t'});
 emit(50,'phase-end',{id:'p',phase:'answer-stream'});emit(60,'execution-end',{id:'t',toolCallId:'t'});
 emit(70,'tool-result',{toolCallId:'t'});emit(80,'request-end',{status:'completed'});
 now=100;const a=analyzeActivityReceipts(c.finish('completed')),t=a.timelines.parent;
 assert.equal(t.window.start,0);assert.equal(t.window.end,100);
 assert.equal(t.laneUnionMs['answer-stream'],30);assert.equal(t.laneUnionMs['tool-executing'],20);
 assert.equal(t.unclassifiedInRequestMs,40);assert.equal(t.unclassifiedOutsideRequestMs,30);
 assert.equal(t.coveredUnionMs,70);assert.equal(t.overlapMs,50);
 assert.equal(a.executions[0].submissionToExecutionMs,10);assert.equal(a.executions[0].executionMs,20);
});
test('open phases, dropped receipts and interrupted windows never prove outside-request gap completeness',()=>{
 for(const mode of ['open','dropped','interrupted']){
  let now=0;const c=createActivityCapture({now:()=>++now,id:'clock',limit:mode==='dropped'?1:100});
  c.emit('request-start',{requestId:'r'});c.emit('phase-start',{requestId:'r',id:'p',phase:'reasoning-stream'});
  if(mode!=='open')c.emit('request-end',{requestId:'r',status:'interrupted'});
  const a=analyzeActivityReceipts(c.finish(mode==='interrupted'?'interrupted':'completed'));
  assert.equal(a.coverage,'partial');assert.equal(a.timelines.parent.unclassifiedOutsideRequestMs,null);
 }
});
test('declared empty phases do not become observed reasoning time',()=>{
 let now=0;const c=createActivityCapture({now:()=>++now,id:'empty'});
 c.emit('request-start',{requestId:'r'});c.emit('phase-start',{requestId:'r',id:'p',phase:'reasoning-stream'});
 c.emit('phase-end',{requestId:'r',id:'p',phase:'reasoning-stream'});c.emit('request-end',{requestId:'r',status:'completed'});
 c.record.clock.private='credential-canary';c.record.observation.private='prompt-canary';
 const a=analyzeActivityReceipts(c.finish('completed'));
 assert.equal(JSON.stringify(a).includes('canary'),false);
 assert.equal(a.timelines.parent.laneUnionMs['reasoning-stream'],null);
 assert.equal(a.timelines.parent.unclassifiedInRequestMs,3);
});

test('child scope and clock mismatch cannot silently become parent activity',()=>{
 let now=0;const c=createActivityCapture({now:()=>++now,id:'child-clock'});
 c.emit('execution-start',{id:'t',toolCallId:'t',scope:'child'});c.emit('execution-end',{id:'t',toolCallId:'t',scope:'child'});
 const a=analyzeActivityReceipts(c.finish('completed'));assert.equal(a.timelines.parent.laneUnionMs['tool-executing'],null);
 assert.equal(a.timelines.child.laneUnionMs['tool-executing'],1);
 c.record.receipts[0].at=-1;assert.throws(()=>analyzeActivityReceipts(c.record),/ordering/);
});
