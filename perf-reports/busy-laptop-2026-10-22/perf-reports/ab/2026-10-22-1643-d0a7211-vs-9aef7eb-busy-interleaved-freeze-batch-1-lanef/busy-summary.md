# Old vs new — busy machine, exploratory — interleaved design

> **Busy machine, exploratory.** Measured without waiting for a quiet machine; other programs were using the CPU the whole time (see Foreign load). This is NOT a clean/strict comparison (the strict path in `compare.mjs` still refuses such reports). Reliability comes from the design: runs alternate order every round so background load hits both sides alike, each side is judged on its median and range over several runs, and an A/A run shows what "no change" looks like here.

- Side A (old): `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded-A`
- Side B (new): `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded`
- Rounds: 3, order alternates every round: A,B,B,A…
- A/A noise used: none — verdicts use the range rule only

## Verdict rule (conservative)

B is called **faster/slower** only when ALL hold: (1) at least 3 measured runs on each side; (2) the two sides' min–max ranges do not overlap; (3) |median B − median A| exceeds the A/A noise for that metric (when an A/A run exists). Otherwise **no clear difference**. A side with no measured run is **not measured (reason)** — a failed or missing row is never counted as zero. Lower is better for every metric.

## Counts

- no clear difference: 201
- B slower: 8
- B faster: 11

## Foreign load observed (other programs, from the per-window interference watch)

- Windows watched: 84; verdicts: 45 clean, 39 disturbed, 0 unknown
- Foreign cores in use: median 0.9, max 2.4 (window averages)
- Side A windows: 44, median 1.3 cores, max 2.4 · Side B windows: 40, median 0.6 cores, max 1.5 (similar numbers mean the interleaving spread the load evenly)
- Top offenders (mean cores while present / max): git 0.7/1 (53 windows); chrome 0.1/0.6 (82 windows); claude 0.1/0.2 (84 windows); node-MainThread 0.1/0.5 (83 windows); youcoded 0.1/0.4 (16 windows); plasma-keyboard 0.1/0.2 (3 windows)

## Runs

| round | slot | side | exit | incomplete notes | report | problem |
|---|---|---|---|---|---|---|
| 1 | 1 | A | 4 | 15 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-1643-d0a7211-vs-9aef7eb-busy-interleaved-freeze-batch-1-lanef/2026-10-22-1643-d0a7211-r1-a.json` |  |
| 1 | 2 | B | 4 | 5 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-1643-d0a7211-vs-9aef7eb-busy-interleaved-freeze-batch-1-lanef/2026-10-22-1649-9aef7eb-r1-b.json` |  |
| 2 | 1 | B | 4 | 7 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-1643-d0a7211-vs-9aef7eb-busy-interleaved-freeze-batch-1-lanef/2026-10-22-1654-9aef7eb-r2-b.json` |  |
| 2 | 2 | A | 4 | 15 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-1643-d0a7211-vs-9aef7eb-busy-interleaved-freeze-batch-1-lanef/2026-10-22-1658-d0a7211-r2-a.json` |  |
| 3 | 1 | A | 4 | 10 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-1643-d0a7211-vs-9aef7eb-busy-interleaved-freeze-batch-1-lanef/2026-10-22-1703-d0a7211-r3-a.json` |  |
| 3 | 2 | B | 4 | 11 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-1643-d0a7211-vs-9aef7eb-busy-interleaved-freeze-batch-1-lanef/2026-10-22-1709-9aef7eb-r3-b.json` |  |

## Differences found

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A | n B | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| csv-wide-256kib | peakPssMb | 809.8 | 819.1 | 9.3 | 1.1% | 809.4–810.3 | 812.7–843 | 3 | 3 | B slower |
| csv-wide-1024kib | operationMs | 145.8 | 111.2 | -34.6 | -23.7% | 116.4–145.9 | 109.3–114.9 | 3 | 3 | B faster |
| csv-wide-1024kib | rendererMaxDelayMs | 102 | 91.2 | -10.8 | -10.6% | 97.5–107.4 | 90.5–93.7 | 3 | 3 | B faster |
| csv-wide-1024kib | inputLatencyMs | 28 | 22 | -6 | -21.4% | 28–40.6 | 21.8–25.5 | 3 | 3 | B faster |
| docx-paragraphs-1000 | operationMs | 138.5 | 99.7 | -38.8 | -28% | 109.3–141.7 | 99–106.7 | 3 | 3 | B faster |
| docx-paragraphs-5000 | inputLatencyMs | 122.6 | 169 | 46.4 | 37.8% | 112.8–129.6 | 157–170.3 | 3 | 3 | B slower |
| docx-paragraphs-5000 | peakPssMb | 802.3 | 814.7 | 12.4 | 1.5% | 773–803.3 | 812.4–816 | 3 | 3 | B slower |
| docx-table-1000x10 | operationMs | 857.8 | 881.3 | 23.5 | 2.7% | 854–861.6 | 864.7–897.1 | 3 | 3 | B slower |
| path-list-10000 | operationMs | 1210.4 | 1152.4 | -58 | -4.8% | 1202.4–1214.9 | 1123.3–1196.9 | 3 | 3 | B faster |
| path-list-10000 | rendererMaxDelayMs | 1189.3 | 1129.6 | -59.7 | -5% | 1173.8–1194.2 | 1107.6–1147.9 | 3 | 3 | B faster |
| path-list-10000 | inputLatencyMs | 1116.1 | 1052 | -64.1 | -5.7% | 1110.2–1125.3 | 1033.2–1092.8 | 3 | 3 | B faster |
| path-list-20000 | operationMs | 3701.9 | 2353.6 | -1348.3 | -36.4% | 3671.4–3751.8 | 2344.9–2375.7 | 3 | 3 | B faster |
| path-list-20000 | rendererMaxDelayMs | 3695.2 | 2322.6 | -1372.6 | -37.1% | 3668.9–3707.3 | 2287.9–2384.4 | 3 | 3 | B faster |
| path-list-20000 | inputLatencyMs | 3529 | 2197 | -1332 | -37.7% | 3512.1–3546.4 | 2164.1–2219.8 | 3 | 3 | B faster |
| large-diff-500 | rendererMaxDelayMs | 13.6 | 29.9 | 16.3 | 119.9% | 9.6–16.4 | 18.8–33.6 | 3 | 3 | B slower |
| large-diff-5000 | mainMaxDelayMs | 0.8 | 0.6 | -0.2 | -25% | 0.8–0.9 | 0.6–0.7 | 3 | 3 | B faster |
| background-index-large-history | rendererMaxDelayMs | 11.4 | 13.8 | 2.4 | 21.1% | 11.4–12.6 | 13.5–14.4 | 3 | 3 | B slower |
| image-png-2048x1536 | peakPssMb | 873.3 | 890.4 | 17.1 | 2% | 842.4–876.6 | 883.5–993.5 | 3 | 3 | B slower |
| image-png-4096x3072 | peakPssMb | 1227.1 | 1271.4 | 44.3 | 3.6% | 1149.7–1242.4 | 1248.6–1272.1 | 3 | 3 | B slower |

## Every rung and metric

n = measured runs (clean/disturbed windows). Times in ms, memory in MiB.

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A (clean/dist) | n B (clean/dist) | verdict | note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| csv-rows-64kib | operationMs | 129.9 | 128.1 | -1.8 | -1.4% | 129.2–142.7 | 127.8–130.8 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-64kib | rendererMaxDelayMs | 87.8 | 66.6 | -21.2 | -24.1% | 70.9–92 | 66.3–74.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-64kib | mainMaxDelayMs | 2.3 | 2.3 | 0 | 0% | 1.7–5.4 | 2–3.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-64kib | inputLatencyMs | 33 | 31.9 | -1.1 | -3.3% | 25.8–35.1 | 23.4–32.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-64kib | peakPssMb | 710.9 | 711.2 | 0.3 | 0% | 706.2–712.8 | 656.2–718.3 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-256kib | operationMs | 99.4 | 98.2 | -1.2 | -1.2% | 97–103.8 | 95.7–101.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-256kib | rendererMaxDelayMs | 71.6 | 68.7 | -2.9 | -4.1% | 67.7–81.6 | 46.5–78.7 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-256kib | mainMaxDelayMs | 1.1 | 0.8 | -0.3 | -27.3% | 0.3–3.7 | 0.5–3.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-256kib | inputLatencyMs | 8.7 | 12 | 3.3 | 37.9% | 2.7–13.9 | 5.9–27.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-256kib | peakPssMb | 712.2 | 711.6 | -0.6 | -0.1% | 712–735.6 | 655.4–720.3 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-1024kib | operationMs | 145.5 | 145.8 | 0.3 | 0.2% | 113.4–157.8 | 118.3–158.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-1024kib | rendererMaxDelayMs | 92.6 | 92.4 | -0.2 | -0.2% | 71.2–97.7 | 87–93.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-1024kib | mainMaxDelayMs | 6 | 2.3 | -3.7 | -61.7% | 1.8–9.8 | 1–13.7 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-1024kib | inputLatencyMs | 30.1 | 34.5 | 4.4 | 14.6% | 29.6–36.7 | 34.1–43.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-1024kib | peakPssMb | 744.6 | 722.8 | -21.8 | -2.9% | 735.5–764.5 | 687.3–767.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-3072kib | operationMs | 195.2 | 213.1 | 17.9 | 9.2% | 150.3–209.1 | 203.5–215.6 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-3072kib | rendererMaxDelayMs | 147.4 | 141.4 | -6 | -4.1% | 139.7–151.4 | 135.8–158.8 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-3072kib | mainMaxDelayMs | 3.6 | 4.7 | 1.1 | 30.6% | 3.6–4.5 | 2.8–5.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-3072kib | inputLatencyMs | 94 | 83.5 | -10.5 | -11.2% | 73.9–107.4 | 80.9–99.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-rows-3072kib | peakPssMb | 794.2 | 805.7 | 11.5 | 1.4% | 787.4–809 | 759.3–809.6 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-64kib | operationMs | 99.2 | 105.2 | 6 | 6% | 93.2–144.8 | 96.2–112.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-64kib | rendererMaxDelayMs | 68.7 | 66.4 | -2.3 | -3.3% | 65.6–98.3 | 64–70.6 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-64kib | mainMaxDelayMs | 0.7 | 0.9 | 0.2 | 28.6% | 0.5–4 | 0.3–4.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-64kib | inputLatencyMs | 5.3 | 8.8 | 3.5 | 66% | 4–18.6 | 4.8–11.6 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-64kib | peakPssMb | 793.4 | 800.6 | 7.2 | 0.9% | 792.2–803.5 | 793.7–804.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-256kib | operationMs | 113.4 | 110.5 | -2.9 | -2.6% | 101.3–117.4 | 104–110.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-256kib | rendererMaxDelayMs | 91 | 80.4 | -10.6 | -11.6% | 75.5–98.5 | 77–83.1 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-256kib | mainMaxDelayMs | 0.6 | 3.4 | 2.8 | 466.7% | 0.3–4.4 | 0.3–3.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-256kib | inputLatencyMs | 18.9 | 11.7 | -7.2 | -38.1% | 7.1–22.7 | 11–14.7 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-256kib | peakPssMb | 809.8 | 819.1 | 9.3 | 1.1% | 809.4–810.3 | 812.7–843 | 3 (1/2) | 3 (2/1) | B slower | ranges separate; no A/A noise available |
| csv-wide-1024kib | operationMs | 145.8 | 111.2 | -34.6 | -23.7% | 116.4–145.9 | 109.3–114.9 | 3 (1/2) | 3 (2/1) | B faster | ranges separate; no A/A noise available |
| csv-wide-1024kib | rendererMaxDelayMs | 102 | 91.2 | -10.8 | -10.6% | 97.5–107.4 | 90.5–93.7 | 3 (1/2) | 3 (2/1) | B faster | ranges separate; no A/A noise available |
| csv-wide-1024kib | mainMaxDelayMs | 2.2 | 3.2 | 1 | 45.5% | 0.7–4.3 | 0.7–3.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-1024kib | inputLatencyMs | 28 | 22 | -6 | -21.4% | 28–40.6 | 21.8–25.5 | 3 (1/2) | 3 (2/1) | B faster | ranges separate; no A/A noise available |
| csv-wide-1024kib | peakPssMb | 829.5 | 840.2 | 10.7 | 1.3% | 827.2–852.9 | 833.2–867.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-3072kib | operationMs | 162.8 | 162.7 | -0.1 | -0.1% | 158.2–165.3 | 150.3–176.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-3072kib | rendererMaxDelayMs | 128.9 | 127.6 | -1.3 | -1% | 124.2–142.9 | 122.7–133.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-3072kib | mainMaxDelayMs | 3.4 | 4.7 | 1.3 | 38.2% | 2.4–4.6 | 0.8–4.8 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-3072kib | inputLatencyMs | 67.7 | 64.4 | -3.3 | -4.9% | 60.2–69.6 | 58.8–68.3 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-wide-3072kib | peakPssMb | 842 | 842.7 | 0.7 | 0.1% | 784.2–863.7 | 839.1–902.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-64kib | operationMs | 93 | 93.8 | 0.8 | 0.9% | 88.5–97.8 | 90.9–97.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-64kib | rendererMaxDelayMs | 52 | 56.5 | 4.5 | 8.7% | 32.8–53.5 | 50.6–58.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-64kib | mainMaxDelayMs | 2.4 | 0.8 | -1.6 | -66.7% | 0.5–4.3 | 0.3–1.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-64kib | inputLatencyMs | 3.1 | 18.2 | 15.1 | 487.1% | 2.2–5.9 | 4.7–19.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-64kib | peakPssMb | 810.6 | 816.9 | 6.3 | 0.8% | 766.5–875.9 | 766–925 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-256kib | operationMs | 96.9 | 95.6 | -1.3 | -1.3% | 93.4–101 | 92.2–101.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-256kib | rendererMaxDelayMs | 64.1 | 63.6 | -0.5 | -0.8% | 60.2–73.1 | 62.5–72 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-256kib | mainMaxDelayMs | 0.6 | 0.5 | -0.1 | -16.7% | 0.5–3.1 | 0.5–3.7 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-256kib | inputLatencyMs | 6.1 | 9.4 | 3.3 | 54.1% | 5.3–11 | 7.5–16 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-256kib | peakPssMb | 806.5 | 778.1 | -28.4 | -3.5% | 767.9–890.4 | 770–939.1 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-1024kib | operationMs | 98.4 | 108.8 | 10.4 | 10.6% | 94.6–101.6 | 100.8–110 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-1024kib | rendererMaxDelayMs | 76.2 | 83.4 | 7.2 | 9.4% | 71.4–76.8 | 73.5–92.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-1024kib | mainMaxDelayMs | 3 | 0.6 | -2.4 | -80% | 0.4–3.8 | 0.4–3 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-1024kib | inputLatencyMs | 17.1 | 20.4 | 3.3 | 19.3% | 16–17.3 | 16.9–21.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-1024kib | peakPssMb | 809.3 | 781.7 | -27.6 | -3.4% | 771–913.7 | 774–959.8 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-3072kib | operationMs | 142.7 | 147.9 | 5.2 | 3.6% | 134.9–149.2 | 133.4–152.1 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-3072kib | rendererMaxDelayMs | 101.6 | 106.9 | 5.3 | 5.2% | 101.2–115.2 | 105.4–117.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-3072kib | mainMaxDelayMs | 4.4 | 3.9 | -0.5 | -11.4% | 2.2–5.5 | 1.1–4.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-3072kib | inputLatencyMs | 42.2 | 51.4 | 9.2 | 21.8% | 42.1–55.9 | 51.1–54.3 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-quoted-3072kib | peakPssMb | 830.2 | 807.2 | -23 | -2.8% | 797.1–910.4 | 797.6–1010.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| csv-fullread-5120kib | operationMs | 594.8 | 580.2 | -14.6 | -2.5% | 561.4–611.4 | 560.4–600 | 3 (1/2) | 2 (2/0) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| csv-fullread-5120kib | rendererMaxDelayMs | 281 | 263.9 | -17.1 | -6.1% | 278.2–290.4 | 247.1–280.6 | 3 (1/2) | 2 (2/0) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| csv-fullread-5120kib | mainMaxDelayMs | 3 | 3.8 | 0.8 | 26.7% | 1.5–5.5 | 2.9–4.6 | 3 (1/2) | 2 (2/0) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| csv-fullread-5120kib | inputLatencyMs | 235.5 | 224.4 | -11.1 | -4.7% | 233.4–248.1 | 222.6–226.1 | 3 (1/2) | 2 (2/0) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| csv-fullread-5120kib | peakPssMb | 860.5 | 830.5 | -30 | -3.5% | 851.7–872.3 | 808.2–852.7 | 3 (1/2) | 2 (2/0) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| xlsx-merge-32x32 | operationMs | 241.5 | 430.4 | 188.9 | 78.2% | 231.1–476.3 | 254.9–445.6 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | rendererMaxDelayMs | 75.6 | 66.6 | -9 | -11.9% | 69.5–84.7 | 64–75.5 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | mainMaxDelayMs | 2.9 | 2.8 | -0.1 | -3.4% | 1.7–5.1 | 0.8–4.8 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | inputLatencyMs | 56.5 | 52.8 | -3.7 | -6.5% | 38.9–80.1 | 44.7–79.3 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | peakPssMb | 707.9 | 710.7 | 2.8 | 0.4% | 705.3–717.5 | 700.9–712.8 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | operationMs | 95 | 97.1 | 2.1 | 2.2% | 93.3–95.9 | 91.3–97.2 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | rendererMaxDelayMs | 5.3 | 11.4 | 6.1 | 115.1% | 5.1–19.5 | 5.8–20.6 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | mainMaxDelayMs | 0.8 | 3.6 | 2.8 | 350% | 0.5–4.3 | 0.3–4.5 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | inputLatencyMs | 4.8 | 7.7 | 2.9 | 60.4% | 2.1–7.1 | 2.5–12.9 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | peakPssMb | 711.9 | 714.1 | 2.2 | 0.3% | 707.9–715.6 | 705.9–717.9 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | operationMs | 139.5 | 143.1 | 3.6 | 2.6% | 132.9–142.9 | 142.1–144.3 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | rendererMaxDelayMs | 39.2 | 38.7 | -0.5 | -1.3% | 27.4–43.9 | 37.2–39.5 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | mainMaxDelayMs | 4.4 | 2.2 | -2.2 | -50% | 1–7 | 0.5–4.7 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | inputLatencyMs | 22.3 | 21.2 | -1.1 | -4.9% | 17.2–29.5 | 7.4–23.7 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | peakPssMb | 713.6 | 751.4 | 37.8 | 5.3% | 711–766.4 | 719.5–759.9 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | operationMs | 244.4 | 244.2 | -0.2 | -0.1% | 238.5–281.7 | 206.6–247.9 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | rendererMaxDelayMs | 92.8 | 86.7 | -6.1 | -6.6% | 79.4–94.3 | 74.7–89.9 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | mainMaxDelayMs | 3.6 | 2.5 | -1.1 | -30.6% | 1.3–8.7 | 1.4–2.8 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | inputLatencyMs | 62 | 58.6 | -3.4 | -5.5% | 53–70.4 | 50.5–64.8 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | peakPssMb | 780.7 | 780.8 | 0.1 | 0% | 776.8–797.8 | 779.3–835.2 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-1 | operationMs | 103.9 | 111.7 | 7.8 | 7.5% | 103.8–106.4 | 103.1–114.8 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-1 | rendererMaxDelayMs | 71 | 72.7 | 1.7 | 2.4% | 70–73.3 | 70.9–78.8 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-1 | mainMaxDelayMs | 1.7 | 2.4 | 0.7 | 41.2% | 0.5–2.8 | 0.5–17.1 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-1 | inputLatencyMs | 21.5 | 21.5 | 0 | 0% | 20.8–21.6 | 19.6–29.5 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-1 | peakPssMb | 775.5 | 787.3 | 11.8 | 1.5% | 771.6–799.9 | 779.4–828 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-8 | operationMs | 143.5 | 145.7 | 2.2 | 1.5% | 142.1–155.2 | 144.3–147.5 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-8 | rendererMaxDelayMs | 68.1 | 72.4 | 4.3 | 6.3% | 65.4–75.6 | 66.3–80.1 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-8 | mainMaxDelayMs | 1 | 1.6 | 0.6 | 60% | 0.7–4.1 | 0.8–3.8 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-8 | inputLatencyMs | 13.7 | 9 | -4.7 | -34.3% | 7.9–48.1 | 5.2–11.2 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-8 | peakPssMb | 788.5 | 791.9 | 3.4 | 0.4% | 784.9–814.4 | 765.9–800.7 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-32 | operationMs | 268.8 | 250.9 | -17.9 | -6.7% | 246–315.1 | 241.2–254.1 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-32 | rendererMaxDelayMs | 75.6 | 74.8 | -0.8 | -1.1% | 67.7–76.9 | 67.6–84.5 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-32 | mainMaxDelayMs | 2.9 | 4.8 | 1.9 | 65.5% | 0.5–3.5 | 1.3–4.9 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-32 | inputLatencyMs | 28 | 14.8 | -13.2 | -47.1% | 8.6–30.6 | 6.9–20.8 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| xlsx-sheets-32 | peakPssMb | 803.7 | 807.1 | 3.4 | 0.4% | 800.4–830.1 | 781.1–818.8 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| docx-paragraphs-100 | operationMs | 147.3 | 181.4 | 34.1 | 23.2% | 130.3–166.7 | 141.6–183.8 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | rendererMaxDelayMs | 34.2 | 29 | -5.2 | -15.2% | 31.6–35.9 | 28.6–32.6 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | mainMaxDelayMs | 0.4 | 0.5 | 0.1 | 25% | 0.3–0.9 | 0.3–3.8 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | inputLatencyMs | 32.3 | 33.7 | 1.4 | 4.3% | 17.2–36.2 | 32.8–37.4 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | peakPssMb | 705.9 | 706.6 | 0.7 | 0.1% | 704.7–706.1 | 703.6–707.2 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | operationMs | 138.5 | 99.7 | -38.8 | -28% | 109.3–141.7 | 99–106.7 | 3 (0/3) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| docx-paragraphs-1000 | rendererMaxDelayMs | 29.7 | 25.4 | -4.3 | -14.5% | 16.5–34 | 21.3–31.1 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | mainMaxDelayMs | 2.7 | 3 | 0.3 | 11.1% | 0.6–3.9 | 0.5–4.7 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | inputLatencyMs | 14.4 | 12.6 | -1.8 | -12.5% | 13.9–23 | 7.2–14.6 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | peakPssMb | 708 | 723.3 | 15.3 | 2.2% | 706.6–722.4 | 702.8–726 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | operationMs | 345.6 | 345.3 | -0.3 | -0.1% | 292.5–350.2 | 342.4–349.2 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | rendererMaxDelayMs | 148.5 | 157.1 | 8.6 | 5.8% | 123–287.5 | 156.5–160.3 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | mainMaxDelayMs | 4 | 1.1 | -2.9 | -72.5% | 1.1–7.4 | 0.8–4.3 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | inputLatencyMs | 122.6 | 169 | 46.4 | 37.8% | 112.8–129.6 | 157–170.3 | 3 (0/3) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| docx-paragraphs-5000 | peakPssMb | 802.3 | 814.7 | 12.4 | 1.5% | 773–803.3 | 812.4–816 | 3 (0/3) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| docx-table-25x10 | operationMs | 68.3 | 93.7 | 25.4 | 37.2% | 43.8–102.9 | 56.6–98.6 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | rendererMaxDelayMs | 12.3 | 15 | 2.7 | 22% | 12.2–25.1 | 9.7–18.9 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | mainMaxDelayMs | 2.9 | 2 | -0.9 | -31% | 2.3–3.6 | 0.3–2.3 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | inputLatencyMs | 12.1 | 8.2 | -3.9 | -32.2% | 7.7–13.1 | 6.6–9.7 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | peakPssMb | 883.6 | 884 | 0.4 | 0% | 828.5–897.2 | 823.9–890.7 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | operationMs | 244.1 | 145.4 | -98.7 | -40.4% | 242.7–260.3 | 141.9–245.4 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | rendererMaxDelayMs | 95.4 | 97.6 | 2.2 | 2.3% | 94.6–99.6 | 89.2–187 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | mainMaxDelayMs | 3.6 | 3.8 | 0.2 | 5.6% | 3.1–3.8 | 2.4–5.1 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | inputLatencyMs | 87.9 | 87.7 | -0.2 | -0.2% | 85.7–92.9 | 78.1–96.1 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | peakPssMb | 838.3 | 832.9 | -5.4 | -0.6% | 815–854.1 | 830.3–890.7 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | operationMs | 857.8 | 881.3 | 23.5 | 2.7% | 854–861.6 | 864.7–897.1 | 3 (0/3) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| docx-table-1000x10 | rendererMaxDelayMs | 734.5 | 700.7 | -33.8 | -4.6% | 713–800 | 693.1–818 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | mainMaxDelayMs | 2 | 5.4 | 3.4 | 170% | 0.7–3.7 | 3.6–5.7 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | inputLatencyMs | 446.2 | 442.1 | -4.1 | -0.9% | 444.2–451.9 | 337.2–454.4 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | peakPssMb | 1080.4 | 975.2 | -105.2 | -9.7% | 997.8–1146.1 | 954.7–1143 | 3 (0/3) | 3 (3/0) | no clear difference | ranges overlap |
| html-assets-1x256 | operationMs | 288.1 | 250.3 | -37.8 | -13.1% | 288.1–288.1 | 250.3–250.3 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | rendererMaxDelayMs | 31.5 | 34.2 | 2.7 | 8.6% | 31.5–31.5 | 34.2–34.2 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | mainMaxDelayMs | 1 | 6.1 | 5.1 | 510% | 1–1 | 6.1–6.1 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | inputLatencyMs | 14.8 | 19.4 | 4.6 | 31.1% | 14.8–14.8 | 19.4–19.4 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | peakPssMb | 726.9 | 736.2 | 9.3 | 1.3% | 726.9–726.9 | 736.2–736.2 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | operationMs | 441.8 | 447 | 5.2 | 1.2% | 441.8–441.8 | 447–447 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | rendererMaxDelayMs | 52.5 | 55.7 | 3.2 | 6.1% | 52.5–52.5 | 55.7–55.7 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | mainMaxDelayMs | 3.8 | 3.5 | -0.3 | -7.9% | 3.8–3.8 | 3.5–3.5 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | inputLatencyMs | 20.3 | 19.1 | -1.2 | -5.9% | 20.3–20.3 | 19.1–19.1 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | peakPssMb | 761.6 | 763.1 | 1.5 | 0.2% | 761.6–761.6 | 763.1–763.1 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | operationMs | 2590.1 | 2556.3 | -33.8 | -1.3% | 2590.1–2590.1 | 2556.3–2556.3 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | rendererMaxDelayMs | 406.1 | 462 | 55.9 | 13.8% | 406.1–406.1 | 462–462 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | mainMaxDelayMs | 12.4 | 7.3 | -5.1 | -41.1% | 12.4–12.4 | 7.3–7.3 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | inputLatencyMs | 207.6 | 209.3 | 1.7 | 0.8% | 207.6–207.6 | 209.3–209.3 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | peakPssMb | 888.4 | 874.2 | -14.2 | -1.6% | 888.4–888.4 | 874.2–874.2 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | operationMs | 394.3 | 389.2 | -5.1 | -1.3% | 394.3–394.3 | 389.2–389.2 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | rendererMaxDelayMs | 47.7 | 60.3 | 12.6 | 26.4% | 47.7–47.7 | 60.3–60.3 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | mainMaxDelayMs | 0.7 | 3.9 | 3.2 | 457.1% | 0.7–0.7 | 3.9–3.9 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | inputLatencyMs | 2.9 | 2.7 | -0.2 | -6.9% | 2.9–2.9 | 2.7–2.7 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | peakPssMb | 841.8 | 830.2 | -11.6 | -1.4% | 841.8–841.8 | 830.2–830.2 | 1 (0/1) | 1 (1/0) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| path-list-1000 | operationMs | 148.9 | 144.5 | -4.4 | -3% | 145.1–152 | 134.2–155 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| path-list-1000 | rendererMaxDelayMs | 127.8 | 119.9 | -7.9 | -6.2% | 115.1–131.9 | 115.6–142.6 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| path-list-1000 | mainMaxDelayMs | 0.7 | 0.5 | -0.2 | -28.6% | 0.5–0.9 | 0.4–0.9 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| path-list-1000 | inputLatencyMs | 68.6 | 70 | 1.4 | 2% | 68.1–81.9 | 66.6–80.2 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| path-list-1000 | peakPssMb | 712.1 | 714.9 | 2.8 | 0.4% | 704.1–718.7 | 711.5–721.1 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| path-list-10000 | operationMs | 1210.4 | 1152.4 | -58 | -4.8% | 1202.4–1214.9 | 1123.3–1196.9 | 3 (1/2) | 3 (1/2) | B faster | ranges separate; no A/A noise available |
| path-list-10000 | rendererMaxDelayMs | 1189.3 | 1129.6 | -59.7 | -5% | 1173.8–1194.2 | 1107.6–1147.9 | 3 (1/2) | 3 (1/2) | B faster | ranges separate; no A/A noise available |
| path-list-10000 | mainMaxDelayMs | 1 | 0.9 | -0.1 | -10% | 0.8–2.5 | 0.7–1 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| path-list-10000 | inputLatencyMs | 1116.1 | 1052 | -64.1 | -5.7% | 1110.2–1125.3 | 1033.2–1092.8 | 3 (1/2) | 3 (1/2) | B faster | ranges separate; no A/A noise available |
| path-list-10000 | peakPssMb | 968.8 | 977.6 | 8.8 | 0.9% | 964.7–978 | 976–981.4 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| path-list-20000 | operationMs | 3701.9 | 2353.6 | -1348.3 | -36.4% | 3671.4–3751.8 | 2344.9–2375.7 | 3 (1/2) | 3 (1/2) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | rendererMaxDelayMs | 3695.2 | 2322.6 | -1372.6 | -37.1% | 3668.9–3707.3 | 2287.9–2384.4 | 3 (1/2) | 3 (1/2) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | mainMaxDelayMs | 0.7 | 0.6 | -0.1 | -14.3% | 0.6–1.1 | 0.4–1 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| path-list-20000 | inputLatencyMs | 3529 | 2197 | -1332 | -37.7% | 3512.1–3546.4 | 2164.1–2219.8 | 3 (1/2) | 3 (1/2) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | peakPssMb | 1391.8 | 1401 | 9.2 | 0.7% | 1386.1–1400.9 | 1399.6–1407.3 | 3 (1/2) | 3 (1/2) | no clear difference | ranges overlap |
| large-diff-500 | operationMs | 97.5 | 87.7 | -9.8 | -10.1% | 91.8–99.1 | 85.7–107.7 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-500 | rendererMaxDelayMs | 13.6 | 29.9 | 16.3 | 119.9% | 9.6–16.4 | 18.8–33.6 | 3 (1/2) | 3 (2/1) | B slower | ranges separate; no A/A noise available |
| large-diff-500 | mainMaxDelayMs | 0.7 | 1.4 | 0.7 | 100% | 0.5–0.9 | 0.9–2.7 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-500 | inputLatencyMs | 2 | 2.3 | 0.3 | 15% | 1.8–2.6 | 2.1–3.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-500 | peakPssMb | 697.3 | 701.5 | 4.2 | 0.6% | 695.8–700.9 | 699.9–709.7 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-5000 | operationMs | 149.8 | 141 | -8.8 | -5.9% | 119–152.8 | 138.1–141.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-5000 | rendererMaxDelayMs | 0.6 | 2.3 | 1.7 | 283.3% | 0.4–12.1 | 0.2–11.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-5000 | mainMaxDelayMs | 0.8 | 0.6 | -0.2 | -25% | 0.8–0.9 | 0.6–0.7 | 3 (1/2) | 3 (2/1) | B faster | ranges separate; no A/A noise available |
| large-diff-5000 | inputLatencyMs | 3.1 | 3.1 | 0 | 0% | 3.1–4.7 | 2.5–3.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-5000 | peakPssMb | 716 | 717.9 | 1.9 | 0.3% | 711.4–718.1 | 716–725.8 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-20000 | operationMs | 1044.2 | 1026.5 | -17.7 | -1.7% | 997.5–1049.7 | 1022–1044.6 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-20000 | rendererMaxDelayMs | 9.6 | 15 | 5.4 | 56.3% | 8.5–15.3 | 14.2–16.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-20000 | mainMaxDelayMs | 3.7 | 1.5 | -2.2 | -59.5% | 3.5–7.5 | 0.6–3.6 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-20000 | inputLatencyMs | 5.9 | 3.6 | -2.3 | -39% | 2.4–10.5 | 3.4–3.8 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| large-diff-20000 | peakPssMb | 738.9 | 754.6 | 15.7 | 2.1% | 719.1–746.6 | 725–754.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| background-index-large-history | operationMs | 3182.4 | 3200.4 | 18 | 0.6% | 3180.1–3201.9 | 3187.2–3211.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| background-index-large-history | rendererMaxDelayMs | 11.4 | 13.8 | 2.4 | 21.1% | 11.4–12.6 | 13.5–14.4 | 3 (1/2) | 3 (2/1) | B slower | ranges separate; no A/A noise available |
| background-index-large-history | mainMaxDelayMs | 1.2 | 0.7 | -0.5 | -41.7% | 0.7–1.3 | 0.5–1.3 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| background-index-large-history | inputLatencyMs | 2.2 | 1.9 | -0.3 | -13.6% | 2–2.2 | 1.8–2.3 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| background-index-large-history | peakPssMb | 728.1 | 715.2 | -12.9 | -1.8% | 724.4–735.8 | 690.5–731.1 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-1024x768 | operationMs | 156 | 155.7 | -0.3 | -0.2% | 98.9–157.9 | 129.3–190.9 | 3 (3/0) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-1024x768 | rendererMaxDelayMs | 52.3 | 58.4 | 6.1 | 11.7% | 49–63.8 | 55.4–59.7 | 3 (3/0) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-1024x768 | mainMaxDelayMs | 4.3 | 4.1 | -0.2 | -4.7% | 3.1–4.8 | 4.1–4.4 | 3 (3/0) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-1024x768 | inputLatencyMs | 40.7 | 37.9 | -2.8 | -6.9% | 30.1–44.1 | 34.4–45.5 | 3 (3/0) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-1024x768 | peakPssMb | 758.6 | 744.2 | -14.4 | -1.9% | 724.2–787.9 | 738–784.5 | 3 (3/0) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-2048x1536 | operationMs | 190.5 | 207.1 | 16.6 | 8.7% | 176.5–201.9 | 201.9–231 | 3 (3/0) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-2048x1536 | rendererMaxDelayMs | 34.2 | 32.6 | -1.6 | -4.7% | 29.9–36.2 | 25.4–35.5 | 3 (3/0) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-2048x1536 | mainMaxDelayMs | 4.2 | 4.7 | 0.5 | 11.9% | 3.6–5.2 | 4.4–5.5 | 3 (3/0) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-2048x1536 | inputLatencyMs | 9.9 | 15.1 | 5.2 | 52.5% | 7.8–14 | 14–27.7 | 3 (3/0) | 3 (2/1) | no clear difference | ranges overlap |
| image-png-2048x1536 | peakPssMb | 873.3 | 890.4 | 17.1 | 2% | 842.4–876.6 | 883.5–993.5 | 3 (3/0) | 3 (2/1) | B slower | ranges separate; no A/A noise available |
| image-png-4096x3072 | operationMs | 612.4 | 593.2 | -19.2 | -3.1% | 469.4–752.7 | 558.5–1348.6 | 3 (1/2) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | rendererMaxDelayMs | 84.2 | 126.9 | 42.7 | 50.7% | 79.4–107.4 | 85.8–130.1 | 3 (1/2) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | mainMaxDelayMs | 6.9 | 13.4 | 6.5 | 94.2% | 5.3–12.9 | 8.8–19.1 | 3 (1/2) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | inputLatencyMs | 57.9 | 59.7 | 1.8 | 3.1% | 41–83 | 40–82.5 | 3 (1/2) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | peakPssMb | 1227.1 | 1271.4 | 44.3 | 3.6% | 1149.7–1242.4 | 1248.6–1272.1 | 3 (1/2) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| image-jpeg-1024x768 | operationMs | 105.2 | 105.5 | 0.3 | 0.3% | 78.2–129.5 | 102.6–126.7 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | rendererMaxDelayMs | 11.4 | 16.9 | 5.5 | 48.2% | 11.1–16.3 | 13–19.6 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | mainMaxDelayMs | 6.7 | 7.4 | 0.7 | 10.4% | 3.7–7.3 | 5–8.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | inputLatencyMs | 8.1 | 5.2 | -2.9 | -35.8% | 2.5–8.9 | 2.9–7.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | peakPssMb | 759.2 | 749.1 | -10.1 | -1.3% | 744.4–786.3 | 741.6–777.2 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | operationMs | 184.4 | 164.5 | -19.9 | -10.8% | 127.9–217.8 | 100.2–211.9 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | rendererMaxDelayMs | 16.4 | 13.2 | -3.2 | -19.5% | 11.6–17.7 | 12.6–15.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | mainMaxDelayMs | 3.4 | 4.1 | 0.7 | 20.6% | 3.1–4.3 | 3.6–4.4 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | inputLatencyMs | 4 | 5.7 | 1.7 | 42.5% | 3.4–6.7 | 3–7.7 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | peakPssMb | 797.7 | 778 | -19.7 | -2.5% | 792.9–810.1 | 774.8–798.5 | 3 (1/2) | 3 (2/1) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | operationMs | 289.9 | 342.6 | 52.7 | 18.2% | 176.4–403.3 | 268.1–351.2 | 2 (0/2) | 3 (3/0) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| image-jpeg-4096x3072 | rendererMaxDelayMs | 40.6 | 33.8 | -6.8 | -16.7% | 35.1–46.1 | 26.4–35.6 | 2 (0/2) | 3 (3/0) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| image-jpeg-4096x3072 | mainMaxDelayMs | 5.1 | 4.3 | -0.8 | -15.7% | 4.6–5.5 | 3.5–4.3 | 2 (0/2) | 3 (3/0) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| image-jpeg-4096x3072 | inputLatencyMs | 21.2 | 5 | -16.2 | -76.4% | 8.6–33.7 | 4.6–6.3 | 2 (0/2) | 3 (3/0) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| image-jpeg-4096x3072 | peakPssMb | 1063.6 | 1094.6 | 31 | 2.9% | 1037.4–1089.8 | 1087.7–1099.3 | 2 (0/2) | 3 (3/0) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| image-jpeg-original-wealth-game | operationMs | 136.7 | 132 | -4.7 | -3.4% | 74.1–167.9 | 103–165 | 3 (2/1) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | rendererMaxDelayMs | 17.4 | 14 | -3.4 | -19.5% | 15.4–17.6 | 11.6–15.5 | 3 (2/1) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | mainMaxDelayMs | 3.9 | 4.6 | 0.7 | 17.9% | 2.6–4 | 2.8–5.3 | 3 (2/1) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | inputLatencyMs | 4.7 | 3.7 | -1 | -21.3% | 3–5.5 | 3.3–7.7 | 3 (2/1) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | peakPssMb | 762.9 | 756.7 | -6.2 | -0.8% | 760.6–792.8 | 755.4–812.8 | 3 (2/1) | 3 (3/0) | no clear difference | ranges overlap |
