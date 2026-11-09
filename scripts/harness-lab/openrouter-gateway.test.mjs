import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, chmod, rm, readFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once,EventEmitter} from 'node:events';
import {createGateway,loadPrivateConfig,writeChunk} from './openrouter-gateway.mjs';
import {BudgetLedger} from './budget-ledger.mjs';
import {analyzeActivity} from './activity-normalize.mjs';
import {spawnSync} from 'node:child_process';

const key='sk-canary-not-for-ledger-or-logs';
const policy={model:'qwen/qwen3.8-flash',provider:'pinned-endpoint',maxOutputTokens:8,maxPromptUsdPerMillion:1,maxCompletionUsdPerMillion:1,maxContextTokens:1000,maxCacheWriteUsdPerMillion:1,reservationUsd:0.003};
const request={model:policy.model,max_tokens:4,messages:[{role:'user',content:'canary prompt body'}]};
async function temp(t){const dir=await mkdtemp(join(tmpdir(),'yc-openrouter-'));await chmod(dir,0o700);t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:5}));return dir;}
async function gatewayFixture(t,overrides={}){
 const dir=await temp(t),keyPath=join(dir,'key'),configPath=join(dir,'config.json'),ledgerPath=join(dir,'ledger.json');
 await writeFile(keyPath,key,{mode:0o600});await writeFile(configPath,'{}',{mode:0o600});
 const config={host:'127.0.0.1',port:0,ledgerPath,limitUsd:2,priorUpperUsd:0,tokens:{'yc-gate-trial-secret-token-opaque-123456789':{trialId:'trial-1',policy,maxRequests:4}},...overrides};
 return {dir,keyPath,configPath,ledgerPath,config,stubPort:null};
}
async function listenStub(t,handler){const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));return server;}
async function start(t,fx,options={}){const transport=options.transport??(fx.stubPort?stubTransport(fx):async()=>{throw new Error('No test transport configured');});const gateway=await createGateway({config:fx.config,keyFile:fx.keyPath,transport,usageTransport:options.usageTransport,now:options.now,timeoutMs:options.timeoutMs??2000});await gateway.listen();t.after(()=>gateway.close());fx.gateway=gateway;return `http://127.0.0.1:${gateway.address().port}`;}
function stubTransport(fx){return async({headers,body,signal})=>fetch(`http://127.0.0.1:${fx.stubPort}/api/v1/chat/completions`,{method:'POST',headers,body,signal,redirect:'manual'});}
async function post(base,body=request,token='yc-gate-trial-secret-token-opaque-123456789',headers={}){return fetch(base+'/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...headers},body:JSON.stringify(body)});}

for(const mode of ['deadline','read-error','missing-marker','missing-usage','missing-cost','parser-bound','transport-error','disconnect'])test(`future failure telemetry: ${mode}`,async t=>{
 const fx=await gatewayFixture(t);let reads=0;
 const secret='private exception '+key+' canary prompt body';
 const base=await start(t,fx,{timeoutMs:100,transport:async({signal})=>{
  if(mode==='transport-error')throw new Error(secret,{cause:secret});
  if(mode==='deadline'||mode==='disconnect')return new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('data: {"choices":[]}\n\n'));signal.addEventListener('abort',()=>c.error(new Error(secret)),{once:true});}}),{headers:{'content-type':'text/event-stream'}});
  if(mode==='read-error')return new Response(new ReadableStream({pull(c){if(reads++===0)c.enqueue(Buffer.from('data: {"choices":[]}\n\n'));else c.error(new Error(secret));}}),{headers:{'content-type':'text/event-stream'}});
  const wire=mode==='parser-bound'?'x'.repeat(70*1024):mode==='missing-usage'?'data: [DONE]\n\n':`data: {"usage":{"prompt_tokens":1${mode==='missing-cost'?'':',"cost":0.0001'}}}\n\n${mode==='missing-marker'?'':'data: [DONE]\n\n'}`;
  return new Response(wire,{headers:{'content-type':'text/event-stream','x-private-header':secret}});
 }});
 const response=await post(base,{...request,stream:true}).catch(error=>{if(mode!=='parser-bound')throw error;return null;});
 if(mode==='disconnect'){const reader=response.body.getReader();await reader.read();await reader.cancel();}else await response?.text().catch(()=>{});
 await fx.gateway.drain();
 const stored=await readFile(fx.ledgerPath,'utf8'),state=JSON.parse(stored),row=state.requests[0];
 assert.equal(row.status,mode==='transport-error'?'upstream-error':'unknown');
 assert.equal(row.failureReason,({'deadline':'upstream-deadline','read-error':'upstream-read-error','missing-marker':'missing-terminal-marker','missing-usage':'missing-usage','disconnect':'downstream-disconnect'})[mode]??'unknown');
 assert.equal(row.responseStarted,mode!=='transport-error');assert.ok(Number.isFinite(row.durationMs)&&row.durationMs>=0);
 assert.equal(row.activity.receipts.at(-1).kind,'request-end');
 assert.equal(row.activity.observation.status,['deadline','disconnect'].includes(mode)?'interrupted':['missing-marker','missing-usage'].includes(mode)?'incomplete':mode==='missing-cost'?'completed':'failed');
 assert.equal(state.chargedUsd,policy.reservationUsd);assert.equal(state.reservedUsd,0);assert.equal(state.schemaVersion,1);
 for(const value of [key,'canary prompt body','private exception','x-private-header','yc-gate-trial-secret-token'])assert.equal(stored.includes(value),false);
 await fx.gateway.close();const reopened=await BudgetLedger.open({path:fx.ledgerPath,limitUsd:2,priorUpperUsd:0});
 try{assert.deepEqual(reopened.snapshot(),state);}finally{await reopened.close();}
});

for(const mode of ['transport-error','read-error'])test(`request end precedes retained-ledger persistence: ${mode}`,async t=>{
 const fx=await gatewayFixture(t);
 const base=await start(t,fx,{transport:async()=>{
  if(mode==='transport-error')throw new Error('controlled transport failure');
  return new Response(new ReadableStream({pull(c){c.error(new Error('controlled read failure'));}}),{headers:{'content-type':'text/event-stream'}});
 }});
 let entered,release,retainAt;
 const reached=new Promise(resolve=>{entered=resolve;});const gate=new Promise(resolve=>{release=resolve;});
 const original=fx.gateway.ledger.retain.bind(fx.gateway.ledger);
 fx.gateway.ledger.retain=async(...args)=>{retainAt=performance.now();entered();await gate;return original(...args);};
 const response=post(base,{...request,stream:true}).then(r=>r.text()).catch(()=>{});
 await reached;release();await response;await fx.gateway.drain();
 const row=JSON.parse(await readFile(fx.ledgerPath,'utf8')).requests[0];
 const end=row.activity.receipts.find(r=>r.kind==='request-end');
 assert.ok(end.at<=retainAt,'request-end must be observed before retention begins, not after fsync');
});

for(const anthropic of [false,true])test(`durable content-free stream activity mapping (${anthropic?'messages':'chat'})`,async t=>{
 const fx=await gatewayFixture(t);if(anthropic)Object.values(fx.config.tokens)[0].protocol='anthropic-messages';
 const parts=anthropic?[
  {type:'content_block_start',index:0,content_block:{type:'thinking',thinking:''}},
  {type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'secret-thought'}},
  {type:'content_block_stop',index:0},
  {type:'content_block_start',index:1,content_block:{type:'tool_use',name:'private-tool',input:{}}},
  {type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'secret-args'}},
  {type:'content_block_stop',index:1},
  {type:'message_delta',usage:{input_tokens:1,output_tokens:1,cost:0.0001}}, {type:'message_stop'}
 ]:[{choices:[{index:0,delta:{reasoning:'secret-thought'}}]},
 {choices:[{index:0,delta:{content:'secret-answer',tool_calls:[{index:0,function:{arguments:'secret-args'}}]}}]},
 {choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,cost:0.0001}}];
 const wire=parts.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+(anthropic?'':'data: [DONE]\n\n');
 const base=await start(t,fx,{transport:async()=>new Response(wire,{headers:{'content-type':'text/event-stream'}})});
 const response=await fetch(base+(anthropic?'/v1/messages':'/v1/chat/completions'),{method:'POST',headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789','content-type':'application/json'},body:JSON.stringify({...request,stream:true})});
 assert.equal(response.status,200);assert.equal(await response.text(),wire);await fx.gateway.drain();
 const state=JSON.parse(await readFile(fx.ledgerPath,'utf8')),row=state.requests[0],a=row.activity;
 assert.equal(a.clock.kind,'monotonic-ms');assert.equal(a.receipts[0].requestId,row.id);
 assert.equal(a.observation.status,'completed');assert.ok(a.receipts.some(r=>r.phase==='reasoning-stream'&&r.kind==='phase-delta'));
 assert.ok(a.receipts.some(r=>r.phase==='tool-argument-stream'&&r.kind==='phase-end'));
 assert.equal(a.receipts.at(-1).kind,'request-end');assert.equal(JSON.stringify(a).includes('secret'),false);
 const analysis=analyzeActivity({steps:[],agent:{name:anthropic?'claude-code':'pi'},gatewayActivities:[{requestId:row.id,activity:a}]});
 assert.equal(analysis.gatewayActivity[0].analysis.coverage,'measured');
 assert.equal(analysis.gatewayActivity[0].analysis.clock.id,a.clock.id);
 assert.ok(analysis.gatewayActivity[0].analysis.timelines.parent.laneUnionMs['reasoning-stream']>=0);
 assert.equal(analysis.timeline.coverage,'unsupported'); // no cross-clock/event-time fiction
 const printed=spawnSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts/harness-lab');from test_targeted_report import fixture;from targeted_report import summarize_targeted,render_markdown;m,a,r=fixture();p=summarize_targeted(m,a,r);p['trials'][0]['activity']={'analysis':json.load(sys.stdin)};print(render_markdown(p))"],{input:JSON.stringify(analysis),encoding:'utf8'});
 assert.equal(printed.status,0,printed.stderr);assert.ok(printed.stdout.includes('| baseline | '+row.id+' |'));
 await fx.gateway.close();const reopened=await BudgetLedger.open({path:fx.ledgerPath,limitUsd:2,priorUpperUsd:0});
 try{assert.deepEqual(reopened.snapshot().requests[0].activity,a);}finally{await reopened.close();}
});

test('invalid or conflicting grant scopes fail before key access or transport',async t=>{
 const fx=await gatewayFixture(t);const grant=Object.values(fx.config.tokens)[0];let calls=0;
 for(const budgetScope of [null,{}, {id:'bad scope',limitUsd:1},{id:'a'.repeat(129),limitUsd:1},{id:'valid',limitUsd:0},{id:'valid',limitUsd:1,secret:'private'}]){
  const config={...fx.config,tokens:{'opaque-token-at-least-24-characters':{...grant,budgetScope}}};
  await assert.rejects(createGateway({config,keyFile:join(fx.dir,'does-not-exist'),transport:()=>{calls++;},usageTransport:()=>{calls++;}}),/scope/i);
 }
 for(const second of [{...grant,trialId:'different-trial',budgetScope:{id:'same',limitUsd:2}},{...grant,budgetScope:undefined},{...grant,budgetScope:{id:'other',limitUsd:1}}]){
  const config={...fx.config,tokens:{'opaque-token-one-at-least-24':{...grant,budgetScope:{id:'same',limitUsd:1}},'opaque-token-two-at-least-24':second}};
  await assert.rejects(createGateway({config,keyFile:join(fx.dir,'does-not-exist'),transport:()=>{calls++;}}),/scope/i);
 }
 assert.equal(calls,0);assert.equal(await readFile(fx.ledgerPath,'utf8').then(()=>true,()=>false),false);
});

test('gateway forwards grant scope and rejects exhausted scope before provider transport',async t=>{
 const fx=await gatewayFixture(t);const grant=Object.values(fx.config.tokens)[0];grant.budgetScope={id:'paired-scope',limitUsd:policy.reservationUsd};let calls=0;
 const base=await start(t,fx,{transport:async()=>{calls++;throw new Error('synthetic unknown charge');}});
 assert.equal((await post(base)).status,502);assert.equal((await post(base)).status,402);assert.equal(calls,1);
 const state=JSON.parse(await readFile(fx.ledgerPath,'utf8'));assert.deepEqual(state.budgetScopes,{'paired-scope':policy.reservationUsd});assert.equal(state.requests[0].budgetScopeId,'paired-scope');assert.equal(state.closed,false);
});

test('estimated mode refreshes fixed key usage before admitting and persists estimate basis',async t=>{
 const fx=await gatewayFixture(t,{accountingMode:'estimated',externalPriorUsd:0,priorUpperUsd:0,limitUsd:2});let billingCalls=0;
 const base=await start(t,fx,{usageTransport:async({url,headers})=>{billingCalls++;assert.equal(url,'https://openrouter.ai/api/v1/key');assert.equal(headers.authorization,`Bearer ${key}`);return new Response(JSON.stringify({data:{usage:0.1}}),{status:200});},transport:async()=>new Response(JSON.stringify({choices:[],usage:{cost:0.0001}}),{headers:{'content-type':'application/json'}})});
 const response=await post(base);assert.equal(response.status,200);const state=JSON.parse(await readFile(fx.ledgerPath,'utf8'));assert.equal(billingCalls,1);assert.equal(state.accountingMode,'estimated');assert.ok(state.requests[0].estimateBasis.inputBytes>0);assert.ok(state.requests[0].estimateUsd>0);
});

test('estimated billing refresh failures fail closed and release startup locks',async t=>{
 const fx=await gatewayFixture(t,{accountingMode:'estimated',externalPriorUsd:0,priorUpperUsd:0});
 await assert.rejects(createGateway({config:fx.config,keyFile:fx.keyPath,usageTransport:async({signal})=>{assert.ok(signal instanceof AbortSignal);throw new Error('offline');}}));
 assert.equal(await readFile(fx.ledgerPath+'.lock','utf8').then(()=>true,()=>false),false);
 let time=40_000,calls=0;const base=await start(t,fx,{now:()=>time,usageTransport:async()=>{calls++;if(calls>1)throw new Error('offline');return new Response(JSON.stringify({data:{usage:0}}));},transport:async()=>new Response(JSON.stringify({choices:[],usage:{cost:0.0001}}),{headers:{'content-type':'application/json'}})});
 time+=30_000;const req=await post(base);assert.equal(req.status,503);assert.match((await req.json()).error.message,/billing verification.*no provider call/i);assert.equal(calls,2);
});

test('simultaneous due billing refreshes share one bounded metadata request',async t=>{
 const fx=await gatewayFixture(t,{accountingMode:'estimated',externalPriorUsd:0,priorUpperUsd:0});let time=50_000,calls=0,release;const wait=new Promise(resolve=>release=resolve);
 const base=await start(t,fx,{now:()=>time,usageTransport:async({signal})=>{calls++;assert.ok(signal instanceof AbortSignal);if(calls>1)await wait;return new Response(JSON.stringify({data:{usage:0}}));},transport:async()=>new Response(JSON.stringify({choices:[],usage:{cost:0.0001}}),{headers:{'content-type':'application/json'}})});
 time+=30_000;const one=post(base),two=post(base);while(calls<2)await new Promise(resolve=>setImmediate(resolve));release();const responses=await Promise.all([one,two]);assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(calls,2);
});

test('SSE accounting is independent of transport chunk grouping',async t=>{
 const fx=await gatewayFixture(t);
 const wire='data: {"choices":[]}\n\n'.repeat(4000)+'data: {"usage":{"prompt_tokens":3,"completion_tokens":2,"cost":0.0001}}\n\ndata: [DONE]\n\n';
 let small=false;
 const base=await start(t,fx,{transport:async()=>new Response(new ReadableStream({start(c){const bytes=Buffer.from(wire);for(let i=0;i<bytes.length;i+=small?127:bytes.length)c.enqueue(bytes.subarray(i,i+(small?127:bytes.length)));c.close();}}),{headers:{'content-type':'text/event-stream'}})});
 for(const grouped of [false,true]){small=grouped;const response=await post(base,{...request,stream:true});assert.equal(await response.text(),wire);}
 await fx.gateway.drain(); // final diagnostic persistence follows downstream EOF
 const ledger=JSON.parse(await readFile(fx.ledgerPath,'utf8'));
 assert.equal(ledger.requests.length,2);assert.equal(ledger.chargedUsd,0.0002);
 assert.deepEqual(ledger.requests[0].usage,ledger.requests[1].usage);
 const a=analyzeActivity({steps:[],agent:{name:'local-two-requests'},gatewayActivities:ledger.requests.map(r=>({requestId:r.id,activity:r.activity}))});
 assert.equal(a.gatewayCohorts.length,1);assert.equal(a.gatewayCohorts[0].analysis.requestGaps.length,1);
 assert.ok(a.gatewayCohorts[0].analysis.requestGaps[0].gapMs>=0);
});

test('SSE rejects oversized individual lines even when split into small chunks',async t=>{
 const fx=await gatewayFixture(t);
 const base=await start(t,fx,{transport:async()=>new Response(new ReadableStream({start(c){for(let i=0;i<70;i++)c.enqueue(Buffer.from('x'.repeat(1024)));c.enqueue(Buffer.from('\n'));c.close();}}),{headers:{'content-type':'text/event-stream'}})});
 const response=await post(base,{...request,stream:true});await response.text().catch(()=>{});
 const ledger=JSON.parse(await readFile(fx.ledgerPath,'utf8'));assert.equal(ledger.requests[0].status,'unknown');
});

test('abort releases a stalled downstream backpressure wait',async()=>{
 const response=new EventEmitter();response.write=()=>false;
 const controller=new AbortController();
 const waiting=writeChunk(response,Buffer.from('data'),controller.signal);
 controller.abort();
 await assert.rejects(waiting,/abort/i);
 assert.equal(response.listenerCount('drain'),0);assert.equal(response.listenerCount('close'),0);
});
test('permanent budget exhaustion is not advertised as retryable provider rate limiting',async t=>{
 const fx=await gatewayFixture(t,{limitUsd:0.003});let calls=0;
 const base=await start(t,fx,{transport:async()=>{calls++;return new Response('unavailable',{status:503});}});
 const first=await post(base);assert.equal(first.status,503);
 const second=await post(base);assert.equal(second.status,402);
 assert.match((await second.json()).error.message,/no provider call/i);assert.equal(calls,1);
});

test('upstream rate-limit retry timing is preserved for native client recovery',async t=>{
 const fx=await gatewayFixture(t);
 const base=await start(t,fx,{transport:async()=>new Response('private error body',{status:429,headers:{'retry-after':'2'}})});
 const response=await post(base);assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'2');
 assert.equal((await response.text()).includes('private error body'),false);
});

test('opt-in private diagnostics retain bounded upstream messages with credentials redacted',async t=>{
 const fx=await gatewayFixture(t);fx.config.captureErrorDiagnostics=true;
 const base=await start(t,fx,{transport:async()=>new Response(JSON.stringify({error:{message:'Provider rejected request '+key,code:400,metadata:{raw:JSON.stringify({error:{message:'Missing reasoning_content'}})}}}),{status:400})});
 const response=await post(base);assert.equal(response.status,400);await response.text();
 const stored=await readFile(fx.ledgerPath,'utf8');assert.equal(stored.includes(key),false);
 const diagnostic=JSON.parse(stored).requests[0].upstreamDiagnostic;
 assert.match(diagnostic.message,/Provider rejected/);assert.match(diagnostic.detail,/Missing reasoning_content/);
 assert.equal(JSON.stringify(diagnostic).includes(key),false);
});

test('opt-in policy diagnostics expose a fixed rejection reason, not request content',async t=>{
 const fx=await gatewayFixture(t,{captureErrorDiagnostics:true});const base=await start(t,fx);
 const response=await post(base,{...request,max_tokens:0});const text=await response.text();
 assert.equal(response.status,400);assert.match(text,/Explicit positive output-token limit required/);assert.equal(text.includes('canary prompt body'),false);
});

test('native content rejection diagnostics expose block types but no text or tool arguments',async t=>{
 const fx=await gatewayFixture(t,{captureErrorDiagnostics:true});Object.values(fx.config.tokens)[0].protocol='anthropic-messages';const base=await start(t,fx);
 const body={...request,messages:[{role:'user',content:[{type:'tool_reference',tool_name:'secret-name'}]}]};
 const response=await fetch(base+'/v1/messages',{method:'POST',headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789','content-type':'application/json'},body:JSON.stringify(body)});const text=await response.text();
 assert.equal(response.status,400);assert.match(text,/tool_reference/);assert.equal(text.includes('secret-name'),false);
});

test('Anthropic route requires its scoped token and preserves native streaming usage',async t=>{
 const fx=await gatewayFixture(t);const grant=Object.values(fx.config.tokens)[0];grant.protocol='anthropic-messages';
 const body={model:policy.model,max_tokens:4,stream:true,messages:[{role:'user',content:'hello'}],tools:[{name:'read',input_schema:{type:'object'}}]};
 let seen;const base=await start(t,fx,{transport:async request=>{seen=request;return new Response('data: '+JSON.stringify({type:'message_start',message:{usage:{input_tokens:3,cache_read_input_tokens:5,cache_creation_input_tokens:0}}})+'\n\ndata: '+JSON.stringify({type:'message_delta',usage:{output_tokens:2,cost:0.0001}})+'\n\ndata: {"type":"message_stop"}\n\n',{headers:{'content-type':'text/event-stream'}});}});
 const wrong=await post(base);assert.equal(wrong.status,400);assert.equal(seen,undefined);
 const response=await fetch(base+'/v1/messages',{method:'POST',headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789','content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);await response.text();
 assert.equal(seen.url,'https://openrouter.ai/api/v1/messages');assert.equal(JSON.parse(seen.body).tools[0].name,'read');
 const row=fx.gateway.ledger.snapshot().requests[0];assert.equal(row.actualCostUsd,0.0001);assert.equal(row.usage.inputTokens,8);assert.equal(row.usage.outputTokens,2);assert.equal(row.requestControls.protocol,'anthropic-messages');assert.equal(row.requestControls.thinkingType,null);
});

test('reservation telemetry records normalized allowlisted controls and never request content',async t=>{
 const fx=await gatewayFixture(t);const base=await start(t,fx,{transport:async()=>new Response(JSON.stringify({usage:{cost:0.0001}}),{headers:{'content-type':'application/json'}})});
 const body={...request,max_tokens:99,temperature:0.25,top_p:0.8,reasoning:{enabled:true,effort:'high',max_tokens:3},prompt:'secret prompt field',tools:[{type:'function',function:{name:'private tool',parameters:{secret:'schema'}}}]};const response=await post(base,body);assert.equal(response.status,200);
 const stored=await readFile(fx.ledgerPath,'utf8'),controls=JSON.parse(stored).requests[0].requestControls;
 assert.deepEqual(controls,{protocol:'openai-chat',requestedMaxOutputTokens:99,effectiveMaxOutputTokens:8,temperature:0.25,top_p:0.8,reasoningEnabled:true,reasoningEffort:'high',topLevelReasoningEffort:null,reasoningMaxTokens:3,thinkingType:null,thinkingBudgetTokens:null,outputConfigEffort:null,model:policy.model,provider:policy.provider});
 for(const secret of ['canary prompt body','secret prompt field','private tool','sk-canary','yc-gate-trial-secret-token'])assert.equal(stored.includes(secret),false);
});

test('telemetry distinguishes top-level and nested reasoning effort and captures current protocol enums',async t=>{
 const fx=await gatewayFixture(t);const base=await start(t,fx,{transport:async()=>new Response(JSON.stringify({usage:{cost:0.0001}}),{headers:{'content-type':'application/json'}})});
 const send=body=>post(base,body);
 await send({...request,reasoning_effort:'high',reasoning:{effort:'low'}});
 await send({...request,reasoning_effort:'arbitrary-secret-value',reasoning:{effort:'none'}});
 const rows=fx.gateway.ledger.snapshot().requests;
 assert.equal(rows[0].requestControls.topLevelReasoningEffort,'high');assert.equal(rows[0].requestControls.reasoningEffort,'low');
 assert.equal(rows[1].requestControls.topLevelReasoningEffort,null);assert.equal(rows[1].requestControls.reasoningEffort,'none');
 const grant=Object.values(fx.config.tokens)[0];grant.protocol='anthropic-messages';
 await fetch(base+'/v1/messages',{method:'POST',headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789','content-type':'application/json'},body:JSON.stringify({model:policy.model,max_tokens:4,messages:[{role:'user',content:'hello'}],thinking:{type:'adaptive',budget_tokens:128}})});
 await fetch(base+'/v1/messages',{method:'POST',headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789','content-type':'application/json'},body:JSON.stringify({model:policy.model,max_tokens:4,messages:[{role:'user',content:'hello'}],thinking:{type:'arbitrary-secret-type',budget_tokens:128}})});
 const nativeRows=fx.gateway.ledger.snapshot().requests.slice(2);
 assert.equal(nativeRows[0].requestControls.thinkingType,'adaptive');assert.equal(nativeRows[0].requestControls.thinkingBudgetTokens,128);
 assert.equal(nativeRows[1].requestControls.thinkingType,null);assert.equal(nativeRows[1].requestControls.thinkingBudgetTokens,128);
 const stored=await readFile(fx.ledgerPath,'utf8');assert.equal(stored.includes('arbitrary-secret-value'),false);assert.equal(stored.includes('arbitrary-secret-type'),false);
});

test('Anthropic token usage is retained even when the provider omits billed cost',async t=>{
 const fx=await gatewayFixture(t);Object.values(fx.config.tokens)[0].protocol='anthropic-messages';
 const base=await start(t,fx,{transport:async()=>new Response(JSON.stringify({usage:{input_tokens:3,cache_read_input_tokens:5,output_tokens:2}}),{headers:{'content-type':'application/json'}})});
 const response=await fetch(base+'/v1/messages',{method:'POST',headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789','content-type':'application/json'},body:JSON.stringify(request)});await response.text();
 const row=fx.gateway.ledger.snapshot().requests[0];assert.equal(row.actualCostUsd,null);assert.equal(row.status,'unknown');assert.equal(row.usage.inputTokens,8);assert.equal(row.usage.providerCostUsd,null);
});

test('complete SSE terminal line at EOF without a trailing newline preserves usage',async t=>{
 const fx=await gatewayFixture(t);const base=await start(t,fx,{transport:async()=>new Response('data: {"usage":{"prompt_tokens":3,"completion_tokens":1,"cost":0.0001}}\n\ndata: [DONE]',{headers:{'content-type':'text/event-stream'}})});
 const response=await post(base,{...request,stream:true});await response.text();assert.equal(fx.gateway.ledger.snapshot().requests[0].actualCostUsd,0.0001);
});

test('Claude Code native beta messages path is accepted but arbitrary query parameters are refused',async t=>{
 const fx=await gatewayFixture(t);Object.values(fx.config.tokens)[0].protocol='anthropic-messages';let calls=0;
 const base=await start(t,fx,{transport:async()=>{calls++;return new Response(JSON.stringify({usage:{input_tokens:3,output_tokens:1,cost:0.0001}}),{headers:{'content-type':'application/json'}});}});
 const send=path=>fetch(base+path,{method:'POST',headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789','content-type':'application/json'},body:JSON.stringify(request)});
 const good=await send('/v1/messages?beta=true');assert.equal(good.status,200);await good.text();assert.equal((await send('/v1/messages?url=http://elsewhere')).status,404);assert.equal(calls,1);
});

test('network-wide binding requires explicit opt-in',async t=>{
 const fx=await gatewayFixture(t,{host:'0.0.0.0'});
 await assert.rejects(createGateway({config:fx.config,keyFile:fx.keyPath}),/network/i);
});

 test('policy blocks model changes, plugins and fallback fields before upstream',async t=>{
  let calls=0;const fx=await gatewayFixture(t);const base=await start(t,fx,{transport:async()=>{calls++;throw new Error('unexpected');}});
  for(const bad of [{...request,model:'other/model'},{...request,plugins:[{id:'web'}]},{...request,models:['other/model']},{...request,transforms:['middle-out']}]){
   const response=await post(base,bad);assert.equal(response.status,400);
  }
  assert.equal(calls,0);
 });

test('accepts only exact POST routes, requires opaque token, rejects redirect and hides key',async t=>{
 let headers;
 const stub=await listenStub(t,(req,res)=>{headers=req.headers;res.writeHead(302,{location:'http://127.0.0.1:1/steal'});res.end('no');});
 const fx=await gatewayFixture(t);fx.stubPort=stub.address().port;const base=await start(t,fx);
 const unauth=await post(base,request,'wrong');assert.equal(unauth.status,401);
 const route=await fetch(base+'/v1/models',{method:'POST',headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789'}});assert.equal(route.status,404);
 const query=await fetch(base+'/v1/chat/completions?url=http://127.0.0.1',{method:'POST',headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789','content-type':'application/json'},body:JSON.stringify(request)});assert.equal(query.status,404);
 assert.ok(stub);
 const response=await post(base);assert.equal(response.status,502);
 assert.equal(headers.authorization,`Bearer ${key}`);
 const output=JSON.stringify(fx.config);assert.equal(output.includes(key),false);
 const stored=await readFile(fx.ledgerPath,'utf8');assert.equal(stored.includes(key),false);assert.equal(stored.includes('canary prompt body'),false);
 });

test('accepts text content parts used by native SDKs but rejects image parts',async t=>{
 const fx=await gatewayFixture(t);let calls=0;
 const base=await start(t,fx,{transport:async()=>{calls++;return new Response(JSON.stringify({choices:[],usage:{prompt_tokens:3,completion_tokens:1,cost:0.0001}}),{headers:{'content-type':'application/json'}});}});
 const response=await post(base,{...request,messages:[{role:'user',content:[{type:'text',text:'hello'}]}]});
 assert.equal(response.status,200);await response.text();
 const image=await post(base,{...request,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://example.com/image'}}]}]});
 assert.equal(image.status,400);assert.equal(calls,1);
});

test('actual JSON provider cost settles exactly once and normalized cache usage is durable',async t=>{
 const stub=await listenStub(t,(req,res)=>{assert.equal(req.url,'/api/v1/chat/completions');assert.equal(req.headers.authorization,`Bearer ${key}`);let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{const forwarded=JSON.parse(raw);assert.equal(forwarded.model,policy.model);assert.equal(forwarded.provider.order[0],policy.provider);assert.equal(forwarded.max_tokens,4);res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'ok'}}],usage:{prompt_tokens:3,completion_tokens:2,prompt_tokens_details:{cached_tokens:1},cost:0.0002}}));});});
 const fx=await gatewayFixture(t);fx.stubPort=stub.address().port;const base=await start(t,fx);
 const response=await post(base);assert.equal(response.status,200);const ledger=JSON.parse(await readFile(fx.ledgerPath,'utf8'));assert.equal(ledger.requests[0].actualCostUsd,0.0002);assert.equal(ledger.requests[0].usage.cacheReadTokens,1);assert.deepEqual(ledger.requests[0].requestControls,{protocol:'openai-chat',requestedMaxOutputTokens:4,effectiveMaxOutputTokens:4,temperature:null,top_p:null,reasoningEnabled:null,reasoningEffort:null,topLevelReasoningEffort:null,reasoningMaxTokens:null,thinkingType:null,thinkingBudgetTokens:null,outputConfigEffort:null,model:policy.model,provider:policy.provider});assert.equal(ledger.requests[0].requestControls.model,policy.model);
 });

test('injectable local transport parses complete JSON cost, and keeps failure reservation',async t=>{
 const fx=await gatewayFixture(t);let seen;
 const base=await start(t,fx,{transport:async({url,headers,body,signal})=>{seen={url,headers,body:JSON.parse(body),signal};return new Response(JSON.stringify({choices:[{message:{content:'ok'}}],usage:{prompt_tokens:3,completion_tokens:2,prompt_tokens_details:{cached_tokens:1},cost:0.0002}}),{status:200,headers:{'content-type':'application/json'}});}});
 const response=await post(base);assert.equal(response.status,200);assert.equal((await response.json()).choices[0].message.content,'ok');
 assert.equal(seen.url,'https://openrouter.ai/api/v1/chat/completions');assert.deepEqual(Object.keys(seen.headers).sort(),['accept','authorization','content-type']);assert.equal(seen.headers.authorization,`Bearer ${key}`);assert.equal(seen.body.provider.order[0],policy.provider);
 const ledger=JSON.parse(await readFile(fx.ledgerPath,'utf8'));assert.equal(ledger.requests.length,1);assert.equal(ledger.requests[0].model,policy.model);assert.equal(ledger.requests[0].provider,policy.provider);assert.equal(ledger.requests[0].actualCostUsd,0.0002);assert.equal(ledger.requests[0].usage.cacheReadTokens,1);assert.equal(ledger.reservedUsd,0);
 });

test('missing cost and non-200 retain reservation; malformed request never spends',async t=>{
 const fx=await gatewayFixture(t);let count=0;
 const base=await start(t,fx,{transport:async()=>{count++;return count===1?new Response(JSON.stringify({choices:[],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200,headers:{'content-type':'application/json'}}):new Response('private provider error',{status:429});}});
 const first=await post(base);assert.equal(first.status,200);const second=await post(base);assert.equal(second.status,429);
 const malformed=await post(base,{model:policy.model,max_tokens:1,messages:[],plugins:[{}]});assert.equal(malformed.status,400);
 const ledger=JSON.parse(await readFile(fx.ledgerPath,'utf8'));assert.equal(ledger.requests.length,2);assert.equal(ledger.requests[0].status,'unknown');assert.equal(ledger.requests[0].actualCostUsd,null);assert.equal(ledger.requests[1].status,'upstream-error');assert.equal(ledger.requests[1].upstreamStatus,429);assert.equal(ledger.reservedUsd,0);assert.equal(ledger.chargedUsd,policy.reservationUsd*2);
 });

test('SSE streams promptly but settles only after a terminal completion marker',async t=>{
 const stub=await listenStub(t,(req,res)=>{res.setHeader('content-type','text/event-stream');res.flushHeaders();res.write('data: {"choices":[{"delta":{"content":"first"}}]}\n\n');setTimeout(()=>{res.write('data: {"usage":{"prompt_tokens":2,"completion_tokens":1,"cost":0.0001},"choices":[{"delta":{}}]}\n\n');res.end('data: [DONE]\n\n');},40);});
 const fx=await gatewayFixture(t);fx.stubPort=stub.address().port;const base=await start(t,fx);
 const response=await post(base,{...request,stream:true});assert.equal(response.status,200);const streamReader=response.body.getReader();const first=await streamReader.read();assert.equal(first.done,false);assert.match(new TextDecoder().decode(first.value),/first/);let tail='';for(;;){const part=await streamReader.read();if(part.done)break;tail+=new TextDecoder().decode(part.value);}assert.match(tail,/DONE/);await fx.gateway.drain();const sseLedger=JSON.parse(await readFile(fx.ledgerPath,'utf8'));assert.equal(sseLedger.requests[0].status,'settled');assert.equal(sseLedger.requests[0].actualCostUsd,0.0001);
 const interrupted=await listenStub(t,(req,res)=>{res.setHeader('content-type','text/event-stream');res.flushHeaders();res.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');res.write('data: {"usage":{"prompt_tokens":2,"completion_tokens":1,"cost":0.0001}}\n\n');});
 const fx2=await gatewayFixture(t);fx2.stubPort=interrupted.address().port;const interruptBase=await start(t,fx2,{},);
 const controller=new AbortController();const pending=fetch(interruptBase+'/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{authorization:'Bearer yc-gate-trial-secret-token-opaque-123456789','content-type':'application/json'},body:JSON.stringify(request)});const upstreamStarted=once(interrupted,'request');await upstreamStarted;controller.abort();await assert.rejects(pending);await new Promise(resolve=>setImmediate(resolve));await fx2.gateway.drain();const interruptedLedger=JSON.parse(await readFile(fx2.ledgerPath,'utf8'));assert.equal(interruptedLedger.requests[0].status,'unknown');assert.equal(interruptedLedger.requests[0].actualCostUsd,null);
 });

test('oversized request, insecure key/config and insufficient reservation are rejected',async t=>{
 const fx=await gatewayFixture(t);await chmod(fx.configPath,0o600);await chmod(fx.keyPath,0o644);
 await assert.rejects(createGateway({config:fx.config,keyFile:fx.keyPath,transport:async()=>new Response()}),/private/i);
 await assert.rejects(loadPrivateConfig(fx.configPath),/Invalid gateway config/i);
 await chmod(fx.configPath,0o644);
 await assert.rejects(loadPrivateConfig(fx.configPath),/private/i);
 await chmod(fx.configPath,0o600);
 await chmod(fx.keyPath,0o600);
 await assert.rejects(createGateway({config:fx.config,keyFile:join(fx.dir,'missing'),transport:async()=>new Response()}));
 const invalidConfig={...fx.config,port:-1};
 await assert.rejects(createGateway({config:invalidConfig,keyFile:fx.keyPath,transport:async()=>new Response()}),/Invalid gateway config/i);
 const unsafe={...fx.config,tokens:{'yc-gate-trial-secret-token-opaque-123456789':{trialId:'trial',policy:{...policy,reservationUsd:0.000001},maxRequests:2}}};
 await assert.rejects(createGateway({config:unsafe,keyFile:fx.keyPath,transport:async()=>new Response()}),/reservation/i);
 });
