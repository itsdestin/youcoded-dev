---
name: ui-mockup
description: Render pixel-faithful YouCoded UI mockups as interactive HTML artifacts for design review. Use whenever Destin wants to see, iterate on, or approve UI/UX changes visually — "mock this up", "show me how X would look", "before/after of Y", "let me see it in the app's themes", or any design decision that needs his visual sign-off before code changes. Renders must match the live app exactly so approved markup copy-pastes back into the renderer.
---

# YouCoded UI Mockup Workflow

Established with Destin during the 2026-07-16 UI-consistency sessions (7 artifacts, 40 approved
changes — see `docs/active/specs/2026-07-16-ui-consistency-design-spec.md` for the output format
this produced). The bar: **every render uses the exact `className` strings from app source on top
of the app's real token values**, so what he approves is what ships.

## Non-negotiables

1. **Never approximate markup.** Read the actual component source and paste its class strings
   verbatim into the mockup. Cite `file:line` next to every render.
2. **Tokens verbatim** from `youcoded/desktop/src/renderer/styles/globals.css` (the four
   `[data-theme]` blocks) — plus the engine-derived values from
   `themes/theme-engine.ts::computeOverlayTokens`: `--scrim` = canvas RGB × 0.4 (dark, lum≤0.2) or
   × 0.3 (light) at 0.5 alpha; `--shadow-strength` 0.1 dark / 0.2 light; `--destructive` #DD4444
   unless the pack sets `overlay.destructive`; `--code` = accent when accent↔fg RGB distance > 40
   else fg-2.
3. **Include a community theme** — default: Halftone Dimension from
   `wecoded-themes/themes/halftone-dimension/manifest.json`. It stress-tests everything: 2-3×
   radii, hot-pink accent, glass popups, `custom_css` (glow on every `.bg-accent`, own
   focus-visible style, CMY heading text-shadow), gradient + pattern background.
4. **Implement only the Tailwind utilities the samples use**, as real escaped class names
   (`.hover\:bg-inset:hover{...}`) so app strings work unmodified. Critical value table:
   - App `@theme` remaps: `red-500`/`red-400` → `#DD4444`, `green-400` → `#4CAF50`,
     `amber-700` → `#FF9800`. Everything else stock Tailwind v4 (oklch values — e.g. blue-600
     `oklch(54.6% .245 262.881)`, green-600 `oklch(62.7% .194 149.214)`, red-600
     `oklch(57.7% .245 27.325)`, amber-500 `oklch(76.9% .188 70.08)`).
   - Opacity modifiers = `color-mix(in oklab, C N%, transparent)`.
   - `rounded[-sm/md/lg/xl/2xl/full]` map to `var(--radius-*)` (theme-scalable — never hardcode px).
   - Text: xs 12/16, sm 14/20, base 16/24; arbitrary `text-[Npx]` sets font-size only.
   - Preflight subset: `*{box-sizing:border-box;border:0 solid}`, `button{font:inherit;
     background:transparent;...}`, body line-height 1.5.
   - The app's `:focus:not(:focus-visible){outline:none}` rule (globals.css) — include it.
   - Font: `'Cascadia Mono','Cascadia Code','Fira Code',monospace` (loads locally on his machine).
5. **Wallpaper-theme glass rules** (scope under the community theme's class):
   `.layer-surface` → `color-mix(in srgb, var(--panel) <panels-opacity>%, transparent)` +
   `backdrop-filter: blur(<panels-blur>px) saturate(1.2)`; `.layer-scrim` gets `blur(8px)`;
   protection cascade `.layer-surface .bg-inset/.bg-accent` stay opaque (globals.css:839-845);
   apply the pack's `custom_css` scoped to its container.
6. **Stage components on their real surface** — settings popups on scrim+`.layer-surface`,
   marketplace/first-run on canvas, chat cards transparent over the background. Copy `.layer-scrim`
   / `.layer-surface` rules verbatim from globals.css:775-845.
7. **BrailleSpinner**, if shown, runs the real cadence: frames `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms, color cycle
   600ms through fg-dim→fg-2→accent→fg-muted→fg-faint (set `color: var(--token)` so it re-themes);
   freeze under `prefers-reduced-motion`.

## Page structure (what worked)

- **Before/after pairs per real app surface** — "Today" (exact current markup) vs "Proposed" —
  NOT abstract component grids. Destin explicitly course-corrected toward this: he wants to see
  how actual menus/pages change under a proposal.
- **Number every visible change** (`1`, `2`, …) with a one-line what/why + the rule it locks in;
  end with a **change-ledger table**. He approves/rejects **by number** in chat
  ("approve all except 4"). Never renumber approved changes — new feedback gets new numbers.
- **Theme switcher** in a sticky topbar re-theming every panel: Midnight · Crème · Halftone
  Dimension · Dark · Light (swap a `t-<name>` class on each viewport; `data-lock-theme` panels
  stay fixed for theme-specific bug demos).
- Per-surface "what to look at" note pointing at the specific theme where a difference shows
  (brightness-hover on Crème, glass on Halftone…).
- **Fidelity-notes footer**: what's verbatim, what's approximated (ambient effects, trimmed
  branches), what's representative copy. Never let an approximation pass silently.
- Interactive where it matters: hover states are real, `Tab` reaches controls, popovers rendered
  open, sliders draggable.

## Publishing & iteration

- Write to the session scratchpad dir; publish with the Artifact tool. **Same file path =
  same URL** (iterate in place per feedback); a **new session/topic = new file = new page**, and
  keep earlier pages intact for reference.
- Apply his feedback as edits + republish, and restate the change in chat. If feedback is ambiguous
  ("make them more consistent"), prefer the smallest literal reading and ask — over-extrapolating
  cost a rework in the original session.
- When he picks among options (A/B/C), keep the rejected options on the page marked
  "kept for reference — decision: X".

## After approval

Decisions must not live only in chat/artifacts: capture them in a spec under
`docs/active/specs/` (ledger + exact class recipes + artifact links + migration notes), add
ROADMAP entries, and follow the workspace knowledge rules for anything durable.
