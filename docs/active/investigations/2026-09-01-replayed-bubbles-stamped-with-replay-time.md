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

---

## Consumer audit, 2026-09-02 — the "check the consumers first" work, done

The fix shape above says "check the consumers that compare `timestamp` to now before
flipping it." That audit is below. Every claim was re-verified by hand against
`worktrees/tier0-desktop` at `5938c118`, not taken on trust.

**Result: the flip is NOT a one-line change, and it needs two decisions from Destin. Left
open deliberately on 2026-09-02 rather than half-done.**

### The blocker: flipping the parser alone makes the timeline WORSE

`chat-reducer.ts:129` (`getOrCreateTurn`) stamps every assistant turn with `Date.now()`,
not the event's time — only the abnormal-stop mint path (`:1791`) uses the event's own.
<!-- claim: {"path": "youcoded/desktop/src/renderer/state/chat-reducer.ts", "contains": "timestamp: Date\\.now\\(\\),"} -->

So flipping `parseTranscriptLine` fixes **user** bubbles, skill cards and clear markers on
replay while **assistant** bubbles keep saying "now". A replayed conversation would read
half-right, alternating between the real time and the hydration time — which is arguably
worse than today's uniform wrongness, because uniform wrongness at least does not look like
data. Threading `action.timestamp` into `getOrCreateTurn` is a second, separate change and
has to land in the same PR.

### The other decision: `lastActive` is a persisted cross-device MERGE key

`conversations/service.ts:397` maps the event timestamp straight onto `lastActive`, and its
own comment says it relies on that being `Date.now()`. `lastActive` is the merge comparand
in `store-core.ts` (`laterOf`), drives browse order, cross-device conflict resolution and
the EPOCH-sentinel phantom-record check, is written to disk, synced between devices, and
copied into the chatsearch meta index.

Live tailing is safe — the watcher starts at end-of-file, so only genuinely new lines reach
the emitter. **The exposure is the shrink path**: `transcript-watcher.ts:655-660` resets
`offset = 0` on a `/clear` or `/compact` rewrite and re-emits the WHOLE file through the
live emitter. Today that writes `lastActive = now`; after the flip it would write a LINE
time and could move `lastActive` **backwards**, losing a merge against another device's
record and reordering the browse list.

Either clamp at that one site (keep noting activity with `Date.now()` explicitly) or accept
it deliberately. Not a call to make unattended.

### What is genuinely safe

- Every renderer path is a pure pass-through to display or to a reducer field. App.tsx
  (8 sites), BubbleFeed (5), `transcript-page-actions.ts` (7).
- **No CC event timestamp is persisted.** The JSONL is the source of truth and is re-parsed
  every time; the transcript mirror is a byte-for-byte file copy. Native events *are*
  persisted, but they come from `harness-session.ts`'s own `emitEvent`, which this change
  does not touch.
- Nothing keys dedupe, TTLs, debouncing, sorting or the attention/stall machinery on the
  event timestamp — those use `Date.now()` or uuids throughout (`rg -n 'sort\(.*timestamp'`
  over `desktop/src` → no hits).
- The chatsearch index's CC rows ALREADY use the line's own time, so the flip makes the
  event stream **agree** with the index rather than diverge from it.
- No test asserts an event timestamp is ≈ now. Three fixture files document the mapping and
  want their comments re-worded, not their assertions changed:
  `conversations-service.test.ts:99,179`, `deliverable-auto-open.test.ts:52-70`,
  `transcript-watcher.test.ts:920-935`.

### Android already does this, and has all along

`app/.../parser/TranscriptWatcher.kt:203` parses the line's own `timestamp` and passes it to
every emitted event; `parseTimestamp` (`:425-432`) falls back to `System.currentTimeMillis()`.
<!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/parser/TranscriptWatcher.kt", "contains": "val timestamp = parseTimestamp"} -->
`TranscriptSerializer.kt:136` sends it over the identical wire shape the React renderer
consumes. **So the renderer has been receiving line-time stamps from Android for its entire
life** — this flip is a parity restoration, not a new regime, which is the strongest single
argument for doing it.

### One trap for whoever picks this up

**Do not delete `data.recordedAt` as "now redundant".** `deliverable-auto-open.ts:84` is the
only `now() - <event time>` freshness comparison in the app, and it depends on `recordedAt`
failing **closed** (`0` when the line has no parseable time). The proposed top-level field
fails **open** (`Date.now()`). Collapsing them would let an unparseable-time replayed result
auto-open a file.
