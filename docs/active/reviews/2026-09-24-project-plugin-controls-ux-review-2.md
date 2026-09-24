# Project & plugin controls — beta-tester UX review (2)

Scenario: default (`http://localhost:5523/?mode=workbench&child=1&view=app&scenario=default&latency=150`),
plus a quick check of `scenario=stress`. Screens: `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/`.

- U1 — Expected clicking "Ask assistant to set it up" (in the "Set up Linear" dialog) to start
  setting up the Linear connection / Was dropped into a brand-new, blank chat that never leaves
  "Initializing session…"; after ~6 seconds the app itself flags "Something may be wrong. The
  terminal may show what it is waiting on." with a "Check terminal view" button — clicking that
  button shows a terminal transcript about a completely unrelated, already-finished task ("can you
  check why the sidebar flickers on theme change?"), with no mention of Linear anywhere. There is
  no way to get from here to an actually-configured Linear connection. A console error also fires
  at the same moment: "Cannot update a component (AppInner) while rendering a different component
  (AppInner)" — a real React warning, not just fake data. — Projects → youcoded → Skills & tools →
  Linear → Set up here → Ask assistant to set it up — screenshots:
  `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/u1-set-up-linear-dialog.png`,
  `.../u1-linear-hang.png`, `.../u1-terminal-unrelated.png`

- U2 — Expected that installing a plugin from the Marketplace would let me then turn it on for a
  project (the task's whole point) / After installing "Remember" from the Marketplace (it shows
  "INSTALLED" immediately, no confirmation step), it does not appear anywhere in any project's
  "Skills & tools" list — not under "Built into youcoded," not under "Added on this device," not
  under "Personal skills & tools." Checked two different projects (youcoded and recipes); same
  result in both. I could not find any screen that lets you choose which project(s) a
  newly-installed plugin should run in. — Marketplace → install "Remember" → Projects → any
  project → Skills & tools — screenshots:
  `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/install-remember-marketplace.png`,
  `.../u2-remember-missing-youcoded.png`, `.../u2-u4-remember-missing-and-stale-label-recipes.png`

- U3 — Expected to be able to reach every item in a project's "Skills & tools" list on a normal
  window / At the app's default size (1440×900, a completely ordinary laptop resolution), the last
  two rows — "Writing helper" and "Linear," the exact two items the task asks you to set up — are
  cut off at the bottom of the window with no scrollbar and no way to scroll to them. I tried
  scrolling the page, scrolling the panel, and the tool's own dialog-scroll helper; none found a
  scrollable region. The rows only appear if the window is resized taller (confirmed at
  1440×1600). A first-time user at a normal window size would never know these two items exist. —
  Projects → youcoded → Skills & tools — screenshots:
  `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/u3-clipped-900.png`
  (cut off) vs `.../u3-full-1600.png` (same screen, taller window, everything visible)

- U4 — Expected the "Skills & tools" section header to name the project I'm looking at / After
  switching to the "recipes" project, the section still reads "BUILT INTO YOUCODED Ready to choose
  for this project" — a leftover label from the previously-open project. Confusing: it looks like
  recipes secretly runs youcoded's built-in tools. — Projects → recipes → Skills & tools —
  screenshot: `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/u2-u4-remember-missing-and-stale-label-recipes.png`

- U5 — Wording: "Linear" is labelled "Tool connection (MCP server)" and "Marketplace Publisher" /
  "Research Kit" etc. call themselves plugins/skills. "MCP server" is developer jargon a non-coder
  will not know. Propose: "Tool connection (from another program)" or just "Outside connection" —
  drop "MCP server" from the user-facing label (it can stay in a tooltip/detail view for people who
  care). — Projects → youcoded → Skills & tools — screenshot:
  `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/u3-full-1600.png`

- U6 — Visual/contrast: several small labels render at very low contrast against their background
  in the Midnight theme — the active "Skills & tools" tab label measured 1.09:1 (needs 4.5:1), the
  "Chat" view-toggle label measured 1.24:1, and the small "|" quote-collapse marks in assistant
  messages measured ~2:1. These read as nearly invisible dark-on-dark text. — seen on every screen
  in this review, e.g. `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/u3-full-1600.png`

- U7 — Wording, minor: "Set up Linear" dialog copy — "Its connection and any sign-in stay on the
  device where they were set up, so it needs setting up here too." Reads awkwardly (double "set
  up"/"setting up"). Propose: "Its connection and sign-in only exist on the device where you added
  it — you'll need to connect it here too." — screenshot:
  `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/u1-set-up-linear-dialog.png`

## What worked

- Turning a built-in tool ("Chat Search") on and off for a project worked exactly as expected: the
  toggle flips, the row's caption updates from "Automatic use off" to "Automatic use on," and it
  held after leaving and re-entering the screen. Screenshots:
  `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/toggle-chat-search-off.png`,
  `.../toggle-chat-search-on.png`
- The in-chat skills menu (the small icon next to the message box) clearly separates skills the
  assistant "may choose" on its own (green "Automatic" tag) from ones you have to invoke yourself
  with "/" (orange "Manual use" tag), with a one-line legend at the top of the list. This directly
  answered "which skills run on their own vs. which I pick." Screenshot:
  `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/skills-menu-automatic-vs-manual.png`
- Checked the stress scenario (2000 conversations/files, 1978 marketplace items) for both screens
  this task touches: the project's Skills & tools list (still just 6 short rows regardless of file
  count — U3's clipping problem is unrelated to data volume, it happens even with 3 files) and the
  Marketplace grid. Both rendered fully with no blank placeholder or truncated row in the
  screenshot. A single screenshot can't rule out a brief stutter, but there was no visible hang.
  Screenshots: `docs/active/reviews/2026-09-24-project-plugin-controls-ux-review-2-screens/stress-skills-tools.png`,
  `.../stress-marketplace.png`

## Could I complete the task, and what was most confusing

I completed most of the task: I opened a project's Skills & tools, turned a plugin off and back
on, tried to set up something missing (Linear, an outside-service connection), found the
automatic-vs-manual skills menu in chat, and installed a plugin from the Marketplace. I could
**not** complete the very last step — actually choosing which project(s) should use the
newly-installed plugin — because the plugin never showed up on any project's Skills & tools screen
(U2). The single most confusing moment was trying to set up Linear: the app told me on its own
"Something may be wrong," offered a "Check terminal view" escape hatch, and that escape hatch
showed me someone else's finished, unrelated conversation instead of anything about Linear — a
dead end with no way back to the thing I was trying to do except abandoning it.

## Triage (implementing session)
- U1 rejected — not this feature: the same "Initializing session…" hang and the same React "Cannot update a component (AppInner) while rendering…" error occur on origin/master's workbench from Projects → New Conversation (reproduced 2026-09-24 in a temporary master worktree); the workbench's fake backend never initializes a new session. "Ask assistant" reuses that existing create-session path with a prefilled request.
- U2 accepted — real gap: a Marketplace CARD install skipped the post-install project setup; fixing so every plugin install with parts reaches it. The workbench fixture also gains installed plugins.
- U3 rejected — the tab scrolls: a scripted scroll at 1440×900 brought "Writing helper" and "Linear" fully into view (capture scratch/u3/out/midnight/skills-bottom.png); the tester's tool could not wheel-scroll, and the app hides scrollbars on every Projects tab.
- U4 accepted — label "Built into YouCoded" read as naming the project "youcoded"; becomes "Built in".
- U5 accepted — "(MCP server)" dropped from user-facing labels.
- U6 rejected — out of scope: app-wide chrome contrast (the view toggle and tab labels), present on master; not introduced here.
- U7 accepted — shorter setup-dialog wording.
