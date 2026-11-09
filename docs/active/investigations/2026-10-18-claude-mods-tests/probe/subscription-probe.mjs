// User-authorized cap: three attempts total; --credits permits only the two left after the quota refusal.
// Never reads/copies credentials, proxies model traffic, or retries submitted prompts.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const credits=process.argv.includes('--credits');
const cap=credits?2:3;
const evidence=path.resolve(here,credits?'../evidence/subscription-credits':'../evidence/subscription');
const previousAttempts=credits?JSON.parse(fs.readFileSync(path.resolve(here,'../evidence/subscription/run.json'),'utf8')).submittedInvocations:0;
if(credits&&previousAttempts!==1)throw Error('Original attempt count changed; review cumulative authorization');
const profile=JSON.parse(fs.readFileSync(path.join(evidence,'profile.json'),'utf8'));
const binary=profile.binary,root=profile.root,project=profile.project;
if(!root.startsWith('/tmp/yc-subscription-smoke-')||!project.startsWith(root+'/')||profile.maxPrompts!==cap)throw Error('Unexpected test profile or prompt cap');
const budgetPath=path.join(evidence,'prompt-budget.json');
const reportPath=path.join(evidence,'run.json');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function environment(){
 const home=path.join(root,'home');
 return {PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,CLAUDE_CONFIG_DIR:path.join(home,'.claude'),TMPDIR:path.join(root,'tmp'),XDG_CONFIG_HOME:path.join(home,'.config'),XDG_CACHE_HOME:path.join(home,'.cache'),XDG_DATA_HOME:path.join(home,'.local/share'),XDG_STATE_HOME:path.join(home,'.local/state'),XDG_RUNTIME_DIR:path.join(root,'runtime'),TERM:'xterm-256color',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',BROWSER:'/usr/bin/true',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
}
if(process.argv[2]==='--launch'){
 if(fs.existsSync(budgetPath)||fs.existsSync(reportPath))throw Error('Budget/evidence already exists; no automatic rerun');
 const env=environment();
 // Network stays available solely because this batch explicitly uses the user's
 // subscription. Filesystem/PID isolation and cleared credentials environment remain.
 const args=['--ro-bind','/','/','--tmpfs','/tmp','--bind',root,root,'--bind',evidence,evidence,'--tmpfs','/run/user','--dev','/dev','--proc','/proc','--unshare-pid','--die-with-parent','--clearenv'];
 for(const[k,v]of Object.entries(env))args.push('--setenv',k,v);
 args.push('--','/usr/bin/node',fileURLToPath(import.meta.url),'--inside',...(credits?['--credits']:[]));
 const r=spawnSync('/usr/bin/bwrap',args,{env:{PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:220000,maxBuffer:100000});
 fs.writeFileSync(path.join(evidence,'launch.json'),JSON.stringify({command:['/usr/bin/bwrap',...args],exit:r.status,signal:r.signal,error:r.error?.message,stdout:r.stdout,stderr:r.stderr,network:'real subscription network; no model proxy',maxUserPrompts:cap,previousAttempts},null,2),{flag:'wx'});
 console.log(r.stdout);if(r.stderr)console.error(r.stderr);process.exit(r.status??1);
}
if(process.argv[2]!=='--inside')throw Error('Use --launch');
const env=environment();
const require=createRequire(path.resolve(here,'../../../../../youcoded/desktop/package.json'));
const pty=require('node-pty');
const report={version:spawnSync(binary,['--version'],{env,encoding:'utf8'}).stdout.trim(),model:'haiku',maxPrompts:cap,previousAttempts,phases:[],modelTools:'disabled',credentialHandling:'official CLI only; no credential file read or copied'};
const status=spawnSync(binary,['auth','status'],{env,cwd:project,encoding:'utf8',timeout:12000});
const auth=JSON.parse(status.stdout);
report.auth={loggedIn:auth.loggedIn,authMethod:auth.authMethod,apiProvider:auth.apiProvider,subscriptionType:auth.subscriptionType};
if(auth.loggedIn!==true||auth.authMethod!=='claude.ai'||auth.apiProvider!=='firstParty')throw Error('Subscription sign-in not verified; refusing any prompt');
// Only this new test profile's ordinary CLI configuration is updated. It is NOT
// the credentials file, and no account fields are copied into evidence.
const config=path.join(env.CLAUDE_CONFIG_DIR,'.claude.json');
const settings=fs.existsSync(config)?JSON.parse(fs.readFileSync(config,'utf8')):{};
settings.hasCompletedOnboarding=true;
settings.projects??={};settings.projects[project]={...(settings.projects[project]??{}),hasTrustDialogAccepted:true};
fs.writeFileSync(config,JSON.stringify(settings),{mode:0o600});
const plugin=path.join(root,'subscription-plugin');
fs.mkdirSync(path.join(plugin,'.claude-plugin'),{recursive:true});fs.mkdirSync(path.join(plugin,'hooks'),{recursive:true});
fs.writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({name:'isolated-subscription-smoke',version:'0.0.1',description:'Three explicitly authorized Haiku prompts; no model tools'}));
fs.writeFileSync(path.join(plugin,'hooks/hooks.json'),JSON.stringify({modules:['./register.ts']}));
fs.copyFileSync(path.join(here,'subscription-fixture.ts'),path.join(plugin,'hooks/register.ts'));
const validation=spawnSync(binary,['plugin','validate',plugin,'--json'],{env,cwd:project,encoding:'utf8',timeout:15000});
report.validation={exit:validation.status,stdout:validation.stdout,stderr:validation.stderr};
if(validation.status!==0){fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});throw Error('Static validation failed; zero prompts sent');}
const prompts=credits
 ?{first:['Reply with exactly SUBSCRIPTION_PROBE_TWO_73 and nothing else. Do not call tools.'],resume:['Reply with exactly café 第二行 🧪 and nothing else. Do not call tools.']}
 :{first:['Reply with exactly SUBSCRIPTION_PROBE_ONE_73 and nothing else. Do not call tools.'],resume:['Reply with exactly SUBSCRIPTION_PROBE_TWO_73 and nothing else. Do not call tools.','Reply with exactly café 第二行 🧪 and nothing else. Do not call tools.']};
if(Object.values(prompts).flat().length!==cap||previousAttempts+cap!==3)throw Error('Prompt authorization mismatch');
const budget={max:cap,previousAttempts,grants:[],phaseGranted:{first:0,resume:0}};
fs.writeFileSync(budgetPath,JSON.stringify(budget,null,2),{flag:'wx'});
const key=crypto.randomUUID();let activePhase;
const server=http.createServer((req,res)=>{
 const phase=req.url?.split('/')[2];
 if(req.method!=='POST'||req.headers['x-probe-key']!==key||phase!==activePhase||!prompts[phase]){res.writeHead(403);res.end('Refused');return;}
 const index=budget.phaseGranted[phase];
 if(budget.grants.length>=cap||index>=prompts[phase].length){res.writeHead(409);res.end('Prompt cap reached');return;}
 const grant={id:budget.grants.length+1,phase,text:prompts[phase][index],at:new Date().toISOString()};
 // Reserve before answering: a lost answer consumes a ticket instead of being retried.
 budget.grants.push(grant);budget.phaseGranted[phase]++;
 fs.writeFileSync(budgetPath,JSON.stringify(budget,null,2));
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({allowed:true,id:grant.id,text:grant.text}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
function jsonlFiles(dir){if(!fs.existsSync(dir))return[];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?jsonlFiles(p):e.name.endsWith('.jsonl')?[p]:[];});}
function savedMessages(){
 // Read only this test project's transcript records, never credentials or auth logs.
 return jsonlFiles(path.join(env.CLAUDE_CONFIG_DIR,'projects')).flatMap(file=>fs.readFileSync(file,'utf8').split('\n').filter(Boolean).flatMap(line=>{try{const r=JSON.parse(line);return ['user','assistant'].includes(r.type)?[{file:path.basename(file),type:r.type,uuid:r.uuid,sessionId:r.sessionId,model:r.message?.model,content:r.message?.content}]:[];}catch{return[];}}));
}
async function phase(name,resumeId){
 activePhase=name;
 const file=path.join(project,'subscription-report.json');if(fs.existsSync(file))fs.unlinkSync(file);
 fs.writeFileSync(path.join(project,'subscription-controller.json'),JSON.stringify({phase:name,count:prompts[name].length,url,key}),{mode:0o600});
 const args=['--model','haiku','--tools','','--permission-mode','dontAsk','--prompt-suggestions','false','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--plugin-dir',plugin,...(resumeId?['--resume',resumeId]:[])];
 let exit=null,raw='';const child=pty.spawn(binary,args,{cwd:project,env,name:'xterm-256color',cols:110,rows:32});
 child.onData(d=>{raw=(raw+d).slice(-20000);});child.onExit(e=>{exit=e;});
 const p={name,pid:child.pid,args,startedAt:new Date().toISOString()};
 try{
  const deadline=Date.now()+85000;
  while(Date.now()<deadline&&exit===null){await sleep(150);if(fs.existsSync(file)){try{if(JSON.parse(fs.readFileSync(file,'utf8')).done)break;}catch{}}}
  p.mod=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
  // Wait for the expected synthetic user rows to be durable before intentionally stopping.
  const durableUntil=Date.now()+5000;
  while(Date.now()<durableUntil){const rows=savedMessages();if(prompts[name].every(text=>rows.some(r=>r.type==='user'&&r.content===text)))break;await sleep(100);}
  p.messages=savedMessages();
  p.statusHints={notLoggedIn:raw.includes('Not logged in'),usageLimit:raw.includes("hit your")&&raw.includes('limit'),permissionPrompt:raw.includes('Do you want to proceed?')};
  p.completed=Boolean(p.mod?.done&&!p.mod?.error&&p.mod?.ends?.length===prompts[name].length&&p.mod.ends.every(e=>e.reason==='answer'));
 }finally{
  if(exit===null)child.kill();for(let i=0;i<30&&exit===null;i++)await sleep(100);
  p.exit=exit;p.endedAt=new Date().toISOString();report.phases.push(p);
  fs.writeFileSync(reportPath,JSON.stringify({...report,grants:budget.grants},null,2));
 }
 console.log(JSON.stringify({phase:name,completed:p.completed,grants:budget.grants.length,model:p.mod?.model,error:p.mod?.error,exit:p.exit}));
 return p;
}
try{
 const first=await phase('first');
 if(first.completed&&first.mod.id&&first.messages.some(r=>r.type==='user'&&r.content===prompts.first[0]))await phase('resume',first.mod.id);
 else report.stopped='First phase did not complete durably; remaining prompts not attempted';
}finally{
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 report.controllerClosed=true;report.grants=budget.grants;
 report.submittedInvocations=report.phases.reduce((n,p)=>n+(p.mod?.submissions?.length??0),0);
 report.remainingPromptAllowance=cap-budget.grants.length;
 report.cumulativePromptGrants=previousAttempts+budget.grants.length;
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
}
if(report.phases.length!==2||!report.phases.every(p=>p.completed)||budget.grants.length>cap)process.exitCode=1;
