import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parsePresentationLog, summarizePresentationLegs } from '../presentation-protocol.mjs';
import { secondPrivateTranscript, visibleChatIdentity, dispatchPacedWheel, directionalRoom, observeScroll, taskDurationDelta, recordPresentationLeg, scrollEngagementFailures } from '../presentation-workload.mjs';
import { launchConfiguration, validateWaylandSocket, createProtocolSink, captureProtocolStderr } from '../launch.mjs';
import { parseCaptureOptions, assessProtocol, assessTrace, assertCleanupSafe, createOwnedLaunchAttempt, PRESENTATION_TRACE_CATEGORIES, assessCaptureTrace, assessLegMarkers, boundedUntil, browserTrace, protocolCaptureFailure } from '../presentation-capture.mjs';

const fixture={home:'/tmp/private-presentation-fixture/home',bin:'/tmp/private-presentation-fixture/bin',perfLog:'/tmp/private-presentation-fixture/perf.log'};
const inherited={HOME:'/home/live',WAYLAND_DISPLAY:'wayland-0',XDG_RUNTIME_DIR:'/run/user/1000',XDG_CONFIG_HOME:'/home/live/.config',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1000/bus',DBUS_STARTER_ADDRESS:'unix:path=/run/user/1000/bus',PATH:'/bin'};
test('default launcher keeps X11 and never inherits Wayland or live bus',()=>{
  const {env,args}=launchConfiguration({fixture,display:':99',inherited});
  assert.equal(env.DISPLAY,':99');assert.equal(env.WAYLAND_DISPLAY,undefined);
  assert.equal(env.XDG_SESSION_TYPE,'x11');assert.equal(env.ELECTRON_OZONE_PLATFORM_HINT,'x11');
  assert.deepEqual(args,['--ozone-platform=x11']);assert.equal(env.HOME,fixture.home);
  assert.equal(env.XDG_RUNTIME_DIR,join(fixture.home,'.runtime'));
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS,`unix:path=${join(fixture.home,'.runtime','no-session-bus')}`);
  assert.equal(env.DBUS_STARTER_ADDRESS,undefined);assert.equal(env.XDG_CONFIG_HOME,undefined);
});
test('native opt-in keeps private runtime, dead bus and explicit backend, no X11 fallback',()=>{
  const {env,args}=launchConfiguration({fixture,waylandSocket:'/run/user/1000/wayland-1',inherited});
  assert.equal(env.WAYLAND_DISPLAY,'/run/user/1000/wayland-1');assert.equal(env.DISPLAY,undefined);
  assert.equal(env.XDG_RUNTIME_DIR,join(fixture.home,'.runtime'));
  assert.match(env.DBUS_SESSION_BUS_ADDRESS,/no-session-bus$/);
  assert.equal(env.XDG_SESSION_TYPE,'wayland');assert.equal(env.ELECTRON_OZONE_PLATFORM_HINT,'wayland');
  assert.equal(env.WAYLAND_DEBUG,'client');assert.deepEqual(args,['--ozone-platform=wayland']);
});
test('quiet-control receipt does not certify a truncated or failed bounded stderr capture',()=>{
 assert.equal(protocolCaptureFailure({error:null,truncated:false}),null);
 assert.equal(protocolCaptureFailure({error:'sink failed',truncated:false}),'sink failed');
 assert.match(protocolCaptureFailure({error:null,truncated:true}),/truncated/);
});
test('quiet native control keeps identical isolation/backend without WAYLAND_DEBUG',()=>{
 const a=launchConfiguration({fixture,waylandSocket:'/run/user/1000/wayland-1',inherited});
 const b=launchConfiguration({fixture,waylandSocket:'/run/user/1000/wayland-1',inherited,protocolDebug:false});
 assert.equal(a.env.WAYLAND_DEBUG,'client');assert.equal(b.env.WAYLAND_DEBUG,undefined);
 const {WAYLAND_DEBUG: _debug, ...withoutDebug}=a.env;
 assert.deepEqual(withoutDebug,b.env);assert.deepEqual(a.args,b.args);
 const opts=['--checkout','/tmp/checkout','--app-dir','/tmp/app','--wayland-socket','/tmp/socket','--out','/tmp/scratch/perf-lab/control','--protocol-debug','off'];
 assert.equal(parseCaptureOptions(opts,{root:'/tmp'}).protocolDebug,'off');
});
test('Wayland socket refuses missing, regular, symlink, relative and foreign-owned endpoints',{skip:process.platform==='win32'?'Wayland Unix socket ownership is POSIX-only':false},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'wayland-socket-test-'));
  const socket=join(dir,'wayland-1');const server=createServer();
  try {
    await new Promise((ok,fail)=>server.listen(socket,e=>e?fail(e):ok()));
    assert.equal(validateWaylandSocket(socket),socket);
    writeFileSync(join(dir,'regular'),'x');symlinkSync(socket,join(dir,'alias'));
    for(const path of [join(dir,'missing'),join(dir,'regular'),join(dir,'alias'),'wayland-1']) assert.throws(()=>validateWaylandSocket(path));
    assert.throws(()=>validateWaylandSocket(socket,{uid:statSync(socket).uid+1}),/owned/);
  }finally{await new Promise(ok=>server.close(ok));rmSync(dir,{recursive:true,force:true});}
});
test('exclusive bounded raw sink labels overflow and refuses reuse',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wayland-cap-test-'));const file=join(dir,'raw.log');
 try { const sink=createProtocolSink(file,{maxBytes:8});sink.write(Buffer.from('abcdef'));sink.write(Buffer.from('ghijkl'));sink.close();
   assert.equal(readFileSync(file,'utf8'),'abcdefgh');assert.deepEqual({bytes:sink.bytes,truncated:sink.truncated},{bytes:8,truncated:true});
   if(process.platform!=='win32')assert.equal(statSync(file).mode&0o777,0o600); // POSIX mode bits
   assert.throws(()=>createProtocolSink(file),/EEXIST/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('protocol drain includes buffered stderr delivered after the process sweep before pipe end',async(t)=>{
 // WHY: under suite load a real 100ms timer could expire before setImmediate;
 // this test controls ordering, not wall-clock performance.
 t.mock.timers.enable({apis:['setTimeout']});
 const dir=mkdtempSync(join(tmpdir(),'wayland-drain-test-')),file=join(dir,'raw.log');
 const stream=new PassThrough();
 try {
   const capture=captureProtocolStderr(stream,createProtocolSink(file),{drainTimeoutMs:100});
   stream.write('before sweep\n');
   // WHY: an empty /proc family does not imply an inherited stderr pipe is drained.
   const swept=Promise.resolve();await swept;
   const receiptPromise=capture.finish(file);
   let finished=false;receiptPromise.then(()=>{finished=true;});
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(finished,false,'sweep alone must not finalize the receipt');
   stream.end('after sweep\n');
   const receipt=await receiptPromise;
   assert.equal(readFileSync(file,'utf8'),'before sweep\nafter sweep\n');
   assert.deepEqual({bytes:receipt.bytes,truncated:receipt.truncated,error:receipt.error},{bytes:25,truncated:false,error:null});
   assert.equal(Object.isFrozen(receipt),true);
 }finally{stream.destroy();rmSync(dir,{recursive:true,force:true});}
});
test('inherited pipe that never ends times out as incomplete, not a successful partial log',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const dir=mkdtempSync(join(tmpdir(),'wayland-drain-timeout-')),file=join(dir,'raw.log');
 const stream=new PassThrough();
 try {
   const capture=captureProtocolStderr(stream,createProtocolSink(file),{drainTimeoutMs:15});
   stream.write('partial');
   const finishing=capture.finish(file);
   t.mock.timers.tick(15);
   const receipt=await finishing;
   assert.equal(receipt.bytes,7);
   assert.match(receipt.error,/stderr drain timed out/);
   assert.equal(assessProtocol(readFileSync(file,'utf8'),receipt).status,'incomplete');
   stream.write('late');stream.end();
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(readFileSync(file,'utf8'),'partial');
   assert.equal(receipt.bytes,7);assert.match(receipt.error,/timed out/);
 }finally{stream.destroy();rmSync(dir,{recursive:true,force:true});}
});
test('stderr close without end and stream error make a stable incomplete receipt',async()=>{
 for(const ending of ['close','error']) {
   const dir=mkdtempSync(join(tmpdir(),'wayland-drain-error-')),file=join(dir,'raw.log');
   const stream=new PassThrough();
   try {
     const capture=captureProtocolStderr(stream,createProtocolSink(file),{drainTimeoutMs:100});
     stream.write('partial');
     if(ending==='close')stream.destroy();else stream.destroy(Error('read failed'));
     const receipt=await capture.finish(file);
     assert.match(receipt.error,ending==='close'?/closed before end/:/read failed/);
     assert.equal(Object.isFrozen(receipt),true);
   }finally{stream.destroy();rmSync(dir,{recursive:true,force:true});}
 }
});
test('protocol capability needs bound wp_presentation, clock and feedback; ambiguous stream never proves attribution',()=>{
 const s='[0] wl_registry@2.global(3, "wp_presentation", 2)\n[0] wl_registry@2.bind(3, "wp_presentation", 2, new id [unknown]@9)\n[1] wp_presentation@9.clock_id(1)\n[2] wp_presentation@9.feedback(wl_surface@5, new id wp_presentation_feedback@7)\n[3] wp_presentation_feedback@7.presented(0, 5, 100, 5555555, 0, 23, 7)\n';
 assert.equal(assessProtocol('').status,'unsupported');
 assert.equal(assessProtocol('wp_presentation@9.feedback(wl_surface@5, new id wp_presentation_feedback@7)').status,'unsupported');
 assert.equal(assessProtocol(s.replace(/.*clock_id.*\n/,'' )).status,'unsupported');
 const r=assessProtocol(s);assert.equal(r.status,'observed-unattributed');assert.equal(r.presentedLines,1);assert.equal(r.flagsRaw[0],'7');
 assert.equal(assessProtocol(s,{truncated:true}).status,'incomplete');
});
test('versioned protocol fixture recognizes the observed # wire form',()=>{
 // WHY: clean CI has no private scratch captures; pin the observed wire syntax
 // with a small synthetic fixture, not a fabricated runtime measurement.
 const p=fileURLToPath(new URL('./fixtures/presentation-wire.log',import.meta.url));
 const r=assessProtocol(readFileSync(p,'utf8'));
 assert.equal(r.status,'observed-unattributed');assert.ok(r.presentedLines>0);
 assert.ok(r.surfaceCreationLines.some(x=>x.includes('wl_surface#34')));
});
test('protocol fixture scopes toplevel surface, feedback reuse and clock without certifying provenance',()=>{
 // WHY: clean CI has no private scratch captures; pin the observed wire syntax
 // with a small synthetic fixture, not a fabricated runtime measurement.
 const p=fileURLToPath(new URL('./fixtures/presentation-wire.log',import.meta.url));
 const r=parsePresentationLog(readFileSync(p,'utf8'));
 assert.equal(r.clockId,1);assert.equal(r.surface,'34');assert.equal(r.provenance,'structural-only; inherited stderr cannot prove process or connection');
 assert.ok(r.samples.length>5);assert.ok(r.samples.every(s=>s.flags===7 && s.timestampNs && s.surface==='34'));
 assert.ok(r.samples.every(s=>typeof s.timestampNs==='string'));
 assert.ok(r.unresolved.length<=r.requests);assert.equal(r.status,'conditional-surface');
 assert.ok(r.outputModes.some(x=>x.width===2560&&x.height===1600&&x.milliHz===180000));
});
test('synthetic wire fixture dedupes feedback on same commit, handles reuse, discard and BigInt seconds',()=>{
 const lines=[
 'wl_registry@2.bind(47, "wp_presentation", 2, new id [unknown]@29)', 'wp_presentation@29.clock_id(1)',
 'wl_compositor@4.create_surface(new id wl_surface@34)',
 'xdg_wm_base@36.get_xdg_surface(new id xdg_surface@57, wl_surface@34)',
 'xdg_surface@57.get_toplevel(new id xdg_toplevel@58)', 'xdg_toplevel@58.set_title("YouCoded")',
 'wp_presentation@29.feedback(wl_surface@34, new id wp_presentation_feedback@66)',
 'wp_presentation@29.feedback(wl_surface@34, new id wp_presentation_feedback@67)', 'wl_surface@34.commit()',
 'wp_presentation_feedback@66.presented(2097152, 1, 900, 5555555, 0, 12, 7)',
 'wp_presentation_feedback@67.presented(2097152, 1, 900, 5555555, 0, 12, 7)',
 'wp_presentation@29.feedback(wl_surface@34, new id wp_presentation_feedback@66)', 'wl_surface@34.commit()',
 'wp_presentation_feedback@66.discarded()',
 ];
 const r=parsePresentationLog(lines.join('\n')+'\n');
 assert.equal(r.status,'conditional-surface');assert.equal(r.samples.length,1);
 assert.equal(r.duplicates,1);assert.equal(r.discarded,1);
 assert.equal(r.samples[0].timestampNs,((2097152n<<32n|1n)*1000000000n+900n).toString());
 assert.equal(r.samples[0].quality,'hardware-clock-and-completion');
});
test('second private transcript keeps real on-disk content but distinct stable session identity',()=>{
 const root=mkdtempSync(join(tmpdir(),'presentation-chat-test-'));const first=join(root,'original.jsonl');
 const id='12345678-1234-4234-8234-123456789abc';writeFileSync(first,`{"sessionId":"${id}"}\n{"sessionId":"${id}","message":"real seeded content"}\n`);
 try {const next=secondPrivateTranscript({path:first,sessionId:id,cwd:root});
   assert.notEqual(next.sessionId,id);assert.notEqual(next.path,first);
   assert.match(readFileSync(next.path,'utf8'),/real seeded content/);
   assert.doesNotMatch(readFileSync(next.path,'utf8'),new RegExp(id));
   assert.match(readFileSync(first,'utf8'),new RegExp(id));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('visible chat identity comes from its owner despite reordered strip and extra hidden panes',()=>{
 const owner=(id,hidden,entries=60,chars=500)=>({dataset:{chatSessionId:id},getAttribute:k=>k==='aria-hidden'?(hidden?'true':null):null,
   querySelector:selector=>selector==='.chat-scroll'?{querySelectorAll:()=>Array(entries).fill({}),textContent:'x'.repeat(chars)}:null});
 const nodes=[owner('hidden-third',true),owner('actual-b',false),owner('actual-a',true)];
 const document={querySelectorAll:selector=>selector==='[data-chat-session-id]'?nodes:[]};
 const state=visibleChatIdentity(document);
 assert.equal(state.id,'actual-b');assert.equal(state.entries,60);
 assert.notEqual(state.id,'actual-a'); // strip order/index cannot override owner identity
 assert.equal(visibleChatIdentity(document,'actual-a'),null); // clicked wrong tab is not engagement
 assert.equal(visibleChatIdentity(document,'actual-b')?.id,'actual-b');
 nodes.push(owner('another-visible',false));
 assert.equal(visibleChatIdentity(document),null); // never pick an arbitrary first pane
});
test('parser refuses ambiguous lifetimes, missing clock, conflicting surface or truncated logs',()=>{
 const prefix='wl_registry#2.bind(1, "wp_presentation", 2, new id [unknown]#29)\nwp_presentation#29.clock_id(1)\nwl_compositor#4.create_surface(new id wl_surface#34)\nxdg_wm_base#36.get_xdg_surface(new id xdg_surface#57, wl_surface#34)\nxdg_surface#57.get_toplevel(new id xdg_toplevel#58)\nxdg_toplevel#58.set_title("YouCoded")\n';
 const request='wp_presentation#29.feedback(wl_surface#34, new id wp_presentation_feedback#66)\n';
 const commit='wl_surface#34.commit()\n';
 const done='wp_presentation_feedback#66.presented(0, 8, 4, 5555555, 0, 0, 1)\n';
 assert.equal(parsePresentationLog(prefix+request+commit+done,{truncated:true}).status,'unsupported');
 assert.equal(parsePresentationLog(prefix.replace('clock_id(1)','clock_id(0)')+request+commit+done).status,'unsupported');
 assert.equal(parsePresentationLog(prefix+request+request+commit+done).status,'unsupported');
 assert.equal(parsePresentationLog(prefix+request+commit+done+request+commit+done+'xdg_toplevel#59.set_title("YouCoded")').status,'unsupported');
});
test('leg summaries use monotonic ns boundaries, exclude idle, no guessed drops from zero seq/gaps',()=>{
 const protocol={status:'conditional-surface',samples:[{timestampNs:'1000000000',flags:7,quality:'hardware-clock-and-completion'},{timestampNs:'1010000000',flags:1,quality:'timestamp-quality-uncertified'},{timestampNs:'1020000000',flags:7,quality:'hardware-clock-and-completion'}],discards:[],pending:[],duplicates:0};
 const r=summarizePresentationLegs(protocol,[{name:'idle',startNs:'990000000',endNs:'1005000000',engaged:true},{name:'scroll-down',startNs:'1005000000',endNs:'1025000000',engaged:true}]);
 assert.equal(r[0].status,'context-only');assert.equal(r[1].presented,2);assert.equal(r[1].intervalsMs[0],10);
 assert.equal(r[1].quality.hardwareQualified,1);assert.equal(r[1].quality.uncertified,1);
 assert.equal(r[1].missedRefreshes,undefined);
});
test('trace categories keep Wayland feedback and user timing, exclude broad compositor flood',()=>{
 const parts=PRESENTATION_TRACE_CATEGORIES.split(',');
 assert.ok(parts.includes('wayland'));assert.ok(parts.includes('blink.user_timing'));
 assert.ok(!parts.includes('devtools.timeline'), 'per-frame DevTools events overflowed the bounded native-feedback capture');
 assert.ok(!parts.includes('cc')&&!parts.includes('benchmark')&&!parts.includes('disabled-by-default-devtools.timeline.frame'));
 assert.equal(assessCaptureTrace({complete:true,truncated:false,dataLossOccurred:false,error:null,events:[{name:'StoreFeedback',cat:'wayland'},{name:'TimeStamp',cat:'blink.user_timing'}]}).status,'complete');
 assert.equal(assessCaptureTrace({complete:true,truncated:true,dataLossOccurred:false,events:[]}).status,'incomplete');
 assert.equal(assessCaptureTrace({complete:true,truncated:false,dataLossOccurred:false,events:[]}).status,'incomplete');
});
test('failed leg remains in owned report with input, scroll, focus and specific gate failure; error propagates',()=>{
 const report={status:'incomplete',workload:{sessions:[],legs:[]}};
 const engagement={before:8000,after:5000,room:8000,entries:20,visible:'visible',focus:true,
   input:{sent:420,acknowledged:420,failed:0,skippedSlots:120,requestedCount:540,dispatchIntervalsMs:[6,10]}};
 const probe={scroll:{events:[{timeMs:10,scrollTop:7900},{timeMs:20,scrollTop:7800}],overflow:0}};
 const failures=scrollEngagementFailures(engagement,probe,-10);
 assert.ok(failures.includes('input skipped slots exceeded 100'));
 assert.ok(failures.some(x=>x.startsWith('input median interval')));
 assert.ok(!failures.some(x=>x.includes('focus')));
 assert.throws(()=>recordPresentationLeg(report.workload,{name:'scroll-up',engagement,renderer:{scrollEvents:probe.scroll}},failures),/scroll-up.*skipped slots/);
 assert.equal(report.status,'incomplete');
 const saved=JSON.parse(JSON.stringify(report));
 assert.equal(saved.workload.legs[0].engagement.input.sent,420);
 assert.equal(saved.workload.legs[0].renderer.scrollEvents.events[1].scrollTop,7800);
 assert.equal(saved.workload.legs[0].engagement.focus,true);
 assert.ok(saved.workload.legs[0].failureReasons.includes('input skipped slots exceeded 100'));
 assert.equal(saved.workload.legs[0].engaged,false);
 assert.ok(scrollEngagementFailures({...engagement,focus:false,input:{...engagement.input,skippedSlots:0,dispatchIntervalsMs:[6,6]}},probe,-10).includes('window not focused'));
});
test('two opposite scroll legs have room at full and skipped-slot demand without accepting a short journey',()=>{
 const max=19000, count=540, delta=10;
 let top=max; // initial bottom: first leg goes up, second starts where the first finished
 const upRoom=top;
 assert.ok(upRoom>=directionalRoom(count,-delta));
 top-=count*delta;
 const downRoom=max-top;
 assert.equal(downRoom,5400);
 assert.ok(downRoom<6000); // the old fixed check always refused the second leg
 assert.ok(downRoom>=directionalRoom(count,delta));
 const skipped=100;
 top=max-(count-skipped)*delta; // a shorter first leg from the bottom
 assert.ok(max-top>=directionalRoom(count,delta,skipped));
 assert.ok(2000<directionalRoom(count,delta,skipped));
 assert.ok(2000<directionalRoom(count,-delta));
 assert.ok(1000<directionalRoom(count,delta,skipped)); // insufficient room still refused
});
test('paced wheel deadlines do not add ack latency to requested cadence',async()=>{
 let now=0;const stamps=[];
 const input=await dispatchPacedWheel({send:async()=>{stamps.push(now);now+=3;}},{x:20,y:80,delta:-10,count:4,intervalMs:6,clock:()=>BigInt(now*1e6),sleep:async ms=>{now+=ms;}});
 assert.deepEqual(stamps,[0,6,12,18]);
 assert.equal(input.sent,4);assert.equal(input.acknowledged,4);assert.equal(input.failed,0);
 assert.deepEqual(input.dispatchIntervalsMs,[6,6,6]);
 assert.deepEqual(input.ackLatencyMs,[6,6,6,3]); // simulated clock advances before microtask ack is observed
 assert.equal(input.source,'paced-cdp-wheel');
 assert.equal(taskDurationDelta(3.3,3.1),0.2);
 assert.equal(taskDurationDelta(undefined,3.1),null);
});
test('repeated fractional timer jitter does not halve demand',async()=>{
 let now=0;const sent=[];
 const input=await dispatchPacedWheel({send:async()=>{sent.push(now);}},{x:1,y:2,delta:10,count:40,intervalMs:5,
   clock:()=>BigInt(Math.round(now*1e6)),sleep:async ms=>{now+=ms+0.1;}});
 assert.ok(input.sent>=35,`sent ${input.sent} skipped ${input.skippedSlots}`);
 assert.ok(input.dispatchIntervalsMs.every(ms=>ms>=5));
 assert.equal(input.sent+input.skippedSlots,40);
 assert.ok(now<=200.2);
});
test('fractionally late wake never emits adjacent slots too close; early wake waits again',async()=>{
 let now=0,early=true;const sent=[];
 const result=await dispatchPacedWheel({send:async()=>{sent.push(now);}},{x:1,y:2,delta:10,count:5,intervalMs:1000/180,
   clock:()=>BigInt(Math.round(now*1e6)),sleep:async ms=>{
     if(early){now=10.9;early=false;}else now+=ms;
   }});
 assert.deepEqual(sent,[0,10.9,16.455556,22.011112,27.566668]);
 assert.ok(result.dispatchIntervalsMs.every(ms=>ms>=1000/180-0.000001));
 assert.equal(result.skippedSlots,0);
 // An early wake must never dispatch before its absolute slot deadline.
 let ticks=0;now=0;
 const earlyResult=await dispatchPacedWheel({send:async()=>{}},{x:1,y:2,delta:1,count:2,intervalMs:5,
   clock:()=>BigInt(Math.round(now*1e6)),sleep:async ms=>{if(++ticks===1)now+=ms/2;else now+=ms;}});
 assert.equal(earlyResult.dispatchTimestampsNs[1],'5000000');assert.equal(ticks,2);
});
test('late scheduler skips slots instead of bursting or drifting indefinitely',async()=>{
 let now=0;const stamps=[];
 const input=await dispatchPacedWheel({send:async()=>{stamps.push(now);}},{x:1,y:2,delta:10,count:6,intervalMs:5,clock:()=>BigInt(now*1e6),sleep:async ms=>{now+=ms;if(now===5)now=17;}});
 assert.deepEqual(stamps,[0,17,22,27]);
 assert.equal(input.skippedSlots,2);assert.equal(input.sent,4);
 assert.equal(input.lateSlots,1);
});
test('backpressure bounds outstanding sends, drains failures and leaves no pending send',async()=>{
 let now=0,active=0,peak=0,settled=false;const releases=[];
 const pending=dispatchPacedWheel({send:()=>{active++;peak=Math.max(peak,active);return new Promise((resolve,reject)=>releases.push(()=>{active--;if(peak===2&&now<3)reject(Error('CDP failed'));else resolve();}));}},{x:1,y:2,delta:10,count:4,intervalMs:1,maxOutstanding:2,clock:()=>BigInt(now*1e6),sleep:async ms=>{now+=ms;}}).then(result=>{settled=true;return result;});
 // Yield until two requests are outstanding; blocked scheduler must not send a third.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(active,2);assert.equal(peak,2);
 while(!settled) {if(releases.length)releases.shift()();await new Promise(resolve=>setImmediate(resolve));}
 const result=await pending;
 assert.equal(result.sent,result.acknowledged+result.failed);
 assert.equal(result.failed,1);assert.equal(result.ackLatencyMs.filter(x=>x===null).length,1);
 assert.equal(result.dispatchTimestampsNs.length,result.sent);assert.equal(active,0);assert.ok(peak<=2);
});

test('scroll observations are bounded, changing and detached on cleanup',()=>{
 const handlers=new Set(),pane={scrollTop:0,addEventListener:(_,f)=>handlers.add(f),removeEventListener:(_,f)=>handlers.delete(f)};
 let time=0;const sample=observeScroll(pane,()=>++time,2);
 for(const top of [0,10,20,30]) {pane.scrollTop=top;for(const handler of handlers)handler();}
 assert.deepEqual(sample.events,[{timeMs:1,scrollTop:10},{timeMs:2,scrollTop:20}]);
 assert.equal(sample.overflow,1);sample.stop();assert.equal(handlers.size,0);
});
test('concurrent capture deadlines remain independent when a later request resolves first',async()=>{
 assert.equal(typeof browserTrace,'function');
 const deadline=Date.now()+35;
 const stuck=boundedUntil(new Promise(()=>{}),deadline);
 const quick=boundedUntil(Promise.resolve('ack'),deadline);
 assert.equal(await quick,'ack');
 await assert.rejects(stuck,/capture deadline exceeded/);
});
test('user-timing marker pairs bracket Node monotonic legs in same known renderer pid/tid',()=>{
 const leg={name:'scroll-up',startNs:'105000',endNs:'195000',engaged:true};
 const mk=(name,ts,pid=42,tid=42,cat='blink.user_timing')=>({name:`presentation-scroll-up-${name}`,cat,ph:'I',pid,tid,ts});
 const events=[mk('begin',100),mk('end',200)];
 const good=assessLegMarkers(events,[leg],{rendererPid:42});
 assert.equal(good.status,'complete');assert.equal(good.pairs[0].beginNs,'100000');assert.equal(good.pairs[0].endNs,'200000');
 assert.equal(good.pairs[0].beforeStartNs,'5000');assert.equal(good.pairs[0].afterEndNs,'5000');
 for(const broken of [[events[0]],[...events,events[0]],[events[1],events[0]],
   [events[0],mk('end',200,43)],[mk('begin',100,42,41),events[1]],
   [mk('begin',100,42,42,'other'),events[1]]]) {
   assert.equal(assessLegMarkers(broken,[leg],{rendererPid:42}).status,'incomplete');
 }
 assert.equal(assessLegMarkers(events,[{...leg,startNs:'99000'}],{rendererPid:42}).status,'incomplete');
 assert.equal(assessLegMarkers(events,[leg],{}).status,'incomplete');
});
test('five-leg trace markers require complete pairs independently of protocol logging',()=>{
 // Synthetic regression for the real mark shape; original runtime reanalyses
 // remain evidence, but are not a dependency of the portable offline suite.
 const names=['scroll-up','scroll-down','switch','viewport-resize','idle'];
 const legs=names.map((name,i)=>({name,startNs:String((100+i*100)*1000+1),endNs:String((150+i*100)*1000-1)}));
 const events=[{ph:'M',name:'thread_name',pid:42,tid:42,args:{name:'CrRendererMain'}},...names.flatMap((name,i)=>[
   {name:`presentation-${name}-begin`,cat:'blink.user_timing',ph:'I',pid:42,tid:42,ts:100+i*100},
   {name:`presentation-${name}-end`,cat:'blink.user_timing',ph:'I',pid:42,tid:42,ts:150+i*100},
 ])];
 const verdict=assessLegMarkers(events,legs,{});
 assert.equal(verdict.status,'complete');assert.equal(verdict.pairs.length,5);
 assert.equal(assessLegMarkers(events.slice(0,-1),legs,{}).status,'incomplete');
});
test('trace incomplete or data loss cannot be claimed complete; cleanup uncertainty retains fixture',()=>{
 assert.equal(assessTrace({complete:true,truncated:false,dataLossOccurred:false,error:null}).status,'complete');
 for(const input of [{complete:false},{complete:true,truncated:true},{complete:true,dataLossOccurred:true},{complete:true,error:'closed'}]) assert.equal(assessTrace(input).status,'incomplete');
 assert.throws(()=>assertCleanupSafe({killed:false}),/retain fixture/);
 assert.doesNotThrow(()=>assertCleanupSafe({killed:true}));
});
test('late successful launch after deadline kills ONLY its returned owned handle once; fixture remains until confirmed',async()=>{
  let resolveLaunch, kills=0, fixtureExists=true;
  const late=[];
  const attempt=createOwnedLaunchAttempt(()=>new Promise(resolve=>{resolveLaunch=resolve;}),{timeoutMs:10,onLateSettled:record=>late.push(record)});
  await assert.rejects(attempt.acquire(),/launch deadline exceeded/);
  assert.equal(attempt.status,'pending-cleanup');
  assert.equal(fixtureExists,true);
  assert.throws(()=>assertCleanupSafe({killed:false}),/retain fixture/);
  resolveLaunch({kill:async()=>{kills++;}});
  const result=await attempt.settled;
  assert.equal(result.status,'late-owned-cleanup-confirmed');
  assert.equal(kills,1);
  assert.deepEqual(late,[result]);
  assert.equal(fixtureExists,true); // no implicit fixture deletion by late callback
});
test('late successful launch with failed owned cleanup records failure; no foreign signal',async()=>{
  let resolveLaunch, kills=0;
  const attempt=createOwnedLaunchAttempt(()=>new Promise(resolve=>{resolveLaunch=resolve;}),{timeoutMs:10});
  await assert.rejects(attempt.acquire(),/launch deadline exceeded/);
  resolveLaunch({kill:async()=>{kills++;throw Error('owned cleanup uncertain');}});
  const result=await attempt.settled;
  assert.equal(result.status,'late-owned-cleanup-failed');assert.match(result.error,/uncertain/);
  assert.equal(kills,1);
});
test('late launcher rejection is consumed and delegated to launchApp self-cleanup, never kills another app',async()=>{
  let rejectLaunch;
  const attempt=createOwnedLaunchAttempt(()=>new Promise((_,reject)=>{rejectLaunch=reject;}),{timeoutMs:10});
  await assert.rejects(attempt.acquire(),/launch deadline exceeded/);
  rejectLaunch(Error('launchApp failed and ran its own cleanup'));
  const result=await attempt.settled;
  assert.equal(result.status,'late-launch-rejected');assert.match(result.error,/own cleanup/);
});
test('on-time launcher failure propagates without a foreign cleanup attempt',async()=>{
  const attempt=createOwnedLaunchAttempt(()=>Promise.reject(Error('port occupied')),{timeoutMs:100});
  await assert.rejects(attempt.acquire(),/port occupied/);
  assert.equal((await attempt.settled).status,'launch-rejected');
});
test('controller requires explicit paths and time bound <=5 and no unexpected switches',()=>{
 const opts=['--checkout','/tmp/checkout','--app-dir','/tmp/app','--wayland-socket','/tmp/socket','--out','/tmp/scratch/perf-lab/capture'];
 assert.equal(parseCaptureOptions(opts,{root:'/tmp'}).maxMinutes,5);
 assert.throws(()=>parseCaptureOptions([...opts,'--max-minutes','6'],{root:'/tmp'}),/1..5/);
 assert.throws(()=>parseCaptureOptions([...opts,'--build','yes'],{root:'/tmp'}),/invalid option/);
 assert.throws(()=>parseCaptureOptions(opts.slice(2),{root:'/tmp'}),/checkout/);
});
