---
date: 2026-09-01
status: shipped
type: investigation
topic: helper Activity-trail notes are appended to the tail of the segment list instead of placed by timestamp among tool calls
---

# A mid-run note shows after tool calls that actually happened later

## Symptom
On a background helper's Task card, a note sent mid-run (from the user's send-a-note box or the
assistant's own steer) appears at the bottom of the Activity trail — after tool calls and
thinking that happened after the note was sent. Low severity: notes are rare and self-explanatory,
but the trail lies as an audit log.

## Mechanism
- Notes arrive on the run record (the ledger always resends the FULL notes array). The reducer
  reconciles them by index-id and APPENDS any unseen note to the end of `subagentSegments`; it was
  a deliberate 1c trade-off (append-only can never delete a row a stale resend lacks).
  `youcoded/desktop/src/renderer/state/chat-reducer.ts`, `reconcileNoteSegments`:
  <!-- claim: {"path": "youcoded/desktop/src/renderer/state/chat-reducer.ts", "contains": "segs = \\[\\.\\.\\.\\(segs \\?\\? \\[\\]\\), \\{ type: 'note'"} -->
- `SubagentTimeline.tsx` groups segments in array order and never re-sorts, even though each
  note segment already carries `timestamp: note.at` and tool segments carry their own times.

## Fix notes
Either insert the note segment at its timestamp position inside `reconcileNoteSegments` (binary
search on `timestamp`; ids stay index-based so idempotence holds), or have `SubagentTimeline`
sort by timestamp when building groups. The first keeps the reducer the single source of order.

## History
- 2026-08-16 — plan 1c Task 11 review; a deliberate trade-off, not an oversight.
- 2026-09-01 — re-verified: still tail-appended, timeline still unsorted.
- 2026-09-04 — fixed on youcoded `fix/specialists-ledger-bugs` (`f0ac766d`, then `7d3cc64d` after review: two-sided ordering, third dispatch site). Merged 2026-09-05; roadmap item closed.
