// One packaged app, one existing theme, one real X display. Diagnostic, NOT a frame benchmark.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, existsSync, lstatSync, readdirSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture } from './fixture.mjs';
import { treeFingerprint } from './build.mjs';
import { launchApp, readCmdline, readPpid, selfChain } from './launch.mjs';
import { connect } from './cdp.mjs';
import { readRendererInfo } from './gpu.mjs';
import { cpuSnapshot, findFamily } from './procs.mjs';
import { installProbe, readProbe, stopProbe } from './scenario-workload.mjs';
import { waitForProjectsHeader } from './watcher-burst.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PORT = 9586;
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const STOCK = 'midnight', HEAVY = 'devils-garden';

// WHY: buildApp writes its authoritative stamp in release/, not in
// linux-unpacked/. Copies used for preserved baselines instead carry their
// stamp internally. Never borrow an unrelated package's parent stamp.
export async function loadPackageStamp({checkout,appDir}, {fingerprint=treeFingerprint}={}) {
  const official=join(checkout,'desktop','release','linux-unpacked');
  const isOfficial=resolve(appDir)===official;
  const stampPath=isOfficial ? join(dirname(appDir),'.perf-lab-build.json') : join(appDir,'.perf-lab-build.json');
  if(!existsSync(stampPath)) throw Error(`package stamp missing: ${stampPath}`);
  const stamp=JSON.parse(readFileSync(stampPath,'utf8'));
  if(typeof stamp.sha!=='string' || !/^[0-9a-f]{6,40}$/.test(stamp.sha) || !stamp.builtAt || !statSync(join(appDir,'youcoded')).isFile()) throw Error('stamped package or executable missing');
  if(isOfficial) {
    // Same equivalence buildApp uses when skipping a build; compare read-only,
    // never rebuild or trust an official stamp for modified checkout bytes.
    const current=await fingerprint(checkout);
    if(stamp.sha!==current.sha || stamp.dirty!==current.dirty) throw Error('official package stamp fingerprint differs from current checkout; refusing stale binary');
  }
  return {...stamp,appDir,stampPath,source:isOfficial?'official-parent':'preserved-internal'};
}

// WHY: a shell running `node gpu-theme ... --app-dir <package>` names the
// package on its argv, but it is our own ancestor, not a running app. Exclude
// only our ancestor chain; refuse every other matching process before launch.
export function refusePackageProcesses(appDir,{find=findFamily,read=readCmdline,ppid=readPpid,selfPid=process.pid,ownParentPid=readPpid(process.pid)}={}) {
  const ours=selfChain(ppid,selfPid);
  if(ownParentPid>1) for(const pid of selfChain(ppid,ownParentPid)) ours.add(pid);
  const foreign=find([appDir]).filter(pid=>!ours.has(pid) && read(pid).includes(appDir));
  if(foreign.length) throw Error(`package already running (${foreign.map(pid=>`${pid} parent=${ppid(pid)} argv=${read(pid).slice(0,320)}`).join('; ')}); refusing launcher sweep`);
}

export function parseOptions(argv, root = ROOT) {
  const o = {maxMinutes:5, theme:STOCK, trace:'on', profile:'off', control:'folded'};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i+1];
    if (!['--real-display','--checkout','--app-dir','--out','--max-minutes','--theme','--theme-source','--trace','--profile','--control'].includes(k) || !v || v.startsWith('--')) throw Error(`invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  for (const k of ['checkout','appDir','out']) if (!o[k] || !isAbsolute(o[k])) throw Error(`--${k} requires an absolute path`);
  if (!/^:[0-9]+$/.test(o.realDisplay ?? '') || o.realDisplay === ':99') throw Error('--real-display :N is required (:99 is reserved for virtual perf runs)');
  if (!/^[1-9][0-9]*$/.test(String(o.maxMinutes)) || Number(o.maxMinutes) > 10) throw Error('--max-minutes must be 1..10');
  if (![STOCK, HEAVY].includes(o.theme)) throw Error('theme must be midnight or devils-garden');
  if (!['on','off'].includes(o.trace)) throw Error('--trace must be on or off');
  if (!['on','off'].includes(o.profile)) throw Error('--profile must be on or off');
  if (!['folded','full-folded','style-trace'].includes(o.control)) throw Error('--control must be folded, full-folded or style-trace');
  if (['full-folded','style-trace'].includes(o.control) && (o.trace!=='off' || o.profile!=='off')) throw Error('full-folded/style-trace control requires trace and profile off');
  if (o.trace === 'on' && o.profile === 'on') throw Error('profile requires --trace off (no overlapping instrumentation)');
  o.themeSource ??= join(homedir(), '.claude', 'wecoded-themes');
  if (!isAbsolute(o.themeSource)) throw Error('--theme-source must be absolute');
  o.maxMinutes = Number(o.maxMinutes);
  o.checkout = resolve(o.checkout); o.appDir = resolve(o.appDir); o.out = resolve(o.out);
  return o;
}

// WHY: rejecting a missing asset BEFORE launch prevents the heavy leg silently
// falling back to the stock CSS. Never follow symlinks outside the source pack.
export function inspectTheme(slug, source, checkout = join(ROOT,'youcoded')) {
  const file = slug === STOCK ? join(checkout,'desktop/src/renderer/themes/builtin/midnight.json') : join(source,slug,'manifest.json');
  try {
    const manifest = JSON.parse(readFileSync(file,'utf8'));
    if (manifest.slug !== slug) throw Error('manifest slug mismatch');
    const assets = slug === STOCK ? [] : [manifest.background?.type === 'image' ? manifest.background.value : null,
      manifest.background?.['terminal-value'], manifest.background?.pattern, manifest.scrollbar?.['thumb-image'], manifest.appIcon,
      ...Object.values(manifest.mascot ?? {}), ...Object.values(manifest.icons ?? {}), ...(manifest.companions ?? []).map(c => c.asset)].filter(Boolean);
    const dir = dirname(file);
    if(slug === HEAVY) {
      // WHY: the copied pack must not carry links back to a real-home file,
      // including files the current manifest does not reference.
      const pending=[dir];
      while(pending.length) {
        const p=pending.pop();
        if(lstatSync(p).isSymbolicLink()) throw Error('theme contains symlink');
        if(lstatSync(p).isDirectory()) for(const name of readdirSync(p)) pending.push(join(p,name));
      }
    }
    const files = assets.map(rel => {
      if (typeof rel !== 'string' || !rel.startsWith('assets/') || rel.split('/').includes('..')) throw Error(`invalid asset ${rel}`);
      const p = join(dir, rel);
      if (!existsSync(p) || !statSync(p).isFile() || !realpathSync(p).startsWith(realpathSync(dir)+sep)) throw Error(`missing asset ${rel}`);
      return {path:rel, bytes:statSync(p).size};
    });
    if (slug === HEAVY && (manifest.background?.type !== 'image' || !manifest.effects?.particles || files.length === 0)) throw Error('heavy theme lacks wallpaper/effects/assets');
    return {status:'ready',slug,manifest,assets:files,source:file};
  } catch (e) { return {status:'unsupported',slug,reason:String(e?.message ?? e),source:file}; }
}

// WHY: ThemeBg renders #theme-bg only when bgStyle exists. Midnight has no
// background, so readiness is the applied slug, not a nonexistent div.
export function themeReadyExpression(theme) {
  const slug = `document.documentElement.dataset.theme===${JSON.stringify(theme.slug)}`;
  return theme.manifest?.background ? `${slug} && !!document.querySelector('#theme-bg')` : slug;
}

// WHY: a CSS background is a div, not an <img>; decoding a newly constructed
// Image proves only that the URL is readable, not that the displayed background
// loaded. DOM + CSS + resource timing are diagnostics; the screenshot needs review.
export function assessTheme(theme, dom) {
  const m=theme.manifest;
  if (dom?.slug !== theme.slug || dom?.reduced || !dom?.canvas || dom.canvas.trim().toLowerCase() !== m?.tokens?.canvas?.toLowerCase()) return {status:'incomplete',reason:'applied theme tokens/reduced-effects mismatch'};
  if (!m.background) return {status:dom.bgPresent || dom.wallpaper || dom.particleCanvas ? 'incomplete':'ready',reason:dom.bgPresent || dom.wallpaper || dom.particleCanvas ? 'plain theme has unexpected background/effects':'plain theme has no background/effects'};
  const expected=`theme-asset://${theme.slug}/${m.background.value}`;
  if (!dom.bgPresent || !dom.wallpaper || !dom.bg?.includes(expected)) return {status:'incomplete',reason:'wallpaper element/CSS URL not confirmed'};
  // WHY: a custom Electron scheme may omit ResourceTiming entries. An Image
  // decoding this SAME URL proves it is readable, not that the CSS image painted;
  // screenshot review remains mandatory and drawing stays unsupported.
  if (dom.wallpaperDecode?.ok !== true || dom.wallpaperDecode.source !== expected || !dom.wallpaperDecode.width || !dom.wallpaperDecode.height) return {status:'incomplete',reason:'wallpaper URL decode failed or unconfirmed'};
  if (dom.panelsBlur !== `${m.background['panels-blur'] ?? 0}px` || dom.bubbleBlur !== `${m.background['bubble-blur'] ?? 0}px` || !dom.glass?.includes(`blur(${m.background['panels-blur']}px)`)) return {status:'incomplete',reason:'effective blur does not match manifest'};
  if (!dom.particleCanvas || dom.particleCanvas.width <= 0 || dom.particleCanvas.height <= 0 || dom.visibility !== 'visible') return {status:'incomplete',reason:'particle canvas absent, unsized or page hidden'};
  return {status:'unsupported',reason:'canvas mounted and settings agree; particle drawing/presentation not proven without invasive observation and screenshot review'};
}

// WHY: reports/screenshots may contain private history. Refuse ALL output
// destinations outside this worktree scratch and existing or symlinked targets.
export function validateOutputPath(out,root=ROOT,{ownedThemeScreenshot=null}={}) {
  const base=join(root,'scratch','perf-lab');
  if (!isAbsolute(out) || resolve(out)!==out || !out.startsWith(base+sep)) throw Error('output must be a canonical absolute path inside worktree scratch/perf-lab');
  let parent=dirname(out);
  while (true) {
    if (existsSync(parent) || lstatExists(parent)) {
      if(lstatSync(parent).isSymbolicLink()) throw Error('output parent symlink refused');
      if(!lstatSync(parent).isDirectory()) throw Error('output parent is not directory');
    }
    if(parent===root) break;
    const next=dirname(parent);
    if(next===parent) throw Error('output escaped worktree');
    parent=next;
  }
  for(const path of [out,out+'.trace.json',out+'.style-full.trace.json',out+'.style-folded.trace.json',out+'.full.png',out+'.png',out+'.failure.png',out+'.theme.png',...[0,1,2,3].flatMap(i=>[`${out}.switch-${i}.cpuprofile.json`,`${out}.switch-${i}.png`])]) {
    if(path===ownedThemeScreenshot && path===out+'.theme.png' && lstatExists(path) && lstatSync(path).isFile()) continue;
    if(lstatExists(path)) throw Error(`output already exists: ${path}`);
  }
  return out;
}
function lstatExists(path) {try{lstatSync(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}

// WHY: this executes the same raw-trace write as workload's finally block but
// takes only its report, so an undefined outer `options` cannot hide until launch.
// Validate the full output set before writing; later owned screenshot/report
// writes use exclusive create, not a second whole-run preflight that rejects us.
export function saveTrace(report, raw, {root=ROOT}={}) {
  const out=report.options.out;
  validateOutputPath(out,root,{ownedThemeScreenshot:report.themeScreenshot});
  const traceFile=out+'.trace.json';
  const payload={metadata:{build:report.build,theme:report.theme.slug,scope:'browser-wide private package, diagnostic tracing overhead; not baseline',categories:raw.categories,complete:raw.complete,truncated:raw.truncated,dataLossOccurred:raw.dataLossOccurred,error:raw.error??null},traceEvents:raw.events};
  writeFileSync(traceFile,JSON.stringify(payload,null,2)+'\n',{flag:'wx'});
  report.trace=assessTrace(raw);
  report.trace.categories=raw.categories;
  report.traceFile=traceFile;
  return traceFile;
}

// WHY: a resumed conversation can acquire a different app session ID/name;
// the only defensible mapping is ONE newly appearing strip/menu data-session-id.
export function resolveSessionPill(before,after,createdId) {
  const added=[...new Set(after)].filter(id=>id && !before.includes(id));
  if(added.length!==1) throw Error(added.length?'ambiguous new session IDs':'no new session ID in DOM');
  return {createdId,pillId:added[0],mapping:added[0]===createdId?'exact':'new-dom-id'};
}
// WHY: a CPU profile without samples or a matched action is not evidence of a switch cost.
export function assessSwitchProfile(profile, action) {
  return {ok:profile?.nodes?.length>0 && profile?.samples?.length>0 && profile?.timeDeltas?.length===profile.samples.length && profile.endTime>profile.startTime && action?.status==='measured', samples:profile?.samples?.length??0};
}
// WHY: a pill index is only an inferred ChatView identity; reject reordered,
// duplicated or missing strip indices rather than silently naming the wrong pane.
export function matchPaneIdentity(panes, pills) {
  if (panes.length !== pills.length || panes.filter(p=>p.visible).length !== 1) return null;
  if (panes.some((p,i)=>p.index!==i || pills[i]?.index!==i || p.id!==pills[i].id || !p.id)) return null;
  return panes.find(p=>p.visible).id;
}
// WHY: `.in-view` belongs to every row, including folded spacers. Verify the
// same source entry keys AND body hashes in the known bottom-of-chat band.
export function assessFirstFrameContent(expected, frame) {
  const ok=!!(expected?.id && frame?.visible && frame.id===expected.id && expected.rows?.length>=1 &&
    expected.rows.every(r=>r.key && r.hash>0 && frame.rows?.some(x=>x.key===r.key && x.hash===r.hash)));
  return {ok,reason:ok?null:'near-viewport source entry keys/bodies missing or pane identity differs'};
}
// WHY: full content before the 800ms active-fold timer is a separate,
// time-limited workload, not a three-sample stable folded state.
export function assessFullCondition(p,target,{focus,visibility,ageMs}={}) {
  const ok=!!(p && target && focus===true && visibility==='visible' && ageMs>=0 && ageMs<780 && p.keysHash>0 && p.folded===0 && p.entries===target.entries && p.markdown===target.markdown && p.chars===target.chars);
  return {ok,reason:ok?null:'full page/focus/natural pre-fold window not confirmed'};
}
// WHY: a three-sample 500 ms plateau can be the FULL list waiting for the
// natural 800 ms active fold. Demand observed spacers and unchanged canonical
// workload for >1 s, without altering the app's folding scheduler.
export function assessSteadyFolded(samples,target) {
  const last=samples?.at(-1);
  const ok=!!(samples?.length>=3 && last && last.at-samples[0].at>=1000 && last.folded>0 && last.keysHash>0 &&
    target && samples.every(s=>s.entries===target.entries && s.markdown===target.markdown && s.chars===target.chars && s.folded===target.folded && s.keysHash===last.keysHash));
  return {ok,reason:ok?null:'folded state not yet observed and stable beyond active fold timer at exact canonical counts'};
}
export function assessSettled(samples) {
  const last=samples?.at(-1);
  const ok=samples?.length>=3 && last.entries>=10 && last.markdown>0 && last.chars>0 && samples.slice(-3).every(s=>s.entries===last.entries && s.markdown===last.markdown && s.chars===last.chars);
  return {ok:!!ok,reason:ok?null:'rendered content missing or not stable across three samples'};
}
export function assessActions(actions,kind) {
  const ok=Array.isArray(actions)&&actions.length>=3&&actions.length<=5&&actions.every(a=>a.kind===kind && a.status==='measured' && assessLeg(a).status==='measured');
  return {ok,reason:ok?null:`${kind} requires 3-5 separately engaged measured actions`};
}
export function assessLeg(r) {
  const reasons = [];
  if (r?.error) reasons.push(r.error);
  if (!finite(r?.elapsedMs) || r.elapsedMs <= 0 || !r?.probe?.longtaskSupported || !finite(r.probe.observedMs) || !finite(r.probe.longtaskCount) || !finite(r.probe.longtaskTotalMs) || !finite(r.probe.frames) || r.probe.frames === 0) reasons.push('renderer longtask/rAF proxy missing');
  if (!finite(r?.cpu?.totalSeconds) || !finite(r?.metrics?.TaskDuration)) reasons.push('CPU or renderer task total missing');
  const e = r?.engagement;
  if (r?.kind === 'scroll' && !(finite(e?.before) && finite(e?.after) && e.after !== e.before && e.scrollHeight > e.clientHeight)) reasons.push('scroll did not move a scrollable pane');
  if (r?.kind === 'resize' && !(finite(e?.events) && e.events > 0 && finite(e?.beforeWidth) && finite(e?.afterWidth) && e.beforeWidth !== e.afterWidth)) reasons.push('viewport resize unengaged');
  if (r?.kind === 'switch') {
    if (!(e?.beforeId && e?.afterId === e?.targetId && e.beforeId !== e.afterId)) reasons.push('active session did not change');
    const f=e?.firstFrame;
    if (!(f?.entries>=10 && f?.markdown>0 && f?.chars>0 && f?.visible && f?.distanceFromBottom>=-2 && f?.distanceFromBottom<=150)) reasons.push('first-frame DOM/content/scroll invariant failed');
    if (!assessFirstFrameContent(e?.expectedRows,f).ok) reasons.push('first-frame keyed near-viewport content mismatch');
    if (e?.canonical && (f?.markdown!==e.canonical.markdown || f?.chars!==e.canonical.chars || f?.entries!==e.canonical.entries)) reasons.push('first-frame canonical folded workload mismatch');
  }
  if (r?.kind === 'minimal-switch' && !(e?.beforeId && e?.afterId===e?.targetId && e.beforeId!==e.afterId && e.focus===true && e.visibility==='visible')) reasons.push('minimal switch ID/focus invariant failed');
  if (!['idle','scroll','resize','switch','minimal-switch'].includes(r?.kind)) reasons.push('unknown leg');
  return {...r,status:reasons.length?'incomplete':'measured',reasons};
}
export function traceInventory(events, limit = 80) {
  const counts = new Map();
  for (const e of events) if (typeof e?.name === 'string') counts.set(e.name,(counts.get(e.name) ?? 0)+1);
  return {names:[...counts].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,limit).map(([name,count])=>({name,count})),distinct:counts.size,truncated:counts.size>limit};
}
export function assessTrace(trace) {
  const presentation = {status:'unsupported',presentedFrames:null,droppedFrames:null,reason:'No validated app-attributed presentation semantics; event names and rAF callbacks do not establish display presentation.'};
  if (!trace?.complete || !Array.isArray(trace.events) || !trace.events.length || trace.truncated || trace.dataLossOccurred !== false || trace.error) return {status:'incomplete',presentation,reason:trace?.error ?? 'trace absent, empty, truncated, or Chromium data loss not ruled out'};
  return {status:'diagnostic',presentation,events:trace.events.length,inventory:traceInventory(trace.events)};
}
export function assessRun(r) {
  const reasons = [];
  if (r?.theme?.status !== 'ready' || r?.theme?.engagement?.status !== 'ready') reasons.push('theme/effects not confirmed in renderer');
  if (r?.gpu?.source !== 'SystemInfo' || !r.gpu.glRenderer || !r.gpu.featureStatus?.gpu_compositing) reasons.push('browser GPU identity or compositing feature status unavailable');
  if (!Array.isArray(r?.legs) || r.legs.length !== 4 || r.legs.some(l => l.status !== 'measured' || (['resize','switch'].includes(l.kind) && !assessActions(l.actions,l.kind).ok))) reasons.push('one or more workload legs/actions incomplete');
  if (r?.options?.trace==='on' && r?.trace?.status !== 'diagnostic') reasons.push('diagnostic trace incomplete');
  // WHY: four measured actions without four usable profile files cannot attest
  // to a completed diagnostic profile run.
  if (r?.options?.profile==='on' && (r.profiles?.length!==4 || r.profiles.some(p=>!p.ok || !p.file))) reasons.push('diagnostic switch profiles incomplete');
  if (!['on','off'].includes(r?.options?.trace)) reasons.push('trace mode missing');
  if (!r?.screenshot) reasons.push('screenshot missing');
  return {...r,status:reasons.length?'incomplete':r.options.trace==='off'?'measured':'diagnostic',reasons};
}
export function cleanupFixture(root) {
  if (!root || !existsSync(join(root,'owner')) || readFileSync(join(root,'owner'),'utf8') !== 'gpu-theme') throw Error('refusing unowned fixture cleanup');
  rmSync(root,{recursive:true,force:true,maxRetries:3});
}
function bounder(minutes) {
  const end = Date.now()+minutes*60000-12000;
  return (p,label,cap=30000) => {
    const left = Math.min(cap,end-Date.now());
    if (left <= 0) return Promise.reject(Error(`deadline: ${label}`));
    let timer;
    return Promise.race([Promise.resolve(p),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`timeout: ${label}`)),left);})]).finally(()=>clearTimeout(timer));
  };
}
async function portFree(port) {
  const server=createServer();
  try { await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);}); }
  finally { if (server.listening) await new Promise(ok=>server.close(ok)); }
}
function displayInfo(display) {
  // Read-only query; never create, reset or signal the existing X server.
  const output=execFileSync('xrandr',['--display',display,'--current'],{encoding:'utf8',timeout:3000});
  return {display,output:output.slice(0,12000),currentModes:output.split('\n').filter(l=>/\*/.test(l)).map(l=>l.trim())};
}
async function waitFor(cdp,bound,expr,label) {
  for (let i=0;i<80;i++) {
    const value=await bound(cdp.evaluate(expr),label,2000);
    if (value) return value;
    await bound(sleep(100),label,2000);
  }
  throw Error(`${label} did not converge`);
}
const pane = `([...document.querySelectorAll('.chat-scroll')].find(p=>!p.closest('[aria-hidden="true"]')))`;
const active = `(() => {const panes=[...document.querySelectorAll('.chat-scroll')].map((p,index)=>({index,id:document.querySelector('[data-session-strip] [data-session-idx="'+index+'"][data-session-id]')?.dataset.sessionId,visible:!p.closest('[aria-hidden="true"]')}));const pills=[...document.querySelectorAll('[data-session-strip] [data-session-idx][data-session-id]')].filter(e=>e.closest('[data-session-strip]') && !e.closest('[role="menu"]')).map(e=>({index:Number(e.dataset.sessionIdx),id:e.dataset.sessionId}));return panes.length===pills.length && panes.filter(p=>p.visible).length===1 && panes.every((p,i)=>p.index===i && pills[i]?.index===i && p.id===pills[i].id) ? panes.find(p=>p.visible).id : null})()`;
const domIds = `([...document.querySelectorAll('[data-session-strip] [data-session-id]')].map(e=>e.getAttribute('data-session-id')).filter(Boolean))`;
const contentExpr = `(() => {const panes=[...document.querySelectorAll('.chat-scroll')];return panes.map((p,i)=>{const rows=[...p.querySelectorAll('.timeline-entry')];let keysHash=2166136261;for(const r of rows)for(const c of r.dataset.entryKey??'')keysHash=Math.imul(keysHash^c.charCodeAt(0),16777619);return {at:Date.now(),index:i,id:document.querySelector('[data-session-strip] [data-session-idx="'+i+'"][data-session-id]')?.getAttribute('data-session-id')??null,visible:!p.closest('[aria-hidden="true"]'),entries:rows.length,folded:rows.filter(r=>r.style.height!=='' && r.textContent?.length===0).length,keysHash:keysHash>>>0,markdown:p.querySelectorAll('.timeline-entry p, .timeline-entry pre, .yc-code-block').length,chars:p.textContent?.length??0}})})()`;
// Canonical counts from earlier exact-package reports, not values learned from
// the run being judged. Unexpected folding or partially loaded pages fail closed.
const FOLDED_CANONICAL={small:{entries:60,folded:57,markdown:7,chars:6047},medium:{entries:60,folded:57,markdown:10,chars:26334}};
const FULL_CANONICAL={small:{entries:60,folded:0,markdown:131,chars:87372},medium:{entries:60,folded:0,markdown:136,chars:109597}};
// WHY: only the visible pane is rect-measured OUTSIDE action timing. A folded
// spacer has an entry key but no body; stable keyed body hashes catch that.
const hashBody = `s=>{if(!s)return 0;let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0}`;
const nearRows = `(() => {const p=${pane};if(!p)return null;const bounds=p.getBoundingClientRect();const hash=${hashBody};return {id:${active},visible:!p.closest('[aria-hidden="true"]'),rows:[...p.querySelectorAll('.timeline-entry[data-entry-key]')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>=bounds.top-40 && r.top<=bounds.bottom+40}).map(e=>({key:e.dataset.entryKey,hash:hash(e.textContent)}))}})()`;
function environmentSnapshot() {
  const read=p=>{try{return readFileSync(p,'utf8').trim();}catch{return null;}};
  const cpus=read('/proc/stat')?.split('\n').filter(x=>/^cpu[0-9]+ /.test(x)).length??null;
  const processes=readdirSync('/proc').filter(x=>/^[0-9]+$/.test(x)).length;
  return {at:Date.now(),loadavg:read('/proc/loadavg')?.split(' ').slice(0,3).map(Number)??null,cpuCount:cpus,processCount:processes,
    cpuPressure:read('/proc/pressure/cpu')?.split('\n')[0]??null,
    governor:read('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor'),frequencyKHz:read('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq')};
}
// WHY: a whole-workload trace overflowed 100k events. Bound one action,
// preserve raw event args/stack/invalidation attribution, and fail on loss.
export function assessNarrowTrace(t) {
  return {ok:!!(t?.complete && t.dataLossOccurred===false && !t.truncated && !t.error && t.events?.length>0 && t.events.some(e=>e.name==='UpdateLayoutTree')),events:t?.events?.length??0};
}
async function narrowTrace(cdp,bound) {
  const trace={complete:false,dataLossOccurred:null,truncated:false,events:[],categories:'devtools.timeline,disabled-by-default-devtools.timeline.stack,disabled-by-default-devtools.timeline.invalidationTracking'};
  let finish;
  const done=new Promise(ok=>{finish=ok});
  const collecting=p=>{for(const e of p.value??[]) {if(trace.events.length<100000)trace.events.push(e);else trace.truncated=true;}};
  const completed=p=>{trace.dataLossOccurred=p?.dataLossOccurred??null;trace.complete=!p?.stream && p?.dataLossOccurred===false;finish();};
  cdp.on('Tracing.dataCollected',collecting);cdp.on('Tracing.tracingComplete',completed);
  await bound(cdp.send('Tracing.start',{categories:trace.categories,options:'record-as-much-as-possible',transferMode:'ReportEvents'}),'narrow trace start',3000);
  return {async stop(){try{await bound(cdp.send('Tracing.end'),'narrow trace end',3000);await bound(done,'narrow trace complete',6000);}catch(e){trace.error=String(e);}return trace;}};
}
async function traceStart(port,bound) {
  const res=await bound(fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(3000)}),'browser endpoint',4000);
  const url=(await res.json()).webSocketDebuggerUrl;
  if (!url) throw Error('no browser CDP endpoint');
  const cdp=await bound(connect(url),'browser CDP',4000);
  const trace={complete:false,dataLossOccurred:null,events:[],truncated:false,categories:'devtools.timeline,blink,cc,viz,gpu,disabled-by-default-devtools.timeline.frame'};
  // WHY: cap in-memory events; overflow is an incomplete trace, never a quiet sample.
  cdp.on('Tracing.dataCollected',p=>{for(const e of p.value ?? []) {if(trace.events.length<100000)trace.events.push(e);else trace.truncated=true;}});
  let finish;
  const done=new Promise(ok=>{finish=ok;});
  cdp.on('Tracing.tracingComplete',p=>{trace.dataLossOccurred=p?.dataLossOccurred ?? null;trace.complete=!p?.stream && p?.dataLossOccurred === false;finish();});
  try { await bound(cdp.send('Tracing.start',{categories:trace.categories,options:'record-as-much-as-possible',transferMode:'ReportEvents'}),'trace start',5000); }
  catch(e){cdp.close();throw e;}
  return {trace,async stop(){try{await bound(cdp.send('Tracing.end'),'trace end',5000);await bound(done,'trace completion',8000);}finally{cdp.close();}return trace;}};
}
async function measureLeg(app,kind,bound,action) {
  const cdp=app.cdp;
  await bound(installProbe(cdp),'renderer probe',3000);
  const before=cpuSnapshot(app.family());
  const metricBefore=Object.fromEntries((await bound(cdp.send('Performance.getMetrics'),'metrics before',2000)).metrics.map(m=>[m.name,m.value]));
  const start=Date.now();
  let engagement,error;
  try { engagement=await action(); }
  catch(e){error=String(e?.message??e);}
  const elapsedMs=Date.now()-start;
  const after=cpuSnapshot(app.family());
  let ticks=0;for(const [pid,n] of before) if(after.has(pid)) ticks+=Math.max(0,after.get(pid)-n);
  let probe,metrics;
  try { await bound(stopProbe(cdp),'probe stop',2000); probe=await bound(readProbe(cdp),'probe result',2000); }
  catch(e){probe={error:String(e)};}
  try {
    const metricAfter=Object.fromEntries((await bound(cdp.send('Performance.getMetrics'),'performance after',2000)).metrics.map(m=>[m.name,m.value]));
    metrics={before:metricBefore,after:metricAfter,TaskDuration:finite(metricBefore.TaskDuration) && finite(metricAfter.TaskDuration) && metricAfter.TaskDuration>=metricBefore.TaskDuration ? metricAfter.TaskDuration-metricBefore.TaskDuration : null};
  } catch(e){metrics={error:String(e)};}
  const hz=Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}).trim());
  return assessLeg({kind,engagement,elapsedMs,probe,metrics,cpu:{totalSeconds:Number.isFinite(hz)&&hz>0?ticks/hz:null,coverage:'matched surviving owned PIDs only'},error});
}
async function workload(app,fixture,bound,report) {
  const cdp=app.cdp;
  await bound(cdp.send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false}),'viewport',3000);
  await waitForProjectsHeader(cdp,bound);
  // WHY: React can mount before its async user-theme loader finishes. A stock
  // fallback screenshot is NOT evidence the heavy theme or its wallpaper loaded.
  await waitFor(cdp,bound,themeReadyExpression(report.theme),'theme applied');
  const wallpaper=report.theme.manifest.background?.type==='image' ? `theme-asset://${report.theme.slug}/${report.theme.manifest.background.value}` : null;
  const theme=await bound(cdp.evaluate(`(async () => {
    const root=document.documentElement, bg=document.querySelector('#theme-bg');
    const canvas=[...document.querySelectorAll('canvas[aria-hidden="true"]')].find(e=>e.style.position==='fixed' && e.style.pointerEvents==='none' && e.style.opacity==='0.6');
    const background=bg?.style.backgroundImage ?? null;
    const url=background?.match(/url\\(["']?([^"')]+)["']?\\)/)?.[1] ?? null;
    const resource=url ? performance.getEntriesByType('resource').find(e=>e.name===new URL(url,location.href).href && e.responseEnd>0) : null;
    let wallpaperDecode=null;
    if (${JSON.stringify(wallpaper)}) {
      const image=new Image();image.src=${JSON.stringify(wallpaper)};
      try { await Promise.race([image.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('image decode timeout')),3500))]);wallpaperDecode={ok:image.naturalWidth>0&&image.naturalHeight>0,source:image.currentSrc||image.src,width:image.naturalWidth,height:image.naturalHeight}; }
      catch(e){wallpaperDecode={ok:false,source:image.currentSrc||image.src,error:String(e)};}
    }
    return {wallpaperDecode,slug:root.dataset.theme,reduced:root.hasAttribute('data-reduced-effects'),wallpaper:root.hasAttribute('data-wallpaper'),bgPresent:!!bg,bg:background,
      image:resource ? {source:resource.name,width:bg.clientWidth,height:bg.clientHeight,resourceDuration:resource.duration} : null,
      canvas:getComputedStyle(root).getPropertyValue('--canvas').trim(),panelsBlur:getComputedStyle(root).getPropertyValue('--panels-blur').trim(),bubbleBlur:getComputedStyle(root).getPropertyValue('--bubble-blur').trim(),
      chrome:document.body.getAttribute('data-chrome-style'),glass:getComputedStyle(document.querySelector('.chrome-glass')??document.body).backdropFilter,
      particleCanvas:canvas ? {width:canvas.width,height:canvas.height} : null,visibility:document.visibilityState};
  })()`),'effective theme DOM and bounded URL decode',6000);
  report.theme={...report.theme,dom:theme,engagement:assessTheme(report.theme,theme)};
  if(wallpaper) {
    // WHY: retain a view of the actual CSS element before a later failed leg;
    // this is visual evidence for review, not proof of GPU presentation.
    const shot=await bound(cdp.send('Page.captureScreenshot',{format:'png'}),'theme screenshot',10000);
    report.themeScreenshot=report.options.out+'.theme.png';
    writeFileSync(report.themeScreenshot,Buffer.from(shot.data,'base64'),{flag:'wx'});
  }
  if(report.theme.engagement.status==='incomplete') throw Error(report.theme.engagement.reason);
  await bound(cdp.send('Performance.enable'),'performance enable',3000);
  report.gpu=await bound(readRendererInfo(app.cdpPort,cdp),'browser GPU probe',8000);
  report.viewport=await bound(cdp.evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,screenWidth:screen.width,screenHeight:screen.height,visibility:document.visibilityState})'),'display viewport',3000);
  // WHY: resume actual deterministic JSONL content through preload, not a synthetic DOM.
  if(['full-folded','style-trace'].includes(report.options.control)) {
    // Only this privately launched CDP target; never manipulate the OS or live app.
    await bound(cdp.send('Page.bringToFront'),'private window focus request',3000);
  }
  const sessions=[];
  let fullSmallRows=null;
  const domDiagnostic=async()=>cdp.evaluate(`({ids:${domIds},active:${active},panes:${contentExpr},strip:!!document.querySelector('[data-session-strip]')})`).catch(e=>({error:String(e)}));
  report.sessionDiagnostics=[];
  for(const size of ['small','medium']) {
    const before=await bound(cdp.evaluate(domIds),'DOM IDs before resume');
    const t=fixture.transcripts[size];
    const s=await bound(cdp.evaluate(`window.claude.session.create({name:${JSON.stringify(`gpu-${size}`)},cwd:${JSON.stringify(t.cwd)},skipPermissions:true,resumeSessionId:${JSON.stringify(t.sessionId)}})`),`resume ${size}`,30000);
    if(!s?.id) throw Error(`resume ${size} failed`);
    let mapping;
    try {
      mapping=await waitFor(cdp,bound,`(() => {const before=${JSON.stringify(before)},after=${domIds};const added=after.filter(id=>!before.includes(id));return added.length===1?{createdId:${JSON.stringify(s.id)},pillId:added[0],mapping:added[0]===${JSON.stringify(s.id)}?'exact':'new-dom-id'}:null})()`,`session DOM identity ${size}`);
      mapping=resolveSessionPill(before,await bound(cdp.evaluate(domIds),'mapped DOM IDs'),s.id);
    } catch(e){report.sessionDiagnostics.push({size,createdId:s.id,dom:await domDiagnostic(),error:String(e)});throw e;}
    sessions.push({...mapping,size});report.sessions=sessions;
    report.sessionDiagnostics.push({size,...mapping,dom:await domDiagnostic()});
    // A full first page is a separate condition: record it when observed,
    // never infer it from a later folded-state gate or disable folding.
    const dispatched=await bound(cdp.evaluate(contentExpr),'post-dispatch page state');
    report.fullPageAtDispatch??=[];report.fullPageAtDispatch.push({size,at:Date.now(),pane:dispatched.find(p=>p.id===mapping.pillId)??null});
    if(size==='small' && ['full-folded','style-trace'].includes(report.options.control)) {
      await bound(cdp.evaluate(`(() => {const p=${pane};p.scrollTop=p.scrollHeight})()`),'full small bottom pin');
      fullSmallRows=await bound(cdp.evaluate(nearRows),'full small viewport keys');
    }
  }
  const select=async id=>{
    const clicked=await bound(cdp.evaluate(`(() => {const p=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(e=>e.getAttribute('data-session-id')===${JSON.stringify(id)});if(!p)return false;p.click();return true})()`),'click session',3000);
    if(!clicked) throw Error(`session pill ID absent: ${id}`);
    return waitFor(cdp,bound,`${active}===${JSON.stringify(id)}`,'visible active session');
  };
  // WHY: the hot-phase rAF observes only identity/time/focus; all body, scroll
  // and geometry checks occur AFTER measureLeg's action clock and TaskDuration.
  const minimalSwitch=async(target,canonical,expected,trace=null,label=null)=>{
    const beforeId=await bound(cdp.evaluate(active),'minimal switch before ID');
    const contentBefore=await bound(cdp.evaluate(contentExpr),'minimal switch pre-click source');
    const focusBefore=await bound(cdp.evaluate('({focus:document.hasFocus(),visibility:document.visibilityState,at:Date.now()})'),'minimal switch focus');
    const targetBefore=contentBefore.find(x=>x.id===target.pillId);
    const ageMs=focusBefore.at-(report.fullPageAtDispatch?.[0]?.pane?.at??0);
    const full=canonical===FULL_CANONICAL.small;
    const allowed=full ? assessFullCondition(targetBefore,canonical,{...focusBefore,ageMs}) : {
      ok:focusBefore.focus===true && focusBefore.visibility==='visible' && targetBefore?.entries===canonical.entries && targetBefore?.folded===canonical.folded && targetBefore?.markdown===canonical.markdown && targetBefore?.chars===canonical.chars,
      reason:'folded content or focus mismatch'};
    if(!allowed.ok || !expected?.rows?.some(r=>r.hash)) return {status:'uncontrolled',reason:allowed.reason??'viewport row missing',ageMs,targetBefore,focusBefore};
    if(label && !trace) trace=await narrowTrace(cdp,bound);
    const row=await measureLeg(app,'minimal-switch',bound,async()=>{const frame=await bound(cdp.evaluate(`new Promise(resolve=>{
      const pill=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(e=>e.dataset.sessionId===${JSON.stringify(target.pillId)});
      if(!pill){resolve(null);return;}console.timeStamp('perf-switch-click');pill.click();requestAnimationFrame(()=>{console.timeStamp('perf-switch-raf');resolve({at:Date.now(),id:${active},focus:document.hasFocus(),visibility:document.visibilityState})});
    })`),'minimal switch rAF',5000);return {beforeId,afterId:frame?.id,targetId:target.pillId,focus:frame?.focus,visibility:frame?.visibility,at:frame?.at};});
    let traceResult=null;
    if(trace) {
      const t=await trace.stop();const file=`${report.options.out}.style-${label}.trace.json`;
      writeFileSync(file,JSON.stringify({metadata:{build:report.build,label,categories:t.categories},traceEvents:t.events,complete:t.complete,dataLossOccurred:t.dataLossOccurred,truncated:t.truncated,error:t.error??null}),{flag:'wx'});
      traceResult={file,...assessNarrowTrace(t)};
    }
    const after=await bound(cdp.evaluate(contentExpr),'minimal switch post-clock body state');
    const near=await bound(cdp.evaluate(nearRows),'minimal switch post-clock viewport row');
    const visible=after.find(x=>x.id===target.pillId && x.visible);
    const integrity=!!(row.engagement?.afterId===target.pillId && row.engagement.focus && row.engagement.visibility==='visible' && visible?.entries===canonical.entries && visible?.markdown===canonical.markdown && visible?.chars===canonical.chars && visible?.folded===canonical.folded && assessFirstFrameContent(expected,near).ok);
    const scroll=await bound(cdp.evaluate(`(() => {const p=${pane};return p?{gap:p.scrollHeight-p.scrollTop-p.clientHeight,scrollTop:p.scrollTop,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight}:null})()`),'post-clock scroll integrity');
    let screenshot=null;
    if(label==='full') {const shot=await bound(cdp.send('Page.captureScreenshot',{format:'png'}),'full post-clock screenshot',5000);screenshot=`${report.options.out}.full.png`;writeFileSync(screenshot,Buffer.from(shot.data,'base64'),{flag:'wx'});}
    return {status:integrity&&row.status==='measured'&&(!label||traceResult?.ok)?'measured':'uncontrolled',reason:!integrity?'post-clock pane/body/focus/viewport mismatch':label&&!traceResult?.ok?'single-action trace incomplete':null,ageMs,focusBefore,contentBefore,targetBefore,row,after,near,expected,scroll,screenshot,trace:traceResult};
  };
  if(['full-folded','style-trace'].includes(report.options.control)) {
    // Medium may not have hydrated at dispatch; poll only until small's natural
    // fold window closes, not by extending/pausing any product timer.
    report.fullControl={status:'uncontrolled',reason:'full page not reached before natural fold'};
    report.fullReadiness=[];
    for(let i=0;i<16;i++) {
      const ps=await bound(cdp.evaluate(contentExpr),'full page readiness');
      report.fullReadiness.push({at:Date.now(),panes:ps.map(p=>({size:sessions.find(s=>s.pillId===p.id)?.size,entries:p.entries,folded:p.folded,markdown:p.markdown,chars:p.chars}))});
      const small=ps.find(p=>p.id===sessions[0].pillId),medium=ps.find(p=>p.id===sessions[1].pillId);
      if(medium?.entries===60 && medium.markdown===FULL_CANONICAL.medium.markdown && medium.chars===FULL_CANONICAL.medium.chars && medium.folded===0) {
        report.fullControl=await minimalSwitch(sessions[0],FULL_CANONICAL.small,fullSmallRows,null,report.options.control==='style-trace'?'full':null);
        break;
      }
      if(!small || small.folded || Date.now()-(report.fullPageAtDispatch?.[0]?.pane?.at??0)>=765) break;
      await bound(sleep(40),'full hydration poll');
    }
    if(report.fullControl.row) await select(sessions[1].pillId);
  }
  const settle=async(session)=>{
    await select(session.pillId);
    await bound(cdp.evaluate(`(() => {const p=${pane};p.scrollTop=p.scrollHeight})()`),'pin known chat bottom',3000);
    const samples=[];
    let full=null;
    for(let i=0;i<32;i++) {
      const panes=await bound(cdp.evaluate(contentExpr),'active folding observation',3000);
      const p=panes.find(x=>x.id===session.pillId && x.visible);
      if(p) {
        samples.push(p);
        const expected=FULL_CANONICAL[session.size];
        if(p.entries===expected.entries && p.markdown===expected.markdown && p.chars===expected.chars && p.folded===0) full??=p;
      }
      if(assessSteadyFolded(samples.slice(-5),FOLDED_CANONICAL[session.size]).ok) return {id:session.pillId,samples:samples.slice(-5),fullObserved:full,fullCondition:full?'observed-before-natural-fold':'uncontrolled-not-observed',content:panes};
      await bound(sleep(250),'natural fold settle');
    }
    throw Error(`session ${session.size} exact steady folded state not observed: ${JSON.stringify(samples.slice(-5))}`);
  };
  report.settled=[];
  const expectedRows=new Map();
  for(const session of sessions) {
    report.settled.push(await settle(session));
    const near=await bound(cdp.evaluate(nearRows),'settled visible source rows',3000);
    report.nearDiagnostics??=[];report.nearDiagnostics.push({size:session.size,near});
    if(near?.id!==session.pillId || near.rows.filter(r=>r.hash).length<1) throw Error(`session ${session.size} near-viewport source rows absent`);
    expectedRows.set(session.pillId,{...near,rows:near.rows.filter(r=>r.hash)});
  }
  report.expectedRows=[...expectedRows.values()];
  await select(sessions[1].pillId);
  await waitFor(cdp,bound,`(() => {const p=${pane};return !!p&&p.querySelectorAll('.timeline-entry').length>=10&&p.scrollHeight>p.clientHeight})()`,'rendered scrollable transcript');
  let recording;
  try {
    if(report.options.trace==='on') recording=await traceStart(app.cdpPort,bound);
    report.legs.push(await measureLeg(app,'idle',bound,()=>bound(sleep(2000),'idle window',3000)));
    report.legs.push(await measureLeg(app,'scroll',bound,async()=>{
      const before=await bound(cdp.evaluate(`(() => {const p=${pane};p.scrollTop=p.scrollHeight;return {top:p.scrollTop,height:p.scrollHeight,client:p.clientHeight}})()`),'scroll start');
      const after=await bound(cdp.evaluate(`(() => {const p=${pane};p.scrollTop=Math.max(1,p.scrollTop-350);return p.scrollTop})()`),'scroll movement');
      await bound(sleep(500),'scroll settle',1500);
      return {before:before.top,after,scrollHeight:before.height,clientHeight:before.client};
    }));
    report.environmentBeforeActions=environmentSnapshot();
    report.rendererBeforeActions=await bound(cdp.evaluate('({at:Date.now(),focus:document.hasFocus(),visibility:document.visibilityState,activeElement:document.activeElement?.tagName})'),'renderer readiness');
    const resizeActions=[];
    await bound(cdp.evaluate('window.__gpuResizeEvents=0;window.addEventListener("resize",()=>window.__gpuResizeEvents++)'),'resize event listener');
    for(const width of [1100,1400,1100,1400]) {
      const beforeWidth=await bound(cdp.evaluate('innerWidth'),'initial width');
      const eventsBefore=await bound(cdp.evaluate('window.__gpuResizeEvents'),'resize event start');
      const contentBefore=await bound(cdp.evaluate(contentExpr),'resize content before');
      const row=await measureLeg(app,'resize',bound,async()=>{
        await bound(cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false}),'resize viewport');
        return waitFor(cdp,bound,`innerWidth===${width}&&window.__gpuResizeEvents>${eventsBefore}&&({beforeWidth:${beforeWidth},afterWidth:innerWidth,events:window.__gpuResizeEvents-${eventsBefore}})`,'viewport resize');
      });
      row.contentBefore=contentBefore;row.contentAfter=await bound(cdp.evaluate(contentExpr),'resize content after');
      resizeActions.push(row);
      if(row.status!=='measured') break;
      await bound(sleep(350),'resize settle');
    }
    report.legs.push({kind:'resize',actions:resizeActions,status:assessActions(resizeActions,'resize').ok?'measured':'incomplete'});
    const switchActions=[];
    if(['full-folded','style-trace'].includes(report.options.control)) {
      report.foldedMinimal=await minimalSwitch(sessions[0],FOLDED_CANONICAL.small,expectedRows.get(sessions[0].pillId),null,report.options.control==='style-trace'?'folded':null);
      if(report.foldedMinimal.row) await select(sessions[1].pillId);
    }
    if(report.options.profile==='on') {
      // WHY: profile ONLY each warmed switch, not fixture setup, idle, resize or
      // the observer's innerText samples. The sampling clock is diagnostic and
      // its elapsed values must not be compared to trace-off baseline timings.
      await bound(cdp.send('Profiler.enable'),'profiler enable',3000);
      await bound(cdp.send('Profiler.setSamplingInterval',{interval:1000}),'profiler interval',3000);
      report.profiles=[];
    }
    for(const target of [sessions[0],sessions[1],sessions[0],sessions[1]]) {
      const beforeId=await bound(cdp.evaluate(active),'before switch');
      const contentBefore=await bound(cdp.evaluate(contentExpr),'switch content before');
      const environmentBefore=environmentSnapshot();
      const rendererBefore=await bound(cdp.evaluate('({at:Date.now(),focus:document.hasFocus(),visibility:document.visibilityState})'),'renderer before switch');
      const expected=expectedRows.get(target.pillId);
      const canonical=FOLDED_CANONICAL[target.size];
      const targetBefore=contentBefore.find(p=>p.id===target.pillId);
      if (!targetBefore || targetBefore.entries!==canonical.entries || targetBefore.markdown!==canonical.markdown || targetBefore.chars!==canonical.chars || targetBefore.folded!==canonical.folded) {
        report.switchPreflightFailure={size:target.size,targetBefore,canonical,actionIndex:switchActions.length};
        throw Error(`switch ${target.size} is not at exact steady folded content before click`);
      }
      let row, sampled;
      if(report.options.profile==='on') await bound(cdp.send('Profiler.start'),'profiler start',3000);
      const actionStart=Date.now();
      try {
        row=await measureLeg(app,'switch',bound,async()=>{
          // WHY: sample the DOM in the very first animation-frame callback after
          // the click (before paint), not after an arbitrary settle. This is a
          // content/scroll proxy, NOT evidence that the GPU presented that frame.
          const firstFrame=await bound(cdp.evaluate(`new Promise(resolve => {
            const pill=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(e=>e.getAttribute('data-session-id')===${JSON.stringify(target.pillId)});
            if(!pill) {resolve(null);return;}
            pill.click();
            requestAnimationFrame(() => {
              const p=${pane};const rows=p?[...p.querySelectorAll('.timeline-entry')]:[];
              const hash=${hashBody};const wanted=${JSON.stringify(expected?.rows.map(r=>r.key)??[])};
              const bodies=rows.filter(e=>wanted.includes(e.dataset.entryKey)).map(e=>({key:e.dataset.entryKey,hash:hash(e.textContent)}));
              resolve(p?{at:Date.now(),focus:document.hasFocus(),visibility:document.visibilityState,id:${active},visible:!p.closest('[aria-hidden="true"]'),entries:rows.length,rows:bodies,markdown:p.querySelectorAll('.timeline-entry p, .timeline-entry pre, .yc-code-block').length,chars:p.textContent?.length??0,scrollTop:p.scrollTop,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight,distanceFromBottom:p.scrollHeight-p.scrollTop-p.clientHeight}:null);
            });
          })`),'switch first-frame DOM proxy',5000);
          await waitFor(cdp,bound,`(() => {const p=${pane};return !!p&&p.querySelectorAll('.timeline-entry').length>=10})()`,'switched transcript rendered');
          return {beforeId,afterId:await bound(cdp.evaluate(active),'after switch'),targetId:target.pillId,expectedRows:expected,canonical,firstFrame};
        });
      } finally {
        if(report.options.profile==='on') sampled=await bound(cdp.send('Profiler.stop'),'profiler stop',5000);
      }
      const actionEnd=Date.now();
      if(sampled) {
        const quality=assessSwitchProfile(sampled.profile,row);
        const file=`${report.options.out}.switch-${switchActions.length}.cpuprofile.json`;
        writeFileSync(file,JSON.stringify({metadata:{build:report.build,theme:report.theme.slug,viewport:report.viewport,actionIndex:switchActions.length,from:beforeId,to:target.pillId,actionStart,actionEnd,profiled:true,scope:'private packaged renderer; sampled action including CDP observer, not baseline'},profile:sampled.profile})+'\n',{flag:'wx'});
        row.profile={file,...quality};
        report.profiles.push(row.profile);
        if(!quality.ok) row.status='incomplete';
      }
      row.environmentBefore=environmentBefore;row.environmentAfter=environmentSnapshot();row.rendererBefore=rendererBefore;
      row.rendererAfter=await bound(cdp.evaluate('({at:Date.now(),focus:document.hasFocus(),visibility:document.visibilityState})'),'renderer after switch');
      row.contentBefore=contentBefore;row.contentAfter=await bound(cdp.evaluate(contentExpr),'switch content after');
      const switchShot=await bound(cdp.send('Page.captureScreenshot',{format:'png'}),'switch screenshot',5000);
      row.screenshot=`${report.options.out}.switch-${switchActions.length}.png`;
      writeFileSync(row.screenshot,Buffer.from(switchShot.data,'base64'),{flag:'wx'});
      switchActions.push(row);
      if(row.status!=='measured') break;
      await bound(sleep(350),'switch settle');
      row.settledScroll=await bound(cdp.evaluate(`(() => {const p=${pane};return p?{distanceFromBottom:p.scrollHeight-p.scrollTop-p.clientHeight,entries:p.querySelectorAll('.timeline-entry').length,chars:p.textContent?.length??0}:null})()`),'settled switch scroll');
      if (!row.settledScroll || row.settledScroll.distanceFromBottom > 3 || row.settledScroll.entries < 10 || row.settledScroll.chars === 0) {row.status='incomplete';row.reasons.push('settled scroll/content invariant failed');break;}
    }
    report.legs.push({kind:'switch',actions:switchActions,status:assessActions(switchActions,'switch').ok?'measured':'incomplete'});
  } finally {
    if(recording) {
      try {await recording.stop();}
      catch(e){recording.trace.error=String(e);}
      // Preserve partial raw evidence too: an end timeout is not a zero-event trace.
      saveTrace(report,recording.trace);
    }
    await stopProbe(cdp).catch(()=>{});
  }
  // Restore the common viewport before the screenshot; CSS/layout comparison is 1400x900 at DPR 1.
  await bound(cdp.send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false}),'restore viewport');
  const shot=await bound(cdp.send('Page.captureScreenshot',{format:'png'}),'screenshot',5000);
  report.screenshot=report.options.out+'.png';writeFileSync(report.screenshot,Buffer.from(shot.data,'base64'),{flag:'wx'});
}
export async function main(argv=process.argv.slice(2)) {
  const options=parseOptions(argv),bound=bounder(options.maxMinutes);
  validateOutputPath(options.out);
  mkdirSync(dirname(options.out),{recursive:true});
  validateOutputPath(options.out);
  const report={status:'incomplete',options,scope:'one private packaged X11 app; CDP viewport resize (not OS drag); renderer rAF callbacks NOT displayed frames; trace-on adds overhead; no presentation metric',legs:[],trace:options.trace==='off'?{status:'unsupported',reason:'trace explicitly off',presentation:{status:'unsupported',presentedFrames:null,droppedFrames:null}}:assessTrace(null)};
  let root,app,launchAttempted=false;
  try {
    if(!assetsReady()) throw Error('fixture assets not cached; downloads forbidden');
    report.theme=inspectTheme(options.theme,options.themeSource,options.checkout);
    if(report.theme.status!=='ready') throw Error(report.theme.reason);
    const stamp=await loadPackageStamp(options);
    const binary=join(options.appDir,'youcoded');
    report.build={sha:stamp.sha,dirty:stamp.dirty,builtAt:stamp.builtAt,appDir:options.appDir,stampPath:stamp.stampPath,source:stamp.source};
    refusePackageProcesses(options.appDir);
    await bound(portFree(PORT),'CDP port preflight',2000);
    report.display=displayInfo(options.realDisplay);
    // A working X display can omit a refresh field; preserve 'unknown' rather than invent Hz.
    if(!report.display.currentModes.length) report.display.modeRefresh='unknown';
    root=mkdtempSync(join(ROOT,'scratch/perf-lab/gpu-theme-'));
    writeFileSync(join(root,'owner'),'gpu-theme');
    const fixture=buildFixture(root,{log:()=>{}});
    if(options.theme===HEAVY) {
      const dest=join(fixture.home,'.claude/wecoded-themes',HEAVY);
      mkdirSync(dirname(dest),{recursive:true});
      cpSync(dirname(report.theme.source),dest,{recursive:true,errorOnExist:true,force:false});
    }
    // Seed source-of-truth preference before React mounts; no live-app IPC or profile involved.
    writeFileSync(join(fixture.home,'.claude/youcoded-appearance.json'),JSON.stringify({theme:options.theme,reducedEffects:false,lookOverrides:{}}));
    refusePackageProcesses(options.appDir);await bound(portFree(PORT),'CDP port before launch',2000);
    launchAttempted=true;
    const pending=launchApp({binary,appDir:options.appDir,fixture,display:options.realDisplay,cdpPort:PORT,refuseExisting:true});
    try { app=await bound(pending,'packaged launch',90000); }
    catch(e){pending.then(a=>a.kill()).catch(()=>{});throw e;}
    await workload(app,fixture,bound,report);
    Object.assign(report,assessRun(report));
  } catch(e) {
    report.status='incomplete';report.error=String(e?.message??e);
    if(app && !report.screenshot) try {
      const shot=await Promise.race([app.cdp.send('Page.captureScreenshot',{format:'png'}),new Promise((_,reject)=>setTimeout(()=>reject(Error('failure screenshot timeout')),10000))]);
      report.failureScreenshot=options.out+'.failure.png';writeFileSync(report.failureScreenshot,Buffer.from(shot.data,'base64'),{flag:'wx'});
    } catch(shotError){report.failureScreenshotError=String(shotError);}
  }
  finally {
    if(app) {
      try {await Promise.race([app.kill(),new Promise((_,reject)=>setTimeout(()=>reject(Error('shutdown timeout')),8000))]);cleanupFixture(root);}
      catch(e){report.status='incomplete';report.cleanupError=String(e);report.preservedRoot=root;}
    } else if(root) {
      if(launchAttempted){report.preservedRoot=root;report.cleanupError='launch ownership uncertain; fixture preserved until shutdown proven';}
      else try{cleanupFixture(root);}catch(e){report.preservedRoot=root;report.cleanupError=String(e);}
    }
    writeFileSync(options.out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  return report;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().then(r=>{console.log(`gpu-theme: ${r.status} — ${r.options.out}`);if(!['diagnostic','measured'].includes(r.status)) {console.error(r.error??r.reasons?.join('; ')??'incomplete');process.exitCode=2;}}).catch(e=>{console.error(e);process.exitCode=2;});
