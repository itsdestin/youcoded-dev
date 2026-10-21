---
status: shipped
---
# Welcome back backdrop blur

Destin approved change **WBB-1** in `welcome-back-blur.review.answers.json` on 2026-10-18.

- Welcome back remains sharp; its background uses the shared `Scrim` blur option and theme-engine glass sheet.
- No popup-specific colours, layout, radius, shadow or filter are introduced. Reduced Effects disables the blur.
- The normal Resume popup is unchanged. Wallpaper themes that already used the same scrim blur remain unchanged.
- The short design route was explicitly approved; this is a submitted visual approval, not a signed full feature-flow contract.

The submitted deck specification, answer and before/after images are retained here without rebuilding the answered deck. Shipped in app PR [#662](https://github.com/itsdestin/youcoded/pull/662), remote merge `a6c47f79ae4120aea48e0e5c514a420ce81d5de7`. The completed implementation/integration record is `docs/archive/plans/welcome-back-tools-readiness.md`; older timing evidence is archived separately.
