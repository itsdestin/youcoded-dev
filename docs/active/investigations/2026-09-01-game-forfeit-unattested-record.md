---
date: 2026-09-01
status: active
type: investigation
topic: Head-to-head relay — a forfeit is recorded on one client's word, and neither result message is rate limited
---

# `game-forfeit` records a permanent match on one client's say-so; `game-result`/`game-forfeit` are uncapped

**Roadmap entry:** `docs/roadmap/games.md`.
**History:** added 2026-08-31 (found reviewing wecoded-marketplace#78); re-verified against
today's code 2026-09-01.

Both halves live in `wecoded-marketplace/worker/src/social/presence-room.ts`, deployed on
master since #78. Both need an authenticated account with an accepted friendship — this is
not a stranger attack, it is a friend with a hand-written client.

## (a) The forfeit path lets one client assert a result alone

The head-to-head design's rule (spec §6.2) is that a client never asserts a result by itself:
`handleGameResult` records a match only when BOTH players report the same match from opposite
seats. `handleGameForfeit` is the deliberate exception (§6.3: the opponent left and cannot
report), but its only guard is "the opponent has no live socket right now":

`handleGameForfeit` rejects with `opponent-still-connected` only while the opponent has a live socket, then writes a `game_matches` row with `source: "forfeit"` and `winner: att.userId`.
<!-- claim: {"path": "wecoded-marketplace/worker/src/social/presence-room.ts", "contains": "liveSocketsFor\\(opponent\\)\\.length > 0"} -->

The claimant can simply wait until the friend goes offline. Nothing proves a match was ever
played — the Durable Object never saw it start, and `match_id` is opaque to the server. So a
hostile client can manufacture "47-0 vs Jake": a permanent row about a person who never
agreed to it, surfaced on both players' records.

**No shipping client sends `game-forfeit`.** Re-checked 2026-09-01: `rg game-forfeit` over
`youcoded/` (desktop + Android) returns nothing; the string exists only in the Worker and its
tests. Today the only possible caller is a hostile one.

Fix options: delete the message until §6.3 has a real client, or require the DO to have
independently observed the opponent leave *during* a match it also saw start.

## (b) No rate limit on the two socket messages

`POST /games/scores` is capped by `checkRateLimit` (300/hour, `worker/src/games/routes.ts`).
`presence-room.ts` never imports or calls `checkRateLimit` (verified 2026-09-01 —
`rg checkRateLimit` on the file prints nothing), so `game-result` and `game-forfeit` are uncapped.

- Each unpaired `game-result` parks a `result:` key in DO storage until the ~5-minute alarm
  (`sweepPendingResults`) drops it. That storage belongs to the single global presence object
  that carries everyone's online/offline state, and the sweep does an unbounded `list()`
  every tick — a loop of reports degrades presence for all users.
- Each `game-forfeit` that passes the guard writes a permanent `game_matches` row; no cap at all.

Fix is small: `checkRateLimit` on both message types, plus a per-account ceiling on pending slots.

## Checked and correct (not bugs)

The both-players-agree flow is safe against simultaneous reports (Cloudflare input gates
serialise the read-then-write; both interleavings traced). Retries are idempotent on both
sides of settlement (`matchIsRecorded` before, per-account overwrite inside the slot). The
score upsert's tiebreak timestamp only moves on a genuine improvement.

Related: `docs/active/reviews/2026-08-31-roadmap-open-item-difficulty-ranking.md` puts this
in Tier 3 (needs a design pass first).
