# remote-access — reaching the app from another device
Filing test: reaching the app from another device — the protocol, the browser client.

- [ ] Remote browser, freshly connected: the oldest assistant reply in the conversation
      morphs into a copy of the newest streaming one — every connect, not a race
      `chat` `remote` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-remote-hydrate-turn-group-id-collision.md

- [ ] Over remote access whole features are simply missing: the files panel cannot open any
      file (not even a small note), Project View tabs are thin, the game lobby signs in but
      stays empty, several buttons throw. Which namespaces are safe to expose over a
      password-only, unencrypted channel is a decision for Destin before any bridging
      Destin 2026-09-02: none of them until the remote channel is encrypted — blocked on that item below
      `remote` `blocked` `checked 2026-09-02` → docs/active/investigations/2026-09-01-remote-unbridged-channels.md

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
      `desktop` `confirmed` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-remote-pty-replay-buffer-copy-per-chunk.md

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

- [ ] Remote access runs over a password-only connection that is not encrypted on the local network,
      which is why files, projects and games stay switched off over it (Destin, 2026-09-02).
      Encrypting the channel unblocks all three
      `remote` `needs-verify` `checked 2026-09-02` `security`

- [ ] The remote browser client has no mic while the desktop and Android apps will. Browsers
      only allow a microphone on a secure (https) page, and remote access is plain http, so the
      voice-prompting mic (2026-09-05 deck, Q-7: Destin picked "desktop and Android first") stays
      off the remote client until the channel is encrypted. When it is: record in the browser, send
      the audio to the desktop's speech engine, so it sounds the same everywhere
      `input-bar` `remote` `parked` `checked 2026-09-05` → docs/active/design/2026-09-05-voice-prompting/voice-prompting.questions.json
