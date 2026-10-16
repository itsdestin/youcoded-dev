---
status: active
date: 2026-09-24
related: docs/active/design/2026-09-23-ui-element-review/audit/completeness-screens.md
---

# Capture repair — fixing the screenshot rig so every surface can be pictured

Follow-up to `completeness-screens.md` (2026-09-23), which found ~15 Settings plans
opening a Settings layout that no longer exists (Model Providers/Permissions were folded
into "Assistant settings" on 2026-09-05), 87 planned surfaces MISSED in the last full
sweep, and five real subsystems with zero screenshots anywhere. This pass repairs the
stale click paths, triages every MISSED/partial surface, and adds capture for three of
the five never-pictured subsystems. Work happened only in the session worktree
(`worktrees/sessions/ui-consistency-audit`); captures ran only through the isolated
workbench (`scripts/ui-review/run-review.sh`), never the live app.

## 1. Fixed: stale Settings click paths (Model Providers → Assistant settings)

Every shot below used to click a `Model Providers`, `Permissions`, or `Defaults` button
that stopped existing on 2026-09-05, when those four popups were folded into one
`Assistant settings` row (`AssistantSettings.tsx`) with a five-page nav rail (General ·
Cloud providers · Local models · Permissions · Specialists). A dead click silently no-ops
in these plans, so every affected shot was screenshotting whatever page was already open
— usually the plain Settings drawer — which is why `completeness-screens.md` called this
an IA change the plans never caught up to, not "missing pictures."

Fixed by adding the two-step `Assistant settings` row click, then a nav-rail page click
(`[role=dialog] nav button` matching the page label) in place of the old single click.
Every fix below was re-run against a live workbench and its resulting PNG opened with the
Read tool to confirm it shows the intended screen, not the Settings root.

| Plan | Shot(s) | Root cause found | Verified PNG (light) |
|---|---|---|---|
| `local-engine.json` | local-engine-card, local-engine-advanced, local-engine-rocm-guide, local-models-installed, local-model-settings, local-models-recommended | Clicked `Model Providers`; card content itself (Local engine / Advanced / Installed / Models) is unchanged, only the door to it moved to Assistant settings → Local models. **Second bug found live-testing this repair**: the Advanced-toggle click used `.closest('.rounded-lg')` from the button itself — but the button's OWN class (`SettingRow`'s `SETTING_ROW_BASE`) also carries `rounded-lg`, so `closest()` self-matched the button instead of climbing to the Local-engine card, and the click silently no-op'd. Fixed by scoping the button search to the card's descendants instead of climbing from it. | `scratch/capture-repair/shots-local-engine/light/local-engine-advanced.png`, `.../local-engine-rocm-guide.png` (now show the Advanced panel open with Speculative decoding/Compress context memory/Context length, and the ROCm "Install AMD's ROCm software first" setup box, respectively — previously identical, both collapsed) |
| `main.json` | settings-model-providers, settings-defaults, settings-permissions, permissions-stress, providers-none | Same stale row clicks. `settings-model-providers`'s old `measure` array also targeted `[aria-label='Model Providers']` and an "Add provider" button that no longer has that name/position — repointed to the dialog's real aria-label (`Assistant settings`) and its `.scroll-fade` region. | `scratch/capture-repair/shots-main/light/settings-model-providers.png` (Cloud providers page, all three provider cards + "Add provider" under "Your own API keys") |
| `assistant-settings.json` | assistant-claude, assistant-claude-skip-on, assistant-chatgpt, assistant-chatgpt-blocked, assistant-openrouter, assistant-claude-info, assistant-prefs, assistant-permissions-link, assistant-search, assistant-search-addkey | **A second, distinct bug in the SAME file**, found live-testing: `Claude Code`/`ChatGPT`/`OpenRouter` and `Web search` were never their own nav pages — they're provider CARDS stacked together on one page, `Cloud providers` (`pages.tsx`: only `general/cloud/local/permissions/specialists` exist). Clicking a nav button that never existed left every one of these 10 shots on whatever page was already open. Fixed by navigating to `Cloud providers` (or General, where Web search actually lives) and scrolling to the named card. `assistant-claude-skip-on`'s OLD target (an "Advanced" list with "Auto-approve all") is fully gone from source — `SkipPermissionsSection.tsx`'s own header comment says Destin dropped that whole idea on the review deck; repointed to the real replacement, the "Skip Permissions Mode" confirm dialog. `assistant-permissions-link` clicked a "Claude Code page" link that no longer exists anywhere in source (grepped); repointed to just confirm the Permissions page. `assistant-chatgpt-blocked`'s expect also needed fixing separately: the warning dot's aria-label is keyed by PAGE now (`Cloud providers needs attention`), not per-provider. | `scratch/capture-repair/shots-assistant-settings/light/assistant-claude.png`, `assistant-chatgpt-blocked.png` (shows the red "Cloud providers" nav dot + "Your workspace admin has turned off Codex for this account."), `assistant-claude-skip-on.png` (the real "Skip Permissions Mode" confirm dialog), `assistant-search-addkey.png` (Tavily key field, inside General) |
| `assistant-settings-r2.json` | assistant-permissions, assistant-permissions-skip-on | Stale `[aria-label='Skip Permissions']` toggle selector (renamed to `Enable Skip Permissions Mode?`) and stale expect text ("without asking you" — no longer in the copy). | `scratch/capture-repair/shots-assistant-settings-r2/light/assistant-permissions-skip-on.png` |
| `assistant-settings-r3.json` | assistant-permissions-skip-on | Same stale expect text as r2. | `scratch/capture-repair/shots-assistant-settings-r3/light/assistant-permissions-skip-on.png` |
| `chatgpt-signin.json` | providers-chatgpt-signed-in, providers-chatgpt-signed-out, providers-chatgpt-waiting, providers-chatgpt-blocked, providers-local-models | Stale row click + stale `aria-label='Model Providers'` expect/measure. | `scratch/capture-repair/shots-chatgpt-signin/light/providers-chatgpt-signed-in.png` |
| `model-brand.json` | providers-local-scrolled | Stale row click. | `scratch/capture-repair/shots-model-brand/light/providers-local-scrolled.png` |
| `narrow.json` | settings-providers, stress-permissions | Stale row click (phone-fold variant: Assistant settings' own page LIST, not a nav rail). | `scratch/capture-repair/shots-narrow/light/settings-providers.png` |
| `overlays.json` | providers-local-scrolled, local-models-interrupted-delete-confirm, local-models-delete-confirm, local-models-resuming, local-models-paused, local-models-damaged-why, permissions-scrolled | Stale row click on all seven. **Second bug found live-testing**: `local-models-resuming`/`-paused` used `clickText: "Resume"/"Pause"`, which searches the WHOLE page (shot.mjs's `textExpr`), not just the dialog — with Model Providers gone, this now sits directly over the resume-browser's own session cards, some of which also say exactly "Resume," and the "smallest element" tie-break picked the wrong one; the shot ended up closing the dialog instead of resuming a download. Fixed by scoping both clicks to `[role=dialog] button` via `eval`. | `scratch/capture-repair/shots-overlays/light/local-models-paused.png` |
| `site-gallery.json` | permissions | Stale row click (feeds the landing-page gallery stills). | `scratch/capture-repair/shots-site-gallery/light/permissions.png` |
| `electron-welcome.json` | e-settings, e-settings-account, e-settings-appearance, e-settings-backup-sync, e-settings-remote-access, e-settings-defaults, e-settings-permissions (18 "Close (Model Providers\|dialog)" regex sites) | Same stale IA, PLUS the dialog's close button label changed from "Close Model Providers" to "Close Assistant settings." **Fixed the click text but did NOT run this plan** — it drives the real built Electron app over `ATTACH_PORT`, which this session's task explicitly restricts to the isolated workbench only. Ready for whenever a future session does the real-app pass. | not executed this session |

All ten workbench-run plans above (plus the two r2/r3 round snapshots) were re-verified:
every previously-MISSED shot in this list now shows `ok` in the sweep, and every fix was
additionally opened as a PNG and read to confirm it depicts the claimed screen — not just
that its `expect` selector passed.

## 2. New captures — never-pictured surfaces

Three of the five subsystems `completeness-screens.md` flagged as having ZERO screenshots
anywhere were reachable through the workbench and are now captured for the first time.
Two remain genuinely unreachable without more engineering — see §3.

### Git file review (GitReviewView) — was completely uncapturable, now fixed with a small code change

**Root cause:** the workbench's mock IPC bridge (`mock-shim.ts`) had no `git` namespace at
all. `window.claude.git.fileStatus()` fell through the bridge's catch-all proxy twice (once
for the unknown namespace, once because the catch-all cannot tell a leaf channel from a
nested one) and resolved `[]`. `useGitFileStatus` reads `r?.ok` off that as falsy and
silently sets status to `null`, so the SessionDrawer footer's "Review Changes" button — the
ONLY door into `GitReviewView` — could never render. No plan could have opened this surface
no matter how it was written.

**Fix (app code, `youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts`, dev-only):**
added a small, deliberately GENERIC `git` fixture — `fileStatus`, `fileReview`,
`commitFileDiff`, `stage`, `unstage`, `commit`, `watch`, `unwatch`, `onChanged`. Every file
the drawer can open now reads as "one uncommitted edit, two commits of history" — real
per-file git state would need a second fixture keyed to the artifacts tree, more than a
capture needs. Verified: `npm run typecheck` clean, `npx vitest run tests/mock-shim.test.ts
tests/mock-shim-window.test.ts tests/ipc-channels.test.ts` (413/413 pass),
`bash scripts/verify.sh youcoded` green (types, tests, knip, lint, design lint,
ast-grep — see §5 for one unrelated pre-existing failure found and fixed along the way).

New plans `git-review.json` (wide) and `git-review-narrow.json` (390px phone width):
open Session Files → select `ChatView.tsx` → click "Review Changes."

| Shot | Verified PNG |
|---|---|
| git-review-uncommitted | `scratch/capture-repair/shots-git-review/light/git-review-uncommitted.png` — the uncommitted diff hunk, branch pill, two-commit log, commit-message box |
| git-review-commit-expanded | `scratch/capture-repair/shots-git-review/light/git-review-commit-expanded.png` — a historical commit card expanded to its own per-commit diff |
| git-review-narrow | `scratch/capture-repair/shots-git-review-narrow/light/git-review-narrow.png` — 390px phone width |

### Buddy Floater's own window content — excluded by design from the capture tool, reachable a different way

**Root cause was NOT what it looked like.** `completeness-screens.md` pointed at
`shot.mjs:144-145`, which excludes any target whose URL matches `buddy` — but that
exclusion only fires in `ATTACH_PORT` mode (picking the right OS window among several when
attached to the real running Electron app). The headless workbench never goes through that
code path at all — it always opens a fresh CDP target and navigates it directly, so the
exclusion never applied here. **No `shot.mjs` change was made or needed.**

What was actually missing was a plan pointed at the right URL. `index.tsx` already has an
existing, shipped dev route — `?mode=workbench&child=1&view=buddy-session` — that renders
the real, shipping `<BuddyWelcome/>` component standalone at the floater's true 320×480 size
(`CHAT_SIZE`, `shared/buddy-geometry.ts`); `?bare=1` (also existing) drops the explainer
text so the panel fills the whole viewport. New plan `buddy-floater.json` (320×480, no
plan-level `scenario=`/`latency=` needed):

| Shot | Verified PNG |
|---|---|
| buddy-welcome | `scratch/capture-repair/shots-buddy-floater/light/buddy-welcome.png` — "No Active Session" + New Session / Resume Session buttons |
| buddy-new-session-form | `scratch/capture-repair/shots-buddy-floater/light/buddy-new-session-form.png` — project folder / model / skip-permissions / Create Session |
| buddy-resume-list | `scratch/capture-repair/shots-buddy-floater/light/buddy-resume-list.png` — the recent-sessions list |

Not captured (needs the real multi-window Electron pass, out of scope): the docked/dragged
window CHROME itself (position, drag behavior via `BuddyWindowManager`) — only the panel's
CONTENT is reachable through the workbench mockup route.

### Android platform + remote/phone-browser — partial

`?platform=android` (existing switch, `install-mock.ts`) flips `window.__PLATFORM__` before
mount, so every render-time `getPlatform()`/`isAndroid()` branch in the SHARED React code
renders as Android would — the header drops its window buttons, and
`AssistantSettingsRow` filters its five pages down to `General` only ("the others arrive as
the native runtime does," per its own source comment). New plan `android-platform.json`
(390×844):

| Shot | Verified PNG |
|---|---|
| android-home | `scratch/capture-repair/shots-android-platform/light/android-home.png` |
| android-menu | `scratch/capture-repair/shots-android-platform/light/android-menu.png` |
| android-settings | `scratch/capture-repair/shots-android-platform/light/android-settings.png` |
| android-assistant-settings-general-only | `scratch/capture-repair/shots-android-platform/light/android-assistant-settings-general-only.png` — proves the General-only page filter fires |

**This is still Chrome running the shared bundle, not the real Android WebView/Kotlin
runtime** — no native system chrome, safe-area insets, or the native first-run/auth paths.
That needs a real device or emulator build; out of scope for this session.

`?connection=remote` (existing switch, same file) sets platform `browser` +
`isRemoteMode()=true` — everything every `isRemoteMode()` branch in the renderer keys on.
New plan `remote-phone.json` (390×844) captures the PAIRED, post-login state (Remote
Access row shows "Connected · Tailscale," which the local/desktop view never shows):

| Shot | Verified PNG |
|---|---|
| remote-phone-home | `scratch/capture-repair/shots-remote-phone/light/remote-phone-home.png` |
| remote-phone-menu | `scratch/capture-repair/shots-remote-phone/light/remote-phone-menu.png` |
| remote-phone-settings | `scratch/capture-repair/shots-remote-phone/light/remote-phone-settings.png` |

**The actual phone-side LOGIN screen (`RemoteGate`/`LoginScreen`, `remote-gate.tsx`)
remains unreachable.** `index.tsx`'s dev-only workbench bootstrap renders `<App/>` directly
and explicitly skips `<Root>`/`<RemoteGate>` — its own comment says why: `Root`'s
`isElectron` is a module-eval-time const that an async mock install lands too late for.
Closing this gap needs a new dev-only entry point (not built this session) or the real
Electron app talking to a real remote client. What's captured instead is the nearest real
substitute: the paired/authenticated state, not the login itself.

## 3. Still cannot be captured, and why

| Surface | Why not |
|---|---|
| Buddy Floater's docked/dragged window CHROME (position, drag) | Needs the real multi-window Electron pass (`ATTACH_PORT`) — the workbench mockup route only reproduces the panel's content, not the separate-OS-window positioning `BuddyWindowManager` owns. |
| Remote/phone-browser LOGIN screen | Structurally bypassed by the workbench's dev bootstrap by design (see above) — needs a new dev entry point or a real remote client against the real app. |
| Real Android device/emulator rendering | `?platform=android` only flips the shared code's platform flag; the actual Kotlin/WebView runtime, safe-area insets, and native first-run/auth paths need a device or emulator build. |
| `electron-welcome.json`, `electron-live-session.json`, `electron-pages.json` (~35 shots) | Need a running built Electron instance over `ATTACH_PORT`. This session's task explicitly restricts captures to the isolated workbench (`run-review.sh`) and forbids touching the live/real app. Click-path text was repaired in `electron-welcome.json` (see §1) but the plan was not executed. |
| Terminal view, live PTY output | README states the workbench has no PTY fidelity at all ("Terminal is blank — review it on Electron") — same real-app-only limitation. |

## 3b. Final verification run

All 15 touched/new plans, all three themes (light, midnight, meadow-mist), output to
`scratch/capture-repair/` (gitignored): **165 covered · 0 partial · 12 missed of 177
planned surfaces.** The 12 remaining MISSED are exactly the pre-existing,
unrelated-to-this-repair shots already named in §4(c) below (chatgpt-model-picker,
chatgpt-session, all-sessions-menu, tool-card-expanded, welcome-empty, model-list,
connect4 ×2, tool-expanded, close-session-prompt, ctx-menu-code-block, ctx-menu-file-pill)
— every shot this session touched is now `covered` in all three themes.

One infrastructure flake, not a plan bug: `overlays.json`'s meadow-mist shard 1 hit
`Error: CDP endpoint on 46462 never came up` (a Chrome boot timeout, not a selector
failure) mid-sweep, so several unrelated `shots-overlays/*` rows show only 2/3 themes
verified with no failure reason (`about-scrolled`, `ctx-menu-user-bubble`,
`development-contribute`, `first-run-enable-developer-mode`,
`native-session-stalled-and-permission`, `projects-conversation-preview`,
`local-models-resuming` — all `light, midnight` only). A standalone re-run of
`overlays.json` against meadow-mist alone was kicked off to confirm this is purely
transient (`WB_PORT=5553 node scripts/ui-review/shot.mjs scripts/ui-review/plans/
overlays.json <out> meadow-mist`) but **did not finish before this session wrapped up —
unconfirmed.** None of these seven shots are ones this repair changed; if the re-run
still fails them, that is worth a fresh look, but nothing here points at a real bug (the
same shots pass clean in light and midnight, and the failure mode was a CDP transport
timeout, not an `expect`/selector mismatch).

This also reframes §4's "meadow-mist-specific partials" bucket: the ORIGINAL 424-shot
sweep's 30+ meadow-mist-only partials were very likely this same kind of sweep-level CDP
flakiness under heavy concurrent load (24 default jobs against one machine), not one
shared deterministic bug — this repair's own re-run of the identical plans, at lower
concurrency (`UI_REVIEW_JOBS=4`), came back 0 partial except for the one shard that hit
the exact same class of flake.

## 4. Triage — every MISSED/partial surface from the 2026-09-23 sweep

Source: `scratch/element-sweep/coverage.md` (282 covered / 55 partial / 87 missed of 424,
midnight/light/meadow-mist). Grouped by cause, not listed one row at a time — the same
grouping the underlying bugs actually share.

### (a) Fixed now — 40 previously-MISSED shots, all re-verified `ok`

Every shot in §1's table, by name: `local-engine-card`, `local-engine-advanced`,
`local-engine-rocm-guide`, `local-model-settings`, `local-models-installed`,
`local-models-recommended` (local-engine.json, 6); `settings-model-providers`,
`settings-defaults`, `settings-permissions`, `permissions-stress`, `providers-none`
(main.json, 5); `assistant-chatgpt`, `assistant-chatgpt-blocked`, `assistant-claude`,
`assistant-claude-info`, `assistant-claude-skip-on`, `assistant-openrouter`,
`assistant-permissions-link`, `assistant-prefs`, `assistant-search`,
`assistant-search-addkey` (assistant-settings.json, 10); `assistant-permissions`,
`assistant-permissions-skip-on` (assistant-settings-r2.json, 2);
`assistant-permissions-skip-on` (assistant-settings-r3.json, 1); `providers-chatgpt-blocked`,
`providers-chatgpt-signed-in`, `providers-chatgpt-signed-out`, `providers-chatgpt-waiting`,
`providers-local-models` (chatgpt-signin.json, 5); `providers-local-scrolled`
(model-brand.json, 1); `settings-providers`, `stress-permissions` (narrow.json, 2);
`providers-local-scrolled`, `local-models-interrupted-delete-confirm`,
`local-models-delete-confirm`, `local-models-resuming`, `local-models-paused`,
`local-models-damaged-why`, `permissions-scrolled` (overlays.json, 7); `permissions`
(site-gallery.json, 1).

Plus 13 shots on 5 surfaces that never existed in the 424-plan corpus at all (§2):
`git-review-uncommitted`, `git-review-commit-expanded`, `git-review-narrow`,
`buddy-welcome`, `buddy-new-session-form`, `buddy-resume-list`, `android-home`,
`android-menu`, `android-settings`, `android-assistant-settings-general-only`,
`remote-phone-home`, `remote-phone-menu`, `remote-phone-settings`.

### (b) Obsolete plan for a feature that no longer exists — listed, not deleted

- **`shots-assistant-settings-before/*`** (before-defaults, before-defaults-skip-on,
  before-model-providers, before-permissions, before-specialists, settings-drawer — 6
  shots) and **`shots-assistant-settings-narrow-before/*`** (narrow-claude, narrow-drawer,
  narrow-general, narrow-list — 4 shots). These are DELIBERATE "Before" plans for a
  before/after review deck — meant to run against the pre-2026-09-05 checkout where Model
  Providers/Permissions/Defaults still existed as separate popups. They fail on today's
  master by design; that is not a bug, and they were left untouched.
- **`shots-assistant-settings-r4/assistant-cloud-signout`** — MISSED for stale copy
  ("Claude Code keeps its own sign-in"). The very next round, r5, already carries the
  corrected copy for the identical shot ("Terminal view"). r4 is a historical review-round
  snapshot; fixing it would mean editing evidence from an already-closed round rather than
  the current truth, so it was left as-is and superseded by r5.
- **`shots-games-before/*` and `shots-games-before-signedout/*`** (arcade-connect4-board,
  arcade-connect4-lobby, arcade-picker-signedout — 3 shots) — the naming convention strongly
  suggests these are ALSO deliberate before/after comparison plans (matching the
  `assistant-settings-before` pattern), not bugs. Not independently confirmed this session
  — flagged as a likely (b), worth a quick source check before "fixing" them.

### (c) Real missing capture, or pre-existing/unrelated — described, not fixed this session

**Genuinely unreachable without more engineering** — covered in full in §3: Buddy window
chrome, remote login screen, real Android rendering, the three `electron-*.json` plans,
live terminal PTY.

**Pre-existing bugs unrelated to the Settings/Model-Providers IA migration** — outside this
session's scope (fixing the ~15 stale Settings plans + adding the 3 new captures), not
investigated in depth, listed here so the true "no picture exists" count stays honest:

- **A second stale-nav cluster, same SHAPE as the bug this session fixed**, all sharing the
  identical failure `MISSING "js:[...document.querySelectorAll('nav button')]..."`:
  `shots-openrouter-signin/*` (si-apikey, si-broken, si-connected, si-failed, si-modal,
  si-not-connected — 6 partial) and `shots-openrouter-trust/*` (card-expired,
  card-unchecked, card-verified, card-wrong-type, settings-dot — 5 partial) plus
  `modal-fake-key` (MISSED). Worth a follow-up pass with the same method as §1 — a `nav
  button` selector that no longer matches whatever OpenRouter's own settings surface looks
  like today.
- **Meadow-mist-specific partials** (a large share of the 55 "partial" rows in the
  ORIGINAL 424-shot sweep are covered in midnight+light but MISS only meadow-mist):
  `shots-artifact-zoom-ladder/*` (4), `shots-cloud-context-after/*` (4),
  `shots-cloud-context-saved/*` (2), `shots-empty-marketplace/library-themes,
  marketplace-themes` (2), `shots-error-batch1/*` (7), `shots-main/settings-*` (9 — About,
  Account, Appearance, Backup & Sync, Buddy Floater, Development, Donate, Keyboard
  Shortcuts, Remote Access, Sound), `shots-main/library,marketplace,theme-edit-community`
  (3), `shots-marketplace-overhaul/*` (3), `shots-marketplace/library-themes` (1),
  `shots-openrouter-signin/*` and `-trust/*` above, `shots-pages-connections/
  settings-saved-keys` (1), `shots-sync-oversize-fix/sync-error` (1). **Likely NOT a real
  per-theme bug** — see §3b: this repair's own re-run of `shots-main/settings-*` (the
  largest cluster here) came back fully `covered` in all three themes with zero code
  changed for them, and a separate shard in the SAME re-run hit an unrelated CDP boot
  timeout that produced an identical-looking 2/3-themes gap. The original 424-shot sweep
  ran at `UI_REVIEW_JOBS=24` (vs. this repair's 4); sweep-level flakiness under that much
  concurrency is the more likely explanation than a meadow-mist-specific rendering bug.
  Confirm with a clean re-run before treating this as a real finding.
- **Individually-stale selectors, no shared pattern found**: `shots-artifact-zoom-clicks/*`
  (2, "Reset to fit" label text changed), `shots-chatsearch-gate-main/*` (7: android-fallback,
  ask-scaffold, card-expanded, context-menu-preview, group-collapsed, preview-panel,
  preview-panel-top, resume-popover), `shots-cloud-context/general` and
  `shots-cloud-context-after/*` (already flagged in `settings-screens.md` as possibly a
  stale/mislabeled capture, not independently re-checked here), `shots-error-audit-current/*`
  (4: mock-cloud-openrouter-test-failure, mock-report-diagnose-setup-failure,
  mock-report-submit-rejection, mock-report-summary-rejection), `shots-main/
  all-sessions-menu,welcome-empty,tool-card-expanded` (3 — unrelated to Settings),
  `shots-marketplace-overhaul/detail,detail-feedback,skills-tab` (3 — a `civic-report`
  test-fixture card selector), `shots-marketplace/marketplace-empty` (1), `shots-narrow/
  connect4,tool-expanded` (2), `shots-overlays/close-session-prompt,ctx-menu-code-block,
  ctx-menu-file-pill,development-bug-report,development-contribute` (5), `shots-pages-layouts/
  layout-bar,layout-bar-menu,layout-frame,layout-frameless` (4 — missing `'Page options'`
  aria-label), `shots-site-gallery/connect4` (1), `shots-tall/compare,tool-gallery` (2).
- **Already known-fine per `completeness-screens.md`'s own spot-check**, MISSED only on its
  automated assertion, not its picture: `shots-games-record/connect4-record` (the win/lose
  overlay renders cleanly; nobody has cited it by name) and `shots-main/welcome-empty`
  (also renders cleanly — see §"Individually-stale selectors" above for why THIS run still
  lists it MISSED: a different assertion than the one spot-checked before).

## 5. Pre-existing, unrelated bug found along the way

Running `bash scripts/verify.sh youcoded` (required before claiming the `mock-shim.ts`
change in §2 done) failed on one ast-grep invariant (`section-label-canonical-classes`) in
`desktop/src/renderer/dev/workbench/mockups/CardAnatomyDemo.tsx:38` — a dev-only card
design-comparison mockup nothing in this task touches otherwise, committed to this same
shared branch minutes before this repair started (another concurrent session's work). A
one-line class-order fix (`text-3xs uppercase tracking-wide text-fg-muted` → the canonical
`text-3xs font-medium text-fg-muted tracking-wider uppercase`) was applied to unblock
`verify.sh`, then folded into that other session's own commit of the same file rather than
committed separately from here, since it landed first — see that commit's history for the
final form. `verify.sh` is green.

## 6. What's committed

- 11 repaired plan files + 5 new plan files, `youcoded-dev` repo, this branch
  (`scripts/ui-review/plans/`), plus this report.
- One `youcoded` app-repo commit (separate repo, same branch name): the `git` mock
  namespace added to `mock-shim.ts` (dev-only, additive — no production code path
  touched). Verified by the existing `mock-shim.test.ts` / `mock-shim-window.test.ts` /
  `ipc-channels.test.ts` suites (413/413 pass, unchanged) and `bash scripts/verify.sh
  youcoded` (green); no new dedicated test was added for the `git` namespace itself —
  worth a follow-up if this fixture grows past "generic, read-only."
  `CardAnatomyDemo.tsx` was NOT touched by this commit (see §5 — already handled by
  another concurrent session).
- `scratch/` (all capture output, including the full light/midnight/meadow-mist re-run) is
  git-ignored and not committed.
