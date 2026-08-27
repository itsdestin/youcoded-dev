---
status: draft
created: 2026-08-11
type: spec
---

# Presence self-healing: no gate may be clearable only by an OS event

> ## Status 2026-08-26 — NOT BUILT; all four parts still open, defect re-verified on master
>
> Verified against `youcoded` `origin/master` (`dbbb9139`) on 2026-08-26:
>
> - **Part 1 (wake evidence clears the latch) — not built.** `presence-socket.ts:112` is still
>   `let suspended = false;` and `:114` still composes
>   `engine.setDesired(rendererDesired && !suspended && !idle)`, with `:119-120` the only
>   writer (the `powerMonitor` edge). Nothing else in the file clears it.
> - **Part 2 (engine stall repair) — not built.** `presence-socket.ts:54` is still
>   `noToken: 'wait'`, and `reconnecting-ws.ts:81` still schedules a retry only when
>   `hooks.noToken === 'poll'`.
> - **Part 4 (the silent 401) — not built.** `handler-utils.ts:36` is still
>   `if (!result.ok && result.status === 401) store.signOut();` with no announcement.
>   (Note: the ROADMAP entry and this spec cite this file as `ipc/handler-utils.ts`; on master
>   it is `desktop/src/main/handler-utils.ts`.)
> - `git log origin/master -i --grep='presence'` shows nothing after PR #215
>   (`e6060be4`, the idle gate) — no self-healing commit landed.
> - No branch or worktree exists for this work.
>
> Last activity: 2026-08-11 (spec written). **Next step: build work only** — the spec is
> self-contained and states its own verification limits; Part 4 is separable and can ship alone.

**Why now:** A friend's row in Destin's friends list read `Last seen 7/26/2026` on 2026-08-11
while the person was demonstrably still using the app, signed in, on a MacBook. The
investigation found no data or server defect — `users.last_seen_at` is accurate. It found a
**client-side wedge**: the desktop presence socket has a gate that, once set, can only be
cleared by a `powerMonitor` event that macOS is not guaranteed to deliver. Nothing else in the
app can clear it — not user input, not signing out and back in, not toggling incognito. Only
quitting and relaunching.

This spec fixes that defect class without requiring confirmation that it is the cause of this
particular friend's frozen timestamp. Every change here is a repair to a *structural* inability
to recover, not to a diagnosed incident.

## Background: what "Last seen" actually measures

`users.last_seen_at` has exactly one writer in the system — the presence Durable Object
(`wecoded-marketplace/worker/src/social/presence-room.ts`): the ~5-minute alarm while a socket
is live (line 243), the clean-close path (line 202), and the ghost-eviction sweep (line 237).
Nothing else touches it — not sign-in, not app usage, not any other authenticated call.

A consequence that drives the whole diagnosis: **every way a socket goes down also stamps the
timestamp.** So any fault that lets presence connect and then drops it produces a *moving*
date. A permanently frozen date means no socket has opened since — the gate was shut before
connect, on every launch since that day.

## The defect

`desktop/src/main/presence-socket.ts:114`:

```ts
const applyDesire = () => engine.setDesired(rendererDesired && !suspended && !idle);
```

Three independent latches, ANDed. `desktop/src/main/social-handlers.ts:126-127` is the entire
lifecycle of the second one:

```ts
onSuspend = () => presence.setSuspended(true);
onResume  = () => presence.setSuspended(false);
```

`suspended` is set by an edge-triggered OS event and cleared by exactly one other
edge-triggered OS event. If that clearing edge is ever missed, presence is off for the rest of
the process lifetime:

- **User input can't clear it** — the 15s poller (`social-handlers.ts:138`) only writes the
  `idle` axis.
- **Sign-out/sign-in can't** — that writes `rendererDesired`; `applyDesire()` still ANDs
  `!suspended`.
- **The reconnect engine can't** — `setDesired(false)` means it isn't retrying.

The suspend handler's last act before wedging is a clean socket close, which stamps
`last_seen_at` at that instant. That is exactly the frozen-date signature.

macOS is the worst case by construction. The code's own comment (`social-handlers.ts:120`)
*relies* on macOS not firing `resume` for dark wakes, so a lid-closed MacBook can't blip online
from maintenance wakes. That asymmetry is desirable for dark wakes, but there is no
compensating detector for a real wake — and a MacBook is the machine most likely to run for
weeks of lid-close cycles without ever being quit.

A second, narrower wedge lives in the same machinery: presence uses `noToken: 'wait'`, and
`reconnecting-ws.ts:81-86` schedules **no retry** when the token is missing at connect time
(only the `'poll'` policy does). It waits for the renderer to re-invoke, and `usePresence`
re-invokes only when `signedIn` / `incognito` / `isLeader` change.

## The insight that makes this safe to fix

`suspended` and `idle` are not peers.

- **`idle` is the correctness gate.** "No human input for 10 minutes" is what makes Online mean
  a human is present. It is level-triggered, re-evaluated every 15 seconds, and self-healing in
  both directions.
- **`suspended` is a latency optimization.** Its unique value is getting the close frame out
  *early* — while the network is still up — so friends see "Last seen just now" instead of a
  ghost riding the server's 10-minute staleness timeout. It is not what keeps a sleeping
  machine offline; a sleeping machine has no input, so `idle` covers that anyway.

Therefore **clearing `suspended` aggressively is bounded by `idle`.** The worst outcome of an
over-eager clear is reconnecting a machine that is awake and has had user input within the last
10 minutes — which is precisely the definition of Online. This is what lets us repair the latch
without walking back the 2026-07-22 ghost-socket fix.

## Unintended consequences considered

This section is the point of the spec. Each proposed change is listed with the way it could
misfire and the mitigation that is part of the design.

**1. A reconciler that re-asserts desire on a timer would bypass backoff and hammer the
worker.** `setDesired` deliberately does not short-circuit the want-on-while-disconnected case
(`reconnecting-ws.ts:124-139`): it clears `retryTimer` and calls `connect()` immediately. A 15s
reconciler calling it during an outage would defeat the capped backoff entirely and retry every
15s forever. *Mitigation:* the reconciler never re-asserts blindly. It acts only on an explicit
stall predicate — desired, no socket, **and no retry scheduled** — which is a true wedge rather
than an in-progress backoff. This requires a small addition to the engine's public surface
(Part 2).

**2. The same naive reconciler would spam the renderer.** `setDesired(true)` on a healthy open
socket fires `onReplay()`, which re-emits `{type:'connected'}` plus the cached presence
snapshot. On a 15s tick that is a `PARTY_CONNECTED` dispatch four times a minute forever.
*Mitigation:* same stall predicate — a healthy socket is never touched.

**3. Clearing `suspended` too eagerly could reopen a socket mid-suspend.** If the poller fires
after the suspend event but before the OS actually freezes, it could reconnect just in time for
the machine to sleep with an open socket — a ghost, which is a partial regression of the very
bug the suspend gate was added to prevent. Damage is bounded (the server evicts after ~10
minutes and back-stamps from the ghost's last proof-of-life), but it is a real regression.
*Mitigation:* a grace period after the suspend event during which evidence-based clearing is
ignored, plus the requirement that observed input be *newer than the suspend timestamp*. Real
machines freeze within a second or two of the event, so the grace costs nothing on wake, where
it has long since expired.

**4. On a platform where `getSystemIdleTime()` always returns 0, evidence-based clearing would
defeat the suspend gate.** The existing comment (`social-handlers.ts:133`) claims platforms
without an idle API report 0, which "fails safe to active". Under this design that also means
"always looks like fresh input", so the latch would clear on the first tick after every
suspend. *Mitigation:* the grace period in (3) is what bounds this, and the consequence is
capped at the pre-2026-07-22 behaviour for that platform only — friends see them Online for up
to ~10 minutes after lid close, then the server sweeps them. Accepted: a bounded staleness on a
platform we cannot measure idleness on, in exchange for removing an unbounded wedge on all
platforms. Note this is a *hypothetical* platform — the claim in that comment is unverified.

**5. A wall-clock gap detector can false-positive under App Nap or timer throttling.** Part 1
uses "wall clock advanced far more than the poll interval" as an independent wake signal that
does not depend on `powerMonitor` at all. A backgrounded macOS app can be throttled, producing
a gap with no sleep. *Mitigation:* none needed — the consequence of a false wake detection is
clearing `suspended` on a machine that is genuinely awake, which is correct. And because a
throttled-but-awake machine still has to pass the `idle` gate to connect, nothing goes Online
without input.

**6. Dark wakes must not blip Online.** *Analysis:* they can't. A dark wake has no user input,
so `idle` remains true and `applyDesire()` stays false regardless of what `suspended` does. The
two gates are independent axes, as the existing comment on `setIdle` already notes. No
regression.

**7. Android is not fixed by this and must not appear to be.** Android's presence lives in
`SessionService` and has no suspend gate at all — the wedge described here cannot occur there,
which is why no Android change is in scope. The genuine Android gap (a foreground service
reading Online with the screen off) is already open as ROADMAP line 376 and stays open. Stated
explicitly so a future reader does not read this spec as cross-platform coverage.

**8. Deleting the 401 sign-out would be worse than keeping it.** `handler-utils.ts` signs the
user out locally on any 401 from a social or marketplace call. Removing that leaves the UI
claiming signed-in while every call fails. *Mitigation:* keep the sign-out; make it
**announced** rather than silent. The defect is the silence, not the sign-out.

**9. A reconnect indicator must not fire for intentional states.** Showing "you appear offline
to friends" to someone who deliberately enabled incognito, or who is simply signed out, is
noise, and guessing at a cause would violate `docs/error-message-standards.md`. *Mitigation:*
the indicator is shown only when the renderer *wants* presence (signed in, not incognito,
leader) and it is not connected — i.e. only for unintentional states — and its copy states the
observable fact, not a cause.

**10. `presence-socket.ts` is covered by 33 state-machine tests.** Any change to `applyDesire`'s
inputs risks silently altering existing semantics. *Mitigation:* the composition rule
(`rendererDesired && !suspended && !idle`) is unchanged. Only the *writers* of `suspended`
change. Existing tests must pass untouched; new tests are added alongside.

## Design

### Part 1 — Wake evidence clears the suspend latch

`social-handlers.ts` records the timestamp of the last `suspend` event. The existing 15s poller
gains a second responsibility: clearing `suspended` when it sees evidence the machine is awake.
Two independent signals, either sufficient:

- **Fresh input** — `getSystemIdleTime()` yields `lastInputAt = now - idleSeconds`. Clear when
  `lastInputAt` is newer than the suspend timestamp and the grace period has elapsed.
- **Wall-clock gap** — the poller compares actual elapsed time against its own interval. A gap
  far larger than the interval means the process was frozen, which means the machine slept and
  has now woken. This detects a wake with no dependence on `powerMonitor`.

`powerMonitor`'s `resume` stays wired as the fast path. macOS's `unlock-screen` and
`user-did-become-active` are added as additional clear-signals — cheap, and they are the OS's
own "the user is back" notifications.

*Judgment calls made:* grace period of 60 seconds (long enough that no real machine is still
running when it expires, short enough to be irrelevant on wake); gap threshold of 3× the poll
interval.

The critical property: after this change, **no state in the presence gate is reachable only via
an OS event.** Every latch is either level-triggered from observable evidence or has an
evidence-based escape.

### Part 2 — Engine stall repair

`ReconnectingWs` gains one method:

```ts
isStalled(): boolean;   // desired === true, no socket, and no retry scheduled
```

That predicate is the exact definition of a wedge, and it is false during normal backoff, false
when intentionally off, and false when healthy — which is what makes it safe to poll. It is
surfaced through `PresenceSocket` and consulted by the same 15s poller; when true, the poller
re-drives the connect.

This repairs the `noToken: 'wait'` stall, and — because it keys on the engine's own state
rather than on any theory about *why* it stalled — any future stall of the same shape.

### Part 3 — Observability

Presence gate transitions are logged in the main process with their reason (`suspend`,
`resume`, `idle`, `wake-evidence`, `stall-repair`), so the next occurrence is diagnosable from
a log rather than from a code read. No tokens are logged.

The friends panel gains an honest low-key status line when presence is wanted but not
connected. It states the observable fact and offers no diagnosis, per
`docs/error-message-standards.md`. It is never shown for incognito or signed-out.

### Part 4 — The silent 401 (separable)

`handler-utils.ts` keeps signing out on 401, but the event becomes visible: a log line and a
user-facing notice that the account session ended and needs re-authentication. Scoped as its
own change — it is a candidate cause of the same symptom, but it is an auth-surface change with
its own blast radius and should not ride in the presence PR.

## What this deliberately does not do

- **Does not stamp `last_seen_at` on ordinary API calls.** It would keep the timestamp honest
  even if presence broke entirely, but background profile revalidation runs every 15 minutes,
  so an app left open would read as permanently active — trading a stuck-stale bug for a
  stuck-fresh one.
- **Does not remove or weaken the suspend gate.** Its fast-offline close frame is genuinely
  valuable; only its inability to recover is a defect.
- **Does not reconnect on desire alone.** Every reconnect path in this design still passes the
  `idle` gate, so Online continues to mean a human is present.
- **Does not touch Android** (see consequence 7).

## Testing

- **A pinning test for the wedge itself:** suspend, never deliver `resume`, then supply input
  evidence — asserts the socket returns. This test fails on today's code, which is the point.
- **Grace-period tests:** input evidence arriving inside the grace window must *not* reconnect
  (consequence 3); the same evidence after it must.
- **Gap-detector test:** a simulated clock jump clears `suspended` but does **not** connect
  while `idle` is still true (consequence 6).
- **`isStalled()` unit tests** across all four engine states: healthy, backing off,
  intentionally off, stalled. Only the last returns true.
- **The existing 33 state-machine tests must pass unmodified** (consequence 10).
- `bash scripts/verify.sh <worktree>` before any completion claim.

## Verification limits — stated honestly

The macOS `resume`-delivery behaviour that most likely triggered this cannot be reproduced in
this workspace: the only machine here is Linux. That is a deliberate input to the design rather
than a caveat on it — **the fix is built so it does not need to know what macOS does.** It
recovers from evidence the app can observe itself, whatever the OS did or did not deliver.

What can be verified locally: the unit tests above, and a real sleep/wake cycle against a dev
instance on Linux. What cannot: that a specific MacBook's `resume` event was in fact dropped on
2026-07-26. The 30-second field test for that remains a full quit-and-relaunch on the affected
machine — a relaunch is the only thing that clears the latch today, so recovery on relaunch is
positive evidence for this diagnosis. It is not a prerequisite for shipping the repair.

## Knowledge capture

The invariant worth keeping is not "macOS drops resume" but the general one:

> **No gate in a connection's desired-state composition may be clearable only by an
> edge-triggered OS event.** Every latch needs a level-triggered escape from evidence the app
> can observe itself.

Per the workspace knowledge ladder this lands as a pinning test (the wedge test above) rather
than prose, with a WHY comment at the edit site pointing back to this spec.
