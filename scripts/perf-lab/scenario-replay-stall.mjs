// scripts/perf-lab/scenario-replay-stall.mjs — the whole-app freeze, as a
// permanent, repeatable measurement.
//
// WHY THIS SCENARIO EXISTS
// Destin reports the app "freezing up fully": every animation app-wide slows and
// clicks stop registering. A one-off diagnostic (2026-08-26) reproduced it by
// simply RESUMING a conversation, and produced this:
//
//   conversation   main-process IPC stall (max)   worst renderer long task
//   100 msgs                    5 ms                      117 ms
//   5,000 msgs               3,353 ms                    3,257 ms
//   50,000 msgs              3,190 ms                   24,329 ms
//
// 5,000 messages is ordinary use, and it froze the WHOLE app for ~3.3 s. The
// mechanism is in the source: TranscriptWatcher.getHistory
// (youcoded/desktop/src/main/transcript-watcher.ts:451-488) does a synchronous
// fs.readFileSync of the entire transcript plus a full parse of every line, and it
// is called from an IPC handler (ipc-handlers.ts:2489). The main process is
// single-threaded and serves IPC for EVERY session, so while that runs, nothing in
// the app can respond — not the conversation being resumed, not the other five.
//
// That diagnostic was a throwaway script. This is the same measurement hardened to
// the rig's standards (repeats + medians, null-never-zero, cleanup in `finally`,
// real error text) so the regression class is caught automatically forever.
//
// WHAT MAKES THIS SCENARIO DIFFERENT FROM scenario-history: history asks "how long
// until the conversation is on screen?" — a cost the user asked for. This asks "how
// long was the REST OF THE APP unusable while that happened?" — a cost the user did
// not ask for, and the one behind the complaint. The two probes running together are
// the whole point; see attributeStalls() below for how they are separated.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { installIpcStallProbe, stopIpcStallProbe, readIpcStallProbe } from './probe-ipc.mjs';
import { installProbe, stopProbe, readProbe } from './scenario-workload.mjs';
// WHY import the selector and the median rule instead of re-declaring them: both are
// hard-won and already documented at length in scenario-history.mjs. A second copy is
// a second thing to drift. MESSAGE_COUNT_EXPR in particular carries two facts that a
// re-typed selector would silently lose: `.chat-scroll .timeline-entry` is the real
// shape (there is NO `data-message-id` anywhere in the renderer — that selector would
// count 0 forever and every number here would be a timeout), and the
// `!closest('[aria-hidden="true"]')` filter is REQUIRED because the app keeps a
// ChatView MOUNTED for every open session (ChatView.tsx:695-707, content-visibility:
// hidden, deliberately not display:none) so a bare query sums every open conversation.
import { median, MESSAGE_COUNT_EXPR } from './scenario-history.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The three fixture transcripts, smallest first. Exported so run.mjs can subset. */
export const SIZES = ['small', 'medium', 'huge'];

// How often the IPC stall probe pings. 100ms is fine-grained enough to catch a
// "the UI feels stuck" stall (>250ms) and cheap enough not to be the load itself.
const PROBE_EVERY_MS = 100;
// Node-side poll period for "has the timeline stopped growing?".
//
// WHY poll from Node here, when scenario-history deliberately samples IN-PAGE:
// history wants ~16ms resolution on a render timing, so its sampler must live in the
// page. Here the numbers come from the two probes, not from the poll — and an in-page
// sampler would be adding renderer work to the very thread whose blocking we are
// measuring. Better still, a Node-side poll is itself an instrument: while the
// renderer is blocked a CDP evaluate does NOT return until the block ends, so a
// 500ms poll that takes 24s to answer has just measured a 24s renderer freeze.
const POLL_MS = 500;
// Consecutive unchanged polls that count as "done rendering" (4 × 500ms = 2s).
const STABLE_SAMPLES = 4;
// Hard ceiling on one resume watch. 240s matches scenario-history's, for the same
// measured reason: a resume can block the renderer for MINUTES, and a ceiling below the
// real cost makes every huge sample a timeout — a permanently blind gate.
//
// The 240s figure came from the plain-prose fixture, where `huge` was 25,000 turns /
// 50,000 messages and rendered in ~122s. Since 9060b0d the fixture generates realistic
// code-heavy content and `huge` is 3,500 turns / 7,000 messages, chosen precisely so it
// stays under THIS ceiling (fixture.mjs SIZES documents the calibration). So the number
// is still right, but do not read "25,000 turns" out of this comment — that regime is
// only reachable via a raised ceiling plus larger SIZES.
// A ceiling is still MANDATORY: without one, a wedged renderer hangs the rig forever
// (a CDP evaluate never returns while the main thread is blocked, and cdp.mjs never
// times a request out on its own).
const WATCH_TIMEOUT_MS = 240000;
// Extra slack given to the CDP call beyond the scenario deadline, so the loop's own
// deadline check is what ends a run — not a CDP timeout firing a moment earlier and
// throwing away four good measurements.
const CDP_GRACE_MS = 30000;

/**
 * The fields compare.mjs may take a median of. Everything else on a run
 * (`worstStalls`, `blame`, `warnings`, `stability`) is diagnostics, and taking a
 * "median" of those would produce nonsense.
 */
export const NUMERIC_KEYS = [
  // End-to-end unresponsiveness, exactly as a user would feel it.
  'ipcMedianMs', 'ipcP95Ms', 'ipcMaxMs',
  'ipcOver250ms', 'ipcOver1000ms', 'ipcTotalStallMs',
  'ipcPings', 'ipcMissedTicks', 'ipcMaxPingGapMs',
  // The attribution — the actual point of this scenario.
  'mainProcessStallMs', 'mainProcessStallMaxMs',
  'rendererStallMs', 'rendererStallMaxMs',
  // Renderer-side detail, for comparison against the same numbers in workload.
  'rendererLongtaskCount', 'rendererLongtaskTotalMs', 'rendererLongtaskMaxMs',
  // Context for reading any of the above.
  'renderedEntries', 'elapsedMs',
];

/** Median of each NUMERIC_KEY across runs; a metric null in every run stays null. */
export function medianRun(runs) {
  return Object.fromEntries(NUMERIC_KEYS.map((k) => [k, median(runs.map((r) => r[k]))]));
}

// ---------------------------------------------------------------------------
// Attribution: which thread was blocked?
// ---------------------------------------------------------------------------
//
// THE RULE, in one sentence: a stalled ping that overlaps a renderer long task is
// blamed on the RENDERER; a stalled ping with no long task under it can only be the
// MAIN PROCESS, and that is the app-wide freeze.
//
// WHY this rule and not something simpler:
//  * The IPC probe measures END-TO-END unresponsiveness — it pings
//    `window.claude.getPlatform()`, whose handler is literally `() => process.platform`
//    (ipc-handlers.ts:1387-1389), so every millisecond it reports is queueing and
//    thread availability, never handler cost. But a blocked RENDERER also delays that
//    ping (it cannot dispatch the call, and it cannot run the promise resolution), so
//    a big number on its own does not say which thread was at fault.
//  * The renderer long-task observer says exactly when the renderer's main thread was
//    busy. Subtracting it is what leaves the main process behind.
//  * "Both were busy at once" is real, so this apportions by OVERLAP rather than
//    picking one winner: the part of a stall covered by a long task is charged to the
//    renderer, the remainder to the main process. The two therefore SUM EXACTLY to
//    ipcTotalStallMs — there is no unattributed remainder to wonder about.
//
// Known bias, stated rather than hidden: PerformanceObserver only reports tasks of
// 50ms or more, so renderer blocking below that is invisible and gets charged to the
// main process. It is a small bias here by construction — only stalls beyond the
// 100ms ping interval are attributed at all, and a renderer block big enough to cause
// one of those is itself well over 50ms — but it is the reason a handful of
// milliseconds of `mainProcessStallMs` is noise, and seconds of it is the bug.
// If the long-task observer failed to attach at all, attribution is reported as null
// (never as "100% main process", which would be a fabricated indictment).

/** Merge [start, end] intervals into a sorted, non-overlapping set. */
export function mergeIntervals(intervals) {
  const sorted = (intervals || [])
    .filter((iv) => Array.isArray(iv) && Number.isFinite(iv[0]) && Number.isFinite(iv[1]) && iv[1] > iv[0])
    .map((iv) => [iv[0], iv[1]])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    // `<=` merges touching intervals too: two back-to-back long tasks are one
    // continuous stretch of blocked renderer, not two with a 0ms window between.
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push(iv);
  }
  return out;
}

/** How much of [from, to) is covered by `merged` (output of mergeIntervals). */
export function overlapMs(from, to, merged) {
  let sum = 0;
  for (const [a, b] of merged) {
    if (b <= from) continue;
    if (a >= to) break; // sorted, so nothing later can overlap either
    sum += Math.min(to, b) - Math.max(from, a);
  }
  return sum;
}

// A stall is blamed on the renderer once most of it sat under a long task, and on the
// main process only when almost none of it did. The band between is honestly "mixed"
// rather than forced into one bucket.
export const RENDERER_BLAME_RATIO = 0.5;
export const MAIN_BLAME_RATIO = 0.1;

function blameFor(roundTripMs, overlap) {
  if (overlap === null) return 'unknown'; // no long-task data — say so, don't guess
  const ratio = roundTripMs > 0 ? overlap / roundTripMs : 0;
  if (ratio >= RENDERER_BLAME_RATIO) return 'renderer';
  if (ratio <= MAIN_BLAME_RATIO) return 'main-process';
  return 'mixed';
}

/**
 * Split measured IPC stall time between the renderer and the main process.
 *
 * @param {object} a
 * @param {[number, number][]} a.samples   `[startMsRelToIpcT0, roundTripMs]`, from `window.__ipcStall.samples`
 * @param {number} a.everyMs               the probe's ping interval
 * @param {[number, number][]|null} a.longtasks `[startMsRelToProbeT0, durationMs]`; null when unavailable
 * @param {number} a.ipcT0                 performance.now() when the IPC probe was installed
 * @param {number} a.probeT0               performance.now() when the renderer probe was installed
 *
 * Both t0 values come from the same page's `performance.now()`, which is what lets the
 * two probes' timestamps be put on one timeline at all — neither probe's own `atMs`
 * is comparable to the other's without this offset.
 */
export function attributeStalls({ samples, everyMs, longtasks, ipcT0 = 0, probeT0 = 0, worstCount = 5 }) {
  if (!Array.isArray(samples)) {
    throw new Error(`attributeStalls: samples must be an array of [startMs, roundTripMs] pairs, got ${typeof samples}`);
  }
  const period = Number.isFinite(everyMs) && everyMs > 0 ? everyMs : 0;
  const haveLongtasks = Array.isArray(longtasks);
  const merged = haveLongtasks
    ? mergeIntervals(longtasks.map(([start, dur]) => [probeT0 + start, probeT0 + start + dur]))
    : null;

  const empty = {
    ipcPings: 0, ipcTotalStallMs: null, longtaskOverlapMs: null, ipcMaxPingGapMs: null,
    mainProcessStallMs: null, mainProcessStallMaxMs: null,
    rendererStallMs: null, rendererStallMaxMs: null,
    worst: [], attributable: haveLongtasks,
  };
  // Zero pings means the probe never completed a round trip — we measured NOTHING.
  // Reporting 0ms of stall here would read as "perfectly responsive", the exact
  // inversion of the truth.
  if (samples.length === 0) return empty;

  let stallTotal = 0, overlapTotal = 0, mainTotal = 0, rendTotal = 0, mainMax = 0, rendMax = 0;
  let maxGap = null, prevStart = null;
  const detailed = [];

  for (const [startRel, roundTripMs] of samples) {
    // The ping interval itself is not a stall — only the part of the round trip
    // beyond it is. This matches probe-ipc's own totalStallMs definition exactly, so
    // mainProcessStallMs + rendererStallMs === ipcTotalStallMs by construction.
    const stallMs = Math.max(0, roundTripMs - period);
    const from = ipcT0 + startRel;
    const overlap = merged ? overlapMs(from, from + roundTripMs, merged) : null;
    const rendererMs = merged ? Math.min(stallMs, overlap) : null;
    const mainMs = merged ? stallMs - rendererMs : null;

    stallTotal += stallMs;
    if (merged) {
      overlapTotal += overlap;
      rendTotal += rendererMs; mainTotal += mainMs;
      if (mainMs > mainMax) mainMax = mainMs;
      if (rendererMs > rendMax) rendMax = rendererMs;
    }
    if (prevStart !== null) maxGap = Math.max(maxGap ?? 0, startRel - prevStart);
    prevStart = startRel;

    detailed.push({
      atMs: startRel, roundTripMs, stallMs,
      longtaskOverlapMs: overlap === null ? null : Math.round(overlap),
      blame: blameFor(roundTripMs, overlap),
    });
  }

  return {
    ipcPings: samples.length,
    ipcTotalStallMs: Math.round(stallTotal),
    // Diagnostic only, NOT attribution: the probe deliberately skips a tick while a
    // ping is still outstanding, so a long gap can mean either thread was busy.
    // It is here because it catches the case the round-trip numbers miss entirely —
    // a renderer so blocked that setInterval never fired, so no slow sample exists.
    ipcMaxPingGapMs: maxGap === null ? null : Math.round(maxGap),
    longtaskOverlapMs: merged ? Math.round(overlapTotal) : null,
    mainProcessStallMs: merged ? Math.round(mainTotal) : null,
    mainProcessStallMaxMs: merged ? Math.round(mainMax) : null,
    rendererStallMs: merged ? Math.round(rendTotal) : null,
    rendererStallMaxMs: merged ? Math.round(rendMax) : null,
    // The worst few, each already blamed, so a reader can check the verdict by hand.
    worst: [...detailed].sort((a, b) => b.roundTripMs - a.roundTripMs).slice(0, worstCount),
    attributable: haveLongtasks,
  };
}

/**
 * One word for "who froze the app during this run". `floorMs` is the point below
 * which a stall is not worth a verdict at all — a few milliseconds of jitter should
 * read as 'none', not as a main-process indictment.
 */
export function summarizeBlame(mainMs, rendererMs, { floorMs = PROBE_EVERY_MS } = {}) {
  if (typeof mainMs !== 'number' || typeof rendererMs !== 'number') return null;
  if (mainMs + rendererMs < floorMs) return 'none';
  // 2× is the margin at which one side is clearly dominant rather than merely ahead.
  if (mainMs >= rendererMs * 2) return 'main-process';
  if (rendererMs >= mainMs * 2) return 'renderer';
  return 'mixed';
}

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

/**
 * Node-side backstop around a CDP evaluate. cdp.mjs never times a request out, so a
 * renderer that crashed mid-resume would hang the rig forever with no error. The
 * stranded promise gets a no-op catch so it cannot resurface as an unhandled rejection.
 */
function withTimeout(promise, ms, what) {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${what} did not answer within ${ms}ms (renderer hung or crashed)`)), ms);
  });
  promise.catch(() => {});
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/**
 * @param {{cdp: {evaluate(expr: string): Promise<any>}}} app
 * @param {{transcripts: Record<string, {sessionId: string, slug: string, turns: number}>, projects: {alpha: string}}} fixture
 * @param {{repeats?: number, sizes?: string[]}} opts
 *
 * `repeats` defaults to 3 because a single sample can neither prove nor veto anything
 * in this rig — compare.mjs judges a change against the run-to-run SPREAD, which needs
 * the per-run samples to exist. 3 rather than history's 5 because the `huge` resume
 * costs ~2 minutes per sample.
 */
export async function runReplayStallScenario(app, fixture, {
  repeats = 3,
  sizes = SIZES,
  everyMs = PROBE_EVERY_MS,
  timeoutMs = WATCH_TIMEOUT_MS,
  // Exposed so the unit tests can drive the loop without real sleeps; nothing in the
  // rig should ever change them, because they are part of the measurement.
  pollMs = POLL_MS,
  stableSamples = STABLE_SAMPLES,
  settleMs = 500,
} = {}) {
  const out = {};
  for (const size of sizes) {
    const runs = [];
    for (let rep = 0; rep < repeats; rep++) {
      runs.push(await measureOnce(app, fixture, size, rep, { everyMs, timeoutMs, pollMs, stableSamples, settleMs }));
    }
    const med = medianRun(runs);
    out[size] = {
      runs,
      median: med,
      // The headline, in one word, taken from the MEDIAN run rather than the worst —
      // a single unlucky sample must not be able to rename the culprit.
      blame: summarizeBlame(med.mainProcessStallMs, med.rendererStallMs),
      // Surfaced at the size level so a partly-failed size is visible in the report
      // without digging through every run object.
      stabilizedRuns: runs.filter((r) => r.stability === 'stable').length,
      warnings: [...new Set(runs.flatMap((r) => r.warnings))],
    };
  }
  return out;
}

async function measureOnce(app, fixture, size, rep, { everyMs, timeoutMs, pollMs, stableSamples, settleMs }) {
  const t = fixture?.transcripts?.[size];
  if (!t) {
    throw new Error(
      `fixture has no '${size}' transcript (has: ${Object.keys(fixture?.transcripts ?? {}).join(', ') || 'none'})`,
    );
  }
  const warnings = [];
  const label = `${size}#${rep}`;

  // ---- 1. Start from an empty timeline --------------------------------------
  // WHY: renderedEntries is read off the screen at the end. If the PREVIOUS repeat's
  // conversation is still visible, its entries are counted as this one's, and the
  // "stopped growing" test can be satisfied by a timeline that never changed at all.
  // measureOnce destroys its session on the way out, so this normally settles at once.
  const baseline = await waitForEmptyTimeline(app, 20000);
  if (baseline !== 0) {
    warnings.push(`${label}: ${baseline} entries were still on screen before the resume; renderedEntries includes them`);
  }

  // ---- 2. Both probes, before anything happens -------------------------------
  // Order is irrelevant (they are independent), but BOTH must be armed before the
  // resume, because a stall cannot be attributed against long-task data that started
  // being collected after the stall did.
  await withTimeout(installIpcStallProbe(app.cdp, { everyMs }), 30000, `installIpcStallProbe(${size})`);
  const armed = await withTimeout(installProbe(app.cdp), 30000, `installProbe(${size})`);
  if (armed && armed.longtaskSupported === false) {
    warnings.push(`${label}: the renderer long-task observer failed to attach — every stall is reported as blame 'unknown', NOT as a main-process stall`);
  }

  const t0 = Date.now();
  const deadline = t0 + timeoutMs;
  let sessionId = null;
  let entries = 0;
  let timedOut = false;

  try {
    // ---- 3. Resume the conversation -----------------------------------------
    const created = await evalBeforeDeadline(app, `(async () => {
      try {
        const s = await window.claude.session.create({
          name: ${JSON.stringify(`perf-stall-${size}-${rep}`)},
          cwd: ${JSON.stringify(fixture.projects.alpha)},
          skipPermissions: true,
          resumeSessionId: ${JSON.stringify(t.sessionId)},
        });
        if (!s || !s.id) return { ok: false, error: 'session.create resolved without an id: ' + JSON.stringify(s) };
        return { ok: true, id: s.id };
      } catch (e) {
        return { ok: false, error: (e && e.message) ? e.message : String(e) };
      }
    })()`, deadline, `session.create (${size})`);
    if (!created.ok) {
      // Report what the app itself said — never a guessed cause.
      throw new Error(
        `session.create failed while resuming '${size}' (resumeSessionId=${t.sessionId}, cwd=${fixture.projects.alpha}): ${created.error}`,
      );
    }
    sessionId = created.id;

    // ---- 4. Wait until the timeline stops growing ---------------------------
    let last = -1, stable = 0;
    while (Date.now() < deadline) {
      const n = await evalBeforeDeadline(app, MESSAGE_COUNT_EXPR, deadline, `timeline entry count (${size})`);
      if (n === last && n > 0) { if (++stable >= stableSamples) break; }
      else { stable = 0; last = n; }
      if (pollMs > 0) await sleep(pollMs);
    }
    entries = last > 0 ? last : 0;
    timedOut = stable < stableSamples;

    // ---- 5. Freeze the probes, then read them -------------------------------
    // Stopping first matters: readProbe derives observedMs from stoppedAt, and a
    // still-running rAF loop would keep burning a callback per frame through
    // everything that comes after this scenario.
    await withTimeout(stopIpcStallProbe(app.cdp), 30000, `stopIpcStallProbe(${size})`);
    await withTimeout(stopProbe(app.cdp), 30000, `stopProbe(${size})`);

    const ipc = await withTimeout(readIpcStallProbe(app.cdp), 60000, `readIpcStallProbe(${size})`);
    const rend = await withTimeout(readProbe(app.cdp), 60000, `readProbe(${size})`);
    // Raw samples + raw long tasks + BOTH t0 values, in one round trip. readIpcStallProbe
    // only exposes its five worst stalls, and readProbe only exposes totals — neither is
    // enough to attribute every stall, and neither exposes the other probe's time origin,
    // which is what puts the two on a single timeline. Reading the probe objects directly
    // is a read; it does not modify probe-ipc.mjs or scenario-workload.mjs.
    const raw = await withTimeout(app.cdp.evaluate(`(() => { /* perf-lab: replay-stall raw probe read */
      const s = window.__ipcStall, p = window.__perfProbe;
      if (!s) throw new Error('replay-stall: window.__ipcStall vanished between install and read — the page reloaded mid-run.');
      if (!p) throw new Error('replay-stall: window.__perfProbe vanished between install and read — the page reloaded mid-run.');
      return {
        ipcT0: s.t0, everyMs: s.everyMs, samples: s.samples,
        probeT0: p.t0, longtaskSupported: p.longtaskSupported,
        longtasks: p.log.filter((e) => e[0] === 'longtask').map((e) => [e[1], e[2]]),
      };
    })()`), 60000, `replay-stall raw probe read (${size})`);

    // WHY the null: with no long-task observer, EVERY stall would show zero overlap
    // and the split would report 100% main process — a fabricated indictment of the
    // exact thing this scenario exists to accuse. Refuse to attribute instead.
    const attr = attributeStalls({
      samples: raw.samples,
      everyMs: raw.everyMs,
      longtasks: raw.longtaskSupported ? raw.longtasks : null,
      ipcT0: raw.ipcT0,
      probeT0: raw.probeT0,
    });

    const elapsed = Date.now() - t0;

    // ---- 6. Warn loudly about anything that makes a number less than it looks --
    if (timedOut) {
      warnings.push(
        `${label}: the timeline never stopped growing within ${timeoutMs}ms — ${entries} entries on screen; ` +
        `elapsedMs reported as null (absent), not as ${elapsed}`,
      );
    }
    if (entries === 0) {
      warnings.push(`${label}: nothing ever rendered (0 timeline entries) — the resume may not have loaded ${t.slug}/${t.sessionId}.jsonl at all, so the stall numbers may be measuring an empty conversation`);
    }
    if (ipc.pings === 0) {
      warnings.push(`${label}: the IPC stall probe completed 0 pings — no responsiveness was measured at all, so every ipc* metric is null`);
    }
    if (ipc.missedTicks > ipc.pings) {
      warnings.push(`${label}: the IPC probe skipped ${ipc.missedTicks} ticks against ${ipc.pings} completed pings — the main process was busy more often than it was sampled, so the stall totals are a FLOOR, not the full cost`);
    }
    if (rend.errors && rend.errors.length) {
      warnings.push(`${label}: renderer probe reported ${rend.errors.join('; ')}`);
    }

    return {
      // --- end-to-end unresponsiveness (what a user feels) ---
      ipcMedianMs: ipc.medianMs, ipcP95Ms: ipc.p95Ms, ipcMaxMs: ipc.maxMs,
      ipcOver250ms: ipc.over250ms, ipcOver1000ms: ipc.over1000ms,
      ipcTotalStallMs: ipc.totalStallMs,
      ipcPings: ipc.pings, ipcMissedTicks: ipc.missedTicks,
      ipcMaxPingGapMs: attr.ipcMaxPingGapMs,
      // --- the attribution ---
      mainProcessStallMs: attr.mainProcessStallMs,
      mainProcessStallMaxMs: attr.mainProcessStallMaxMs,
      rendererStallMs: attr.rendererStallMs,
      rendererStallMaxMs: attr.rendererStallMaxMs,
      blame: summarizeBlame(attr.mainProcessStallMs, attr.rendererStallMs),
      worstStalls: attr.worst,
      // --- renderer detail, directly comparable to the workload scenario's ---
      rendererLongtaskCount: rend.longtaskCount,
      rendererLongtaskTotalMs: rend.longtaskTotalMs,
      rendererLongtaskMaxMs: rend.longtaskMaxMs,
      longtaskSupported: rend.longtaskSupported,
      // --- context ---
      renderedEntries: entries,
      expectedEntries: 2 * t.turns, // fixture.mjs writes exactly 2 JSONL lines per turn
      // Null, never the timeout value. A draft of the original diagnostic reported its
      // ceiling as though the resume had finished then — a failure that reads as data.
      elapsedMs: timedOut ? null : elapsed,
      timedOutAfterMs: timedOut ? elapsed : null,
      stability: timedOut ? 'timeout' : 'stable',
      warnings,
    };
  } finally {
    // ---- 7. Cleanup — best effort, but never silent -------------------------
    // WHY `finally` and not a plain trailing block: if the read above throws, the
    // probes must still be disarmed and the session still destroyed, or the NEXT
    // repeat inherits a running rAF loop and a live 50,000-message session and every
    // number it produces is contaminated. And why warnings rather than rethrowing:
    // a failed destroy must not discard measurements that were already taken — but a
    // session that would not die also explains any later repeat behaving oddly.
    await quietly(() => stopIpcStallProbe(app.cdp), warnings, `${label}: stopIpcStallProbe`);
    await quietly(() => stopProbe(app.cdp), warnings, `${label}: stopProbe`);
    if (sessionId) {
      const d = await quietly(() => app.cdp.evaluate(`(async () => {
        try { await window.claude.session.destroy(${JSON.stringify(sessionId)}); return { ok: true }; }
        catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
      })()`), warnings, `${label}: session.destroy(${sessionId})`);
      if (d && d.ok === false) warnings.push(`${label}: session.destroy(${sessionId}) failed: ${d.error}`);
      if (settleMs > 0) await sleep(settleMs);
    }
  }
}

/** Run `fn`, turning any failure into a warning carrying the real error text. */
async function quietly(fn, warnings, what) {
  try {
    return await withTimeout(Promise.resolve().then(fn), 30000, what);
  } catch (e) {
    warnings.push(`${what} failed: ${e && e.message ? e.message : String(e)}`);
    return null;
  }
}

/**
 * A CDP evaluate whose timeout is the scenario's own deadline (plus grace).
 *
 * WHY not a fixed per-call timeout: while the renderer is blocked, an evaluate does
 * not return until the block ends — and a 24-SECOND block is the measured, expected
 * behaviour on the `huge` fixture. A fixed 15s timeout would turn the very thing this
 * scenario measures into a rig failure. The deadline stays the only ceiling, so a
 * genuinely wedged renderer still cannot hang the run forever.
 */
function evalBeforeDeadline(app, expr, deadline, what) {
  const budget = Math.max(1000, deadline - Date.now()) + CDP_GRACE_MS;
  return withTimeout(app.cdp.evaluate(expr), budget, what);
}

/** Poll (cheaply, off the measured path) until nothing is on screen. Returns the last count seen. */
async function waitForEmptyTimeline(app, timeoutMs) {
  const t0 = Date.now();
  // 120s per call, far above the 20s budget: the previous repeat's `huge` teardown can
  // still have the renderer busy, and that should cost this loop its budget, not throw.
  const read = () => withTimeout(app.cdp.evaluate(MESSAGE_COUNT_EXPR), 120000, 'timeline entry count');
  let n = await read();
  while (n !== 0 && Date.now() - t0 < timeoutMs) {
    await sleep(100);
    n = await read();
  }
  return n;
}
