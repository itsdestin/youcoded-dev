// No-account, network-isolated controlled Stop comparison. Uses the actual production bridge and CLI.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {startFakeApi} from '../../../../youcoded/desktop/test-conpty/fake-anthropic.mjs';
const self=fileURLToPath(import.meta.url),workspace=fileURLToPath(new URL('../../../../',import.meta.url));
const desktop=path.join(workspace,'youcoded/desktop'),cli='/home/destin/.local/share/claude/versions/2.1.303';
const args=process.argv.slice(2),out=args[args.indexOf('--out')+1];
if(!args.includes('--child')){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cc-stop-recheck-'));fs.mkdirSync(path.join(root,'tmp'));
 const child=spawn('/usr/bin/bwrap',['--die-with-parent','--new-session','--unshare-net','--unshare-pid','--clearenv','--ro-bind','/','/','--proc','/proc','--dev','/dev','--bind',path.join(root,'tmp'),'/tmp','--bind',root,root,'--setenv','PATH','/usr/bin:/bin','--setenv','HOME','/tmp','--chdir',workspace,process.execPath,self,'--child','--out',root],{stdio:'inherit',env:{PATH:'/usr/bin:/bin'}});
 const timer=setTimeout(()=>child.kill('SIGKILL'),240000);const rc=await new Promise(r=>child.on('exit',r));clearTimeout(timer);console.log('EVIDENCE '+root);process.exitCode=rc??1;
}else{
 const require=createRequire(path.join(desktop,'package.json')),pty=require('node-pty');
 const {ClaudeControlBridge}=require(path.join(desktop,'dist/main/claude-control-bridge.js'));
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function wait(label,fn,ms=20000){const end=Date.now()+ms;while(Date.now()<end){const value=fn();if(value)return value;await sleep(20)}throw Error('Timeout '+label)}
 const results=[];
 for(const submit of ['direct','pty'])for(const stop of ['direct','escape']){
  const name=submit+'-'+stop,dir=path.join('/tmp',name),home=path.join(dir,'home'),config=path.join(home,'.claude'),project=path.join(dir,'project');
  fs.mkdirSync(config,{recursive:true});fs.mkdirSync(project,{recursive:true});
  fs.writeFileSync(path.join(config,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'dark',projects:{[project]:{hasTrustDialogAccepted:true}}}));
  fs.writeFileSync(path.join(config,'settings.json'),JSON.stringify({promptSuggestionEnabled:false}));
  const started=path.join(project,'started'),finished=path.join(project,'finished'),followup=path.join(project,'followup');
  // Start marker proves the actual process exists. Eight seconds is below the CLI's usual background timeout.
  const command=`python3 -c "import pathlib,time; pathlib.Path('${started}').write_text('STARTED'); time.sleep(8); pathlib.Path('${finished}').write_text('FINISHED')"`;
  const events=[],record=(kind,data)=>events.push({at:Date.now(),kind,data});let issued=false,wrote=false;
  const api=await startFakeApi(Array(20).fill(body=>{
   record('main-api',{messages:body.messages,model:body.model});
   if(!issued){issued=true;return {tools:[{name:'Bash',input:{command,description:'Controlled cancellable process'}}]}}
   if(fs.existsSync(finished)&&!wrote){wrote=true;return {tools:[{name:'Write',input:{file_path:followup,content:'FOLLOWUP'}}]}}
   return {text:fs.existsSync(finished)?'DONE':'WAITING_OR_CANCELLED'};
  }));
  const bridge=new ClaudeControlBridge(path.join(dir,'deployment'),{operationTimeoutMs:15000});let state={};
  bridge.on('state',(_,s)=>{state=s;record('state',s)});bridge.on('settled',(_,request,result)=>record('settled',{request,result}));
  const prepared=await bridge.prepare('test');let child;
  try{
   const env={PATH:'/usr/bin:/bin',HOME:home,CLAUDE_CONFIG_DIR:config,TMPDIR:'/tmp',LANG:'C.UTF-8',TERM:'xterm-256color',ANTHROPIC_BASE_URL:api.url,ANTHROPIC_AUTH_TOKEN:'localfakeAPI',DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',...prepared.env};
   child=pty.spawn(cli,['--model','haiku','--permission-mode','default','--debug-file',path.join(dir,'cli-debug.log'),'--allowedTools','Bash','Write',...prepared.args],{cwd:project,env,cols:120,rows:40});
   child.onData(b=>fs.appendFileSync(path.join(dir,'terminal.raw'),b));
   await wait('ready '+name,()=>bridge.isReady('test')&&state.claudeSessionId);
   const prompt='Perform the controlled tool task.';
   if(submit==='direct')record('submit-result',await bridge.execute('test',{kind:'send-text',text:prompt,sendId:'once'}));
   else child.write(prompt+'\r'); // Short single-line prompt below paste threshold; same prompt in both arms.
   await wait('actual process start '+name,()=>fs.existsSync(started));await wait('turn identity',()=>state.turnId);
   const stoppedAt=Date.now(),target=state.turnId;record('stop-request',{stop,target,startedAt:fs.statSync(started).mtimeMs});
   if(stop==='direct')record('stop-result',await bridge.execute('test',{kind:'stop'}));else child.write('\x1b');
   // Settle AFTER the command's known completion deadline: expose late side effects and task notifications.
   const until=stoppedAt+14000;while(Date.now()<until)await sleep(100);
   const result={name,submit,stop,command,stopDelayAfterProcessStartMs:stoppedAt-fs.statSync(started).mtimeMs,processCompleted:fs.existsSync(finished),followupWritten:fs.existsSync(followup),mainApiRequests:events.filter(e=>e.kind==='main-api').length,events};
   results.push(result);console.log(JSON.stringify({...result,events:undefined}));
  }catch(e){results.push({name,error:e.stack});console.error(name,e)}
  finally{try{child?.kill('SIGTERM')}catch{}await bridge.close();await api.close();fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(results.at(-1),null,2));}
 }
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(results.map(({events,...r})=>r),null,2));
 process.exitCode=results.some(r=>r.error)?1:0;
}
