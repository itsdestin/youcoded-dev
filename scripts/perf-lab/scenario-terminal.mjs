// scripts/perf-lab/scenario-terminal.mjs — the terminal-view journey: the six
// workload sessions open, the four Claude Code sessions switched to TERMINAL view
// and each filled with ~2,000 lines of mixed glyphs, then 40 switches between
// them in terminal view — both probes over every switch's one-second slot, and the
// app's own glyph-atlas clear counter read around each slot.
//
// WHY THIS SCENARIO EXISTS
// Destin's freeze reports (2026-08-27) are app-wide stalls, and the terminal view
// was the one surface the rig had never opened — the README coverage table listed
// it as NOT covered, so nothing there could be caught. The specific suspect is
// TerminalView's glyph-atlas heal (TerminalView.tsx, the visibility effect): every
// hidden -> visible transition calls clearTextureAtlas(), and that atlas is SHARED
// by every open terminal, so each session switch in terminal view makes all of
// them re-rasterise. It was added on 2026-07-30 for the black-glyph bug, which the
// mipmap patch (PR #333) actually fixed; what is left is a defence against a
// transient bad GPU texture. Worth keeping — but not at "every switch" if the
// switch cost shows. Nothing measured it until this file.
//
// THREE CODE-LEVEL SUSPECTS this journey separates:
//  1. The shared atlas clear on hide -> show (TerminalView.tsx visibility effect).
//     `atlasClearsPerSwitch` proves the mechanism ENGAGED (expected ~1: one
//     terminal becomes visible per switch); switch time and long tasks are its cost.
//  2. `FitAddon.fit()` per size change, and the debounced RESIZE heal that rides
//     it (flushResize). Switching between sessions that are all in terminal view
//     should not change any terminal's size, so a per-switch clear count well
//     ABOVE 1 means resize heals are firing on switches too. `clearsOutsideSlots`
//     counts clears the settled totals saw but no switch's one-second slot did —
//     the few-ms CDP gaps between slots and the settle after the last one — so a
//     non-zero value means a clear arrived after its switch's slot had closed.
//  3. The DOM-renderer fallback path. If WebGL did not initialise, xterm renders
//     through DOM rows and clearTextureAtlas() is only a full repaint (core
//     optional-chains the atlas call away). `renderer` records which path this
//     run actually got, read off the visible terminal's DOM.
//
// GLYPH COVERAGE — HOW, AND WHY NOT `seq 1 2000`
// The terminal view shows each session's Claude PTY, which under the rig is
// fake-claude.cjs, not a shell — there is nowhere to run `seq`. The least
// invasive fill: fake-claude recognises ONE typed line (surrounding whitespace
// ignored), `perf-lab-glyphs <n>`, and prints n lines of printable ASCII plus the
// box-drawing/status glyphs Claude Code's TUI draws, in seven colours with bold
// every fifth line (the atlas keys a glyph by colour and weight too). The scenario
// types that line into each PTY with window.claude.session.sendInput and waits for
// the fixed sentinel line (GLYPH_SENTINEL) in the terminal buffer — a signal, not
// a sleep. No other scenario types it, so their fake-claude behaviour (echo) is
// byte-for-byte unchanged.
//
// WHY ONLY THE FOUR CLAUDE CODE SESSIONS ARE SWITCHED BETWEEN
// The six sessions are the workload's six (openJourneySessions), so a terminal
// switch number sits next to the chat-view switch number measured over the SAME
// open state. But the two native sessions have no PTY — their terminal is empty —
// and view mode is per session (App.tsx `viewModes`), so a switch through a native
// session flips <html data-view-mode> to chat and back, changes every terminal's
// bottom inset, and fires resize heals that a terminal-view user never triggers.
// They stay open (their ChatViews still mounted) and are never switched to.
//
// WHAT THIS SCENARIO IS BLIND TO — say it, do not let a number stand in for it:
//  - GPU cost. The rig runs on llvmpipe under Xvfb (report.machine.renderer), so
//    WebGL may not initialise and clearTextureAtlas() then only forces a full DOM
//    repaint. The GPU texture RE-UPLOAD cost on real hardware is NOT measured here.
//  - Wallpaper themes: the fixture boots the stock theme, so the terminal's
//    see-through container and wallpaper backing layer are not in play.
//  - Sleep/resume or VRAM reclaim — the corruption the heal still defends against.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { waitFor } from './cdp.mjs';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';
import { attributeStall } from './scenario-artifacts.mjs';
import {
  installPageHelpers, installProbe, median, openJourneySessions, p95, readProbe, readProbeWindow, stopProbe,
} from './scenario-workload.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : n);

/** Lines of glyphs printed into each terminal. */
export const GLYPH_LINES = 2000;
/** The command fake-claude.cjs answers with a glyph fill — see its GLYPH_CMD. */
export const glyphCommand = (n = GLYPH_LINES) => `perf-lab-glyphs ${n}`;
/** The last line fake-claude prints after a fill; the scenario waits for it. Pinned against fake-claude by the test. */
export const GLYPH_SENTINEL = (n = GLYPH_LINES) => `[perf-lab] glyph fill complete: ${n} lines`;
/** Switches in terminal view per repeat. 40 is the workload's count, so p95 has >= 20 samples. */
export const SWITCH_COUNT = 40;
/**
 * One switch per slot. The workload spaces its 40 over 40 s, so each switch has its
 * own window; here each slot is also the IPC probe's window (see the switch loop).
 */
export const SWITCH_EVERY_MS = 1000;
/** IPC ping interval inside a slot: ~20 pings per one-second slot. */
export const IPC_PING_MS = 50;
// How long the atlas counter must hold still before a reading counts as settled.
// Above the resize heal's 120 ms debounce, with margin for a busy software renderer.
const CLEARS_QUIET_MS = 1000;
const CLEARS_SETTLE_CAP_MS = 10_000;

const mark = (cdp, label) =>
  cdp.evaluate(`(() => { if (window.__perfProbe) window.__perfProbe.mark(${JSON.stringify(label)}); return true; })()`);

// ---------------------------------------------------------------------------
// In-page helpers
// ---------------------------------------------------------------------------

/**
 * Installs `window.__perfTerm`. Selectors read off master:
 *  - Every TerminalView's root is `div.terminal-overlay-scroll`, and a HIDDEN one
 *    also carries `terminal-hidden` (TerminalView.tsx wrapperClass). The class is
 *    read, not getComputedStyle — a poll must never force style (README).
 *  - App renders `sessions.map(s => <ChatView/><TerminalView/>)`, so the n-th
 *    wrapper in DOM order is the n-th session, the same index rule the workload's
 *    `.chat-scroll` pane lookup relies on.
 *  - The WebGL addon draws into a <canvas> inside `.xterm-screen`; the DOM
 *    renderer lays rows out in `.xterm-rows`.
 *  - `window.__terminalRegistry.atlasClears` is the app's instrument
 *    (bootstrap/terminal-bridge.ts). A build that predates it reads null — never 0.
 *  - The click itself goes through `window.__perfLab.switchTo` (scenario-workload),
 *    which already handles the pill-vs-overflow-menu lookup; its `ok` is about CHAT
 *    panes and is meaningless in terminal view, so only its `mode` is used here.
 */
export async function installTerminalHelpers(cdp) {
  await cdp.evaluate(`(() => {
    const wrappers = () => Array.prototype.slice.call(document.querySelectorAll('.terminal-overlay-scroll'));
    const visibleIdx = () => wrappers().findIndex((w) => !w.classList.contains('terminal-hidden'));
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const until = async (pred, timeoutMs) => {
      const t0 = performance.now();
      while (performance.now() - t0 < timeoutMs) { if (pred()) return true; await raf2(); }
      return false;
    };
    window.__perfTerm = {
      wrappers, visibleIdx, raf2, until,
      count: () => wrappers().length,
      atlasClears: () => {
        const r = window.__terminalRegistry;
        const v = r ? r.atlasClears : undefined;
        return typeof v === 'number' ? v : null;
      },
      rendererOf: (idx) => {
        const w = wrappers()[idx];
        if (!w) return 'unknown';
        if (w.querySelector('.xterm-screen canvas')) return 'webgl';
        const rows = w.querySelector('.xterm-rows');
        return rows && rows.children.length ? 'dom' : 'unknown';
      },
      /** Click the session's pill; time until its terminal is the visible one and two frames painted. */
      switchTo: async (idx, name, sessionCount) => {
        const t0 = performance.now();
        const before = visibleIdx();
        if (!window.__perfLab) return { ok: false, mode: 'none', reason: 'window.__perfLab is not installed' };
        const c = await window.__perfLab.switchTo(idx, name, sessionCount, false);
        if (c.mode === 'none') return { ok: false, mode: 'none', reason: c.reason, before, after: visibleIdx() };
        const shown = await until(() => visibleIdx() === idx, 20000);
        await raf2();
        return {
          ok: shown && before !== idx,
          ms: Math.round((performance.now() - t0) * 10) / 10,
          mode: c.mode, before, after: visibleIdx(),
          reason: shown ? (before === idx ? 'that terminal was already visible — nothing switched' : null) : 'the target terminal never became the visible one within 20 s',
        };
      },
    };
    return true;
  })()`);
}

const call = (cdp, expr) => cdp.evaluate(`(async () => { const h = window.__perfTerm; if (!h) throw new Error('window.__perfTerm is not installed'); return await (${expr}); })()`);

/** Ctrl+` — the app's own view toggle (App.tsx keydown, capture phase). rawKeyDown so no backtick is typed anywhere. */
async function toggleView(cdp) {
  const ev = { modifiers: 2, key: '`', code: 'Backquote', windowsVirtualKeyCode: 192, nativeVirtualKeyCode: 192 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ev });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev });
}

/** Wait until the atlas counter holds still for CLEARS_QUIET_MS. Returns the reading (null = no instrument). */
async function settledClears(cdp, warnings, label) {
  const t0 = Date.now();
  let last = await call(cdp, 'h.atlasClears()');
  if (last === null) return null;
  let stableSince = Date.now();
  while (Date.now() - stableSince < CLEARS_QUIET_MS) {
    if (Date.now() - t0 > CLEARS_SETTLE_CAP_MS) {
      warnings.push(`terminal: the atlas clear counter was still moving ${CLEARS_SETTLE_CAP_MS} ms into the ${label} settle — clears are firing continuously, so the per-switch count below is not a count of switch-caused clears`);
      return last;
    }
    await sleep(200);
    const v = await call(cdp, 'h.atlasClears()');
    if (v !== last) { last = v; stableSince = Date.now(); }
  }
  return last;
}

// ---------------------------------------------------------------------------
// Aggregation (pure — unit-tested)
// ---------------------------------------------------------------------------

/**
 * The IPC fields one slot's row keeps, from a readIpcStallProbe() result.
 *
 * WHY `openStallMs` and `rejectedPings` are kept (review, 2026-09-10): the first
 * version dropped both. `openStallMs` is a ping still outstanding when the slot
 * closed — the probe is stopped right after the read, so that ping's round trip is
 * NEVER recorded as a sample; dropping it means a main process blocked across a
 * slot boundary reads as a responsive app. `rejectedPings` are round trips that came
 * back as errors, not replies, and would otherwise pass as fast pings.
 * `everyMs` travels with the row so the open stall can be counted the same way
 * probe-ipc counts a finished one (only the part beyond the ping interval).
 * A failed read keeps its error so summariseSwitches can count it.
 */
export function ipcRow(read, everyMs) {
  if (!read || read.error) return { error: read?.error ?? 'no IPC probe reading' };
  return {
    everyMs,
    pings: read.pings,
    totalStallMs: read.totalStallMs,
    maxMs: read.maxMs,
    over250ms: read.over250ms,
    over1000ms: read.over1000ms,
    openStallMs: typeof read.openStallMs === 'number' ? read.openStallMs : null,
    rejectedPings: read.rejectedPings ?? 0,
    missedTicks: read.missedTicks ?? 0,
  };
}

/**
 * The run's headline numbers from its per-slot rows.
 *
 * Only VERIFIED switches (the target terminal actually became the visible one)
 * feed the timings — a switch that landed on nothing is fast precisely because
 * nothing happened (the workload's 2026-08-27 fix). `atlasClearsPerSwitch` is the
 * TOTAL clear count across the switch window (settled reading minus the reading
 * before the first switch) over verified switches; each row's `clears` covers its
 * own slot, and `clearsOutsideSlots` is what the rows did not see.
 *
 * IPC: summed over every slot whose probe reading came back. A ping still in flight
 * at a slot's close counts its wait so far beyond the ping interval — exactly how
 * probe-ipc counts a finished ping — and toward maxMs and the over-threshold counts.
 * Slots whose reading errored are COUNTED (`ipc.readErrors`), never silently
 * dropped, because a total over fewer slots is a floor.
 * Every field is null, never 0, when it was not measured.
 */
export function summariseSwitches({ switches, clearsBefore, clearsAfter }) {
  const ok = switches.filter((s) => s.ok);
  const painted = ok.map((s) => s.ms).filter((n) => typeof n === 'number' && Number.isFinite(n));
  const haveClears = typeof clearsBefore === 'number' && typeof clearsAfter === 'number';
  const clearsTotal = haveClears ? clearsAfter - clearsBefore : null;
  const inSlots = switches.map((s) => s.clears).filter((n) => typeof n === 'number');
  const inSlotsSum = inSlots.length ? inSlots.reduce((a, b) => a + b, 0) : null;
  const ipc = switches.reduce((acc, s) => {
    const i = s.ipc;
    if (!i || i.error) { acc.readErrors++; return acc; }
    const open = typeof i.openStallMs === 'number' ? i.openStallMs : null;
    const openBeyond = open === null ? 0 : Math.max(0, open - (i.everyMs ?? 0));
    acc.pings += i.pings ?? 0;
    acc.totalStallMs += (i.totalStallMs ?? 0) + openBeyond;
    acc.over250ms += (i.over250ms ?? 0) + (open !== null && open > 250 ? 1 : 0);
    acc.over1000ms += (i.over1000ms ?? 0) + (open !== null && open > 1000 ? 1 : 0);
    const slotMax = Math.max(i.maxMs ?? 0, open ?? 0);
    acc.maxMs = acc.maxMs === null ? slotMax : Math.max(acc.maxMs, slotMax);
    if (openBeyond > 0) acc.openStalls++;
    acc.rejectedPings += i.rejectedPings ?? 0;
    return acc;
  }, { pings: 0, totalStallMs: 0, over250ms: 0, over1000ms: 0, maxMs: null, openStalls: 0, rejectedPings: 0, readErrors: 0 });
  const verdicts = {};
  for (const s of switches) { const v = s.stall?.verdict ?? 'unknown'; verdicts[v] = (verdicts[v] ?? 0) + 1; }
  return {
    switchCount: switches.length,
    verifiedSwitches: ok.length,
    failedSwitches: switches.length - ok.length,
    menuSwitches: switches.filter((s) => s.mode === 'menu').length,
    switchPaintedMedianMs: painted.length ? median(painted) : null,
    switchPaintedP95Ms: painted.length ? p95(painted) : null,
    atlasClearsTotal: clearsTotal,
    atlasClearsPerSwitch: haveClears && ok.length ? round1(clearsTotal / ok.length) : null,
    clearsOutsideSlots: haveClears && inSlotsSum !== null ? clearsTotal - inSlotsSum : null,
    ipc,
    stallVerdicts: verdicts,
  };
}

// ---------------------------------------------------------------------------
// Report contract
// ---------------------------------------------------------------------------

export const NUMERIC_PATHS = [
  // The clock a user feels: click -> the other terminal on screen.
  'switchPaintedMedianMs', 'switchPaintedP95Ms',
  // Suspect 1's engagement check, and suspect 2's tell (clears outside every slot).
  'atlasClearsPerSwitch', 'atlasClearsTotal', 'clearsOutsideSlots',
  // Renderer cost across the switch window.
  'longtaskMaxMs', 'longtaskTotalMs', 'longtaskCount', 'frameGapMaxMs',
  // Main-process cost, summed over the slots; pings proves the probe replied, and
  // readErrors says how many slots the sum is missing.
  'ipc.totalStallMs', 'ipc.maxMs', 'ipc.over250ms', 'ipc.pings',
  'ipc.openStalls', 'ipc.rejectedPings', 'ipc.readErrors',
  'verifiedSwitches', 'failedSwitches',
];

const at = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

/** Median of each NUMERIC_PATH across runs, nested like a run; null (never 0) when no run measured it. */
export function medianRun(runs) {
  const out = {};
  for (const path of NUMERIC_PATHS) {
    const vals = runs.map((r) => at(r, path)).filter((v) => typeof v === 'number' && Number.isFinite(v));
    const keys = path.split('.');
    let node = out;
    for (const k of keys.slice(0, -1)) node = (node[k] ??= {});
    node[keys.at(-1)] = vals.length ? median(vals) : null;
  }
  return out;
}

export const MEASURES = {
  scenario: 'terminal',
  question: 'What does a session switch cost in terminal view, and how many shared glyph-atlas clears does each one trigger?',
  configuration: [
    'the workload\'s six sessions (4 Claude Code — huge / medium / small resumed plus an empty control — and 2 native), opened with the same openJourneySessions',
    'the four Claude Code sessions each switched to terminal view (Ctrl+`) and filled with 2,000 lines of mixed glyphs (printable ASCII + TUI box-drawing, seven colours, bold every fifth line) printed by fake-claude on the typed line `perf-lab-glyphs 2000`',
    '40 switches between those four in terminal view, one per one-second slot; the two native sessions stay open in chat view and are never switched to (no PTY, and a switch through one flips every terminal\'s inset)',
    'every repeat is its OWN boot with a freshly built fixture, like the workload',
    'stock theme, no wallpaper',
  ],
  clocks: {
    switchPaintedMedianMs: 'click the session pill -> that session\'s terminal is the visible one AND two animation frames have painted (the atlas clear\'s full refresh lands in the first of them)',
    atlasClearsPerSwitch: 'window.__terminalRegistry.atlasClears after the switch window settled (counter still for 1 s) minus before the first switch, over verified switches; ~1 means one hide->show heal per switch',
    longtaskMaxMs: 'the renderer long-task probe over the marked switch window only (setup and fill excluded)',
    'ipc.totalStallMs': 'the IPC ping probe (every 50 ms) installed at the START of each switch\'s one-second slot and read just before the NEXT switch (the last slot is held open for its full second), so the time between switches is covered; a ping still in flight at a slot\'s close counts its wait so far beyond the ping interval; summed over the 40 slots, with slots whose reading failed counted in ipc.readErrors',
  },
  blindTo: [
    'GPU cost: the rig runs on llvmpipe under Xvfb (report.machine.renderer), so WebGL may not initialise and clearTextureAtlas() then only forces a full DOM repaint — the GPU texture re-upload cost on real hardware is NOT measured here; `renderer` on each run says which path it got',
    'wallpaper themes: the stock theme has no wallpaper, so the terminal\'s see-through container and backing layer are not in play',
    'switching through native sessions in terminal view, and toggling chat <-> terminal (both resize every terminal and fire the resize heal)',
    'the transient GPU texture corruption (sleep/resume, VRAM reclaim) the heal still defends against — whether glyphs stay correct needs a human on real hardware',
    'the few milliseconds between one slot\'s probe read and the next slot\'s install (CDP round trips), and the first ping interval of each slot (probe-ipc sends its first ping one interval after install)',
  ],
};

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

/** Open one switch's slot: atlas reading, probe mark, IPC probe installed, then the click. */
async function openSlot(cdp, i, idx, name, sessionCount, pingMs) {
  const label = `terminal:switch-${i}`;
  const clearsPre = await call(cdp, 'h.atlasClears()');
  await mark(cdp, `${label}:start`);
  await installIpcStallProbe(cdp, { everyMs: pingMs });
  let r;
  try {
    r = await call(cdp, `h.switchTo(${idx}, ${JSON.stringify(name)}, ${sessionCount})`);
  } catch (err) {
    r = { ok: false, mode: 'none', reason: err.message };
  }
  return { i, idx, name, label, clearsPre, r };
}

/** Close a slot: read + stop the IPC probe FIRST (so no later work lands in it), then the renderer window and the atlas. */
async function closeSlot(cdp, slot, pingMs) {
  let read;
  try { read = await readIpcStallProbe(cdp); } catch (err) { read = { error: err.message }; }
  try { await stopIpcStallProbe(cdp); } catch { /* page gone */ }
  await mark(cdp, `${slot.label}:end`);
  let probe = null;
  try { probe = await readProbeWindow(cdp, `${slot.label}:start`, `${slot.label}:end`); } catch (err) { probe = { error: err.message }; }
  const clearsPost = await call(cdp, 'h.atlasClears()');
  const ipc = ipcRow(read, pingMs);
  const { r } = slot;
  return {
    i: slot.i, idx: slot.idx, name: slot.name, ok: !!r.ok, mode: r.mode, ms: r.ms ?? null, reason: r.reason ?? null,
    slotMs: probe?.windowMs ?? null,
    clears: typeof slot.clearsPre === 'number' && typeof clearsPost === 'number' ? clearsPost - slot.clearsPre : null,
    ipc,
    longtaskMaxMs: probe?.longtaskMaxMs ?? null,
    stall: attributeStall(read && !read.error ? read : null, probe),
  };
}

/**
 * @param {object} app      launch.mjs App — { cdp, … }
 * @param {object} fixture  fixture.mjs FixtureInfo
 * @param {object} [opts]
 */
export async function runTerminalScenario(app, fixture, {
  switchCount = SWITCH_COUNT, switchEveryMs = SWITCH_EVERY_MS, glyphLines = GLYPH_LINES, pingMs = IPC_PING_MS,
} = {}) {
  const cdp = app.cdp;
  const ids = [];
  const warnings = [];
  try {
    await installProbe(cdp);
    await installPageHelpers(cdp);
    await installTerminalHelpers(cdp);

    const { names, sizeByName } = await openJourneySessions(cdp, fixture, { ids, warnings });
    const ptyIdx = names.map((n, i) => (sizeByName[n] === 'native' ? -1 : i)).filter((i) => i >= 0);
    if (ptyIdx.length < 2) throw new Error(`terminal: only ${ptyIdx.length} PTY-backed session(s) opened — nothing to switch between`);
    const terminals = await call(cdp, 'h.count()');
    if (terminals !== ids.length) {
      throw new Error(`terminal: ${terminals} TerminalView wrappers for ${ids.length} sessions — the DOM-order index rule does not hold, so every switch would be verified against the wrong terminal`);
    }

    // ── Setup: each PTY session into terminal view, then fill it ─────────
    await mark(cdp, 'terminal:setup:start');
    const fillMs = [];
    let renderer = 'unknown';
    for (const idx of ptyIdx) {
      const sw = await cdp.evaluate(`window.__perfLab.switchTo(${idx}, ${JSON.stringify(names[idx])}, ${ids.length}, false)`);
      if (sw.mode === 'none') throw new Error(`terminal: could not bring ${names[idx]} on screen — ${sw.reason}`);
      await toggleView(cdp);
      const shown = await call(cdp, `h.until(() => h.visibleIdx() === ${idx}, 20000)`);
      if (!shown) throw new Error(`terminal: Ctrl+\` did not put ${names[idx]} into terminal view (visible terminal index ${await call(cdp, 'h.visibleIdx()')}) — the app's view toggle did not respond`);
      if (renderer === 'unknown') renderer = await call(cdp, `h.rendererOf(${idx})`);

      const t0 = Date.now();
      await cdp.evaluate(`window.claude.session.sendInput(${JSON.stringify(ids[idx])}, ${JSON.stringify(`${glyphCommand(glyphLines)}\r`)})`);
      const sentinel = GLYPH_SENTINEL(glyphLines);
      try {
        await waitFor(cdp, `(window.__terminalRegistry?.getScreenText(${JSON.stringify(ids[idx])}, 8) ?? '').includes(${JSON.stringify(sentinel)})`, { timeoutMs: 60_000, everyMs: 200 });
      } catch {
        const tail = await cdp.evaluate(`window.__terminalRegistry?.getScreenText(${JSON.stringify(ids[idx])}, 8) ?? null`).catch(() => null);
        throw new Error(`terminal: ${names[idx]} never showed the glyph-fill sentinel within 60 s — the fill command did not reach fake-claude or its output never reached xterm. Terminal tail: ${JSON.stringify(tail)}`);
      }
      fillMs.push(Date.now() - t0);
    }
    if (renderer !== 'webgl') {
      warnings.push(`terminal: the visible terminal rendered through '${renderer}', not WebGL — clearTextureAtlas() is only a full repaint on this path, so every atlas cost below is the DOM-repaint cost, not a GPU re-rasterise`);
    }
    await mark(cdp, 'terminal:setup:end');

    // Let the setup's own heals (view toggles resize every terminal) drain first,
    // so none of them are charged to the first switch.
    const clearsBefore = await settledClears(cdp, warnings, 'pre-switch');
    if (clearsBefore === null) {
      warnings.push('terminal: this build has no window.__terminalRegistry.atlasClears (it predates the instrument), so atlas clears per switch are UNMEASURED — the timings cannot be tied to the heal');
    }

    // ── 40 switches in terminal view, one per slot ───────────────────────
    // WHY each slot is held open until the NEXT switch is due (review fix,
    // 2026-09-10). The first version read and stopped the IPC probe the moment the
    // in-page switch returned — a few frames after the click. probe-ipc's first ping
    // fires one interval after install, so each step got 0–2 samples, the ~900 ms
    // between switches was never probed, and a ping still in flight was thrown away.
    // With a 1 ms zero-baseline floor in compare.mjs, one late ping could REJECT a
    // good change. Now the probe is installed at the slot's start and read just
    // before the next switch (the last slot is held its full second too), so the
    // slots tile the switch window and a pending ping is counted (ipcRow).
    await mark(cdp, 'terminal:switches:start');
    const switches = [];
    const startedAt = Date.now();
    for (let i = 0; i < switchCount; i++) {
      const due = startedAt + i * switchEveryMs - Date.now();
      if (due > 0) await sleep(due);
      // Setup ended on the LAST PTY session and this starts at the first, so
      // switch 0 always moves; every later switch goes to the next session.
      const idx = ptyIdx[i % ptyIdx.length];
      const slot = await openSlot(cdp, i, idx, names[idx], ids.length, pingMs);
      // A switch that overran its slot closes at once, and the next slot opens
      // straight after — the slots stay contiguous either way.
      const close = startedAt + (i + 1) * switchEveryMs - Date.now();
      if (close > 0) await sleep(close);
      switches.push(await closeSlot(cdp, slot, pingMs));
    }
    await mark(cdp, 'terminal:switches:end');
    const clearsAfter = clearsBefore === null ? null : await settledClears(cdp, warnings, 'post-switch');

    const switchWindow = await readProbeWindow(cdp, 'terminal:switches:start', 'terminal:switches:end');
    const probe = await readProbe(cdp);
    const summary = summariseSwitches({ switches, clearsBefore, clearsAfter });

    if (summary.failedSwitches > 0) {
      const reasons = [...new Set(switches.filter((s) => !s.ok).map((s) => s.reason))].slice(0, 3);
      warnings.push(`terminal: ${summary.failedSwitches}/${summary.switchCount} switches never showed the target terminal and are excluded from every timing — ${reasons.join('; ')}`);
    }
    if (summary.menuSwitches > 0) {
      warnings.push(`terminal: ${summary.menuSwitches} switches went through the overflow menu (a pill did not fit), which also pays for opening the menu`);
    }
    if (summary.ipc.readErrors > 0) {
      const first = switches.find((s) => s.ipc?.error)?.ipc?.error;
      warnings.push(`terminal: ${summary.ipc.readErrors}/${summary.switchCount} switch slots lost their IPC probe reading (first: ${first}) — ipc.totalStallMs is summed over the remaining slots only, so it is a FLOOR`);
    }
    if (summary.ipc.rejectedPings > 0) {
      warnings.push(`terminal: ${summary.ipc.rejectedPings} IPC pings came back as rejections, not replies — those round trips say nothing about responsiveness`);
    }
    if (typeof summary.atlasClearsPerSwitch === 'number' && summary.atlasClearsPerSwitch < 0.5) {
      warnings.push(`terminal: only ${summary.atlasClearsPerSwitch} atlas clears per switch — the hide->show heal did NOT engage on most switches, so these timings do not describe its cost`);
    }
    if (typeof summary.atlasClearsPerSwitch === 'number' && summary.atlasClearsPerSwitch > 1.5) {
      warnings.push(`terminal: ${summary.atlasClearsPerSwitch} atlas clears per switch (${summary.clearsOutsideSlots} of them outside every switch's slot) — more than the one hide->show heal, so resize heals (suspect 2) are firing on switches too`);
    }

    return {
      sessions: { names, sizes: sizeByName, switchedBetween: ptyIdx.map((i) => names[i]) },
      renderer,
      glyphs: { lines: glyphLines, terminals: ptyIdx.length, fillMs },
      ...summary,
      longtaskMaxMs: switchWindow?.longtaskMaxMs ?? null,
      longtaskTotalMs: switchWindow?.longtaskTotalMs ?? null,
      longtaskCount: switchWindow?.longtaskCount ?? null,
      frameGapMaxMs: switchWindow?.frameGapMaxMs ?? null,
      switchWindowMs: switchWindow?.windowMs ?? null,
      switches,
      probe,
      warnings,
    };
  } finally {
    // Each repeat is its own boot, which is killed afterwards, so the sessions are
    // left for the teardown; only the page-side loops are stopped here.
    try { await stopIpcStallProbe(cdp); } catch { /* page gone */ }
    try { await stopProbe(cdp); } catch { /* page gone */ }
  }
}
