# Headers & Text Styling Inventory

Scope: every header level (window/app title → eyebrow label) and every distinct
body/secondary/caption/code/link text treatment in `desktop/src/renderer`
(excluding `src/renderer/dev/`). Method: read the type scale in
`styles/globals.css`, then `rg` every size/weight/case/tracking/color
combination, grouped by the job the text does (not by file). Counts are from
`rg -c` on the exact class string; "sites" = JSX call sites, not files.

## Type scale (from `styles/globals.css`)

The whole renderer is **monospace** — `--font-sans` and `--font-mono` both
resolve to `'Cascadia Mono', 'Cascadia Code', 'Fira Code', monospace`
(globals.css line 368). There is no separate UI/reading font; headers, body
copy, code and numbers all share one typeface, differentiated only by
size/weight/color.

Named sizes, smallest to largest (Tailwind defaults except the three
app-specific ones, which are called out):

| Token | Pixels | Note |
|---|---|---|
| `text-4xs` | 9px | app-specific (globals.css `@theme`) |
| `text-3xs` | 10px | app-specific |
| `text-2xs` | 11px | app-specific |
| `text-xs` | 12px | Tailwind default |
| `text-sm-tight` | 13px | app-specific, "22 sites, all Project View body copy" per its own comment |
| `text-sm` | 14px | Tailwind default — the dominant body-text size |
| `text-base` | 16px | Tailwind default |
| `text-lg` | 18px | Tailwind default |
| `text-xl` | 20px | Tailwind default |
| `text-2xl` | 24px | Tailwind default |
| `text-3xl` | 30px | Tailwind default |
| `text-4xl` | 36px | Tailwind default |

Color tokens used for text (light theme values shown; each shifts per theme):
`--fg` #1A1A1A (primary), `--fg-2` #444444, `--fg-dim` #535353, `--fg-muted`
#5E5E5E, `--fg-faint` #989898, `--on-accent` #F2F2F2 (text on filled accent
surfaces), `--link`/`--link-hover`, `--code` (computed per-theme).
`--fg-2`, `--fg-dim` and `--fg-muted` sit within 20 units of each other in hex
value on light theme — three different "muted" tokens exist and are used
close to interchangeably (see Inconsistencies).

---

### App/window full-screen title — banded style (Pages, Project View)
- Looks like: a small, **centered** title in the very top drag-region strip, between the left icon cluster and "Back to chat".
- Exact styling: `text-sm` (14px) `font-medium` `text-fg`, in a 3-column grid so it's mathematically centered.
- Built with: shared primitive — `components/ScreenBand.tsx` (used by both Pages and Project View so "the two read as rooms in one house," per its own header comment).
- Used for (job): naming the full-screen destination you're in.
- Count: 1 primitive, 2 call sites (Pages, Project View) — `components/ScreenBand.tsx:48`
- Screenshot: `scratch/ui-consistency-baseline/shots-pages-view/light/view.png` (top center, "Week planner" — note: that specific text is Pages' own generated app content sitting *below* the band; the band's own title area is empty/generic there, confirmed in code at ScreenBand.tsx:48-50).

### App/window full-screen title — overlay style (Marketplace, Library)
- Looks like: a large, **left-aligned** title next to an icon, in its own top bar that does NOT share ScreenBand's window-drag styling.
- Exact styling: `<h1>` `text-xl` (20px, `sm:text-2xl` 24px on detail pages) `font-semibold` `text-fg`.
- Built with: hand-rolled per screen, not ScreenBand and not a shared Heading primitive (none exists in `components/ui/`).
- Used for (job): naming the full-screen destination you're in — same job as ScreenBand, different look.
- Count: 6 sites — `components/marketplace/MarketplaceScreen.tsx:402` ("Marketplace"), `:823` (item name), `components/marketplace/MarketplaceDetailOverlay.tsx:267,581`, `components/library/LibraryScreen.tsx:178` ("Your Library"), `components/FirstRunView.tsx:378` (`text-4xl`, "YouCoded" wordmark — a third, much larger variant for onboarding only).
- Screenshot: confirmed — `scratch/ui-consistency-baseline/shots-marketplace/light/marketplace.png` and `library.png` both show this left-aligned h1 pattern, visibly different composition from the Pages/Project View centered band.

### Dialog title (shared primitive)
- Looks like: bold-ish single line at the top of a popup, with an optional muted subtitle line beneath, a back-chevron slot, and the close button on the right.
- Exact styling: `<h2>` `text-base` (16px) `font-semibold` `text-fg`; subtitle (when present) is `text-3xs` (10px) `text-fg-muted mt-0.5`.
- Built with: shared primitive — `components/ui/Dialog.tsx:250` (the `D1` shell, explicitly built to replace 49 files that had hand-rolled 4 different header paddings).
- Used for (job): every modal/dialog title app-wide that has adopted the primitive (confirmed: Assistant Settings, most confirmation dialogs).
- Count: 1 primitive, used by most dialogs (not individually counted — see Inconsistencies for the hold-outs that don't use it).
- Screenshot: `scratch/ui-consistency-baseline/shots-assistant-settings/light/assistant-general.png` — "Assistant settings" dialog title, bold, `text-base`.

### Dialog/panel title — hand-rolled variants (did NOT adopt the Dialog primitive)
- Looks like: the same job (a popup's name at the top) but at 2 different weights and 2 different sizes than the primitive above.
- Exact styling variant A: `<h2>` `text-base` `font-medium` (not semibold) `text-fg` — reads visibly lighter than a Dialog-primitive title next to it.
- Exact styling variant B: `<h2>` `text-sm` (14px, two sizes smaller) `font-semibold` `text-fg`.
- Built with: hand-rolled, pre-dating or bypassing `Dialog.tsx`.
- Used for (job): same job as the primitive title — the dialog/sheet's own name.
- Count: variant A — 4 sites: `components/ResumeBrowser.tsx:1590` ("Resume Session"), `components/SettingsPanel.tsx:344` ("Settings"), `components/tags/SessionTagsChip.tsx:84` ("Tags & note"), `components/marketplace/MarketplaceDetailOverlay.tsx:152` ("Details"), `components/marketplace/FileViewerOverlay.tsx:82`. Variant B — 2 sites: `components/marketplace/SignInPromptModal.tsx:47`, `components/marketplace/ReportReviewButton.tsx:154`.
- Screenshot: `scratch/ui-consistency-baseline/shots-settings-rows/light/settings-rows.png` shows the Settings drawer title ("Settings") at variant-A weight — visually a touch lighter than the "Assistant settings" Dialog-primitive title screenshot above, though at a glance the difference is subtle.

### Drawer/panel title (non-Dialog surfaces: side drawers, arcade panel)
- Looks like: a bold single-line label at the top of a slide-out panel — sessions, files, or a game.
- Exact styling: 3 more variants for this same job — `text-base font-semibold text-fg` (SessionDrawer's "Session Files{(N)}"), `text-sm font-semibold text-fg` (ArcadeHeader, the games panel — "Flappy", "Games"), and the Settings/Dialog `text-base font-medium` shown above.
- Built with: all hand-rolled, no shared "PanelHeader" primitive.
- Used for (job): naming the contents of a slide-out panel.
- Count: `components/SessionDrawer.tsx:725`; `components/game/ArcadeShell.tsx:363`.
- Screenshot: `scratch/ui-consistency-baseline/shots-games-arcade/light/arcade-leaderboard.png` — "Flappy" panel title, top-left, with back chevron.

### Section heading — the dominant uppercase "eyebrow" label
- Looks like: a small, spaced-out, ALL-CAPS grey label sitting above a group of fields or a list (e.g. "Providers", "Local Models", "Danger zone", "Blocked users").
- Exact styling: `text-3xs` (10px) `font-medium` `text-fg-muted` `tracking-wider` `uppercase`.
- Built with: hand-rolled className string, repeated verbatim (not a shared component, though several files hoist it to a local `SECTION_LABEL`/`EYEBROW` constant: `PermissionsSection.tsx:130`, `SpecialistsChip.tsx:88`, `SpecialistsSection.tsx:18`, `SessionContextPopup.tsx:45`).
- Used for (job): grouping a settings section, a popup's sub-sections, a list's category header (Favorites/Recent/etc.).
- Count: **91 sites** — by far the single most common heading treatment in the app. Representative locations (≤15 of 91): `AboutPopup.tsx:104,124,189,226`; `CopyPicker.tsx:21`; `ContextPopup.tsx:192`; `CommandDrawer.tsx:338,351`; `AccountSection.tsx:419,606,722`; `ProvidersSection.tsx:185,457`; `PreferencesPopup.tsx:126,155,173,213`. Full appendix below.
- Screenshot: `scratch/ui-consistency-baseline/shots-settings-rows/light/settings-rows.png` (partially visible); best confirmed via `shots-assistant-settings/light/assistant-permissions.png` (not opened this pass, but code-confirmed at `PermissionsSection.tsx:407,455`).

### Section heading — eyebrow, near-duplicate size variants
- Looks like: visually almost identical to the dominant eyebrow above (small caps label) but one step larger, or missing the `font-medium`.
- Exact styling variant A: `text-2xs` (11px) `font-medium` `text-fg-muted tracking-wider uppercase` — same recipe, one size up.
- Exact styling variant B: `text-2xs uppercase tracking-wide text-fg-muted` — **no `font-medium`**, reads visibly thinner than both A and the dominant style.
- Exact styling variant C: `text-4xs` (9px) `uppercase tracking-wider` (with or without `font-medium`) — one size *down*.
- Built with: hand-rolled, no shared constant.
- Used for (job): identical job to the dominant eyebrow (section/category label) — same content type, 3 more sizes in play.
- Count: variant A — 5 sites (`SessionDrawer.tsx:859`, `ContextPopup.tsx:160`, `pages/PagesView.tsx:117,189`, `project-view/ProjectsEmptyCard.tsx:48`); variant B — 9 sites (`SettingsPanel.tsx:1772,1785`, `development/ReportDesign.tsx:232,242,255,266`, `first-run/LocalAppConnect.tsx:85`, `game/TwentyFortyEightGame.tsx:334`, `game/FlappyGame.tsx:724`); variant C — 11 sites (`QueuedMessagesStrip.tsx:70`, `ThemeScreen.tsx:190,505,553`, `ToolCard.tsx:1451,1454`, `SpecialistsSection.tsx:385,389,392`, `SyncPanel.tsx:1374`).
- Screenshot: variant A confirmed in `scratch/ui-consistency-baseline/shots-games-arcade/light/arcade-leaderboard.png` ("PIPES CLEARED" — code says `text-2xs font-medium ... uppercase`, `game/Leaderboard.tsx:125`, whose own comment claims it is *"the app's only section header"* — demonstrably false against the 91-site dominant variant elsewhere).

### Section heading — Marketplace's own eyebrow (different color token entirely)
- Looks like: same small-caps-label idea, but noticeably higher-contrast/larger than the rest of the app's eyebrows, because Marketplace never adopted `text-fg-muted`.
- Exact styling: `text-sm` (14px — **4px larger than the app's normal eyebrow**) `uppercase tracking-wide` `text-fg-dim` (not `text-fg-muted`), no `font-medium`. A second, smaller Marketplace-only variant: `text-xs uppercase tracking-wide text-fg-dim`.
- Built with: hand-rolled, confined entirely to `components/marketplace/`.
- Used for (job): same job as every other eyebrow (section label) — "About", "What's inside", "Setup", "Feedback", "Featured".
- Count: `text-sm` variant — 6 sites: `marketplace/FeedbackSection.tsx:249`, `marketplace/CapabilityList.tsx:38`, `marketplace/MarketplaceDetailOverlay.tsx:405,507`, `marketplace/MarketplaceScreen.tsx:857,1062`. `text-xs` variant — 2 sites: `marketplace/MarketplaceFilterBar.tsx:275`, `marketplace/MarketplaceHero.tsx:77`.
- Screenshot: confirmed — `scratch/ui-consistency-baseline/shots-marketplace/light/marketplace.png` shows "FEATURED" (the `text-xs`/`fg-dim` variant) above the hero card — visibly larger and higher-contrast than any Settings-panel eyebrow in `settings-rows.png`.

### Section heading — plain bold/semibold (no uppercase, no eyebrow treatment)
- Looks like: a normal-case, bold sub-heading inside a screen — ranges from small settings labels to large empty-state headlines, all using the same `<h3>` tag.
- Exact styling — at least 6 distinct combinations share this one job:
  - `text-xs font-medium text-fg-2` (Settings sub-label, `SettingsPanel.tsx:2046`)
  - `text-sm font-medium text-fg` (assistant-settings page label, `assistant-settings/AssistantSettings.tsx:325`)
  - `text-sm font-semibold text-fg` (confirmation-dialog sub-heading, `HandlePrompt.tsx:100` "Pick a handle", `ModelPickerPopup.tsx:488` "Enable Fast mode?")
  - `text-sm font-bold text-fg` (`ShareSheet.tsx:80`, `ThemeShareSheet.tsx:86`)
  - `text-base font-semibold text-fg` (empty-state card headline, `project-view/ProjectsEmptyCard.tsx:49` "Projects keep your work together", `pages/PagesView.tsx:190`)
  - `text-lg font-semibold text-fg` (bigger empty-state / confirmation headline, `project-view/ProjectView.tsx:1034,1129`, `project-view/ImportFileDialog.tsx:87`, `project-view/HowContextWorksPopup.tsx:148,307`)
  - `text-lg font-medium text-fg` (Marketplace rail/section title, `marketplace/MarketplaceRail.tsx:58`, `marketplace/MarketplaceScreen.tsx:587`)
- Built with: hand-rolled per screen; no shared "SectionHeading" or "Heading" primitive exists anywhere in `components/ui/`.
- Used for (job): everything from a tiny settings sub-label to a full empty-state headline — one HTML tag, 7 unrelated visual weights.
- Count: 72 total `<h3>` sites app-wide (uppercase-eyebrow ones counted separately above); ~30 are this plain bold family.
- Screenshot: `scratch/ui-consistency-baseline/shots-marketplace/light/marketplace.png` shows "Destin's picks" / "If you journal" at the `text-lg font-medium` rail variant.

### Card title
- Looks like: bold item name inside a card (marketplace plugin card, empty-state card).
- Exact styling: mostly bare `font-medium text-fg` with the size inherited from context (`marketplace/MarketplaceCard.tsx:269` has NO explicit text size at all — inherits its parent's; `:373` explicitly sets `text-sm sm:text-base`).
- Built with: hand-rolled, no Card/CardTitle primitive.
- Used for (job): naming the thing a card represents (a plugin, a theme, a project).
- Count: 2+ sites directly, plus every marketplace grid card.
- Screenshot: confirmed — `marketplace.png`, card titles "Civic Report", "Encyclopedia", "Theme Builder" — bold, ~14-16px.

### List-group label with subtitle (Settings rows)
- Looks like: a bold row label with a smaller muted description line underneath, each row acting as a nav link (Settings screen: "Account / Sign in to like themes, rate…").
- Exact styling: label at default weight (visually bold in the screenshot, likely inherited `font-medium`/button default) + subtitle `text-fg-muted`, smaller.
- Built with: hand-rolled per row in `SettingsPanel.tsx`, no shared "SettingRow" pattern here despite `components/ui/SettingRow.tsx` existing as a primitive elsewhere — worth checking whether the top-level Settings list itself uses that primitive or hand-rolls (not confirmed this pass).
- Used for (job): a tappable settings-category row.
- Count: ~11 rows visible in `settings-rows.png`.
- Screenshot: confirmed — `scratch/ui-consistency-baseline/shots-settings-rows/light/settings-rows.png`.

### Session pill / tab label (top session strip)
- Looks like: the small rounded pill naming each open session/tab at the very top of the window.
- Exact styling: `text-xs` (12px) `font-medium` `text-fg-2`.
- Built with: hand-rolled, `components/SessionStrip.tsx:1979` (`.session-pill__label`).
- Used for (job): naming an open session in the tab strip — a header at the smallest, most transient level.
- Count: 1 pattern, N runtime instances (one per open session).
- Screenshot: confirmed — top bar of `scratch/ui-consistency-baseline/shots-settings-rows/light/settings-rows.png` ("fix chat scroll stick").

---

### Body text — primary (chat messages)
- Looks like: the actual words in a chat bubble.
- Exact styling: `text-sm` (14px) — `text-fg` on the assistant's `bg-inset` bubble, `text-on-accent` on the user's `bg-accent` bubble. Same size, two different color tokens because the two bubbles have inverted backgrounds.
- Built with: hand-rolled, `components/AssistantTurnBubble.tsx:526`, `components/UserMessage.tsx:72`.
- Used for (job): the message text itself — the single highest-traffic text family in the app.
- Count: 2 sites (the two bubble shells); renders on every message.
- Screenshot: any chat screenshot, e.g. `scratch/ui-consistency-baseline/shots-games-arcade/light/arcade-leaderboard.png` (assistant text visible left panel).

### Body text — secondary/muted (three near-duplicate tones)
- Looks like: descriptive copy that's dimmer than primary body text — helper text under a control, a card's description line, "what this does" copy.
- Exact styling: three separate tokens for "muted body text," used close to interchangeably: `text-fg-2` (750→309 raw count... see below), `text-fg-dim`, `text-fg-muted`. All render as a mid-grey on light theme within ~0x20 of each other in hex value; the visual difference between `--fg-2` (#444444) and `--fg-dim` (#535353) and `--fg-muted` (#5E5E5E) is subtle but real, and a screen mixing more than one (Marketplace uses `fg-dim` for its eyebrows where the rest of the app uses `fg-muted`) will show a slightly different grey for "the same kind of text."
- Built with: hand-rolled per site.
- Used for (job): every secondary/description line app-wide.
- Count: `text-fg-muted` 750 sites, `text-fg-2` 309 sites, `text-fg-dim` 277 sites, `text-fg-faint` 52 sites (rarest — near-invisible tertiary text, e.g. disabled hints).
- Screenshot: confirmed throughout — e.g. `marketplace.png` plugin card descriptions ("Source-linked report on your federal reps…").

### Caption / metadata text (timestamps, counts, secondary line under a title)
- Looks like: the smallest readable grey text — timestamps, "5 skills", percentages.
- Exact styling: `text-3xs` (10px) `text-fg-muted` is the most common (e.g. `SessionCardDetails.tsx`'s "3d ago" row), but `text-2xs` (11px) `text-fg-muted` is also used for the identical job (`marketplace/CommentList.tsx:61`, the comment timestamp).
- Built with: hand-rolled per site.
- Used for (job): dates, counts, file sizes, secondary metadata under a title.
- Count: not separately countable from the raw `text-fg-muted` total above; sampled 2 sizes for the same "timestamp next to a name" job.
- Screenshot: confirmed — `marketplace.png` card footers ("93% · 412 · 1 skill · 1 command").

### How counts are shown — three competing conventions
- Looks like: (1) a bare number appended to a word in the title itself — **"Files (12)"** style; (2) a bare number after a label, dimmed — **"Files 12"** style with no parens; (3) a bordered chip — a chunkier "badge" look.
- Exact styling:
  1. Inline parenthetical, part of the title's own text: `components/SessionDrawer.tsx:725` (`Session Files ({N})`), `game/GameLobby.tsx:533` (`Friends ({N})`), `project-view/tabs/FilesTab.tsx:1025` (`Matches by file name ({N})`).
  2. Bare trailing numeral, reduced opacity, next to a segmented-tab label: `components/ui/SegmentedTabs.tsx:123-129` (`SegmentedTabLabel` — `text-2xs`, `opacity-80` on the active tab / `text-fg-muted` on inactive) — this is the one confirmed in the screenshot as "All 42", "Plugins 28". Also `components/ResumeBrowser.tsx:59` (`PickLabel` — `opacity-70 tabular-nums`, no parens).
  3. A dedicated bordered chip primitive: `components/ui/Badge.tsx` — `rounded-sm border border-edge-dim bg-inset text-3xs text-fg-2 tabular-nums`, explicitly documented as "a count, a record, a tag," used for e.g. win/loss records.
  4. A fourth, plain-word convention with no numeral styling at all: marketplace cards read "**5 skills**" / "**1 skill**" as ordinary metadata prose, not a number-plus-label pattern (`marketplace.png`, card footers).
- Used for (job): showing "how many" next to a label — one of the most repeated small UI jobs in the app, done 4 different ways.
- Screenshot: confirmed — `scratch/ui-consistency-baseline/shots-marketplace/light/marketplace.png` shows conventions 2 ("All 42") and 4 ("5 skills") on the SAME screen at the same time.

### Monospace/code text
- Looks like: a grey-bordered block for multi-line code, or a subtly-tinted inline snippet within a sentence.
- Exact styling: block — `.yc-code` `rounded-md bg-canvas border border-edge p-3 text-sm text-fg`. Inline — `text-sm text-code` (a computed-per-theme color token distinct from `--fg`, specifically so community themes get a palette-matched inline-code tint instead of inheriting a hardcoded yellow, per globals.css comment).
- Built with: `components/MarkdownContent.tsx:419,432` (the only markdown renderer in the app — every code block/inline-code instance funnels through this one component, so this family is unusually consistent compared to the rest of the inventory).
- Used for (job): rendering fenced/inline code inside chat messages, tool output and any other markdown surface.
- Count: 1 shared renderer.
- Screenshot: not opened this pass; would need a chat transcript containing a code block (not present in the plans sampled).

### Links
- Looks like: colored, usually-underlined text that opens something externally.
- Exact styling: `text-link` `hover:text-link-hover`, **with** `underline` in most places (`MarkdownContent.tsx:453`, `AboutPopup.tsx:230,237`, `LinkableText.tsx:29`) but **without** underline in a few (`tool-views/ToolBody.tsx:1070`, `game/GameLobby.tsx:90,444`, `game/Leaderboard.tsx:67`, `game/ArcadePicker.tsx:124` — these read as colored text with no underline cue that it's clickable until hovered).
- Built with: hand-rolled per site, no shared `<Link>` primitive.
- Used for (job): any user-facing external link or "Dismiss"/"View" inline action styled as a link.
- Count: 12 sites total; 5 underlined, 7 not.
- Screenshot: not separately confirmed this pass (links are small and easy to miss in a full-screen capture); flagged from code only.

### Buddy-window text — bypasses the Tailwind type scale entirely
- Looks like: text inside the separate floating mascot/chat/bar windows (a different rendering context from the main app window) — visually similar sizes to the rest of the app, but built differently under the hood.
- Exact styling: raw inline `style={{ fontSize: N }}` in pixels — 10, 10.5, 11, 12, 13, 14 — instead of `text-3xs`/`text-2xs`/etc. Colors also go through inline `style={{ color: 'var(--fg-muted)' }}` rather than a Tailwind `text-fg-muted` class. `10.5px` (`buddy/CompactToolStrip.tsx:95`) has no equivalent named step anywhere in the type scale at all.
- Built with: hand-rolled inline styles, exclusively in `components/buddy/*`.
- Used for (job): the same jobs as elsewhere (labels, muted captions, tool strip text) but in the Buddy floater windows specifically.
- Count: at least 12 sites — `buddy/SessionPill.tsx:81,93,144,166,188`, `buddy/CompactToolStrip.tsx:23,33,95,119,217,291`, `buddy/BuddyWelcome.tsx:54`, `buddy/BubbleFeed.tsx:501,511`.
- Screenshot: none found — would need a capture of an open Buddy floater window (mascot/chat/bar), not present among the sampled baseline plans.

### Status/emphasis colored text
- Looks like: colored inline text flagging a state — a warning, an error, a destructive action, a live "may be stuck" hint.
- Exact styling: hardcoded status colors (never theme tokens, by design — see `react-renderer.md` rule "Status colors are theme-independent") — `text-amber-700` (warning, e.g. `ModelPickerPopup.tsx:494` "⚠ Billed Per Token"), `text-red-500` (error, `tool-views/ToolBody.tsx:247`), `text-destructive-fg` (themed destructive-text token, `game/GameLobby.tsx:82`).
- Built with: hand-rolled per site.
- Used for (job): warnings, errors, destructive-action labels.
- Count: not exhaustively counted; sampled 3 distinct color choices for "something needs attention" text.
- Screenshot: not confirmed this pass.

---

## Header ladder today

| Level | Job | Variants found | Where |
|---|---|---|---|
| 1 — App/window title | Name the full-screen destination | (a) ScreenBand: centered, `text-sm font-medium text-fg`; (b) Marketplace/Library: left-aligned `<h1>` `text-xl/2xl font-semibold text-fg`; (c) FirstRunView: `text-4xl font-semibold` wordmark | ScreenBand.tsx:48; MarketplaceScreen.tsx:402; LibraryScreen.tsx:178; FirstRunView.tsx:378 |
| 2 — Dialog title | Name a modal/popup | (a) Dialog primitive: `<h2> text-base font-semibold`; (b) hand-rolled `<h2> text-base font-medium`; (c) hand-rolled `<h2> text-sm font-semibold` | Dialog.tsx:250; ResumeBrowser.tsx:1590, SettingsPanel.tsx:344; SignInPromptModal.tsx:47 |
| 2b — Drawer/panel title | Name a slide-out panel | `text-base font-semibold` (SessionDrawer) vs `text-sm font-semibold` (ArcadeHeader) | SessionDrawer.tsx:725; ArcadeShell.tsx:363 |
| 3 — Section heading, plain | Group content within a screen | At least 6 size/weight combos on one `<h3>` tag: `text-xs font-medium` … `text-lg font-semibold` | see "plain bold/semibold" family above |
| 3b — Section heading, eyebrow | Group content, ALL-CAPS style | Dominant: `text-3xs font-medium text-fg-muted tracking-wider uppercase` (91 sites); near-dupes at `text-2xs`, `text-4xs`, and a `font-medium`-less `text-2xs`; Marketplace's own `text-sm`/`text-xs` + `text-fg-dim` (no `font-medium`) | see eyebrow families above |
| 4 — Card title | Name an item in a grid/list | Bare `font-medium text-fg`, size often inherited/unset | MarketplaceCard.tsx:269,373 |
| 5 — List-group label | Name a tappable settings row | Bold label + muted subtitle, hand-rolled per row | SettingsPanel.tsx (rows) |
| 6 — Tab/pill label | Name an open session/tab | `text-xs font-medium text-fg-2` | SessionStrip.tsx:1979 |

No shared `Heading`/`SectionHeading`/`PanelTitle` primitive exists in `components/ui/` — every level above is hand-rolled at each call site except the single-purpose `Dialog.tsx` title, which itself has ~6 known hold-outs that reimplement it slightly differently.

## Inconsistencies spotted

1. **Two incompatible "full-screen title" patterns** for the identical job (naming the screen you're in): ScreenBand's centered `text-sm font-medium` band (Pages, Project View) vs. Marketplace/Library's left-aligned `<h1> text-xl font-semibold`. A user moving between Pages and Marketplace sees the app's own name move from center to left and grow ~6px with no apparent reason.
2. **Dialog titles come in 3 weights/sizes** for the same job: the shared `Dialog.tsx` primitive (`text-base font-semibold`) vs. at least 6 hand-rolled dialogs at `text-base font-medium` (Settings, Resume Session, Tags & note, two Marketplace overlays) vs. 2 more at `text-sm font-semibold` (Sign-in prompt, Report review). Settings and Assistant Settings sit one click apart and use different weights for the same "dialog name" role.
3. **91 sites share one eyebrow style, but 25+ more sites do near-identical jobs at 4 other sizes/weights** (`text-2xs`, `text-4xs`, a `font-medium`-less `text-2xs`, and Marketplace's `text-sm`/`text-xs` + `text-fg-dim`). `game/Leaderboard.tsx:122`'s own code comment calls its variant *"the app's only section header"* — untrue; it is one of at least 5.
4. **`<h3>` is used for at least 6 unrelated visual weights**, from a tiny `text-xs font-medium` settings sub-label up to a `text-lg font-semibold` empty-state headline — the same HTML tag carries wildly different visual importance depending on which screen you're on.
5. **Marketplace's eyebrows use `text-fg-dim` where the rest of the app uses `text-fg-muted`**, and are 3-4px larger (`text-sm`/`text-xs` vs. the app norm of `text-3xs`) — Marketplace section labels ("About", "Setup", "Featured") read visibly bolder/bigger than Settings section labels ("Providers", "Danger zone") even though they do the same job.
6. **Counts are shown 4 different ways on the same screen** (Marketplace: "All 42" bare-numeral tab counts + "5 skills" plain-word card metadata, both visible in one screenshot), plus a 3rd inline-parenthetical convention elsewhere ("Session Files (12)") and a 4th bordered-`Badge`-chip convention for game records.
7. **Three muted-text color tokens (`fg-2`, `fg-dim`, `fg-muted`) are used for the same "secondary/description text" job** with no documented rule for which to pick; Marketplace leans on `fg-dim`, Settings/most of the app leans on `fg-muted`.
8. **Three independent `timeAgo`/`relativeTime` functions** (`SettingsPanel.tsx:207`, `SyncPanel.tsx:116`, `buddy/BuddyResumeList.tsx:294`) plus at least 2 more inline day-based reimplementations (`marketplace/CommentList.tsx:39`, `pages/PagesView.tsx:220`) — each with its own thresholds/wording for "how old is this," so the exact same age can read as "3d ago" in one place and "3 days ago" in another. Their surrounding text sizes also differ (`text-3xs` vs `text-2xs`).
9. **Buddy floater windows build text with raw inline `fontSize`/`color` styles** instead of the Tailwind type scale/tokens the rest of the renderer uses — including a `10.5px` value that matches no named step at all.
10. **Links are inconsistently underlined** — 5 of 12 sites carry `underline`, 7 don't, for the same "clickable external link/action" job.

## Coverage

Searched: `rg -n` across `youcoded/desktop/src/renderer/components/**/*.tsx`
(excluding `src/renderer/dev/`) for: `uppercase`, `tracking-`, `text-(xl|2xl|3xl)`,
`font-semibold`, `font-bold`, `font-medium`, `<h1>`–`<h4>`, `text-fg-2`/`fg-dim`/
`fg-muted`/`fg-faint`, `font-mono`, `text-link`, `italic`, `fontSize:`,
`formatDate|toLocaleDateString|timeAgo|relativeTime`, and exact eyebrow-class
strings counted individually. Read `styles/globals.css` in full for the token/
type-scale section (lines 1-370) and `components/ui/Dialog.tsx`, `Badge.tsx`,
`ScreenBand.tsx` in full.

**Not exhaustively enumerated** (counts given are lower bounds / representative
samples, not full site lists): the 750 raw `text-fg-muted` sites, 309
`text-fg-2` sites and 277 `text-fg-dim` sites were counted but not individually
read — grouping them into "which ones are headings vs. body vs. caption" would
require reading every call site's surrounding context, which this pass did not
do at that scale. The 72 total `<h3>` sites were sampled (all non-eyebrow ones
listed) but not each one individually screenshotted. `hooks/`, `state/`,
`utils/`, `parser/` were not searched (no JSX/styling there). Android's Kotlin
UI (`app/src/main/...`) is a separate, non-shared codebase and was not in scope
— this report covers only the shared React renderer both platforms load.

**Screenshots confirmed by opening the PNG this pass:** `shots-marketplace/light/marketplace.png`,
`shots-marketplace/light/library.png`, `shots-settings-rows/light/settings-rows.png`,
`shots-pages-view/light/view.png`, `shots-assistant-settings/light/assistant-general.png`,
`shots-games-arcade/light/arcade-leaderboard.png` — all in light theme only; no
theme-to-theme comparison was done for text styling in this pass (that is a
color-contrast question better suited to the existing `audit-theme-contrast.mjs`
pipeline, not a font-family/size/weight question).

**Families with no confirmed screenshot** (code-only evidence): monospace/code
block text, Buddy-window inline-styled text, the "Links" family, and the
status/emphasis colored-text family — none of the sampled baseline plans
happened to capture a code block, an open Buddy floater, a visible hyperlink,
or a warning/error string in-frame.

## Appendix — full 91-site eyebrow list (`text-3xs font-medium text-fg-muted tracking-wider uppercase`)

AboutPopup.tsx:104,124,189,226 · CopyPicker.tsx:21 · ContextPopup.tsx:192 ·
CommandDrawer.tsx:338,351 · AccountSection.tsx:419,606,614,643,722 ·
ProvidersSection.tsx:185,457 · ToolBody.tsx:88,416,1123,1129 ·
PreferencesPopup.tsx:126,155,173,213 · PermissionsSection.tsx:130 (constant,
3 call sites) · ModelProvidersPopup.tsx:30,639 · ModelPickerPopup.tsx:411 ·
LocalModelsSection.tsx:105,330,340,363 · ImportProjectModal.tsx:134 ·
SpecialistsChip.tsx:88 (constant) · FilesTab.tsx:1046 · ContextTab.tsx:123 ·
RuntimeBinding.tsx:329 · ResumeOptions.tsx:127,160 · ProjectSwitcher.tsx:141 ·
ProjectHero.tsx:312 · ResumeBrowser.tsx:1594,1693 · HowContextWorksPopup.tsx:122 ·
FileFilterPopover.tsx:62 · SessionContextPopup.tsx:45 (constant, 6 call sites) ·
SettingsExplainer.tsx:56 · ContextIntroBanner.tsx:58 · SessionStrip.tsx:2222,2523,
2638,2652,2678,2706 · SettingsPanel.tsx:679,716,1871,2008,2072,2084,2454,2492,
2513,2524,2535,2546 · UsageCard.tsx:155 · ModelPicker.tsx:182 · ThemeScreen.tsx
(4xs variant, not this list) · SystemMarker.tsx:63 · BuddyResumeList.tsx:194 ·
SyncPanel.tsx:1538,1591,1614 · BuddyNewSessionForm.tsx:162,172,186 ·
GameLobby.tsx:452,498,533,589 · StatusBar.tsx:793 · GameChat.tsx:49 ·
SpecialistsSection.tsx:18 (constant),287 · assistant-settings/pages.tsx:367 ·
first-run/LocalModelSetup.tsx:85 · UnifiedDiff.tsx:229 · TagManagerPopup.tsx:113 ·
model/ModelPicker.tsx:182 (dup of above via re-export) · ActiveArtifactView.tsx:609 ·
GitReviewView.tsx:350.
