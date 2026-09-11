---
status: active
reviews: docs/active/specs/2026-09-10-remote-access-batch2-3-technical-design.md
branch: session/remote-first-connect
---

# Design review 1 — remote access batches 2 and 3

Adversarial read of the technical design (revision 1) against the contract
(`remote-batch-2-3.contract.json`), the milestone brief's acceptance requirements, the
four binding rules, and the code at app HEAD `cbe8b4e8` on this branch. Paths are relative
to `youcoded/desktop/src/` unless stated. Most severe first.

1. **R1-1 accepted** — per-session apply on degraded/partial snapshots; merge owner → mainWindow → leader (rev 2 §2, §6)
   **R1-1 — A partial or degraded multi-window snapshot wipes the phone's copy (breaks R3 and R1).**
   §2, §6. `chat-reducer.ts:761-779` is a whole-state replace whose only guard is
   `sessions.length === 0`; `deserializeChatState` (`chat-types.ts:977+`) builds a fresh Map
   holding only what the snapshot carries. §2 says `degraded: true` "when any window timed
   out" and merges the rest, so a degraded snapshot is NON-empty, passes the guard, and the
   sessions the timed-out window owned arrive either absent or as the empty
   `SESSION_INIT` copy every other window holds (every window seeds every session from
   `session.list()`, `App.tsx:1948`; only the owner receives events, `main.ts:1143`). The
   conversation the person was reading is replaced by nothing — the exact case R3 forbids.
   Corollary: "a session in one window only, that one" never occurs, because every window
   has a key for every session; the merge must be by owner, and an UNOWNED session's events
   go to `mainWindow` (`main.ts:1150`), not to the leader, so "from the leader's copy" picks
   the wrong window once window 1 has closed.
   **Fix:** the host omits sessions owned by a window that did not answer (and marks
   `degraded`); the reducer applies a degraded hydrate per session — replace a session only
   when the snapshot holds a non-empty copy, keep the client's copy otherwise, never delete
   on degraded. Merge rule: owner's window → else `mainWindow`'s → else leader's. Add the
   pinning test: two sessions, window 2 times out, phone keeps session 2's timeline.

2. **R1-2 accepted** — queue every broadcast for a restoring client except pty:output and, on first connect, hook:event (rev 2 §1)
   **R1-2 — The per-client queue holds only transcript events; every other broadcast during `restoring` is dropped, so a session created or destroyed during restore never reaches the phone (breaks R5/R6 ordering, and §1's own promise).**
   §1. Main broadcasts, besides `transcript:event`: `transcript:shrink`,
   `native:session-context`, `native:model-state`, `native:shell-event`,
   `specialists:event`, `session:renamed`, `syncspaces:event`, `engine:*`,
   `models:download-progress`, `ui:action`, `hook:event` (rg over `main/`); the server
   itself adds `session:created`, `session:destroyed`, `status:data`,
   `session:meta-changed`, `tags:changed`, `pty:output` (`remote-server.ts:745, 3067+`).
   Under §1 a fresh client in `restoring` receives none of these for up to 2 s (5 s for the
   old-client fallback). A `session:destroyed` in that window leaves a dead tab on the phone
   until the next reconnect; a `session:created` is invisible; on reconnect (§7 replays only
   unresolved permissions) a `hook:event` in that window is lost outright.
   **Fix:** queue EVERY broadcast for a restoring client except `pty:output` and, on a first
   connect only, `hook:event` (both are in the buffers the flush replays); flush in arrival
   order after the buffers. Bound the queue (drop-oldest with a `degraded` mark). Test: a
   `session:created` broadcast between `client:ready` and `chat:hydrate` is on the phone.

3. **R1-3 accepted** — shim keeps a bounded per-session PTY backlog until the first listener (rev 2 §1)
   **R1-3 — "No timer" drops the PTY replay: the listeners it needs are registered in React effects, after commit.**
   §1. `session:created` → `setSessions` (`App.tsx:1081-1088`) is batched; the per-session
   `pty:output:<sid>` subscribers are effects — `App.tsx:1841` (over `sessions`) and
   `TerminalView.tsx:534` on mount. The shim's `dispatchEvent` (`remote-shim.ts:517-525`)
   has no backlog: an event with no listener is gone. A host that sends `pty:output` in the
   same tick as `session:created` (§1: "at once") delivers the terminal to nobody. Today's
   500 ms timer is what papers over this; the reducer being synchronous covers `hook:event`
   only.
   **Fix:** the shim keeps a bounded per-session `pty:output` backlog until the first
   listener for that channel subscribes, then drains it (same for `pty:raw-bytes`). Test: a
   `pty:output` dispatched before `ptyOutputForSession` subscribes is delivered on subscribe.

4. **R1-4 accepted** — rehydrate re-enters restoring; client:ready and remote:rehydrate carry a seq the hydrate echoes (rev 2 §6)
   **R1-4 — Refresh (`remote:rehydrate`) while `live` loses the delta between snapshot capture and hydrate apply, and nothing rejects a stale hydrate.**
   §6. The rehydrate sequence is "snapshot → chat:hydrate for that client only" with no
   phase change, so events broadcast between the desktop's `serializeChatState`
   (`RemoteSnapshotExporter.tsx`) and the client's `HYDRATE_CHAT_STATE` are applied live and
   then erased by the whole-state replace (`chat-reducer.ts:761`) — the bug §1 fixes for
   first connect, reintroduced by Refresh. Separately: nothing correlates a hydrate with the
   `client:ready`/rehydrate that asked for it, so a Refresh racing a reconnect (or a phone
   with two tabs, R1-12) can apply an older snapshot after a newer one.
   **Fix:** rehydrate = move the client to `restoring` (queue on) → snapshot → hydrate →
   flush → `live`, i.e. §1's sequence minus buffers. `client:ready` and `remote:rehydrate`
   carry a client `seq`; `chat:hydrate` echoes it; the shim ignores a hydrate whose seq is
   not the latest it sent. Test 5 must cover the racing case.

5. **R1-5 accepted** — token valid until expiry, any number of requests; live-stream cap with close accounting; 416 (rev 2 §10)
   **R1-5 — Single-use download token + `Range` support + no cancellation handling: interrupted downloads cannot resume, and the 2-stream cap leaks.**
   §10. The token is "marked used when the response ends" yet `Range` is honoured. A phone
   browser that pauses, loses signal, or retries issues a SECOND request for the same URL
   → 404 with no explanation; Chrome on Android routinely re-requests with `Range` after a
   drop. The brief's acceptance list names "interrupted downloads" and "support
   cancellation"; the design has neither. Nothing says the stream is destroyed and the
   per-device slot released on `req`/`res` `'close'` before end — without that a cancelled
   download holds a slot for good and the device is `busy` forever.
   **Fix:** the token stays valid until `expiresAt` (5 min is fine — 256 bits of entropy is
   the secret, single-use adds nothing) and any number of requests may use it; the cap
   counts LIVE streams, incremented on open and decremented on `res.on('close')`, with
   `stream.destroy()` on client abort; 416 for an unsatisfiable range. Tests: paused-and-
   resumed Range download completes; abort releases the slot.

6. **R1-6 accepted** — RFC 5987 encoding plus a stripped ASCII fallback; name from the canonical path (rev 2 §10)
   **R1-6 — `Content-Disposition` with a raw name is a header-injection/crash path.**
   §10 writes `filename*=UTF-8''<name>` with no encoding. Node's `writeHead` throws
   `ERR_INVALID_CHAR` on CR/LF or non-Latin-1 in a header value, so `résumé.pdf` (or a name
   an agent wrote with a quote or newline) turns into an unhandled error on the response;
   a `"` or `;` in an unquoted fallback rewrites the header.
   **Fix:** `filename*=UTF-8''${encodeURIComponent(name)}` (RFC 5987) plus an ASCII
   fallback `filename="…"` with `"`/`\`/CTLs stripped; take `name` from
   `path.basename(canonicalPath)`, never from the request. Test 8 gains a name containing
   `"; \r\n` and an emoji.

7. **R1-7 accepted** — explicit download policy, no size gate, re-canonicalize and fstat at GET (rev 2 §10)
   **R1-7 — "Authorize exactly as a binary read" inherits the 50 MB gate and the roots-only policy, so large files and some listed text files cannot be downloaded (R9).**
   §10 vs §8. `artifacts:read-binary` (`ipc-handlers.ts:4750-4790`) allows only saved
   folders + central-index roots + tracked externals, then refuses over
   `READ_BINARY_MAX_BYTES` (50 MB). `artifacts:get` authorizes differently —
   `authorizeArtifactRead(projectRoot, fullPath, internal)` (`:4667`) — so a text artifact
   the drawer lists and previews can be refused by the download's rule, and nothing over 50
   MB is downloadable although R9's threshold is "a large download". Also TOCTOU: the path
   is authorized at mint and opened up to 60 s later by a different code path.
   **Fix:** state the download policy explicitly: `isSensitivePath` first; allowed if
   `evaluateBinaryRead` says `allowed` OR (when the request names `projectRoot`+`artifactId`)
   `authorizeArtifactRead` says ok; NO size gate. At `GET`, re-canonicalize, compare to the
   minted `canonicalPath`, open with `fs.open` and `fstat` the handle before streaming.
   Test: a 60 MB file downloads; a listed tracked-internal text file downloads; a
   `.ssh/id_rsa` under a root answers 404 at GET even with a token minted before it became
   sensitive.

8. **R1-8 accepted** — absolute URL from the stored target; Android DownloadListener → DownloadManager; test 10 corrected (rev 2 §10, surface table)
   **R1-8 — Android app paired to a desktop: Download does nothing and the relative URL is wrong (R9 parity gap the design's table hides).**
   §10, cross-platform table. The Android app can pair to a desktop
   (`SettingsPanel.tsx:2222` → `connectToHost`, `remote-shim.ts:1037`) and then talks to
   `remote-server.ts` through the same shim, so it WILL receive a token — the table's "else
   → unsupported" row describes Kotlin, which is not on this path. In that WebView an `<a
   download>` click is inert: `app/` has no `setDownloadListener` (`WebViewHost.kt:69` sets
   only `shouldOverrideUrlLoading`), and `location.protocol` is `file:` so `/download/<t>`
   resolves against the APK. On that surface the terminal also reads `pty:raw-bytes`
   (`platform.ts:12`, `TerminalView.tsx:534-537`), which no desktop code emits (only the
   preload constant, `preload.ts:41`), so §7's PTY replay change is inert there.
   **Fix:** the shim builds an absolute URL from the stored `youcoded-remote-target`; Android
   adds a `DownloadListener` that hands the URL to `DownloadManager` (Kotlin change, so
   test 10 "Android unchanged" is wrong) — or the contract's R9 is narrowed to a phone
   BROWSER by a deck, not by this design.

9. **R1-9 accepted** — §5 rewritten: the phone toggle moved the desktop; both the branch and the receiver go (rev 2 §5)
   **R1-9 — §5's "today" is inverted: the desktop never sends `switch-view`; the phone app switches the desktop.**
   §5. `App.tsx:2824` broadcasts only when `getPlatform() === 'android'`, i.e. from the
   Android app's own toggle. The host relays it to every OTHER client and into the desktop
   windows (`remote-server.ts:2880-2890` → `sessionManager.emit('ui-action')` →
   `ipc-handlers.ts:1879`), and `App.tsx:1649-1657` applies it to whatever session THAT
   window shows. Kotlin has no handler (`SessionService.kt:1754-1765` logs and ignores). So
   R4's stated scenario (desktop toggle moves the phone) already passes for a browser; the
   live bug is phone-toggle-moves-desktop-and-other-phones.
   **Fix:** delete the `switch-view` branch of the `uiAction` receiver (`App.tsx:1649`) and
   the Android-only broadcast (`:2822-2825`); leave `_SESSION_INITIALIZED` relay intact.
   R4's Android check is: toggle on the phone, desktop and a second phone do not move.

10. **R1-10 accepted** — per-session PTY offsets on client:ready, pty:reset when the tail is gone, cuts on chunk boundaries (rev 2 §7)
   **R1-10 — Reconnect PTY tail duplicates scrollback and can split an escape sequence.**
    §7. `TerminalView.tsx` never calls `reset()`/`clear()`; the replay is appended to an
    xterm that still holds the pre-drop content, so the last 256 K units appear twice (today
    the whole 4 MB does — §7 shrinks the duplicate, it does not remove it). `PtyBuffer`
    measures UTF-16 code units, not bytes (`remote-server.ts:59-66`), and a cut at an
    arbitrary unit can land inside an ANSI sequence or a surrogate pair.
    **Fix:** per-session monotonic offset on the host buffer; `client:ready` carries
    `ptyOffsets: { [sid]: n }`; the host sends only what lies past the offset if still
    buffered, else the full buffer preceded by a `pty:reset` the terminal honours with
    `terminal.reset()`. Cut only at chunk boundaries. Rename the constant — it is not bytes.

11. **R1-11 accepted** — session:destroyed carries focus (rev 2 §3)
   **R1-11 — R2's second threshold ("after its conversation is deleted") is not delivered: `focus` travels only inside `chat:hydrate`.**
    §2/§3. The snapshot's `focus.sessionId` is read once at hydrate. When the phone's
    selected session is destroyed while connected (`session:destroyed`,
    `remote-server.ts:745`), the phone falls to whatever `setSessionId` logic remains
    (`App.tsx:1976`, `:2159`), not to what the desktop shows.
    **Fix:** on `session:destroyed` of the phone's current session, the phone invokes a
    small read (`remote:focus` → `{ sessionId }`, host asks the focused/leader window) or the
    host includes `focus` in the `session:destroyed` payload. Add to test 3.

12. **R1-12 accepted** — hostId defined; place in sessionStorage with a localStorage fallback; download cap per socket (rev 2 §3, §10)
   **R1-12 — Two tabs on one phone share a device id, a stored place and a download cap; `hostId` is undefined.**
    §3, §10. Both tabs read `youcoded-remote-token` (`remote-shim.ts`), so the host sees two
    clients with one `deviceId`: tab B's selection overwrites tab A's
    `youcoded-remote-place:<hostId>` and moves tab A on its next reconnect; two downloads in
    tab A make tab B `busy`. No `hostId` exists in `auth:ok` or storage — the shim stores
    `youcoded-remote-target`.
    **Fix:** define `hostId` = `youcoded-remote-target`; keep the place in `sessionStorage`
    (per tab) with the `localStorage` copy as the reload fallback; count download streams
    per socket, not per device, or say per device is intended.

13. **R1-13 accepted** — exporter marks pending sessions; reducer keeps its copy; host marks degraded (rev 2 §2)
   **R1-13 — Window close mid-snapshot: an inherited session is empty for a moment and is reported as complete.**
    §2. When a window closes its sessions transfer (`window-registry.ts:176-190`,
    `markInheritedByTransfer`); the inheriting window's reducer has an empty
    `SESSION_INIT` copy until its first-page read (to EOF) resolves. A snapshot taken in that
    gap returns an empty, non-degraded copy → phone replaced by nothing (R1-1's mechanism,
    without the `degraded` flag). `requestChatSnapshot` on a destroyed `webContents`
    resolves degraded (`chat-snapshot.ts:36-45`), which is right, but that is the closed
    window, not the inheriting one.
    **Fix:** the exporter marks a session `pending: true` while `history.loading` is true or
    the session is in `inheritedByTransfer`; the reducer keeps its copy for a pending
    session; the host sets `degraded` if any session is pending so the strip says
    "may be out of date" and Refresh will pick up the settled copy.

14. **R1-14 accepted** — WS clients get subscriber ids, dropped on close; the watcher sink broadcasts (rev 2 §8)
   **R1-14 — `watch-project` over remote: the watcher is keyed by `webContents` id and its sink only reaches windows; the design points at the wrong broadcast sites.**
    §8. `watchProject(projectRoot, subscriberId: number)` refcounts per webContents
    (`project-watcher.ts:97, 194, 291, 334`); `ipc-handlers.ts:4906-4916` ties cleanup to
    `sender.once('destroyed')`; the change sink is `webContents.getAllWebContents().forEach(
    wc.send(...))` (`:4897-4900`). `APPEND_VERSION` sites are not where a WS client will
    learn of a change — the sink is the one chokepoint.
    **Fix:** allocate a unique numeric subscriber id per WS client (e.g. negative
    counter), call `dropSubscriber(id)` on socket close, and add
    `remoteServer.broadcast({ type: 'artifacts:changed', payload: evt })` inside the
    `initProjectWatchers` sink; verify the renderer's `artifacts:changed` handler accepts
    `projectRoot: null` before sending it after hydrate.

15. **R1-15 accepted** — tests rewritten per the list (rev 2 Tests)
   **R1-15 — Tests that would pass for the wrong reason or miss the claim.**
    - Test 1 must assert the hydrate arrives BEFORE the 5 s fallback and that a client which
      never sends `client:ready` receives nothing until then; otherwise the fallback makes a
      broken handshake pass.
    - Test 2 "window 1 destroyed → non-empty, not degraded" passes trivially unless window
      1 IS `mainWindow` (`main.ts:285` returns `{ sessions: [] }` without `degraded` — the
      today claim is correct); say so.
    - Test 7 is tautological if both transports call `read-service` directly; drive
      `handleMessage` with a fake socket and the registered `ipcMain.handle` on one fixture,
      and expect the `maxBytes` divergence explicitly.
    - Test 8 "used twice → 404" and "Range honoured" contradict under one token; resolve per
      R1-5.
    - Missing from the list although the brief requires them: host restart mid-download
      (token gone → 404, socket reconnects, strip says reconnecting), a session created
      during restore (R1-2), old client (5 s fallback path), slow-client backpressure
      (`ws.bufferedAmount` during a 4 MB replay), sensitive path minted-then-changed (R1-7).

16. **R1-16 accepted** — citations corrected
   **R1-16 — Low: line drift in "today" citations.**
    `App.tsx:1947` (list[0]) is `:1976`/`:2159`; `App.tsx:2793` is `:2824`; `App.tsx:1059`
    (session:created) is `:1081`. Claims that DO hold and were verified: `replayBuffers` runs
    at `auth:ok` with the 500 ms timer (`remote-server.ts:1012-1112`); broadcasts reach a
    client from `addClient` (`:3067`); `requestSnapshot` asks `mainWindow` only, never
    cleared (`main.ts:285`, no `mainWindow = null`); `history` and `seenUuids` ARE serialized
    (`chat-types.ts:964-969, 1016-1022`); nothing reads `_replay`
    (`remote-shim.ts:536`); `HtmlView.tsx:40-45` sandbox lacks `allow-same-origin`;
    `remote-devices.ts` keeps `revokedAt` across restart; `transcript:page` is bridged
    (`remote-server.ts:1947`); `remote-file-limits.ts` and `RemoteFileCard` match §9.

## Verdict

Buildable, but not as written: the restoration half needs three structural corrections
before code — a per-session (not whole-state) apply for degraded/partial snapshots
(R1-1, R1-13), a queue that holds every broadcast rather than transcript events only (R1-2,
R1-4), and a shim-side PTY backlog so "no timer" is actually safe (R1-3). The file half is
closer; its download route needs a resumable token, cancellation accounting, header
encoding and an explicit authorization policy (R1-5 to R1-7), and the Android-paired
surface must be either handled or excluded by deck (R1-8). The single riskiest part is the
snapshot-merge-plus-whole-state-replace: it is the mechanism behind R1-1, R1-4 and R1-13,
and it is the one that turns "the copy may be out of date" into "the conversation vanished"
on the phone — the failure Destin will notice first and trust least.
