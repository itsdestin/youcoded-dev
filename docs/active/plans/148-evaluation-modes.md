---
status: active
work_item: 148
---
# Bounded evaluation modes and substantial task suite

Authority: `148-evaluation-product-contract.md` (not the audit's mistaken basic-mode labels). Implementation/offline checks only. No paid calls, installs, production access, commits or changes to historical inputs/reports. Independently reviewed reporting/runtime modules remain untouched.

## Mode contract

- **basic:** two explicitly fingerprinted YouCoded builds, selected 1–3 development tasks; smoke (1) or confirmation (3) repetitions.
- **compare:** explicitly fingerprinted YouCoded build and pinned Claude Code, exactly the three new development tasks.
- **thorough:** all five supported adapter registry entries, pinned, wider versioned development suite and separately labeled evaluation-only suite. Missing capabilities block rather than shrink the matrix. Public previously inspected evaluation-only tasks are not secret/unseen evidence.
- Repetition, network track, model/provider, request/time limits, image and budget are explicit independent settings. Frozen research is controlled retrieval, NOT native live WebSearch qualification. Live-web remains blocked until a supported capture/qualification path exists.

## Implementation design

New modules own mode planning, task contracts/export, deterministic reset, independent verification and a plan/prepare/check/run/report command. Existing scoped budget gateway and serial runner are reused through a narrow versioned integration; old manifests retain 20-request/180-second behavior. No edits to evaluation-import, activity-normalize, activity-timeline or targeted_report.

Task A hardens the actual signed release publisher/parser/downloaded-update pipeline, with a shared typed validation module and real cryptographic/CLI checks. Task B migrates persisted context preferences to a versioned envelope across the existing lock-protected store, provider capability resolver, shared typed decoder and a runnable batch CLI. Both use isolated clean pinned Git objects from the actual public YouCoded repository, never working-tree data: commit `c6a18be4ea7689137c667fa6f1d36f57a8cea8b5`, selected MIT source/test/script text totaling 2,892 files / 35,735,649 bytes, including 1,522 production source files. Task C is a search-backed executable capacity/cost/failover planner with archived, explicitly synthetic controlled research, version conflicts, private executable variants and independently checked citations. Exact goals, allowed files and shared failure taxonomy are frozen in `scripts/harness-lab/comparison-contracts.json`; implementation/operator details are in `scripts/harness-lab/MODES.md`.

Agent mounts contain source, task instructions, workload and frozen searchable documents only. Reference solutions, negative controls, hidden workloads and controller verifier stay outside mounts. A reset creates a new directory and verifies complete input identity; a contaminated or existing destination is refused. Historical attempts are preserved.

## Checklist

- [x] Tests first: matrices/counts/scope/limits, compatibility, resets/contamination, verifier controls, export/leakage and no-provider orchestration.
- [x] Select and freeze meaningful A/B slices; verify license and measure pinned repository source scale.
- [x] Implement genuine three-task contracts, reference solutions and independent functional/mutation verifiers.
- [x] Implement strict mode planner and immutable preparation/check/reset workflow.
- [x] Integrate per-mode request/time limits and correct adapter/build selection without changing old manifests.
- [x] Exercise offline plan → prepare → check → run dry construction → report plus Node/Python tests.
- [x] Read own diff; record final rerun evidence and remaining qualification boundaries.

## Qualification boundary

Offline reference and negative checks establish task/verifier plumbing, not live model/harness performance, live web parity or public claim readiness. Paid execution always needs the exact prepared-manifest receipt, provider-key file and shared cumulative budget scope. No automatic marketing-ready status.

Actual pinned images, dependency availability, installed Harbor integration and verifier-only mount lifecycle/hostile-code isolation remain unqualified. Local reference verification is for trusted references, not arbitrary hostile code on the host. Independent task/code review and complete metric-report integration belong to the parent session. The new report path is explicitly an execution inventory, not a substitute for the metric report under independent review.

## Delivered offline evidence

All implementation paths are under `scripts/harness-lab/`. New planner/workflow/task/reset/verifier/reference/loader/research/adapter modules and their tests are isolated from reviewed report/runtime files. Existing integration edits are limited to schema-2 validation/command construction/outer timeout in `run_objective_comparison.py` and schema-2 check dispatch/blocker admission in `targeted_workflow.py`. Historical schema-1 settings remain 20 native requests / 180 seconds.

Final retained fixture: `scratch/evaluation-modes-offline-v4/` (fresh; earlier bundles preserved). It contains a real source snapshot and exported fixtures, non-executable explicitly labeled arm/image test doubles, six compare commands, immutable prepared manifest and unapproved receipt, JSON/Markdown inventory, and three accepted reference solutions. Fixture limits are 60 gateway requests / 720 agent seconds / 90 verifier seconds; no provider was called. All 16 named mutations and three unchanged inputs are rejected in tests; two alternative implementation styles pass. Original pinned parser/store restoration is the regression-test mutation control, not source-pattern matching on submitted solutions.

Exact output logs are retained at `scratch/evaluation-modes-verification-v1/`:

```text
node --test scripts/harness-lab/evaluation-modes.test.mjs scripts/harness-lab/targeted-plan.test.mjs scripts/harness-lab/suite.test.mjs scripts/harness-lab/heldout-cases.test.mjs scripts/harness-lab/evaluation-freeze.test.mjs scripts/harness-lab/experiment-plan.test.mjs scripts/harness-lab/budget-ledger.test.mjs scripts/harness-lab/openrouter-gateway.test.mjs
ℹ tests 90
ℹ pass 90
ℹ fail 0

PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s scripts/harness-lab -p test_evaluation_workflow.py
Ran 10 tests in 73.926s
OK

PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s scripts/harness-lab -p test_run_objective_comparison.py
Ran 25 tests in 1.427s
OK

PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/harness-lab/evaluation_workflow.py fixture --out scratch/evaluation-modes-offline-v4
{"command": "fixture", "ok": true, "providerCalls": 0}
```

Additional legacy workflow check (honestly not fully green): `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s scripts/harness-lab -p test_targeted_workflow.py` ran 18 tests with one import error, `ModuleNotFoundError: No module named 'harbor'`, in `test_prepared_tokens_are_accepted_by_actual_router_adapter`. No dependency installation was attempted under this task's prohibition. The new workflow tests cover real command construction plus an injected no-provider acquisition/receipt/cleanup lifecycle, not actual installed Harbor execution.
