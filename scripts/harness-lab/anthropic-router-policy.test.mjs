import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as policy from './openrouter-policy.mjs';
const limits={model:'anthropic/claude-haiku-5.5',provider:'anthropic',maxOutputTokens:2048,maxPromptUsdPerMillion:.5,maxCompletionUsdPerMillion:2.5};
const input={model:limits.model,max_tokens:8192,system:[{type:'text',text:'system'}],messages:[{role:'user',content:'hello'},{role:'assistant',content:[{type:'thinking',thinking:'consider',signature:'sig'},{type:'tool_use',id:'call1',name:'read',input:{path:'a'}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'call1',content:[{type:'text',text:'contents'}]}]}],tools:[{name:'read',input_schema:{type:'object'}}]};
test('Anthropic skin preserves native tool conversation while pinning model route and output',()=>{
 const result=policy.guardAnthropicMessages(input,limits);assert.equal(result.body.max_tokens,2048);assert.deepEqual(result.body.messages,input.messages);assert.deepEqual(result.body.provider.only,['anthropic']);
});
test('Anthropic skin rejects server tools, nontext attachments, fallback models and premium tiers',()=>{
 for(const bad of [{...input,tools:[{type:'web_search_20250305',name:'web_search'}]},{...input,messages:[{role:'user',content:[{type:'image',source:{type:'url',url:'https://example.com/a'}}]}]},{...input,fallbacks:[{model:'expensive'}]},{...input,service_tier:'priority'},{...input,speed:'fast'}]) assert.throws(()=>policy.guardAnthropicMessages(bad,limits));
});
test('Claude Code text-only system messages remain in their original position',()=>{
 const messages=[{role:'user',content:'task'},{role:'system',content:[{type:'text',text:'native context instruction'}]}];
 assert.deepEqual(policy.guardAnthropicMessages({...input,messages},limits).body.messages,messages);
 assert.throws(()=>policy.guardAnthropicMessages({...input,messages:[{role:'system',content:[{type:'image'}]}]},limits));
});

test('native Anthropic model shorthand maps only to its approved canonical model',()=>{
 assert.equal(policy.guardAnthropicMessages({...input,model:'claude-haiku-5.5'},limits).body.model,limits.model);
 assert.throws(()=>policy.guardAnthropicMessages({...input,model:'claude-opus-5'},limits));
});
test('Anthropic usage includes cache tokens and leaves missing billing unknown',()=>{
 assert.deepEqual(policy.normalizeAnthropicUsage({input_tokens:10,cache_read_input_tokens:20,cache_creation_input_tokens:5,output_tokens:7}),{inputTokens:35,outputTokens:7,cacheReadTokens:20,cacheWriteTokens:5,reasoningTokens:null,providerCostUsd:null});
});
