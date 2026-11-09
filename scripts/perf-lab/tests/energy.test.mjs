// Offline only: injected files/clocks; never discover real sensors or launch an app.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseSensorInteger,discoverEnergySensors,readEnergySnapshot,energyDelta,sampleEnergyWindow,parseEnergyObservationOptions} from '../energy.mjs';
const err=code=>Object.assign(Error(code),{code});
const sensor={id:'rapl',kind:'powercap',path:'/fake/energy_uj',rangePath:'/fake/max_energy_range_uj',scope:'cpu-package-domain',source:'linux-powercap',unit:'microjoule'};
const snapshot=(value,t)=>({status:'supported',sensor,sourceIdentity:sensor.path,epoch:'fake-boot',startMs:t,atMs:t,value:String(value),range:'1000'});
const policy={continuityConfirmed:true,maxPowerW:0.0004};
test('sensor integers retain exact units and reject malformed, negative or oversized data',()=>{
 assert.equal(parseSensorInteger('9007199254740993\n'),'9007199254740993');
 for(const raw of ['', '-1','1.5','NaN','1 W','1'.repeat(130)])assert.throws(()=>parseSensorInteger(raw));
});
test('powercap delta uses monotonic elapsed, single wrap and explicit continuity/power bounds',()=>{
 const r=energyDelta(snapshot(900,0),snapshot(100,1000),policy);
 assert.equal(r.status,'supported');assert.equal(r.energyJ,0.0002);assert.equal(r.averagePowerW,0.0002);assert.equal(r.wraps,1);
 const uncertain=energyDelta({...snapshot(900,0),startMs:-10},{...snapshot(100,1000),startMs:990},policy);
 assert.equal(uncertain.elapsedLowerSeconds,0.99);assert.equal(uncertain.elapsedUpperSeconds,1.01);assert.ok(uncertain.powerLowerW<uncertain.averagePowerW&&uncertain.powerUpperW>uncertain.averagePowerW);
 assert.equal(energyDelta(snapshot(900,0),{...snapshot(100,1000),startMs:-1},policy).status,'incomplete');
 assert.equal(energyDelta(snapshot(900,0),snapshot(100,1000)).status,'incomplete');
 assert.equal(energyDelta(snapshot(100,0),snapshot(200,1000),{...policy,maxPowerW:1}).status,'incomplete');
 assert.equal(energyDelta(snapshot(900,0),snapshot(100,1000),{...policy,continuityConfirmed:false}).status,'incomplete');
 assert.equal(energyDelta(snapshot(100,10),snapshot(200,10),policy).status,'failed');
 assert.equal(energyDelta(snapshot(100,20),snapshot(200,10),policy).status,'failed');
 assert.equal(energyDelta(snapshot(100,0),{...snapshot(200,1000),range:'2000'},policy).status,'incomplete');
 assert.equal(energyDelta(snapshot(100,0),snapshot(900,1000),policy).status,'incomplete');
 assert.equal(energyDelta(snapshot(100,0),{...snapshot(200,1000),epoch:'other-boot'},policy).status,'incomplete');
 assert.equal(energyDelta(snapshot(100,0),{...snapshot(200,1000),unit:'joule'},policy).status,'failed');
 const unknown=s=>({...s,sensor:{...s.sensor,kind:'unknown'}});assert.equal(energyDelta(unknown(snapshot(1,0)),unknown(snapshot(2,1000)),policy).status,'failed');
});
test('read failures distinguish missing, permissions, malformed, platform and charging state',async()=>{
 const absent=await readEnergySnapshot(sensor,{read:async()=>{throw err('ENOENT');},now:()=>0});assert.equal(absent.status,'unsupported');
 const denied=await readEnergySnapshot(sensor,{read:async()=>{throw err('EACCES');},now:()=>0});assert.equal(denied.status,'incomplete');assert.match(denied.reason,/permission/i);
 assert.equal((await readEnergySnapshot(sensor,{read:async()=> 'garbage',now:()=>0})).status,'failed');
 const bat={id:'BAT0',kind:'battery-energy',path:'/fake/energy_now',statusPath:'/fake/status',scope:'whole-system-battery',unit:'microwatt-hour'};
 const charging=await readEnergySnapshot(bat,{read:async p=>p.endsWith('status')?'Charging':'100',now:()=>0,epoch:'fake-boot'});assert.equal(charging.batteryState,'Charging');
 assert.equal(energyDelta(charging,{...charging,atMs:1000,value:'90'}).status,'incomplete');
 const before={...charging,batteryState:'Discharging'},after={...before,startMs:3600,atMs:3600,value:'99'};
 assert.equal(energyDelta(before,after).status,'incomplete');
 const delta=energyDelta(before,after,{continuityConfirmed:true});assert.equal(delta.status,'supported');assert.equal(delta.energyJ,0.0036);assert.equal(delta.averagePowerW,0.001);
 assert.equal(energyDelta(before,{...after,value:'101'}).status,'incomplete');
 const power=await readEnergySnapshot({kind:'hwmon-power',path:'/fake/power1_average',scope:'whole-GPU-or-domain',unit:'microwatt'},{read:async()=> '125000000',now:()=>10});assert.equal(power.powerW,125);assert.equal(power.appAttributable,false);
 assert.equal((await discoverEnergySensors({platform:'win32',list:()=>{throw Error('must not read');}})).status,'unsupported');
});
test('bounded discovery identifies domains and units without hiding permission failures',async()=>{
 const files={'/sys/class/powercap':['intel-rapl:0'],'/sys/class/powercap/intel-rapl:0':['energy_uj','max_energy_range_uj','name'],'/sys/class/hwmon':['hwmon0'],'/sys/class/hwmon/hwmon0':['power1_average','name'],'/sys/class/power_supply':['BAT0'],'/sys/class/power_supply/BAT0':['energy_now','power_now','status','type']};
 const r=await discoverEnergySensors({list:async p=>files[p]??[],read:async p=>p.endsWith('/type')?'Battery':p.endsWith('/name')?'package-0':'',maxSensors:8});
 assert.equal(r.sensors.length,4);assert.ok(r.sensors.some(s=>s.kind==='powercap'&&s.scope.includes('package-0')));assert.ok(r.sensors.some(s=>s.kind==='battery-power'));
 const denied=await discoverEnergySensors({list:async()=>{throw err('EACCES');},read:async()=>''});assert.equal(denied.status,'incomplete');assert.equal(denied.errors.length,3);
 const truncated=await discoverEnergySensors({list:async p=>files[p]??[],read:async()=> 'Battery',maxSensors:1});assert.equal(truncated.status,'incomplete');assert.equal(truncated.truncated,true);
});
test('powercap class/nested aliases deduplicate canonical zones and depth omissions are incomplete',async()=>{
 const root='/sys/class/powercap',parent=root+'/intel-rapl:0',nested=parent+'/intel-rapl:0:0',alias=root+'/intel-rapl:0:0';
 const files={[root]:['intel-rapl:0','intel-rapl:0:0'],[parent]:['energy_uj','name','intel-rapl:0:0'],[nested]:['energy_uj','name'],[alias]:['energy_uj','name']};
 const r=await discoverEnergySensors({list:async p=>files[p]??[],read:async()=> 'domain',canonical:async p=>p===alias?nested:p});assert.equal(r.sensors.length,2);assert.equal(r.duplicateAliases,1);
 const deep={};let p=root;for(let i=0;i<5;i++){const name='intel-rapl:'+Array(i+1).fill('0').join(':');deep[p]=['energy_uj','name',name];p+='/'+name;}deep[p]=['energy_uj','name'];
 const d=await discoverEnergySensors({list:async p=>deep[p]??[],read:async()=> 'domain',canonical:async p=>p});assert.equal(d.status,'incomplete');assert.equal(d.truncated,true);assert.ok(d.omissions.some(o=>o.reason==='depth-limit'));
});

test('optional idle energy settings reject invalid numbers and budget excess before IO',()=>{
 assert.deepEqual(parseEnergyObservationOptions([],120),{enabled:false});
 const o=parseEnergyObservationOptions(['--energy','--energy-interval-ms','2000'],120);assert.equal(o.enabled,true);assert.equal(o.maxSamples,61);assert.ok(o.maxSensors*o.maxSamples<=1024);
 for(const args of [['--energy-interval-ms','1000'],['--energy','--energy-interval-ms','NaN'],['--energy','--energy-interval-ms',''],['--energy','--energy-interval-ms','0'],['--energy','--energy-interval-ms','1000','--energy-interval-ms','2000']])assert.throws(()=>parseEnergyObservationOptions(args,120));
 for(const seconds of [NaN,Infinity,-1,121])assert.throws(()=>parseEnergyObservationOptions(['--energy'],seconds));
});

test('upfront caps, source replacement and clock failures never certify readings',async()=>{
 let calls=0;
 await assert.rejects(sampleEnergyWindow({sensors:Array(64).fill(sensor),maxSamples:121,read:async()=>{calls++;return '1';}}),/bounds/);assert.equal(calls,0);
 let identity=0;const replaced=await readEnergySnapshot(sensor,{read:async p=>p.includes('max_')?'1000':'10',now:()=>0,identity:async()=>String(identity++)});assert.equal(replaced.status,'failed');
 assert.equal(energyDelta(snapshot(1,0),{...snapshot(2,1000),sourceIdentity:'/different'},policy).status,'incomplete');
 let t=1;const backwards=await readEnergySnapshot(sensor,{read:async p=>p.includes('max_')?'1000':'10',now:()=>t--});assert.equal(backwards.status,'failed');
 const huge=await readEnergySnapshot({...sensor,scope:'x'.repeat(5000)},{read:async()=>{calls++;return '1';},now:()=>0});assert.equal(huge.status,'failed');assert.equal(calls,0);
});

test('low-frequency bounded sampling never catches up and records read overhead',async()=>{
 let t=0;const r=await sampleEnergyWindow({sensors:[sensor],durationMs:2000,intervalMs:1000,maxSamples:3,now:()=>t,wait:async ms=>{t+=ms;},read:async p=>p.includes('max_')?'1000':'10'});
 assert.equal(r.samples.length,3);assert.equal(r.samples[2].atMs,2000);assert.equal(r.status,'supported');assert.equal(r.appAttributable,false);
 await assert.rejects(sampleEnergyWindow({sensors:[],durationMs:2000,intervalMs:10}),/bounds/);
});
