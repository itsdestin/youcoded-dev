---
status: shipped
date: 2026-10-04
reviews: docs/archive/specs/2026-10-04-page-live-socket-and-camera-video.md (revision 2)
---

# Design review 2: page live socket and camera video

Paths are under `youcoded/desktop/src/` unless stated.

**Review-1 findings: all 29 accepted ones are now reflected in the text.** The page can no
longer supply SDP or candidates (1), video needs an approved full-access device connection with a
`videoProfile` (2), ownership, lease, `sendToClient`, `closeFor`, state machine, caps, Android list
and parity are all stated. What is left is **gaps in the new main-side design**, below. Items 1-4
are real holes or undefined behaviour in the new `videoProfile` / `socketDeny` fields; the rest
are smaller.

## Security

1. **HIGH. Template filling is unspecified, and `{{offer}}` sits unquoted in the template.**
   Spec line 41-43: `"entity_id":"{{target}}","offer":{{offer}}`. Nothing says how either value
   is inserted. If `offer` goes in raw, the SDP's newlines and quotes break the JSON, and anyone who
   can reach `pages:video-start` (a remote client sends its own `offer`; main must not trust it)
   can append keys such as a second `"type"`. If `target` is escaped but `offer` is not, same hole.
   The existing code does it safely for the key only (`page-socket.ts:149-151`, `split/join` +
   `JSON.stringify(...).slice(1,-1)`); a `String.replace` with a string replacement would also
   interpret `$&` / `$'` in the value.
   Change: state that main fills the template in ONE pass over the template only (never over
   inserted text, so an offer containing `{{target}}` or `{{key}}` is inert), `{{target}}` as
   JSON string content (`JSON.stringify(t).slice(1,-1)`), `{{offer}}` as a whole `JSON.stringify(offer)`.
   Validate before filling: `offer` is a string, <= ~16 KB, starts `v=0`; `target` <= 100 chars,
   matches the pattern. Reject a `send` template containing `{{key}}`, and require the filled
   result to `JSON.parse` to an object whose `type` is the profile's own fixed type. Add a test
   with `"`, `\`, newline and `{{key}}` inside `offer`/`target`.
   Triage: accepted — single-pass fill; every placeholder value is inserted as JSON.stringify(value) (so the template writes {{offer}} and {{target}} unquoted); offer ≤ 32 KB string, target per item 4; the filled text must JSON.parse to an object or it is refused.

2. **HIGH. `socketDeny` is under-specified in exactly the ways that bypass prefix matching.**
   Main must read `type` from page-written text; the spec never says how. Cases a naive check misses:
   - whitespace / `"type"` escapes (a regex on the raw text misses them; `JSON.parse` does not);
   - **batched arrays**: Home Assistant accepts a JSON array of messages in one frame, so
     `[{"type":"ping"},{"type":"auth/long_lived_access_token",...}]` passes a check that only reads
     `msg.type`;
   - duplicate keys (`JSON.parse` keeps the last, HA's parser also keeps the last, but that
     agreement is an accident to pin with a test, not assume);
   - a non-string or missing `type`, non-JSON text, and a top-level value that is not an object.
   Also the check is skipped by anything that isn't a page message: the `videoProfile.send` template
   and the `socketHello` are sent by main without it (line 47 says "every outgoing message"
   but the video path is a separate socket).
   Change: main does `JSON.parse`; refuse non-JSON, refuse arrays outright (or check every element),
   refuse a non-string `type`, compare on `type.toLowerCase()` after trimming, and apply the same
   check to the filled `send` template at approval time. Add tests for each case above.
   Triage: accepted — main JSON.parses every outgoing page message on a device socket: non-JSON, arrays, non-objects, a non-string type and raw text with more than one "type" key are refused; compare trimmed, lower-cased type by prefix. The same check runs on the filled video template. One test per case.

3. **MEDIUM. The deny list is chosen by the same author it constrains.** `socketDeny` lives in the
   page's own manifest (line 38). A page that simply omits it has no protection, and the approval
   card cannot show "no minting block". It only guards against code edits that leave the manifest
   alone (the fingerprint does not cover the HTML; `pages-service.ts:171-180`). Also a deny list
   misses future minting/admin types (`auth/sign_path`, `config/*`, `person/*`).
   Change: say plainly in the spec which threat this covers. Either (a) main ships a built-in
   floor of denied prefixes per device `service`, merged with the page's list, or (b) make the
   list an allowlist for the page's message types, with the card showing "this page may send:
   ...". At least have the approval card show "does NOT block key creation" when the list is empty.
   Triage: accepted (a) — a built-in floor main applies to every device socket regardless of the manifest: auth/, config/auth, person/; the manifest can only add. The threat covered is said plainly in the spec.

4. **MEDIUM. A regex in the approved manifest runs in main (ReDoS) and the person cannot judge it.**
   `videoProfile.target` is a page-authored pattern (`^camera\\.[a-z0-9_]+$`). A pattern like
   `(a+)+$` against a long `target` blocks main's event loop, which is also the terminal host.
   And "the approval card says what it allows" is not met by showing a regex. Also the anchors are
   not enforced: an unanchored pattern matches `x"camera.y` (injection into `{{target}}`).
   Change: do not take a regex. Take a fixed form such as `targetPrefix: 'camera.'` plus a main-owned
   charset `[a-z0-9_]`, <= 64 chars; the card can then say "may watch cameras". If a regex is kept:
   force `^...$`, cap pattern at ~64 chars, cap `target` at 100 chars, no nested quantifiers.
   Triage: accepted — no regex: `targetPrefix` (e.g. 'camera.') + main-owned charset [a-z0-9_], ≤ 64 chars after the prefix. Card: "may watch your cameras".

5. **MEDIUM. The fingerprint line for the new fields is not defined, and the existing format is
   ambiguous.** Spec says they "ride the approval fingerprint" but `page-connections.ts:246-248`
   appends raw text: `|hello:${socketHello}`. Appending `|deny:...|video:...` the same way means an
   author can move text between fields: `socketHello:'A|deny:auth/'` has the same fingerprint as
   `socketHello:'A', socketDeny:['auth/']`, yet sends a different greeting. Also arrays are
   order-dependent unless sorted (`cleanWritePaths` sorts, `page-connections.ts:133`), and there is no
   `cleanSocketDeny` / `cleanVideoProfile` in `parseConnections` (`:194-195` handles only hello), so
   nothing bounds their size or drops bad entries.
   Change: add the cleaners (bounded counts and lengths, drop-not-trim like `cleanSocketHello`,
   `:109-111`), and fingerprint the new fields as one `JSON.stringify` of sorted, cleaned values so
   no field can bleed into another. Keep older approvals' fingerprints unchanged when the fields are
   absent (the existing pattern). Add a pinning test that changing any single field changes it.
   Triage: accepted — one `|profile:` segment = JSON of the cleaned profile with sorted keys; parseConnections gains cleaners (lengths, types) and drops anything else. socketHello moves inside it (the one re-ask is item 13).

6. **MEDIUM. Main's video socket is never told to wait for login.** Line 139-140: "greets, sends
   `send`". Home Assistant answers the greeting with `auth_ok` and only then accepts commands.
   The one-shot code sends hello and messages back-to-back on open (`page-socket.ts:174-176`),
   which works only because HA queues them; a protocol-neutral main has no "ready" signal for the
   profile. Also, `socketAuthFailed` / quick-close give-up must be said to apply to the video socket,
   and the `id` is hardcoded `1`.
   Change: add `socketReady: 'auth_ok'` to the profile (main sends `send` after a reply
   containing it; fails after 10 s), or state that main sends greeting + offer together as the
   one-shot does and test that against the real house. Say the failure rules apply to video.
   Triage: accepted — `socketReady: 'auth_ok'` (an exact reply type): main's video socket sends the template only after a reply whose type equals it.

7. **LOW. Candidate and answer filtering covers IPs only.** Lines 140-142 filter against
   loopback/link-local/metadata. Candidates and the answer's `c=`/`a=candidate` lines can also hold
   hostnames (`.local` names, DNS names) which Chromium resolves, outside any main check. The
   answer SDP (not only trickle candidates) carries addresses too, and the spec says only
   "candidates". The device is the approved source, so this is a lower risk than review 1 item 1, but
   it should be said.
   Change: filter both answer SDP lines and trickle candidates; drop any candidate whose address
   is not a literal IP (or resolve + check with `assertHomeHttpUrl`-style tables). State that
   private LAN addresses are allowed on purpose (Pi camera), so the filter is "no loopback /
   link-local / metadata", not "no private".
   Triage: accepted — candidates with hostnames are dropped; the same address filter runs over the answer SDP's a=candidate and c= lines.

8. **LOW. Remote clients play video on THEIR network.** The `RTCPeerConnection` lives in the
   remote browser, but the candidate filter runs on the desktop. A LAN camera's private address is
   useless to a phone elsewhere (video fails with no explanation), and the device-supplied
   addresses are then dialled from the phone's network. Say that remote video is expected to work
   only for relay-type devices, or relay media through the desktop (out of scope). Add the
   "Watch live in Home Assistant" fallback message for this case.
   Triage: accepted as a decision — a remote browser's peer connection dials what the device answered, from the phone's network; stated in the spec.

## Lifecycle and consistency

9. **MEDIUM. Video ownership, lease and events are not spelled out.** The ownership/lease text
   (lines 78-89) is written for sockets. For video it says "the lease" (line 144) but pings are
   "each socket". Undefined: does the video get its own main-generated id and owner check on
   `pages:video-stop`; who pings it; how video events (answer, candidate, state, `failed` text)
   reach only the owner (`webContents.send` / `sendToClient`); what happens to the answer if the
   owner's frame is gone. The `failed` text is device-controlled and goes to the page as `why`: it
   must be redacted like every other message. The parity/Kotlin lists (lines 90-92, 183) name the
   socket channels, not `pages:video-*` or the video event channel.
   Change: one sentence "video follows the socket ownership, lease and delivery rules, id included",
   plus list the video channels in parity, Kotlin and remote shim.
   Triage: accepted — videos use the same owner/lease/event machinery (ids from main, owner checks, lease pings, closeFor, Kotlin + PHASE_2 entries for pages:video-*).

10. **MEDIUM. Caps do not add up.** "Live sockets 2 per page, 4 per window/client, 8 per app" (line
    104), "2 videos per page" (line 151), and each video holds its own main socket to the device
    (line 139). Do video sockets count toward the 2/4/8? If yes, a page with 1 updates socket +
    2 videos needs 3, over the page cap; if no, the app can hold 8 + N unlisted connections to one
    Home Assistant. Also the line-151 sentence "a page needs only its one live socket" is no longer
    the reason for the cap. Decide one rule and put video in the table (e.g. video sockets counted
    separately: 2 per page, 4 per owner, 4 app-wide).
    Triage: accepted — videos counted separately: 2 per page, 4 per app; their sockets are main's and not in the socket caps.

11. **MEDIUM. The 20 s ping / 60 s lease can false-close a hidden browser tab.** The remote shim
    and Electron windows throttle timers when hidden (Chromium intensive throttling can stretch a
    `setInterval` to about once a minute after 5 min hidden). A phone tab in the background then
    loses its sockets and the 5-minute video, and the spec does not say what `'paused'` does: is the
    socket closed while hidden (then reopened on show), or kept (then it needs the lease)? Line 67
    only says what `'paused'` means.
    Change: say which. Suggested: on hidden, close and report `'paused'`; reopen on visible
    (one rate-gate slot); lease applies only while visible; test with the page hidden > 60 s.
    Triage: accepted — hidden: close and report 'paused'; visible: reopen (one rate-gate slot); lease only while visible. Test with the page hidden > 60 s.

12. **LOW. Give-up rule vs. a Home Assistant restart.** Line 106: "a close before any reply ends it
    at once", but also "give up after 10 min down". Restarting Home Assistant (common; it is the
    main reason to reconnect) can accept the upgrade and close before replying. The socket then
    shows `'closed'` forever and the page's "Reconnecting…" never appears. Suggest: quick-close
    gives up only if it happens right after the greeting AND is the first attempt of this
    session (never in a reconnect that previously reached `auth_ok`). Also make
    `socketAuthFailed` match a message `type` or exact reply, not any substring: a device name
    containing the word could end the socket.
    Triage: accepted — give up at once only when a reply's type equals socketAuthFailed exactly; a quick close otherwise follows the normal backoff (a Home Assistant restart survives).

13. **LOW. `id: 1` and existing-approval behaviour.** Because the new fields join the fingerprint,
    the Home page's existing approval re-asks once when the manifest gains them (intended, but a
    visible "re-approve" for Destin). Say so in the spec's "what people will experience" so it is
    not a surprise.
    Triage: accepted — told to Destin; noted in the spec.
