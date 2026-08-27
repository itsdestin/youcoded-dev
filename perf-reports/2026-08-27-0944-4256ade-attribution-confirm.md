# perf-lab 2026-08-27-0944-4256ade-attribution-confirm

sha 4256ade0fb446686e9cd33843ea0bbf3d634bd3c (perf/optimization-pass) — 2026-08-27T09:44:00.340Z
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
| stall.small (median of 3, 3 stabilized) | worst freeze 45 ms · total 0 ms · main 0 ms / renderer 0 ms — none |
| stall.medium (median of 3, 3 stabilized) | worst freeze 7479 ms · total 10908 ms · main 99 ms / renderer 10889 ms — renderer |
| stall.huge (median of 3, 3 stabilized) | worst freeze 11280 ms · total 12591 ms · main 162 ms / renderer 12429 ms — renderer |

noise: load 0.42, busy 1.8%, worst accepted load 0.42 / busy 1.8%, discarded 0
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot —, stall boot 0, artifacts boot —
A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.
