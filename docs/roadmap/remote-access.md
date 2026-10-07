# remote-access — reaching the app from another device
Filing test: reaching the app from another device — the protocol, the browser client.

## one-core

- [ ] Phone and computer parity: what is still missing after one-core (youcoded#604), four things.
      (a) Remote protocol: versioned API and event record delivered; Android joining the same protocol (A2–A4),
      and documenting the API, remain (blocked; sequence with the Android runtime work). (b) Native sessions work
      from a phone now. Destin (2026-09-11: "native sessions should work fine in remote access, no? remote
      access should be identical to the desktop?") still has to decide whether a phone may add or change provider
      keys. (c) Buttons wait for the computer before changing (Destin: "i [want] all buttons to feel as close to
      instantaneous as possible"): Stop, permission answer, Close, idle native send and mode chip are now
      instant; a native send into a busy chat, AskUserQuestion answers and keyboard Esc stop still wait.
      (d) Still missing over remote: the game lobby stays empty, files cannot be uploaded or edited from a
      phone, other unopened namespaces — each a one-line switch, Destin's call (report:
      docs/active/investigations/2026-09-01-remote-unbridged-channels.md).
      `remote` `confirmed` `P2` `checked 2026-09-11`

- [ ] Parked ideas: remote access, decided to leave as is (three things).
      (a) Real-phone checks of the merged security fixes: confirm the WebSocket allow-list accepts the Android
      WebView's `null` origin, and make the phone reuse its saved pairing credential instead of re-pairing and
      adding a device row each reconnect (planned in A2, the Android rebuild's first device testing).
      (b) The blue "reply ready" dot is remembered per screen, so a reply read on the computer still shows
      blue on the phone (Destin, 2026-10-02: "leave it for now"). (c) A paired phone can still add any folder
      to the computer's saved-folder list (protected places still apply); Destin kept it so the phone matches the
      computer, revisit if a phone adds a folder the owner did not expect.
      `remote` `parked` `P3` `checked 2026-09-11` `security`

## standalone

- [ ] Remote access "just doesn't work sometimes" and the phone gives nothing to act on.
      Destin 2026-09-09: "remote access just doesn't work sometimes without anything actionable for the user,
      when tailscale might just not be enabled on their phone" — the phone shows the browser's own cannot-reach
      screen. Fix: install a service worker on the first successful visit so a later failure shows OUR page,
      which can tell "phone has no internet" from "phone is online but cannot reach the computer" and lead with
      the likely fix (it cannot see VPN state, so it must not claim Tailscale is off). Limits: needs one earlier
      visit; iOS drops it after ~7 days unused; Add to Home Screen makes it stick. Android follow-up (planned
      A5): the app can ask the system whether a VPN is active and say Tailscale is not running as a fact.
      `remote` `confirmed` `P2` `checked 2026-09-09`

- [ ] Browser encryption (the optional second level) is an approved design with nothing behind it. Destin
      looked for it on 2026-09-10 and found no trace: the Advanced section exists only in the workbench mockup,
      with no certificates, HTTPS server or stored setting. It would give a phone the microphone, copy buttons
      and font picker, and stop "Not secure". Cost: enabling HTTPS for the tailnet on Tailscale's site, the
      computer's name on a public list, a changed address for paired devices, ~90-day renewals. Start at the
      technical design, not questions.
      `remote` `confirmed` `P2` `checked 2026-09-10` → docs/archive/design/2026-09-09-remote-access/remote-access.review-4.json

- [ ] Remote setup screen: four clarity gaps (beta tester, 2026-09-10).
      (a) The password has no confirmation box and no way to reveal it, so you cannot check what you set (the
      "no rules" half is fixed). (b) Removing a device shows no "removed" message and has no undo. (c) "Keep
      awake" never says what it does or what happens when time runs out. (d) Setup asks for Install Tailscale,
      Sign in, Set up one at a time with no step count, so every finish brings a new demand (needs a deck).
      Report: docs/archive/reviews/2026-09-10-remote-access-ux-review-2.md
      `remote` `confirmed` `P3` `checked 2026-09-10`

- [ ] Phone voice and mic: three gaps.
      (a) The remote browser client has no mic, since browsers allow it only on secure pages and remote access is
      plain http; when the channel is encrypted, record in the browser and send audio to the desktop's speech
      engine (2026-09-05 deck: desktop and Android first). (b) A phone that pairs mid-dictation cannot stop its
      own microphone; it stays open until the recogniser times out (a few seconds). (c) Pairing while the message
      box is open leaves the mic button looking live; the first tap shows "voice stopped" instead of the card
      explaining you are connected to another computer.
      `input-bar` `all` `confirmed` `P3` `checked 2026-09-05`

- [ ] Phone browser: two display and loading faults.
      (a) A phone gets the theme's colours but not its wallpaper, glass or mascot pictures (Destin, 2026-09-11:
      broken image where Meadow Mist's mascot belongs; the phone now shows the default mascot). Fix: serve those
      assets over the connection. (b) The conversation browser over remote sometimes shows nothing and works the
      second try (Destin, 2026-09-10); the screen now says the load failed with Retry, and he later said "mostly
      fixed"; cause unidentified.
      `remote` `confirmed` `P3` `checked 2026-09-10`

- [ ] Idea (Destin, 2026-09-08): sign in to a YouCoded account and reach your computer without installing
      Tailscale. Long-horizon, around v1.4, not a release commitment; related to YouCoded Mesh and Cloud
      fallback in the native-harness backlog. Hosting and privacy design open.
      `remote` `parked` `P3` `checked 2026-09-08` `v1.4`


- [ ] The copy of terminal text kept for phones can be cut in the middle of a formatting code, so a phone that joins late may replay a garbled start. This predates the 2026-10-04 terminal work; fixing it changes the offsets phones replay against, so it needs a phone check. Filed here because the fix is the phone protocol; the memory cost of that buffer is in perf
      `remote` `needs-verify` `P3` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md
