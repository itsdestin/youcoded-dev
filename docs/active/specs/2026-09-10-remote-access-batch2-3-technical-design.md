---
status: draft
branch: session/remote-first-connect
---

# Remote access, batches 2 and 3 — conversation restoration and file reading

Revision 1. Covers batches 2 and 3 of `2026-09-09-remote-access-first-milestone.md`. Every
"today" claim was read against app HEAD `f1380a3d` plus this branch's mockup commits in
`youcoded/`. The user-facing promises are the rows of
`docs/active/design/2026-09-10-remote-batch-2-3/remote-batch-2-3.contract.json`; where a
row and this design disagree, the row wins.

Approved UI (review deck 2026-09-10, 9/9 yes; questions deck 12/12): a strip above the chat
for reconnecting / catching up / out of date (with Refresh) / up to date; the phone's
Projects → Files and Session Files working as on the desktop; Download in place of Open and
Reveal; a card with name, size, kind and Download for a file over the phone's limit; a
notice when a download starts. The mockups are on the branch already, drawn with the app's
own parts; this design is the backend under them.

## What the user gets

A phone that shows the conversation as it is on the computer, from whichever window holds
it, opening on what the desktop is showing. After a drop, a line says it is reconnecting;
after a refresh that did not finish, a line says the copy may be out of date and offers
Refresh; after a refresh, "Up to date." The chat fills in when the phone is ready, not
after a timer. Files: the same lists the desktop has, previews for anything under the
phone's limit, a card with Download above it, and a download that is always saved, never
displayed.

## Batch 2 — conversation restoration

### 1. The phone tells the computer when it is ready (S-2)

**Today.** `remote-server.ts:1012` `replayBuffers()` runs the moment auth succeeds: a
`session:list:response` nothing reads, `session:created` per session, `status:data`, then
`await requestSnapshot()` (2 s timeout in `chat-snapshot.ts`), then `chat:hydrate`, then a
hard-coded 500 ms timer before the PTY and hook buffers replay. `index.tsx:237` mounts
`App` only when `connected` flips on `auth:ok`, so App's listeners register *after* the
first of those messages went out, and the 500 ms is the host guessing how long React
takes. Broadcasts reach the client from `addClient` onward (`:3067`), so live events that
arrive during the snapshot wait are applied and then discarded by the whole-state replace
in `chat-reducer.ts:761`.

**New.** A client message, `client:ready`, and a per-client phase on the host.

- The shim sends `client:ready` (no id, no reply) the first time a listener is added for
  `chat:hydrate` after `auth:ok`, and immediately after `auth:ok` on a reconnect (the
  listener is still registered). App changes nothing; readiness is inferred from the one
  subscription that proves the reducer can receive.
- The host holds a fresh client in phase `restoring` and does not broadcast to it. On
  `client:ready` it sends `session:created` per session, `session:renamed`, `status:data`,
  requests the snapshot (§2), sends `chat:hydrate`, then replays the PTY and hook buffers
  **at once** — no timer, because the reducer initialised each session on
  `session:created` synchronously — and moves the client to `live`, where broadcasts
  reach it. Transcript events broadcast while it was `restoring` are queued per client and
  flushed after the buffers; the snapshot's `seenUuids` make re-applying one a no-op
  (`chat-reducer.ts:421`). PTY and hook events are not queued: the buffer replay at flush
  time already contains them.
- A client that never sends `client:ready` (an old bundle) gets today's sequence after
  5 s, timer and all — a downgrade for an old client, not a hang.
- The `session:list:response` with id `_replay` is deleted; nothing reads it.

### 2. The snapshot comes from every window, and a session from its owner (Q-1)

**Today.** `main.ts:285` asks `mainWindow` only, a variable assigned once at `:907` and
never cleared. A session detached to a second window lives in that window's reducer
(`main.ts:1143` routes session events to `windowRegistry.getOwner(sessionId)`), so the
phone's copy of it is stale or empty; close window 1 and the answer is `{ sessions: [] }`
with no `degraded` flag.

**New.** `requestSnapshot` asks every main window in the registry's directory in parallel
(`windowRegistry.getDirectory()`; it already elects a leader), with one shared 2 s budget,
and merges: for each session the copy from `getOwner(sessionId)`'s window; a session no window
owns, from the leader's copy; a session in one window only, that one. `degraded: true`
when any window timed out or none answered. `RemoteSnapshotExporter` already runs in every
window (it is in `App`), so nothing changes in the renderer.

The snapshot gains `focus?: { sessionId: string }` — the selected session of the focused
main window, else the leader's. It is what a phone with no place of its own opens on (§3).
`SerializedSessionChatState` already carries the reducer's `history` (`cursor`, `hasMore`;
`chat-types.ts:917`), which is what lets the phone's scroll-up paging continue from where
the desktop's reducer is (§4).

### 3. First connect opens what the desktop shows; a reconnect keeps the phone's place (Q-2, batch-1 Q-3)

**Today.** The phone lands on whichever `session:created` arrived last
(`App.tsx:1059` calls `setSessionId` for every unknown session) or `list[0]` (`:1947`).
It keeps its place on reconnect only because those handlers dedupe — by accident.

**New.** In remote mode App does not select on `session:created` during `restoring`. When
`chat:hydrate` lands: if the phone has a stored place for this host (`localStorage`
`youcoded-remote-place:<hostId>`, written on every selection change) and that session is in
the snapshot, select it; else select `snapshot.focus.sessionId`; else the first session.
The stored place makes "keep my place" survive a page reload, not only a socket drop.

### 4. The computer's copy is the only source (S-1)

**Today.** After hydrate, App still requests its own first history page
(`App.tsx:1911` → `loadFirstPage`), and `HISTORY_PAGE_LOADED` prepends a replayed page
whose tool-group and turn ids carry the client's `ID_EPOCH`, not the host's, so entries
the uuid dedup does not cover can appear twice.

**New.** In remote mode the first page is never requested; the snapshot's `history` field
(already serialized, §2) seeds `cursor`/`hasMore`, so scrolling up requests the *next older* page through the
already-bridged `transcript:page`, which prepends entries the snapshot does not hold. A
regression test pins: hydrate then a page load produces no duplicate tool group.

### 5. The chat/terminal switch is each screen's own (Q-4)

`App.tsx:2793` broadcasts `switch-view` to a paired Android phone; a browser never
followed. The broadcast and its Android-side handler go; the phone's own toggle is the
only writer. No new channel.

### 6. Where the phone's copy stands: `remote:conversation-status` and `remote:rehydrate`

The strip on the branch reads a push `{ phase }` and calls `remote.rehydrate()`. Both
come from the **shim**, which alone knows the connection's state:

| phase | when the shim emits it |
|---|---|
| `reconnecting` | connection state leaves `connected` after a first successful connect |
| `restoring` | `auth:ok`, until the hydrate is applied; also on Refresh |
| `incomplete` | `chat:hydrate` arrived `degraded`, or 10 s pass after `client:ready` with no hydrate |
| `complete` | a non-degraded hydrate was applied |

`remote:rehydrate` is a request the host answers by running §1's sequence again for that
client only (snapshot → `chat:hydrate`; buffers are not replayed twice). The reducer's
"ignore an empty snapshot" guard (`chat-reducer.ts:767`) stays; the shim reports
`incomplete` for that case so the person is told (Q-3) instead of nothing.

Surfaces: preload declares `on.remoteConversationStatus` (never fires on the desktop) and
`remote.rehydrate` (desktop IPC answers `{ ok: false, code: 'not-remote' }`); the shim
implements both; the host handles `remote:rehydrate`; Android's catch-all answers
unsupported — the android-local shim never asks, and the rule (`ipc-bridge.md`) accepts
the final `else` as the honest answer.

### 7. A reconnect is cheap

**Today.** Every reconnect re-sends the whole PTY buffer (4 MB per session, `:65`) and up
to 10 000 hook events per session (`:80`).

**New.** On a *re*connect (the client says so in `client:ready { reconnect: true }`), PTY
replay sends the last 256 KB per session (`PTY_REPLAY_RECONNECT_BYTES`) — the terminal's
scrollback beyond that was on screen before the drop and the desktop still has all of it —
and hook replay sends only unresolved permission requests. A first connect keeps the full
replay. **Decision:** a number chosen, not measured; the design review may move it.

## Batch 3 — file reading

### 8. The file channels answer over remote, from the same code the desktop uses

**Today.** `remote-server.ts` has a case for `artifacts:list-projects-index` only
(`:2945`, sharing `listProjectsIndex`); `artifacts:list-session`, `list-all-files`,
`list-project`, `get`, `read-binary`, `search-content`, `check-existence`,
`watch-project`/`unwatch-project` and `project:list-context`, `read-context-file`,
`list-conversations`, `repo-info` fall to the `default:` unsupported answer (`:2999`).
Their bodies live inline in `ipc-handlers.ts` (`:4493`–`:5174`).

**New.** The bodies move to `main/artifacts/read-service.ts` as plain async functions —
`listSessionFiles`, `listAllFiles`, `listProjectFiles`, `readArtifactText`,
`readArtifactBytes`, `searchArtifactContent`, `checkArtifactExistence` — and
`main/project-read-service.ts` for the four `project:*` reads. `ipcMain.handle` and the
remote `case`s both call them, so the two transports cannot drift (the batch-1 pattern,
`listProjectsIndex`). Every authorization stays where it is: `authorizeArtifactRead`
(symlink-resolved), `evaluateBinaryRead` (roots + tracked externals, `isSensitivePath`
first). Same roots, same denylist as the desktop (Q-5); no remote-only allowlist.

`watch-project` over remote registers the project watcher for that client and unwatches on
socket close; `artifacts:changed` is broadcast to WS clients wherever it is sent to
windows today (`ipc-handlers.ts` APPEND_VERSION sites, `project-watcher.ts`) so a phone's
list updates live (Q-9). After a client's hydrate the host sends one
`artifacts:changed { projectRoot: null }` so open lists refresh after a reconnect.

### 9. The phone's limits, and the too-large answer (Q-6, Q-8)

`src/shared/remote-file-limits.ts` (on the branch): text 1 MB, images / PDF / documents
10 MB. In the remote `case`s only, `readArtifactText` and `readArtifactBytes` are asked
with `{ maxBytes }`; over the limit they answer `{ ok: false, error: 'too-large',
sizeBytes, limitBytes }` **before reading the file** (`stat` first), never a prefix. The
desktop's own limits (`EDIT_MAX_BYTES` 3 MB, `FULL_READ_MAX_BYTES` 12 MB, 50 MB binary) are
untouched. The renderer already renders the card from that shape (`RemoteFileCard`,
`useArtifactContent`, `useArtifactBytes`).

### 10. Download: a one-time link, always saved, never displayed (Q-7, S-1)

**Today.** The HTTP side of `remote-server.ts` (`sendStatic`, `:795`) serves the built
renderer and `/remote-state`, unauthenticated; the only authentication is the WebSocket
`auth` message. Nothing streams; a 50 MB binary today would be 67 MB of base64 in one
frame.

**New.** `artifacts:download { absolutePath }` over the authenticated socket:
1. authorize exactly as a binary read (§8), `stat` for the size;
2. mint a token — 32 random bytes, base64url — stored in memory as
   `{ token, deviceId, canonicalPath, expiresAt: now + 60 s, used: false }`;
3. reply `{ ok: true, url: '/download/<token>', name, sizeBytes }`.
The shim opens the URL through an `<a download>` click, so the browser's own download UI
shows progress and the finished file. `GET /download/<token>`:
- unknown, expired, used, or minted for a device whose record is now `revokedAt` → 404
  with an empty body (no hint whether the token ever existed);
- otherwise streams the file with `fs.createReadStream`, honouring `Range`, with
  `Content-Disposition: attachment; filename*=UTF-8''<name>`, `Content-Type:
  application/octet-stream`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
  A file is never displayed by the browser, whatever its extension — that is the
  save-only promise of S-1; the token is marked used when the response ends.
- at most 2 streams per device at once; a third `artifacts:download` answers
  `{ ok: false, error: 'busy' }` and the card says so.
Tokens die with the process (host restart) and with `remote:devices:unpair`.

**Decision — no second origin.** S-1 (9/9 yes) settled that previews are sealed as on the
desktop: `HtmlView.tsx:40` renders web pages in `sandbox="allow-scripts allow-popups
allow-forms"` with no `allow-same-origin`, which gives the page an opaque origin; images,
PDFs and documents render from bytes and run nothing. A pinning test asserts the sandbox
attribute never gains `allow-same-origin`. The download route above never serves a file
inline, so nothing a file contains ever runs as the app.

### 11. The list surfaces already on the branch

`FilesTab` and `SessionDrawer` show an error with Retry when a list rejects (no more
endless spinner, no more "Nothing here yet"); `+ Add file` is not offered over remote;
Download sits where Open and Reveal sit; the drawer on a phone shows the file on tap with
"‹ Files" back. Nothing more to build there; the remote cases in §8 are what make them
fill.

## Cross-platform surface

| channel | preload | ipc-handlers | shim | remote-server | Android |
|---|---|---|---|---|---|
| `client:ready` (client → host, no reply) | — | — | sends | handles | — |
| `remote:conversation-status` (push) | `on.` declared, never fires | — | emits | — | — |
| `remote:rehydrate` | declared | `{ok:false, code:'not-remote'}` | invokes | handles | else → unsupported |
| `artifacts:list-session`, `list-all-files`, `list-project`, `get`, `read-binary`, `search-content`, `check-existence`, `watch-project`, `unwatch-project` | exist | call read-service | exist | **new cases** → read-service | exist (own impl) |
| `project:list-context`, `read-context-file`, `list-conversations`, `repo-info` | exist | call project-read-service | exist | **new cases** | else → unsupported (today) |
| `artifacts:download` | declared | `{ok:false, code:'not-remote'}` | invokes; opens the url | handles; mints | else → unsupported |
| `artifacts:changed` (push) | exists | — | listens (exists) | **broadcasts** | — |
| `GET /download/<token>` | — | — | — | **new route** | — |

`tests/remote-channel-parity.test.ts` (every channel the shim invokes has a host case)
covers the new cases mechanically; the MOCK_ONLY rows for `on.remoteConversationStatus`,
`remote.rehydrate` and `artifacts.download` come off when the real channels land.

## Tests, regression before fix

1. **Readiness:** a client whose `chat:hydrate` listener registers 300 ms after `auth:ok`
   still receives the hydrate (today: dropped). A transcript event broadcast during the
   snapshot wait is applied once, after the hydrate. No `setTimeout(…, 500)` in
   `replayBuffers` (source guard via `guard-scope.ts`).
2. **Windows:** two registered windows, a session owned by the second: the merged snapshot
   holds the second window's copy. Window 1 destroyed: the snapshot is non-empty and not
   degraded. One window timing out: `degraded: true`.
3. **Place:** first connect selects `focus.sessionId`; reconnect with a stored place that
   still exists keeps it; stored place gone → focus.
4. **Single source:** hydrate followed by an older page produces no duplicate tool-group
   or turn key.
5. **Status:** the shim emits the four phases in order across drop → reconnect → hydrate;
   a degraded hydrate emits `incomplete`; `remote:rehydrate` re-sends a hydrate to that
   client only.
6. **Reconnect cost:** a reconnecting client receives at most 256 KB of PTY per session
   and only unresolved permission requests.
7. **Files:** each new host case answers what the IPC handler answers for the same
   fixture (one table-driven test over read-service); over remote a 1.5 MB text file
   answers `too-large` with `sizeBytes`; a 24 MB PDF the same; a sensitive path answers
   `not-allowed` on both transports; `artifacts:changed` reaches a WS client.
8. **Download:** token used twice → 404; expired → 404; unpaired device → 404; the
   response carries `attachment` and `nosniff` for a `.html` file; `Range` honoured; a
   third concurrent download answers `busy`.
9. **Sealed:** `HtmlView`'s `sandbox` attribute contains no `allow-same-origin`
   (source guard, known-positive: it contains `allow-scripts`).
10. **Android:** unchanged; `./gradlew test` stays green.

## Not in this batch

Uploads and editing; the polish items the tester filed (`user-interface.md`); the
first-connect bundle split (deferred by Destin, `remote-access.md`); a second origin for
previews (S-1 chose against); Windows/macOS runtime proof (this machine is Linux).

## Still to prove at runtime

A phone pass on the built branch **before** the code reviewer and the second UX tester
(batch 1's lesson: six defects reached Destin past every test). Specifically: a real drop
(airplane mode) and reconnect on the phone; a refresh while the desktop is busy; a 20 MB
download on the phone's own download bar; a session detached to a second desktop window
showing on the phone.
