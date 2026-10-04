// Opt-in native evidence for the existing mixed workload, not a new workload.
import { readFileSync, writeFileSync } from 'node:fs';
import * as capture from './presentation-capture.mjs';
import { parsePresentationLog, summarizePresentationLegs } from './presentation-protocol.mjs';

export async function markPresentationLeg(cdp, legs, name, bound, clock=()=>process.hrtime.bigint()) {
  await bound(cdp.evaluate(`performance.mark(${JSON.stringify(`presentation-${name}-begin`)})`));
  const leg={name,startNs:clock().toString(),engaged:false};
  legs.push(leg);
  let ended=false;
  return async engaged=>{
    if(ended) throw Error('presentation leg already ended');
    ended=true;leg.endNs=clock().toString();
    await bound(cdp.evaluate(`performance.mark(${JSON.stringify(`presentation-${name}-end`)})`));
    leg.engaged=engaged===true;
  };
}
export function assessMixedPresentation({debug,trace,parsed,legs,workloadLegs,stopped,error}) {
  if(error||!stopped||trace?.status!=='complete'||trace?.markerPairs?.status!=='complete'||!workloadLegs?.length||workloadLegs.some(l=>!l.engaged))return 'incomplete';
  if(!debug)return 'control-no-presentation';
  if(parsed?.status!=='conditional-surface'||legs?.length!==workloadLegs.length||legs.some(l=>l.status!=='conditional-surface'))return 'incomplete';
  return 'conditional-surface-evidence';
}
export async function startMixedPresentation(app,o,bound,{traceFactory=capture.browserTrace}={}) {
  const pending=Promise.resolve().then(()=>traceFactory(app.cdpPort,Date.now()+o.maxMinutes*60000));
  let handle;
  try {handle=await bound(pending);}
  catch(e) {
    // WHY: Promise.race timeouts do not cancel the trace connection. A handle
    // acquired late still belongs to us and must stop/close its own capture.
    pending.then(late=>late.stop()).catch(error=>console.error(`late owned trace cleanup: ${error}`));
    throw e;
  }
  const state={legs:[],traceHandle:handle,trace:null,error:null,stopped:false};
  state.begin=name=>markPresentationLeg(app.cdp,state.legs,name,bound);
  state.stop=async()=>{
    if(state.stopped)return;
    state.stopped=true;
    const t=await handle.stop();
    state.trace={...(o.protocolDebug==='on'?capture.assessCaptureTrace(t):capture.assessTrace(t)),events:t.events.length,markerPairs:capture.assessLegMarkers(t.events,state.legs)};
    writeFileSync(o.out+'.presentation.trace.json',JSON.stringify({categories:capture.PRESENTATION_TRACE_CATEGORIES,metadata:state.trace,traceEvents:t.events}),{flag:'wx',mode:0o600});
  };
  return state;
}
export function finishMixedPresentation(state,app,o,{appStopped}) {
  const debug=o.protocolDebug==='on';
  const result={status:'incomplete',workloadLegs:state?.legs??[],trace:state?.trace??null,error:state?.error??null,
    scope:'whole-leg evidence only, not proof of presentation at each switch; conditional structural window association; inherited stderr has no certified PID/connection; deliberately spaced switches, not continuous frame demand',
    files:{protocol:o.out+'.wayland.log',trace:o.out+'.presentation.trace.json'},protocolCapture:app?.protocolCapture??null};
  let parsed=null;
  try {
    // WHY: even the logging-off control must finish its bounded stderr capture;
    // a late mutable error must never coexist with a previously certified verdict.
    if(app?.protocolCapture?.error) throw Error(app.protocolCapture.error);
    if(app?.protocolCapture?.truncated) throw Error('stderr capture truncated');
    if(debug) {
      const p=app?.protocolCapture;
      if(!p||!appStopped)throw Error('protocol capture or confirmed app cleanup missing');
      parsed=parsePresentationLog(readFileSync(result.files.protocol,'utf8'),{truncated:p.truncated,error:p.error});
      result.presentation={...parsed,samples:undefined,discards:undefined,unresolved:undefined,presented:parsed.samples.length,pending:parsed.pending.length,
        flags:[...new Set(parsed.samples.map(s=>s.flags))],legs:summarizePresentationLegs(parsed,result.workloadLegs)};
    }
  }catch(e){result.error=String(e);}
  result.status=assessMixedPresentation({debug,trace:result.trace,parsed,legs:result.presentation?.legs,workloadLegs:result.workloadLegs,stopped:appStopped&&state?.stopped,error:result.error});
  return result;
}
