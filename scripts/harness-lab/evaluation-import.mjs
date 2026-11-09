#!/usr/bin/env node
// WHY: all report consumers cross this adapter, not separate native-only demo paths.
// stdin is already selected by the controller's immutable trial identities. No disk
// writes, provider calls, credential loading or raw content in the returned bundle.
import {analyzeActivity} from './activity-normalize.mjs';
import {deriveBehavior,behaviorHash} from './behavior-evidence.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
export function importEvaluationEvidence(entries){
  if(!Array.isArray(entries))throw new Error('Evidence entry array required');
  const ids=new Set();
  return {schemaVersion:1,kind:'derived-activity-evidence',records:entries.map(entry=>{
    if(typeof entry.id!=='string'||ids.has(entry.id))throw new Error('Unique evidence identity required');ids.add(entry.id);
    const source={reference:entry.source??null,sha256:entry.sourceSha256??null};
    if(!entry.raw)return {id:entry.id,source,coverage:'not-collected',reason:'No native run or ATIF trajectory beside selected result; activity collection is missing.',analysis:null};
    // WHY: metrics from a stale/foreign adapter artifact cannot inherit the selected arm's label.
    const actualAdapter=entry.raw.runtime==='createRuntime/NativeSessionHost'?'youcoded':entry.raw.agent?.name;
    if(entry.expectedAdapter&&actualAdapter!==entry.expectedAdapter)return {id:entry.id,source,coverage:'unsupported',reason:'Activity adapter identity does not match the frozen trial adapter; independent outcome retained.',analysis:null};
    try{
      const controllerRaw=entry.behaviorRaw??entry.raw;
      const withoutGateway=value=>{const {gatewayActivities,...capture}=value;return capture;};
      const sameCapture=behaviorHash(withoutGateway(controllerRaw))===behaviorHash(withoutGateway(entry.raw));
      const behavior=deriveBehavior(entry.controllerEvidence,sameCapture?entry.controllerAuthority:null,{runId:entry.id,taskId:entry.taskId,adapter:actualAdapter,raw:controllerRaw,outcomeRecord:entry.outcomeRecord});
      const analysis=analyzeActivity(entry.raw,{outcomeRecord:behavior.outcomeRecord,continuationEpisodes:behavior.continuationEpisodes??null,eventsComplete:entry.eventsComplete,requestsComplete:entry.requestsComplete});
      // WHY: controller rows are independently validated; malformed behavioral evidence
      // cannot erase an independent failed task or otherwise usable activity capture.
      const {outcomeRecord,continuationEpisodes,...visibleBehavior}=behavior;
      analysis.behavior=visibleBehavior;
      // Canonical scoring input is shared with scorecard budget accounting;
      // do not return the caller's run/raw content as a second evidence copy.
      const scoringRecord=Object.fromEntries(['id','outcome','resources','evidence','coverage'].map(k=>[k,behavior.outcomeRecord[k]]));
      return {id:entry.id,source,coverage:'partial',reason:'See metric-specific coverage; historical collection cannot supply all families.',analysis,scoringRecord};
    }
    catch{return {id:entry.id,source,coverage:'unsupported',reason:'Activity artifact is malformed, conflicting, or unsupported; raw failure retained, no zero-filled metrics.',analysis:null};}
  })};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>128*1024*1024)throw new Error('Evidence bound exceeded');}
    console.log(JSON.stringify(importEvaluationEvidence(JSON.parse(text))));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
