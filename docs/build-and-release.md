# Build Order & Release Flows

Release builds happen through GitHub Actions CI in the relevant sub-repo. Day-to-day iteration on desktop changes runs locally — see `docs/local-dev.md` and the **Local dev loop** section below.

## Build order dependencies

### React UI bundle is auto-rebuilt by Gradle
Located at `youcoded/scripts/build-web-ui.sh`. Runs `npm ci && npm run build` in `desktop/`, then copies `desktop/dist/renderer/` into `app/src/main/assets/web/`. The `bundleWebUi` task in `app/build.gradle.kts` invokes this script before `preBuild` whenever any input changes (`desktop/src/`, `package-lock.json`, `vite.config.ts`, etc.). Kotlin-only iterations are skipped as UP-TO-DATE.

If skipped (manual `-x bundleWebUi`, build break in `npm run build`, etc.), the Android app launches with a blank WebView — `index.html` references JS/CSS bundles that aren't in `assets/web/assets/`.

The Android release workflow (`android-release.yml`) still invokes the script as an explicit pre-step. With the Gradle task in place that's redundant on cold-cache CI runs (Gradle re-runs the work) but harmless, and acts as a safety net if anyone disables the Gradle task.

### Desktop version comes from git tag, not package.json
CI extracts version from the `vX.Y.Z` tag and patches `package.json` before building (`desktop-release.yml:40-46`). Local `package.json` version is not the source of truth.

### Android version requires manual bump
Both `versionCode` (integer, monotonically increasing for Play Store) and `versionName` (string) must be bumped in `app/build.gradle.kts` **before** tagging. CI does not derive Android versions from the tag — Play Store requires `versionCode` to always increase, so it cannot be derived.

Current: `versionCode = 17`, `versionName = "1.2.1"` (app/build.gradle.kts:23-24).

### One tag, all platforms
A single `vX.Y.Z` tag in youcoded triggers both `android-release.yml` and `desktop-release.yml`. Both upload artifacts (APK/AAB + Win/Mac/Linux installers) to the same GitHub Release.

## Release flows

### App (Desktop + Android)
1. Bump `versionCode` + `versionName` in `youcoded/app/build.gradle.kts`
2. Tag `vX.Y.Z` in youcoded on master
3. Both platform workflows trigger → single GitHub Release with all artifacts

### Toolkit (youcoded-core)
1. Bump `version` field in `youcoded-core/plugin.json` on master
2. `auto-tag.yml` compares `HEAD` vs `HEAD~1` plugin.json versions
3. If changed, creates `vX.Y.Z` tag automatically

### Worker (wecoded-marketplace)
**The Cloudflare Worker auto-deploys on push to master — never tell Destin to run `wrangler deploy` manually.** `.github/workflows/worker-deploy.yml` runs on `push` to `master` (filtered to `worker/**` and the workflow file itself) plus `workflow_dispatch`. The job runs `npm test` → `wrangler d1 migrations apply --remote` → `wrangler deploy` → `wrangler secret put` for every required secret. Cloudflare credentials live in repo secrets (`CF_API_TOKEN`, `CF_ACCOUNT_ID`); no local `wrangler login` needed.

**Worker PRs are tested BEFORE merge** by `.github/workflows/worker-ci.yml` (added 2026-07-23): `npm ci` → `npm run typecheck` → `npm test` on any PR touching `worker/**` or the workflow itself. Until then worker code had **no pre-merge check at all** — the tests lived only inside the deploy job above, so a broken PR merged green and first failed while deploying to production (verified: PRs #51–#55 all merged with an empty check rollup). It paid for itself immediately, catching three breaking dependency bumps at PR time.

To ship a worker change:
1. Open a PR from your feature branch to `master`. The `worker-ci` check runs — wait for it.
2. Merge (squash or merge-commit, doesn't matter).
3. CI does the rest. Smoke-test the live endpoints once Actions reports green.

If you need to flip a `[vars]` value (e.g. `CUTOVER_TIMESTAMP`), commit it to `wrangler.toml` and merge — same auto-deploy path. Wrangler `secret put` is for secrets only and lives in CI's `Push secrets` step (`MARKETPLACE_GH_CLIENT_ID`, `MARKETPLACE_GH_CLIENT_SECRET`, `KNOWN_DEV_DEVICES`, etc.). Adding a new secret means a Repo → Settings → Secrets entry plus a one-line addition to the workflow's `Push secrets` step.

## Local dev loop (desktop)

The supported way to iterate on desktop changes while the installed/built app stays open for real work:

```bash
bash scripts/run-dev.sh
```

- Launches a second Electron window labelled **YouCoded Dev**
- Shifts ports via `YOUCODED_PORT_OFFSET=50` (Vite 5173 → 5223, remote 9900 → 9950)
- Splits Electron `userData` via `YOUCODED_PROFILE=dev` so dev's localStorage / cookies / window bounds don't clobber the built app's
- Shares `~/.claude/` with the built app intentionally (plugins, settings, memory) so dev tests against real state — `write-guard.sh` and `.sync-lock` prevent corruption; expect occasional `WRITE BLOCKED` messages as normal friction

First time only: `cd youcoded/desktop && npm ci` to install deps. After that `scripts/run-dev.sh` is a one-shot command.

See `docs/local-dev.md` for caveats (plugin install shares state with built app, OneDrive path warning, remote-access UI is read-only in dev).

## Beta builds (desktop) — a real installer from an untagged branch

`run-dev.sh` is for iterating. When you need a **real installed app** from unreleased code —
to dogfood master as a daily driver, or to exercise the install / first-run / sign-in flow on a
clean VM — dispatch **`desktop-test-build.yml`**. It's `workflow_dispatch`-only, runs `npm test`
plus a launch smoke test, and uploads Win `.exe` / macOS `.dmg` / Linux `.AppImage` + `.deb` +
`.rpm` + `.pacman` artifacts (**7-day retention** — re-dispatch after that, don't hunt for the
old run). The Linux glob mirrors `desktop-release.yml`'s as of youcoded#158; before that a beta
built the three native packages and discarded them at upload, which is why nothing but the
AppImage was testable pre-v1.3.
<!-- verify: {"path": "youcoded/.github/workflows/desktop-test-build.yml", "contains": "workflow_dispatch"} -->
<!-- verify: {"path": "youcoded/.github/workflows/desktop-test-build.yml", "contains": "\\*\\.pacman"} -->

```bash
# version MUST sort above the latest release — see the trap below
gh workflow run desktop-test-build.yml --repo itsdestin/youcoded \
  --ref <branch> -f version=1.3.0-beta

gh run watch --repo itsdestin/youcoded $(gh run list --repo itsdestin/youcoded \
  --workflow=desktop-test-build.yml --limit 1 --json databaseId --jq '.[0].databaseId')

gh run download --repo itsdestin/youcoded <run-id> -n youcoded-desktop-windows -D ./beta
```

**It replaces the installed app in place.** `electron-builder.yml` pins `appId: com.youcoded.desktop`
and `productName: YouCoded`, so NSIS upgrades over the existing install rather than sitting beside
it. `AppData/Roaming/youcoded` (window bounds, localStorage) carries over, and `~/.claude/` +
`~/.youcoded/` are shared as always — which is what makes it usable as a daily driver, and also
what makes rollback lossy. There is no side-by-side desktop equivalent of Android's `.releasetest`
suffix; if you want isolation, use a VM.

**On Linux "in place" depends on the format.** The AppImage is a loose file, so a beta lands *beside*
the release you already have and you roll back by launching the old file. `.deb` / `.rpm` / `.pacman`
install to a fixed `/opt/YouCoded` and replace a prior native install (but not an AppImage). Either
way `appId` is shared, so all of them read the same `~/.config/youcoded` — the code rolls back, the
state doesn't. Quit the running app before launching a beta: two instances on one userData contend
over the same LevelDB.
<!-- verify: {"path": "youcoded/desktop/electron-builder.yml", "contains": "appId: com.youcoded.desktop"} -->

**The version input is load-bearing — read this before picking one.** `compareVersions`
(`ipc-handlers.ts`) parses naively: `'1.2.4-beta'.split('.').map(Number)` → `Number('4-beta')` →
`NaN` → `|| 0` → `[1,2,0]`, which is **lower** than a released `1.2.4`. The installed beta would
then show "update available" and offer to downgrade itself to the release it's meant to be ahead
of. **Bump the minor and suffix** (`1.3.0-beta` → `[1,3,0]`), never patch-suffix the current
version. Corollary: once the real `1.3.0` ships it compares *equal* to `1.3.0-beta`, so the beta
never prompts to update — that's fine, you re-dispatch to move forward.
<!-- verify: {"path": "youcoded/.github/workflows/desktop-test-build.yml", "contains": "Stamp beta version"} -->

**Why the version step exists at all:** only `desktop-release.yml` patches `package.json` (from the
tag). Without the `Stamp beta version` step a test build inherits the *last released* version and
reports it in About, in analytics (`analytics-service.ts` sends `app.getVersion()`), and in bug
reports — a dogfood build is then indistinguishable from the real release, and it pollutes your own
version breakdown. Both `__APP_VERSION__` (Vite reads `pkg.version`) and `app.getVersion()` derive
from that one file, so stamping it fixes every surface at once.

**How you know you're on one:** the build step sets `YOUCODED_BUILD_CHANNEL=BETA`, Vite bakes it in
as `__BUILD_CHANNEL__`, and Settings → About reads `YouCoded v1.3.0-beta (BETA)`. Release builds set
no channel and render unchanged. Format lives in `desktop/src/shared/version-line.ts` (pinned by
`desktop/tests/version-line.test.ts`).
<!-- verify: {"test": "youcoded/desktop/tests/version-line.test.ts"} -->

**Rolling back.** Reinstall the last release's installer from its GitHub release
(`YouCoded.Setup.<version>.exe`). That reverts the *code* only — it does **not** un-migrate
`~/.claude/` or `~/.youcoded/` state that the newer build may have already rewritten. Snapshot both
before installing a beta that's far ahead of your release (there's precedent: the 776 MB
`claude-snapshot.tar.gz` taken 2026-07-12 before the two-device dogfood).

**macOS ships two dmgs, and the x64 one is built on an arm64 runner.** `electron-builder.yml`
targets both `x64` and `arm64`, but both workflows run on `macos-latest` (Apple Silicon) and cut
both dmgs from a single `node_modules` with `npmRebuild: false`. Any dependency that ships its
binaries as **per-platform `optionalDependencies`** therefore installs arm64-only, and the x64 dmg
gets binaries it cannot execute. Both workflows carry an `Add darwin-x64 binaries for the x64 dmg`
step that force-installs the missing variants; **when you add a dependency with per-platform
optional deps, add it there too.** Caught 2026-07-19 when `1.3.0-beta.6` died at launch on an Intel
VM with `Could not find @vscode/ripgrep-darwin-x64` (youcoded#189); `@napi-rs/canvas` (via
`pdfjs-dist`) was a second, latent instance that would have shown up only as broken PDF rendering.
`node-pty` and `koffi` vendor every arch in-package and need no help.
<!-- verify: {"path": "youcoded/.github/workflows/desktop-release.yml", "contains": "darwin-x64 binaries"} -->
<!-- verify: {"path": "youcoded/.github/workflows/desktop-test-build.yml", "contains": "darwin-x64 binaries"} -->

To check a dmg before handing it to a tester, extract it and confirm the arch actually present:

```bash
7z x -y YouCoded-<version>.dmg -o/tmp/dmgcheck >/dev/null
find /tmp/dmgcheck -type d -name '*-darwin-*'        # expect darwin-x64 in the unsuffixed dmg
file "$(find /tmp/dmgcheck -path '*MacOS/YouCoded')" # expect Mach-O 64-bit x86_64
```

## Local verification (typecheck + CI-style build)

When you need to confirm something compiles or passes tests — not just runs:

```bash
# Desktop
cd youcoded/desktop && npm ci && npm test && npm run build

# Android
cd youcoded && ./gradlew assembleDebug && ./gradlew test

# Build Android React UI from desktop source (required before APK)
cd youcoded && ./scripts/build-web-ui.sh
```

**Never run the desktop build and any Gradle build CONCURRENTLY (same checkout/worktree).** Gradle's `bundleWebUi` task shells to `scripts/build-web-ui.sh`, which runs `npm ci` inside `desktop/` — wiping and reinstalling `node_modules` out from under a desktop build reading it (symptom: `'vite' is not recognized` mid-build even though tests ran fine moments earlier). Run them sequentially; observed 2026-07-09 during the accounts Phase 2 verification pass.

## Verify behavior under R8 minification (dev/release parity)

Debug builds skip R8 minification, which means a class of bug — string-based reflection, annotation introspection, anything that depends on stable symbol names — works fine in dev and silently dies in release. The 2026-04-30 PluginInstaller reflection footgun (commit `912f5ca7`) shipped this way: every dev test passed, every release user couldn't install plugins. See `docs/PITFALLS.md → Build-Type Parity (Android)`.

The `releaseTest` build type is the parity check. Same R8 / shrinker / proguard config as the production release flavor, signed with the debug keystore, installs side-by-side via `applicationIdSuffix = ".releasetest"`:

```bash
cd youcoded && ./gradlew :app:assembleReleaseTest
adb install -r app/build/outputs/apk/releaseTest/*.apk
# Installs as "YouCoded ReleaseTest" (bridge port 9961) alongside production.
# Same data isolation as the regular debug app — no risk to your real install.
```

Use this before tagging if you've touched code that involves reflection, annotation processing, or other R8-sensitive patterns. `android-ci.yml` builds `assembleReleaseTest` on **every PR** and on pushes to `master`, so most regressions get caught at PR time. (`android-test-build.yml` is `workflow_dispatch` only — a manual beta build, not a push trigger.) Both youcoded CI workflows moved from a branch-name allowlist to `pull_request` on 2026-07-23; see `docs/archive/specs/2026-07-23-dependabot-design.md` §4.1 for why.
