import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditComparison, graderReliability, configurationFingerprint} from './evaluation-audit.mjs';
const configuration=()=>({task:{id:'task',version:'1',fixtureHash:'f',rubricHash:'r'},
 model:{id:'model',revision:'snapshot',provider:'route',reasoning:'off'},
 environment:{image:'sha256:x',cpu:2,memoryMb:2048,network:'fixed'},
 controls:{permissions:'fixture-only',cacheCondition:'warm',maxSeconds:180,maxRequests:20,maxOutputTokens:8192},
 harness:{id:'a',version:'v1',promptHash:'p',toolsHash:'t',skillsHash:'s'}});
test('matched-model comparison allows native harness differences but blocks model/fixture drift',()=>{
 const a=configuration(),b=configuration();b.harness.id='b';b.harness.promptHash='other';
 assert.equal(auditComparison(a,b).comparable,true);
 b.model.provider='different-route';assert.equal(auditComparison(a,b).comparable,false);
 b.model.provider='route';delete b.task.fixtureHash;assert.equal(auditComparison(a,b).comparable,false);
});
test('fingerprint stable across object ordering, excludes no measurement-critical fields',()=>{
 const a=configuration(),b=Object.fromEntries(Object.entries(a).reverse());
 assert.equal(configurationFingerprint(a),configurationFingerprint(b));
 b.controls={...b.controls,maxRequests:21};assert.notEqual(configurationFingerprint(a),configurationFingerprint(b));
});
test('same-harness model track allows model differences but not a changed prompt',()=>{
 const a=configuration(),b=configuration();b.model.id='other';b.model.revision='other';b.model.provider='other-route';
 assert.equal(auditComparison(a,b,{track:'model'}).comparable,true);
 b.harness.promptHash='changed';assert.equal(auditComparison(a,b,{track:'model'}).comparable,false);
});
test('grader reliability separates invalid grades, human calibration and swapped order effects',()=>{
 const rows=[{itemId:'a',judgeId:'j1',dimension:'clarity',score:5,valid:true,order:'AB'},
 {itemId:'a',judgeId:'j1',dimension:'clarity',score:3,valid:true,order:'BA'},
 {itemId:'a',judgeId:'j2',dimension:'clarity',score:4,valid:true,order:'AB'},
 {itemId:'b',judgeId:'j1',dimension:'clarity',score:null,valid:false,reason:'ungrounded quote',order:'AB'}].map(r=>({...r,rubricVersion:'v1'}));
 const r=graderReliability(rows,[{itemId:'a',dimension:'clarity',score:4,rubricVersion:'v1'}]);
 assert.equal(r.invalidGrades,1);assert.equal(r.invalidRate,0.25);
 assert.equal(r.orderPairs,1);assert.equal(r.meanAbsoluteOrderDifference,2);
 assert.equal(r.humanComparedItems,1);assert.equal(r.humanMeanAbsoluteDifference,0);
 assert.equal(r.humanCalibrationEstablished,false);
 assert.equal(graderReliability(rows).humanMeanAbsoluteDifference,null);
});
test('missing rubric identity cannot support a reliability comparison',()=>{
 assert.throws(()=>graderReliability([{itemId:'a',judgeId:'j',dimension:'clarity',score:5,valid:true,order:'AB'}]),/rubric/i);
});

test('mixed rubric versions cannot produce a shared reliability score',()=>{
 const grade={itemId:'a',judgeId:'j',dimension:'clarity',score:5,valid:true,order:'AB',rubricVersion:'v1'};
 assert.throws(()=>graderReliability([grade,{...grade,order:'BA',rubricVersion:'v2'}]),/rubric/i);
});

test('duplicate grades/human references and invalid scale values are refused',()=>{
 const row={itemId:'a',judgeId:'j',dimension:'clarity',score:5,valid:true,order:'AB',rubricVersion:'v1'};
 assert.throws(()=>graderReliability([row,row]),/duplicate/i);
 assert.throws(()=>graderReliability([{...row,score:9}]),/score/i);
});
