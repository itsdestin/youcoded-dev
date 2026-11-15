---
title: Phones and narrow windows — status (START HERE)
status: active
updated: 2026-11-14
branches: youcoded-dev and youcoded, both `session/narrow-screen-proposals` (pushed; last rebased onto master 2026-11-11 — now far behind, see "Before building")
card: "#235"
---

# Phones and narrow windows — where this work stands

Destin asked (2026-11-04) for proposals to make the app usable on narrow screens, phone browsers
and the Android app: how sessions, the top bar's buttons and the pills are shown.

**State on 2026-11-14: the design is FINAL (nine rounds, last one approved). It exists only as
workbench switches. The real app is unchanged, nothing is merged, and the real build has not
started.** Destin has not yet said whether to start the build. Do not merge without his word.

**How to read this folder.** This page is the only current summary. The decks and their
`*.answers.json` are the record of what Destin said; later rounds overrule earlier ones (table
under "Superseded"). Any older deck, prose or code comment that disagrees with the "Decided"
table below is out of date. In particular the 2026-11-11 history section near the end is kept
for the record and is marked where it no longer holds.

## Decided (final, after rounds 5–9 on 2026-11-14)

Route: **short route** (branch-review Q-3: "we will iterate a lot directly, but skip automatic
reviewers and such for now"). No UX tester, code reviewer, contract or grader unless Destin asks.

| Area | Decision | Source |
|---|---|---|
| Who gets it | Width decides (below 640px, `useNarrowViewport()`), so a narrow computer window gets it too | questions Q-9 |
| Phone top bar | ☰ and Projects left; terminal switch right; **no + New session** (New session stays inside the session list). Middle: one plain name button (dot, name, arrow, one highlight) centred on the SCREEN, on the buttons' centre line, status lights hung 2px under the name. The whole name area opens the list; lights fade while it is open | record R-1, rounds 5 N-1, 7, 8 B-1 |
| Narrow computer window bar (a window with its own Minimize/Maximize/Close, `getCapabilities().nativeWindows`) | Projects folds into ☰; the name sits LEFT, right after ☰; each side takes only its own width (no symmetric reservation); name and lights 2px higher than on the phone | round 6 M-1 note (from 5 N-2), 7, 8 B-2, 9 C-1 |
| Window minimum | A computer window can't be made narrower than 340px (`main.ts` `minWidth: 340`, not for buddy windows). The ONLY real-app change on the branch; never tried in a dev window yet | round 6 M-1 |
| Mac | Same rule as the narrow window (the coloured buttons take the left). Described, never pictured — the workbench cannot pretend to be a Mac | round 5 N-2 |
| ☰ menu | Today's small menu (plus Projects in the narrow computer window) | live-3 L-2, round 6 |
| Session list (phone) | Full-width dropdown under a "Your sessions" heading; today's worded status (Working / Inactive), NO status dot; rows 12px in, lined up with the heading; no drag grip on phone rows | record R-2, rounds 5 N-3, 6 M-2 |
| Model in every session row | The model alone ("Sonnet", not "Claude Code · Sonnet") at EVERY width, desktop included, brand mark beside it, full text on hover | record R-2, round 5 N-4 |
| Pills under the message box | One swipeable row, 24px tall, one shape. "Connected to your computer" is a plain light computer icon with a FAINT green glow, first in the row. Square 24px pencil | rounds 5 N-5, 6 M-3 |
| Shortcut chips | Today's row, but 24px tall with a 24px pencil in the narrow layout, matching the pills | round 6 M-3 |
| Touch sizing | Pills and chips deliberately 24px, below master's 32px `fingerSized()` size. Destin accepted the risk (taps near an edge may miss) | branch-review Q-1, round 6 M-3 |
| Choice in Appearance | None for now; a separate phone mode (the "hub") is later work, card #222 | live-4 Q-1 |
| List first, then details | Set aside: master did Pages and Resume | branch-review Q-2 ("confused"), record W-5 |

### Rejected along the way (do not bring back without a new deck)

- **+ New session on the top bar** (Destin: "i hate the + new session"; it was the assistant's own
  choice from "two buttons on each side", never asked about on its own).
- **Status-dot rows in the phone list** ("dont like the status light changes") — worded status stays.
- **Bright green Remote pill / glow** ("reduce that green glow a LOT").
- **Centred name in a narrow computer window** ("super jank", round 6 M-1 → left-aligned).
- Top-bar options `name`, `drawer`, `pair`, `plain`, `hub`; list options `sheet`, `full`;
  a shortcuts-behind-a-button row.

### Superseded answers

| Earlier answer | Replaced by |
|---|---|
| Questions Q-7 (shortcuts behind a button) | live-2 L-4: today's shortcut row |
| Live-2 Q-1 ("a choice in Appearance") | live-4 Q-1: none for now |
| Questions Q-1, Q-2, Q-4 ("show me") | settled by the live rounds |
| Round 1–4 phone bar with "two buttons each side" incl. + New session | record R-1, round 5: no + |
| Round 1–4 list rows with a status dot | record R-2, round 5: worded status |
| Model shortened only on phones | record R-2: model alone at every width |
| Pills raised to 2rem (32px) after the 2026-11-11 rebase | round 6 M-3: pills AND chips 24px |
| Branch-review D-1 "+ overlaps the name in a narrow window" (open problem) | solved: + removed (round 5), Projects into ☰ and name left (round 6), 340px minimum |
| Round 5 N-2 centred name in a narrow window | round 6 M-1: left-aligned |
| Round 7 light/name positions | rounds 8 B-1/B-2 and 9 C-1 (final) |

## What the branches hold now

**App (`youcoded`, `session/narrow-screen-proposals`, tip `8c6bb291f`, 13 commits on master
`0444f47d9`):** commits `511443894` … `df72bffe3` (rounds 1–4, rebase follow-ups, branch-review
screens), then `74d7c15b5` (round 5), `ac08faec5` (6), `d72287bc7` (7), `fe3a962a1` (8),
`8c6bb291f` (9), plus a comment correction in `workbench-mode.ts` (2026-11-14).

- Workbench switches `narrowTop`, `narrowList`, `narrowPills` in
  `desktop/src/renderer/workbench-mode.ts`. Outside the workbench every switch reads `today`, so
  the shipped app is unchanged — except `main.ts`'s 340px window minimum, which is real.
- The decided values: `narrowTop=lights`, `narrowList=dropdown`, `narrowPills=compact`.
- `HeaderBar.tsx`: `windowButtonsBar = narrowTop === 'lights' && getCapabilities().nativeWindows`
  → Projects hidden from the bar (it is in `OverflowMenu`), name `justify-start`, each side
  `shrink-0` with its own width. Phone keeps the symmetric reservation so the name centres on the
  screen. Name stack `py-2` (`pt-1.5 pb-2.5` in the window case); lights absolutely placed
  `bottom-1.5` (`bottom-2` in the window case), centred under the name.
- `SessionStrip.tsx`: `StatusPill` always (no phone dot); model alone in all rows; phone rows
  `px-3`, no drag grip.
- `StatusBar.tsx`: Remote chip is a plain span with a faint `drop-shadow` glow; `PencilIcon`
  `shrink-0`. `globals.css`: `.status-row-uniform` pills 1.5rem; `.status-pencil-uniform` square.
- `QuickChips.tsx` + `EditPencilButton.tsx` (`small` prop): 24px chips in the compact narrow row.
- New pieces in `components/header/phone-session-menu.tsx`; screens in
  `dev/workbench/screens/chat.ts` (`chat#top-*`, `chat/sessions#phone-*`, `chat#*-pills-*`,
  `chat#window-*`).
- Two real fixes unrelated to the design: `BrailleBurst.tsx` cancels its clean-up timer on
  unmount; `tests/status-bar-memo.test.tsx` counts header renders from a header-only hook.

**Checks:** type checks and the related tests (47/47) pass at `8c6bb291f`. **The full
`verify.sh` last passed at `df72bffe3` (2026-11-11) and has NOT been re-run since round 5.**
Android was never built with these changes.

**Workspace (`youcoded-dev`, same branch name):** the decks, answers, pictures and this page.
`runs/*/manifest.json` are committed; raw shots under `runs/` (including untracked
`runs/after/chat*` folders and `sheet-*.jpg`) are local scratch — retake with `shoot`, do not
commit them.

## Before building

- **Both branches are far behind master** (2026-11-14: app 223 commits, workspace 263). Rebase
  first. Files changed on BOTH sides since the base, so expect conflicts: `HeaderBar.tsx`,
  `StatusBar.tsx`, `QuickChips.tsx`, `main.ts`, `BrailleBurst.tsx`, `dev/workbench/screens/chat.ts`,
  `workbench-mode.ts`, `line-budgets.json`. Master's hover hints (card #135) touched HeaderBar,
  SessionStrip and StatusBar. Keep master's "Sync off" pill, version-pill tooltip (#186),
  terminal key row and `fingerSized()` / `device.ts` facts.
- Backup of the pre-2026-11-11 tips: local branch
  `backup/narrow-screen-proposals-pre-rebase-2026-11-11` (app `ab8d60602`, workspace `9a7dd4384`).
  Make a fresh backup branch before the next rebase.

## Remains, in order (short route)

1. Rebase both branches onto master (above).
2. **Build it for real:** make `lights` + `dropdown` + `compact` THE narrow layout, gated on
   `useNarrowViewport()`, with the window-buttons variant on `getCapabilities().nativeWindows`.
   The "model alone" row text applies at every width. Delete the switches and every other option
   (`name`, `drawer`, `pair`, `plain`, `hub`, `sheet`, `full`), their screens, unused pieces
   (`PhoneMenuTop`, `PhoneMenuScrim`, `PhoneDrawerFooter`, `PhoneRecent`, `RowTiles`,
   `DrawerMenuButton`, `PhoneCount` — check with `knip`), and the `phone-sheet-in` /
   `phone-drawer-in` keyframes. Lower the SessionStrip and `globals.css` line budgets. Keep a
   screen per decided surface for `shoot`.
3. **While building:** pills from one shared piece instead of the `.status-row-uniform` CSS
   overlay; `ShieldIcon` / `PaletteIcon` / `ComputerIcon` into `Icons.tsx`; the name stack a proper
   button (keyboard and screen-reader semantics). Tests that render these must declare the
   viewport (narrow-viewport rule). `OverflowMenu.test.tsx` must cover Projects in ☰.
4. Try the 340px minimum in a dev window (`run-dev.sh`), never the live app.
5. `verify.sh`, then one final Before/After deck of the built thing (phone, narrow window, wide
   window to show the model-only rows). No automatic reviewers unless Destin asks.
6. Merge only when Destin says so.

## Related cards

- **#235** tracks this work.
- #139 (phone-width and touch polish) overlaps in theme, not scope.
- #222 (rearrange the main window / future phone mode) keeps the hub reference:
  `docs/active/prototypes/2026-11-05-phone-hub/`.
- #225 (marketplace on a phone) is separate.

To see a decided surface again: `node scripts/shoot/shoot.mjs 'chat#top-lights'
'chat/sessions#phone-lights' 'chat#phone-pills-compact' 'chat#window-decided'`. To re-serve a
deck: `python3 scripts/ui-review/review-cards.py serve <spec> --no-build`.

## History: rebase of 2026-11-11 (record only — partly out of date)

Both branches were rebased onto master on 2026-11-11 (app 170 commits behind; workspace 372).
What master brought then:

- **`device.ts` (card #213):** layout follows a narrow window; `fingerSized()` follows touch OR
  narrow, so the shortcut chips became `h-8`. ~~The matching pills were raised to 2rem~~ —
  **superseded by round 6: pills and chips are both 24px.**
- **Keyboard measure:** `--kb-offset` (any keyboard) vs `--vvp-offset` (the chat's message box).
  `phoneMenuStyle` uses `--kb-offset`. Still true.
- **`onePaneLayout()`:** Pages and Resume show list → item on a phone (why S-2 was set aside).
- ~~**Open:** in a narrow desktop window the + New session button overlaps the name (D-1)~~ —
  **solved in rounds 5–6** (see Superseded).
- `verify.sh` passed at `df72bffe3` then (a first run failed 8 unrelated screens under load;
  each opened alone and the re-run passed).

## Files here

| File | What it is |
|---|---|
| `README.md` | This page — the current summary |
| `narrow-screens.questions.*` | Round 1: ten questions and three statements, words only |
| `narrow-screens-2.live.*` | Round 2: top bar ×4, list shapes ×4, pills, shortcuts button, Appearance choice |
| `narrow-screens-3.live.*` | Round 3: plain / lights name button, ☰ panel ×3, matching pills |
| `narrow-screens-4.live.*` | Round 4: tidy lights bar, list shape, pills vs chips, Appearance choice |
| `narrow-screens.branch-review.*` | 2026-11-11 review after the rebase (V-1…V-3, D-1, Q-1…Q-4, S-1…S-3) |
| `narrow-screens.record.*` | 2026-11-14 picture record of everything the branch changed, with Destin's quotes (R-1…R-4, W-1…W-5) |
| `narrow-screens-5` … `-9.*` | 2026-11-14 rounds 5–9 (N-, M-, A-, B-, C- steps) |
| `images/<deck>/` | Each deck's pictures |
| `runs/<round>/manifest.json` | Which screens each round's pictures came from (raw shots not committed) |
| `preview/`, `*.serve-port` | Scratch, ignored by git |
