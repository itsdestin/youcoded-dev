---
status: draft
branch: session/remote-first-connect
---

# Remote access, batches 2 and 3 — conversation restoration and file reading

Revision 3. Two review rounds so far: 16 and 19 findings, all accepted
(`docs/active/reviews/2026-09-10-remote-batch-2-3-design-review-{1,2}.md`). Round 1
reshaped the restore half (per-session apply, queue everything, a terminal backlog);
round 2 closed a symlink hole in file authorization, made the Android download reach the
download manager, made resume actually resumable, and pinned down where the queue's cut
line sits relative to the snapshot. Round 3 is a targeted pass over §1, §6, §7 and §10.

Covers batches 2 and 3 of `2026-09-09-remote-access-first-milestone.md`. Every "today"
claim was read against app HEAD `cbe8b4e8` on this branch. The user-facing promises are
the 21 rows of `docs/active/design/2026-09-10-remote-batch-2-3/remote-batch-2-3.contract.json`,
signed 2026-09-10; where a row and this design disagree, the row wins.

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
after a timer, never shows a message twice, never shows a permission card the computer
already answered, and never disappears because a refresh was incomplete. Files: the same
lists the desktop has, previews under the phone's limit, a card with Download above it, and
a download that is always saved, never displayed, and can be paused and resumed — on a
phone browser and in the Android app alike.

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
React effects (`App.tsx:1841`, `TerminalView.tsx:534`) that register after commit. The
shim's stale-socket guard covers `auth:ok` only (`:783`); a late message from a socket the
connect timeout abandoned (`:748`) is still dispatched.

**New — three pieces, all needed.**

*A. `client:ready { seq, reconnect, ptyOffsets }`.* The shim sends it (no id, no reply) the
first time a listener is added for `chat:hydrate` after `auth:ok`, and immediately after
`auth:ok` on a reconnect (the listener is still registered). `seq` is a counter that is
**monotonic for the shim's lifetime**, never reset per connection; the host echoes it in
`chat:hydrate` (§6). `reconnect` says the client held state before; `ptyOffsets` is per
session `{ epoch, units }` (§7). App changes nothing. `handleMessage` is stamped with the
connection generation and drops a message from any other socket (R2-17).

*B. A per-client phase on the host: `restoring` → `live`.* A fresh client starts
`restoring`. Every broadcast to a restoring client is **queued in arrival order**, except
`pty:output` and, on a first connect only, `hook:event` — those two are in the buffers the
flush replays. On `client:ready` the host: cancels the old-client fallback timer; sends
`session:created` per session, `session:renamed`, `status:data`; records
`snapshotIndex = queue.length`; requests the snapshot (§2); sends `chat:hydrate { seq }`;
replays the PTY (§7) and hook buffers; flushes the queue; moves the client to `live`.

*The cut line (R2-5).* Main hands each event to the owning window and broadcasts it in the
same synchronous handler, so every queued event below `snapshotIndex` was in that window's
reducer when it serialized. On flush, `transcript:event`, `transcript:shrink` and
`native:*` entries below `snapshotIndex` are skipped — the uuid dedup does not cover the
native harness's per-delta text (`chat-reducer.ts:415`) — while lifecycle entries
(`session:*`, `status:data`, `hook:event`, `specialists:event`, `native:shell-event`) are
flushed from the whole window. For a session the snapshot **omitted** (§2), nothing is
skipped: its copy is the client's, which lacks them. The queue is bounded (2,000
messages); overflowing drops the oldest and marks the hydrate `degraded`.

*A `client:ready` outside `restoring` is logged and ignored* (R2-7): once the fallback has
run, or once the client is `live`, only `remote:rehydrate` leads back into `restoring`.

*C. A shim-side backlog for the terminal.* `pty:output:<sid>` and `pty:reset:<sid>` events
that arrive before any listener for that session exist are kept, in order, in a bounded
per-session backlog (256 KB of units) and drained on the first `addListener` (R1-3). That,
not a timer, makes "replay at once" safe. (`pty:raw-bytes` is not backlogged: no desktop
host emits it — see Not in this batch.)

*Old client.* A client that never sends `client:ready` gets today's sequence after 5 s,
timer and all. The `session:list:response` with id `_replay` is deleted; nothing reads it.

### 2. The snapshot comes from every window, and a session from its owner (Q-1, R1)

**Today.** `main.ts:285` asks `mainWindow` only — assigned once at `:907`, never cleared —
so a session detached to a second window (`main.ts:1143` routes events to
`windowRegistry.getOwner(sessionId)`) reaches the phone stale or empty; once window 1
closes the answer is `{ sessions: [] }` with no `degraded` flag. Every window seeds a key
for every session (`App.tsx:1948`) and only the owner's copy has the events. Main knows no
window's *selected* session (nothing under `main/` reads one).

**New.** `requestSnapshot` asks every main window in the registry's directory
(`windowRegistry.getDirectory()`) in parallel, one shared 2 s budget, and merges **by
owner**: for each session, the copy from `getOwner(sessionId)`'s window; unowned → the
`mainWindow` fallback's window (where `main.ts:1150` sends its events) → else the leader's.
A session whose owner did not answer is **omitted** and the snapshot is `degraded: true`;
the reducer keeps the phone's copy (§6).

*Pending, decided by the host (R2-14).* A session is omitted (and degrades the snapshot)
when `windowRegistry.isPendingTransfer(sid)` — a non-consuming read of the transfer state
`markInheritedByTransfer` keeps (`window-registry.ts:176`) — or when the exporter reports
`history.loading` for it (read before `serializeChatState` normalises it to `false`).

*Focus, with a source (R2-12).* App sends `session:selected { sessionId }` to main on every
selection change; main caches it per window id (`preload` gains the send; a remote client
never sends it and the host ignores it if one does). The snapshot's `focus.sessionId` is
the cache entry of the focused main window, else the leader's. `history` and `seenUuids`
are already serialized (`chat-types.ts:917`, `:964`), which §4 relies on.

### 3. First connect opens what the desktop shows; a reconnect keeps the phone's place (Q-2, batch-1 Q-3, R2)

**Today.** `session.list()` on mount selects `list[0]` within milliseconds
(`App.tsx:1942-1976`), `session:created` selects every unknown session (`:1081`), and
`:2159` falls back to the first; the phone keeps its place on reconnect only because those
handlers dedupe.

**New.** In remote mode every selection site defers to a `placeDecided` ref that only the
hydrate handler (and `session:destroyed`'s `focus`) sets; until then the phone shows the
strip's "catching up", not a conversation (R2-11). When `chat:hydrate` lands: the phone's
stored place, if that session is in the snapshot; else `snapshot.focus.sessionId`; else
the first session. The place is kept per **tab** in `sessionStorage` and mirrored to
`localStorage` under `youcoded-remote-place:<hostId>` as the reload fallback, where
`hostId` is the paired target's `host:port` when `youcoded-remote-target` is set (the
Android pairing path, `remote-shim.ts:1062`) and `location.host` otherwise — the phone
browser has no stored target (R2-10). When the phone's current session is destroyed,
`session:destroyed` carries `focus` from main's cache; if the cached focus *is* the
destroyed session, the phone falls back to the first remaining one.

### 4. The computer's copy is the only source (S-1, R5)

**Today.** After hydrate App still requests its own first history page (`App.tsx:1940`
→ `loadFirstPage`) for every session; `HISTORY_PAGE_LOADED` prepends a replayed page whose
tool-group and turn ids carry the client's `ID_EPOCH`, so entries the uuid dedup does not
cover appear twice.

**New.** The reducer marks every session the hydrate delivered `history.hydrated: true`,
seeded with the snapshot's cursor; `loadFirstPage` skips marked sessions and behaves as
today for the rest — a session created after the hydrate (a resumed conversation arrives
with its history on disk and its live stream at EOF, `window-registry.ts:164`), or one a
degraded first-connect snapshot omitted, still loads its first page (R2-4). Scrolling up
requests the next older page through the bridged `transcript:page`
(`remote-server.ts:1947`), which prepends entries the snapshot does not hold.

### 5. The chat/terminal switch is each screen's own (Q-4, R4)

**Today.** `App.tsx:2824` broadcasts `switch-view` only when the platform is Android: the
*phone app's* toggle moves the desktop and every other client (`remote-server.ts:2880`
relays it; `App.tsx:1649` applies it). A browser never followed anything.

**New.** Delete the Android-only broadcast (`App.tsx:2822-2825`) and the `switch-view`
branch of the `uiAction` receiver (`:1649-1657`); leave the `_SESSION_INITIALIZED` relay.
R4's check on Android: toggle on the phone, and neither the desktop nor a second phone
moves.

### 6. Where the phone's copy stands: `remote:conversation-status`, `remote:rehydrate`, and a per-session apply (Q-3, R3, R14, R15)

The strip on the branch reads a push `{ phase }` and calls `remote.rehydrate()`. Both come
from the **shim**, which alone knows the connection's state:

| phase | when the shim emits it |
|---|---|
| `reconnecting` | connection state leaves `connected` after a first successful connect |
| `restoring` | `auth:ok`, until the hydrate it asked for is applied; also on Refresh |
| `incomplete` | the hydrate arrived `degraded`, or 10 s pass after `client:ready` with none, or any session was kept from before a drop (§7) |
| `complete` | a non-degraded hydrate was applied and nothing was kept |

**Refresh is a restore.** `remote:rehydrate { seq }` moves that client back to `restoring`
(queue on, `snapshotIndex` recorded), takes the snapshot, sends `chat:hydrate { seq }`,
flushes with the same cut line, and returns it to `live` — §1's sequence minus the buffer
replay. The shim applies only a hydrate whose `seq` is the latest it sent.

**The reducer applies per session, never whole-state, when the snapshot is degraded.**
`HYDRATE_CHAT_STATE` keeps the replace for a complete snapshot; for `degraded: true` it
replaces only sessions the snapshot holds with a non-empty copy, keeps the client's copy of
every other session, and deletes nothing (R1-1). **Both branches keep the client's own
`queuedMessages` per session and any `pending: true` user bubble the transcript has not
echoed** — those are the phone's unsent actions, and a Refresh must never discard them
(R2-13). The "ignore an empty snapshot" guard (`chat-reducer.ts:767`) stays; the shim
reports `incomplete` for that case.

Surfaces: preload declares `on.remoteConversationStatus` (never fires on the desktop) and
`remote.rehydrate` (desktop IPC answers `{ ok: false, code: 'not-remote' }`); the shim
implements both; the host handles `remote:rehydrate`; Android's catch-all answers
unsupported (`ipc-bridge.md` accepts the final `else`).

### 7. A reconnect is cheap, exact, and does not lie about consent (R6)

**Today.** Every reconnect re-sends the whole PTY buffer (4 MB of UTF-16 units per session,
`remote-server.ts:59-66`; the constant says bytes) and up to 10 000 hook events;
`TerminalView` never resets, so the replay is appended to what the terminal already shows.
The hook buffer drops a request when it is resolved (`:675-691`), so a phone that was gone
when the desktop answered a permission still shows the card. `ws.send` never blocks; a
stalled phone grows the host's socket buffer until the liveness ping closes it (`:1000`).

**New.**
- *Offsets with an epoch.* Each session's PTY buffer carries a random `epoch` set at
  creation and a monotonic unit count; every `pty:output` carries the epoch. The phone
  reports `ptyOffsets[sid] = { epoch, units }` in `client:ready`. Matching epoch and a
  held range → the host sends exactly the units past the offset, slicing the first
  partially-covered chunk (the phone already rendered everything before the offset, so a
  cut there splits nothing it has not drawn). Epoch mismatch — restart, or a session
  destroyed and recreated (`:735`) — or units beyond what the host holds →
  `pty:reset:<sid>` then the full buffer, through the same ordered backlog (§1C);
  `TerminalView` calls `reset()` and jumps to the bottom. `PTY_BUFFER_SIZE` is renamed
  `PTY_BUFFER_UNITS`.
- *Consent does not lie (R2-8).* On a reconnect the hook replay sends only unresolved
  permission requests and ends with `hook:replay-complete { sessionId, pendingRequestIds }`;
  App dispatches `PERMISSION_EXPIRED` (`hook-dispatcher.ts:71`) for every card on screen
  not in the list. A session the reducer **kept** from before the drop (degraded apply)
  has stale turn state — `isThinking`, `activeTurnToolIds` — until a Refresh replaces it;
  the strip stays `incomplete` while any session was kept, so the person is told.
- *Backpressure (R2-15).* A per-client send gate: while `ws.bufferedAmount` is above 8 MB
  the replay and the flush pause and resume as it drains; above 32 MB the client is closed
  with a code the strip renders as reconnecting.

## Batch 3 — file reading

### 8. The file channels answer over remote, from the same code the desktop uses (R7, R12, R16, R17)

**Today.** `remote-server.ts` has a case for `artifacts:list-projects-index` only
(`:2945`); `list-session`, `list-all-files`, `list-project`, `get`, `read-binary`,
`search-content`, `check-existence`, `watch-project`, `unwatch-project` and
`project:list-context`, `read-context-file`, `list-conversations`, `repo-info` fall to
`default:` (`:2999`); their bodies are inline in `ipc-handlers.ts` (`:4493`–`:5174`).
`read-binary` authorizes `canonicalize(absolutePath)` — string work
(`shared/artifacts/canonicalize.ts:17`, no `realpath`) — so a symlink under a project root
to `~/.ssh/id_rsa` passes both `isSensitivePath` and the root check (R2-1); only
`authorizeArtifactRead` resolves links (`write-authorization.ts:56`). The project watcher
refcounts subscribers by `webContents` id (`project-watcher.ts:97`) and its sink sends to
windows only (`ipc-handlers.ts:4886`). `artifacts:changed` consumers all filter on a real
root (`FilesTab.tsx:358`, `ActiveArtifactView.tsx:263`).

**New.** The bodies move to `main/artifacts/read-service.ts` — `listSessionFiles`,
`listAllFiles`, `listProjectFiles`, `readArtifactText`, `readArtifactBytes`,
`searchArtifactContent`, `checkArtifactExistence` — and `main/project-read-service.ts`
for the four `project:*` reads; `ipcMain.handle` and the remote `case`s both call them.
**`readArtifactBytes` resolves with `fs.promises.realpath` before `canonicalize` and
`evaluateBinaryRead`**, on both transports — the symlink hole closes for the desktop too.
Same roots, same denylist (Q-5).

Live refresh (Q-9, R12): each WS client gets its own numeric subscriber id (a negative
counter); `watch-project` over remote calls `watchProject(root, id)`, socket close calls
`dropSubscriber(id)`; the watcher's sink in `initProjectWatchers` gains
`remoteServer.broadcast({ type: 'artifacts:changed', payload })`. After a reconnect the
phone re-issues `watch-project` for the root it shows (`useProjectWatch` re-subscribes on a
`connected` transition) and its lists reload: `artifacts:list-all-files` and
`artifacts:list-session` join `REHYDRATE_ON_RECONNECT` (reads only, as that set requires).
The revision-2 "null root nudge" is gone: no handler read it (R2-9).

### 9. The phone's limits, and the too-large answer (Q-6, Q-8, R8, R11, R19)

`src/shared/remote-file-limits.ts` (on the branch): text 1 MB; images, PDFs and documents
10 MB. In the remote `case`s only, `readArtifactText` and `readArtifactBytes` take
`{ maxBytes }`: after authorization they `stat` first and, over the limit, answer
`{ ok: false, error: 'too-large', sizeBytes, limitBytes }` without reading — never a
prefix. The desktop's own limits are untouched.

### 10. Download: a short-lived link, always saved, never displayed, resumable (Q-7, S-1, R9, R10, R18, R20)

**Today.** `handleHttpRequest` (`remote-server.ts:752-790`) serves the built renderer and
`/remote-state` unauthenticated and answers every unknown path with `index.html` 200 (SPA
fallback). The Android WebView's `shouldOverrideUrlLoading` (`WebViewHost.kt:70-76`) hands
every URL that is not local to `ACTION_VIEW`, so a navigation to the host lands in Chrome.

**New.** `artifacts:download { absolutePath, projectRoot?, artifactId? }` over the
authenticated socket:

1. **Policy, stated:** `realpath` the path; `isSensitivePath` on the real path refuses
   first; then allowed if `evaluateBinaryRead` says `allowed`, or — when `projectRoot` and
   `artifactId` are given — if `authorizeArtifactRead` says ok. **No size gate.** `stat` the
   real path and keep `{ dev, ino, size, mtimeMs }` with the token.
2. Mint a token: 32 random bytes, base64url, in memory as `{ token, deviceId, socketId,
   realPath, stat, expiresAt: now + 5 min }`. Not single-use: 256 bits of entropy is the
   secret, and a paused download re-requests the same URL.
3. Reply `{ ok: true, url, name, sizeBytes }` with `url` **absolute**: the paired target's
   origin when `youcoded-remote-target` is set, else `location.origin` (R2-10).

The shim opens the URL through an `<a download>` click, so the browser's own download UI
shows progress and the finished file, and announces the R18 notice.

*Android (R2-2).* In `shouldOverrideUrlLoading`, a URL on the paired host whose path
starts with `/download/` is enqueued on `DownloadManager`
(`setDestinationInExternalPublicDir(DIRECTORY_DOWNLOADS, name)`,
`setNotificationVisibility(VISIBLE_NOTIFY_COMPLETED)`) and the override returns `true`;
everything else keeps today's behaviour. The decision — intercept, download, or open
externally, for a URL and a paired host — is a pure Kotlin function with its own unit
test; the framework call is not what is tested. No separate `DownloadListener`.

`GET /download/<token>`, matched **before** the static handler:
- unknown, expired, or minted for a device whose record is `revokedAt` → 404, empty body;
- `fs.open` the stored real path with `O_NOFOLLOW`, `fstat` the handle, and refuse (404,
  close) when `dev`/`ino` differ from the mint-time stat or the real path is now sensitive
  — that, not the name, closes the race between mint and open (R2-1);
- stream from the handle with `Range` (206; 416 when unsatisfiable), `Accept-Ranges: bytes`,
  `Content-Length`, `ETag: "<dev>-<ino>-<size>-<mtimeMs>"`, `Last-Modified`, and `If-Range`
  honoured (a mismatched validator answers 200 from byte 0) — what Android's download
  manager and Chrome need to resume (R2-3); `Content-Disposition: attachment;
  filename="<ascii fallback>"; filename*=UTF-8''<encodeURIComponent(name)>` with the name
  from `path.basename(realPath)` and the fallback stripped of `"`, `\` and control
  characters; `Content-Type: application/octet-stream`; `X-Content-Type-Options: nosniff`;
  `Cache-Control: no-store`. A file is never displayed by the browser — S-1's save-only
  promise;
- at most 2 **live** streams per socket (by intent: a dropped socket's streams finish and
  release themselves; two tabs are two sockets), counted up on open and down on `res
  'close'`, with `stream.destroy()` on a client abort; a third `artifacts:download` answers
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
| `session:selected` (renderer → main) | sends | caches per window | no-op | ignores | — |
| `pty:reset:<sid>` (push) | declared, never fires | — | backlogs; `TerminalView` resets | sends | — |
| `hook:replay-complete` (push) | declared, never fires | — | listens | sends | — |
| `remote:conversation-status` (push) | declared, never fires | — | emits | — | — |
| `remote:rehydrate` | declared | `{ok:false, code:'not-remote'}` | invokes | handles | else → unsupported |
| `artifacts:list-session`, `list-all-files`, `list-project`, `get`, `read-binary`, `search-content`, `check-existence`, `watch-project`, `unwatch-project` | exist | call read-service | exist; two join `REHYDRATE_ON_RECONNECT` | **new cases** → read-service | exist (own impl) |
| `project:list-context`, `read-context-file`, `list-conversations`, `repo-info` | exist | call project-read-service | exist | **new cases** | else → unsupported |
| `artifacts:download` | declared | `{ok:false, code:'not-remote'}` | invokes; opens the absolute url | handles; mints | else → unsupported; the WebView intercepts `/download/` on the paired host → `DownloadManager` |
| `artifacts:changed` (push) | exists | — | listens (exists) | **broadcasts from the watcher sink** | — |
| `session:destroyed` (push) | exists | — | exists | payload gains `focus` | — |
| `GET /download/<token>` | — | — | — | **new route, before static** | — |

`tests/remote-channel-parity.test.ts` matches `remote:*` only today
(`:9-16`); it gains the prefixes `artifacts:` and `project:` with a known-positive each,
plus the explicit names `client:ready` and `pty:reset`, so every new case is covered
(R2-16). The MOCK_ONLY rows for `on.remoteConversationStatus`, `remote.rehydrate` and
`artifacts.download` come off when the real channels land.

## Tests, regression before fix

1. **Readiness and the cut line.** A client whose `chat:hydrate` listener registers 300 ms
   after `auth:ok` receives the hydrate *before* the 5 s fallback; a client that never sends
   `client:ready` receives nothing until the fallback, then today's sequence; `client:ready`
   at 4.9 s yields exactly one hydrate and one replay; at 6 s, nothing. A `session:created`
   broadcast between `client:ready` and the hydrate reaches the client after it. A
   **native per-delta** transcript event broadcast *before* the snapshot request is applied
   once; one broadcast *after* it is applied once; for an omitted session, both are applied.
   No `setTimeout(…, 500)` in `replayBuffers` (source guard via `guard-scope.ts`,
   known-positive: the 5 s fallback). A message from an abandoned socket is dropped.
2. **Terminal backlog.** A `pty:output:<sid>` and a `pty:reset:<sid>` dispatched before any
   listener are delivered in order on the first `addListener`; the backlog caps at 256 KB.
3. **Windows.** Two windows, session 2 owned by window 2: the merged snapshot holds window
   2's copy. Window 2 times out: session 2 omitted, `degraded`, and the reducer keeps the
   phone's copy. `mainWindow` destroyed with every owner answering: non-empty, not degraded
   (today: `{ sessions: [] }`, no flag). A transfer gap created by closing a window (not a
   flag set by hand) makes the inherited session pending → omitted, degraded.
4. **Place and focus.** No `setSessionId` before the hydrate in remote mode; first connect
   selects `focus.sessionId` from main's cache of `session:selected`; reconnect with a
   stored place that exists keeps it; place gone → focus; current session destroyed → the
   payload's `focus`, or the first remaining when the focus was the destroyed one; two tabs
   keep separate places; run once with a stored target and once with none.
5. **Single source.** Hydrate followed by an older page produces no duplicate tool-group or
   turn key; a session created after the hydrate loads its first page; an omitted session
   on a first connect loads its first page.
6. **Status and refresh.** The shim emits reconnecting → restoring → complete across a drop;
   a degraded hydrate emits `incomplete`; `remote:rehydrate` re-enters `restoring`, a
   transcript event broadcast during the refresh is applied once, a hydrate whose `seq` is
   stale is ignored, `seq` does not restart after a reconnect; a Refresh with a queued
   message and a pending bubble keeps both.
7. **Reconnect cost and consent.** A phone offset mid-chunk receives exactly the units past
   it; an epoch mismatch resets and the terminal jumps to the bottom; only unresolved
   permission requests are replayed; a request resolved during the drop is expired on
   reconnect; a kept session leaves the strip `incomplete`.
8. **Files.** One fixture, both transports driven end to end — `handleMessage` with a fake
   socket and the registered `ipcMain.handle` — answer the same for each channel except the
   remote `maxBytes` divergence, which the test expects: a 1.5 MB text file and a 24 MB PDF
   answer `too-large` with `sizeBytes` over remote and content on IPC; a sensitive path and
   **a symlink under a root to a sensitive file** answer `not-allowed` on both;
   `artifacts:changed` from the watcher sink reaches a WS client; after a reconnect a
   watcher event still reaches the phone and the two list channels are re-issued.
9. **Download.** A paused download resumed with `Range` + `If-Range` completes; a stale
   `If-Range` answers 200 from byte 0; the response carries `ETag`, `Accept-Ranges`,
   `Content-Length`; a client abort releases the live-stream slot; a third concurrent
   request answers `busy`; expired → 404; unpaired device → 404; an unknown token → 404
   with an empty body, not `index.html`; a `.html` file carries `attachment` and `nosniff`;
   a name containing `"; \r\n` and an emoji produces a valid header; a 60 MB file
   downloads; a listed tracked-internal text file downloads; a symlink to a sensitive file
   answers 404 at GET; a file replaced between mint and GET (different inode) answers 404;
   host restart → 404 and a fresh mint works.
10. **Sealed.** `HtmlView`'s `sandbox` attribute contains no `allow-same-origin`
    (known-positive: it contains `allow-scripts`).
11. **Backpressure.** With a fake socket whose `bufferedAmount` is held above 8 MB, the
    replay is delivered across more than one tick and resumes when it drains; above 32 MB
    the client is closed with the reconnect code.
12. **Android.** The URL decision function: `/download/` on the paired host → download; any
    other host URL → open externally; local → load; `./gradlew test` green with the count
    read from `app/build/test-results/`.

## Not in this batch

Uploads and editing; the polish items the tester filed (`user-interface.md`); the
first-connect bundle split (deferred by Destin, `remote-access.md`); a second origin for
previews (S-1 chose against); Windows/macOS runtime proof (this machine is Linux); **the
Android app's terminal when paired to a desktop** — it reads only `pty:raw-bytes`
(`TerminalView.tsx:533`), which no desktop host emits, so it is blank today and stays so;
filed in `remote-access.md` (R2-18).

## Still to prove at runtime

A phone pass on the built branch **before** the code reviewer and the second UX tester
(batch 1's lesson: six defects reached Destin past every test). Specifically: a real drop
(airplane mode) and reconnect on the phone with the terminal open; a permission answered on
the desktop during the drop; a Refresh while the desktop is busy and while a message is
queued on the phone; a 20 MB download paused and resumed on the phone's own download bar;
a session detached to a second desktop window showing on the phone; the Android app paired
to the desktop downloading a file to its Downloads folder.
