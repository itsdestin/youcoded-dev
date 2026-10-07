---
status: shipped
date: 2026-10-04
reviews: youcoded commit bb7680b44 (step 2 of 2026-10-04-page-live-socket-and-camera-video.md, Part 1)
---

# Code review: live-socket step 2 (main platform, IPC on every surface, page bridge)

Read-only review. Read all of page-live-socket.ts, pages-ipc.ts, pages-remote.ts, page-socket-host.ts,
use-page-sockets.ts, the remote bridge, the service/preload/remote-server/shim/mock/Kotlin diffs and the
test list. I did not run the suite. Two findings (1, 2) were checked against the real source (remote-server.ts
`removeClient`, and `node_modules/ws` 8.21.3 `receiverOnError`).

Summary: the ownership model is sound (main-made ids, owner key from the window/remote client, page+frame
must match, one answer for "no such socket" and "not yours", events to one recipient, no broadcast, no restore
queue). The deny check sends exactly what it checked. The key never reaches a page, and every received text is
redacted before batching. The defects are in lifecycle: one required cleanup is missing, one is dead code in
production, and two paths leave the page believing a socket is open when it is not.

## Findings

### 1. HIGH — a remote client that drops does NOT close its sockets; the only guard is a text-search test
`desktop/src/main/remote-server.ts` ~line 818 (`stop()` loop) vs `removeClient()` ~line 903;
`desktop/tests/ipc-channels.test.ts` (last new `it`)

Problem: `closeOwner(clientOwnerKey(client.id))` was added only inside `stop()` (server shutdown). Every real
drop (socket close, error, liveness-ping timeout, device unpaired) goes through `removeClient`, which was not
touched (it still only does `handoffRoute.cancelOwner`). So a phone that loses signal leaves its sockets alive
until the 60 s lease expires. User-visible: the phone reconnects (new client id) and the page's reopen is
refused with "at most 2 live connections" for up to a minute, because the per-page cap counts the zombie
sockets (also the 4-per-owner and 8-per-app caps). Devices keep a live feed open for nobody meanwhile. The
spec's accepted item (review 1, "client sockets closed in drop()") is not met. The commit message says it is.

The pinning test passes anyway: it only checks that the string `sockets.closeOwner(clientOwnerKey(client.id))`
exists somewhere in remote-server.ts, and the `stop()` hunk contains it. That is the exact failure the
workspace's "pinning test" rule warns about. Also the inserted lines in `stop()` are mis-indented.

Fix: call `getPagesService()?.sockets.closeOwner(clientOwnerKey(client.id))` inside `removeClient()` (it is
the single path every forget goes through; keep or drop the `stop()` copy, `stop()` already clears `clients`
without calling it). Replace the grep test with a behavioural one: build a RemoteServer test double (or call
`removeClient` through the existing remote-server test harness), open a socket for a client, remove the
client, assert `sockets.count === 0`. If that is too heavy, at minimum assert the string appears inside the
`removeClient` body, not anywhere in the file.

Triage: accepted — fix after step 3: closeOwner from removeClient (the real drop path); replace the text-search pin with a behaviour test.

### 2. MEDIUM — "a message over 1 MB ends it for good" is dead code with the real `ws`; it retries forever
`desktop/src/main/pages/page-live-socket.ts:259-264` (error and close handlers); test at
`desktop/tests/page-live-socket.test.ts:360`

Problem: for an over-size message `ws` 8.21.3 calls `websocket.close(1009)` and then emits **'error'**
(RangeError, code `WS_ERR_UNSUPPORTED_MESSAGE_LENGTH`) in the same step (`receiverOnError`,
lib/websocket.js:1201-1219); 'close' comes later. The error handler runs first and calls `dropped()`, which
bumps `gen`, so the later 'close(1009)' is "stale" and is ignored. Result: a device whose first answer is
over 1 MB (a big house's `subscribe_entities`) is reconnected with backoff for 10 minutes, each time
re-downloading the same oversized message, instead of being closed with the plain reason. The test passes
because its fake socket emits only `close(1009)`, never the error `ws` emits first.

Fix: in the 'error' handler, if `(e as any)?.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'` call
`finish(... larger than the app will pass ..., true)` and return (keep the 1009 close branch too). Change the
test's fake to emit error-then-close the way `ws` does, and add one case against the real `ws` stand-in
server (the file already has one) sending 1.1 MB.

Triage: accepted — fix after step 3: treat ws 'error' with close code 1009 / message-too-big as final; test against the real ws.

### 3. MEDIUM — a remote client that is too slow loses the socket silently; the page is never told
`desktop/src/main/pages/page-live-socket.ts:363-368` (`deliver`, `finish(..., false)`),
`desktop/src/main/pages/pages-remote.ts:25-30`; test `page-live-socket.test.ts:370`

Problem: on `'backed-up'` main calls `finish(s, 'Your phone is not keeping up...', false)`. `tell=false` means no
'closed' event is pushed, so the page's handle stays 'open' forever: its `send()` returns true, nothing is
ever sent (main refuses an unknown id), and the card keeps showing stale numbers with no error. The
message in the code is never delivered. (The comment on `finish` says tell=false is for "the owner asked for
it", which is not this case.) The test asserts only that the count dropped and the wire was terminated, not
that the page heard anything.

Fix: `finish(s, why, true)`, and let `sendToClient` pass a `state: 'closed'` event even when over the backlog
(one tiny frame; the client is still connected, just slow). Assert in the test that the last event pushed to
the owner is `closed` with that reason. (Also: the phone side could additionally close its entries when it
sees its backlog drain, but telling it is the minimum.)

Triage: accepted — fix after step 3: a socket closed for a slow remote client sends 'closed' (reason) when it can, and the shim's bridge marks it closed.

### 4. MEDIUM — hub disposed while the page's frame stays mounted: the page keeps a dead "open" socket
`desktop/src/renderer/components/pages/use-page-sockets.ts:202-217`, `PageHost.tsx:333` and :352/:483

Problem: `usePageSockets` is active only while `open && ready && !awaitingApproval`, but the iframe itself is
rendered whenever `load.state === 'ready' && !awaitingApproval`, and PageHost deliberately stays mounted,
invisible, while Office documents are open (`officeKept`, line ~339-352). If the person leaves Pages with an
Office document open, `open` goes false, the effect cleanup disposes the hub (closing every socket in main),
but the frame is still alive and **nobody tells the page**: its handles say 'open', sends go nowhere. When
the person returns, a NEW hub with a new frame id starts and knows nothing of the page's old ids, so the page
stays dead until reloaded. (Same shape for `awaitingApproval` flipping on, though the frame is then removed.)
The test "closing the page view closes every socket" asserts only the main-side close.

Fix: when the effect ends for a reason other than the document changing/unmount, `dispose()` should post
`closed` ("This page is not on screen") to the page for each live local id before clearing; or, better and
consistent with the hidden rule, treat `!active` as 'paused' (close in main, tell 'paused', reopen when
active again) rather than disposing. Add a test where `active` toggles false then true with the same docKey.

Triage: accepted — fix after step 3: tie the hub to the frame's life, not the page view; tell the page 'closed' when the hub goes.

### 5. LOW — a first attempt that never opens does not close after 10 s with the real client
`desktop/src/main/pages/page-live-socket.ts:69-78, 241-246, 259`

Problem: `defaultConnect` sets `handshakeTimeout: openWaitMs` (10 s), and the module's own open timer is also
10 s but is created after `ws` makes its own. `ws` fires first: it aborts and emits 'error' ("Opening
handshake has timed out"), the error handler calls `dropped()` (which clears our timer), and the page gets
'reconnecting' for up to 10 minutes instead of the accepted "10 s wait for 'open', then closed with a plain
reason". A refused connection (ECONNREFUSED) on the very first attempt behaves the same: reconnecting, not
closed. Test uses a fake with no handshake timer, so it cannot see this.

Fix: drop `handshakeTimeout` (the module's timer is the single owner of that rule), and in the error handler,
when `!s.sawOpen && s.tries <= 1`, `finish(... plain reason ..., true)`; add a `sawOpen`/"first attempt"
flag so the rule is about the first connect only, as accepted. Test with the real `ws` against a port that
never completes the handshake or is closed.

Triage: accepted — fix after step 3: our own 10 s first-open timer wins (handshakeTimeout set above it, or the first attempt's timeout is treated as final).

### 6. LOW — per-message JSON.parse for the whole life of the socket
`desktop/src/main/pages/page-live-socket.ts:318-329`

Problem: any message of 4096 characters or fewer is `JSON.parse`d to look for the login reply, forever.
Home Assistant event pushes are almost all small, so every state change costs a parse in main that can never
matter (the login reply comes first). Breaks "per-event cost does not grow".

Fix: parse only until the reply you are waiting for has been seen (`!s.sawReady`), and stop after the stable
timer/`markStable` when only `authFailedType` is set (a wrong-key reply comes before any event). A cheap
`raw.startsWith('{"type":"auth')`-style pre-check is NOT safe (key order); just stop parsing once logged in.

Triage: accepted — parse only until socketReady/socketAuthFailed has been seen, then skip.

### 7. LOW — flood accounting is O(messages in window) per message
`desktop/src/main/pages/page-live-socket.ts:311-317`

Problem: every message re-filters and re-sums the whole 10 s `flow` array. A device sending many tiny messages
(up to the 2 MB cap, so tens of thousands of entries) makes each message cost proportional to the backlog.

Fix: keep a running byte total; drop expired entries from the head (`shift` while old) and subtract.

Triage: accepted — running byte counter over fixed buckets.

### 8. LOW — page messages that are refused do not count toward the send rate limit
`desktop/src/main/pages/page-live-socket.ts:155-162`

Problem: `sentAt.push(now)` runs only after a successful send. A page can spam 64 KB messages that fail
`JSON.parse`/the deny check at any speed; each costs a parse and a string building in main (shared by every
window). Not a data risk, a main-thread cost the 20/s rule was meant to bound.

Fix: record the attempt (`sentAt.push(now)`) before `checkOutgoingSocketMessage`; or check size first (already)
and count every call that gets past the open-state check.

Triage: accepted — refused sends count toward the rate limit.

### 9. LOW — a device that logs in and then drops straight away reconnects every second forever
`desktop/src/main/pages/page-live-socket.ts:327, 299`; test `page-live-socket.test.ts:426`

Problem: seeing the "logged in" reply calls `markStable()` at once (attempt 0, `downSince` cleared). A device
(or proxy) that accepts the login and then closes within a second will be retried every 1 s with no give-up,
bounded only by the 120/min page gate. That also eats the same page's fetch budget. The test pins this as
intended ("starts over at one second after a login that worked"); it should instead require the connection
to have stayed up.

Fix: use the stable timer for both cases: after 'open' (and, when a ready type exists, after the ready reply),
mark stable only once the socket has stayed open `stableMs`; a close before that keeps backing off.

Triage: accepted — backoff resets only after the connection stays open 30 s past socketReady.

### 10. LOW — `owner.push` can throw inside timers and ws callbacks
`desktop/src/main/pages/page-live-socket.ts:363-373, 397`; `pages-ipc.ts:71-76`; `pages-remote.ts:25-30`

Problem: `deliver`/`finish` call `owner.push` unguarded. `webContents.send` can throw for a frame being torn
down even after the `isDestroyed()` check (a race), and `ws.send` can throw. These calls run in a `setTimeout`
(batch flush), a ws 'message' handler and the lease timer, so a throw is an uncaught exception in the main
process. Also: `dropped()` can call `flush` -> `deliver` -> `finish` and then goes on to arm a backoff timer on
a closed record (harmless, `reconnect` returns at once, but a leaked timer for 1-30 s).

Fix: wrap `owner.push` in try/catch inside the two owner factories (return 'gone' on a throw); in `dropped`,
`if (s.closed) return` after `flush`.

Triage: accepted — owner.push wrapped; a failed push closes that socket.

### 11. LOW — hub silently ignores some page requests; the page's handle stays 'connecting' forever
`desktop/src/renderer/components/pages/page-socket-host.ts:154-157`

Problem: a bad id, a ninth open (`MAX_LOCAL`), or a URL over 2048 characters are dropped with `return true`
and no event, so a page waiting on `onState` never learns. Also, after a hidden-to-visible reopen, a refusal
(rate gate full after a few quick hide/show cycles) turns a previously fine socket into a permanent 'closed'
with no retry (line 116); consider treating a transient refusal on resume as 'paused' and trying again later.

Fix: for the over-limit and bad-URL cases, post `closed` with a plain reason (valid string ids only; for a bad
id there is nothing to address, ignoring is right). For the resume refusal, keep 'paused' and retry on the next
visibility change or after a delay.

Triage: accepted — every ignored request answers the page with 'closed' and a reason.

### 12. LOW — a manifest or code change is only noticed after a page was listed through `listAndWatch`
`desktop/src/main/pages/pages-service.ts` (`closeSocketsOfChangedPages`, `seenSignature`); `pages-remote.ts:41`

Problem: the signature is recorded only in `listAndWatch()`. A remote client lists through `store.list()` (no
recording). If a page is first listed through `listAndWatch` AFTER a socket opened on it, the first sighting
"only records", so an edit made in between (for example the manifest loses a `socketDeny` entry) does not
close the socket, and `s.deny` keeps the old list until the next reconnect. Narrow (needs a remote-only
session first), but the rule is "a manifest change closes the page's sockets".

Fix: also seed/refresh the signature when a live socket is opened (read it from the same check chain the open
already runs), or make `pages:list` on the remote side go through `listAndWatch`.

Triage: accepted — the change signature is seeded on first socket open too.

### 13. INFO — the builder's stated deviations
- **Malformed `socketDeny` drops the whole device connection: accept.** Fail-closed is right for a safety
  list, and it matches the accepted "strict" triage. Two caveats: the page author gets no sign why the device
  line vanished (the page just reports "not approved"), so a manifest warning in the page-builder skill output
  would help; and the neighbouring profile fields (`socketReady`, `socketAuthFailed`, via `cleanReplyType`) are
  still silently dropped when invalid. A bad `socketAuthFailed` means a wrong key is never recognised, so the
  socket would retry logins for 10 minutes (Home Assistant bans an address after repeated failed logins).
  Consider the same strict treatment for those two.
- **Channel constants in `shared/pages-types.ts` `PAGE_SOCKET_CHANNELS` instead of `IPC`: accept.** Preload
  must inline strings either way, and `ipc-channels.test.ts` pins preload, handlers, shim, server, Kotlin and
  the types file together. It does deviate from "every channel in `IPC`", so any tool that walks `IPC` to
  find channels will not see these five; the test is the only guard. Add a one-line WHY note in `shared/types.ts`
  `IPC` near the PAGES entries pointing to the constant.
- **`paused` made only by PageHost: accept.** Correct and simpler. Main cannot know the window is hidden, and
  the hub also stops the lease pings while hidden (no timer ticks; verified by test). Finding 4 is the one gap:
  leaving the page view with the frame still mounted should be the same pause.
- **Remote backlog 4 MB: accept.** Well above the 256 KB push and the 1 MB single-message ceiling, so one
  full message never trips it. Note `bufferedAmount` is the whole socket's backlog (terminal output shares it),
  so a phone busy catching up on a transcript can lose a live socket; the page then must reopen (finding 3
  makes sure it learns).

### 14. INFO — checked and found sound
- Owner/recipient: events go through `sender.send` to the asking window only, or `sendToClient` to one
  client; no `broadcast`, no restore queue (pinned by a grep test that does hold, because those names are
  absent). `owned()` requires owner key, page and frame; id is 128-bit random.
- Deny: `JSON.stringify(parsed)` is what is sent; nested `type`, duplicate-key collapse, case/whitespace and
  unicode-escape forms all end up checked on the value that goes out. Greeting is never checked, as intended.
- Key: only inside the approved greeting/upgrade headers; error text, `why` strings and every received message
  are redacted (`redact` also covers the URL-encoded form); binary frames never forwarded.
- Approval chain re-run on every connect; `closeFor` is called from approve, removeConnection,
  deleteSavedKey (with the right connection id), and from list-diff for code/manifest change or removal.
- Window lifecycle: main-frame cross-document navigation (Ctrl+R, HMR full reload), render-process-gone and
  destroyed all close the window's sockets; subframe and same-document navigation do not.
- Generation tagging handles the error-then-close double report, late opens, and closes during a reconnect
  wait or while the first connect is being checked.
- Parity: preload, ipc-handlers path (pages-ipc), remote-server (pages-remote), remote-shim bridge (incl.
  `connectionLost` telling every live id 'closed'), Kotlin not-implemented list, mock shim all carry the five
  channels. The mock's `socketOpen` is not an owner/lease model; fine for a workbench.
- Tests: timer-based tests use fake timers with `advanceTimersByTimeAsync` (no real sleeps); one real `ws`
  stand-in server block exists. The weak spots are the fake-ws tests that cannot emit what real `ws` emits
  (findings 2, 3, 5) and the source-text pin in finding 1.
