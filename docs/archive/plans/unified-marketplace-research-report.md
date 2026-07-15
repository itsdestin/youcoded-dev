---
status: shipped
origin: wecoded-marketplace@eecc843:docs/unified-marketplace-research-report.md
---

# Unified Marketplace Research Report

**Date:** 2026-04-07
**Context:** Research session exploring how to unify YouCoded's skill marketplace, theme marketplace, and YouCoded toolkit layer system into a single marketplace with a visual UI and full install/update/remove lifecycle.

---

## Part 1: What We Investigated

This session set out to understand how plugins, skills, themes, and toolkit features are installed, updated, and managed across the YouCoded ecosystem — with the goal of designing a single unified marketplace to replace the current fragmented systems.

We investigated:
- The native Claude Code plugin marketplace (`anthropics/claude-plugins-official`)
- The YouCoded skill marketplace (`itsdestin/wecoded-marketplace`)
- The YouCoded theme marketplace (`itsdestin/wecoded-themes`)
- The YouCoded toolkit layer system (core/life/productivity)
- The hook relay system between the YouCoded app and Claude Code
- The native plugin format capabilities and limitations
- The `/update` command lifecycle
- Android platform support for themes and plugins

---

## Part 2: How the Systems Actually Work

### 2a. The YouCoded Skill Marketplace (Current State)

**Registry:** `wecoded-marketplace/index.json` — 151 entries (29 YouCoded + 122 imported from Anthropic)

**Import pipeline:** `scripts/sync.js` reads Anthropic's `marketplace.json`, transforms entries to YouCoded's schema, and writes to `index.json`. YouCoded entries (marked `sourceMarketplace: "youcoded-core"`) are protected from overwrite. The script does NOT preserve SHA hashes from upstream — it assigns a static `"1.0.0"` version and a `publishedAt` timestamp to every imported entry.

**App fetches from:** `raw.githubusercontent.com/itsdestin/wecoded-marketplace/main/index.json` with 24-hour cache TTL. Cached to `~/.claude/wecoded-marketplace-cache/` (which exists but is currently empty on Destin's machine — the cache is populated lazily on first "local" source plugin install).

**Install flow (desktop):**
1. `skill-provider.ts` fetches the index, finds the entry
2. If type is `prompt` → stores directly in `youcoded-skills.json` as a private skill (no files on disk)
3. If type is `plugin` → delegates to `plugin-installer.ts`:
   - `local` source: clones `anthropics/claude-plugins-official` to cache (if not cached), copies plugin directory to `~/.claude/plugins/<id>/`
   - `url` source: `git clone --depth 1` directly to `~/.claude/plugins/<id>/`
   - `git-subdir` source: sparse checkout to temp dir, copy to `~/.claude/plugins/<id>/`
4. Creates `.claude-plugin/plugin.json` if missing (normalization)
5. Records install metadata in `youcoded-skills.json` under `installed_plugins`
6. Invalidates skill cache

**Install flow (Android):** Parallel Kotlin implementation in `PluginInstaller.kt`. Same logic. Additionally sends `/reload-plugins\r` to the active PTY session so Claude Code discovers the new plugin immediately.

**Desktop is missing the `/reload-plugins` step.** After install, the plugin appears as "installed" in the UI, but Claude Code doesn't know about it until the user starts a new session.

**Current state on Destin's machine:** Zero plugins installed via the marketplace. The `youcoded-skills.json` file has favorites and chips but no `installed_plugins` section. The marketplace cache directory is empty.

**Uninstall:** Deletes the plugin directory from `~/.claude/plugins/` and removes the entry from `youcoded-skills.json`. Cascade cleanup removes favorites, chips, and overrides for that ID.

**No update detection.** No SHA pinning, no version comparison. The only update mechanism is the YouCoded `/update` command's `phase_marketplace_plugins`, which re-copies/re-pulls installed plugins.

**No publish flow.** `skill-provider.ts` has a `publish()` method that throws "not yet implemented."

**Supporting infrastructure that exists but is empty/unused:**
- `stats.json` — exists in repo, empty
- `overrides/` — directory exists, no files
- `featured.json` — has 1 entry
- `curated-defaults.json` — has 8 entries

### 2b. The YouCoded Theme Marketplace (Current State)

**Registry:** `wecoded-themes/registry/theme-registry.json` — auto-generated from `themes/{slug}/manifest.json` files.

**UI:** Full-screen modal (`ThemeMarketplace.tsx`), separate from the skill marketplace. 2-column card grid with filters (source, mode, features) and search. Cards show token-based mock UI previews.

**Detail view** includes live preview — applies theme tokens to the DOM without installing. User can try before buying.

**Install:** Downloads manifest + assets to `~/.claude/wecoded-themes/{slug}/`. Validates CSS safety for community themes (no @import, no external URLs, no expressions). Enforces 10MB total size limit.

**Publish flow (fully implemented):** Fork `itsdestin/wecoded-themes` via `gh` CLI → create branch `theme/{slug}` → generate preview PNG via offscreen Electron window → upload files via GitHub Contents API → open PR. CI validates token requirements, CSS safety, size limits, slug uniqueness. Auto-rebuilds registry on merge.

**Uninstall:** Deletes theme directory. Refuses to delete user-created themes (only community-installed).

**Hot-reload:** `theme-watcher.ts` watches theme directories and emits `theme:reload` IPC events. Theme context reloads on the fly.

**Theme system on Android:** Built-in themes (light, dark, midnight, creme) work perfectly — they're compiled into the React bundle as JSON imports, applied via pure CSS custom properties and localStorage. The native `Theme.kt` is Material Design 3 theming for Compose-only screens (setup, tier picker), completely separate from the React theme engine. Custom themes with assets don't work on Android because `theme-asset://` is an Electron custom protocol with no Android equivalent. Theme marketplace UI is inaccessible because the bridge messages don't exist.

### 2c. The Native Claude Code Plugin System

**Marketplace transport:** The marketplace at `~/.claude/plugins/marketplaces/claude-plugins-official/` is NOT a git clone. It's a flat archive downloaded from Google Cloud Storage, identified by a SHA1 hash in `.gcs-sha`. Contains `marketplace.json` (160 entries) plus bundled source for local plugins.

**Plugin install:** Native install puts plugins at `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` (versioned path). Tracked in `installed_plugins.json` with version 2 format, keyed as `<plugin-name>@<marketplace>`.

**Plugin discovery:** At session start, Claude Code scans `~/.claude/plugins/` for directories containing `.claude-plugin/plugin.json`. Auto-discovers skills, commands, agents, hooks (from `hooks/hooks.json`), and MCP servers (from `.mcp.json`).

**Enable/disable:** Via `settings.json` → `enabledPlugins`. When disabled, all components (hooks, MCPs, skills, commands) stop loading. Data directory persists.

**Currently installed on Destin's machine:** Two plugins — `explanatory-output-style` and `learning-output-style`, both from `claude-plugins-official`. The first is enabled, the second is disabled.

**Marketplace refresh:** On-demand only (during `/plugin install` or `/plugin update`). Not automatic on session start. `known_marketplaces.json` tracks `lastUpdated` timestamp.

### 2d. The YouCoded Toolkit Layer System

**Three layers:**

**Core (always installed):** 4 skills (setup-wizard, sync, remote-setup, theme-builder), 9 commands, 12+ hooks, 1 agent, MCP manifest for platform-specific servers. Provides infrastructure: sync, file protection, statusline, config management.

**Life (optional):** 7 skills (journaling-assistant, 4 encyclopedia skills, google-drive, fork-file), 8 encyclopedia templates. Dependencies: rclone, Google account.

**Productivity (optional):** 2 skills (claudes-inbox, skill-creator), 2 MCP servers (imessages, gmessages), todoist cloud MCP. Dependencies: Go (for gmessages on non-Windows), gws CLI.

**Layer independence:** Life and Productivity have zero dependencies on each other. Both depend on Core for symlink infrastructure, config management, sync hooks, and the `/update` mechanism.

**Installation:** The setup wizard (a conversational skill) handles everything — dependency checks, layer selection, symlink creation, template copying, config population, hook registration, MCP server setup.

**Update mechanism:** `/update` command fetches latest git tag, merges, runs `post-update.sh` with 10 sequential phases: self-check → migrations → refresh (symlinks) → settings-migrate (hook reconciliation) → orphans → verify → mcps → plugins → marketplace-plugins → deps.

### 2e. The Hook Relay System

**Purpose:** The YouCoded desktop app needs to know about Claude Code hook events (especially PermissionRequest) to display them in the React UI.

**Mechanism:** `install-hooks.js` runs on every app launch. It registers relay hooks in `settings.json` for 11 predefined event types. The relay scripts (`relay.js`, `relay-blocking.js`) are generic — they forward any JSON over a named pipe to the Electron app.

**Preservation:** The script finds existing relay entries by command path and updates them in place. All other hooks (YouCoded's, user's custom, plugin hooks) are left untouched. Additive only.

**Limitation:** The event type list is hardcoded. New hook types added by Claude Code (like `PreCompact`) won't be relayed until `install-hooks.js` is updated.

**One overlap:** The app registers its own `title-update.sh` as a PostToolUse hook, which overwrites the toolkit's version of that specific entry.

---

## Part 3: Misunderstandings (Corrected)

### 3a. "Themes don't work on Android"
**Wrong.** Built-in themes work perfectly on Android. The React theme system is pure CSS + localStorage, which works in any WebView. The `Theme.kt` file is Material Design 3 theming for native Compose screens only — completely separate from the React theme engine. Only custom themes with image assets and the theme marketplace are desktop-only.

### 3b. "The marketplace is just a discovery index"
**Wrong.** YouCoded has a full plugin installation pipeline — `PluginInstaller` on both platforms handles git cloning, sparse checkout, file copying, plugin.json normalization, conflict detection against native installs, and install metadata tracking.

### 3c. "The relay system might conflict with plugin hooks"
**Wrong.** The relay is additive — it doesn't overwrite or block other hooks. `install-hooks.js` carefully searches for existing relay entries and updates only those. YouCoded hooks, native plugin hooks, and relay hooks all coexist without conflict.

### 3d. "The hook relay catches all hooks"
**Wrong.** It catches 11 predefined types. New hook types would be missed. The relay scripts themselves are generic, but the registration is hardcoded.

### 3e. "The native marketplace is a git clone"
**Wrong.** It's a flat archive from Google Cloud Storage. The `.gcs-sha` file is an integrity hash, not a git commit SHA. YouCoded's cache IS a git clone (separate thing).

### 3f. Overstating the "dual registry" problem
Presented as a major issue, but in reality zero plugins have been installed via YouCoded's marketplace. The `installed_plugins` section doesn't even exist in `youcoded-skills.json` yet. The dual registry problem is theoretical at this point.

---

## Part 4: Things We Never Checked

### 4a. The actual Marketplace.tsx component
We know it exists (`Marketplace.tsx`, `SkillCard.tsx`, `SkillDetail.tsx`, `SkillManager.tsx`) but never read the implementation. Don't know: how it currently handles tabs/sections, whether it has infrastructure for multiple content types, what state management pattern it uses, or how much refactoring the unified design would require.

### 4b. How the Android bridge handles skill install end-to-end
We traced the Kotlin `PluginInstaller.kt` and `LocalSkillProvider.kt`, but never verified whether plugin installation actually works on Android. The `install()` method in `LocalSkillProvider` throws "Plugin installation from marketplace not yet implemented" for non-YouCoded plugins. Current state of Android marketplace functionality is unclear.

### 4c. How `sync.js` handles entry removal
We know it protects YouCoded entries and imports upstream entries. But what happens when an upstream plugin is removed from Anthropic's marketplace? Does sync.js delete the entry from our index? Leave it as an orphan? Never checked.

### 4d. The SkillScanner internals
We know it scans `~/.claude/plugins/` for installed skills, but never read `skill-scanner.ts` in detail. Don't know how it handles edge cases like malformed plugin.json, missing SKILL.md files, or the interaction between native plugins and YouCoded-installed plugins.

### 4e. How the build-web-ui.sh pipeline affects marketplace on Android
The shared React UI is built from desktop source and bundled into Android assets. Never checked whether the marketplace components are included in that build, whether they're conditionally rendered based on platform, or whether Android-specific stubs exist.

### 4f. Performance of the marketplace fetch
With 151+ entries and potentially growing, never checked how the index fetch, parse, and render cycle performs. Is there pagination? Lazy loading? Or does it load everything at once?

### 4g. How the `overrides/` system in the marketplace repo actually works
The directory exists but is empty. Know the concept (per-entry metadata patches) but never traced how overrides would be applied during fetch — whether `sync.js` applies them, whether the app applies them client-side, or whether it's unimplemented.

### 4h. The exact mechanism for getting `plugin/` content into `~/.claude/plugins/`
Settled on packages installing to `~/.claude/youcoded-packages/<id>/` with a `plugin/` subdirectory. But didn't definitively decide whether the app should symlink or copy. Symlinks are cleaner but fragile on Windows. Copies are reliable but mean the config.json trick wouldn't work if the copy is separate from the package.

### 4i. Whether Claude Code's auto-discovery handles symlinked plugin directories
If `~/.claude/plugins/my-plugin` is a symlink to `~/.claude/youcoded-packages/my-plugin/plugin/`, does Claude Code's scanner follow the symlink? Likely yes on macOS/Linux. Uncertain on Windows (junctions vs symlinks vs MSYS symlinks).

### 4j. Theme registry migration
The current theme registry lives in `wecoded-themes/registry/theme-registry.json`. In the unified model, it moves to `wecoded-marketplace/themes/index.json`. Never discussed the migration path — how to move the registry, update the fetch URLs, handle users on old app versions, etc.

### 4k. Backwards compatibility
If users have the current system (separate skill/theme marketplaces, toolkit layers via setup wizard), what happens when they update to the unified marketplace? Do existing installs get migrated? Does the old `youcoded-skills.json` format get preserved? What about users who installed layers via the setup wizard — do those become "installed packages" retroactively?

---

## Part 5: Current Plan — Unified Marketplace Design

### Architecture Decisions Made

**1. Single marketplace, two UI sections.**
One marketplace in the YouCoded app with two browsable sections: "Skills & Plugins" and "Themes." Toolkit add-ons appear as featured/curated entries within Skills & Plugins, not as a separate section. They're just "bigger" skills from the user's perspective.

**2. YouCoded Marketplace is the sole source of truth.**
The app only talks to one registry: `itsdestin/wecoded-marketplace`. This registry aggregates entries from Anthropic's marketplace (via `sync.js`), YouCoded toolkit components, and community contributions. Once an entry is in our marketplace, it's ours — the app doesn't interact with upstream sources at runtime.

**3. Separate indexes per section, shared curation.**
```
wecoded-marketplace/
├── skills/index.json        (plugins, prompt skills, bundles, MCPs)
├── themes/index.json        (community themes)
├── curated-defaults.json    (cross-type)
├── featured.json            (cross-type)
├── stats.json               (cross-type)
├── overrides/               (per-entry metadata patches)
└── scripts/sync.js          (admin tool: imports upstream)
```

Each index has a schema tailored to its type. No forcing themes and plugins into the same schema.

**4. Packages install to `~/.claude/youcoded-packages/<id>/`.**
Each package is a self-contained directory:
```
~/.claude/youcoded-packages/<id>/
├── manifest.json              (identity, version, contains[], config schema)
├── plugin/                    (Claude Code native plugin content)
│   ├── .claude-plugin/plugin.json
│   ├── config.json            (app writes user config here)
│   ├── skills/
│   ├── hooks/
│   ├── commands/
│   └── .mcp.json
├── theme/                     (theme content)
│   ├── manifest.json
│   └── assets/
├── ui/                        (future: app UI components)
└── data/                      (templates, seed files)
```

**5. Well-known subdirectories with type-specific handlers.**
- `plugin/` → installed to `~/.claude/plugins/<id>/` for Claude Code discovery
- `theme/` → installed to theme system
- `ui/` → future extension point
- `data/` → app handles (template copying, seed files)

A single package can contain multiple types (e.g., a theme + matching skills).

**6. Config stored in `plugin/config.json`.**
Package `manifest.json` declares a config schema (field names, types, defaults, labels). The app renders a form after install. Values written to `plugin/config.json`, readable by plugin code via `${CLAUDE_PLUGIN_ROOT}/config.json`.

**7. Updates flow through the YouCoded Marketplace.**
`sync.js` is the admin tool that imports upstream changes, pins SHAs, bumps versions. Users see "update available" when the marketplace index version is newer than their installed version. The original source URL is preserved in the entry schema as an escape hatch for direct-from-source updates, but the default path is always through the curated marketplace.

**8. Version comparison for update detection.**
Every entry has a version field. The app stores the installed version in the package's `manifest.json`. On marketplace open, compare installed vs index. Uniform across all entry types.

**9. External dependency checks at install time.**
Package manifest declares `dependencies: ["rclone", "go"]`. App checks PATH before installing. Blocks or warns if missing. Package-to-package dependencies declared as `requires: ["other-package-id"]` — schema field ready for when needed.

**10. Bundles can contain hidden skills.**
Some skills only exist inside bundles (e.g., the 5 encyclopedia skills are only installable as part of "Journaling & Encyclopedia"). They install normally but don't have standalone marketplace listings.

### Architecture Decisions Deferred

**1. How Core gets merged into the app.**
Core currently provides both infrastructure (hooks, sync, config) and user features (commands, skills). Merging infrastructure into the app is the right direction but needs careful planning. The sync system, file guards, and statusline all need app-native implementations. User-facing features (theme-builder, remote-setup, `/health`, `/restore`) could become marketplace entries.

**2. Native plugin format vs custom install for toolkit add-ons.**
Native format handles 80% (skills, commands, hooks, MCPs auto-discover). The 20% gap (post-install setup, templates, dependency declaration, global config) would be bridged by the app's package manager. Haven't committed to whether toolkit add-ons use the native plugin format internally or a custom structure.

**3. Symlink vs copy for `plugin/` → `~/.claude/plugins/`.**
Symlinks are cleaner (one source of truth, config.json accessible from both paths). Copies are more reliable on Windows. Needs testing on all platforms, especially Windows junctions/symlinks.

**4. Android marketplace support.**
Built-in themes work. Custom themes need `theme-asset://` protocol handler in WebViewHost. Plugin installation needs bridge messages. The skill marketplace UI may already render in the Android WebView (shared React) but the IPC handlers aren't wired up.

**5. Whether `/update` is replaced or coexists.**
The app could own most of the update lifecycle (JSON merging, symlink refresh, dependency checks). The git-heavy parts (fetch tags, merge, conflict resolution) are harder to replace. Options: keep `/update` for git, app handles post-update phases; or app downloads release archives from GitHub API (no git needed).

**6. Publish flow for community skills.**
Theme marketplace has a complete publish flow (fork → PR → CI validates). Skill marketplace has none. The same pattern should work for skills, but hasn't been designed.

**7. Backwards compatibility and migration.**
Users with current installations (separate marketplaces, layers via setup wizard) need a migration path. Existing layer installs need to become recognized packages. Old config formats need to be read and converted.

### What Would Need to Be Built

**New infrastructure:**
- `~/.claude/youcoded-packages/` directory and package manager in the app
- Unified fetch/cache layer (replacing separate skill and theme fetchers)
- Unified IPC namespace (`marketplace:*`) replacing `skills:*` and `theme:marketplace.*`
- Package manifest schema and validation
- Config form renderer (reads manifest schema, renders inputs, writes config.json)
- Update detection service (version comparison on marketplace open)
- Dependency checker (PATH lookups for external tools, package-to-package resolution)

**Modifications to existing code:**
- `Marketplace.tsx` → add Themes section (or merge `ThemeMarketplace.tsx` into it)
- `SkillCard.tsx` / `ThemeCard.tsx` → possibly unified base component with type-specific rendering
- `SkillDetail.tsx` / `ThemeDetail.tsx` → add config form, update button, dependency info
- `sync.js` → add SHA preservation, output to `skills/index.json` instead of `index.json`
- `plugin-installer.ts` → install to `youcoded-packages/<id>/` instead of `plugins/<id>/`, then handle the `plugin/` → `~/.claude/plugins/` step
- Android `SessionService.kt` → add `marketplace:*` bridge handlers
- Android `PluginInstaller.kt` → mirror desktop changes
- `install-hooks.js` → coordinate with package-managed hooks

**Migration tooling:**
- Detect existing layer installs and create package entries retroactively
- Move from `youcoded-skills.json`'s `installed_plugins` to package manifests
- Update fetch URLs from old registry locations to new unified structure
- Handle users running old app versions against new registry format

**Registry restructure:**
- Move `index.json` → `skills/index.json`
- Create `themes/index.json` (import from `wecoded-themes` registry)
- Update `curated-defaults.json` and `featured.json` to reference both sections
- Update `sync.js` to write to new location, preserve SHAs, optionally bundle source

---

## Part 6: Risk Assessment

**Highest risk:** Merging Core into the app. This is the most complex and least well-defined part of the plan. Core provides critical session infrastructure (sync, file guards) that currently runs as shell hooks. Replicating this in the app means the app must be running for these features to work — but users can run Claude Code without the YouCoded app open.

**Medium risk:** Windows symlink reliability. The package system relies on `~/.claude/plugins/<id>` pointing to `~/.claude/youcoded-packages/<id>/plugin/`. Windows symlinks are fragile (require Developer Mode, MSYS configuration, and the correct symlink type). A fallback to file copying would break the `config.json` trick.

**Medium risk:** Backwards compatibility. Users have existing installations with the current directory structure, config format, and registry URLs. The migration path needs to be non-destructive and handle partial states (e.g., user has some layers installed but not others).

**Lower risk:** The registry restructure. Moving from `index.json` to `skills/index.json` and adding `themes/index.json` is straightforward. The app can check both old and new locations during transition.

**Lower risk:** Android marketplace support. The shared React UI means the marketplace UI renders automatically. The gap is IPC handlers, which are well-understood and follow established patterns.
