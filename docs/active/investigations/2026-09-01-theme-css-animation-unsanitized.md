---
date: 2026-09-01
status: active
type: investigation
topic: Community theme custom_css can carry unbounded animations the sanitizer never inspects
---

# Community themes can inject arbitrary `@keyframes` — the sanitizer never looks at `animation`

**History:** added 2026-08-07. Re-checked 2026-09-01 — `sanitizeCSS` and `sanitizeRigSvg`
are unchanged since; no shipped theme uses `animation` in its `custom_css`.

## Mechanism

`sanitizeCSS` in `youcoded/desktop/src/renderer/themes/theme-validator.ts` strips exactly
five constructs — `@import`, external-protocol `url()`, `expression()`, `javascript:`, and
`-moz-binding` — and nothing else. It never inspects `animation`,
`animation-iteration-count`, or `@keyframes`.
<!-- claim: {"path": "youcoded/desktop/src/renderer/themes/theme-validator.ts", "contains": "result = result.replace\\(/-moz-binding"} -->

The two lint passes in the same file (`lintCustomCss`, `lintCustomCssSelectors`) only
`console.warn`, and only about z-index and selector names.

Why it matters: the blessed `KNOWN_THEME_HOOKS` targets (`.assistant-bubble`, `.header-bar`,
`.input-bar-container`) are permanently-mounted chrome, and the app's
`[data-reduced-effects]` / `prefers-reduced-motion` rules are selector-specific — so
Reduced Effects would NOT switch a theme's own animation off. An installed theme could
therefore impose a perpetual, uncapped (~30% of a core) cost on every user with no toggle
that stops it. This is a ceiling problem, not a live one: none of `golden-sunbreak`,
`meadow-mist`, `halftone-dimension` carry `animation` in their `custom_css` (re-verified
2026-09-01: `rg -l animation wecoded-themes --glob '*.json' --glob '*.css'` returns nothing).

Second vector: `youcoded/desktop/src/renderer/components/mascot/sanitize-rig-svg.ts` strips
SMIL (`animate`, `animateTransform`, `animateMotion`, `set`) but keeps `class` / `style`, so
a theme SVG can attach the app's own `comp-*` keyframes to arbitrarily many elements.

## Fix shape

A cap rather than a ban — animation is a legitimate theming tool. Options: force `steps()`,
reject `infinite`, or make Reduced Effects a global `animation: none` on theme-injected
rules.
