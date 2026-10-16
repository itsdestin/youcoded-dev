# Menus, dropdowns, search, text fields & tooltips — element inventory

Scope: `youcoded/desktop/src/renderer` (React + Tailwind v4, shared by Electron desktop
and the Android WebView). Read-only research; nothing in source was changed. Screenshot
paths are relative to `scratch/ui-consistency-baseline/`.

Path shorthand below: `renderer/` = `youcoded/desktop/src/renderer/`.

---

## DROPDOWNS & MENUS

### A. `Select` — the one custom dropdown primitive
- Looks like: a bordered field-height trigger button (chevron on the right) that opens a
  portaled list directly under it, exactly the trigger's width, centered.
- Exact styling: trigger uses the shared FIELD surface (`bg-inset border border-edge-dim
  rounded-lg`, `md` = text-xs/px-3/py-2, `sm` = text-2xs/px-2.5/py-1.5); menu is an
  `OverlayPanel` at layer 4 (`.layer-surface`, `rounded-lg` via `var(--radius-lg)`), rows
  `px-2.5 py-1.5 rounded-md text-2xs`, selected row `bg-accent text-on-accent`, hovered/
  active row `bg-inset`. No native `<select>` anywhere in the app by design.
- Built with: `components/ui/Select.tsx` (primitive).
- Used for (job): pick exactly one value from a short fixed list, themed (a native
  `<select>`'s OS-drawn option list can't be themed).
- Count: 7 files / ~9 render sites — `components/ThemeScreen.tsx:487` (particle preset),
  `components/ProvidersSection.tsx:465` (add-provider type), `components/SkillEditor.tsx:120`
  (skill category), `components/LocalModelsSection.tsx:1216` (GPU layers),
  `components/first-run/ApiKeySetup.tsx:48` (which service), `components/marketplace/
  MarketplaceFilterBar.tsx:172,174` (desktop bar: Vibe, Show) `:251,254` (mobile sheet:
  same two, duplicated for the narrow layout). Three more live in the dev workbench
  toolbar (out of scope — `dev/` excluded). Several files (`App.tsx`, `RuntimeBinding.tsx`,
  `SessionStrip.tsx`) only *mention* `<Select>` in WHY-comments about a form it replaced —
  not live usage; excluded from the count.
- Screenshot: no isolated shot of an *open* Select menu was found in the baseline sheets;
  confirmed indirectly via `shots-marketplace-overhaul/dark/search-split.png` (the two
  closed triggers "Any vibe" / "Everything" beside the search pill).

### B. `TypeableSelect` — combobox variant of A
- Looks like: a plain text field that also opens a Select-style dropdown on focus; typing
  filters/free-types instead of only choosing.
- Exact styling: input uses `fieldClasses('md', 'w-full')` (same FIELD surface as A);
  dropdown is the same portaled `OverlayPanel` layer-4 recipe as Select, rows
  `px-2.5 py-1.5 rounded-md text-2xs`, active row `bg-inset` (no distinct "selected" fill
  the way Select has, since the value may not be in the list).
- Built with: `components/ui/TypeableSelect.tsx` (primitive).
- Used for (job): pick from a preset list OR type an arbitrary value (e.g. a numeric
  setting with common presets).
- Count: 1 live site — `components/assistant-settings/pages.tsx:234` ("Step guard").
- Screenshot: none found — would need capture on Assistant Settings → General, "Step guard" open.

### C. `FolderSwitcher` — hand-rolled trigger + portal dropdown
- Looks like: a Select-shaped trigger (folder icon, name, chevron) that opens a wider
  (320px, or trigger-width in one mode) portaled panel with a "No folder" row, a scrollable
  list of saved folders (icon + name/path, sync dot, checkmark on selection) and a
  "Manage projects…" / "Browse for folder…" footer.
- Exact styling: trigger = `fieldClasses('sm', ...)` (matches Select's `sm` FIELD look, by
  a documented deliberate restyle). Panel = `.layer-surface fixed` at `POPOVER_Z` (9001) —
  NOT `OverlayPanel`/layer prop, a raw class + manual z-index. Rows are **not** rounded
  (`px-2.5 py-1.5`, no `rounded-*`) — the one place among these menus with square rows.
  Selected row = `bg-accent/10 text-fg` (a *tinted* accent background), unlike Select's
  solid `bg-accent`.
- Built with: hand-rolled (`components/FolderSwitcher.tsx`), reusing `.layer-surface` CSS
  and `fieldClasses`/`FIELD_TRIGGER_STATES` from the field primitives, but not `Select`
  itself (options carry sync dots, a footer, and a "no folder" sentinel row that `Select`'s
  generic `SelectOption` shape can't express).
- Used for (job): pick the working project/folder for a new session (new-session forms,
  Assistant Settings default folder).
- Count: 1 component, several mount points (SessionStrip's new-session form, welcome form,
  buddy window). Not separately counted per call site — one implementation.
- Screenshot: none found — would need capture with the folder dropdown open (e.g. New
  Session form in SessionStrip).

### D. Right-click context menu (`ContextMenu`)
- Looks like: a small themed popup at the cursor with an icon, label, and optional kbd
  hint per row, a hairline separator, primary rows in accent-tinted color.
- Exact styling: `OverlayPanel` layer 4, `rounded-lg`, `min-width:200px`, inner `p-1`; rows
  `px-2.5 py-1.5 rounded-md text-2xs`, hover/focus `bg-inset`, primary row text tinted
  `var(--accent)`, disabled rows `opacity-50`.
- Built with: `components/context-menu/ContextMenu.tsx` (primitive) + `build-menu.ts`
  (pure DOM-inspection logic building the entry list per target: editable field,
  CodeMirror, artifact viewer, file pill, link, code block, plain chat text).
- Used for (job): right-click Cut/Copy/Paste/Select-all on any text surface, plus
  "Ask about this" / "Open file" / "Copy link" context actions in chat.
- Count: 1 component, invoked app-wide via `components/context-menu/ContextMenuHost.tsx`
  (window-level `contextmenu` listener) — effectively every text surface in the renderer.
- Screenshot: `shots-overlays/dark/ctx-menu-composer.png` (editable-field variant — Cut/
  Copy/Paste/Select all) and `shots-overlays/dark/ctx-menu-assistant-bubble.png` /
  `shots-overlays/midnight/ctx-menu-assistant-bubble.png` (chat-text variant — Ask about
  this/Copy/Select all). **See Inconsistencies: these two render with completely
  different backgrounds from the identical component.**

### E. `OverflowMenu` — narrow-header "|||" menu
- Looks like: a wide (208px) menu below the "|||" button, rows with a 16px icon, label,
  and an optional colored status dot, noticeably taller/roomier rows than the other menus.
- Exact styling: **hand-rolled**, not `OverlayPanel`/`.layer-surface`:
  `bg-panel border border-edge rounded-lg shadow-lg z-[9000]` with `overflow-hidden py-1`.
  Rows: `px-3 py-2.5 text-sm` (no per-row rounding), active row text `text-accent`, hover
  `bg-inset`.
- Built with: hand-rolled (`components/OverflowMenu.tsx`), positioned via the shared
  `useAnchoredMenu` hook.
- Used for (job): collapses Settings/Projects/Pages/Session Files/Games into one menu
  below 640px width (narrow-viewport rule: never hide a control without another entry).
- Count: 1 site (`HeaderBar`, narrow layout only).
- Screenshot: `shots-narrow/dark/menu.png` — confirms the wide (208px), tall-row, flat
  hand-rolled look versus every other menu's `rounded-md` rows and tighter padding.

### F. SessionStrip "All Sessions" / new-session switcher dropdown
- Looks like: a large (24rem/88vw) black panel below the session pill row, section label
  "Sessions in this window", two-line session rows (name + provider/model, status badge
  "Working"/"Inactive", tag pills), a divider, then Resume/New Session buttons.
- Exact styling: **the same hand-rolled recipe as OverflowMenu (E)** —
  `bg-panel border border-edge rounded-lg shadow-lg z-[9000]` (`glass-overlay
  overlay-no-drag fixed flex flex-col`), not `OverlayPanel`. Rows are their own bespoke
  two-line layout, unrelated in metrics to any other menu family here (much taller, ~54px).
- Built with: hand-rolled (`components/SessionStrip.tsx`), documented as the app's one
  sanctioned `z-[9000]` exception band that other popovers (FolderSwitcher, Select with
  `escapeHost`) must clear via `POPOVER_Z`/`escapeHost`.
- Used for (job): switch sessions, drag one between windows, start a new session (holds
  the FolderSwitcher (C), Model picker, etc. inside its form).
- Count: 1 site (`SessionStrip.tsx:2186`).
- Screenshot: `shots-overlays/dark/shift-session-switcher.png`.

### G. ProjectHero "…" kebab menu
- Looks like: a small themed dropdown from a kebab button on a project card — plain text
  rows, a hairline divider before a destructive (red) row.
- Exact styling: `OverlayPanel` layer 4 (correctly on the shared primitive, per its own
  WHY comment: "L4 matches the other portaled anchored menus (ContextMenu, Select)"),
  `rounded-lg`, `py-1`; rows `px-3 py-2 text-sm-tight`, danger row `text-red-400` with a
  `border-t border-edge-dim` divider above it, hover `bg-inset`.
- Built with: hand-rolled JSX using `OverlayPanel` + the shared `useAnchoredMenu` hook
  (same hook as OverflowMenu, but themed correctly here).
- Used for (job): per-project actions (rename, remove, etc.) on the narrow Project View hero.
- Count: 1 site (`components/project-view/ProjectHero.tsx:598-629`).
- Screenshot: none found — would need capture on Project View narrow layout with the kebab open.

### H. MarketplaceAuthChip account popover
- Looks like: a small "Signed in as @user" + "Sign out" popover under the GitHub avatar chip.
- Exact styling: `div` with the **`.layer-surface` CSS class applied directly** (not via
  the `OverlayPanel` component) as `absolute left-0 top-full mt-2`, hardcoded
  `style={{ zIndex: 62 }}`, `min-w-[180px] rounded-md p-2 text-sm`; the one menu-item row
  is `px-2 py-1 rounded text-fg-2` (plain `rounded`, not `rounded-md`).
- Built with: hand-rolled (`components/marketplace/MarketplaceAuthChip.tsx:119-141`), not
  portaled (plain CSS `absolute`, clippable by any `overflow:hidden` ancestor) and not on
  the `OverlayLayer` 1-4 scale (hardcodes 62 instead).
- Used for (job): sign-out action from the marketplace's account chip.
- Count: 1 site.
- Screenshot: none found — would need capture on Marketplace with the account chip open, signed in.

### I. GameLobby friend "⋯" options menu
- Looks like: a small "Unfriend" / "Block" popup from a friend row's "⋯" button, with a
  block-confirmation sub-state (warning text + Block/Cancel buttons).
- Exact styling: same non-portaled recipe as H — `.layer-surface absolute right-0
  top-full mt-1`, `style={{ zIndex: 62 }}`, but `min-w-[220px] p-1.5 text-xs` (different
  width/padding/text-size from H's `min-w-[180px] p-2 text-sm`); rows `px-2 py-1.5
  rounded text-fg-2`.
- Built with: hand-rolled (`components/game/GameLobby.tsx:156-221`).
- Used for (job): per-friend actions in the arcade's friends list.
- Count: 1 site.
- Screenshot: none found — would need capture in the Games arcade lobby with a friend's "⋯" open.

### J. `ProjectSwitcher` "Jump to project" palette
- Looks like: a Spotlight-style command palette — search row with a magnifying icon and
  an "esc" kbd hint, a "Recent" label, then project rows (name, path, file/chat counts,
  sync dot, checkmark on the active one).
- Exact styling: proper `OverlayPanel` layer 2 inside a `Scrim`, `w-[min(640px,92vw)]`;
  the search input itself is a **bare, borderless** `text-base` input (no field surface at
  all — larger and plainer than any other search box in the app); rows `p-2` gap `0.5`,
  no visible per-row background states shown beyond the active one's ring.
- Built with: hand-rolled (`components/project-view/ProjectSwitcher.tsx`), using shared
  `Scrim`/`OverlayPanel` for the shell but a fully custom search input and row list.
- Used for (job): jump between projects (⌘K-style palette from Project View).
- Count: 1 site.
- Screenshot: `shots-overlays/dark/projects-switcher.png`.

### K. `ModelPicker` panel
- Looks like: a dropdown (desktop) or full sheet (narrow), header = the shared
  `SearchFilterPill` (see Search family §1), then a scrollable list of provider/model rows,
  a freeform "add custom model name" inline text field per provider, and load-error states.
- Exact styling: shell is `OverlayPanel`-based (portaled); rows are bespoke; the inline
  freeform text field is **hand-rolled off the FIELD tokens** — see Inconsistencies.
- Built with: hand-rolled (`components/model/ModelPicker.tsx`), composing the shared
  `SearchFilterPill` primitive for its search box.
- Used for (job): the app's one unified "pick a model" surface (replaced four earlier
  shapes: alias button rows, RuntimeBinding's provider+model Select pair, a grouped native
  list, ModelPickerPopup's native branch).
- Count: 1 component, mounted from SessionStrip's new-session form, the welcome form, and
  Resume Browser.
- Screenshot: none found — would need capture with the Model picker dropdown/sheet open.

---

## SEARCH

### 1. `SearchFilterPill` — the shared search-with-filter pill
- Looks like: a fully rounded ("pill") search box with a magnifying icon inline on the
  left and, when a filter exists, a round sliders button docked inside the right edge
  (with an accent badge showing the active-filter count).
- Exact styling: `bg-inset border border-edge rounded-full pl-3 py-1`, focus
  `focus-within:border-accent`; input `text-sm-tight`; icon 15px stroked SVG; filter
  button `w-7 h-7 rounded-full`.
- Built with: `components/ui/SearchFilterPill.tsx` (primitive).
- Used for (job): search + optional filter/sort for a list of the user's own things.
- Count: 5 sites — `components/SessionDrawer.tsx:745` (Search files…),
  `components/ResumeBrowser.tsx:1609` (session search), `components/marketplace/
  MarketplaceFilterBar.tsx:128` (desktop bar) `:177` (mobile sheet — same field,
  no filter trigger since filters are chips beside it), `components/model/
  ModelPicker.tsx:802` (Search all models…).
- Screenshot: `shots-main/dark/session-files-filter.png` (SessionDrawer, pill + open
  filter popover), `shots-main/dark/resume-browser.png` (ResumeBrowser, pill + filter
  chips below it), `shots-marketplace-overhaul/dark/search-split.png` (Marketplace, pill
  + two Selects).

### 2. CommandDrawer's own search bar — deliberately NOT the pill
- Looks like: a rectangular (not pill-shaped) search bar inside the skill/command drawer,
  with a 16px magnifying-glass SVG, a pencil ("Your Library") icon button on the right;
  in slash-command mode the `<input>` is swapped for a read-only "/query" mirror.
- Exact styling: `bg-well rounded-lg px-3 py-2 border border-edge-dim`; input `text-sm`.
- Built with: hand-rolled, **explicitly documented as intentional** — the component's own
  comment says it was "Deliberately NOT migrated to `<InputGroup>`... Left hand-rolled on
  purpose, revisit only with a deliberate design decision."
- Used for (job): search skills/commands in the "/" drawer.
- Count: 1 site (`components/CommandDrawer.tsx:237-260`).
- Screenshot: `shots-main/dark/command-drawer-search.png` did **not** actually capture the
  drawer open (the PNG shows the plain chat view) — flagged in Coverage below as unverified
  visually; code confirms the styling above.

### 3. `ProjectSwitcher`'s borderless palette search — see Menu family J
- Same control described under J; listed here because it is also a distinct "search box"
  shape: no border/background box at all, just an icon + `text-base` input inside the
  dialog's own header row, plus an "esc" kbd chip. The largest text size of any search box
  in the app (`text-base` vs. `text-sm`/`text-sm-tight`/`text-2xs` everywhere else) and the
  only one with an inline keyboard hint.
- Screenshot: `shots-overlays/dark/projects-switcher.png`.

### 4. `TagPicker`'s search-and-create field
- Looks like: a rounded-rectangle field (not a pill) with no search icon at all, doubling
  as a "type to filter, or create a new tag" box — a "Create" button appears inline inside
  the field (via `InputGroup`) once the typed text doesn't match an existing tag.
- Exact styling: `InputGroup` (`sm` size) → `bg-inset border border-edge-dim rounded-lg
  focus-within:border-accent`, no icon, `Create` button docked inside on the right when
  applicable.
- Built with: `InputGroup` + `InputGroup.Field` (shared field primitives), not
  `SearchFilterPill`.
- Used for (job): search existing tags or create a new one, applied to one conversation.
- Count: 1 site (`components/tags/TagPicker.tsx:75-88`), reused everywhere the tag picker
  is opened (SessionTagsChip's modal, close-session prompt, etc.).
- Screenshot: none found — would need capture with a tag picker open (e.g. the "Add tags"
  chip on a session).

### 5. `ContentFindBar` — in-document Ctrl+F find
- Looks like: a small pill with a 150px text field, a match counter ("3/12"), and
  previous/next/close icon buttons — either floating over the artifact viewer (top-right)
  or docked as a full-width right-aligned row above chat.
- Exact styling: uses the shared `TextInput` (`size="sm"`, i.e. the real FIELD surface)
  for the input itself, but the surrounding **pill wrapper is its own recipe**:
  `flex items-center gap-1 px-1.5 py-1 rounded-lg bg-panel border border-edge shadow-lg`
  — `bg-panel`/`shadow-lg`, unlike SearchFilterPill's `bg-inset`/no-shadow, and
  `rounded-lg` rather than `rounded-full`.
- Built with: hand-rolled wrapper (`components/ContentFindBar.tsx`) around the shared
  `TextInput` primitive.
- Used for (job): find-in-document search inside the artifact viewer and (as a "row"
  layout) the chat timeline.
- Count: 2 layout variants, both from the one component — floating (artifact viewer) and
  row (chat, P-14).
- Screenshot: `shots-main/dark/find-bar.png` (row layout, chat timeline, with match count
  and highlighted term).

### 6. ModelPicker's inline "freeform model name" field
- Looks like: a small plain text box that appears under a provider row when the user picks
  "type a model name yourself" instead of choosing from the list.
- Exact styling: **hand-rolled, off the shared FIELD tokens** —
  `bg-inset border border-edge rounded px-2 py-1.5 text-xs text-fg outline-none
  focus:border-accent`. Compare to `fieldClasses()`'s `border-edge-dim` / `rounded-lg` /
  `disabled:opacity-50` — this field uses a different border token, a smaller/plain
  `rounded` instead of `rounded-lg`, and has no disabled-state handling.
- Built with: hand-rolled (`components/model/ModelPicker.tsx:864-879`), not `TextInput`.
- Used for (job): typing an arbitrary model id for a freeform/local provider.
- Count: 1 site.
- Screenshot: none found — would need capture with a freeform provider row expanded in
  the model picker.

---

## TEXT FIELDS & TOOLTIPS

### I. `TextInput` / `Textarea` / `InputGroup` — the shared FIELD surface
- Looks like: a soft-inset rounded field (`bg-inset`, subtle border), text or multi-line,
  with an accent-colored border on focus (never a focus ring — rings are reserved for
  buttons). `InputGroup` is the same surface with an action button docked inside the
  right edge (e.g. Save) instead of beside the field.
- Exact styling: `FIELD_SURFACE = bg-inset border border-edge-dim rounded-lg`;
  `md` = text-xs/px-3/py-2, `sm` = text-2xs/px-2.5/py-1.5; focus = `border-accent`;
  disabled = `opacity-50 cursor-not-allowed`.
- Built with: `components/ui/field.ts` (`fieldClasses`) + `TextInput.tsx` / `Textarea.tsx`
  / `InputGroup.tsx` (primitives). Documented as having replaced "3 focus paradigms × 3
  backgrounds × 4 radii across ~25 inputs" (field.ts header comment) and, for textareas
  specifically, two named prior recipes (`ContextPopup`'s vs `BugReportPopup`'s).
- Used for (job): every ordinary text/number/password/search-typed/multi-line entry in
  the app (~25+ fields: API keys, skill editor fields, provider settings, tag notes, etc.)
  except the chat composer (its own species, transparent-over-mirror) and the exceptions
  in Search family (§2, §3, §6) and the FolderSwitcher/Select triggers (Menu family).
- Count: consolidated primitive; not separately enumerated per call site (dozens).
- Screenshot: `shots-overlays/dark/development-bug-report.png`, `shots-main/dark/
  tags-note-popover.png` show ordinary fields in context.

### II. `FieldError` — helper/error text under a field
- Looks like: a short red line directly under a field (never a card/toast).
- Exact styling: `text-destructive-fg`, size prop chosen per caller: `text-3xs` (default)
  or `text-2xs`. **The two sizes are a deliberate, permanent split**, not a migration
  artifact — the component's own doc comment states the 25 hand-rolled copies it replaced
  were 19 at `3xs` and 6 at `2xs`, so the prop exists to keep both rather than force one.
- Built with: `components/ui/states.tsx` → `FieldError` (exported via `components/ui/index.ts`).
- Used for (job): field-level validation/error messages.
- Count: consolidated primitive, two sanctioned sizes; call sites not separately enumerated.
- Screenshot: none isolated — would need a field validation error triggered live.

### III. `Tooltip` — the app's themed hover hint
- Looks like: a small dark rounded bubble with 2-3 words of plain text, positioned above
  or below its control, fading in.
- Exact styling: portaled `OverlayPanel` layer 4, `px-2 py-1`, `text-2xs text-fg-2`,
  `max-w-[20rem]`, `pointer-events-none`. Appears after an 800ms hover delay (400ms while
  "warm" from a neighboring tooltip within 130ms of movement), or a 450ms long-press on touch.
- Built with: `components/ui/Tooltip.tsx` (primitive) + shared `anchor-position.ts` math
  (also used by AnchorTip).
- Used for (job): the app-wide replacement for the browser's native `title=` hint — icon
  buttons, status bar chips, etc.
- Count: consolidated primitive; used broadly (not separately enumerated).
- Screenshot: `shots-overlays/dark/thinking-chip-hover.png`.

### IV. `AnchorTip` — click/hover rich info bubble
- Looks like: a larger bubble (default `w-72`) with an optional bold title and multi-line
  body text, opened either by clicking an "(i)" glyph or a custom anchor (a number, an eye
  icon), or by hovering one.
- Exact styling: same `OverlayPanel` layer-4 recipe as Tooltip, `p-3`, title
  `text-xs font-semibold`, body `text-2xs text-fg-2 leading-snug space-y-2`. Shares the
  exact positioning/clamping math with Tooltip via `anchor-position.ts` (explicitly to
  avoid a second hand-tuned copy drifting, per the module's own header comment).
- Built with: `components/ui/AnchorTip.tsx` (primitive).
- Used for (job): richer/paragraph-length explanations (provider descriptions, size
  breakdowns, "Sees images" capability notes) that don't fit a one-line Tooltip.
- Count: consolidated primitive; used broadly (not separately enumerated).
- Screenshot: none isolated in the checked sheets — would need a specific AnchorTip open
  (e.g. Model Providers panel's info bubbles).

### V. Native `title="…"` attribute — the OTHER hint mechanism
- Looks like: the operating system's own plain grey tooltip box — identical across every
  YouCoded theme, because it isn't drawn by the app at all.
- Exact styling: none the app controls (OS-rendered).
- Built with: plain HTML `title` attribute, not a component.
- Used for (job): the same "hover hint" job as `Tooltip` (III), just not migrated.
- Count: **182 occurrences across 67 files** (measured via `rg -c 'title="' -g '*.tsx'`,
  renderer only, `dev/` excluded) — close to `AnchorTip.tsx`'s own comment citing "~231
  across 63 files" at the time that comment was written, confirming this is a large,
  standing population, not a few stragglers.
- Screenshot: n/a (renders as the OS tooltip, not capturable via the app's own screenshot
  tooling in a theme-meaningful way).

---

## Inconsistencies spotted

1. **Right-click context menu renders in the wrong theme for chat-text selections —
   likely a real bug, not a design choice.** `ContextMenu.tsx` is one component using one
   `OverlayPanel` layer-4 recipe for every variant, yet the two screenshot pairs show
   different results: `shots-overlays/dark/ctx-menu-composer.png` (editable-field
   Cut/Copy/Paste menu) renders a correctly dark-themed panel, while
   `shots-overlays/dark/ctx-menu-assistant-bubble.png` **and**
   `shots-overlays/midnight/ctx-menu-assistant-bubble.png` (the "Ask about this"/Copy/
   Select-all menu over chat text) both render a plain **white** panel with black text, in
   both dark themes. Both screenshots are marked "covered" (not a failed/stale capture) in
   `coverage.md`. Worth a focused follow-up to find why the `textMenu`/`codeMenu` path
   loses its theme tokens while the `editableMenu` path does not.

2. **Five unrelated "menu container" recipes do the same job** (open a small themed list,
   click a row): the shared `OverlayPanel`/`.layer-surface` primitive (Select, ContextMenu,
   ProjectHero kebab, ProjectSwitcher, FileFilterPopover/ResumeFilterPopover) vs. a
   hand-rolled `bg-panel border border-edge rounded-lg shadow-lg z-[9000]` recipe
   (OverflowMenu, SessionStrip's session switcher — two *different* components that
   independently reinvented the identical non-primitive styling) vs. `.layer-surface`
   applied directly to a plain `absolute` div with a hardcoded `zIndex: 62`
   (MarketplaceAuthChip, GameLobby's friend menu — not portaled, so clippable, and off the
   app's own 1-4 layer scale) vs. FolderSwitcher's own portaled-but-hand-rolled panel.
   Row padding/text-size drifts accordingly: `px-2.5 py-1.5 text-2xs` (Select/ContextMenu)
   vs. `px-3 py-2.5 text-sm` (OverflowMenu) vs. `px-3 py-2 text-sm-tight` (ProjectHero) vs.
   `px-2 py-1.5 rounded text-fg-2` (H) vs. `px-2 py-1.5 rounded` (I) vs. no rounding at all
   (FolderSwitcher, OverflowMenu rows).

3. **Menu-row corner rounding is inconsistent.** Select/ContextMenu/ProjectHero rows use
   `rounded-md`; FolderSwitcher's and OverflowMenu's rows have no per-row rounding at all
   (flush rectangles against a rounded container).

4. **Four different search-bar shapes for "type to filter a list you're looking at":** the
   shared rounded-full `SearchFilterPill` vs. CommandDrawer's rounded-rectangle bar
   (`bg-well`/`rounded-lg`, explicitly kept hand-rolled by its own code comment) vs.
   ProjectSwitcher's borderless, larger-text Spotlight-style row vs. TagPicker's
   `InputGroup`-based rounded-lg field with no icon at all. Icon sizes also drift: 15px
   (SearchFilterPill), 16px (CommandDrawer), 17px (ProjectSwitcher). `ContentFindBar` adds
   a fifth shape (`bg-panel`/`shadow-lg`/`rounded-lg` pill) for the in-document-find job
   specifically.

5. **One text field bypasses the shared FIELD tokens outright.** ModelPicker's inline
   "Model name for X" freeform input uses `border-edge`/`rounded`/no-disabled-state instead
   of the FIELD primitive's `border-edge-dim`/`rounded-lg`/`disabled:opacity-50` — a small,
   concrete drift from the consolidated field system everything else in this category uses.

6. **Two coexisting, visibly different hint mechanisms.** The themed `Tooltip`/`AnchorTip`
   components vs. 182 native `title="…"` attributes (67 files) that render as the OS's own
   grey box — identical across all six of the app's themes, and invisible on touch
   entirely. This is documented as an accepted, permanent split in `AnchorTip.tsx`'s own
   header comment (native `title=` "stay as-is"), so it's a knowing trade-off rather than
   an oversight, but it does mean two visually unrelated hint styles ship side by side
   indefinitely, and a touch user simply loses every one of the 182 un-migrated hints.

7. **`FieldError` intentionally ships at two sizes** (`text-3xs` / `text-2xs`) because the
   25 hand-rolled error lines it replaced split 19/6 between them — a sanctioned
   inconsistency baked into the primitive's own API rather than resolved to one size.

8. **Two popover menus sit outside the portal/z-index system entirely.**
   MarketplaceAuthChip's account popover and GameLobby's friend "⋯" menu are plain
   `position: absolute` children of their trigger (not `createPortal`-ed), each hardcoding
   `zIndex: 62` instead of picking one of the app's four documented overlay layers — so,
   unlike every other menu cataloged here, they can be visually clipped by an
   `overflow:hidden` ancestor, and a future change to the layer scale (`Overlay.tsx`)
   would silently miss them.

9. **No dropdown "theme picker" exists**, even though the task brief expects one alongside
   the model picker. Theme switching is either a full card-grid dialog (Settings →
   Appearance → Themes, screenshotted at `shots-main/dark/settings-appearance.png`) or a
   plain click-to-cycle status bar pill with no menu/list UI at all — there is nothing in
   this category to compare against ModelPicker's dropdown.

---

## Coverage

**Searched:** every `.tsx`/`.ts` file under `youcoded/desktop/src/renderer/`, excluding
`src/renderer/dev/` (dev-only, per instructions) and `*.test.tsx`/`*.test.ts` (read only
where a test name pointed at real behavior). Ripgrep sweeps run: `<select`, `role="menu"`,
`role="listbox"`, `role="menuitem"`, `onContextMenu`, `useAnchoredMenu`, `createPortal`,
`placeholder=`, `type="search"`, `aria-haspopup`, `<Select\b`, `<TypeableSelect`,
`SearchFilterPill|FilterMenuChip`, plus targeted `rg -ni search` and manual review of every
file that surfaced. Read in full or in focused ranges: `Select.tsx`, `TypeableSelect.tsx`,
`TextInput.tsx`, `Textarea.tsx`, `InputGroup.tsx`, `field.ts`, `SearchFilterPill.tsx`,
`FilterMenuChip.tsx`, `Tooltip.tsx`, `AnchorTip.tsx`, `anchor-position.ts`, `states.tsx`
(FieldError), `ContextMenu.tsx`, `build-menu.ts`, `OverflowMenu.tsx`, `useAnchoredMenu.ts`,
`FolderSwitcher.tsx`, `ContentFindBar.tsx`, `TagPicker.tsx`, `ResumeFilterPopover.tsx`,
plus focused ranges of `SessionStrip.tsx`, `ProjectHero.tsx`, `GameLobby.tsx`,
`MarketplaceAuthChip.tsx`, `ProjectSwitcher.tsx`, `ModelPicker.tsx`, `ModelPickerPopup.tsx`,
`CommandDrawer.tsx`, `MarketplaceFilterBar.tsx`, `SkillEditor.tsx`, `ThemeScreen.tsx`,
`ProvidersSection.tsx`, `LocalModelsSection.tsx`, `first-run/ApiKeySetup.tsx`,
`assistant-settings/pages.tsx`, `StatusBar.tsx`, `SessionTagsChip.tsx`.

**Confirmed against real screenshots** (baseline `shots-*` sheets, dark theme unless
noted): SearchFilterPill (SessionDrawer, ResumeBrowser, Marketplace), FileFilterPopover,
ContextMenu (both the correctly-themed editable variant and the mis-themed text variant,
also cross-checked in Midnight), SessionStrip session switcher, OverflowMenu (narrow),
ProjectSwitcher palette, ContentFindBar (row layout), ResumeBrowser's FilterMenuChip row,
Settings → Appearance theme grid.

**Not verified against a screenshot (code-read only) — would need a fresh capture:**
TypeableSelect's open dropdown (Assistant Settings → General → Step guard), FolderSwitcher's
open dropdown, ProjectHero's kebab menu open, MarketplaceAuthChip's popover open,
GameLobby's friend "⋯" menu open, ModelPicker's dropdown/sheet open (both the row list and
the freeform inline field), TagPicker's search-and-create field, AnchorTip open on any
surface, a live FieldError validation message. `command-drawer-search.png` exists in the
baseline but the image itself shows the plain chat view, not the drawer open — its styling
above is confirmed from source, not from that screenshot.

**Not investigated further (out of this category's scope, flagged for awareness only):**
root cause of the ContextMenu theming bug (#1 above) — that's a fix, not an inventory item;
`SessionTagsChip`'s tag/note modal (a dialog, not a menu, though it hosts TagPicker);
`StatusBar`'s "Status Bar Widgets" dialog (a settings list with checkboxes, not a menu, and
not a theme picker despite hosting the theme-cycle editor).
