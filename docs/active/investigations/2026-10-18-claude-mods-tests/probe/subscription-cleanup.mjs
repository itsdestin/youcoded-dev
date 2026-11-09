// Delete only the newly created test profile, without reading credentials or revoking shared account sessions.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const credits=process.argv.includes('--credits');
const evidence=fileURLToPath(new URL(credits?'../evidence/subscription-credits/':'../evidence/subscription/',import.meta.url));
const profile=JSON.parse(fs.readFileSync(path.join(evidence,'profile.json'),'utf8'));
const run=JSON.parse(fs.readFileSync(path.join(evidence,'run.json'),'utf8'));
const root=profile.root;
assert(/^\/tmp\/yc-subscription-smoke-[A-Za-z0-9]+$/.test(root));
assert.equal(profile.project,path.join(root,'project'));
assert.equal(run.controllerClosed,true);
assert(run.phases.every(p=>p.exit!==null));
assert(run.submittedInvocations<=profile.maxPrompts);
assert(run.grants.length<=profile.maxPrompts);
if(!credits){
 assert.equal(run.submittedInvocations,1);assert.equal(run.grants.length,1);
 assert(run.phases[0].messages.some(r=>r.type==='assistant'&&r.model==='<synthetic>'&&Array.isArray(r.content)&&r.content.some(c=>c.type==='text'&&c.text.includes("You've hit your weekly limit"))));
}else{
 assert.equal(profile.maxPrompts,2);assert.equal(run.previousAttempts,1);assert(run.cumulativePromptGrants<=3);
}
const ancestors=new Set();let pid=process.pid;
while(pid>0&&!ancestors.has(pid)){
 ancestors.add(pid);
 try{pid=Number(fs.readFileSync('/proc/'+pid+'/status','utf8').match(/^PPid:\s+(\d+)/m)[1]);}catch{break;}
}
const remaining=[];
for(const id of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n))){
 if(ancestors.has(Number(id)))continue;
 try{const args=fs.readFileSync('/proc/'+id+'/cmdline','utf8').split('\0');if(args.some(a=>a.startsWith(root)))remaining.push(Number(id));}catch{}
}
assert.deepEqual(remaining,[],'A test-profile process is still running; do not delete its state');
if(fs.existsSync(root)){
 assert(fs.lstatSync(root).isDirectory()&&!fs.lstatSync(root).isSymbolicLink());
 fs.rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
const result={removedProfile:root,temporaryProfileRemoved:!fs.existsSync(root),remainingOwnedProcesses:remaining,controllerClosed:true,promptAttempts:run.submittedInvocations,remainingAuthorizedPromptsNotSent:profile.maxPrompts-run.grants.length,credentialFilesReadOrCopied:false,globalLogoutOrRevocationPerformed:false,reason:credits?'Bounded credit smoke run ended':'Stopped on native Claude weekly-limit response',at:new Date().toISOString()};
assert.equal(result.temporaryProfileRemoved,true);
fs.writeFileSync(path.join(evidence,'cleanup.json'),JSON.stringify(result,null,2),{flag:'wx'});
console.log('Verified: '+run.submittedInvocations+' prompt attempt(s); '+result.remainingAuthorizedPromptsNotSent+' not sent; no remaining test-profile processes; temporary signed-in profile removed.');
