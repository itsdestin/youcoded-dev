// WHY: this checker reads captured CLI evidence and owned synthetic files only; it never launches a CLI or changes history.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const base=new URL('../',import.meta.url).pathname;
const read=p=>JSON.parse(fs.readFileSync(base+p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++;};
const batches=['compat-batch1','compat-batch2','compat-crash-followup'];
for(const b of batches){
 const l=read('evidence/'+b+'/launch.json');ok(l.exitCode===0,b+' driver exit');ok(l.remainingSandboxProcesses.length===0,b+' no remaining owned processes');
 for(const flag of ['--ro-bind','--clearenv','--unshare-net','--unshare-pid'])ok(l.command.includes(flag),b+' '+flag);
 ok(l.preservation.every(p=>p.unchanged),b+' preservation at finish');
 for(const p of l.preservation.filter(p=>!p.file.includes('/probe/compat-')))ok(hash(p.file)===p.before,'prior evidence/probe still preserved: '+p.file);
}
const load=(name,b='compat-batch2')=>read('evidence/'+b+'/'+name+'.json');
const cases=['controls300','gate300','crash302','catch302allow','catch302ask'];
for(const name of cases){
 const r=load(name);ok(r.serversClosed,name+' servers closed');ok(hash(r.binary)===r.binarySha256,name+' exact binary preserved');ok(r.requests.every(x=>x.dummyAuth),name+' dummy auth only');
 for(const p of r.phases){ok(p.exit!==null,name+' CLI exited');ok(p.cliNetworkNamespace===p.networkNamespace,name+' namespace same');}
 const failed=load(name,'compat-batch1');ok(failed.requests.length===0&&failed.phases[0].modReport===null,'initial rejected fixture retained '+name);
}
const c=load('controls300'),rows=c.phases[0].modReport.rows;
ok(c.version.trim()==='2.1.300 (Claude Code)','actual 300');ok(c.phases[0].modReport.done&&rows.every(r=>r.ok),'300 all control steps completed');
ok(rows.find(r=>r.name==='model').value.model==='claude-sonnet-5-5','model getter');ok(c.requests.length===3&&c.requests.every(r=>r.body.model==='claude-sonnet-5-5'),'all actual local request models');
const clear=rows.find(r=>r.name==='clear').value;ok(clear.before!==clear.after,'clear ID changed');ok(rows.find(r=>r.name==='compact').value.id===clear.after,'compact same ID');
const transcripts=c.phases[0].transcripts.flatMap(t=>t.text.split('\n').filter(Boolean).map(l=>JSON.parse(l)));
ok(c.phases[0].transcripts.length>=2,'clear separate transcript files');ok(transcripts.some(r=>r.subtype==='compact_boundary'),'compact durable boundary');
const marker='compat repeat 第二行 café 🧪\nline two';ok(transcripts.filter(r=>r.type==='user'&&r.message?.content===marker).length===2,'repeated multiline Unicode exactly twice on disk');
const reference=read('evidence/controls.json').interactive.modReport.rows;
for(const [name,oldName] of [['model','model-sonnet'],['clear','clear'],['compact','compact']]){const now=rows.find(r=>r.name===name),before=reference.find(r=>r.name===oldName);ok(now.ok===before.ok&&JSON.stringify(now.value.result)===JSON.stringify(before.value.result),'302 reference result parity '+name);}
ok(reference.find(r=>r.name==='model-sonnet').value.model===rows.find(r=>r.name==='model').value.model,'302 reference selected model parity');
const g=load('gate300');ok(g.requests.length===4,'300 gate four model requests');ok(g.phases[0].modReport.events.filter(e=>e.event==='underlying').every(e=>e.underlying.decision==='ask'),'300 actual core ask');
ok(g.files.allow.content==='SYNTHETIC compat allow\n'&&fs.readFileSync(g.files.allow.path,'utf8')===g.files.allow.content,'300 external allow exact file');ok(!g.files.deny.exists&&!fs.existsSync(g.files.deny.path),'300 deny no file');
ok(JSON.stringify(g.requests).includes('Explicit synthetic compat deny'),'300 denial reaches model');
const failedCrash=load('crash302');ok(failedCrash.phases[0].pendingAtCrash&&failedCrash.phases[0].exit.signal===9,'initial real crash pending approval');ok(failedCrash.phases[1].raw.includes('No conversation found with session ID'),'initial early-persistence resume refusal preserved');
const r=load('crash302','compat-crash-followup'),[first,second]=r.phases;
ok(first.durableToolObserved&&first.pendingAtCrash&&first.exit.signal===9&&first.procAbsent,'exact owned CLI killed while durable approval pending');ok(second.modReport.done&&second.modReport.id===first.modReport.id,'same ID supported resume');ok(second.command.includes('--resume'),'supported flag');
ok(r.preResumeTranscriptHashes.every(t=>t.unchanged),'transcripts untouched before resume');ok(r.requests.length===3,'three scripted crash/recovery requests');
const old=r.serviceEvents.find(e=>e.path==='/old.txt'),fresh=r.serviceEvents.find(e=>e.path==='/new.txt');ok(old.decision==='allow'&&old.destroyedBeforeResponse&&r.lateAnswer.oldProcAbsent,'late old allow after old process gone');ok(old.respondedAt>=fresh.receivedAt&&fresh.decision==='deny'&&fresh.respondedAt>old.respondedAt,'new pending distinct own deny after old late reply');
for(const n of ['old','new'])ok(!r.files[n].exists&&!fs.existsSync(r.files[n].path),n+' never written');
const messages=second.modReport.rows.find(x=>x.name==='send').value.messages;
for(const prompt of ['SYNTHETIC compat OLD pending approval','SYNTHETIC compat NEW distinct deny'])ok(messages.filter(m=>m.role==='user'&&m.text===prompt).length===1,'no duplicate prompt '+prompt);
ok(messages.some(m=>m.toolResults?.some(t=>t.isError&&t.text.includes('session ended before this call'))),'previous tool clearly marked interrupted unknown');
ok(messages.some(m=>m.toolResults?.some(t=>t.isError&&t.text.includes('Explicit synthetic compat deny'))),'new denial recorded');
const requestText=JSON.stringify(r.requests[1].body);ok(requestText.includes('Tool call interrupted')&&requestText.includes('SYNTHETIC compat OLD pending approval'),'resumed API saw prior history and orphan error');
for(const suffix of ['allow','ask']){
 const x=load('catch302'+suffix),m=x.phases[0].modReport;
 ok(m.events.some(e=>e.event==='gate-throw')&&m.events.some(e=>e.event==='catch-throw'),'gate and catch actually threw '+suffix);
 ok(m.events.filter(e=>e.event==='underlying').every(e=>e.underlying.decision===suffix),'underlying policy '+suffix);
 ok(m.rows.find(e=>e.name==='check').value.decision===suffix,'normal direct check '+suffix);
 if(suffix==='allow')ok(x.files.catch.exists&&fs.readFileSync(x.files.catch.path,'utf8')==='SYNTHETIC compat catch\n'&&m.done,'allow resumed Write');
 else ok(!x.files.catch.exists&&!fs.existsSync(x.files.catch.path)&&!m.done&&x.requests.length===1,'ask stayed pending without Write');
}
const ts=createRequire(new URL('../../../../../youcoded/desktop/package.json',import.meta.url))('typescript'),printer=ts.createPrinter({removeComments:true});
function declarations(file){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),map=new Map();function visit(node){if((ts.isTypeAliasDeclaration(node)||ts.isInterfaceDeclaration(node))&&node.name)map.set(node.name.text,printer.printNode(ts.EmitHint.Unspecified,node,source));ts.forEachChild(node,visit);}visit(source);return map;}
const a=declarations(c.generatedTypes.path),b=declarations(load('crash302').generatedTypes.path);
const keys=['CommandRunArgs','CommandRunInput','CommandRunResult','PromptSubmitArgs','PromptSubmitInput','PromptSubmitResult','SessionMessagesCall','ToolCheckArgs','ToolCheckInput','ToolCheckResult'];
for(const key of keys)ok(a.has(key)&&a.get(key)===b.get(key),'key API type unchanged '+key);
ok(a.get('HookFailure')!==b.get('HookFailure'),'HookFailure drift detected');ok(a.get('InputProps')!==b.get('InputProps')&&b.has('EnvSetResult'),'input and env declaration drift');
const drift=[...new Set([...a.keys(),...b.keys()])].filter(k=>a.get(k)!==b.get(k));
console.log(JSON.stringify({versions:{'2.1.300':c.binarySha256,'2.1.302':r.binarySha256},unchangedKeySignatures:keys,declarationTypesChanged:drift,requests:{batch1:0,batch2:cases.reduce((n,k)=>n+load(k).requests.length,0),crashFollowup:r.requests.length},initialCrash:'No conversation found (only metadata persisted)',resumedOldTool:'interrupted; outcome unknown',cleanup:'all recorded owned processes/services stopped'},null,2));
console.log('PASS: '+checks+' captured-evidence assertions (includes preservation checks, not independent behavioral scenarios).');
