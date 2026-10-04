// WHY: refuse a 'fast' six-tab result unless five actual producers cover every mixed switch and all saved outputs survive.
// Private packaged-app runner only; importing this module does not launch anything.
import { createServer } from 'node:net';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, lstatSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture, nativeStoreSlug } from './fixture.mjs';
import { loadPackageStamp, refusePackageProcesses } from './gpu-theme.mjs';
import { launchApp, validateWaylandSocket } from './launch.mjs';
import { startMixedPresentation, finishMixedPresentation } from './mixed-presentation.mjs';
import { startMixedCpuProfile } from './mixed-cpu-profile.mjs';
import { createMixedToolFixture, startMixedProvider, completedToolOutput, MIXED_MODEL_ID, MIXED_ROLES } from './mixed-provider.mjs';
import { installProbe, readProbe, stopProbe } from './scenario-workload.mjs';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';
import { readRendererInfo } from './gpu.mjs';
import { cpuSnapshot, pssMb } from './procs.mjs';
import { collectArrivalGeometry, browserWindowState, recordBrowserTrace, inspectCadenceTrace } from './mixed-diagnostics.mjs';
import { HISTORY_TURNS, LOADED_TARGET, seedMixedHistories, readHistory, verifyHistory, newEvents, assessHistoryRun, assessLoadedHistory, assessLoadedAfterSwitch, latestHistoryArrival, assessViewportDelivery, assessDrawer, classifyProviderRequests, historyPaneExpression, drawerExpression, hasNewCompletion, parseNativeTranscript, pageHistory, registerSessionFiles, observeSessionFiles, installNativeDiagnostics, captureNativeFailure, stopNativeDiagnostics } from './mixed-history-files.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const wait = ms => new Promise(ok => setTimeout(ok, ms));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const producerRoles = MIXED_ROLES.filter(role => role !== 'idle');
const streamRoles = MIXED_ROLES.filter(role => role.startsWith('stream-'));
const toolRoles = MIXED_ROLES.filter(role => role.startsWith('tool-'));

export function parseOptions(argv, root = ROOT) {
  const o = { maxMinutes: 5, checkout: join(root, 'youcoded'), streamSeconds: 30, toolSeconds: 40, cdpPort: 9592, history: 'fresh', files: 'closed', cpuProfile: 'off', out: join(root, 'scratch/perf-lab/mixed-activity.json') };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!['--checkout', '--app-dir', '--out', '--real-display', '--max-minutes', '--stream-seconds', '--tool-seconds', '--cdp-port', '--history', '--files', '--wayland-socket', '--protocol-debug', '--cpu-profile'].includes(k) || !v || v.startsWith('--')) throw Error(`Invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  for (const key of ['checkout', 'appDir', 'out']) if (!isAbsolute(o[key] ?? '')) throw Error(`--${key} requires an absolute path`);
  // WHY: native presentation must never silently fall back to X11 or log the live app.
  if (o.waylandSocket) {
    if (!isAbsolute(o.waylandSocket) || resolve(o.waylandSocket) !== o.waylandSocket) throw Error('Wayland socket requires canonical absolute path');
    if (o.realDisplay) throw Error('Wayland and X11 displays are mutually exclusive');
    o.protocolDebug ??= 'on';
    if (!['on','off'].includes(o.protocolDebug)) throw Error('--protocol-debug must be on or off');
  } else {
    if (o.protocolDebug !== undefined) throw Error('protocol logging requires Wayland');
    if (!/^:(0|[1-9]\d*)$/.test(o.realDisplay ?? '') || o.realDisplay === ':99') throw Error('--real-display :N required; :99 reserved');
  }
  if(!['on','off'].includes(o.cpuProfile))throw Error('--cpu-profile must be on or off');
  if(o.cpuProfile==='on'&&o.protocolDebug==='on')throw Error('CPU profile requires protocol logging off');
  if(existsSync(o.out+'.cpuprofile.json'))throw Error('CPU profile output already exists');
  for (const [name, min, max] of [['maxMinutes', 1, 10], ['streamSeconds', 1, 40], ['toolSeconds', 1, 45], ['cdpPort', 1024, 65535]]) {
    if (!/^[1-9]\d*$/.test(String(o[name])) || +o[name] < min || +o[name] > max) throw Error(`--${name} must be ${min}..${max}`);
    o[name] = Number(o[name]);
  }
  // WHY: the last of 12 switches must still have >=750 deltas and tool progress under load.
  if (o.streamSeconds < 19 || o.toolSeconds <= o.streamSeconds) throw Error('mixed protocol requires stream >=19s and tools longer than streams');
  if (!['fresh','long'].includes(o.history) || !['closed','open'].includes(o.files) || (o.files === 'open' && o.history !== 'long')) throw Error('files open requires long history; use --history long --files open');
  if (o.waylandSocket && ['.wayland.log','.presentation.trace.json'].some(suffix=>existsSync(o.out+suffix))) throw Error('presentation output already exists');
  const scratch = join(root, 'scratch/perf-lab') + sep;
  if (resolve(o.out) !== o.out || !o.out.startsWith(scratch) || existsSync(o.out) || existsSync(o.out + '.png') || existsSync(o.out + '.failure.png') || existsSync(o.out + '.pre-cleanup.png') || existsSync(o.out + '.first-slow.trace.json') || ['stream-1', 'tool-1', 'tool-2'].some(role => existsSync(`${o.out}.${role}.png`))) throw Error('output must be new canonical worktree scratch/perf-lab path');
  for (let p = dirname(o.out); p !== dirname(root); p = dirname(p)) {
    if (existsSync(p) && (lstatSync(p).isSymbolicLink() || !lstatSync(p).isDirectory())) throw Error('output parent must be a real directory');
    if (p === root) break;
  }
  return o;
}
// WHY: a probe with zero replies, rejected replies or an unresolved IPC call cannot certify responsiveness.
// rAF callbacks are a scheduling proxy, not presented frames. A 1Hz callback
// cadence even in a focused visible private window means this run's display
// condition is uncontrolled; report it rather than crediting app performance.
export function assessCadence(sample) {
  const ok=!!(sample && sample.focus===true && sample.visibility==='visible' && sample.longtaskSupported===true &&
    finite(sample.observedMs) && sample.observedMs>=1800 && finite(sample.framesPerSec) && sample.framesPerSec>=20 && sample.frames>=36);
  return {status:ok?'calibrated':'uncontrolled',reason:ok?null:'visible focused rAF cadence unconfirmed or throttled (<20 callbacks/s); not a displayed-frame metric'};
}
// WHY: the startup target can be backgrounded; only measure after focusing our owned target,
// and keep both snapshots so the report distinguishes initial state from workload conditions.
export async function focusOwnedTargetAndCaptureEnvironment(cdp, evalJs, bound) {
  await bound(cdp.send('Page.bringToFront'), 'private target focus', 3000);
  return evalJs('({focus:document.hasFocus(),visibility:document.visibilityState,viewport:{width:innerWidth,height:innerHeight}})', 'display state after private focus');
}
export function mixedPhaseFocusConfirmed(report, endState) {
  return endState?.focus === true && endState.visibility === 'visible' &&
    report.actions?.filter(a => a.phase === 'mixed').length === 12 &&
    report.actions.filter(a => a.phase === 'mixed').every(a => a.focus === true && a.visible === true) &&
    (report.cadenceSamples ?? []).every(s => s.focus === true && s.visibility === 'visible');
}
export function assessIpc(p) {
  return !!(p && Number.isInteger(p.pings) && p.pings > 0 && p.rejectedPings === 0 && p.openStallMs === null &&
    finite(p.medianMs) && finite(p.p95Ms) && finite(p.maxMs) && p.medianMs >= 0 && p.p95Ms >= p.medianMs && p.maxMs >= p.p95Ms);
}
// Use the ChatView root identity, not SessionStrip's overflow-dependent visibleSessions indexes.
export function assessVisiblePane(panes, id) {
  return typeof id === 'string' && !!id && Array.isArray(panes) && panes.filter(p => !p.hidden).length === 1 &&
    panes.some(p => p.id === id && !p.hidden && p.hasScroll);
}
export function assessIdle({ pane, events, requests, snapshot } = {}) {
  const noNew = snapshot ? verifyHistory(events,snapshot).ok && newEvents(events,snapshot).length === 0 : pane?.timelineCount === 0 && Array.isArray(events) &&
    !events.some(e => ['user-message', 'assistant-text', 'tool-use', 'tool-result', 'turn-complete'].includes(e.type));
  return !!(pane?.hasScroll && noNew && Array.isArray(requests) && !requests.some(r => r.role === 'idle'));
}
export function assessToolCard(card, role, token) {
  return card?.id === `mixed-${role}-${token}` && typeof card.text === 'string' &&
    card.text.includes('Ran a command') && card.text.includes(`Run owned ${role} progress fixture`);
}
export function assessStreamDisplay(text, role, count) {
  return typeof text === 'string' && text.includes(`MIXED_TEXT:${role}:0000`) && text.includes(`MIXED_TEXT:${role}:${String(count - 1).padStart(4, '0')}`);
}
// WHY: the native store coalesces assistant deltas and may flush only after completion.
// Admit on the already-writing provider request; inspect visible user/output at the switch,
// then require exact persisted assistant text only after turn-complete.
export function admitLiveControl(request, events, requests) {
  return request?.role === 'stream-1' && finite(request.firstWriteAt) && request.firstWriteAt > 0 &&
    request.endedAt === null && request.deltasSent > 0 && Array.isArray(events) && Array.isArray(requests) &&
    !requests.some(r => ['tool-1', 'tool-2', 'stream-2', 'stream-3'].includes(r.role)) &&
    !events.some(e => e.type === 'user-message' && e.data?.text !== 'MIXED_ROLE:stream-1');
}
export function assessControl(c) {
  const [out, back] = c?.actions ?? [];
  return !!(c?.persistedExact && c.otherProducersStarted === false && c.actions.length === 2 &&
    out?.from === 'idle' && out.to === 'stream-1' && back?.from === 'stream-1' && back.to === 'idle' &&
    out.visible && out.content && back.visible && back.content &&
    coversAction({ start: c.firstWriteAt, end: c.lastWriteAt }, out) &&
    coversAction({ start: c.firstWriteAt, end: c.lastWriteAt }, back));
}
export function assessMixedProgress(p) {
  if (!finite(p?.early?.at) || !finite(p?.late?.at) || p.late.at - p.early.at < 15_000) return false;
  return streamRoles.every(role => Number.isInteger(p.early.streams?.[role]) && p.early.streams[role] > 0 &&
      Number.isInteger(p.late.streams?.[role]) && p.late.streams[role] - p.early.streams[role] >= 750) &&
    toolRoles.every(role => Number.isInteger(p.early.tools?.[role]) && p.early.tools[role] >= 1 &&
      Number.isInteger(p.late.tools?.[role]) && p.late.tools[role] - p.early.tools[role] >= 5);
}
export function cpuSeconds(before, after, hz) {
  if (!Number.isSafeInteger(hz) || hz <= 0) throw Error('unknown or invalid CLK_TCK HZ');
  return [...before].reduce((total, [pid, ticks]) => total + Math.max(0, (after.get(pid) ?? ticks) - ticks) / hz, 0);
}
export function coversAction(interval, action) { return finite(interval?.start) && finite(interval?.end) && finite(action?.start) && finite(action?.end) && interval.start <= action.start && interval.end >= action.end && action.end > action.start; }
export function validateRoleMapping(roles) {
  const ids = MIXED_ROLES.map(role => roles?.[role]);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== 6 || Object.keys(roles).length !== 6) throw Error('six distinct role/session IDs required');
  return true;
}
export function assessMixed(r) {
  const reasons = [];
  if (!r?.completed) reasons.push(r?.reason ?? 'run not completed');
  try { validateRoleMapping(r?.roles); } catch (e) { reasons.push(e.message); }
  const mixed = r?.actions?.filter(a => a.phase === 'mixed');
  if (!Array.isArray(mixed) || mixed.length < 12) reasons.push('two full six-role switch cycles missing');
  else for (const [i, a] of mixed.entries()) {
    const to = MIXED_ROLES[i % 6], from = MIXED_ROLES[(i + 5) % 6];
    if (a.to !== to || a.from !== from || a.beforeId !== r.roles[from] || a.afterId !== r.roles[to] || !a.focus || !a.visible || !a.content || !finite(a.rafMs) || !finite(a.ipcMs) || !coversAction(a, a)) reasons.push(`switch ${i} unconfirmed`);
    for (const role of producerRoles) if (!coversAction(role.startsWith('stream') ? r.streams?.[role] : r.tools?.[role], a)) reasons.push(`${role} does not cover switch ${i}`);
  }
  // WHY: an all-transition run (or serial tool work) can never masquerade as concurrent load.
  if ((mixed?.length ?? 0) < 12 || mixed.at(-1).end - mixed[0].start < 15_000 ||
      !finite(r?.mixedProgress?.early?.at) || r.mixedProgress.early.at < mixed[0].start || r.mixedProgress.early.at > mixed[0].end + 1000 ||
      !finite(r?.mixedProgress?.late?.at) || r.mixedProgress.late.at < mixed.at(-1).start || r.mixedProgress.late.at > mixed.at(-1).end + 1000) reasons.push('12 mixed switches must span 15s with early/late producer samples inside the phase');
  for (const role of streamRoles) {
    const s = r?.streams?.[role];
    if (!s || !finite(s.start) || !finite(s.end) || s.end <= s.start || !s.exact || !s.persistedExact || !s.userExact || !s.complete || !s.visibleExact || s.aborted || s.deltasSent !== s.plannedDeltas || !finite(s.achievedPerSec)) reasons.push(`${role} incomplete output`);
  }
  for (const role of toolRoles) {
    const t = r?.tools?.[role];
    if (!t || !finite(t.start) || !finite(t.end) || t.end <= t.start || !t.continuous || !t.userExact || !t.resultExact || !t.ackExact || !t.callExact || !t.cardConfirmed || !t.persistedExact) reasons.push(`${role} incomplete tool work`);
  }
  if (!r?.idle?.noRequests || !r?.idle?.visible || !r?.idle?.noTimelineOrTurns) reasons.push('idle role not established');
  if (r?.options?.history === 'long') {
    if (!classifyProviderRequests(r.providerRequests,{controlCount:1,rejected:r.providerRejected}).ok) reasons.push('unexpected provider request/compaction');
    for(const role of MIXED_ROLES) {
      const h=r.histories?.[role];
      if (!h?.integrity || !h?.newTurn?.ok || !h?.loaded?.ok || !h?.latestArrival?.ok || !h?.finalArrival?.ok || !h?.filesRegistered || h?.bytes <= 0 || h?.turns !== HISTORY_TURNS || h?.historyProfile !== 'bounded-turns' || h?.bodyChars < 20000 || h?.bodyChars > 40000) reasons.push(`${role} seeded history/loaded rows/Files incomplete`);
    }
    if (r.options.files === 'open' && (!r.drawerSetup?.['stream-1'] || !r.drawerSetup?.['tool-1'])) reasons.push('session Files not opened for both target roles');
    for(const action of r.actions?.filter(a=>a.phase==='mixed')??[]) if (!action.historyOk || !action.drawerOk || !action.geometry?.chatWidth || (action.drawerExpected && !action.geometry?.drawerWidth)) reasons.push(`${action.to} history/drawer not engaged on ${action.phase} visit`);
  }
  if (!assessControl(r?.control) || r.control.actions[0].beforeId !== r.roles?.idle ||
      r.control.actions[0].afterId !== r.roles?.['stream-1'] || r.control.actions[1].beforeId !== r.roles?.['stream-1'] ||
      r.control.actions[1].afterId !== r.roles?.idle) reasons.push('idle/single-stream control missing, misrouted or not concurrent');
  if (!assessMixedProgress(r?.mixedProgress)) reasons.push('mixed span/progress insufficient (15s, 750 deltas and five tool beats per role)');
  // WHY: a provider teardown failure leaves producer ownership uncertain even
  // when app/session cleanup succeeded; retain the fixture for investigation.
  if (r?.providerCleanupError) reasons.push(`provider cleanup failed: ${r.providerCleanupError}`);
  if (!r?.cleanup?.sessionsClosed || !r?.cleanup?.appStopped) reasons.push('cleanup unconfirmed');
  if (r?.environment?.focus !== true || r.environment.visibility !== 'visible' || !r.environment.viewport?.width || !r.environment.viewport?.height || !r.environment.gpu) reasons.push('focus/display/GPU context missing');
  if (r?.options?.history === 'long' && (r?.calibration?.status !== 'calibrated' || r?.mixedCadence?.status !== 'calibrated')) reasons.push('display/rAF cadence uncontrolled; no product performance verdict');
  if (!finite(r?.cpu?.totalSeconds) || !Number.isSafeInteger(r?.cpu?.hz) || r.cpu.hz <= 0 || !finite(r?.memory?.totalMb) || !finite(r?.longTasks?.longtaskCount) || r.longTasks.longtaskSupported !== true || !assessIpc(r?.ipc)) reasons.push('CPU/memory/renderer-longtask/end-to-end IPC evidence missing');
  if(r?.options?.cpuProfile==='on'&&!r.cpuDiagnostic?.ok)reasons.push('CPU diagnostic profile missing or incomplete');
  return { status: reasons.length ? 'incomplete' : 'measured', reasons };
}

export async function prepareMixedFixture(parent, { fixtureFactory = root => buildFixture(root, { log: () => {} }) } = {}) {
  if (!isAbsolute(parent) || !statSync(parent).isDirectory()) throw Error('existing private parent required');
  const root = await mkdtemp(join(parent, 'mixed-activity-'));
  await writeFile(join(root, 'owner'), 'mixed-activity', { flag: 'wx' });
  // Do not remove a partially created fixture: preserve it for ownership/cleanup review.
  return { root, ...await fixtureFactory(root) };
}
export async function cleanupMixedFixture(root, { appStopped = false } = {}) {
  if (!root || await readFile(join(root, 'owner'), 'utf8') !== 'mixed-activity') throw Error('unowned fixture cleanup refused');
  if (!appStopped) return false;
  await rm(root, { recursive: true, force: true, maxRetries: 5 }); return true;
}
const bounder = minutes => {
  const end = Date.now() + minutes * 60_000 - 12_000;
  return async (promise, label, cap = 10_000) => {
    const ms = Math.min(cap, end - Date.now()); if (ms <= 0) throw Error(`deadline exceeded: ${label}`);
    let timer; try { return await Promise.race([promise, new Promise((_, fail) => { timer = setTimeout(() => fail(Error(`timeout: ${label}`)), ms); })]); }
    finally { clearTimeout(timer); }
  };
};
export async function portFree(port) {
  const s = createServer();
  try { await new Promise((ok, fail) => { s.once('error', fail); s.listen(port, '127.0.0.1', ok); }); }
  finally { if (s.listening) await new Promise(ok => s.close(ok)); }
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function preflightMixed(o, { loadStamp = loadPackageStamp, refuse = refusePackageProcesses, portCheck = portFree, hash = sha256 } = {}) {
  const stamp = await loadStamp(o);
  refuse(o.appDir);
  await portCheck(o.cdpPort);
  return { ...stamp, executableSha256: await hash(join(o.appDir, 'youcoded')) };
}
const transcript = (fixture, id) => join(fixture.home, '.youcoded/sessions', nativeStoreSlug(Object.values(fixture.histories ?? {}).find(h=>h.id===id)?.cwd ?? fixture.projects.alpha), `${id}.jsonl`);
const eventsFor = (fixture, id) => {
  try { return parseNativeTranscript(readFileSync(transcript(fixture,id),'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
};
const entriesText = (events, type) => events.filter(e => e.type === type).map(e => e.data?.text ?? '').join('');
async function until(check, bound, label, count = 100) {
  for (let i = 0; i < count; i++) { const answer = await bound(Promise.resolve().then(check), label); if (answer) return answer; await bound(wait(100), label); }
  throw Error(`missing ${label}`);
}
async function toolProof(tool, fixture, id) {
  const history = Object.values(fixture.histories ?? {}).find(h=>h.id===id);
  const all = eventsFor(fixture, id);
  const events = history ? newEvents(all,history.snapshot) : all;
  const progress = (await readFile(tool.progressPath, 'utf8')).trim().split('\n').map(JSON.parse);
  const result = JSON.parse(await readFile(tool.resultPath, 'utf8'));
  const role = tool.role, token = fixture.mixed.token;
  return { start: progress[0]?.at, end: progress.at(-1)?.at, userExact: events.filter(e => e.type === 'user-message').length === 1 && events.some(e => e.type === 'user-message' && e.data?.text === `MIXED_ROLE:${role}`), continuous: progress.length === tool.steps + 2 && progress[0]?.event === 'start' && progress.at(-1)?.event === 'end' && progress.slice(1, -1).every((p, i) => p.event === 'progress' && p.step === i + 1 && p.role === role && p.token === token && p.at >= progress[i].at && p.at <= progress[i + 2].at), resultExact: result.role === role && result.token === token && result.steps === tool.steps && result.result === tool.result, ackExact: entriesText(events, 'assistant-text') === `MIXED_ACK:${role}:${token}`, callExact: events.filter(e => e.type === 'tool-use').length === 1 && events.some(e => e.type === 'tool-use' && e.data?.toolName === 'Bash' && e.data?.toolUseId === `mixed-${role}-${token}` && e.data?.toolInput?.command === tool.command), persistedExact: events.filter(e => e.type === 'tool-result').length === 1 && events.some(e => e.type === 'tool-result' && e.data?.toolUseId === `mixed-${role}-${token}` && e.data?.isError === false && completedToolOutput(e.data.toolResult, tool)) && events.some(e => e.type === 'turn-complete') };
}
async function mainWork(app, fixture, provider, bound, report, o) {
  const cdp = app.cdp;
  const evalJs = (code, label) => bound(cdp.evaluate(code), label);
  await bound(cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }), 'viewport');
  report.environment = await evalJs('({focus:document.hasFocus(),visibility:document.visibilityState,viewport:{width:innerWidth,height:innerHeight}})', 'startup display state');
  report.environment.gpu = await bound(readRendererInfo(o.cdpPort, cdp), 'GPU info');
  if(fixture.histories) {
    report.environment.startup = { focus: report.environment.focus, visibility: report.environment.visibility };
    // Only the private target is raised; use its verified post-focus state as the measurement context.
    const focusedEnvironment = await focusOwnedTargetAndCaptureEnvironment(cdp, evalJs, bound);
    Object.assign(report.environment, focusedEnvironment);
    report.environment.focusAt = Date.now();
    report.environment.gpu ??= await bound(readRendererInfo(o.cdpPort, cdp), 'GPU info after private focus');
    report.displayContext={display:o.realDisplay,session:process.env.XDG_SESSION_ID??null,sessionState:null,platform:null};
    try { report.displayContext.platform=execFileSync('loginctl',['show-session',process.env.XDG_SESSION_ID??'1','-p','Active','-p','State','-p','IdleHint','-p','LockedHint','-p','Type'],{encoding:'utf8',timeout:3000}).trim(); }
    catch(e) { report.displayContext.platformError=String(e); }
    const begin=await evalJs('({focus:document.hasFocus(),visibility:document.visibilityState,at:Date.now(),screen:{width:screen.width,height:screen.height},platform:navigator.platform})','calibration focus');
    await bound(installProbe(cdp),'pre-workload frame calibration',3000);
    await bound(wait(2100),'passive private rAF calibration');
    await bound(stopProbe(cdp),'stop passive calibration',3000);
    const sample=await bound(readProbe(cdp),'read passive calibration',3000);
    const end=await evalJs('({focus:document.hasFocus(),visibility:document.visibilityState,at:Date.now()})','calibration end focus');
    report.calibration={...sample,start:begin,end,status:assessCadence({...sample,focus:begin.focus&&end.focus,visibility:end.visibility}).status};
    // Keep the exact count even when 1Hz; do not fake a healthy calibration.
    report.phaseCadence=[];
  }
  const pre = await evalJs('window.claude.session.list()', 'sessions before');
  const existing = new Set(pre.map(s => s.id)); report.roles = {}; const owned = [];
  const roleName = role => `mixed-${fixture.mixed.token.slice(0, 8)}-${role}`;
  let firstBadPhase=false;
  const checkpoint=async(label) => {
    if(!fixture.histories)return;
    const sample=async() => {
      const start=await evalJs('({focus:document.hasFocus(),visibility:document.visibilityState,at:Date.now()})',`${label} focus`);
      await bound(installProbe(cdp),`${label} rAF probe`,3000);
      await bound(wait(1100),`${label} passive cadence`);
      await bound(stopProbe(cdp),`${label} probe stop`,3000);
      const p=await bound(readProbe(cdp),`${label} cadence`,3000);
      const end=await evalJs('({focus:document.hasFocus(),visibility:document.visibilityState,at:Date.now()})',`${label} end focus`);
      return {...p,start,end,cadenceCondition:p.framesPerSec>=20&&start.focus&&end.focus&&end.visibility==='visible'?'responsive-proxy':'slow-or-unconfirmed-proxy'};
    };
    const before=await sample(),entry={label,before};
    if(['resumed-stream-1','resumed-stream-3','five-producers-started'].includes(label)) {
      try {entry.ownedWindow=await bound(browserWindowState(o.cdpPort,app.target.id),`${label} browser-target window bounds`,4500);}
      catch(e) {entry.windowStateError=String(e);}
    }

    if(!firstBadPhase && before.framesPerSec<20) {
      firstBadPhase=true;
      // Only the owned CDP target; same phase, no other state/flags changed.
      await bound(cdp.send('Page.bringToFront'),`${label} private refocus`,3000);
      entry.afterPrivateBringToFront=await sample();
      // Two-second browser-wide diagnostic only at first slow phase. Never use
      // it as an untraced baseline or claim trace event names are presented frames.
      try {
        const beforeCpu=cpuSnapshot(app.family());
        const trace=await recordBrowserTrace(o.cdpPort,{bound,ms:2000});
        const afterCpu=cpuSnapshot(app.family());
        entry.shortTrace={verdict:inspectCadenceTrace(trace),file:`${o.out}.first-slow.trace.json`,cpuTicks:Object.fromEntries([...beforeCpu].map(([pid,t])=>[pid,Math.max(0,(afterCpu.get(pid)??t)-t)]))};
        writeFileSync(entry.shortTrace.file,JSON.stringify(trace)+'\n',{flag:'wx'});
      } catch(e) {entry.shortTraceError=String(e);}
    }
    report.phaseCadence.push(entry);
  };
  try {
    for (const role of MIXED_ROLES) {
      const options = { name: roleName(role), cwd: fixture.histories?.[role]?.cwd ?? fixture.projects.alpha, skipPermissions: false, provider: 'native', binding: { providerId: 'perf-mixed-private', modelId: MIXED_MODEL_ID }, preset: 'coder', ...(fixture.histories ? {resumeSessionId:fixture.histories[role].id} : {}) };
      const pending = cdp.evaluate(`window.claude.session.create(${JSON.stringify(options)})`);
      let s;
      try { s = await bound(pending, `create ${role}`, 30_000); }
      catch (e) { pending.then(late => { if (late?.id && !existing.has(late.id)) return cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(late.id)})`); }).catch(() => {}); throw e; }
      if (s?.provider !== 'native' || !s.id || existing.has(s.id) || owned.includes(s.id) || (fixture.histories && s.id !== fixture.histories[role].id)) throw Error(`invalid native resumed session ${role}: ${JSON.stringify(s)}`);
      owned.push(s.id); report.roles[role] = s.id;
      if(fixture.histories) await checkpoint(`resumed-${role}`);
    }
    validateRoleMapping(report.roles);
    if (fixture.histories) await installNativeDiagnostics(cdp,{bound});
    if (fixture.histories) {
      report.histories={}; report.drawerSetup={};
      for (const role of MIXED_ROLES) {
        const h=fixture.histories[role], id=report.roles[role];
        // Exercise the actual session switch and UI paging; a 200-turn file alone is insufficient.
        await evalJs(`(() => {const p=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(x=>x.dataset.sessionId===${JSON.stringify(id)});if(!p)return false;p.click();return true})()`, `activate ${role} for history`);
        await until(() => evalJs(historyPaneExpression,`visible history ${role}`).then(p=>p?.sessionId===id),bound,`visible ${role}`);
        const tracked=await registerSessionFiles(cdp,h,{bound});
        const loaded=await pageHistory(cdp,id,{bound,target:LOADED_TARGET});
        const observed=eventsFor(fixture,id),seedCheck=verifyHistory(observed,h.snapshot);
        report.histories[role]={bytes:h.bytes,bodyChars:h.bodyChars,historyProfile:h.historyProfile,turns:h.turns,loaded,filesRegistered:tracked.files.length===h.files.length,integrity:seedCheck.ok,
          seedCheck:{reason:seedCheck.reason,observedEvents:observed.length,expectedEvents:h.snapshot.events.length,transcript:transcript(fixture,id)}};
        if(!loaded.ok) throw Error(`${role}: ${loaded.reason}`);
        const arrival=await latestHistoryArrival(cdp,id,{bound});
        report.histories[role].latestArrival=arrival;
        if(!arrival.ok) throw Error(`${role}: ${arrival.reason}`);
        await checkpoint(`paged-${role}`);
      }
    }
    const roleId = role => report.roles[role];
    if (fixture.histories && o.files === 'open') {
      for (const role of ['stream-1','tool-1']) {
        await evalJs(`(() => {const p=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(x=>x.dataset.sessionId===${JSON.stringify(roleId(role))});if(!p)return false;p.click();return true})()`,`choose ${role} Files`);
        await until(() => evalJs(historyPaneExpression,`visible ${role} Files`).then(p=>p?.sessionId===roleId(role)),bound,`visible ${role} Files`);
        const clicked=await evalJs(`(() => {const b=document.querySelector('button[aria-label="Session Files"]');if(!b)return false;b.click();return true})()`,`open ${role} Session Files`);
        if(!clicked) throw Error(`${role} Session Files button missing`);
        const h=fixture.histories[role],target={role,sessionId:roleId(role),projectRoot:h.cwd,files:h.files.map(f=>f.name)};
        const d=await until(() => observeSessionFiles(cdp,h,{bound}).then(p=>assessDrawer(p,target,true).ok?p:null),bound,`${role} owned Files rows`);
        report.drawerSetup[role]={...d,verified:true};
        await checkpoint(`drawer-open-${role}`);
      }
    }
    // Always begin the control on idle (last seeded role otherwise may be arbitrary).
    if (fixture.histories) await evalJs(`(() => {const p=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(x=>x.dataset.sessionId===${JSON.stringify(roleId('idle'))});if(!p)return false;p.click();return true})()`, 'select idle before control');
    const send = async role => { const r = await evalJs(`window.claude.native.send(${JSON.stringify(roleId(role))},${JSON.stringify(`MIXED_ROLE:${role}`)})`, `send ${role}`); if (r?.status !== 'sent') throw Error(`native send ${role}: ${JSON.stringify(r)}`); };
    const switchTo = async (from, to, phase) => {
      const before = await evalJs(`(() => [...document.querySelectorAll('[data-chat-session-id]')].map(p=>({id:p.dataset.chatSessionId,hidden:!!p.closest('[aria-hidden="true"]'),hasScroll:!!p.querySelector('.chat-scroll')})))()`, 'before switch pane identity');
      const beforeId = before.filter(p => !p.hidden).length === 1 ? before.find(p => !p.hidden)?.id : null;
      const start = Date.now();
      const r = await evalJs(`new Promise(resolve=>{const p=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(x=>x.dataset.sessionId===${JSON.stringify(roleId(to))});if(!p){resolve(null);return;}p.click();requestAnimationFrame(()=>resolve({at:Date.now(),focus:document.hasFocus(),visibility:document.visibilityState}));})`, 'click/rAF proxy');
      const end = Date.now();
      const panes = await evalJs(`(() => [...document.querySelectorAll('[data-chat-session-id]')].map(p=>({id:p.dataset.chatSessionId,hidden:!!p.closest('[aria-hidden="true"]'),hasScroll:!!p.querySelector('.chat-scroll'),timelineCount:p.querySelectorAll('.chat-scroll .timeline-entry').length,text:p.querySelector('.chat-scroll')?.textContent??''})))()`, 'post-clock content/geometry');
      const pane = panes.find(p => !p.hidden);
      const action = { from, to, phase, beforeId, afterId: pane?.id, start, end, focus: r?.focus === true, visible: r?.visibility === 'visible' && assessVisiblePane(panes, roleId(to)), content: to === 'idle' ? !!pane && (fixture.histories ? true : pane.timelineCount === 0) : (pane?.text?.includes(`MIXED_ROLE:${to}`) ?? false), rafMs: r?.at - start, ipcMs: end - start, observedBeforeId: beforeId };
      if (fixture.histories) {
        const h=fixture.histories[to],target={role:to,sessionId:roleId(to),projectRoot:h.cwd,files:h.files.map(f=>f.name)};
        const loaded=await evalJs(historyPaneExpression,`${to} loaded history postclock`);
        const expectedOpen=o.files==='open' && ['stream-1','tool-1'].includes(to);
        // The Files list is fetched asynchronously on mount; wait outside the
        // click clock for its own rows, never count a stale other-session list.
        const drawer=expectedOpen ? await until(() => observeSessionFiles(cdp,h,{bound}).then(d=>assessDrawer(d,target,true).ok?d:null),bound,`${to} Files rows after switch`,30)
          : await observeSessionFiles(cdp,h,{bound});
        action.historyOk=assessLoadedAfterSwitch(loaded,roleId(to)).ok;
        action.drawerOk=assessDrawer(drawer,target,expectedOpen).ok;
        action.drawerExpected=expectedOpen;
        action.geometry={chatWidth:loaded?.chatWidth,drawerWidth:drawer?.drawerWidth??0,entries:loaded?.entries,authored:loaded?.authored,markdown:loaded?.markdown,chars:loaded?.chars,folded:loaded?.folded};
        action.visit=phase==='mixed' ? (report.actions.filter(a=>a.phase==='mixed' && a.to===to).length ? 'repeat':'first') : phase;
      }
      report.actions.push(action); return action;
    };
    report.actions = []; report.streams = {}; report.tools = {}; report.idle = {};
    // WHY: a control measured after its 200ms reply ends proves nothing about switching under one stream.
    await checkpoint('before-control-send');
    // WHY: capture only control + mixed actions, not minutes of setup; reuse the
    // finite native trace/parser gates without changing workload or output checks.
    if(o.waylandSocket) app.mixedPresentation=await startMixedPresentation(app,o,bound);
    const endControl=await app.mixedPresentation?.begin('control');
    provider.plan('stream-1', { deltas: 100, perSec: 50 });
    await send('stream-1');
    const controlRec = await until(() => provider.requests.find(r => admitLiveControl(r, fixture.histories ? newEvents(eventsFor(fixture,roleId('stream-1')),fixture.histories['stream-1'].snapshot) : eventsFor(fixture, roleId('stream-1')), provider.requests)), bound, 'live single-stream control');
    const controlActions = [await switchTo('idle', 'stream-1', 'control')];
    await bound(wait(250), 'control dwell');
    controlActions.push(await switchTo('stream-1', 'idle', 'control'));
    await until(() => !!controlRec.endedAt, bound, 'single-stream control completion');
    await until(() => hasNewCompletion(eventsFor(fixture,roleId('stream-1')),fixture.histories?.['stream-1']?.snapshot), bound, 'new control persisted turn completion');
    const controlEvents = fixture.histories ? newEvents(eventsFor(fixture,roleId('stream-1')),fixture.histories['stream-1'].snapshot) : eventsFor(fixture, roleId('stream-1'));
    report.control = { firstWriteAt: controlRec.firstWriteAt, lastWriteAt: controlRec.lastWriteAt, actions: controlActions,
      persistedExact: controlEvents.filter(e => e.type === 'assistant-text').at(-1)?.data?.text === provider.expectedText('stream-1', 100) && controlRec.deltasSent === 100 && !controlRec.aborted,
      otherProducersStarted: provider.requests.some(r => toolRoles.includes(r.role) || r.role === 'stream-2' || r.role === 'stream-3') };
    if (!assessControl(report.control)) throw Error('single-stream control not engaged while live');
    await endControl?.(true);
    await checkpoint('after-control-before-producers');
    // Distinct role instances and requests; do not await an assistant while tools run.
    provider.plan('stream-1', { deltas: o.streamSeconds * 50, perSec: 50 });
    for (const role of ['tool-1', 'tool-2', 'stream-1', 'stream-2', 'stream-3']) await send(role);
    await until(() => producerRoles.every(role => provider.requests.some(r => r.role === role && !r.followup && r.firstWriteAt)), bound, 'five producers started');
    await until(() => toolRoles.every(role => existsSync(fixture.mixed.tools[role].progressPath) && readFileSync(fixture.mixed.tools[role].progressPath, 'utf8').includes('"event":"progress"')), bound, 'two actual Bash workers progressing');
    await checkpoint('five-producers-started');
    // WHY: /proc ticks per second are kernel-configured; a fixed 100 misstates total CPU work.
    const hz = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 3000 }).trim());
    if (!Number.isSafeInteger(hz) || hz <= 0) throw Error('CPU CLK_TCK HZ unknown');
    const cpuBefore = cpuSnapshot(app.family());
    const progress = () => ({ at: Date.now(), streams: Object.fromEntries(streamRoles.map(role => [role, provider.requests.filter(r => r.role === role).at(-1)?.deltasSent ?? 0])),
      tools: Object.fromEntries(toolRoles.map(role => [role, existsSync(fixture.mixed.tools[role].progressPath) ? readFileSync(fixture.mixed.tools[role].progressPath, 'utf8').split('\n').filter(line => line.includes('"event":"progress"')).length : 0])) });
    await installProbe(cdp); await installIpcStallProbe(cdp);
    if(fixture.histories) report.cadenceSamples=[];
    if(o.cpuProfile==='on') {
      // WHY: sample the actual mixed interval (including dwell tasks), not setup;
      // preserve full CPU/task evidence separately from ordinary timing controls.
      app.mixedCpu=await startMixedCpuProfile(cdp,bound);
      report.scope+='; CPU-profiled diagnostic including observer overhead, NOT a timing baseline';
      app.saveMixedCpu=async()=>{
        if(report.cpuDiagnostic)return;
        const result=await app.mixedCpu.stop(),file=o.out+'.cpuprofile.json';
        writeFileSync(file,JSON.stringify({build:report.build,...result})+'\n',{flag:'wx',mode:0o600});
        report.cpuDiagnostic={...result,profile:undefined,file};
      };
    }
    const endMixed=await app.mixedPresentation?.begin('mixed');
    for (let cycle = 0; cycle < 2; cycle++) for (let i = 0; i < MIXED_ROLES.length; i++) {
      const role = MIXED_ROLES[i], from = MIXED_ROLES[(i + 5) % MIXED_ROLES.length];
      const action = await switchTo(from, role, 'mixed');
      if (cycle === 0 && i === 0) report.mixedProgress = { early: progress() };
      if (cycle === 1 && i === MIXED_ROLES.length - 1) report.mixedProgress.late = progress();
      // Dwell is OUTSIDE the click clock; spread actions across the real stream, not its first second.
      if(fixture.histories && (i===2 || i===5)) {
        const sample=await bound(readProbe(cdp),'mid-mixed cumulative rAF',3000);
        const state=await evalJs('({focus:document.hasFocus(),visibility:document.visibilityState,at:Date.now()})','mid-mixed focus');
        const prev=report.cadenceSamples.at(-1)??{atMs:0,frames:0};
        report.cadenceSamples.push({atMs:sample.observedMs,frames:sample.frames,deltaMs:sample.observedMs-prev.atMs,deltaFrames:sample.frames-prev.frames,focus:state.focus,visibility:state.visibility,at:state.at});
      }
      if (cycle !== 1 || i !== MIXED_ROLES.length - 1) await bound(wait(1500), 'mixed role dwell');
    }
    await app.mixedCpu?.markEnd();
    await endMixed?.(report.actions.filter(a=>a.phase==='mixed').length===12);
    await stopProbe(cdp); await stopIpcStallProbe(cdp);
    const cpuAfter = cpuSnapshot(app.family());
    report.cpu = { totalSeconds: cpuSeconds(cpuBefore, cpuAfter, hz), hz };
    report.memory = pssMb(app.family());
    report.longTasks = await readProbe(cdp);
    if(fixture.histories) {
      report.mixedPhaseEnd = await evalJs('({focus:document.hasFocus(),visibility:document.visibilityState,at:Date.now()})','mixed phase end focus');
      report.mixedCadence=assessCadence({...report.longTasks,focus:mixedPhaseFocusConfirmed(report,report.mixedPhaseEnd),visibility:report.mixedPhaseEnd.visibility});
    }
    report.ipc = await readIpcStallProbe(cdp);
    await app.saveMixedCpu?.();
    await app.mixedPresentation?.stop();
    // Completion switches are intentionally NOT counted as steady-state overlap.
    await until(() => producerRoles.every(role => provider.requests.some(r => r.role === role && r.endedAt && (role.startsWith('stream') ? !r.followup : r.followup))), bound, 'all producer/followup completion', 500);
    if(fixture.histories) for(const role of producerRoles) await until(() => hasNewCompletion(eventsFor(fixture,roleId(role)),fixture.histories[role].snapshot),bound,`${role} persisted measured turn`,100);
    for (const role of streamRoles) {
      const record = provider.requests.filter(r => r.role === role).at(-1);
      const expected = provider.expectedText(role, o.streamSeconds * 50);
      const stored = fixture.histories ? newEvents(eventsFor(fixture,roleId(role)),fixture.histories[role].snapshot) : eventsFor(fixture, roleId(role));
      report.streams[role] = { start: record.firstWriteAt, end: record.lastWriteAt, deltasSent: record.deltasSent, plannedDeltas: record.plan.deltas, aborted: record.aborted, achievedPerSec: (record.deltasSent - 1) * 1000 / (record.lastWriteAt - record.firstWriteAt), exact: record.deltasSent === record.plan.deltas, persistedExact: stored.filter(e => e.type === 'assistant-text').at(-1)?.data?.text === expected, userExact: stored.filter(e => e.type === 'user-message').at(-1)?.data?.text === `MIXED_ROLE:${role}`, complete: stored.some(e => e.type === 'turn-complete') };
    }
    for (const role of toolRoles) report.tools[role] = await toolProof(fixture.mixed.tools[role], fixture, roleId(role));
    report.idle.noRequests = provider.requests.every(r => r.role !== 'idle');
    if (fixture.histories) {
      report.providerRequests=provider.requests.map(r=>({role:r.role,followup:r.followup,startedAt:r.startedAt,aborted:r.aborted}));
      report.providerRejected=[...provider.rejected];
      for(const role of MIXED_ROLES) {
        const h=fixture.histories[role],events=eventsFor(fixture,h.id);
        report.histories[role].integrity=verifyHistory(events,h.snapshot).ok;
        report.histories[role].newTurn=assessHistoryRun({role,events,snapshot:h.snapshot,requests:provider.requests,
          expectedText:streamRoles.includes(role)?provider.expectedText(role,o.streamSeconds*50):undefined,
          toolId:toolRoles.includes(role)?`mixed-${role}-${fixture.mixed.token}`:undefined});
        if (!report.histories[role].newTurn.ok) throw Error(`${role}: prior history or measured turn integrity failed: ${report.histories[role].newTurn.reason??'mismatch'}`);
      }
    }
    // Read-only renderer state and pictures AFTER timing; retain stream/tool proof when idle is final.
    report.roleScreenshots = {};
    for (const role of MIXED_ROLES) {
      await switchTo(MIXED_ROLES[(MIXED_ROLES.indexOf(role) + 5) % 6], role, 'transition');
      if(fixture.histories) {
        const marker=role.startsWith('stream-')?`MIXED_TEXT:${role}:${String(o.streamSeconds*50-1).padStart(4,'0')}`:role.startsWith('tool-')?`MIXED_ACK:${role}:${fixture.mixed.token}`:undefined;
        const cardId=role.startsWith('tool-')?`mixed-${role}-${fixture.mixed.token}`:undefined;
        const arrival=await latestHistoryArrival(cdp,roleId(role),{bound,role,marker,cardId});
        report.histories[role].finalArrival=arrival;
        if(!arrival.ok) {
          report.arrivalGeometry=await collectArrivalGeometry(cdp,roleId(role),{bound,marker,cardId}).catch(e=>({error:String(e)}));
          throw Error(`${role} latest content not visible: ${arrival.reason}`);
        }
      }
      const visible = await evalJs(`(() => [...document.querySelectorAll('[data-chat-session-id]')].map(p=>({id:p.dataset.chatSessionId,hidden:!!p.closest('[aria-hidden="true"]'),hasScroll:!!p.querySelector('.chat-scroll'),timelineCount:p.querySelectorAll('.chat-scroll .timeline-entry').length,text:p.querySelector('.chat-scroll')?.textContent??'',cards:[...p.querySelectorAll('[data-tool-use-id]')].map(c=>({id:c.getAttribute('data-tool-use-id'),text:c.textContent??''}))})))()`, 'final visible pane');
      const pane = visible.find(p => !p.hidden);
      if (!assessVisiblePane(visible, roleId(role))) throw Error(`final pane identity missing: ${role}`);
      if (streamRoles.includes(role)) report.streams[role].visibleExact = assessStreamDisplay(pane.text, role, o.streamSeconds * 50);
      else if (toolRoles.includes(role)) {
        // Collapsed cards need not expose their entire stdout; exact bytes are checked on disk.
        report.tools[role].cardConfirmed = pane.cards?.some(card => assessToolCard(card, role, fixture.mixed.token)) === true;
        report.tools[role].ackExact &&= pane.text.includes(`MIXED_ACK:${role}:${fixture.mixed.token}`);
      } else {
        const idleEvents = eventsFor(fixture, roleId('idle'));
        report.idle.visible = true;
        report.idle.noTimelineOrTurns = assessIdle({ pane, events: idleEvents, requests: provider.requests, snapshot:fixture.histories?.idle?.snapshot });
      }
      if (['stream-1', 'tool-1', 'tool-2'].includes(role)) {
        // Wait out the drawer's finite width transition after all timed actions.
        if (fixture.histories && o.files==='open') await bound(wait(300),`settled ${role} Files screenshot`);
        if(fixture.histories) {
          const marker=role.startsWith('stream-') ? `MIXED_TEXT:${role}:${String(o.streamSeconds*50-1).padStart(4,'0')}` : `MIXED_ACK:${role}:${fixture.mixed.token}`;
          const cardId=`mixed-${role}-${fixture.mixed.token}`;
          const proof=await evalJs(`(() => {const id=${JSON.stringify(roleId(role))};const root=[...document.querySelectorAll('[data-chat-session-id]')].find(p=>p.dataset.chatSessionId===id);const scroll=root?.querySelector('.chat-scroll');if(!scroll)return null;const inside=e=>{if(!e)return false;const a=e.getBoundingClientRect(),b=scroll.getBoundingClientRect();return a.height>0&&a.bottom>b.top&&a.top<b.bottom};const rows=[...scroll.querySelectorAll('.timeline-entry')];const marker=${JSON.stringify(marker)};const card=[...scroll.querySelectorAll('[data-tool-use-id]')].find(c=>c.dataset.toolUseId===${JSON.stringify(cardId)});return {role:${JSON.stringify(role)},lastMarkerVisible:rows.some(e=>inside(e)&&e.textContent?.includes(marker)),ackVisible:rows.some(e=>inside(e)&&e.textContent?.includes(marker)),cardVisible:inside(card)}})()`,`visible ${role} screenshot proof`);
          report.histories[role].viewportDelivery=proof;
          if(!assessViewportDelivery(proof)) throw Error(`${role} final acknowledgment/marker or tool card is outside the visible viewport; screenshot not a valid arrival proof`);
        }
        const photo = await bound(cdp.send('Page.captureScreenshot', { format: 'png' }), `final ${role} screenshot`);
        const dest = `${o.out}.${role}.png`;
        writeFileSync(dest, Buffer.from(photo.data, 'base64'), { flag: 'wx' });
        report.roleScreenshots[role] = dest;
      }
    }
    const screenshot = await bound(cdp.send('Page.captureScreenshot', { format: 'png' }), 'final screenshot');
    writeFileSync(o.out + '.png', Buffer.from(screenshot.data, 'base64'), { flag: 'wx' }); report.screenshot = o.out + '.png';
    report.completed = true;
  } finally {
    // Capture display-only errors and the actual pane BEFORE destroying the
    // owned sessions; a screenshot after cleanup says only No Active Session.
    if (fixture.histories && !report.completed && owned.length) {
      const id=report.roles['stream-1']??owned[0];
      try { report.preCleanupDiagnostic=await captureNativeFailure(cdp,id,{bound,provider}); }
      catch(e) { report.preCleanupDiagnosticError=String(e); }
      try { const shot=await bound(cdp.send('Page.captureScreenshot',{format:'png'}),'failure before cleanup screenshot',5000);
        report.preCleanupScreenshot=`${o.out}.pre-cleanup.png`;
        writeFileSync(report.preCleanupScreenshot,Buffer.from(shot.data,'base64'),{flag:'wx'});
      } catch(e) {report.preCleanupScreenshotError=String(e);}
    }
    if (fixture.histories) try {await stopNativeDiagnostics(cdp,{bound});} catch(e) {report.diagnosticStopError=String(e);}
    report.cleanup ??= {}; const closed = [];
    for (const id of [...owned].reverse()) try { await bound(cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`), `destroy ${id}`); closed.push(id); } catch (e) { (report.cleanup.errors ??= []).push(String(e)); }
    report.cleanup.sessionsClosed = owned.length === 6 && closed.length === 6;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const o = parseOptions(argv), bound = bounder(o.maxMinutes);
  const report = { status: 'incomplete', options: o, scope: 'private packaged X11; rAF/DOM are proxies, NOT displayed frames; no paid calls', actions: [] };
  let fixture, provider, app, launchAttempted = false, stopped = false;
  try {
    if(o.waylandSocket) {
      validateWaylandSocket(o.waylandSocket);
      if(o.checkout!==join(ROOT,'youcoded')||!o.appDir.startsWith(join(o.checkout,'desktop')+sep))throw Error('native package must belong to this isolated session checkout');
      report.scope='private packaged native Wayland; conditional compositor feedback separate from rAF/DOM proxies; no paid calls';
    }
    if (!assetsReady()) throw Error('fixture assets absent; downloads forbidden');
    report.build = await bound(preflightMixed(o), 'stamped package/hash/process/port preflight', 60_000);
    mkdirSync(dirname(o.out), { recursive: true });
    fixture = await prepareMixedFixture(join(ROOT, 'scratch/perf-lab'));
    fixture.mixed = await createMixedToolFixture({ parent: fixture.root, durationMs: o.toolSeconds * 1000 });
    // Resume seeded native histories through the ordinary session.create route.
    if (o.history === 'long') fixture.histories = await seedMixedHistories(fixture,{turns:HISTORY_TURNS,token:fixture.mixed.token});
    provider = await startMixedProvider({ port: 0, fixture: fixture.mixed, stream: { 'stream-1': { deltas: o.streamSeconds * 50 }, 'stream-2': { deltas: o.streamSeconds * 50 }, 'stream-3': { deltas: o.streamSeconds * 50 } } });
    const cfg = join(fixture.home, '.youcoded/providers.json');
    const providers = JSON.parse(readFileSync(cfg, 'utf8'));
    providers.providers = [{ id: 'perf-mixed-private', type: 'openai-compatible', label: 'private mixed fixture', baseUrl: provider.baseUrl, enabled: true }];
    writeFileSync(cfg, JSON.stringify(providers)); // no cloud or local fallback in the private HOME
    // Exactly two scoped remembered rules; never full-auto, bypass, or an unscoped Bash grant.
    const grants = {};
    for (const role of toolRoles) {
      const cwd=fixture.histories?.[role]?.cwd ?? fixture.projects.alpha, slug=nativeStoreSlug(cwd);
      (grants[slug] ??= {cwd,rules:[]}).rules.push({tool:'Bash',pattern:fixture.mixed.tools[role].command,action:'allow',match:'exact'});
    }
    writeFileSync(join(fixture.home, '.youcoded/permissions.json'), JSON.stringify({v:2,projects:grants}));
    report.privateProvider = { baseUrl: provider.baseUrl, id: 'perf-mixed-private' }; report.fixtureRoot = fixture.root;
    refusePackageProcesses(o.appDir); await bound(portFree(o.cdpPort), 'CDP port before launch');
    launchAttempted = true;
    const pending = launchApp({ binary: join(o.appDir, 'youcoded'), appDir: o.appDir, fixture, display: o.realDisplay, cdpPort: o.cdpPort, refuseExisting: true,
      ...(o.waylandSocket?{waylandSocket:o.waylandSocket,protocolLog:o.out+'.wayland.log',protocolDebug:o.protocolDebug==='on'}:{}) });
    try { app = await bound(pending, 'private app launch', 90_000); } catch (e) { pending.then(a => a.kill()).catch(() => {}); throw e; }
    await mainWork(app, fixture, provider, bound, report, o);
  } catch (e) {
    report.status = 'incomplete'; report.error = String(e?.message ?? e);
    if (app) try { const shot = await bound(app.cdp.send('Page.captureScreenshot', { format: 'png' }), 'failure screenshot', 5000); writeFileSync(o.out + '.failure.png', Buffer.from(shot.data, 'base64'), { flag: 'wx' }); report.failureScreenshot = o.out + '.failure.png'; } catch (err) { report.screenshotError = String(err); }
  } finally {
    try { await app?.saveMixedCpu?.(); }
    catch(e) {report.cpuDiagnosticError=String(e);}
    try { await app?.mixedPresentation?.stop(); }
    catch(e) { if(app?.mixedPresentation)app.mixedPresentation.error=String(e); }
    try { if (app) { await Promise.race([app.kill(), new Promise((_, reject) => setTimeout(() => reject(Error('shutdown timeout')), 8000))]); stopped = true; } else stopped = !launchAttempted; } catch (e) { report.cleanupError = String(e); }
    try { await provider?.close(); } catch (e) { report.providerCleanupError = String(e); }
    if (fixture?.histories && provider) {
      // WHY: compaction/summary requests can arrive after the early producer proof;
      // only the closed provider's complete inventory may justify a measured verdict.
      report.providerRequests=provider.requests.map(r=>({role:r.role,followup:r.followup,startedAt:r.startedAt,aborted:r.aborted}));
      report.providerRejected=[...provider.rejected];
    }
    if (fixture) {
      report.cleanup ??= {}; report.cleanup.appStopped = stopped;
      if (!report.error) Object.assign(report, assessMixed(report));
      if(o.waylandSocket) {
        report.nativePresentation=finishMixedPresentation(app?.mixedPresentation,app,o,{appStopped:stopped});
        if(report.nativePresentation.status==='incomplete')report.status='incomplete';
      }
      // WHY: keep evidence of a failed/uncertain run; delete only a proven, complete owned fixture.
      if (report.status !== 'measured' || !stopped) report.preservedRoot = fixture.root;
      else try { await cleanupMixedFixture(fixture.root, { appStopped: true }); }
      catch (e) { report.preservedRoot = fixture.root; report.cleanupError = String(e); report.status = 'incomplete'; }
    }
    if (report.error) report.status = 'incomplete';
    writeFileSync(o.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then(r => { console.log(`${r.status}: ${r.options.out}`); if (r.status !== 'measured') process.exitCode = 2; }, e => { console.error(e); process.exitCode = 2; });
