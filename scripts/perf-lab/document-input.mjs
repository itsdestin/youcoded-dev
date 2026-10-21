// Bounded controller-side instrumentation only; never starts or discovers an app.
const finite = n => typeof n === 'number' && Number.isFinite(n);
export const DOCUMENT_ADAPTER_REVISION = 3;
// Both values derive from the same unrounded performance.now subtraction. Allow
// only floating-point serialization noise, not a tunable shorter action window.
export const DOCUMENT_ACTION_PRECISION_MS = 0.001;
export const DOCUMENT_CLOCK_HORIZON_MS = 12000;
export const DOCUMENT_CONTROL_TYPES = Object.freeze(['noop', 'renderer-block', 'main-block', 'slow-async', 'renderer-congestion']);
export const DOCUMENT_CONTROL_IDS = Object.freeze(DOCUMENT_CONTROL_TYPES.map(t => `control-${t}`));

// WHY: renderer performance.now and controller performance.now have unrelated
// origins. Each request brackets the renderer reading in controller time. Intersect
// pre/post brackets, allowing 1 ms drift over this <=12 s instrument window.
export function alignDocumentClocks(exchanges, { maxErrorMs = 25, driftMs = 1 } = {}) {
  const raw = exchanges;
  if (!Array.isArray(raw) || raw.length<2 || raw.some((x,i) => !x || ![x.beforeMs,x.rendererMs,x.afterMs].every(finite) || x.afterMs < x.beforeMs || (i>0 && (x.beforeMs<=raw[i-1].afterMs || x.rendererMs<=raw[i-1].rendererMs))) || raw.at(-1).afterMs-raw[0].beforeMs>DOCUMENT_CLOCK_HORIZON_MS) return {valid:false,raw,error:'Invalid monotonic exchange'};
  const offsetLowerMs = Math.max(...raw.map(x => x.rendererMs-x.afterMs)) - driftMs;
  const offsetUpperMs = Math.min(...raw.map(x => x.rendererMs-x.beforeMs)) + driftMs;
  const errorMs = (offsetUpperMs-offsetLowerMs)/2;
  return {valid:errorMs>=0 && errorMs<=maxErrorMs,raw,offsetLowerMs,offsetUpperMs,errorMs,driftMs,maxErrorMs};
}
export async function exchangeDocumentClock(cdp, now = () => performance.now()) {
  const beforeMs=now(), rendererMs=await cdp.evaluate('performance.now()'), afterMs=now();
  return {beforeMs,rendererMs,afterMs};
}

// WHY: do not await an input ack before scheduling another key. A main/browser
// route can stall while renderer timers remain healthy. Like dispatchPacedWheel,
// skip overdue slots and advance from actual dispatch; never replay a burst.
export function startDocumentInputTrain(cdp, {now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,everyMs=50,maxDurationMs=12000,maxSamples=256,maxOutstanding=16}={}) {
  if (![everyMs,maxDurationMs].every(n=>finite(n)&&n>0) || maxDurationMs>12000 || !Number.isInteger(maxSamples)||maxSamples<1||maxSamples>256 || !Number.isInteger(maxOutstanding)||maxOutstanding<1||maxOutstanding>16) throw Error('Invalid input train bounds');
  const startMs=now(),samples=[],pending=new Set();let timer,stopped=false,skippedSlots=0,failed=0,maxInflight=0,exhausted=false,deadline=startMs;
  const tick=()=>{
    if(stopped)return;
    const t=now();
    if(!finite(t)||t<deadline-everyMs){failed++;stopped=true;return;}
    if(t-startMs>=maxDurationMs || samples.length>=maxSamples){exhausted=true;return;}
    if(t<deadline){timer=schedule(tick,deadline-t);return;}
    const overdue=Math.floor((t-deadline)/everyMs);skippedSlots+=overdue;deadline+=overdue*everyMs;
    if(pending.size>=maxOutstanding){skippedSlots++;deadline=t+everyMs;timer=schedule(tick,everyMs);return;}
    const sample={token:samples.length,plannedMs:deadline,actualMs:t,ackMs:null};samples.push(sample);
    let command;
    try{command=cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'F24',code:'F24',windowsVirtualKeyCode:135,nativeVirtualKeyCode:135});}catch(error){command=Promise.reject(error);}
    const tracked=Promise.resolve(command).then(()=>{sample.ackMs=now();},error=>{failed++;sample.error=String(error);});
    pending.add(tracked);tracked.finally(()=>pending.delete(tracked));maxInflight=Math.max(maxInflight,pending.size);
    deadline=t+everyMs;timer=schedule(tick,everyMs);
  };
  tick();
  let stopping;
  return { snapshot:()=>({startMs,samples:samples.map(s=>({...s})),skippedSlots,failed,maxInflight,exhausted,everyMs,maxDurationMs,maxSamples,maxOutstanding}),
    stop(){stopped=true;cancel(timer);return stopping??=(async()=>{await Promise.all(pending);await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F24',code:'F24',windowsVirtualKeyCode:135,nativeVirtualKeyCode:135});})();},
    cancel(){stopped=true;cancel(timer);} };
}

export function summariseDocumentInput(train, receipt, clocks, {actionStartMs,actionEndMs,caseId,budgetMs=250}={}) {
  const reasons=[],raw=train?.samples??[],receipts=receipt?.receipts??[];
  // Recompute calibration rather than trusting valid:true. Pre/post exchanges
  // must bracket the actual action, all dispatches/acks and all DOM receipts.
  // The fixed drift allowance applies only within this 12 s calibration span.
  const calibrated=alignDocumentClocks(clocks?.raw);
  if(!calibrated.valid)reasons.push('Clock alignment unavailable/uncertain');
  clocks=calibrated;
  const first=clocks.raw?.[0],last=clocks.raw?.at(-1);
  if(!first||!last || first.afterMs>Math.min(actionStartMs,...raw.map(s=>s.actualMs))
      || last.beforeMs<Math.max(actionEndMs,...raw.map(s=>s.actualMs),...raw.map(s=>s.ackMs))
      || first.rendererMs>Math.min(...receipts.map(r=>r?.atMs)) || last.rendererMs<Math.max(...receipts.map(r=>r?.atMs)))reasons.push('Clock exchanges do not bracket action/input observation');
  if(!raw.length || raw.length!==receipts.length || receipt?.overflow!==0 || train?.failed!==0 || train?.skippedSlots!==0 || train?.exhausted!==false)reasons.push('Missing, skipped, overflowed or exhausted input train');
  if(![actionStartMs,actionEndMs].every(finite)||actionEndMs<actionStartMs || !raw.some(s=>s.actualMs<=actionStartMs) || !raw.some(s=>s.actualMs>=actionEndMs) || (actionEndMs-actionStartMs>=100&&!raw.some(s=>s.actualMs>actionStartMs&&s.actualMs<actionEndMs)))reasons.push('Input does not cover action and readiness tail');
  const samples=raw.map((s,i)=>{
    const r=receipts[i];
    if(s.token!==i || r?.token!==i || r?.caseId!==caseId || r?.trusted!==true || r?.correctTarget!==true || ![s.plannedMs,s.actualMs,s.ackMs,r?.atMs].every(finite) || s.actualMs<s.plannedMs || s.ackMs<s.actualMs || (i&&(s.actualMs<=raw[i-1].actualMs || r?.atMs<receipts[i-1]?.atMs)))reasons.push(`Invalid input ordinal/time ${i}`);
    const latencyLowerMs=r?.atMs-clocks?.offsetUpperMs-s.actualMs,latencyUpperMs=r?.atMs-clocks?.offsetLowerMs-s.actualMs;
    if(!finite(latencyLowerMs)||!finite(latencyUpperMs)||latencyUpperMs<0)reasons.push(`Invalid input clock at ${i}`);
    return {...s,receipt:r,latencyLowerMs,latencyUpperMs,dispatchLateMs:s.actualMs-s.plannedMs};
  });
  const lower=Math.max(...samples.map(s=>s.latencyLowerMs)),upper=Math.max(...samples.map(s=>s.latencyUpperMs));
  const complete=reasons.length===0;
  return {...train,complete,reasons,clocks,samples,caseId,receiptOverflow:receipt?.overflow,received:complete,trusted:complete,correctTarget:complete,
    // Legacy field is now explicitly a conservative upper bound, not an epoch
    // subtraction or a renderer-only delay. Signed lower bounds remain raw.
    latencyMs:complete?upper:null,latencyLowerMs:complete?lower:null,latencyUpperMs:complete?upper:null,
    receiptIdentitySemantics:'token is a local ordinal, NOT a transported event ID; pairing assumes FIFO delivery of this isolated inert-key train; count and monotonic receipt times are checked, undetectable equal-count substitution remains unsupported',
    latencySemantics:'controller-dispatch-to-DOM receipt upper bound; includes browser/main routing, NOT renderer-loop delay',
    budgetStatus:!complete?'incomplete':lower>budgetMs?'breach':upper>budgetMs?'inconclusive':'passed',
    lateInputCount:samples.filter(s=>s.latencyLowerMs>10).length,
    totalLatencyLowerMs:samples.reduce((n,s)=>n+s.latencyLowerMs,0),actionStartMs,actionEndMs};
}

// Reports rederive input validity and numeric bounds from raw evidence instead
// of trusting a supplied complete:true or a percentile from a partial train.
export function documentInputEvidenceValid(input,{caseId,operationMs}={}) {
  if(typeof caseId!=='string' || !caseId || input?.caseId!==caseId || !finite(operationMs) || operationMs<0
      || ![input?.actionStartMs,input?.actionEndMs].every(finite)
      || Math.abs(input.actionEndMs-input.actionStartMs-operationMs)>DOCUMENT_ACTION_PRECISION_MS)return false;
  if(!input || !Array.isArray(input.samples) || input.samples.some(s=>!s||typeof s!=='object'))return false;
  const clocks=alignDocumentClocks(input.clocks?.raw);
  const measured=summariseDocumentInput(input,{receipts:input.samples.map(s=>s.receipt),overflow:input.receiptOverflow},clocks,{actionStartMs:input.actionStartMs,actionEndMs:input.actionEndMs,caseId:input.caseId});
  return measured.complete && input.complete===true && ['passed','breach'].includes(measured.budgetStatus)
    && ['latencyMs','latencyLowerMs','latencyUpperMs','budgetStatus','lateInputCount','totalLatencyLowerMs'].every(k=>input[k]===measured[k])
    && input.samples.every((s,i)=>s.latencyLowerMs===measured.samples[i].latencyLowerMs&&s.latencyUpperMs===measured.samples[i].latencyUpperMs);
}

// Each remover runs even if a preceding remover fails. The enclosing external
// watchdog bounds the entire cleanup; timeout kills the owned family and forbids
// subsequent cases, rather than leaving a late action able to pollute another.
export async function cleanupDocumentResources(resources) {
  const errors=await Promise.all(resources.map(async([name,stop])=>{try{await stop();return null;}catch(e){return `${name}: ${e.message}`;}}));
  return errors.filter(Boolean);
}
