# Wallpaper-aware Minimalist header ink implementation plan

> **For agentic workers:** use test-driven-development and verify each red/green step. This plan is executed in the existing `theme-minimal-chrome` worktree; do not commit or ship without Destin's instruction.

**Goal:** Turn the signed R1/R2 visual design into theme-derived header ink and semantic status dots that respond to wallpaper, theme selection, and window size, only in cushion + float chrome.

**Architecture:** A pure color solver computes a panel-hue-tinted icon ink and semantic status colors from wallpaper pixels. A renderer hook on the existing HeaderBar samples the wallpaper's center-cover crop, assigns scoped custom properties, refreshes on theme/size changes, and clears on missing/unsafe images. Existing float-chrome CSS consumes only the scoped properties. The screenshot-only prototype remains design evidence, not an import into production.

**Stack:** TypeScript, React renderer, Canvas 2D, CSS, Vitest, UI Workbench.

## Global constraints
- The renderer is shared by desktop and Android; no Node APIs or bridge changes.
- No full-width header veil, rings on dots, forced black/white glyphs, or changes to composer/chips/content.
- Do not alter non-float and non-cushion themes; missing/cross-origin/unreadable wallpaper must retain current theme styling.
- Android `theme-asset://` may need image CORS, already configured in `theme-protocol.ts`; test actual image decode and canvas sampling before claiming Android parity.
- Only source-image contrast estimates are proven by the prototype; never call those a guarantee for blur/effects or changing wallpaper pixels.
- Approval sources: `minimalist-header-ink-tuning#R-1` and `#R-2` (signed contract).

## Task 1 — Pure color solver (test first)
**Create:** `youcoded/desktop/src/renderer/themes/wallpaper-header-ink.ts`, `youcoded/desktop/tests/wallpaper-header-ink.test.ts`.

- [ ] Write tests for: theme `fg-2` unchanged when every sampled control pixel meets 3:1; Meadow-like mid-blue with `panel=#DDE9DA` yields mint (not white/black) at >=3:1; a saturated green and hue-preserving red reach >=3:1 when possible; idle neutral gray stops near 2:1; mixed impossible pixels return `null` rather than reporting a false pass; invalid color gracefully returns null. Check active breathing's 0.8 composite when measuring *displayed* contrast.
- [ ] Run `cd youcoded/desktop && npx vitest run tests/wallpaper-header-ink.test.ts`, observe feature-not-found RED rather than a setup failure.
- [ ] Build a pure `deriveWallpaperHeaderInk({controlPixels,dotPixels,fg2,panel,statusColors}): HeaderInk|null`. Export `contrastRatio`, `rgbToHsl`, `hslToRgb` only if tests/use require them. Use the approved prototype's method as **design input**, not a copy: sample per painted control, preserve panel hue, brighten just enough, prefer high-chroma brighter semantic hues on dark wallpaper. Return CSS-ready RGB channels, idle contrast, and whether the bound was met; no fabricated color if impossible.
- [ ] Re-run the focused test green; document the chosen idle threshold as decorative/subordinate to active status.

## Task 2 — Browser sampling and scoped consumption (test first)
**Create:** `youcoded/desktop/src/renderer/hooks/use-wallpaper-header-ink.ts` and focused hook/component test in `youcoded/desktop/tests/wallpaper-header-runtime.test.tsx`.
**Modify:** `youcoded/desktop/src/renderer/components/HeaderBar.tsx` (normal and bare), `youcoded/desktop/src/renderer/styles/float-chrome.css`, `youcoded/desktop/tests/float-chrome-pops.test.ts`.

- [ ] Add failing tests: non-float/non-cushion and solid/gradient theme do not set overrides; resolved image wallpaper on cushion/float sets vars on header only; a theme switch clears stale vars immediately before async decode; resize samples again, never leaks listeners; a failed/tainted canvas leaves original styling; CSS confines dot hues and breathing to `.session-strip` rather than StatusPill elsewhere; theme loading after sessions works. Run focused tests RED.
- [ ] Implement a hook called in both HeaderBar and BareHeaderBar, using `useTheme().activeTheme`, `themeApplied`, the existing header ref and `ResizeObserver`. Only start work when DOM has `data-chrome-style='float'`, `data-header-lens='cushion'` and image background. Decode `Image` with `crossOrigin='anonymous'`, draw only the top 40px using the same `background-size:cover; background-position:center` geometry as `buildBackgroundStyle`; sample control centers + dot strip, with a safe canvas exception fallback. Cancel stale loads when the theme or viewport changes. Avoid polling and per-token state updates; CSS custom properties on the header propagate to late-mounting dots.
- [ ] Consume vars under the exact cushion+float selector for header button/svg icons and `.session-strip` session dots. Keep selected session's 26% backing unless approved screenshot calls for a specific override; avoid force-recoloring accent icons, counters, branded graphics, and active state indicators. Replace the `breathe` low-opacity 0.3 with a scoped 0.8 floor *only for image-wallpaper cushion float*; idle should have no animation and remain neutral, not bright white. Keep original styles if vars absent.
- [ ] Re-run focused tests GREEN; compare current `float-chrome-pops` existing invariants and fix any legitimate regressions without changing unrelated surfaces.

## Task 3 — Visual and platform proof
- [ ] Run `bash scripts/verify.sh <this worktree>/youcoded`. Check SDK/JDK availability and, if available, `JAVA_HOME=… ANDROID_HOME=$HOME/.android-sdk ./gradlew test -x bundleWebUi`; report exact result.
- [ ] Re-run six actual wallpaper Workbench shots in the approved ink-tuning review using **production code only, with no screenshot CSS injection**; verify every image theme actually loaded, no identical-to-baseline accidents. Capture no-wallpaper Midnight/Light and gradient Halftone to prove current styling unchanged. Use a second window width to exercise recompute; inspect contact sheet before serving a built before/after deck.
- [ ] Run a fresh code review and UX test within the project's UI flow, triage accepted findings, then request acceptance against the signed contract. No merge, commit or push without instruction.
