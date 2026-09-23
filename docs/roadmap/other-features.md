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
      `desktop` `needs-verify` `checked 2026-09-02` → docs/active/investigations/2026-09-01-social-401-silent-signout.md

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

- [ ] The Linux buddy has never been tried on two screens — every probe ran on the laptop panel
      alone, and Destin deferred the TV test on 2026-09-04. On a second monitor the buddy may open
      on the wrong screen, or sit on that screen's taskbar if the app fails to match KDE's name for
      it. Not a stranding risk: an unreachable position is already pulled back to the nearest
      screen. Do the real two-screen run before this ships.
      `buddy-window` `desktop` `needs-verify` `checked 2026-09-04` `v1.3.1` → docs/archive/design/2026-09-04-linux-buddy-helper/technical-design.md

- [ ] Typing a message in the buddy window while Claude Code is showing a permission / question /
      plan menu sends it straight into the menu and confirms the highlighted option (2026-07-31).
      The main chat refuses and offers "Send anyway"; the buddy window doesn't.
      `buddy-window` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-buddy-chat-input-bar-pty-gate.md

- [ ] The buddy reacts to the app but never does anything of his own (2026-09-05): between
      reactions he only breathes. Wanted: small spontaneous moments — a glance around, a
      stretch, dozing off after a few quiet minutes and waking the moment anything happens.
      Destin's rule for it: the small movements must stay clearly quieter than the one
      animation that means "a session needs you", so they only run while every session is
      calm and stop the instant one turns red, amber or blue. Those status colours already
      reach the buddy window and go unused. The asleep pose and its z's are built and signed
      off; nothing drives them yet
      `buddy-window` `desktop` `confirmed` `checked 2026-09-05`

- [ ] Buddy companions (sun, motes, ghost, sleepy Zzz) only show on the welcome screen; the floater
      renders the mascot alone because its window has no room for them (2026-07-16). Needs a
      padded-window design that keeps drag, docking and click-through working.
      `buddy-window` `desktop` `parked` `checked 2026-09-01`

## onboarding

- [ ] A proper first-run screen (name, comfort level, output style, install the curated defaults)
      replacing the conversational setup wizard. The backend helpers exist; the screen does not. Must
      have a skip button. The 2026-09-10 guide keeps the wizard and changes only its sign-in step
      and final card; this remains the later replacement
      `onboarding` `all` `parked` `checked 2026-09-10`

## misc

- [ ] The dev log shows React's "Cannot update a component while rendering a different
      component" warning when sessions arrive (seen during the 2026-09-11 phone pass, when a
      phone's catch-up delivers every session at once). Nothing visibly wrong yet; the handler
      that adds a session changes other state in the middle of an update, which React may run
      twice. Found 2026-09-11
      `all` `confirmed` `checked 2026-09-11`

- [ ] Explore bringing YouCoded to iOS. Today an iPhone only reaches the app through Safari
      pointed at another device that runs it. Options to weigh: a native app around the shared
      interface (the Android shape, minus the on-device runtime, which App Store rules on
      downloaded executable code would refuse), a pair-to-desktop-only app, or a proper web
      client over an encrypted remote connection. Wanted: a written comparison of cost, App Store
      constraints and what each option can and cannot do, before any build. The website's iOS
      popup says we are exploring this (2026-09-10). Constraint to design around (2026-09-23):
      an iPhone app cannot start other programs at all, and App Store rule 2.5.2 bars
      downloading code that adds features — so no bash, git or Claude Code on the phone, bundled
      or not. The likely shape: the built-in assistant running inside the app with its file
      tools rebuilt in-app (reusing the Android harness work), plus "connect to my computer" for
      Claude Code and commands. Running AI-written code locally (a-Shell-style WebAssembly) is a
      gray area Apple once threatened to remove; leave for later
      `n/a` `decision` `checked 2026-09-23`

- [ ] Nothing in the app or on youcoded.ai points to r/youcoded, the community Destin opened on
      2026-09-10 for bug reports, feature ideas, themes and things people make with the app.
      Proposed, not yet answered: a "Community" link in Settings and in the site footer, added
      once the subreddit has a few posts so visitors don't land on an empty page
      `all` `decision` `checked 2026-09-10`

- [ ] Idea: automation results delivered to Telegram, Discord or email, each channel a plugin. Only
      meaningful once the Agents & Automations view exists
      `all` `parked` `checked 2026-09-01`

- [ ] YouCoded Pages: let people create and install their own native-looking pages, from dashboards
      and paint studios to specialized assistants, and pin favorites beside Projects. Scope approved:
      live themes, personal/project pages, marketplace pages and custom services, controlled outside
      access and optional computer programs; desktop + paired remote first. Phased: the shell and
      connections are built; model tasks, files and marketplace follow, each an open question
      until its phase.
      Later: chat-alongside visual editing with drag/reorganize/resize, independent Android and durable automation.
      2026-09-17: Phase 1 (the shell, the page view, pins, the creator skill, page data, floating
      themes) shipped to master; the contract was skipped on Destin's call.
      2026-09-23: Phase 2 (connections and refresh) merged (youcoded#552, cbc793a6f); Destin tested a live
      dashboard and a keyed weather page end to end. Next: a home-network connection for a Home
      Assistant page, then Phases 3–4 in the plan.
      `window-chrome` `all` `in-flight` `checked 2026-09-23` → docs/active/plans/2026-09-16-youcoded-pages-phasing.md

- [ ] Publish the page-builder skill's connections update once an app release carries Pages
      Phase 2. It is finished and held on wecoded-marketplace `session/youcoded-pages-phase2`
      (plugin 0.2.0): merging it before that release gives everyone a skill that builds connected
      pages their app cannot run. Merge it in the same step as the release.
      `window-chrome` `all` `blocked` `checked 2026-09-23`

- [ ] A page that manages a device on the home network: "one idea i had for a page is an explicit
      home assistant integration/management page" (2026-09-23, on the Phase 2 security deck). Pages
      are blocked from every home-network address today, including for "any website" pages, and
      the manifest refuses ports and address literals. Needs its own connection kind approved per
      device (for example `homeassistant.local:8123`), allowed past the private-address block for
      that exact device only, with the device's access token held like any other key, and its own
      approval wording. The blanket block stays for everything else.
      `window-chrome` `desktop` `decision` `checked 2026-09-23`

- [ ] A page allowed "any website" can, rarely, still reach a device on the home network: the app
      checks the address a name points to, then connects by name, and a hostile name server can
      answer differently the second time. Closing it means connecting to the address that was
      checked, which needs the `undici` package added to the app — a dependency change, so it waits
      for Destin's OK (Phase 2 design review finding 15; `net-guard.ts` HONESTY LIMIT).
      `window-chrome` `desktop` `decision` `checked 2026-09-23`

- [ ] A web browser as a page: "what if i want to create a basic web browser or something within
      youcoded?" An open-internet page can fetch from anywhere, but most large sites refuse to be
      shown inside another page, so a real browser needs the app to supply pages a website view
      (back/forward, its own approval wording, an answer for the phone where it likely cannot
      work). Deferred to its own round on the Phase 2 follow-up deck (2026-09-19).
      `window-chrome` `desktop` `decision` `checked 2026-09-19`

- [ ] Pages on a phone: the page view opens with the list always beside the page and the same band
      as on desktop, and nobody has designed what that becomes at phone width — on a narrow remote
      browser it will be cramped or unusable. Needs its own small round (collapse the list, or hide
      it behind a button only on phones). Connected pages (Phase 2) have also never been tried over
      remote access: requests should run on the computer and a key cannot be added from the phone,
      both covered by tests only.
      `window-chrome` `remote` `decision` `checked 2026-09-23`

- [ ] A page deleted (through chat) while it is open in the page view stays in the frame until
      another page is picked; it should fall back to "No page selected".
      `window-chrome` `desktop` `confirmed` `checked 2026-09-17`

- [ ] Pages went accent-coloured once: on Golden Sunbreak "hello timer and snake are both a weird
      yellow shade instead of the background shade used in project view", and in Halftone the same
      "with that theme's red"; it cleared on its own ("its fine now. idk what happened"). The page's
      own body reported the right dark colour while it showed, so the tint is not in the page
      document; suspected to follow a theme switch with a page open. Not reproduced since.
      `window-chrome` `desktop` `needs-verify` `checked 2026-09-17` `needs-repro`

- [ ] A plain "Terminal" choice when starting a new session — a bare terminal window as a
      YouCoded session, no assistant attached. Half of it is built: the local engine's "Run in
      terminal" button already opens exactly that session, and it is a real session in the strip.
      What is missing is the choice itself — the new-session form still never offers it, so the
      only way to get one is that one button. Destin's note on the 2026-09-05 local-engine
      questions deck: it would win over developers.
      `all` `in-flight` `checked 2026-09-06` → docs/archive/design/2026-09-04-local-engine-upgrades/local-engine-upgrades.questions.answers.json
