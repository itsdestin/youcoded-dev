import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {checkScenario} from './scenario-checks.mjs';

test('completion needs explicit zero unexecuted steps',()=>{
 const result=checkScenario({checks:{}},{scenario:{status:'completed'}});
 assert.equal(result.passed,false);
});

test('missing steps are never passed as concise empty responses',()=>{
 const task={checks:{steps:[1,2],maxWordsPerStep:5}};
 const r=checkScenario(task,{scenario:{status:'completed'},scenarioCheckpoints:[{index:1,status:'completed',finalText:'Short.'}]});
 assert.equal(r.passed,false);assert.ok(r.checks.some(c=>c.name==='step-2'&&c.status==='never-ran'));
});
test('checks exact artifact values and preserved files without trusting final prose',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scenario-check-'));
 try{
  fs.writeFileSync(path.join(root,'plan.json'),'{"budgetUsd":425}');
  fs.writeFileSync(path.join(root,'protected.txt'),'keep');
  const task={checks:{file:'plan.json',jsonEquals:{budgetUsd:425},unchangedFiles:['protected.txt']}};
  const r=checkScenario(task,{scenario:{status:'completed',unexecutedSteps:0}},{root,originalFiles:{'protected.txt':'keep'}});
  assert.equal(r.passed,true);
  fs.writeFileSync(path.join(root,'protected.txt'),'lost');
  assert.equal(checkScenario(task,{scenario:{status:'completed'}},{root,originalFiles:{'protected.txt':'keep'}}).passed,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('compaction-required task fails without observed successful compaction',()=>{
 const task={requiredCapabilities:['compaction-observed'],checks:{steps:[0],maxWordsPerStep:10}};
 const r=checkScenario(task,{scenario:{status:'completed'},scenarioCheckpoints:[{index:0,status:'completed',finalText:'done'}]});
 assert.equal(r.passed,false);
});
