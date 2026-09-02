---
date: 2026-09-01
status: active
type: investigation
topic: Android SessionService dereferences bootstrap!! in 18 bridge handlers, and the bridge listens before bootstrap is set
---

# Android `SessionService.kt` dereferences `bootstrap!!` in 18 handlers

**Symptom.** Hypothesised, not observed: an Android crash (Kotlin NPE) if the WebView sends
one of ~18 preference/config/sync channels before the service has finished bootstrapping.

## Mechanism

`youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:256` declares
`var bootstrap: Bootstrap? = null`; it is assigned exactly once, in `initBootstrap`
(line 333), which `MainActivity.kt:222` calls after the bootstrap completes.
<!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt", "contains": "var bootstrap: Bootstrap\\? = null"} -->

`rg -c 'bootstrap!!' SessionService.kt` = 18 on 2026-09-01 (lines 847, 1742-2081, 2373):
model preference, appearance, defaults, `.claude` dir, toolkit-state config, backup log and
sync-warnings reads all do `File(bootstrap!!.homeDir, …)`.

The ordering window exists in code: the bridge server is started in `onCreate` (line 289,
deliberately early "so it's already listening when ChatScreen renders the WebView"), i.e.
before `initBootstrap`; the comment at line 306 acknowledges another path that "runs BEFORE
initBootstrap". Whether the React side actually sends any of the 18 channels in that window
is what has NOT been established — the finding came from pattern-matching, not a device.
The team already handles a related window by hand at lines 2601-2604 / 2639-2641 (a sign-out
racing a re-read + `!!`).

## What would settle it
Run the Android suite (`JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=/home/destin/.android-sdk ./gradlew test -x bundleWebUi`,
579 tests, ~2 min) and, on a debug APK, log which channels arrive before `initBootstrap`. If
any of the 18 do, the fix is a single early-return guard in `handleBridgeMessage` rather than
18 edits.

## History
- added 2026-08-06 (old ROADMAP L471), reachability unverified; 2026-08-31 correction: the
  "no SDK" blocker was wrong. Re-checked 2026-09-01: still 18 sites; no commit since
  2026-08-06 touches the pattern.
