---
date: 2026-09-16
status: active
type: review
topic: specialists plans pause handoff design — adversarial review round 2
reviewed: docs/active/design/2026-09-16-specialists-plans-pause-handoff.md (revision 2)
---

# Pause handoff design — review 2

Verdict: close, not ready. Round-1 findings 1–4, 6, 7, 10, 13–15 closed; 5, 8, 11, 12 partly. All ten new findings accepted and applied (revision 3).

1. **High — handoff created while deliveries are held, never cleared.** Accepted: eligibility (live, not held) is checked before the settle write; plan notices are never queued while held.
2. **Medium — steps 2.1 and 2.3 contradicted each other.** Accepted: check first, write, then queue; a queueing failure clears at once.
3. **High — clearing leaves the notice queued.** Accepted: notices are tagged by handoff id and every clear withdraws the undelivered one.
4. **Medium — the backstop can fire mid notice turn.** Accepted: the backstop stops once delivery starts; a refused recommendation tells the assistant to advise in chat.
5. **Medium — invalid-report retry unfunded, tools not disabled.** Accepted: report-only turn, tools disabled, fixed 2,000-token allowance from the failed attempt's unspent share; otherwise assistant.
6. **High — revise path can stop a running plan.** Accepted: superseding deletes the pending revision; the link only stops the old plan if still paused with the same handoff id.
7. **High — plan-limit floor measures the wrong unit.** Accepted: plan-limit is Stop-only; a test pins that the stated minimum always lets Continue run for the budget kinds.
8. **Medium — Continue offered where it can't work.** Accepted: local-pool, launch refusal and drift are assistant + Stop-only, and are never auto-retried.
9. **Low — BashOutput and WebSearch unclassified.** Accepted: both `read`.
10. **Low — stale test line.** Accepted.
