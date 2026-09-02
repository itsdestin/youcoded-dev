---
date: 2026-09-01
status: active
type: investigation
topic: missedSteers stores a steer's full unclamped text in the ledger the 2,000-char note cap protects — and nothing bounds the array's length
---

# The 2,000-character note cap has a hole: missed steers are saved in full

## Symptom
The per-helper ledger file (read whole and rewritten whole on every access) can grow without
limit if the assistant keeps steering a helper that is no longer live. The cap that was built
to stop exactly that only shortens the *note* copy; the *missed steer* copy of the same text is
saved unclamped, and the list of missed steers is never trimmed.

## Mechanism
- `steerSpecialist` clamps the recorded note (`recordedText`, marked "cut short") but, when the
  child is not live, hands the ORIGINAL `text` to `appendMissedSteers` alongside the clamped note.
  `youcoded/desktop/src/main/harness/native-session-host.ts`:
  <!-- claim: {"path": "youcoded/desktop/src/main/harness/native-session-host.ts", "contains": "appendMissedSteers\\(parentCwd, parentId, childId, \\[text\\], note\\)"} -->
- Second append path: the completion / failure writes pass `drainUnappliedSteers()` as the
  `appendSteers` argument of `updateIfRunning` / `update` (`delegation-ledger.ts`, the
  `missedSteers: [...d.missedSteers, ...appendSteers]` merges) — also unclamped.
- Nothing bounds `missedSteers.length` anywhere in `delegation-ledger.ts`.
- Commit `1ab9fc8c` ("the note cap holds on the assistant's steer path too") closed the NOTE
  half only; `missedSteers` was explicitly left alone by the 1c Task 5 fix brief.

## Fix notes
Clamp to `SPECIALIST_NOTE_MAX_CHARS` (`specialists/limits.ts`) inside `appendMissedSteers` AND
the `appendSteers` merges of `update` / `updateIfRunning` — two independent paths. Add a
tail-keeping length cap (`.slice(-N)`). Clamp on write only (no `FILE_VERSION` bump — oversized
on-disk records stay readable) and do it inside the existing `mutate` callbacks so the
commutative-append guarantee survives.

## History
- 2026-08-16 — plan 1c Task 5 review; a deliberate scope cut.
- 2026-08-26 — 1c merged (`62c1f182`); actionable.
- 2026-09-01 — re-verified: original `text` still reaches `appendMissedSteers`; no length cap.
