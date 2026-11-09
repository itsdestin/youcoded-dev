// scripts/perf-lab/scenario-pathlist-stream.mjs — an ASSISTANT reply that lists many file paths, streaming in.
//
// WHY THIS SCENARIO EXISTS
// Lane F ("path-list") measured a FINISHED USER message of N paths: 1k paths 0.13 s of renderer long task, 10k 1.2 s, 20k 3.9 s.
// It did not measure the other way a long path list reaches the screen: the assistant answering with a `find`-style listing, one
// small piece at a time. That path differs in three ways that could each freeze the window:
//   * the reply is re-parsed as markdown and re-scanned for paths (markdown-linkify -> detectFilepaths, whose overlap check is
//     quadratic in the number of matches) on every chunk that grows, not once;
//   * inside a fenced code block every path becomes a FilepathToken (tooltip + button + icon + two hooks) in its quieter 'inline'
//     variant, so a code block of N lines becomes N chips;
//   * the user is probably typing the next message while it streams.
// This file builds the replies, shapes the evidence and classifies each rung. It is pure orchestration + report shaping: the app,
// the boot and the fake model server arrive through `deps`/arguments, so it is unit-tested offline. The real wiring is
// pathlist-stream-run.mjs (a standalone entry that imports the lab's own helpers — it edits no existing lab file).
//
// EVERY RUNG ends as exactly one of  measured | slow | failed:<reason>  (same vocabulary as lane F). A reading that was not taken is
// null with a reason, never 0.
import { splitDeltas } from './fake-provider.mjs';
import { WORKLOAD_THRESHOLDS } from './workload-lane.mjs';

export const PATHLIST_SCENARIO = Object.freeze({ revision: 1, lane: 'pathlist-stream', exploratory: true });

/** Paths per reply. 100 is a small `ls`, 5000 a whole-repo `find`. */
export const PATHLIST_SIZES = Object.freeze([100, 500, 2000, 5000]);
/** The no-path control is only needed where the cost is big enough to need explaining. */
export const CONTROL_SIZES = Object.freeze([2000, 5000]);
export const VARIANTS = Object.freeze(['code', 'prose', 'control']);
// WHY a separate list: `proseControl` (the bullet-list shape with the paths defaced, so no chips) separates list-rendering cost from chip
// cost in the prose rungs. It is a follow-up diagnostic, so the default ladder (VARIANTS) is unchanged and it is opt-in via --only.
export const ALL_VARIANTS = Object.freeze([...VARIANTS, 'proseControl']);
/** Variants whose paths are defaced: the page must show zero chips. */
export const NO_CHIP_VARIANTS = Object.freeze(['control', 'proseControl']);
const isNoChip = (v) => NO_CHIP_VARIANTS.includes(v);

/** A cloud model's typical rate (deltas = tokens-ish per second). */
export const BASE_PER_SEC = 150;
/**
 * WHY a ceiling on stream length: a real 5000-path listing is ~55,000 tokens, which a cloud model takes ~6 minutes to write. Six of those
 * per rung per side would run for days. Rungs whose natural length at BASE_PER_SEC would exceed this are streamed FASTER so the stream
 * lasts MAX_STREAM_MS; the row records the rate actually used, and the report says so. A faster stream is a harsher test (more content
 * per frame), never a gentler one, so a rung that is smooth here is smooth at cloud speed.
 */
export const MAX_STREAM_MS = 45_000;
/** Typing probe: one inert key every TYPING_EVERY_MS. 240 keys fit the page-side receipt cap (256). */
export const TYPING_EVERY_MS = 250;
export const TYPING_MAX_KEYS = 240;
export const TYPING_MAX_OUTSTANDING = 16;
/** How long after the server finished the page may take to show the final state before the rung is called failed:settle-timeout. */
export const SETTLE_TIMEOUT_MS = 90_000;
/** Per-rung external watchdog = planned stream + this. PSS cap is lane F's. */
export const RUNG_GRACE_MS = SETTLE_TIMEOUT_MS + 60_000;
export const PSS_CAP_MB = 3072;
/** Named thresholds, borrowed from lane F so both are judged by one line. endToPaintMs reuses lane F's 1 s "waiting becomes noticeable". */
export const PATHLIST_THRESHOLDS = Object.freeze({
  rendererMaxDelayMs: WORKLOAD_THRESHOLDS.rendererMaxDelayMs,
  inputLatencyMs: WORKLOAD_THRESHOLDS.inputLatencyMs,
  endToPaintMs: WORKLOAD_THRESHOLDS.operationMs,
});

// ── the replies ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The i-th path: realistic `find` output, unique, ends in a real extension so detectFilepaths pills it. */
export const pathAt = (i) => `/home/user/project/src/dir${i % 25}/file${i}.ts`;
/** Same length, same punctuation density, NO path: no `/` anywhere (PATH_RE needs a separator) and no leading `/` (spaced-line rule). */
export const decoyAt = (i) => pathAt(i).replaceAll('/', '_');

const INTRO = 'Here are the files I found in the project:';
const OUTRO = 'That is every file I found.';

/** Markdown for one rung. `code` = one fenced block of paths; `prose` = a bullet list; `control` = the code shape with decoys. */
export function replyText(variant, n) {
  if (!ALL_VARIANTS.includes(variant)) throw new Error(`unknown variant ${variant}`);
  if (!Number.isInteger(n) || n < 1) throw new Error('n must be a whole number >= 1');
  const lines = Array.from({ length: n }, (_, i) => (isNoChip(variant) ? decoyAt(i) : pathAt(i)));
  if (variant === 'prose' || variant === 'proseControl') return `${INTRO}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\n${OUTRO}`;
  return `${INTRO}\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n\n${OUTRO}`;
}

/**
 * How many deltas the fake provider's splitDeltas() makes from `text` with nothing truncated or padded. Mirrors its piece loop exactly
 * (a test pins splitDeltas(text, count).join('') === text) so the stream carries the whole reply and nothing else.
 */
export function naturalDeltaCount(text) {
  let count = 0;
  for (const m of text.matchAll(/\s*\S+|\s+$/g)) {
    const tok = m[0];
    if (tok.length <= 6) { count++; continue; }
    const lead = tok.match(/^\s*/)[0];
    count += Math.ceil((tok.length - lead.length) / 4);
  }
  return count;
}

/** Deltas per second for a rung: cloud speed, raised only as far as needed to keep the stream under MAX_STREAM_MS. */
export function ratePerSec(deltas, { base = BASE_PER_SEC, maxMs = MAX_STREAM_MS } = {}) {
  return Math.max(base, Math.ceil(deltas / (maxMs / 1000)));
}

export function planRung(variant, n) {
  const text = replyText(variant, n);
  const deltas = naturalDeltaCount(text);
  const perSec = ratePerSec(deltas);
  return {
    id: `pathlist-${variant}-${n}`, variant, n, text, deltas, perSec,
    streamMs: Math.round(deltas / perSec * 1000),
    atCloudSpeed: perSec === BASE_PER_SEC,
    // What the page must show for the rung to count: every path as a chip (none for the control), the last one by name, the outro.
    expectedChips: isNoChip(variant) ? 0 : n,
    lastPath: isNoChip(variant) ? null : pathAt(n - 1),
    lastDecoy: isNoChip(variant) ? decoyAt(n - 1) : null,
    outro: OUTRO,
  };
}

/** The full ladder in run order: code, prose, then the control, small to large inside each. */
export function planRungs({ sizes = PATHLIST_SIZES, controlSizes = CONTROL_SIZES, variants = VARIANTS } = {}) {
  const out = [];
  for (const v of variants) for (const n of (isNoChip(v) ? controlSizes : sizes)) out.push(planRung(v, n));
  return out;
}

/** Plan WITHOUT the (large) text — what goes in a report. */
export const publicPlan = ({ text, ...rest }) => ({ ...rest, chars: text.length });

// ── page sources ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The visible chat pane's state for one rung. The pane is the only ChatView root without aria-hidden (see scenario-workload's page
 * helpers). Cheap on purpose: counts chips and looks at the LAST chip only — it runs every 50 ms while a big list is on screen.
 */
export function paneStateSource(plan) {
  return `(() => {
    const panes = [...document.querySelectorAll('.chat-scroll')].filter((e) => !e.closest('[aria-hidden="true"]'));
    if (panes.length !== 1) return { panes: panes.length };
    const p = panes[0];
    const chips = p.querySelectorAll('[data-file-path]');
    const n = chips.length;
    const text = p.textContent || '';
    return { panes: 1, chips: n,
      lastChip: n ? (chips[n - 1].getAttribute('data-file-path') || '') : null,
      hasOutro: text.includes(${JSON.stringify(plan.outro)}),
      hasLastDecoy: ${plan.lastDecoy ? `text.includes(${JSON.stringify(plan.lastDecoy)})` : 'null'} };
  })()`;
}

/** Does a pane reading show the finished reply? Pure so tests can feed it readings. */
export function paneComplete(plan, s) {
  if (!s || s.panes !== 1 || !s.hasOutro) return false;
  if (plan.expectedChips === 0) return s.chips === 0 && s.hasLastDecoy === true;
  return s.chips === plan.expectedChips && s.lastChip === plan.lastPath;
}

/**
 * Page-side wait for the finished reply, then two animation frames (the paint). Returns renderer-clock times so the controller never
 * subtracts clocks. A frozen page answers late, and that lateness is exactly the thing being measured.
 */
export function awaitFinalPaintSource(plan, timeoutMs = SETTLE_TIMEOUT_MS) {
  return `(async () => {
    // WHY wrapped: paneStateSource is an already-invoked expression; the wait loop needs to call it again each poll.
    const state = () => ${paneStateSource(plan).trim()};
    const complete = (s) => !!s && s.panes === 1 && s.hasOutro && (${plan.expectedChips === 0}
      ? (s.chips === 0 && s.hasLastDecoy === true)
      : (s.chips === ${plan.expectedChips} && s.lastChip === ${JSON.stringify(plan.lastPath)}));
    const t0 = performance.now();
    let s = state();
    while (!complete(s) && performance.now() - t0 < ${timeoutMs}) { await new Promise((r) => setTimeout(r, 50)); s = state(); }
    const readyAtMs = performance.now();
    const ok = complete(s);
    if (ok) await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { ok, readyAtMs, paintedAtMs: performance.now(), state: s, timeOrigin: performance.timeOrigin };
  })()`;
}

/** Renderer long-task log + clock origin, for windowing in the controller. */
export const probeLogSource = `(() => { const p = window.__perfProbe; if (!p) throw new Error('page probe missing');
  return { t0: p.t0, longtaskSupported: p.longtaskSupported, timeOrigin: performance.timeOrigin,
    log: p.log.filter((e) => e[0] === 'longtask' || e[0] === 'frame-gap') }; })()`;

// ── windows and per-window statistics (pure) ───────────────────────────────────────────────────────────────────────────────────

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round1 = (n) => (num(n) === null ? null : Math.round(n * 10) / 10);
export const median = (xs) => { const s = xs.filter((x) => num(x) !== null).sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/**
 * The two windows, in RENDERER time. stream = native.send -> the fake server's last write; settle = that -> the finished reply painted.
 * Anything missing makes the window null (never a zero-length window that would read as "nothing stalled").
 */
export function buildWindows({ sendMs, streamEndMs, paintedMs }) {
  const ok = [sendMs, streamEndMs, paintedMs].every((v) => num(v) !== null) && sendMs <= streamEndMs && streamEndMs <= paintedMs;
  return ok ? { stream: [sendMs, streamEndMs], settle: [streamEndMs, paintedMs] } : { stream: null, settle: null };
}

/** Long tasks (stamped at their START, like readProbeWindow) and frame gaps (stamped at their end) per window. */
export function longtaskWindows(probe, windows) {
  const out = {};
  for (const name of ['stream', 'settle']) {
    const w = windows?.[name];
    if (!w || num(probe?.t0) === null || !Array.isArray(probe?.log)) { out[name] = null; continue; }
    if (probe.longtaskSupported === false) { out[name] = null; continue; }
    const lt = probe.log.filter((e) => e[0] === 'longtask' && probe.t0 + e[1] >= w[0] && probe.t0 + e[1] <= w[1]).map((e) => e[2]);
    const fg = probe.log.filter((e) => e[0] === 'frame-gap' && probe.t0 + e[1] >= w[0] && probe.t0 + e[1] <= w[1]).map((e) => e[2]);
    out[name] = { count: lt.length, maxMs: lt.length ? Math.max(...lt) : 0, totalMs: lt.reduce((a, b) => a + b, 0), frameGapMaxMs: fg.length ? Math.max(...fg) : 0 };
  }
  return out;
}

/** The 20 ms timer-delay sampler's events (>= 50 ms) per window; an event is stamped at its END so its start is end - delay. */
export function loopWindows(loop, windows) {
  const out = {};
  for (const name of ['stream', 'settle']) {
    const w = windows?.[name];
    if (!w || num(loop?.startedAt) === null || !Array.isArray(loop?.events) || loop?.available === false) { out[name] = null; continue; }
    const ev = loop.events.filter((e) => { const end = loop.startedAt + e.atMs, start = end - e.delayMs; return start >= w[0] && start <= w[1]; });
    out[name] = { count: ev.length, maxDelayMs: ev.length ? Math.max(...ev.map((e) => e.delayMs)) : 0, totalStallMs: round1(ev.reduce((a, e) => a + e.delayMs, 0)), truncated: !!loop.truncated };
  }
  return out;
}

// ── typing probe ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * WHY not startDocumentInputTrain: that train refuses to run longer than 12 s; a stream plus its settle can run for minutes. Same design
 * otherwise — never wait for an ack before scheduling the next key, skip overdue slots, cap outstanding keys — so a frozen renderer
 * shows up as late receipts, not as a stalled instrument.
 */
export function startTypingTrain(cdp, { now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout,
  everyMs = TYPING_EVERY_MS, maxSamples = TYPING_MAX_KEYS, maxOutstanding = TYPING_MAX_OUTSTANDING } = {}) {
  const samples = [], pending = new Set();
  let timer, stopped = false, skippedSlots = 0, failed = 0, maxInflight = 0, exhausted = false, deadline = now();
  const tick = () => {
    if (stopped) return;
    const t = now();
    if (samples.length >= maxSamples) { exhausted = true; return; }
    if (t < deadline) { timer = schedule(tick, deadline - t); return; }
    const overdue = Math.floor((t - deadline) / everyMs); skippedSlots += overdue; deadline += overdue * everyMs;
    if (pending.size >= maxOutstanding) { skippedSlots++; deadline = t + everyMs; timer = schedule(tick, everyMs); return; }
    const sample = { token: samples.length, plannedMs: deadline, actualMs: t, ackMs: null };
    samples.push(sample);
    let command;
    try { command = cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'F24', code: 'F24', windowsVirtualKeyCode: 135, nativeVirtualKeyCode: 135 }); } catch (e) { command = Promise.reject(e); }
    const tracked = Promise.resolve(command).then(() => { sample.ackMs = now(); }, (e) => { failed++; sample.error = String(e); });
    pending.add(tracked); tracked.finally(() => pending.delete(tracked));
    maxInflight = Math.max(maxInflight, pending.size);
    deadline = t + everyMs; timer = schedule(tick, everyMs);
  };
  tick();
  let stopping;
  return {
    snapshot: () => ({ samples: samples.map((s) => ({ ...s })), skippedSlots, failed, maxInflight, exhausted, everyMs, maxSamples, maxOutstanding }),
    stop() { stopped = true; cancel(timer); return stopping ??= (async () => { await Promise.all(pending); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F24', code: 'F24', windowsVirtualKeyCode: 135, nativeVirtualKeyCode: 135 }); })(); },
    cancel() { stopped = true; cancel(timer); },
  };
}

/**
 * Intersect clock exchanges (controller before/after bracketing a renderer reading) into an offset interval:
 * rendererTime = controllerTime + offset, offset in [lower, upper]. Same maths as document-input's alignDocumentClocks without its
 * 12 s horizon (a stream is longer); drift allowance is correspondingly wider but still tiny against the 25 ms error bar.
 */
export function alignClocks(exchanges, { maxErrorMs = 25, driftMs = 2 } = {}) {
  const ex = exchanges;
  const bad = !Array.isArray(ex) || ex.length < 2 || ex.some((x, i) => !x || ![x.beforeMs, x.rendererMs, x.afterMs].every((v) => num(v) !== null) || x.afterMs < x.beforeMs
    || (i > 0 && (x.beforeMs <= ex[i - 1].afterMs || x.rendererMs <= ex[i - 1].rendererMs)));
  if (bad) return { valid: false, error: 'invalid or non-monotonic clock exchanges' };
  const lower = Math.max(...ex.map((x) => x.rendererMs - x.afterMs)) - driftMs;
  const upper = Math.min(...ex.map((x) => x.rendererMs - x.beforeMs)) + driftMs;
  const errorMs = (upper - lower) / 2;
  return { valid: errorMs >= 0 && errorMs <= maxErrorMs, lower, upper, mid: (lower + upper) / 2, errorMs, error: errorMs >= 0 && errorMs <= maxErrorMs ? null : `clock offset uncertain (+/- ${round1(errorMs)} ms)` };
}

/**
 * Typing delay per phase. A key's delay is (renderer receipt time) - (controller dispatch time + offset); with the offset known only as an
 * interval this gives an UPPER bound (offset lower end) which is what is reported and judged — conservative, never flattering. Keys are
 * assigned to a phase by when they were SENT: idle (before native.send), stream, settle (server done -> reply painted), after.
 * Returns { complete:false, reasons } when the evidence cannot support a reading, so the rung says why instead of showing a number.
 */
export function summariseTyping({ train, receipts, overflow = 0, clocks, windows }) {
  const reasons = [];
  const raw = train?.samples ?? [], rc = receipts ?? [];
  if (!clocks?.valid) reasons.push(clocks?.error ?? 'clock alignment unavailable');
  if (!raw.length) reasons.push('no keys were sent');
  if (rc.length !== raw.length) reasons.push(`${rc.length} receipts for ${raw.length} keys`);
  if (overflow) reasons.push('receipt overflow');
  if (train?.failed) reasons.push(`${train.failed} key sends failed`);
  if (rc.some((r, i) => r?.token !== i || r?.trusted !== true || r?.correctTarget !== true)) reasons.push('a receipt was untrusted, off-target or out of order');
  if (!windows?.stream) reasons.push('no stream window');
  if (reasons.length) return { complete: false, reasons };
  const keys = raw.map((s, i) => {
    const sentR = s.actualMs + clocks.mid;
    const upper = rc[i].atMs - clocks.lower - s.actualMs, lower = rc[i].atMs - clocks.upper - s.actualMs;
    const w = windows;
    const phase = sentR < w.stream[0] ? 'idle' : sentR <= w.stream[1] ? 'stream' : (w.settle && sentR <= w.settle[1]) ? 'settle' : 'after';
    return { phase, upperMs: upper, lowerMs: lower };
  });
  const by = (p) => keys.filter((k) => k.phase === p);
  const max = (ks) => (ks.length ? round1(Math.max(...ks.map((k) => k.upperMs))) : null);
  return {
    complete: true, reasons: [], keysSent: raw.length, skippedSlots: train.skippedSlots, exhausted: train.exhausted,
    // saturated = the renderer was frozen long enough that the train stopped sending (maxOutstanding unacked keys); delays are then floors.
    saturated: train.skippedSlots > 0 && train.maxInflight >= train.maxOutstanding,
    idleMaxMs: max(by('idle')), streamMaxMs: max(by('stream')), settleMaxMs: max(by('settle')),
    keysStream: by('stream').length, keysSettle: by('settle').length,
    clockErrorMs: round1(clocks.errorMs),
  };
}

// ── rung classification ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every way the evidence for a rung can be unfit, in plain words. Empty = the rung measured what it claims. */
export function proofProblems(plan, raw) {
  const p = [];
  const rec = raw?.fakeRecord;
  if (!rec) p.push('the fake model server never recorded the request');
  else {
    if (rec.aborted) p.push('the stream was aborted mid-reply');
    if (rec.deltasSent !== plan.deltas) p.push(`sent ${rec.deltasSent} of ${plan.deltas} deltas`);
  }
  const f = raw?.final;
  if (!f) p.push('final paint was never read');
  else if (!f.ok) p.push(`the finished reply never appeared within the settle limit (chips ${f.state?.chips ?? '?'} of ${plan.expectedChips}, outro ${f.state?.hasOutro ?? '?'})`);
  if (raw?.sessionVisible === false) p.push('the streaming session was not the one on screen');
  return p;
}

/**
 * One raw record -> one row. raw = { failure?:{status,error}, fakeRecord, final, sessionVisible, windows, longtasks, loop, typing, main,
 * memory, interference, chipsAtEnd }. Status:
 *   failed:<reason>   the watchdog/instrument stopped it, or the evidence cannot support a reading (reason says which)
 *   slow              valid, and a named threshold was breached (the breach list is kept)
 *   measured          valid, every threshold met
 */
export function classifyRung(plan, raw, thresholds = PATHLIST_THRESHOLDS) {
  const row = { id: plan.id, variant: plan.variant, n: plan.n, deltas: plan.deltas, perSec: plan.perSec, atCloudSpeed: plan.atCloudSpeed, expectedChips: plan.expectedChips };
  const lt = raw?.longtasks ?? {}, lp = raw?.loop ?? {}, ty = raw?.typing;
  const end = raw?.final?.ok && num(raw?.windows?.settle?.[1]) !== null ? raw.windows.settle[1] - raw.windows.settle[0] : null;
  Object.assign(row, {
    // Long tasks: the browser's own >= 50 ms report. Timer-delay: an independent 20 ms ticker (covers a renderer where the long-task observer failed).
    streamLongtaskMaxMs: round1(lt.stream?.maxMs), streamLongtaskTotalMs: round1(lt.stream?.totalMs), streamLongtaskCount: num(lt.stream?.count),
    settleLongtaskMaxMs: round1(lt.settle?.maxMs), settleLongtaskTotalMs: round1(lt.settle?.totalMs), settleLongtaskCount: num(lt.settle?.count),
    streamTimerStallMaxMs: round1(lp.stream?.maxDelayMs), settleTimerStallMaxMs: round1(lp.settle?.maxDelayMs),
    streamFrameGapMaxMs: round1(lt.stream?.frameGapMaxMs), settleFrameGapMaxMs: round1(lt.settle?.frameGapMaxMs),
    mainMaxDelayMs: round1(raw?.main?.maxDelayMs), mainTotalStallMs: round1(raw?.main?.totalStallMs),
    typingIdleMaxMs: ty?.complete ? ty.idleMaxMs : null, typingStreamMaxMs: ty?.complete ? ty.streamMaxMs : null, typingSettleMaxMs: ty?.complete ? ty.settleMaxMs : null,
    typingSaturated: ty?.complete ? ty.saturated : null,
    endToPaintMs: round1(end),
    peakPssMb: round1(raw?.memory?.peakPssMb),
    chipsRendered: num(raw?.final?.state?.chips),
    interference: raw?.interference ?? null,
  });
  // The stream-window total includes anything the renderer did, so a "slow" reading is judged on the worst of the two windows.
  row.worstLongtaskMs = (() => { const v = [row.streamLongtaskMaxMs, row.settleLongtaskMaxMs].filter((x) => x !== null); return v.length ? Math.max(...v) : null; })();
  row.worstTypingMs = (() => { const v = [row.typingStreamMaxMs, row.typingSettleMaxMs].filter((x) => x !== null); return v.length ? Math.max(...v) : null; })();
  row.worstStalledMs = (() => { const a = row.streamLongtaskTotalMs, b = row.settleLongtaskTotalMs; return a === null && b === null ? null : round1((a ?? 0) + (b ?? 0)); })();

  if (raw?.failure) { row.status = `failed:${raw.failure.status || 'failed'}`; row.reason = String(raw.failure.error ?? '').split('\n')[0].slice(0, 300); return row; }
  const problems = proofProblems(plan, raw);
  if (problems.length) {
    row.status = raw?.final && raw.final.ok === false ? 'failed:settle-timeout' : 'failed:evidence-incomplete';
    row.reason = problems.join('; '); return row;
  }
  if (ty && !ty.complete) { row.status = 'failed:evidence-incomplete'; row.reason = `typing: ${ty.reasons.join('; ')}`; return row; }
  if (!ty) { row.status = 'failed:evidence-incomplete'; row.reason = 'typing: no reading'; return row; }
  if (row.worstLongtaskMs === null) { row.status = 'failed:evidence-incomplete'; row.reason = 'renderer long tasks were not observed (observer unavailable or window missing)'; return row; }
  const breaches = [];
  if (row.worstLongtaskMs > thresholds.rendererMaxDelayMs) breaches.push({ metric: 'worstLongtaskMs', value: row.worstLongtaskMs, limit: thresholds.rendererMaxDelayMs });
  if (row.worstTypingMs !== null && row.worstTypingMs > thresholds.inputLatencyMs) breaches.push({ metric: 'worstTypingMs', value: row.worstTypingMs, limit: thresholds.inputLatencyMs });
  if (row.endToPaintMs !== null && row.endToPaintMs > thresholds.endToPaintMs) breaches.push({ metric: 'endToPaintMs', value: row.endToPaintMs, limit: thresholds.endToPaintMs });
  row.breaches = breaches;
  row.status = breaches.length ? 'slow' : 'measured';
  return row;
}

// ── across rounds ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const TABLE_METRICS = Object.freeze(['streamLongtaskMaxMs', 'streamLongtaskTotalMs', 'settleLongtaskMaxMs', 'settleLongtaskTotalMs',
  'typingStreamMaxMs', 'typingSettleMaxMs', 'endToPaintMs', 'peakPssMb', 'chipsRendered']);

/** rows = [{ side, round, row }] -> { rungId: { side: { metric: {median,min,max,n}, statuses:[...] } } }. Missing values are not counted, and n says how many were. */
export function aggregateRounds(rows) {
  const out = {};
  for (const { side, row } of rows) {
    const cell = ((out[row.id] ??= {})[side] ??= { statuses: [], values: {} });
    cell.statuses.push(row.status);
    for (const m of TABLE_METRICS) (cell.values[m] ??= []).push(row[m]);
  }
  for (const sides of Object.values(out)) for (const cell of Object.values(sides)) {
    cell.metrics = Object.fromEntries(Object.entries(cell.values).map(([m, vs]) => {
      const v = vs.filter((x) => num(x) !== null);
      return [m, { median: median(v), min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null, n: v.length, of: vs.length }];
    }));
    delete cell.values;
  }
  return out;
}

const cellText = (c) => (c && c.n ? `${round1(c.median)} (${round1(c.min)}-${round1(c.max)})${c.n < c.of ? ` n=${c.n}/${c.of}` : ''}` : (c ? `none of ${c.of}` : '-'));
const statusText = (s) => { const t = {}; for (const x of s) t[x] = (t[x] ?? 0) + 1; return Object.entries(t).map(([k, v]) => `${v}x ${k}`).join(', '); };

/** Markdown table: one block per metric, rung rows, old vs new median (min-max). */
export function renderComparison(agg, { sides = ['old', 'new'], metrics = TABLE_METRICS } = {}) {
  const ids = Object.keys(agg);
  const lines = [];
  for (const m of metrics) {
    lines.push('', `### ${m}`, '', `| rung | ${sides.map((s) => `${s} median (min-max)`).join(' | ')} |`, `|---|${sides.map(() => '---').join('|')}|`);
    for (const id of ids) lines.push(`| ${id} | ${sides.map((s) => cellText(agg[id][s]?.metrics?.[m])).join(' | ')} |`);
  }
  lines.push('', '### status per rung', '', `| rung | ${sides.join(' | ')} |`, `|---|${sides.map(() => '---').join('|')}|`);
  for (const id of ids) lines.push(`| ${id} | ${sides.map((s) => (agg[id][s] ? statusText(agg[id][s].statuses) : '-')).join(' | ')} |`);
  return lines.join('\n');
}
