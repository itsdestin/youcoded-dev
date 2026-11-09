---
status: active
work_item: 148
---
# Integrated targeted A/A calibration

## Scope

The user said “continue” after the remaining tiny paid calibration was identified. The assistant scoped it explicitly to two same-build trials of development task `finish-the-file`, first-party Haiku route, serial execution, USD0.25 experiment allowance inside the unchanged cumulative USD15 ceiling. Both arms are snapshots of the same isolated desktop build and current lab helpers. This validates plumbing, not improvement or broad model quality.

Inputs: `scratch/harness-lab/targeted-live-aa-input-v1.json` and `targeted-live-aa-settings-v1.json`. Offline plan: `targeted-live-aa-plan-v1/plan.json`.

## Initial infrastructure failure preserved

`targeted-live-aa-v1` halted on the first baseline attempt before a provider request. The actual RouterYouCoded constructor invokes `gate_credentials`, which requires an opaque token beginning `yc-gate-`; the new preparer emitted a random opaque token without that required prefix. The previously mocked execution boundary did not cover actual adapter construction.

A regression test now constructs the real RouterYouCoded adapter for both prepared arms and checks gate credentials. It failed before the fix and passed after token generation gained the required prefix. Full Python suite after the fix:131tests passed. No adapter safety check was weakened.

The failed cohort/journal, immutable snapshots, authorization receipt and report remain at `targeted-live-aa-v1` and `targeted-live-aa-v1-report`. Its scoped gateway ledger rows were checked: **zero provider requests**. Cleanup journal records no cleanup errors. This is retained infrastructure evidence, not a model failure or a successful trial.

## Corrected attempt

`targeted-live-aa-v2` is a new immutable preparation of the same two planned A/A cells, with corrected token generation and a separately hash-bound authorization receipt. ScopeID `targeted-8bc9533822de3db485bf93bd`, experiment capUSD0.25, shared capUSD15. No prior charge or estimate was reset; the earlier scope had no requests. The corrected attempt completed and the integrated report reconciled both original verifier outcomes: **2/2passed**,3gateway requests per arm, all6settled with complete input/output/cache usage. Provider-reported cost totals **USD0.00359775**. There are0unknown scope requests,0global reservations and no ledger lock. The cleanup journal reports no errors.

Client-command elapsed was5.3487seconds baseline and5.14514seconds candidate; whole-wrapper elapsed was1minute44seconds including preparation checks, Docker/Harbor setup and cleanup. This is a calibration, not an improvement comparison. Both arms used40636input tokens, but cache history differed: baseline26967cache-read and13661cache-write tokens; candidate40628cache-read and0cache-write tokens. That explains why raw cost differed despite identical build inputs and reinforces the requirement to report cache conditions, rotate order and avoid claiming an optimization from a single pair.

The generated paired report is `scratch/harness-lab/targeted-live-aa-v2-report/report.md`, with machine-readable coverage in `summary.json`. Current shared exposure including older retained estimates isUSD5.1960300168 ofUSD15; this is not a precise invoice total. This receipt qualifies the serial integrated one-task A/A path only, not all models, parallel execution or production continuation behavior.

No production code, running-app configuration, old results or provider credentials were changed.
