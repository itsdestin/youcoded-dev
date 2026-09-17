// scripts/perf-lab/scenario-native-resume.mjs — the native session journey the
// main process pays for on every click: opening the Resume list over a hundred
// native sessions, resuming a long one, paging its history, finishing a reply,
// tearing the tab into its own window, and a reply into that other window.
//
// WHY THIS SCENARIO EXISTS
// Destin's freeze reports are app-wide stalls, and the main process — one thread
// serving IPC for every window — is where a whole-file read or a git status on a
// click path lands. The native session store had several: listing sessions read
// every file's head synchronously, a resume read the whole transcript on the main
// thread, every native turn ran `git status` synchronously before assembling the
// prompt, and each reply re-read the transcript end to end to publish history.
// Nothing in the rig opened the Resume list, resumed a NATIVE session or tore a
// tab out, so none of that was ever measured (the history and stall phases cover
// the CLAUDE CODE transcript path only). This phase opens exactly those doors,
// with the IPC ping probe armed over every step so a main-process stall shows as
// itself (README: the attribution rule).
//
// STEPS, each a `step()` from scenario-artifacts (both probes, stall attributed):
//  browse.open   with no session open, the welcome screen's Resume button: click ->
//                the list's first rows on screen (session:browse lists every native
//                file's head + every Claude Code transcript). Opened FIRST because
//                the strip's All Sessions menu is not rendered with one session open.
//  browse.reveal scroll the list to the bottom until it stops growing
//  resume        close the list and resume the big native session through the app's
//                own `youcoded:resume-session` event (with a binding, so the picker
//                does not open): dispatch -> its messages on screen
//  page.up       scroll to the top of the resumed conversation -> one more history
//                page on screen
//  turn          a short reply from the fake endpoint: send -> Stop button gone
//  create.cc     one fresh Claude Code session, so the window still holds a session
//                after the tear-off (the app auto-closes an emptied window)
//  tearoff       detach.openDetached -> the session's pill gone from this window
//                and a second app window listed on CDP
//  turn.detached a reply into the detached session while THIS window watches its
//                own IPC latency (the delta fan-out must not cost windows that do
//                not show the session)
//
// WHAT THIS SCENARIO IS BLIND TO — say it, do not let a number stand in for it:
//  - the detached window's own rendering (the rig drives one CDP target);
//  - the Resume list's per-row preview pane (rows are revealed, not previewed);
//  - Claude Code resumes (scenario-history), wallpaper themes, GPU paint.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { listTargets, waitFor } from './cdp.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { step } from './scenario-artifacts.mjs';
import { installPageHelpers, installProbe, median, readProbe, stopProbe, waitForSessionReady } from './scenario-workload.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Deltas and rate of each reply in this phase — short: the reply is not what is measured here. */
export const TURN_DELTAS = 300;
export const TURN_PER_SEC = 150;
/** IPC ping interval inside every step (~20 pings a second). */
export const IPC_PING_MS = 50;
/** The app's own stop control — rendered only while a turn is in flight (StopButton.tsx). */
export const STOP_BUTTON = 'button[aria-label="Stop generating"]';
/** How many scroll rounds the reveal step allows before calling the list grown. */
export const REVEAL_MAX_ROUNDS = 40;
/** The app's own resume event and its required fields (App.tsx `youcoded:resume-session` listener). */
export const RESUME_EVENT = 'youcoded:resume-session';

const withTimeout = (promise, ms, what) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not happen within ${ms} ms`)), ms).unref?.()),
]);

// ---------------------------------------------------------------------------
// In-page helpers
// ---------------------------------------------------------------------------

/**
 * `window.__perfNat`. Selectors read off master 2026-09-16:
 *  - the Resume list is ResumeBrowser.tsx: an <h2>Resume Session</h2>, rows whose
 *    click target is `button[aria-expanded]` carrying aria-label = the session name,
 *    and an IntersectionObserver sentinel `div[aria-hidden].h-px` that reveals 50
 *    more rows when scrolled into view;
 *  - it opens from the strip's All Sessions menu, whose footer holds a "Resume"
 *    button (SessionStrip.tsx:2723-2731); the menu is portalled outside the strip;
 *  - pills carry data-session-id (SessionStrip.tsx:1992), exactly one per session;
 *  - resuming goes through the app's own `youcoded:resume-session` event
 *    (App.tsx:3000-3021) — with a binding it skips the model picker.
 */
export async function installResumeHelpers(cdp) {
  await cdp.evaluate(`(() => {
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const heading = () => Array.prototype.slice.call(document.querySelectorAll('h2')).find((h) => h.textContent.trim() === 'Resume Session') || null;
    // A session CARD (ResumeBrowser.tsx:1216: div.relative.rounded-lg.border.bg-inset),
    // not any button[aria-expanded]: the list's "Projects" and "Tags" section
    // toggles carry aria-expanded too, and shakedown 5 counted those two as the
    // whole list. Each card holds the row button (aria-label = the session name)
    // and an Organize toggle, so cards are counted, not buttons.
    const CARD = 'div.rounded-lg.bg-inset';
    // A session card is such a div holding the row button (aria-expanded + an
    // aria-label that is the session name). Counted document-wide while the
    // heading is on screen: shakedown 7 showed that walking up from the heading
    // stops at the first ancestor with ANY rounded inset box — the search field —
    // and reported one row while a hundred sessions were listed below it.
    const cards = () => {
      if (!heading()) return [];
      return Array.prototype.slice.call(document.querySelectorAll(CARD)).filter((c) => c.querySelector('button[aria-expanded][aria-label]'));
    };
    const rowButton = (c) => Array.prototype.slice.call(c.querySelectorAll('button[aria-expanded][aria-label]')).find((x) => !/^(Organize|Rename) /.test(x.getAttribute('aria-label') || '')) || null;
    const root = () => { const c = cards(); return c.length ? (heading().closest('[role="dialog"]') || document.body) : null; };
    const rows = () => cards().length;
    // The first n row names, so a report can say WHAT was listed when the count
    // looks wrong.
    const rowNames = (n) => cards().slice(0, n).map((c) => { const b = rowButton(c); return b ? b.getAttribute('aria-label') : c.textContent.trim().slice(0, 40); });
    /** Wait until the row count holds still for quietMs (cap maxMs). Returns the settled count and how long it took. */
    const settleRows = async (quietMs, maxMs) => {
      const t0 = performance.now();
      let last = rows(), since = performance.now();
      while (performance.now() - t0 < maxMs) {
        await raf2();
        const n = rows();
        if (n !== last) { last = n; since = performance.now(); }
        else if (performance.now() - since >= quietMs) return { rows: n, ms: Math.round(performance.now() - t0), settled: true };
      }
      return { rows: last, ms: Math.round(performance.now() - t0), settled: false };
    };
    const stripPillIds = () => {
      const s = document.querySelector('[data-session-strip]') || document.querySelector('.session-strip');
      return s ? Array.prototype.slice.call(s.querySelectorAll('[data-session-id]')).map((p) => p.getAttribute('data-session-id')) : [];
    };
    // What the panel SAYS, for a report whose row count looks wrong: an empty
    // state names what emptied the list (design guide G-18), and quoting it beats
    // guessing. Read once after the wait, never inside a poll (innerText forces layout).
    const panelText = (n) => {
      const h = heading();
      if (!h) return '';
      const el = h.closest('[role="dialog"]') || h.parentElement?.parentElement?.parentElement || h.parentElement;
      // Double backslash: this is page code inside a template literal, and a
      // single one turns the regex into /s+/ (shakedown 7 quoted "Re ume Se ion").
      return (el?.innerText || '').replace(/\\s+/g, ' ').slice(0, n);
    };
    window.__perfNat = {
      raf2, heading, rows, rowNames, settleRows, stripPillIds, panelText,
      browserOpen: () => !!heading(),
      stopCount: () => document.querySelectorAll(${JSON.stringify(STOP_BUTTON)}).length,
      entries: () => { const p = window.__perfLab.visiblePane(); return p ? p.querySelectorAll('.timeline-entry').length : -1; },
      /**
       * The welcome screen's "Resume Session" button first (App.tsx, shown while no
       * session is open — the route a user takes at startup), else the strip's All
       * Sessions menu -> Resume. The menu trigger is not rendered with a single
       * session open (first shakedown, 2026-09-16), which is why the list is opened
       * BEFORE any session is created.
       */
      openResume: async () => {
        const inStrip0 = (el) => !!(el.closest('[data-session-strip]') || el.closest('.session-strip'));
        const welcome = Array.prototype.slice.call(document.querySelectorAll('button')).find((b) => !inStrip0(b) && b.textContent.trim() === 'Resume Session' && !heading());
        if (welcome) { welcome.click(); return { ok: true, how: 'welcome' }; }
        const trigger = document.querySelector('[data-session-strip] [title="All Sessions"]') || document.querySelector('.session-strip [title="All Sessions"]');
        // No apostrophes inside this page-side string: the template literal
        // unescapes them and the injected code then fails to parse (shakedown 3).
        if (!trigger) return { ok: false, reason: 'neither the welcome screen "Resume Session" button nor an "All Sessions" trigger in the strip is on screen' };
        trigger.click();
        await raf2();
        const inStrip = (el) => !!(el.closest('[data-session-strip]') || el.closest('.session-strip'));
        const btn = Array.prototype.slice.call(document.querySelectorAll('button')).find((b) => !inStrip(b) && b.textContent.trim() === 'Resume');
        if (!btn) { try { trigger.click(); } catch (e) { /* menu gone */ } return { ok: false, reason: 'the All Sessions menu opened but has no "Resume" button' }; }
        btn.click();
        return { ok: true };
      },
      /** Scroll the list to its end until the row count stops growing. */
      revealAll: async (maxRounds) => {
        const cs = cards();
        if (!cs.length) return { ok: false, reason: 'the Resume list is not open or lists no session', rows: 0, rounds: 0 };
        // The scroll container is the nearest scrollable ancestor of a card.
        let scroller = cs[cs.length - 1].parentElement;
        while (scroller && scroller !== document.body && scroller.scrollHeight <= scroller.clientHeight + 1) scroller = scroller.parentElement;
        if (!scroller || scroller === document.body) return { ok: false, reason: 'no scrollable container around the session cards', rows: rows(), rounds: 0 };
        let last = rows(), stable = 0, rounds = 0;
        while (rounds < maxRounds) {
          scroller.scrollTop = scroller.scrollHeight;
          rounds++;
          // Give the observer and the render a few frames.
          for (let i = 0; i < 6; i++) await raf2();
          const n = rows();
          if (n === last) { if (++stable >= 3) break; } else { stable = 0; last = n; }
        }
        return { ok: true, rows: last, rounds, scrollHeight: scroller.scrollHeight };
      },
      closeResume: async () => {
        const r = root() || heading()?.parentElement;
        if (!r) return { ok: true, how: 'already closed' };
        const btn = Array.prototype.slice.call(r.querySelectorAll('button')).find((b) => /^(close|cancel)$/i.test(b.textContent.trim()) || /close/i.test(b.getAttribute('aria-label') || ''))
          || Array.prototype.slice.call(document.querySelectorAll('button[aria-label]')).find((b) => /close/i.test(b.getAttribute('aria-label') || '') && !b.closest('[data-session-strip]'));
        if (btn) { btn.click(); await raf2(); return { ok: !heading(), how: 'button' }; }
        return { ok: false, how: 'no close button found' };
      },
      resume: (detail) => { window.dispatchEvent(new CustomEvent(${JSON.stringify(RESUME_EVENT)}, { detail })); return true; },
      /** Wait for the visible pane's entry count to be > 0 and hold still for three frames. */
      settleEntries: async (maxMs) => {
        const t0 = performance.now();
        let last = -1, stableFrames = 0;
        while (performance.now() - t0 < maxMs) {
          const p = window.__perfLab.visiblePane();
          const n = p ? p.querySelectorAll('.timeline-entry').length : -1;
          if (n > 0 && n === last) { if (++stableFrames >= 3) return { settled: true, entries: n, ms: Math.round(performance.now() - t0) }; }
          else { stableFrames = 0; last = n; }
          await new Promise((r) => requestAnimationFrame(r));
        }
        return { settled: false, entries: last, ms: Math.round(performance.now() - t0) };
      },
      pageUp: () => { const p = window.__perfLab.visiblePane(); if (!p) return false; p.scrollTop = 0; return true; },
    };
    return true;
  })()`);
}

const call = (cdp, expr) => cdp.evaluate(`(async () => { const h = window.__perfNat; if (!h) throw new Error('window.__perfNat is not installed'); return await (${expr}); })()`);

/** Escape via a real key event — the Resume list closes on it like any dialog. */
async function pressEscape(cdp) {
  const ev = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ev });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev });
}

// ---------------------------------------------------------------------------
// Aggregation (pure — unit-tested)
// ---------------------------------------------------------------------------

/**
 * The IPC sum over every step whose probe reported, seeded at zero and carrying
 * `pings` so a 0 ms total behind zero replies reads as UNMEASURED (the artifacts
 * phase's rule). `readErrors` counts the steps the sum is missing.
 */
export function ipcSumOfSteps(steps) {
  const acc = { pings: 0, totalStallMs: 0, over250ms: 0, over1000ms: 0, maxMs: null, rejectedPings: 0, readErrors: 0, steps: 0 };
  for (const s of steps) {
    const i = s?.ipc;
    if (!i || i.error) { acc.readErrors++; continue; }
    acc.steps++;
    acc.pings += i.pings ?? 0;
    acc.totalStallMs += i.totalStallMs ?? 0;
    acc.over250ms += i.over250ms ?? 0;
    acc.over1000ms += i.over1000ms ?? 0;
    acc.rejectedPings += i.rejectedPings ?? 0;
    if (typeof i.maxMs === 'number') acc.maxMs = acc.maxMs === null ? i.maxMs : Math.max(acc.maxMs, i.maxMs);
  }
  return acc;
}

export const STEP_KEYS = Object.freeze(['createCc', 'browse', 'reveal', 'resume', 'pageUp', 'turn', 'tearoff', 'detachedTurn']);

export const NUMERIC_PATHS = [
  'createCc.createMs', 'createCc.ipc.maxMs',
  'browse.openMs', 'browse.firstRowsMs', 'browse.rowsFirst', 'browse.rowsSettled', 'browse.ipc.maxMs', 'browse.ipc.totalStallMs', 'browse.ipc.pings', 'browse.probe.longtaskMaxMs',
  'reveal.ms', 'reveal.rows', 'reveal.rounds', 'reveal.ipc.maxMs', 'reveal.ipc.totalStallMs', 'reveal.probe.longtaskMaxMs',
  'resume.paintedMs', 'resume.pillMs', 'resume.entries', 'resume.ipc.maxMs', 'resume.ipc.totalStallMs', 'resume.ipc.pings', 'resume.probe.longtaskMaxMs',
  'pageUp.ms', 'pageUp.entriesAdded', 'pageUp.ipc.maxMs', 'pageUp.ipc.totalStallMs',
  'turn.turnMs', 'turn.firstResponseMs', 'turn.deltasSent', 'turn.ipc.maxMs', 'turn.ipc.totalStallMs', 'turn.ipc.pings',
  'tearoff.ms', 'tearoff.windows', 'tearoff.ipc.maxMs', 'tearoff.ipc.totalStallMs', 'tearoff.ipc.pings', 'tearoff.probe.longtaskMaxMs',
  'detachedTurn.deltasSent', 'detachedTurn.ipc.maxMs', 'detachedTurn.ipc.totalStallMs', 'detachedTurn.ipc.pings',
  'ipcSumOfSteps.totalStallMs', 'ipcSumOfSteps.maxMs', 'ipcSumOfSteps.pings', 'ipcSumOfSteps.over250ms', 'ipcSumOfSteps.over1000ms', 'ipcSumOfSteps.readErrors',
  'probe.longtaskTotalMs', 'probe.longtaskMaxMs',
  'nativeSessionsOnDisk',
];

const at = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

/** Median of each NUMERIC_PATH across runs, nested like a run; null (never 0) when no run measured it. Stall verdicts roll up by WORST. */
export function medianRun(runs) {
  const out = {};
  for (const path of NUMERIC_PATHS) {
    const vals = runs.map((r) => at(r, path)).filter((v) => typeof v === 'number' && Number.isFinite(v));
    const keys = path.split('.');
    let node = out;
    for (const k of keys.slice(0, -1)) node = (node[k] ??= {});
    node[keys.at(-1)] = vals.length ? median(vals) : null;
  }
  const order = ['main', 'renderer', 'unclear', 'none', 'unknown'];
  for (const key of STEP_KEYS) {
    const vs = runs.map((r) => r[key]?.stall?.verdict).filter(Boolean);
    (out[key] ??= {}).stallVerdict = vs.length ? (order.find((o) => vs.includes(o)) ?? null) : null;
  }
  return out;
}

export const MEASURES = {
  scenario: 'native-resume',
  question: 'How long is the whole app unresponsive while a user opens the Resume list over a hundred native sessions, resumes a long one, pages it, finishes a reply and tears the tab into its own window?',
  configuration: [
    'the fixture seeds 100 native session files under ~/.youcoded/sessions (fixture.mjs `nativeSessions`): 99 of three turns and one of 400 turns of realistic markdown, all bound to the perf-lab fake endpoint; the 600 decoy Claude Code transcripts are on disk as always',
    'the Resume list opened first, with no session open, from the welcome screen\'s own Resume button, then scrolled to its end until it stops revealing rows',
    'one fresh Claude Code session created before the tear-off, so the window survives it',
    'the 400-turn native session resumed through the app\'s own youcoded:resume-session event with its binding (the model picker never opens)',
    `each reply is ${TURN_DELTAS} deltas at ${TURN_PER_SEC}/s from fake-provider.mjs`,
    'the tear-off through window.claude.detach.openDetached, the app\'s own context-menu route',
    'every repeat is its OWN boot with a freshly built fixture',
  ],
  clocks: {
    'browse.openMs': 'the Resume button clicked -> the list heading and its first rows on screen',
    'resume.paintedMs': 'the resume event dispatched -> the resumed conversation\'s entries on screen and holding still for three frames',
    'pageUp.ms': 'the pane scrolled to its top -> the entry count grew (one more history page)',
    'turn.turnMs': 'native.send -> the Stop button gone',
    'tearoff.ms': 'detach.openDetached -> the session\'s pill gone from this window\'s strip',
    'ipcSumOfSteps.totalStallMs': 'the IPC ping probe (every 50 ms) summed over every step: time the main process was unavailable beyond the ping interval; pings proves it replied, readErrors says how many steps the sum is missing',
  },
  blindTo: [
    'the detached window\'s own rendering — the rig drives one CDP target, and reads the second window only as "it exists"',
    'the Resume list\'s preview pane (rows are revealed, never previewed) and its search box',
    'Claude Code resumes (scenario-history covers those), wallpaper themes, GPU paint (llvmpipe under Xvfb)',
    'a native session over the 256 KB head-read window with its title-bearing message past it',
  ],
};

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

/** One short reply into `sessionId`; resolves when the app's turn ended (or the server finished, labelled). */
async function replyTurn(cdp, fake, { label, sessionId, deltas, perSec, seed, warnings, waitForStopButton = true }) {
  fake.plan({ deltas, perSec, seed });
  const completion = fake.expectCompletion();
  const budgetMs = Math.ceil(deltas / perSec * 1000) + 30_000;
  const tSend = Date.now();
  const send = await cdp.evaluate(`window.claude.native.send(${JSON.stringify(sessionId)}, ${JSON.stringify(`perf-lab-stream ${label}`)})`);
  if (!send || send.status === 'failed') throw new Error(`${label}: native.send was not dispatched — the app returned ${JSON.stringify(send)}`);
  let firstResponseMs = null;
  if (waitForStopButton) {
    try { await waitFor(cdp, 'window.__perfNat.stopCount() > 0', { timeoutMs: 30_000, everyMs: 50 }); firstResponseMs = Date.now() - tSend; } catch { /* fall back below */ }
  }
  let rec;
  try { rec = await withTimeout(completion, budgetMs, `${label}: the app's request to the fake endpoint`); } catch (err) {
    let shown = '';
    try { shown = await cdp.evaluate(`(()=>{const p=[...document.querySelectorAll('.chat-scroll')].find(e=>!e.closest('[aria-hidden="true"]')); return p ? p.innerText.slice(-300) : '';})()`); } catch { /* pane gone */ }
    throw new Error(`${err.message}${shown ? ` — pane shows: ${JSON.stringify(shown)}` : ''}`);
  }
  let turnMs = null, turnEndSignal = 'server';
  if (firstResponseMs !== null) {
    try { await waitFor(cdp, 'window.__perfNat.stopCount() === 0', { timeoutMs: budgetMs, everyMs: 50 }); turnMs = Date.now() - tSend; turnEndSignal = 'stop-button'; } catch {
      warnings.push(`${label}: the Stop button never went away after the fake finished streaming — the app never ended the turn; turnMs is null`);
    }
  } else {
    await sleep(1500);
    turnMs = Date.now() - tSend;
    if (waitForStopButton) warnings.push(`${label}: the app's Stop button was never seen, so the turn end is the fake server's completion plus 1.5 s, not the app's own signal`);
  }
  return { ok: true, firstResponseMs, turnMs, turnEndSignal, deltasSent: rec.deltasSent, perSecAchieved: rec.achievedPerSec, streamMs: rec.streamMs, aborted: rec.aborted };
}

/**
 * @param {object} app      launch.mjs App — { cdp, cdpPort, … }
 * @param {object} fixture  fixture.mjs FixtureInfo, built with { fakeProvider: true, nativeSessions: true }
 */
export async function runNativeResumeScenario(app, fixture, {
  pingMs = IPC_PING_MS, deltas = TURN_DELTAS, perSec = TURN_PER_SEC, revealMaxRounds = REVEAL_MAX_ROUNDS,
} = {}) {
  if (!fixture.fakeProvider) throw new Error('native-resume: the fixture was built without { fakeProvider: true } — the reply steps have no endpoint');
  if (!fixture.nativeSessions?.big) throw new Error('native-resume: the fixture was built without { nativeSessions: true } — there is nothing to list or resume');
  const cdp = app.cdp;
  const cdpPort = app.cdpPort ?? 9555;
  const warnings = [];
  const ns = fixture.nativeSessions;
  let fake = null;
  const opts = { pingMs };
  try {
    fake = await startFakeProvider({ port: fixture.fakeProvider.port });
    await installProbe(cdp);
    await installPageHelpers(cdp);
    await installResumeHelpers(cdp);

    // ── browse.open ───────────────────────────────────────────────────────
    // First, with no session open: the welcome screen's own Resume button.
    const browse = await step(cdp, 'native-resume:browse-open', async () => {
      const t0 = Date.now();
      const open = await call(cdp, 'h.openResume()');
      if (!open.ok) throw new Error(`native-resume: could not open the Resume list — ${open.reason}`);
      await waitFor(cdp, 'window.__perfNat.browserOpen() && window.__perfNat.rows() > 0', { timeoutMs: 60_000, everyMs: 25 });
      const firstRowsMs = Date.now() - t0;
      const rowsFirst = await call(cdp, 'h.rows()');
      // The first rows are not the list: shakedown 4 read "2 rows after 23 ms" and
      // moved on while session:browse was still listing seven hundred files. The
      // list is up when its row count has held still for a second.
      const settled = await call(cdp, 'h.settleRows(1000, 60000)');
      const openMs = Date.now() - t0 - Math.min(1000, settled.ms);
      const names = await call(cdp, 'h.rowNames(5)');
      if (!settled.settled) warnings.push(`native-resume: the Resume list's row count was still changing 60 s after the click (${settled.rows} rows) — browse.openMs is a floor`);
      const panelText = settled.rows < 10 ? await call(cdp, 'h.panelText(400)') : null;
      if (panelText !== null) warnings.push(`native-resume: the Resume list settled at ${settled.rows} row(s) — the panel reads: ${JSON.stringify(panelText)}`);
      return { ok: true, openMs, firstRowsMs, rowsFirst, rowsSettled: settled.rows, names, panelText };
    }, opts);
    if (browse.threw) throw new Error(browse.threw);

    // ── browse.reveal ─────────────────────────────────────────────────────
    const reveal = await step(cdp, 'native-resume:browse-reveal', async () => {
      const t0 = Date.now();
      const r = await call(cdp, `h.revealAll(${revealMaxRounds})`);
      if (!r.ok) throw new Error(`native-resume: could not scroll the Resume list — ${r.reason}`);
      return { ok: true, ms: Date.now() - t0, rows: r.rows, rounds: r.rounds };
    }, opts);
    if (reveal.threw) warnings.push(`native-resume: ${reveal.threw}`);
    const expectedRows = ns.count;
    if (typeof reveal.rows === 'number' && reveal.rows < expectedRows) {
      warnings.push(`native-resume: the Resume list revealed ${reveal.rows} rows but the fixture holds ${expectedRows} native sessions (plus the Claude Code transcripts) — the list did not show them all, so browse numbers were taken over fewer rows than the configuration describes`);
    }

    // ── resume ────────────────────────────────────────────────────────────
    const pillsBefore = await call(cdp, 'h.stripPillIds()');
    const resume = await step(cdp, 'native-resume:resume', async () => {
      await pressEscape(cdp);
      await sleep(150);
      if (await call(cdp, 'h.browserOpen()')) {
        const c = await call(cdp, 'h.closeResume()');
        if (!c.ok) throw new Error(`native-resume: the Resume list would not close (${c.how}) — a resume behind it would be measured under an open dialog`);
      }
      const detail = { claudeSessionId: ns.big.sessionId, projectSlug: ns.slug, projectPath: ns.cwd, provider: 'native', binding: ns.binding };
      const t0 = Date.now();
      await call(cdp, `h.resume(${JSON.stringify(detail)})`);
      await waitFor(cdp, `window.__perfNat.stripPillIds().length > ${pillsBefore.length}`, { timeoutMs: 30_000, everyMs: 25 });
      const pillMs = Date.now() - t0;
      const settled = await call(cdp, 'h.settleEntries(60000)');
      const paintedMs = Date.now() - t0;
      if (!settled.settled) throw new Error(`native-resume: the resumed conversation never held still (${settled.entries} entries after ${settled.ms} ms) — the resume did not finish rendering`);
      return { ok: true, pillMs, paintedMs, entries: settled.entries };
    }, opts);
    if (resume.threw) throw new Error(resume.threw);
    const pillsAfter = await call(cdp, 'h.stripPillIds()');
    const resumedId = pillsAfter.find((id) => !pillsBefore.includes(id)) ?? null;
    if (!resumedId) throw new Error('native-resume: no new pill appeared after the resume, so the resumed session\'s id is unknown — nothing below could target it');
    if (resume.entries < 2) warnings.push(`native-resume: the resumed conversation shows only ${resume.entries} entries — the 400-turn session did not render as a conversation`);

    // ── page.up ───────────────────────────────────────────────────────────
    const pageUp = await step(cdp, 'native-resume:page-up', async () => {
      const before = await call(cdp, 'h.entries()');
      const t0 = Date.now();
      if (!(await call(cdp, 'h.pageUp()'))) throw new Error('native-resume: no visible pane to scroll');
      await waitFor(cdp, `window.__perfNat.entries() > ${before}`, { timeoutMs: 20_000, everyMs: 25 });
      const ms = Date.now() - t0;
      await sleep(300);
      return { ok: true, ms, entriesBefore: before, entriesAdded: (await call(cdp, 'h.entries()')) - before };
    }, opts);
    if (pageUp.threw) warnings.push(`native-resume: page-up — ${pageUp.threw}; pageUp.ms is null (no page loaded, so the history-page read was not measured)`);

    // ── turn ──────────────────────────────────────────────────────────────
    const turn = await step(cdp, 'native-resume:turn', () =>
      replyTurn(cdp, fake, { label: 'native-resume:turn', sessionId: resumedId, deltas, perSec, seed: 'resume-turn', warnings }), opts);
    if (turn.threw) throw new Error(turn.threw);

    // ── create.cc ─────────────────────────────────────────────────────────
    // A second session, so the window survives the tear-off below (the app
    // auto-closes an emptied window, and this window is the CDP target).
    const createCc = await step(cdp, 'native-resume:create-cc', async () => {
      const t0 = Date.now();
      const r = await cdp.evaluate(`(async () => { try { const s = await window.claude.session.create({ name: 'anchor', cwd: ${JSON.stringify(fixture.projects.beta)}, skipPermissions: true }); return { id: s.id }; } catch (e) { return { error: e && e.message ? e.message : String(e) }; } })()`);
      if (!r || r.error) throw new Error(`native-resume: the anchor session.create failed in the app: ${r?.error}`);
      await waitForSessionReady(cdp);
      return { ok: true, createMs: Date.now() - t0, id: r.id };
    }, opts);
    if (createCc.threw) throw new Error(createCc.threw);

    // ── tearoff ───────────────────────────────────────────────────────────
    const tearoff = await step(cdp, 'native-resume:tearoff', async () => {
      const targetsBefore = (await listTargets(cdpPort)).filter((t) => t.type === 'page' && t.url.startsWith('file://')).length;
      const t0 = Date.now();
      await cdp.evaluate(`(() => { window.claude.detach.openDetached({ sessionId: ${JSON.stringify(resumedId)} }); return true; })()`);
      await waitFor(cdp, `!window.__perfNat.stripPillIds().includes(${JSON.stringify(resumedId)})`, { timeoutMs: 30_000, everyMs: 25 });
      const ms = Date.now() - t0;
      let windows = null;
      const tw = Date.now();
      while (Date.now() - tw < 15_000) {
        windows = (await listTargets(cdpPort)).filter((t) => t.type === 'page' && t.url.startsWith('file://')).length;
        if (windows > targetsBefore) break;
        await sleep(100);
      }
      if (windows <= targetsBefore) throw new Error(`native-resume: the pill left this window but no second app window appeared on CDP within 15 s (${windows} page targets, ${targetsBefore} before)`);
      await sleep(1500);
      return { ok: true, ms, windows, windowsBefore: targetsBefore };
    }, opts);
    if (tearoff.threw) throw new Error(tearoff.threw);

    // ── turn.detached ─────────────────────────────────────────────────────
    // The stop button for that session now lives in the OTHER window, so the
    // end signal is the server's; what is measured is THIS window's IPC latency.
    const detachedTurn = await step(cdp, 'native-resume:turn-detached', () =>
      replyTurn(cdp, fake, { label: 'native-resume:turn-detached', sessionId: resumedId, deltas, perSec, seed: 'detached-turn', warnings, waitForStopButton: false }), opts);
    if (detachedTurn.threw) warnings.push(`native-resume: the reply into the detached window failed — ${detachedTurn.threw}`);

    const steps = { createCc, browse, reveal, resume, pageUp, turn, tearoff, detachedTurn };
    const sum = ipcSumOfSteps(Object.values(steps));
    if (sum.readErrors > 0) warnings.push(`native-resume: ${sum.readErrors} steps lost their IPC probe reading — ipcSumOfSteps.totalStallMs is a FLOOR`);
    const verdicts = {};
    for (const [k, s] of Object.entries(steps)) verdicts[k] = s?.stall?.verdict ?? 'unknown';
    const probe = await readProbe(cdp);
    return {
      nativeSessionsOnDisk: ns.count,
      bigSession: { turns: ns.big.turns, bytes: ns.big.bytes },
      resumedId,
      ...steps,
      ipcSumOfSteps: sum,
      stallVerdicts: verdicts,
      probe,
      warnings,
    };
  } finally {
    try { await stopProbe(cdp); } catch { /* page gone */ }
    if (fake) await fake.close();
  }
}
