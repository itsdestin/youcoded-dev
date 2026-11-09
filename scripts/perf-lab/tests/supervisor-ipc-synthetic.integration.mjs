// EXPLICIT TEST-ONLY integration, excluded from *.test.mjs. Composes the ACTUAL
// SupervisorSession + worker protocol + OwnedProcesses + Python gate with ONE
// fixed sleep ELF. Does NOT invoke or relax production package authorization.
import { fork, spawn } from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync,statSync,lstatSync,realpathSync,openSync,readSync,closeSync,readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join,resolve } from 'node:path';
import { observeChildRetirement } from '../supervised-retirement.mjs';
import { SupervisorSession } from '../supervised-launch-core.mjs';
import { bindSupervisorProtocol } from '../supervised-launch-worker.mjs';
import { OwnedProcesses,readProc } from '../owned-processes.mjs';
import { inspectExecIdentity } from '../supervised-launch-linux.mjs';
import { assertProtocolEnvelope,makeBoundedSender,sendFinalAndDisconnect } from '../supervised-protocol.mjs';
import { authorizeSyntheticInvocation,finishSyntheticRetirement } from './supervisor-ipc-synthetic-support.mjs';

const mode=authorizeSyntheticInvocation(process.env,process.argv);
const SELF=fileURLToPath(import.meta.url),ROOT=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const waitMs=ms=>new Promise(r=>setTimeout(r,ms));
function save(path,value){const text=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(text)>65536)throw Error('Synthetic evidence byte cap');writeFileSync(path,text,{mode:0o600});}
function fixedDependency(path){const canonical=realpathSync(path),s=statSync(canonical),fd=openSync(canonical,'r'),header=Buffer.alloc(4);try{readSync(fd,header,0,4,0);}finally{closeSync(fd);}if(!s.isFile()||s.uid!==0||(s.mode&0o6022)||!(s.mode&0o100)||header.toString('hex')!=='7f454c46')throw Error('Untrusted fixed ELF dependency');return {path:canonical,identity:{dev:s.dev,ino:s.ino,uid:s.uid,mode:s.mode}};}
async function until(read,label,ms=3000){const end=performance.now()+ms;while(performance.now()<end){const r=read();if(r)return r;await waitMs(10);}throw Error(`Synthetic ${label} timeout`);}

async function workerMain(){
 if(typeof process.send!=='function'||!process.connected)throw Error('Private actual IPC worker required');
 const runDir=process.env.PERF_LAB_SYNTHETIC_IPC_RUN;
 if(!runDir||resolve(runDir)!==runDir||!runDir.startsWith(join(ROOT,'scratch/perf-lab/synthetic-ipc-')))throw Error('Private fixed synthetic run required');
 const dir=lstatSync(runDir);if(!dir.isDirectory()||dir.uid!==process.getuid()||(dir.mode&0o077)||realpathSync(runDir)!==runDir)throw Error('Private run identity refused');
 const home=join(runDir,'home'),binary=fixedDependency('/usr/bin/sleep'),python=fixedDependency('/usr/bin/python3');
 if(binary.path!=='/usr/bin/sleep'||!python.path.startsWith('/usr/bin/python3'))throw Error('Unexpected fixed dependency resolution');
 const gate=fileURLToPath(new URL('../supervised-exec-gate.py',import.meta.url));
 const evidence={revision:1,scope:'TEST ONLY actual worker/session IPC disconnect -> fixed sleep 10 cleanup; not production app validation',runDir,workerPid:process.pid,workerParentPid:process.ppid,
  status:'incomplete',binary:binary.path,python:python.path,signals:[],events:[],wallMs:18000,maxRssMb:64,cleanupReserveMs:8000};
 const persist=()=>save(join(runDir,'worker-evidence.json'),evidence);
 let stopping=false,session,detach=()=>{},timer;
 const send=makeBoundedSender(process,reason=>{void finish(reason);});
 async function finish(reason){
  if(stopping)return;stopping=true;clearInterval(timer);evidence.trigger={reason,at:performance.now()};persist();
  try{
   const receipt=await finishSyntheticRetirement({session,reason,detach,save:receipt=>{evidence.retirement=receipt;evidence.procAbsent=evidence.childPid?readProc(evidence.childPid)===null:null;
    evidence.status=receipt.cleanupConfirmed&&evidence.procAbsent&&reason==='controller-disconnect'?'measured':'incomplete';persist();},channel:process,send});
   process.exitCode=evidence.status==='measured'?0:2;
  }catch(error){evidence.error=error.message;evidence.status='incomplete';persist();process.exitCode=2;sendFinalAndDisconnect(process,send,{fatal:String(error.message).slice(0,1024)});}
 }
 // Session's app-shaped plan validates state-machine policy only. The test-only
 // adapter below IGNORES its binary/receipt and has no caller-selected target.
 // Production authorizeSupervisorPackage/makeLinuxAdapters are NOT bypassed or
 // invoked: this composition claims only real session/IPC/gate/cleanup mechanics.
 const policyCheckout=join(runDir,'policy-only','youcoded'),policyRoot=join(policyCheckout,'desktop/release/linux-unpacked');
 const plan={revision:1,runDir,binary:join(policyRoot,'youcoded'),packageReceipt:{revision:1,checkout:policyCheckout,packageRoot:policyRoot},home,bin:join(home,'bin'),userData:join(home,'.config/youcoded'),perfLog:join(home,'perf-marks.jsonl'),wallMs:18000,maxRssMb:64,cleanupReserveMs:8000,cdpPort:9569,display:':99'};
 const deps={now:()=>performance.now(),persist:row=>{if(evidence.events.length>=128)throw Error('Synthetic event cap');evidence.events.push(row);persist();},emit:row=>send({event:row}),endpoint:async()=>{throw Error('CDP forbidden in fixed synthetic test');},
  async spawnGate(){
   const path=join(runDir,'exec-plan.json');writeFileSync(path,JSON.stringify({binary:binary.path,identity:binary.identity,argv:[binary.path,'10'],env:{HOME:home,PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}}),{flag:'wx',mode:0o600});
   const child=spawn(python.path,['-I','-S',gate,path],{cwd:home,env:{HOME:home,PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},detached:true,stdio:['ignore','pipe','pipe','pipe','pipe']});
   evidence.childPid=child.pid;persist();let ready=false,exited=false,closed=false,failure=null,released=false,stdout=0,stderr=0,family;
   child.on('error',e=>{failure=e;});child.on('exit',(code,signal)=>{exited=true;evidence.childExit={code,signal,at:performance.now()};persist();});child.on('close',(code,signal)=>{closed=true;evidence.childClose={code,signal,at:performance.now()};persist();});
   for(const name of ['stdout','stderr']){child[name].on('data',b=>{if(name==='stdout')stdout+=b.length;else stderr+=b.length;if(stdout+stderr>8192)failure=Error('Synthetic output cap');});child[name].on('error',e=>{failure=e;});}
   child.stdio[3].on('error',e=>{failure=e;});child.stdio[4].on('data',b=>{ready=b.equals(Buffer.from('G'));});child.stdio[4].on('error',e=>{failure=e;});
   return {child,get family(){return family;},
    async capture(){await until(()=>{if(failure)throw failure;return ready;},'gate readiness');
     family=new OwnedProcesses({leaderPid:child.pid,jobDir:runDir,maxMembers:4,signal:(pid,sig)=>{evidence.signals.push({pid,sig,starttime:family.known.get(pid)?.starttime,at:performance.now()});persist();process.kill(pid,sig);}});
     family.captureExecGate({expectedExe:python.path,expectedUid:process.getuid(),expectedHome:home,inspect:inspectExecIdentity});
     evidence.before=inspectExecIdentity(child.pid);persist();await waitMs(100);evidence.held=inspectExecIdentity(child.pid);
     const snapshot=family.sample();evidence.peakRssMb=snapshot.rssMb;
     if(evidence.held.exe!==python.path||evidence.held.starttime!==evidence.before.starttime||snapshot.members.length!==1||snapshot.rssMb>64)throw Error('Pre-release work/identity/RSS mismatch');evidence.preReleaseNoWork=true;persist();},
    release(){if(!family?.leader||failure||released)throw Error('Uncaptured gate release');released=true;child.stdio[3].end('R');evidence.releaseAt=performance.now();persist();},
    abort(){if(!released)child.stdio[3].destroy();},
    async corroborate(){evidence.after=await until(()=>{if(failure)throw failure;const r=inspectExecIdentity(child.pid);if(!r)throw Error('Child missing before exec proof');if(r.exe===python.path)return false;
     if(r.exe!==binary.path||r.pid!==evidence.before.pid||r.starttime!==evidence.before.starttime||r.ppid!==process.pid||r.pgrp!==r.pid||r.session!==r.pid||r.uid!==process.getuid()||r.home!==home)throw Error('Fixed postexec identity mismatch');for(const k of ['dev','ino','uid','mode'])if(r.executableIdentity[k]!==binary.identity[k])throw Error('Fixed postexec executable identity mismatch');return r;},'exec proof');
     evidence.execVerifiedAt=performance.now();evidence.aliveAtAck=!exited;persist();if(exited)throw Error('Child exited before launched acknowledgement');},
    pipeState:()=>({exited,closed}),async waitClosed(ms){try{await until(()=>exited&&closed,'child close',ms);}catch{/*retirement fails closed*/}evidence.stdoutBytes=stdout;evidence.stderrBytes=stderr;persist();return {exited,closed,error:failure?.message??null};}
   };
  }
 };
 session=new SupervisorSession(plan,deps);detach=bindSupervisorProtocol(process,session,{finish,send,isStopping:()=>stopping});
 timer=setInterval(()=>{void session.tick().then(()=>{if(session.receipt)void finish(session.receipt.reason);},e=>{void finish('monitor-error:'+e.message);});},100);
 if(!process.connected){await finish('controller-disconnect');return;}session.ready();
}

async function controllerMain(){
 const runDir=mkdtempSync(join(ROOT,'scratch/perf-lab/synthetic-ipc-'));mkdirSync(join(runDir,'home'),{mode:0o700});
 const evidence={revision:1,scope:'TEST ONLY controller/worker disconnect calibration',runDir,controllerPid:process.pid,status:'incomplete',messages:[]};
 const persist=()=>save(join(runDir,'controller-evidence.json'),evidence);
 const worker=fork(SELF,['--fixed-worker'],{cwd:runDir,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,LANG:'C.UTF-8',PERF_LAB_SYNTHETIC_IPC:'1',PERF_LAB_SYNTHETIC_IPC_WORKER:'1',PERF_LAB_SYNTHETIC_IPC_RUN:runDir},execArgv:[],detached:true,stdio:['ignore','pipe','pipe','ipc']});
 const retirement=observeChildRetirement(worker);
 evidence.workerResourceEvents=[];
 for(const event of ['exit','disconnect','close'])worker.on(event,()=>{evidence.workerResourceEvents.push({event,at:performance.now()});persist();});
 for(const name of ['stdout','stderr'])worker[name].on('close',()=>{evidence.workerResourceEvents.push({event:name+'-close',at:performance.now()});persist();});
 evidence.workerPid=worker.pid;evidence.workerIdentity=readProc(worker.pid);persist();console.log(JSON.stringify({runDir,controllerPid:process.pid,workerPid:worker.pid,workerIdentity:evidence.workerIdentity}));
 let ready=false,launched=false,workerExit=null,workerClose=null,failure=null,output=0;
 worker.on('error',e=>{failure=e;});worker.on('message',m=>{try{assertProtocolEnvelope(m);if(evidence.messages.length>=32)throw Error('Controller message cap');evidence.messages.push(m);if(m.event?.type==='ready')ready=true;if(m.id===1&&m.result?.pid)launched=true;if(m.error||m.fatal)failure=Error(m.error??m.fatal);persist();}catch(e){failure=e;worker.disconnect();}});
 worker.on('exit',(code,signal)=>{workerExit={code,signal};evidence.workerExit=workerExit;persist();});worker.on('close',(code,signal)=>{workerClose={code,signal};evidence.workerClose=workerClose;persist();});
 for(const name of ['stdout','stderr'])worker[name].on('data',b=>{output+=b.length;if(output>8192)failure=Error('Worker output cap');});
 try{
  await until(()=>{if(failure)throw failure;return ready;},'worker ready');worker.send({id:1,type:'launch'});
  await until(()=>{if(failure)throw failure;return launched;},'launched reply',5000);
  const observed=JSON.parse(readFileSync(join(runDir,'worker-evidence.json'),'utf8'));
  if(!observed.after||!observed.aliveAtAck||!readProc(observed.after.pid))throw Error('Child not alive at controller disconnect');
  evidence.disconnectAt=performance.now();evidence.childIdentityAtDisconnect=inspectExecIdentity(observed.after.pid);persist();
  worker.disconnect(); // REAL channel disconnect, not a fake callback or stop RPC.
  await until(()=>retirement.snapshot().complete,'worker explicit resource retirement/reap',7000);
  evidence.workerResourceRetirement=await retirement.done;
  const result=JSON.parse(readFileSync(join(runDir,'worker-evidence.json'),'utf8'));
  evidence.workerReceipt=result.retirement;evidence.trigger=result.trigger;evidence.childProcAbsent=readProc(observed.after.pid)===null;evidence.workerProcAbsent=readProc(worker.pid)===null;
  if(workerExit.code!==0||workerExit.signal||evidence.workerResourceRetirement.error||!result.retirement?.cleanupConfirmed||result.trigger?.reason!=='controller-disconnect'||!evidence.childProcAbsent||!evidence.workerProcAbsent||result.childExit?.signal!=='SIGTERM')throw Error('Worker disconnect retirement not proven');
  evidence.status='measured';
 }catch(error){evidence.error=error.message;process.exitCode=2;if(worker.connected)worker.disconnect();}
 finally{persist();console.log(JSON.stringify({status:evidence.status,runDir,workerExit,workerClose,childProcAbsent:evidence.childProcAbsent,workerProcAbsent:evidence.workerProcAbsent}));}
}
if(mode==='worker')workerMain().catch(error=>{process.exitCode=2;sendFinalAndDisconnect(process,makeBoundedSender(process,()=>{}),{fatal:String(error.message).slice(0,1024)});});
else controllerMain().catch(error=>{console.error(error.message);process.exitCode=2;});
