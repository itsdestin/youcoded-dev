---
title: Performance history, remaining risks, and measurement-first optimization
status: superseded
date: 2026-09-26
---

# Performance audit and proposed optimization program

## Scope and evidence

Requested: review recent performance improvements, identify recurring defect classes and inconsistent approaches, look for overlooked stack-specific risks, improve detection, then fix with before/after measurements.

Audited snapshots:
- Workspace: `8ddd1bbb21020bbfaa3446104950dde9f567fceb`
- App: `bb939f917e3e64437825b24f3b86b02f14843825`
- Isolated session: `performance-history-audit`.

This document distinguishes **historical measurements**, **current source-confirmed mechanisms**, and **untested hypotheses**. No current app benchmark has been run in this audit; no product code, live configuration, or running app has been modified. The recommendations below are a proposal, not an approved implementation design.

The history review screened 5,362 app commits and 3,296 workspace commits from April 1 through the audited HEAD (workspace history in that window begins April 10). Screening used commit subjects, bodies and changed hot-path filenames, not only `perf:` titles. A deeper pass inspected patches for 189 app commits, including all 110 `perf`-prefix commits; 155 selected implementation entries appear in the performance-intent inventory. Seven perf-prefix commits are instrumentation, baseline or comment-only changes, not independent product speedups. Other commits remain screened rather than deeply reviewed: this is not a claim that all potentially relevant diffs were exhaustively understood, nor that all intended improvements delivered measured gains. Merges are not counted again as independent fixes.

The initial filename parser was found to mix commit-body text with paths. Its inventory was replaced using NUL-delimited parsing before delivery. Supporting records are in `docs/archive/investigations/2026-09-26-performance-history-audit/`: `full-log-screen.csv`, `confirmed-performance-intent.md`, `implementation-evidence-app.md`, and `implementation-evidence-workspace.md`. The intent inventory's grouping is heuristic; the taxonomy in this report is the reviewed synthesis. Patch excerpts alone are not performance measurements.

The code review covers desktop renderer/main and selected Android runtime/bridge paths. Tooling review covers perf-lab, adjacent idle/resize/A-B tools, and workspace/app CI workflows. A separate reviewer checked the proposed measurement approach and source-risk distinctions; their corrections added Android byte-integrity testing and clarified that current Find searches loaded history, not unloaded pages. These scopes cannot establish that every possible issue has been found.

## Executive assessment

The existing architecture has substantial performance protections: paged history, folded offscreen message bodies, memoized completed markdown pieces, slice subscriptions, hidden-view throttling, targeted file notifications, asynchronous I/O, caches, bounded remote restore, and animation work limits. The next phase should build on those rather than replace them wholesale.

The principal remaining gap is the connection between **a coding rule**, **a realistic workload**, and **a recurring measured pass/fail result**. CI checks useful structural safeguards and tests the measuring tools, but the inspected workflows do not run the app's numerical performance suite on a recurring basis. A passing unit suite is not a smoothness verdict.

Two important distinctions:
1. **A faster operation can still stutter.** Total CPU, average latency and React commits do not establish smooth frame delivery or acceptable worst interactions.
2. **An optimization can move cost rather than remove it.** Freezing background views can make the next switch expensive; folding can make Find expensive; batching can delay the final byte indefinitely; caching can exchange repeated work for retained memory.

## Historical defect classes and how we addressed them

Representative commits below identify the changes, not a claim that every commit has a measured end-to-end win. The accompanying inventory records inspection depth; merge commits are not counted again as independent fixes.

| General class | What kept going wrong | Fix pattern and representative app commits |
|---|---|---|
| Work fan-out | A token, status update or keystroke redraws unrelated views; fresh prop/context identities defeat memoization. | Per-session subscriptions, cached selectors, stable row props and batched notification. April 20 `cac9b44da020`; July 17 `34e4b68a8e6d`, `0305c3280c60`; September 16 `5a8835656772`, `60e938c3e78f`; September 24 `c0bd122e888d`. |
| Per-event cost grows with accumulated data | Repeated history scans, Map/Set copies, markdown work and scroll layout happen for every token. | Reuse unchanged data, cache archive/bubble boundaries, remove forced layout and render markdown incrementally. August 27 `c5e1e2d39d04`, `4935e8d065eb`, `047da493213f`; September 16 `ac8753b72199`; September 24 `c741f0c35d52`. |
| Too much loaded/drawn at once | Opening a transcript or list builds everything; paging lowers initial memory but scrolling back grows it again. | Page history, reveal list chunks, fold offscreen message bodies. July 31 `f8ca631bd7cd`; August 27 `ffdbf317dc51`; August 28 `80c18013f167`; September 18 `095de4956d3c`, `4b206809de09`, `4337bdc6844a`, `0d81f49a3272`. |
| Main-process blocking and I/O amplification | Lease writes, transcript mirrors, recursive walks and polls occupy the process that serves all windows. | Async I/O, bounded reads, reusable caches, coalesced work and protected hot paths. July 30 `fbc5d29665bd`; September 9 `c73e09205d57`; September 10 `63ad7455d1b6`, `805de98a2a0a`, `0346c40cc597`, `ff92e992511e`; September 16 `6b0250c4382e`, `7032e0011d37`, `d7dbdd32e476`. |
| Background work that never becomes idle | Hidden tabs/terminals, animation loops and unnecessary polling still consume resources. | Pause drawing/subscriptions, coalesce updates, bounded hidden catch-up. May 4 `f5b954627394`; August 9 `a2767a678b0c`; September 23 `16f14409b4d3`; September 24 `82777660ca26`. |
| Layout, animation and GPU cost | Per-frame layout, high-refresh infinite animation, redundant blur and terminal work exceed frame capacity. | Transform-based animation, explicit frame budgets, unchanged-resize suppression, shared blur surfaces. April 20 `d51afed114a0`, `7339e54e184e`; July 30 `af8a06bbb0a9`, `40d711cfde89`; August 9 `9a01fbf58d77`; September 26 `9174d0ead651`. |
| Repeated scans and startup work at real scale | Small fixtures hide the cost of real transcript/conversation collections; each launch repeats expensive answers. | Persistent, invalidation-aware scan caching and real-history-copy measurement. September 25–26 `541b05a178b6` and associated follow-ups. |
| Network and provider latency | Redundant payloads, uncached remote assets, repeated prompt prefill and lost cache continuity make the app feel slow without necessarily dropping UI frames. | Smaller/delta broadcasts, compressed/cached assets, stable prompt prefixes and persisted continuation identity. April 21 `ee91dc7da1db`; July 20 `07a12690845c`; September 9 `44da5d6217c8`, `6684d791d159`; September 10 `c54cf538071b`; September 23 `61c0d040fbc7`, `8e2d26f35862`, `ba478d057c89`. Cache intent is not proof of hit rate or lower latency. |
| Local model work and mobile-specific cost | Starting an engine merely to list models, blocking model polls, model memory estimates and keyboard-triggered relayout have separate resource/latency costs. | Model cache scans, async polling, decode/cache options and transform-based keyboard accommodation. April 23 `0ccd86da94b2`; July 13 `2dfe686dd145`; September 4 `f2e90c1716c3`; September 5 `64dfdca3bbc4`; September 24 `da8e509936f3`. No general inference-speed gain is established by these patch inspections. |
| Measurement errors | Timing a timeout, the wrong process, a blank screen, the wrong workload or the probe's own cost. | Engaged-scenario assertions, attributed stalls, truthful metric labels, realistic fixtures, raw samples, GPU provenance and independent structural guards. See examples below. |

### Concrete historical outcomes, with qualifications

| Change | Recorded result | Qualification |
|---|---|---|
| Paged history, August 28 | Huge resume **21,550 → 614ms**; six-session PSS **7,004 → 1,721MB**. | Three-run reproduction, but the rig's settle definition changed. Small history got slower (**405 → 643ms**), and the overall comparator said REJECT for several reasons. These are not an unqualified all-metric win. |
| Offscreen entry folding, cycle 3 | Scrollback ceiling PSS **4,345.6 → 1,826.5MB**; switch p95 **242.6 → 112.3ms**. | Three repeats in the historical fixture. DOM folding, not transcript-state eviction; it does not prove an hours-long leak is absent. |
| Projects watcher lifecycle | Eight rapid tab clicks' attributed main stall **7,101 → 0ms**; worst single freeze **305 → 6ms**. | Measured again after review repairs. Applies to the exercised Projects sequence. |
| File drawer subscriptions | **40 → 0** drawer re-renders for 40 streamed tokens. | Structural test result. The end-to-end rig was flat because it did not exercise file-pane streaming; no elapsed-time win was proved there. |
| Projects Conversations chunking | Open **174.8 → 58.4ms**; separate stress sweep's Projects list **17,546 → 1,508 DOM nodes**. | Xvfb/software-rendered fixture. The metadata cache did not measurably improve that fixture's tab-open clock. |
| Incremental streamed markdown sequence | Visible renderer busy time **16.0s → about 6.9s** during 3,000 text deltas at 150/s. | Synthetic text-only provider; no real model prefill, tools, attachments, buddy or hardware paint. |
| Persistent real-scale scan cache | Relaunch repair **~9 → 0.9–1.5s**; first Resume **3–4 → 0.8–1.5s**; settled open **1.7 → 0.3s**. | Copy of 1,096 transcripts and 2,615 conversation records. First uncached launch remains about 3s. “Loads indefinitely” was not reproduced. |
| Idle animation budgeting | A controlled pulse changed to `steps(8)` measured **28.75% → 9.33% of one CPU core** at 180Hz. | The earlier claimed layer-promotion win was retracted because the restored test window was not presenting. |

Sources: `docs/archive/plans/2026-08-28-paged-history-cycle-2.md:1087,1152-1190`; `docs/archive/specs/2026-08-28-cycle-3-bounding-the-conversation-window.md:72-81`; `docs/archive/plans/2026-09-09-projects-view-and-file-pane-perf.md:104-121`; `docs/archive/investigations/2026-09-18-list-render-cost-sweep.md`; `perf-reports/2026-09-24-0757-c0ee04d-md-after3.md`; `docs/active/investigations/2026-09-26-startup-resume-real-scale.md`; `docs/archive/investigations/2026-07-30-idle-cpu-burn.md`.

### Have we approached performance consistently?

**Increasingly consistent principles; inconsistent coverage and proof.** The direction is coherent—reduce fan-out, bound work, defer what is not visible, avoid main-thread blocking—but the same principle has had to be applied repeatedly to different consumers and platforms.

Important counterexamples to a simple success narrative:
- Cycle 1's measured target was **1,661 → 1,585ms**, inside the noise band: REJECT. Its workload did not exercise the per-token path being changed. Shipping was explicitly based on regression tests, not an end-to-end measured win (`2026-08-27-perf-cycle-1-handoff.md`).
- Cycle 2 improved total CPU work **358 → 122 CPU-seconds** while CPU percentage rose. Judging a rate without duration penalized faster completion; totals and rates answer different questions.
- Paging removed a broadcast whose side effects four consumers relied on. Passing thousands of tests did not catch all of the breakage. Consumer contracts must survive performance changes (`docs/PITFALLS.md:54-57`).
- Folding improved memory but required a later first-frame repair for blank-on-switch behavior (`4a55aff53bff`). Removing hidden work outright was later tempered with periodic catch-up to avoid moving work into the next click.
- One many-tabs comparison improved frame-gap count **44 → 31** while painted-switch p95 worsened **167.4 → 384.3ms** under different recorded load. It cannot support “everything got faster” (`perf-reports/2026-09-23-2221-a989718-many-tabs-before.md`, `2026-09-23-2356-3b7f7ee-many-tabs-after.md`).
- A Wayland-related Chromium switch had to be reverted because an XWayland probe's apparent fix froze native-Wayland transparent surfaces (`f05a70cffbf8`). A result is platform/configuration-specific until verified otherwise.

The most useful general rule is: **each optimization must bound steady-state work, retained resources, and the cost of reactivation—and be measured on the path it changes.**

## Current risks to measure, not presumed fixes

Ranking here is investigation priority, not measured severity. Paths are relative to the app repository.

| Candidate | Source evidence and trigger | Measurement | Correctness constraint |
|---|---|---|---|
| Find unfolds a long chat | `desktop/src/renderer/components/ChatView.tsx:570-582` explicitly disables folding because Find searches DOM text. Previously folded message bodies can mount together. | Find-open/first-key latency, DOM count, memory, frame trace after reading 1k/7k/12k entries. | Preserve search over loaded-but-folded entries and correct navigation/highlighting. Searching older, unloaded pages would expand current behavior and needs a separate decision; it is not assumed here. A data-backed search is not a free drop-in replacement. |
| Remaining per-delta map copies | `desktop/src/renderer/state/chat-reducer.ts:980-982` allocates the session map before branching; native delta paths also copy assistant-turn maps. | Fixed event count versus session count and turn count; allocation, reducer duration and GC, then an integrated stream/switch journey. | Preserve immutable snapshots, selector semantics, dedup and replay. Do not replace copying with unsafe mutation. |
| Markdown pathological tails | `desktop/src/renderer/components/markdown-blocks.ts:176-182,360-372,555-566`; `MarkdownContent.tsx:553-575,627-663`. Completed pieces are memoized, but footnotes/nested definitions use whole-message fallback and long unsplittable tails keep changing. | Ordinary prose versus long fences, references, tables and footnotes at multiple byte sizes; per-delta work and displayed-frame tails. | Preserve CommonMark cross-block meaning and interactive finished content. |
| Scan concurrency | `desktop/src/main/session-browser.ts:513-520,559-617` creates promises for every directory/file at once within a scan stage. Metadata caching does not bound first-scan concurrency. | Synthetic/copied histories with 100/1,000/4,000 files in one slug: in-flight operations, main-loop delay, result latency and peak memory. | Return complete, correctly ordered results; maintain per-file failure isolation. A concurrency cap may improve responsiveness but slow throughput, so measure both. |
| Folding bookkeeping grows with visited history | `desktop/src/renderer/hooks/use-entry-folding.ts:122-225,266-296` retains entry/height sets and copies bookkeeping; wrapper selection still traverses the document. | Heap/DOM per 1k visited entries, idle-fold task time, return-to-tab latency. | Preserve scroll geometry, first-frame content and reducer history. Retention is not automatically a leak. |
| Live remote backpressure differs from restore | `desktop/src/main/remote-server.ts:4110-4152` serializes once for live clients and enqueues sends; live slow-client close threshold differs from restore pacing. | Slow/disconnected receivers, 1–N clients, output bursts: serialization time, main-loop delay, aggregate queued bytes, recovery. | Preserve permissions, PTY bytes and snapshot/live ordering. `ws.send()` queues writes; it should not be described as synchronous network completion. |
| Android-local broadcast buffering | `app/src/main/kotlin/com/youcoded/app/bridge/LocalBridgeServer.kt:180-189` serializes and sends without an analogous queued-byte check in this method. | Background/throttle a test WebView during output; service/renderer memory, queue depth, GC and catch-up. | Dropping arbitrary ANSI bytes corrupts terminal state. Define replay/recovery before changing bounds. |
| Android PTY can lose bytes before socket buffering | `app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt:44-47,192-195` uses a 64-slot flow and ignores `tryEmit` failure; its comment explicitly describes dropping rather than blocking the terminal thread. | Burst a deterministic byte/ANSI sequence and verify end-to-end byte integrity and final terminal state, alongside dropped-emission counters and latency. | Do not improve apparent throughput by silently dropping output; maintain the nonblocking producer contract and design explicit recovery. Current on-device loss has not been measured. |
| Android terminal's final small batch can wait for more data | `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:5008-5047` checks the 16ms flush condition only when new bytes arrive; the comment acknowledges a silent pending tail. | Last small PTY write to visible glyph, then no further output. | Timed flush must maintain byte order and avoid a permanent idle timer per session. This is latency/correctness, not a proven memory leak. |
| Watcher burst amplification | `desktop/src/main/artifacts/project-watcher.ts:263-325` resolves and delivers individual changed files. Nested-repo exclusion and subscribed-window routing already exist. | 500/5,000-file changes with a subscribed view: resolution calls, notifications, main-loop delay, final UI accuracy. | Keep add/edit/delete identity and external-edit conflict notifications. |
| Legacy whole-file history parser | `desktop/src/main/session-browser.ts:811-871` reads asynchronously but splits/parses the entire file before taking the requested tail; desktop/remote handlers expose it. | First establish a real user-facing caller, then 2/20/200MB files and main-loop delay. | Preserve UUID last-occurrence dedup, corrupt-line handling and `all=true`. Lower priority: audit searches found bridge/handler/tests, not an ordinary renderer invocation; this is not evidence it causes normal chat stutter. |

### Why these are consistency questions

The shared principle is **bounded work at the frequency where it runs**. Applying it only to DOM bodies, disk I/O, or one transport does not bound reducer allocation, JSON parsing, promise concurrency, another socket, or the next interaction. Also, "hidden means idle" is intentionally not literal zero work everywhere: current chat guidance allows once-per-second hidden catch-up to prevent a large switch-time burst. The requirement should specify an idle budget and a catch-up budget, not two contradictory absolutes.

## What the measuring system actually establishes

### Existing strengths

- `scripts/perf-lab/run.mjs` has 11 selectable phases: startup/idle, history, workload, screenshots, replay stalls, artifacts, Projects, terminal switching, native stream, native resume and scrollback.
- `validateReport` refuses missing primary values, undersampled or unengaged scenarios and several no-ping measurements (`run.mjs:340-521`). This validates measurement presence, not product speed.
- `scripts/perf-lab/compare.mjs:344-460` requires target improvement of at least 5% and beyond baseline spread by default. Other primary regressions are rejected above 3% **plus baseline spread**. It also checks error counts and supplied screenshot comparisons.
- Scope is explicit: phases absent in both reports are not judged; new candidate metrics can have no baseline. KEEP is a conditional comparison, not an app-wide certificate (`compare.mjs:401-455,475-485`).
- CI includes busy-app render/listener budgets, main-blocking-call ratchets, animation-shape tests and mark-placement guards. These prevent known mechanisms but do not time the running product.

### Established gaps, including already-filed work

| Gap | Evidence | Proposed treatment |
|---|---|---|
| No recurring numerical product run in inspected CI | `.github/workflows/workspace-ci.yml:128-152`; app desktop/Android CI; `docs/roadmap/dev-workspace.md:341-351`. | Same-machine trend lane with retained sample arrays and explicit budgets; do not call ordinary cloud-runner timing a hardware-GPU baseline. Scheduling a runner is a separate operational decision. |
| Comparator does not reject mismatched run conditions | `compare.mjs:344-460`; already filed at `docs/roadmap/dev-workspace.md:365-372`. | Explicit comparable / inconclusive / regression / improvement outcomes. Compare external interference, not only app CPU: lower app CPU may be the improvement itself. |
| Software rendering is not hardware paint evidence | `scripts/perf-lab/README.md:860-879`; real-GPU attribution reversal in `docs/active/investigations/2026-09-26-startup-resume-real-scale.md:129-153`. | Keep software/CPU and hardware/compositor lanes separate. Record renderer, display, refresh, scale and theme. |
| Frame gaps are not a general presented-frame gate | `compare.mjs:11-172`; historical reports; `resize-bench.mjs`. | Keep rAF gaps as a proxy; add verified compositor/presentation evidence for visual journeys. Do not relabel JavaScript callbacks as displayed frames. |
| Memory snapshots, not sustained lifetime tests | Current perf-lab phase list and README; scrollback measures heap/DOM/PSS after GC. | Repeated open/use/close and long-lived workloads with retained-memory slopes, resource counts and recovery. Forced-GC diagnostic passes are separate from natural-GC smoothness runs. |
| Main-versus-renderer attribution has a blind spot | Renderer-origin 100ms IPC heartbeat, >=50ms long-task attribution (`probe-ipc.mjs`; README:237-284). | Independent main-loop delay/utilization plus timestamped source-to-display phases. IPC round-trip time alone cannot identify the guilty process. |
| Scenarios omit important workloads | README explicitly excludes or limits sync, themes, marketplace, buddy/multiwindow; terminal case measures switches, not output bursts; native-stream is text-only. | Add tool/thinking bursts, output bursts, search, second-window rendering, watcher/sync interference and theme transitions incrementally. |
| Android/remote lack equivalent device performance lanes in inspected suite | `run.mjs:58-78`; platform workflows. | Separate Android release-like device and remote-browser baselines; WebView/thermal/network conditions recorded. |
| Probe can burden the task it measures | `late-content.mjs:60-81,108-115,140-153` scans entry geometry per sampled frame; already filed at roadmap:374-389. Earlier artifact `innerText` polling also invalidated comparisons. | Low-overhead visible-set observation, observer-on/off calibration, and known-defect sensitivity tests before using it as a gate. |
| Real-history scale remains a manual side lane | `real-scale-startup.mjs`; standard fixture has much smaller files; README:630-667. | Incorporate a reproducible large-history tier without requiring private content. Use a private copied history only when separately appropriate. |

### Historical examples — not today's baseline

- September 11 software-rendered workload report: painted switch 126.8ms median / 176.9ms p95, 96 frame gaps over 40ms, worst gap 347ms; selected phases only (`perf-reports/2026-09-11-0423-74e3977-master-74e3977a-rerun.md`).
- September 24 software-rendered candidate: visible native streaming occupied 45.3% of renderer time while recording zero >=50ms long tasks (`perf-reports/2026-09-24-0116-8277766-final-after.md`). Zero long tasks does not establish spare frame capacity.
- September 26 real-display welcome-screen investigation: disabling blur and hiding the mascot produced a different attribution from Xvfb. The recorded accepted change capped mascot body updates at 30/s; GPU chip busy went from 36% to approximately 12–17%. Five-second measurements with the live app also running are diagnostic historical evidence, not a universal app GPU percentage (`2026-09-26-startup-resume-real-scale.md:129-153`).

## Additional stack-specific avenues

These are a search/measurement checklist, not claims that the app has these defects. Some have already been considered partially; absence from the inspected suite does not prove nobody ever investigated them.

1. **Displayed-frame delivery:** compositor deadlines, partial frames, raster/upload cost, high refresh, mixed DPI, resizing and driver/OS differences. At 60/120/180Hz a full refresh interval is 16.67/8.33/5.56ms, and JavaScript does not own that entire interval.
2. **Allocation and lifetime:** V8 GC pauses, retained closures/listeners, detached DOM, editor/terminal disposal, image/canvas/native/GPU allocations, cache bounds, file descriptors, pending promises and socket queues. Stable JS heap alone is insufficient.
3. **Expensive content:** long markdown fences/tables/footnotes, syntax-highlighter worst cases, very large tool results, image decoding/downscaling, PDF/HTML viewers, iframe activity and font/glyph-atlas churn.
4. **Background interference:** sync/indexing/watcher bursts, startup tasks after the first paint, multiple windows and sessions, local inference competing for CPU/RAM/GPU, subprocess output, antivirus/indexer and slow filesystem behavior on supported operating systems.
5. **Transport and recovery:** IPC structured-clone size/frequency, JSON/Base64 copies, queues, a slow receiver, reconnect storms, background/foreground catch-up and final-batch latency.
6. **Android realities:** WebView version, separate host/renderer memory, thermal throttling, sustained rather than first-run performance, device refresh rate, lifecycle/suspend recovery and release/R8 build behavior.
7. **Scheduler realities:** asynchronous I/O followed by large synchronous processing, promise/microtask bursts that delay input, timer alignment and worker-pool contention. A worker pool can help CPU-bound work but adds transfer and coordination overhead; it is not the default cure for I/O.

Primary references:
- Electron performance: https://www.electronjs.org/docs/latest/tutorial/performance
- Electron IPC serialization: https://www.electronjs.org/docs/latest/tutorial/ipc
- Chromium rendering architecture: https://developer.chrome.com/docs/chromium/renderingng-architecture
- Chrome frame/GPU diagnostics: https://developer.chrome.com/docs/devtools/rendering/performance/
- Long Animation Frames: https://developer.chrome.com/docs/web-platform/long-animation-frames (50ms threshold; duration excludes presentation time).
- React Profiler: https://react.dev/reference/react/Profiler (render timing, not display timing; instrumentation has overhead).
- Node event-loop costs: https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
- Node worker threads: https://nodejs.org/api/worker_threads.html
- Android release-like benchmarking: https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview
- Android system tracing: https://developer.android.com/topic/performance/tracing
- WebView memory: https://developer.android.com/develop/ui/views/layout/webapps/manage-webview-memory
- Android thermal behavior: https://developer.android.com/games/optimize/adpf/thermal

## Proposed measurement-first sequence

### Approach choices

**Recommended: repair measurement gaps and fix one evidenced bottleneck at a time.** Small enough to attribute wins, broad enough to prevent merely shifting cost. Reuse perf-lab instead of creating a second framework.

Alternatives:
- **Fix obvious code risks immediately:** quicker first changes, but weak proof of impact and a greater risk of optimizing a cold path.
- **Build a complete multi-platform lab before any fixes:** widest coverage, but delays useful changes and risks another large rig whose validity is unproven.

### First batch: trust the measurements

1. Add comparability/measurement-scope validation, observer-overhead checks and sensitivity checks using deliberately injected test defects in disposable fixtures. No mutations of another session's worktree.
2. Establish a quiet, production-like desktop baseline for stream + input + switch + scroll + Find; add independent main-loop and allocation measurements where attribution needs them.
3. Record both central and tail behavior: raw samples, p50/p95/p99 where sample sizes support them, maximum stalls, exceedance counts, CPU-seconds, memory/resources and task completion. Never publish a p99 from a tiny sample as robust evidence.
4. Run a distinct real-GPU visual lane after approval for visible benchmark windows. Preserve visuals and functionality unless a measured tradeoff is explicitly accepted.

### Second batch: measure the strongest candidates

Start with long-chat Find, remaining per-delta allocation/markdown tails, and history scan concurrency. These exercise separate mechanisms and can be isolated. Order product changes by measured impact, not this static ranking. Android terminal final-batch behavior is a separate, narrowly testable latency/correctness candidate.

### Third batch: prevent recurrence

- Fast CI: operation-count/scaling tests, data bounds, cleanup/backpressure tests and known-mechanism guards. Avoid fragile wall-clock microbenchmarks on arbitrary shared runners.
- Stable runner: recurring numerical journeys and trend history with explicit environment fingerprints and absolute user-facing budgets.
- Longer periodic lane: soak/recovery, multiwindow, slow remote, real GPU/themes and Android devices.
- Each metric must prove it detects a seeded defect and distinguish unsupported/unmeasured from zero/healthy.

### Per-fix acceptance record

Every retained change should state:
1. Symptom, trigger and causal evidence.
2. Exact revisions, fixture, runtime/build, platform, GPU/refresh/scale/theme, run order and machine interference.
3. Before/after raw samples, effect size and variability; interleaved repetitions where practical to control drift.
4. Tail latency/frame evidence and cross-metric tradeoffs, not just a favorable average.
5. Behavior/parity checks and a regression test that fails without the fix.
6. Verdict: improvement, regression or inconclusive. Inconclusive is not a success.

The existing 5%/spread comparator remains useful context, but it does not replace an absolute smoothness budget. Numerical budgets should be proposed after calibration on the target hardware, not invented as guarantees. A no-dropped-frame result applies to a specified observed workload, not every possible machine and future execution.

## Execution boundary

Before implementing the proposed additions, approve the first batch and whether repeated isolated runs may put benchmark windows on the real display. No visual simplification, paid model evaluations, live-app probes, scheduled service installation, commits or pushes are included by default. The Android SDK and JDK 21 were found on this machine during this audit; no device availability, build or device performance result is claimed.
