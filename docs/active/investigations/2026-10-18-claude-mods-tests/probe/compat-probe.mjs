import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {makeIsolatedRoot,sleep,stripAnsi} from '../../../../../youcoded/desktop/test-conpty/cc-capture-lib.mjs';
import {startFakeApi,fakeApiEnv} from '../../../../../youcoded/desktop/test-conpty/fake-anthropic.mjs';
const base=new URL('../',import.meta.url).pathname,batch=process.argv[3]??'compat-batch',evidence=path.join(base,'evidence',batch);
if(!/^compat-[a-z0-9-]+$/.test(batch))throw Error('Bad evidence name');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return p===evidence?[]:e.isDirectory()?files(p):[p];});}
function processes(root){return fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n)).flatMap(pid=>{try{const cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');return cmd.includes(root)?[{pid:Number(pid),cmd:cmd.replaceAll('\0',' ')}]:[];}catch{return [];}});}
if(process.argv[2]==='--launch'){
 if(fs.existsSync(evidence))throw Error('Evidence exists');fs.mkdirSync(evidence);
 const baseline=Object.fromEntries(files(base).filter(p=>p.includes('/probe/')||p.includes('/evidence/')).map(p=>[p,hash(p)])),sandbox=fs.mkdtempSync('/tmp/cc-compat-'),home=path.join(sandbox,'launcher-home');fs.mkdirSync(home);
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,TMPDIR:sandbox,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',COMPAT_NETNS:'1'};
 // WHY: both local services and CLI share a network-disabled namespace, with only new synthetic state writable.
 const args=['--ro-bind','/','/','--bind',sandbox,sandbox,'--bind',evidence,evidence,'--dev','/dev','--proc','/proc','--unshare-net','--unshare-pid','--die-with-parent','--clearenv'];
 for(const [k,v]of Object.entries(env))args.push('--setenv',k,v);
 args.push('--','/usr/bin/node',new URL(import.meta.url).pathname,'--inside',batch);
 const start=Date.now(),r=spawnSync('/usr/bin/bwrap',args,{env,encoding:'utf8',timeout:210000,maxBuffer:200000});
 const report={command:['/usr/bin/bwrap',...args],env,sandbox,exitCode:r.status,signal:r.signal,error:r.error?.message,stdout:r.stdout,stderr:r.stderr,durationMs:Date.now()-start,preservation:Object.entries(baseline).map(([file,before])=>({file,before,after:hash(file),unchanged:hash(file)===before})),remainingSandboxProcesses:processes(sandbox)};
 fs.writeFileSync(path.join(evidence,'launch.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(r.stdout);console.error(r.stderr);console.log(JSON.stringify({exit:r.status,preserved:report.preservation.every(x=>x.unchanged),remaining:report.remainingSandboxProcesses}));process.exit(r.status??1);
}
if(process.argv[2]!=='--inside'||process.env.COMPAT_NETNS!=='1')throw Error('Use --launch');
const require=createRequire(new URL('../../../../../youcoded/desktop/package.json',import.meta.url)),pty=require('node-pty');
for(const [name,version,kind,allow]of [['controls300','2.1.300','controls',false],['gate300','2.1.300','gate',false],['crash302','2.1.302','crash',false],['catch302allow','2.1.302','catch',true],['catch302ask','2.1.302','catch',false]]){
 if(batch==='compat-crash-followup'&&name!=='crash302')continue;
 const binary='/home/destin/.local/share/claude/versions/'+version,iso=makeIsolatedRoot('compat-'+name),plugin=path.join(iso.root,'plugin'),requests=[],events=[];
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',TERM:'xterm-256color',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',HOME:iso.home,CLAUDE_CONFIG_DIR:iso.configDir,TMPDIR:iso.root,XDG_CONFIG_HOME:path.join(iso.home,'.config'),XDG_CACHE_HOME:path.join(iso.home,'.cache'),XDG_DATA_HOME:path.join(iso.home,'.local/share'),XDG_STATE_HOME:path.join(iso.home,'.local/state'),XDG_RUNTIME_DIR:path.join(iso.root,'runtime'),DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
 fs.mkdirSync(env.XDG_RUNTIME_DIR,{mode:0o700});fs.mkdirSync(path.join(plugin,'.claude-plugin'),{recursive:true});fs.mkdirSync(path.join(plugin,'hooks'));
 fs.writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({name:'isolated-compat',version:'0.0.1',description:'Synthetic bounded compatibility probe'}));fs.writeFileSync(path.join(plugin,'hooks/hooks.json'),JSON.stringify({modules:['./register.ts']}));fs.copyFileSync(new URL('compat-fixture.ts',import.meta.url),path.join(plugin,'hooks/register.ts'));
 fs.writeFileSync(path.join(iso.configDir,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'dark',numStartups:3,projects:{[iso.project]:{hasTrustDialogAccepted:true}}}));
 const policy={permissions:{defaultMode:'default',...(allow?{allow:['Write']}: {})}};fs.writeFileSync(path.join(iso.configDir,'settings.json'),JSON.stringify(policy));
 let oldResponse,newResponse;
 const service=http.createServer((req,res)=>{const row={path:req.url,receivedAt:Date.now()};events.push(row);res.on('close',()=>row.closedAt=Date.now());const answer=decision=>{row.decision=decision;row.respondedAt=Date.now();row.destroyedBeforeResponse=res.destroyed;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({decision}));};if(req.url==='/old.txt')oldResponse=answer;else if(req.url==='/new.txt')newResponse=answer;else answer(req.url==='/allow.txt'?'allow':'deny');});
 await new Promise(r=>service.listen(0,'127.0.0.1',r));
 const prompts=kind==='gate'?['SYNTHETIC compat allow','SYNTHETIC compat deny']:kind==='crash'?['SYNTHETIC compat OLD pending approval']:['SYNTHETIC compat catch '+(allow?'allow':'ask')];
 const metadata={kind,phase:'first',url:'http://127.0.0.1:'+service.address().port,prompts};fs.writeFileSync(path.join(iso.project,'compat-meta.json'),JSON.stringify(metadata));
 const finish={text:'SYNTHETIC bounded compat completion',wordMs:0},write=n=>({tools:[{name:'Write',input:{file_path:path.join(iso.project,n+'.txt'),content:'SYNTHETIC compat '+n+'\n'}}]});
 const script=kind==='controls'?[finish,finish,{text:'SYNTHETIC compaction summary with compatibility markers',wordMs:0}]:kind==='gate'?[write('allow'),finish,write('deny'),finish]:kind==='crash'?[write('old'),write('new'),finish]:[write('catch'),finish];
 const api=await startFakeApi(script,{onRequest(req,body){requests.push({at:Date.now(),path:req.url,dummyAuth:req.headers.authorization==='Bearer fake-token-for-local-capture',body});}}),childEnv={...env,...fakeApiEnv(api.url)};
 const report={name,...iso,policy,environment:childEnv,binary,binarySha256:hash(binary),requests,serviceEvents:events,phases:[]};
 let child,exit;
 async function stop(signal){if(exit===null){child.kill(signal);for(let n=0;n<40&&exit===null;n++)await sleep(100);}if(exit===null)throw Error('Owned CLI did not exit');}
 async function phase(label,extra=[]){
   const debug=path.join(iso.root,label+'-debug.log'),args=['--plugin-dir',plugin,'--debug-file',debug,...extra],file=path.join(iso.project,'compat-report-'+label+'.json');let raw='';exit=null;
   child=pty.spawn(binary,args,{cwd:iso.project,env:childEnv,name:'xterm-256color',cols:115,rows:42});child.onData(d=>raw=(raw+d).slice(-80000));child.onExit(e=>exit=e);
   const row={label,command:[binary,...args],pid:child.pid,start:Date.now(),networkNamespace:fs.readlinkSync('/proc/self/ns/net'),cliNetworkNamespace:fs.readlinkSync('/proc/'+child.pid+'/ns/net')};report.phases.push(row);
   try{
     const deadline=Date.now()+(kind==='controls'?50000:kind==='catch'&&!allow?10000:32000);
     while(Date.now()<deadline&&exit===null){await sleep(100);
       if(kind==='crash'&&label==='first'&&oldResponse){
         if(batch==='compat-crash-followup'){
           // WHY: the first genuine crash beat transcript persistence; observe a durable tool row without modifying history before this second crash.
           const until=Date.now()+8000;while(Date.now()<until&&!files(iso.configDir).filter(p=>p.endsWith('.jsonl')).some(p=>fs.readFileSync(p,'utf8').includes('toolu_fake_')))await sleep(150);
           row.durableToolObserved=files(iso.configDir).filter(p=>p.endsWith('.jsonl')).some(p=>fs.readFileSync(p,'utf8').includes('toolu_fake_'));
         }
         row.pendingAtCrash={at:Date.now(),serviceRequest:events.find(e=>e.path==='/old.txt'),report:JSON.parse(fs.readFileSync(file,'utf8')),cliCmdline:fs.readFileSync('/proc/'+child.pid+'/cmdline','utf8')};
         await stop('SIGKILL');row.goneAt=Date.now();row.procAbsent=!fs.existsSync('/proc/'+child.pid);break;
       }
       if(kind==='crash'&&label==='second'&&newResponse&&!report.lateAnswer){oldResponse('allow');report.lateAnswer={at:Date.now(),oldExit:report.phases[0].exit,oldProcAbsent:report.phases[0].procAbsent};await sleep(400);newResponse('deny');}
       if(fs.existsSync(file)){try{if(JSON.parse(fs.readFileSync(file,'utf8')).done)break;}catch{}}
     }
     await sleep(400);row.modReport=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;row.transcripts=files(iso.configDir).filter(p=>p.endsWith('.jsonl')).map(p=>({path:p,sha256:hash(p),text:fs.readFileSync(p,'utf8')}));row.raw=stripAnsi(raw);
   }finally{await stop();row.exit=exit;row.durationMs=Date.now()-row.start;if(fs.existsSync(debug))fs.copyFileSync(debug,path.join(evidence,name+'-'+label+'-debug.log'));}
   return row;
 }
 try{
   report.version=execFileSync(binary,['--version'],{env,cwd:iso.project,encoding:'utf8',timeout:12000});
   const first=await phase('first');
   if(kind==='crash'&&first.pendingAtCrash){
     // WHY: resume consumes the engine's untouched synthetic transcript; snapshots are copies, never repaired history.
     report.preResumeTranscriptHashes=first.transcripts.map(t=>({path:t.path,sha256:hash(t.path),unchanged:hash(t.path)===t.sha256}));
     fs.writeFileSync(path.join(iso.project,'compat-meta.json'),JSON.stringify({...metadata,phase:'second',prompts:['SYNTHETIC compat NEW distinct deny']}));
     await phase('second',['--resume',first.pendingAtCrash.report.id]);
     if(!report.lateAnswer){oldResponse('allow');report.lateAnswer={at:Date.now(),oldExit:first.exit,oldProcAbsent:first.procAbsent,resumeUnavailable:true};}
   }
   const types=path.join(plugin,'.claude-plugin/types/claude-code/index.d.ts');if(fs.existsSync(types)){const dest=path.join(evidence,name+'-generated.d.ts');fs.copyFileSync(types,dest);report.generatedTypes={path:dest,sha256:hash(dest)};}
   report.files=Object.fromEntries(['allow','deny','old','new','catch'].map(n=>{const p=path.join(iso.project,n+'.txt');return[n,{path:p,exists:fs.existsSync(p),content:fs.existsSync(p)?fs.readFileSync(p,'utf8'):null}];}));
   report.settings=JSON.parse(fs.readFileSync(path.join(iso.configDir,'settings.json'),'utf8'));
 }catch(error){report.error=String(error);if(child&&exit===null)await stop();}
 finally{await api.close();service.closeAllConnections();await new Promise(r=>service.close(r));report.serversClosed=true;}
 fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({name,version:report.version,error:report.error,phases:report.phases.map(p=>({done:p.modReport?.done,id:p.modReport?.id,elapsed:p.durationMs,exit:p.exit})),requests:requests.length,files:report.files}));
 if(report.error&&version==='2.1.300'){console.log('2.1.300 unusable: no workarounds attempted');break;}
}
