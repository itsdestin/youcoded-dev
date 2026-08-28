# perf-lab 2026-08-28-0314-e7bea8c-probe-artifacts2

sha e7bea8c0dee0d4fd0282ff0ddc5b19e3c7cb6737 (perf/paged-history) — 2026-08-28T03:14:12.996Z
machine: AMD Ryzen 7 5700X3D 8-Core Processor · 31 GB · kernel 7.1.2-2-cachyos · node v26.4.0

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
| artifacts.open code small / large (median of 1) | 106 ms / 60 ms |
| artifacts.open markdown small / large | 525 ms / 1213 ms |
| artifacts.html swap median / p95 | 82 ms / 86 ms |
| artifacts.keystroke small median / p95 | 29.4 ms / 32.7 ms |
| artifacts.keystroke large median / p95 | 31.9 ms / 33.2 ms |
| artifacts.copy click -> "Copied!" | 28 ms |
| artifacts long tasks | 2176 ms total, max 586 ms |
| artifacts IPC stall (sum over steps) | 0 ms, max 27 ms, from 100 probe replies |

noise: load 3.7, busy 1.1%, worst accepted load 3.7 / busy 1.1%, discarded 0
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot —, workload boots [], stall boot —, artifacts boot 0
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

- compare.mjs PRIMARY path "artifacts.median.open.mdLarge.openMs" has only 1 sample behind its median (1213) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
- compare.mjs PRIMARY path "artifacts.median.typing.codeLarge.keystroke.p95Ms" has only 1 sample behind its median (33.2) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
- compare.mjs PRIMARY path "artifacts.median.htmlNav.swap.medianMs" has only 1 sample behind its median (82) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
- compare.mjs PRIMARY path "artifacts.median.ipcSumOfSteps.totalStallMs" has only 1 sample behind its median (0) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
