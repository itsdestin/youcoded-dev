// Private packaged desktop: real Files tab + chokidar subscription, one filesystem producer.
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture } from './fixture.mjs';
import { validateOutputPath } from './gpu-theme.mjs';
import { buildProjectTree, installProjectHelpers, seedProjectsFixture } from './scenario-projects.mjs';
import { launchApp, readCmdline, readPpid, startXvfb } from './launch.mjs';
import { cpuSnapshot, findFamily } from './procs.mjs';
import { installProbe, readProbeWindow, stopProbe } from './scenario-workload.mjs';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const hash=b=>createHash('sha256').update(b).digest('hex');
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function parseOptions(argv,root=ROOT) {
  const o={checkout:join(root,'youcoded'),out:join(root,'scratch/perf-lab/watcher-burst.json'),maxMinutes:5};
  for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1];if(!['--checkout','--app-dir','--out','--max-minutes'].includes(k)||!v||v.startsWith('--'))throw Error(`Invalid option ${k}`);o[k.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
  if(!/^[1-9]\d*$/.test(String(o.maxMinutes))||Number(o.maxMinutes)>10)throw Error('--max-minutes must be integer 1..10');o.maxMinutes=Number(o.maxMinutes);
  for(const k of ['checkout','appDir','out'])if(o[k]!==undefined&&!isAbsolute(o[k]))throw Error(`--${k} must be absolute`);
  return o;
}
export function refuseForeignPackage(appDir,{find=findFamily,read=readCmdline}={}) {
  const pids=find([appDir]).filter(pid=>pid!==process.pid&&read(pid).includes(appDir));
  if(pids.length)throw Error(`package already running (${pids.map(pid=>`${pid} parent=${readPpid(pid)} argv=${read(pid).slice(0,320)}`).join('; ')}); refusing launcher sweep`);
}
// WHY: edits target present records (seeded originals in leg one, new adds in
// leg two); removals target other existing originals, additions are distinct. Each phase has one event per path; the
// final count alone would not reveal a lost delete or an unchanged edit.
export function planBurst(size,priorDeleted=0){
  if(![200,1000].includes(size)||![0,200].includes(priorDeleted)||size+priorDeleted>1600)throw Error('unsupported watcher burst size');
  const entries=buildProjectTree().entries;
  const adds=Array.from({length:size},(_,i)=>({rel:`000-burst-${size}-${String(i).padStart(4,'0')}.ts`,body:`export const burst = ${size * 10000+i};\n`}));
  // The 1,000-file leg edits its own additions: after the 200-file leg only
  // 1,400 originals remain, so 1,000 original edits + 1,000 distinct original
  // removals cannot coexist. Never count an edited-then-removed row as visible.
  const editTargets=priorDeleted?adds:entries.slice(24,24+size);
  const removedRoot=entries[priorDeleted?22:23];
  return {size,adds,edits:editTargets.map((e,i)=>({rel:e.rel,body:`export const watcherEdit = ${size * 10000+i};\n`})),deletes:[removedRoot,...entries.slice(1600-priorDeleted-size+1,1600-priorDeleted)].map(e=>({rel:e.rel}))};
}
export function fixtureProject(root){return join(root,'home','projects','gamma');}
function ownedPath(root,project,rel){
  const allowed=fixtureProject(root);
  if(!existsSync(join(root,'owner'))||readFileSync(join(root,'owner'),'utf8')!=='watcher-burst'||!isAbsolute(project)||!existsSync(project)||(!existsSync(allowed)||realpathSync(project)!==realpathSync(allowed)))throw Error('not an owned fixture project');
  if(typeof rel!=='string'||!rel||rel.split('/').some(s=>!s||s==='.'||s==='..'||s.startsWith('.'))||isAbsolute(rel)||rel.includes('\\'))throw Error('invalid/outside fixture path');
  const target=resolve(project,rel);if(!target.startsWith(realpathSync(project)+sep))throw Error('outside fixture project');
  let parent=dirname(target);while(parent!==project){if(existsSync(parent)&&lstatSync(parent).isSymbolicLink())throw Error('symlink outside fixture project');parent=dirname(parent);}
  if(existsSync(target)&&lstatSync(target).isSymbolicLink())throw Error('symlink outside fixture project');
  return target;
}
export function applyBurst(root,project,plan,phase){
  const items={add:plan.adds,edit:plan.edits,delete:plan.deletes}[phase];if(!Array.isArray(items)||items.length!==plan.size)throw Error('invalid burst manifest');
  // Validate all paths and preconditions before any mutation.
  const paths=items.map(item=>ownedPath(root,project,item.rel));
  if(new Set(paths).size!==paths.length)throw Error('duplicate manifest paths');
  paths.forEach((p,i)=>{if(existsSync(p)===(phase==='add'))throw Error(`${phase} precondition failed: ${items[i].rel} ${phase==='add'?'already exists':'missing'}`);});
  paths.forEach((p,i)=>{if(phase==='delete')unlinkSync(p);else writeFileSync(p,items[i].body);});
  return paths;
}
export function cleanupFixture(root){
  // WHY: buildFixture removes its root on setup, so never remove a path we did
  // not mint and mark ourselves, including a prior run's HOME.
  if(!root||!existsSync(join(root,'owner'))||readFileSync(join(root,'owner'),'utf8')!=='watcher-burst')throw Error('refusing unowned fixture cleanup');
  rmSync(root,{recursive:true,force:true,maxRetries:3});
}
// WHY: equal-sized bursts leave the count unchanged; require a row known to
// exist immediately BEFORE deletion to disappear after the watcher refresh.
export function uiConverged(ui){
  return ui?.mounted===true&&ui.count===1600&&ui.firstChunk===true&&ui.changedRow===true&&ui.removedRow===false&&ui.refreshAfterLastDelete===true;
}
export function checkFullListing(listing,expected){
  const rows=listing?.files;
  const paths=new Set(rows?.map(f=>f.path));
  // With no sidecar, discoveredFileRecord owns the id == relative path contract.
  return {ok:listing?.ok===true,count:rows?.length??null,truncated:listing?.truncated,
    fullExact:listing?.ok===true&&listing.truncated===false&&Array.isArray(rows)&&rows.length===expected.size&&paths.size===expected.size&&rows.every(f=>expected.has(f.path)&&f.id===f.path)};
}
// Never remove private HOME after kill rejects or times out: Electron may still
// hold its files open. The caller reports preservedRoot for manual follow-up.
export async function finishOwnedApp(app,root,{timeoutMs=8000}={}){
  if(!app)return {stopped:true,preservedRoot:null};
  let timer;
  try{
    await Promise.race([app.kill(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('app cleanup timeout')),timeoutMs);})]);
    if(root)cleanupFixture(root);
    return {stopped:true,preservedRoot:null};
  }catch(e){return {stopped:false,preservedRoot:root,error:String(e?.message??e)};}
  finally{clearTimeout(timer);}
}
export function assessBurst(r){
  const reasons=[];const bad=(ok,why)=>{if(!ok)reasons.push(why);};
  bad(!r?.error,r?.error??'workload error');
  bad([200,1000].includes(r?.size),'unsupported/empty workload');
  bad(r?.subscribed===true&&r?.visible===true,'real watcher and Files view not engaged');
  for(const [kind,n] of [['add',r?.size],['edit',r?.size],['remove',r?.size]])bad(r?.events?.[kind]===n,`${kind} notification count differs from manifest`);
  if(r?.expectedEvents){
    // Equal totals can hide a duplicate plus a lost delete. Artifact IDs for
    // discovered files are relative paths (project-watcher.ts:224-225).
    for(const kind of ['add','edit','remove']){
      const got=r.events?.ids?.filter(e=>e.kind===kind).map(e=>e.id);
      bad(Array.isArray(got)&&got.length===r.expectedEvents[kind]?.length&&new Set(got).size===got.length&&r.expectedEvents[kind].every(id=>got.includes(id)),`${kind} event identities lost, duplicated or misrouted`);
    }
  }else bad(false,'expected event identities unavailable');
  bad(r?.disk?.ok===true&&r.disk.count===1600,'disk count/hash differs from manifest');
  bad(r?.list?.ok===true&&r.list.count===1600&&r.list.truncated===false&&r.list.fullExact===true&&r.list.changedRows===r.size&&r.list.addedRows===r.size&&r.list.deletedRows===0,'full list incomplete or stale');
  bad(uiConverged(r?.ui),'subscribed visible Files view did not converge');
  bad(finite(r?.probe?.windowMs)&&r.probe.windowMs>0&&r.probe.longtaskSupported===true&&['longtaskTotalMs','longtaskCount','longtaskMaxMs'].every(k=>finite(r.probe[k])),'renderer long-task probe incomplete');
  bad(r?.ipc?.pings>0&&r.ipc.rejectedPings===0&&r.ipc.openStallMs===null&&finite(r.ipc.maxMs),'end-to-end IPC probe incomplete (not main-only)');
  bad(finite(r?.cpu?.totalSeconds)&&finite(r?.elapsedMs)&&r.elapsedMs>0,'CPU or elapsed unavailable');
  return {...r,status:reasons.length?'incomplete':'measured',reasons};
}
function bounder(minutes){const end=Date.now()+minutes*60000-12000;return(p,label,cap=30000)=>{const ms=Math.min(cap,end-Date.now());if(ms<=0)return Promise.reject(Error(`deadline: ${label}`));let t;return Promise.race([Promise.resolve(p),new Promise((_,reject)=>{t=setTimeout(()=>reject(Error(`timeout: ${label}`)),ms);})]).finally(()=>clearTimeout(t));};}
async function owned(start,close,bound,label,cap=30000){const p=Promise.resolve().then(start);try{return await bound(p,label,cap);}catch(e){p.then(close).catch(()=>{});throw e;}}
async function portFree(port){const server=createServer();try{await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});}finally{if(server.listening)await new Promise(ok=>server.close(ok));}}
async function buildBounded(checkout,bound){const code=`import {buildApp} from ${JSON.stringify(new URL('./build.mjs',import.meta.url).href)};console.log('WATCHER_BUILD='+JSON.stringify(await buildApp(${JSON.stringify(checkout)},{skipIfFresh:true})));`;const child=spawn(process.execPath,['--input-type=module','-e',code],{detached:true,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);const done=new Promise((ok,fail)=>{child.on('error',fail);child.on('close',exit=>{const line=out.split('\n').findLast(s=>s.startsWith('WATCHER_BUILD='));if(exit!==0||!line)fail(Error(`build failed: ${err.slice(-1200)}`));else try{ok(JSON.parse(line.slice(14)));}catch(e){fail(e);}});});try{return await bound(done,'build',240000);}catch(e){if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}await Promise.race([done.catch(()=>{}),sleep(2000)]);throw e;}}
function diskFiles(project){const files=new Map(),stack=[project];while(stack.length){const d=stack.pop();for(const e of readdirSync(d,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=join(d,e.name);if(e.isDirectory())stack.push(p);else if(e.isFile())files.set(relative(project,p).split(sep).join('/'),hash(readFileSync(p)));}}return files;}
function cpuPids(app){return app.family().filter(pid=>{let p=pid;for(let n=0;n<32&&p>1;n++){if(p===app.pid)return true;const next=readPpid(p);if(next===p)break;p=next;}return false;});}
async function waitFor(fn,bound,label,ms=16000){const end=Date.now()+ms;while(Date.now()<end){const v=await bound(fn(),label,10000);if(v)return v;await bound(sleep(100),label);}throw Error(`${label} did not converge`);}
// WHY: CDP's file:// page target appears before React has rendered the header.
// Never classify a not-yet-mounted control as a broken fixture or time the wait as workload.
export async function waitForProjectsHeader(cdp,bound,{timeoutMs=20000,pause=sleep}={}){
 const end=Date.now()+timeoutMs;
 while(Date.now()<end){
  if(await bound(cdp.evaluate('!!document.querySelector(\'button[aria-label="Open Projects"]\')'),'Projects header readiness',3000))return true;
  await bound(pause(100),'Projects header readiness',3000);
 }
 throw Error('Projects header did not mount before readiness deadline');
}
// WHY: startup failures previously cleaned the only private window before its
// DOM could distinguish a slow React mount, a first-run gate and a wrong target.
export async function captureStartupFailure(cdp,report,out,bound){
 try{report.startupDiagnostic=await bound(cdp.evaluate(`(() => ({readyState:document.readyState,url:location.href,title:document.title,buttons:[...document.querySelectorAll('button')].slice(0,30).map(b=>({label:b.getAttribute('aria-label'),text:b.textContent?.trim().slice(0,80)})),body:document.body?.innerText?.slice(0,1200)??'',rootChildren:document.getElementById('root')?.children.length??null}))()`),'startup DOM diagnostic',3000);}catch(e){report.startupDiagnosticError=String(e);}
 try{const shot=await bound(cdp.send('Page.captureScreenshot',{format:'png'}),'startup failure screenshot',3000);report.failureScreenshot=out+'.failure.png';writeFileSync(report.failureScreenshot,Buffer.from(shot.data,'base64'),{flag:'wx',mode:0o600});}catch(e){report.failureScreenshotError=String(e);}
}
async function searchFiles(cdp,name,bound){
  return bound(cdp.evaluate(`(() => {const el=document.querySelector('input[aria-label="Search files"]');if(!el)throw Error('Files search missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(name)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`),'search Files');
}
async function visibleFile(cdp,name){
  return cdp.evaluate(`(() => {const p=window.__perfProj?.pv();return !!p && [...p.querySelectorAll('button.layer-surface.h-44')].some(c=>c.textContent.includes(${JSON.stringify(name)}));})()`);
}
// WHY: FilesTab starts the same watcher asynchronously when it mounts. A second
// watch while its first start is pending gets {ok:false} even though the watch
// later becomes ready. Own exactly one ref before mounting Files, then release
// it once after both bursts (including failed/uncertain subscribe attempts).
export async function withOwnedWatcher(cdp,project,bound,run){
  try{
    const subscribed=await bound(cdp.evaluate(`window.claude.artifacts.watchProject(${JSON.stringify(project)})`),'watcher ready');
    if(subscribed?.ok!==true)throw Error(`real project watcher refused subscription: ${JSON.stringify(subscribed)}`);
    return await run();
  }finally{
    await bound(cdp.evaluate(`window.claude.artifacts.unwatchProject(${JSON.stringify(project)})`),'release owned watcher');
  }
}
async function measure(app,fixture,root,project,plan,expected,bound,hz){
  const cdp=app.cdp,size=plan.size;
  // The FilesTab also holds its own subscription. Never use our prewarmed
  // subscriber as a substitute for proving the actual mounted UI sees changes.
  const visible=await bound(cdp.evaluate(`(() => {const h=window.__perfProj;return h?.filesMounted()&&h.heroName()==='gamma'&&!!document.querySelector('button[aria-label="Files"]');})()`),'visible Files tab');
  if(!visible)throw Error('real fixture Files tab not visible');
  await bound(cdp.evaluate(`(() => {window.__watchBurst={events:[],off:window.claude.artifacts.onChanged(e=>{if(e.projectRoot===${JSON.stringify(project)}&&e.by==='external')window.__watchBurst.events.push({kind:e.kind,id:e.artifactId});})};return true;})()`),'event subscription');
  let row={size,subscribed:true,visible:true,expectedEvents:{add:plan.adds.map(e=>e.rel),edit:plan.edits.map(e=>e.rel),remove:plan.deletes.map(e=>e.rel)}};
  const removedName=plan.deletes[0].rel.split('/').at(-1),editedName=plan.edits[0].rel.split('/').at(-1);
  let firstChunk=false,preDeleteRow=false,refreshAfterLastDelete=false,changedRow=false;
  try{
    const start=cpuSnapshot(cpuPids(app)),started=Date.now();
    await bound(installProbe(cdp),'renderer probe');await bound(installIpcStallProbe(cdp,{everyMs:50}),'IPC probe');
    await bound(cdp.evaluate(`window.__perfProbe.mark('watch:start');true`),'start mark');
    try{
      for(const phase of ['add','edit','delete']){
        if(phase==='delete'){
          // A row seen before deletion must disappear AFTER the final event;
          // an already-absent row is not watcher refresh evidence.
          await searchFiles(cdp,removedName,bound);
          preDeleteRow=await waitFor(()=>visibleFile(cdp,removedName),bound,'pre-delete row visible',12000);
        }
        applyBurst(root,project,plan,phase);
        const kind=phase==='delete'?'remove':phase;
        await waitFor(()=>cdp.evaluate(`window.__watchBurst.events.filter(e=>e.kind===${JSON.stringify(kind)}).length >= ${size}`),bound,`${phase} notifications`,35000);
        if(phase==='add')firstChunk=await waitFor(()=>visibleFile(cdp,plan.adds[0].rel),bound,'watcher-driven first chunk',12000);
      }
      // The FilesTab debounces its refresh by 500ms. Observe the consequence,
      // not the timer: while the same search remains active the pre-delete row
      // must leave the DOM after all remove events arrived.
      refreshAfterLastDelete=await waitFor(async()=>!(await visibleFile(cdp,removedName)),bound,'post-delete UI refresh',16000);
      await searchFiles(cdp,editedName,bound);
      changedRow=await waitFor(()=>visibleFile(cdp,editedName),bound,'edited Files row',12000);
      await bound(cdp.evaluate(`window.__perfProbe.mark('watch:end');true`),'end mark');
    }catch(e){row.error=String(e?.message??e);}
    finally{
      // Even a timeout retains actual push identities and probe samples rather
      // than losing the only evidence when the phase rejects.
      row.events=await cdp.evaluate(`(() => {const a=window.__watchBurst?.events??[];return {add:a.filter(e=>e.kind==='add').length,edit:a.filter(e=>e.kind==='edit').length,remove:a.filter(e=>e.kind==='remove').length,ids:a};})()`).catch(e=>({error:String(e)}));
      row.probe=await readProbeWindow(cdp,'watch:start','watch:end').catch(e=>({error:String(e)}));
      row.ipc=await readIpcStallProbe(cdp).catch(e=>({error:String(e)}));
      await stopIpcStallProbe(cdp).catch(()=>{});await stopProbe(cdp).catch(()=>{});
    }
    const after=cpuSnapshot(cpuPids(app));let ticks=0;for(const [pid,n] of start)if(after.has(pid))ticks+=Math.max(0,after.get(pid)-n);
    row.cpu={totalSeconds:ticks/hz,matchedPids:start.size,coverage:'matched surviving owned PIDs; exited/new PIDs excluded'};row.elapsedMs=Date.now()-started;
    const got=diskFiles(project);row.disk={count:got.size,ok:got.size===expected.size&&[...expected].every(([p,h])=>got.get(p)===h)};
    if(row.error)throw Error(row.error);
    // Listing runs only AFTER the subscribed UI converged; it cannot serve as a
    // manual refresh that masks a stale Files tab.
    const listing=await bound(cdp.evaluate(`window.claude.artifacts.listAllFiles(${JSON.stringify(project)},{force:true})`),'full list');
    const names=new Set(listing?.files?.map(f=>f.path));
    row.list={...checkFullListing(listing,expected),changedRows:plan.edits.filter(e=>names.has(e.rel)).length,deletedRows:plan.deletes.filter(e=>names.has(e.rel)).length,addedRows:plan.adds.filter(e=>names.has(e.rel)).length};
    const current=await bound(cdp.evaluate(`(() => {const h=window.__perfProj;return {mounted:!!h?.filesMounted(),count:Number(String(h?.segCount('Files')).replace(/,/g,''))};})()`),'Files UI status');
    row.ui={...current,firstChunk,changedRow,removedRow:!preDeleteRow||!refreshAfterLastDelete,refreshAfterLastDelete};
    row=assessBurst(row);
    await bound(cdp.evaluate('window.__perfProj.clearSearch()'),'restore folder view');
  }catch(e){row.error??=String(e?.message??e);row=assessBurst(row);}
  finally{await cdp.evaluate(`(() => {window.__watchBurst?.off?.();return true;})()`).catch(()=>{});}
  return row;
}
export async function main(argv=process.argv.slice(2)){
 const opts=parseOptions(argv),bound=bounder(opts.maxMinutes);
 // WHY: guard all private report/screenshot destinations before seeding any
 // fixture or attempting launch; an old or symlinked receipt is never replaced.
 validateOutputPath(opts.out);
 mkdirSync(dirname(opts.out),{recursive:true});const report={status:'incomplete',options:opts,scope:'private packaged Linux desktop, Xvfb, real Files tab and prewarmed chokidar watcher (startup excluded); 200 then 1000 file add/edit/remove (warming and size confounded); no sync, composer typing not covered; IPC ping is end-to-end, not main-only',bursts:[]};let app,x,root,launchAttempted=false;
 try{
  if(!assetsReady())throw Error('assets not cached; no download authorized');if(opts.appDir)refuseForeignPackage(opts.appDir);await bound(portFree(9577),'CDP port preflight',2000);
  const build=opts.appDir?{...JSON.parse(readFileSync(join(dirname(opts.appDir),'.perf-lab-build.json'),'utf8')),appDir:opts.appDir,binary:join(opts.appDir,'youcoded')}:await buildBounded(opts.checkout,bound);
  if(!build.sha||!statSync(build.binary).isFile())throw Error('missing package build stamp or executable');report.build={sha:build.sha,dirty:build.dirty,builtAt:build.builtAt,appDir:build.appDir};refuseForeignPackage(build.appDir);
  const hz=Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}).trim());if(!Number.isSafeInteger(hz)||hz<=0)throw Error('CPU tick rate unavailable');
  root=mkdtempSync(join(ROOT,'scratch/perf-lab/watcher-burst-'));writeFileSync(join(root,'owner'),'watcher-burst');const fixture=buildFixture(root,{log:()=>{}});const seeded=seedProjectsFixture(fixture,{sidecar:null,conversations:0,nestedDirs:0});const project=seeded.root;
  x=await owned(()=>startXvfb(':99'),v=>v.proc?.kill('SIGTERM'),bound,'Xvfb');refuseForeignPackage(build.appDir);await bound(portFree(9577),'CDP port before launch',2000);
  launchAttempted=true;
  app=await owned(()=>launchApp({binary:build.binary,appDir:build.appDir,fixture,display:x.display,cdpPort:9577,refuseExisting:true}),a=>a.kill(),bound,'packaged app',90000);
  const cdp=app.cdp;await bound(cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false}),'viewport');await waitForProjectsHeader(cdp,bound);await bound(installProjectHelpers(cdp),'project helpers');
  await withOwnedWatcher(cdp,project,bound,async()=>{
    const opened=await bound(cdp.evaluate('window.__perfProj.open()'),'open Projects Files view',65000);if(!opened?.ok)throw Error(`fixture Files view did not open: ${JSON.stringify(opened)}`);if(opened.hero!=='gamma'){const switched=await bound(cdp.evaluate(`window.__perfProj.switchTo('gamma')`),'select fixture project',65000);if(!switched?.ok||switched.hero!=='gamma')throw Error(`fixture gamma Files view unavailable: ${JSON.stringify(switched)}`);report.switchToFixture=switched;}report.open=opened;
    const expected=diskFiles(project);if(expected.size!==1600)throw Error(`seed count ${expected.size}, expected 1600`);
    for(const size of [200,1000]){const plan=planBurst(size,size===1000?200:0);for(const e of plan.deletes)expected.delete(e.rel);for(const e of [...plan.adds,...plan.edits])expected.set(e.rel,hash(e.body));report.bursts.push(await bound(measure(app,fixture,root,project,plan,expected,bound,hz),`watcher burst ${size}`,95000));if(report.bursts.at(-1).status!=='measured')break;}
    report.status=report.bursts.length===2&&report.bursts.every(r=>r.status==='measured')?'measured':'incomplete';
    const shot=await bound(cdp.send('Page.captureScreenshot',{format:'png'}),'post-timed Files screenshot');report.screenshot=opts.out+'.png';writeFileSync(report.screenshot,Buffer.from(shot.data,'base64'),{flag:'wx',mode:0o600});
  });
 }catch(e){report.status='incomplete';report.error=String(e?.message??e);if(app)await captureStartupFailure(app.cdp,report,opts.out,(p,label,cap)=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error(`timeout: ${label}`)),cap))]));}finally{
  const stopped=await finishOwnedApp(app,root);
  if(!stopped.stopped){report.status='incomplete';report.cleanupError=stopped.error;report.preservedRoot=stopped.preservedRoot;}
  if(!app&&root){if(launchAttempted){report.preservedRoot=root;report.status='incomplete';report.cleanupError??='launch did not return an owned handle; fixture retained until late app shutdown can be proven';}else try{cleanupFixture(root);}catch(e){report.fixtureCleanupError=String(e);report.status='incomplete';report.preservedRoot=root;}}
  try{x?.proc?.kill('SIGTERM');}catch(e){report.displayCleanupError=String(e);report.status='incomplete';}
  writeFileSync(opts.out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 }return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(r=>{console.log(`watcher-burst: ${r.status} — ${r.options.out}`);if(r.status!=='measured'){console.error(r.error??r.bursts.flatMap(b=>b.reasons).join('; '));process.exitCode=2;}}).catch(e=>{console.error(e);process.exitCode=2;});
