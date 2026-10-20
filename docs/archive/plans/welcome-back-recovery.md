---
status: superseded
---
# Welcome back recovery implementation plan

Historical first-stage plan. Superseded by the completed `docs/archive/plans/welcome-back-tools-readiness.md`, which records final implementation, integration and publication. Results below describe their dated snapshots, not the current combined tree.

**Goal:** Restore selected conversations concurrently without bypassing admission, dropping history, or restarting old commands.

**Architecture:** Keep the existing per-conversation create/admission and first-page loading paths. Remove cross-conversation waiting in App's batch callback; serialize only shared user-confirmation UI. Investigate native background-command recovery before changing it. No new screen, copy, IPC channel, or model requests.

## 1. Reproduce and remove serial batch startup
- [x] Baseline the existing Welcome back, ResumeBrowser, and lease-gate suites (50 tests passed).
- [x] In `youcoded/desktop/tests/app-welcome-back-gating.test.tsx`, hold `session.create` unresolved and assert all three supported fixture conversations reach create before any acknowledges. Observed red: expected 3 calls, got 1.
- [x] In `youcoded/desktop/src/renderer/App.tsx`, replace the serial batch loop with `Promise.all`, keeping independent calls through `handleResumeSession` and deterministic input-order result accounting.
- [x] Verify the regression is green; the App suite also covers a slow first restore failing after other sessions have opened. The first-page test applies B's history before A's and checks correct session routing and one fill per session.

## 2. Preserve ownership consent and background recovery safety
- [x] Finish the independent backend trace: `conversations/resume-admission.ts` coalesces opens by conversation, not globally; native startup can await MCP/history/delegation work. Cold native recovery does not reconstruct or restart old shell jobs. Claude CLI startup behavior is outside this app-side trace.
- [x] Add a regression for simultaneous ownership confirmations: observed red when the second question replaced the first; green with the FIFO queue while an unrelated restore launches.
- [x] Queue shared confirmation prompts through `hooks/use-takeover-prompts.ts`, including unmount draining and rejection of late asks. Extracted rather than increasing App's line budget.
- [x] Do not change background-command recovery without evidence of a bottleneck. Existing startup work becomes concurrent through the batch fix; no automatic shell restart was added.
- [x] Exercise existing admission/deduplication and first-page history tests alongside new tests: 83 focused tests passed. An additional 48 native resume/startup/background-command safety tests passed.
- [x] Preserve the singleton cross-device transfer slot and explain deferral of a second accepted request instead of silently skipping it. Regression observed missing-notice red, then green; the first transfer remains untouched and the second row remains available.

## 3. Verify
- [x] Final `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/welcome-back-recovery/youcoded` exited 0: types, test types, related tests (2,416 passed, 36 skipped), knip, lint, design lint, ast-grep, all 391 named screen captures and journeys passed. Log: `/tmp/welcome-back-final-pass.log`; detailed logs: `scratch/verify-20261017-205736-1492846/`. Recovery regressions: 83 passed; native resume/background subset: 48 passed separately. The unrelated intermittent Kit pieces screenshot race was fixed with a layout-frame callback replacing its 300 ms timer, a hosted-fixture red/green regression, 15 passing kit tests, screenshot inspection, and fresh review. Workspace anchor audit passed (573/573 anchors, 1,081/1,081 MAP paths), with existing unrelated warnings.
- [x] Fresh reviewer found a silently skipped second cross-device transfer; the explicit-deferral correction and regression were reviewed again with no outstanding actionable findings. Final full verification passed after that correction.
- [x] Changes remain uncommitted and unshipped on `session/welcome-back-recovery` in app/workspace; work item #163 records the result. No live-app operations or actual power-cut recovery test performed. Android build and marketplace Worker were not run; this fix adds no platform-specific source or IPC channel. Full desktop verification uses isolated fixtures, not Destin's live sessions.

## 4. Requested real dev-runtime follow-up
- [x] Measure the actual Welcome back button in a private-HOME `run-dev.sh` instance with 16 saved chats. Initial valid baseline dismissal: 7.44 s; warm repeat: 1.74 s. Do not attribute the whole difference to source changes.
- [x] Pin and fix repeated auto-selection during recovery and mounting all never-active ChatViews. Retain views once activated; active terminal Preview routing remains mounted, with its own red/green regression.
- [x] Launch 4 real HTTP servers through native background Bash, abruptly terminate only the identity-checked test main process, and restore 16 chats. Corrected repeats: 1.23 s to leave Welcome back, 2.07–2.10 s to visible history; every prior UUID preserved exactly once.
- [x] Restore 16 read-only copies of real root conversations (61.61 MiB, 31,040 events); corrected repeats: 1.51–1.53 s dismissal, 1.53–1.67 s visible history. No original file modified; copied history counts unchanged.
- [x] Test mixed native/actual Claude Code recovery: 13 native + 3 actual Claude CLI resumes over 164.37 MiB of copied histories, three runs. Welcome back: 1.88–2.36 s; visible history: 2.36–2.52 s. All three CLI SessionStart hooks arrived by 1.46 s. Explicit bwrap outside-write canaries refused; SHA-256 pre-existing transcript prefixes preserved; access-only/no-refresh auth snapshot removed after shutdown.
- [x] Test an intentionally stalled optional MCP handshake: full Welcome back measured 16.73 s. This remains above the requested ceiling; installed native registry file was absent, so this is not the cause of the tested ordinary/server case.
- [x] Preserve descriptor-inheritance diagnostics without a speculative spawn rewrite or an intentionally failing suite test. Original 307 scoped tests pass; no production Bash code changed.
- [x] Fresh renderer re-review clean; final combined desktop verification passed: 2,491 tests, 36 skips, all 391 screens and journeys, types/lint/knip/ast-grep. `/tmp/recovery-runtime-verified.log`.
- [x] Continued in the successor readiness plan: user authorized independent history/tool initialization and explicit Retry/Continue, implemented and verified there. No unconditional five-second bound is claimed.

Historical runtime report: `docs/archive/investigations/2026-10-18-welcome-back-runtime-measurements.md`. At this stage's end the dev instances/endpoints were stopped and source remained local/unshipped; current state belongs to the successor plan.
