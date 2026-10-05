import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectArrivalGeometry, browserWindowState, inspectCadenceTrace } from '../mixed-diagnostics.mjs';

test('arrival geometry records ordered row indexes, viewport rects and jump state without deleting or moving anything', async () => {
  const calls=[];
  const cdp={evaluate:async code=>{calls.push(code);return {id:'owned',rows:[{index:0,key:'old',textHead:'old',textTail:'old'},{index:1,key:'new',textHead:'MIXED_ACK:tool-1:token'}],marker:{index:1,top:110,bottom:140},card:{index:1,top:121,bottom:139},scroll:{top:100,client:400,height:500},jump:{exists:false}};}};
  const x=await collectArrivalGeometry(cdp,'owned',{bound:p=>p,marker:'MIXED_ACK:tool-1:token',cardId:'mixed-tool-1-token'});
  assert.equal(x.marker.index,1);assert.equal(x.jump.exists,false);
  assert.ok(calls[0].includes('data-entry-key'));
  assert.ok(!calls[0].includes('scrollTop='));
});
test('window bounds are requested on browser websocket, never unsupported page target', async () => {
  let ws,methods=[];
  const state=await browserWindowState(9999,'page-abc',{getVersion:async()=>({webSocketDebuggerUrl:'ws://private/browser'}),connect:async u=>{ws=u;return {send:async(method,args)=>{methods.push([method,args]);return method==='Browser.getWindowForTarget'?{windowId:7,bounds:{windowState:'normal'}}:{bounds:{windowState:'normal',width:1400}}},close(){methods.push(['close'])}}}});
  assert.equal(ws,'ws://private/browser');assert.equal(state.bounds.width,1400);assert.equal(methods[0][1].targetId,'page-abc');
});
test('trace verdict refuses truncated/lost/no-frame metadata, preserves raw attribution', () => {
  assert.equal(inspectCadenceTrace({complete:true,dataLossOccurred:false,truncated:false,events:[{name:'BeginFrame',pid:1,tid:2,ts:10}]}).ok,true);
  assert.equal(inspectCadenceTrace({complete:true,dataLossOccurred:true,truncated:false,events:[{name:'BeginFrame'}]}).ok,false);
  assert.equal(inspectCadenceTrace({complete:true,dataLossOccurred:false,truncated:false,events:[]}).ok,false);
  const src=readFileSync(fileURLToPath(new URL('../mixed-activity.mjs',import.meta.url)),'utf8');
  assert.ok(src.includes('report.arrivalGeometry'));
});
