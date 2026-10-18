---
status: active
---
# Coverage-preserving CI fast paths — implementation plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. The design below was approved in chat on 2026-10-18 after an independent review.

**Goal:** Remove serial waiting and card-only overhead without dropping existing tests or installer targets, and correct the existing fail-open desktop diff classifier.

**Architecture:** Each repository has an executable, tested CI policy module. App CI classifies conservatively, runs cheap checks first, then the unchanged full test matrix and Linux installer build in independent clean jobs. An always-running completion job retains the existing `build (ubuntu-latest)` context, accepting only explicit successful dependencies. Workspace CI selects a whole-graph card validator only when every changed path is inside `cards/`; other events/changes retain the entire full suite. Scheduled/manual runs remain full.

**Tech Stack:** Node 22 built-in tests, Git NUL-delimited diff output, GitHub Actions YAML, existing Vitest YAML contracts, pinned PyYAML 6.0.3 for parsed workspace contracts, and actionlint. The workspace changes job provisions this test-only parser in a private venv; the runtime classifier remains dependency-free.

## Global constraints / approved boundaries

- No test selection, sharding, installer-target removal, new caches or signing/release changes.
- Keep current desktop OS/event matrix and manual browser diagnostics; diagnostics never report the required full-build context.
- Keep Android's tests/builds and event filters; add only PR-scoped stale-run cancellation.
- No branch-protection changes, cross-workflow Android aggregation or merge-queue activation in this slice.
- No commits, publication, remote CI dispatches or merges without further authorization for this new implementation.
- Use fresh job checkouts/dependencies; package outputs must not rely on test-generated files.
- Classifier errors fail, never mean docs/cards-only. Unknown/mixed paths select full. Empty diffs conservatively select full.
- Handle deleted/renamed files, large diffs, unusual filenames, missing refs and malformed events. Read complete NUL-delimited git output without an early-exiting shell pipeline. Disable rename detection so both old and new paths are classified.
- Gate acceptance is an executable truth table: missing/failed/cancelled/unexpected-skipped dependencies fail; expected skips are accepted only for an exact proven route.
- Cards-only means exclusively `cards/` paths; closing a card with `docs/shipped.md` is mixed and remains full. Validate all cards, not only changed files. This does not promise validation of arbitrary Markdown links.
- No paid probes or live-app interaction. Local verification is not a measured GitHub scheduling improvement.

## Task 1 — app CI policy, topology and cancellation

**Files:** app `scripts/ci-policy.mjs`, `scripts/ci-policy.test.mjs`, `.github/workflows/desktop-ci.yml`, `.github/workflows/android-ci.yml`, `desktop/tests/desktop-ci.test.ts`, and the existing beta-workflow contract where its caller changes.

**Interfaces:** CLI `node scripts/ci-policy.mjs changes` reads `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`, repository Git state and `GITHUB_OUTPUT`; writes `code=true|false` only after successful classification. Completion CLI consumes dependency results through a JSON environment variable rather than source interpolation. Pure policy exports are tested directly.

- [x] Write executable regression tests first. Include a real temporary Git repository large enough to reproduce the old `grep -qv`/pipefail failure; docs-only, mixed, empty, deletion, docs→code and code→docs rename, newline/tab/space filenames, bad/missing base, all-zero push-before and unsupported events.
- [x] Run the new tests against the old classifier/extraction and record expected failures.
- [x] Implement complete NUL-delimited Git capture and fail-closed output. Test both policy decisions and the actual CLI's exit/output behavior.
- [x] Write gate truth-table tests before implementation: docs requires successful classification and all expensive jobs skipped; full requires every selected job success; browser requires diagnostic tests/preflight success and package skipped. Failed classification, missing results, arbitrary output strings, cancelled/failed or unexpectedly skipped legs reject.
- [x] Restructure desktop workflow: changes → preflight matrix → independent full-test matrix and Linux packaging → completion matrix. Preserve required names and all existing commands/OS coverage, run beta and policy Node tests in preflight, move types/knip/lint/design checks ahead of expensive jobs. Linux packaging retains `npm ci`, rpm/libarchive setup and the unchanged `npm run build`.
- [x] Retain browser dispatch's exact test group, debug env, full default, inherited test shell, no packaging and distinct status names.
- [x] Add workflow+PR-scoped cancellation to desktop and Android CI; non-PR invocations use unique run IDs and do not cancel each other. Release workflows untouched.
- [x] Extend parsed workflow contracts to verify topology, guarded jobs, stable contexts, cancellation, unchanged target commands and standalone test invocation. Mutation-test at least one real workflow guard.
- [x] Verify: `node --test scripts/ci-policy.test.mjs scripts/beta-version.test.mjs`; affected Vitest workflow contracts; `actionlint`; workspace `bash scripts/verify.sh <app-worktree>`.

## Task 2 — workspace card-only lane

**Files:** workspace `scripts/ci-workspace.mjs`, `scripts/ci-workspace.test.mjs`, `.github/workflows/workspace-ci.yml`.

**Interfaces:** CLI `node scripts/ci-workspace.mjs changes` uses the same event/ref/output contract and emits `lane=cards|full`. CLI `gate` consumes JSON dependency results. The existing full job becomes conditional; the stable `Anchors and invariants` display name moves to the always-running completion job.

- [x] Write failing tests with disposable Git fixtures: exclusively changed/deleted card paths select cards; rename across the directory boundary, mixed docs/shipped, scripts, workflow/self-policy edits and unknown paths select full; schedule/manual/unsupported/empty ranges full; Git/event errors fail with no success output.
- [x] Run tests red, then implement complete NUL-delimited diff capture and the exact cards-only predicate.
- [x] Add dependency truth-table tests and parsed YAML integration assertions: classifier error fails final gate, cards route requires whole-graph check success and full job skipped, full route requires the unchanged full suite and card-only job skipped. No missing/failed/cancelled status is green.
- [x] Add changes job with depth-2 checkout and policy self-tests; fetch only a missing immutable event revision rather than the workspace's image history (prove with a real shallow fixture). Card-only job uses checkout/Node/`node scripts/cards.mjs check --root .` without public component clones; the explicit root prevents the card tool from reading moving master instead of the candidate. Full job keeps all existing steps in order and uses the same explicit candidate root; final job runs with `always()` and validates exact results.
- [x] Prove whole-graph validation rejects a reference to a deleted card using temporary card fixtures (reuse existing tool tests where possible; do not change real cards).
- [x] Verify Node tests, YAML/actionlint, `node scripts/cards.mjs check`, and `node scripts/audit-anchors.mjs`.

## Task 3 — independent review and handoff

- [x] Review diff scope and compare old/new commands so no existing check or installer target disappeared.
- [x] Fresh independent reviewer checks classifier error paths, event SHA provenance, job/status conditions, cancellation scope, card graph and diagnostics.
- [x] Address findings with failing regressions, then rerun relevant verification.
- [x] Record actual local results and remaining remote validation: CI scheduler behavior, required-status appearance, intentional failed/cancelled dependency cases, clean packaging without test output and warm/cold timing need an authorized candidate push/CI run before rollout. Do not report estimates as measured savings.
- [x] Offer the instruction-file harness evaluation only if implementation changes agent guidance; no paid runs by default.

## Self-review

The two implementation tasks are independent across repositories, but share safety requirements. Every approved first-pass item has a task; deferred routing, platform enforcement, caches, release cleanup, smoke coverage, packaging-target parallelism and runner tuning are intentionally excluded. No live configuration or merge authorization is inferred from approval to implement.

## Execution record — local implementation complete

Tasks 1 and 2 independently approved for specification compliance and code quality; final whole-branch review found no remaining important findings and approved proceeding to authorized candidate CI validation. The brief's browser-file count was a wording error: the exact existing command has six files and remains unchanged.

Observed local verification: 445/445 workspace script/hook tests; 16 focused workspace policy/YAML tests; 26 app-policy/beta tests (also on Node 22); 9 focused Vitest workflow contracts; required desktop verify (types, related tests and 81 scanning guards, dead code, lint, design lint, executable invariants); actionlint and documentation anchors. Workflow mutations were shown red and restored. No native agent prompt/tool guidance was changed, so no harness evaluation was needed.

All implementation checklist items above are locally complete; this is NOT remote acceptance or a shipped record. Actual GitHub status appearance, dependency skip/cancellation scheduling, fresh installer job execution and warm/cold timing require an authorized candidate commit/push and CI run. No implementation commit, candidate push, dispatch, merge or branch-protection change has been performed. Destin subsequently authorized implementation commits, candidate PR pushes and CI validation without merging. Candidate validation is now in progress; this does not authorize merge, protection changes or a rollout of unmeasured estimates.
