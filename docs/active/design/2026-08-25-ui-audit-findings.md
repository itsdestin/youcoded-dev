---
status: draft
date: 2026-08-25
owner: Destin (decisions) / Claude (audit)
related: 2026-08-25-ui-design-guide.md, 2026-08-25-ui-audit/gallery.html
roadmap: "Whole-UI review pass once the consistency migration is complete" (ROADMAP.md, added 2026-07-24)
---

# Whole-UI review — what the app looks like today, surface by surface

This is the review pass the ROADMAP has been waiting on since the consistency migration
finished (2026-07-24). It answers three questions: **which surfaces look worst or least like
the rest of the app**, **where the same control is drawn more than one way**, and **where
themes break** (unreadable text, colours that ignore the theme, glass that hides things).

The companion document, `2026-08-25-ui-design-guide.md`, is the *standard* — the rules that
fall out of this review. This file is the *evidence*. Every finding below points at a
screenshot you can open.

## How to look at the pictures

- **Gallery (start here):** `docs/active/design/2026-08-25-ui-audit/gallery.html` — one
  row per surface, every theme side by side. Open the file path in the app's file viewer or
  a browser. Each picture is named `<batch>-<surface>`; findings below cite that name.
- **Full-resolution originals** (1440×900 PNGs, ~600 of them) are in
  `scratch/ui-audit-2026-08-25/` (git-ignored, this machine only), laid out as
  `<batch>/<theme>/<surface>.png`.
- Themes captured: the four built-ins (**midnight, dark, light, creme**) plus the two
  community packs the workbench bundles (**halftone-dimension** = the standard stress theme,
  **meadow-mist** = glass over a wallpaper), plus **golden-sunbreak** on the real app.

## How this was captured (and what it could NOT see)

- ~600 screenshots taken headlessly from the **UI Workbench** (the real renderer against a
  fake backend, in a throw-away browser) across 6 themes, 5 data scenarios, desktop
  (1440×900) and phone width (390×844), plus a 2-second fake-latency pass for loading
  states. A further ~80 came from a **real Electron dev instance** (isolated `uiaudit`
  profile, virtual display — your live app was never touched).
- A **rendered-text contrast probe** ran on every screenshot: for each piece of visible
  text it measured the actual painted text colour against the actual background behind it
  and flagged anything under WCAG AA (4.5:1 for normal text, 3:1 for large). This is
  different from the existing `audit-theme-contrast.mjs`, which checks *token pairs* — this
  checks what actually got painted, so it catches hardcoded colours and translucent
  surfaces the token audit can't see. Its numbers are quoted below as e.g. "2.0:1".
- **Fidelity gaps — things this pass could not judge, so nobody should think they passed:**
  1. **Marketplace / Library cards.** The workbench has no registry data, so Marketplace
     renders "Explore everything" over nothing and Library shows two empty headings. The
     real-app pass covers the theme marketplace with live registry data (see §6) but
     plugin cards were only captured there too — they were never seen in the 6 themes.
  2. **Backup & Sync** crashes in the workbench (`SyncPopup: Cannot read properties of
     undefined (reading 'length')` — a mock-data gap, not an app bug; the real app
     renders it fine, see §6). The setup wizard was not captured.
  3. **Right-click context menus** never opened under either synthetic right-click method,
     so they are unreviewed.
  4. **First-run wizard** — the real app skipped it (Claude Code is installed here) and the
     workbench mock has no switch for it. Unreviewed.
  5. **Tool Gallery page chrome is dev-only** and hardcodes a dark page, so in light
     themes the gallery *page* looks broken. The cards inside it are real; the page around
     them is not a product surface. Findings about the gallery below are about the cards.
  6. The contrast probe **over-reports on glass** (meadow-mist): when a surface is
     translucent over a wallpaper the probe can't know what's behind it, so meadow's
     "408 failures" are mostly noise. Meadow findings below are from looking, not from
     the numbers.
  7. Halftone Dimension's headline text has a red/cyan fringe in screenshots. That is the
     theme's own `custom_css` text-shadow (a deliberate "chromatic" effect), not an app
     bug — but see T-4 for why it still matters.

---

## 1. The ten surfaces that most need work (ranked)

Ranked by how far the surface is from the rest of the app, weighted by how often a normal
user sees it. "Fix" names the design-guide rule (`G-n`) or a proposal (`P-n`, §7).

| # | Surface | What's wrong (what a user sees) | Picture | Fix |
|---|---|---|---|---|
| 1 | **Marketplace** | One bar holds 13 identical grey pills that mean three different things (tabs *Plugins/Themes*, categories *School…Home*, sorts *New/Popular/Featured*); the search box is smaller than the pills and has no icon; the "Explore everything" heading is followed by nothing until data loads; the Themes tab shows two empty-state messages at once ("0 results" *and* "Nothing matches those filters."). At phone width the title truncates to "Ma…". | `3-marketplace`, `3-marketplace-themes`, `narrow-n-marketplace`, `e-marketplace-plugins` | P-1, G-14, G-18 |
| 2 | **Your Library** | Two bare headings ("Favorites", "Installed") on an empty page: no explanation, no button, no link to the marketplace that sits one pill away in the header. 22px title over 12px tabs reads as scaffolding. Fully empty state is the *normal* state for a new user. | `3-library`, `3-library-themes` | P-2, G-18 |
| 3 | **Themes dialog (Settings → Appearance)** | Theme cards come in two heights — the active card *and one arbitrary other* get a second row — so the 2×3 grid looks broken; card order changes between openings; three stacked full-width buttons in three different styles ("Browse all themes →" outline-with-fill, "✦ Build New Theme with Claude" filled, "Browse Theme Marketplace" outline) with two of them near-duplicates. Editing a built-in opens a 590px-tall dialog that is 90% empty except a note saying you can't edit it. | `1-settings-appearance`, `3-theme-edit`, `3-theme-edit-halftone` | P-3, G-9, G-10 |
| 4 | **Model Providers → local section** | Shows literal `Installed undefined · undefined · stopped` and `No models match "".` as user-facing text (workbench mock data, but the strings exist in the component and the real app shows the same shape with real values — see `e-providers-local`); five button shapes in one dialog (outline chips *Add key/Test*, red outline *Remove*, filled pill *Connect to OpenRouter*, full-width outline *Add provider*, small *Detect* chip); the dialog clips its bottom with a fade and no scrollbar. | `2-providers-local`, `1-settings-model-providers`, `e-providers-local` | P-4, G-9, G-11 |
| 5 | **Projects header card** | Three button scales in one card: a big filled *New Conversation* top-right, tiny 11px outline *Rename* / *Remove from YouCoded* bottom-left, and a filled pill *Turn on sync for this project* nested inside a chip. Folder cards draw a small "tab" notch that overlaps the card border and reads as a glitch; document cards render raw Markdown at ~9px and cut mid-line. Also the **only full screen that ignores the theme wallpaper** (opaque in halftone and meadow while Library/Marketplace show it). | `1-projects`, `2-projects-conversations` | P-5, G-9, G-16, T-6 |
| 6 | **Empty / welcome screen** | *New Session* is a pale grey pill that reads as disabled next to the outlined *Resume Session* (the accent on dark built-ins is near-white, so "filled primary" = "grey"); the mascot in halftone is a blurred smear with two stray hairlines; in meadow *Resume Session* is dark text on translucent blue over blue trees. Real app adds: Settings is unreachable from this screen except via New Session → Model → "Manage models…". | `1-scenario-empty`, `e-empty`, `e-new-session-form` | P-6, G-8, G-13 |
| 7 | **Keyboard Shortcuts** | Uses the narrow "prompt" dialog width, so labels wrap to two lines while key chips don't, rows go uneven, and the list clips at "Send message" with no scroll cue — meadow-mist (a sans font) reveals an 11th row the monospace themes never show. | `1-settings-keyboard-shortcuts` | P-7, G-11 |
| 8 | **All-sessions popover** | Fixed width tuned to one font: monospace titles wrap 2–3 lines ("gpt-5.6 / debug / session") with the project name jammed beside them; the last row is clipped in half with no scroll indication. Meadow (sans) fits every row on one line. | `1-all-sessions-menu` | P-8, G-11 |
| 9 | **Skills drawer (bottom sheet)** | One dashed *＋ Add Skills* card alone at the far left of an empty 1400px row; category pills are the smallest text in the app (~11px) and use a different shape from every other filter pill; two unlabeled icon buttons live *inside* the search field; *★ Favorites only* orphaned at the far right. | `1-skills-drawer`, `narrow-n-skills-drawer` | P-9, G-14, G-18 |
| 10 | **Status bar** | 10px text; the model chip ("Sonnet \| Auto Effort") is orange-outlined while every other chip is grey, so the model reads as a warning; the theme-name chip looks like a button but is a label; at phone width it wraps to two rows with the theme chip orphaned. In halftone the bar floats centred in its own pill. | `1-home`, `narrow-n-home` | P-10, G-15 |

Honourable mentions (real, smaller): **Terminal** view is a blank pane with one cursor
wedge and no chrome (`1-terminal`) — reads as a crash; **Edit Quick Chips** lists none of the
seven chips it edits (`1-edit-quick-chips`); **Find bar** has no surface of its own and lands
*inside* the user bubble, truncating it (`6-find-bar`); **Tags & note** is a dialog inside a
dialog with 9px labels and a full-width *Done* footer no sibling has (`1-tags-note-popover`);
**Status Bar Widgets** clips its last section label ("CODE") with no scroll cue
(`1-customize-status-bar`); **Donate** and **Development** are the only dialogs with no
title row or ✕ (`1-settings-donate`, `2-development-bug-report`); **About** is a 500px wall
of legal text cut mid-word (`1-settings-about`); **Session Defaults** shows four model names
with no selected state and files harmless rows under "DANGER ZONE" (`1-settings-defaults`).

## 2. Same thing, drawn more than one way

These are the inconsistencies a design guide exists to end. Each row is one *concept* and
the ways it is currently drawn.

| Concept | Currently drawn as… | Where | Rule |
|---|---|---|---|
| **"This is selected"** | filled dark pill (header *Chat*), filled rect (model picker *Sonnet*), orange *outline* (status-bar model chip), nothing at all (quick chips; Session Defaults model row; Projects tabs in midnight where accent ≈ grey) | `1-home`, `1-model-picker`, `1-settings-defaults` | G-8 |
| **Primary action** | filled rounded-rect (*New Conversation*, *Sign in to YouCoded*), full-width filled (*Build New Theme*), full-width outline (*Add provider*, *Browse Theme Marketplace*), filled pill inside a chip (*Turn on sync*), outline pill (*+ Add file*), grey pill (*New Session*, *Submit* in AskUserQuestion) | `1-projects`, `1-settings-appearance`, `1-scenario-empty`, `tall-*-gallery-p1` | G-9 |
| **Permission buttons** | saturated filled green/blue/red pills (*Yes / Always Allow / No*) — the only place in the app with coloured filled pills; the *Stop* card uses a `|` divider between them in one row and none in the next | `tall-*-gallery-p1`, `tall-*-compare-tall` | G-9 (documented exception, decision 61) |
| **Chips / pills** | quick chips 12px rounded-rect outline; status-bar chips 10px outline; tag pills 9px coloured; skills-drawer category pills ~11px filled; marketplace pills 12px filled-grey; header *Chat/Terminal* segmented filled | `1-home`, `1-skills-drawer`, `3-marketplace` | G-14 |
| **Search field** | Projects ~260px pill + filter icon; Session Files full-width pill + filter icon; Marketplace ~195px, no icon, smaller placeholder; Skills drawer full-width + magnifier + two icon buttons inside | `1-projects`, `1-session-files-pane`, `3-marketplace`, `1-skills-drawer` | G-12 |
| **Counts** | "Files 9" (tab numeral), "9 files" (stat row), "Session Files (4)", "0 results", "+9" (session strip) | `1-projects`, `1-session-files-pane`, `3-marketplace-themes` | G-19 |
| **Back / close** | full screens: text "Esc · Back to chat"; side panes: ✕; dialogs: ✕ (some with ‹ back, some with ⓘ); Donate/Development: nothing | everywhere | G-10 |
| **Screen header** | Projects: 16px title in a 50px bar; Library/Marketplace: 22px title in a 55px bar, Marketplace alone has a logo before the title | `1-projects`, `3-library`, `3-marketplace` | G-16 |
| **Tabs** | Projects: icon + label + count in a bordered group; Library: bare pills; Marketplace: visually identical to category/sort pills | same | G-14 |
| **List row** | Conversations/Context: bordered cards with icon square; Session Files: flat rows with dividers, no icon; Files: preview cards; Settings drawer: card rows with icon + subtitle + chevron; Resume browser: bordered cards with tag pills | `2-projects-conversations`, `1-session-files-pane`, `1-settings-drawer`, `6-resume-browser-stress` | G-17 |
| **Empty state** | Connect 4: icon + title + sentence + button (good); Marketplace: one centred sentence; Skills: dashed add-card; Library: nothing | `1-games-connect4`, `3-marketplace-themes`, `1-skills-drawer`, `3-library` | G-18 |
| **Dialog header** | title + ✕; title + ⓘ + ✕; title + subtitle; no header (Donate, Development); *Resume Session* has a "SHOW COMPLETE" toggle where ✕ should be and no ✕ | `1-settings-*`, `6-resume-browser` | G-10 |
| **Section label** | uppercase 10px ("MODEL", "RATE LIMITS", "CLAUDE CODE ⓘ") vs sentence case ("Password", "Keep awake") inside the same Remote Access dialog; "DANGER ZONE" over non-dangerous rows | `1-settings-remote-access`, `1-settings-defaults` | G-11 |
| **Radii in one view** | bubbles 16 / tool cards 8 / dialog buttons 6 / chips 4 / send button & *Done* full-round — all visible in one chat screen | `6-tool-cards-all-expanded` | G-3 |
| **Overlay backdrop** | built-ins dim; community packs blur the whole page (theme choice — fine, but the filters popover in halftone is opaque while the pane it sits on is glass) | `2-session-files-filter` (halftone) | T-5 |
| **Checkbox shape** | square in built-ins; round (radio-looking) in halftone and meadow because the packs set a global radius | `1-customize-status-bar` | T-3 |
| **Tool-card header** | consistent everywhere (`glyph | bold title ↳ dim path … chevron`) **except** AskUserQuestion, which has no path, a different glyph, and its chevron inline after the title instead of right-aligned; its body mixes bordered two-line radio rows with borderless one-line checkbox rows | `tall-*-gallery-p1` | G-20 |
| **The literal `\|` separator** in every tool-card header is `fg-faint` at **2.0:1** — decorative, but it is the third character in every card the user reads | `1-home` and 70+ others | G-6 |

## 3. Theme and contrast findings

Numbers are painted-pixel ratios from the probe; "AA" = 4.5:1 for normal text.

### Built-in themes (these are app problems, not theme problems)

- **All four built-ins:** `fg-muted` small text (12px paths in tool cards, "edited · 7/28/2026"
  dates, "youcoded" project labels, helper text) sits at **3.3:1** on raised surfaces — below AA
  everywhere it's used as *information* rather than decoration. This is the same
  "`fg-muted` on `inset`" issue the token audit already tracks as SOFT; the painted probe
  shows it is the single most common failure in the app (≈40 distinct strings per theme).
  → **G-6** (token usage rule) + **P-11** (bump `fg-muted` one step on raised surfaces).
- **All four built-ins:** braille spinner glyphs (`⠼`) and the `|`/`▾`/`→` separators are
  `fg-faint` at **2.0:1**. Fine for a divider, not fine for the spinner that *is* the
  loading indicator. → P-11.
- **Midnight / dark:** the accent is near-white, so "filled primary" and "selected" both
  render as **light grey** — *New Session*, *Build New Theme*, *Submit*, *Open* (Donate), the
  selected Projects tab and the selected filter pills all read as disabled. This is the root
  cause behind finding #6 and half of §2's "selected state" row. → **P-12** (give dark
  built-ins a real accent, or give primary/selected a second signal besides fill).
- **Light:** the user bubble is **solid black** — the heaviest object on the screen, heavier
  than any button (`1-home` light). The find bar disappears inside it (`6-find-bar`). The
  composer is a grey pill that reads disabled. "Signed in with your Claude account" is lime
  on light grey (lowest-contrast text in Settings). The *Priority* tag is `#c99700`-ish on
  light grey at **2.2:1**. The "Stopped before pushing code" amber heading is **1.5:1** on
  cream. The diff `+` marker green is **1.9:1**. → P-13 (light bubble weight), **T-1**
  (semantic colours need light-theme variants).
- **Creme:** same as light plus: chevrons and the grey-dot icons in the Settings drawer are
  very low contrast on beige; *Remove* red and *Signed in* green look pasted on.
- **Disabled "Max" effort** is **2.3:1** in every theme with no explanation of why it's
  disabled (`1-model-picker`). → G-6.

### Hardcoded colours that ignore every theme (app bugs)

Identical hex in all six themes: the **coffee-cup yellow** (Donate), **lime "Signed in…"**
(Model Providers), **red "Remove"** and the red "plays when a session needs approval" dot,
the **four tag colours** (Priority/work/bug/idea), the **permission pill hues**
(green/blue/red/orange), the **Connect 4 piece colours** (documented exception: wire-protocol
values), the **star gold** (documented exception), and the **diff green/red**. Some of these
are deliberate (`STAR_GOLD_CLASS`, Connect 4); the rest need a light-theme variant at
minimum. → **T-1**.

### Community packs (theme-pack problems, with what the app should guarantee)

- **T-2 Meadow Mist loses secondary buttons.** *Browse Theme Marketplace*, *Add provider*,
  *Install Tailscale*, *Cancel* (Donate) all render as bare text — the pack's `edge` is so
  close to its `panel` that outline buttons vanish. Off-state toggles are a pale-green knob
  on a pale-green track; unselected radios nearly invisible; *unchecked* checkboxes in
  Status Bar Widgets vanish entirely (`1-customize-status-bar` meadow). **The app should
  guarantee** a minimum edge/panel contrast (a SURFACE rule in `contrast-rules.js`) so a
  pack cannot erase its own outlines.
- **T-3 Community radius cascades into controls.** Halftone/meadow set big radii and the
  square checkbox becomes a circle (looks like a radio). Checkbox should pin `--radius-sm`
  regardless of pack.
- **T-4 Halftone's text-shadow fringe** applies to *dialog titles* at 14px, where it reads
  as a rendering fault rather than an effect (`1-settings-buddy-floater` halftone). The
  pack should scope the effect to display sizes; the app could expose a
  `--display-effect` hook so packs stop targeting arbitrary headings.
- **T-5 Glass vs opaque mismatches.** In halftone the Session Files pane is glass but its
  Filters popover is opaque; Library/Marketplace headers are opaque black bands with a hard
  edge over the wallpaper; Projects is fully opaque. Either the app defines which layers are
  glass (G-16) or packs get one knob per layer.
- **T-6 Projects ignores the wallpaper** in both packs while every other full screen shows
  it — an app inconsistency, not a pack one.
- **Meadow Mist glass over a bright wallpaper:** timestamps, the musing chip and "No Active
  Session" sit on pale glass over pale sky; *Resume Session* on the welcome screen is
  unreadable. The pack needs a darker `panel` or a stronger scrim; the app could enforce a
  minimum panel opacity for text-bearing layers.
- **Halftone accent overload:** red on the *Chat* tab, user bubble, composer outline,
  header outline, "4" badge, stop button and every assistant-bubble stripe at once. Not a
  bug, but the design guide should say which surfaces may take accent (G-8) so a pack's
  accent doesn't land on eight things.

### Phone width (390px)

- Session tab collapses to a single letter ("f") next to "+9"; in halftone the letter
  disappears entirely (`narrow-n-home`).
- Quick-chip row clips "Fix Te…" at the right edge with no fade or scroll affordance.
- Status bar wraps to two rows; theme chip orphaned on the second.
- Model picker clips its last option ("Fable") — the four model buttons don't wrap.
- Marketplace title → "Ma…"; "Esc · Back to chat" (a keyboard hint) shown on a touch layout.
- Projects is the desktop layout squeezed: two-column preview cards with ~9px text, icon-only
  tabs, separate *+ Add file* button beside a search field.
- Touch targets: status-bar chips ~18px tall, tool-card chevrons, the musing chip — all well
  under 44px (Toggles already got the invisible 44px hit area; nothing else did).
- Good: hamburger → four-item menu; Themes dialog and Model picker fit; skills bottom sheet.

### Loading states (2s fake latency)

Captured in `lat-*`: home, Settings → Account, Projects, Marketplace, Resume all show their
`LoadingState` with a named subject ("Loading projects…") — consistent, and the one place
the migration's primitives are visibly doing their job. No findings.

## 4. What is already good — codify, don't touch

1. **Tool-card header grammar** (`glyph · bold verb + filename · ↳ muted path · chevron`)
   is identical in chat, gallery and permission cards. The expanded body (TSX badge · name ·
   path · *Open ↗* · code/diff preview) is the best-rendered component in the app.
2. **Dialog chrome**: left title, right ✕, hairline divider, uppercase 10px section labels —
   already identical in Model & Effort, Status Bar Widgets, Claude Code Preferences.
3. **Settings drawer rows** (`icon · title · live-state subtitle · chevron`) — every row the
   same height, subtitle shows real state ("30%", "Sonnet", "Disabled").
4. **Toggle-row card** (title + hint left, switch right) — reads correctly in all six themes.
5. **Segmented groups** (Haiku/Sonnet/Opus/Fable; Low/Medium/High/Max/Auto; Off/1h/4h…) —
   equal heights, one filled selected state.
6. **Filters popover** (TYPE / SORT BY / VISIBILITY + pill toggles) — already the same
   component in Projects and Session Files.
7. **Connect 4 empty state** (icon → title → one sentence → one primary button) — the
   template every other empty state should use.
8. **Projects › Context** (eyebrow + plain-language subtitle + ⓘ, dismissable explainer card,
   condition chips) — the clearest "explain a complex system" pattern in the app.
9. **Hamburger menu at phone width** and the **skills bottom sheet** (drag handle, blurred
   backdrop) — the right adaptations.
10. **Token discipline in built-ins**: apart from the hardcoded list in §3, nothing in the
    four built-ins is painted outside the token set. The migration held.

## 5. Ledger — proposals to approve by number

Each is a *visible* change. "Touches" says how many surfaces move at once (that is the
point of the migration: one edit at the primitive/token layer moves everything).

| # | Proposal | Touches | Risk / what users will notice |
|---|---|---|---|
| P-1 | Marketplace bar → three distinct groups: a **SegmentedTabs** for Plugins/Themes, **filter pills** for categories, a **Select** for sort; search field gets the shared `SearchFilterPill` shape; one empty state (`EmptyState` with a "Clear filters" action). | Marketplace only | Visible re-layout of the bar; muscle memory for the two tabs is preserved (same position). |
| P-2 | Library → `EmptyState` under each heading ("No favourites yet — ★ a skill in the Marketplace" with a button); tab group adopts Projects' bordered icon+label+count style. | Library | New users finally see something; nothing moves for users with content. |
| P-3 | Themes dialog: all cards one height (active card gets a badge + pencil *inline*, not a second row); stable order (active first, then favourites A–Z); the three CTAs become **one** primary (*Build New Theme with Claude*) + **one** secondary (*Browse themes* — marketplace *is* "all themes"); "Edit built-in" becomes a disabled pencil with a tooltip instead of an empty dialog. | Appearance, Library › Themes | "Browse all themes →" disappears (it and "Browse Theme Marketplace" open the same screen). |
| P-4 | Model Providers: one button vocabulary per card (secondary chips for *Add key/Test*, `danger-outline` *Remove*), *Add provider* becomes a secondary button (not full-width outline), never render `undefined` (fall back to "—"), dialog scroll shows a scrollbar. | Model Providers | None visible beyond consistency. |
| P-5 | Projects header card: one primary (*New Conversation*), *Rename/Remove* become `size="sm"` secondary/`danger-outline` at the same scale as *+ Add file*; the sync chip becomes a status row with a secondary button; folder-card notch removed (folder icon carries the meaning); preview text floors at `text-2xs`. Projects also adopts the wallpaper (`layer-screen`) like Library/Marketplace. | Projects | The folder "tab" look goes away; in community packs Projects becomes translucent like its siblings. |
| P-6 | Welcome screen: *New Session* uses the real primary treatment from P-12; *Resume Session* stays secondary; add a Settings gear to this screen's corner (today Settings is unreachable here without expanding the form). | Welcome | A gear appears on the welcome screen. |
| P-7 | Keyboard Shortcuts → `panel` (420px) size; rows grid-aligned (label column + key column); dialog scrolls with a visible scrollbar. | one dialog | Wider dialog. |
| P-8 | All-sessions popover width becomes `min(28rem, 88vw)` and rows truncate to one line with a title tooltip; scroll cue via bottom fade. | one popover | Rows stop wrapping. |
| P-9 | Skills drawer: category pills use the shared filter-pill shape/size; the two icon buttons leave the search field and sit beside it as `size="icon"` buttons with names; the *Add Skills* card becomes an `EmptyState` centred in the row when there are no skills, and a normal last card when there are. | Skills drawer | Search field looks like every other one. |
| P-10 | Status bar: all chips share one treatment (grey outline); the model chip signals "current model" with the model's *icon*, not an orange outline; the theme chip is a label (no border) with the cycle affordance on hover; text floor `text-2xs`; at phone width chips collapse to icons before wrapping. | Status bar | The orange outline disappears; text one step larger. |
| P-11 | Tokens: `fg-muted` on raised surfaces (`inset`/`well`) is bumped to ≥4.5:1 in all four built-ins; `fg-faint` becomes *decorative-only* (dividers, disabled), never a spinner — spinners use `fg-muted`. | every surface | Muted text gets slightly lighter/darker; nothing moves. |
| P-12 | Dark built-ins get a real accent (a muted blue for midnight, a warm grey-blue for dark — chosen so `on-accent` stays white and links stay AA on inset), so *primary* and *selected* stop looking disabled. Alternative if Destin wants to keep the monochrome look: primary/selected gain a second signal (thicker border + bold) and "disabled" gets a dashed border. | every primary/selected in midnight & dark | This is the most visible change in the ledger — every primary button and selected tab in the two most-used themes changes colour. Halftone/meadow unaffected. |
| P-13 | Light/creme user bubble → `inset` (grey) with `fg` text instead of solid black; assistant bubble unchanged. | chat, light + creme | The user's own messages stop being the darkest thing on screen. |
| P-14 | Terminal empty state: show the shell prompt area with a placeholder line and keep the status bar/composer chrome; find bar gets its own `panel` surface anchored top-right *above* the transcript instead of inside the bubble. | Terminal, find | Terminal no longer looks crashed. |
| P-15 | Every dialog gets the same header (title · optional ⓘ · ✕): add it to Donate and Development; Resume Session moves "Show complete" below the search field and gets a ✕. About and Permissions get a scrollbar/fade. | 5 dialogs | Two dialogs gain a title row. |
| P-16 | Theme-pack guarantees added to `contrast-rules.js`: edge/panel ≥ 1.3:1 (outlines survive), checkbox radius pinned, text-bearing glass ≥ 0.85 opacity or a scrim, accent may paint at most the documented set (G-8). Meadow Mist and Halftone fixed in `wecoded-themes` to pass. | packs | Meadow's buttons get borders back; halftone's checkboxes go square. |
| P-17 | Phone width: session tab keeps ≥ 8 characters before collapsing; quick-chip row gets an edge fade + horizontal scroll; status bar collapses chips to icons; model picker wraps its options; full screens drop "Esc ·" on touch layouts; coarse-pointer hit areas extended to chips and chevrons (the Toggle already has the mechanism). | narrow layouts | Android/phone only. |
| P-18 | Tool cards: AskUserQuestion adopts the standard header (glyph · title · ↳ first question · chevron right-aligned); its option rows share one row style; *Submit* uses `primary` (which P-12 makes visible). The literal `\|` separator in the header becomes a 1px divider element, not text. | every tool card | The pipe character disappears; AskUserQuestion looks like its siblings. |

Recommended order: **P-11 → P-12 → P-13** (tokens first — they move everything, and P-12
changes how every later "before/after" looks), then **P-3, P-1, P-2, P-5** (the four
surfaces users see most), then the rest. Each goes through the workbench with a numbered
before/after, per the `ui-mockup` skill.

## 6. Real-app pass (Electron dev instance)

See `e-*` in the gallery. This pass exists to see the surfaces the workbench cannot fake.
Findings that only show up here:

**Caveat:** the real app ignores the `youcoded-theme` localStorage key the rig sets (it
reads appearance from disk), so all `e-*` shots are in **Golden Sunbreak** — the theme the
shared config had active. One theme, but a *community* one with a wallpaper, so it doubles
as a third stress theme.

- **Marketplace with real data looks far better than the workbench suggested** (`e-marketplace-plugins`,
  `e-theme-marketplace`): a clean 4-column card grid, `INSTALLED` badges, counts, active tab
  in accent. The bar-grouping problem (#1 above) still stands, but the *surface* is not
  ugly — I've kept it at #1 only because it is the app's shop window and the bar is the
  first thing a new user parses. Real-data findings: two theme cards (Devil's Garden,
  Kuromi Dreamer) render with **no preview image** (blank grey where the others show a
  screenshot); card metadata is inconsistent (some have a description, some none; "1 likes");
  the `LOCAL` badge on a card uses a fourth badge style.
- **Plugin detail overlay** (`e-marketplace-plugin-detail`): "REVIEWS" appears twice (an
  eyebrow *and* a heading); the skills list is a comma-separated run of underlined links —
  dense and hard to scan; the overlay is 70% empty below the fold; *Install to review* is
  a secondary button sitting where a heading's action should be.
- **Header text clips at the window edge** (`e-marketplace-plugins`, `e-library`,
  `e-resume`): "Esc · Back to chat" is cut to "Esc · Back to cha" at 1440px in the real
  frameless window — the full-screen header does not reserve the window-control inset the
  chat header does. Not visible in the workbench (no frameless chrome). → add to P-15/G-16.
- **Backup & Sync (real)** (`e-settings-backup-sync`): coherent and dense; but it introduces
  yet more vocabularies — *Sync now* and *Remove* are underlined text links (the only text
  links in Settings), and the "4 Devices / 4 Projects / 2054 Conversations" row is a fourth
  chip style (filled segmented). "GitHub · reconnecting · just now" mixes a status into the
  subtitle. Worth folding into G-9/G-14 rather than a new proposal.
- **Model Providers → Local models (real)** (`e-providers-local`): three filled-accent
  *Download* buttons stacked in one list plus two filled *Add key* — six primaries in one
  dialog (G-4). "Runs well — uses your GPU plus memory" is green *text* (the status-as-text
  pattern T-1 replaces with dot + neutral text). Long model descriptions truncate mid-word
  with an ellipsis at ~40ch.
- **Resume Session (real)** (`e-resume`): the *Priority* / *Follow-Up Needed* tags are
  coloured text pills (yellow/red on dark) — readable here, 2.2:1 on light (T-1). No ✕ on
  the dialog (P-15). Otherwise the row anatomy (title · project · model · size · time) is
  clean and should be the template for G-17's "sessions" row.
- **Welcome → New Session form** (`e-new-session-form`): the form is well-built (eyebrow
  labels, two Selects, toggle-row, Cancel + primary) — it is the best-looking form in the
  app and shows what G-11 wants. Note the profile came up with **Skip Permissions ON** (the
  dev profile shares the synced settings), so the primary reads *Create (Dangerous)* in
  red — decision 62's intended look, working as designed.
- **Your Library with content** (`e-library`): skills cards are consistent with Marketplace
  cards (same species — good). The empty *Favorites* heading with nothing under it
  confirms finding #2 even for a user with 20 installed skills. There is an *Updates · 1*
  tab the workbench never showed.

## 7. Method notes for the next pass

- Capture rig: `scratch/ui-audit-2026-08-25/tools/shot.mjs` (raw CDP, works against the
  workbench *or* an Electron instance via `ATTACH_PORT`), plans as JSON, `montage.sh` for
  the side-by-side sheets, `contrast-report.mjs` for the painted-pixel probe. Re-running the
  whole thing is ~15 minutes on this machine.
- Worth promoting into the repo later (ROADMAP candidates): the painted-pixel contrast probe
  as a workbench check (`scripts/workbench-contrast-check.mjs`), and a "screenshot every
  route × theme" script so future UI PRs can attach a before/after sheet automatically.
