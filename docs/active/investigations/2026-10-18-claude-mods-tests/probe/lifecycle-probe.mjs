import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {makeIsolatedRoot,sleep,stripAnsi} from '../../../../../youcoded/desktop/test-conpty/cc-capture-lib.mjs';
import {startFakeApi,fakeApiEnv} from '../../../../../youcoded/desktop/test-conpty/fake-anthropic.mjs';
const base=new URL('../',import.meta.url).pathname,batch=process.argv[3]??'lifecycle-batch',evidence=path.join(base,'evidence',batch);
if(!/^lifecycle-[a-z0-9-]+$/.test(batch))throw Error('Bad evidence name');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return p===evidence?[]:e.isDirectory()?files(p):[p];});}
function processes(root){return fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n)).flatMap(pid=>{try{const cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');return cmd.includes(root)?[{pid:Number(pid),cmd:cmd.replaceAll('\0',' ')}]:[];}catch{return [];}});}
if(process.argv[2]==='--launch'){
 if(fs.existsSync(evidence))throw Error('Evidence exists');fs.mkdirSync(evidence);
 const baseline=Object.fromEntries(files(base).map(p=>[p,hash(p)])),sandbox=fs.mkdtempSync('/tmp/cc-lifecycle-'),home=path.join(sandbox,'launcher-home');fs.mkdirSync(home);
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,TMPDIR:sandbox,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',LIFECYCLE_NETNS:'1'};
 // WHY: no host networking or mutable host profile; both fake services live in this owned namespace.
 const args=['--ro-bind','/','/','--bind',sandbox,sandbox,'--bind',evidence,evidence,'--dev','/dev','--proc','/proc','--unshare-net','--unshare-pid','--die-with-parent','--clearenv'];
 for(const [k,v]of Object.entries(env))args.push('--setenv',k,v);
 args.push('--','/usr/bin/node',new URL(import.meta.url).pathname,'--inside',batch);
 const start=Date.now(),r=spawnSync('/usr/bin/bwrap',args,{env,encoding:'utf8',timeout:250000,maxBuffer:200000});
 const report={command:['/usr/bin/bwrap',...args],env,sandbox,exitCode:r.status,signal:r.signal,error:r.error?.message,stdout:r.stdout,stderr:r.stderr,durationMs:Date.now()-start,preservation:Object.entries(baseline).map(([file,before])=>({file,before,after:hash(file),unchanged:hash(file)===before})),remainingSandboxProcesses:processes(sandbox)};
 fs.writeFileSync(path.join(evidence,'launch.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(r.stdout);console.error(r.stderr);console.log(JSON.stringify({exit:r.status,preserved:report.preservation.every(x=>x.unchanged),remaining:report.remainingSandboxProcesses}));process.exit(r.status??1);
}
if(process.argv[2]!=='--inside'||process.env.LIFECYCLE_NETNS!=='1')throw Error('Use --launch');
const require=createRequire(new URL('../../../../../youcoded/desktop/package.json',import.meta.url)),pty=require('node-pty'),binary='/home/destin/.local/bin/claude';
for(const name of ['stall','recovery','poll','resume','absent','empty']){
 const iso=makeIsolatedRoot('lifecycle-'+name),plugin=path.join(iso.root,'plugin'),events=[],timers=new Set(),requests=[];
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',TERM:'xterm-256color',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',HOME:iso.home,CLAUDE_CONFIG_DIR:iso.configDir,TMPDIR:iso.root,XDG_CONFIG_HOME:path.join(iso.home,'.config'),XDG_CACHE_HOME:path.join(iso.home,'.cache'),XDG_DATA_HOME:path.join(iso.home,'.local/share'),XDG_STATE_HOME:path.join(iso.home,'.local/state'),XDG_RUNTIME_DIR:path.join(iso.root,'runtime'),DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
 fs.mkdirSync(env.XDG_RUNTIME_DIR,{mode:0o700});fs.mkdirSync(path.join(plugin,'.claude-plugin'),{recursive:true});fs.mkdirSync(path.join(plugin,'hooks'));
 fs.writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({name:'isolated-lifecycle',version:'0.0.1',description:'Synthetic lifecycle probe'}));
 fs.writeFileSync(path.join(plugin,'hooks/hooks.json'),JSON.stringify({modules:['./register.ts']}));
 if(name==='empty')fs.writeFileSync(path.join(plugin,'hooks/register.ts'),'export function register(on) {}\n');else fs.copyFileSync(new URL('lifecycle-fixture.ts',import.meta.url),path.join(plugin,'hooks/register.ts'));
 fs.writeFileSync(path.join(iso.configDir,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'dark',numStartups:3,projects:{[iso.project]:{hasTrustDialogAccepted:true}}}));
 const policy={permissions:{defaultMode:'default'}};fs.writeFileSync(path.join(iso.configDir,'settings.json'),JSON.stringify(policy));
 let generation=1,service;
 const makeService=()=>http.createServer((req,res)=>{
   const row={path:req.url,at:Date.now(),generation};events.push(row);
   res.on('close',()=>row.closedAt=Date.now());
   const pathname=new URL(req.url,'http://localhost').pathname,attempt=Number(new URL(req.url,'http://localhost').searchParams.get('attempt'));
   const delay=pathname==='/stall.txt'?35000:pathname==='/poll.txt'&&attempt<3?12000:0;
   const reply=pathname==='/malformed.txt'?{synthetic:true,approved:true}:pathname==='/poll.txt'&&attempt<3?{pending:true}:{decision:'allow'};
   const timer=setTimeout(()=>{timers.delete(timer);row.reply=reply;row.respondedAt=Date.now();row.destroyedBeforeResponse=res.destroyed;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply));
     if(pathname==='/malformed.txt'){const port=service.address().port;service.close(()=>{events.push({event:'service-closed',at:Date.now(),generation});generation++;service=makeService();service.listen(port,'127.0.0.1',()=>events.push({event:'service-restarted',at:Date.now(),generation}));});service.closeIdleConnections();}
   },delay);timers.add(timer);
 });
 service=makeService();await new Promise(r=>service.listen(0,'127.0.0.1',r));
 const prompts=name==='resume'?['SYNTHETIC lifecycle before resume']:name==='recovery'?['SYNTHETIC malformed request','SYNTHETIC distinct recovery request']:['SYNTHETIC lifecycle '+name];
 const metadata={url:'http://127.0.0.1:'+service.address().port,phase:'first',prompts};
 fs.writeFileSync(path.join(iso.project,'lifecycle-service.json'),JSON.stringify(metadata));
 const finish={text:'SYNTHETIC bounded completion',wordMs:0},write=n=>({tools:[{name:'Write',input:{file_path:path.join(iso.project,n+'.txt'),content:'SYNTHETIC lifecycle '+n+'\n'}}]});
 const script=name==='recovery'?[write('malformed'),finish,write('recovered'),finish]:['stall','poll'].includes(name)?[write(name),finish]:[finish,finish];
 const api=await startFakeApi(script,{onRequest(req,body){requests.push({at:Date.now(),path:req.url,dummyAuth:req.headers.authorization==='Bearer fake-token-for-local-capture',body});}}),childEnv={...env,...fakeApiEnv(api.url)};
 const report={name,...iso,policy,environment:childEnv,binary,binarySha256:hash(fs.realpathSync(binary)),version:execFileSync(binary,['--version'],{env,cwd:iso.project,encoding:'utf8',timeout:15000}),requests,serviceEvents:events,phases:[]};
 async function phase(label,extra=[]){
   const debug=path.join(iso.root,label+'-debug.log'),args=[...(name==='absent'?[]:['--plugin-dir',plugin]),'--debug-file',debug,...extra];
   let exit=null,raw='';const child=pty.spawn(binary,args,{cwd:iso.project,env:childEnv,name:'xterm-256color',cols:115,rows:42});child.onData(d=>raw=(raw+d).slice(-90000));child.onExit(e=>exit=e);
   const row={label,command:[binary,...args],pid:child.pid,start:Date.now(),networkNamespace:fs.readlinkSync('/proc/self/ns/net'),cliNetworkNamespace:fs.readlinkSync('/proc/'+child.pid+'/ns/net')},file=path.join(iso.project,'lifecycle-report-'+label+'.json');
   try{
     const deadline=Date.now()+(['absent','empty'].includes(name)?6500:65000);
     while(Date.now()<deadline&&exit===null){await sleep(150);if(fs.existsSync(file)){try{if(JSON.parse(fs.readFileSync(file,'utf8')).done)break;}catch{}}}
     await sleep(600);row.modReport=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
     row.transcripts=files(iso.configDir).filter(p=>p.endsWith('.jsonl')).map(p=>({path:p,text:fs.readFileSync(p,'utf8')}));row.raw=stripAnsi(raw);
   }finally{
     // WHY: HUP only this owned idle CLI after the synthetic completion checkpoint; no transcript/private-state rewriting.
     if(exit===null)child.kill();for(let n=0;n<30&&exit===null;n++)await sleep(100);
     row.exit=exit;row.durationMs=Date.now()-row.start;if(fs.existsSync(debug))fs.copyFileSync(debug,path.join(evidence,name+'-'+label+'-debug.log'));report.phases.push(row);
   }
   return row;
 }
 try{
   const first=await phase('first');
   if(name==='resume'&&first.modReport?.done&&first.modReport.rows.some(x=>x.completed)){
     report.checkpoint={id:first.modReport.id,transcriptHashes:first.transcripts.map(x=>({path:x.path,sha256:hash(x.path)})),at:Date.now()};
     fs.writeFileSync(path.join(iso.project,'lifecycle-service.json'),JSON.stringify({...metadata,phase:'second',prompts:['SYNTHETIC lifecycle after resume']}));
     await phase('second',['--resume',first.modReport.id]);
   }
   report.files=Object.fromEntries(['stall','malformed','recovered','poll'].map(n=>{const p=path.join(iso.project,n+'.txt');return [n,{path:p,exists:fs.existsSync(p),content:fs.existsSync(p)?fs.readFileSync(p,'utf8'):null}];}));
 }finally{for(const t of timers)clearTimeout(t);await api.close();service.closeAllConnections();await new Promise(r=>service.close(r));report.serversClosed=true;}
 fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({name,phases:report.phases.map(p=>({done:p.modReport?.done,id:p.modReport?.id,elapsed:p.durationMs,exit:p.exit})),requests:requests.length,files:report.files}));
}
