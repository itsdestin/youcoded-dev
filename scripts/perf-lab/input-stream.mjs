// Private packaged-app input instrument. No app source or real user profile is touched.
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture } from './fixture.mjs';
import { startXvfb, launchApp } from './launch.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { openJourneySessions, installPageHelpers } from './scenario-workload.mjs';
import { STREAM_DELTAS, STREAM_PER_SEC } from './scenario-native-stream.mjs';
import { readRendererInfo } from './gpu.mjs';
import { refusePackageProcesses } from './gpu-theme.mjs';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TEXT = 'InputResponseProbeTypingWithoutSpace1234'; // 40 printable characters, no mic/submit key
const sleep = ms => new Promise(r => setTimeout(r, ms));
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function parseOptions(argv, root = ROOT) {
  const o = { checkout: join(root, 'youcoded'), out: join(root, 'scratch/perf-lab/input-stream.json'), maxMinutes: 5, display: ':99' };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!['--checkout', '--app-dir', '--out', '--max-minutes', '--display'].includes(k) || !v || v.startsWith('--')) throw Error(`Invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  if (!/^[1-9]\d*$/.test(String(o.maxMinutes)) || Number(o.maxMinutes) > 10) throw Error('--max-minutes must be 1..10');
  o.maxMinutes = Number(o.maxMinutes);
  for (const k of ['checkout', 'appDir', 'out']) if (o[k] !== undefined && !isAbsolute(o[k])) throw Error(`--${k} must be absolute`);
  if (!/^:\d+$/.test(o.display)) throw Error('--display must be an X display');
  return o;
}

export function summariseInput(row, streaming) {
  const reasons = [];
  if (!row?.composer?.visible || row.composer.disabled || !row.composer.focused) reasons.push('visible enabled focused composer not confirmed');
  if (!row?.expected || !/^[!-~]{30,40}$/.test(row.expected) || row.draft !== row.expected || row.mirror !== row.expected) reasons.push('exact draft/mirror mismatch or invalid workload');
  if (row?.cleared?.draft !== '' || row?.cleared?.mirror !== '') reasons.push('keyboard clear not verified');
  const raw = row?.samples ?? [];
  if (!Array.isArray(raw) || raw.length !== row?.expected?.length || raw.length < 20 || raw.some((s, i) => s?.index !== i || s.char !== row.expected[i] || !['eventToListenerMs','inputToDomMs','inputToTwoRafMs','dispatchWallMs'].every(k => finite(s[k])))) reasons.push('missing, overlapping or invalid input timings');
  // WHY: an empty array from an unsupported observer is not a measured zero.
  if (row?.probe?.longtaskSupported !== true || row.probe.observerError || !Array.isArray(row.probe.longtasks) || !Array.isArray(row.probe.rafGaps)) reasons.push('longtask observation probe unsupported or incomplete');
  if (row?.probeError) reasons.push(`probe cleanup failed: ${row.probeError}`);
  if (!Number.isInteger(row?.ipc?.pings) || row.ipc.pings <= 0 || row.ipc.error
      || row.ipc.rejectedPings !== 0 || !['medianMs', 'p95Ms', 'maxMs', 'totalStallMs'].every(k => finite(row.ipc[k])))
    reasons.push('main-process IPC responsiveness unmeasured or rejected');
  if (streaming && (!row?.stream || row.stream.plannedDeltas !== STREAM_DELTAS || row.stream.perSec !== STREAM_PER_SEC || row.stream.deltasSent !== STREAM_DELTAS || row.stream.aborted !== false || row.stream.during?.length !== row.expected?.length || row.stream.during.some((d, i) => !d.activeBefore || !d.activeAfter || !finite(d.before) || !finite(d.after) || d.after <= d.before || (i && d.before < row.stream.during[i - 1].after)))) reasons.push('fake stream not active for every key');
  // WHY: a percentile on partial or overlapping observations looks more confident than the evidence warrants.
  const p95 = reasons.length || raw.length < 20 ? null : Object.fromEntries(['eventToListenerMs','inputToDomMs','inputToTwoRafMs','dispatchWallMs'].map(k => [k, [...raw].map(s => s[k]).sort((a,b) => a-b)[Math.ceil(raw.length * .95) - 1]]));
  // Verdict fields win over supplied metadata, never the other way around.
  return { ...row, status: reasons.length ? 'incomplete' : 'measured', reasons, count: raw.length, p95, raw: Array.isArray(raw) ? raw : [] };
}

export async function scheduleKeys(text, key, { intervalMs = 310, wait = sleep, deadline = () => true } = {}) {
  for (let i = 0; i < text.length; i++) {
    if (!deadline()) throw Error('input deadline exceeded');
    await key(text[i], i);
    if (i + 1 < text.length) await wait(intervalMs);
  }
}

export async function closeInputSessions(ids, close) {
  // WHY: report.sessions.ids shares this list. Mutating it during teardown
  // labelled resumed CC history as fresh native sessions in a diagnostic report.
  for (const id of [...ids].reverse()) await close(id);
}

export async function runInputLeg(driver, text, options = {}) {
  await driver.prepare();
  try {
    await scheduleKeys(text, driver.key, options);
    return await driver.finish();
  } finally { await driver.clear(); }
}

// WHY: the mirror, not the transparent textarea ink, draws the user's draft.
// Observe keydown, input, mirror mutations and two rAF callbacks, without layout reads
// or per-frame CDP polling. Two rAFs are DOM scheduling, NOT a displayed paint.
export const INSTALL = `(() => {
  const candidates = [...document.querySelectorAll('.input-bar-container textarea')].filter(e => !e.closest('[aria-hidden="true"]') && e.getClientRects().length);
  if (candidates.length !== 1) throw Error('expected exactly one visible composer, got ' + candidates.length);
  const el = candidates[0], mirror = el.closest('.input-bar-container')?.querySelector('.input-bar-mirror-content');
  if (!mirror || el.disabled || el.readOnly) throw Error('composer mirror missing or field disabled');
  if (el.value || mirror.textContent.replace(/\u200B/g,'')) throw Error('composer already contains a draft; refusing to clear someone else’s text');
  el.focus(); if (document.activeElement !== el) throw Error('composer did not focus');
  const p = { el, mirror, keys: [], inputs: [], samples: [], longtasks: [], rafGaps: [], supported: false, observer: null, mutation: null, active: true, last: null };
  const tick = t => { if (!p.active) return; if (p.last !== null && t-p.last > 40) p.rafGaps.push(t-p.last); p.last=t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  p.onKey = e => { if (e.target === el) p.keys.push({ char:e.key, stamp:e.timeStamp, processed:performance.now() }); };
  p.onInput = e => { if (e.target === el) p.inputs.push({ at:performance.now(), value:el.value }); };
  document.addEventListener('keydown', p.onKey, true);
  el.addEventListener('input', p.onInput);
  try { p.observer = new PerformanceObserver(list => { for (const e of list.getEntries()) p.longtasks.push({ start:e.startTime, duration:e.duration }); }); p.observer.observe({entryTypes:['longtask']}); p.supported=true; } catch(e) { p.observerError=String(e); }
  p.mutation = new MutationObserver(() => { p.mirrorAt=performance.now(); });
  p.mutation.observe(mirror, {subtree:true, childList:true, characterData:true});
  p.capture = (index, char) => new Promise((resolve, reject) => {
    const input = p.inputs[index], key = p.keys[index];
    if (!input || !key || key.char !== char || input.value.length !== index+1 || input.value[index] !== char || el.disabled || document.activeElement !== el || el.closest('[aria-hidden="true"]')) return reject(Error('missing, hidden, disabled or overlapping input at ' + index));
    const domAt = p.mirrorAt;
    if (!finiteTime(domAt) || domAt < input.at || mirror.textContent.replace(/\u200B/g,'') !== input.value) return reject(Error('mirror failed to update at ' + index));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const s = { index, char, eventToListenerMs:key.processed-key.stamp, inputToDomMs:domAt-input.at, inputToTwoRafMs:performance.now()-input.at };
      p.samples.push(s); resolve(s);
    }));
  });
  function finiteTime(n) { return typeof n === 'number' && Number.isFinite(n); }
  window.__inputStream = p;
  return {visible:true,disabled:false,focused:true};
})()`;

const keyEvent = (cdp, type, key, modifiers = 0, text) => cdp.send('Input.dispatchKeyEvent', { type, key, code: /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : key === 'Backspace' ? 'Backspace' : key === 'Control' ? 'ControlLeft' : undefined, modifiers, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : key === 'Backspace' ? 8 : 17, ...(text ? { text } : {}) });
const press = async (cdp, key, modifiers = 0, text) => { await keyEvent(cdp, 'keyDown', key, modifiers, text); await keyEvent(cdp, 'keyUp', key, modifiers); };
const bounded = maxMinutes => {
  const end = Date.now() + maxMinutes * 60000 - 12000;
  return (promise, label, cap = 30000) => {
    const ms = Math.min(cap, end - Date.now());
    if (ms <= 0) return Promise.reject(Error(`deadline: ${label}`));
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`timeout: ${label}`)), ms); })]).finally(() => clearTimeout(timer));
  };
};
const owned = async (start, close, bound, label) => {
  const pending = Promise.resolve().then(start);
  try { return await bound(pending, label); }
  catch (e) { pending.then(close).catch(() => {}); throw e; }
};

async function buildBounded(checkout, bound) {
  const code = `import { buildApp } from ${JSON.stringify(new URL('./build.mjs', import.meta.url).href)}; console.log('INPUT_BUILD='+JSON.stringify(await buildApp(${JSON.stringify(checkout)}, {skipIfFresh:true})));`;
  const child = spawn(process.execPath, ['--input-type=module','-e',code], { detached:true, stdio:['ignore','pipe','pipe'] });
  let out='', err=''; child.stdout.on('data', b => { out+=b; }); child.stderr.on('data', b => { err+=b; });
  const done = new Promise((ok, fail) => { child.on('error',fail); child.on('close', exit => { const line=out.split('\n').findLast(s=>s.startsWith('INPUT_BUILD=')); if (exit || !line) fail(Error(`build failed: ${err.slice(-1200)}`)); else { try { ok(JSON.parse(line.slice(12))); } catch(e) { fail(e); } } }); });
  try { return await bound(done, 'packaged build', 240000); }
  catch(e) { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } await Promise.race([done.catch(()=>{}), sleep(2000)]); throw e; }
}

async function measure(cdp, fake, id, streaming, bound) {
  const row = { expected:TEXT, samples:[], cleared:null, composer:null, stream:null, probe:null };
  let request, completion;
  if (streaming) {
    fake.plan({ deltas:STREAM_DELTAS, perSec:STREAM_PER_SEC, seed:'input-stream' });
    completion = fake.expectCompletion();
    const before=fake.requests.length;
    const sent=await bound(cdp.evaluate(`window.claude.native.send(${JSON.stringify(id)}, 'input-stream fixture')`), 'native send');
    if (sent?.status !== 'sent') throw Error(`native send refused: ${JSON.stringify(sent)}`);
    for (let i=0;i<100 && !fake.requests[before]?.deltasSent;i++) await bound(sleep(50),'stream engagement');
    request=fake.requests[before];
    if (!request?.deltasSent || request.endedAt) throw Error('fake stream never started');
  }
  await bound(installIpcStallProbe(cdp, {everyMs:100}), 'IPC probe');
  row.composer = await bound(cdp.evaluate(INSTALL), 'composer probe');
  const during=[];
  try {
    const exact = await runInputLeg({
      prepare: async () => {},
      key: async (char,index) => {
        const before=request?.deltasSent ?? null, activeBefore=!!request && request.endedAt === null;
        const t=performance.now();
        await bound(press(cdp,char,0,char), `key ${index}`, 3000);
        const sample=await bound(cdp.evaluate(`window.__inputStream.capture(${index},${JSON.stringify(char)})`), `DOM/two-rAF ${index}`, 3000);
        row.samples.push({ ...sample, dispatchWallMs:performance.now()-t });
        if (streaming) during.push({ before, after:request.deltasSent, activeBefore, activeAfter:request.endedAt === null });
      },
      finish: async () => bound(cdp.evaluate(`(() => { const p=window.__inputStream; p.active=false; p.observer?.disconnect(); return {draft:p.el.value,mirror:p.mirror.textContent.replace(/\\u200B/g,''),probe:{longtaskSupported:p.supported,observerError:p.observerError??null,longtasks:p.longtasks,rafGaps:p.rafGaps}}; })()`), 'exact final draft and timed probe stop'),
      clear: async () => {
        // User-equivalent keyboard clear, not a synthetic React state change.
        await bound(press(cdp,'a',2), 'Ctrl+A');
        await bound(press(cdp,'Backspace'), 'Backspace');
        row.cleared = await bound(cdp.evaluate(`(async()=>{await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); return {draft:window.__inputStream.el.value,mirror:window.__inputStream.mirror.textContent.replace(/\\u200B/g,'')}})()`), 'cleared mirror');
      },
    }, TEXT, { wait: ms => bound(sleep(ms),'key spacing'), deadline: () => true });
    row.draft = exact.draft;
    row.mirror = exact.mirror;
    row.probe = exact.probe;
  } finally {
    try { await bound(cdp.evaluate(`(() => {const p=window.__inputStream; if(!p) throw Error('missing probe'); p.active=false; p.observer?.disconnect(); p.mutation?.disconnect(); document.removeEventListener('keydown',p.onKey,true); p.el.removeEventListener('input',p.onInput); return true;})()`),'stop input probe'); } catch(e) { row.probeError=e.message; }
    try { row.ipc=await bound(readIpcStallProbe(cdp),'IPC reading'); } catch(e) { row.ipc={error:e.message}; }
    await stopIpcStallProbe(cdp).catch(()=>{});
  }
  if (streaming) {
    const rec=await bound(completion,'fake completion',30000);
    row.stream={...rec,during};
  }
  return row;
}

export async function main(argv = process.argv.slice(2)) {
  const opts=parseOptions(argv), bound=bounded(opts.maxMinutes);
  mkdirSync(dirname(opts.out),{recursive:true});
  const report={status:'incomplete',options:opts,scope:'private packaged desktop; eventToListenerMs starts at browser event timeStamp, not CDP dispatch; dispatchWallMs includes transport and capture round trips; input DOM and two rAF are proxies, not presented frames; no p99 or GPU paint claim',legs:{}};
  let x,app,fake;
  try {
    if (!assetsReady()) throw Error('perf-lab assets not cached');
    const build=opts.appDir ? {...JSON.parse(readFileSync(join(opts.appDir,'.perf-lab-build.json'),'utf8')),appDir:opts.appDir,binary:join(opts.appDir,'youcoded')} : await buildBounded(opts.checkout,bound);
    if (!build.sha || !statSync(build.binary).isFile()) throw Error('package missing build stamp or binary');
    report.build={sha:build.sha,dirty:build.dirty,builtAt:build.builtAt,appDir:build.appDir};
    // WHY: buildFixture recreates its root; refuse an occupied shared package
    // BEFORE seeding and use a unique HOME, never another run's fixed fixture.
    refusePackageProcesses(build.appDir);
    const fixture=buildFixture(mkdtempSync(join(ROOT,'scratch/perf-lab/input-stream-fixture-')),{fakeProvider:true,log:()=>{}});
    fake=await owned(()=>startFakeProvider({port:fixture.fakeProvider.port}),f=>f.close(),bound,'fake provider (fixed port collision refused)');
    x=opts.display === ':99' ? await owned(()=>startXvfb(':99'),v=>v.proc?.kill('SIGTERM'),bound,'Xvfb') : {display:opts.display,proc:null};
    app=await owned(()=>launchApp({binary:build.binary,appDir:build.appDir,fixture,display:x.display,cdpPort:9571,refuseExisting:true}),a=>a.kill(),p=>bound(p,'launch',90000),'app launch');
    const cdp=app.cdp;
    report.gpu=await bound(readRendererInfo(app.cdpPort,cdp),'GPU info');
    report.viewport=await bound(cdp.evaluate(`({width:innerWidth,height:innerHeight,scale:devicePixelRatio,visibility:document.visibilityState})`),'viewport');
    await bound(installPageHelpers(cdp),'page helpers');
    if (process.env.INPUT_STREAM_TRACE === '1') {
      await bound(cdp.evaluate('window.__inputTrace = []; window.__inputTraceSeq = 0; true'), 'enable private diagnostic render trace');
      report.diagnostic = {trace:opts.out+'.render-trace.json'};
    }
    // WHY: sample the entire session-open interval, not just the key press: a queued
    // history catch-up could have started before the composer probe is installed.
    if (process.env.INPUT_STREAM_PROFILE === '1') {
      await bound(cdp.send('Profiler.enable'), 'profiler enable');
      await bound(cdp.send('Profiler.setSamplingInterval', {interval:200}), 'profiler interval');
      await bound(cdp.send('Profiler.start'), 'profiler start');
      report.diagnostic = {...report.diagnostic, profile:opts.out+'.cpuprofile', profilingStartedBeforeSessions:true};
    }
    const ids=[], warnings=[];
    try {
      // Diagnostic-only control: keep six sessions and their order, but remove
      // the three resumed histories to test whether their rendering blocks input.
      const sessionFixture = process.env.INPUT_STREAM_FRESH_ONLY === '1' ? {...fixture, transcripts:{}} : fixture;
      if (sessionFixture !== fixture) report.diagnostic = {...report.diagnostic, freshOnly:true};
      const sessions=await bound(openJourneySessions(cdp,sessionFixture,{ids,warnings,nativeBinding:{providerId:fixture.fakeProvider.id,modelId:fixture.fakeProvider.modelId}}),'mixed sessions',90000);
      report.sessions={ids,names:sessions.names,sizes:sessions.sizeByName,warnings};
      const idx=ids.indexOf(sessions.nat[0].id);
      const selected=await bound(cdp.evaluate(`window.__perfLab.switchTo(${idx},${JSON.stringify(sessions.names[idx])},${ids.length},false,null,false)`),'native visible');
      if (selected.mode === 'none') throw Error(`native pane unavailable: ${selected.reason}`);
      if (process.env.INPUT_STREAM_SETTLE === '1') {
        report.diagnostic = {...report.diagnostic, settleAfterSelectMs:2200};
        await bound(sleep(2200),'diagnostic wait for post-open backlog');
      }
      for (const [name,streaming] of [['control',false],['streaming',true]]) {
        const row=await measure(cdp,fake,sessions.nat[0].id,streaming,bound);
        report.legs[name]=summariseInput(row,streaming);
        if (name === 'control' && report.diagnostic?.trace) {
          const trace=await bound(cdp.evaluate('window.__inputTrace'), 'diagnostic render trace');
          writeFileSync(report.diagnostic.trace,JSON.stringify(trace));
          report.diagnostic.traceEvents=trace.length;
        }
        if (name === 'control' && report.diagnostic?.profile) {
          report.diagnostic.stopRendererNowMs = await bound(cdp.evaluate('performance.now()'), 'profile clock anchor');
          const {profile} = await bound(cdp.send('Profiler.stop'), 'profiler stop');
          report.diagnostic.profileEndUs = profile.endTime;
          writeFileSync(report.diagnostic.profile, JSON.stringify(profile));
          await bound(cdp.send('Profiler.disable'), 'profiler disable');
        }
      }
      // Mark switching and scrolling separately; no input samples are attributed to either.
      // One additional deterministic stream makes these legs independent of the input stream ending.
      // Provider completion can precede the app's turn-end commit. Do not queue
      // the next workload into that gap and call its missing stream an app stall.
      await bound(cdp.evaluate(`(async () => { while (document.querySelector('button[aria-label="Stop generating"]')) await new Promise(r => setTimeout(r, 50)); })()`), 'previous turn completed');
      fake.plan({deltas:STREAM_DELTAS,perSec:STREAM_PER_SEC,seed:'input-navigation'});
      const done=fake.expectCompletion(), n=fake.requests.length;
      const navigationSend = await bound(cdp.evaluate(`window.claude.native.send(${JSON.stringify(sessions.nat[0].id)}, 'navigation fixture')`),'navigation send');
      if (navigationSend?.status !== 'sent') throw Error(`navigation send refused: ${JSON.stringify(navigationSend)}`);
      for (let i = 0; i < 100 && !fake.requests[n]?.deltasSent; i++) await bound(sleep(50), 'navigation stream engagement');
      if (!fake.requests[n]?.deltasSent || fake.requests[n].endedAt) throw Error('navigation stream never started');
      const navigation={switches:[],scroll:null};
      const huge=sessions.names.findIndex(name=>sessions.sizeByName[name]==='huge');
      for (const dest of [huge,idx]) {
        const rec=fake.requests[n], active=!!rec && rec.deltasSent>0 && rec.endedAt===null;
        const result=await bound(cdp.evaluate(`window.__perfLab.switchTo(${dest},${JSON.stringify(sessions.names[dest])},${ids.length},true,null,${dest===idx})`),'navigation switch');
        navigation.switches.push({active,ok:result.ok,mode:result.mode,domTwoRafMs:result.paintedMs??null});
        if (dest===huge) {
          const scrollActive=!!fake.requests[n] && fake.requests[n].deltasSent>0 && fake.requests[n].endedAt===null;
          navigation.scroll=await bound(cdp.evaluate(`(() => { const p=[...document.querySelectorAll('.chat-scroll')].find(e=>!e.closest('[aria-hidden="true"]')); if(!p) return {ok:false}; const before=p.scrollTop; p.scrollTop=Math.max(0,before-240); return {ok:p.scrollTop !== before, before, after:p.scrollTop}; })()`),'navigation scroll');
          navigation.scroll.active=scrollActive && fake.requests[n].endedAt===null;
        }
      }
      navigation.stream=await bound(done,'navigation completion',30000);
      report.navigation={...navigation,status:navigation.switches.every(s=>s.active&&s.ok) && navigation.scroll?.ok && navigation.scroll.active && navigation.stream.deltasSent===STREAM_DELTAS&&!navigation.stream.aborted?'measured':'incomplete'};
      report.status=Object.values(report.legs).every(l=>l.status==='measured') && report.navigation.status==='measured'?'measured':'incomplete';
      // Screenshot only AFTER all timing and observer work.
      const shot=await bound(cdp.send('Page.captureScreenshot',{format:'png'}),'post-measure screenshot');
      report.screenshot=opts.out+'.png';
      writeFileSync(report.screenshot,Buffer.from(shot.data,'base64'));
    } finally { await closeInputSessions(ids, async id => { try { await bound(cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`),'owned session cleanup',3000); } catch(e) { report.status='incomplete'; (report.cleanupErrors??=[]).push(e.message); } }); }
  } catch(e) { report.status='incomplete'; report.error=String(e?.message??e); }
  finally {
    if (app) { try { await Promise.race([app.kill(),sleep(8000).then(()=>{throw Error('app cleanup timeout');})]); } catch(e) { report.status='incomplete'; report.cleanupError=e.message; } }
    if (x?.proc) x.proc.kill('SIGTERM');
    if (fake) { try { await Promise.race([fake.close(),sleep(3000).then(()=>{throw Error('provider cleanup timeout');})]); } catch(e) { report.status='incomplete'; report.providerCleanupError=e.message; } }
    writeFileSync(opts.out,JSON.stringify(report,null,2)+'\n');
  }
  console.log(`${report.status}: ${opts.out}`);
  if (report.status!=='measured') process.exitCode=2;
  return report;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e);process.exitCode=2;});
