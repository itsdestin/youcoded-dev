import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guardOpenRouterRequest,normalizeOpenRouterUsage} from './openrouter-policy.mjs';
const policy={model:'qwen/qwen3.8-flash',provider:'test-endpoint',maxOutputTokens:8192,maxPromptUsdPerMillion:0.15,maxCompletionUsdPerMillion:0.47};

test('pins exact model/route, refuses fallback models and paid plugins, leaves model reasoning explicit',()=>{
 const r=guardOpenRouterRequest({model:policy.model,messages:[{role:'user',content:'hi'}],max_tokens:20000,reasoning:{effort:'low'}},policy);
 assert.equal(r.body.max_tokens,8192);assert.equal(r.body.reasoning.effort,'low');
 assert.deepEqual(r.body.provider.order,['test-endpoint']);assert.equal(r.body.provider.allow_fallbacks,false);
 assert.equal(r.body.provider.max_price.prompt,0.15);
 for(const extra of [{model:'other/model'},{models:['other/model']},{plugins:[{id:'web'}]},{transforms:['middle-out']}]){
  assert.throws(()=>guardOpenRouterRequest({model:policy.model,max_tokens:100,messages:[],...extra},policy));
 }
});
test('text-only admission does not exclude a model merely because its endpoint also prices images',()=>{
 const r=guardOpenRouterRequest({model:policy.model,max_tokens:32,messages:[{role:'user',content:'OK'}]},policy);
 assert.equal(r.body.provider.max_price.image,undefined);
 for(const extra of [{modalities:['audio']},{audio:{voice:'x'}},{image_config:{}},{web_search_options:{}}])
  assert.throws(()=>guardOpenRouterRequest({model:policy.model,max_tokens:32,messages:[],...extra},policy));
});

test('clients omitting an output limit receive the configured cap, not an unbounded default',()=>{
 const result=guardOpenRouterRequest({model:policy.model,messages:[]},policy);assert.equal(result.body.max_tokens,8192);assert.equal(result.record.requestedMaxTokens,null);
 assert.throws(()=>guardOpenRouterRequest({model:policy.model,messages:[],max_tokens:0},policy));
});

test('usage normalizes inclusive input and reasoning without adding subsets twice',()=>{
 const r=normalizeOpenRouterUsage({prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:60},completion_tokens_details:{reasoning_tokens:5},cost:0.001});
 assert.equal(r.inputTokens,100);assert.equal(r.outputTokens,20);assert.equal(r.cacheReadTokens,60);assert.equal(r.reasoningTokens,5);assert.equal(r.providerCostUsd,0.001);
 assert.equal(r.cacheWriteTokens,null);
 assert.equal(normalizeOpenRouterUsage(undefined),null);
 assert.equal(normalizeOpenRouterUsage({prompt_tokens:0,completion_tokens:0,cost:0}).providerCostUsd,0);
});
test('missing rates cannot support a price guard; nonfinite/negative telemetry rejected',()=>{
 assert.throws(()=>guardOpenRouterRequest({model:policy.model,max_tokens:10,messages:[]},{...policy,maxPromptUsdPerMillion:null}),/price/i);
 assert.throws(()=>normalizeOpenRouterUsage({prompt_tokens:-1}),/usage/i);
});
