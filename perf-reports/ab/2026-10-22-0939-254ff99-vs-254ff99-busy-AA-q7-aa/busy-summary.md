# A/A noise check — busy machine, exploratory — interleaved design

> **Busy machine, exploratory.** Measured without waiting for a quiet machine; other programs were using the CPU the whole time (see Foreign load). This is NOT a clean/strict comparison (the strict path in `compare.mjs` still refuses such reports). Reliability comes from the design: runs alternate order every round so background load hits both sides alike, each side is judged on its median and range over several runs, and an A/A run shows what "no change" looks like here.

- Side A (first slot): `/home/destin/youcoded-dev/worktrees/sessions/96-merged-evaluation/youcoded`
- Side B (second slot — the SAME candidate): `/home/destin/youcoded-dev/worktrees/sessions/96-merged-evaluation/youcoded`
- Rounds: 3, order alternates every round: A,A2,A2,A…
- A/A noise used: none — verdicts use the range rule only

## Verdict rule (conservative)

B is called **faster/slower** only when ALL hold: (1) at least 3 measured runs on each side; (2) the two sides' min–max ranges do not overlap; (3) |median B − median A| exceeds the A/A noise for that metric (when an A/A run exists). Otherwise **no clear difference**. A side with no measured run is **not measured (reason)** — a failed or missing row is never counted as zero. Lower is better for every metric.

## Counts

- no clear difference: 183
- B faster: 12
- B slower: 5
- not measured: 20

## Foreign load observed (other programs, from the per-window interference watch)

- Windows watched: 81; verdicts: 0 clean, 81 disturbed, 0 unknown
- Foreign cores in use: median 6.1, max 16.3 (window averages)
- Side A windows: 42, median 6.3 cores, max 16.3 · Side B windows: 39, median 6 cores, max 15.7 (similar numbers mean the interleaving spread the load evenly)
- Top offenders (mean cores while present / max): swipekb-nextwor 6.5/12 (81 windows); qemu-system-x86 1.2/2.4 (63 windows); git 0.8/1 (69 windows); claude 0.1/0.3 (81 windows); cc1plus 4.5/5.6 (2 windows); python 0.6/1 (12 windows)

## Runs

| round | slot | side | exit | incomplete notes | report | problem |
|---|---|---|---|---|---|---|
| 1 | 1 | A | 4 | 17 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0939-254ff99-vs-254ff99-busy-AA-q7-aa/2026-10-22-0939-254ff99-r1-a.json` |  |
| 1 | 2 | A2 | 4 | 18 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0939-254ff99-vs-254ff99-busy-AA-q7-aa/2026-10-22-0946-254ff99-r1-a2.json` |  |
| 2 | 1 | A2 | 4 | 18 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0939-254ff99-vs-254ff99-busy-AA-q7-aa/2026-10-22-0951-254ff99-r2-a2.json` |  |
| 2 | 2 | A | 4 | 18 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0939-254ff99-vs-254ff99-busy-AA-q7-aa/2026-10-22-0955-254ff99-r2-a.json` |  |
| 3 | 1 | A | 4 | 18 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0939-254ff99-vs-254ff99-busy-AA-q7-aa/2026-10-22-0959-254ff99-r3-a.json` |  |
| 3 | 2 | A2 | 4 | 19 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/ab/2026-10-22-0939-254ff99-vs-254ff99-busy-AA-q7-aa/2026-10-22-1003-254ff99-r3-a2.json` |  |

## False alarms (A/A should show none)

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A | n B | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| csv-rows-64kib | rendererMaxDelayMs | 82.8 | 73.5 | -9.3 | -11.2% | 76.5–91.9 | 66.4–75 | 3 | 3 | B faster |
| csv-rows-256kib | mainMaxDelayMs | 0.5 | 4.1 | 3.6 | 720% | 0.4–0.7 | 3.6–4.5 | 3 | 3 | B slower |
| csv-wide-1024kib | peakPssMb | 841 | 803.1 | -37.9 | -4.5% | 810.6–845.6 | 798.9–807.3 | 3 | 3 | B faster |
| csv-wide-3072kib | peakPssMb | 826.4 | 795.7 | -30.7 | -3.7% | 823.3–884.2 | 732.9–798.7 | 3 | 3 | B faster |
| csv-quoted-64kib | peakPssMb | 820.3 | 758.8 | -61.5 | -7.5% | 788.7–861.2 | 733.9–760.8 | 3 | 3 | B faster |
| csv-quoted-256kib | peakPssMb | 822.5 | 761.8 | -60.7 | -7.4% | 773.6–875.1 | 733.2–762.9 | 3 | 3 | B faster |
| csv-quoted-1024kib | peakPssMb | 827.3 | 767.1 | -60.2 | -7.3% | 772.2–874.9 | 738–768.4 | 3 | 3 | B faster |
| csv-quoted-3072kib | peakPssMb | 850.3 | 781.5 | -68.8 | -8.1% | 792.8–887.3 | 771.3–790.4 | 3 | 3 | B faster |
| xlsx-merge-32x32 | inputLatencyMs | 46.7 | 78.1 | 31.4 | 67.2% | 38.3–53.2 | 61.9–81.9 | 3 | 3 | B slower |
| xlsx-merge-400x500 | inputLatencyMs | 61.6 | 58.6 | -3 | -4.9% | 60–120.6 | 56.6–59.7 | 3 | 3 | B faster |
| xlsx-merge-400x500 | peakPssMb | 759.2 | 777.5 | 18.3 | 2.4% | 756.4–764 | 765.8–815 | 3 | 3 | B slower |
| xlsx-sheets-8 | inputLatencyMs | 35.7 | 7.4 | -28.3 | -79.3% | 12.5–46.9 | 4–11.5 | 3 | 3 | B faster |
| docx-paragraphs-1000 | rendererMaxDelayMs | 24.1 | 31.6 | 7.5 | 31.1% | 20.6–25.3 | 28.6–38.6 | 3 | 3 | B slower |
| docx-table-250x10 | operationMs | 246.4 | 160.5 | -85.9 | -34.9% | 245.2–283.1 | 125.9–244.1 | 3 | 3 | B faster |
| large-diff-500 | inputLatencyMs | 3.5 | 2.3 | -1.2 | -34.3% | 2.6–3.9 | 1.9–2.4 | 3 | 3 | B faster |
| image-png-4096x3072 | operationMs | 644.3 | 534.7 | -109.6 | -17% | 590.7–685.5 | 415.3–571.7 | 3 | 3 | B faster |
| image-jpeg-original-wealth-game | rendererMaxDelayMs | 14.1 | 18.1 | 4 | 28.4% | 13.8–15 | 15.5–18.4 | 3 | 3 | B slower |

## Every rung and metric

n = measured runs (clean/disturbed windows). Times in ms, memory in MiB.

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A (clean/dist) | n B (clean/dist) | verdict | note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| csv-rows-64kib | operationMs | 128.1 | 128.9 | 0.8 | 0.6% | 123.2–146.3 | 128–134.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-64kib | rendererMaxDelayMs | 82.8 | 73.5 | -9.3 | -11.2% | 76.5–91.9 | 66.4–75 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| csv-rows-64kib | mainMaxDelayMs | 3.5 | 2 | -1.5 | -42.9% | 1.8–4.9 | 0.9–6.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-64kib | inputLatencyMs | 28.5 | 29.8 | 1.3 | 4.6% | 22.4–39.5 | 27.5–37.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-64kib | peakPssMb | 695.8 | 703.3 | 7.5 | 1.1% | 654.6–705.4 | 678.7–715.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-256kib | operationMs | 113 | 125.7 | 12.7 | 11.2% | 106.6–128.2 | 102.5–156.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-256kib | rendererMaxDelayMs | 79.1 | 76.3 | -2.8 | -3.5% | 79–81 | 74.8–103.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-256kib | mainMaxDelayMs | 0.5 | 4.1 | 3.6 | 720% | 0.4–0.7 | 3.6–4.5 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| csv-rows-256kib | inputLatencyMs | 19.1 | 18.7 | -0.4 | -2.1% | 15.2–20.2 | 7.3–33.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-256kib | peakPssMb | 694.6 | 701.7 | 7.1 | 1% | 667.9–708.6 | 683.7–721.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | operationMs | 143.1 | 142.1 | -1 | -0.7% | 129–146.5 | 115.6–149.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | rendererMaxDelayMs | 95.3 | 87.9 | -7.4 | -7.8% | 90.6–95.4 | 83.5–104.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | mainMaxDelayMs | 1 | 0.6 | -0.4 | -40% | 0.6–1.9 | 0.4–10.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | inputLatencyMs | 36.3 | 37.9 | 1.6 | 4.4% | 26.3–47.7 | 34.3–42.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-1024kib | peakPssMb | 741.1 | 704.6 | -36.5 | -4.9% | 720.9–748.9 | 654.4–744 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | operationMs | 217.3 | 191.2 | -26.1 | -12% | 159–255.4 | 164.2–198.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | rendererMaxDelayMs | 192.7 | 142.5 | -50.2 | -26.1% | 105.6–203.6 | 139.7–145 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | mainMaxDelayMs | 3.5 | 3.6 | 0.1 | 2.9% | 3.5–5.9 | 0.7–5.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | inputLatencyMs | 115.2 | 87.3 | -27.9 | -24.2% | 61.7–138.2 | 83.4–90.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-rows-3072kib | peakPssMb | 768.6 | 789.1 | 20.5 | 2.7% | 761.9–814.6 | 760–792.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | operationMs | 97.7 | 108.5 | 10.8 | 11.1% | 93.5–109.3 | 92.9–112.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | rendererMaxDelayMs | 79.5 | 66.9 | -12.6 | -15.8% | 75.4–80.6 | 60.3–82.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | mainMaxDelayMs | 0.4 | 0.8 | 0.4 | 100% | 0.4–0.7 | 0.4–2.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | inputLatencyMs | 9.5 | 4.1 | -5.4 | -56.8% | 4.9–12 | 3.7–11.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-64kib | peakPssMb | 796.9 | 784.5 | -12.4 | -1.6% | 765.2–810 | 758.9–787.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | operationMs | 139.7 | 107.8 | -31.9 | -22.8% | 112.8–144.3 | 106.5–140.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | rendererMaxDelayMs | 77.6 | 79.7 | 2.1 | 2.7% | 73.2–93.8 | 79.2–111.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | mainMaxDelayMs | 1 | 0.4 | -0.6 | -60% | 0.4–2.2 | 0.4–3.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | inputLatencyMs | 21.6 | 10.7 | -10.9 | -50.5% | 8.7–23.9 | 10.2–22.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-256kib | peakPssMb | 799.5 | 796.2 | -3.3 | -0.4% | 793.9–824.5 | 776.8–799.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | operationMs | 144 | 140.5 | -3.5 | -2.4% | 137.9–155.9 | 120.1–143.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | rendererMaxDelayMs | 107.1 | 101.2 | -5.9 | -5.5% | 104.6–110.1 | 76.3–104.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | mainMaxDelayMs | 0.8 | 3.7 | 2.9 | 362.5% | 0.5–3.8 | 2.4–3.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | inputLatencyMs | 31.5 | 27.7 | -3.8 | -12.1% | 25.7–45.7 | 24.5–31.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-1024kib | peakPssMb | 841 | 803.1 | -37.9 | -4.5% | 810.6–845.6 | 798.9–807.3 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| csv-wide-3072kib | operationMs | 165.3 | 163.5 | -1.8 | -1.1% | 158.4–308.5 | 151.4–210.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-3072kib | rendererMaxDelayMs | 131.4 | 144.2 | 12.8 | 9.7% | 117.9–187.7 | 127.1–146.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-3072kib | mainMaxDelayMs | 3.5 | 3.2 | -0.3 | -8.6% | 0.3–6.9 | 0.5–4.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-3072kib | inputLatencyMs | 64.6 | 65.1 | 0.5 | 0.8% | 63–115.1 | 63.9–93.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-wide-3072kib | peakPssMb | 826.4 | 795.7 | -30.7 | -3.7% | 823.3–884.2 | 732.9–798.7 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| csv-quoted-64kib | operationMs | 96.8 | 90.9 | -5.9 | -6.1% | 92.3–149.9 | 69.6–93.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-64kib | rendererMaxDelayMs | 61.9 | 50.5 | -11.4 | -18.4% | 53.2–66.9 | 48.5–60.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-64kib | mainMaxDelayMs | 1.8 | 3.8 | 2 | 111.1% | 0.5–3.8 | 0.7–4.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-64kib | inputLatencyMs | 17 | 14.7 | -2.3 | -13.5% | 5.1–21.7 | 3.6–16.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-64kib | peakPssMb | 820.3 | 758.8 | -61.5 | -7.5% | 788.7–861.2 | 733.9–760.8 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| csv-quoted-256kib | operationMs | 104.3 | 94 | -10.3 | -9.9% | 101.5–142.8 | 91.4–103.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-256kib | rendererMaxDelayMs | 77.8 | 61.7 | -16.1 | -20.7% | 72–94.7 | 53.7–81 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-256kib | mainMaxDelayMs | 1 | 3.4 | 2.4 | 240% | 0.5–6 | 0.7–3.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-256kib | inputLatencyMs | 14.2 | 3.4 | -10.8 | -76.1% | 14.2–32.3 | 3.3–19.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-256kib | peakPssMb | 822.5 | 761.8 | -60.7 | -7.4% | 773.6–875.1 | 733.2–762.9 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| csv-quoted-1024kib | operationMs | 107.9 | 98.7 | -9.2 | -8.5% | 95.1–146.5 | 88.3–140 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-1024kib | rendererMaxDelayMs | 79.5 | 69.5 | -10 | -12.6% | 69.1–110.4 | 64.7–74.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-1024kib | mainMaxDelayMs | 0.3 | 4.5 | 4.2 | 1400% | 0.3–0.8 | 0.5–4.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-1024kib | inputLatencyMs | 16.3 | 22.7 | 6.4 | 39.3% | 9.9–42.1 | 12.7–25.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-1024kib | peakPssMb | 827.3 | 767.1 | -60.2 | -7.3% | 772.2–874.9 | 738–768.4 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| csv-quoted-3072kib | operationMs | 152.5 | 150.7 | -1.8 | -1.2% | 127–203.9 | 147.3–182.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-3072kib | rendererMaxDelayMs | 112.7 | 120.3 | 7.6 | 6.7% | 108–167.5 | 92.1–122.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-3072kib | mainMaxDelayMs | 0.7 | 1.8 | 1.1 | 157.1% | 0.4–1.9 | 0.5–3.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-3072kib | inputLatencyMs | 58.1 | 50.3 | -7.8 | -13.4% | 51.1–99.6 | 41.4–78 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-quoted-3072kib | peakPssMb | 850.3 | 781.5 | -68.8 | -8.1% | 792.8–887.3 | 771.3–790.4 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| csv-fullread-5120kib | operationMs | 564.9 | 564.8 | -0.1 | 0% | 553.1–645.5 | 562.3–709.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-fullread-5120kib | rendererMaxDelayMs | 277.5 | 266.2 | -11.3 | -4.1% | 275.2–344.3 | 262.1–323.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-fullread-5120kib | mainMaxDelayMs | 5.5 | 3.5 | -2 | -36.4% | 1.4–15.8 | 0.5–5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-fullread-5120kib | inputLatencyMs | 224.1 | 215 | -9.1 | -4.1% | 221.2–290.1 | 210.4–287 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| csv-fullread-5120kib | peakPssMb | 837 | 842 | 5 | 0.6% | 822.1–843.1 | 837.5–842.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | operationMs | 403.9 | 434.2 | 30.3 | 7.5% | 292.5–444.5 | 239.1–466.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | rendererMaxDelayMs | 81.2 | 76.2 | -5 | -6.2% | 66.2–82.6 | 75.7–76.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | mainMaxDelayMs | 2.5 | 3.9 | 1.4 | 56% | 0.8–5 | 2.5–5.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | inputLatencyMs | 46.7 | 78.1 | 31.4 | 67.2% | 38.3–53.2 | 61.9–81.9 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| xlsx-merge-32x32 | peakPssMb | 695.3 | 689.3 | -6 | -0.9% | 693.3–702.5 | 662–696.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | operationMs | 93.9 | 97.7 | 3.8 | 4% | 93.4–99.1 | 76.3–118.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | rendererMaxDelayMs | 10.1 | 12.9 | 2.8 | 27.7% | 8.6–22.4 | 9.1–19.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | mainMaxDelayMs | 0.6 | 0.4 | -0.2 | -33.3% | 0.4–1 | 0.3–4.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | inputLatencyMs | 6.7 | 9.3 | 2.6 | 38.8% | 6.6–12.3 | 1.9–11.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | peakPssMb | 700.1 | 694.2 | -5.9 | -0.8% | 693–702.3 | 658.4–696.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | operationMs | 166.9 | 149.5 | -17.4 | -10.4% | 116.9–193.3 | 117.1–192.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | rendererMaxDelayMs | 42.5 | 40.6 | -1.9 | -4.5% | 41.6–60.3 | 37.8–42.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | mainMaxDelayMs | 1 | 2.4 | 1.4 | 140% | 0.8–2.8 | 0.5–4.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | inputLatencyMs | 25.7 | 19.6 | -6.1 | -23.7% | 8.1–33.7 | 9.8–32.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | peakPssMb | 744 | 739.9 | -4.1 | -0.6% | 738.6–753.5 | 702.8–742 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | operationMs | 248.3 | 246.3 | -2 | -0.8% | 243.9–352.1 | 219.7–249.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | rendererMaxDelayMs | 87.9 | 89 | 1.1 | 1.3% | 85.9–116.3 | 87.1–103.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | mainMaxDelayMs | 7.4 | 3.6 | -3.8 | -51.4% | 3.9–13 | 0.6–6.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | inputLatencyMs | 61.6 | 58.6 | -3 | -4.9% | 60–120.6 | 56.6–59.7 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| xlsx-merge-400x500 | peakPssMb | 759.2 | 777.5 | 18.3 | 2.4% | 756.4–764 | 765.8–815 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| xlsx-sheets-1 | operationMs | 114.7 | 128.3 | 13.6 | 11.9% | 98.8–152.9 | 109.3–142.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-1 | rendererMaxDelayMs | 75.6 | 76.1 | 0.5 | 0.7% | 72.7–125.8 | 67.6–86.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-1 | mainMaxDelayMs | 0.6 | 2.1 | 1.5 | 250% | 0.4–1.8 | 0.4–3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-1 | inputLatencyMs | 20.3 | 31.8 | 11.5 | 56.7% | 18.4–58.8 | 16.5–46.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-1 | peakPssMb | 762.1 | 760.4 | -1.7 | -0.2% | 759.6–766.4 | 740.1–784.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-8 | operationMs | 144.8 | 146.2 | 1.4 | 1% | 142.2–185.3 | 144.1–147.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-8 | rendererMaxDelayMs | 68.6 | 67.2 | -1.4 | -2% | 63.7–72.2 | 62–74 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-8 | mainMaxDelayMs | 1.2 | 3.9 | 2.7 | 225% | 0.5–2.5 | 0.4–4.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-8 | inputLatencyMs | 35.7 | 7.4 | -28.3 | -79.3% | 12.5–46.9 | 4–11.5 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| xlsx-sheets-8 | peakPssMb | 776.9 | 773 | -3.9 | -0.5% | 772.7–781.4 | 756.5–799.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-32 | operationMs | 260.8 | 265.2 | 4.4 | 1.7% | 243.8–309.7 | 254.3–302.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-32 | rendererMaxDelayMs | 68.3 | 76.4 | 8.1 | 11.9% | 65.4–119.6 | 72.6–76.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-32 | mainMaxDelayMs | 1.2 | 4 | 2.8 | 233.3% | 0.6–2 | 2–5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-32 | inputLatencyMs | 26.1 | 20.3 | -5.8 | -22.2% | 8–55.2 | 12.7–48.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| xlsx-sheets-32 | peakPssMb | 795.2 | 788.3 | -6.9 | -0.9% | 787.5–799.9 | 777.5–814.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-100 | operationMs | 168.7 | 147.9 | -20.8 | -12.3% | 148.9–197.3 | 147.8–404.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-100 | rendererMaxDelayMs | 43.6 | 37.1 | -6.5 | -14.9% | 38–49.5 | 36.6–48.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-100 | mainMaxDelayMs | 1.9 | 4.7 | 2.8 | 147.4% | 1.5–4 | 3.1–5.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-100 | inputLatencyMs | 32 | 42.9 | 10.9 | 34.1% | 27.1–52.4 | 15.5–50.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-100 | peakPssMb | 691.8 | 682.3 | -9.5 | -1.4% | 681.8–716.2 | 681.1–691.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | operationMs | 126.7 | 111.7 | -15 | -11.8% | 102.1–141.1 | 107.7–139.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | rendererMaxDelayMs | 24.1 | 31.6 | 7.5 | 31.1% | 20.6–25.3 | 28.6–38.6 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| docx-paragraphs-1000 | mainMaxDelayMs | 4.5 | 3.1 | -1.4 | -31.1% | 0.4–7.2 | 0.8–4.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | inputLatencyMs | 21.4 | 19.6 | -1.8 | -8.4% | 9.4–34.6 | 17.4–22.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | peakPssMb | 691.5 | 684.6 | -6.9 | -1% | 683.9–705.6 | 682.7–687.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | operationMs | 348.7 | 335.9 | -12.8 | -3.7% | 319–354.3 | 319.6–367.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | rendererMaxDelayMs | 189.7 | 147.1 | -42.6 | -22.5% | 171.3–278.9 | 139.7–177.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | mainMaxDelayMs | 7.3 | 1.7 | -5.6 | -76.7% | 0.5–7.7 | 0.8–4.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | inputLatencyMs | 144.7 | 126.3 | -18.4 | -12.7% | 113.6–194.2 | 115.3–148.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | peakPssMb | 790.8 | 787.4 | -3.4 | -0.4% | 739.2–801.1 | 787.2–802.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | operationMs | 58.4 | 55.1 | -3.3 | -5.7% | 49.8–91.8 | 50.2–68.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | rendererMaxDelayMs | 15.5 | 26.2 | 10.7 | 69% | 10–20.2 | 17.2–29.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | mainMaxDelayMs | 1 | 0.5 | -0.5 | -50% | 0.6–2.4 | 0.4–3.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | inputLatencyMs | 4.8 | 10.5 | 5.7 | 118.8% | 3.1–14.6 | 5.3–15.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-25x10 | peakPssMb | 819.3 | 809.9 | -9.4 | -1.1% | 802.9–867.3 | 803.7–868.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-250x10 | operationMs | 246.4 | 160.5 | -85.9 | -34.9% | 245.2–283.1 | 125.9–244.1 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| docx-table-250x10 | rendererMaxDelayMs | 100.9 | 94.5 | -6.4 | -6.3% | 88.4–137.6 | 90.5–110.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-250x10 | mainMaxDelayMs | 2.5 | 4 | 1.5 | 60% | 1.9–4.3 | 1.3–5.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-250x10 | inputLatencyMs | 93 | 78.3 | -14.7 | -15.8% | 71.9–111.2 | 75.5–97.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-250x10 | peakPssMb | 831 | 827.4 | -3.6 | -0.4% | 828.5–868.5 | 794.8–863.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-1000x10 | operationMs | 897.9 | 889.8 | -8.1 | -0.9% | 860.8–1098.6 | 852.5–1039 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-1000x10 | rendererMaxDelayMs | 845.6 | 843.1 | -2.5 | -0.3% | 688.9–875.4 | 741–957.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-1000x10 | mainMaxDelayMs | 4.2 | 3.6 | -0.6 | -14.3% | 3.9–7.3 | 1.5–3.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-1000x10 | inputLatencyMs | 446.2 | 349.4 | -96.8 | -21.7% | 351.6–596.4 | 340.8–443.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| docx-table-1000x10 | peakPssMb | 1041.5 | 1046.3 | 4.8 | 0.5% | 1023.1–1241.2 | 1025.3–1102 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| html-assets-1x256 | operationMs | 350.7 | — | — | — | 350.7–350.7 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-1x256 | rendererMaxDelayMs | 38.8 | — | — | — | 38.8–38.8 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-1x256 | mainMaxDelayMs | 6.4 | — | — | — | 6.4–6.4 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-1x256 | inputLatencyMs | 20.8 | — | — | — | 20.8–20.8 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-1x256 | peakPssMb | 685.1 | — | — | — | 685.1–685.1 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | operationMs | 561.6 | — | — | — | 561.6–561.6 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | rendererMaxDelayMs | 101.9 | — | — | — | 101.9–101.9 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | mainMaxDelayMs | 4.7 | — | — | — | 4.7–4.7 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | inputLatencyMs | 22.5 | — | — | — | 22.5–22.5 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | peakPssMb | 718.4 | — | — | — | 718.4–718.4 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | operationMs | 2904.5 | — | — | — | 2904.5–2904.5 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | rendererMaxDelayMs | 496.9 | — | — | — | 496.9–496.9 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | mainMaxDelayMs | 15.6 | — | — | — | 15.6–15.6 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | inputLatencyMs | 260.1 | — | — | — | 260.1–260.1 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | peakPssMb | 867.7 | — | — | — | 867.7–867.7 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | operationMs | 464.3 | — | — | — | 464.3–464.3 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | rendererMaxDelayMs | 112.6 | — | — | — | 112.6–112.6 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | mainMaxDelayMs | 5.5 | — | — | — | 5.5–5.5 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | inputLatencyMs | 8.4 | — | — | — | 8.4–8.4 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | peakPssMb | 813.7 | — | — | — | 813.7–813.7 | — | 1 (0/1) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| path-list-1000 | operationMs | 149.3 | 146 | -3.3 | -2.2% | 145.3–205.5 | 142.7–352.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-1000 | rendererMaxDelayMs | 130.9 | 128.7 | -2.2 | -1.7% | 128.3–187.6 | 124.1–336.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-1000 | mainMaxDelayMs | 0.6 | 0.6 | 0 | 0% | 0.4–0.8 | 0.5–0.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-1000 | inputLatencyMs | 82.3 | 76.9 | -5.4 | -6.6% | 77.9–124.6 | 74.6–143.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-1000 | peakPssMb | 691.7 | 694.7 | 3 | 0.4% | 682.2–695.8 | 635.7–695.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | operationMs | 1201.9 | 1257.8 | 55.9 | 4.7% | 1196.9–1350.5 | 1240.1–1514.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | rendererMaxDelayMs | 1189.8 | 1214.8 | 25 | 2.1% | 1181.7–1337.2 | 1172.3–1513.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | mainMaxDelayMs | 0.6 | 0.7 | 0.1 | 16.7% | 0.6–1 | 0.6–1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | inputLatencyMs | 1110.1 | 1145.6 | 35.5 | 3.2% | 1098.3–1258.1 | 1116.7–1412.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-10000 | peakPssMb | 953.7 | 953.9 | 0.2 | 0% | 940.1–955.5 | 895.2–957.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-20000 | operationMs | 3649.6 | 3814.9 | 165.3 | 4.5% | 3610.3–4720.4 | 3651.2–4112.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-20000 | rendererMaxDelayMs | 3654.6 | 3793.1 | 138.5 | 3.8% | 3632.2–4703.5 | 3627.8–4081.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-20000 | mainMaxDelayMs | 0.6 | 0.9 | 0.3 | 50% | 0.6–2.5 | 0.8–1.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-20000 | inputLatencyMs | 3492.8 | 3579.7 | 86.9 | 2.5% | 3455.9–4561.6 | 3474.6–3913.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| path-list-20000 | peakPssMb | 1375 | 1375.9 | 0.9 | 0.1% | 1361.1–1423.2 | 1317.4–1396.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-500 | operationMs | 95.6 | 95.5 | -0.1 | -0.1% | 93.7–106.9 | 72.4–100.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-500 | rendererMaxDelayMs | 13.5 | 14.2 | 0.7 | 5.2% | 11.9–23.3 | 13.2–20 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-500 | mainMaxDelayMs | 0.5 | 0.7 | 0.2 | 40% | 0.4–0.9 | 0.5–0.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-500 | inputLatencyMs | 3.5 | 2.3 | -1.2 | -34.3% | 2.6–3.9 | 1.9–2.4 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| large-diff-500 | peakPssMb | 677.2 | 629.5 | -47.7 | -7% | 630.1–692.6 | 625.5–681.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-5000 | operationMs | 151.6 | 149.1 | -2.5 | -1.6% | 142.1–187.8 | 117.3–192.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-5000 | rendererMaxDelayMs | 12.9 | 6.7 | -6.2 | -48.1% | 2–16 | 4.4–10.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-5000 | mainMaxDelayMs | 0.9 | 0.5 | -0.4 | -44.4% | 0.4–1 | 0.4–0.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-5000 | inputLatencyMs | 3.2 | 3.4 | 0.2 | 6.3% | 2.1–5.3 | 2.8–6.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-5000 | peakPssMb | 694.2 | 643.6 | -50.6 | -7.3% | 644.6–708.6 | 640.6–697.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-20000 | operationMs | 1047 | 1048.5 | 1.5 | 0.1% | 1020.8–1350.1 | 1005.2–1168.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-20000 | rendererMaxDelayMs | 15.9 | 17 | 1.1 | 6.9% | 9.1–16.8 | 10–18.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-20000 | mainMaxDelayMs | 1.1 | 1.4 | 0.3 | 27.3% | 0.6–2.6 | 0.7–4.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-20000 | inputLatencyMs | 5.7 | 4.4 | -1.3 | -22.8% | 4.2–12.7 | 2.8–6.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| large-diff-20000 | peakPssMb | 719 | 674.3 | -44.7 | -6.2% | 683.8–734.7 | 674–731.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| background-index-large-history | operationMs | 3210.8 | 3205.2 | -5.6 | -0.2% | 3206.4–3275.3 | 3180.4–3248.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| background-index-large-history | rendererMaxDelayMs | 13.1 | 15.3 | 2.2 | 16.8% | 10.3–13.8 | 13.1–16.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| background-index-large-history | mainMaxDelayMs | 1 | 0.7 | -0.3 | -30% | 0.8–1.3 | 0.6–0.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| background-index-large-history | inputLatencyMs | 2.1 | 2.1 | 0 | 0% | 2–2.5 | 2–2.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| background-index-large-history | peakPssMb | 703.3 | 701.9 | -1.4 | -0.2% | 645.1–731.2 | 674.1–712.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | operationMs | 172.1 | 126.1 | -46 | -26.7% | 122.8–208 | 99.8–127.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | rendererMaxDelayMs | 59.4 | 53.6 | -5.8 | -9.8% | 54.5–69 | 50.1–79.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | mainMaxDelayMs | 7.4 | 3.9 | -3.5 | -47.3% | 2.4–7.5 | 1.9–4.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | inputLatencyMs | 42.4 | 37.1 | -5.3 | -12.5% | 42.1–49.7 | 13.2–47.5 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-1024x768 | peakPssMb | 767.5 | 775.8 | 8.3 | 1.1% | 738.7–775 | 728.4–799.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-2048x1536 | operationMs | 163.5 | 162.8 | -0.7 | -0.4% | 155.9–205.9 | 154.2–183.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-2048x1536 | rendererMaxDelayMs | 34.8 | 33.8 | -1 | -2.9% | 33.2–41.4 | 33.7–41 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-2048x1536 | mainMaxDelayMs | 4.8 | 6.7 | 1.9 | 39.6% | 3.9–8 | 4.4–6.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-2048x1536 | inputLatencyMs | 14.5 | 17.1 | 2.6 | 17.9% | 11.3–19 | 9.1–18.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-2048x1536 | peakPssMb | 951.4 | 959 | 7.6 | 0.8% | 840.4–954 | 894.3–983.3 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-4096x3072 | operationMs | 644.3 | 534.7 | -109.6 | -17% | 590.7–685.5 | 415.3–571.7 | 3 (0/3) | 3 (0/3) | B faster | ranges separate; no A/A noise available |
| image-png-4096x3072 | rendererMaxDelayMs | 114.2 | 77.4 | -36.8 | -32.2% | 91.2–202.4 | 76–106.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-4096x3072 | mainMaxDelayMs | 10.3 | 8.5 | -1.8 | -17.5% | 6.2–10.7 | 8.4–10.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-4096x3072 | inputLatencyMs | 71.6 | 76 | 4.4 | 6.1% | 40.4–140.1 | 40.7–87.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-png-4096x3072 | peakPssMb | 1209.2 | 1273.9 | 64.7 | 5.4% | 1122.3–1210.9 | 1185–1282.4 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | operationMs | 100.3 | 102.1 | 1.8 | 1.8% | 95.9–164 | 94.7–126.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | rendererMaxDelayMs | 13.8 | 14.9 | 1.1 | 8% | 9–27.3 | 10.8–16.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | mainMaxDelayMs | 5.9 | 6.7 | 0.8 | 13.6% | 3.8–9.8 | 4.5–8.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | inputLatencyMs | 8.8 | 7.7 | -1.1 | -12.5% | 3.7–9.5 | 5.8–16.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | peakPssMb | 722.7 | 752.7 | 30 | 4.2% | 705.4–768.9 | 740.2–755.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | operationMs | 81.1 | 100.4 | 19.3 | 23.8% | 71.7–95.3 | 95.2–105.5 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| image-jpeg-2048x1536 | rendererMaxDelayMs | 16.1 | 13.5 | -2.6 | -16.1% | 14.5–16.6 | 12.2–14.8 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| image-jpeg-2048x1536 | mainMaxDelayMs | 5.8 | 4 | -1.8 | -31% | 3.6–10.2 | 2.9–5 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| image-jpeg-2048x1536 | inputLatencyMs | 6.4 | 4.9 | -1.5 | -23.4% | 2.2–8.9 | 4.8–5.1 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| image-jpeg-2048x1536 | peakPssMb | 769.8 | 764.8 | -5 | -0.6% | 765.6–788.2 | 760.7–768.8 | 3 (0/3) | 2 (0/2) | no clear difference | too few measured runs (A 3, B 2; need 3 each) |
| image-jpeg-4096x3072 | operationMs | 399.1 | 244.7 | -154.4 | -38.7% | 181.7–583.4 | 139.8–257.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | rendererMaxDelayMs | 35.4 | 24.8 | -10.6 | -29.9% | 22.6–38.9 | 23.4–47.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | mainMaxDelayMs | 5.2 | 5.7 | 0.5 | 9.6% | 5–6.5 | 3.3–6.1 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | inputLatencyMs | 19.4 | 10.1 | -9.3 | -47.9% | 9–28.5 | 3.6–19.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | peakPssMb | 1077.1 | 1094.5 | 17.4 | 1.6% | 1029.8–1104.7 | 1076.4–1107.2 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | operationMs | 134.8 | 100.6 | -34.2 | -25.4% | 127.9–201.4 | 73.1–130.8 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | rendererMaxDelayMs | 14.1 | 18.1 | 4 | 28.4% | 13.8–15 | 15.5–18.4 | 3 (0/3) | 3 (0/3) | B slower | ranges separate; no A/A noise available |
| image-jpeg-original-wealth-game | mainMaxDelayMs | 4.2 | 4 | -0.2 | -4.8% | 4.1–8.1 | 3.8–4.9 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | inputLatencyMs | 7.2 | 4.9 | -2.3 | -31.9% | 4.6–30.7 | 2–5.6 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | peakPssMb | 776.3 | 748.6 | -27.7 | -3.6% | 748.2–778.3 | 744.6–750.7 | 3 (0/3) | 3 (0/3) | no clear difference | ranges overlap |
