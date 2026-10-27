// Narrow no-app Node child_process accounting reproduction, fixed worker only.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if(process.env.PERF_LAB_IPC_CLOSE_REPRO!=='1')throw Error('Explicit no-app repro opt-in required');
if(process.argv[2]==='--fixed-worker'){
 process.on('disconnect',()=>{process.exitCode=0;});process.send({ready:true});
}else{
 const child=fork(fileURLToPath(import.meta.url),['--fixed-worker'],{execArgv:[],env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,PERF_LAB_IPC_CLOSE_REPRO:'1'},stdio:['ignore','pipe','pipe','ipc']});
 const trace=[];const snapshot=event=>trace.push({event,closesGot:child._closesGot,closesNeeded:child._closesNeeded,channelPresent:!!child.channel,at:performance.now()});
 child.stdout.resume();child.stderr.resume();
 child.stdout.on('close',()=>snapshot('stdout-close'));child.stderr.on('close',()=>snapshot('stderr-close'));
 child.on('message',()=>{snapshot('ready');child.disconnect();snapshot('disconnect-called');});
 child.on('disconnect',()=>snapshot('disconnect'));child.on('close',()=>snapshot('child-close'));
 child.on('exit',()=>{snapshot('child-exit');setTimeout(()=>{snapshot('after-100ms');console.log(JSON.stringify({node:process.version,pid:child.pid,trace},null,2));},100);});
}
