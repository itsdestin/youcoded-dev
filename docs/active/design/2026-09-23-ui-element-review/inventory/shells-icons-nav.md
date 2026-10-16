# Shells, Overlays, Icons & Navigation — Element Inventory

Scope: containers/screen shells (modals, popups, drawers, panes, sheets, full-screen
views, page band, window chrome, backdrops/glass) + icons + tabs/nav. Source read at
`youcoded-dev/worktrees/sessions/ui-consistency-audit/youcoded/desktop/src/renderer`
(React + Tailwind v4). `src/renderer/dev/` skipped per instructions. Read-only —
no source edited.

---

### 1. The Dialog primitive (`Dialog`)
- Looks like: a centered card that fades/pops in over a dimmed backdrop, with a
  title row (icon-optional back chevron + title + optional subtitle, close ✕ at
  far right), a body that scrolls if long (soft fade at top/bottom edges when
  there's more to see), and rounded corners.
- Exact styling: 4 widths derived from character measure — `prompt` 340px,
  `panel` 420px (default), `document` 600px, `wide` 820px (all capped at
  88–92vw). Height caps at 1.4× width, clamped to viewport minus 6rem. Header:
  `min-h-14` (56px), `px-4 py-3`, title `text-base font-semibold` (16px), optional
  `text-3xs` subtitle. A 1px gradient line tapers in from both edges under the
  header (transparent → edge-color 8%–92% → transparent), and the scroll body
  gets a matching mask-image fade at top/bottom (`--dialog-fade-top/bottom` CSS
  custom properties, animated). Body padding `px-4 py-4`, children spaced
  `space-y-5`. Radius `var(--radius-xl)`, border `1px solid var(--edge)`,
  shadow `0 8px 32px rgba(0,0,0,var(--shadow-strength))`. Backdrop: `.layer-scrim`,
  theme-tinted (not black), heavier at layer 3 (destructive confirmations).
  Centered via an outer flex wrapper (NOT `position:fixed` + transform — the
  source comment explains the transform technique breaks the scroll-body height
  constraint).
- Built with: primitive — `components/ui/Dialog.tsx` (275 lines, heavily
  commented with the design rationale), wraps `Scrim`+`OverlayPanel` from
  `components/overlays/Overlay.tsx`, portals to `document.body`.
- Used for (job): essentially every "small modal with a title" job — settings
  sub-popups, confirmations, pickers, the changelog/update popup, etc.
- Count: 56 call sites across 38 files (`rg -c "<Dialog\b"`). Size distribution:
  `panel` 30, `prompt` 16, `document` 3, `wide` 1 (Assistant Settings, wide only
  above the narrow-viewport breakpoint — `narrow ? 'panel' : 'wide'`,
  `components/assistant-settings/AssistantSettings.tsx:218`).
  Locations (sample of 15): `components/AboutPopup.tsx:98`,
  `components/ContextPopup.tsx:112`, `components/PreferencesPopup.tsx:119`,
  `components/AccountSection.tsx:176`, `components/UpdatePanel.tsx:324`,
  `components/ModelPickerPopup.tsx:365`, `components/ModelProvidersPopup.tsx:237,707`,
  `components/SyncPanel.tsx:942`, `components/SettingsPanel.tsx:246` (Keyboard
  Shortcuts popup), `components/assistant-settings/AssistantSettings.tsx:218`,
  `components/assistant-settings/SkipPermissionsSection.tsx:64`,
  `components/SessionContextPopup.tsx` (via `Dialog` import),
  `components/development/DevelopmentPopup.tsx` (the "shorter" popup the header
  treatment was approved against), `components/development/ReportDesign.tsx`.
  Appendix (remaining ~24 sites): every other Settings sub-popup in
  `components/SettingsPanel.tsx`, `components/SyncPanel.tsx` (wizard steps),
  `components/ModelProvidersPopup.tsx` (connect-provider sub-dialog).
- Screenshot: confirmed `shots-model-brand/light/model-dialog.png` ("Model &
  Effort" — Dialog, size `panel`), `shots-main/light/settings-about.png`.

### 2. Hand-rolled centered modals that bypass Dialog
- Looks like: the same job as family 1 (a centered card over a dimmed backdrop)
  but built from scratch per component, so the width, the header, and whether
  there's even a close ✕ all vary site to site.
- Exact styling: all use `Scrim`+`OverlayPanel` directly (not `Dialog`), and
  ALL of them center with `fixed left-1/2 top-1/2 -translate-x-1/2
  -translate-y-1/2` — the exact centering technique Dialog's own source comment
  calls out as broken for a bounded scroll body ("the transform technique
  breaks the height constraint a flex-1 scroll region needs"). Widths are each
  hand-picked, none matching Dialog's 340/420/600/820 ladder: `max-w-sm` (384px,
  SignInPromptModal, ReportReviewButton), `w-[26rem]`/416px (AddProjectModal),
  `max-w-md`/448px (ImportFileDialog), `w-[min(640px,92vw)]` (ProjectSwitcher),
  `w-[min(820px,94vw)]` (HowContextWorksPopup — coincidentally matches Dialog's
  `wide`). Header/title inconsistency:
  - SignInPromptModal: `h2 text-sm font-semibold` (14px) + CloseButton, `p-5`.
  - ReportReviewButton's ReportDialog: same recipe, `p-5` + CloseButton.
  - AddProjectModal: plain `div id="add-project-title" text-sm font-medium`
    (14px, no header row, **no close ✕ at all** — only per-step Cancel buttons).
  - ImportFileDialog: `h3 text-lg font-semibold` (18px), **no close ✕** — only
    a bottom Cancel button.
  - ProjectSwitcher: no visible title row shown in the read range; own
    `w-[min(640px,92vw)]` shell with `top-[15%]` (not vertically centered).
  - ProjectDetailOverlay: `<header>` `px-3 py-2 sm:px-4 sm:py-3`,
    `text-base font-medium` (16px), CloseButton reordered on narrow
    (`order-1 sm:order-3`) so it stays reachable — a one-off documented fix.
  - HowContextWorksPopup: `<header>` `px-4 py-3 border-b border-edge`,
    `text-base font-semibold` (16px) + CloseButton — closest to Dialog's own
    recipe of the whole family, but still a separate implementation.
  None of these get the Dialog/SessionDrawer tapered-line-and-mask-fade
  treatment (that CSS is scoped to `.dialog-header`/`.dialog-scroll` and
  `[data-session-files-header/scroll]` only).
- Built with: hand-rolled, `Scrim` + `OverlayPanel` from `components/overlays/Overlay.tsx`.
- Used for (job): sign-in prompt, report-a-review confirmation, add-a-project
  wizard, add-file collision confirmation, project switcher palette, "how
  context works" explainer.
- Count: 7 sites — `components/marketplace/SignInPromptModal.tsx:39`,
  `components/marketplace/ReportReviewButton.tsx:145`,
  `components/project-view/AddProjectModal.tsx:124`,
  `components/project-view/ImportFileDialog.tsx:80`,
  `components/project-view/ProjectSwitcher.tsx:110`,
  `components/project-view/HowContextWorksPopup.tsx:388`,
  `components/marketplace/MarketplaceFilterBar.tsx:217` (see family 7, this one
  is bottom-anchored).
- Screenshot: confirmed `shots-overlays/light/projects-add-project.png`,
  `shots-overlays/light/projects-how-context-works.png`,
  `shots-overlays/light/projects-switcher.png`.

### 3. Anchored popovers (no backdrop)
- Looks like: a small floating card that appears right next to the control that
  opened it (a filter button, a tag chip) rather than centered over a dimmed
  page — closes on outside-click/Esc but never dims the rest of the screen.
- Exact styling: `.layer-surface` positioned `absolute` relative to a wrapper,
  e.g. `absolute right-0 top-full mt-2 w-[280px] p-2` (session tags/note editor)
  or `w-[264px]` (project file filter) or `w-[min(320px,calc(100vw-1rem))]`
  (resume filter). `role="dialog"` present but no `<Scrim>`.
- Built with: hand-rolled `.layer-surface` div, shared `useEscClose` hook.
- Used for (job): quick filter pickers, tag/note editing anchored to a row.
- Count: 3 confirmed — `components/project-view/FileFilterPopover.tsx:106`,
  `components/ResumeFilterPopover.tsx:39` (comment: "Same shell as
  FileFilterPopover"), `components/SessionDrawer.tsx:1068` (tag/note popover).
- Screenshot: confirmed `shots-overlays/light/projects-file-filter.png`.

### 4. Settings drawer (left side panel)
- Looks like: a panel that slides in from the left edge, full height, with
  "Settings" and a close ✕ pinned at top, and a scrolling list of rows below.
  On phone it becomes a full-screen page instead of a narrow strip.
- Exact styling: `w-80` (320px) desktop, `max-sm:w-full` on phone. L1 scrim
  (`layer-scrim`, opacity-animated). Header `.settings-drawer-header`
  `px-4 py-3`, title `h2 text-base font-medium` (16px **medium**, not
  semibold) + `CloseButton`. Slides via `transform: translateX`, 300ms.
  Scroll body uses the OLDER `.scroll-fade` technique (painted `::before`/
  `::after` pseudo-elements cross-faded by a `data-fade-top/bottom` attribute)
  — a different CSS mechanism from Dialog's newer mask-image approach, even
  though visually both aim to fade the scroll edges. **No tapered gradient
  line under this header** — `.settings-drawer-header` has no `::after` rule
  in `globals.css` (checked: only `.dialog-header` and
  `[data-session-files-header]` get one). So the Settings drawer's own outer
  header does not match the treatment its own child popups (About,
  Preferences, Development, etc., all `Dialog`-based) now carry.
- Built with: hand-rolled — `components/SettingsPanel.tsx:280` — explicit
  `Scrim` (layer 1) + a plain `fixed`/`transform` panel, not `OverlayPanel`.
- Used for (job): the app's Settings entry point.
- Count: 1 (singleton drawer, many rows/sub-popups inside it).
- Screenshot: confirmed `shots-main/light/settings-drawer.png`.

### 5. Session drawer (right side pane)
- Looks like: a persistent pane on the right holding the file/conversation
  list for the active session; resizable by dragging its left edge; can expand
  to fill the content area.
- Exact styling: `w-[var(--right-pane-width,480px)]` normally, `flex-1` when
  expanded; a `w-1.5` (6px) invisible drag handle on the left edge tinted on
  hover/drag. Its OWN inner header (the file list header, not the whole drawer)
  opted into the SAME treatment as Dialog: `min-h-14 px-4 py-3` +
  `[data-session-files-header]`/`[data-session-files-scroll]`, which share the
  exact `.dialog-header`/`.dialog-scroll` CSS rules (same selector list in
  `Dialog.css`) — so this one sub-header matches Dialog pixel-for-pixel while
  sitting inside a drawer whose own outer chrome is unrelated to Dialog.
- Built with: hand-rolled aside (`.drawer-pane`/`.drawer-aside`, z-index 11,
  above `chrome-glass`), file-list header explicitly ported to Dialog's CSS
  classes (`components/SessionDrawer.tsx:718`).
- Used for (job): browsing/resuming files and previous turns for a session.
- Count: 1 (singleton pane).
- Screenshot: confirmed `shots-main/light/drawer-attention.png` /
  `shots-main/light/narrow-drawer.png` (per file listing; not opened pixel-by-
  pixel here, but file exists).

### 6. Full-screen views — 4 different shell recipes for the "job"
The category asked for one family; the source has FOUR distinct
implementations of "a full-screen view that replaces the chat," each solving
header/title/back/close differently:

**6a. ScreenBand + framed pane** (`ProjectView`, `PageHost` — an opened page)
- Looks like: the app's own window title bar, reused as the screen's header —
  same traffic-light/gear/caption-button row, with the screen's title centered
  and a "Back to chat · Esc" pill on the right — sitting above a rounded,
  inset content pane (not full-bleed).
- Exact styling: `.screen-view.fixed.inset-0.bg-panel.z-40`, `ScreenBand` is
  `h-10 px-2 sm:px-3` (identical height to the real `HeaderBar`), 3-column
  grid, title `text-sm font-medium` (14px, centered). Content: `.screen-body`
  → `.screen-pane.screen-pane--frame` `rounded-xl bg-canvas`, inset from the
  frame edge like a card floating in the window.
- Built with: shared primitive — `components/ScreenBand.tsx` (73 lines,
  explicitly documented as a 2026-09-17 unification: *"add the same styled
  frame/header in projects view. we will unify these separate page/menu
  styles"*).
- Count: 2 — `components/project-view/ProjectView.tsx:731`,
  `components/pages/PageHost.tsx:182`.
- Screenshot: confirmed `shots-site-gallery/light/projects.png`,
  `shots-pages/light/header.png`.

**6b. Flat hand-rolled header, full-bleed** (`PagesView` — the "Manage pages" list)
- Looks like: a plain top bar (no framed inset pane, no window-chrome mimicry)
  with a bordered bottom edge, title + icon on the left, actions on the right.
- Exact styling: `fixed inset-0 bg-canvas z-50` (note: NOT `z-40` like the
  other full-screen views — it renders on top of them because it opens FROM
  PageHost). Header `px-4 py-2.5 border-b border-edge`, title
  `h2 text-base font-semibold` (16px **semibold**) + a 16px icon, "Esc · Back"
  ghost button (wide) / `CloseButton` (narrow) — same Esc-back pattern as
  family 6c but a different title size/weight than 6a's ScreenBand (14px
  medium) and than the ScreenBand-hosted page this list opens INTO.
- Built with: hand-rolled — `components/pages/PagesView.tsx:56`.
- Count: 1.
- Screenshot: confirmed `shots-pages/light/library.png`.

**6c. Wallpaper-backed absolute-scroll shell** (`LibraryScreen`, `MarketplaceScreen`)
- Looks like: a full-bleed screen with the blurred wallpaper showing through,
  a sticky top bar with an `h1` title, a secondary "open the other screen"
  button, and the same Esc-back/close-X pattern as 6b.
- Exact styling: `fixed inset-0 z-40` (no `bg-panel`/`bg-canvas` — the
  `WallpaperBackdrop` component paints it), inner
  `absolute inset-0 overflow-y-auto`, header `p-3`, title
  `h1 text-xl font-semibold` (20px — the LARGEST screen title in the app,
  bigger than both 6a's 14px and 6b's 16px), `panel-glass` secondary button
  (text on wide / icon on narrow) + `CloseButton` on narrow. Source comments
  explicitly call this pairing intentional ("change 27 is 'one exit per
  surface type'").
- Built with: hand-rolled, shared only by convention/comment ("matched across
  all three screens, change 27") — no shared header component the way
  ScreenBand is shared for 6a.
- Count: 2 — `components/library/LibraryScreen.tsx:172`,
  `components/marketplace/MarketplaceScreen.tsx:385`.
- Screenshot: confirmed `shots-main/light/library.png`,
  `shots-main/light/marketplace.png`.

**6d. Centered-card wizard shell** (`FirstRunView`)
- Looks like: a big centered logo/title over a plain background with a
  sequence of rounded cards (one wizard step at a time) — closer to a
  marketing/onboarding splash than to any of the other three full-screen
  recipes.
- Exact styling: `absolute inset-0 flex items-center justify-center bg-canvas`,
  `h1 text-4xl font-semibold` (36px — far larger than any other in-app title),
  step cards `w-full max-w-md rounded-2xl bg-panel border border-edge p-6`
  (`rounded-2xl`, not the `rounded-xl` the framed panes use).
- Built with: hand-rolled — `components/FirstRunView.tsx:377`, composing
  `components/first-run/{ApiKeySetup,LocalAppConnect,LocalModelSetup}.tsx`.
- Count: 1 shell, several step components inside it.
- Screenshot: confirmed `shots-chatsearch-gate-main` sibling directories carry
  `first-run-*.png` (e.g. `shots-chatgpt-signin/light/first-run-sign-in.png`).

**6 — cross-family inconsistency:** four full-screen views, four different
header heights/weights/title sizes (14px medium / 16px semibold / 20px
semibold / 36px semibold) and three different background treatments (framed
inset pane / flat full-bleed / wallpaper-backed / plain centered card), for
what the product describes as one tier of screen ("the big destinations").
Only ProjectView + PageHost have been unified so far (6a); Pages' own list
screen (6b) was left out of that unification even though it is the same
feature area as PageHost.

### 7. Bottom sheets — 2 different implementations
**7a. `CommandDrawer`** (the `/` skill/command picker)
- Looks like: a tray that slides up from the bottom edge of the window,
  flush with the edges, with a small grab-handle bar (no title) and a search
  field.
- Exact styling: `fixed bottom-0 left-0 right-0 rounded-t-xl` (top corners
  only), `max-height: 45vh`, `translate-y-full` ↔ `translate-y-0`. Grab handle:
  `w-8 h-1 rounded-full bg-fg-faint`, centered, `py-2`.
- Built with: hand-rolled, `.command-drawer` class (explicitly disables the
  wallpaper backdrop-filter on its child `.layer-surface` cards — a documented
  Windows-Electron paint bug workaround).
- Count: 1. Screenshot: confirmed `shots-main/light/command-drawer-slash.png`.

**7b. `FilterSheet`** (Marketplace's mobile filter panel)
- Looks like: a floating card near the bottom of the screen (not flush to the
  edge — it has margin all around, including below), with a "Filters" title
  and a text "Clear all" action, filter controls, and a full-width "Apply"
  button pinned to its own bottom.
- Exact styling: `Scrim` + `OverlayPanel`, `fixed inset-x-2 rounded-2xl`
  (ALL four corners rounded, not just top), `bottom: max(0.5rem,
  env(safe-area-inset-bottom))` — margin on every side. Header
  `sticky top-0 px-4 py-3 border-b`, `h2 text-base font-semibold` — **no close
  ✕**, only "Clear all" (text) + the Apply button at the bottom to dismiss.
- Built with: hand-rolled, `Scrim`+`OverlayPanel` —
  `components/marketplace/MarketplaceFilterBar.tsx:217`.
- Count: 1. Screenshot: confirmed
  `shots-marketplace-overhaul-narrow/light/filters-narrow.png` (verified by
  opening the PNG — matches source exactly: "Filters" / "Clear all" header,
  no ✕, full-width black "Apply" footer button).

**7 — inconsistency:** the app's only two "sheet that rises from the bottom"
patterns disagree on every visual dimension: flush-edge vs floating-with-
margin, top-corners-only vs all-corners rounded, grab-handle-no-title vs
titled-header-with-text-action, and dismiss-by-drag-or-tap-outside vs
dismiss-by-Apply-button only (no ✕ on either, but for different reasons: 7a
has no header at all, 7b's header only has "Clear all").

### 8. Window chrome (top bar + status strip)
- Looks like: the real, always-present app frame — top: traffic
  lights/gear/session tabs/window buttons; bottom: a thin strip of status
  chips (model, permission mode, sync, etc.).
- Exact styling: `.header-bar` `flex items-center h-10 px-2 sm:px-3` (40px
  tall, drag region, `.header-bar button` opts out of drag). `.status-bar`
  `flex flex-wrap items-center gap-x-2 gap-y-1 px-2 sm:px-3 py-1 text-3xs`
  (11px text, no fixed height — grows with wrapped chip rows). Single
  `.chrome-glass` element owns the ONE backdrop-filter for the whole frame
  region (per-element blur is explicitly forbidden — causes seams at non-100%
  zoom, guarded by rule + `drawer-card-glass.test.ts`).
- Built with: primitive-ish — `components/HeaderBar.tsx` (exports
  `CaptionButtons`, `MacTrafficLights`, `SettingsGearButton`, `ProjectsButton`
  reused by `ScreenBand`, family 6a) and `components/StatusBar.tsx`.
- Used for (job): the persistent app frame around chat/terminal view, and
  (via `ScreenBand`) mimicked for two of the four full-screen views.
- Count: 1 header, 1 status bar (app-wide singletons).
- Screenshot: confirmed in every `shots-main/light/*.png` (visible in all
  screenshots opened above).

### 9. Backdrops / scrims
- Looks like: a dimming layer behind any popup/drawer/modal — theme-tinted
  (warm on light/cream themes, cool on dark ones), not a flat black.
- Exact styling: `.layer-scrim { position:fixed; inset:0; background-color:
  var(--scrim) }`, heavier `var(--scrim-heavy)` at layer 3 (destructive
  confirmations). 4-tier z-index system: L1 Drawer (scrim z-40/content z-50),
  L2 Popup (z-60/61), L3 Critical (z-70/71), L4 System (z-100, toasts/hints,
  no scrim). One documented exception: `SessionStrip` dropdown stays
  `z-[9000]` (load-bearing against a header backdrop-filter stacking context),
  and any popover spawned from a `z-9000` host uses `POPOVER_Z = 9001`
  (`FolderSwitcher`, `ProjectHero`, `OverflowMenu`).
- Built with: primitive — `Scrim` in `components/overlays/Overlay.tsx`; every
  family above except 6 (full-screen views, which don't sit over other
  content) and 8 (chrome, which IS the base layer) uses it directly or via
  `Dialog`.
- Coverage: consistent — every modal/drawer/popup family found (1–5, 7)
  reaches its backdrop through this one primitive; no hand-rolled
  `bg-black/50` or similar was found in the surfaces read.

### 10. Glass / blur treatment
- Looks like: on wallpaper themes, popup/panel backgrounds go semi-transparent
  and blur whatever's behind them; on solid themes they stay opaque. Buttons,
  chips and other small controls *inside* a glassy panel stay solid so text
  stays legible.
- Exact styling: `[data-wallpaper] .layer-surface` gets
  `color-mix(... var(--panels-opacity) ..., transparent)` + a theme-engine-
  injected `backdrop-filter`; `.layer-surface .bg-accent`/`.bg-inset` are
  force-opacified back ("protection cascade") except on hover, where the
  primary button's hover state gets its own color-mix step instead of
  inheriting translucency. `.mp-rail-scroll .layer-surface` gets a smaller
  shadow (`0 3px 10px` vs the default `0 8px 32px`) so it doesn't need 40px of
  clearance inside a horizontally-scrolling rail. `[data-wallpaper]
  .command-drawer .layer-surface` explicitly turns backdrop-filter back OFF
  (Windows Electron paint bug on repeated blurred tiles).
- Built with: CSS custom properties + `theme-engine.ts` (not read in this
  pass — referenced from `globals.css` comments) driving `--panels-opacity`/
  `--bubble-opacity`/`--shadow-strength` per theme.
- Coverage: the "one backdrop-filter for the whole frame, never per-card"
  rule is enforced by a named test (`drawer-card-glass.test.ts`) and is a
  documented past incident (shipped twice: two different commits). Not
  independently re-verified pixel-by-pixel in this pass — taken as source
  truth plus the rule file's citation.

### 11. Icons
- Looks like: every icon in the app is drawn by hand as an inline `<svg>` —
  **there is no icon library dependency at all.** `rg` for `lucide-react`
  returned zero matches anywhere in the renderer.
- Exact styling: 82 files contain at least one inline `<svg>`. Sizing is done
  entirely with Tailwind `w-N h-N` pairs (no `size-N` shorthand used
  anywhere — 0 matches). Most common sizes: `w-4 h-4`/16px (88 uses),
  `w-3 h-3`/12px (63), `w-3.5 h-3.5`/14px (53), `w-6 h-6`/24px (27),
  `w-2 h-2`/8px (25, mostly status dots), `w-7 h-7`/28px (16, the Button
  `icon` size square), `w-5 h-5`/20px (15). Three near-adjacent small sizes
  (12/14/16px) are all in active use with no documented rule for which
  context gets which. Stroke width on hand-drawn icons is even less
  consistent: 12 distinct values in use (`strokeWidth="2"` dominant at 103
  uses, but also 1.8×39, 1.5×14, 2.5×10, 1.9×6, 1.2×6, 3×3, 2.8×2, 1.4×2,
  2.2×1, 1.6×1, 1.25×1) — no shared stroke-width token.
- Built with: mixed — a few small shared icon FILES exist but each covers only
  one feature area, so there is no single icon registry: `components/Icons.tsx`
  (chrome: terminal/chat toggle, mascot), `components/context-menu/menu-icons.tsx`,
  `components/marketplace/type-icons.tsx`, `components/pages/page-icons.tsx`,
  `components/project-view/detail-tool-icons.tsx`,
  `components/project-view/icons.tsx`, `components/tags/glyphs.tsx`. Two
  *are* successfully centralized as reusable primitives: the ✕ close glyph
  (`components/ui/CloseButton.tsx` — explicitly replaced 8+ copy-pasted SVGs)
  and the back-chevron used in `Dialog`'s `onBack` header slot. Everything
  else is a one-off inline `<svg>` in the component that needs it.
- Used for (job): every icon-bearing button, tab, badge and empty-state
  graphic in the app.
- Count: 82 files with inline `<svg>`; 74 files also use emoji characters
  (rough grep, not hand-verified per file) for casual inline glyphs alongside
  the SVG icons — the app mixes both idioms rather than picking one.
- Screenshot: any screenshot shows this (icons are ubiquitous); no single
  "icon sheet" screenshot exists to confirm sizes in isolation — would need a
  dedicated capture zoomed on a row of mixed-size icon buttons to compare
  side by side.

### 12. Tabs / segmented navigation — `SegmentedTabs`
- Looks like: a row of pick-one buttons. Three visual variants: a plain
  underline-free row (`bare`), a row of buttons sharing an inset trough
  (`contained`), or one full pill holding rounded sub-pills (`pill`).
- Exact styling: `bare` — `px-3 py-1.5 rounded-md text-xs font-medium`,
  active = solid accent fill, inactive = transparent-until-hover (a documented
  2026-07-16 decision after Library and BugReportPopup were found to disagree
  on the inactive state — this file is the fix). `contained` —
  `flex gap-1 p-1 bg-inset/50 rounded-lg`, tabs `flex-1`. `pill` —
  `w-fit flex gap-0.5 p-0.5 layer-surface !rounded-full`, segments
  `px-3 py-1 rounded-full text-sm`, no drop shadow (overridden `boxShadow:none`
  since a control inside a header shouldn't cast the panel shadow). Full
  keyboard support: `role="tablist"`/`role="tab"`, roving `tabIndex`,
  Arrow-Left/Right cycles selection.
- Built with: primitive — `components/ui/SegmentedTabs.tsx`.
- Used for (job): Settings sub-toggles, Library's Plugins/Themes switch,
  Marketplace's Type filter, Preferences panels, bug/feature report type,
  session-naming mode, context-window scope.
- Count: 13+ call sites — `components/SettingsPanel.tsx:717,1967`,
  `components/PreferencesPopup.tsx:159`, `components/SessionContextPopup.tsx:159,392`,
  `components/library/LibraryScreen.tsx:233`, `components/development/ReportDesign.tsx:229`,
  `components/marketplace/MarketplaceFilterBar.tsx:163,241`,
  `components/assistant-settings/ContextSettings.tsx:36`,
  `components/assistant-settings/SessionNaming.tsx:74`.
- **Inconsistency inside this family:** `ProjectView`'s own top-level segmented
  control (Overview/Conversations/Files) — the ORIGINAL design the shared
  `pill` variant was "copied verbatim" from, per the primitive's own source
  comment — was never migrated to actually USE `SegmentedTabs`. It remains a
  separate, hand-rolled copy at `components/project-view/ProjectView.tsx:832`
  with small drifts from the shared version: responsive padding
  (`px-2.5 sm:px-3.5 py-1.5` vs the primitive's fixed `px-3 py-1`),
  `text-sm-tight` instead of `text-sm`, and — more importantly — **no
  `role="tablist"`/`role="tab"` and no Arrow-key navigation**; it uses
  `aria-current="page"` instead (a landmark/nav-link semantic, not a tab
  semantic), so keyboard users get a different interaction model on the one
  screen (`ProjectView`) that the shared component's own "pill" look was
  designed around.
- Screenshot: confirmed `shots-main/light/library.png` (pill variant),
  `shots-site-gallery/light/projects.png` (ProjectView's un-migrated copy).

---

## Inconsistencies spotted

1. **Two centering techniques for "modal over a scrim," and only one is
   documented as correct.** `Dialog` uses an outer flex-centering wrapper on
   purpose (its own source comment explains why fixed+transform breaks a
   bounded scroll body); 7 other hand-rolled modals (family 2) all use
   `fixed ... -translate-x-1/2 -translate-y-1/2` anyway — the exact technique
   Dialog was built to avoid.
2. **Five different modal widths outside Dialog's ladder** (384/416/448/640/820px
   vs Dialog's 340/420/600/820px) for what is visually the same "small modal"
   job — none reuse `DIALOG_WIDTHS`.
3. **Close-button presence is inconsistent.** `AddProjectModal` and
   `ImportFileDialog` have no ✕ at all (Cancel-button/Esc/outside-click only);
   every other modal-style popup has one. The bottom sheet `FilterSheet` also
   has no ✕ (Apply-button-only dismiss), while `CommandDrawer` (the other
   sheet) never had a title/close row to begin with.
4. **Modal/header title text ranges over 5 size/weight combinations** for
   what reads as the same UI role ("this popup's name"): 14px semibold
   (SignInPromptModal), 14px medium (AddProjectModal, Settings drawer,
   Resume Browser — the WHY comment for Resume even calls this the "approved
   16px medium" but the rendered class is `text-base` = 16px, matching
   Settings' drawer title weight, not size, exactly), 16px semibold (Dialog,
   HowContextWorksPopup, PagesView), 18px semibold (ImportFileDialog), 20px
   semibold (Library/Marketplace `h1`).
5. **The tapered-header-line + edge-fade-mask treatment exists in THREE
   independent copies** rather than one shared rule: `.dialog-header`/
   `.dialog-scroll` (Dialog + `[data-session-files-header/scroll]` in
   SessionDrawer, sharing CSS custom properties `--dialog-fade-top/bottom`),
   and a separate, newer copy in `components/ResumeBrowser.css` —
   `[data-resume-header]`/`[data-resume-list]` — with its OWN custom
   properties (`--resume-fade-top/bottom`) doing the identical thing. A
   fourth surface, the Settings drawer's own outer header, deliberately does
   NOT have this treatment at all, so within one drawer (Settings) the outer
   chrome and its own child popups (About, Preferences, etc.) now look
   different from each other.
6. **Four unrelated full-screen-view shells** for what the product treats as
   one tier of screen: ScreenBand+framed-pane (Projects, an open Page),
   flat full-bleed header (the Pages list), wallpaper-backed absolute-scroll
   (Library, Marketplace), and a centered-card wizard (first-run) — four
   different title sizes (14/16/20/36px) and three different background
   concepts. A source comment on `ProjectView` (Destin, 2026-09-17) already
   flags the Projects/Pages half of this as intentionally being unified via
   `ScreenBand` — but the Pages LIST screen (as opposed to an opened page)
   was left out of that unification, and Library/Marketplace/first-run were
   never brought in at all.
7. **Two incompatible "sheet from the bottom" designs**: `CommandDrawer`
   (flush-edge, top-corners-only, grab-handle, no title) vs Marketplace's
   `FilterSheet` (floating with margin on every side, all-corners-rounded,
   titled header with a text action, no grab handle) — see family 7 for the
   full comparison.
8. **No shared icon library and no icon-size/stroke-width rule.** 82 files
   hand-draw inline SVGs across 7 separate small "icon file" modules with no
   central registry; three adjacent small sizes (12/14/16px) are all common,
   and stroke width varies across 12 distinct values app-wide, with only the
   ✕ and back-chevron glyphs actually centralized as shared primitives.
9. **`ProjectView`'s own segmented-tab row is a stale, drifted copy of the
   shared `SegmentedTabs` `pill` variant** it was reportedly copied FROM,
   missing the shared component's tablist/tab ARIA roles and keyboard
   Arrow-key navigation, and using different padding/text-size tokens.
10. **`PagesView`'s "Esc · Back" + `CloseButton` pattern and Library/
    Marketplace's identical pattern are duplicated by convention/comment only**
    ("change 27... matched across all three screens") rather than through a
    shared header component — unlike Projects/PageHost, which got an actual
    shared `ScreenBand`. A future edit to one is not guaranteed to reach the
    others the way a `ScreenBand` change automatically would.

## Coverage

Searched (ripgrep, from the renderer root, `src/renderer/dev/` excluded):
`fixed inset-0`, `role="dialog"`, `aria-modal`, `createPortal`, `<Dialog`,
`Scrim`/`OverlayPanel`, `layer-scrim`/`layer-surface`, `data-session-files-`,
`dialog-header`/`dialog-scroll`, `screen-view`/`z-40`/`z-50` (full-screen
shells), `bottom sheet`/`translate-y-full`, `lucide-react`, `<svg` (per-file
counts), `size-[0-9]`, `w-[0-9] h-[0-9]` (icon sizing), `strokeWidth=`,
`SegmentedTabs`. Read in full or in focused ranges: `Dialog.tsx`, `Dialog.css`,
`CloseButton.tsx`, `Overlay.tsx`, `SegmentedTabs.tsx`, `ScreenBand.tsx`,
`Icons.tsx` (head), relevant sections of `SettingsPanel.tsx`, `SessionDrawer.tsx`,
`ResumeBrowser.tsx` + `ResumeBrowser.css`, `ProjectView.tsx`, `ProjectDetailOverlay.tsx`,
`ProjectSwitcher.tsx`, `AddProjectModal.tsx`, `ImportFileDialog.tsx`,
`HowContextWorksPopup.tsx`, `FileFilterPopover.tsx`, `SignInPromptModal.tsx`,
`ReportReviewButton.tsx`, `MarketplaceFilterBar.tsx`, `LibraryScreen.tsx`,
`MarketplaceScreen.tsx`, `PagesView.tsx`, `PageHost.tsx`, `FirstRunView.tsx`,
`HeaderBar.tsx` (exports only), `StatusBar.tsx` (class names only), relevant
`globals.css` sections (overlay layer system §, chrome-glass §, scroll-fade §).
9 screenshots opened and visually cross-checked against source: `model-dialog.png`,
`settings-drawer.png`, `command-drawer-slash.png`, `filters-narrow.png` (verified
pixel-match to `FilterSheet` source), plus file-existence checks (not opened)
for another ~15 relevant PNGs across `shots-main`, `shots-overlays`,
`shots-site-gallery`, `shots-pages*`, `shots-marketplace*`, `shots-model-brand`,
`shots-sync-oversize-fix`, `shots-chatgpt-signin`.

**Not verified / would need more capture:**
- `theme-engine.ts` (referenced repeatedly by `globals.css` comments for how
  `--panels-opacity`/backdrop-filter get injected per theme) was not read —
  glass/blur family (10) is reported from the CSS-side contract only.
- Android-specific chrome differences were not checked — this pass is desktop
  renderer only, though the component tree is shared per `youcoded/CLAUDE.md`.
- No screenshot was opened per THEME (only `light`) — cross-theme scrim-darkness
  or glass-opacity drift was not independently visually confirmed, only
  reasoned about from the CSS tokens.
- `StatusBar.tsx` and `HeaderBar.tsx` were only grepped for class names, not
  read in full — their button-level icon sizing was not individually audited
  (folded into the icons family's aggregate counts instead).
- Other researchers' categories (buttons, menus/dropdowns, form fields,
  toasts, tooltips) were deliberately not investigated even where their
  `createPortal`/`OverlayPanel` call sites surfaced in the initial broad
  search (e.g. `FolderSwitcher`, `ContextMenu`, `Select`, `TypeableSelect`,
  `AnchorTip`, `Tooltip`, `ModelPicker`'s filter dropdown, `SessionStrip`'s
  drag/menu portals) — these are anchored dropdown/menu/tooltip primitives,
  not shells in this brief's sense, and are left for whichever researcher
  owns that category.
