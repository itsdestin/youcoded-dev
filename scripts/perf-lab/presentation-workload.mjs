// Small real-content actions through the OWNED CDP window. No synthetic DOM
// animation, desktop-wide input injection, or input-to-photon inference.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const pane=`[...document.querySelectorAll('.chat-scroll')].find(p=>!p.closest('[aria-hidden="true"]'))`;
const pills=`[...document.querySelectorAll('[data-session-strip] [data-session-id]')].filter(p=>!p.closest('[role="menu"]')).map(p=>p.dataset.sessionId).filter(Boolean)`;

// WHY: SessionStrip order can differ from mounted ChatView order. The visible
// ChatView owns its stable session ID; an index-based lookup can certify the
// wrong tab when a pill moves or another pane remains mounted.
export function visibleChatIdentity(doc, expectedId) {
  const visible=[...doc.querySelectorAll('[data-chat-session-id]')]
    .filter(root=>root.getAttribute('aria-hidden')!=='true'&&root.querySelector('.chat-scroll'));
  if(visible.length!==1) return null;
  const root=visible[0],id=root.dataset.chatSessionId;
  if(!id||(expectedId!==undefined&&id!==expectedId)) return null;
  const pane=root.querySelector('.chat-scroll');
  return {id,entries:pane.querySelectorAll('.timeline-entry').length,chars:pane.textContent?.length??0};
}

// WHY: a second copy of the already-seeded real transcript, with a new file ID,
// exercises actual app session switching without starting a model/provider or
// loading fixture.medium's 2500 turns. Only the throwaway fixture is written.
export function secondPrivateTranscript(t) {
  const id=randomUUID(),path=join(dirname(t.path),`${id}.jsonl`);
  const source=readFileSync(t.path,'utf8');
  if(!source.includes(t.sessionId)) throw Error('fixture transcript ID absent');
  writeFileSync(path,source.replaceAll(t.sessionId,id),{flag:'wx',mode:0o600});
  return {...t,sessionId:id,path};
}
export function taskDurationDelta(after,before) {
  return Number.isFinite(after)&&Number.isFinite(before)&&after>=before?Math.round((after-before)*1000)/1000:null;
}

// WHY: awaiting CDP ack THEN sleeping makes the requested interval ack latency +
// sleep. Anchor slots to the monotonic clock; skip stale slots rather than replaying
// a burst after a stall. Bound inflight CDP sends and drain every ack/rejection.
export async function dispatchPacedWheel(cdp,{x,y,delta,count=540,intervalMs=1000/180,maxOutstanding=2,clock=()=>process.hrtime.bigint(),sleep:wait=sleep}={}) {
  if(!Number.isInteger(count)||count<1||!Number.isFinite(intervalMs)||intervalMs<=0||!Number.isInteger(maxOutstanding)||maxOutstanding<1) throw Error('invalid paced wheel settings');
  const stamps=[],latencies=[],pending=new Set(),start=clock();
  const intervalNs=BigInt(Math.round(intervalMs*1e6)),end=start+BigInt(count)*intervalNs;
  let acknowledged=0,failed=0,skippedSlots=0,lateSlots=0,maxInflight=0,deadline=start;
  for(let slot=0;slot<count;) {
    const now=clock();
    if(now>=end) {skippedSlots+=count-slot;break;}
    if(now<deadline) {await wait(Number(deadline-now)/1e6);continue;}
    // WHY: a fractionally late timer must not round UP to the next epoch slot
    // (that halved real-clock demand). Roll the next deadline from actual send;
    // only a whole interval of lateness/backpressure drops a slot.
    const late=Number((now-deadline)/intervalNs);
    if(late>0) {const dropped=Math.min(late,count-slot-1);slot+=dropped;skippedSlots+=dropped;deadline+=BigInt(dropped)*intervalNs;}
    if(pending.size>=maxOutstanding) {await Promise.race(pending);continue;}
    const stamp=clock();
    if(stamp<deadline) continue; // early timer wake must not send early
    if(stamp>=end) {skippedSlots+=count-slot;break;}
    if(stamp>deadline) lateSlots++;
    const index=stamps.length;
    stamps.push(stamp);
    latencies.push(null);
    let request;
    try {request=Promise.resolve(cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:delta,modifiers:0}));}
    catch(e) {request=Promise.reject(e);}
    const tracked=request.then(()=>{acknowledged++;latencies[index]=Number(clock()-stamp)/1e6;},()=>{failed++;});
    pending.add(tracked);
    tracked.finally(()=>pending.delete(tracked));
    maxInflight=Math.max(maxInflight,pending.size);
    slot++;
    deadline=stamp+intervalNs;
  }
  await Promise.all(pending);
  return {source:'paced-cdp-wheel',sent:stamps.length,acknowledged,failed,skippedSlots,lateSlots,maxInflight,
    deltaY:delta,requestedCount:count,requestedIntervalMs:intervalMs,
    dispatchTimestampsNs:stamps.map(s=>s.toString()),ackLatencyMs:latencies,
    dispatchIntervalsMs:stamps.slice(1).map((stamp,i)=>Number(stamp-stamps[i])/1e6)};
}
// WHY: an opposite leg can only regain the distance the first leg actually
// scrolls (at most 5400px, less when slots are skipped). Require enough room
// for a substantial >2000px journey, not an impossible fixed 6000px in both
// directions; this is a precondition, never a substitute for observed movement.
export function directionalRoom(count,delta,skippedSlots=0) {
  return Math.max(2000+Math.abs(delta), (count-skippedSlots)*Math.abs(delta)/2);
}
// WHY: renderer scroll events prove changing content position, not presentation.
// Sample only event timestamps/top (no geometry per event), cap retained data and
// return a remover so a failed leg cannot leave an observer on the pane.
export function observeScroll(pane,now,limit=1024) {
  const events=[];let last=pane.scrollTop,overflow=0;
  const listener=()=>{const top=pane.scrollTop;if(top===last)return;last=top;
    if(events.length<limit) events.push({timeMs:now(),scrollTop:top});else overflow++;};
  pane.addEventListener('scroll',listener,{passive:true});
  return {events,get overflow(){return overflow;},stop(){pane.removeEventListener('scroll',listener);}};
}
// WHY: gate failures must remain diagnosable even when the workload throws.
// These checks qualify input demand and visible scroll activity, NOT frames.
export function scrollEngagementFailures(e,probe,delta) {
  if(!e) return ['scroll engagement unavailable'];
  const failures=[],input=e.input,intervals=input?.dispatchIntervalsMs??[];
  const sorted=[...intervals].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
  const scroll=probe?.scroll;
  if(e.entries<10) failures.push('visible content has fewer than 10 entries');
  if(e.visible!=='visible') failures.push('window not visible');
  if(!e.focus) failures.push('window not focused');
  if(!Number.isFinite(e.before)||!Number.isFinite(e.after)||Math.abs(e.after-e.before)<=2000||(e.after-e.before)*delta<=0) failures.push('scroll movement/direction insufficient');
  if(!input||input.sent!==input.acknowledged||input.failed!==0) failures.push('input acknowledgements/failures do not match dispatches');
  if(!input||input.sent<400) failures.push('input sent fewer than 400 requests');
  if(!input||input.skippedSlots>100) failures.push('input skipped slots exceeded 100');
  if(!input||e.room<directionalRoom(input.requestedCount,delta,input.skippedSlots)) failures.push('directional room insufficient for actual demand');
  if(!Number.isFinite(median)||median>1000/120) failures.push(`input median interval above 120Hz threshold (${median??'unavailable'}ms)`);
  if(!scroll||scroll.events.length<10) failures.push('changing scroll events fewer than 10');
  if(!scroll||scroll.overflow!==0) failures.push('scroll observation overflow');
  if(scroll&&!scroll.events.every((v,i)=>i===0||(v.timeMs>=scroll.events[i-1].timeMs&&v.scrollTop!==scroll.events[i-1].scrollTop))) failures.push('scroll timestamps/position invalid');
  return failures;
}
export function recordPresentationLeg(evidence,leg,failureReasons=[],{throwOnFailure=true}={}) {
  const recorded={...leg,engaged:failureReasons.length===0,failureReasons};
  evidence.legs.push(recorded);
  if(failureReasons.length&&throwOnFailure) throw Error(`${leg.name} did not engage real visible content: ${failureReasons.join('; ')}`);
  return recorded;
}
export async function runPresentationWorkload(cdp,fixture,bound,deadline,evidence={sessions:[],legs:[],workload:'two resumed on-disk conversations; real wheel/pill/viewport events; idle control'}) {
  const transcript2=secondPrivateTranscript(fixture.transcripts.small);
  const sessions=evidence.sessions;
  for(const t of [fixture.transcripts.small,transcript2]) {
    const before=await bound(cdp.evaluate(pills));
    const created=await bound(cdp.evaluate(`window.claude.session.create({name:'presentation-${sessions.length}',cwd:${JSON.stringify(t.cwd)},skipPermissions:true,resumeSessionId:${JSON.stringify(t.sessionId)}})`));
    if(!created?.id) throw Error('resumed chat missing session ID');
    let identity=null;
    while(!identity&&Date.now()<deadline) {
      const after=await bound(cdp.evaluate(pills));
      const added=[...new Set(after)].filter(id=>!before.includes(id));
      const state=await bound(cdp.evaluate(`(() => {const p=${pane};return p?{entries:p.querySelectorAll('.timeline-entry').length,chars:p.textContent.length,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight}:null})()`));
      if(added.length>1) throw Error('ambiguous resumed tab');
      if(added.length===1&&state?.entries>=10&&state.chars>100&&state.scrollHeight>state.clientHeight) identity={id:added[0],state};
      else await sleep(120);
    }
    if(!identity) throw Error('resumed transcript not visibly rendered');
    sessions.push(identity);
  }
  await bound(cdp.send('Performance.enable'));
  const task=async()=>{
    const r=await bound(cdp.send('Performance.getMetrics'));
    return r.metrics?.find(m=>m.name==='TaskDuration')?.value??null;
  };
  // Bounded renderer-only diagnostics, never presented-frame evidence. One
  // observer spans legs, reset per leg; no fake animation or DOM writes.
  await bound(cdp.evaluate(`(() => {
    const p={active:false,raf:[],longtasks:[],supported:false,scroll:null};
    try {p.observer=new PerformanceObserver(list=>{if(p.active)for(const e of list.getEntries())if(p.longtasks.length<100)p.longtasks.push(e.duration)});p.observer.observe({entryTypes:['longtask']});p.supported=true;}catch{}
    const tick=t=>{if(p.active&&p.raf.length<3000)p.raf.push(t);requestAnimationFrame(tick)};requestAnimationFrame(tick);
    window.__presentationProbe=p;
  })()`));
  const measure=async(name,work,check)=>{
    const beforeTask=await task();
    await bound(cdp.evaluate(`(() => {const p=window.__presentationProbe;p.raf=[];p.longtasks=[];p.active=true;if(${JSON.stringify(name.startsWith('scroll-'))})p.scroll=(${observeScroll.toString()})(${pane},()=>performance.now());performance.mark(${JSON.stringify(`presentation-${name}-begin`)})})()`));
    const startNs=process.hrtime.bigint().toString();
    let engagement,workError;
    try {engagement=await work();}
    catch(e) {workError=e;throw e;}
    finally {
      const endNs=process.hrtime.bigint().toString();
      const probe=await bound(cdp.evaluate(`(() => {const p=window.__presentationProbe;p.active=false;p.scroll?.stop();performance.mark(${JSON.stringify(`presentation-${name}-end`)});const scroll=p.scroll?{events:p.scroll.events,overflow:p.scroll.overflow}:null;p.scroll=null;return {raf:p.raf,longtasks:p.longtasks,longtaskSupported:p.supported,scroll}})()`));
      const afterTask=await task();
      const failures=workError?[`work failed: ${String(workError)}`]:engagement===undefined?['work returned no engagement evidence']:(name.startsWith('scroll-')?check(engagement,probe):check(engagement,probe)?[]:['visible content/focus or action verification failed']);
      const gaps=probe.raf.slice(1).map((t,i)=>t-probe.raf[i]);
      recordPresentationLeg(evidence,{name,startNs,endNs,engagement,
        renderer:{scrollEvents:probe.scroll??null,taskDurationSeconds:taskDurationDelta(afterTask,beforeTask),longtaskSupported:probe.longtaskSupported,longtaskCount:probe.longtasks.length,longtaskTotalMs:probe.longtasks.reduce((a,b)=>a+b,0),rafCallbacks:probe.raf.length,rafGapMaxMs:gaps.length?Math.max(...gaps):null,
          note:'renderer callbacks/tasks only; NOT presented frames'}},failures,{throwOnFailure:!workError});
    }
  };
  // WHY: 540 slots at 180Hz request ~3s. Ten-pixel deltas stay inside the
  // prechecked directional room; actual dispatch and scroll events qualify
  // the demand, not requested rate or an inferred presented-frame count.
  for(const [name,delta] of [['scroll-up',-10],['scroll-down',10]]) {
    await measure(name,async()=>{
      const before=await bound(cdp.evaluate(`(() => {const p=${pane};return {y:p.scrollTop,x:p.getBoundingClientRect().x+Math.min(100,p.clientWidth/2),top:p.getBoundingClientRect().top+Math.min(180,p.clientHeight/2),max:p.scrollHeight-p.clientHeight}})()`));
      const room=delta<0?before.y:before.max-before.y;
      if(room<directionalRoom(540,delta)) throw Error('scroll leg lacks directional room');
      const input=await dispatchPacedWheel({send:(method,payload)=>bound(cdp.send(method,payload))},{x:before.x,y:before.top,delta});
      await sleep(200);
      const after=await bound(cdp.evaluate(`(() => {const p=${pane};return {y:p.scrollTop,entries:p.querySelectorAll('.timeline-entry').length,visible:document.visibilityState,focus:document.hasFocus()}})()`));
      return {before:before.y,after:after.y,room,...after,input};
    },(e,probe)=>scrollEngagementFailures(e,probe,delta));
  }
  await measure('switch',async()=>{
    const changes=[];
    for(let i=0;i<8;i++) {
      const target=sessions[i%2].id;
      const clicked=await bound(cdp.evaluate(`(() => {const p=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(e=>e.dataset.sessionId===${JSON.stringify(target)});if(!p)return false;p.click();return true})()`));
      await sleep(270);
      const state=await bound(cdp.evaluate(`(() => {const actual=(${visibleChatIdentity.toString()})(document);return {...actual,visible:document.visibilityState,focus:document.hasFocus()}})()`));
      changes.push({target,clicked,...state});
    }
    return changes;
  },e=>e.length===8&&e.every(x=>x.clicked&&x.id===x.target&&x.entries>=10&&x.chars>100&&x.visible==='visible'&&x.focus));
  const initial=await bound(cdp.evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})'));
  await measure('viewport-resize',async()=>{
    const widths=[1360,1500,1360,1500,1360,1500,1360,1500];
    const observed=[];
    for(const width of widths) {
      await bound(cdp.send('Emulation.setDeviceMetricsOverride',{width,height:Math.min(900,initial.height),deviceScaleFactor:initial.dpr,mobile:false}));
      await sleep(280);
      observed.push(await bound(cdp.evaluate(`({width:innerWidth,visible:document.visibilityState,entries:(${pane})?.querySelectorAll('.timeline-entry').length})`)));
    }
    await bound(cdp.send('Emulation.clearDeviceMetricsOverride'));
    return {widths,observed,restored:await bound(cdp.evaluate('({width:innerWidth,height:innerHeight})'))};
  },e=>e.observed.every((x,i)=>x.width===e.widths[i]&&x.visible==='visible'&&x.entries>=10)&&e.restored.width===initial.width);
  await measure('idle',async()=>{await sleep(1200);return await bound(cdp.evaluate('({visible:document.visibilityState,focus:document.hasFocus()})'));},e=>e.visible==='visible'&&e.focus);
  return evidence;
}
