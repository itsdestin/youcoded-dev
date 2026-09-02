---
date: 2026-09-01
status: active
type: investigation
topic: A third chrome-style — bare chrome elements with no wrapping surface — is not expressible today
---

# `chrome-style: 'minimal'` (better name: `bare`) — bare chrome elements, no wrapping surface

**History:** added 2026-07-19 (Destin's ask while reviewing the rebuilt theme-builder Kit).
Re-checked 2026-09-01 — `chrome-style` still accepts only two values.

## What Destin asked for

Keep the bare minimum elements — session switcher, header icons, status chips, input area —
with **no backgrounds and no wrapping chrome**. Distinct from `floating`, which detaches
them into bordered pills.

## Why it wasn't built: not expressible today

`ChromeStyle` is `'default' | 'floating'` (`youcoded/desktop/src/renderer/themes/theme-types.ts:69`),
and `floating` is the only value that hides `.chrome-glass` (`globals.css` ~1908).
<!-- claim: {"path": "youcoded/desktop/src/renderer/themes/theme-types.ts", "contains": "export type ChromeStyle = 'default' \\| 'floating'"} -->

The closest combination — `chrome-style: floating` + `header/input/statusbar: minimal` —
gets transparent backgrounds (the `input-style: minimal` rule even wins on `!important`)
but still leaves `margin`, `border-radius`, `border: 1px solid var(--edge)` and `box-shadow`
from the floating pill rules (`globals.css` ~1534-1600), which `header-style: minimal` does
not reset (it clears only `background` and `border-bottom`). Result: outlined ghost pills,
not bare elements.

## What it needs

A real third branch in `globals.css` (hide chrome-glass, strip bar surfaces AND the pill
geometry, keep the controls), plus the manifest schema, `manifest-template.jsonc`, and a
theme-builder Kit preset. Deliberately NOT a preview-only approximation: the preview would
advertise a layout the app cannot render — the exact bug class the 2026-07-19 framed-shell
fidelity work removed.

**Naming caution:** `input-style: minimal` and `header-style: minimal` already exist and
mean something finer-grained; a third "Minimal" would be ambiguous in the Kit UI. Consider
`bare`.
