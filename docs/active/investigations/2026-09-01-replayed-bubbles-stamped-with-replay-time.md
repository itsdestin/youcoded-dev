---
date: 2026-09-01
status: active
type: investigation
topic: replayed / hydrated chat bubbles carry the replay moment, not the transcript's own time
---

# Replayed bubbles are stamped with the replay moment

**Symptom.** With timestamps shown, every historical bubble in a replayed or hydrated
conversation reads "now" (the moment it was replayed), not when it was said.

**Mechanism.** `youcoded/desktop/src/main/transcript-watcher.ts` → `parseTranscriptLine`
stamps every event it emits with a single `const timestamp = Date.now();` taken at parse
time. The JSONL line's own `timestamp` field is parsed one line later into `recordedAt`
(added since the review, used for a freshness gate) — but the value copied onto the
emitted events (`timestamp,` at every emit site) is still the parse-time one.
<!-- claim: {"path": "youcoded/desktop/src/main/transcript-watcher.ts", "contains": "const timestamp = Date\\.now\\(\\);"} -->

Live, parse time ≈ write time so it is approximately right. On replay — a remote client
hydrating, or the desktop re-reading a transcript from byte 0 on session open — every
bubble gets the replay moment.

**Fix shape.** Emit `recordedAt` (falling back to `Date.now()` only when the line has no
parseable time) as the event `timestamp`. Check the consumers that compare
`timestamp` to "now" (freshness / "new since you left" logic) before flipping it.

**History.** 2026-07-10 remote-access review Finding 5 — the only finding in that review
that never had a roadmap entry until 2026-08-26 (also item 5 of the 2026-07-15 "remote
access rework" umbrella). Re-checked against `master` 2026-09-01: unchanged.
