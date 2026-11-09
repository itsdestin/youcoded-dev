// Optional scoped Linux background CPU/context-switch counter adapter. Importing
// does no IO. This reports work, never watts, energy, or a battery-life estimate.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readDiagnosticText,readFailure,parseSensorInteger} from './energy.mjs';
const run=promisify(execFile),finite=n=>typeof n==='number'&&Number.isFinite(n);
// /proc/PID/stat accounts thread-group CPU, but /proc/PID/status switch
// counters belong ONLY to the leader. Do not price worker-thread scheduling
// from these zeros; deliberately avoid an unbounded per-thread crawl.
const COUNTER_SCOPE=Object.freeze({cpuScope:'thread-group',contextSwitchScope:'thread-leader-only',coverage:'Explicit PID endpoints; worker-thread context switches unobserved; births/deaths, children outside supplied membership and sub-interval work remain unseen'});
function text(raw){if(typeof raw!=='string'||Buffer.byteLength(raw)>4096)throw Error('Process record byte cap exceeded');return raw;}
export function parseProcessStat(raw){
 const line=text(raw),head=/^(\d+) \(/.exec(line),end=line.lastIndexOf(')');
 if(!head||end<0)throw Error('Malformed process stat');
 const fields=line.slice(end+1).trim().split(/\s+/);if(fields.length<20)throw Error('Truncated process stat');
 const pid=Number(head[1]);if(!Number.isSafeInteger(pid)||pid<1)throw Error('Invalid process PID');
 return {pid,startTicks:parseSensorInteger(fields[19]),cpuTicks:(BigInt(parseSensorInteger(fields[11]))+BigInt(parseSensorInteger(fields[12]))).toString()};
}
function parseSwitches(raw){const line=text(raw);const value=name=>{const matches=[...line.matchAll(new RegExp(`^${name}:\\s*(\\d+)\\s*$`,'gm'))];if(matches.length!==1)throw Error(`Missing/duplicate ${name}`);return parseSensorInteger(matches[0][1]);};return {voluntary:value('voluntary_ctxt_switches'),involuntary:value('nonvoluntary_ctxt_switches')};}
export async function readClockTicks({exec=run,platform=process.platform}={}){
 if(platform!=='linux')return {status:'unsupported',reason:`CLK_TCK adapter not implemented for ${platform}`};
 try{const {stdout}=await exec('getconf',['CLK_TCK'],{encoding:'utf8',timeout:2000,maxBuffer:4096});const value=text(stdout).trim();if(!/^\d{1,6}$/.test(value)||Number(value)<1)throw Error('Invalid CLK_TCK');return {status:'supported',hz:Number(value),source:'getconf CLK_TCK'};}catch(error){return {status:'failed',reason:`CLK_TCK discovery failed: ${error.code??error.message}`};}
}
// Caller supplies a retained boot/source epoch (e.g. a bounded boot_id read),
// never an inferred PID-only identity. No process discovery or family ownership
// is inferred here: the existing lab owner supplies its explicit scoped PID set.
export async function readBackgroundSnapshot(pids,{platform=process.platform,read=readDiagnosticText,now=()=>performance.now(),hz,epoch}={}){
 if(platform!=='linux')return {status:'unsupported',reason:`Process counters not implemented for ${platform}`,processes:[]};
 if(!Array.isArray(pids)||pids.length>256||pids.some(p=>!Number.isSafeInteger(p)||p<1))throw Error('PID record cap/identity invalid');
 if(!Number.isInteger(hz)||hz<1||hz>999999)return {status:'incomplete',reason:'Discovered CLK_TCK required',processes:[]};
 if(typeof epoch!=='string'||!epoch||epoch.length>128)throw Error('Invalid process epoch');
 const startMs=now(),processes=[],errors=[];
 for(const pid of [...new Set(pids)].sort((a,b)=>a-b)){
  try{const before=parseProcessStat(await read(`/proc/${pid}/stat`)),switches=parseSwitches(await read(`/proc/${pid}/status`)),after=parseProcessStat(await read(`/proc/${pid}/stat`));
   if(before.pid!==pid||after.pid!==pid||before.startTicks!==after.startTicks||BigInt(after.cpuTicks)<BigInt(before.cpuTicks))throw Error('Process identity/counter changed during read');
   processes.push({...after,...switches});
  }catch(error){errors.push({pid,...readFailure(error,`/proc/${pid}`)});}
 }
 const atMs=now();return {status:!finite(startMs)||!finite(atMs)||atMs<startMs?'failed':errors.length?'incomplete':'supported',source:'linux-proc-stat/status',epoch,hz,startMs,atMs,readElapsedMs:atMs-startMs,processes,errors,
  unseenBirthDeathGap:true,...COUNTER_SCOPE,units:{cpuTicks:'CLK_TCK ticks',contextSwitches:'count'},powerAttribution:false};
}
export function backgroundDelta(before,after){
 const elapsedSeconds=(after?.atMs-before?.atMs)/1000;
 if(!finite(elapsedSeconds)||elapsedSeconds<=0)return {status:'failed',reason:'Nonmonotonic/empty process interval'};
 const bad=reason=>({status:'incomplete',reason,elapsedSeconds,unseenBirthDeathGap:true});
 if(!finite(before.startMs)||!finite(after.startMs)||before.startMs>before.atMs||after.startMs>after.atMs||after.startMs<before.atMs)return bad('Overlapping/out-of-order process reads');
 if(before.source!=='linux-proc-stat/status'||after.source!==before.source||before.status!=='supported'||after.status!=='supported'||typeof before.epoch!=='string'||!before.epoch||before.epoch!==after.epoch||before.hz!==after.hz||!Number.isInteger(before.hz)||before.hz<=0)return bad('Counter epoch, clock frequency or read completeness changed');
 if(!Array.isArray(before.processes)||!Array.isArray(after.processes)||before.processes.length>256||after.processes.length>256)return bad('Process record cap/type invalid');
 if([...before.processes,...after.processes].some(p=>!p||!Number.isSafeInteger(p.pid)||p.pid<1||typeof p.startTicks!=='string'||!/^\d{1,40}$/.test(p.startTicks)))return bad('Missing/invalid PID starttime identity');
 const b=new Map(before.processes.map(p=>[p.pid,p])),a=new Map(after.processes.map(p=>[p.pid,p]));
 if(!b.size||b.size!==before.processes.length||a.size!==after.processes.length||a.size!==b.size||[...a.keys()].some(pid=>!b.has(pid)))return bad('Endpoint membership changed or duplicated; no zero-cost missing process');
 const perPid=[];let cpuSeconds=0,contextSwitches=0;
 try{for(const [pid,v] of a){const old=b.get(pid);if(v.startTicks!==old.startTicks)return bad('PID reused/starttime changed');
  const delta=key=>{const n=BigInt(parseSensorInteger(v[key]))-BigInt(parseSensorInteger(old[key]));if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Counter reset or precision loss');return Number(n);};
  const seconds=delta('cpuTicks')/before.hz,switches=delta('voluntary')+delta('involuntary');cpuSeconds+=seconds;contextSwitches+=switches;perPid.push({pid,startTicks:v.startTicks,cpuSeconds:seconds,contextSwitches:switches});
 }}catch(error){return bad(error.message);}
 if(!finite(cpuSeconds)||!Number.isSafeInteger(contextSwitches))return bad('Aggregate counter precision lost');
 return {status:'supported',elapsedSeconds,cpuSeconds,cpuPctOneCore:cpuSeconds/elapsedSeconds*100,contextSwitches,contextSwitchesPerSecond:contextSwitches/elapsedSeconds,perPid,unseenBirthDeathGap:true,...COUNTER_SCOPE,
  powerAttribution:false,scope:'Supplied stable PID identities only, endpoint accounting; not complete process-family lifetime cost',units:{cpuSeconds:'seconds',cpuPctOneCore:'percent of one logical CPU',contextSwitches:'count'}};
}
