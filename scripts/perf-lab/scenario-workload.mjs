// scripts/perf-lab/scenario-workload.mjs — the "real use" journey: six mixed
// sessions open at once, a transcript streaming into three of them, and the user
// switching between them over and over, while a probe records long tasks and
// dropped frames.
//
// WHY this scenario exists: every other scenario measures a COLD number (how long
// did boot take, how big is the heap at idle). This is the only one that measures
// RESPONSIVENESS UNDER LOAD — the thing a user actually feels. Two of its outputs
// (`workload.median.switchP95Ms`, `workload.median.probe.longtaskTotalMs`) are
// PRIMARY keep/reject metrics in compare.mjs, so every number here has to be one
// the app really produced, never one the rig faked.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { appendFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { waitFor } from './cdp.mjs';
import { cpuSnapshot, cpuPercent, pssMb } from './procs.mjs';
import { ccProjectSlug, transcriptLines } from './fixture.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Upper-middle element of the sorted samples; null for an empty set (never NaN). */
export function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}
/** 95th percentile by nearest-rank, clamped to the last element; null when empty. */
export function p95(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : null;
}
const round1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);

/**
 * How many visits to each session get the full "wait for the messages" clock.
 * The rest time the container swap only. See the sampling comment in the switch
 * loop: measuring all 40 cost 10 minutes a repeat and moved the switches outside
 * the CPU window the scenario claims they sit in.
 */
export const PAINTED_SAMPLES_PER_SESSION = 3;

// ---------------------------------------------------------------------------
// Responsiveness probe
// ---------------------------------------------------------------------------

/**
 * Installs `window.__perfProbe` — a long-task observer plus an rAF frame-gap
 * watcher — replacing any probe already installed.
 *
 * WHY the teardown matters (this is a correctness fix, not tidiness):
 * runWorkloadScenario runs 3-4 times per report against the SAME page. The first
 * draft re-armed its rAF loop forever and never disconnected its observer, so
 * run 2 stacked a second loop on top of run 1's, run 3 a third — and the orphaned
 * loops kept pushing into the OLD `log` array while `window.__perfProbe` pointed
 * at a new one. Frame-gap counts would have grown run over run for no reason but
 * the rig's own leak, which is exactly how a "regression" gets invented.
 * So: stop the previous probe (cancelAnimationFrame + observer.disconnect)
 * before installing, and expose stop() so the caller can tear it down when the
 * scenario ends rather than leaving it burning a callback per frame through
 * every later screenshot.
 */
export async function installProbe(cdp) {
  return cdp.evaluate(`(() => {
    try { if (window.__perfProbe && window.__perfProbe.stop) window.__perfProbe.stop(); } catch (e) { /* previous probe already gone */ }
    const t0 = performance.now();
    const log = [];
    let raf = 0, obs = null, frames = 0, last = null, longtaskSupported = false;
    const tick = () => {
      const n = performance.now();
      frames++;
      // WHY \`last !== null\` and not a timestamp seeded at install: the first tick
      // fires on the NEXT animation frame, so a gap measured from install time is
      // an artifact of when the rig happened to call in, not a dropped frame.
      // The first sample is discarded on purpose.
      if (last !== null && n - last > 40) log.push(['frame-gap', Math.round(n - t0), Math.round(n - last)]);
      last = n;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    try {
      obs = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) log.push(['longtask', Math.round(e.startTime - t0), Math.round(e.duration)]);
      });
      obs.observe({ entryTypes: ['longtask'] });
      longtaskSupported = true;
    } catch (err) {
      // Record the REAL reason rather than silently reporting zero long tasks —
      // "0 long tasks" and "the observer never attached" must not look alike.
      log.push(['probe-error', 0, 'longtask observer failed: ' + (err && err.message ? err.message : String(err))]);
    }
    window.__perfProbe = {
      t0, log, longtaskSupported, stoppedAt: null,
      mark: (label) => log.push(['mark', Math.round(performance.now() - t0), label]),
      frameCount: () => frames,
      stop() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (obs) { try { obs.disconnect(); } catch (e) { /* already disconnected */ } obs = null; }
        if (this.stoppedAt === null) this.stoppedAt = performance.now();
      },
    };
    return { longtaskSupported };
  })()`);
}

/** Stops the probe if one is installed. Safe to call twice, or with none installed. */
export async function stopProbe(cdp) {
  return cdp.evaluate(`(() => {
    if (!window.__perfProbe) return false;
    window.__perfProbe.stop();
    return true;
  })()`);
}

/**
 * Reads the probe's totals. Throws (with the real reason) rather than returning
 * zeros if no probe is installed — a silent 0 would read as "perfectly smooth".
 *
 * `framesPerSec` is reported alongside the frame-gap numbers ON PURPOSE. The rig
 * runs headless under Xvfb, where there is no real compositor: if Chromium
 * throttles requestAnimationFrame, EVERY "gap" is an artifact of the throttle and
 * not of the app. A reader comparing two runs must be able to see that — a
 * frame-gap count taken at 3 fps means nothing, at 60 fps it means a lot.
 * Long tasks do not have this problem (they are main-thread task durations, not
 * frame timings), which is why longtaskTotalMs is the PRIMARY metric of the two.
 */
export async function readProbe(cdp) {
  return cdp.evaluate(`(() => {
    const p = window.__perfProbe;
    if (!p) throw new Error('readProbe: window.__perfProbe is not installed — installProbe() was never run on this page, or the page reloaded since.');
    const L = p.log;
    const lt = L.filter((e) => e[0] === 'longtask').map((e) => e[2]);
    const fg = L.filter((e) => e[0] === 'frame-gap').map((e) => e[2]);
    const end = p.stoppedAt === null ? performance.now() : p.stoppedAt;
    const observedMs = Math.round(end - p.t0);
    const frames = p.frameCount();
    return {
      longtaskCount: lt.length,
      longtaskTotalMs: lt.reduce((a, b) => a + b, 0),
      longtaskMaxMs: Math.max(0, ...lt),
      frameGapCount: fg.length,
      frameGapMaxMs: Math.max(0, ...fg),
      longtaskSupported: p.longtaskSupported,
      observedMs,
      frames,
      framesPerSec: observedMs > 0 ? Math.round((frames / observedMs) * 1000 * 10) / 10 : null,
      marks: L.filter((e) => e[0] === 'mark').map((e) => ({ t: e[1], label: e[2] })),
      errors: L.filter((e) => e[0] === 'probe-error').map((e) => e[2]),
    };
  })()`);
}

/**
 * The same totals as readProbe(), but restricted to the span between two marks.
 *
 * WHY this exists: the probe is installed at the very start, so `probe` covers
 * the WHOLE journey — six session creations and a llama.cpp engine spawn
 * included. That is a fair number to compare baseline against candidate, but it
 * is not "responsiveness while the app is under load". This gives the sharper
 * one without replacing the broad one, so a reader can see whether a long-task
 * change came from the workload or from session setup.
 *
 * Long-task entries are stamped at their START, frame gaps at their END; an
 * entry straddling a boundary therefore lands on one side, not both.
 */
export async function readProbeWindow(cdp, fromLabel, toLabel) {
  return cdp.evaluate(`(() => {
    const p = window.__perfProbe;
    if (!p) throw new Error('readProbeWindow: window.__perfProbe is not installed — installProbe() was never run on this page, or the page reloaded since.');
    const at = (label) => { const m = p.log.find((e) => e[0] === 'mark' && e[2] === label); return m ? m[1] : null; };
    const from = at(${JSON.stringify(fromLabel)});
    const to = at(${JSON.stringify(toLabel)});
    if (from === null || to === null) {
      // Say which mark is missing rather than silently returning the full run.
      return { windowMs: null, missingMark: from === null ? ${JSON.stringify(fromLabel)} : ${JSON.stringify(toLabel)} };
    }
    const inWin = p.log.filter((e) => e[1] >= from && e[1] <= to);
    const lt = inWin.filter((e) => e[0] === 'longtask').map((e) => e[2]);
    const fg = inWin.filter((e) => e[0] === 'frame-gap').map((e) => e[2]);
    return {
      windowMs: to - from,
      longtaskCount: lt.length,
      longtaskTotalMs: lt.reduce((a, b) => a + b, 0),
      longtaskMaxMs: Math.max(0, ...lt),
      frameGapCount: fg.length,
      frameGapMaxMs: Math.max(0, ...fg),
    };
  })()`);
}

const mark = (cdp, label) =>
  cdp.evaluate(`(() => { if (window.__perfProbe) window.__perfProbe.mark(${JSON.stringify(label)}); return true; })()`);

// ---------------------------------------------------------------------------
// In-page helpers
// ---------------------------------------------------------------------------

/**
 * Installs `window.__perfLab`, the DOM vocabulary this scenario drives the app
 * through. Everything here was checked against the renderer source:
 *
 *  - The session strip container is `[data-session-strip]` / `.session-strip`
 *    (SessionStrip.tsx:760, :766). SCOPING TO IT IS MANDATORY: `data-session-idx`
 *    is on the visible pill button (:782) AND on every row of the overflow
 *    dropdown (:921), and that dropdown lists ALL sessions (:915 maps `sessions`),
 *    not just overflowed ones. An unscoped `[data-session-idx="i"]` can therefore
 *    match a hidden menu row. The dropdown is portalled to #root (:1168) so it is
 *    never inside the strip — the scope is a real fence.
 *  - The pill's index is its position in `visibleSessions` (:770), NOT in the full
 *    session list, and `visibleSessions` drops whatever did not fit. So the index
 *    only equals the session-list index when NOTHING overflowed. Hence the
 *    two-step lookup: index when the counts prove no overflow, otherwise the
 *    pill's `title` attribute, which is `s.name` verbatim (:820).
 *  - Every open session keeps a MOUNTED ChatView; hidden ones are hidden with
 *    visibility/content-visibility, not unmounted (ChatView.tsx:687-707, whose own
 *    comment says "App renders a ChatView for EVERY open session"). With six
 *    sessions there are six `.chat-scroll` elements (ChatView.tsx:749) in the
 *    document at once, so `querySelector('.chat-scroll')` returns whichever is
 *    first in DOM order — usually the WRONG session. The visible one is the only
 *    ChatView root without `aria-hidden` (`aria-hidden={visible ? undefined : true}`,
 *    ChatView.tsx:676). Do NOT use the neighbouring `inert` prop (:675) instead:
 *    React serialises `inert={false}` as `inert=""` on some versions, which makes
 *    an `[inert]` test match every pane and the answer always empty.
 */
async function installPageHelpers(cdp) {
  await cdp.evaluate(`(() => {
    const strip = () => document.querySelector('[data-session-strip]') || document.querySelector('.session-strip');
    const pills = () => { const s = strip(); return s ? Array.prototype.slice.call(s.querySelectorAll('[data-session-idx]')) : []; };
    const panes = () => Array.prototype.slice.call(document.querySelectorAll('.chat-scroll'));
    // -1 means "no visible pane at all", which must stay distinguishable from 0
    // ("the first pane is the visible one"). Never collapse them.
    const visiblePaneIdx = () => panes().findIndex((el) => !el.closest('[aria-hidden="true"]'));
    const visiblePane = () => { const i = visiblePaneIdx(); return i < 0 ? null : panes()[i]; };
    const nextFrame2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    window.__perfLab = {
      strip, pills, panes, visiblePane, visiblePaneIdx, nextFrame2,
      paneCount: () => panes().length,
      // -1 = no visible pane (see above); a real empty pane reports 0.
      chatLen: () => { const p = visiblePane(); return p ? p.innerText.length : -1; },

      /**
       * Click the pill for one session and time the click through to the frame
       * after the switch has painted.
       *
       * The bare IPC \`window.claude.session.switch(id)\` is NOT used as a fallback:
       * on desktop that handler is a parity stub that returns { ok: true } and
       * changes nothing (ipc-handlers.ts:820-824 — "Switch is a client-side
       * concern on desktop"). Timing it would report a ~0 ms switch that never
       * happened. When the pill is not in the strip the real user path is the
       * overflow dropdown, so that is what we drive, and it is reported and
       * aggregated SEPARATELY because it also pays for opening a menu.
       */
      switchTo: async (listIdx, name, sessionCount, measurePainted) => {
        const t0 = performance.now();
        const paneBefore = visiblePaneIdx();
        const ps = pills();
        // Index is only meaningful when every session got a pill (no overflow).
        let el = (ps.length === sessionCount && listIdx < ps.length) ? ps[listIdx] : null;
        if (!el) el = ps.find((p) => p.getAttribute('title') === name) || null;
        let mode = el ? 'pill' : 'menu';
        if (!el) {
          const trigger = document.querySelector('[data-session-strip] [title="All Sessions"]')
            || document.querySelector('.session-strip [title="All Sessions"]');
          if (!trigger) return { ms: null, mode: 'none', ok: false, reason: 'no pill for this session and no "All Sessions" trigger in the strip' };
          trigger.click();
          await nextFrame2();
          // The dropdown is portalled OUTSIDE the strip, and its rows index the
          // full session list — so listIdx is the right index here.
          const rows = Array.prototype.slice.call(document.querySelectorAll('[data-session-idx]'))
            .filter((r) => !r.closest('[data-session-strip]') && !r.closest('.session-strip'));
          el = rows.find((r) => Number(r.getAttribute('data-session-idx')) === listIdx) || null;
          if (!el) return { ms: null, mode: 'none', ok: false, reason: 'overflow menu opened but no row with data-session-idx=' + listIdx };
        }
        el.click();
        await nextFrame2();
        const paneAfter = visiblePaneIdx();
        const paneMs = Math.round((performance.now() - t0) * 10) / 10;

        // ── Second clock: wait for the CONTENT, not just the container ──────
        //
        // WHY TWO CLOCKS AND NOT ONE. paneMs stops two rAFs after the click.
        // That is defensible — rAF callbacks cannot run while the main thread is
        // blocked, and the second rAF fires only after frame 1's layout+paint has
        // completed, so a blocking render SHOULD show up in it. But "should" is
        // exactly the word that produced two wrong findings in this project
        // already, so we no longer argue about it: we measure both and let the
        // report show whether they agree.
        //
        // If settleMs is ~0 everywhere, paneMs was always sufficient and this
        // costs us nothing. If settleMs is large while paneMs stays small,
        // then the pane swaps early and the messages arrive later — the switch
        // number was measuring the container, and every "switching is fine"
        // reading taken from it was measuring the wrong thing.
        //
        // Counts .timeline-entry inside the VISIBLE pane only. Every open
        // session keeps a mounted ChatView (see this file's header), so an
        // unscoped count would sum every session's messages and never settle.
        const settleT0 = performance.now();
        let last = -1, stableFrames = 0, settled = false;
        while (measurePainted && performance.now() - settleT0 < 20000) {
          const p = visiblePane();
          const n = p ? p.querySelectorAll('.timeline-entry').length : -1;
          // Settle on a STABLE count, whether or not that count is zero.
          //
          // The first draft required n > 0, reasoning that a 0 which is stable
          // immediately would report an instant switch into a conversation that
          // never rendered. Measured 2026-08-27: that guard inverted the failure
          // rather than removing it. An EMPTY conversation has 0 entries forever,
          // so it could never satisfy n > 0, spun to the 20s cap, and reported
          // 21,686 ms for a switch that is genuinely instant — turning the one
          // session that exists as a CONTROL into the slowest number in the table.
          //
          // A stable 0 is now an honest settle, and the entries field travels with the
          // timing so a reader can tell "empty conversation, fast switch" from
          // "loaded conversation that rendered nothing". n < 0 means no visible
          // pane at all, which is never a settle.
          if (n >= 0 && n === last) { if (++stableFrames >= 3) { settled = true; break; } }
          else { stableFrames = 0; last = n; }
          await new Promise((r) => requestAnimationFrame(r));
        }
        const settleMs = Math.round((performance.now() - settleT0) * 10) / 10;

        // A switch we chose not to measure reports null, never 0: a zero here
        // would be averaged in as an instantaneous switch.
        const painted = measurePainted;
        return {
          ms: paneMs,
          measuredPainted: !!painted,
          // Click through to the messages actually being on screen. This is the
          // number a user would recognise as "how long the switch took".
          paintedMs: painted ? Math.round((paneMs + settleMs) * 10) / 10 : null,
          settleMs: painted ? settleMs : null,
          // false = the entry count never held still for three frames. The
          // timings are then a floor, not a measurement, and must not be read
          // as a fast switch.
          settled: painted ? settled : null,
          entries: painted ? last : null,
          mode,
          // The switch is only counted as real if the visible pane actually moved.
          ok: paneAfter >= 0 && paneAfter !== paneBefore,
          paneBefore, paneAfter,
        };
      },
    };
    return true;
  })()`);
}

/** Creates one session and reports how long the create invoke took. */
async function createSession(cdp, opts) {
  const r = await cdp.evaluate(`(async () => {
    const t0 = performance.now();
    try {
      const s = await window.claude.session.create(${JSON.stringify(opts)});
      return { id: s.id, name: s.name, ms: Math.round(performance.now() - t0), provider: s.provider, harnessId: s.harnessId };
    } catch (err) {
      // Surface the app's OWN error text — session-manager throws a specific
      // message (e.g. "a new native session requires a model binding") and
      // replacing it with a guess would send the next session down the wrong path.
      return { error: (err && err.message) ? err.message : String(err) };
    }
  })()`);
  if (r.error) throw new Error(`session.create(${JSON.stringify(opts.name)}) failed in the app: ${r.error}`);
  return r;
}

/**
 * Waits for one freshly-created Claude Code session to finish initialising.
 * The overlay text is `Initializing session...` (App.tsx:2871).
 *
 * Two phases on purpose: a bare "wait until the text is absent" is satisfied
 * INSTANTLY if the overlay has not mounted yet, which would measure nothing and
 * pile the next create on top of an unready one. So we give the overlay a short
 * window to appear first — and if it never does (the create finished faster than
 * the poll), that is fine and we move on rather than failing the run.
 */
async function waitForSessionReady(cdp, { appearMs = 1500, clearMs = 30000 } = {}) {
  const gone = `!document.body.innerText.includes('Initializing session')`;
  const t0 = Date.now();
  let appeared = false;
  // The overlay renders for the ACTIVE session as soon as create resolves
  // (App.tsx:2868 — `!sessionInitialized && sessionId && …`), so a frame or two
  // is normally all this costs. The cap is deliberately short: when it expires
  // we have simply learned nothing, and paying it four times per run for a
  // session that was already ready would be pure overhead.
  while (Date.now() - t0 < appearMs) {
    if (!(await cdp.evaluate(gone))) { appeared = true; break; }
    await sleep(25);
  }
  await waitFor(cdp, gone, { timeoutMs: clearMs, everyMs: 100 });
  return { appeared };
}

// ---------------------------------------------------------------------------
// Transcript streamer
// ---------------------------------------------------------------------------

const transcriptDir = (fixture, cwd) => join(fixture.home, '.claude', 'projects', ccProjectSlug(cwd));

function listTranscripts(dir) {
  try { return readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { return []; }
}

/**
 * Picks the transcripts to stream into: the files that appeared in the two
 * project dirs while we were creating the CC sessions.
 *
 * A set difference, not "the N newest by mtime". WHY: the fixture PRE-BUILDS
 * three transcripts in the alpha project (small/medium/huge — fixture.mjs), and
 * the huge one is ~30 MB. Ranking by mtime would work only as long as nothing
 * touched a pre-built file, and if it ever ranked wrong the rig would append to
 * a 30 MB transcript — a completely different, much heavier workload that would
 * look like a mysterious regression. The pre-built paths are also excluded
 * explicitly as a second fence. mtime is used only to order the NEW files.
 */
export function pickStreamTargets(fixture, before, { count = 3 } = {}) {
  const prebuilt = new Set(Object.values(fixture.transcripts ?? {}).map((t) => t.path));
  const fresh = [];
  for (const cwd of [fixture.projects.alpha, fixture.projects.beta]) {
    const dir = transcriptDir(fixture, cwd);
    const seen = before.get(dir) ?? new Set();
    for (const f of listTranscripts(dir)) {
      if (seen.has(f)) continue;
      const p = join(dir, f);
      if (prebuilt.has(p)) continue;
      let m = 0;
      try { m = statSync(p).mtimeMs; } catch { continue; }
      // The file's stem IS the Claude Code session id — fake-claude.cjs names the
      // transcript `<sessionId>.jsonl`, exactly as real CC does.
      fresh.push({ path: p, cwd, mtimeMs: m, sessionId: basename(f, '.jsonl') });
    }
  }
  fresh.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return fresh.slice(0, count);
}

/**
 * Appends one complete turn (a user line + an assistant line) to each target
 * every `everyMs`, until stopped.
 *
 * This is REAL load on the app, verified against the watcher rather than assumed:
 *  - TranscriptWatcher tails the file by byte offset (transcript-watcher.ts:597-744)
 *    and picks the path once at startWatching (:362-393). The `sessionId` FIELD
 *    inside a line is never read — parseTranscriptLine stamps events with the
 *    DESKTOP session id passed in by the caller (:665). So matching is purely by
 *    file path and a mismatched id would NOT be skipped. We still write the file's
 *    true session id (its filename stem) so nothing downstream ever sees a
 *    transcript contradicting itself.
 *  - Assistant lines are deduped by `uuid` (:687-700): repeating one uuid would
 *    make every line after the first render nothing. transcriptLines() mints a
 *    fresh randomUUID per line, so each turn is genuinely new.
 *  - The renderer's chat reducer is keyed by sessionId (chat-reducer.ts:358) and
 *    every open session has a mounted ChatView, so a stream into a NON-active
 *    session still does full reducer + React work. That is the point.
 *
 * Both lines of the turn are written, not just the assistant one, so the
 * parentUuid chain stays valid and the app sees the same user→assistant cycle a
 * real conversation produces.
 */
function startStreamer(targets, { everyMs = 150 } = {}) {
  const state = { lines: 0, turns: 0, errors: [] };
  const timer = setInterval(() => {
    for (const t of targets) {
      try {
        const lines = transcriptLines({ sessionId: t.sessionId, cwd: t.cwd, turns: 1, startedAt: Date.now() });
        appendFileSync(t.path, lines.join('\n') + '\n');
        state.lines += lines.length;
        state.turns += 1;
      } catch (err) {
        // Keep streaming, but keep the REAL reason — a silently-dead streamer
        // would turn "no load at all" into a fake clean result.
        if (state.errors.length < 5) state.errors.push(`${t.path}: ${err.message}`);
      }
    }
  }, everyMs);
  return { state, stop: () => clearInterval(timer) };
}

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

/**
 * @param {object} app       launch.mjs App — { cdp, family(), … }
 * @param {object} fixture   fixture.mjs FixtureInfo
 * @param {object} [opts]
 * @param {number} [opts.cpuSampleSeconds=40] length of the workload window; the
 *   streamer, the switch loop and the CPU sample all span exactly this window.
 * @param {number} [opts.switchCount=40] switches performed inside that window.
 * @param {boolean} [opts.keepSessions=false] leave the six sessions open.
 */
/**
 * What this scenario actually measures — the anti-recurrence guard.
 *
 * WHY THIS EXISTS. Three times this project has drawn a confident conclusion from
 * a number measured in a configuration where the defect could not appear:
 *   - idle sampled with ZERO sessions open, so a per-session cost read as zero;
 *   - the app-wide freeze attributed from a RAW total, so the wrong thread was blamed;
 *   - session switching timed between EMPTY conversations, so 118 ms read as healthy.
 * None of those failed loudly. Each returned a clean number.
 *
 * So every scenario now states its configuration in the report itself. A reader
 * seeing "switching: 118 ms" also sees what was being switched between and where
 * the clock started and stopped, and can judge whether the number means what its
 * name implies. It is cheap, and it is the only guard that addresses the class
 * rather than the three instances.
 */
export const MEASURES = {
  scenario: 'workload',
  question: 'Is the app responsive while several sessions are open, one is streaming, and the user switches between them?',
  configuration: [
    '6 sessions open at once (4 Claude Code + 2 native)',
    '3 of the 4 CC sessions are RESUMED from real transcripts (huge, medium, small); the 4th is deliberately left EMPTY as a control',
    'a transcript streams into 3 sessions throughout the window',
    '40 switches spread evenly across the same window the CPU sample covers',
  ],
  clocks: {
    switchMedianMs: 'click -> the visible pane CONTAINER swapped (2 animation frames). Does NOT wait for messages.',
    switchPaintedMedianMs: 'click -> the messages are on screen (entry count stable for 3 frames). This is the number a user would recognise.',
    cpuDuringPct: 'whole-process CPU across the workload window, from /proc',
  },
  blindTo: [
    'conversation sizes beyond the fixture huge transcript',
    'switching under memory pressure from many MORE than 6 sessions',
    'anything requiring a real GPU — the rig runs headless under Xvfb',
  ],
};

export async function runWorkloadScenario(app, fixture, {
  cpuSampleSeconds = 40, switchCount = 40, keepSessions = false,
} = {}) {
  const cdp = app.cdp;
  await installProbe(cdp);
  await installPageHelpers(cdp);

  const ids = [];
  const warnings = [];
  let streamer = null;
  try {
    // ── 4 Claude Code sessions, alternating project folders ──────────────
    await mark(cdp, 'cc-create:start');
    // Snapshot the transcript dirs BEFORE any CC session exists, so the files
    // fake-claude creates for them can be identified by set difference.
    const before = new Map();
    for (const cwd of [fixture.projects.alpha, fixture.projects.beta]) {
      const dir = transcriptDir(fixture, cwd);
      before.set(dir, new Set(listTranscripts(dir)));
    }

    // ── 4 Claude Code sessions, THREE OF THEM RESUMED FROM REAL TRANSCRIPTS ──
    //
    // WHY RESUMED (changed 2026-08-27, and this is the whole point of the fix).
    // Until today all six sessions were created FRESH. A fresh session holds
    // nothing, so the 40 switches below were switching between near-empty
    // conversations — and the rig duly reported `switchP95Ms` 118 ms and called
    // session switching healthy. Destin switches between conversations with
    // thousands of messages, which is the configuration in which the suspected
    // cost (every open session keeps a mounted, unvirtualized ChatView) actually
    // exists. Measuring the empty case and reporting it as "switching" is the
    // same mistake as measuring idle with zero sessions open.
    //
    // Each fixture transcript is resumed AT MOST ONCE — `resumeSessionId` names
    // one specific stored session, and pointing two live sessions at the same id
    // is not a configuration the app is built for.
    //
    // The 4th stays fresh ON PURPOSE: it is the control. A switch INTO the empty
    // session should stay cheap, and if it does not, the cost is not the
    // conversation size and this whole line of reasoning is wrong.
    const ccMs = [];
    const names = [];
    const resumeOrder = ['huge', 'medium', 'small'];
    const sizeByName = {};
    for (let i = 0; i < 4; i++) {
      const cwd = i % 2 ? fixture.projects.beta : fixture.projects.alpha;
      const name = `cc-${i}`;
      const size = resumeOrder[i];
      const t = size ? fixture.transcripts?.[size] : null;
      if (size && !t) {
        warnings.push(`workload: fixture has no '${size}' transcript, so cc-${i} was created EMPTY — its switch timings measure an empty conversation, not a loaded one`);
      }
      // A resumed session must be created in the transcript's OWN cwd, or the
      // app looks for it under the wrong project slug and silently resumes nothing.
      const opts = t
        ? { name, cwd: t.cwd ?? cwd, skipPermissions: true, resumeSessionId: t.sessionId }
        : { name, cwd, skipPermissions: true };
      const r = await createSession(cdp, opts);
      ids.push(r.id); names.push(name); ccMs.push(r.ms);
      sizeByName[name] = t ? size : 'empty';
      await waitForSessionReady(cdp);
    }

    // ── 2 native (YouCoded harness) sessions ─────────────────────────────
    // `binding` and `preset` are absent from preload's TS type for session.create
    // (preload.ts:376-377) but ARE forwarded verbatim by structured clone and are
    // what main reads (ipc-handlers.ts:681); session-manager.ts:85-87 THROWS if a
    // fresh native session has no binding. skipPermissions is passed false to
    // match the journey — the native branch hardcodes false anyway
    // (session-manager.ts:95-96), since there is no PTY for it to affect.
    await mark(cdp, 'native-create:start');
    const nat = [];
    for (let i = 0; i < 2; i++) {
      const name = `native-${i}`;
      const r = await createSession(cdp, {
        name, cwd: fixture.projects.alpha, skipPermissions: false,
        provider: 'native', binding: { providerId: 'local', modelId: fixture.modelId }, preset: 'coder',
      });
      ids.push(r.id); names.push(name); nat.push(r);
    }

    // ── First native token ───────────────────────────────────────────────
    // Switch by CLICKING the pill. window.claude.session.switch() is a no-op stub
    // on desktop (ipc-handlers.ts:820-824), so using it here would leave some
    // other session on screen and time the wrong pane.
    await mark(cdp, 'native-send:start');
    const natIdx = ids.indexOf(nat[0].id);
    const toNative = await cdp.evaluate(
      `window.__perfLab.switchTo(${natIdx}, ${JSON.stringify(nat[0].name ?? 'native-0')}, ${ids.length})`);
    // mode 'none' means neither a pill nor an overflow row could be found, so the
    // native session was never brought on screen. Everything below would then
    // measure some OTHER session's pane, so stop with the real reason instead.
    if (toNative.mode === 'none') {
      throw new Error(`workload: could not bring the native session on screen — ${toNative.reason}. First-token timing would have measured the wrong chat pane.`);
    }

    // Settle the pane before baselining: read the length twice 250 ms apart and
    // only accept it once it stops moving, so the baseline is this session's
    // transcript and not a half-rendered one.
    let baseLen = await cdp.evaluate(`window.__perfLab.chatLen()`);
    for (let i = 0; i < 12; i++) {
      await sleep(250);
      const now = await cdp.evaluate(`window.__perfLab.chatLen()`);
      if (now === baseLen) break;
      baseLen = now;
    }
    if (baseLen < 0) {
      throw new Error('workload: no visible .chat-scroll after switching to the native session — every ChatView reported aria-hidden, so there is nothing to measure first-token against.');
    }

    // native.send resolves NativeSendResult (shared/types.ts:62-65):
    //   { status: 'sent' } | { status: 'queued', queueId } |
    //   { status: 'failed', reason: 'not-live' | 'queue-full' }
    // There is no 'refused'. A failure MUST be caught here — waiting 120 s on a
    // turn that was never dispatched, then throwing a timeout, would blame the
    // app for the rig's mistake.
    // The native leg is measured but is NOT allowed to abort the scenario.
    //
    // WHY: nativeFirstTokenMs is a nice-to-have; switchP95Ms, probe.longtaskTotalMs,
    // pssAfterMb and cpuDuringPct are all PRIMARY keep/reject metrics that come
    // LATER in this same journey. Letting a local-model problem throw here cost us
    // all four — measured, an unanswerable model aborted the whole run and the
    // report came back with four PRIMARY paths undefined. A model that will not
    // answer is a fixture/engine problem, not a reason to lose the workload.
    // On failure the two timings are null and nativeFailure says what happened.
    const tSend = Date.now();
    let nativeEchoMs = null;
    let nativeFirstTokenMs = null;
    let nativeFailure = null;
    const send = await cdp.evaluate(
      `window.claude.native.send(${JSON.stringify(nat[0].id)}, 'Once upon a time')`);
    if (!send || send.status === 'failed') {
      nativeFailure = `native.send was not dispatched — the app returned ${JSON.stringify(send)} (reason '${send?.reason}')`;
    } else {
      // Two stages, because the FIRST growth is the app echoing the prompt back as
      // a user bubble, not a model token. Baseline again on the echo, then wait for
      // text beyond it. Caveat kept honest: any in-transcript status text the app
      // renders after the echo would also satisfy stage two, so this is an upper
      // bound on "engine spawn + model load + first chunk", not a token timestamp.
      try {
        await waitFor(cdp, `window.__perfLab.chatLen() > ${baseLen}`, { timeoutMs: 30000, everyMs: 50 });
        nativeEchoMs = Date.now() - tSend;
        const echoLen = await cdp.evaluate(`window.__perfLab.chatLen()`);
        await waitFor(cdp, `window.__perfLab.chatLen() > ${echoLen + 12}`, { timeoutMs: 120000, everyMs: 50 });
        nativeFirstTokenMs = Date.now() - tSend;
      } catch (err) {
        // Quote what the pane actually shows — a provider 400 renders INTO the
        // chat, so this is usually the real reason in the app's own words.
        let shown = '';
        // Read the visible pane the same way chatLen() does; there is no chatText helper.
        try { shown = await cdp.evaluate(`(()=>{const p=[...document.querySelectorAll('.chat-scroll')].find(e=>!e.closest('[aria-hidden="true"]')); return p ? p.innerText.slice(-200) : '';})()`); } catch { /* pane gone */ }
        nativeFailure = `${err.message}${shown ? ` — pane shows: ${JSON.stringify(shown)}` : ''}`;
      }
    }
    if (nativeFailure) console.error(`[perf-lab] workload: native leg failed, continuing — ${nativeFailure}`);

    // ── Workload window: stream + switch + sample CPU, all over ONE clock ──
    const targets = pickStreamTargets(fixture, before, { count: 3 });
    const windowMs = cpuSampleSeconds * 1000;
    // The relationship is explicit, not coincidental: the switches are spread
    // evenly across the SAME window the CPU sample and the streamer cover, so
    // cpuDuringPct is by construction CPU *during* the workload.
    const switchEveryMs = switchCount > 0 ? Math.floor(windowMs / switchCount) : windowMs;

    await mark(cdp, 'workload:start');
    streamer = startStreamer(targets, { everyMs: 150 });
    const pids = app.family();
    const cpuBefore = cpuSnapshot(pids);
    const startedAt = Date.now();

    const clickMs = [], menuMs = [], paintedMs = [];
    const paintedBySize = {};
    const paintedSeen = {};
    let clickSwitches = 0, menuSwitches = 0, failedSwitches = 0, verifiedSwitches = 0, unsettledSwitches = 0;
    const switchFailures = [];
    for (let i = 0; i < switchCount; i++) {
      const due = startedAt + i * switchEveryMs;
      const wait = due - Date.now();
      if (wait > 0) await sleep(wait);
      const idx = i % ids.length;
      // Sampling, not measuring every switch. The painted wait costs SECONDS on a
      // loaded conversation (measured: 11 s into `huge`), so doing it on all 40
      // switches took 10 minutes per repeat and pushed the switches outside the
      // CPU-sample window this scenario says they sit inside. The first
      // PAINTED_SAMPLES_PER_SESSION visits to each session are measured properly;
      // the rest time the container swap only, which is what switchP95Ms wanted
      // anyway. Enough samples for a median per bucket, bounded wall clock.
      const paintedThis = (paintedSeen[idx] = (paintedSeen[idx] ?? 0) + 1) <= PAINTED_SAMPLES_PER_SESSION;
      const r = await cdp.evaluate(
        `window.__perfLab.switchTo(${idx}, ${JSON.stringify(names[idx])}, ${ids.length}, ${paintedThis})`);
      if (r.mode === 'pill') { clickSwitches++; clickMs.push(r.ms); }
      else if (r.mode === 'menu') { menuSwitches++; menuMs.push(r.ms); }
      else { failedSwitches++; if (switchFailures.length < 5) switchFailures.push(r.reason); }
      if (r.ok) verifiedSwitches++;
      // Painted timings are kept for EVERY real switch regardless of pill-vs-menu:
      // the menu path pays extra for opening a dropdown, but the content cost we
      // are hunting is the same either way.
      if (r.ok && typeof r.paintedMs === 'number') {
        paintedMs.push(r.paintedMs);
        // Bucketed by the size of the conversation being switched INTO. This is
        // the comparison the whole change exists to make: switching into `empty`
        // is the control, `huge` is the case Destin actually lives in. If they
        // come out the same, conversation size is not the cost and this line of
        // reasoning is wrong.
        const size = sizeByName[names[idx]] ?? 'unknown';
        const b = (paintedBySize[size] ??= { ms: [], entries: [], unsettled: 0 });
        b.ms.push(r.paintedMs);
        // The rendered entry count travels with the timing. Without it a size
        // LABEL cannot be checked against what actually appeared — and on the
        // 2026-08-27 run 'huge' settled faster than 'medium', which is either a
        // real inversion or proof the labels do not describe what was rendered.
        // There was no way to tell, because the count was not kept.
        if (typeof r.entries === 'number') b.entries.push(r.entries);
        if (r.settled === false) { b.unsettled++; unsettledSwitches++; }
      }
    }
    if (unsettledSwitches > 0) {
      warnings.push(`workload: ${unsettledSwitches}/${verifiedSwitches} switches never settled — their timings are a FLOOR (the 20s cap), not a measurement, and must not be read as fast switches`);
    }
    // Hold the window open so the CPU sample really covers cpuSampleSeconds even
    // if the switches finished early.
    const remaining = startedAt + windowMs - Date.now();
    if (remaining > 0) await sleep(remaining);
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const cpu = cpuPercent(cpuBefore, cpuSnapshot(pids), elapsedSec);
    streamer.stop();
    await mark(cdp, 'workload:end');

    const streamed = { ...streamer.state };
    streamer = null;

    // ── Settings open/close ──────────────────────────────────────────────
    // PSS is read twice: before the Settings toggle and after it, so a memory
    // move can be attributed to the workload or to opening the panel.
    const pssBefore = pssMb(app.family());
    await mark(cdp, 'settings:open');
    const settings = await toggleSettings(cdp);
    await mark(cdp, 'settings:closed');

    const probe = await readProbe(cdp);
    // The workload-window-only view of the same log (see readProbeWindow).
    const probeWorkload = await readProbeWindow(cdp, 'workload:start', 'workload:end');
    // pssAfterMb is read AFTER the Settings open/close, which is part of the
    // journey — the name means "after the whole workload", and pssBeforeSettingsMb
    // sits next to it so the two halves are separable.
    const pss = pssMb(app.family());

    return {
      sessionsCreated: ids.length,
      // What each session actually held, so a reader never has to guess whether
      // "switching" meant switching between loaded conversations or empty ones.
      sessionSizes: sizeByName,
      warnings,
      ccCreateMedianMs: median(ccMs),
      nativeCreateMs: nat[0].ms,
      nativeSendStatus: send?.status ?? null,
      nativeEchoMs,
      nativeFirstTokenMs,
      // null when the native leg failed; the string says why, in the app's words.
      nativeFailure,
      // Only pill clicks feed the PRIMARY switch metrics. An overflow-menu switch
      // also pays for opening a menu, so mixing the two would poison the
      // distribution; it is reported separately instead.
      switchMedianMs: median(clickMs),
      switchP95Ms: p95(clickMs),
      // ── The switch numbers that include the CONTENT (added 2026-08-27) ──────
      // switchMedianMs/switchP95Ms above stop when the pane container swaps.
      // These stop when the messages are actually on screen. Both are reported
      // so the report itself shows whether they agree — see switchTo's comment.
      switchPaintedMedianMs: median(paintedMs),
      switchPaintedP95Ms: p95(paintedMs),
      // Switch cost bucketed by the size of the conversation switched INTO.
      // `empty` is the control. If empty and huge cost the same, conversation
      // size is not the driver and the hypothesis is wrong.
      switchPaintedBySize: Object.fromEntries(
        Object.entries(paintedBySize).map(([k, v]) => [k, {
          n: v.ms.length,
          medianMs: median(v.ms),
          p95Ms: p95(v.ms),
          // What actually rendered, so the size label can be checked rather than trusted.
          medianEntries: median(v.entries),
          // Non-zero means some of the timings in this bucket are the 20s cap.
          unsettled: v.unsettled,
        }]),
      ),
      // Non-zero means some timings above are a 20s floor, not a measurement.
      unsettledSwitches,
      clickSwitches,
      // Always 0 by design — see switchTo(): the desktop session:switch IPC is a
      // stub that switches nothing, so it is never used as a timed fallback.
      ipcSwitches: 0,
      menuSwitches,
      menuSwitchMedianMs: median(menuMs),
      failedSwitches,
      switchFailures,
      // How many switches actually moved the visible pane. Anything below
      // clickSwitches + menuSwitches means some timings measured a non-event.
      verifiedSwitches,
      overflowed: menuSwitches > 0,
      firstSwitchMode: toNative?.mode ?? 'none',
      // A WRITE count (turns appended x 2 lines), not proof the app ingested
      // them. The watcher evidence for ingestion is in startStreamer's comment.
      streamedLines: streamed.lines,
      streamedTurns: streamed.turns,
      streamedFiles: targets.length,
      streamErrors: streamed.errors,
      probe,
      probeWorkloadWindow: probeWorkload,
      cpuDuringPct: round1(cpu.totalPct),
      cpuWindowSeconds: round1(elapsedSec),
      pssAfterMb: pss.totalMb,
      pssBeforeSettingsMb: pssBefore.totalMb,
      pssBreakdown: pss.perPid,
      settings,
      sessionIds: keepSessions ? ids : undefined,
    };
  } finally {
    // WHY a finally: if anything above throws, the streamer's setInterval would
    // otherwise keep appending forever and the six sessions would stay open,
    // poisoning every later scenario in the same boot. Cleanup is best-effort on
    // purpose — a cleanup failure must not mask the original error.
    if (streamer) { try { streamer.stop(); } catch { /* already stopped */ } }
    if (!keepSessions) {
      for (const id of ids) {
        try { await cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`); } catch { /* session already gone */ }
      }
    }
    // Leave no rAF loop or PerformanceObserver running into the next scenario or
    // the screenshot pass (see installProbe).
    try { await stopProbe(cdp); } catch { /* page gone */ }
  }
}

/**
 * Opens Settings and closes it again.
 *
 * The control is `button[title="Settings"]` (HeaderBar.tsx:436-449) — title is
 * its ONLY identifying attribute (no aria-label, no data-*, no id) — and it is a
 * true toggle (`onToggleSettings={() => setSettingsOpen(prev => !prev)}`,
 * App.tsx:2781), so clicking it twice opens and closes.
 *
 * A synthetic el.click() rather than a dispatched mouse event at its coordinates:
 * the open Settings drawer lays a full-screen scrim at z-index 40 over header
 * chrome at z 10-11 (SettingsPanel.tsx:208-218, globals.css:1044), so a real
 * click at the gear's coordinates would hit the SCRIM, not the gear. Both happen
 * to close the panel, but only one of them is the thing we said we measured.
 *
 * Open/closed is measured from the panel's ON-SCREEN POSITION, not from whether
 * its close button exists.
 *
 * WHY (this was a real bug): SettingsPanel is ALWAYS MOUNTED and hidden by a CSS
 * transform (`open ? 'translate-x-0' : '-translate-x-full'`, SettingsPanel.tsx:237),
 * so `[aria-label="Close settings"]` is in the DOM whether the drawer is open or
 * shut. Testing for its existence therefore returned `true` unconditionally, and
 * this function reported `{opened:true, closed:false}` on every run no matter what
 * actually happened. Measured instead: when open the close button sits at x≈289;
 * when closed the panel is translated -320px so the same button reports a NEGATIVE
 * x. That is a real discriminator.
 *
 * If the gear is missing entirely — a narrow window moves it into the ||| overflow
 * menu (HeaderBar.tsx:429-441) — we report that instead of throwing the run away.
 */
// True only when the drawer is actually on screen. Kept as one expression so the
// scenario and the orchestrator's screenshot sequence cannot drift apart.
export const SETTINGS_OPEN_EXPR = `(() => {
  const el = document.querySelector('[aria-label="Close settings"]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.x >= 0;
})()`;
async function toggleSettings(cdp, { dwellMs = 800, settleMs = 500 } = {}) {
  const opened = await cdp.evaluate(`(async () => {
    const btn = document.querySelector('button[title="Settings"]');
    if (!btn) return { ok: false, reason: 'no button[title="Settings"] in the header — a narrow window moves the gear into the ||| overflow menu' };
    btn.click();
    await window.__perfLab.nextFrame2();
    return { ok: true };
  })()`);
  if (!opened.ok) return { opened: false, closed: false, reason: opened.reason };
  await sleep(dwellMs);
  const state = await cdp.evaluate(`(async () => {
    const wasOpen = ${SETTINGS_OPEN_EXPR};
    const btn = document.querySelector('button[title="Settings"]');
    if (btn) btn.click();
    await window.__perfLab.nextFrame2();
    return { wasOpen };
  })()`);
  await sleep(settleMs);
  let stillOpen = await cdp.evaluate(SETTINGS_OPEN_EXPR);
  // Fall back to the drawer's OWN close button — which is what a user reaches for
  // and is never behind the scrim. Leaving the drawer open would occlude the left
  // 320px of every screenshot taken after this point: measured, the six-sessions
  // and native-chat shots both came back with Settings covering the sidebar, so
  // three of the five gated screens were near-duplicates of each other.
  if (stillOpen) {
    await cdp.evaluate(`(async () => {
      const x = document.querySelector('[aria-label="Close settings"]');
      if (x) x.click();
      await window.__perfLab.nextFrame2();
    })()`);
    await sleep(settleMs);
    stillOpen = await cdp.evaluate(SETTINGS_OPEN_EXPR);
  }
  return { opened: state.wasOpen, closed: !stillOpen };
}
