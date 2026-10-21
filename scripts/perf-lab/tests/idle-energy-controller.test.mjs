// Offline only. Fake streams/children/timers/files; no real processes or sensors.
import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {parseIdleArgs,runIdleDiagnostic} from '../idle-overhead.mjs';
import {runOwnedDiagnosticHelper,encodeSensorFrame,createSensorFrameReader} from '../energy-controller.mjs';
import {executeDiagnosticRequest,installHelperLifetime,reserveSensorOutput} from '../energy-helper.mjs';
import {SENSOR_OUTPUT_ROOT} from '../energy-controller.mjs';
import {parseSensorArgs} from '../energy-sensors.mjs';
import {readEnergySnapshot,sampleEnergyWindow} from '../energy.mjs';
const request={command:'sensors',options:{durationMs:1000,intervalMs:1000,maxSamples:2,maxSensors:1},out:SENSOR_OUTPUT_ROOT+'/fake-run/report.json'};
const sensor={id:'/sys/devices/fake/energy_uj',path:'/sys/devices/fake/energy_uj',kind:'powercap',unit:'microjoule',scope:'package',source:'linux-sysfs'};
const reading={status:'supported',sensor,sourceIdentity:sensor.path,startMs:1,atMs:2,value:'10',range:'1000',unit:'microjoule'};
const report={schema:1,lane:'sensor-only-diagnostic',standardAcceptance:false,status:'supported',discovery:{status:'supported',sensors:[sensor]},samples:[{atMs:0,readElapsedMs:3,readings:[reading]}],lostCheckpoints:0};
test('fresh scratch reservation rejects existing targets, dangling links, linked ancestors and outside paths',()=>{
 const missing=()=>Object.assign(Error('missing'),{code:'ENOENT'});let inode=20;
 const fs=new Map();const info=(type='dir',ino=inode++)=>({dev:1,ino,type,isDirectory(){return type==='dir';},isFile(){return type==='file';},isSymbolicLink(){return type==='link';}});
 const root=SENSOR_OUTPUT_ROOT;let p='';for(const segment of root.split('/').filter(Boolean)){p+='/'+segment;fs.set(p,info());}
 const api={lstat:path=>{if(!fs.has(path))throw missing();return fs.get(path);},mkdir:path=>{if(fs.has(path))throw Object.assign(Error('exists'),{code:'EEXIST'});fs.set(path,info());},open:path=>{if(fs.has(path))throw Object.assign(Error('exists'),{code:'EEXIST'});fs.set(path,info('file'));return 1;},close:()=>{},publish:(dir,stem)=>{fs.set(dir+'/'+stem+'.json',info('file'));}};
 for(const outside of ['/tmp/out.json','/home/destin/.claude/report.json','/home/destin/.config/youcoded/report.json'])assert.throws(()=>reserveSensorOutput(outside,api),/scratch/);
 const parent=root+'/existing';fs.set(parent,info());fs.set(parent+'/report.json',info('file'));assert.throws(()=>reserveSensorOutput(parent+'/report.json',api));
 const dangling=root+'/dangling';fs.set(dangling,info('link'));assert.throws(()=>reserveSensorOutput(dangling+'/report.json',api));
 const danglingTarget=root+'/dangling-target';fs.set(danglingTarget,info());fs.set(danglingTarget+'/report.json',info('link'));assert.throws(()=>reserveSensorOutput(danglingTarget+'/report.json',api));
 const ancestor=fs.get(root);fs.set(root,info('link'));assert.throws(()=>reserveSensorOutput(root+'/new/report.json',api),/link/);fs.set(root,ancestor);
 const writer=reserveSensorOutput(request.out,api);writer.publish({});writer.publish({});fs.set(request.out,info('file'));assert.throws(()=>writer.publish({}),/identity/);
});

test('fatal UTF8 decoder accepts split multibyte and rejects malformed or truncated bytes',()=>{
 const frame=encodeSensorFrame({type:'result',report:{...report,note:'é'}}),seen=[];const r=createSensorFrameReader(f=>seen.push(f));const index=frame.indexOf(Buffer.from('é'));r.push(frame.subarray(0,index+1));r.push(frame.subarray(index+1));r.end();assert.equal(seen[0].report.note,'é');
 const bad=Buffer.from(frame);bad[index]=255;assert.throws(()=>createSensorFrameReader(()=>{}).push(bad));
 assert.throws(()=>createSensorFrameReader(()=>{}).push(Buffer.from([0xc3,10])));
});

test('independent final evidence rejects substitutions, duplicate sensors and out-of-order/read brackets',()=>{
 for(const mutate of [r=>r.samples[0].readings[0].sourceIdentity='/sys/other',r=>r.samples[0].readings[0].sensor.path='/sys/other',r=>r.discovery.sensors.push({...sensor}),r=>r.samples[0].readings.push({...reading}),r=>r.samples.push({...r.samples[0],atMs:-1}),r=>r.samples[0].readings[0].atMs=5,r=>delete r.samples[0].readings[0].value,r=>r.samples[0].readings[0].unit='joule',r=>r.lostCheckpoints=1]){const r=structuredClone(report);mutate(r);assert.throws(()=>encodeSensorFrame({type:'result',report:r}));}
});
function fake(){const c=new EventEmitter();c.pid=123;c.stdout=new EventEmitter();c.stdin=new EventEmitter();c.stdin.write=()=>{};c.signals=[];c.kill=s=>c.signals.push(s);c.unref=()=>{};return c;}
test('idle --energy refuses before build, dependency preparation or any IO',async()=>{
 const r=await runIdleDiagnostic(parseIdleArgs(['--out','/tmp/fake.json','--energy']),new Proxy({},{get(){throw Error('must not touch deps');}}));assert.equal(r.status,'unsupported');assert.equal(r.exitCode,1);assert.match(r.reason,/lifecycle/);
});
test('sensor-only CLI is bounded and has no app/profile/cleanup options',()=>{
 const r=parseSensorArgs(['--out',request.out]);assert.equal(r.command,'sensors');assert.equal(r.options.maxSensors,4);
 for(const a of [['--cleanup','7'],['--checkout','/app'],['--out=/tmp/fake.json'],['--out','/tmp/fake.json','--seconds','31'],['--out','/tmp/fake.json','--interval-ms','0']])assert.throws(()=>parseSensorArgs(a));
});

test('strict idle flags remain enforced',()=>{for(const a of [['--energy=true'],['--energy-interval-ms=0'],['--unknown'],['stray'],['--seconds'],['--energy','true'],['--out','/a.json','--out','/b.json']])assert.throws(()=>parseIdleArgs(['--out','/tmp/fake.json',...a]));});
test('sensor allowlist excludes cleanup/display commands before child creation',async()=>{
 for(const command of ['cleanup','energy','display-stop'])await assert.rejects(runOwnedDiagnosticHelper({...request,command},{create:()=>{throw Error('spawned');}}),/sensor/i);
 await assert.rejects(executeDiagnosticRequest({...request,command:'cleanup'}),/sensor/i);
});
test('bounded framing rejects escaped oversized, deep, invalid statuses and cumulative samples',()=>{
 for(const bad of [{...report,status:'measured'}, {...report,samples:Array(122).fill({})}, {...report,reason:'\u0000'.repeat(200000)}])assert.throws(()=>encodeSensorFrame({type:'result',report:bad}));
 assert.throws(()=>encodeSensorFrame({type:'result',report:{...report,samples:new Array(1000000000)}}));
 let deep={};for(let i=0;i<40;i++)deep={x:deep};assert.throws(()=>encodeSensorFrame({type:'result',report:{...report,discovery:deep}}));
 const reader=createSensorFrameReader(()=>{});assert.throws(()=>reader.push(Buffer.alloc(300000,65)),/cap/);
 const cumulative=createSensorFrameReader(()=>{});const full=encodeSensorFrame({type:'sample',sample:{atMs:0,readings:Array.from({length:64},()=>({status:'supported'}))}});for(let i=0;i<4;i++)cumulative.push(full);assert.throws(()=>cumulative.push(full),/cap/);
 const count=createSensorFrameReader(()=>{});const frame=encodeSensorFrame({type:'sample',sample:{atMs:0,readings:[]}});for(let i=0;i<121;i++)count.push(frame);assert.throws(()=>count.push(frame),/cap/);
});
test('deadline owner never calls save; stalled writer/read child terminated and exit observed',async()=>{
 const c=fake(),timers=[];const p=runOwnedDiagnosticHelper(request,{create:()=>c,setTimer:f=>{timers.push(f);return f;},clearTimer:()=>{},save:()=>{throw Error('parent save forbidden');}});
 c.stdout.emit('data',encodeSensorFrame({type:'checkpoint',phase:'discovered'}));timers[0]();assert.deepEqual(c.signals,['SIGTERM']);timers[1]();assert.deepEqual(c.signals,['SIGTERM','SIGKILL']);c.emit('exit',null,'SIGKILL');c.stdout.emit('end');const r=await p;assert.equal(r.status,'failed');assert.equal(r.cleanup.exitObserved,true);
});
test('success requires valid final frame, complete output and observed exit',async()=>{
 const c=fake();const p=runOwnedDiagnosticHelper(request,{create:()=>c});c.stdout.emit('data',encodeSensorFrame({type:'result',report}));c.stdout.emit('end');c.emit('exit',0,null);const r=await p;assert.equal(r.status,'supported');assert.equal(r.cleanup.exitObserved,true);
 const blocked=fake(),timers=[];const q=runOwnedDiagnosticHelper(request,{create:()=>blocked,setTimer:f=>{timers.push(f);return f;},clearTimer:()=>{}});timers[0]();timers[1]();timers[2]();assert.equal((await q).cleanup.exitObserved,false);
});
test('stdout lifecycle failures, spawn failure and EPIPE stay failed with observed cleanup',async()=>{
 for(const mode of ['close','error','EPIPE','spawn']){
  const c=fake(),timers=[];if(mode==='spawn')c.pid=undefined;
  const p=runOwnedDiagnosticHelper(request,{create:()=>c,setTimer:f=>{timers.push(f);return f;},clearTimer:()=>{}});
  if(mode==='close')c.stdout.emit('close');else if(mode==='error')c.stdout.emit('error',Error('read error'));else if(mode==='EPIPE')c.stdin.emit('error',Error('EPIPE'));else c.emit('error',Error('spawn error'));
  c.emit('exit',1,null);c.stdout.emit('end');c.emit('error',Error('late duplicate'));const r=await p;assert.equal(r.status,'failed');assert.equal(r.cleanup.exitObserved,true);
 }
 for(const order of ['exit-first','end-first']){const c=fake();const p=runOwnedDiagnosticHelper(request,{create:()=>c});c.stdout.emit('data',encodeSensorFrame({type:'result',report}));if(order==='exit-first'){c.emit('exit',0,null);c.stdout.emit('end');}else{c.stdout.emit('end');c.emit('exit',0,null);}assert.equal((await p).status,'supported');}
});

test('serial helper publications preserve last checkpoint on failed publication and report loss',async()=>{
 let prior,active=0,max=0;const r=await executeDiagnosticRequest(request,{discover:async()=>({status:'supported',sensors:[]}),sample:async o=>{await o.onSample({atMs:0,readElapsedMs:0,readings:[]});return {status:'supported'};},publish:async value=>{max=Math.max(max,++active);try{if(value.samples.length)throw Error('rename failed');prior=structuredClone(value);}finally{active--; }},emit:async()=>{}});
 assert.equal(max,1);assert.equal(prior.samples.length,0);assert.equal(r.status,'incomplete');assert.ok(r.lostCheckpoints>0);
});
test('failed final publication cannot return a supported verdict or erase a primary failure',async()=>{
 let count=0;const good=await executeDiagnosticRequest(request,{canonical:async p=>p,discover:async()=>structuredClone(report.discovery),sample:async o=>{await o.onSample(structuredClone(report.samples[0]));return {status:'supported'};},publish:async()=>{if(++count===4)throw Error('final rename blocked');},emit:async()=>{}});
 assert.equal(good.status,'incomplete');assert.equal(good.lostCheckpoints,1);
 const failed=await executeDiagnosticRequest(request,{discover:async()=>{throw Error('sensor failure');},publish:async()=>{throw Error('write failure');},emit:async()=>{}});assert.equal(failed.status,'failed');assert.equal(failed.reason,'sensor failure');
});

test('real snapshot failure flows through sampler/helper/frame without replacing original sensor reason',async()=>{
 for(const [code,expectedStatus,reason] of [['ENOENT','unsupported','ENOENT'],['EACCES','incomplete','Permission unavailable: EACCES'],['malformed','failed','Invalid nonnegative sensor integer']]){
  const read=async()=>{if(code==='malformed')return 'not-a-counter';throw Object.assign(Error('original sensor error'),{code});};
  const failed=await readEnergySnapshot(sensor,{read,now:()=>0});assert.equal(failed.status,expectedStatus);assert.equal(failed.reason,reason);
  let clock=0;const saved=[],frames=[];
  const result=await executeDiagnosticRequest(request,{canonical:async p=>p,discover:async()=>({status:'supported',sensors:[{...sensor}]}),sample:o=>sampleEnergyWindow({...o,read,now:()=>clock,wait:async ms=>{clock+=ms;}}),publish:async value=>saved.push(structuredClone(value)),emit:async frame=>frames.push(encodeSensorFrame(frame))});
  assert.equal(result.status,'incomplete');assert.equal(result.lostCheckpoints,0);assert.equal(result.checkpointError,undefined);assert.equal(result.samples.length,2);
  for(const sample of result.samples){assert.equal(sample.readings[0].status,expectedStatus);assert.equal(sample.readings[0].reason,reason);assert.equal(sample.readings[0].sensor,null);}
  assert.equal(saved.at(-1).samples[0].readings[0].reason,reason);assert.ok(frames.length);encodeSensorFrame({type:'result',report:result});
 }
});

test('helper lifetime expires itself and notices parent disconnect without app signals',()=>{
 const parent=new EventEmitter(),timers=[],exits=[];const remove=installHelperLifetime(parent,{durationMs:1000,setTimer:f=>{timers.push(f);return f;},clearTimer:()=>{},exit:n=>exits.push(n)});parent.emit('end');assert.deepEqual(exits,[1]);timers[0]();assert.deepEqual(exits,[1,1]);remove();
});
