---
status: draft
date: 2026-08-23
topic: Perf lab + autonomous optimization loop for the desktop app
---

# Perf Lab & Autonomous Optimization Loop — Design

## Goal

Make the desktop app open faster, use less CPU/GPU/RAM, and reload conversation
history faster — via an autonomous Opus session that repeatedly measures, changes,
re-measures, and keeps only proven wins. Deliverable is **one large "perf
improvements" PR** on a single branch, reviewed by Destin before merge, plus a
reusable measurement rig ("perf lab") that ships with it.

## Decisions already made (with Destin, 2026-08-23)

1. **Baseline first.** Round 0 measures everything and produces a ranked
   "where the time actually goes" report. Optimization rounds attack the worst
   offenders; the numbers decide, not intuition.
2. **One PR.** All work on one worktree/branch (suggest `perf/optimization-pass`
   in `youcoded/`). One commit per kept experiment, with before/after numbers in
   the commit message. No per-win PRs.
3. **Overnight/idle measurement.** Official numbers are taken while the machine
   is otherwise idle. The rig discards runs taken under load (see Noise gates).
4. **Scope: desktop, all three OSes, tested on Linux only.** App-side changes
   must stay cross-platform (no Linux-only fixes in product code). The rig
   itself may be Linux-only.
5. **Realistic workloads required.** The lab must measure multi-session use —
   several open sessions, a mix of CC and native, switching back and forth —
   not just cold boots.
6. **Zero visible UX/UI change.** The user must notice nothing except speed and
   lower resource use. Enforced mechanically (see Screenshot parity gate). The
   only exception is an obvious bug, which must be flagged for Destin's review
   in the ledger — never silently shipped.

## Part 1 — The perf lab (measurement rig)

A one-command script (suggest `scripts/perf-lab/run.mjs` in the workspace repo)
that produces a single JSON report per invocation. Components:

### Test vehicle

- **Build:** production-style, not dev. `npm run build:main` + `vite build` +
  `electron-builder --dir` (unpacked output — installer skipped; same runtime
  characteristics, much faster to produce). Dev mode (`scripts/run-dev.sh`)
  overstates renderer load (hundreds of unbundled modules, React dev build) and
  is **banned for official numbers**; it stays available for quick iteration.
- **Launch:** headless via `xvfb-run` (no headless-Electron mode exists; a
  virtual X screen is the shortest path and keeps overnight runs invisible).
  CDP enabled by passing `--remote-debugging-port=<port>` on the binary's
  command line — the in-app gate (`main.ts` `!app.isPackaged` +
  `YOUCODED_DEVTOOLS_PORT`) only covers dev, but Chromium honors the argv
  switch regardless of packaging.
- **Isolation:** launch with `HOME` (and `YOUCODED_PROFILE`) pointed at a
  **frozen fixture home** so the app sees fake `~/.claude/`, fake userData,
  fake `~/.youcoded/`. This (a) makes runs reproducible, (b) keeps
  `install-hooks` and MCP reconciliation away from real settings, and
  (c) satisfies live-app safety — the rig must never touch Destin's real app
  or real data. Fixture regenerated from a checked-in generator script, never
  hand-edited.
- **Fixture contents:** several projects; conversations at three sizes —
  small (~100 lines), medium (~5k lines), huge (~50k lines) JSONL transcripts;
  a couple of installed themes; enough sessions to populate the resume browser.

### Metrics (the report card)

| Metric | How |
|---|---|
| **Cold startup, phased** | New permanent in-app timing marks (there are none today): process spawn → main-process phases (each `whenReady` chore named) → window created → first paint → renderer interactive. Emitted as structured lines to a perf log file when `YOUCODED_PERF_LOG=<path>` is set; near-zero cost when unset; ships in the PR. |
| **Memory** | PSS via `/proc/<pid>/smaps_rollup` summed across the Electron process family, sampled at idle-after-boot and after the workload journey. |
| **CPU** | Process-family CPU% over a fixed window at idle and during workload (reuse the sampling approach in `scripts/measure-idle-cpu.mjs`). |
| **GPU** | Not meaningful under Xvfb (software rendering). Tracked only via occasional on-screen spot-checks with the existing amdgpu counters; CPU/RAM serve as overnight proxies. |
| **History reload** | Time `loadHistory` (resume path) and `transcript:replay-from-start` (re-dock path) against the three fixture sizes, driven over CDP. Renderer-side "action → messages painted" time too, not just the IPC round-trip. |
| **Session switch + hiccups** | Scripted journey (below). Per-switch latency plus responsiveness during the whole journey: long tasks and frame gaps via an in-page probe (same pattern as `scripts/resize-bench.mjs`'s `window.__rp`). |

### Realistic workload journey

Scripted over CDP: open ~6 sessions mixing CC-style and native; stream into
several concurrently; switch between all of them repeatedly; open/close the
resume browser and settings once. Measured throughout.

Simulating traffic at zero API cost:
- **CC sessions:** the app tails transcript JSONL files on disk
  (`transcript-watcher.ts`). The rig appends lines to fixture transcripts at a
  realistic streaming pace — indistinguishable from a live session, free.
- **Native sessions:** a genuinely tiny GGUF through the existing
  `test-engine` llama-server tooling, so the real native path is exercised;
  fall back to the transcript trick if model runs prove flaky overnight.

### Statistics & noise gates

- Cold-start and history-reload metrics: ≥5 runs, report **median** + spread.
- A run is discarded if system load average or non-app CPU exceeds a threshold
  before/at start (machine wasn't idle).
- Report JSON checked into the branch under `perf-reports/` with git SHA,
  timestamp, and machine fingerprint, so every number is traceable.

### Screenshot parity gate (zero-visible-change enforcement)

The rig captures a fixed set of screens in fixture state (main chat with
history, settings open, resume browser, marketplace, a native session).
After every candidate change, screenshots must match baseline within a tiny
anti-aliasing tolerance. Any visible diff **rejects the change automatically**
unless the experiment is explicitly marked `ux-bugfix` in the ledger — those
are collected for Destin's review, never silently kept.

## Part 2 — The loop protocol (handoff to the Opus session)

- **Round 0:** build the rig + in-app timing marks; verify the rig's own
  repeatability (run baseline twice, confirm spread is tight); commit
  `perf-reports/baseline-*.json` and a ranked findings doc.
- **Each experiment:** hypothesis (which metric, expected mechanism) → change →
  `bash scripts/verify.sh <worktree>` passes → rig run → **keep only if** the
  target metric's median improves beyond the run-to-run spread (suggest ≥5%)
  AND no other metric regresses meaningfully (suggest >3%) AND screenshot
  parity holds → commit with before/after numbers. Otherwise **revert fully**.
- **Ledger:** every experiment — kept, rejected, or reverted — appended to
  `perf-reports/LEDGER.md` with hypothesis, numbers, verdict. The final PR
  description is generated from it; no idea gets retried twice.
- **Hard rules for the session:** never touch the live app
  (`.claude/rules/live-app-safety.md` binds absolutely); no official numbers
  from dev mode; product changes stay cross-platform; UX-visible changes only
  as flagged bug fixes; don't chase wins under the noise threshold.
- Rig + fixtures + reports live in the **workspace repo** (`youcoded-dev`,
  under `scripts/perf-lab/`); product changes live in the **`youcoded`** branch.
  Two repos, two commits streams, one logical effort — the final PR is in
  `youcoded`, with a companion workspace commit for the rig.

## Part 3 — Seeded targets (baseline decides the order)

From the 2026-08-23 scout (file:line refs verified then):

1. **Serial boot chores before window creation** — `main.ts` `whenReady` block
   (~`main.ts:1281-1528`): log rotation, hook install/reconcile, MCP reconcile
   (safeStorage decrypt + `~/.claude.json` rewrite), remote-server start, all
   awaited serially *before* `createWindow`. Candidates: create/show window
   earlier, parallelize independent chores, defer non-critical ones. Constraint:
   no blank-window flash (screenshot gate + a first-paint mark keep this honest).
2. **No renderer code-splitting** — `React.lazy` in only 2 files; no
   `manualChunks` in `vite.config.ts`; settings drawer always mounted
   (ROADMAP:409). Split rarely-used surfaces *without* first-open flashes
   (preload split chunks in idle time after boot).
3. **History reload re-reads everything** — `session-browser.ts:660`
   `loadHistory` reads the whole JSONL per call even for `count=10`;
   `transcript-watcher.ts:451-489` `getHistory` does a **sync** full-file
   read+parse on every replay (re-dock, resume, buddy subscribe). Candidates:
   tail-read for small counts, parsed-history cache keyed by file size/mtime,
   async read.
4. **Chatsearch full startup scan** — `chatsearch-index/index-service.ts:271`
   scans at boot; candidate: delay until idle or make incremental.
5. **Session switching** — previously fixed to ~0.5 ms median (ROADMAP:312);
   expect baseline to confirm and route effort elsewhere. The workload journey
   still watches it for regressions.

## Out of scope this round

Android-specific work (shared renderer wins carry over anyway); GPU-specific
optimization beyond spot-checks; the dual-model OOM budget work
(`docs/active/investigations/2026-08-16-dual-model-oom-desktop-crash.md` — its
own effort); remote web serving beyond history-load timing.

## Success criteria

- Rig runs unattended overnight and produces comparable reports across days.
- Baseline report ranks the four target areas with real numbers.
- Final PR: every commit carries verified before/after numbers; screenshot
  parity holds throughout (or diffs are flagged bug fixes); `verify.sh` green;
  no user-visible behavior change.
