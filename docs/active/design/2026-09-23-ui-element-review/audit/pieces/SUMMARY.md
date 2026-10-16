---
status: active
date: 2026-09-25
source: audit/pieces/{settings,browse,chat,chat-2a,chat-2b,rest}.md (six readers, Meadow Mist, ~830 pieces judged by eye; counts approximate)
---

# Piece-by-piece audit — merged findings

Every visible piece on ~180 screens was marked FOLLOWS / BREAKS / NO RULE against `guide-draft.md`.
Totals across the six files: about 255 FOLLOWS, 375 BREAKS, 215 NO RULE. Counts below are screens
or pieces showing the problem, summed from the readers' tables (they double-count a little).

## A. Rule-breaks — the guide already covers these; the app fix needs no new decision

| Rule | Where the app breaks it (approx. count) |
|---|---|
| No spaced-out capitals | ~60 labels: Preferences, Sound, Themes, About, Projects, Marketplace, model picker, status bar (NORMAL, WORKING, PERMISSION UNKNOWN), games, buddy, "READ-ONLY" chips, "About Permissions" |
| Bare or underlined text used as a button | ~45: Back up all now, Sync now, Generate, Clear, Add vision, Remove, Unpair, Settings, Dismiss, Manage models/tags, Add provider, Sign in, Cancel (Add a project, welcome), Skip tour, Details |
| Red / coloured body text | ~40: Couldn't sync, provider errors, "PERMISSION UNKNOWN", green Saved / usage % / "Runs fast" / +4 −1, red Revert Changes |
| Status = tinted pill, not dot + word | ~30: session drawer, Remote Access, device lists, INSTALLED / active, Sync Failing, Online, Connected |
| Box inside a box | ~30: Remote Access intro, Local engine, Tavily, Permissions "Always allowed", sync card, Tags & note, Model & Effort, Git review, quoted cards in bubbles, Pages day columns |
| Popups have the ✕ | 7: Resume, Add a project, project switcher*, Filters sheet, Marketplace details ("Esc · Close" text) |
| Way back = filled "Esc · Back to chat"; centered small title with icon | ~15: Library, Marketplace, Manage pages, Projects, Pages (wrong side, wrong words, no icon, 3 lines on phone) |
| Notices in the one tinted box, buttons inside | ~25: signed-out note, degraded cards, preview error, chat provider errors, "Not synced to this device yet", warning lists |
| Coloured strips | 4: Download interrupted / Damaged, calendar events |
| Button order and stacking | ~10: Retry/Stop, Submit/Dismiss, Keep/Delete equal halves, Play again, buddy Cancel/Create, "Done" outlined when alone, Remove confirm |
| Fold-outs = boxed row, arrow right | ~8: Show details, Sync log, Git review rows, "Why can't this be resumed?" |
| Counts "Files 12", never "(12)" or a bubble | ~11: Session Files (12), Friends (1), "12" on the header button, "1" on Backup & Sync, Activity (3) |
| Card text order / chip row one line | ~10: Marketplace, Library, Pages cards; branch chip wraps to 3 lines |
| Strip of 2–4 choices only | Effort level has 5 |
| Text box with own action inside | OpenRouter key, comment box, game chat |
| Hard states | file names cut to 7 letters; "YouCoded undefined"; "60w" age; stuck tooltips |

*The switcher is also a question below (quick popups).

## B. NO RULE — kinds of piece the guide is silent on

| Kind | Screens | Handling |
|---|---|---|
| Empty states | ~12 | **Ask** — four different looks today |
| Quick popups / switchers / bottom sheets (no title, no ✕) | ~8 | **Ask** |
| Full-window sign-in / setup (five equal outlined choices, no filled main) | 3 | **Ask** |
| Smallest text size (10px vs 11px) | app-wide | **Ask** — real-screen comparison |
| Meters and progress bars (coloured percentages) | 6 | Propose: bar carries the colour, number in normal grey (follows "status hues never in text") |
| Status-bar chips ("Label: value", coloured values, caps) | ~8 | Propose: normal-case chips, values in normal text colour, status only as tinted pill |
| Small tag beside a title ("Optional", "Stopped") | ~6 | Propose: same tinted pill as status |
| Tick-box lists (opt-in checklists) | ~5 | Propose: settings-style row, tick box left, whole row tappable |
| Sliders (label, slider, value) | 2 | Propose: wide-control rule — label above, slider below, value right of label |
| Loose errors / notes in the chat flow | ~8 | Propose: same tinted notice box with its buttons inside |
| Removable tiles / attachments | ~3 | Propose: small ✕ icon button at the tile's top right |
| Icon-only buttons, attention dots, floating controls over content | ~20 | Propose: icon buttons always carry a tooltip name; dots always paired with a label somewhere |
| Disabled main action with no reason | ~3 | Propose: say why, in grey text beside or under it |
| Game boards, code/diff colours, file viewers (spreadsheet, PDF, image), charts, the message box, chat bubbles | ~30 | Propose: **exempt for now** like tool cards and the terminal; each gets its own review later |
| Hover tooltips, right-click hints, credits, guided-tour bubble, inline-editable titles, image-first cards, hero banner, filter bar | ~25 | Propose: follow nearest rule; no new rule until one is redone |

## C. Capture gaps

- Narrow (phone-width) Settings plans open the plain chat screen (no popup): Remote Access, Backup & Sync,
  drawer, General. `states-settings-repair-narrow` misses both shots.
- `remote-consent.png` shows the device list, not the consent box; `close-session-prompt` is the session dropdown.
- 52 misses of 496 planned; real screens among them: welcome empty (retaken by hand, in `_unverified`),
  context menus, Local models pages, tool-card expanded, all-sessions menu.
- Chat readers judged ~45 chat screenshots; ~40 more not opened (image-limit).
- Hover states are invisible in pictures — not judged anywhere.
