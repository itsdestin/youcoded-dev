---
date: 2026-09-01
status: active
type: investigation
topic: remote hydrate — `turn-`/`group-` id collisions corrupt the hydrated chat
---

# Remote hydrate: `turn-`/`group-` ids collide with the hydrated ones

**Symptom.** A remote browser that has just connected shows the oldest assistant reply
in the conversation turning into a copy of the newest streaming one. Deterministic, not a
race.

**Mechanism.** `youcoded/desktop/src/renderer/state/chat-reducer.ts` mints three kinds
of id. The 2026-07-20 fix (youcoded `2f8132cf`) gave `msg-` ids a per-boot `ID_EPOCH`
(`msg-${ID_EPOCH}-${n}`) on the argument that ids are "used only as React keys". That is
true for `msg-` and false for the other two: `nextGroupId()` returns `group-${++n}` and
`nextTurnId()` returns `turn-${++n}` — both start at 0 per renderer boot, carry no epoch,
and are reseeded nowhere on `chat:hydrate`.
<!-- claim: {"path": "youcoded/desktop/src/renderer/state/chat-reducer.ts", "contains": "return .turn-\\$\\{\\+\\+turnCounter\\}."} -->

Both ARE looked up by key: `assistantTurns.set(currentTurnId, …)` appears at nine sites
in the reducer (`rg -c 'assistantTurns\.set\(' → 9`, 2026-09-01). A freshly connected
remote client hydrates the host's timeline (which contains the host's `turn-1`), then
mints its own `turn-1` for the first live turn, and the live turn's updates land on the
hydrated one.

**Fix shape.** Two lines: give `nextGroupId()`/`nextTurnId()` the same `ID_EPOCH` prefix
`nextMessageId()` already has. Ships independently of the rest of the hydration work.

**Note.** The comment near the paged-history `HISTORY_PAGE_*` handler (~line 2275)
says counter-based ids "can never collide" — that reasoning is about prepending OLDER
pages within one renderer and stays true; the hydrate boundary is a second renderer.

**History.** Added 2026-08-26 (re-verification of the 2026-07-10 remote-access review's
Finding 1, which had been recorded as FIXED; the 2026-07-15 "remote access rework"
umbrella listed it as its item 1). Re-checked against `master` 2026-09-01: unchanged.
Handoff: `docs/active/handoffs/2026-07-10-remote-access-review-handoff.md`.
