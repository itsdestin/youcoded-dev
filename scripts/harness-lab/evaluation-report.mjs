#!/usr/bin/env node
// Join independent score axes without manufacturing a single 'harness IQ' number.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {analyzeNativeRun,analyzeInteractions} from './interactions.mjs';
import {analyzeWorkPatterns} from './work-patterns.mjs';
import {importEvaluationEvidence} from './evaluation-import.mjs';
import {scoreOutcome,successWithinBudgets} from './outcome-scores.mjs';
import {auditComparison,graderReliability,configurationFingerprint} from './evaluation-audit.mjs';

export function buildEvaluationReport(bundle){
  if(bundle?.schemaVersion!==1||!Array.isArray(bundle.records))throw new Error('Expected evaluation bundle schemaVersion 1 with records');
  const identities=new Set(),scoringRecords=[];
  const records=bundle.records.map(record=>{
    if(typeof record.id!=='string'||!record.id||identities.has(record.id))throw new Error('Missing or duplicate evaluation record ID');
    identities.add(record.id);
    const run=record.run??{status:'missing'};
    const complete=record.coverage?.events===true&&run.status==='completed';
    // WHY: rejected activity must not rethrow its malformed ledger through fallback analyzers.
    const requestIds=new Set();
    const validRequests=Array.isArray(run.requests)&&run.requests.every(r=>{
      if(!r||typeof r.id!=='string'||!r.id||requestIds.has(r.id))return false;
      requestIds.add(r.id);return true;
    });
    const safeRequests=validRequests?run.requests:undefined;
    const requestsComplete=record.coverage?.requests===true&&validRequests;
    const native=run.runtime==='createRuntime/NativeSessionHost';
    // WHY: native and competitor evidence share normalization, scope and latency
    // semantics. ATIF observations are not silently discarded by native-only gating.
    const activityEvidence=importEvaluationEvidence([{id:record.id,raw:native||Array.isArray(run.steps)?run:null,
      taskId:record.taskId,controllerEvidence:record.controllerEvidence,controllerAuthority:record.controllerAuthority,behaviorRaw:record.behaviorRaw,
      outcomeRecord:record,eventsComplete:record.coverage?.events===true&&(native?complete:true),requestsComplete}]).records[0];
    const activity=activityEvidence.analysis;
    scoringRecords.push(activityEvidence.scoringRecord??record);
    // WHY: malformed activity must not erase independent task outcomes or become zero-work evidence.
    const malformed=activityEvidence.coverage==='unsupported';
    const interactions=activity?.interactions??(malformed?analyzeInteractions([],{coverage:{events:false,requests:false}}):analyzeNativeRun({...run,requests:safeRequests,status:'partial'}));
    interactions.modelRequests=analyzeInteractions([],{requestLedger:safeRequests,coverage:{requests:requestsComplete,events:false}}).modelRequests;
    interactions.coverage.requests=requestsComplete&&Array.isArray(run.requests);
    // WHY: use the same validated behavioral outcome as the shared analyzer;
    // rescoring raw record discards controller-backed failures and recovery.
    return {id:record.id,outcome:activity?.outcome??scoreOutcome(record),resources:record.resources??null,
      activity,activityEvidence,interactions,workPatterns:activity?.workPatterns??analyzeWorkPatterns(native&&!malformed?(run.events??[]):[],{
        eventsComplete:complete&&native&&!malformed,requestsComplete,requests:safeRequests??[]}),
      configuration:record.configuration??{},configurationFingerprint:configurationFingerprint(record.configuration??{}),
      failureClass:record.failureClass??'unknown'};
  });
  const comparisons=(bundle.comparisons??[]).map(pair=>{
    const left=records.find(r=>r.id===pair.left),right=records.find(r=>r.id===pair.right);
    if(!left||!right)throw new Error('Comparison references an absent record');
    return {left:pair.left,right:pair.right,...auditComparison(left.configuration,right.configuration,{track:pair.track??'harness',allowedDifferences:pair.allowedDifferences??[]})};
  });
  return {schemaVersion:1,records,comparisons,
    budgetResults:successWithinBudgets(scoringRecords,bundle.budgets??[]),
    graders:graderReliability(bundle.grades??[],bundle.humanReferences??[]),
    publicClaimReady:false,
    interpretation:['Verified completion, safety, supervision, resources and grader reliability are separate axes.',
      'Unknown evidence is not a zero failure count. A source label is provenance, not proof of semantic accuracy.',
      'A model-based interpretation is provisional until fixture/human evidence validates it.',
      'Calls/words/decision gaps are observations, not proof of waste. Opaque script operation counts remain unknown.',
      'No automatic publication approval: inspect held-out coverage, task independence, confidence intervals and grading calibration.']};
}
const cell=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
const shown=value=>value===null||value===undefined?'unknown':String(value);
export function renderEvaluationReport(report){
  const lines=['# Evaluation scorecard','',
    'Offline evidence report. Unknown is not zero. No blended score; safety cannot be traded for speed.','',
    '| Record | Verified outcome | Model requests | Tool calls | Progress messages | Turn-final messages | Visible words |',
    '|---|---|---:|---:|---:|---:|---:|'];
  for(const row of report.records){
    const i=row.interactions;
    lines.push(`| ${cell(row.id)} | ${cell(JSON.stringify(row.outcome.completion??row.outcome.verified??null))} | ${shown(i.modelRequests)} | ${shown(i.toolCalls)} | ${shown(i.progressMessages)} | ${shown(i.turnFinalMessages)} | ${shown(i.assistantWords)} |`);
  }
  lines.push('','## Safety, supervision and recovery','',
    '| Record | Acceptable completion | Confirmed safety failures | Follow-through failures | Recovery outcomes |',
    '|---|---|---:|---:|---|');
  for(const row of report.records){
    const o=row.outcome;
    lines.push(`| ${cell(row.id)} | ${shown(o.acceptable)} | ${shown(o.safety.coverage&&o.safety.observations>0?o.safety.failures:null)} | ${shown(o.followThrough.coverage&&o.followThrough.observations>0?o.followThrough.failures:null)} | ${o.recovery.coverage&&o.recovery.observations>0?`${o.recovery.successes} recovered / ${o.recovery.observations} observed`:'unknown'} |`);
  }
  const observed=report.records.filter(r=>r.activity?.runtimeObserved);
  if(observed.length){
    lines.push('','## Runtime-observed native diagnostics','',
      'Diagnostic telemetry is not controller-verified outcome or validated-semantic evidence. Same-container Bash can tamper with observations. Identical failed → passing command reruns do not prove causal repair; scripted permission decisions are not human approvals.','',
      '| Record | Provenance / coverage | SDK attempts | Failed executions | Same-command pass-after-failure | Background shell exits | Continuous scheduler |',
      '|---|---|---:|---:|---:|---|---|');
    for(const r of observed){const o=r.activity.runtimeObserved;lines.push(`| ${cell(r.id)} | runtime-observed / ${cell(o.coverage)} | ${shown(o.sdk?.length)} | ${shown(o.executions?.filter(e=>e.status==='failed').length)} | ${shown(o.recovery?.sameCheckPasses.length)} | ${cell(o.shells?.map(s=>`${s.shellId}: ${s.exitCode??s.status}`).join(', ')??'unknown')} | not covered |`);}
  }
  lines.push('','## Verified completion within budgets','',
    'Resource wins do not establish safe/acceptable completion; consult the separate safety axis. Failed/time-limited attempts remain in the denominator.','',
    '| Budget | Scheduled | Wins | Losses | Unresolved | Success bounds |', '|---|---:|---:|---:|---:|---|');
  for(const b of report.budgetResults)lines.push(`| ${cell(b.budgetId)} | ${b.attempts} | ${b.wins} | ${b.losses} | ${b.unresolved} | ${b.successRate?`${b.successRate.lower}–${b.successRate.upper}`:'unknown'} |`);
  lines.push('','## Measurement and grader validity','');
  for(const c of report.comparisons)lines.push(`- ${cell(c.left)} vs ${cell(c.right)}: ${c.comparable?'recorded conditions match':'NOT comparable — '+c.blockers.join('; ')}`);
  const g=report.graders;
  lines.push(`- Grader records: ${g.acceptedGrades} accepted, ${g.invalidGrades} invalid; rubric: ${shown(g.rubricVersion)}.`,
    `- Swapped-order pairs: ${g.orderPairs}; mean absolute score difference: ${shown(g.meanAbsoluteOrderDifference)}.`,
    `- Human comparison items: ${g.humanComparedItems}; mean absolute score difference: ${shown(g.humanMeanAbsoluteDifference)}. Calibration is not automatically established.`,
    '- Full cited evidence, coverage and work-pattern details are available with --json.','',...report.interpretation.map(s=>'- '+s),'');
  return lines.join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const args=process.argv.slice(2);
    if(!args.length||args.includes('--help'))console.log('Usage: node scripts/harness-lab/evaluation-report.mjs BUNDLE.json [--json]\nPure offline scoring. Does not read credentials or run models.');
    else{
      if(args.length>2||(args[1]&&args[1]!=='--json'))throw new Error('Invalid arguments');
      const result=buildEvaluationReport(JSON.parse(fs.readFileSync(args[0],'utf8')));
      console.log(args[1]==='--json'?JSON.stringify(result,null,2):renderEvaluationReport(result));
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
