// scripts/perf-lab/scenario-history.mjs — how long does a conversation's history
// take to come back?
//
// WHY this module exists: "history reload feels slow" has TWO possible causes and
// they live in different files. This scenario separates them with numbers:
//   * ipcLast10Ms / ipcAllMs  — main-process cost: read the .jsonl off disk, parse
//     it, ship the messages over IPC (session-browser.ts → ipc-handlers.ts).
//   * resumeFirstMessageMs / resumeStableMs — renderer cost: how long until the
//     first bubble is on screen, and until the timeline stops growing (ChatView.tsx).
// A big ipcAllMs with a small resumeStableMs means optimize the main process; the
// reverse means optimize the renderer. Reporting one number would hide which.
//
// Each size is measured `repeats` times inside ONE app boot (a few seconds each),
// because compare.mjs judges a change against the run-to-run SPREAD — a single
// sample can neither prove nor veto anything.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).

// PAGE_TURNS/renderedEntries live in scenario-workload.mjs (one definition, one
// place to keep in step with the app's transcript-page.ts).
import { renderedEntries } from './scenario-workload.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * How many conversation entries are currently on screen.
 *
 * VERIFIED against the app source (2026-08-26), because the wrong selector here
 * would silently count 0 forever and every render number would be a timeout:
 *   * ChatView.tsx:749  — the scroll container really is `.chat-scroll`
 *   * ChatView.tsx:881  — every timeline entry is `<div className="timeline-entry in-view…">`
 *   * ChatView.tsx:813  — the history-expand row is also a `.timeline-entry`
 *   * there is NO `data-message-id` attribute anywhere in the renderer.
 * Counting `.timeline-entry` (not `.user-bubble` / `.assistant-bubble`) is
 * deliberate: AssistantTurnBubble.tsx:412 maps over `bubbles`, so ONE assistant
 * turn can paint several `.assistant-bubble` elements — bubble counts would drift
 * from the transcript, entry counts do not.
 *
 * The `aria-hidden` filter is load-bearing. ChatView.tsx's root-style comment says
 * "App renders a ChatView for EVERY open session" — inactive ones stay MOUNTED
 * (content-visibility:hidden, not unmounted), so a bare querySelectorAll would sum
 * the timelines of every open conversation. The hidden ones carry
 * `aria-hidden={visible ? undefined : true}` (ChatView.tsx:676), so the attribute is
 * absent — never "false" — on the one the user is actually looking at. We filter on
 * that rather than the neighbouring `inert` prop, because on React versions that
 * serialize `inert={false}` as `inert=""` an `[inert]` test would match EVERY view.
 *
 * BubbleFeed.tsx:442 renders a parallel `.timeline-entry` for the same conversation,
 * but it is (a) not inside any `.chat-scroll` — BuddyChat.tsx:170 wraps it in a plain
 * overflow:hidden div — and (b) only mounted in the buddy window, which is a separate
 * CDP target that cdp.mjs's waitForMainTarget explicitly excludes (`!t.url.includes('mode=')`).
 * So it can neither be reached nor accidentally counted from here; the `.chat-scroll`
 * prefix is what guarantees that.
 */
export const MESSAGE_COUNT_EXPR =
  `Array.prototype.filter.call(document.querySelectorAll('.chat-scroll .timeline-entry'), (el) => !el.closest('[aria-hidden="true"]')).length`;

/** The fields compare.mjs may take a median of. Everything else on a run is diagnostics. */
export const NUMERIC_KEYS = [
  'ipcLast10Ms', 'ipcAllMs', 'ipcAllCount',
  'resumeFirstMessageMs', 'resumeStableMs', 'resumeMessageCount',
];

// The timeline is "stable" once its entry count has not changed for this long.
const STABLE_MS = 1000;
// In-page ceiling for one resume watch. Past this we report a timeout rather than
// a number — see medianRun's null handling.
//
// WHY 240s and not the 90s this started at: measured on the `huge` fixture
// (then 25,000 turns -> 50,000 messages of PLAIN prose), the resumed conversation took ~122 SECONDS
// to finish rendering, and the renderer's main thread is blocked solid for that
// whole stretch — a CDP evaluate issued during it does not return until the
// render completes. At 90s every `huge` sample timed out and reported null, so
// history.huge.median.resumeStableMs (a PRIMARY metric, and the target of
// experiment card E5) was permanently blind. The ceiling has to clear the real
// cost or the gate cannot see the thing it exists to protect.
//
// Note what this timeout can and cannot do: because the page is frozen, the
// in-page sampler cannot take samples DURING the block, so resumeStableMs for
// huge is effectively "when the freeze ended, plus the stability window". That
// is the honest user-visible number; it is not a fine-grained render profile.
const WATCH_TIMEOUT_MS = 240000;
// NOTE (2026-08-27): `huge` was since recalibrated from 25,000 turns to 3,500
// (fixture.mjs SIZES) when the fixture switched to realistic code-heavy content,
// which costs ~6.8x the bytes and 1.46x the timeline entries per turn. THIS
// constant is the reason: at 25,000 realistic turns a resume modelled at
// 850-1166s, so it would have blown this ceiling, reported null for a PRIMARY
// metric, and burned 240s x 5 repeats doing it. Raise this ceiling first if you
// ever want the 50,000-message regime back.
// In-page sampling period. 16ms ≈ one frame; the sampler runs INSIDE the page so
// this is the true resolution of resumeStableMs, with no CDP latency added.
const SAMPLE_MS = 16;

/** Median of the numbers in `xs`; null (never NaN/undefined) if there are none. */
export function median(xs) {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

/**
 * Median of each numeric metric across runs.
 * Only NUMERIC_KEYS are projected: a run also carries `stability` and `warnings`,
 * and taking a "median" of those would produce nonsense. A metric that was null in
 * every run (e.g. resumeStableMs when nothing ever stabilized) stays null, so it
 * reads as ABSENT downstream instead of as a suspiciously fast 0.
 */
export function medianRun(runs) {
  return Object.fromEntries(NUMERIC_KEYS.map((k) => [k, median(runs.map((r) => r[k]))]));
}

/**
 * Node-side backstop around a CDP evaluate. cdp.mjs never times a request out, so a
 * renderer crash mid-resume would hang the whole rig forever. The stranded promise is
 * given a no-op catch so it can't surface later as an unhandled rejection.
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
 */
/** What this scenario measures — see scenario-workload.mjs MEASURES for why these exist. */
export const MEASURES = {
  scenario: 'history',
  question: 'How long does loading a conversation take, at three sizes?',
  configuration: [
    'one session at a time, resumed from a prebuilt transcript',
    'three sizes: small, medium, huge',
  ],
  clocks: {
    ipcLast10Ms: 'the loadHistory IPC call for the last 10 messages',
    ipcAllMs: 'the loadHistory IPC call for the whole transcript',
    resumeStableMs: 'resume -> the rendered entry count stops changing',
  },
  blindTo: [
    'which THREAD the time was spent on — that is the stall scenario',
    'anything requiring more than one session open',
  ],
};

/**
 * `onProgress({ size, rep, repeats, run })` fires after EVERY repeat.
 *
 * WHY it exists: this phase used to log only when all 15 repeats were done, so a
 * change that stopped history rendering was indistinguishable from a slow
 * machine — 40 minutes of total silence while every repeat burned its 240s watch
 * timeout (2026-08-28). A phase that can hang for the length of its own timeout
 * budget must report per repeat, not per phase.
 */
export async function runHistoryScenario(app, fixture, { repeats = 5, onProgress } = {}) {
  const out = {};
  for (const size of ['small', 'medium', 'huge']) {
    const runs = [];
    for (let rep = 0; rep < repeats; rep++) {
      const run = await measureOnce(app, fixture, size, rep);
      runs.push(run);
      onProgress?.({ size, rep, repeats, run });
    }
    out[size] = {
      runs,
      median: medianRun(runs),
      // Surfaced at the size level so a partly-failed size is visible in the report
      // without digging through every run object.
      stabilizedRuns: runs.filter((r) => r.stability === 'stable').length,
      warnings: [...new Set(runs.flatMap((r) => r.warnings))],
    };
  }
  return out;
}

/**
 * Destroy a session the Node side never learned the id of.
 *
 * WHY: the resume watch runs as ONE page-side promise and the id only reaches
 * Node when it resolves. When it rejects instead — the outer withTimeout
 * expiring is the live case — the id dies with the promise. The page stashed it
 * on `window.__perfHistoryLastId` for exactly this moment, so the session can
 * still be cleaned up rather than left mounted, with its whole transcript
 * rendered, for every later repeat in the same boot.
 *
 * Best effort by design: this runs on a failure path, and a cleanup that throws
 * here would replace the real error with a secondary one.
 */
async function destroyStrandedSession(app, warnings, size, rep) {
  try {
    const r = await app.cdp.evaluate(`(async () => {
      const id = window.__perfHistoryLastId;
      if (!id) return { skipped: true };
      window.__perfHistoryLastId = null;
      try { await window.claude.session.destroy(id); return { ok: true, id }; }
      catch (e) { return { ok: false, id, error: (e && e.message) ? e.message : String(e) }; }
    })()`);
    if (r && r.ok) warnings.push(`${size}#${rep}: recovered and destroyed a stranded session (${r.id}) after the resume watch failed`);
    else if (r && r.ok === false) warnings.push(`${size}#${rep}: a stranded session (${r.id}) could NOT be destroyed: ${r.error} — later repeats in this boot are measuring with it still mounted`);
  } catch (e) {
    warnings.push(`${size}#${rep}: could not even ask the page about a stranded session: ${e.message}`);
  }
}

async function measureOnce(app, fixture, size, rep) {
  const t = fixture.transcripts[size];
  if (!t) throw new Error(`fixture has no '${size}' transcript (has: ${Object.keys(fixture.transcripts).join(', ')})`);
  const warnings = [];

  // ---- 1. IPC/disk cost -----------------------------------------------------
  // Both calls are timed with performance.now() INSIDE the page, so the number is
  // the renderer's real await time and excludes our own CDP round-trip.
  //
  // Note on what these two actually compare: loadHistory (session-browser.ts:660)
  // has no partial-read fast path — it reads and parses the WHOLE file either way
  // and only then does `messages.slice(-count)`. So ipcLast10Ms is not a cheap tail
  // read; the delta between the two is dominated by IPC serialization of 2×turns
  // messages vs 10. Also: repeats 2..N read a file the OS page cache is already
  // holding, so these are warm-cache costs by construction.
  //
  // The literal `0` for count is intentional even though preload.ts:392 rewrites it
  // to `count || 10` — `all: true` makes count irrelevant, and 0 says "everything".
  const ipc = await withTimeout(app.cdp.evaluate(`(async () => {
    try {
      const t0 = performance.now();
      const last = await window.claude.session.loadHistory(${JSON.stringify(t.sessionId)}, ${JSON.stringify(t.slug)}, 10, false);
      const t1 = performance.now();
      const all = await window.claude.session.loadHistory(${JSON.stringify(t.sessionId)}, ${JSON.stringify(t.slug)}, 0, true);
      const t2 = performance.now();
      return { ok: true, ipcLast10Ms: Math.round(t1 - t0), ipcAllMs: Math.round(t2 - t1), ipcAllCount: all.length, last10: last.length };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  })()`), 120000, `loadHistory(${size})`);

  if (!ipc.ok) {
    // Report what the app itself said — never a guessed cause.
    throw new Error(`loadHistory failed for '${size}' (sessionId=${t.sessionId}, slug=${t.slug}): ${ipc.error}`);
  }

  // ---- 2. Assert the app and the fixture agree about this transcript --------
  // WHY assert at all: if these disagree, the app is reading a different (or partly
  // rejected) file and EVERY downstream number is measuring the wrong thing. Better
  // to stop with both numbers on screen than to publish a quietly wrong count.
  //
  // The relationship is exactly 2 × turns. fixture.mjs's transcriptLines writes two
  // JSONL lines per turn — a user line with `promptId`, `isMeta:false` and non-empty
  // string content, and an assistant line with `stop_reason:'end_turn'` and one
  // non-empty text block — and those are precisely the two shapes loadHistory keeps
  // (session-browser.ts:686-720). Nothing merges: dedup is by `uuid` and every uuid
  // is a fresh randomUUID, so no line is collapsed into another.
  const expectedAll = 2 * t.turns;
  if (ipc.ipcAllCount !== expectedAll) {
    throw new Error(
      `history size mismatch for '${size}': loadHistory(all) returned ${ipc.ipcAllCount} messages, ` +
      `fixture wrote ${t.turns} turns = ${expectedAll} messages (${t.slug}/${t.sessionId}.jsonl). ` +
      `The app and the fixture disagree about this transcript, so no number from this run is trustworthy.`,
    );
  }
  // count=10 returns slice(-10), so a short transcript legitimately returns fewer.
  const expectedLast10 = Math.min(10, expectedAll);
  if (ipc.last10 !== expectedLast10) {
    throw new Error(
      `loadHistory(count=10) returned ${ipc.last10} messages for '${size}', expected ${expectedLast10} — ` +
      `the fixture's line shape or project slug does not match what session-browser.ts accepts.`,
    );
  }

  // ---- 3. Start from an empty timeline --------------------------------------
  // WHY: the resume watch below decides "first message painted" from the on-screen
  // entry count. If the PREVIOUS repeat's conversation is still the visible one,
  // the very first sample already sees entries and resumeFirstMessageMs collapses
  // to ~0 — a fabricated win. measureOnce destroys its session on the way out, so
  // this normally settles instantly.
  const baselineCount = await waitForEmptyTimeline(app, 10000);
  if (baselineCount !== 0) {
    warnings.push(`${size}#${rep}: timeline still showed ${baselineCount} entries before resume; first-message timing relies on the switch-detection fallback`);
  }

  // ---- 4. Renderer cost -----------------------------------------------------
  // The whole watch runs in ONE in-page evaluate rather than ~2,400 CDP polls.
  // WHY: the polling loop IS the instrument. A Node-side loop pays a CDP round-trip
  // plus a sleep per sample, so its true period is (sleep + latency) and that period
  // is the floor on resumeStableMs's resolution — the measurement would be measuring
  // the rig. In-page sampling is one round-trip total and resolves to ~16ms.
  // The trade: Chromium throttles timers in a backgrounded/occluded window, which
  // would corrupt the 1000ms stability rule. That failure is not hidden — the watch
  // reports document.visibilityState and the largest gap it actually observed
  // between samples, and anything suspicious becomes a warning below.
  // t0 and every counter are locals of this async IIFE, so nothing leaks onto
  // `window` and no repeat can ever read a previous repeat's timing state.
  // The rejection path matters as much as the resolve path: withTimeout REJECTS
  // on expiry, which would otherwise throw straight past the cleanup below and
  // leave a resumed session — potentially the huge one — mounted for every later
  // repeat in this boot, with its cost charged to whatever runs next.
  let watch;
  try {
    watch = await withTimeout(app.cdp.evaluate(`(async () => {
    const count = () => ${MESSAGE_COUNT_EXPR};
    const baseline = ${baselineCount};
    // Entries a PAGED resume must reach before "stopped changing" means "done"
    // (app perf cycle 2). Without it the 1s stability rule accepts a first page
    // that is still waiting on the rest of its own turns — a settle the app has
    // not actually reached, reported as a win.
    const expected = ${renderedEntries(t.turns)};
    const t0 = performance.now();
    let created;
    try {
      // Stash the id on the window the instant it exists. WHY: everything below
      // runs inside ONE page-side promise, and the Node side only learns the id
      // when that promise RESOLVES. If it rejects — the outer withTimeout expiring
      // is the live case — the id is lost with it, and the cleanup below has
      // nothing to destroy. A resumed 'huge' session then stays mounted for every
      // later repeat in this boot, and its cost is charged to whatever runs next.
      window.__perfHistoryLastId = null;
      created = await window.claude.session.create({
        name: ${JSON.stringify(`perf-resume-${size}-${rep}`)},
        cwd: ${JSON.stringify(fixture.projects.alpha)},
        skipPermissions: true,
        resumeSessionId: ${JSON.stringify(t.sessionId)},
      });
    } catch (e) {
      return { ok: false, phase: 'create', error: (e && e.message) ? e.message : String(e) };
    }
    if (!created || !created.id) {
      return { ok: false, phase: 'create', error: 'session.create resolved without an id: ' + JSON.stringify(created) };
    }
    window.__perfHistoryLastId = created.id;
    return await new Promise((resolve) => {
      let last = -1, lastChangeMs = 0, firstMs = null, samples = 0, maxGapMs = 0;
      // "switched" = the newly-created (empty) conversation is the one on screen.
      // Until then a non-zero count could still be the OUTGOING conversation's.
      let switched = baseline === 0;
      let prev = performance.now();
      const done = (v) => { clearInterval(h); resolve(Object.assign({ ok: true, id: created.id, samples, maxGapMs: Math.round(maxGapMs), visibility: document.visibilityState }, v)); };
      const h = setInterval(() => {
        const now = performance.now();
        if (samples > 0) maxGapMs = Math.max(maxGapMs, now - prev);
        prev = now; samples++;
        const n = count();
        const elapsed = now - t0;
        // A drop to 0 (or below the outgoing timeline's size) is the view switching.
        if (!switched && (n === 0 || n < baseline)) { switched = true; last = -1; }
        if (switched) {
          if (n !== last) {
            last = n;
            lastChangeMs = elapsed;
            if (firstMs === null && n > 0) firstMs = Math.round(elapsed);
          } else if (n >= expected && elapsed - lastChangeMs >= ${STABLE_MS}) {
            // Stability is only meaningful once the page has actually rendered.
            // n >= expected subsumes the old n > 0 guard (expected is never 0
            // here) — without it an empty timeline would "stabilize" after 1s
            // and report a resume that never happened as the fastest run.
            done({ timedOut: false, firstMs, stableMs: Math.round(lastChangeMs), count: n });
            return;
          }
        }
        if (elapsed >= ${WATCH_TIMEOUT_MS}) {
          done({ timedOut: true, firstMs, stableMs: null, count: n, expected, lastChangeMs: Math.round(lastChangeMs), switched });
        }
      }, ${SAMPLE_MS});
    });
  })()`), WATCH_TIMEOUT_MS + 30000, `resume watch (${size})`);
  } catch (err) {
    await destroyStrandedSession(app, warnings, size, rep);
    throw err;
  }

  if (!watch.ok) {
    // Recover and destroy anything that WAS created before the failure, then
    // rethrow. Without this a create that succeeded and then failed downstream
    // left the session mounted for the rest of the boot.
    await destroyStrandedSession(app, warnings, size, rep);
    throw new Error(
      `session.create failed while resuming '${size}' (resumeSessionId=${t.sessionId}, cwd=${fixture.projects.alpha}): ${watch.error}`,
    );
  }

  // ---- 5. Cleanup — best effort, but never silent ---------------------------
  // WHY not just `await destroy(...)`: a rejecting destroy would throw away four
  // good measurements that were already taken. It is recorded as a warning instead,
  // because a session that would not die also explains any later repeat behaving oddly.
  try {
    const d = await withTimeout(app.cdp.evaluate(`(async () => {
      try { await window.claude.session.destroy(${JSON.stringify(watch.id)}); return { ok: true }; }
      catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
    })()`), 30000, `session.destroy(${size})`);
    if (!d.ok) warnings.push(`${size}#${rep}: session.destroy(${watch.id}) failed: ${d.error}`);
  } catch (e) {
    warnings.push(`${size}#${rep}: session.destroy(${watch.id}) never answered: ${e.message}`);
  }
  await sleep(500);

  // ---- 6. Report ------------------------------------------------------------
  if (watch.timedOut) {
    // Loud, and null rather than 0. The draft version of this scenario fell out of
    // its polling loop with stableAt still 0, which then flowed into the report and
    // the median as though history had rendered instantly — a failure that looked
    // like the best result in the table.
    warnings.push(
      `${size}#${rep}: timeline never stabilized within ${WATCH_TIMEOUT_MS}ms — ` +
      `${watch.count} entries on screen, last change at ${watch.lastChangeMs}ms` +
      (watch.switched ? '' : ', and the view never switched to the resumed session') +
      `; resumeStableMs reported as null (absent), not 0`,
    );
  }
  if (watch.visibility !== 'visible') {
    warnings.push(`${size}#${rep}: document.visibilityState was '${watch.visibility}' — Chromium throttles timers in a hidden window, so the render timings may be coarse`);
  }
  if (watch.maxGapMs > 250) {
    warnings.push(`${size}#${rep}: in-page sampler stalled up to ${watch.maxGapMs}ms between samples (asked for ${SAMPLE_MS}ms) — resumeStableMs is only accurate to that gap`);
  }

  return {
    ipcLast10Ms: ipc.ipcLast10Ms,
    ipcAllMs: ipc.ipcAllMs,
    ipcAllCount: ipc.ipcAllCount,
    resumeFirstMessageMs: watch.firstMs,
    resumeStableMs: watch.stableMs,
    resumeMessageCount: watch.count,
    stability: watch.timedOut ? 'timeout' : 'stable',
    warnings,
  };
}

/** Poll (cheaply, off the measured path) until nothing is on screen. Returns the last count seen. */
async function waitForEmptyTimeline(app, timeoutMs) {
  const t0 = Date.now();
  // withTimeout here too: cdp.mjs never times a request out, so a wedged renderer
  // would hang this loop's very first await forever instead of failing the run.
  const read = () => withTimeout(app.cdp.evaluate(MESSAGE_COUNT_EXPR), 15000, 'timeline entry count');
  let n = await read();
  while (n !== 0 && Date.now() - t0 < timeoutMs) {
    await sleep(100);
    n = await read();
  }
  return n;
}
