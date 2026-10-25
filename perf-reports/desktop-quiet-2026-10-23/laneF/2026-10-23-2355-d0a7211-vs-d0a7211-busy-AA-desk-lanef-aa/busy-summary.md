# A/A noise check — busy machine, exploratory — interleaved design

> **Busy machine, exploratory.** Measured without waiting for a quiet machine; other programs were using the CPU the whole time (see Foreign load). This is NOT a clean/strict comparison (the strict path in `compare.mjs` still refuses such reports). Reliability comes from the design: runs alternate order every round so background load hits both sides alike, each side is judged on its median and range over several runs, and an A/A run shows what "no change" looks like here.

- Side A (first slot): `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded-A`
- Side B (second slot — the SAME candidate): `/home/destin/youcoded-dev/worktrees/sessions/93-freeze-combined/youcoded-A`
- Rounds: 3, order alternates every round: A,A2,A2,A…
- A/A noise used: none — verdicts use the range rule only

## Verdict rule (conservative)

B is called **faster/slower** only when ALL hold: (1) at least 3 measured runs on each side; (2) the two sides' min–max ranges do not overlap; (3) |median B − median A| exceeds the A/A noise for that metric (when an A/A run exists). Otherwise **no clear difference**. A side with no measured run is **not measured (reason)** — a failed or missing row is never counted as zero. Lower is better for every metric.

## Counts

- no clear difference: 180
- B slower: 11
- B faster: 4
- not measured: 25

## Foreign load observed (other programs, from the per-window interference watch)

- Windows watched: 78; verdicts: 78 clean, 0 disturbed, 0 unknown
- Foreign cores in use: median 0.7, max 0.7 (window averages)
- Side A windows: 39, median 0.7 cores, max 0.7 · Side B windows: 39, median 0.7 cores, max 0.7 (similar numbers mean the interleaving spread the load evenly)
- Top offenders (mean cores while present / max): youcoded 0.5/0.5 (78 windows); kwin_wayland 0.1/0.1 (78 windows); coolercontrold 0.1/0.1 (57 windows)

## Runs

| round | slot | side | exit | incomplete notes | report | problem |
|---|---|---|---|---|---|---|
| 1 | 1 | A | 4 | 2 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2355-d0a7211-vs-d0a7211-busy-AA-desk-lanef-aa/2026-10-23-2355-d0a7211-r1-a.json` |  |
| 1 | 2 | A2 | 4 | 6 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2355-d0a7211-vs-d0a7211-busy-AA-desk-lanef-aa/2026-10-23-2359-d0a7211-r1-a2.json` |  |
| 2 | 1 | A2 | 4 | 6 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2355-d0a7211-vs-d0a7211-busy-AA-desk-lanef-aa/2026-10-24-0003-d0a7211-r2-a2.json` |  |
| 2 | 2 | A | 4 | 6 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2355-d0a7211-vs-d0a7211-busy-AA-desk-lanef-aa/2026-10-24-0007-d0a7211-r2-a.json` |  |
| 3 | 1 | A | 4 | 6 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2355-d0a7211-vs-d0a7211-busy-AA-desk-lanef-aa/2026-10-24-0010-d0a7211-r3-a.json` |  |
| 3 | 2 | A2 | 4 | 6 | `/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/perf-reports/desk/laneF/2026-10-23-2355-d0a7211-vs-d0a7211-busy-AA-desk-lanef-aa/2026-10-24-0014-d0a7211-r3-a2.json` |  |

## False alarms (A/A should show none)

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A | n B | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| csv-rows-256kib | operationMs | 95.7 | 97.1 | 1.4 | 1.5% | 95.5–96.2 | 96.9–97.4 | 3 | 3 | B slower |
| csv-wide-64kib | mainMaxDelayMs | 0.8 | 0.3 | -0.5 | -62.5% | 0.6–0.8 | 0.3–0.4 | 3 | 3 | B faster |
| csv-quoted-64kib | rendererMaxDelayMs | 40.6 | 46.3 | 5.7 | 14% | 30.2–43.2 | 45.9–50.3 | 3 | 3 | B slower |
| csv-quoted-64kib | mainMaxDelayMs | 0.7 | 1.1 | 0.4 | 57.1% | 0.3–0.8 | 1.1–3.2 | 3 | 3 | B slower |
| csv-quoted-1024kib | inputLatencyMs | 17.5 | 21.5 | 4 | 22.9% | 14.6–19.5 | 19.6–23.3 | 3 | 3 | B slower |
| csv-fullread-5120kib | rendererMaxDelayMs | 244.6 | 250.6 | 6 | 2.5% | 232–248.4 | 249–255.4 | 3 | 3 | B slower |
| xlsx-merge-128x128 | mainMaxDelayMs | 0.3 | 0.6 | 0.3 | 100% | 0.3–0.4 | 0.5–0.7 | 3 | 3 | B slower |
| xlsx-sheets-8 | mainMaxDelayMs | 0.4 | 9 | 8.6 | 2150% | 0.2–0.6 | 1–10.1 | 3 | 3 | B slower |
| xlsx-sheets-32 | rendererMaxDelayMs | 74.9 | 59.9 | -15 | -20% | 73.8–78.9 | 42–66.8 | 3 | 3 | B faster |
| xlsx-sheets-32 | peakPssMb | 843.5 | 786.4 | -57.1 | -6.8% | 818.9–864.3 | 776.8–818.6 | 3 | 3 | B faster |
| docx-paragraphs-100 | inputLatencyMs | 22.9 | 27.4 | 4.5 | 19.7% | 21.6–24.4 | 24.7–29.3 | 3 | 3 | B slower |
| large-diff-5000 | operationMs | 123.7 | 153.2 | 29.5 | 23.8% | 108.3–128 | 129.3–155.4 | 3 | 3 | B slower |
| large-diff-5000 | inputLatencyMs | 2 | 2.9 | 0.9 | 45% | 1.6–2.1 | 2.9–3.3 | 3 | 3 | B slower |
| large-diff-20000 | inputLatencyMs | 5.7 | 2.6 | -3.1 | -54.4% | 4.6–5.8 | 2.2–2.7 | 3 | 3 | B faster |
| background-index-large-history | peakPssMb | 711.5 | 730 | 18.5 | 2.6% | 710.5–723.8 | 725.1–731.8 | 3 | 3 | B slower |

## Every rung and metric

n = measured runs (clean/disturbed windows). Times in ms, memory in MiB.

| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A (clean/dist) | n B (clean/dist) | verdict | note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| csv-rows-64kib | operationMs | 107.5 | 114.7 | 7.2 | 6.7% | 95.3–120.8 | 112.6–122.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-64kib | rendererMaxDelayMs | 74.6 | 77.5 | 2.9 | 3.9% | 69.7–76.5 | 67.8–81.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-64kib | mainMaxDelayMs | 0.6 | 0.8 | 0.2 | 33.3% | 0.5–2.2 | 0.3–0.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-64kib | inputLatencyMs | 21.8 | 22.7 | 0.9 | 4.1% | 20.3–22.6 | 21.8–24.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-64kib | peakPssMb | 658.9 | 707.9 | 49 | 7.4% | 658.6–710.8 | 703–709 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-256kib | operationMs | 95.7 | 97.1 | 1.4 | 1.5% | 95.5–96.2 | 96.9–97.4 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-rows-256kib | rendererMaxDelayMs | 66.2 | 70.9 | 4.7 | 7.1% | 66.1–71.9 | 67.8–72 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-256kib | mainMaxDelayMs | 0.8 | 0.4 | -0.4 | -50% | 0.3–0.8 | 0.3–0.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-256kib | inputLatencyMs | 7.4 | 9.4 | 2 | 27% | 7.3–9.4 | 6.7–12.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-256kib | peakPssMb | 658.5 | 712.3 | 53.8 | 8.2% | 656.2–709.9 | 707.2–713 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-1024kib | operationMs | 107.9 | 111 | 3.1 | 2.9% | 104.3–112.5 | 108.2–111.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-1024kib | rendererMaxDelayMs | 80.5 | 89.9 | 9.4 | 11.7% | 78.4–93.2 | 68.5–92 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-1024kib | mainMaxDelayMs | 0.6 | 0.3 | -0.3 | -50% | 0.3–0.8 | 0.3–1.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-1024kib | inputLatencyMs | 23.8 | 28.1 | 4.3 | 18.1% | 21.6–26.6 | 24.5–29.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-1024kib | peakPssMb | 686.9 | 742.3 | 55.4 | 8.1% | 685.1–737.9 | 737.1–743.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-3072kib | operationMs | 161 | 161 | 0 | 0% | 160.7–163.4 | 140.2–165.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-3072kib | rendererMaxDelayMs | 115.9 | 122.2 | 6.3 | 5.4% | 115.8–117.8 | 116.6–122.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-3072kib | mainMaxDelayMs | 2.5 | 1.2 | -1.3 | -52% | 1.1–2.8 | 0.6–2.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-3072kib | inputLatencyMs | 65.6 | 68.4 | 2.8 | 4.3% | 65–68.7 | 66.6–73.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-rows-3072kib | peakPssMb | 785.4 | 838 | 52.6 | 6.7% | 785–838.3 | 783.4–843.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-64kib | operationMs | 93.3 | 96.7 | 3.4 | 3.6% | 91–96.2 | 83.1–100.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-64kib | rendererMaxDelayMs | 62.1 | 64.3 | 2.2 | 3.5% | 61.2–66.5 | 37.2–79.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-64kib | mainMaxDelayMs | 0.8 | 0.3 | -0.5 | -62.5% | 0.6–0.8 | 0.3–0.4 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| csv-wide-64kib | inputLatencyMs | 3.7 | 24.8 | 21.1 | 570.3% | 2.3–4.4 | 3.3–27.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-64kib | peakPssMb | 790.5 | 843 | 52.5 | 6.6% | 789.8–843.2 | 788–849.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-256kib | operationMs | 101.7 | 102.7 | 1 | 1% | 100.5–105 | 98.7–110.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-256kib | rendererMaxDelayMs | 76.4 | 77.3 | 0.9 | 1.2% | 75.3–77.4 | 72.7–78.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-256kib | mainMaxDelayMs | 0.6 | 0.6 | 0 | 0% | 0.4–0.6 | 0.5–4.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-256kib | inputLatencyMs | 13.3 | 15.1 | 1.8 | 13.5% | 10–14.9 | 12.9–28.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-256kib | peakPssMb | 808.7 | 851.3 | 42.6 | 5.3% | 805.8–861.7 | 805.6–859.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-1024kib | operationMs | 112 | 111.2 | -0.8 | -0.7% | 108.7–115.2 | 110.2–113.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-1024kib | rendererMaxDelayMs | 92.6 | 92.9 | 0.3 | 0.3% | 90–94 | 92–109.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-1024kib | mainMaxDelayMs | 0.4 | 0.3 | -0.1 | -25% | 0.4–0.6 | 0.3–1.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-1024kib | inputLatencyMs | 24.4 | 26.3 | 1.9 | 7.8% | 21.7–29.8 | 20.8–27.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-1024kib | peakPssMb | 830.3 | 828.1 | -2.2 | -0.3% | 826.8–861.7 | 819.6–859.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | operationMs | 150.3 | 152.1 | 1.8 | 1.2% | 150.3–150.8 | 149.6–152.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | rendererMaxDelayMs | 128 | 129.1 | 1.1 | 0.9% | 119.9–128.6 | 122–129.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | mainMaxDelayMs | 0.5 | 0.7 | 0.2 | 40% | 0.3–0.6 | 0.3–1.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | inputLatencyMs | 65.2 | 66.1 | 0.9 | 1.4% | 60.3–65.8 | 59.5–66.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-wide-3072kib | peakPssMb | 851.8 | 847.8 | -4 | -0.5% | 821–855.3 | 822–858.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-64kib | operationMs | 64.3 | 66.2 | 1.9 | 3% | 61.6–70 | 66–70.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-64kib | rendererMaxDelayMs | 40.6 | 46.3 | 5.7 | 14% | 30.2–43.2 | 45.9–50.3 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-quoted-64kib | mainMaxDelayMs | 0.7 | 1.1 | 0.4 | 57.1% | 0.3–0.8 | 1.1–3.2 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-quoted-64kib | inputLatencyMs | 11.3 | 11.5 | 0.2 | 1.8% | 8.7–17.9 | 11.3–15.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-64kib | peakPssMb | 848.1 | 843.4 | -4.7 | -0.6% | 808.3–851 | 810.9–852.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | operationMs | 73.3 | 91.8 | 18.5 | 25.2% | 71–97.6 | 78.6–103.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | rendererMaxDelayMs | 51.8 | 59.6 | 7.8 | 15.1% | 49.7–59.3 | 58.4–74.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | mainMaxDelayMs | 0.6 | 0.5 | -0.1 | -16.7% | 0.4–0.7 | 0.5–1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | inputLatencyMs | 3.1 | 4.5 | 1.4 | 45.2% | 2.1–18.3 | 4.1–22.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-256kib | peakPssMb | 849.1 | 813.4 | -35.7 | -4.2% | 809.5–851.4 | 812.3–816.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-1024kib | operationMs | 96.2 | 94.3 | -1.9 | -2% | 94.7–97.6 | 93.1–101.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-1024kib | rendererMaxDelayMs | 69.8 | 71.1 | 1.3 | 1.9% | 69.5–70.1 | 69.7–72.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-1024kib | mainMaxDelayMs | 0.5 | 0.5 | 0 | 0% | 0.3–0.5 | 0.3–0.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-1024kib | inputLatencyMs | 17.5 | 21.5 | 4 | 22.9% | 14.6–19.5 | 19.6–23.3 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-quoted-1024kib | peakPssMb | 849.9 | 814.5 | -35.4 | -4.2% | 809.9–852.6 | 813.1–816 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-3072kib | operationMs | 122.3 | 123.7 | 1.4 | 1.1% | 116.4–128.7 | 123–125.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-3072kib | rendererMaxDelayMs | 103.5 | 104.6 | 1.1 | 1.1% | 94.8–106.6 | 103.8–105.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-3072kib | mainMaxDelayMs | 0.3 | 0.6 | 0.3 | 100% | 0.3–0.6 | 0.3–0.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-3072kib | inputLatencyMs | 51.4 | 49.6 | -1.8 | -3.5% | 42.3–55 | 45.9–51.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-quoted-3072kib | peakPssMb | 828.8 | 792.6 | -36.2 | -4.4% | 789–830.4 | 792.3–795.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-fullread-5120kib | operationMs | 553.6 | 554.6 | 1 | 0.2% | 549.4–562.8 | 546.6–565.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-fullread-5120kib | rendererMaxDelayMs | 244.6 | 250.6 | 6 | 2.5% | 232–248.4 | 249–255.4 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| csv-fullread-5120kib | mainMaxDelayMs | 3.4 | 1.2 | -2.2 | -64.7% | 0.9–3.4 | 0.7–4.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-fullread-5120kib | inputLatencyMs | 213 | 218.6 | 5.6 | 2.6% | 206.9–222.6 | 213–226.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| csv-fullread-5120kib | peakPssMb | 833.5 | 841.9 | 8.4 | 1% | 828.9–842.4 | 827.3–846.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | operationMs | 403.6 | 404.6 | 1 | 0.2% | 402.2–409 | 399.4–420.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | rendererMaxDelayMs | 60.4 | 60.2 | -0.2 | -0.3% | 59.3–64.9 | 59.7–65.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | mainMaxDelayMs | 1 | 2.4 | 1.4 | 140% | 0.3–3.6 | 1.6–2.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | inputLatencyMs | 67.1 | 67.7 | 0.6 | 0.9% | 66.1–71.5 | 67.3–72.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-32x32 | peakPssMb | 704 | 707.5 | 3.5 | 0.5% | 666.3–708.5 | 665.7–709.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | operationMs | 75 | 72.7 | -2.3 | -3.1% | 61.4–75.5 | 54.3–78.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | rendererMaxDelayMs | 10.4 | 12.3 | 1.9 | 18.3% | 9.4–21.4 | 7.9–14.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | mainMaxDelayMs | 0.3 | 0.6 | 0.3 | 100% | 0.3–0.4 | 0.5–0.7 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| xlsx-merge-128x128 | inputLatencyMs | 10 | 4.1 | -5.9 | -59% | 5.2–10.6 | 2.8–10.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-128x128 | peakPssMb | 703 | 706 | 3 | 0.4% | 663.7–726 | 665.4–706.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | operationMs | 125.5 | 113.3 | -12.2 | -9.7% | 116.1–127.2 | 113.3–128.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | rendererMaxDelayMs | 32 | 31.1 | -0.9 | -2.8% | 30.3–35.7 | 30.8–31.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | mainMaxDelayMs | 0.8 | 0.7 | -0.1 | -12.5% | 0.4–0.8 | 0.6–0.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | inputLatencyMs | 13.3 | 10.6 | -2.7 | -20.3% | 5.6–13.5 | 9.9–16.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-300x300 | peakPssMb | 748.1 | 750.6 | 2.5 | 0.3% | 704.9–764.7 | 709.4–750.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | operationMs | 204.3 | 201.5 | -2.8 | -1.4% | 189.5–208.2 | 200.4–209.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | rendererMaxDelayMs | 67.5 | 67.2 | -0.3 | -0.4% | 64.6–79.8 | 64.8–72.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | mainMaxDelayMs | 1.6 | 1.9 | 0.3 | 18.7% | 1.2–3.3 | 1–2.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | inputLatencyMs | 54.1 | 51.2 | -2.9 | -5.4% | 51.5–67.1 | 46.3–55.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-merge-400x500 | peakPssMb | 820.5 | 824.6 | 4.1 | 0.5% | 781.7–840.6 | 782.5–825.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | operationMs | 108 | 106.9 | -1.1 | -1% | 98.9–120.5 | 101.4–108.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | rendererMaxDelayMs | 69 | 62.1 | -6.9 | -10% | 59.3–71.4 | 56.8–68.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | mainMaxDelayMs | 0.3 | 0.3 | 0 | 0% | 0.3–0.3 | 0.3–0.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | inputLatencyMs | 19.7 | 18.7 | -1 | -5.1% | 16–21.8 | 15.8–20.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-1 | peakPssMb | 827.9 | 833.3 | 5.4 | 0.7% | 793.2–848 | 790.6–833.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-8 | operationMs | 138.7 | 142.9 | 4.2 | 3% | 134.2–148.2 | 141.3–147.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-8 | rendererMaxDelayMs | 59.6 | 61.4 | 1.8 | 3% | 55.6–66.3 | 61.2–69.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-8 | mainMaxDelayMs | 0.4 | 9 | 8.6 | 2150% | 0.2–0.6 | 1–10.1 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| xlsx-sheets-8 | inputLatencyMs | 12.6 | 9.5 | -3.1 | -24.6% | 6.3–40.7 | 8.7–17.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-8 | peakPssMb | 842.7 | 835.2 | -7.5 | -0.9% | 808.1–863.1 | 805.6–835.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-32 | operationMs | 268.8 | 243.7 | -25.1 | -9.3% | 249.5–273.7 | 243.1–256.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-32 | rendererMaxDelayMs | 74.9 | 59.9 | -15 | -20% | 73.8–78.9 | 42–66.8 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| xlsx-sheets-32 | mainMaxDelayMs | 5.1 | 2 | -3.1 | -60.8% | 0.3–5.2 | 1.6–2.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-32 | inputLatencyMs | 34.9 | 23 | -11.9 | -34.1% | 9.7–43.5 | 12.5–26 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| xlsx-sheets-32 | peakPssMb | 843.5 | 786.4 | -57.1 | -6.8% | 818.9–864.3 | 776.8–818.6 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| docx-paragraphs-100 | operationMs | 147.3 | 355.6 | 208.3 | 141.4% | 144.8–147.4 | 144.8–398.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | rendererMaxDelayMs | 34.7 | 34.9 | 0.2 | 0.6% | 34.6–35.9 | 33.9–35.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | mainMaxDelayMs | 0.9 | 2.7 | 1.8 | 200% | 0.6–2.6 | 2.2–2.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-100 | inputLatencyMs | 22.9 | 27.4 | 4.5 | 19.7% | 21.6–24.4 | 24.7–29.3 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| docx-paragraphs-100 | peakPssMb | 647.1 | 679.1 | 32 | 4.9% | 645–702.9 | 653–684.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | operationMs | 97.3 | 95.2 | -2.1 | -2.2% | 66.8–98.9 | 88.2–95.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | rendererMaxDelayMs | 24.5 | 21.7 | -2.8 | -11.4% | 24–27.8 | 19.6–25.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | mainMaxDelayMs | 0.5 | 0.6 | 0.1 | 20% | 0.3–0.6 | 0.4–0.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | inputLatencyMs | 12 | 9.9 | -2.1 | -17.5% | 10.9–15.8 | 6.9–12.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-1000 | peakPssMb | 646.6 | 678.6 | 32 | 4.9% | 645–702.9 | 653–683.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | operationMs | 302.7 | 304.7 | 2 | 0.7% | 301.9–319.1 | 301.6–308.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | rendererMaxDelayMs | 133 | 131.3 | -1.7 | -1.3% | 131.5–150.1 | 129.3–136.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | mainMaxDelayMs | 1.1 | 3.7 | 2.6 | 236.4% | 0.6–3.4 | 1.8–4.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | inputLatencyMs | 150.1 | 149.1 | -1 | -0.7% | 148.5–166.8 | 105.9–150.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-paragraphs-5000 | peakPssMb | 741.5 | 770 | 28.5 | 3.8% | 724.7–781.3 | 727.1–776.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | operationMs | 62.1 | 52.8 | -9.3 | -15% | 45.8–65.5 | 47.8–76.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | rendererMaxDelayMs | 6.7 | 8.8 | 2.1 | 31.3% | 6.5–22.2 | 2.7–28.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | mainMaxDelayMs | 0.3 | 0.4 | 0.1 | 33.3% | 0.2–0.4 | 0.3–0.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | inputLatencyMs | 10.9 | 7.2 | -3.7 | -33.9% | 7.9–11.8 | 2.6–8.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-25x10 | peakPssMb | 807.8 | 863.3 | 55.5 | 6.9% | 807.7–853.8 | 814.8–870.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | operationMs | 130.6 | 128.2 | -2.4 | -1.8% | 127.8–238.3 | 126.4–212 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | rendererMaxDelayMs | 90.1 | 83 | -7.1 | -7.9% | 85.8–91.6 | 81.2–89.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | mainMaxDelayMs | 1 | 0.9 | -0.1 | -10% | 0.7–1.2 | 0.8–2.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | inputLatencyMs | 75.2 | 70.6 | -4.6 | -6.1% | 72.4–84.3 | 66.2–73.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-250x10 | peakPssMb | 864.7 | 884.6 | 19.9 | 2.3% | 835.2–880.8 | 834.8–894.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | operationMs | 714.1 | 764.2 | 50.1 | 7% | 713.3–752.2 | 752.2–788.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | rendererMaxDelayMs | 658 | 665 | 7 | 1.1% | 645.6–692.3 | 409.4–724.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | mainMaxDelayMs | 3.5 | 1.4 | -2.1 | -60% | 2.7–10.3 | 1.1–4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | inputLatencyMs | 353 | 365.6 | 12.6 | 3.6% | 288.7–356.6 | 288.9–419.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| docx-table-1000x10 | peakPssMb | 1055 | 1093.4 | 38.4 | 3.6% | 947.3–1104.5 | 967.2–1143.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| html-assets-1x256 | operationMs | 191 | — | — | — | 191–191 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-1x256 | rendererMaxDelayMs | 48 | — | — | — | 48–48 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-1x256 | mainMaxDelayMs | 1.8 | — | — | — | 1.8–1.8 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-1x256 | inputLatencyMs | 8.4 | — | — | — | 8.4–8.4 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-1x256 | peakPssMb | 737.3 | — | — | — | 737.3–737.3 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | operationMs | 316 | — | — | — | 316–316 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | rendererMaxDelayMs | 47 | — | — | — | 47–47 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | mainMaxDelayMs | 2.2 | — | — | — | 2.2–2.2 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | inputLatencyMs | 18.9 | — | — | — | 18.9–18.9 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-4x256 | peakPssMb | 751.3 | — | — | — | 751.3–751.3 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | operationMs | 2157.9 | — | — | — | 2157.9–2157.9 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | rendererMaxDelayMs | 452.2 | — | — | — | 452.2–452.2 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | mainMaxDelayMs | 4 | — | — | — | 4–4 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | inputLatencyMs | 166.4 | — | — | — | 166.4–166.4 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-assets-8x512 | peakPssMb | 882.5 | — | — | — | 882.5–882.5 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | operationMs | 389.7 | — | — | — | 389.7–389.7 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | rendererMaxDelayMs | 52.3 | — | — | — | 52.3–52.3 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | mainMaxDelayMs | 3.2 | — | — | — | 3.2–3.2 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | inputLatencyMs | 1.6 | — | — | — | 1.6–1.6 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| html-script-250ms | peakPssMb | 849.2 | — | — | — | 849.2–849.2 | — | 1 (1/0) | 0 (0/0) | not measured (B: failed:instrument ×3) |  |
| path-list-1000 | operationMs | 134.2 | 136 | 1.8 | 1.3% | 134.1–135.2 | 132.9–148.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-1000 | rendererMaxDelayMs | 115.9 | 115.9 | 0 | 0% | 115.8–116.6 | 114.7–117.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-1000 | mainMaxDelayMs | 0.6 | 0.5 | -0.1 | -16.7% | 0.3–0.6 | 0.4–0.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-1000 | inputLatencyMs | 73.4 | 73 | -0.4 | -0.5% | 72.4–73.8 | 71.9–74.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-1000 | peakPssMb | 682.9 | 680.7 | -2.2 | -0.3% | 671.2–704.9 | 680–697.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-10000 | operationMs | 1168 | 1154.5 | -13.5 | -1.2% | 1158.4–1172.5 | 1152.7–1166.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-10000 | rendererMaxDelayMs | 1151.2 | 1137.5 | -13.7 | -1.2% | 1133.8–1156.1 | 1121.9–1137.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-10000 | mainMaxDelayMs | 1.3 | 0.5 | -0.8 | -61.5% | 0.5–1.8 | 0.5–4.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-10000 | inputLatencyMs | 1091.4 | 1076.9 | -14.5 | -1.3% | 1075.6–1098.3 | 1067.8–1079.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-10000 | peakPssMb | 933.2 | 933.5 | 0.3 | 0% | 924.4–957 | 932.4–958.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-20000 | operationMs | 3410.8 | 3412.3 | 1.5 | 0% | 3360.9–3421.9 | 3391.7–3415.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-20000 | rendererMaxDelayMs | 3372.6 | 3377.8 | 5.2 | 0.2% | 3328.2–3393.2 | 3352.1–3391.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-20000 | mainMaxDelayMs | 1.1 | 0.7 | -0.4 | -36.4% | 0.5–1.2 | 0.7–1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-20000 | inputLatencyMs | 3285.8 | 3287.1 | 1.3 | 0% | 3207.9–3292.7 | 3263.1–3290.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| path-list-20000 | peakPssMb | 1366.2 | 1365.9 | -0.3 | 0% | 1343–1392.6 | 1355.4–1379.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-500 | operationMs | 60.1 | 60.5 | 0.4 | 0.7% | 57.6–73.1 | 59.1–61.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-500 | rendererMaxDelayMs | 5.6 | 5.3 | -0.3 | -5.4% | 5.3–17.9 | 4.6–5.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-500 | mainMaxDelayMs | 0.6 | 0.7 | 0.1 | 16.7% | 0.5–0.8 | 0.5–0.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-500 | inputLatencyMs | 3.9 | 4 | 0.1 | 2.6% | 3.8–6.7 | 3.3–5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-500 | peakPssMb | 697.3 | 700.5 | 3.2 | 0.5% | 696.9–700.6 | 697.3–701.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-5000 | operationMs | 123.7 | 153.2 | 29.5 | 23.8% | 108.3–128 | 129.3–155.4 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| large-diff-5000 | rendererMaxDelayMs | 8.4 | 2.3 | -6.1 | -72.6% | 5.3–8.9 | 0.2–9.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-5000 | mainMaxDelayMs | 0.4 | 0.5 | 0.1 | 25% | 0.2–0.7 | 0.3–0.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-5000 | inputLatencyMs | 2 | 2.9 | 0.9 | 45% | 1.6–2.1 | 2.9–3.3 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| large-diff-5000 | peakPssMb | 713.8 | 712.4 | -1.4 | -0.2% | 712.8–716.5 | 700.5–716.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-20000 | operationMs | 1062.1 | 1059.2 | -2.9 | -0.3% | 1056.6–1076 | 1055.4–1078.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-20000 | rendererMaxDelayMs | 15.7 | 12.4 | -3.3 | -21% | 8.2–16.1 | 10.5–13.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-20000 | mainMaxDelayMs | 6.8 | 3.5 | -3.3 | -48.5% | 4.6–8.2 | 2.2–7.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| large-diff-20000 | inputLatencyMs | 5.7 | 2.6 | -3.1 | -54.4% | 4.6–5.8 | 2.2–2.7 | 3 (3/0) | 3 (3/0) | B faster | ranges separate; no A/A noise available |
| large-diff-20000 | peakPssMb | 714.2 | 716.7 | 2.5 | 0.4% | 713.9–716.6 | 663.3–744 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| background-index-large-history | operationMs | 3203 | 3207.2 | 4.2 | 0.1% | 3201.7–3204.3 | 3184.9–3207.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| background-index-large-history | rendererMaxDelayMs | 13.4 | 10.8 | -2.6 | -19.4% | 9.6–13.7 | 10.4–16.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| background-index-large-history | mainMaxDelayMs | 0.5 | 0.6 | 0.1 | 20% | 0.5–0.5 | 0.5–0.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| background-index-large-history | inputLatencyMs | 1.6 | 1.7 | 0.1 | 6.3% | 1.6–2.1 | 1.6–2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| background-index-large-history | peakPssMb | 711.5 | 730 | 18.5 | 2.6% | 710.5–723.8 | 725.1–731.8 | 3 (3/0) | 3 (3/0) | B slower | ranges separate; no A/A noise available |
| image-png-1024x768 | operationMs | 156.1 | 135.6 | -20.5 | -13.1% | 124.9–158.2 | 114.1–145.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-1024x768 | rendererMaxDelayMs | 51.3 | 41.5 | -9.8 | -19.1% | 38.9–54.9 | 35.6–49.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-1024x768 | mainMaxDelayMs | 1.5 | 2.7 | 1.2 | 80% | 0.9–3.9 | 2.4–2.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-1024x768 | inputLatencyMs | 32.4 | 29.3 | -3.1 | -9.6% | 29.6–35.4 | 28–33.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-1024x768 | peakPssMb | 774 | 779.2 | 5.2 | 0.7% | 771.9–793.9 | 778.8–785.3 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | operationMs | 151.1 | 149.2 | -1.9 | -1.3% | 149.7–155.4 | 133.6–158.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | rendererMaxDelayMs | 37.5 | 32.6 | -4.9 | -13.1% | 32.9–38.3 | 27–42.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | mainMaxDelayMs | 1 | 3.4 | 2.4 | 240% | 0.9–3.9 | 2–10.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | inputLatencyMs | 18.4 | 12.6 | -5.8 | -31.5% | 9.5–20.4 | 6–17.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-2048x1536 | peakPssMb | 897.6 | 912.5 | 14.9 | 1.7% | 831.9–903.7 | 858.3–971.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | operationMs | 447.9 | 407.5 | -40.4 | -9% | 415.3–490.6 | 401.9–579.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | rendererMaxDelayMs | 102.4 | 100.6 | -1.8 | -1.8% | 97.7–170.1 | 91–233.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | mainMaxDelayMs | 7.5 | 7.4 | -0.1 | -1.3% | 3.7–10.5 | 7–14.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | inputLatencyMs | 55.2 | 56.5 | 1.3 | 2.4% | 53.9–145.6 | 55.8–115.5 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-png-4096x3072 | peakPssMb | 1241.9 | 1223.8 | -18.1 | -1.5% | 1211.2–1250.5 | 1187.1–1243.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | operationMs | 85.2 | 69.3 | -15.9 | -18.7% | 65–101 | 68.7–87.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | rendererMaxDelayMs | 13.6 | 12.3 | -1.3 | -9.6% | 10.6–21.1 | 9.2–14.7 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | mainMaxDelayMs | 2.6 | 3.2 | 0.6 | 23.1% | 2.2–3.9 | 2.3–3.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | inputLatencyMs | 2.3 | 3.4 | 1.1 | 47.8% | 1.8–5.3 | 2.9–3.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-1024x768 | peakPssMb | 766.8 | 777.5 | 10.7 | 1.4% | 761.4–784 | 736.2–781.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | operationMs | 73.5 | 68.2 | -5.3 | -7.2% | 59.8–98.6 | 49.7–74.4 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | rendererMaxDelayMs | 15.4 | 14.8 | -0.6 | -3.9% | 7.3–18.7 | 12.1–16.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | mainMaxDelayMs | 1.2 | 3.5 | 2.3 | 191.7% | 0.8–6.7 | 1.6–3.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | inputLatencyMs | 3.3 | 2.3 | -1 | -30.3% | 2.3–4 | 1.6–2.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-2048x1536 | peakPssMb | 850.8 | 845.5 | -5.3 | -0.6% | 830.4–853.6 | 826.7–848.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | operationMs | 143.6 | 134.8 | -8.8 | -6.1% | 133.8–178.9 | 132–134.9 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | rendererMaxDelayMs | 64.1 | 60.7 | -3.4 | -5.3% | 40.2–69.2 | 34–63.2 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | mainMaxDelayMs | 5 | 3.4 | -1.6 | -32% | 1–7.9 | 0.7–4.6 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | inputLatencyMs | 18.1 | 18.5 | 0.4 | 2.2% | 2.6–41.1 | 1.8–19.1 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-4096x3072 | peakPssMb | 1161.4 | 1123 | -38.4 | -3.3% | 1159–1217.1 | 1113.2–1166.8 | 3 (3/0) | 3 (3/0) | no clear difference | ranges overlap |
| image-jpeg-original-wealth-game | operationMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
| image-jpeg-original-wealth-game | rendererMaxDelayMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
| image-jpeg-original-wealth-game | mainMaxDelayMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
| image-jpeg-original-wealth-game | inputLatencyMs | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
| image-jpeg-original-wealth-game | peakPssMb | — | — | — | — | — | — | 0 (0/0) | 0 (0/0) | not measured (A: failed:generation-exit ×3; B: failed:generation-exit ×3) |  |
