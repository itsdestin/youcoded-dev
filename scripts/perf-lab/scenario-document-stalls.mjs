// Real viewer adapter only: never launches an app, downloads a model or infers
// an idle event loop from missing long-task entries. Controller owns deadlines.
import { appendFileSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { installArtifactHelpers, registerArtifacts } from './scenario-artifacts.mjs';
import { installLoopProbe, readLoopProbe } from './probe-loop.mjs';
import { installIpcStallProbe, readIpcStallProbe } from './probe-ipc.mjs';
import { installProbe, readProbe, stopProbe } from './scenario-workload.mjs';
import { treeFingerprint } from './build.mjs';
import { validateImagePlan, IMAGE_LIMITS } from './stall-fixtures.mjs';
import { createImageDriver, runImageOperations, IMAGE_SOURCE_FILES, imageCoverage, requireSoftwareImageLane, imageDeadlinePolicy, guardImageSequence } from './scenario-images.mjs';
import { DOCUMENT_ADAPTER_REVISION, DOCUMENT_ACTION_PRECISION_MS, DOCUMENT_CLOCK_HORIZON_MS, DOCUMENT_CONTROL_TYPES, alignDocumentClocks, exchangeDocumentClock, startDocumentInputTrain, summariseDocumentInput, documentInputEvidenceValid, blockedInputEvidence, cleanupDocumentResources } from './document-input.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const finite = n => typeof n==='number' && Number.isFinite(n) && n>=0;
const contained = (root,file) => {const r=relative(root,file);return r && !r.startsWith('..') && !isAbsolute(r);};
export function validateDocumentManifest(manifest,{images=false,extraKinds=[]}={}) {
  const imageManifest=images&&manifest?.schema===2&&manifest.imagesRevision===1&&manifest.profile==='images-opt-in';
  if(imageManifest){validateImagePlan(manifest.cases.map(f=>({...f.shape,id:f.id,format:f.kind==='image-png'?'png':f.kind==='image-jpeg'?'jpeg':null})));if(manifest.cases.reduce((n,f)=>n+f.bytes,0)>IMAGE_LIMITS.maxAggregateBytes)throw Error('Image aggregate cap');}
  if((manifest?.schema!==1&&!imageManifest) || !isAbsolute(manifest.root??'') || !Array.isArray(manifest.cases) || manifest.cases.length>64)throw Error('Invalid document manifest');
  const ids=new Set();
  for(const f of manifest.cases){
    if(!/^[\w-]+$/.test(f.id) || ids.has(f.id) || !isAbsolute(f.file??'') || !contained(resolve(manifest.root),resolve(f.file)) || !finite(f.bytes) || f.bytes>16*1024*1024 || !/^[a-f0-9]{64}$/.test(f.sha256??'') || !f.marker || !f.shape)throw Error('Invalid/oversized/outside-root document fixture');
    if(!(imageManifest?['image-png','image-jpeg']:['xlsx-merge','xlsx-sheets','csv-rows','csv-wide','csv-quoted','csv-fullread','docx-paragraphs','docx-table','html-assets','html-script','path-list',...extraKinds]).includes(f.kind))throw Error('Unsupported document fixture kind');
    let assetBytes=0;
    for(const a of f.assets??[]){
      if(!isAbsolute(a.file??'') || !contained(resolve(manifest.root),resolve(a.file)) || !finite(a.bytes) || !/^[a-f0-9]{64}$/.test(a.sha256??''))throw Error('Invalid/outside-root HTML asset');
      assetBytes+=a.bytes;
    }
    if(assetBytes>16*1024*1024 || (f.assets && assetBytes!==f.shape.aggregateAssetBytes))throw Error('Invalid HTML asset byte cap/shape');
    ids.add(f.id);
  }
  return manifest.cases;
}
const inputOk=(r,input)=>documentInputEvidenceValid(input,{caseId:r.id,operationMs:r.operationMs}) && input.received===true && input.trusted===true && input.correctTarget===true && input.clocks?.valid===true && finite(input.clocks.errorMs)
    && finite(input.latencyMs) && finite(input.latencyUpperMs) && typeof input.latencyLowerMs==='number' && Number.isFinite(input.latencyLowerMs)
    && ['passed','breach'].includes(input.budgetStatus) && input.samples?.length>0 && input.samples.every(s=>['plannedMs','actualMs','ackMs','latencyUpperMs'].every(k=>finite(s[k])) && Number.isFinite(s.latencyLowerMs) && finite(s.receipt?.atMs) && s.receipt.trusted===true && s.receipt.correctTarget===true);
// WHY (lane F): see blockedInputEvidence. Same case id / action-window binding as a normal input proof, and every other probe is still required.
const blockedInputOk=(r,input)=>input?.caseId===r.id && finite(r.operationMs) && finite(input.actionStartMs) && finite(input.actionEndMs) && Math.abs(input.actionEndMs-input.actionStartMs-r.operationMs)<=DOCUMENT_ACTION_PRECISION_MS && blockedInputEvidence(input)!==null;
export function assessViewerEvidence(r,{allowBlockedInput=false}={}) {
  const positive=n=>finite(n)&&n>0;
  const loop=p=>p?.available===true && p.stopped===true && p.truncated===false && positive(p.sampleCount)
    && ['maxDelayMs','maxGapMs','totalStallMs','totalExcessMs','observedMs'].every(k=>finite(p[k]));
  const input=r?.input;
  const ok=r?.proof?.attempted===true && r.proof.correctTarget===true && r.proof.correctResult===true && r.proof.unmountedBefore===true
    && (DOCUMENT_CONTROL_TYPES.includes(r.proof.control) || (!!r.proof.viewer && typeof r.proof.marker==='string' && r.proof.marker.length>0))
    && finite(r.operationMs) && loop(r.renderer) && loop(r.main)
    && positive(r.frame?.frames) && ['frameGapMaxMs','observedMs','framesPerSec'].every(k=>finite(r.frame[k])) && Array.isArray(r.frame.errors) && r.frame.errors.length===0
    && positive(r.ipc?.pings) && positive(r.ipc.tickSamples) && ['medianMs','p95Ms','maxMs','totalStallMs','maxTickDelayMs'].every(k=>finite(r.ipc[k])) && r.ipc.rejectedPings===0 && r.ipc.openStallMs===null && r.ipc.sawHidden===false
    && (inputOk(r,input) || (allowBlockedInput && blockedInputOk(r,input)))
    && !r.cleanupErrors?.length && r.memory?.complete===true && positive(r.memory.samples) && finite(r.memory.peakRssMb);
  return ok?{status:'measured'}:{status:'failed',error:'Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof'};
}
// WHY two numbers (lane F): Electron's processes share most of their pages (the same binary, libraries and V8 snapshot are mapped into
// the main, GPU, renderer and utility processes), and VmRSS counts a shared page once per process. Summing VmRSS therefore reports
// about 1.2-1.5 GiB for an app that is really using about 0.5 GiB, which made a lab cap of 1536 MiB trip on an idle app. PSS
// (/proc/<pid>/smaps_rollup) splits each shared page between the processes sharing it, so the family sum is the real footprint, and
// it is what resource-checkpoint/procs.mjs already use for the idle and scrollback rows. Both are always recorded; `basis` says which
// one the cap is judged on. 'rss' stays the default so the smoke-document callers behave as before.
export const MEMORY_BASIS = Object.freeze({ rss: 'rss', pss: 'pss' });
// WHY a re-read when a member vanishes: Electron starts and ends short-lived helper processes (utility, crashpad, GPU restarts). One that
// exits between "list the family" and "read its /proc files" used to make the whole sample incomplete, and an incomplete sample fails the
// row as "complete memory proof" missing - 6 of ~50 rungs in one run, none of them an app problem. Reading PSS (slower than VmRSS) widened
// that window. A pid whose /proc entry is GONE (ENOENT/ESRCH) is an exited process, not a live member we failed to count, so the family is
// listed again and read again (bounded). Any other read error, a vanished MAIN process, or a family that keeps changing is still incomplete.
export const MEMORY_SAMPLE_REREADS = 4;
export function sampleOwnedMemory(app,{basis=MEMORY_BASIS.rss}={}) {
  let last;
  for(let attempt=0;attempt<MEMORY_SAMPLE_REREADS;attempt++){
    last=sampleOwnedMemoryOnce(app,{basis});
    if(last.complete||!last.memberGone||!last.mainPresent)break;
  }
  return last;
}
function sampleOwnedMemoryOnce(app,{basis}) {
  const pids=[...new Set(app.family())];
  if(!pids.includes(app.pid))return {complete:false,error:'Expected main PID disappeared',pids};
  let rss=0,pss=0;
  try{
    for(const pid of pids){
      const status=readFileSync(`/proc/${pid}/status`,'utf8');
      // A zombie is an observed exited process, not a live zero-RSS sample.
      // Its main-PID equivalent is fatal; never silently omit a live member.
      if(/^State:\s+Z/m.test(status) && pid!==app.pid)continue;
      const m=/^VmRSS:\s+(\d+) kB/m.exec(status);
      if(!m)throw Error(`RSS missing for owned PID ${pid}`);
      rss+=Number(m[1])/1024;
      if(basis===MEMORY_BASIS.pss){
        const p=/^Pss:\s+(\d+) kB/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`,'utf8'));
        if(!p)throw Error(`PSS missing for owned PID ${pid}`);
        pss+=Number(p[1])/1024;
      }
    }
    return {complete:true,peakRssMb:rss,...(basis===MEMORY_BASIS.pss?{peakPssMb:pss}:{}),pids};
  }catch(e){
    let mainPresent=false;
    try{mainPresent=/^VmRSS:\s+\d+ kB/m.test(readFileSync(`/proc/${app.pid}/status`,'utf8'));}catch{/* main gone */}
    return {complete:false,error:e.message,pids,mainPresent,memberGone:e?.code==='ENOENT'||e?.code==='ESRCH'};
  }
}
/** External controller watchdog: missing memory is failure, never a zero reading. */
export async function withDocumentWatchdog(app, operation,{timeoutMs,maxRssMb,memoryBasis=MEMORY_BASIS.rss,onFatalFailure=()=>{},priorFatalFailure=()=>null,_deps={}}={}) {
  const d={setTimeout,clearTimeout,setInterval,clearInterval,sample:()=>sampleOwnedMemory(app,{basis:memoryBasis}),..._deps};
  const pss=memoryBasis===MEMORY_BASIS.pss;
  // `capMb`/`basis` ride in the memory record so a cap hit reads as "the LAB's guard stopped it at N", with the real peak beside it.
  const memory={complete:true,samples:0,peakRssMb:null,...(pss?{peakPssMb:null}:{}),basis:memoryBasis,capMb:maxRssMb},abort=new AbortController();let timer,interval,stopped=false,finish;
  const failure=new Promise(r=>{finish=r;});
  const fail=(status,error,value)=>{
    if(stopped)return;stopped=true;
    // Announce cause BEFORE intentional teardown. An enclosing RSS sampler may
    // otherwise race the nested failure and relabel our kill as main loss.
    onFatalFailure({status,error,value});abort.abort();
    Promise.resolve().then(()=>app.kill()).then(()=>finish({status,error,fatal:true,memory,value}),e=>finish({status:'failed',error:`${error}; cleanup: ${e.message}`,fatal:true,memory,value,cleanupFailed:true}));
  };
  const sample=()=>{
    if(stopped)return;
    const primary=priorFatalFailure();if(primary){fail(primary.status,primary.error,primary.value);return;}
    const s=d.sample();
    if(!s?.complete){
      memory.complete=false;memory.error=s?.error??'Missing external memory sample';
      // A short-lived utility can exit during /proc enumeration. Preserve that
      // incomplete interval as a FAILED row, not zero RSS, without needlessly
      // killing an otherwise-owned live main process. Main loss is fatal.
      if(!s?.mainPresent)fail('failed',memory.error);
      return;
    }
    memory.samples++;memory.peakRssMb=Math.max(memory.peakRssMb??0,s.peakRssMb);
    const judged=pss?s.peakPssMb:s.peakRssMb;
    if(pss)memory.peakPssMb=Math.max(memory.peakPssMb??0,s.peakPssMb);
    if(judged>maxRssMb)fail('memory-limit',pss
      ?`Lab safety cap: owned app family PSS ${Math.round(judged)} MiB exceeded the ${maxRssMb} MiB cap (summed RSS ${Math.round(s.peakRssMb)} MiB double-counts shared pages)`
      :`Owned app family RSS exceeds ${maxRssMb} MiB`);
  };
  timer=d.setTimeout(()=>fail('timeout',`External case deadline ${timeoutMs} ms`),timeoutMs);
  interval=d.setInterval(sample,50);sample();
  try{
    const work=Promise.resolve().then(()=>stopped?failure:operation(abort.signal)).then(value=>({value}),e=>{
      if(e.fatal){fail('failed',`${e.stack??e}; cleanup: ${(e.cleanupErrors??[]).join('; ')}`,e.evidence);return failure;}
      return {status:'failed',error:e.stack??String(e),cleanupErrors:e.cleanupErrors,value:e.evidence};
    });
    const result=await Promise.race([work,failure]);
    if(!result.fatal)sample();
    if(stopped)return await failure;
    return {...result,memory,fatal:false};
  }finally{d.clearTimeout(timer);d.clearInterval(interval);}
}

export async function installDocumentHelpers(cdp) {
  await installArtifactHelpers(cdp);
  // WHY: current rows render a thumbnail (whose font-mono word is XLSX/CSV),
  // then a font-medium filename. The older lab helper matches the badge instead.
  // Keep its pane/frame utilities, replacing only the stale row selector here.
  return cdp.evaluate(`(() => {
    const rows=()=>[...(window.__perfArt.pane()?.querySelectorAll('button')??[])].filter(b=>b.querySelector('span.font-medium.truncate'));
    const name=b=>b.querySelector('span.font-medium.truncate')?.textContent.trim();
    window.__perfArt.rowNames=()=>window.__perfArt.pane()?rows().map(name):null;
    window.__perfArt.clickListRow=async wanted=>{const hits=rows().filter(b=>name(b)===wanted);if(hits.length!==1)return {ok:false,reason:'Expected one current filename row '+wanted+', found '+hits.length};hits[0].click();await window.__perfArt.nextFrame2();return {ok:true,name:wanted};};
    return true;
  })()`);
}

export async function installDocumentReceipt(cdp,caseId,sessionId) {
  // WHY: F24 carries no application token. The token below is a receipt ordinal,
  // paired with controller dispatch order under FIFO delivery, not independent
  // transport identity. Counts and nondecreasing DOM clocks are required; an
  // equal-count substitution cannot be detected by this inert-key instrument.
  return cdp.evaluate(`(() => {
    if(window.__documentStallInputHandler){window.removeEventListener('keydown',window.__documentStallInputHandler,true);window.removeEventListener('keyup',window.__documentStallInputHandler,true);}
    window.__documentStall={caseId:${JSON.stringify(caseId)},sessionId:${JSON.stringify(sessionId)},receipts:[],overflow:0,messages:[]};
    window.__documentStallInputHandler=e=>{if(e.code!=='F24')return;e.preventDefault();e.stopImmediatePropagation();if(e.type==='keyup')return;const p=window.__documentStall;
      const active=[...document.querySelectorAll('[data-chat-session-id]')].filter(x=>!x.closest('[aria-hidden="true"]'));
      if(p.receipts.length>=256){p.overflow++;return;}
      p.receipts.push({token:p.receipts.length,trusted:e.isTrusted,correctTarget:active.length===1&&active[0].dataset.chatSessionId===p.sessionId,atMs:performance.now(),caseId:p.caseId});};
    window.addEventListener('keydown',window.__documentStallInputHandler,true);window.addEventListener('keyup',window.__documentStallInputHandler,true);
    if(window.__documentStallMessageHandler)window.removeEventListener('message',window.__documentStallMessageHandler);
    window.__documentStallMessageHandler=e=>{const f=document.querySelector('.artifact-content-pane iframe[title="HTML preview"]');if(e.source!==f?.contentWindow || e.data?.type!=='perf-lab-stall')return;if(window.__documentStall.messages.length<256)window.__documentStall.messages.push({marker:e.data.marker,phase:e.data.phase,atMs:performance.now()});};
    window.addEventListener('message',window.__documentStallMessageHandler);return true;
  })()`);
}
export function viewerProofSource(f) {
  return `(() => {const p=window.__perfArt.contentPane();if(!p)return null;const marker=${JSON.stringify(f.marker)};
    const table=p.querySelector('table');const doc=p.querySelector('.doc-html');const frame=p.querySelector('iframe[title="HTML preview"]');
    const grid=${JSON.stringify(f.kind.startsWith('csv-')||f.kind.startsWith('xlsx-'))};
    const correct=grid ? !!table && [...table.querySelectorAll('td')].some(td=>td.textContent===marker) : ${JSON.stringify(f.kind.startsWith('docx-'))} ? !!doc && doc.textContent.includes(marker) : false;
    return {correctResult:correct,viewer:grid?(table?'sheet-grid':null):doc?'docx-rendered':frame?'html-frame':null,
      marker:correct?marker:null,docPath:p.querySelector('[data-doc-path]')?.getAttribute('data-doc-path')??null,
      frame:!!frame,scriptMessages:window.__documentStall.messages.filter(m=>m.marker===marker)};})()`;
}
export async function readActiveHtmlFrame(browser,f) {
  for(const context of browser.contexts())for(const page of context.pages()){
    if(!page.url().startsWith('file://') || page.url().includes('mode='))continue;
    // WHY: thumbnail frames may contain the SAME marker as the selected file.
    // Obtain the frame from the exact active-pane element, never scan all frames.
    const element=await page.$('.artifact-content-pane iframe[title="HTML preview"]');
    if(!element)continue;
    try{
      const frame=await element.contentFrame();if(!frame)continue;
      const actual=await frame.evaluate(({marker,images})=>{const h=document.querySelector('h1');const imgs=[...document.images];return h?.textContent===marker && (images===undefined || imgs.length===images && imgs.every(i=>i.complete&&i.naturalWidth>0));},{marker:f.marker,images:f.shape.images});
      if(actual)return {frameUrl:frame.url(),imagesDecoded:f.shape.images??null};
    }finally{await element.dispose();}
  }
  return null;
}

// WHY these two sources (lane F): the app's "Load the whole file" bar (PartialFileBanner) and the sheet viewer's "Large sheet" note are
// the only DOM facts that distinguish "first 3 MiB read" from "whole file read". Both are looked up inside the active content pane only.
export const CSV_FULLREAD_STATE_SOURCE = `(() => {const p=window.__perfArt.contentPane();if(!p)return null;
  const root=p.closest('.relative')??p.parentElement??p;
  const bar=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()==='Load the whole file')??null;
  const note=/Large sheet/.test(p.textContent);
  return {banner:!!bar,note,hasTable:!!p.querySelector('table')};})()`;
export const CSV_FULLREAD_CLICK_SOURCE = `(() => {const p=window.__perfArt.contentPane();const root=p?.closest('.relative')??p?.parentElement??p;
  const hits=[...(root?.querySelectorAll('button')??[])].filter(b=>b.textContent.trim()==='Load the whole file');
  if(hits.length!==1||hits[0].disabled)return {ok:false,reason:'Expected exactly one enabled "Load the whole file" button, found '+hits.length};
  hits[0].click();return {ok:true};})()`;
// WHY the user bubble scan: a user message in the transcript is rendered by UserMessage (bg-accent .user-bubble) with every detected path as a
// FilepathToken <button data-file-path>. The marker is part of every generated path, so it identifies OUR message among earlier ones.
export function pathListStateSource(marker, lastPath) {
  // WHY the pill attribute and not the bubble text: FilepathToken draws only the file NAME inside the pill ("file-00999.txt") and keeps the
  // full path in data-file-path (and a tooltip). The old check looked for the full last path and the marker in textContent, which can
  // never be there once the pills are drawn, so every path-list rung "failed readiness" while the app had rendered every pill.
  // textContent stays as a fallback for a candidate that prints the raw text.
  // The scan is deliberately cheap (first pill + last pill, not a map over all of them): it polls every 25 ms inside the measured
  // window, and a 20000-pill list must not be slowed by the instrument watching it.
  return `(() => {const bubbles=[...document.querySelectorAll('.user-bubble')].filter(b=>!b.closest('[aria-hidden="true"]'));
  const attr=t=>(t&&t.getAttribute('data-file-path'))||'';
  const m=bubbles.find(b=>attr(b.querySelector('[data-file-path]')).includes(${JSON.stringify(marker)})||b.textContent.includes(${JSON.stringify(marker)}));if(!m)return null;
  const toks=m.querySelectorAll('[data-file-path]'),n=toks.length;
  const hasLastPath=(n>0&&attr(toks[n-1])===${JSON.stringify(lastPath)})||m.textContent.includes(${JSON.stringify(lastPath)});
  return {tokens:n,hasLastPath,textLength:hasLastPath?m.textContent.length:null};})()`;
}
/** One user line in the Claude Code transcript shape the app's TranscriptWatcher reads (same fields as fixture.mjs transcriptLines). */
export function pathListTranscriptLine({ sessionId, cwd, text, now = new Date() }) {
  return JSON.stringify({ type: 'user', uuid: randomUUID(), parentUuid: null, promptId: randomUUID(), isMeta: false, sessionId, cwd,
    version: '2.1.229', gitBranch: '', userType: 'external', timestamp: now.toISOString(), message: { role: 'user', content: text } });
}
/** The newest transcript file the fake Claude created for `cwd` under the fixture HOME (its session id is the file stem). */
export function findSessionTranscript(home, cwd, { readdir = readdirSync, stat = statSync } = {}) {
  const dir = join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  const files = readdir(dir).filter(n => n.endsWith('.jsonl')).map(n => ({ n, t: stat(join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!files.length) throw Error('No fake-Claude transcript file exists yet for the private session');
  return { path: join(dir, files[0].n), sessionId: files[0].n.replace(/\.jsonl$/, '') };
}

async function waitUntil(fn,{timeoutMs=10000}={}) {
  const start=performance.now();let last;
  while(performance.now()-start<timeoutMs){last=await fn();if(last)return last;await sleep(25);}
  throw Error(`Readiness not proved within ${timeoutMs} ms; last=${JSON.stringify(last)}`);
}
async function closePrevious(cdp) {
  // WHY: an Escape while focus is in chat closes the drawer in one step. Prove
  // the old viewer unmounted before reopening; repeated same-file clicks aren't work.
  for(let layer=0;layer<5 && await cdp.evaluate(`!!window.__perfArt.contentPane()`);layer++){
    // Focus an existing drawer button so Escape peels its list/active layers,
    // rather than closing a chat-focused drawer with a retained selection.
    await cdp.evaluate(`window.__perfArt.pane()?.querySelector('button')?.focus()`);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await cdp.evaluate(`window.__perfArt.nextFrame2()`);
  }
  await waitUntil(()=>cdp.evaluate(`!window.__perfArt.contentPane()`));
  if(!await cdp.evaluate(`window.__perfArt.drawerOpen()`)){
    const open=await cdp.evaluate(`window.__perfArt.clickTitle('Session files')`);if(!open?.ok)throw Error(open?.reason??'Session Files unavailable');
  }
  return true;
}
export async function drainDocumentIpc(cdp) {
  // WHY: stopping on a timer boundary can freeze a just-sent, healthy ping as
  // pending forever. Observe idle and stop in the SAME renderer task after its
  // reply, under the enclosing external watchdog; missing replies never pass.
  return cdp.evaluate(`(async () => {
    const p=window.__ipcStall;if(!p)throw Error('IPC probe missing at drain');
    while(true){if(p.openStallMs()===null){p.stop();return true;}await new Promise(r=>setTimeout(r,1));}
  })()`);
}

export async function measureDocumentCase(app,sessionId,id,action,{signal,_deps={}}={}) {
  const cdp=app.cdp;
  if(!app.mainLoop?.owner)throw Error('Independent owned main-loop facade unavailable');
  const d={installReceipt:installDocumentReceipt,installFrame:installProbe,installIpc:installIpcStallProbe,installLoop:installLoopProbe,readLoop:readLoopProbe,drainIpc:drainDocumentIpc,stopFrame:stopProbe,readIpc:readIpcStallProbe,readFrame:readProbe,exchange:exchangeDocumentClock,startTrain:startDocumentInputTrain,now:()=>performance.now(),..._deps};
  let train,rendererToken,primary,mainStopped=false;const result={};
  const resources=[];
  try{
    // Register removers BEFORE acquisition: a rejected CDP response can still
    // have installed the resource in the owned process.
    resources.push(['receipt',()=>cdp.evaluate(`(() => {window.removeEventListener('keydown',window.__documentStallInputHandler,true);window.removeEventListener('keyup',window.__documentStallInputHandler,true);window.removeEventListener('message',window.__documentStallMessageHandler);return true;})()`)]);
    await d.installReceipt(cdp,id,sessionId);
    resources.push(['frame',()=>d.stopFrame(cdp)]);await d.installFrame(cdp);
    resources.push(['IPC',()=>cdp.evaluate(`(() => {window.__ipcStall?.stop();return true;})()`)]);await d.installIpc(cdp,{everyMs:20});
    resources.push(['renderer loop',()=>d.readLoop(cdp,'renderer',{token:rendererToken?.token,stop:true})]);rendererToken=await d.installLoop(cdp,{kind:'renderer'});
    resources.push(['main loop',()=>mainStopped?undefined:app.mainLoop.read({stop:true})]);await app.mainLoop.start();
    const exchanges=[await d.exchange(cdp),await d.exchange(cdp)];
    signal?.throwIfAborted();
    train=d.startTrain(cdp);resources.unshift(['input train',()=>train.stop()]);
    const cancel=()=>train.cancel();signal?.addEventListener('abort',cancel,{once:true});
    resources.push(['watchdog listener',()=>signal?.removeEventListener('abort',cancel)]);
    // Input begins before the operation, continues across async file loading,
    // parsing and readiness, and stays active for a bounded tail afterwards.
    const actionStartMs=d.now(),proof=await action(),actionEndMs=d.now();
    Object.assign(result,{operationMs:actionEndMs-actionStartMs,proof});
    signal?.throwIfAborted();
    await cdp.evaluate(`new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(r)),120))`);
    await train.stop();
    exchanges.push(await d.exchange(cdp),await d.exchange(cdp));
    result.renderer=await d.readLoop(cdp,'renderer',{token:rendererToken.token,stop:true,waitForSample:true});
    result.main=await app.mainLoop.read({stop:true,waitForSample:true});mainStopped=true;
    await d.drainIpc(cdp);await d.stopFrame(cdp);
    result.ipc=await d.readIpc(cdp);result.frame=await d.readFrame(cdp);
    const receipt=await cdp.evaluate(`({receipts:window.__documentStall.receipts,overflow:window.__documentStall.overflow})`);
    result.id=id;
    result.input=summariseDocumentInput(train.snapshot(),receipt,alignDocumentClocks(exchanges),{actionStartMs,actionEndMs,caseId:id});
  }catch(error){
    primary=error instanceof Error?error:Error(String(error));
    // WHY: failed readiness can leave an app-side async load/parse still alive.
    // Stop this owned boot after cleanup; never let it land in the next case.
    primary.fatal=true;
  }
  finally{
    train?.cancel();
    const errors=await cleanupDocumentResources(resources);
    if(errors.length){primary??=Error('Measurement cleanup failed');primary.cleanupErrors=errors;primary.fatal=true;}
  }
  if(primary){
    primary.evidence={...result,input:result.input??(train?{...train.snapshot(),complete:false,reasons:['Measurement failed before complete receipt/clock readout']}:null),cleanupErrors:primary.cleanupErrors};
    throw primary;
  }
  return result;
}

/**
 * Every calibration criterion that FAILED, with the value seen. Empty = the instrument proved it can see a stall and stays quiet when
 * nothing stalls. WHY a list (lane F): the lane used to throw "Calibration controls invalid" with no clue which of ~20 conditions
 * failed, so a busy-machine refusal could not be told apart from a broken instrument. The thresholds themselves are unchanged.
 */
export function explainDocumentCalibration(rows) {
  if(!Array.isArray(rows)||rows.length!==DOCUMENT_CONTROL_TYPES.length || !DOCUMENT_CONTROL_TYPES.every(t=>rows.filter(r=>r?.id===`control-${t}`).length===1))
    return [`controls incomplete: have [${(Array.isArray(rows)?rows:[]).map(r=>r?.id).join(', ')}], need ${DOCUMENT_CONTROL_TYPES.length} (${DOCUMENT_CONTROL_TYPES.join(', ')})`];
  const bad=rows.filter(r=>!(r.id===`control-${r.proof?.control}`&&r.status==='measured'&&assessViewerEvidence(r).status==='measured'));
  if(bad.length)return bad.map(r=>`${r.id} did not produce valid evidence (status ${r.status}${r.error?`: ${String(r.error).split('\n')[0].slice(0,120)}`:''})`);
  const by=Object.fromEntries(rows.map(r=>[r.proof.control,r]));
  const renderer=by['renderer-block'],main=by['main-block'],slow=by['slow-async'],noop=by.noop,congestion=by['renderer-congestion'];
  const failed=[];
  // Each entry: [what must hold, does it, the number seen]. Main-block input can be delayed by browser/main routing even with a healthy
  // renderer, so fast input is not required as the main-block negative control.
  for(const [name,ok,seen] of [
    ['renderer-block: renderer long task >= 250 ms',renderer.renderer.maxDelayMs>=250,renderer.renderer.maxDelayMs],
    ['renderer-block: main stall < 100 ms',renderer.main.maxDelayMs<100,renderer.main.maxDelayMs],
    ['renderer-block: operation >= 550 ms',renderer.operationMs>=550,renderer.operationMs],
    ['renderer-block: typing delay lower bound >= 200 ms',renderer.input.latencyLowerMs>=200,renderer.input.latencyLowerMs],
    ['main-block: main stall >= 250 ms',main.main.maxDelayMs>=250,main.main.maxDelayMs],
    ['main-block: renderer long task < 100 ms',main.renderer.maxDelayMs<100,main.renderer.maxDelayMs],
    ['slow-async: operation >= 350 ms',slow.operationMs>=350,slow.operationMs],
    ['slow-async: renderer long task < 100 ms',slow.renderer.maxDelayMs<100,slow.renderer.maxDelayMs],
    ['slow-async: main stall < 100 ms',slow.main.maxDelayMs<100,slow.main.maxDelayMs],
    ['slow-async: typing delay < 100 ms',slow.input.latencyMs<100,slow.input.latencyMs],
    ['noop: renderer long task < 100 ms',noop.renderer.maxDelayMs<100,noop.renderer.maxDelayMs],
    ['noop: main stall < 100 ms',noop.main.maxDelayMs<100,noop.main.maxDelayMs],
    ['noop: typing delay < 100 ms',noop.input.latencyMs<100,noop.input.latencyMs],
    ['renderer-congestion: main stall < 100 ms',congestion.main.maxDelayMs<100,congestion.main.maxDelayMs],
    ['renderer-congestion: renderer long task < 100 ms',congestion.renderer.maxDelayMs<100,congestion.renderer.maxDelayMs],
    ['renderer-congestion: renderer excess >= 100 ms',congestion.renderer.totalExcessMs>=100,congestion.renderer.totalExcessMs],
    ['renderer-congestion: late keystrokes >= 3',congestion.input.lateInputCount>=3,congestion.input.lateInputCount],
    ['renderer-congestion: summed typing delay lower bound >= 50 ms',congestion.input.totalLatencyLowerMs>=50,congestion.input.totalLatencyLowerMs],
    ['renderer-congestion: short tasks >= 10',congestion.proof.shortTaskCount>=10,congestion.proof.shortTaskCount],
    ['renderer-congestion: short-task busy >= 400 ms',congestion.proof.shortTaskBusyMs>=400,congestion.proof.shortTaskBusyMs],
    ['renderer-congestion: longest short task < 50 ms',congestion.proof.shortTaskMaxMs<50,congestion.proof.shortTaskMaxMs],
  ])if(!ok)failed.push(`${name} (saw ${typeof seen==='number'?Math.round(seen*10)/10:seen})`);
  return failed;
}
export function validateDocumentCalibration(rows) {
  return explainDocumentCalibration(rows).length===0;
}

export async function collectDocumentProvenance(app,checkout,build,{images=false,_deps={}}={}) {
  const d={read:readFileSync,link:readlinkSync,real:realpath,fingerprint:treeFingerprint,..._deps};
  if(!isAbsolute(checkout??'') || !build || !app.mainLoop?.owner)throw Error('Explicit executed checkout, build and main-loop ownership required');
  const root=await d.real(checkout),binary=await d.real(d.link(`/proc/${app.pid}/exe`));
  if(binary!==await d.real(build.binary) || binary!==await d.real(app.mainLoop.owner.binary) || app.mainLoop.owner.pid!==app.pid || !contained(root,binary))throw Error('Executed binary/checkout/owner mismatch');
  const stampFile=join(root,'desktop/release/.perf-lab-build.json'),stampBytes=d.read(stampFile),buildStamp=JSON.parse(stampBytes);
  const current=await d.fingerprint(root);
  for(const key of ['sha','dirty','branch'])if(typeof buildStamp[key]!=='string'||!buildStamp[key] || buildStamp[key]!==current[key] || buildStamp[key]!==build[key])throw Error(`Build stamp/current checkout/runner ${key} mismatch`);
  const labRoot=fileURLToPath(new URL('../../',import.meta.url));
  const files=[...['scenario-document-stalls.mjs','document-input.mjs','probe-loop.mjs','probe-ipc.mjs'].map(f=>join(labRoot,'scripts/perf-lab',f)),...['XlsxView.tsx','CsvView.tsx','DocxView.tsx','HtmlView.tsx'].map(f=>join(root,'desktop/src/renderer/components/artifact-views',f))];
  if(images){files.push(join(labRoot,'scripts/perf-lab/gpu.mjs'),join(labRoot,'scripts/perf-lab/scenario-images.mjs'),join(labRoot,'scripts/perf-lab/stall-fixtures.mjs'),...IMAGE_SOURCE_FILES.map(f=>join(root,f)));}
  return {checkout:root,binary,buildStamp,buildStampFile:stampFile,buildStampSha256:sha(stampBytes),buildVerified:true,currentFingerprint:current,
    sourceHashes:files.map(file=>({file,sha256:sha(d.read(file))})),
    verificationScope:'Executed path + owned main identity + stamp/runner/current source fingerprint; stamp does not attest package byte contents'};
}

/**
 * The row for one finished case. WHY id last: a failed image step carries its STEP id ("<rung>/open-decode") in its evidence, which used to
 * overwrite the rung id and leave the rung with no row at all (a planned rung without a row is a lane bug). The rung id always wins; the
 * step id is kept as `failedStep`.
 */
export function buildCaseRow(base,f,result,{allowBlockedInput=false}={}) {
  const evidence={...result.value,memory:result.memory};
  const verdict=result.status||evidence.imageDiagnostic?null:assessViewerEvidence(evidence,{allowBlockedInput});
  // A row accepted only because typing was provably blocked says so on the row, so nothing downstream reads it as a normal input proof.
  const blocked=verdict?.status==='measured'&&allowBlockedInput&&!inputOk(evidence,evidence.input)?blockedInputEvidence(evidence.input):null;
  return {...base,...evidence,id:f.id,...(evidence.id&&evidence.id!==f.id?{failedStep:evidence.id}:{}),...(blocked?{input:{...evidence.input,blockedBacklog:blocked},standardAcceptance:false}:{}),
    ...(result.status?{status:result.status,error:result.error}:evidence.imageDiagnostic?{status:evidence.imageSteps.every(s=>s.status==='measured')?'measured':'failed',standardAcceptance:false}:verdict)};
}

export async function runDocumentStallCases(app,fixture,manifest,{sessionId,checkout,build,timeoutMs=15000,maxRssMb=1536,memoryBasis=MEMORY_BASIS.rss,calibrationAttempts=1,allowBlockedInput=false,onCase=async()=>{},caseIds,images=false,imageRenderingEvidence,imageSequenceMs=120000,imageGlobalBudgetMs=120000,onImageStep=async()=>{},custom={}}={}) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<100||timeoutMs>60000||!Number.isFinite(maxRssMb)||maxRssMb<128||maxRssMb>4096)throw Error('Invalid document case limits');
  const imageLane=images?requireSoftwareImageLane(imageRenderingEvidence):null;
  if(images&&(timeoutMs>15000||maxRssMb>1536))throw Error('Image diagnostics retain15s/1536MiB caps');
  const imagePolicy=images?imageDeadlinePolicy({stepMs:timeoutMs,sequenceMs:imageSequenceMs,globalBudgetMs:imageGlobalBudgetMs,maxRssMb}):null;
  const imageBudgetStarted=performance.now();
  const selected=validateDocumentManifest(manifest,{images,extraKinds:Object.keys(custom)}).filter(f=>!caseIds||caseIds.includes(f.id));
  const cdp=app.cdp;let ownSession=false,fatal=false,browser;
  const cases=[],controls=[];
  const descriptor={revision:DOCUMENT_ADAPTER_REVISION,scope:'app-viewer',fixtureFilesystem:'caller-provided; tmpfs checks are not disk-I/O claims',
    cachePolicy:'first-viewer-use vs repeat-viewer-use, not OS-disk-cold',limits:{timeoutMs,maxRssMb,memoryBasis},calibrations:controls,
    inputPolicy:'Independent 50 ms F24 train, <=256 keys, <=12 s, <=16 commands; no typing or file mutation; latency bounds include browser/main routing; receipt tokens are FIFO ordinals, not transported identity',
    actionPrecisionMs:DOCUMENT_ACTION_PRECISION_MS,clockCalibrationHorizonMs:DOCUMENT_CLOCK_HORIZON_MS,
    ipcPolicy:'totalStallMs is summed completed roundtrip excess, NOT union elapsed blocking or main-loop attribution',
    mainOwner:app.mainLoop?.owner??null};
  const seen=new Set();
  const emit=async row=>{cases.push(row);await onCase(row);};
  try{
    try{Object.assign(descriptor,await collectDocumentProvenance(app,checkout,build,{images}));
      if(images){descriptor.imageCoverage=imageCoverage;descriptor.imageLane=imageLane;descriptor.imageDeadlinePolicy=imagePolicy;}}
    catch(error){descriptor.provenanceError=error.message;throw error;}
    const setup=await withDocumentWatchdog(app,async()=>{
      await installDocumentHelpers(cdp);
      if(!sessionId){
        const made=await cdp.evaluate(`window.claude.session.create(${JSON.stringify({name:'stall-documents-private',cwd:manifest.root,skipPermissions:true,provider:'claude'})})`);
        if(!made?.id)throw Error('Fake Claude session create returned no id');sessionId=made.id;ownSession=true;
      }
      await waitUntil(()=>cdp.evaluate(`(() => {const p=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(p=>p.dataset.sessionId===${JSON.stringify(sessionId)});p?.click();return !!document.querySelector('[data-chat-session-id="'+${JSON.stringify(sessionId)}+'"]:not([aria-hidden="true"])') && !document.body.textContent.includes('Initializing session');})()`));
      const folder=await cdp.evaluate(`window.claude.folders.add(${JSON.stringify(manifest.root)},'Stall lab private fixtures')`);if(!folder)throw Error('folders.add refused private fixture root');
      const files=Object.fromEntries(selected.filter(f=>f.kind!=='path-list'&&!custom[f.kind]).map(f=>[f.id,{rel:relative(manifest.root,f.file),abs:f.file}]));
      await registerArtifacts(cdp,manifest.root,sessionId,files);
      descriptor.sessionId=sessionId;
      return true;
    },{timeoutMs,maxRssMb,memoryBasis});
    if(setup.status)throw Object.assign(Error(setup.error),{fatal:setup.fatal});
    // WHY attempts (lane F): the negative controls (noop / slow-async must see < 100 ms of delay) can be broken by a foreign program taking
    // the CPU for a moment, which refused every rung of a group although the instrument was fine. Each attempt re-runs ALL five controls
    // and must satisfy every unchanged criterion by itself - a pass is never assembled from rows of different attempts. Callers that
    // want the old single-shot behaviour keep calibrationAttempts=1. Every failed attempt's reasons are kept in the descriptor.
    descriptor.calibrationAttemptLog=[];
    for(let attempt=1;attempt<=calibrationAttempts && !fatal;attempt++){
      controls.length=0;
      for(const type of DOCUMENT_CONTROL_TYPES){
        const id=`control-${type}`;
        const result=await withDocumentWatchdog(app,signal=>measureDocumentCase(app,sessionId,id,async()=>{
          let shortWork={};
          if(type==='renderer-block')await cdp.evaluate(`(async () => {await new Promise(r=>setTimeout(r,200));const t=performance.now();while(performance.now()-t<400){}return true;})()`);
          else if(type==='renderer-congestion')shortWork=await cdp.evaluate(`(async () => {let shortTaskBusyMs=0,shortTaskMaxMs=0;const shortTaskCount=24;for(let i=0;i<shortTaskCount;i++){await new Promise(r=>setTimeout(r,0));const t=performance.now();while(performance.now()-t<30){}const ms=performance.now()-t;shortTaskBusyMs+=ms;shortTaskMaxMs=Math.max(shortTaskMaxMs,ms);}return {shortTaskCount,shortTaskBusyMs,shortTaskMaxMs};})()`);
          else if(type==='main-block')await app.mainLoop.blockForCalibration(400);
          else if(type==='slow-async')await cdp.evaluate(`new Promise(r=>setTimeout(()=>r(true),400))`);
          else await cdp.evaluate('true');
          return {attempted:true,correctTarget:true,correctResult:true,unmountedBefore:true,control:type,...shortWork};
        },{signal}),{timeoutMs,maxRssMb,memoryBasis});
        const evidence={...result.value,memory:result.memory};
        const row={id,kind:'calibration',...evidence,...(result.status?{status:result.status,error:result.error}:assessViewerEvidence(evidence))};
        controls.push(row);await onCase(row);
        if(result.fatal){fatal=true;break;}
      }
      const why=explainDocumentCalibration(controls);
      descriptor.calibrationAttemptLog.push({attempt,valid:why.length===0,failed:why});
      if(!why.length)break;
    }
    descriptor.calibrationValid=validateDocumentCalibration(controls);
    if(!descriptor.calibrationValid)throw Object.assign(Error(`Calibration controls invalid; workload measurements refused (${calibrationAttempts>1?`${descriptor.calibrationAttemptLog.length} of ${calibrationAttempts} attempts: `:''}${(descriptor.calibrationAttemptLog.at(-1)?.failed??[]).join('; ').slice(0,600)||'no control could run'})`),{fatal});
    // Playwright attaches only to the passed owned lab CDP endpoint, never the
    // production app; frame evaluation verifies actual opaque-origin iframe DOM.
    if(selected.some(f=>f.kind.startsWith('html-'))){
      const {chromium}=createRequire(join(checkout,'desktop/package.json'))('playwright-core');
      const connection=await withDocumentWatchdog(app,()=>chromium.connectOverCDP(`http://127.0.0.1:${app.cdpPort}`,{timeout:Math.min(timeoutMs,10000)}),{timeoutMs,maxRssMb,memoryBasis});
      if(connection.status)throw Object.assign(Error(connection.error),{fatal:connection.fatal});
      browser=connection.value;
    }
    for(const f of selected){
      const identity={bytes:f.bytes,sha256:f.sha256,shape:f.shape,assets:f.assets};
      const base={id:f.id,kind:f.kind,fixture:identity,runtime:{mainPid:app.pid,cacheState:seen.has(f.kind)?'repeat-viewer-use':'first-viewer-use'},proof:{attempted:false,correctTarget:false,correctResult:false},operationMs:null};
      if(fatal){await emit({...base,status:'unreviewed',error:'Owned app stopped by previous case'});continue;}
      const imageCase=f.kind.startsWith('image-');let primaryImageFailure=null;
      const remainingImageBudget=images?imageGlobalBudgetMs-(performance.now()-imageBudgetStarted):null;
      if(imageCase&&remainingImageBudget<100){await emit({...base,status:'unreviewed',error:'Caller image global budget exhausted before sequence'});continue;}
      if(imageCase)base.deadlinePolicy={...imagePolicy,actualSequenceMs:Math.min(imagePolicy.sequenceMs,remainingImageBudget),remainingGlobalMs:remainingImageBudget};
      const caseWatchdog=imageCase?(owned,operation)=>guardImageSequence(owned,operation,{policy:{...imagePolicy,sequenceMs:Math.min(imagePolicy.sequenceMs,remainingImageBudget)},watchdog:(target,action,limits)=>withDocumentWatchdog(target,action,{...limits,memoryBasis,priorFatalFailure:()=>primaryImageFailure})}):(owned,operation)=>withDocumentWatchdog(owned,operation,{timeoutMs,maxRssMb,memoryBasis});
      const result=await caseWatchdog(app,async signal=>{
        const path=await realpath(f.file);if(path!==resolve(f.file)||(await stat(path)).size!==f.bytes||sha(await readFile(path))!==f.sha256)throw Error('Fixture identity mismatch before viewer open');
        for(const asset of f.assets??[]){
          const assetPath=await realpath(asset.file);
          if(assetPath!==resolve(asset.file)||(await stat(assetPath)).size!==asset.bytes||sha(await readFile(assetPath))!==asset.sha256)throw Error('HTML asset identity mismatch');
        }
        const unmountedBefore=await closePrevious(cdp);
        if(custom[f.kind]){
          // WHY (lane F): workloads that are not "open a file" (large diff, background indexing) reuse this function's session,
          // calibration, provenance, probes and watchdog by supplying only the action; `proof` must satisfy assessViewerEvidence.
          const hook=custom[f.kind],ctx={f,app,fixture,cdp,manifest,sessionId,signal,unmountedBefore,waitUntil,transcript:()=>findSessionTranscript(fixture.home,manifest.root)};
          // prepare() runs OUTSIDE the measured window (e.g. creating a session to destroy later) so setup is never charged to the app.
          if(typeof hook!=='function'&&hook.prepare)ctx.prepared=await hook.prepare(ctx);
          return await measureDocumentCase(app,sessionId,f.id,()=>(typeof hook==='function'?hook:hook.run)(ctx),{signal});
        }
        if(f.kind==='path-list'){
          // WHY (lane F): the real path-list render path is transcript -> TranscriptWatcher -> reducer -> UserMessage -> detectFilepaths ->
          // one FilepathToken per path. Appending a user line to the private session's own transcript drives exactly that path (the
          // composer's attachment chips are a different, unmeasured path).
          const text=(await readFile(path,'utf8')).trimEnd();const lines=text.split('\n'),lastPath=lines.at(-1);
          const transcript=findSessionTranscript(fixture.home,manifest.root);
          return await measureDocumentCase(app,sessionId,f.id,async()=>{
            appendFileSync(transcript.path,pathListTranscriptLine({sessionId:transcript.sessionId,cwd:manifest.root,text})+'\n');
            const ready=await waitUntil(async()=>{const s=await cdp.evaluate(pathListStateSource(f.marker,lastPath));return s?.hasLastPath&&s.tokens>=lines.length?s:false;},{timeoutMs:25000});   // WHY every pill, 25 s: a half-drawn list must not count as rendered, and 20000 pills legitimately take longer than the 10 s default (still inside the group's 30 s watchdog)
            return {attempted:true,correctTarget:true,correctResult:true,unmountedBefore,viewer:'user-message-path-list',marker:f.marker,pathsExpected:lines.length,pathTokens:ready.tokens,textLength:ready.textLength};
          },{signal});
        }
        await waitUntil(()=>cdp.evaluate(`window.__perfArt.rowNames()?.includes(${JSON.stringify(basename(f.file))})`));
        if(f.kind.startsWith('image-')){
          const open=async()=>{const click=await cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(basename(f.file))})`);if(!click?.ok)throw Error(click?.reason??'Image row click failed');};
          const driver=createImageDriver(cdp,f,sessionId,{open,close:()=>closePrevious(cdp),wait:fn=>waitUntil(fn),signal});
          const smallControl=selected.filter(c=>c.kind.startsWith('image-')&&c.shape.width<=1024&&c.shape.height<=768).sort((a,b)=>a.shape.width*a.shape.height-b.shape.width*b.shape.height)[0];
          if(!smallControl)throw Error('Image diagnostic requires selected small reopen control');
          const controlDriver=createImageDriver(cdp,smallControl,sessionId,{open:async()=>{const controlPath=await realpath(smallControl.file);if(controlPath!==resolve(smallControl.file)||(await stat(controlPath)).size!==smallControl.bytes||sha(await readFile(controlPath))!==smallControl.sha256)throw Error('Small image control identity mismatch');const click=await cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(basename(smallControl.file))})`);if(!click?.ok)throw Error(click?.reason??'Small image control missing');},close:()=>closePrevious(cdp),wait:fn=>waitUntil(fn),signal});
          const steps=await runImageOperations(driver,f,sessionId,{signal,reopenControl:{fixture:smallControl,driver:controlDriver},onStep:onImageStep,measure:async(id,action)=>{
            const memoryBefore=sampleOwnedMemory(app,{basis:memoryBasis});
            const step=await withDocumentWatchdog(app,innerSignal=>measureDocumentCase(app,sessionId,id,action,{signal:AbortSignal.any([signal,innerSignal])}),{timeoutMs,maxRssMb,memoryBasis,onFatalFailure:failure=>{primaryImageFailure={...failure,value:{...failure.value,id,primaryImageFailure:{id,status:failure.status,error:failure.error}}};}});
            const evidence={...step.value,memory:step.memory};const row={id,...evidence,...(step.status?{status:step.status,error:step.error}:assessViewerEvidence(evidence,{allowBlockedInput}))};
            if(!step.status&&row.status==='measured'&&allowBlockedInput&&!inputOk(evidence,evidence.input))row.input={...evidence.input,blockedBacklog:blockedInputEvidence(evidence.input)};
            const memoryAfter=step.fatal?{complete:false,error:'Owned app stopped'}:sampleOwnedMemory(app,{basis:memoryBasis});
            row.memoryBoundary={before:memoryBefore,after:memoryAfter,scope:'Conservative family RSS at operation boundaries; no GPU/cache release or leak proof'};
            if(!step.status&&(!memoryBefore.complete||!memoryAfter.complete)){row.status='failed';row.error='Incomplete image RSS boundary evidence';}
            if(step.fatal){fatal=true;row.fatal=true;}return row;
          }});
          return {imageSteps:steps,proof:steps[0].proof,imageDiagnostic:true,operationMs:null,scope:'image-suboperations; each independently measured, no aggregate input window',visualReview:'not-executed'};
        }
        const evidence=await measureDocumentCase(app,sessionId,f.id,async()=>{
          const actionStartedAt=performance.now();
          const click=await cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(basename(f.file))})`);if(!click?.ok)throw Error(click?.reason??'File row click failed');
          let ready;
          if(f.kind.startsWith('html-')){
            ready=await waitUntil(async()=>{
              const state=await cdp.evaluate(viewerProofSource(f));if(!state?.frame)return false;
              const actual=await readActiveHtmlFrame(browser,f);
              if(!actual || (f.kind==='html-script'&&!state.scriptMessages.some(m=>m.phase==='done')))return false;
              return {...state,...actual,correctResult:true,marker:f.marker};
            });
          }else ready=await waitUntil(async()=>{const s=await cdp.evaluate(viewerProofSource(f));return s?.correctResult?s:false;});
          if(f.kind==='csv-fullread'){
            // Phase 1 (partial view) is already proven by the marker cell; phase 2 is the explicit full read the user asks for.
            const before=await cdp.evaluate(CSV_FULLREAD_STATE_SOURCE);
            if(!before?.banner||before.note)throw Error('Partial-view bar missing (or already truncated) before the full read: '+JSON.stringify(before));
            const openMs=performance.now()-actionStartedAt;
            const click=await cdp.evaluate(CSV_FULLREAD_CLICK_SOURCE);if(!click?.ok)throw Error(click.reason);
            const clickedAt=performance.now();
            const after=await waitUntil(async()=>{const s=await cdp.evaluate(CSV_FULLREAD_STATE_SOURCE);return s&&!s.banner&&s.note&&s.hasTable?s:false;});
            return {...ready,attempted:true,correctTarget:ready.marker===f.marker,correctResult:ready.correctResult,unmountedBefore,fullRead:{openMs,fullReadMs:performance.now()-clickedAt,sizeBytes:f.bytes,evidence:'bar gone and "Large sheet" note appeared (file holds more rows than the 2000 the viewer shows)',before,after}};
          }
          return {...ready,attempted:true,correctTarget:ready.marker===f.marker,correctResult:ready.correctResult,unmountedBefore};
        },{signal});
        return evidence;
      });
      seen.add(f.kind);
      const row=buildCaseRow(base,f,result,{allowBlockedInput});
      if(result.fatal)fatal=true;
      if(f.kind==='html-script')row.htmlIsolation={scriptPhases:row.proof.scriptMessages??null,parentRendererDelayMs:row.renderer?.maxDelayMs??null,parentMainDelayMs:row.main?.maxDelayMs??null,parentInputLatencyMs:row.input?.latencyMs??null,conclusion:'Empirical parent signals only; sandbox is not assumed to imply CPU isolation'};
      await emit(row);
    }
  }catch(error){
    fatal ||= !!error.fatal;descriptor.error=error.stack??String(error);
    for(const f of selected.filter(f=>!cases.some(c=>c.id===f.id)))await emit({id:f.id,kind:f.kind,status:'unreviewed',fixture:{bytes:f.bytes,sha256:f.sha256,shape:f.shape},proof:{attempted:false,correctTarget:false,correctResult:false},operationMs:null,error:descriptor.error});
  }finally{
    // Disconnect only our auxiliary client, never send Browser.close to the
    // caller-owned Chromium. This existing Playwright connection API is pinned
    // by its runtime implementation; fail visibly if the package changes it.
    if(browser){
      if(typeof browser._connection?.close==='function')browser._connection.close();
      else descriptor.cleanupError='Playwright connection-only close unavailable';
    }
    if(!fatal){
      const cleanup=await withDocumentWatchdog(app,async()=>{
        try{await app.mainLoop?.read({stop:true,waitForSample:true});}catch{/* already stopped */}
        await cdp.evaluate(`(() => {window.removeEventListener('keydown',window.__documentStallInputHandler,true);window.removeEventListener('keyup',window.__documentStallInputHandler,true);window.removeEventListener('message',window.__documentStallMessageHandler);return true;})()`);
        if(ownSession)await cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(sessionId)})`);
      },{timeoutMs,maxRssMb,memoryBasis});
      if(cleanup.fatal)fatal=true;if(cleanup.error)descriptor.cleanupError=cleanup.error;
    }
  }
  return {schema:1,scope:'app-viewer',cases,fatal,descriptor};
}
