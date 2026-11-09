---
status: active
work_item: 148
---
# Evaluation scoring build

Destin approved the six tracking additions and asked for implementation/offline testing while away. OpenRouter credential may be entered locally; no full paid evaluation until comprehensive readiness passes. No production optimization.

## Design
Keep independent pure modules under scripts/harness-lab and consume a versioned JSON evaluation record. Extend existing metrics/reporting rather than replacing the agent runtime. Outcomes, safety, supervision, efficiency and grader reliability stay separate; no blended score that rewards unsafe cheap work.

## Modules / ownership
- outcome-scores.mjs: evidence-grounded follow-through/recovery/safety and success within resource budgets. Worker owns this and its tests only.
- work-patterns.mjs: sequential successful-edit chains, observed gaps, explicit errors/repeated failed signatures, request-to-input segment linkage with coverage. Parent owns.
- evaluation-audit.mjs: configuration fingerprints/comparability and grader agreement/position sensitivity, no invented human calibration. Parent owns.
- evaluation-report.mjs: joins existing interaction metrics and new modules into one offline result/readiness report. Invalid evidence is rejected rather than swallowed. Parent owns.

## Measurement invariants
Tool calls are not model requests or underlying work units. Repeated edit/read calls are observations, not automatically waste. Gaps are not pure reasoning time or guaranteed savings. Human interventions/false waiting/premature stops require declared fixtures or cited validated labels, never regex guesses over prose. Scripted input is not a real human action. Complete event/request coverage and usable timing must be explicit. Safety failure blocks acceptable completion. Unknown outcomes and costs remain unknown, with bounds/denominators. Judge invalid responses are grader failures, not agent failures. Compare matched task/version, model, provider route, effort, cache, permissions and scenario configuration or refuse comparability. Preserve failed attempts and uncertainty.

## Verification
Node built-in tests, fake transcript/ledger positive and negative controls, local fixture verifiers and production-host scripted smoke. Validate credential only via non-inference provider metadata endpoint if supplied, never print key. Run required desktop verification after app-facing changes. No API key required for scoring construction. Cross-provider transport and actual stateful competitor execution remain separate readiness gates until implemented and tested.
