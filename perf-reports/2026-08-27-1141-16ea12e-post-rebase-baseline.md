# perf-lab 2026-08-27-1141-16ea12e-post-rebase-baseline

sha 16ea12eb8b315f876860cee89348cac1599b2dac (perf/optimization-pass) — 2026-08-27T11:41:40.986Z
machine: AMD Ryzen 7 5700X3D 8-Core Processor · 31 GB · kernel 7.1.2-2-cachyos · node v26.4.0

| metric | median |
|---|---|
| startup.whenReady | 664 ms |
| startup.createWindowAt | 693 ms |
| startup.blankWindowMs | 308 ms |
| startup.didFinishLoad | 913 ms |
| startup.firstContentfulPaint | 998 ms |
| startup.appMounted | 939 ms |
| startup.sessionsListed | 940 ms |
| startup.postWindowDone (network) | 732 ms |
| chore.rotateLog | 4 ms |
| chore.prelude | 11 ms |
| chore.installHooks | 4 ms |
| chore.hookRelay | 2 ms |
| chore.legacyCleanup | 0 ms |
| chore.hookReconcile | 1 ms |
| chore.promptSuggestion | 1 ms |
| chore.retentionDefault | 0 ms |
| chore.symlinkCleanup | 0 ms |
| chore.staleDownloads | 0 ms |
| chore.reconcileMcp | 1 ms |
| chore.announcements (network) | 1 ms |
| chore.remoteServer | 1 ms |
| chore.ipcPrefs | 0 ms |
| chore.themeProtocol | 2 ms |
| chore.accounts | 1 ms |
| idle PSS | 463 MB |
| idle CPU | 0 % |
| history.small (median of 5, 5 stabilized) | last10 2 ms · all 2 ms · resume first 181 ms · stable 400 ms |
| history.medium (median of 5, 5 stabilized) | last10 127 ms · all 137 ms · resume first 129 ms · stable 14823 ms |
| history.huge (median of 5, 5 stabilized) | last10 191 ms · all 208 ms · resume first 148 ms · stable 21994 ms |
| switch, pane swapped (median of 3) | 751.6 ms / 10126.9 ms p95 |
| **switch, messages on screen** | **1615.2 ms / 21152.6 ms p95** |
| switch into a 'huge' conversation (n=3, 7000 entries) | 11128.3 ms / 12918.5 ms p95 |
| switch into a 'medium' conversation (n=3, 319 entries) | 1431.5 ms / 1971.6 ms p95 |
| switch into a 'small' conversation (n=3, 100 entries) | 1615.2 ms / 1747.3 ms p95 |
| switch into a 'empty' conversation (n=3, 1016 entries) | 21092.2 ms / 21152.6 ms p95 — ⚠ 3 hit the 20s CAP, so this is a FLOOR |
| switch into a 'unknown' conversation (n=6, 2 entries) | 1480.8 ms / 1719.1 ms p95 |
| ⚠ switches that never settled | 3 — those timings are a 20s FLOOR, not a measurement |
| long tasks | 431 tasks (206321 ms total, max 11310 ms) |
| frame gaps > 40ms | 394 gaps (max 11623 ms) |
| native first token | 6277 ms |
| CPU during workload | 168.8 % |
| PSS after workload | 6974.9 MB |
| stall.small (median of 3, 3 stabilized) | worst freeze 85 ms · total 0 ms · main 0 ms / renderer 0 ms — none |
| stall.medium (median of 3, 3 stabilized) | worst freeze 11035 ms · total 14531 ms · main 116 ms / renderer 14415 ms — renderer |
| stall.huge (median of 3, 3 stabilized) | worst freeze 14200 ms · total 16797 ms · main 268 ms / renderer 16455 ms — renderer |
| artifacts.open code small / large (median of 3) | 46 ms / 63 ms |
| artifacts.open markdown small / large | 418 ms / 1125 ms |
| artifacts.html swap median / p95 | 82 ms / 85 ms |
| artifacts.keystroke small median / p95 | 29.7 ms / 32.9 ms |
| artifacts.keystroke large median / p95 | 30.2 ms / 33 ms |
| artifacts.copy click -> "Copied!" | 27.8 ms |
| artifacts long tasks | 1893 ms total, max 577 ms |
| artifacts IPC stall (sum over steps) | 16 ms, max 66 ms, from 99 probe replies |

noise: load 1.14, busy 2.6%, worst accepted load 1.5 / busy 2.6%, discarded 0
errors (desktop.log "level":"ERROR" lines): cold starts [0,0,0,0,0], scenario boot 0, stall boot 0, artifacts boot 0
A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.

## History warnings

- small: small#0: in-page sampler stalled up to 500ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- small: small#1: in-page sampler stalled up to 338ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- medium: medium#0: in-page sampler stalled up to 9676ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- medium: medium#1: in-page sampler stalled up to 12766ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- medium: medium#2: in-page sampler stalled up to 6352ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- medium: medium#3: in-page sampler stalled up to 7172ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- medium: medium#4: in-page sampler stalled up to 12424ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- huge: huge#0: in-page sampler stalled up to 14670ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- huge: huge#1: in-page sampler stalled up to 15515ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- huge: huge#2: in-page sampler stalled up to 19432ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- huge: huge#3: in-page sampler stalled up to 13126ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap
- huge: huge#4: in-page sampler stalled up to 9758ms between samples (asked for 16ms) — resumeStableMs is only accurate to that gap

## Stall warnings

- small: small#0: the stall probe was itself blocked for up to 488ms (it pings every 100ms), so it could not sample during that time. ipcTotalStallMs is a FLOOR, not a total, and the attribution is drawn from a pool that systematically misses renderer blocking — it OVERSTATES the main process.
- medium: medium#0: the stall probe was itself blocked for up to 12560ms (it pings every 100ms), so it could not sample during that time. ipcTotalStallMs is a FLOOR, not a total, and the attribution is drawn from a pool that systematically misses renderer blocking — it OVERSTATES the main process.
- medium: medium#1: the stall probe was itself blocked for up to 11035ms (it pings every 100ms), so it could not sample during that time. ipcTotalStallMs is a FLOOR, not a total, and the attribution is drawn from a pool that systematically misses renderer blocking — it OVERSTATES the main process.
- medium: medium#2: the stall probe was itself blocked for up to 5621ms (it pings every 100ms), so it could not sample during that time. ipcTotalStallMs is a FLOOR, not a total, and the attribution is drawn from a pool that systematically misses renderer blocking — it OVERSTATES the main process.
- huge: huge#0: the stall probe was itself blocked for up to 19515ms (it pings every 100ms), so it could not sample during that time. ipcTotalStallMs is a FLOOR, not a total, and the attribution is drawn from a pool that systematically misses renderer blocking — it OVERSTATES the main process.
- huge: huge#1: the stall probe was itself blocked for up to 18539ms (it pings every 100ms), so it could not sample during that time. ipcTotalStallMs is a FLOOR, not a total, and the attribution is drawn from a pool that systematically misses renderer blocking — it OVERSTATES the main process.
- huge: huge#2: the stall probe was itself blocked for up to 22561ms (it pings every 100ms), so it could not sample during that time. ipcTotalStallMs is a FLOOR, not a total, and the attribution is drawn from a pool that systematically misses renderer blocking — it OVERSTATES the main process.

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

### workload

**Question:** Is the app responsive while several sessions are open, one is streaming, and the user switches between them?

**Configuration:**
- 6 sessions open at once (4 Claude Code + 2 native)
- 3 of the 4 CC sessions are RESUMED from real transcripts (huge, medium, small); the 4th is deliberately left EMPTY as a control
- a transcript streams into 3 sessions throughout the window
- 40 switches spread evenly across the same window the CPU sample covers

**Where each clock starts and stops:**
- `switchMedianMs` — click -> the visible pane CONTAINER swapped (2 animation frames). Does NOT wait for messages.
- `switchPaintedMedianMs` — click -> the messages are on screen (entry count stable for 3 frames). This is the number a user would recognise.
- `cpuDuringPct` — whole-process CPU across the workload window, from /proc

**Blind to:**
- conversation sizes beyond the fixture huge transcript
- switching under memory pressure from many MORE than 6 sessions
- anything requiring a real GPU — the rig runs headless under Xvfb

### stall

**Question:** When a conversation is opened, how long is the app unresponsive, and WHICH THREAD was blocked?

**Configuration:**
- one session at a time, resumed from a prebuilt transcript
- three sizes: small (~100 entries), medium (~5,000), huge (~7,000)
- nothing else running — a clean boot, so no other session contributes

**Where each clock starts and stops:**
- `ipcTotalStallMs` — sum of IPC round trips beyond the ping interval — RAW unresponsiveness, says nothing about which thread
- `mainProcessStallMs` — the part of that with NO renderer long task under it
- `rendererStallMs` — the part overlapped by a renderer long task

**Blind to:**
- MOST renderer blocks entirely. The IPC probe is a setInterval running INSIDE the renderer, so a blocked renderer stops it from firing at all. Only a block that begins while a ping is already outstanding produces a sample — and with a trivial handler the probe is in flight roughly 1% of the time. ipcTotalStallMs is therefore a FLOOR on unresponsiveness, not a total.
- main-process blocking that happens WHILE the renderer is also blocked — overlap is charged to the renderer
- renderer blocking under 50ms (PerformanceObserver does not report it), which is charged to the main process instead
- any cost that needs more than one session open to appear

### artifacts

**Question:** What does the files panel cost to open, edit, and navigate?

**Configuration:**
- one session, resumed from the small transcript
- six artifacts registered: code / markdown / HTML, each in a small and a large size
- 30 keystrokes typed into a real CodeMirror editor at ~45ms spacing

**Where each clock starts and stops:**
- `open.*.openMs` — click the row -> the viewer reports the right document mounted
- `typing.*.keystroke` — keydown -> painted, measured in-page via beforeinput
- `htmlNav.swap` — select a different HTML artifact -> the iframe load event

**Blind to:**
- documents above EDIT_MAX_BYTES (3 MB) — the pane serves a read-only prefix, so typing is not measured there
- real clipboard cost: MarkdownContent fires writeText without awaiting it
- GPU-accelerated scrolling in the viewer — headless Xvfb has no compositor

