// Offline fake /proc and getconf only; no machine process reads.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseProcessStat,readClockTicks,readBackgroundSnapshot,backgroundDelta} from '../background-cost.mjs';
const stat=(pid=7,start=100,ticks=20)=>`${pid} (name with ) spaces) S `+Array.from({length:19},(_,i)=>i===10?String(ticks):i===11?'0':i===18?String(start):'1').join(' ');
const status='voluntary_ctxt_switches: 10\nnonvoluntary_ctxt_switches: 2\n';
test('stat identity includes PID/starttime and CLK_TCK is discovered, never assumed100',async()=>{
 assert.deepEqual(parseProcessStat(stat()),{pid:7,startTicks:'100',cpuTicks:'20'});
 const r=await readClockTicks({exec:async(file,args)=>{assert.equal(file,'getconf');assert.deepEqual(args,['CLK_TCK']);return {stdout:'250\n'};}});assert.equal(r.hz,250);
 assert.equal((await readClockTicks({exec:async()=>({stdout:'NaN'})})).status,'failed');
});
test('scoped reads are complete and PID identity is checked around status read',async()=>{
 const read=async p=>p.endsWith('/stat')?stat():status;
 const r=await readBackgroundSnapshot([7],{read,now:()=>0,hz:250,epoch:'fake-boot'});assert.equal(r.status,'supported');
 let n=0;const reused=await readBackgroundSnapshot([7],{read:async p=>p.endsWith('/stat')?stat(7,++n===1?100:200):status,now:()=>0,hz:250,epoch:'fake-boot'});assert.equal(reused.status,'incomplete');
 const missing=await readBackgroundSnapshot([7],{read:async()=>{throw Object.assign(Error('denied'),{code:'EACCES'});},now:()=>0,hz:250,epoch:'fake-boot'});assert.equal(missing.status,'incomplete');
 await assert.rejects(readBackgroundSnapshot(Array(257).fill(7),{read,now:()=>0,hz:250,epoch:'fake-boot'}),/cap/);
});
test('worker-thread activity cannot be presented as whole-process context switches',async()=>{
 const before=await readBackgroundSnapshot([7],{read:async p=>p.endsWith('/stat')?stat():status,now:()=>0,hz:250,epoch:'fake-boot'});
 const after=structuredClone(before);after.atMs=1000;after.startMs=1000;after.processes[0].cpuTicks='270';
 const r=backgroundDelta(before,after);assert.equal(r.cpuSeconds,1);assert.equal(r.contextSwitches,0);assert.equal(r.contextSwitchScope,'thread-leader-only');assert.equal(r.cpuScope,'thread-group');assert.match(r.coverage,/worker-thread context switches unobserved/);
});

test('background deltas reject resets, reused PID, nonmonotonic clocks and changed membership',async()=>{
 const before=await readBackgroundSnapshot([7],{read:async p=>p.endsWith('/stat')?stat():status,now:()=>0,hz:250,epoch:'fake-boot'});
 const after=structuredClone(before);after.atMs=1000;after.startMs=1000;after.processes[0].cpuTicks='45';after.processes[0].voluntary='15';
 const d=backgroundDelta(before,after);assert.equal(d.status,'supported');assert.equal(d.cpuSeconds,0.1);assert.equal(d.cpuPctOneCore,10);assert.equal(d.contextSwitches,5);assert.equal(d.unseenBirthDeathGap,true);assert.equal(d.powerW,undefined);
 for(const change of [r=>r.processes[0].startTicks='200',r=>r.processes[0].cpuTicks='1',r=>r.processes[0].voluntary='1',r=>r.processes=[],r=>r.hz=100,r=>r.epoch='other-boot',r=>r.source='other-source',r=>r.startMs=-1,r=>delete r.processes[0].startTicks]){const r=structuredClone(after);change(r);assert.equal(backgroundDelta(before,r).status,'incomplete');}
 assert.equal(backgroundDelta(before,before).status,'failed');
 assert.equal((await readBackgroundSnapshot([7],{platform:'android'})).status,'unsupported');
});
