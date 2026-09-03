# other-features — real features too small for their own area
Filing test: a real user-facing feature too small for its own area. Not here: its sublevel
has passed ~8 items — graduate it to its own file.

## accounts

- [ ] A friend's row read "Last seen 7/26/2026" on 2026-08-11 while they were still using the
      app on a MacBook — signed in, not incognito. Their presence never came back until a full
      quit-and-relaunch; nothing short of that restores it.
      `desktop` `needs-verify` `checked 2026-09-02` → docs/active/investigations/2026-09-01-presence-suspended-latch.md

- [ ] One rejected server call quietly signs you out of your account, with no notice. Friends
      then see you offline forever and you only find out by opening the friends panel. The LOG
      half shipped 2026-09-02 (youcoded#386) so it is diagnosable; the user-facing notice is
      still owed and needs a copy and surface decision on an auth screen
      `desktop` `confirmed` `checked 2026-09-02` → docs/active/investigations/2026-09-01-social-401-silent-signout.md

- [ ] Friends list can show someone Online (or offline) who isn't, and stays wrong until you
      reconnect or a friend change pokes it — no periodic self-correction. Destin: "fine for now"
      (2026-07-23).
      `all` `parked` `checked 2026-09-01`

- [ ] Announcement banner text is fetched unsigned and uncapped — a compromised file could push
      any text, any length, to every client. Defense in depth, no incident (2026-04-21).
      `all` `parked` `checked 2026-09-01` `security`

- [ ] Accounts Phase 2 leftovers (2026-07-09): the two-person sign-in checklist never ran on a
      released build; a phone browser can't make account or social calls through remote access;
      the old PartyKit lobby room is still deployed; "Last seen Xm ago" never ticks while you watch
      it; the friends screen is still buried inside the game lobby's code.
      `all` `needs-verify` `checked 2026-09-01`

## buddy

- [ ] Buddy floater does not appear on Linux Wayland — the XWayland route worked but was shelved
      (2026-07-23); the native-Wayland overlay ships switched off by default. Next attempt: native
      Wayland.
      `buddy-window` `desktop` `needs-verify` `checked 2026-09-01` `v1.3.1`

- [ ] With a buddy window open, a streaming reply makes the whole window re-lay-out on every
      token (2026-08-27) — the twin of the main-chat stutter fixed in perf cycle 1.
      `buddy-window` `desktop` `confirmed` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-buddy-bubblefeed-reflow-per-token.md

- [ ] Typing a message in the buddy window while Claude Code is showing a permission / question /
      plan menu sends it straight into the menu and confirms the highlighted option (2026-07-31).
      The main chat refuses and offers "Send anyway"; the buddy window doesn't.
      `buddy-window` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-buddy-chat-input-bar-pty-gate.md

- [ ] Buddy companions (sun, motes, ghost, sleepy Zzz) only show on the welcome screen; the floater
      renders the mascot alone because its window has no room for them (2026-07-16). Needs a
      padded-window design that keeps drag, docking and click-through working.
      `buddy-window` `desktop` `parked` `checked 2026-09-01`

## onboarding

- [ ] First launch explains nothing and nobody meets the buddy. Wanted: the mascot animatedly
      walking a new user through the neutral provider choice (OpenRouter, Claude Code sign-in, local
      models), each setup flow, then a tour of session switching, the resume browser, tags, games,
      files and Project View — short, dense and whimsical, skippable, and navigable back and forth
      rather than a forced sequence. This is the fuller vision the first-run screen item above should
      grow toward, not a parallel build
      `onboarding` `all` `parked` `checked 2026-09-02`

- [ ] A proper first-run screen (name, comfort level, output style, install the curated defaults)
      replacing the conversational setup wizard. The backend helpers exist; the screen does not. Must
      have a skip button
      `onboarding` `all` `parked` `checked 2026-09-01`

## misc

- [ ] Idea: automation results delivered to Telegram, Discord or email, each channel a plugin. Only
      meaningful once the Agents & Automations view exists
      `all` `parked` `checked 2026-09-01`
