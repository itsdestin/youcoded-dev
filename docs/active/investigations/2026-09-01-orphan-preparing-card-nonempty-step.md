---
date: 2026-09-01
status: active
type: investigation
topic: A "Preparing…" tool card orphaned on a NON-empty step is never withdrawn until the turn ends
---

# Orphaned "Preparing…" card on a non-empty step

**Symptom.** In a native session, a step where the model completed one tool call and also announced a
second call that was then dropped as malformed leaves a "Preparing…" card spinning beside the real
tool's card for the rest of the turn. Low severity; surfaced by PR #324's second review (2026-08-21).

## Mechanism (re-checked against master 2026-09-01, `f2d229e4`)

`consumeStep()` in `youcoded/desktop/src/main/harness/harness-session.ts` returns
`StepResult.pendingPreparing` — the announced-but-never-completed call ids (line ~2698, filtered
against the completed `toolCalls`). Three paths withdraw those cards with a `toolPreparing {cleared:
true}` event: the empty-step auto-retry, the manual-Retry path, and the stall-retry path. **The
tool-execution path — a step that produced real tool calls — reads `pendingPreparing` nowhere**, and
`endTurn`'s reaping only fires at turn end, so the orphan spins through every subsequent tool call in
the turn.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/harness-session.ts", "contains": "for \\(const prep of step\\.pendingPreparing\\)"} -->

The anchor above is the empty-step withdrawal loop — the only consumer of `step.pendingPreparing`
(`rg -n 'step\.pendingPreparing' harness-session.ts` → one hit, inside the `isEmptyStep &&
orderlyFinish` branch). If a second consumer appears on the tool-execution path, this diagnosis
needs re-checking.

## Fix shape

Emit the same `toolPreparing {cleared: true}` withdrawal for `step.pendingPreparing` on the
tool-execution path, right where the step's tool calls are dispatched — the ids are already carried
out of the stream by PR #324.

History: filed 2026-08-21 (pre-existing, found in PR #324's second review). Re-verified 2026-09-01.
