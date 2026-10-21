// Fake dependencies/CDP/children only. No sensors, compositor, browser or app.
import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {parseArgs,main,gpuFixtureOptions,prepareGpuFixture,gpuPreflight,traceWindow,startVirtualCompositor,acquireGpuCompositor} from '../gpu-cost.mjs';
const args=['--checkout','/isolated/app','--app-dir','/isolated/app/desktop/release/linux-unpacked','--out',process.cwd()+'/scratch/perf-lab/gpu/fake.json'];
test('strict GPU defaults one cheap welcome cell and rejects invalid options/configs without IO',()=>{
 const o=parseArgs(args);assert.equal(o.suite,'themes');assert.deepEqual(o.scenes,['welcome']);assert.deepEqual(o.cells,['midnight']);assert.equal(o.repeats,1);
 for(const extra of [['--suite','probe'],['--scene','oops'],['--seconds','NaN'],['--seconds','0'],['--seconds','Infinity'],['--repeats','4'],['--cells','a,b,c,d,e'],['--seconds=1'],['stray'],['--keep-compositor'],['--scene','welcome,welcome']])assert.throws(()=>parseArgs([...args,...extra]));
 let actual;prepareGpuFixture(o,'/private/fake',{build:(_root,options)=>{actual=options;return {};}});assert.equal(actual.seedEngine,false);assert.equal(actual.fakeProvider,false);assert.equal(actual.historySizes.small,12);assert.equal(actual.decoyCount,0);
 prepareGpuFixture({...o,scenes:['chat']},'/private/fake',{build:(_root,options)=>{actual=options;return {};}});assert.equal(actual.seedEngine,false);assert.equal(actual.fakeProvider,true);
 assert.deepEqual(gpuFixtureOptions({scenes:['welcome']}),{seedEngine:false,historySizes:{small:12},decoyCount:0,fakeProvider:false});assert.equal(gpuFixtureOptions({scenes:['chat']}).fakeProvider,true);
});
test('check uses cachedOnly and dependency which only; normal runtime BLOCKED before sensors/launch',async()=>{
 const calls=[];const deps={isolation:async()=>({kind:'git-worktree'}),cached:async(checkout,options)=>{calls.push(options);return {binary:args[3]+'/youcoded',appDir:args[3],sha:'a'};},which:async name=>name==='kwin_wayland'?null:'/bin/'+name};
 const r=await gpuPreflight(parseArgs([...args,'--check']),deps);assert.equal(calls[0].cachedOnly,true);assert.equal(r.runtime.status,'unsupported');assert.equal(r.dependencies.find(d=>d.name==='kwin_wayland').status,'unsupported');assert.equal(r.hardware.status,'unverified');
 const checked=await main([...args,'--check'],{preflight:async()=>r});assert.equal(checked.status,'checked-not-runtime-validated');
 await assert.rejects(gpuPreflight(parseArgs(args),{...deps,cached:async()=>{throw Error('cached-only refused stale');}}),/stale/);
 await assert.rejects(gpuPreflight(parseArgs(args),{...deps,cached:async()=>({appDir:'/preserved/copy'})}),/differs/);
 await assert.rejects(startVirtualCompositor(),/supervisor/);
 const blocked=await main(args,{preflight:async()=>{throw Error('runtime must not even preflight');}});assert.equal(blocked.status,'unsupported');assert.match(blocked.reason,/supervisor/);
});
function cdp(){const c=new EventEmitter();c.sent=[];c.send=async method=>{c.sent.push(method);if(method==='Tracing.end')c.emit('Tracing.tracingComplete',{dataLossOccurred:false});return {};};c.close=()=>{c.closed=true;};return c;}
test('actual trace handler caps emitted events, completes/ends/cleans fake CDP',async()=>{
 const c=cdp();const r=await traceWindow({cdpPort:7},{seconds:1,_deps:{connect:async()=>c,wait:async()=>{c.emit('Tracing.dataCollected',{value:[{name:'x',ts:1},{name:'y',ts:2}]});}}});assert.equal(r.eventCount,2);assert.equal(r.status,'incomplete');assert.match(r.reason,/usable frame/);assert.equal(c.closed,true);assert.ok(c.sent.includes('Tracing.end'));
 const too=cdp();await assert.rejects(traceWindow({cdpPort:7},{seconds:1,maxEvents:1,_deps:{connect:async()=>too,wait:async()=>too.emit('Tracing.dataCollected',{value:[{name:'a'},{name:'b'}]})}}),/cap/);assert.equal(too.closed,true);
 const bytes=cdp();await assert.rejects(traceWindow({cdpPort:7},{seconds:1,maxBytes:1,_deps:{connect:async()=>bytes,wait:async()=>bytes.emit('Tracing.dataCollected',{value:[{name:'x'}]})}}),/cap/);assert.equal(bytes.closed,true);
 const invalid=cdp();await assert.rejects(traceWindow({cdpPort:7},{seconds:1,_deps:{connect:async()=>invalid,wait:async()=>invalid.emit('Tracing.dataCollected',{value:[{name:'x'.repeat(513)}]})}}),/cap/);assert.equal(invalid.closed,true);
 let startTimer=0;const startHung=cdp();startHung.send=async method=>{startHung.sent.push(method);if(method==='Tracing.start')return new Promise(()=>{});return {};};await assert.rejects(traceWindow({cdpPort:7},{seconds:1,_deps:{connect:async()=>startHung,wait:async()=>{},setTimer:fn=>{if(++startTimer>1)queueMicrotask(fn);return 1;},clearTimer:()=>{}}}),/timeout/);assert.ok(startHung.sent.includes('Tracing.end'));assert.equal(startHung.closed,true);
 let completionTimer=0;const missing=cdp();missing.send=async()=>({});await assert.rejects(traceWindow({cdpPort:7},{seconds:1,_deps:{connect:async()=>missing,wait:async()=>{},setTimer:fn=>{if(++completionTimer===4)queueMicrotask(fn);return 1;},clearTimer:()=>{}}}),/timeout/);assert.equal(missing.closed,true);
});
test('trace projection retains parser-required pipeline and local identity, refuses data loss',async()=>{
 const c=cdp();const result=await traceWindow({cdpPort:7},{seconds:1,_deps:{connect:async()=>c,wait:async()=>c.emit('Tracing.dataCollected',{value:[{name:'PipelineReporter',ph:'b',ts:1,args:{frame_reporter:{state:'STATE_DROPPED'}}},{name:'SubmitCompositorFrameToPresentationCompositorFrame',ph:'b',ts:1,pid:1,id2:{local:'x'}},{name:'SubmitCompositorFrameToPresentationCompositorFrame',ph:'e',ts:1001,pid:1,id2:{local:'x'}}]})}});assert.equal(result.pipeline.dropped,1);assert.equal(result.presentLatencyMs.median,1);
 const loss=cdp();loss.send=async method=>{if(method==='Tracing.end')loss.emit('Tracing.tracingComplete',{dataLossOccurred:true});return {};};await assert.rejects(traceWindow({cdpPort:7},{seconds:1,_deps:{connect:async()=>loss,wait:async()=>{}}}),/data loss/);assert.equal(loss.closed,true);
});

test('trace empty/relevant draws, acquisition deadlines/late close and cleanup errors are explicit',async()=>{
 const empty=cdp();const e=await traceWindow({cdpPort:7},{seconds:1,_deps:{connect:async()=>empty,wait:async()=>{}}});assert.equal(e.status,'incomplete');assert.equal(e.compositorFps,null);
 const draws=cdp();const r=await traceWindow({cdpPort:7},{seconds:2,_deps:{connect:async()=>draws,wait:async()=>draws.emit('Tracing.dataCollected',{value:[0,20000,40000].map(ts=>({name:'Display::DrawAndSwap',ph:'X',ts,dur:1000}))})}});assert.equal(r.status,'measured');assert.equal(r.compositorFps,50);assert.equal(r.frameIntervalMs.median,20);assert.equal(r.drawAndSwapMs.max,1);assert.equal(r.traceDurationSeconds,2);
 let resolveConnection;const timers=[];const late=cdp();const p=traceWindow({cdpPort:7},{seconds:1,_deps:{connect:()=>new Promise(r=>resolveConnection=r),setTimer:fn=>{timers.push(fn);return fn;},clearTimer:()=>{}}});await Promise.resolve();timers[0]();await assert.rejects(p,/acquisition timeout/);resolveConnection(late);await Promise.resolve();await Promise.resolve();assert.equal(late.closed,true);
 const forever=traceWindow({cdpPort:7},{seconds:1,_deps:{connect:()=>new Promise(()=>{}),setTimer:fn=>{queueMicrotask(fn);return 1;},clearTimer:()=>{}}});await assert.rejects(forever,/acquisition timeout/);
 const broken=cdp();broken.send=async method=>{if(method==='Tracing.start')throw Error('primary-start-error');if(method==='Tracing.end')throw Error('cleanup-end-error');return {};};await assert.rejects(traceWindow({cdpPort:7},{seconds:1,_deps:{connect:async()=>broken}}),error=>{assert.match(error.message,/primary-start-error/);assert.ok(error.cleanupErrors.some(e=>e.includes('cleanup-end-error')));return true;});assert.equal(broken.closed,true);
});

test('compositor acquisition failure retains/stops immediate own handle but refuses descendant certification',async()=>{
 let stopped=0;const handle={proc:{pid:10},stop:async()=>{stopped++;return {exitObserved:true,descendantsVerified:false};}};
 await assert.rejects(acquireGpuCompositor({start:async()=>handle,inspect:async()=>{throw Error('wayland-info failed');}}),e=>{assert.equal(e.cleanup.descendantsVerified,false);return /wayland-info failed/.test(e.message);});assert.equal(stopped,1);
});
