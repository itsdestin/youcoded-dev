---
status: active
date: 2026-09-24
source: docs/active/design/2026-09-23-ui-element-review/guide-draft.md
related: docs/active/design/2026-09-23-ui-element-review/decisions.md, docs/active/design/2026-09-23-ui-element-review/inventory/*.md
---

# Guide contradictions and gaps — audit

Read-only audit. Every finding below was either read directly from source in this pass
(file:line quoted) or taken from the `inventory/*.md` research files **and then spot-verified**
against source and a real screenshot before being repeated here — several were re-checked
because the task brief warned the inventory contains at least one false claim (see Coverage).
Paths are relative to `youcoded/desktop/src/renderer/` unless a full path is given.

The guide describes a **target**. Almost nothing below is "wrong code" — it's the gap between
where the app is today and where the guide says it should end up. Findings are grouped so the
fix work can be sized: **shared-component fix** (change one file, every site updates) vs.
**hand-rolled, N sites** (each call site needs its own edit).

---

## Per rule

### Full-screen title strip
Guide: name centered in the top strip, 14px medium, with the screen's icon; way out is a
**filled** small button reading **"Esc · Back to chat"** (key first), top right.

- **The guide's own cited reference doesn't match the guide.** `components/ScreenBand.tsx:48`
  renders the exit button as `<div className="flex bg-inset rounded-md p-0.5"><button>` — an
  **inset quiet pill**, not filled accent — and the text order is **`{backLabel}` then `· Esc`**
  (`ScreenBand.tsx:58-62`), i.e. "Back to chat · Esc", word-first — the opposite order the guide
  specifies ("Esc · Back to chat", key first). Screens: Project View, an opened Page.
  Screenshot: `scratch/element-sweep/shots-main/light/projects.png` (referenced in
  `inventory/shells-icons-nav.md`, not re-opened this pass — button text/order confirmed from
  source, which is authoritative here).
  **Shared-component fix** — one file, 2 screens.
- **No icon next to the centered title at all.** `ScreenBand.tsx:48` renders only
  `{title}` (whatever the caller passes) — there is no icon slot in the band. The guide's own
  worked example, "Pages → any page," was checked and confirmed: `PageHost.tsx` passes a plain
  string title with no icon element. **Shared-component fix.**
- **Marketplace and Library don't use the strip at all — confirmed still true, decisions.md
  already flags this as pending work, not a false claim.** `MarketplaceScreen.tsx:403` and
  `LibraryScreen.tsx:178` render their own **left-aligned** `<h1 className="text-xl
  font-semibold">` (20px, not 14px; left, not centered), inside a wallpaper-backed shell with no
  drag-region top strip. Exit button: `variant="ghost"` text button reading "Esc · Back to
  chat" (`LibraryScreen.tsx:203-210`, `MarketplaceScreen.tsx:441-450`) — text order is correct
  here (key first) but the button is **ghost, not filled**, and sits inside a `p-3` content row,
  not a window drag strip. Screenshots (opened this pass):
  `scratch/element-sweep/shots-main/light/marketplace.png`,
  `scratch/element-sweep/shots-main/light/library.png` — both confirm a large left-aligned
  title and a quiet outlined/ghost "Esc · Back to chat" button, not a filled pill in a centered
  strip. **Hand-rolled, 2 sites** (each its own header block).
- **Pages' own list screen ("Manage pages") also doesn't use ScreenBand**, even though "Pages"
  is the guide's named reference: `components/pages/PagesView.tsx:59-61` renders a left-aligned
  `<h2 className="text-base font-semibold">` (16px, not 14px) with a 16px icon to its left (not
  centered), a flat `border-b` header (no window-chrome strip), and the exit button is
  `variant="ghost"` reading **"Esc · Back"** (`PagesView.tsx:73`) — missing "to chat" entirely,
  a third wording. **Hand-rolled, 1 site.**
- **FirstRunView's wordmark is a fourth, unrelated title treatment** —
  `components/FirstRunView.tsx:378`, `text-4xl font-semibold` (36px) — not covered by the
  full-screen-title rule at all (onboarding, arguably out of scope, but the guide doesn't say so).

**Count:** 1 shared primitive whose own reference implementation contradicts the written rule
(icon + button order/fill), plus 3 hand-rolled full-screen headers (Marketplace, Library, Pages
list) that haven't adopted the primitive at all — matches `decisions.md`'s note that
"Marketplace and Library move to it," but the audit also found Pages' own list view is not yet
migrated either, which the decision table doesn't mention.

---

### Popups and side panels (title / close / divider / fade)
Guide: 16px semibold title, ✕ 28px soft-hover square, tapered divider (inset 16px, fading over
first/last 8%), scroll-edge fade (42px, softened 4% at the sides), always closes on Esc, "never
hand-roll a popup shell."

- **The shared `<Dialog>` primitive matches the rule closely**: `components/ui/Dialog.tsx:250`
  — `<h2 className="text-base font-semibold text-fg truncate">` (16px semibold), `CloseButton`
  at `:256`, tapered gradient line via `.dialog-header::after` in `components/ui/Dialog.css`.
  56 call sites use it correctly (`rg -c "<Dialog\b"`, per `inventory/shells-icons-nav.md`,
  confirmed by reading `Dialog.tsx` in full this pass). **This is the compliant baseline** —
  everything below is a site that still bypasses it.
- **7 hand-rolled modals bypass `<Dialog>` entirely** — same job (centered card + backdrop),
  each with its own width, title size/weight, and (in 2 cases) no close button at all:
  `components/marketplace/SignInPromptModal.tsx:39` (14px semibold, has ✕),
  `components/marketplace/ReportReviewButton.tsx:145` (14px semibold, has ✕),
  `components/project-view/AddProjectModal.tsx:124` (14px medium, **no ✕**, Cancel-only),
  `components/project-view/ImportFileDialog.tsx:80` (18px semibold, **no ✕**, Cancel-only),
  `components/project-view/ProjectSwitcher.tsx:110` (no title row),
  `components/project-view/HowContextWorksPopup.tsx:388` (16px semibold, closest match),
  `components/marketplace/MarketplaceFilterBar.tsx:217` (bottom sheet, see below). None of the
  7 get the tapered-line/scroll-fade CSS — that's scoped to `.dialog-header`/`.dialog-scroll`
  only. **Hand-rolled, 7 sites** — none can be fixed by editing `Dialog.tsx`; each needs to be
  rebuilt on the primitive.
- **Settings drawer's own outer header has no tapered divider or ✕-matching title weight.**
  `components/SettingsPanel.tsx:280` — title `<h2 className="text-base font-medium">` (16px
  **medium**, not semibold — one step lighter than Dialog's title) and `.settings-drawer-header`
  has no `::after` rule in `globals.css` (checked directly: only `.dialog-header` and
  `[data-session-files-header]` get one). Screenshot confirmed this pass:
  `scratch/element-sweep/shots-main/light/settings-rows.png` and
  `scratch/element-sweep/shots-main/midnight/settings-drawer.png` — "Settings" title visible,
  no fading line beneath it. Every *child* popup opened from this drawer (About, Preferences,
  Development, etc.) is `Dialog`-based and DOES get the tapered line, so the outer drawer and
  its own children visibly disagree with each other one click apart. **Hand-rolled, 1 site**
  (the drawer shell), but it's the app's single most-opened popup family.
- **The tapered-divider CSS itself exists in 3 independent copies**, not 1: `.dialog-header`/
  `.dialog-scroll` (Dialog.css), `[data-session-files-header/scroll]` (SessionDrawer, same CSS
  file, reuses the selectors), and a separate copy with its own custom properties in
  `components/ResumeBrowser.css` (`--resume-fade-top/bottom`). Visually identical, three
  maintenance sites. **Confirmed by reading both CSS files directly this pass** — this corrects
  nothing (the inventory's own note already flagged and fixed a prior researcher's false claim
  that this CSS was unshipped; it is live).
- **Bottom sheets have no ✕ and no rule in the guide at all** (guide only names dialogs/panels,
  not sheets): `CommandDrawer` (`components/CommandDrawer.tsx`) has a grab-handle, no title, no
  close control of any kind. `MarketplaceFilterBar.tsx:217`'s `FilterSheet` has a title but only
  "Clear all" text + a bottom Apply button, no ✕. Screenshot confirmed:
  `scratch/element-sweep/shots-marketplace-overhaul-narrow/light/filters-narrow.png`.
- **3 more hand-rolled close ✕ look-alikes** don't match the shared `<CloseButton>` (28px, SVG
  X, 12px radius): `components/ConnectGithubModal.tsx:205` (`✕` text glyph, 24px, 6px radius),
  `components/tags/SessionTagsChip.tsx:86` / `components/tags/TagChip.tsx:36` (`×` text glyph,
  28px, 4px radius — visibly squarer), `components/game/ArcadeShell.tsx:367` (real SVG X, but
  8px radius not 12px). Plus a text-only "Esc · Close" link (no icon) on 3 Marketplace overlay
  sites (`MarketplaceScreen.tsx:794`, `MarketplaceDetailOverlay.tsx:160`,
  `FileViewerOverlay.tsx:88`) — this one is already flagged for conformance in `decisions.md`
  (B-1). **Hand-rolled, 4+3 = 7 sites.**

**Count:** 56 sites compliant via `<Dialog>`; ~14 sites (7 hand-rolled modals + Settings drawer +
2 bottom sheets + 4 close-button look-alikes) still don't match, plus a triplicated CSS
mechanism behind the ones that do.

---

### Headings (Large / Title / Small label)
Guide: Large 18px medium `fg`; Title = the popup title above; Small label **12px medium,
`fg-muted`, normal case, no letter-spacing**; a small label heading a reading section (About's
"Disclaimer", "Privacy") also gets a soft underline.

- **The dominant "section label" style in the app is the opposite of the rule on 3 axes at
  once.** Read directly this pass at `components/AboutPopup.tsx:104`:
  ```
  <h3 className="text-3xs font-medium text-fg-muted tracking-wider uppercase">Disclaimer</h3>
  ```
  `text-3xs` = **10px**, not 12px; **`uppercase`**, not normal case; **`tracking-wider`**, not
  no-tracking; and **no underline at all**, even though this exact heading ("About's
  Disclaimer") is the guide's own named example for the underline treatment. This one class
  string repeats **91 times** across the renderer (full site list in
  `inventory/headers-text.md` appendix; representative: `CopyPicker.tsx:21`,
  `ContextPopup.tsx:192`, `CommandDrawer.tsx:338,351`, `AccountSection.tsx:419,606,722`,
  `ProvidersSection.tsx:185,457`, `PreferencesPopup.tsx:126,155,173,213`,
  `SettingsPanel.tsx:679,716,1871,2008` and 75 more). Screenshot confirmed this pass:
  `scratch/element-sweep/shots-main/light/marketplace.png` shows the same family as "FEATURED".
  **Hand-rolled string repeated at 91 sites** — no shared constant exists for the dominant
  variant, so this needs either a new shared component + 91 call-site swaps, or a global
  find/replace of one exact class string (mechanically easier, but still touches 91 files).
- **4 more near-duplicate "eyebrow" sizes do the identical job**, none matching the guide's
  12px/normal-case target either: `text-2xs` (11px) + `font-medium` + uppercase (5 sites);
  `text-2xs` uppercase with no `font-medium` (9 sites); `text-4xs` (9px) uppercase (11 sites);
  Marketplace's own `text-sm`/`text-xs` (14px/12px) + `text-fg-dim` (not `fg-muted`), no
  `font-medium`, still uppercase (8 sites: `marketplace/FeedbackSection.tsx:249`,
  `marketplace/CapabilityList.tsx:38`, `MarketplaceDetailOverlay.tsx:405,507`,
  `MarketplaceScreen.tsx:857,1062`, `MarketplaceFilterBar.tsx:275`, `MarketplaceHero.tsx:77`).
  Confirmed visually: `marketplace.png`'s "FEATURED" label is noticeably larger/bolder than a
  Settings eyebrow in the same app. **Hand-rolled, ~33 more sites**, 4 more distinct variants.
- **Large heading (18px medium)** — matches at some sites (`text-lg font-semibold` empty-state
  headlines, Marketplace rail titles at `text-lg font-medium`), but the app's `<h3>` tag alone
  covers **at least 6 unrelated weights/sizes** for jobs that range from a tiny settings
  sub-label up to a big empty-state headline (`text-xs font-medium` through `text-lg
  font-semibold` — see `inventory/headers-text.md` "plain bold/semibold" family, ~30 of 72
  `<h3>` sites). None is consistently "the" Large heading the guide defines.
- **No shared `Heading`/`SectionHeading` component exists anywhere in `components/ui/`** — every
  level is a hand-rolled className string at each call site (confirmed: searched
  `components/ui/` directly, no match). This means even the 91-site dominant eyebrow has no
  single file to fix — a global class-string replace is the only mechanical option, and it
  won't add the missing underline treatment (that needs new JSX, not just new classes).

**Count:** ~124 known section-label sites across 5 competing recipes, 0 of them landing on the
guide's exact 12px/normal-case target; the guide's own named worked example (About →
Disclaimer) is currently the furthest from the rule (uppercase + tracked + no underline).

---

### Text and numbers (colors, 11px floor, counts)
Guide: body 14px `fg`; one grey (`fg-muted`) for secondary, `fg-faint` only for disabled;
nothing below 11px carries information; counts: "word, smaller faint number" for tabs/labels
("Files 17"), "bold number, grey word" for summary lines ("17 files"), no brackets/chips.

- **The 11px floor is broken by the dominant eyebrow itself** (10px, `text-3xs`, 91 sites,
  carries real information — a section's name) and by its 9px variant (`text-4xs`, 11 sites,
  e.g. `ThemeScreen.tsx:190,505,553`, `SpecialistsSection.tsx:385,389,392`). Both are
  information-bearing labels, not decoration, so both violate "nothing below 11px carries
  information" directly. **Hand-rolled, 91 + 11 = 102 sites** (same sites as the heading finding
  above — one fix covers both rules).
- **Three separate "muted secondary text" tokens are used interchangeably**, not the guide's
  single `fg-muted`: `text-fg-muted` (750 sites), `text-fg-2` (309 sites), `text-fg-dim` (277
  sites) — all render as near-identical greys but are not the same token, so a future theme
  that widens the gap between them will show visibly different secondary-text weight depending
  on which screen you're on. Marketplace leans on `fg-dim` where the rest of the app uses
  `fg-muted` (e.g. its eyebrows, above). **Hand-rolled across the whole renderer — not
  mechanically fixable by one file; would need a per-site judgment call on which token was
  actually meant.**
- **Counts render at least 4 different ways, only one of which matches either guide-approved
  style.** Confirmed both by source and by screenshot this pass:
  - Matches the guide (word, smaller faint number): the "All 42" / "Plugins 28" SegmentedTabs
    counts, confirmed visible in `scratch/element-sweep/shots-main/light/marketplace.png` and
    `library.png` (`components/ui/SegmentedTabs.tsx:123-129`). **This one is already correct —
    the shared primitive.**
  - Contradicts: inline parenthetical **"Session Files (17)"** — confirmed directly this pass at
    `components/SessionDrawer.tsx:725`: `` `Session Files${listSettling ? '' : ` (${listedArtifacts.length})`}` `` — brackets, exactly what the guide forbids. Also `game/GameLobby.tsx:533`
    ("Friends (N)"), `project-view/tabs/FilesTab.tsx:1025`.
  - Contradicts: plain-word metadata with no number/word split at all — "5 skills", "1 skill ·
    1 command" in Marketplace card footers, confirmed visible in the same `marketplace.png`
    screenshot, sitting directly beside the correctly-styled "All 42" tab count on the same
    screen.
  - Contradicts: a bordered `Badge` chip (`components/ui/Badge.tsx`, "4W - 2L" style) — the
    guide says "no chips" explicitly.
  - **Hand-rolled, 3+ competing conventions beyond the one compliant primitive** — no single fix;
    each family needs its own call-site rewrite.
- **Status-bar usage percentages duplicate a number two ways at once**: a colour-coded
  `ProgressBar` in Settings vs. a bare "42%"/"61%" text chip with no bar in the bottom status
  bar for the identical 5h/7d figures (`components/StatusBar.tsx`) — not itself a guide
  violation (guide doesn't cover progress bars), but worth noting since it's the same numbers
  styled two unrelated ways on screen at once.

---

### Buttons and controls
Guide: shape = theme's control radius everywhere (built-in themes: Round, 14px), never a
hard-coded pill; one filled main action; everything else outlined; destructive red, filled only
in a confirmation step; close = ✕ only; segmented/filter controls follow the shared
`SegmentedTabs`/`FilterChip`.

- **A fully hard-coded `rounded-full` pill is a *documented, intentional* exception in the
  primitive itself** — confirmed by reading `components/ui/Button.tsx` directly this pass:
  ```
  xl: 'text-base px-6 py-3 font-semibold rounded-full',   // Button.tsx:99
  ```
  with a source comment explicitly calling this "the one documented pill exception" for the
  first-run sign-in CTAs (`Button.tsx:85-86`), plus another comment at `:130-134` documenting
  why `rounded-full` beats `rounded-lg` in CSS specificity for this one size. **The guide's
  "Nothing keeps a hard-coded pill" rule does not mention or carve out this exception** — either
  the guide is wrong to say "nothing," or the exception needs removing from `Button.tsx`. This
  is a direct rule-vs-code conflict, not a stale/unmigrated site — the code is working as
  designed and the design predates this guide draft. 5 real call sites
  (`components/FirstRunView.tsx`) + **3 more files that hand-copy the identical pixel recipe as
  a local `PILL` constant instead of importing `size="xl"`** (`first-run/LocalModelSetup.tsx:31`,
  `first-run/LocalAppConnect.tsx:17`, `first-run/ApiKeySetup.tsx:13`) — those 3 are a
  maintenance trap even if the exception itself is kept, since they'll silently drift the next
  time `Button.tsx`'s pill recipe changes.
- **A third, unrelated pill size exists nowhere in the primitive**: the floating Cancel/Save/Edit
  cluster in the artifact file editor, `components/SessionDrawer.tsx:1252-1277` —
  `px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg`, matching neither the `xl` pill nor
  any other Button size. **Hand-rolled, 1 site, 3 buttons.**
- **Marketplace's "Integration" detail actions hand-roll their own button classes** at an 8px
  radius (not the theme's control radius) and use `hover:opacity-90` — a hover treatment
  `Button.tsx`'s own docstring documents as **explicitly rejected app-wide** ("fades the label
  too... breaks glow-theme box-shadows," confirmed by reading the comment directly). 8 sites, one
  function: `components/marketplace/MarketplaceScreen.tsx` `IntegrationActions()`, lines
  890-943. **Hand-rolled, 8 sites, 1 function** — fixable by rewriting that one function onto
  `<Button>`.
- **Close (✕) still renders 5 different ways** for the identical job — see the Popups section
  above (4 hand-rolled glyphs + 1 text-link family); repeated here because it's also a direct
  "Close: the ✕ button, never a letter or text" violation. The 3 text-glyph close buttons
  (`✕`/`×` characters, not the shared SVG) and the 3-site "Esc · Close" text link are the clearest
  violations of "never a letter or text."
- **28×28px icon-only square buttons draw 3 different corner radii**, none matching the shared
  primitive's `rounded-lg` (12px): `SessionTagsChip.tsx` (`rounded-sm`, 4px), `ZoomOverlay.tsx`
  (bare `rounded`, 6px), `ArcadeShell.tsx` (`rounded-md`, 8px) — 6 sites, all directly
  replaceable by `<Button variant="ghost" size="icon">` unchanged (confirmed footprint-identical
  in `inventory/buttons-controls.md`). **Hand-rolled, 6 sites, mechanically trivial fix.**
- **"Pick one" controls render at least 5 different ways beyond the intentional
  `SegmentedTabs` bare/contained/pill trio**: a bordered 2-segment bar
  (`components/ContextPopup.tsx:163-178`), bare icon-only toggle with no container
  (`project-view/tabs/FilesTab.tsx:933-956`), and pill mini-tabs with count badges
  (`components/SyncPanel.tsx:1248-1277`, which visually resembles `FilterChip` more than
  `SegmentedTabs`). **Hand-rolled, 3 sites** — each doing the "switch between views" job the
  guide explicitly says should go through `SegmentedTabs`/`FilterChip`.
- **Icon-toggle "favorite"/"like" controls are hand-rolled independently** (`FavoriteStar.tsx`,
  `LikeButton.tsx`, 4 sites total) instead of the shared `<Button size="icon">` toggle pattern
  `VoiceButton`/`ZoomPill` already use correctly.
- **Secondary/outlined rule is well-adopted for the primary `<Button variant="secondary">`
  family** (61+50+20 = 131 sites across sizes, confirmed in `inventory/buttons-controls.md`
  Appendix A) — this part of the guide is already mostly true today, the exceptions are the
  ~11 "text/link button" sites (`link-control` class, bare underlined text with no border) used
  for "Clear"/"Learn more" actions beside a primary button, which read as bare text rather than
  outlined, confirmed visible in `scratch/element-sweep` assistant-specialists shots per the
  inventory (not re-opened this pass).
- **Destructive rule matches well**: `variant="danger"` (filled, 8+ sites) and
  `variant="danger-outline"` (13 sites) both exist and are used correctly per the sampled sites
  in `inventory/buttons-controls.md`; no contradiction found in the source read this pass.

**Count:** shape/radius rule broken by 1 documented primitive exception (5+3 sites) + 1 unrelated
hand-rolled pill (3 buttons) + 8-site hand-rolled Integration buttons + 6-site icon-button radius
drift + 3-site hand-rolled segmented controls + 4-site icon-toggle drift ≈ **30+ sites**, split
across ~7 unrelated hand-rolled locations plus 1 documented primitive exception that directly
contradicts the guide's absolute wording.

---

### Cards
Guide: anything you open/install/pick from a grid is a **raised card** — panel colour, thin
`edge-dim` border, **medium shadow** `0 4px 20px rgb(0 0 0 / .16), 0 1px 3px rgb(0 0 0 / .08)`,
theme's card radius, 12px gap. **No flat, tinted, or borderless variants.**

- **The shadow value itself is not yet implemented anywhere.** Read directly this pass: the
  app's one shared "floating surface" class, `.layer-surface` (`styles/globals.css:1291-1301`,
  confirmed by reading the file), uses:
  ```
  box-shadow: 0 8px 32px rgba(0, 0, 0, var(--shadow-strength, 0.15));
  ```
  This is the *old* "heavy Marketplace shadow" `decisions.md` (`F-3`) explicitly says the new
  medium shadow should replace — but `.layer-surface` is the primitive every "raised card" in
  the app inherits from (Marketplace/Library grid cards, Project hero banner, and every
  `OverlayPanel`-based popover). **Zero sites currently render the approved medium shadow** —
  this is a shared-component fix (edit `.layer-surface` in `globals.css` once), but it means
  100% of today's "raised" cards are visually the pre-decision heavy-shadow look, not a partial
  migration. Screenshot confirmed: `scratch/element-sweep/shots-main/light/marketplace.png` and
  `library.png` show the current (heavier) shadow on every grid card.
- **`.layer-surface` itself is used two visually incompatible ways**, which the guide's blanket
  "raised, medium shadow, no flat variants" doesn't anticipate: Marketplace/Library grid cards
  keep the class's full 16px radius + shadow; but Skill/command drawer tiles
  (`components/CommandDrawer.tsx:147`, `components/SkillCard.tsx:148`) and Project-Files
  thumbnail cards (`project-view/tabs/FilesTab.tsx:693,706,710`) apply the SAME class with
  `!rounded-lg` (forced to 12px) **and `style={{ boxShadow: 'none' }}`** — an explicit,
  inline-style opt-out of the shadow the guide says every card must have. **Hand-rolled
  overrides, confirmed at 2 component families, ~7 call sites.**
- **At least 7 more card-like surfaces are flat/bordered/tinted with no shadow at all**, directly
  contradicting "no flat, tinted or borderless card variants": Pages grid card (`bg-panel
  border border-edge`, no shadow — `pages/PagesView.tsx:118,134`), Context file row
  (`project-view/tabs/ContextTab.tsx:141,146`), Session/conversation card (sits on `bg-inset`,
  not panel — `SessionCardDetails.tsx:34-35`, used by `ResumeBrowser.tsx` and
  `ConversationsTab.tsx`), Empty-state card (`project-view/ProjectsEmptyCard.tsx:32`), Theme
  preview tile (necessarily unstyled — paints the previewed theme's own colour), Arcade
  game-picker tile (`bg-well`, `game/ArcadePicker.tsx:80,99,115`), Chat tool-call `ToolCard`
  (has **no background at all** by default — `components/ToolCard.tsx`). Screenshot confirmed
  this pass for the Resume/session-card family via `scratch/element-sweep/shots-main` (per
  inventory; card style visible as flat-bordered, no shadow, matching source). **Hand-rolled,
  ~7 distinct component families**, each its own fix — none of these share a class with
  `.layer-surface`, so fixing the shadow token doesn't touch any of them.
- **Card background alone fragments across 4+ tokens** for what is often the identical "static
  content box" job: `bg-panel`, `bg-inset`, `bg-well`, and translucent `bg-inset/40`–`/50` — no
  documented rule for which a new card should use, and the guide only specifies "panel colour"
  for the one card type it defines (open/install/pick-from-grid), leaving every other card-like
  box (rows, banners, empty states) without guidance — see Gaps below.
- **Card radius has 5 unreconciled tiers in active use**: 4px (`ToolBody`'s read-preview box),
  6-8px (OpenTasksPopup rows, TagManagerPopup), 12px (the de-facto default for most cards), 16px
  (`.layer-surface`'s own default, Marketplace/popovers), 24px (chat-bubble family). The guide
  says "the theme's card radius" (singular) without naming which built-in-theme pixel value that
  is for cards specifically (Round: buttons 14px is named; cards/popups "18-24px" is a range, not
  a single value) — partly a gap, partly explained by the above hand-rolled variance.
- **12px card gap**: confirmed matching in the primary Marketplace/Library grids (`gap-3` =
  12px, `MarketplaceGrid.tsx:58`), but `CommandDrawer.tsx` uses `gap-2` (8px) for its main "All"
  grid and `gap-1.5` (6px) for the pinned/category subsections directly below it in the **same
  file** — 2 gap values on what reads as one continuous grid.

**Count:** the guide's exact shadow value exists nowhere in the codebase yet (1 shared-token fix
covers the compliant-radius cards); at least 9 more card families across ~15+ call sites are
flat/bordered/no-shadow and would each need a rebuild onto the raised-card recipe, not a token
tweak.

---

### Lists and menus (boxed settings rows vs plain pick-one rows)
Guide: settings-style lists → boxed rows (`SettingRow`); pick-one menus/switchers → plain rows,
no box/line, hover highlights, selected visibly different from hovered.

- **The boxed-row rule is well-adopted for Settings itself**: `SETTING_ROW_BASE` (`bg-inset/50
  rounded-lg`) via `components/ui/SettingRow.tsx`, confirmed visible in
  `scratch/element-sweep/shots-main/light/settings-rows.png` (opened this pass — each Settings
  entry is its own soft rounded box). **One acknowledged, code-commented exception**:
  `components/ProvidersSection.tsx:303` hand-rolls a near-identical row instead of using
  `SettingRow` — flagged in the code itself as "grandfathered legacy" and exempted from a test
  (`setting-row-authority.test.ts`), with a comment warning other screens not to copy it. This
  is the one inconsistency the codebase already knows about and has fenced off rather than
  fixed.
- **The "status label is a pill" rule and the boxed-row rule collide in the Settings screenshot
  itself.** In `scratch/element-sweep/shots-main/midnight/settings-drawer.png` (opened this
  pass), the "Backup & Sync" row shows a **red circular "1" badge plus plain red text "•
  Sync Failing"** — not a pill at all, just colored text with a leading dot. This is really a
  Status-and-notices violation (see below) sitting inside an otherwise-compliant boxed row.
- **Pick-one menu/switcher rows render at least 5 unrelated ways**, not the guide's single
  "plain row, hover only" recipe: `SessionDrawer.tsx:1386-1389` (bordered box wrapper, `hover`
  and `active` states **resolve to the identical class** — `bg-inset` — so a hovered row and the
  actually-selected row look the same; confirmed by reading the file), `SessionDrawer.tsx:864`
  (nested list, same collision on `bg-well`), `project-view/ProjectSwitcher.tsx:176-182` (same
  collision pattern on `bg-inset`), `SessionStrip.tsx:2320-2392` ("All Sessions" dropdown, same
  collision), vs. `model/ModelPicker.tsx:641-656` and `FolderSwitcher.tsx:265,300` which DO give
  selection a distinct accent tint. **4 of the app's "pick a session/project" rows make the
  currently-selected item visually indistinguishable from a merely-hovered one — a usability
  bug, not just a style drift, hiding inside the "plain rows" recipe.** **Hand-rolled, 4 sites
  with the collision, 2 sites without it (so a fix pattern already exists in the codebase to
  copy from).**
- **A third row family the guide doesn't name exists between "boxed" and "plain": card-per-row.**
  Resume Session browser and Project View's Conversations tab wrap each row in its own bordered,
  gapped card (`SESSION_CARD_SURFACE`, `SessionCardDetails.tsx:34-35`) — visually closer to a
  stack of small cards than either a boxed-settings-list or a plain pick-one menu. The guide's
  two-recipe rule doesn't say which of the two this should collapse into (see Gaps).
- **Context Menu (right-click) renders in the wrong theme for one of its two variants** — not a
  guide-rule violation exactly, but relevant to "hover highlights the plain row" since the whole
  menu is unreadable in the broken state: `ContextMenu.tsx` is one component, yet
  `scratch/element-sweep`'s dark/midnight screenshots of the chat-text variant
  (`ctx-menu-assistant-bubble.png`, referenced in `inventory/menus-search-fields.md`, not
  re-opened this pass) render a plain **white** panel with black text in both dark themes, while
  the editable-field variant renders correctly themed. Flagged as a likely real bug, not
  independently re-verified visually in this pass — treat as unconfirmed until re-screenshotted.

**Count:** boxed-row rule matches with 1 known/fenced exception; plain-row rule is violated by a
real hover/selected collision at 4 sites (usability risk) plus a whole unnamed third row family
(card-per-row) used at 2+ major surfaces.

---

### Status and notices
Guide: status label = small tinted pill, label's colour, normal case, live status carries a
coloured dot inside the pill; passive notices = `Callout` (tinted box, matching border, no
action slot).

- **"Installed" — the guide's own named example — is not tinted in the label's colour.**
  Confirmed by reading `components/marketplace/MarketplaceCard.tsx:71-76` directly:
  ```
  neutral: 'bg-inset text-fg-2 border border-edge',
  ```
  "Installed" uses the `neutral` tone (grey, not a status colour) — confirmed visually this pass
  in `scratch/element-sweep/shots-main/light/marketplace.png` and `library.png`: the "INSTALLED"
  pill is plain light grey, not green/tinted. The guide's own worked example for this rule
  ("Installed") currently renders as an *untinted* pill. Whether "Installed" should be green
  (an "ok" status colour) or intentionally neutral is a product call the guide doesn't make —
  see Gaps.
- **3 independent hand-rolled recipes for "tinted status pill"** exist for the same job, with
  different hues for the same meaning: `MarketplaceCard.tsx`'s `STATUS_TONE_CLASS` (green-500,
  amber-500, red-500), `StatusBar.tsx:463`'s `warnStyles` (red-400, amber-700 — different shade
  of both red and amber for the same danger/warn meaning), and `StatusBar.tsx:147`'s
  `PERMISSION_DISPLAY.unknown` (a literal `color: '#DD4444'` hex, re-typing a value the
  `--color-red-400` token already holds). **Hand-rolled, 3 recipes, 6+ call sites.**
- **The same underlying fact ("sync is failing") is shown 3 different visual ways on screen at
  once**, none of them the guide's tinted pill: a plain corner dot + "• Sync Failing" text (no
  pill) in the Settings row (confirmed visually this pass, see Lists section above), a separate
  red numeric "1" badge next to that row, and a bordered text pill in the bottom status bar
  (`StatusBar.tsx` `warnStyles.danger`). **Hand-rolled, 1 fact, 3 unrelated renderings.**
- **A dead colour class**: `components/marketplace/FeedbackSection.tsx:274,295` use
  `text-danger` — confirmed no `--color-danger` token exists anywhere in `globals.css`'s
  `@theme` block and no `tailwind.config.*` file exists in the repo, so this class most likely
  resolves to no colour at all; every other error message uses `text-destructive-fg`. Not
  independently re-verified live in a browser this pass (would need a render), but the token's
  absence was confirmed by direct search.
- **`Callout` itself matches the guide well** — one component, 3 tones, no action slot, ~35 uses
  across ~19 files, confirmed by reading `components/ui/Callout.tsx` in full this pass. **2
  hand-rolled duplicates found**: `SettingsPanel.tsx:1825` (byte-identical geometry to
  `Callout tone="info"`, built as a raw `<div>`) and `ModelPickerPopup.tsx:493` (Callout-shaped
  but a different amber shade and a `rounded` 4px radius instead of Callout's `rounded-lg` 12px,
  plus its own extra internal divider). **Hand-rolled, 2 sites — trivial swap to `<Callout>`.**
- **Corner "attention" dots** (unread/needs-a-look badges on the Settings gear, an account row, a
  marketplace auth chip, a recording mic) are copy-pasted independently 6 times with 3 unrelated
  meanings (needs-attention / connected / recording) sharing the same visual recipe — not a named
  guide rule, but worth flagging since it's the same "small coloured dot" family the guide does
  regulate for session status.
- **Toasts have no rule in the guide at all** — see Gaps.

**Count:** the guide's pill-status rule is contradicted by its own worked example (Installed =
neutral, not tinted); 3 more hand-rolled status-pill recipes and a dead colour class exist beyond
it. `Callout` is the guide's best-adopted single rule in this pass, with only 2 duplicate sites.

---

### Principles 1–7 (cross-cutting)
- **Principle 1 ("find the job first... a new look is only justified by a new job")** — directly
  contradicted by the sheer number of near-duplicate recipes doing the identical job found in
  every section above (5 close-button styles, 5 eyebrow styles, 4 count conventions, 5 card
  backgrounds) — this is the guide's own thesis statement, and it's the single most-violated
  rule in the app today by count.
- **Principle 2 ("theme paints and shapes everything... never a fixed pill or pixel radius on a
  control")** — contradicted by the documented `xl` pill exception in `Button.tsx` itself (see
  Buttons section) and by hard-coded raw hex colours found in 3 places (`FolderSwitcher.tsx`'s
  `bg-[#44A05C]`/`bg-[#DD4444]` status dots, `StatusBar.tsx:147`'s `#DD4444`) that bypass theme
  tokens entirely, confirmed via the notifications inventory and this pass's token search.
- **Principle 3 ("quiet by default... headers are one line")** — largely holds; no multi-line
  header was found in this pass.
- **Principle 4 ("three levels of heading, no more")** — directly contradicted; the Headings
  section above documents at minimum 5 competing "small label" recipes and 6+ weights sharing
  one `<h3>` tag, i.e. far more than three visual levels exist today even though the guide
  intends exactly three.
- **Principle 5 ("cards stand out; rows stay soft")** — partially holds (Settings rows are soft,
  Marketplace cards are raised) but is undercut by the ~9 flat/borderless "card" families in the
  Cards section that are neither clearly a card nor a row.
- **Principle 6 ("one main action per view; everything else outlined")** — no view was found in
  this pass with 2 simultaneous filled primary buttons, so this one appears to hold; the
  "Everything less important... outlined, never bare text" half is contradicted by the ~11
  `link-control` bare-text-underline "Clear"/"Learn more" sites noted under Buttons.
- **Principle 7 ("every theme, every width")** — the theming side is broadly consistent per the
  token system (`--panel`, `--accent`, etc. threaded through every primitive read this pass);
  the width side has real gaps — several narrow-width variants documented above (Library/
  Marketplace's narrow `CloseButton` swap, PagesView's `hidden sm:inline-flex` Esc button) exist
  as one-off decisions per screen rather than a shared narrow-width recipe, so "every width" is
  being solved N times, not once.

---

## Where the guide is silent or ambiguous

1. **Dialog/modal footer layout has no rule.** The guide says "one filled button per view" and
   "everything less important... outlined," but never states button order (confirm-then-cancel
   vs cancel-then-confirm), spacing between footer buttons, or alignment (left/right/split). In
   the app today this is solved 3+ incompatible ways for the same "Cancel/Save" pair: the
   ordinary rectangular `secondary`+`primary` `<Button>` pair (most dialogs), the floating pill
   cluster in the artifact editor (`SessionDrawer.tsx:1252-1277`), and a `divide-x` split footer
   in `ResumeBrowser.tsx:55` (`MENU_FOOTER`). A builder given only the guide could not tell which
   of these to copy for a new dialog.
2. **No spacing/gap standard beyond the one card-gap number (12px).** The guide never says how
   much space goes between a dialog's body sections, between a row's title and its subtitle, or
   between a group's label and its content. In the app, `cards-rows-spacing.md`'s spacing table
   shows wildly different values doing the same "space between two related pieces of
   information" job: `Dialog.tsx`'s body `space-y-5` (20px) vs. a SettingRow's implicit
   (unspecified) row gap vs. `CommandDrawer.tsx`'s own two different grid gaps (`gap-2` and
   `gap-1.5`) in the same file. A new screen has nothing to copy from the guide itself.
3. **No rule for ordering text inside a card** (title vs. count vs. description vs. tags). The
   Marketplace card puts "Civic Report — INSTALLED ★" then a permission/author row, then a
   description, then a stats footer; the Library card drops the permission/author row entirely;
   neither order is written down anywhere the guide points to, so a new card type has to guess
   by copying whichever existing card looks closest.
4. **Floating/anchored menus (dropdowns, context menus, kebab menus) aren't covered at all.**
   The guide's "Lists and menus" section only names two jobs — settings lists and "pick-one
   menus and switchers" (a list *inside* an open panel). It says nothing about the *container*
   for a popover menu itself (shadow, radius, padding, whether it's portaled). The app has 5
   different hand-rolled menu-container recipes for this exact job (`OverlayPanel`/
   `.layer-surface` vs. a hand-rolled `bg-panel border shadow-lg z-[9000]` recipe used
   independently by `OverflowMenu.tsx` and `SessionStrip.tsx`'s session switcher vs.
   `.layer-surface` applied to a plain non-portaled `absolute` div in
   `MarketplaceAuthChip.tsx`/`GameLobby.tsx` — confirmed via `inventory/menus-search-fields.md`,
   not independently re-verified this pass but internally well-sourced with file:line evidence).
5. **Bottom sheets have no recipe at all.** `CommandDrawer` and Marketplace's `FilterSheet` are
   the app's only two "rises from the bottom" surfaces and disagree on every dimension (flush
   edge vs. margin on all sides, grab-handle-no-title vs. titled-header, dismiss-by-drag vs.
   dismiss-by-Apply-button) — the guide's popup section doesn't mention sheets as a distinct
   category, so it's unclear whether a sheet should follow the Dialog recipe, something else, or
   remain its own thing.
6. **The full-screen recipe only specifies the top strip — not the content area underneath it.**
   The app has 4 different full-screen content-area treatments (a framed inset pane with rounded
   corners, a flat full-bleed canvas, a wallpaper-backed absolute-scroll area, a centered-card
   onboarding wizard) and the guide gives no guidance on which a new full screen should use.
7. **Segmented tabs have 3 named variants (bare/contained/pill) with no rule for which job gets
   which.** The guide says filters/tabs "follow the shared `SegmentedTabs`" but doesn't say when
   to use `bare` vs. `contained` vs. `pill` — in the app, similar "switch between 2-4 views" jobs
   currently land on different variants seemingly by which screen wrote the code first.
8. **Loading/progress states have no recipe at all** — no spinner, progress-bar, or skeleton
   guidance anywhere in the guide, despite the app having 4 unrelated spinner "species"
   (BrailleSpinner, a CSS ring, an inline SVG, a spinning Unicode glyph) doing the identical
   "this is working" job.
9. **Toasts/transient confirmations aren't mentioned.** The app has exactly one `Toast`
   primitive (`components/ui/Toast.tsx`) but the guide's "Status and notices" section covers
   pills and Callouts only — a builder wouldn't know from the guide alone that a toast is even
   an approved pattern, or what it should look like.
10. **Which "card that isn't clickable" jobs still need the raised-card recipe is ambiguous.**
    The guide's card rule is scoped to "anything you open, install or pick from a grid" — but
    the app has several static, non-clickable content boxes doing an adjacent job (a project
    hero banner, an empty-state panel, a context-file row) that aren't obviously "opened" or
    "picked from a grid" yet visually read as cards. The guide gives no answer for whether these
    should be raised cards, soft rows, or a third untouched category — which is exactly why the
    inventory found 9 different flat/bordered "card" recipes with no shared rule among them.
11. **Icon sizing and stroke width have no standard.** 82 files hand-draw inline SVGs (confirmed:
    no icon library dependency exists — `rg` for `lucide-react` returns zero matches); three
    adjacent sizes (12/14/16px) are all common with no documented rule for which context gets
    which, and stroke width varies across 12 distinct values app-wide. The guide never mentions
    icons except "with its icon" for the full-screen title, which itself (per the Full-screen
    section above) has no icon slot in its own reference implementation.
12. **Tooltip mechanism is unaddressed.** The app ships a themed `Tooltip`/`AnchorTip` pair
    alongside 182 native `title="…"` attributes across 67 files (confirmed count via
    `rg -c 'title="' -g '*.tsx'`, matching the inventory's own citation of a prior "~231 across
    63 files" measurement, i.e. a large, standing population, not stragglers) that render as an
    unthemed OS tooltip and are invisible on touch. The guide doesn't say whether native `title=`
    is acceptable anywhere.
13. **Status-colour exact values aren't pinned.** The guide correctly says status colours are
    "the only fixed hues," but doesn't name the hex/token values — in the app this has let "ok"
    drift to at least 3 different greens (`bg-green-400`/`#4CAF50` the app token, a raw
    `bg-[#44A05C]` in `FolderSwitcher.tsx`, `bg-green-500` in `StatusStrip`) and "warning" drift
    across amber-400/500/700 plus yellow and orange, all meaning the same thing on different
    screens.

---

## Coverage

**Read directly in full or in targeted ranges this pass** (not solely from the inventory):
`guide-draft.md`, `decisions.md`; `components/ScreenBand.tsx` (full); `components/pages/
PagesView.tsx` (header range); `components/library/LibraryScreen.tsx` (header range);
`components/marketplace/MarketplaceScreen.tsx` (header range); `components/ui/Dialog.tsx`
(header/title range); `components/ui/Button.tsx` (pill/xl/shadow-comment ranges);
`components/marketplace/MarketplaceCard.tsx` (STATUS_TONE_CLASS); `components/ui/Callout.tsx`
(full); `styles/globals.css` (`.layer-surface` definition and shadow tokens);
`components/AboutPopup.tsx:100-108`; `components/SessionDrawer.tsx:720-730`;
`components/ui/Checkbox.tsx` (radius lines).

**Screenshots opened this pass** (Read tool, real PNGs, not just referenced from the inventory):
`scratch/element-sweep/shots-main/light/marketplace.png`,
`scratch/element-sweep/shots-main/light/library.png`,
`scratch/element-sweep/shots-settings-rows/light/settings-rows.png`,
`scratch/element-sweep/shots-main/midnight/settings-drawer.png`. These confirm: Marketplace's
"FEATURED" eyebrow and left-aligned h1 title; the "Esc · Back to chat" ghost (not filled) exit
button on both Marketplace and Library; the "INSTALLED" pill's neutral (untinted) grey; the
"All 42"/"Plugins 9" count style matching the guide; the boxed Settings rows; the plain-red-text
(not pill) "Sync Failing" status in the Settings row; no visible tapered divider under the
Settings drawer's own header.

**Not independently re-screenshotted this pass** (taken from `inventory/*.md` with file:line
source evidence, treated as reliable because the inventory's own methodology cross-checked
itself — see its "Correction to a subagent's initial finding" note on the tapered-divider CSS,
which this audit re-verified by reading `Dialog.css`/`ResumeBrowser.css` directly and confirms
is accurate): the ContextMenu dark-theme rendering bug, the hover/selected collision in
SessionDrawer/ProjectSwitcher/SessionStrip rows (confirmed by reading the class strings directly
this pass, not by screenshot), the 7 hand-rolled Dialog-bypass modals' individual screenshots,
Meadow Mist theme renders specifically (this pass opened light and midnight; meadow-mist shots
exist at the same paths under `scratch/element-sweep/shots-*/meadow-mist/` but were not opened
individually — spot-checking one wallpaper theme was judged lower priority than verifying the
rule-by-rule source claims within the time available).

**Not covered by this pass or the inventory**: Android-specific rendering (shared React
component tree per `youcoded/CLAUDE.md`, but the Kotlin-hosted WebView chrome around it was not
inspected); `src/renderer/dev/` (excluded per instructions — it contains a separate, larger,
still-unshipped design-exploration surface for card/divider variants that would give false
signal if included); any screen behind a state this audit didn't reach (e.g., an actively
syncing/erroring Backup & Sync wizard step, a live game board, an open Buddy floater window —
several of these are noted "screenshot not found" in the underlying inventory files and remain
genuinely unverified, not assumed-fine).

**On the "at least one false claim" warning**: the only self-corrected claim found in the source
material was the inventory's own documented correction (a prior researcher wrongly concluded the
tapered-divider CSS was unshipped; the file's current text already fixes this and cites the
correction). This audit re-verified that correction independently by reading `Dialog.css` and
`ResumeBrowser.css` directly and confirms the corrected version is accurate. No additional false
claim was found in the specific items this audit chose to spot-check (full-screen title button
text/fill, dialog title styling, card shadow value, status pill tint, eyebrow label styling,
count-format examples) — all matched their cited file:line exactly. Claims not directly
re-verified in this pass (see above) should still be treated as inventory-sourced rather than
audit-confirmed.
