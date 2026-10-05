---
status: active
date: 2026-09-21
revised: 2026-10-04
owner: Destin (taste and acceptance) / assistant (research, proposals and implementation)
related: docs/active/design/2026-09-23-ui-element-review/ (decisions, research, decks, guide draft); docs/active/design/2026-08-25-ui-design-guide.md (old guide, to be archived)
---

# A real design language for YouCoded — guide and app

## Goals

1. **A new design guide** that lets anyone building a new screen, popup or Page make it
   look like Destin designed it. General rules and build instructions, with real screens
   named only as examples — not a description of every existing screen. It completely
   replaces the old AI-written guide (`2026-08-25-ui-design-guide.md`), which is archived.
2. **Every rule in it comes from Destin's own choices**, made by comparing real screens
   side by side (Today vs. proposals), never from word-only questions or from the old guide.
3. **Nothing important left out:** every kind of element and every screen of the app is
   covered — how things look *and* how they are arranged (spacing, text order, button
   placement, layout).
4. **The app brought into line** with the guide, in small batches Destin sees before and
   after, plus the real bugs found along the way.
5. **Proof the guide works:** fresh builders given only the guide make three mock Pages
   (smart home, code review, messaging) that Destin judges as his taste.

## How decisions are made (lessons from this effort)

- Show **whole real screens** under each option, captured from the test copy of the app
  with style proposals switched on (`?proposal=` in the workbench; files in
  `youcoded/desktop/src/renderer/dev/workbench/proposals/`). Never ask about looks in words.
- Label which option is **today**; never show two identical options unlabelled; one question
  per slide; re-ask anything answered "confused".
- Record every answer in `decisions.md` with its source (`<deck>#<step>`). Only those rows
  may become guide rules. A rule carried over from how the app already works is shown to
  Destin marked as such.
- Answers are saved only on Submit. Commit and push after every step.
- **Build only from the guide's existing recipes**; when none fits, ask rather than invent
  (round 10 of the tags work: "both violate the design guide as we've established it").
- **Show options as pictures**, never a list of words ("let me see the different options.
  hard to do with text"); a slide whose "options" are not real alternatives confuses —
  use a keep/revert slide instead.
- **Judge pixel detail at Destin's screen scale (1.5×):** `SHOOT_SCALE=1.5 node
  scripts/shoot/shoot.mjs …`. A 1× picture hid a misalignment he saw; for anything his eyes
  and the numbers disagree on, a live deck (real app panes in the page) settled it.
- **No line across the full width of a card** — spotted instantly and rejects a whole slide.
- **After three or four rejected rounds, stop and ask which direction** instead of guessing
  a fifth layout (the Resume sheet: four rounds, then "popup" settled it in one).

## Status (2026-10-04)

All work is on `session/ui-consistency-audit` (workspace and app), committed and pushed.
Nothing is on master. **Master was merged into both branches on 2026-10-04** (app 335
commits, workspace 217; conflicts settled, full verify green afterwards); merge it again
before the final review.

**Done**
- Element inventory, second audit and completeness check (`inventory/`, `audit/`).
- Decisions for the guide (`decisions.md`, every row sourced to a deck answer): titles,
  headings and labels (sentence case, no spaced capitals, 16px full-screen Large), control
  roundness, buttons and their placement, Settings anatomy and switch rows, card levels and
  one card outline per layer, popup spacing (16 between groups, 8 between boxes), "nothing
  bare" and "a label first", status pills and notice boxes, short error boxes, card anatomy,
  frame outline, model picker, account, Projects view, and the tags rebuild.
- Guide draft kept in step: `guide-draft.md` (not yet approved as a whole).
- App batches landed and approved: card levels, surface levels, popup spacing, nothing bare
  (Sound, About, Performance, Shortcuts), Help merged with Development, last Settings
  screens, labels batch (17 screens), quick fixes, sentence case (~150 screens), frame
  outline, error lines/buttons/notices, status pills and provider notices, model picker,
  account, Projects view, Appearance (theme editor removed; Particles in Additional
  customizations), skills drawer (opens at 70%, draggable handle), Marketplace/Library
  headings, skill editor deleted, specialist permission ask, status bar widgets menu, quick
  chips two-shelf editor.
- **Tags rebuilt (2026-10-02…04):** "Tags & note" is now **Session details** (name, quoted
  note, one Tags card, Pin to top) and Resume, the side panel and the Projects preview open
  the same popup; Priority became Pin to top; new tag pill look (level icon and word at any
  screen scale, round ×/+ sized to the pill, 3+ tags collapse to a hover stack); status bar
  element is icons only; the line across Resume cards removed. Redesign backlog 1–8, 14, 15
  done (`redesign-backlog.md`).
- **Bugs fixed along the way (tags work):** a slow tag/note read for the conversation just
  left overwrote the one on screen (now only the newest read lands; pinned by a test); a
  failed tag refresh is reported on both tag editors (tested); two load-sensitive tests
  corrected (App import warmed in `beforeAll`; the random-replies budget named).
- **First run, welcome and the YouCoded themes (2026-10-04):** setup rebuilt on the brand
  (stacked name, lavender surface, plain install line + spinner, failure card with Retry and
  details, sign-in that explains plan / pay-as-you-go / local with company logos, fits every
  window size); ChatGPT and OpenRouter browser sign-in pages branded; first-time welcome is
  D1 with the buddy beside the heading; new built-in themes **YouCoded / YouCoded Night**
  (drawn wallpaper, glass panels, Outfit, default for new installs only) with the **glass
  buddy**; header dividers use the card-outline colour. Backlog 12 and 16 done; 18 filed
  (the backup warning's new home). Records: `decisions.md` (First-run … Glass buddy rows).
- Tooling: `SHOOT_SCALE` for screenshots at a screen's pixel density;
  `scripts/brand/glass-buddy.py` (glass buddy rig from a theme picture) and
  `scripts/brand/theme-walls.html` (the theme pictures); `theme-previews.py` knows the new
  built-ins.

**Earlier bug list (2026-09-24) — status not re-checked this session; verify in the final
review:** Add a project / Import file close buttons; hovered vs selected rows; two
Marketplace error colours; the unsaved-changes three dark buttons; destructive confirm side;
skill vs theme Uninstall; Permissions doubled title; Remote Access "Keep awake" options.

**Gaps still open in the guide** (from the second audit; re-run the completeness check to
confirm what the batches above covered): the never-reviewed surfaces (message box, file
viewers and their tables, terminal, diff/Git review, buddy windows, game boards, guided
tour), smaller categories (bottom sheets, loading, toasts, icons, tooltips), unwritten
conventions (motion timing, focus outline), and screens never captured (buddy content, Git
review, Android, phone login).

## Remaining steps

1. **Redesign backlog** (`redesign-backlog.md`): 9 Marketplace detail pages, 10 project
   switcher (rows, deleting projects), 11 games lobby/friends, 13 submit a ticket, 17 close
   session prompt's editor, 18 a home for the backup warning.
2. **Close the guide's gaps** above with visual decision pages; re-run the completeness
   check.
3. **Complete the guide** from all decisions; Destin approves it section by section and as a
   whole.
4. **Bring the Pages style kit in line** so the transfer test is fair.
5. **Transfer test:** three fresh builders, guide only, build smart home / code review /
   messaging mock Pages; shown in light, dark and wallpaper themes and at phone width; Destin
   judges each. A miss changes the guide (approved), and a fresh builder retries.
6. **Publish:** replace the old guide at its path, archive the old one, update pointers
   (MAP, feature-flow rule, UI-review README, Pages builder).
7. **Merge current master into the branch again** (first merged 2026-10-04) and re-run
   everything.
8. **Final review:** fresh code reviewer over the whole branch, full desktop suite, Android
   tests if the SDK is present, a final screenshot sweep, the 2026-09-24 bug list re-checked;
   then Destin decides on merging.

## Completion gates

- Every guide rule traces to a submitted answer in `decisions.md` (or is marked carried-over
  and approved as such).
- The completeness check lists no uncovered category.
- The three transfer prototypes are judged as Destin's taste.
- Every fix batch has a submitted before/after acceptance.
- Nothing merges without Destin's word.

## Superseded

`docs/active/design/2026-09-22-ui-guide-rebuild/` (rules.md ledger, word-only decks) and
`docs/active/plans/2026-09-23-ui-guide-selected-screen-treatments.md` are the previous
session's approach. Their accepted screen treatments are already on the branch and are
re-checked against the new decisions in the fix batches.
