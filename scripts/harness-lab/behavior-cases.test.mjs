import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {behaviorCases} from './behavior-cases.mjs';
import {checkScenario} from './scenario-checks.mjs';

test('between-turn outcome requires matching controller evidence, not only correct final files',()=>{
 const task=behaviorCases[0],root=fs.mkdtempSync(path.join(os.tmpdir(),'yc-between-turn-check-'));
 try{
  for(const [name,text] of Object.entries({...task.files,...task.oracle}))fs.writeFileSync(path.join(root,name),text);
  const expected=task.checks.externalChanges[0];
  const evidence={...expected,kind:'external-change-between-turns',controllerOwned:true,applied:true,applications:1,atMs:123};
  const run={scenario:{status:'completed',unexecutedSteps:0},scenarioCheckpoints:[{index:0,kind:'user',status:'completed'},{index:1,kind:'external-change',status:'completed',evidence},{index:2,kind:'user',status:'completed'}]};
  assert.equal(checkScenario(task,run,{root,originalFiles:task.files}).passed,true);
  const missing=structuredClone(run);missing.scenarioCheckpoints.splice(1,1);
  assert.equal(checkScenario(task,missing,{root,originalFiles:task.files}).passed,false);
  const falseHash=structuredClone(run);falseHash.scenarioCheckpoints[1].evidence.afterHash='wrong';
  assert.equal(checkScenario(task,falseHash,{root,originalFiles:task.files}).passed,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
