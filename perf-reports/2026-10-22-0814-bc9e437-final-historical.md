# perf-lab 2026-10-22-0814-bc9e437-final-historical

sha bc9e43752d0c9d2bb49eeff1e50ee70800668f27 (session/93-file-viewer-freezes, dirty 331dbfcbbf58) — 2026-10-22T08:14:45.389Z
machine: AMD RYZEN AI MAX+ 395 w/ Radeon 8060S · 121 GB · kernel 7.2.9-1-cachyos · node v26.10.0
  renderer: ANGLE (Mesa, llvmpipe (LLVM 23.1.1 256 bits), OpenGL 4.6 (Core Profile) Mesa 26.2.4-arch3.1) — SOFTWARE, gpu_compositing=disabled_software (via SystemInfo)

Legacy execution contract revision 2: .
All declared raw repeats and required steps must be present and valid. A median cannot clear missing evidence. Comparison also checks each PRIMARY raw-repeat maximum (including the target), beyond the baseline maximum plus its full raw range and the configured regression margin, with a one-unit rounding floor. Context and document controls are not legacy tail budgets.

| metric | median |
|---|---|
| startup.whenReady | — |
| startup.createWindowAt | — |
| startup.blankWindowMs | — |
| startup.didFinishLoad | — |
| startup.firstContentfulPaint | — |
| startup.appMounted | — |
| startup.sessionsListed | — |
| startup.postWindowDone (network) | — |
| idle PSS | — |
| idle CPU | — |

## Workload breadth (lane F) — per-rung measured / slow / failed

Memory bound for generation: systemd-run-user-scope (systemd-run --user --scope -p MemoryMax (user-level cgroup, swap off)). Thresholds: operationMs 1000, rendererMaxDelayMs 250, mainMaxDelayMs 250, inputLatencyMs 250.

| Rung | Family | Status | Time to render ms | Renderer long task ms | Main stall ms | Peak memory MiB (PSS) | Notes |
|---|---|---|---|---|---|---|---|
| csv-rows-64kib | csv | measured | 206.4 | 128.6 | 7.8 | 676.4 |  |
| csv-rows-256kib | csv | measured | 165 | 100.9 | 2.2 | 607 |  |
| csv-rows-1024kib | csv | measured | 145.3 | 104.6 | 1.9 | 639.9 |  |
| csv-rows-3072kib | csv | measured | 259 | 173 | 3.8 | 749.2 |  |
| csv-wide-64kib | csv | measured | 139.9 | 94.4 | 1 | 749.2 |  |
| csv-wide-256kib | csv | measured | 166 | 110.2 | 14.9 | 767.1 |  |
| csv-wide-1024kib | csv | measured | 470.9 | 208.9 | 9.7 | 782.5 |  |
| csv-wide-3072kib | csv | failed (failed:timeout) | — | — | — | 784.2 | External case deadline 15000 ms |
| csv-quoted-64kib | csv | measured | 146.6 | 94.2 | 7.3 | 522 |  |
| csv-quoted-256kib | csv | measured | 142.7 | 85.7 | 1.4 | 538.2 |  |
| csv-quoted-1024kib | csv | measured | 120.7 | 95.4 | 0.5 | 586.9 |  |
| csv-quoted-3072kib | csv | measured | 162.9 | 120.6 | 0.5 | 657.8 |  |
| csv-fullread-5120kib | csv-fullread | slow | 653.9 | 297.7 | 1.2 | 778 | renderer long task 297.7 ms > 250 ms |
| xlsx-merge-32x32 | xlsx | measured | 455.3 | 81.8 | 1.3 | 589.8 |  |
| xlsx-merge-128x128 | xlsx | measured | 100.2 | 22.6 | 1.4 | 606.1 |  |
| xlsx-merge-300x300 | xlsx | measured | 209.9 | 62.5 | 4.6 | 660.5 |  |
| xlsx-merge-400x500 | xlsx | measured | 298.1 | 129.8 | 0.8 | 745.3 |  |
| xlsx-sheets-1 | xlsx | measured | 140.9 | 87.2 | 0.6 | 761.9 |  |
| xlsx-sheets-8 | xlsx | measured | 144.4 | 69.5 | 4.6 | 802.5 |  |
| xlsx-sheets-32 | xlsx | measured | 349.4 | 82.5 | 3.8 | 820.8 |  |
| docx-paragraphs-100 | docx | measured | 203.3 | 43.9 | 3.9 | 597.2 |  |
| docx-paragraphs-1000 | docx | measured | 107.6 | 32.4 | 0.9 | 617 |  |
| docx-paragraphs-5000 | docx | slow | 795.9 | 251.3 | 86.2 | 859.4 | renderer long task 251.3 ms > 250 ms |
| docx-table-25x10 | docx | measured | 140.4 | 27.3 | 0.5 | 881.2 |  |
| docx-table-250x10 | docx | measured | 357.6 | 112.6 | 5.4 | 890.3 |  |
| docx-table-1000x10 | docx | slow | 1050.9 | 702.6 | 13.5 | 1149.2 | time to render 1050.9 ms > 1000 ms; renderer long task 702.6 ms > 250 ms; typing delay 511.5 ms > 250 ms |
| html-assets-1x256 | html | measured | 288.1 | 32 | 4.3 | 737.5 |  |
| html-assets-4x256 | html | measured | 442.3 | 53.4 | 4 | 790.1 |  |
| html-assets-8x512 | html | slow | 2615.6 | 436.9 | 7.9 | 886.8 | time to render 2615.6 ms > 1000 ms; renderer long task 436.9 ms > 250 ms |
| html-script-250ms | html | measured | 400.3 | 33.8 | 2.9 | 829 |  |
| path-list-1000 | path | slow | 400.2 | 317.4 | 2.4 | 671.3 | renderer long task 317.4 ms > 250 ms |
| path-list-10000 | path | slow | 3054.7 | 2880 | 3.1 | 971.8 | time to render 3054.7 ms > 1000 ms; renderer long task 2880 ms > 250 ms; typing blocked for at least 2292.5 ms (27 key slots skipped while 16 keys were already  |
| path-list-20000 | path | failed (failed:evidence-incomplete) | — | — | — | 1390.3 | Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof |
| large-diff-500 | large-diff | measured | 91.8 | 3.3 | 0.9 | 543.7 |  |
| large-diff-5000 | large-diff | measured | 141.4 | 5.5 | 0.5 | 558.5 |  |
| large-diff-20000 | large-diff | slow | 1098.4 | 13.3 | 0.7 | 597.6 | time to render 1098.4 ms > 1000 ms |
| background-index-large-history | background-indexing | slow | 3207.5 | 15.1 | 0.7 | 693.5 | time to render 3207.5 ms > 1000 ms |
| image-png-1024x768 | image-png | measured | 410 | 62.2 | 9.4 | 658.5 |  |
| image-png-2048x1536 | image-png | measured | 158.3 | 37 | 5.5 | 805.1 |  |
| image-png-4096x3072 | image-png | measured | 415.2 | 84.4 | 6.4 | 1249 |  |
| image-jpeg-1024x768 | image-jpeg | measured | 133 | 14.2 | 4.3 | 755.3 |  |
| image-jpeg-2048x1536 | image-jpeg | measured | 97 | 11.8 | 4.2 | 771.3 |  |
| image-jpeg-4096x3072 | image-jpeg | failed (failed:instrument) | — | — | — | — | Error: Calibration controls invalid; workload measurements refused (3 of 3 attempts: control-renderer-congestion did not produce valid evidence (status failed:  |
| image-jpeg-original-wealth-game | image-jpeg-original | failed (failed:evidence-incomplete) | — | — | — | 644.8 | Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof |
- Original JPEG copy: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/scratch/perf-lab/home/stall-ladder/images-jpeg-original/wealth-game.jpg sha256 f88cab4e57f447ba16d81f947bff7bedcb7042891281e4fbd1d27a0792900ee4 (source verified identical, copy read-only)
- Invalid: workloads repeat 1: path-list-20000 failed:evidence-incomplete — Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof
- Invalid: workloads repeat 1: image-jpeg-4096x3072 failed:instrument — Error: Calibration controls invalid; workload measurements refused (3 of 3 attempts: control-renderer-congestion did not produce valid evidence (status failed: Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof))
- Invalid: workloads repeat 1: image-jpeg-original-wealth-game failed:evidence-incomplete — Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof

noise: load 7.18, busy 8.2%, worst accepted load 49.09 / busy 99.4%, discarded 0
interference: 19 window(s) watched, 0 clean, 19 NOT CLEAN — workloads/csv/repeat-1: disturbed — other programs used 25.6 cores on average over 43 s (limit 1): chrome ×569 (pids 1362201, 2078660, 2078661, 2078663, +565 more) used 11.4 cores; node-MainThread ×153 (pids 2077331, 2077343, 2077388, 2077712, +149 more) used 9.1 cores; youcoded ×9 (pids 1342321, 1342393, 1342460, 1342549, +5 more) used 1.1 cores | workloads/csv/repeat-1/attempt-2: disturbed — other programs used 19.6 cores on average over 14 s (limit 1): node-MainThread ×180 (pids 2077206, 2077712, 2089366, 2089370, +176 more) used 10.2 cores; chrome ×76 (pids 1362199, 1698556, 2081298, 2081299, +72 more) used 6.2 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.9 cores | workloads/csv-fullread/repeat-1: disturbed — other programs used 8.8 cores on average over 5 s (limit 1): chrome ×59 (pids 1362133, 1362199, 1698556, 2081317, +55 more) used 5.8 cores; node-MainThread ×7 (pids 1745086, 2089370, 2089374, 2089366, +3 more) used 1.6 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.6 cores | workloads/xlsx/repeat-1: disturbed — other programs used 5.2 cores on average over 8 s (limit 1): chrome ×68 (pids 1362133, 2081298, 2081301, 2081305, +64 more) used 3.2 cores; git ×2 (pids 2104989, 2105730) used 0.9 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 2084085, +3 more) used 0.6 cores | workloads/docx/repeat-1: disturbed — other programs used 10.7 cores on average over 13 s (limit 1): chrome ×152 (pids 1362199, 1698556, 2081298, 2081299, +148 more) used 8 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.8 cores; git ×3 (pids 2108482, 2110748, 2111824) used 0.7 cores | workloads/html/repeat-1: disturbed — other programs used 2.9 cores on average over 9 s (limit 1): node-MainThread ×2 (pids 2077206, 1343120) used 0.8 cores; git ×2 (pids 2111824, 2113817) used 0.7 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.6 cores | workloads/path-list/repeat-1: disturbed — other programs used 26.4 cores on average over 52 s (limit 1): node-MainThread ×448 (pids 2116033, 2116038, 2116162, 2116319, +444 more) used 15.2 cores; chrome ×393 (pids 1362133, 1362199, 1698556, 2116148, +389 more) used 6.9 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 1 core | workloads/large-diff/repeat-1: disturbed — other programs used 24.2 cores on average over 42 s (limit 1): node-MainThread ×675 (pids 2116033, 2117583, 2120382, 2120385, +671 more) used 16.8 cores; chrome ×161 (pids 2118930, 2118932, 2118936, 2118942, +157 more) used 5.1 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.9 cores | workloads/background-indexing/repeat-1: disturbed — other programs used 6.4 cores on average over 14 s (limit 1): chrome ×73 (pids 1362133, 1362199, 1698556, 2118929, +69 more) used 4.2 cores; git ×2 (pids 2164903, 2165590) used 0.8 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.7 cores | workloads/images-png-2048x1536/repeat-1: disturbed — other programs used 5.4 cores on average over 10 s (limit 1): chrome ×66 (pids 2118936, 2118952, 2118958, 2119171, +62 more) used 3.6 cores; git ×3 (pids 2167163, 2168221, 2168845) used 0.8 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.6 cores | workloads/images-png-2048x1536/repeat-1/attempt-2: disturbed — other programs used 14.9 cores on average over 17 s (limit 1): chrome ×239 (pids 1362201, 2118936, 2119034, 2119171, +235 more) used 12.6 cores; git ×5 (pids 2168845, 2170888, 2170949, 2172264, +1 more) used 0.9 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.7 cores | workloads/images-png-2048x1536/repeat-1/attempt-3: disturbed — other programs used 5.3 cores on average over 16 s (limit 1): chrome ×50 (pids 1362133, 1362199, 1698556, 2118929, +46 more) used 2.8 cores; git ×5 (pids 2173325, 2177059, 2178010, 2178402, +1 more) used 0.8 cores; youcoded ×8 (pids 1342321, 1342393, 1342460, 1342549, +4 more) used 0.6 cores | workloads/images-png-4096x3072/repeat-1: disturbed — other programs used 2.3 cores on average over 30 s (limit 1): git ×6 (pids 2180920, 2181557, 2182587, 2184922, +2 more) used 0.8 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.6 cores; claude ×7 (pids 1343127, 1343193, 1658190, 1727377, +3 more) used 0.3 cores | workloads/images-jpeg-2048x1536/repeat-1: disturbed — other programs used 3.2 cores on average over 12 s (limit 1): git ×4 (pids 2186612, 2188781, 2189701, 2190407) used 0.9 cores; python (pid 2187913) used 0.8 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.6 cores | workloads/images-jpeg-4096x3072/repeat-1: disturbed — other programs used 11.7 cores on average over 31 s (limit 1): node-MainThread ×84 (pids 2192345, 1727370, 2192651, 2192695, +80 more) used 4 cores; chrome ×175 (pids 1362133, 1362199, 1698556, 1362627, +171 more) used 1.8 cores; tsgo ×2 (pids 2197231, 2197261) used 1.3 cores | workloads/images-jpeg-4096x3072/repeat-1/attempt-2: disturbed — other programs used 26.1 cores on average over 18 s (limit 1): node-MainThread ×237 (pids 2197263, 2197794, 2197903, 2197970, +233 more) used 20.2 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 1.4 cores; chrome ×76 (pids 1362133, 1362199, 2208381, 2208422, +72 more) used 0.8 cores | workloads/images-jpeg-original/repeat-1: disturbed — other programs used 26 cores on average over 29 s (limit 1): node-MainThread ×487 (pids 2197263, 2197903, 2197970, 2201228, +483 more) used 21.1 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.9 cores; chrome ×150 (pids 2222385, 2222407, 2225603, 2225632, +146 more) used 0.8 cores | workloads/images-jpeg-original/repeat-1/attempt-2: disturbed — other programs used 11.8 cores on average over 15 s (limit 1): chrome ×79 (pids 2229316, 2229324, 2229335, 2229343, +75 more) used 5.1 cores; node-MainThread ×65 (pids 2196856, 2197263, 2197903, 2213737, +61 more) used 3.2 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 1 core | workloads/images-jpeg-original/repeat-1/attempt-3: disturbed — other programs used 6.9 cores on average over 24 s (limit 1): chrome ×85 (pids 2229316, 2229335, 2229355, 2229371, +81 more) used 4.3 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.7 cores; git ×5 (pids 2241003, 2241401, 2241924, 2243224, +1 more) used 0.7 cores
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot —, workload boots [], stall boot —, artifacts boot —, projects boot —, terminal boots [], native-stream boots [], native-resume boots [], scrollback boot —
A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.

## What was actually measured

Every number above was produced in a specific configuration. Three wrong conclusions
in this project came from a number measured where the defect could not appear, and none
of them failed loudly — they returned clean numbers. Read the configuration with the number.

### workloads

**Question:** How long does each file/size rung take to appear in the app, what long tasks and main-process stalls does it cause, and what do the CSV full read, long path list, large diff and background index refresh cost?

**Configuration:**
- one app boot per family (a fatal rung is re-run around in a fresh boot, max 3 boots per group)
- document ladders: CSV/XLSX/DOCX/HTML from the lab stress profile + CSV full read (5 MiB)
- images: PNG and JPEG 1024x768, 2048x1536, 4096x3072 + the owner's original JPEG (byte copy)
- thresholds: operationMs 1000, rendererMaxDelayMs 250, mainMaxDelayMs 250, inputLatencyMs 250
- fixtures generated by memory-bounded child processes

**Where each clock starts and stops:**
- `operation` — performance.now() in the controller around the click-to-content action
- `longTasks` — renderer and main event-loop probes (probe-loop.mjs, main-loop-probe.mjs), independent of the action clock
- `input` — independent F24 key train (document-input.mjs)

**Blind to:**
- software rendering only (llvmpipe under Xvfb): GPU paint cost
- transcript-driven path list/diff, not composer typing or paste
- background indexing measures the app's chat-history index, not a project file tree (none exists in source)
- cold OS disk cache


## Incomplete — do NOT rank anything from this report

- interference: window workloads/csv/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 25.6 cores on average over 43 s (limit 1): chrome ×569 (pids 1362201, 2078660, 2078661, 2078663, +565 more) used 11.4 cores; node-MainThread ×153 (pids 2077331, 2077343, 2077388, 2077712, +149 more) used 9.1 cores; youcoded ×9 (pids 1342321, 1342393, 1342460, 1342549, +5 more) used 1.1 cores
- interference: window workloads/csv/repeat-1/attempt-2 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 19.6 cores on average over 14 s (limit 1): node-MainThread ×180 (pids 2077206, 2077712, 2089366, 2089370, +176 more) used 10.2 cores; chrome ×76 (pids 1362199, 1698556, 2081298, 2081299, +72 more) used 6.2 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.9 cores
- interference: window workloads/csv-fullread/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 8.8 cores on average over 5 s (limit 1): chrome ×59 (pids 1362133, 1362199, 1698556, 2081317, +55 more) used 5.8 cores; node-MainThread ×7 (pids 1745086, 2089370, 2089374, 2089366, +3 more) used 1.6 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.6 cores
- interference: window workloads/xlsx/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 5.2 cores on average over 8 s (limit 1): chrome ×68 (pids 1362133, 2081298, 2081301, 2081305, +64 more) used 3.2 cores; git ×2 (pids 2104989, 2105730) used 0.9 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 2084085, +3 more) used 0.6 cores
- interference: window workloads/docx/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 10.7 cores on average over 13 s (limit 1): chrome ×152 (pids 1362199, 1698556, 2081298, 2081299, +148 more) used 8 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.8 cores; git ×3 (pids 2108482, 2110748, 2111824) used 0.7 cores
- interference: window workloads/html/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.9 cores on average over 9 s (limit 1): node-MainThread ×2 (pids 2077206, 1343120) used 0.8 cores; git ×2 (pids 2111824, 2113817) used 0.7 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.6 cores
- interference: window workloads/path-list/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 26.4 cores on average over 52 s (limit 1): node-MainThread ×448 (pids 2116033, 2116038, 2116162, 2116319, +444 more) used 15.2 cores; chrome ×393 (pids 1362133, 1362199, 1698556, 2116148, +389 more) used 6.9 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 1 core
- interference: window workloads/large-diff/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 24.2 cores on average over 42 s (limit 1): node-MainThread ×675 (pids 2116033, 2117583, 2120382, 2120385, +671 more) used 16.8 cores; chrome ×161 (pids 2118930, 2118932, 2118936, 2118942, +157 more) used 5.1 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.9 cores
- interference: window workloads/background-indexing/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 6.4 cores on average over 14 s (limit 1): chrome ×73 (pids 1362133, 1362199, 1698556, 2118929, +69 more) used 4.2 cores; git ×2 (pids 2164903, 2165590) used 0.8 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.7 cores
- interference: window workloads/images-png-2048x1536/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 5.4 cores on average over 10 s (limit 1): chrome ×66 (pids 2118936, 2118952, 2118958, 2119171, +62 more) used 3.6 cores; git ×3 (pids 2167163, 2168221, 2168845) used 0.8 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.6 cores
- interference: window workloads/images-png-2048x1536/repeat-1/attempt-2 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 14.9 cores on average over 17 s (limit 1): chrome ×239 (pids 1362201, 2118936, 2119034, 2119171, +235 more) used 12.6 cores; git ×5 (pids 2168845, 2170888, 2170949, 2172264, +1 more) used 0.9 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.7 cores
- interference: window workloads/images-png-2048x1536/repeat-1/attempt-3 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 5.3 cores on average over 16 s (limit 1): chrome ×50 (pids 1362133, 1362199, 1698556, 2118929, +46 more) used 2.8 cores; git ×5 (pids 2173325, 2177059, 2178010, 2178402, +1 more) used 0.8 cores; youcoded ×8 (pids 1342321, 1342393, 1342460, 1342549, +4 more) used 0.6 cores
- interference: window workloads/images-png-4096x3072/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.3 cores on average over 30 s (limit 1): git ×6 (pids 2180920, 2181557, 2182587, 2184922, +2 more) used 0.8 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.6 cores; claude ×7 (pids 1343127, 1343193, 1658190, 1727377, +3 more) used 0.3 cores
- interference: window workloads/images-jpeg-2048x1536/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3.2 cores on average over 12 s (limit 1): git ×4 (pids 2186612, 2188781, 2189701, 2190407) used 0.9 cores; python (pid 2187913) used 0.8 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.6 cores
- interference: window workloads/images-jpeg-4096x3072/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 11.7 cores on average over 31 s (limit 1): node-MainThread ×84 (pids 2192345, 1727370, 2192651, 2192695, +80 more) used 4 cores; chrome ×175 (pids 1362133, 1362199, 1698556, 1362627, +171 more) used 1.8 cores; tsgo ×2 (pids 2197231, 2197261) used 1.3 cores
- interference: window workloads/images-jpeg-4096x3072/repeat-1/attempt-2 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 26.1 cores on average over 18 s (limit 1): node-MainThread ×237 (pids 2197263, 2197794, 2197903, 2197970, +233 more) used 20.2 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 1.4 cores; chrome ×76 (pids 1362133, 1362199, 2208381, 2208422, +72 more) used 0.8 cores
- interference: window workloads/images-jpeg-original/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 26 cores on average over 29 s (limit 1): node-MainThread ×487 (pids 2197263, 2197903, 2197970, 2201228, +483 more) used 21.1 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.9 cores; chrome ×150 (pids 2222385, 2222407, 2225603, 2225632, +146 more) used 0.8 cores
- interference: window workloads/images-jpeg-original/repeat-1/attempt-2 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 11.8 cores on average over 15 s (limit 1): chrome ×79 (pids 2229316, 2229324, 2229335, 2229343, +75 more) used 5.1 cores; node-MainThread ×65 (pids 2196856, 2197263, 2197903, 2213737, +61 more) used 3.2 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 1 core
- interference: window workloads/images-jpeg-original/repeat-1/attempt-3 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 6.9 cores on average over 24 s (limit 1): chrome ×85 (pids 2229316, 2229335, 2229355, 2229371, +81 more) used 4.3 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.7 cores; git ×5 (pids 2241003, 2241401, 2241924, 2243224, +1 more) used 0.7 cores
- exploratory: measured on a busy machine (20 busy reading(s) recorded) — not comparable
- workloads repeat 1: path-list-20000 failed:evidence-incomplete — Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof
- workloads repeat 1: image-jpeg-4096x3072 failed:instrument — Error: Calibration controls invalid; workload measurements refused (3 of 3 attempts: control-renderer-congestion did not produce valid evidence (status failed: Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof))
- workloads repeat 1: image-jpeg-original-wealth-game failed:evidence-incomplete — Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof
