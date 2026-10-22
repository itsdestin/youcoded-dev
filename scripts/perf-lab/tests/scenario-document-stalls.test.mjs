import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessViewerEvidence, validateDocumentManifest, withDocumentWatchdog, viewerProofSource, installDocumentReceipt, installDocumentHelpers, readActiveHtmlFrame, drainDocumentIpc } from '../scenario-document-stalls.mjs';
import { documentEvidence as good, shiftDocumentInput, setDocumentOperation } from './document-evidence-fixture.mjs';
import { blockedInputEvidence } from '../document-input.mjs';
import { sampleOwnedMemory } from '../scenario-document-stalls.mjs';
import { buildCaseRow, validateDocumentCalibration, explainDocumentCalibration, measureDocumentCase, collectDocumentProvenance, MEMORY_BASIS } from '../scenario-document-stalls.mjs';
import vm from 'node:vm';
import { DOCUMENT_CONTROL_TYPES } from '../document-input.mjs';

test('every required delay/frame/IPC/input metric must be finite, complete and stopped',()=>{
  for(const [section,keys] of Object.entries({renderer:['maxDelayMs','maxGapMs','totalExcessMs'],main:['maxDelayMs','maxGapMs','totalExcessMs'],frame:['frameGapMaxMs','framesPerSec'],ipc:['maxMs','totalStallMs','maxTickDelayMs'],input:['latencyMs','latencyLowerMs','latencyUpperMs']})) {
    for(const key of keys)for(const invalid of [undefined,null,NaN,Infinity]){const r=good();r[section][key]=invalid;assert.equal(assessViewerEvidence(r).status,'failed',`${section}.${key}`);}
  }
  for(const change of [r=>r.input.complete=false,r=>r.input.budgetStatus='inconclusive',r=>r.main.stopped=false,r=>r.renderer.truncated=true,r=>r.input.samples.pop(),r=>r.input.skippedSlots=1,r=>r.input.clocks.raw=[],r=>r.input.samples[0].receipt.trusted=false]){const r=good();change(r);assert.equal(assessViewerEvidence(r).status,'failed');}
});

const calibration=()=>DOCUMENT_CONTROL_TYPES.map(type=>{
  const r={...good(`control-${type}`),status:'measured'};r.proof.control=type;
  if(type==='renderer-block'){r.renderer.maxDelayMs=400;setDocumentOperation(r,600);shiftDocumentInput(r,390);}
  if(type==='main-block'){r.main.maxDelayMs=400;setDocumentOperation(r,400);}
  if(type==='slow-async')setDocumentOperation(r,400);
  if(type==='renderer-congestion'){setDocumentOperation(r,800);r.renderer.totalExcessMs=200;r.renderer.maxDelayMs=40;shiftDocumentInput(r,20);r.proof.shortTaskCount=20;r.proof.shortTaskBusyMs=600;r.proof.shortTaskMaxMs=35;}
  return r;
});
test('calibration discriminates opposite loops and requires delayed-block input and sustained short work',()=>{
  assert.equal(validateDocumentCalibration(calibration()),true);
  for(const change of [rs=>rs[1].main.maxDelayMs=400,rs=>rs[2].renderer.maxDelayMs=400,rs=>rs[1].input.latencyLowerMs=0,rs=>rs[4].renderer.totalExcessMs=0,rs=>rs[4].input.lateInputCount=0,rs=>rs.pop()]){const rs=calibration();change(rs);assert.equal(validateDocumentCalibration(rs),false);}
});
test('input belongs to exact case and complete measured action window',()=>{
  const swapped=good();swapped.id='different';assert.equal(assessViewerEvidence(swapped).status,'failed');
  const shortened=good();shortened.operationMs=600;assert.equal(assessViewerEvidence(shortened).status,'failed');
  const rounded=good();rounded.operationMs+=0.0005;assert.equal(assessViewerEvidence(rounded).status,'measured');
  rounded.operationMs+=0.01;assert.equal(assessViewerEvidence(rounded).status,'failed');
  const control=calibration()[1];control.input=good().input;assert.equal(assessViewerEvidence(control).status,'failed');
});

test('measurement requires actual viewer proof, unmount, independent loops, input, frames and complete memory', () => {
  assert.equal(assessViewerEvidence(good()).status, 'measured');
  for (const mutate of [(r)=>r.proof.correctResult=false,(r)=>r.proof.unmountedBefore=false,(r)=>r.main=null,(r)=>r.renderer.sampleCount=0,(r)=>r.input.trusted=false,(r)=>r.input.correctTarget=false,(r)=>r.memory.complete=false,(r)=>r.ipc.openStallMs=99,(r)=>r.ipc.rejectedPings=1,(r)=>r.frame.frames=0]) {
    const r=good(); mutate(r); assert.equal(assessViewerEvidence(r).status,'failed');
  }
  const r=good();r.frame.longtaskMaxMs=0;r.renderer.maxDelayMs=400;assert.equal(assessViewerEvidence(r).status,'measured');
});
test('serialized inert receipt captures ordered trusted tokens, unique active session, and bounded overflow',async()=>{
  const listeners=new Map();let t=100;
  const active={dataset:{chatSessionId:'session'},closest:()=>null};
  const context=vm.createContext({performance:{now:()=>t++},document:{querySelectorAll:()=>[active]},window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:()=>{}}});
  await installDocumentReceipt({evaluate:async code=>vm.runInContext(code,context)},'case','session');
  const key=listeners.get('keydown');let prevented=0;
  key({code:'KeyA',preventDefault:()=>prevented++,stopImmediatePropagation:()=>{}});assert.equal(prevented,0);
  for(let i=0;i<257;i++)key({code:'F24',isTrusted:true,preventDefault:()=>prevented++,stopImmediatePropagation:()=>{}});
  const p=context.window.__documentStall;assert.equal(p.receipts.length,256);assert.equal(p.overflow,1);assert.equal(p.receipts[255].token,255);assert.equal(p.receipts[0].correctTarget,true);
  active.dataset.chatSessionId='foreign';p.receipts=[];
  key({code:'F24',isTrusted:false,preventDefault:()=>{},stopImmediatePropagation:()=>{}});
  assert.equal(p.receipts[0].trusted,false);assert.equal(p.receipts[0].correctTarget,false);
});

test('measurement finally stops all acquired resources on action/read failure and cleanup failure is fatal',async()=>{
  for(const failure of ['action','read','cleanup','install']){
    const stops=[];const app={cdp:{evaluate:async source=>{if(source.includes('removeEventListener'))stops.push('receipt');if(source.includes('__ipcStall?.stop'))stops.push('ipc');return {}; }},mainLoop:{owner:{pid:1},start:async()=>{},read:async()=>{stops.push('main');return {};}}};
    const deps={installReceipt:async()=>{},installFrame:async()=>{if(failure==='install')throw Error('install failed');},installIpc:async()=>{},installLoop:async()=>({token:'t'}),
      stopFrame:async()=>{stops.push('frame');if(failure==='cleanup')throw Error('frame stop failed');},
      readLoop:async()=>{stops.push('renderer');if(failure==='read')throw Error('read failed');return {};},exchange:async()=>({beforeMs:0,rendererMs:0,afterMs:1}),
      startTrain:()=>({cancel:()=>stops.push('cancel'),stop:async()=>stops.push('train'),snapshot:()=>({})}),now:()=>1};
    await assert.rejects(measureDocumentCase(app,'s','c',async()=>{if(failure==='action'||failure==='cleanup')throw Error('action failed');return {};},{_deps:deps}),error=>{
      if(failure==='cleanup'){assert.equal(error.fatal,true);assert.match(error.message,/action failed/);assert.match(error.cleanupErrors[0],/frame stop/);}
      return true;
    });
    assert.ok(stops.includes('receipt'));assert.ok(stops.includes('frame'));
    if(failure!=='install')for(const name of ['train','renderer','ipc','main'])assert.ok(stops.includes(name),`${failure}: ${name}`);
  }
});

test('successful measurement stops the non-idempotent main facade exactly once, including the final case',async()=>{
  const evidence=good();let active=false,reads=0,clock=25,exchangeIndex=0;
  const app={cdp:{evaluate:async source=>source.includes('({receipts:')?{receipts:evidence.input.samples.map(s=>s.receipt),overflow:0}:true},mainLoop:{owner:{pid:17},start:async()=>{active=true;},read:async()=>{assert.equal(active,true,'main facade cannot stop twice');active=false;reads++;return evidence.main;}}};
  const deps={installReceipt:async()=>{},installFrame:async()=>{},installIpc:async()=>{},installLoop:async()=>({token:'t'}),readLoop:async()=>evidence.renderer,drainIpc:async()=>{},stopFrame:async()=>{},readIpc:async()=>evidence.ipc,readFrame:async()=>evidence.frame,
    exchange:async()=>{const t=evidence.input.clocks.raw[exchangeIndex++].beforeMs;return {beforeMs:t,rendererMs:t+100,afterMs:t};},
    startTrain:()=>({snapshot:()=>evidence.input,stop:async()=>{},cancel:()=>{}}),now:()=>{const n=clock;clock+=20;return n;}};
  const result=await measureDocumentCase(app,'session','case',async()=>evidence.proof,{_deps:deps});
  assert.equal(reads,1);assert.equal(active,false);assert.equal(assessViewerEvidence({...result,memory:evidence.memory}).status,'measured');
});

test('provenance hashes app sources from executed checkout and refuses stale/missing stamp or foreign owner',async()=>{
  const checkout='/executed',binary='/executed/desktop/release/linux-unpacked/youcoded';
  const fp={sha:'a'.repeat(40),dirty:'b'.repeat(12),branch:'test'},app={pid:17,mainLoop:{owner:{pid:17,binary}}};
  const reads=[];const deps={real:async p=>p,link:()=>binary,fingerprint:async()=>fp,read:path=>{reads.push(path);return Buffer.from(path.endsWith('.json')?JSON.stringify(fp):path);}};
  const result=await collectDocumentProvenance(app,checkout,{...fp,binary},{_deps:deps});
  assert.equal(result.buildVerified,true);assert.equal(result.sourceHashes.filter(s=>s.file.startsWith('/executed/')).length,4);
  assert.ok(reads.some(p=>p==='/executed/desktop/src/renderer/components/artifact-views/XlsxView.tsx'));
  await assert.rejects(collectDocumentProvenance(app,checkout,{...fp,dirty:'stale',binary},{_deps:deps}),/mismatch/);
  await assert.rejects(collectDocumentProvenance(app,checkout,{...fp,binary},{_deps:{...deps,read:()=>{throw Error('missing stamp');}}}),/missing stamp/);
  await assert.rejects(collectDocumentProvenance({...app,mainLoop:{owner:{pid:99,binary}}},checkout,{...fp,binary},{_deps:deps}),/mismatch/);
});

test('manifest validation enforces containment, identity and bounded fixture counts/sizes',()=>{
  const m={schema:1,root:'/tmp/private-fixtures',cases:[{id:'small',kind:'csv-rows',file:'/tmp/private-fixtures/small.csv',bytes:10,sha256:'a'.repeat(64),marker:'marker',shape:{}}]};
  assert.equal(validateDocumentManifest(m).length,1);
  for(const c of [{file:'/etc/passwd'},{bytes:16777217},{sha256:''}]) assert.throws(()=>validateDocumentManifest({...m,cases:[{...m.cases[0],...c}]}));
});
test('external watchdog kills only supplied owned app, timeout and missing memory fail closed with fake scheduler',async()=>{
  let deadline,tick,kills=0;const app={pid:123,kill:async()=>{kills++;}};
  const deps={setTimeout:(fn)=>{deadline=fn;return 1;},clearTimeout:()=>{},setInterval:(fn)=>{tick=fn;return 2;},clearInterval:()=>{},sample:()=>({complete:true,peakRssMb:10,pids:[123]})};
  const pending=withDocumentWatchdog(app,()=>new Promise(()=>{}),{timeoutMs:100,maxRssMb:100,_deps:deps});deadline();
  const r=await pending;assert.equal(r.status,'timeout');assert.equal(kills,1);
  const mem=withDocumentWatchdog(app,()=>new Promise(()=>{}),{timeoutMs:100,maxRssMb:100,_deps:{...deps,sample:()=>({complete:true,peakRssMb:200,pids:[123]})}});assert.equal((await mem).status,'memory-limit');assert.equal(kills,2);
  const bad=await withDocumentWatchdog(app,async()=>true,{timeoutMs:100,maxRssMb:100,_deps:{...deps,sample:()=>({complete:false,error:'gone'})}});assert.equal(bad.status,'failed');assert.equal(kills,3);
});
test('watchdog aborts independent controller input before waiting for owned-process teardown',async()=>{
  let deadline,entered,aborted=false,killed=false;
  const started=new Promise(r=>entered=r);
  const result=withDocumentWatchdog({kill:async()=>{assert.equal(aborted,true);killed=true;}},signal=>{
    signal.addEventListener('abort',()=>aborted=true);entered();return new Promise(()=>{});
  },{timeoutMs:100,maxRssMb:100,_deps:{setTimeout:fn=>{deadline=fn;return 1;},clearTimeout:()=>{},setInterval:()=>2,clearInterval:()=>{},sample:()=>({complete:true,peakRssMb:1})}});
  await started;deadline();assert.equal((await result).status,'timeout');assert.equal(killed,true);
});

test('IPC stop drains in-flight reply atomically instead of stopping on a newly sent ping',async()=>{
  let source;await drainDocumentIpc({evaluate:async s=>{source=s;return true;}});
  new Function(source);
  assert.ok(source.includes('openStallMs()===null'));
  assert.ok(source.indexOf('openStallMs()===null')<source.indexOf('p.stop()'));
});

test('HTML proof evaluates only the active pane iframe, never an identically-marked thumbnail',async()=>{
  let selector,disposed=0;
  const frame={evaluate:async()=>false,url:()=> 'about:srcdoc'};
  const handle={contentFrame:async()=>frame,dispose:async()=>{disposed++;}};
  const page={url:()=> 'file:///private/index.html',$:async s=>{selector=s;return handle;},frames:()=>{throw Error('must not scan thumbnail frames');}};
  const browser={contexts:()=>[{pages:()=>[page]}]};
  assert.equal(await readActiveHtmlFrame(browser,{marker:'sentinel',shape:{images:1}}),null);
  assert.equal(selector,'.artifact-content-pane iframe[title="HTML preview"]');
  frame.evaluate=async()=>true;
  assert.deepEqual(await readActiveHtmlFrame(browser,{marker:'sentinel',shape:{images:1}}),{frameUrl:'about:srcdoc',imagesDecoded:1});
  assert.equal(disposed,2);
});

test('no-op action is not a successful viewer operation and embedded readiness/receipt source parses',async()=>{
  assert.equal(assessViewerEvidence({}).status,'failed');
  new Function(`return ${viewerProofSource({kind:'xlsx-merge',marker:'sentinel',file:'/tmp/x.xlsx'})}`);
  const sources=[];await installDocumentReceipt({evaluate:async(s)=>{sources.push(s);return true;}},'case','session');
  await installDocumentHelpers({evaluate:async(s)=>{sources.push(s);return true;}});
  for(const s of sources)new Function(s);
  assert.ok(sources.at(-1).includes('span.font-medium.truncate'));
  assert.ok(sources[0].includes('F24'));assert.ok(sources[0].includes('isTrusted'));
});

// ── lane F test-drive fixes ──────────────────────────────────────────────────────────────────────────────────────────────────

test('explainDocumentCalibration names every failed criterion with the value seen; validate is exactly "nothing failed"',()=>{
  assert.deepEqual(explainDocumentCalibration(calibration()),[]);
  const rs=calibration();const by=t=>rs.find(r=>r.proof.control===t);by('slow-async').renderer.maxDelayMs=140;by('noop').main.maxDelayMs=120;
  const why=explainDocumentCalibration(rs);
  assert.equal(validateDocumentCalibration(rs),false);
  assert.ok(why.some(w=>/^slow-async: renderer long task < 100 ms \(saw 140\)$/.test(w)),why.join('|'));
  assert.ok(why.some(w=>/^noop: main stall < 100 ms \(saw 120\)$/.test(w)),why.join('|'));
  assert.match(explainDocumentCalibration(calibration().slice(0,3))[0],/controls incomplete/);
  const broken=calibration();broken[0].status='timeout';broken[0].error='External case deadline';
  assert.match(explainDocumentCalibration(broken)[0],/control-noop did not produce valid evidence \(status timeout/);
});

test('PSS basis: the cap is judged on PSS, both numbers are recorded, and a hit says it is the lab cap with the real peak',async()=>{
  const app={pid:123,kill:async()=>{}};
  const deps={setTimeout:()=>1,clearTimeout:()=>{},setInterval:(fn)=>{queueMicrotask(()=>{});return 2;},clearInterval:()=>{}};
  // 1.4 GiB of double-counted RSS but only 600 MiB real: under the cap, not a memory-limit
  const fine=await withDocumentWatchdog(app,async()=>true,{timeoutMs:100,maxRssMb:1536,memoryBasis:MEMORY_BASIS.pss,_deps:{...deps,sample:()=>({complete:true,peakRssMb:1400,peakPssMb:600,pids:[123]})}});
  assert.equal(fine.status,undefined);assert.equal(fine.memory.peakRssMb,1400);assert.equal(fine.memory.peakPssMb,600);assert.equal(fine.memory.basis,'pss');assert.equal(fine.memory.capMb,1536);
  // the same sample on the default (RSS) basis is over a 1000 cap, exactly as before
  const rss=await withDocumentWatchdog(app,()=>new Promise(()=>{}),{timeoutMs:100,maxRssMb:1000,_deps:{...deps,sample:()=>({complete:true,peakRssMb:1400,pids:[123]})}});
  assert.equal(rss.status,'memory-limit');assert.match(rss.error,/Owned app family RSS exceeds 1000 MiB/);
  const hit=await withDocumentWatchdog(app,()=>new Promise(()=>{}),{timeoutMs:100,maxRssMb:1536,memoryBasis:MEMORY_BASIS.pss,_deps:{...deps,sample:()=>({complete:true,peakRssMb:2900,peakPssMb:1700,pids:[123]})}});
  assert.equal(hit.status,'memory-limit');assert.match(hit.error,/Lab safety cap: owned app family PSS 1700 MiB exceeded the 1536 MiB cap/);assert.equal(hit.memory.peakPssMb,1700);
});

test('buildCaseRow: the rung id always wins over a failed step\'s own id, so a fatal image step still gives its rung a row',()=>{
  const base={id:'image-png-4096x3072',kind:'image-png',proof:{attempted:false}};
  const f={id:'image-png-4096x3072'};
  const killed=buildCaseRow(base,f,{status:'memory-limit',error:'Lab safety cap',value:{id:'image-png-4096x3072/open-decode'},memory:{peakPssMb:1600,capMb:1536},fatal:true});
  assert.equal(killed.id,'image-png-4096x3072');assert.equal(killed.failedStep,'image-png-4096x3072/open-decode');assert.equal(killed.status,'memory-limit');assert.equal(killed.memory.peakPssMb,1600);
  const plain=buildCaseRow(base,f,{status:'timeout',error:'x',value:{},memory:{}});
  assert.equal(plain.id,'image-png-4096x3072');assert.equal('failedStep' in plain,false);
  const imgs=buildCaseRow(base,f,{value:{imageDiagnostic:true,imageSteps:[{status:'measured'},{status:'failed'}]},memory:{}});
  assert.equal(imgs.status,'failed');
});

test('blocked typing: a frozen renderer saturating the key queue is accepted ONLY on opt-in, with a measured floor, and only if nothing else is wrong',()=>{
  const blocked=()=>{const r=good();Object.assign(r.input,{complete:false,reasons:['Missing, skipped, overflowed or exhausted input train'],skippedSlots:7,maxInflight:16,maxOutstanding:16,failed:0,exhausted:false,received:false,trusted:false,correctTarget:false,latencyMs:null,latencyLowerMs:null,latencyUpperMs:null,budgetStatus:'incomplete'});r.input.samples[0].latencyLowerMs=1128;return r;};
  const r=blocked();
  assert.equal(assessViewerEvidence(r).status,'failed','strict reading is unchanged');
  assert.equal(assessViewerEvidence(r,{allowBlockedInput:true}).status,'measured');
  assert.equal(blockedInputEvidence(r.input).lowerBoundMs,1128);
  const row=buildCaseRow({id:r.id},{id:r.id},{value:r,memory:r.memory},{allowBlockedInput:true});
  assert.equal(row.status,'measured');assert.equal(row.input.blockedBacklog.lowerBoundMs,1128);assert.equal(row.standardAcceptance,false);
  assert.equal(buildCaseRow({id:r.id},{id:r.id},{value:r,memory:r.memory}).status,'failed');
  // every other defect keeps the row invalid
  for(const [name,mutate] of Object.entries({
    'a failed send':x=>x.input.failed=1,'receipt overflow':x=>x.input.receiptOverflow=1,'exhausted train':x=>x.input.exhausted=true,
    'queue never saturated':x=>x.input.maxInflight=3,'no skipped slots':x=>x.input.skippedSlots=0,'untrusted receipt':x=>x.input.samples[1].receipt.trusted=false,
    'a second reason':x=>x.input.reasons.push('Clock alignment unavailable/uncertain'),'floor under budget':x=>x.input.samples[0].latencyLowerMs=100,
    'renderer probe not stopped':x=>x.renderer.stopped=false,'memory incomplete':x=>x.memory.complete=false,'wrong case':x=>x.input.caseId='other',
  })){const x=blocked();mutate(x);assert.equal(assessViewerEvidence(x,{allowBlockedInput:true}).status,'failed',name);}
});

test('memory sample: a helper that exited between listing and reading is re-listed, a vanished MAIN or a persistently changing family is still incomplete',()=>{
  const gone=4194000;   // far above any pid this machine hands out; /proc/<gone> does not exist
  let calls=0;
  const app={pid:process.pid,family:()=>(calls++===0?[process.pid,gone]:[process.pid])};
  const s=sampleOwnedMemory(app,{basis:MEMORY_BASIS.pss});
  assert.equal(s.complete,true);assert.equal(calls,2,'family listed again');assert.ok(s.peakPssMb>0&&s.peakPssMb<=s.peakRssMb+1,'PSS of the live process, not above its RSS');
  const always={pid:process.pid,family:()=>[process.pid,gone]};
  const stuck=sampleOwnedMemory(always,{basis:MEMORY_BASIS.rss});
  assert.equal(stuck.complete,false);assert.match(stuck.error,/ENOENT/);
  const mainGone=sampleOwnedMemory({pid:gone,family:()=>[gone]},{basis:MEMORY_BASIS.rss});
  assert.equal(mainGone.complete,false);
});
