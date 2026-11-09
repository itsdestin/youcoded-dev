// Pure, offline-tested policy building block. NOT a running proxy or a cumulative budget guard.
// Official provider routing docs: max_price prompt/completion values are USD per million tokens.
const price=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function guardOpenRouterRequest(request,policy){
  if(!policy||typeof policy.model!=='string'||typeof policy.provider!=='string'||!policy.provider.trim()) throw new Error('Explicit model and provider route required');
  if(!price(policy.maxPromptUsdPerMillion)||!price(policy.maxCompletionUsdPerMillion)) throw new Error('Explicit finite price ceilings required');
  if(!Number.isInteger(policy.maxOutputTokens)||policy.maxOutputTokens<=0) throw new Error('Invalid output ceiling');
  if(!request||request.model!==policy.model) throw new Error('Unapproved model');
  if('fallbacks' in request||'models' in request||'route' in request||'preset' in request) throw new Error('Fallback model/router/preset is forbidden');
  if((request.plugins?.length??0)||(request.transforms?.length??0)) throw new Error('Paid plugins and prompt transforms are forbidden');
  if(!Array.isArray(request.messages)) throw new Error('Messages array required');
  if(request.audio!==undefined||request.image_config!==undefined||request.web_search_options!==undefined
    ||(request.modalities!==undefined&&(!Array.isArray(request.modalities)||request.modalities.some(m=>m!=='text'))))
    throw new Error('Only text generation without server search/audio/image features is allowed');
  // WHY: compatible clients may omit a limit; supply our approved cap instead of a provider default.
  const requestedMax=request.max_tokens??request.max_completion_tokens??null;
  const max=requestedMax??policy.maxOutputTokens;
  if(!Number.isInteger(max)||max<=0) throw new Error('Explicit positive output-token limit required');
  if(request.n!=null&&request.n!==1) throw new Error('Multiple completions are forbidden');
  if(request.speed!=null&&request.speed!=='standard'||request.service_tier!=null&&!['auto','default','standard'].includes(request.service_tier))throw new Error('Premium service tiers are forbidden');
  const body=structuredClone(request);
  delete body.max_completion_tokens;
  body.max_tokens=Math.min(max,policy.maxOutputTokens);
  // Override route fields that could silently change provider or model comparison conditions.
  body.provider={order:[policy.provider],only:[policy.provider],allow_fallbacks:false,require_parameters:true,
    max_price:{prompt:policy.maxPromptUsdPerMillion,completion:policy.maxCompletionUsdPerMillion,request:0}};
  // Reasoning is deliberately NOT guessed or forcibly disabled across model families.
  return {body,record:{model:policy.model,provider:policy.provider,requestedMaxTokens:requestedMax,effectiveMaxTokens:body.max_tokens,
    reasoning:body.reasoning??null,priceCeilings:body.provider.max_price},
    liveReady:false,limitations:['Needs a cumulative reservation ledger, streaming/error handling, route preflight and provider-key cap before live use.']};
}

// WHY: Claude Code speaks native Anthropic Messages; forward that protocol unchanged,
// with the same route/budget restrictions, rather than translating its conversation.
export function guardAnthropicMessages(request,policy){
 // Native clients use the vendor shorthand; this exact alias cannot select another model.
 const canonical=policy?.model?.startsWith('anthropic/')&&request?.model===policy.model.slice('anthropic/'.length)?{...request,model:policy.model}:request;
 const result=guardOpenRouterRequest(canonical,policy);
 const text=p=>p&&p.type==='text'&&typeof p.text==='string';
 const content=value=>typeof value==='string'||Array.isArray(value)&&value.every(part=>{
  if(text(part))return true;
  if(!part||typeof part!=='object')return false;
  if(part.type==='thinking')return typeof part.thinking==='string';
  if(part.type==='redacted_thinking')return typeof part.data==='string';
  if(part.type==='tool_use')return typeof part.id==='string'&&typeof part.name==='string'&&part.input&&typeof part.input==='object';
  if(part.type==='tool_result')return typeof part.tool_use_id==='string'&&(part.content==null||typeof part.content==='string'||Array.isArray(part.content)&&part.content.every(text));
  return false;
 });
 if(request.system!=null&&!(typeof request.system==='string'||Array.isArray(request.system)&&request.system.every(text)))throw new Error('Only text system content allowed');
 // WHY: the observed native Claude wire shape includes text system messages in history;
 // preserve their role and order rather than rewriting them as user messages.
 const validMessage=m=>m&&(m.role==='system'?(typeof m.content==='string'||Array.isArray(m.content)&&m.content.every(text)):['user','assistant'].includes(m.role)&&content(m.content));
 const invalid=request.messages.findIndex(m=>!validMessage(m));
 if(invalid>=0){
  const tag=value=>typeof value==='string'&&/^[a-z_]{1,48}$/.test(value)?value:'unrecognized';
  const shape=(value,depth=0)=>Array.isArray(value)?value.slice(0,12).map(p=>({type:tag(p?.type),textType:typeof p?.text,...(depth<1&&p?.content!=null?{content:shape(p.content,depth+1)}:{})})):typeof value;
  throw Object.assign(new Error('Only text and native custom tool messages allowed'),{shape:{messageIndex:invalid,role:tag(request.messages[invalid]?.role),content:shape(request.messages[invalid]?.content)}});
 }
 if(request.tools!=null&&(!Array.isArray(request.tools)||!request.tools.every(t=>t&&(!t.type||t.type==='custom')&&typeof t.name==='string'&&t.input_schema&&typeof t.input_schema==='object')))throw new Error('Only custom function tools allowed');
 if(request.deferred_tools!=null)throw new Error('Deferred server tool protocol is not enabled');
 return result;
}

// Anthropic input_tokens excludes cache reads/writes (unlike OpenAI prompt_tokens).
// A cache count greater than input_tokens is normal, not an invalid subset.
export function normalizeAnthropicUsage(usage){
 if(usage==null)return null;
 const values=[usage.input_tokens,usage.cache_read_input_tokens,usage.cache_creation_input_tokens,usage.output_tokens,usage.cost];
 if(values.some(n=>n!=null&&!price(n)))throw new Error('Invalid Anthropic usage');
 return {inputTokens:usage.input_tokens==null?null:usage.input_tokens+(usage.cache_read_input_tokens??0)+(usage.cache_creation_input_tokens??0),outputTokens:usage.output_tokens??null,cacheReadTokens:usage.cache_read_input_tokens??null,cacheWriteTokens:usage.cache_creation_input_tokens??null,reasoningTokens:null,providerCostUsd:usage.cost??null};
}

export function normalizeOpenRouterUsage(usage){
  if(usage==null) return null;
  const fields={inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens,
    cacheReadTokens:usage.prompt_tokens_details?.cached_tokens,cacheWriteTokens:usage.prompt_tokens_details?.cache_write_tokens,
    reasoningTokens:usage.completion_tokens_details?.reasoning_tokens,providerCostUsd:usage.cost};
  for(const [key,value] of Object.entries(fields)){
    if(value!=null&&!price(value)) throw new Error(`Invalid usage ${key}`);
    fields[key]=value??null;
  }
  if(fields.inputTokens!=null&&fields.cacheReadTokens!=null&&fields.cacheReadTokens>fields.inputTokens) throw new Error('Invalid usage cache subset');
  if(fields.outputTokens!=null&&fields.reasoningTokens!=null&&fields.reasoningTokens>fields.outputTokens) throw new Error('Invalid usage reasoning subset');
  return fields;
}
