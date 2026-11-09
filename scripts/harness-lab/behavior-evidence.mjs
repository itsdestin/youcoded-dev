// Controller-only hooks. Never instantiate inside an agent sandbox or accept agent files
// as authority. A hash is integrity, NOT authentication: the separate authority must be
// pinned by the trusted execution journal, outside the agent's writable tree.
import {createHash,randomUUID} from 'node:crypto';
import {normalizeAtif} from './interactions.mjs';
import {checkWaitingClaim,checkVerificationClaim,checkPrematureStop} from './behavior-oracles.mjs';
import {analyzeContinuationEpisodes} from './continuation-metrics.mjs';
import {scoreOutcome} from './outcome-scores.mjs';
export const behaviorHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=v=>typeof v==='string'&&v.trim().length>0;
const check=(v,m)=>{if(!v)throw new Error(m);};
const clone=v=>JSON.parse(JSON.stringify(v));
const KINDS=['input','waiting','verification','stop','execution','repair','recovery','safety','continuation','request'];
export function createBehaviorCollector(identity,{clock=()=>performance.now(),recoveryTriggersComplete=false,resourceRequestsComplete=false}={}){
 check(['runId','taskId','adapter'].every(k=>text(identity[k])),'Controller identity required');
 const rows=[],ids=new Set(),checkpoints=[],clockId='controller:'+randomUUID();let closed=false;
 function record(type,row){
  check(!closed,'Collector already sealed');check(text(row?.id)&&text(row.checkpointId)&&!ids.has(row.id),'Unique receipt/checkpoint required');
  ids.add(row.id);rows.push(clone({...row,type,at:clock(),reference:row.reference??`controller:${identity.runId}:${row.id}`}));
 }
 return {
  checkpoint:({id,start,end})=>{check(!closed&&!checkpoints.some(c=>c.id===id),'Duplicate/sealed checkpoint');checkpoints.push({id,start,end,receiptCount:rows.length,observedAt:clock()});},
  input:r=>record('input',r),waiting:r=>record('waiting',r),verification:r=>record('verification',r),stop:r=>record('stop',r),
  safety:r=>record('safety',r),continuation:r=>record('continuation',r),request:r=>record('request',r),
  // Executor/repair callbacks belong to the controller; only actual returned exits
  // become test evidence. Strings in a transcript never enter this hook.
  async execute({id,checkpointId,testId},executor){const result=await executor();check(Number.isInteger(result.exitCode),'Executor exit required');record('execution',{id,checkpointId,testId,executed:true,exitCode:result.exitCode});return result;},
  async repair({id,checkpointId},action){await action();record('repair',{id,checkpointId});},
  recovery:r=>record('recovery',r),
  finish(raw){check(!closed,'Collector already sealed');closed=true;return {schemaVersion:1,kind:'controller-behavior-evidence',...identity,clock:{id:clockId,kind:'monotonic-ms'},rawSha256:behaviorHash(raw),capture:{recoveryTriggersComplete,resourceRequestsComplete},checkpoints,rows};},
 };
}
const missing=['No controller semantic labels and complete same-checkpoint running task/report/shell snapshot for false waiting.',
 'No controller-captured named test exits plus validated semantic verification label.',
 'No controller task-state checkpoint for premature stop.',
 'No correlated actual trigger/repair/subsequent test for recovery.',
 'No cited controller safety assessment.','No provenance-labeled clarification/approval/correction/nudge receipts.',
 'No continuous scheduler/dependency-state host hook; heartbeat is not state coverage.',
 'No journal-authorized correlated completion/delivery/useful-progress episode.',
 'No trigger-bound model-request/token counter hooks; recovery extra requests/tokens remain unknown.'];
// WHY: a cited phrase must survive the SAME parent-only retraction/boundary rules
// as message burden. Child display copies and abandoned text cannot certify claims.
function checkpointText(capture,native){
 const events=native?capture:normalizeAtif({steps:capture}),parts=new Map();let turn=0;
 for(const e of events){
  const d=e.data??{};if(d.agentId||d.parentAgentToolUseId)continue;
  if(e.type==='assistant-text'){const key=turn+':'+(d.partId??e.uuid??'unkeyed');parts.set(key,(parts.get(key)??'')+(d.text??''));}
  if(e.type==='assistant-thinking'&&d.dropPart)for(const id of d.dropPart.partIds)parts.delete(turn+':'+id);
  if(['tool-result','tool-group-end','turn-complete','session-error','user-interrupt','user-message'].includes(e.type))turn++;
 }
 return [...parts.values()].join('');
}
export function deriveBehavior(envelope,authority,{runId,taskId,adapter,raw,outcomeRecord}){
 const base=outcomeRecord??{id:runId,outcome:{verified:null,status:'missing'},resources:{},evidence:{checks:[],followThrough:[],recovery:[],safety:[]},coverage:{followThrough:false,recovery:false,safety:false}};
 const result={coverage:'not-collected',reason:'No controller-owned behavioral envelope selected',missingCapabilities:missing,supervision:null,assessments:[],evidence:null,outcomeRecord:base,continuationEpisodes:undefined};
 if(!envelope)return result;
 try{
  check(authority&&text(authority.reference)&&authority.sha256===behaviorHash(envelope),'Missing or mismatched controller journal authority');
  check(envelope.schemaVersion===1&&envelope.kind==='controller-behavior-evidence','Unsupported controller schema');
  check(envelope.runId===runId&&text(taskId)&&envelope.taskId===taskId&&envelope.adapter===adapter,'Controller run/task/adapter mismatch');
  check(envelope.rawSha256===behaviorHash(raw),'Stale capture hash');
  check(envelope.clock?.kind==='monotonic-ms'&&text(envelope.clock.id)&&Array.isArray(envelope.rows)&&envelope.rows.length<=10000,'Clock/bounded rows required');
  check(typeof envelope.capture?.recoveryTriggersComplete==='boolean'&&typeof envelope.capture?.resourceRequestsComplete==='boolean','Explicit capture declarations required');
  const ids=new Set(),rows=envelope.rows,checkpoints=new Map(),capture=raw.events??raw.steps;
  const order=new Map(rows.map((row,index)=>[row,index]));
  const precedes=(a,b)=>order.get(a)<order.get(b);
  check(Array.isArray(envelope.checkpoints)&&envelope.checkpoints.length<=1000&&Array.isArray(capture),'Bounded checkpoint capture required');
  for(const cp of envelope.checkpoints){
   check(text(cp.id)&&!checkpoints.has(cp.id)&&Number.isInteger(cp.start)&&Number.isInteger(cp.end)&&cp.start>=0&&cp.end>=cp.start&&cp.end<=capture.length,'Invalid/duplicate checkpoint range');
   const answer=checkpointText(capture.slice(cp.start,cp.end),raw.runtime==='createRuntime/NativeSessionHost');
   checkpoints.set(cp.id,answer);
  }
  for(const r of rows){check(KINDS.includes(r.type)&&text(r.id)&&!ids.has(r.id)&&text(r.checkpointId)&&checkpoints.has(r.checkpointId)&&text(r.reference)&&Number.isFinite(r.at)&&r.at>=0,'Malformed/duplicate controller receipt');ids.add(r.id);if(r.claim)check(checkpoints.has(r.checkpointId)&&text(r.claim.text)&&checkpoints.get(r.checkpointId).includes(r.claim.text),'Semantic label does not cite captured answer at checkpoint');}
  check(rows.every((r,i)=>i===0||r.at>=rows[i-1].at),'Controller clock order mismatch');
  const evidence=clone(base.evidence),assessments=[],episodes=[],supervisionWaits=[];
  const supervision=Object.fromEntries(['human','scripted'].map(p=>[p,Object.fromEntries(['clarification-call','clarification-answer','approval','nudge','correction'].map(k=>[k,0]))]));
  const requestReceipts=rows.filter(r=>r.type==='request'),requestKeys=new Set();
  for(const r of requestReceipts){
   check(text(r.requestId)&&['started','finished'].includes(r.phase)&&r.boundary==='sdk-attempt'&&['parent','child'].includes(r.scope),'Invalid SDK request receipt');
   const key=r.requestId+':'+r.phase;check(!requestKeys.has(key),'Duplicate SDK request receipt');requestKeys.add(key);
   check(r.tokens===null||Number.isFinite(r.tokens)&&r.tokens>=0,'Invalid request token total');
   if(r.phase==='finished')check(requestReceipts.some(x=>x.requestId===r.requestId&&x.phase==='started'&&x.scope===r.scope&&x.at<=r.at&&precedes(x,r)),'Unmatched request finish');
  }
  const usedTriggers=new Set(),semanticLabels=new Set();
  for(const r of rows.filter(r=>r.claim)){
   const key=JSON.stringify([r.checkpointId,r.type,r.claim.classificationSource,r.claim.quote]);
   check(!semanticLabels.has(key),'Duplicate semantic assessment at checkpoint');semanticLabels.add(key);
  }
  const runs=rows.filter(r=>r.type==='execution');
  for(const r of runs)check(text(r.testId)&&r.executed===true&&Number.isInteger(r.exitCode),'Malformed execution receipt');
  const add=(kind,r,v)=>{assessments.push({id:r.id,checkpointId:r.checkpointId,kind:kind==='false-waiting'?'work-pending':kind,...v});evidence.followThrough.push({kind,verdict:v.provisionalVerdict!=null?v.provisionalVerdict:v.verdict,source:v.source??'fixture',reference:r.reference});};
  for(const r of rows){
   if(r.type==='input'){
    check(['human','scripted'].includes(r.provenance)&&Object.hasOwn(supervision[r.provenance],r.kind),'Invalid input provenance/kind');
    if(r.kind.startsWith('clarification-')){
     check(text(r.requestId),'Clarification needs controller request correlation');
     const calls=rows.filter(x=>x.type==='input'&&x.kind==='clarification-call'&&x.requestId===r.requestId);
     check(calls.length===1,'Missing/duplicate clarification call');
     if(r.kind==='clarification-answer')check(calls[0].at<=r.at&&precedes(calls[0],r)&&rows.filter(x=>x.type==='input'&&x.kind==='clarification-answer'&&x.requestId===r.requestId).length===1,'Stale/duplicate clarification answer');
    }
    if(r.wait){check(text(r.wait.clock)&&text(r.wait.reference)&&Number.isFinite(r.wait.start)&&Number.isFinite(r.wait.end)&&r.wait.end>=r.wait.start,'Invalid supervision wait span');}
    if(['clarification-answer','approval'].includes(r.kind))supervisionWaits.push({kind:r.kind,provenance:r.provenance,requestId:r.requestId??null,durationMs:r.wait?r.wait.end-r.wait.start:null,clock:r.wait?.clock??null,reference:r.wait?.reference??r.reference});
    supervision[r.provenance][r.kind]++;
   }
   if(r.type==='waiting'){
    check(!r.claim||r.claim.checkpointId===r.checkpointId,'Stale claim checkpoint');check(!r.state||r.state.checkpointId===r.checkpointId,'Stale work-state checkpoint');
    add('false-waiting',r,r.claim?checkWaitingClaim(r.claim,r.state):{verdict:null,source:'fixture',reason:'Missing validated semantic waiting label'});
   }
   if(r.type==='verification'){
    check(!r.claim||r.claim.checkpointId===r.checkpointId,'Stale claim checkpoint');
    // Repeated tests retain distinct execution receipts; a claim sees only the
    // latest completed invocation of each named test BEFORE its checkpoint.
    const latest=new Map();
    // WHY: assessments may arrive later; only executions observed by the answer checkpoint can support its claim.
    const cp=envelope.checkpoints.find(c=>c.id===r.checkpointId);
    const fenced=Number.isInteger(cp.receiptCount)&&cp.receiptCount>=0&&cp.receiptCount<=rows.length&&Number.isFinite(cp.observedAt);
    if(fenced)for(const x of runs.filter(x=>order.get(x)<cp.receiptCount&&x.at<=cp.observedAt&&precedes(x,r)))latest.set(x.testId,{...x,id:x.testId});
    const before=[...latest.values()];
    const v=r.claim?checkVerificationClaim(r.claim,before,{complete:r.complete===true&&fenced}):{verdict:null,source:'fixture',reason:'Missing validated semantic verification label'};
    assessments.push({id:r.id,checkpointId:r.checkpointId,kind:'tests-passed',...v});const assessed=v.provisionalVerdict??v.verdict;evidence.safety.push({kind:'claimed-verification',verdict:assessed===null?'unknown':assessed?'failed':'passed',source:v.source,reference:r.reference,provisionalVerdict:v.provisionalVerdict??null});
    // Preserve the provisional assessment separately; it never certifies safety.
   }
   if(r.type==='stop'){
    check(['fixture','human','model-judge'].includes(r.source),'Stop semantic source required');
    const v=checkPrematureStop({...r.observation,reference:r.reference});
    add('premature-stop',r,{...v,source:r.source,...(r.source==='model-judge'?{verdict:null,provisionalVerdict:v.verdict}:{})});
   }
   if(r.type==='recovery'){
    const trigger=runs.find(x=>x.id===r.triggerId),repair=rows.find(x=>x.type==='repair'&&x.id===r.repairId),test=runs.find(x=>x.id===r.testId);
    check(trigger&&trigger.exitCode!==0&&!usedTriggers.has(r.triggerId),'Recovery needs distinct actual failed execution');usedTriggers.add(r.triggerId);
    check(!test||test.testId===trigger.testId,'Recovery correctness test does not match failed test');
    check(!repair||precedes(trigger,repair),'Repair precedes trigger');check(!test||repair&&precedes(repair,test)&&precedes(test,r),'Test precedes repair/assessment');
    const starts=test?requestReceipts.filter(x=>x.phase==='started'&&precedes(trigger,x)&&precedes(x,test)):[];
    const finished=starts.map(x=>requestReceipts.find(f=>f.requestId===x.requestId&&f.phase==='finished'&&precedes(f,test)));
    const crossing=requestReceipts.some(x=>x.phase==='started'&&precedes(x,trigger)&&!requestReceipts.some(f=>f.requestId===x.requestId&&f.phase==='finished'&&precedes(f,trigger)));
    const resourceCoverage=envelope.capture?.resourceRequestsComplete===true&&!!test&&!crossing;
    const tokensComplete=resourceCoverage&&finished.every(x=>x&&x.tokens!==null);
    evidence.recovery.push({id:r.id,trigger:'tool-error',status:test?(test.exitCode===0?'recovered':'unrecovered'):'unknown',reference:r.reference,
     extraRequests:resourceCoverage?starts.length:null,extraMs:test?test.at-trigger.at:null,extraTokens:tokensComplete?finished.reduce((sum,x)=>sum+x.tokens,0):null,
     resourceBoundary:'controller-observed SDK attempts, parent and child; not physical provider requests',subsequentCorrectness:test?test.exitCode===0:null,attribution:'fixture-triggered; no production root-cause claim'});
   }
   if(r.type==='safety'){
    check(['fixture','human','verifier','model-judge'].includes(r.source),'Safety source required');
    evidence.safety.push({kind:r.kind,verdict:r.verdict,source:r.source,reference:r.reference});
   }
   if(r.type==='continuation'){
    analyzeContinuationEpisodes([r.episode]);
    check(raw.runtime==='createRuntime/NativeSessionHost'?capture.some(e=>e.sessionId===r.episode.sessionId&&!e.data?.agentId&&!e.data?.parentAgentToolUseId):r.episode.sessionId===(raw.session_id??runId),'Continuation parent does not match selected capture');
    episodes.push(r.episode);
   }
  }
  const outcome={...base,evidence,coverage:{followThrough:evidence.followThrough.length>0,recovery:evidence.recovery.length>0,safety:evidence.safety.length>0}};
  scoreOutcome(outcome); // Validate optional rows before they can affect otherwise usable activity.
  return {...result,coverage:'partial',reason:'Controller-scoped observations only; no cohort-wide or continuous state coverage',authority:{reference:authority.reference,sha256:authority.sha256},clock:envelope.clock,recoveryTriggersComplete:envelope.capture?.recoveryTriggersComplete===true,supervision,supervisionWaits,executions:runs.map(({id,testId,exitCode,checkpointId,reference,at})=>({id,testId,exitCode,checkpointId,reference,at})),assessments,evidence,outcomeRecord:outcome,continuationEpisodes:episodes.length?episodes:undefined,
   producer:envelope.producer??null,
   missingCapabilities:[...missing.filter((_,i)=>i===6||i===7&&!episodes.length||i===8&&evidence.recovery.some(r=>r.extraRequests===null||r.extraTokens===null)||i===0&&!rows.some(r=>r.type==='waiting'&&r.claim&&r.state?.complete)||i===1&&!rows.some(r=>r.type==='verification'&&r.claim)||i===2&&!rows.some(r=>r.type==='stop')||i===3&&!evidence.recovery.length&&envelope.capture?.recoveryTriggersComplete!==true||i===4&&!evidence.safety.length||i===5&&!rows.some(r=>r.type==='input')),...(Array.isArray(envelope.producer?.limits)?envelope.producer.limits.filter(x=>typeof x==='string'):[])]};
 }catch(error){return {...result,coverage:'unsupported',reason:error.message};}
}
