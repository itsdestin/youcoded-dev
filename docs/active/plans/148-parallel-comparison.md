# Future-batch bounded parallel execution

Status: active

## Approved scope

The user approved bounded parallel execution for future runs after discussion of contention and budget risks. The then-running objective-comparison-v3 was kept serial and immutable. It is now stopped; a separately labeled two-worker held-out cohort later recorded four attempts before stopping safely. See `148-current-state.md` for the present outcome/coverage ledger. This work grants no additional spending or shipping permission.

## Design

Use a separate parallel coordinator, not threads inside the existing signal-owning serial runner. Each admitted trial runs in its own subprocess through the reviewed serial runner, with a fresh immutable single-trial manifest and private per-trial journal. The coordinator owns one exclusive batch lock and a durable admission journal; completion can occur out of order. Stable trial identities preserve linkage to the original matrix and gateway ledger.

An explicitly declared worker count is fixed for a cohort. Default recommendation is2; supported range1–8, subject to CPU, available-memory and free-disk admission checks. Do not silently increase concurrency or infer uncontended timing. Parallel manifests must declare a contention-affected timing cohort; serial latency remains a distinct cohort.

The existing single-owner gateway remains the only provider gateway and cumulative spending authority. Never create independent budget ledgers per worker or reset prior spending. Before dispatching another trial, recheck budget and storage. Already-admitted requests remain covered by gateway reservation accounting; estimation and delayed billing retain their documented residual risk. No additional paid qualification is included in this implementation task.

On infrastructure failure, interruption, or budget/storage refusal: stop new admissions, interrupt active child runners so their existing process-group and exact-container cleanup executes, collect/preserve outcomes, and fail closed if cleanup cannot be confirmed. Never simply kill a coordinator and orphan workers. No automatic retry of interrupted/infrastructure-failed attempts. Completed successes and quality failures are reusable on resume; out-of-order completion must not imply a completed contiguous prefix. A changed manifest or ambiguous/incomplete event history requires inspection.

## Implementation sequence

- [x] Add `scripts/harness-lab/test_run_parallel_comparison.py` with offline failing tests for worker bound/overlap, per-trial manifests, out-of-order completion/resume, fingerprint changes, locks, budget/storage stopping, infrastructure cancellation, interruption cleanup and secret-free child environments.
- [x] Add `scripts/harness-lab/run_parallel_comparison.py`, reusing the existing runner's validation, identity, budget, storage and child-environment helpers. Keep signal handling in the coordinator main thread and independent child processes; do not change active frozen files.
- [x] Validate resources from the manifest's prepared task resource declarations and current machine capacity, not an arbitrary claim that eight workers fit. Refuse insufficient resources before execution.
- [x] Exercise overlap and SIGTERM using real local subprocesses without provider calls. Verify no remaining owned children and no replay of completed or interrupted attempts.
- [x] Run the full Python suite, then independent fresh review of cleanup, budget and resumability. Fix important findings before declaring the launcher usable.
- [x] Document explicit future-manifest configuration and timing limitations in EXECUTION.md. No edits to the running manifest, tokens, gateway configuration, source snapshot or jobs.

## Acceptance

Tests must prove that multiple local child processes overlap while never exceeding the declared worker count; durable outcomes survive out-of-order completion; stop conditions admit no new trials; interruption reaches every owned child; and all existing serial tests remain green. No paid run is required or authorized by this feature verification. Keep implementation uncommitted until separately requested.
