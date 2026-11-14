---
title: Phones and narrow windows — status (START HERE)
status: active
updated: 2026-11-14
branches: youcoded-dev and youcoded, both `session/narrow-screen-proposals` (rebased onto master 2026-11-11, pushed)
card: "#235"
---

# Phones and narrow windows — where this work stands

Destin asked (2026-11-04) for proposals to make the app usable on narrow screens, phone browsers
and the Android app: how sessions, the top bar's buttons and the pills are shown. The design
rounds are finished. **The chosen layout exists only as workbench switches. The real app is
unchanged, and nothing is merged.**

This file supersedes reading the decks one by one. The decks and their `*.answers.json` stay as
the record of Destin's decisions. The answers files are the source, and this page is a summary.

## Decided (final, after rounds 5–9 on 2026-11-14)

Rounds 5–9 (`narrow-screens-5` … `-9`, after the `narrow-screens-record` deck) replaced parts of
the round 1–4 design. Short route (branch-review Q-3): no automatic reviewers; Destin iterates on decks.

| Area | Decision | Source |
|---|---|---|
| Who gets it | Width decides (below 640px), so a narrow computer window gets it too | questions Q-9 |
| Phone top bar | ☰ and Projects left; terminal switch right; **no + New session** (it stays in the list). Middle: one plain name button (dot, name, arrow, one highlight) centred on the SCREEN, on the buttons' centre line, with status lights hung 2px under it. Whole area opens the list; lights fade while it is open | record R-1, rounds 5 N-1, 7, 8 B-1 |
| Narrow computer window bar | Projects folds into ☰; name sits left, after ☰; each side takes only its own width; name and lights 2px higher than the phone's; window cannot be narrower than 340px (`main.ts` `minWidth`, the one real-app change) | rounds 6 M-1 note, 7, 8 B-2, 9 C-1 |
| Mac | Same rule as the narrow window (traffic lights take the left); described, never pictured — the workbench cannot pretend to be a Mac | round 5 N-2 |
| ☰ menu | Today's small menu | live-3 L-2 |
| Session list (phone) | Full-width dropdown, "Your sessions" heading, today's worded Working/Inactive status (no dot), rows 12px in, lined up with the heading | record R-2, rounds 5 N-3, 6 M-2 |
| Model in every session row | The model alone ("Sonnet", not "Claude Code · Sonnet") at EVERY width, brand mark beside it, full text on hover | record R-2, round 5 N-4 |
| Pills under the message box | One swipeable row, 24px tall, one shape; Remote is a light computer icon with a faint green glow, first; square 24px pencil | rounds 5 N-5, 6 M-3 |
| Shortcut chips | Same row as today, but 24px tall with a 24px pencil when the compact pills are on, matching the pills | round 6 M-3 |
| Touch sizing | Settled by master's `fingerSized()` rule (pills and chips deliberately 24px, below its 32px) | branch-review Q-1, round 6 M-3 |
| Choice in Appearance | None for now; the hub is a later phone mode (card #222) | live-4 Q-1 |
| List first, then details | Set aside: master did Pages and Resume | branch-review Q-2 ("confused"), record W-5 |

**Superseded answers:**
- Questions Q-7 (shortcuts behind a button) was built, then reversed in live-2 L-4.
- Live-2 Q-1 ("a choice in Appearance") is replaced by live-4 Q-1 ("none for now").
- Questions Q-1, Q-2 and Q-4 ("show me") were settled by the live rounds.

## Done

- Four rounds of decks: the questions deck, then `narrow-screens-2/3/4.live`, all answered and
  committed with their built pages.
- **Workbench switches on the real components (app branch, 8 commits from `511443894` to
  `df72bffe3` after the 2026-11-11 rebase):** `narrowTop`, `narrowList`, `narrowPills` in `desktop/src/renderer/workbench-mode.ts`.
  Outside the workbench every switch reads `today`. Pieces live in
  `components/header/phone-session-menu.tsx`, plus edits to `SessionStrip.tsx`, `HeaderBar.tsx`,
  `OverflowMenu.tsx`, `StatusBar.tsx`, `SpecialistsChip.tsx` and `styles/globals.css`.
  Screens are in `dev/workbench/screens/chat.ts` (`chat#top-*`, `chat/sessions#phone-*`,
  `chat#*-pills-*`, `chat#window-*`).
- `verify.sh` passed on the rebased branch at `df72bffe3`, 2026-11-11 (types, tests, knip, lint, ast-grep, screens, journeys). A first run failed 8 unrelated screens under load; each opened on its own and the re-run passed.
- **Two real fixes on the branch, not tied to the design:**
  - `BrailleBurst.tsx` cancels its clean-up timer on unmount.
  - `tests/status-bar-memo.test.tsx` counts header renders from a header-only hook.
- The hub ("everything panel") is kept as a reference: `docs/active/prototypes/2026-11-05-phone-hub/`
  (pictures, notes, the round-3 code as a patch). It relates to card #222 (rearrange the main chat
  window).

## Rebased onto master (2026-11-11)

Both branches were rebased onto master (app: 170 commits behind; workspace: 372). The
pre-rebase tips are kept locally as `backup/narrow-screen-proposals-pre-rebase-2026-11-11`.
The app's changes came through line-for-line, apart from line budgets. What master brought
that touches this work:

- **`device.ts` (phone final review, card #213):** four device facts. Layout follows a narrow
  window, as this work's Q-9 says. Finger-sized controls follow touch OR narrow (`fingerSized()`),
  so the shortcut chips are `h-8` in every narrow window. **Done here:** the matching pills are
  now 2rem tall (`globals.css`).
- **Keyboard measure:** master split `--kb-offset` (any keyboard, for menus and popups) from
  `--vvp-offset` (only the chat's own message box). **Done here:** `phoneMenuStyle` uses
  `--kb-offset`, as SessionStrip's own menu now does.
- **`onePaneLayout()`:** Pages and Resume already show list → item on a phone. That covers the
  two cases behind questions S-2.
- **Also on master, no clash, but the build must keep them:** the grey "Sync off" pill, the
  version pill tooltip (#186), and the terminal key row drawn like the quick chips.
- **Card #235** now tracks this work. The design docs and answers were already put on master
  by `87877131f`.

**Found in the branch review:** in a narrow DESKTOP window (`chat#window-decided`), the
window's caption buttons take the room and the + New session button overlaps the session
name. This was the open "width check" below. Destin decides the fix on the branch-review deck
(D-1).

**Branch review deck:** `narrow-screens.branch-review.json` covers today vs decided pictures,
master's impact, the record of decisions, and the open questions (touch sizing, the rest of
S-2, route, what happens to the branch). Its answers supersede anything below that they touch.

## Remains, in order (short route, branch-review Q-3)

1. **Build it for real:** make `lights` + `dropdown` + `compact` the narrow layout, gated on
   `useNarrowViewport()` (window-buttons variant on `getCapabilities().nativeWindows`); delete the
   switches, every other option (name, drawer, pair, plain, hub, sheet, full), their screens,
   `PhoneMenuTop`/`PhoneMenuScrim`/`PhoneDrawerFooter`/`PhoneRecent`/`RowTiles`/`DrawerMenuButton`/
   `PhoneCount` if unused, the `phone-sheet-in`/`phone-drawer-in` keyframes; lower the SessionStrip and
   globals.css line budgets.
2. **While building:** pills from one shared piece instead of the `.status-row-uniform` CSS overlay;
   `ShieldIcon`/`PaletteIcon`/`ComputerIcon` into `Icons.tsx`; the name stack a proper button.
3. `verify.sh`, then a final deck of the built thing. No automatic reviewers unless Destin asks.
4. Rebase onto master first: master moved after 2026-11-11 (hover hints #135 touched HeaderBar,
   SessionStrip, StatusBar).

## Before resuming

- Rebased onto master 2026-11-11 (above). If master has moved a lot by the time the build
  starts, bring the branch up to date first.
- Card #235 tracks this work. Card #139 (phone-width and touch polish) overlaps in theme but not
  in scope. #222 covers the future phone mode (hub, sidebar list).
- To see any option again: `node scripts/shoot/shoot.mjs 'chat#top-lights' 'chat/sessions#phone-lights'
  'chat#phone-pills-compact'`. To serve a deck again: `review-cards.py serve <spec> --no-build`.

## Files here

| File | What it is |
|---|---|
| `narrow-screens.questions.{json,answers.json,html}` | Round 1: ten questions and three statements, words only |
| `narrow-screens-2.live.*` | Round 2: top bar ×4, list shapes ×4, pills, shortcuts button, Appearance choice |
| `narrow-screens-3.live.*` | Round 3: plain / lights name button, ☰ panel ×3, matching pills |
| `narrow-screens-4.live.*` | Round 4: tidy lights bar, list shape, pills vs chips, Appearance choice |
| `narrow-screens.branch-review.*` | 2026-11-11 branch review after the rebase: today vs decided, master's impact, open questions |
| `runs/after/manifest.json`, `images/narrow-screens.branch-review/` | Its pictures (raw shots are not committed; retake with `shoot`) |
| `preview/`, `*.serve-port` | Scratch, ignored by git |
