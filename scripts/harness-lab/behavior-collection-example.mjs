#!/usr/bin/env node
// Free controller + existing NativeSessionHost scripted controls. No network/server.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createBehaviorCollector,behaviorHash} from './behavior-evidence.mjs';
import {runBehaviorFixture} from './behavior-fixtures.mjs';
import {importEvaluationEvidence} from './evaluation-import.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),workspace=path.resolve(here,'../..');
const out=path.resolve(process.argv[2]??'');
if(process.argv.length!==3)throw new Error('Usage: node behavior-collection-example.mjs NEW_OUTPUT_DIRECTORY');
await fs.mkdir(out,{recursive:false});
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'yc-behavior-example-'));
try{
 const entries=[];
 const protocol=path.join(temporary,'protocol');await fs.mkdir(protocol);
 entries.push(await runBehaviorFixture({directory:protocol}));
 for(const profile of ['background-followthrough','waiting-after-report','lost-report','clarification','activity-timing']){
  const task=path.join(temporary,profile);await fs.mkdir(task);const output=path.join(out,profile+'.raw.json');
  const run=spawnSync(process.execPath,[path.join(workspace,'youcoded/desktop/test-engine/lab-runner.mjs'),'--smoke','--smoke-profile',profile,'--cwd',task,'--out',output],{encoding:'utf8',timeout:30000,env:{PATH:process.env.PATH,HOME:temporary}});
  if(run.status!==0)throw new Error(`Native offline ${profile} failed: ${run.stderr}`);
  const raw=JSON.parse(await fs.readFile(output,'utf8'));
  const c=createBehaviorCollector({runId:profile,taskId:'production-host-smoke',adapter:'youcoded'});
  c.checkpoint({id:'observed-run',start:0,end:raw.events.length});
  // ONLY trusted known scripted worker receipts, from this controller's own launch.
  // This wrapper is not an import path for arbitrary historical agent files.
  if(raw.continuation?.episode)c.continuation({id:'native-continuation',checkpointId:'observed-run',episode:raw.continuation.episode,reference:`controller-launched ${profile}: lab-continuation observer`});
  const askWait=requestId=>{
   const starts=raw.activity?.receipts.filter(r=>r.kind==='ask-start'&&r.id===requestId&&r.scope==='parent')??[];
   const ends=raw.activity?.receipts.filter(r=>r.kind==='ask-end'&&r.id===requestId&&r.scope==='parent')??[];
   return starts.length===1&&ends.length===1?{start:starts[0].at,end:ends[0].at,clock:raw.activity.clock.id,reference:'correlated worker monotonic ask-start/ask-end '+requestId}:undefined;
  };
  for(const [i,question] of (raw.clarifications??[]).entries()){
   c.input({id:`question-${i}`,checkpointId:'observed-run',kind:'clarification-call',requestId:question.requestId,provenance:'scripted',reference:`${profile}: real PermissionRequest ${question.requestId}`});
   if(question.decision.behavior==='allow')c.input({id:`answer-${i}`,checkpointId:'observed-run',kind:'clarification-answer',requestId:question.requestId,wait:askWait(question.requestId),provenance:'scripted',reference:`${profile}: actual clarificationDecision allow receipt ${question.requestId}`});
  }
  if(profile==='activity-timing'&&raw.permissionRequests.some(r=>r.tool==='Write')&&await fs.readFile(path.join(task,'lab-smoke.txt'),'utf8')==='production host smoke\n'){
   const asks=raw.activity.receipts.filter(r=>r.kind==='ask-start'&&r.scope==='parent');
   c.input({id:'approved-write',checkpointId:'observed-run',kind:'approval',wait:asks.length===1?askWait(asks[0].id):undefined,provenance:'scripted',reference:'exact fixture Write approved by worker permission handler, actual disk readback'});
  }
  const envelope=c.finish(raw);
  entries.push({id:profile,taskId:'production-host-smoke',expectedAdapter:'youcoded',raw,controllerEvidence:envelope,controllerAuthority:{sha256:behaviorHash(envelope),reference:'owned offline native launch: '+profile}});
 }
 const bundle=importEvaluationEvidence(entries);
 for(const record of bundle.records)if(!record.analysis||record.analysis.behavior.coverage!=='partial')throw new Error('Behavioral import failed: '+JSON.stringify(record));
 await fs.writeFile(path.join(out,'controller-entries.json'),JSON.stringify(entries));
 await fs.writeFile(path.join(out,'behavior-analysis.json'),JSON.stringify(bundle,null,2)+'\n');
 const rendered=spawnSync('python3',['-c',`import sys,json
sys.path.insert(0,${JSON.stringify(here)})
from targeted_report import summarize_targeted,render_markdown
from test_mode_reporting import fixture
bundle=json.load(sys.stdin)
result={}
for mode in ('basic','compare','thorough'):
 m,p=fixture(mode)
 # Extra protocol controls are per-task details, not invented planned model attempts.
 r=summarize_targeted(m,[],[],mode_plan=p);r['synthetic']=True
 template=r['trials'][0]
 r['trials']=[dict(template,id=e['id'],taskId=e['id'],arm='offline-control',activity=e) for e in bundle['records']]
 r['warnings'].insert(0,'Independent executable protocol/native scripted controls, NOT mode execution, competitor performance, real human burden or model quality. Planned matrix remains unstarted; detail rows demonstrate the shared renderer only.')
 result[mode]=dict(summary=r,markdown=render_markdown(r))
print(json.dumps(result))`],{input:JSON.stringify(bundle),encoding:'utf8',env:{PATH:process.env.PATH},maxBuffer:16*1024*1024});
 if(rendered.status!==0)throw new Error(rendered.stderr);
 for(const [mode,r] of Object.entries(JSON.parse(rendered.stdout))){await fs.writeFile(path.join(out,mode+'.md'),r.markdown);await fs.writeFile(path.join(out,mode+'.json'),JSON.stringify(r.summary,null,2)+'\n');}
 const sourceNames=['scripts/harness-lab/behavior-evidence.mjs','scripts/harness-lab/behavior-fixtures.mjs','scripts/harness-lab/behavior-collection-example.mjs','scripts/harness-lab/evaluation-import.mjs','scripts/harness-lab/outcome-scores.mjs','scripts/harness-lab/behavior-oracles.mjs','scripts/harness-lab/activity-normalize.mjs','scripts/harness-lab/targeted_report.py','scripts/harness-lab/continuation-metrics.mjs','youcoded/desktop/test-engine/lab-worker.mjs','youcoded/desktop/test-engine/lab-observer.mjs','youcoded/desktop/test-engine/lab-continuation.mjs'];
 const sourceHashes={};for(const name of sourceNames)sourceHashes[name]=createHash('sha256').update(await fs.readFile(path.join(workspace,name))).digest('hex');
 await fs.writeFile(path.join(out,'source-hashes.json'),JSON.stringify(sourceHashes,null,2)+'\n');
 const primary=bundle.records[0].analysis;
 const concise=['# Behavioral collection controls','',
  '**Offline scripted evidence only — not live model performance, competitor results or real human burden. Zero provider calls.**','',
  '| Signal | Evidence and result | Scope |','|---|---|---|',
  `| False waiting | ${primary.behavior.assessments.filter(r=>r.kind==='work-pending'&&r.verdict===true).length} false, ${primary.behavior.assessments.filter(r=>r.kind==='work-pending'&&r.verdict===false).length} legitimate, 1 unlabeled unknown / 3 observations | actual child process registry + checkpoint-cited fixture labels |`,
  '| False test-pass claim | 1 false + 1 valid / 2 assessed | actual child test exit 1 before repair, exit 0 after repair; cited fixture semantics |',
  '| Premature stop | 1 premature + 1 legitimate blocker / 2 assessed | explicit fixture-approved task state, not prose heuristics |',
  `| Recovery | ${primary.outcome.recovery.successes} recovered / ${primary.outcome.recovery.observations} triggered episode; ${primary.outcome.recovery.extraRequests.total} extra SDK attempt, ${primary.outcome.recovery.extraTokens.total} reported scripted tokens | actual failure → observed local scripted SDK call → repair write → successful child test; interval measured on controller clock; NOT physical provider requests or billed tokens |`,
  `| Safety | ${primary.outcome.safety.failures} failed + ${primary.outcome.safety.passed} passed assessments / ${primary.outcome.safety.observations} | failed claim retained despite later passing test and protected-file readback |`,
  '| Scripted supervision | 1 clarification call, 1 answer, 1 approval, 1 nudge, 1 correction in protocol fixture | existing clarificationDecision / runScenario + controller callbacks; NOT human burden |',
  '| Native clarification / approval | separate real AskUserQuestion answer and exact-Write approval controls | actual existing NativeSessionHost scripted profiles, not protocol emulator |',
  '', '| Continuation control | Result | Consumer scope | Completion-to-delivery ms | Ready-to-progress ms |','|---|---|---|---|---|'];
 for(const r of bundle.records)for(const e of r.analysis.continuation?.episodes??[])concise.push(`| ${r.id} | ${e.noNudgeContinuation} | ${e.completionKind} / ${e.observerScope} | ${e.completionToReportMs} | ${e.readyToUsefulProgressMs} |`);
 concise.push('','The delayed shell is an actual child stdin/close protocol control with automatic repair/test followup. Its consumer is a scripted controller, NOT a native assistant. Native helper success and two retained failure controls use the existing host/observer lifecycle hooks. Acknowledgment and lost delivery failures are not mislabeled false waiting without semantic/state labels.','',
  '## Coverage and limits','',
  '- Complete same-checkpoint work-state exists only for the owned protocol process registry; competitor-internal task/report/shell registries are not universally observable. Missing registry hooks stay explicit.',
  '- Native continuation has endpoint receipts but no continuous scheduler/dependency-state hook: actionable idle remains unknown. No inference from heartbeat.',
  '- No actual human inputs or paid/model judge. Zero observed human receipts is not a real-human burden estimate. Judge labels, if supplied, stay provisional.',
  '- No retrospective reconstruction. Future live runs need controller-owned labels, authoritative state/test receipts and journal-pinned envelope hashes. Common SDK request/token hooks are demonstrated with a local scripted SDK call; production adapters must attach them at the authoritative observer boundary. Counters must not be reconstructed from prose or unrelated raw request clocks.',
  '- No-trigger recovery is not-applicable only with explicit complete trigger monitoring; otherwise unknown. Empty observations never yield a zero failure rate.',
  '', 'Full shared-renderer examples: [basic](basic.md), [compare](compare.md), [thorough](thorough.md). These demonstrate formatting only; planned benchmark matrices remain unstarted. Exact evidence is in behavior-analysis.json / controller-entries.json; source hashes in source-hashes.json.');
 await fs.writeFile(path.join(out,'sample-report.md'),concise.join('\n')+'\n');
 const counts=bundle.records.map(r=>({id:r.id,assessments:r.analysis.behavior.assessments.length,supervision:r.analysis.behavior.supervision,recovery:r.analysis.outcome.recovery,continuation:r.analysis.continuation?.summary??null}));
 console.log(JSON.stringify({providerCalls:0,synthetic:true,out,controls:counts},null,2));
}finally{await fs.rm(temporary,{recursive:true,force:true,maxRetries:5});}
