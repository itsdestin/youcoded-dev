---
status: active
work_item: 148
---
# Estimate-based spending guard implementation plan

Approved design: use provider charges when available and request-sized estimates otherwise, retaining the USD15 ceiling and audit history. This is an estimate-based guard, not a mathematical upper bound. This implementation step itself authorized no full paid evaluation or source commit. Subsequent separately authorized runs and experiment-scope guards are recorded in `148-current-state.md`; the migration figures below are historical, not current headroom.

## Implementation

- Add explicit `estimated` accounting mode, leaving legacy behavior unchanged. Estimate the normalized text/tools request using UTF-8 bytes / 3, message overhead, the effective output ceiling, configured route prices, and a 25% buffer. Record estimation basis; unknown costs remain estimates, not reported zeroes.
- In estimated mode, a bill above an estimate records actual cost rather than permanently closing the ledger unless overall exposure reaches the ceiling. Preserve request-count caps, exclusive ownership, durable writes, cancellation and route restrictions.
- Refresh the dedicated OpenRouter key's cumulative billed usage at startup and at most every 30 seconds before admission. Use a fixed metadata endpoint and private key in memory only. If a required refresh fails, admit no generation. Apply `max(local charges/estimates, external prior + provider usage) + in-flight estimates` for admission. Persist billing snapshots and distinguish confirmed charges, unresolved estimates and reservations.
- Offline tests: estimate grows with prompt/tool payload and output limit; unknown responses retain only the request estimate; actual-cost underestimate does not freeze a solvent ledger; provider billing above local accounting blocks further calls; unavailable billing fails closed; concurrent admissions and restarts retain accounting; legacy tests remain green.

## Auditable migration

Keep the existing ledger and every hold unchanged. Create a separate estimated-mode ledger and configuration, explicitly referencing the old ledger and user authorization. Re-estimate the non-OpenRouter prior from its preserved measured-usage rate-card records with a 25% buffer. For its two unknown HTTP400 requests, use the matching successful task's initial input/cache usage and each failed request's output ceiling, plus 25%; label these estimates, not zero-cost bills. Retain the earlier pilot's USD0.21916345 allowance because it predates that ledger. Use a fresh dedicated-key billing snapshot as the OpenRouter baseline, without falsely assigning actual costs to individual unresolved old requests. This deliberately replaces those old maximum-context holds for admission only. A delayed provider bill is detected by subsequent metadata refresh; the accepted risk is a small overrun due to estimates/billing delay.

## Historical allowance provenance check

Review questioned whether the USD0.21916345 allowance overlaps the 201 measured comparison requests. Checked the original `scratch/harness-lab/haiku-pilot-summary.json` and each referenced Harbor result: the initial pilot's latest finish was `2026-10-18T01:36:02.648420Z`; the comparison ledger's earliest request was `2026-10-18T02:09:30.466203+00:00`. The pilot rows' upper amounts sum to USD0.21916345 (floating-point representation USD0.21916345000000004), matching the comparison ledger's `initialUpperUsd`. These are separate, sequential runs. `anthropic_gate.py` initializes the request list empty and adds this allowance separately. The allowance is deliberately retained as an allowance, not relabelled an actual bill. The prepared estimated baseline remains USD0.3775013005.

## Verification and handoff

Implemented and configured. Parent verification passed 139 workspace/native Node tests and 36 Python tests in the Harbor environment; fresh independent financial-code review reported no actionable findings. Activation reopened the new ledger through `createGateway`, refreshed provider billing via GET, confirmed estimated mode/USD15/exposure USD0.3775013005/zero generation requests, and closed it with no lock remaining. Original ledger hashes were checked unchanged. The gateway is not left running.

Run workspace and native lab Node tests and Python tests in the Harbor environment. Independently review changed financial code and migration. Verify the effective USD15 ceiling, baseline, mode, no leaked credentials, no outstanding reservations, and gateway shutdown. Do not start paid generation in this implementation step.
