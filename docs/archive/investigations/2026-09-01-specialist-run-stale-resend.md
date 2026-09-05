---
date: 2026-09-01
status: shipped
type: investigation
topic: a stale specialists:event can flip a finished helper card back to "running" — the run record carries no sequence or version field
---

# A late-arriving run update can revert a finished helper card to "running"

## Symptom
A helper's Task card that already reads "completed" can flip back to "running" and never
correct itself, if an older run update arrives after a newer one (a replay-then-live race on
attach, or a slow IPC/WebSocket hop). Desktop and the remote browser client both take this path;
Android carries no specialist events.

## Mechanism
- The reducer applies whichever `SPECIALIST_RUN_CHANGED` arrived last. Its only guard is a
  key-order-independent stringify equality against the card's current record — it can absorb an
  identical resend, but cannot tell an OLDER record from a newer one, so it overwrites the whole
  `specialistRun` with the stale one.
  `youcoded/desktop/src/renderer/state/chat-reducer.ts`, case `SPECIALIST_RUN_CHANGED`:
  <!-- claim: {"path": "youcoded/desktop/src/renderer/state/chat-reducer.ts", "contains": "stableStringify\\(action\\.run\\) === stableStringify\\(card\\.specialistRun\\)"} -->
- `SpecialistRunView` (`youcoded/desktop/src/shared/types.ts`) has no `seq` / version /
  `updatedAt` field (verified 2026-09-01 — fields are childId, parentToolCallId, agentType,
  title, description, background, status, startedAt, endedAt, steps, stale, model, notes,
  report). Only `notes` merges safely, by index-id (`reconcileNoteSegments`).
- Stale sources: the ledger listener's live push, the post-replay re-send
  (`b3e8ae13`), and the remote server's replay buffer (`youcoded/desktop/src/main/remote-server.ts`,
  "latest run per helper on connect").

## Fix notes (from the 1c Task 11 review, still accurate)
Stamp a monotonic `seq` in `toRunView` (`delegation-ledger.ts`, the single projection) from a
per-record main-process counter — not `Date.now()` (coarse clock ties). Make the field optional
so replayed pre-1c records still parse. Reducer: drop any incoming view whose `seq` is lower than
the card's. The remote replay buffer must carry the same stamp.

## History
- 2026-08-16 — found in plan 1c Task 11's review; not actionable until 1c merged.
- 2026-08-26 — 1c merged (`62c1f182`); actionable.
- 2026-09-01 — re-verified: reducer still whole-overwrite, view still has no ordering field.
- 2026-09-02 — fixed on youcoded master, `96d82393`: `SpecialistRunView.seq` stamped in `toRunView`; the reducer drops an incoming view whose seq is not newer.
- 2026-09-04 — roadmap item closed and report archived (the fix had landed without closing either).
