---
status: active
work_item: 148
---
# Detect stalled continuation without user diagnosis

## User requirement

The evaluator must detect that something is wrong when approved work stops after specialists finish, without requiring Destin to diagnose notification delivery. A passing helper example or total elapsed-time number is insufficient. The detector flags the behavioral symptom first; lifecycle timing localizes the likely stage without inventing a root cause.

## Metric contract

Primary: **no-nudge continuation** — when a declared task still requires a follow-up and its dependencies are complete, does the parent make fixture-verified useful progress within the scenario's declared deadline without another real user message?

Report separately:
- child completion → model-facing report delivery;
- report delivery → parent request start;
- ready work → useful progress;
- actionable idle duration, excluding model/tool execution and declared blockers;
- follow-up verification and need for a real corrective nudge;
- failure stage when evidence supports it: delivery, wake-up, behavior, or unknown.

The fixture defines remaining work, relevant dependencies, genuine permission/user blockers, useful progress and observation deadline. Notifications are not user nudges. A model request starting or a generic acknowledgment is not useful progress. Missing evidence stays unknown; an observation window too short is censored, not a pass. Complete parent-state intervals and correlation identifiers prevent blaming another session or counting legitimate waiting.

## Delivery sequence

1. Pure content-free metric and synthetic negative controls for lost reports, delivered-but-idle parent, acknowledgment-then-stop, resumed-only-after-nudge, blocked/active work and partial evidence.
2. Add runtime collector/hooks to the isolated lab, not the running app. Distinguish UI notification projection from model-facing report injection. Preserve monotonic timestamps and explicit evidence coverage; do not synthesize unavailable state.
3. Run deterministic real-runtime cases with a scripted provider and no network. Include known-broken injected variants that the evaluator must flag automatically. Passing-only lifecycle tests are insufficient.
4. Integrate the metric into evaluator reports/quick regression selection, with completeness/unknown denominators. A separate real-model behavior probe can be proposed later under paid-evaluation authorization; it is not needed to prove deterministic notification plumbing.

## Implemented and verified

All four delivery-sequence steps above are implemented for the bounded offline fixtures. `continuation-metrics.mjs` has23pure metric tests; `lab-continuation.mjs` collects genuine isolated-runtime receipts; `report.mjs` automatically scores them. Parent focused verification passed45tests. Genuine helper→parentWrite succeeds; deliberately suppressed delivery fails with delivery-stall; report acknowledgment without requiredWrite fails with unknown diagnostic stage. Each has one initial root input. Independent runtime review found no important blockers.

Primary completion/delivery/input/progress coverage is sufficient for end-to-end scoring. The collector truthfully reports `parentState:false`, `states:[]`; exact actionable-idle duration and idle-based classification remain unknown. Queue notification is not required to precede injection. Observed blockers conflicting with fixture state remain eligible-but-unknown. See `scripts/harness-lab/CONTINUATION.md`.

## Earlier coverage and remaining limits

`lab-state.mjs::canSettle` already refuses to settle with undelivered background reports. `lab-runner.test.mjs` checks one background helper report followed by parent Write and a single scripted root input. Historical `behavior-live-v1` passed a similar live case. Neither provides a general stall-rate metric or complete same-checkpoint idle-state evidence. `interactions.mjs` counts notices and explicitly labeled nudges but not delivery/wake latency; `behavior-oracles.mjs` has evidence-based waiting/premature-stop checks that must not be replaced by prose regexes.

The actual user-observed incident remains unproven/unfixed. The isolated branch may differ from the running app; source investigation alone cannot establish live build identity. No live-app probing, production behavior changes or paid calls are part of this metric implementation.
