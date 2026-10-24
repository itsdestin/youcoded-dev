# A/B comparison — 2026-10-23-2330-d0a7211-vs-6183168-desk-artifacts2

- A (/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded-A): executable `09f76150ca15`, app.asar `5042a421117a`, instrument `af854d7a81d3`
- B (/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded): executable `09f76150ca15`, app.asar `63c3e45d159f`, instrument `af854d7a81d3`

**Comparable:** yes (same instrument, fixture, execution options; same machine and renderer lane).

- Note: Interference is judged from /proc samples every 500 ms: it names other programs using the CPU, disk or memory, but cannot see everything (e.g. another program holding the graphics chip is only attributed where /proc allows).

Counts: 30 missing, 1 improved, 38 inconclusive. Lower is better everywhere. "inconclusive" = the change is within the two sides' combined run-to-run range. No aggregate score is computed.

## Required-lane failures (not averaged away)

- documents: documents xlsx-merge-32x32 worst main.maxDelayMs regressed 0.6 -> 3
- documents: documents xlsx-sheets-1 worst operationMs regressed 107.64133300000321 -> 118.05109900000389
- documents: documents xlsx-sheets-1 worst renderer.maxDelayMs regressed 68 -> 84
- documents: documents xlsx-sheets-1 worst input.latencyMs regressed 18.653774999722373 -> 38.846813999989536
- documents: documents csv-rows-64kib worst renderer.maxDelayMs regressed 61.7 -> 63.6
- documents: documents csv-quoted-64kib worst operationMs regressed 70.21877699999823 -> 73.97034699999494
- documents: documents csv-quoted-64kib worst input.latencyMs regressed 13.61264399990614 -> 17.48441999962961
- documents: documents docx-paragraphs-100 worst renderer.maxDelayMs regressed 31.5 -> 33.2
- documents: documents docx-paragraphs-100 worst main.maxDelayMs regressed 1.8 -> 2.9
- documents: documents docx-paragraphs-100 worst input.latencyMs regressed 20.98864200028038 -> 22.619214000093052
- documents: documents docx-table-25x10 worst operationMs regressed 38.900276000000304 -> 52.965623000010964
- documents: documents docx-table-25x10 worst renderer.maxDelayMs regressed 4.2 -> 13.2

## Worst-case (tail) regressions

- artifacts.median.ipcSumOfSteps.totalStallMs: B repeat 1 reached 30 vs A worst 0 (noise guard 1)

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
| artifacts.median.open.mdLarge.openMs | 807 | 104 | -703 | -87.1% | 15 | 14 | 808 | 113 | **improved** |
| artifacts.median.typing.codeLarge.keystroke.p95Ms | 33.4 | 32.7 | -0.7 | -2.1% | 1.5999999999999979 | 2 | 33.4 | 33 | **inconclusive** |
| artifacts.median.htmlNav.swap.medianMs | 82 | 83 | 1 | +1.2% | 1 | 1 | 82 | 83 | **inconclusive** |
| artifacts.median.ipcSumOfSteps.totalStallMs | 0 | 0 | 0 | — | 0 | 30 | 0 | 30 | **inconclusive** — TAIL REGRESSION |
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
| documents.xlsx-merge-32x32.operationMs | 77.27975999999762 | 78.16231200000038 | 0.88 | +1.1% | 325.3279889999976 | 319.0660269999935 | 400.9526249999981 | 389.94148900000437 | **inconclusive** |
| documents.xlsx-merge-32x32.renderer.maxDelayMs | 38.2 | 36.9 | -1.3 | -3.4% | 26.9 | 26.200000000000003 | 63 | 56.2 | **inconclusive** |
| documents.xlsx-merge-32x32.main.maxDelayMs | 0.3 | 0.5 | 0.2 | +66.7% | 0.3 | 2.8 | 0.6 | 3 | **inconclusive** |
| documents.xlsx-merge-32x32.input.latencyMs | 10.056289999905857 | 11.2213750002702 | 1.17 | +11.6% | 60.446223000093596 | 60.6210660001816 | 69.9627579999069 | 63.51518200027931 | **inconclusive** |
| documents.xlsx-merge-32x32.memory.peakRssMb | 1439.1015625 | 1443.12109375 | 4.02 | +0.3% | 64.6484375 | 79.02734375 | 1469.453125 | 1460.76171875 | **inconclusive** |
| documents.xlsx-sheets-1.operationMs | 93.65547499999957 | 93.21845900001063 | -0.44 | -0.5% | 14.83186800000476 | 28.364701000013156 | 107.64133300000321 | 118.05109900000389 | **inconclusive** |
| documents.xlsx-sheets-1.renderer.maxDelayMs | 54.3 | 53.8 | -0.5 | -0.9% | 15.700000000000003 | 33.4 | 68 | 84 | **inconclusive** |
| documents.xlsx-sheets-1.main.maxDelayMs | 0.6 | 0.3 | -0.3 | -50% | 0.19999999999999996 | 0.09999999999999998 | 0.7 | 0.3 | **inconclusive** |
| documents.xlsx-sheets-1.input.latencyMs | 14.62659800000256 | 13.496377000003122 | -1.13 | -7.7% | 4.986032999906456 | 28.29753899962816 | 18.653774999722373 | 38.846813999989536 | **inconclusive** |
| documents.xlsx-sheets-1.memory.peakRssMb | 1441.56640625 | 1445.32421875 | 3.76 | +0.3% | 83.81640625 | 74.54296875 | 1490.11328125 | 1462.69921875 | **inconclusive** |
| documents.csv-rows-64kib.operationMs | 75.1367969999992 | 71.9752359999984 | -3.16 | -4.2% | 10.297936000002665 | 10.704914000001736 | 80.53531700000167 | 82.20334200000798 | **inconclusive** |
| documents.csv-rows-64kib.renderer.maxDelayMs | 57.5 | 53.2 | -4.3 | -7.5% | 10.200000000000003 | 10.899999999999999 | 61.7 | 63.6 | **inconclusive** |
| documents.csv-rows-64kib.main.maxDelayMs | 0.4 | 0.4 | 0 | 0% | 0.39999999999999997 | 0.2 | 0.7 | 0.5 | **inconclusive** |
| documents.csv-rows-64kib.input.latencyMs | 19.675792999718396 | 17.963312000094447 | -1.71 | -8.7% | 7.7793690001853975 | 6.484577999814064 | 24.86670500037144 | 24.348420999813243 | **inconclusive** |
| documents.csv-rows-64kib.memory.peakRssMb | 1441.51171875 | 1445.296875 | 3.79 | +0.3% | 94.76953125 | 83.1015625 | 1504.546875 | 1465.4296875 | **inconclusive** |
| documents.csv-wide-64kib.operationMs | 80.68455900000117 | 76.39858000000822 | -4.29 | -5.3% | 9.46843699999954 | 15.868498999989242 | 86.36233300000094 | 88.81346299999859 | **inconclusive** |
| documents.csv-wide-64kib.renderer.maxDelayMs | 58.1 | 57.8 | -0.3 | -0.5% | 4.900000000000006 | 9 | 62.2 | 63.6 | **inconclusive** |
| documents.csv-wide-64kib.main.maxDelayMs | 0.4 | 0.6 | 0.2 | +50% | 0.3 | 0.7000000000000001 | 0.5 | 0.8 | **inconclusive** |
| documents.csv-wide-64kib.input.latencyMs | 22.616965999906824 | 18.93477699990035 | -3.68 | -16.3% | 6.751979999720788 | 20.624473999632755 | 27.236871000091924 | 22.441863999905763 | **inconclusive** |
| documents.csv-wide-64kib.memory.peakRssMb | 1440.34765625 | 1443.6484375 | 3.3 | +0.2% | 110.859375 | 70.5625 | 1521.984375 | 1467.80859375 | **inconclusive** |
| documents.csv-quoted-64kib.operationMs | 69.6899110000013 | 70.16321999998763 | 0.47 | +0.7% | 6.697779999998602 | 10.637956999984453 | 70.21877699999823 | 73.97034699999494 | **inconclusive** |
| documents.csv-quoted-64kib.renderer.maxDelayMs | 45.3 | 46.8 | 1.5 | +3.3% | 21.200000000000003 | 10.700000000000003 | 65.9 | 55.2 | **inconclusive** |
| documents.csv-quoted-64kib.main.maxDelayMs | 0.4 | 0.3 | -0.1 | -25% | 0.09999999999999998 | 1 | 0.5 | 1.1 | **inconclusive** |
| documents.csv-quoted-64kib.input.latencyMs | 10.79326700018646 | 11.850909000087995 | 1.06 | +9.8% | 3.9632989999081474 | 7.100669999534148 | 13.61264399990614 | 17.48441999962961 | **inconclusive** |
| documents.csv-quoted-64kib.memory.peakRssMb | 1439.96484375 | 1446.04296875 | 6.08 | +0.4% | 112.29296875 | 63.88671875 | 1519.17578125 | 1470.68359375 | **inconclusive** |
| documents.docx-paragraphs-100.operationMs | 35.177223999999114 | 35.31512300000759 | 0.14 | +0.4% | 322.5753029999978 | 323.9270310000138 | 357.2994249999974 | 357.7416610000073 | **inconclusive** |
| documents.docx-paragraphs-100.renderer.maxDelayMs | 4.2 | 3.7 | -0.5 | -11.9% | 27.8 | 30.700000000000003 | 31.5 | 33.2 | **inconclusive** |
| documents.docx-paragraphs-100.main.maxDelayMs | 0.5 | 0.8 | 0.3 | +60% | 1.5 | 2.6 | 1.8 | 2.9 | **inconclusive** |
| documents.docx-paragraphs-100.input.latencyMs | 1.5228570002800552 | 1.5662710000906372 | 0.04 | +2.9% | 19.51671600046393 | 21.18079700009548 | 20.98864200028038 | 22.619214000093052 | **inconclusive** |
| documents.docx-paragraphs-100.memory.peakRssMb | 1406.77734375 | 1446.41015625 | 39.63 | +2.8% | 122.8359375 | 55.41796875 | 1523.59765625 | 1470.203125 | **inconclusive** |
| documents.docx-table-25x10.operationMs | 38.1999599999981 | 43.74152199999662 | 5.54 | +14.5% | 2.5429040000017267 | 18.64360700000543 | 38.900276000000304 | 52.965623000010964 | **inconclusive** |
| documents.docx-table-25x10.renderer.maxDelayMs | 4.1 | 3.8 | -0.3 | -7.3% | 1.5 | 9.6 | 4.2 | 13.2 | **inconclusive** |
| documents.docx-table-25x10.main.maxDelayMs | 0.6 | 0.3 | -0.3 | -50% | 0.8 | 0.19999999999999998 | 1 | 0.3 | **inconclusive** |
| documents.docx-table-25x10.input.latencyMs | 6.612039999999979 | 6.22507299973222 | -0.39 | -5.9% | 4.767870000097901 | 4.841832999445614 | 6.674681000098644 | 6.583813999619451 | **inconclusive** |
| documents.docx-table-25x10.memory.peakRssMb | 1401.7421875 | 1441.86328125 | 40.12 | +2.9% | 124.95703125 | 51.4921875 | 1522.37890625 | 1466.32421875 | **inconclusive** |

## Evidence

- A report: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/artifacts/2026-10-23-2330-d0a7211-vs-6183168-desk-artifacts2/2026-10-23-2330-d0a7211-a.json
- B report: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/artifacts/2026-10-23-2330-d0a7211-vs-6183168-desk-artifacts2/2026-10-23-2330-6183168-b.json
