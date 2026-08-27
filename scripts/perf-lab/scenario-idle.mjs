// scripts/perf-lab/scenario-idle.mjs — what the app costs while the user does
// NOTHING, with real sessions open.
//
// WHY THIS SCENARIO EXISTS
// Every other scenario in this rig measures the app while a user DOES something:
// boot it, resume a conversation, switch sessions, stream a transcript. None of them
// measures the app SITTING STILL with sessions open — and that gap hid a whole class
// of defect, because background work does not need a user to trigger it.
//
// The concrete suspect: buildStatusData() runs on a 10-second setInterval on the
// Electron MAIN process and does 5 + 3N synchronous file reads (N = open sessions),
// then serializes the payload to every window. Main is single-threaded and serves IPC
// for every session, so for as long as that runs, nothing in the app can respond.
//
// WHY THE RIG'S EXISTING `idle.pssMb` / `idle.cpuPct` CANNOT SEE IT
// Two independent blind spots, and this module exists to avoid repeating either:
//
//  1. They sample a FRESH BOOT WITH ZERO SESSIONS OPEN. The per-session term of
//     `5 + 3N` is exactly zero there — the one configuration in which the suspect is
//     guaranteed innocent. So this scenario holds N sessions OPEN, and holds them at
//     more than one N so the per-session slope is measurable (see perSessionTax).
//
//  2. They report CPU PERCENT, which is a THROUGHPUT metric. A 40 ms main-thread
//     block every 10 s is 0.27% of a 15-second window: it rounds away to nothing
//     while being plainly visible to a human as a hitch. Blocking is a LATENCY
//     defect, and averaging destroys latency signal by construction. So the headline
//     numbers here are maxima, percentiles and threshold COUNTS; `cpuPct` and `pssMb`
//     are carried as CONTEXT only and are explicitly not the verdict.
//
// WHAT A QUIET RESULT DOES AND DOES NOT MEAN — READ THIS BEFORE QUOTING A NUMBER
// The measurement window is finite. At the 120 s default it sees roughly twelve ticks
// of a 10-second poll and ZERO ticks of a 30-minute scanner. A quiet result therefore
// means exactly one thing: "nothing periodic faster than this window fired during it."
// It NEVER means "the app is idle-clean." The returned object carries
// `cadencesCoveredMs` and `coverageNote` so that limit travels with the numbers
// instead of being lost the moment someone pastes the median into a report.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { installIpcStallProbe, stopIpcStallProbe, readIpcStallProbe } from './probe-ipc.mjs';
// stableUuid is the fixture's OWN id generator (a hash-derived, v4-shaped uuid that
// passes session-browser.ts's SAFE_ID_RE). Reused so a cloned transcript is
// indistinguishable from a fixture-built one, and so clone names are deterministic —
// a run that dies before cleanup leaves the SAME six files the next run reuses,
// instead of a growing pile of 25 MB orphans.
import { stableUuid } from './fixture.mjs';
import { installProbe, stopProbe, readProbe } from './scenario-workload.mjs';
import { cpuSnapshot, cpuPercent, pssMb } from './procs.mjs';
// `median` comes from scenario-history rather than being retyped: it already encodes
// the rule the whole rig depends on (non-finite entries are DROPPED, an empty set is
// null and never 0), and a second copy is a second thing to drift.
import { median } from './scenario-history.mjs';
// Reused, not reimplemented. attributeStalls is pure, already unit-pinned in
// scenario-replay-stall.test.mjs, and — crucially for the honesty rules below — it
// returns NULL rather than a main-process verdict when there is no long-task data to
// exonerate the renderer with. Re-deriving that arithmetic here would be a second
// chance to get it wrong in exactly the direction this scenario is biased toward.
import { attributeStalls, summarizeBlame } from './scenario-replay-stall.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const round2 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

/** How many sessions to hold open. Two points is the minimum that yields a slope. */
export const SESSION_COUNTS = Object.freeze([1, 6]);

// How often the IPC stall probe pings, in ms.
//
// 25 ms, NOT the 100 ms every other scenario uses, and the difference is load-bearing.
// The suspect blocks main for tens of milliseconds, not seconds. A ping is only
// elongated if the block overlaps its round trip, so with a 100 ms interval a 40 ms
// block is caught roughly 40% of the time — and a detector that misses 60% of
// occurrences turns a clean 10-second cadence into a ragged mix of 10 s and 20 s gaps,
// i.e. it destroys the very periodicity this scenario exists to find. At 25 ms, a
// 40 ms block always overlaps at least one ping.
//
// The cost of pinging 40x/second is negligible next to what is being measured: the
// handler is `() => process.platform` (ipc-handlers.ts:1387-1389), a constant. And it
// is the SAME cost at every session count, so it cannot bias the per-session slope,
// which is the number the scenario is really after.
const PING_EVERY_MS = 25;

// The measurement window, and the settle time before it.
const WINDOW_MS = 120000;
// 8 s of settle. Resuming a 2,500-turn transcript blocks main for seconds
// (scenario-replay-stall measured 3.35 s for exactly this fixture size); anything
// still draining from the resume is startup cost, not idle cost, and counting it here
// would put a large one-off stall into a window whose whole purpose is to contain only
// self-inflicted background work.
const SETTLE_MS = 8000;

// Which fixture transcript the held-open sessions are resumed from.
//
// RESUMED, NOT FRESH, and this is not a detail: fake-claude.cjs never writes turns of
// its own, so a freshly-created session has an EMPTY transcript. The per-session cost
// being hunted scales with real session state (file reads over the session's own
// files), so measuring empty sessions would recreate blind spot #1 in a new place.
const PREFERRED_SIZE = 'medium';

// Stalls closer together than this are ONE event.
//
// WHY clustering is mandatory: at a 25 ms ping interval, a single 40 ms block
// elongates two or three consecutive pings. Feeding those to the gap detector as three
// separate events yields gaps of 25 ms, 25 ms, 9950 ms — and the MEDIAN of that is
// 25 ms, i.e. a confident report of a 25-millisecond cadence that does not exist.
// 500 ms is comfortably above one block and far below any cadence worth naming.
const CLUSTER_MS = 500;

// Gaps needed before a period may be named at all. Three gaps (four events) is the
// smallest set in which the gaps can be seen to AGREE with each other; two events give
// one gap, which is a number with no evidence attached, and reporting it would be
// exactly the "fabricated period from two samples" this scenario must not produce.
const MIN_GAPS = 3;

// A cadence is called regular when the median absolute deviation of its gaps is within
// this fraction of the period. 0.25 tolerates real scheduler jitter (a setInterval on a
// busy main thread drifts) without accepting a set of gaps that merely happen to have a
// median.
const TOLERANCE_RATIO = 0.25;

/**
 * The fields compare.mjs may take a median of. Everything else on a run
 * (`periodicity`, `blame`, `warnings`, `pssBreakdown`) is diagnostics, and taking a
 * "median" of those would produce nonsense.
 *
 * Ordering is deliberate and mirrors how the result should be READ: latency first,
 * cadence second, context last. `cpuPct` and `pssMb` sit at the bottom under a comment
 * saying they are not the headline, because the previous idle numbers were exactly
 * these two and they are what missed the defect.
 */
export const NUMERIC_KEYS = [
  // --- HEADLINE: latency. A block is felt as its worst case, never as its average. ---
  'ipcMaxMs', 'ipcP95Ms', 'ipcMedianMs', 'ipcTotalStallMs',
  'ipcOver100ms', 'ipcOver250ms', 'ipcOver1000ms',
  'ipcPings', 'ipcMissedTicks', 'ipcMaxPingGapMs',
  // --- Cadence: the point of the scenario. Null unless enough events were seen. ---
  'stallFloorMs', 'stallSampleCount', 'stallEventCount',
  'periodicStallMs', 'periodicGapMadMs', 'periodicDispersionRatio',
  // --- Attribution, borrowed from replay-stall. Null when the renderer probe is dead. ---
  'mainProcessStallMs', 'mainProcessStallMaxMs',
  'rendererStallMs', 'rendererStallMaxMs',
  // --- Renderer detail, directly comparable to the same names in workload/replay. ---
  'rendererLongtaskCount', 'rendererLongtaskTotalMs', 'rendererLongtaskMaxMs',
  // --- CONTEXT ONLY. Not the headline, and not a pass/fail. A periodic main-thread
  //     block is invisible in both of these by construction (see the module header):
  //     averaging a 40 ms hitch over 120 s produces 0.03%, and a poll that reads files
  //     it already had cached moves PSS not at all. They are here so a reader can tell
  //     "the app was blocking" from "the app was busy", which are different problems.
  'cpuPct', 'pssMb',
  // --- Run shape, so a median object is self-describing without its parent. ---
  'sessionCount', 'windowMs', 'elapsedMs', 'probeSkewMs',
];

/** The metrics worth expressing as a marginal cost per open session. */
export const TAX_KEYS = Object.freeze([
  'ipcTotalStallMs', 'ipcMaxMs', 'ipcP95Ms', 'ipcOver100ms',
  'stallEventCount', 'rendererLongtaskTotalMs', 'cpuPct', 'pssMb',
]);

/** Median of each NUMERIC_KEY across runs; a metric null in every run stays null. */
export function medianRun(runs) {
  return Object.fromEntries(NUMERIC_KEYS.map((k) => [k, median(runs.map((r) => r[k]))]));
}

// ---------------------------------------------------------------------------
// Pure analysis — unit-testable without an app
// ---------------------------------------------------------------------------

/**
 * The round-trip time above which a ping counts as "something blocked me".
 *
 * WHY this is DERIVED from the run's own baseline rather than being a fixed constant:
 * probe-ipc's perceptual thresholds (100/250/1000 ms) answer "would a person notice
 * this click being slow?". That is the right question for a resume and the WRONG
 * question here — the suspect is a ~40 ms block, which is under every one of them, and
 * a fixed 150 ms floor would report zero stalls on an app that is stuttering twelve
 * times a minute. So the floor is set relative to what THIS run's idle round trip
 * actually costs, which is a fraction of a millisecond on a quiet main thread.
 *
 * `minMs` is the sensitivity limit and is stated in the result: a block smaller than
 * this cannot be seen, and a run that reports zero stalls has NOT ruled out blocks
 * below the floor.
 *
 * @param {number[]} roundTripsMs every ping's round trip
 * @returns {number|null} null when there were no pings at all (nothing was measured)
 */
export function stallFloor(roundTripsMs, { minMs = 15, multiplier = 4, aboveMedianMs = 10 } = {}) {
  const base = median(Array.isArray(roundTripsMs) ? roundTripsMs : []);
  if (base === null) return null;
  // Three guards, whichever is highest wins: an absolute floor (so a suspiciously
  // fast baseline cannot make noise look like stalls), a multiple of baseline (so a
  // genuinely slow machine does not report every ping as a stall), and a fixed
  // headroom above baseline (so a baseline near zero still needs real elongation).
  return Math.max(minMs, base * multiplier, base + aboveMedianMs);
}

/** Median absolute deviation — a dispersion figure that one outlier cannot dominate. */
export function medianAbsoluteDeviation(values) {
  const m = median(values);
  if (m === null) return null;
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * Collapse stall start times into EVENTS: consecutive stalls closer together than
 * `clusterMs` are one block being sampled more than once, not two blocks.
 * Chaining is from the previous SAMPLE (not the event's first sample) on purpose, so a
 * long continuous stretch of stalling stays one event rather than being chopped into
 * fake periodic pieces at the cluster width.
 */
export function clusterStarts(startsMs, { clusterMs = CLUSTER_MS } = {}) {
  const sorted = (Array.isArray(startsMs) ? startsMs : [])
    .filter((n) => typeof n === 'number' && Number.isFinite(n))
    .sort((a, b) => a - b);
  const events = [];
  let prev = null;
  for (const s of sorted) {
    if (prev === null || s - prev > clusterMs) events.push(s);
    prev = s;
  }
  return events;
}

/**
 * Does the app stall on a REGULAR CADENCE, and if so, how often?
 *
 * The suspect fires every 10 s. This is what turns "the app stalled a few times" into
 * "the app stalled on a timer", which is the difference between a noisy machine and a
 * background job — and it is the single finding this scenario exists to produce.
 *
 * @param {number[]} startsMs stall start times on ONE clock (the IPC probe's t0)
 * @returns {{periodMs, gapsMs, gapMadMs, dispersionRatio, regular, eventCount,
 *            sampleCount, eventStartsMs, truncated, reason}}
 *
 * `periodMs` is null — never a guess — whenever there are too few events to say
 * anything, and `reason` names what was missing. Two events produce ONE gap, which is
 * a period with no corroboration; reporting it would be the exact failure mode this
 * function was specified to avoid.
 */
export function detectPeriodicity(startsMs, {
  clusterMs = CLUSTER_MS,
  minGaps = MIN_GAPS,
  toleranceRatio = TOLERANCE_RATIO,
  maxReported = 64,
} = {}) {
  const sampleCount = Array.isArray(startsMs)
    ? startsMs.filter((n) => typeof n === 'number' && Number.isFinite(n)).length
    : 0;
  const events = clusterStarts(startsMs, { clusterMs });
  const empty = {
    periodMs: null, gapsMs: [], gapMadMs: null, dispersionRatio: null, regular: null,
    eventCount: events.length, sampleCount,
    eventStartsMs: events.slice(0, maxReported), truncated: events.length > maxReported,
    reason: null,
  };
  if (events.length === 0) {
    // Not a pass. It means "no block above the floor happened inside the window" —
    // which rules out nothing slower than the window and nothing smaller than the floor.
    return { ...empty, reason: 'no stalls above the floor — nothing to time' };
  }
  const gaps = [];
  for (let i = 1; i < events.length; i++) gaps.push(events[i] - events[i - 1]);
  if (gaps.length < minGaps) {
    return {
      ...empty,
      gapsMs: gaps.slice(0, maxReported),
      reason: `only ${events.length} stall event(s) — ${minGaps + 1} are needed before a period may be named (${gaps.length} gap(s) cannot corroborate each other)`,
    };
  }
  const periodMs = median(gaps);
  const mad = medianAbsoluteDeviation(gaps);
  // A zero or negative median gap is not a period; refuse rather than divide by it.
  if (periodMs === null || periodMs <= 0) {
    return { ...empty, gapsMs: gaps.slice(0, maxReported), reason: 'the gaps between stalls have no positive median' };
  }
  const dispersionRatio = mad === null ? null : mad / periodMs;
  return {
    periodMs: Math.round(periodMs),
    gapsMs: gaps.slice(0, maxReported).map((g) => Math.round(g)),
    gapMadMs: mad === null ? null : Math.round(mad),
    dispersionRatio: round2(dispersionRatio),
    // `regular` is the honest half of the answer: a median gap always exists once
    // there are enough gaps, but only a TIGHT set of gaps is a cadence. A reader
    // seeing periodMs=10000 with regular=false is looking at coincidence, not a timer.
    regular: dispersionRatio === null ? null : dispersionRatio <= toleranceRatio,
    eventCount: events.length,
    sampleCount,
    eventStartsMs: events.slice(0, maxReported).map((s) => Math.round(s)),
    truncated: events.length > maxReported || gaps.length > maxReported,
    reason: null,
  };
}

/**
 * One word for "did this session count stall on a timer", across the repeats.
 * Null when NO repeat gathered enough events to have an opinion — absence of a verdict,
 * never a clean bill of health.
 */
export function summarizeCadence(periodicities) {
  const decided = (periodicities || []).filter((p) => p && p.periodMs !== null);
  if (decided.length === 0) return null;
  const regular = decided.filter((p) => p.regular === true).length;
  if (regular * 2 > decided.length) return 'periodic';
  if (regular === 0) return 'irregular';
  // Half the repeats saw a cadence and half did not. That is a real state of the
  // evidence and gets its own word rather than being rounded to whichever side is
  // more interesting.
  return 'mixed';
}

/**
 * The marginal cost of ONE more open session — the number that answers "why does it
 * get worse the more conversations I have open?".
 *
 * Slope between the lowest and highest session count that produced a finite value:
 * `(value at highN - value at lowN) / (highN - lowN)`.
 *
 * @param {Record<string|number, object>} medianByCount N -> that N's MEDIAN run object
 * @param {string} key which NUMERIC_KEY to take the slope of
 * @returns {{key, lowN, highN, spanN, lowValue, highValue, perSession}|null}
 *
 * Null — never 0 — when fewer than two distinct session counts produced a finite
 * value. A slope needs two points; inventing one from a single point would report "0
 * cost per session", which is an affirmative claim of innocence drawn from no evidence.
 */
export function perSessionTax(medianByCount, key = 'ipcTotalStallMs') {
  const byN = new Map();
  for (const [n, med] of Object.entries(medianByCount || {})) {
    const count = Number(n);
    const value = med ? med[key] : undefined;
    if (!Number.isFinite(count)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    byN.set(count, value);
  }
  if (byN.size < 2) return null;
  const counts = [...byN.keys()].sort((a, b) => a - b);
  const lowN = counts[0];
  const highN = counts[counts.length - 1];
  if (highN === lowN) return null;
  const lowValue = byN.get(lowN);
  const highValue = byN.get(highN);
  return {
    key, lowN, highN, spanN: highN - lowN, lowValue, highValue,
    perSession: round2((highValue - lowValue) / (highN - lowN)),
  };
}

/** perSessionTax for each of `keys`; a key with too little data maps to null. */
export function perSessionTaxTable(medianByCount, keys = TAX_KEYS) {
  return Object.fromEntries(keys.map((k) => [k, perSessionTax(medianByCount, k)]));
}

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

/**
 * Node-side backstop around a CDP evaluate. cdp.mjs never times a request out, so a
 * renderer that died mid-window would hang the rig forever with no error. The stranded
 * promise gets a no-op catch so it cannot resurface as an unhandled rejection.
 */
function withTimeout(promise, ms, what) {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${what} did not answer within ${ms}ms (renderer hung or crashed)`)), ms);
  });
  promise.catch(() => {});
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
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
 * Waits for one freshly-resumed session to finish initialising. The overlay text is
 * `Initializing session...` (App.tsx:2871).
 *
 * Two phases, copied in spirit from scenario-workload's private helper (it is not
 * exported, and that file is off-limits this session): a bare "wait until the text is
 * absent" is satisfied INSTANTLY if the overlay has not mounted yet, which measures
 * nothing and lets the next resume pile on top of an unready one. Six piled-up resumes
 * would still be draining when the window opened, and this scenario's entire premise
 * is that the window contains no startup work.
 *
 * Returns `{ appeared, ready }` rather than throwing: a session that never reports
 * ready is a warning about what we could not confirm, not a reason to discard the run.
 */
async function waitForSessionReady(cdp, { appearMs = 1500, clearMs = 30000, pollMs = 25 } = {}) {
  const gone = `!document.body.innerText.includes('Initializing session')`;
  const read = () => withTimeout(cdp.evaluate(gone), Math.max(5000, clearMs), 'session-ready probe');
  const t0 = Date.now();
  let appeared = false;
  while (Date.now() - t0 < appearMs) {
    if (!(await read())) { appeared = true; break; }
    if (pollMs > 0) await sleep(pollMs);
  }
  const deadline = Date.now() + clearMs;
  let ready = await read();
  while (!ready && Date.now() < deadline) {
    if (pollMs > 0) await sleep(pollMs);
    ready = await read();
  }
  return { appeared, ready: Boolean(ready) };
}

/**
 * Pick the transcript the held-open sessions resume from.
 * Prefers `medium`; falls back to whatever the fixture has and NAMES the fallback,
 * because the per-session cost scales with session size and a `small` fallback would
 * silently produce a much smaller tax that reads as good news.
 */
export function pickTranscript(fixture, preferred = PREFERRED_SIZE) {
  const all = fixture?.transcripts ?? {};
  const names = Object.keys(all);
  if (all[preferred]) return { size: preferred, transcript: all[preferred], warning: null };
  if (names.length === 0) {
    // Deliberately fatal. Creating fresh sessions instead would put the per-session
    // term back at zero — the exact blindness this scenario was built to remove — and
    // would do it silently, producing confident numbers about nothing.
    throw new Error(
      'scenario-idle: the fixture exposes no pre-built transcripts, so there is nothing to RESUME. ' +
      'Fresh sessions are empty, and an empty session has none of the per-session state this scenario measures; ' +
      'refusing to report idle numbers that cannot contain the effect.',
    );
  }
  const size = names[0];
  return {
    size,
    transcript: all[size],
    warning:
      `fixture has no '${preferred}' transcript — fell back to '${size}' (${all[size].turns} turns). ` +
      'The per-session cost scales with session size, so these numbers are NOT comparable to a ' +
      `'${preferred}'-transcript run.`,
  };
}

/**
 * What this scenario actually measures — the anti-recurrence guard every scenario in
 * this rig now carries (see scenario-workload.mjs MEASURES for the convention).
 *
 * It matters more here than anywhere else, because THIS scenario exists because of one
 * of the failures that convention was invented for: `idle` was sampled with zero
 * sessions open, so a per-session cost read as exactly zero and nothing failed loudly.
 * The `blindTo` list below is therefore not boilerplate — it is the list of ways this
 * replacement can produce a clean number that means less than it looks like it means.
 */
export const MEASURES = {
  scenario: 'idle-sessions',
  question: 'With real conversations open and the user doing NOTHING, does the app block — and does it block on a timer?',
  configuration: [
    `${SESSION_COUNTS.join(' and ')} sessions held open (two counts, so the per-session slope is measurable)`,
    `every session RESUMED, never fresh — a fresh session is empty, and the cost being hunted scales with session state`,
    `each session resumes its OWN stored session, all cloned byte-for-byte from the '${PREFERRED_SIZE}' fixture transcript: identical content so the only variable is the count, distinct ids because the app runs a second writer when two sessions share one`,
    `${SETTLE_MS}ms of settle after the resumes, so resume work is not counted as idle work`,
    `then ${WINDOW_MS}ms of literally nothing: no clicks, no evaluates, no polling`,
    `the IPC stall probe pings every ${PING_EVERY_MS}ms — 4x finer than the rest of the rig, so a ~40ms block cannot fall between pings`,
  ],
  clocks: {
    ipcMaxMs: 'worst single IPC round trip during the still window — a block is felt as its worst case, never its average',
    ipcTotalStallMs: 'sum of round trips beyond the ping interval; raw unresponsiveness while nobody was using the app',
    periodicStallMs: 'median gap between CLUSTERED stall events — a cadence, or null when too few events to say',
    'perSessionTax.*': '(value at the highest session count - value at the lowest) / the difference in counts',
    cpuPct: 'CONTEXT ONLY. A throughput metric: a 40ms block every 10s is 0.27% and rounds to nothing.',
    pssMb: 'CONTEXT ONLY. A poll re-reading files it already cached moves memory not at all.',
  },
  blindTo: [
    `anything periodic SLOWER than the window (${WINDOW_MS}ms by default): an hourly scan or a daily cleanup fires zero times and is invisible`,
    'blocks smaller than the per-run stallFloorMs (~15ms on a quiet machine) — they are below the probe\'s own noise',
    'background work that needs a real user account, real network, or real model traffic to start',
    'work on threads that never touch IPC or the renderer main thread (a worker doing pure computation)',
    'session counts other than the two measured — the tax is a straight line between two points, and real costs need not be linear',
  ],
};

// ---------------------------------------------------------------------------
// Distinct transcripts, identical content
// ---------------------------------------------------------------------------
//
// WHY N SESSIONS MAY NOT SHARE ONE TRANSCRIPT, even though it would be simpler.
// `resumeSessionId` names one specific STORED session, and the app has no dedupe at
// create time (verified 2026-08-27 in the desktop source): a second Claude Code create
// with the same resumeSessionId mints a second desktop id, spawns a second PTY worker,
// and runs a second `claude --resume <same id>` against the same .jsonl.
// conversations/takeover.ts:73 names that state exactly — "a silent second writer on
// the same transcript" — and App.tsx's force-takeover toast concedes "the user is about
// to have two writers on one transcript". It is a known-pathological configuration the
// app has cleanup code for, not a supported one.
//
// Measuring idle cost inside a configuration the app considers broken would produce
// numbers nobody can act on. So each session gets its OWN stored session, with
// byte-identical content: the variable under test stays the session COUNT and nothing
// else. Every file written lands in the fixture's own project directory — the same
// directory the fixture built the source transcript in — and is removed on the way out.

/** Deterministic id for the i-th clone. Deterministic so a crashed run leaves the SAME
 *  six files the next run reuses, rather than a growing pile of 25 MB orphans. */
export function cloneSessionId(sourceSessionId, i) {
  return stableUuid(`perf-lab-idle-clone:${sourceSessionId}:${i}`);
}

/**
 * Write `count` transcripts with identical content and distinct session ids, beside
 * the source. Returns `[{ sessionId, path, created }]`.
 *
 * The id is rewritten INSIDE the file, not just in its name: fixture.mjs:223-226 notes
 * that "the transcripts embed their own sessionId on every line", so a plain byte copy
 * under a new filename would produce a transcript that disagrees with itself.
 */
export function materializeClones(sourcePath, sourceSessionId, count) {
  if (!sourcePath) {
    throw new Error('scenario-idle: the fixture transcript has no `path`, so distinct per-session transcripts cannot be built');
  }
  const dir = dirname(sourcePath);
  const out = [];
  let src = null;
  for (let i = 0; i < count; i++) {
    const sessionId = cloneSessionId(sourceSessionId, i);
    const path = join(dir, `${sessionId}.jsonl`);
    let created = false;
    if (!existsSync(path)) {
      // Read once, reuse for every clone. The source is tens of MB, and re-reading it
      // per clone would be the scenario's own I/O showing up in the page cache right
      // before a measurement about file reads.
      if (src === null) src = readFileSync(sourcePath, 'utf8');
      writeFileSync(path, src.split(sourceSessionId).join(sessionId));
      created = true;
    }
    out.push({ sessionId, path, created });
  }
  return out;
}

/** Remove the clones, leaving the fixture exactly as it was found. Never the source. */
export function removeClones(clones, sourcePath) {
  for (const c of clones || []) {
    if (!c || !c.path || c.path === sourcePath) continue;
    rmSync(c.path, { force: true });
  }
}

/**
 * @param {{cdp: {evaluate(expr: string): Promise<any>}, family?: () => number[]}} app
 * @param {{transcripts: Record<string, {sessionId: string, slug: string, turns: number}>, projects: {alpha: string}}} fixture
 *
 * Returns:
 * ```
 * {
 *   byCount: { '<N>': { sessionCount, runs, median, cadence, periodicities, warnings } },
 *   perSessionTax: Record<metric, {perSession, lowN, highN, ...}|null>,
 *   cadencesCoveredMs, coverageNote, windowMs, repeats, sessionCounts,
 *   transcriptSize, pingEveryMs, warnings,
 * }
 * ```
 */
export async function runIdleScenario(app, fixture, {
  sessionCounts = SESSION_COUNTS,
  windowMs = WINDOW_MS,
  repeats = 2,
  settleMs = SETTLE_MS,
  everyMs = PING_EVERY_MS,
  clusterMs = CLUSTER_MS,
  minGaps = MIN_GAPS,
  toleranceRatio = TOLERANCE_RATIO,
  // Exposed so the unit tests can drive the loop without real sleeps. Nothing in the
  // rig should change them: they are part of the measurement, not of its plumbing.
  appearMs = 1500,
  readyMs = 60000,
  teardownSettleMs = 500,
  preferredSize = PREFERRED_SIZE,
  cloneTranscripts = true,
} = {}) {
  const picked = pickTranscript(fixture, preferredSize);
  const scenarioWarnings = [];
  if (picked.warning) scenarioWarnings.push(picked.warning);

  // One set of clones for the whole scenario, sized to the largest session count and
  // reused by every count and repeat: building them per repeat would write hundreds of
  // megabytes and warm the page cache immediately before a measurement about file reads.
  const maxSessions = sessionCounts.length ? Math.max(...sessionCounts) : 0;
  let clones = [];
  if (cloneTranscripts && maxSessions > 0) {
    try {
      clones = materializeClones(picked.transcript.path, picked.transcript.sessionId, maxSessions);
    } catch (e) {
      // The real error, then the consequence — never a silent downgrade.
      scenarioWarnings.push(
        `could not build one transcript per session (${e && e.message ? e.message : String(e)}); ` +
        'every session resumed the SAME stored session id instead. The app does not dedupe that: ' +
        'it runs a second writer against the same transcript (conversations/takeover.ts:73), so the ' +
        'numbers below come from a configuration the app treats as broken.',
      );
      clones = [];
    }
  }
  if (!clones.length && maxSessions > 1) {
    scenarioWarnings.push(
      `per-session transcripts are OFF, so all ${maxSessions} sessions resume one id — two writers on ` +
      'one transcript. Read the per-session tax as suspect: it was measured in an unsupported configuration.',
    );
  }

  const byCount = {};
  try {
    for (const n of sessionCounts) {
      const runs = [];
      for (let rep = 0; rep < repeats; rep++) {
        runs.push(await measureOnce(app, fixture, picked, clones, n, rep, {
          windowMs, settleMs, everyMs, clusterMs, minGaps, toleranceRatio,
          appearMs, readyMs, teardownSettleMs,
        }));
      }
      const periodicities = runs.map((r) => r.periodicity);
      byCount[String(n)] = {
        sessionCount: n,
        runs,
        median: medianRun(runs),
        // The headline verdict, taken across repeats rather than from the luckiest one.
        cadence: summarizeCadence(periodicities),
        periodicities,
        warnings: [...new Set(runs.flatMap((r) => r.warnings))],
      };
    }
  } finally {
    // `finally`: a scenario that throws must still leave the fixture as it found it,
    // or the next run inherits six 25 MB transcripts that the app will list as sessions.
    removeClones(clones, picked.transcript.path);
  }

  const medianByCount = Object.fromEntries(
    Object.entries(byCount).map(([n, g]) => [n, g.median]),
  );
  const tax = perSessionTaxTable(medianByCount);
  if (Object.values(tax).every((t) => t === null)) {
    scenarioWarnings.push(
      `no per-session tax could be computed: ${Object.keys(byCount).length} session count(s) produced a finite value, ` +
      'and a slope needs two. The "cost per open session" question is UNANSWERED, not answered with zero.',
    );
  }

  return {
    byCount,
    perSessionTax: tax,
    // The window's reach, carried WITH the numbers so it cannot be separated from them.
    cadencesCoveredMs: windowMs,
    coverageNote:
      `This run watched a still app for ${windowMs}ms per repeat. A quiet result means ` +
      `"nothing periodic faster than ${windowMs}ms fired during the window" and nothing more — ` +
      `background work on a slower timer (an hourly scan, a daily cleanup) fires zero times in ` +
      `${windowMs}ms and is invisible here. Blocks smaller than the per-run stallFloorMs are also ` +
      'invisible. A clean result is NOT a statement that the app is idle-clean.',
    windowMs,
    repeats,
    sessionCounts: [...sessionCounts],
    transcriptSize: picked.size,
    pingEveryMs: everyMs,
    warnings: [...new Set([...scenarioWarnings, ...Object.values(byCount).flatMap((g) => g.warnings)])],
  };
}

async function measureOnce(app, fixture, picked, clones, sessionCount, rep, cfg) {
  const { windowMs, settleMs, everyMs, clusterMs, minGaps, toleranceRatio, appearMs, readyMs, teardownSettleMs } = cfg;
  const cdp = app.cdp;
  const warnings = [];
  const label = `n=${sessionCount}#${rep}`;
  const ids = [];
  let probesInstalled = false;

  try {
    // ---- 1. Hold N REAL sessions open ---------------------------------------
    // Each session resumes its OWN stored session, and every one of those holds
    // byte-identical content (see materializeClones). Identical content on purpose: the
    // variable under test is the session COUNT, and varying content per session would
    // blend a size effect into the slope perSessionTax reports. Distinct ids on purpose:
    // see the clone block's header for what the app does when two sessions share one.
    for (let i = 0; i < sessionCount; i++) {
      const resumeId = clones[i]?.sessionId ?? picked.transcript.sessionId;
      const created = await withTimeout(cdp.evaluate(`(async () => {
        try {
          const s = await window.claude.session.create({
            name: ${JSON.stringify(`perf-idle-${sessionCount}-${rep}-${i}`)},
            cwd: ${JSON.stringify(fixture.projects.alpha)},
            skipPermissions: true,
            resumeSessionId: ${JSON.stringify(resumeId)},
          });
          if (!s || !s.id) return { ok: false, error: 'session.create resolved without an id: ' + JSON.stringify(s) };
          return { ok: true, id: s.id };
        } catch (e) {
          return { ok: false, error: (e && e.message) ? e.message : String(e) };
        }
      })()`), 180000, `session.create #${i} (${label})`);
      if (!created || created.ok !== true) {
        // The app's own words. A guessed cause here would send the next session down
        // the wrong path entirely.
        throw new Error(
          `session.create #${i} failed while resuming '${picked.size}' ` +
          `(resumeSessionId=${resumeId}, cwd=${fixture.projects.alpha}): ${created?.error ?? JSON.stringify(created)}`,
        );
      }
      ids.push(created.id);
      const r = await waitForSessionReady(cdp, { appearMs, clearMs: readyMs });
      if (!r.ready) {
        warnings.push(`${label}: session #${i} still showed "Initializing session" after ${readyMs}ms — its resume work may still be draining INSIDE the measurement window, inflating every stall number below`);
      }
    }

    // ---- 2. Let the resume work drain ---------------------------------------
    // Anything still running from step 1 is startup cost, not idle cost. Measuring it
    // here would put a one-off multi-second resume stall into a window whose entire
    // premise is that it contains only self-inflicted background work.
    if (settleMs > 0) await sleep(settleMs);

    // ---- 3. Arm both probes -------------------------------------------------
    // Both, always. The IPC probe alone cannot tell a blocked main process from a
    // blocked renderer, and defaulting to "main process" would be a fabricated
    // indictment of exactly the thing this scenario suspects.
    await withTimeout(installIpcStallProbe(cdp, { everyMs }), 30000, `installIpcStallProbe (${label})`);
    const armed = await withTimeout(installProbe(cdp), 30000, `installProbe (${label})`);
    probesInstalled = true;
    if (armed && armed.longtaskSupported === false) {
      warnings.push(`${label}: the renderer long-task observer failed to attach — every renderer* metric is null and NO stall is attributed to either thread. This is missing data, not an exoneration of the renderer`);
    }

    // ---- 4. Do nothing at all for windowMs ----------------------------------
    // No clicks, no evaluates, NO POLLING. This is the measurement.
    //
    // WHY there is deliberately no poll loop here, unlike scenario-replay-stall: every
    // CDP evaluate is itself an IPC round trip plus a renderer task, i.e. it is load —
    // and load is the one thing this window must not contain. In replay-stall a poll
    // was harmless (indeed useful) because the app was under a huge deliberate load
    // already; here the whole claim is "the user did nothing", and a rig that pinged
    // the renderer twice a second while claiming the app was idle would be measuring
    // its own instrument. The probes run INSIDE the page on their own timers and need
    // no attention from Node until the window closes.
    //
    // The CPU snapshot brackets exactly this window, so cpuPct is CPU-while-idle by
    // construction rather than by hope. It reads /proc from Node and touches the app
    // not at all.
    const pids = typeof app.family === 'function' ? app.family() : null;
    if (!pids) {
      warnings.push(`${label}: app.family() is unavailable, so cpuPct and pssMb were NOT measured (reported as null, not as 0)`);
    }
    const cpuBefore = pids ? cpuSnapshot(pids) : null;
    const startedAt = Date.now();
    await sleep(windowMs);
    const elapsedMs = Date.now() - startedAt;

    const cpu = cpuBefore ? cpuPercent(cpuBefore, cpuSnapshot(pids), Math.max(0.001, elapsedMs / 1000)) : null;
    // Re-read the family for PSS: a process may have come or gone during the window,
    // and pssMb over a stale pid list silently under-counts.
    const livePids = typeof app.family === 'function' ? app.family() : null;
    const pss = livePids ? pssMb(livePids) : null;

    // ---- 5. Freeze the probes, then read them -------------------------------
    // Stop first: readProbe derives observedMs from stoppedAt, and a still-running rAF
    // loop would keep burning a callback per frame through everything that follows.
    await withTimeout(stopIpcStallProbe(cdp), 30000, `stopIpcStallProbe (${label})`);
    await withTimeout(stopProbe(cdp), 30000, `stopProbe (${label})`);
    probesInstalled = false;

    const ipc = await withTimeout(readIpcStallProbe(cdp), 60000, `readIpcStallProbe (${label})`);
    const rend = await withTimeout(readProbe(cdp), 60000, `readProbe (${label})`);
    // Raw samples + raw long tasks + BOTH t0 values in one round trip. The summary
    // readers above expose only the five worst stalls and only totals — neither is
    // enough to time a cadence, and neither exposes the other probe's time origin,
    // which is what puts the two probes on one timeline at all. Both t0 values are
    // `performance.now()` readings taken inside the page at install time, so reading
    // them now is identical to having recorded them then, minus a round trip.
    const raw = await withTimeout(cdp.evaluate(`(() => { /* perf-lab: idle raw probe read */
      const s = window.__ipcStall, p = window.__perfProbe;
      if (!s) throw new Error('scenario-idle: window.__ipcStall vanished between install and read — the page reloaded mid-window.');
      if (!p) throw new Error('scenario-idle: window.__perfProbe vanished between install and read — the page reloaded mid-window.');
      return {
        ipcT0: s.t0, everyMs: s.everyMs, samples: s.samples,
        probeT0: p.t0, longtaskSupported: p.longtaskSupported,
        longtasks: p.log.filter((e) => e[0] === 'longtask').map((e) => [e[1], e[2]]),
      };
    })()`), 60000, `idle raw probe read (${label})`);

    const samples = Array.isArray(raw.samples) ? raw.samples : [];
    const roundTrips = samples.map((s) => s[1]);
    // `measured` gates every derived number. Zero pings means the probe never completed
    // a single round trip — we measured NOTHING — and a 0 there would read as "perfectly
    // responsive", the exact inversion of the truth.
    const measured = samples.length > 0;

    const floor = stallFloor(roundTrips);
    const stallStarts = floor === null ? [] : samples.filter(([, rt]) => rt > floor).map(([at]) => at);
    const periodicity = detectPeriodicity(stallStarts, { clusterMs, minGaps, toleranceRatio });

    // Attribution, reused wholesale from replay-stall. Passing `null` for longtasks
    // when the observer never attached is what makes it refuse to blame anyone.
    const attr = attributeStalls({
      samples,
      everyMs: raw.everyMs,
      longtasks: raw.longtaskSupported ? raw.longtasks : null,
      ipcT0: raw.ipcT0,
      probeT0: raw.probeT0,
    });

    // ---- 6. Say plainly what was NOT measured -------------------------------
    if (!measured) {
      warnings.push(`${label}: the IPC stall probe completed 0 pings — NO responsiveness was measured at all, so every ipc*, stall* and periodic* metric is null. This is a rig failure, not a quiet app`);
    } else {
      // Fewer pings than the window should have produced means the probe was itself
      // starved, so the totals are a FLOOR on the real cost rather than the cost.
      const expected = everyMs > 0 ? Math.floor(elapsedMs / everyMs) : 0;
      if (expected > 0 && samples.length < expected * 0.5) {
        warnings.push(`${label}: only ${samples.length} of an expected ~${expected} pings completed in ${elapsedMs}ms — the probe was starved, so the stall totals are a FLOOR, not the full cost`);
      }
      if (ipc.missedTicks > ipc.pings) {
        warnings.push(`${label}: the probe skipped ${ipc.missedTicks} ticks against ${ipc.pings} completed pings — the main process was busy more often than it was sampled, so the stall totals are a FLOOR, not the full cost`);
      }
    }
    if (measured && periodicity.eventCount === 0) {
      // Zero stalls is a RESULT, and this states its exact reach rather than letting it
      // be read as a pass.
      warnings.push(`${label}: zero stalls above the ${Math.round(floor)}ms floor in ${elapsedMs}ms. That rules out ONLY blocks larger than ${Math.round(floor)}ms recurring faster than ${elapsedMs}ms; smaller blocks and slower cadences were not measured`);
    } else if (measured && periodicity.periodMs === null) {
      warnings.push(`${label}: periodicStallMs is null — ${periodicity.reason}`);
    }
    if (rend.longtaskSupported === false) {
      warnings.push(`${label}: renderer long-task data is absent, so rendererLongtask*, rendererStall* and mainProcessStall* are all null — nothing here says the main process was or was not at fault`);
    }
    if (rend.errors && rend.errors.length) {
      warnings.push(`${label}: renderer probe reported ${rend.errors.join('; ')}`);
    }
    if (ids.length !== sessionCount) {
      warnings.push(`${label}: only ${ids.length} of ${sessionCount} sessions were open during the window — the per-session slope is computed against sessionCount, so this run would skew it`);
    }

    const rendererAlive = rend.longtaskSupported !== false;

    return {
      // --- headline latency ---
      ipcMedianMs: measured ? ipc.medianMs : null,
      ipcP95Ms: measured ? ipc.p95Ms : null,
      ipcMaxMs: measured ? ipc.maxMs : null,
      ipcTotalStallMs: measured ? ipc.totalStallMs : null,
      ipcOver100ms: measured ? ipc.over100ms : null,
      ipcOver250ms: measured ? ipc.over250ms : null,
      ipcOver1000ms: measured ? ipc.over1000ms : null,
      // Always the real figure: 0 pings is the honest answer to "how many pings?", and
      // it is what makes the nulls above legible instead of mysterious.
      ipcPings: ipc.pings,
      ipcMissedTicks: ipc.missedTicks,
      ipcMaxPingGapMs: attr.ipcMaxPingGapMs,
      // --- cadence ---
      stallFloorMs: floor === null ? null : Math.round(floor),
      stallSampleCount: measured ? periodicity.sampleCount : null,
      stallEventCount: measured ? periodicity.eventCount : null,
      periodicStallMs: periodicity.periodMs,
      periodicGapMadMs: periodicity.gapMadMs,
      periodicDispersionRatio: periodicity.dispersionRatio,
      periodicity,
      // --- attribution (null unless the renderer probe could exonerate the renderer) ---
      mainProcessStallMs: attr.mainProcessStallMs,
      mainProcessStallMaxMs: attr.mainProcessStallMaxMs,
      rendererStallMs: attr.rendererStallMs,
      rendererStallMaxMs: attr.rendererStallMaxMs,
      blame: summarizeBlame(attr.mainProcessStallMs, attr.rendererStallMs, { floorMs: floor ?? everyMs }),
      worstStalls: attr.worst,
      // --- renderer detail ---
      rendererLongtaskCount: rendererAlive ? rend.longtaskCount : null,
      rendererLongtaskTotalMs: rendererAlive ? rend.longtaskTotalMs : null,
      rendererLongtaskMaxMs: rendererAlive ? rend.longtaskMaxMs : null,
      longtaskSupported: rend.longtaskSupported,
      // --- CONTEXT ONLY (see NUMERIC_KEYS) ---
      cpuPct: cpu ? round1(cpu.totalPct) : null,
      pssMb: pss ? pss.totalMb : null,
      pssBreakdown: pss ? pss.perPid : null,
      // --- run shape ---
      sessionCount: ids.length,
      windowMs,
      elapsedMs,
      // How far apart the two probes' clocks are. Reported so a reader can line a
      // stall start up against a long-task start by hand and check the attribution.
      probeSkewMs: Math.round(raw.probeT0 - raw.ipcT0),
      transcriptSize: picked.size,
      resumed: true,
      warnings,
    };
  } finally {
    // ---- 7. Cleanup — best effort, never silent -----------------------------
    // `finally`, not a trailing block: if the read above throws, the probes must still
    // be disarmed and the sessions still destroyed, or the NEXT repeat inherits a
    // running rAF loop and six live conversations, and every number it produces is
    // contaminated. Failures become warnings rather than throwing, so a stubborn
    // session cannot discard measurements that were already taken — while still
    // explaining any later repeat that behaves oddly.
    if (probesInstalled) {
      await quietly(() => stopIpcStallProbe(cdp), warnings, `${label}: stopIpcStallProbe`);
      await quietly(() => stopProbe(cdp), warnings, `${label}: stopProbe`);
    }
    for (const id of ids) {
      const d = await quietly(() => cdp.evaluate(`(async () => {
        try { await window.claude.session.destroy(${JSON.stringify(id)}); return { ok: true }; }
        catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
      })()`), warnings, `${label}: session.destroy(${id})`);
      if (d && d.ok === false) warnings.push(`${label}: session.destroy(${id}) failed: ${d.error}`);
    }
    if (ids.length && teardownSettleMs > 0) await sleep(teardownSettleMs);
  }
}
