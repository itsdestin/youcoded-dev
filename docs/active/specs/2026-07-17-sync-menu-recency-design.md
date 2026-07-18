---
status: draft
date: 2026-07-17
topic: sync-menu-recency
repos: [youcoded, wecoded-marketplace]
---

# Sync menu: show real sync recency per device

## Problem

Each row in the sync menu's "Your devices" list shows `last seen {relativeMs(lastSeen)}`
(`SyncPanel.tsx:1576`). `lastSeen` is a **launch-time heartbeat** — `upsertSelf` is
called once, on app launch (`main.ts:1632`), and never again while the app runs. It also
only reaches other devices by syncing the `Personal/Devices/<id>.json` file through git.

Result: a device that is powered on and actively syncing shows "last seen a few hours ago"
on every *other* device, because that value froze when it launched and hasn't propagated
since. The label measures "last launched," not "last synced."

## Goal

Peer device rows reflect **real sync activity**:

| Condition | Label |
|---|---|
| Synced within the last **5 minutes** | **"Synced just now"** |
| Synced longer ago | **"Last synced 12 minutes ago"** → hours → days |
| Never synced (no record) | Falls back to today's launch-time value (`lastSeen`) |
| This device (self) | Live **"Syncing…"** while a sync is in flight, else recency from `lastSyncEpoch` |

Recency only — no live per-peer "Syncing…" indicator (explicitly out of scope; see Non-goals).

## Approach

**Carry per-device last-sync recency over the SyncHub Durable Object**, not over git.

The DO already fires a signal on every successful push — `service.ts:117` sends
`sendSignal('space-updated', repoNameForSpace(space))` gated on `synced && pushed`, and the
DO relays a frame `{ type:"signal", kind, spaceKey, device, at }` where `at` is **server
time** (`room.ts:125`). So "device X synced at T" is *already on the wire*. Three additions
turn it into a durable, per-device recency the menu can read:

1. The DO keeps a **`lastSyncByDevice` map in its own storage** (keyed by a stable device
   ID), updated on each relayed signal — same pattern it already uses for the lease table
   and the replay ring. Durable across hibernation, per-account, **never touches git**.
2. On connect, the DO includes that map in its `hello` frame, so the menu is accurate the
   instant it opens — even for a device that synced hours ago and went quiet (the 32-entry
   replay ring can't recover that; a dedicated per-device map can).
3. Live signals update it in real time while the menu is open.

This respects the standing invariant that **the DO is an accelerant, not a source of
truth** (`.claude/rules/sync-spaces.md`): if the map is ever lost, a row simply shows the
launch-time fallback until the next sync. Nothing breaks.

### Why not git (rejected)

Stamping a `lastSyncedAt` into the synced device file re-triggers a sync (the write is a
change the watcher sees → another debounced push → which re-stamps → …), and logs a
commit-per-sync into the Personal repo's history forever. Avoiding the feedback loop
requires diffing content-vs-heartbeat pushes — fiddly and corrosive. The DO route has
neither problem.

## The identity linchpin (do this first)

**There is no stable device ID on the SyncHub wire today.** The client connects with
`?device=${os.hostname()}` (`service.ts:279`, `sync-hub-socket.ts:77`) — a bare hostname
label. But device *rows* are keyed by **`machineId`** (a UUID; `device-registry.ts`) and
merely *displayed* by a user-editable name. Matching a signal to a row by hostname would
break on rename or on two machines sharing a hostname.

So the feature's correctness depends on threading the real **`machineId`** through the
connection, end to end:

```
service.ts (has machineId available on launch — same one upsertSelf uses)
  → createSyncHubSocket({ deviceId })            # new opt
  → connect URL  ?deviceId=<machineId>           # alongside existing ?device=
  → sync/routes.ts → header X-Sync-Device-Id
  → room.ts fetch(): store deviceId in the socket attachment (connection-pinned,
                     can't be respoofed per-message — same discipline as `device`)
  → relaySignal(): key lastSyncByDevice[att.deviceId] = at; include deviceId in the frame
  → hello frame: lastSyncByDevice map
```

Renderer then looks up `lastSyncByDevice[d.id]` where `d.id` is the row's `machineId`.

## Changes by surface

### Worker — `wecoded-marketplace/worker/src/sync/`
- `routes.ts`: pass `?deviceId=` through as the `X-Sync-Device-Id` header (mirrors how
  `?device=` becomes `X-Sync-Device`).
- `room.ts`:
  - `fetch()`: read `X-Sync-Device-Id`, add `deviceId` to the `Attachment` and
    `serializeAttachment`.
  - `relaySignal()`: after the ring append, update `lastSyncByDevice` in DO storage
    (`storage.get → set key → put`, no intervening `await`, so the input gate prevents
    interleave — same guard the ring append already relies on). Include `deviceId` on the
    relayed frame.
  - `fetch()` hello: include `lastSyncByDevice` alongside `replay`.
  - Graceful on missing `deviceId` (older clients): skip the map write, relay as today.

### Client — `youcoded/desktop/src/main/`
- `sync-hub-socket.ts`:
  - New `deviceId` opt; add `&deviceId=` to the connect URL.
  - Stop dropping `at`/`device`: extend the `signal` `SyncHubEvent` with `at?: number` and
    `deviceId?: string`; forward them at both the hello-replay (line 143) and live-frame
    (line 148) sites. Capture `hello.lastSyncByDevice` and emit it (e.g. a new
    `{ type:'hello-sync-map' }` event, or fold into `connected`).
  - Backward compatible: consumer at `service.ts:281` reads only `kind`/`spaceKey`; extra
    optional fields don't affect it.
- `sync-spaces/service.ts`:
  - Pass `machineId` into `createSyncHubSocket` (thread it into `startSyncSpaces`).
  - Maintain a `lastSyncByDevice: Map<deviceId, epochMs>` seeded from the hello map and
    updated on each `signal` event's `at`.
  - Expose it via `getSyncStatus()` and the `status:data` push so the renderer (and remote
    clients) receive it.

### Renderer — `youcoded/desktop/src/renderer/components/`
- New **pure** label helper (mirroring `sync-dot-state.ts`), unit-tested:
  `deviceActivityLabel(deviceId, lastSyncByDevice, gitLastSeen, isSelf, syncInProgress, now)`
  - clamps `max(0, now − at)` (server-vs-local clock skew guard, same as
    `friends-data.ts`);
  - `< 5 min` → "Synced just now"; `≥ 5 min` → "Last synced {relative} ago"; no record →
    existing `relativeMs(gitLastSeen)` fallback; self → "Syncing…" when `syncInProgress`.
- `SyncPanel.tsx:1576`: replace the inline `last seen {relativeMs(d.lastSeen)}` with the
  helper.

## Edge cases

- **Clock skew** — `at` is server time; the viewer compares with its local clock. Clamp
  negatives to "just now" (never show a future/negative age).
- **Rollout skew** — new worker + old app: no `deviceId` on the wire → map not populated →
  rows fall back to `lastSeen`. Old worker + new app: no `hello` map, no `deviceId` on
  frames → same fallback. No coordinated deploy required.
- **Solo device** — its own push still runs `relaySignal` (sender), so its entry is stored
  and returned in `hello`; the self row uses local `lastSyncEpoch` regardless, so this is
  harmless.
- **Removed device** — a stale map entry for a removed device is never displayed (the row
  is gone; the list is driven by the git registry). No pruning needed for correctness.

## Non-goals

- **No live per-peer "Syncing…"** — recency only. (Would need a new sync-*start* signal;
  "Synced just now" already communicates active syncing.)
- **Android peer recency** — Android isn't wired into sync-spaces (no `syncspaces:*`
  handlers, no hub connection) yet. Android rows won't update; not a regression.
- **Remote-browser viewers** — get peer recency only insofar as the map rides the
  `status:data` snapshot they already receive. Secondary; include if free, don't gold-plate.

## Testing

- **Renderer** (`sync-dot-state.test.ts` sibling): pure `deviceActivityLabel` — just-now
  band, ≥5min relative, never-synced fallback, self/syncing, negative-skew clamp.
- **Client** (`sync-hub-socket.test.ts`): `deviceId` in the connect URL; `at`/`deviceId`
  forwarded on live + replay signals; `hello.lastSyncByDevice` captured; missing-fields
  degrade.
- **Worker** (room tests): `hello` carries the map; a signal updates stored
  `lastSyncByDevice` keyed by `deviceId` and relays `deviceId`; missing `deviceId` skips
  the write without throwing.

## Privacy / security

- The DO map is **per-account** (`idFromName(userId)`) — no cross-account visibility, same
  isolation the room already guarantees. Same data already flowing as signals.
- It stores only the **latest** timestamp per device, not a history log — distinct from the
  "history of when you were online" the privacy copy (`AboutPopup.tsx`) disclaims for the
  social presence system.
- `machineId` is already shared among the account's own devices via the synced registry;
  putting it on the account's own DO connection adds no new exposure.

## Guard rules touched

`.claude/rules/sync-spaces.md` — Device registry + SyncHub sections. Update the SyncHub
line ("Signal ONLY on `pushed:true`") to note the signal now also carries `deviceId`/`at`
and feeds the per-device recency map.
