// Sensor-only child. Deliberately NO launcher, app PID, profile or cleanup API.
import {TextDecoder} from 'node:util';
import {fileURLToPath} from 'node:url';import {dirname,basename,parse,join} from 'node:path';
import {lstatSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {realpath} from 'node:fs/promises';
import {discoverEnergySensors,sampleEnergyWindow} from './energy.mjs';
import {publishReportJson} from './atomic-report.mjs';
import {validateSensorRequest,encodeSensorFrame,validateSensorOutput,SENSOR_OUTPUT_ROOT} from './energy-controller.mjs';
// Fresh private run directory is the ownership boundary. Every existing ancestor
// is lstat-checked (including dangling links); never recurse through a link or
// adopt an existing run/report. Inode identities bind subsequent atomic updates.
export function reserveSensorOutput(out,{lstat=lstatSync,mkdir=mkdirSync,open=openSync,close=closeSync,publish=publishReportJson}={}){
 validateSensorOutput(out);let current=parse(SENSOR_OUTPUT_ROOT).root;
 const ancestors=[];for(const part of SENSOR_OUTPUT_ROOT.slice(current.length).split('/')){current=join(current,part);let s;try{s=lstat(current);}catch(e){if(e.code!=='ENOENT'||current!==SENSOR_OUTPUT_ROOT)throw e;mkdir(current,{mode:0o700});s=lstat(current);}if(s.isSymbolicLink()||!s.isDirectory())throw Error('Sensor scratch ancestor link/non-directory');ancestors.push([current,s.dev,s.ino]);}
 const dir=dirname(out);mkdir(dir,{mode:0o700});const ownDir=lstat(dir);if(ownDir.isSymbolicLink()||!ownDir.isDirectory())throw Error('Sensor run directory invalid');
 const fd=open(out,'wx',0o600);close(fd);let ownFile=lstat(out);
 const check=()=>{for(const [path,dev,ino]of ancestors){const s=lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||s.dev!==dev||s.ino!==ino)throw Error('Sensor scratch ancestor identity changed');}const d=lstat(dir),f=lstat(out);if(!d.isDirectory()||d.isSymbolicLink()||d.dev!==ownDir.dev||d.ino!==ownDir.ino||!f.isFile()||f.isSymbolicLink()||f.dev!==ownFile.dev||f.ino!==ownFile.ino)throw Error('Sensor reserved output identity changed');};
 return {publish(value){check();publish(dir,basename(out,'.json'),value);ownFile=lstat(out);check();}};
}
export function installHelperLifetime(input,{durationMs,setTimer=setTimeout,clearTimer=clearTimeout,exit=n=>process.exit(n)}={}){
 const dead=()=>exit(1),timer=setTimer(dead,Math.min(135000,durationMs+12000));input.once('end',dead);input.once('close',dead);return ()=>{clearTimer(timer);input.removeListener('end',dead);input.removeListener('close',dead);};
}
export function shareSensors(discovery,cap){
 if(!discovery||!Array.isArray(discovery.sensors)||discovery.sensors.length<=cap)return discovery;
 const family=s=>s.kind==='powercap'?0:s.kind==='hwmon-power'?1:2,buckets=[[],[],[]];for(const s of discovery.sensors)buckets[family(s)].push(s);
 const kept=[];for(let i=0;kept.length<cap&&buckets.some(b=>i<b.length);i++)for(const b of buckets)if(i<b.length&&kept.length<cap)kept.push(b[i]);
 return {...discovery,sensors:kept,truncated:true,status:'incomplete',reason:`${discovery.sensors.length} sensors found; trimmed to ${cap} (fairly across families)`};
}
export async function executeDiagnosticRequest(request,{discover=discoverEnergySensors,sample=sampleEnergyWindow,publish,canonical=realpath,emit=async frame=>new Promise((resolve,reject)=>process.stdout.write(encodeSensorFrame(frame),e=>e?reject(e):resolve()))}={}){
 validateSensorRequest(request);
 if(!publish){const reserved=reserveSensorOutput(request.out);publish=async value=>reserved.publish(value);}
 const state={schema:1,lane:'sensor-only-diagnostic',standardAcceptance:false,appAttributable:false,status:'incomplete',discovery:null,samples:[],lostCheckpoints:0};
 const checkpoint=async phase=>{
  try{encodeSensorFrame({type:'result',report:state});await publish(structuredClone(state));await emit({type:'checkpoint',phase});}
  catch(error){if(state.status!=='failed')state.status='incomplete';state.lostCheckpoints++;state.checkpointError=String(error.message).slice(0,256);}
 };
 await checkpoint('initial');
 try{
  // WHY per-family discovery then a fair trim: discovery now budgets powercap/hwmon/battery separately so the battery is
  // never starved by a big powercap tree; the request's maxSensors still bounds the TOTAL readings, so when more were
  // found than allowed the trim takes one sensor from each family in turn (never all from the first) and says it trimmed.
  state.discovery=await discover({maxSensors:request.options.maxSensors});
  state.discovery=shareSensors(state.discovery,request.options.maxSensors);
  // Canonical identity is independent of class aliases for EVERY sensor kind.
  for(const sensor of state.discovery.sensors){sensor.path=await canonical(sensor.path);sensor.id=sensor.path;}
  encodeSensorFrame({type:'result',report:state});await checkpoint('discovered');
  const observation=await sample({...request.options,sensors:state.discovery.sensors,onSample:async value=>{
   if(state.samples.length>=121)throw Error('Sensor sample cap');encodeSensorFrame({type:'sample',sample:value});state.samples.push(value);encodeSensorFrame({type:'result',report:state});await checkpoint('sample');
  }});
  state.status=state.lostCheckpoints||state.discovery.status==='incomplete'?'incomplete':observation.status;
 }catch(error){state.status='failed';state.reason=String(error.message).slice(0,256);}
 await checkpoint('final');
 // Backpressure is serial/awaited; no queue or detached save. Parent deadline
 // covers slow publications/stdout; failed publications leave prior atomic file.
 await emit({type:'result',report:state});return state;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 let data=Buffer.alloc(0),started=false,remove;
 process.stdin.on('data',chunk=>{
  if(started){process.exitCode=1;process.stdin.destroy();return;}
  if(data.length+chunk.length>4096){process.exitCode=1;process.stdin.destroy();return;}data=Buffer.concat([data,chunk]);const newline=data.indexOf(10);if(newline<0)return;started=true;
  try{if(newline!==data.length-1)throw Error('Trailing helper input');const request=validateSensorRequest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(0,newline))));remove=installHelperLifetime(process.stdin,{durationMs:request.options.durationMs});
   executeDiagnosticRequest(request).then(result=>{process.exitCode=result.status==='supported'?0:1;},()=>{process.exitCode=1;}).finally(()=>{remove();process.stdin.destroy();});
  }catch{process.exitCode=1;process.stdin.destroy();}
 });
 // Covers a parent that spawns but never sends a valid request.
 const startup=setTimeout(()=>{if(!started)process.exit(1);},3000);startup.unref();
}
