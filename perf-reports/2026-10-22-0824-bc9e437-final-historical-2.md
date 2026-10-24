# perf-lab 2026-10-22-0824-bc9e437-final-historical-2

sha bc9e43752d0c9d2bb49eeff1e50ee70800668f27 (session/93-file-viewer-freezes, dirty 331dbfcbbf58) — 2026-10-22T08:24:59.257Z
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
| csv-rows-64kib | csv | measured | 142.9 | 76.5 | 2.2 | 629.4 |  |
| csv-rows-256kib | csv | measured | 104.1 | 76.5 | 3.6 | 641.9 |  |
| csv-rows-1024kib | csv | measured | 113 | 94.7 | 1 | 672.9 |  |
| csv-rows-3072kib | csv | measured | 198.9 | 143.8 | 4.9 | 768.6 |  |
| csv-wide-64kib | csv | measured | 113.1 | 94.2 | 0.7 | 767 |  |
| csv-wide-256kib | csv | measured | 113.6 | 95.4 | 5.9 | 786.8 |  |
| csv-wide-1024kib | csv | measured | 145.2 | 110.3 | 2 | 808.7 |  |
| csv-wide-3072kib | csv | measured | 164.3 | 138.7 | 2.9 | 834.5 |  |
| csv-quoted-64kib | csv | measured | 89.9 | 50.1 | 2.9 | 832.2 |  |
| csv-quoted-256kib | csv | measured | 93.6 | 61.1 | 4.1 | 833.9 |  |
| csv-quoted-1024kib | csv | measured | 116.1 | 97.1 | 0.4 | 839.3 |  |
| csv-quoted-3072kib | csv | measured | 200.4 | 124 | 2.6 | 848.9 |  |
| csv-fullread-5120kib | csv-fullread | slow | 801.8 | 338 | 12.5 | 838.4 | renderer long task 338 ms > 250 ms; typing delay 313.2 ms > 250 ms |
| xlsx-merge-32x32 | xlsx | measured | 244.5 | 75.9 | 4.1 | 685.9 |  |
| xlsx-merge-128x128 | xlsx | measured | 94.8 | 8.5 | 4.9 | 697.1 |  |
| xlsx-merge-300x300 | xlsx | measured | 149.8 | 38.6 | 4.8 | 745.7 |  |
| xlsx-merge-400x500 | xlsx | measured | 252.2 | 94.2 | 2.8 | 819.5 |  |
| xlsx-sheets-1 | xlsx | measured | 115.3 | 73.7 | 1.4 | 829.7 |  |
| xlsx-sheets-8 | xlsx | measured | 146.3 | 78 | 4.2 | 845.7 |  |
| xlsx-sheets-32 | xlsx | measured | 367.2 | 92 | 0.4 | 868.2 |  |
| docx-paragraphs-100 | docx | measured | 193.2 | 38.7 | 0.9 | 696.4 |  |
| docx-paragraphs-1000 | docx | measured | 102.1 | 24.7 | 5.1 | 711.5 |  |
| docx-paragraphs-5000 | docx | slow | 309.9 | 269.2 | 4.8 | 796.2 | renderer long task 269.2 ms > 250 ms |
| docx-table-25x10 | docx | measured | 98.5 | 9.6 | 0.7 | 849.2 |  |
| docx-table-250x10 | docx | measured | 141.6 | 109.1 | 2.8 | 871.4 |  |
| docx-table-1000x10 | docx | slow | 857.1 | 797 | 6.8 | 1104.7 | renderer long task 797 ms > 250 ms; typing delay 370.6 ms > 250 ms |
| html-assets-1x256 | html | measured | 292.7 | 54.2 | 3.2 | 732.3 |  |
| html-assets-4x256 | html | measured | 452.5 | 52.1 | 5.6 | 777.5 |  |
| html-assets-8x512 | html | slow | 2609.1 | 475.3 | 9.1 | 873.8 | time to render 2609.1 ms > 1000 ms; renderer long task 475.3 ms > 250 ms |
| html-script-250ms | html | measured | 411.6 | 34.2 | 4.5 | 842.6 |  |
| path-list-1000 | path | measured | 147 | 147 | 0.9 | 661.5 |  |
| path-list-10000 | path | slow | 1248.3 | 1212.2 | 0.7 | 918.5 | time to render 1248.3 ms > 1000 ms; renderer long task 1212.2 ms > 250 ms; typing blocked for at least 1161.9 ms (7 key slots skipped while 16 keys were already |
| path-list-20000 | path | slow | 3912.9 | 3882.2 | 0.9 | 1379.2 | time to render 3912.9 ms > 1000 ms; renderer long task 3882.2 ms > 250 ms; typing blocked for at least 3758.1 ms (56 key slots skipped while 16 keys were alread |
| large-diff-500 | large-diff | measured | 80.4 | 2.4 | 0.6 | 674.7 |  |
| large-diff-5000 | large-diff | measured | 138.9 | 12.4 | 0.6 | 689.7 |  |
| large-diff-20000 | large-diff | slow | 1012.8 | 10.7 | 2.3 | 712.1 | time to render 1012.8 ms > 1000 ms |
| background-index-large-history | background-indexing | slow | 3177.9 | 14.2 | 0.7 | 701.4 | time to render 3177.9 ms > 1000 ms |
| image-png-1024x768 | image-png | measured | 199.3 | 63.4 | 66.2 | 731.7 |  |
| image-png-2048x1536 | image-png | measured | 226.9 | 41.2 | 6.9 | 930.1 |  |
| image-png-4096x3072 | image-png | failed (failed:evidence-incomplete) | — | — | — | 1158 | Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof [input proof: Clock alignment unavailable/un |
| image-jpeg-1024x768 | image-jpeg | measured | 103.5 | 19.7 | 4.7 | 753.4 |  |
| image-jpeg-2048x1536 | image-jpeg | measured | 77.1 | 14.8 | 3.3 | 772.6 |  |
| image-jpeg-4096x3072 | image-jpeg | measured | 347.5 | 24.8 | 7.9 | 1012.6 |  |
| image-jpeg-original-wealth-game | image-jpeg-original | measured | 322.6 | 18.1 | 3.8 | 786.4 |  |
- Original JPEG copy: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/scratch/perf-lab/home/stall-ladder/images-jpeg-original/wealth-game.jpg sha256 f88cab4e57f447ba16d81f947bff7bedcb7042891281e4fbd1d27a0792900ee4 (source verified identical, copy read-only)
- Invalid: workloads repeat 1: image-png-4096x3072 failed:evidence-incomplete — Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof [input proof: Clock alignment unavailable/uncertain; Missing, skipped, overflowed or exhausted input train] (unvalidated, seen: renderer long task 84.1 ms, main stall 10.7 ms, operation 836.2 ms)

noise: load 14.26, busy 15.8%, worst accepted load 14.26 / busy 29.9%, discarded 0
interference: 15 window(s) watched, 0 clean, 15 NOT CLEAN — workloads/csv/repeat-1: disturbed — other programs used 4.4 cores on average over 9 s (limit 1): python (pid 2187913) used 0.9 cores; git ×3 (pids 2266575, 2268729, 2269437) used 0.9 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.8 cores | workloads/csv-fullread/repeat-1: disturbed — other programs used 7.3 cores on average over 5 s (limit 1): tsgo ×2 (pids 2271483, 2271403) used 3.3 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 1.4 cores; git (pid 2270214) used 1 core | workloads/xlsx/repeat-1: disturbed — other programs used 3.1 cores on average over 7 s (limit 1): claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 1.2 cores; python (pid 2187913) used 0.9 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.6 cores | workloads/docx/repeat-1: disturbed — other programs used 2.5 cores on average over 10 s (limit 1): python (pid 2187913) used 0.9 cores; claude ×7 (pids 1343193, 1540338, 1658190, 1727377, +3 more) used 0.8 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.6 cores | workloads/html/repeat-1: disturbed — other programs used 2.2 cores on average over 9 s (limit 1): python (pid 2187913) used 0.7 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.6 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.6 cores | workloads/path-list/repeat-1: disturbed — other programs used 2.1 cores on average over 10 s (limit 1): claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 1 core; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.8 cores; python (pid 2187913) used 0.1 cores | workloads/large-diff/repeat-1: disturbed — other programs used 2.1 cores on average over 5 s (limit 1): claude ×7 (pids 1343193, 1540338, 1658190, 1727377, +3 more) used 1 core; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.9 cores | workloads/background-indexing/repeat-1: disturbed — other programs used 2.9 cores on average over 10 s (limit 1): tsgo (pid 2282937) used 1 core; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.9 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.7 cores | workloads/images-png-2048x1536/repeat-1: disturbed — other programs used 2.9 cores on average over 13 s (limit 1): youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.9 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.8 cores; git ×2 (pids 2285098, 2285585) used 0.8 cores | workloads/images-png-4096x3072/repeat-1: disturbed — other programs used 7.5 cores on average over 29 s (limit 1): node-MainThread ×47 (pids 1880675, 2288733, 2288851, 2288852, +43 more) used 3.6 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.9 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.9 cores | workloads/images-jpeg-2048x1536/repeat-1: disturbed — other programs used 5.2 cores on average over 14 s (limit 1): node-MainThread ×7 (pids 2288851, 2292641, 2288733, 1745086, +3 more) used 1.1 cores; git ×4 (pids 2291675, 2292705, 2293327, 2293825) used 0.9 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.8 cores | workloads/images-jpeg-4096x3072/repeat-1: disturbed — other programs used 3.3 cores on average over 15 s (limit 1): git ×4 (pids 2293825, 2295298, 2296252, 2296724) used 0.8 cores; claude ×7 (pids 1343127, 1727377, 1745093, 1880682, +3 more) used 0.7 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.7 cores | workloads/images-jpeg-4096x3072/repeat-1/attempt-2: disturbed — other programs used 7.5 cores on average over 13 s (limit 1): qemu-system-x86 (pid 2296565) used 1.8 cores; tsgo ×2 (pids 2299566, 2299543) used 1.7 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 1 core | workloads/images-jpeg-4096x3072/repeat-1/attempt-3: disturbed — other programs used 5.7 cores on average over 21 s (limit 1): qemu-system-x86 (pid 2296565) used 2.2 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.8 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.8 cores | workloads/images-jpeg-original/repeat-1: disturbed — other programs used 5.6 cores on average over 18 s (limit 1): qemu-system-x86 (pid 2296565) used 1.6 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.9 cores; git ×3 (pids 2304934, 2305297, 2305954) used 0.9 cores
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

- interference: window workloads/csv/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 4.4 cores on average over 9 s (limit 1): python (pid 2187913) used 0.9 cores; git ×3 (pids 2266575, 2268729, 2269437) used 0.9 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.8 cores
- interference: window workloads/csv-fullread/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 7.3 cores on average over 5 s (limit 1): tsgo ×2 (pids 2271483, 2271403) used 3.3 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 1.4 cores; git (pid 2270214) used 1 core
- interference: window workloads/xlsx/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3.1 cores on average over 7 s (limit 1): claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 1.2 cores; python (pid 2187913) used 0.9 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.6 cores
- interference: window workloads/docx/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.5 cores on average over 10 s (limit 1): python (pid 2187913) used 0.9 cores; claude ×7 (pids 1343193, 1540338, 1658190, 1727377, +3 more) used 0.8 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.6 cores
- interference: window workloads/html/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.2 cores on average over 9 s (limit 1): python (pid 2187913) used 0.7 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.6 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.6 cores
- interference: window workloads/path-list/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.1 cores on average over 10 s (limit 1): claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 1 core; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.8 cores; python (pid 2187913) used 0.1 cores
- interference: window workloads/large-diff/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.1 cores on average over 5 s (limit 1): claude ×7 (pids 1343193, 1540338, 1658190, 1727377, +3 more) used 1 core; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.9 cores
- interference: window workloads/background-indexing/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.9 cores on average over 10 s (limit 1): tsgo (pid 2282937) used 1 core; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.9 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.7 cores
- interference: window workloads/images-png-2048x1536/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.9 cores on average over 13 s (limit 1): youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.9 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.8 cores; git ×2 (pids 2285098, 2285585) used 0.8 cores
- interference: window workloads/images-png-4096x3072/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 7.5 cores on average over 29 s (limit 1): node-MainThread ×47 (pids 1880675, 2288733, 2288851, 2288852, +43 more) used 3.6 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.9 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.9 cores
- interference: window workloads/images-jpeg-2048x1536/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 5.2 cores on average over 14 s (limit 1): node-MainThread ×7 (pids 2288851, 2292641, 2288733, 1745086, +3 more) used 1.1 cores; git ×4 (pids 2291675, 2292705, 2293327, 2293825) used 0.9 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.8 cores
- interference: window workloads/images-jpeg-4096x3072/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3.3 cores on average over 15 s (limit 1): git ×4 (pids 2293825, 2295298, 2296252, 2296724) used 0.8 cores; claude ×7 (pids 1343127, 1727377, 1745093, 1880682, +3 more) used 0.7 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.7 cores
- interference: window workloads/images-jpeg-4096x3072/repeat-1/attempt-2 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 7.5 cores on average over 13 s (limit 1): qemu-system-x86 (pid 2296565) used 1.8 cores; tsgo ×2 (pids 2299566, 2299543) used 1.7 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 1 core
- interference: window workloads/images-jpeg-4096x3072/repeat-1/attempt-3 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 5.7 cores on average over 21 s (limit 1): qemu-system-x86 (pid 2296565) used 2.2 cores; claude ×7 (pids 1343127, 1343193, 1540338, 1658190, +3 more) used 0.8 cores; youcoded ×7 (pids 1342321, 1342393, 1342460, 1342549, +3 more) used 0.8 cores
- interference: window workloads/images-jpeg-original/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 5.6 cores on average over 18 s (limit 1): qemu-system-x86 (pid 2296565) used 1.6 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.9 cores; git ×3 (pids 2304934, 2305297, 2305954) used 0.9 cores
- exploratory: measured on a busy machine (16 busy reading(s) recorded) — not comparable
- workloads repeat 1: image-png-4096x3072 failed:evidence-incomplete — Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof [input proof: Clock alignment unavailable/uncertain; Missing, skipped, overflowed or exhausted input train] (unvalidated, seen: renderer long task 84.1 ms, main stall 10.7 ms, operation 836.2 ms)
