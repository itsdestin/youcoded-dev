// Offline-first native Wayland capability capture. NOT a displayed-FPS parser.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture } from './fixture.mjs';
import { launchApp, validateWaylandSocket } from './launch.mjs';
import { loadPackageStamp, refusePackageProcesses, validateOutputPath } from './gpu-theme.mjs';
import { connect } from './cdp.mjs';
import { readRendererInfo } from './gpu.mjs';
import { parsePresentationLog, summarizePresentationLegs } from './presentation-protocol.mjs';
import { runPresentationWorkload } from './presentation-workload.mjs';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
// WHY: both cc/benchmark and devtools.timeline overflowed the 80k-event
// budget at high refresh. Keep only native feedback and explicit timing marks;
// renderer task/rAF observations are collected separately by the workload.
export const PRESENTATION_TRACE_CATEGORIES='wayland,blink.user_timing';
const CATEGORIES=PRESENTATION_TRACE_CATEGORIES;
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
export function parseCaptureOptions(argv,{root=ROOT}={}) {
  const o={maxMinutes:5,protocolDebug:'on'}, seen=new Set();
  for(let i=0;i<argv.length;i+=2) {
    const k=argv[i],v=argv[i+1];
    if(!['--checkout','--app-dir','--wayland-socket','--out','--max-minutes','--protocol-debug'].includes(k)||!v||v.startsWith('--')||seen.has(k)) throw Error(`invalid option ${k}`);
    seen.add(k);
    o[k.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
  }
  for(const k of ['checkout','appDir','waylandSocket','out']) if(!o[k]||!isAbsolute(o[k])||resolve(o[k])!==o[k]) throw Error(`--${k} requires canonical absolute path`);
  if(!/^[1-5]$/.test(String(o.maxMinutes))) throw Error('--max-minutes must be 1..5');
  if(!['on','off'].includes(o.protocolDebug)) throw Error('--protocol-debug must be on or off');
  o.maxMinutes=Number(o.maxMinutes);
  validateOutputPath(o.out,root);
  for(const suffix of ['.wayland.log','.png','.trace.json','.late-cleanup.json','.json']) {
    try { lstatSync(o.out+suffix); throw Error(`output exists: ${o.out+suffix}`); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  return o;
}

// WHY: protocol lines are an inventory, not a parser: the inherited stderr
// stream cannot prove which process/connection owns an object ID or surface.
export function assessProtocol(raw,{truncated=false,error=null}={}) {
  const bind=/wl_registry[#@]\d+\.bind\([^\n]*"wp_presentation"[^\n]*/g;
  const clock=/wp_presentation[#@]\d+\.clock_id\(/g;
  const requests=/wp_presentation[#@]\d+\.feedback\(/g;
  const presented=[...raw.matchAll(/wp_presentation_feedback[#@]\d+\.presented\([^\n)]*\)/g)];
  const discarded=[...raw.matchAll(/wp_presentation_feedback[#@]\d+\.discarded\(/g)];
  const flagsRaw=presented.map(x=>x[0].match(/,\s*(\d+)\)$/)?.[1]??null);
  const surfaces=[...raw.matchAll(/wl_compositor[#@]\d+\.create_surface\([^\n]*/g)].map(x=>x[0].slice(0,220));
  const xdgLinks=[...raw.matchAll(/xdg_wm_base[#@]\d+\.get_xdg_surface\([^\n]*/g)].map(x=>x[0].slice(0,220));
  const toplevel=[...raw.matchAll(/xdg_surface[#@]\d+\.get_toplevel\([^\n]*/g)].map(x=>x[0].slice(0,220));
  const counts={bindLines:[...raw.matchAll(bind)].length,clockLines:[...raw.matchAll(clock)].length,
    clockRaw:[...raw.matchAll(clock)].map(x=>raw.slice(x.index,x.index+90).split('\n')[0]),
    feedbackRequests:[...raw.matchAll(requests)].length,presentedLines:presented.length,discardedLines:discarded.length,flagsRaw,
    surfaceCreationLines:surfaces,xdgSurfaceLinks:xdgLinks,toplevelLines:toplevel};
  const seen=counts.bindLines && counts.clockLines && counts.feedbackRequests && (counts.presentedLines+counts.discardedLines);
  return {...counts,status:truncated||error?'incomplete':seen?'observed-unattributed':'unsupported',
    reason:truncated||error?'protocol log overflow/error':seen?'shared inherited stderr: no proven PID, connection or owned surface mapping':'bind, clock_id or feedback absent'};
}
export function assessTrace(t) {
  return {status:t?.complete===true && t?.dataLossOccurred===false && t?.truncated===false && !t?.error?'complete':'incomplete',
    complete:t?.complete??false,truncated:t?.truncated??false,dataLossOccurred:t?.dataLossOccurred??null,error:t?.error??null};
}
export function assessCaptureTrace(t) {
  const result=assessTrace(t);
  if(result.status==='complete'&&!t.events?.some(e=>e.name==='StoreFeedback'&&e.cat?.includes('wayland'))) {
    return {...result,status:'incomplete',reason:'Wayland StoreFeedback absent from scoped trace'};
  }
  return result;
}
// WHY: performance.mark emits blink.user_timing instants named by the mark,
// not DevTools TimeStamp events. A pair proves only a bracketing window on the
// renderer's monotonic trace clock; it does NOT establish input-to-photon time.
export function assessLegMarkers(events,legs,{rendererPid}={}) {
  const problems=[],pairs=[];
  const rendererThreads=events.filter(e=>e.ph==='M'&&e.name==='thread_name'&&e.args?.name==='CrRendererMain'&&e.pid===e.tid);
  const known=[...new Set(rendererThreads.map(e=>e.pid))];
  if(rendererPid===undefined) rendererPid=known.length===1?known[0]:null;
  if(!Number.isSafeInteger(rendererPid)||rendererPid<=0) problems.push('unique known renderer main PID unavailable');
  if(!Array.isArray(legs)||!legs.length) problems.push('expected workload legs unavailable');
  for(const leg of legs??[]) {
    const markers={};
    for(const side of ['begin','end']) {
      const name=`presentation-${leg.name}-${side}`;
      const found=events.filter(e=>e.name===name);
      if(found.length!==1) {problems.push(`${name}: expected one marker, found ${found.length}`);continue;}
      const e=found[0];
      if(e.cat!=='blink.user_timing'||e.ph!=='I'||e.pid!==rendererPid||e.tid!==rendererPid||!Number.isSafeInteger(e.ts)||e.ts<0) {
        problems.push(`${name}: wrong category, phase, renderer thread, or timestamp`);continue;
      }
      markers[side]=BigInt(e.ts)*1000n;
      markers[`${side}Index`]=events.indexOf(e);
    }
    if(markers.begin===undefined||markers.end===undefined) continue;
    if(!/^\d+$/.test(leg.startNs??'')||!/^\d+$/.test(leg.endNs??'')) {problems.push(`${leg.name}: Node monotonic bounds missing`);continue;}
    const start=BigInt(leg.startNs),end=BigInt(leg.endNs);
    if(markers.beginIndex>=markers.endIndex) {problems.push(`${leg.name}: marker event order reversed`);continue;}
    if(!(markers.begin<=start&&start<end&&end<=markers.end)) {problems.push(`${leg.name}: marks do not bracket Node monotonic leg`);continue;}
    pairs.push({name:leg.name,pid:rendererPid,tid:rendererPid,beginNs:markers.begin.toString(),endNs:markers.end.toString(),
      beforeStartNs:(start-markers.begin).toString(),afterEndNs:(markers.end-end).toString(),
      interpretation:'microsecond trace marks bracket Node monotonic leg; no presentation-clock or input-to-photon claim'});
  }
  return {status:problems.length?'incomplete':'complete',rendererPid:rendererPid??null,pairs,problems};
}
export function assertCleanupSafe({killed}) { if(!killed) throw Error('retain fixture: owned process exit uncertain'); }
export function protocolCaptureFailure(receipt) {
  return receipt?.error || (receipt?.truncated ? 'stderr capture truncated' : null);
}

// WHY: Promise.race alone discards a late successful launchApp handle. Keep the
// pending promise owned: after a timeout, its eventual handle kills ONLY itself.
// A rejected launchApp has already executed its own startup cleanup; do not sweep
// by package name or signal anything from this helper. `settled` is an offline
// receipt for the late result; the fixture remains retained for review.
export function createOwnedLaunchAttempt(launch, { timeoutMs, onLateSettled = () => {} }) {
  if (typeof launch !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1) throw Error('invalid owned launch attempt');
  let status = 'launching', timedOut = false, resolveSettled;
  const settled = new Promise(resolve => { resolveSettled = resolve; });
  const recordLate = result => {
    status = result.status;
    resolveSettled(result);
    try { onLateSettled(result); } catch(e) { console.error(`late launch cleanup receipt could not be saved: ${e}`); }
  };
  const pending = Promise.resolve().then(launch).then(async handle => {
    if (!timedOut) {
      status = 'acquired';
      resolveSettled({status:'on-time-acquired'});
      return handle;
    }
    let result;
    try {
      await handle.kill();
      result = {status:'late-owned-cleanup-confirmed'};
    } catch(e) {
      result = {status:'late-owned-cleanup-failed',error:String(e)};
    }
    recordLate(result);
    return null;
  }, error => {
    const result = {status:timedOut?'late-launch-rejected':'launch-rejected',error:String(error)};
    if (timedOut) recordLate(result);
    else {status=result.status;resolveSettled(result);}
    if (!timedOut) throw error;
    return null;
  });
  return {
    get status() { return status; },
    settled,
    async acquire() {
      let timer;
      try {
        return await Promise.race([pending,new Promise((_,reject) => {
          timer=setTimeout(() => {timedOut=true;status='pending-cleanup';reject(Error('launch deadline exceeded; awaiting late owned cleanup'));},timeoutMs);
        })]);
      } finally {clearTimeout(timer);}
    },
  };
}

async function waitFor(cdp,expr,label,deadline) {
  while(Date.now()<deadline) {
    const v=await cdp.evaluate(expr);
    if(v) return v;
    await sleep(120);
  }
  throw Error(`${label} not verified before deadline`);
}
export async function browserTrace(port,deadline) {
  const res=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(2500)});
  const version=await res.json();
  if(!version.webSocketDebuggerUrl) throw Error('no owned browser endpoint');
  const cdp=await connect(version.webSocketDebuggerUrl);
  let browserVersion;
  try { browserVersion=await cdp.send('Browser.getVersion'); }
  catch(e) { cdp.close(); throw e; }
  const t={categories:CATEGORIES,events:[],complete:false,truncated:false,dataLossOccurred:null,error:null};
  let finish;
  const done=new Promise(ok=>{finish=ok;});
  cdp.on('Tracing.dataCollected',p=>{for(const e of p.value??[]) {if(t.events.length<80000)t.events.push(e);else t.truncated=true;}});
  cdp.on('Tracing.tracingComplete',p=>{t.complete=!p?.stream;t.dataLossOccurred=p?.dataLossOccurred??null;finish();});
  try {await cdp.send('Tracing.start',{categories:CATEGORIES,options:'record-as-much-as-possible',transferMode:'ReportEvents'});}
  catch(e){cdp.close();throw e;}
  return {version:{endpoint:version,protocol:browserVersion},trace:t,async stop(){
    try {
      const remaining=Math.max(1,Math.min(8000,deadline-Date.now()));
      await Promise.race([cdp.send('Tracing.end'),sleep(remaining).then(()=>{throw Error('trace end timeout');})]);
      await Promise.race([done,sleep(remaining).then(()=>{throw Error('trace completion timeout');})]);
    } catch(e){t.error=String(e);}
    finally{cdp.close();}
    return t;
  }};
}
// WHY: concurrent wheel sends must each clear only their own timeout; a
// shared timer can leave an earlier request unbounded after another settles.
export function boundedUntil(p,deadline) {
  let timer;
  return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('capture deadline exceeded')),Math.max(1,deadline-Date.now()));})]).finally(()=>clearTimeout(timer));
}
export async function capture(options,{root=ROOT}={}) {
  const o=parseCaptureOptions(options,{root});
  validateWaylandSocket(o.waylandSocket);
  const checkout=resolve(root,'youcoded');
  if(o.checkout!==checkout||!lstatSync(o.checkout).isDirectory()) throw Error('checkout must be this isolated session component');
  if(!o.appDir.startsWith(join(checkout,'desktop')+sep)) throw Error('package must be inside this isolated checkout');
  const stamp=await loadPackageStamp(o);
  refusePackageProcesses(o.appDir);
  // WHY: buildFixture otherwise auto-downloads missing engine/model assets.
  if(!assetsReady()) throw Error('fixture assets absent; refusing automatic download');
  const scratch=join(root,'scratch','perf-lab');mkdirSync(scratch,{recursive:true});
  const fixtureRoot=mkdtempSync(join(scratch,'presentation-fixture-'));
  writeFileSync(join(fixtureRoot,'owner'),'presentation-capture',{flag:'wx'});
  let app=null,trace=null,launchAttempt=null,killed=false,report={status:'incomplete',package:stamp,files:{protocol:o.out+'.wayland.log',trace:o.out+'.trace.json',screenshot:o.out+'.png',lateCleanup:o.out+'.late-cleanup.json'},options:o};
  const deadline=Date.now()+o.maxMinutes*60000;
  // Single hard deadline across startup + capture + tracing; no unbounded wait.
  const bounded=p=>boundedUntil(p,deadline);
  try {
    const fixture=buildFixture(fixtureRoot,{fakeProvider:false});
    launchAttempt=createOwnedLaunchAttempt(
      () => launchApp({binary:join(o.appDir,'youcoded'),appDir:o.appDir,fixture,cdpPort:9589,waylandSocket:o.waylandSocket,protocolLog:o.out+'.wayland.log',protocolDebug:o.protocolDebug==='on',refuseExisting:true}),
      {timeoutMs:Math.max(1,deadline-Date.now()),onLateSettled:result=>{
        // WHY: the main report may already say pending; a separate exclusive
        // receipt makes eventual OWN-handle cleanup visible without rewriting it.
        writeFileSync(report.files.lateCleanup,JSON.stringify({result,retainedFixture:fixtureRoot})+'\n',{flag:'wx',mode:0o600});
      }},
    );
    app=await launchAttempt.acquire();
    trace=await bounded(browserTrace(app.cdpPort,deadline));
    report.browser=trace.version;
    // `family()` matches argv needles, not proven parentage; keep that provenance explicit.
    report.target={id:app.target.id,url:app.target.url,title:app.target.title,appPid:app.pid,familyCandidates:app.family()};
    report.gpu=await bounded(readRendererInfo(app.cdpPort,app.cdp));
    await bounded(app.cdp.send('Page.bringToFront'));
    report.viewport=await bounded(app.cdp.evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,screenWidth:screen.width,screenHeight:screen.height,visibility:document.visibilityState,focus:document.hasFocus()})'));
    if(report.viewport.visibility!=='visible'||!report.viewport.focus) throw Error('private window not visible/focused');
    // WHY: keep each completed/failed leg in the report even if the workload
    // throws before returning, so an incomplete capture retains its evidence.
    report.workload={sessions:[],legs:[],workload:'two resumed on-disk conversations; real wheel/pill/viewport events; idle control'};
    await runPresentationWorkload(app.cdp,fixture,bounded,deadline,report.workload);
    const shot=await bounded(app.cdp.send('Page.captureScreenshot',{format:'png'}));
    writeFileSync(report.files.screenshot,Buffer.from(shot.data,'base64'),{flag:'wx',mode:0o600});
  }catch(e){report.error=String(e);}
  finally {
    try {
      if(trace) {const t=await trace.stop();report.trace=o.protocolDebug==='on'?assessCaptureTrace(t):assessTrace(t);
        report.trace.events=t.events.length;
        report.trace.markerPairs=assessLegMarkers(t.events,report.workload?.legs??[]);
        report.trace.storeFeedback=t.events.filter(e=>e.name==='StoreFeedback').map(e=>({pid:e.pid,tid:e.tid,args:e.args})).slice(0,100);
        report.trace.processMetadata=t.events.filter(e=>e.ph==='M'&&['process_name','thread_name'].includes(e.name)).map(e=>({pid:e.pid,tid:e.tid,name:e.name,args:e.args})).slice(0,100);
        writeFileSync(report.files.trace,JSON.stringify({metadata:report.trace,categories:CATEGORIES,eventsComplete:report.trace.status==='complete',traceEvents:t.events}),{flag:'wx',mode:0o600});
      }
    } catch(e) { report.traceError=String(e); }
    // Cleanup must run even when tracing, serialization or output writing fails.
    if(app) {try{await app.kill();killed=true;}catch(e){report.cleanupError=String(e);}}
    report.launchCleanup=launchAttempt?.status??'not-started';
    report.protocolCapture=app?.protocolCapture??null;
    // WHY: WAYLAND_DEBUG=off only disables presentation parsing, not the
    // bounded stderr sink. Its finalized failure/overflow invalidates control.
    report.protocolError=protocolCaptureFailure(report.protocolCapture);
    if(existsSync(report.files.protocol)) {
      const raw=readFileSync(report.files.protocol,'utf8');
      report.protocol= o.protocolDebug==='on' ? assessProtocol(raw,{truncated:app?.protocolCapture?.truncated,error:app?.protocolCapture?.error}) : {status:'disabled-control',reason:'WAYLAND_DEBUG off; do not claim no frames'};
      if(o.protocolDebug==='on') {
        // The raw log remains authoritative; the JSON needs a compact flag mix,
        // not hundreds of repeated string values for every callback.
        const flagCounts={};
        for(const flag of report.protocol.flagsRaw) flagCounts[flag??'unknown']=(flagCounts[flag??'unknown']??0)+1;
        delete report.protocol.flagsRaw;
        report.protocol.flagCounts=flagCounts;
        const parsed=parsePresentationLog(raw,{truncated:app?.protocolCapture?.truncated,error:app?.protocolCapture?.error});
        report.presentation={...parsed, samples:undefined,presented:parsed.samples.length,
          rawFlags:[...new Set(parsed.samples.map(s=>s.flags))],discards:undefined,pending:parsed.pending.length,unresolved:undefined,
          legs:summarizePresentationLegs(parsed,report.workload?.legs??[]),
          scope:'conditional structural window association only: shared stderr has no process/connection ID; no cross-join with trace'};
      }
    }
    const missingLeg=o.protocolDebug==='on'&&report.presentation?.legs?.some(leg=>leg.status==='unsupported');
    report.status=report.error||report.cleanupError||report.protocolError||report.traceError||report.trace?.status!=='complete'||report.trace?.markerPairs?.status!=='complete'||(o.protocolDebug==='on'&&(report.presentation?.status!=='conditional-surface'||missingLeg))?'incomplete':o.protocolDebug==='off'?'control-no-presentation':'conditional-surface-evidence';
    try {
      assertCleanupSafe({killed});
      const owner=join(fixtureRoot,'owner');
      if(readFileSync(owner,'utf8')!=='presentation-capture') throw Error('retain fixture: ownership marker changed');
      rmSync(fixtureRoot,{recursive:true,force:true});
    } catch(e) { report.retainedFixture=fixtureRoot; report.cleanupError??=String(e); report.status='incomplete'; }
    writeFileSync(o.out+'.json',JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  return report;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  capture(process.argv.slice(2)).then(r=>{console.log(JSON.stringify({status:r.status,files:r.files,error:r.error??r.cleanupError??null}));if(!['conditional-surface-evidence','control-no-presentation'].includes(r.status))process.exitCode=1;},e=>{console.error(String(e));process.exitCode=1;});
}
