# Perf-lab queue 20261022T0725

State: **halted** — queue was stopped by a signal
Queue file: /home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes/scripts/perf-lab/queues/overnight-1.json (overnight 1: lane F (workload breadth + original JPEG) on the merged candidate)
Started 2026-10-22T07:25:07.067Z, finished 2026-10-22T07:30:25.602Z; deadline 2026-10-22T14:00:00.000Z; quiet-wait up to 6 h per run

| # | Item | Status | Detail | Reports |
|---|---|---|---|---|
| 1 | workloads-lane-F-merged-candidate | **failed** | exit code null: [perf-lab 07:28:53] machine busy (load 5.52, 13.6% cpu; waiting: qemu-system-x86 using 1.5 cores, youcoded ×4 using 0.7 cores, claude ×6 using 0.5 cores) — waiting for a quiet machine (36s so far, up to 210 min; does not use the --max-minutes budget) / [perf-lab 07:29:26] machine busy (load 5.13, 14% cpu; waiting: claude ×6 using 1.6 cores, git using 1 core, youcoded ×5 using 0.9 cores) — waiting  | — |

Statuses: measured = clean numbers; incomplete-disturbed = another program interfered (named); never-quiet = the machine never went quiet within the wait; skipped-deadline = could not finish before the deadline; failed = crashed, errored or hit its hard cap.
