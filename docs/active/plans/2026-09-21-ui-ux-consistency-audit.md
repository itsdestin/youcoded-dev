---
status: active
date: 2026-09-21
revised: 2026-09-24
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

## Status (2026-09-24)

**Done**
- Backup: all work from the previous session and this one committed and pushed on
  `session/ui-consistency-audit` (workspace and app), merged with current master.
- Element inventory — six groups (buttons/controls, headers/text, cards/rows/spacing,
  menus/search/fields, notifications/status, popups/screens/icons): `inventory/`.
- Decided by Destin (`decisions.md`): full-screen titles; popup titles and ✕; heading
  ladder with no capitals and underlined reading-section labels; counts; way back to chat;
  control shape follows the theme at the **Round** level; **raised** cards with a medium
  shadow; boxed Settings rows and plain menu rows; tinted status pills; tinted warning
  boxes; outlined secondary buttons.
- Guide draft written from those decisions: `guide-draft.md` (not yet approved — its
  approval page was paused because the second audit showed it is incomplete).
- Second audit (`audit/`): contradictions between the app and the draft; every Settings
  screen; button placement; spacing and text composition.

**In progress**
- Completeness check — every component and every screen mapped against what is covered, to
  find missing categories (`audit/completeness-components.md`, `audit/completeness-screens.md`).

**Known gaps the guide does not yet cover** (from the second audit)
- Button placement: order (Destin: dark button right, light directly left), single button
  full width, when to stack, destructive placement; chat cards currently do the opposite.
- Settings anatomy: one layout for label + hint + control; how choices are offered; no box
  inside a box; one popup padding; no duplicate section labels.
- Spacing: no set scale today (proposed 4 / 8 / 12 / 16 / 24 with named uses).
- Card and text composition: one order for item cards; one date position; flat helper cards.
- Smaller categories: menu containers, bottom sheets, full-screen content area, loading
  spinners, toasts, icons, tooltips, exact status colours.
- Plus anything the completeness check adds.

**Bugs found (to fix in the app batches)**
- Add a project and Import file popups have no close button.
- Hovered and selected rows look identical (session drawer, project switcher, session list).
- Two Marketplace error messages use a colour that does not exist (not red).
- Unsaved-changes popup shows Cancel / Discard / Save as three identical dark buttons.
- Destructive confirmations disagree on which side the red button sits.
- Uninstall is outlined for skills but plain text for themes.
- Permissions page shows its section title twice; Development popup has doubled padding;
  Remote Access "Keep awake" has five options where the app's own rule says four.
- Workbench-only change from the previous session to review: title weight, duplicated fade
  code, test-file layout (see the code review in chat history; to be re-checked in the final
  review).

## Remaining steps

1. **Finish the completeness check** and add every missing category to the gap list.
2. **Visual decision pages** for the gaps, each on real screens: button placement → Settings
   anatomy → card and text composition (with the spacing scale shown as tidied screens) →
   smaller categories. Pure cleanups (status colour values, icon sizes, spinner count) are
   decided by the assistant and listed for Destin rather than asked.
3. **Complete the guide** from all decisions; Destin approves it section by section and as a
   whole.
4. **Bring the Pages style kit in line** so the transfer test is fair.
5. **Transfer test:** three fresh builders, guide only, build smart home / code review /
   messaging mock Pages; shown in light, dark and wallpaper themes and at phone width; Destin
   judges each. A miss changes the guide (approved), and a fresh builder retries.
6. **Publish:** replace the old guide at its path, archive the old one, update pointers
   (MAP, feature-flow rule, UI-review README, Pages builder).
7. **App fix batches** — shared components first, then hand-built screens, then the bugs;
   each batch shown before/after in light, dark, wallpaper and phone width, with tests and
   `scripts/verify.sh`.
8. **Final review:** fresh code reviewer over the whole branch, full desktop suite, Android
   tests if the SDK is present, a final screenshot sweep; then Destin decides on merging.

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
