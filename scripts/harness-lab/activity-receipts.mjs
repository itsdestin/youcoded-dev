import {analyzeTimeline} from './activity-timeline.mjs';
const KINDS=new Set(['request-start','request-end','first-byte','phase-start','phase-delta','phase-end','tool-submit','tool-result','execution-start','execution-end','ask-start','ask-end','root-input','stop','turn-end']);
const PHASES=new Set(['reasoning-stream','answer-stream','tool-argument-stream']);
const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
/** No implicit clock alignment. Native and gateway process captures remain separate lanes/tables. */
export function analyzeActivityReceipts(capture){
 if(capture?.schemaVersion!==1||capture.clock?.kind!=='monotonic-ms'||typeof capture.clock.id!=='string'||!Array.isArray(capture.receipts)||!number(capture.observation?.start))throw new Error('Invalid monotonic activity capture');
 const o=capture.observation,receipts=capture.receipts;
 if(!['open','completed','failed','interrupted','incomplete'].includes(o.status)||!Number.isInteger(capture.dropped??0)||(capture.dropped??0)<0)throw new Error('Invalid activity coverage');
 if(o.end!==null&&(!number(o.end)||o.end<o.start))throw new Error('Invalid activity observation end');
 let previous=o.start;
 for(const r of receipts){
  if(!KINDS.has(r.kind)||!number(r.at)||r.at<previous||r.at<o.start||o.end!==null&&r.at>o.end||!['parent','child'].includes(r.scope))throw new Error('Invalid activity receipt ordering/scope');
  if(r.kind.startsWith('phase-')&&!PHASES.has(r.phase))throw new Error('Invalid activity phase');
  if(['id','requestId','toolCallId','sessionId'].some(k=>r[k]!==undefined&&typeof r[k]!=='string'))throw new Error('Invalid activity correlation field');
  if(r.status!==undefined&&!['completed','failed','interrupted','denied','allowed','cancelled','incomplete'].includes(r.status))throw new Error('Invalid activity status');
  previous=r.at;
 }
 const clock=capture.clock.id,intervals=[],open=new Map(),points=[],executions=[],submissions=new Map();let unmatched=0;
 const receiptKey=(r,lane,id)=>JSON.stringify([r.scope,r.sessionId??null,r.requestId??null,lane,id]);
 const add=(r,lane,start,end,status)=>intervals.push({lane,start,end,clock,scope:r.scope,id:r.id??null,requestId:r.requestId??null,toolCallId:r.toolCallId??null,status:status??null});
 for(const r of receipts){
  if(r.kind==='tool-submit')submissions.set(JSON.stringify([r.scope,r.sessionId??null,r.toolCallId]),r.at);
  if(['first-byte','root-input','stop','turn-end'].includes(r.kind))points.push({kind:r.kind,at:r.at,scope:r.scope,requestId:r.requestId??null});
  let lane,id,edge;
  if(r.kind==='tool-submit'||r.kind==='tool-result'){lane='tool-submitted-to-result';id=r.toolCallId;edge=r.kind==='tool-submit'?'start':'end';}
  if(r.kind.startsWith('request-')){lane='request-in-flight';id=r.requestId;edge=r.kind.slice(8);}
  if(r.kind.startsWith('phase-')){lane=r.phase;id=r.id;edge=r.kind.slice(6);}
  if(r.kind.startsWith('execution-')){lane='tool-executing';id=r.toolCallId??r.id;edge=r.kind.slice(10);}
  if(r.kind.startsWith('ask-')){lane='approval-wait';id=r.id;edge=r.kind.slice(4);}
  if(!lane)continue;
  if(typeof id!=='string'||!id)throw new Error('Activity correlation identity missing');
  const key=receiptKey(r,lane,id);
  if(edge==='start'){
   if(open.has(key)){unmatched++;continue;}
   open.set(key,{...r,lane,deltas:0});
  }else if(edge==='delta'){
   const span=open.get(key);if(span)span.deltas++;else unmatched++;
  }else if(edge==='end'){
   const span=open.get(key);if(!span){unmatched++;continue;}open.delete(key);
   // A declared phase with no payload is not observed reasoning/writing.
   if(!PHASES.has(lane)||span.deltas>0)add(r,lane,span.at,r.at,r.status);
   if(lane==='tool-executing')executions.push({toolCallId:id,scope:r.scope,sessionId:r.sessionId??null,executionMs:r.at-span.at,status:r.status??null,
     submissionToExecutionMs:submissions.has(JSON.stringify([r.scope,r.sessionId??null,id]))?span.at-submissions.get(JSON.stringify([r.scope,r.sessionId??null,id])):null});
  }
 }
 for(const span of open.values())add(span,span.lane,span.at,null,'incomplete');
 const end=o.end??previous;
 const censored=o.end===null||o.status!=='completed'||(capture.dropped??0)>0||unmatched>0||open.size>0;
 const timelines=Object.fromEntries(['parent','child'].map(scope=>[scope,analyzeTimeline(intervals,{start:o.start,end,clock,scope,censored,collected:true})]));
 const requestGaps=[];
 for(const scope of ['parent','child']){
  const requests=intervals.filter(i=>i.lane==='request-in-flight'&&i.scope===scope).sort((a,b)=>a.start-b.start);
  for(let i=1;i<requests.length;i++){
   const prior=requests.slice(0,i);const complete=prior.every(x=>x.end!==null);
   const last=complete?Math.max(...prior.map(x=>x.end)):null;
   requestGaps.push({scope,requestId:requests[i].requestId,gapMs:last===null?null:Math.max(0,requests[i].start-last),overlapMs:last===null?null:Math.max(0,last-requests[i].start)});
  }
 }
 const requestSpans=intervals.filter(i=>i.lane==='request-in-flight').map(i=>{
  const first=points.find(p=>p.kind==='first-byte'&&p.requestId===i.requestId&&p.scope===i.scope);
  return {requestId:i.requestId,scope:i.scope,durationMs:i.end===null?null:i.end-i.start,
    firstObservedByteMs:first?first.at-i.start:null,status:i.status};
 });
 return {schemaVersion:1,clock:{id:clock,kind:'monotonic-ms'},observation:{start:o.start,end:o.end,status:o.status},requestSpans,coverage:censored?'partial':'measured',dropped:capture.dropped??0,
   unmatchedReceipts:unmatched,openIntervals:open.size,intervals,points,executions,requestGaps,timelines,
   interpretation:'Monotonic process-local observation window. Reasoning/answer/tool-argument spans are observed stream delivery envelopes, not cognitive time. Execution is the actual tool.execute await, not submission/queue latency. Separate clocks are not pooled or implicitly aligned.'};
}
