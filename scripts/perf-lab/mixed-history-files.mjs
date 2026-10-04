// WHY: isolate seeded-history and per-session Files proofs from the fresh-chat controller.
// Offline fixture and pure verdicts; importing this module never starts an app.
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeSessionLines, nativeStoreSlug, stableUuid } from './fixture.mjs';
import { MIXED_ROLES, MIXED_MODEL_ID } from './mixed-provider.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const HISTORY_TURNS = 200;
export const HISTORY_PROFILE = 'bounded-turns';
// WHY: keep 200 real completed turns + every body/UUID and rendered page,
// without pretending a million-character synthetic conversation fits a custom
// provider whose catalog window is unknown (the app assumes 32k). This profile
// measures LIST/history switching, not megabyte context compaction.
export function boundedNativeSessionLines({sessionId,cwd,turns,startedAt,binding}) {
  if (!Number.isInteger(turns) || turns < 1 || turns > HISTORY_TURNS) throw Error('bounded turns out of range');
  const lines=nativeSessionLines({sessionId,cwd,turns,startedAt,binding,seed:`mixed-bounded:${cwd.split('/').pop()}`});
  for(let i=0;i<turns;i++) {
    const user=JSON.parse(lines[1+i*3]),assistant=JSON.parse(lines[2+i*3]);
    user.data.text=`Review ${cwd.split('/').pop()} note ${i+1}: check the saved step.`;
    const kind=i%3;
    assistant.data.text=kind===0
      ? `Verified step ${i+1}: the saved draft and response still match the session. Next, check the related note.`
      :kind===1
        ? `Step ${i+1} code:\n\n\`\`\`ts\nconst step = ${i+1}; // checked in this session\n\`\`\`\nThe next review remains local.`
        :`Step ${i+1} change:\n\n\`\`\`diff\n- pending step ${i+1}\n+ checked step ${i+1}\n\`\`\`\nKeep this file in its project.`;
    lines[1+i*3]=JSON.stringify(user);
    lines[2+i*3]=JSON.stringify(assistant);
  }
  return lines;
}
export const LOADED_TARGET = 240;
export const HISTORY_PROVIDER_ID = 'perf-mixed-private';
// The first JSONL line is SessionStore metadata, NOT a transcript event. Keeping
// it shifts every UUID/body by one and spuriously labels all six seeds corrupt.
export function parseNativeTranscript(text) {
  try {
    const [header,...events]=text.trim().split('\n').map(JSON.parse);
    if (header?.v !== 1 || !header?.sessionId || events.some(e=>!e?.type || !e?.uuid)) throw Error('invalid header/event');
    return events;
  } catch(e) {throw Error(`invalid native transcript: ${e.message}`);}
}
export function historySnapshot(events) {
  if (!Array.isArray(events) || events.some(e => !e?.uuid) || new Set(events.map(e => e.uuid)).size !== events.length) throw Error('seed event identities must be unique');
  return { events: events.map(e => ({ uuid: e.uuid, body: digest(e) })) };
}
export function verifyHistory(events, snapshot) {
  const expected = snapshot?.events;
  if (!Array.isArray(events) || !Array.isArray(expected) || events.length < expected.length) return { ok: false, reason: 'seed prefix missing' };
  const ok = expected.every((s,i) => events[i]?.uuid === s.uuid && digest(events[i]) === s.body) &&
    new Set(events.map(e => e.uuid)).size === events.length;
  return { ok, reason: ok ? null : 'seed identities, bodies or ordering changed' };
}
export function newEvents(events, snapshot) {
  if (!verifyHistory(events,snapshot).ok) throw Error('seed history changed before measuring new events');
  return events.slice(snapshot.events.length);
}
// WHY: 200 seeded turn-complete events must never satisfy the new control turn's
// persistence barrier. Fresh sessions use the same check over all events.
export function hasNewCompletion(events, snapshot) {
  return (snapshot ? newEvents(events,snapshot) : events).some(e => e.type === 'turn-complete');
}
export function assessHistoryRun({role, events, snapshot, requests, expectedText, toolId} = {}) {
  const integrity = verifyHistory(events,snapshot);
  if (!integrity.ok) return integrity;
  const fresh = newEvents(events,snapshot);
  if (role === 'idle') return { ok: fresh.length === 0 && !requests?.some(r=>r.role === role), reason: fresh.length ? 'idle history acquired new events' : null };
  if (role?.startsWith('stream-')) {
    // stream-1 has one CONTROL turn before its measured turn. Only the last
    // assistant part and last user marker belong to the measured request.
    const assistant = fresh.filter(e=>e.type==='assistant-text');
    const users = fresh.filter(e=>e.type==='user-message');
    const expectedCount = role === 'stream-1' ? 2 : 1;
    return { ok: assistant.length === expectedCount && users.length === expectedCount && assistant.at(-1)?.data?.text === expectedText &&
      users.at(-1)?.data?.text === `MIXED_ROLE:${role}` && fresh.filter(e=>e.type==='turn-complete').length === expectedCount };
  }
  if (role?.startsWith('tool-')) return { ok: fresh.filter(e=>e.type==='tool-use').length === 1 && fresh.some(e=>e.type==='tool-use' && e.data?.toolUseId === toolId) &&
    fresh.filter(e=>e.type==='tool-result').length === 1 && fresh.filter(e=>e.type==='turn-complete').length === 1 };
  return {ok:false,reason:'unknown role'};
}
export function classifyProviderRequests(requests,{controlCount=1,rejected=[]}={}) {
  if (rejected.length) return {ok:false,reason:`${rejected.length} refused provider requests (possibly summary/compaction): ${rejected.map(r=>r.message).join('; ')}`};
  if (!Array.isArray(requests)) return {ok:false,reason:'requests missing'};
  const counts = new Map();
  for(const r of requests) {
    if (!MIXED_ROLES.includes(r?.role) || r.role === 'idle') return {ok:false,reason:'unexpected/unknown provider request'};
    const key=`${r.role}:${!!r.followup}`; counts.set(key,(counts.get(key)??0)+1);
  }
  const ok = [...counts].every(([key,count]) => count <= (key === 'stream-1:false' ? controlCount+1 : 1));
  return {ok,reason:ok?null:'duplicate or summary provider request'};
}
export async function seedMixedHistories(fixture,{turns=HISTORY_TURNS,token,binding={providerId:HISTORY_PROVIDER_ID,modelId:MIXED_MODEL_ID}}={}) {
  if (!fixture?.root || !fixture?.home || !/^[a-zA-Z0-9-]{3,64}$/.test(token ?? '') || !Number.isInteger(turns) || turns < 120 || turns > 200) throw Error('private root, marker and 120..200 turns required');
  const roles = {};
  for (const role of MIXED_ROLES) {
    const cwd = join(fixture.root, 'projects', `mixed-${role}`);
    await mkdir(cwd, { recursive:true });
    const id = stableUuid(`mixed-history:${role}`);
    const dir = join(fixture.home,'.youcoded','sessions',nativeStoreSlug(cwd));
    await mkdir(dir,{recursive:true});
    const path = join(dir,`${id}.jsonl`);
    const lines = boundedNativeSessionLines({sessionId:id,cwd,turns,startedAt:Date.now()-turns*60_000-60_000,binding});
    const events=lines.slice(1).map(JSON.parse);
    const bodyChars=events.reduce((n,e)=>n+(['user-message','assistant-text'].includes(e.type)?e.data.text.length:0),0);
    if(bodyChars<20000 || bodyChars>40000) throw Error(`bounded history body unexpectedly ${bodyChars} chars`);
    await writeFile(path,lines.join('\n')+'\n',{flag:'wx'});
    const files=[];
    for (const [ext,body] of [['md',`# ${role} work notes\nPrivate marked work in ${role}.\n`],['ts',`export const role = ${JSON.stringify(role)};\n`]]) {
      const name=`${role}-${ext==='md'?'note':'work'}.${ext}`;
      await writeFile(join(cwd,name),body,{flag:'wx'});
      files.push({name,rel:name});
    }
    roles[role]={id,cwd,path,bytes:(await stat(path)).size,bodyChars,historyProfile:HISTORY_PROFILE,turns,files,snapshot:historySnapshot(events)};
  }
  return roles;
}
export async function readHistory(path) { return (await readFile(path,'utf8')).trim().split('\n').slice(1).map(JSON.parse); }
export function assessLoadedHistory(pane,id,target=LOADED_TARGET) {
  const ok = !!(pane?.sessionId===id && Number.isInteger(pane.authored) && pane.authored >= target &&
    pane.entries >= pane.authored && pane.markdown > 0 && pane.chars > 0 && Number.isInteger(pane.folded) && pane.folded >= 0 && pane.width > 0);
  return {ok,reason:ok?null:`loaded authored rows below ${target} or incorrect session/geometry`};
}
export function assessViewportDelivery(proof) {
  return proof?.role?.startsWith('stream-') ? proof.lastMarkerVisible === true
    : proof?.role?.startsWith('tool-') ? proof.ackVisible === true && proof.cardVisible === true : false;
}
export function assessLoadedAfterSwitch(pane,id,target=LOADED_TARGET) {
  // Folding intentionally replaces far-off authored bodies with spacers.
  // A background tab can momentarily have ALL rows folded on arrival; demand
  // identity/count + coherent folding here, and separately prove recent text
  // visibly unfurled after a real Jump to bottom outside the click clock.
  const ok=!!(pane?.sessionId===id && Number.isInteger(pane.authored) && pane.authored>=target &&
    pane.entries>=pane.authored && Number.isInteger(pane.folded) && pane.folded>=0 && pane.folded<=pane.entries && pane.width>0 && pane.chatWidth>0);
  return {ok,reason:ok?null:`authored row identity/count/folding below ${target}`};
}
export async function latestHistoryArrival(cdp,id,{bound=(p=>p),role,marker,cardId,maxPolls=30}={}) {
  // Real Jump re-arms the app's bottom-stick; fallback only when it is already
  // at bottom. A smooth scroll can take multiple frames under rAF throttling.
  const clicked=await bound(cdp.evaluate(`(() => {const root=document.querySelector('[data-chat-session-id=${JSON.stringify(id)}]');if(!root||root.closest('[aria-hidden="true"]'))return false;const button=root.querySelector('.jump-to-bottom');if(button){button.click();return true}const s=root.querySelector('.chat-scroll');if(!s)return false;s.scrollTop=s.scrollHeight;return true})()`),'real chat latest-arrival');
  if(!clicked)return {ok:false,reason:'latest chat not reachable'};
  let last=null;
  for(let i=0;i<maxPolls;i++) {
    const pane=marker ? await bound(cdp.evaluate(`(() => {const root=[...document.querySelectorAll('[data-chat-session-id]')].find(x=>x.dataset.chatSessionId===${JSON.stringify(id)}&&!x.closest('[aria-hidden="true"]'));const s=root?.querySelector('.chat-scroll');if(!s)return null;const inside=e=>{if(!e)return false;const a=e.getBoundingClientRect(),b=s.getBoundingClientRect();return a.height>0&&a.bottom>b.top&&a.top<b.bottom};const rows=[...s.querySelectorAll('.timeline-entry')];const marker=${JSON.stringify(marker)};const card=[...s.querySelectorAll('[data-tool-use-id]')].find(e=>e.dataset.toolUseId===${JSON.stringify(cardId??'')});return {sessionId:root.dataset.chatSessionId,authored:rows.filter(e=>/^(msg|turn)-/.test(e.dataset.entryKey??'')).length,entries:rows.length,folded:rows.filter(e=>e.style.height!==''&&!e.textContent).length,width:s.getBoundingClientRect().width,chatWidth:root.querySelector('.chat-pane')?.getBoundingClientRect().width??0,markdown:s.querySelectorAll('.timeline-entry p,.timeline-entry pre,.yc-code-block').length,chars:s.textContent?.length??0,distanceFromBottom:s.scrollHeight-s.scrollTop-s.clientHeight,role:${JSON.stringify(role)},lastMarkerVisible:rows.some(e=>inside(e)&&e.textContent?.includes(marker)),ackVisible:rows.some(e=>inside(e)&&e.textContent?.includes(marker)),cardVisible:inside(card)}})()`),'target latest viewport')
      : await bound(cdp.evaluate(historyPaneExpression),'latest authored content visible');
    last=pane;
    const base=assessLoadedAfterSwitch(pane,id).ok && pane.markdown>0 && pane.chars>100;
    if(base && (!marker || (pane.distanceFromBottom<=3 && assessViewportDelivery(pane)))) return {ok:true,pane};
    await bound(new Promise(ok=>setTimeout(ok,150)),'latest view settle');
  }
  return {ok:false,reason:marker?'target final marker/card not visible at settled bottom':'latest authored content did not unfold',pane:last};
}
export function assessDrawer(drawer,target,open) {
  if (!target || !drawer || drawer.sessionId !== target.sessionId || drawer.projectRoot !== target.projectRoot) return {ok:false,reason:'wrong drawer session/project identity'};
  if (drawer.open !== open) return {ok:false,reason:'drawer open state not restored'};
  if (!open) return {ok:true,reason:null};
  const ok = drawer.chatWidth > 0 && drawer.drawerWidth > 0 && target.files.every(f => drawer.rows?.includes(f)) &&
    !drawer.rows?.some(f => /^(stream|tool|idle)-/.test(f) && !target.files.includes(f));
  return {ok,reason:ok?null:'session Files rows/geometry missing or crossed'};
}
// Operates ONLY on the visible, session-identified chat; requests the actual
// UI's older-page sentinel by scrolling to the top. No direct reducer/IPC paging.
export const historyPaneExpression = `(() => {const p=[...document.querySelectorAll('[data-chat-session-id]')].find(x=>!x.closest('[aria-hidden="true"]'));if(!p)return null;const s=p.querySelector('.chat-scroll');const rows=[...p.querySelectorAll('.timeline-entry')];return {sessionId:p.dataset.chatSessionId,authored:rows.filter(e=>/^(msg|turn)-/.test(e.dataset.entryKey??'')).length,entries:rows.length,markdown:p.querySelectorAll('.timeline-entry p,.timeline-entry pre,.yc-code-block').length,chars:s?.textContent?.length??0,folded:rows.filter(e=>e.style.height!=='' && !e.textContent).length,width:s?.getBoundingClientRect().width??0,scrollTop:s?.scrollTop??null,chatWidth:p.querySelector('.chat-pane')?.getBoundingClientRect().width??0}})()`;
export const drawerExpression = `(() => {const p=[...document.querySelectorAll('[data-chat-session-id]')].find(x=>!x.closest('[aria-hidden="true"]'));if(!p)return null;const d=p.querySelector('.drawer-pane:not(.game-pane)');return {sessionId:p.dataset.chatSessionId,open:!!d,rows:d?[...d.querySelectorAll('button span.font-mono')].map(x=>x.textContent.trim()):[],chatWidth:p.querySelector('.chat-pane')?.getBoundingClientRect().width??0,drawerWidth:d?.getBoundingClientRect().width??0}})()`;
// WHY: session-error is display-only and never saved to JSONL; register before
// sending, snapshot while the private window still exists, and remove only ours.
export async function installNativeDiagnostics(cdp,{bound=(p=>p)}={}) {
  return bound(cdp.evaluate(`(() => {const previous=window.__mixedHistoryDiagnosis;if(previous?.handler)window.claude.off('transcript:event',previous.handler);const state={events:[],handler:null};state.handler=window.claude.on.transcriptEvent(e=>{if(['session-error','assistant-thinking','turn-complete','user-interrupt'].includes(e?.type)){state.events.push({sessionId:e.sessionId,type:e.type,data:e.data,timestamp:e.timestamp});if(state.events.length>80)state.events.shift()}});window.__mixedHistoryDiagnosis=state;return true})()`),'install private native diagnostics');
}
export async function captureNativeFailure(cdp,id,{bound=(p=>p),provider}={}) {
  const value=await bound(cdp.evaluate(`(() => {const id=${JSON.stringify(id)};const p=[...document.querySelectorAll('[data-chat-session-id]')].find(x=>x.dataset.chatSessionId===id);const events=window.__mixedHistoryDiagnosis?.events?.filter(e=>e.sessionId===id)??[];return {events,pane:p?{id:p.dataset.chatSessionId,hidden:!!p.closest('[aria-hidden="true"]'),text:(p.querySelector('.chat-scroll')?.textContent??'').slice(-1500),error:p.querySelector('[role="alert"]')?.textContent?.slice(-600)??null,rows:p.querySelectorAll('.timeline-entry').length}:null}})()`),'native failure before owned cleanup',3000);
  return {...value,provider:{requests:provider?.requests?.length??0,rejected:provider?.rejected?.length??0}};
}
export async function stopNativeDiagnostics(cdp,{bound=(p=>p)}={}) {
  return bound(cdp.evaluate(`(() => {const state=window.__mixedHistoryDiagnosis;if(!state)return false;window.claude.off('transcript:event',state.handler);delete window.__mixedHistoryDiagnosis;return true})()`),'stop private native diagnostics',3000);
}
export async function pageHistory(cdp,id,{bound=(p=>p),target=LOADED_TARGET,maxPages=18}={}) {
  const samples=[];
  for(let i=0;i<maxPages;i++) {
    const pane=await bound(cdp.evaluate(historyPaneExpression),'history page observation');
    samples.push(pane);
    if (assessLoadedHistory(pane,id,target).ok) return {ok:true,samples,pane};
    if (pane?.sessionId !== id) break;
    // Actual UI scroll makes ChatView's IntersectionObserver request older pages.
    await bound(cdp.evaluate(`(() => {const p=document.querySelector('[data-chat-session-id=${JSON.stringify(id)}] .chat-scroll');if(!p)return false;p.scrollTop=0;return true})()`),'scroll to older history');
    // Do not make eighteen repeated scrolls against the same in-flight page.
    const previous=pane?.entries??0;
    for(let attempt=0;attempt<30;attempt++) {
      await bound(new Promise(ok=>setTimeout(ok,100)),'older page settle');
      const next=await bound(cdp.evaluate(historyPaneExpression),'older page loaded');
      if(next?.entries > previous || next?.sessionId !== id) break;
    }
  }
  return {ok:false,reason:`loaded ${samples.at(-1)?.authored??0}/${target} authored rows`,samples,pane:samples.at(-1)};
}
export async function observeSessionFiles(cdp,history,{bound=(p=>p)}={}) {
  const dom=await bound(cdp.evaluate(drawerExpression),'visible session Files drawer');
  const listed=await bound(cdp.evaluate(`window.claude.artifacts.listSession(${JSON.stringify(history.id)},${JSON.stringify(history.cwd)})`),'session Files project verification');
  // There is no projectRoot DOM attribute. This is the actual IPC list for the
  // resolved session/root; distinct file markers in the visible drawer prove
  // the renderer followed the same root rather than a stale other-session list.
  return {...dom,projectRoot:listed?.ok && history.files.every(f=>listed.artifacts?.some(a=>a.path===f.rel && a.versions?.some(v=>v.sessionId===history.id))) ? history.cwd : null};
}
export async function registerSessionFiles(cdp,history,{bound=(p=>p)}={}) {
  const rels=history.files.map(f=>f.rel);
  // The app's appendVersion is the same write/read-sidecar route used by
  // scenario-artifacts and the real tool tracker; no hand-written sidecar.
  const result=await bound(cdp.evaluate(`(async()=>{const root=${JSON.stringify(history.cwd)},id=${JSON.stringify(history.id)},rels=${JSON.stringify(rels)};const appended=[];for(const rel of rels) appended.push(await window.claude.artifacts.appendVersion(root,id,{path:rel,kind:'internal',absolutePath:null,type:'create',author:'agent',toolUseId:'mixed-history-'+id+'-'+rel}));const listed=await window.claude.artifacts.listSession(id,root);return {appended,listed};})()`),'register session Files');
  if (result?.appended?.length !== rels.length || result.appended.some(r=>!r?.ok) || !result.listed?.ok || !rels.every(rel=>result.listed.artifacts?.some(a=>a.path===rel && a.versions?.some(v=>v.sessionId===history.id)))) throw Error(`session Files not tracked for ${history.id}: ${JSON.stringify(result).slice(0,600)}`);
  return {sessionId:history.id,projectRoot:history.cwd,files:rels,rows:result.listed.artifacts.map(a=>a.path)};
}
