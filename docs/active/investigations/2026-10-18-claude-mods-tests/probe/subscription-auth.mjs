// Official CLI sign-in only. No credential file is read, copied or included in evidence.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const credits=process.argv.includes('--credits');
const evidence=path.resolve(here,credits?'../evidence/subscription-credits':'../evidence/subscription');
const marker=path.join(evidence,'profile.json');
const binary='/home/destin/.local/share/claude/versions/2.1.302';
const self=fileURLToPath(import.meta.url);
function environment(root){
 const home=path.join(root,'home');
 return {PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,CLAUDE_CONFIG_DIR:path.join(home,'.claude'),TMPDIR:path.join(root,'tmp'),XDG_CONFIG_HOME:path.join(home,'.config'),XDG_CACHE_HOME:path.join(home,'.cache'),XDG_DATA_HOME:path.join(home,'.local/share'),XDG_STATE_HOME:path.join(home,'.local/state'),XDG_RUNTIME_DIR:path.join(root,'runtime'),TERM:'xterm-256color',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',BROWSER:'/usr/bin/true',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
}
function status(env,project){
 const r=spawnSync(binary,['auth','status'],{env,cwd:project,encoding:'utf8',timeout:12000});
 let data;try{data=JSON.parse(r.stdout);}catch{return {exit:r.status,loggedIn:null,error:'auth status did not return JSON'};}
 return {exit:r.status,loggedIn:data.loggedIn,authMethod:data.authMethod,apiProvider:data.apiProvider,subscriptionType:data.subscriptionType};
}
function sandboxArgs(root,mode){
 // WHY: authentication needs Anthropic network access, but it must not write
 // outside its new profile or reach the desktop's keyring/portal session.
 const args=['--ro-bind','/','/','--tmpfs','/tmp','--bind',root,root,'--bind',evidence,evidence,'--tmpfs','/run/user','--dev','/dev','--proc','/proc','--unshare-pid','--die-with-parent','--clearenv'];
 for(const[k,v]of Object.entries(environment(root)))args.push('--setenv',k,v);
 args.push('--','/usr/bin/node',self,mode,root,...(credits?['--credits']:[]));return args;
}
const mode=process.argv[2];
if(mode==='start'||mode==='init'){
 if(fs.existsSync(marker))throw Error('Existing test profile marker: inspect/reuse rather than creating another login');
 fs.mkdirSync(evidence,{recursive:true});
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yc-subscription-smoke-'));fs.chmodSync(root,0o700);
 const project=path.join(root,'project');
 for(const dir of [project,...Object.values(environment(root)).filter(v=>typeof v==='string'&&v.startsWith(root))])fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const info={root,project,binary,createdAt:new Date().toISOString(),maxPrompts:credits?2:3,model:'haiku',submittedPrompts:0,auth:'official CLI --claudeai; user signs in; no credential copying'};
 fs.writeFileSync(marker,JSON.stringify(info,null,2),{flag:'wx',mode:0o600});
 if(mode==='init'){console.log('Created isolated test profile; prompt ceiling:',info.maxPrompts);process.exit(0);}
 const args=sandboxArgs(root,'--login');
 const child=spawn('/usr/bin/bwrap',args,{env:{PATH:'/usr/bin:/bin'},stdio:'inherit'});
 console.log('Isolated official Claude subscription sign-in. No model prompts will run in this process.');
 child.on('exit',(code,signal)=>{console.log('Authentication sandbox exit:',code,signal??'');process.exitCode=code??1;});
}else if(mode==='terminal'){
 const info=JSON.parse(fs.readFileSync(marker,'utf8'));
 // WHY: the user pastes any official authorization code directly into Claude's
 // own terminal. Neither the assistant nor a custom web form receives it.
 const child=spawn('/usr/bin/konsole',['--separate','--builtin-profile','--hold','-p','LocalTabTitleFormat=Claude test sign-in','-e','/usr/bin/bwrap',...sandboxArgs(info.root,'--terminal-login')],{stdio:'ignore'});
 fs.writeFileSync(path.join(evidence,'auth-terminal.json'),JSON.stringify({pid:child.pid,root:info.root,purpose:'official native CLI sign-in; no prompts'},null,2),{mode:0o600});
 child.on('error',error=>{console.error(error.message);process.exitCode=1;});
 child.on('exit',(code)=>{console.log('Separate sign-in terminal closed:',code);process.exitCode=code??1;});
 console.log('Opened separate Claude test sign-in terminal. Finish the official login there; do not paste codes into chat.');
}else if(mode==='status'){
 const info=JSON.parse(fs.readFileSync(marker,'utf8'));
 const r=spawnSync('/usr/bin/bwrap',sandboxArgs(info.root,'--status'),{env:{PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:15000});
 console.log(r.stdout.trim());if(r.status!==0)console.error('Status sandbox exit:',r.status);process.exitCode=r.status??1;
}else if(mode==='--status'||mode==='--login'||mode==='--terminal-login'){
 const root=process.argv[3];if(!root?.startsWith('/tmp/yc-subscription-smoke-'))throw Error('Unexpected profile');
 const env=environment(root),project=path.join(root,'project');
 const before=status(env,project);
 if(mode==='--status'){console.log(JSON.stringify(before));process.exit(before.loggedIn===true?0:1);}
 console.log('Initial isolated status:',JSON.stringify(before));
 if(mode==='--terminal-login'){
   console.log('\nISOLATED CLAUDE TEST PROFILE — no model prompts run here.\nOpen the official link below. If asked for a code, paste it into this terminal, not chat.\n');
   if(before.loggedIn===true){console.log('This test profile is already signed in. You can close this window.');process.exit(0);}
   if(before.loggedIn!==false)throw Error('Cannot establish isolated signed-out state');
   const r=spawnSync(binary,['auth','login','--claudeai'],{env,cwd:project,stdio:'inherit',timeout:10*60*1000});
   console.log('\nIsolated sign-in status:',JSON.stringify(status(env,project)));
   console.log('\nYou can close this test sign-in window and return to YouCoded.');
   process.exit(r.status??1);
 }
 if(before.loggedIn!==false)throw Error('Refusing fresh login: isolated signed-out state was not established');
 const require=createRequire(path.resolve(here,'../../../../../youcoded/desktop/package.json'));
 const pty=require('node-pty');
 const child=pty.spawn(binary,['auth','login','--claudeai'],{env,cwd:project,name:'xterm-256color',cols:120,rows:32});
 const timer=setTimeout(()=>{console.log('\nSign-in time limit reached; stopping only this test login.');child.kill();},10*60*1000);
 child.onData(data=>process.stdout.write(data));
 child.onExit(({exitCode})=>{clearTimeout(timer);console.log('\nFinal isolated status:',JSON.stringify(status(env,project)));process.exitCode=exitCode;});
}else throw Error('Use start or status');
