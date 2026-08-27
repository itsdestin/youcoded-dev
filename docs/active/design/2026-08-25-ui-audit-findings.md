---
status: active
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
  a browser. Each picture is named `<plan>-<surface>`: `main-` (screens, settings, overlays
  reached from the chat), `overlays-` (context menus, prompts, wizard, project overlays…),
  `narrow-` (390 px), `tall-` (full tool gallery + compare view), `latency-` (loading
  states), `live-` (real app, live session) and `e-` (real app, welcome/marketplace/sync).
  Findings below cite those names. Every `main/overlays/narrow/tall/latency` sheet comes
  from one end-to-end run of `scripts/ui-review/run-review.sh` on 2026-08-25 whose
  `coverage.md` (copied next to the gallery) shows 103 of 104 planned surfaces verified in
  all six themes; the one miss ("Known Issues") opens an external link and has nothing to
  show.
- **Full-resolution originals** (1440×900 / 390×844 / 1440×4200 PNGs) are in
  `scratch/ui-review-2026-08-25/shots-<plan>/<theme>/<surface>.png` (git-ignored, this
  machine only); the real-app originals are in `scratch/ui-audit-2026-08-25/shots-e*/`.
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
  1. **Marketplace / Library cards — RESOLVED later on 2026-08-25.** The workbench had no
     registry data, so Marketplace rendered "Explore everything" over nothing and Library
     showed two empty headings; only the real-app pass (one theme) had cards. youcoded PR
     #326 gives the workbench a sampled registry fixture (30 plugins, all 7 themes, featured
     hero/rails, 5 installed) plus `?marketplace=empty` for the empty states, and the
     `marketplace-*` sheets now show Marketplace, its Themes tab, search, the plugin and
     theme detail overlays, Library (Skills + Themes) and the skills drawer **in all six
     themes** (9 surfaces × 6 verified). Findings from those sheets are §6c.
  2. **Backup & Sync** crashes in the workbench (`SyncPopup: Cannot read properties of
     undefined (reading 'length')` — a mock-data gap, not an app bug; the real app
     renders it fine, see §6). The setup wizard was not captured.
  3. **Right-click context menus** did not open under the first rig; the rebuilt rig opens
     them with a real right-button press on `.assistant-bubble` / `.user-bubble` / the
     composer / a code block / a file pill — reviewed in §6b #21.
  4. **First-run wizard** — the real app skips it (Claude Code is installed here) and the
     mock had no switch; `?firstRun=<STEP>` was added to the workbench (youcoded PR #325)
     and all five steps are reviewed in §6b #17.
  5. **Tool Gallery page chrome is dev-only** and hardcodes a dark page, so in light
     themes the gallery *page* looks broken. The cards inside it are real; the page around
     them is not a product surface. Findings about the gallery below are about the cards.
  6. **Surfaces the first rig tried to open but never did** (the click or keystroke missed,
     and the screenshot was just the chat window — these sheets were pulled from the gallery
     on 2026-08-25 after Destin spotted them; a pixel-diff against the home screen found 27).
     **All of them were captured and verified later the same day by the rebuilt rig — see
     §6b; this list is kept as the record of what went wrong, not as an open gap:**
     right-click context menus (chat, session tab, composer, file row), the close-session
     prompt, the expanded "thinking" block, the Shift session switcher, composer
     attachments, the context pill, the theme-cycle editor, the first-run wizard, a
     permission prompt inside a chat, the stalled-turn card, the *Edit theme* screen
     reached via "Browse all themes →", Projects' *Add project* and project-detail
     overlays, Development's *Report a bug* / *Contribute* sub-screens, Model Providers'
     OpenRouter/Local tabs (the dialog itself was captured), and the marketplace
     detail/filter overlays in the workbench. Also
     pulled: the `scenario-refused/no-providers/stress` sheets — those scenarios change
     the resume list and permissions data, *not* the transcript, so they are identical to
     home by design (their real effect is visible in `main-resume-browser-stress`).
  7. **The Terminal view is blank in the workbench because the workbench has no
     terminal** (no PTY). An earlier draft of this report called it "reads as a crash" —
     that was the harness, not the app; withdrawn. The real terminal was reviewed on the
     Electron pass instead (§6b #15). Same caution for *Edit Quick Chips* showing no chips:
     the mock may simply not serve them to the editor — **verify in the real app before
     treating it as a bug.**
  8. The contrast probe **over-reports on glass** (meadow-mist): when a surface is
     translucent over a wallpaper the probe can't know what's behind it, so meadow's
     "408 failures" are mostly noise. Meadow findings below are from looking, not from
     the numbers.
  9. Halftone Dimension's headline text has a red/cyan fringe in screenshots. That is the
     theme's own `custom_css` text-shadow (a deliberate "chromatic" effect), not an app
     bug — but see T-4 for why it still matters.

---

## 1. The ten surfaces that most need work (ranked)

Ranked by how far the surface is from the rest of the app, weighted by how often a normal
user sees it. "Fix" names the design-guide rule (`G-n`) or a proposal (`P-n`, §7).

| # | Surface | What's wrong (what a user sees) | Picture | Fix |
|---|---|---|---|---|
| 1 | **Marketplace** | One bar holds 13 identical grey pills that mean three different things (tabs *Plugins/Themes*, categories *School…Home*, sorts *New/Popular/Featured*); the search box is smaller than the pills and has no icon; the "Explore everything" heading is followed by nothing until data loads; the Themes tab shows two empty-state messages at once ("0 results" *and* "Nothing matches those filters."). At phone width the title truncates to "Ma…". | `main-marketplace`, `main-marketplace-themes`, `narrow-marketplace`, `e-marketplace-plugins` | P-1, G-14, G-18 |
| 2 | **Your Library** | Two bare headings ("Favorites", "Installed") on an empty page: no explanation, no button, no link to the marketplace that sits one pill away in the header. 22px title over 12px tabs reads as scaffolding. Fully empty state is the *normal* state for a new user. | `main-library`, `main-library-themes` | P-2, G-18 |
| 3 | **Themes dialog (Settings → Appearance)** | Theme cards come in two heights — the active card gets a second row ("active" + pencil) and *its row-mate stretches to match*, showing an empty strip with a pencil — so the 2×3 grid looks broken; three stacked full-width buttons in three different styles ("Browse all themes →" outline-with-fill, "✦ Build New Theme with Claude" filled, "Browse Theme Marketplace" outline) with two of them near-duplicates. Editing a built-in opens a 590px-tall dialog that is 90% empty except a note saying you can't edit it. | `main-settings-appearance`, `main-theme-edit-builtin`, `main-theme-edit-community` | P-3, G-9, G-10 |
| 4 | **Model Providers** | Five button shapes in one dialog (outline chips *Add key/Test*, red outline *Remove*, filled pill *Connect to OpenRouter*, full-width outline *Add provider*, small *Detect* chip; in the real app, six filled-accent *Download*/*Add key* primaries stacked in one list); the dialog clips its bottom with a fade and no scrollbar; under the fade the workbench shows literal `Installed undefined · undefined · stopped` (mock data — the real app fills real values, but the component has no fallback for a missing value). | `main-settings-model-providers` (see the meadow-mist sheet's clipped bottom), `e-providers-local` | P-4, G-9, G-11 |
| 5 | **Projects header card** | Three button scales in one card: a big filled *New Conversation* top-right, tiny 11px outline *Rename* / *Remove from YouCoded* bottom-left, and a filled pill *Turn on sync for this project* nested inside a chip. Folder cards draw a small "tab" notch that overlaps the card border and reads as a glitch; document cards render raw Markdown at ~9px and cut mid-line. Also the **only full screen that ignores the theme wallpaper** (opaque in halftone and meadow while Library/Marketplace show it). | `main-projects`, `main-projects-conversations` | P-5, G-9, G-16, T-6 |
| 6 | **Empty / welcome screen** | *New Session* is a pale grey pill that reads as disabled next to the outlined *Resume Session* (the accent on dark built-ins is near-white, so "filled primary" = "grey"); the mascot in halftone is a blurred smear with two stray hairlines; in meadow *Resume Session* is dark text on translucent blue over blue trees. Real app adds: Settings is unreachable from this screen except via New Session → Model → "Manage models…". | `main-welcome-empty`, `e-empty`, `e-new-session-form` | P-6, G-8, G-13 |
| 7 | **Keyboard Shortcuts** | Uses the narrow "prompt" dialog width, so labels wrap to two lines while key chips don't, rows go uneven, and the list clips at "Send message" with no scroll cue — meadow-mist (a sans font) reveals an 11th row the monospace themes never show. | `main-settings-keyboard-shortcuts` | P-7, G-11 |
| 8 | **All-sessions popover** | Fixed width tuned to one font: monospace titles wrap 2–3 lines ("gpt-5.6 / debug / session") with the project name jammed beside them; the last row is clipped in half with no scroll indication. Meadow (sans) fits every row on one line. | `main-all-sessions-menu` | P-8, G-11 |
| 9 | **Skills drawer (bottom sheet)** | One dashed *＋ Add Skills* card alone at the far left of an empty 1400px row; category pills are the smallest text in the app (~11px) and use a different shape from every other filter pill; two unlabeled icon buttons live *inside* the search field; *★ Favorites only* orphaned at the far right. | `main-skills-drawer`, `narrow-skills-drawer` | P-9, G-14, G-18 |
| 10 | **Status bar** | 10px text; the model chip ("Sonnet \| Auto Effort") is orange-outlined while every other chip is grey, so the model reads as a warning; the theme-name chip looks like a button but is a label; at phone width it wraps to two rows with the theme chip orphaned. In halftone the bar floats centred in its own pill. | `main-home`, `narrow-home` | P-10 — **rejected 2026-08-26** (10px stays by decision); G-15 |

Honourable mentions (real, smaller): **Find bar** has no surface of its own and lands
*inside* the user bubble, truncating it (`main-find-bar`); **Edit Quick Chips** shows only
"+ Add Chip" and none of the seven chips in the strip (`main-edit-quick-chips`) — *verify in the
real app; may be mock data*; clicking **"Browse all themes →"** opens Library › Themes
behind the dialog but leaves the Themes dialog open on top (`main-library-themes`) — verify; **Tags & note** is a dialog inside a
dialog with 9px labels and a full-width *Done* footer no sibling has (`main-tags-note-popover`);
**Status Bar Widgets** clips its last section label ("CODE") with no scroll cue
(`main-customize-status-bar`); **Donate** and **Development** are the only dialogs with no
title row or ✕ (`main-settings-donate`, `overlays-development-bug-report`); **About** is a 500px wall
of legal text cut mid-word (`main-settings-about`); **Session Defaults** shows four model names
with no selected state and files harmless rows under "DANGER ZONE" (`main-settings-defaults`).

## 2. Same thing, drawn more than one way

These are the inconsistencies a design guide exists to end. Each row is one *concept* and
the ways it is currently drawn.

| Concept | Currently drawn as… | Where | Rule |
|---|---|---|---|
| **"This is selected"** | filled dark pill (header *Chat*), filled rect (model picker *Sonnet*), orange *outline* (status-bar model chip), nothing at all (quick chips; Session Defaults model row; Projects tabs in midnight where accent ≈ grey) | `main-home`, `main-model-picker`, `main-settings-defaults` | G-8 |
| **Primary action** | filled rounded-rect (*New Conversation*, *Sign in to YouCoded*), full-width filled (*Build New Theme*), full-width outline (*Add provider*, *Browse Theme Marketplace*), filled pill inside a chip (*Turn on sync*), outline pill (*+ Add file*), grey pill (*New Session*, *Submit* in AskUserQuestion) | `main-projects`, `main-settings-appearance`, `main-welcome-empty`, `tall-tool-gallery` | G-9 |
| **Permission buttons** | saturated filled green/blue/red pills (*Yes / Always Allow / No*) — the only place in the app with coloured filled pills; the *Stop* card uses a `|` divider between them in one row and none in the next | `tall-tool-gallery`, `tall-compare` | G-9 (documented exception, decision 61) |
| **Chips / pills** | quick chips 12px rounded-rect outline; status-bar chips 10px outline; tag pills 9px coloured; skills-drawer category pills ~11px filled; marketplace pills 12px filled-grey; header *Chat/Terminal* segmented filled | `main-home`, `main-skills-drawer`, `main-marketplace` | G-14 |
| **Search field** | Projects ~260px pill + filter icon; Session Files full-width pill + filter icon; Marketplace ~195px, no icon, smaller placeholder; Skills drawer full-width + magnifier + two icon buttons inside | `main-projects`, `main-session-files-pane`, `main-marketplace`, `main-skills-drawer` | G-12 |
| **Counts** | "Files 9" (tab numeral), "9 files" (stat row), "Session Files (4)", "0 results", "+9" (session strip) | `main-projects`, `main-session-files-pane`, `main-marketplace-themes` | G-19 |
| **Back / close** | full screens: text "Esc · Back to chat"; side panes: ✕; dialogs: ✕ (some with ‹ back, some with ⓘ); Donate/Development: nothing | everywhere | G-10 |
| **Screen header** | Projects: 16px title in a 50px bar; Library/Marketplace: 22px title in a 55px bar, Marketplace alone has a logo before the title | `main-projects`, `main-library`, `main-marketplace` | G-16 |
| **Tabs** | Projects: icon + label + count in a bordered group; Library: bare pills; Marketplace: visually identical to category/sort pills | same | G-14 |
| **List row** | Conversations/Context: bordered cards with icon square; Session Files: flat rows with dividers, no icon; Files: preview cards; Settings drawer: card rows with icon + subtitle + chevron; Resume browser: bordered cards with tag pills | `main-projects-conversations`, `main-session-files-pane`, `main-settings-drawer`, `main-resume-browser-stress` | G-17 |
| **Empty state** | Connect 4: icon + title + sentence + button (good); Marketplace: one centred sentence; Skills: dashed add-card; Library: nothing | `main-games-connect4`, `main-marketplace-themes`, `main-skills-drawer`, `main-library` | G-18 |
| **Dialog header** | title + ✕; title + ⓘ + ✕; title + subtitle; no header (Donate, Development); *Resume Session* has a "SHOW COMPLETE" toggle where ✕ should be and no ✕ | `main-settings-*`, `main-resume-browser` | G-10 |
| **Section label** | uppercase 10px ("MODEL", "RATE LIMITS", "CLAUDE CODE ⓘ") vs sentence case ("Password", "Keep awake") inside the same Remote Access dialog; "DANGER ZONE" over non-dangerous rows | `main-settings-remote-access`, `main-settings-defaults` | G-11 |
| **Radii in one view** | bubbles 16 / tool cards 8 / dialog buttons 6 / chips 4 / send button & *Done* full-round — all visible in one chat screen | `main-tool-cards-all-expanded` | G-3 |
| **Overlay backdrop** | built-ins dim; community packs blur the whole page (theme choice — fine, but the filters popover in halftone is opaque while the pane it sits on is glass) | `main-session-files-filter` (halftone) | T-5 |
| **Checkbox shape** | square in built-ins; round (radio-looking) in halftone and meadow because the packs set a global radius | `main-customize-status-bar` | T-3 |
| **Tool-card header** | consistent everywhere (`glyph | bold title ↳ dim path … chevron`) **except** AskUserQuestion, which has no path, a different glyph, and its chevron inline after the title instead of right-aligned; its body mixes bordered two-line radio rows with borderless one-line checkbox rows | `tall-tool-gallery` | G-20 |
| **The literal `\|` separator** in every tool-card header is `fg-faint` at **2.0:1** — decorative, but it is the third character in every card the user reads | `main-home` and 70+ others | G-6 |

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
  **Decided 2026-08-25: REJECTED** — both options were built and shown; the monochrome look
  is intentional and the fill/dim convention already tells selected from disabled. This was a
  convention argument, not a measured defect (see §5).
- **Light:** the user bubble is **solid black** — the heaviest object on the screen, heavier
  than any button (`main-home` light). The find bar disappears inside it (`main-find-bar`). The
  composer is a grey pill that reads disabled. "Signed in with your Claude account" is lime
  on light grey (lowest-contrast text in Settings). The *Priority* tag is `#c99700`-ish on
  light grey at **2.2:1**. The "Stopped before pushing code" amber heading is **1.5:1** on
  cream. The diff `+` marker green is **1.9:1**. → P-13 (light bubble weight — **rejected
  2026-08-25**, the solid bubble stays), **T-1**
  (semantic colours need light-theme variants).
- **Creme:** same as light plus: chevrons and the grey-dot icons in the Settings drawer are
  very low contrast on beige; *Remove* red and *Signed in* green look pasted on.
- **Disabled "Max" effort** is **2.3:1** in every theme with no explanation of why it's
  disabled (`main-model-picker`). → G-6.

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
  Status Bar Widgets vanish entirely (`main-customize-status-bar` meadow). **The app should
  guarantee** a minimum edge/panel contrast (a SURFACE rule in `contrast-rules.js`) so a
  pack cannot erase its own outlines.
- **T-3 Community radius cascades into controls.** Halftone/meadow set big radii and the
  square checkbox becomes a circle (looks like a radio). Checkbox should pin `--radius-sm`
  regardless of pack.
- **T-4 Halftone's text-shadow fringe** applies to *dialog titles* at 14px, where it reads
  as a rendering fault rather than an effect (`main-settings-buddy-floater` halftone). The
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
  disappears entirely (`narrow-home`).
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

Captured in `latency-*`: home, Settings → Account, Projects, Marketplace, Resume all show their
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

## 5. Ledger — proposals to approve by number, in the order to build them

Each row is a *visible* change; "Touches" says how many surfaces move at once. Numbers are
the original P-numbers (never renumbered — approve or reject by number, e.g. "all of A,
B without P-18"). The rows are grouped into **phases in build order**: each phase is one
worktree/PR, captured with `scripts/ui-review/run-review.sh` and decided on a review page
built by `scripts/ui-review/review-page.py` (rationale · 1:1 crops · decision control), and later
phases are judged against screens that already include the earlier ones. The reason for
the order is in each phase's first line.

**Tags (added 2026-08-25 after Phase A):** every remaining row starts with **[measured]**
(a number or a broken behaviour), **[judgment]** (a consistency/taste argument — the baseline
is not broken), or **[mixed]**. Phase A taught the difference: P-12 and P-13 were judgment
calls presented as defects and were rejected on sight. Judgment items get a light proposal
shown against a neutral baseline, and "no" is the expected answer for most of them.

### Phase A — tokens and theme guarantees (do first: every later before/after looks different once these land)

One edit at the token/theme layer moves every surface at once, so nothing in B–F should be
judged until these are in. (P-12 was the one real decision here and was rejected, so it
gates nothing below.) Verify with a **full** rig run (all plans, 6 themes).

| # | Proposal | Touches | Risk / what users will notice |
|---|---|---|---|
| P-11 | Tokens: `fg-muted` on raised surfaces (`inset`/`well`) is bumped to ≥4.5:1 in all four built-ins; `fg-faint` becomes *decorative-only* (dividers, disabled), never a spinner — spinners use `fg-muted`. | every surface | Muted text gets slightly lighter/darker; nothing moves. **Decided 2026-08-25: approved, shipped** (youcoded #327; pin: `theme-builtin-sources.test.ts` "built-in text ladder"). |
| P-12 | Dark built-ins get a real accent (a muted blue for midnight, a warm grey-blue for dark — chosen so `on-accent` stays white and links stay AA on inset), so *primary* and *selected* stop looking disabled. Alternative if Destin wants to keep the monochrome look: primary/selected gain a second signal (thicker border + bold) and "disabled" gets a dashed border. | every primary/selected in midnight & dark | This is the most visible change in the ledger — every primary button and selected tab in the two most-used themes changes colour. Halftone/meadow unaffected. **Decision needed: real accent, or monochrome + second signal.** **Decided 2026-08-25: REJECTED.** Both options built and shown (`phase-a-review.html`); Destin found the baseline fine and the options worse. Nothing measurable failed — the finding was a convention argument. Rule now in the guide (G-8): the dark built-ins are monochrome by design; disabled never paints a fill (`Button.test.tsx`). |
| P-13 | Light/creme user bubble → `inset` (grey) with `fg` text instead of solid black; assistant bubble unchanged. | chat, light + creme | The user's own messages stop being the darkest thing on screen. **Decided 2026-08-25: REJECTED** — user bubble unchanged in every theme. |
| P-16 | Theme-pack guarantees added to `contrast-rules.js`: edge/panel ≥ 1.3:1 (outlines survive), checkbox radius pinned, text-bearing glass ≥ 0.85 opacity or a scrim, accent may paint at most the documented set (G-8), terminal surface ≥ 0.9 opacity (the P-20 guarantee). Meadow Mist and Halftone fixed in `wecoded-themes` to pass. Lands last in this phase so it pins P-11/P-12's numbers as rules packs cannot regress. | packs | Meadow's buttons get borders back; halftone's checkboxes go square. **Decided 2026-08-25: minimal.** Only Meadow `edge-dim` 50% → 80% alpha (wecoded-themes #27 + the workbench copy in youcoded #327). Glass, Halftone and the validator untouched: a 1.5:1 outline rule fails 6 of 7 published packs (1.30–1.38) that look fine; Halftone checkboxes were already square. |

### Phase B — shared primitives (one component, many surfaces)

**Trimmed proposal (2026-08-25, after Phase A — historical; outcome in the rows):** build only the measured parts first —
P-15's title row + ✕ on the two headerless dialogs and the wrapping footers; P-18's literal
`|` → a divider element; P-10's 10px text → the 11px floor and the phone-width wrap. Show
the judgment parts (AskUserQuestion header layout, the orange model-chip outline, the
theme-chip treatment) as separate, clearly-tagged items on the same review page.

These are edits to a primitive that N surfaces inherit; doing them before the per-screen
work in C means those screens are drawn with the corrected parts. P-18 needs P-12 (its
*Submit* button only becomes visible with a real accent). Verify: `main` + `overlays` +
`tall` plans.

| # | Proposal | Touches | Risk / what users will notice |
|---|---|---|---|
| P-15 | **[measured]** two dialogs have no title and no ✕ (Escape is the only exit); footers wrap. Every dialog gets the same header (title · optional ⓘ · ✕): add it to Donate and Development; Resume Session moves "Show complete" below the search field and gets a ✕. About and Permissions get a scrollbar/fade. | 5 dialogs | Two dialogs gain a title row. **Decided 2026-08-26: approved as revised, shipped** (youcoded #328). Cancel removed wherever a ✕ now exists (Donate, Close session); Donate = one explanation + one action; "Don't show again" stays bottom-left. About/Permissions already had the fade — that part of the row was stale. **Decided 2026-08-26: approved as revised, shipped** (youcoded #328). Cancel removed wherever a ✕ now exists (Donate, Close session); Donate = one explanation + one action; "Don't show again" stays bottom-left. About/Permissions already had the fade — that part of the row was stale. |
| P-18 | **[mixed]** measured: a literal `\|` text character in every tool-card header; judgment: the AskUserQuestion header layout. Tool cards: AskUserQuestion adopts the standard header (glyph · title · ↳ first question · chevron right-aligned); its option rows share one row style; *Submit* uses `primary` (which P-12 makes visible). The literal `\|` separator in the header becomes a 1px divider element, not text. | every tool card | The pipe character disappears; AskUserQuestion looks like its siblings. **P-12 rejected → *Submit* already uses `primary`; nothing to add there.** **Decided 2026-08-26: approved in full, shipped** (youcoded #328 — the divider and the AskUserQuestion header/rows). **Decided 2026-08-26: approved in full, shipped** (youcoded #328 — the divider and the AskUserQuestion header/rows). |
| P-10 | **[mixed]** measured: 10px text is below the 11px floor (G-5) and the bar wraps to two rows at phone width; judgment: the orange outline and the theme-chip treatment. Status bar: all chips share one treatment (grey outline); the model chip signals "current model" with the model's *icon*, not an orange outline; the theme chip is a label (no border) with the cycle affordance on hover; text floor `text-2xs`; at phone width chips collapse to icons before wrapping. | Status bar (every session) | The orange outline disappears; text one step larger. **Decided 2026-08-26: REJECTED** — status bar unchanged. Built and shown (11px text, one-row phone layout, grey chips); Destin rejected the whole item. Do not re-propose the grey-chip half; the 10px text floor exception stands until he raises it. **Decided 2026-08-26: REJECTED** — status bar unchanged. Built and shown (11px text, one-row phone layout, grey chips); Destin rejected the whole item. Do not re-propose the grey-chip half; the 10px status-bar text stands by decision. |

### Phase C — the four screens users see most

Each is a single full screen with its own bar/header; they share the "one primary, one
secondary" rule (G-14) and the `EmptyState` primitive, so build them as one PR with four
numbered before/afters. P-2's tab style copies Projects', so P-5 goes first. Verify:
`main` + `marketplace` plans (default **and** `?marketplace=empty`).

| # | Proposal | Touches | Risk / what users will notice |
|---|---|---|---|
| P-3 | **[mixed]** measured: two buttons open the same screen, "Edit built-in" opens an empty dialog, cards jump height; judgment: the rest of the re-layout. Themes dialog: all cards one height (active card gets a badge + pencil *inline*, not a second row); stable order (active first, then favourites A–Z); the three CTAs become **one** primary (*Build New Theme with Claude*) + **one** secondary (*Browse themes* — marketplace *is* "all themes"); "Edit built-in" becomes a disabled pencil with a tooltip instead of an empty dialog. **Brief 2026-08-26 — correction:** the two Browse buttons do NOT open the same screen (Library › Themes vs Marketplace); the defect is that their names do not say so. Measured and confirmed: active card grows a row (~30 px) and stretches its row-mate; the pencil on any built-in opens a 588 px panel holding one sentence (all four built-ins are solid, so the editor has nothing to offer); the first button is a hand-rolled fourth button style. Brief: `2026-08-25-ui-audit/phase-c-brief.html`. **Decided 2026-08-27 (deck):** #1 yes, revised — cards show the theme's preview picture (same as Marketplace/Library cards; built-ins get bundled previews), fixed height, text row at the bottom; #2 NO — pencil stays (the empty editor is by design for flat themes, not a workbench artefact — offered as a follow-up question); #3/#4 yes — heading “Favorited Themes”, “Browse all themes” removed, Marketplace button above Build. **Round 2, 2026-08-27 (review deck):** #1 yes with refinements — star only on hover, taller cards so the preview fits (h-24); #3 yes. Q: pencil greyed with tooltip “Customization unavailable for this theme” on flat non-user themes (replaces the empty editor). **SHIPPED 2026-08-27 — youcoded #332.** | Appearance, Library › Themes | "Browse all themes →" disappears (it and "Browse Theme Marketplace" open the same screen). |
| P-5 | **[judgment]** Projects header card: one primary (*New Conversation*), *Rename/Remove* become `size="sm"` secondary/`danger-outline` at the same scale as *+ Add file*; the sync chip becomes a status row with a secondary button; folder-card notch removed (folder icon carries the meaning); preview text floors at `text-2xs`. Projects also adopts the wallpaper (`layer-screen`) like Library/Marketplace. **Brief 2026-08-26 — correction:** Rename/Remove are already the shared `size="sm"` Button (same as *+ Add file*); the folder nub was deliberately reworked after Destin's 2026-07-19 feedback — neither is proposed. What is measured: ProjectView's root is `fixed inset-0 bg-canvas` (opaque) while Library/Marketplace roots are transparent; two accent-filled buttons in one card. **Decided 2026-08-27 (deck):** #1 wallpaper NO, #2 sync button NO — Projects untouched. **CLOSED 2026-08-27 — declined, nothing shipped.** | Projects | The folder "tab" look goes away; in community packs Projects becomes translucent like its siblings. |
| P-1 | **[judgment]** the bar works; it is a consistency argument. Marketplace bar → three distinct groups: a **SegmentedTabs** for Plugins/Themes, **filter pills** for categories, a **Select** for sort; search field gets the shared `SearchFilterPill` shape; one empty state (`EmptyState` with a "Clear filters" action). **Brief 2026-08-26 — correction:** New/Popular/Featured picks are multi-select filters, not sorts — there is no sort, so no Select. Measured: “0 results” + “Nothing matches those filters.” render together with no Clear action; “Explore everything” renders alone while loading/unreachable; phone width truncates the title to “Ma…”. **Decided 2026-08-27 (deck):** all five yes — Plugins/Themes segmented switch, shared search pill, one EmptyState with Clear filters, Loading/Error states, phone title. **Round 2:** #1 yes — the type switch is the SAME pill as the Library's (icon + label + count) and both say “Plugins”, never “Skills”; #2–#5 yes as built. **SHIPPED 2026-08-27 — youcoded #332.** | Marketplace | Visible re-layout of the bar; muscle memory for the two tabs is preserved (same position). |
| P-2 | **[measured]** a new user's Library shows nothing at all — no copy, no way forward. Library → `EmptyState` under each heading ("No favourites yet — ★ a skill in the Marketplace" with a button); tab group adopts Projects' bordered icon+label+count style. Scope is the **empty** states only — with content the Library already matches the Marketplace cards (§6c #29). **Brief 2026-08-26 — it is a bug:** `LibraryScreen`'s `Section` has empty-state copy that has never rendered — `React.Children.count(false)` is 1, so `hasContent` is always true. Fix + pinning test regardless of styling. **Decided 2026-08-27 (deck):** #1 yes (bug fix + EmptyState + Browse button + pinning test), #2 yes (Projects-style pill tabs with icon + count). **Round 2:** both yes as built; tab renamed “Plugins”. **SHIPPED 2026-08-27 — youcoded #332.** | Library | New users finally see something; nothing moves for users with content. |
| P-21 | **[measured]** a hardcoded gold border ignores every theme; ragged card heights; "1 installs". *(new, from §6c)* Marketplace cards: the featured hero's hardcoded gold border becomes `edge` (the pack's `accentColor` may tint only the eyebrow and dot pager — T-1); theme cards get one fixed height with the description clamped/reserved at 2 lines (#27); install/rating counts pluralise correctly ("1 install", G-19). **Brief 2026-08-26 — refinement:** the card BOXES are equal (grid stretch); the content is ragged (description and likes line each render only when present). All three featured entries carry an `accentColor` (gold, blue, green) used only for the hero border. “installs”/“likes” never pluralise (2 sites in `MarketplaceCard.tsx`). **Decided 2026-08-27 (deck):** #1 yes (hero border = edge), #3 yes (plurals); #2 “tell me more” — re-explained with a picture in the review deck. **Round 2:** #1, #3 yes as built; #2 built as a mock-up for the next deck (theme cards reserve the description lines + counts row). **SHIPPED 2026-08-27 — youcoded #332.** | Marketplace | The gold outline disappears; theme rows stop being ragged. |

### Phase D — chat-adjacent surfaces (the composer, the transcript, the drawers)

Single surfaces each, but all sit next to the transcript, so their before/afters share
one screen and one PR. P-6 is now only the Settings gear (its primary-treatment half died
with P-12). Verify: `main` + `overlays` plans, plus the
`electron-live-session` plan for P-20 (the workbench has no terminal).

| # | Proposal | Touches | Risk / what users will notice |
|---|---|---|---|
| P-6 | **[measured]** Settings is unreachable from the welcome screen without expanding the form. Welcome screen: *New Session* uses the real primary treatment from P-12; *Resume Session* stays secondary; add a Settings gear to this screen's corner (today Settings is unreachable here without expanding the form). | Welcome | A gear appears on the welcome screen. **P-12 rejected → P-6 is now only the Settings gear; the primary treatment stays as is.**  **Decided 2026-08-27 (`phase-d-brief.html`): YES, revised** — not a lone gear: the welcome screen gets the same bare frame the Terminal view has (Settings gear, Projects folder, minimize/maximize/close) — no session switcher, no status-bar chips, no chat bar. |
| P-19 | **[measured]** chip names truncate after ~4 characters; text below the floor; broken thumbnails. Composer attachment chips: icon · name (≥ 12 characters before truncating) · always-visible ✕, `md` radius, `text-2xs`; broken thumbnails fall back to the file-type icon. | composer | Attachments become readable.  **Decided 2026-08-27: OTHER — mock-ups first.** Several chip designs, one per file kind, before anything is built: name as a small strip at the bottom of the card; a real preview for most kinds where cheap (at least image / markdown / text); a plan for every other kind. |
| P-14 | **[measured]** the find bar covers the first message. Find bar gets its own `panel` surface anchored top-right *above* the transcript instead of inside the user bubble. | find | The bar stops covering the first message.  **Decided 2026-08-27: YES** — the find bar gets its own row above the messages (browser-style); the chat shifts down while it is open. |
| P-9 | **[mixed]** measured: category pills are the smallest text in the app; judgment: the rest. Skills drawer: category pills use the shared filter-pill shape/size; the two icon buttons leave the search field and sit beside it as `size="icon"` buttons with names; the *Add Skills* card becomes an `EmptyState` centred in the row when there are no skills, and a normal last card when there are. | Skills drawer | Search field looks like every other one.  **Decided 2026-08-27: pills YES (14 px, Marketplace shape, Favorites-only in the row); icon buttons NO — they stay inside the search field but must show their name/action on hover; Add Skills YES** (last card of the same grid; standard empty message when nothing is installed). |
| P-20 | **[measured]** the terminal grid stops at 2/3 of the pane; unreadable over wallpapers. Terminal: the terminal grid fills the pane width; the terminal surface takes the ≥ 0.9 `panel` opacity guarantee from P-16 under wallpaper packs. | Terminal | No more empty right third; readable over wallpapers.  **Decided 2026-08-27: OTHER on both.** Width: may be a capture-environment artefact (the terminal was also too short in that shot; Destin has not seen either in his app) — reproduce in a dev instance before building anything. Wallpaper backing: he wants to see a few renderings (opacity variants) before committing. |

### Phase E — small dialogs and popovers

Contained, low-risk, no dependencies; batch into one PR. Verify: `main` + `overlays`.

| # | Proposal | Touches | Risk / what users will notice |
|---|---|---|---|
| P-4 | **[mixed]** measured: renders the word `undefined`, no scrollbar; judgment: button vocabulary. Model Providers: one button vocabulary per card (secondary chips for *Add key/Test*, `danger-outline` *Remove*), *Add provider* becomes a secondary button (not full-width outline), never render `undefined` (fall back to "—"), dialog scroll shows a scrollbar. | Model Providers | None visible beyond consistency. |
| P-7 | **[measured]** rows wrap in a dialog too narrow for its own content. Keyboard Shortcuts → `panel` (420px) size; rows grid-aligned (label column + key column); dialog scrolls with a visible scrollbar. | one dialog | Wider dialog. |
| P-8 | **[measured]** rows wrap to two lines. All-sessions popover width becomes `min(28rem, 88vw)` and rows truncate to one line with a title tooltip; scroll cue via bottom fade. | one popover | Rows stop wrapping. |

### Phase F — phone width (last: it is judged on the screens the earlier phases produce)

One PR; the edge-fade + horizontal-scroll pattern it introduces is also the fix for the
Marketplace rails (§6c #26), so ship both together. Verify: `narrow` plan, and the
`marketplace` plan for the rails.

| # | Proposal | Touches | Risk / what users will notice |
|---|---|---|---|
| P-17 | **[measured]** clipping and wrapping at 390px with no scroll affordance. Phone width: session tab keeps ≥ 8 characters before collapsing; quick-chip row gets an edge fade + horizontal scroll (same pattern applied to the Marketplace rails, which clip their last card on desktop too); status bar collapses chips to icons; model picker wraps its options; full screens drop "Esc ·" on touch layouts; coarse-pointer hit areas extended to chips and chevrons (the Toggle already has the mechanism). | narrow layouts + Marketplace rails | Android/phone only, except the rails' fade, which appears on desktop. |

### Summary

| Phase | Items | Why here | Rig plans to re-run |
|---|---|---|---|
| A | P-11, P-12, P-13, P-16 | **DONE 2026-08-25** — P-11 shipped; P-12, P-13 rejected; P-16 minimal (Meadow outline only) | full run |
| B | P-15, P-18, P-10 | **DONE 2026-08-26** — P-15 shipped (revised), P-18 shipped, P-10 rejected | main, overlays, tall |
| C | P-3, P-5, P-1, P-2, P-21 | the four most-seen screens (+ marketplace card fixes) | main, marketplace (default + empty)  **DONE 2026-08-27 (#332; P-5 declined)** |
| D | P-6, P-19, P-14, P-9, P-20 | everything beside the transcript | main, overlays, electron-live-session | **DECIDED 2026-08-27** — building P-6 (frame), P-14, P-9 pills + Add Skills; mock-ups owed for P-19 and P-20.2; P-20.1 to reproduce first |
| E | P-4, P-7, P-8 | contained dialogs/popovers | main, overlays |
| F | P-17 | phone width, judged last | narrow, marketplace |

Each phase is built in a worktree and decided on a review page (`/ui-review` §4), per the `ui-mockup`
skill; the guide (`2026-08-25-ui-design-guide.md`) gets its rule text finalised as each
phase's decisions land.


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

## 6b. Second pass — the surfaces the first rig could not open (2026-08-25, later the same day)

After Destin pointed out the mislabelled sheets, the capture driver was rebuilt to verify
every shot (target must exist, an `expect` selector must hold, pixels must differ from the
baseline; misses are quarantined and listed in `coverage-second-pass.md`). With that rig
**every surface previously listed as "unreviewed" was captured and verified in all six
themes** (29 surfaces × 6 = 174 sheets, 0 missed — `overlays-*` in the gallery), plus a
**live session on the real app** (`live-*`: 12 of 14 verified; the two misses are a context
menu on an *empty* chat, which has no bubble to open one on, and the Shift switcher with a
single session, which correctly has nothing to switch to). Two workbench gaps were closed
in code rather than worked around: `?firstRun=<STEP>` now renders the onboarding wizard
(youcoded branch `chore/workbench-review-switches`), and the stalled card / permission
request turned out to live on the *native* fixture session, one tab over.

Findings from this pass (numbered on from §1; same ledger rules):

| # | Surface | What's there | Picture | Fix |
|---|---|---|---|---|
| 11 | **Close-session prompt** | Good anatomy (title + session name, tags/note card, *Mark complete* toggle-row, footer) — but the primary **"Close session" wraps to two lines** and *"Don't show again"* wraps to two lines beside its toggle, so the footer is the tallest row of the dialog. Confirmed on the real app too. | `overlays-close-session-prompt`, `live-close-session-prompt` | P-15 (footer: `prompt` width with `size="sm"` buttons, "Don't show again" as a single-line ghost toggle row above the footer) |
| 12 | **Report a bug / Feature request** | The only dialog with **no title row and no ✕** — just a Bug/Feature segmented control, a textarea and a disabled *Continue*. Escape is the only way out. | `overlays-development-bug-report` | P-15 |
| 13 | **Status Bar Widgets → Theme cycle editor** | Expands *inline* inside an already-clipped dialog, so the theme checklist is cut off after two rows; you scroll a dialog to find a scrollable list inside it. | `overlays-theme-cycle-editor` | P-15 (dialog → `document` size, or the editor becomes its own `prompt` dialog) |
| 14 | **Composer attachments** | Attachment chips are ~48px squares: the document chip truncates its name to "design…", the image chip shows a broken-image glyph when the thumbnail can't load, and the remove ✕ only appears on hover. | `overlays-composer-attachments` | new **P-19**: chip = icon · name (≥ 12ch) · ✕ always visible, `md` radius, `text-2xs` |
| 15 | **Terminal view (real app)** | The terminal fills only the **left two-thirds of the pane** — the right third is empty wallpaper — and it is painted straight onto the theme wallpaper with a light scrim, so Claude Code's TUI text sits on a busy image (Golden Sunbreak). The Terminal/Chat toggle, session pill and status bar are consistent with chat. | `live-terminal-view` | new **P-20**: terminal fits its pane width; terminal surface gets `panel` opacity ≥ 0.9 in packs (T-5 rule) |
| 16 | **Stalled-turn card** (native session) | A red-outlined pill with braille spinner + "Provider may have stalled — no response for 4s" + *Retry* (filled) + *Stop* (outline). Reads clearly; but it is the only red *outline* container in the app and *Retry* is a filled grey pill (the dark-accent problem again, #6/P-12). | `overlays-native-session-stalled-and-permission` | P-12; keep the card |
| 17 | **First-run wizard** | Five steps captured. Clean, centred, one card per step — the best-behaved screen in the app *because* it has almost nothing on it. Two nits: the progress bar reads "100%" on step 1 (mock value, but the bar has no step labels so a user can't tell where they are), and *Log in with Claude* is the same grey filled primary as everywhere else on dark themes. | `overlays-first-run-*` | P-12; add step "1 of 5" text to `ProgressBar` label |
| 18 | **Project switcher** | Command-palette style ("Jump to project…", RECENT, avatar-letter rows with `files · chats` hint, ✓ on current, "＋ Add a project" footer). Well made — and a **fifth list-row style** (avatar square + two-line + right meta) the guide should name as the "picker row". | `overlays-projects-switcher` | G-17 (add "picker row" as the fourth named row; reuse for Resume and All-sessions) |
| 19 | **Add a project** | Two option cards (name field with inline *Create* via `InputGroup`; folder picker) + a sync `Callout` + a lone *Cancel* footer. Correct primitives throughout; the *Create* inside the field is disabled-grey and there is no ✕ (Cancel only). | `overlays-projects-add-project` | none — matches G-11; P-12 makes *Create* visible |
| 20 | **Conversation preview / Context file overlay** | Full-screen overlay with title + *Edit* (primary) + *Reveal* + *Copy path* + ✕ — the same header as the file viewer, which is right. Body is a path heading over an empty area in the mock. | `overlays-projects-conversation-preview`, `overlays-projects-context-editor` | none |
| 21 | **Context menus** (bubble, composer, code block, file pill) | Compact, one style everywhere: icon · label · shortcut, `panel` surface, `md` radius. The only inconsistency is that "Ask about this" has an icon while the shortcuts column is empty for it. | `overlays-ctx-menu-*` | none — codify as the menu anatomy (G-21) |
| 22 | **Shift session switcher** | Same popover as *All sessions* with the current row highlighted — consistent; inherits finding #8 (wrapping rows). | `overlays-shift-session-switcher` | P-8 |
| 23 | **Context popup (real app)** | Big green "100%", eyebrow *STATUS BAR SHOWS* + segmented Percentage/Token counts, a split *Compact conversation* button, a `danger-outline` *Clear and start over* with explainer. Matches the guide (the split button is the documented exception). | `live-status-context-pill` | none |
| 24 | **Live status bar (real app)** | With a real session the bar holds eight chips (model, mode, tags, 5h, 7d, context, git branch, theme, version·label). Consistent chip treatment; but 10px text across ~1,100px of chips is the densest strip in the app. | `live-live-chat-empty` | P-10 |

Side-finding (not UI): the dev instance's Claude Code session logged `SessionStart:startup
hook error — bash: ~/.claude/plugins/youcoded-core/hooks/session-start.sh: No such file or
directory` (`live-terminal-view`). The youcoded-core clone is gone (deprecation plan) but a
hook still points at it in shared settings. Worth a ROADMAP bug.

## 6c. Marketplace and Library with real cards, six themes (2026-08-25, after PR #326)

With registry data the Marketplace's default view is not the flat grid the real-app pass
showed — it is a **featured layout**: a hero card ("FEATURED · Civic Report · View
details" with dot pager), the filter bar, then horizontal rails ("Destin's picks", "If you
journal", "For everyday life"). That changes finding #1: the 13-pill bar is still the
problem, but the surface underneath is well structured. New findings:

| # | Surface | What's there | Picture | Fix |
|---|---|---|---|---|
| 25 | **Featured hero border is a hardcoded gold** (`accentColor` from `featured.json`) in every theme — it sits beside Halftone's pink, Meadow's green and Light's black primaries as the only gold object on the screen. The hero's *View details* button correctly takes the theme, which makes the border look more wrong, not less. | `marketplace-marketplace` | **P-21** (T-1 semantic set: `accentColor` may tint the eyebrow/dot pager, never the border; border = `edge`) |
| 26 | **Rails clip their last card with no affordance** — "Superpowers" is cut at the right edge in every theme with no fade, arrow or scrollbar. Same defect as the phone-width quick-chip row (P-17). | `marketplace-marketplace` | P-17 (its edge-fade + scroll pattern, applied to rails) |
| 27 | **Theme cards have two heights** on the Themes tab: entries without a description (Cotton Candy Sky, Devil's Garden, Meadow Mist) end at the author line, the others run two lines further, so rows are ragged. | `marketplace-marketplace-themes` | P-21 (G-16 cards: fixed card height, description clamps to 2 lines or reserves them) |
| 28 | The two theme previews that were **blank on the real app** (Devil's Garden, Kuromi Dreamer — §6) **load fine in the workbench browser**, so the missing images are not missing files: verify the Electron image load (CSP / `theme-asset://` / timing) rather than the registry. | `marketplace-marketplace-themes` vs `e-theme-marketplace` | ROADMAP bug, verify in a dev instance |
| 29 | **Library with content** is consistent with the Marketplace cards (same species, `INSTALLED` badge, tag chip) in all six themes; the *Favorites* section is a single card on its own row, which reads fine when populated — finding #2 is now only about the **empty** state (`?marketplace=empty`). | `marketplace-library`, `marketplace-library-themes` | P-2 scope narrowed to empty states |
| 30 | **Skills drawer with skills** fills its row with real cards and reads well; the drawer's category pills are still the smallest text in the app (#9 stands). | `marketplace-skills-drawer` | P-9 |
| 31 | **Meadow Mist / Halftone**: cards are translucent over the wallpaper and stay readable; the Library header in Meadow is a glass band with dark title text over sky — same T-5/T-6 note as before. Plugin-detail overlay is opaque in both packs (consistent with G-16's "text-bearing layers ≥ 0.85"). | `marketplace-marketplace-detail` | none |

Real numbers note: the cards' "1 installs / ★★★★ (1)" come from the **live** marketplace
worker (the stats context fetches it directly, even in the workbench), so those are real
counts, not fixture values. "1 installs" (singular/plural) is a copy bug: → P-21 (G-19 counts).

## 7. Method notes for the next pass

- The rig now lives in the repo: `scripts/ui-review/` (README there) and the `/ui-review`
  skill. `bash scripts/ui-review/run-review.sh <worktree>` reproduces this whole review in
  ~15 minutes: every plan × 6 themes, each shot self-verified, sheets + `coverage.md` +
  `contrast.md` + `gallery.html`. The real-app plans (`electron-*`) need the dev instance
  from the README. `--reports-only` rebuilds the reports after a hand re-run of one plan.
- The first version of this rig (in `scratch/ui-audit-2026-08-25/tools/`, kept for the
  record) had no verification and produced the 40 mislabelled sheets described in the
  fidelity notes. Everything cited in this document was re-checked against verified sheets.
