// scripts/perf-lab/late-content.mjs — is anything LATE to the screen?
//
// WHY THIS EXISTS. Perf cycle 3 shipped a 59% win whose most user-visible defect
// survived three clean measurement runs: while you scrolled, messages appeared as
// blank gaps and then popped in. It was found by Destin scrolling slowly for thirty
// seconds, not by the rig. Every number the rig had was taken while the app was
// STILL — and lazy rendering is, by construction, correct when still and wrong while
// moving. A memory ceiling read after an 800 ms settle can never see it.
//
// The rig already counts folded entries (`__perfScroll.folded()`, scenario-scrollback),
// but it counts them AFTER settling and across the whole document. That answers "did
// folding engage?" It cannot answer "was anything blank where the user was looking?"
//
// THE INVARIANT, and it is an absolute one: an entry that is inside the viewport must
// never be rendering as a spacer. Not "rarely", not "briefly" — a single frame of it is
// the pop-in. So the measurement is a count, and the passing value is zero.
//
// GENERAL, NOT FOLDING-SPECIFIC. A spacer is defined structurally — an element that
// occupies vertical space and has no rendered content — so this catches any lazy
// render that reaches the screen late: virtualisation, deferred images, a future
// eviction scheme. It is deliberately not coupled to cycle 3's fold implementation.
//
// WHY THE SAMPLING RUNS IN THE PAGE. One CDP round trip is milliseconds; a dropped
// frame is 16. Sampling from Node would alias straight past the thing being measured,
// so the scroll and the sampler share one requestAnimationFrame loop and only the
// summary crosses the wire.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).

/**
 * Scroll the visible chat pane at a HUMAN pixel rate for a fixed time, counting every
 * frame how many entries inside the viewport are still spacers.
 *
 * The rate, not the distance, is the specification. Destin found the defect scrolling
 * slowly, and both extremes hide or fake it: too fast and the renderer is simply
 * outrun (see the note at the scroll loop — the first version of this file did exactly
 * that and produced a confident false positive); too slow and a renderer that waits
 * for scrolling to stop is never stressed at all.
 *
 * `direction` matters. Scrolling back UP is what scenario-scrollback already drives;
 * this defaults to scrolling DOWN through an already-loaded conversation, which is
 * both the motion that found the bug and a case that scenario's `blindTo` calls out
 * as unmeasured.
 */
export const SCROLL_PROBE_EXPRESSION = ({ durationMs, direction, pxPerSecond, settleMs }) => `(async () => {
  const pane = [...document.querySelectorAll('.chat-scroll')].find((e) => !e.closest('[aria-hidden="true"]'));
  if (!pane) return { ok: false, reason: 'no visible .chat-scroll' };

  // A spacer: it takes up room but renders nothing. childElementCount is how the
  // app's folded entries present (ChatView renders the wrapper with an inline
  // height and no body); the textContent check keeps a future spacer that holds a
  // stray text node from reading as real content.
  const isSpacer = (el) => el.childElementCount === 0 && !el.textContent.trim();

  let frames = 0, framesWithLate = 0, maxLate = 0, maxSpacersAnywhere = 0, totalEntriesSeen = 0;
  // One example, for the report: which entry was blank, and where. A bare count
  // sends the next reader back to the app with nothing to look at.
  let firstLate = null;

  const sample = () => {
    const view = pane.getBoundingClientRect();
    const entries = pane.querySelectorAll('.timeline-entry');
    totalEntriesSeen = Math.max(totalEntriesSeen, entries.length);
    let late = 0, spacers = 0;
    for (const el of entries) {
      if (!isSpacer(el)) continue;
      spacers++;
      const r = el.getBoundingClientRect();
      // Zero-height elements cannot be a visible blank gap.
      if (r.height <= 0) continue;
      // Intersects the pane's own viewport, not the window's.
      if (r.bottom > view.top && r.top < view.bottom) {
        late++;
        if (!firstLate) firstLate = { key: el.getAttribute('data-entry-key'), heightPx: Math.round(r.height), atScrollTop: Math.round(pane.scrollTop) };
      }
    }
    maxSpacersAnywhere = Math.max(maxSpacersAnywhere, spacers);
    if (late > 0) framesWithLate++;
    maxLate = Math.max(maxLate, late);
    frames++;
  };

  const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
  const down = ${JSON.stringify(direction)} !== 'up';
  const rate = ${Number(pxPerSecond)};
  const duration = ${Number(durationMs)};
  // Scroll at a fixed PIXEL RATE, like a hand on a wheel — NOT "cross the whole
  // document in N seconds". The first version did the latter and it was wrong in a
  // way that produced a confident false positive: against the real app it swept
  // 4,504,187 px in 6 s — 745,000 px/s, roughly 500x a human scroll — and every
  // frame had blank entries in view, because no renderer on earth could keep up.
  // The instrument was measuring its own scroll speed. A defect only counts if a
  // person moving at human speed would see it.
  const start = down ? 0 : max;
  pane.scrollTop = start;

  // SETTLE AT REST BEFORE MEASURING ANY MOTION.
  //
  // Seeking to the start is a teleport, and no user teleports. The first version
  // sampled one frame after the jump and duly counted the entries that had not yet
  // unfolded at the new position — 4 blank entries on 8 frames, every one of them at
  // scrollTop 0, i.e. the instrument catching its own seek. Waiting for the viewport
  // to be clean first means any blank DURING the scroll is attributable to the scroll.
  //
  // And if it never settles, that is a finding in its own right and a worse one:
  // content blank while the app is STANDING STILL. Reported separately, not folded
  // into the scrolling number.
  const lateNow = () => {
    const view = pane.getBoundingClientRect();
    let n = 0;
    for (const el of pane.querySelectorAll('.timeline-entry')) {
      if (!isSpacer(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > view.top && r.top < view.bottom) n++;
    }
    return n;
  };
  const settleBudget = ${Number(settleMs)};
  const tSettle = performance.now();
  let settledAtRest = false;
  let lateAtRest = lateNow();
  while (performance.now() - tSettle < settleBudget) {
    if (lateNow() === 0) { settledAtRest = true; break; }
    await new Promise((r) => requestAnimationFrame(r));
  }
  const settleTookMs = Math.round(performance.now() - tSettle);
  lateAtRest = settledAtRest ? 0 : lateNow();

  // Frames where the APP moved the viewport out from under us, rather than us moving
  // it. Excluded from the late count and reported separately.
  //
  // WHY: the chat pane pins itself to the bottom. Measured against the real app, one
  // frame in 337 reported blank entries at scrollTop 4,504,200 — the very bottom —
  // while this pass had only travelled 12,003 px from the top. The app had yanked the
  // view to the end, and the blank entries were the ones at the destination. That is
  // a real thing a user might see, but it is an AUTO-SCROLL, not late content, and
  // merging the two would be exactly the conflation this instrument exists to avoid.
  const JUMP_TOLERANCE_PX = 4;
  let jumpedFrames = 0, lastJumpTo = null;
  const t0 = performance.now();
  let travelled = 0;
  while (true) {
    const elapsed = performance.now() - t0;
    travelled = Math.min(max, (rate * elapsed) / 1000);
    const commanded = down ? travelled : max - travelled;
    pane.scrollTop = commanded;
    await new Promise((r) => requestAnimationFrame(r));
    if (Math.abs(pane.scrollTop - commanded) > JUMP_TOLERANCE_PX) {
      jumpedFrames++;
      lastJumpTo = Math.round(pane.scrollTop);
    } else {
      sample();
    }
    // Stop at the time budget, or early if we ran out of document to scroll.
    if (elapsed >= duration || travelled >= max) break;
  }
  // Sample once more after the motion stops. An entry still blank HERE is worse
  // than one blank mid-scroll: nothing is going to prompt another render.
  await new Promise((r) => requestAnimationFrame(r));
  const beforeSettle = { maxLate, framesWithLate };
  sample();
  const lateAfterStop = maxLate > beforeSettle.maxLate || framesWithLate > beforeSettle.framesWithLate;

  return {
    ok: true,
    frames, framesWithLate, maxLate, maxSpacersAnywhere, totalEntriesSeen,
    lateAfterStop, firstLate,
    settledAtRest, settleTookMs, lateAtRest,
    jumpedFrames, lastJumpTo,
    scrollHeight: pane.scrollHeight, clientHeight: pane.clientHeight,
    scrollablePx: max,
    // What the pass ACTUALLY did, so a reader can judge the reading rather than
    // trust it. The rate is the whole difference between a measurement and an artefact.
    travelledPx: Math.round(travelled),
    pxPerSecond: rate,
    elapsedMs: Math.round(performance.now() - t0),
  };
})()`;

/**
 * A brisk but human continuous scroll, in pixels per second. A mouse-wheel notch is
 * ~100 px and a fast flick is a few thousand px/s, so 1,500 px/s is the upper end of
 * ordinary reading-speed scrolling — fast enough to stress a lazy renderer, slow
 * enough that a blank frame is a defect a person would actually see.
 */
export const HUMAN_SCROLL_PX_PER_SECOND = 1500;

/** Drive one scroll pass and return the raw page reading. */
export async function scrollAndCount(cdp, { durationMs = 8000, direction = 'down', pxPerSecond = HUMAN_SCROLL_PX_PER_SECOND, settleMs = 3000 } = {}) {
  return cdp.evaluate(SCROLL_PROBE_EXPRESSION({ durationMs, direction, pxPerSecond, settleMs }));
}

/**
 * Turn a raw reading into the measurement. PURE, so the verdict can be tested
 * against cases a live app would not produce on demand.
 *
 * `verdict`:
 *   'late-content'  — entries inside the viewport rendered as spacers. THE defect.
 *   'clean'         — spacers existed, none of them ever inside the viewport.
 *   'no-folding'    — nothing was ever a spacer, so nothing was tested. NOT a pass.
 *   'unmeasured'    — the pane was missing or the pass did not run.
 */
export function summariseLateContent(raw) {
  const out = {
    frames: null, framesWithLate: null, maxLateInViewport: null,
    spacersSeenAnywhere: null, totalEntriesSeen: null,
    lateAfterStop: null, firstLate: null,
    settledAtRest: null, settleTookMs: null, lateAtRest: null,
    jumpedFrames: null, lastJumpTo: null,
    scrolledPx: null, scrollablePx: null, pxPerSecond: null, elapsedMs: null,
    verdict: 'unmeasured', reason: null,
  };
  if (!raw?.ok) { out.reason = raw?.reason ?? 'the scroll pass did not run'; return out; }

  out.frames = raw.frames ?? 0;
  out.framesWithLate = raw.framesWithLate ?? 0;
  out.maxLateInViewport = raw.maxLate ?? 0;
  out.spacersSeenAnywhere = raw.maxSpacersAnywhere ?? 0;
  out.totalEntriesSeen = raw.totalEntriesSeen ?? 0;
  out.lateAfterStop = raw.lateAfterStop ?? null;
  out.settledAtRest = raw.settledAtRest ?? null;
  out.settleTookMs = raw.settleTookMs ?? null;
  out.lateAtRest = raw.lateAtRest ?? null;
  out.jumpedFrames = raw.jumpedFrames ?? 0;
  out.lastJumpTo = raw.lastJumpTo ?? null;
  out.firstLate = raw.firstLate ?? null;
  out.elapsedMs = raw.elapsedMs ?? null;
  out.scrolledPx = typeof raw.travelledPx === 'number' ? raw.travelledPx : null;
  out.scrollablePx = typeof raw.scrollablePx === 'number' ? raw.scrollablePx : null;
  out.pxPerSecond = typeof raw.pxPerSecond === 'number' ? raw.pxPerSecond : null;

  // No frames means the pass produced no samples at all.
  if (!out.frames) { out.reason = 'the scroll pass sampled no frames'; return out; }
  // Nothing to scroll through is not a clean result — there was no test.
  if (!out.scrollablePx) { out.reason = 'the pane does not scroll (content shorter than the viewport)'; return out; }
  if (!out.scrolledPx) { out.reason = 'the pass moved zero pixels'; return out; }

  if (out.settledAtRest === false) {
    // Worse than the scrolling case: the app was standing still and the viewport
    // still had blank entries in it. Never merged into 'late-content' — the two
    // have different causes and different fixes.
    out.verdict = 'blank-at-rest';
    out.reason = `${out.lateAtRest} entr${out.lateAtRest === 1 ? 'y was' : 'ies were'} still blank after ${out.settleTookMs}ms of standing still at the start position`;
  } else if (out.maxLateInViewport > 0) {
    out.verdict = 'late-content';
  } else if (out.frames < 30) {
    // Almost every frame was the app scrolling instead of us; there is no pass here.
    out.reason = `only ${out.frames} frames were this pass's own scroll (${out.jumpedFrames} were the app moving the viewport)`;
    return out;
  } else if (out.spacersSeenAnywhere === 0) {
    // The exact failure this instrument exists to prevent: reporting a pass from a
    // window where the mechanism under test never engaged. Same rule as
    // scenario-scrollback's folded() count — unproven, never ineffective.
    out.verdict = 'no-folding';
    out.reason = 'no entry was ever a spacer during the scroll, so nothing lazy was exercised — this is not a pass';
  } else {
    out.verdict = 'clean';
  }
  return out;
}

/** Severity order for rolling repeats up, worst first. See worstLateVerdict. */
export const LATE_VERDICT_SEVERITY = Object.freeze(['blank-at-rest', 'late-content', 'no-folding', 'unmeasured', 'clean']);

/**
 * The worst verdict across repeats. Exists for the same reason layout-cost's does:
 * run.mjs medians every leaf, and `median()` sorts strings with `x - y` (NaN), so a
 * repeat that caught the defect could be buried by two that did not. One blank frame
 * is the defect; it must not be averaged away.
 */
export function worstLateVerdict(verdicts) {
  const seen = new Set((verdicts ?? []).filter(Boolean));
  return LATE_VERDICT_SEVERITY.find((v) => seen.has(v)) ?? 'unmeasured';
}

/** One line for the run summary — the count first, because zero is the whole spec. */
export function formatLateContentLine(m) {
  if (!m || m.verdict === 'unmeasured') return `late content: UNMEASURED (${m?.reason ?? 'not probed'})`;
  if (m.verdict === 'blank-at-rest') return `late content: ${m.lateAtRest} BLANK ENTRIES while STANDING STILL after ${m.settleTookMs}ms — worse than a scroll artefact`;
  if (m.verdict === 'no-folding') return `late content: NOTHING LAZY RAN — ${m.totalEntriesSeen} entries, 0 spacers over ${m.frames} frames (not a pass)`;
  if (m.verdict === 'clean') return `late content: 0 blank entries in view across ${m.frames} frames at ${m.pxPerSecond} px/s`
    + `${m.jumpedFrames ? `, ${m.jumpedFrames} frame(s) skipped where the app scrolled itself` : ''}`
    + ` (${m.spacersSeenAnywhere} spacers existed off-screen)`;
  const where = m.firstLate ? ` first at scrollTop ${m.firstLate.atScrollTop}, ${m.firstLate.heightPx}px, key ${m.firstLate.key ?? '?'}` : '';
  return `late content: ${m.maxLateInViewport} BLANK ENTRIES IN VIEW (worst frame), on ${m.framesWithLate}/${m.frames} frames `
    + `at ${m.pxPerSecond} px/s over ${m.scrolledPx} of ${m.scrollablePx} px`
    + `${m.lateAfterStop ? ', still blank after scrolling stopped' : ''}${where}`;
}
