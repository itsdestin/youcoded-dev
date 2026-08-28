// scripts/perf-lab/scenario-scrollback.mjs — what does a conversation cost once the
// user has SCROLLED BACK through it?
//
// WHY this module exists, and it is the whole justification for perf cycle 3:
//
// Cycle 2 (paged history) made a conversation open at its last PAGE_TURNS turns
// instead of its whole transcript. Every memory number the rig reports was taken
// in that state, because no scenario has ever scrolled back — so
// `workload.median.pssAfterMb` (7003.7 -> 1721.1 MB across the paging change) is a
// FLOOR, not a ceiling. Scrolling up prepends a page and NOTHING removes it:
//   * chat-reducer.ts HISTORY_PAGE_LOADED prepends; there is no eviction anywhere
//     in the reducer.
//   * App.tsx renders a ChatView for EVERY open session; hidden ones only get
//     content-visibility:hidden, which skips layout but keeps the render state.
// So six long conversations scrolled to the top rebuild the pre-paging working
// set, just gradually. Reading the 75% drop as "the prize is collected" is the
// mistake this phase exists to prevent.
//
// It answers two questions the other phases cannot:
//
//   1. THE CEILING. How much memory do the same six sessions reach when each
//      loaded conversation has been scrolled to its beginning? That is the number
//      cycle 3 is actually trying to bound.
//
//   2. WHICH CHANGE WOULD BOUND IT. The rise is split three ways on purpose:
//        deltaJsHeapMb   — reducer state + React fibers. ONLY eviction frees this.
//        deltaNonJsMb    — PSS rise not explained by the JS heap: DOM nodes,
//                          layout boxes, paint. Parking a hidden view frees this
//                          and leaves the heap alone.
//        deltaDomNodes   — the node count behind that, straight from CDP.
//      "Park hidden views" and "evict off-screen turns" are NOT two ways to do the
//      same job, and this split is what says which one is the real fix. Deciding
//      between them by argument is how cycle 3 was mis-sized in the first place.
//
// And it records a CONTROL: after the scroll-back, switch away from everything and
// force a GC. Today that should release ~nothing, because nothing evicts. When
// cycle 3 ships, `releasedMb` is the metric that proves it did.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { pssMb } from './procs.mjs';
import { openJourneySessions, installPageHelpers, median, p95 } from './scenario-workload.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The resumed conversations this phase scrolls back, largest first.
 *
 * `empty` and the two native sessions are deliberately excluded: they have no
 * older history, so their sentinel never renders and scrolling them would measure
 * nothing. They still stay OPEN, because the ceiling is a six-session number and
 * dropping them would make it incomparable with workload.median.pssAfterMb.
 */
export const SCROLL_SIZES = Object.freeze(['huge', 'medium', 'small']);

/**
 * Hard stops on one conversation's scroll-back. Both are reported when hit, and a
 * capped session sets `reachedTop: false` so the ceiling is read as a FLOOR of the
 * ceiling rather than as the whole of it.
 *
 * The page cap is sized off the fixture: `huge` is 3,500 turns at PAGE_TURNS=30,
 * so ~117 pages is the real top. 200 leaves headroom without letting a runaway
 * (a cursor that never advances) spin forever.
 */
export const MAX_PAGES = 200;
export const PER_SESSION_BUDGET_MS = 180000;
/** One page load may legitimately take a while on `huge`; past this we stop asking. */
const PAGE_TIMEOUT_MS = 30000;

/**
 * Memory + DOM readings at one instant.
 *
 * jsHeapMb and domNodes come from the CDP `Performance` domain rather than from
 * `performance.memory` in the page: the CDP metrics are not subject to the
 * reduced-precision clamping the page-visible API applies, and `Nodes` counts the
 * renderer's real node total including the hidden ChatViews — which is exactly the
 * population we are asking about.
 */
let metricsEnabled = false;

/**
 * `Performance.getMetrics` returns an empty list until the domain is enabled, and
 * an empty list would silently become nulls in every reading — so the enable is a
 * one-shot with its own flag rather than a per-call cost.
 */
async function enableMetrics(app, warnings) {
  if (metricsEnabled) return;
  try {
    await app.cdp.send('Performance.enable');
    metricsEnabled = true;
  } catch (e) {
    warnings.push(`scrollback: CDP Performance.enable failed (${e.message}), so the JS-heap / DOM-node split is UNMEASURED — deltaNonJsMb will be null rather than wrong`);
  }
}

async function readMemory(app) {
  const pss = pssMb(app.family());
  let jsHeapMb = null, jsHeapTotalMb = null, domNodes = null, listeners = null;
  try {
    const { metrics } = await app.cdp.send('Performance.getMetrics');
    const by = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
    // Undefined-safe: a Chromium that stops emitting one of these must report
    // null, never 0 — a 0 here would be averaged in as "no heap", which reads as
    // a spectacular win rather than as a missing measurement.
    const mb = (v) => (typeof v === 'number' ? Math.round((v / 1048576) * 10) / 10 : null);
    jsHeapMb = mb(by.JSHeapUsedSize);
    jsHeapTotalMb = mb(by.JSHeapTotalSize);
    domNodes = typeof by.Nodes === 'number' ? by.Nodes : null;
    listeners = typeof by.JSEventListeners === 'number' ? by.JSEventListeners : null;
  } catch (e) {
    // Swallowed deliberately: the PSS half of the reading is still good, and the
    // caller reports the null so the split is UNKNOWN rather than wrong.
  }
  return { pssMb: pss.totalMb, jsHeapMb, jsHeapTotalMb, domNodes, listeners };
}

/**
 * Best-effort forced collection, so a PSS rise can be read as RETAINED rather than
 * as garbage that had not been swept yet. Without this the ceiling would be an
 * over-estimate and the control ("nothing is released today") would be unfalsifiable.
 */
async function forceGc(app) {
  try {
    await app.cdp.send('HeapProfiler.collectGarbage');
    await sleep(1500);
    return true;
  } catch {
    return false;
  }
}

/**
 * Installs `window.__perfScroll` — the in-page vocabulary for driving one
 * conversation to its beginning.
 *
 * Every selector here is verified against the shipped renderer (2026-08-28):
 *   * ChatView.tsx:890 — the scroller is `.chat-scroll`.
 *   * ChatView.tsx:895 — `{history.hasMore && <div data-history-sentinel …>}`, so
 *     the sentinel's PRESENCE is the app's own "there is older history" answer.
 *     Its ABSENCE is how we know we reached the beginning; we never infer that
 *     from a page that returned nothing, which would also be true of a failure.
 *   * ChatView.tsx:676 — hidden views carry aria-hidden, so every query is scoped
 *     to the visible pane or it would sum six conversations.
 */
async function installScrollHelpers(cdp) {
  await cdp.evaluate(`(() => {
    const panes = () => Array.prototype.slice.call(document.querySelectorAll('.chat-scroll'));
    const visiblePane = () => panes().find((el) => !el.closest('[aria-hidden="true"]')) || null;
    const entries = (p) => p.querySelectorAll('.timeline-entry').length;
    const sentinel = (p) => p.querySelector('[data-history-sentinel]');

    window.__perfScroll = {
      state: () => {
        const p = visiblePane();
        if (!p) return { ok: false, reason: 'no visible .chat-scroll' };
        return { ok: true, entries: entries(p), hasMore: !!sentinel(p), scrollHeight: p.scrollHeight, scrollTop: p.scrollTop };
      },

      /**
       * One page turn, driven the way a user drives it: put the scroller at the
       * top so the sentinel crosses the IntersectionObserver, then wait for the
       * entry count to GROW.
       *
       * Growth — not "loading turned false", and not "the cursor moved" — is the
       * settle condition, because it is the only one that proves the page reached
       * the screen. A cursor can advance on a page the renderer then drops.
       */
      turnPage: async (timeoutMs) => {
        const p = visiblePane();
        if (!p) return { ok: false, reason: 'no visible .chat-scroll' };
        if (!sentinel(p)) return { ok: true, done: true, entries: entries(p) };
        const before = entries(p);
        const t0 = performance.now();
        p.scrollTop = 0;
        while (performance.now() - t0 < timeoutMs) {
          await new Promise((r) => requestAnimationFrame(r));
          const q = visiblePane();
          if (!q) return { ok: false, reason: 'the visible pane vanished mid-page' };
          const n = entries(q);
          if (n > before) {
            return { ok: true, done: false, ms: Math.round(performance.now() - t0), entries: n, added: n - before, hasMore: !!sentinel(q) };
          }
          // The sentinel disappearing WITHOUT growth means the app decided there
          // is no older history after all — the beginning of the conversation.
          if (!sentinel(q)) return { ok: true, done: true, ms: Math.round(performance.now() - t0), entries: n, added: 0 };
          // Re-pin to the top: a restored scroll anchor moves us off it, and a
          // sentinel that is no longer within rootMargin never fires again.
          if (q.scrollTop > 0) q.scrollTop = 0;
        }
        return { ok: false, timedOut: true, ms: Math.round(performance.now() - t0), entries: entries(visiblePane() || p), reason: 'a page turn did not add any entries before the timeout' };
      },
    };
    return true;
  })()`);
}

/** What this scenario measures — see scenario-workload.mjs MEASURES for why these exist. */
export const MEASURES = {
  scenario: 'scrollback',
  question: 'How much memory does the app accumulate when the user scrolls back through long conversations, and is any of it ever released?',
  configuration: [
    'the SAME six sessions the workload phase opens (openJourneySessions), so the floor and the ceiling are comparable numbers',
    'each of the three RESUMED conversations (huge, medium, small) is scrolled to its beginning, one at a time, largest first',
    'a page turn is driven the way a user drives it — scroll the pane to the top and wait for the entry count to GROW; the app\'s own data-history-sentinel (rendered only while history.hasMore) is what says whether there is more',
    'nothing streams during this phase: the only thing growing the window is the scroll-back itself',
    'the ceiling is read AFTER a forced GC, so a rise means retained memory rather than uncollected garbage',
  ],
  clocks: {
    'floor.pssMb': 'whole-process PSS with all six sessions open and NOTHING scrolled — the paged state every other phase measures',
    'ceiling.pssMb': 'the same reading after all three conversations have been scrolled to the beginning, post-GC',
    deltaPssMb: 'ceiling - floor: what scrolling back costs. THE cycle-3 number.',
    deltaJsHeapMb: 'the share of that rise in the JS heap — reducer state and React fibers. Only EVICTION frees this.',
    deltaNonJsMb: 'the rise NOT explained by the JS heap — DOM, layout, paint. PARKING a hidden view frees this.',
    releasedMb: 'ceiling - (reading after switching away from every scrolled session and forcing a GC). Expected ~0 today, because nothing evicts; this is the metric a cycle-3 change has to move.',
    'perSize.*.pageMedianMs': 'how long one page turn takes, per conversation — does scrolling back get slower as the window grows?',
  },
  blindTo: [
    'conversations larger than the fixture huge transcript (3,500 turns)',
    'whether the user would ever scroll this far — this is a CEILING, deliberately the worst case, not a typical session',
    'the cost of scrolling back DOWN again, and of re-rendering a conversation whose pages were evicted (there is no eviction to measure yet)',
    'anything requiring a real GPU — the rig runs headless under Xvfb, so the paint half of deltaNonJsMb is a software-raster figure',
    'per-session attribution of PSS: /proc reports the whole app family, so a per-conversation delta is only clean because they are scrolled ONE AT A TIME',
  ],
};

/** The fields compare.mjs may take a median of across repeats. */
export const NUMERIC_KEYS = [
  'floorPssMb', 'ceilingPssMb', 'deltaPssMb',
  'floorJsHeapMb', 'ceilingJsHeapMb', 'deltaJsHeapMb', 'deltaNonJsMb',
  'floorDomNodes', 'ceilingDomNodes', 'deltaDomNodes',
  'releasedMb', 'totalPagesLoaded', 'totalEntriesLoaded',
];

/** Median of the numbers in `xs`; null (never NaN) if there are none. */
function med(xs) {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

/**
 * Median of each numeric metric across runs, plus the per-size block.
 * A metric that was null in every run stays null, so it reads as ABSENT downstream
 * rather than as a suspiciously good 0.
 */
export function medianRun(runs) {
  const out = Object.fromEntries(NUMERIC_KEYS.map((k) => [k, med(runs.map((r) => r[k]))]));
  out.perSize = {};
  for (const size of SCROLL_SIZES) {
    const legs = runs.map((r) => r.perSize?.[size]).filter(Boolean);
    if (!legs.length) continue;
    out.perSize[size] = {
      pages: med(legs.map((l) => l.pages)),
      entriesAfter: med(legs.map((l) => l.entriesAfter)),
      pageMedianMs: med(legs.map((l) => l.pageMedianMs)),
      pageP95Ms: med(legs.map((l) => l.pageP95Ms)),
      pssAfterMb: med(legs.map((l) => l.pssAfterMb)),
      jsHeapAfterMb: med(legs.map((l) => l.jsHeapAfterMb)),
      // Not a median: a size that failed to reach the top in ANY repeat makes the
      // ceiling a floor, and that must not be averaged away.
      reachedTopEveryRun: legs.every((l) => l.reachedTop === true),
    };
  }
  return out;
}

/**
 * @param {{cdp: {evaluate(expr: string): Promise<any>, send(m: string, p?: object): Promise<any>}, family(): number[]}} app
 */
export async function runScrollbackScenario(app, fixture, { onProgress } = {}) {
  const cdp = app.cdp;
  const ids = [];
  const warnings = [];
  try {
    await installPageHelpers(cdp);
    await installScrollHelpers(cdp);
    await enableMetrics(app, warnings);

    const { names, sizeByName } = await openJourneySessions(cdp, fixture, { ids, warnings });

    // Let the six panes finish their first paged render before baselining, or the
    // "floor" would include work that was still in flight and the delta would be
    // credited to the scroll-back.
    await sleep(3000);
    await forceGc(app);
    const floor = await readMemory(app);

    const perSize = {};
    let totalPagesLoaded = 0;

    for (const size of SCROLL_SIZES) {
      const name = Object.keys(sizeByName).find((n) => sizeByName[n] === size);
      if (!name) {
        warnings.push(`scrollback: no open session carries the '${size}' transcript, so it was never scrolled — the ceiling is missing that conversation's contribution`);
        continue;
      }
      const listIdx = names.indexOf(name);
      const sw = await cdp.evaluate(
        `window.__perfLab.switchTo(${listIdx}, ${JSON.stringify(name)}, ${ids.length}, false, null, false)`);
      if (sw.mode === 'none' || !sw.ok) {
        warnings.push(`scrollback: could not bring '${size}' (${name}) on screen — ${sw.reason ?? 'the visible pane did not change'}. It was NOT scrolled, so the ceiling is short by that conversation.`);
        continue;
      }
      // Settle after the switch: a switch into huge still repaints, and a page
      // turn issued mid-repaint would be timed against that repaint.
      await sleep(1500);

      const pageMs = [];
      let reachedTop = false, timedOut = false, pages = 0;
      const legT0 = Date.now();
      let last = await cdp.evaluate(`window.__perfScroll.state()`);
      if (!last.ok) {
        warnings.push(`scrollback: ${size}: ${last.reason} — nothing was scrolled`);
        continue;
      }
      const entriesBefore = last.entries;
      while (pages < MAX_PAGES && Date.now() - legT0 < PER_SESSION_BUDGET_MS) {
        const r = await cdp.evaluate(`window.__perfScroll.turnPage(${PAGE_TIMEOUT_MS})`);
        if (!r.ok) {
          timedOut = !!r.timedOut;
          warnings.push(`scrollback: ${size}: ${r.reason} after ${pages} pages (${r.entries} entries on screen). Its share of the ceiling is a FLOOR.`);
          break;
        }
        if (r.done) { reachedTop = true; break; }
        pages++;
        if (typeof r.ms === 'number') pageMs.push(r.ms);
        last = r;
      }
      if (!reachedTop && !timedOut && pages >= MAX_PAGES) {
        warnings.push(`scrollback: ${size}: stopped at the ${MAX_PAGES}-page cap without reaching the beginning — the ceiling is a FLOOR for this conversation`);
      }
      if (!reachedTop && !timedOut && Date.now() - legT0 >= PER_SESSION_BUDGET_MS) {
        warnings.push(`scrollback: ${size}: stopped at the ${Math.round(PER_SESSION_BUDGET_MS / 1000)}s budget after ${pages} pages — the ceiling is a FLOOR for this conversation`);
      }

      const after = await readMemory(app);
      const state = await cdp.evaluate(`window.__perfScroll.state()`);
      totalPagesLoaded += pages;
      perSize[size] = {
        pages,
        entriesBefore,
        entriesAfter: state.ok ? state.entries : null,
        reachedTop,
        pageMedianMs: median(pageMs),
        pageP95Ms: p95(pageMs),
        pssAfterMb: after.pssMb,
        jsHeapAfterMb: after.jsHeapMb,
        domNodesAfter: after.domNodes,
      };
      onProgress?.({ size, pages, reachedTop, entries: perSize[size].entriesAfter, pssMb: after.pssMb });
    }

    // ── The ceiling ──────────────────────────────────────────────────────
    // GC first: a rise that a collection removes was never retained, and reporting
    // it would over-state the prize cycle 3 is chasing.
    const gcOk = await forceGc(app);
    if (!gcOk) warnings.push('scrollback: HeapProfiler.collectGarbage was refused, so the ceiling may include garbage that had not been swept — read deltaPssMb as an upper bound');
    const ceiling = await readMemory(app);

    // ── The control: does switching away release anything? ───────────────
    // Today it must not (nothing evicts, hidden views stay mounted). This reading
    // exists so a cycle-3 change has something to move, and so "we already free it
    // on switch" can be refuted with a number instead of an argument.
    const emptyName = Object.keys(sizeByName).find((n) => sizeByName[n] === 'empty');
    let released = null;
    if (emptyName) {
      const sw = await cdp.evaluate(
        `window.__perfLab.switchTo(${names.indexOf(emptyName)}, ${JSON.stringify(emptyName)}, ${ids.length}, false, null, false)`);
      if (sw.ok) {
        await sleep(3000);
        await forceGc(app);
        const idle = await readMemory(app);
        released = { ...idle, releasedMb: round1(ceiling.pssMb - idle.pssMb) };
      } else {
        warnings.push('scrollback: could not switch to the empty control session, so "is anything released on switch?" was not measured');
      }
    }

    return {
      floor, ceiling, released, perSize, warnings,
      ...riseSplit(floor, ceiling),
      releasedMb: released ? released.releasedMb : null,
      totalPagesLoaded,
      totalEntriesLoaded: Object.values(perSize).reduce(
        (n, l) => n + ((l.entriesAfter ?? 0) - (l.entriesBefore ?? 0)), 0),
      sessionsCreated: ids.length,
    };
  } finally {
    // Always tear the six sessions down: this phase owns its boot, but a leaked
    // session would keep its transcript file open and the next repeat's fixture
    // rebuild would fight it.
    while (ids.length) {
      const id = ids.shift();
      try { await cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`); } catch { /* already gone */ }
    }
  }
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The floor -> ceiling deltas, split into the share each candidate change would free.
 *
 * Exported and pure because this arithmetic is the phase's entire conclusion, and the
 * ONE way it can lie is by reporting a 0 where it means "not measured":
 *   * deltaNonJsMb is PSS-rise minus heap-rise. If the CDP Performance domain gave
 *     nothing, the heap rise is null and the subtraction would be NaN — or, with a
 *     `?? 0`, would confidently attribute the ENTIRE rise to the DOM and point cycle 3
 *     at parking when eviction was the answer. It returns null instead, and
 *     validateReport fails the report rather than letting the gate read the null.
 * Guard: tests/scenario-scrollback.test.mjs.
 */
export function riseSplit(floor, ceiling) {
  const sub = (a, b) => (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)
    ? round1(a - b) : null);
  const deltaPssMb = sub(ceiling.pssMb, floor.pssMb);
  const deltaJsHeapMb = sub(ceiling.jsHeapMb, floor.jsHeapMb);
  return {
    floorPssMb: floor.pssMb ?? null,
    ceilingPssMb: ceiling.pssMb ?? null,
    deltaPssMb,
    floorJsHeapMb: floor.jsHeapMb ?? null,
    ceilingJsHeapMb: ceiling.jsHeapMb ?? null,
    deltaJsHeapMb,
    deltaNonJsMb: (deltaPssMb != null && deltaJsHeapMb != null) ? round1(deltaPssMb - deltaJsHeapMb) : null,
    floorDomNodes: floor.domNodes ?? null,
    ceilingDomNodes: ceiling.domNodes ?? null,
    deltaDomNodes: sub(ceiling.domNodes, floor.domNodes),
  };
}
