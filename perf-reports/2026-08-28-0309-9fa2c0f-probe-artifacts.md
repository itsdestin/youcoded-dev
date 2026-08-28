# perf-lab 2026-08-28-0309-9fa2c0f-probe-artifacts

sha 9fa2c0fa7b691aeac1ea8af37aa64f9c54b10fa6 (perf/paged-history) — 2026-08-28T03:09:24.263Z
machine: AMD Ryzen 7 5700X3D 8-Core Processor · 31 GB · kernel 7.1.2-2-cachyos · node v26.4.0

> **ABORTED:** artifacts: the session-files drawer never opened — artifacts: the drawer opened but never listed perf-small.ts within 30s. It listed []. The files were registered against projectRoot "/home/destin/youcoded-dev/scratch/perf-lab/home/projects/alpha"; if the drawer resolved a different project root, every open below would have measured a miss instead of a file.
> The rows below are whatever had been measured when the run stopped.

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

noise: load 1.41, busy 2.5%, worst accepted load 1.41 / busy 2.5%, discarded 0
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot —, workload boots [], stall boot —, artifacts boot —
A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.

## What was actually measured

Every number above was produced in a specific configuration. Three wrong conclusions
in this project came from a number measured where the defect could not appear, and none
of them failed loudly — they returned clean numbers. Read the configuration with the number.

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


## Incomplete — do NOT rank anything from this report

- artifacts: no runs were recorded
- artifacts: keystroke-to-paint was never measured on the large file — the meter did not arm, so typing cost is UNKNOWN, not zero
- compare.mjs PRIMARY path "artifacts.median.open.mdLarge.openMs" is undefined — the keep/reject gate would be BLIND to this metric
- compare.mjs PRIMARY path "artifacts.median.typing.codeLarge.keystroke.p95Ms" is undefined — the keep/reject gate would be BLIND to this metric
- compare.mjs PRIMARY path "artifacts.median.htmlNav.swap.medianMs" is undefined — the keep/reject gate would be BLIND to this metric
- compare.mjs PRIMARY path "artifacts.median.ipcSumOfSteps.totalStallMs" is undefined — the keep/reject gate would be BLIND to this metric
