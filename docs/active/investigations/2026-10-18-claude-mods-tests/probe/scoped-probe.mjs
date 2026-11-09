import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {makeIsolatedRoot,sleep,stripAnsi} from '../../../../../youcoded/desktop/test-conpty/cc-capture-lib.mjs';
import {startFakeApi,fakeApiEnv} from '../../../../../youcoded/desktop/test-conpty/fake-anthropic.mjs';
const base=new URL('../',import.meta.url).pathname,batch=process.argv[3]??'scoped-batch',out=path.join(base,'evidence',batch);
if(!/^scoped-[a-z0-9-]+$/.test(batch))throw Error('Bad batch');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return p===out?[]:e.isDirectory()?files(p):[p];});
function processes(root){return fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p)).flatMap(pid=>{try{const cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');return cmd.includes(root)?[{pid,cmd:cmd.replaceAll('\0',' ')}]:[];}catch{return [];}});}
if(process.argv[2]==='--launch'){
 if(fs.existsSync(out))throw Error('Refuse evidence rewrite');const before=Object.fromEntries(files(base).map(p=>[p,hash(p)]));fs.mkdirSync(out);
 const root=fs.mkdtempSync('/tmp/cc-scoped-'),home=path.join(root,'launcher');fs.mkdirSync(home);
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,TMPDIR:root,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',SCOPED_NETNS:'1'};
 // WHY: only this batch's temp and new evidence writable; fake API and actual CLI share a network-disabled namespace.
 const args=['--ro-bind','/','/','--bind',root,root,'--bind',out,out,'--dev','/dev','--proc','/proc','--unshare-net','--unshare-pid','--die-with-parent','--clearenv'];
 for(const [k,v]of Object.entries(env))args.push('--setenv',k,v);args.push('--','/usr/bin/node',new URL(import.meta.url).pathname,'--inside',batch,...process.argv.slice(4));
 const r=spawnSync('/usr/bin/bwrap',args,{env,encoding:'utf8',timeout:240000,maxBuffer:200000});
 const report={command:['/usr/bin/bwrap',...args],env,root,exit:r.status,signal:r.signal,error:r.error?.message,stdout:r.stdout,stderr:r.stderr,preservation:Object.entries(before).map(([p,h])=>({path:p,before:h,after:hash(p),unchanged:h===hash(p)})),remaining:processes(root)};
 fs.writeFileSync(path.join(out,'launch.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(r.stdout);console.error(r.stderr);console.log(JSON.stringify({exit:r.status,preserved:report.preservation.every(p=>p.unchanged),remaining:report.remaining}));process.exit(r.status??1);
}
if(process.argv[2]!=='--inside'||process.env.SCOPED_NETNS!=='1')throw Error('Use --launch');
const require=createRequire(new URL('../../../../../youcoded/desktop/package.json',import.meta.url)),pty=require('node-pty'),binary='/home/destin/.local/bin/claude';
const modes=process.argv.slice(4).length?process.argv.slice(4):['control','submit','context','observer','installed','mcp','broken','abort'];
if(modes.some(m=>!['control','submit','context','observer','installed','mcp','broken','abort'].includes(m)))throw Error('Invalid mode');
for(const mode of modes){
 const iso=makeIsolatedRoot('scoped-'+mode),plugin=path.join(iso.root,'market/plugins/scoped-probe'),requests=[],commands=[];
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:iso.home,CLAUDE_CONFIG_DIR:iso.configDir,TMPDIR:iso.root,TERM:'xterm-256color',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',XDG_CONFIG_HOME:iso.home+'/.config',XDG_CACHE_HOME:iso.home+'/.cache',XDG_DATA_HOME:iso.home+'/.local/share',XDG_STATE_HOME:iso.home+'/.local/state',XDG_RUNTIME_DIR:iso.root+'/runtime',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
 fs.mkdirSync(env.XDG_RUNTIME_DIR,{mode:0o700});
 function json(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2));}
 json(plugin+'/.claude-plugin/plugin.json',{name:'scoped-probe',version:'1.0.0',description:'Synthetic scoped mod probe'});json(plugin+'/hooks/hooks.json',{modules:['./register.ts']});fs.copyFileSync(new URL('scoped-fixture.ts',import.meta.url),plugin+'/hooks/register.ts');
 const cfg={hasCompletedOnboarding:true,theme:'dark',numStartups:3,projects:{[iso.project]:{hasTrustDialogAccepted:true}}};
 const mcpServer=label=>({type:'stdio',command:'/usr/bin/node',args:[new URL('scoped-mcp.mjs',import.meta.url).pathname,iso.root+'/'+label+'-mcp.jsonl',label]});
 if(mode==='mcp')cfg.mcpServers={scopedGlobal:mcpServer('global')};
 json(iso.configDir+'/.claude.json',cfg);json(iso.configDir+'/settings.json',{permissions:{defaultMode:'default'}});
 const text='SYNTHETIC original user text 73';json(iso.project+'/scoped-meta.json',{mode,text});
 function command(args){const r=spawnSync(binary,args,{env,cwd:iso.project,encoding:'utf8',timeout:20000});const row={command:[binary,...args],exit:r.status,stdout:r.stdout,stderr:r.stderr};commands.push(row);return row;}
 const version=command(['--version']);let extra=[];
 if(mode==='installed'){
  json(iso.root+'/market/.claude-plugin/marketplace.json',{name:'scoped-market',owner:{name:'Synthetic offline probe'},plugins:[{name:'scoped-probe',source:'./plugins/scoped-probe',description:'Harmless scoped probe'}]});
  command(['plugin','validate',plugin]);command(['plugin','marketplace','add',iso.root+'/market','--scope','user','--json']);command(['plugin','install','scoped-probe@scoped-market','--scope','user','--json']);command(['plugin','list','--json']);
 }else extra=['--plugin-dir',plugin];
 if(mode==='observer'){
  const p=iso.root+'/observer';json(p+'/.claude-plugin/plugin.json',{name:'scoped-observer',version:'1.0.0'});json(p+'/hooks/hooks.json',{modules:['./register.ts']});
  fs.writeFileSync(p+'/hooks/register.ts',"export function register(on){on('prompt.submit',($,e,next)=>next({...e,context:[...(e.context??[]),'SCOPED_OBSERVER_CONTEXT_73']}));}\n");extra.push('--plugin-dir',p);
 }
 if(['mcp','broken'].includes(mode)){
  json(iso.root+'/session-mcp.json',{mcpServers:{scopedSession:mode==='mcp'?mcpServer('session'):{type:'stdio',command:iso.root+'/deliberately-missing-server',args:[]}}});extra.push('--mcp-config',iso.root+'/session-mcp.json');
 }
 const usage={input_tokens:37,output_tokens:11,cache_read_input_tokens:7,cache_creation_input_tokens:3};let discovered=null;
 const finish={text:'SYNTHETIC scoped completion',wordMs:0,usage};
 const script=mode==='mcp'?[body=>{discovered=body.tools.find(t=>t.name==='mcp__scopedSession__echo');return discovered?{tools:[{name:discovered.name,input:{text:'echo-73'}}],usage}:finish;},finish]:mode==='abort'?[{text:'SYNTHETIC delayed response',delayMs:3000,usage}]:[finish];
 const api=await startFakeApi(script,{onRequest(req,body){requests.push({path:req.url,at:Date.now(),dummyAuth:req.headers.authorization==='Bearer fake-token-for-local-capture',body});}}),childEnv={...env,...fakeApiEnv(api.url)};
 const snapshot=()=>Object.fromEntries(files(iso.configDir).filter(p=>!p.endsWith('.jsonl')&&!p.includes('/debug/')&&!p.includes('/cache/')).map(p=>[p,fs.readFileSync(p,'utf8')]));
 const before=snapshot(),debug=iso.root+'/debug.log',args=[...extra,'--debug-file',debug];let exit=null,raw='';
 const child=pty.spawn(binary,args,{env:childEnv,cwd:iso.project,name:'xterm-256color',cols:115,rows:42});child.onData(d=>raw=(raw+d).slice(-70000));child.onExit(e=>exit=e);
 const report={mode,...iso,version,commands,environment:childEnv,binarySha256:hash(fs.realpathSync(binary)),command:[binary,...args],pid:child.pid,netns:fs.readlinkSync('/proc/self/ns/net'),childNetns:fs.readlinkSync('/proc/'+child.pid+'/ns/net'),requests,before};
 try{
  const deadline=Date.now()+35000,file=iso.project+'/scoped-report.json';
  while(Date.now()<deadline&&exit===null){await sleep(150);if(fs.existsSync(file)){try{if(JSON.parse(fs.readFileSync(file,'utf8')).done)break;}catch{}}}
  await sleep(500);report.mod=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;report.discovered=discovered;report.after=snapshot();report.transcripts=files(iso.configDir).filter(p=>p.endsWith('.jsonl')).map(p=>({path:p,text:fs.readFileSync(p,'utf8')}));report.mcpLogs=Object.fromEntries(['session','global'].map(label=>{const p=iso.root+'/'+label+'-mcp.jsonl';return [label,fs.existsSync(p)?fs.readFileSync(p,'utf8'):null];}));report.raw=stripAnsi(raw);
 }finally{
  if(exit===null)child.kill();for(let i=0;i<30&&exit===null;i++)await sleep(100);report.exit=exit;await api.close();report.serverClosed=true;if(fs.existsSync(debug))fs.copyFileSync(debug,path.join(out,mode+'-debug.log'));
 }
 fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({mode,done:report.mod?.done,rows:report.mod?.rows,events:report.mod?.events.map(e=>e.event),requests:requests.length,discovered:discovered?.name,exit}));
}
