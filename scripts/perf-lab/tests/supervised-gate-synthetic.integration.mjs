// EXPLICIT integration entry, not *.test.mjs. Fixed sleep ELF only; never app,
// production package authorization, network/CDP, model/provider or compositor.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, realpathSync, openSync, readSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { OwnedProcesses, readProc } from '../owned-processes.mjs';
import { inspectExecIdentity } from '../supervised-launch-linux.mjs';

if(process.env.PERF_LAB_SYNTHETIC_GATE !== '1' || process.platform !== 'linux' || process.argv.length!==2) throw Error('Explicit Linux PERF_LAB_SYNTHETIC_GATE=1 required; no binary/argv overrides');
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const runDir=mkdtempSync(join(root,'scratch/perf-lab/synthetic-gate-'));
const home=join(runDir,'home');mkdirSync(home,{mode:0o700});
const binary=realpathSync('/usr/bin/sleep'),python=realpathSync('/usr/bin/python3');
const gate=fileURLToPath(new URL('../supervised-exec-gate.py',import.meta.url));
const identity=p=>{const s=statSync(p),fd=openSync(p,'r'),header=Buffer.alloc(4);try{readSync(fd,header,0,4,0);}finally{closeSync(fd);}if(!s.isFile() || s.uid!==0 || (s.mode&0o6022) || !(s.mode&0o100) || header.toString('hex')!=='7f454c46')throw Error('Untrusted fixed dependency');return {dev:s.dev,ino:s.ino,uid:s.uid,mode:s.mode};};
if(binary!=='/usr/bin/sleep'||!python.startsWith('/usr/bin/python3'))throw Error('Fixed synthetic dependency path mismatch');
const expected=identity(binary);identity(python);
const evidence={revision:1,scope:'TEST ONLY direct-parent gate -> fixed /usr/bin/sleep 2; not Electron supervision acceptance',runDir,binary,python,parentPid:process.pid,status:'incomplete',signals:[],maxRssMb:64};
const save=()=>writeFileSync(join(runDir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
writeFileSync(join(runDir,'exec-plan.json'),JSON.stringify({binary,identity:expected,argv:[binary,'2'],env:{HOME:home,PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}}),{flag:'wx',mode:0o600});
const child=spawn(python,['-I','-S',gate,join(runDir,'exec-plan.json')],{cwd:home,env:{HOME:home,PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},detached:true,stdio:['ignore','pipe','pipe','pipe','pipe']});
let exited=false,closed=false,ready=false,failure=null,stdout=0,stderr=0,released=false;
child.on('error',e=>{failure=e;});child.on('exit',(code,signal)=>{exited=true;evidence.exit={code,signal};});child.on('close',(code,signal)=>{closed=true;evidence.close={code,signal};});
for(const name of ['stdout','stderr'])child[name].on('data',b=>{if(name==='stdout')stdout+=b.length;else stderr+=b.length;if(stdout+stderr>8192)failure=Error('Synthetic output cap');});
child.stdio[3].on('error',e=>{failure=e;});child.stdio[4].on('data',b=>{ready=b.equals(Buffer.from('G'));});
const family=new OwnedProcesses({leaderPid:child.pid,jobDir:runDir,maxMembers:4,signal:(pid,sig)=>{evidence.signals.push({pid,sig});process.kill(pid,sig);}});
evidence.gatePid=child.pid;save();console.log(JSON.stringify({runDir,gatePid:child.pid,parentPid:process.pid}));
const start=performance.now();
async function wait(predicate,cap=3000){const end=performance.now()+cap;while(performance.now()<end){if(failure)throw failure;if(performance.now()-start>10000)throw Error('Synthetic outer deadline');const result=predicate();if(result)return result;await new Promise(r=>setTimeout(r,10));}throw Error('Synthetic wait timeout');}
try{
 await wait(()=>ready);
 family.captureExecGate({expectedExe:python,expectedUid:process.getuid(),expectedHome:home,inspect:inspectExecIdentity});
 evidence.before=inspectExecIdentity(child.pid);evidence.ownership=family.leader;save();
 // Hold without release and prove the exact gate still waits, with no descendant
 // work and no sleep exec before the ownership receipt has been persisted.
 await new Promise(r=>setTimeout(r,100));
 evidence.held=inspectExecIdentity(child.pid);
 const heldFamily=family.sample();evidence.peakRssMb=heldFamily.rssMb;
 if(heldFamily.rssMb>64)throw Error('Synthetic gate RSS cap');
 if(evidence.held.exe!==python||evidence.held.starttime!==evidence.before.starttime||heldFamily.members.length!==1)throw Error('Pre-release child work/exec detected');
 evidence.preReleaseNoChildWork=true;save();
 child.stdio[3].end('R');released=true;
 evidence.after=await wait(()=>{const r=inspectExecIdentity(child.pid);if(!r)throw Error('Synthetic child vanished before corroboration');if(r.exe===python)return false;if(r.exe!==binary||r.starttime!==evidence.before.starttime||r.ppid!==process.pid||r.home!==home||r.uid!==process.getuid()||r.pgrp!==r.pid||r.session!==r.pid)throw Error('Synthetic postexec identity mismatch');for(const k of ['dev','ino','uid','mode'])if(r.executableIdentity[k]!==expected[k])throw Error('Synthetic executable inode mismatch');return r;});save();
 await wait(()=>{const s=family.sample();evidence.peakRssMb=Math.max(evidence.peakRssMb??0,s.rssMb);if(s.rssMb>64)throw Error('Synthetic RSS cap');return exited&&closed;},4000);
 if(evidence.exit.code!==0||evidence.exit.signal||stdout||stderr)throw Error('Synthetic abnormal exit/output');
 evidence.cleanup=await family.cleanup({termWaitMs:100,killWaitMs:100,everyMs:25});
 evidence.procAbsent=readProc(child.pid)===null;
 if(!evidence.cleanup.cleanupConfirmed||!evidence.procAbsent)throw Error('Synthetic disappearance/reaping unconfirmed');
 evidence.status='measured';
}catch(error){evidence.error=error.message;if(!released)child.stdio[3].destroy();if(family.leader)evidence.cleanup=await family.cleanup({termWaitMs:250,killWaitMs:500,everyMs:25});process.exitCode=2;}
finally{evidence.elapsedMs=performance.now()-start;evidence.stdoutBytes=stdout;evidence.stderrBytes=stderr;save();console.log(JSON.stringify({status:evidence.status,runDir,exit:evidence.exit,cleanup:evidence.cleanup,procAbsent:evidence.procAbsent}));}
