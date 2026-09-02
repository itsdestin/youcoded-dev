---
date: 2026-09-01
status: active
type: investigation
topic: Android never reads youcoded-skills.json after first run — SkillConfigStore.load() has no production caller
---

# Android forgets skill settings after the first launch

**Roadmap entry:** `docs/roadmap/android-only.md` (bug is in Android's own Kotlin; desktop is
unaffected).
**History:** added 2026-08-28 (found while adding the quick-chip edit surface, youcoded#359);
re-verified still present 2026-09-01. Not yet reproduced on a device — read off the source.

## What a user experiences

On Android, favourites, quick chips, skill overrides, private skills and theme favourites
all revert to defaults on every launch after the first. Worse, the first thing that *writes*
the config (or, for theme favourites, merely *reads* it) replaces the whole file with only the
one key just touched — so anything the user had set before is gone from disk, not just
from memory.

## Mechanism (verified 2026-09-01 against master)

- `SkillConfigStore.config` starts as an empty `JSONObject` and the class has no `init` block,
  so constructing the store never reads the file
  (`youcoded/app/src/main/kotlin/com/youcoded/app/skills/SkillConfigStore.kt:14`).
  <!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/skills/SkillConfigStore.kt", "contains": "private var config: JSONObject = JSONObject\\(\\)"} -->
- `rg -n '\bload\(|\breload\(' app/src/main/kotlin/` (2026-09-01) finds `load()` called only
  from `reload()` (`SkillConfigStore.kt:254`); `reload()` itself is called nowhere in
  production. The only other hit is an unrelated `WorkingDirStore.init { reload() }`.
- The sole production entry point is `LocalSkillProvider.ensureMigrated()`
  (`LocalSkillProvider.kt:875`, called from `SessionService.kt:340`), which calls
  `configStore.migrate()` **only when the file does not exist**. A fresh install therefore
  works for exactly one launch; every launch after that runs against an empty `config`.
- Consequences of an empty `config`:
  - every getter falls through to its default (`getChips()` → `defaultChipsJson()`,
    `getFavorites()` → `JSONArray()`, `getOverrides()`, `getPackages()`, `getPrivateSkills()`);
  - `save()` (`:267-272`) writes `config.toString(2)` **wholesale**, so the first write of any
    kind replaces the file with only the key just set — dropping favorites, chips, overrides,
    privateSkills, packages and themeFavorites;
  - `getThemeFavorites()` (`:303-307`) calls `save()` on a READ when `themeFavorites` is
    absent — which it always is in an empty config — so merely opening the theme list
    truncates the file.
- Already known and worked around in a test rather than fixed:
  `LocalSkillProviderInstalledTest.kt:100` — "SkillConfigStore.config stays empty until
  load() runs. Force load so…".
- Desktop is unaffected: `desktop/src/main/skill-config-store.ts` loads on every access.
- Commits touching these files since 2026-08-28 (`dc1f60c8`, `a594253b`, `73d87e30`,
  `b2085ebd`) are dependency bumps and marketplace install fixes — none adds a `load()` call.

## Before fixing

- Reproduce with the local Android suite: `JAVA_HOME=/usr/lib/jvm/java-21-openjdk
  ANDROID_HOME=/home/destin/.android-sdk ./gradlew test -x bundleWebUi` (SDK exists; ~2 min).
- The fix is a `load()` at construction (or in `ensureMigrated()` when the file exists), plus
  a check of whether existing installs have already been truncated — a migration may need to
  re-seed defaults without clobbering a user's surviving keys.
- This sits upstream of the uninstall-cascade fix in youcoded#359, which is correct but
  insufficient on Android while this stands.
