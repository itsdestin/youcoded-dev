---
date: 2026-09-17
status: active
type: review
topic: specialists plans pause handoff — review of revision 4 (handoff on request only)
reviewed: docs/active/design/2026-09-16-specialists-plans-pause-handoff.md §6
---

# Pause handoff design — review 4 (revision 4)

Verdict: blocking (finding 1). All eleven findings accepted and written into §6.

1. **Blocking — interrupted plans can't hold a handoff.** Accepted: Ask is offered on paused cards only.
2. **High — Continue can miss an Ask landing during its drift check.** Accepted: resume/addBudget/stop read the id inside their own write.
3. **High — "no pending handoff" checked outside the write.** Accepted: in-write check; card ignores clicks while in flight.
4. **Medium — Ask right after restart cleared by recovery.** Accepted: register first; recovery re-checks inside its mutation.
5. **Medium — Ask during a running turn waits then vanishes.** Accepted: "after its current reply" wording; a clear shows an error line with Retry.
6. **Medium — how the visible line is made.** Accepted: render kind hide/ask-line across chat, buddy, previews; no new event, no history note.
7. **Medium — eighth channel touch list.** Accepted: listed in §6.
8. **Low — notice wording.** Accepted.
9. **Low — ask again after answered; tool-less model.** Accepted: replaces; button hidden without tools.
10. **Low — silent notice-turn failure.** Accepted: error line with Retry.
11. **Low — remove the pause-time hook.** Accepted.
