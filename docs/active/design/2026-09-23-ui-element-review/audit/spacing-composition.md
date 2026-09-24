# Spacing & Text Composition Audit

Read-only audit of spacing and text organization across cards, popups, panels and screens
(excludes Settings screens and button order — covered by separate researchers). Source:
`youcoded/desktop/src/renderer` (Tailwind utility classes in `.tsx`, not CSS modules — the
app has no central spacing-token file or `spacing.ts`; every value below is a Tailwind class
read directly out of a component with a file:line citation). Screenshots: `scratch/element-sweep*`
under this worktree, mostly the `light` theme with spot-checks in `midnight`/`meadow-mist`.

## Spacing in use

There is **no shared spacing scale file**. Every number below comes from Tailwind classes
(`p-3`, `gap-2`, etc.) typed directly into each component. Converting to px:

| Value | Tailwind class(es) | Where it's used |
|---|---|---|
| 2px | `py-0.5` | Marketplace card badge pill vertical padding (`MarketplaceCard.tsx`) |
| 4px | `gap-1`, `p-1`, `px-1`, `pt-1`, `py-1` | Micro gaps: badge-icon-to-text (`MarketplaceCard.tsx:276` `gap-3`→ inner `gap-1`), Command-drawer icon buttons `p-1` (`CommandDrawer.tsx`), Session Files row `px-2 py-1` (`SessionDrawer.tsx`) |
| 6px | `gap-1.5`, `py-1.5` | Tag-pill internal gap (`MarketplaceCard.tsx`, `ModelPickerPopup.tsx`, `SubagentTimeline.tsx:118`), ToolCard header row `px-3 py-1.5` (`ToolCard.tsx:118`) |
| 8px | `gap-2`, `px-2`, `py-2` | The most common "internal element gap" — title→meta, tag→tag, icon→label — used in `MarketplaceCard.tsx` (5×), `MarketplaceDetailOverlay.tsx` (6×), `ToolCard.tsx` body `px-3 py-2` (line 710), `SessionDrawer.tsx` (7×), `DeliverablesCard.tsx` (4×) |
| 10px | `px-2.5`, `py-2.5` | Session Files file row `px-2.5 py-2` (`SessionDrawer.tsx`), conversation-reference row `px-2.5 py-2` (`ChatsearchFindCard.tsx`), Arcade card footer `px-3 py-2.5` (`ArcadePicker.tsx`) |
| 12px | `gap-3`, `p-3`, `px-3`, `py-3` | The most common **card outer padding**: Marketplace card `p-3` (mobile), Marketplace detail header/body `p-3` (mobile), nested info box `p-3` (`MarketplaceDetailOverlay.tsx:508`), ToolCard `px-3`, DeliverablesCard `px-3`, SubagentTimeline nested boxes `px-3`, ResumeBrowser session card `px-3 py-2`, Command-drawer (skills) card `p-3`, Arcade game card `p-3`, Model-picker list rows `p-3`, Marketplace grid card-to-card gap `gap-3` (`MarketplaceGrid.tsx:58`) |
| 16px | `gap-4`, `p-4`, `px-4`, `py-4` | **Card outer padding (desktop)**: Marketplace card `sm:p-4` (`MarketplaceCard.tsx:357`), Marketplace detail header `sm:p-4`, Dialog shared shell backdrop padding `p-4` (`Dialog.tsx:211`), Command-drawer section padding `px-4`, ResumeBrowser search box `px-4`, Project-view header `px-4` |
| 20px | `p-5` | **Outlier** — Pages-empty-state card `p-5` (`PagesEmptyCard.tsx`), Model & Effort popup body `p-5` (`ModelPickerPopup.tsx`) — doesn't match any neighboring value used elsewhere (12, 16 or 24) |
| 24px | `gap-6`(rare), `p-6`, `py-12` | Marketplace detail body **wide** padding `sm:p-6`, Pages-empty-state **wide** padding `sm:p-6`, Marketplace detail review-list top padding `py-12` |

**De facto scale**: 4 / 8 / 12 / 16 / 24, which is a normal design-system rhythm — but it's
diluted by five off-scale values that show up only once or twice each: 2px, 6px, 10px and
20px. None of these are "a smaller card needs a smaller gap" — they're the same role (card
padding, row padding, pill padding) landing on a slightly different number in each file
because nobody is drawing from one shared list. Concretely:

- **Card outer padding** alone takes four different values depending on which screen you're
  on: 12px (Marketplace, ToolCard, DeliverablesCard, Skills drawer, Games, Resume rows,
  Model-picker rows), 16px (same Marketplace/Dialog components at wider viewport), 20px
  (Pages empty-state, Model-picker popup body), 24px (Marketplace/Pages wide breakpoint).
- **Row/pill vertical padding** takes five values: 2px, 4px, 6px, 8px, 10px, often for
  visually identical-looking pills in adjacent cards.
- **Card-to-card grid gap**: only directly confirmed at 12px (Marketplace grid). Other grids
  (Project Files, Pages manage, Library) read as visually similar (~12–16px) in screenshots
  but use different components, so this is a visual estimate, not a grepped citation — flagged
  in Coverage below.

## Text organization by family

No two "show an item's name, who made it, and its stats" cards use the same layout — this is
the single biggest driver of "different organizations of text" the product owner named.

**1. Marketplace card ("All" tab)** — `scratch/element-sweep/shots-marketplace-overhaul/light/grid.png`
Title + INSTALLED badge + star (row) → safety-badge + author-badge **as pills** (row) →
description, 2-line clamp → optional single tag pill → footer stats row split left
(thumbs% + downloads) / right (skill/command count).

**2. Marketplace card ("Skills" tab)** — `scratch/element-sweep/shots-marketplace-overhaul/light/skills-tab.png`
Same component, but inserts a plain-text "Skill" subtitle line between the title row and the
badge-pill row that the "All" tab never shows — so the same card grows a line depending on
which filter tab you're viewing it from.

**3. Marketplace detail popup** — `scratch/element-sweep/shots-marketplace-overhaul/light/detail.png`, `detail-caution.png`
Title → "Plugin"/"Skill" subtitle line → badge-pill row → nested bordered box "WHAT THIS CAN
DO" (bullet list, sometimes with an internal divider + second "flagged" bullet list inside
the *same* box) → tag-pill row → "ABOUT" label + paragraphs → second nested box "WHAT'S
INSIDE" → "FEEDBACK" label + Helpful/Not-for-me pills + percentage + vote count → review list.

**4. Library card** — `scratch/element-sweep-main/shots-main/meadow-mist/library.png`
Title + INSTALLED + star (row) → author as **plain text**, own line (not a pill, unlike the
Marketplace card for the *same install*) → description, 2-line clamp → one tag pill → footer
stats (thumbs%, downloads only — no right-side count, even where the item has skills/commands).

**5. Skills drawer card** — `scratch/element-sweep/shots-main/light/skills-drawer.png`
Title + plugin-source icon + star (row, no INSTALLED badge) → description, 2-line clamp →
one tag pill. No stats row at all, even though the same item shows thumbs/downloads on its
Marketplace and Library cards.

**6. Pages manage card** — `scratch/element-sweep/shots-pages/light/library.png`
Icon square (top-left) + title + edit/pin icons (top-right) → description, 2–3 lines →
footer: **one line**, dot-joined ("Personal · Updated 4 d ago · 1 connection") — the cleanest
of the five "card with metadata" families, and the only one that puts all metadata on a
single line instead of splitting it across a stats row.

**7. Games panel card** — `scratch/element-sweep/shots-main/light/games-picker.png`
Icon (top) → title (bold) → one subtitle line ("Your best: 31 pipes" / "Sign in to play").
No badges, tags or stats row — the simplest card in the app, and a plausible template for
the others.

**8. Project Files grid card** — `scratch/element-sweep/shots-main/light/projects-file-filter.png`, `scratch/element-sweep/shots-project-files-any-size/light/files-docs.png`
Icon/thumbnail (top) → filename (bold) → type label. But the `docs` subfolder shows the same
card rendering four *different* preview shapes: plain paragraph, a nested code/command
snippet box, a bulleted list, and a bold sub-heading + paragraph — plus a "deleted" badge
overlapping the card corner and a strikethrough filename on removed files.

**9. Projects › Conversations tab row** — `scratch/element-sweep/shots-main/light/projects-conversations.png`
Title (bold) + date (top-right, **top** row) → tag pills (left) + model-icon+model-name ·
size (bottom row, same line).

**10. Resume Session popup row** — `scratch/element-sweep/shots-main/light/resume-browser.png`
Title (bold, inline edit icon) + tag/checkmark icons (top-right) → tag-pill row (optional) →
folder-icon+project · model-icon+model · size · **date** all packed onto one bottom meta
line — date sits at the *end* of the bottom row here, not top-right like #9.

**11. In-chat conversation reference card** — `scratch/element-sweep/shots-pages/light/header.png` (rows "Permission ask timeout" / "Native runtime parity program")
Title (top-left) + date (top-right, top row, matching #9) → tags (left) + project name plain
text + Preview/Resume buttons, all on the bottom row.

Three different "conversation card" families (#9, #10, #11) each place the date in a
different spot and combine tags/project/model/size in a different order, for what is
conceptually the same object.

**12. Session Files pane row** — `scratch/element-sweep/shots-main/light/session-files-pane.png`
Icon/thumbnail (**left**) + filename (bold) + status·date meta line stacked below, all in a
horizontal row — a fifth "file card" anatomy, distinct from the Project Files grid's
icon-top/text-below vertical anatomy (#8), for the same "represents a file" job.

**13. Deliverables chat card** — `scratch/element-sweep/shots-bubbles/light/deliverables.png`
"Deliverables N" bold count + one-line description + chevron. Single row, no badges — the
cleanest chat-card family.

**14. Subagent / specialist chat cards** — `scratch/element-sweep/shots-main/light/tool-cards-all-expanded.png`, `scratch/element-sweep/shots-cc-subagents/light/helpers.png`
"Agent: <task>" header + role tag → nested "Briefing" box → nested "Activity (N)" box →
inside that, a further-nested "Searched the code" box (pattern pills + result count) →
nested "Response" box. Up to **four levels** of bordered-box nesting in a single card.

**15. Permission-request chat card** — `scratch/element-sweep/shots-helper-asks/light/bottom.png`
Header row (icon + "Hiring a ___" / "<name> wants to: <action>") → **optional** nested
explanation box (bulleted capability list) → Yes / Always Allow / No button row. In the same
screenshot, one card has the explanation box and the very next one doesn't, with no visible
rule for which gets it.

**16. Pages-connection permission card** — `scratch/element-sweep/shots-pages-connections/light/approve-new-key-full.png`
A *different* container language for the same "OK this?" decision: centered floating card
(not docked left like #15), icon+eyebrow-label+bold-title header, one nested paragraph box,
then **two stacked full-width buttons** (Continue / Not now) instead of #15's inline row.

**A consistent pattern worth keeping**: the Model & Effort popup, the Create-a-page dialog,
and the Resume-preview drawer's control block all use the same "small ALL-CAPS label
directly above its control" convention (`PROJECT FOLDER`, `MODEL`, `EFFORT LEVEL`, `SKIP
PERMISSIONS`). This is the one composition rule that's already followed everywhere it
appears — it should be the template extended to the other 15 families above, not replaced.

## Clutter — worst 10

1. **Subagent cards / Subagents popup** — `scratch/element-sweep/shots-main/light/tool-cards-all-expanded.png`, `scratch/element-sweep/shots-cc-subagents/light/helpers.png`. Four levels of nested bordered boxes per card (outer agent card → Briefing box → Activity box → a further-nested "Searched the code" box → Response box). `SubagentTimeline.tsx:113,137,179` each independently apply `rounded-lg border`, stacking a new box at every level instead of one flat, indented list.

2. **Marketplace detail popup, caution item** — `scratch/element-sweep/shots-marketplace-overhaul/light/detail-caution.png`. Title, subtitle, 3 badge pills, a nested "WHAT THIS CAN DO" box that itself contains an internal divider and a second bulleted "flagged" list, a second nested "WHAT'S INSIDE" box holding one line of text, then a Feedback row with two more pill styles (Helpful/Not-for-me) plus a percentage and a vote count. Three distinct pill/badge visual languages and two nested boxes on one screen.

3. **Project Files "docs" grid** — `scratch/element-sweep/shots-project-files-any-size/light/files-docs.png`, `scratch/element-sweep/shots-main/light/projects-file-filter.png`. The same file-card component renders four different internal content shapes side by side (plain paragraph / nested code-snippet box / bulleted list / bold-subheading+paragraph), plus a "deleted" badge overlapping a card corner and strikethrough text on one card — no consistent anatomy across the grid at all.

4. **Stacked permission-request cards** — `scratch/element-sweep/shots-helper-asks/light/bottom.png`. Two permission cards back to back for the same kind of decision; one carries a nested explanation box with bullets, the other doesn't — different heights and apparent "weight" for equivalent asks with no visible rule.

5. **Resume Session popup rows** — `scratch/element-sweep/shots-main/light/resume-browser.png`. Every row compresses title, optional tags, project, model, size, and date onto two lines, with four independent metadata pieces sharing one crowded bottom line.

6. **Stalled-provider alert stack** — `scratch/element-sweep/shots-overlays/light/native-session-stalled-and-permission.png`. A full-width amber banner, a plain gray command-run row, a Deliverables row, and a red-bordered alert card with inline buttons all stack in one short scroll — four distinct visual treatments for four adjacent status messages.

7. **Marketplace/Library/Skills-drawer/Pages card family fragmentation** — `scratch/element-sweep/shots-marketplace-overhaul/light/grid.png` vs `skills-tab.png` vs `scratch/element-sweep-main/shots-main/meadow-mist/library.png` vs `scratch/element-sweep/shots-main/light/skills-drawer.png`. Four different footer/metadata treatments (pill-pair vs plain-text author, split-stats-row vs single-line-footer vs no-stats) for conceptually the same "installable item" object.

8. **Projects hero + Files grid screen** — `scratch/element-sweep/shots-main/light/projects.png`. The hero card (status pill, Rename button, stats row, italic quote) sits directly above a tab bar, a search/filter bar, and a file grid whose own cards carry a further mini "info card" look (a README preview card with a decorative divider line meant to read as a progress bar) — three different card-styling conventions on one screen with no full-bleed break between them.

9. **Library screen bold competition** — `scratch/element-sweep-main/shots-main/meadow-mist/library.png`. Bold title, bold "INSTALLED" label, bold percentage number, and bold tag-pill text all compete on the same card with no single anchor for the eye — four equally-weighted bold elements per card.

10. **Model & Effort popup** — `scratch/element-sweep/shots-main/light/model-picker.png`. Moderate but notable: a bordered model-list box, a segmented effort-level control, an explanatory sentence, and a toggle row are four different control shapes packed into one small popup — tidier than 1–9 but still four distinct affordance styles in ~400px of height.

## Candidate rules

*(Proposals with evidence — not decisions.)*

1. **Adopt one spacing scale: 4 / 8 / 12 / 16 / 24, drop the off-scale values.** Collapse
   `py-0.5`(2px)→4, `gap-1.5`/`py-1.5`(6px)→8, `px-2.5`/`py-2.5`(10px)→8 or 12, `p-5`(20px)→24.
   Assign roles: **4px** = icon-to-label micro gap; **8px** = gap between elements inside a
   card (title→meta, tag→tag); **12px** = card outer padding (default) and grid card-to-card
   gap; **16px** = card outer padding at wide viewport, popup section gaps, label-to-block
   gaps; **24px** = popup body padding, major section breaks between unrelated blocks.

2. **One card anatomy for "name + who made it + stats."** Apply to Marketplace, Library,
   Skills-drawer and Pages-manage cards alike: title+status-badge row → 8px → author/source
   (pick pill *or* plain text, not different choices per family) → 8px → description
   (always 2-line clamp) → 8px → tag row (max 2 tags) → 12px → one footer stats row, always
   in the same left/right positions.

3. **One popup anatomy.** 16px outer padding (24px at wide viewport), hairline under the
   header, 24px between sections, each section carrying a small ALL-CAPS label 4px above its
   content — this is already how the Model & Effort popup, Create-a-page dialog and
   Resume-preview drawer behave; extend it to the Marketplace detail popup and permission
   cards instead of inventing new nested-box treatments there.

4. **No box-in-a-box-in-a-box.** Cap nesting at one bordered container per card. Replace the
   Subagent/tool-card box-stacking with a flat, indented list using a single left border to
   show hierarchy — `SubagentTimeline.tsx:29`'s own comment already names this as the intended
   solution ("left vertical border frames the nested work") but the component still wraps
   each level in its own `rounded-lg border` box on top of that border.

5. **Metadata placement rule: date always top-right of the title row.** Currently 3 different
   positions across the 3 "conversation card" families (Projects tab, Resume popup, in-chat
   reference card) — standardize on the Projects-tab / in-chat-reference placement (both
   already agree) and move the Resume popup's end-of-line date to match.

6. **One permission-card layout.** Use the in-chat family's docked-left card + inline
   Yes/Always Allow/No row everywhere a permission or connection decision appears, including
   Pages-connections — not the centered-card-with-two-stacked-buttons pattern that currently
   exists only there for the same kind of decision.

## Coverage

Reviewed directly (Read, not just listed) in the `light` theme, with `midnight`/`meadow-mist`
spot-checks noted: `shots-marketplace-overhaul/{grid,detail,detail-caution,search-split,skills-tab}`,
`shots-main/light/{marketplace,library,projects,projects-conversations,projects-context,
projects-file-filter,resume-browser,resume-browser-stress,session-files-pane,skills-drawer,
skills-drawer-end,model-picker,tool-cards-all-expanded,games-picker}`,
`element-sweep-main/shots-main/meadow-mist/library`, `shots-bubbles/light/deliverables`,
`shots-cc-subagents/light/helpers`, `shots-helper-asks/light/{bottom,group}`,
`shots-overlays/light/{native-session-stalled-and-permission,first-run-launch-wizard,
first-run-detect-prerequisites,first-run-install-prerequisites}`,
`shots-pages/light/{library,header}`, `shots-pages-view/light/create-dialog`,
`shots-pages-connections/light/approve-new-key-full`,
`shots-project-files-any-size/light/files-docs`, `shots-games-arcade/light/{arcade-leaderboard,
arcade-chess}`, `shots-conversation-previews/midnight/{drawer-preview-panel,
projects-conversation-preview}`.

Source cross-checked with `rg`/`grep` (Tailwind classes, not CSS): `MarketplaceCard.tsx`,
`MarketplaceDetailOverlay.tsx`, `MarketplaceGrid.tsx`, `ToolCard.tsx`, `SessionDrawer.tsx`,
`ResumeBrowser.tsx`, `SessionCardDetails.tsx`, `DeliverablesCard.tsx`,
`tool-views/SubagentTimeline.tsx`, `tool-views/ChatsearchFindCard.tsx`,
`tool-views/ChatsearchShowCard.tsx`, `CommandDrawer.tsx`, `ModelPickerPopup.tsx`,
`game/ArcadePicker.tsx`, `pages/PagesEmptyCard.tsx`, `pages/PageCreateDialog.tsx`,
`ui/Dialog.tsx`, `library/LibraryScreen.tsx`, `project-view/ProjectDetailOverlay.tsx`,
`project-view/tabs/ConversationsTab.tsx`. Confirmed no `spacing.ts` / CSS-custom-property
scale exists anywhere under `src/renderer` (only a handful of standalone `.css` files;
everything else is Tailwind utility classes on JSX).

**Not covered / sampled thinly**: exhaustive per-theme comparison (only 1–2 themes opened per
surface, not all themes in every `shots-*` directory); the Marketplace Connections/Prompts/
Themes sub-tabs beyond the one Skills-tab screenshot; `session-files-filter` and
`pages-narrow`/narrow-viewport variants (listed but not opened — narrow layouts may reflow
spacing differently and were out of this pass's time budget); grid-to-grid card gap for
Library/Pages-manage/Project-Files grids was read visually from screenshots only, not
confirmed against a `gap-*` class citation (flagged inline above). Settings screens and
button-order/ordering concerns were intentionally excluded per the task brief. This audit
sampled the named surfaces thoroughly but did not open all ~80 `shots-*` plan directories in
`scratch/`; some contain narrower slices of the same surfaces already covered and were
skipped as redundant.
