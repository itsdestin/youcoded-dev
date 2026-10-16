# r1 · notifications — builder report and guide-gap notes

## What it built
A bell in the top bar's right group (first, inset pill like Session files/Games), accent dot when something is new; on phone a ☰ "Notifications" row and the dot moves to ☰. Opens a centred `panel` popup (like Open tasks): "New" card of boxed rows each with outlined "Mark as read" + kind icon (tick, cross, @, up arrow); "Earlier" card of plain rows with chevrons; pinned full-width outlined "Mark all as read". States: `chat/notifications`, `#marked`, `#all-read` ("You're all caught up."), `#empty` ("Nothing here yet."), `#load-failed` (ErrorState), `#short`, `#phone`; also `chat`, `chat/overflow`.
References named: Open tasks, Games friends card, Settings → About, Session files/Games buttons.
Its own concerns: Halftone wraps titles (per-row buttons); green accent dot looks like Games' "online" dot.

## Where the guide left it guessing (condensed)
1. "Every popup and side panel uses Dialog" but Dialog is centred only; real side panes are hand-built → chose centred popup.
2. No rule for a list of events opened from a header button (dropdown vs popup vs side pane).
3. Nothing on where/in what order a new top-bar button goes.
4. "No number in a bubble" vs Files' count (Q12); no unread/new marker recipe or colour.
5. "Row actions appear on hover" contradicts Open tasks' always-visible buttons.
6. Row that opens something AND has its own button: SettingRow drops the chevron → inconsistent arrows.
7. Whole-popup housekeeping action: filled or outlined?
8. A popup that is entirely empty: label/card/button?
9. Whole popup fails to load: "problem replaces the card" doesn't fit.
10. Item kind (done/stopped/mention/update): pill, icon or words? Stopped looks no more urgent than done.
11. Is a "New" group enough for unread, or also dot/bold?
12. Relative time format (Q20) — invented "12 min ago / Yesterday / Mon / Sep 28".
13. Boxed rows vs plain rows for an event list → used both in one popup.
14. Text vs button width in monospace themes.
15. How a mockup should behave in the real app with no backend (learned from workbench docs).

## Pushed toward worse
- One filled button + lone button full width → heavy outlined footer bar.
- Open tasks reference → four always-visible buttons crowd 420px.
- No badge recipe → status-style accent dot clashing with Games' online dot.

Not read: the "documented as they are today" sections in depth, decisions.md, error-message-standards, review-deck rules.
