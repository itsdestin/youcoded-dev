import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { developmentTasks, requiredLabInputs, snapshotDesktop, planTargeted, writeTargetedPlan } from './targeted-plan.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'targeted-plan-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true, maxRetries:5}));
  const build = path.join(root, 'desktop');
  for (const file of ['dist/main/create-runtime.js', 'package.json', 'package-lock.json', ...requiredLabInputs]) {
    fs.mkdirSync(path.dirname(path.join(build, file)), {recursive:true});
    fs.writeFileSync(path.join(build, file), file.endsWith('.json') ? '{}' : '// fixture\n');
  }
  const input = {baselineDesktopDir:build, candidateDesktopDir:build, model:'anthropic/claude-haiku-5.5', pinnedProvider:'Anthropic', tasks:['finish-the-file'], profile:'smoke', assumedInputTokens:1000, assumedOutputTokens:200, budgetUsd:1};
  return {root, build, input, output:path.join(root,'output')};
}

test('bounded development selection produces matched rotating pairs for both profiles', t => {
  const {input,build} = fixture(t), snapshot = snapshotDesktop(build);
  assert.equal(developmentTasks.length,13);
  for (const [profile,repeats] of [['smoke',1],['confirmation',3]]) for (const count of [1,2,3]) {
    const plan = planTargeted({...input,profile,tasks:developmentTasks.slice(0,count).map(c=>c.id)}, {baseline:snapshot,candidate:snapshot});
    assert.equal(plan.plannedCells,2*count*repeats);
    assert.equal(plan.canRun,false); assert.equal(plan.executionAuthorized,false);
    for(let i=0;i<plan.cells.length;i+=2) {
      const [a,b]=plan.cells.slice(i,i+2);
      assert.equal(a.pairKey,b.pairKey); assert.notEqual(a.agent,b.agent);
      assert.equal(a.agent,((i/2)%count + a.repetition)%2 ? 'candidate':'baseline');
      assert.equal(a.pinnedProvider,'Anthropic');
    }
  }
});

test('A/A warning uses content hashes, changed runtime bytes change fingerprint', t => {
  const {input,build}=fixture(t), before=snapshotDesktop(build);
  const aa=planTargeted(input,{baseline:before,candidate:before});
  assert.equal(aa.sameBuild,true); assert.match(aa.warnings.join(' '),/A\/A/);
  fs.appendFileSync(path.join(build,'dist/main/create-runtime.js'),'// change');
  const after=snapshotDesktop(build);
  assert.notEqual(before.sha256,after.sha256);
  assert.equal(planTargeted(input,{baseline:before,candidate:after}).sameBuild,false);
  assert.equal(before.desktopDir,fs.realpathSync(build));
});

test('fingerprints metadata and all lab inputs, and identical copies are A/A', t => {
  const {input,build,root}=fixture(t), before=snapshotDesktop(build);
  const copy=path.join(root,'copy'); fs.cpSync(build,copy,{recursive:true});
  const copied=snapshotDesktop(copy);
  assert.notEqual(before.desktopDir,copied.desktopDir);
  assert.equal(planTargeted(input,{baseline:before,candidate:copied}).sameBuild,true);
  for (const file of ['package.json','package-lock.json',...requiredLabInputs]) {
    fs.appendFileSync(path.join(copy,file),' ');
    assert.notEqual(snapshotDesktop(copy).files[file],before.files[file]);
  }
});

test('oversized inputs are refused before reading bytes or creating output', t => {
  const {input,build,output}=fixture(t);
  fs.truncateSync(path.join(build,'dist/main/create-runtime.js'),128*1024*1024+1);
  assert.throws(()=>writeTargetedPlan(input,output),/128 MiB/);
  assert.equal(fs.existsSync(output),false);
});

test('rejects malformed selections, assumptions, routes and unknown fields before writing', t => {
  const {input,output}=fixture(t);
  for (const patch of [{tasks:[]},{tasks:developmentTasks.slice(0,4).map(c=>c.id)},{tasks:['finish-the-file','finish-the-file']},{tasks:['heldout-secret']},{tasks:['*']},{profile:'full'},{model:'not-a-model'},{model:[]},{pinnedProvider:''},{pinnedProvider:'*'},{assumedInputTokens:-1},{assumedInputTokens:1.5},{assumedOutputTokens:'200'},{assumedOutputTokens:Infinity},{budgetUsd:0},{budgetUsd:NaN},{budgetUsd:'1'},{executionAuthorized:true}]) {
    assert.throws(()=>writeTargetedPlan({...input,...patch},output));
    assert.equal(fs.existsSync(output),false);
  }
});

test('budget is illustrative and over-budget plans retain every cell', t => {
  const {input,build}=fixture(t), snapshot=snapshotDesktop(build);
  const plan=planTargeted({...input,budgetUsd:0.00001},{baseline:snapshot,candidate:snapshot});
  assert.equal(plan.overBudget,true); assert.equal(plan.plannedCells,2);
  assert.equal(plan.estimatedTotalUsd,0.0004);
});

test('fresh export has selected fixtures and verifiers, never oracle solutions; records hashes', t => {
  const {input,output}=fixture(t), plan=writeTargetedPlan(input,output);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'plan.json'),'utf8')),plan);
  assert.deepEqual(fs.readdirSync(path.join(output,'tasks')),['finish-the-file']);
  assert.equal(fs.existsSync(path.join(output,'tasks/finish-the-file/environment/fixtures/result.json')),false);
  assert.equal(fs.existsSync(path.join(output,'tasks/finish-the-file/tests/verify.py')),true);
  assert.ok(Object.keys(plan.exportedFileHashes).length>0);
  assert.ok(plan.taskDefinitionHashes['finish-the-file']);
  const all=fs.readdirSync(output,{recursive:true});
  assert.equal(all.some(p=>String(p).includes('oracle')),false);
  assert.throws(()=>writeTargetedPlan(input,output),/exist/i);
});

test('missing runtime or lab inputs refuse without leaving output', t => {
  for(const file of ['dist/main/create-runtime.js',...requiredLabInputs,'package-lock.json']) {
    const {input,build,output}=fixture(t);
    fs.unlinkSync(path.join(build,file));
    assert.throws(()=>writeTargetedPlan(input,output)); assert.equal(fs.existsSync(output),false);
  }
});

test('refuses symlinks in build, ancestors and output paths', {skip:process.platform==='win32' ? 'symlink privileges vary on Windows' : false}, t => {
  const {input,build,root,output}=fixture(t);
  const link=path.join(root,'link'); fs.symlinkSync(build,link,'dir');
  assert.throws(()=>snapshotDesktop(link),/symlink/i);
  fs.symlinkSync(path.join(build,'package.json'),path.join(build,'dist/linked.json'));
  assert.throws(()=>writeTargetedPlan(input,output),/symlink/i);
  fs.unlinkSync(path.join(build,'dist/linked.json'));
  const outLink=path.join(root,'out-link'); fs.symlinkSync(root,outLink,'dir');
  assert.throws(()=>writeTargetedPlan(input,path.join(outLink,'new')),/symlink/i);
  fs.symlinkSync(path.join(root,'missing'),output);
  assert.throws(()=>writeTargetedPlan(input,output),/exist|symlink/i);
});
