# user-interface — shared primitives, chrome, layout, copy
Filing test: does the fix change more than one screen? Yes — shared primitives, chrome,
layout, copy. Not here: one screen only — that screen's area, with the surface token.

- [ ] Dropping a session onto another window's chat area makes a THIRD window instead of moving it
      there — only the thin session bar at the top accepts a drop, and that is a small target to
      hit while dragging. Open question: make the whole window accept it, which costs the ability
      to tear a session off by flicking it into space that happens to sit over another window
      `window-chrome` `desktop` `decision` `checked 2026-09-03`

- [ ] A session can only be moved between windows by dragging it — there is no menu command and no
      keyboard path. The "Launch in New Window" toggle only decides where a NEW session starts, so
      a session that is already open in the wrong window can only be rescued with the mouse
      `window-chrome` `desktop` `confirmed` `checked 2026-09-03`

- [ ] While a session pill is being dragged from one window into another, nothing follows the cursor
      inside the SECOND window until it is dropped — the bar and chat area light up, but the pill
      itself is only drawn by the window it came from. The receiving window cannot read what is
      being dragged until the drop. Fix: main tells every other window the name and colour when
      the drag starts, so it can draw the carried pill too
      `window-chrome` `desktop` `confirmed` `checked 2026-09-04`

- [ ] Dictation is not built into the message box — speaking a message means OS-level dictation
      glued on top, which does not punctuate. Wanted: a mic in the input bar that produces properly
      punctuated, readable text the way a phone keyboard's voice input does, with live partial
      transcript while speaking. Destin asked for this to rank higher than a normal idea. Undesigned:
      which speech engine (local matters for the run-everything-local audience), and Android parity,
      where dictation matters most
      `input-bar` `all` `parked` `checked 2026-09-02`

- [ ] On a phone the app is a shrunk desktop — status-bar chips, panels and desktop session
      switching — where Gemini, Siri and Claude mobile are built around quick dispatch and search.
      Wanted: a rethought default for the Android app and the mobile browser client covering quick
      chips, session switching and resume/history, with the full desktop-narrow UI still reachable
      rather than removed. Bigger than the 2026-07-20 narrow-viewport pass, and design-first: it
      needs its own workbench mockup round before any build
      `android` `parked` `checked 2026-09-02`

- [ ] Browser-default hover tooltips look foreign to the app — first noticed 2026-07-28 on the
      /clear "Cleared — still here to read" hint; every hover hint in the app is one of these
      `all` `confirmed` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-app-native-tooltips.md

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

- [ ] Fold Defaults + Permissions + Model Providers into one "Assistant settings" panel —
      mockup built 2026-08-18 (four provider-first pages) and never reviewed by Destin; it now
      lives on branch feat/assistant-settings-mockup (worktree worktrees/assistant-settings)
      Destin 2026-09-02: not a review next session, but finishing it is a pre-1.3 priority
      `settings` `desktop` `needs-verify` `checked 2026-09-02` `v1.3`

- [ ] Pressing a session whose name is shorter than the current one lets one or two more
      dots into the row, and they appear at once while the bar re-centres ~6px in a single
      frame — the only non-zero number left in the drag sweep after the 2026-09-03 rebuild
      (`scripts/ui-review/drag-fuzz.mjs`: "continuity 27px" at t≈press in every run). Not
      raised by Destin; the release itself is signed off (youcoded#404)
      `desktop` `parked` `checked 2026-09-03` → docs/archive/handoffs/2026-08-31-session-strip-motion-handoff.md

- [ ] Right-clicking an image in chat or the file viewer offers nothing — no Copy image,
      Save image as…, Copy address, or Ask about this (the menu shipped for text, code,
      links and file pills only)
      `desktop` `needs-verify` `checked 2026-09-01`

- [ ] The right-click menu may not open from a long-press on Android — never tried on a
      device; a long-press is also how Android starts a text selection, so the menu could
      make selecting text harder rather than easier
      `android` `needs-verify` `checked 2026-09-01` `needs-repro`

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

- [ ] On the touchscreen Z13, the desktop app's on-screen keyboard interactions misbehave (Destin,
      2026-09-02; details to be gathered). Investigate together with the Android keyboard item
      `input-bar` `desktop` `needs-verify` `checked 2026-09-02` `needs-repro`

- [ ] Tapping a quick chip when the typing box already has text should offer a small menu —
      Replace or Append — and skip the menu when the box is empty (Destin, 2026-09-02; same rule
      as editing a queued message, native-harness → sessions)
      `quick-chips` `all` `needs-verify` `checked 2026-09-02`
