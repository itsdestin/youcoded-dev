// Benchmark diagnosis, not tamper certification. Kept separate from controller
// outcome/semantic scoring even when a host journal pins the raw capture hash.
export function analyzeRuntimeObserved(raw){
 const t=raw?.runtimeTelemetry;
 if(!t)return null;
 const need=(v,m)=>{if(!v)throw Error(m);};
 try{
  need(t.schemaVersion===1&&t.provenance==='runtime-observed'&&t.clock?.kind==='monotonic-ms'&&typeof t.clock.id==='string','Unsupported runtime telemetry');
  need(Array.isArray(t.rows)&&t.rows.length<=20000&&Number.isInteger(t.dropped)&&t.dropped>=0,'Runtime receipt bound');
  need(Number.isFinite(t.observation?.start)&&(t.observation.end===null||Number.isFinite(t.observation.end)&&t.observation.end>=t.observation.start),'Runtime observation range');
  let last=t.observation.start;
  for(const r of t.rows){need(typeof r.kind==='string'&&Number.isFinite(r.at)&&r.at>=last&&(t.observation.end===null||r.at<=t.observation.end),'Runtime receipt clock mismatch');last=r.at;}
  const submits=t.rows.filter(r=>r.kind==='tool-submit'),unique=new Set();
  for(const s of submits){need(typeof s.toolCallId==='string'&&!unique.has(s.toolCallId),'Duplicate runtime tool submission');unique.add(s.toolCallId);}
  const executions=submits.map(s=>{
   const start=t.rows.find(r=>r.kind==='execution-start'&&r.toolCallId===s.toolCallId),end=t.rows.find(r=>r.kind==='execution-end'&&r.toolCallId===s.toolCallId),result=t.rows.find(r=>r.kind==='tool-result'&&r.toolCallId===s.toolCallId);
   return {toolCallId:s.toolCallId,toolName:s.toolName,scope:s.scope,commandHash:s.commandHash??null,inputHash:s.inputHash,status:end?.status??'not-observed',isError:result?.isError??null,start:start?.at??null,end:end?.at??null,durationMs:start&&end?end.at-start.at:null,background:s.background===true};
  });
  const shells=new Map();
  for(const r of t.rows.filter(r=>r.kind==='shell-state')){
   const prior=shells.get(r.shellId);shells.set(r.shellId,{shellId:r.shellId,toolCallId:r.toolCallId,status:r.status,exitCode:r.exitCode,stopReason:r.stopReason,start:prior?.start??r.at,end:prior?.end??(r.status!=='running'?r.at:null)});
  }
  const sameCheckPasses=[];
  // Exact command bytes/hash AND scope, not a generic final pass. This only
  // observes a failed invocation followed by the same command passing; it does
  // not establish test coverage, semantic repair or causal attribution.
  for(const failed of executions.filter(e=>e.toolName==='Bash'&&!e.background&&e.status==='failed'&&e.commandHash)){
   const pass=executions.find(e=>e.toolName==='Bash'&&!e.background&&e.scope===failed.scope&&e.commandHash===failed.commandHash&&e.status==='completed'&&e.start>=failed.end);
   if(pass)sameCheckPasses.push({triggerId:failed.toolCallId,subsequentId:pass.toolCallId,commandHash:failed.commandHash,elapsedMs:pass.end-failed.end,causalRepairVerified:false,semanticTestIdentity:'unknown; identical Bash command only',interveningEditIds:executions.filter(e=>['Write','Edit'].includes(e.toolName)&&e.status==='completed'&&e.start>=failed.end&&e.end<=pass.start).map(e=>e.toolCallId)});
  }
  const sdk=t.rows.filter(r=>r.kind==='sdk-start').map(r=>{const end=t.rows.find(e=>e.kind==='sdk-end'&&e.requestId===r.requestId);return {requestId:r.requestId,scope:r.scope,start:r.at,end:end?.at??null,durationMs:end?end.at-r.at:null,inputTokens:end?.inputTokens??null,outputTokens:end?.outputTokens??null,status:end?.status??'open'};});
  const states=t.rows.filter(r=>r.kind==='scheduler-state'),intervals=[];
  for(let i=1;i<states.length;i++)intervals.push({start:states[i-1].at,end:states[i].at,lastObservedIdle:states[i-1].idle,queueLength:states[i-1].queueLength,runningShellIds:states[i-1].runningShellIds,continuous:false});
  return {provenance:'runtime-observed',coverage:t.dropped?'partial-dropped':'observed',clock:t.clock,trust:t.trust,receiptCount:t.rows.length,dropped:t.dropped,executions,sdk,
   decisions:t.rows.filter(r=>r.kind==='decision').map(({requestId,toolName,decision,provenance,scope,at})=>({requestId:requestId??null,toolName,decision,provenance,scope,at,human:false})),
   shells:[...shells.values()].map(s=>{
    const delivery=t.rows.find(r=>r.kind==='notice-injected'&&r.shellIds?.includes(s.shellId));
    const request=delivery?sdk.find(r=>r.scope==='parent'&&r.start>=delivery.at):null;
    const followup=delivery?executions.find(r=>r.scope==='parent'&&r.start>=delivery.at&&r.status==='completed'):null;
    const held=t.rows.some(r=>r.kind==='fixture-stop'&&r.held&&(!s.end||r.at<=s.end));
    return {...s,deliveryAt:delivery?.at??null,completionToDeliveryMs:delivery&&s.end!==null&&delivery.at>=s.end?delivery.at-s.end:null,deliveryToRequestMs:request?request.start-delivery.at:null,firstSubsequentToolId:followup?.toolCallId??null,deliveryToSubsequentToolMs:followup?followup.start-delivery.at:null,usefulFollowupVerified:false,explicitFixtureStopHeld:held};
   }),noticeDeliveries:t.rows.filter(r=>r.kind==='notice-delivery'),
   crossChecks:{rawSdkRequestIdsMatch:Array.isArray(raw.requests)&&sdk.length===raw.requests.length&&sdk.every(r=>raw.requests.some(x=>x.id===r.requestId)),independentGatewayRequests:Array.isArray(raw.gatewayActivities)?raw.gatewayActivities.length:null,comparison:'Gateway physical requests are a separate scope; SDK counts need not be equal.'},
   recovery:{sameCheckPasses:sameCheckPasses.map(r=>{
    const failed=executions.find(e=>e.toolCallId===r.triggerId),pass=executions.find(e=>e.toolCallId===r.subsequentId);
    const attempts=sdk.filter(s=>s.start>=failed.end&&s.start<=pass.end);
    const complete=attempts.every(s=>s.end!==null&&s.end<=pass.end&&s.inputTokens!==null&&s.outputTokens!==null);
    return {...r,extraSdkAttemptsObserved:attempts.length,extraReportedTokens:complete&&attempts.length?attempts.reduce((n,s)=>n+s.inputTokens+s.outputTokens,0):null,resourceScope:'runtime-observed SDK attempts inside failed-exit to same-command completion; not physical requests or causal repair cost'};
   }),triggerCoverage:'observed executions only; missing/aborted tools remain unknown',causalRepairVerified:false},
   scheduler:{continuous:false,transitions:states,observedIntervals:intervals,actionableIdleMs:null},
   authority:'No controller safety/human/validated-semantic verdict derives from this telemetry',limitations:['Foreground Bash status is execution completed/failed, not a parsed stdout exit code. Background exit codes come from the actual native ShellRegistry.','SDK attempts are not physical provider requests; independent gateway evidence remains separate.','Scheduler state is event/sampled observation, not continuous coverage or proof of false waiting.']};
 }catch(e){return {provenance:'runtime-observed',coverage:'unsupported',reason:e.message};}
}
