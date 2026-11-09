# No-nudge continuation regression

This checks whether the parent follows through after a background specialist finishes, without requiring a person to notice the stall or diagnose notification delivery.

## Automatic outcome

The fixture declares an already-authorized next step: consume the helper result and write the required file. The report scores **success**, **failure**, or **unknown**, independently of whether the agent process ended cleanly.

- A specialist completes and the parent writes the correct follow-up file: success.
- The report is delivered but the parent merely acknowledges it and stops: failure.
- The report never reaches the parent within the declared observation window: failure, classified as delivery-stall when receipt coverage is complete.
- A required real user nudge precedes recovery: not autonomous success.
- Genuine user/permission blockers are excluded or remain unknown when evidence conflicts.

A fixture deadline is not a universal responsiveness threshold. The offline scripted profiles use1000ms after observed child completion; live models require separately appropriate windows. Partial observations are unknown/censored, never silently scored as a pass.

## Existing evaluator integration

`report.mjs` automatically adds a **No-nudge continuation (fixture-verified)** section when runs contain `continuation.episode`. It reports assessed/eligible/unknown counts and latency fields. Records without receipts explicitly lack this coverage; old single-turn benchmark success does not imply healthy continuation.

The native lab profiles exercise the isolated production runtime with a scripted provider and fetch disabled:

- `background-followthrough`: real background helper, genuine host report delivery, verified parent Write of `continued.txt`.
- `waiting-after-report`: intentionally broken parent behavior; receives the report but stops without writing.
- `lost-report`: lab-only interception suppresses actual host delivery, not just its observer receipt.

Run the regression tests from the workspace root:

```bash
node --test scripts/harness-lab/continuation-metrics.test.mjs scripts/harness-lab/report.test.mjs youcoded/desktop/test-engine/lab-continuation.test.mjs youcoded/desktop/test-engine/lab-runner.test.mjs
```

These tests automatically assert both positive and negative outcomes. A generic acknowledgment, a model request, or a UI completed card is not sufficient for success. No provider credential or paid model request is involved. A native runtime build must already be available in the isolated checkout.

## Evidence and diagnostic limits

The collector records correlated parent/child/report IDs with one worker-local monotonic clock:

1. Observed specialist terminal event.
2. Model-facing injected report event.
3. Parent SDK request start.
4. Successful fixture-matching Write verified against file bytes.

It does not misuse the durable `delivered` flag, which is set after the parent's response, as an injection timestamp. Automatic reports are not human inputs or approval.

Primary success/failure requires complete completion, injection observation, root-input and progress coverage plus fixture state. It does **not** require continuous scheduler-state telemetry. The current collector truthfully sets `parentState:false` and `states:[]`; exact actionable-idle duration and idle-based wake-up/behavior subclassification therefore remain unknown. Directly observed endpoint latency can still be reported. Queue timing is currently unobserved.

The metric detects a symptom before its cause is known. These regression cases do not prove the cause of Destin's live incident or repair production notification delivery. Stop-held, quiesced, restart/crash and final-drain race conditions need their own explicit scenarios before coverage is claimed.

## Verification status

Parent independently ran the combined focused suite:45tests passed. Both injected failures were scored automatically (`waiting-after-report: fail/unknown stage`, `lost-report: fail/delivery-stall`), while the genuine happy path passed. Independent focused runtime/source measurement review found no important blockers and confirmed that the negative controls affect actual host delivery/behavior, not merely observer records. Original paid evidence and the running app were not modified.
