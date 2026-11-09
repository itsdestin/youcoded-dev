// Pure analysis of native LIVE delta events. No model calls and no inferred human intent.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const words = text => text.trim().split(/\s+/u).filter(Boolean).length;
const segment = index => ({ index, toolCalls:0, submittedToolGroups:0, parts:new Map(), partKinds:new Map(), pendingParts:new Set(),
  declaredOperations:0, opaqueOperationCalls:0, clarificationCalls:0, automaticNotices:0, turnCompletions:0 });

function operationCount(name, input = {}) {
  // Only explicit, inspectable payload structure supports an operation count.
  if (['Edit','edit'].includes(name)) return Array.isArray(input.edits) ? input.edits.length : 1;
  if (['Read','Write','read','write'].includes(name)) return 1;
  return null; // A shell script or search can perform arbitrarily many underlying operations.
}

export function normalizeAtif(trajectory) {
  if(!Array.isArray(trajectory?.steps)) throw new Error('ATIF trajectory needs steps');
  const events=[],seenSteps=new Map();
  for(const [index,step] of trajectory.steps.entries()){
    // WHY: cumulative resumed snapshots can replay stable ATIF step identities.
    // Deduplicate exact replays only; conflicts are invalid evidence, not new work.
    if(step.step_id!==undefined){
      const serialized=JSON.stringify(step);
      if(seenSteps.has(step.step_id)){
        if(seenSteps.get(step.step_id)!==serialized)throw new Error('Conflicting ATIF step identity');
        continue;
      }
      seenSteps.set(step.step_id,serialized);
    }
    const emit=(type,data,timestamp=step.timestamp??null)=>events.push({type,data,timestamp,sessionId:'atif-parent',sourceStep:step.step_id??index});
    const text=typeof step.message==='string'?step.message:Array.isArray(step.message)?step.message.filter(p=>p.type==='text').map(p=>p.text??'').join(''):'';
    if(step.source==='user') emit('user-message',{text});
    if(step.source!=='agent') continue;
    if(text) emit('assistant-text',{partId:`atif-${step.step_id??index}`,text});
    const calls=step.tool_calls??[];
    for(const [callIndex,call] of calls.entries()){
      let input=call.arguments;
      if(typeof input==='string'){try{input=JSON.parse(input);}catch{input={};}}
      emit('tool-use',{toolUseId:call.tool_call_id??`atif-${index}-${callIndex}`,toolName:call.function_name,toolInput:input??{}});
    }
    // WHY: step time is not tool-result time. Preserve correlated outcomes but
    // never turn an adjacency marker into synthetic execution evidence.
    for(const result of step.observation?.results??[]){
      const extra=result.extra??{};
      const isError=result.is_error??extra.is_error??extra.tool_result_is_error??extra.tool_result_metadata?.is_error;
      emit('tool-result',{toolUseId:result.source_call_id,
        ...(typeof isError==='boolean'?{isError}:{} )},result.timestamp??null);
    }
    if(calls.length) emit('tool-group-end',{},null);
  }
  return events;
}

export function analyzeInteractions(events, { requestLedger, coverage = {} } = {}) {
  let modelRequests = null;
  if (coverage.requests === true && Array.isArray(requestLedger)) {
    const ids = new Set();
    for (const row of requestLedger) {
      if (!row.id || ids.has(row.id)) throw new Error('Missing or duplicate physical request ID');
      ids.add(row.id);
    }
    modelRequests = requestLedger.filter(r => r.role !== 'judge').length;
  }
  const result = { coverage, modelRequests, humanInputs:null, automaticNotices:null,
    assistantMessages:null, assistantWords:null, progressMessages:null, progressWords:null, turnFinalMessages:null, turnFinalWords:null, unclassifiedMessages:null, unclassifiedWords:null, toolCalls:null, submittedToolGroups:null,
    declaredOperations:null, opaqueOperationCalls:null, operationsTotal:null,
    clarificationCalls:null, explicitNudges:null, explicitCorrections:null, segments:[] };
  if (coverage.events !== true) return result;
  if (!Array.isArray(events)) throw new Error('Complete event coverage requires an event array');
  const segments=[];
  let current=segment(-1), humanInputs=0, nudges=0, corrections=0, groupOpen=false, turn=0;
  const seenTools = new Set();
  function save() { if (current.index >= 0 || current.parts.size || current.toolCalls || current.automaticNotices) segments.push(current); }
  function classifyPending(kind) {
    for (const id of current.pendingParts) current.partKinds.set(id,kind);
    current.pendingParts.clear();
  }
  for (const event of events) {
    const data=event.data ?? {};
    // Child display copies are not parent messages. Physical requests are accounted in their own ledger.
    if (data.agentId || data.parentAgentToolUseId) continue;
    if (event.type === 'user-message') {
      groupOpen=false;
      turn++;
      if (data.injected) current.automaticNotices++;
      else {
        save(); current=segment(humanInputs++);
        if (data.intervention === 'nudge') nudges++;
        if (data.intervention === 'correction') corrections++;
      }
    } else if (event.type === 'assistant-text') {
      const id = `${turn}:${data.partId ?? event.uuid ?? 'unkeyed'}`;
      current.parts.set(id,(current.parts.get(id) ?? '')+(data.text ?? ''));
      current.pendingParts.add(id);
    } else if (event.type === 'assistant-thinking' && data.dropPart) {
      for (const partId of data.dropPart.partIds) {
        const id=`${turn}:${partId}`;
        current.parts.delete(id);current.pendingParts.delete(id);current.partKinds.delete(id);
      }
    } else if (event.type === 'tool-use') {
      classifyPending('progress');
      const id=data.toolUseId;
      if (id && seenTools.has(id)) continue;
      if (id) seenTools.add(id);
      current.toolCalls++;
      if (!groupOpen) current.submittedToolGroups++;
      groupOpen=true;
      const count=operationCount(data.toolName,data.toolInput);
      if (count == null) current.opaqueOperationCalls++;
      else current.declaredOperations+=count;
      if (data.toolName === 'AskUserQuestion') current.clarificationCalls++;
    } else if (event.type === 'tool-result' || event.type === 'tool-group-end') { groupOpen=false;turn++; }
    else if (['turn-complete','session-error','user-interrupt'].includes(event.type)) {
      groupOpen=false;
      if (event.type === 'turn-complete') { current.turnCompletions++;classifyPending('turn-final'); }
      else classifyPending('unclassified');
      turn++;
    }
  }
  save();
  const publicSegments=segments.map(({parts,partKinds,pendingParts,...s})=>{
    const visible=[...parts].filter(([,text])=>text.trim());
    const ofKind=kind=>visible.filter(([id])=>(partKinds.get(id)??'unclassified')===kind);
    return { ...s,assistantMessages:visible.length,
      assistantWords:visible.reduce((n,[,text])=>n+words(text),0),
      progressMessages:ofKind('progress').length,progressWords:ofKind('progress').reduce((n,[,text])=>n+words(text),0),
      turnFinalMessages:ofKind('turn-final').length,turnFinalWords:ofKind('turn-final').reduce((n,[,text])=>n+words(text),0),
      unclassifiedMessages:ofKind('unclassified').length,unclassifiedWords:ofKind('unclassified').reduce((n,[,text])=>n+words(text),0),
      operationsTotal:s.opaqueOperationCalls ? null : s.declaredOperations };
  });
  Object.assign(result,{ humanInputs,segments:publicSegments,
    explicitNudges:coverage.interventions === true ? nudges : null,
    explicitCorrections:coverage.interventions === true ? corrections : null });
  for (const field of ['automaticNotices','assistantMessages','assistantWords','progressMessages','progressWords','turnFinalMessages','turnFinalWords','unclassifiedMessages','unclassifiedWords','toolCalls','submittedToolGroups','declaredOperations','opaqueOperationCalls','clarificationCalls'])
    result[field]=publicSegments.reduce((n,s)=>n+s[field],0);
  result.operationsTotal=result.opaqueOperationCalls ? null : result.declaredOperations;
  result.notes=['Tool groups are transcript-adjacency observations, not physical model requests.',
    'Visible messages count native text parts, not model calls; streaming chunks coalesce by part ID.',
    'Opaque scripts do not have an invented underlying operation count.',
    'Interventions require explicit fixture/human labels; wording alone does not establish a nudge.',
    'Child event coverage is separate; parent metrics never claim whole-agent tool coverage.'];
  return result;
}

export function analyzeNativeRun(run){
  const complete=run.status==='completed';
  const coverage={events:complete&&Array.isArray(run.events),requests:complete&&Array.isArray(run.requests),childEvents:false,interventions:false,source:'native scripted-run live events'};
  const result=analyzeInteractions(run.events??[],{requestLedger:run.requests,coverage});
  result.scriptedInputs=result.humanInputs;
  result.humanInputs=null;
  if(!complete){
    result.observed=analyzeInteractions(run.events??[],{requestLedger:run.requests,coverage:{...coverage,events:Array.isArray(run.events),requests:Array.isArray(run.requests)}});
    result.observed.scriptedInputs=result.observed.humanInputs;result.observed.humanInputs=null;
    result.incompleteReason=run.status??'unknown';
  }
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==3||process.argv.includes('--help')) console.log('Usage: node scripts/harness-lab/interactions.mjs NATIVE_RUN.json\nOffline parent-interaction metrics; child tools and unlabeled interventions remain unknown.');
    else{
      const run=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
      const atif=typeof run.schema_version==='string'&&run.schema_version.startsWith('ATIF-');
      if(!atif&&run.runtime!=='createRuntime/NativeSessionHost') throw new Error('Expected native live-event run or ATIF trajectory; do not interpret coalesced events as deltas');
      const result=atif?analyzeInteractions(normalizeAtif(run),{coverage:{events:true,requests:false,childEvents:false,interventions:false,
        source:'ATIF projection only; native event completeness is not established'}}):analyzeNativeRun(run);
      if(atif){
        result.observedUserRoleMessages=result.humanInputs;
        result.humanInputs=null;result.automaticNotices=null;
        result.notes.push('ATIF user roles may include injected notices; these segments are observed user-role boundaries, not verified human interventions.');
      }
      console.log(JSON.stringify(result,null,2));
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
