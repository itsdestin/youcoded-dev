---
status: active
date: 2026-07-20
kind: plan
---

> **Status 2026-07-20:** Commit 1 shipped in youcoded merge `2f8132cf` (ids +
> empty-snapshot guard, 3 pinning tests). Commits 2 and 3 are NOT done. The
> checkpoint below was reached and Destin reported connect "significantly
> better" from commit 1 alone, so commit 2 may be smaller than specced here —
> re-scope it against the open question (does remote still land on a different
> session/view than the desktop?) before building the state machine.
>
> That merge also carried four unrelated pre-existing fixes found while trying
> to reach the checkpoint: dev remote-config isolation, the dev Vite proxy port,
> the buddy-stub crash on connect, and mobile soft-keyboard handling. See the
> ROADMAP `#remote` bugs for what remains.

# PR spec — remote-access hydration: IDs, ordering, view-state parity

Single PR, three commits. Implements the recommended subset of
`docs/active/plans/2026-07-19-remote-hydration-single-source-of-truth.md`
(Proposal A) plus Finding 3 from
`docs/active/investigations/2026-07-19-remote-access-ui-state-hydration.md`.

**Deliberately excluded:** hydrate merge semantics, snapshot sequence numbers,
chunked terminal replay. See "Not in this PR" at the bottom for why.

**Branch:** `fix/remote-hydration-parity` (worktree, per workspace rules).
**Repo:** `youcoded/` — desktop renderer + main. No Android/Kotlin changes.

---

## Design note: why we do NOT gate first paint

The 2026-07-19 plan proposed gating the client's first paint on `chat:hydrate`.
**Don't.** Android's WebView goes through the same `remote-shim`
(`index.tsx:141` → `connect('android-local')`), and the Kotlin
`LocalBridgeServer`/`MessageRouter` never sends `chat:hydrate` — it only sends
`auth:ok` (`MessageRouter.kt:29`). A first-paint gate would hang Android on
"Connecting..." forever.

Buffering in the shim (Commit 2) achieves the same result without the risk: if
live transcript events can't reach the reducer before the snapshot lands, the
client never builds the throwaway state that causes the visible swap. `App`
mounting early is harmless — its mount effect only dispatches `SESSION_INIT`
(allocates empty slots) and seeds the session list, neither of which produces
timeline content that hydrate would discard.

---

## Commit 1 — `fix(chat): collision-proof message ids + reject empty hydrate`

Kills the "messages in the wrong place / not updating / list jumping" class and
the silent conversation-blanking bug. Ships independently of the rest.

### 1a. Message-ID collision

`chat-reducer.ts:14-16` — the counter resets to 0 on every fresh client while
hydrated history already holds `msg-1…msg-N`. IDs are used **only** as React
keys (`AssistantTurnBubble.tsx:204,215,245`; no lookups by id anywhere), so a
prefix change is safe.

```ts
// Fix: message ids are React keys, and a hydrated remote client restarts this
// counter at 0 while its snapshot already contains msg-1..msg-N — new live
// messages collided with hydrated ones and React mis-reconciled (messages
// rendering in the wrong place / not updating). The per-boot epoch makes ids
// unique across the hydrate boundary without adding a uuid/nanoid dependency.
const ID_EPOCH = Math.random().toString(36).slice(2, 8);
let messageCounter = 0;
function nextMessageId(): string {
  return `msg-${ID_EPOCH}-${++messageCounter}`;
}
```

No dependency added (`nanoid`/`uuid` are not in `desktop/package.json`), ids
stay greppable/ordered in logs. Verified: no test asserts a literal `msg-N`.

### 1b. Empty snapshot must not blank live state

`chat-reducer.ts:274-285` blindly replaces the map. `{ sessions: [] }` is a
*valid* payload produced on host-renderer timeout (`chat-snapshot.ts:31`,
2000ms) and on serialize failure (`RemoteSnapshotExporter.tsx:32`). On a
reconnect where the client already holds state, this silently blanks the chat.

```ts
case 'HYDRATE_CHAT_STATE': {
  // Fix: an empty snapshot is what the host sends when its renderer times out
  // (chat-snapshot.ts TIMEOUT_MS) or serialization throws — NOT a signal that
  // there are no sessions. Applying it wiped a reconnecting client's chat with
  // no error surfaced. Never replace real state with nothing.
  if (action.sessions.sessions.length === 0) {
    console.warn('[chat-reducer] ignoring empty chat:hydrate snapshot');
    return state;
  }
  ...
}
```

### 1c. Surface the failure instead of swallowing it

`chat-snapshot.ts` currently `console.warn`s and resolves empty. Keep the
resolve (the connect must not hang) but mark the payload so the client can tell
"host had nothing" from "host failed":

- Add `degraded?: true` to the resolved snapshot on the timeout and send-failure
  paths.
- `remote-server.ts` passes it through on the `chat:hydrate` message.
- Client logs it; user-facing surfacing is Commit 2's error path.

Per `docs/error-message-standards.md`: no invented cause. The timeout path knows
it timed out — say that; don't guess why.

### Tests — `renderer/state/__tests__/chat-reducer.test.ts`

1. **ID uniqueness across hydrate.** Build a state with `msg-*` ids via a
   serialized snapshot, hydrate a fresh reducer, dispatch a transcript event,
   assert the new segment's `messageId` is absent from the hydrated timeline.
2. **Empty hydrate is a no-op.** Seed non-empty state, dispatch
   `HYDRATE_CHAT_STATE` with `{ sessions: [] }`, assert state is unchanged
   (identity-equal).
3. **Non-empty hydrate still replaces.** Guard against over-correcting 1b into
   "never replaces."

These are the pinning tests for the invariant — per the workspace knowledge
rules, the test is the primary home, not a doc line.

---

## ⛔ Checkpoint — connect a remote client before writing Commit 2

Build, `bash scripts/run-dev.sh`, connect a browser to the dev host, and look at
the connect. Commit 1 may absorb most of the perceived jank on its own:
duplicate React keys produce *sustained* wrongness, whereas the state swap is a
single repaint. If connect already feels clean, Commit 2 shrinks to "delete the
500ms timer + buffer events" and the state machine is unnecessary.

**This is a Destin-eyeball step, not a scripted one** (per the run-dev /
visual-verification rule). Do not build a CDP rig for it.

---

## Commit 2 — `fix(remote): hydrate before live events, drop the 500ms guess`

### 2a. Host advertises the capability

`remote-server.ts:439` and `:486` — both `auth:ok` sends become:

```ts
ws.send(JSON.stringify({ type: 'auth:ok', token, platform: 'desktop', hydrates: true }));
```

Android's `MessageRouter.kt` omits the flag, so the shim never arms the buffer
for the local bridge. No Kotlin change, no version skew: the desktop host serves
the browser renderer as static files, and Android bundles its matching web UI —
client and host are always the same build.

### 2b. Shim buffers live push events until hydrate lands

`remote-shim.ts` — in the `auth:ok` branch, if `msg.hydrates` is set:

- Set `hydrationPending = true`.
- In `handleMessage`, when `hydrationPending` and the message is a **push event**
  (not a `*:response`, not `auth:*`), push the raw message onto
  `pendingHydrationQueue` instead of dispatching. RPC responses must pass
  through — `App`'s mount `session.list()` depends on them.
- On `chat:hydrate`: dispatch it first, then set `hydrationPending = false` and
  drain the queue through `handleMessage` in arrival order.
- **Bound it**: `HYDRATION_TIMEOUT_MS = 5000` and `MAX_HYDRATION_QUEUE = 2000`.
  On either bound, drain immediately, clear the flag, and log — a missing
  snapshot must degrade to today's behavior, never to a dead client.

Mirror the existing `pendingSendQueue` comment style (`remote-shim.ts:45-52`) —
same pattern, opposite direction.

### 2c. Delete the 500ms timer

`remote-server.ts:552` — the `setTimeout(..., 500)` existed because
"hook events arrive before the chat reducer has initialized the session state."
With 2b the client controls ordering, so the wall-clock guess is dead weight
and adds up to ~2.5s to connect. Replace the timer with a direct call; keep the
send order (`session:list` → `session:created` → `session:renamed` →
`chat:hydrate` → PTY/hook replay) and update the comment to explain that
ordering is now enforced client-side.

### 2d. Honest failure when the snapshot never arrives

If the hydration timeout fires, or the snapshot arrives `degraded`, surface a
non-blocking banner: *"Chat history may be incomplete — the host didn't send a
snapshot in time."* with **Report bug** / **Diagnose with Claude** actions, per
`docs/error-message-standards.md`. Do not guess at the cause.

### Tests

`remote-shim` has no test file today; add `renderer/__tests__/remote-shim-hydration.test.ts`
with a fake WebSocket:

1. Push events arriving between `auth:ok` (with `hydrates: true`) and
   `chat:hydrate` are not dispatched until after the hydrate dispatch, then
   arrive in order.
2. `auth:ok` **without** `hydrates` (the Android path) never buffers — this is
   the regression guard for the WebView hang.
3. Timeout drains the queue and clears the flag.
4. `*:response` messages are never buffered (the `session.list()` deadlock guard).

---

## Commit 3 — `feat(remote): sync active session + view mode to remote clients`

The actual "remote rarely matches desktop" complaint. Two fields, one broadcast
fix.

### 3a. Carry UI state in the snapshot

`chat-types.ts` — extend the transport envelope only (per-session shape is
untouched):

```ts
export interface SerializedChatState {
  sessions: Array<[string, SerializedSessionChatState]>;
  // Optional so a snapshot from a pre-field host still deserializes, matching
  // the existing back-compat convention on SerializedSessionChatState.
  ui?: { activeSessionId: string | null; viewModes: Array<[string, ViewMode]> };
}
```

`serializeChatState` keeps its current signature; add an optional second arg for
`ui` so existing desktop-internal callers are unaffected.

### 3b. Exporter reads the UI state

`RemoteSnapshotExporter.tsx` is mounted in `App.tsx`, so pass `sessionId` and
`viewModes` as props and include them in the serialized payload. Keep the
existing try/catch → `{ sessions: [] }` fallback (now `degraded: true` from 1c).

### 3c. Apply on hydrate

`App.tsx:1295` (the `chatHydrate` handler) — after the reducer dispatch, apply
`payload.ui` when present:

- `setSessionId(prev => payload.ui.activeSessionId ?? prev)`
- merge `viewModes` (snapshot wins for sessions it names; keep local entries it
  doesn't)

This must land **after** the mount effect's `setSessionId(prev => prev ?? list[0].id)`
(`App.tsx:1500`), which is why hydrate-applies-last is correct — the `?? prev`
seed is a fallback, the snapshot is the intent.

### 3d. Share view-mode changes live, not just on Android

`App.tsx:2248-2258` — `handleToggleView` broadcasts `switch-view` only when
`getPlatform() === 'android'`, so a desktop↔browser pair never shares it. Drop
the platform condition; `broadcastAction` is wired on desktop preload
(`main/preload.ts:708`) and the receive side already handles the action
(`App.tsx:1220-1228`).

**Verify during implementation:** confirm the desktop main process rebroadcasts
`IPC.UI_ACTION_BROADCAST` to connected WS clients rather than only to native
Android. If it doesn't, that relay is part of this commit.

### Tests

- `chat-types` round-trip: a snapshot with `ui` survives serialize→deserialize;
  one without `ui` still deserializes (back-compat).
- Reducer/UI application is `App.tsx` state — cover with a focused test if the
  hydrate handler is extractable; otherwise this is the checkpoint-verified
  surface and should be called out as such in the PR body.

---

## Verification

```bash
cd youcoded/desktop && npm ci && npm test && npm run build
```

Manual (dev instance only — never the live app):
1. `bash scripts/run-dev.sh`; open a browser client against the dev host.
2. Connect while the desktop has an active multi-session conversation → remote
   lands on the **same** session, same view mode, no flash, no duplicate-key
   warnings in the console.
3. Toggle chat/terminal on desktop → remote follows.
4. Reconnect after a host renderer stall → chat is not blanked.
5. Android debug build still boots to chat (the `hydrates`-flag regression).

Shut the dev server down once this lands on `origin/master`.

## Not in this PR

- **Hydrate merge + sequence numbers.** Once ordering is enforced (Commit 2), a
  blind replace is *correct*; merge semantics ("prefer snapshot timeline, union
  `seenUuids`") adds subtle new failure modes to fix a race that no longer
  exists. Sequence numbers belong to the Proposal B delta protocol.
- **Chunked terminal replay** (investigation F5) and the 4MB buffer cap. Real,
  but a separate problem with a separate fix; bundling it inflates the risk of
  what is otherwise three localized changes.
- **Proposal B** — the versioned delta-sync protocol. Keep as its own ROADMAP
  feature ("devices feel like one app"), specced deliberately.

## On merge

Move this spec and both 2026-07-19 documents to `docs/archive/plans/` and
`docs/archive/investigations/`, and flip the corresponding ROADMAP item — same
session as the merge.
