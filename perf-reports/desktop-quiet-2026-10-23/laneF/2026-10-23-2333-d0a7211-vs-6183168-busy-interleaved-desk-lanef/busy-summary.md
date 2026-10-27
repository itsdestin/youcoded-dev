# Old vs new — busy machine, exploratory — interleaved design

> **Busy machine, exploratory.** Measured without waiting for a quiet machine; other programs were using the CPU the whole time (see Foreign load). This is NOT a clean/strict comparison (the strict path in `compare.mjs` still refuses such reports). Reliability comes from the design: runs alternate order every round so background load hits both sides alike, each side is judged on its median and range over several runs, and an A/A run shows what "no change" looks like here.

- Side A (old): `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded-A`
- Side B (new): `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded`
- Rounds: 3, order alternates every round: A,B,B,A…
- A/A noise used: none — verdicts use the range rule only

## Verdict rule (conservative)

B is called **faster/slower** only when ALL hold: (1) at least 3 measured runs on each side; (2) the two sides' min–max ranges do not overlap; (3) |median B − median A| exceeds the A/A noise for that metric (when an A/A run exists). Otherwise **no clear difference**. A side with no measured run is **not measured (reason)** — a failed or missing row is never counted as zero. Lower is better for every metric.

## Counts

- B slower: 29
- no clear difference: 172
- B faster: 14
- not measured: 5

## Foreign load observed (other programs, from the per-window interference watch)

- Windows watched: 78; verdicts: 78 clean, 0 disturbed, 0 unknown
- Foreign cores in use: median 0.7, max 0.8 (window averages)
- Side A windows: 39, median 0.7 cores, max 0.8 · Side B windows: 39, median 0.7 cores, max 0.8 (similar numbers mean the interleaving spread the load evenly)
- Top offenders (mean cores while present / max): youcoded 0.5/0.6 (78 windows); kwin_wayland 0.1/0.1 (78 windows); coolercontrold 0.1/0.1 (51 windows)

## Runs

| round | slot | side | exit | incomplete notes | report | problem |
|---|---|---|---|---|---|---|
| 1 | 1 | A | 4 | 2 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2333-d0a7211-vs-6183168-busy-interleaved-desk-lanef/2026-10-23-2333-d0a7211-r1-a.json` |  |
| 1 | 2 | B | 4 | 2 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2333-d0a7211-vs-6183168-busy-interleaved-desk-lanef/2026-10-23-2336-6183168-r1-b.json` |  |
| 2 | 1 | B | 4 | 6 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2333-d0a7211-vs-6183168-busy-interleaved-desk-lanef/2026-10-23-2340-6183168-r2-b.json` |  |
| 2 | 2 | A | 4 | 6 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2333-d0a7211-vs-6183168-busy-interleaved-desk-lanef/2026-10-23-2344-d0a7211-r2-a.json` |  |
| 3 | 1 | A | 4 | 6 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2333-d0a7211-vs-6183168-busy-interleaved-desk-lanef/2026-10-23-2348-d0a7211-r3-a.json` |  |
| 3 | 2 | B | 4 | 6 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2333-d0a7211-vs-6183168-busy-interleaved-desk-lanef/2026-10-23-2351-6183168-r3-b.json` |  |

## Differences found

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A | n B | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| csv-rows-64kib | operationMs | 111.4 | 115.6 | 4.2 | 3.8% | 110.7–113 | 114.1–132 | 3 | 3 | B slower |
| csv-rows-64kib | peakPssMb | 670.2 | 721.6 | 51.4 | 7.7% | 663–706.4 | 720–726 | 3 | 3 | B slower |
| csv-rows-256kib | peakPssMb | 669.6 | 723.3 | 53.7 | 8% | 666–707.6 | 722.5–723.8 | 3 | 3 | B slower |
| csv-rows-1024kib | peakPssMb | 720.6 | 754.8 | 34.2 | 4.7% | 694.9–737.8 | 754.4–765.8 | 3 | 3 | B slower |
| csv-rows-3072kib | operationMs | 158.3 | 192.5 | 34.2 | 21.6% | 148.8–161.4 | 164.8–193.2 | 3 | 3 | B slower |
| csv-rows-3072kib | rendererMaxDelayMs | 115.7 | 139 | 23.3 | 20.1% | 99.5–115.8 | 118.4–155 | 3 | 3 | B slower |
| csv-rows-3072kib | inputLatencyMs | 64.3 | 96.9 | 32.6 | 50.7% | 62.5–65 | 69.6–113 | 3 | 3 | B slower |
| csv-wide-64kib | operationMs | 88.8 | 94.3 | 5.5 | 6.2% | 78.5–92.9 | 94.2–96.7 | 3 | 3 | B slower |
| csv-wide-256kib | operationMs | 99 | 104.2 | 5.2 | 5.3% | 94.3–100.4 | 104.2–120.4 | 3 | 3 | B slower |
| csv-wide-256kib | rendererMaxDelayMs | 73.9 | 79.7 | 5.8 | 7.8% | 64.7–75.6 | 78.2–80.2 | 3 | 3 | B slower |
| csv-wide-256kib | inputLatencyMs | 9.2 | 15 | 5.8 | 63% | 4.7–10.8 | 11–21.7 | 3 | 3 | B slower |
| csv-wide-1024kib | rendererMaxDelayMs | 89.6 | 94.9 | 5.3 | 5.9% | 89.5–92.5 | 93.4–100.7 | 3 | 3 | B slower |
| csv-quoted-64kib | mainMaxDelayMs | 0.6 | 0.3 | -0.3 | -50% | 0.6–0.7 | 0.2–0.3 | 3 | 3 | B faster |
| csv-quoted-1024kib | operationMs | 96.2 | 101.3 | 5.1 | 5.3% | 93.3–97.9 | 99.7–105.4 | 3 | 3 | B slower |
| csv-quoted-1024kib | rendererMaxDelayMs | 68.7 | 74.6 | 5.9 | 8.6% | 60.6–69.1 | 71.1–75.1 | 3 | 3 | B slower |
| csv-quoted-3072kib | rendererMaxDelayMs | 103.7 | 110.9 | 7.2 | 6.9% | 100.1–104.7 | 104.8–118.9 | 3 | 3 | B slower |
| xlsx-merge-32x32 | rendererMaxDelayMs | 57 | 66.7 | 9.7 | 17% | 56.6–57.3 | 62.5–66.9 | 3 | 3 | B slower |
| xlsx-merge-32x32 | inputLatencyMs | 65.3 | 73.8 | 8.5 | 13% | 62.3–65.5 | 73.1–73.9 | 3 | 3 | B slower |
| xlsx-merge-32x32 | peakPssMb | 704.2 | 719 | 14.8 | 2.1% | 701.5–705.8 | 715.3–720.5 | 3 | 3 | B slower |
| xlsx-merge-128x128 | peakPssMb | 701.7 | 715.7 | 14 | 2% | 699.6–703.9 | 712.9–717.5 | 3 | 3 | B slower |
| xlsx-merge-300x300 | peakPssMb | 746.3 | 760.1 | 13.8 | 1.8% | 743.6–749.6 | 758.5–762.3 | 3 | 3 | B slower |
| xlsx-merge-400x500 | inputLatencyMs | 56.5 | 50.4 | -6.1 | -10.8% | 51.5–70.4 | 50.1–50.8 | 3 | 3 | B faster |
| docx-paragraphs-100 | peakPssMb | 699.5 | 712.3 | 12.8 | 1.8% | 664.5–703.2 | 711.9–715.7 | 3 | 3 | B slower |
| docx-paragraphs-1000 | operationMs | 95.3 | 99.1 | 3.8 | 4% | 94.4–97 | 97.8–101.2 | 3 | 3 | B slower |
| docx-paragraphs-1000 | rendererMaxDelayMs | 25.3 | 27.5 | 2.2 | 8.7% | 17.4–25.7 | 26.2–27.9 | 3 | 3 | B slower |
| docx-paragraphs-1000 | peakPssMb | 699.5 | 711.8 | 12.3 | 1.8% | 664.5–702.8 | 707–711.9 | 3 | 3 | B slower |
| docx-paragraphs-5000 | peakPssMb | 783.4 | 798.7 | 15.3 | 2% | 755.5–784.4 | 796.8–798.9 | 3 | 3 | B slower |
| path-list-1000 | operationMs | 135.3 | 132.2 | -3.1 | -2.3% | 133–140.2 | 128.5–132.5 | 3 | 3 | B faster |
| path-list-1000 | rendererMaxDelayMs | 116.6 | 113.7 | -2.9 | -2.5% | 114.5–121.1 | 107.1–113.8 | 3 | 3 | B faster |
| path-list-1000 | inputLatencyMs | 73.4 | 70.5 | -2.9 | -4% | 71.6–78.2 | 62.1–70.8 | 3 | 3 | B faster |
| path-list-10000 | operationMs | 1160.6 | 1102.8 | -57.8 | -5% | 1158.7–1165.5 | 1077.3–1103 | 3 | 3 | B faster |
| path-list-10000 | rendererMaxDelayMs | 1138.9 | 1075.4 | -63.5 | -5.6% | 1137.2–1143.5 | 1060–1094.3 | 3 | 3 | B faster |
| path-list-10000 | inputLatencyMs | 1084.3 | 1015.7 | -68.6 | -6.3% | 1075.6–1086 | 997.1–1022.4 | 3 | 3 | B faster |
| path-list-10000 | peakPssMb | 958.2 | 916.3 | -41.9 | -4.4% | 924.3–958.5 | 915.3–924 | 3 | 3 | B faster |
| path-list-20000 | operationMs | 3397.8 | 2098.7 | -1299.1 | -38.2% | 3354.4–4258.9 | 2098.4–2149.6 | 3 | 3 | B faster |
| path-list-20000 | rendererMaxDelayMs | 3377 | 2061.2 | -1315.8 | -39% | 3340.1–4253.7 | 2060–2134.1 | 3 | 3 | B faster |
| path-list-20000 | inputLatencyMs | 3266 | 1969.2 | -1296.8 | -39.7% | 3233.2–4129.4 | 1949.1–2027.2 | 3 | 3 | B faster |
| path-list-20000 | peakPssMb | 1378.4 | 1339.4 | -39 | -2.8% | 1363.8–1386.9 | 1339.2–1346.2 | 3 | 3 | B faster |
| background-index-large-history | operationMs | 3187.9 | 3207.6 | 19.7 | 0.6% | 3182–3201.6 | 3204.1–3219.2 | 3 | 3 | B slower |
| background-index-large-history | peakPssMb | 714.6 | 743.3 | 28.7 | 4% | 706–717.7 | 739.1–745.2 | 3 | 3 | B slower |
| image-jpeg-1024x768 | peakPssMb | 744.1 | 797.8 | 53.7 | 7.2% | 710.4–769 | 785.5–801.9 | 3 | 3 | B slower |
| image-jpeg-2048x1536 | operationMs | 70.9 | 80 | 9.1 | 12.8% | 50.8–73.8 | 79.3–102.1 | 3 | 3 | B slower |
| image-jpeg-4096x3072 | operationMs | 149.2 | 139.8 | -9.4 | -6.3% | 148.8–164.9 | 134.2–143.8 | 3 | 3 | B faster |

## Every rung and metric

n = measured runs (clean/disturbed windows). Times in ms, memory in MiB.

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A (clean/dist) | n B (clean/dist) | verdict | note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| csv-rows-64kib | operationMs | 111.4 | 115.6 | 4.2 | 3.8% | 110.7–113 | 114.1–132 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-rows-64kib | rendererMaxDelayMs | 67.2 | 68.1 | 0.9 | 1.3% | 66.1–80.3 | 64.1–69.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-64kib | mainMaxDelayMs | 0.6 | 0.4 | -0.2 | -33.3% | 0.4–0.6 | 0.3–1.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-64kib | inputLatencyMs | 23.9 | 24.6 | 0.7 | 2.9% | 22.8–24.6 | 23.3–26.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-64kib | peakPssMb | 670.2 | 721.6 | 51.4 | 7.7% | 663–706.4 | 720–726 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-rows-256kib | operationMs | 96.2 | 96.5 | 0.3 | 0.3% | 95.2–99.5 | 95–98.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-256kib | rendererMaxDelayMs | 67 | 68 | 1 | 1.5% | 65.7–70.4 | 66.4–71 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-256kib | mainMaxDelayMs | 0.7 | 0.7 | 0 | 0% | 0.5–1.2 | 0.5–0.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-256kib | inputLatencyMs | 11.1 | 12 | 0.9 | 8.1% | 10.3–12 | 8.3–14 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-256kib | peakPssMb | 669.6 | 723.3 | 53.7 | 8% | 666–707.6 | 722.5–723.8 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-rows-1024kib | operationMs | 110.6 | 117.3 | 6.7 | 6.1% | 103.4–113.8 | 110.9–146.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-1024kib | rendererMaxDelayMs | 92.2 | 88.1 | -4.1 | -4.4% | 79.6–95 | 81.9–89.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-1024kib | mainMaxDelayMs | 1.1 | 0.6 | -0.5 | -45.5% | 0.9–1.6 | 0.3–1.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-1024kib | inputLatencyMs | 28.1 | 31.2 | 3.1 | 11% | 19–35.1 | 28–52 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-1024kib | peakPssMb | 720.6 | 754.8 | 34.2 | 4.7% | 694.9–737.8 | 754.4–765.8 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-rows-3072kib | operationMs | 158.3 | 192.5 | 34.2 | 21.6% | 148.8–161.4 | 164.8–193.2 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-rows-3072kib | rendererMaxDelayMs | 115.7 | 139 | 23.3 | 20.1% | 99.5–115.8 | 118.4–155 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-rows-3072kib | mainMaxDelayMs | 1.8 | 3.7 | 1.9 | 105.6% | 0.7–2.7 | 2.5–4.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-3072kib | inputLatencyMs | 64.3 | 96.9 | 32.6 | 50.7% | 62.5–65 | 69.6–113 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-rows-3072kib | peakPssMb | 810.8 | 793.5 | -17.3 | -2.1% | 795.9–823.3 | 792.9–828.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-64kib | operationMs | 88.8 | 94.3 | 5.5 | 6.2% | 78.5–92.9 | 94.2–96.7 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-wide-64kib | rendererMaxDelayMs | 69 | 67.1 | -1.9 | -2.8% | 59.6–69.3 | 65.1–69.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-64kib | mainMaxDelayMs | 0.3 | 0.4 | 0.1 | 33.3% | 0.3–0.8 | 0.3–0.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-64kib | inputLatencyMs | 8.9 | 4.1 | -4.8 | -53.9% | 7.1–24.1 | 4–7.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-64kib | peakPssMb | 812.7 | 798.1 | -14.6 | -1.8% | 801.6–860.7 | 795.4–846.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-256kib | operationMs | 99 | 104.2 | 5.2 | 5.3% | 94.3–100.4 | 104.2–120.4 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-wide-256kib | rendererMaxDelayMs | 73.9 | 79.7 | 5.8 | 7.8% | 64.7–75.6 | 78.2–80.2 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-wide-256kib | mainMaxDelayMs | 0.8 | 0.6 | -0.2 | -25% | 0.5–2.3 | 0.5–0.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-256kib | inputLatencyMs | 9.2 | 15 | 5.8 | 63% | 4.7–10.8 | 11–21.7 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-wide-256kib | peakPssMb | 824 | 816 | -8 | -1% | 821.2–862.2 | 815–866.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-1024kib | operationMs | 112.1 | 117.8 | 5.7 | 5.1% | 107.8–119.1 | 111.9–124.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-1024kib | rendererMaxDelayMs | 89.6 | 94.9 | 5.3 | 5.9% | 89.5–92.5 | 93.4–100.7 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-wide-1024kib | mainMaxDelayMs | 0.3 | 1.1 | 0.8 | 266.7% | 0.3–0.4 | 0.3–1.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-1024kib | inputLatencyMs | 26.3 | 28.9 | 2.6 | 9.9% | 20.7–30.6 | 23.7–35.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-1024kib | peakPssMb | 842.7 | 851.7 | 9 | 1.1% | 805.6–844.4 | 837.5–886.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | operationMs | 148.8 | 149 | 0.2 | 0.1% | 141.6–149.8 | 147.2–169.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | rendererMaxDelayMs | 120.8 | 125 | 4.2 | 3.5% | 118.8–127.1 | 112.5–137.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | mainMaxDelayMs | 0.4 | 2.6 | 2.2 | 550% | 0.3–1.8 | 0.9–3.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | inputLatencyMs | 60.8 | 62.2 | 1.4 | 2.3% | 57.9–64.9 | 49.1–76.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | peakPssMb | 873.6 | 890.4 | 16.8 | 1.9% | 833.3–873.7 | 849.2–912.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-64kib | operationMs | 72.4 | 72.1 | -0.3 | -0.4% | 69.4–82.3 | 70.5–73.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-64kib | rendererMaxDelayMs | 53.9 | 31.3 | -22.6 | -41.9% | 50.7–60.7 | 29.2–53.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-64kib | mainMaxDelayMs | 0.6 | 0.3 | -0.3 | -50% | 0.6–0.7 | 0.2–0.3 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| csv-quoted-64kib | inputLatencyMs | 15.9 | 19.4 | 3.5 | 22% | 5.4–16.2 | 15.4–20.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-64kib | peakPssMb | 867.4 | 855 | -12.4 | -1.4% | 814.6–868.4 | 823.5–887.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | operationMs | 83.9 | 88.4 | 4.5 | 5.4% | 78.6–110.2 | 76.8–91.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | rendererMaxDelayMs | 57.6 | 59.7 | 2.1 | 3.6% | 57.4–60.6 | 58.5–60.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | mainMaxDelayMs | 0.9 | 0.8 | -0.1 | -11.1% | 0.2–1.9 | 0.4–1.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | inputLatencyMs | 7.3 | 6.2 | -1.1 | -15.1% | 5.8–22.1 | 4.7–21.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | peakPssMb | 869.1 | 856.3 | -12.8 | -1.5% | 828.1–870.1 | 824.7–909.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-1024kib | operationMs | 96.2 | 101.3 | 5.1 | 5.3% | 93.3–97.9 | 99.7–105.4 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-quoted-1024kib | rendererMaxDelayMs | 68.7 | 74.6 | 5.9 | 8.6% | 60.6–69.1 | 71.1–75.1 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-quoted-1024kib | mainMaxDelayMs | 0.6 | 0.5 | -0.1 | -16.7% | 0.3–0.6 | 0.4–4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-1024kib | inputLatencyMs | 17.8 | 17.7 | -0.1 | -0.6% | 9.2–18.7 | 15.1–20.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-1024kib | peakPssMb | 870.2 | 856.8 | -13.4 | -1.5% | 773.4–871.1 | 825.1–925.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-3072kib | operationMs | 121.8 | 144.1 | 22.3 | 18.3% | 121.8–126.5 | 123.5–149.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-3072kib | rendererMaxDelayMs | 103.7 | 110.9 | 7.2 | 6.9% | 100.1–104.7 | 104.8–118.9 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-quoted-3072kib | mainMaxDelayMs | 2.1 | 0.4 | -1.7 | -81% | 0.6–4.1 | 0.3–1.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-3072kib | inputLatencyMs | 47.6 | 57.2 | 9.6 | 20.2% | 47.2–53.2 | 50–66.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-3072kib | peakPssMb | 831.5 | 834.6 | 3.1 | 0.4% | 792.7–850.3 | 804.9–974.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-fullread-5120kib | operationMs | 546.1 | 552.2 | 6.1 | 1.1% | 542.8–563.7 | 552.1–561.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-fullread-5120kib | rendererMaxDelayMs | 247.8 | 242.9 | -4.9 | -2% | 247–250.2 | 239.6–247.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-fullread-5120kib | mainMaxDelayMs | 1.2 | 4.6 | 3.4 | 283.3% | 1–4.3 | 1.2–6.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-fullread-5120kib | inputLatencyMs | 206.1 | 204.9 | -1.2 | -0.6% | 203.3–207 | 204.7–207.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-fullread-5120kib | peakPssMb | 865.5 | 855.8 | -9.7 | -1.1% | 846.3–869 | 836.8–863.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | operationMs | 399.4 | 407.2 | 7.8 | 2% | 199.3–414.6 | 397.2–421.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | rendererMaxDelayMs | 57 | 66.7 | 9.7 | 17% | 56.6–57.3 | 62.5–66.9 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| xlsx-merge-32x32 | mainMaxDelayMs | 0.6 | 1.9 | 1.3 | 216.7% | 0.4–2.8 | 0.9–3.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | inputLatencyMs | 65.3 | 73.8 | 8.5 | 13% | 62.3–65.5 | 73.1–73.9 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| xlsx-merge-32x32 | peakPssMb | 704.2 | 719 | 14.8 | 2.1% | 701.5–705.8 | 715.3–720.5 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| xlsx-merge-128x128 | operationMs | 75 | 94.6 | 19.6 | 26.1% | 73.2–90.9 | 76.8–96 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | rendererMaxDelayMs | 27.4 | 10.1 | -17.3 | -63.1% | 8.1–29.3 | 9.5–11 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | mainMaxDelayMs | 0.4 | 0.4 | 0 | 0% | 0.2–0.8 | 0.3–3.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | inputLatencyMs | 8.4 | 2.9 | -5.5 | -65.5% | 8.2–9.3 | 1.6–10.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | peakPssMb | 701.7 | 715.7 | 14 | 2% | 699.6–703.9 | 712.9–717.5 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| xlsx-merge-300x300 | operationMs | 123.7 | 122.4 | -1.3 | -1.1% | 116.7–147.3 | 119.6–135.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | rendererMaxDelayMs | 30.9 | 34.6 | 3.7 | 12% | 30.8–38.2 | 31.8–36.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | mainMaxDelayMs | 0.7 | 0.6 | -0.1 | -14.3% | 0.3–0.9 | 0.3–1.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | inputLatencyMs | 14.1 | 9.6 | -4.5 | -31.9% | 9.4–15.2 | 7.9–10.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | peakPssMb | 746.3 | 760.1 | 13.8 | 1.8% | 743.6–749.6 | 758.5–762.3 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| xlsx-merge-400x500 | operationMs | 202.2 | 211.4 | 9.2 | 4.5% | 200.7–203 | 203–225.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | rendererMaxDelayMs | 67.2 | 64.8 | -2.4 | -3.6% | 62.6–81.2 | 63–66.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | mainMaxDelayMs | 0.7 | 2 | 1.3 | 185.7% | 0.6–2.2 | 0.7–2.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | inputLatencyMs | 56.5 | 50.4 | -6.1 | -10.8% | 51.5–70.4 | 50.1–50.8 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| xlsx-merge-400x500 | peakPssMb | 820.6 | 835 | 14.4 | 1.8% | 818.3–840.7 | 832.2–836.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | operationMs | 108.1 | 109.1 | 1 | 0.9% | 106.8–110 | 107.5–116.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | rendererMaxDelayMs | 67.9 | 68.5 | 0.6 | 0.9% | 58.6–69.6 | 65.8–69.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | mainMaxDelayMs | 0.3 | 0.4 | 0.1 | 33.3% | 0.2–3 | 0.3–0.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | inputLatencyMs | 19.7 | 20.8 | 1.1 | 5.6% | 19.7–20.7 | 18.4–21.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | peakPssMb | 828 | 844.8 | 16.8 | 2% | 826.4–849.7 | 842.6–846.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-8 | operationMs | 142.6 | 143.2 | 0.6 | 0.4% | 122.2–144.7 | 141.7–149.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-8 | rendererMaxDelayMs | 67.1 | 65 | -2.1 | -3.1% | 55.7–86.2 | 61.8–77.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-8 | mainMaxDelayMs | 0.3 | 7.1 | 6.8 | 2266.7% | 0.2–1.3 | 0.5–8.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-8 | inputLatencyMs | 13 | 12.4 | -0.6 | -4.6% | 7–40.1 | 11–18.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-8 | peakPssMb | 843.5 | 847.6 | 4.1 | 0.5% | 841.6–865 | 845.8–858.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-32 | operationMs | 271.5 | 268.2 | -3.3 | -1.2% | 270–293.4 | 252.8–272.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-32 | rendererMaxDelayMs | 71.3 | 73.3 | 2 | 2.8% | 66.6–75.2 | 63.7–73.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-32 | mainMaxDelayMs | 8.9 | 3.4 | -5.5 | -61.8% | 5.5–16.7 | 0.6–12.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-32 | inputLatencyMs | 28.9 | 32.9 | 4 | 13.8% | 6.1–35.7 | 22.7–37.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-32 | peakPssMb | 845.3 | 797.2 | -48.1 | -5.7% | 844.3–867.6 | 789.8–859.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | operationMs | 146.3 | 145.5 | -0.8 | -0.5% | 143.9–147.5 | 143.2–158.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | rendererMaxDelayMs | 34.7 | 34.6 | -0.1 | -0.3% | 33.6–35.7 | 34.2–35.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | mainMaxDelayMs | 0.6 | 0.6 | 0 | 0% | 0.5–0.7 | 0.6–0.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | inputLatencyMs | 22.8 | 25.5 | 2.7 | 11.8% | 22–24.6 | 20.9–27.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | peakPssMb | 699.5 | 712.3 | 12.8 | 1.8% | 664.5–703.2 | 711.9–715.7 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| docx-paragraphs-1000 | operationMs | 95.3 | 99.1 | 3.8 | 4% | 94.4–97 | 97.8–101.2 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| docx-paragraphs-1000 | rendererMaxDelayMs | 25.3 | 27.5 | 2.2 | 8.7% | 17.4–25.7 | 26.2–27.9 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| docx-paragraphs-1000 | mainMaxDelayMs | 0.4 | 0.3 | -0.1 | -25% | 0.3–0.5 | 0.3–0.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | inputLatencyMs | 12.6 | 15.5 | 2.9 | 23% | 5–13.6 | 13.5–15.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | peakPssMb | 699.5 | 711.8 | 12.3 | 1.8% | 664.5–702.8 | 707–711.9 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| docx-paragraphs-5000 | operationMs | 306.5 | 306.2 | -0.3 | -0.1% | 303.3–315.2 | 304.7–331.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | rendererMaxDelayMs | 143.5 | 132.4 | -11.1 | -7.7% | 134.7–263.1 | 130.2–140 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | mainMaxDelayMs | 0.6 | 0.8 | 0.2 | 33.3% | 0.6–1.3 | 0.8–0.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | inputLatencyMs | 153.4 | 120.7 | -32.7 | -21.3% | 108.4–160.9 | 103.6–151.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | peakPssMb | 783.4 | 798.7 | 15.3 | 2% | 755.5–784.4 | 796.8–798.9 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| docx-table-25x10 | operationMs | 46.7 | 69.7 | 23 | 49.3% | 41.7–98 | 56.8–90.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | rendererMaxDelayMs | 8.8 | 10 | 1.2 | 13.6% | 3.3–12.3 | 4.4–13.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | mainMaxDelayMs | 0.4 | 0.9 | 0.5 | 125% | 0.2–0.6 | 0.5–1.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | inputLatencyMs | 7.9 | 7.3 | -0.6 | -7.6% | 3.1–11 | 6.9–7.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | peakPssMb | 852.8 | 892.7 | 39.9 | 4.7% | 844.9–873.6 | 869.7–906.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | operationMs | 133.4 | 145.4 | 12 | 9% | 127.1–229.5 | 131.8–218.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | rendererMaxDelayMs | 87.8 | 93.5 | 5.7 | 6.5% | 87.7–89.3 | 89.2–94.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | mainMaxDelayMs | 1.2 | 3.4 | 2.2 | 183.3% | 0.7–3.3 | 1.2–3.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | inputLatencyMs | 74.2 | 76.3 | 2.1 | 2.8% | 71.3–74.8 | 71.7–78.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | peakPssMb | 881.2 | 921 | 39.8 | 4.5% | 871.1–904.8 | 897.3–935.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | operationMs | 736.9 | 748.2 | 11.3 | 1.5% | 722.3–745.9 | 745.7–798 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | rendererMaxDelayMs | 652.5 | 701.8 | 49.3 | 7.6% | 621.4–691.4 | 406.1–704.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | mainMaxDelayMs | 3.2 | 3.7 | 0.5 | 15.6% | 2.6–3.7 | 3.6–4.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | inputLatencyMs | 362.2 | 307.2 | -55 | -15.2% | 287.7–362.9 | 293.1–418.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | peakPssMb | 1036.5 | 1040 | 3.5 | 0.3% | 1021.1–1183.3 | 1025.3–1116.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| html-assets-1x256 | operationMs | 217.2 | 215.4 | -1.8 | -0.8% | 217.2–217.2 | 215.4–215.4 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | rendererMaxDelayMs | 19.4 | 8.8 | -10.6 | -54.6% | 19.4–19.4 | 8.8–8.8 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | mainMaxDelayMs | 1.3 | 3.9 | 2.6 | 200% | 1.3–1.3 | 3.9–3.9 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | inputLatencyMs | 13.7 | 14.6 | 0.9 | 6.6% | 13.7–13.7 | 14.6–14.6 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | peakPssMb | 680.8 | 755.4 | 74.6 | 11% | 680.8–680.8 | 755.4–755.4 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | operationMs | 353.2 | 365.2 | 12 | 3.4% | 353.2–353.2 | 365.2–365.2 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | rendererMaxDelayMs | 43.6 | 29.3 | -14.3 | -32.8% | 43.6–43.6 | 29.3–29.3 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | mainMaxDelayMs | 3 | 1.3 | -1.7 | -56.7% | 3–3 | 1.3–1.3 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | inputLatencyMs | 19.8 | 23.4 | 3.6 | 18.2% | 19.8–19.8 | 23.4–23.4 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | peakPssMb | 697 | 769.3 | 72.3 | 10.4% | 697–697 | 769.3–769.3 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | operationMs | 2156.5 | 2160.5 | 4 | 0.2% | 2156.5–2156.5 | 2160.5–2160.5 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | rendererMaxDelayMs | 437.1 | 448.5 | 11.4 | 2.6% | 437.1–437.1 | 448.5–448.5 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | mainMaxDelayMs | 5.3 | 14.9 | 9.6 | 181.1% | 5.3–5.3 | 14.9–14.9 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | inputLatencyMs | 183.4 | 173.8 | -9.6 | -5.2% | 183.4–183.4 | 173.8–173.8 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | peakPssMb | 892.9 | 896.3 | 3.4 | 0.4% | 892.9–892.9 | 896.3–896.3 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | operationMs | 391.7 | 398.1 | 6.4 | 1.6% | 391.7–391.7 | 398.1–398.1 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | rendererMaxDelayMs | 43 | 42.8 | -0.2 | -0.5% | 43–43 | 42.8–42.8 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | mainMaxDelayMs | 3.3 | 2.4 | -0.9 | -27.3% | 3.3–3.3 | 2.4–2.4 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | inputLatencyMs | 1.6 | 1.5 | -0.1 | -6.2% | 1.6–1.6 | 1.5–1.5 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | peakPssMb | 852.7 | 863.7 | 11 | 1.3% | 852.7–852.7 | 863.7–863.7 | 1 (1/0) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| path-list-1000 | operationMs | 135.3 | 132.2 | -3.1 | -2.3% | 133–140.2 | 128.5–132.5 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-1000 | rendererMaxDelayMs | 116.6 | 113.7 | -2.9 | -2.5% | 114.5–121.1 | 107.1–113.8 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-1000 | mainMaxDelayMs | 1.5 | 0.7 | -0.8 | -53.3% | 0.5–1.6 | 0.5–0.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-1000 | inputLatencyMs | 73.4 | 70.5 | -2.9 | -4% | 71.6–78.2 | 62.1–70.8 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-1000 | peakPssMb | 706 | 673.2 | -32.8 | -4.6% | 671.8–706.4 | 664.4–718.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-10000 | operationMs | 1160.6 | 1102.8 | -57.8 | -5% | 1158.7–1165.5 | 1077.3–1103 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-10000 | rendererMaxDelayMs | 1138.9 | 1075.4 | -63.5 | -5.6% | 1137.2–1143.5 | 1060–1094.3 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-10000 | mainMaxDelayMs | 0.8 | 1.3 | 0.5 | 62.5% | 0.6–1.8 | 0.6–1.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-10000 | inputLatencyMs | 1084.3 | 1015.7 | -68.6 | -6.3% | 1075.6–1086 | 997.1–1022.4 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-10000 | peakPssMb | 958.2 | 916.3 | -41.9 | -4.4% | 924.3–958.5 | 915.3–924 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | operationMs | 3397.8 | 2098.7 | -1299.1 | -38.2% | 3354.4–4258.9 | 2098.4–2149.6 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | rendererMaxDelayMs | 3377 | 2061.2 | -1315.8 | -39% | 3340.1–4253.7 | 2060–2134.1 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | mainMaxDelayMs | 1.8 | 0.6 | -1.2 | -66.7% | 0.6–2.6 | 0.5–1.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-20000 | inputLatencyMs | 3266 | 1969.2 | -1296.8 | -39.7% | 3233.2–4129.4 | 1949.1–2027.2 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | peakPssMb | 1378.4 | 1339.4 | -39 | -2.8% | 1363.8–1386.9 | 1339.2–1346.2 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| large-diff-500 | operationMs | 60.6 | 63.1 | 2.5 | 4.1% | 59.5–76.6 | 59.9–75.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-500 | rendererMaxDelayMs | 9.9 | 4.8 | -5.1 | -51.5% | 5.6–17.9 | 4.5–6.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-500 | mainMaxDelayMs | 0.6 | 0.6 | 0 | 0% | 0.5–0.6 | 0.6–0.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-500 | inputLatencyMs | 4.7 | 4 | -0.7 | -14.9% | 2.8–7.8 | 2.8–4.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-500 | peakPssMb | 699.6 | 711.9 | 12.3 | 1.8% | 695.9–701.6 | 632.2–716 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-5000 | operationMs | 127.7 | 133.5 | 5.8 | 4.5% | 126.2–149.8 | 129.7–133.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-5000 | rendererMaxDelayMs | 0.9 | 7.8 | 6.9 | 766.7% | 0.1–6.8 | 1.7–8.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-5000 | mainMaxDelayMs | 0.3 | 0.6 | 0.3 | 100% | 0.3–1.2 | 0.3–1.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-5000 | inputLatencyMs | 2.1 | 1.8 | -0.3 | -14.3% | 2–2.5 | 1.5–2.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-5000 | peakPssMb | 716.3 | 727.1 | 10.8 | 1.5% | 711.9–717.6 | 645.4–730.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-20000 | operationMs | 1057 | 1059 | 2 | 0.2% | 1055.5–1059.5 | 1051.7–1082.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-20000 | rendererMaxDelayMs | 14.2 | 12.6 | -1.6 | -11.3% | 5.5–16.1 | 10.4–12.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-20000 | mainMaxDelayMs | 3.7 | 6.9 | 3.2 | 86.5% | 1.8–10.4 | 4.4–7.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-20000 | inputLatencyMs | 2.4 | 2 | -0.4 | -16.7% | 1.7–2.7 | 1.9–3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-20000 | peakPssMb | 719.5 | 730.6 | 11.1 | 1.5% | 717.6–723.2 | 648.2–732.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| background-index-large-history | operationMs | 3187.9 | 3207.6 | 19.7 | 0.6% | 3182–3201.6 | 3204.1–3219.2 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| background-index-large-history | rendererMaxDelayMs | 13.8 | 11.8 | -2 | -14.5% | 13.5–14.1 | 8–14.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| background-index-large-history | mainMaxDelayMs | 0.5 | 0.5 | 0 | 0% | 0.5–0.7 | 0.4–3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| background-index-large-history | inputLatencyMs | 1.7 | 1.6 | -0.1 | -5.9% | 1.5–1.8 | 1.6–1.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| background-index-large-history | peakPssMb | 714.6 | 743.3 | 28.7 | 4% | 706–717.7 | 739.1–745.2 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| image-png-1024x768 | operationMs | 138.4 | 146.8 | 8.4 | 6.1% | 138.2–153.6 | 118.5–150.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-1024x768 | rendererMaxDelayMs | 51.1 | 46.1 | -5 | -9.8% | 34.5–51.9 | 33.5–50.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-1024x768 | mainMaxDelayMs | 3.3 | 1.3 | -2 | -60.6% | 2.4–3.6 | 1.3–3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-1024x768 | inputLatencyMs | 30.9 | 30.6 | -0.3 | -1% | 25.5–36.4 | 26.5–35 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-1024x768 | peakPssMb | 785.9 | 783.4 | -2.5 | -0.3% | 776.5–788.9 | 777.5–798.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | operationMs | 152.7 | 153.3 | 0.6 | 0.4% | 131.9–155.8 | 132.2–156.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | rendererMaxDelayMs | 34.7 | 43.3 | 8.6 | 24.8% | 33.8–35 | 32.2–53.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | mainMaxDelayMs | 2.4 | 6.2 | 3.8 | 158.3% | 1.8–3.9 | 3.6–11.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | inputLatencyMs | 17.9 | 4.5 | -13.4 | -74.9% | 2.5–20 | 3.8–17.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | peakPssMb | 833.1 | 893.4 | 60.3 | 7.2% | 817.1–988.5 | 862.3–897.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | operationMs | 405.5 | 481.4 | 75.9 | 18.7% | 401.6–413.7 | 405.1–482.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | rendererMaxDelayMs | 132.7 | 107.2 | -25.5 | -19.2% | 71.3–147.9 | 85.3–144.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | mainMaxDelayMs | 12.6 | 6.9 | -5.7 | -45.2% | 3.4–14.9 | 6.6–11.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | inputLatencyMs | 52.6 | 58.1 | 5.5 | 10.5% | 51.4–68.2 | 53–66.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | peakPssMb | 1288.2 | 1235 | -53.2 | -4.1% | 1214.3–1301.1 | 1223.6–1256.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | operationMs | 70.3 | 68.6 | -1.7 | -2.4% | 54.7–71.1 | 62.3–100.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | rendererMaxDelayMs | 15 | 14.6 | -0.4 | -2.7% | 10.9–16.4 | 12.7–21.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | mainMaxDelayMs | 3.4 | 3.4 | 0 | 0% | 2.6–3.5 | 2.5–3.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | inputLatencyMs | 3 | 2.6 | -0.4 | -13.3% | 2.6–3.4 | 1.8–3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | peakPssMb | 744.1 | 797.8 | 53.7 | 7.2% | 710.4–769 | 785.5–801.9 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| image-jpeg-2048x1536 | operationMs | 70.9 | 80 | 9.1 | 12.8% | 50.8–73.8 | 79.3–102.1 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| image-jpeg-2048x1536 | rendererMaxDelayMs | 12.3 | 15.4 | 3.1 | 25.2% | 10.6–15.5 | 9.8–16.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | mainMaxDelayMs | 2.7 | 4.9 | 2.2 | 81.5% | 0.7–3.3 | 3.3–5.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | inputLatencyMs | 1.8 | 3.5 | 1.7 | 94.4% | 1.7–5.4 | 2.6–4.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | peakPssMb | 810.7 | 845.2 | 34.5 | 4.3% | 796.1–840.2 | 832.9–850.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | operationMs | 149.2 | 139.8 | -9.4 | -6.3% | 148.8–164.9 | 134.2–143.8 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| image-jpeg-4096x3072 | rendererMaxDelayMs | 32.7 | 68.8 | 36.1 | 110.4% | 29.7–41 | 25.3–74.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | mainMaxDelayMs | 3.9 | 0.9 | -3 | -76.9% | 3.3–6.3 | 0.8–6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | inputLatencyMs | 5.1 | 22.9 | 17.8 | 349% | 1.9–21 | 2–33.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | peakPssMb | 1165.2 | 1156.9 | -8.3 | -0.7% | 1142–1176.4 | 1125.6–1182.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | operationMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
| image-jpeg-original-wealth-game | rendererMaxDelayMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
| image-jpeg-original-wealth-game | mainMaxDelayMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
| image-jpeg-original-wealth-game | inputLatencyMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
| image-jpeg-original-wealth-game | peakPssMb | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
