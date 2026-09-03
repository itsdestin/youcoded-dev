---
date: 2026-09-01
status: active
type: investigation
topic: Presence can wedge OFF for the rest of the process — the `suspended` latch is only clearable by a powerMonitor `resume`
---

# Presence wedges OFF permanently when a `resume` event is missed

**Symptom.** A friend row read `Last seen 7/26/2026` on 2026-08-11 while the person was still
using the app — signed in, not incognito, on a MacBook. Spec for the repair:
`docs/active/specs/2026-08-11-presence-self-healing-design.md`. Ranked Tier 3 on 2026-08-31.

## Mechanism (re-checked 2026-09-01)

No data or server defect: `users.last_seen_at` is accurate; the client simply never opened a
socket again. Ruled out by inspection on 2026-08-11: client caching (`GameLobby.tsx` refetches
on mount), duplicate accounts (`identities` keyed `(provider, provider_user_id)`), server
version-gating (none in `wecoded-marketplace/worker/src/social/routes.ts`), session expiry
(`SESSION_MAX_IDLE_SEC` is 90 days), column-type drift (`last_seen_at` INTEGER with a `MAX()`
no-go-backwards guard).

The socket's desire is composed from three axes — the renderer's wish, OS suspend, and user
idleness — and the `suspended` axis has exactly one clearing edge:
`youcoded/desktop/src/main/presence-socket.ts` computes `rendererDesired && !suspended && !idle`.
<!-- claim: {"path": "youcoded/desktop/src/main/presence-socket.ts", "contains": "rendererDesired && !suspended && !idle"} -->

`youcoded/desktop/src/main/social-handlers.ts:126-129` is the *entire* lifecycle of that axis:
`powerMonitor` `suspend` → `setSuspended(true)`, `resume` → `setSuspended(false)`. If the
`resume` edge is ever missed, presence stays off for the rest of the process lifetime:
- user input cannot clear it — the 15 s poller only writes the `idle` axis;
- sign-out / sign-in cannot — that writes `rendererDesired`;
- the reconnect engine cannot — it is not retrying, the desire is simply false.
Only a full quit-and-relaunch resets it.

macOS is the worst case by construction: the comment above the listener deliberately relies
on dark wakes *not* firing `resume`, but nothing compensates for a missed **real** wake, and a
MacBook runs for weeks of lid-close cycles without a quit. The suspend handler's last act is a
clean close, which stamps `last_seen_at` — so the frozen date is the last lid-close with a
working socket.

**Diagnostic property worth keeping.** Every socket teardown stamps the timestamp
(`wecoded-marketplace/worker/src/social/presence-room.ts`), so any fault that
connects-then-drops yields a *moving* date. A frozen date means nothing has connected since —
which rules out the idle gate, OS suspend, Wi-Fi drops, Android Doze and the old-Android
missing-ping flapping, all of which keep the date advancing.

**Second wedge, same machinery.** Presence uses `noToken: 'wait'`, and
`youcoded/desktop/src/main/reconnecting-ws.ts` (~line 75-86) schedules **no retry** when the
token is missing at connect time (only `'poll'` does); `usePresence` re-invokes only on
`signedIn` / `incognito` / `isLeader` changes.

## Trap for the fix

A timer that re-asserts desire does NOT work: `setDesired(true)` on a desired-but-disconnected
engine cancels the pending backoff timer and reconnects immediately (`reconnecting-ws.ts`,
deliberate), so it would defeat capped backoff during an outage and spam `onReplay` on healthy
sockets. The spec keys the repair on an explicit stall predicate. Safety argument: `idle` is
the correctness gate and `suspended` only a fast-offline optimisation, so over-clearing
`suspended` is bounded by `idle` and cannot resurrect the 2026-07-22 ghost-socket bug.

**Not reproducible here** — the workspace's only machine is Linux; the fix is designed not to
depend on macOS `resume` behaviour. Field test on the affected machine: a full
quit-and-relaunch restoring Online is positive evidence, since a relaunch is the only thing
that clears the latch today.

## History
Added 2026-08-11 (old ROADMAP.md L357). Re-verified 2026-09-01: no commits to
`presence-socket.ts` / `social-handlers.ts` / `reconnecting-ws.ts` since; the latch and its
single clearing edge are unchanged.
