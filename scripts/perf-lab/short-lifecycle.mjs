// One private packaged app across short chat-only create/send/switch/close cycles.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readBoundedText, scanJsonLines, boundedDirectory, makeByteTail } from './lifecycle-evidence.mjs';
import { assetsReady, buildFixture, nativeStoreSlug } from './fixture.mjs';
import { startXvfb, launchApp } from './launch.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { captureCheckpoint, checkpointDelta, CUMULATIVE_METRICS, RESOURCE_METRICS, RESOURCE_DESCRIPTOR, boundedJson } from './resource-checkpoint.mjs';
import { refusePackageProcesses } from './gpu-theme.mjs';
import { treeFingerprint } from './build.mjs';
import { startLaunchSupervisor } from './supervised-launch.mjs';
import { MIN_CLEANUP_RESERVE_MS, SUPERVISOR_STOP_TIMEOUT_MS } from './supervised-launch-core.mjs';

import { SETTLE_DESCRIPTOR, sampleSettlePhase, summariseSettle } from './natural-settle.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const METRICS = RESOURCE_METRICS;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function parseOptions(argv, root = ROOT) {
  const o = { checkout: join(root, 'youcoded'), cycles: 5, maxMinutes: 10, out: join(root, 'scratch/perf-lab/short-lifecycle.json') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--settle-checkpoints') { o.settleCheckpoints = true; continue; }
    if (k === '--post-gc') { o.postGc = true; continue; }
    if (k === '--model-free') { o.modelFree = true; continue; }
    if (k === '--supervised') { o.supervised = true; continue; }
    if (k === '--resource-checkpoints') { o.resourceCheckpoints = true; continue; }
    const v = argv[++i];
    if (!['--checkout', '--app-dir', '--cycles', '--max-minutes', '--out', '--max-rss-mb', '--cleanup-reserve-ms', '--settle-domain'].includes(k) || !v || v.startsWith('--')) throw new Error(`Invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  if (o.modelFree) {
    if (!o.appDir || !argv.includes('--out')) throw Error('--model-free requires explicit --app-dir cached package and --out fresh evidence path; never builds or provisions');
    if (!argv.includes('--cycles')) o.cycles = 3;
  }
  for (const [k, max] of [['cycles', 5], ['maxMinutes', 10]]) {
    if (!/^[1-9]\d*$/.test(String(o[k])) || !Number.isSafeInteger(Number(o[k])) || Number(o[k]) > max) throw new Error(`--${k === 'maxMinutes' ? 'max-minutes' : k} must be an integer 1..${max}`);
    o[k] = Number(o[k]);
  }
  for (const k of ['checkout', 'out', 'appDir']) if (o[k] !== undefined && !isAbsolute(o[k])) throw new Error(`--${k === 'appDir' ? 'app-dir' : k} must be absolute`);
  if (o.supervised) {
    if (!o.modelFree || !['--app-dir','--out','--max-minutes','--max-rss-mb','--cleanup-reserve-ms'].every(k => argv.includes(k))) throw Error('--supervised requires model-free cached package, fresh out and explicit wall/RSS/cleanup caps');
    for (const [key, min, max] of [['maxRssMb',64,2048],['cleanupReserveMs',MIN_CLEANUP_RESERVE_MS,20000]]) {
      if (!/^[1-9]\d*$/.test(String(o[key])) || !Number.isSafeInteger(Number(o[key])) || Number(o[key]) < min || Number(o[key]) > max) throw Error(`Invalid supervised ${key} cap ${min}..${max}`);
      o[key] = Number(o[key]);
    }
    if (o.cleanupReserveMs >= o.maxMinutes * 60000 / 2) throw Error('Invalid supervised cleanup reserve');
  } else if (o.maxRssMb !== undefined || o.cleanupReserveMs !== undefined) throw Error('RSS/cleanup caps require --supervised');
  if (o.settleDomain !== undefined && (!o.settleCheckpoints || !['full','renderer'].includes(o.settleDomain))) throw Error('--settle-domain full|renderer requires --settle-checkpoints');
  if (o.settleCheckpoints && (!o.modelFree || !o.supervised || o.postGc || o.resourceCheckpoints || o.cycles > 3 || o.maxMinutes > 5)) throw Error('--settle-checkpoints requires model-free supervised caps <=3 cycles / <=5 minutes; no --post-gc or --resource-checkpoints');
  return o;
}

// WHY: chat cycles create their own sessions against a loopback fake provider.
// Engine assets and the default huge history/600 decoys add unrelated work and
// may provision after a cache-check race. Opt-in model-free never checks assets
// and passes seedEngine:false into the ACTUAL fixture generator, not a mock path.
export function prepareLifecycleFixture(root, opts, { checkAssets = assetsReady, build = buildFixture } = {}) {
  if (!opts.modelFree && !checkAssets({ checkout: opts.checkout })) throw Error('perf-lab assets not cached; provision separately');
  return build(root, { checkout: opts.checkout, fakeProvider: true, log: () => {}, ...(opts.modelFree ? {
    seedEngine: false, historySizes: { small: 2 }, decoyCount: 0, nativeSessions: false, content: 'plain',
  } : {}) });
}

const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(x => b.includes(x));
export function summariseCycles(cycles) {
  const reasons = [];
  const rows = cycles.map((c, idx) => {
    const reasonsBefore = reasons.length;
    const bad = text => reasons.push(`cycle ${idx + 1}: ${text}`);
    if (!c || c.completed === false || c.reason) bad(c?.reason || 'not completed');
    if (!Array.isArray(c?.created) || c.created.length < 2 || new Set(c.created).size !== c.created.length) bad('no two distinct created sessions');
    if (!same(c?.created, c?.closed)) bad('owned sessions not all closed');
    if (!Array.isArray(c?.openState?.ids) || !c.created?.every(id => c.openState.ids.includes(id)) || !Number.isInteger(c?.openState?.mounted) || c.openState.mounted < c.before?.mounted + 2) bad('created sessions were not active and mounted during workload');
    if (!same(c?.before?.ids, c?.after?.ids) || !Number.isInteger(c?.before?.mounted) || c.before.mounted !== c?.after?.mounted) bad('session list or mounted chats did not return to pre-cycle state');
    if (!Array.isArray(c?.output) || c.output.length !== 2 || c.output.some(r => !r || !finite(r.deltasSent) || r.deltasSent <= 0 || r.deltasSent !== r.plannedDeltas || !finite(r.chars) || r.chars <= 0 || r.aborted !== false || r.shown !== true || r.exact !== true || r.persistedExact !== true || r.turnComplete !== true)) bad('fake reply output absent, incomplete or not verified in visible chat');
    for (const name of METRICS) if (!finite(c?.natural?.metrics?.[name])) bad(`missing/nonfinite natural ${name}`);
    const rendererOnly=c?.natural?.revision===3 && c.natural.domain==='renderer' && c.settle?.length===2 && c.settle.every(p=>p.domain==='renderer'&&p.status==='measured');
    if (rendererOnly && c.natural.renderer?.status!=='measured') bad('released renderer checkpoint incomplete');
    if (!rendererOnly && (!finite(c?.natural?.pss?.totalMb) || c.natural.pss.totalMb <= 0 || !Array.isArray(c?.natural?.pss?.perPid) || c.natural.pss.perPid.length === 0 || c.natural.pss.perPid.some(p => !finite(p.mb)))) bad('missing process-family PSS');
    if (!finite(c?.persistedRecords?.before) || !finite(c?.persistedRecords?.after)) bad('missing persisted-file context');
    if (c?.afterGc?.status === 'measured' && (c.afterGc.sample?.status === 'incomplete' || !finite(c.afterGc.sample?.pss?.totalMb) || METRICS.some(k => !finite(c.afterGc.sample?.metrics?.[k])))) bad('post-GC diagnostic lacks counters');
    const previous = cycles[idx - 1];
    const matchedDelta = previous && ([2,3].includes(previous.natural?.revision) || [2,3].includes(c?.natural?.revision)) ? checkpointDelta(previous.natural, c?.natural) : null;
    if (matchedDelta && (matchedDelta.renderer?.status ?? matchedDelta.status) !== 'measured') bad('released renderer checkpoint identity/order/reset not comparable');
    const gcDelta = previous?.afterGc?.status === 'measured' && c?.afterGc?.status === 'measured' && (previous.afterGc.sample?.revision === 2 || c.afterGc.sample?.revision === 2) ? checkpointDelta(previous.afterGc.sample, c.afterGc.sample) : null;
    if (gcDelta && (gcDelta.renderer?.status ?? gcDelta.status) !== 'measured') bad('forced-GC renderer checkpoint identity/order/reset not comparable');
    const deltaFromPrevious = previous ? { pssMb: finite(c?.natural?.pss?.totalMb) && finite(previous?.natural?.pss?.totalMb) ? c.natural.pss.totalMb - previous.natural.pss.totalMb : null,
      ...Object.fromEntries(METRICS.map(k => {
        const a = previous?.natural?.metrics?.[k], b = c?.natural?.metrics?.[k];
        // WHY: a navigation/domain reset is missing work evidence, not negative CPU/layout cost.
        if (finite(a) && finite(b) && CUMULATIVE_METRICS.includes(k) && b < a) { bad(`counter reset/decrease ${k}`); return [k, null]; }
        return [k, finite(a) && finite(b) ? b - a : null];
      })) } : null;
    for (const [phase, sample] of Object.entries(c?.checkpoints ?? {})) if (sample?.status !== 'measured') bad(`incomplete ${phase} checkpoint`);
    for (const [phase, delta] of Object.entries(c?.resourceDeltas ?? {})) if ((delta.renderer?.status ?? delta.status) !== 'measured') bad(`incomplete/reset ${phase} renderer resource delta`);
    if (c?.natural?.status === 'incomplete') bad('released resource checkpoint incomplete');
    const rendererValid=reasons.length===reasonsBefore;
    const compared=[...Object.values(c?.resourceDeltas??{}),matchedDelta,gcDelta].filter(Boolean);
    const familyPssComparable=!rendererOnly&&compared.every(d=>(d.family?.status??d.status)==='measured');
    const compositionOnly=compared.filter(d=>(d.family?.status??d.status)!=='measured').every(d=>d.renderer?.status==='measured'&&d.family?.compositionOnly===true);
    // WHY: unrequested memory is not a failed renderer observation, nor a full-run pass.
    if(rendererOnly)bad('family PSS not collected: renderer-only diagnostic, not whole-app health');
    else if(!familyPssComparable)bad('family PSS composition incomparable; aggregate retention unavailable');
    return { ...c, valid: reasons.length === reasonsBefore, rendererValid, familyPssComparable,
      continuationSafe:rendererValid&&(rendererOnly||familyPssComparable||compositionOnly), warmup: idx === 0,
      deltaFromPrevious: matchedDelta ? { pssMb: matchedDelta.pssMb, ...matchedDelta.metrics } : deltaFromPrevious };
  });
  // A partial cleanup/sample is retained as evidence, never included as though
  // it completed the same workload as the healthy post-warmup cycles.
  const trendRows = rows.slice(1).filter(c => c.rendererValid);
  const familyPssTrend={status:rows.length>0&&rows.every(c=>c.natural?.pss?.status==='not-collected')?'not-collected':rows.every(c=>c.familyPssComparable)?'comparable':'incomparable',
    reason:rows.every(c=>c.familyPssComparable)?null:rows.length>0&&rows.every(c=>c.natural?.pss?.status==='not-collected')?'Family PSS not collected; no aggregate PSS retention trend':'Process composition changed or family evidence incomplete; no aggregate PSS retention trend'};
  const trendValue = read => ({ samples: trendRows.filter(c => finite(read(c))).length,
    change: trendRows.length > 1 && finite(read(trendRows[0])) && finite(read(trendRows.at(-1))) ? read(trendRows.at(-1)) - read(trendRows[0]) : null });
  const trend = { pssMb: familyPssTrend.status==='comparable'?trendValue(c => c.natural?.pss?.totalMb):{samples:0,change:null},
    ...Object.fromEntries(METRICS.map(k => [k, trendValue(c => c.natural?.metrics?.[k])])) };
  const gcPolicy = cycles.some(c => c?.gcRequested || c?.afterGc?.status === 'measured') ? 'intervened' : 'natural';
  const trajectory = select => Object.fromEntries(['pssMb', ...METRICS].map(key => {
    const values = key==='pssMb'&&familyPssTrend.status!=='comparable'?[]:trendRows.map(c => select(c)).map(s => key === 'pssMb' ? s?.pss?.totalMb : s?.metrics?.[key]).filter(finite);
    const reset = CUMULATIVE_METRICS.includes(key) && values.some((n, i) => i && n < values[i - 1]);
    return [key, { samples: values.length, change: values.length > 1 && !reset ? values.at(-1) - values[0] : null, reset }];
  }));
  const trajectories = { natural: gcPolicy === 'natural' ? trajectory(c => c.natural) : null,
    intervenedPreGc: gcPolicy === 'intervened' ? trajectory(c => c.natural) : null,
    forcedGc: gcPolicy === 'intervened' ? trajectory(c => c.afterGc?.status === 'measured' ? c.afterGc.sample : null) : null };
  return { gcPolicy, trajectories, familyPssTrend, status: reasons.length || !cycles.length ? 'incomplete' : 'measured', reasons: cycles.length ? reasons : ['no cycles'], rawSampleCount: rows.filter(c => c.natural && c.natural.metrics && finite(c.natural.pss?.totalMb)).length, cycles: rows, trend,
    context: `${gcPolicy === 'intervened' ? 'Forced GC was requested: later pre-GC samples belong to a GC-intervened run, not an untouched natural-GC trajectory. ' : ''}First cycle is warmup; natural counters are not after-GC retention. Saved transcript/file counts can grow legitimately. Neither PSS slope nor persisted-record growth proves a leak. Chat only: terminal, files and previews unengaged.` };
}

// WHY: a hung CDP or a frozen renderer cannot enforce an in-page timeout. Node
// bounds each operation AND the full run, including its cleanup reservation.
export function makeBound(maxMinutes, { now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 10) throw Error('maxMinutes must be 1..10');
  const end = now() + maxMinutes * 60_000 - 12_000;
  return (promise, label = 'operation', cap = 30_000) => {
    // WHY: callers intentionally start owned cleanup before checking the budget.
    // Attach NOW, even when already expired: a late CDP/create/cleanup rejection
    // must not escape as an unhandled rejection. This does not cancel the work;
    // owned late-arrival handlers and final app teardown still own cancellation.
    const observed = Promise.resolve(promise);
    observed.catch(() => {});
    const ms = Math.min(cap, end - now());
    if (ms <= 0) return Promise.reject(new Error(`Lifecycle deadline exceeded at ${label}`));
    let timer;
    return Promise.race([observed, new Promise((_, reject) => { timer = setTimer(() => reject(new Error(`Lifecycle timeout at ${label}`)), ms); })]).finally(() => clearTimer(timer));
  };
}

// Counts saved JSONL files (context, not a leak verdict); all roots stay in fixture HOME.
export function recordCount(home, readDirectory = boundedDirectory) {
  let n = 0, visited = 0;
  const pending = [join(home, '.youcoded'), join(home, 'YouCoded')];
  while (pending.length) {
    const dir = pending.pop();
    try {
      // Streaming opendir avoids allocating an unbounded directory entry array.
      // Breaking/throwing closes the generator's directory handle in finally.
      for (const entry of readDirectory(dir)) {
        if (++visited > RESOURCE_DESCRIPTOR.maxRecords) throw Error('saved-file observation record cap exceeded');
        if (entry.isDirectory()) pending.push(join(dir, entry.name));
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) n++;
      }
    } catch (error) {
      // WHY: transient lock directories disappear normally; access and cap
      // failures remain incomplete rather than being credited as a cheap scan.
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return n;
}
const pageState = `(() => ({ mounted: document.querySelectorAll('.chat-scroll').length,
  visible: [...document.querySelectorAll('.chat-scroll')].filter(p => !p.closest('[aria-hidden="true"]')).length,
  pills: [...document.querySelectorAll('[data-session-strip] [data-session-id]')].map(p => p.getAttribute('data-session-id')) }))()`;

export function lifecycleStartupReady(text) {
  const names = new Set();
  for (const event of scanJsonLines(text)) if (typeof event?.name === 'string') names.add(event.name);
  return ['bg:reconcile:copies-done', 'bg:chatsearch-refresh:done', 'bg:materialize:done', 'bg:slug-repair:done'].every(name => names.has(name));
}

async function waitForLifecycleStartup(fixture, bound) {
  const started = Date.now();
  while (true) {
    const text = existsSync(fixture.perfLog) ? readBoundedText(fixture.perfLog) : '';
    if (lifecycleStartupReady(text)) return { waitedMs: Date.now() - started, settled: true };
    if (Date.now() - started >= 90_000) throw new Error('Startup repair did not finish; refusing to attribute its resource growth to lifecycle cycles');
    await bound(sleep(100), 'startup repair completion');
  }
}

export function makeDriver(app, fixture, fake, bound, identity) {
  const cdp = app.cdp;
  const evaluate = (code, label) => bound(cdp.evaluate(code), label);
  return {
    async state() {
      const [list, dom] = await Promise.all([evaluate('window.claude.session.list()', 'session list'), evaluate(pageState, 'mounted chats')]);
      if (!Array.isArray(list) || !Number.isInteger(dom?.mounted)) throw new Error('session list or mounted chat state unavailable');
      return { ids: list.map(s => s.id), mounted: dom.mounted, visible: dom.visible, pills: dom.pills };
    },
    async create(name) {
      const options = { name, cwd: fixture.projects.alpha, skipPermissions: false, provider: 'native', binding: { providerId: fixture.fakeProvider.id, modelId: fixture.fakeProvider.modelId }, preset: 'coder' };
      // The caller owns the timeout AND the eventual ID. Timing out this inner
      // promise would hide a late-created session from its cleanup handler.
      const s = await cdp.evaluate(`window.claude.session.create(${JSON.stringify(options)})`);
      if (!s?.id || s.provider !== 'native') throw new Error(`native create returned ${JSON.stringify(s)}`);
      return s.id;
    },
    async switchTo(id) {
      // Desktop session.switch IPC is a stub; click the actual pill and verify the visible pane.
      for (let i = 0; i < 100; i++) {
        const ok = await evaluate(`(() => { const p = [...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(x => x.getAttribute('data-session-id') === ${JSON.stringify(id)}); if (!p) return false; p.click(); return true; })()`, 'click session pill');
        if (ok) {
          for (let j = 0; j < 100; j++) {
            const seen = await evaluate(`(() => { const p = [...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(x => x.getAttribute('data-session-id') === ${JSON.stringify(id)}); const panes = [...document.querySelectorAll('.chat-scroll')]; const visible = panes.findIndex(x => !x.closest('[aria-hidden="true"]')); return !!p && visible >= 0 && Number(p.getAttribute('data-session-idx')) === visible; })()`, 'visible chat');
            if (seen) return;
            await bound(sleep(100), 'visible chat wait');
          }
          throw new Error(`pill ${id} did not become active`);
        }
        await bound(sleep(100), 'pill wait');
      }
      throw new Error(`session pill ${id} missing`);
    },
    async send(id, seed) {
      fake.plan({ deltas: 40, perSec: 100, seed, chars: 1200 });
      const text = fake.plannedText();
      const requestStart = fake.requests.length;
      const completion = fake.expectCompletion();
      const result = await evaluate(`window.claude.native.send(${JSON.stringify(id)}, ${JSON.stringify(`lifecycle ${seed}`)})`, 'native send');
      if (!result || result.status !== 'sent') throw new Error(`native send not accepted: ${JSON.stringify(result)}`);
      const rec = await bound(completion, 'fake completion', 15_000);
      if (fake.requests.length !== requestStart + 1 || rec !== fake.requests[requestStart]) throw new Error('unexpected provider request count');
      // DOM-rendered markdown is not raw SSE text; check actual visible text for
      // deterministic non-markup content rather than mistaking a prompt echo for a reply.
      const needle = text.split('\n').map(s => s.trim()).find(s => /^[A-Za-z][^`#|>*]{19,}/.test(s))?.slice(0, 24);
      if (!needle) throw new Error('fake reply lacks a verifiable plain-text fragment');
      let shown = false;
      for (let i = 0; i < 100; i++) {
        shown = await evaluate(`(() => { const p = [...document.querySelectorAll('.chat-scroll')].find(x => !x.closest('[aria-hidden="true"]')); return !!p && p.innerText.includes(${JSON.stringify(needle)}); })()`, 'reply in visible chat');
        if (shown) break;
        await bound(sleep(100), 'reply wait');
      }
      // WHY: provider-sent bytes alone do not establish what the app accepted.
      // Compare the coalesced native transcript's complete text and turn end to
      // the exact fake reply; a DOM fragment separately proves it was displayed.
      const transcript = join(fixture.home, '.youcoded', 'sessions', nativeStoreSlug(fixture.projects.alpha), `${id}.jsonl`);
      let persistedExact = false, turnComplete = false;
      for (let i = 0; i < 100; i++) {
        if (existsSync(transcript)) {
          // The final append may be mid-write; skip only the torn last line.
          persistedExact = false; turnComplete = false;
          for (const event of scanJsonLines(readBoundedText(transcript))) {
            if (event?.type === 'assistant-text' && event.data?.text === text) persistedExact = true;
            if (event?.type === 'turn-complete') turnComplete = true;
          }
          if (persistedExact && turnComplete) break;
        }
        await bound(sleep(100), 'persisted reply wait');
      }
      return { plannedDeltas: rec.plannedDeltas, deltasSent: rec.deltasSent, chars: rec.chars, aborted: rec.aborted, shown, exact: rec.deltasSent === rec.plannedDeltas && rec.chars === text.length, persistedExact, turnComplete, fragment: needle, requestIndex: rec.index };
    },
    // WHY: opt-in boundary verification uses the existing pane/pill mapping, not a new observer or polling loop.
    verifyAnchor: id => evaluate(`(() => { const p = [...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(x => x.getAttribute('data-session-id') === ${JSON.stringify(id)}); const panes = [...document.querySelectorAll('.chat-scroll')]; const visible = panes.findIndex(x => !x.closest('[aria-hidden="true"]')); return !!p && visible >= 0 && panes.filter(x => !x.closest('[aria-hidden="true"]')).length === 1 && Number(p.getAttribute('data-session-idx')) === visible; })()`, 'anchor visible'),
    close: id => cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`),
    sample: (phase = 'released', gcPolicy = 'natural', domain = 'full') => bound(captureCheckpoint({ cdp, family: () => app.family(), phase, gcPolicy, identity, domain }), `${phase} resource checkpoint`),
    records: () => recordCount(fixture.home),
    collectGc: () => bound(cdp.send('HeapProfiler.collectGarbage'), 'collect garbage', 10_000),
  };
}

export async function createOwnedSession(driver, name, bound, protectedIds = []) {
  const pending = Promise.resolve().then(() => driver.create(name));
  try { return await bound(pending, 'owned session create'); }
  catch (error) {
    // WHY: rejection by the external deadline does not cancel Electron's create.
    // The late result still owns cleanup; never touch an ID present beforehand.
    pending.then(id => {
      if (typeof id === 'string' && id && !protectedIds.includes(id)) return driver.close(id);
    }).catch(e => console.error(`late session cleanup: ${e.message}`));
    throw error;
  }
}

export async function runCycles(app, fixture, { cycles = 5, driver, bound = (p => p), postGc = false, resourceCheckpoints = false,
  settleCheckpoints = false, settleDomain = 'full', anchor, now = () => performance.now(), wait = sleep, deadline } = {}) {
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 5) throw Error('cycles must be 1..5 including warmup');
  if (settleCheckpoints && (cycles > 3 || postGc || resourceCheckpoints || !anchor || !Number.isFinite(deadline) || deadline-now()>300000-12000)) throw Error('invalid bounded natural settle configuration');
  if (!['full','renderer'].includes(settleDomain) || settleDomain!=='full'&&!settleCheckpoints) throw Error('invalid settle domain');
  let previousSettle = null;
  const settle = async (row, kind) => {
    const phase = await sampleSettlePhase({driver,kind,cycle:row.index,anchor,previous:previousSettle,now,wait,bound,deadline,domain:settleDomain});
    row.settle.push(phase);
    if (phase.status !== 'measured') throw Error(phase.reason || 'incomplete settle phase');
    previousSettle = phase.points.at(-1).sample;
    return phase;
  };
  const gcPolicy = postGc ? 'gc-intervened-pre-collection' : 'natural';
  const rows = [];
  for (let index = 1; index <= cycles; index++) {
    const row = { index, gcRequested: postGc, created: [], closed: [], output: [], completed: false, reason: null, before: null, after: null, natural: null, afterGc: { status: 'unmeasured', reason: 'not requested', sample: null }, persistedRecords: { before: null, after: null } };
    rows.push(row);
    if (settleCheckpoints) row.settle = [];
    try {
      if (settleCheckpoints) await settle(row, 'control');
      row.before = await bound(driver.state(), 'pre-cycle state');
      row.persistedRecords.before = await bound(driver.records(), 'pre-cycle saved files');
      if (resourceCheckpoints) row.checkpoints = { before: await bound(driver.sample('before', gcPolicy), 'before checkpoint') };
      for (let n = 0; n < 2; n++) {
        const id = await createOwnedSession(driver, `lifecycle-${index}-${n}`, bound, row.before.ids);
        if (!id || row.before.ids.includes(id) || row.created.includes(id)) throw new Error(`create returned invalid or pre-existing ID ${id}`);
        row.created.push(id);
        await bound(driver.switchTo(id), 'cycle switch');
        row.output.push(await bound(driver.send(id, `cycle-${index}-${n}`), 'cycle reply'));
      }
      for (let j = 0; j < 100; j++) {
        row.openState = await bound(driver.state(), 'active session state');
        if (row.created.every(id => row.openState.ids.includes(id)) && row.openState.mounted >= row.before.mounted + 2) break;
        await bound(sleep(100), 'active sessions wait');
      }
      if (resourceCheckpoints) row.checkpoints.grown = await bound(driver.sample('grown', gcPolicy), 'grown checkpoint');
      await bound(driver.switchTo(row.created[0]), 'switch back');
      // A session switch is NOT a hidden/minimized window experiment. Counters
      // remain renderer-wide; this checkpoint makes no hidden-pane attribution.
      if (resourceCheckpoints) row.checkpoints.switched = await bound(driver.sample('switched', gcPolicy), 'switched checkpoint');
    } catch (e) { row.reason = String(e?.message ?? e); }
    finally {
      // WHY: never destroy the fixture's pre-cycle sessions, even on a failed send.
      for (const id of [...row.created].reverse()) {
        try { await bound(driver.close(id), 'cycle cleanup'); row.closed.push(id); }
        catch (e) { row.reason = [row.reason, `cleanup ${id}: ${e.message}`].filter(Boolean).join('; '); }
      }
      try {
        if (settleCheckpoints && !row.before) throw Error('control failed before workload; no restoration observation permitted');
        for (let j = 0; j < 100; j++) {
          row.after = await bound(driver.state(), 'post-close state');
          if (same(row.before?.ids, row.after.ids) && row.before?.mounted === row.after.mounted) break;
          await bound(sleep(100), 'post-close wait');
        }
        if (!same(row.before?.ids, row.after?.ids) || row.before?.mounted !== row.after?.mounted) throw Error('exact session/mount restoration not established');
        if (settleCheckpoints) {
          if (row.reason) throw Error('workload/control failed; refusing settle continuation');
          await bound(driver.switchTo(anchor), 'restore visible anchor');
          const phase = await settle(row, 'workload');
          // Keep the legacy immediate released slot; delayed samples live only in the opt-in phases.
          row.natural = phase.points[0].sample;
        } else row.natural = await bound(driver.sample('released', gcPolicy), 'natural resource sample');
        if (resourceCheckpoints) {
          row.checkpoints ??= {};
          row.checkpoints.released = row.natural;
          row.resourceDeltas = Object.fromEntries(['grown', 'switched', 'released'].map(phase => [phase,
            checkpointDelta(row.checkpoints.before, row.checkpoints[phase])]));
        }
        row.persistedRecords.after = await bound(driver.records(), 'post-cycle saved files');
        if (postGc) {
          try { await bound(driver.collectGc(), 'GC diagnostic'); row.afterGc = { status: 'measured', reason: null, sample: await bound(driver.sample('released', 'forced-gc'), 'post-GC resource sample') }; }
          catch (e) { row.afterGc = { status: 'unmeasured', reason: String(e?.message ?? e), sample: null }; }
        }
      } catch (e) { row.reason = [row.reason, `observation: ${e.message}`].filter(Boolean).join('; '); }
    }
    row.completed = !row.reason;
    // Do not continue after a broken cleanup: later cycles would inherit its resources.
    // Whole-run status stays incomplete for family-composition churn, but an
    // exact-restored workload with complete renderer evidence can continue the
    // fixed bounded cycles. No missing counter/cleanup/identity failure qualifies.
    if (!summariseCycles(rows).cycles.at(-1)?.continuationSafe) break;
  }
  return rows;
}

// WHY: a timed-out startup can still return a handle later; clean that exact
// owned handle rather than losing it when the deadline rejects the race.
async function startOwned(start, close, bound, label) {
  const pending = Promise.resolve().then(start);
  try { return await bound(pending, label); }
  catch (e) { pending.then(close).catch(() => {}); throw e; }
}

async function launchOwned(start, bound) {
  return startOwned(start, app => app.kill(), bound, 'app launch');
}

// WHY: buildApp's subprocesses are not cancellable through its Promise. Run the
// existing helper in an owned process group so a deadline stops the build family,
// rather than merely rejecting while tsc/electron-builder continue running.
export async function buildBounded(checkout, bound, { spawnProcess = spawn } = {}) {
  const code = `import { buildApp } from ${JSON.stringify(new URL('./build.mjs', import.meta.url).href)}; const r = await buildApp(${JSON.stringify(checkout)}, { skipIfFresh: true }); console.log('PERF_LIFECYCLE_BUILD=' + JSON.stringify(r));`;
  const child = spawnProcess(process.execPath, ['--input-type=module', '-e', code], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = makeByteTail(), stderr = makeByteTail();
  child.stdout.on('data', b => stdout.push(b));
  child.stderr.on('data', b => stderr.push(b));
  const done = new Promise((ok, reject) => {
    child.on('error', reject);
    child.on('close', exit => {
      if (stdout.truncated || stderr.truncated) return reject(new Error('packaged build evidence incomplete: output tail cap exceeded'));
      if (exit !== 0) return reject(new Error(`packaged build exited ${exit}: ${stderr.text().slice(-2000) || stdout.text().slice(-2000)}`));
      const line = stdout.text().split('\n').findLast(s => s.startsWith('PERF_LIFECYCLE_BUILD='));
      if (!line) return reject(new Error('packaged build returned no build identity'));
      try { ok(JSON.parse(line.slice('PERF_LIFECYCLE_BUILD='.length))); } catch (e) { reject(e); }
    });
  });
  try { return await bound(done, 'packaged build', 240_000); }
  catch (e) {
    // This PID is the detached child we spawned, not an app or a shared checkout.
    if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }
    await Promise.race([done.catch(() => {}), sleep(2000)]);
    throw e;
  }
}

// WHY: buildApp's stamp lives in release/, while preserved packages carry an
// internal copy. Parent authority applies ONLY to this checkout's exact official
// output path; a missing/bad stamp never triggers a search in arbitrary parents.
export async function loadLifecyclePackageStamp({ checkout, appDir }, { fingerprint = treeFingerprint } = {}) {
  if (!isAbsolute(checkout) || !isAbsolute(appDir)) throw Error('package checkout and appDir must be absolute');
  checkout = resolve(checkout); appDir = resolve(appDir);
  const official = appDir === join(checkout, 'desktop', 'release', 'linux-unpacked');
  const internal = join(appDir, '.perf-lab-build.json');
  const stampPath = official ? join(dirname(appDir), '.perf-lab-build.json') : internal;
  const readStamp = path => {
    let text;
    try { text = readBoundedText(path, { maxBytes: 65536 }); }
    catch (error) { if (error.code === 'ENOENT') throw Error(`package stamp missing: ${path}`); throw error; }
    let stamp;
    try { stamp = JSON.parse(text); }
    catch { throw Error(`malformed package stamp: ${path}`); }
    if (!stamp || Array.isArray(stamp) || typeof stamp !== 'object' || typeof stamp.sha !== 'string' || !/^[0-9a-f]{6,40}$/.test(stamp.sha)
      || typeof stamp.dirty !== 'string' || !/^[0-9a-f]{12}$/.test(stamp.dirty)
      || typeof stamp.builtAt !== 'string' || !Number.isFinite(Date.parse(stamp.builtAt))) throw Error(`invalid package stamp: ${path}`);
    return stamp;
  };
  const stamp = readStamp(stampPath);
  if (official) {
    // An optional internal copy may agree, but cannot override parent authority.
    // Read it with the same bounds and fail closed on stale/conflicting copies.
    let internalEntry;
    try { internalEntry = lstatSync(internal); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    // WHY: existsSync follows links and hides dangling evidence as absent.
    // Reject links without following them; permission/I/O failures are not absence.
    if (internalEntry?.isSymbolicLink()) throw Error('internal package stamp symbolic link rejected');
    if (internalEntry) {
      const copy = readStamp(internal);
      if (['sha', 'dirty', 'builtAt', 'buildMs'].some(key => copy[key] !== stamp[key])) throw Error('conflicting official parent/internal package stamps');
    }
    const current = await fingerprint(checkout);
    if (stamp.sha !== current.sha || stamp.dirty !== current.dirty) throw Error('official package stamp fingerprint differs from current checkout; refusing stale binary');
  }
  const binary = join(appDir, 'youcoded');
  if (!statSync(binary).isFile()) throw Error('stamped package executable missing');
  return { ...stamp, appDir, binary, stampPath, stampSource: official ? 'official-parent' : 'preserved-internal' };
}

export function assertFreshLifecycleOutput(opts) {
  if (!opts.modelFree) return;
  let entry;
  try { entry = lstatSync(opts.out); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (entry) throw Error('--model-free requires a fresh --out path (including no existing symlink)');
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv);
  assertFreshLifecycleOutput(opts);
  mkdirSync(dirname(opts.out), { recursive: true });
  const settleDeadline = opts.settleCheckpoints ? performance.now() + opts.maxMinutes * 60000 - Math.max(12000, opts.cleanupReserveMs) : undefined;
  const baseBound = makeBound(opts.maxMinutes);
  // WHY: the fixed schedule and every async read share a monotonic deadline that leaves the explicit cleanup reserve untouched.
  const bound = opts.settleCheckpoints ? (p, label, cap = 30000) => baseBound(p, label, Math.min(cap, Math.max(0, settleDeadline - performance.now()))) : baseBound;
  const report = { descriptor: opts.settleCheckpoints ? SETTLE_DESCRIPTOR : RESOURCE_DESCRIPTOR, status: 'incomplete', scope: 'packaged Linux desktop, virtual display, fake native provider, chat-only; no terminal/files/previews engaged', options: opts, cycles: [] };
  let display, app, fake, supervisor;
  try {
    if (!opts.modelFree && !assetsReady({ checkout: opts.checkout })) throw Error('perf-lab assets not cached; provision separately');
    // Model-free mode requires an explicit cached package (parseOptions), so
    // there is no build fallback and no assetsReady/provision path in this mode.
    // Explicit packages follow the normal or preserved stamp layout without rebuilding.
    const build = opts.appDir ? await bound(loadLifecyclePackageStamp(opts), 'package stamp validation') : await buildBounded(opts.checkout, bound);
    if (!build.sha || !statSync(build.binary).isFile()) throw new Error('package missing build identity or executable');
    report.build = { checkout: resolve(opts.checkout), sha: build.sha, dirty: build.dirty, builtAt: build.builtAt, appDir: build.appDir };
    // WHY: fixed roots are cleared by buildFixture. Check shared package before
    // touching disk, and give each owned run a fresh private fixture directory.
    refusePackageProcesses(build.appDir);
    const fixture = prepareLifecycleFixture(mkdtempSync(join(ROOT, 'scratch/perf-lab/short-lifecycle-fixture-')), opts);
    report.fixture = { source: fixture.source, seedEngine: fixture.seedEngine, historySizes: fixture.historySizes, transcriptFileCount: fixture.transcriptFileCount,
      decoyTranscripts: fixture.decoyTranscripts, providerScope: 'keyless loopback fake HTTP provider; not real model coverage' };
    fake = await startOwned(() => startFakeProvider({ port: fixture.fakeProvider.port }), f => f.close(), bound, 'fake provider start');
    display = await startOwned(() => startXvfb(':99'), x => { if (x.proc) x.proc.kill('SIGTERM'); }, bound, 'virtual display');
    if (opts.supervised) {
      // WHY: acknowledge a separate parent/monitor BEFORE launchApp requests the
      // gate. No measurement-controller timer or SIGKILL is app containment.
      supervisor = await startOwned(() => startLaunchSupervisor({ runDir: dirname(fixture.home), fixture, binary: build.binary, checkout: resolve(opts.checkout),
        wallMs: opts.maxMinutes * 60000, maxRssMb: opts.maxRssMb, cleanupReserveMs: opts.cleanupReserveMs,
        cdpPort: 9569, display: display.display }), s => s.kill(), bound, 'supervisor acknowledgement');
      report.supervision = { scope: 'initial app family only; Xvfb/provider/controller outside containment', maxRssMb: opts.maxRssMb,
        cleanupReserveMs: opts.cleanupReserveMs, runtimeValidated: false };
    }
    // launchOwned cleans late arrivals if the external deadline beats launchApp.
    app = await launchOwned(() => launchApp({ binary: build.binary, appDir: build.appDir, fixture, display: display.display, cdpPort: 9569, refuseExisting: true, ...(supervisor ? { supervisedBackend: supervisor } : {}) }), (p, label) => bound(p, label, 90_000));
    await bound(app.cdp.send('Performance.enable'), 'enable metrics');
    // WHY: the first shakedown counted startup's copying of hundreds of seeded
    // transcripts as cycle growth. Wait for its real completion signals first.
    report.startup = await waitForLifecycleStartup(fixture, bound);
    const identity = { source: `package-stamp:${resolve(build.appDir)}:${build.sha}:${build.dirty ?? 'unknown-dirty'}:${build.builtAt ?? 'unknown-build'}`, run: randomUUID(), target: app.target?.id ?? null };
    report.identity = identity;
    const driver = makeDriver(app, fixture, fake, bound, identity);
    // The anchor preserves the window when the cycle's final owned tab closes.
    const preAnchor = await bound(driver.state(), 'pre-anchor state');
    const anchor = await createOwnedSession(driver, 'lifecycle-anchor', bound, preAnchor.ids);
    await bound(driver.switchTo(anchor), 'anchor mounted');
    try {
      report.initialState = await bound(driver.state(), 'starting state');
      report.cycles = await runCycles(app, fixture, { cycles: opts.cycles, driver, bound, postGc: opts.postGc, resourceCheckpoints: opts.resourceCheckpoints,
        settleCheckpoints: opts.settleCheckpoints, settleDomain: opts.settleDomain, anchor, deadline: settleDeadline });
      Object.assign(report, summariseCycles(report.cycles));
      if (opts.settleCheckpoints) {
        report.standardAcceptance = false;
        report.settleSummary = summariseSettle(report.cycles);
        if (report.settleSummary.status !== 'measured') report.status = 'incomplete';
      }
    } finally { await bound(driver.close(anchor), 'anchor cleanup').catch(e => { report.status = 'incomplete'; report.cleanupError = e.message; }); }
  } catch (e) { report.status = 'incomplete'; report.error = String(e?.message ?? e); }
  finally {
    try { if (app) await Promise.race([app.kill(), new Promise((_, reject) => setTimeout(() => reject(new Error('app cleanup timeout')), opts.supervised ? SUPERVISOR_STOP_TIMEOUT_MS + 2000 : 8000))]); }
    catch (e) { report.status = 'incomplete'; report.cleanupError = String(e?.message ?? e); }
    if (supervisor) {
      try {
        report.supervision.receipt = await supervisor.kill();
        if(report.supervision.receipt.memoryComplete===false){report.status='incomplete';report.supervision.memoryError='Historical RSS observation gap retained; ownership disappearance is not complete memory coverage';}
        if (report.supervision.receipt.reason !== 'controller-stop') { report.status = 'incomplete'; report.supervision.stopReason = report.supervision.receipt.reason; }
      }
      catch (error) { report.status = 'incomplete'; report.supervision = { ...report.supervision, receipt: supervisor.receipt, cleanupError: error.message }; }
    }
    try { if (display?.proc) display.proc.kill('SIGTERM'); } catch (e) { report.status = 'incomplete'; report.displayCleanupError = String(e); }
    try { if (fake) await Promise.race([fake.close(), new Promise((_, reject) => setTimeout(() => reject(new Error('fake provider cleanup timeout')), 3000))]); }
    catch (e) { report.status = 'incomplete'; report.providerCleanupError = String(e?.message ?? e); }
    try { writeFileSync(opts.out, boundedJson(report), opts.modelFree ? { flag: 'wx' } : undefined); }
    catch (error) {
      // A capped report is incomplete, never silently truncated evidence.
      report.status = 'incomplete';
      report.outputError = error.message;
      writeFileSync(opts.out, boundedJson({ status: report.status, descriptor: report.descriptor, outputError: report.outputError, evidenceOmitted: true }), opts.modelFree ? { flag: 'wx' } : undefined);
    }
  }
  console.log(`${report.status}: ${opts.out}`);
  if (report.status !== 'measured') process.exitCode = 2;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 2; });
