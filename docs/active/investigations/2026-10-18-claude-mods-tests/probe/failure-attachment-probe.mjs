import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {makeIsolatedRoot,resolveClaude,sleep,stripAnsi} from '../../../../../youcoded/desktop/test-conpty/cc-capture-lib.mjs';
import {startFakeApi,fakeApiEnv} from '../../../../../youcoded/desktop/test-conpty/fake-anthropic.mjs';
const mode=process.argv[2];
if(!['failure','attachment'].includes(mode)||process.env.CC_PROBE_NETNS!=='1')throw new Error('Run failure or attachment inside the documented bubblewrap namespace with CC_PROBE_NETNS=1');
const require=createRequire(new URL('../../../../../youcoded/desktop/package.json',import.meta.url));
const pty=require('node-pty');
const evidence=new URL('../evidence/',import.meta.url);
const output=new URL(`${mode}-run.json`,evidence);
if(fs.existsSync(output))throw new Error('Refusing to overwrite existing second-batch evidence');
const iso=makeIsolatedRoot(`cc-mods-${mode}`);
const binary=resolveClaude();
const plugin=path.join(iso.root,'plugin');
const env={PATH:'/usr/local/bin:/usr/bin:/bin',TERM:'xterm-256color',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',HOME:iso.home,CLAUDE_CONFIG_DIR:iso.configDir,TMPDIR:iso.root,XDG_CONFIG_HOME:path.join(iso.home,'.config'),XDG_CACHE_HOME:path.join(iso.home,'.cache'),DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
fs.mkdirSync(path.join(plugin,'.claude-plugin'),{recursive:true});fs.mkdirSync(path.join(plugin,'hooks'),{recursive:true});
fs.writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({name:`isolated-${mode}-probe`,version:'0.0.1',description:'Disposable no-cost second-batch test'}));
fs.writeFileSync(path.join(plugin,'hooks/hooks.json'),JSON.stringify({modules:['./register.ts']}));
fs.copyFileSync(new URL(`${mode}-fixture.ts`,import.meta.url),path.join(plugin,'hooks/register.ts'));
fs.writeFileSync(path.join(iso.configDir,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'dark',numStartups:3,projects:{[iso.project]:{hasTrustDialogAccepted:true}}}));
// WHY: ordinary allow rules permit ONLY this synthetic tool; this is not bypass mode. The OS restricts writes to disposable paths regardless.
fs.writeFileSync(path.join(iso.configDir,'settings.json'),JSON.stringify({permissions:{defaultMode:'default',allow:mode==='failure'?['Write']:[]}}));
const commands=[];
for(const args of [['--version'],['plugin','validate',plugin,'--json']]){
 let code=0,output='';try{output=execFileSync(binary,args,{cwd:iso.project,env,encoding:'utf8',timeout:15000,maxBuffer:100000});}catch(e){code=e.status??e.code;output=String(e.stdout??'')+String(e.stderr??'');}
 commands.push({args,code,output:stripAnsi(output)});
}
// Generate a real, minimal 1x1 RGBA PNG, including CRCs: it is a transport fixture, not a vision-quality test.
function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type);const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([t,data])),out.length-4);return out;}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);
if(mode==='attachment')fs.writeFileSync(path.join(iso.project,'tiny.png'),png);
const script=mode==='failure'?['failure-open','failure-deny','failure-timeout'].flatMap(name=>[{tools:[{name:'Write',input:{file_path:path.join(iso.project,`${name}.txt`),content:`SYNTHETIC_${name}\n`}}]},{text:`LOCAL_COMPLETION_${name}`,wordMs:0}]):[{text:'LOCAL_ATTACHMENT_TRANSPORT_REPLY',wordMs:0}];
const requests=[];
const api=await startFakeApi(script,{onRequest(req,body){requests.push({method:req.method,path:req.url,model:body.model,dummyAuth:req.headers.authorization==='Bearer fake-token-for-local-capture',messages:body.messages?.slice(-12)});}});
const childEnv={...env,...fakeApiEnv(api.url)};
let raw='',exit=null;
const child=pty.spawn(binary,['--plugin-dir',plugin,'--debug-file',path.join(iso.root,'debug.log')],{cwd:iso.project,env:childEnv,name:'xterm-256color',cols:110,rows:40});
child.onData(d=>{raw=(raw+d).slice(-65000);});child.onExit(e=>{exit=e;});
const report={mode,root:iso.root,project:iso.project,plugin,binary,environment:childEnv,commands,pid:child.pid,networkNamespace:fs.readlinkSync('/proc/self/ns/net'),png:mode==='attachment'?{bytes:png.length,sha256:crypto.createHash('sha256').update(png).digest('hex')}:undefined};
try{
 const file=path.join(iso.project,`${mode}-mod-report.json`);const end=Date.now()+(mode==='failure'?80000:35000);
 while(Date.now()<end&&exit===null){await sleep(150);if(fs.existsSync(file)){try{if(JSON.parse(fs.readFileSync(file,'utf8')).done)break;}catch{/* atomic write may still be in flight */}}}
 report.modReport=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 report.raw=stripAnsi(raw);report.requests=requests;report.turnsUsed=api.turnsUsed;
 report.files=Object.fromEntries(['failure-open','failure-deny','failure-timeout'].map(n=>{const p=path.join(iso.project,n+'.txt');return[n,{exists:fs.existsSync(p),content:fs.existsSync(p)?fs.readFileSync(p,'utf8'):undefined}];}));
 const transcriptRoot=path.join(iso.configDir,'projects');report.transcripts=[];
 function collect(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())collect(p);else if(p.endsWith('.jsonl')){const entries=fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));report.transcripts.push({path:p,userRows:entries.filter(e=>e.type==='user'),types:entries.map(e=>e.type)});}}}collect(transcriptRoot);
 const debug=path.join(iso.root,'debug.log');if(fs.existsSync(debug))fs.copyFileSync(debug,new URL(`${mode}-debug.log`,evidence));
}finally{
 if(exit===null)child.kill();for(let n=0;n<30&&exit===null;n++)await sleep(100);await api.close();report.childExit=exit;report.serverClosed=true;
}
fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:output.pathname,root:iso.root,commands:commands.map(c=>({args:c.args,code:c.code})),done:report.modReport?.done,requests:requests.length,files:report.files,childExit:exit,serverClosed:true}));
