---
title: Phones and narrow windows — status (START HERE)
status: active
updated: 2026-11-09
branches: youcoded-dev and youcoded, both `session/narrow-screen-proposals` (pushed)
---

# Phones and narrow windows — where this work stands

Destin asked (2026-11-04) for proposals to make the app usable on narrow screens, phone browsers
and the Android app: how sessions, the top bar's buttons and the pills are shown. The design
rounds are finished. **The chosen layout exists only as workbench switches. The real app is
unchanged, and nothing is merged.**

This file supersedes reading the decks one by one. The decks and their `*.answers.json` stay as
the record of Destin's decisions. The answers files are the source, and this page is a summary.

## Decided (final)

| Area | Decision | Source |
|---|---|---|
| Who gets the phone layout | Width decides (below 640px), so a narrow computer window gets it too | questions Q-9 |
| Top bar | ☰ and Projects on the left. + New session and the chat/terminal switch on the right. In the middle, one plain name button: status dot, name and arrow with one shared highlight, no outline and no "+N" count, with a row of tiny status lights under the name (one per OTHER open session, at most 12, idle ones faint). Pressing anywhere on that area, gaps and lights included, opens or closes the list. The lights fade while the list is open | live-3 L-1 (`lights`), live-4 L-1 yes, live-4 Q-1 note |
| ☰ menu | Stays today's small menu (Settings, Projects, Pages, Files, Games) | live-3 L-2 |
| Session list | Tapping the name opens a full-width dropdown under the top bar, with condensed phone rows: status as a coloured dot, the model name alone, and the folder name given room first. Heading "Your sessions" | live-4 L-2, questions Q-5, S-1 |
| Pills under the message box | One row you swipe sideways, built from short or icon pills. Every pill takes the shortcut chips' measures (height, rounder corners, padding, gap, edge distance). Remote is a small computer icon, first in the row, replacing the REMOTE word in the top bar. The pencil scrolls with the pills, so the fade sits at the screen edge as on the chip row | questions Q-3, Q-6; live-3 L-3; live-4 L-3 yes |
| Shortcut chips | Unchanged: today's row stays | live-2 L-4 ("nevermind, lets just leave the current row") |
| Choice in Appearance | None for now. Later, an alternative phone mode built on the "everything panel" (hub), with its own title style, may become a choice | live-4 Q-1 |
| Side-by-side screens on phones | Become a list first, then the details on their own screen with Back | questions S-2 (yes, not yet designed) |

**Superseded answers:**
- Questions Q-7 (shortcuts behind a button) was built, then reversed in live-2 L-4.
- Live-2 Q-1 ("a choice in Appearance") is replaced by live-4 Q-1 ("none for now").
- Questions Q-1, Q-2 and Q-4 ("show me") were settled by the live rounds.

## Done

- Four rounds of decks: the questions deck, then `narrow-screens-2/3/4.live`, all answered and
  committed with their built pages.
- **Workbench switches on the real components (app branch, 4 commits from `83f5ff67e` to
  `b0aaf5bfd`):** `narrowTop`, `narrowList`, `narrowPills` in `desktop/src/renderer/workbench-mode.ts`.
  Outside the workbench every switch reads `today`. Pieces live in
  `components/header/phone-session-menu.tsx`, plus edits to `SessionStrip.tsx`, `HeaderBar.tsx`,
  `OverflowMenu.tsx`, `StatusBar.tsx`, `SpecialistsChip.tsx` and `styles/globals.css`.
  Screens are in `dev/workbench/screens/chat.ts` (`chat#top-*`, `chat/sessions#phone-*`,
  `chat#*-pills-compact`).
- `verify.sh` passed on `b0aaf5bfd` (types, tests, knip, lint, ast-grep, screens, journeys).
- **Two real fixes on the branch, not tied to the design:**
  - `BrailleBurst.tsx` cancels its clean-up timer on unmount.
  - `tests/status-bar-memo.test.tsx` counts header renders from a header-only hook.
- The hub ("everything panel") is kept as a reference: `docs/active/prototypes/2026-11-05-phone-hub/`
  (pictures, notes, the round-3 code as a patch). It relates to card #222 (rearrange the main chat
  window).

## Remains, in order

1. **UX tester run 1** on the decided layout (`scripts/ui-review/ux-tester.md`), at phone width,
   in a phone browser (`connection=remote`) and as Android (`platform=android`). Triage its findings
   into `docs/active/reviews/`. This was skipped before the decks because those rounds were for
   picking options.
2. **Contract** (`scripts/ui-review/contract-agent.md`, a fresh agent) from the questions deck and
   rounds 2-4. Destin signs it. He has not yet seen the last two fixes (whole-area click, pencil
   inside the row) in a deck, and the contract deck is where he sees them.
3. **Build:**
   - Make `lights` + `dropdown` + `compact` the real narrow layout, gated on `useNarrowViewport()`.
   - Delete the switches and every other value (name, drawer, pair, plain, hub, sheet, full), their
     screens, `PhoneMenuTop`/`PhoneMenuScrim`/`PhoneDrawerFooter`/`PhoneRecent`/`RowTiles`/
     `DrawerMenuButton` if unused, and the `phone-sheet-in`/`phone-drawer-in` keyframes.
   - Lower the SessionStrip line budget: it was raised to 2924 for the temporary switches, and
     `desktop/line-budgets.json` says so.
   - Then the code reviewer, UX tester run 2, grader and acceptance deck.
4. **Must change in the build, not just be kept:**
   - **Pills:** the matching shape is a CSS overlay (`.status-row-uniform .border` in
     `globals.css`). Build every pill from one shared piece instead.
   - **Android pill height:** shortcut chips are `h-8` on Android, so pills must follow the same
     rule.
   - **Icons:** `ShieldIcon`, `PaletteIcon` and `ComputerIcon` are local to `StatusBar.tsx` and
     belong in `Icons.tsx`.
   - **Name stack:** the clickable stack is a `div` around real buttons. The arrow stays the
     keyboard's way in, so give the stack a proper button role or restructure it.
   - **Width check:** check the lights bar in a narrow DESKTOP window. Width decides, and Windows
     and Linux add the minimize/maximize/close buttons the phone pictures never had (they used
     `platform=android`).
5. **Not designed yet, still in scope:**
   - Questions S-2: side-by-side screens become list → detail on phones.
   - Questions S-3: touch sizing. Destin rejected "always show anything that appears on hover";
     ask a narrower question, such as finger-sized targets only.
6. Chat message width (questions Q-8) belongs to another session, not this work.

## Before resuming

- Both branches are behind master: youcoded-dev by 54 commits and the app by 19 on 2026-11-09.
  Update the branch before building. That is a decision for that session, not an automatic pull.
- No work card tracks this effort. Card #139 (phone-width and touch polish) overlaps in theme but
  not in scope. Destin was offered a card for the future phone mode. #222 now covers that idea.
- To see any option again: `node scripts/shoot/shoot.mjs 'chat#top-lights' 'chat/sessions#phone-lights'
  'chat#phone-pills-compact'`. To serve a deck again: `review-cards.py serve <spec> --no-build`.

## Files here

| File | What it is |
|---|---|
| `narrow-screens.questions.{json,answers.json,html}` | Round 1: ten questions and three statements, words only |
| `narrow-screens-2.live.*` | Round 2: top bar ×4, list shapes ×4, pills, shortcuts button, Appearance choice |
| `narrow-screens-3.live.*` | Round 3: plain / lights name button, ☰ panel ×3, matching pills |
| `narrow-screens-4.live.*` | Round 4: tidy lights bar, list shape, pills vs chips, Appearance choice |
| `preview/`, `*.serve-port` | Scratch, ignored by git |
