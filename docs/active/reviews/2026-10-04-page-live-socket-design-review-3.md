---
status: draft
date: 2026-10-04
reviews: docs/active/specs/2026-10-04-page-live-socket-and-camera-video.md (revision 3)
---

# Design review 3: page live socket and camera video

**Review-2 accepted items (1-13): all resolved in the text** (single-pass fill, JSON.parse type check,
built-in floor, `targetPrefix`, one `|profile:` fingerprint, `socketReady`, hostname/SDP filtering,
remote-network decision, video ownership, separate video caps, hidden = paused, `socketAuthFailed`
exact match, re-approval note). Findings below are NEW and small; one is a real contradiction.

1. **MEDIUM. The "unquoted placeholder" fill rule contradicts the existing `socketHello` template.**
   Spec line 52-53: every placeholder is replaced by `JSON.stringify(value)`, "so templates write them
   unquoted". But line 37 keeps `socketHello` as `"access_token":"{{key}}"` (quoted), and the existing
   code (`page-socket.ts:149-151`) inserts the key as string CONTENT (`JSON.stringify(...).slice(1,-1)`).
   If the new rule is applied to `{{key}}` the greeting becomes `""abc""` and login fails; if it is not,
   the spec has two fill rules and does not say which placeholders follow which.
   Change: say the rule covers `{{offer}}` and `{{target}}` only; `{{key}}` stays string-content inside
   quotes, as today. State that `{{key}}` is never filled in `videoProfile.send` (reject a profile whose
   `send` contains it), and that no placeholder is ever filled in inserted text.
   Triage: accepted — the JSON.stringify rule covers {{offer}} and {{target}} only; {{key}} stays string content inside quotes as today, is never allowed in videoProfile.send (profile rejected), and inserted text is never filled again.

2. **LOW. No timeout for "waits for `socketReady`".** Lines 166 (video) and 84-86 (page) wait for
   `auth_ok`; if Home Assistant accepts the upgrade and never answers, the video stays `'starting'`
   until the 5-minute cap and holds one of 4 app-wide video slots (and a rate-gate slot).
   Change: a fixed wait (e.g. 10 s) after which main closes the video socket and reports `'stopped'`
   with a plain reason; same for a live socket stuck before `'open'`.
   Triage: accepted — 10 s wait for socketReady (video) and for 'open' (live socket); then closed with a plain reason.

3. **LOW. Video and hidden tabs.** The R2-11 fix (hidden: close, `'paused'`, reopen on visible) is
   written for sockets only; `video` states are `starting | playing | stopped`. A hidden window stalls
   `requestVideoFrameCallback` and the 20 s pings, so the lease (60 s) kills the video by accident
   with an unexplained `'stopped'`.
   Change: say video stops deliberately on hidden (`'stopped'`, why "paused while hidden"), card
   offers Play again; no automatic reopen.
   Triage: accepted — video stops deliberately when hidden ('stopped', "paused while the page was hidden"); the card offers Play again; no automatic reopen.

4. **LOW. `failed` text redaction is implied, not stated.** R2-9 asked that the device-supplied
   `failed` message (sent to the page as `why`) be redacted like every other message. Line 120-122
   covers "every received message" for sockets and line 160-167 says video reuses the machinery, but
   nothing names the video answer/`failed` path. Add one phrase, plus a test that a `failed` text
   containing the key arrives redacted.
   Triage: accepted — the answer, candidate and failed texts are redacted like every received message; test with the key inside a failed text.

5. **LOW. SDP hostname handling is ambiguous.** Line 163-165: candidates with hostnames are dropped,
   but SDP `c=` / `a=candidate` lines are "filtered against ranges", which cannot judge a hostname
   (e.g. `abc.local`). State that a hostname in the answer SDP is also dropped (or the answer refused).
   Triage: accepted — a hostname in the answer SDP drops that line; an answer left with no usable candidate is refused.

Nothing else new and blocking: no further security-relevant gaps found in the revision.
