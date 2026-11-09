import {createServer} from 'node:http';
import {readFile,lstat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {StringDecoder} from 'node:string_decoder';
import {randomUUID} from 'node:crypto';
import {createGatewayActivity} from './gateway-activity.mjs';
import {guardOpenRouterRequest,normalizeOpenRouterUsage,guardAnthropicMessages,normalizeAnthropicUsage} from './openrouter-policy.mjs';
import {BudgetLedger,validateBudgetScope} from './budget-ledger.mjs';
import {upstreamDiagnostic} from './upstream-diagnostic.mjs';

const UPSTREAM='https://openrouter.ai/api/v1/chat/completions';
const ALLOWED=new Set(['/v1/chat/completions','/api/v1/chat/completions','/v1/messages','/api/v1/messages','/v1/messages?beta=true','/api/v1/messages?beta=true']);
const MESSAGES_UPSTREAM='https://openrouter.ai/api/v1/messages';
// WHY: identify local integration failures without echoing prompts or arbitrary exception text.
const SAFE_POLICY_ERRORS=new Set(['Unapproved model','Fallback model/router/preset is forbidden','Paid plugins and prompt transforms are forbidden','Messages array required','Only text generation without server search/audio/image features is allowed','Explicit positive output-token limit required','Multiple completions are forbidden','Premium service tiers are forbidden','Only text system content allowed','Only text and native custom tool messages allowed','Only custom function tools allowed','Deferred server tool protocol is not enabled','Optional feature fields refused']);
const MAX_BODY=2*1024*1024, MAX_RESPONSE=2*1024*1024, DEFAULT_TIMEOUT=120_000, RESERVATION_SAFETY=1.1;
const usd=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const privateFile=async path=>{if(!isAbsolute(path))throw new Error('Config and key paths must be absolute');const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0)throw new Error('Config and key files must be regular private files (mode 600)');};
const requestError=(res,status,message,headers={})=>{if(!res.headersSent){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify({error:{message}}));}else res.destroy();};
// WHY: ledger telemetry is a fixed primitive-only allowlist; never retain caller-controlled strings or objects.
function requestControls(guarded,anthropic,policy){
 const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
 const reasoning=guarded.body.reasoning;
 const effort=reasoning&&typeof reasoning==='object'&&typeof reasoning.effort==='string'&&['none','minimal','low','medium','high','xhigh'].includes(reasoning.effort)?reasoning.effort:null;
 const topLevelReasoningEffort=['none','minimal','low','medium','high','xhigh'].includes(guarded.body.reasoning_effort)?guarded.body.reasoning_effort:null;
 const nativeEffort=guarded.body.output_config?.effort;
 return {protocol:anthropic?'anthropic-messages':'openai-chat',requestedMaxOutputTokens:guarded.record.requestedMaxTokens,effectiveMaxOutputTokens:guarded.record.effectiveMaxTokens,
 temperature:finite(guarded.body.temperature),top_p:finite(guarded.body.top_p),reasoningEnabled:typeof reasoning?.enabled==='boolean'?reasoning.enabled:null,reasoningEffort:effort,topLevelReasoningEffort,
 reasoningMaxTokens:Number.isInteger(reasoning?.max_tokens)&&reasoning.max_tokens>=0?reasoning.max_tokens:null,
 thinkingType:anthropic&&['enabled','disabled','adaptive'].includes(guarded.body.thinking?.type)?guarded.body.thinking.type:null,
 thinkingBudgetTokens:anthropic&&Number.isInteger(guarded.body.thinking?.budget_tokens)&&guarded.body.thinking.budget_tokens>=0?guarded.body.thinking.budget_tokens:null,
 outputConfigEffort:typeof nativeEffort==='string'&&['low','medium','high'].includes(nativeEffort)?nativeEffort:null,model:policy.model,provider:policy.provider};
}

function validateConfig(config){
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.getPrototypeOf(config)!==Object.prototype||!Number.isInteger(config.port)||config.port<0||config.port>65535||typeof config.host!=='string'||!config.host||typeof config.ledgerPath!=='string'||!usd(config.limitUsd)||config.limitUsd<=0||!usd(config.priorUpperUsd)||config.priorUpperUsd>config.limitUsd||!config.tokens||typeof config.tokens!=='object'||Array.isArray(config.tokens))throw new Error('Invalid gateway config');
 if(config.accountingMode!=null&&!['legacy','estimated'].includes(config.accountingMode))throw new Error('Invalid gateway config');
 if(config.accountingMode==='estimated'&&(!usd(config.externalPriorUsd)||config.externalPriorUsd>config.priorUpperUsd))throw new Error('Invalid gateway config');
 if(!['127.0.0.1','::1','localhost'].includes(config.host)&&config.allowNetworkBind!==true)throw new Error('Non-loopback network binding requires explicit allowNetworkBind');
 const scopes=new Map(),trials=new Map();
 for(const [token,item] of Object.entries(config.tokens)){
  if(token.length<24||token==='__proto__'||token==='constructor'||token==='prototype'||!item||typeof item.trialId!=='string'||!item.trialId||!Number.isInteger(item.maxRequests)||item.maxRequests<=0)throw new Error('Invalid gateway token config');
  // WHY: conflicting grants must fail before key-file access, billing refresh or transport.
  validateBudgetScope(item.budgetScope);
  if(trials.has(item.trialId)&&trials.get(item.trialId)!==item.budgetScope?.id)throw new Error('Conflicting trial budget scope');
  trials.set(item.trialId,item.budgetScope?.id);
  if(item.budgetScope){const {id,limitUsd}=item.budgetScope;if(scopes.has(id)&&scopes.get(id)!==limitUsd)throw new Error('Conflicting budget scope limit');scopes.set(id,limitUsd);}
  const p=item.policy;
  if(!p||typeof p.model!=='string'||!p.model||typeof p.provider!=='string'||!p.provider.trim()||!Number.isInteger(p.maxContextTokens)||p.maxContextTokens<=0||!Number.isInteger(p.maxOutputTokens)||p.maxOutputTokens<=0||!usd(p.maxPromptUsdPerMillion)||!usd(p.maxCacheWriteUsdPerMillion)||!usd(p.maxCompletionUsdPerMillion)||!usd(p.reservationUsd)||p.reservationUsd<=0)throw new Error('Invalid token policy');
  // WHY: maxContextTokens must be independently verified for this model/route; the reservation also prices worst-case cache writes and adds 10%, but provider tier prices still need conservative configured rates.
  const computed=(p.maxContextTokens*p.maxPromptUsdPerMillion+p.maxContextTokens*p.maxCacheWriteUsdPerMillion+p.maxOutputTokens*p.maxCompletionUsdPerMillion)/1e6*RESERVATION_SAFETY;
  if(p.reservationUsd+1e-15<computed)throw new Error('Reservation is below the 1.1x context/output price upper bound; cache-write and tier pricing still require a configured conservative rate');
 }
 return config;
}

export async function loadPrivateConfig(path){await privateFile(path);return validateConfig(JSON.parse(await readFile(path,'utf8')));}

function sseUsageTracker(anthropic=false,activity){
 let buffer='';let latest=null,complete=false,rawUsage={};const decoder=new StringDecoder('utf8');
 // WHY: network chunks may coalesce many valid events; bound individual lines and the unfinished tail, not transport grouping.
 return {feed(chunk){buffer+=decoder.write(chunk);const lines=buffer.split(/\r\n|\n|\r/);buffer=lines.pop()??'';if(buffer.length>64*1024)throw new Error('SSE event exceeds parser bound');for(const line of lines){if(line.length>64*1024)throw new Error('SSE line exceeds parser bound');if(!line.startsWith('data:'))continue;const payload=line.slice(5).trim();if(!payload)continue;if(payload==='[DONE]'){complete=true;activity?.terminal();continue;}try{const event=JSON.parse(payload);activity?.event(event,anthropic);const usage=anthropic?(event?.usage??event?.message?.usage):event?.usage;if(usage){if(anthropic){rawUsage={...rawUsage,...usage,cost:usage.cost??null};latest=normalizeAnthropicUsage(rawUsage);}else latest=normalizeOpenRouterUsage(usage);}if(event?.type==='response.completed'||event?.type==='message_stop')complete=true;}catch{latest=null;}}},usage(){return complete?latest:null;},complete(){return complete;}};
}

async function defaultTransport({url,headers,body,signal}){return fetch(url,{method:'POST',headers,body,signal,redirect:'manual'});}

export async function writeChunk(response,value,signal){
 if(signal.aborted)throw new Error('aborted');
 if(response.write(value))return;
 await new Promise((resolve,reject)=>{
  const cleanup=()=>{response.off('drain',drained);response.off('close',closed);signal.removeEventListener('abort',aborted);};
  const drained=()=>{cleanup();resolve();};
  const closed=()=>{cleanup();reject(new Error('client-disconnected'));};
  const aborted=()=>{cleanup();reject(new Error('aborted'));};
  response.once('drain',drained);response.once('close',closed);signal.addEventListener('abort',aborted,{once:true});
  if(signal.aborted)aborted();
 });
}

export async function createGateway({config,keyFile,transport=defaultTransport,usageTransport=async({url,headers,signal})=>fetch(url,{headers,signal,redirect:'manual'}),now=()=>Date.now(),timeoutMs=DEFAULT_TIMEOUT}){
 validateConfig(config);
 if(typeof keyFile!=='string')throw new Error('Provider key file is required');
 await privateFile(keyFile);const key=(await readFile(keyFile,'utf8')).trim();
 if(!key)throw new Error('Provider key file is required');
 if(!Number.isInteger(timeoutMs)||timeoutMs<=0)throw new Error('Invalid upstream timeout');
 const accountingMode=config.accountingMode??'legacy';
 const ledger=await BudgetLedger.open({path:config.ledgerPath,limitUsd:config.limitUsd,priorUpperUsd:config.priorUpperUsd,accountingMode,externalPriorUsd:config.externalPriorUsd??config.priorUpperUsd});
 let lastBillingCheck=null,billingRefreshPromise=null;
 const refreshBilling=async()=>{if(accountingMode!=='estimated')return;if(billingRefreshPromise)return billingRefreshPromise;if(lastBillingCheck!==null&&now()-lastBillingCheck<30_000)return;billingRefreshPromise=(async()=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.min(timeoutMs,10_000));timer.unref?.();try{const response=await usageTransport({url:'https://openrouter.ai/api/v1/key',headers:Object.freeze({authorization:`Bearer ${key}`,accept:'application/json'}),signal:controller.signal});if(!response.ok)throw new Error('Billing refresh failed');const data=await response.json();const usage=data?.data?.usage;if(!usd(usage))throw new Error('Billing refresh failed');await ledger.recordBillingSnapshot({providerUsageUsd:usage,checkedAt:new Date(now()).toISOString()});lastBillingCheck=now();}finally{clearTimeout(timer);}})();try{await billingRefreshPromise;}finally{billingRefreshPromise=null;}};
 if(accountingMode==='estimated'){try{await refreshBilling();}catch(error){await ledger.close();throw error;}}
 const active=new Set(),activityClock=randomUUID();
 const server=createServer((req,res)=>{
  let finish;const task=new Promise(resolve=>{finish=resolve;});active.add(task);
  void (async()=>{
   let reservationId=null, upstream=null, timer, settled=false, activity=null,activityStatus='incomplete';
   const abort=new AbortController();
   // WHY: classify only directly observed lifecycle facts, never exception text; first observation wins abort races.
   let failureReason='unknown',upstreamStarted=null;
   const markFailure=reason=>{if(failureReason==='unknown')failureReason=reason;};
   const retain=(status,extra={})=>{
    // WHY: failed request spans end at the observed failure, not after accounting/fsync.
    activity?.endRequest(['downstream-disconnect','upstream-deadline'].includes(failureReason)?'interrupted':'failed');
    return ledger.retain(reservationId,status,{...extra,failureReason,responseStarted:res.headersSent,durationMs:upstreamStarted===null?null:Math.max(0,performance.now()-upstreamStarted)});
   };
   const stop=()=>{markFailure('downstream-disconnect');abort.abort();upstream?.body?.cancel().catch(()=>{});};
   res.on('close',()=>{if(!res.writableEnded)stop();});
   try{
    if(req.method!=='POST'||!ALLOWED.has(req.url)){requestError(res,404,'Route not found');return;}
    const anthropic=req.url.split('?')[0].endsWith('/messages');
    const auth=req.headers.authorization;
    const match=typeof auth==='string'&&auth.match(/^Bearer ([^ ]+)$/);
    const credential=match?.[1]??(anthropic&&typeof req.headers['x-api-key']==='string'?req.headers['x-api-key']:null),access=credential&&Object.hasOwn(config.tokens,credential)?config.tokens[credential]:null;
    if(!access){requestError(res,401,'Unauthorized');return;}
    if((access.protocol??'openai-chat')!==(anthropic?'anthropic-messages':'openai-chat')){requestError(res,400,'Token is not approved for this protocol');return;}
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY){requestError(res,413,'Request body exceeds 2 MiB');req.destroy();return;}chunks.push(chunk);}
    if((req.headers['content-type']??'').split(';',1)[0].trim().toLowerCase()!=='application/json'){requestError(res,415,'Content-Type must be application/json');return;}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{requestError(res,400,'Request body must be JSON');return;}
    if(!input||typeof input!=='object'||Array.isArray(input)){requestError(res,400,'Request body must be a JSON object');return;}
    let guarded;try{
     // The shared policy checks nonempty plugin arrays; enforce the stricter proxy contract for malformed/non-array values too.
     if((input.plugins!=null&&(!Array.isArray(input.plugins)||input.plugins.length))||(input.transforms!=null&&(!Array.isArray(input.transforms)||input.transforms.length)))throw new Error('Optional feature fields refused');
     guarded=anthropic?guardAnthropicMessages(input,access.policy):guardOpenRouterRequest(input,access.policy);
    }catch(error){const detail=config.captureErrorDiagnostics===true&&SAFE_POLICY_ERRORS.has(error?.message)?`: ${error.message}${error.shape?' '+JSON.stringify(error.shape):''}`:'';requestError(res,400,'Request violates the approved model, route, or feature policy'+detail);return;}
    // WHY: this pilot intentionally accepts text-only message content plus custom function tools; the whole normalized payload byte cap is additional input hygiene, not a tokenizer or context-length guarantee.
    const messagesAreText=Array.isArray(input.messages)&&input.messages.every(message=>message&&typeof message==='object'&&(typeof message.content==='string'||message.content==null||(Array.isArray(message.content)&&message.content.every(part=>part?.type==='text'&&typeof part.text==='string')))&&(!message.tool_calls||Array.isArray(message.tool_calls)&&message.tool_calls.every(call=>call&&typeof call==='object'&&call.type==='function'&&call.function&&typeof call.function.name==='string'&&typeof call.function.arguments==='string')));
    const toolsAreCustom=!input.tools||(Array.isArray(input.tools)&&input.tools.every(tool=>tool&&typeof tool==='object'&&tool.type==='function'&&tool.function&&typeof tool.function.name==='string'));
    if(!anthropic&&(!messagesAreText||!toolsAreCustom)){requestError(res,400,'Only text messages and custom function tools are allowed');return;}
    const body=JSON.stringify(guarded.body);
    if(Buffer.byteLength(body,'utf8')>MAX_BODY){requestError(res,413,'Normalized request exceeds 2 MiB');return;}
    try{await refreshBilling();}catch{requestError(res,503,'Billing verification is unavailable; no provider call was made');return;}
    try{const estimateBasis={inputBytes:Buffer.byteLength(body,'utf8'),inputTokens:Math.ceil(Buffer.byteLength(body,'utf8')/3)+20*(guarded.body.messages?.length??0),outputTokens:guarded.body.max_tokens??access.policy.maxOutputTokens,buffer:1.25};const estimateUsd=(estimateBasis.inputTokens*(access.policy.maxPromptUsdPerMillion+access.policy.maxCacheWriteUsdPerMillion)+estimateBasis.outputTokens*access.policy.maxCompletionUsdPerMillion)/1e6*1.25;reservationId=await ledger.reserve({trialId:access.trialId,budgetScope:access.budgetScope,reservationUsd:accountingMode==='estimated'?estimateUsd:access.policy.reservationUsd,estimateUsd:accountingMode==='estimated'?estimateUsd:null,estimateBasis:accountingMode==='estimated'?estimateBasis:null,maxRequests:access.maxRequests,model:access.policy.model,provider:access.policy.provider,requestControls:requestControls(guarded,anthropic,access.policy)});}catch{requestError(res,402,'Lab budget or request limit reached; no provider call was made');return;}
    activity=createGatewayActivity({clock:activityClock,requestId:reservationId});
    await ledger.recordActivity(reservationId,activity.record); // durable ID + open observation before dispatch
    upstreamStarted=performance.now();timer=setTimeout(()=>{markFailure('upstream-deadline');abort.abort();},timeoutMs);timer.unref?.();
    const outgoingHeaders=Object.freeze({authorization:`Bearer ${key}`,accept:'application/json, text/event-stream','content-type':'application/json',...(anthropic?{'anthropic-version':'2023-06-01'}:{})});
    activity.dispatch();
    try{upstream=await transport({url:anthropic?MESSAGES_UPSTREAM:UPSTREAM,headers:outgoingHeaders,body,signal:abort.signal});}catch{await retain('upstream-error');settled=true;requestError(res,abort.signal.aborted?504:502,abort.signal.aborted?'Upstream request timed out':'Upstream request failed');return;}
    if(upstream.status>=300&&upstream.status<400){await upstream.body?.cancel().catch(()=>{});await retain('upstream-error');settled=true;requestError(res,502,'Upstream redirect refused');return;}
    // WHY: dropping Retry-After changes client recovery and can create avoidable retries in a comparison.
    if(upstream.status<200||upstream.status>=300){const diagnostic=config.captureErrorDiagnostics===true?await upstreamDiagnostic(upstream,[key,credential]):null;await upstream.body?.cancel().catch(()=>{});await retain('upstream-error',{upstreamStatus:upstream.status,upstreamDiagnostic:diagnostic});settled=true;const retry=upstream.headers.get('retry-after');requestError(res,upstream.status,'Upstream request failed',retry?{'retry-after':retry}:{});return;}
    const contentType=(upstream.headers.get('content-type')??'').toLowerCase();
    const isSse=contentType.includes('text/event-stream')||input.stream===true;
    if(!isSse&&!contentType.includes('application/json')){await upstream.body?.cancel().catch(()=>{});await retain('unknown');settled=true;requestError(res,502,'Unexpected upstream response type');return;}
    if(!upstream.body){await retain('unknown');settled=true;requestError(res,502,'Upstream response unavailable');return;}
    const reader=upstream.body.getReader();const parser=isSse?sseUsageTracker(anthropic,activity):null;let jsonBytes=0,jsonChunks=[];
    res.writeHead(upstream.status,{'content-type':isSse?'text/event-stream; charset=utf-8':(contentType||'application/json'),'cache-control':'no-cache','x-content-type-options':'nosniff'});
    while(true){let chunk;try{chunk=await reader.read();}catch{markFailure('upstream-read-error');throw new Error('Upstream read failed');}const {done,value}=chunk;if(done)break;activity.firstByte();if(abort.signal.aborted)throw new Error('aborted');
     if(isSse){parser.feed(value);await writeChunk(res,value,abort.signal);}
     else {jsonBytes+=value.byteLength;if(jsonBytes>MAX_RESPONSE)throw new Error('response-too-large');jsonChunks.push(Buffer.from(value));}
    }
    // WHY: some compatible endpoints omit the newline after a complete terminal event.
    if(isSse){parser.feed(Buffer.from('\n'));activity.endRequest(parser.complete()?'completed':'incomplete');const usage=parser.usage();if(!usage){markFailure(parser.complete()?'missing-usage':'missing-terminal-marker');await retain('unknown');settled=true;throw new Error('SSE completion or usage was not verified');}if(usage.providerCostUsd!=null){await ledger.settle(reservationId,usage.providerCostUsd,usage);settled=true;}else{await retain('unknown',{usage});settled=true;}if(!res.writableEnded)res.end();}
    else {activity.endRequest('completed');const bytes=Buffer.concat(jsonChunks);let usage=null;try{const parsed=JSON.parse(bytes.toString('utf8'));usage=anthropic?normalizeAnthropicUsage(parsed?.usage):normalizeOpenRouterUsage(parsed?.usage);}catch{usage=null;}
     if(usage?.providerCostUsd!=null){await ledger.settle(reservationId,usage.providerCostUsd,usage);settled=true;}else{await retain('unknown',{usage});settled=true;}
     if(!res.writableEnded)res.end(bytes);
    }
    activityStatus='completed';
   }catch{
    if(reservationId&&!settled){try{await retain('unknown');}catch{}}
    abort.abort();if(!res.destroyed)requestError(res,502,'Gateway request failed');
   }finally{
    clearTimeout(timer);
    if(activity){
     const status=['downstream-disconnect','upstream-deadline'].includes(failureReason)?'interrupted':activityStatus==='completed'?'completed':['missing-terminal-marker','missing-usage'].includes(failureReason)?'incomplete':'failed';
     try{await ledger.recordActivity(reservationId,activity.finish(status));}catch{ /* Initial durable open record remains censored. */ }
    }
    if(!res.writableEnded)abort.abort();
   }
  })().finally(()=>{active.delete(task);finish();});
 });
 return {server,ledger,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,()=>{server.off('error',reject);resolve(server.address());});}),address:()=>server.address(),drain:()=>Promise.allSettled([...active]),close:async()=>{if(server.listening){const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));server.closeAllConnections?.();await closed;}await Promise.allSettled([...active]);await ledger.close();}};
}

async function cli(){
 const args=process.argv.slice(2);let configPath,keyPath;
 for(let i=0;i<args.length;i++){if(args[i]==='--config')configPath=args[++i];else if(args[i]==='--key-file')keyPath=args[++i];else throw new Error('Usage: node openrouter-gateway.mjs --config <private-json> --key-file <private-key>');}
 if(!configPath||!keyPath)throw new Error('Usage: node openrouter-gateway.mjs --config <private-json> --key-file <private-key>');
 const config=await loadPrivateConfig(configPath);const gateway=await createGateway({config,keyFile:keyPath});
 const address=await gateway.listen();console.log(`OpenRouter gateway listening on ${address.address}:${address.port}`);
 const shutdown=async()=>{await gateway.close();process.exit(0);};process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){cli().catch(()=>{console.error('OpenRouter gateway failed to start');process.exitCode=1;});}
