// WHY: preserve only synthetic chat rows after CLI exit; never inspect credentials.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const evidence=fileURLToPath(new URL('../evidence/subscription-credits/',import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(path.join(evidence,name),'utf8'));
const run=read('run.json'),budget=read('prompt-budget.json'),profile=read('profile.json'),launch=read('launch.json');
const durableFile=path.join(evidence,'post-exit-messages.json');
if(process.argv.includes('--capture')){
 assert(/^\/tmp\/yc-subscription-smoke-[A-Za-z0-9]+$/.test(profile.root));
 assert(run.phases.every(p=>p.exit!==null)&&run.controllerClosed);
 const rows=[];
 function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,item.name);
  if(item.isDirectory())scan(file);
  else if(item.name.endsWith('.jsonl'))for(const line of fs.readFileSync(file,'utf8').split('\n').filter(Boolean)){
   const r=JSON.parse(line);
   if(r.type==='user'||r.type==='assistant')rows.push({type:r.type,uuid:r.uuid,sessionId:r.sessionId,model:r.message?.model,content:r.message?.content});
  }
 }}
 scan(path.join(profile.root,'home/.claude/projects'));
 fs.writeFileSync(durableFile,JSON.stringify(rows,null,2),{flag:'wx'});
}
const rows=JSON.parse(fs.readFileSync(durableFile,'utf8'));
assert.equal(launch.exit,0);assert.equal(run.auth.authMethod,'claude.ai');assert.equal(run.auth.apiProvider,'firstParty');assert.equal(run.auth.subscriptionType,'max');
assert.equal(run.maxPrompts,2);assert.equal(run.previousAttempts,1);assert.equal(run.submittedInvocations,2);assert.equal(run.cumulativePromptGrants,3);assert.equal(run.remainingPromptAllowance,0);
assert.equal(budget.max,2);assert.equal(budget.grants.length,2);assert.equal(run.phases.length,2);assert.equal(run.controllerClosed,true);
const [first,resume]=run.phases;
assert.equal(first.mod.id,resume.mod.id);assert(resume.args.includes('--resume'));assert(resume.args.includes(first.mod.id));
const answers=['SUBSCRIPTION_PROBE_TWO_73','café 第二行 🧪'];
for(const [i,p]of run.phases.entries()){
 assert(p.completed&&p.mod.handshake&&p.mod.done&&!p.mod.error);assert.deepEqual(p.mod.tools,[]);
 assert.equal(p.mod.model,'claude-haiku-5-5');assert.equal(p.mod.ends.length,1);
 assert.equal(p.mod.ends[0].reason,'answer');assert.equal(p.mod.ends[0].answer,answers[i]);assert.equal(p.mod.ends[0].usage.model,'claude-haiku-5-5');
 assert(p.mod.ends[0].usage.output_tokens>0);assert(p.exit!==null);
 const prompt=budget.grants[i].text;
 assert.equal(rows.filter(r=>r.type==='user'&&r.content===prompt).length,1);
 assert.equal(rows.filter(r=>r.type==='assistant'&&r.model==='claude-haiku-5-5'&&r.content?.some(b=>b.type==='text'&&b.text===answers[i])).length,1);
}
assert(rows.every(r=>r.sessionId===first.mod.id));assert.equal(new Set(rows.map(r=>r.uuid)).size,4);
assert.equal(resume.mod.messages.filter(m=>m.role==='user').length,2);assert.equal(resume.mod.messages.filter(m=>m.role==='assistant').length,2);
const cost=resume.mod.usage.cost.usd;assert(typeof cost==='number'&&cost>0&&cost<0.01);
console.log('PASS: two real Haiku answers through the authenticated inline mod; same-ID resume; exact Unicode reply; both prompts/replies saved once after exit; zero tools; cumulative three-attempt authorization respected.');
console.log('CLI-estimated cumulative session cost USD: '+cost+' (not a verified credit-balance debit).');
