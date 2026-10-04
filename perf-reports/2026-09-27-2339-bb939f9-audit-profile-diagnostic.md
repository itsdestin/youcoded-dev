# perf-lab 2026-09-27-2339-bb939f9-audit-profile-diagnostic

sha bb939f917e3e64437825b24f3b86b02f14843825 (session/performance-history-audit) — 2026-09-27T23:39:16.895Z
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
| **native-stream.visible: renderer main thread busy while a 3000 delta reply streams on screen at 150 /s** (median of 2; achieved 150 /s, 9780 chars shown) | **9502.6 ms (46.4 % of the window)**, script 4692.6 ms; long tasks 216 ms total / max 216 ms, worst frame gap 218 ms, 59.1 fps; verdict none |
| native-stream.visible commits / layouts over the stream | 1203 commits (0.995 /frame), 1208 layouts (0.998 /frame); turn 20286 ms |
| native-stream.visible IPC stall | 0 ms, max 14 ms, from 203 probe replies |
| **native-stream.switching: click -> messages on screen while it streams** (8 verified of 8 during the stream) | **109.9 ms / 147.3 ms p95**; into huge 123.5 ms, into the streaming one 78.2 ms; main thread busy 7191.9 ms (35.9 %), long tasks 183 ms |
| **native-stream.hidden: the visible window's main thread while the reply streams into a hidden session** | **1751.3 ms busy (8.1 %)**, long tasks 0 ms / max 0 ms, 0 commits in the visible pane, IPC stall 0 ms |

noise: load 3.91, busy 6.7%, worst accepted load 3.91 / busy 8.5%, discarded 2
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot —, workload boots [], stall boot —, artifacts boot —, projects boot —, terminal boots [], native-stream boots [0,0], native-resume boots [], scrollback boot —
A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.

## Native-stream warnings

- native-stream:visible: CPU-PROFILED (/home/destin/youcoded-dev/worktrees/sessions/performance-history-audit/scratch/perf-lab/profiles/audit-diagnostic-visible-1790552449895.cpuprofile) — its busy time includes the sampler, so this run is a diagnostic, not a baseline
- native-stream:visible: CPU-PROFILED (/home/destin/youcoded-dev/worktrees/sessions/performance-history-audit/scratch/perf-lab/profiles/audit-diagnostic-visible-1790552522597.cpuprofile) — its busy time includes the sampler, so this run is a diagnostic, not a baseline

## What was actually measured

Every number above was produced in a specific configuration. Three wrong conclusions
in this project came from a number measured where the defect could not appear, and none
of them failed loudly — they returned clean numbers. Read the configuration with the number.

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

