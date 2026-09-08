---
status: active
---

# Remove the specialist step cap — design

## Goal

Let a specialist run until it naturally finishes or is stopped by an existing safety or lifecycle control. Remove only the fixed, per-specialist tool-loop step cap.

## Scope

This change applies only to child sessions created for native specialists. It does not change the parent native session's ordinary `max_steps` gate.

The following controls remain unchanged:

- `SPECIALIST_SPAWN_BUDGET_PER_SESSION = 30`, the per-parent lifetime runaway-delegation backstop.
- Per-parent concurrent-specialist limits and the single-writer reservation.
- The no-recursion rule: specialist definitions cannot grant `Task`.
- Doom-loop detection and its routed permission ask.
- Tool permissions, external-directory refusal, routed asks, interrupt, destruction/quiesce cascade, and stale-status reporting.
- The existing report-size budget (`reportBudgetTokens`).

## Current behavior

`SpecialistDefinition.stepCap` is defined for every built-in specialist and can be configured by personal definition files. Claude Code agent-file `maxTurns` is mapped into the same field. `NativeSessionHost.buildSpecialistSession()` inserts this value into the child harness manifest as `limits.maxSteps`.

The shared `HarnessSession` loop reaches that limit, raises a synthetic `max_steps` ask, and stops the child if it is not allowed. A specialist completion then adds a partial-report suffix, `(stopped at its step limit)`, or throws if the cap was reached before text could be reported.

## Design

### Specialist definition contract

Remove `stepCap` from `SpecialistDefinition` and from all built-in definitions. Personal specialist files no longer parse or document `stepCap`; their values are ignored rather than becoming a runtime control. Claude Code agent-file `maxTurns` is likewise not mapped into a child-session cap.

`reportBudgetTokens` remains the independent, still-supported output-size control.

### Child-session construction

When `NativeSessionHost` creates or resumes a specialist child, it will preserve the selected preset manifest without supplying a `limits.maxSteps` override. The child session must therefore have no step-cap configuration at all.

The parent session's existing `max_steps` behavior remains exactly as implemented because this change is restricted to `buildSpecialistSession()`.

### Completion and routed asks

Remove specialist-only handling for `stopReason: 'max_steps'`: no partial-report suffix and no special no-report failure path. The ordinary completion path still accepts a report, or sends the existing one-time final-report nudge if the child was silent.

`childAskRouter` and the host's late-response path will retain `doom_loop` as a budget ask that cannot be remembered. `max_steps` is removed from the router's specialist-specific budget-ask set because specialist children no longer issue it. The root-session `max_steps` permission behavior is unaffected.

### Documentation and tests

Update the native-runtime specialist reference and the specialist rule to describe the removed cap accurately and name the remaining lifecycle/runaway controls.

Remove tests that assert enforcement, routed timeout behavior, parsing, presentation, and partial-report wording for a specialist step cap. Update definition fixtures to construct `SpecialistDefinition` without the deleted property. Add a regression test at the child-session construction seam that proves a specialist definition cannot configure `harness.limits.maxSteps`, while retaining an existing independent routed-ask test for external-directory writes.

## Error handling

No new user-facing errors or controls are introduced. A child still reports existing provider/tool failures, interruptions, teardown, no-report-after-nudge failure, and doom-loop handling through their current paths.

## Verification

Run focused specialist and harness tests covering child construction, child run completion, definition loading, child ask routing, task-tool roster fixtures, and the native harness loop. Then run `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded` before declaring the desktop change complete.

Because this is a native harness behavior change, offer the harness evaluator; do not run a paid evaluation without Destin's explicit decision.
