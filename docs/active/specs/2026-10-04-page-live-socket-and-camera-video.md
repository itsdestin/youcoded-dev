---
status: active
date: 2026-10-04
revision: 4 (after design reviews 1–3 — docs/active/reviews/2026-10-04-page-live-socket-design-review-{1,2,3}.md; [n] = review 1, [R2-n]/[R3-n] = reviews 2/3)
source: home-page-next.questions (Q-speed "instant" + note "reusable tooling … part of the page platform, with appropriate guardrails"); camera decision in chat 2026-10-04 ("yes, a. event history recordings should also be able to play"); home-page-next-designs (C-camera "events")
branch: youcoded session/ha-pages-connection
builds on: 2026-10-01-device-live-connection.md (the one-shot socket exchange)
stage: built on session/ha-pages-connection, awaiting merge (see "As built" at the end)
---

# A page's live connection to its home device, and camera video played by the app

## What Destin asked for

1. **Instant updates** (Q-speed): a card changes the moment the device does. As **platform
   tooling** any future page can use, with guardrails.
2. **Live camera video in the page**, option A: *the app plays the video and hands the page
   only the picture*, so a page never gets a line out of its sandbox.
3. **Recorded events play** (person, motion, doorbell clips) on the camera card (C-camera "events").

## What was measured (2026-10-04, his real Home Assistant)

- His Nest cameras offer **only WebRTC** (`camera/capabilities` → `["web_rtc"]`).
- Offer → `camera/webrtc/offer` → answer: **video plays (640×360, ~6 fps) while the websocket
  stays open**; closing it right after the answer gives 0 frames — Home Assistant stops the
  stream when the subscription ends.
- The frame's CSP ends in `webrtc 'block'` on purpose; that stays.
- No Nest clip saved since 2026-06-10: recordings also need his Google Pub/Sub fixed (his action).

## The device's profile (approved, never page-chosen) [3, 13, 30, 1, 2]

Main stays protocol-neutral by reading what it must know about the device from the page's
**approved manifest**, which rides the approval fingerprint (changing any of it asks again,
and the approval card says what it allows):

```js
// on the Home page's `ha` device connection
socketHello: '{"type":"auth","access_token":"{{key}}"}',   // exists today
socketReady: 'auth_ok',          // the reply TYPE that means "logged in" [R2-6]
socketAuthFailed: 'auth_invalid',// the reply TYPE that means "wrong key": closed, never retried [R2-12]
socketDeny: ['config/'],         // added to main's built-in floor (below)
videoProfile: {
  targetPrefix: 'camera.',       // what a page may ask to watch [R2-4]
  send: '{"id":1,"type":"camera/webrtc/offer","entity_id":{{target}},"offer":{{offer}}}',
  answer: 'event.answer', candidate: 'event.candidate', failed: 'event.message',
}
```

**Fingerprint [R2-5]:** one `|profile:` segment — the JSON of the cleaned profile (these fields
only, types and lengths checked by `parseConnections`, keys sorted). `socketHello` moves inside
it. Consequence Destin will see: the Home page asks for approval once more after this ships [R2-13].

**Template filling [R2-1, R3-1]:** one pass; `{{offer}}` and `{{target}}` are replaced by
`JSON.stringify(value)` (so templates write them unquoted); `{{key}}` stays string content
inside quotes, as today, and a `videoProfile.send` containing `{{key}}` is rejected; inserted
text is never filled again; `offer` ≤ 32 KB; the result must parse as a JSON object or
the video is refused. `target` = `targetPrefix` + 1–64 characters of `[a-z0-9_]`, checked in main
— no page-authored pattern ever runs in main [R2-4].

**Reading a message's type [R2-2]:** main `JSON.parse`s every page-written message on a device
socket. Refused: not JSON, an array, not an object, a missing or non-string `type`, or raw text
naming `"type"` more than once. The trimmed, lower-cased type is compared by prefix against the
deny list. The filled video template passes the same check.

**Built-in floor [R2-3]:** main always denies `auth/`, `config/auth` and `person/` on every
device socket, whatever the manifest says; a manifest can only add. Threat covered: a page
(or a later edit of it) minting a new key for itself or changing who may log in. Not covered:
anything else an admin key can do, which the approval already grants (it is a full-control key).

`socketDeny` is checked in main on **every** outgoing message, the one-shot exchange included
(closing a hole that exists today: a full-access page could ask Home Assistant for a new
long-lived key, which redaction cannot recognise) [3].

## Part 1 — the live socket (platform)

### For a page

```js
var s = youcoded.socket(base + '/api/websocket', {
  onState: function (state, why) {}, // 'connecting' | 'open' | 'reconnecting' | 'paused' | 'closed'
  onMessages: function (texts) {}    // text messages, in order, batched
});
s.send(text);   // refused unless 'open'
s.close();
```

- **Every `'open'` is a fresh connection.** Main sends the greeting first; the page must wait
  for its device's own "logged in" reply (`auth_ok`) in `onMessages` before subscribing, and
  subscribe again after every `'open'` [15]. The page-builder skill carries the pattern.
- `'paused'` means only that the window/browser tab is hidden (`document.visibilityState`):
  the app closes the connection and reopens it when visible (one rate-gate slot), so the lease
  runs only while visible and a throttled background tab cannot be mistaken for a dead one [R2-11].
  Leaving the page, switching pages or reloading it **destroys the frame**, and its sockets
  close with it [10].

### Path and ownership [4, 5, 10, 11, 16, 24]

page `postMessage` (new constants beside `PAGE_FETCH_MESSAGE`; events accepted only when
`e.source === parent`) → `PageHost` (shape checks: strings only, ≤ 64 KB; page-local ids,
mapped to main's ids, so a frame can never name a main id) → IPC
`pages:socket-open | -send | -close | -ping` → main `page-live-socket.ts`.

- Main **generates** the socket id (unguessable) and records its owner (window or remote
  client, and page). Send/close/ping from anyone else are refused.
- Events go **only to the owner**: `webContents.send` for a window; a new `sendToClient` for a
  remote browser, **not** `broadcast`, **not** the restore queue. A socket whose remote client
  is backed up is closed (never the client's connection).
- Socket state in `PageHost` is keyed to the **frame instance**; unmount or `srcDoc` change closes
  them.
- **Lease** [11]: `PageHost` pings each socket every 20 s; main closes any socket silent for
  60 s. Also closed on `webContents` `did-start-navigation` / `render-process-gone` /
  `destroyed` and on the remote client's `drop()`. A crash or Ctrl+R cannot leak sockets.
- Remote shim: when its own connection to the computer drops, every live socket reports
  `'closed'` ("lost the connection to your computer") [16].
- Android native: `SessionService.kt` lists every `pages:*` channel and answers
  not-implemented; the new channels are added to that list [22]. Parity test `PHASE_2`, the
  preload event subscription, the shim dispatch and the workbench mock are extended [23].

### Guardrails (all in main)

One shared check function serves the one-shot exchange and every live (re)connect, so they
cannot drift [12]: a `device` connection, `covers` host AND port, approved at the current
fingerprint, `access: 'full'`, a saved key, `assertHomeHttpUrl` (re-resolved each time [9]),
no redirects, key only inside `socketHello`, every received message redacted **before**
batching [27], text frames only.

| Rule | Value |
|---|---|
| Live sockets | 2 per page, 4 per window/client, 8 per app [6]. Videos counted apart: 4 per page, 6 per app (raised from 2 and 4 for the Home page's Cameras tab, which runs every camera at once; the frame pump's per-video ack, 15 fps and 1280 px limits are unchanged); their sockets are main's own [R2-10] |
| Rate | every open and reconnect takes a `PageRateGate` slot [25] |
| Reconnect | 1, 2, 4 … 30 s; give up after 10 min down. Only a reply whose type equals `socketAuthFailed` ends it at once (no burst of failed logins that could get the computer banned [13]); a quick close otherwise backs off as usual, so a Home Assistant restart is survived [R2-12] |
| State machine | generation-tagged; a timer is cancelled by show/close; a stale connection's messages are dropped; `send` refused unless `'open'` [14] |
| Approval | `closeFor(page, connection)` from `removeConnection`, `approve`, `deleteSavedKey` and any page change [12] |
| Out | ≤ 20 messages/s, ≤ 64 KB each, `socketDeny` checked |
| In | ≤ 1 MB per message (a whole house's first `subscribe_entities` answer is large — measured before fixing the number); pushed in batches every 100 ms, ≤ 256 KB per push; > 2 MB in 10 s closes the socket [20]; 20 binary frames close it [27] |
| Freshness | live traffic never marks the page "fresh" [17] |

### Instant updates on the Home page

After `auth_ok`: `subscribe_entities` with the page's entity ids. Each batch patches `rooms`
and redraws once per animation frame. The template check drops to **60 s** while live (it still
catches renames, rooms and new devices) and returns to **5 s** when not. "Reconnecting…" shows
only after 5 s in `'reconnecting'`.

## Part 2 — camera video played by the app [1, 2, 7, 18, 19, 26]

### For a page

```js
var v = youcoded.video('ha', 'camera.living_room_camera', {
  onFrame: function (bitmap, ack) {},   // draw on a <canvas>, then call ack()
  onState: function (state, why) {}     // 'starting' | 'playing' | 'stopped'
});
v.stop();
```

The page names **a connection and a target**, nothing else. It never sees or supplies SDP or
network candidates.

1. `PageHost` (outside the frame) creates the receive-only `RTCPeerConnection` (audio + video
   + the data channel Nest requires) and its offer.
2. IPC `pages:video-start { page, connection, target, offer }` → main: the shared check chain,
   the connection must carry a `videoProfile`, `target` must match its pattern, rate gate.
   Main opens **its own** socket to the device (not the page's), greets, waits for a reply of
   type `socketReady` [R2-6], sends the filled template, and reads the answer and candidates
   from the paths given. Candidates naming a hostname are dropped; the rest, and the answer
   SDP's `a=candidate` / `c=` lines, are filtered against loopback, link-local and
   cloud-metadata ranges (the `net-guard` tables) [R2-7]. Answers come from the approved
   device, never from the page. Videos use the socket machinery's owner ids, lease, events,
   `closeFor` and channel lists (`pages:video-start|stop|ping`, Kotlin, `PHASE_2`) [R2-9].
   In a remote browser the peer connection dials what the device answered from the phone's
   own network — a stated decision [R2-8].
3. Main keeps that socket open for the video's life; `pages:video-stop`, the page's frame
   going away, the lease, or 5 minutes close it (the card offers Play again).
4. Frames: `requestVideoFrameCallback` on a muted, inline `<video>` in `PageHost` →
   `createImageBitmap` at the source's size, scaled down only when wider than 1280 px (his Nest: 640×360) → transferred to the frame.
   **The next frame is sent only after the page acks**; bitmaps never sent are closed [18].
   Measured in the dev window minimised / scrolled; `MediaStreamTrackProcessor` where the
   callback stalls [19].
5. Limits: 4 videos per page (6 per app). Video signalling is main's socket, so a page needs only its one
   live socket for updates [26].

Decision, stated [7]: the page can read the pixels of a camera its approval already lets it
control. Rejected: a host-drawn overlay over the frame (fragile positioning inside a scrolling
frame, and the card's LIVE badge and Stop are drawn by the page) [28].

### The camera card (C-camera "events")

Recent events (person / motion / doorbell, with times and thumbnails), **Watch live** → the
picture becomes a canvas with a LIVE badge and Stop. "Watch live in Home Assistant" stays as the
fallback when video cannot start.

### Review 3 additions

- **Waiting limits [R3-2]:** 10 s for `socketReady` (video) and for `'open'` (live socket);
  then closed with a plain reason.
- **Hidden [R3-3]:** a video stops deliberately when the page is hidden (`'stopped'`, "paused
  while the page was hidden"); the card offers Play again. No automatic reopen.
- **Redaction [R3-4]:** the answer, candidate and `failed` texts are redacted like every
  received message before anything reaches the renderer.
- **Hostnames [R3-5]:** an answer-SDP line naming a hostname is dropped; an answer left with no
  usable candidate is refused.

## Part 3 — recorded events [8, 21]

- List: one-shot exchange `media_source/browse_media` on `media-source://nest/<device_id>`.
- Play: `media_source/resolve_media` → a short-lived signed URL on the same device;
  `youcoded.fetch(url, { as: 'video' })` → main fetches it (`video/mp4` only, `ftyp` checked,
  ≤ 4 MB with `content-length` checked first, one at a time per page) → `data:` URL.
- The frame's CSP gains `media-src data:` **only when the page has a device connection**.

## Tests

- `tests/page-live-socket.test.ts` (main, real `ws` stand-in): greeting substitution; deny
  list (live and one-shot); redaction before batching; every cap; owner checks; reconnect
  schedule; `socketAuthFailed` and quick-close give-up; each race in the state machine; lease;
  `closeFor` from each service method; re-check on reconnect.
- `pages:video-start`: refused with no device connection, no `videoProfile`, or a target off
  the pattern; candidate filtering; the socket closes on stop / lease / 5 minutes.
- `PageHost`: frame unmount and `srcDoc` change close sockets; `visibilityState` hidden →
  `'paused'`; a forged event (wrong source, unknown local id) resolves nothing; frame-pump ack
  and bitmap close.
- Parity: `ipc-channels` `PHASE_2`, Kotlin list.
- Home page (jsdom, pretend Home Assistant gains `subscribe_entities` and the camera offer): a
  state change updates the card with no template request; socket down → 5-second checks resume.
- By hand: live video from his Living Room camera in the dev window.

## Not in this

Audio; two-way talk; recording on demand; HLS; Android native Pages.

## As built (2026-10-05) — where the code differs from, or adds to, the text above

The code is the truth; read this section before trusting any line above it.

- **Channels are table entries.** After the one-core merge each `pages:*` channel (17 in all: the ten
  ordinary ones, `pages:fetch`, four `pages:socket-*`, three `pages:video-*`; `pages:socket-event` is the one push)
  is a `defineChannel` entry in `desktop/src/main/ipc/pages.ts`, served to both doors. The owner (calling window
  or phone, taken from the door, never the request), the push of events to that owner only and
  close-on-navigate/crash/destroy/phone-drop live in `main/pages/page-owner.ts`. The preload list is generated from
  `backend-contract.ts`; Android lists the same channels as not-implemented in `SessionService.kt`.
- **Caps as built:** sockets 2 per page, 4 per owner, 8 per app; videos 4 per page, 6 per app (the first drafts of
  this spec said 2/4). Frames to the page: at most ~15 a second, never wider than 1280 px.
- **Extras the text does not mention:** a connection with no `socketReady` counts as sound after 10 s open
  (`stableMs`); after `socketReady` it must stay open 30 s before the reconnect back-off resets (`readyStableMs`);
  a remote client with more than 4 MB unread loses the socket; a hidden page re-asks to open a few times when the
  opening-rate limit refuses; a video's device replies are capped at 256 KB / 200 messages.
- **Approval card:** a device with a login greeting or a "logged in" reply shows "Keeps a live connection open for
  instant updates."; one with a `videoProfile` shows "Can play camera video through the app." (both in
  `renderer/components/pages/page-connections.tsx`).
- **Recorded events, in practice:** Google gives no picture or clip for his Living Room and Back Door cameras
  (event image fetch fails with "not supporting RTSP"); the doorbell does. Those cameras' events are listed
  without a picture. Google rate limits (HTTP 429) back off 60/120/300 s in the page.
- **Not tried on real hardware:** more than 4 cameras at once, a 5-minute restart over time, remote browser video.
