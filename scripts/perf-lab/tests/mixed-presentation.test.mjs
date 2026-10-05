import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusOwnedTargetAndCaptureEnvironment, mixedPhaseFocusConfirmed, parseOptions } from '../mixed-activity.mjs';
import { markPresentationLeg, assessMixedPresentation, startMixedPresentation, finishMixedPresentation } from '../mixed-presentation.mjs';

test('native workload environment is captured only after focusing the owned target', async () => {
  const order = [];
  const cdp = { send: async (method) => { order.push(`send:${method}`); } };
  const evalJs = async (_code, label) => {
    order.push(`sample:${label}`);
    return { focus: true, visibility: 'visible', viewport: { width: 1400, height: 900 } };
  };
  const bound = async (promise, label) => { order.push(`bound:${label}`); return promise; };

  const environment = await focusOwnedTargetAndCaptureEnvironment(cdp, evalJs, bound);
  assert.deepEqual(order, [
    'send:Page.bringToFront', 'bound:private target focus',
    'sample:display state after private focus',
  ]);
  assert.deepEqual(environment, { focus: true, visibility: 'visible', viewport: { width: 1400, height: 900 } });
});

test('mixed cadence refuses a focus loss observed during the measured phase', () => {
  const actions = Array.from({ length: 12 }, () => ({ phase: 'mixed', focus: true, visible: true }));
  const report = { actions, cadenceSamples: [{ focus: true, visibility: 'visible' }] };
  assert.equal(mixedPhaseFocusConfirmed(report, { focus: true, visibility: 'visible' }), true);
  report.cadenceSamples[0].focus = false;
  assert.equal(mixedPhaseFocusConfirmed(report, { focus: true, visibility: 'visible' }), false);
  report.cadenceSamples[0].focus = true;
  actions[4].focus = false;
  assert.equal(mixedPhaseFocusConfirmed(report, { focus: true, visibility: 'visible' }), false);
  actions[4].focus = true;
  assert.equal(mixedPhaseFocusConfirmed(report, { focus: false, visibility: 'visible' }), false);
});

test('marked leg brackets controller work and engagement is explicit',async()=>{
  const calls=[],legs=[];let clock=100n;
  const cdp={evaluate:async code=>{calls.push(code);}};
  const end=await markPresentationLeg(cdp,legs,'mixed',p=>p,()=>clock++);
  assert.equal(legs.length,1);assert.equal(legs[0].engaged,false);
  await end(true);
  assert.deepEqual(legs[0],{name:'mixed',startNs:'100',endNs:'101',engaged:true});
  assert.match(calls[0],/presentation-mixed-begin/);assert.match(calls[1],/presentation-mixed-end/);
  await assert.rejects(()=>end(true),/already ended/);
});
test('presentation verdict requires complete markers, trace, engagement and raw protocol; quiet is not zero drops',()=>{
  const input={debug:true,trace:{status:'complete',markerPairs:{status:'complete'}},parsed:{status:'conditional-surface'},legs:[{name:'mixed',status:'conditional-surface'}],workloadLegs:[{engaged:true}],stopped:true};
  assert.equal(assessMixedPresentation(input),'conditional-surface-evidence');
  for(const bad of [{...input,stopped:false},{...input,error:'failed'}, {...input,trace:{status:'complete',markerPairs:{status:'incomplete'}}},{...input,parsed:{status:'unsupported'}},{...input,legs:[]},{...input,workloadLegs:[{engaged:false}]}])assert.equal(assessMixedPresentation(bad),'incomplete');
  assert.equal(assessMixedPresentation({...input,debug:false,parsed:null,legs:[]}), 'control-no-presentation');
});
test('late trace handle after controller timeout is stopped rather than orphaned',async()=>{
  let resolve,stops=0;
  const pending=new Promise(ok=>{resolve=ok;});
  await assert.rejects(()=>startMixedPresentation({cdpPort:1},{maxMinutes:1},async()=>{throw Error('deadline');},{traceFactory:()=>pending}),/deadline/);
  resolve({stop:async()=>{stops++;}});
  await new Promise(ok=>setImmediate(ok));
  assert.equal(stops,1);
});
test('quiet capture with incomplete stderr drain cannot be certified as a complete control',()=>{
  const state={stopped:true,legs:[{engaged:true}],trace:{status:'complete',markerPairs:{status:'complete'}}};
  const app={protocolCapture:{error:'stderr drain timeout',truncated:false}};
  const r=finishMixedPresentation(state,app,{protocolDebug:'off',out:'/private/test'},{appStopped:true});
  assert.equal(r.status,'incomplete');
  assert.match(r.error,/drain timeout/);
});
const root='/private/worktree';
const base=['--checkout','/private/checkout','--app-dir','/private/package','--out',`${root}/scratch/perf-lab/native-mixed.json`];
test('mixed native presentation requires explicit socket and logging choice without X11 fallback',()=>{
  const o=parseOptions([...base,'--wayland-socket','/run/user/1000/wayland-0','--protocol-debug','on'],root);
  assert.equal(o.waylandSocket,'/run/user/1000/wayland-0');
  assert.equal(o.protocolDebug,'on');
  assert.equal(o.realDisplay,undefined);
  assert.throws(()=>parseOptions([...base,'--wayland-socket','relative'],root),/absolute|canonical/);
  assert.throws(()=>parseOptions([...base,'--wayland-socket','/run/user/1000/wayland-0','--real-display',':0'],root),/exclusive/);
  assert.throws(()=>parseOptions([...base,'--real-display',':0','--protocol-debug','on'],root),/Wayland/);
  assert.throws(()=>parseOptions([...base,'--wayland-socket','/run/user/1000/wayland-0','--protocol-debug','maybe'],root),/on or off/);
});
