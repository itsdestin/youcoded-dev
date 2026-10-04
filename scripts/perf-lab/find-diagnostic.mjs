// Bounded, isolated long-chat Find probe. No product changes or reducer injection.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build.mjs';
import { assetsReady, buildFixture, transcriptBody, SIZES } from './fixture.mjs';
import { launchApp, startXvfb } from './launch.mjs';
import { readRendererInfo } from './gpu.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIMIT_MS = 300_000;
const PAGE_LIMIT = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseOptions(argv, root = ROOT) {
  const opts = { checkout: join(root, 'youcoded'), entries: 1000, display: ':99', out: join(root, 'scratch/perf-lab/find-diagnostic.json') };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!['--checkout', '--entries', '--display', '--out', '--app-dir', '--trace-find', '--trace-frame-delay'].includes(flag) || !value || value.startsWith('--')) throw new Error(`Invalid option ${flag} (expected --checkout/--entries/--display/--out/--app-dir/--trace-find and a value)`);
    opts[flag === '--app-dir' ? 'appDir' : flag === '--trace-find' ? 'traceFind' : flag === '--trace-frame-delay' ? 'traceFrameDelay' : flag.slice(2)] = value;
  }
  const n = Number(opts.entries);
  if (!/^[1-9]\d*$/.test(String(opts.entries)) || !Number.isSafeInteger(n) || n > 12000) throw new Error('--entries must be an integer from 1 to 12000');
  if (!/^:\d+$/.test(opts.display)) throw new Error('--display must be an X display such as :99 (a real display must be explicit)');
  opts.entries = n;
  opts.checkout = resolve(opts.checkout);
  opts.out = resolve(opts.out);
  if (opts.appDir) opts.appDir = resolve(opts.appDir);
  if (opts.traceFind !== undefined && opts.traceFind !== 'on') throw Error('--trace-find must be on');
  if (opts.traceFrameDelay !== undefined && (opts.traceFind !== 'on' || !/^(1000)$/.test(opts.traceFrameDelay))) throw Error('--trace-frame-delay requires --trace-find on and 1000 ms');
  return opts;
}

export function matchVisible(rect, viewport, uncovered = true) {
  return uncovered === true && !!rect && !!viewport && rect.bottom > rect.top && rect.right > rect.left
    && rect.bottom > viewport.top && rect.top < viewport.bottom
    && rect.right > viewport.left && rect.left < viewport.right;
}

export function fixtureFindQuery(turns, entries) {
  if (!Number.isSafeInteger(turns) || turns < 1 || !Number.isSafeInteger(entries) || entries < 1) throw new Error('Invalid fixture search size');
  // WHY: a common word can count toolbar/card text and navigate to the oldest
  // loaded row, triggering more history. A unique user-message prefix midway
  // through the loaded tail checks an offscreen hit without approaching the sentinel.
  return `Turn ${Math.max(1, turns - Math.floor(entries / 4))}:`;
}

export function metricDelta(before, after) {
  const keys = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'Nodes'];
  return Object.fromEntries(keys.map((k) => [k, Number.isFinite(before?.[k]) && Number.isFinite(after?.[k]) && (k === 'Nodes' || after[k] >= before[k]) ? (k === 'Nodes' ? after[k] - before[k] : Math.round((after[k] - before[k]) * 1000 * 10) / 10) : null]));
}

// WHY: a first observer batch folded only110/1020 rows and produced a569ms
// "baseline", versus ~2s with1015 folded. Require the intended mostly-folded
// workload, not merely one spacer; this is engagement, not a speed threshold.
const foldingReady = (loaded, folded) => Number.isSafeInteger(loaded) && Number.isSafeInteger(folded)
  && folded > 0 && folded <= loaded && folded / loaded >= 0.9;

export function reportStatus({ loaded, folded, requested, resultReady }) {
  if (!Number.isSafeInteger(requested) || requested < 1 || !Number.isSafeInteger(loaded) || loaded < requested) return 'insufficient-history';
  if (!foldingReady(loaded, folded)) return 'folding-unengaged';
  if (resultReady !== true) return 'find-result-unconfirmed';
  return 'measured';
}

// WHY Node races every CDP operation: an in-page timeout cannot fire if the renderer
// is frozen. The outer deadline also covers launch and teardown, without trusting CDP.
function deadline(ms) {
  const until = Date.now() + ms;
  return (promise, label) => {
    const left = until - Date.now();
    if (left <= 0) return Promise.reject(new Error(`Diagnostic deadline exceeded at ${label}`));
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Diagnostic deadline exceeded at ${label}`)), left); })]).finally(() => clearTimeout(timer));
  };
}

export function historyDecision(state, id, requested) {
  if (!state || state.sessionId !== id || !Number.isSafeInteger(state.loaded) || state.loaded <= 0) return 'wait';
  if (state.loaded >= requested) return 'ready';
  return state.hasMore === true ? 'page' : 'short';
}

// WHY a deadline race around launchApp loses ownership: it can return AFTER the
// race rejected. Attach cleanup directly to the original promise in that case.
export async function launchOwned(start, bound) {
  const pending = Promise.resolve().then(start);
  try { return await bound(pending, 'app launch'); }
  catch (e) {
    pending.then(app => app.kill()).catch(() => {});
    throw e;
  }
}

// WHY: instrument only the owned diagnostic renderer, without rebuilding or
// changing the product. Observe RO→rAF→800ms expiry ordering; bounded samples
// and an explicit disposer keep the original package and browser APIs intact.
export function installFindTrace(delayMs=0) {
  const NativeRO = globalThis.ResizeObserver;
  const raf = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame;
  const timeout = globalThis.setTimeout;
  const intoView = Element.prototype.scrollIntoView;
  const events = [], frames = new Map();
  let artificialId = 0;
  let inRO = false, nextId = 0, stopped = false;
  const sample = () => {
    const range = [...(globalThis.CSS?.highlights?.get('chat-find-current') ?? [])][0];
    const pane = range?.startContainer?.parentElement?.closest('.chat-scroll');
    const rect = range?.getBoundingClientRect();
    const vp = pane?.getBoundingClientRect();
    const overlay = document.querySelector('.chrome-wrapper--bottom')?.getBoundingClientRect();
    const hit = rect ? document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2) : null;
    return {top:rect?.top??null,bottom:rect?.bottom??null,paneTop:vp?.top??null,paneBottom:vp?.bottom??null,chromeTop:overlay?.top??null,scrollTop:pane?.scrollTop??null,hitTag:hit?.tagName??null,focus:document.hasFocus(),visibility:document.visibilityState};
  };
  const log = (kind, detail={}) => { if (!stopped && events.length < 320) events.push({t:performance.now(),kind,...detail}); };
  globalThis.ResizeObserver = class {
    constructor(callback) {
      const id = ++nextId;
      log('ro-created', { id, stack: new Error().stack, callback: String(callback) });
      this.native = new NativeRO((entries, observer) => {
        if (stopped) return callback(entries, observer);
        log('ro-delivery',{id,targets:entries.map(e=>e.target.className?.toString().slice(0,90)),geometry:sample()});
        inRO = true;
        try { callback(entries, observer); } finally { inRO = false; }
      });
      this.id=id;
    }
    observe(target, options) { log('ro-observe',{id:this.id,target:target.className?.toString().slice(0,90),chatContentRoot:target.parentElement?.matches('.chat-scroll') === true && target.parentElement.firstElementChild === target,stack:new Error().stack});this.native.observe(target,options); }
    unobserve(target) { this.native.unobserve(target); }
    disconnect() { log('ro-disconnect',{id:this.id,geometry:sample()});this.native.disconnect(); }
  };
  globalThis.requestAnimationFrame = callback => {
    if (!inRO) return raf(callback);
    const run = (t,id) => {frames.delete(id);log('ro-frame-run',{id,geometry:sample()});callback(t);log('ro-frame-after',{id,geometry:sample()});};
    if (delayMs) {
      // Diagnostic-only 1Hz schedule for synchronous requests from ANY newly
      // wrapped RO. Attribute each observer using its recorded callsite/target;
      // this is not automatically a Find-only intervention.
      const id=--artificialId;
      const timer=timeout(()=>{const nativeId=raf(t=>run(t,id));frames.set(id,{nativeId});},delayMs);
      frames.set(id,{timer});log('ro-frame-queued',{id,delayMs});return id;
    }
    let id;
    id=raf(t=>run(t,id));
    frames.set(id,{nativeId:id});log('ro-frame-queued',{id});return id;
  };
  globalThis.cancelAnimationFrame = id => {
    const pending=frames.get(id);
    if(pending) {frames.delete(id);if(pending.timer)clearTimeout(pending.timer);if(pending.nativeId)cancel(pending.nativeId);log('ro-frame-cancel',{id,geometry:sample()});return;}
    return cancel(id);
  };
  globalThis.setTimeout = (callback,ms,...args) => {
    if(ms !== 800 || typeof callback !== 'function') return timeout(callback,ms,...args);
    log('expiry-queued',{geometry:sample()});
    return timeout((...values)=>{log('expiry-run',{geometry:sample()});return callback(...values);},ms,...args);
  };
  Element.prototype.scrollIntoView = function(...args) {
    if (this.closest?.('[data-message-find-body]')) log('find-scroll-before',{geometry:sample()});
    const result=intoView.apply(this,args);
    if (this.closest?.('[data-message-find-body]')) log('find-scroll-after',{geometry:sample()});
    return result;
  };
  globalThis.__findLifecycleTrace = {events,sample,stop:()=>{
    if (stopped) return events;
    // WHY: restoring globals alone leaves artificial timers able to dispatch
    // captured native frames after disposal. Cancel our pending work first.
    for (const id of [...frames.keys()]) globalThis.cancelAnimationFrame(id);
    globalThis.ResizeObserver=NativeRO;globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=cancel;globalThis.setTimeout=timeout;Element.prototype.scrollIntoView=intoView;
    log('trace-stop',{geometry:sample()});stopped=true;return events;
  }};
  log('trace-installed',{geometry:sample()});
  return true;
}

// WHY: a diagnostic failure may exhaust the main deadline. Give only the owned
// renderer a separate bounded chance to retain its partial trace before teardown.
export async function collectFindTrace(cdp) {
  try {
    return await deadline(2000)(cdp.evaluate(`(() => { const t = window.__findLifecycleTrace; if (!t) return null; const final = t.sample(); return { events: t.stop(), final }; })()`), 'partial Find trace');
  } catch (error) {
    return { unavailable: String(error?.message ?? error) };
  }
}

const stateExpr = `(() => { const panes = [...document.querySelectorAll('.chat-scroll')]; const visible = panes.filter(x => !x.closest('[aria-hidden="true"]')); if (visible.length !== 1) return null; const p = visible[0]; const idx = panes.indexOf(p); const pill = document.querySelector('[data-session-strip] [data-session-idx="' + idx + '"][data-session-id]'); const es = p.querySelectorAll('.timeline-entry'); let folded = 0; for (const e of es) if (e.childElementCount === 0) folded++; return { sessionId: pill?.getAttribute('data-session-id') ?? null, loaded: es.length, folded, hasMore: !!p.querySelector('[data-history-sentinel]'), scrollTop: p.scrollTop }; })()`;
const metrics = async (cdp, bound) => {
  const r = await bound(cdp.send('Performance.getMetrics'), 'performance metrics');
  return Object.fromEntries((r.metrics || []).map((m) => [m.name, m.value]));
};
const key = (cdp, type, value, modifiers = 0) => cdp.send('Input.dispatchKeyEvent', { type, key: value, code: value === 'f' ? 'KeyF' : undefined, modifiers, windowsVirtualKeyCode: value === 'f' ? 70 : value.charCodeAt(0) });

async function run(app, fixture, opts, bound, context) {
  const cdp = app.cdp;
  await bound(cdp.send('Performance.enable'), 'enable metrics');
  const gpu = await bound(readRendererInfo(app.cdpPort, cdp), 'GPU info');
  const viewport = await bound(cdp.evaluate(`({ width: innerWidth, height: innerHeight, scale: devicePixelRatio, screenWidth: screen.width, screenHeight: screen.height, visibility: document.visibilityState })`), 'viewport');
  // Resume the fixture through preload. The app loads only its last history page here.
  const t = fixture.transcripts.huge;
  const created = await bound(cdp.evaluate(`window.claude.session.create({name:'find-diagnostic',cwd:${JSON.stringify(fixture.projects.alpha)},skipPermissions:true,resumeSessionId:${JSON.stringify(t.sessionId)}})`), 'resume huge');
  if (!created?.id) throw new Error('Resumed session did not return an id');
  context.sessionId = created.id;
  // The desktop session.switch IPC is a no-op; click the actual strip pill as
  // well. Neither create nor switch promises prove the new chat is selected.
  await bound(cdp.evaluate(`window.claude.session.switch(${JSON.stringify(created.id)})`), 'session switch IPC');
  const pillDeadline = Date.now() + 30_000;
  let selected = false;
  while (!selected && Date.now() < pillDeadline) {
    selected = await bound(cdp.evaluate(`(() => { const pill = document.querySelector('[data-session-strip] [data-session-id="' + CSS.escape(${JSON.stringify(created.id)}) + '"]'); if (!pill) return false; pill.click(); return true; })()`), 'select resumed pill');
    if (!selected) await bound(sleep(100), 'session pill wait');
  }
  if (!selected) throw new Error('Resumed session pill absent after 30s');
  const initialDeadline = Date.now() + 90_000;
  let pages = 0, state;
  while (Date.now() < initialDeadline) {
    state = await bound(cdp.evaluate(stateExpr), 'initial history state');
    if (historyDecision(state, created.id, opts.entries) !== 'wait') break;
    await bound(sleep(100), 'initial history wait');
  }
  if (historyDecision(state, created.id, opts.entries) === 'wait') throw new Error('Resumed session never became visible with its first history page');
  while (true) {
    state = await bound(cdp.evaluate(stateExpr), 'history state');
    context.history = { ...state, pages };
    const decision = historyDecision(state, created.id, opts.entries);
    if (decision === 'wait') throw new Error('Visible session identity or initial history disappeared');
    if (decision !== 'page') break;
    if (++pages > PAGE_LIMIT) throw new Error(`History page cap reached (${PAGE_LIMIT}; ${state.loaded} loaded)`);
    // Scroll the sentinel into view; wait for actual entry growth, never write reducer state.
    const page = await bound(cdp.evaluate(`(async () => { const p = [...document.querySelectorAll('.chat-scroll')].find(x => !x.closest('[aria-hidden="true"]')); if (!p) throw Error('no visible pane'); const before = p.querySelectorAll('.timeline-entry').length; p.scrollTop = 0; const start = performance.now(); while (performance.now()-start < 30000) { await new Promise(requestAnimationFrame); const now = p.querySelectorAll('.timeline-entry').length; if (now > before) return now; if (!p.querySelector('[data-history-sentinel]')) return now; if (p.scrollTop > 0) p.scrollTop = 0; } throw Error('history page did not grow within 30s'); })()`), `page ${pages}`);
    if (page <= state.loaded && state.hasMore) throw new Error(`History stalled after ${pages} pages`);
  }
  if (!state || state.loaded < opts.entries) throw new Error(`Only ${state?.loaded ?? 0} entries loaded; requested ${opts.entries} (fixture huge contains ${t.turns} turns)`);
  await bound(cdp.evaluate(`(async () => { const p = [...document.querySelectorAll('.chat-scroll')].find(x => !x.closest('[aria-hidden="true"]')); p.scrollTop = p.scrollHeight; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); })()`), 'bottom settle');
  // Wait for positive folding engagement; a fixed sleep is not a readiness signal.
  const foldDeadline = Date.now() + 15_000;
  let beforeState;
  do {
    beforeState = await bound(cdp.evaluate(stateExpr), 'fold count');
    if (beforeState?.sessionId !== created.id) throw new Error('Visible chat changed before Find');
    if (foldingReady(beforeState.loaded, beforeState.folded)) break;
    await bound(sleep(100), 'fold wait');
  } while (Date.now() < foldDeadline);
  context.beforeState = beforeState;
  if (!beforeState || !foldingReady(beforeState.loaded, beforeState.folded)) {
    context.status = 'folding-unengaged';
    throw new Error(`Folding unengaged (${beforeState?.loaded ?? 0} loaded, zero folded); no Find timing accepted`);
  }
  if (opts.traceFind === 'on') await bound(cdp.evaluate(`(${installFindTrace.toString()})(${Number(opts.traceFrameDelay ?? 0)})`), 'Find lifecycle trace installation');
  // Bounded in-page observers. They observe, never trigger layout or count every row per frame.
  await bound(cdp.evaluate(`(() => { const d = { longtasks: [], gaps: [] }; let last = 0, active = true; const tick = t => { if (!active) return; if (last && t-last > 32 && d.gaps.length < 100) d.gaps.push(Math.round(t-last)); last=t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); let observer; try { observer = new PerformanceObserver(l => { for (const e of l.getEntries()) if (d.longtasks.length < 100) d.longtasks.push({start:Math.round(e.startTime),duration:Math.round(e.duration)}); }); observer.observe({entryTypes:['longtask']}); } catch {} window.__findDiag = {d,stop:() => {active=false;observer?.disconnect();return d;}}; })()`), 'observer installation');
  const before = await metrics(cdp, bound);
  const t0 = performance.now();
  await bound(key(cdp, 'keyDown', 'f', 2), 'Ctrl+F down');
  await bound(key(cdp, 'keyUp', 'f', 2), 'Ctrl+F up');
  const opened = await bound(cdp.evaluate(`(async () => { const start=performance.now(); let input; while (!(input=document.querySelector('input[aria-label="Find in chat"]')) && performance.now()-start<30000) await new Promise(requestAnimationFrame); if (!input) throw Error('Find input absent after 30s'); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); return { inputExists: true, focused: document.activeElement === input }; })()`), 'Find DOM-ready');
  const openDomReadyMs = Math.round(performance.now() - t0);
  const afterOpen = await metrics(cdp, bound);
  const query = fixtureFindQuery(t.turns, opts.entries);
  const typingStart = performance.now();
  await bound(cdp.send('Input.insertText', { text: query }), 'type Find query');
  const result = await bound(cdp.evaluate(`(async () => {
    const query = ${JSON.stringify(query)};
    const start = performance.now();
    while (performance.now() - start < 30000) {
      const input = document.querySelector('input[aria-label="Find in chat"]');
      const row = input?.closest('.find-row');
      const range = [...(globalThis.CSS?.highlights?.get('chat-find-current') ?? [])][0];
      if (input?.value === query && row?.textContent.trim() === '1/1' && range?.toString().toLowerCase() === query.toLowerCase()) {
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        return { ready: true, counter: '1/1', selectedText: range.toString() };
      }
      await new Promise(requestAnimationFrame);
    }
    return { ready: false };
  })()`), 'Find exact selected result-ready');
  const typingDomReadyMs = Math.round(performance.now() - typingStart);
  const afterTyping = await metrics(cdp, bound);
  const samples = await bound(cdp.evaluate('window.__findDiag.stop()'), 'observer stop');
  // WHY: the old probe accepted a correct Range that auto-stick then scrolled
  // offscreen. Verify actual visibility separately, OUTSIDE the timing window:
  // these two geometry reads per poll must not charge their layout cost to Find.
  const navigation = await bound(cdp.evaluate(`(async () => {
    const visible = ${matchVisible.toString()};
    const start = performance.now(); let since = null; let last = null;
    while (performance.now() - start < 3000) {
      const range = [...(globalThis.CSS?.highlights?.get('chat-find-current') ?? [])][0];
      const pane = range?.startContainer.parentElement?.closest('.chat-scroll');
      const rect = range?.getBoundingClientRect(); const viewport = pane?.getBoundingClientRect();
      const hit = rect ? document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2) : null;
      const owner = range?.startContainer.parentElement?.closest('[data-entry-key]');
      const uncovered = !!owner && !!hit && owner.contains(hit);
      const ok = range?.toString() === ${JSON.stringify(query)} && visible(rect, viewport, uncovered);
      last = { selectedText: range?.toString() ?? null, uncovered, hitTag: hit?.tagName ?? null, scrollTop: pane?.scrollTop ?? null,
        rect: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null };
      if (ok) { since ??= performance.now(); if (performance.now() - since >= 300) return { visibleStable: true, ...last }; }
      else since = null;
      await new Promise(r => setTimeout(r, 100));
    }
    return { visibleStable: false, ...last };
  })()`), 'selected match visibility');
  result.ready = result.ready && navigation.visibleStable;
  const lifecycle = opts.traceFind === 'on'
    ? await bound(cdp.evaluate(`(() => {const t=window.__findLifecycleTrace;const final=t.sample();return {events:t.stop(),final}})()`), 'Find lifecycle trace stop')
    : null;
  const afterState = await bound(cdp.evaluate(stateExpr), 'final history');
  if (afterState?.sessionId !== created.id) throw new Error('Visible chat changed during Find timing');
  const metricSnapshots = Object.fromEntries(['before','afterOpen','afterTyping'].map((label,i) => [label, Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','Nodes'].map(k => [k, [before,afterOpen,afterTyping][i][k] ?? null]))]));
  const report = { metricSnapshots, navigation, lifecycle, status: reportStatus({loaded:beforeState.loaded,folded:beforeState.folded,requested:opts.entries,resultReady:result.ready}), scope: 'Packaged desktop, single huge Claude Code fixture session, paged history via sentinel; CDP DOM-ready + two rAF callbacks are NOT presented-frame time. Performance metrics are renderer-wide cumulative proxies; longtasks/rAF gaps are bounded samples, not GPU presentation or displayed FPS.' + (opts.traceFind === 'on' ? ` Diagnostic-only renderer API wrappers observe layout and perturb timing; RO-requested frames held ${opts.traceFrameDelay ?? 0}ms. Do not compare timing against uninstrumented reports.` : ''), checkout:opts.checkout, display:opts.display, entriesRequested:opts.entries, fixtureTurns:t.turns, pages, beforeState, afterState, gpu, viewport, open: { domReadyAfterTwoRafMs:openDomReadyMs, ...opened, metricsDelta:metricDelta(before,afterOpen) }, typing:{ query, domResultReadyAfterTwoRafMs:typingDomReadyMs, ...result, metricsDelta:metricDelta(afterOpen,afterTyping) }, samples };
  // Screenshot is deliberately outside both clocks.
  const png = opts.out.replace(/\.json$/i, '') + '.png';
  const shot = await bound(cdp.send('Page.captureScreenshot', {format:'png'}), 'screenshot');
  writeFileSync(png, Buffer.from(shot.data, 'base64'));
  report.screenshot = png;
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv);
  const bound = deadline(LIMIT_MS);
  mkdirSync(dirname(opts.out), {recursive:true});
  let x, app;
  const context = { checkout: opts.checkout, display: opts.display, entriesRequested: opts.entries };
  try {
  if (!assetsReady()) throw new Error('Cached perf-lab assets missing; provision separately before diagnostic');
  // WHY: keep before/after binaries separate so interleaved runs never swap
  // source files or accidentally rebuild the baseline from the candidate tree.
  const build = opts.appDir
    ? { ...JSON.parse(readFileSync(join(opts.appDir, '.perf-lab-build.json'), 'utf8')), appDir: opts.appDir, binary: join(opts.appDir, 'youcoded') }
    : await bound(buildApp(opts.checkout, {skipIfFresh:true}), 'build');
  // WHY: a fixed fixture root can erase another diagnostic's private HOME before
  // launch refuses it. Each run owns fresh fixture bytes; preserve them on exit.
  const fixtureParent = join(ROOT, 'scratch/perf-lab');
  mkdirSync(fixtureParent, { recursive: true });
  const fixture = buildFixture(mkdtempSync(join(fixtureParent, 'find-fixture-')), {log:()=>{}});
  context.fixtureRoot = fixture.root;
  if (opts.entries > SIZES.huge * 2) {
    // WHY the stock huge fixture holds only 3,500 turns: support the CLI's 12k
    // ceiling by replacing only the throwaway huge transcript, before app launch.
    const t = fixture.transcripts.huge;
    const turns = Math.ceil(opts.entries / 2) + 200; // at least two history-visible entries/turn
    writeFileSync(t.path, transcriptBody({sessionId:t.sessionId,cwd:t.cwd,turns,startedAt:Date.now()-3*86400000}).join('\n')+'\n');
    t.turns = turns;
  }
    // An explicitly selected real display is reused; never create Xvfb over it.
    x = opts.display === ':99' ? await startXvfb(opts.display) : {display:opts.display,proc:null,reused:true};
    app = await launchOwned(() => launchApp({binary:build.binary,appDir:build.appDir,fixture,cdpPort:9568,display:x.display,refuseExisting:true}), bound);
    const report = await run(app,fixture,opts,bound,context);
    // WHY: a checkout path alone cannot distinguish a baseline from an uncommitted
    // candidate. Keep the exact packaged-build fingerprint beside each result.
    report.build = { sha: build.sha, dirty: build.dirty, builtAt: build.builtAt };
    report.measuredAt = new Date().toISOString();
    writeFileSync(opts.out, JSON.stringify(report,null,2)+'\n');
    console.log(`${report.status}: ${opts.out} (${report.beforeState.loaded} entries, ${report.beforeState.folded} folded)`);
    if (report.status !== 'measured') {
      context.report = report;
      throw new Error(`Diagnostic incomplete: ${report.status}`);
    }
  } catch (e) {
    // Preserve partial evidence on any failure, not just a successful screenshot.
    const { report: partial, ...progress } = context;
    const lifecycle = partial?.lifecycle ?? (opts.traceFind === 'on' && app?.cdp ? await collectFindTrace(app.cdp) : null);
    writeFileSync(opts.out, JSON.stringify({ ...partial, ...progress, lifecycle, status: partial?.status ?? progress.status ?? 'error', error: String(e?.message ?? e) }, null, 2) + '\n');
    throw e;
  } finally {
    // Only owned processes: launchApp owns its app family; Xvfb is stopped only if WE created it.
    try { await deadline(8000)(app?.kill() ?? Promise.resolve(), 'app teardown'); } finally { if (x?.proc) x.proc.kill('SIGTERM'); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exitCode=2; });
