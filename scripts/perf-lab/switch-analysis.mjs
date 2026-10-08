// scripts/perf-lab/switch-analysis.mjs — the PURE half of switch-pingpong.mjs: statistics,
// the frame-gap finder, the "has this pane stopped changing" detector and sample validation.
// No app, no browser, no clock: every function takes the recorded lists and returns numbers,
// so tests/switch-analysis.test.mjs can drive them with synthetic event lists.
//
// WHY a separate file: the runner (switch-pingpong.mjs) boots a packaged app; the claims it
// makes ("this switch took 380 ms to settle", "this sample landed on the wrong pane") must be
// checkable without one.
//
// Times are milliseconds on ONE clock — the page's performance.now() — everywhere in here.

/** Nearest-rank percentile of a list of numbers (non-numbers ignored). null when there are none. */
export function percentile(values, p) {
  const a = values.filter(n => typeof n === 'number' && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * a.length));
  return a[Math.min(a.length, rank) - 1];
}

const r1 = n => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);

/** { n, p50, p95, max, min } — never only a median. All null (n 0) when nothing was measured. */
export function summarise(values) {
  const a = values.filter(n => typeof n === 'number' && Number.isFinite(n));
  if (!a.length) return { n: 0, p50: null, p95: null, max: null, min: null };
  return { n: a.length, p50: r1(percentile(a, 50)), p95: r1(percentile(a, 95)), max: r1(Math.max(...a)), min: r1(Math.min(...a)) };
}

/** The frame period: the median gap between consecutive frames, ignoring gaps over 100 ms (those are stalls, not the period). */
export function estimatePeriod(frameTimes) {
  const d = [];
  for (let i = 1; i < frameTimes.length; i++) { const g = frameTimes[i] - frameTimes[i - 1]; if (g > 0 && g <= 100) d.push(g); }
  return d.length ? percentile(d, 50) : null;
}

/**
 * Every gap between consecutive frames longer than `factor` x the frame period whose LATER frame
 * lies in (from, to]. A gap is charged to the window its frame lands in, so a freeze that began
 * just before `from` is not lost. Returns [{ atMs, gapMs }] (atMs = the frame that ended the gap).
 */
export function frameGaps(frameTimes, from, to, periodMs, factor = 1.5) {
  const out = [];
  if (!periodMs) return out;
  for (let i = 1; i < frameTimes.length; i++) {
    const t = frameTimes[i];
    if (t <= from) continue;
    if (t > to) break;
    const gap = t - frameTimes[i - 1];
    if (gap > factor * periodMs) out.push({ atMs: r1(t), gapMs: r1(gap) });
  }
  return out;
}

/**
 * Has the pane stopped changing? `eventTimes` = every DOM mutation / layout shift / buffer change /
 * output arrival that belongs to the pane. Starting at `from` (the moment the pane first showed),
 * the pane is settled at the time of its LAST activity once nothing follows it for `quietMs`.
 *
 *   status 'settled'     — settledAt = the last activity (or `from` if there was none).
 *   status 'capped'      — activity was still going `capMs` after `from`: never quiet (settledAt null).
 *   status 'unconfirmed' — observation ended before a full quiet window could be seen (settledAt null).
 *
 * `observedUntil` is the last moment the recorder was watching; without it a final quiet window
 * cannot be proven and the answer is 'unconfirmed'.
 */
export function settleDetector(eventTimes, { from, quietMs = 150, capMs = 3000, observedUntil }) {
  const ts = eventTimes.filter(t => t >= from).sort((a, b) => a - b);
  let last = from;
  for (const t of ts) {
    if (t - from > capMs) return { status: 'capped', settledAt: null, activityCount: ts.length };
    if (t - last >= quietMs) return { status: 'settled', settledAt: last, activityCount: ts.length };
    last = t;
  }
  if (observedUntil !== undefined && observedUntil - last >= quietMs) return { status: 'settled', settledAt: last, activityCount: ts.length };
  if (observedUntil !== undefined && observedUntil - from > capMs) return { status: 'capped', settledAt: null, activityCount: ts.length };
  return { status: 'unconfirmed', settledAt: null, activityCount: ts.length };
}

/** The first frame at/after t0 whose visible pane is `target`, and the frame after it (the first paint of it). */
export function firstVisible(ft, fv, t0, target) {
  for (let i = 0; i < ft.length; i++) {
    if (ft[i] < t0) continue;
    if (fv[i] === target) return { domAt: ft[i], paintedAt: i + 1 < ft.length ? ft[i + 1] : null, frameIndex: i };
  }
  return null;
}

/**
 * Is this sample real? A switch that "landed" on nothing is fast precisely because nothing happened
 * (the workload's 2026-08-27 lesson), so a sample counts only when the intended pane really is the
 * visible one. `before`/`after` = the visible pane index when the click was sent / when the
 * sequence ended its watch; `target` = the intended pane; `domAt` = first frame it was visible (null = never).
 *
 * status: 'ok' | 'no-switch' (the click was on the already-active session and nothing moved — a
 * correct no-op, never reported as 0 ms) | 'no-op-moved' (a no-op click that changed the pane) |
 * 'never-shown' (the destination never became visible) | 'wrong-pane' (something else is showing at the end).
 */
export function validateSample({ before, after, target, domAt, expectNoop = false, superseded = false }) {
  if (expectNoop || before === target) {
    if (after === target && before === target) return { ok: expectNoop, status: 'no-switch', reason: expectNoop ? null : 'the destination was already showing, so there is nothing to time' };
    return { ok: false, status: 'no-op-moved', reason: `a click on the already-active session changed the visible pane (${before} -> ${after})` };
  }
  if (domAt == null) return { ok: false, status: 'never-shown', reason: `the destination (pane ${target}) never became the visible one` };
  if (!superseded && after !== target) return { ok: false, status: 'wrong-pane', reason: `ended on pane ${after}, intended ${target}` };
  return { ok: true, status: 'ok', reason: null };
}

/**
 * One switch, from the recorded lists. `rec` is the page's recording ({ ft, fv, mu, ls, loaf, lt, tail, po, ac });
 * `sw` = { t0, target, before, nextT0 (null for the last), endObserved, expectNoop, streaming, mode, quietMs, capMs, period }.
 *
 * Numbers (all ms from t0, null = not measured, NEVER 0 for "did not happen"):
 *   showDomMs  — first frame at which the destination is the visible pane (what the page's DOM says)
 *   showMs     — the frame AFTER it starts: the destination has been rendered and handed over once
 *   settleMs   — activity in the destination pane (DOM changes, layout shifts, terminal buffer / output) has been
 *                quiet for quietMs; null with settleStatus 'capped' (never quiet), 'unconfirmed' (the next
 *                click or the end of the recording came first) or 'n/a-streaming'
 *   gaps       — every frame gap > 1.5 x the frame period from t0 to settle + 2 s (or to the next click)
 */
export function analyseSwitch(rec, sw) {
  const { t0, target, before, nextT0 = null, endObserved, expectNoop = false, streaming = false, mode = 'chat', quietMs = 150, capMs = 3000, period } = sw;
  const winEnd = nextT0 ?? endObserved;
  const vis = firstVisible(rec.ft, rec.fv, t0, target);
  // A pane that appeared only AFTER the next click was already queued is not this switch's arrival.
  const domAt = vis && (nextT0 === null || vis.domAt < nextT0) ? vis.domAt : null;
  const paintedAt = domAt !== null ? vis.paintedAt : null;
  const lastFrame = rec.ft.length ? rec.ft[rec.ft.length - 1] : t0;
  const afterIdx = (() => { const i = rec.ft.findIndex(t => t >= (winEnd ?? lastFrame)); return rec.fv[i < 0 ? rec.fv.length - 1 : i]; })();
  const verdict = validateSample({ before, after: nextT0 === null ? rec.fv[rec.fv.length - 1] : afterIdx, target, domAt, expectNoop, superseded: nextT0 !== null });
  const out = { t0, target, before, status: verdict.status, ok: verdict.ok, reason: verdict.reason };
  if (verdict.status === 'no-switch' || verdict.status === 'no-op-moved') { out.showMs = null; out.settleMs = null; out.settleStatus = 'n/a'; return out; }
  out.showDomMs = domAt === null ? null : r1(domAt - t0);
  out.showMs = paintedAt === null ? null : r1(paintedAt - t0);
  if (domAt === null) return out;

  // Activity belonging to the destination pane.
  const ev = [];
  for (const [t, idx] of rec.mu) if (idx === target) ev.push(t);
  for (const s of rec.ls) if (s[2] === target) ev.push(s[0]);
  if (mode === 'terminal') {
    for (const [t, idx] of rec.tail) if (idx === target) ev.push(t);
    for (const [t, idx] of rec.po) if (idx === target) ev.push(t);
  }
  const activityAfterShow = ev.filter(t => t >= domAt && (winEnd === null || winEnd === undefined || t <= winEnd)).length;
  out.activityEvents = activityAfterShow;
  if (streaming) { out.settleMs = null; out.settleStatus = 'n/a-streaming'; }
  else {
    const det = settleDetector(ev.filter(t => nextT0 === null || t < nextT0), { from: domAt, quietMs, capMs, observedUntil: winEnd });
    out.settleStatus = det.status;
    // WHY max with the first paint: a pane is not settled before it has been drawn. Without this, a main-thread block that
    // starts after the DOM work (the positive control) moved "show" but not "settle".
    out.settleMs = det.settledAt === null ? null : r1(Math.max(det.settledAt, paintedAt ?? det.settledAt) - t0);
  }
  // The window the cost is charged to: to settle + 2 s, but never past the next click.
  const base = out.settleMs !== null ? t0 + out.settleMs : domAt + capMs;
  const to = Math.min(base + 2000, nextT0 ?? Infinity, endObserved ?? Infinity);
  out.windowMs = r1(to - t0);
  out.gaps = frameGaps(rec.ft, t0, to, period);
  out.gapMaxMs = out.gaps.length ? Math.max(...out.gaps.map(g => g.gapMs)) : 0;
  out.gapTotalMs = r1(out.gaps.reduce((a, g) => a + g.gapMs, 0));
  out.longAnimationFrames = rec.loaf.filter(l => l[0] >= t0 - 1 && l[0] <= to).map(l => ({ atMs: r1(l[0] - t0), durationMs: r1(l[1]), blockingMs: r1(l[2]), scripts: l[3] }));
  out.longTasks = rec.lt.filter(l => l[0] >= t0 - 1 && l[0] <= to).map(l => ({ atMs: r1(l[0] - t0), durationMs: r1(l[1]) }));
  // Work that other (not-shown) panes did in this window — the catch-up / wasted-work signal.
  const other = {};
  for (const [t, idx, n] of rec.mu) if (t >= t0 && t <= to && idx !== target) { other[idx] = other[idx] ?? { callbacks: 0, records: 0 }; other[idx].callbacks++; other[idx].records += n; }
  out.otherPaneWork = other;
  // Atlas clears in the window: the counter's last reading in the window minus its reading just before the click
  // (the recorder logs the starting value, so a baseline exists; with none, the first reading in the window is used).
  if (mode === 'terminal') {
    const inWin = rec.ac.filter(x => x[0] >= t0 && x[0] <= to);
    const base = rec.ac.filter(x => x[0] < t0).at(-1)?.[1] ?? inWin[0]?.[1];
    out.atlasClears = inWin.length && base !== undefined ? inWin.at(-1)[1] - base : 0;
  }
  return out;
}

/** Group + summarise: { key: { show:{...}, settle:{...}, gapMax:{...}, dropped:{reason: count} } } for a list of analysed switches. */
export function summariseSwitches(samples) {
  const good = samples.filter(s => s.ok);
  const dropped = {};
  for (const s of samples) if (!s.ok) dropped[s.status] = (dropped[s.status] ?? 0) + 1;
  return {
    samples: samples.length, usable: good.length, dropped,
    show: summarise(good.map(s => s.showMs)),
    showDom: summarise(good.map(s => s.showDomMs)),
    settle: summarise(good.map(s => s.settleMs)),
    settledCount: good.filter(s => s.settleMs !== null).length,
    gapMax: summarise(good.map(s => s.gapMaxMs)),
    withGaps: good.filter(s => s.gaps?.length).length,
    longAnimationFrames: good.reduce((a, s) => a + (s.longAnimationFrames?.length ?? 0), 0),
  };
}

/** Warm/cold split of a sample list (cold = the first visit to that session in this boot). */
export function splitCold(samples) {
  return { cold: summariseSwitches(samples.filter(s => s.cold)), warm: summariseSwitches(samples.filter(s => !s.cold)) };
}

/**
 * Outlier rule from the brief: a configuration whose max is more than 2x its p95 gets repeated
 * to see whether the outlier recurs. Returns true for those (needs at least 5 values).
 */
export function needsRepeat(values) {
  const s = summarise(values);
  return s.n >= 5 && s.p95 > 0 && s.max > 2 * s.p95;
}

/**
 * The positive control's verdict: a 200 ms block injected after each click must move the median
 * first-paint and settle by about 200 ms (default band 150-260). `plain`/`blocked` = lists of ms.
 */
export function controlVerdict(plain, blocked, { blockMs = 200, lo = 0.75, hi = 1.3 } = {}) {
  const a = percentile(plain, 50), b = percentile(blocked, 50);
  if (a === null || b === null) return { ok: false, shiftMs: null, reason: 'no samples' };
  const shift = r1(b - a);
  return { ok: shift >= blockMs * lo && shift <= blockMs * hi, shiftMs: shift, plainP50: r1(a), blockedP50: r1(b), reason: null };
}

/** Echo latency for a typed key: key timeStamp -> the first frame at/after its `input` event (chat), or the first frame with the char in the buffer (terminal). */
export function echoLatency(keyTs, inputAt, ft) {
  if (inputAt == null) return null;
  const f = ft.find(t => t >= inputAt);
  return f === undefined ? null : r1(f - keyTs);
}

/** Map a node-side epoch time to the page clock, given a clock sync { nodeEpoch, pageNow } pair measured together. */
export function toPageTime(nodeEpochMs, sync) {
  return nodeEpochMs - sync.nodeEpoch + sync.pageNow;
}

/** Pick the lowest-round-trip clock sync from several { nodeBefore, nodeAfter, pageEpoch, pageNow } samples. */
export function bestClockSync(samples) {
  let best = null;
  for (const s of samples) {
    const rtt = s.nodeAfter - s.nodeBefore;
    if (best === null || rtt < best.rtt) best = { rtt, nodeEpoch: (s.nodeBefore + s.nodeAfter) / 2, pageNow: s.pageNow };
  }
  return best;
}

/** Plans — [{ at, idx }] click schedules (idx = session index to click). Pure so the cadence is testable. */
export function buildPlan(kind, { A, B, C, D }) {
  const mk = (n, every, seq) => Array.from({ length: n }, (_, i) => ({ at: i * every, idx: seq[i % seq.length] }));
  switch (kind) {
    case 'a': return mk(20, 1000, [B, A]);
    case 'b400': return mk(20, 400, [B, A]);
    case 'b250': return mk(20, 250, [B, A]);
    case 'b150': return mk(20, 150, [B, A]);
    case 'c': return mk(10, 40, [B, C, D, A]);
    case 'd': return [{ at: 0, idx: B }, { at: 60, idx: C }];
    default: throw Error(`no plan for ${kind}`);
  }
}
