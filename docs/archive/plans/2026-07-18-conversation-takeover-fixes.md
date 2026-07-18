---
status: shipped
---

> **Shipped 2026-07-18** — youcoded PR #176 (merge `e7b09f60`). All seven tasks
> implemented + guard-tested; full desktop suite green (2614 passed), `tsc --noEmit`
> clean, `vite build` clean. The only deferred items are the holder-ack protocol and
> TTL/sweeper tuning (see "Deferred" at the bottom).

# Conversation takeover fixes — lost turns on force + blind timeout

**Date:** 2026-07-18
**Source investigation:** `docs/archive/investigations/2026-07-18-conversation-takeover-failures.md`
**Scope:** EXPANDED (Destin, 2026-07-18) — all confirmed defects from the investigation:
the three symptom fixes (lost turns, blind timeout) PLUS the secondary issues found en
route (interrupt-all-holders, pushMoved routing, native-provider leases, silent error
outcomes, acquire observability). Only the holder-ack protocol (investigation Fix 4) and
the TTL/sweeper tuning are out of scope — see "Deferred" at the bottom.
**Repos touched:** `youcoded/` (desktop main + renderer). No Worker change.

---

## Why this scope

The investigation confirmed two independent causes of the lost turns and one cause of the
blind timeout:

- **§3.1** — the holder never hears a `force-acquire`. The DO broadcasts `{kind:"taken"}`
  but the client drops every lease-event kind except `takeover-request`
  (`main.ts:1600-1602`). Holder keeps running, never flushes, requester pulls a stale copy.
- **§3.2** — `syncSpacesSyncNow` is fire-and-forget (`void engine.syncSpace(s)`), so the
  "mirror-before-release" barrier doesn't exist. Both barrier sites resolve before git runs.
- **§3.3** — no holder ack → the 10s poll can't distinguish live/offline/not-held. (This is
  the larger protocol fix, **deferred**.)

These map to investigation Fixes 1, 2, 3. The plan implements them in **dependency order**:
the awaitable sync (Fix 2) is the *prerequisite* — routing `taken` through teardown (Fix 1)
only actually saves the final turn once the holder's flush genuinely blocks on its push.

### Correction carried in from review (do not implement the investigation literally)

The investigation's Fix 1 says "guard on the holder's own `deviceId`." **That field is not in
the `taken` payload** — `room.ts:223` broadcasts `{kind:"taken", sessionId, device}` where
`device` is the hostname *label*, not a `deviceId`. The correct guard is the one the lease
client already uses: `held.has(sessionId)`. A device that just *forced* the steal does not
hold that session, and a device that *holds* it is the victim — so `held.has()` distinguishes
victim from attacker with no `deviceId` comparison needed (or possible). This plan implements
the `held.has()` guard, not the literal `deviceId` suggestion.

---

## Fix ordering & the MAX_MS coupling

The handoff involves two constants that must be tuned **together**:

- Holder: quiescence wait caps at `QUIESCE_MAX_MS = 6_000` (`conversations/service.ts:27`).
- Requester: poll budget `MAX_MS = 10_000` (`takeover.ts:120`).

Once the holder's flush genuinely awaits a real git push (Fix 2), the holder's handoff
latency becomes quiescence (≤6s) + push time. A push on a slow network can exceed the
remaining ~4s of the requester's budget. So:

- The holder's awaited sync gets its own **bounded timeout** (`HANDOFF_SYNC_TIMEOUT_MS`),
  sized generously (e.g. 15s) so a slow push still completes — a timed-out push falls back to
  today's fire-and-forget behavior (the turn may be lost, but the handoff is never blocked).
- The requester's `MAX_MS` is raised to exceed `quiescence + HANDOFF_SYNC_TIMEOUT_MS` so a
  *healthy* handoff no longer trips the force dialog. New value: `25_000` (6s quiesce + 15s
  sync + slack). This is a deliberate tradeoff: the user waits longer before being offered a
  force, in exchange for the force almost never firing on a live holder.

---

## Task 1 — Awaitable sync variant (Fix 2, the prerequisite)

**File:** `youcoded/desktop/src/main/sync-spaces/service.ts`

Add a new exported function alongside `syncSpacesSyncNow` — do **not** change
`syncSpacesSyncNow` itself (the "Sync now" button and the `service.ts:173` signal path must
stay fire-and-forget so UI clicks don't block on the network).

```ts
// Awaitable counterpart to syncSpacesSyncNow for the takeover handoff barrier.
// Unlike syncSpacesSyncNow (fire-and-forget so UI clicks never block on the
// network), this returns after each targeted space's pull+push completes — the
// holder's final turn must be IN the space before the requester pulls. Bounded
// by `timeoutMs`: on timeout we resolve anyway (the push continues in the
// background; the handoff is never hard-blocked on a slow network).
export async function syncSpacesSyncNowAwaited(spaceId: string, timeoutMs: number): Promise<void> {
  if (!engine || !roots) return;
  const targets = roots.spaces().filter((s) => s.id === spaceId);
  await Promise.race([
    Promise.allSettled(targets.map((s) => engine!.syncSpace(s))),
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ]);
}
```

Notes:
- `engine.syncSpace` never throws (its body is fully try/caught), so `allSettled` is belt-
  and-suspenders. Single-flight + rerun coalescing in the engine means a concurrent "Sync
  now" click during a handoff is safe.
- WHY comment is load-bearing: this is the function that makes mirror-before-release real.

**Guard test** (`tests/` new file or extend an existing sync test): assert that awaiting
`syncSpacesSyncNowAwaited` does not resolve until the injected engine's `syncSpace` promise
resolves, and that it resolves after `timeoutMs` even if `syncSpace` never settles. The
existing `syncSpacesSyncNow` test (if any) must keep passing unchanged.

---

## Task 2 — Use the awaitable sync at the two barrier sites

**Files:** `youcoded/desktop/src/main/conversations/service.ts`,
`youcoded/desktop/src/main/conversations/takeover.ts`,
`youcoded/desktop/src/main/main.ts`

1. **Holder flush** — `conversations/service.ts:351`. Replace
   `await Promise.resolve(syncSpacesSyncNow('personal'))` with
   `await syncSpacesSyncNowAwaited('personal', HANDOFF_SYNC_TIMEOUT_MS)`. Define and export
   `HANDOFF_SYNC_TIMEOUT_MS = 15_000` here (or in a shared constants spot) with a WHY comment
   tying it to the requester's `MAX_MS`.

2. **Requester pre-materialize pull** — the requester's `syncNow` dep. In `main.ts:715`,
   change the injected dep from `() => syncSpacesSyncNow('personal')` to
   `() => syncSpacesSyncNowAwaited('personal', HANDOFF_SYNC_TIMEOUT_MS)`. The dep type
   (`takeover.ts:107`) already accepts `Promise<unknown> | unknown`, so no type change needed.
   This covers both the `takeover` path (`takeover.ts:141`) and the `force` path
   (`takeover.ts:158`), since both `await Promise.resolve(deps.syncNow())`.

3. **Raise the requester budget** — `takeover.ts:120`: `MAX_MS = 10_000` → `25_000`, with a
   WHY comment: "exceeds quiescence (6s) + HANDOFF_SYNC_TIMEOUT_MS (15s) so a healthy
   handoff never trips the force dialog; the force offer is now reserved for a genuinely
   unresponsive holder."

**Guard test** — extend `tests/requester-takeover.test.ts`: today's `syncNow` stub resolves
immediately, which is exactly how §3.2 slipped through. Add a test where the `syncNow` stub
returns a promise the test controls, and assert `materializeOne` is **not** called until the
stub resolves. Update the fake-timer tests for the new `MAX_MS`.

---

## Task 3 — Route `taken` through holder teardown (Fix 1)

**File:** `youcoded/desktop/src/main/conversations/lease-client.ts`,
`youcoded/desktop/src/main/main.ts`

1. **Client filter** — `lease-client.ts` `handleTakeoverRequest` already guards with
   `if (!held.has(sessionId)) return;` (`lease-client.ts:305`). Reuse it. Add a thin method
   (or reuse the existing one) so a `taken` event drives the same `onTakeoverRequest`
   callback. Because `held.has()` is the guard, the *attacker* (who does not hold the
   session) no-ops, and the *victim* (who holds it) tears down — no `deviceId` comparison
   needed. Add a WHY comment noting this deliberately replaces the investigation's suggested
   `deviceId` guard (that field isn't in the `taken` payload).

2. **Listener** — `main.ts:1600-1602`. Extend the listener body:

```ts
setSyncSpacesLeaseEventListener((ev) => {
  // 'takeover-request' and 'taken' BOTH drive the holder teardown. 'taken' is the
  // force-acquire path: the requester already stole the lease, so the holder must
  // interrupt + flush + release NOW or its final turn never reaches the space.
  // handleTakeoverRequest's held.has() guard no-ops the attacker (who doesn't hold
  // the session) so only the victim tears down.
  if (ev.kind === 'takeover-request' || ev.kind === 'taken') {
    leaseClient?.handleTakeoverRequest(ev.sessionId, ev.from);
  }
});
```

   Note: the `taken` frame has no `from`, so `ev.from` is `undefined` — the existing
   `onTakeoverRequest(sid, from?)` signature already tolerates that (`lease-client.ts:39`).

3. **Sequencing caveat (document in code, not fixed here):** when `taken` fires, the
   requester has *already* force-acquired and is materializing. The holder's flush now
   genuinely awaits its push (Task 2), so the final turn reaches the space — but the
   requester's materialize may already have pulled the pre-flush copy. This is the residual
   "force may still cost the in-flight turn" window. It is *dramatically* smaller than today
   (today the holder never flushes at all), and closing it fully requires the requester to
   wait on a holder ack — which is the deferred Fix 4. Leave a WHY comment at the listener
   pointing at this so a future reader doesn't think the window is closed.

**Guard test** — extend `tests/holder-takeover.test.ts`: a `taken` lease-event drives the
holder teardown (interrupt → flush → release → pushMoved → destroy); a `taken` for a session
the device does **not** hold no-ops (attacker case).

---

## Task 4 — Surface failures instead of silently proceeding (Fix 3)

**Files:** `youcoded/desktop/src/renderer/App.tsx`,
`youcoded/desktop/src/main/ipc-handlers.ts`

1. **Renderer** — `App.tsx:2137-2143`. Two silent paths today:
   - `r?.outcome === 'error'` falls through to resume with no signal.
   - `leaseForce`'s `{ok:false}` is discarded.

   Change both to: still proceed with the resume (never-block holds — a lease hiccup must not
   stop the user opening their conversation), but surface a **non-blocking warning** that the
   other device may still be live and recent turns may be missing. Use the app's existing
   toast/notice pattern (match how other non-blocking warnings are shown; do not introduce a
   modal that blocks the resume).

2. **Observability** — `ipc-handlers.ts:2249`. Stop discarding the acquire result. Log when
   `acquire` returns `ok:false` (another device holds the lease) so a session that runs its
   whole life not owning its lease leaves a trace. This is the observability that would have
   settled investigation §3.4 immediately. Keep it `void` + `.catch` (never-block); just add a
   `.then` that logs on `res && !res.ok`.

```ts
if (isSyncSpacesEnabled()) {
  void leaseWiring?.client.acquire(claudeId)
    .then((res) => { if (res && !res.ok) log('WARN', 'Lease', 'session running without lease (held by another device)', { claudeId, holder: res.holder }); })
    .catch(() => { /* never-block */ });
}
```

   (Match the real `log` signature used elsewhere in the file — verify the exact
   level/message/shape convention before editing.)

**Guard test** — renderer test (or extend an existing App/resume test): `outcome:'error'` and
`force → {ok:false}` both show the warning and still proceed to resume. If no renderer test
harness exists for this flow, note that and cover the logic via the smallest testable seam.

---

## Verification

- `cd youcoded/desktop && npx vitest run tests/holder-takeover.test.ts tests/requester-takeover.test.ts tests/lease-client.test.ts` plus any new/extended tests — all green.
- `cd youcoded/desktop && npm test && npm run build` — full suite + typecheck.
- **Two-instance dev repro is interactive/multi-window** (resume a mid-turn conversation from
  a second dev profile, watch the holder flush and the requester resume with all turns).
  Per CLAUDE.md, hand this to Destin to eyeball rather than scripting a multi-window CDP rig.
  Do **not** touch the live built app.

---

## Task 5 — Interrupt ALL live desktop ids, not just the first

**File:** `youcoded/desktop/src/main/conversations/takeover.ts`

`createHolderTakeover` currently pick-firsts (`takeover.ts:56`: "Pick-first is deliberate")
when a create+resume pair leaves two live desktop ids mapped to one claude id — the other
live session is never interrupted, flushed, or destroyed, so it keeps running as a silent
second writer. Change the handler to run the full teardown (interrupt → flush → release →
pushMoved → destroy) for **every** id in `liveDesktopIds`, not just `[0]`. The flush +
release are idempotent and keyed on the claude id, so running them once is enough; the
interrupt / pushMoved / destroy are per-desktop-id and must run for each. Update the stale
"Pick-first is deliberate" comment to explain why all-holders is now correct.

**Guard test** — extend `tests/holder-takeover.test.ts`: two live desktop ids on one claude
id both get interrupted + destroyed.

---

## Task 6 — Fix pushMoved routing for ownerless sessions

**File:** `youcoded/desktop/src/main/ipc-handlers.ts`

`pushMoved` → `sendForSession` falls back to the single primary `mainWindow`
(`ipc-handlers.ts:184`) when the session has no registered owner — which can be the WRONG
window if the session lives in a secondary/buddy window, so the Moved pill never appears and
the conversation looks like it vanished. The renderer's `sessionMoved` handler
(`App.tsx:1154`) is keyed by `payload.sessionId` and `recordMoved` only affects a window
actually displaying that session — so broadcasting SESSION_MOVED to **every** window is safe
(non-displaying windows no-op). Change `pushMoved` to broadcast the moved payload to all main
windows (and keep the remote broadcast), rather than relying on the single-window fallback.
Verify against the window registry how to enumerate main windows (`getWindowIds` /
`getLeaderId`); add a WHY comment that ownerless sessions must reach every window because the
displaying window may not be the primary.

**Guard test** — a moved push for a session with no registered owner reaches all main
windows, not just window 1.

---

## Task 7 — Native-provider sessions participate in leases

**File:** `youcoded/desktop/src/main/ipc-handlers.ts`

Native sessions emit no CC SessionStart hook, so they never enter `sessionIdMap` and never
acquire a lease — `leaseQuery` always answers `held:false` and the resume gate
(`App.tsx:2132`) never fires for them. That silently disables takeover protection for the
whole native session class. For native sessions, `info.id` IS the claude session id
(`createSession` uses `resumeSessionId` as the id; fresh native sessions mint one). In the
native branch of `SESSION_CREATE` (after the host create/resume succeeds, ~`ipc-handlers.ts:503`),
register the mapping + acquire the lease:

- `sessionIdMap.set(info.id, info.id)` (desktop id === claude id for native).
- `noteSessionStarted(info.id, info.cwd)` so the conversation store knows the cwd (mirrors the
  CC path at `:2235`).
- `if (isSyncSpacesEnabled()) void leaseWiring?.client.acquire(info.id)...` with the same
  never-block + Task 4 logging.

The existing `session-exit` release (`:2268`) and the holder teardown (which reverse-maps via
`sessionIdMap` + `getSession`) then work unchanged for native sessions, since both already key
off `sessionIdMap`. Confirm `sessionManager.getSession(info.id)` returns a live session for a
native id so the holder teardown's liveness filter (`takeover.ts:46`) passes.

**Guard test** — a native session create registers a sessionIdMap entry and acquires the
lease; a takeover-request for that id drives the holder teardown.

---

## Deferred (not this plan)

- **Fix 4 — holder ack protocol.** Requires a new DO op/event kind and a product decision on
  what "never-block" means (silently proceed vs. wait on a real handshake). Spec separately;
  it also closes the residual force-window noted in Task 3.
- **TTL/sweeper tuning** (DO-side sweeper / shorter TTL). Careful — the 300s TTL is a
  deliberate sleep-tolerance choice (per the 2026-07-16 lapse-vs-takeover fix in
  `lease-client.ts:160-165`), not an accident. Tightening it re-opens the stolen-from-a-
  sleeping-device bug.
- §3.4 root-cause confirmation (stale lease record). Task 4's acquire logging is what makes
  this diagnosable next time.
