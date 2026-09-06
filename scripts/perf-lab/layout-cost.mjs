// scripts/perf-lab/layout-cost.mjs — count the WORK a streamed token costs,
// instead of timing it.
//
// WHY THIS EXISTS. Perf cycle 1's defect ("N2") was one forced document layout per
// streamed token: an effect read `scrollHeight` right after every delta's commit,
// which makes the browser lay the whole document out synchronously before the next
// line of JavaScript runs. It was found by reading code, fixed, and then could never
// be RE-GATED, because the rig had no way to see it. Its known twin in the buddy
// window (`BubbleFeed.tsx`) is still unfixed for the same reason: a fix there would
// ship with no KEEP measurement behind it.
//
// The obvious instrument — time the streaming — does not work here. Timing needs a
// native stream, and a native stream's speed is set by how fast a local model emits
// tokens, which varies by more than the defect does. Two runs of the same code
// disagree; the number cannot gate anything.
//
// Counting WORK has none of that hostage problem. Chromium's CDP `Performance`
// domain exposes `LayoutCount` and `RecalcStyleCount` — monotonic integers, not
// durations. Confirmed empirically on 2026-09-03 rather than read off the protocol
// docs: 200 iterations of `el.textContent = …; void el.offsetHeight` produced
// exactly `LayoutCount = 200` and `RecalcStyleCount = 200`. A forced layout per
// token is therefore an exact integer, and a fix moves it by a whole number.
//
// HOW TO READ THE RESULT. `layoutsPerFrame` is the gate.
//
//   A healthy renderer lays out at most about once per PAINTED FRAME, however many
//   deltas arrived in between — the browser coalesces. So layouts ≈ frames is
//   normal, and layouts >> frames means something read a geometry property mid-commit
//   and forced the layout early. `layoutsPerCommit` then attributes it: when it sits
//   near 1.0 while commits outrun frames, the cost is per-DELTA, which is the cycle-1
//   shape exactly.
//
// WHAT IT CANNOT SEE. Layout count is renderer-wide, not per-component: it says the
// document was laid out, never which effect forced it. Attribution still needs the
// code. And a scenario that does not actually stream per-token deltas will report a
// clean ratio no matter what the code does — scenario-workload's own `blindTo` has
// said since cycle 2 that its Claude-Code streamer appends whole TURNS at ~7/s, not
// hundreds of same-turn deltas. Point this at the NATIVE leg, or it measures nothing.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).

/** Counters read from `Performance.getMetrics`. Durations are SECONDS in the protocol. */
export const COUNTER_NAMES = Object.freeze(['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration']);

/**
 * Enable the Performance domain. `getMetrics` returns an EMPTY LIST until this is
 * called, and an empty list would read as zero layouts — a spectacular fake win —
 * so a failure here must be recorded as a warning and surface as nulls, never as 0.
 * Idempotent per client: enabling twice is harmless but pointless.
 */
export async function enablePerformanceDomain(cdp, warnings = [], label = 'layout-cost') {
  try {
    await cdp.send('Performance.enable');
    return true;
  } catch (e) {
    warnings.push(`${label}: CDP Performance.enable failed (${e.message}) — layout counts are UNMEASURED (null), not zero`);
    return false;
  }
}

/**
 * One reading of the counters. Every field is null rather than 0 when the metric is
 * missing, for the reason above.
 */
export async function readCounters(cdp) {
  try {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const by = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
    const num = (v) => (typeof v === 'number' ? v : null);
    return {
      layoutCount: num(by.LayoutCount),
      recalcStyleCount: num(by.RecalcStyleCount),
      // Protocol reports seconds; the rig speaks milliseconds everywhere else.
      layoutDurationMs: typeof by.LayoutDuration === 'number' ? by.LayoutDuration * 1000 : null,
      recalcStyleDurationMs: typeof by.RecalcStyleDuration === 'number' ? by.RecalcStyleDuration * 1000 : null,
      error: null,
    };
  } catch (e) {
    return { layoutCount: null, recalcStyleCount: null, layoutDurationMs: null, recalcStyleDurationMs: null, error: String(e?.message ?? e) };
  }
}

/**
 * The page-side half: painted frames and React commits, which the CDP counters
 * cannot supply.
 *
 * FRAMES come from a requestAnimationFrame loop. It is one integer increment per
 * frame — deliberately the cheapest thing that can count frames, because an
 * instrument that costs a frame changes the number it is reporting.
 *
 * COMMITS come from a MutationObserver on the visible chat pane. One observer
 * CALLBACK is one batch of DOM changes the browser delivered — which is one render
 * commit, not one mutation record (a single commit touching three nodes delivers
 * three records in one callback). Counting callbacks is what makes
 * `layoutsPerCommit` mean "layouts per render", which is the ratio the defect moves.
 *
 * Replaces any previous probe so repeated passes in one boot cannot stack — the
 * same rule scenario-workload's long-task probe already follows.
 */
export const COMMIT_PROBE_EXPRESSION = (selector) => `(() => {
  try { if (window.__layoutCost && window.__layoutCost.stop) window.__layoutCost.stop(); } catch (e) { /* none installed */ }
  // The visible pane only: every other ChatView is inside an aria-hidden wrapper,
  // and observing a hidden one would count commits that never painted.
  const panes = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !e.closest('[aria-hidden="true"]'));
  const target = panes[0] || null;
  let frames = 0, commits = 0, records = 0, rafId = 0, running = true;
  const tick = () => { if (!running) return; frames++; rafId = requestAnimationFrame(tick); };
  rafId = requestAnimationFrame(tick);
  let obs = null;
  if (target) {
    obs = new MutationObserver((list) => { commits++; records += list.length; });
    obs.observe(target, { childList: true, subtree: true, characterData: true });
  }
  window.__layoutCost = {
    startedAt: performance.now(),
    attached: Boolean(target),
    read: () => ({ frames, commits, records, attached: Boolean(target), elapsedMs: performance.now() - window.__layoutCost.startedAt }),
    stop: () => { running = false; cancelAnimationFrame(rafId); if (obs) obs.disconnect(); },
  };
  return { attached: Boolean(target), panes: panes.length };
})()`;

/** Install the page probe. Returns `{ attached, panes }` — `attached:false` means no visible pane was found. */
export async function installCommitProbe(cdp, { selector = '.chat-scroll' } = {}) {
  return cdp.evaluate(COMMIT_PROBE_EXPRESSION(selector));
}

/** Read the page probe without stopping it. Returns null when it was never installed. */
export async function readCommitProbe(cdp) {
  return cdp.evaluate(`(window.__layoutCost ? window.__layoutCost.read() : null)`);
}

/** Stop the page probe. Safe to call when none is installed. */
export async function stopCommitProbe(cdp) {
  return cdp.evaluate(`(() => { try { if (window.__layoutCost) window.__layoutCost.stop(); return true; } catch (e) { return false; } })()`);
}

/** How many layouts per frame counts as "something is forcing layout". */
export const FORCED_LAYOUT_PER_FRAME = 1.5;
/** How close layouts-per-commit must sit to 1.0 to call the cost per-delta. */
export const PER_DELTA_LAYOUT_RATIO = 0.8;
/** Below this many commits per frame, commits are NOT outrunning frames and the ratio proves nothing. */
export const COMMITS_OUTRUN_FRAMES = 1.5;

/**
 * Turn two counter readings plus one page-probe reading into the measurement.
 * PURE, so the arithmetic and — more importantly — the VERDICT can be unit-tested
 * against cases no scenario would reliably produce on demand.
 *
 * Returns nulls, never zeroes, for anything that was not measured. `verdict` is one of:
 *   'per-delta-forced-layout' — layouts track commits while commits outrun frames
 *   'forced-layout'           — layouts far outrun frames, but not once per commit
 *   'coalesced'               — layouts at or below frame rate; the healthy shape
 *   'stream-too-slow'         — fewer commits than frames, so the defect is INVISIBLE here
 *   'unmeasured'              — a counter or the probe was missing
 *   'no-stream'               — nothing streamed, so there was nothing to measure
 *
 * WHY 'stream-too-slow' EXISTS. Measured against the real app 2026-09-03: the local
 * model produced 35 deltas in 3 s against 181 frames, giving layoutsPerCommit exactly
 * 1.0 — which is ALSO what a healthy renderer does when each commit lands in its own
 * frame and gets its own layout. When commits are slower than frames the two cases are
 * indistinguishable, so calling it 'coalesced' would have been a pass the data does not
 * support. This is the same failure the whole instrument exists to prevent, one level up.
 */
export function summariseLayoutCost(before, after, probe) {
  const out = {
    layouts: null, recalcs: null, frames: null, commits: null, records: null,
    layoutDurationMs: null, recalcStyleDurationMs: null,
    layoutsPerFrame: null, layoutsPerCommit: null, commitsPerFrame: null,
    elapsedMs: probe?.elapsedMs ?? null,
    attached: probe?.attached ?? false,
    verdict: 'unmeasured', reason: null,
  };

  const haveCounters = typeof before?.layoutCount === 'number' && typeof after?.layoutCount === 'number';
  if (!haveCounters || !probe || typeof probe.frames !== 'number') return out;

  out.layouts = after.layoutCount - before.layoutCount;
  out.recalcs = (typeof after.recalcStyleCount === 'number' && typeof before.recalcStyleCount === 'number')
    ? after.recalcStyleCount - before.recalcStyleCount : null;
  out.layoutDurationMs = (typeof after.layoutDurationMs === 'number' && typeof before.layoutDurationMs === 'number')
    ? round3(after.layoutDurationMs - before.layoutDurationMs) : null;
  out.recalcStyleDurationMs = (typeof after.recalcStyleDurationMs === 'number' && typeof before.recalcStyleDurationMs === 'number')
    ? round3(after.recalcStyleDurationMs - before.recalcStyleDurationMs) : null;
  out.frames = probe.frames;
  out.commits = probe.commits ?? null;
  out.records = probe.records ?? null;

  // No commits means nothing rendered into the pane during the window. Reporting
  // 'coalesced' here would be a clean bill of health for a measurement that never
  // happened — the exact failure that let cycle 3's pop-in through three runs.
  if (!out.commits) { out.verdict = 'no-stream'; return out; }
  if (!out.frames) { out.verdict = 'unmeasured'; return out; }

  out.layoutsPerFrame = round3(out.layouts / out.frames);
  out.layoutsPerCommit = round3(out.layouts / out.commits);
  out.commitsPerFrame = round3(out.commits / out.frames);

  if (out.layoutsPerFrame > FORCED_LAYOUT_PER_FRAME) {
    // Layouts outrunning frames can only happen if something forced them early.
    out.verdict = out.layoutsPerCommit >= PER_DELTA_LAYOUT_RATIO && out.commitsPerFrame >= COMMITS_OUTRUN_FRAMES
      ? 'per-delta-forced-layout'
      : 'forced-layout';
  } else if (out.commitsPerFrame < COMMITS_OUTRUN_FRAMES) {
    // Not enough deltas to tell the two shapes apart — see the note above.
    out.verdict = 'stream-too-slow';
    out.reason = `only ${out.commits} commits across ${out.frames} frames (${out.commitsPerFrame}/frame): `
      + 'a forced layout per delta cannot outrun the frame rate when deltas are slower than frames, '
      + 'so this window cannot distinguish the defect from healthy behaviour';
  } else {
    out.verdict = 'coalesced';
  }
  return out;
}

function round3(n) { return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null; }

/** One line for the run summary — the verdict first, because that is the finding. */
export function formatLayoutCostLine(m) {
  if (!m || m.verdict === 'unmeasured') return 'layout cost: UNMEASURED';
  if (m.verdict === 'no-stream') return `layout cost: NOTHING STREAMED (${m.frames ?? '?'} frames, 0 commits) — the window measured no deltas`;
  if (m.verdict === 'stream-too-slow') return `layout cost: INCONCLUSIVE — only ${m.commits} commits across ${m.frames} frames; the stream was too slow for this window to see the defect`;
  return `layout cost: ${m.verdict} — ${m.layouts} layouts over ${m.commits} commits / ${m.frames} frames `
    + `(${m.layoutsPerFrame}/frame, ${m.layoutsPerCommit}/commit)`;
}

/**
 * Severity order for rolling repeats up into one verdict, worst first.
 *
 * WHY A ROLLUP EXISTS AT ALL: run.mjs medians every field across repeats, and
 * `median()` sorts with `x - y` — on strings that is NaN, so it returns whichever
 * verdict the sort happened to leave in the middle. Two clean repeats and one that
 * caught the defect could therefore report 'coalesced'. A defect seen ONCE is a
 * defect, and a repeat that measured nothing must never be averaged away into a pass.
 */
export const VERDICT_SEVERITY = Object.freeze([
  'per-delta-forced-layout',  // the cycle-1 defect
  'forced-layout',            // something forces layout, just not per delta
  'stream-too-slow',          // could not tell — NOT a pass
  'no-stream',                // measured nothing — NOT a pass
  'unmeasured',               // measured nothing — NOT a pass
  'coalesced',                // clean
]);

/** The worst verdict across repeats. Returns 'unmeasured' when there is nothing to roll up. */
export function worstVerdict(verdicts) {
  const seen = new Set((verdicts ?? []).filter(Boolean));
  return VERDICT_SEVERITY.find((v) => seen.has(v)) ?? 'unmeasured';
}
