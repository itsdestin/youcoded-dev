---
status: active
reviews: docs/archive/specs/2026-09-10-remote-access-batch2-3-technical-design.md
branch: session/remote-first-connect
round: 2
---

# Design review 2 — remote access batches 2 and 3

Adversarial read of revision 2 against round 1 (all 16 accepted), the signed contract
(21 rows), the milestone brief's acceptance requirements, the five binding rules, and the
code at app HEAD `cbe8b4e8`. Paths are relative to `youcoded/desktop/src/` unless stated.
Round-1 findings that revision 2 resolves are not repeated. Most severe first.

1. **R2-1 accepted** — realpath before evaluate at mint and GET, O_NOFOLLOW open, dev/ino/size compared to the mint-time stat (rev 3 §8, §10)
    **R2-1 — Symlink escape: the download policy and `read-binary` authorize a string, not a file (breaks the brief's "canonical, symlink-resolved authorization"; R7, R20).**
   §8, §10. `ipc-handlers.ts:4755` feeds `evaluateBinaryRead` with `canonicalize(absolutePath, null)`;
   `shared/artifacts/canonicalize.ts:17` is pure string work (no `realpath` anywhere in the
   file). Only `authorizeArtifactRead` resolves links (`write-authorization.ts:56,78`). So a
   symlink inside a project root pointing at `~/.ssh/id_rsa` passes `isSensitivePath` (it sees
   the link's name) and `isUnderRoot`, at mint AND at `GET` ("re-canonicalize the stored path"
   is the same string op). §8's "`evaluateBinaryRead` … symlink-resolved" is not true of the
   code it points at, and the moved `readArtifactBytes` inherits the hole over WS.
   **Fix:** `fs.promises.realpath` first (both at mint and at `GET`), canonicalize the real
   path, evaluate that; at `GET`, `fs.open` the realpath with `O_NOFOLLOW`, then `fstat` and
   compare `dev`/`ino`/`size` to a stat taken at mint — that, not "fstat the handle", is what
   closes the name race. Test 8 gains: a symlink under a root to a sensitive file answers
   `not-allowed` on both transports; test 9: the same link answers 404 at `GET`.

2. **R2-2 accepted** — the WebView intercepts /download/ URLs on the paired host and enqueues them on DownloadManager; the decision is a pure Kotlin function with its own test (rev 3 §10)
    **R2-2 — Android app: the download tap never reaches the new `DownloadListener`; it opens Chrome (R9 on the Android surface, R1-8's fix is half-done).**
   §10, surface table. `app/src/main/kotlin/com/youcoded/app/ui/WebViewHost.kt:70-76`
   `shouldOverrideUrlLoading` sends every URL that is not `file://`, `http://localhost` or
   `http://10.0.2.2` to `startActivity(ACTION_VIEW)` and returns `true`. A `<a download>`
   click to `http://100.x.y.z:port/download/<token>` is a navigation, so this fires FIRST:
   the WebView never issues the request, `onDownloadStart` never fires, and the token URL
   lands in the system browser (or an app chooser) — outside the app, in Chrome's history.
   Test 12 ("the listener hands an `https?://` URL to `DownloadManager`") passes while the
   real tap takes the other path; with `unitTests.isReturnDefaultValues = true`
   (`app/build.gradle.kts:134`) a call into the framework stub proves nothing anyway.
   **Fix:** in `shouldOverrideUrlLoading`, a URL whose path starts with `/download/` on the
   paired host is enqueued on `DownloadManager` directly (`setDestinationInExternalPublicDir(
   DIRECTORY_DOWNLOADS, name)`, `setNotificationVisibility(VISIBLE_NOTIFY_COMPLETED)`) and
   returns `true`; the separate `DownloadListener` becomes unnecessary. Extract the decision
   ("intercept / download / open externally" for a URL + paired host) into a pure Kotlin
   function and unit-test THAT. The R18 notice still comes from the shim.

3. **R2-3 accepted** — ETag, Accept-Ranges, Content-Length, Last-Modified, If-Range; the route is matched before the static handler (rev 3 §10)
    **R2-3 — "Paused and resumed" cannot work without a validator: Android `DownloadManager` refuses to resume a download whose first response carried no `ETag`, and Chrome restarts from zero without `If-Range` support (R9, brief: "interrupted downloads").**
   §10. The header list is `Content-Disposition`, `Content-Type`, `nosniff`, `Cache-Control:
   no-store` — no `ETag`, `Last-Modified`, `Accept-Ranges`, `Content-Length`. `DownloadProvider`'s
   resume path stops with `STATUS_CANNOT_RESUME` ("Resume attempt but no ETag"); Chrome sends
   `Range` + `If-Range` and expects a 206 only when the validator matches. Test 9's "paused
   download resumed with `Range` completes" passes against a bare `Range` and misses both
   real clients. Also: `handleHttpRequest` (`remote-server.ts:752-790`) answers every unknown
   path with `index.html` 200 (SPA fallback), so "expired → 404, empty body" needs the route
   matched before the static handler.
   **Fix:** `ETag: "<dev>-<ino>-<size>-<mtimeMs>"` from the `fstat`, `Accept-Ranges: bytes`,
   `Content-Length`, `Last-Modified`; honour `If-Range` (full 200 when it mismatches);
   route `/download/` before `sendStatic`. Test 9 sends `Range` WITH `If-Range` (and once
   with a stale validator, expecting 200 from byte 0).

4. **R2-4 accepted** — only hydrate-delivered sessions skip the first page (history.hydrated); the rest load as today (rev 3 §4)
    **R2-4 — §4 "the first page is never requested in remote mode" blanks any session the snapshot did not deliver (R5's fix creates an R1/R3 regression).**
   §4, §6. `loadFirstPage` runs for every entry of `sessions` (`App.tsx:1940`). Sessions the
   snapshot does NOT hold: (a) one created on the desktop after hydrate — a RESUMED
   conversation arrives as `session:created` with its whole history on disk and its live
   stream starting at EOF (`window-registry.ts:164-171` explains that contract), so the phone
   shows only what happens next; (b) one omitted from a degraded snapshot on a FIRST connect,
   where there is no client copy to keep. Under §4 neither ever loads a page; both sit empty
   until a Refresh happens to succeed.
   **Fix:** skip the first page only for sessions the hydrate delivered — the reducer marks
   them (`history.hydrated: true`, seeded with the snapshot's cursor); `loadFirstPage` skips
   marked sessions and behaves as today for the rest. Test 5 gains: a session created after
   hydrate loads its first page; an omitted session on first connect loads its first page.

5. **R2-5 accepted** — snapshotIndex on the queue; transcript/native entries below it are skipped on flush except for omitted sessions (rev 3 §1)
    **R2-5 — The queue starts at `addClient` and the snapshot is taken later, so every queued event broadcast before the renderer serialized is applied a second time on flush; uuid dedup does not cover native streaming (R5 on a native turn; R1-2's fix is incomplete).**
   §1B, §6. Uuid dedup exists for user/assistant/tool-result messages
   (`chat-reducer.ts:1148,1371,1970`) and `TRANSCRIPT_TOOL_USE` dedups by id. It does NOT
   cover the native harness's per-delta `TRANSCRIPT_ASSISTANT_TEXT` (the reducer's own note at
   `:415-437`: a second delivery of the same delta "appended the same text again"; main
   timeline merges by `partId`, the same-partId append is not idempotent), nor
   `transcript:shrink`, `native:session-context`, `native:model-state`. A phone connecting
   while a native turn streams shows the flushed deltas twice. Test 1's "applied once" passes
   on a CC fixture (uuid-deduped) and never tries a native delta.
   **Fix:** record `queue.length` at the moment the snapshot requests are sent
   (`snapshotIndex`). Main sends each event to the owning window and broadcasts it in the same
   synchronous handler, so everything queued before `snapshotIndex` was in that window's
   reducer when it serialized: on flush, skip `transcript:event`, `transcript:shrink` and
   `native:*` entries below `snapshotIndex`; keep lifecycle entries (`session:*`,
   `status:data`, `hook:event`, `specialists:event`, `native:shell-event`) from the whole
   window. For a degraded snapshot, do NOT skip entries for omitted sessions (their copy is
   the client's, which lacks them). Test 1 gains a native-delta fixture and a degraded case.

6. **R2-6 accepted** — slice at the exact unit offset; per-buffer epoch; pty:reset rides the per-session backlog; the phone jumps to the bottom after a reset (rev 3 §7)
    **R2-6 — The PTY offset scheme contradicts itself on cut points, has no epoch, and `pty:reset` is not in the backlog it depends on (R1-10's fix leaves the duplicate in).**
   §1C, §7. (i) The host coalesces live output INTO the newest chunk
   (`remote-server.ts:67-72`, `PTY_CHUNK_COALESCE_BELOW`), so the phone's offset — units it
   received — lies mid-chunk almost always. "Cuts land only on chunk boundaries" then means
   re-sending from the boundary BEFORE the offset: the phone re-renders up to 4 KB it already
   holds, on every reconnect. The premise was wrong: the phone already rendered everything
   before the offset, so a cut exactly AT the offset cannot split anything it has not already
   drawn; escape-sequence splitting only matters for the head trim of a full replay, which is
   today's behaviour. (ii) Offsets carry no epoch: after a host restart, or a session
   destroyed and recreated (`ptyBuffers.delete`, `:735`), a buffer restarts at 0; a phone
   offset that happens to be ≤ the new length gets the wrong tail with no reset.
   (iii) `TerminalView` is mounted for every session (`App.tsx:3289`), so on reconnect its
   listener exists — but the design routes `pty:reset` outside the per-session backlog; a
   reset that lands before a late listener is dropped, and the full buffer that follows
   appends. (iv) `terminal.reset()` also empties the scrollback the person was reading; the
   design should say the phone jumps to the bottom when the tail is gone.
   **Fix:** slice at the exact unit offset (walk chunks; `slice` the first partially-covered
   one); a per-buffer `epoch` (random at buffer creation) rides on every `pty:output` and comes
   back as `ptyOffsets[sid] = { epoch, units }` — epoch mismatch or `units` beyond what the
   host holds → `pty:reset:<sid>` + full buffer; `pty:reset:<sid>` goes through the same
   ordered per-session backlog as data. Test 7 replaces "no cut lands inside a chunk" (true by
   construction, proves nothing) with: a phone offset mid-chunk receives exactly the units past
   it; an epoch mismatch resets.

7. **R2-7 accepted** — client:ready clears the fallback; a client:ready outside restoring is ignored (rev 3 §1)
    **R2-7 — The 5 s old-client fallback and `client:ready` can both run (§1 has no cancellation).**
   §1. A `client:ready` at 4.9 s starts the readiness sequence while the fallback timer is
   still armed → two `chat:hydrate`s, the PTY buffer twice, the hook replay twice; a
   `client:ready` arriving after the fallback ran starts a restore on a `live` client (the
   queue is off, so the second hydrate erases events applied in between — R1-4's bug through
   the back door).
   **Fix:** `client:ready` clears the fallback timer; a `client:ready` on a client not in
   `restoring` is logged and ignored; `remote:rehydrate` remains the only way back into
   `restoring`. Test 1: `client:ready` at 4.9 s yields exactly one hydrate and one replay;
   `client:ready` at 6 s yields nothing.

8. **R2-8 accepted** — hook:replay-complete lists pending ids and App expires the rest; a kept session is stale until Refresh and the strip stays incomplete (rev 3 §6, §7)
    **R2-8 — A permission card the host answered while the phone was disconnected stays up after reconnect (consent surface lies; `chat-reducer.md`'s binding rule).**
   §6, §7. The hook buffer drops the request/held pair when the ask is resolved
   (`remote-server.ts:675-691`), so "replay only unresolved requests" tells the phone what is
   still open but never what died; the resolution was broadcast into a closed socket. On a
   KEPT session (degraded apply) — and on any reconnect where the request resolved during the
   drop — the phone shows Allow/Deny for a request id the host already answered; tapping sends
   a response nothing is waiting for. The same kept copy keeps `isThinking` and
   `activeTurnToolIds` from before the drop; `status:data` does not end a turn.
   **Fix:** the reconnect hook replay ends with `hook:replay-complete { sessionId,
   pendingRequestIds }`; App dispatches `PERMISSION_EXPIRED` (`hook-dispatcher.ts:71`,
   `chat-reducer.ts:2304`) for every pending card not listed. State that a kept session's
   turn state is stale until Refresh, and have the strip stay `incomplete` while any session
   was kept. Test 7 gains: a request resolved during the drop is expired on reconnect.

9. **R2-9 accepted** — the null-root nudge is dropped; FilesTab and the drawer reload on reconnect through REHYDRATE_ON_RECONNECT plus a re-issued watch-project (rev 3 §8)
    **R2-9 — `artifacts:changed { projectRoot: null }` reaches no handler that reloads anything, and a reconnected phone is no longer subscribed to the watcher (R12).**
   §8. Every consumer filters on the root: `FilesTab.tsx:358` drops
   `evt.projectRoot !== project.path || evt.by !== 'external'` (and only `add`/`remove`);
   `ActiveArtifactView.tsx:263` drops a root/id mismatch; `useGitFileStatus` refreshes git
   status only. "The renderer's handler treats a null root as reload what you show" names a
   handler that does not exist. Separately, socket close calls `dropSubscriber(id)`, so after
   a reconnect the phone has no watcher subscription until it leaves and re-enters the Files
   screen — `useProjectWatch` (`hooks/useProjectWatch.ts:13-27`) subscribes on mount only.
   **Fix:** either specify the renderer change (FilesTab and the drawer refresh on
   `projectRoot === null` regardless of `by`, with a test) or drop the nudge and add the file
   lists to the shim's `REHYDRATE_ON_RECONNECT` (`remote-shim.ts:260`). Re-issue
   `watch-project` for the visible root on reconnect (a `connected` listener in
   `useProjectWatch`). Test 8 gains: after a reconnect, a watcher event still reaches the phone.

10. **R2-10 accepted** — hostId and the download origin derive from the target when set, else location (rev 3 §3, §10)
    **R2-10 — `hostId` and the absolute download URL come from `youcoded-remote-target`, which a phone BROWSER never has (R1-12 and R1-8's fixes point at the wrong store).**
    §3, §10. Only `connectToHost` writes that key (`remote-shim.ts:1062` — the Android pairing
    path); a browser connects through `connect()` and `getWsUrl()` reads `location`
    (`:149`). So on the primary surface §3's key is `youcoded-remote-place:null` for every
    host, and §10's URL is built from nothing.
    **Fix:** `hostId` = the target's `host:port` when set, else `location.host`; download URL
    = `http://<host>:<port>` derived from the target when set, else `location.origin`. Test 4
    and test 9 run once per surface.

11. **R2-11 accepted** — placeDecided ref gates every selection site in remote mode until the hydrate (rev 3 §3)
    **R2-11 — The phone still lands on `list[0]` before the hydrate moves it (R2, batch-1 Q-3).**
    §3. Gating `session:created` is not enough: the `session.list()` effect
    (`App.tsx:1942-1976`) runs on mount in remote mode, answers over WS in milliseconds and
    calls `setSessionId(prev ?? list[0].id)`; the hydrate arrives up to 2 s later. The person
    sees one conversation open, then another.
    **Fix:** in remote mode, every selection site (`:1081`, `:1976`, `:2159`) defers to a
    `placeDecided` ref that only the hydrate handler (and `session:destroyed`'s `focus`) sets;
    until then the phone shows the strip's "catching up", not a conversation. Test 4 asserts
    no `setSessionId` before hydrate.

12. **R2-12 accepted** — App reports session:selected per window to main; main caches it for focus (rev 3 §2, §3)
    **R2-12 — Nothing in main knows any window's selected session, so neither `snapshot.focus` nor `session:destroyed.focus` has a source.**
    §2, §3. `focus` is described as "the focused main window's selected session", but the
    selection is App state (`sessionId`); `RemoteSnapshotExporter` reads only the chat map
    (`RemoteSnapshotExporter.tsx:14-43`), and main has no per-window selection at all
    (`rg activeSessionId|SESSION_SELECTED main/` → nothing). "The host reads it the same way
    as §2" on `session:destroyed` would need a renderer round trip before a broadcast that is
    synchronous today (`remote-server.ts:745`), and at that instant the desktop may still be
    selecting the dying session.
    **Fix:** App sends `session:selected { sessionId }` to main on change (per window; main
    caches by window id); the snapshot and `session:destroyed` read the cache. Define the
    race: if the cached focus equals the destroyed id, the phone falls back to the first
    remaining session. Add to test 4.

13. **R2-13 accepted** — both hydrate branches keep the client's queuedMessages and un-echoed pending bubbles (rev 3 §6)
    **R2-13 — Refresh silently discards the phone's own queued messages (brief: "never silently discard an unsent action").**
    §6. `queuedMessages` is renderer-local by design (`chat-types.ts:384`) and is serialized
    from the DESKTOP; a complete hydrate replaces the phone's list with the desktop's. Today
    that happens only on a reconnect; §6 turns it into a button the person presses while a
    message of theirs is queued.
    **Fix:** both hydrate branches keep the client's `queuedMessages` per session (and any
    `pending: true` user bubble not yet echoed). Test 6 gains it.

14. **R2-14 accepted** — the host decides pending from the registry's transfer state plus the exporter's history.loading (rev 3 §2)
    **R2-14 — R1-13's `pending` flag is decided where it cannot be seen.**
    §2. `inheritedByTransfer` lives in main (`window-registry.ts:170-190`); the exporter can
    see only `history.loading`, and the inheriting window's copy sits at `loading: false` with
    an empty timeline between the transfer and its own first-page request — the exact gap
    R1-13 named.
    **Fix:** the host decides: `requestSnapshot` marks a session pending when a non-consuming
    `windowRegistry.isPendingTransfer(sid)` says so OR the exporter reports `history.loading`
    (read before `serializeChatState` normalises it to false). Test 3's "pending session"
    case must create the transfer gap, not set a flag by hand.

15. **R2-15 accepted** — a per-client send gate on bufferedAmount with a hard-cap close (rev 3 §7)
    **R2-15 — Backpressure: no mechanism, and test 11 passes for the wrong reason (brief: "slow-client backpressure").**
    Tests. `ws.send` never blocks in Node, so "a 4 MB replay to a socket whose
    `bufferedAmount` stays high does not block other clients" is true of today's code and of
    any code. Nothing in §1 or §7 reads `bufferedAmount`; a phone that stalls mid-replay just
    grows the host's socket buffer until the liveness ping closes it (`:1000-1010`).
    **Fix:** a per-client send gate: above a `bufferedAmount` threshold (say 8 MB) the replay
    and the flush pause and resume as the buffer drains; above a hard cap the client is closed
    with a code the strip renders as reconnecting. Test 11 asserts the pause (the replay is
    delivered across more than one tick to a throttled fake socket) and the close.

16. **R2-16 accepted** — the parity guard gains prefixes with a known-positive each (rev 3 surface, tests)
    **R2-16 — "`tests/remote-channel-parity.test.ts` covers the new cases mechanically" is false for eleven of the thirteen.**
    Cross-platform surface. The guard matches only `invoke('remote:…')` and
    `case 'remote:…'` (`tests/remote-channel-parity.test.ts:9-16`); `artifacts:*`,
    `project:*`, `client:ready` and `pty:reset` are invisible to it. Only `remote:rehydrate`
    is covered.
    **Fix:** extend the guard to a prefix list (`remote:`, `artifacts:`, `project:`) with a
    known-positive per prefix, or list the new channels explicitly.

17. **R2-17 accepted** — handleMessage stamped with the generation; seq monotonic for the shim's lifetime (rev 3 §1, §6)
    **R2-17 — Low: the shim's stale-socket guard covers `auth:ok` only; the `seq` scheme should not reset per connection.**
    §1A, §6. `connectionGeneration` is checked at `remote-shim.ts:783` and nowhere in
    `handleMessage`; the connect-timeout path (`:748-755`) nulls `ws` without waiting for its
    `close`, so a late message from that socket can still be dispatched. A per-connection
    `seq` restarting at 1 then collides with the new connection's 1.
    **Fix:** stamp `handleMessage` with the generation and drop mismatches; make `seq` a
    monotonic counter for the shim's lifetime.

18. **R2-18 accepted** — raw-bytes backlog dropped; the Android-paired terminal is named under Not in this batch and filed (rev 3)
    **R2-18 — Low: `pty:raw-bytes` in §1C is dead on this host, and the Android-paired terminal stays blank.**
    §1C, §7. No desktop code emits `pty:raw-bytes` (only the constant, `preload.ts:41`); the
    Android app paired to a desktop reads ONLY raw bytes (`TerminalView.tsx:533`,
    `platform.ts:12`; a browser reports `platform: 'desktop'` from `auth:ok` so it uses
    `pty:output`). Offsets never apply there. Not a contract row — say so under "Not in this
    batch" and drop the raw-bytes backlog, or emit raw bytes from the host.

19. **R2-19 accepted** — per socket by intent, stated (rev 3 §10)
    **R2-19 — Low: the per-socket download cap resets on reconnect.**
    §10. The token records `socketId` and the live count is per socket; a phone that
    reconnects mid-download gets two more streams per connection. Say it is per socket by
    intent (a dropped socket's streams finish and release themselves) or count by `deviceId`
    with the two-tab cost stated.

## Verdict

Buildable, not yet as written. Five findings change what gets built: the symlink hole in
the download and binary-read policy (R2-1), the Android tap that never reaches the download
manager and the resume that cannot resume (R2-2, R2-3), the first-page rule that blanks
sessions the snapshot never held (R2-4), and the queue/snapshot overlap that re-applies
native deltas (R2-5). The rest are gaps in mechanism — cancellation, epochs, focus's source,
backpressure — that a builder would otherwise invent on the spot. The riskiest remaining
part is still the restore half: §1/§6 now have the right shape (queue everything, per-session
apply, seq), but the two things that decide whether a message appears twice or a card lies
— where the queue's cut line sits relative to the snapshot (R2-5) and what happens to state
the phone kept while it was gone (R2-8) — are unspecified, and no test in the list would
notice. A third round is worth it only as a short, targeted pass over the rewritten §1, §6,
§7 and §10 after these land; the file-list and status-strip sections do not need another read.
