---
status: active
---

# Performance lab: completion handoff

## Mission — read this first

Complete the performance lab, then use it to find actionable problems in YouCoded. The owner wants the **fully functional lab first**, not a reduced subset declared finished. GPU/display, energy, whole-app memory, background/congestion and cross-platform measurements remain in scope.

The lab must also be practical: **choose two app candidates, run matched workloads, see understandable differences, change a candidate, and rerun quickly**. Reviewed code, short instructions, preserved evidence and a demonstrated comparison workflow are part of completion—not optional cleanup.

The owner is frustrated by repeated infrastructure work, stopping and scope changes. Work efficiently toward explicit acceptance criteria. Do not add machinery without identifying the required measurement it unlocks. Do not quietly drop capabilities. Missing data must remain missing, but merely labeling a required capability unavailable does not complete it.

The owner approved proceeding with implementation and verification. Routine work needs no repeated “continue.” Check in at the milestones below, or sooner for a genuine owner-only decision. Evaluation publication is NOT authorized by earlier permission to merge the app fixes.

## 1. Where to resume

Workspace (`W` below):

`/home/destin/youcoded-dev/worktrees/sessions/93-file-viewer-freezes`

- Branch: `session/93-file-viewer-freezes`.
- Existing unfinished evaluation code and evidence live here. Changes remain uncommitted/unmerged.
- Resume with `node scripts/workspace-start.mjs --session 93-file-viewer-freezes --item 93` from the main workspace; read its returned instructions/report.
- Latest startup reported 548 incoming workspace commits relative to the preserved branch. Do not blindly rebase/merge or migrate unfinished changes. Recheck current state; preserve historical copies.
- Startup/card operations perform their normal bookkeeping commits; that is not publication of the lab implementation.

Primary task plan:

`W/docs/active/plans/2026-10-18-stall-lab.md`

Its final section, **Owner-confirmed completion contract and checkpoints**, records the latest agreement. This handoff expands the task facts, not workspace rules.

Read on entry: returned `CLAUDE.md`, `docs/MAP.md` perf-lab row, relevant safety rules, plan, and `scripts/perf-lab/README.md`. The README includes historical sections: verify current code and evidence rather than treating all examples as supported commands.

### Two app baselines — do not confuse them

| Candidate | Location / identity | Meaning |
|---|---|---|
| Merged app evaluation checkout | `/home/destin/youcoded-dev/worktrees/sessions/96-merged-evaluation/youcoded`; HEAD `254ff9983aa3657a937dfd65011beb3c6e6508c9` | Clean source at the separately merged app fixes; verify again before use |
| Historical app/cache | `W/youcoded`; historical HEAD `bc9e43752…`, fingerprint `331dbfcbbf58` | Earlier runtime evidence; does NOT contain final merged viewer corrections |

Merged candidate package: `desktop/release/linux-unpacked` under the merged checkout.

- Cache fingerprint: `3c937cd909bc`.
- Executable SHA-256: `09f76150ca151b0d8eec9d984ef290393ae73583bf6508655799a61a351086d2`.
- `app.asar` SHA-256: `77130dc891186705f01fdd332c9fb2f7d505b9da8e418b6b74486bb873d3e147`.
- Optional Linux Office add-on absent in that package; do not claim its coverage.
- Build evidence: `W/scratch/merged-baseline-testpackage-20261021/`.

Preserve both checkouts, packages, raw reports and failed attempts. An old report does not become current evidence because app fixes were subsequently merged.

## 2. Already completed — do not redo

### App fixes shipped to source

App PR **#665**, merge `254ff9983aa3657a937dfd65011beb3c6e6508c9`:

- File viewer selection/read-generation guards, stale-delivery invalidation, dirty-draft and concurrency-token preservation, conflict-safe saves.
- Large exact comparisons moved into a bounded browser-worker queue.
- Complete conversation indexing, including tags, moved into a bounded Node worker.

Recorded final verification: 5,546 related tests passed, 36 skipped; 136 focused tests; desktop checks passed. CI passed Linux test shards/packages and Android JVM/APK builds. No Android-device runtime claim. Nothing installed or restarted.

Workspace close-out PR **#289**, merge `e1a5a4e481be09cb615abaa22e7d20f5688eac4d`. Card **#110 closed**; **#93 and #96 remain open**. Verification archive: `W/scratch/app-665-verification-evidence.tar.gz`.

**Original JPEG incident remains causally unresolved.** These independently confirmed fixes do not prove its cause.

### Substantial lab foundations already exist

- Independent main/renderer loop sampling; scheduling delays; bounded repeated input and clock uncertainty.
- Five calibration controls, including delayed renderer blocking and sustained short-task congestion.
- Model-free fixtures, cached-only builds, disk guards, atomic reports.
- Expected-repeat/required-step completeness, worst-tail gates and provenance/comparability checks.
- Conservative coverage imports; missing/incomplete captures do not become healthy zeroes.
- Supervisor-owned isolated spawning, descriptor-exec gate, retained process identity and observed retirement.
- Bounded privacy-filtered process-read forensics.
- Existing `run.mjs`, `compare.mjs`, `comparability.mjs` and documented report comparison. Extend these where appropriate, rather than inventing a parallel comparison system.

Latest recorded consolidated verification: **739 passed, zero failures/skips** from explicit manifest selections, live tests disabled. Log: `/tmp/93-final-supported-offline.log`. This is not all repository tests or end-to-end acceptance. Rerun relevant checks after changes.

## 3. Checkpoints and completion criteria

### Checkpoint 1 — concrete finish line and remaining-work map

Deliver one concise matrix: required measurement → current runtime evidence → exact remaining implementation → external prerequisite → acceptance proof.

Include all workstreams in section 4 and the candidate workflow below. Inspect actual source and evidence before marking any item done. Pin the platform/device matrix and energy/display measurement boundaries: cross-platform work cannot be called complete from Linux unit tests. If required hosts/devices/access are unavailable, identify the exact need and obtain an owner decision; do not invent support or silently narrow scope.

**Exit criteria:** one bounded, dependency-ordered completion plan; no unexplained broad “hardening” work; real owner-only blockers identified. Briefly check in with the owner. This checkpoint does not itself certify the lab.

### Checkpoint 2 — required measurement capabilities operational

Implement and demonstrate the missing paths end to end. Run bounded controls/smokes before larger workloads. Every infrastructure change must unlock a named acceptance item or fix an observed defect.

**Exit criteria:** required capabilities have actual measurements on the agreed platform/device matrix, with units, attribution, limits, workload completion and cleanup established. A permission failure or unimplemented binding remains a blocker, not a pass. Check in with demonstrated outcomes and unresolved external blockers, not a long infrastructure narrative.

### Checkpoint 3 — complete, repeatable, reviewed lab

Mandatory practical workflow:

- A short documented entry point accepts **two explicitly identified app candidates** and a workload selection. Head-to-head means matched sequential runs, not simultaneous stress tests competing for resources.
- Quick targeted iteration and full acceptance modes; preflight explains prerequisites, selected work and bounds.
- Reuse verified unchanged builds/fixtures. Ordinary reruns require no bespoke scripts or manual report assembly.
- Same instrument/workload/fixture configuration for both candidates. Record build identity, machine/platform, repetitions, raw samples and relevant load conditions.
- One readable comparison: A and B values, meaningful absolute/relative changes, variability, worst cases, improvements, regressions, inconclusive/missing measurements and evidence links. No aggregate score hiding a failed required lane.
- Incompatible reports are refused/marked incomparable. Instrument or fixture changes require matched remeasurement.
- Changing one candidate and rerunning selected workloads preserves prior results.
- Demonstrate two-candidate execution, unchanged-candidate repetition to reveal noise, and known-change controls proving detection. Record actual duration instead of promising an unmeasured speed target.
- Independent final code review, relevant verification, concise executable operating instructions, preserved historical/current evidence and confirmed cleanup.

**Exit criteria:** the agreed full lab works and its practical rerun/comparison experience is demonstrated. Unsupported required capabilities still block completion unless the owner explicitly changes acceptance. Report readiness; no automatic merge/push.

### Checkpoint 4 — actionable app findings

After lab acceptance, evaluate the agreed workload matrix on the selected current app, including the original JPEG investigation. Rank findings by user impact and confidence; preserve reproduction instructions and measurements. No finding is also a separate permission to implement/ship app changes.

**Exit criteria:** useful evidence-backed problems and recommended fixes, or explicit passing/inconclusive outcomes. Separate measured symptoms from causal conclusions.

## 4. Remaining workstreams

### A. Runner integration and comparison usability

Audit the current runner/comparator against checkpoint 3. Some diagnostics remain standalone, opt-in or incompatible with standard comparison acceptance. Integrate required lanes without discarding their validity distinctions. Reconcile README, coverage inventory and plan with actual current support. Finish expected-case/repetition completeness and comparable candidate aggregation for the agreed matrix.

### B. GPU, display and graphics workloads — blocked, not dropped

Fixed-purpose private compositor supervision and a four-helper sequence exist offline. Private D-Bus rules, canonical owner-home protection, fixed executable receipts, owned socket checks, output bounds and cleanup have been reviewed.

Remaining:

1. Investigate the current EACCES failure offline and establish whether safe ownership evidence can be obtained without permission changes or weakened checks.
2. Complete successful configuration/readback; current sequence requires existing exact **2560×1600@180 Hz**, scale 1.5; no custom-mode fallback exists.
3. Implement app Wayland binding to the supervised compositor and then enable the GPU CLI/realism paths, which deliberately refuse runtime today.
4. Validate hardware graphics workloads, measurement attribution and display/presentation limits. Virtual presentation/rAF is not physical scanout.

Latest attempt: `W/scratch/perflab/private-compositor-path-rule-CtDu5Z/`.

D-Bus parsing succeeded; readiness failed reading `/proc/4184895/environ` with EACCES. Inspection/configuration helpers did not run. Cleanup confirmed; recorded PIDs 4184893/94/95 were absent. **Cause of EACCES unconfirmed. Do not blindly rerun or bypass it.**

Earlier preserved attempts under `scratch/perflab/`:

- `reviewer24-private-compositor-jaqM7ZWY/`: private-HOME guard error; source repaired, original cleanup unconfirmed.
- `reviewer25-private-compositor-GNBjRyVe/`: invalid D-Bus denial syntax; source repaired, original run failed with cleanup confirmed.

Fast-helper evidence: `W/scratch/perf-lab/synthetic-fast-ouYjEL/evidence.jsonl`. Fixed `/usr/bin/true` test proved descriptor-exec mechanics only, not production helper acceptance.

### C. Energy

Sensor-only preflight recorded GPU-domain readings around 18.6–19.0 W, CPU energy-counter EACCES and truncated discovery. Overall incomplete. Finish required sensor coverage and workload-integrated measurements; establish what attribution is actually defensible and what additional access/hardware is necessary.

Domain power is not app watts. CPU time/context switches are not energy. Do not use either as a substitute just to finish. External access or equipment requirements need an owner decision.

### D. Whole-app memory/lifecycle

Renderer-only natural-settle measurements work. Whole-family PSS comparisons remain incomplete because membership churn/incomplete snapshots invalidate comparisons.

Finish reliable identity/lifetime-aware whole-app accounting, matched workload/no-work sampling and practical candidate comparisons. Preserve natural versus forced-GC separation. Use deeper retention investigation if controlled evidence warrants it; no leak claim from rising counters alone. Summed RSS is not unique memory.

### E. Congestion, queues and background work

Existing stream diagnostics prove producer completion, exact bridge receipt, switching during streaming and visible output after reveal. Remaining: internal reducer/batcher queue depth and pending age, applied/dropped conservation, real OS-hidden/minimized-window behavior, and useful integration of background CPU/context-switch observations.

Hidden conversation tabs are not hidden windows. Bridge receipt is not reducer completion. Keep input-to-DOM distinct from physical presentation.

### F. Workload breadth and original incident

Expand bounded coverage for larger PNG/JPEG and supported formats, spreadsheets with merged cells/multiple sheets, longer Word/table cases, CSV shapes/full-file reads, HTML assets/scripts, large inline path lists/watcher startup, and long-list traversal/reopen cases. Check optional viewer dependencies before claiming coverage.

Bound generation/decoding resource use externally; compressed output size does not cap encoder/decoder memory.

Original JPEG:
`/home/destin/Projects/metropolis-e5-astra/docs/review/era5-housing-wealth/wealth-game.jpg`

Original conversation: `8521c586-ea96-4486-8105-fd1ee7096d51`.

Reproduction remains unconfirmed. Use an isolated copy/test environment, never the working app.

### G. Platform/runtime coverage

Linux results do not establish Windows/macOS/Android behavior. Determine actual available hosts/devices and required access before promising runtime coverage. APK builds are not device performance tests. Keep platform-specific metrics and unsupported instrumentation explicit; no synthetic result substituted for device evidence.

## 5. Evidence worth preserving and reusing

All paths below are relative to `W` unless stated otherwise.

| Evidence | What it establishes / limits |
|---|---|
| `scratch/perf-lab/renderer-settle-4zJItHUf/` | Merged candidate: 24/24 renderer points, three cycles, six exact replies, cleanup confirmed. Counts rose then dropped in cycle 3 without forced GC. No leak or GC-causation conclusion. Whole-app PSS not established. |
| `scratch/perf-lab/coverage-review-fixes-lxukV3qh/` | Reviewed inventory/import snapshot; source distinctions, joined settle evidence, sensor errors and natural/forced-GC distinctions preserved. |
| `scratch/image-stalls-runtime-wSQUqA/` | Historical small PNG: seven open/decode/zoom/pan/reset/release/reopen operations; screenshots inspected. Not current-build broad image acceptance. |
| `scratch/stream-completion-runtime-BPiBTZ/` | Historical plain stream: three 3,000-delta legs, eight in-stream switches, exact post-reveal output. Not internal queue coverage or standard Markdown workload. |
| `scratch/dom-growth-runtime-jidlo1wg/` | 50→550 rendered rows, 1,912→7,483 nodes; reopened at 50 rows/1,920 nodes. Partial 2,000-row traversal, not saturation/full coverage. |
| `scratch/sensor-runs/preflight-20261020T221551Z-16573/` | Sensor preflight, incomplete; not app energy. |

Historical small CSV/document calibration also succeeded; verify individual receipts before reuse. Raw failed lifecycle reports remain incomplete. Never retrospectively turn a failed attempt into a pass after fixing source.

## 6. Code entry points and verification

Under `W/scripts/perf-lab/`:

- `run.mjs`, `compare.mjs`, `comparability.mjs`, `coverage.mjs`, `README.md`.
- `short-lifecycle.mjs`, `gpu-cost.mjs`, `energy-sensors.mjs`.
- `supervised-launch*`, `supervised-package.mjs`, `supervised-retirement.mjs`.
- `owned-processes.mjs`, `proc-forensics.mjs`, `owner-home.mjs`.
- `supervised-compositor-*`, `supervised-exec-gate.py`.
- `tests/offline-unit-manifest.json` — explicit audited test selection.

**Never broad-glob the lab tests.** Some launch browsers/processes or make temporary Git commits. README section “Consolidated source-only unit selection” documents the manifest-driven command and separate Python/local-HTTP checks. Inspect the current manifest and environment gating before running. Unit passes do not certify runtime or hardware.

After changes run relevant selected tests, combined verification and fresh review. Apply required app verification if app source is touched. Use existing bounded runners and documented options; do not turn old README examples into authorization for unsafe runtime actions.

## 7. Safety, authorization and coordination

- Never attach to, instrument, signal, reconfigure or experiment on the installed working app. Use verified isolated packages/dev instances with private state and owned processes.
- No system permission changes, privilege escalation, installations, model downloads or paid evaluations are authorized for this remaining work. Ask for a concrete requirement when genuinely needed.
- No weakening process ownership proofs to make graphics tests pass. App supervision alone does not establish compositor/provider/display/controller containment.
- Preserve unfinished code, original worktrees/packages and failed evidence. No surprise cleanup/rebase/reset.
- App fixes/docs were authorized to merge and have shipped. Evaluation merge/push remains a separate decision.
- Prefer focused specialists; the parent coordinates and checks results. One writer at a time, independent read-only reviews may overlap. Background completion notifications previously failed/delayed: recover actual status before duplicating work or claiming it is running.
- The previous conversation exhausted its 30-specialist budget; a tool call confirmed refusal even after compaction. Start a genuinely new conversation for fresh delegation capacity. No specialist or runtime command is running at this handoff.

## 8. First actions for the new session

1. Resume the existing workspace and read task guidance/current status without disturbing historical code or caches.
2. Read the completion contract and inspect runner/comparison gaps plus the remaining measurement paths. Delegate focused independent audits where useful; avoid duplicating the previous broad hardening cycle.
3. Diagnose the saved compositor failure offline, and inventory actual platform/sensor prerequisites without changing permissions or launching another blind attempt.
4. Deliver **checkpoint 1**: concise acceptance matrix, dependency-ordered implementation steps and exact owner-only prerequisites.
5. Continue through capability implementation, full repeatability/review, then app evaluation. Keep the owner informed at the named checkpoints rather than ending every routine step on a promise.

## Handoff verification status

This handoff records saved source/evidence and owner decisions; it is not a fresh runtime certification. The preceding turn updated and reread the plan’s completion contract. No new app/lab implementation or runtime test was performed while preparing this document. Revalidate current state before acting.
