# perf-lab 2026-09-28-0547-bb939f9-message-find-crosscheck

sha bb939f917e3e64437825b24f3b86b02f14843825 (session/performance-history-audit, dirty 834247109fe7) — 2026-09-28T05:47:26.279Z
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
| history.small (median of 3, 3 stabilized) | last10 3 ms · all 2 ms · resume first 598 ms · stable 598 ms |
| history.medium (median of 3, 3 stabilized) | last10 99 ms · all 101 ms · resume first 601 ms · stable 601 ms |
| history.huge (median of 3, 3 stabilized) | last10 124 ms · all 138 ms · resume first 563 ms · stable 563 ms |
| **native-stream.visible: renderer main thread busy while a 3000 delta reply streams on screen at 150 /s** (median of 3; achieved 150 /s, 9781 chars shown) | **7557.7 ms (37.6 % of the window)**, script 3855.7 ms; long tasks 153 ms total / max 153 ms, worst frame gap 164 ms, 59.5 fps; verdict none |
| native-stream.visible commits / layouts over the stream | 1195 commits (1 /frame), 1199 layouts (1.004 /frame); turn 20069 ms |
| native-stream.visible IPC stall | 0 ms, max 7 ms, from 200 probe replies |
| **native-stream.switching: click -> messages on screen while it streams** (8 verified of 8 during the stream) | **108.6 ms / 178.3 ms p95**; into huge 112.9 ms, into the streaming one 68.2 ms; main thread busy 5981.7 ms (29.8 %), long tasks 184 ms |
| **native-stream.hidden: the visible window's main thread while the reply streams into a hidden session** | **1174.1 ms busy (5.5 %)**, long tasks 51 ms / max 51 ms, 0 commits in the visible pane, IPC stall 0 ms |

noise: load 1.64, busy 3.4%, worst accepted load 2.07 / busy 5.3%, discarded 0
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot 0, workload boots [], stall boot —, artifacts boot —, projects boot —, terminal boots [], native-stream boots [0,0,0], native-resume boots [], scrollback boot —
A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.

## What was actually measured

Every number above was produced in a specific configuration. Three wrong conclusions
in this project came from a number measured where the defect could not appear, and none
of them failed loudly — they returned clean numbers. Read the configuration with the number.

### history

**Question:** How long does loading a conversation take, at three sizes?

**Configuration:**
- one session at a time, resumed from a prebuilt transcript
- three sizes: small, medium, huge

**Where each clock starts and stops:**
- `ipcLast10Ms` — the loadHistory IPC call for the last 10 messages
- `ipcAllMs` — the loadHistory IPC call for the whole transcript
- `resumeStableMs` — resume -> the rendered entry count stops changing

**Blind to:**
- which THREAD the time was spent on — that is the stall scenario
- anything requiring more than one session open

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

