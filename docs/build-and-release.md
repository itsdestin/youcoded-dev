# Build Order & Release Flows

Destin does not build locally. All builds happen through GitHub Actions CI in the relevant sub-repo.

## Build order dependencies

### `build-web-ui.sh` MUST run before Android APK builds
Located at `destincode/scripts/build-web-ui.sh`. Runs `npm ci && npm run build` in `desktop/`, then copies `desktop/dist/renderer/` into `app/src/main/assets/web/`. If skipped, the Android app launches with a blank WebView.

The Android release workflow (`android-release.yml:35`) invokes this before `./gradlew assembleRelease bundleRelease`.

### Desktop version comes from git tag, not package.json
CI extracts version from the `vX.Y.Z` tag and patches `package.json` before building (`desktop-release.yml:40-46`). Local `package.json` version is not the source of truth.

### Android version requires manual bump
Both `versionCode` (integer, monotonically increasing for Play Store) and `versionName` (string) must be bumped in `app/build.gradle.kts` **before** tagging. CI does not derive Android versions from the tag — Play Store requires `versionCode` to always increase, so it cannot be derived.

Current: `versionCode = 7`, `versionName = "2.3.2"` (app/build.gradle.kts:23-24).

### One tag, all platforms
A single `vX.Y.Z` tag in destincode triggers both `android-release.yml` and `desktop-release.yml`. Both upload artifacts (APK/AAB + Win/Mac/Linux installers) to the same GitHub Release.

## Release flows

### App (Desktop + Android)
1. Bump `versionCode` + `versionName` in `destincode/app/build.gradle.kts`
2. Tag `vX.Y.Z` in destincode on master
3. Both platform workflows trigger → single GitHub Release with all artifacts

### Toolkit (destinclaude)
1. Bump `version` field in `destinclaude/plugin.json` on master
2. `auto-tag.yml` compares `HEAD` vs `HEAD~1` plugin.json versions
3. If changed, creates `vX.Y.Z` tag automatically

## Local verification (when needed)

```bash
# Desktop
cd destincode/desktop && npm ci && npm test && npm run build

# Android
cd destincode && ./gradlew assembleDebug && ./gradlew test

# Build Android React UI from desktop source (required before APK)
cd destincode && ./scripts/build-web-ui.sh
```
