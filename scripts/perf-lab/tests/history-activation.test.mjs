import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {assessActivation,parseActivationOptions,installActivationProbe} from '../history-activation.mjs';

test('activation accepts only full visible focused content and unchanged body hash',()=>{
 const snapshot={rows:60,markdown:136,chars:100000,hash:42,structureHash:84,visible:true,visibility:'visible',focus:true};
 const p={mode:'early',requestedAt:1,clickAt:2,rowsAtClick:0,firstCompleteAt:20,firstFrame:{...snapshot,at:24},settled:{...snapshot,at:200},supported:true,tasks:[],overflow:0};
 assert.equal(assessActivation(p).ok,true);
 assert.equal(assessActivation({...p,firstFrame:{...snapshot,at:24,visibility:'hidden'}}).ok,false);
 assert.equal(assessActivation({...p,settled:{...snapshot,at:200,structureHash:85}}).ok,false);
 for(const bad of [{...p,rowsAtClick:60},{...p,supported:false},{...p,overflow:1},{...p,firstFrame:{...snapshot,at:24,rows:59}},{...p,firstFrame:{...snapshot,at:24,focus:false}},{...p,settled:{...snapshot,at:200,hash:43}}])assert.equal(assessActivation(bad).ok,false);
 assert.equal(assessActivation({...p,mode:'arrival',clickAt:20,rowsAtClick:60,firstCompleteWasHidden:true}).ok,true);
 assert.equal(assessActivation({...p,mode:'arrival',rowsAtClick:60,firstCompleteWasHidden:false}).ok,false);
});
test('browser observer includes synchronous click work and captures rich first-frame structure',()=>{
 let now=10,inspect,frame;const win={};const rows=[];
 const pane={textContent:'x'.repeat(90000),querySelectorAll:q=>q==='.timeline-entry'?rows:Array(136).fill({})};
 const root={dataset:{chatSessionId:'target'},querySelector:()=>pane,closest:()=>null};
 const pill={dataset:{sessionId:'target'},click:()=>{now+=100;}};
 const doc={body:{},visibilityState:'visible',hasFocus:()=>true,querySelectorAll:q=>q==='[data-chat-session-id]'?[root]:[pill]};
 class Mutation{constructor(cb){inspect=cb;}observe(){}disconnect(){}}
 class Performance{observe(){}disconnect(){}takeRecords(){return[];}}
 runInNewContext(`(${installActivationProbe.toString()})('anchor','early')`,{window:win,document:doc,performance:{now:()=>now},MutationObserver:Mutation,PerformanceObserver:Performance,requestAnimationFrame:cb=>{frame=cb;return 1;},cancelAnimationFrame:()=>{}});
 inspect();assert.equal(win.__historyActivation.clickAt,10);assert.equal(now,110);
 rows.push(...Array.from({length:60},()=>({textContent:'body',innerHTML:'<p>body</p>'})));
 inspect();now=120;frame();
 assert.equal(win.__historyActivation.firstFrame.at-win.__historyActivation.clickAt,110);
 assert.ok(win.__historyActivation.firstFrame.structureHash>0);
 assert.equal(assessActivation(win.__historyActivation.finish()).ok,true);
});

test('activation CLI requires canonical private output, explicit package/display and bounded runtime',()=>{
 const base=['--checkout','/work/youcoded','--app-dir','/work/youcoded/desktop/release/test','--out','/work/scratch/perf-lab/act.json','--display',':0','--mode','early'];
 assert.equal(parseActivationOptions(base,{root:'/work'}).mode,'early');
 assert.throws(()=>parseActivationOptions(base.map(v=>v==='/work/youcoded'?'/other/checkout':v),{root:'/work'}),/isolated/);
 assert.throws(()=>parseActivationOptions(base.map(v=>v==='/work/youcoded/desktop/release/test'?'/opt/youcoded':v),{root:'/work'}),/isolated/);
 for(const bad of [[...base,'--mode','bad'],[...base,'--max-minutes','6'],[...base,'--out','/tmp/report.json'],base.slice(0,6)])assert.throws(()=>parseActivationOptions(bad,{root:'/work'}));
});
