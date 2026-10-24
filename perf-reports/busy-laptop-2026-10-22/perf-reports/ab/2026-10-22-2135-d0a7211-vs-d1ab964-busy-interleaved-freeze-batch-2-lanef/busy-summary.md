# Old vs new — busy machine, exploratory — interleaved design

> **Busy machine, exploratory.** Measured without waiting for a quiet machine; other programs were using the CPU the whole time (see Foreign load). This is NOT a clean/strict comparison (the strict path in `compare.mjs` still refuses such reports). Reliability comes from the design: runs alternate order every round so background load hits both sides alike, each side is judged on its median and range over several runs, and an A/A run shows what "no change" looks like here.

- Side A (old): `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded-A`
- Side B (new): `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded`
- Rounds: 3, order alternates every round: A,B,B,A…
- A/A noise used: none — verdicts use the range rule only

## Verdict rule (conservative)

B is called **faster/slower** only when ALL hold: (1) at least 3 measured runs on each side; (2) the two sides' min–max ranges do not overlap; (3) |median B − median A| exceeds the A/A noise for that metric (when an A/A run exists). Otherwise **no clear difference**. A side with no measured run is **not measured (reason)** — a failed or missing row is never counted as zero. Lower is better for every metric.

## Counts

- no clear difference: 190
- B faster: 7
- B slower: 13
- not measured: 10

## Foreign load observed (other programs, from the per-window interference watch)

- Windows watched: 105; verdicts: 0 clean, 105 disturbed, 0 unknown
- Foreign cores in use: median 5.5, max 26.8 (window averages)
- Side A windows: 56, median 5.6 cores, max 26.8 · Side B windows: 49, median 4.9 cores, max 8.3 (similar numbers mean the interleaving spread the load evenly)
- Top offenders (mean cores while present / max): swipekb-languag 2.5/4 (85 windows); qemu-system-x86 1.1/2.7 (83 windows); swipekb-nextwor 9.7/20.8 (7 windows); youcoded 0.6/1 (105 windows); git 0.8/1 (75 windows); chrome 0.3/0.7 (67 windows)

## Runs

| round | slot | side | exit | incomplete notes | report | problem |
|---|---|---|---|---|---|---|
| 1 | 1 | A | 4 | 29 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-2135-d0a7211-vs-d1ab964-busy-interleaved-freeze-batch-2-lanef/2026-10-22-2135-d0a7211-r1-a.json` |  |
| 1 | 2 | B | 4 | 21 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-2135-d0a7211-vs-d1ab964-busy-interleaved-freeze-batch-2-lanef/2026-10-22-2143-d1ab964-r1-b.json` |  |
| 2 | 1 | B | 4 | 23 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-2135-d0a7211-vs-d1ab964-busy-interleaved-freeze-batch-2-lanef/2026-10-22-2151-d1ab964-r2-b.json` |  |
| 2 | 2 | A | 4 | 26 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-2135-d0a7211-vs-d1ab964-busy-interleaved-freeze-batch-2-lanef/2026-10-22-2158-d0a7211-r2-a.json` |  |
| 3 | 1 | A | 4 | 25 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-2135-d0a7211-vs-d1ab964-busy-interleaved-freeze-batch-2-lanef/2026-10-22-2205-d0a7211-r3-a.json` |  |
| 3 | 2 | B | 4 | 23 | `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/perf-reports/ab/2026-10-22-2135-d0a7211-vs-d1ab964-busy-interleaved-freeze-batch-2-lanef/2026-10-22-2212-d1ab964-r3-b.json` |  |

## Differences found

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A | n B | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| csv-wide-3072kib | operationMs | 203.5 | 158.5 | -45 | -22.1% | 168.5–312.2 | 155.1–167.2 | 3 | 3 | B faster |
| csv-wide-3072kib | inputLatencyMs | 87.6 | 64.9 | -22.7 | -25.9% | 74.4–176.1 | 64.3–68.5 | 3 | 3 | B faster |
| docx-paragraphs-1000 | rendererMaxDelayMs | 34.7 | 25.6 | -9.1 | -26.2% | 32.5–35.9 | 23.7–31.3 | 3 | 3 | B faster |
| docx-table-1000x10 | inputLatencyMs | 501.9 | 349.9 | -152 | -30.3% | 358.2–559.8 | 334.7–352 | 3 | 3 | B faster |
| docx-table-250x10 | mainMaxDelayMs | 3.1 | 4.8 | 1.7 | 54.8% | 2.9–3.2 | 4.1–7.5 | 3 | 3 | B slower |
| path-list-20000 | operationMs | 3915.3 | 2469.7 | -1445.6 | -36.9% | 3803.2–4093.5 | 2467.9–2604.9 | 3 | 3 | B faster |
| path-list-20000 | rendererMaxDelayMs | 3892.6 | 2442.4 | -1450.2 | -37.3% | 3755.6–4123.4 | 2422.2–2508.4 | 3 | 3 | B faster |
| path-list-20000 | inputLatencyMs | 3695.4 | 2275.7 | -1419.7 | -38.4% | 3605.7–3919.6 | 2262.3–2371.8 | 3 | 3 | B faster |
| large-diff-500 | operationMs | 91.6 | 127.8 | 36.2 | 39.5% | 81.3–95.5 | 127.1–129.1 | 3 | 3 | B slower |
| large-diff-500 | rendererMaxDelayMs | 17.5 | 21.2 | 3.7 | 21.1% | 11.7–19.3 | 19.5–26.2 | 3 | 3 | B slower |
| large-diff-500 | inputLatencyMs | 3.3 | 10.3 | 7 | 212.1% | 3.2–5.5 | 9.9–12.4 | 3 | 3 | B slower |
| large-diff-500 | peakPssMb | 676.2 | 687.8 | 11.6 | 1.7% | 668.2–684.2 | 686.9–698.9 | 3 | 3 | B slower |
| large-diff-5000 | operationMs | 143.5 | 159.4 | 15.9 | 11.1% | 141.6–150.7 | 155.2–197.6 | 3 | 3 | B slower |
| large-diff-5000 | peakPssMb | 692.9 | 703.3 | 10.4 | 1.5% | 685.7–700.4 | 703.1–717.6 | 3 | 3 | B slower |
| large-diff-20000 | operationMs | 1046.6 | 1098.3 | 51.7 | 4.9% | 1043.9–1049.1 | 1052.3–1146.4 | 3 | 3 | B slower |
| background-index-large-history | mainMaxDelayMs | 0.7 | 1.4 | 0.7 | 100% | 0.5–0.7 | 1.4–1.4 | 3 | 3 | B slower |
| image-png-2048x1536 | rendererMaxDelayMs | 31.8 | 54.4 | 22.6 | 71.1% | 25.1–41.8 | 43.4–58.4 | 3 | 3 | B slower |
| image-jpeg-1024x768 | operationMs | 133.1 | 196 | 62.9 | 47.3% | 111.2–164.1 | 178.6–203.3 | 3 | 3 | B slower |
| image-jpeg-1024x768 | mainMaxDelayMs | 5.5 | 7.3 | 1.8 | 32.7% | 4.8–5.8 | 6.5–7.6 | 3 | 3 | B slower |
| image-jpeg-2048x1536 | mainMaxDelayMs | 4.6 | 9.3 | 4.7 | 102.2% | 3.1–4.8 | 6–127 | 3 | 3 | B slower |

## Every rung and metric

n = measured runs (clean/disturbed windows). Times in ms, memory in MiB.

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A (clean/dist) | n B (clean/dist) | verdict | note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| csv-rows-64kib | operationMs | 138.8 | 145.4 | 6.6 | 4.8% | 134.4–208.7 | 137.8–147.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-64kib | rendererMaxDelayMs | 80.7 | 74.2 | -6.5 | -8.1% | 78–163.6 | 72.9–81 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-64kib | mainMaxDelayMs | 3.4 | 4.3 | 0.9 | 26.5% | 1.2–10.6 | 0.5–4.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-64kib | inputLatencyMs | 37.7 | 33.5 | -4.2 | -11.1% | 35.7–99.1 | 30.5–38.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-64kib | peakPssMb | 686.7 | 697.6 | 10.9 | 1.6% | 540.4–707.5 | 679.9–707.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-256kib | operationMs | 113 | 139 | 26 | 23% | 105.3–217.3 | 108.7–148.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-256kib | rendererMaxDelayMs | 78.8 | 82.5 | 3.7 | 4.7% | 74.5–120.6 | 82.2–99.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-256kib | mainMaxDelayMs | 4.2 | 0.4 | -3.8 | -90.5% | 0.4–7.6 | 0.3–2.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-256kib | inputLatencyMs | 17.8 | 20.8 | 3 | 16.9% | 12.5–23 | 13.6–54.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-256kib | peakPssMb | 693.5 | 721.3 | 27.8 | 4% | 577.6–736 | 684.1–739.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | operationMs | 161.9 | 146.1 | -15.8 | -9.8% | 111.5–244.7 | 129.1–247.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | rendererMaxDelayMs | 115.6 | 112.2 | -3.4 | -2.9% | 93.4–175.2 | 91.4–144.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | mainMaxDelayMs | 0.4 | 1.2 | 0.8 | 200% | 0.4–10.8 | 0.5–1.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | inputLatencyMs | 43.7 | 54.7 | 11 | 25.2% | 28.9–116.7 | 41.5–65.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | peakPssMb | 724.4 | 771.1 | 46.7 | 6.4% | 633.2–787.7 | 689.2–795.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | operationMs | 214.4 | 200.4 | -14 | -6.5% | 200.6–300.5 | 195.5–245.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | rendererMaxDelayMs | 163.1 | 171.4 | 8.3 | 5.1% | 139.1–263 | 158–171.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | mainMaxDelayMs | 3.7 | 4.2 | 0.5 | 13.5% | 2.3–4.9 | 0.5–11.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | inputLatencyMs | 99.3 | 109.6 | 10.3 | 10.4% | 80.8–168.9 | 73.1–121 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | peakPssMb | 772 | 771.1 | -0.9 | -0.1% | 731.8–809.4 | 771–804 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | operationMs | 115.1 | 111 | -4.1 | -3.6% | 107.1–153.6 | 99.8–135.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | rendererMaxDelayMs | 76.2 | 79.1 | 2.9 | 3.8% | 69.4–85.7 | 76.5–92.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | mainMaxDelayMs | 3 | 1 | -2 | -66.7% | 0.8–6.8 | 0.6–4.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | inputLatencyMs | 13.7 | 15.8 | 2.1 | 15.3% | 9.4–21.4 | 2.6–18 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | peakPssMb | 772.4 | 766.5 | -5.9 | -0.8% | 720.9–811.2 | 766.2–797.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | operationMs | 147.6 | 144.6 | -3 | -2% | 140.4–349.6 | 136.4–144.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | rendererMaxDelayMs | 104 | 99.3 | -4.7 | -4.5% | 96.3–240.8 | 99.2–100.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | mainMaxDelayMs | 0.7 | 1.5 | 0.8 | 114.3% | 0.5–3.8 | 0.7–5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | inputLatencyMs | 31.2 | 29.9 | -1.3 | -4.2% | 24.1–92.6 | 29.2–30.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | peakPssMb | 807.2 | 802.2 | -5 | -0.6% | 750.9–837 | 796–821.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-3072kib | operationMs | 203.5 | 158.5 | -45 | -22.1% | 168.5–312.2 | 155.1–167.2 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| csv-wide-3072kib | rendererMaxDelayMs | 141 | 119.2 | -21.8 | -15.5% | 116.7–270.3 | 115–126 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-3072kib | mainMaxDelayMs | 5.9 | 2.8 | -3.1 | -52.5% | 0.7–6.1 | 0.4–6.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-3072kib | inputLatencyMs | 87.6 | 64.9 | -22.7 | -25.9% | 74.4–176.1 | 64.3–68.5 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| csv-wide-3072kib | peakPssMb | 790 | 802.8 | 12.8 | 1.6% | 722.3–790.8 | 765.4–804.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-64kib | operationMs | 96.5 | 97.8 | 1.3 | 1.3% | 96.3–146.4 | 95–98.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-64kib | rendererMaxDelayMs | 56.3 | 61.6 | 5.3 | 9.4% | 50.5–73.4 | 55.7–61.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-64kib | mainMaxDelayMs | 3.6 | 0.5 | -3.1 | -86.1% | 0.3–8.6 | 0.5–0.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-64kib | inputLatencyMs | 18.3 | 5.8 | -12.5 | -68.3% | 4.3–26.2 | 3.9–21.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-64kib | peakPssMb | 747.2 | 763 | 15.8 | 2.1% | 716–769.8 | 735.8–799.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-256kib | operationMs | 98 | 95.9 | -2.1 | -2.1% | 95.5–159.5 | 93.9–112.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-256kib | rendererMaxDelayMs | 69.3 | 64 | -5.3 | -7.6% | 65.1–129.7 | 57.5–74.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-256kib | mainMaxDelayMs | 0.8 | 1.8 | 1 | 125% | 0.6–1.8 | 1.3–4.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-256kib | inputLatencyMs | 9.5 | 12 | 2.5 | 26.3% | 7.6–33.1 | 2.7–17.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-256kib | peakPssMb | 749.4 | 765.8 | 16.4 | 2.2% | 718.9–771.5 | 737.2–801.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-1024kib | operationMs | 143.3 | 110.5 | -32.8 | -22.9% | 116.2–188.2 | 98.7–118.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-1024kib | rendererMaxDelayMs | 96 | 81.3 | -14.7 | -15.3% | 82.1–132.9 | 73.3–85.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-1024kib | mainMaxDelayMs | 0.8 | 1.4 | 0.6 | 75% | 0.5–2.2 | 0.7–7.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-1024kib | inputLatencyMs | 32.1 | 26.6 | -5.5 | -17.1% | 27.8–63.5 | 17.1–28.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-1024kib | peakPssMb | 752.7 | 768.9 | 16.2 | 2.2% | 723.4–778.9 | 741–801.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-3072kib | operationMs | 153.8 | 147.8 | -6 | -3.9% | 146.5–299.9 | 146.5–155.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-3072kib | rendererMaxDelayMs | 124.6 | 110 | -14.6 | -11.7% | 112.3–205.2 | 94.5–124.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-3072kib | mainMaxDelayMs | 0.9 | 3.9 | 3 | 333.3% | 0.5–6.1 | 1.7–6.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-3072kib | inputLatencyMs | 61.9 | 56.7 | -5.2 | -8.4% | 53.9–143.8 | 53.3–63.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-3072kib | peakPssMb | 778.7 | 795.5 | 16.8 | 2.2% | 746.1–802.4 | 767–826.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | operationMs | 112.7 | 139.3 | 26.6 | 23.6% | 105.5–158.9 | 107.7–143 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | rendererMaxDelayMs | 80.1 | 80.4 | 0.3 | 0.4% | 77.9–109.5 | 77.8–97.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | mainMaxDelayMs | 0.7 | 0.5 | -0.2 | -28.6% | 0.4–1.1 | 0.3–0.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | inputLatencyMs | 18.8 | 12.3 | -6.5 | -34.6% | 6.5–35.5 | 8.8–15.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | peakPssMb | 790.5 | 781.3 | -9.2 | -1.2% | 540.4–815.8 | 776.4–805.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-fullread-5120kib | operationMs | 616.8 | 659 | 42.2 | 6.8% | 569–644.7 | 646.3–671.7 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| csv-fullread-5120kib | rendererMaxDelayMs | 285.8 | 303.5 | 17.7 | 6.2% | 276.3–293.1 | 295.1–311.9 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| csv-fullread-5120kib | mainMaxDelayMs | 10.1 | 6.6 | -3.5 | -34.7% | 2.9–21.2 | 3.5–9.6 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| csv-fullread-5120kib | inputLatencyMs | 244.2 | 249.9 | 5.7 | 2.3% | 227.1–247.1 | 233.1–266.7 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| csv-fullread-5120kib | peakPssMb | 833.4 | 848.4 | 15 | 1.8% | 832–847 | 845.3–851.4 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| xlsx-merge-32x32 | operationMs | 422.2 | 452.5 | 30.3 | 7.2% | 418.6–425.7 | 447.2–461.7 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-32x32 | rendererMaxDelayMs | 68.2 | 70.9 | 2.7 | 4% | 67–69.4 | 66.4–71 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-32x32 | mainMaxDelayMs | 4.6 | 4.9 | 0.3 | 6.5% | 3.3–5.8 | 3.6–7.5 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-32x32 | inputLatencyMs | 52.8 | 51.9 | -0.9 | -1.7% | 48.5–57.1 | 48.6–54.6 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-32x32 | peakPssMb | 683.7 | 697.4 | 13.7 | 2% | 674.9–692.4 | 696.7–700.8 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-128x128 | operationMs | 103.2 | 107.5 | 4.3 | 4.2% | 101.2–105.1 | 101.4–147.7 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-128x128 | rendererMaxDelayMs | 17.8 | 16 | -1.8 | -10.1% | 14.3–21.2 | 12.8–25.6 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-128x128 | mainMaxDelayMs | 1.2 | 1.5 | 0.3 | 25% | 1.2–1.2 | 0.9–1.7 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-128x128 | inputLatencyMs | 6.8 | 3.6 | -3.2 | -47.1% | 6.4–7.2 | 2.6–8.7 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-128x128 | peakPssMb | 692.9 | 705 | 12.1 | 1.7% | 681.9–703.9 | 698.8–707.9 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-300x300 | operationMs | 204.2 | 196 | -8.2 | -4% | 158.3–250 | 143.7–202.6 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-300x300 | rendererMaxDelayMs | 39.9 | 42.2 | 2.3 | 5.8% | 37.8–42 | 38.1–46.1 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-300x300 | mainMaxDelayMs | 4 | 0.8 | -3.2 | -80% | 2.6–5.4 | 0.5–7 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-300x300 | inputLatencyMs | 23 | 18.5 | -4.5 | -19.6% | 17.2–28.7 | 17.6–33.9 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-300x300 | peakPssMb | 742.7 | 749 | 6.3 | 0.8% | 733–752.3 | 743.6–760.2 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-400x500 | operationMs | 257.1 | 250 | -7.1 | -2.8% | 254.1–260.1 | 243.3–260.1 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-400x500 | rendererMaxDelayMs | 109.7 | 99 | -10.7 | -9.8% | 107.2–112.2 | 96.7–103.1 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-400x500 | mainMaxDelayMs | 2.3 | 4.9 | 2.6 | 113% | 1.7–2.8 | 3.4–5.9 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-400x500 | inputLatencyMs | 71.9 | 66.6 | -5.3 | -7.4% | 71.4–72.3 | 59.9–87.7 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-merge-400x500 | peakPssMb | 830.1 | 749.1 | -81 | -9.8% | 827.9–832.3 | 743.5–848.7 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-1 | operationMs | 126.7 | 137.4 | 10.7 | 8.4% | 110.4–143 | 120.4–142.2 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-1 | rendererMaxDelayMs | 78.9 | 83.7 | 4.8 | 6.1% | 77.8–80 | 69.9–84.5 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-1 | mainMaxDelayMs | 0.4 | 0.8 | 0.4 | 100% | 0.4–0.4 | 0.3–1.3 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-1 | inputLatencyMs | 32.8 | 34.9 | 2.1 | 6.4% | 23.4–42.3 | 19.7–37.7 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-1 | peakPssMb | 832 | 744.8 | -87.2 | -10.5% | 831.9–832 | 740.2–857.1 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-8 | operationMs | 176.2 | 152.9 | -23.3 | -13.2% | 161.5–190.9 | 148.2–161.1 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-8 | rendererMaxDelayMs | 80.6 | 79.6 | -1 | -1.2% | 77.7–83.4 | 77.3–81.4 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-8 | mainMaxDelayMs | 3.3 | 0.4 | -2.9 | -87.9% | 3.1–3.5 | 0.4–3.9 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-8 | inputLatencyMs | 27.4 | 36.1 | 8.7 | 31.8% | 18.7–36 | 8.3–42.5 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-8 | peakPssMb | 832.9 | 759.8 | -73.1 | -8.8% | 832.4–833.4 | 754.6–874.8 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-32 | operationMs | 279.9 | 294.6 | 14.7 | 5.3% | 268.3–291.4 | 289.4–296.6 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-32 | rendererMaxDelayMs | 84.2 | 83.7 | -0.5 | -0.6% | 73.5–94.9 | 83.1–88.4 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-32 | mainMaxDelayMs | 4.2 | 3 | -1.2 | -28.6% | 2.5–5.8 | 0.4–12.3 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-32 | inputLatencyMs | 33.6 | 40.3 | 6.7 | 19.9% | 27.4–39.7 | 32.1–48.1 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| xlsx-sheets-32 | peakPssMb | 779.3 | 776.2 | -3.1 | -0.4% | 775.8–782.8 | 770–876.6 | 2 (0/2) | 3 (0/3) | no clear difference | too few measured runs (A 2, B 3; need 3 each) |
| docx-paragraphs-100 | operationMs | 184.1 | 193.4 | 9.3 | 5.1% | 181.6–353.8 | 191.1–193.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-100 | rendererMaxDelayMs | 37.8 | 38.6 | 0.8 | 2.1% | 37.2–85 | 27–44.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-100 | mainMaxDelayMs | 4.5 | 4.4 | -0.1 | -2.2% | 3.1–6.6 | 4–4.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-100 | inputLatencyMs | 43.3 | 42.5 | -0.8 | -1.8% | 41–66 | 31.5–42.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-100 | peakPssMb | 675.8 | 692.3 | 16.5 | 2.4% | 671.6–693.2 | 690–692.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | operationMs | 141.2 | 119.5 | -21.7 | -15.4% | 103.7–200.2 | 108.5–147.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | rendererMaxDelayMs | 34.7 | 25.6 | -9.1 | -26.2% | 32.5–35.9 | 23.7–31.3 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| docx-paragraphs-1000 | mainMaxDelayMs | 0.5 | 0.8 | 0.3 | 60% | 0.4–7.4 | 0.7–1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | inputLatencyMs | 19.4 | 26.9 | 7.5 | 38.7% | 12.3–23.6 | 17–28.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | peakPssMb | 691.6 | 696.5 | 4.9 | 0.7% | 676.4–697.7 | 694.8–699.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | operationMs | 347.9 | 348.7 | 0.8 | 0.2% | 315.5–530.8 | 346.3–415.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | rendererMaxDelayMs | 150 | 165.2 | 15.2 | 10.1% | 133.9–217.8 | 149.9–303.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | mainMaxDelayMs | 4.4 | 4.2 | -0.2 | -4.5% | 0.6–10.1 | 0.6–7.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | inputLatencyMs | 130.4 | 132.1 | 1.7 | 1.3% | 109.7–221.1 | 126.5–153 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | peakPssMb | 772.2 | 800.7 | 28.5 | 3.7% | 737.9–797 | 787.1–803.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | operationMs | 98.4 | 92 | -6.4 | -6.5% | 46.7–146.5 | 80.1–110.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | rendererMaxDelayMs | 12.1 | 8.6 | -3.5 | -28.9% | 8.8–23 | 6.2–16 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | mainMaxDelayMs | 5.6 | 0.5 | -5.1 | -91.1% | 0.7–9.8 | 0.4–3.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | inputLatencyMs | 15.9 | 10.1 | -5.8 | -36.5% | 8–21.8 | 9–24.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | peakPssMb | 866.1 | 865.9 | -0.2 | 0% | 804–878.4 | 804.7–892.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-1000x10 | operationMs | 948.1 | 897 | -51.1 | -5.4% | 913.5–1278.9 | 896.3–949.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-1000x10 | rendererMaxDelayMs | 880.2 | 853.2 | -27 | -3.1% | 501.8–1250.1 | 836.1–862.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-1000x10 | mainMaxDelayMs | 4.9 | 5.1 | 0.2 | 4.1% | 1.5–8.3 | 3.2–7.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-1000x10 | inputLatencyMs | 501.9 | 349.9 | -152 | -30.3% | 358.2–559.8 | 334.7–352 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| docx-table-1000x10 | peakPssMb | 1012 | 947.3 | -64.7 | -6.4% | 950.1–1213.1 | 941–1109.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-250x10 | operationMs | 292.9 | 253.7 | -39.2 | -13.4% | 289.1–501.4 | 193.2–345.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-250x10 | rendererMaxDelayMs | 147.7 | 133.9 | -13.8 | -9.3% | 109.3–212.1 | 106.1–141.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-250x10 | mainMaxDelayMs | 3.1 | 4.8 | 1.7 | 54.8% | 2.9–3.2 | 4.1–7.5 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| docx-table-250x10 | inputLatencyMs | 115.9 | 115.4 | -0.5 | -0.4% | 93.3–143 | 99.2–116.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-250x10 | peakPssMb | 812.2 | 815.9 | 3.7 | 0.5% | 589.6–891 | 806.7–888 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| html-assets-1x256 | operationMs | 363.7 | 337.5 | -26.2 | -7.2% | 363.7–363.7 | 337.5–337.5 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | rendererMaxDelayMs | 10.2 | 36.2 | 26 | 254.9% | 10.2–10.2 | 36.2–36.2 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | mainMaxDelayMs | 2.1 | 4.3 | 2.2 | 104.8% | 2.1–2.1 | 4.3–4.3 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | inputLatencyMs | 13.1 | 20.6 | 7.5 | 57.3% | 13.1–13.1 | 20.6–20.6 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | peakPssMb | 709.6 | 718.1 | 8.5 | 1.2% | 709.6–709.6 | 718.1–718.1 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | operationMs | 450.6 | 558.5 | 107.9 | 23.9% | 450.6–450.6 | 558.5–558.5 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | rendererMaxDelayMs | 86.5 | 58 | -28.5 | -32.9% | 86.5–86.5 | 58–58 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | mainMaxDelayMs | 4.9 | 5.6 | 0.7 | 14.3% | 4.9–4.9 | 5.6–5.6 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | inputLatencyMs | 22.7 | 25.8 | 3.1 | 13.7% | 22.7–22.7 | 25.8–25.8 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | peakPssMb | 745 | 751.5 | 6.5 | 0.9% | 745–745 | 751.5–751.5 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | operationMs | 2703.2 | 2667.8 | -35.4 | -1.3% | 2703.2–2703.2 | 2667.8–2667.8 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | rendererMaxDelayMs | 502.5 | 484.5 | -18 | -3.6% | 502.5–502.5 | 484.5–484.5 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | mainMaxDelayMs | 10.4 | 7.9 | -2.5 | -24% | 10.4–10.4 | 7.9–7.9 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | inputLatencyMs | 222.6 | 222.7 | 0.1 | 0% | 222.6–222.6 | 222.7–222.7 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | peakPssMb | 841.3 | 844.6 | 3.3 | 0.4% | 841.3–841.3 | 844.6–844.6 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | operationMs | 397.7 | 495 | 97.3 | 24.5% | 397.7–397.7 | 495–495 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | rendererMaxDelayMs | 36.6 | 45.9 | 9.3 | 25.4% | 36.6–36.6 | 45.9–45.9 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | mainMaxDelayMs | 5 | 2.2 | -2.8 | -56% | 5–5 | 2.2–2.2 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | inputLatencyMs | 2.5 | 4.1 | 1.6 | 64% | 2.5–2.5 | 4.1–4.1 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | peakPssMb | 809.8 | 791.9 | -17.9 | -2.2% | 809.8–809.8 | 791.9–791.9 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| path-list-1000 | operationMs | 193.3 | 152.8 | -40.5 | -21% | 177.8–300.5 | 150–186 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-1000 | rendererMaxDelayMs | 159.6 | 143.5 | -16.1 | -10.1% | 139.5–288.4 | 132.1–171.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-1000 | mainMaxDelayMs | 0.8 | 0.8 | 0 | 0% | 0.6–0.8 | 0.7–1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-1000 | inputLatencyMs | 106.6 | 80.7 | -25.9 | -24.3% | 83.1–116.5 | 80.6–99.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-1000 | peakPssMb | 706.8 | 701.2 | -5.6 | -0.8% | 683.6–712.2 | 695.3–706.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | operationMs | 1344.8 | 1245.7 | -99.1 | -7.4% | 1222.8–1357.1 | 1228.5–1300.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | rendererMaxDelayMs | 1311.7 | 1220.9 | -90.8 | -6.9% | 1206.4–1347.5 | 1218.5–1271 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | mainMaxDelayMs | 0.9 | 0.8 | -0.1 | -11.1% | 0.7–1.2 | 0.7–1.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | inputLatencyMs | 1218 | 1136.8 | -81.2 | -6.7% | 1131.5–1252.6 | 1134.9–1192.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | peakPssMb | 958.4 | 966.7 | 8.3 | 0.9% | 934.4–970.4 | 962.2–973.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-20000 | operationMs | 3915.3 | 2469.7 | -1445.6 | -36.9% | 3803.2–4093.5 | 2467.9–2604.9 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | rendererMaxDelayMs | 3892.6 | 2442.4 | -1450.2 | -37.3% | 3755.6–4123.4 | 2422.2–2508.4 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | mainMaxDelayMs | 1.5 | 0.9 | -0.6 | -40% | 1–1.6 | 0.6–12 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-20000 | inputLatencyMs | 3695.4 | 2275.7 | -1419.7 | -38.4% | 3605.7–3919.6 | 2262.3–2371.8 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| path-list-20000 | peakPssMb | 1396.4 | 1399.7 | 3.3 | 0.2% | 1381.7–1398.3 | 1388.6–1425.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-500 | operationMs | 91.6 | 127.8 | 36.2 | 39.5% | 81.3–95.5 | 127.1–129.1 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| large-diff-500 | rendererMaxDelayMs | 17.5 | 21.2 | 3.7 | 21.1% | 11.7–19.3 | 19.5–26.2 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| large-diff-500 | mainMaxDelayMs | 0.6 | 0.7 | 0.1 | 16.7% | 0.6–0.7 | 0.6–0.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-500 | inputLatencyMs | 3.3 | 10.3 | 7 | 212.1% | 3.2–5.5 | 9.9–12.4 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| large-diff-500 | peakPssMb | 676.2 | 687.8 | 11.6 | 1.7% | 668.2–684.2 | 686.9–698.9 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| large-diff-5000 | operationMs | 143.5 | 159.4 | 15.9 | 11.1% | 141.6–150.7 | 155.2–197.6 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| large-diff-5000 | rendererMaxDelayMs | 12.2 | 5.7 | -6.5 | -53.3% | 11.4–15.3 | 2.8–12 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-5000 | mainMaxDelayMs | 0.6 | 0.7 | 0.1 | 16.7% | 0.4–0.8 | 0.6–1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-5000 | inputLatencyMs | 2.8 | 3.9 | 1.1 | 39.3% | 2.4–7 | 3.3–4.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-5000 | peakPssMb | 692.9 | 703.3 | 10.4 | 1.5% | 685.7–700.4 | 703.1–717.6 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| large-diff-20000 | operationMs | 1046.6 | 1098.3 | 51.7 | 4.9% | 1043.9–1049.1 | 1052.3–1146.4 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| large-diff-20000 | rendererMaxDelayMs | 9.9 | 15.3 | 5.4 | 54.5% | 9.4–14.7 | 9.6–17.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-20000 | mainMaxDelayMs | 9.5 | 5.6 | -3.9 | -41.1% | 3.8–15.9 | 0.8–7.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-20000 | inputLatencyMs | 3.9 | 3.1 | -0.8 | -20.5% | 2.7–6.3 | 2.4–6.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-20000 | peakPssMb | 711 | 720.4 | 9.4 | 1.3% | 705–728.1 | 709.3–742 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| background-index-large-history | operationMs | 3209 | 3207.7 | -1.3 | 0% | 3208.4–3302.4 | 3196.6–3213.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| background-index-large-history | rendererMaxDelayMs | 15.4 | 14.8 | -0.6 | -3.9% | 12.9–16.1 | 11–15.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| background-index-large-history | mainMaxDelayMs | 0.7 | 1.4 | 0.7 | 100% | 0.5–0.7 | 1.4–1.4 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| background-index-large-history | inputLatencyMs | 2.4 | 2.4 | 0 | 0% | 2.3–3 | 2.3–3.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| background-index-large-history | peakPssMb | 700 | 715.9 | 15.9 | 2.3% | 658.9–721.2 | 715.7–746.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | operationMs | 225.8 | 216.7 | -9.1 | -4% | 211.6–273 | 180.6–275.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | rendererMaxDelayMs | 67.6 | 63.9 | -3.7 | -5.5% | 64–76.1 | 58.9–66.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | mainMaxDelayMs | 6.1 | 8.1 | 2 | 32.8% | 5.8–7.2 | 6.2–11 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | inputLatencyMs | 14.8 | 30.7 | 15.9 | 107.4% | 14.5–39.7 | 15.6–38.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | peakPssMb | 735.9 | 756.8 | 20.9 | 2.8% | 708.3–777.9 | 741.4–765.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-2048x1536 | operationMs | 226.8 | 291.1 | 64.3 | 28.4% | 210.4–469.2 | 276.8–441.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-2048x1536 | rendererMaxDelayMs | 31.8 | 54.4 | 22.6 | 71.1% | 25.1–41.8 | 43.4–58.4 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| image-png-2048x1536 | mainMaxDelayMs | 7.1 | 6.8 | -0.3 | -4.2% | 6.9–8.5 | 6.6–8.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-2048x1536 | inputLatencyMs | 25.5 | 25.5 | 0 | 0% | 21.2–25.9 | 8.6–29.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-2048x1536 | peakPssMb | 800.8 | 850.8 | 50 | 6.2% | 773–842.7 | 813.6–886.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-4096x3072 | operationMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-png-4096x3072 | rendererMaxDelayMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-png-4096x3072 | mainMaxDelayMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-png-4096x3072 | inputLatencyMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-png-4096x3072 | peakPssMb | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-jpeg-1024x768 | operationMs | 133.1 | 196 | 62.9 | 47.3% | 111.2–164.1 | 178.6–203.3 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| image-jpeg-1024x768 | rendererMaxDelayMs | 18.7 | 16.5 | -2.2 | -11.8% | 16.9–20.4 | 15.1–18.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | mainMaxDelayMs | 5.5 | 7.3 | 1.8 | 32.7% | 4.8–5.8 | 6.5–7.6 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| image-jpeg-1024x768 | inputLatencyMs | 8.5 | 7.6 | -0.9 | -10.6% | 6.9–9.5 | 5.7–10.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | peakPssMb | 717 | 730 | 13 | 1.8% | 711.7–752.7 | 725.5–743.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | operationMs | 223.8 | 156.7 | -67.1 | -30% | 74.9–328 | 155.6–279.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | rendererMaxDelayMs | 15.3 | 16.1 | 0.8 | 5.2% | 13.2–18.2 | 16–18.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | mainMaxDelayMs | 4.6 | 9.3 | 4.7 | 102.2% | 3.1–4.8 | 6–127 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| image-jpeg-2048x1536 | inputLatencyMs | 5.4 | 9.1 | 3.7 | 68.5% | 5.2–11.1 | 5.9–25.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | peakPssMb | 695.3 | 741.8 | 46.5 | 6.7% | 688.6–729.9 | 727.2–755.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | operationMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-jpeg-4096x3072 | rendererMaxDelayMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-jpeg-4096x3072 | mainMaxDelayMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-jpeg-4096x3072 | inputLatencyMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-jpeg-4096x3072 | peakPssMb | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:evidence-incomplete ×3; B: failed:evidence-incomplete ×3) |  |
| image-jpeg-original-wealth-game | operationMs | 219.3 | 227.2 | 7.9 | 3.6% | 106.3–225 | 158–233 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | rendererMaxDelayMs | 14.6 | 18.4 | 3.8 | 26% | 14.3–14.7 | 12.4–19.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | mainMaxDelayMs | 4.9 | 134.4 | 129.5 | 2642.9% | 4.3–7.8 | 7.2–143.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | inputLatencyMs | 12.5 | 8.8 | -3.7 | -29.6% | 9.7–31 | 6.1–102.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | peakPssMb | 737.6 | 770.2 | 32.6 | 4.4% | 689.5–756.4 | 749.1–773.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
