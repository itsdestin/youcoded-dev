---
date: 2026-09-01
status: active
type: investigation
topic: Any 401 from a social or marketplace call silently signs the account out — no notice, no log
---

# Any 401 silently destroys the local account session

**Symptom.** The user is unhooked from their account with zero feedback; presence drops with
it, so friends see them offline forever (frozen `last_seen_at`) and the user only finds out by
opening the friends panel. Indistinguishable from the presence latch wedge
(`2026-09-01-presence-suspended-latch.md`). Ranked Tier 3 on 2026-08-31.

## Mechanism (re-checked 2026-09-01)

`youcoded/desktop/src/main/handler-utils.ts` wraps every social and marketplace handler with
a "clear session on 401" decorator: one non-ok result with status 401 calls `store.signOut()`.
<!-- claim: {"path": "youcoded/desktop/src/main/handler-utils.ts", "contains": "status === 401\\) store\\.signOut\\(\\)"} -->

Nothing announces it: no toast, no log line, no renderer event beyond the sign-in state
flipping. `usePresence` then drops presence because `signedIn` went false.

**Deleting the sign-out would be worse** — the UI would claim signed-in while every call
failed. The fix is to make the sign-out *announced* (a notice naming which call got the 401,
and a log line), not to remove it. Scoped separately from the presence repair — it is an auth
surface with its own blast radius; see Part 4 of
`docs/active/specs/2026-08-11-presence-self-healing-design.md`.

## History
Added 2026-08-11 (old ROADMAP.md L365). Re-verified 2026-09-01: `handler-utils.ts` has had no
commits since 2026-07-09; the silent `signOut()` is unchanged.
