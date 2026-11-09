import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const HELP = `Usage: node scripts/harness-lab/continuation-metrics.mjs EPISODES.json
Offline only: JSON array -> {episodes, summary}; no runtime access or model calls.
Contract (all times finite milliseconds on ONE monotonic timebase, never rounded):
Episode: id, sessionId (parent), taskId (child), reportId; thresholdMs > 0;
 observation:{start,end}; fixture:{reference,requiredWork,blocked,requiresUser,
 dependsOn:[{taskId,completedAt:number|null}]}; coverage booleans:
 {childCompletion,reportDelivery,parentState,userInputs,progress}.
Fixture declarations apply throughout the episode. Split changing blockers into episodes.
Only declared dependencies defer readiness; unrelated running children do not.
Evidence: {sessionId,taskId,reportId} must match episode; optional/null timestamps:
 childCompletedAt,reportQueuedAt,reportDeliveredAt,parentRequestStartedAt,
 firstUsefulProgressAt,verifiedFollowupAt. Queue time is NOT delivery time.
 Optional completionKind: specialist (default)|shell; observerScope:
 native-parent (default)|controller-protocol. Controller-protocol is a scripted
 consumer, NOT model/harness continuation performance; never pool the scopes.
 reportDeliveredAt means correlated injected specialist-report receipt in the parent,
 or the shell completion callback received by the declared consumer for shell episodes,
 NOT UI card completion or the ledger delivered boolean (which may be post-turn).
 A receipt requires deliveryContext: active|held|cancelled; held/cancelled contexts
 are ineligible (a Stop-spliced receipt must not imply a wake-up obligation).
 parentRequestStartedAt is the actual post-receipt model request, NOT useful progress.
 firstUsefulProgressAt needs progressReference; verifiedFollowupAt needs
 followupReference: fixture-verifier references to approved output/tool milestones,
 never arbitrary text, model requests or any tool invocation. These must be first
 observed milestones, with verified followup at/after useful progress.
 states:[{start,end,state:idle|model|tool|blocked|awaiting-user}] nonoverlapping,
 half-open intervals within observation; parentState=true requires gapless coverage.
 idle means no in-flight request/tool, compaction or pending user input queue.
 inputs:[{at,kind:initial|scripted|real-nudge}] are real root inputs only; initial
 must precede readiness. Automatic notices are NOT inputs (omit or use notifications).
 Optional terminal:{at,state:stopped,reference} is an explicit parent terminal event,
 not a waiting-claim regex. All observations are scoped by evidence correlation.
Deadline: readyAt=max(childCompletedAt,declared dependency completions)+thresholdMs.
 Missing primary completion/delivery/input/progress coverage => unknown.
 Parent-state coverage is diagnostic only: missing states keep idle metrics and
 idle-based classification unknown, not primary success/failure. Any positively
 observed blocker conflicting with the fixture remains eligible but unknown.
 Queue notification may occur after injection; it is not in the causal ordering.
 A short window => censored, not zero latency.
 Success requires verified followup by deadline without extra root input after readiness.
 Failures are symptoms, NOT production root-cause diagnoses. needsNudge=true means
 observed real-nudge then verified recovery, not proof of counterfactual necessity;
 false only on success, otherwise unknown. Latencies include observed nudge recovery.
 actionableIdleMs counts idle from readiness until useful progress or observation end.
 Summary successRate denominator=assessed eligible; bounds denominator=all eligible,
 including unknown/censored. Missing durations remain null; no retroactive complete
 success rate can be extracted from a historical helper without this coverage.
 Completeness declarations are the collector's responsibility, not inferred here.`;

const COVERAGE = ['childCompletion','reportDelivery','parentState','userInputs','progress'];
const TIMES = ['childCompletedAt','reportQueuedAt','reportDeliveredAt','parentRequestStartedAt','firstUsefulProgressAt','verifiedFollowupAt'];
const STATES = new Set(['idle','model','tool','blocked','awaiting-user']);
const text = value => typeof value === 'string' && value.trim().length > 0;
const number = value => typeof value === 'number' && Number.isFinite(value);
const check = (condition, message) => { if (!condition) throw new Error(message); };
function validate(e) {
  check(e && ['id','sessionId','taskId','reportId'].every(k=>text(e[k])), 'Episode requires identity strings');
  check(e.completionKind===undefined||['specialist','shell'].includes(e.completionKind),'Invalid completion kind');
  check(e.observerScope===undefined||['native-parent','controller-protocol'].includes(e.observerScope),'Invalid observer scope');
  const {fixture:f,observation:o,evidence:v,coverage:c}=e;
  check(f && text(f.reference) && ['requiredWork','blocked','requiresUser'].every(k=>typeof f[k]==='boolean'), 'Fixture declarations/reference required');
  check(o && number(o.start) && number(o.end) && o.end>=o.start && number(e.thresholdMs) && e.thresholdMs>0, 'Invalid observation/thresholdMs');
  check(c && COVERAGE.every(k=>typeof c[k]==='boolean'), 'Explicit coverage booleans required');
  check(v && ['sessionId','taskId','reportId'].every(k=>v[k]===e[k]), 'Evidence correlation mismatch');
  const inWindow = at => number(at) && at>=o.start && at<=o.end;
  for(const k of TIMES) check(v[k]==null || inWindow(v[k]), `Invalid timestamp ${k}`);
  // WHY: a queued parent drain may inject before the child's later queue notification.
  const ordered=TIMES.filter(k=>k!=='reportQueuedAt').map(k=>v[k]).filter(t=>t!=null);
  check(ordered.every((t,i)=>i===0 || t>=ordered[i-1]), 'Evidence timestamp order is invalid');
  if(v.reportDeliveredAt!=null) check(['active','held','cancelled'].includes(v.deliveryContext), 'Delivery context required');
  if(v.firstUsefulProgressAt!=null) check(text(v.progressReference), 'Progress reference required');
  if(v.verifiedFollowupAt!=null) check(v.firstUsefulProgressAt!=null && text(v.followupReference), 'Followup reference and useful progress required');
  check(Array.isArray(f.dependsOn), 'Explicit dependsOn required');
  const deps=new Set();
  for(const d of f.dependsOn) {
    check(text(d.taskId) && !deps.has(d.taskId) && (d.completedAt===null || inWindow(d.completedAt)), 'Invalid/duplicate dependency');
    deps.add(d.taskId);
  }
  check(Array.isArray(e.states) && Array.isArray(e.inputs), 'State and input arrays required');
  const states=[...e.states].sort((a,b)=>a.start-b.start);
  for(const [i,s] of states.entries()) {
    check(STATES.has(s.state) && inWindow(s.start) && inWindow(s.end) && s.end>s.start, 'Invalid state interval');
    check(i===0 || s.start>=states[i-1].end, 'Overlapping state intervals');
  }
  if(c.parentState) check(states.length>0 && states[0].start===o.start && states.at(-1).end===o.end && states.every((s,i)=>i===0 || s.start===states[i-1].end), 'Complete state coverage has a gap');
  for(const input of e.inputs) check(inWindow(input.at) && ['initial','scripted','real-nudge'].includes(input.kind), 'Invalid root input');
  if(e.terminal) check(inWindow(e.terminal.at) && e.terminal.state==='stopped' && text(e.terminal.reference), 'Invalid terminal evidence');
  return states;
}
const duration = (states,start,end,kind) => states.reduce((sum,s)=>sum+(s.state===kind?Math.max(0,Math.min(end,s.end)-Math.max(start,s.start)):0),0);
function analyze(e) {
  const states=validate(e), {evidence:v,coverage:c,fixture:f,observation:o}=e;
  const dependenciesReady=f.dependsOn.every(d=>d.completedAt!=null);
  const readyAt=v.childCompletedAt==null || !dependenciesReady ? null : Math.max(v.childCompletedAt,...f.dependsOn.map(d=>d.completedAt));
  if(readyAt!=null) {
    check(e.inputs.every(i=>i.kind!=='initial' || i.at<=readyAt), 'Initial input cannot occur after readiness');
    check([v.firstUsefulProgressAt,v.verifiedFollowupAt].every(t=>t==null || t>=readyAt), 'Followup milestone precedes dependency readiness');
  }
  const eligible=f.requiredWork && !f.blocked && !f.requiresUser && dependenciesReady && !['held','cancelled'].includes(v.deliveryContext);
  const deadline=readyAt==null?null:readyAt+e.thresholdMs;
  // WHY: endpoint success/stall can be known without continuous scheduler-state telemetry.
  const full=COVERAGE.filter(k=>k!=='parentState').every(k=>c[k]);
  // WHY: real shell callbacks can exercise collection without pretending a scripted
  // controller is a native assistant. Keep ownership visible in every scored episode.
  const r={id:e.id,completionKind:e.completionKind??'specialist',observerScope:e.observerScope??'native-parent',eligible,readyAt,deadline,thresholdMs:e.thresholdMs,censored:false,
    noNudgeContinuation:'unknown',needsNudge:'unknown',classification:'unknown',reason:'Incomplete observation coverage',
    completionToReportMs:c.childCompletion&&c.reportDelivery&&v.childCompletedAt!=null&&v.reportDeliveredAt!=null?v.reportDeliveredAt-v.childCompletedAt:null,
    deliveryToParentStartMs:c.reportDelivery&&v.reportDeliveredAt!=null&&v.parentRequestStartedAt!=null?v.parentRequestStartedAt-v.reportDeliveredAt:null,
    readyToUsefulProgressMs:c.childCompletion&&c.progress&&readyAt!=null&&v.firstUsefulProgressAt!=null?v.firstUsefulProgressAt-readyAt:null,
    actionableIdleMs:eligible&&c.childCompletion&&c.parentState&&c.progress&&readyAt!=null?duration(states,readyAt,v.firstUsefulProgressAt??o.end,'idle'):null};
  if(!eligible) {r.reason='No fixture-approved actionable followup (or held/cancelled context)';return r;}
  if(readyAt==null) return r;
  const useful=v.firstUsefulProgressAt, verified=v.verifiedFollowupAt;
  const extra=e.inputs.filter(i=>i.kind!=='initial' && i.at>=readyAt && (verified==null || i.at<=verified));
  const verifiedByDeadline=verified!=null && v.reportDeliveredAt!=null && verified<=deadline;
  r.censored=o.end<deadline && !verifiedByDeadline && extra.length===0;
  if(!full) return r;
  // WHY: A complete state record can reveal a legitimate blocker even if the fixture forgot it.
  if(states.some(s=>['blocked','awaiting-user'].includes(s.state)&&s.end>readyAt&&s.start<Math.min(verified??o.end,deadline))) {
    r.reason='Observed blocker/user requirement conflicts with actionable fixture';return r;
  }
  if(verifiedByDeadline && extra.length===0) {
    Object.assign(r,{noNudgeContinuation:'success',needsNudge:false,reason:'Verified followup without extra root input by fixture deadline'});return r;
  }
  if(r.censored) {r.reason='Observation ends before fixture deadline';return r;}
  r.noNudgeContinuation='fail';r.reason=extra.length?'Extra root input before verified followup':'Fixture deadline missed';
  if(verified!=null && extra.some(i=>i.kind==='real-nudge'&&i.at<verified)) r.needsNudge=true;
  // WHY: Freeze attribution before intervention/deadline; later recovery cannot erase the symptom.
  const cutoff=Math.min(o.end,deadline,...extra.map(i=>i.at));
  const idleThroughout=start=>cutoff>start && states.filter(s=>s.end>start&&s.start<cutoff).every(s=>s.state==='idle');
  if((v.reportDeliveredAt==null || v.reportDeliveredAt>deadline) && cutoff>=deadline) r.classification='delivery-stall';
  else if(c.parentState && cutoff>=deadline && v.reportDeliveredAt!=null && v.reportDeliveredAt<=cutoff) {
    const deliveredReady=Math.max(readyAt,v.reportDeliveredAt);
    if((v.parentRequestStartedAt==null || v.parentRequestStartedAt>cutoff) && idleThroughout(deliveredReady)) r.classification='parent-wakeup-stall';
    else if(e.terminal && e.terminal.at>=deliveredReady && e.terminal.at<=cutoff && (verified==null || verified>cutoff) && idleThroughout(e.terminal.at)) r.classification='behavioral-premature-stop';
    else if(useful!=null && useful<=cutoff && (verified==null || verified>cutoff)) r.classification='incomplete-followthrough';
  }
  return r;
}

/** Pure fixture-scoped evaluation. See HELP for the complete collector contract. */
export function analyzeContinuationEpisodes(episodes) {
  check(Array.isArray(episodes), 'Expected episodes array');
  const ids=new Set();
  const results=episodes.map(e=>{check(!ids.has(e?.id),'Duplicate episode id');ids.add(e?.id);return analyze(e);});
  check(new Set(results.map(r=>r.observerScope)).size<=1,'Cannot pool controller-protocol and native-parent continuation');
  const eligible=results.filter(r=>r.eligible), successes=eligible.filter(r=>r.noNudgeContinuation==='success').length;
  const failures=eligible.filter(r=>r.noNudgeContinuation==='fail').length, assessed=successes+failures;
  const unknown=eligible.length-assessed;
  return {episodes:results,summary:{total:results.length,eligible:eligible.length,ineligible:results.length-eligible.length,
    assessed,successes,failures,unknown,censored:eligible.filter(r=>r.censored).length,
    successRate:assessed?successes/assessed:null,
    successRateBounds:eligible.length?{lower:successes/eligible.length,upper:(successes+unknown)/eligible.length}:null}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if(process.argv.includes('--help')) console.log(HELP);
    else {check(process.argv.length===3,'Expected EPISODES.json; use --help');console.log(JSON.stringify(analyzeContinuationEpisodes(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));}
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
