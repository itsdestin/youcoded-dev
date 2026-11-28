---
title: Why YouCoded hitches - typing while other sessions work, and opening the session menu
status: active
date: 2026-11-27
---

# Hitch audit, 2026-11-27

Reported by Destin:
- **(A)** The theme animation stutters in a fresh session while other sessions work in the background.
- **(B)** There is a hitch every time the session switcher menu opens.

Method: code reading on master `fb611dbbb`, plus the installed app's own hitch log (`~/.config/youcoded/perf/`, 2026-11-25 to 2026-11-27, 8-17 sessions open), copied and analysed read-only. The live app was not touched, and nothing was measured on a real GPU.

## The headline: the evidence was already on disk

The hitch recorder logged, in about 23 hours of use (1397 minutes):
- **About 6,100 freezes of 0.1 s or longer.** That is about 2 minutes frozen per hour of use, with recording continuing overnight while the app sat idle.
- **About 13,300 main-process ("engine") stalls of 100 ms or longer.** The engine's worst delay reached 0.4-0.9 s every hour.
- **A clock-like rhythm.** About 60% of engine stalls in the 29-hour launch fall at the same phase of a 10-second cycle (median 140 ms). A second cluster sits 5 s off it (median 350 ms). That is a timer, not real work.

Nobody had read this file. The lab said "nothing slow found" (card 94) because it measures a different, calmer world (see Tooling below).

## Causes, ranked

### 1. Every chat event makes the engine scan the whole sessions folder - CONFIRMED (code + saved CPU profiles)

**Chain:**
1. `SessionRecords.note()` (`session-record.ts:401`) runs on every transcript, hook and live event of every session.
2. It calls `announceIfChanged` → `summaryKeyOf` → `safeLive`.
3. `safeLive` reaches `liveSource` (`create-runtime.ts:667`), which calls `nativeHost.isNativeSessionId`.
4. That calls `store.has()` (`harness/session-store.ts:381`), which calls `NativeHome.listSessionFiles()`.
5. `listSessionFiles()` uses **synchronous** `readdirSync` and `lstatSync` over `~/.youcoded/sessions`: 136 folders and 1,820 files today.

**Who pays:** for a Claude Code session, `live.has()` is false, so every event pays the full disk walk.

**When it also runs:**
- `summaries()` runs it once per session on the 10 s session-summary timer (`session-summary-push.ts:68`). That timer is the 10 s rhythm in the log.
- The background status refresh runs it again after any summary change.

**Profile evidence:** saved stall profiles show 1.2-3.2 s of `lstat` and 0.8 s of `readdir` in this stack.

**Scaling:** the cost grows with sessions × events × files in the history, so the app gets worse the longer you use it.

**Why the guard missed it:**
- `main-blocking-calls.test.ts` allowlists sync calls per file.
- `has()` was written for one-off clicks (its own comment says "user-initiated paths").
- It was later reached from the per-event path (one-core R5-1, 2026-10-01).
- The guard checks where blocking calls live, not who reaches them.

**Fix (invisible to users):**
- Each session record already knows its provider, so keep an in-memory set of native ids instead of asking the disk.
- `has()` reads a cached index updated by the writer.

### 2. Background terminals are parsed on the engine thread and again in the window - CONFIRMED by reading, cost unmeasured

**In the engine:**
- Each PTY chunk of each Claude Code session goes into a headless terminal (`session-screens.ts:194-220`).
- Each chunk is also regex-scanned (`session-live.ts:114`).

**In the window:**
- Every session keeps a live xterm (`App.tsx:3646-3760`).
- A hidden one is still fed up to 512K characters per second (`terminal-feeder.ts:38`).
- That parsing runs on the same thread as the theme animation.

**Fix:**
- Move engine-side parsing into the existing pty worker.
- Hidden window terminals keep raw text and parse on show (or at a much lower budget).

### 3. The theme animation runs on the busiest thread - CONFIRMED by reading (cause of A)

**Where it runs:** particles are a full-window canvas redrawn by JavaScript every 33 ms (`ThemeEffects.tsx:224`). The mascot is a 33 ms JavaScript spring loop (`MascotRig.tsx:453`). Any engine or window stall delays the next frame, and that delay is the stutter.

**It also forces a re-blur:**
- The canvas sits under the glass message bubbles and drawer.
- Its cut-out (`useChromeGeometry`) covers only the header, status bar and input bar.
- So each particle frame forces every blurred bubble to re-blur.

**Extra repaints while typing:** `useChromeGeometry` sets new rectangles even when nothing moved. Each time the input bar grows, this rebuilds the clip path and repaints the canvas.

**Fix:**
- Run particles in a worker with `OffscreenCanvas`, so they keep moving when the page is busy.
- Extend the cut-out to the bubbles (or move particles above the glass).
- Skip unchanged rectangles.

**Look impact:** none intended. Moving particles above the glass would change the look and needs Destin's call.

### 4. Session menu open: animated layout on a blurred, masked panel - CONFIRMED by reading (cause of B)

**`dropdown-in`:**
- It animates `margin-top` (a layout property) plus opacity (`globals.css:1928`).
- It runs on `.glass-overlay`, which has a backdrop-filter on wallpaper themes.
- Every frame of that 120 ms animation re-lays out and re-blurs the panel.
- ModelPicker, FolderSwitcher and OverflowMenu share the same pattern.

**Per-row animation:**
- Each row runs its own `row-fade-in` with a 20 ms stagger (`SessionStrip.tsx:2440`).
- This happens inside a masked list (`.scroll-mask`), inside the blurred panel.
- With 16 sessions that means about 420 ms of continuous offscreen re-raster.

**Per-row lookups:**
- Each row asks the engine twice for its tags and pin (`useSessionMeta`, through PinMark and SessionTagMarks).
- No answer is cached, so 16 sessions means 32 round trips per open.
- Each answer re-renders its row mid-animation, so chips pop in and rows reflow.

**Whole-strip re-render:**
- Opening re-renders the whole 2,900-line `SessionStrip`.
- The panel position is measured with `getBoundingClientRect` during render.

**Fix:**
- Make the animation transform-only, or a single fade with no per-row stagger.
- Use one cached tags read for all rows.
- Move the menu into its own component.

**Look impact:** the motion changes slightly, so Destin needs to approve.

### 5. Launch-time keychain freeze - CONFIRMED (profiles: 2.8 s, 5.3 s, 7.8 s)

- `RecoverableSafeStorage.needsHelper()` (`providers/recoverable-safe-storage.ts:36`) calls the synchronous `safeStorage.isEncryptionAvailable()` on every encrypt and decrypt.
- The result is never cached, and the async wrapper and the wallet warm-up do not prevent it.
- **Fix:** cache the answer after the first call.

### 6. Smaller items

- **Starting a child process:** spawning `git`, `qdbus` and similar blocks the engine for 0.4-2.8 s in the profiles (`git:file-status` starts 3 git processes per call). Fix: batch calls, or route them through one long-lived helper.
- **The stall profiler itself:** `stall-profiler.ts` stops and restarts the CPU profiler every 25 s, which costs about 100 ms of engine time each time (`post node:inspector` in every profile). 25 s also shows up as a stall interval. Fix: rotate less often, or only after an early warning sign.
- **The window's own unexplained long frames:** 97% of them carry no script and no rendering time. That fits two explanations, neither confirmed: many small tasks adding up (each under the browser's 5 ms attribution floor, e.g. an IPC flood from background sessions), or waiting on the engine or GPU.

## Underlying weaknesses (what a seasoned desktop team designs around)

1. **One engine thread does everything.** IPC, per-session state, terminal parsing, file I/O and child processes all run there, and any synchronous call freezes every window. Mature apps keep the coordinating thread thin and push heavy or blocking work to workers or utility processes.
2. **State is re-derived on hot paths instead of remembered.** "Is this native?" was asked of the disk on every event. Facts should be stored once, when they become true.
3. **Background sessions do foreground-grade work.** Each session's output is fully parsed in the engine and again in the window whether anyone looks or not. Mature apps keep background streams as cheap raw buffers and render them lazily.
4. **Animations depend on the busiest thread.** The JS-driven canvas and springs share a thread with everything else. Mature apps put continuous motion on the compositor (CSS transform/opacity) or in a worker.
5. **Expensive visual stacking.** Blur, mask, opacity animation and live content behind them are combined freely, and nothing budgets the GPU cost of a surface.
6. **Guards check where code lives, not what reaches it.** The blocking-call ratchet and the rules are per-file or per-pattern. A permitted slow function that is later called from a hot path passes every check.

## Why the tooling missed it

- **No real GPU.** Lab numbers come from Xvfb with software rendering. The README itself says blur and paint costs "can rank backwards". The one presented-frame tool (`gpu-cost.mjs`) is blocked at runtime and has no input driver.
- **Calm, small worlds.** Runs wait for a quiet machine, use 1-8 sessions with small fixture histories, and use a stock theme. The real app has 16+ sessions, an 870 MB sessions folder and a particle-and-glass theme. Cause 1 grows with history size, so it is invisible on a small fixture.
- **Interactions nobody drives.** No scenario times opening the session menu, or any menu.
- **Main-thread proxies with coarse floors.** The tools catch long tasks of 50 ms or more, events of 104 ms or more and engine stalls of 100 ms or more. A 20-50 ms frame is visible stutter on a 120 Hz screen and is never recorded.
- **Medians hide periodic spikes.** One stall every 10 s vanishes in a median.
- **Field data never read.** The recorder captured the 10 s rhythm, but no step in the workflow reads it and asks why.

## Tooling improvements, in order

1. **A routine "read the field log" step.** Teach `hitch-report.mjs` to report periodicity, attribute each engine stall to the nearest timer, and compare one launch to another. Run it at the start of every perf session and before each release. This is free, and it would have found cause 1.
2. **A realistic-scale lane.** Use a copy-on-write copy of the real `~/.youcoded/sessions` (`real-scale-startup.mjs` already does this), 16 sessions with background streaming from the fake provider, and the real heavy theme.
3. **An interaction sweep.** Open every menu, popover, drawer and dialog, first open and repeat opens. Record a Chrome trace per open (presented and dropped frames via the `PipelineReporter` parsing already in `gpu-cost-parse.mjs`), long animation frames with script attribution, and Event Timing at 16 ms.
4. **A foreground-animation-under-load scenario.** Type in an empty session while 3-5 others stream. Compare with the background sessions paused.
5. **Unblock one real-GPU lane.** The safety work it is gated behind is its own reviewed task.
6. **A reachability guard.** List the functions that run per event or per timer, and fail the test if any of them can reach an allowlisted synchronous call: ast-grep or the TS call graph from `note()`, `summaries()` and every `setInterval` callback. Add a scale test that runs `note()` 1,000× with a fake 2,000-file sessions folder and asserts zero filesystem calls.
7. **Recorder upgrades.** Bucket 20-50 ms frames instead of dropping them. Add "sessions streaming now" and "menu open" context. Count small tasks per long frame so "unattributed" becomes "N small tasks". Raise the stall profiler's cost check.

## Fix order proposed

| # | Fix | Users notice | Approval |
|---|---|---|---|
| 1 | Remember native ids in memory; stop the per-event disk scan | Fewer freezes; nothing looks different | Invisible fix |
| 2 | Cache the keychain answer | Faster launch | Invisible fix |
| 3 | Session menu: one cached tags read; menu moved into its own component | Chips appear at once | Invisible fix |
| 4 | Session menu and other dropdowns: transform-only or single fade | Motion changes slightly | Destin |
| 5 | Particles in a worker; cut-out covers bubbles; skip unchanged rectangles | Smoother particles | Destin (if the look moves) |
| 6 | Hidden terminals: raw backlog, parse on show; engine parsing to pty worker | Fewer background hiccups | Invisible, larger work |
| 7 | Stall profiler rotation cost | Fewer small stalls | Invisible fix |
| 8 | Tooling 1, 6, 2-4 above | - | Workspace tooling |
