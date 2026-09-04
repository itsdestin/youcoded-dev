# android-only — bugs in Android's own code
Filing test: if you fixed this on desktop, would Android still be broken? Yes — the bug is in
Android's own code. Not here: the code is shared and the phone is just where it shows — file
that in the shared area with android as seen-on.

- [ ] Resuming a past Claude Code conversation on Android starts a fresh session instead; and
      when the project folder's name contains hyphens, Android can open the session in a
      sibling folder (re-verified 2026-08-12 and 2026-09-01, unchanged since April)
      `resume-browser` `android` `confirmed` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-android-resume-unreachable.md

- [ ] Android still carries the old Drive/GitHub backup-and-restore backend that desktop
      demolished in July (sync Plan 2c); the Android half of that demolition never happened
      `settings/sync` `android` `needs-verify` `checked 2026-09-01` `v1.3.1`

- [ ] Android might crash if the screen asks for preferences, defaults, theme or sync status
      before the app has finished starting up — 18 spots assume startup is done; never seen
      on a device, found by pattern search 2026-08-06
      `android` `needs-verify` `checked 2026-09-01` `needs-repro` → docs/active/investigations/2026-09-01-android-session-service-bootstrap-npe-window.md

- [ ] Android may attach a conversation to the wrong Claude Code session after a subagent or
      tool hook fires — the same poisoning that made desktop replay an unrelated transcript
      into chat (fixed there in PR #257, 2026-07-26); not yet seen on a phone
      `chat` `android` `confirmed` `checked 2026-09-01` `needs-repro` → docs/active/investigations/2026-09-01-android-event-bridge-session-map-ungated.md

- [ ] Android keeps a native "layout insets" reading of the chat's header/bottom chrome that
      nothing uses since the native terminal was removed (2026-07-22). Decided 2026-09-02:
      delete it as dead code; keyboard handling on the phone will be built its own way
      `chat` `android` `confirmed` `checked 2026-09-02` → docs/active/investigations/2026-09-01-android-layout-insets-flow-uncollected.md

- [ ] The 2026-07-20 soft-keyboard fix (page shrinks instead of the keyboard covering the
      input) was only checked in Chrome for Android over remote access, never in the packaged
      app — open/close the keyboard in chat on a debug APK and confirm the input bar and
      bottom glass still sit right; deferred at Destin's call
      Destin 2026-09-02: probably resolved, not certain; investigate together with the Z13 touchscreen keyboard issues (user-interface)
      `input-bar` `android` `needs-verify` `checked 2026-09-02`

- [ ] Android's Library doesn't show themes you built yourself on the phone until they are
      published — desktop lists them alongside the marketplace ones (still a stub 2026-09-01)
      `library` `android` `needs-verify` `checked 2026-09-01`

- [ ] On Android, integrations only list — Install, Connect, Uninstall and Configure all
      return "not implemented" (youcoded#78; still a stub 2026-09-01)
      `marketplace-screen` `android` `needs-verify` `checked 2026-09-01`

- [ ] Android has no Project View for files: project listing, rename, exclude/include,
      delete-project and the project channels all return not-implemented on the phone —
      mobile Project View is planned as v2 (stubs still in place 2026-09-01)
      `projects` `android` `parked` `checked 2026-09-01`

- [ ] Android forgets your skill settings after the first launch — favourites, quick chips and
      overrides revert to defaults every launch after the first, and the first save wipes what was on
      disk
      `android` `confirmed` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-android-skill-config-never-loaded.md

- [ ] What should "Online" mean on a phone? Desktop counts you present only when awake and recently
      active; on Android the presence socket lives in a background service, so a phone with a long
      session would read Online with the screen off. Destin decided 2026-09-02: Online means the app is in front; build that
      `android` `needs-verify` `checked 2026-09-02`

- [ ] Tags and notes on a conversation work on desktop but the phone refuses both ("not implemented on
      mobile") — only pin and hide work there. The storage and sync already exist; it is the Kotlin
      side of two channels plus the UI to reach them
      `session-drawer` `android` `needs-verify` `checked 2026-09-01`

- [ ] The phone's file-record store has neither the write queue nor the read guard desktop got in
      PR #318 — a burst of file events runs dozens of full parses in parallel, the same shape that
      OOMed desktop on 2026-08-27
      `android` `needs-verify` `checked 2026-09-01` `performance`

- [ ] The phone never gets the file-path repair desktop got on 2026-08-13 — the per-device record file
      is not synced, Android's missing-file check is a stub that reports nothing missing, so a damaged
      record there looks normal forever
      `files-panel` `android` `needs-verify` `checked 2026-09-01`

- [ ] Android is pinned to Claude Code 2.1.112 because later releases ship as a native binary the
      Android runtime cannot run; a Play listing whose core feature is frozen on an old version is a
      support problem waiting to happen. Decide before the listing: unblock newer versions, or scope
      what the listing promises
      `android` `decision` `checked 2026-09-03` `v1.3` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md
