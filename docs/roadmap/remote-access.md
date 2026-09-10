# remote-access — reaching the app from another device
Filing test: reaching the app from another device — the protocol, the browser client.

- [ ] Destin 2026-09-09: "remote access just doesn't work sometimes without anything
      actionable for the user, when tailscale might just not be enabled on their phone" — the
      phone gets the browser's own cannot-reach screen. Fix: install a service worker on the
      first successful visit so a later failure serves OUR page instead. Newly possible: it
      needs a secure context, which the Tailscale-only decision (`remote-access-questions-3#Q-6`)
      provides. It cannot see VPN state, so it must not assert Tailscale is off — it can tell
      "phone has no internet" from "phone is online but cannot reach the computer" and lead with
      the likely fix. Limits: needs one prior successful visit; iOS evicts after ~7 days unused;
      Add to Home Screen makes it stick and gives the app an icon. No service worker or web
      manifest exists in the app today.
      `remote` `confirmed` `checked 2026-09-09`

- [ ] Destin 2026-09-09, same thread: the Android app can do better than any web page — it can
      ask the system whether a VPN is active and say Tailscale is not running as a fact rather
      than a guess. Separate from the browser fix above.
      `android` `confirmed` `checked 2026-09-09`

- [ ] Idea (Destin, 2026-09-08): sign in to a YouCoded account and connect to your computer
      without installing Tailscale. Long-horizon, around v1.4 rather than a release commitment;
      related to YouCoded Mesh and Cloud fallback in the native-harness backlog, but connecting
      to a device is distinct from choosing where an automation runs. Hosting/privacy design open.
      `remote` `parked` `checked 2026-09-08` `v1.4`

- [ ] Saving a permission setting over remote access replaces the whole stored block instead
      of merging into it, and does not refresh what the app is enforcing until something local
      reads the settings again — harmless today because nothing writes those values any more
      `settings/permissions` `remote` `confirmed` `checked 2026-09-07`

- [ ] Over remote access the assistant-settings model picker offers models the browser cannot
      actually run, so choosing one saves a default that quietly does nothing there
      `settings/defaults` `remote` `confirmed` `checked 2026-09-07`

- [ ] Remote browser, freshly connected: the oldest assistant reply in the conversation
      morphs into a copy of the newest streaming one — every connect, not a race
      `chat` `remote` `needs-verify` `checked 2026-09-01` → docs/active/investigations/2026-09-01-remote-hydrate-turn-group-id-collision.md

- [ ] Over remote access whole features are simply missing: the files panel cannot open any
      file (not even a small note), Project View tabs are thin, the game lobby signs in but
      stays empty, several buttons throw. Which namespaces are safe to expose over a
      password-only, unencrypted channel is a decision for Destin before any bridging
      Destin 2026-09-02: none of them until the remote channel is encrypted — blocked on that item below
      2026-09-10: the channel now exists only on the Tailscale address (batch 1), which is what the
      milestone counts as secure. Files are batch 3; projects, games and the rest wait for their
      own batches — nothing is bridged automatically
      `remote` `confirmed` `checked 2026-09-10` → docs/active/investigations/2026-09-01-remote-unbridged-channels.md

- [ ] Remote: "+ Add file" in the files panel uploads the file to the desktop, then the
      import fails — the upload has already landed on the host (found 2026-07-23)
      `files-panel` `remote` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-remote-unbridged-channels.md

- [ ] First connect from a phone sits on a white screen for seconds, then the chat takes a
      further beat to fill in; the July byte-shaving merge changed nothing Destin could feel
      on LAN. ~2.5 s of it is scripted waiting; the white part is unmeasured on a real phone
      Destin 2026-09-02: probably much improved; keep for a future remote-access verification pass
      `remote` `needs-verify` `checked 2026-09-02` `performance` → docs/active/investigations/2026-09-01-remote-first-connect-dead-time.md

- [ ] Finish the remote-hydration work: a remote browser can land on a different session or
      view than the desktop window shows, and events arriving during connect can double-apply
      or drop (commits 2 and 3 of the 2026-07-20 plan; ask Destin which still bites)
      Destin 2026-09-02: still sees intermittent desktop/remote mismatch bugs, not sure they are exactly this
      `remote` `needs-verify` `checked 2026-09-02` → docs/active/investigations/2026-09-01-remote-hydration-ordering-and-view-parity.md

- [ ] A phone browser on remote access behaves like a desktop in the terminal view — touch
      adaptations off, soft keyboard and scrolling wrong (found 2026-07-20 on Chrome/Android)
      `terminal` `remote` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-remote-shim-overwrites-device-platform.md

- [ ] The desktop pays a CPU cost on every line of terminal output for a remote replay buffer,
      even when no phone or browser is connected
      `desktop` `needs-verify` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-remote-pty-replay-buffer-copy-per-chunk.md

- [ ] Settings read over remote access can disagree with what the desktop shows for the same
      file — defaults, folders, permission overrides (from the 2026-07-10 review)
      `settings` `remote` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-remote-pref-handlers-drift.md

- [ ] Formalize the remote protocol: version the WebSocket API, add a lifecycle event bus,
      and reconcile Android's separate Kotlin runtime with it — the server can already drive
      the app's own agent externally but the API is undocumented and unversioned (super-agent
      roadmap step 9; sequence with the Android runtime work)
      `all` `parked` `checked 2026-08-26`

- [ ] From a remote browser, renaming a saved folder or editing its description writes the folder list
      the unsafe way — a crash mid-write can truncate every saved folder — because the remote path
      re-implements the store inline (three copies of the same logic) and has zero test coverage.
      Destin chose to defer the refactor on 2026-08-06
      `projects` `remote` `needs-verify` `checked 2026-08-06`

- [ ] Milestone batch 2 — conversation restoration. After a reconnect the phone must show the
      conversation as it truly is: readiness, snapshot and event ordering instead of fixed waits,
      the phone keeping its own selected conversation (questions deck Q-3, 2026-09-09), and which
      desktop window a phone follows when several are open (undecided — needs its own questions
      deck). Folds in the hydration, morphing-reply and first-connect items above once a phone pass
      has confirmed which still bite, and the "did that action happen?" indicator below. Batch 1
      (secure transport, device records, recovery) shipped 2026-09-10 — see shipped.md
      Scope and acceptance: docs/active/specs/2026-09-09-remote-access-first-milestone.md
      `remote` `confirmed` `checked 2026-09-10`

- [ ] Milestone batch 3 — file reading over remote access: session and project file lists,
      previews, downloads, and a list that refreshes after a reconnect rather than going stale
      without saying so (which is why it follows batch 2). Large transfers must not block chat;
      file content must open from an address separate from the app's own, so a file cannot act as
      the app. Uploads and editing are a later, separately approved batch. Needs a questions deck:
      what a phone shows for a big file, download versus preview, size limits
      Scope and acceptance: docs/active/specs/2026-09-09-remote-access-first-milestone.md
      `remote` `confirmed` `checked 2026-09-10`

- [ ] The remote browser client has no mic while the desktop and Android apps will. Browsers
      only allow a microphone on a secure (https) page, and remote access is plain http, so the
      voice-prompting mic (2026-09-05 deck, Q-7: Destin picked "desktop and Android first") stays
      off the remote client until the channel is encrypted. When it is: record in the browser, send
      the audio to the desktop's speech engine, so it sounds the same everywhere
      `input-bar` `remote` `parked` `checked 2026-09-05` → docs/archive/design/2026-09-05-voice-prompting/voice-prompting.questions.json

- [ ] A phone that pairs to a desktop mid-dictation cannot stop its own microphone. The mic
      belongs to the phone's own speech service, and the only way to close it is a message the
      pairing has just started refusing — so it stays open until the phone's recogniser times
      out on its own. Bounded in practice (a few seconds of silence ends it) and not reachable
      before pairing, but the fix is to let stop and cancel through while paired instead of
      refusing them with everything else. Found reviewing the voice build, 2026-09-05
      `input-bar` `android` `confirmed` `checked 2026-09-05`

- [ ] Pairing to a desktop while the message box is open leaves the mic button looking live.
      Nothing re-asks whether voice is available when the connection changes, so the first tap
      shows the "voice stopped" card rather than the card that explains you are connected to
      another computer. Recovers on its own once the screen is reopened, or on Check again
      `input-bar` `android` `confirmed` `checked 2026-09-05`


- [ ] An action whose answer never arrived is recorded but never shown. When a request is sent
      over remote access and the reply is lost, the client now keeps the request instead of
      claiming it failed, asks the host about it on reconnect, and announces the result on an
      internal event — but nothing in the interface listens, so the person is told nothing
      either way. Sending is safe (it never re-runs); it is the "we don't know whether that
      happened" state that has no screen. The event and its reconciliation shipped with the
      2026-09-09 secure-connection batch; the indicator on the affected card did not
      `remote` `confirmed` `checked 2026-09-10` → docs/archive/reviews/2026-09-10-remote-access-code-review.md

- [ ] The remote access password has no rules and no confirmation. "abc" is accepted, there is
      no minimum length, no second box to type it again, and no way to reveal what you typed —
      the only feedback is a tick while the field empties itself, so you cannot check what you
      just set. It is the one secret standing between a paired device and the whole assistant.
      Found by a beta tester setting remote access up from scratch, 2026-09-10
      `remote` `confirmed` `checked 2026-09-10` → docs/archive/reviews/2026-09-10-remote-access-ux-review-2.md

- [ ] Removing a device has no "removed" message and no undo. The row simply disappears; the
      removal is correct and immediate, but nothing confirms it happened and there is no way
      back if the wrong row was tapped — the device has to be paired again from scratch
      `remote` `confirmed` `checked 2026-09-10` → docs/archive/reviews/2026-09-10-remote-access-ux-review-2.md

- [ ] "Keep awake" never says what it does. No hint next to it, nothing about what happens when
      the time runs out, and 4h is pre-selected without saying why — a person setting up remote
      access has to guess whether this is the setting that keeps their phone able to reach the
      computer. It is
      `remote` `confirmed` `checked 2026-09-10` → docs/archive/reviews/2026-09-10-remote-access-ux-review-2.md

- [ ] Setup asks for three things one at a time with no sense of how many are left. "Install
      Tailscale", then "Sign in", then "Set up" — each appears in the same spot after the last
      one is done, so every time you think you have finished, a new demand appears. Needs a
      deck: a step count changes an approved screen
      `remote` `needs-verify` `checked 2026-09-10` → docs/archive/reviews/2026-09-10-remote-access-ux-review-2.md

- [ ] A phone gets the theme's colours but not its wallpaper or glass. The colour tokens now
      cross the connection, so a paired phone matches the computer's palette — but the
      background image and the blur behind panels stay behind, because a theme's wallpaper is
      a file on the computer that owns the theme and its path means nothing in a phone
      browser. Serving those assets over the connection is the fix; it needs the theme's
      asset paths rewritten to point at the host, and a judgement about how much a phone
      should download before the first screen appears
      `remote` `confirmed` `checked 2026-09-10`

- [ ] Opening the conversation browser over remote access sometimes shows nothing, and works
      on the second try. Destin, 2026-09-10: "oh wait it worked the second try for resume.
      idk why nothing appeared the first time." The computer's own listing was fine at that
      moment (946 conversations, 318KB), so the request failed somewhere between the phone
      and the host and the screen reported it as an empty history. The screen now says the
      load failed and offers Retry, so the next occurrence is visible instead of silent —
      but the CAUSE is unidentified. A request in flight when the connection blips is not
      cancelled or retried; it waits out its own 30-second timeout and then rejects, which
      fits the symptom without being proven
      `remote` `needs-verify` `checked 2026-09-10`

- [ ] Browser encryption — the optional second level — is an approved design with nothing
      behind it. Destin went looking for it in the app on 2026-09-10 and found no trace: the
      Advanced section renders only in the workbench mockup, and there is no certificate
      code, no HTTPS server and no stored on/off state. What it buys is the microphone, copy
      buttons and font picker on a phone, and a browser that stops saying "Not secure". What
      it costs: he must enable HTTPS for the tailnet on Tailscale's own website, the
      computer's name goes on a permanent public list, the address every paired device uses
      changes, and certificates expire in ~90 days so renewal has to be handled. Design
      approved in the round-4 deck; start at the technical design, not at questions
      `remote` `confirmed` `checked 2026-09-10` → docs/archive/design/2026-09-09-remote-access/remote-access.review-4.json
