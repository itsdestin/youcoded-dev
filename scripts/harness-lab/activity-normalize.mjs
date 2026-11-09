import {createHash} from 'node:crypto';
import {normalizeAtif,analyzeInteractions} from './interactions.mjs';
import {analyzeWorkPatterns} from './work-patterns.mjs';
import {analyzeTimeline} from './activity-timeline.mjs';
import {analyzeActivityReceipts} from './activity-receipts.mjs';
import {scoreOutcome} from './outcome-scores.mjs';
import {graderReliability,configurationFingerprint} from './evaluation-audit.mjs';
import {analyzeContinuationEpisodes} from './continuation-metrics.mjs';
import {analyzeRuntimeObserved} from './runtime-observed.mjs';
export const EVIDENCE_SCHEMA_VERSION=1;
export const stamp=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:
  typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const parent=e=>!e.data?.agentId&&!e.data?.parentAgentToolUseId;

/** Internal normalized deltas; raw content is deliberately excluded from exported analysis. */
export function normalizeActivity(raw){
  const native=raw?.runtime==='createRuntime/NativeSessionHost';
  if(!native&&!Array.isArray(raw?.steps))throw new Error('Unsupported activity artifact: native run or ATIF steps required');
  const input=native?raw.events:normalizeAtif(raw);
  if(!Array.isArray(input))throw new Error('Activity event array required');
  const seen=new Map(),events=[];
  for(const e of input){
    // WHY: matching event counts cannot certify malformed events as complete zero-work evidence.
    if(!e||typeof e!=='object'||Array.isArray(e)||typeof e.type!=='string'||!e.type.trim())throw new Error('Activity event type required');
    if(e.data!==undefined&&(!e.data||typeof e.data!=='object'||Array.isArray(e.data)))throw new Error('Activity event data must be an object');
    if(['tool-use','tool-result'].includes(e.type)&&(typeof e.data?.toolUseId!=='string'||!e.data.toolUseId))throw new Error('Activity tool identity required');
    if(e.type==='tool-use'&&(typeof e.data?.toolName!=='string'||!e.data.toolName))throw new Error('Activity tool name required');
    // Only stable replay IDs justify deduplication. Identical chunks without IDs
    // may be real repeated deltas and must not be removed by a text heuristic.
    if(e.uuid){const digest=hash(e);if(seen.has(e.uuid)){if(seen.get(e.uuid)!==digest)throw new Error('Conflicting replay identity');continue;}seen.set(e.uuid,digest);}
    const d=e.data??{};
    const provenance=e.type!=='user-message'?'assistant':d.injected?'notice':
      d.inputKind==='human'?'human':d.inputKind==='scripted'||(native&&Array.isArray(raw.scenario?.steps))?'scripted':'unknown';
    events.push({...e,timestamp:stamp(e.timestamp),clock:'epoch-ms',scope:parent(e)?'parent':'child',provenance});
  }
  const expected=raw.scenarioCheckpoints?.at(-1)?.eventCount;
  const complete=native&&raw.status==='completed'&&Number.isInteger(expected)&&expected===input.length;
  // WHY: child summaries have compaction purpose too; ownership follows correlated session identity.
  const rootIds=new Set(events.filter(e=>parent(e)&&typeof e.sessionId==='string').map(e=>e.sessionId));
  const rootId=raw.rootSessionId??(rootIds.size===1?[...rootIds][0]:null);
  const requestScope=r=>rootId&&r.sessionId?(rootId===r.sessionId?'parent':'child'):
    ['parent','child','unknown'].includes(r.scope)?r.scope:r.role==='specialist'?'child':r.role==='compaction'?'unknown':'parent';
  const requests=native?(raw.requests??[]).map(r=>({id:r.id,role:r.role,scope:requestScope(r),
    startedAt:stamp(r.startedAt),endedAt:stamp(r.endedAt),status:r.status,clock:'epoch-ms',
    requestShape:r.requestShape?Object.fromEntries(['systemBytes','toolsBytes','historyBytes','systemHash','toolsHash'].filter(k=>k in r.requestShape).map(k=>[k,r.requestShape[k]])):null})):[];
  return {schemaVersion:EVIDENCE_SCHEMA_VERSION,adapter:native?'youcoded':raw.agent?.name??'atif',events,requests,
    capture:{complete,rawEvents:input.length,normalizedEvents:events.length,expectedEvents:expected??null,
      reason:complete?'Completed native capture reconciles final controller event count. Parent only; child coverage separate.':native?
        'Incomplete run or missing/mismatched controller capture count; counts are observed subtotals.':
        'ATIF projection has no complete capture declaration; step timestamps do not establish tool-result or execution boundaries.'}};
}

export function analyzeActivity(raw,{outcomeRecord,continuationEpisodes,grades=[],humanReferences=[],eventsComplete,requestsComplete=false}={}){
  const n=normalizeActivity(raw),pe=n.events.filter(parent),requests=n.requests;
  if(typeof eventsComplete==='boolean')n.capture={...n.capture,complete:eventsComplete,reason:'Explicit importing bundle event-coverage declaration; scope remains parent-only.'};
  const observed=analyzeInteractions(pe,{coverage:{events:true,requests:false,interventions:false,childEvents:false}});
  // WHY: role boundaries are not proof of human participation. Provenance lives
  // beside the burden counts rather than relabeling scripted fixtures as people.
  const provenance=Object.fromEntries(['human','scripted','notice','unknown'].map(k=>[k,pe.filter(e=>e.type==='user-message'&&e.provenance===k).length]));
  observed.observedUserRoleMessages=observed.humanInputs;observed.humanInputs=null;
  const interactions=n.capture.complete?observed:{...analyzeInteractions([],{coverage:{events:false,requests:false}}),observed};
  interactions.humanInputs=null;interactions.provenance=provenance;
  const workPatterns=analyzeWorkPatterns(pe,{eventsComplete:n.capture.complete,requestsComplete:requestsComplete&&Array.isArray(raw.requests),requests});
  // Do not leak file names/arguments/prompts into aggregate reports.
  for(const chain of workPatterns.observed.editChains)chain.files=chain.files.map(hash);
  const pending=new Map(),toolLatency=workPatterns.observed.toolLatencies,intervals=[];
  for(const r of requests)intervals.push({lane:'request-in-flight',start:r.startedAt,end:r.endedAt,clock:r.clock,scope:r.scope});
  for(const e of pe){
    const d=e.data??{};
    if(e.type==='tool-use')pending.set(d.toolUseId,{start:e.timestamp,name:d.toolName});
    if(e.type==='tool-result'&&pending.has(d.toolUseId)){
      const call=pending.get(d.toolUseId);pending.delete(d.toolUseId);
      intervals.push({lane:'tool-submitted-to-result',start:call.start,end:e.timestamp,clock:e.clock,scope:'parent'});
    }
  }
  for(const c of pending.values())intervals.push({lane:'tool-submitted-to-result',start:c.start,end:null,clock:'epoch-ms',scope:'parent'});
  const times=[...pe.map(e=>e.timestamp),...requests.filter(r=>r.scope==='parent').flatMap(r=>[r.startedAt,r.endedAt])].filter(t=>t!==null);
  const window=times.length>1?{start:Math.min(...times),end:Math.max(...times),clock:'epoch-ms',scope:'parent'}:null;
  const configuration={adapter:n.adapter,model:raw.model??raw.agent?.model_name??null,provider:raw.provider??null,
    buildFingerprint:raw.buildFingerprint??null,version:raw.agent?.version??null,
    controls:Object.fromEntries(['model','provider','preset','timeoutMs','maxRequests','contextWindowTokens'].filter(k=>k in (raw.configuration??{})).map(k=>[k,raw.configuration[k]])),
    resolvedContextTokens:raw.contextControl?.observedResolvedTokens??null};
  // WHY: an importing controller can explicitly disable untrusted raw episodes.
  // Direct collector callers retain the historical API; report imports require authority.
  const episodes=continuationEpisodes===null?undefined:continuationEpisodes??(raw.continuation?.episode?[raw.continuation.episode]:undefined);
  const collectedActivity=raw.activity?analyzeActivityReceipts(raw.activity):null;
  const launcher=raw.launcherObservation;
  const launcherObservation=launcher?.schemaVersion===1&&launcher.clock?.kind==='monotonic-ms'&&typeof launcher.clock.id==='string'&&typeof launcher.start==='number'&&typeof launcher.end==='number'&&Number.isFinite(launcher.start)&&Number.isFinite(launcher.end)&&launcher.end>=launcher.start?
    {clock:{id:launcher.clock.id,kind:'monotonic-ms'},start:launcher.start,end:launcher.end,durationMs:launcher.end-launcher.start,status:['completed','failed','timeout','interrupted'].includes(launcher.status)?launcher.status:'unknown',scope:'launcher spawn-to-close, includes runtime startup and post-run worker export; separate clock from worker'}:null;
  const gatewayActivity=(raw.gatewayActivities??[]).map(entry=>{
    if(typeof entry.requestId!=='string'||!Array.isArray(entry.activity?.receipts)||entry.activity.receipts.some(r=>r.requestId!==entry.requestId))throw new Error('Gateway activity request mapping mismatch');
    return {requestId:entry.requestId,analysis:analyzeActivityReceipts(entry.activity)};
  });
  const gatewayGroups=new Map();
  for(const entry of raw.gatewayActivities??[]){
    const clock=entry.activity.clock.id;
    if(!gatewayGroups.has(clock))gatewayGroups.set(clock,[]);
    gatewayGroups.get(clock).push(entry.activity);
  }
  const gatewayCohorts=[...gatewayGroups.values()].map(captures=>{
    const closed=captures.every(c=>c.observation.end!==null&&c.observation.status==='completed');
    const combined={schemaVersion:1,clock:captures[0].clock,
      observation:{start:Math.min(...captures.map(c=>c.observation.start)),end:closed?Math.max(...captures.map(c=>c.observation.end)):null,status:closed?'completed':'incomplete'},
      dropped:captures.reduce((n,c)=>n+(c.dropped??0),0),receipts:captures.flatMap(c=>c.receipts).sort((a,b)=>a.at-b.at)};
    return {scope:'observed gateway request cohort only; excludes client startup/finalization; gaps do not establish idle',analysis:analyzeActivityReceipts(combined)};
  });
  if(collectedActivity)for(const tool of toolLatency){
    // WHY: don't mix millisecond wall-clock submission latency with sub-ms
    // monotonic execution/queue measurements when correlated receipts exist.
    const pending=collectedActivity.intervals.find(r=>r.scope==='parent'&&r.lane==='tool-submitted-to-result'&&r.toolCallId===tool.toolCallId);
    if(pending){tool.submissionToResultMs=pending.end===null?null:pending.end-pending.start;tool.latencyClock=collectedActivity.clock.id;}
    const execution=collectedActivity.executions.find(r=>r.scope==='parent'&&r.toolCallId===tool.toolCallId);
    if(execution){tool.executionMs=execution.executionMs;tool.submissionToExecutionMs=execution.submissionToExecutionMs;}
  }
  const defaultOutcome={id:'activity',outcome:{verified:null,status:'missing'},resources:{},evidence:{checks:[],followThrough:[],recovery:[],safety:[]},coverage:{followThrough:false,recovery:false,safety:false}};
  return {schemaVersion:EVIDENCE_SCHEMA_VERSION,adapter:n.adapter,capture:n.capture,configuration,configurationFingerprint:configurationFingerprint(configuration),
    normalized:{schemaVersion:EVIDENCE_SCHEMA_VERSION,events:n.events.map(e=>({type:e.type,timestamp:e.timestamp,clock:e.clock,scope:e.scope,provenance:e.provenance,
      toolCallId:e.data?.toolUseId??null,isError:typeof e.data?.isError==='boolean'?e.data.isError:null})),requests},
    interactions,workPatterns,toolLatency,collectedActivity,launcherObservation,gatewayActivity,gatewayCohorts,runtimeObserved:analyzeRuntimeObserved(raw),
    timeline:collectedActivity?.timelines.parent??analyzeTimeline(intervals,window),outcome:scoreOutcome(outcomeRecord??defaultOutcome),
    continuation:episodes?analyzeContinuationEpisodes(episodes):null,
    graders:graderReliability(grades,humanReferences),
    limitations:['Tool submission-to-result latency includes queuing, not execution time.',
      collectedActivity?'Observed stream delivery envelopes and actual execution/ask spans are separate; unsupported signals remain null, no cognitive duration inferred.':'No native monotonic phase/execution receipts in this historical artifact; stream points are observations, not compute duration.',
      'No complete scheduler/approval state or validated semantic labels: false waiting/verification claims remain unknown.',
      'Recovery needs an actual trigger and verified subsequent recovery, not merely a final pass.',
      'Human burden/calibration require provenance and human references; scripted fixtures and notices are separate.',
      'Child display copies are excluded from parent counts; child activity coverage is not established.']};
}
