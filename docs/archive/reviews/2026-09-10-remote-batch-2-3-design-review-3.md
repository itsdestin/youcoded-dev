---
status: active
reviews: docs/archive/specs/2026-09-10-remote-access-batch2-3-technical-design.md
branch: session/remote-first-connect
round: 3
---

# Design review 3 — remote access batches 2 and 3

Targeted pass over revision 3's §1, §6, §7 and §10 only, as round 2's verdict asked. Read
against round 2 (all 19 accepted), the signed contract (21 rows) and the code at app HEAD
on this branch. Paths are relative to `youcoded/desktop/src/` unless stated. Most severe
first. Where a section is sound it gets one line.

1. **R3-1 accepted** — a module-level transcript flush; the exporter serializes the synchronous store after flushing; the hydrate handler flushes before applying (rev 4 §1, §6)
   **R3-1 — The cut line's premise is false: "every queued event below `snapshotIndex` was in that window's reducer when it serialized" fails on both ends of the wire, because the renderer batches transcript events into animation frames and the exporter reads a ref that lags a render (R5; loses text rather than doubling it).**
   §1B, §6. Main does send-then-broadcast in one synchronous handler as the design says
   (`main/ipc-handlers.ts:2476-2479`, `:2915-2918`, `:3510-3513`; `main/chat-snapshot.ts:37`
   sends the export request on the same ordered `webContents`). But the window does not
   apply a transcript event when it arrives: `App.tsx:1236-1275` pushes it into
   `pendingTranscriptActions` and flushes on `requestAnimationFrame` — or a 16 ms timer when
   the window is hidden, and Chromium throttles hidden-window timers (once a second, once a
   minute after five minutes hidden). The exporter then reads `chatStateRef.current`, set by
   a `useEffect` after the next commit (`renderer/components/RemoteSnapshotExporter.tsx:15-20`),
   not the store, which does apply synchronously (`renderer/state/chat-context.ts:62-69`). So
   an event delivered to the owner in the frame before the export request — a whole minute of
   them from a minimised desktop — is below `snapshotIndex` and NOT in the snapshot: the
   flush skips it and the phone never gets it. For a native delta that is a missing sentence.
   The reverse (above the index but already in the snapshot) cannot happen: the index is
   recorded and the export sent in one tick, and delivery order holds.
   Same batcher on the phone, other direction: `chat:hydrate` dispatches directly
   (`App.tsx:1724`) while the phone's own `pendingTranscriptActions` may hold events the
   snapshot already contains; they flush AFTER the replace and re-apply. On a Refresh while a
   native turn streams, the last frame's deltas appear twice (R5). The reconnect path is safe
   only because the 16 ms flush beats any reconnect.
   **Fix:** move the batcher out of App's closure into a module with `flushTranscriptActions()`.
   The exporter calls it, then serializes `store.getState()` (add `useChatStore`/`getState`
   to `chat-context.ts`), never a render-lagged ref — then the premise holds by construction:
   IPC order + synchronous apply. The hydrate handler calls the same flush BEFORE dispatching
   `HYDRATE_CHAT_STATE` (correct for both branches: a replaced session is superseded, a kept
   one keeps them). Test 1 as written passes for the wrong reason on a fake window that
   serializes a store; it must drive the real batcher + exporter under jsdom and assert the
   delta is present AND applied once. Add the hidden-window case: batch stalled on a timer,
   export request arrives, delta present in the snapshot. Test 6 gains "Refresh with a
   pending phone-side batch applies each delta once".

2. **R3-2 accepted** — PermissionResolved reaches the reducer as PERMISSION_RESOLVED_ELSEWHERE, never failed, never a socket claim; replay-complete for every session uses the same action (rev 4 §7)
   **R3-2 — `hook:replay-complete` + `PERMISSION_EXPIRED` still leaves a card wrong in two cases: a request answered during `restoring` shows Allow/Deny after the flush, and a kept session's expired card says "socket closed" for a tool the desktop ran (consent; `chat-reducer.md`'s binding rule; error-message standards).**
   §7. (i) On a reconnect `hook:event` is queued. A request that arrives during the ≤2 s
   snapshot wait and is answered inside the same window puts `[PermissionRequest,
   PermissionResolved]` in the queue; the buffer purge (`main/remote-server.ts:676-693`)
   drops it from the replay, so `pendingRequestIds` omits it, the expiry pass finds nothing,
   and the flush then applies `PermissionRequest` — a live card for a dead ask.
   `PermissionResolved` is broadcast (`:654`) but `hook-dispatcher.ts:12-77` has no case for
   it, so the flushed resolution is a no-op. (This is also why a LIVE phone never learns the
   desktop answered a permission — pre-existing, and "never shows a permission card the
   computer already answered" in *What the user gets* is not true of it.) (ii) On a kept
   session the expiry sets `status: 'failed'` with "Permission request expired — socket closed
   before a response was sent" (`chat-reducer.ts:2314, 2325`) for a tool the desktop allowed
   and ran: an invented cause on a consent card. On a replaced session the expiry is a no-op
   (the card is already `running`/complete in the desktop's copy), so the lie is confined to
   kept sessions — the ones the strip flags `incomplete`, but the card itself still asserts a
   cause.
   **Fix:** add a `PermissionResolved` case to the dispatcher → new reducer action
   `PERMISSION_RESOLVED_ELSEWHERE { requestId }`: clears `requestId`, moves the tool to the
   reducer's existing "ask overwritten" shape (`running`, no requestId — `chat-reducer.ts:2130-2157`),
   with a neutral note ("Answered on the computer; Refresh to see the result"), never
   `failed`, never a socket claim. With that case live, the flushed queue corrects (i) on its
   own and the live phone is fixed for free; `hook:replay-complete`'s expiry then uses the
   SAME action, not `PERMISSION_EXPIRED`, for ids missing from `pendingRequestIds`. A repeat
   `PermissionRequest` (buffer replay + queued copy) is idempotent while `awaiting-approval`
   (`:2155-2157`) — sound. Send `replay-complete` for every session in `listSessions()`, not
   per buffer entry, or a session that never had a hook event gets no pass. Test 7 gains:
   request arrives and is answered during the snapshot wait → no card after the flush; a kept
   session's answered card carries no "socket" copy and is not `failed`.

3. **R3-3 accepted** — cursor-based PTY replay that flips to live only after an empty pass; the first-connect hook exclusion ends when the hook pass starts (rev 4 §1, §7)
   **R3-3 — The backpressure gate (R2-15) opens a hole in §1B: `pty:output` and, on a first connect, `hook:event` are excluded from the queue "because the replay covers them", but a paused replay no longer covers what arrives during the pause.**
   §1B, §7. Without the gate, everything after `await requestSnapshot()` is one synchronous
   run, so nothing can land between the PTY slice, the hook pass and `live`. With the gate
   the replay spans ticks: output that arrives while paused is not queued (excluded), not in
   the slice already taken, and not sent later — gone until the next reconnect. On a first
   connect the same holds for a `PermissionRequest` arriving during the pause: no card, ever,
   on that connection. Test 11 passes without noticing: it only asserts delivery across ticks.
   **Fix:** make the PTY replay a cursor, not a slice: per client `sentUnits[sid]`; each
   resume sends from the cursor to the buffer's current total (§7's epoch/base arithmetic
   applies unchanged) and the client flips to `live` only after a pass that found nothing
   new — from then on the live broadcast takes over with no gap or overlap. For hooks, end the
   first-connect exclusion when the hook buffer pass STARTS (queue from then on; the
   idempotent request handles the one overlap). Test 11 gains: a `pty:output` and a
   `PermissionRequest` arriving during the pause reach the client exactly once.

4. **R3-4 accepted** — client:ready at most once per connection generation; the host sub-states restoring → readying (rev 4 §1)
   **R3-4 — A second `client:ready` while still `restoring` restarts the sequence: R2-7 covers only a client outside `restoring`.**
   §1A/B. The shim sends `client:ready` "the first time a listener is added for
   `chat:hydrate`"; App registers that listener in an effect with cleanup (`App.tsx:1820`
   `off('chat:hydrate', …)`), so a dependency change or a StrictMode double-mount in dev
   re-adds it. The host's rule ignores a `client:ready` on a `live` client, but one arriving
   during the 2 s snapshot wait is on a `restoring` client → a second snapshot, a second
   hydrate, a second replay, and a `snapshotIndex` re-recorded above events already queued.
   **Fix:** the shim sends `client:ready` at most once per connection generation (a flag
   reset on `auth:ok`), and the host sub-states `restoring` → `readying` on the first
   `client:ready` and ignores any other until `live`. Test 1 gains: two `client:ready` in
   100 ms yield one hydrate and one replay.

5. **R3-5 accepted** — the decision matches /download/ on any http(s) URL; a DownloadListener feeds the same function; cleartext noted for runtime proof (rev 4 §10)
   **R3-5 — Android intercept: it works only because the click is cross-origin, and Kotlin has nothing that knows "the paired host" (R9 on the Android surface).**
   §10. Chromium honours `<a download>` only same-origin; cross-origin it navigates, which is
   what makes `shouldOverrideUrlLoading` (`WebViewHost.kt:70-76`) fire. That holds today
   because the page is `file:///android_asset/…` (`:160`) and the URL is `http://<host>`. A
   dev build loads from `devUrl` (`:160`) — if that is ever the host's own origin, or if the
   builder opens the link via a same-origin blob/`window.open`, Chromium routes it to the
   `DownloadListener` the design deleted, and nothing happens, silently. Separately, "a URL on
   the paired host" needs Kotlin to know the host: `rg -n 'remote-target|paired' -g '*.kt'`
   finds nothing — the target lives in the WebView's `localStorage`
   (`renderer/remote-shim.ts:1062`), unreadable from Kotlin.
   **Fix:** the pure decision function matches path `/download/` on any `http(s)` URL (the
   256-bit token is the secret; the host check adds nothing) — no new bridge. Keep a
   `setDownloadListener` that feeds the same function (five lines) so the same-origin path
   cannot go dark; test 12 drives both entry points. Note for runtime proof: `DownloadManager`
   fetches from its own process, so cleartext `http://100.x` must be allowed there, not just
   in the app's network-security config.

6. **R3-6 accepted** — O_NOFOLLOW ?? 0, bigint stats, ino 0 refused at mint, ELOOP → 404 (rev 4 §10)
   **R3-6 — `O_NOFOLLOW` does not exist on Windows and the identity compare can be vacuous.**
   §10. `fs.constants.O_NOFOLLOW` is `undefined` on Windows; `O_RDONLY | undefined` is `0`,
   so the open silently follows links there — the design reads as if the flag were universal.
   The `dev`/`ino` compare is the real guard on every platform (it is what catches a swap
   whether or not the last component is a link; `O_NOFOLLOW` never protected intermediate
   directories on Linux either), but: Node's `Stats.ino` is a lossy `number` for Windows' 64-bit
   file ids unless `{ bigint: true }`, and `ino`/`dev` are `0` on filesystems without stable
   ids (FAT/exFAT, some shares), where "equal" proves nothing.
   **Fix:** `flags = O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)`; `stat`/`fstat` with
   `bigint: true` at mint and GET; refuse the mint (`not-allowed`) when `ino === 0n` rather
   than accept an unpinnable file; map `ELOOP` to 404. Test 9 gains a unit test of the flag
   computation with `O_NOFOLLOW` undefined and a compare on `bigint` values; the "symlink →
   404 at GET" case must also pass with the flag forced to 0 (i.e. through the compare).
   Residual, not a finding: the policy runs on a path and the identity is taken a moment
   later; a same-user swap inside that gap is within `read-binary-access.ts:8-12`'s stated
   threat model.

7. **R3-7 accepted** — count keyed on the token's socketId, counters deleted at zero, sliding expiry (rev 4 §10)
   **R3-7 — Per-socket cap and the token's `socketId` are consistent with resume: sound, two lines to add.**
   §10. The count must key on the token's `socketId` (a GET has no socket of its own); a
   resume after a drop counts against the dead id, never the new socket's — R2-19's "by
   intent" holds. Delete the counter entry when it reaches zero or dead ids accumulate. A
   pause longer than five minutes resumes to a 404 and `DownloadManager` cannot be re-pointed
   — make expiry sliding (each successful GET renews `expiresAt`) so a paused download that
   is still being retried stays alive, and say the card mints a fresh link from byte 0 after
   that.

8. **R3-8 accepted** — the hydrate handler reports { seq, kept } back to the shim (rev 4 §6)
   **R3-8 — Low: the shim cannot know "any session was kept".**
   §6. The kept set is decided inside the reducer's degraded branch; the shim, which emits
   `incomplete`, sees only the payload. Have the hydrate handler report `{ seq, kept: string[] }`
   back to the shim (`remote.reportHydrate`), and the shim derives the phase from that plus
   `degraded`. Otherwise the strip shows `complete` after a degraded apply that kept sessions.

**Sound as written:**
- §1C terminal backlog: per-session, ordered, `pty:reset` inside it — correct, and
  `TerminalView` mounts per session (`App.tsx:3289`) so the drain lands.
- §7 epoch/offset slice: the coalesced tail (`main/remote-server.ts:620-622`) is safe to
  slice mid-chunk because units are cumulative and JSON preserves UTF-16 length; the phone
  rendered everything below its offset. Two builder notes, not findings: the monotonic count
  needs a `base` that advances on every head trim, including the single-chunk `slice` at
  `:640-643`, and the reset condition is "offset outside `[base, base+length]`", not only
  "beyond" — a phone whose offset fell below the trimmed head must reset too.
- §6 per-session apply, `queuedMessages` and pending bubbles kept in both branches, `seq`
  monotonic and latest-wins, `remote:rehydrate` re-entering `restoring` with
  `snapshotIndex = 0`: sound given R3-1's flush.
- §10 route order, `Range`/`If-Range`/`ETag`, `attachment` + `nosniff`, 404 with an empty
  body, tokens dying on unpair: sound.

**Tests passing for the wrong reason (beyond those named above):** test 1's "applied once"
on a fake exporter (R3-1); test 7's "resolved during the drop" while "resolved during
restoring" is untested (R3-2); test 11 asserting only delivery across ticks (R3-3); test 9's
symlink case passing via `ELOOP` on Linux only (R3-6).

## Verdict

Buildable as written after R3-1 to R3-4 land; R3-5 to R3-8 are one-paragraph edits. Nothing
here reverses a round-2 fix — each finding is a gap the fix's mechanism opened (R2-15's pause,
R2-8's expiry action, R2-2's deleted listener) or a premise the code does not support (R2-5's
"in the reducer when serialized"). The one thing the builder must not get wrong: the snapshot
must be serialized from the synchronous store AFTER flushing the renderer's transcript batch,
on the desktop before answering the export and on the phone before applying the hydrate —
without that, the cut line silently drops text below the index and doubles it above, and no
test that fakes the exporter will notice.
