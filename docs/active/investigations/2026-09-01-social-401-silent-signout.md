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

## Half fixed 2026-09-02 (youcoded#386 `940afe79`)

The log half is done: `makeClearSessionOn401` now writes one `WARN` line to `desktop.log`
naming the surface (bound once per handler module — social / marketplace / arcade — rather
than at all 19 call sites) and the server's own message. Logged only when a session actually
existed, because several in-flight calls can 401 together and `signOut()` is idempotent.
<!-- claim: {"path": "youcoded/desktop/src/main/handler-utils.ts", "contains": "account session cleared"} -->

The server message is CAPPED at 200 characters. It is the 401 response body verbatim —
`marketplace-api-client` falls back to raw response text when the body is not JSON, so a proxy
or captive portal answering with an HTML page would otherwise write that whole page into a log
that keeps only its last 500 lines.

**Still owed: the user-facing notice.** It needs a surface and copy decision on an auth screen
(`docs/error-message-standards.md` applies), which is why it did not ship unattended. The WHY
comment at the edit site records this so a later reader does not mistake the log line for the
whole fix. Four tests cover the decorator, which previously had none.

## History
Added 2026-08-11 (old ROADMAP.md L365). Re-verified 2026-09-01: `handler-utils.ts` has had no
commits since 2026-07-09; the silent `signOut()` is unchanged.
