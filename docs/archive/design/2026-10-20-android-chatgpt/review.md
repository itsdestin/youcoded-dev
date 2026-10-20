---
status: shipped
approval: android-chatgpt-access CG-1, CG-2 and CG-3 submitted yes on 2026-10-20
app-pr: https://github.com/itsdestin/youcoded/pull/664
---

# ChatGPT account access on Android and remote clients

## Approved scope

- Android using its own backend shows the existing ChatGPT card and can start the existing OAuth sign-in flow, both after setup and during first-time setup.
- Remote clients still show the host's ChatGPT account and usage. Signed-out clients see “To connect ChatGPT, sign in on the host device.” instead of an unusable sign-in button.
- Desktop sign-in is unchanged. The ChatGPT kill switch still hides the account on every transport.
- Provider action buttons stack below account text only at phone width, preventing the name/button overlap observed in the first capture.

The implementation separates the host's `chatgptAccount` capability from the screen's existing `openExternal` capability. It also removes the obsolete General-only Android settings override. Existing server-side visitor sign-in refusals remain unchanged; the Android local owner already has permission to use that handler.

## Review evidence and limits

`chatgpt-access.review.json` and its submitted answers record three approvals. References were the existing desktop ChatGPT, Claude Code and OpenRouter provider cards, not a new card design. Pictures were inspected in Light, Midnight and Halftone Dimension, at 390px width; the Android review uses a shorter 600px viewport so the complete picture fits the review page.

Before pictures reproduce the baseline renderer with the old remote bridge's actual `chatgpt.supported: false` value. The baseline workbench had incorrectly hardcoded true, so its fake backend alone was corrected for these captures. These are not screenshots of Destin's installed phone build. No inference about that build's exact revision or complete settings navigation is made.

## Verification

- App candidate: `bee0caeac`, PR #664.
- `bash scripts/verify.sh <app-worktree>`: all gates passed, including source/test types, 6,751 tests passed and 36 skipped, knip, lint, design lint, executable invariants, named-screen opening checks and saved click paths.
- Regression tests were observed failing before the implementation: account capability/bridge exposure, remote guidance, Android Cloud providers navigation, and first-run visitor sign-in gating.
- `:app:testDebugUnitTest -x bundleWebUi -x buildRuntimeDebug`: 36 executed tests, zero failures/errors/skips. The shared backend compiled and packaged successfully.
- The broader `./gradlew test -x bundleWebUi` attempt stopped in runtime packaging because no equivalent to `apk version -t` was available. This is not a successful full APK build.
- All 16 workbench boot routes passed after the mock capability change. A fresh read-only code reviewer found no defects in the scoped account/capability changes.
- GitHub CI run `39513011814` passed all four Linux test shards, Linux AppImage/deb/rpm/pacman packaging, Android JVM checks and debug/releaseTest APK builds, evidence and the protected build gate. The CI APK results do not change the local tooling limitation above.
- App PR #664 merged to remote master as `520d503fe8964b3f5d7774e269fb47cfa1d1bd28`. Remote ancestry was confirmed and the merged tree exactly matches the locally verified candidate (`3dcc156a5ce57d0c019219cbad44752af863094a`).
- No real phone OAuth round trip, installed-app update, release tag, or Windows/macOS runtime verification was performed. The broader Android rebuild card #1 remains open.
