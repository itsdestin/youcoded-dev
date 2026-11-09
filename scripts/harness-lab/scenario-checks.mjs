import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

function safeRead(root,name) {
  const base=fs.realpathSync(root);
  const resolved=fs.realpathSync(path.resolve(base,name));
  const relative=path.relative(base,resolved);
  if(relative.startsWith('..')||path.isAbsolute(relative)) throw new Error('Verifier path escapes fixture');
  return fs.readFileSync(resolved,'utf8');
}

export function checkScenario(task,run,{root,originalFiles={}}={}) {
  const checks=[];
  const add=(name,status,detail)=>checks.push({name,status,detail});
  const scenario=run.scenario??run;
  const observed=run.scenarioCheckpoints??scenario.steps??[];
  const checkpoints=Array.isArray(observed)?observed:[];
  const declaredComplete=!task.steps||task.steps.every((step,index)=>checkpoints.some(row=>row.index===index&&row.kind===step.kind&&row.status==='completed'));
  add('scenario-complete',scenario.status==='completed'&&scenario.unexecutedSteps===0&&declaredComplete?'passed':'failed','All declared steps must execute successfully');
  for(const expected of task.checks?.externalChanges??[]){
    const row=checkpoints.find(s=>s.index===expected.stepIndex),e=row?.evidence;
    const valid=row?.kind==='external-change'&&row.status==='completed'&&e?.kind==='external-change-between-turns'&&e.controllerOwned===true&&e.applied===true&&e.applications===1&&e.file===expected.file&&e.beforeHash===expected.beforeHash&&e.afterHash===expected.afterHash&&Number.isFinite(e.atMs);
    add(`external-change-${expected.stepIndex}`,valid?'passed':'failed','Require matching controller-owned before/after hashes; final files alone are insufficient');
  }
  if((task.requiredCapabilities??[]).includes('compaction-observed'))
    add('observed-compaction',checkpoints.some(s=>s.kind==='compact'&&s.compactionSucceeded===true)?'passed':'failed','A requested compaction is not proof it occurred');
  for(const index of task.checks?.steps??[]) {
    const step=checkpoints.find(s=>s.index===index);
    if(!step) {add(`step-${index}`,'never-ran','No recorded output');continue;}
    const text=step.finalText?.trim()??'';
    const words=text.split(/\s+/u).filter(Boolean).length;
    add(`step-${index}`,step.status==='completed'&&text&&words<=task.checks.maxWordsPerStep?'passed':'failed',`${words} words; limit ${task.checks.maxWordsPerStep}. Correctness needs separate review.`);
  }
  if(task.checks?.file) {
    try {
      const value=JSON.parse(safeRead(root,task.checks.file));
      add('artifact',isDeepStrictEqual(value,task.checks.jsonEquals)?'passed':'failed','Exact required structured outcome');
    } catch(error) {add('artifact','failed',error.message);}
  }
  for(const name of task.checks?.unchangedFiles??[]) {
    if(!(name in originalFiles)) {add(`preserved-${name}`,'never-ran','Original content was not captured');continue;}
    try {add(`preserved-${name}`,safeRead(root,name)===originalFiles[name]?'passed':'failed','Compare with fixture baseline');}
    catch(error) {add(`preserved-${name}`,'failed',error.message);}
  }
  return {passed:checks.length>0&&checks.every(c=>c.status==='passed'),checks,
    humanReviewRequired:!!task.checks?.humanRubric,
    humanRubric:task.checks?.humanRubric??null};
}
