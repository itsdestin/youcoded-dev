// Image diagnostics through a PASSED owned app/document harness. No launcher.
import {basename} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
export function imageDeadlinePolicy({stepMs=15000,sequenceMs=120000,globalBudgetMs=120000,maxRssMb=1536}={}){
 if(![stepMs,sequenceMs,globalBudgetMs,maxRssMb].every(Number.isFinite)||stepMs<100||stepMs>15000||sequenceMs<stepMs||sequenceMs>120000||sequenceMs>globalBudgetMs||globalBudgetMs>120000||maxRssMb<128||maxRssMb>1536)throw Error('Invalid image step/sequence/global/RSS budget');
 return {stepMs,sequenceMs,globalBudgetMs,maxRssMb,scope:'Per-step watchdog <=15s; separate whole image sequence <=120s and caller remaining global budget; same RSS guard at both boundaries',clockPolicy:'Each independently measured input clock window remains <=12s; sequence budget does not expand instrument clock horizon',fixturePolicy:'Compressed byte caps are output-acceptance limits, not encoder allocation ceilings. Large generation requires caller external guard, whose implementation is not proved here.'};
}
export function guardImageSequence(app,action,{policy,watchdog}={}){return watchdog(app,action,{timeoutMs:policy.sequenceMs,maxRssMb:policy.maxRssMb});}
export const IMAGE_SOURCE_FILES=Object.freeze(['src/renderer/components/SessionDrawer.tsx','src/renderer/components/artifact-views/ImageView.tsx','src/renderer/components/artifact-views/BinaryContent.tsx','src/renderer/components/artifact-views/useArtifactBytes.ts','src/renderer/components/ui/ZoomPill.tsx','src/renderer/components/artifact-views/zoom/useZoomPan.ts','src/renderer/components/artifact-views/zoom/zoom-math.ts'].map(p=>'desktop/'+p));
export const imageCoverage=Object.freeze({revision:2,standardAcceptance:false,lane:'opt-in-image-diagnostic',rendering:'observed-software-compositing plus allowlisted GPU-raster reported status; diagnostic eligibility only, no full rendering-lane certification',observerPolicy:'Each operation includes active-pane DOM reads, img.decode readiness and bounded blob SHA256 readout; overhead not calibrated, not isolated decoder CPU. rAF is scheduling, not physical presentation.',visualPattern:'not-reviewed; screenshot and active viewer review required before acceptance',lanes:[
 {entry:'scenario-images.mjs',status:'not-executed',scope:'image load/decode readiness, zoom/pan/reset and unmount/reopen; no original decoder CPU attribution'},
 {entry:'gpu-cost.mjs',status:'not-executed',scope:'existing isolated virtual hardware/AMDGPU engine diagnostics, separate adapter'},
 {entry:'realism.mjs',status:'not-executed',scope:'existing software/packaged demand diagnostics, not image integration'},
 {entry:'mixed-presentation.mjs',status:'not-executed',scope:'existing presentation observations; not physical scanout'},
 {entry:'energy-sensors.mjs',status:'not-executed',scope:'separate sensor-only domain telemetry; no app-attributable watts'},
 {entry:null,status:'unsupported',scope:'Windows/macOS/Android image runtime validation, physical GPU/scanout, GPU release and app energy attribution'}]});
// Narrow diagnostic ELIGIBILITY, not classifyRenderingLane certification.
// CDP GPUDevice has no required active field; SystemInfo.devices[0] describes
// the primary GPU. Preserve absent activity as null, never synthesize true.
export function requireSoftwareImageLane(renderer){
 const raster=renderer?.featureStatus?.rasterization;
 const software=value=>typeof value==='string'&&value.length<=1024&&/llvmpipe|softpipe|swiftshader|lavapipe/i.test(value);
 const devices=renderer?.devices,primary=Array.isArray(devices)&&devices.length>0&&devices.length<=16?devices[0]:null;
 if(renderer?.source!=='SystemInfo'||renderer.error!=null||renderer.featureStatus?.gpu_compositing!=='disabled_software'||!['disabled_software','unavailable_off'].includes(raster)||!software(renderer.glRenderer)||!software(primary?.deviceString)||primary?.active===false)throw Error('Image diagnostic eligibility requires successful SystemInfo software composition, recognized software renderer and corroborating primary description, with allowlisted GPU raster status');
 return {revision:2,lane:raster==='unavailable_off'?'observed-software-compositing-gpu-raster-reported-unavailable':'observed-software-compositing-gpu-raster-reported-disabled-software',status:'eligible',standardAcceptance:false,fullRenderingLaneCertified:false,primaryDeviceIndex:0,primarySelection:'CDP SystemInfo primary device is index0; activity absent remains unknown',gpuRasterReportedStatus:raster,renderer,physicalScanout:false,
  limitations:['Diagnostic-only eligibility, not full rendering-lane certification','GPU raster reported unavailable/disabled does not prove every raster operation runs on CPU','No physical GPU, scanout, decoder CPU or GPU-release claim']};
}
export function currentImageFit(s){
 const c=s?.container;if(![c?.width,c?.height,s?.width,s?.height].every(n=>Number.isFinite(n)&&n>0))throw Error('Current image inset container dimensions missing');
 return Math.min(1,c.width/s.width,c.height/s.height);
}
export function assessImageState(s,f,sessionId){
 const ok=s?.activeSessions===1&&s.sessionId===sessionId&&s.selectedName===basename(f.file)&&s.blobUrl?.startsWith('blob:')&&s.blobSha256===f.sha256&&s.complete===true&&s.decodeComplete===true&&!s.error&&s.width===f.shape.width&&s.height===f.shape.height&&Number.isFinite(s.scale)&&s.scale>0&&typeof s.transform==='string'&&s.zoomIn===true&&s.reset===true;
 return {ok,reason:ok?null:'Wrong/stale active image, blob identity, dimensions, decode readiness, session or enabled controls'};
}
// Executed only in the exact active content pane. A bounded blob hash ties the
// actual img source to the verified fixture bytes; dimensions alone are not ID.
export function imageStateSource(f,sessionId){return `(async()=>{
 const pane=window.__perfArt.contentPane();if(!pane)return null;
 const sessions=[...document.querySelectorAll('[data-chat-session-id]')].filter(e=>!e.closest('[aria-hidden="true"]'));
 const zoom=pane.querySelector('[data-zoomable]'),img=zoom?.querySelector('img');if(!img)return null;
 const buttons=[...zoom.querySelectorAll('button')],button=label=>buttons.find(b=>b.getAttribute('aria-label')===label),reset=buttons.find(b=>b.getAttribute('aria-label')?.startsWith('Reset to fit'));
 const selected=[...(window.__perfArt.pane()?.querySelectorAll('button span.font-semibold.truncate')??[])].map(e=>e.textContent.trim());
 const src=img.currentSrc||img.src;if(!src.startsWith('blob:'))throw Error('Image source is not active blob');
 if(!img.complete)return null;if(!img.naturalWidth)throw Error('Image load/decode failed');
 await img.decode();const blob=await fetch(src).then(r=>r.blob());if(blob.size!==${JSON.stringify(f.bytes)})throw Error('Active image blob bytes mismatch');
 const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());const blobSha256=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
 const transform=img.style.transform,match=/translate\\(([-.\\d]+)px, ([-.\\d]+)px\\) scale\\(([-.\\d]+)\\)/.exec(transform);const rect=zoom.getBoundingClientRect();
 return {sessionId:sessions[0]?.dataset.chatSessionId,activeSessions:sessions.length,selectedName:selected.includes(${JSON.stringify(basename(f.file))})?${JSON.stringify(basename(f.file))}:null,blobUrl:src,blobSha256,complete:img.complete,decodeComplete:true,width:img.naturalWidth,height:img.naturalHeight,transform,scale:match?Number(match[3]):null,offset:match?{x:Number(match[1]),y:Number(match[2])}:null,zoomIn:!!button('Zoom in')&&!button('Zoom in').disabled,zoomOut:!!button('Zoom out')&&!button('Zoom out').disabled,reset:!!reset&&!reset.disabled,container:{width:img.parentElement.clientWidth,height:img.parentElement.clientHeight},rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
})()`;}
export function imageControlSource(label){return `(()=>{const z=window.__perfArt.contentPane()?.querySelector('[data-zoomable]');const hits=[...(z?.querySelectorAll('button')??[])].filter(b=>${JSON.stringify(label)}==='Reset to fit'?b.getAttribute('aria-label')?.startsWith('Reset to fit'):b.getAttribute('aria-label')===${JSON.stringify(label)});if(hits.length!==1||hits[0].disabled)throw Error('Image control missing/disabled');const r=hits[0].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`;}
export function createImageDriver(cdp,f,sessionId,{open,close,wait,signal}={}){
 const twoFrames=()=>cdp.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const read=()=>wait(async()=>{signal?.throwIfAborted();const s=await cdp.evaluate(imageStateSource(f,sessionId));if(!s)return false;const verdict=assessImageState(s,f,sessionId);if(!verdict.ok)throw Error(verdict.reason);return s;});
 const click=async label=>{const p=await cdp.evaluate(imageControlSource(label));await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await twoFrames();};
 return {open,close,read,zoomIn:()=>click('Zoom in'),zoomOut:()=>click('Zoom out'),reset:async()=>{await click('Reset to fit');await wait(async()=>{signal?.throwIfAborted();await twoFrames();const s=await cdp.evaluate(imageStateSource(f,sessionId));return s&&assessImageState(s,f,sessionId).ok&&Math.abs(s.scale-currentImageFit(s))<=1e-6&&Math.hypot(s.offset.x,s.offset.y)<=0.5&&s.zoomOut===false;});},released:()=>cdp.evaluate(`!window.__perfArt.contentPane()?.querySelector('[data-zoomable] img')`),
  pan:async state=>{const rect=state.rect,x=rect.x+rect.width/2,y=rect.y+rect.height/2;try{await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x,y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:x+32,y:y+24});}finally{await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:x+32,y:y+24});}await twoFrames();}
 };
}
export async function runImageOperations(driver,f,sessionId,{measure,onStep=async()=>{},signal,reopenControl={fixture:f,driver}}={}){
 const steps=[];let baseline,current,primary;
 const step=async(name,action)=>{
  signal?.throwIfAborted();const id=f.id+'/'+name;let calls=0,completed=false,acceptingAction=true,actionError,actualProof,pending,returned,measurementError;
  const perform=()=>{
   if(!acceptingAction)return Promise.reject(Error('Image action invoked after measurement returned'));
   if(++calls!==1){const error=Error('Image action executed more than once');actionError=error;return Promise.reject(error);}
   pending=(async()=>{try{const evidence=await action();const proof={attempted:true,correctTarget:true,correctResult:true,unmountedBefore:true,viewer:'image',marker:f.marker,...evidence};
    // Snapshot what the action actually produced before returning it to the
    // measurement callback; compare by value, not shared-reference tautology.
    actualProof=structuredClone(proof);completed=true;return proof;
   }catch(error){actionError=error;throw error;}})();pending.catch(()=>{});return pending;
  };
  try{returned=await measure(id,perform);}catch(error){measurementError=error;}
  acceptingAction=false;const completedBeforeReturn=completed;
  // A dishonest early return cannot certify awaited completion. Drain its one
  // started action under the enclosing external watchdog before cleanup, never
  // detach an active operation into the next image.
  if(pending)await pending.catch(()=>{});
  const proofValid=calls===1&&completedBeforeReturn&&!actionError&&actualProof?.viewer==='image'&&typeof actualProof.marker==='string'&&actualProof.attempted===true&&actualProof.correctTarget===true&&actualProof.correctResult===true&&isDeepStrictEqual(returned?.proof,actualProof);
  let row=returned&&typeof returned==='object'?{...returned}:{id};
  const invalid=measurementError||((row.status==='measured'||row.status===undefined)&&(!proofValid||row.id!==id||row.status!=='measured'));
  if(invalid){row={...row,id,status:'failed',error:String(actionError?.message??measurementError?.message??'Image action/step/status/proof execution contract invalid')};}
  else if(row.id!==id){row={...row,id,status:'failed',error:'Image measurement returned other step identity'};}
  steps.push(row);await onStep(row);
  if(row.status!=='measured'){const error=Error(`Image suboperation ${name} ${row.status}: ${row.error??'evidence incomplete'}`);error.fatal=row.fatal===true||measurementError?.fatal===true;error.evidence=row;throw error;}
 };
 const checked=async()=>{const s=await driver.read();const v=assessImageState(s,f,sessionId);if(!v.ok)throw Error(v.reason);return s;};
 try{
  await step('open-decode',async()=>{await driver.open();baseline=await checked();current=baseline;if(baseline.zoomOut!==false)throw Error('Image did not open fitted');return {image:baseline,readinessSemantics:'file open through load/decode readiness; not original decoder CPU time'};});
  await step('zoom-in',async()=>{for(let n=0;n<8;n++){await driver.zoomIn();current=await checked();if(current.scale>=baseline.scale*2)break;}if(current.scale<=baseline.scale||current.transform===baseline.transform)throw Error('Zoom transform unchanged');return {image:current};});
  await step('pan',async()=>{const before=current;await driver.pan(before);current=await checked();if(Math.hypot(current.offset.x-before.offset.x,current.offset.y-before.offset.y)<=4)throw Error('Image pan did not exceed4px');return {image:current};});
  await step('zoom-out',async()=>{if(!current.zoomOut)throw Error('Zoom out disabled');const before=current.scale;await driver.zoomOut();current=await checked();if(current.scale>=before)throw Error('Zoom out unchanged');return {image:current};});
  // WHY: SessionDrawer keeps the list on preview, then mousedown closes it.
  // ImageView ResizeObserver recomputes fit for its CURRENT inset client box;
  // resetting is not a promise to restore the obsolete opening pane width.
  await step('reset-fit',async()=>{await driver.reset();current=await checked();if(Math.abs(current.scale-currentImageFit(current))>1e-6||Math.hypot(current.offset.x,current.offset.y)>0.5||current.zoomOut!==false)throw Error('Reset did not restore fit');return {image:current,fitPolicy:'Current inset client box, not opening layout',openingScale:baseline.scale,expectedCurrentFit:currentImageFit(current)};});
  await step('release',async()=>{await driver.close();if(!await driver.released())throw Error('Image still mounted after close');return {release:{unmounted:true,claim:'DOM unmount only; family RSS trend not GPU/decoder cache release proof'}};});
  await step('reopen',async()=>{await reopenControl.driver.open();current=await reopenControl.driver.read();const v=assessImageState(current,reopenControl.fixture,sessionId);if(!v.ok)throw Error(v.reason);if(current.blobUrl===baseline.blobUrl||current.zoomOut!==false)throw Error('Reopen reused stale blob or zoom');return {image:current,controlFixtureId:reopenControl.fixture.id,marker:reopenControl.fixture.marker};});
 }catch(error){primary=error;}
 finally{try{await driver.close();}catch(error){if(primary)primary.cleanupError=error.message;else primary=error;primary.fatal=true;}}
 if(primary){primary.imageSteps=steps;primary.evidence={...primary.evidence,imageSteps:steps,imageDiagnostic:true};throw primary;}return steps;
}
