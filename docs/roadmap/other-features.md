# other-features — real features too small for their own area
Filing test: a real user-facing feature too small for its own area. Not here: its sublevel
has passed ~8 items — graduate it to its own file.

## accounts

- [ ] Accounts: silent sign-out and Phase 2 leftovers (2 items).
      (a) One rejected server call quietly signs you out with no notice; friends then see you
      offline forever and you only find out by opening the friends panel. The log half shipped; the
      on-screen notice still needs a copy and surface decision (report:
      docs/active/investigations/2026-09-01-social-401-silent-signout.md). (b) Phase 2 leftovers:
      the two-person sign-in checklist never ran on a released build; a phone browser can't make
      account or social calls through remote access; the old PartyKit lobby room is still deployed;
      "Last seen Xm ago" never ticks while you watch; the friends screen is still buried inside the
      game lobby's code.
      `all` `needs-verify` `P3` `checked 2026-09-01`

## buddy

- [ ] Buddy window: 3 open items.
      (a) Typing in the buddy window while Claude Code shows a permission, question or plan menu
      sends it straight into the menu and confirms the highlighted option; the main chat refuses
      and offers "Send anyway" (report: docs/active/investigations/2026-09-01-buddy-chat-input-bar-pty-gate.md).
      (b) The buddy's Allow button for multiple-choice questions may do nothing, as it did for plans;
      questions are unchecked. (c) The buddy never does anything of his own between reactions:
      wanted are small spontaneous moments (a glance, a stretch, dozing off after a few quiet minutes,
      waking when anything happens), always quieter than the "a session needs you" animation and
      stopping the instant a session turns red, amber or blue. The asleep pose is built and signed
      off; nothing drives it yet.
      `buddy-window` `desktop` `confirmed` `P3` `checked 2026-09-01`

## onboarding

## misc

- [ ] Parked ideas: 7 features, none started.
      (a) Share a document with someone through your YouCoded account, with comments and history
      (Destin, 2026-09-24); needs online storage and permissions. (b) Friends list can show someone
      Online or offline who isn't until you reconnect; Destin: "fine for now". (c) Announcement banner
      text is fetched unsigned and uncapped, so a compromised file could push any text to every client.
      (d) Buddy companions (sun, motes, ghost, Zzz) show only on the welcome screen, not the floater;
      needs a padded-window design. (e) A proper first-run screen (name, comfort level, output style,
      curated defaults, with a skip button) replacing the setup wizard. (f) Automation results
      delivered to Telegram, Discord or email, once Agents & Automations exists. (g) A fediverse page
      with a Threads-like feel; wait for Pages sign-in, wider picture loading and background refresh.
      `all` `parked` `P3` `checked 2026-09-01` `security`

- [ ] Small items: 2.
      (a) The dev log shows React's "Cannot update a component while rendering a different component"
      warning when many sessions arrive at once (a phone's catch-up); nothing visibly wrong yet.
      (b) Nothing in the app or on youcoded.ai points to r/youcoded; proposed a "Community" link in
      Settings and the site footer once the subreddit has a few posts (not yet answered).
      `all` `confirmed` `P3` `checked 2026-09-10`

- [ ] Explore bringing YouCoded to iOS. Today an iPhone only reaches the app through Safari pointed
      at another device. Options: a native app around the shared interface (minus on-device runtime,
      which App Store rules refuse), a pair-to-desktop-only app, or a web client over an encrypted
      remote connection. Wanted: a written comparison of cost, App Store limits and what each can do
      before any build. Constraint: an iPhone app cannot start other programs and rule 2.5.2 bars
      downloaded code, so no bash, git or Claude Code on the phone; likely shape is the built-in
      assistant with in-app file tools plus "connect to my computer".
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#4): postponed until after 1.3.1
      `n/a` `decision` `P2` `checked 2026-09-23`

- [ ] YouCoded Pages: let people create and install their own native-looking pages, from dashboards
      and paint studios to specialized assistants, and pin favorites beside Projects. Scope approved
      (live themes, personal and project pages, marketplace pages, controlled outside access);
      desktop and paired remote first. Phase 1 (shell, page view, pins, creator skill, page data,
      floating themes) and Phase 2 (connections and refresh) are on master; Destin tested a live
      dashboard and a keyed weather page. 2026-10-07: a page's home-device connection (approval with
      address + key), a live connection for pages, camera video played by the app, see-through page
      glass and the hand-installed Home Assistant Home page merged from session/ha-pages-connection
      (record: docs/archive/handoffs/2026-10-05-home-page-state.md). Next: Phases 3–4 (model tasks, files, marketplace); later,
      chat-alongside visual editing and durable automation.
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#16): next phases postponed — "finsih in 1.3.2/1.3.3"
      `window-chrome` `all` `in-flight` `P2` `checked 2026-09-23` `v1.3.2` → docs/active/plans/2026-09-16-youcoded-pages-phasing.md

- [ ] YouCoded Pages follow-ups: 6 decisions and sightings.
      (a) The page-builder skill's connections update (plugin 0.2.0) is finished and held until an
      app release carries Pages Phase 2; merge it in the same step. It must also learn the home-device
      connection, the live connection, camera video and the see-through background (merged 2026-10-07)
      before that release. (b) Home page (Home Assistant) follow-ups deferred at the 2026-10-07 merge,
      never designed: search across devices; selecting several devices at once in Edit; a scenes button
      on rooms with a single light; see-through glass for Framed-layout themes such as Golden Sunbreak
      ("i want it to peek through to the real theme background"; only Floating/Minimalist frost today).
      (c) A page allowed "any website" can rarely still reach a home-network device through a hostile
      name server; the fix adds a package, so it waits for Destin's OK. (d) A web browser as a page:
      most big sites refuse to show inside another page, so the app would need a website view.
      (e) Pages on a phone: nobody designed the narrow layout, and connected pages were never tried
      over remote access. (f) Pages once turned accent-coloured (Golden Sunbreak, Halftone: "a weird
      yellow shade") and "its fine now. idk what happened"; not reproduced.
      `window-chrome` `all` `needs-verify` `P2` `checked 2026-10-07` `needs-repro`

- [ ] A plain "Terminal" choice when starting a new session — a bare terminal as a YouCoded session,
      no assistant attached. The local engine's "Run in terminal" button already opens exactly that
      session; the new-session form never offers it. Destin on the local-engine deck: it would win
      over developers.
      `all` `in-flight` `P3` `checked 2026-09-06` → docs/archive/design/2026-09-04-local-engine-upgrades/local-engine-upgrades.questions.answers.json
