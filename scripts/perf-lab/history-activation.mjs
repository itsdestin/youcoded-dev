// First-page latency + complete first-frame DOM, including a click while data is
// still loading. This is not optical presentation or a renderer CPU profile.
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assetsReady,buildFixture} from './fixture.mjs';
import {launchApp,startXvfb} from './launch.mjs';
import {loadPackageStamp,refusePackageProcesses,validateOutputPath} from './gpu-theme.mjs';
import {createOwnedLaunchAttempt} from './presentation-capture.mjs';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function parseActivationOptions(argv,{root=ROOT}={}) {
 const o={maxMinutes:5};const seen=new Set();
 for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1];if(!['--checkout','--app-dir','--out','--display','--mode','--max-minutes'].includes(k)||!v||v.startsWith('--')||seen.has(k))throw Error('invalid option '+k);seen.add(k);o[k.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
 for(const k of ['checkout','appDir','out'])if(!isAbsolute(o[k]??'')||resolve(o[k])!==o[k])throw Error('canonical absolute '+k+' required');
 if(!/^:\d+$/.test(o.display??'')||!['early','arrival'].includes(o.mode)||! /^[1-5]$/.test(String(o.maxMinutes)))throw Error('explicit display, early|arrival mode and max-minutes1..5 required');
 if(o.checkout!==join(root,'youcoded')||![join(root,'youcoded/desktop/release')+sep,join(root,'scratch/perf-lab')+sep].some(prefix=>o.appDir.startsWith(prefix)))throw Error('checkout/package must belong to this isolated session');
 o.maxMinutes=Number(o.maxMinutes);validateOutputPath(o.out,root);return o;
}
export function assessActivation(p) {
 const full=s=>s?.rows===60&&s.markdown===136&&s.chars>80000&&Number.isInteger(s.hash)&&s.hash>0&&Number.isInteger(s.structureHash)&&s.structureHash>0&&s.visible===true&&s.visibility==='visible'&&s.focus===true;
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const ok=!!(p?.supported&&p.overflow===0&&full(p.firstFrame)&&full(p.settled)&&p.firstFrame.hash===p.settled.hash&&p.firstFrame.structureHash===p.settled.structureHash&&
  [p.requestedAt,p.clickAt,p.firstCompleteAt,p.firstFrame.at].every(finite)&&p.firstCompleteAt>=p.requestedAt&&p.firstFrame.at>=p.firstCompleteAt&&
  (p.mode==='early'?p.rowsAtClick===0&&p.clickAt<p.firstCompleteAt:p.mode==='arrival'&&p.rowsAtClick===60&&p.firstCompleteWasHidden===true&&p.clickAt>=p.firstCompleteAt&&p.clickAt<=p.firstFrame.at));
 return {ok,reason:ok?null:'early/arrival condition, full unchanged first-frame content, focus or task observation unconfirmed'};
}
// WHY: identify the new ChatView directly, never by strip/DOM index. One observer
// chooses the real pill; no reducer injection, synthetic rows or hidden geometry.
export function installActivationProbe(anchor,mode) {
 const p={anchor,mode,target:null,requestedAt:performance.now(),tasks:[],overflow:0,supported:false,firstFrame:null,settled:null,clickAt:null};
 const root=()=>[...document.querySelectorAll('[data-chat-session-id]')].find(e=>e.dataset.chatSessionId===p.target);
 const pane=()=>root()?.querySelector('.chat-scroll');
 const choose=id=>{const pill=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(e=>e.dataset.sessionId===id);if(!pill)return false;pill.click();return true;};
 const snap=()=>{const el=pane();if(!el)return null;const rows=[...el.querySelectorAll('.timeline-entry')];let hash=2166136261;
  // Within-run text equality includes existing chrome; a changing row fails closed.
  const text=rows.map(r=>r.textContent??'').join('\n');for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  // WHY: text alone cannot catch delayed rich formatting. Hash the rendered
  // descendants too (not the timeline wrapper's changing in-view class).
  let structureHash=2166136261;const html=rows.map(r=>r.innerHTML).join('\n');for(let i=0;i<html.length;i++)structureHash=Math.imul(structureHash^html.charCodeAt(i),16777619);
  return {at:performance.now(),rows:rows.length,markdown:el.querySelectorAll('.timeline-entry p, .timeline-entry pre, .yc-code-block').length,chars:el.textContent?.length??0,hash:hash>>>0,structureHash:structureHash>>>0,visible:!root().closest('[aria-hidden="true"]'),visibility:document.visibilityState,focus:document.hasFocus()};};
 const record=entries=>{for(const e of entries)if(p.tasks.length<512)p.tasks.push({start:e.startTime,duration:e.duration});else p.overflow++;};
 let observer;try{observer=new PerformanceObserver(list=>record(list.getEntries()));observer.observe({entryTypes:['longtask']});p.supported=true;}catch{}
 let raf=null;
 const clickMeasured=rows=>{p.clickAt=performance.now();p.rowsAtClick=rows;if(!choose(p.target)){p.clickAt=null;delete p.rowsAtClick;}};
 const inspect=()=>{
  if(!p.target){const roots=[...document.querySelectorAll('[data-chat-session-id]')].filter(e=>e.dataset.chatSessionId!==anchor);if(roots.length!==1)return;p.target=roots[0].dataset.chatSessionId;if(mode==='arrival')choose(anchor);}
  const el=pane();if(!el)return;const rows=el.querySelectorAll('.timeline-entry').length;
  if(mode==='early'&&p.clickAt===null&&rows===0)clickMeasured(rows);
  if(p.firstCompleteAt===undefined&&rows===60){p.firstCompleteAt=performance.now();p.firstCompleteWasHidden=!!root().closest('[aria-hidden="true"]');
   if(mode==='arrival')clickMeasured(rows);
   raf=requestAnimationFrame(()=>{p.firstFrame=snap();});
  }
 };
 const mutations=new MutationObserver(inspect);mutations.observe(document.body,{childList:true,subtree:true});
 p.finish=()=>{p.settled=snap();if(observer){record(observer.takeRecords());observer.disconnect();}mutations.disconnect();if(raf!==null)cancelAnimationFrame(raf);return {...p,finish:undefined};};
 window.__historyActivation=p;
}
export async function activationMain(argv=process.argv.slice(2)) {
 const o=parseActivationOptions(argv);const deadline=Date.now()+o.maxMinutes*60000;
 const bound=(promise,label='operation',cap=30000)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('deadline '+label)),Math.max(1,Math.min(cap,deadline-Date.now())));})]).finally(()=>clearTimeout(timer));};
 const report={status:'incomplete',options:o,scope:'private packaged app; first-page availability and complete first-rAF DOM are proxies, not displayed frames'};
 let fixtureRoot,app,attempt,stopped=false;
 try {
  if(!assetsReady())throw Error('cached assets required; no downloads');
  if(realpathSync(o.checkout)!==o.checkout||realpathSync(o.appDir)!==o.appDir)throw Error('isolated package/checkout symlink escape refused');
  report.build=await loadPackageStamp(o);refusePackageProcesses(o.appDir);
  mkdirSync(dirname(o.out),{recursive:true});fixtureRoot=mkdtempSync(join(ROOT,'scratch/perf-lab/history-activation-'));
  writeFileSync(join(fixtureRoot,'owner'),'history-activation',{flag:'wx'});
  const fixture=buildFixture(fixtureRoot,{fakeProvider:true,log:()=>{}});
  if(o.display===':99')await bound(startXvfb(':99'),'private Xvfb',10000);
  attempt=createOwnedLaunchAttempt(()=>launchApp({binary:join(o.appDir,'youcoded'),appDir:o.appDir,fixture,display:o.display,cdpPort:9594,refuseExisting:true}),{timeoutMs:Math.min(90000,deadline-Date.now()),onLateSettled:r=>writeFileSync(o.out+'.late-cleanup.json',JSON.stringify(r),{flag:'wx'})});
  app=await attempt.acquire();const c=app.cdp;
  await bound(c.send('Page.bringToFront'),'private target focus');
  const resume=async t=>bound(c.evaluate(`window.claude.session.create(${JSON.stringify({name:'history-'+t.turns,cwd:t.cwd,skipPermissions:true,resumeSessionId:t.sessionId})})`),'resume',60000);
  const anchor=await resume(fixture.transcripts.small);if(!anchor?.id)throw Error('anchor missing');
  for(let i=0;;i++){const ready=await bound(c.evaluate(`(() => {const root=[...document.querySelectorAll('[data-chat-session-id]')].find(e=>e.dataset.chatSessionId===${JSON.stringify(anchor.id)});const pill=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(e=>e.dataset.sessionId===${JSON.stringify(anchor.id)});pill?.click();return root?.querySelectorAll('.timeline-entry').length===60})()`),'anchor ready');if(ready)break;if(i===149)throw Error('anchor history missing');await sleep(50);}
  await bound(c.evaluate(`(${installActivationProbe.toString()})(${JSON.stringify(anchor.id)},${JSON.stringify(o.mode)})`),'install activation observer');
  const target=await resume(fixture.transcripts.medium);report.targetId=target?.id;
  for(let i=0;;i++){const done=await bound(c.evaluate('!!window.__historyActivation.firstFrame'),'first complete frame');if(done)break;if(i===199)throw Error('no complete first frame');await sleep(40);}
  await sleep(150);report.probe=await bound(c.evaluate('window.__historyActivation.finish()'),'finish observer');
  report.integrity=assessActivation(report.probe);
  if(report.probe.target!==report.targetId)throw Error('target identity mismatch');
  report.timings={requestToCompleteMs:report.probe.firstCompleteAt-report.probe.requestedAt,requestToFirstFrameMs:report.probe.firstFrame.at-report.probe.requestedAt,clickToFirstFrameMs:report.probe.firstFrame.at-report.probe.clickAt};
  const shot=await bound(c.send('Page.captureScreenshot',{format:'png'}),'screenshot');writeFileSync(o.out+'.png',Buffer.from(shot.data,'base64'),{flag:'wx'});
  report.status=report.integrity.ok?'measured':'incomplete';
 }catch(e){report.error=String(e);if(app)try{report.probe=await bound(app.cdp.evaluate('window.__historyActivation?.finish()'),'partial evidence',2000);}catch{}}
 finally {
  try{if(app){await app.kill();stopped=true;}}catch(e){report.cleanupError=String(e);}
  report.appStopped=stopped;report.launchCleanup=attempt?.status??'not-started';
  if(fixtureRoot){if(stopped&&report.status==='measured'&&readFileSync(join(fixtureRoot,'owner'),'utf8')==='history-activation')rmSync(fixtureRoot,{recursive:true,force:true});else report.retainedFixture=fixtureRoot;}
  if(!stopped||report.error||report.cleanupError)report.status='incomplete';
  writeFileSync(o.out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))activationMain().then(r=>{console.log(JSON.stringify({status:r.status,out:r.options.out,error:r.error}));if(r.status!=='measured')process.exitCode=2;},e=>{console.error(e);process.exitCode=2;});
