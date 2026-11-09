#!/usr/bin/env node
// Free, isolated demonstration of actual collectors -> shared analysis -> printed cells.
// NOT an experiment planner or a model-quality comparison. Output must be fresh.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createGateway} from './openrouter-gateway.mjs';
import {importEvaluationEvidence} from './evaluation-import.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const workspace=path.resolve(here,'../..');
const out=path.resolve(process.argv[2]??'');
if(process.argv.length!==3)throw new Error('Usage: node activity-collection-example.mjs NEW_OUTPUT_DIR');
await fs.mkdir(out,{recursive:false});
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'yc-activity-example-'));
const sha=b=>createHash('sha256').update(b).digest('hex');
try{
 const task=path.join(temporary,'task');await fs.mkdir(task);
 const nativeFile=path.join(out,'native-scripted-run.json');
 const launched=spawnSync(process.execPath,[path.join(workspace,'youcoded/desktop/test-engine/lab-runner.mjs'),'--smoke','--smoke-profile','activity-timing','--cwd',task,'--out',nativeFile],{
  encoding:'utf8',timeout:30000,env:{PATH:process.env.PATH,HOME:temporary}});
 if(launched.status!==0)throw new Error('Offline native smoke failed (raw output retained)');
 if(await fs.readFile(path.join(task,'lab-smoke.txt'),'utf8')!=='production host smoke\n')throw new Error('Actual native Write verification failed');
 const nativeBytes=await fs.readFile(nativeFile),native=JSON.parse(nativeBytes);
 const keyFile=path.join(temporary,'key'),ledgerPath=path.join(temporary,'ledger.json');
 await fs.writeFile(keyFile,'offline-unused-test-key',{mode:0o600});
 const token='offline-local-token-never-provider-123456';
 const policy={model:'offline-scripted',provider:'offline-stub',maxOutputTokens:8,maxPromptUsdPerMillion:0,maxCacheWriteUsdPerMillion:0,maxCompletionUsdPerMillion:0,maxContextTokens:1000,reservationUsd:0.01};
 const parts=[{choices:[{index:0,delta:{reasoning:'private synthetic reasoning'}}]},
  {choices:[{index:0,delta:{content:'private answer',tool_calls:[{index:0,function:{arguments:'private arguments'}}]}}]},
  {choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,cost:0}}];
 const wire=parts.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n';
 const gateway=await createGateway({config:{host:'127.0.0.1',port:0,ledgerPath,limitUsd:1,priorUpperUsd:0,tokens:{[token]:{trialId:'offline-gateway',policy,maxRequests:1}}},keyFile,
  transport:async()=>new Response(new ReadableStream({start(c){for(const part of wire.split('\n\n'))if(part)c.enqueue(Buffer.from(part+'\n\n'));c.close();}}),{headers:{'content-type':'text/event-stream'}}),
  usageTransport:async()=>{throw new Error('External billing fetch forbidden');}});
 const savedFetch=globalThis.fetch;
 try{
  const address=await gateway.listen();const response=await savedFetch(`http://127.0.0.1:${address.port}/v1/chat/completions`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({model:policy.model,max_tokens:8,stream:true,messages:[{role:'user',content:'offline fixture'}]})});
  if(await response.text()!==wire)throw new Error('Gateway changed stream bytes');
  await gateway.drain();
 }finally{await gateway.close();}
 const ledger=JSON.parse(await fs.readFile(ledgerPath,'utf8'));const row=ledger.requests[0];
 await fs.writeFile(path.join(out,'gateway-scripted-receipts.json'),JSON.stringify({requestId:row.id,activity:row.activity},null,2)+'\n');
 const bundle=importEvaluationEvidence([{id:'native-control',source:nativeFile,sourceSha256:sha(nativeBytes),raw:native},
  {id:'gateway-control',source:'local-stub-ledger',sourceSha256:sha(JSON.stringify(row.activity)),raw:{steps:[],agent:{name:'gateway-local-stub'},gatewayActivities:[{requestId:row.id,activity:row.activity}]}}]);
 if(bundle.records.some(r=>!r.analysis))throw new Error('Collected evidence import failed');
 const sourceNames=['scripts/harness-lab/activity-capture.schema.json','scripts/harness-lab/activity-evidence.schema.json','scripts/harness-lab/activity-normalize.mjs','scripts/harness-lab/activity-receipts.mjs','scripts/harness-lab/activity-timeline.mjs','scripts/harness-lab/gateway-activity.mjs','scripts/harness-lab/openrouter-gateway.mjs','scripts/harness-lab/targeted_report.py','youcoded/desktop/test-engine/lab-activity.mjs','youcoded/desktop/test-engine/lab-observer.mjs','youcoded/desktop/test-engine/lab-worker.mjs','youcoded/desktop/test-engine/lab-runner.mjs','youcoded/desktop/src/main/harness/activity-diagnostics.ts','youcoded/desktop/src/main/harness/harness-session.ts','youcoded/desktop/src/main/harness/native-session-host.ts'];
 const sourceHashes={};for(const name of sourceNames)sourceHashes[name]=sha(await fs.readFile(path.join(workspace,name)));
 const serialized=JSON.stringify(bundle,null,2)+'\n';
 for(const secret of ['private synthetic reasoning','private arguments','private answer',token,'offline-unused-test-key'])if(serialized.includes(secret))throw new Error('Content leaked into aggregate');
 await fs.writeFile(path.join(out,'activity.json'),serialized);
 const render=spawnSync('python3',['-c',`import sys,json,hashlib
sys.path.insert(0,${JSON.stringify(here)})
from targeted_report import summarize_targeted,render_markdown
payload=json.load(sys.stdin);bundle=payload['bundle']
rows=[dict(id='fixture-'+arm,trialKey=arm,taskId='independent-offline-controls',model='offline-scripted',agent='youcoded',repetition=0,buildVariant=arm) for arm in ('baseline','candidate')]
m=dict(schemaVersion=1,targeted=dict(profile='smoke',sameBuild=True,provider='offline-stub',synthetic=True,buildFingerprints=dict(baseline='a'*64,candidate='a'*64)),trials=rows)
p=summarize_targeted(m,[dict(trialKey='baseline',rewards={'reward':1},infrastructureError=False,interrupted=False)],[])
for trial,record in zip(p['trials'],bundle['records']):trial['activity']=record
p['warnings'].insert(0,'Independent scripted native and gateway controls, NOT paired model runs. Native Write independently checked; gateway has no task-completion verdict. No timing deltas are supportable.')
p['activityEvidenceSchemaVersion']=1;p['analysisSourceSha256']=payload['sourceHashes'];p['analysisPipelineSha256']=hashlib.sha256(json.dumps(payload['sourceHashes'],sort_keys=True).encode()).hexdigest()
print(json.dumps({'summary':p,'markdown':render_markdown(p)}))`],{input:JSON.stringify({bundle,sourceHashes}),encoding:'utf8',cwd:workspace});
 if(render.status!==0)throw new Error(render.stderr);
 const rendered=JSON.parse(render.stdout);
 await fs.writeFile(path.join(out,'report.md'),rendered.markdown);
 await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(rendered.summary,null,2)+'\n');
 await fs.writeFile(path.join(out,'source-hashes.json'),JSON.stringify(sourceHashes,null,2)+'\n');
 console.log(JSON.stringify({providerCalls:0,synthetic:true,nativeWriteVerified:true,nativeReceipts:native.activity.receipts.length,gatewayReceipts:row.activity.receipts.length,out},null,2));
}finally{await fs.rm(temporary,{recursive:true,force:true,maxRetries:5});}
