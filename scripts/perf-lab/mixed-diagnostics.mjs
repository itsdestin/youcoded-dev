// WHY: isolate read-only CDP evidence for an owned private package; none of these
// helpers attach to production or change product/renderer scheduling policy.
import { connect } from './cdp.mjs';

export async function collectArrivalGeometry(cdp,id,{bound=(p=>p),marker,cardId}={}) {
  return bound(cdp.evaluate(`(() => {
    const id=${JSON.stringify(id)},root=[...document.querySelectorAll('[data-chat-session-id]')].find(p=>p.dataset.chatSessionId===id);
    const s=root?.querySelector('.chat-scroll');if(!s)return null;
    const rows=[...s.querySelectorAll('.timeline-entry')];
    const view=s.getBoundingClientRect();
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,visible:r.height>0&&r.bottom>view.top&&r.top<view.bottom}};
    const indexOf=e=>e?rows.findIndex(row=>row===e||row.contains(e)):null;
    const match=rows.find(e=>e.textContent?.includes(${JSON.stringify(marker??'')}));
    const card=[...s.querySelectorAll('[data-tool-use-id]')].find(e=>e.dataset.toolUseId===${JSON.stringify(cardId??'')});
    return {id,hidden:!!root.closest('[aria-hidden="true"]'),rows:rows.map((e,index)=>({index,key:e.getAttribute('data-entry-key'),textHead:e.textContent?.slice(0,90),textTail:e.textContent?.slice(-90),...rect(e)})),marker:{index:indexOf(match),...rect(match)},card:{index:indexOf(card),...rect(card)},scroll:{top:s.scrollTop,client:s.clientHeight,height:s.scrollHeight,viewport:rect(s)},jump:{exists:!!root.querySelector('.jump-to-bottom'),text:root.querySelector('.jump-to-bottom')?.textContent??null}};
  })()`),'ordered private arrival geometry',3000);
}
export async function browserWindowState(port,targetId,{getVersion=async()=>{const response=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(2500)});if(!response.ok)throw Error(`private browser endpoint ${response.status}`);return response.json()},connect:open=connect}={}) {
  const endpoint=await getVersion();
  if(!endpoint.webSocketDebuggerUrl || !targetId) throw Error('owned browser endpoint or page target ID missing');
  const browser=await open(endpoint.webSocketDebuggerUrl);
  try {
    const result=await browser.send('Browser.getWindowForTarget',{targetId});
    const bounds=await browser.send('Browser.getWindowBounds',{windowId:result.windowId});
    return {targetId,windowId:result.windowId,bounds:bounds.bounds??null};
  } finally {browser.close();}
}
export function inspectCadenceTrace(trace) {
  const frames=(trace?.events??[]).filter(e=>/BeginFrame|DrawFrame|ScheduleBeginFrame|BeginMainFrame|RequestMainThreadFrame/.test(e.name??''));
  return {ok:!!(trace?.complete && trace.dataLossOccurred===false && !trace.truncated && !trace.error && trace.events?.length && frames.length),events:trace?.events?.length??0,frameEvents:frames.length,byName:Object.fromEntries([...new Set(frames.map(e=>e.name))].map(name=>[name,frames.filter(e=>e.name===name).length])),pids:[...new Set(frames.map(e=>e.pid).filter(Number.isInteger))]};
}
export async function recordBrowserTrace(port,{bound=(p=>p),ms=2000,limit=30000}={}) {
  const version=await bound(fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(2500)}).then(r=>r.json()),'owned browser websocket',3500);
  if(!version?.webSocketDebuggerUrl)throw Error('private browser websocket unavailable');
  const browser=await bound(connect(version.webSocketDebuggerUrl),'owned browser CDP',3500);
  const trace={complete:false,dataLossOccurred:null,truncated:false,events:[],categories:'devtools.timeline,blink,cc,viz,gpu,disabled-by-default-devtools.timeline.frame'};
  let finish;const done=new Promise(ok=>{finish=ok});
  browser.on('Tracing.dataCollected',p=>{for(const e of p.value??[])if(trace.events.length<limit)trace.events.push(e);else trace.truncated=true});
  browser.on('Tracing.tracingComplete',p=>{trace.dataLossOccurred=p?.dataLossOccurred??null;trace.complete=!p?.stream&&p?.dataLossOccurred===false;finish()});
  try {
    await bound(browser.send('Tracing.start',{categories:trace.categories,options:'record-as-much-as-possible',transferMode:'ReportEvents'}),'private short trace start',4000);
    await bound(new Promise(ok=>setTimeout(ok,ms)),'private short trace interval',ms+2000);
    await bound(browser.send('Tracing.end'),'private short trace end',4000);
    await bound(done,'private short trace complete',7000);
  } catch(e) {trace.error=String(e)} finally {browser.close()}
  return trace;
}
