import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync,spawnSync} from 'node:child_process';
import {makeIsolatedRoot,resolveClaude,sleep,stripAnsi} from '../../../../../youcoded/desktop/test-conpty/cc-capture-lib.mjs';
import {startFakeApi,fakeApiEnv} from '../../../../../youcoded/desktop/test-conpty/fake-anthropic.mjs';
const base=new URL('../',import.meta.url).pathname;
const batch=process.argv[3]??'approval-batch';
if(!/^approval-[a-z0-9-]+$/.test(batch))throw new Error('Invalid new evidence directory');
const evidence=path.join(base,'evidence',batch);
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function priorFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name.startsWith('approval-')?[]:e.isDirectory()?priorFiles(path.join(dir,e.name)):[path.join(dir,e.name)]);}
if(process.argv[2]==='--launch'){
  if(fs.existsSync(evidence))throw new Error('Refusing to overwrite original approval evidence');
  fs.mkdirSync(evidence);
  const sandbox=fs.mkdtempSync('/tmp/cc-mods-approval-');
  const home=path.join(sandbox,'launcher-home');fs.mkdirSync(home);
  const environment={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,TMPDIR:sandbox,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',CC_PROBE_NETNS:'1'};
  const baseline=Object.fromEntries([...priorFiles(path.join(base,'probe')),...priorFiles(path.join(base,'evidence')),...['PLAN.md','RESULTS.md','LIVE-HISTORY.md'].map(p=>path.join(base,p))].map(p=>[p,sha(p)]));
  const args=['--ro-bind','/','/','--bind',sandbox,sandbox,'--bind',evidence,evidence,'--dev','/dev','--proc','/proc','--unshare-net','--unshare-pid','--die-with-parent','--clearenv'];
  for(const [k,v]of Object.entries(environment))args.push('--setenv',k,v);
  args.push('--','/usr/bin/node',new URL(import.meta.url).pathname,'--inside',batch);
  const started=Date.now();
  const result=spawnSync('/usr/bin/bwrap',args,{env:environment,encoding:'utf8',timeout:160000,maxBuffer:200000});
  const preservation=Object.entries(baseline).map(([file,before])=>({file,before,after:sha(file),unchanged:sha(file)===before}));
  fs.writeFileSync(path.join(evidence,'approval-launch.json'),JSON.stringify({command:['/usr/bin/bwrap',...args],environment,sandbox,started,durationMs:Date.now()-started,exitCode:result.status,signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr,preservation,namespaceCleanup:'--unshare-pid: namespace init exit kills remaining namespace children',remainingSandboxProcesses:scanProcesses(sandbox)},null,2),{flag:'wx'});
  console.log(result.stdout);console.error(result.stderr);console.log('bwrap exit='+result.status+' signal='+result.signal+'; preserved='+preservation.every(p=>p.unchanged));
  process.exit(result.status??1);
}
function scanProcesses(root){const rows=[];for(const id of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n))){try{const cmd=fs.readFileSync('/proc/'+id+'/cmdline','utf8');if(cmd.includes(root))rows.push({pid:Number(id),cmd:cmd.replaceAll('\0',' ')});}catch{}}return rows;}
if(process.argv[2]!=='--inside'||process.env.CC_PROBE_NETNS!=='1')throw new Error('Use --launch');
if(fs.existsSync(path.join(evidence,'approval-run.json')))throw new Error('Existing evidence');
const require=createRequire(new URL('../../../../../youcoded/desktop/package.json',import.meta.url));
const pty=require('node-pty');
const iso=makeIsolatedRoot('approval-state');
// WHY: the allowlisted PATH deliberately excludes the real HOME; resolve the already-observed installed executable explicitly, without reading real config.
const binary=resolveClaude('/home/destin/.local/bin/claude');
const plugin=path.join(iso.root,'plugin');
const env={PATH:'/usr/local/bin:/usr/bin:/bin',TERM:'xterm-256color',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',HOME:iso.home,CLAUDE_CONFIG_DIR:iso.configDir,TMPDIR:iso.root,XDG_CONFIG_HOME:path.join(iso.home,'.config'),XDG_CACHE_HOME:path.join(iso.home,'.cache'),XDG_DATA_HOME:path.join(iso.home,'.local/share'),XDG_STATE_HOME:path.join(iso.home,'.local/state'),XDG_RUNTIME_DIR:path.join(iso.root,'runtime'),DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
fs.mkdirSync(env.XDG_RUNTIME_DIR,{mode:0o700});
fs.mkdirSync(path.join(plugin,'.claude-plugin'),{recursive:true});fs.mkdirSync(path.join(plugin,'hooks'),{recursive:true});
fs.writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({name:'isolated-approval-probe',version:'0.0.1',description:'Disposable external approval wait test'}));
fs.writeFileSync(path.join(plugin,'hooks/hooks.json'),JSON.stringify({modules:['./register.ts']}));
fs.copyFileSync(new URL('approval-fixture.ts',import.meta.url),path.join(plugin,'hooks/register.ts'));
fs.writeFileSync(path.join(iso.configDir,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'dark',numStartups:3,projects:{[iso.project]:{hasTrustDialogAccepted:true}}}));
// WHY: allow only the harmless synthetic tool in this temp profile, never bypass mode; hook denial must override this underlying allow.
const policy={permissions:{defaultMode:'default',allow:['Write']}};
fs.writeFileSync(path.join(iso.configDir,'settings.json'),JSON.stringify(policy));
const commands=[];
for(const args of [['--version'],['plugin','validate',plugin,'--json']]){let code=0,output='';try{output=execFileSync(binary,args,{cwd:iso.project,env,encoding:'utf8',timeout:15000,maxBuffer:100000});}catch(e){code=e.status??e.code;output=String(e.stdout??'')+String(e.stderr??'');}commands.push({args,code,output:stripAnsi(output)});}
const serviceEvents=[];
const approval=http.createServer((req,res)=>{
 const start=Date.now();const row={path:req.url,start};serviceEvents.push(row);
 if(req.url==='/approval-disconnect'){row.disconnected=true;req.socket.destroy();return;}
 const decision=req.url==='/approval-allow12'?'allow':'deny';
 setTimeout(()=>{row.responseAt=Date.now();row.durationMs=row.responseAt-start;row.decision=decision;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({decision}));},decision==='allow'?12000:0);
});
await new Promise(r=>approval.listen(0,'127.0.0.1',r));
// Reserve then close a localhost port: there is no service at the unreachable endpoint.
const absent=http.createServer();await new Promise(r=>absent.listen(0,'127.0.0.1',r));const absentPort=absent.address().port;await new Promise(r=>absent.close(r));
const service={url:'http://127.0.0.1:'+approval.address().port,unreachable:'http://127.0.0.1:'+absentPort+'/approval-unreachable'};
fs.writeFileSync(path.join(iso.project,'approval-service.json'),JSON.stringify(service));
const names=['approval-allow12','approval-deny','approval-unreachable','approval-disconnect'];
const script=names.flatMap(name=>[{tools:[{name:'Write',input:{file_path:path.join(iso.project,name+'.txt'),content:'SYNTHETIC_'+name+'\n'}}]},{text:'LOCAL_COMPLETION_'+name,wordMs:0}]);
const requests=[];
const api=await startFakeApi(script,{onRequest(req,body){requests.push({method:req.method,path:req.url,model:body.model,dummyAuth:req.headers.authorization==='Bearer fake-token-for-local-capture',messages:body.messages?.slice(-16)});}});
const childEnv={...env,...fakeApiEnv(api.url)};
let raw='',exit=null;
const cliArgs=['--plugin-dir',plugin,'--debug-file',path.join(iso.root,'debug.log')];
const child=pty.spawn(binary,cliArgs,{cwd:iso.project,env:childEnv,name:'xterm-256color',cols:110,rows:40});
child.onData(d=>{raw=(raw+d).slice(-65000);});child.onExit(e=>{exit=e;});
const report={root:iso.root,project:iso.project,plugin,binary,binarySha256:sha(fs.realpathSync(binary)),environment:childEnv,commands,policy,service,cliCommand:[binary,...cliArgs],pid:child.pid,networkNamespace:fs.readlinkSync('/proc/self/ns/net'),cliNetworkNamespace:fs.readlinkSync('/proc/'+child.pid+'/ns/net'),started:Date.now()};
try{
 const file=path.join(iso.project,'approval-mod-report.json');const end=Date.now()+115000;
 while(Date.now()<end&&exit===null){await sleep(150);if(fs.existsSync(file)){try{if(JSON.parse(fs.readFileSync(file,'utf8')).done)break;}catch{}}}
 report.modReport=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 report.raw=stripAnsi(raw);report.requests=requests;report.turnsUsed=api.turnsUsed;report.serviceEvents=serviceEvents;
 report.files=Object.fromEntries(names.map(name=>{const p=path.join(iso.project,name+'.txt');return[name,{path:p,exists:fs.existsSync(p),hex:fs.existsSync(p)?fs.readFileSync(p).toString('hex'):null}];}));
 report.settingsAfter=JSON.parse(fs.readFileSync(path.join(iso.configDir,'settings.json'),'utf8'));
 report.durationMs=Date.now()-report.started;
 const debug=path.join(iso.root,'debug.log');if(fs.existsSync(debug))fs.copyFileSync(debug,path.join(evidence,'approval-debug.log'));
}finally{
 if(exit===null)child.kill();for(let n=0;n<30&&exit===null;n++)await sleep(100);
 await api.close();approval.closeAllConnections();await new Promise(r=>approval.close(r));report.childExit=exit;report.serversClosed=true;
}
fs.writeFileSync(path.join(evidence,'approval-run.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({done:report.modReport?.done,rows:report.modReport?.rows,files:report.files,requests:requests.length,childExit:exit,serversClosed:report.serversClosed}));
