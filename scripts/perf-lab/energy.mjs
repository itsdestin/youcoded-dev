// Read-only Linux domain sensors. No imports of launchers, browsers or app code.
// Values describe a domain/device/battery, NEVER attributable application watts.
import {open,opendir,realpath} from 'node:fs/promises';
import {join,posix} from 'node:path';
export const ENERGY_LIMITS=Object.freeze({textBytes:4096,maxSensors:64,maxEntries:256,maxDepth:3,maxSamples:121,maxDurationMs:120000,minIntervalMs:1000});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const fail=(status,reason,extra={})=>({status,reason,appAttributable:false,...extra});
export function readFailure(error,source){return fail(['ENOENT','ENOTDIR'].includes(error.code)?'unsupported':['EACCES','EPERM'].includes(error.code)?'incomplete':'failed',`${['EACCES','EPERM'].includes(error.code)?'Permission unavailable: ':''}${String(error.code??error.message).slice(0,256)}`,{source:typeof source==='string'?source.slice(0,1024):undefined});}
// WHY: sysfs stat sizes are often zero; read at most cap+1, never readFile an
// unknown input then truncate it. Caller-injected readers must honor this cap.
export async function readDiagnosticText(path,maxBytes=ENERGY_LIMITS.textBytes){
 if(typeof path!=='string'||path.length>2048||posix.normalize(path)!==path||!/^\/(sys|proc)\//.test(path))throw Error('Diagnostic reader accepts canonical sysfs/proc paths only');
 if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>4096)throw Error('Invalid text byte cap');
 const file=await open(path,'r');try{const buffer=Buffer.alloc(maxBytes+1);const {bytesRead}=await file.read(buffer,0,buffer.length,0);if(bytesRead>maxBytes)throw Error('Diagnostic text byte cap exceeded');return buffer.subarray(0,bytesRead).toString('utf8');}finally{await file.close();}
}
function text(value){if(typeof value!=='string'||Buffer.byteLength(value)>4096)throw Error('Diagnostic text cap/type invalid');return value.trim();}
export function parseSensorInteger(raw){const value=text(raw);if(!/^\d{1,40}$/.test(value))throw Error('Invalid nonnegative sensor integer');return BigInt(value).toString();}
function small(raw){const n=Number(raw);if(!Number.isSafeInteger(n)||n<0)throw Error('Counter delta exceeds numeric precision');return n;}

// A streaming directory reader bounds allocation before accepting names. The
// sentinel entry makes truncation visible to the shared discovery budget.
async function listDiagnosticDirectory(path){
 const directory=await opendir(path),names=[];
 for await(const entry of directory){names.push(entry.name);if(names.length>256)break;}
 return names;
}
const SENSOR_FIELDS=['id','kind','path','rangePath','statusPath','scope','source','unit','semantics'];
function boundedSensor(sensor){
 if(!sensor||typeof sensor!=='object')throw Error('Invalid sensor descriptor');
 const result={};for(const key of SENSOR_FIELDS){const value=sensor[key];if(value!==undefined){const cap=['path','rangePath','statusPath','id'].includes(key)?1024:key==='semantics'?256:128;if(typeof value!=='string'||value.length>cap)throw Error('Sensor descriptor cap/type invalid');result[key]=value;}}
 return result;
}
function sensorKey(sensor){const bounded=boundedSensor(sensor);return SENSOR_FIELDS.map(k=>bounded[k]??null);}
export async function discoverEnergySensors({platform=process.platform,list=listDiagnosticDirectory,read=readDiagnosticText,maxSensors=32,canonical=list===listDiagnosticDirectory?realpath:async p=>p}={}){
 if(platform!=='linux')return fail('unsupported',`Sensor adapter not implemented for ${platform}`,{sensors:[],errors:[]});
 if(!Number.isInteger(maxSensors)||maxSensors<1||maxSensors>64)throw Error('Invalid sensor cap');
 const sensors=[],errors=[],omissions=[],visited=new Set();let truncated=false,entries=0,duplicateAliases=0;
 const omit=(path,reason)=>{truncated=true;if(omissions.length<64)omissions.push({path,reason});};
 const recordError=(e,path)=>{if(errors.length<64)errors.push(readFailure(e,path));else truncated=true;};
 const names=async path=>{try{const values=await list(path);if(!Array.isArray(values))throw Error('Directory listing invalid');const room=Math.max(0,256-entries);if(values.length>room)truncated=true;const bounded=values.slice(0,room);entries+=bounded.length;return bounded.filter(v=>typeof v==='string'&&v.length<=128&&/^[\w.:-]+$/.test(v)).sort();}catch(e){recordError(e,path);return [];}};
 const label=async path=>{try{return text(await read(path)).slice(0,128);}catch(e){recordError(e,path);return 'unavailable';}};
 const add=s=>{if(sensors.length<maxSensors)sensors.push({...s,id:s.path,source:'linux-sysfs',appAttributable:false});else truncated=true;};
 // WHY: powercap exposes the SAME zone through class aliases and parent
 // directories. Deduplicate canonical directories BEFORE reading/descending.
 const powercap=async(path,depth)=>{for(const name of await names(path)){
  if(!/^[\w-]+:\d+(?::\d+)*$/.test(name))continue;
  const dir=join(path,name);let identity;
  try{identity=await canonical(dir);if(typeof identity!=='string'||identity.length>2048||!identity.startsWith('/'))throw Error('Invalid canonical zone identity');}catch(e){recordError(e,dir);continue;}
  if(visited.has(identity)){duplicateAliases++;continue;}
  if(visited.size>=64){omit(dir,'canonical-zone-cap');continue;}visited.add(identity);
  const files=await names(dir);
  if(files.includes('energy_uj'))add({kind:'powercap',path:join(identity,'energy_uj'),rangePath:join(identity,'max_energy_range_uj'),scope:`powercap-domain:${await label(join(dir,'name'))}`,unit:'microjoule'});
  if(files.some(f=>/^[\w-]+:\d+(?::\d+)*$/.test(f))){if(depth<3)await powercap(dir,depth+1);else omit(dir,'depth-limit');}
 }};
 await powercap('/sys/class/powercap',0);
 for(const name of await names('/sys/class/hwmon')){if(!/^hwmon\d+$/.test(name))continue;const dir=join('/sys/class/hwmon',name),files=await names(dir),device=await label(join(dir,'name'));
  for(const file of files)if(/^power\d+_(average|input)$/.test(file))add({kind:'hwmon-power',path:join(dir,file),scope:`whole-device-or-domain:${device}`,unit:'microwatt',semantics:file.endsWith('average')?'driver-averaged power':'driver instantaneous power'});
 }
 for(const name of await names('/sys/class/power_supply')){const dir=join('/sys/class/power_supply',name),files=await names(dir);if(!files.includes('type')||await label(join(dir,'type'))!=='Battery')continue;
  for(const [file,kind,unit] of [['power_now','battery-power','microwatt'],['energy_now','battery-energy','microwatt-hour']])if(files.includes(file))add({kind,path:join(dir,file),statusPath:join(dir,'status'),scope:`whole-system-battery:${name}`,unit,semantics:'coarse battery telemetry; charging/AC state matters, not wall-plug or app power'});
 }
 const inaccessible=errors.some(e=>e.status==='incomplete'||e.status==='failed');
 return {status:truncated||inaccessible?'incomplete':sensors.length?'supported':'unsupported',reason:sensors.length?'Readable candidates require snapshot validation':'No supported sensor candidates found',sensors,errors,truncated,omissions,duplicateAliases,canonicalZonesVisited:visited.size,entriesVisited:entries,appAttributable:false};
}
export async function readEnergySnapshot(sensor,{read=readDiagnosticText,now=()=>performance.now(),epoch,identity=read===readDiagnosticText?realpath:async p=>p}={}){
 const startMs=now();try{
  sensor=boundedSensor(sensor);
  if(epoch!==undefined&&(typeof epoch!=='string'||!epoch||epoch.length>128))throw Error('Invalid sensor epoch');
  if(typeof sensor.path!=='string'||!sensor.path.startsWith('/')||!['powercap','hwmon-power','battery-power','battery-energy'].includes(sensor.kind))throw Error('Invalid sensor descriptor');
  const sourceIdentity=await identity(sensor.path);if(typeof sourceIdentity!=='string'||sourceIdentity.length>2048)throw Error('Source identity cap/type invalid');
  const value=parseSensorInteger(await read(sensor.path));
  const expectedUnit={powercap:'microjoule','hwmon-power':'microwatt','battery-power':'microwatt','battery-energy':'microwatt-hour'}[sensor.kind];if(sensor.unit!==expectedUnit)throw Error('Sensor unit mismatch');
  const result={status:'supported',sensor,sourceIdentity,epoch:epoch??null,value,unit:expectedUnit,scope:sensor.scope,source:sensor.source,appAttributable:false};
  if(sensor.kind==='powercap'){result.range=parseSensorInteger(await read(sensor.rangePath));if(BigInt(result.range)<=0n||BigInt(value)>=BigInt(result.range))throw Error('Energy counter outside advertised range');}
  if(sensor.kind.startsWith('battery-')){result.batteryState=text(await read(sensor.statusPath));if(!['Charging','Discharging','Full','Not charging','Unknown'].includes(result.batteryState))throw Error('Invalid battery status');}
  if(sensor.kind.endsWith('power'))result.powerW=small(value)/1e6;
  if(await identity(sensor.path)!==sourceIdentity)throw Error('Sensor source changed during read');
  result.startMs=startMs;result.atMs=now();result.readElapsedMs=result.atMs-startMs;if(!finite(startMs)||!finite(result.atMs)||result.readElapsedMs<0)throw Error('Nonmonotonic sensor clock');return result;
 }catch(error){
  // WHY: failed reads are evidence too. Explicit null survives bounded inert-JSON
  // framing; undefined used to discard the original errno behind a serializer failure.
  return {...readFailure(error,sensor?.path),sensor:null,atMs:now()};
 }
}
// Interval conversion additionally requires an independently retained source
// epoch (e.g. caller-read boot_id) and continuity policy. Discovery/raw sampling
// alone intentionally cannot certify energy deltas or reset-free counters.
export function energyDelta(before,after,{continuityConfirmed=false,maxPowerW}={}){
 try{
  const elapsedMs=after?.atMs-before?.atMs;if(!finite(elapsedMs)||elapsedMs<=0)return fail('failed','Nonmonotonic/empty sensor interval');
  if(before.status!=='supported'||after.status!=='supported')return fail('incomplete','Incomplete sensor endpoints');
  if(typeof before.epoch!=='string'||!before.epoch||before.epoch.length>128||before.epoch!==after.epoch)return fail('incomplete','Missing/changed independently retained source epoch');
  if(JSON.stringify(sensorKey(before.sensor))!==JSON.stringify(sensorKey(after.sensor))||typeof before.sourceIdentity!=='string'||before.sourceIdentity!==after.sourceIdentity)return fail('incomplete','Sensor source identity missing/changed');
  if(!finite(before.startMs)||!finite(after.startMs)||before.startMs>before.atMs||after.startMs>after.atMs||after.startMs<=before.atMs)return fail('incomplete','Missing/overlapping/out-of-order sensor read brackets');
  const sensor=boundedSensor(before.sensor),scope=sensor.scope,elapsedSeconds=elapsedMs/1000;
  const elapsedLowerSeconds=(after.startMs-before.atMs)/1000,elapsedUpperSeconds=(after.atMs-before.startMs)/1000;
  const common={sensor,scope,elapsedSeconds,elapsedLowerSeconds,elapsedUpperSeconds,appAttributable:false};
  if(![elapsedSeconds,elapsedLowerSeconds,elapsedUpperSeconds].every(n=>finite(n)&&n>0))return fail('failed','Sensor elapsed precision lost');
  const expectedUnit={powercap:'microjoule','battery-energy':'microwatt-hour','hwmon-power':'microwatt','battery-power':'microwatt'}[sensor.kind];
  if(!expectedUnit||sensor.unit!==expectedUnit||(before.unit!==undefined&&before.unit!==expectedUnit)||(after.unit!==undefined&&after.unit!==expectedUnit))return fail('failed','Unknown counter kind/unit mismatch',common);
  if(sensor.kind.endsWith('power'))return fail('unsupported','Power endpoints are readings, not integrated energy; no sampled integration claimed',common);
  const b=BigInt(parseSensorInteger(before.value)),a=BigInt(parseSensorInteger(after.value));let delta,wraps=0;
  if(sensor.kind==='powercap'){
   if(before.range!==after.range)return fail('incomplete','Counter range changed/reset possible',common);
   const range=BigInt(parseSensorInteger(before.range));if(range<=0n||b>=range||a>=range)return fail('failed','Counter outside range',common);
   // WHY: two endpoints cannot distinguish reset from wrap, or zero vs multiple
   // wraps even when the counter rose. Require caller-supplied independent
   // continuity AND an explicit physical upper bound (not the configured limit).
   if(!continuityConfirmed||!finite(maxPowerW)||maxPowerW<=0)return fail('incomplete','Reset/wrap continuity and independent maximum power bound required',common);
   const maximumUj=maxPowerW*elapsedUpperSeconds*1e6;if(!finite(maximumUj)||maximumUj>Number.MAX_SAFE_INTEGER||BigInt(Math.ceil(maximumUj))>=range)return fail('incomplete','Multiple-wrap ambiguity or power-bound precision lost over this interval',common);
   delta=a>=b?a-b:range-b+a;wraps=a<b?1:0;
   if(Number(delta)>maximumUj)return fail('incomplete','Counter reset or power bound violated',common);
  }else{
   if(before.batteryState!=='Discharging'||after.batteryState!=='Discharging'||!continuityConfirmed)return fail('incomplete','Battery discharge continuity unconfirmed; charging/AC ambiguity',common);
   if(a>b)return fail('incomplete','Battery energy increased/reset',common);delta=b-a;
  }
  const energyJ=sensor.kind==='powercap'?small(delta)/1e6:small(delta)*0.0036;
  const averagePowerW=energyJ/elapsedSeconds;if(!finite(energyJ)||!finite(averagePowerW)||!finite(energyJ/elapsedLowerSeconds)||!finite(energyJ/elapsedUpperSeconds))return fail('failed','Derived energy/power not finite',common);
  return {...common,status:'supported',deltaRaw:delta.toString(),energyJ,averagePowerW,powerLowerW:energyJ/elapsedUpperSeconds,powerUpperW:energyJ/elapsedLowerSeconds,wraps,
   continuityPolicy:sensor.kind==='powercap'?'Caller independently asserts no reset and supplies power bound':'Caller independently asserts discharge continuity; coarse sensor update resolution remains a limitation',resolutionWarning:sensor.kind==='battery-energy'?'Coarse whole-system battery-domain estimate; zero delta is not zero consumption':null};
 }catch(error){return fail('failed',error.message);}
}
// Optional existing idle-overhead CLI policy, no IO. Other diagnostic flags are
// owned by that CLI; energy numeric flags never silently fall back to defaults.
export function parseEnergyObservationOptions(argv,seconds){
 if(!Array.isArray(argv)||argv.length>64||argv.some(v=>typeof v!=='string'||v.length>2048))throw Error('Invalid argument cap/type');
 const count=flag=>argv.filter(v=>v===flag).length;
 if(count('--energy')>1||count('--energy-interval-ms')>1)throw Error('Duplicate energy option');
 const enabled=count('--energy')===1,index=argv.indexOf('--energy-interval-ms');
 if(!enabled){if(index>=0)throw Error('--energy required for energy interval');return {enabled:false};}
 const raw=index<0?'2000':argv[index+1];
 if(typeof raw!=='string'||!/^\d{4,5}$/.test(raw)||!finite(seconds)||seconds<1||seconds>120)throw Error('Invalid bounded energy duration/interval');
 const intervalMs=Number(raw);if(intervalMs<1000||intervalMs>10000)throw Error('Energy interval must be1000..10000ms');
 const maxSamples=Math.ceil(seconds*1000/intervalMs)+1,maxSensors=Math.min(16,Math.floor(1024/maxSamples));
 return {enabled:true,durationMs:seconds*1000,intervalMs,maxSamples,maxSensors};
}
export async function sampleEnergyWindow({sensors,durationMs=10000,intervalMs=1000,maxSamples=32,read=readDiagnosticText,now=()=>performance.now(),wait=ms=>new Promise(r=>setTimeout(r,ms)),signal,epoch,onSample=async()=>{}}={}){
 if(!Array.isArray(sensors)||sensors.length>64||!finite(durationMs)||durationMs<0||durationMs>120000||!finite(intervalMs)||intervalMs<1000||!Number.isInteger(maxSamples)||maxSamples<1||maxSamples>121||sensors.length*maxSamples>1024)throw Error('Invalid energy sampling bounds');
 sensors=sensors.map(boundedSensor);
 const start=now(),samples=[];if(!finite(start))throw Error('Nonmonotonic sampling clock');let previous=start,skippedSlots=0,truncated=false;
 do{
  signal?.throwIfAborted();const atMs=now();if(!finite(atMs)||atMs<previous)throw Error('Nonmonotonic sampling clock');previous=atMs;
  const readings=[];for(const sensor of sensors){signal?.throwIfAborted();readings.push(await readEnergySnapshot(sensor,{read,now,epoch}));}
  const done=now();if(!finite(done)||done<atMs)throw Error('Nonmonotonic sampling clock');samples.push({atMs,readElapsedMs:done-atMs,readings});await onSample(samples.at(-1));
  if(done-start>=durationMs)break;
  if(samples.length>=maxSamples){truncated=true;break;}
  // No controller catch-up burst: skip elapsed slots and wait a full interval.
  skippedSlots+=Math.floor((done-atMs)/intervalMs);await wait(intervalMs);
 }while(samples.length<maxSamples);
 const end=now();if(!finite(end)||end<samples.at(-1).atMs)throw Error('Nonmonotonic sampling clock');
 const durationOverrunMs=Math.max(0,end-start-durationMs),readOverrun=durationOverrunMs>intervalMs;
 return {status:truncated||readOverrun||samples.some(s=>s.readings.some(r=>r.status!=='supported'))?'incomplete':sensors.length?'supported':'unsupported',samples,truncated,skippedSlots,appAttributable:false,intervalMs,durationMs,elapsedMs:end-start,durationOverrunMs,
  timeBoundary:'Direct API has bounded schedule, not an OS IO deadline; reads always awaited. idle-overhead owns an externally bounded sensor child; other direct callers must supply their own external watchdog. No in-process IO promises raced/abandoned',
  overheadPolicy:'Low-frequency serial reads >=1000ms, bounded records; readElapsedMs is observer overhead, not sensor energy or application work; no automatic counter continuity assumption',standardAcceptance:false};
}
