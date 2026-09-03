---
date: 2026-09-01
status: active
type: investigation
topic: specialist child transcripts are never deleted — no user-facing delete path, and closing a parent conversation only clears an in-memory set
---

# Specialist child transcripts outlive every conversation that spawned them

## Symptom
Every helper (specialist) the assistant hires writes its own transcript JSONL into the sessions
directory. Nothing in the app ever deletes one: there is no "delete this conversation" surface
at all (specialist or not), and closing or archiving the parent conversation does not remove
its children's files. They accumulate for the life of the install.

## Mechanism
- A child session is registered in the parent's `childrenOf` set. When a child is destroyed the
  host only de-registers it from that in-memory set — the transcript on disk is untouched.
  `youcoded/desktop/src/main/harness/native-session-host.ts` (`destroy`, "De-register from the
  parent's child set"):
  <!-- claim: {"path": "youcoded/desktop/src/main/harness/native-session-host.ts", "contains": "this\\.childrenOf\\.get\\(entry\\.parentSessionId\\)\\?\\.delete\\(sessionId\\)"} -->
- No IPC channel deletes a transcript. A sweep of `ipc-handlers.ts` for `*:delete` / `*:remove`
  channels finds only `sync:remove-backend` (checked 2026-09-01) — so a specialist-specific
  deletion path has nothing to hang off yet.
- The other half of the original item — `resume(childId)` being unguarded — is SHIPPED: `resume()`
  refuses any header whose `sessionKind === 'specialist'` (`native-session-host.ts:3193`), and
  `resumeSpecialist` (the `task_id` surface) is the only re-entry door. Plan 1b, merged
  2026-08-16 (`e5ec5b3c`).

## What a fix needs
A general delete-conversation feature first (this is the blocker). When that exists, deleting a
parent must also unlink every child transcript it spawned (the ledger records the childIds per
parent), and the helper's own card / Settings should offer the same delete for a lone child.

## History
- 2026-08-12 — filed from the final review of specialists plan 1a; deferred by plan 1b's ledger.
- 2026-08-13/16 — resume half fixed by plan 1b (`a933707c`, merged `e5ec5b3c`).
- 2026-08-16 — plan 1c shipped no delete path either; dependency made explicit.
- 2026-09-01 — re-verified against master: still no delete channel, sweep still in-memory only.
