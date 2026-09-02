---
date: 2026-09-01
status: active
type: investigation
topic: Provider brand colours still fail contrast on the four light community themes
---

# Provider brand colours on the four light community themes

**History:** added 2026-08-31 (residue of youcoded `992f7228` / `13f6e356`). Re-checked
2026-09-01 — no commit has touched the brand-colour sets or the guard test since.

## Mechanism

The brand colours (`--brand-claude`, `--brand-openrouter`, … eleven in all) ship as two
fixed sets, one for light themes and one for dark. Measured on 2026-08-31 across 11 colours
x 7 published community themes = 70 combinations: 55 were unreadable before the mode fix,
25 after. The 30 repaired were the dark themes, which had been served the light set — that
was the actual bug.

The 25 that remain are Kuromi Dreamer, Cotton Candy Sky, Meadow Mist and Strawberry Kitty.
They were never mis-served; they already got the light set. That set was tuned against the
built-in Light theme's `#EAEAEA` panel, and a pale *tinted* panel is simply a different
background — Kuromi's worst case is `--brand-claude` at 3.19:1 on its `#D4C5E6` panel
(`wecoded-themes/themes/kuromi-dreamer/manifest.json`).

## Guard (why the residue cannot grow)

`youcoded/desktop/tests/brand-colour-modes.test.ts` pins three things: every dark community
theme clears 4.5:1, nothing anywhere drops below 3:1, and the light-theme residue may not
exceed 25 combinations.
<!-- claim: {"path": "youcoded/desktop/tests/brand-colour-modes.test.ts", "contains": "const KNOWN_LIGHT_THEME_GAP = 25"} -->

## Candidate fixes (neither in scope when the mode fix shipped)

1. **Darken the light set.** Simple, but it restyles the built-in Light and Creme themes
   too, breaking the "nothing moves on your themes" promise Destin approved on the
   2026-08-31 review deck.
2. **Derive each brand colour against the live `--panel` at runtime.** `theme-engine.ts`
   already has `contrastRatio` / `mixHex`. Fixes every present and future theme, but the
   colour stops being a fixed brand value — Claude orange would be a slightly different
   orange per theme.
