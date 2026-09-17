// scripts/perf-lab/scenario-native-stream.mjs — a native reply streaming at
// cloud-model speed into a chat, with the workload's six sessions open.
//
// WHY THIS SCENARIO EXISTS
// The workload's native leg streams from the real local model, which on this
// machine emits ~12 deltas a second (measured 2026-09-03: 35 deltas in 3 s). Real
// use is a cloud model at 50–150 tokens a second, so every per-delta cost in the
// renderer — the shell re-rendering per streamed word, tool cards redrawing, the
// per-word dedup set growing with the chat — was under-represented by an order of
// magnitude, and a fix for that class could not be told from noise
// (docs/active/investigations/2026-09-01-perf-rig-blind-to-native-streaming.md).
// The reply here comes from the perf-lab fake endpoint (fake-provider.mjs), which
// streams a fixed number of deltas at a fixed rate with content that is
// byte-identical between a baseline and a candidate.
//
// THREE LEGS, each one full reply of STREAM_DELTAS deltas at STREAM_PER_SEC:
//  1. visible   — the streaming session is on screen. The renderer long-task total
//                 over the stream is the per-delta cost a user feels as jank; the
//                 commit/layout counters say how many DOM commits those deltas
//                 became (the batcher coalesces to one per frame — commits far
//                 above frames means it is not engaging).
//  2. switching — a second reply streams while the user switches between the
//                 biggest conversation and the streaming one, every SWITCH_EVERY_MS.
//                 Click -> messages on screen, measured only for switches that
//                 happened while deltas were still arriving.
//  3. hidden    — a third reply streams into the native session while the huge
//                 conversation is on screen. A hidden stream should cost the
//                 visible window nothing; long tasks here are the shell paying for
//                 work it cannot show.
//
// WHAT THIS SCENARIO IS BLIND TO — say it, do not let a number stand in for it:
//  - the real engine (prefill, model load): the fake answers instantly, so
//    firstResponseMs is the app's own send path, not a model;
//  - tool calls and thinking blocks (the fake streams text deltas only);
//  - the buddy window (no scenario opens one);
//  - GPU paint cost: llvmpipe under Xvfb (report.machine.renderer).
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitFor } from './cdp.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { enablePerformanceDomain, installCommitProbe, readCommitProbe, readCounters, stopCommitProbe, summariseLayoutCost } from './layout-cost.mjs';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';
import { attributeStall } from './scenario-artifacts.mjs';
import { ipcRow, stallReading } from './scenario-terminal.mjs';
import {
  installPageHelpers, installProbe, median, openJourneySessions, p95, readProbe, readProbeWindow, renderedEntries, stopProbe,
} from './scenario-workload.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : n);

/** Deltas per reply. At STREAM_PER_SEC this is a 20 s stream — long enough for eight switches inside it. */
export const STREAM_DELTAS = 3000;
/** Deltas per second. A cloud model's typical rate; the local model here manages ~12. */
export const STREAM_PER_SEC = 150;
/** IPC ping interval over each leg. */
export const IPC_PING_MS = 100;
/** Switches made during the switching leg, and their spacing. 8 x 2 s sits inside the 20 s stream. */
export const SWITCHES_DURING_STREAM = 8;
export const SWITCH_EVERY_MS = 2000;
/** The first switch is delayed so the stream is under way when it happens. */
export const FIRST_SWITCH_AT_MS = 1500;
/** The app's own stop control — rendered only while a turn is in flight (StopButton.tsx:48-52, useStreamingGate). */
export const STOP_BUTTON = 'button[aria-label="Stop generating"]';
/** Extra time allowed past the planned stream length before a leg is called stuck. */
export const LEG_GRACE_MS = 30_000;

const mark = (cdp, label) =>
  cdp.evaluate(`(() => { if (window.__perfProbe) window.__perfProbe.mark(${JSON.stringify(label)}); return true; })()`);

/**
 * Opt-in CPU profiling of a leg: PERF_LAB_PROFILE_LEGS=visible,hidden writes one
 * V8 .cpuprofile per named leg under scratch/perf-lab/profiles/ (summarise it with
 * `node scripts/perf-lab/summarise-profile.mjs <file>`). A profiled leg's busy time
 * includes the sampler's own cost, so a profiled run is a DIAGNOSTIC, never a
 * baseline — the report says so in a warning.
 */
const PROFILE_LEGS = new Set((process.env.PERF_LAB_PROFILE_LEGS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const PROFILE_DIR = join(resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..'), 'scratch', 'perf-lab', 'profiles');
async function startProfile(cdp) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
}
async function stopProfile(cdp, leg) {
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.send('Profiler.disable');
  mkdirSync(PROFILE_DIR, { recursive: true });
  const p = join(PROFILE_DIR, `${(process.env.PERF_LAB_PROFILE_TAG ?? 'native-stream').replace(/[^A-Za-z0-9._-]/g, '-')}-${leg}-${Date.now()}.cpuprofile`);
  writeFileSync(p, JSON.stringify(profile));
  return p;
}

// ---------------------------------------------------------------------------
// In-page helpers
// ---------------------------------------------------------------------------

/**
 * `window.__perfStream`. The stop button is counted document-wide on purpose: every
 * open session keeps its ChatView mounted, so a HIDDEN session's stop button is in
 * the DOM inside an aria-hidden wrapper, and the hidden leg needs to see it.
 * `stopVisible` says whether one is in the visible pane.
 */
export async function installStreamHelpers(cdp) {
  await cdp.evaluate(`(() => {
    const stops = () => Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(STOP_BUTTON)}));
    window.__perfStream = {
      stopCount: () => stops().length,
      stopVisible: () => stops().some((b) => !b.closest('[aria-hidden="true"]')),
    };
    return true;
  })()`);
}

/**
 * The renderer's main-thread BUSY time, from CDP's monotonic Performance counters.
 *
 * WHY this and not only long tasks (first shakedown, 2026-09-16): a 3,000-delta stream
 * at 150/s produced 1,202 commits at 59.9 fps and a long-task total of exactly 0 ms.
 * The browser's long-task observer counts only stretches over 50 ms, so per-frame
 * work of 10–30 ms — the whole cost of re-rendering per streamed word — never
 * registers, and a phase gated on it would call a 40 %-busy main thread "perfectly
 * smooth". `TaskDuration` is the sum of every task the thread ran; its delta over the
 * stream window is the cost, whether it came in 5 ms slices or 500 ms ones. Seconds on
 * the wire, milliseconds here. Null, never 0, when the domain is off.
 */
export async function readMainThreadTime(cdp) {
  try {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const by = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
    const ms = (v) => (typeof v === 'number' ? v * 1000 : null);
    return { taskMs: ms(by.TaskDuration), scriptMs: ms(by.ScriptDuration), jsHeapMb: typeof by.JSHeapUsedSize === 'number' ? by.JSHeapUsedSize / 2 ** 20 : null, error: null };
  } catch (e) {
    return { taskMs: null, scriptMs: null, jsHeapMb: null, error: String(e?.message ?? e) };
  }
}

/** Busy-time deltas between two readMainThreadTime() readings, rounded; null where either side is missing. */
export function mainThreadDelta(before, after, windowMs) {
  const d = (k) => (typeof before?.[k] === 'number' && typeof after?.[k] === 'number' ? Math.round((after[k] - before[k]) * 10) / 10 : null);
  const taskMs = d('taskMs');
  return {
    taskMs,
    scriptMs: d('scriptMs'),
    // Share of the window the main thread was busy — the number a reader can feel.
    taskPct: taskMs !== null && typeof windowMs === 'number' && windowMs > 0 ? Math.round(taskMs / windowMs * 1000) / 10 : null,
  };
}

const withTimeout = (promise, ms, what) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not happen within ${ms} ms`)), ms).unref?.()),
]);

// ---------------------------------------------------------------------------
// Aggregation (pure — unit-tested)
// ---------------------------------------------------------------------------

/**
 * One leg's row from its raw readings. Every field is null, never 0, when it was
 * not measured. `framesPerSec` comes from the commit probe's own rAF counter over
 * the stream window, so a reader can see whether a "no long tasks" result was
 * taken at 60 fps or at a throttled 3 fps (README: frame-gap caveat).
 */
export function summariseLeg({ rec, planned, perSec, firstResponseMs, turnMs, turnEndSignal, charsShown, layout, probe, ipcRead, pingMs, mainThread = null }) {
  const fps = layout && typeof layout.frames === 'number' && typeof layout.elapsedMs === 'number' && layout.elapsedMs > 0
    ? round1(layout.frames / layout.elapsedMs * 1000) : null;
  return {
    // Main-thread busy time over the stream window (see readMainThreadTime).
    taskMs: mainThread?.taskMs ?? null,
    scriptMs: mainThread?.scriptMs ?? null,
    taskPct: mainThread?.taskPct ?? null,
    deltasPlanned: planned,
    deltasSent: rec?.deltasSent ?? null,
    perSecTarget: perSec,
    perSecAchieved: rec?.achievedPerSec ?? null,
    streamMs: rec?.streamMs ?? null,
    backpressureWaits: rec?.backpressureWaits ?? null,
    aborted: rec?.aborted ?? null,
    charsStreamed: rec?.chars ?? null,
    charsShown,
    firstResponseMs,
    turnMs,
    turnEndSignal,
    commits: layout?.commits ?? null,
    layouts: layout?.layouts ?? null,
    layoutsPerFrame: layout?.layoutsPerFrame ?? null,
    commitsPerFrame: layout?.commitsPerFrame ?? null,
    framesPerSec: fps,
    longtaskTotalMs: probe?.longtaskTotalMs ?? null,
    longtaskMaxMs: probe?.longtaskMaxMs ?? null,
    longtaskCount: probe?.longtaskCount ?? null,
    frameGapMaxMs: probe?.frameGapMaxMs ?? null,
    windowMs: probe?.windowMs ?? null,
    ipc: ipcRow(ipcRead, pingMs),
    stall: attributeStall(stallReading(ipcRead), probe),
  };
}

/** The switching leg's headline from its per-switch rows: only switches made while deltas were still arriving count. */
export function summariseStreamSwitches(switches) {
  const during = switches.filter((s) => s.duringStream);
  const ok = during.filter((s) => s.ok && typeof s.paintedMs === 'number' && Number.isFinite(s.paintedMs));
  const painted = ok.map((s) => s.paintedMs);
  return {
    switchCount: switches.length,
    duringStream: during.length,
    verifiedSwitches: ok.length,
    failedSwitches: during.length - ok.length,
    menuSwitches: during.filter((s) => s.mode === 'menu').length,
    switchPaintedMedianMs: painted.length ? median(painted) : null,
    switchPaintedP95Ms: painted.length ? p95(painted) : null,
    // Into the STREAMING session vs into the huge conversation, separately: the
    // two are different costs (a streaming pane never holds still; the huge one
    // must reach its rendered entry count).
    intoStreamingMedianMs: (() => { const v = ok.filter((s) => s.intoStreaming).map((s) => s.paintedMs); return v.length ? median(v) : null; })(),
    intoHugeMedianMs: (() => { const v = ok.filter((s) => !s.intoStreaming).map((s) => s.paintedMs); return v.length ? median(v) : null; })(),
  };
}

// ---------------------------------------------------------------------------
// Report contract
// ---------------------------------------------------------------------------

export const NUMERIC_PATHS = [
  'deltas.planned', 'deltas.perSecTarget',
  // Leg 1: the streaming session on screen.
  'visible.deltasSent', 'visible.perSecAchieved', 'visible.streamMs', 'visible.charsShown',
  'visible.firstResponseMs', 'visible.turnMs',
  'visible.taskMs', 'visible.scriptMs', 'visible.taskPct',
  'visible.commits', 'visible.layouts', 'visible.layoutsPerFrame', 'visible.commitsPerFrame', 'visible.framesPerSec',
  'visible.longtaskTotalMs', 'visible.longtaskMaxMs', 'visible.longtaskCount', 'visible.frameGapMaxMs', 'visible.windowMs',
  'visible.ipc.totalStallMs', 'visible.ipc.maxMs', 'visible.ipc.pings', 'visible.ipc.openStalls', 'visible.ipc.rejectedPings',
  // Leg 2: switching while it streams.
  'switching.deltasSent', 'switching.duringStream', 'switching.verifiedSwitches', 'switching.failedSwitches', 'switching.menuSwitches',
  'switching.switchPaintedMedianMs', 'switching.switchPaintedP95Ms', 'switching.intoStreamingMedianMs', 'switching.intoHugeMedianMs',
  'switching.longtaskTotalMs', 'switching.longtaskMaxMs', 'switching.frameGapMaxMs', 'switching.turnMs',
  'switching.taskMs', 'switching.taskPct',
  'switching.ipc.totalStallMs', 'switching.ipc.maxMs', 'switching.ipc.pings',
  // Leg 3: streaming into a hidden session.
  'hidden.deltasSent', 'hidden.perSecAchieved', 'hidden.charsShown', 'hidden.turnMs',
  'hidden.taskMs', 'hidden.scriptMs', 'hidden.taskPct',
  'hidden.commits', 'hidden.framesPerSec',
  'hidden.longtaskTotalMs', 'hidden.longtaskMaxMs', 'hidden.longtaskCount', 'hidden.frameGapMaxMs', 'hidden.windowMs',
  'hidden.ipc.totalStallMs', 'hidden.ipc.maxMs', 'hidden.ipc.pings',
  // The whole boot.
  'probe.longtaskTotalMs', 'probe.longtaskMaxMs',
];

const at = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

/** Median of each NUMERIC_PATH across runs, nested like a run; null (never 0) when no run measured it. */
export function medianRun(runs) {
  const out = {};
  for (const path of NUMERIC_PATHS) {
    const vals = runs.map((r) => at(r, path)).filter((v) => typeof v === 'number' && Number.isFinite(v));
    const keys = path.split('.');
    let node = out;
    for (const k of keys.slice(0, -1)) node = (node[k] ??= {});
    node[keys.at(-1)] = vals.length ? median(vals) : null;
  }
  // Verdicts roll up by WORST, never by median (median() on strings is NaN).
  const order = ['main', 'renderer', 'unclear', 'none', 'unknown'];
  const worst = (vs) => order.find((o) => vs.includes(o)) ?? null;
  for (const leg of ['visible', 'switching', 'hidden']) {
    const vs = runs.map((r) => r[leg]?.stall?.verdict).filter(Boolean);
    (out[leg] ??= {}).stallVerdict = vs.length ? worst(vs) : null;
  }
  return out;
}

export const MEASURES = {
  scenario: 'native-stream',
  question: 'What does a native reply streaming at cloud-model speed cost the window it is shown in, the switches made during it, and a window it is hidden from?',
  configuration: [
    'the workload\'s six sessions (4 Claude Code — huge / medium / small resumed plus an empty control — and 2 native), opened with the same openJourneySessions; the two native sessions are bound to the perf-lab fake endpoint instead of the local engine',
    `each leg is one reply of ${STREAM_DELTAS} deltas at ${STREAM_PER_SEC}/s from fake-provider.mjs — realistic markdown (prose, fenced code, diffs, log dumps) split into token-sized pieces, byte-identical between runs`,
    `switching leg: ${SWITCHES_DURING_STREAM} switches, one every ${SWITCH_EVERY_MS} ms starting ${FIRST_SWITCH_AT_MS} ms into the stream, alternating huge <-> the streaming session`,
    'hidden leg: the huge conversation on screen while the native session streams',
    'every repeat is its OWN boot with a freshly built fixture, like the workload',
    'stock theme, no wallpaper',
  ],
  clocks: {
    'visible.taskMs': 'the renderer main thread\'s BUSY time over the stream window (CDP Performance TaskDuration delta) — every task counted, however short; taskPct is its share of the window. Long tasks alone read 0 here: per-frame work under 50 ms never registers with the long-task observer',
    'visible.longtaskTotalMs': 'renderer long tasks (>= 50 ms) summed over the marked stream window: native.send -> the app\'s Stop button gone',
    'visible.turnMs': 'native.send -> the Stop button gone (the turn ended in the app\'s own terms); turnEndSignal says whether that button was seen or the fake server\'s completion + a settle was used instead',
    'visible.commits': 'MutationObserver commits inside the visible .chat-scroll over the stream (the transcript batcher coalesces deltas to one commit per frame, so commits ~ frames is healthy and commits >> frames means it is not engaging)',
    'switching.switchPaintedMedianMs': 'click the session pill -> the target conversation\'s messages on screen (the workload\'s painted clock), for switches made while deltas were still arriving',
    'hidden.longtaskTotalMs': 'the same long-task sum while the streaming session is NOT the visible one',
    'ipc.totalStallMs': 'the IPC ping probe (every 100 ms) over each leg; the main process forwards every delta over IPC, so this is what streaming costs every other window',
  },
  blindTo: [
    'the real engine: the fake answers at once, so firstResponseMs is the app\'s own send path, not prefill or model load',
    'tool calls, thinking blocks and attachments (text deltas only)',
    'the buddy window (no scenario opens one)',
    'GPU paint cost: llvmpipe under Xvfb (report.machine.renderer)',
    'the local model\'s own delta rate — this phase is about the renderer, and deliberately not hostage to it',
  ],
};

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

/** Send one reply into `sessionId` and measure the stream window. */
async function streamLeg(cdp, fake, { label, sessionId, deltas, perSec, seed, pingMs, warnings, expectStopButton = true }) {
  fake.plan({ deltas, perSec, seed });
  const completion = fake.expectCompletion();
  const budgetMs = Math.ceil(deltas / perSec * 1000) + LEG_GRACE_MS;
  const lenBefore = await cdp.evaluate('window.__perfLab.chatLen()');
  await mark(cdp, `${label}:start`);
  await installIpcStallProbe(cdp, { everyMs: pingMs });
  const attach = await installCommitProbe(cdp, { selector: '.chat-scroll' });
  if (!attach?.attached) warnings.push(`${label}: no visible .chat-scroll to observe, so its commit and frame counts are UNMEASURED`);
  const before = await readCounters(cdp);
  const busyBefore = await readMainThreadTime(cdp);
  const leg = label.split(':').pop();
  const profiling = PROFILE_LEGS.has(leg);
  if (profiling) await startProfile(cdp);
  const tSend = Date.now();
  const send = await cdp.evaluate(`window.claude.native.send(${JSON.stringify(sessionId)}, ${JSON.stringify(`perf-lab-stream ${label}`)})`);
  if (!send || send.status === 'failed') {
    throw new Error(`${label}: native.send was not dispatched — the app returned ${JSON.stringify(send)}`);
  }
  let firstResponseMs = null, turnMs = null, turnEndSignal = null;
  // The Stop button is rendered for the VISIBLE session only (measured on the first
  // shakedown: never seen on the hidden leg), so a hidden stream does not wait for it.
  if (expectStopButton) {
    try {
      await waitFor(cdp, 'window.__perfStream.stopCount() > 0', { timeoutMs: 30_000, everyMs: 50 });
      firstResponseMs = Date.now() - tSend;
    } catch { /* no stop button seen — fall back to the server's completion below */ }
  }
  let rec;
  try {
    rec = await withTimeout(completion, budgetMs, `${label}: the app's request to the fake endpoint`);
  } catch (err) {
    let shown = '';
    try { shown = await cdp.evaluate(`(()=>{const p=[...document.querySelectorAll('.chat-scroll')].find(e=>!e.closest('[aria-hidden="true"]')); return p ? p.innerText.slice(-300) : '';})()`); } catch { /* pane gone */ }
    throw new Error(`${err.message}${shown ? ` — pane shows: ${JSON.stringify(shown)}` : ''}`);
  }
  if (firstResponseMs !== null) {
    try {
      await waitFor(cdp, 'window.__perfStream.stopCount() === 0', { timeoutMs: budgetMs, everyMs: 50 });
      turnMs = Date.now() - tSend;
      turnEndSignal = 'stop-button';
    } catch {
      warnings.push(`${label}: the Stop button never went away within ${budgetMs} ms of the send although the fake finished streaming — the app never ended the turn; turnMs is null`);
    }
  } else {
    // The server's end plus a settle: the honest fallback, LABELLED as such. Expected
    // on the hidden leg; a warning only where the button should have been seen.
    await sleep(1500);
    turnMs = Date.now() - tSend;
    turnEndSignal = 'server';
    if (expectStopButton) warnings.push(`${label}: the app's Stop button was never seen, so the turn end is the fake server's completion plus 1.5 s, not the app's own signal`);
  }
  const after = await readCounters(cdp);
  const busyAfter = await readMainThreadTime(cdp);
  let profilePath = null;
  if (profiling) {
    profilePath = await stopProfile(cdp, leg);
    warnings.push(`${label}: CPU-PROFILED (${profilePath}) — its busy time includes the sampler, so this run is a diagnostic, not a baseline`);
  }
  const commit = await readCommitProbe(cdp);
  await stopCommitProbe(cdp);
  let ipcRead;
  try { ipcRead = await readIpcStallProbe(cdp); } catch (err) { ipcRead = { error: err.message }; }
  try { await stopIpcStallProbe(cdp); } catch { /* page gone */ }
  await mark(cdp, `${label}:end`);
  let probe = null;
  try { probe = await readProbeWindow(cdp, `${label}:start`, `${label}:end`); } catch (err) { probe = { error: err.message }; }
  const lenAfter = await cdp.evaluate('window.__perfLab.chatLen()');
  const charsShown = lenBefore >= 0 && lenAfter >= 0 ? lenAfter - lenBefore : null;
  const layout = summariseLayoutCost(before, after, commit);
  const mainThread = mainThreadDelta(busyBefore, busyAfter, probe?.windowMs ?? null);
  if (mainThread.taskMs === null) warnings.push(`${label}: the renderer's main-thread busy time is UNMEASURED (${busyBefore.error ?? busyAfter.error ?? 'no TaskDuration counter'}) — taskMs is null, not 0`);
  return { ...summariseLeg({ rec, planned: deltas, perSec, firstResponseMs, turnMs, turnEndSignal, charsShown, layout, probe, ipcRead, pingMs, mainThread }), profilePath };
}

/**
 * @param {object} app      launch.mjs App — { cdp, … }
 * @param {object} fixture  fixture.mjs FixtureInfo, built with { fakeProvider: true }
 */
export async function runNativeStreamScenario(app, fixture, {
  deltas = STREAM_DELTAS, perSec = STREAM_PER_SEC, pingMs = IPC_PING_MS,
  switchCount = SWITCHES_DURING_STREAM, switchEveryMs = SWITCH_EVERY_MS, firstSwitchAtMs = FIRST_SWITCH_AT_MS,
} = {}) {
  if (!fixture.fakeProvider) {
    throw new Error('native-stream: the fixture was built without { fakeProvider: true } — there is no endpoint to stream from, and falling back to the local model would measure a stream ten times slower than this phase describes');
  }
  const cdp = app.cdp;
  const ids = [];
  const warnings = [];
  let fake = null;
  try {
    fake = await startFakeProvider({ port: fixture.fakeProvider.port });
    await installProbe(cdp);
    await installPageHelpers(cdp);
    await installStreamHelpers(cdp);
    // The layout/style counters (readCounters) need CDP's Performance domain on;
    // without it every layout figure below is null and the leg says UNMEASURED.
    await enablePerformanceDomain(cdp, warnings, 'native-stream');

    const nativeBinding = { providerId: fixture.fakeProvider.id, modelId: fixture.fakeProvider.modelId };
    const { names, sizeByName, nat } = await openJourneySessions(cdp, fixture, { ids, warnings, nativeBinding });
    const natIdx = ids.indexOf(nat[0].id);
    const hugeIdx = names.findIndex((n) => sizeByName[n] === 'huge');
    if (hugeIdx < 0) throw new Error('native-stream: no huge conversation among the opened sessions — the switching and hidden legs need one');
    const hugeEntries = renderedEntries(fixture.transcripts.huge.turns);
    const switchTo = (idx, measure, expected, streaming) =>
      cdp.evaluate(`window.__perfLab.switchTo(${idx}, ${JSON.stringify(names[idx])}, ${ids.length}, ${measure}, ${expected === null ? 'null' : expected}, ${streaming})`);

    // The strip draws its pills a beat after session.create resolves. One run
    // (2026-09-16, Batch C) reached the first switch before any pill existed and
    // aborted on "no pill"; wait for the strip to catch up (or overflow into its
    // menu) before touching it.
    try {
      await waitFor(cdp, `(() => { const n = window.__perfLab.pills().length; return n >= ${ids.length} || !!(document.querySelector('[data-session-strip] [title="All Sessions"]') || document.querySelector('.session-strip [title="All Sessions"]')); })()`, { timeoutMs: 20_000, everyMs: 100 });
    } catch {
      warnings.push(`native-stream: the strip did not show ${ids.length} pills (or an All Sessions menu) within 20 s of creating the sessions`);
    }

    // ── Leg 1: visible ────────────────────────────────────────────────────
    const toNative = await switchTo(natIdx, false, null, false);
    if (toNative.mode === 'none') {
      // Say what the strip DID show: a missing pill can mean the session was never
      // created in the renderer, or that the strip overflowed with no menu.
      const shown = await cdp.evaluate(`window.__perfLab.pills().map((p) => p.getAttribute('title') || p.textContent.trim())`).catch(() => null);
      throw new Error(`native-stream: could not bring ${names[natIdx]} on screen — ${toNative.reason}. The app returned ${ids.length} session ids (${names.join(', ')}); the strip shows ${JSON.stringify(shown)}`);
    }
    await sleep(500);
    const visible = await streamLeg(cdp, fake, { label: 'native-stream:visible', sessionId: nat[0].id, deltas, perSec, seed: 'visible', pingMs, warnings });
    if (typeof visible.charsShown === 'number' && typeof visible.charsStreamed === 'number' && visible.charsShown < visible.charsStreamed * 0.5) {
      warnings.push(`native-stream: the visible pane grew by only ${visible.charsShown} characters for a ${visible.charsStreamed}-character reply — the stream did not reach the screen, so the visible leg's numbers do not describe a rendered stream`);
    }
    await sleep(1000);

    // ── Leg 2: switching while it streams ─────────────────────────────────
    fake.plan({ deltas, perSec, seed: 'switching' });
    const completion2 = fake.expectCompletion();
    const budget2 = Math.ceil(deltas / perSec * 1000) + LEG_GRACE_MS;
    await mark(cdp, 'native-stream:switching:start');
    await installIpcStallProbe(cdp, { everyMs: pingMs });
    const busyBefore2 = await readMainThreadTime(cdp);
    const requestsBefore2 = fake.requests.length;
    const tSend2 = Date.now();
    const send2 = await cdp.evaluate(`window.claude.native.send(${JSON.stringify(nat[0].id)}, 'perf-lab-stream switching')`);
    if (!send2 || send2.status === 'failed') throw new Error(`native-stream:switching: native.send was not dispatched — ${JSON.stringify(send2)}`);
    const switches = [];
    for (let i = 0; i < switchCount; i++) {
      const due = tSend2 + firstSwitchAtMs + i * switchEveryMs - Date.now();
      if (due > 0) await sleep(due);
      const intoStreaming = i % 2 === 1;
      const idx = intoStreaming ? natIdx : hugeIdx;
      // "Still streaming" comes from the fake server's own record, not the Stop
      // button: that button exists only for the visible session, so every switch
      // made while the huge conversation was on screen read as "after the stream"
      // on the first shakedown (4 of 8).
      const rec2now = fake.requests[requestsBefore2] ?? null;
      const streamingNow = !!rec2now && rec2now.endedAt === null;
      let r;
      try { r = await switchTo(idx, true, intoStreaming ? null : hugeEntries, intoStreaming); } catch (err) { r = { ok: false, mode: 'none', reason: err.message }; }
      switches.push({
        i, idx, name: names[idx], intoStreaming, duringStream: streamingNow,
        ok: !!r.ok, mode: r.mode, ms: r.ms ?? null, paintedMs: r.paintedMs ?? null, settled: r.settled ?? null, entries: r.entries ?? null, reason: r.reason ?? null,
      });
    }
    let turnMs2 = null;
    let rec2 = null;
    try { rec2 = await withTimeout(completion2, budget2, 'native-stream:switching: the fake endpoint\'s stream'); } catch (err) { warnings.push(`native-stream: ${err.message}`); }
    try { await waitFor(cdp, 'window.__perfStream.stopCount() === 0', { timeoutMs: budget2, everyMs: 50 }); turnMs2 = Date.now() - tSend2; } catch { warnings.push('native-stream:switching: the Stop button never went away after the stream; the turn did not end'); }
    const busyAfter2 = await readMainThreadTime(cdp);
    let ipcRead2;
    try { ipcRead2 = await readIpcStallProbe(cdp); } catch (err) { ipcRead2 = { error: err.message }; }
    try { await stopIpcStallProbe(cdp); } catch { /* page gone */ }
    await mark(cdp, 'native-stream:switching:end');
    const probe2 = await readProbeWindow(cdp, 'native-stream:switching:start', 'native-stream:switching:end');
    const mainThread2 = mainThreadDelta(busyBefore2, busyAfter2, probe2?.windowMs ?? null);
    const switching = {
      ...summariseStreamSwitches(switches),
      taskMs: mainThread2.taskMs, taskPct: mainThread2.taskPct,
      deltasSent: rec2?.deltasSent ?? null, perSecAchieved: rec2?.achievedPerSec ?? null, turnMs: turnMs2,
      longtaskTotalMs: probe2?.longtaskTotalMs ?? null, longtaskMaxMs: probe2?.longtaskMaxMs ?? null, frameGapMaxMs: probe2?.frameGapMaxMs ?? null, windowMs: probe2?.windowMs ?? null,
      ipc: ipcRow(ipcRead2, pingMs), stall: attributeStall(stallReading(ipcRead2), probe2), switches,
    };
    if (switching.duringStream < switchCount) {
      warnings.push(`native-stream: only ${switching.duringStream}/${switchCount} switches happened while deltas were still arriving — the stream ended early, so the switching numbers cover fewer switches than planned`);
    }
    if (switching.failedSwitches > 0) {
      const reasons = [...new Set(switches.filter((s) => s.duringStream && !s.ok).map((s) => s.reason))].slice(0, 3);
      warnings.push(`native-stream: ${switching.failedSwitches} switches during the stream never showed the target conversation and are excluded — ${reasons.join('; ')}`);
    }
    await sleep(1000);

    // ── Leg 3: hidden ─────────────────────────────────────────────────────
    const toHuge = await switchTo(hugeIdx, false, null, false);
    if (toHuge.mode === 'none') throw new Error(`native-stream: could not bring ${names[hugeIdx]} on screen for the hidden leg — ${toHuge.reason}`);
    await sleep(1000);
    const hidden = await streamLeg(cdp, fake, { label: 'native-stream:hidden', sessionId: nat[0].id, deltas, perSec, seed: 'hidden', pingMs, warnings, expectStopButton: false });
    const visibleNow = await cdp.evaluate('window.__perfLab.visiblePaneIdx()');
    if (visibleNow !== hugeIdx) {
      warnings.push(`native-stream: the visible pane moved to index ${visibleNow} during the hidden leg (expected ${hugeIdx}) — the app switched away from the huge conversation on its own, so the hidden leg was not fully hidden`);
    }
    if (typeof hidden.charsShown === 'number' && hidden.charsShown > 200) {
      warnings.push(`native-stream: the VISIBLE pane grew by ${hidden.charsShown} characters while the stream went to a hidden session — text from a hidden stream is reaching the wrong pane`);
    }

    const probe = await readProbe(cdp);
    return {
      sessions: { names, sizes: sizeByName, streaming: names[natIdx], huge: names[hugeIdx] },
      deltas: { planned: deltas, perSecTarget: perSec, requests: fake.requests.length },
      visible, switching, hidden,
      probe,
      warnings,
    };
  } finally {
    try { await stopIpcStallProbe(cdp); } catch { /* page gone */ }
    try { await stopCommitProbe(cdp); } catch { /* page gone */ }
    try { await stopProbe(cdp); } catch { /* page gone */ }
    if (fake) await fake.close();
  }
}
