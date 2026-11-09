import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {makeIsolatedRoot,sleep,stripAnsi} from '../../../../../youcoded/desktop/test-conpty/cc-capture-lib.mjs';
import {startFakeApi,fakeApiEnv} from '../../../../../youcoded/desktop/test-conpty/fake-anthropic.mjs';
const base=new URL('../',import.meta.url).pathname,batch=process.argv[3]??'interaction-batch';
if(!/^interaction-[a-z0-9-]+$/.test(batch))throw Error('Invalid evidence name');
const evidence=path.join(base,'evidence',batch);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return p===evidence?[]:e.isDirectory()?files(p):[p];});}
function processes(root){const rows=[];for(const pid of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n))){try{const cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');if(cmd.includes(root))rows.push({pid:Number(pid),cmd:cmd.replaceAll('\0',' ')});}catch{}}return rows;}
if(process.argv[2]==='--launch'){
  if(fs.existsSync(evidence))throw Error('Refusing existing evidence');fs.mkdirSync(evidence);
  const baseline=Object.fromEntries(files(base).map(p=>[p,hash(p)]));
  const sandbox=fs.mkdtempSync('/tmp/cc-interaction-'),home=path.join(sandbox,'launcher-home');fs.mkdirSync(home);
  const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,TMPDIR:sandbox,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',INTERACTION_NETNS:'1'};
  // WHY: only the new sandbox and dedicated evidence are writable; services and CLI share an otherwise disconnected network namespace.
  const args=['--ro-bind','/','/','--bind',sandbox,sandbox,'--bind',evidence,evidence,'--dev','/dev','--proc','/proc','--unshare-net','--unshare-pid','--die-with-parent','--clearenv'];
  for(const [k,v]of Object.entries(env))args.push('--setenv',k,v);
  args.push('--','/usr/bin/node',new URL(import.meta.url).pathname,'--inside',batch);
  const result=spawnSync('/usr/bin/bwrap',args,{env,encoding:'utf8',timeout:230000,maxBuffer:200000});
  const preservation=Object.entries(baseline).map(([file,before])=>({file,before,after:hash(file),unchanged:before===hash(file)}));
  const report={command:['/usr/bin/bwrap',...args],env,sandbox,exitCode:result.status,signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr,preservation,remainingSandboxProcesses:processes(sandbox),cleanup:'PID namespace exit kills remaining owned namespace children'};
  fs.writeFileSync(path.join(evidence,'launch.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(result.stdout);console.error(result.stderr);console.log(JSON.stringify({exit:result.status,preserved:preservation.every(r=>r.unchanged),remaining:report.remainingSandboxProcesses}));process.exit(result.status??1);
}
if(process.argv[2]!=='--inside'||process.env.INTERACTION_NETNS!=='1')throw Error('Use --launch');
const require=createRequire(new URL('../../../../../youcoded/desktop/package.json',import.meta.url)),pty=require('node-pty');
const names=batch==='interaction-followup'?['question-structured','question-free','plan-deny']:['question-allow','question-replace','question-deny','plan-allow','plan-deny','plan-replace','cancel-late','reload-pending'];
const questions=['Choose a synthetic color?','Choose synthetic features?','Supply synthetic free text?'].map((question,i)=>({question,header:['Color','Features','Free text'][i],options:[{label:'Red',description:'Synthetic red'},{label:'Blue',description:'Synthetic blue'}],multiSelect:i===1}));
const answers={[questions[0].question]:'Blue',[questions[1].question]:'Red, Blue',[questions[2].question]:'SYNTHETIC custom text π\nsecond line'};
for(const name of names){
 const iso=makeIsolatedRoot(name),binary='/home/destin/.local/bin/claude',plugin=path.join(iso.root,'plugin');
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',TERM:'xterm-256color',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',HOME:iso.home,CLAUDE_CONFIG_DIR:iso.configDir,TMPDIR:iso.root,XDG_CONFIG_HOME:path.join(iso.home,'.config'),XDG_CACHE_HOME:path.join(iso.home,'.cache'),XDG_DATA_HOME:path.join(iso.home,'.local/share'),XDG_STATE_HOME:path.join(iso.home,'.local/state'),XDG_RUNTIME_DIR:path.join(iso.root,'runtime'),DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
 fs.mkdirSync(env.XDG_RUNTIME_DIR,{mode:0o700});fs.mkdirSync(path.join(plugin,'.claude-plugin'),{recursive:true});fs.mkdirSync(path.join(plugin,'hooks'));
 fs.writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({name:'isolated-interaction',version:'0.0.1',description:'Synthetic isolated interaction semantics'}));
 fs.writeFileSync(path.join(plugin,'hooks/hooks.json'),JSON.stringify({modules:['./register.ts']}));fs.copyFileSync(new URL('interaction-fixture.ts',import.meta.url),path.join(plugin,'hooks/register.ts'));
 fs.writeFileSync(path.join(iso.configDir,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'dark',numStartups:3,projects:{[iso.project]:{hasTrustDialogAccepted:true}}}));
 const policy={permissions:{defaultMode:'default'}};fs.writeFileSync(path.join(iso.configDir,'settings.json'),JSON.stringify(policy));
 const serviceEvents=[],timers=new Set();let writeChecks=0;
 const service=http.createServer((req,res)=>{
   const row={path:req.url,at:Date.now(),synthetic:true};serviceEvents.push(row);
   let reply,delay=0;
   if(req.url==='/answer')reply={synthetic:true,answers,...(name!=='question-structured'?{response:'SYNTHETIC explicit freeform response'}:{}),plan:'# Synthetic plan\nWrite one harmless temporary file, then verify it.\n'};
   else {const deny=name.endsWith('-deny')&&(!name.startsWith('plan-')||req.url.startsWith('/check/ExitPlanMode/'));reply={synthetic:true,decision:deny?'deny':'allow'};if(name==='cancel-late'){writeChecks++;delay=writeChecks===1?1800:3000;reply.decision=writeChecks===1?'allow':'deny';}if(name==='reload-pending')delay=3500;}
   const timer=setTimeout(()=>{timers.delete(timer);row.reply=reply;row.respondedAt=Date.now();row.destroyedBeforeResponse=res.destroyed;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply));},delay);timers.add(timer);
 });
 await new Promise(r=>service.listen(0,'127.0.0.1',r));
 fs.writeFileSync(path.join(iso.project,'interaction-service.json'),JSON.stringify({name,url:'http://127.0.0.1:'+service.address().port}));
 const tool=(name,input)=>({tools:[{name,input}]}),finish={text:'SYNTHETIC local completion',wordMs:0};
 let planPath=null;
 const planStep=body=>{
   const text=JSON.stringify(body);
   // WHY: use only the engine-advertised allowed plan path, never invent or rewrite private arguments.
   const match=text.match(new RegExp(iso.configDir.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/plans/[a-zA-Z0-9_-]+\\.md'));
   if(!match)return {text:'SYNTHETIC blocked: no engine-advertised plan path',wordMs:0};
   planPath=match[0];return tool('Write',{file_path:planPath,content:'# Synthetic plan\nWrite one harmless temporary file, then verify it.\n'});
 };
 const script=name.startsWith('question-')?[tool('AskUserQuestion',{questions}),finish]:name.startsWith('plan-')?[tool('EnterPlanMode',{}),planStep,()=>planPath?tool('Read',{file_path:planPath}):finish,()=>planPath?tool('ExitPlanMode',{}):finish,tool('Write',{file_path:path.join(iso.project,'post-plan.txt'),content:'SYNTHETIC post-plan\n'}),finish]:name==='cancel-late'?[tool('Write',{file_path:path.join(iso.project,'pending.txt'),content:'SYNTHETIC forbidden stale write\n'}),tool('Write',{file_path:path.join(iso.project,'new-turn.txt'),content:'SYNTHETIC new turn forbidden\n'}),finish]:[tool('Write',{file_path:path.join(iso.project,'pending.txt'),content:'SYNTHETIC reload pending\n'}),finish];
 const requests=[];const api=await startFakeApi(script,{onRequest(req,body){requests.push({at:Date.now(),path:req.url,dummyAuth:req.headers.authorization==='Bearer fake-token-for-local-capture',body});}});
 const childEnv={...env,...fakeApiEnv(api.url)},args=['--plugin-dir',plugin,'--debug-file',path.join(iso.root,'debug.log')];
 const commands=[['--version'],['plugin','validate',plugin,'--json']].map(args=>({args,exitCode:0,output:execFileSync(binary,args,{env,cwd:iso.project,encoding:'utf8',timeout:15000})}));
 let exit=null,raw='';const child=pty.spawn(binary,args,{cwd:iso.project,env:childEnv,name:'xterm-256color',cols:115,rows:42});child.onData(d=>raw=(raw+d).slice(-90000));child.onExit(e=>exit=e);
 const report={name,...iso,binary,binarySha256:hash(fs.realpathSync(binary)),commands,cliCommand:[binary,...args],environment:childEnv,policy,pid:child.pid,networkNamespace:fs.readlinkSync('/proc/self/ns/net'),cliNetworkNamespace:fs.readlinkSync('/proc/'+child.pid+'/ns/net'),started:Date.now(),expectedSyntheticAnswers:answers};
 try{
   const file=path.join(iso.project,'interaction-report.json'),deadline=Date.now()+23000;
   while(Date.now()<deadline&&exit===null){await sleep(150);if(fs.existsSync(file)){try{if(JSON.parse(fs.readFileSync(file,'utf8')).done)break;}catch{}}}
   await sleep(500);report.modReport=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
   report.requests=requests;report.serviceEvents=serviceEvents;report.raw=stripAnsi(raw);report.turnsUsed=api.turnsUsed;report.planPath=planPath;
   report.files=Object.fromEntries(['pending.txt','new-turn.txt','post-plan.txt',...(planPath?[planPath]:[])].map(n=>{const p=path.isAbsolute(n)?n:path.join(iso.project,n);return [n,{path:p,exists:fs.existsSync(p),content:fs.existsSync(p)?fs.readFileSync(p,'utf8'):null}];}));
   report.persisted=files(iso.configDir).filter(p=>p.endsWith('.jsonl')).map(p=>({path:p,text:fs.readFileSync(p,'utf8')}));
   report.durationMs=Date.now()-report.started;
   if(fs.existsSync(path.join(iso.root,'debug.log')))fs.copyFileSync(path.join(iso.root,'debug.log'),path.join(evidence,name+'-debug.log'));
 }finally{
   if(exit===null)child.kill();for(let n=0;n<30&&exit===null;n++)await sleep(100);
   for(const t of timers)clearTimeout(t);await api.close();service.closeAllConnections();await new Promise(r=>service.close(r));report.childExit=exit;report.serversClosed=true;
 }
 fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify({name,done:report.modReport?.done,completed:report.modReport?.completed,mode:report.modReport?.mode?.value,requests:requests.length,serviceEvents:serviceEvents.length,planPath,exit}));
}
