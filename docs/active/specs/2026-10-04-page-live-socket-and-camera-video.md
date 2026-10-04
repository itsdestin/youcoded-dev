---
status: draft
date: 2026-10-04
source: home-page-next.questions (Q-speed "instant" + note "reusable tooling … part of the page platform, with appropriate guardrails"); camera decision in chat 2026-10-04 ("yes, a. event history recordings should also be able to play"); home-page-next-designs (C-camera "events")
branch: youcoded session/ha-pages-connection
builds on: 2026-10-01-device-live-connection.md (the one-shot socket exchange)
---

# A page's live connection to its home device, and camera video played by the app

## What Destin asked for

1. **Instant updates** (Q-speed): a card changes the moment the device does, instead of
   within 5 seconds. As **platform tooling** any future page can use, with guardrails.
2. **Live camera video in the page** — option A in chat: *the app plays the video and
   hands the page only the picture*, so a page never gets a line out of its sandbox.
3. **Recorded events play** (person, motion, doorbell clips), on the camera card he picked
   (C-camera "events").

## What was measured (2026-10-04, his real Home Assistant)

- His Nest cameras offer **only WebRTC** (`camera/capabilities` → `["web_rtc"]`); the Pi
  Zero camera offers WebRTC and HLS.
- In a browser, offer → `camera/webrtc/offer` over the websocket → answer: **video plays
  (640×360, ~6 fps) while the websocket stays open**. Closing the websocket right after
  the answer: connected, **0 frames**, then disconnected — Home Assistant stops the stream
  when the subscription ends. So live video needs a socket that stays open.
- The page frame's CSP ends in `webrtc 'block'` (page-theme.ts `pageCsp`) on purpose:
  WebRTC is a way out of the frame that `connect-src 'none'` does not close.
- No Nest event clip has been saved since 2026-06-10 (`.storage/nest.event_media`), so
  recordings also need his Google Cloud Pub/Sub delivery fixed (his action, in progress).

## Part 1 — the live socket (platform)

### For a page

```js
var s = youcoded.socket(base + '/api/websocket', {
  onState: function (state) {},   // 'connecting' | 'open' | 'reconnecting' | 'paused' | 'closed'
  onMessages: function (texts) {} // an array of text messages, in order (batched)
});
s.send(text);   // only while 'open'
s.close();
```

- **Every `'open'` is a fresh connection.** The app greets (the key) before `'open'`; the
  page then sends its subscriptions again. A page that subscribes once and never again is
  wrong after the first reconnect — the doc and the page-builder skill say so.
- `'paused'`: the page is hidden; the app has closed the connection and will reopen it,
  and say `'open'` again, when the page is shown. `'closed'`: for good (the page called
  `close()`, its approval was removed, or the device refused the key — `onState` carries a
  short reason as a second argument).

### Path

page `postMessage` → `PageHost` (shape check, as the fetch door) → IPC
`pages:socket-open | -send | -close` → main `page-live-socket.ts`. Main pushes
`pages:socket-event { socketId, kind: 'state'|'messages', … }` to **the window (or remote
client) that opened it**, never broadcast. `PageHost` forwards to its own frame only.
Remote browsers: `remote-server.ts` relays the three calls and pushes the event to that
client; `remote-shim.ts` exposes the same shape (parity test extended). Android native has
no Pages host today; nothing to mirror (verify before claiming in the commit).

### Guardrails (all in main; a renderer bug cannot widen them)

Everything the one-shot exchange checks, unchanged: a `device` connection, `covers` host
AND port, approved at the current fingerprint, `access: 'full'`, `assertHomeHttpUrl`,
no redirects, the key only inside the approved `socketHello` substituted in main, every
received message redacted, text frames only. Added for a socket that stays open:

| Rule | Value | Why |
|---|---|---|
| Live sockets per page | 2 | one for updates, one spare (video signalling may share the first) |
| Per app | 8 | a page opened in several windows cannot pile them up |
| Hidden page | host closes it (`'paused'`), reopens on show | performance rule 2: hidden means idle |
| Page closed / frame reloaded / window closed | closed | nothing outlives its page |
| Approval removed or fingerprint changes | closed with reason | the person withdrew permission |
| Reconnect | 1, 2, 4 … 30 s, give up after 10 min down (`'closed'`, reason) | a Pi reboot is survived; a dead device is not hammered |
| Out: messages | ≤ 20/s, ≤ 64 KB each | same per-message cap as the exchange |
| In: batching | coalesced to one push per 100 ms | per-event cost must not grow with chatter (perf rule 4) |
| In: volume | > 2 MB in 10 s → closed, reason "too much data" | a page subscribing to everything cannot flood the app |
| Device refuses the key (`auth_invalid`, close before `auth_ok`-shaped reply) | `'closed'`, no retry | retrying a wrong key is pointless |

How main knows "greeted OK" without knowing Home Assistant: it doesn't. It reports
`'open'` once the greeting is sent; the page reads `auth_ok` / `auth_invalid` itself.
Main only stops retrying when the device closes the socket within 2 s of the greeting
three times running.

### Instant updates on the Home page

On `'open'`: `subscribe_entities` with the page's entity ids (Home Assistant sends only
those, and only what changed). Each batch patches `rooms` and redraws once
(`requestAnimationFrame`). The 5-second template check becomes **60 seconds** while the
socket is open (it still catches renames, room moves and new devices), and goes back to
5 seconds whenever it is not. A small "Reconnecting…" line shows only after 5 s in
`'reconnecting'`.

## Part 2 — camera video played by the app

### For a page

```js
var v = youcoded.video({
  onOffer: function (sdp) {},          // send it to the device; reply with v.answer(sdp)
  onFrame: function (bitmap) {},       // an ImageBitmap; draw it on a <canvas>
  onState: function (state, why) {}    // 'starting' | 'playing' | 'stopped'
});
v.answer(sdp); v.candidate(candidateJson); v.stop();
```

The **app** owns the `RTCPeerConnection` and a hidden `<video>` in `PageHost` (outside
the frame, so the frame's `webrtc 'block'` stays). The page only does the signalling over
its own live socket (it knows its device's protocol; the app does not) and receives
**pixels**: each frame (`requestVideoFrameCallback` → `createImageBitmap`, ≤ 15 fps,
≤ 1280 px wide) is transferred to the frame by `postMessage`. A page cannot send anything
through the video, and the frame's CSP is unchanged.

- The offer is receive-only (audio + video, plus the data channel Nest requires).
- Sound off in v1; the app could play audio itself later (not exposed to the page).
- Limits: 2 videos per page; stops when the page is hidden, when the page calls `stop()`,
  or after 5 minutes (the card offers Play again). Nest streams expire at 5 minutes anyway.
- What the page learns: the SDP, which carries this computer's network candidates
  (home/Tailscale addresses). It can only send them to the device it is already allowed
  to reach. Stated here so it is a decision, not an accident.
- Remote browser: `PageHost` runs in that browser, so the peer connection is there too —
  the video goes straight from the camera service to the phone. Same code.

### The camera card (C-camera "events")

Living, recent events (person / motion / doorbell, with times and thumbnails), and
**Watch live** → the card's picture becomes the canvas with a LIVE badge and Stop.
"Watch live in Home Assistant" stays as the fallback when video cannot start.

## Part 3 — recorded events

Through doors that already exist, plus one CSP line:

- List: one-shot exchange `media_source/browse_media` on `media-source://nest/<device_id>`
  → events with titles, times, thumbnails.
- Play: `media_source/resolve_media` → a short-lived signed URL on the same device;
  `youcoded.fetch(url, { as: 'video' })` → main fetches it (≤ 8 MB, `video/mp4` or
  `image/gif` only) and returns a `data:` URL, the same way `as: 'picture'` does.
- The page's CSP gains `media-src data:` **only when the page has a device connection**
  (the bytes came through the checked door; nothing new is reachable).

## Tests

- `tests/page-live-socket.test.ts` (main, real `ws` stand-in, as the exchange test):
  greeting with key substituted only there; redaction; caps (out rate, in volume, per-page,
  per-app); reconnect schedule and give-up; close on approval removed; no redirect.
- `PageHost` test: hidden → `'paused'` + socket closed; shown → reopened; frame unload
  closes; a frame cannot address another page's socket id.
- Video: unit test of the frame pump's throttle and stop rules with a fake video element;
  real playback is checked by hand against his camera (measured path above).
- Home page (jsdom, pretend Home Assistant gains `subscribe_entities`): a state change
  arrives → card updates with no template request; socket down → 5-second checks resume.

## Not in this

Audio; two-way talk; recording on demand; HLS; Android native Pages.
