---
date: 2026-09-16
status: active
type: review
topic: specialists plans pause handoff design — adversarial review round 1
reviewed: docs/active/design/2026-09-16-specialists-plans-pause-handoff.md
---

# Pause handoff design — review 1

Verdict: not ready to build. All fifteen findings accepted; the design was rewritten (revision 2).

1. **Critical — the local-pool wait can never succeed** (the pool check is this plan's own wave against a fixed capacity). Accepted: `local-pool` goes straight to the assistant; no wait.
2. **Critical — there is no read-only classification in the tool registry**, and the executor keeps its own name list. Accepted: every native tool declares `effect: 'read' | 'local' | 'external'` (a test fails when one is missing); MCP tools are external; WebFetch and AskUserQuestion are external; `PLAN_READ_ONLY_TOOLS` is deleted.
3. **High — Bash as local contradicts decision 13** (a cut-off `git push`/mail/`curl -X POST` is "sending a message"). Accepted: a cut-off Bash call goes to the assistant.
4. **High — any auto-retry halts and bills the whole wave.** Accepted: automatic recovery retries the one member inside the wave without halting; only assistant/user routes halt.
5. **High — the invalid-report retry can't resume the same specialist.** Accepted: the retry attempt carries the previous specialist's id and a dedicated "report in the required form" message; a test proves no tools re-run.
6. **High — no key for recovery without an attempt id; launch refusals always repeat.** Accepted: count per step, iteration and cause; never auto-retry a launch refusal.
7. **High — the handoff can close on the wrong turn.** Accepted: each handoff has a notice id; it is answered only when the turn that delivered that notice ends (success, error or Stop).
8. **High — the card can stay greyed out** (held deliveries, failed notice turn, closed conversation). Accepted: clear pending handoffs on hold, on a failed delivery and on destroy; `queueHostNotice` reports whether it queued; a 10-minute backstop.
9. **High — a revised plan could auto-approve.** Accepted: a proposal tied to a handoff never auto-approves.
10. **High — the revision link can't work** (notice turns have no turn id; one pending-revision slot). Accepted: notice turns get turn ids, pending revisions are keyed by plan, and the old plan is stopped in the same write that links the new one.
11. **Medium — stale recommendation lands on a new pause; service allows resume while pending.** Accepted: handoff id in the notice and the tool, validated; a user resume/add-budget/stop while pending supersedes the handoff.
12. **Medium — recommendation rules ambiguous.** Accepted: a per-kind table of allowed actions and floors.
13. **Medium — pause reasons reach the model unmarked.** Accepted: pinned notice template; provider/tool text wrapped as untrusted and length-capped; never report text.
14. **Medium — auto-restart can re-run an unanswered external call.** Accepted: the same routing check runs before every automatic restart.
15. **Low** — Stop withdraws the queued notice (accepted); downgrade quarantine noted (accepted); phone viewers see the reply (accepted as is).
