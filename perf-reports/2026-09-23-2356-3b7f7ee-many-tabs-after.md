# perf-lab 2026-09-23-2356-3b7f7ee-many-tabs-after

sha 3b7f7eed20d54f7861eef086db911e13df195d5f (session/perf-many-tabs-20260923) — 2026-09-23T23:56:05.985Z
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
| switch, pane swapped (median of 3) | 43.4 ms / 204.8 ms p95 |
| **switch, messages on screen** | **94 ms / 384.3 ms p95** |
| switch into a 'huge' conversation (n=3, 60 entries of 60 expected) | 101.9 ms / 177.7 ms p95 |
| switch into a 'medium' conversation (n=3, 152 entries of 152 expected) | 176.3 ms / 330.9 ms p95 |
| switch into a 'small' conversation (n=3, 166 entries of 166 expected) | 145.5 ms / 376.1 ms p95 |
| switch into a 'empty' conversation (n=3, 0 entries of 0 expected) | 76.2 ms / 89.3 ms p95 |
| switch into a 'native' conversation (n=6, 1 entries) | 77.2 ms / 92.1 ms p95 |
| streamed into, during the switches | medium, small |
| long tasks | 26 tasks (2857 ms total, max 342 ms) |
| frame gaps > 40ms | 31 gaps (max 380 ms) |
| native first token | 80 ms |
| **layouts per streamed token (native)** | **stream-too-slow** — 34 layouts over 34 commits / 181 frames (0.189 /frame, 1 /commit) — ⚠ NOT a clean reading |
| CPU during workload | 359.7 % |
| PSS after workload | 1624.6 MB |
| **terminal.switch, other terminal on screen** (median of 3; 40 verified switches each; xterm renderer dom) | **540.3 ms / 554.2 ms p95** |
| terminal atlas clears per switch | 1 (40 clears total, 0 outside every switch's one-second slot) |
| terminal long tasks across the switches | max 0 ms, total 0 ms, worst frame gap 79 ms |
| terminal IPC stall (sum over the one-second switch slots) | 0 ms, max 8 ms, from 760 probe replies; 0 slots closed on a pending ping, 0 slots lost their reading |
| **native-stream.visible: renderer main thread busy while a 3000 delta reply streams on screen at 150 /s** (median of 3; achieved 150 /s, 9780 chars shown) | **8726 ms (43.5 % of the window)**, script 6329.1 ms; long tasks 0 ms total / max 0 ms, worst frame gap 40 ms, 59.9 fps; verdict none |
| native-stream.visible commits / layouts over the stream | 1203 commits (1 /frame), 1206 layouts (1.002 /frame); turn 20066 ms |
| native-stream.visible IPC stall | 0 ms, max 4 ms, from 200 probe replies |
| **native-stream.switching: click -> messages on screen while it streams** (8 verified of 8 during the stream) | **74.3 ms / 111.7 ms p95**; into huge 80.1 ms, into the streaming one 51.6 ms; main thread busy 7182.5 ms (35.8 %), long tasks 0 ms |
| **native-stream.hidden: the visible window's main thread while the reply streams into a hidden session** | **1031 ms busy (4.8 %)**, long tasks 0 ms / max 0 ms, 0 commits in the visible pane, IPC stall 0 ms |

noise: load 3.64, busy 2.4%, worst accepted load 3.81 / busy 4.5%, discarded 50
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot —, workload boots [0,0,0], stall boot —, artifacts boot —, projects boot —, terminal boots [0,0,0], native-stream boots [0,0,0], native-resume boots [], scrollback boot —
A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.

## Terminal warnings

- terminal: the visible terminal rendered through 'dom', not WebGL — clearTextureAtlas() is only a full repaint on this path, so every atlas cost below is the DOM-repaint cost, not a GPU re-rasterise

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

### terminal

**Question:** What does a session switch cost in terminal view, and how many shared glyph-atlas clears does each one trigger?

**Configuration:**
- the workload's six sessions (4 Claude Code — huge / medium / small resumed plus an empty control — and 2 native), opened with the same openJourneySessions
- the four Claude Code sessions each switched to terminal view (Ctrl+`) and filled with 2,000 lines of mixed glyphs (printable ASCII + TUI box-drawing, seven colours, bold every fifth line) printed by fake-claude on the typed line `perf-lab-glyphs 2000`
- 40 switches between those four in terminal view, one per one-second slot; the two native sessions stay open in chat view and are never switched to (no PTY, and a switch through one flips every terminal's inset)
- every repeat is its OWN boot with a freshly built fixture, like the workload
- stock theme, no wallpaper

**Where each clock starts and stops:**
- `switchPaintedMedianMs` — click the session pill -> that session's terminal is the visible one AND two animation frames have painted (the atlas clear's full refresh lands in the first of them)
- `atlasClearsPerSwitch` — window.__terminalRegistry.atlasClears after the switch window settled (counter still for 1 s) minus before the first switch, over verified switches; ~1 means one hide->show heal per switch
- `longtaskMaxMs` — the renderer long-task probe over the marked switch window only (setup and fill excluded)
- `ipc.totalStallMs` — the IPC ping probe (every 50 ms) installed at the START of each switch's one-second slot and read just before the NEXT switch (the last slot is held open for its full second), so the time between switches is covered; a ping still in flight at a slot's close counts its wait so far beyond the ping interval; summed over the 40 slots, with slots whose reading failed counted in ipc.readErrors

**Blind to:**
- GPU cost: the rig runs on llvmpipe under Xvfb (report.machine.renderer), so WebGL may not initialise and clearTextureAtlas() then only forces a full DOM repaint — the GPU texture re-upload cost on real hardware is NOT measured here; `renderer` on each run says which path it got
- wallpaper themes: the stock theme has no wallpaper, so the terminal's see-through container and backing layer are not in play
- switching through native sessions in terminal view, and toggling chat <-> terminal (both resize every terminal and fire the resize heal)
- the transient GPU texture corruption (sleep/resume, VRAM reclaim) the heal still defends against — whether glyphs stay correct needs a human on real hardware
- the few milliseconds between one slot's probe read and the next slot's install (CDP round trips), and the first ping interval of each slot (probe-ipc sends its first ping one interval after install)

### native-stream

**Question:** What does a native reply streaming at cloud-model speed cost the window it is shown in, the switches made during it, and a window it is hidden from?

**Configuration:**
- the workload's six sessions (4 Claude Code — huge / medium / small resumed plus an empty control — and 2 native), opened with the same openJourneySessions; the two native sessions are bound to the perf-lab fake endpoint instead of the local engine
- each leg is one reply of 3000 deltas at 150/s from fake-provider.mjs — realistic markdown (prose, fenced code, diffs, log dumps) split into token-sized pieces, byte-identical between runs
- switching leg: 8 switches, one every 2000 ms starting 1500 ms into the stream, alternating huge <-> the streaming session
- hidden leg: the huge conversation on screen while the native session streams
- every repeat is its OWN boot with a freshly built fixture, like the workload
- stock theme, no wallpaper

**Where each clock starts and stops:**
- `visible.taskMs` — the renderer main thread's BUSY time over the stream window (CDP Performance TaskDuration delta) — every task counted, however short; taskPct is its share of the window. Long tasks alone read 0 here: per-frame work under 50 ms never registers with the long-task observer
- `visible.longtaskTotalMs` — renderer long tasks (>= 50 ms) summed over the marked stream window: native.send -> the app's Stop button gone
- `visible.turnMs` — native.send -> the Stop button gone (the turn ended in the app's own terms); turnEndSignal says whether that button was seen or the fake server's completion + a settle was used instead
- `visible.commits` — MutationObserver commits inside the visible .chat-scroll over the stream (the transcript batcher coalesces deltas to one commit per frame, so commits ~ frames is healthy and commits >> frames means it is not engaging)
- `switching.switchPaintedMedianMs` — click the session pill -> the target conversation's messages on screen (the workload's painted clock), for switches made while deltas were still arriving
- `hidden.longtaskTotalMs` — the same long-task sum while the streaming session is NOT the visible one
- `ipc.totalStallMs` — the IPC ping probe (every 100 ms) over each leg; the main process forwards every delta over IPC, so this is what streaming costs every other window

**Blind to:**
- the real engine: the fake answers at once, so firstResponseMs is the app's own send path, not prefill or model load
- tool calls, thinking blocks and attachments (text deltas only)
- the buddy window (no scenario opens one)
- GPU paint cost: llvmpipe under Xvfb (report.machine.renderer)
- the local model's own delta rate — this phase is about the renderer, and deliberately not hostage to it

