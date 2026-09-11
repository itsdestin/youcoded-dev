---
status: draft
branch: session/remote-first-connect
---

# Remote access, batches 2 and 3 — conversation restoration and file reading

Revision 2. Round 1 of review found 16 problems, all accepted
(`docs/active/reviews/2026-09-10-remote-batch-2-3-design-review-1.md`); the three
structural ones — a whole-state replace that wiped conversations on a partial snapshot, a
queue that held only transcript events, and a "no timer" that dropped the terminal — are
the reason §1, §2 and §6 read differently from revision 1.

Covers batches 2 and 3 of `2026-09-09-remote-access-first-milestone.md`. Every "today"
claim was read against app HEAD `cbe8b4e8` on this branch (master `f1380a3d` plus the
mockup commits). The user-facing promises are the 21 rows of
`docs/active/design/2026-09-10-remote-batch-2-3/remote-batch-2-3.contract.json`, signed
2026-09-10; where a row and this design disagree, the row wins.

Approved UI (review deck 2026-09-10, 9/9 yes; questions deck 12/12): a strip above the chat
for reconnecting / catching up / out of date (with Refresh) / up to date; Projects → Files
and Session Files working on the phone as on the desktop; Download in place of Open and
Reveal; a card with name, size, kind and Download for a file over the phone's limit; a
notice when a download starts. The mockups are on the branch, drawn with the app's own
parts; this design is the backend under them.

## What the user gets

A phone that shows the conversation as it is on the computer, from whichever window holds
it, opening on what the desktop is showing. After a drop, a line says it is reconnecting;
after a refresh that did not finish, a line says the copy may be out of date and offers
Refresh; after a refresh, "Up to date." The chat fills in when the phone is ready, not
after a timer — and never disappears because a refresh was incomplete. Files: the same
lists the desktop has, previews under the phone's limit, a card with Download above it, and
a download that is always saved, never displayed, and can be paused and resumed.

## Batch 2 — conversation restoration

### 1. The phone tells the computer when it is ready (S-2, R6)

**Today.** `remote-server.ts:1012` `replayBuffers()` runs the moment auth succeeds: a
`session:list:response` nothing reads, `session:created` per session, `status:data`, then
`await requestSnapshot()` (2 s timeout in `chat-snapshot.ts`), then `chat:hydrate`, then a
hard-coded 500 ms timer before the PTY and hook buffers replay. `index.tsx:237` mounts
`App` only when `connected` flips on `auth:ok`, so App's listeners register *after* the
first of those messages went out; the 500 ms is the host guessing how long React takes.
Broadcasts reach a client from `addClient` onward (`:3067`), so live events during the
snapshot wait are applied and then discarded by the whole-state replace
(`chat-reducer.ts:761`). The shim's `dispatchEvent` (`remote-shim.ts:517`) has no backlog:
an event with no listener is gone, and the per-session `pty:output:<sid>` listeners are
React effects (`App.tsx:1841`, `TerminalView.tsx:534`) that register after commit.

**New — three pieces, all needed.**

*A. `client:ready { seq, reconnect, ptyOffsets }`.* The shim sends it (no id, no reply) the
first time a listener is added for `chat:hydrate` after `auth:ok`, and immediately after
`auth:ok` on a reconnect (the listener is still registered). `seq` is a per-connection
counter the host echoes in `chat:hydrate` (§6); `reconnect` says the client held state
before; `ptyOffsets` is per session how much terminal it already holds (§7). App changes
nothing.

*B. A per-client phase on the host: `restoring` → `live`.* A fresh client starts
`restoring`. Every broadcast to a restoring client is **queued in arrival order**, except
`pty:output` and, on a first connect only, `hook:event` — those two are in the buffers the
flush replays. On `client:ready` the host sends `session:created` per session,
`session:renamed`, `status:data`, requests the snapshot (§2), sends `chat:hydrate { seq }`,
replays the PTY (§7) and hook buffers, flushes the queue, and moves the client to `live`.
The queue is bounded (2,000 messages); overflowing drops the oldest and marks the hydrate
`degraded`, so the strip says the copy may be out of date. A `session:created` or
`session:destroyed` in that window therefore reaches the phone (R1-2).

*C. A shim-side backlog for the terminal.* `pty:output:<sid>` and `pty:raw-bytes:<sid>`
events that arrive before any listener for that channel exists are kept in a bounded
per-session backlog (256 KB) and drained on the first `addListener` for the channel
(R1-3). That, not a timer, is what makes "replay at once" safe: the reducer takes
`hook:event` synchronously, and the terminal takes its bytes as soon as it mounts.

*Old client.* A client that never sends `client:ready` gets today's sequence after 5 s,
timer and all — a downgrade, not a hang. The `session:list:response` with id `_replay` is
deleted; nothing reads it (`remote-shim.ts:536`).

### 2. The snapshot comes from every window, and a session from its owner (Q-1, R1)

**Today.** `main.ts:285` asks `mainWindow` only — assigned once at `:907`, never cleared —
so a session detached to a second window (`main.ts:1143` routes events to
`windowRegistry.getOwner(sessionId)`) reaches the phone stale or empty, and once window 1
closes the answer is `{ sessions: [] }` with no `degraded` flag. Every window seeds a key
for every session from `session.list()` (`App.tsx:1948`) and only the owner's copy has the
events, so a merge "by whichever window has it" would pick empty copies (R1-1).

**New.** `requestSnapshot` asks every main window in the registry's directory
(`windowRegistry.getDirectory()`) in parallel, one shared 2 s budget, and merges **by
owner**: for each session, the copy from `getOwner(sessionId)`'s window; unowned → the
`mainWindow` fallback's window (that is where `main.ts:1150` sends its events) → else the
leader's. A session whose owner did not answer is **omitted** from the snapshot and the
snapshot is marked `degraded: true`; the reducer then keeps the phone's copy of it (§6).
A session a window has just inherited from a closed window (`window-registry.ts:176`
`markInheritedByTransfer`) has an empty reducer copy until its first page loads:
`RemoteSnapshotExporter` marks such a session `pending: true` (also while
`history.loading`), the host treats a pending session like an unanswered one (omitted,
`degraded`), and Refresh picks the settled copy up (R1-13).

The snapshot gains `focus?: { sessionId }` — the focused main window's selected session,
else the leader's — for §3. `history` (`cursor`, `hasMore`) and `seenUuids` are already
serialized (`chat-types.ts:917`, `:964`), which §4 relies on.

### 3. First connect opens what the desktop shows; a reconnect keeps the phone's place (Q-2, batch-1 Q-3, R2)

**Today.** The phone lands on whichever `session:created` arrived last (`App.tsx:1081`
calls `setSessionId` for every unknown session) or `list[0]` (`:1976`, `:2159`); it keeps
its place on reconnect only because those handlers dedupe.

**New.** In remote mode App does not select on `session:created` while `restoring`. When
`chat:hydrate` lands: the phone's stored place, if that session is in the snapshot; else
`snapshot.focus.sessionId`; else the first session. The place is kept per **tab** in
`sessionStorage` and mirrored to `localStorage` under `youcoded-remote-place:<hostId>`
as the reload fallback, where `hostId` is the stored `youcoded-remote-target`
(`remote-shim.ts:1062`) — two tabs on one phone no longer move each other (R1-12). When
the phone's current session is destroyed, `session:destroyed` carries `focus` (the host
reads it the same way as §2) and the phone moves there — R2's second threshold (R1-11).

### 4. The computer's copy is the only source (S-1, R5)

**Today.** After hydrate App still requests its own first history page (`App.tsx:1911`
→ `loadFirstPage`); `HISTORY_PAGE_LOADED` prepends a replayed page whose tool-group and
turn ids carry the client's `ID_EPOCH`, so entries the uuid dedup does not cover appear
twice.

**New.** In remote mode the first page is never requested; the snapshot's `history` seeds
`cursor`/`hasMore`, so scrolling up requests the next older page through the bridged
`transcript:page` (`remote-server.ts:1947`), which prepends entries the snapshot does not
hold. Test: hydrate then a page load produces no duplicate tool-group or turn key.

### 5. The chat/terminal switch is each screen's own (Q-4, R4)

**Today — inverted from revision 1.** `App.tsx:2824` broadcasts `switch-view` only when the
platform is Android: the *phone app's* toggle moves the desktop and every other client
(`remote-server.ts:2880` relays it into the windows; `App.tsx:1649` applies it to whatever
session that window shows). A browser never followed anything (R1-9).

**New.** Delete the Android-only broadcast (`App.tsx:2822-2825`) and the `switch-view`
branch of the `uiAction` receiver (`:1649-1657`); leave the `_SESSION_INITIALIZED` relay.
R4's check on Android becomes: toggle on the phone, and neither the desktop nor a second
phone moves.

### 6. Where the phone's copy stands: `remote:conversation-status`, `remote:rehydrate`, and a per-session apply (Q-3, R3, R14, R15)

The strip on the branch reads a push `{ phase }` and calls `remote.rehydrate()`. Both come
from the **shim**, which alone knows the connection's state:

| phase | when the shim emits it |
|---|---|
| `reconnecting` | connection state leaves `connected` after a first successful connect |
| `restoring` | `auth:ok`, until the hydrate it asked for is applied; also on Refresh |
| `incomplete` | the hydrate arrived `degraded`, or 10 s pass after `client:ready` with none |
| `complete` | a non-degraded hydrate was applied |

**Refresh is a restore.** `remote:rehydrate { seq }` moves that client back to `restoring`
(queue on), takes the snapshot, sends `chat:hydrate { seq }`, flushes, and returns it to
`live` — §1's sequence minus the buffer replay. The shim applies only a hydrate whose
`seq` is the latest it sent, so a Refresh racing a reconnect cannot apply an older
snapshot after a newer one (R1-4).

**The reducer applies per session, never whole-state, when the snapshot is degraded.**
`HYDRATE_CHAT_STATE` keeps the replace for a complete snapshot; for `degraded: true` it
replaces only sessions the snapshot holds with a non-empty copy, keeps the client's copy
of every other session, and deletes nothing (R1-1). The "ignore an empty snapshot" guard
(`chat-reducer.ts:767`) stays; the shim reports `incomplete` for that case so the person
is told (R3) instead of nothing.

Surfaces: preload declares `on.remoteConversationStatus` (never fires on the desktop) and
`remote.rehydrate` (desktop IPC answers `{ ok: false, code: 'not-remote' }`); the shim
implements both; the host handles `remote:rehydrate`; Android's catch-all answers
unsupported — the android-local shim never asks (`ipc-bridge.md` accepts the final `else`).

### 7. A reconnect is cheap and does not duplicate the terminal (R6)

**Today.** Every reconnect re-sends the whole PTY buffer (4 MB of UTF-16 units per
session, `remote-server.ts:59-66` — the constant says bytes and measures code units) and
up to 10 000 hook events; `TerminalView` never resets, so the replay is appended to what
the terminal already shows (R1-10).

**New.** The host buffer keeps a per-session monotonic offset (units since the session
started). `client:ready.ptyOffsets[sid]` is how far the phone already has. If the host
still holds everything past that offset it sends only that tail; otherwise it sends
`pty:reset` (the terminal calls `reset()`) followed by the full buffer. Cuts land only on
chunk boundaries — never inside an escape sequence or a surrogate pair. On a reconnect the
hook replay sends only unresolved permission requests; a first connect keeps the full
replay. `PTY_BUFFER_SIZE` is renamed `PTY_BUFFER_UNITS`.

## Batch 3 — file reading

### 8. The file channels answer over remote, from the same code the desktop uses (R7, R12, R16, R17)

**Today.** `remote-server.ts` has a case for `artifacts:list-projects-index` only
(`:2945`, sharing `listProjectsIndex`); `list-session`, `list-all-files`, `list-project`,
`get`, `read-binary`, `search-content`, `check-existence`, `watch-project`,
`unwatch-project` and `project:list-context`, `read-context-file`, `list-conversations`,
`repo-info` fall to `default:` (`:2999`). Their bodies live inline in `ipc-handlers.ts`
(`:4493`–`:5174`). The project watcher refcounts subscribers by `webContents` id
(`project-watcher.ts:97`, `:194`) and its change sink sends to windows only
(`ipc-handlers.ts:4897`).

**New.** The bodies move to `main/artifacts/read-service.ts` — `listSessionFiles`,
`listAllFiles`, `listProjectFiles`, `readArtifactText`, `readArtifactBytes`,
`searchArtifactContent`, `checkArtifactExistence` — and `main/project-read-service.ts`
for the four `project:*` reads; `ipcMain.handle` and the remote `case`s both call them.
Authorization stays where it is (`authorizeArtifactRead`, symlink-resolved;
`evaluateBinaryRead` with `isSensitivePath` first). Same roots, same denylist (Q-5).

Live refresh (Q-9, R12): each WS client gets its own numeric subscriber id (a negative
counter, so it can never collide with a `webContents` id); `watch-project` over remote
calls `watchProject(root, id)`, socket close calls `dropSubscriber(id)`; the watcher's one
sink in `initProjectWatchers` gains `remoteServer.broadcast({ type: 'artifacts:changed',
payload })` beside its window sends (R1-14). After a client's hydrate the host sends one
`artifacts:changed { projectRoot: null }`; the renderer's handler treats a null root as
"reload what you show".

### 9. The phone's limits, and the too-large answer (Q-6, Q-8, R8, R11, R19)

`src/shared/remote-file-limits.ts` (on the branch): text 1 MB; images, PDFs and documents
10 MB. In the remote `case`s only, `readArtifactText` and `readArtifactBytes` take
`{ maxBytes }`: after authorization they `stat` first and, over the limit, answer
`{ ok: false, error: 'too-large', sizeBytes, limitBytes }` without reading — never a
prefix. The desktop's own limits are untouched. The renderer already renders the card
from that shape.

### 10. Download: a short-lived link, always saved, never displayed, resumable (Q-7, S-1, R9, R10, R18, R20)

**Today.** The HTTP side of `remote-server.ts` (`sendStatic`, `:795`) serves the built
renderer and `/remote-state`, unauthenticated; the only authentication is the WebSocket
`auth` message. Nothing streams.

**New.** `artifacts:download { absolutePath, projectRoot?, artifactId? }` over the
authenticated socket:

1. **Policy, stated:** `isSensitivePath` refuses first; then allowed if `evaluateBinaryRead`
   says `allowed`, or — when `projectRoot` and `artifactId` are given — if
   `authorizeArtifactRead` says ok (the drawer lists tracked internal text files the
   binary rule alone would refuse, R1-7). **No size gate**: R9 is "a large download".
2. Mint a token: 32 random bytes, base64url, kept in memory as
   `{ token, deviceId, socketId, canonicalPath, expiresAt: now + 5 min }`. Not single-use:
   256 bits of entropy is the secret, and a paused or dropped download re-requests the
   same URL (R1-5).
3. Reply `{ ok: true, url, name, sizeBytes }` where `url` is **absolute**, built from the
   stored `youcoded-remote-target` — a relative path resolves against `file://` in the
   Android app (R1-8).

The shim opens the URL through an `<a download>` click, so the browser's own download UI
shows progress and the finished file. In the Android app the WebView has no download
listener (`WebViewHost.kt` sets only `shouldOverrideUrlLoading`), so it gains a
`DownloadListener` that hands the URL to `DownloadManager` — a Kotlin change, and the one
Android change in this batch.

`GET /download/<token>`:
- unknown, expired, or minted for a device whose record is `revokedAt` → 404, empty body;
- re-canonicalize the stored path, refuse if it no longer matches or is now sensitive,
  open with `fs.open` and `fstat` the handle before streaming (no TOCTOU on the name);
- stream with `fs.createReadStream` from the handle, honouring `Range` (206; 416 when
  unsatisfiable), with `Content-Disposition: attachment; filename="<ascii fallback>";
  filename*=UTF-8''<encodeURIComponent(name)>` (name from `path.basename(canonicalPath)`,
  the fallback stripped of `"`, `\` and control characters — R1-6), `Content-Type:
  application/octet-stream`, `X-Content-Type-Options: nosniff`, `Cache-Control:
  no-store`. A file is never displayed by the browser, whatever its extension — S-1's
  save-only promise;
- at most 2 **live** streams per socket, counted up on open and down on `res 'close'`,
  with `stream.destroy()` on a client abort; a third `artifacts:download` answers
  `{ ok: false, error: 'busy' }` and the card says so.

Tokens die with the process and with `remote:devices:unpair` (R10). A host restart
mid-download: the stream ends, the next request gets 404, the socket reconnects and the
strip says reconnecting; Download mints a fresh link.

**Decision — no second origin (S-1, 9/9 yes).** `HtmlView.tsx:42` renders web pages in
`sandbox="allow-scripts allow-popups allow-forms"` with no `allow-same-origin`, which gives
the page an opaque origin; images, PDFs and documents render from bytes and run nothing. A
pinning test asserts the sandbox attribute never gains `allow-same-origin`. The download
route never serves a file inline, so nothing a file contains ever runs as the app.

### 11. The list surfaces already on the branch (R16–R19, R21)

`FilesTab` and `SessionDrawer` show an error with Retry when a list rejects; `+ Add file`
is not offered over remote; Download sits where Open and Reveal sit; the drawer on a phone
shows the file on tap with "‹ Files" back; the window caption buttons are decided at
render. Nothing more to build there; §8's cases are what make the lists fill.

## Cross-platform surface

| channel | preload | ipc-handlers | shim | remote-server | Android app (Kotlin) |
|---|---|---|---|---|---|
| `client:ready` (client → host) | — | — | sends | handles | — |
| `pty:reset` (push) | declared, never fires | — | listens; `TerminalView` resets | sends | — |
| `remote:conversation-status` (push) | declared, never fires | — | emits | — | — |
| `remote:rehydrate` | declared | `{ok:false, code:'not-remote'}` | invokes | handles | else → unsupported |
| `artifacts:list-session`, `list-all-files`, `list-project`, `get`, `read-binary`, `search-content`, `check-existence`, `watch-project`, `unwatch-project` | exist | call read-service | exist | **new cases** → read-service | exist (own impl) |
| `project:list-context`, `read-context-file`, `list-conversations`, `repo-info` | exist | call project-read-service | exist | **new cases** | else → unsupported |
| `artifacts:download` | declared | `{ok:false, code:'not-remote'}` | invokes; opens the absolute url | handles; mints | else → unsupported; **`DownloadListener` → `DownloadManager`** in the WebView host |
| `artifacts:changed` (push) | exists | — | listens (exists) | **broadcasts from the watcher sink** | — |
| `session:destroyed` (push) | exists | — | exists | payload gains `focus` | — |
| `GET /download/<token>` | — | — | — | **new route** | — |

`tests/remote-channel-parity.test.ts` covers the new cases mechanically; the MOCK_ONLY
rows for `on.remoteConversationStatus`, `remote.rehydrate` and `artifacts.download` come
off when the real channels land.

## Tests, regression before fix

1. **Readiness.** A client whose `chat:hydrate` listener registers 300 ms after `auth:ok`
   receives the hydrate *before* the 5 s fallback; a client that never sends
   `client:ready` receives nothing until the fallback, then today's sequence. A
   `session:created` and a `transcript:event` broadcast between `client:ready` and
   `chat:hydrate` reach the client after the hydrate, in order, the transcript event
   applied once. No `setTimeout(…, 500)` in `replayBuffers` (source guard via
   `guard-scope.ts`, known-positive: the 5 s fallback timer).
2. **Terminal backlog.** A `pty:output:<sid>` dispatched before any listener is delivered
   on the first `addListener`; the backlog caps at 256 KB.
3. **Windows.** Two windows, session 2 owned by window 2: the merged snapshot holds window
   2's copy of session 2. Window 2 times out: session 2 is omitted, `degraded: true`, and
   the reducer keeps the phone's copy of session 2. `mainWindow` destroyed: the snapshot
   is non-empty and not degraded when every owner answered (today: `{ sessions: [] }`
   with no flag — the claim at `main.ts:285`). A pending session is omitted and degrades.
4. **Place.** First connect selects `focus.sessionId`; reconnect with a stored place that
   exists keeps it; place gone → focus; the current session destroyed → the `focus` in the
   payload; two tabs keep separate places.
5. **Single source.** Hydrate followed by an older page produces no duplicate tool-group
   or turn key.
6. **Status and refresh.** The shim emits reconnecting → restoring → complete across a
   drop; a degraded hydrate emits `incomplete`; `remote:rehydrate` re-enters `restoring`,
   a transcript event broadcast during the refresh is applied once, and a hydrate whose
   `seq` is stale is ignored.
7. **Reconnect cost.** A reconnecting client with `ptyOffsets` receives only the tail past
   its offset; an offset the host no longer holds gets `pty:reset` then the full buffer;
   no cut lands inside a chunk; only unresolved permission requests are replayed.
8. **Files.** One fixture, both transports driven end to end — `handleMessage` with a fake
   socket and the registered `ipcMain.handle` — answer the same for each channel except
   the remote `maxBytes` divergence, which the test expects: a 1.5 MB text file and a
   24 MB PDF answer `too-large` with `sizeBytes` over remote and content on IPC; a
   sensitive path answers `not-allowed` on both; `artifacts:changed` from the watcher sink
   reaches a WS client; a socket close drops its watcher subscription.
9. **Download.** A paused download resumed with `Range` completes; a client abort releases
   the live-stream slot; a third concurrent request answers `busy`; expired → 404;
   unpaired device → 404; a `.html` file carries `attachment` and `nosniff`; a name
   containing `"; \r\n` and an emoji produces a valid header; a 60 MB file downloads; a
   listed tracked-internal text file downloads; a path made sensitive after minting
   answers 404 at GET; host restart → 404 and a fresh mint works.
10. **Sealed.** `HtmlView`'s `sandbox` attribute contains no `allow-same-origin`
    (known-positive: it contains `allow-scripts`).
11. **Backpressure.** A 4 MB replay to a socket whose `bufferedAmount` stays high does not
    block other clients' messages.
12. **Android.** `./gradlew test` green after the `DownloadListener` change; a unit test
    that the listener hands an `https?://` URL to `DownloadManager` and ignores others.

## Not in this batch

Uploads and editing; the polish items the tester filed (`user-interface.md`); the
first-connect bundle split (deferred by Destin, `remote-access.md`); a second origin for
previews (S-1 chose against); Windows/macOS runtime proof (this machine is Linux).

## Still to prove at runtime

A phone pass on the built branch **before** the code reviewer and the second UX tester
(batch 1's lesson: six defects reached Destin past every test). Specifically: a real drop
(airplane mode) and reconnect on the phone with the terminal open; a Refresh while the
desktop is busy; a 20 MB download paused and resumed on the phone's own download bar; a
session detached to a second desktop window showing on the phone; the Android app paired
to the desktop downloading a file.
