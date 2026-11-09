import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportSuite } from './suite.mjs';
import { heldoutCases } from './heldout-cases.mjs';

const python = process.env.PYTHON ?? 'python3';
const expectedIds = ['reimbursement-policy-decisions','offset-aware-shift-schedule','correspondence-triage-actions','privacy-safe-release','service-contingency-decision','stock-allocation-with-reserve'];
function run(verifier, fixture) { return spawnSync(python, [verifier, fixture], {encoding:'utf8'}); }
function writeOracle(fixture, oracle) {
  for (const [name, contents] of Object.entries(oracle)) {
    const dest = path.join(fixture, name); fs.mkdirSync(path.dirname(dest), {recursive:true}); fs.writeFileSync(dest, contents);
  }
}
for(const c of heldoutCases)test(`${c.id} rejects newline-only changes to every preserved input`,()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yc-byte-preservation-'));
 try{
  exportSuite(path.join(tmp,'suite'),[c]);const dir=path.join(tmp,'suite',c.id),fixture=path.join(dir,'environment','fixtures'),verifier=path.join(dir,'tests','verify.py');writeOracle(fixture,c.oracle);
  assert.equal(run(verifier,fixture).status,0);
  for(const [name,contents] of Object.entries(c.files)){
   assert.ok(contents.includes('\n'));fs.writeFileSync(path.join(fixture,name),contents.replaceAll('\n','\r\n'));
   assert.notEqual(run(verifier,fixture).status,0,`${name}: CRLF rewrite must not count as byte-preserved`);
   fs.writeFileSync(path.join(fixture,name),contents);
  }
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('correspondence verifier rejects plausible fabricated commitments, addresses and recipients',()=>{
 const c=heldoutCases.find(c=>c.id==='correspondence-triage-actions');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yc-triage-fabrication-'));
 try{
  const output=path.join(tmp,'suite');exportSuite(output,[c]);const dir=path.join(output,c.id),fixture=path.join(dir,'environment','fixtures'),verifier=path.join(dir,'tests','verify.py');
  writeOracle(fixture,c.oracle);
  for(const [index,text] of [[1,'Thursday works; I have moved the meeting to 3 p.m.'],[2,'Send mail to 24 Cedar Street, Boston.'],[3,'I changed the recipient name to Julian Vale.']]){
   const rows=JSON.parse(c.oracle['triage.json']);rows[index].draftReply=text;fs.writeFileSync(path.join(fixture,'triage.json'),JSON.stringify(rows)+'\n');
   assert.notEqual(run(verifier,fixture).status,0,`fabrication accepted: ${text}`);
  }
  writeOracle(fixture,c.oracle);
  const wrongFact=JSON.parse(c.oracle['triage.json']);wrongFact[0].draftReply=wrongFact[0].draftReply.replace('$240','$999');
  fs.writeFileSync(path.join(fixture,'triage.json'),JSON.stringify(wrongFact)+'\n');
  assert.notEqual(run(verifier,fixture).status,0,'a valid template with an invented amount must fail');
  for(const value of [12,true]){
   writeOracle(fixture,c.oracle);
   const summary=JSON.parse(c.oracle['summary.json']);summary.categoryCounts.scheduling=value;
   fs.writeFileSync(path.join(fixture,'summary.json'),JSON.stringify(summary)+'\n');
   assert.notEqual(run(verifier,fixture).status,0,'wrong or boolean counts must fail independently');
  }
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('operational rationale cannot pass by mentioning keywords while contradicting constraints',()=>{
 const c=heldoutCases.find(c=>c.id==='service-contingency-decision'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yc-contingency-facts-'));
 try{
  exportSuite(path.join(tmp,'suite'),[c]);const dir=path.join(tmp,'suite',c.id),fixture=path.join(dir,'environment','fixtures');writeOracle(fixture,c.oracle);
  const decision=JSON.parse(c.oracle['decision.json']);decision.rationale='Divert is not prohibited; hold consumes 80 units out of 20.';
  fs.writeFileSync(path.join(fixture,'decision.json'),JSON.stringify(decision)+'\n');
  assert.notEqual(run(path.join(dir,'tests','verify.py'),fixture).status,0);
  const wrongCapacity=JSON.parse(c.oracle['decision.json']);wrongCapacity.rationale.usedUnits=80;
  fs.writeFileSync(path.join(fixture,'decision.json'),JSON.stringify(wrongCapacity)+'\n');
  assert.notEqual(run(path.join(dir,'tests','verify.py'),fixture).status,0,'schema-valid unsupported capacity must fail');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('schedule verifier accepts the true optimum and equivalent timezones, not the old slower reference',()=>{
 const c=heldoutCases.find(c=>c.id==='offset-aware-shift-schedule'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yc-schedule-optimum-'));
 try{
  exportSuite(path.join(tmp,'suite'),[c]);const dir=path.join(tmp,'suite',c.id),fixture=path.join(dir,'environment','fixtures'),verifier=path.join(dir,'tests','verify.py');writeOracle(fixture,c.oracle);
  const best=[{jobId:'C',start:'2026-06-01T07:00:00Z',end:'2026-06-01T07:30:00Z',resource:'Ada'},{jobId:'B',start:'2026-06-01T07:30:00Z',end:'2026-06-01T08:15:00Z',resource:'Ada'},{jobId:'A',start:'2026-06-01T07:00:00Z',end:'2026-06-01T08:00:00Z',resource:'Bo'}];
  fs.writeFileSync(path.join(fixture,'schedule.json'),JSON.stringify(best)+'\n');
  const accepted=run(verifier,fixture);assert.equal(accepted.status,0,accepted.stderr);
  const slower=[{jobId:'A',start:'2026-06-01T09:45:00+02:00',end:'2026-06-01T10:45:00+02:00',resource:'Ada'},{jobId:'B',start:'2026-06-01T09:00:00+02:00',end:'2026-06-01T09:45:00+02:00',resource:'Ada'},{jobId:'C',start:'2026-06-01T09:00:00+02:00',end:'2026-06-01T09:30:00+02:00',resource:'Bo'}];
  fs.writeFileSync(path.join(fixture,'schedule.json'),JSON.stringify(slower)+'\n');
  if(c.oracle['schedule-summary.json'])fs.writeFileSync(path.join(fixture,'schedule-summary.json'),JSON.stringify({totalDelayMinutes:45,assignmentCount:3,resourceJobCounts:{Ada:2,Bo:1}})+'\n');
  assert.notEqual(run(verifier,fixture).status,0,'feasible but suboptimal schedule must fail');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('reimbursement reason codes are disclosed rather than hidden in the reference answer',()=>{
 const c=heldoutCases.find(c=>c.id==='reimbursement-policy-decisions');const visible=c.instruction+c.files['policy.md'];
 for(const row of JSON.parse(c.oracle['decisions.json']))assert.ok(visible.includes(row.reasonCode),`undisclosed code: ${row.reasonCode}`);
});

test('held-out candidates export isolated reference outputs and reject baseline, wrong, malformed, and extra-file states', () => {
  assert.deepEqual(heldoutCases.map(c => c.id), expectedIds);
  const seen = new Set();
  for (const c of heldoutCases) {
    assert.ok(!seen.has(c.id)); seen.add(c.id);
    assert.equal(typeof c.domain, 'string'); assert.deepEqual(c.requiredCapabilities, ['single-turn','filesystem']);
    assert.match(c.instruction,/Create only the named output files/,'no-extra-files verifier rule must be disclosed');
    assert.ok(Object.keys(c.files).length && Object.keys(c.oracle).length);
    assert.ok(Object.keys(c.oracle).every(name => !Object.hasOwn(c.files,name)), `${c.id} has separate oracle artifacts`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'yc-heldout-'));
  try {
    const output = path.join(tmp,'suite'); exportSuite(output, heldoutCases);
    for (const c of heldoutCases) {
      const dir=path.join(output,c.id), fixture=path.join(dir,'environment','fixtures'), verifier=path.join(dir,'tests','verify.py');
      for (const [name,contents] of Object.entries(c.files)) assert.equal(fs.readFileSync(path.join(fixture,name),'utf8'),contents,`${c.id}/${name} fixture intact`);
      for (const name of Object.keys(c.oracle)) assert.equal(fs.existsSync(path.join(fixture,name)),false,`${c.id}/${name} oracle hidden`);
      assert.notEqual(run(verifier,fixture).status,0,`${c.id} baseline fails`);
      writeOracle(fixture,c.oracle);
      const good=run(verifier,fixture); assert.equal(good.status,0,`${c.id} oracle fails: ${good.stderr}`);
      const first=Object.keys(c.oracle)[0], original=fs.readFileSync(path.join(fixture,first),'utf8');
      fs.writeFileSync(path.join(fixture,first), original.replace(/[0-9]/, '9')+'\n');
      assert.notEqual(run(verifier,fixture).status,0,`${c.id} targeted changed reference fails`);
      fs.writeFileSync(path.join(fixture,first),original);
      if (first.endsWith('.json')) {
        const parsed=JSON.parse(original);
        if (Array.isArray(parsed)) parsed[0].unexpected='extra'; else parsed.unexpected='extra';
        fs.writeFileSync(path.join(fixture,first),JSON.stringify(parsed)+'\n');
        assert.doesNotThrow(()=>JSON.parse(fs.readFileSync(path.join(fixture,first),'utf8')),'schema negative must remain parseable JSON');
        assert.notEqual(run(verifier,fixture).status,0,`${c.id} unexpected schema field fails`);
        fs.writeFileSync(path.join(fixture,first),original);
      }
      // Exact output schemas promise no side effects; this tests the verifier, not agent code.
      fs.writeFileSync(path.join(fixture,'unexpected-output.txt'),'unexpected\n');
      assert.notEqual(run(verifier,fixture).status,0,`${c.id} extra output fails`);
      fs.unlinkSync(path.join(fixture,'unexpected-output.txt'));
      const source=Object.keys(c.files)[0], prior=fs.readFileSync(path.join(fixture,source));
      fs.writeFileSync(path.join(fixture,source),Buffer.concat([prior,Buffer.from('corruption\n')]));
      assert.notEqual(run(verifier,fixture).status,0,`${c.id} source mutation fails`);
    }
  } finally { fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:20}); }
});
