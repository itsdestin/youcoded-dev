# user-interface — shared primitives, chrome, layout, copy
Filing test: does the fix change more than one screen? Yes — shared primitives, chrome,
layout, copy. Not here: one screen only — that screen's area, with the surface token.

- [ ] **v1.3.1 release blocker.** The settings screen exists twice, once for desktop and once for phone.
      They share 14 of 17 rows, so every settings change is made twice and the two can disagree.
      Wanted: one settings body with two small platform inserts (simplification phase 5, D8). Row
      order may shift slightly, so it needs a before/after review deck (both platforms, every theme).
      On hold since 2026-09-18 (Destin); resumes with the rest of phase 5
      `settings` `all` `blocked` `P1` `checked 2026-09-18` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md

- [ ] Error messages still guess at causes in many places.
      The app-wide re-audit is done and batch 1 of 7 (seventeen messages that stated something false)
      shipped 2026-09-11. Left: Android and crash plumbing, one Report/Diagnose block, "couldn't
      load" shown as "none", silent action failures, look and wording, guards. Destin's rule: every
      error state offers an action
      `all` `confirmed` `P1` `checked 2026-09-11` `v1.3.1` → docs/active/investigations/2026-09-10-error-inventory/README.md

- [ ] Browser-default hover tooltips look foreign to the app.
      The whole main chat screen is done (`<Tooltip>`, 82 hints); left are settings, the marketplace
      and project view (~148 of 236 hints). Settled: the ~1 s delay stays and there is no circled-i;
      every hint, long ones included, is a hover hint.
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#19): "want to deal with all in 1.3.2" (reverses the 2026-09-23 1.3.1-blocker call)
      `all` `confirmed` `P2` `checked 2026-09-10` `v1.3.2` → docs/archive/investigations/2026-09-01-app-native-tooltips.md

- [ ] Model rows in the picker carry no cost or intelligence tags, so choosing means knowing the names.
      Destin 2026-09-06: "the cost/intelligence tags i want to eventually build in the model selector".
      The tokens-per-second tag from local-models is meant to sit in the same strip. Undesigned: where
      the numbers come from (pricing is published, "intelligence" is not), what a local model shows
      for cost, and whether three tags fit a row with a name, source and favourite star.
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#11): postponed — "but a significant priority for 1.3.2/1.3.3"
      `model-picker` `all` `confirmed` `P2` `checked 2026-09-06` `v1.3.2`

- [ ] Hard-to-read text: low contrast and unclear marks (4 things).
      (a) A busy red outlined button ("Stopping…") has dimmed text at 3.98:1 on Midnight, under 4.5:1;
      every such button shares it (report: docs/archive/reviews/2026-09-26-admin-password-ux-review-2.md);
      (b) the before/after file comparison on tool cards: in the light theme the + and − marks fail
      the minimum, pale pink and green rows are indistinguishable to a colour-blind reader, long
      lines break mid-word, the box ends on a sliced half-line, and "Expand (44 lines)" is a tiny
      grey target (report: docs/archive/reviews/2026-09-09-session-context-panel-ux-review-1.md);
      (c) warning text is one fixed amber that vanishes on pale themes (1.05:1 on Creme, 1.16:1 on
      Light) at 27 remaining places, each needing a look; (d) text fields inside cards match the
      card colour and read as labels (report: docs/active/investigations/2026-09-01-field-surface-invisible-on-inset.md).
      `all` `confirmed` `P3` `checked 2026-09-01`

- [ ] Shared-control drift: screens that do not match the shared look (7 things).
      (a) The design check still lists ~530 places that override a shared button, type a size by hand
      or use an off-theme colour, each group needing a design call; (b) about twenty clickable
      non-buttons have no hover and no keyboard path (command drawer, resume rows, model picker,
      settings rows and more), plus spreadsheet sheet tabs and six buddy buttons; (c) two bare-triangle
      "Show details" dropdowns in Backup & Sync and two bare "›" openers (Sync Log, chat system
      marker) — Destin: "I HATE the bare dropdowns with a chevron" (G-29); (d) the files filter
      panel draws a 12 px chip instead of the shared 14 px pill; (e) a lit filter chip is 2 px shorter
      than an idle one (design-guide G-14); (f) the specialists chip and session strip draw their
      own badges instead of the shared one.
      `all` `confirmed` `P3` `checked 2026-09-01`

- [ ] Phone-width and touch polish (3 groups).
      (a) A tester on a phone browser (2026-09-10) hit: "Session" wording a student would not use,
      the "Deliverables" pill, "delivered" and mixed time formats on file rows, filter popup labels,
      Projects tabs shrinking to unreadable icons, "on disk · modified", a code box clipped with no
      scroll, a hover-only Magnify and hover-only Remove control, an inert Conversations card, and
      "224 B" file sizes; proposed wording in docs/archive/reviews/2026-09-10-remote-batch-2-3-ux-review-1.md;
      (b) the Cloud providers card wraps "Signed in as…" one word per line, the welcome form and
      session-strip form differ, and Create Session wraps onto two lines (report:
      docs/archive/reviews/2026-09-10-first-run-guide-ux-review-1.md); (c) on the touchscreen Z13 the
      bigger tap targets and hover-only buttons probably never switch on.
      `all` `confirmed` `P3` `checked 2026-09-10`

- [ ] Messages vanish from an open chat: the chat panel emptied behind "Start a conversation"
      mid-conversation for a friend on Windows and for Destin on Linux (2026-09-27) while Claude
      still had the messages. Four causes fixed; the remaining one is unknown. Next step: a
      tripwire that logs what emptied an open chat, or the friend's log file.
      `chat` `desktop` `needs-verify` `P2` `checked 2026-09-27` `needs-repro` → docs/archive/investigations/2026-08-27-terminal-black-glyphs-mipmap-driver.md

- [ ] Chat view glitches (2 things).
      (a) Floating items (attention toast, permission gates, spinners, sync status) were never
      audited for landing on top of each other (docs/active/investigations/2026-09-01-chat-float-stacking.md);
      (b) an empty timestamp-only assistant bubble appears above a permission card (spec:
      docs/active/investigations/2026-08-17-timestamp-only-assistant-bubble.md).
      `chat` `all` `needs-verify` `P3` `checked 2026-09-01`

- [ ] Dialogs, help bubbles and window drag (3 things).
      (a) Closing a dialog from the Development menu closes the menu behind it, and "Known issues"
      closes everything with nothing acknowledging it; (b) the (i) help bubbles cover the rows and
      buttons they describe; (c) while a session pill is dragged into a second window, nothing follows
      the cursor there until the drop.
      `desktop` `confirmed` `P3` `checked 2026-09-04`

- [ ] Small missing conveniences and copy fixes (4 things).
      (a) Right-clicking an image offers no Copy image, Save as, Copy address or Ask about this;
      (b) the project-folder picker should be a dropdown of recent folders, but no recents list
      exists; (c) tapping a quick chip over existing text should offer Replace or Append (Destin,
      2026-09-02); (d) file and model sizes disagree with websites (74.2 GB vs 79.7 GB); decided to
      count 1000-based everywhere.
      `all` `needs-verify` `P3` `checked 2026-09-01`

- [ ] Unfinished whole-UI cleanup (2 things).
      (a) Whole-UI review Phase F (P-17 and the marketplace rails) is the last phase still to decide
      and build; (b) the main app shell is still one ~4,650-line component with three planned
      extraction steps left (welcome screen and session hooks, memoised areas, event-bridge mount).
      `all` `needs-verify` `P3` `checked 2026-09-01` `performance`

- [ ] Parked ideas: motion, voice and chat images (5 things).
      (a) Files and Games panels still pop open and shut; Destin 2026-09-18: "add animations for
      opening the files/games panels so they feel less poppy", then dropped it for now. A full
      build, never reviewed or seen running, waits on youcoded branch `followup/right-pane-motion`:
      rebase it and show him in a dev window first. Same follow-up owns other places to animate
      (menus, dropdowns, tooltips vanish instantly; dialogs, Projects, Resume unsurveyed);
      (b) fallback to built-in Windows/Mac speech for people skipping the ~650 MB voice download,
      or smaller Moonshine v2 (106 MB); (c) pressing a shorter-named session re-centres the bar
      ~6 px in one frame (report: docs/archive/handoffs/2026-08-31-session-strip-motion-handoff.md);
      (d) let a model show an image in chat on purpose (report:
      docs/active/investigations/2026-09-01-markdown-image-capability.md); (e) panel-opening
      transitions feel abrupt (Destin, 2026-07-20), no design pass yet.
      `all` `parked` `P3` `checked 2026-09-01`

- [ ] After the window reloads it returns to the first session instead of the one you were on.
      Seen 2026-10-05 in the performance rig's reload test (a chat message typed after the
      reload went to the wrong session); not caused by the performance work
      `all` `needs-verify` `P3` `checked 2026-10-05` → docs/active/investigations/2026-10-04-performance-gap-review.md
