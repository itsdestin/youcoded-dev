import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planBurst, applyBurst, assessBurst, parseOptions, refuseForeignPackage, cleanupFixture, fixtureProject, uiConverged, checkFullListing, finishOwnedApp, waitForProjectsHeader, captureStartupFailure, withOwnedWatcher } from '../watcher-burst.mjs';
import { validateOutputPath } from '../gpu-theme.mjs';

const fixture = fn => { const root=mkdtempSync(join(tmpdir(),'watcher-test-')); const project=join(root,'home','projects','gamma'); mkdirSync(project,{recursive:true}); writeFileSync(join(root,'owner'),'watcher-burst'); try {return fn({root,project});} finally {rmSync(root,{recursive:true,force:true});} };
test('fixture layout matches buildFixture(root) home and refuses nested/wrong project',()=>fixture(({root,project})=>{
 assert.equal(fixtureProject(root),project);
 assert.notEqual(fixtureProject(root),join(root,'home','home','projects','gamma'));
 const plan=planBurst(200);
 mkdirSync(join(root,'projects','gamma'),{recursive:true});
 assert.throws(()=>applyBurst(root,join(root,'projects','gamma'),plan,'add'),/fixture project/);
}));
test('UI convergence must follow the last delete and debounce, not a stale visible add',()=>{
 const final={mounted:true,count:1600,firstChunk:true,changedRow:true,removedRow:false,refreshAfterLastDelete:true};
 assert.equal(uiConverged(final),true);
 for(const patch of [{count:1400},{removedRow:true},{refreshAfterLastDelete:false},{firstChunk:false},{mounted:false}])assert.equal(uiConverged({...final,...patch}),false);
});
test('full list verifies every discovered path and ID, rejecting duplicates or wrong IDs',()=>{
 const expected=new Map([['a.ts','hash-a'],['b.ts','hash-b']]);
 assert.equal(checkFullListing({ok:true,truncated:false,files:[{path:'a.ts',id:'a.ts'},{path:'b.ts',id:'b.ts'}]},expected).fullExact,true);
 for(const files of [[{path:'a.ts',id:'wrong'},{path:'b.ts',id:'b.ts'}],[{path:'a.ts',id:'a.ts'},{path:'a.ts',id:'a.ts'}],[{path:'a.ts',id:'a.ts'}]])assert.equal(checkFullListing({ok:true,truncated:false,files},expected).fullExact,false);
});
test('app kill rejection or timeout preserves owned HOME; only confirmed stop cleans',async()=>{
 for(const kill of [()=>Promise.reject(Error('failed')),()=>new Promise(()=>{})]){
  const root=mkdtempSync(join(tmpdir(),'watcher-keep-'));writeFileSync(join(root,'owner'),'watcher-burst');
  try{const r=await finishOwnedApp({kill},root,{timeoutMs:20});assert.equal(r.stopped,false);assert.equal(r.preservedRoot,root);assert.equal(existsSync(root),true);}finally{rmSync(root,{recursive:true,force:true});}
 }
 const root=mkdtempSync(join(tmpdir(),'watcher-stop-'));writeFileSync(join(root,'owner'),'watcher-burst');
 const result=await finishOwnedApp({kill:async()=>{}},root,{timeoutMs:20});assert.equal(result.stopped,true);assert.equal(existsSync(root),false);
});
test('manifest produces unique deterministic adds, edits and deletes, owned paths only',()=>fixture(({root,project})=>{
  const plan=planBurst(200); for (const item of [...plan.edits,...plan.deletes]) {mkdirSync(join(project,item.rel,'..'),{recursive:true});writeFileSync(join(project,item.rel),'original');} assert.equal(plan.adds.length,200); assert.equal(new Set(plan.adds.map(x=>x.rel)).size,200);
  assert.equal(plan.edits.length,200); assert.equal(plan.deletes.length,200);
  assert.deepEqual(plan,planBurst(200));
  assert.throws(()=>applyBurst(root,join(root,'projects','other'),plan,'add'),/fixture project/);
  assert.throws(()=>applyBurst(root,project,{...plan,adds:[{rel:'../escape.ts',body:'x'}]},'add'),/outside|invalid/);
  assert.equal(applyBurst(root,project,plan,'add').length,200);
  assert.equal(applyBurst(root,project,plan,'edit').length,200);
  assert.equal(readFileSync(join(project,plan.edits[0].rel),'utf8'),plan.edits[0].body);
  assert.equal(applyBurst(root,project,plan,'delete').length,200);
  assert.throws(()=>applyBurst(root,project,plan,'delete'),/missing/);
}));
test('unengaged watcher, lost delete, wrong contents, incomplete listing or UI cannot pass',()=>{
  const expectedEvents=Object.fromEntries(['add','edit','remove'].map(kind=>[kind,Array.from({length:200},(_,i)=>`${kind}-${i}`)]));
  const ids=Object.entries(expectedEvents).flatMap(([kind,paths])=>paths.map(id=>({kind,id})));
  const valid={size:200,subscribed:true,visible:true,expectedEvents,events:{add:200,edit:200,remove:200,ids},disk:{ok:true,count:1600},list:{ok:true,count:1600,truncated:false,fullExact:true,changedRows:200,addedRows:200,deletedRows:0},ui:{mounted:true,firstChunk:true,changedRow:true,removedRow:false,refreshAfterLastDelete:true,count:1600},probe:{windowMs:10,longtaskSupported:true,longtaskTotalMs:0,longtaskCount:0,longtaskMaxMs:0},ipc:{pings:1,rejectedPings:0,openStallMs:null,maxMs:1},cpu:{totalSeconds:1},elapsedMs:100};
  assert.equal(assessBurst(valid).status,'measured');
  for (const patch of [{subscribed:false},{events:{add:200,edit:200,remove:199,ids}} ,{events:{add:200,edit:200,remove:200,ids:[...ids.slice(0,-1),ids.at(-2)]}},{disk:{ok:false,count:1600}},{list:{ok:true,count:1600,truncated:false,changedRows:199,deletedRows:0}},{ui:{mounted:true,firstChunk:false,changedRow:true,count:1600}},{probe:null},{ipc:{pings:0,rejectedPings:0,openStallMs:null,maxMs:null}}]) assert.equal(assessBurst({...valid,...patch}).status,'incomplete');
});
test('second burst avoids previously removed files and owns distinct additions',()=>{
 const first=planBurst(200),second=planBurst(1000,200);
 assert.equal(first.deletes.filter(x=>second.deletes.some(y=>y.rel===x.rel)).length,0);
 assert.equal(first.adds.filter(x=>second.adds.some(y=>y.rel===x.rel)).length,0);
 assert.equal(first.edits.filter(x=>first.deletes.some(y=>y.rel===x.rel)).length,0);
 assert.equal(second.edits.filter(x=>second.deletes.some(y=>y.rel===x.rel)).length,0);
 assert.equal(first.deletes[0].rel.split('/').length,1);
 assert.equal(second.deletes[0].rel.split('/').length,1);
});
test('cleanup refuses unowned roots and removes only owned fixture',()=>{
 const root=mkdtempSync(join(tmpdir(),'watcher-cleanup-'));
 try{assert.throws(()=>cleanupFixture(root),/unowned/);writeFileSync(join(root,'owner'),'watcher-burst');cleanupFixture(root);assert.throws(()=>readFileSync(join(root,'owner')),/ENOENT/);}finally{rmSync(root,{recursive:true,force:true});}
});
test('CDP target is not app readiness: wait for actual Projects header before opening',async()=>{
 let calls=0;const cdp={evaluate:async()=>++calls===3};
 assert.equal(await waitForProjectsHeader(cdp,p=>p,{timeoutMs:1000,pause:async()=>{}}),true);
 assert.equal(calls,3);
 await assert.rejects(waitForProjectsHeader({evaluate:async()=>false},p=>p,{timeoutMs:1,pause:async()=>new Promise(ok=>setTimeout(ok,2))}),/did not mount/);
});
test('startup failure retains bounded DOM diagnostic and screenshot before cleanup',async()=>{
 const sends=[];const cdp={evaluate:async()=>({readyState:'complete',url:'file:///fixture/index.html',buttons:['Other'],body:'startup'}),send:async method=>{sends.push(method);return {data:Buffer.from('private png').toString('base64')};}};
 const root=mkdtempSync(join(tmpdir(),'watcher-diag-'));
 try{const report={};await captureStartupFailure(cdp,report,join(root,'failed.json'),p=>p);
 assert.equal(report.startupDiagnostic.buttons[0],'Other');assert.equal(report.failureScreenshot,join(root,'failed.json.failure.png'));
 assert.equal(readFileSync(report.failureScreenshot,'utf8'),'private png');assert.deepEqual(sends,['Page.captureScreenshot']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('one owned watcher is ready before Files opens and is released after both legs',async()=>{
 const calls=[];const cdp={evaluate:async expr=>{calls.push(expr.includes('unwatchProject')?'unwatch':'watch');return {ok:true};}};
 await withOwnedWatcher(cdp,'/fixture/gamma',p=>p,async()=>{calls.push('open','burst200','burst1000');});
 assert.deepEqual(calls,['watch','open','burst200','burst1000','unwatch']);
});
test('refused or failed startup never opens Files or starts a burst and releases the attempted ref',async()=>{
 for(const response of [{ok:false},Error('watch IPC failed')]){
  const calls=[];const cdp={evaluate:async expr=>{const action=expr.includes('unwatchProject')?'unwatch':'watch';calls.push(action);if(action==='watch'&&response instanceof Error)throw response;return action==='watch'?response:{ok:true};}};
  await assert.rejects(withOwnedWatcher(cdp,'/fixture/gamma',p=>p,async()=>{calls.push('open','burst');}),/refused subscription|watch IPC failed/);
  assert.deepEqual(calls,['watch','unwatch']);
 }
});
test('failure after opening releases owned subscription once, before caller kills app',async()=>{
 const calls=[];const cdp={evaluate:async expr=>{calls.push(expr.includes('unwatchProject')?'unwatch':'watch');return {ok:true};}};
 await assert.rejects(withOwnedWatcher(cdp,'/fixture/gamma',p=>p,async()=>{calls.push('open');throw Error('burst failed');}),/burst failed/);
 calls.push('app kill');assert.deepEqual(calls,['watch','open','unwatch','app kill']);
});
test('watcher output preflight rejects occupied failure screenshot before creating fixture',()=>{
 const root=mkdtempSync(join(tmpdir(),'watcher-output-'));
 const scratch=join(root,'scratch','perf-lab');mkdirSync(scratch,{recursive:true});
 const out=join(scratch,'watcher.json');
 try {
  assert.equal(validateOutputPath(out,root),out);
  writeFileSync(out+'.failure.png','keep');
  assert.throws(()=>validateOutputPath(out,root),/already exists/);
  assert.equal(readFileSync(out+'.failure.png','utf8'),'keep');
  const source=readFileSync(new URL('../watcher-burst.mjs',import.meta.url),'utf8');
  assert.ok(source.indexOf('validateOutputPath(opts.out);')<source.indexOf('mkdirSync(dirname(opts.out)'), 'preflight before fixture/output mutation');
  assert.match(source,/writeFileSync\(report\.screenshot,[^\n]*flag:'wx'/);
  assert.match(source,/writeFileSync\(report\.failureScreenshot,[^\n]*flag:'wx'/);
  assert.match(source,/writeFileSync\(opts\.out,[^\n]*flag:'wx'/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('CLI bounds and foreign package refusal',()=>{
 assert.equal(parseOptions(['--max-minutes','5']).maxMinutes,5);
 assert.throws(()=>parseOptions(['--max-minutes','11']),/max-minutes/);
 assert.throws(()=>parseOptions(['--checkout','relative']),/absolute/);
 assert.throws(()=>refuseForeignPackage('/package',{find:()=>[17],read:()=>'/package/youcoded'}),/already running/);
});
