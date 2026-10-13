---
status: active
date: 2026-10-13
related: small-fixes-3#SF3-ALIGN (the rule question), small-fixes-2#SF2-4 (Destin's note)
---

# Buttons beside text in a card or row — top, centre or bottom? (survey, nothing changed)

Destin (small-fixes-2#SF2-4): "i think we've been somewhat inconsistent about whether these kinds of
buttons in cards are top-aligned, centered, or bottom-aligned." Read-only sweep of
`youcoded/desktop/src/renderer`, 2026-10-13. Nothing is changed until he picks a rule.

## What the shared pieces do
| Piece | Rule in code | Result |
|---|---|---|
| Setting row (`ui/SettingRow.tsx`), every variant incl. `header` and the fold | `items-center` always; WHY: "With items-start the chevron would sit at the top-right of a two-line row … centre the control against the block" | **centre** |
| Notice box (`ui/Callout.tsx`) with a title AND a body | `items-start` — "keeps the buttons level with the title, and they never move when the body grows" | **top** (level with the title) |
| Notice box with only a title, or only a sentence | `items-center` (C-6, EN-1) | **centre** |
| Notice box `compact` | `items-center`, slim | **centre** |
| Notice box `actionsPlacement="below"`, general errors (`ui/states.tsx`) | buttons on their own line at the bottom right (G-28, PN-1) | **own line, bottom right** |
| Status strip (`ui/StatusStrip.tsx`) | `items-center` | **centre** |

## Where each kind is used
- **Centre (the default):** every setting row (switches, chevrons, device rows); status strips; one-line
  notices and error boxes; the integration page's tile row; Account's rows; Games friend rows; the project
  switcher; Local models' installed model rows and version rows; the Local engine card; web-search rows;
  Backup & sync's backup rows.
- **Top:** notices with a title and a body (Local models' "Damaged download"); Model providers' cards
  (ChatGPT, Claude Code — the button on the title line, WHY P-1/P-2: the status grows); Backup & sync's
  Main backup switch; Local models' downloadable model card (Download); a detail page's quick actions;
  a code box or text box with its button (the engine's command + Copy, Specialists' note + Send).
- **Own line at the bottom right:** general errors; notices with `below`; the close prompt's read error;
  a detail page's main buttons; Backup & sync's "Connect GitHub…".

## The inconsistencies
1. **Model rows:** a model you can download has Download at the top; the installed model and the version
   rows beside it are centred — same kind of row, often on screen together.
2. **Provider cards:** Model providers' cards are top-aligned; the web-search rows in the same popup and the
   provider rows elsewhere are centred, though their status lines can grow too.
3. **A switch beside a title and hint:** Backup & sync's Main backup is top; every setting row is centred.
4. **Detail pages:** the integration page centres its tile row; plugin and theme pages put quick actions at
   the top (by design, M4-1).
5. **A notice whose text grows:** Backup & sync's sync error has no title, so it centres — and its buttons
   move down when "Show details" opens, which is what the title-and-body rule exists to prevent.
6. **compact for long text:** the "GitHub backups are no longer supported" notice is the slim box but holds
   two sentences.
7. **Buttons bottom-left:** the engine's ROCm set-up box and the provider key row put buttons at the left.
8. Not alignment, noticed: the specialist paused card is a status strip though it is a problem; Backup &
   sync's device "Remove" is bare text; Specialists' note box uses hand-made buttons.
