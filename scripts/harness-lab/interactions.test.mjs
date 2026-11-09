import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInteractions, normalizeAtif, analyzeNativeRun } from './interactions.mjs';
test('partial run counts remain unknown while observed data is preserved; scripted inputs are not humans',()=>{
 const events=[event('user-message',{text:'scripted'}),event('tool-use',{toolUseId:'x',toolName:'Read'})];
 const failed=analyzeNativeRun({status:'timeout',events,requests:[{id:'r',role:'main'}]});
 assert.equal(failed.toolCalls,null);assert.equal(failed.modelRequests,null);assert.equal(failed.observed.toolCalls,1);
 const complete=analyzeNativeRun({status:'completed',events,requests:[{id:'r',role:'main'}]});
 assert.equal(complete.toolCalls,1);assert.equal(complete.humanInputs,null);assert.equal(complete.scriptedInputs,1);
});

test('ATIF normalizer keeps visible text and tools but never invents physical requests',()=>{
 const atif={steps:[{step_id:1,source:'user',message:'Do it'},
  {step_id:2,source:'agent',message:'Checking',reasoning_content:'hidden',tool_calls:[{tool_call_id:'c',function_name:'edit',arguments:{edits:[{},{}]}}]},
  {step_id:3,source:'agent',message:'Done'}]};
 const events=normalizeAtif(atif);
 const result=analyzeInteractions(events,{coverage:{events:true}});
 assert.equal(result.toolCalls,1);assert.equal(result.declaredOperations,2);
 assert.equal(result.assistantMessages,2);assert.equal(result.assistantWords,2);assert.equal(result.modelRequests,null);
});

const event = (type, data = {}) => ({ type, data, sessionId: 'parent' });

test('distinguishes human turns, injected notices, requests, visible messages and operations', () => {
  const events = [event('user-message', { text: 'Do the task' }),
    event('assistant-text', { partId: 'p', text: 'Working ' }),
    event('assistant-text', { partId: 'p', text: 'on it.' }),
    event('tool-use', { toolUseId: 'c', toolName: 'Edit', toolInput: { edits: [{}, {}] } }),
    event('tool-result', { toolUseId: 'c', toolResult: 'ok' }),
    event('user-message', { text: 'Helper finished', injected: 'specialist-report' }),
    event('assistant-thinking', { text: 'hidden reasoning' }),
    event('assistant-text', { partId: 'final', text: 'Done.' }),
    event('turn-complete'),
    event('user-message', { text: 'Keep going', intervention: 'nudge' }),
    event('tool-use', { toolUseId: 'b', toolName: 'Bash', toolInput: { command: 'python edit.py' } }),
    event('turn-complete')];
  const result = analyzeInteractions(events, {
    requestLedger: [{ id:'r1',role:'main' },{id:'r2',role:'specialist'},{id:'judge',role:'judge'}],
    coverage: { events:true, childEvents:false, requests:true, interventions:true },
  });
  assert.equal(result.humanInputs,2);
  assert.equal(result.automaticNotices,1);
  assert.equal(result.assistantMessages,2);
  assert.equal(result.assistantWords,4);
  assert.equal(result.toolCalls,2);
  assert.equal(result.modelRequests,2);
  assert.equal(result.explicitNudges,1);
  assert.equal(result.declaredOperations,2);
  assert.equal(result.opaqueOperationCalls,1);
  assert.equal(result.operationsTotal,null);
  assert.equal(result.segments[0].toolCalls,1);
  assert.equal(result.segments[1].toolCalls,1);
});

test('progress and turn-final messages are separate from task completion claims',()=>{
 const events=[event('user-message'),event('assistant-text',{partId:'p',text:'Checking now.'}),
 event('tool-use',{toolUseId:'x',toolName:'Read'}),event('tool-result',{toolUseId:'x'}),
 event('assistant-text',{partId:'f',text:'Done.'}),event('turn-complete')];
 const r=analyzeInteractions(events,{coverage:{events:true}});
 assert.equal(r.progressMessages,1);assert.equal(r.turnFinalMessages,1);assert.equal(r.progressWords,2);
 assert.equal(r.turnFinalWords,1);
});

test('reused stream part IDs across tool steps remain separate messages',()=>{
 const events=[event('user-message'),event('assistant-text',{partId:'same',text:'Checking.'}),
  event('tool-use',{toolUseId:'x',toolName:'Read'}),event('tool-result',{toolUseId:'x'}),
  event('assistant-text',{partId:'same',text:'Finished.'})];
 const r=analyzeInteractions(events,{coverage:{events:true}});
 assert.equal(r.assistantMessages,2);assert.equal(r.assistantWords,2);
});

test('retracted text and child display events are not parent verbosity', () => {
  const events=[event('user-message'),event('assistant-text',{partId:'x',text:'Abandoned words'}),
    event('assistant-thinking',{dropPart:{partIds:['x']}}),
    event('assistant-text',{partId:'x',text:'Final.'}),
    event('assistant-text',{agentId:'child',partId:'z',text:'Child report'}),event('turn-complete')];
  const result=analyzeInteractions(events,{coverage:{events:true}});
  assert.equal(result.assistantMessages,1);
  assert.equal(result.assistantWords,1);
  assert.equal(result.modelRequests,null);
  assert.equal(result.explicitNudges,null);
});

test('does not infer nudge from prose or invent zero when transcript unavailable', () => {
  assert.equal(analyzeInteractions([],{}).toolCalls,null);
  const r=analyzeInteractions([event('user-message',{text:'Continue'})],{coverage:{events:true}});
  assert.equal(r.explicitNudges,null);
});

test('tool groups and request count are independent and duplicate ledger IDs refused', () => {
  const events=[event('user-message'),event('tool-use',{toolUseId:'a',toolName:'Read'}),
    event('tool-use',{toolUseId:'b',toolName:'Read'}),event('tool-result',{toolUseId:'a'}),event('tool-result',{toolUseId:'b'})];
  const r=analyzeInteractions(events,{coverage:{events:true}});
  assert.equal(r.toolCalls,2); assert.equal(r.submittedToolGroups,1); assert.equal(r.modelRequests,null);
  assert.throws(()=>analyzeInteractions(events,{requestLedger:[{id:'x'},{id:'x'}],coverage:{events:true,requests:true}}),/duplicate/i);
});
