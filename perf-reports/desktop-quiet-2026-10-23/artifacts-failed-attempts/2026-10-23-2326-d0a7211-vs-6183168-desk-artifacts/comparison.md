# A/B comparison — 2026-10-23-2326-d0a7211-vs-6183168-desk-artifacts

- A (/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded-A): executable `09f76150ca15`, app.asar `5042a421117a`, instrument `821b0e3cd9e5`
- B (/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded): executable `09f76150ca15`, app.asar `63c3e45d159f`, instrument `b68665fee1a7`

**Comparable: NO — values are shown but not ranked.**
- baseline: incomplete or missing completion status
- candidate: aborted or missing completion status
- candidate: incomplete or missing completion status
- candidate: artifacts: expected 3 repeats, got 1
- candidate: artifacts.median.open.mdLarge.openMs: every expected raw repeat must be finite
- candidate: artifacts.median.typing.codeLarge.keystroke.p95Ms: every expected raw repeat must be finite
- candidate: artifacts.median.htmlNav.swap.medianMs: every expected raw repeat must be finite
- candidate: artifacts.median.ipcSumOfSteps.totalStallMs: every expected raw repeat must be finite
- instrument source differs (bigfence-stream-run.mjs); remeasure both sides with the same lab revision
- baseline documents repeat 2: adapter/cleanup/provenance failure
- baseline documents repeat 2: xlsx-merge-32x32 unreviewed (expected exactly one measured case)
- baseline documents repeat 2: xlsx-sheets-1 unreviewed (expected exactly one measured case)
- baseline documents repeat 2: csv-rows-64kib unreviewed (expected exactly one measured case)
- baseline documents repeat 2: csv-wide-64kib unreviewed (expected exactly one measured case)
- baseline documents repeat 2: csv-quoted-64kib unreviewed (expected exactly one measured case)
- baseline documents repeat 2: docx-paragraphs-100 unreviewed (expected exactly one measured case)
- baseline documents repeat 2: docx-table-25x10 unreviewed (expected exactly one measured case)
- baseline documents repeat 2: html-assets-1x256 unreviewed (expected exactly one measured case)
- baseline documents repeat 2: html-script-250ms unreviewed (expected exactly one measured case)
- baseline documents repeat 3: adapter/cleanup/provenance failure
- baseline documents repeat 3: xlsx-merge-32x32 unreviewed (expected exactly one measured case)
- baseline documents repeat 3: xlsx-sheets-1 unreviewed (expected exactly one measured case)
- baseline documents repeat 3: csv-rows-64kib unreviewed (expected exactly one measured case)
- baseline documents repeat 3: csv-wide-64kib unreviewed (expected exactly one measured case)
- baseline documents repeat 3: csv-quoted-64kib unreviewed (expected exactly one measured case)
- baseline documents repeat 3: docx-paragraphs-100 unreviewed (expected exactly one measured case)
- baseline documents repeat 3: docx-table-25x10 unreviewed (expected exactly one measured case)
- baseline documents repeat 3: html-assets-1x256 unreviewed (expected exactly one measured case)
- baseline documents repeat 3: html-script-250ms unreviewed (expected exactly one measured case)
- candidate documents: incomplete repeat count
- candidate documents repeat 1: adapter/cleanup/provenance failure
- candidate documents repeat 1: docx-paragraphs-100 memory-limit (expected exactly one measured case)
- candidate documents repeat 1: docx-table-25x10 unreviewed (expected exactly one measured case)
- candidate documents repeat 1: html-assets-1x256 unreviewed (expected exactly one measured case)
- candidate documents repeat 1: html-script-250ms unreviewed (expected exactly one measured case)

- Note: Interference is judged from /proc samples every 500 ms: it names other programs using the CPU, disk or memory, but cannot see everything (e.g. another program holding the graphics chip is only attributed where /proc allows).

Counts: 49 missing, 30 incomparable. Lower is better everywhere. "inconclusive" = the change is within the two sides' combined run-to-run range. No aggregate score is computed.

## Required-lane failures (not averaged away)

- A: documents repeat 2: adapter/cleanup/provenance failure
- A: documents repeat 2: xlsx-merge-32x32 unreviewed (expected exactly one measured case)
- A: documents repeat 2: xlsx-sheets-1 unreviewed (expected exactly one measured case)
- A: documents repeat 2: csv-rows-64kib unreviewed (expected exactly one measured case)
- A: documents repeat 2: csv-wide-64kib unreviewed (expected exactly one measured case)
- A: documents repeat 2: csv-quoted-64kib unreviewed (expected exactly one measured case)
- A: documents repeat 2: docx-paragraphs-100 unreviewed (expected exactly one measured case)
- A: documents repeat 2: docx-table-25x10 unreviewed (expected exactly one measured case)
- A: documents repeat 2: html-assets-1x256 unreviewed (expected exactly one measured case)
- A: documents repeat 2: html-script-250ms unreviewed (expected exactly one measured case)
- A: documents repeat 3: adapter/cleanup/provenance failure
- A: documents repeat 3: xlsx-merge-32x32 unreviewed (expected exactly one measured case)
- A: documents repeat 3: xlsx-sheets-1 unreviewed (expected exactly one measured case)
- A: documents repeat 3: csv-rows-64kib unreviewed (expected exactly one measured case)
- A: documents repeat 3: csv-wide-64kib unreviewed (expected exactly one measured case)
- A: documents repeat 3: csv-quoted-64kib unreviewed (expected exactly one measured case)
- A: documents repeat 3: docx-paragraphs-100 unreviewed (expected exactly one measured case)
- A: documents repeat 3: docx-table-25x10 unreviewed (expected exactly one measured case)
- A: documents repeat 3: html-assets-1x256 unreviewed (expected exactly one measured case)
- A: documents repeat 3: html-script-250ms unreviewed (expected exactly one measured case)
- B: artifacts: expected 3 repeats, got 1
- B: artifacts.median.open.mdLarge.openMs: every expected raw repeat must be finite
- B: artifacts.median.typing.codeLarge.keystroke.p95Ms: every expected raw repeat must be finite
- B: artifacts.median.htmlNav.swap.medianMs: every expected raw repeat must be finite
- B: artifacts.median.ipcSumOfSteps.totalStallMs: every expected raw repeat must be finite
- B: documents: incomplete repeat count
- B: documents repeat 1: adapter/cleanup/provenance failure
- B: documents repeat 1: docx-paragraphs-100 memory-limit (expected exactly one measured case)
- B: documents repeat 1: docx-table-25x10 unreviewed (expected exactly one measured case)
- B: documents repeat 1: html-assets-1x256 unreviewed (expected exactly one measured case)
- B: documents repeat 1: html-script-250ms unreviewed (expected exactly one measured case)
- B: compare.mjs PRIMARY path "artifacts.median.open.mdLarge.openMs" has only 1 sample behind its median (114) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
- B: compare.mjs PRIMARY path "artifacts.median.typing.codeLarge.keystroke.p95Ms" has only 1 sample behind its median (33) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
- B: compare.mjs PRIMARY path "artifacts.median.htmlNav.swap.medianMs" has only 1 sample behind its median (83) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
- B: compare.mjs PRIMARY path "artifacts.median.ipcSumOfSteps.totalStallMs" has only 1 sample behind its median (23) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.
- B: aborted: Document adapter stopped the owned boot; remaining repeats incomplete
- documents: baseline documents repeat 2: adapter/cleanup/provenance failure
- documents: baseline documents repeat 2: xlsx-merge-32x32 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 2: xlsx-sheets-1 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 2: csv-rows-64kib unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 2: csv-wide-64kib unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 2: csv-quoted-64kib unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 2: docx-paragraphs-100 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 2: docx-table-25x10 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 2: html-assets-1x256 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 2: html-script-250ms unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 3: adapter/cleanup/provenance failure
- documents: baseline documents repeat 3: xlsx-merge-32x32 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 3: xlsx-sheets-1 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 3: csv-rows-64kib unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 3: csv-wide-64kib unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 3: csv-quoted-64kib unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 3: docx-paragraphs-100 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 3: docx-table-25x10 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 3: html-assets-1x256 unreviewed (expected exactly one measured case)
- documents: baseline documents repeat 3: html-script-250ms unreviewed (expected exactly one measured case)
- documents: candidate documents: incomplete repeat count
- documents: candidate documents repeat 1: adapter/cleanup/provenance failure
- documents: candidate documents repeat 1: docx-paragraphs-100 memory-limit (expected exactly one measured case)
- documents: candidate documents repeat 1: docx-table-25x10 unreviewed (expected exactly one measured case)
- documents: candidate documents repeat 1: html-assets-1x256 unreviewed (expected exactly one measured case)
- documents: candidate documents repeat 1: html-script-250ms unreviewed (expected exactly one measured case)
- documents: documents xlsx-merge-32x32 worst renderer.maxDelayMs regressed 63.6 -> 67.5
- documents: documents xlsx-sheets-1 worst operationMs regressed 96.06677800000034 -> 105.53796499999589
- documents: documents xlsx-sheets-1 worst renderer.maxDelayMs regressed 59.6 -> 66.8
- documents: documents xlsx-sheets-1 worst main.maxDelayMs regressed 0.7 -> 5.1
- documents: documents xlsx-sheets-1 worst input.latencyMs regressed 19.870988000373472 -> 25.964094999988447
- documents: documents csv-wide-64kib worst operationMs regressed 80.39690999999948 -> 90.92588499998965
- documents: documents csv-wide-64kib worst input.latencyMs regressed 2.6536540000925015 -> 6.155654999995022
- documents: documents csv-quoted-64kib worst operationMs regressed 73.96695800000089 -> 82.60558700001275
- documents: documents html-assets-1x256: fixture identity differs

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
| artifacts.median.open.mdLarge.openMs | 803 | 114 | -689 | -85.8% | 25 | — | 805 | 114 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| artifacts.median.typing.codeLarge.keystroke.p95Ms | 33.4 | 33 | -0.4 | -1.2% | 2.6999999999999993 | — | 34 | 33 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| artifacts.median.htmlNav.swap.medianMs | 83 | 83 | 0 | 0% | 2 | — | 83 | 83 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| artifacts.median.ipcSumOfSteps.totalStallMs | 0 | 23 | 23 | — | 0 | — | 0 | 23 | **incomparable** — runs are incomparable; values shown but NOT ranked |
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

## Document cases

| Metric | A | B | Δ | Δ% | A spread | B spread | A worst | B worst | Status |
|---|---|---|---|---|---|---|---|---|---|
| documents.xlsx-merge-32x32.operationMs | 396.96844000000056 | 194.7161819999892 | -202.25 | -50.9% | — | — | 396.96844000000056 | 194.7161819999892 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.xlsx-merge-32x32.renderer.maxDelayMs | 63.6 | 67.5 | 3.9 | +6.1% | — | — | 63.6 | 67.5 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.xlsx-merge-32x32.main.maxDelayMs | 2.5 | 1.9 | -0.6 | -24% | — | — | 2.5 | 1.9 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.xlsx-merge-32x32.input.latencyMs | 70.07673199972123 | 64.55999600009818 | -5.52 | -7.9% | — | — | 70.07673199972123 | 64.55999600009818 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.xlsx-merge-32x32.memory.peakRssMb | 1511.328125 | 1520.6875 | 9.36 | +0.6% | — | — | 1511.328125 | 1520.6875 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.xlsx-sheets-1.operationMs | 96.06677800000034 | 105.53796499999589 | 9.47 | +9.9% | — | — | 96.06677800000034 | 105.53796499999589 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.xlsx-sheets-1.renderer.maxDelayMs | 59.6 | 66.8 | 7.2 | +12.1% | — | — | 59.6 | 66.8 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.xlsx-sheets-1.main.maxDelayMs | 0.7 | 5.1 | 4.4 | +628.6% | — | — | 0.7 | 5.1 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.xlsx-sheets-1.input.latencyMs | 19.870988000373472 | 25.964094999988447 | 6.09 | +30.7% | — | — | 19.870988000373472 | 25.964094999988447 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.xlsx-sheets-1.memory.peakRssMb | 1517.6171875 | 1520.5 | 2.88 | +0.2% | — | — | 1517.6171875 | 1520.5 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-rows-64kib.operationMs | 81.55781900000147 | 83.09547700000985 | 1.54 | +1.9% | — | — | 81.55781900000147 | 83.09547700000985 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-rows-64kib.renderer.maxDelayMs | 63 | 64.5 | 1.5 | +2.4% | — | — | 63 | 64.5 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-rows-64kib.main.maxDelayMs | 1.4 | 2.1 | 0.7 | +50% | — | — | 1.4 | 2.1 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-rows-64kib.input.latencyMs | 22.05847999962498 | 1.7456610002845991 | -20.31 | -92.1% | — | — | 22.05847999962498 | 1.7456610002845991 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-rows-64kib.memory.peakRssMb | 1521.2421875 | 1507.2734375 | -13.97 | -0.9% | — | — | 1521.2421875 | 1507.2734375 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-wide-64kib.operationMs | 80.39690999999948 | 90.92588499998965 | 10.53 | +13.1% | — | — | 80.39690999999948 | 90.92588499998965 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-wide-64kib.renderer.maxDelayMs | 61.9 | 61.9 | 0 | 0% | — | — | 61.9 | 61.9 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-wide-64kib.main.maxDelayMs | 1.1 | 0.3 | -0.8 | -72.7% | — | — | 1.1 | 0.3 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-wide-64kib.input.latencyMs | 2.6536540000925015 | 6.155654999995022 | 3.5 | +132% | — | — | 2.6536540000925015 | 6.155654999995022 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-wide-64kib.memory.peakRssMb | 1525.484375 | 1519.5859375 | -5.9 | -0.4% | — | — | 1525.484375 | 1519.5859375 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-quoted-64kib.operationMs | 73.96695800000089 | 82.60558700001275 | 8.64 | +11.7% | — | — | 73.96695800000089 | 82.60558700001275 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-quoted-64kib.renderer.maxDelayMs | 55.3 | 45.2 | -10.1 | -18.3% | — | — | 55.3 | 45.2 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-quoted-64kib.main.maxDelayMs | 1.7 | 0.5 | -1.2 | -70.6% | — | — | 1.7 | 0.5 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-quoted-64kib.input.latencyMs | 15.262370999815175 | 1.884621000092011 | -13.38 | -87.7% | — | — | 15.262370999815175 | 1.884621000092011 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.csv-quoted-64kib.memory.peakRssMb | 1525.4453125 | 1531.4765625 | 6.03 | +0.4% | — | — | 1525.4453125 | 1531.4765625 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.docx-paragraphs-100.operationMs | 367.43949299999804 | — | — | — | — | — | 367.43949299999804 | — | **missing** — absent in B |
| documents.docx-paragraphs-100.renderer.maxDelayMs | 24.7 | — | — | — | — | — | 24.7 | — | **missing** — absent in B |
| documents.docx-paragraphs-100.main.maxDelayMs | 0.5 | — | — | — | — | — | 0.5 | — | **missing** — absent in B |
| documents.docx-paragraphs-100.input.latencyMs | 22.7033660000925 | — | — | — | — | — | 22.7033660000925 | — | **missing** — absent in B |
| documents.docx-paragraphs-100.memory.peakRssMb | 1526.21875 | 1536.6171875 | 10.4 | +0.7% | — | — | 1526.21875 | 1536.6171875 | **incomparable** — runs are incomparable; values shown but NOT ranked |
| documents.docx-table-25x10.operationMs | 45.07139100000131 | — | — | — | — | — | 45.07139100000131 | — | **missing** — absent in B |
| documents.docx-table-25x10.renderer.maxDelayMs | 3.5 | — | — | — | — | — | 3.5 | — | **missing** — absent in B |
| documents.docx-table-25x10.main.maxDelayMs | 0.6 | — | — | — | — | — | 0.6 | — | **missing** — absent in B |
| documents.docx-table-25x10.input.latencyMs | 2.103670000189595 | — | — | — | — | — | 2.103670000189595 | — | **missing** — absent in B |
| documents.docx-table-25x10.memory.peakRssMb | 1457.015625 | — | — | — | — | — | 1457.015625 | — | **missing** — absent in B |
| documents.html-assets-1x256.operationMs | 166.25053499999922 | — | — | — | — | — | 166.25053499999922 | — | **missing** — absent in B |
| documents.html-assets-1x256.renderer.maxDelayMs | 21.1 | — | — | — | — | — | 21.1 | — | **missing** — absent in B |
| documents.html-assets-1x256.main.maxDelayMs | 2.6 | — | — | — | — | — | 2.6 | — | **missing** — absent in B |
| documents.html-assets-1x256.input.latencyMs | 8.730112000281224 | — | — | — | — | — | 8.730112000281224 | — | **missing** — absent in B |
| documents.html-assets-1x256.memory.peakRssMb | 1477.57421875 | — | — | — | — | — | 1477.57421875 | — | **missing** — absent in B |
| documents.html-script-250ms.operationMs | 342.3474840000017 | — | — | — | — | — | 342.3474840000017 | — | **missing** — absent in B |
| documents.html-script-250ms.renderer.maxDelayMs | 42.9 | — | — | — | — | — | 42.9 | — | **missing** — absent in B |
| documents.html-script-250ms.main.maxDelayMs | 2.1 | — | — | — | — | — | 2.1 | — | **missing** — absent in B |
| documents.html-script-250ms.input.latencyMs | 1.501380000001518 | — | — | — | — | — | 1.501380000001518 | — | **missing** — absent in B |
| documents.html-script-250ms.memory.peakRssMb | 1483.0390625 | — | — | — | — | — | 1483.0390625 | — | **missing** — absent in B |

## Evidence

- A report: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/artifacts/2026-10-23-2326-d0a7211-vs-6183168-desk-artifacts/2026-10-23-2326-d0a7211-a.json
- B report: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/artifacts/2026-10-23-2326-d0a7211-vs-6183168-desk-artifacts/2026-10-23-2327-6183168-b.json
