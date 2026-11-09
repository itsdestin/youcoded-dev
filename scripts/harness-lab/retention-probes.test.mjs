import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as probes from './retention-probes.mjs';

test('retention probes are reproducible, amend constraints, and do not repeat answers in the final prompt',()=>{
 const options={seed:'offline-control',fillerTurns:4,paragraphsPerTurn:2,contextWindowTokens:200000};
 const a=probes.buildRetentionProbe(options),b=probes.buildRetentionProbe(options);
 assert.deepEqual(a,b);assert.equal(a.steps.some(s=>s.kind==='compact'),false);
 assert.equal(a.checks.jsonEquals.budgetUsd,397);
 assert.equal(a.steps.at(-1).text.includes(a.checks.jsonEquals.projectCode),false);
 assert.equal(a.steps.at(-1).text.includes('397'),false);
 assert.equal(a.meta.sizeIsEstimate,true);assert.ok(a.meta.promptBytes>0);
 assert.ok(a.meta.estimatedCumulativeInputTokensWithoutCompaction>a.meta.estimatedPromptTokens,'planning must account for repeated history, not just its final size');
 assert.notEqual(probes.buildRetentionProbe({...options,seed:'other'}).id,a.id);
 assert.throws(()=>probes.buildRetentionProbe({...options,fillerTurns:100}),/bounds/i);
});
test('retention and automatic compaction claims require separate measured evidence',()=>{
 const plan=probes.buildRetentionProbe({seed:'a',fillerTurns:4,paragraphsPerTurn:2,contextWindowTokens:200000});
 const missing=probes.qualifyRetention(plan,{artifactVerified:true});
 assert.equal(missing.retention,'unmeasured');assert.equal(missing.automaticCompaction,'unverified');
 const observed={artifactVerified:true,requests:[{id:'request-1',usage:{inputTokens:160000}}],observedContextWindowTokens:200000,telemetrySource:'request-ledger',compactionEvidence:{source:'runtime-event',trigger:'context-threshold',eventId:'real-event'}};
 assert.equal(probes.qualifyRetention(plan,observed).retention,'passed');
 assert.equal(probes.qualifyRetention(plan,observed).automaticCompaction,'verified');
 assert.equal(probes.qualifyRetention(plan,{...observed,compactionEvidence:{source:'assistant-prose',trigger:'context-threshold'}}).automaticCompaction,'unverified');
 assert.equal(probes.qualifyRetention(plan,{...observed,observedContextWindowTokens:1000000}).retention,'unmeasured');
 assert.equal(probes.qualifyRetention(plan,{...observed,requests:[{usage:{inputTokens:80000}},{usage:{inputTokens:80000}}]}).retention,'unmeasured','cumulative tokens cannot substitute for actual context occupancy');
});
