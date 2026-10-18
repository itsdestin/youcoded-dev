---
status: shipped
work_item: 93
---
# Session freeze diagnosis and hardening implementation plan

> Completed with test-first changes and independent review. User authorized merge/close on 2026-10-17. App PR #629 merged as bc9e43752 on 2026-10-18 after desktop and Android CI passed. This record closes the implementation, not the unresolved incident or broad card #93. No release tag or installed-app update was requested.

**Goal:** prevent confirmed session-start main-thread blocking and make severe freezes observable without claiming the unproven 27-second incident fixed.

**Architecture:** retain the existing private, bounded hitch recorder, using timer lateness as an independent stall lower bound and reserving capacity for severe events. Prepare skill discovery in a serialized worker thread before constructing per-session tool wiring, reusing the existing scanner to preserve metadata and precedence. Add only bounded, content-free stage timing needed to distinguish remaining creation suspects. No UI or protocol redesign.

**Tech stack:** Electron, Node, TypeScript, Vitest; existing performance tooling.

## Evidence and scope

Installed version 1.3.1 and source baseline both resolve to app commit 7bb39989a9fef0147b7d94eaf6e7a037f21f28ce. At local 20:33:21 a native session first appeared; buddy recorded a 27050 ms frame starting 20:33:23; the minute timer slipped ~27 seconds. The main histogram had no corresponding long stall. An independent Node process reproduced a 2300 ms block missed by a reset histogram despite a 3249 ms timer interval. A second timing arrangement did detect the block, demonstrating the ordering dependency.

First-30 event retention also crowded out details: the incident minute dropped 20 entries totaling 31075 ms. This does not prove which omitted entry belongs to which cause. A 22 MB workspace artifact index separately measured 60 ms parse / 66 ms stringify; this is not the established cause of the 27-second incident. No speculative rewrite of the artifact store or keychain is in the first patch.

## Task 1: reliable severe-stall evidence

Files: `youcoded/desktop/src/main/hitch-recorder.ts`, `preload.ts`, `hitch-validate.ts` if required by existing shape, matching `tests/hitch-*.test.ts`; `youcoded/docs/hitch-recorder.md`.

- [x] Read existing tests and add deterministic stale-histogram regression: after a normal first tick, advance the clock 3300 ms with a quiet histogram; expect a stall >=2300 ms. Keep first tick, explicit sleep and >60-second suspension exclusions correct.
- [x] Run the new test and observe failure before editing implementation.
- [x] Calculate `timerDelay = lastTick ? Math.max(0, now - lastTick - 1000) : 0` before updating lastTick. Record the maximum of histogram estimate and timerDelay. Preserve existing privacy schema and bounded writes.
- [x] Add regression for 30 small input entries followed by a multi-second frame. Preserve bounded output while retaining severe frame evidence through BOTH renderer and main rate gates; test rollover, dropped tallies and hostile batches.
- [x] Implement bounded severe-event reservation/selection with WHY comments; do not increase an unbounded stream or leak content.
- [x] Run all hitch tests, update recorder reference and report reader if semantics require it.

## Task 2: nonblocking session skill discovery

Files changed: `youcoded/desktop/src/main/session-discovery.ts`, `session-discovery-worker.ts`, `session-setup-timing.ts`, `create-runtime.ts`, `harness/native-session-host.ts`, `ipc-handlers.ts`, `providers/recoverable-safe-storage.ts`, and corresponding tests. Existing `skill-scanner.ts`, `skill-catalog.ts` and `claude-code-context.ts` behavior is reused unchanged by the worker. Workspace report wording/tests also changed.

- [x] Measure discovery in a separate process against read-only real skill inventory, or isolated equivalent fixtures; no live IPC.
- [x] Pin scanner compatibility: installed/project/user precedence, malformed files, frontmatter and plugin path behavior.
- [x] Add off-thread discovery and session catalog preparation, preserving catalog identity and load behavior. Fresh create, resume and explicit slash invocation use the runtime-injected async catalog factory; per-turn reads use the prepared in-memory catalog. Claude context uses the same worker service. Existing synchronous factory remains for non-runtime embedders/tests. The composition-root wiring has a behavioral test.
- [x] Test deferred worker results, coalescing, project/context equivalence, creation/resume injection, and delayed Claude context ownership. Test stuck worker termination red then green; measure main-thread heartbeat with compiled workers and a large isolated fixture.
- [x] Instrument only unresolved initialization boundaries using existing perf-mark conventions where possible; bounded timings contain stage enums/durations only, no paths, tokens or prompts.

## Task 3: verification and disposition

- [x] Run `bash scripts/verify.sh <absolute app worktree>`; inspect and address failures, not only exit status.
- [x] Run compiled backend worker and recorder probes in independent Node processes; synthetic inventory uses disposable HOME. No interactive app rig was needed for these backend checks. No model calls, copied credentials, live IPC or renderer attachments.
- [x] Request a fresh independent reviewer; resolve findings and rerun affected checks.
- [x] Check Android build prerequisites before any parity claim. Recorder is Electron-only; shared backend discovery is exercised by desktop tests, but that is not an Android build.
- [x] Record exact results, root-cause uncertainty and follow-up evidence in this plan and card #93. Do not close the broad card or claim the reported severe freeze eliminated without reproduction.

## Verification observations

- Private dependencies installed after removing ONLY this worktree's stale hardlink farm. No shared dependency patching.
- Runtime discovery uses `session-discovery.ts` + `session-discovery-worker.ts`, one active job and identical in-flight request sharing, no stale cross-session cache; worker body reuses the existing scanner/context builder rather than duplicating their behavior.
- Compiled production recorder, isolated Node process: a deliberate 2300 ms block produced a 2303 ms stall record. The corresponding pre-fix reset pattern missed a 2300 ms block.
- Read-only actual skill inventory: 28 entries, 7 ms synchronous scan; 23 ms compiled-worker round trip, heartbeat max gap 5 ms. This does NOT support blaming normal skill discovery for the reported 27 seconds.
- Isolated 400-skill fixture, each with 128 KiB body: synchronous elapsed 30 ms / heartbeat gap 31 ms; worker elapsed 85 ms / heartbeat gap 6 ms. The change improves responsiveness, not total throughput.
- Initial required verify found intended integration assumptions: MCP test expected an empty skill dependency, Claude context test expected next-tick completion, and native-host exceeded its line budget by 12. Updated tests to assert async discovery/ownership; shortened obsolete comments in touched code rather than raising the budget. Targeted rerun: 30 tests passed.
- Other targeted runs: 31 discovery/scanner/catalog/timing tests passed; 296 lifecycle/IPC/context tests passed; keychain/timing/composition-root follow-up 17 passed.
- Android shell unit tests: 36 tests, zero failures/errors/skips, JDK21 and installed SDK. Bundled renderer/backend/native executables excluded; this is NOT an APK or on-device verification. Backend packaging copies all tsc main outputs, including the new worker.
- Workspace hitch report: tests first rejected unsupported graphics attribution and fixed +/-50ms precision; 17 tests now pass. Empty script attribution now says unknown rather than blaming drawing. Output acknowledges bounded severe reservation and timer-only lower bounds.
- Final independent review found one P1: timeout waited indefinitely for worker termination. Regression failed before correction; retirement now has a bounded grace period, retains the sole slot until confirmed exit, rejects queued work explicitly, and recovers on late termination. Re-review of discovery, credential timings, recorder and report: no actionable findings.
- Final required `verify.sh`: all checks passed, 130 test files passed / 1 skipped; 3475 tests passed / 37 skipped. Types (source and tests), knip, lint, design lint and ast-grep passed. Full logs: `scratch/verify-20261017-211337-1574544/`. `tsc` build succeeded; 17 workspace report tests and 36 Android shell tests passed separately.
- Anchor audit: 573/573 anchors and 1081/1081 MAP paths passed; it resolves components from shared checkout, so it is not evidence about this app diff. Existing warnings concern other dirty worktrees, unrelated rule budgets and unnamed Pages screenshot switches; dropped from this task's edits as unrelated. Before commit, close-out incorrectly inferred 'landed' from the unchanged base tip (already recorded workspace limitation); no cleanup was performed then. Actual merge ancestry is verified before final cleanup.
- App changes merged in PR #629 after a fresh local verification and successful desktop/Android CI. The report corrections and this archived record accompany the workspace integration. Reported 27-second root cause remains unconfirmed; slow setup and keychain timings improve attribution after deployment. No credentials, tool behavior, live config, UI or prompt instructions changed.

## Design review

The user selected the focused fix-and-measure approach over broad rendering changes or a speculative keychain/artifact rewrite. No visual decisions are involved. Secrets remain private, live state stays untouched, and all added diagnostics remain bounded. Existing work on Welcome-back restoration (#163) is separate and will not be imported or overwritten.
