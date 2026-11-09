// Offline only: tiny fixture encodes and injected CDP/drivers, never launch app.
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createRequire} from 'node:module';
import {validateImagePlan,encodeImageFixture,buildImageFixtures,IMAGE_PLAN} from '../stall-fixtures.mjs';
import {validateDocumentManifest,collectDocumentProvenance,withDocumentWatchdog} from '../scenario-document-stalls.mjs';
import vm from 'node:vm';
import {parseSystemInfo} from '../gpu.mjs';
import {classifyRenderingLane} from '../capabilities.mjs';
import {assessImageState,requireSoftwareImageLane,imageControlSource,imageStateSource,runImageOperations,imageDeadlinePolicy,guardImageSequence,IMAGE_SOURCE_FILES,imageCoverage} from '../scenario-images.mjs';
// WHY no checkout/require: fixtures are written by the lab's own dependency-free encoders (image-encode.mjs), so this test no longer
// depends on the working directory or on any installed package (it used to fail with "Cannot find module 'pngjs'").
const checkout=resolve('no-checkout-needed');
import {inflateSync} from 'node:zlib';import {jpegSize,pngSize} from '../image-encode.mjs';
test('image dimension and aggregate caps checked before RGBA allocation/encoder work',()=>{
 assert.equal(validateImagePlan(IMAGE_PLAN).length,3);
 for(const plan of [[{id:'x',format:'png',width:8193,height:1}],[{id:'x',format:'png',width:8192,height:8192}],Array(5).fill({id:'x',format:'png',width:1,height:1})])assert.throws(()=>validateImagePlan(plan));
 let allocated=false;assert.throws(()=>encodeImageFixture({id:'x',format:'png',width:8192,height:8192},{allocate:()=>{allocated=true;}}));assert.equal(allocated,false);
});
test('small PNG/JPEG deterministic fixtures decode dimensions, pattern and source identity',async()=>{
 for(const format of ['png','jpeg']){
  const spec={id:`tiny-${format}`,format,width:16,height:12,seed:123};const a=encodeImageFixture(spec),b=encodeImageFixture(spec);assert.deepEqual(a.data,b.data);assert.equal(a.shape.width,16);assert.equal(a.shape.height,12);assert.ok(a.shape.encoder.version);assert.match(a.shape.generatorSha256,/^[a-f0-9]{64}$/);
  // PNG: inflate the IDAT and check the first pixel is the quadrant-0 colour; JPEG: baseline SOF dimensions and SOI/EOI framing.
  if(format==='png'){const d=pngSize(a.data);assert.equal(d.width,16);assert.equal(d.height,12);const idatLen=a.data.readUInt32BE(33),raw=inflateSync(a.data.subarray(41,41+idatLen));assert.equal(raw.length,12*(1+16*3));assert.equal(raw[0],0);assert.deepEqual([...raw.subarray(1,4)],[220,40^(123&7),40]);}
  else{const d=jpegSize(a.data);assert.equal(d.width,16);assert.equal(d.height,12);assert.equal(d.baseline,true);assert.deepEqual([...a.data.subarray(-2)],[0xff,0xd9]);}
 }
 const root=await mkdtemp(join(tmpdir(),'image-fixture-'));try{const m=await buildImageFixtures(root,{checkout,plan:[{id:'tiny',format:'png',width:16,height:12,seed:7}]});assert.equal(m.schema,2);assert.equal(m.imagesRevision,1);assert.equal((await readFile(m.cases[0].file)).length,m.cases[0].bytes);await assert.rejects(buildImageFixtures(root,{checkout,plan:[{id:'tiny',format:'png',width:16,height:12,seed:7}]}),/empty/);}finally{await rm(root,{recursive:true,force:true});}
});
const fixture={id:'image-test',file:'/private/image-test.png',marker:'image-test',sha256:'a'.repeat(64),shape:{width:16,height:12}};
const state=()=>({sessionId:'s',activeSessions:1,selectedName:'image-test.png',blobUrl:'blob:file:///test',blobSha256:fixture.sha256,complete:true,decodeComplete:true,width:16,height:12,transform:'translate(-50%, -50%) translate(0px, 0px) scale(0.5)',scale:0.5,offset:{x:0,y:0},zoomIn:true,zoomOut:false,reset:true,container:{width:8,height:6},rect:{x:0,y:0,width:200,height:200}});
test('actual image proof rejects wrong/stale blob, session, decode error and disabled controls',()=>{
 assert.equal(assessImageState(state(),fixture,'s').ok,true);
 for(const mutate of [s=>s.blobSha256='b'.repeat(64),s=>s.sessionId='other',s=>s.selectedName='stale.png',s=>s.width=1,s=>s.decodeComplete=false,s=>s.error='decode error',s=>s.zoomIn=false,s=>s.reset=false]){const s=state();mutate(s);assert.equal(assessImageState(s,fixture,'s').ok,false);}
 new Function(`return ${imageStateSource(fixture,'s')}`);
});
test('serialized controls reject disabled buttons and serialized image source exposes decoder rejection',async()=>{
 const button={getAttribute:()=> 'Zoom in',disabled:true};const zoom={querySelectorAll:()=>[button]};const ctx={window:{__perfArt:{contentPane:()=>({querySelector:()=>zoom})}}};assert.throws(()=>vm.runInNewContext(imageControlSource('Zoom in'),ctx),/disabled/);
 const img={currentSrc:'blob:file:///active',complete:true,naturalWidth:16,decode:async()=>{throw Error('decode failed');}};const context={window:{__perfArt:{contentPane:()=>({querySelector:()=>({querySelector:()=>img,querySelectorAll:()=>[]})}),pane:()=>({querySelectorAll:()=>[]})}},document:{querySelectorAll:()=>[]}};
 await assert.rejects(vm.runInNewContext(imageStateSource({...fixture,bytes:100},'s'),context),/decode failed/);
});

test('suboperations preserve proof, release in finally, reject disabled controls and abort',async()=>{
 const events=[];const driver={open:async()=>events.push('open'),read:async()=>state(),zoomIn:async()=>{},zoomOut:async()=>{},pan:async()=>{},reset:async()=>{},close:async()=>events.push('close'),released:async()=>true};
 await assert.rejects(runImageOperations(driver,fixture,'s',{measure:async(id,action)=>({id,status:'measured',proof:await action()}),onStep:async r=>events.push(r.id)}),/zoom|transform/i);assert.equal(events.at(-1),'close');assert.ok(events.includes('image-test/open-decode'));
 const abort=new AbortController();abort.abort();await assert.rejects(runImageOperations(driver,fixture,'s',{signal:abort.signal,measure:async()=>{throw Error('must not measure');}}));assert.equal(events.at(-1),'close');
});
test('failed fatal suboperation is checkpointed before propagation and cleanup still runs',async()=>{
 const saved=[],calls=[];const driver={close:async()=>calls.push('close')};
 await assert.rejects(runImageOperations(driver,fixture,'s',{measure:async id=>({id,status:'timeout',fatal:true,error:'external deadline'}),onStep:async row=>saved.push(row)}),error=>{assert.equal(error.fatal,true);assert.equal(error.imageSteps.length,1);assert.match(error.message,/external deadline/);return true;});assert.equal(saved[0].status,'timeout');assert.deepEqual(calls,['close']);
});

test('measurer cannot fabricate action completion, step identity, status or proof',async()=>{
 const bad=[async(id,a)=>({id,proof:await a()}),async(id,a)=>({id:'wrong',status:'measured',proof:await a()}),async id=>({id,status:'measured'}),async(id,a)=>{const proof=await a();await a().catch(()=>{});return {id,status:'measured',proof};},async(id,a)=>({id,status:'measured',proof:{...await a(),marker:'other'}}),async(id,a)=>{a().catch(()=>{});return {id,status:'measured',proof:{}};}];
 for(const measure of bad){const saved=[];let closed=0;const d={open:async()=>{},read:async()=>state(),close:async()=>closed++};await assert.rejects(runImageOperations(d,fixture,'s',{measure,onStep:async r=>saved.push(r)}));assert.equal(saved.length,1);assert.equal(saved[0].status,'failed');assert.equal(closed,1);}
 let late,opened=0;await assert.rejects(runImageOperations({open:async()=>{opened++;},close:async()=>{}},fixture,'s',{measure:async(id,a)=>{late=a;return {id,status:'measured'};}}));await assert.rejects(late(),/after measurement/);assert.equal(opened,0);
 const saved=[];await assert.rejects(runImageOperations({open:async()=>{throw Error('open rejected');},close:async()=>{}},fixture,'s',{measure:async(id,a)=>{await a().catch(()=>{});return {id,status:'measured',proof:{}};},onStep:async r=>saved.push(r)}),/open rejected|action/);assert.equal(saved[0].status,'failed');
});

test('sequence has separate whole/RSS ceiling while individual steps keep15s caps',async()=>{
 const policy=imageDeadlinePolicy({stepMs:15000,sequenceMs:120000,globalBudgetMs:120000,maxRssMb:1536});assert.equal(policy.sequenceMs,120000);
 for(const options of [{stepMs:15001},{sequenceMs:120001},{sequenceMs:120000,globalBudgetMs:60000},{maxRssMb:1537}])assert.throws(()=>imageDeadlinePolicy(options));
 let elapsed=0,kills=0;const app={kill:async()=>kills++};
 const timers=new Map();let next=0,lastSignal;
 const advance=ms=>{elapsed+=ms;for(const [id,t]of [...timers])if(t.at<=elapsed){timers.delete(id);t.fn();}};
 const deps={setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:elapsed+ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval:()=>{},sample:()=>({complete:true,peakRssMb:100})};
 const watchdog=(app,operation,limits)=>withDocumentWatchdog(app,signal=>{lastSignal=signal;return operation(signal);},{...limits,_deps:deps});
 const r=await guardImageSequence(app,async()=>{for(let i=0;i<7;i++){const s=await watchdog(app,async()=>{advance(4000);return true;},{timeoutMs:policy.stepMs});assert.equal(s.status,undefined);}return 'done';},{policy,watchdog});assert.equal(r.value,'done');assert.equal(elapsed,28000);assert.equal(kills,0);
 const step=await watchdog(app,async()=>{advance(16000);},{timeoutMs:policy.stepMs});assert.equal(step.status,'timeout');
 const whole=await guardImageSequence(app,async signal=>{advance(121000);return {signal};},{policy,watchdog});assert.equal(whole.status,'timeout');assert.equal(lastSignal.aborted,true);assert.equal(kills,2);
});

test('successful operations retain all substeps including reopen; reset and release are not GPU claims',async()=>{
 let scale=.5,offset={x:0,y:0},opened=0,closed=0;
 const snapshot=()=>({...state(),blobUrl:'blob:file:///'+opened,scale,offset:{...offset},zoomOut:scale>.5,transform:`translate(${offset.x}px,${offset.y}px) scale(${scale})`});
 const driver={open:async()=>{opened++;scale=.5;offset={x:0,y:0};},read:async()=>snapshot(),zoomIn:async()=>{scale*=2;},zoomOut:async()=>{scale/=2;offset={x:0,y:0};},pan:async()=>{offset={x:32,y:24};},reset:async()=>{scale=.5;offset={x:0,y:0};},close:async()=>{closed++;},released:async()=>true};
 const steps=await runImageOperations(driver,fixture,'s',{measure:async(id,action)=>({id,status:'measured',proof:await action()})});assert.equal(steps.length,7);assert.equal(opened,2);assert.equal(closed,2);assert.match(steps[5].proof.release.claim,/not GPU/);
});

test('reset fits the CURRENT inset container after desktop list collapses, not stale opening scale',async()=>{
 const f={...fixture,shape:{width:1024,height:768}};let w=238,scale=238/1024,offset={x:0,y:0},blob=0;
 const read=()=>({...state(),width:1024,height:768,container:{width:w,height:549},scale,offset:{...offset},zoomOut:Math.abs(scale-w/1024)>1e-6,blobUrl:'blob:'+blob,transform:`translate(${offset.x}px,${offset.y}px) scale(${scale})`});
 const driver={open:async()=>{blob++;scale=w/1024;},read:async()=>read(),zoomIn:async()=>{w=448;scale=.5;},pan:async()=>{offset.x=32;},zoomOut:async()=>{scale=w/1024;offset={x:0,y:0};},reset:async()=>{scale=w/1024;offset={x:0,y:0};},close:async()=>{},released:async()=>true};
 const steps=await runImageOperations(driver,f,'s',{measure:async(id,a)=>({id,status:'measured',proof:await a()})});assert.equal(steps[4].proof.image.scale,.4375);assert.notEqual(steps[4].proof.image.scale,steps[0].proof.image.scale);
});

test('nested watchdog retains announced primary action failure before intentional kill removes main PID',async()=>{
 let announced,tick,kills=0;const app={kill:async()=>{kills++;tick();}};
 const deps={setTimeout:()=>1,clearTimeout:()=>{},setInterval:fn=>{tick=fn;return 2;},clearInterval:()=>{},sample:()=>kills?{complete:false,error:'Expected main PID disappeared'}:{complete:true,peakRssMb:100}};
 const r=await withDocumentWatchdog(app,async()=>{
  const inner=await withDocumentWatchdog(app,async()=>{throw Object.assign(Error('Reset did not restore fit'),{fatal:true,evidence:{id:'image/reset-fit'}});},{timeoutMs:15000,maxRssMb:1536,onFatalFailure:v=>announced=v,_deps:{...deps,setInterval:()=>2}});throw Object.assign(Error(inner.error),{fatal:true});
 },{timeoutMs:120000,maxRssMb:1536,priorFatalFailure:()=>announced,_deps:deps});
 assert.match(r.error,/Reset did not restore fit/);assert.doesNotMatch(r.error,/Expected main PID disappeared/);assert.equal(r.value.id,'image/reset-fit');
});

test('image manifest requires opt-in revision and preserves all fixture budget refusals',()=>{
 const f={...fixture,kind:'image-png',bytes:100};const m={schema:2,imagesRevision:1,profile:'images-opt-in',root:'/private',cases:[f]};
 assert.throws(()=>validateDocumentManifest(m));assert.equal(validateDocumentManifest(m,{images:true}).length,1);
 for(const mutation of [m=>m.imagesRevision=2,m=>m.cases[0].bytes=16777217,m=>m.cases[0].shape={width:8192,height:8192},m=>m.cases=Array.from({length:4},(_,i)=>({...f,id:'img-'+i,file:'/private/'+i+'.png',bytes:16*1024*1024}))]){const bad=structuredClone(m);mutation(bad);assert.throws(()=>validateDocumentManifest(bad,{images:true}));}
});

test('opt-in provenance hashes image sources from executed checkout, not script workspace',async()=>{
 const fp={sha:'a'.repeat(40),dirty:'b'.repeat(12),branch:'test'},binary='/executed/desktop/release/linux-unpacked/youcoded';const r=await collectDocumentProvenance({pid:7,mainLoop:{owner:{pid:7,binary}}},'/executed',{...fp,binary},{images:true,_deps:{real:async p=>p,link:()=>binary,fingerprint:async()=>fp,read:p=>Buffer.from(p.endsWith('.json')?JSON.stringify(fp):p)}});
 for(const file of IMAGE_SOURCE_FILES)assert.ok(r.sourceHashes.some(s=>s.file==='/executed/'+file));assert.ok(r.sourceHashes.some(s=>s.file.endsWith('/scenario-images.mjs')));
});

test('captured SystemInfo permits narrow image diagnostics without inventing device activity/full lane certification',async()=>{
 const raw=JSON.parse(await readFile(new URL('./fixtures/image-system-info.json',import.meta.url),'utf8'));
 assert.equal(Object.hasOwn(raw.gpu.devices[0],'active'),false);
 const parsed=parseSystemInfo(raw),eligible=requireSoftwareImageLane(parsed);
 assert.equal(parsed.devices[0].active,null);assert.equal(eligible.lane,'observed-software-compositing-gpu-raster-reported-unavailable');assert.equal(eligible.standardAcceptance,false);assert.equal(eligible.fullRenderingLaneCertified,false);assert.equal(eligible.primaryDeviceIndex,0);assert.deepEqual(eligible.renderer,parsed);assert.equal(eligible.renderer.devices[0].vendorId,4098);assert.equal(eligible.renderer.devices[0].deviceId,5510);
 assert.equal(classifyRenderingLane({selectedLane:'software',renderer:parsed}).status,'incomplete');
 const disabled=parseSystemInfo({...raw,gpu:{...raw.gpu,featureStatus:{...raw.gpu.featureStatus,rasterization:'disabled_software'}}});assert.equal(requireSoftwareImageLane(disabled).lane,'observed-software-compositing-gpu-raster-reported-disabled-software');assert.equal(classifyRenderingLane({selectedLane:'software',renderer:disabled}).status,'incomplete');
 for(const change of [p=>p.source='webgl',p=>p.error='SystemInfo failed',p=>p.featureStatus.gpu_compositing='enabled',p=>p.featureStatus.rasterization='enabled_on',p=>delete p.featureStatus.rasterization,p=>p.featureStatus.rasterization='unknown',p=>p.glRenderer='zink AMD RADV',p=>p.devices=[],p=>p.devices[0].deviceString='AMD hardware',p=>p.devices.unshift({deviceString:'AMD hardware',active:null}),p=>p.devices[0].active=false]){const p=structuredClone(parsed);change(p);assert.throws(()=>requireSoftwareImageLane(p));}
 assert.throws(()=>requireSoftwareImageLane(undefined));
});

test('provenance and diagnostic coverage name real entry points without claiming execution',()=>{
 for(const name of ['ImageView.tsx','BinaryContent.tsx','ZoomPill.tsx','useZoomPan.ts','zoom-math.ts'])assert.ok(IMAGE_SOURCE_FILES.some(f=>f.endsWith(name)));
 assert.equal(imageCoverage.standardAcceptance,false);assert.ok(imageCoverage.lanes.every(l=>l.status==='not-executed'||l.status==='unsupported'));assert.ok(imageCoverage.lanes.some(l=>l.entry==='energy-sensors.mjs'));
});
