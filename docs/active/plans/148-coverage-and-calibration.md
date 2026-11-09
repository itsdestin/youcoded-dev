---
status: active
work_item: 148
---
# Coverage and calibration implementation plan

## Approved scope

Continue the existing lab beyond basic five-client continuity. No production optimization, integration/commit, or full paid evaluation. Retain USD15 accounting and distinguish implemented, offline-tested, live-executed and human-calibrated coverage.

## Work units

1. Independently author six evaluation-only candidate workloads in `scripts/harness-lab/heldout-cases.mjs`, using the existing `{id, category, domain, requiredCapabilities, instruction, files, oracle, check}` format. Cover meaningfully different administrative, planning, data/privacy and technical tasks rather than renamed pilot variants. Keep expected outputs/verifiers out of agent fixtures. Test reference solutions, unchanged inputs, targeted wrong solutions, source preservation and malformed outputs. Export through the existing suite function with a separate held-out flag; never include these in optimization development runs by default. They become frozen held-out tasks only when their hashes are recorded before comparative use.
2. Add portable *between-turn* external-change scenarios with controller-owned evidence, using existing conversation execution and file safeguards. Label them accurately: an external change between user turns is NOT a synchronized Read→Edit race. Identify unsupported interfaces rather than inventing equivalent capabilities. Keep true cross-client race, helper continuation and clarification gates open where not implemented.
3. Add deterministic long-history retention scenario generation with initial binding constraints, an explicit later amendment and nonconflicting filler. The final prompt must not repeat the answers. Record generation settings and estimated size; require measured occupancy/actual compaction evidence for stronger claims. Do not equate manual compaction or a long source file with real-model context-threshold compaction.
4. Agent-facing grading policy (clarified by the user): prioritize structured results, deterministic task/safety checks, and measured efficiency. A blind final-answer sample was prepared, but the user delegated rubric choice rather than supplying a preference; do not record it as a rating. Personal style calibration is not a required gate for objective agent-facing reports. Subjective model grades remain provisional, separate from objective outcomes; human comprehension or human-calibrated quality claims remain unavailable without real evidence.
5. Run offline tests, reference/negative verifier controls, review and update readiness. Freeze separate same-model harness and fixed-harness model-comparison tracks; retain all unexecuted/unsupported cells and remaining gates.

## External-change review disposition

The reported missing native failure checkpoint did not reproduce: the current driver calls `onStep` before returning a failed external-change step. A pinning test covers both thrown errors and unconfirmed receipts. Partial in-place writes were a real risk; both Linux implementations now attempt rollback through the original pinned descriptor only if current bytes still match the controller's tracked partial state. A failed or refused restoration is explicitly recorded and propagated into the scenario checkpoint; the scenario stops. This is **best-effort recovery, not atomic writing or crash recovery**. Process termination can still leave an invalid disposable fixture, and that run cannot be scored as successful. Competitor controller execution uses Python `-I -S` to exclude task-local modules and site hooks.

## Evaluation-candidate audit and freeze

The first audit correctly identified fabricated correspondence replies passing a phrase blacklist. Follow-up counterexamples also exposed a contradictory operational rationale passing keyword checks, a scheduling reference with 45 minutes of delay despite a feasible 30-minute optimum, an undisclosed reimbursement reason-code vocabulary, ambiguous stock `remaining` semantics, and an extra-schema negative control that actually wrote invalid JSON. These were corrected before any model evaluation: explicit reply templates and classification policy, structured factual rationales/summaries, independent scheduling optimization with declared tie-breaks and timezone-equivalent acceptance, disclosed codes/side-effect rules, a defined stock field, and parseable negative controls. A fresh independent minute-grid audit found the corrected 30-minute optimum and no remaining findings in the requested contracts.

The initial corrected set was frozen at `scratch/harness-lab/coverage-v2-heldout-frozen/`. A later prelaunch audit tightened exact-byte preservation in6verifiers, producing the active `coverage-v3-heldout-frozen/`; old exports remain unchanged and provenance is recorded. `evaluation-freeze.mjs --verify` checks current definitions/export hashes, not execution authority. The v3set subsequently produced90completed held-out harness trials plus11attempted model cells. See `148-current-state.md` and `148-heldout-harness-baseline.md`; the original build-phase authorization above is historical.

## Success criteria

A reusable, separately exportable candidate evaluation set; tested controller-owned state-change evidence where supported; a reproducible retention probe generator; an actual blind sample for human input; and a precise readiness record that still blocks unsupported comprehensive claims. No paid generation is needed for this build phase.
