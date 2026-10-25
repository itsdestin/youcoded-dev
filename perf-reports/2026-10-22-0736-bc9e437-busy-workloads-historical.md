# perf-lab 2026-10-22-0736-bc9e437-busy-workloads-historical

sha bc9e43752d0c9d2bb49eeff1e50ee70800668f27 (session/93-file-viewer-freezes, dirty 331dbfcbbf58) — 2026-10-22T07:36:08.449Z
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

| Rung | Family | Status | Time to render ms | Renderer long task ms | Main stall ms | Notes |
|---|---|---|---|---|---|---|
| csv-rows-64kib | csv | measured | 117.3 | 67.4 | 1.8 |  |
| csv-rows-256kib | csv | measured | 92.3 | 68.7 | 0.3 |  |
| csv-rows-1024kib | csv | measured | 110.9 | 85 | 0.3 |  |
| csv-rows-3072kib | csv | measured | 181.2 | 137.1 | 2.6 |  |
| csv-wide-64kib | csv | measured | 90.6 | 38.8 | 4 |  |
| csv-wide-256kib | csv | measured | 97.2 | 75.4 | 3.5 |  |
| csv-wide-1024kib | csv | measured | 115.4 | 82.6 | 6.9 |  |
| csv-wide-3072kib | csv | measured | 150.3 | 124 | 4.7 |  |
| csv-quoted-64kib | csv | measured | 87.9 | 64.3 | 4.9 |  |
| csv-quoted-256kib | csv | measured | 84.2 | 61.4 | 3.1 |  |
| csv-quoted-1024kib | csv | measured | 105.7 | 79.5 | 3.8 |  |
| csv-quoted-3072kib | csv | measured | 131.6 | 108.2 | 3.3 |  |
| csv-fullread-5120kib | csv-fullread | slow | 544.6 | 290.1 | 9.7 | renderer long task 290.1 ms > 250 ms |
| xlsx-merge-32x32 | xlsx | measured | 223.1 | 75.3 | 8.3 |  |
| xlsx-merge-128x128 | xlsx | measured | 74 | 10.6 | 5.4 |  |
| xlsx-merge-300x300 | xlsx | measured | 140.5 | 36.4 | 1.8 |  |
| xlsx-merge-400x500 | xlsx | measured | 221.5 | 80.9 | 3 |  |
| xlsx-sheets-1 | xlsx | measured | 111.1 | 76.6 | 4.8 |  |
| xlsx-sheets-8 | xlsx | measured | 136.5 | 58.2 | 2.1 |  |
| xlsx-sheets-32 | xlsx | measured | 257.8 | 65.6 | 4.7 |  |
| docx-paragraphs-100 | docx | measured | 143 | 33.5 | 0.8 |  |
| docx-paragraphs-1000 | docx | measured | 96.1 | 26.7 | 2.7 |  |
| docx-paragraphs-5000 | docx | measured | 302.9 | 123 | 4.1 |  |
| docx-table-25x10 | docx | measured | 48.7 | 24.7 | 0.3 |  |
| docx-table-250x10 | docx | measured | 326.4 | 173.2 | 4 |  |
| docx-table-1000x10 | docx | failed (failed:memory-limit) | — | — | — | Owned app family RSS exceeds 1536 MiB |
| html-assets-1x256 | html | measured | 201.8 | 34.8 | 4.1 |  |
| html-assets-4x256 | html | measured | 377 | 71.7 | 0.4 |  |
| html-assets-8x512 | html | slow | 2351.6 | 439.1 | 9.8 | time to render 2351.6 ms > 1000 ms; renderer long task 439.1 ms > 250 ms |
| html-script-250ms | html | measured | 378.9 | 14.1 | 4.7 |  |
| path-list-1000 | path | failed (failed:viewer) | — | — | — | Error: Readiness not proved within 10000 ms; last=false |
| path-list-10000 | path | failed (failed:viewer) | — | — | — | Error: Readiness not proved within 10000 ms; last=false |
| path-list-20000 | path | failed (failed:memory-limit) | — | — | — | Owned app family RSS exceeds 1536 MiB |
| large-diff-500 | large-diff | measured | 63.3 | 5.2 | 0.6 |  |
| large-diff-5000 | large-diff | failed (failed:viewer) | — | — | — | Error: Readiness not proved within 10000 ms; last=false |
| large-diff-20000 | large-diff | slow | 1008.8 | 9.5 | 10.7 | time to render 1008.8 ms > 1000 ms |
| background-index-large-history | background-indexing | failed (failed:evidence-incomplete) | — | — | — | Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof |
| image-png-1024x768 | image-png | measured | 111 | 52.3 | 4.4 |  |
| image-png-2048x1536 | image-png | measured | 109 | 31.5 | 3.4 |  |
| image-png-4096x3072 |  | no row | — | — | — |  |
| image-jpeg-1024x768 | image-jpeg | measured | 73.8 | 16.3 | 4 |  |
| image-jpeg-2048x1536 | image-jpeg | measured | 69.3 | 13 | 2.7 |  |
| image-jpeg-4096x3072 | image-jpeg | failed (failed:memory-limit) | — | — | — | Owned app family RSS exceeds 1536 MiB |
| image-jpeg-original-wealth-game | image-jpeg-original | failed (failed:instrument) | — | — | — | Error: Calibration controls invalid; workload measurements refused |
- Original JPEG copy: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/scratch/perf-lab/home/stall-ladder/images-jpeg-original/wealth-game.jpg sha256 f88cab4e57f447ba16d81f947bff7bedcb7042891281e4fbd1d27a0792900ee4 (source verified identical, copy read-only)
- Invalid: workloads repeat 1: background-index-large-history failed:evidence-incomplete — Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof
- Invalid: workloads repeat 1: image-png-4096x3072 has no row
- Invalid: workloads repeat 1: image-jpeg-original-wealth-game failed:instrument — Error: Calibration controls invalid; workload measurements refused

noise: load 4.15, busy 6%, worst accepted load 5.1 / busy 22.7%, discarded 0
interference: 18 window(s) watched, 0 clean, 18 NOT CLEAN — workloads/csv/repeat-1: disturbed — other programs used 1.9 cores on average over 8 s (limit 1): git (pid 1793360) used 0.9 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1635392, +1 more) used 0.4 cores; claude ×6 (pids 1343127, 1343193, 1540338, 1658190, +2 more) used 0.4 cores | workloads/csv-fullread/repeat-1: disturbed — other programs used 1.2 cores on average over 4 s (limit 1): git ×2 (pids 1793975, 1794429) used 0.5 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 6378, +1 more) used 0.4 cores; claude ×6 (pids 1343193, 1540338, 1727377, 1658190, +2 more) used 0.1 cores | workloads/xlsx/repeat-1: disturbed — other programs used 1.6 cores on average over 6 s (limit 1): git (pid 1794584) used 1 core; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.4 cores; claude ×6 (pids 1343193, 1540338, 1343127, 1658190, +2 more) used 0.1 cores | workloads/docx/repeat-1: disturbed — other programs used 2.1 cores on average over 8 s (limit 1): youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.8 cores; git ×2 (pids 1795931, 1796524) used 0.7 cores; claude ×6 (pids 1343127, 1343193, 1540338, 1745093, +2 more) used 0.4 cores | workloads/html/repeat-1: disturbed — other programs used 1.9 cores on average over 8 s (limit 1): git ×3 (pids 1796524, 1797459, 1798110) used 0.9 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.5 cores; claude ×6 (pids 1343127, 1343193, 1745093, 1727377, +2 more) used 0.4 cores | workloads/path-list/repeat-1: disturbed — other programs used 3 cores on average over 13 s (limit 1): git ×2 (pids 1798592, 1799129) used 1 core; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.7 cores; claude ×6 (pids 1343127, 1343193, 1540338, 1658190, +2 more) used 0.4 cores | workloads/path-list/repeat-1/attempt-2: disturbed — other programs used 3 cores on average over 13 s (limit 1): git ×4 (pids 1799345, 1799765, 1799938, 1800220) used 1 core; youcoded ×6 (pids 1342321, 1342393, 1342460, 1635378, +2 more) used 0.6 cores; journalctl ×2 (pids 1799994, 1800116) used 0.6 cores | workloads/path-list/repeat-1/attempt-3: disturbed — other programs used 4.3 cores on average over 6 s (limit 1): qemu-system-x86 (pid 1800255) used 2.4 cores; git ×2 (pids 1800423, 1800874) used 0.9 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.5 cores | workloads/large-diff/repeat-1: disturbed — other programs used 3.5 cores on average over 14 s (limit 1): qemu-system-x86 (pid 1800255) used 1.8 cores; git ×4 (pids 1800874, 1801417, 1801731, 1801911) used 0.8 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.4 cores | workloads/large-diff/repeat-1/attempt-2: disturbed — other programs used 4 cores on average over 5 s (limit 1): qemu-system-x86 (pid 1800255) used 1.8 cores; git ×2 (pids 1801911, 1802648) used 0.9 cores; claude ×6 (pids 1343127, 1343193, 1540338, 1658190, +2 more) used 0.6 cores | workloads/background-indexing/repeat-1: disturbed — other programs used 3 cores on average over 10 s (limit 1): qemu-system-x86 (pid 1800255) used 1.6 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.8 cores; claude ×6 (pids 1343127, 1540338, 1745093, 1658190, +2 more) used 0.2 cores | workloads/images-png-2048x1536/repeat-1: disturbed — other programs used 2.4 cores on average over 7 s (limit 1): qemu-system-x86 (pid 1800255) used 1.3 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1343137, +1 more) used 0.5 cores; claude ×6 (pids 1343127, 1343193, 1727377, 1745093, +2 more) used 0.5 cores | workloads/images-png-4096x3072/repeat-1: disturbed — other programs used 3.7 cores on average over 6 s (limit 1): qemu-system-x86 (pid 1800255) used 1.5 cores; git ×2 (pids 1804620, 1805178) used 1 core; youcoded ×5 (pids 1342321, 1342393, 1342460, 1635378, +1 more) used 0.6 cores | workloads/images-png-4096x3072/repeat-1/attempt-2: disturbed — other programs used 3.5 cores on average over 6 s (limit 1): claude ×6 (pids 1343127, 1343193, 1540338, 1658190, +2 more) used 1 core; qemu-system-x86 (pid 1800255) used 0.9 cores; git ×2 (pids 1805178, 1806115) used 0.9 cores | workloads/images-jpeg-2048x1536/repeat-1: disturbed — other programs used 3.1 cores on average over 7 s (limit 1): git (pid 1806862) used 1 core; qemu-system-x86 (pid 1800255) used 0.8 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.7 cores | workloads/images-jpeg-4096x3072/repeat-1: disturbed — other programs used 2.9 cores on average over 5 s (limit 1): qemu-system-x86 (pid 1800255) used 1.9 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.6 cores; claude ×6 (pids 1343127, 1343193, 1727377, 1745093, +2 more) used 0.2 cores | workloads/images-jpeg-4096x3072/repeat-1/attempt-2: disturbed — other programs used 2 cores on average over 5 s (limit 1): qemu-system-x86 (pid 1800255) used 0.7 cores; claude ×6 (pids 1343127, 1727377, 1745093, 1540338, +2 more) used 0.4 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.4 cores | workloads/images-jpeg-original/repeat-1: disturbed — other programs used 4.2 cores on average over 6 s (limit 1): qemu-system-x86 (pid 1800255) used 1.7 cores; git ×3 (pids 1809116, 1809429, 1809883) used 1.2 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.5 cores
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

- interference: window workloads/csv/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 1.9 cores on average over 8 s (limit 1): git (pid 1793360) used 0.9 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1635392, +1 more) used 0.4 cores; claude ×6 (pids 1343127, 1343193, 1540338, 1658190, +2 more) used 0.4 cores
- interference: window workloads/csv-fullread/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 1.2 cores on average over 4 s (limit 1): git ×2 (pids 1793975, 1794429) used 0.5 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 6378, +1 more) used 0.4 cores; claude ×6 (pids 1343193, 1540338, 1727377, 1658190, +2 more) used 0.1 cores
- interference: window workloads/xlsx/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 1.6 cores on average over 6 s (limit 1): git (pid 1794584) used 1 core; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.4 cores; claude ×6 (pids 1343193, 1540338, 1343127, 1658190, +2 more) used 0.1 cores
- interference: window workloads/docx/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.1 cores on average over 8 s (limit 1): youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.8 cores; git ×2 (pids 1795931, 1796524) used 0.7 cores; claude ×6 (pids 1343127, 1343193, 1540338, 1745093, +2 more) used 0.4 cores
- interference: window workloads/html/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 1.9 cores on average over 8 s (limit 1): git ×3 (pids 1796524, 1797459, 1798110) used 0.9 cores; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.5 cores; claude ×6 (pids 1343127, 1343193, 1745093, 1727377, +2 more) used 0.4 cores
- interference: window workloads/path-list/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3 cores on average over 13 s (limit 1): git ×2 (pids 1798592, 1799129) used 1 core; youcoded ×6 (pids 1342321, 1342393, 1342460, 1342549, +2 more) used 0.7 cores; claude ×6 (pids 1343127, 1343193, 1540338, 1658190, +2 more) used 0.4 cores
- interference: window workloads/path-list/repeat-1/attempt-2 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3 cores on average over 13 s (limit 1): git ×4 (pids 1799345, 1799765, 1799938, 1800220) used 1 core; youcoded ×6 (pids 1342321, 1342393, 1342460, 1635378, +2 more) used 0.6 cores; journalctl ×2 (pids 1799994, 1800116) used 0.6 cores
- interference: window workloads/path-list/repeat-1/attempt-3 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 4.3 cores on average over 6 s (limit 1): qemu-system-x86 (pid 1800255) used 2.4 cores; git ×2 (pids 1800423, 1800874) used 0.9 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.5 cores
- interference: window workloads/large-diff/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3.5 cores on average over 14 s (limit 1): qemu-system-x86 (pid 1800255) used 1.8 cores; git ×4 (pids 1800874, 1801417, 1801731, 1801911) used 0.8 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.4 cores
- interference: window workloads/large-diff/repeat-1/attempt-2 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 4 cores on average over 5 s (limit 1): qemu-system-x86 (pid 1800255) used 1.8 cores; git ×2 (pids 1801911, 1802648) used 0.9 cores; claude ×6 (pids 1343127, 1343193, 1540338, 1658190, +2 more) used 0.6 cores
- interference: window workloads/background-indexing/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3 cores on average over 10 s (limit 1): qemu-system-x86 (pid 1800255) used 1.6 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1342549, +1 more) used 0.8 cores; claude ×6 (pids 1343127, 1540338, 1745093, 1658190, +2 more) used 0.2 cores
- interference: window workloads/images-png-2048x1536/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.4 cores on average over 7 s (limit 1): qemu-system-x86 (pid 1800255) used 1.3 cores; youcoded ×5 (pids 1342321, 1342393, 1342460, 1343137, +1 more) used 0.5 cores; claude ×6 (pids 1343127, 1343193, 1727377, 1745093, +2 more) used 0.5 cores
- interference: window workloads/images-png-4096x3072/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3.7 cores on average over 6 s (limit 1): qemu-system-x86 (pid 1800255) used 1.5 cores; git ×2 (pids 1804620, 1805178) used 1 core; youcoded ×5 (pids 1342321, 1342393, 1342460, 1635378, +1 more) used 0.6 cores
- interference: window workloads/images-png-4096x3072/repeat-1/attempt-2 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3.5 cores on average over 6 s (limit 1): claude ×6 (pids 1343127, 1343193, 1540338, 1658190, +2 more) used 1 core; qemu-system-x86 (pid 1800255) used 0.9 cores; git ×2 (pids 1805178, 1806115) used 0.9 cores
- interference: window workloads/images-jpeg-2048x1536/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 3.1 cores on average over 7 s (limit 1): git (pid 1806862) used 1 core; qemu-system-x86 (pid 1800255) used 0.8 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.7 cores
- interference: window workloads/images-jpeg-4096x3072/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2.9 cores on average over 5 s (limit 1): qemu-system-x86 (pid 1800255) used 1.9 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.6 cores; claude ×6 (pids 1343127, 1343193, 1727377, 1745093, +2 more) used 0.2 cores
- interference: window workloads/images-jpeg-4096x3072/repeat-1/attempt-2 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 2 cores on average over 5 s (limit 1): qemu-system-x86 (pid 1800255) used 0.7 cores; claude ×6 (pids 1343127, 1727377, 1745093, 1540338, +2 more) used 0.4 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.4 cores
- interference: window workloads/images-jpeg-original/repeat-1 was DISTURBED by other programs (numbers kept but not trustworthy) — other programs used 4.2 cores on average over 6 s (limit 1): qemu-system-x86 (pid 1800255) used 1.7 cores; git ×3 (pids 1809116, 1809429, 1809883) used 1.2 cores; youcoded ×4 (pids 1342321, 1342393, 1342460, 1342549) used 0.5 cores
- exploratory: measured on a busy machine (15 busy reading(s) recorded) — not comparable
- workloads repeat 1: background-index-large-history failed:evidence-incomplete — Missing/invalid viewer proof, finite metrics, clock-bounded input coverage, stopped probes or complete memory proof
- workloads repeat 1: image-png-4096x3072 has no row
- workloads repeat 1: image-jpeg-original-wealth-game failed:instrument — Error: Calibration controls invalid; workload measurements refused
