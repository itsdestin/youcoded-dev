# Old vs new — busy machine, exploratory — interleaved design

> **Busy machine, exploratory.** Measured without waiting for a quiet machine; other programs were using the CPU the whole time (see Foreign load). This is NOT a clean/strict comparison (the strict path in `compare.mjs` still refuses such reports). Reliability comes from the design: runs alternate order every round so background load hits both sides alike, each side is judged on its median and range over several runs, and an A/A run shows what "no change" looks like here.

- Side A (old): `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/youcoded`
- Side B (new): `/home/destin/youcoded-dev/worktrees/sessions/96-merged-evaluation/youcoded`
- Rounds: 5, order alternates every round: A,B,B,A…
- A/A noise used: none — verdicts use the range rule only

## Verdict rule (conservative)

B is called **faster/slower** only when ALL hold: (1) at least 3 measured runs on each side; (2) the two sides' min–max ranges do not overlap; (3) |median B − median A| exceeds the A/A noise for that metric (when an A/A run exists). Otherwise **no clear difference**. A side with no measured run is **not measured (reason)** — a failed or missing row is never counted as zero. Lower is better for every metric.

## Counts

- no clear difference: 217
- B faster: 3

## Foreign load observed (other programs, from the per-window interference watch)

- Windows watched: 163; verdicts: 0 clean, 163 disturbed, 0 unknown
- Foreign cores in use: median 10.1, max 28.3 (window averages)
- Side A windows: 83, median 13.8 cores, max 28 · Side B windows: 80, median 7.1 cores, max 28.3 (similar numbers mean the interleaving spread the load evenly)
- Top offenders (mean cores while present / max): swipekb-nextwor 4.3/13 (163 windows); chrome 5.9/14.6 (51 windows); node-MainThread 3.2/15.9 (38 windows); git 0.8/1 (111 windows); qemu-system-x86 0.8/2.7 (103 windows); youcoded 0.6/1.4 (132 windows)

## Runs

| round | slot | side | exit | incomplete notes | report | problem |
|---|---|---|---|---|---|---|
| 1 | 1 | A | 4 | 27 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0837-bc9e437-r1-a.json` |  |
| 1 | 2 | B | 4 | 24 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0847-254ff99-r1-b.json` |  |
| 2 | 1 | B | 4 | 19 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0857-254ff99-r2-b.json` |  |
| 2 | 2 | A | 4 | 19 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0902-bc9e437-r2-a.json` |  |
| 3 | 1 | A | 4 | 20 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0907-bc9e437-r3-a.json` |  |
| 3 | 2 | B | 4 | 20 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0912-254ff99-r3-b.json` |  |
| 4 | 1 | B | 4 | 18 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0917-254ff99-r4-b.json` |  |
| 4 | 2 | A | 4 | 18 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0922-bc9e437-r4-a.json` |  |
| 5 | 1 | A | 4 | 25 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0925-bc9e437-r5-a.json` |  |
| 5 | 2 | B | 4 | 24 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0837-bc9e437-vs-254ff99-busy-interleaved-q7-main/2026-10-22-0932-254ff99-r5-b.json` |  |

## Differences found

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A | n B | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| csv-fullread-5120kib | mainMaxDelayMs | 8 | 3.3 | -4.7 | -58.7% | 6.1–11.5 | 2.5–4.7 | 5 | 4 | B faster |
| image-png-4096x3072 | operationMs | 742 | 514.3 | -227.7 | -30.7% | 645.1–802.3 | 432.8–589.1 | 3 | 4 | B faster |
| image-jpeg-2048x1536 | operationMs | 124.3 | 98.9 | -25.4 | -20.4% | 106.9–172.4 | 79–100.2 | 4 | 4 | B faster |

## Every rung and metric

n = measured runs (clean/disturbed windows). Times in ms, memory in MiB.

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A (clean/dist) | n B (clean/dist) | verdict | note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| csv-rows-64kib | operationMs | 121 | 143.5 | 22.5 | 18.6% | 116.1–277.3 | 120.5–270 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-64kib | rendererMaxDelayMs | 73.5 | 79.1 | 5.6 | 7.6% | 67.9–143 | 73.2–185.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-64kib | mainMaxDelayMs | 2.1 | 3.2 | 1.1 | 52.4% | 1–24.1 | 1.3–4.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-64kib | inputLatencyMs | 28.9 | 32 | 3.1 | 10.7% | 22.1–102 | 24.1–100.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-64kib | peakPssMb | 695.4 | 699.6 | 4.2 | 0.6% | 668.2–709.9 | 552.8–700.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-1024kib | operationMs | 146.4 | 114.9 | -31.5 | -21.5% | 114.6–148.2 | 110.1–386.2 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-1024kib | rendererMaxDelayMs | 103.6 | 91.7 | -11.9 | -11.5% | 95.6–111.5 | 79.6–219.7 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-1024kib | mainMaxDelayMs | 3.2 | 4.6 | 1.4 | 43.7% | 0.7–4.7 | 0.4–14.1 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-1024kib | inputLatencyMs | 36.7 | 34.1 | -2.6 | -7.1% | 30.1–56.3 | 26.5–115.7 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-1024kib | peakPssMb | 748.8 | 745.4 | -3.4 | -0.5% | 742–775.2 | 732.2–756.7 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-256kib | operationMs | 105.7 | 101.9 | -3.8 | -3.6% | 102.2–199.2 | 101–253.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-256kib | rendererMaxDelayMs | 73.6 | 75.6 | 2 | 2.7% | 70.2–122.2 | 60.7–139.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-256kib | mainMaxDelayMs | 3.6 | 1 | -2.6 | -72.2% | 0.5–4.3 | 0.3–9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-256kib | inputLatencyMs | 15.7 | 17.5 | 1.8 | 11.5% | 10.4–70.4 | 14.1–70.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-256kib | peakPssMb | 706.3 | 704.4 | -1.9 | -0.3% | 540.1–724.6 | 702–712.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-3072kib | operationMs | 198.9 | 188.7 | -10.2 | -5.1% | 192.5–300.2 | 151.4–325.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-3072kib | rendererMaxDelayMs | 182.7 | 147.6 | -35.1 | -19.2% | 151.4–215.4 | 106.4–308.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-3072kib | mainMaxDelayMs | 1.5 | 4.6 | 3.1 | 206.7% | 0.5–8.1 | 2.6–5.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-3072kib | inputLatencyMs | 113.6 | 93.4 | -20.2 | -17.8% | 93.4–160.2 | 68.4–179.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-rows-3072kib | peakPssMb | 824.7 | 824.1 | -0.6 | -0.1% | 683.6–882.6 | 777.3–845.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-64kib | operationMs | 108.9 | 111.9 | 3 | 2.8% | 99.1–192.2 | 100.6–215.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-64kib | rendererMaxDelayMs | 77.4 | 78.2 | 0.8 | 1% | 68.7–131.8 | 68.3–145.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-64kib | mainMaxDelayMs | 4.8 | 0.5 | -4.3 | -89.6% | 0.6–5.4 | 0.4–3.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-64kib | inputLatencyMs | 8.1 | 9 | 0.9 | 11.1% | 4.5–42.7 | 6–56.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-64kib | peakPssMb | 825 | 845.6 | 20.6 | 2.5% | 685.7–877.9 | 769–851.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-256kib | operationMs | 126.7 | 113.9 | -12.8 | -10.1% | 112.9–269.8 | 105.3–160.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-256kib | rendererMaxDelayMs | 95.6 | 95.8 | 0.2 | 0.2% | 80.5–153.9 | 76.7–116.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-256kib | mainMaxDelayMs | 1.6 | 0.5 | -1.1 | -68.7% | 0.4–3 | 0.3–9.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-256kib | inputLatencyMs | 17.7 | 16.7 | -1 | -5.6% | 14.9–63.4 | 8.8–34.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-256kib | peakPssMb | 843 | 845.8 | 2.8 | 0.3% | 704.3–852.4 | 792.2–863.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-1024kib | operationMs | 135.8 | 145 | 9.2 | 6.8% | 109.7–208.6 | 119–249.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-1024kib | rendererMaxDelayMs | 96 | 100.9 | 4.9 | 5.1% | 91–122.9 | 81.2–117 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-1024kib | mainMaxDelayMs | 4.4 | 1.4 | -3 | -68.2% | 0.8–5.1 | 0.3–8.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-1024kib | inputLatencyMs | 25.4 | 39.9 | 14.5 | 57.1% | 20.8–61.8 | 30.6–48.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-1024kib | peakPssMb | 844 | 806.8 | -37.2 | -4.4% | 733.1–873.1 | 781.2–865.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-3072kib | operationMs | 180.7 | 187.6 | 6.9 | 3.8% | 153.5–307.5 | 152.2–238.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-3072kib | rendererMaxDelayMs | 129.2 | 144.2 | 15 | 11.6% | 126–217.7 | 114.2–178.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-3072kib | mainMaxDelayMs | 4.3 | 3 | -1.3 | -30.2% | 2–7.2 | 0.6–5.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-3072kib | inputLatencyMs | 66.8 | 66.3 | -0.5 | -0.7% | 62.4–168.2 | 59.8–97.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-wide-3072kib | peakPssMb | 834.1 | 810.8 | -23.3 | -2.8% | 764–923.2 | 774.2–887 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-64kib | operationMs | 95 | 96.6 | 1.6 | 1.7% | 90.5–154.7 | 90.9–138 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-64kib | rendererMaxDelayMs | 61.5 | 57.7 | -3.8 | -6.2% | 45.5–78.5 | 55.4–86.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-64kib | mainMaxDelayMs | 0.5 | 1.2 | 0.7 | 140% | 0.3–3.1 | 0.4–4.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-64kib | inputLatencyMs | 13.1 | 9.4 | -3.7 | -28.2% | 2.8–27.1 | 3.2–27 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-64kib | peakPssMb | 830.3 | 793.5 | -36.8 | -4.4% | 760–914 | 763.9–899.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-256kib | operationMs | 103 | 101.5 | -1.5 | -1.5% | 95.6–143.8 | 86.1–146.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-256kib | rendererMaxDelayMs | 65.5 | 73.4 | 7.9 | 12.1% | 54.4–84.5 | 60–98.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-256kib | mainMaxDelayMs | 0.6 | 0.6 | 0 | 0% | 0.5–4.9 | 0.3–4.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-256kib | inputLatencyMs | 10.4 | 12.9 | 2.5 | 24% | 5.4–14.6 | 4.2–27.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-256kib | peakPssMb | 831.5 | 788.2 | -43.3 | -5.2% | 760.9–887.2 | 771.1–921.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-1024kib | operationMs | 102.4 | 105.3 | 2.9 | 2.8% | 97.3–242.1 | 96.8–158.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-1024kib | rendererMaxDelayMs | 77.5 | 75.8 | -1.7 | -2.2% | 69.7–115.8 | 69.3–87 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-1024kib | mainMaxDelayMs | 1.5 | 0.5 | -1 | -66.7% | 0.4–4.5 | 0.4–4.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-1024kib | inputLatencyMs | 17.1 | 18.9 | 1.8 | 10.5% | 13.6–43 | 5.1–38 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-1024kib | peakPssMb | 835 | 791 | -44 | -5.3% | 763.5–890.7 | 774.1–937.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-3072kib | operationMs | 159.2 | 158.8 | -0.4 | -0.3% | 147.3–219.1 | 148.1–197.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-3072kib | rendererMaxDelayMs | 118.3 | 119.9 | 1.6 | 1.4% | 103.4–144.7 | 106.3–145.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-3072kib | mainMaxDelayMs | 2.5 | 4.9 | 2.4 | 96% | 0.7–5.5 | 0.9–7.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-3072kib | inputLatencyMs | 60.5 | 66.5 | 6 | 9.9% | 50.1–78.6 | 29.4–89.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-quoted-3072kib | peakPssMb | 835.7 | 795.6 | -40.1 | -4.8% | 757.2–901 | 634.5–985.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| csv-fullread-5120kib | operationMs | 605.6 | 595.2 | -10.4 | -1.7% | 575.7–815.6 | 562.7–642.3 | 5 (0/5) | 4 (0/4) | no clear difference | ranges overlap |
| csv-fullread-5120kib | rendererMaxDelayMs | 275.9 | 269.3 | -6.6 | -2.4% | 264.1–343.2 | 264–290.5 | 5 (0/5) | 4 (0/4) | no clear difference | ranges overlap |
| csv-fullread-5120kib | mainMaxDelayMs | 8 | 3.3 | -4.7 | -58.7% | 6.1–11.5 | 2.5–4.7 | 5 (0/5) | 4 (0/4) | B faster | ranges separate; no A/A noise available |
| csv-fullread-5120kib | inputLatencyMs | 240.5 | 232.9 | -7.6 | -3.2% | 216.8–307.1 | 220.7–239.8 | 5 (0/5) | 4 (0/4) | no clear difference | ranges overlap |
| csv-fullread-5120kib | peakPssMb | 857 | 854.5 | -2.5 | -0.3% | 833.3–868.7 | 846.4–859.5 | 5 (0/5) | 4 (0/4) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | operationMs | 421.8 | 402 | -19.8 | -4.7% | 296.6–578 | 246.3–479.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | rendererMaxDelayMs | 87.9 | 78 | -9.9 | -11.3% | 73.4–95.6 | 68.8–105.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | mainMaxDelayMs | 4.4 | 4.3 | -0.1 | -2.3% | 1.5–8.3 | 2.4–6.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | inputLatencyMs | 67.7 | 78 | 10.3 | 15.2% | 54.7–79.6 | 52.2–91.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | peakPssMb | 699 | 696.8 | -2.2 | -0.3% | 618–725.3 | 656.5–712.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | operationMs | 94.8 | 95.7 | 0.9 | 0.9% | 93.7–136.2 | 94.9–161.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | rendererMaxDelayMs | 14.5 | 13.8 | -0.7 | -4.8% | 11–22.9 | 6.3–40.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | mainMaxDelayMs | 0.9 | 1.1 | 0.2 | 22.2% | 0.5–0.9 | 0.4–5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | inputLatencyMs | 6.5 | 9 | 2.5 | 38.5% | 2.4–16.5 | 3.8–12.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | peakPssMb | 708.4 | 694.9 | -13.5 | -1.9% | 666.6–733.6 | 675–706.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | operationMs | 175.8 | 150.3 | -25.5 | -14.5% | 163.3–192.7 | 140.2–388.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | rendererMaxDelayMs | 47 | 38.8 | -8.2 | -17.4% | 31.1–63.6 | 31.1–96.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | mainMaxDelayMs | 0.8 | 0.9 | 0.1 | 12.5% | 0.5–4.5 | 0.4–9.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | inputLatencyMs | 25 | 15.9 | -9.1 | -36.4% | 18.7–32.8 | 14–67.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | peakPssMb | 739 | 739.1 | 0.1 | 0% | 731.2–769.7 | 693.1–752.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | operationMs | 291.3 | 256.5 | -34.8 | -11.9% | 247.6–389.4 | 219.3–425.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | rendererMaxDelayMs | 93.4 | 104.8 | 11.4 | 12.2% | 87.5–144.9 | 76.7–174.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | mainMaxDelayMs | 2.3 | 4.3 | 2 | 87% | 2.1–6.1 | 0.6–6.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | inputLatencyMs | 77.9 | 71.8 | -6.1 | -7.8% | 64.2–108.1 | 53.1–111.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | peakPssMb | 824.2 | 819.4 | -4.8 | -0.6% | 762.5–843.4 | 779.3–830.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-1 | operationMs | 141.2 | 141.3 | 0.1 | 0.1% | 113.8–149.9 | 110.2–145.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-1 | rendererMaxDelayMs | 86.3 | 81.7 | -4.6 | -5.3% | 79.5–108.2 | 72.3–90.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-1 | mainMaxDelayMs | 1 | 2.5 | 1.5 | 150% | 0.7–9.4 | 0.4–5.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-1 | inputLatencyMs | 46.7 | 33.7 | -13 | -27.8% | 30.2–51 | 30.5–52 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-1 | peakPssMb | 835.6 | 816 | -19.6 | -2.3% | 769–855.5 | 788.5–826.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-8 | operationMs | 156.3 | 153.3 | -3 | -1.9% | 102–233.6 | 140.1–279.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-8 | rendererMaxDelayMs | 72.6 | 72 | -0.6 | -0.8% | 64.5–99.1 | 65.5–142 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-8 | mainMaxDelayMs | 0.7 | 0.6 | -0.1 | -14.3% | 0.5–6.1 | 0.3–6.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-8 | inputLatencyMs | 21.5 | 25.1 | 3.6 | 16.7% | 2.9–53.5 | 11–46.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-8 | peakPssMb | 849.8 | 808.3 | -41.5 | -4.9% | 782.7–872.2 | 765–837.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-32 | operationMs | 296.4 | 274.7 | -21.7 | -7.3% | 262.4–313.9 | 251.3–408.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-32 | rendererMaxDelayMs | 83.5 | 79.7 | -3.8 | -4.6% | 68–101.4 | 60.3–104.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-32 | mainMaxDelayMs | 1.2 | 3.7 | 2.5 | 208.3% | 0.4–9.4 | 0.8–5.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-32 | inputLatencyMs | 39.1 | 32.5 | -6.6 | -16.9% | 16.8–42.5 | 14.4–48 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| xlsx-sheets-32 | peakPssMb | 809.5 | 825.9 | 16.4 | 2% | 801.6–851.2 | 781–840.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-100 | operationMs | 189.1 | 189.3 | 0.2 | 0.1% | 147–539.8 | 150.5–392 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-100 | rendererMaxDelayMs | 41.8 | 37.8 | -4 | -9.6% | 29.1–76.7 | 31.2–76.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-100 | mainMaxDelayMs | 3.6 | 2.1 | -1.5 | -41.7% | 0.5–13.8 | 0.6–7.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-100 | inputLatencyMs | 45.2 | 33 | -12.2 | -27% | 26.8–48.7 | 18.3–47.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-100 | peakPssMb | 674 | 687.5 | 13.5 | 2% | 654.2–687.3 | 682.4–696.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | operationMs | 149.8 | 117.8 | -32 | -21.4% | 99.6–159.6 | 96.9–170.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | rendererMaxDelayMs | 33.1 | 35.9 | 2.8 | 8.5% | 27.6–55.4 | 26–51.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | mainMaxDelayMs | 0.4 | 0.9 | 0.5 | 125% | 0.3–1 | 0.3–7.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | inputLatencyMs | 18.5 | 13.9 | -4.6 | -24.9% | 12.6–43.3 | 11.8–34.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | peakPssMb | 687.4 | 702.2 | 14.8 | 2.2% | 669.3–696.2 | 695–705.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | operationMs | 352.1 | 348.3 | -3.8 | -1.1% | 293.5–580.9 | 298.9–458.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | rendererMaxDelayMs | 161.4 | 145.4 | -16 | -9.9% | 128.9–478 | 129.4–223.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | mainMaxDelayMs | 5.5 | 3.1 | -2.4 | -43.6% | 3–7.2 | 0.9–5.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | inputLatencyMs | 152.1 | 145.7 | -6.4 | -4.2% | 140.6–233.8 | 106.9–225.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | peakPssMb | 788.3 | 789.3 | 1 | 0.1% | 750.1–806.1 | 756–823.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-25x10 | operationMs | 89.5 | 93.6 | 4.1 | 4.6% | 51.6–141.5 | 62.1–152.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-25x10 | rendererMaxDelayMs | 11.6 | 23.6 | 12 | 103.4% | 6.8–35 | 10.8–37.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-25x10 | mainMaxDelayMs | 0.7 | 0.9 | 0.2 | 28.6% | 0.3–1.4 | 0.5–6.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-25x10 | inputLatencyMs | 10.3 | 13.7 | 3.4 | 33% | 5.8–15.9 | 8–21.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-25x10 | peakPssMb | 864.1 | 867.3 | 3.2 | 0.4% | 816.9–886.7 | 826.5–914.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-250x10 | operationMs | 250.6 | 268.3 | 17.7 | 7.1% | 141.4–369.7 | 161.2–411.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-250x10 | rendererMaxDelayMs | 106 | 119.6 | 13.6 | 12.8% | 92.3–136.5 | 104.1–182.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-250x10 | mainMaxDelayMs | 2.6 | 4.4 | 1.8 | 69.2% | 0.7–7.4 | 0.6–13.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-250x10 | inputLatencyMs | 98.9 | 101.3 | 2.4 | 2.4% | 80–118.6 | 95.4–157.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-250x10 | peakPssMb | 882.3 | 886.1 | 3.8 | 0.4% | 833.4–897.3 | 866.9–916.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-1000x10 | operationMs | 931.9 | 899.1 | -32.8 | -3.5% | 893.7–1156.1 | 895.3–1148.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-1000x10 | rendererMaxDelayMs | 850.2 | 836.2 | -14 | -1.6% | 724.6–1085.8 | 760.8–903.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-1000x10 | mainMaxDelayMs | 4.3 | 4.9 | 0.6 | 14% | 1–20 | 2.1–5.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-1000x10 | inputLatencyMs | 475.4 | 349.3 | -126.1 | -26.5% | 343.6–589.1 | 318.3–458 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| docx-table-1000x10 | peakPssMb | 1090.1 | 1023.2 | -66.9 | -6.1% | 1008.5–1221.3 | 944.8–1034.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| html-assets-1x256 | operationMs | 474.6 | 317.6 | -157 | -33.1% | 474.6–474.6 | 317.6–317.6 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | rendererMaxDelayMs | 54.4 | 51.6 | -2.8 | -5.1% | 54.4–54.4 | 51.6–51.6 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | mainMaxDelayMs | 4.3 | 1.1 | -3.2 | -74.4% | 4.3–4.3 | 1.1–1.1 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | inputLatencyMs | 7.1 | 26.2 | 19.1 | 269% | 7.1–7.1 | 26.2–26.2 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-1x256 | peakPssMb | 639.1 | 724.3 | 85.2 | 13.3% | 639.1–639.1 | 724.3–724.3 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | operationMs | 626.9 | 402.5 | -224.4 | -35.8% | 626.9–626.9 | 402.5–402.5 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | rendererMaxDelayMs | 84.2 | 82 | -2.2 | -2.6% | 84.2–84.2 | 82–82 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | mainMaxDelayMs | 6.5 | 7.8 | 1.3 | 20% | 6.5–6.5 | 7.8–7.8 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | inputLatencyMs | 14.5 | 22.4 | 7.9 | 54.5% | 14.5–14.5 | 22.4–22.4 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-4x256 | peakPssMb | 682.4 | 752.4 | 70 | 10.3% | 682.4–682.4 | 752.4–752.4 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | operationMs | 3042.2 | 2614.3 | -427.9 | -14.1% | 3042.2–3042.2 | 2614.3–2614.3 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | rendererMaxDelayMs | 542.8 | 304.3 | -238.5 | -43.9% | 542.8–542.8 | 304.3–304.3 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | mainMaxDelayMs | 12.9 | 4.3 | -8.6 | -66.7% | 12.9–12.9 | 4.3–4.3 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | inputLatencyMs | 223.9 | 201.7 | -22.2 | -9.9% | 223.9–223.9 | 201.7–201.7 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-assets-8x512 | peakPssMb | 882.2 | 900.9 | 18.7 | 2.1% | 882.2–882.2 | 900.9–900.9 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | operationMs | 521 | 398.8 | -122.2 | -23.5% | 521–521 | 398.8–398.8 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | rendererMaxDelayMs | 61.3 | 39.1 | -22.2 | -36.2% | 61.3–61.3 | 39.1–39.1 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | mainMaxDelayMs | 3.3 | 5.7 | 2.4 | 72.7% | 3.3–3.3 | 5.7–5.7 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | inputLatencyMs | 12.8 | 2.7 | -10.1 | -78.9% | 12.8–12.8 | 2.7–2.7 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| html-script-250ms | peakPssMb | 744.7 | 857.3 | 112.6 | 15.1% | 744.7–744.7 | 857.3–857.3 | 1 (0/1) | 1 (0/1) | no clear difference | too few measured runs (A 1, B 1; need 3 each) |
| path-list-1000 | operationMs | 202.5 | 158.7 | -43.8 | -21.6% | 152.2–238.5 | 145.2–299 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-1000 | rendererMaxDelayMs | 204 | 150.1 | -53.9 | -26.4% | 122.9–244.3 | 126.8–303.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-1000 | mainMaxDelayMs | 0.7 | 0.8 | 0.1 | 14.3% | 0.5–53.1 | 0.7–0.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-1000 | inputLatencyMs | 151.4 | 88.1 | -63.3 | -41.8% | 91.9–182.8 | 70.5–104.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-1000 | peakPssMb | 668.4 | 702.7 | 34.3 | 5.1% | 579–712 | 696.5–705.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-10000 | operationMs | 1767.8 | 1254.9 | -512.9 | -29% | 1201.9–3107.7 | 1201.3–1282.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-10000 | rendererMaxDelayMs | 1659.9 | 1208.9 | -451 | -27.2% | 1180.4–2965.8 | 1185.9–1249.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-10000 | mainMaxDelayMs | 2.6 | 0.7 | -1.9 | -73.1% | 0.9–3.9 | 0.6–1.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-10000 | inputLatencyMs | 1598.3 | 1148 | -450.3 | -28.2% | 1105.2–2861.8 | 1102.1–1178.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-10000 | peakPssMb | 943 | 962.1 | 19.1 | 2% | 848.1–974.4 | 958.8–966.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-20000 | operationMs | 4851.6 | 3777.2 | -1074.4 | -22.1% | 3862.1–7224.3 | 3668–3968.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-20000 | rendererMaxDelayMs | 5322.1 | 3784.3 | -1537.8 | -28.9% | 3829.5–6409.4 | 3630–3931.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-20000 | mainMaxDelayMs | 1.8 | 1.4 | -0.4 | -22.2% | 1.1–37.8 | 0.8–4.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-20000 | inputLatencyMs | 4601.5 | 3607.2 | -994.3 | -21.6% | 3704.4–6041.4 | 3512.8–3765.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| path-list-20000 | peakPssMb | 1402.5 | 1386.5 | -16 | -1.1% | 1322.7–1435.2 | 1381.1–1395.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-500 | operationMs | 98.4 | 93.1 | -5.3 | -5.4% | 78.4–151.4 | 55.8–99.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-500 | rendererMaxDelayMs | 10.3 | 18.3 | 8 | 77.7% | 5.6–23.9 | 8.2–24.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-500 | mainMaxDelayMs | 0.7 | 0.6 | -0.1 | -14.3% | 0.4–1.1 | 0.5–0.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-500 | inputLatencyMs | 4.1 | 3.5 | -0.6 | -14.6% | 3–10.8 | 1.9–5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-500 | peakPssMb | 661.4 | 688.6 | 27.2 | 4.1% | 597.3–686.6 | 682.8–692.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-5000 | operationMs | 190 | 148.2 | -41.8 | -22% | 147–242.3 | 141.3–171 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-5000 | rendererMaxDelayMs | 12 | 7.7 | -4.3 | -35.8% | 3.1–15.1 | 1.8–13.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-5000 | mainMaxDelayMs | 1.1 | 0.7 | -0.4 | -36.4% | 0.7–1.4 | 0.5–1.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-5000 | inputLatencyMs | 3.5 | 2.8 | -0.7 | -20% | 3.2–5.8 | 1.8–11 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-5000 | peakPssMb | 677.6 | 705.6 | 28 | 4.1% | 610.2–701.1 | 698.5–707.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-20000 | operationMs | 1196.2 | 1045.4 | -150.8 | -12.6% | 999.3–2231.1 | 977.1–1194.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-20000 | rendererMaxDelayMs | 11.2 | 13.3 | 2.1 | 18.8% | 5.7–20.2 | 11.4–16.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-20000 | mainMaxDelayMs | 5.1 | 7.3 | 2.2 | 43.1% | 2.3–8.7 | 4.4–10.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-20000 | inputLatencyMs | 9.1 | 3.7 | -5.4 | -59.3% | 6–10.9 | 2.4–8.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| large-diff-20000 | peakPssMb | 697 | 726.3 | 29.3 | 4.2% | 635.2–720.9 | 720.3–734.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| background-index-large-history | operationMs | 3222.7 | 3201.8 | -20.9 | -0.6% | 3202.7–3236.6 | 3177.4–3253.9 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| background-index-large-history | rendererMaxDelayMs | 16.5 | 15.3 | -1.2 | -7.3% | 14.7–16.9 | 11.1–16.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| background-index-large-history | mainMaxDelayMs | 0.8 | 0.7 | -0.1 | -12.5% | 0.6–4.2 | 0.6–1.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| background-index-large-history | inputLatencyMs | 2.3 | 2.5 | 0.2 | 8.7% | 1.9–5.6 | 2.2–5.7 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| background-index-large-history | peakPssMb | 702.6 | 715.8 | 13.2 | 1.9% | 656.3–725.5 | 688.5–722.2 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-1024x768 | operationMs | 190.7 | 173.4 | -17.3 | -9.1% | 148.5–350.7 | 148.8–185.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-1024x768 | rendererMaxDelayMs | 54.7 | 58.8 | 4.1 | 7.5% | 40.7–157.5 | 23.4–75.1 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-1024x768 | mainMaxDelayMs | 6.6 | 6.6 | 0 | 0% | 5.6–10.9 | 1.5–8.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-1024x768 | inputLatencyMs | 38.1 | 33.5 | -4.6 | -12.1% | 18.5–125.6 | 11.6–45.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-1024x768 | peakPssMb | 741.7 | 769.5 | 27.8 | 3.7% | 673.2–1105.7 | 725.7–772.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-2048x1536 | operationMs | 247.1 | 293.3 | 46.2 | 18.7% | 164.8–289.4 | 182.6–418 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-2048x1536 | rendererMaxDelayMs | 43.7 | 45.4 | 1.7 | 3.9% | 34.4–66.8 | 34.2–54.3 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-2048x1536 | mainMaxDelayMs | 5.4 | 5.8 | 0.4 | 7.4% | 3–10.3 | 4.5–7.8 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-2048x1536 | inputLatencyMs | 15 | 18.8 | 3.8 | 25.3% | 13.7–23.8 | 10.9–38 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-2048x1536 | peakPssMb | 849.7 | 958.4 | 108.7 | 12.8% | 754.8–888.6 | 882.8–969.8 | 4 (0/4) | 5 (0/5) | no clear difference | ranges overlap |
| image-png-4096x3072 | operationMs | 742 | 514.3 | -227.7 | -30.7% | 645.1–802.3 | 432.8–589.1 | 3 (0/3) | 4 (0/4) | B faster | ranges separate; no A/A noise available |
| image-png-4096x3072 | rendererMaxDelayMs | 88.4 | 91.4 | 3 | 3.4% | 70–119.4 | 84.8–128.9 | 3 (0/3) | 4 (0/4) | no clear difference | ranges overlap |
| image-png-4096x3072 | mainMaxDelayMs | 7.7 | 10.6 | 2.9 | 37.7% | 7.1–14.6 | 7.8–17.2 | 3 (0/3) | 4 (0/4) | no clear difference | ranges overlap |
| image-png-4096x3072 | inputLatencyMs | 55.3 | 97 | 41.7 | 75.4% | 40.9–62.4 | 57.6–126.2 | 3 (0/3) | 4 (0/4) | no clear difference | ranges overlap |
| image-png-4096x3072 | peakPssMb | 1155.6 | 1185.1 | 29.5 | 2.6% | 1134.7–1192.3 | 1120.8–1244.3 | 3 (0/3) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | operationMs | 151.4 | 95.2 | -56.2 | -37.1% | 78.1–319 | 72.8–239.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | rendererMaxDelayMs | 15.8 | 14.9 | -0.9 | -5.7% | 12.4–21.9 | 9.1–23 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | mainMaxDelayMs | 5.4 | 3.6 | -1.8 | -33.3% | 1.5–18.2 | 1.4–13.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | inputLatencyMs | 8.7 | 7.1 | -1.6 | -18.4% | 3.9–21.6 | 5.3–8.6 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | peakPssMb | 750.5 | 773.5 | 23 | 3.1% | 744–801.3 | 733.1–813.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | operationMs | 124.3 | 98.9 | -25.4 | -20.4% | 106.9–172.4 | 79–100.2 | 4 (0/4) | 4 (0/4) | B faster | ranges separate; no A/A noise available |
| image-jpeg-2048x1536 | rendererMaxDelayMs | 14.8 | 14.6 | -0.2 | -1.4% | 11.7–18.1 | 10.3–27.5 | 4 (0/4) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | mainMaxDelayMs | 5.5 | 5.4 | -0.1 | -1.8% | 2.9–6.1 | 3.2–8.8 | 4 (0/4) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | inputLatencyMs | 4.7 | 6 | 1.3 | 27.7% | 2.2–8.6 | 3.7–6.7 | 4 (0/4) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | peakPssMb | 796.1 | 805.1 | 9 | 1.1% | 737.5–814.2 | 760.1–829.3 | 4 (0/4) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | operationMs | 393.9 | 193.9 | -200 | -50.8% | 227.6–404.9 | 109.2–403.3 | 3 (0/3) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | rendererMaxDelayMs | 25.6 | 21.6 | -4 | -15.6% | 22.9–31.1 | 14.1–38.9 | 3 (0/3) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | mainMaxDelayMs | 4.8 | 5.3 | 0.5 | 10.4% | 4.7–6.9 | 3.9–5.8 | 3 (0/3) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | inputLatencyMs | 6.6 | 6.2 | -0.4 | -6.1% | 4.5–26.8 | 5.6–30.1 | 3 (0/3) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | peakPssMb | 1089.7 | 1080.8 | -8.9 | -0.8% | 1064.9–1099.9 | 1040.4–1092.2 | 3 (0/3) | 4 (0/4) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | operationMs | 125.7 | 101.5 | -24.2 | -19.3% | 98.4–163.3 | 74.1–189.8 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | rendererMaxDelayMs | 17.6 | 14.3 | -3.3 | -18.7% | 14.2–19 | 13.1–16.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | mainMaxDelayMs | 5.3 | 4.7 | -0.6 | -11.3% | 4.1–6.1 | 3–6.3 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | inputLatencyMs | 4.9 | 7 | 2.1 | 42.9% | 2.1–9.3 | 3.3–7.4 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | peakPssMb | 755.9 | 747.5 | -8.4 | -1.1% | 682.2–801.6 | 683.2–807.5 | 5 (0/5) | 5 (0/5) | no clear difference | ranges overlap |
