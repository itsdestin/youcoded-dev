---
status: active
date: 2026-07-16
amended: 2026-07-19 (tranche 2 BUTTON half SHIPPED — youcoded PR #181, merge `2bf29a44`)
owner: Destin (decisions) / Claude (spec)
---

> **Tranches 0 and 1 shipped 2026-07-17** — youcoded PR #164, merge `31900a2f`.
> Implementing tranches 2–8 starts at **§10**, not here: five recipes in §1–§9 are
> WRONG against the real codebase and §10 records what actually shipped and why.
> The corrections are load-bearing — following §1/§9 literally reintroduces bugs
> that are now fixed and pinned by tests.
>
> **Tranche 2's BUTTON half shipped 2026-07-19** — youcoded PR #181, merge `2bf29a44`.
> Its TOGGLE/INPUT half (changes 15–21, plus new 77/78) is NOT started.
>
> **Then read §11** (added 2026-07-19). The "~25–30 remaining hand-rolled buttons"
> §10.7 owed a triage for is really **~153 across ~50 files**. §11 is that triage:
> changes 52–76, all decided by Destin, covering every remaining button.

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
change-by-change in §9 (B–E approved by Destin in the Session 8 workbench; A rejected — offset
ring stays; D superseded by the change-40 rescope); (b) whole control families the original audit
never inventoried (icon buttons, textareas, toasts, tabs, progress bars, the games subtree) —
rendered and **approved in full as Session 8 (changes 41–51) on 2026-07-16**. The full change set
1–51 is now implementation-ready.

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
| icon (change 41 — approved) | `w-7 h-7 p-0` (square; `aria-label` required) | icon-only buttons — ✕ close, send, toolbar/utility icons |

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
- **Coarse-pointer hit areas** (change 48 — approved): sm/icon buttons render an invisible expanded
  hit target under `@media (pointer: coarse)` — the renderer is shared with Android, and sm is
  ~22px tall against the ~44–48dp touch guideline. Visuals unchanged.
- **Pill exception**: first-run hero CTAs keep `rounded-full` + their own larger padding via
  `className` override; only hover + ring normalize (change 7). ⚠ **A raw className override does
  NOT work — see §10.3.** Tailwind picks the winner by CSS source order, not class-attribute order,
  and `.rounded-full` is emitted BEFORE `.rounded-lg`, so the pills silently rendered as rounded
  rectangles. `buttonClasses()` now drops base tokens whose group the caller overrides. Shipped.
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
knob:   absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border border-edge-dim shadow-sm transition-all
        left: 17px checked / 1px unchecked (inline style)   ← §10.4 — NOT the 18/2 written here
        originally. The border is kept in BOTH states (transparent when on) because absolutely-
        positioned children resolve against the PADDING box; a border in one state only shifts
        the knob 1px on flip (this was risk 3). 17/1 against the bordered box renders the SAME
        geometry 18/2 described: symmetric 2px ends, 16px travel. Shipped + pinned.
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
keeps `type="number"`), and `<textarea>` via a Textarea primitive (change 42 — approved:
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
          ⚠ the scroll MUST live on an inner div, and the radius MUST be set inline — §10.5.
          .layer-surface sets `overflow: hidden` + `border-radius: var(--radius-xl)` as UNLAYERED
          css, and Tailwind emits utilities inside @layer utilities, so an overflow-y-auto /
          rounded-lg class ON the panel loses silently and the menu clips instead of scrolling.
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

- InfoPopover.tsx + SkipPermissionsInfoTooltip.tsx (~~a copy of it~~ — **not a copy, see §10.6**)
  merge into one **AnchorTip**: `.layer-surface` at **L4 (z-100)** portal, replacing two
  hand-rolled `fixed z-[9999]` `bg-panel border rounded-lg shadow-lg` boxes. ~~Keep the
  capture-phase Esc they use (it must beat the parent popup's Esc — justified divergence).~~
  **Superseded (§10.6): AnchorTip routes Esc through `useEscClose`.** That hook is a LIFO
  dismissal stack, so the tip — pushed after its host popup — pops first by construction, which
  is exactly what the capture-phase listener hand-rolled; going through the stack also gets
  Android hardware-back for free. Shipped.
- ZoomOverlay + ModelLoadingBar → `.layer-surface` at L4; inner buttons get focus rings;
  ZoomOverlay hover targets change `hover:bg-well` → `hover:bg-inset` (on the panel surface).

### 1.8 Session 8 primitives — exact recipes (inlined so no artifact fetch is needed)

**CloseButton** (`components/ui/CloseButton.tsx`, change 41) — Button `icon`·ghost + the shared ✕:
```
<Button size="icon" variant="ghost" aria-label={label ?? 'Close'}>
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
```
icon size = `w-7 h-7 p-0` on the Button base; ghost = `text-fg-dim hover:text-fg hover:bg-inset`.
Terminal scroll buttons keep `w-10 h-10` via className override (documented exception).

**Toast** (`components/ui/Toast.tsx`, change 44) — pixel-identical to today's global toast:
```
container: fixed bottom-16 left-1/2 -translate-x-1/2 (L4, z-100)
           layer-surface px-4 py-2 rounded-lg text-sm text-fg
           (border/shadow/background come from .layer-surface — drop the hand-rolled
            bg-panel border border-edge shadow-lg)
a11y:      role="status" aria-live="polite"
behavior:  component owns the dismiss timer (default 3000ms) — call sites stop running setTimeout
error:     prepends the §1.6 mark (w-1.5 h-1.5 rounded-full bg-destructive)
variants:  anchored (LikeButton) = same classes, absolute bottom-full right-0 mb-1 whitespace-nowrap
sites:     App.tsx:3009 (global), LikeButton.tsx:203 (adopts this look — the one visible change),
           marketplace role="status" strips (InstallingFooterStrip, InstallFavoriteCorner)
```

**SegmentedTabs** (`components/ui/SegmentedTabs.tsx`, change 45 — option B locked):
```
tab:       px-3 py-1.5 rounded-md text-xs font-medium transition-colors + Button focus ring
active:    bg-accent text-on-accent          inactive: text-fg-2 hover:bg-inset   (option B)
a11y:      role="tablist" / role="tab" aria-selected; ArrowLeft/Right roving focus
bare:      flex gap-2                        (LibraryScreen.tsx:176 — drops text-sm → text-xs)
contained: flex gap-1 p-1 bg-inset/50 rounded-lg, tabs get flex-1   (BugReportPopup.tsx:183)
```

**ProgressBar** (`components/ui/ProgressBar.tsx`, change 46):
```
track:     h-1.5 rounded-full bg-inset overflow-hidden        (never bg-well)
fill:      h-full rounded-full transition-[width] duration-300 ease-out, width = pct%
           default bg-accent; optional color prop → inline backgroundColor (UsageCard's status hues)
label:     optional right-aligned  text-xs text-fg-muted tabular-nums  percent
sites:     ModelLoadingBar.tsx:141 (bg-well→bg-inset), FirstRunView.tsx:57 (already matches),
           LocalModelsSection.tsx:115 (fill gains rounding), UsageCard.tsx:63 (color prop),
           UpdatePanel.tsx:275 (NEW bar under the footer button; the % leaves the button label —
           button becomes Button primary lg, disabled while downloading, label "Downloading…")
```

**Loading-strip spinner** (change 49): `<BrailleSpinner size="sm"/>` inserted before the
"Loading"/"Preparing" text in ModelLoadingBar.tsx:107-133 — the existing BrailleSpinner
component, standard cadence, no new primitive.

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
| 36 | `link`/`link-hover` become optional pack tokens; when absent the engine derives them in `computeOverlayTokens`: `link = accent` when accent-fg distance > 40, else `fg-2` (the exact `--code` guard at theme-engine.ts:198-208); `link-hover = color-mix(in oklab, <link> 85%, <fg>)` (exact formula — matches the approved Session 8 render). Fixes light-blue `#2563EB` links on every community pack (they fall back to `:root` today — verified live on halftone-dimension). Built-ins keep their hand-picked values. Contrast audit gains a link-vs-canvas check. |
| 37 | **creme.json:16-17 is wrong and shipping**: fg-muted `#9E9283` (2.47:1, fails ≥3:1) and fg-faint `#BEB3A4` (1.67:1, fails ≥1.8:1). Fix to the audited values from globals.css:133-134: fg-muted `#8A7E6E`, fg-faint `#B0A595` — a real visual legibility fix, the JSON (not the CSS) is what renders after the engine applies. Structural: `themes/builtin/*.json` becomes the single source; the globals.css `[data-theme]` blocks (anti-FOUC only) and the hardcoded copy in `audit-theme-contrast.mjs:52-77` get generated from it or pinned by a unit test that diffs all three. |

### Session 7 — Form controls (38–40)
| # | What |
|---|---|
| 38 | **SessionDrawer adopts ProjectView's FileFilterPopover** (explicit review direction — Destin wanted "a filter toggle menu thing like project view"). Key discovery: FileFilterPopover.tsx **already contains** "Hide code & configs" and "Show deleted" as Chips (:133-140) — this is component reuse, not new design. Drawer search row becomes: TextInput sm + one sliders-icon trigger (FIELD-styled) opening the shared popover (Sort chips + Visibility chips; the Type group can join later for free). The drawer's separate sort select AND both CheckboxGlyph rows are deleted. Click-outside stays parent-owned (see FileFilterPopover.tsx:9-11 comment — owning it inside races the trigger). Checkbox primitive's one remaining site: ProjectView.tsx:807 consent checkbox. |
| 39 | Radio primitive (§1.4) replaces native radios: PreferencesPopup.tsx:154 (permission-mode list), SyncSetupWizard.tsx:389 + :419 |
| 40 | **RESCOPED 2026-07-16 (§1.5):** sliders keep the native `accent-accent` look — no custom styling. Remaining work: make the roundness slider controlled (ThemeScreen.tsx:392, `defaultValue` → `value`). Volume (SettingsPanel.tsx:551) and glass (:543) unchanged. |

### Session 8 — post-approval additions (41–51) — **APPROVED 2026-07-16**

41–48 were found by the 2026-07-16 code-verification pass: whole control families the original
four-agent audit never inventoried. Rendered in the Session 8 workbench (see §7) and **approved
in full by Destin on 2026-07-16**, with these iteration outcomes: 45 → option B, 47 → option A,
change 40 rescoped to native sliders (§1.5), amendment §9.A rejected (offset ring stays).
49–51 were added at Destin's request during the same review (49 loading spinner; 50–51 Settings
drawer — approved with one correction, the tightened title↔subtitle gap in 51).

| # | What |
|---|---|
| 41 | **Button `icon` size + `CloseButton` component.** ~9 distinct icon-button idioms exist and none can go through the approved Button (no square size). The standard popup ✕ (`w-7 h-7 rounded-sm hover:bg-inset` + copy-pasted SVG) is duplicated in ≥8 files (AccountSection.tsx:93, ModelPickerPopup.tsx:316/:388, PreferencesPopup.tsx:132, AboutPopup.tsx:109, ModelProvidersPopup.tsx:109/:403, ContextPopup.tsx:128, PerformancePopup.tsx:107). Also migrates: **InputBar send (`:607`)** — the app's most-used button, currently hand-rolled `bg-accent` + the rejected `hover:brightness-110`; attachment-remove × (InputBar.tsx:481); marketplace filter icon (MarketplaceFilterBar.tsx:84); GameLobby kebab (:125); terminal scroll buttons (TerminalToolbar.tsx:66); ThemeScreen swatch delete (:177 — also kills the app's last raw `hover:bg-black/20`). `aria-label` required on every icon button. |
| 42 | **Textarea primitive** on FIELD (§1.3): 11 sites (ContextPopup:161, BugReportPopup:194/:226, PreferencesPopup:233, QuickChips:351, ContextEditorOverlay:255, RatingSubmitModal:292, ReportReviewButton:189, NoteEditor:29, MarkdownView:22). InputBar's mirror-overlay textarea excluded. Search/number/password inputs fold into change 20's sweep under FIELD. |
| 43 | **`--on-destructive` derivation** in `computeOverlayTokens`. ⚠ **The rule below is WRONG and was NOT implemented — see §10.2.** White vs #DD4444 is **4.213:1**, not ~4.7:1 (that figure matches #D33A3A), so the threshold fails for EVERY theme and derives near-black — a visible regression at LOWER contrast (4.131:1) than the white it replaces. Shipped as a **max-contrast pick** instead, which delivers the intent stated here. ~~Exact rule: `--on-destructive = '#FFFFFF'` when WCAG contrast(white, destructive) ≥ 4.5:1, else `'#1A1A1A'` (#DD4444 vs white = ~4.7:1, so every built-in and non-overriding pack derives white — zero visual change).~~ Danger Button + danger Toggle labels consume it (§9.B). Contrast audit gains the matching assertion: on-destructive vs destructive ≥ 4.5:1. Rationale: `--destructive` is pack-overridable via `overlay.destructive` (theme-types.ts:109) with **no contrast guard**, so the approved `text-white` violates rule 15 and can silently go white-on-light. |
| 44 | **Toast primitive** — one transient-feedback component replacing three uncoordinated systems: the App-global toast (App.tsx:3009, `fixed bottom-16 … bg-panel border-edge`, manual setTimeout at every call site), LikeButton's local mini-toast (LikeButton.tsx:203 — different size/radius/z), and the marketplace `role="status"` strips. Anatomy joins the §1.6 state family; `aria-live="polite"`; auto-dismiss owned by the component. |
| 45 | **SegmentedTabs primitive** — one active-state recipe for tab rows. Today: Library tabs (LibraryScreen.tsx:183 `bg-accent text-on-accent` active / `bg-inset` inactive), BugReportPopup Bug/Feature (:185 — same active, but **no** inset on inactive), project-view tabs, Settings section nav. Marketplace filter Chips stay chips (filters ≠ tabs, rule 8). **DECIDED 2026-07-16: inactive style = option B, transparent** (`text-fg-2 hover:bg-inset`); recipe: `px-3 py-1.5 rounded-md text-xs font-medium` + ring, active `bg-accent text-on-accent`. Library tabs shrink text-sm → text-xs. |
| 46 | **ProgressBar primitive** — track `bg-inset` (decision needed: ModelLoadingBar.tsx:141 uses `bg-well` today, FirstRunView.tsx:57 + LocalModelsSection.tsx:115 use `bg-inset`), rounded `bg-accent` fill (LocalModelsSection's fill is unrounded today), status-color fill via prop (UsageCard.tsx:63 keeps its inline status color). UpdatePanel gets a real bar — today download % is button-label text (:279) on a `rounded-sm` + `hover:opacity-90` button (two rejected idioms; the button itself is caught by the tranche-1 sweep). |
| 47 | **Games subtree migration** (`game/GameLobby.tsx`, GameOverlay, GameChat, ConnectFourBoard) — currently unmigrated and violating multiple locked rules: hardcoded `text-[#66AAFF]`/`#88CCFF` links (change 36 fixes link tokens everywhere *except* here), `bg-green-600`/`bg-red-600 text-white` action buttons (rule 5), `bg-indigo-950/50` panels, `focus:border-fg-dim` gray-focus input (GameLobby:446 — the exact idiom change 20 retires), and the app's only `role="menu"` (friend-row kebab, :104-195). **DECIDED 2026-07-16: option A — Accept = Button primary** (no semantic-green exception). Full migration: inputs → FIELD, links → text-link, Decline/Send → Button secondary, kebab → Button icon (41), Block confirm → Button danger, Block text → text-destructive. Keep the documented touch-padding WHY comments intact. |
| 48 | **Touch-target + sticky-hover pass** (cross-cutting): invisible expanded hit areas under `@media (pointer: coarse)` for every control below ~24px — Checkbox/Radio (14px), sm buttons (~22px tall), icon buttons, Select options; `@media (hover: hover)` guards on hover-only effects (change 22's scale lift; any future lift). Zero visual change on desktop. Motivation: the spec chose the 36×20 Toggle *for* Android touch, then specced 14px checkboxes — one shared renderer means every control is a phone control. |
| 49 | **BrailleSpinner on the model-loading strip** (requested by Destin, 2026-07-16): ModelLoadingBar's "Loading {model}" / "Preparing {model}" line (ModelLoadingBar.tsx:107-133) gains a `<BrailleSpinner size="sm"/>` at the left of the text, matching the §1.6 state-family anatomy (spinner = working). Standard cadence: 80ms frames, 600ms color cycle fg-dim→fg-2→accent→fg-muted→fg-faint, frozen under prefers-reduced-motion. |
| 50 | **Settings drawer goes headerless** (requested by Destin, approved 2026-07-16): delete the "Settings" title row + ✕ (SettingsPanel.tsx:245-254) entirely — rows start at the top of the drawer. Close = Esc / click outside (both already wired; the ✕ was a third path). Rule 12 gains the documented Settings-drawer exception. ⚠ The deleted header carried the macOS traffic-light top padding (`settings-drawer-header`, WHY comment at :241-244) — move that padding to the scroll body on macOS; no-op on other platforms. |
| 51 | **Settings rows: type + icons one step larger, same card size** (requested by Destin, approved 2026-07-16 with the tightened-gap correction): in SettingsRow.tsx (single source — one edit covers all rows): title `text-xs` → `text-sm`, subtitle `text-[10px]` → `text-2xs` **with `-mt-0.5`** (Destin: slightly reduce the title↔subtitle gap), row padding `py-2.5` → `py-2` (compensates the taller type; row height stays ~50px), chevron `w-3.5` → `w-4`. Inline row icons at call sites: `w-4` → `w-5` (the {YC} monogram `w-6 h-4` → `w-7 h-5`); the 32×20 icon slot, px-3, rounded-lg, and bg-inset/50 are unchanged. |

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
- Create `components/ui/` with Button (incl. `icon` size), CloseButton, Toggle, field.ts
  (+ Textarea), Select, Checkbox, Radio, states.tsx, AnchorTip, Toast, SegmentedTabs, ProgressBar
  (§1.8 recipes) — **every primitive with pinning tests** (variant class output, role/aria
  attributes, disabled classes) per the workspace "pinning test first" rule. Building all
  primitives in tranche 0 keeps tranche 8 a pure migration sweep.

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
UpdatePanel CTAs → genuine Button conversions (both currently use rejected hover idioms).
(Session 8 IS approved as of 2026-07-16, so all triage targets are live.)

**Tranche 8 (Session 8 — approved 2026-07-16):** 41 icon buttons + CloseButton, 42 Textarea sweep,
44 Toast, 45 SegmentedTabs (option B), 46 ProgressBar, 47 games (option A), 48 touch/hover pass,
49 loading-strip spinner, 50 headerless Settings drawer (mind the macOS traffic-light padding),
51 SettingsRow type/icon bump.

**Known implementation risks (check these early):**
1. **Protection cascade vs hover — CONFIRMED, no dev check needed (§9.K):** globals.css is
   Tailwind v4 (`@import "tailwindcss"`), so utilities live in cascade layers while
   `.layer-surface .bg-accent` (:843) is unlayered — unlayered beats layered unconditionally.
   `hover:bg-accent/90` on any element that also carries `bg-accent` inside `.layer-surface` never
   fires. Fix is a tranche-0 task (scope with `:not(:hover)` + hover companion rule). **DONE —
   shipped, and verified against the compiled bundle (§10.1).** `.glass-overlay` had the identical
   gap and was fixed too; `.panel-glass` (globals.css:821-826) likewise.
   ⚠ **The `.bg-destructive` claim below is FALSE — do not act on it (§10.1).** ~~there is **no**
   `.layer-surface .bg-destructive`, so danger buttons in popovers go translucent on wallpaper
   themes while primary stays opaque (add the rule in tranche 0)~~ — the protection rules exist
   ONLY to defeat the `[data-wallpaper] .bg-inset` / `.bg-accent` translucency rules
   (globals.css:751-756), and **no equivalent rule exists for destructive**, so `bg-destructive`
   is already opaque everywhere. Adding the rule fixes nothing and would newly BREAK
   `hover:bg-destructive/90` in exactly the way this risk describes for bg-accent.
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
12. Screens exit with "Esc · Back to chat"; panels close with ✕. Documented exception (change 50,
    2026-07-16): the Settings drawer has no header/✕ — it closes via Esc / click outside.
13. Loading/empty/error use the state family; every error is specific+Retry or general+two-actions.
14. Type comes from the named scale (`text-4xs…text-sm…`); no arbitrary `text-[Npx]`.
15. Every color a component consumes is a settable or derived token — nothing falls back to `:root`.

Locked with Session 8's approval (2026-07-16):

16. Icon-only buttons go through Button `size="icon"` (or `CloseButton`); `aria-label` required.
17. Hover-only effects (scale lifts) sit behind `@media (hover: hover)`; controls smaller than
    ~24px get invisible coarse-pointer hit-area expansion — the renderer is always also a phone UI.
18. Transient feedback goes through Toast; tab rows through SegmentedTabs (inactive = transparent
    `text-fg-2 hover:bg-inset`); progress through ProgressBar (`bg-inset` track, rounded fill);
    working-state text carries the BrailleSpinner per the state family.
19. Sliders stay native `<input type="range">` with `accent-accent` — no custom track/thumb CSS
    (Destin's aesthetic call, 2026-07-16); range inputs must be controlled.

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
| 8 Post-approval additions (+ §9 re-approval renders) | 41–51 | https://claude.ai/code/artifact/7dae2904-21ba-47ac-af1f-3f97eae68453 — v6, **APPROVED IN FULL 2026-07-16** (45→B; 47→A; §9.A rejected — offset ring stays; 40 rescoped to native sliders; 49–51 added at Destin's request, 51 with the tightened-gap correction) |

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

Sessions 1–7 were approved against rendered artifacts; the items below changed what was approved
or corrected false claims, so they're logged individually. Resolution 2026-07-16 (Session 8
workbench): **A rejected** (offset ring stays), **B, C, E approved**, **D superseded by the
change-40 rescope (confirmed)**; F–K are corrections/verifications that never changed approved
pixels.

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
| K | Risk 1 upgraded from "verify in dev" to confirmed tranche-0 task; missing `.layer-surface .bg-destructive` protection rule found | Tailwind v4 layering makes the outcome certain statically; only bg-inset/bg-accent have protection rules today. **The layering half is right and shipped; the `.bg-destructive` half is FALSE — §10.1** |

---

## 10. Implementation log — tranches 0 + 1 (shipped 2026-07-17)

**youcoded PR #164, merge `31900a2f`.** Three commits: `4424c7d8` (foundations),
`8321bc4f` (primitives + 56 pinning tests), `cfe1d1f0` (buttons, changes 1–14).
`tsc` clean, `vite build` clean, 2501 tests pass.

**Start here for tranches 2–8.** Everything below is a place where the approved spec was wrong
against the real code. Each correction ships with a pinning test, so "fixing" the code back to
match §1–§9 turns a test red — that's intentional.

### 10.1 The protection cascade (risk 1 / §9.K)

The layering diagnosis was exactly right, and it was worse than described: **`.layer-surface`'s
`overflow: hidden` and `border-radius` are unlayered too**, so the same trap eats any
`overflow-*` / `rounded-*` utility put on a `.layer-surface` (this bit Select and Toast — §10.5).

Shipped: `.layer-surface .bg-accent:not(:hover)` + a companion re-stating the hover as an opaque
`color-mix(in oklab, var(--accent) 90%, var(--panel))`. Same fix applied to `.glass-overlay`
(unlayered AND ungated — the spec never mentioned it) and `[data-wallpaper] .panel-glass`.
Only `.bg-accent` needs it: of the five Button variants, primary is the only one with BOTH a base
background and a background hover.

**Do not add `.layer-surface .bg-destructive`.** The spec says to; it's wrong. Protection exists
solely to defeat the `[data-wallpaper] .bg-inset/.bg-accent` translucency rules, and destructive
has no such rule — it's already opaque. Adding it would newly kill `hover:bg-destructive/90`.

Verified in the compiled bundle: `@layer utilities` spans 9654–81014; `hover:bg-accent/90` sits at
70297 (layered); the protection + companion at 101357/101504 (unlayered) — so the companion wins
the hovered state. The doubled `var(--accent)` rules in the bundle are Lightning CSS's `color-mix`
fallback pairs, not a bug.

### 10.2 `--on-destructive` (change 43 / §9.B) — arithmetic was wrong

White on `#DD4444` = **4.213:1**, not the ~4.7:1 the spec asserts (that's `#D33A3A`). The
threshold rule would fail for every theme, flip every danger button to near-black, and land at
**lower** contrast (4.131:1) than the white it replaced. Shipped a **max-contrast pick** — white
today (zero visual change, the stated intent), near-black only for genuinely pale pack reds.

Consequence: the default danger red has never met AA for a 12px label, and **nothing can fix that
except darkening the red**. Filed as a ROADMAP bug (workspace `2a96243`) rather than decided here.
The contrast audit gained the `on-destructive/destructive` pair and currently prints ✗ for all 11
themes — honest, and advisory-only.

### 10.3 className overrides don't override (change 7)

Tailwind resolves competing utilities by **CSS source order, not class-attribute order**. Measured
in our bundle: `.rounded-full` @26057 vs `.rounded-lg` @26104, and `.text-base` @51062 vs
`.text-sm` @51252 — so `<Button className="rounded-full text-base">` rendered **rounded-lg
text-sm**. The spec's documented pill exception silently produced rounded rectangles.

`buttonClasses()` now drops base tokens whose group the caller overrides (radius, font-size,
padding, w/h, gap, font-weight) — a deliberately small stand-in for tailwind-merge, since we own
every class in BUTTON_BASE/VARIANT/SIZE. Patterns match raw tokens, so `hover:*` / `disabled:*`
survive, and a text COLOR is never mistaken for a text size. **Any future primitive that accepts a
className override needs the same treatment.**

### 10.4 Toggle geometry (risk 3)

Knob is **17px/1px**, not 18/2, and the border is present in BOTH states (transparent when on).
Absolutely-positioned children resolve against the padding box, so a border in one state only
moves the knob 1px on flip. The bordered box at 17/1 renders the same geometry 18/2 described.
Risk 3's "visually verify both states" is retired — the states are now identical by construction.

### 10.5 `.layer-surface` children

Select's `max-h-64 overflow-y-auto` lives on an **inner div**; Toast sets its radius **inline**.
Both because §10.1's unlayered rules beat the utility. Anything nested in a `.layer-surface` that
needs to override `overflow` or `border-radius` must do the same.

### 10.6 AnchorTip

Esc goes through `useEscClose` (a LIFO stack — the tip pushes after its host popup, so it pops
first by construction), not the capture-phase listener the spec said to keep. Also gets Android
hardware-back for free.

`SkipPermissionsInfoTooltip` is **not** "a copy of" `InfoPopover`: one is click-toggled and
dismissible, the other hover-shown and `pointer-events-none`. AnchorTip supports both modes;
forcing one would change a call site's behavior.

### 10.7 The tranche-1 worklist is not the grep (extends §9.J)

§4's *"~50 files — the `bg-accent text-on-accent` grep returns the worklist"* is misleading. Of 53
matches: 17 belong to other tranches, and several **aren't buttons at all** —
`UserMessage.tsx:72` is the **user chat bubble** (rule 10: bubbles are their own species),
`StatusBar.tsx:546/:630` are theme-cycle swatches, `HeaderBar.tsx:268` is an active-state
indicator. §9.J caught the tabs/send/TerminalToolbar/games cases but missed these.

**Changes 1–14 are done.** ~25–30 genuinely hand-rolled buttons remain across popups/modals that
were never individually rendered — triage each hit before converting, and show Destin the list
first rather than making that many unilateral variant/size calls inside a large diff.

> **CORRECTED 2026-07-19 — the "~25–30" estimate was low by ~5×.** A full sweep of
> `desktop/src/renderer/` counted **536** raw `<button`, **274** with real button chrome, **228**
> outside the seven migrated files, and **~153 genuine hand-rolled action buttons** — plus 23
> icon-only closers (change 41) and ~52 non-button interactive surfaces that belong to other
> primitives (SegmentedTabs, cards, chips, StatusBar pills). **The triage this paragraph asks for
> is §11**, where the 153 collapse into 8 mechanical patterns + 16 judgment calls, all decided.
>
> **AND "changes 1–14 are done" is itself wrong.** Verified 2026-07-19 during the tranche 2
> implementation: four of the seven supposedly-migrated files still contained hand-rolled buttons
> carrying the full pattern set (`bg-accent text-on-accent hover:brightness-110`, `text-[11px]`,
> no focus ring) — **AccountSection ~9, LocalModelsSection ~5, SettingsPanel ~5,
> ConnectGithubModal ~2**. Those ~21 were never in the 153, because the audit trusted this
> paragraph and excluded all seven files. This is almost certainly where the "~25–30" number came
> from: someone counted the leftovers *inside* the migrated files and never swept the other ~50.
> Finished in tranche 2 — see §11.7. **Lesson: "file X is migrated" is not a durable claim unless
> a grep-ban enforces it.** §8's `audit-ui-tokens` pass, still unapproved, is what would have
> caught this at the time.

### 10.8 Smaller corrections

- Built-in themes now declare `link`/`link-hover` in their JSON so derivation can't stomp their
  hand-picked values. `ThemeTokens` gained both as optional.
- `audit-theme-contrast.mjs` **reads `builtin/*.json`** instead of keeping a hand-synced copy —
  one source removed by construction. Its `proposed` staging block is deleted (both fixes landed).
  `tests/theme-builtin-sources.test.ts` pins the JSON against the globals.css anti-FOUC blocks.
- §6 calls it a "CI contrast audit" — **it isn't**; nothing runs it and it never exits nonzero.
- `TOKEN_CSS_PROPS` (theme-engine.ts) deleted — dead since the glassmorphism refactor and
  misleading, since it read like a token registry a new token would need adding to.
- Change 48 ships as two globals.css utilities: `.coarse-hit` (invisible ≥44px hit box) and
  `.coarse-roomy` (grows flush list rows like Select options, which can't use an overflowing box
  without stealing a neighbour's taps). Both behind `@media (pointer: coarse)`.
- Checkbox pins a **literal 4px** radius, not `rounded-sm`: radii are theme tokens, and a
  big-radius pack would round a 14px box into a circle — i.e. into a Radio.

---

## 11. Button triage — changes 52–76 (decided 2026-07-19)

Discharges the debt §10.7 opened. Workbench artifact:
<https://claude.ai/code/artifact/d9174f7b-139d-44e6-b009-c2da3e7d80c1> — every "Today" render uses
the verbatim `className` from the cited source line; every "Proposed" render is real
`buttonClasses()` output on real tokens, across Midnight / Crème / Halftone Dimension / Dark / Light.

Numbering continues the 1–51 ledger. Approved by number by Destin on 2026-07-19.

### 11.1 The real scope

| Metric | Count |
|---|---|
| Raw `<button` in `desktop/src/renderer/` | 536 |
| …with real button chrome (`rounded*` + padding + `bg-`/`border`) | 274 |
| …excluding the 7 files migrated in changes 1–14 | 228 |
| **Genuine hand-rolled action buttons** | **~153 across ~50 files** |
| Icon-only close/dismiss (change 41 / §11.4) | 23 |
| Non-button interactive surfaces (rows, chips, tabs, pills) — belong to other primitives | ~52 |

§10.7's "~25–30" was low by ~5×. The 153 are not 153 decisions: 8 mechanical patterns (§11.2) cover
~120 of them, 16 judgment calls (§11.3) cover the rest.

### 11.2 Mechanical patterns — changes 52–59, 75

All approved as recommended. Context-free: apply everywhere the pattern matches.

| # | Change | Sites | Recipe |
|---|---|---|---|
| 52 | Kill `hover:brightness-110` | ~28 | → `hover:bg-accent/90`. Imperceptible on Light/Crème's near-black accent; blows out glow packs. |
| 53 | Kill `hover:opacity-90` / `transition-opacity` | ~12 | → `hover:bg-accent/90`. Fades the label; on glow themes the fill fades out from under the pack's box-shadow. |
| 54 | Radius drift → one control radius | 57 (`rounded-sm` ×11, `rounded-md` ×34, bare `rounded` ×12) | → `rounded-lg` via the primitive. Theme-scalable (12px built-in, 24px on Halftone). |
| 55 | Hardcoded blue family | 5 — SyncSetupWizard :511 :664 :911, index.tsx:80 | → `primary`. Last `bg-blue-600`/`text-white` survivors. |
| 56 | Raw destructive hex → token | 6 — SessionStrip:1066, ResumeBrowser:557, ProjectHero ×4 | `bg-[#DD4444]`/`#E55555` → `bg-destructive`; `text-white` → `text-on-destructive` (engine-derived, so a pale community red can't go white-on-pink). |
| 57 | Arbitrary font sizes → the scale | ~40 | `text-[9/10/11/12/12.5/13px]` all deleted — the `size` prop owns type. |
| 58 | Missing focus rings | ~40 | Free with `BUTTON_BASE`. Canvas offset retained (§9.A decision stands). |
| 59 | Raw `bg-red-600` → danger | 4 | Stock oklch red ≠ the app's `#DD4444`; two reds for one meaning. Filled `danger` to commit, `danger-outline` to confirm. |
| 75 | Dead hovers | 5 — GameLobby:615, GameOverlay:50, MovedGate:53, ImportProjectModal:116, ContributePopup:102 | `hover:bg-accent` over a `bg-accent` base = no feedback today. **A behavior change, not a visual one — call it out in the PR description.** |

### 11.3 Judgment calls — changes 60–74

**Two departures from the recommendation are marked ▲. Do not "correct" them back.**

| # | Decision | Sites |
|---|---|---|
| 60 | **Option A — `secondary` (outline).** The filled-grey family (`bg-inset hover:bg-edge text-fg-2`) is a second secondary; it collapses into the primitive's outline. Several sit beside a primary as genuine peers, which ghost under-weights. Rejected: ghost (B), and adding a 5th `soft` variant. | ~13 — GameLobby :161 :377 :448, GameOverlay:57, SyncSetupWizard :756 :803 :936, SyncPanel:1496, App.tsx :2841 :2895, ModelPickerPopup:518, MovedGate:46, ErrorBoundary:32. **Correction 2026-07-19:** `ConnectFourBoard:55` ("Leave Game") was listed here in error — its classes are `text-fg-dim hover:text-fg bg-inset`, which is ghost's idiom with a persistent fill, not the filled-grey family (`bg-inset hover:bg-edge text-fg-2`). It ships as `ghost`, matching the original audit. |
| 61 | ▲ **Radius + focus ring only. Colors untouched — including the inverted red.** The proposed red→blue flip on ToolCard:382 is **REJECTED**: "Always allow" stays red even though red means "No" one row below. Muscle memory on the app's most-clicked control outweighs colour-semantics tidiness; users read these by position and label. Status colours stay hardcoded per `desktop/CLAUDE.md`. | 5 — ToolCard :375 :382 :396 :405 :414 |
| 62 | ▲ **Option A — filled `danger`.** Skip-permissions gets the same weight as a real deletion. **Known + accepted consequence:** "Create Session (Dangerous)" now looks identical to "Remove project"; filled red means "stop and read this", not strictly "this destroys something". Rejected: `danger-outline` (B). | 4 + 2 toggles — SessionStrip:1066, ResumeBrowser:557, App.tsx :2832 :2838, SkipPermissionsInfoTooltip:70 |
| 63 | **Option B — promote to `primary`.** Keeps the Build-vs-Browse hierarchy without a 5th variant. Rejected: collapse to secondary (A), add `accent-outline` (C). | 1 — ThemeScreen:213 |
| 64 | **Keep dashed as a documented exception** (`secondary` + `border-dashed` override). Text lifts `fg-muted` → `fg-2`. CommandDrawer:339 is a card — excluded, handle with tranche 4. | 2 — SyncPanel:1269, QuickChips:333 |
| 65 | **Extend the pill exception to floating overlay affordances.** ChatView:823 "Jump to bottom" keeps `rounded-full`; ProjectView:701, FilesTab:366, ModelLoadingBar:155 normalize. Pills must go through `buttonClasses()` — a raw className override silently loses (§10.3). | 4 |
| 66 | **Option B — keep the orange as a status colour.** Radius/ring/hover normalize; `#FF9800` survives. Same logic as 61: billing consent is signal, not surface. | 1 — ModelPickerPopup:524 |
| 67 | **Option A — `danger-outline`.** The neutral-until-hover-red idiom is dropped: "Remove from YouCoded" / "Stop syncing" are consequential enough that hover is the wrong time to find out. "Rename" stays neutral and does useful work as the only non-red one. | 4 — ProjectHero :279(neutral) :293 :308 :316 |
| 68 | **`danger-outline` everywhere for "Remove".** Settles the ProvidersSection(red)-vs-ModelProvidersPopup(neutral) contradiction; removing a provider destroys a pasted key. Also settles SyncPanel:1662, ProjectView:821. | 2 + followers |
| 69 | **Keep `panel-glass` and `text-base` as className overrides.** The merge function exists for this. Glass re-tiers translucency bubble→panels on wallpaper themes (globals.css:843-856); a naive migration drops it. | 4 — App.tsx :2882 :2895, MarketplaceScreen:295, LibraryScreen:134 |
| 70 | **Option A — `primary`.** Nothing here is a safety decision; green is borrowed authority. Removes the last `text-white` from the games subtree. | 1 — GameLobby:367 |
| 71 | **Defer.** Backend choice tiles are a choice group, not buttons. Add the focus ring now; handle with the ~52 other non-button surfaces in tranche 4/8. | 4 — SyncPanel :1248 :1255, SyncSetupWizard ×2 |
| 72 | **Plain `disabled` now; a `busy` prop later with change 49.** The `cursor-wait` faded-fill saving state has no primitive equivalent, and BrailleSpinner will want the same slot — do the API change once. | 3 — SyncPanel:1776, SyncSetupWizard :511 :664 |
| 73 | **`danger-outline`.** `/clear` throws away the conversation and currently looks neutral, directly below a non-destructive Compact. Clearest case of styling under-selling consequence. | 1 — ContextPopup:225 |
| 74 | **REVISED — migrate the variant only, change no opacity.** Both → `ghost / sm`. Copy keeps `opacity-0`, Mark Inactive keeps `opacity-40`. See §11.5. | 2 — MarkdownContent:84, OpenTasksPopup:76 |

### 11.4 Change 76 — the CloseButton sweep

**Sweep all 23** icon-only ✕ buttons to `Button size="icon" variant="ghost"` (28×28, one hover, ring
everywhere). `aria-label` is required by the type signature, which fixes the 8 sites missing one by
construction rather than by review.

**Explicitly NOT included: `InputBar.tsx:607`, the send button.** It's the most-used control in the
app, it takes a theme-supplied custom icon (Halftone ships `icon-send.svg` + a `.send-btn` glow), and
it gets its own render before anyone touches it.

Open question flagged but not decided: the `w-4 h-4 rounded-full` attachment ✕ at `InputBar.tsx:529`
sits inside a chip — 28px may be too heavy there. Confirm with Destin at the edit site.

### 11.5 Change 74 — a correction worth reading

The original recommendation (make both buttons `opacity-0` at rest) **was wrong, and the reasoning
error is the transferable part.**

Both buttons matched a `group-hover:opacity-100` grep, so they were treated as one pattern. They
aren't:

- `MarkdownContent.tsx:84` (code-block Copy) is a **floating overlay control**, absolutely positioned
  in a code block's corner. It is **already `opacity-0`** — correct as-is, nothing to change.
- `OpenTasksPopup.tsx:76` ("Mark Inactive") is an **inline row action**. Its `opacity-40` is
  deliberate: it's the standing hint that rows are dismissible. At 0% that hint only exists once the
  cursor is already on the row.

The collision that motivated the change — resting `opacity-40` sitting below `BUTTON_BASE`'s
`disabled:opacity-50`, so a disabled button renders *brighter* than an enabled one — is **latent, not
live**: neither button ever receives a `disabled` prop.

**Therefore:** migrate both to `ghost / sm`, leave both opacity values alone, add a WHY comment at
`OpenTasksPopup.tsx:76` recording that the 40% resting opacity sits below `disabled:opacity-50` so
adding a `disabled` prop requires revisiting it. One real fix survives: the Copy button needs
`focus-visible:opacity-100` so it isn't invisible when tabbed to.

**Lesson for the rest of the sweep:** the mechanical patterns (52–59) are genuinely context-free and
safe to apply from a grep. The judgment calls are not — verify what a button *does* at the edit site
before applying a recipe derived from what its `className` *looks like*. Two buttons sharing a CSS
mechanic can be doing unrelated jobs.

### 11.6 Implementation notes

- Tranche 2 order: §11.2 mechanical patterns first (one commit per pattern, app-wide — small diffs,
  easy review), then §11.3 surface by surface (SettingsRow playbook: worktree, one commit per surface).
- Change 75 makes five inert buttons responsive. Name it in the PR body; it is not a visual-only diff.
- Changes 71 and the ~52 non-button surfaces stay out of the Button sweep entirely — they want
  SegmentedTabs and a card primitive (tranches 4 and 8).
- Change 72's `busy` prop and change 49's BrailleSpinner are the same slot; do them together, later.

### 11.7 Tranche 1 was incomplete — found during tranche 2

§10.7 claims "changes 1–14 are done". Verified false on 2026-07-19. Four of the seven files it
counts as migrated still held hand-rolled buttons with the full pattern set:

| File | Left behind |
|---|---|
| `AccountSection.tsx` | ~9 |
| `LocalModelsSection.tsx` | ~5 |
| `SettingsPanel.tsx` | ~5 |
| `ConnectGithubModal.tsx` | ~2 |

None were in §11.1's 153 — the audit excluded all seven files on §10.7's word. Swept in tranche 2.

**Two ledger gaps found the same way**, both from enumerating sites by grep rather than by reading
the surface:

- **Change 62 missed a third skip-permissions Create button.** The ledger cites SessionStrip:1066,
  ResumeBrowser:557 and `App.tsx :2832 :2838` — but those two App.tsx line numbers are the *toggle*
  and a warning `<p>`, not a button. The welcome form has its own
  `Create Session` / `Create (Dangerous)` button that nothing in the ledger named. It ships filled
  `danger` like the other two.
- **Change 61 covered only the five permission buttons.** ToolCard's AskUserQuestion
  `Submit` / `Dismiss` pair has no approved variant and remains open (see §11.4's note).

**Also dead code, found while chasing a change-55 miss:** `SyncPanel`'s confirm dialog takes a
`confirmColor: 'red' | 'blue'` prop, and the `'blue'` branch — `bg-blue-600 hover:bg-blue-500
text-white`, one of the last hardcoded-blue survivors — is unreachable. There is exactly one call
site and it passes `"red"`. Delete the branch rather than migrating it.

**What this says about the process.** Three of these four findings came from *reading the code at
the edit site*, not from the audit's greps — the same lesson §11.5 records for change 74. A grep
tells you which files match a pattern; it cannot tell you that a cited line number is a `<p>`, that
a variant branch has no callers, or that a file someone marked "done" isn't. The durable fix is
§8's still-unapproved `audit-ui-tokens` grep-ban: had it been enforcing "no raw `bg-accent
text-on-accent` outside `ui/`" since July, none of the four files could have drifted back, and the
"~25–30" estimate would never have been written.

### 11.8 Open items — ALL DECIDED 2026-07-19

Found DURING implementation, with no approved decision at the time. Each was left untouched
rather than guessed at. **Destin ruled on all seven on 2026-07-19** — decisions in the last column.
A/B/C/F/G shipped in commit `6bf5e7e2`; D and E changed shape and moved to §11.9.

| # | Item | Why it needs a call |
|---|---|---|
| A | **`SettingsPanel` "Add Device"** — `bg-blue-500/10 border-blue-500/25 text-blue-400 hover:bg-blue-500/20` | A soft-blue *outline*, not the `bg-blue-600`/`text-white` family change 55 kills, and in no change's site list. Structurally identical to change 63's accent-outline problem (a variant that doesn't exist) and change 66's orange (a status color worth keeping). Forcing it into `secondary` needs three color overrides fighting `border-edge-dim`/`text-fg-2` on CSS source order — and `mergeClasses` resolves radius/size/padding groups, NOT colors, so the result would be fragile. Wants an explicit ruling. |
| B | **`ToolCard` AskUserQuestion `Submit` / `Dismiss`** | Change 61 enumerated only the five permission buttons. Submit hand-rolls a disabled look on top of a real `disabled` prop; Dismiss uses a grey→red hover that is neither `ghost` nor `danger-outline`. Radius normalized so the rows align; variant open. |
| C | **`ContextPopup` split button** ("Compact conversation" + chevron) | A joined pair sharing one `rounded-sm overflow-hidden border border-accent` wrapper with an internal `border-l` seam. Migrating either half reintroduces per-button radius inside the clipped container and breaks the seam. Needs a split-button decision, not a variant. |
| D | **`GameLobby` "Send request"** | Decision 60 assigns `secondary`, but it is the only action in the "Add a friend" block and reads as that section's primary. Shipped `secondary` per the decision; one word to flip. |
| E | **`SettingsPanel` project-folder picker** | A `<button>` that renders the current value, left-aligned and truncating — behaves as a field, not an action. Left under the input/select exclusion; arguably belongs to the Select work (change 21). |
| F | **`InputBar` attachment-chip ✕** (`w-4 h-4 rounded-full`) | Sits inside a chip; `CloseButton`'s 28×28 may be too heavy. Excluded from the change-76 sweep pending a look. |
| G | **`InputBar` send button** (`:607`) | Deliberately out of scope for change 76 — the app's most-used control, takes a theme-supplied custom icon (Halftone ships `icon-send.svg` + a `.send-btn` glow). Wants its own render before anyone touches it. |

**Visual checks queued for Destin** (per CLAUDE.md, these are eyeball calls, not scripted ones):
- The `panel-glass` nav chips ("Your Library" / "Marketplace") and `ThemeScreen`'s "Browse Theme
  Marketplace" lost their resting `bg-inset` / `bg-panel` fills when the filled-grey family
  collapsed to outline `secondary` (decision 60). On wallpaper themes `panel-glass` is now doing the
  surface work alone. Three agents independently flagged this.
- `AccountSection`'s two Save buttons dropped their `py-2` override, so they no longer height-match
  the inputs beside them (vertically centred, slightly shorter). Change 3 set the precedent that
  rows may get shorter, so it shipped — but it is a visible alignment change.

**Decisions, 2026-07-19:**

| # | Decision | Shipped |
|---|---|---|
| A | **`secondary`.** The soft-blue was decorative, not signal — unlike change 66's orange, nothing here is a warning. | `6bf5e7e2` |
| B | **`primary` + `ghost`.** This pair DOES go through Button, unlike the permission triad above it. Submit's hand-rolled disabled look collapses into `disabled:opacity-50`; Dismiss's grey→red hover is dropped because dismissing a question destroys nothing. | `6bf5e7e2` |
| C | **Keep the joined shape** as a documented exception. The shared clipped wrapper is what makes the chevron read as "options for THAT action"; per-half `rounded-lg` would put a rounded edge inside the clip and break the seam. Adopts the app radius + real hover only. **Do not "finish" this by splitting it into two Buttons.** | `6bf5e7e2` |
| D | **Superseded — became a new pattern.** See §11.9. | — |
| E | **Not a button — becomes a `Select`.** Rides with change 21, not the field work. | deferred |
| F | **Keep 16px**, take the accessible name + focus ring. CloseButton's 28px is nearly as tall as the chip it sits on. QuickChips' bare-glyph ✕ is excluded entirely (no chrome to normalize). | `6bf5e7e2` |
| G | **Migrate.** Geometry unchanged, and it KEEPS `bg-accent` — load-bearing, because packs style this button through `.bg-accent`. `disabled:opacity-30` kept over the primitive's 50% on purpose. | `6bf5e7e2` |

**Bug found in a community pack while deciding G:** Halftone Dimension's `custom_css` contains a
`.send-btn` rule, and `send-btn` appears **nowhere** in the renderer — the selector has never
matched anything. The glow on the send button comes from the pack's separate `.bg-accent` rule.
The author clearly meant to target the send button specifically. Fix belongs in `wecoded-themes`.

### 11.9 Change 77 — the inside-field action pattern (NEW, decided 2026-07-19)

Destin, answering item D: *"I'd like Send request inside the text box at the right-hand side. I
think for all text fields that have a submit/copy, I like the button to be inside the field instead
of alongside it."*

This is a general rule, not a one-site fix.

**Precedent already in the app:** `MarketplaceFilterBar`'s search box is exactly this — a bordered
wrapper holding a borderless `<input>` plus a button inside. Standardize on that, don't invent.

**Needs a new primitive — `InputGroup`.** Today's `FIELD` (`ui/field.ts`) puts the border and
`focus:border-accent` on the `<input>` itself. This pattern moves the border to a wrapper and makes
the input bare, so the focus state must become **`focus-within:border-accent` on the wrapper** —
otherwise focusing a borderless input shows no focus state at all. A `className` cannot express this.

**Scope — ~10 genuine inline field+action pairs:** GameLobby (Send request), ProvidersSection ×2
(API key Save, add-provider), AccountSection ×2 (display name, handle), ModelProvidersPopup (search
key), SettingsPanel ×2 (remote password Set, add-device), ShareSheet (Copy), LocalModelsSection
(endpoint), QuickChips (Add Custom), TagPicker. Another ~19 `<input>`-near-`<button>` matches are
**modal footers** (button below the field) where the pattern does NOT apply — don't sweep by grep.

**Sub-rule:** when a field has both a submit and a Cancel, only the *submit* goes inside. Cancel is
not a field action, and two buttons inside stop it reading as a field. (Confirmed against the
ProvidersSection API-key row.)

**Sequencing — ship with change 20, not before.** `TextInput`/`FIELD` currently have ZERO consumers;
all ~25 text inputs are still hand-rolled because the input half of tranche 2 hasn't started.
Building `InputGroup` now means hand-rolling ~10 wrappers that get rebuilt the moment change 20
lands. Until then GameLobby's "Send request" stays `secondary` — flipping it to `primary` would be a
visual change that gets undone.

### 11.10 Change 78 — project-folder picker becomes a Select (decided 2026-07-19)

Item E. `SettingsPanel`'s folder picker is a `<button>` that renders the current value, left-aligned
and truncating. Destin: *"this should be a dropdown eventually."* So it is not a button at all — it
joins change 21's six native `<select>` replacements.

**Constraint to honour when it lands:** a folder picker cannot be a pure dropdown, because the real
answer is often a folder in no list. The workable shape is a `Select` whose options are recent/common
folders plus a final `Browse…` item that opens the native dialog. Noted so nobody ships a dropdown
that can't reach an arbitrary path.
