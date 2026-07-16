---
status: active
date: 2026-07-16
amended: 2026-07-16 (post-approval code-verification pass — see §9)
owner: Destin (decisions) / Claude (spec)
---

# UI Consistency Design Spec — the 40 approved changes

Everything in this document was **decided and approved by Destin on 2026-07-16** across seven
interactive design-review sessions, each conducted as a pixel-faithful before/after workbench
artifact (links in §7). Approval was change-by-change, by number. This spec is the single durable
source for implementation — a new session should be able to complete the work from this file
plus the linked artifacts without re-deriving anything.

**How this came about:** a four-agent audit of the renderer found the app strong at the
architecture level (overlay layer system genuinely adopted by ~40 components; 15-token theme
contract enforced at runtime + CI; radii fully tokenized) but with no shared control primitives —
~15 distinct button treatments across ~50 files, 4 toggle geometries, 3 input focus paradigms,
5 destructive-red idioms, 2 card species in the same grids, and zero automated enforcement
(no ESLint config exists; ~4 of ~148 renderer components have render tests; MAP.md lists the
renderer guard as "manual"). Full audit numbers in §6.

**Where the code goes:** all changes are in `youcoded/desktop/src/renderer/` (shared by Electron
and the Android WebView — one migration covers both platforms). New primitives live in a new
`youcoded/desktop/src/renderer/components/ui/` directory.

**2026-07-16 amendment pass:** after approval, a code-verification review found (a) recipe
problems verified against the codebase — those recipe fixes are applied inline below and logged
change-by-change in §9 so the delta from the approved renders is visible; (b) whole control
families the original audit never inventoried (icon buttons, textareas, toasts, tabs, progress
bars, the games subtree) — those are **proposed** as Session 8 (changes 41–48) and need the same
workbench render-and-approve treatment as sessions 1–7 before implementation.

---

## 1. The primitives (exact recipes)

All class strings below are final and were rendered/approved verbatim. Sizes written `text-[11px]`
become `text-2xs` etc. once change 35 lands — land the type tokens first (tranche 0) and write
primitives with the token names from day one.

### 1.1 Button (`components/ui/Button.tsx`)

Base (always):
```
inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-colors
disabled:opacity-50 disabled:cursor-not-allowed
focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas
```
Variants:
| variant | classes |
|---|---|
| primary | `bg-accent text-on-accent hover:bg-accent/90` |
| secondary | `border border-edge-dim text-fg-2 hover:bg-inset` |
| ghost | `text-fg-dim hover:text-fg hover:bg-inset` |
| danger | `bg-destructive text-on-destructive hover:bg-destructive/90` (§9.B — was text-white) |
| danger-outline | `border border-destructive/50 text-destructive hover:bg-destructive/10` |

Sizes:
| size | classes | used for |
|---|---|---|
| sm | `text-2xs px-2.5 py-1` | inline row actions (EngineCard, provider rows, chips) |
| md (default) | `text-xs px-3 py-1.5` | forms, popup footers, most actions |
| lg | `text-sm px-4 py-2` | page-level CTAs (sign-in, marketplace hero) |
| icon (proposed, change 41) | `w-7 h-7 p-0` (square; `aria-label` required) | icon-only buttons — ✕ close, send, toolbar/utility icons |

Decisions baked in (each was an explicit choice among rendered alternatives):
- **Radius `rounded-lg`** (12px built-ins / 24px on big-radius packs) — matches the just-shipped
  SettingsRow redesign. Rejected: rounded-sm, rounded-md, rounded-full-everywhere.
- **Hover `hover:bg-accent/90`** (background fades toward surface; label stays crisp). Rejected:
  `hover:brightness-110` (imperceptible on Light/Crème's near-black accent) and `hover:opacity-90`
  (fades label; on glow-themes like Halftone the fill fades out from under the theme's box-shadow glow).
- **Focus ring keeps the canvas offset** (`ring-offset-2 ring-offset-canvas`). Amendment §9.A
  proposed dropping it (the offset is a solid fill, so it renders a canvas-colored halo on
  panel/popup surfaces, and no such ring exists in the codebase today) — **Destin reviewed both
  variants in the Session 8 workbench on 2026-07-16 and kept the offset**; the halo behavior is
  noted and accepted. For the historical evidence see §9.A (rejected). Community `custom_css`
  focus styles (e.g. Halftone's pink outline) still override by specificity — intentional, packs
  keep that power.
- **Coarse-pointer hit areas** (proposed, change 48): sm/icon buttons render an invisible expanded
  hit target under `@media (pointer: coarse)` — the renderer is shared with Android, and sm is
  ~22px tall against the ~44–48dp touch guideline. Visuals unchanged.
- **Pill exception**: first-run hero CTAs keep `rounded-full` + their own larger padding via
  `className` override; only hover + ring normalize (change 7).
- **`type="button"` default** in the component (stops accidental form submits).

### 1.2 Toggle (`components/ui/Toggle.tsx`)

One geometry — **36×20** (SyncPanel's, the largest; best Android touch target). Replaces four
geometries (32×16, 32×18, 28×16, 36×20) across ~14 sites.
```
track:  relative w-9 h-5 rounded-full transition-colors shrink-0
        disabled:opacity-60 disabled:cursor-not-allowed + focus ring (same as Button)
        on  (tone default): bg-accent          ← was green-600 in settings/sync (change 16)
        on  (tone danger):  bg-destructive     ← was raw #DD4444 (change 17)
        off:                bg-inset border border-edge-dim
knob:   absolute top-0.5 w-4 h-4 rounded-full bg-white border border-edge-dim shadow-sm transition-all
        left: 18px checked / 2px unchecked (inline style)
a11y:   role="switch" aria-checked  (today only 2 of ~14 switches have any aria)
```
Knob border added §9.C: today's knobs are bare `bg-white` and sit at ~1.2:1 against Crème's
off-state track (`--inset` `#DDD1BE` per creme.json:9) — `shadow-sm` is the only thing separating
knob from track on light themes. The `border-edge-dim` ring keeps the knob legible on light
tracks without changing dark themes (borders are box-border; knob stays 16px, positions hold).

### 1.3 TextInput + Select (`components/ui/field.ts`, `Select.tsx`)

One field surface (was: 3 focus paradigms × 3 backgrounds × 4 radii across ~25 inputs):
```
FIELD      = bg-inset border border-edge-dim rounded-lg text-fg placeholder:text-fg-faint
             focus:outline-none focus:border-accent
             disabled:opacity-50 disabled:cursor-not-allowed          ← §9.F (spec omitted it;
             disabled fields exist today, e.g. EngineCard.tsx:143 disabled:opacity-60)
FIELD_SIZE = md: text-xs px-3 py-2   ·   sm: text-2xs px-2.5 py-1.5
```
FIELD covers **all** text-entry elements, not just `type="text"`: password (6 API-key sites),
search (MarketplaceFilterBar.tsx:78/:140 — two treatments today), number (EngineCard.tsx:145,
keeps `type="number"`), and `<textarea>` via a Textarea primitive (proposed, change 42 —
12 textareas in 11 files currently split across ≥2 conflicting recipes, e.g. ContextPopup.tsx:161
`border-edge rounded-sm focus:ring-1` vs BugReportPopup.tsx:194 `border-edge-dim rounded-lg
focus:border-accent`; default `resize-none`). The chat composer textarea (InputBar.tsx:535,
transparent-text + mirror overlay) is sui generis and excluded.
Retires: `focus:border-fg-muted` (gray focus), `focus:ring-*` focus, `bg-canvas`/`bg-well` field
surfaces, `rounded`/`rounded-sm`/`rounded-md` field radii. The ProvidersSection key input
(ProvidersSection.tsx:337) already IS this baseline — it doesn't change (change 19).
Flagged-but-accepted: inputs on `bg-inset/50` cards sit closer to their background than before;
the alternative (bg-well inside inset cards) was offered and not taken.

**Select — no native `<select>` anywhere** (change 21). A styled trigger alone is not enough:
the opened option list stays OS-rendered (the blue-highlight menu Destin screenshotted). The
component is: FIELD-styled `<button>` trigger + chevron (`aria-haspopup="listbox"`) opening a
`.layer-surface` popover menu —
```
menu:     .layer-surface, p-1 (4px), border-radius var(--radius-lg), min-width ≥ trigger, z per layer system
          max-h-64 overflow-y-auto  ← §9.G: RuntimeBinding's model select (:212) renders the dynamic
          provider catalog — dozens of entries for OpenRouter-style providers; menu must scroll and
          the selected option scrolls into view on open
option:   px-2.5 py-1.5 rounded-md text-2xs cursor-pointer  (py bumps under pointer:coarse — change 48)
selected: bg-accent text-on-accent font-medium     other: text-fg-2 hover:bg-inset
keyboard: ArrowUp/Down roving, Enter selects, Esc closes (useEscClose), click-outside closes,
          first-character typeahead jump
a11y:     role="listbox" / role="option" aria-selected
anchoring: portal position derives from the trigger rect; must reposition (or close) on ancestor
          scroll/resize — all six sites live inside scrollable settings panels
```

### 1.4 Checkbox + Radio (`components/ui/Checkbox.tsx`, `Radio.tsx`)

Same family; **Toggle for settings/state, Checkbox for consent, Radio for option lists, chips for filters**.
```
Checkbox box:   w-3.5 h-3.5, border-radius 4px, unchecked: bg-inset border border-edge-dim
                checked: bg-accent border-accent + on-accent check svg (stroke-width 3, path "m5 13 4 4 10-11")
                role="checkbox" aria-checked + focus ring
Radio circle:   w-3.5 h-3.5 rounded-full, unselected: bg-inset border border-edge-dim
                selected: border-accent + centered w-1.5 h-1.5 rounded-full bg-accent dot
                role="radio" + arrow-key group navigation + focus ring
```

### 1.5 Slider (change 40 — RESCOPED 2026-07-16, Session 8 iteration)

**Destin's direction on the Session 8 re-render: today's native sliders are the preferred
aesthetic.** Change 40 is rescoped to wiring only, zero visual change:

- Keep the native `<input type="range">` with `accent-accent` exactly as shipped (it already
  themes via `--accent` and Chromium renders a filled track natively).
- **No custom track/thumb CSS.** The originally-approved custom recipe (4px bordered track,
  `--sv` gradient fill, 14px canvas-ringed thumb) is **rejected** — kept below for reference only.
- The one real fix (was §9.D): the roundness slider (ThemeScreen.tsx:392) is **uncontrolled**
  (`defaultValue`), so its thumb goes stale when a theme switch changes the roundness state —
  make it controlled (`value=` + onChange). The volume and glass sliders are already controlled
  and need nothing.

Rejected-for-reference recipe (do not implement):
```css
input[type=range].slider { appearance:none; height:4px; border-radius:9999px;
  border:1px solid var(--edge-dim);
  background: linear-gradient(90deg, var(--accent) var(--sv,50%), var(--inset) var(--sv,50%)); }
input[type=range].slider::-webkit-slider-thumb { appearance:none; width:14px; height:14px;
  border-radius:50%; background:var(--accent); border:2px solid var(--canvas);
  box-shadow:0 1px 2px rgba(0,0,0,.2); }
```

### 1.6 State family (`components/ui/states.tsx`) — changes 31–33

Shared anatomy `[mark] message [action]`; block variant (list surfaces) uses `text-sm`, inline
variant (sections) uses `text-2xs`; marks: braille spinner = working, nothing = empty,
destructive dot = failed.
```
LoadingState  block:  flex items-center justify-center gap-2 py-8 text-sm text-fg-muted
                      <BrailleSpinner size="sm"/> "Loading {what}…"   (always names the thing)
              inline: flex items-center gap-2 px-1 text-2xs text-fg-muted  (BrailleSpinner xs)
EmptyState    block:  flex flex-col items-center gap-2 py-8; message text-sm text-fg-muted text-center
              inline: flex items-center gap-3 px-1; message text-2xs text-fg-muted
              optional action = Button secondary sm ("Clear filters", "Browse themes")
ErrorState    == Option C (explicitly chosen over A "quiet inline" and B "destructive-tinted callout"):
  container:  bg-inset/50 rounded-lg p-3      ← neutral, NOT red-tinted
  mark:       w-1.5 h-1.5 rounded-full bg-destructive
  recoverable: dot + message (text-fg-2, size per variant) + Retry = Button PRIMARY sm (filled —
               explicit review correction from secondary; reads white-ish on dark themes)
  general:     dot + title (text-sm font-medium text-fg) + explainer (text-2xs text-fg-dim
               leading-relaxed) + [Report bug = secondary sm → opens BugReportPopup]
               [Diagnose with Claude = primary sm → Settings → Development flow]
```
The general card **is** the reusable two-action component `docs/error-message-standards.md`
schedules for v1.3.1 — change 33 ships that roadmap item. Field errors under inputs stay short
lines: `text-3xs text-destructive` (§9.H — was written `text-[10px]`, which rule 14 itself bans;
change 34: all error text `text-red-500` → `text-destructive`; identical #DD4444 today,
theme-overridable).

### 1.7 AnchorTip (change 28) + floating chips (change 29)

- InfoPopover.tsx + SkipPermissionsInfoTooltip.tsx (a copy of it) merge into one **AnchorTip**:
  `.layer-surface` at **L4 (z-100)** portal, replacing two hand-rolled `fixed z-[9999]`
  `bg-panel border rounded-lg shadow-lg` boxes. Keep the capture-phase Esc they use (it must beat
  the parent popup's Esc — justified divergence, documented in their source).
- ZoomOverlay + ModelLoadingBar → `.layer-surface` at L4; inner buttons get focus rings;
  ZoomOverlay hover targets change `hover:bg-well` → `hover:bg-inset` (on the panel surface).

---

## 2. The full change ledger (all approved)

### Session 1 — Buttons (changes 1–14)
| # | Where | What |
|---|---|---|
| 1 | AccountSection.tsx:155 | Sign in with GitHub → Button primary **lg** (py-1.5→py-2, hover fix, ring) |
| 2 | AccountSection.tsx:600, :637 (+ LocalModelsSection:461, :484) | Delete arm → danger-outline, confirm → danger, both md; red-500 → --destructive token |
| 3 | AccountSection.tsx:630 | Cancel → secondary md (row gets shorter: py-2.5 → py-1.5) |
| 4 | ConnectGithubModal.tsx:244-258 | Footer → secondary + primary md; 4px→12px corners; text-sm→text-xs; primary finally gets hover |
| 5 | MarketplaceHero.tsx:82 | View details → primary lg (no more whole-button opacity fade) |
| 6 | MarketplaceDetailOverlay.tsx:287, :567 | Install → primary lg; Uninstall filled-inset → **bordered secondary** lg |
| 7 | FirstRunView.tsx:103, :131, :154 | Pills stay `rounded-full` + own padding (documented exception); hover → bg-accent/90; ring added |
| 8 | SettingsPanel.tsx:904, :915, :933, :950 | `bg-blue-600` buttons → Button primary (also fixes a real bug: no text-color class = near-black text on blue on Crème) |
| 9 | SettingsPanel.tsx:914, :1881 etc. | Inset-filled Cancels (`bg-inset hover:bg-edge`) → secondary |
| 10 | SettingsPanel.tsx:1825, :1888 | Scan QR / Save & Connect → primary md (rounded-sm→lg; gains desktop hover — today only `active:` reacts) |
| 11 | ToolCard.tsx:293-311 | **No change** — Yes/Always Allow/No trio keeps its semantic green/blue/red-600 colors, white focus ring, and arrow-key roving focus. Excluded from the migration. |
| 12 | ConnectGithubModal.tsx:244 | "Never mind" **removed** — rule: dialogs with an ✕ get no redundant text cancel. A Cancel stays only when it does something different from closing (e.g. collapsing the danger-zone confirm). |
| 13 | ConnectGithubModal.tsx:227-233 | Copy button **docks inside** the code container (one `bg-inset rounded` container, `padding:4px 4px 4px 8px`, code flex-1 + Copy at right edge). Copy = ghost sm with `hover:bg-edge` (ghost's default hover:bg-inset is invisible on inset surfaces). Pattern: copy-inside-container. |
| 14 | SettingsPanel.tsx:870 | Blue info banner → **accent-tinted callout**: `bg-accent/10 border border-accent/25 rounded-lg`, text `text-fg-2`. Amber "setup required" boxes stay amber (true warning status). Callout family: accent = info · amber = warning · (errors are neutral cards per change 33). |

### Session 2 — Toggles & inputs (15–21)
| # | What |
|---|---|
| 15 | One Toggle geometry 36×20 (§1.2) across ~14 sites; role="switch" + aria + ring everywhere |
| 16 | Toggle on-state **green-600 → accent** (Preferences, shared Toggle, SyncPanel's 36×20 — everything) |
| 17 | Skip Permissions + approve-all toggles → tone **danger** on --destructive (kills raw `bg-[#DD4444]`); warning text → text-destructive |
| 18 | SessionStrip.tsx:1041-1047 Create button: `#DD4444/#E55555` → Button danger; normal state (dead `hover:bg-accent`) → Button primary |
| 19 | ProvidersSection row: toggle → 36×20; Remove → danger-outline sm; Save gets approved hover; **key input unchanged — it is the TextInput baseline** |
| 20 | All text inputs → FIELD (§1.3), md + sm; ~25 sites; kills gray-focus/ring-focus/bg-canvas/bg-well/odd radii |
| 21 | All native dropdowns → custom Select (§1.3). Six sites — see inventory §3. Drawer's sort select folds into change 38 instead. |

### Session 3 — Cards (22–25)
| # | What |
|---|---|
| 22 | SkillCard (both variants) `bg-panel border` → **`.layer-surface`** + grid hover `hover:scale-[1.02] transition-transform duration-200` + `focus-visible:ring-2 ring-accent` (drawer variant keeps hover:bg-inset instead of scale). The scale lift sits behind `@media (hover: hover)` — §9.E: hover styles stick after tap on the Android WebView, and a stuck 1.02 scale is far more visible than a stuck tint. ThemeScreen theme tiles + project-view file cards follow the same rule during migration. Chat-timeline cards (PromptCard/UsageCard/ToolCard) are deliberately excluded — different species. |
| 23 | SkillCard badge system → MarketplaceCard's STATUS_TONE_CLASS pills: statuses = ok/warn tones; **identity badges (YC, User Skill, plugin pills) = accent pill** `bg-accent/15 text-accent border-accent/30` (blue-status alternative was offered, not taken); hex strips (`#4CAF50/#66AAFF/#f0ad4e`) die; Get → Button primary sm |
| 24 | STATUS_TONE_CLASS.locked: `bg-slate-500/10 border-slate-500/30` → `bg-inset/50 text-fg-dim border border-edge` (tokenized; one of the app's last 3 neutral stock-palette leaks) |
| 25 | EngineCard `bg-well border` → ProviderRow's `bg-inset/50 rounded-lg px-3 py-2.5` (borderless). Rule: in-panel rows use the SettingsRow surface. |

### Session 4 — Screens & navigation (26–30)
| # | What |
|---|---|
| 26 | **One screen layer: z-40** for Marketplace, Library, AND ProjectView (drops `z-[8000]`). Overlays always paint above screens. ⚠ Migration check: ProjectView's 8000 was deliberate (comment ProjectView.tsx:4: "above all other overlays"); verify nothing relies on Projects covering an open popup — if something does, close popups when a screen opens instead of out-stacking. SessionStrip dropdown z-9000 stays above everything (load-bearing, don't touch). ProjectView's inner modals already portal at L2/L3 and keep working. |
| 27 | One exit per surface type: screens = "Esc · Back to chat" text (wide) + bordered ✕ (narrow) — ProjectView drops its "ESC Close" pill and adopts the copy; panels = ✕ top-right (ThemeScreen's ✕ gains standard hover:bg-inset + focus ring) |
| 28 | AnchorTip (§1.7) replaces InfoPopover + SkipPermissionsInfoTooltip |
| 29 | ZoomOverlay + ModelLoadingBar → .layer-surface L4 (§1.7) |
| 30 | **Code-only, pixel-identical:** donate-confirm modal (SettingsPanel.tsx:2043 + :2367 — two near-duplicate hand-rolled `z-[9999]` scrim blocks) → `<Scrim/><OverlayPanel layer={3}>`; the 7 SettingsPanel sub-popups using raw `layer-surface fixed z-[61]` class strings (:511, :635, :713, :833, :1372, :1522, :1723) → `<OverlayPanel layer={2}>`. Overlay.tsx becomes the only z-index authority. |

Open product question, resolved by default: **Themes stays a Settings panel** (option a) — the full
theme browser already lives in Library's Themes tab; Settings is the quick-switcher. Revisit only if
Destin asks for "Themes as a full screen".

### Session 5 — States (31–34)
See §1.6. 33 = Option C explicitly (A and B rendered and rejected); Retry = filled primary
(explicit correction). 34 = text-red-500 → text-destructive everywhere error text appears.
Loading copy always names the thing ("Loading sessions…", "Loading providers…"). Providers keeps
its deliberately-quiet inline variant (its source comment says quiet was intentional).

### Session 6 — Type & tokens (35–37)
| # | What |
|---|---|
| 35 | `@theme` gains `--text-2xs: 11px`, `--text-3xs: 10px`, `--text-4xs: 9px`. Mechanical rename of ~538 raw sites (`text-[11px]`×190 → text-2xs, `text-[10px]`×313 → text-3xs, `text-[9px]`×35 → text-4xs) — **zero visual change**. Stragglers (13px ×23, 12px ×11, 15/17px ×5) fold into the nearest named size case-by-case, flagged in the PR when the fold is visible. New rule: no arbitrary `text-[Npx]`. |
| 36 | `link`/`link-hover` become optional pack tokens; when absent the engine derives them in `computeOverlayTokens`: `link = accent` when accent-fg distance > 40, else `fg-2` (the exact `--code` guard at theme-engine.ts:198-208); `link-hover` = link brightened ~15% toward fg. Fixes light-blue `#2563EB` links on every community pack (they fall back to `:root` today — verified live on halftone-dimension). Built-ins keep their hand-picked values. Contrast audit gains a link-vs-canvas check. |
| 37 | **creme.json:16-17 is wrong and shipping**: fg-muted `#9E9283` (2.47:1, fails ≥3:1) and fg-faint `#BEB3A4` (1.67:1, fails ≥1.8:1). Fix to the audited values from globals.css:133-134: fg-muted `#8A7E6E`, fg-faint `#B0A595` — a real visual legibility fix, the JSON (not the CSS) is what renders after the engine applies. Structural: `themes/builtin/*.json` becomes the single source; the globals.css `[data-theme]` blocks (anti-FOUC only) and the hardcoded copy in `audit-theme-contrast.mjs:52-77` get generated from it or pinned by a unit test that diffs all three. |

### Session 7 — Form controls (38–40)
| # | What |
|---|---|
| 38 | **SessionDrawer adopts ProjectView's FileFilterPopover** (explicit review direction — Destin wanted "a filter toggle menu thing like project view"). Key discovery: FileFilterPopover.tsx **already contains** "Hide code & configs" and "Show deleted" as Chips (:133-140) — this is component reuse, not new design. Drawer search row becomes: TextInput sm + one sliders-icon trigger (FIELD-styled) opening the shared popover (Sort chips + Visibility chips; the Type group can join later for free). The drawer's separate sort select AND both CheckboxGlyph rows are deleted. Click-outside stays parent-owned (see FileFilterPopover.tsx:9-11 comment — owning it inside races the trigger). Checkbox primitive's one remaining site: ProjectView.tsx:807 consent checkbox. |
| 39 | Radio primitive (§1.4) replaces native radios: PreferencesPopup.tsx:154 (permission-mode list), SyncSetupWizard.tsx:389 + :419 |
| 40 | **RESCOPED 2026-07-16 (§1.5):** sliders keep the native `accent-accent` look — no custom styling. Remaining work: make the roundness slider controlled (ThemeScreen.tsx:392, `defaultValue` → `value`). Volume (SettingsPanel.tsx:551) and glass (:543) unchanged. |

### Session 8 — post-approval additions (41–48) — **PROPOSED, not yet approved**

Found by the 2026-07-16 code-verification pass: whole control families the original four-agent
audit never inventoried. These need a workbench session (same before/after render + approve-by-number
method, `/ui-mockup`) before implementation. They do NOT block tranches 0–7 except where noted.

| # | What |
|---|---|
| 41 | **Button `icon` size + `CloseButton` component.** ~9 distinct icon-button idioms exist and none can go through the approved Button (no square size). The standard popup ✕ (`w-7 h-7 rounded-sm hover:bg-inset` + copy-pasted SVG) is duplicated in ≥8 files (AccountSection.tsx:93, ModelPickerPopup.tsx:316/:388, PreferencesPopup.tsx:132, AboutPopup.tsx:109, ModelProvidersPopup.tsx:109/:403, ContextPopup.tsx:128, PerformancePopup.tsx:107). Also migrates: **InputBar send (`:607`)** — the app's most-used button, currently hand-rolled `bg-accent` + the rejected `hover:brightness-110`; attachment-remove × (InputBar.tsx:481); marketplace filter icon (MarketplaceFilterBar.tsx:84); GameLobby kebab (:125); terminal scroll buttons (TerminalToolbar.tsx:66); ThemeScreen swatch delete (:177 — also kills the app's last raw `hover:bg-black/20`). `aria-label` required on every icon button. |
| 42 | **Textarea primitive** on FIELD (§1.3): 11 sites (ContextPopup:161, BugReportPopup:194/:226, PreferencesPopup:233, QuickChips:351, ContextEditorOverlay:255, RatingSubmitModal:292, ReportReviewButton:189, NoteEditor:29, MarkdownView:22). InputBar's mirror-overlay textarea excluded. Search/number/password inputs fold into change 20's sweep under FIELD. |
| 43 | **`--on-destructive` derivation** in `computeOverlayTokens`, same guard style as `--code`/change 36: white when `overlay.destructive` is dark, near-black when light. Danger Button + danger Toggle labels consume it (§9.B). Contrast audit gains a destructive-vs-on-destructive check alongside change 36's link check. Rationale: `--destructive` is pack-overridable via `overlay.destructive` (theme-types.ts:109) with **no contrast guard**, so the approved `text-white` violates rule 15 and can silently go white-on-light. |
| 44 | **Toast primitive** — one transient-feedback component replacing three uncoordinated systems: the App-global toast (App.tsx:3009, `fixed bottom-16 … bg-panel border-edge`, manual setTimeout at every call site), LikeButton's local mini-toast (LikeButton.tsx:203 — different size/radius/z), and the marketplace `role="status"` strips. Anatomy joins the §1.6 state family; `aria-live="polite"`; auto-dismiss owned by the component. |
| 45 | **SegmentedTabs primitive** — one active-state recipe for tab rows. Today: Library tabs (LibraryScreen.tsx:183 `bg-accent text-on-accent` active / `bg-inset` inactive), BugReportPopup Bug/Feature (:185 — same active, but **no** inset on inactive), project-view tabs, Settings section nav. Marketplace filter Chips stay chips (filters ≠ tabs, rule 8). **DECIDED 2026-07-16: inactive style = option B, transparent** (`text-fg-2 hover:bg-inset`); recipe: `px-3 py-1.5 rounded-md text-xs font-medium` + ring, active `bg-accent text-on-accent`. Library tabs shrink text-sm → text-xs. |
| 46 | **ProgressBar primitive** — track `bg-inset` (decision needed: ModelLoadingBar.tsx:141 uses `bg-well` today, FirstRunView.tsx:57 + LocalModelsSection.tsx:115 use `bg-inset`), rounded `bg-accent` fill (LocalModelsSection's fill is unrounded today), status-color fill via prop (UsageCard.tsx:63 keeps its inline status color). UpdatePanel gets a real bar — today download % is button-label text (:279) on a `rounded-sm` + `hover:opacity-90` button (two rejected idioms; the button itself is caught by the tranche-1 sweep). |
| 47 | **Games subtree migration** (`game/GameLobby.tsx`, GameOverlay, GameChat, ConnectFourBoard) — currently unmigrated and violating multiple locked rules: hardcoded `text-[#66AAFF]`/`#88CCFF` links (change 36 fixes link tokens everywhere *except* here), `bg-green-600`/`bg-red-600 text-white` action buttons (rule 5), `bg-indigo-950/50` panels, `focus:border-fg-dim` gray-focus input (GameLobby:446 — the exact idiom change 20 retires), and the app's only `role="menu"` (friend-row kebab, :104-195). **DECIDED 2026-07-16: option A — Accept = Button primary** (no semantic-green exception). Full migration: inputs → FIELD, links → text-link, Decline/Send → Button secondary, kebab → Button icon (41), Block confirm → Button danger, Block text → text-destructive. Keep the documented touch-padding WHY comments intact. |
| 48 | **Touch-target + sticky-hover pass** (cross-cutting): invisible expanded hit areas under `@media (pointer: coarse)` for every control below ~24px — Checkbox/Radio (14px), sm buttons (~22px tall), icon buttons, Select options; `@media (hover: hover)` guards on hover-only effects (change 22's scale lift; any future lift). Zero visual change on desktop. Motivation: the spec chose the 36×20 Toggle *for* Android touch, then specced 14px checkboxes — one shared renderer means every control is a phone control. |

**Policy decisions recorded (not numbered changes):**
- **Native `title=` tooltips stay** for icon hints (~231 across 63 files). AnchorTip (change 28) is for rich/click-open info, `title` for hover hints — two tools, one policy, documented exception to rule 9. Migrating 231 sites to a custom tooltip is cost without payoff.
- **Native color inputs stay** (ThemeScreen.tsx:378, :391) — the OS color picker is a documented exception to rule 9; building a themed color picker is a project, not a consistency fix.
- **TerminalToolbar key row** (Esc/Tab/Ctrl buttons) is excluded — it deliberately mirrors QuickChips and is a keyboard-emulation species, not action buttons.
- **Drag affordances** (SessionDrawer resize handle :455 `hover:bg-accent/30`, CommandDrawer grab pill :198) — left as-is, noted as an idiom to revisit if a third drag handle appears.

---

## 3. Native/OS-control inventory (corrected §9.I — the original "complete list" missed four input types)

| Location | Control | Replacement | Change |
|---|---|---|---|
| SessionDrawer.tsx:357 | native select (file sort) | folds into FileFilterPopover sort chips | 38 |
| ThemeScreen.tsx:402 | native select (particles) | Select sm | 21 |
| RuntimeBinding.tsx:187 | native select (provider) | Select sm (field classes converge per 20) | 21 |
| RuntimeBinding.tsx:212 | native select (model) | Select sm | 21 |
| ProvidersSection.tsx:444 | native select (add-provider type) | Select md | 21 |
| SkillEditor.tsx:125 | native select (category) | Select md | 21 |
| SessionDrawer.tsx:579 + :592 | custom CheckboxGlyph filter rows | FileFilterPopover Visibility chips | 38 |
| ProjectView.tsx:807 | raw native checkbox (delete-consent) | Checkbox | 38 |
| PreferencesPopup.tsx:154 | native radios | Radio group | 39 |
| SyncSetupWizard.tsx:389 + :419 | native radios | Radio group | 39 |
| SettingsPanel.tsx:551 | native range (volume) | styled Slider | 40 |
| ThemeScreen.tsx:392 + :543 | native ranges | styled Slider | 40 |
| EngineCard.tsx:145 | native number input (context length) | FIELD styling, keeps `type="number"` | 20 |
| MarketplaceFilterBar.tsx:78 + :140 | native search inputs (two different treatments in one file) | FIELD sm | 20 |
| index.tsx:72, FirstRunView.tsx:118, ModelProvidersPopup.tsx:430, ProvidersSection.tsx:330 + :487, SettingsPanel.tsx:983 + :1878 | password inputs (API keys) | FIELD, keeps `type="password"` | 20 |
| ThemeScreen.tsx:378 + :391 | **native color inputs** | **KEEP — documented exception** (OS color picker; see Session 8 policy notes) | — |

Verified absent: no other native `<select>`, `type="checkbox"`, `type="radio"`, `type="range"` in
the renderer. No date/file inputs (file picking = Electron dialogs). Corrections to the
original audit: LocalModelsSection.tsx:204's "faked select" is actually a search input with a
clear button — covered by change 20, not 21. The original §3 claimed "no color inputs" and listed
no number/search/password inputs — all four exist (rows above, found 2026-07-16); the color
inputs are now an explicit rule-9 exception rather than a false negative. Native `title=`
tooltips (~231 across 63 files) are also a documented rule-9 exception (Session 8 policy notes).

---

## 4. Implementation plan

**Workflow:** worktree off `youcoded` master (per workspace rules); one commit per surface/file,
SettingsRow-redesign playbook (see merge `eb2036a3` for the pattern); WHY comments at edit sites;
verify with `npm test && npm run build` in `youcoded/desktop` + a `bash scripts/run-dev.sh` visual
pass cycling Light/Dark/Midnight/Crème **and halftone-dimension** (install from the themes registry)
per tranche. Android: the renderer is shared, so no Kotlin work; `./gradlew assembleDebug` re-bundles
the web UI automatically. No IPC changes anywhere in this spec.

**Tranche 0 — foundations (small, land first):**
- `@theme` additions: `--text-2xs/3xs/4xs` (35).
- theme-engine.ts: link/link-hover derivation in `computeOverlayTokens` (36) **and `--on-destructive`
  derivation (43 — same guard pattern, same commit; the danger Button consumes it from day one)**.
- creme.json contrast fix (37 immediate part) + the triple-source pinning test (37 structural part
  can be its own commit; a vitest that diffs builtin JSON vs the globals.css blocks vs the audit
  script's copy is the cheap version).
- **Protection-cascade fix (was risk 1, now a confirmed task):** scope globals.css:843 to
  `.layer-surface .bg-accent:not(:hover)` + add an explicit hover companion rule, and add the
  missing `.layer-surface .bg-destructive` protection rule (see risk 1 below). Without this,
  every popup button's approved hover is dead on arrival.
- Create `components/ui/` with Button (incl. `icon` size — the size ships even while its
  migration change 41 awaits approval), Toggle, field.ts (+ Textarea), Select, Checkbox, Radio,
  states.tsx, AnchorTip — **with pinning tests** (variant class output, role/aria attributes,
  disabled classes) per the workspace "pinning test first" rule.

**Tranches 1–7** (independent after tranche 0; order by payoff): 1 Buttons (changes 1–14, ~50 files
— the `bg-accent text-on-accent` grep returns the worklist), 2 Toggles+inputs (15–21),
3 Form controls (38–40), 4 Cards (22–25), 5 States (31–34, includes wiring Report bug →
BugReportPopup and Diagnose → Development flow), 6 Screens & nav (26–30, includes the z-8000
behavior check), 7 Type-scale rename sweep (35's mechanical part — do LAST so earlier tranches
don't churn it).

**Tranche-1 sweep triage (§9.J):** the `bg-accent text-on-accent` grep hits non-button surfaces
too — sort each hit before converting: tab/segmented actives (LibraryScreen, BugReportPopup
Bug/Feature) → change 45, NOT Button; TerminalToolbar key row → excluded (Session 8 policy);
InputBar send → change 41 (icon Button); games subtree → change 47 decision; BugReportPopup and
UpdatePanel CTAs → genuine Button conversions (both currently use rejected hover idioms). If
Session 8 isn't approved yet when tranche 1 runs, leave the 41/45/47 hits untouched — don't
half-convert them to md Buttons.

**Tranche 8 (after Session 8 approval):** 41 icon buttons + CloseButton, 42 Textarea sweep,
44 Toast, 45 SegmentedTabs, 46 ProgressBar, 47 games (per decision), 48 touch/hover pass.

**Known implementation risks (check these early):**
1. **Protection cascade vs hover — CONFIRMED, no dev check needed (§9.K):** globals.css is
   Tailwind v4 (`@import "tailwindcss"`), so utilities live in cascade layers while
   `.layer-surface .bg-accent` (:843) is unlayered — unlayered beats layered unconditionally.
   `hover:bg-accent/90` on any element that also carries `bg-accent` inside `.layer-surface` never
   fires. Fix is a tranche-0 task (scope with `:not(:hover)` + hover companion rule). Two more
   verified facts: only `bg-inset` and `bg-accent` have protection rules — there is **no**
   `.layer-surface .bg-destructive`, so danger buttons in popovers go translucent on wallpaper
   themes while primary stays opaque (add the rule in tranche 0); and `.panel-glass`
   (globals.css:821-826) has the same two-utility coverage, same gap.
2. **ProjectView z-40** (change 26) — see the ⚠ in §2.
3. **Toggle knob position with off-state border**: the 1px border shifts the content box; keep the
   knob positions (18px/2px) visually verified on both states.
4. **`hover:scale-[1.02]` on SkillCard** needs `transition-transform` and may interact with the
   drawer grid's layout — the drawer variant deliberately keeps bg-hover instead.
5. **FileFilterPopover reuse**: its click-outside is owned by the parent (ProjectView listens on the
   wrapper) — SessionDrawer must replicate that wiring, not add its own (racing bug documented in
   the component header).
6. Buttons that render inside `.layer-surface` popovers keep opaque accent via the protection
   cascade on wallpaper themes — that's intended behavior, don't "fix" it.

---

## 5. Rules this locks in (for the eventual design-system doc + react-renderer rule update)

1. Every button goes through `ui/Button` — never hand-roll `bg-accent text-on-accent`.
2. One radius for controls: `rounded-lg`. Pills are a documented exception (first-run CTAs).
3. Hover = background fade (`/90` mix), never brightness or whole-element opacity.
4. Everything interactive has the focus ring (or the theme's custom_css override).
5. One destructive style on `--destructive`, with text via derived `--on-destructive` (never
   hardcoded white); status colors (amber/green/blue/red statuses) stay theme-independent;
   **action buttons never use stock palette colors**.
6. Info callouts are accent-tinted; warnings amber; errors are neutral cards with a destructive dot.
7. Dialogs with an ✕ get no redundant text cancel. Copy buttons dock inside their containers.
8. Booleans: Toggle (settings/state) / Checkbox (consent) / chips (filters). Option lists: Radio.
9. No OS-rendered control anywhere: Select/Checkbox/Radio/styled-Slider only. Documented
   exceptions: the OS color picker (ThemeScreen) and native `title=` hover hints on icon buttons.
10. Grid cards are `.layer-surface` + lift + ring; in-panel rows are `bg-inset/50`; chat bubbles
    are their own species.
11. Screens are pages at z-40; overlays paint above; Overlay.tsx is the only z-index authority;
    tooltips/floating chips are `.layer-surface` at L4.
12. Screens exit with "Esc · Back to chat"; panels close with ✕.
13. Loading/empty/error use the state family; every error is specific+Retry or general+two-actions.
14. Type comes from the named scale (`text-4xs…text-sm…`); no arbitrary `text-[Npx]`.
15. Every color a component consumes is a settable or derived token — nothing falls back to `:root`.

Proposed with Session 8 (locked only once 41–48 are approved):

16. Icon-only buttons go through Button `size="icon"` (or `CloseButton`); `aria-label` required.
17. Hover-only effects (scale lifts) sit behind `@media (hover: hover)`; controls smaller than
    ~24px get invisible coarse-pointer hit-area expansion — the renderer is always also a phone UI.
18. Transient feedback goes through Toast; tab rows through SegmentedTabs; progress through
    ProgressBar (`bg-inset` track, rounded fill).

---

## 6. Audit findings this session (context for why; condensed)

From the 2026-07-15/16 four-agent audit: no `ui/` dir or Button/Input primitives existed;
`bg-accent text-on-accent` hand-rolled ~102× across ~50 files (5 radii × 4 hover idioms + one
hardcoded-blue family); 4 toggle geometries (~14 sites, 2 with aria); 3 input focus paradigms;
5 destructive-red idioms across 54 files incl. raw `#DD4444`/`#E55555` hexes; ~80% of buttons had
no focus-visible style; three visually-identical filter pills used three different ARIA roles;
SkillCard vs MarketplaceCard mixed surfaces in the same grids; screens split between z-40 and
z-[8000]; two hand-rolled z-9999 tooltips; ~579 arbitrary `text-[Npx]` sizes; `--link` outside the
theme contract; creme.json/globals.css/audit-script triple-source already drifted. Healthy and
untouched: the overlay layer system (~40 compliant components), `useEscClose` (48 files), the
15-token community theme contract + CI contrast audit, tokenized radii, `canonicalize`d paths.
Guardrail gaps (no ESLint at all, no visual regression, 4/143 components tested) are follow-on
work, not part of the 40 changes — see §8.

Doc rot found on the way: `youcoded/desktop/docs/theme-spec.md` is badly stale (says "DestinCode",
wrong localStorage key, pre-engine theming instructions) — ROADMAP bug filed 2026-07-16.

---

## 7. Design artifacts (the approved renders — pixel-faithful, interactive)

| Session | Changes | Artifact |
|---|---|---|
| 1 Buttons (before/after per surface) | 1–14 | https://claude.ai/code/artifact/6e55b49d-04e1-43a0-aef5-a89868d21b0e |
| 2 Toggles & inputs | 15–21 | https://claude.ai/code/artifact/e1c54c5d-49ab-4fbd-8686-30adece5a8cd |
| 3 Cards | 22–25 | https://claude.ai/code/artifact/99e22b90-6120-4dcf-a407-dd7a9291c510 |
| 4 Screens & navigation | 26–30 | https://claude.ai/code/artifact/664200fe-ea6b-46e1-80f3-675b62264dcf |
| 5 States (final = section 20 + Option C) | 31–34 | https://claude.ai/code/artifact/9d552e5e-014e-4ad0-8b59-f0c4546221ec |
| 6 Type & tokens | 35–37 | https://claude.ai/code/artifact/15b04909-a6ee-4ae3-889d-8df5fb560ddb |
| 7 Form controls + inventory | 38–40 | https://claude.ai/code/artifact/b54205c3-ce04-42e7-b26e-8b13f9ab9b83 |
| 8 Post-approval additions (+ §9 A–E re-approval renders) | 41–48 | https://claude.ai/code/artifact/7dae2904-21ba-47ac-af1f-3f97eae68453 — v3, iterating. **Decided 2026-07-16: 45→B (transparent inactive), 47→A (Button primary), §9.A rejected (offset ring stays), change 40 rescoped to native sliders.** Still awaiting final approval by number: 41, 42, 43, 44, 46, 48, B, C, D-rescope, E. |

The mockup method used to produce these is captured as the workspace skill `/ui-mockup`
(`.claude/skills/ui-mockup/SKILL.md`) — use it for any future UI design work.

---

## 8. Follow-on guardrails (recommended, NOT yet approved as changes)

So the 40 changes stay fixed after they land: (a) `youcoded/docs/ui-primitives.md` — component
catalog + token reference + the §5 rules, replacing stale theme-spec.md; (b) 3–4 mandate lines in
`.claude/rules/react-renderer.md` pointing at the primitives; (c) a mechanical `audit-ui-tokens`
pass for `/audit` (grep-ban: new `bg-accent text-on-accent` outside ui/, arbitrary `z-[`,
`text-[Npx]`, stock reds/greens on actions, `bg-black/40`); (d) ESLint (repo has none);
(e) extend the ToolCard sandbox toward a component workbench (archived plan
2026-04-26-dev-sandbox-tooling.md) — natural target for the ROADMAP visual-regression idea.
Raise these with Destin when implementation starts. The §5 rule additions 16–18 and the Session 8
policy notes fold into (a)–(c) once approved.

---

## 9. Amendment log (2026-07-16, post-approval code-verification pass)

Sessions 1–7 were approved against rendered artifacts; the items below change what was approved
or correct false claims, so they're logged individually. A–E change approved recipes and should
get a quick re-approve (they'll be rendered alongside Session 8 in the workbench); F–K are
corrections/verifications that don't change any approved pixel.

| # | What changed | Why |
|---|---|---|
| A | **REJECTED by Destin 2026-07-16 (Session 8 workbench)** — the approved offset ring stays. Original proposal: drop the offset because it has no codebase precedent and paints a solid canvas-colored halo on panel surfaces (MarketplaceCard.tsx:158 etc., TagPicker.tsx:90) | Destin reviewed both variants rendered in a real popup footer and kept the offset; halo behavior noted and accepted |
| B | danger variant: `text-white` → `text-on-destructive` (derived, change 43) | `--destructive` is pack-overridable with no contrast guard; hardcoded white violates rule 15 and can go white-on-light |
| C | Toggle knob: `bg-white shadow-sm` → `bg-white border border-edge-dim shadow-sm` | Verified ~1.2:1 knob-vs-track on Crème's off state (`--inset` #DDD1BE); shadow alone was the only separator |
| D | **Superseded by the change-40 rescope (§1.5, 2026-07-16):** sliders stay native `accent-accent` (Destin prefers today's look), so the `--sv` fill wiring is moot. Surviving fix: roundness slider becomes controlled | Roundness uses `defaultValue` and its thumb goes stale on theme switch today; volume/glass are already controlled |
| E | Change 22 scale lift wrapped in `@media (hover: hover)` | Hover styles stick after tap on Android WebView; a stuck 1.02 scale is visible |
| F | FIELD gains `disabled:opacity-50 disabled:cursor-not-allowed` | Disabled fields exist today (EngineCard.tsx:143, InputBar.tsx:604, ReportReviewButton.tsx:197) and would have lost their affordance |
| G | Select menu gains `max-h-64` scroll + scroll-into-view + reposition-on-scroll + typeahead | RuntimeBinding model select renders a dynamic catalog (dozens of entries); all six sites live in scrollable panels |
| H | §1.6 field-error size `text-[10px]` → `text-3xs` | Rule 14 bans arbitrary sizes; spec self-consistency |
| I | §3 inventory corrected: number (EngineCard:145), search (MarketplaceFilterBar:78/:140), password (6 sites), color (ThemeScreen:378/:391) inputs exist | Original "complete list" claim was false; color inputs + `title=` tooltips became explicit rule-9 exceptions |
| J | Tranche-1 sweep triage added | The `bg-accent text-on-accent` grep also hits tabs, the send button, TerminalToolbar, and games — converting those to md Buttons would be wrong |
| K | Risk 1 upgraded from "verify in dev" to confirmed tranche-0 task; missing `.layer-surface .bg-destructive` protection rule found | Tailwind v4 layering makes the outcome certain statically; only bg-inset/bg-accent have protection rules today |
