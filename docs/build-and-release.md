# Build Order & Release Flows

Release builds happen through GitHub Actions CI in the relevant sub-repo. Day-to-day iteration on desktop changes runs locally — see `docs/local-dev.md` and the **Local dev loop** section below.

## Build order dependencies

### React UI bundle is auto-rebuilt by Gradle
Located at `youcoded/scripts/build-web-ui.sh`. Runs `npm ci && npm run build` in `desktop/`, then copies `desktop/dist/renderer/` into `app/src/main/assets/web/`. The `bundleWebUi` task in `app/build.gradle.kts` invokes this script before `preBuild` whenever any input changes (`desktop/src/`, `package-lock.json`, `vite.config.ts`, etc.). Kotlin-only iterations are skipped as UP-TO-DATE.

If skipped (manual `-x bundleWebUi`, build break in `npm run build`, etc.), the Android app launches with a blank WebView — nothing under `assets/web/` is tracked (the April placeholder `index.html` was removed 2026-09-10), so the folder is simply empty.

The Android release workflow (`android-release.yml`) still invokes the script as an explicit pre-step. With the Gradle task in place that's redundant on cold-cache CI runs (Gradle re-runs the work) but harmless, and acts as a safety net if anyone disables the Gradle task.

### Desktop version comes from git tag, not package.json
CI extracts version from the `vX.Y.Z` tag and patches `package.json` before building (`desktop-release.yml:40-46`). Local `package.json` version is not the source of truth.

### Android version is stamped in CI
Since 2026-09-10 `android-release.yml` stamps `app/build.gradle.kts` before building: `versionName` is the tag without its `v` (or `<base>.<run_number>` for a dispatched beta) and `versionCode` is `100 + run_number`, monotonic across betas and releases because both come through that one workflow. The hand-set values in the file only matter for local builds. Outputs are named `YouCoded-<version>.apk` / `.aab`.

### Office add-on is fetched per platform at build time
`npm run build` starts with `node scripts/fetch-office.mjs --release --required`, which downloads every bundle `desktop/office-pin.json` pins for the build machine's OS into `desktop/office-build/<platform>-<arch>/` (the Mac runner gets both `darwin-x64` and `darwin-arm64`); `electron-builder.yml` packs `office-build/${platform}-${arch}` as the installer's `resources/office`. A platform with no pin (ARM Linux: upstream ships no converter) builds without Office and the app opens Office files with the default app. Bumping the add-on means: bump `version` in the add-on's own `PIN.json`, push a `vX.Y.Z` tag to `itsdestin/youcoded-office` (its CI builds all four platforms and smoke-tests each converter on its own OS before publishing the release with a `SHA256SUMS`), then set `version` and every platform's `url` and `sha256` in `desktop/office-pin.json` (all four: `linux-x64`, `darwin-x64`, `darwin-arm64`, `win32-x64`) and run `node scripts/fetch-office.mjs`. As of 2026-10-02 the pin is **v0.1.41**. The Windows bundle ships the Visual C++ runtime DLLs beside `x2t.exe` (a clean Windows PC lacks them; add-on v0.1.40) and its CI fails if any DLL is unshipped. On Mac, `electron-builder.yml` re-signs only the converter (`x2t` and its dylibs) and `scripts/office-packaged-smoke.mjs` runs the packaged x2t in the Mac CI jobs. `desktop/office-addon/` is only the dev copy for this machine. Depth: `youcoded/docs/office.md`.

### One tag, all platforms
A single `vX.Y.Z` tag in youcoded triggers both `android-release.yml` and `desktop-release.yml`. Both upload artifacts (APK/AAB + Win/Mac/Linux installers) to the same GitHub Release.

## Release flows

### App (Desktop + Android)

The release procedure is `youcoded-admin/skills/release/SKILL.md`: review the app diff and readiness, prepare an isolated candidate, review its PR and candidate-specific checks where authorized, then obtain Destin's explicit go/no-go **to merge, push master and tag**. Tag the verified result on remote master. A candidate branch push solely for CI requires its own permission and is not release approval; when candidate CI cannot run, disclose that at go/no-go. Never commit or tag in a shared checkout to stage a release. `youcoded-core` is archived; it has no release steps.

1. Regenerate the landing-page demos with `bash scripts/ui-review/site-assets.sh <app-worktree>`; inspect the gallery and media output and include approved files in the candidate. The site's loops and embed come from the renderer and otherwise go stale.
2. Review one app CHANGELOG entry and check the candidate on desktop and Android. The **tag**, not locally edited version files, sets the shipped version: desktop CI patches `package.json`; Android CI stamps `versionName` and a monotonic `versionCode`. Local Gradle values are not Play release values.
3. After candidate review, explicit release go/no-go, and the authorized merge/push, tag `vX.Y.Z` on the verified app commit on remote master. Its two workflows must both pass: desktop waits for every OS before upload; Android uploads APK/AAB. They contribute to one GitHub Release, but the tag push alone does not prove the release finished.
4. Check the actual release assets, including `youcoded-release.json` and `youcoded-release.json.sig` — without both the in-app Update button refuses the release even if installers uploaded. **Verify contents, not just names:** download all release installers and the manifest/signature into an empty temporary directory, confirm the manifest version and every installer's SHA-256/byte size match the downloaded files, and verify the signature against `desktop/src/main/update-signing-key.ts` (helpers exported by `desktop/scripts/generate-release-manifest.mjs`). If `Sign release manifest` warned, diagnose it and get approval for manual signing: use a NEW EMPTY folder containing ONLY installers downloaded from that exact release, then from `youcoded/` run `node desktop/scripts/generate-release-manifest.mjs --dir <folder> --version vX.Y.Z --key ~/system/youcoded-release-signing/update-signing-key.private.pem --verify-with desktop/src/main/update-signing-key.ts`. Inspect the newly generated manifest before upload. If the release already has either manifest file, check what is there first; use `gh release upload vX.Y.Z <folder>/youcoded-release.json <folder>/youcoded-release.json.sig --clobber` only after confirming an intentional replacement of the pair. Never mix installers from another release into the signing folder.
5. PartyKit deploys on a master push touching `desktop/partykit/**` (or explicit dispatch), not because a later release tag was pushed. Verify the actual relevant deployment run if game-server changes are part of the release.

### Worker (wecoded-marketplace)
**The Cloudflare Worker auto-deploys on push to master — never tell Destin to run `wrangler deploy` manually.** `.github/workflows/worker-deploy.yml` runs on `push` to `master` (filtered to `worker/**` and the workflow file itself) plus `workflow_dispatch`. The job runs `npm ci` → `npm run typecheck` → `npm test` → `wrangler d1 migrations apply --remote` → `wrangler deploy` → `wrangler secret put` for every required secret. Cloudflare credentials live in repo secrets (`CF_API_TOKEN`, `CF_ACCOUNT_ID`); no local `wrangler login` needed.

**Worker PRs are tested BEFORE merge** by `.github/workflows/worker-ci.yml` (added 2026-07-23): `npm ci` → `npm run typecheck` → `npm test` on any PR touching `worker/**` or the workflow itself. Until then worker code had **no pre-merge check at all** — the tests lived only inside the deploy job above, so a broken PR merged green and first failed while deploying to production (verified: PRs #51–#55 all merged with an empty check rollup). It paid for itself immediately, catching three breaking dependency bumps at PR time.

To ship a worker change:
1. Open a PR from your feature branch to `master`. The `worker-ci` check runs — wait for it.
2. Merge (squash or merge-commit, doesn't matter).
3. CI does the rest. Smoke-test the live endpoints once Actions reports green.

If you need to flip a `[vars]` value (e.g. `CUTOVER_TIMESTAMP`), commit it to `wrangler.toml` and merge — same auto-deploy path. Wrangler `secret put` is for secrets only and lives in CI's `Push secrets` step (`MARKETPLACE_GH_CLIENT_ID`, `MARKETPLACE_GH_CLIENT_SECRET`, etc.). `KNOWN_DEV_DEVICES` — the analytics admin-device filter — is pushed from repo secret `MARKETPLACE_KNOWN_DEV_DEVICES` (comma-separated hashes; `youcoded-admin/skills/analytics/scripts/device-hash.mjs` prints a device's hash). Until 2026-09-13 it existed only as a test var, so production counts silently included Destin's devices. Adding a new secret means a Repo → Settings → Secrets entry plus a one-line addition to the workflow's `Push secrets` step.

**The catalog ingest is a SECOND workflow in that repo, and it is scheduled** (`catalog-ingest.yml`, hourly at :13, shipped 2026-08-30). It rebuilds what the app reads from four upstream sources and posts it to the Worker; `wecoded-marketplace/docs/catalog.md` is the reference. Two things a release-time reader needs:
- **`CATALOG_ENABLED` is a release-grade lever.** Set it to `"0"` in `wrangler.toml`, commit, merge: `GET /catalog` answers 503 and both apps fall back to `index.json` silently, with no user-visible error. That is the way to stop a bad catalog reaching every device within the hour, without shipping code under pressure.
- **A red run of that workflow IS the alarm** — `build.mjs` exits non-zero on any source erroring, being refused by the retire guard, or seeing zero rows, and GitHub emails the owner. There is no other alert. The gap it cannot cover: GitHub silently disables `schedule:` triggers after 60 days of repo inactivity, and a dead cron just freezes the catalog. `GET /admin/catalog/health` is the manual check. This is the repo's **first** scheduled workflow, so that rule has never applied here before.

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
# No number to type: the build stamps <base>.<run number> itself, e.g. 1.3.1-beta.87.
# `base` defaults to 1.3.1-beta and only needs passing when the release line moves —
# and it MUST still sort above the latest release (see the trap below).
gh workflow run desktop-test-build.yml --repo itsdestin/youcoded --ref <branch>

gh run watch --repo itsdestin/youcoded $(gh run list --repo itsdestin/youcoded \
  --workflow=desktop-test-build.yml --limit 1 --json databaseId --jq '.[0].databaseId')

gh run download --repo itsdestin/youcoded <run-id> -n youcoded-desktop-windows -D ./beta
```

**Master's Windows tests red for someone else's reason? Add `-f skip_windows_tests=true`.** A failed
`npm test` skips every later step, so a red Windows test means no Windows installer at all; with the
switch only the Windows leg skips its tests (macOS and Linux still run them). On 2026-09-10 the
installer-icon test needed a throwaway branch with the step deleted before this existed.
<!-- verify: {"path": "youcoded/.github/workflows/desktop-test-build.yml", "contains": "skip_windows_tests"} -->

### Publishing a beta as a PUBLIC pre-release (what youcoded.ai serves)

Actions artifacts cannot be linked from the website: they need a GitHub login, they arrive
as a `.zip` rather than an installer, and they self-delete after 7 days. To make a beta
publicly downloadable, attach the same files to a **GitHub pre-release**. Done for
`1.3.0-beta.72` on 2026-09-03 (youcoded#413).

```bash
# Tag WITHOUT a leading `v`. desktop-release.yml and android-release.yml both trigger on
# `tags: ['v*']`, so a `v`-prefixed tag would fire a real release build off this tag.
# --target needs the FULL 40-char sha; a short sha is rejected with
#   HTTP 422: Release.target_commitish is invalid
gh release create 1.3.0-beta.72 --repo itsdestin/youcoded \
  --draft --prerelease --target <full-40-char-sha> \
  --title "1.3.0-beta.72 (pre-release)" --notes-file notes.md <files…>
gh release edit 1.3.0-beta.72 --repo itsdestin/youcoded --draft=false
```

Build first, upload second: `--draft` keeps it invisible while ~1 GB uploads, and a draft
creates no tag at all, so nothing can fire early.

**Attach the signed manifest too (2026-09-11).** A dispatch from `master` also runs a `sign` job: it
signs that beta's installers with `UPDATE_SIGNING_KEY` exactly as a tagged release is signed, fails
if the result does not verify against the public key built into the app, and uploads
`youcoded-release.json` + `.sig` as the `youcoded-release-manifest` artifact. A green `sign` job is
the proof the release key works before a release depends on it. Attach both files to the
pre-release so its downloads can be checked; the website ignores them, since it picks files by
extension. Branch dispatches skip the job and produce three artifacts, not four. The manifest
covers **desktop installers only** — the Android APK is not in it. Android betas are numbered from
their own run counter (beta.80 desktop shipped beside APK `1.3.0-beta.26`); say so in the notes.
The beta.78 and beta.80 Windows installers were built with `skip_windows_tests=true`, so their
tests never ran on Windows.
<!-- verify: {"path": "youcoded/.github/workflows/desktop-test-build.yml", "contains": "youcoded-release-manifest"} -->

**A pre-release does not touch anyone's installed app.** The in-app update checker reads
`/releases/latest`, which by definition returns the newest *stable* release and skips
pre-releases — verified still returning `v1.2.4` after publishing. The same fact is why the
website had to move OFF `/releases/latest` to see betas at all (`docs/index.html` now reads
the `/releases` list; revert when 1.3.1 ships — `docs/roadmap/dev-workspace.md`).

**Only an official release reaches an install that is not ON the beta channel, and no
published build had that channel until `1.3.0-beta.86` (2026-09-19).** The channel shipped
on 2026-09-13, after `1.3.0-beta.80` was built, so every published build before .86 asks
`/releases/latest` and can never be offered a beta — the beta testers on .72–.80 have to
reinstall from youcoded.ai once, and a pre-release cannot deliver a fix to them. **That is
what an official release is for, and 1.3.0 (2026-09-20) is the one that moves v1.2.4 users
and those testers forward.** Betas run on the `1.3.1-beta` line from here: the beta line is
always one patch AHEAD of the last release, so a beta is never offered a downgrade and the
next release ends the run.
<!-- verify: {"path": "youcoded/desktop/src/main/update-release-status.ts", "contains": "releases/latest"} -->

**Wait on the artifact, not on the run's status.** `gh run view --json status` was observed
returning `completed/success` for a run still `in_progress` (2026-09-03), and acting on it
produced `no valid artifacts found to download`. Poll for the thing you actually need:

```bash
until [ "$(gh api repos/itsdestin/youcoded/actions/runs/<id>/artifacts \
  --jq '.artifacts|length')" = 3 ]; do sleep 45; done
```

**Android needs its own dispatch.** `android-test-build.yml` produces debug-signed APKs with a
`.releasetest` package suffix — wrong for a public download. Dispatch `android-release.yml`
instead: it builds a properly signed release APK, and its "Create GitHub Release" step is
guarded by `if: startsWith(github.ref, 'refs/tags/')`, so a manual dispatch publishes nothing.
Give it the `base` input (default `1.3.1-beta`) and it stamps `<base>.<run_number>` into the APK,
the way `desktop-test-build.yml` does; the outputs are named after the version.
<!-- verify: {"path": "youcoded/.github/workflows/android-release.yml", "contains": "refs/tags/"} -->

**`android-test-build.yml` stamps too, since 2026-09-13 — it was the last build path that did
not.** Its APKs used to inherit the hand-set `versionName` in `app/build.gradle.kts` (`1.2.4`, the
May release), so every dogfood build reported itself to analytics as a 1.2.4 build — a 1.3 beta
landing in your own version breakdown as last spring's release. It now takes the same `base` input
and stamps `<base>.<run_number>`; the build type adds `-dev` / `-releasetest` on top, so the APKs
read `1.3.0-beta.12-dev`. **`versionCode` is deliberately left alone**: these install as separate
apps, so Play never sees the number, and raising it would block installing a LOCAL build (still the
hand-set `20`) over a CI one, because Android refuses a lower `versionCode`.
<!-- verify: {"path": "youcoded/.github/workflows/android-test-build.yml", "contains": "Stamp dogfood version"} -->

Those APKs are still debug-signed, and Android's device id is scoped per signing key — so a dogfood
install fingerprints as a **different device** than the production app on the same phone. It counts
as an extra device in DAU/MAU and an extra "new install", and `KNOWN_DEV_DEVICES` only filters it if
that second hash is added separately.

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

**Betas number themselves (2026-08-15).** The workflow appends its own GitHub run counter to the
`base` prefix (`1.3.1-beta` → `1.3.1-beta.87`, `.88`, …), so every beta sorts above the previous one
and maps straight back to its run in the Actions tab; the free-text `version` box that let two builds
share a name — or a hand-typed number sort *below* the installed one — is gone.

**How the app orders versions (2026-09-11).** One `compareVersions` (`update-manifest-verify.ts`)
serves both the update check (`update-release-status.ts`) and the install gate, and it orders the
semver way: X.Y.Z first, then a full release above every pre-release of it, then pre-release parts
left to right, numbers as numbers — `1.2.4` < `1.3.0-beta.77` < `1.3.0-beta.78` < `1.3.0`. **So a beta
is offered the full release it leads up to, and the gate installs it.** Before this the two halves
disagreed and both were wrong: the check read `1.3.0-beta.76` as `[1,3,0,76]`, above `1.3.0`, and the
gate dropped the suffix and refused `1.3.0` as not newer. **Every beta published before the fix —
1.3.0-beta.76 and earlier — still behaves that way and will never offer 1.3.0 on its own**; those
testers reinstall from the website once. The pill also waits until the release carries this
computer's installer, because one tag starts the Android and desktop workflows separately and the
release can exist for a while with only some of its files. v1.2.4 IS offered 1.3.0, but its Update
button predates the allow-listed download host, fails, and offers "Open in browser instead".
<!-- verify: {"test": "youcoded/desktop/tests/update-release-status.test.ts"} -->
<!-- verify: {"path": "youcoded/desktop/src/main/update-release-status.ts", "contains": "readReleaseStatus"} -->

**Which releases the check can SEE is a separate question from how it orders them (2026-09-13).**
GitHub's `/releases/latest` returns the newest *stable* release and omits pre-releases entirely, so
ordering alone never got a beta tester another beta — `1.3.0-beta.78` sorted above `.77` correctly
and was never fetched. The check now picks its endpoint from the install's channel: off the beta
channel it reads `/releases/latest` exactly as before, on it reads the `/releases` listing and
`selectRelease` (`update-release-status.ts`) takes the highest **version** carrying this computer's
installer, skipping drafts. Highest-version rather than newest-published means re-publishing an old
tag cannot walk anyone backwards, and — because `compareVersions` already sorts `1.3.0` above every
`1.3.0-beta.N` — the full release ends a beta run with no special case.
<!-- verify: {"path": "youcoded/desktop/src/main/update-release-status.ts", "contains": "selectRelease"} -->
<!-- verify: {"test": "youcoded/desktop/tests/update-release-status.test.ts"} -->

**The channel is opt-in, and "never chosen" is not the same as "off"** (`update-settings.ts`,
`~/.youcoded/config.json` → `updates.betaChannel`). An install that has never been asked inherits
the answer its own build implies: a `1.3.0-beta.77` build checks the beta channel, a `1.3.0` build
does not. That default is the whole point — a flat `false` would strand exactly the people already
running betas, who are the ones the channel exists for. An explicit choice wins in both directions,
and turning it off while on a beta is safe: the next stable release still sorts above every beta of
its line. Settings → Development → **Get beta builds** (the fifth card in that list, no heading of its own), and the same switch under the release
notes in the version pill's update popup (Destin moved it out of About on 2026-09-13: the rows it now
sits with are the ones for people helping with the app rather than only using it). Desktop only,
because Android has no in-app updater. Changing it re-checks immediately rather than leaving the 30-minute cache showing an
answer computed against the other channel.
<!-- verify: {"path": "youcoded/desktop/src/main/update-settings.ts", "contains": "resolveBetaChannel"} -->

**The `base` prefix is still load-bearing — read this before changing it.** A beta must sort above
the release it is ahead of. `1.3.1-beta` does (and sorts above every `1.3.0-beta.N` already
published); `1.2.4-beta.N` sorts *below* a released `1.2.4`, so it
would show "update available" and offer to downgrade itself to the release it is meant to be ahead
of. **Bump the minor and suffix**, never patch-suffix the current version.
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
(`YouCoded.Setup.<version>.exe` up to 1.3.0-beta.76, `YouCoded-Installer-<version>.exe` after
the installer rename). That reverts the *code* only — it does **not** un-migrate
`~/.claude/` or `~/.youcoded/` state that the newer build may have already rewritten. Snapshot both
before installing a beta that's far ahead of your release (there's precedent: the 776 MB
`claude-snapshot.tar.gz` taken 2026-07-12 before the two-device dogfood).

**Every app, installer, tray and Android launcher icon is generated — never hand-edit one.** The
source is `youcoded/scripts/icons/brand-icons.html` (the glass icon from brand rounds 11–31,
`docs/active/design/2026-10-01-brand-identity-v2/DECISIONS.md`); `node scripts/build-icons.mjs` from
`youcoded/` screenshots it in headless Chrome and writes the desktop PNG/ICO/ICNS files, the Mac
Liquid Glass package `desktop/assets/icon.icon/`, the tray icons (one-colour `-macTemplate` pair on
macOS) and the Android `mipmap-*` layers (needs Chrome, `rsvg-convert`, `magick`, Python with
Pillow). `--themes <wecoded-themes checkout>` also writes each marketplace theme's icon set into
`themes/<slug>/assets/app-icon/`. Sizes up to 48px come from a separate drawing with bigger eyes.
**The Mac build needs Xcode 26+**: electron-builder compiles `icon.icon` with `actool`
(`mac.icon` in `electron-builder.yml`). `desktop/tests/app-icons.test.ts` pins which file each
platform reads, because electron-builder and Android both fall back to a default icon silently.
The RUNNING app swaps window, taskbar, Dock and tray icons per theme (`desktop/src/main/theme-icon-swap.ts`):
on macOS 26 the Dock follows the user's icon look (`app-icon.ts` → `chooseDockIcon`, the setting read
in `mac-icon-look.ts`), and "no theme icon" hands the Dock back to the bundled Liquid Glass icon by
passing `null` — never a flat file. `desktop/tests/app-icon-runtime.test.ts` pins that.
<!-- verify: {"path": "youcoded/scripts/build-icons.mjs", "contains": "brand-icons.html"} -->
<!-- verify: {"test": "youcoded/desktop/tests/app-icons.test.ts"} -->
<!-- verify: {"test": "youcoded/desktop/tests/app-icon-runtime.test.ts"} -->

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

To check a dmg before handing it to a tester, extract it and confirm the arch **and the
signature**:

```bash
7z x -y YouCoded-<version>.dmg -o/tmp/dmgcheck >/dev/null
find /tmp/dmgcheck -type d -name '*-darwin-*'        # expect darwin-x64 in the unsuffixed dmg
file "$(find /tmp/dmgcheck -path '*MacOS/YouCoded')" # expect Mach-O 64-bit x86_64
ls -d /tmp/dmgcheck/*/YouCoded.app/Contents/_CodeSignature   # MUST exist — see below
```

**A missing `_CodeSignature` means the dmg cannot be opened by anyone.** macOS then rejects
the app as *broken* rather than *unverified*, which removes the "Open Anyway" button from
System Settings and leaves a user no way in at all. This is not hypothetical: electron-builder
≤ 26.8.1 ad-hoc signed automatically when it found no certificate, 26.15.3 silently dropped
that fallback, and the 2026-07-23 Dependabot bump shipped six weeks of unopenable macOS
builds with every check green. Both mac workflows now run
`desktop/scripts/verify-mac-signature.sh`, which asks `codesign --verify --deep --strict` for
a verdict and compares the signing identifier to the bundle's own `CFBundleIdentifier`, and
`mac.forceCodeSigning` makes electron-builder itself fail when it cannot sign — so CI
catches it first; this recipe is the manual counterpart for a dmg already in hand (on a Mac,
run the same `codesign --verify --deep --strict` on the extracted `.app`).
Full postmortem: `docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md`.
<!-- verify: {"path": "youcoded/desktop/electron-builder.yml", "contains": "identity: '-'"} -->
<!-- verify: {"path": "youcoded/desktop/electron-builder.yml", "contains": "forceCodeSigning: true"} -->
<!-- verify: {"path": "youcoded/desktop/scripts/verify-mac-signature.sh", "contains": "--verify --deep --strict --verbose=2"} -->
<!-- verify: {"path": "youcoded/.github/workflows/desktop-release.yml", "contains": "verify-mac-signature.sh"} -->
<!-- verify: {"path": "youcoded/.github/workflows/desktop-test-build.yml", "contains": "verify-mac-signature.sh"} -->
<!-- verify: {"test": "youcoded/desktop/tests/verify-mac-signature.test.ts"} -->

### Windows signing

Since 2026-10-01 the Windows installer of a `v*` release and of every **master** beta is
signed with Azure Artifact Signing; every other Windows build (desktop-ci, local, other
branches, forks) stays unsigned. The certificate is Destin's own (individual validation —
Microsoft refuses organisations under three years old), so the publisher reads
**"Destin Moss"**; the company can take over around 2029-09. Account facts and the
decision live in the brain (`~/system/legal/playbooks.md` → Azure Artifact Signing).

How it fits together (`desktop/electron-builder.win-sign.yml` explains each choice):

- The base `electron-builder.yml` has no Windows signing. The overlay
  `electron-builder.win-sign.yml` extends it, adds `win.azureSignOptions` (account
  `destinmoss`, profile `youcoded-public`, endpoint `https://wus3.codesigning.azure.net`)
  and `win.forceCodeSigning`. Workflows select it with
  `npm run build -- --config electron-builder.win-sign.yml`.
- GitHub signs in to Azure with **no stored password**: the Windows leg runs in the
  `windows-signing` GitHub environment, and Azure's app registration
  `youcoded-github-signing` trusts exactly the subject
  `repo:itsdestin/youcoded:environment:windows-signing`. The environment's variables
  `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` are IDs, not secrets.
  Its deployment rule admits only `master` and `v*` tags.
- After the build, Windows' own `Get-AuthenticodeSignature` must report **Valid** for the
  installer and `win-unpacked/YouCoded.exe`, or the leg fails — and a failed leg withholds
  the whole release, as with the Mac check.
- The in-app updater is unaffected: it trusts the signed release manifest, whose hashes are
  taken from the already-signed installers.

Pinned by `desktop/tests/windows-signing-config.test.ts`. SmartScreen reputation builds per
certificate with downloads, so the blue warning fades over weeks rather than vanishing.

**What users see is checked in a clean guest, not here.** CI proves the signature is valid; only
a real first launch shows the SmartScreen / Gatekeeper wall. After any signing change:
`scripts/vm/vm.sh win start && scripts/vm/vm.sh win load beta` (and `mac` once Apple signing
lands) puts the newest beta in the guest's Downloads with the internet mark — see
`docs/vm-testing.md` → Quick loop.

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
