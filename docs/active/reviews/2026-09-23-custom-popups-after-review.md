# Marketplace file and Tags & note — post-implementation review

Destin chose the single-line file header (`ui-guide-custom-popup-visual-1#M-1`, note "but style it like other headers") and divider plus conditional fade for the compact Tags editor (`#T-1`). Changes remain scoped to `FileViewerOverlay` and `SessionTagsChip`; the main Marketplace detail popup and other overlays have not been changed.

## Verification to date

- TDD: `custom-popup-shell.test.tsx` failed against the original components, then all 3 tests passed after scoped CSS/scroll hook. The dev Today guard similarly failed against stale panes, then passed after dev-only reset. A further test-first refactor replaced four newly introduced non-Tailwind CSS class names with `data-*` markers when design lint rose from the 542 warning ratchet to 546; the same tests passed again, and design lint returned to exactly 542.
- `scripts/verify.sh` then passed types, test types, related tests, dead code, lint, design lint and ast-grep. Android `./gradlew test -x bundleWebUi` exited successfully with tasks up-to-date; 102 XML files report 843 tests / 0 failures. It did not rebundle Android's shared web UI.
- The unanswered post-build acceptance deck preview self-verified Meadow Mist/Halftone Dimension at 1440×900 and 1024×768 and its contact sheet was opened. Today shows the original two-line file heading and 14px bold Tags title via dev-only CSS; Applied shows the actual selected components.

## Code review triage

Fresh reviewer found **no production issues** in the current data-attribute selectors or hooks. Its P2 concern that the dev-only `::before` eyebrow appears in both Today and unchosen `two-lines` is not a defect: both alternatives were explicitly two-line headers in `compare/registry.tsx`, while the selected `one-line` candidate uses unmodified production styling and hides the eyebrow. The added padding leaves room for that eyebrow in only those two dev-only panes. No change needed.

A fresh, independent contract grader returned **PASS** for both chosen treatments, the Today reset and scope; no concrete mismatch found. Independent post-build UX at 1024×768 (File Viewer) and 700×380 (Tags) confirmed the selected titles, scroll-fade state at the top and end, readable final content, close buttons and Tags Done action in Meadow Mist. The corrected theme-specific Halftone captures passed the same DOM assertions, but the tester could not visually inspect those final images; no Halftone visual-quality claim is made.

The UX pass exposed Escape failing in *live Workbench panes*. Diagnosis: `useEscClose` intentionally soft-fails without `EscCloseProvider`, and the dev-only `view=live` route had mounted neither the provider nor its keyboard listener. Production App already mounts the provider; this was not a verified production regression. A failing entry-route guard was added first, then the Workbench live route was wrapped in the app's existing Escape provider. The guard passed and real keyboard `Escape` via the screenshot driver closed both popups (1/1 self-verified shot apiece). Destin submitted the post-build acceptance deck on 2026-09-23: **one-line** for `M-1` and **fade** for `T-1`, both while viewing Meadow Mist (`custom-popup-headers.acceptance.answers.202609231035.json`). These two applied treatments are accepted; no broader popup or final guide rule is inferred.
