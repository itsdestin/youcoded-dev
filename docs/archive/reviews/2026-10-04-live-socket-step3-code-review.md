---
status: shipped
date: 2026-10-04
reviews: youcoded commit 4a0215be5 (step 3: camera video played by the app, Part 2)
---

# Code review: live-socket step 3 (camera video)

Read-only. Read page-live-video.ts, page-video-sdp.ts, page-video-host.ts, the net-guard / connections /
service / IPC / remote / preload / page-theme / use-page-sockets / remote-bridge / pages-types diffs, the
fake camera, and the test titles. The address-filter findings (1, 2) were run against the real code, not
just read. I did not run the suite.

Checked and fine: template filling (single pass, JSON-escaped values, `{{target}}` inside an offer is not
re-read; filled text goes through the deny check); target (`^[a-z0-9_]+$` after an approved dotted prefix;
a manifest pattern never runs); `socketPath` (regex allows only `[A-Za-z0-9_./-]`, starts `/`, no `..`; a
`//x` start stays on the approved host; no scheme, `?`, `#`, `@`, `\`; the whole `videoProfile` is in the
approval fingerprint); ids are main-made and owner/page/frame-checked; `videoPlayback` is set only in the
workbench mock (no real preload or remote bridge sets it, and a sandboxed frame cannot reach the parent's
bridge); fingerprint changes and key deletion close videos through `closeLiveFor`; `removeClient` path goes
through `getPagesService().closeOwner`, which now covers videos; start-race (page stops while main answers)
is handled by `stale()`.

## Findings

### 1. HIGH — expanded IPv6 spellings of loopback / metadata pass the never-dial check
`desktop/src/main/harness/tools/net-guard.ts` `isNeverDialIp` (the new function, ~lines 60-79)

Problem: it compares strings (`lower === '::1'`, `startsWith('::ffff:')`, `startsWith('fd00:ec2:')`), so any
other spelling of the same address is "usable". Run against the real function, `isIP` accepts each of these
and `isNeverDialIp` returns false: `0:0:0:0:0:0:0:1`, `0::1`, `::0001`, `::127.0.0.1`,
`0:0:0:0:0:ffff:127.0.0.1`, `0:0:0:0:0:ffff:7f00:1`, `fd00:0ec2::254`, `0:0:0:0:0:0:0:0`. Through
`filterAnswerSdp` an `a=candidate:... 0:0:0:0:0:0:0:1 5 typ host` line is kept and counted usable
(verified). So a hostile device (or anything between it and the app on plain ws) can make the app's peer
connection send its connectivity checks to this computer or to the cloud-metadata block, which is exactly
what R2-7 / R3-5 exist to stop. The tests only cover the compact forms (`::ffff:169.254.169.254`,
`::ffff:a9fe:a9fe`).

Fix: parse the address to 16 bytes first (expand `::`, accept a trailing dotted v4, drop a `%zone`), then
test the bytes: all zero or `::1` (loopback/unspecified), first 10 bytes zero with bytes 10-11 = `ffff`
(v4-mapped) or first 12 bytes zero (v4-compatible) then apply the v4 rules to the last four bytes,
`fe80::/10`, `fd00:0ec2::/32`. Consider also dropping multicast (`224/4`, `ff00::/8`), `255.255.255.255`
and `100.100.100.200` (a cloud metadata address); none is ever a camera. Add the spellings above (and
upper-case) as table rows in page-live-video.test.ts next to line 270.

Triage: accepted — parse addresses to bytes and test the bytes; also check whether the existing home-address check (assertHomeHttpUrl / net-guard tables) has the same string-compare weakness and fix it there if so.

### 2. MEDIUM — `c=` / `a=rtcp` / trickled-candidate checks are string-shape dependent
`desktop/src/main/pages/page-video-sdp.ts:36-47` (`filterAnswerSdp`), `:58-66` (`filterCandidate`)

Problem (verified by running it): (a) `c=IN  IP4 127.0.0.1` (two spaces) does not match
`/^c=IN (IP4|IP6) (\S+)/`, so the line is passed through unchanged; same for `c=in ip4 127.0.0.1` and for
`a=rtcp:9 IN  IP4 ...`. Whether libwebrtc accepts the odd spacing is not something to bet the check on.
(b) A trickled candidate string containing a line break, e.g.
`"candidate:1 1 udp 1 192.168.1.2 5 typ host\r\na=candidate:2 1 udp 1 127.0.0.1 5 typ host"`, is accepted
(only the first line's address is looked at) and handed to `addIceCandidate` verbatim.

Fix: tokenise with `split(/\s+/)` and match the type case-insensitively; treat ANY `c=` line that is not
exactly `c=IN IP4|IP6 <usable|0.0.0.0|::>` as rewritten to the no-address form, and drop any `a=rtcp` line
that does not parse and pass. In `filterCandidate` reject any value containing `\r`, `\n` or other control
characters, and rebuild the candidate from the parsed fields rather than passing the original string.

Triage: accepted — parse c= lines by tokens, case-insensitively; refuse any candidate or SDP text containing CR/LF beyond line structure.

### 3. MEDIUM — the host never learns that main ended the video silently (frozen picture for up to 5 minutes)
`desktop/src/main/pages/page-live-video.ts:210-214` (`push`, `finish(..., false)` on `backed-up`/`gone`) and
`page-video-host.ts` `syncPinger` (the ping's result is dropped)

Problem: same shape as step-2 item 3, with a video-specific consequence. When a remote phone is too slow,
main calls `finish(v, ..., false)`: no `video-stopped` is pushed, the device socket is closed (so Home
Assistant stops the stream), but the host keeps its peer, element and pump, the page keeps showing "playing"
and a frozen last picture. The host pings every 20 s, main answers `{ok:false, 'That video is not playing
any more.'}`, and the host ignores the answer (`.catch(() => {})` only handles rejection). Nothing ends it
until the 5-minute timer or the peer fails.

Fix: (a) as in step 2, tell on `backed-up` (a final small `video-stopped` frame is allowed past the
backlog). (b) In the host's ping, if the result is `ok === false`, call
`end(id, 'The video stopped.', { tellMain: false, tellPage: true })`. This also covers any other main-side
silent finish. Add a host test "a refused ping ends the video".

Triage: accepted — main tells the host 'stopped' on backed-up/gone; a failed ping stops the video with a reason.

### 4. MEDIUM-LOW — a device's text can still carry the key to the page, via JSON escapes
`desktop/src/main/pages/page-live-video.ts:~150` (`JSON.parse(redact(raw, v.secrets))`), `:~170`
(`failed.slice(0, 300)`)

Problem: the reply is redacted as raw text and then parsed. A device that writes the key with JSON escapes
(`abc...`, or `\/`) is not matched by the text redaction, and after `JSON.parse` the unescaped key sits
in `msg`. The `failed` text goes to the page (`video-stopped.why`). The device already knows the key, so
this is a leak to the page, not to the device; but the stated rule is that the page never gets the key and
the same order would also protect the SDP answer text. Redact-before-parse is only sound for text that is
not decoded afterwards.

Fix: redact again after extraction: `redact(failed, v.secrets).slice(0, 300)`, and run the answer string and
candidate JSON through `redact` once more before `push`. Keep the first redaction (it protects the log
paths). Add a test with a `\u00xx`-escaped key in a failure text.

Triage: accepted — redact again after extracting each field.

### 5. MEDIUM-LOW (performance) — no frame-rate or size ceiling on the pump
`desktop/src/renderer/components/pages/page-video-host.ts` `startPump` / `send`

Problem: a bitmap is made for every video frame as soon as the page acks the last. Nest runs 640x360 at
about 6 fps (measured in the spec), but a 1080p/30 camera would mean 30 full-size `createImageBitmap` copies
a second per video, times up to 4 videos, regardless of what the page does with them. A page that acks
instantly and draws nothing costs the user CPU and battery for 5 minutes. The decoded `<video>` also keeps
running when the pump is idle (one picture out, page not acking).

Fix: a minimum gap between bitmaps (e.g. 100 ms, about 10 fps) checked at the top of `send` before
`createBitmap`, and `createImageBitmap(source, { resizeWidth: 1280, resizeQuality: 'low' })` when the source
is wider (keep aspect). Optionally: no ack for 10 s means the page is not drawing, so stop the video with a
plain reason instead of decoding for nobody.

Triage: accepted — cap ≤ 15 fps and ≤ 1280 px wide in the pump.

### 6. LOW — a bitmap is leaked and the pump stalls when the post silently goes nowhere
`desktop/src/renderer/components/pages/use-page-sockets.ts:~29` (`post`), `page-video-host.ts` `send`

Problem: `frameRef.current?.contentWindow?.postMessage(message, '*', transfer)` does nothing, and does not
throw, when the frame is gone, so `send`'s `catch { bitmap.close(); ... }` never runs: the bitmap is not
closed and `outstanding` stays set. The existing test (page-video-host.test.tsx:251) throws from `post`,
which the real code never does. The hub is disposed right after in practice, so the cost is one bitmap until
GC; still the test does not test the real path.

Fix: have `post` return a boolean (false when there is no contentWindow) and close the bitmap on false;
change the test to use that. Same for processor-path `VideoFrame`s left queued in `reader.cancel()`: close
them while draining if the reader supports it.

Triage: accepted — close the bitmap when the frame is gone.

### 7. LOW — only a failed connection is noticed, not a stalled or disconnected one
`desktop/src/renderer/components/pages/page-video-host.ts` (`connectionstatechange` handler)

Problem: only `failed` ends the video. After the first picture the no-picture timer is cleared, so a camera
that goes away (state `disconnected`, no more frames) leaves the last frame showing as "playing" until the
browser eventually declares failure or 5 minutes pass. The pump already has a stall watchdog; it only
switches to the track reader.

Fix: end with a plain reason when `disconnected` lasts more than ~8 s, or when no frame has been produced for
~15 s while `playing`.

Triage: accepted — also stop on 'disconnected' lasting 10 s and on no frame for 15 s while playing.

### 8. LOW — the `videoPlayback` seam is a production code path with no pin
`desktop/src/renderer/components/pages/use-page-sockets.ts:~31`, `desktop/src/shared/pages-types.ts` (`videoPlayback`)

Problem: today only the workbench mock sets it, and a page cannot reach it. But the swap is a bridge
property read in the real host, so a future real bridge, or any code that can write `window.claude.pages`,
could hand the host its own fake peer and see raw frames/candidates. Nothing pins "real bridges never set
it"; the comment is the only guard.

Fix: a small test in desktop/tests that fails if `videoPlayback` appears in `preload.ts`,
`remote-pages-bridge.ts` or `remote-shim.ts` (one grep over three files; positive-only assertions are not
needed). Optionally honor the seam only when a workbench flag the mock already sets (e.g. `__WORKBENCH__`)
is present.

Triage: accepted — a pin that only the workbench mock sets videoPlayback.

### 9. Test quality
- No row for expanded IPv6 / v4-compatible / odd-spacing `c=` (findings 1-2), so the tests pass while the
  checks have holes. The `c=` test (page-live-video.test.ts:293) covers only a loopback v4 with normal spacing.
- No host test that a refused ping (`ok:false`) ends the video (finding 3), and none that main's silent
  `finish(..., false)` is eventually noticed.
- page-video-host.test.tsx:251 makes `post` throw; the real `post` never throws (finding 6).
- No test that a candidate containing a line break is dropped (finding 2b).
- `mock-shim.test.ts` / ipc-channels additions are fine; parity of the three new channels is pinned.

Triage: accepted — tests for each of the above.
