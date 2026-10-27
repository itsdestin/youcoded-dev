# Noise: A run 1 vs A run 2 — 2026-10-23-2330-d0a7211-vs-6183168-desk-artifacts2

- A (A run 1): executable `09f76150ca15`, app.asar `5042a421117a`, instrument `af854d7a81d3`
- B (A run 2): executable `09f76150ca15`, app.asar `5042a421117a`, instrument `af854d7a81d3`

**Comparable:** yes (same instrument, fixture, execution options; same machine and renderer lane).

- Note: Interference is judged from /proc samples every 500 ms: it names other programs using the CPU, disk or memory, but cannot see everything (e.g. another program holding the graphics chip is only attributed where /proc allows).

Counts: 30 missing, 39 inconclusive. Lower is better everywhere. "inconclusive" = the change is within the two sides' combined run-to-run range. No aggregate score is computed.

## Required-lane failures (not averaged away)

- documents: documents xlsx-merge-32x32 worst renderer.maxDelayMs regressed 63 -> 76.2
- documents: documents xlsx-merge-32x32 worst main.maxDelayMs regressed 0.6 -> 2.3
- documents: documents docx-table-25x10 worst operationMs regressed 38.900276000000304 -> 51.81818200000271
- documents: documents docx-table-25x10 worst renderer.maxDelayMs regressed 4.2 -> 11.5

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
| artifacts.median.open.mdLarge.openMs | 807 | 808 | 1 | +0.1% | 15 | 19 | 808 | 821 | **inconclusive** |
| artifacts.median.typing.codeLarge.keystroke.p95Ms | 33.4 | 33.3 | -0.1 | -0.3% | 1.5999999999999979 | 0.29999999999999716 | 33.4 | 33.5 | **inconclusive** |
| artifacts.median.htmlNav.swap.medianMs | 82 | 83 | 1 | +1.2% | 1 | 2 | 82 | 85 | **inconclusive** |
| artifacts.median.ipcSumOfSteps.totalStallMs | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | **inconclusive** |
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
| documents.xlsx-merge-32x32.operationMs | 77.27975999999762 | 76.74941699998453 | -0.53 | -0.7% | 325.3279889999976 | 328.3040470000269 | 400.9526249999981 | 402.0102110000007 | **inconclusive** |
| documents.xlsx-merge-32x32.renderer.maxDelayMs | 38.2 | 37.1 | -1.1 | -2.9% | 26.9 | 41.2 | 63 | 76.2 | **inconclusive** |
| documents.xlsx-merge-32x32.main.maxDelayMs | 0.3 | 1.3 | 1 | +333.3% | 0.3 | 1.9999999999999998 | 0.6 | 2.3 | **inconclusive** |
| documents.xlsx-merge-32x32.input.latencyMs | 10.056289999905857 | 8.849881000089226 | -1.21 | -12% | 60.446223000093596 | 57.1769340000028 | 69.9627579999069 | 63.33814300010272 | **inconclusive** |
| documents.xlsx-merge-32x32.memory.peakRssMb | 1439.1015625 | 1438.69921875 | -0.4 | 0% | 64.6484375 | 28.6171875 | 1469.453125 | 1444.59765625 | **inconclusive** |
| documents.xlsx-sheets-1.operationMs | 93.65547499999957 | 94.80246100001386 | 1.15 | +1.2% | 14.83186800000476 | 9.600615999981528 | 107.64133300000321 | 103.8895279999997 | **inconclusive** |
| documents.xlsx-sheets-1.renderer.maxDelayMs | 54.3 | 54.2 | -0.1 | -0.2% | 15.700000000000003 | 5.399999999999999 | 68 | 59.3 | **inconclusive** |
| documents.xlsx-sheets-1.main.maxDelayMs | 0.6 | 0.3 | -0.3 | -50% | 0.19999999999999996 | 0.9000000000000001 | 0.7 | 1.1 | **inconclusive** |
| documents.xlsx-sheets-1.input.latencyMs | 14.62659800000256 | 16.145614999724785 | 1.52 | +10.4% | 4.986032999906456 | 4.648607999915839 | 18.653774999722373 | 19.274019999909797 | **inconclusive** |
| documents.xlsx-sheets-1.memory.peakRssMb | 1441.56640625 | 1446.7734375 | 5.21 | +0.4% | 83.81640625 | 34.78125 | 1490.11328125 | 1453.0234375 | **inconclusive** |
| documents.csv-rows-64kib.operationMs | 75.1367969999992 | 73.0524569999834 | -2.08 | -2.8% | 10.297936000002665 | 7.574699000018882 | 80.53531700000167 | 78.9168570000038 | **inconclusive** |
| documents.csv-rows-64kib.renderer.maxDelayMs | 57.5 | 54 | -3.5 | -6.1% | 10.200000000000003 | 7.899999999999999 | 61.7 | 60.1 | **inconclusive** |
| documents.csv-rows-64kib.main.maxDelayMs | 0.4 | 0.5 | 0.1 | +25% | 0.39999999999999997 | 0.19999999999999996 | 0.7 | 0.6 | **inconclusive** |
| documents.csv-rows-64kib.input.latencyMs | 19.675792999718396 | 19.084267999918666 | -0.59 | -3% | 7.7793690001853975 | 7.172492999729002 | 24.86670500037144 | 24.46389199999976 | **inconclusive** |
| documents.csv-rows-64kib.memory.peakRssMb | 1441.51171875 | 1449.65234375 | 8.14 | +0.6% | 94.76953125 | 36.37890625 | 1504.546875 | 1455.2578125 | **inconclusive** |
| documents.csv-wide-64kib.operationMs | 80.68455900000117 | 77.49785899999551 | -3.19 | -3.9% | 9.46843699999954 | 4.995042000009562 | 86.36233300000094 | 78.14221700000053 | **inconclusive** |
| documents.csv-wide-64kib.renderer.maxDelayMs | 58.1 | 58.7 | 0.6 | +1% | 4.900000000000006 | 5 | 62.2 | 59.5 | **inconclusive** |
| documents.csv-wide-64kib.main.maxDelayMs | 0.4 | 0.9 | 0.5 | +125% | 0.3 | 1 | 0.5 | 1.2 | **inconclusive** |
| documents.csv-wide-64kib.input.latencyMs | 22.616965999906824 | 21.404957999824546 | -1.21 | -5.4% | 6.751979999720788 | 4.736048000107985 | 27.236871000091924 | 23.887076000100933 | **inconclusive** |
| documents.csv-wide-64kib.memory.peakRssMb | 1440.34765625 | 1426.62109375 | -13.73 | -1% | 110.859375 | 35.2890625 | 1521.984375 | 1456.35546875 | **inconclusive** |
| documents.csv-quoted-64kib.operationMs | 69.6899110000013 | 65.68961900001159 | -4 | -5.7% | 6.697779999998602 | 5.274026000013691 | 70.21877699999823 | 70.34439800000109 | **inconclusive** |
| documents.csv-quoted-64kib.renderer.maxDelayMs | 45.3 | 46.8 | 1.5 | +3.3% | 21.200000000000003 | 0.8999999999999986 | 65.9 | 47.1 | **inconclusive** |
| documents.csv-quoted-64kib.main.maxDelayMs | 0.4 | 0.4 | 0 | 0% | 0.09999999999999998 | 0.3 | 0.5 | 0.6 | **inconclusive** |
| documents.csv-quoted-64kib.input.latencyMs | 10.79326700018646 | 12.67106600018451 | 1.88 | +17.4% | 3.9632989999081474 | 2.5927659999142634 | 13.61264399990614 | 12.674833999815746 | **inconclusive** |
| documents.csv-quoted-64kib.memory.peakRssMb | 1439.96484375 | 1426.5078125 | -13.46 | -0.9% | 112.29296875 | 33.16015625 | 1519.17578125 | 1454.21484375 | **inconclusive** |
| documents.docx-paragraphs-100.operationMs | 35.177223999999114 | 35.74293999999645 | 0.57 | +1.6% | 322.5753029999978 | 321.19053000000713 | 357.2994249999974 | 356.5698490000068 | **inconclusive** |
| documents.docx-paragraphs-100.renderer.maxDelayMs | 4.2 | 4.5 | 0.3 | +7.1% | 27.8 | 27.5 | 31.5 | 31.5 | **inconclusive** |
| documents.docx-paragraphs-100.main.maxDelayMs | 0.5 | 0.5 | 0 | 0% | 1.5 | 0.6 | 1.8 | 1 | **inconclusive** |
| documents.docx-paragraphs-100.input.latencyMs | 1.5228570002800552 | 1.4268520001787692 | -0.1 | -6.3% | 19.51671600046393 | 19.478543000193895 | 20.98864200028038 | 20.900949000104447 | **inconclusive** |
| documents.docx-paragraphs-100.memory.peakRssMb | 1406.77734375 | 1427.17578125 | 20.4 | +1.5% | 122.8359375 | 80.6875 | 1523.59765625 | 1457.859375 | **inconclusive** |
| documents.docx-table-25x10.operationMs | 38.1999599999981 | 35.39395699999295 | -2.81 | -7.3% | 2.5429040000017267 | 16.46136599998863 | 38.900276000000304 | 51.81818200000271 | **inconclusive** |
| documents.docx-table-25x10.renderer.maxDelayMs | 4.1 | 3.6 | -0.5 | -12.2% | 1.5 | 8 | 4.2 | 11.5 | **inconclusive** |
| documents.docx-table-25x10.main.maxDelayMs | 0.6 | 0.4 | -0.2 | -33.3% | 0.8 | 0.2 | 1 | 0.5 | **inconclusive** |
| documents.docx-table-25x10.input.latencyMs | 6.612039999999979 | 2.137851000094088 | -4.47 | -67.7% | 4.767870000097901 | 5.072998999530682 | 6.674681000098644 | 6.759946999809472 | **inconclusive** |
| documents.docx-table-25x10.memory.peakRssMb | 1401.7421875 | 1426.11328125 | 24.37 | +1.7% | 124.95703125 | 84.09375 | 1522.37890625 | 1457.79296875 | **inconclusive** |

## Evidence

- A report: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/artifacts/2026-10-23-2330-d0a7211-vs-6183168-desk-artifacts2/2026-10-23-2330-d0a7211-a.json
- B report: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/artifacts/2026-10-23-2330-d0a7211-vs-6183168-desk-artifacts2/2026-10-23-2331-d0a7211-a2.json
