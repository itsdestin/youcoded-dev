import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startMixedCpuProfile, assessCpuProfile, stopCpuProbe} from '../mixed-cpu-profile.mjs';
test('stopping drains queued tail records and preserves explicitly marked phase end',()=>{
 let disconnected=false;
 const p={tasks:[],overflow:0,startMs:10,endMs:20,record(entries){this.tasks.push(...entries.map(e=>({start:e.startTime,duration:e.duration})));},observer:{takeRecords:()=>[{startTime:18,duration:65}],disconnect:()=>{disconnected=true;}}};
 const win={__mixedCpuProbe:p};
 const r=stopCpuProbe(win,{now:()=>90,timeOrigin:1000},{hasFocus:()=>true,visibilityState:'visible'});
 assert.deepEqual(r.tasks,[{start:18,duration:65}]);assert.equal(r.phase.startMs,10);assert.equal(r.phase.endMs,20);
 assert.equal(disconnected,true);assert.equal(win.__mixedCpuProbe,undefined);
});
import {parseOptions} from '../mixed-activity.mjs';
test('CPU diagnostics are explicit and cannot overlap verbose protocol logging',()=>{
 const args=['--checkout','/private/app','--app-dir','/private/package','--out','/private/root/scratch/perf-lab/run.json','--real-display',':0'];
 assert.equal(parseOptions([...args,'--cpu-profile','on'],'/private/root').cpuProfile,'on');
 assert.equal(parseOptions(args,'/private/root').cpuProfile,'off');
 assert.throws(()=>parseOptions([...args,'--cpu-profile','bad'],'/private/root'),/cpu-profile/);
 const native=[...args.slice(0,-2),'--wayland-socket','/run/user/1000/wayland-0'];
 assert.throws(()=>parseOptions([...native,'--cpu-profile','on'],'/private/root'),/protocol/);
 assert.equal(parseOptions([...native,'--cpu-profile','on','--protocol-debug','off'],'/private/root').cpuProfile,'on');
});

test('CPU profile evidence refuses empty, incomplete and unaligned sample arrays',()=>{
  const p={nodes:[{id:1}],samples:[1,1],timeDeltas:[10,10],startTime:100,endTime:120};
  assert.equal(assessCpuProfile(p).ok,true);
  for(const bad of [{...p,samples:[]},{...p,timeDeltas:[10]},{...p,endTime:100},{...p,nodes:[]}])assert.equal(assessCpuProfile(bad).ok,false);
});
test('diagnostic captures renderer task windows, stops once and labels samples non-baseline',async()=>{
  const calls=[];const profile={nodes:[{id:1}],samples:[1],timeDeltas:[10],startTime:100,endTime:110};
  const cdp={send:async(method)=>{calls.push(method);return method==='Profiler.stop'?{profile}:{};},evaluate:async(code)=>{calls.push(code);return {nowMs:12,timeOrigin:1000,phase:{startMs:1,endMs:12},tasks:[{start:1,duration:60}],overflow:0,focus:true,visibility:'visible'};}};
  const handle=await startMixedCpuProfile(cdp,p=>p);
  const result=await handle.stop();
  assert.equal(result.profile,profile);assert.equal(result.ok,true);
  assert.equal(result.renderer.tasks[0].duration,60);
  assert.match(result.scope,/diagnostic/);
  assert.equal(await handle.stop(),result);
  assert.equal(calls.filter(x=>x==='Profiler.stop').length,1);
  assert.equal(calls.filter(x=>x==='Profiler.disable').length,1);
});
test('profiler-start failure cleans up its observer and disables profiler',async()=>{
  const calls=[];
  const cdp={send:async m=>{calls.push(m);if(m==='Profiler.start')throw Error('start failed');return{};},evaluate:async code=>{calls.push(code);return{};}};
  await assert.rejects(()=>startMixedCpuProfile(cdp,p=>p),/start failed/);
  assert.ok(calls.includes('Profiler.disable'));
  assert.ok(calls.some(x=>x.includes('disconnect')));
});
