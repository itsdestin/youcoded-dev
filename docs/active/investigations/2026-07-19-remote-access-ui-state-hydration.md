---
status: active
date: 2026-07-19
kind: investigation
---

# Remote-access UI state: hydration jank + drift investigation

**Reported symptom:** "The UI state in remote access mode is often buggy and rarely correctly matches the desktop UI. Initial chat hydration on connect feels odd/janky."

**Verdict:** Real bugs, two independent classes. (1) A **hydration ordering/timing race** on connect makes the first paint janky and can silently drop state. (2) A **whole category of UI state is never part of the snapshot**, so remote and desktop diverge the moment either side changes it after connect. Both are fixable; the fixes are small and well-localized.

---

## The moving parts

Remote access is a WebSocket bridge that mirrors the desktop's `window.claude` IPC surface:

- **Host side** — `youcoded/desktop/src/main/remote-server.ts`. Listens on port 9900, serves the renderer as static files, and relays every session/PTY/transcript event to connected browser clients. On a new client it runs `replayBuffers()`.
- **Snapshot producer** — `RemoteSnapshotExporter.tsx` (mounted in `App.tsx`) holds a ref to the live `ChatState` map. When the server asks (`chat:export-snapshot` → `requestChatSnapshot()` in `main.ts`), it serializes the whole map via `serializeChatState()` and sends it back.
- **Client side** — `remote-shim.ts` is a WebSocket implementation of `window.claude`. On `auth:ok` it flips to `connected` and starts dispatching incoming events. `App.tsx` subscribes to `chat:hydrate` and fires `HYDRATE_CHAT_STATE`, which **replaces the entire reducer map** with the deserialized snapshot.

The intended connect sequence (from `replayBuffers()`, remote-server.ts:515-569):

```
session:list:response → session:created (×N) → session:renamed (×N)
  → chat:hydrate (snapshot)            ← the "one big message" hydration
  → [500ms setTimeout]
  → pty:output (rolling buffer) + hook:event (rolling buffer)
```

The 500ms delay exists to "give React time to render App and register SESSION_INIT" before replay floods in. That comment is the first sign the ordering is load-bearing but enforced only by a wall-clock guess.

---

## Finding 1 — The hydration ordering race (the jank you feel)

### 1a. The snapshot is a **blind full-state replace**, applied whenever it arrives

`HYDRATE_CHAT_STATE` (chat-reducer.ts:274-285) does `return deserializeChatState(action.sessions)` — it throws away the entire existing `ChatState` map and substitutes the snapshot, unconditionally. There's no merge, no "only if newer," no guard against applying it twice.

That's safe only if the snapshot is the **first and only** state the client ever builds. Two things break that assumption:

- **The 500ms replay window.** PTY output and hook events replay *after* `chat:hydrate`, but a remote client that already has live state (see 1c) can dispatch transcript actions during that window. Those actions mutate the map, then `chat:hydrate` arrives and **wipes them out**, reverting the UI to the snapshot's older state. This is the "flickers, then loses the newest message" jank.
- **No staleness check.** The snapshot is captured on the host at request time, but `requestChatSnapshot` has a 2000ms timeout (chat-snapshot.ts:6). On a busy or backgrounded host renderer the snapshot can be up to ~2s stale *and still sent*. The client has no way to know it's old — it applies it as gospel.

### 1b. The snapshot producer can silently return empty

`RemoteSnapshotExporter` catches serialize errors and replies `{ sessions: [] }` (RemoteSnapshotExporter.tsx:32), and `requestChatSnapshot` resolves `{ sessions: [] }` on timeout (chat-snapshot.ts:31). An empty snapshot is a **valid** `HYDRATE_CHAT_STATE` payload — it deserializes to an empty map and **replaces whatever the client had with nothing.** On a reconnect (where the client already built partial state from live events), an empty snapshot blanks the chat. This is the worst-case version of 1a and it's completely silent — no error surfaces to the user, the conversation just disappears.

### 1c. The connect path builds state *before* hydration, guaranteeing a visible swap

In the browser, `Root` (index.tsx) mounts `<App />` the moment `connected` flips (index.tsx:158), and `App.tsx`'s mount effect immediately calls `window.claude.session.list()` and dispatches `SESSION_INIT` for each (App.tsx:1468-1498). Meanwhile `remote-shim`'s `auth:ok` handler has *already* started dispatching live `pty:output` / `hook:event` / `transcript:event` (remote-shim.ts:393 switches to `handleMessage` before the snapshot round-trip completes).

So the client renders a **live, incrementally-built** state for some hundreds of milliseconds, *then* `chat:hydrate` lands and replaces it wholesale. The visible result is a flash/jump as the incrementally-built timeline is discarded and the snapshot's timeline appears — even when they're identical, the React tree is fully re-keyed (see Finding 2), so it repaints. This is the core "feels odd/janky on connect" complaint.

---

## Finding 2 — Message IDs collide after hydration, breaking reconciliation

The reducer generates timeline message IDs from a module-level counter (chat-reducer.ts:14-17):

```ts
let messageCounter = 0;
function nextMessageId(): string { return `msg-${++messageCounter}`; }
```

The snapshot **does not carry this counter** (it's not in `SerializedSessionChatState`, chat-types.ts:510-533). So:

1. Desktop has been running for hours → its live messages are `msg-1 … msg-8000`.
2. Remote client connects, hydrates → deserializes those same `msg-N` ids into its own (fresh) state, but the client's `messageCounter` is **0**.
3. Client receives a new live transcript event → assigns it `msg-1`, `msg-2`, … — **IDs that already exist** in the hydrated timeline.

React uses these IDs as keys. Duplicate keys across the hydrated history and new live messages cause exactly the symptoms described: messages rendering in the wrong place, not updating, or the list "jumping" as React reuses the wrong DOM node. This alone can account for "rarely correctly matches the desktop UI" once any new activity happens post-connect.

---

## Finding 3 — A whole category of UI state is never synced

The snapshot serializes only the **chat reducer** state. Everything in `App.tsx` `useState` is *not* in it, and there is no channel that reconciles it:

| State | Where it lives | Synced to remote? |
|---|---|---|
| Chat timeline / thinking / attention | chat reducer | ✅ via `chat:hydrate` + live events |
| Session list / models / permission modes | `App.tsx` useState | ✅ via `session:list` + `session:created` |
| **Active session (`sessionId`)** | `App.tsx` useState | ❌ remote always lands on `list[0]` (App.tsx:1498) |
| **View mode per session (chat vs terminal)** | `viewModes` useState | ❌ remote defaults every session to `'chat'` (App.tsx:1483) |
| **Session renamed / topic** | `lastTopics` (main) | ✅ replayed |
| **PTY scrollback / terminal content** | host xterm buffer | ⚠️ rolling 4MB buffer replayed as one blob |

Concrete mismatches a user actually sees:

- **Active session:** desktop is looking at session C; remote connects and force-selects `list[0].id` — a different conversation. Nothing ever reconciles "which session is focused."
- **View mode:** desktop has session B in terminal view; remote shows it in chat view. `handleToggleView` only broadcasts `switch-view` **on Android** (App.tsx:2253) — a desktop↔browser pair never shares it, and the broadcast is fire-and-forget with no state on the host, so a *newly connecting* client gets the default `'chat'` regardless.
- **Initialized/overlay state:** `initializedSessions` is seeded by marking every listed session initialized (App.tsx:1501) — fine — but if the snapshot then arrives empty (Finding 1b) the session list and the (now-blank) chat state disagree.

---

## Finding 4 — Terminal replay is a single undifferentiated 4MB blob

The PTY replay (remote-server.ts:556-560) sends the session's entire rolling buffer as one `pty:output` message. On the client, `TerminalView`/`xterm` writes that whole string at once. For a long-running session this is a multi-megabyte write that:

- Blocks the renderer main thread (jank on connect, again).
- Lands *after* `chat:hydrate`, so the terminal visibly "types out" a huge backlog a half-second after the chat already appeared — the two views are out of sync with each other during the connect window.
- Is capped at 4MB, so a very long session's terminal **cannot** fully match the desktop's (which has the full xterm buffer) — an inherent, unavoidable-with-this-design mismatch.

---

## What's NOT the problem (ruled out)

- **seenUuids / dedup across hydration** — `seenUuids` *is* serialized (chat-types.ts:564) and restored, so transcript events the desktop already applied are correctly dropped on the remote. Good.
- **Session id mapping** — remote renames/status use the desktop session id consistently (`broadcastRename(desktopId, …)`), and native sessions map ids to themselves. No id-translation bug.
- **Pre-auth message drop** — already fixed: `send()` queues until `auth:ok` then flushes (remote-shim.ts:45-112). Not a live issue.

---

## Recommended fixes (smallest first)

**F1 — Make hydration idempotent and non-destructive.**
Replace the blind replace in `HYDRATE_CHAT_STATE` with a **merge**: keep any session the client already has that the snapshot lacks, and for shared sessions prefer the snapshot's timeline but preserve client-side `seenUuids` ∪ snapshot's. At minimum, **skip applying an empty snapshot** (`if (action.sessions.sessions.length === 0) return state;`) so a host timeout can never blank a live client.

**F2 — Fix the ID collision.** Serialize `messageCounter` (and group/turn counters) in the snapshot and reseed on hydrate, *or* switch `nextMessageId` to a collision-proof id (uuid / nanoid). One line either way; nanoid is the robust option.

**F3 — Sequence hydration before live dispatch.** In `remote-shim`'s `auth:ok`, don't switch to `handleMessage` until `chat:hydrate` has been received (queue live events for the ~1 RTT in between), and/or have the server send `chat:hydrate` as the literal first payload and gate `App`'s first paint on it. Removes the "build → discard → replace" flash entirely.

**F4 — Sync active session + view mode.** Add these to the serialized snapshot (they're `App.tsx` state, so the exporter needs to read them) and apply them on hydrate; broadcast changes on a `ui:action` for live drift. This is the fix that makes "remote matches desktop" actually true beyond the transcript.

**F5 (optional, larger) — Chunk terminal replay** and interleave it with hydration so connect doesn't do a multi-MB synchronous write; or send a diff/last-screen-only for very long sessions.

**Suggested order:** F2 (one line, kills a whole class of "wrong UI"), F1 (stops the data-loss jank), F3 (removes the visible flash), F4 (true parity), F5 (polish).

---

## Where to verify

- Hydration reducer: `youcoded/desktop/src/renderer/state/chat-reducer.ts:274` + `chat-types.ts:539-604`
- Snapshot producer/consumer: `RemoteSnapshotExporter.tsx`, `chat-snapshot.ts`, `main.ts:179-184`
- Server ordering: `remote-server.ts:515-569` (`replayBuffers`)
- Client dispatch order: `remote-shim.ts:367-405` (`auth:ok` → `handleMessage`)
- Client mount/session init: `App.tsx:1468-1514`, connection-mode reset `App.tsx:1644-1675`, index.tsx `Root`
