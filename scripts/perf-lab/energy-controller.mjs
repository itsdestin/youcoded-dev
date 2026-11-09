// Sensor-only controller. No app handles, launchers, sweep, profile locks or
// filesystem publication in the deadline owner. One direct child, bounded pipes.
import {spawn} from 'node:child_process';
import {types,TextDecoder} from 'node:util';import {fileURLToPath} from 'node:url';import {resolve,dirname,basename} from 'node:path';
export const SENSOR_OUTPUT_ROOT=resolve(fileURLToPath(new URL('../../scratch/sensor-runs',import.meta.url)));
export function validateSensorOutput(out){if(typeof out!=='string'||out.length>1024||resolve(out)!==out||dirname(dirname(out))!==SENSOR_OUTPUT_ROOT||!/^[-\w]{1,64}$/.test(basename(dirname(out)))||!/^[-\w]{1,64}\.json$/.test(basename(out)))throw Error('Fresh dedicated scratch sensor-runs/<new-run>/<report>.json required');return out;}
export const SENSOR_PROTOCOL=Object.freeze({schema:1,maxLineBytes:262144,maxTotalBytes:2097152,maxFrames:128,maxSamples:121,maxDepth:20,maxRecords:20000});
const statuses=Object.freeze(['supported','unsupported','incomplete','failed']);
export const SENSOR_COMMANDS=Object.freeze(['sensors']);
function sensorIdentity(s){const units={powercap:'microjoule','hwmon-power':'microwatt','battery-power':'microwatt','battery-energy':'microwatt-hour'};if(!s||typeof s.id!=='string'||s.id!==s.path||!s.path.startsWith('/sys/')||resolve(s.path)!==s.path||!Object.hasOwn(units,s.kind)||s.unit!==units[s.kind]||typeof s.scope!=='string'||!s.scope||typeof s.source!=='string'||!s.source)throw Error('Missing canonical sensor identity/unit');return JSON.stringify([s.path,s.kind,s.unit,s.scope,s.source]);}
export function validateSensorEvidence(r){
 const sensors=r.discovery?.sensors??[],identities=sensors.map(sensorIdentity);if(new Set(identities).size!==identities.length)throw Error('Duplicate discovered sensor identity');
 let previousEnd=-Infinity;
 for(const sample of r.samples){
  if(!Number.isFinite(sample.readElapsedMs)||sample.readElapsedMs<0||sample.atMs<0||sample.atMs<previousEnd)throw Error('Sensor sample time/read bracket invalid');
  const end=sample.atMs+sample.readElapsedMs;if(!Number.isFinite(end))throw Error('Sensor time precision');previousEnd=end;
  const found=[];let previousReadingEnd=sample.atMs;for(const reading of sample.readings){if(reading.status!=='supported'){if(r.status==='supported')throw Error('Incomplete successful reading');continue;}
   const id=sensorIdentity(reading.sensor);if(reading.sourceIdentity!==reading.sensor.path||!identities.includes(id)||found.includes(id))throw Error('Sensor substitution/duplicate reading');found.push(id);
   if(!Number.isFinite(reading.startMs)||!Number.isFinite(reading.atMs)||reading.startMs<previousReadingEnd||reading.atMs<reading.startMs||reading.atMs>end||reading.unit!==reading.sensor.unit)throw Error('Sensor reading time/unit bracket invalid');previousReadingEnd=reading.atMs;
   if(typeof reading.value!=='string'||!/^\d{1,40}$/.test(reading.value))throw Error('Sensor raw integer missing');
   if(reading.sensor.kind==='powercap'&&(typeof reading.range!=='string'||!/^\d{1,40}$/.test(reading.range)||BigInt(reading.range)<=BigInt(reading.value)))throw Error('Sensor range invalid');
   if(reading.sensor.kind.endsWith('power')&&(!Number.isFinite(reading.powerW)||reading.powerW<0||reading.powerW!==Number(reading.value)/1e6))throw Error('Sensor power unit conversion invalid');
   if(reading.sensor.kind.startsWith('battery-')&&!['Charging','Discharging','Full','Not charging','Unknown'].includes(reading.batteryState))throw Error('Sensor battery state missing');
  }
  if(r.status==='supported'&&(found.length!==identities.length||sample.readings.length!==identities.length))throw Error('Missing successful sensor membership');
 }
}
function validateSample(s){if(!s||!Number.isFinite(s.atMs)||!Array.isArray(s.readings)||s.readings.length>64||s.readings.some(r=>!r||!statuses.includes(r.status)))throw Error('Sensor sample schema/status');}
// Preflight inert data BEFORE stringify/escaping. Conservative 6-byte UTF16
// estimate bounds escaped output allocation; parser input is separately capped.
function preflight(value){let records=0,bytes=0;const seen=new Set();function visit(v,d){if(++records>20000||d>20)throw Error('Sensor record/depth cap');if(v===null){bytes+=4;}else if(typeof v==='string'){bytes+=6*v.length+2;}else if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Nonfinite sensor value');bytes+=32;}else if(typeof v==='boolean'){bytes+=5;}else if(typeof v==='object'){
 if(types.isProxy(v)||seen.has(v))throw Error('Sensor proxy/cycle');const proto=Object.getPrototypeOf(v);if(Array.isArray(v)?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)throw Error('Sensor plain data required');seen.add(v);bytes+=2;
 if(Array.isArray(v)){
  if(v.length>20000)throw Error('Sensor array record cap');
  for(let i=0;i<v.length;i++){const desc=Object.getOwnPropertyDescriptor(v,String(i));if(!desc||!('value'in desc))throw Error('Sensor sparse/accessor array rejected');bytes++;visit(desc.value,d+1);}
 }else for(const k in v){const desc=Object.getOwnPropertyDescriptor(v,k);if(!desc||!('value'in desc))throw Error('Sensor accessor rejected');if(++records>20000)throw Error('Sensor record cap');bytes+=6*k.length+4;visit(desc.value,d+1);}seen.delete(v);
 }else throw Error('Unsupported sensor value');if(bytes>262144)throw Error('Sensor escaped byte cap');}visit(value,0);}
function validateFrame(f){preflight(f);if(!f||!['result','sample','checkpoint'].includes(f.type))throw Error('Sensor frame schema');
 if(f.type==='result'){const r=f.report;if(r?.schema!==1||r.lane!=='sensor-only-diagnostic'||r.standardAcceptance!==false||!statuses.includes(r.status)||!Array.isArray(r.samples)||r.samples.length>121||!Number.isInteger(r.lostCheckpoints)||r.lostCheckpoints<0)throw Error('Sensor report schema/status');
  if(r.discovery!==null&&(!r.discovery||!statuses.includes(r.discovery.status)||!Array.isArray(r.discovery.sensors)||r.discovery.sensors.length>16))throw Error('Sensor discovery schema/status');
  let readings=0;for(const sample of r.samples){validateSample(sample);readings+=sample.readings.length;}if(readings>256)throw Error('Sensor cumulative reading cap');
  validateSensorEvidence(r);
  if(r.status==='supported'&&(r.lostCheckpoints!==0||r.checkpointError!==undefined||r.reason!==undefined||r.discovery?.status!=='supported'||r.discovery.sensors.length===0||r.samples.length===0||r.samples.some(s=>s.readings.length!==r.discovery.sensors.length||s.readings.some(v=>v.status!=='supported'))))throw Error('Unsupported successful sensor report');
 }
 if(f.type==='sample')validateSample(f.sample);
 if(f.type==='checkpoint'&&!['initial','discovered','sample','final'].includes(f.phase))throw Error('Sensor checkpoint schema');
}
export function encodeSensorFrame(frame){validateFrame(frame);const out=Buffer.from(JSON.stringify(frame)+'\n');if(out.length>262144)throw Error('Sensor frame byte cap');return out;}
export function createSensorFrameReader(onFrame){let pending=Buffer.alloc(0),bytes=0,frames=0,samples=0,readings=0,ended=false;return {
 push(chunk){if(ended)throw Error('Sensor data after end');if(!Buffer.isBuffer(chunk))chunk=Buffer.from(chunk);bytes+=chunk.length;if(bytes>2097152||pending.length+chunk.length>524288)throw Error('Sensor cumulative/input byte cap');pending=Buffer.concat([pending,chunk]);let i;while((i=pending.indexOf(10))>=0){if(i>262144||++frames>128)throw Error('Sensor line/frame cap');const line=pending.subarray(0,i);pending=pending.subarray(i+1);const f=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line));validateFrame(f);if(f.type==='sample'){readings+=f.sample.readings.length;if(++samples>121||readings>256)throw Error('Sensor cumulative sample/reading cap');}onFrame(f);}if(pending.length>262144)throw Error('Sensor line cap');},
 end(){ended=true;if(pending.length)throw Error('Truncated sensor frame');}
 };}
export function validateSensorRequest(r){
 preflight(r);
 if(!SENSOR_COMMANDS.includes(r?.command)||Object.keys(r).some(k=>!['command','options','out'].includes(k)))throw Error('Sensor-only immutable command allowlist');
 const o=r.options;if(!o||Object.keys(o).some(k=>!['durationMs','intervalMs','maxSamples','maxSensors','enabled'].includes(k))||!Number.isFinite(o.durationMs)||o.durationMs<0||o.durationMs>120000||!Number.isInteger(o.intervalMs)||o.intervalMs<1000||o.intervalMs>10000||!Number.isInteger(o.maxSamples)||o.maxSamples<1||o.maxSamples>121||!Number.isInteger(o.maxSensors)||o.maxSensors<1||o.maxSensors>16||o.maxSamples*o.maxSensors>256)throw Error('Sensor request bounds');
 validateSensorOutput(r.out);
 return r;
}
const createDefault=()=>spawn(process.execPath,[fileURLToPath(new URL('./energy-helper.mjs',import.meta.url))],{stdio:['pipe','pipe','ignore'],env:{PATH:process.env.PATH??'',LANG:'C'}});
export async function runOwnedDiagnosticHelper(request,{timeoutMs,create=createDefault,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 validateSensorRequest(request);timeoutMs??=request.options.durationMs+10000;if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>130000)throw Error('Sensor deadline bounds');
 const child=create(),identity=Object.freeze({pid:child.pid,kind:'direct-spawned-sensor-helper'}),state={schema:1,lane:'sensor-only-diagnostic',standardAcceptance:false,status:'incomplete',identity,outputPath:request.out,cleanup:{exitObserved:false,signals:[]}};
 let timer,finished=false,terminating=false,exit=false,ended=false,exitCode,result,resolveDone;
 state.limits='Application deadlines cannot guarantee termination across uninterruptible OS IO; unobserved exit is failed. Parent performs no synchronous checkpoint IO or final-file read.';
 const done=new Promise(r=>resolveDone=r);
 const finish=()=>{if(finished)return;finished=true;clearTimer(timer);child.stdout.removeListener('data',data);child.stdout.removeListener('end',end);child.stdout.removeListener('close',stdoutClose);child.removeListener('exit',onExit);child.stdin.destroy?.();if(!exit){child.unref?.();child.stdout.destroy?.();}resolveDone(state);};
 const signal=s=>{state.cleanup.signals.push(s);try{child.kill(s);}catch(e){state.cleanup.signalError=String(e);}};
 // Every signal uses this retained returned handle, never a numeric PID. Error
 // listeners intentionally remain to consume late EPIPE/close/error races; they
 // become no-ops after finish, while the bounded stream data listener is removed.
 const fail=reason=>{if(finished||terminating)return;terminating=true;state.status='failed';state.reason=reason;state.checkpointStatus='Last acknowledged child publication only; no parent disk read, final status may not be durable';clearTimer(timer);if(exit){finish();return;}signal('SIGTERM');if(finished)return;timer=setTimer(()=>{signal('SIGKILL');if(finished)return;timer=setTimer(()=>{state.cleanup.unverifiedReason='Exit not observed; possible uninterruptible OS IO. No cleanup success claimed';finish();},2000);},1000);};
 const settle=()=>{if(exit&&ended){if(!terminating){state.status=exitCode===0&&result?result.status:'failed';state.report=result??null;if(!result)state.reason='Missing final sensor report';}finish();}};
 const reader=createSensorFrameReader(f=>{if(f.type==='checkpoint')state.lastCompletedPublication=f.phase;if(f.type==='result'){if(result)throw Error('Duplicate result');result=f.report;}else state.lastProgress=f.type==='checkpoint'?f.phase:'sample';});
 const data=c=>{if(finished||terminating)return;try{reader.push(c);}catch(e){fail(e.message);}};
 const end=()=>{ended=true;try{reader.end();}catch(e){fail(e.message);}settle();};
 const onExit=(code,signalName)=>{if(exit||finished)return;exit=true;exitCode=code;state.cleanup={...state.cleanup,exitObserved:true,exitCode:code,exitSignal:signalName};if(terminating){finish();return;}settle();};
 const stdoutClose=()=>{if(!ended)fail('Sensor stdout closed before end');};
 const onError=e=>{if(!finished)fail(`Sensor helper: ${e.message}`);};
 child.stdout.on('data',data);child.stdout.once('end',end);child.stdout.on('error',onError);child.stdout.once('close',stdoutClose);child.once('exit',onExit);child.on('error',onError);child.stdin.on('error',onError);
 timer=setTimer(()=>fail(`External sensor deadline ${timeoutMs}ms; checkpoint may retain last completed publication`),timeoutMs);
 try{child.stdin.write(JSON.stringify(request)+'\n');}catch(e){fail(e.message);}return done;
}
