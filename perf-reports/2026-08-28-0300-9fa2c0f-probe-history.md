# perf-lab 2026-08-28-0300-9fa2c0f-probe-history

sha 9fa2c0fa7b691aeac1ea8af37aa64f9c54b10fa6 (perf/paged-history) — 2026-08-28T03:00:17.971Z
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
| history.small (median of 1, 1 stabilized) | last10 2 ms · all 2 ms · resume first 449 ms · stable 449 ms |
| history.medium (median of 1, 1 stabilized) | last10 112 ms · all 136 ms · resume first 685 ms · stable 685 ms |
| history.huge (median of 1, 1 stabilized) | last10 180 ms · all 192 ms · resume first 624 ms · stable 624 ms |

noise: load 3.28, busy 1.8%, worst accepted load 3.28 / busy 1.8%, discarded 0
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot 0, workload boots [], stall boot —, artifacts boot —
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


## Incomplete — do NOT rank anything from this report

- compare.mjs PRIMARY path "history.medium.median.resumeStableMs" has only 1 sample behind its median (685) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
- compare.mjs PRIMARY path "history.huge.median.ipcLast10Ms" has only 1 sample behind its median (180) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
- compare.mjs PRIMARY path "history.huge.median.resumeStableMs" has only 1 sample behind its median (624) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
