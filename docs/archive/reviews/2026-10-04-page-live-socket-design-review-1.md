---
status: shipped
date: 2026-10-04
reviews: docs/archive/specs/2026-10-04-page-live-socket-and-camera-video.md
---

# Design review 1: page live socket and camera video

Paths below are under `youcoded/desktop/` unless stated. Part 1 (socket) is mostly sound
because it reuses the checks in `page-socket.ts`. Part 2 (video) is where the trouble is:
the spec calls its guardrails "all in main", but the video has none in main at all.

## Security

1. **HIGH. The page chooses where the app's video connection goes (a way out of the sandbox).**
   Claim: "the page only gets pixels … a page cannot send anything through the video".
   The app owns the `RTCPeerConnection`, but the page supplies the answer SDP and the ICE
   candidates (`v.answer(sdp)`, `v.candidate(json)`). Those carry IP:port pairs. The app then
   sends ICE checks, DTLS and STUN to whatever address the page wrote, and receives whatever
   video that address sends back.
   - Outbound: a page can encode data in the destination address of candidates (6 bytes per
     candidate, many candidates), and `onState` (`playing`/`stopped`) tells it which hosts
     answered, so it can scan the home network.
   - Inbound: an attacker server can stream video, which the page decodes as data.
   - This undoes the exact thing `webrtc 'block'` exists for (page-theme.ts:154-157, 175).
   - The peer connection lives in the renderer, outside the frame's CSP, so nothing in main checks it.
   Suggested change:
   - Never hand the page's SDP/candidates straight to the peer connection. Route
     answer/candidate through a main call (`pages:video-answer`, `pages:video-candidate`, relayed
     for remote like the rest) that re-runs the approved-device checks and rewrites the SDP.
   - The rewrite keeps one video m-line plus the data channel and drops everything else.
   - It filters candidate and `c=` addresses. Do not hardcode "the device's host": Nest answers
     carry Google relay addresses, so the real allowlist needs a decision (see item 2).
   - At minimum block loopback, link-local and cloud-metadata ranges using the same private-range
     tables as `net-guard.ts:19-37`.
   Triage: accepted — redesigned: the page never supplies SDP or candidates. Main does the signalling itself over its own socket, from an approved `videoProfile` (message template + answer/candidate paths); answers come from the approved device, and candidates are still filtered against loopback/link-local/metadata ranges.

2. **HIGH. Video has no approval check.** Nothing in Part 2 says `youcoded.video` needs a
   `device` connection, `access:'full'`, or the approved fingerprint. The check would have to
   live in `PageHost` (the renderer), which a page cannot forge from inside the frame but which
   is also not "main", and it does not exist in the spec. As written, any page, even one with
   zero connections, can use item 1. Also decide the candidate policy: a Nest answer is public
   relay IPs, a Pi camera answer is LAN IPs, so a single "approved device only" rule fits
   neither.
   Suggested change:
   - Require that the page has an approved `access:'full'` device connection (main-checked as in
     item 1).
   - Record on that connection what kind of address the video may use (e.g. `video: 'relay' | 'lan'`
     in the approved manifest, shown to the person at approval time).
   - Add a pinning test that a page with no device connection gets `onState('stopped')` and no
     peer connection is created.
   Triage: accepted — video requires an approved access:'full' device connection WITH a `videoProfile`; the profile (and its target pattern, e.g. ^camera\.) rides the approval fingerprint. Pinned by a no-connection test.

3. **MEDIUM. A page with `access:'full'` can mint a new long-lived key and keep it.** The live
   socket sends the page's messages "exactly as written" (page-socket.ts:176) and redacts only the
   known key (page-socket.ts:155, page-fetch.ts redact). In Home Assistant, the
   `auth/long_lived_access_token` command returns a brand-new token that redaction does not know.
   The page can save it into its synced `data.json` and it outlives approval removal. This
   already exists in the one-shot exchange, but a live socket makes it easier to automate.
   "Main doesn't know the HA protocol" blocks hardcoding this.
   Suggested change: let the approved manifest carry an optional `socketDeny` list (message
   `type` prefixes, e.g. `auth/`, `config/auth`) that main checks on every outgoing message. It is
   protocol-neutral (a string list), shown in the approval text, and the page-builder skill fills
   it in. Mention the gap in the spec either way.
   Triage: accepted — `socketDeny` (type prefixes) in the approved socket profile, checked in main on every outgoing message, live AND one-shot (pre-existing hole closed). Home page: auth/, config/auth.

4. **MEDIUM. Socket ownership is not defined, and `pages:fetch` shows the habit to avoid.**
   `ipc-handlers.ts:5428` ignores `_e`, and `remote-server.ts:2303` ignores `client`. The spec
   says events go "to the window that opened it" but not how main knows. A renderer-chosen
   `socketId` lets any window send/close another window's socket, and a remote phone could address
   the desktop's.
   Suggested change: main generates the id (unguessable, not a counter), stores
   `{ownerKind: 'window'|'client', ownerId, pageId}`, and every `-send/-close` handler checks the
   owner. The `PageHost`-side map is page-local id -> main id, so a frame cannot name a main id at
   all. Add that to the `PageHost` test list.
   Triage: accepted — main-generated unguessable ids, owner {window|client, pageId}, checked on send/close; PageHost maps page-local ids.

5. **MEDIUM. Remote delivery must not use `broadcast()`.** `remote-server.ts:4553` writes to every
   client and has per-client queueing (`enqueueForRestoring`) and a backpressure close
   (`BACKPRESSURE_CLOSE_BYTES`, ~4570). Three consequences:
   - Events need a new `sendTo(client, …)`, not `broadcast`, or one phone's camera chatter reaches
     another.
   - Events must NOT go through `enqueueForRestoring`, or a phone that reconnects replays stale
     socket events into a socket that no longer exists.
   - 2 MB/10 s of socket data (the spec's own ceiling) can trip the backpressure close, which drops
     the phone's whole connection including its terminal. Keep the remote budget well below it
     and drop the socket (not the client) when `bufferedAmount` is high.
   Suggested change: add `sendToClient`, skip the restore queue for these events, and close the
   client's sockets in the same `drop()` path that runs on `ws.on('close')` (~1498).
   Triage: accepted — sendToClient, no restore queue, client sockets closed in drop(); remote byte budget below backpressure, close the socket not the client.

6. **LOW. One client can use up the app-wide cap of 8.** A phone page opening 8 sockets locks the
   desktop out until restart. Count per owner (window or client) as well, e.g. 4 per owner and 8
   total.
   Triage: accepted — 2 per owner page, 4 per owner, 8 total.

7. **LOW. "Page only gets pixels" is true for the data type, with two caveats.**
   - ImageBitmap transfer to an opaque-origin frame works and the bitmap from a MediaStream is
     origin-clean, so the page can read pixels. Fine, but the page can then send them to its device
     through the socket. State it as a decision.
   - The SDP the page sees is overstated. Without camera permission Chromium hides local addresses
     behind mDNS names, so "network candidates (home/Tailscale addresses)" may not be what appears;
     measure and reword. Either way, per item 1 the risk is the address the page writes, not the
     ones it reads.
   Suggested change: reword both lines in the spec after measuring in a dev window.
   Triage: accepted — stated as a decision (the page may see pixels of a camera it is already allowed to control); SDP is no longer visible to the page at all after item 1.

8. **LOW. `media-src data:` is safe as scoped, with one gap.** It is only emitted when a `device`
   connection exists (page-theme.ts:159-176 pattern), and `default-src 'none'` still blocks
   everything else. The gap: `as:'video'` is judged by the response `content-type`
   (page-fetch.ts:224-234 does the same for pictures). A device that sends an mp4 header on
   arbitrary bytes is only a decoder-fuzzing concern, not a leak. Add a magic-byte check (`ftyp`)
   and allow only `video/mp4`: GIF is an image and `img-src data:` already covers it, so listing it
   under "video" is redundant.
   Triage: accepted — video/mp4 only, `ftyp` magic check; GIF stays a picture.

9. **LOW. DNS re-resolution on a long-lived socket.** `assertHomeHttpUrl` resolves, then `ws`
   resolves again (page-socket.ts:122 vs 160). Exists in the one-shot exchange; a reconnecting
   socket runs it every few seconds for minutes. Pass the vetted address to the connect (with the
   `Host` header), or re-run the whole check on every reconnect (see item 12).
   Triage: accepted — full check chain re-run on every reconnect (item 12), which re-resolves and re-checks.

## Correctness and lifecycle

10. **HIGH. "Hidden" does not mean what the spec assumes.** `PageHost` does not hide the frame, it
    removes it. The frame renders only inside `{open && …}` (PageHost.tsx:449-483), and a page
    change swaps `srcDoc`. So leaving the page destroys the page's JavaScript and state; the only
    "kept but hidden" case today is Office (:369-377). Consequences:
    - `'paused'` and reopen-on-show only matter for window minimise or `document.hidden`, not for
      leaving the page. Spec text and tests ("hidden -> paused, shown -> reopened") describe the
      wrong event.
    - Every leave, page switch, `htmlStamp`/`connSig` reload (:213) and approval-wait swap
      must close that frame's sockets. The existing `message` effect (:225-287) re-runs because
      `load.state` passes through 'loading', but that is an accident of the reload path, not a
      rule; do not hang socket cleanup on it alone.
    Suggested change:
    - Key all socket state to the frame element (a ref per frame instance) and close on its
      unmount or `srcDoc` change.
    - Define `'paused'` as `document.visibilityState === 'hidden'` only, and say so.
    - Test the `htmlStamp` reload case.
    Triage: accepted — socket state keyed to the frame instance; closed on unmount/srcDoc change; 'paused' = document.visibilityState hidden only. Tests reworded.

11. **HIGH. Main cannot see a reload or crash of the renderer, so sockets leak.** The spec lists
    "page closed / frame reloaded / window closed" as closed. Main learns about none of those on
    its own. A window `Ctrl+R`, a renderer crash or a Vite HMR reload does not run React cleanup,
    and `webContents` `destroyed` does not fire for a reload. After 8 such events no page can
    open a socket until the app restarts. Remote: a phone that sleeps drops its ws (close is seen),
    but the browser that reloads while its ws stays up is the same case.
    Suggested change: add a lease. `PageHost` sends `pages:socket-ping` every ~20 s per socket;
    main closes anything silent for 60 s. Also hook `webContents` `did-start-navigation`,
    `render-process-gone` and `destroyed`, and the client `drop()`. The lease alone covers all
    cases and is cheap.
    Triage: accepted — 20 s ping lease, 60 s timeout, plus webContents did-start-navigation / render-process-gone / destroyed and client drop().

12. **MEDIUM. Approval removal is only half-specified.** "Approval removed or fingerprint changes
    -> closed" needs a hook in `pages-service.ts` (`removeConnection`, `approve`, `deleteSavedKey`,
    a page's html/manifest change). None is named. Also the key can be re-saved/rotated while a
    socket is up, and the live socket keeps the old greeting.
    Suggested change: put a `closeFor(pageId, connectionId?)` call in those service methods, and
    on every reconnect re-run the full `performPageSocket` check chain (covers, fingerprint,
    `access`, credential, `assertHomeHttpUrl`), not just the TCP connect. Extract the check into a
    function both the one-shot and live paths call so they cannot drift.
    Triage: accepted — closeFor(pageId, connectionId?) from removeConnection/approve/deleteSavedKey/page change; one shared check function for one-shot and live.

13. **MEDIUM. Give-up rule can get the user's computer banned.** "Stop retrying when the device
    closes within 2 s of the greeting three times running", with a 1,2,4 s backoff, is three bad
    logins within about 7 s. Home Assistant can IP-ban the sender after failed logins (when
    `ip_ban_enabled` is on), which would lock the phone and every other client at that address out
    too. The page already reads `auth_invalid`, so:
    - Stop after the FIRST quick close with no data received, and tell the page `'closed'` with
      reason "device refused the key".
    - Or let the page call `s.close()` on `auth_invalid` and set the app-side rule at 2.
    Triage: accepted — `authFailed` substring in the profile: on seeing it, closed with reason, no retry; otherwise a quick close with no data stops after the first.

14. **MEDIUM. Races between pause/show, reconnect and close are not specified.** State machine
    needed in `page-live-socket.ts`; at minimum:
    - show during the backoff timer must cancel the timer, not start a second connection;
    - hide during `connecting` must terminate the pending handshake;
    - `close()` during a reconnect wait must clear the timer (the one-shot code does this with
      `finish`, page-socket.ts:147-154);
    - a message from a stale connection must not be delivered after `'open'` of the next one
      (tag each connection with a generation number and drop mismatches);
    - `send()` between `'reconnecting'` and `'open'` must refuse rather than buffer, otherwise a
      page replays a rename minutes later.
    Add tests for each.
    Triage: accepted — generation-tagged state machine; send refused unless open; each race tested.

15. **LOW. Page-side `'open'` ordering.** "App greets before `'open'`" means the page's first
    `send` goes out after the greeting, but the device's `auth_required`/`auth_ok` arrive via
    `onMessages` *after* `'open'`. A page that sends subscriptions on `'open'` before `auth_ok`
    is refused by Home Assistant. Say so explicitly: pages must wait for `auth_ok` in
    `onMessages`, and the page-builder skill should include the pattern.
    Triage: accepted — documented: wait for auth_ok in onMessages before subscribing; skill pattern.

16. **LOW. Remote shim loses events on reconnect.** When the phone's ws reconnects (shim wake
    checks, remote-shim.ts ~1870), all its sockets are gone server-side (item 5/11), but nothing
    tells the page. The shim should emit `'closed'` ("connection to the computer was lost") for
    every open socket on ws drop, so the page re-opens rather than waiting forever.
    Triage: accepted — shim emits 'closed' for every live socket when its ws drops.

17. **LOW. A live socket must not count as freshness.** `pages-service.ts` `noteFreshness` marks
    the band green on a 2xx. The one-shot returns status 101 so it never counts; keep the live
    socket and `onMessages` out of it, or a page can hold the band "fresh" with a socket that
    carries nothing.
    Triage: accepted — live traffic never counts as freshness.

## Performance

18. **MEDIUM. Frame pump can pile up bitmaps.** Each 1280 px ImageBitmap is ~4 MB; at 15 fps that
    is 60 MB/s of allocations if the frame draws slower than the pump. Spec has a rate cap but no
    backpressure.
    Suggested change: the page acks each frame (`youcoded:video:ack`); the host sends the next
    only after an ack (or drops frames), and `close()`s any bitmap it created but did not send.
    Pick the resolution to match the source: his Nest source is 640x360 at ~6 fps, so a 15 fps /
    1280 px ceiling is never reached and only matters for the Pi camera.
    Triage: accepted — ack-based pump: next frame only after the page acks; unsent bitmaps closed; size matched to source.

19. **MEDIUM. `requestVideoFrameCallback` on a hidden `<video>` is not guaranteed.** Chromium
    stops compositing frames for occluded or off-screen elements and for background windows, so
    the pump can stall while the video plays. Check in the dev window with the card scrolled
    off-screen, window minimised, and `display:none` vs offscreen-but-positioned. The Electron
    autoplay policy also needs `muted`/`playsInline`.
    Alternative if it stalls: skip the `<video>`; use `MediaStreamTrackProcessor` to get
    `VideoFrame`s directly (works in Electron's Chromium; verify on the Android WebView and
    remote browsers, where it may not exist).
    Triage: accepted — measure in the dev window; fall back to MediaStreamTrackProcessor where present.

20. **LOW. The 100 ms batch needs a byte bound too.** A 64 KB x many-messages window can still
    produce one big IPC push; cap one push at e.g. 256 KB and split. `ws` is also created with
    `maxPayload: 1_000_000` (page-socket.ts:58); for the live socket set it to the 64 KB-ish
    message cap, otherwise one huge message is allowed before the "2 MB per 10 s" check sees it.
    Home Assistant's first `subscribe_entities` answer for a whole house can exceed 64 KB, so
    decide the per-message cap deliberately (receive cap vs the 64 KB out cap are different
    numbers) and test the real size.
    Triage: accepted — 256 KB per push, split; receive cap per message 1 MB (subscribe_entities first answer is large), send cap 64 KB; measured on the real house.

21. **LOW. 8 MB `as:'video'` is a lot of IPC.** It crosses as base64 (about 10.7 MB) and over
    remote it is one JSON frame to the phone. `MAX_PICTURE_BYTES` is 3 MB for the same reason
    (page-fetch.ts:20-24). Consider a lower cap (4 MB), checking the `content-length` before
    reading, and holding one video fetch at a time per page.
    Triage: accepted — 4 MB cap, content-length checked first, one video fetch at a time per page.

## Gaps and contradictions with the existing code

22. **HIGH. "Android native has no Pages host today; nothing to mirror" is wrong.**
    `SessionService.kt:4405-4427` lists every `pages:*` channel by name and answers
    not-implemented, including `pages:fetch`. A channel not on that list falls to the catch-all (not verified here what it
    answers; the file's own comments say the list exists so the UI degrades "instead of timing out"). Add
    `pages:socket-open|send|close` (and the video relays from item 1) to that list.
    Triage: accepted — reviewer is right; SessionService.kt list extended with the new channels (answers not-implemented).

23. **MEDIUM. Parity tests that must be extended.** `tests/ipc-channels.test.ts:2545-2570` has a
    hard-coded `PHASE_2` list of five surfaces (types.ts, preload.ts, ipc-handlers.ts, remote-
    shim.ts, remote-server.ts, plus Kotlin if checked). Add the new channels and the event channel.
    Event channels have a different shape (`ipcRenderer.on` in preload with an unsubscribe,
    `dispatchEvent` in the shim like `pages:changed`, remote-shim.ts:1106) and are easy to forget
    in the workbench mock shim (run `node scripts/workbench-boot-check.mjs`).
    Triage: accepted — PHASE_2 list, preload event subscription, shim dispatch, workbench mock; boot-check run.

24. **MEDIUM. The page-side bridge is not designed.** `bootstrap()` (page-theme.ts:79-146) has one
    message type pair for fetch and a `waiting` map. The spec shows the API but not the new
    message types (`PAGE_SOCKET_*`, `PAGE_VIDEO_*` constants), the `e.source !== parent` guard
    for events (a window the page opened via `allow-popups` holds `opener` and can post to it,
    page-theme.ts:74-78), or the `onMessages` array's validation. Add: constants next to
    PAGE_FETCH_MESSAGE; events matched by page-local socket id so a forged event resolves nothing;
    `isSocketPlan`-style shape checks in `PageHost` for open/send (string only, <= 64 KB, so
    garbage never reaches IPC).
    Triage: accepted — constants beside PAGE_FETCH_MESSAGE, e.source === parent guard, page-local ids, shape checks in PageHost.

25. **MEDIUM. The rate gate is bypassed.** `PageRateGate` (page-fetch.ts:87-117, 120/min,
    4 in flight) wraps fetches and one-shot sockets (pages-service.ts:279). Live-socket opens,
    reconnects and video starts are not mentioned. Opening a socket should take one slot per
    attempt (including reconnect attempts, which the backoff already spaces) so a page that
    open/closes in a loop is refused the same way. Say so in the spec.
    Triage: accepted — every open, reconnect and video start takes a PageRateGate slot.

26. **LOW. Inconsistent numbers.** "Per page 2" while video "may share the first" and "2 videos per
    page"; if a page runs 2 videos + 1 updates socket, it already needs 3 sockets by the spec's
    own "video signalling shares" rule or just 1. Decide one rule: signalling for all videos goes
    over the single updates socket, so a page needs 1 socket (cap 2 stays as a spare).
    Triage: accepted — one socket per page for updates; video signalling is main's own socket (item 1), so cap stays 2 as a spare.

27. **LOW. Redaction across batches.** Redaction runs per message today; with batching to an array
    keep it per message before batching (never after joining), and keep text-only (page-socket.ts:183).
    Binary frames are dropped silently; for a live socket report a counter or `'closed'` after N so
    the page is not left waiting on a device that speaks binary.
    Triage: accepted — redact per message before batching; binary frames counted, closed after 20.

## Simpler alternatives

28. **Video: show the picture without the page ever holding it.** Instead of ImageBitmap transfer,
    the host draws the `<video>` as an overlay positioned over a placeholder rectangle the page
    declares (`youcoded.videoSlot(rect)`). Page code never sees pixels, `Watch live` costs no
    frame pump, and a hidden or scrolled slot is simply hidden. Downside: z-order and scroll
    clipping inside an iframe need care, and the card's own LIVE badge/Stop must be page-drawn
    over it (not possible under a native overlay without extra rects). Worth a short note as the
    rejected-or-kept option, since it strictly removes item 7.
    Triage: rejected — overlay positioning/scroll clipping inside the frame is fragile and the card needs its own LIVE badge/Stop drawn over the picture; item 7's decision stands.

29. **Instant updates without a new socket platform.** For the Home page alone, HA offers
    `subscribe_entities` over a socket, but the page could instead keep today's one-shot exchange
    on a shorter timer when visible (1 s). That is simpler but costs a fresh connection and login
    each time, so a live socket is the right call for Q-speed; just do it as one socket per
    page and let video signalling use it, which also drops item 26 and halves the leak surface.
    Triage: already handled — the spec's choice; now one socket per page (item 26).

30. **Make the "main doesn't know HA" rule explicit configuration.** Items 3, 13 and 15 all stem
    from main not knowing the protocol. A small `socketProfile` in the approved manifest
    (greeting, deny prefixes, "auth-failure" substring that stops retries) keeps main generic
    and moves protocol knowledge into the page-builder skill, which already writes `socketHello`.
    Triage: accepted — `socketProfile` in the approved manifest: hello, deny, authFailed; plus `videoProfile`.
