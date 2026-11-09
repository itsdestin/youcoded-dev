import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from './report.mjs';


test('report labels missing accounting and ungraded outcomes honestly', () => {
  const text = renderReport([{ schemaVersion: 1, arm: 'test', taskId: 'fixture', repetition: 0,
    comparisonKey: 'offline-only', status: 'completed', success: null, wallClockMs: 20,
    requests: [], finalText: 'Short answer.' }]);
  assert.match(text, /ungraded/i);
  assert.match(text, /unknown/i);
  assert.match(text, /not.*quality/i);
  assert.doesNotMatch(text, /100%/);
  assert.doesNotMatch(text, /## No-nudge/);
});

test('report automatically scores runtime episodes and exposes unmeasured scheduler state', () => {
  const episode = { id:'receipt', sessionId:'parent', taskId:'child', reportId:'report', thresholdMs:100,
    observation:{start:0,end:200}, fixture:{reference:'fixture',requiredWork:true,blocked:false,requiresUser:false,dependsOn:[]},
    coverage:{childCompletion:true,reportDelivery:true,parentState:false,userInputs:true,progress:true},
    evidence:{sessionId:'parent',taskId:'child',reportId:'report',childCompletedAt:10,reportDeliveredAt:20,
      deliveryContext:'active',parentRequestStartedAt:30}, states:[],inputs:[{at:0,kind:'initial'}] };
  const run = { schemaVersion:1,arm:'offline',taskId:'fixture',repetition:0,comparisonKey:'offline-only',
    status:'completed',success:null,wallClockMs:200,requests:[],finalText:'Acknowledged',
    continuation:{episode,coverageGaps:['Scheduler intervals unavailable']} };
  const text = renderReport([run,{...run,continuation:undefined}]);
  assert.match(text,/## No-nudge continuation/);
  assert.match(text,/Successes: 0\. Failures: 1\. Unknown: 0/);
  assert.match(text,/Runs without continuation receipts: 1/);
  assert.match(text,/\| receipt \| fail \| unknown \|/);
  assert.match(text,/Coverage limit: Scheduler intervals unavailable/);
});
