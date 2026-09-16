# perf-lab 2026-09-11-0450-4fce5b8-async-io-rerun

sha 4fce5b8f45d1089a5e5d5b8aa7ac81d5d89f480f (perf/main-thread-async-io) — 2026-09-11T04:50:57.017Z
machine: AMD RYZEN AI MAX+ 395 w/ Radeon 8060S · 121 GB · kernel 7.1.3-2-cachyos · node v26.4.0
  renderer: ANGLE (Mesa, llvmpipe (LLVM 22.1.6 256 bits), OpenGL 4.6 (Core Profile) Mesa 26.2.0-devel (git-a982deee39)) — SOFTWARE, gpu_compositing=disabled_software (via SystemInfo)

| metric | median |
|---|---|
| startup.whenReady | — |
| startup.createWindowAt | — |
| startup.blankWindowMs | — |
| startup.didFinishLoad | — |
| startup.firstContentfulPaint | — |
| startup.appMounted | — |
| startup.sessionsListed | — |
| startup.postWindowDone (network) | — |
| idle PSS | — |
| idle CPU | — |
| switch, pane swapped (median of 3) | 55.1 ms / 110.7 ms p95 |
| **switch, messages on screen** | **82 ms / 131.2 ms p95** |
| switch into a 'huge' conversation (n=3, 60 entries of 60 expected) | 114.9 ms / 115.6 ms p95 |
| switch into a 'medium' conversation (n=3, 152 entries of 152 expected) | 85.8 ms / 90 ms p95 |
| switch into a 'small' conversation (n=3, 166 entries of 166 expected) | 66.7 ms / 98.5 ms p95 |
| switch into a 'empty' conversation (n=3, 0 entries of 0 expected) | 81.7 ms / 115 ms p95 |
| switch into a 'native' conversation (n=6, 1 entries) | 82.5 ms / 131.2 ms p95 |
| streamed into, during the switches | medium, small |
| long tasks | 23 tasks (2007 ms total, max 200 ms) |
| frame gaps > 40ms | 38 gaps (max 209 ms) |
| native first token | 1143 ms |
| **layouts per streamed token (native)** | **stream-too-slow** — 37 layouts over 39 commits / 181 frames (0.204 /frame, 0.949 /commit) — ⚠ NOT a clean reading |
| CPU during workload | 394 % |
| PSS after workload | 1674.2 MB |

noise: load 3, busy 4.3%, worst accepted load 3.91 / busy 4.3%, discarded 7
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot —, workload boots [0,0,0], stall boot —, artifacts boot —, projects boot —, terminal boots [], scrollback boot —
A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.

## What was actually measured

Every number above was produced in a specific configuration. Three wrong conclusions
in this project came from a number measured where the defect could not appear, and none
of them failed loudly — they returned clean numbers. Read the configuration with the number.

### workload

**Question:** Is the app responsive while several sessions are open, one is streaming, and the user switches between them?

**Configuration:**
- 6 sessions open at once (4 Claude Code + 2 native)
- 3 of the 4 CC sessions are RESUMED from real transcripts (huge, medium, small), each in its transcript's own project folder; the 4th is deliberately left EMPTY as a control
- a transcript streams into the medium and small sessions throughout the window — never into huge (the one clean loaded switch) and never into the empty control; the run records streamedInto and streamedTurnsBySize
- 40 switches spread evenly across the same window the CPU sample covers
- every repeat is its OWN boot with a freshly built fixture — nothing (transcript bytes, the app's own transcript mirror, caches, leftover sessions, memory) carries from one repeat to the next; the streamed-into transcripts are also cut back to their built bytes after each repeat and their size is checked before it

**Where each clock starts and stops:**
- `switchMedianMs` — click -> the visible pane CONTAINER swapped (2 animation frames). Does NOT wait for messages.
- `switchPaintedMedianMs` — click -> the messages are on screen: entry count stable for 3 frames AND at least what the conversation holds (2 per turn, plus what streamed in so far). A stable count below that is a render pause or the wrong conversation, not a settle. For the two STREAMING sessions the count never holds still, so their clock stops at the first frame showing everything that had arrived by the click. This is the number a user would recognise.
- `switchPaintedBySize.huge.medianMs` — the same clock, for switches INTO the huge conversation only — the PRIMARY switch metric, because it is the case Destin lives in and the only bucket no stream touches
- `cpuDuringPct` — whole-process CPU across the workload window, from /proc — a RATE. Context only; never compare it across runs of different duration.
- `cpuTotalSeconds` — CPU-seconds of whole-process work across the workload window (rate x window). Duration-independent, so this is the one the keep/reject gate compares.

**Blind to:**
- conversation sizes beyond the fixture huge transcript
- switching under memory pressure from many MORE than 6 sessions
- anything requiring a real GPU. MEASURED, not assumed, since 2026-09-03: report.machine.renderer records what Chromium actually used, and under Xvfb it is llvmpipe with gpu_compositing disabled. Check that field before comparing two reports — if it ever says otherwise, this line is wrong
- per-TOKEN streaming TIME. The Claude Code streamer appends WHOLE turns (~7 renders/s per target), never the native harness's hundreds of same-turn deltas per second, so a per-delta fix is under-represented in every DURATION here. Since 2026-09-03 the per-delta WORK is measured instead — nativeLayoutCost counts layouts per commit over a native-streaming window (see layout-cost.mjs) — which is what re-gates cycle 1. What is still blind: the buddy window (no scenario opens one) and layout ATTRIBUTION (the counter is renderer-wide and cannot name the effect that forced it)
- whether a switch into a STREAMING session feels slow because of the stream or because of the size — medium and small carry both; only huge and empty are clean
- ENTRIES_PER_TURN is a measured constant, not read from the app — if the app changes what a timeline entry is, every resumed switch stops settling and the report says so, but the rig cannot fix itself

