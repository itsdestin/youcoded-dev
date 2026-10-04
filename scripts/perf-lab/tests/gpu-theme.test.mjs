import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOptions, inspectTheme, assessLeg, assessTrace, assessRun, cleanupFixture, traceInventory, assessTheme, validateOutputPath, themeReadyExpression, saveTrace, loadPackageStamp, refusePackageProcesses, resolveSessionPill, assessSettled, assessActions, assessSwitchProfile, assessFirstFrameContent, matchPaneIdentity, assessSteadyFolded, assessFullCondition, assessNarrowTrace } from '../gpu-theme.mjs';

const args = ['--real-display', ':1', '--checkout', '/tmp/app-checkout', '--app-dir', '/tmp/stamped-app', '--out', '/tmp/gpu-result.json'];
test('CLI requires an explicit real display, absolute paths and a bounded duration', () => {
  assert.equal(parseOptions(args).maxMinutes, 5);
  assert.equal(parseOptions([...args,'--trace','off','--control','full-folded']).control,'full-folded');
  assert.equal(parseOptions([...args,'--trace','off','--control','style-trace']).control,'style-trace');
  assert.throws(()=>parseOptions([...args,'--control','style-trace']),/trace and profile off/);
  assert.equal(assessNarrowTrace({complete:true,dataLossOccurred:false,truncated:false,events:[{name:'UpdateLayoutTree',pid:1,tid:2}]}).ok,true);
  assert.equal(assessNarrowTrace({complete:true,dataLossOccurred:false,truncated:true,events:[{name:'UpdateLayoutTree'}]}).ok,false);
  assert.equal(assessNarrowTrace({complete:true,dataLossOccurred:null,truncated:false,events:[{name:'UpdateLayoutTree'}]}).ok,false);
  assert.throws(()=>parseOptions([...args,'--control','full-folded']),/trace and profile off/);
  for (const bad of [[], ['--real-display', ':99'], [...args, '--max-minutes', '11'], [...args, '--max-minutes', '0'], [...args, '--out', 'relative.json'], [...args, '--theme', 'unknown']]) {
    assert.throws(() => parseOptions(bad));
  }
});

test('profile mode refuses tracing, incomplete or sample-free action profiles', () => {
  assert.equal(parseOptions([...args,'--trace','off','--profile','on']).profile,'on');
  assert.throws(()=>parseOptions([...args,'--profile','on']),/trace off/);
  assert.throws(()=>parseOptions([...args,'--profile','invalid']),/profile/);
  const profile={nodes:[{id:1}],samples:[1],timeDeltas:[1000],startTime:10,endTime:20};
  assert.equal(assessSwitchProfile(profile,{status:'measured'}).ok,true);
  assert.equal(assessSwitchProfile({...profile,samples:[]},{status:'measured'}).ok,false);
  assert.equal(assessSwitchProfile(profile,{status:'incomplete'}).ok,false);
  assert.equal(assessActions([{kind:'switch',status:'incomplete'}],'switch').ok,false);
});

test('missing heavy theme or any referenced asset cannot pass as plain', () => {
  const root = mkdtempSync(join(tmpdir(), 'gpu-theme-test-'));
  try {
    assert.equal(inspectTheme('devils-garden', root).status, 'unsupported');
    const dir = join(root, 'devils-garden');
    mkdirSync(dir);
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({slug:'devils-garden',background:{type:'image',value:'assets/wallpaper.jpg'},effects:{particles:'dust'},mascot:{rig:'assets/rig.svg'}}));
    assert.match(inspectTheme('devils-garden', root).reason, /missing asset/);
    symlinkSync(join(root,'outside'),join(dir,'unreferenced-link'));
    assert.match(inspectTheme('devils-garden', root).reason, /symlink/);
    assert.equal(inspectTheme('midnight', root).status, 'ready');
  } finally { rmSync(root, {recursive:true, force:true, maxRetries:3}); }
});

test('official parent stamp only for exact checkout release package; preserved internal stamps supported', async () => {
  const root=mkdtempSync(join(tmpdir(),'gpu-stamp-test-'));
  const checkout=join(root,'youcoded'), appDir=join(checkout,'desktop','release','linux-unpacked');
  const preserved=join(root,'preserved','linux-unpacked');
  const stamp={sha:'123abc',dirty:'dirty123',builtAt:'2026-09-28T00:00:00Z'};
  try {
    mkdirSync(appDir,{recursive:true});
    mkdirSync(preserved,{recursive:true});
    writeFileSync(join(appDir,'youcoded'),'binary');
    writeFileSync(join(preserved,'youcoded'),'binary');
    writeFileSync(join(checkout,'desktop','release','.perf-lab-build.json'),JSON.stringify(stamp));
    const fingerprint=async()=>({sha:stamp.sha,dirty:stamp.dirty});
    const official=await loadPackageStamp({checkout,appDir},{fingerprint});
    assert.equal(official.stampPath,join(checkout,'desktop','release','.perf-lab-build.json'));
    assert.equal(official.source,'official-parent');
    assert.equal(official.sha,stamp.sha);
    await assert.rejects(loadPackageStamp({checkout,appDir},{fingerprint:async()=>({sha:stamp.sha,dirty:'changed'})}),/fingerprint/);
    await assert.rejects(loadPackageStamp({checkout,appDir:preserved},{fingerprint}),/stamp/);
    writeFileSync(join(preserved,'.perf-lab-build.json'),JSON.stringify(stamp));
    const copied=await loadPackageStamp({checkout,appDir:preserved},{fingerprint:async()=>{throw Error('preserved copy must not fingerprint unrelated checkout')}});
    assert.equal(copied.source,'preserved-internal');
    assert.equal(copied.stampPath,join(preserved,'.perf-lab-build.json'));
    assert.equal(copied.sha,stamp.sha);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('preflight ignores only own launcher ancestry, still refuses other package process', () => {
  const appDir='/tmp/private-app/linux-unpacked';
  const find=()=>[10,20,30];
  const read=pid=>({10:`/bin/bash -c node gpu-theme.mjs --app-dir ${appDir}`,20:`${appDir}/youcoded --remote-debugging-port=9586`,30:`${appDir}/youcoded --type=renderer`})[pid];
  const ppid=pid=>({1:0,10:1,20:1,30:20})[pid]??0;
  assert.throws(()=>refusePackageProcesses(appDir,{find,read,ppid,selfPid:11,ownParentPid:10}),/package already running/);
  assert.doesNotThrow(()=>refusePackageProcesses(appDir,{find:()=>[10],read,ppid,selfPid:11,ownParentPid:10}));
});

test('new session identity is inferred from exactly one new DOM ID, never a mutable title', () => {
  assert.deepEqual(resolveSessionPill(['old'],['old','resumed'], 'created'),{createdId:'created',pillId:'resumed',mapping:'new-dom-id'});
  assert.deepEqual(resolveSessionPill(['old'],['old','created'], 'created'),{createdId:'created',pillId:'created',mapping:'exact'});
  assert.throws(()=>resolveSessionPill(['old'],['old','a','b'],'created'),/ambiguous/);
  assert.throws(()=>resolveSessionPill(['old'],['old'],'created'),/no new/);
  assert.equal(assessSettled([{entries:10,markdown:4,chars:800},{entries:10,markdown:4,chars:800},{entries:10,markdown:4,chars:800}]).ok,true);
  assert.equal(assessSettled([{entries:10,markdown:0,chars:0},{entries:10,markdown:0,chars:0},{entries:10,markdown:0,chars:0}]).ok,false);
  assert.equal(assessSettled([{entries:10,markdown:4,chars:800},{entries:10,markdown:4,chars:801},{entries:10,markdown:4,chars:801}]).ok,false);
});

test('full gate refuses absent focus, partial pages, folded spacers and expired natural window', () => {
  const expected={entries:60,folded:0,markdown:131,chars:87372};
  const pane={entries:60,markdown:131,chars:87372,folded:0,keysHash:123};
  assert.equal(assessFullCondition(pane,expected,{focus:true,visibility:'visible',ageMs:300}).ok,true);
  assert.equal(assessFullCondition(pane,expected,{focus:false,visibility:'visible',ageMs:300}).ok,false);
  assert.equal(assessFullCondition({...pane,chars:6000},expected,{focus:true,visibility:'visible',ageMs:300}).ok,false);
  assert.equal(assessFullCondition({...pane,folded:1},expected,{focus:true,visibility:'visible',ageMs:300}).ok,false);
  assert.equal(assessFullCondition(pane,expected,{focus:true,visibility:'visible',ageMs:800}).ok,false);
  const metric={kind:'minimal-switch',elapsedMs:30,probe:{longtaskSupported:true,observedMs:30,frames:2,longtaskCount:0,longtaskTotalMs:0},cpu:{totalSeconds:0},metrics:{TaskDuration:0.03},engagement:{beforeId:'medium',afterId:'small',targetId:'small',focus:true,visibility:'visible'}};
  assert.equal(assessLeg(metric).status,'measured');
  assert.equal(assessLeg({...metric,engagement:{...metric.engagement,focus:false}}).status,'incomplete');
});

test('steady folded gate refuses a briefly stable pre-fold full list and unexpected counts', () => {
  const target={entries:60,folded:53,markdown:7,chars:6047};
  const sample=(at,markdown=7,chars=6047,folded=53)=>({at,entries:60,markdown,chars,folded,keysHash:123});
  assert.equal(assessSteadyFolded([sample(0,131,87372,0),sample(250,131,87372,0),sample(500,131,87372,0)],target).ok,false);
  assert.equal(assessSteadyFolded([sample(1000),sample(1250),sample(1500)],target).ok,false);
  assert.equal(assessSteadyFolded([sample(1000),sample(1500),sample(2050)],target).ok,true);
  assert.equal(assessSteadyFolded([sample(1000),sample(1500),sample(2050,8,6047)],target).ok,false);
  assert.equal(assessSteadyFolded([sample(1000,7,6047,0),sample(1500,7,6047,0),sample(2050,7,6047,0)],target).ok,false);
  assert.equal(assessSteadyFolded([sample(1000),sample(1500),{...sample(2050),keysHash:321}],target).ok,false);
});

test('first frame requires the actual pane and stable near-viewport entry IDs and bodies', () => {
  const expected={id:'small',rows:[{key:'last-1',hash:12},{key:'last-2',hash:13}]};
  const observed={id:'small',visible:true,rows:[{key:'last-1',hash:12},{key:'last-2',hash:13}]};
  assert.equal(assessFirstFrameContent(expected,observed).ok,true);
  assert.equal(assessLeg({kind:'switch',elapsedMs:42,probe:{longtaskSupported:true,observedMs:42,frames:2,longtaskCount:0,longtaskTotalMs:0},cpu:{totalSeconds:0},metrics:{TaskDuration:0.04},engagement:{beforeId:'medium',afterId:'small',targetId:'small',firstFrame:{...observed,entries:60,markdown:7,chars:6047,distanceFromBottom:23}}}).status,'incomplete');
  assert.equal(assessFirstFrameContent(expected,{...observed,id:'medium'}).ok,false);
  assert.equal(assessFirstFrameContent(expected,{...observed,rows:[{key:'last-1',hash:12},{key:'last-2',hash:0}]}).ok,false);
  assert.equal(assessFirstFrameContent(expected,{...observed,rows:[{key:'last-1',hash:12}]}).ok,false);
  assert.equal(matchPaneIdentity([{index:0,id:'small',visible:false},{index:1,id:'medium',visible:true}],[{index:0,id:'small'},{index:1,id:'medium'}]),'medium');
  assert.equal(matchPaneIdentity([{index:0,id:'small',visible:false},{index:1,id:'medium',visible:true}],[{index:0,id:'medium'},{index:1,id:'small'}]),null);
});

test('trace-off accepts complete actions without trace; missing engagement never passes', () => {
  assert.equal(parseOptions([...args,'--trace','off']).trace,'off');
  assert.throws(()=>parseOptions([...args,'--trace','bad']),/trace/);
  const valid={kind:'resize',status:'measured',engagement:{beforeWidth:1400,afterWidth:1100,events:1},probe:{longtaskSupported:true,observedMs:100,frames:4,longtaskCount:0,longtaskTotalMs:0},cpu:{totalSeconds:0.1},metrics:{TaskDuration:0.1},elapsedMs:100};
  assert.equal(assessActions([valid,valid,valid],'resize').ok,true);
  assert.equal(assessActions([valid,valid],'resize').ok,false);
  const run={options:{trace:'off'},theme:{status:'ready',engagement:{status:'ready'}},gpu:{source:'SystemInfo',glRenderer:'GPU',featureStatus:{gpu_compositing:'enabled'}},legs:[{kind:'idle',status:'measured'},{kind:'scroll',status:'measured'},{kind:'resize',status:'measured',actions:[valid,valid,valid]},{kind:'switch',status:'measured',actions:[{...valid,kind:'switch',engagement:{beforeId:'a',afterId:'b',targetId:'b',expectedRows:{id:'b',rows:[{key:'row',hash:42}]},firstFrame:{id:'b',visible:true,entries:60,markdown:100,chars:900,rows:[{key:'row',hash:42}],distanceFromBottom:0}}}, {...valid,kind:'switch',engagement:{beforeId:'b',afterId:'a',targetId:'a',expectedRows:{id:'a',rows:[{key:'row',hash:42}]},firstFrame:{id:'a',visible:true,entries:60,markdown:100,chars:900,rows:[{key:'row',hash:42}],distanceFromBottom:0}}}, {...valid,kind:'switch',engagement:{beforeId:'a',afterId:'b',targetId:'b',expectedRows:{id:'b',rows:[{key:'row',hash:42}]},firstFrame:{id:'b',visible:true,entries:60,markdown:100,chars:900,rows:[{key:'row',hash:42}],distanceFromBottom:0}}}]}],screenshot:'/tmp/a.png',trace:{status:'unsupported'}};
  assert.equal(assessRun(run).status,'measured');
  assert.equal(assessRun({...run,options:{trace:'off',profile:'on'}}).status,'incomplete');
  assert.equal(assessRun({...run,options:{trace:'off',profile:'on'},profiles:Array.from({length:4},(_,i)=>({ok:true,file:`/tmp/${i}`}))}).status,'measured');
  assert.equal(assessRun({...run,legs:[...run.legs.slice(0,2),{...run.legs[2],actions:[valid]},run.legs[3]]}).status,'incomplete');
  assert.equal(assessRun({...run,options:{trace:'on'}}).status,'incomplete');
});

test('stock theme needs its slug but no nonexistent #theme-bg; heavy requires actual wallpaper and effects', () => {
  const plain = {slug:'midnight',manifest:{slug:'midnight',tokens:{canvas:'#0D1117'}}};
  assert.doesNotMatch(themeReadyExpression(plain), /querySelector/);
  assert.equal(assessTheme(plain,{slug:'midnight',reduced:false,wallpaper:false,bgPresent:false,canvas:'#0D1117',particleCanvas:null}).status,'ready');
  const heavy={slug:'devils-garden',manifest:{slug:'devils-garden',tokens:{canvas:'#140810'},background:{type:'image',value:'assets/wallpaper.jpg','panels-blur':14,'bubble-blur':10},effects:{particles:'dust','particle-count':25}}};
  const dom={slug:'devils-garden',reduced:false,wallpaper:true,bgPresent:true,bg:'url("theme-asset://devils-garden/assets/wallpaper.jpg")',canvas:'#140810',panelsBlur:'14px',bubbleBlur:'10px',glass:'blur(14px) saturate(1.2)',image:{source:'theme-asset://devils-garden/assets/wallpaper.jpg',width:500,height:400},wallpaperDecode:{ok:true,source:'theme-asset://devils-garden/assets/wallpaper.jpg',width:1800,height:1200},particleCanvas:{width:1400,height:900},visibility:'visible'};
  assert.equal(assessTheme(heavy,dom).status,'unsupported'); // mounting alone does not prove drawing
  assert.equal(assessTheme(heavy,{...dom,image:null}).status,'unsupported'); // custom-scheme timing may be absent
  assert.match(assessTheme(heavy,{...dom,wallpaperDecode:{ok:false}}).reason,/decode/);
  assert.equal(assessTheme(heavy,{...dom,wallpaperDecode:{ok:true,source:'theme-asset://devils-garden/assets/wallpaper.jpg',width:1800,height:1200},image:null}).status,'unsupported');
  assert.match(assessTheme(heavy,{...dom,particleCanvas:null}).reason,/particle canvas/);
  assert.match(assessTheme(heavy,{...dom,panelsBlur:'0px'}).reason,/blur/);
});

test('output path is private, unique and rejects symlinks and arbitrary parent directories', () => {
  const root=mkdtempSync(join(tmpdir(),'gpu-output-test-'));
  const outside=mkdtempSync(join(tmpdir(),'gpu-output-outside-'));
  try {
    mkdirSync(join(root,'scratch','perf-lab'),{recursive:true});
    const good=join(root,'scratch','perf-lab','nested','run.json');
    assert.equal(validateOutputPath(good,root),good);
    mkdirSync(join(root,'scratch','perf-lab','nested'));
    writeFileSync(good+'.theme.png','owned screenshot');
    assert.throws(()=>validateOutputPath(good,root),/exists/);
    assert.equal(validateOutputPath(good,root,{ownedThemeScreenshot:good+'.theme.png'}),good);
    assert.throws(()=>validateOutputPath(join(outside,'run.json'),root),/scratch\/perf-lab/);
    symlinkSync(outside,join(root,'scratch','perf-lab','escape'));
    assert.throws(()=>validateOutputPath(join(root,'scratch','perf-lab','escape','run.json'),root),/symlink/);
    writeFileSync(join(root,'scratch','perf-lab','profile.json.switch-0.cpuprofile.json'),'do not overwrite');
    assert.throws(()=>validateOutputPath(join(root,'scratch','perf-lab','profile.json'),root),/exists/);
    writeFileSync(join(root,'scratch','perf-lab','used.json.trace.json'),'do not overwrite');
    assert.throws(()=>validateOutputPath(join(root,'scratch','perf-lab','used.json'),root),/exists/);
    symlinkSync(join(outside,'target'),join(root,'scratch','perf-lab','linked.json'));
    assert.throws(()=>validateOutputPath(join(root,'scratch','perf-lab','linked.json'),root),/exists|symlink/);
  } finally {rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});

test('workload-equivalent raw trace writer uses report options, preserves metadata and refuses overwrite', () => {
  const root=mkdtempSync(join(tmpdir(),'gpu-trace-test-'));
  try {
    mkdirSync(join(root,'scratch','perf-lab'),{recursive:true});
    const out=join(root,'scratch','perf-lab','run.json');
    const report={options:{out},build:{sha:'test'},theme:{slug:'midnight'}};
    const raw={categories:'cc,viz',complete:true,dataLossOccurred:false,truncated:false,events:[{name:'x',pid:1}]};
    const traceFile=saveTrace(report,raw,{root});
    assert.equal(traceFile,out+'.trace.json');
    assert.equal(report.trace.status,'diagnostic');
    const saved=JSON.parse(readFileSync(traceFile,'utf8'));
    assert.deepEqual(saved.traceEvents,raw.events);
    assert.equal(saved.metadata.dataLossOccurred,false);
    assert.equal(saved.metadata.theme,'midnight');
    // The owned raw trace now exists; a repeat whole-run preflight would reject it.
    // Screenshot and final report must NOT rerun that preflight after saveTrace.
    assert.throws(()=>validateOutputPath(out,root),/exists/);
    assert.throws(()=>saveTrace(report,raw,{root}),/exists/);
    assert.deepEqual(JSON.parse(readFileSync(traceFile,'utf8')).traceEvents,raw.events);
    const themed=join(root,'scratch','perf-lab','themed.json');
    writeFileSync(themed+'.theme.png','owned');
    assert.equal(saveTrace({options:{out:themed},build:{sha:'test'},theme:{slug:'devils-garden'},themeScreenshot:themed+'.theme.png'},raw,{root}),themed+'.trace.json');
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('leg engagement refuses unchanged scroll, resized viewport or selected session', () => {
  const base = {kind:'idle', elapsedMs:100, probe:{longtaskSupported:true,observedMs:100,frames:3,longtaskCount:0,longtaskTotalMs:0},cpu:{totalSeconds:0.1},metrics:{TaskDuration:0.01}};
  assert.equal(assessLeg({...base,kind:'scroll',engagement:{before:0,after:0,scrollHeight:2000,clientHeight:500}}).status,'incomplete');
  assert.equal(assessLeg({...base,kind:'resize',engagement:{beforeWidth:1200,afterWidth:1200,events:1}}).status,'incomplete');
  assert.equal(assessLeg({...base,kind:'resize',engagement:{beforeWidth:1200,afterWidth:1000,events:0}}).status,'incomplete');
  assert.equal(assessLeg({...base,kind:'switch',engagement:{beforeId:'a',afterId:'a',targetId:'b'}}).status,'incomplete');
  assert.equal(assessLeg(base).status,'measured');
});

test('GPU identity is required and a WebGL-only fallback is not composition evidence', () => {
  assert.equal(assessRun({theme:{status:'ready'},gpu:{source:'webgl',glRenderer:'GPU',accelerated:true},legs:[],trace:{status:'diagnostic'}}).status,'incomplete');
  assert.equal(assessRun({theme:{status:'ready'},gpu:{source:'SystemInfo',glRenderer:'GPU',featureStatus:{}},legs:[],trace:{status:'diagnostic'}}).status,'incomplete');
});

test('trace absence, truncation and unsupported presentation never become zero drops', () => {
  assert.equal(assessTrace(null).status,'incomplete');
  assert.equal(assessTrace({complete:false,events:[{name:'DrawFrame'}]}).status,'incomplete');
  assert.equal(assessTrace({complete:true,dataLossOccurred:true,events:[{name:'DrawFrame'}]}).status,'incomplete');
  assert.equal(assessTrace({complete:true,truncated:true,events:[{name:'DrawFrame'}]}).status,'incomplete');
  assert.equal(assessTrace({complete:true,error:'Tracing.end failed',events:[{name:'DrawFrame'}]}).status,'incomplete');
  const result = assessTrace({complete:true,dataLossOccurred:false,events:[{name:'DrawFrame',cat:'cc,benchmark',pid:5,ts:1}]});
  assert.equal(result.status,'diagnostic');
  assert.equal(result.presentation.status,'unsupported');
  assert.equal(result.presentation.droppedFrames,null);
  assert.deepEqual(traceInventory([{name:'x'},{name:'x'},{name:'y'}],1),{names:[{name:'x',count:2}],distinct:2,truncated:true});
});

test('cleanup refuses unknown fixture ownership', () => {
  const root = mkdtempSync(join(tmpdir(), 'gpu-theme-foreign-'));
  try { assert.throws(() => cleanupFixture(root), /unowned/); }
  finally { rmSync(root,{recursive:true,force:true,maxRetries:3}); }
});
