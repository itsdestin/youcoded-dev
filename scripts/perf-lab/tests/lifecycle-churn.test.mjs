import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { preservedChurnCycle } from './lifecycle-churn-fixture.mjs';
import { checkpointDelta } from '../resource-checkpoint.mjs';
import { summariseCycles,runCycles } from '../short-lifecycle.mjs';
import { SupervisorSession } from '../supervised-launch-core.mjs';
import { OwnedProcesses, readProc } from '../owned-processes.mjs';

const cycle=preservedChurnCycle;

test('actual preserved 8->12 membership churn yields renderer evidence but NOT comparable family PSS or whole-cycle pass',()=>{
 const c=cycle(),d=checkpointDelta(c.checkpoints.before,c.checkpoints.grown);
 assert.equal(d.comparable,false);assert.equal(d.status,'incomplete');
 assert.equal(d.renderer.status,'measured');assert.equal(d.renderer.comparable,true);
 assert.equal(d.metrics.LayoutCount,57);assert.equal(d.metrics.Nodes,125);
 assert.equal(d.pssMb,null);assert.equal(d.family.status,'incomparable');
 assert.deepEqual(d.family.added,[1443765,1443766,1443767,1443829]);assert.deepEqual(d.family.removed,[]);assert.deepEqual(d.family.reused,[]);
 c.resourceDeltas=Object.fromEntries(['grown','switched','released'].map(p=>[p,checkpointDelta(c.checkpoints.before,c.checkpoints[p])]));
 const s=summariseCycles([c]);assert.equal(s.status,'incomplete');assert.equal(s.cycles[0].valid,false);
 assert.equal(s.cycles[0].rendererValid,true);assert.equal(s.cycles[0].familyPssComparable,false);assert.equal(s.cycles[0].continuationSafe,true);
});

test('bounded existing cycle driver continues only complete-renderer/restored-workload churn, never promotes whole-run status',async()=>{
 let ids=['anchor'],sequence=0,clock=1;
 const driver={state:async()=>({ids:[...ids],mounted:ids.length}),create:async()=>{const id='owned-'+(++sequence);ids.push(id);return id;},switchTo:async()=>{},send:async()=>cycle().output[0],close:async id=>{ids=ids.filter(x=>x!==id);},records:async()=>1,
  sample:async phase=>{const sample=structuredClone(cycle().checkpoints[phase]);sample.startedAt=clock++;sample.endedAt=clock++;
   for(const key of ['TaskDuration','ScriptDuration','LayoutCount','RecalcStyleCount','LayoutDuration','RecalcStyleDuration'])sample.metrics[key]+=sequence*100;return sample;}};
 const rows=await runCycles(null,null,{cycles:3,driver,resourceCheckpoints:true});
 assert.equal(rows.length,3);assert.deepEqual(ids,['anchor']);
 const report=summariseCycles(rows);assert.equal(report.status,'incomplete');assert.ok(report.cycles.every(c=>!c.valid&&c.rendererValid&&c.continuationSafe));
 assert.equal(report.trend.Nodes.samples,2);assert.equal(report.trend.pssMb.samples,0);
});

test('missing/nonfinite counters, epoch changes, shared-PID reuse or incomplete sampling never become renderer-valid churn',()=>{
 const c=cycle();
 for(const mutate of [r=>{r.metrics.LayoutCount=null;},r=>{r.identity.documentEpoch='changed';},r=>{r.identity.processStarts['1443467']='reused';},r=>{r.status='incomplete';r.gaps.push('sample failed');}]){
  const after=structuredClone(c.checkpoints.grown);mutate(after);const d=checkpointDelta(c.checkpoints.before,after);
  assert.equal(d.renderer.status,'incomplete');assert.equal(d.pssMb,null);
 }
});

test('membership churn plus missing PSS is not continuation-safe even if renderer counters are individually complete',()=>{
 const c=cycle();c.checkpoints.grown.pss.totalMb=null;
 c.resourceDeltas=Object.fromEntries(['grown','switched','released'].map(p=>[p,checkpointDelta(c.checkpoints.before,c.checkpoints[p])]));
 assert.equal(c.resourceDeltas.grown.status,'incomplete');assert.equal(c.resourceDeltas.grown.family.compositionOnly,false);
 assert.equal(summariseCycles([c]).cycles[0].continuationSafe,false);
});

test('renderer trajectories use post-warmup domain validity while churn invalidates every aggregate PSS retention trend',()=>{
 const rows=[cycle(),cycle(),cycle()];let clock=100;
 for(const [i,c] of rows.entries()){
  c.index=i+1;c.checkpoints=structuredClone(c.checkpoints);
  for(const p of ['before','grown','switched','released']){const s=c.checkpoints[p];s.startedAt=clock++;s.endedAt=clock++;for(const k of ['TaskDuration','ScriptDuration','LayoutCount','RecalcStyleCount','LayoutDuration','RecalcStyleDuration'])s.metrics[k]+=i*100;}
  c.natural=c.checkpoints.released;c.resourceDeltas=Object.fromEntries(['grown','switched','released'].map(p=>[p,checkpointDelta(c.checkpoints.before,c.checkpoints[p])]));
 }
 const report=summariseCycles(rows);assert.equal(report.status,'incomplete');
 assert.equal(report.trend.Nodes.samples,2);assert.equal(report.trend.pssMb.change,null);assert.equal(report.trajectories.natural.pssMb.change,null);
 assert.equal(report.familyPssTrend.status,'incomparable');
});

const stat=(state='S',start='2000')=>`20 (worker) ${[state,'10','20','20',...Array(15).fill('0'),start].join(' ')}`;
test('actual readProc fields retain status-read identity gaps; permission/malformed status and reuse still throw',()=>{
 const table={'/proc/20/stat':stat(),'/proc/20/cmdline':'worker\0','/proc/20/status':'Name:\tworker\nState:\tS (sleeping)\nVmRSS:\t2048 kB\n'};
 const read=p=>{const value=table[p];if(value instanceof Error)throw value;return value;};
 assert.equal(readProc(20,{read}).rssMb,2);
 table['/proc/20/status']='Name:\tworker\nState:\tS (sleeping)\n';
 const missing=readProc(20,{read});assert.equal(missing.rssMb,null);assert.equal(missing.memoryObservation.reason,'VmRSS missing');
 table['/proc/20/status']='not status';assert.throws(()=>readProc(20,{read}),/status/);
 table['/proc/20/status']='Name:\tworker\nState:\tS (sleeping)\nVmRSS:\tnot-a-number kB\n';assert.throws(()=>readProc(20,{read}),/Malformed VmRSS/);
 table['/proc/20/status']=Object.assign(Error('denied'),{code:'EACCES'});assert.throws(()=>readProc(20,{read}),/denied/);
 let reads=0;table['/proc/20/status']='Name:\tworker\nState:\tS (sleeping)\nVmRSS:\t2048 kB\n';
 assert.throws(()=>readProc(20,{read:p=>p.endsWith('/stat')?(++reads>1?stat('S','9999'):stat()):read(p)}),/identity/);
});

function rig(){
 const row=(pid,ppid,extra={})=>({pid,ppid,pgrp:20,session:20,starttime:String(pid*100),state:'S',cmdline:'worker',rssMb:2,...extra});
 const table=new Map([[10,row(10,1,{pgrp:10,session:10})],[20,row(20,10,{cmdline:'/tmp/perf-lab/churn-private/job'})]]);let time=0;const signals=[];
 const f=new OwnedProcesses({leaderPid:20,parentPid:10,jobDir:'/tmp/perf-lab/churn-private',read:pid=>{const r=table.get(pid);if(r instanceof Error)throw r;return r;},list:()=>[...table.keys()],signal:(pid,sig)=>{signals.push([pid,sig]);table.delete(pid);},now:()=>time,sleep:async ms=>{time+=ms;}});f.capture();return {f,table,signals};
}
test('memory sample gap remains historical incomplete but verified later disappearance can confirm ownership cleanup',async()=>{
 const {f,table,signals}=rig();table.get(20).rssMb=null;
 assert.throws(()=>f.sample(),/Missing RSS/);
 table.delete(20);const receipt=await f.cleanup({termWaitMs:10,killWaitMs:10,everyMs:5});
 assert.equal(receipt.cleanupConfirmed,true);assert.equal(receipt.memoryComplete,false);assert.ok(receipt.memoryErrors.some(e=>/Missing RSS/.test(e)));assert.deepEqual(signals,[]);
});
test('composed real tracker memory gap -> supervisor tick -> disappearance cleanup -> actual lifecycle final policy stays incomplete',async()=>{
 const {f,table,signals}=rig();
 const runDir='/tmp/perf-lab/churn-composed',checkout='/isolated/worktree/youcoded',packageRoot=checkout+'/desktop/release/linux-unpacked';
 let clock=0,exited=false;
 const s=new SupervisorSession({revision:1,runDir,binary:packageRoot+'/youcoded',packageReceipt:{revision:1,checkout,packageRoot},home:runDir+'/home',bin:runDir+'/home/bin',userData:runDir+'/home/.config/youcoded',perfLog:runDir+'/home/perf-marks.jsonl',wallMs:60000,maxRssMb:64,cleanupReserveMs:8000,cdpPort:9569,display:':99'},
 {now:()=>clock,persist:()=>{},emit:()=>{}});
 s.state='running';s.family=f;s.gate={child:{pid:20},abort:()=>{},waitClosed:async()=>({exited,closed:exited})};
 // A real OwnedProcesses.sample sees unavailable RSS on the verified identity.
 // Only its identity-verified signal adapter causes disappearance; no prepared
 // cleanup result is substituted for actual bounded tracker cleanup.
 table.get(20).rssMb=null;
 const signal=f.signal;f.signal=(pid,sig)=>{signal(pid,sig);exited=true;};
 await s.tick();
 assert.match(s.receipt.reason,/ownership-uncertain: Missing RSS for 20/);
 assert.equal(s.receipt.cleanupConfirmed,true);assert.equal(s.receipt.memoryComplete,false);
 assert.deepEqual(s.receipt.family.survivors,[]);assert.ok(s.receipt.family.memoryErrors.length);assert.ok(signals.length);
 // Execute the actual report-finalization statements without launching main().
 const source=readFileSync(new URL('../short-lifecycle.mjs',import.meta.url),'utf8');
 const policy=source.match(/if\(report\.supervision\.receipt\.memoryComplete===false\)[^\n]+\n\s*if \(report\.supervision\.receipt\.reason !== 'controller-stop'\)[^\n]+/);
 assert.ok(policy,'actual lifecycle receipt policy must be present');
 const report={status:'measured',supervision:{receipt:s.receipt}};
 runInNewContext(policy[0],{report});
 assert.equal(report.status,'incomplete');assert.match(report.supervision.memoryError,/Historical RSS/);
 assert.equal(report.supervision.stopReason,s.receipt.reason);
});

test('supervisor receipt can confirm observed disappearance without erasing historical memory failure',async()=>{
 const runDir='/tmp/perf-lab/churn-receipt',checkout='/isolated/worktree/youcoded',packageRoot=checkout+'/desktop/release/linux-unpacked';
 const s=new SupervisorSession({revision:1,runDir,binary:packageRoot+'/youcoded',packageReceipt:{revision:1,checkout,packageRoot},home:runDir+'/home',bin:runDir+'/home/bin',userData:runDir+'/home/.config/youcoded',perfLog:runDir+'/home/perf-marks.jsonl',wallMs:60000,maxRssMb:64,cleanupReserveMs:8000,cdpPort:9569,display:':99'},
 {now:()=>0,persist:()=>{},emit:()=>{}});
 s.state='running';s.family={cleanup:async()=>({cleanupConfirmed:true,survivors:[],memoryComplete:false,memoryErrors:['Missing RSS for 20']})};
 s.gate={abort:()=>{},waitClosed:async()=>({exited:true,closed:true})};
 const r=await s.stop('controller-stop');assert.equal(r.cleanupConfirmed,true);assert.equal(r.memoryComplete,false);assert.deepEqual(r.family.memoryErrors,['Missing RSS for 20']);
});

test('actual readProc missing-RSS then verified terminal/gone transition never invents measured memory',()=>{
 let statReads=0;
 const read=p=>{
  if(p.endsWith('/stat')){statReads++;if(statReads>2)throw Object.assign(Error('gone'),{code:'ENOENT'});return stat();}
  if(p.endsWith('/status'))return 'Name:\tworker\nState:\tS (sleeping)\n';
  return 'worker\0';
 };
 const sample=readProc(20,{read});assert.equal(sample.rssMb,null);assert.equal(sample.memoryObservation.status,'incomplete');
 assert.equal(readProc(20,{read}),null);
 const zombie=readProc(20,{read:p=>p.endsWith('/stat')?stat('Z'):p.endsWith('/status')?'Name:\tworker\nState:\tZ (zombie)\n':''});
 assert.equal(zombie.state,'Z');assert.equal(zombie.rssMb,null);assert.equal(zombie.memoryObservation.status,'incomplete');
});

test('genuinely live missing RSS, unreadable identity and reused PID never confirm retirement; errors are not erased',async()=>{
 for(const mode of ['live','permission','reuse']){
  const {f,table,signals}=rig();
  if(mode==='live'){table.get(20).rssMb=null;f.signal=()=>{};}
  if(mode==='permission')table.set(20,Error('denied identity'));
  if(mode==='reuse')table.set(20,{...table.get(20),starttime:'reused'});
  const receipt=await f.cleanup({termWaitMs:10,killWaitMs:10,everyMs:5});assert.equal(receipt.cleanupConfirmed,false);
  if(mode!=='live')assert.deepEqual(signals,[]);
 }
});
