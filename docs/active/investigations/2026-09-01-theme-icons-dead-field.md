---
date: 2026-09-01
status: active
type: investigation
topic: Theme icon overrides load end-to-end but nothing in the UI consumes them
---

# Theme icon overrides — wire them or remove them

**History:** added 2026-04-12 (cleanup half, from knowledge-debt); the feature half was
split out 2026-07-22 when Destin deferred the wire-or-delete call and asked for the
implementation to be tracked. Both halves merged here. Re-verified 2026-07-15, 2026-07-22
and 2026-09-01 — still zero consumers.

## Mechanism

The manifest field works all the way to the renderer and then stops:

- `youcoded/desktop/src/renderer/themes/theme-types.ts:92-94,171` types `IconSlot`
  (`'send' | 'new-chat' | 'settings' | 'theme-cycle' | 'close' | 'menu'`) and `icons?: ThemeIcons`.
- `youcoded/desktop/src/renderer/themes/theme-asset-resolver.ts:66-74` resolves every
  `icons` entry to a `theme-asset://` URL.
- The theme-builder skill documents the field; `golden-sunbreak` and `halftone-dimension`
  ship an `icons` block (`wecoded-themes/themes/*/manifest.json`).
- **Zero components read the resolved value.** `rg 'theme\.icons|\.icons\[|ThemeIcons|IconSlot'`
  over `desktop/src/renderer` (2026-09-01) hits only the type file. Every UI icon is a
  hand-inlined `<svg>`.
- Meanwhile the Library advertises the capability: `youcoded/desktop/src/main/local-theme-synthesizer.ts`
  pushes a `custom-icons` feature badge whenever a manifest has an `icons` block, so the
  badge promises something that does nothing.
<!-- claim: {"path": "youcoded/desktop/src/main/local-theme-synthesizer.ts", "contains": "if \\(manifest.icons\\) features.push\\('custom-icons'\\)"} -->

## The decision (Destin's)

**Build it**, scope to settle first:
- Slot list: keep it a small curated set (recommended — each themeable icon is a per-slot
  support burden) or grow it. The renderer has ~163 inline `<svg>` across ~69 files; do not
  let the list grow implicitly.
- There is no icon component to wire. Icons live inline plus four partial collections
  (`components/Icons.tsx`, `context-menu/menu-icons.tsx`, `project-view/icons.tsx`,
  `project-view/detail-tool-icons.tsx`). Wiring N slots means first introducing one
  `<Icon slot=… />` that falls back to the built-in glyph.
- Sanitize theme-supplied SVG — reuse `components/mascot/sanitize-rig-svg.ts` rather than
  writing a second policy.
- Recolouring: inline glyphs use `currentColor`; a file loaded via `<img>` / `theme-asset://`
  will not inherit text colour (the same trap the mascot rigs hit — hence their
  `var(--rig-accent)` convention). Decide inline-and-recolour vs `<img>`-as-is before
  authoring guidance goes out.
- Android parity comes free through the shared WebView UI; confirm no Kotlin-side icon path
  needs the same treatment.

**Or remove it**: delete `icons` from `theme-types.ts`, the manifest schema, the
theme-builder SKILL.md, the two shipped manifests' dead `icons` blocks, and the
`custom-icons` badge in `local-theme-synthesizer.ts`.

Either way the badge must be settled — today it advertises a capability that does nothing.
