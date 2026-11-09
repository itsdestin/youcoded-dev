// scripts/perf-lab/idle-overhead.mjs — one private packaged-app boot left ALONE, to price a
// background feature (built for the hitch recorder A/B, 2026-10-05).
//   node scripts/perf-lab/idle-overhead.mjs --checkout <abs app worktree> --out <abs json> [--settle 20] [--seconds 120]
// Run it twice with and without an env switch (e.g. YOUCODED_HITCH_LOG=0) and compare cpuPct
// (whole process family, % of ONE core, summed) and the PSS figures. Xvfb :97 (virtual), fixture
// HOME; never touches the live app. A quiet result means only "nothing periodic in this window".
// --energy is parsed strictly but REFUSED before runtime preparation: owned
// app-integrated energy lifecycle is unsupported. Sensor-only CLI is separate.
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { dirname, basename, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnergyObservationOptions } from './energy.mjs';
import { publishReportJson } from './atomic-report.mjs';
// Energy app integration is intentionally refused before runtime imports.
export const IDLE_ENERGY_UNSUPPORTED=Object.freeze({status:'unsupported',lane:'app-integrated-energy',standardAcceptance:false,exitCode:1,reason:'App-integrated --energy unavailable until verified owned lifecycle integration; use the separate sensor-only diagnostic after review. No build or app launch performed.'});
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function parseIdleArgs(argv){
 if(!Array.isArray(argv)||argv.length>64||argv.some(v=>typeof v!=='string'||v.length>2048))throw Error('Argument cap/type invalid');
 const known=new Set(['--checkout','--out','--settle','--seconds','--energy','--energy-interval-ms']),values={},seen=new Set();
 for(let i=0;i<argv.length;i++){
  const key=argv[i];if(!known.has(key)||key.includes('=')||seen.has(key))throw Error(`Unknown/equals/duplicate option ${key}`);seen.add(key);
  if(key==='--energy'){values[key]=true;continue;}
  const value=argv[++i];if(value===undefined||value.startsWith('--')||!value)throw Error(`Missing value for ${key}`);values[key]=value;
 }
 const number=(key,defaultValue,min,max)=>{const raw=values[key]??String(defaultValue);if(!/^\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)<min||Number(raw)>max)throw Error(`Invalid ${key}`);return Number(raw);};
 const seconds=number('--seconds',120,1,120),settle=number('--settle',20,0,120),checkout=values['--checkout']??join(ROOT,'youcoded'),out=values['--out'];
 if(!isAbsolute(checkout)||typeof out!=='string'||!isAbsolute(out)||!/^[-\w]+\.json$/.test(basename(out)))throw Error('Absolute checkout and --out /path/report.json required');
 return {checkout,out,settle,seconds,energy:parseEnergyObservationOptions(argv,seconds)};
}
// Full real controller is injectable/import-safe: offline tests drive this path
// without importing launchers or executing a CLI, browser or sensor preflight.
export async function runIdleDiagnostic(options,deps){
 if(options.energy.enabled)return {...IDLE_ENERGY_UNSUPPORTED};
 const report={status:'incomplete',hitchLogEnv:process.env.YOUCODED_HITCH_LOG??'(unset)',settle:options.settle,seconds:options.seconds,cleanup:{complete:false,errors:[]}};
 const save=()=>deps.save(report);let context;
 try{
  report.loadStart=deps.loadStart();await save();context=await deps.prepare(options,report);await save();await deps.settle(options.settle*1000);
  const counters=deps.startCounters(context);await save();
  await deps.settle(options.seconds*1000);
  Object.assign(report,deps.finishCounters(context,counters));report.status='measured';await save();
 }catch(error){report.status='failed';report.error=String(error.stack??error).slice(0,4096);await save();}
 finally{
  if(context?.app){
   // Ordinary idle retains the existing launcher's returned cleanup handle.
   // No helper may sweep app processes or profile locks. This legacy lane is
   // not certification of a new energy/app lifecycle boundary.
   try{await context.app.kill();report.cleanup.app={status:'completed-existing-launcher-handle'};}
   catch(error){report.cleanup.errors.push(`Existing launcher cleanup: ${error.message}`);}
  }
  try{report.cleanup.display=await deps.stopDisplay(context?.x?.proc);if(report.cleanup.display.complete!==true)report.cleanup.errors.push('Display exit not observed');}catch(error){report.cleanup.errors.push(`Display cleanup: ${error.message}`);}
  report.cleanup.complete=report.cleanup.errors.length===0;
  if(!report.cleanup.complete)report.status='failed';report.exitCode=report.status==='measured'&&report.cleanup.complete?0:1;await save();
 }
 return report;
}
async function runtimeDependencies(options){
 const {buildFixture,assetsReady}=await import('./fixture.mjs');const {startXvfb,launchApp}=await import('./launch.mjs');
 const {cpuSnapshot,cpuPercent,pssMb}=await import('./procs.mjs');const {buildBounded,bounded}=await import('./suspects.mjs');
 const stopDisplay=async proc=>{if(proc)proc.kill('SIGTERM');return {complete:true,scope:'ordinary idle legacy display stop; exit not independently verified'};};
 return {loadStart:()=>readFileSync('/proc/loadavg','utf8').trim(),settle:sleep,stopDisplay,
  save:async report=>publishReportJson(dirname(options.out),basename(options.out,'.json'),report),
  prepare:async(_options,report)=>{
   if(!assetsReady())throw Error('perf-lab assets not cached');const build=await buildBounded(options.checkout,bounded(15));report.build={sha:build.sha,dirty:build.dirty};
   const fixture=buildFixture(mkdtempSync(join(ROOT,'scratch/perf-lab/idle-fixture-')),{fakeProvider:false,log:()=>{}});
   const x=await startXvfb(':97');const allocated={fixture,x};
   try{const app=await launchApp({binary:build.binary,appDir:build.appDir,fixture,display:x.display,cdpPort:9578,refuseExisting:true});allocated.app=app;return allocated;}
   catch(error){const cleanup=await stopDisplay(x.proc);if(!cleanup.complete)error.message+='; Xvfb cleanup unverified';throw error;}
  },
  startCounters:context=>{const family=context.app.family();return {family,c0:cpuSnapshot(family),p0:pssMb(family),t0:performance.now()};},
  finishCounters:(context,{family,c0,p0,t0})=>{
   const cp=cpuPercent(c0,cpuSnapshot(family),(performance.now()-t0)/1000),cpuPctByKind={};
   for(const [pid,pct]of cp.perPid){let kind;try{const m=/--type=([a-z-]+)/.exec(readFileSync(`/proc/${pid}/cmdline`,'latin1'));kind=m?m[1]:'main';}catch{kind='gone';}cpuPctByKind[kind]=Math.round(((cpuPctByKind[kind]??0)+pct)*100)/100;}
   const f=join(context.fixture.userData,'perf','hitches.jsonl');
   return {cpuPct:Math.round(cp.totalPct*100)/100,cpuPctByKind,pssMbStart:p0,pssMbEnd:pssMb(family),loadEnd:readFileSync('/proc/loadavg','utf8').trim(),hitchFile:existsSync(f)?{bytes:readFileSync(f).length,kinds:Object.fromEntries(Object.entries(readFileSync(f,'utf8').trim().split('\n').filter(Boolean).reduce((m,line)=>{const kind=JSON.parse(line).kind;m[kind]=(m[kind]??0)+1;return m;},{})))}:null,
    cpuPolicy:'Legacy procs.mjs CPU/PSS lane, separate from domain sensors; not energy and not upgraded to background-cost accounting here'};
  }};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const options=parseIdleArgs(process.argv.slice(2));if(options.energy.enabled){console.log(JSON.stringify(IDLE_ENERGY_UNSUPPORTED));process.exitCode=1;}else{const report=await runIdleDiagnostic(options,await runtimeDependencies(options));console.log(report.status,options.out);process.exitCode=report.exitCode;}}
 catch(error){console.error(error.message);process.exitCode=2;}
}
