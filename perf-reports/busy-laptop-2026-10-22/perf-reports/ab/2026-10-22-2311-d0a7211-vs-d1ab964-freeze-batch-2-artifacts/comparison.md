# A/B comparison — 2026-10-22-2311-d0a7211-vs-d1ab964-freeze-batch-2-artifacts

- A (/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded-A): executable `09f76150ca15`, app.asar `5042a421117a`, instrument `062faff9bfc4`
- B (/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded): executable `09f76150ca15`, app.asar `c8d8b0863a63`, instrument `062faff9bfc4`

**Comparable: NO — values are shown but not ranked.**
- baseline: aborted or missing completion status
- baseline: incomplete or missing completion status
- baseline: artifacts: expected 3 repeats, got missing
- baseline: artifacts.median.open.mdLarge.openMs: median missing/nonfinite
- baseline: artifacts.median.open.mdLarge.openMs: every expected raw repeat must be finite
- baseline: artifacts.median.typing.codeLarge.keystroke.p95Ms: median missing/nonfinite
- baseline: artifacts.median.typing.codeLarge.keystroke.p95Ms: every expected raw repeat must be finite
- baseline: artifacts.median.htmlNav.swap.medianMs: median missing/nonfinite
- baseline: artifacts.median.htmlNav.swap.medianMs: every expected raw repeat must be finite
- baseline: artifacts.median.ipcSumOfSteps.totalStallMs: median missing/nonfinite
- baseline: artifacts.median.ipcSumOfSteps.totalStallMs: every expected raw repeat must be finite
- baseline: missing, failed or unknown renderer / gpu_compositing identity
- baseline: invalid or excessive pre-boot noise.loadAvgBefore (must be < 4)
- baseline: invalid or excessive pre-boot noise.machineBusyPctBefore (must be < 10)
- baseline: invalid or excessive pre-boot noise.maxLoadAvgAccepted (must be < 4)
- baseline: invalid or excessive pre-boot noise.maxBusyPctAccepted (must be < 10)
- candidate: aborted or missing completion status
- candidate: incomplete or missing completion status
- candidate: artifacts: expected 3 repeats, got missing
- candidate: artifacts.median.open.mdLarge.openMs: median missing/nonfinite
- candidate: artifacts.median.open.mdLarge.openMs: every expected raw repeat must be finite
- candidate: artifacts.median.typing.codeLarge.keystroke.p95Ms: median missing/nonfinite
- candidate: artifacts.median.typing.codeLarge.keystroke.p95Ms: every expected raw repeat must be finite
- candidate: artifacts.median.htmlNav.swap.medianMs: median missing/nonfinite
- candidate: artifacts.median.htmlNav.swap.medianMs: every expected raw repeat must be finite
- candidate: artifacts.median.ipcSumOfSteps.totalStallMs: median missing/nonfinite
- candidate: artifacts.median.ipcSumOfSteps.totalStallMs: every expected raw repeat must be finite
- candidate: missing, failed or unknown renderer / gpu_compositing identity
- candidate: invalid or excessive pre-boot noise.loadAvgBefore (must be < 4)
- candidate: invalid or excessive pre-boot noise.machineBusyPctBefore (must be < 10)
- candidate: invalid or excessive pre-boot noise.maxLoadAvgAccepted (must be < 4)
- candidate: invalid or excessive pre-boot noise.maxBusyPctAccepted (must be < 10)

- Note: Interference is judged from /proc samples every 500 ms: it names other programs using the CPU, disk or memory, but cannot see everything (e.g. another program holding the graphics chip is only attributed where /proc allows).

Counts: 34 missing. Lower is better everywhere. "inconclusive" = the change is within the two sides' combined run-to-run range. No aggregate score is computed.

## Required-lane failures (not averaged away)

- A: artifacts: expected 3 repeats, got missing
- A: artifacts.median.open.mdLarge.openMs: median missing/nonfinite
- A: artifacts.median.open.mdLarge.openMs: every expected raw repeat must be finite
- A: artifacts.median.typing.codeLarge.keystroke.p95Ms: median missing/nonfinite
- A: artifacts.median.typing.codeLarge.keystroke.p95Ms: every expected raw repeat must be finite
- A: artifacts.median.htmlNav.swap.medianMs: median missing/nonfinite
- A: artifacts.median.htmlNav.swap.medianMs: every expected raw repeat must be finite
- A: artifacts.median.ipcSumOfSteps.totalStallMs: median missing/nonfinite
- A: artifacts.median.ipcSumOfSteps.totalStallMs: every expected raw repeat must be finite
- A: machine never became quiet: load 63.86, 53.2% cpu after 1197s (blocked by: qemu-system-x86 ×3 using 6.7 cores, chrome ×43 using 4.4 cores, electron ×9 using 1.5 cores) — measurement not taken
- A: artifacts: no runs were recorded
- A: artifacts: keystroke-to-paint was never measured on the large file — the meter did not arm, so typing cost is UNKNOWN, not zero
- A: compare.mjs PRIMARY path "artifacts.median.open.mdLarge.openMs" is undefined — the keep/reject gate would be BLIND to this metric
- A: compare.mjs PRIMARY path "artifacts.median.typing.codeLarge.keystroke.p95Ms" is undefined — the keep/reject gate would be BLIND to this metric
- A: compare.mjs PRIMARY path "artifacts.median.htmlNav.swap.medianMs" is undefined — the keep/reject gate would be BLIND to this metric
- A: compare.mjs PRIMARY path "artifacts.median.ipcSumOfSteps.totalStallMs" is undefined — the keep/reject gate would be BLIND to this metric
- A: aborted: machine never became quiet: load 63.86, 53.2% cpu after 1197s of waiting (blocked by: qemu-system-x86 ×3 using 6.7 cores, chrome ×43 using 4.4 cores, electron ×9 using 1.5 cores) (bound 20 min, load < 4 and CPU < 10% needed) — measurement NOT taken; nothing was launched for this boot.
- B: artifacts: expected 3 repeats, got missing
- B: artifacts.median.open.mdLarge.openMs: median missing/nonfinite
- B: artifacts.median.open.mdLarge.openMs: every expected raw repeat must be finite
- B: artifacts.median.typing.codeLarge.keystroke.p95Ms: median missing/nonfinite
- B: artifacts.median.typing.codeLarge.keystroke.p95Ms: every expected raw repeat must be finite
- B: artifacts.median.htmlNav.swap.medianMs: median missing/nonfinite
- B: artifacts.median.htmlNav.swap.medianMs: every expected raw repeat must be finite
- B: artifacts.median.ipcSumOfSteps.totalStallMs: median missing/nonfinite
- B: artifacts.median.ipcSumOfSteps.totalStallMs: every expected raw repeat must be finite
- B: machine never became quiet: load 35.26, 69.3% cpu after 1198s (blocked by: qemu-system-x86 ×3 using 11 cores, chrome ×39 using 5.8 cores, youcoded ×4 using 1.5 cores) — measurement not taken
- B: artifacts: no runs were recorded
- B: artifacts: keystroke-to-paint was never measured on the large file — the meter did not arm, so typing cost is UNKNOWN, not zero
- B: compare.mjs PRIMARY path "artifacts.median.open.mdLarge.openMs" is undefined — the keep/reject gate would be BLIND to this metric
- B: compare.mjs PRIMARY path "artifacts.median.typing.codeLarge.keystroke.p95Ms" is undefined — the keep/reject gate would be BLIND to this metric
- B: compare.mjs PRIMARY path "artifacts.median.htmlNav.swap.medianMs" is undefined — the keep/reject gate would be BLIND to this metric
- B: compare.mjs PRIMARY path "artifacts.median.ipcSumOfSteps.totalStallMs" is undefined — the keep/reject gate would be BLIND to this metric
- B: aborted: machine never became quiet: load 35.26, 69.3% cpu after 1198s of waiting (blocked by: qemu-system-x86 ×3 using 11 cores, chrome ×39 using 5.8 cores, youcoded ×4 using 1.5 cores) (bound 20 min, load < 4 and CPU < 10% needed) — measurement NOT taken; nothing was launched for this boot.

## Primary metrics

| Metric | A | B | Δ | Δ% | A spread | B spread | A worst | B worst | Status |
|---|---|---|---|---|---|---|---|---|---|
| startup.median.sessionsListed | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| startup.median.firstContentfulPaint | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| startup.median.blankWindowMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| idle.pssMb.median | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| idle.cpuPct.median | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| history.medium.median.resumeStableMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| history.huge.median.ipcLast10Ms | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| history.huge.median.resumeStableMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| workload.median.switchP95Ms | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| workload.median.switchPaintedBySize.huge.medianMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| workload.median.probe.longtaskTotalMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| workload.median.pssAfterMb | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| workload.median.cpuTotalSeconds | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| scrollback.median.ceilingPssMb | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| scrollback.median.deltaPssMb | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| scrollback.median.perSize.huge.pageMedianMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| replayStall.medium.median.ipcMaxMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| replayStall.medium.median.ipcTotalStallMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| replayStall.huge.median.rendererLongtaskMaxMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| artifacts.median.open.mdLarge.openMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| artifacts.median.typing.codeLarge.keystroke.p95Ms | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| artifacts.median.htmlNav.swap.medianMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| artifacts.median.ipcSumOfSteps.totalStallMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| projects.median.thrash.ipcStallMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| projects.median.open.openMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| projects.median.conversations.ms | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| projects.median.thrash.toConversations.medianMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| terminal.median.switchPaintedMedianMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| terminal.median.longtaskMaxMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| nativeStream.median.visible.taskMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| nativeStream.median.switching.switchPaintedMedianMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| nativeResume.median.ipcSumOfSteps.totalStallMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| nativeResume.median.browse.openMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |
| nativeResume.median.resume.paintedMs | — | — | — | — | — | — | — | — | **missing** — absent on both sides (phase not run) |

## Evidence

- A report: /home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-2311-d0a7211-vs-d1ab964-freeze-batch-2-artifacts/2026-10-22-2311-d0a7211-a.json
- B report: /home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-2311-d0a7211-vs-d1ab964-freeze-batch-2-artifacts/2026-10-22-2331-d1ab964-b.json
