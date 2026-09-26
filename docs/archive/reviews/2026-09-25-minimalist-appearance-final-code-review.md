# Minimalist Appearance — final pre-merge code review

Fresh, read-only review per `scripts/ui-review/code-reviewer.md`. Scope: `youcoded` PR #569
(branch `session/theme-minimal-chrome`, 57 files / ~3.7k lines), `wecoded-marketplace` PR #104
(7 files), `wecoded-themes` PR #35 (preview.png swaps + vendored `contrast-rules.js` + a comment),
workspace PR #201 (docs/decks/scripts, skimmed). Contract read:
`docs/archive/design/2026-09-20-minimalist-chrome/minimalist-chrome.ink-tuning.contract.json`
(rows R1/R2, both `checkedBy: deck`, signed `yes` for theme `midnight` in
`minimalist-chrome.ink-tuning.contract.answers.json`).

## Verify summary

`bash scripts/verify.sh --full youcoded` (from the workspace root):

```
PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (full suite)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)
OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

`wecoded-themes`: `node --test scripts/*.test.mjs` — 12/12 pass. `node scripts/audit-contrast.mjs`
— all 8 themes pass HARD/SURFACE checks (2 pre-existing SOFT warnings on `halftone-dimension` and
`morning-rounds`, unrelated to this branch's preview.png-only diff — neither theme's manifest or
tokens changed here).

`wecoded-marketplace`: no dedicated test file for the theme-builder skill itself
(only `wecoded-themes-plugin/skills/theme-builder/scripts/build-mascot.test.mjs`, unrelated to
this diff's files). Ran the skill's own parity guard instead: `node
wecoded-themes-plugin/skills/theme-builder/scripts/sync-check.cjs` → `✅ theme-preview.css is in
sync with globals.css`.

## Findings

- F1 — `wecoded-themes/.github/workflows/validate-theme.yml` ("Every changed theme bumped its
  version" step) — CONFIRMED — the CI gate treats a preview.png-only diff as a "content change"
  requiring a manifest version bump, but it isn't one: neither platform ever downloads
  `preview.png` on install. Confirmed by reading `youcoded/desktop/src/main/theme-marketplace-provider.ts`
  `installTheme()` (only iterates `entry.assetUrls`) and its Android mirror
  `youcoded/app/src/main/kotlin/.../SessionService.kt` (`"theme-marketplace:install"` branch,
  same `assetUrls`-only loop) — both match `wecoded-themes/scripts/build-registry.py`'s
  `collect_asset_urls()`, which only maps manifest-referenced assets into `assetUrls`; `preview`
  is a separate top-level registry field, never in `assetUrls`. `ThemeCard.tsx`'s own WHY comment
  states this outright ("installing a community theme downloads its manifest and assets but NOT
  preview.png"), which is why it falls back to the registry's live `preview` URL — refreshed on
  the provider's 15-minute cache, independent of any version match. So an installed user's next
  registry fetch shows the new picture immediately; no reinstall, no version bump, nothing
  "invisible ... forever" (the workflow step's own comment's stated risk). This is presently
  failing CI on 8 themes in PR #35 for a change that cannot affect any installed user. Fix: have
  `changed-theme-slugs.mjs` (or the version-bump step) exclude a theme whose only changed file
  under `themes/<slug>/` is `preview.png` from the bump requirement — mirroring the exclusion
  `theme-marketplace-provider.ts` already applies to its content hash ("excluding preview.png").
- F2 — `youcoded/desktop/src/renderer/themes/theme-engine.ts` (`FLOAT_CHROME_GLASS`, ~L550) /
  `styles/float-chrome.css` — PLAUSIBLE — the `float` chrome style gives `.quick-chip`,
  `.quick-chip-edit`, `.status-bar > button`, `.status-bar .status-chip` and every
  `.header-controls-left/-right > button` its OWN `backdrop-filter`, rather than one shared glass
  surface. `QuickChips.tsx` renders a user-configurable, unbounded-in-principle row of chips, each
  now its own backdrop-filter root — the same physical shape (N repeated elements, N
  backdrop-filters) that `.claude/rules/react-renderer.md` calls out for `.layer-surface` on a
  repeated element ("Windows Electron drops their paint per card — shipped twice"), even though
  this code doesn't use the `.layer-surface` class the rule and its guard
  (`drawer-card-glass.test.ts`) actually check. I found no test in this branch that renders a
  chip-heavy row and checks Windows/Electron paint. Confirmed only by reading the CSS and
  `QuickChips.tsx`; I did not reproduce a paint failure (would need a Windows Electron run).
  Recommend a manual check with 10+ configured quick chips before wide release, or compositing
  the chip row behind one shared frosted surface the way `.input-bar-container form` already is.
- F3 — `youcoded/desktop/src/renderer/themes/wallpaper-header-ink.ts` (`deriveWallpaperHeaderInk`,
  the comment above the `keys` loop vs. the comment directly above the `tuneDot(statusColors[key],
  dotPixels, 2.5, .1)` call) — PLAUSIBLE, doc-only — the first comment says each dot "may deepen a
  long way ... but may only lighten slightly"; six lines later, the second says "Active dots may
  only nudge (±.1 lightness), never deepen" for the same `active` loop. `tuneDot`'s `maxDarken`
  parameter (`.1` for active, `.5` for the idle/gray call two lines below) literally permits
  darkening ("deepening") by up to that amount, so the second comment's "never deepen" is not what
  the code in front of it does — it's the FIRST comment's "deepen a long way" that actually
  describes the gray/idle call, not the active one it sits next to. Not a functional bug (the
  signed contract deck passed for Midnight, and the math correctly gives active dots a narrow ±
  band while idle gets a wide one, matching R2's "active keeps its hue ... idle stays quiet"), but
  a maintainer reading only the closer comment would misjudge what changing the active `maxDarken`
  does.
- F4 — `youcoded/desktop/src/renderer/components/ui/SegmentedTabs.tsx:104`
  (`TAB_BASE.replace('px-3', 'px-1 min-w-0')`) — PLAUSIBLE, minor — the `contained` variant's
  tighter padding is a string substitution on the shared `TAB_BASE` constant. It works today
  (verified `TAB_BASE` literally contains `px-3`), but nothing pins that a future edit to
  `TAB_BASE` (reordering or restating that token) keeps matching — a silent no-op would leave
  `contained` tabs at the wider padding with no type error and, as far as I found, no test
  asserting the resulting class string for that variant.

## Not covered

- Android build/tests (`./gradlew test`) — SDK and a JDK are present on this machine
  (`~/.android-sdk/platform-tools`, `java-21-openjdk`) but not run; budget went to the app diff
  and the theme-registry question instead. `preload.ts`/`remote-shim.ts`/`SessionService.kt`
  parity for the renamed `appearance` payload (`glassOverrides` → `lookOverrides`) was checked by
  reading source (both are generic key-merge pass-throughs, no field-specific Kotlin code to
  update) rather than by running the Kotlin suite.
- `styles/float-chrome.css` (547 lines) was skimmed for the rules above, not read line-by-line;
  relied on the 20+ assertions in `desktop/tests/float-chrome-pops.test.ts` (which passed) for the
  rest of its selector/gating claims.
- The ink-tuning contract's signed deck covered only the `midnight` theme (its own `themes` list).
  The code's WHY comments reason explicitly about `meadow-mist` and `golden-sunbreak` too, but I
  did not re-verify those visually — only that `audit-contrast.mjs` still passes for all 8
  community themes.
- Did not review the ~300-line design/spec/handoff docs, review-deck JSON/answers files, or the
  workspace's `scripts/ui-review/theme-previews.py` / `cdp-helpers.mjs` beyond a correctness skim
  (both read as straightforward, no findings).
- `wecoded-marketplace`'s theme-builder skill has no test directly exercising the new `float`
  chrome preset beyond `sync-check.cjs` (ran, passed) — no automated check that
  `theme-preview.css`'s new float rules render correctly, only that its property list matches
  `globals.css`'s.
