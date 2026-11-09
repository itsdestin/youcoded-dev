// Isolated real Electron/backend smoke launcher. The only model is the local scripted API.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {startFakeApi,fakeApiEnv} from '../../../../youcoded/desktop/test-conpty/fake-anthropic.mjs';
const workspace=fileURLToPath(new URL('../../../../',import.meta.url));
const out=fs.mkdtempSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'app-smoke-run-'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cc-controls-app-'));
const home=path.join(root,'home'),project=path.join(root,'project'),tmp=path.join(root,'tmp');
for(const p of [home,project,tmp,path.join(home,'.claude')])fs.mkdirSync(p,{recursive:true});
const profile='dev-cc-direct-smoke',offset=481;
const require=createRequire(import.meta.url);
const hooks=require(path.join(workspace,'youcoded/desktop/scripts/install-hooks.js'));
const stable=path.join(home,'.claude','youcoded-hooks');
hooks.stageHookScripts({stamp:'isolated-smoke',srcDir:path.join(workspace,'youcoded/desktop/hook-scripts'),stableDir:stable});
const settings={promptSuggestionEnabled:false};hooks.applyAppHooks(settings,stable,path.join(workspace,'youcoded/desktop/hook-scripts'));
fs.writeFileSync(path.join(home,'.claude/settings.json'),JSON.stringify(settings));
// Without CLAUDE_CONFIG_DIR, the real CLI reads its global state from HOME/.claude.json.
fs.writeFileSync(path.join(home,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'dark',customApiKeyResponses:{approved:['en-for-local-capture'],rejected:[]},projects:{[project]:{hasTrustDialogAccepted:true},[home]:{hasTrustDialogAccepted:true}}}));
const state=path.join(home,'.claude','toolkit-state-'+profile);fs.mkdirSync(state,{recursive:true});
fs.writeFileSync(path.join(state,'config.json'),JSON.stringify({setup_completed:true}));
const requests=[];
function reply(body){
 const last=[...(body.messages??[])].reverse().find(m=>m.role==='user');
 const text=typeof last?.content==='string'?last.content:(last?.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
 const usage={input_tokens:10,cache_creation_input_tokens:1000}; // Exercise the real warm-model confirmation, too.
 return text.includes('STOP_TEST')?{text:Array(120).fill('Local slow response').join(' '),wordMs:80,usage}:{text:'LOCAL APP TEST REPLY: '+text.slice(0,100),wordMs:10,usage};
}
const api=await startFakeApi(Array(100).fill(reply),{onRequest(req,body){requests.push({model:body.model,at:Date.now(),dummyAuth:req.headers['x-api-key']==='fake-token-for-local-capture'||req.headers.authorization==='Bearer fake-token-for-local-capture'});fs.writeFileSync(path.join(out,'app-smoke-requests.json'),JSON.stringify(requests,null,2));}});
const apiEnv=fakeApiEnv(api.url);
// WHY: run-dev correctly removes inherited provider secrets. This private fixture launcher
// adds only a dummy key/local endpoint AFTER isolation, then execs the unmodified real CLI.
delete apiEnv.ANTHROPIC_AUTH_TOKEN;
const bin=path.join(home,'.local/bin');fs.mkdirSync(bin,{recursive:true});
fs.writeFileSync(path.join(bin,'claude'),'#!/bin/bash\nexport ANTHROPIC_API_KEY=fake-token-for-local-capture\nexport ANTHROPIC_BASE_URL='+JSON.stringify(api.url)+'\nexec /home/destin/.local/share/claude/versions/2.1.302 "$@"\n',{mode:0o700});
const env={PATH:bin+':/home/destin/.local/bin:/usr/local/bin:/usr/bin:/bin',HOME:home,TMPDIR:tmp,XDG_CONFIG_HOME:path.join(home,'.config'),XDG_CACHE_HOME:path.join(home,'.cache'),XDG_DATA_HOME:path.join(home,'.local/share'),LANG:'C.UTF-8',...apiEnv,DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',YOUCODED_DISABLE_AUTO_UPDATE:'1'};
for(const k of ['DISPLAY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','XAUTHORITY'])if(process.env[k])env[k]=process.env[k];
const command=['scripts/run-dev.sh','--path',path.join(workspace,'youcoded'),'--label','Claude Direct Controls — isolated test','--offset',String(offset),'--profile',profile];
const info={root,home,project,profile,offset,evidence:out,devtoolsPort:9222+offset,vitePort:5173+offset,fakeApi:api.url,command,startedAt:new Date().toISOString()};
fs.writeFileSync(path.join(out,'app-smoke-instance.json'),JSON.stringify(info,null,2));
const child=spawn('/bin/bash',command,{cwd:workspace,env,stdio:['ignore','inherit','inherit']});
console.log('APP_SMOKE '+JSON.stringify(info));
let ending=false;
async function stop(){
 if(ending)return;ending=true;
 spawnSync('/bin/bash',['scripts/run-dev.sh','--stop','--offset',String(offset)],{cwd:workspace,env,stdio:'inherit',timeout:15000});
 await api.close();
 fs.writeFileSync(path.join(out,'app-smoke-cleanup.json'),JSON.stringify({controllerClosed:true,requests:requests.length,allDummy:requests.every(r=>r.dummyAuth),at:new Date().toISOString()},null,2));
}
process.on('SIGTERM',()=>{void stop().finally(()=>process.exit(0));});
process.on('SIGINT',()=>{void stop().finally(()=>process.exit(0));});
child.on('exit',code=>{void stop().finally(()=>{process.exitCode=code??1;});});
