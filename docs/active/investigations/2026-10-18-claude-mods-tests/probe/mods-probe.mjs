import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {makeIsolatedRoot, resolveClaude, sleep, stripAnsi} from '../../../../../youcoded/desktop/test-conpty/cc-capture-lib.mjs';
import {startFakeApi, fakeApiEnv} from '../../../../../youcoded/desktop/test-conpty/fake-anthropic.mjs';
const require = createRequire(new URL('../../../../../youcoded/desktop/package.json', import.meta.url));
const pty = require('node-pty');
const {Terminal} = require('@xterm/headless');
const iso = makeIsolatedRoot('cc-mods-contract');
const bin = resolveClaude();
const evidence = new URL('../evidence/', import.meta.url);
fs.mkdirSync(evidence, {recursive:true});
// WHY: an allowlist, rather than deleting familiar secrets, excludes unknown provider credentials and live-app identities too.
const env = {PATH:'/usr/local/bin:/usr/bin:/bin', TERM:'xterm-256color', LANG:'C.UTF-8', LC_ALL:'C.UTF-8', HOME:iso.home, CLAUDE_CONFIG_DIR:iso.configDir, TMPDIR:iso.root, XDG_CONFIG_HOME:path.join(iso.home,'.config'), XDG_CACHE_HOME:path.join(iso.home,'.cache'), DISABLE_AUTOUPDATER:'1', DISABLE_TELEMETRY:'1', DISABLE_ERROR_REPORTING:'1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
const report = {root:iso.root,bin,environment:env,commands:[]};
function command(args) {
 let output='',code=0;
 try {output=execFileSync(bin,args,{env,cwd:iso.project,encoding:'utf8',timeout:15000,maxBuffer:200000});}
 catch(e){output=String(e.stdout??'')+String(e.stderr??'');code=e.status??String(e.code);}
 report.commands.push({args,code,output:stripAnsi(output).slice(0,30000)});
}
if (process.argv.includes('--interactive')) {
 const plugin=path.join(iso.root,'disposable-plugin');
 fs.mkdirSync(path.join(plugin,'.claude-plugin'),{recursive:true});
 fs.mkdirSync(path.join(plugin,'hooks'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'.claude-plugin','plugin.json'),JSON.stringify({name:'isolated-mod-contract',version:'0.0.1',description:'Disposable offline loading probe'}));
 fs.writeFileSync(path.join(plugin,'hooks','hooks.json'),JSON.stringify({modules:['./register.ts']}));
 fs.writeFileSync(path.join(plugin,'hooks','register.ts'),'export function register(on) {}\n');
 if(process.argv.includes('--controls')) fs.copyFileSync(new URL('./fixture-register.ts',import.meta.url),path.join(plugin,'hooks','register.ts'));
 fs.writeFileSync(path.join(plugin,'smoke.test.ts'),"import {test,expect} from 'claude-code/testing';\ntest('offline test runner smoke only',()=>{expect(2+2).toBe(4)});\n");
 command(['plugin','validate',plugin,'--json']);
 command(['plugin','test',plugin]);
 const requests=[];
 const api=await startFakeApi(Array.from({length:10},(_,i)=>({text:`LOCAL_SCRIPTED_REPLY_${i}`,wordMs:0,delayMs:i===4?4000:1200})), {onRequest(req,body){requests.push({method:req.method,path:req.url,model:body.model,messages:body.messages?.map(m=>({role:m.role,content:m.content})).slice(-12),dummyAuth:req.headers.authorization==='Bearer fake-token-for-local-capture'});}});
 const childEnv={...env,...fakeApiEnv(api.url)};
 fs.writeFileSync(path.join(iso.configDir,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'dark',numStartups:3,projects:{[iso.project]:{hasTrustDialogAccepted:true}}}));
 const term=new Terminal({cols:110,rows:40,allowProposedApi:true,scrollback:200});
 let raw='',exit=null;
 const child=pty.spawn(bin,['--plugin-dir',plugin,'--debug-file',path.join(iso.root,'debug.log')],{cwd:iso.project,env:childEnv,cols:110,rows:40,name:'xterm-256color'});
 child.onData(d=>{raw=(raw+d).slice(-80000);term.write(d);});
 child.onExit(e=>{exit=e;});
 try {
   const end=Date.now()+(process.argv.includes('--controls')?110000:12000);
   while(Date.now()<end && exit===null){await sleep(300);const p=path.join(iso.project,'mod-report.json');if(fs.existsSync(p)&&JSON.parse(fs.readFileSync(p,'utf8')).done)break;}
   const p=path.join(iso.project,'mod-report.json');
   report.interactive={pid:child.pid,exit,raw:stripAnsi(raw),apiRequests:api.requests,requests,plugin,environment:childEnv,modReport:fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null};
   const types=path.join(plugin,'.claude-plugin','types','claude-code','index.d.ts');
   if(fs.existsSync(types))fs.copyFileSync(types,new URL('generated-claude-code.d.ts',evidence));
   const debug=path.join(iso.root,'debug.log');if(fs.existsSync(debug))fs.copyFileSync(debug,new URL(process.argv.includes('--controls')?'controls-debug.log':'loading-debug.log',evidence));
 }
 finally {if(exit===null)child.kill();await sleep(700);await api.close();report.interactive.finalExit=exit;report.interactive.serverClosed=true;}
} else {
 command(['--version']);command(['plugin','--help']);command(['plugin','validate','--help']);command(['plugin','test','--help']);command(['--help']);
}
const output=process.argv.includes('--controls')?'controls.json':process.argv.includes('--interactive')?'interactive.json':'discovery.json';
fs.writeFileSync(new URL(output,evidence),JSON.stringify(report,null,2));
console.log(JSON.stringify({evidence:output,root:iso.root,commands:report.commands.map(c=>({args:c.args,code:c.code})),interactive:report.interactive?{exit:report.interactive.finalExit,requests:report.interactive.apiRequests.length}:undefined}));
