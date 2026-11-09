# Targeted execution integration

Status: active

## Contract

The user asked to finish the small before/after workflow after the offline planner was delivered. Implement preparation, an explicitly authorized execution handoff, and concise paired reporting. No new paid run, production optimization, shipping or changes to historical snapshots are authorized by this implementation task.

The small planner remains the scope authority: exactly two YouCoded arms, one model/provider, one to three development tasks, smoke1repeat or confirmation3repeats. Do not turn this into another benchmark matrix. A/A inputs remain labeled calibration.

## Architecture

1. Extend the existing serial runner with an optional explicit `config.desktopVariants` map and per-row `buildVariant`, retaining unchanged single-build behavior when omitted. Validate and hash every actually selected build. Pass only the selected build to that row's adapter. Parallel children retain this map and select the same row variant; no new agent loop.
2. Add an optional experiment scope `{id, limitUsd}` to existing gateway grants/reservations. The same serialized shared ledger transaction checks both cumulative and experiment-scope exposure, including reserved and unknown requests. Scope limits cannot silently change on reopening/resume, and an existing trial identity cannot move scopes. Do not create an independent ledger or reset historical estimates. Existing no-scope grants and schema1 records remain supported. Estimated accounting retains its documented uncertainty; the experiment ceiling is admission protection, not a promise against delayed/underestimated bills.
3. Offline preparation rechecks the chosen plan's build/task hashes, copies baseline/candidate runtime inputs and selected fixtures into a fresh private experiment directory, snapshots current lab runner source, creates fresh per-trial opaque tokens and a gateway config using an existing shared-ledger template. It never reads provider credentials, starts Docker or contacts a provider. Record original plan hash, exact differences from exporter environment (pinned prepared image/common180sec timeout), all snapshot hashes and pairing metadata.
4. Preparation defaults to unauthorized. Execution requires an explicit authorization receipt bound to the prepared plan/cohort and its experiment/shared limits, plus explicit execute action. One entry point starts the dedicated gateway, invokes the existing serial or bounded-parallel runner and performs scoped shutdown. No actual provider key goes into environment, command argument values, task containers or generated manifests: only its file path goes to the gateway. Refuse conflicting existing services/networks rather than killing them. Interrupted/failed attempts remain inspection-required, not retry-to-pass.
5. Reporting reads preserved outcomes and allowlisted matching ledger rows only. Pair by task/repetition/arm, verify identity and artifact hashes, distinguish unstarted/interrupted/infrastructure/verification outcomes, show complete versus observed token/cost totals, and keep timing scope/cohort explicit. Never score missing outcomes as zero or infer success from process exit. Reports remain useful on partial runs and A/A calibration. No overall universal score.

## Sequence and verification

- [x] TDD execution primitives: variant selection/hash coverage and scoped budget accounting. Test concurrent admission, restart/unknown holds, immutable scope limits, identity rebinding refusal and legacy behavior.
- [x] TDD preparation/execution integration using fake temp builds and existing offline runner/gateway stubs. Include rejected drift, links, missing authorization, bounded cell counts, no-overwrite, opaque-token-only task configuration and scoped cleanup.
- [x] TDD reporting on synthetic evidence: pass/fail/missing/infrastructure cases, mismatched identities, partial telemetry, unequal build metadata, serial/parallel timing labels and paired deltas without missing-as-zero errors.
- [x] Exercise one complete offline A/A fixture through prepare → authorized synthetic child execution → report. All transport/Docker actions are stubs or loopback only. Keep synthetic outcomes visibly synthetic and separate from measured baseline results.
- [x] Independent safety/measurement review, full relevant tests, and updated TARGETED.md/README usage. No paid calibration until the user authorizes that distinct step.

## Success boundary

Implementation and focused safety review are complete. Parent verification passed247combined workspace/native Node tests and, after the actual-adapter token-prefix regression fix,131Python tests. A separately authorized serial A/A calibration completed2/2verified passes with6settled requests and USD0.00359775provider-reported cost. The initial zero-call token-prefix infrastructure failure is preserved. See `docs/active/investigations/148-targeted-live-aa-calibration.md` and `scripts/harness-lab/TARGETED.md`.

This qualifies the small serial one-task path, not every model, parallel container condition or production behavior. No production optimization has been made. The full benchmark is deferred; future paid work remains a separate scope/budget decision. Current workstream status and remaining priorities are in `docs/active/plans/148-current-state.md`.
