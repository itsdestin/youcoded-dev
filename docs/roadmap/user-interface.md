# user-interface — shared primitives, chrome, layout, copy
Filing test: does the fix change more than one screen? Yes — shared primitives, chrome,
layout, copy. Not here: one screen only — that screen's area, with the surface token.

- [ ] The files filter panel (Project View and the Files drawer) draws its own 12 px filter chip
      instead of the shared 14 px filter pill, the size the design guide already rejected as the
      smallest text in the app (noticed while building the Resume browser's phone filter panel, 2026-09-10)
      `files-panel` `all` `confirmed` `checked 2026-09-10`

- [ ] A lit filter chip is 2 px shorter than an idle one (the shared recipe drops the border when
      lit), so a picked chip sits visibly smaller than its neighbours in the same row — a design-guide
      question (G-14), not one screen's bug
      `all` `decision` `checked 2026-09-10`

- [ ] The before/after file comparison — the one shown on every tool card that edits a file —
      is hard to read for anyone who is not a developer. In the light theme the small + and −
      marks fail the app's own readability minimum (measured 2.31 and 3.5 against 4.5), and
      with pale pink and green rows a colour-blind reader cannot tell added from removed at
      all. Long lines break mid-word ("semantic toke / n system"), the box ends on a sliced
      half-line that looks like a fault, and "Expand (44 lines)" is 15px-tall grey text a
      finger cannot comfortably hit. Found 2026-09-09 by a context-free tester looking at the
      session-context panel; the defects belong to the shared renderer, so they affect every
      tool card (findings U18-U20 and U22)
      `desktop` `confirmed` `checked 2026-09-09` → docs/archive/reviews/2026-09-09-session-context-panel-ux-review-1.md

- [ ] A second window keeps showing the old default model or project folder until its own
      Settings panel is opened and closed
      `settings/defaults` `desktop` `confirmed` `checked 2026-09-07`

- [ ] While a session pill is being dragged from one window into another, nothing follows the cursor
      inside the SECOND window until it is dropped — the bar and chat area light up, but the pill
      itself is only drawn by the window it came from. The receiving window cannot read what is
      being dragged until the drop. Fix: main tells every other window the name and colour when
      the drag starts, so it can draw the carried pill too
      `window-chrome` `desktop` `confirmed` `checked 2026-09-04`

- [ ] After voice ships: a fallback to the speech service built into Windows and macOS for
      people who do not want the 464 MB download. Destin on the review deck 2026-09-05: "we may
      want to roadmap a fallback to built-in windows or mac speech services, but not rn".
      Same shelf: Moonshine v2 (106 MB, English only, 8 s at a time) as a smaller download if
      the 464 MB first download draws complaints (accepted on review V-0's risk card)
      `input-bar` `desktop` `parked` `checked 2026-09-05`

- [ ] On a phone the app is a shrunk desktop — status-bar chips, panels and desktop session
      switching — where Gemini, Siri and Claude mobile are built around quick dispatch and search.
      Wanted: a rethought default for the Android app and the mobile browser client covering quick
      chips, session switching and resume/history, with the full desktop-narrow UI still reachable
      rather than removed. Bigger than the 2026-07-20 narrow-viewport pass, and design-first: it
      needs its own workbench mockup round before any build
      `android` `parked` `checked 2026-09-02`

- [ ] Browser-default hover tooltips look foreign to the app — the whole main chat screen is
      done (`<Tooltip>`, ~88 hints); what is left is settings, the marketplace and project
      view, which Destin deferred until those files are touched anyway
      `all` `confirmed` `checked 2026-09-10` `v1.3.1` → docs/archive/investigations/2026-09-01-app-native-tooltips.md

- [ ] Error messages still guess at causes in many places — the app-wide audit of every error
      string (desktop, Android, Worker), choosing a specific message or the two-button
      Report/Diagnose card at each site, has not been done
      `all` `needs-verify` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-misleading-error-audit.md

- [ ] Chat panel vanished from a live session (beta.16, 2026-08-27) — no messages, and new
      sessions showed no "Start a conversation" text; Destin said ignore for now
      `chat` `desktop` `needs-verify` `checked 2026-08-27` `needs-repro` → docs/archive/investigations/2026-08-27-terminal-black-glyphs-mipmap-driver.md

- [ ] File and model sizes disagree with websites — the Local Models row says 74.2 GB for a
      download Hugging Face lists as 79.7 GB (same bytes; the app counts 1024-based, the site
      1000-based). Decided 2026-09-02: count 1000-based everywhere, the way websites, phones
      and drive labels do
      `all` `needs-verify` `checked 2026-09-02`

- [ ] Sustained sluggishness in real use — hiccups, lagging animations, freezes, on every
      surface, from launch and worse over hours and with more open sessions, on plain and
      glass themes alike (Destin, 2026-08-27). Cycles 1-3 have all shipped or are in review —
      cycle 3 (youcoded#398, folding far-off-screen messages to a spacer) directly addresses the
      render-cost half this item's investigation names: memory after reading six conversations
      back 4,346 → 1,784 MB, session switch 243 → 112 ms, main-thread blocking 4,882 → 1,703 ms.
      KEEP OPEN until Destin says real use feels better over hours — the investigation's second
      half (every open session stays mounted) is only partly addressed, since views still mount
      and it is their CONTENT that folds
      `all` `confirmed` `checked 2026-09-03` `performance` → docs/active/investigations/2026-09-01-ui-sluggishness-render-cost.md

- [ ] Text fields nested in cards are the same colour as the card — the model picker's
      trigger, the close-prompt editor and the resume tag sheet all read as labels, not
      something you can type in; each was patched separately (from youcoded #279, 2026-07-31)
      `all` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-field-surface-invisible-on-inset.md

- [ ] Floating things in the chat view can still land on top of each other — the reported
      "Jump to bottom" vs "Model unloaded" overlap was fixed 2026-07-28, but the other floats
      (attention toast, permission gates, loading spinners, sync status) were never audited
      `chat` `desktop` `needs-verify` `checked 2026-09-01` → docs/active/investigations/2026-09-01-chat-float-stacking.md

- [ ] Pressing a session whose name is shorter than the current one lets one or two more
      dots into the row, and they appear at once while the bar re-centres ~6px in a single
      frame — the only non-zero number left in the drag sweep after the 2026-09-03 rebuild
      (`scripts/ui-review/drag-fuzz.mjs`: "continuity 27px" at t≈press in every run). Not
      raised by Destin; the release itself is signed off (youcoded#404). Still there
      2026-09-07: 27.3-29.0 across three seeds x mouse and touch, every occurrence DURING the
      drag rather than at the release, and unchanged by that session's menu-grip work (a
      control run with the change removed scored the same)
      `desktop` `parked` `checked 2026-09-07` → docs/archive/handoffs/2026-08-31-session-strip-motion-handoff.md

- [ ] Right-clicking an image in chat or the file viewer offers nothing — no Copy image,
      Save image as…, Copy address, or Ask about this (the menu shipped for text, code,
      links and file pills only)
      `desktop` `needs-verify` `checked 2026-09-01`

- [ ] "Ask about this" native treatment (lift the message to screen centre, dim the window,
      trace the selection) — built on draft PR youcoded#263, still open; Destin 2026-07-28:
      decent for messages, "janky af" for the file viewer, needs more work before integrating
      `desktop` `parked` `checked 2026-09-01`

- [ ] The project-folder picker should be a dropdown with recently used folders like every
      other dropdown — but the app keeps no recents list at all yet (2026-07-24)
      `all` `needs-verify` `checked 2026-09-01`

- [ ] Whole-UI review — Phase F is the last phase still to decide and build: P-17 and the
      marketplace rails (phases A–E decided and shipped 2026-08-25 → 2026-08-28)
      `all` `needs-verify` `checked 2026-09-01`

- [ ] Remove the theme chip's cycle arrow altogether (Destin 2026-09-02); the outlined chips stay —
      special cases like the model-selector and permissions chips. Was: two Phase B chip questions: the theme chip's
      cycle glyph only shows on hover, so Android gets no cue; and two chips (teal, and the
      orange announcement pill) still carry coloured outlines
      `all` `needs-verify` `checked 2026-09-02`

- [ ] The main app shell is still one ~3,900-line component — three planned extraction
      tranches remain after the first one shipped 2026-07-17 (welcome screen and session
      hooks; memoised bottom/content areas for fewer re-renders; the event-bridge mount)
      `all` `needs-verify` `checked 2026-09-01` `performance`

- [ ] The specialists chip and the session strip (twice) still draw their own badges instead
      of the shared one, so chips, tags and key caps do not quite match
      `all` `needs-verify` `checked 2026-09-01`

- [ ] Let a model show an image in chat on purpose — a markdown image of a local file already
      renders inline by accident in the packaged app (2026-07-19), unconstrained in width and
      not in the dev build
      `all` `parked` `checked 2026-09-01` → docs/active/investigations/2026-09-01-markdown-image-capability.md

- [ ] Panel-opening transitions feel abrupt and undertuned and deserve real motion design
      (Destin, 2026-07-20) — no design pass yet; the session-switcher half shipped on
      2026-09-03 (youcoded#404, see shipped.md)
      `desktop` `parked` `checked 2026-09-03`

- [ ] Same per-tile blur cost the command drawer had (fixed in #277) may hit every other card grid —
      the files tab's document cards and any future grid. Never checked what backdrop they sit over,
      so the blur might be pure wasted GPU
      `all` `needs-verify` `checked 2026-07-31` `performance`

- [ ] An empty assistant bubble — just a timestamp, no content — appears above a permission card when
      the only tool in that bubble popped out to the card. Spec and plan are ready
      (`docs/active/investigations/2026-08-17-timestamp-only-assistant-bubble.md`); re-verified
      unbuilt 2026-08-26
      `chat` `all` `needs-verify` `checked 2026-09-01`

- [ ] The animation frame-budget cost ships to phones and remote browsers too, where nothing caps the
      frame rate and Reduced Effects defaults off — and it has never been measured there. Measure on a
      real phone before scoping
      `all` `needs-verify` `checked 2026-08-07` `performance`

- [ ] On the touchscreen Z13, the app's touch accommodations — bigger tap targets, buttons that
      otherwise only appear on hover — probably never switch on, because the app judges the machine
      mouse-driven (found fixing the on-screen keyboard, 2026-09-10)
      `desktop` `needs-verify` `checked 2026-09-10`

- [ ] Tapping a quick chip when the typing box already has text should offer a small menu —
      Replace or Append — and skip the menu when the box is empty (Destin, 2026-09-02; same rule
      as editing a queued message, native-harness → sessions)
      `quick-chips` `all` `needs-verify` `checked 2026-09-02`

- [ ] Two places still open a section with a bare "›" beside a word — the Backup & Sync log
      ("Show log") and the system marker in chat. Destin (2026-09-05 review deck): "I HATE the
      bare dropdowns with a chevron." The rule is now design-guide G-22; the Local Models engine
      card, its model rows and its recommended-model card all switched to it on
      `feat/local-engine-upgrades`, these two have not.
      `all` `confirmed` `checked 2026-09-06` → docs/archive/design/2026-09-04-local-engine-upgrades/local-engine-upgrades.review.answers.json

- [ ] Warning text elsewhere in the app is still one fixed amber, so it can vanish on a pale
      theme the same way the local-model memory warning did. Measured on 2026-09-06: that amber
      scores 1.05:1 on Creme's card and 1.16:1 on Light's — both BUILT-IN themes — against a
      4.5:1 floor. The memory warning was moved to the new per-theme `--warning-fg` on
      `feat/local-engine-upgrades`; 27 other `text-amber-*` sites were left alone deliberately,
      because switching them changes their colour on the dark themes they were signed off in.
      Includes this feature's own "Will be tight — close other apps first" label. Same fix, one
      class at a time, each with a look at the surface it sits on.
      `all` `confirmed` `checked 2026-09-06`

- [ ] Model rows in the picker carry no tags, so choosing means knowing the names. Destin wants
      **cost and intelligence tags** on each row, and the tokens-per-second tag filed alongside
      them in local-models is meant to sit in the same strip — three coloured tags answering
      "what will this cost me, how clever is it, how fast is it" at a glance. His words,
      2026-09-06: "the cost/intelligence tags i want to eventually build in the model selector".
      Undesigned: where the numbers come from (OpenRouter publishes per-model pricing; nothing
      publishes "intelligence", so it is either a curated band or a benchmark we choose and
      defend), what a local model shows for cost (nothing? "free"?), and whether three tags fit
      a row that already carries a name, a source and a favourite star.
      `model-picker` `all` `confirmed` `checked 2026-09-06`

- [ ] Closing a dialog opened from the Development menu closes the menu behind it too, and
      "Known issues" closes everything with nothing on screen acknowledging it. Found by a
      context-free UX tester on 2026-09-10 (`docs/active/reviews/2026-09-10-error-states-unit-a-ux-review-2.md`
      U9). It is shared dialog behaviour, not one screen's — changing it alters every menu in
      the app, so it was filed rather than special-cased inside a feature
      `settings/development` `desktop` `confirmed` `checked 2026-09-10`

- [ ] The (i) help bubbles cover the rows and buttons they describe, so reading one hides the
      thing it is about. Same review, U10. `AnchorTip` placement is shared by every settings
      page; the fix belongs to the primitive
      `settings` `desktop` `confirmed` `checked 2026-09-10`
