import {createHash} from 'node:crypto';
const stamp=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const signature=(name,input)=>createHash('sha256').update(JSON.stringify([name,canonical(input??null)])).digest('hex');
const duration=(start,end)=>start!==null&&end!==null&&end>=start?end-start:null;
const sumKnown=values=>values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;

/** Observations, not judgments: a repeat/error/gap is not automatically wasted work. */
export function analyzeWorkPatterns(events,{eventsComplete=false,requestsComplete=false,requests=[]}={}){
  if(!Array.isArray(events)||!Array.isArray(requests)) throw new Error('Events and requests must be arrays');
  const calls=new Map(),failedSignatures=new Map(),chains=[],inputs=[];
  let active=[],lastEdit=null,blocked=false,explicitErrors=0,repeatedFailed=0,unknownResults=0,invalidTiming=0;
  const readSignatures=new Set(),toolSequence=[],resultToNextAction=[];
  let repeatedIdenticalReads=0,pendingResult=null;
  const flush=()=>{if(active.length>=3){
    const gaps=active.slice(1).map((r,i)=>duration(active[i].end,r.start));
    chains.push({toolCallIds:active.map(r=>r.id),calls:active.length,files:[...new Set(active.map(r=>r.file).filter(Boolean))],
      // WHY: native emits all submissions before serial execution; these spans include queuing.
      betweenEditsMs:sumKnown(gaps),submissionToResultMs:sumKnown(active.map(r=>duration(r.start,r.end))),
      elapsedMs:duration(active[0].start,active.at(-1).end),removableWasteMs:null});
  }active=[];lastEdit=null;};
  for(const event of events){
    const d=event.data??{};
    if(d.agentId||d.parentAgentToolUseId) continue;
    if(pendingResult&&['tool-use','assistant-text','user-message','turn-complete','session-error','user-interrupt'].includes(event.type)){
      resultToNextAction.push({toolCallId:pendingResult.id,nextAction:event.type,gapMs:duration(pendingResult.end,stamp(event.timestamp))});
      pendingResult=null;
    }
    if(['user-message','compact-summary','context-clear','session-error','user-interrupt','turn-complete'].includes(event.type)){
      flush();blocked=false;
      if(event.type==='user-message'&&!d.injected) inputs.push({eventUuid:event.uuid??null,start:stamp(event.timestamp),inputKind:d.inputKind??'unclassified'});
      continue;
    }
    if(event.type==='tool-use'){
      if(!d.toolUseId) {flush();blocked=true;continue;}
      if(calls.has(d.toolUseId)) throw new Error('Duplicate tool-call identity; normalize replay before analysis');
      const row={id:d.toolUseId,name:d.toolName,start:stamp(event.timestamp),end:null,resultKnown:false,
        file:d.toolInput?.file_path??d.toolInput?.path??null,signature:signature(d.toolName,d.toolInput)};
      calls.set(row.id,row);
      const category=['Read','read'].includes(row.name)?'read':['Edit','edit','Write','write'].includes(row.name)?'edit':'opaque';
      toolSequence.push({toolCallId:row.id,tool:row.name,category,submittedAt:row.start});
      if(category==='read'){if(readSignatures.has(row.signature))repeatedIdenticalReads++;readSignatures.add(row.signature);}
      if(!['Edit','edit'].includes(row.name)){flush();blocked=true;}
      else {
        if(lastEdit&&!lastEdit.resultKnown){flush();blocked=true;}
        row.chainEligible=!blocked;
        lastEdit=row;
      }
    } else if(event.type==='tool-result'){
      const row=calls.get(d.toolUseId);
      if(!row) {
        // WHY: an orphan result proves capture/pairing is incomplete, not zero errors.
        if(d.isError===true) explicitErrors++;
        unknownResults++;flush();blocked=true;continue;
      }
      if(row.resultKnown) throw new Error('Duplicate tool-result identity');
      row.resultKnown=true;row.end=stamp(event.timestamp);row.isError=typeof d.isError==='boolean'?d.isError:null;pendingResult=row;
      if(duration(row.start,row.end)===null) invalidTiming++;
      if(typeof d.isError!=='boolean'){unknownResults++;flush();blocked=false;continue;}
      if(d.isError){
        explicitErrors++;
        const count=failedSignatures.get(row.signature)??0;
        if(count) repeatedFailed++;
        failedSignatures.set(row.signature,count+1);
        flush();blocked=false;continue;
      }
      if(['Edit','edit'].includes(row.name)&&row.chainEligible){active.push(row);lastEdit=row;}
      else {flush();blocked=false;}
    }
  }
  flush();
  for(const row of calls.values()) if(!row.resultKnown) unknownResults++;
  const requestIds=new Set();
  for(const request of requests){if(!request.id||requestIds.has(request.id))throw new Error('Duplicate/missing physical request identity');requestIds.add(request.id);}
  const agentRequests=requests.filter(r=>r.role!=='judge');
  const boundaryComplete=inputs.every((r,i)=>r.start!==null&&(i===0||r.start>=inputs[i-1].start));
  const requestTimingComplete=agentRequests.every(r=>stamp(r.startedAt)!==null);
  const segments=inputs.map((input,index)=>{
    const end=inputs[index+1]?.start??Infinity;
    const valid=boundaryComplete&&requestTimingComplete;
    const count=valid?agentRequests.filter(r=>stamp(r.startedAt)>=input.start&&stamp(r.startedAt)<end).length:null;
    return {index,eventUuid:input.eventUuid,inputKind:input.inputKind,modelRequests:eventsComplete&&requestsComplete?count:null,
      observedModelRequests:count,underlyingOperations:null};
  });
  const observed={calls:calls.size,explicitToolErrors:explicitErrors,repeatedFailedCalls:repeatedFailed,
    unknownToolOutcomes:unknownResults,invalidTimingPairs:invalidTiming,editChains:chains,
    repeatedIdenticalReads,toolSequence,resultToNextAction,
    toolCallsByName:toolSequence.reduce((counts,r)=>({...counts,[r.tool]:(counts[r.tool]??0)+1}),{}),
    toolCallsByCategory:toolSequence.reduce((counts,r)=>({...counts,[r.category]:(counts[r.category]??0)+1}),{}),
    toolLatencies:[...calls.values()].map(r=>({toolCallId:r.id,tool:r.name,submissionToResultMs:duration(r.start,r.end),executionMs:null,isError:r.isError??null}))};
  return {coverage:{eventsComplete,requestsComplete,boundaryComplete,requestTimingComplete},observed,
    editChains:eventsComplete?chains:null,explicitToolErrors:eventsComplete&&unknownResults===0?explicitErrors:null,
    repeatedFailedCalls:eventsComplete&&unknownResults===0?repeatedFailed:null,inputSegments:segments,
    modelMistakes:null,realHumanInterventions:null,
    interpretation:['A successful-edit chain is consecutive submitted-and-completed edits without intervening tools or user/background notices.',
      'Parallel submissions are not serial decision chains. Missing timestamps stay unknown.',
      'Between-edit gaps include generation and other overhead, not proven removable waste.',
      'Repeated failed signatures include intentional test reruns; no model-mistake verdict is inferred.',
      'Request segmentation follows observed input boundaries, including scripted inputs; it does not infer real human interventions.']};
}
