import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedMixedHistories, boundedNativeSessionLines, HISTORY_PROFILE, historySnapshot, verifyHistory, assessViewportDelivery, assessLoadedAfterSwitch, latestHistoryArrival, assessLoadedHistory, assessDrawer, assessHistoryRun, hasNewCompletion, parseNativeTranscript, captureNativeFailure, newEvents, classifyProviderRequests, historyPaneExpression, drawerExpression, pageHistory, registerSessionFiles } from '../mixed-history-files.mjs';

const roles = ['stream-1','stream-2','stream-3','tool-1','tool-2','idle'];
test('bounded 200-turn fixture retains 400 authored messages, varied prose/code/diff and normal native schema', () => {
  const lines=boundedNativeSessionLines({sessionId:'fixed',cwd:'/private/mixed-stream-1',turns:200,startedAt:1000,binding:{providerId:'perf-mixed-private',modelId:'perf-mixed'}});
  assert.equal(HISTORY_PROFILE,'bounded-turns');
  const events=lines.slice(1).map(JSON.parse);
  assert.equal(events.filter(e=>e.type==='user-message').length,200);
  assert.equal(events.filter(e=>e.type==='assistant-text').length,200);
  assert.equal(events.filter(e=>e.type==='turn-complete').length,200);
  const bodies=events.filter(e=>['user-message','assistant-text'].includes(e.type)).map(e=>e.data.text);
  const chars=bodies.reduce((n,s)=>n+s.length,0);
  assert.ok(chars>=20000 && chars<=40000,`body chars ${chars}`);
  assert.ok(bodies.some(t=>t.includes('```ts')));
  assert.ok(bodies.some(t=>t.includes('```diff')));
  assert.ok(bodies.some(t=>t.includes('Verified')));
  assert.equal(lines[0].includes('"sessionId":"fixed"'),true);
  assert.equal(new Set(events.map(e=>e.uuid)).size,600);
  assert.deepEqual(lines,boundedNativeSessionLines({sessionId:'fixed',cwd:'/private/mixed-stream-1',turns:200,startedAt:1000,binding:{providerId:'perf-mixed-private',modelId:'perf-mixed'}}));
});
test('seed six distinct owned native projects, 200 turns each and distinct session files', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'mixed-hist-'));
  try {
    const fixture = { home: join(parent,'home'), root: parent };
    const h = await seedMixedHistories(fixture, { turns: 200, token: 'abc' });
    assert.equal(Object.keys(h).length, 6);
    assert.ok(Object.values(h).every(v=>v.historyProfile==='bounded-turns' && v.bodyChars>=20000 && v.bodyChars<=40000));
    assert.equal(new Set(Object.values(h).map(v => v.cwd)).size, 6);
    for (const role of roles) {
      const v = h[role], text = await readFile(v.path,'utf8');
      const lines = text.trim().split('\n').map(JSON.parse);
      assert.equal(lines.length, 601);
      assert.equal(lines[0].sessionId, v.id);
      assert.equal(lines[0].binding.modelId, 'perf-mixed');
      assert.equal(lines.filter(e=>e.type==='assistant-text').length,200);
      assert.ok(v.bytes > 10000);
      assert.equal(v.files.length,2);
      assert.ok(v.files.every(f => f.name.includes(role) && f.rel !== v.files[0].rel || f === v.files[0]));
      assert.equal(verifyHistory(lines.slice(1), v.snapshot).ok,true);
      const changed = structuredClone(lines.slice(1)); changed[1].data.text += 'changed';
      assert.equal(verifyHistory(changed,v.snapshot).ok,false);
    }
  } finally { await rm(parent,{recursive:true,force:true}); }
});
test('immutable prefix and measured new events stay separate even for idle with history', () => {
  const old=[{uuid:'old',type:'assistant-text',data:{text:'old answer'}},{uuid:'turn',type:'turn-complete'}];
  const snapshot=historySnapshot(old);
  const after=[...old,{uuid:'new',type:'assistant-text',data:{text:'MIXED_TEXT:stream-1:0000'}}];
  assert.equal(verifyHistory(after,snapshot).ok,true);
  assert.deepEqual(newEvents(after,snapshot).map(e=>e.uuid),['new']);
  assert.equal(verifyHistory([...old.slice(1),old[0],after[2]],snapshot).ok,false);
  assert.deepEqual(newEvents(old,snapshot),[]);
  assert.equal(assessHistoryRun({role:'idle',events:old,snapshot,requests:[]}).ok,true);
  assert.equal(assessHistoryRun({role:'idle',events:after,snapshot,requests:[]}).ok,false);
});
test('native JSONL header is not an event and cannot invalidate immutable seed prefix', () => {
  const seed=[{type:'user-message',uuid:'u',data:{text:'old'}},{type:'turn-complete',uuid:'t'}];
  const file=[{v:1,sessionId:'owned'},...seed,{type:'user-message',uuid:'new',data:{text:'MIXED_ROLE:stream-1'}}].map(JSON.stringify).join('\n')+'\n';
  const events=parseNativeTranscript(file);
  assert.equal(events.length,3);
  assert.equal(verifyHistory(events,historySnapshot(seed)).ok,true);
  assert.deepEqual(newEvents(events,historySnapshot(seed)).map(e=>e.uuid),['new']);
  assert.throws(()=>parseNativeTranscript('{"v":1}\nnot-json\n'),/invalid native transcript/);
});
test('post-seed completion ignores 200 old turns; fresh transcript still waits for first turn', () => {
  const seeded=[{uuid:'old-user',type:'user-message'},{uuid:'old-turn',type:'turn-complete'}];
  const snapshot=historySnapshot(seeded);
  assert.equal(hasNewCompletion(seeded,snapshot),false);
  assert.equal(hasNewCompletion([...seeded,{uuid:'fresh-user',type:'user-message'}],snapshot),false);
  assert.equal(hasNewCompletion([...seeded,{uuid:'fresh-turn',type:'turn-complete'}],snapshot),true);
  assert.equal(hasNewCompletion([{uuid:'first',type:'turn-complete'}]),true);
  assert.equal(hasNewCompletion([]),false);
});
test('diagnostics capture real native error and visible pane before session destruction, never after', async () => {
  const calls=[];
  const cdp={evaluate:async code=>{calls.push(code);if(code.includes('__mixedHistoryDiagnosis?.events')) return {events:[{sessionId:'owned',type:'session-error',data:{message:'specific error'}}],pane:{id:'owned',text:'error shown',error:'specific error'},provider:{requests:0,rejected:0}};throw Error('unexpected diagnostic read');},send:async()=>({data:'screenshot'})};
  const out=await captureNativeFailure(cdp,'owned',{bound:p=>p,provider:{requests:[],rejected:[]}});
  assert.equal(out.events[0].data.message,'specific error');
  assert.equal(out.pane.id,'owned');
  assert.ok(calls.every(code=>!code.includes('session.destroy')));
  assert.equal(out.provider.requests,0);
});
test('final screenshot delivery requires target assistant and completed card inside scroller viewport', () => {
  assert.equal(assessViewportDelivery({role:'tool-1',ackVisible:true,cardVisible:true}),true);
  assert.equal(assessViewportDelivery({role:'tool-1',ackVisible:false,cardVisible:true}),false);
  assert.equal(assessViewportDelivery({role:'tool-2',ackVisible:true,cardVisible:false}),false);
  assert.equal(assessViewportDelivery({role:'stream-1',lastMarkerVisible:true}),true);
  assert.equal(assessViewportDelivery({role:'stream-1',lastMarkerVisible:false}),false);
});
test('240 folded rows still count as loaded during switch; unfurl newest through UI after paging', async () => {
  const folded={sessionId:'one',authored:244,entries:244,markdown:0,chars:83,folded:244,width:850,chatWidth:850};
  assert.equal(assessLoadedHistory(folded,'one').ok,false);
  assert.equal(assessLoadedAfterSwitch(folded,'one').ok,true);
  assert.equal(assessLoadedAfterSwitch({...folded,authored:239},'one').ok,false);
  assert.equal(assessLoadedAfterSwitch({...folded,folded:245},'one').ok,false);
  let clicked=0;
  const cdp={evaluate:async code=>{if(code.includes('jump-to-bottom')){clicked++;return true}if(code===historyPaneExpression)return {...folded,markdown:10,chars:900,folded:220};throw Error('unknown')}};
  const result=await latestHistoryArrival(cdp,'one',{bound:p=>p});
  assert.equal(result.ok,true);assert.equal(clicked,1);
  let polls=0;
  const targetCdp={evaluate:async code=>{if(code.includes('jump-to-bottom'))return true;if(code.includes('lastMarkerVisible')){polls++;return {sessionId:'one',authored:244,entries:244,folded:200,width:850,chatWidth:850,markdown:10,chars:900,distanceFromBottom:polls<3?200:2,role:'tool-1',ackVisible:polls>=3,cardVisible:polls>=3};}throw Error('unknown')}};
  const target=await latestHistoryArrival(targetCdp,'one',{bound:p=>p,role:'tool-1',marker:'MIXED_ACK:tool-1:token',cardId:'mixed-tool-1-token'});
  assert.equal(target.ok,true);assert.ok(polls>=3);
  const stale={evaluate:async code=>code.includes('jump-to-bottom')?true:{sessionId:'one',authored:244,entries:244,folded:200,width:850,chatWidth:850,markdown:10,chars:900,distanceFromBottom:2,role:'tool-1',ackVisible:false,cardVisible:false}};
  assert.equal((await latestHistoryArrival(stale,'one',{bound:p=>p,role:'tool-1',marker:'MIXED_ACK:tool-1:token',cardId:'mixed-tool-1-token',maxPolls:2})).ok,false);
  assert.match(readFileSync(new URL('../mixed-activity.mjs',import.meta.url),'utf8'),/viewportDelivery/);
  assert.ok(readFileSync(new URL('../mixed-activity.mjs',import.meta.url),'utf8').indexOf('viewportDelivery=proof')>readFileSync(new URL('../mixed-activity.mjs',import.meta.url),'utf8').indexOf('stopProbe(cdp)'));
});
test('actual loaded authored rows, counts, folding and distinct file markers gate history/drawer', () => {
  const loaded={ sessionId:'one',authored:240, entries:241, markdown:120, chars:30000, folded:120, width:850, scrollTop:50 };
  assert.equal(assessLoadedHistory(loaded,'one').ok,true);
  for(const bad of [{...loaded,authored:239},{...loaded,sessionId:'two'},{...loaded,markdown:0},{...loaded,folded:null}]) assert.equal(assessLoadedHistory(bad,'one').ok,false);
  const target={role:'stream-1',sessionId:'one',projectRoot:'/private/stream-1',files:['stream-1-note.md','stream-1-work.ts']};
  const drawer={sessionId:'one',projectRoot:'/private/stream-1',open:true,rows:target.files,chatWidth:800,drawerWidth:400};
  assert.equal(assessDrawer(drawer,target,true).ok,true);
  assert.equal(assessDrawer({...drawer,sessionId:'other'},target,true).ok,false);
  assert.equal(assessDrawer({...drawer,projectRoot:'/private/other'},target,true).ok,false);
  assert.equal(assessDrawer({...drawer,rows:['other-note.md']},target,true).ok,false);
  assert.equal(assessDrawer({...drawer,open:false},target,true).ok,false);
  assert.equal(assessDrawer({...drawer,open:false,rows:[]},target,false).ok,true);
  assert.equal(assessDrawer(drawer,target,false).ok,false);
});
test('provider history may be long but extra/unknown routes never count as the role request', () => {
  assert.equal(classifyProviderRequests([{role:'stream-1',followup:false},{role:'tool-1',followup:false},{role:'tool-1',followup:true}],{controlCount:0}).ok,true);
  assert.equal(classifyProviderRequests([{role:'stream-1',followup:false},{role:null,followup:false}],{controlCount:0}).ok,false);
  assert.equal(classifyProviderRequests([{role:'stream-1',followup:false},{role:'stream-1',followup:false}],{controlCount:0}).ok,false);
  assert.equal(classifyProviderRequests([{role:'stream-1',followup:false}],{controlCount:0,rejected:[{message:'Exact marked streaming request required'}]}).ok,false);
});
test('history pages via UI scroll, never synthetic history dispatch or invented count', async () => {
  const calls=[]; let entries=60;
  const cdp={evaluate:async code=>{calls.push(code);if(code===historyPaneExpression) return {sessionId:'owned',authored:entries,entries,markdown:1,chars:500,folded:0,width:700};if(code.includes('scrollTop=0')){entries+=60;return true;}throw Error('unexpected IPC');}};
  const result=await pageHistory(cdp,'owned',{bound:p=>p,target:240});
  assert.equal(result.ok,true);
  assert.ok(calls.filter(s=>s.includes('scrollTop=0')).length>=3);
  assert.equal((await pageHistory({evaluate:async code=>code===historyPaneExpression?{sessionId:'wrong',authored:0}:false},'owned',{bound:p=>p})).ok,false);
  assert.match(drawerExpression,/drawer-pane:not\(\.game-pane\)/);
});
test('files are registered through actual app appendVersion and session list; refuse untracked', async () => {
  const h={id:'owned',cwd:'/private/owned',files:[{rel:'owned-note.md'},{rel:'owned-work.ts'}]};
  const cdp={evaluate:async code=>{assert.match(code,/artifacts.appendVersion/);assert.match(code,/artifacts.listSession/);return {appended:[{ok:true},{ok:true}],listed:{ok:true,artifacts:h.files.map(f=>({path:f.rel,versions:[{sessionId:h.id}]}))}};}};
  assert.equal((await registerSessionFiles(cdp,h)).files.length,2);
  await assert.rejects(registerSessionFiles({evaluate:async()=>({appended:[{ok:true},{ok:true}],listed:{ok:true,artifacts:[]}})},h),/not tracked/);
});
