---
status: shipped
date: 2026-07-22
subsystem: social / presence
repos: wecoded-marketplace (worker), youcoded (app)
---

# Friend permanently stuck "Online" in the game panel

## Symptom

A friend's status in the games panel reads `Online` and never changes, including
across a full quit-and-reopen of YouCoded. The friend confirms they do close the app.

## Root cause

`PresenceRoom` (`wecoded-marketplace/worker/src/social/presence-room.ts`) has **no
application-level liveness tracking and no stale-socket eviction**. Verified by grep
across the whole worker: no `setWebSocketAutoResponse`, no idle timeout, no reaper.
The `ping` handler (line 81) replies `pong` and records nothing — no timestamp is
written to the socket attachment, so the 5-minute `alarm()` (line 137) has no way to
distinguish a live socket from a dead one. It only writes `last_seen_at`.

A socket therefore leaves `getWebSockets(userId)` only on a **clean close frame**. Any
death that skips the close handshake — laptop sleep, Wi-Fi drop, force-kill, OS
reaping the Android service — leaves a **ghost socket** registered forever.

### Why it's sticky rather than transient

`webSocketClose` (lines 122–131) broadcasts `user-left` only when the account has no
sockets left:

```ts
const remaining = this.socketsFor(att.userId).filter((s) => s !== ws);
if (remaining.length === 0) {
  await this.writeLastSeen([att.userId]);
  await this.broadcastToFriends(att.userId, { type: "user-left", id: att.userId });
}
```

Once one ghost exists, `remaining.length` is never 0 again. The friend's *real* socket
closing is silently swallowed — no `user-left`, no `last_seen_at` write. They are
pinned online permanently. Reconnects don't clear it either: `wasOnline` is already
true (line 49), so the new socket is simply added alongside the ghost.

`sendSnapshot` (line 177) reads the same socket list, so **every friend, on every fresh
connect, is told they're online** — which is exactly why restarting the app doesn't help.

### Evidence

Destin restarted YouCoded fully; the friend still showed `Online`. A restart pulls a
brand-new snapshot straight from the DO, so the server itself believes a socket is
live while the friend's app is closed. That confirms server-side state and rules out
the client-side hypothesis below.

## Ruled out

**Client-side stale-snapshot replay** — `presence-socket.ts:39–52` caches `lastPresence`
(the full `presence` frame) and replays it on `onReplay`, but never updates it from the
`user-left` / `user-joined` / `user-status` deltas. Replaying resurrects the connect-time
roster. This is a **real latent bug** and should be fixed separately, but it is not the
cause here: it cannot survive an app restart, and the symptom does.

## The cross-platform trap in any fix

The two clients do **not** ping the same way:

| Platform | Ping | Visible to the DO? |
|---|---|---|
| Desktop | app-level JSON `{type:'ping'}` every 30s (`reconnecting-ws.ts:94`) | **Yes** — hits `webSocketMessage` |
| Android | OkHttp `pingInterval(30s)` — WebSocket *protocol* ping (`PresenceClient.kt:15`) | **No** — the runtime auto-answers without waking the DO |

A naive "evict sockets idle for N minutes" would therefore **kick every Android user
offline on a timer**. Android has no app-level ping to stamp.

## Recommended fix

1. **Worker** — register `state.setWebSocketAutoResponse(...)` for the ping/pong pair so
   liveness is stamped without waking the DO, and evict in `alarm()` using
   `ws.getAutoResponseTimestamp()` (seed from a connect-time stamp on the attachment for
   sockets that have not yet pinged). When eviction removes an account's last socket, run
   the same `writeLastSeen` + `user-left` broadcast path as `webSocketClose`.
2. **Android** — add an app-level JSON ping to `PresenceClient`, mirroring desktop, so
   Android sockets are stamped at all.
3. **Separately** — fix `lastPresence` so replay can't resurrect departed friends.

### Release-ordering hazard

Step 1 must not ship ahead of step 2 reaching users. Android installs in the field today
send no app-level ping, so a tight eviction threshold would evict them all. Either ship
the Android ping first and let it roll out, or set the initial threshold generously
(hours, not minutes) and tighten it once telemetry shows the new client is widespread.

## Guard tests to add

`worker/test/presence.test.ts` currently has no stale-socket coverage (9 tests, all
clean-close paths). Add:
- a ghost socket does not suppress `user-left` when the real socket closes;
- the alarm evicts a stale socket and broadcasts `user-left` + writes `last_seen_at`;
- a socket that keeps pinging is never evicted.

## Consequence audit (pre-implementation, 2026-07-22)

Unintended consequences hunted for before writing the fix; each shaped the design:

1. **Naive idle-eviction would kick every fielded Android user on a timer** (the
   platform-vs-app ping trap above) → generous 60-min default threshold until the
   Android ping is widespread; an idle old-Android client flaps at most once/hour.
2. **Eviction writing `last_seen_at = now()` would lie** — a 3-day ghost would read
   "Active just now" → eviction writes the ghost's real last proof-of-life, and
   `writeLastSeen` gained a SQL `MAX()` guard so the timestamp can never move
   backwards (also makes the close-path/sweep-path double-write idempotent).
3. **Ghost-aware close counting can double-broadcast `user-left`** (close path + later
   sweep) → accepted: the reducer's `USER_LEFT` is an id-filter, idempotent by design.
4. **A ghost also suppressed `user-joined` on reconnect** (`wasOnline` counted the
   ghost, so friends were never told the account came back) → `wasOnline`, status
   inheritance, snapshots, and challenge reachability all moved to one
   `liveSocketsFor()` helper — a single definition of "online."
5. **Challenges relayed to ghost-only accounts stranded the challenger on the waiting
   screen forever** (conns non-empty, nothing answers) → live-filter makes it
   `challenge-failed` fast. Bonus fix, same root cause.
6. **Auto-response must byte-match the client ping** or live desktops get evicted →
   pair uses `JSON.stringify({type:"ping"})` (desktop's exact bytes; Android mirrors
   it), and any real frame stamps `lastActivityAt` as a fallback liveness signal.
7. **Delta-before-snapshot race on connect** (broadcasts can interleave with the async
   snapshot send) → the client cache skips deltas until a snapshot exists.
8. **Android Doze defers timers** — tightening the threshold below Doze's maintenance
   window cadence would flap idle phones. Noted at the threshold constant; revisit
   when tightening (a dozing phone reading "away" may in fact be correct).
9. **Legacy attachments (no `connectedAt`) read as maximally stale** → swept on the
   first alarm after deploy. Deliberately kept: **the deploy itself sweeps all
   currently-stuck ghosts**, including the one that prompted this investigation.
10. **DO cost goes down, not up** — pings previously woke the DO via `webSocketMessage`;
    the auto-response pair answers them at the edge.

## Implementation (2026-07-22)

- **wecoded-marketplace [PR #54](https://github.com/itsdestin/wecoded-marketplace/pull/54)** —
  heartbeat liveness model in `PresenceRoom` + the three guard tests (TDD; 189/189).
  Merging deploys immediately and sweeps existing ghosts.
- **youcoded [PR #209](https://github.com/itsdestin/youcoded/pull/209)** — Android
  app-level ping (`PresenceClient.kt`) + desktop replay-cache delta folding
  (`presence-socket.ts`, new state-machine test; 3087 desktop tests pass). Android side
  is CI-compile-verified only: no local SDK, and `PresenceClient` has no JVM harness
  (main-looper bound, no Robolectric) — a harness would be a separate change.
- Either merge order is safe; tightening the Worker threshold (~10–15 min) waits until
  the youcoded release is widespread. That tightening is the open follow-up.

## Resolution (2026-07-22)

Both PRs merged same-day: wecoded-marketplace `31269649` (worker deploy swept
existing ghosts on rollout), youcoded `e24a69a8` (Android CI build green,
13m44s). Remaining follow-ups live in ROADMAP: threshold tightening after the
Android release is widespread, and the `PresenceClient.kt` test-harness gap.

## Day 2 (2026-07-23): the friend was STILL online — third root cause

The ghost fix was real (an eviction was observed live at 04:23Z) but the
specific friend kept reading Online overnight. Server forensics closed it:

- D1 `last_seen_at` kept refreshing on alarm ticks; a 3.3-min `wrangler tail`
  captured **only the PresenceRoom alarm** — zero reconnects, zero REST, zero
  DO-visible socket messages. The only liveness source invisible to a tail is
  the **edge-answered auto-response ping** → the client was genuinely pinging
  every 30s → the app process runs continuously → the Mac never sleeps.
- Likely why: the remote-access **keep-awake** feature
  (`ipc-handlers.ts applyKeepAwake` → `powerSaveBlocker.start`) exists exactly
  to keep machines awake. The suspend gate (PR #211) never fires on a machine
  that never suspends.
- Real bug #3: presence meant "process alive"; humans read "person present".

**Fix: youcoded PR #215 — 10-min user-idle gate** (`powerMonitor.
getSystemIdleTime()` polled at 15s in Electron main; remote-client activity
counts as presence via `RemoteServer.getLastClientActivityMs()`; idle ⊥
suspend so a dark wake can't flash a false Online; no-idle-API platforms fail
safe to active). Idle users read as offline ("Last seen …") — an explicit
Away status is a possible later layer. Client-side, so it reaches friends
with the next release; until the friend updates, their row stays Online.

Lesson for future debugging here: three DISTINCT causes produced the same
symptom (ghost sockets; sleeping-Mac dark wakes; never-sleeping Mac + idle
user). Each fix was real; each unmasked the next. The Android equivalent of
cause #3 (service-alive vs user-present) is an open ROADMAP decision.
