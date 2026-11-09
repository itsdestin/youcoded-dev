# Claude direct controls — code review and verification findings

status: active

**Latest owner-approved mitigations:** `@`-bearing text now takes the legacy composer before dispatch; user-facing Stop is restored to raw Escape, with a pre-dispatch host guard for cached older clients. Both were pinned red/green and received clean fresh static reviews. Structured Stop is deferred; retention and broader parity/platform coverage remain follow-ups on #11/#12. The earlier unsafe behavior below describes the `.2` test build, not these mitigations.

**2026-10-19 real-task review supersedes merge readiness:** eight real Haiku prompts (four per transport) exposed missing `@file` expansion and running-tool Stop resuming via a background completion notification only on the mods arm. Do not merge unchanged. Closed-session retention also needs bounded retirement. See `../investigations/2026-10-18-claude-controls-build/REAL-AB-REVIEW.md`; these are unresolved findings on #11, not fixed by the green scripted checks below.

Fresh read-only reviewer inspected the production transport and integration. No critical findings; three important findings accepted below. Runtime smoke is separate evidence, not supplied by the reviewer.

| ID | Disposition | Finding | Planned regression |
|---|---|---|---|
| R1 | fixed | Deferred preparation can launch a writer after handoff stopping began. | Hold preparation, start handoff, finish preparation: no spawn. |
| R2 | fixed | Rejecting different text under an existing send ID can clear uncertainty for the original request. | Original pending + conflicting ID rejection remains unknown until original receipt. |
| R3 | fixed | Dispatched/unclaimed expiry keeps an operation that can neither claim nor settle in the active queue. | Expired ID stays unknown but frees active capacity for fresh operations. |
| P1 | fixed | An active-turn Stop needs reserved capacity even when mutations fill the bounded queue. | One addressed Stop bypasses a full mutation queue; duplicates do not grow it. |
| V1 | fixed | Full desktop verification found line-budget overages in ipc-handlers and chat-reducer. | Extract receipt wiring and pending-send entry updates into focused helpers; do not raise budgets. |

Pre-review integration tests: targeted suites and IPC/phone/workbench parity passed. Initial full verification: types, 20,484 tests, knip, lint, design lint, ast-grep, screens and journeys passed; line-budget guard was the sole failing test, plus the matching early budget check. This is not final verification.

Follow-up static reviewer found no remaining Important findings after R1–R3/P1 fixes. Full desktop verification subsequently passed types, tests, knip, lint, design lint, ast-grep, screens and journeys (`/tmp/cc-direct-controls-verify-final.log`). Actual compiled production-bridge CLI smoke passed 9/9 baseline and 9/9 warm-model cancellation cases using the local scripted API; workbench boot check passed 16 routes.

GUI smoke then found G1: direct Stop cancels the native turn but omits the transcript interrupt marker, leaving the chat spinner active. A same-session Terminal Escape comparison clears the spinner and produces `Interrupted.`. G1 is fixed with target-scoped lifecycle cleanup without replacing transcript observation. Follow-up G2 (Stop before the file reader observes its user row) is fixed using the supported `session.append` UUID paired with the actual main turn, retaining accepted completion until that exact row arrives. The final reviewer found no outstanding Critical/Important findings, including delayed partial text and newer-turn safety. Evidence: `../investigations/2026-10-18-claude-controls-build/gui-smoke-report.md`.

Final 2026-10-19 verification: `verify.sh --full` passed every gate, with **20,534 tests passed, 47 skipped**. A native-harness inherited-askpass assumption in `bash-env.test.ts` failed reproducibly and was corrected with explicit test environment isolation plus ambient-preservation coverage; production admin behavior was not changed. Final CLI 2.1.303 production-bridge smoke passed 9/9. Real GUI Stop (including fast Stop), subsequent send, model cancel/confirm, compact and clear passed. Final independent Linux package `1.3.1-cc-controls.2` built successfully; packaged code hashes matched compiled output and its isolated launch reached onboarding, externally photographed. No real-model calls were used for final verification.

Android: backend compiled/packed, but the full `test` task hit a native-runtime packaging prerequisite (`apk version -t` unavailable). The separate Debug unit-test run excluding web/runtime assembly passed 36 tests with no failures/errors. This does not certify an Android APK or the runtime mod path.
