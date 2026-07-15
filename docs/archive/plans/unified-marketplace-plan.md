---
status: shipped
origin: wecoded-marketplace@eecc843:docs/unified-marketplace-plan.md
---

# Unified Marketplace Plan — Revised

**Date:** 2026-04-08
**Context:** Revised plan for unifying YouCoded's skill marketplace, theme marketplace, and YouCoded toolkit layer system into a single marketplace. This supersedes the research report (`unified-marketplace-research-report.md`) with concrete architecture decisions and an ordered implementation plan.

---

## Current State (as of 2026-04-08)

### What exists today

**Three separate systems** handle installable content in the YouCoded ecosystem:

1. **Skill Marketplace** — `Marketplace.tsx`, 205 lines. Full-screen modal with search, type/category filter pills, sort, 2-column card grid. Data fetched from `itsdestin/wecoded-marketplace/index.json` (151 entries: 29 YouCoded + 122 Anthropic). Backed by `skill-provider.ts` (desktop) and `LocalSkillProvider.kt` (Android). Uses React context (`useSkills()`) for data fetching and state.

2. **Theme Marketplace** — `ThemeMarketplace.tsx`, 227 lines. Separate full-screen modal, nearly identical layout. Data fetched from `itsdestin/wecoded-themes/registry/theme-registry.json` (3 themes). Has live preview, full publish flow (fork -> PR -> CI). Desktop only — no Android bridge messages. Uses direct IPC calls (`window.claude.theme.marketplace.list()`) with no context wrapper.

3. **YouCoded Toolkit** — Three layers (Core/Life/Productivity) installed via conversational setup wizard. Git-based updates via `/update`. Not integrated with either marketplace.

**Additionally, `SkillManager.tsx` (562 lines)** is a separate management UI with two tabs: "My Skills" (list installed skills with favorite/edit/share/delete actions) and "Quick Chips" (manage input bar shortcuts). It sits between the command drawer and the marketplace in the navigation flow.

### Content breakdown

| Source | Prompts | Plugins | Themes | Total |
|--------|---------|---------|--------|-------|
| YouCoded | 16 | 13 | — | 29 |
| Anthropic | 0 | 122 | — | 122 |
| Community themes | — | — | 3 | 3 |
| **Total** | **16** | **135** | **3** | **154** |

Of the 122 Anthropic plugins: 47 are `local` (code bundled in Anthropic's repo), 61 are `url` (external GitHub repos), 14 are `git-subdir` (subdirectory of an external repo). For `url` and `git-subdir`, the actual code download goes directly from the author's repo to the user's machine — Anthropic's repo is just the catalog.

### What's broken or missing

- **No update detection.** `sync.js` stamps every Anthropic entry with `"1.0.0"` and re-stamps `publishedAt` on every run. No SHA pinning, no version comparison. Anthropic's `marketplace.json` includes SHAs for external plugins — `sync.js` throws them away.
- **Android plugin install routing gap.** `SessionService.kt` handles plugin installs for Anthropic-sourced entries by calling `PluginInstaller` directly (lines 436-471). But YouCoded-sourced plugins (`sourceMarketplace == "youcoded-core"`) fall through to `LocalSkillProvider.install()`, which throws for all plugin types. This means YouCoded plugins and any future "youcoded"-sourced packages can't install on Android. The fix is to consolidate all install routing into `LocalSkillProvider` so SessionService is a thin dispatcher.
- **Desktop doesn't reload after install.** Android sends `/reload-plugins\r` to the PTY after install. Desktop doesn't — the plugin appears as "installed" in UI but Claude Code doesn't discover it until the next session.
- **No skill publish flow.** `skill-provider.ts` has `publish()` that throws "not yet implemented." Theme publishing is fully implemented.
- **Theme marketplace inaccessible on Android.** No `theme:marketplace:*` bridge messages in `SessionService.kt`. The React UI exists (shared) but has no backend on Android.
- **Custom theme assets don't work on Android.** `theme-asset://` is an Electron custom protocol with no WebView equivalent.
- **Zero marketplace installs in the wild.** `youcoded-skills.json` has no `installed_plugins` section on Destin's machine. The marketplace cache directory is empty. The dual-registry problem (YouCoded's tracking vs Claude Code's `installed_plugins.json`) is theoretical.
- **`sync.js` silently removes delisted entries.** It rebuilds the entire non-YouCoded section from scratch each run. If Anthropic delists a plugin, it simply vanishes from the next sync output — no deprecation flag, no warning. Users who have the plugin installed lose visibility of it in the marketplace.
- **No community skill contributions.** The marketplace repo has no structure for hosting plugin source code or accepting PRs with new plugins.
- **Theme installs are filesystem-only.** No central manifest tracks installed themes — the app discovers them by scanning `~/.claude/wecoded-themes/*/manifest.json`. No version tracking, no update detection.
- **Two incompatible data-fetching patterns.** Skills use a React context; themes use direct IPC. The unified marketplace needs one pattern.
- **SkillManager is disconnected from themes.** It only shows installed skills. Installed themes have no management UI outside Settings -> Appearance.

### Current navigation flow

```
Input bar -> "/" -> Command Drawer (quick launch, search installed skills)
                     | pencil icon
                     v
                   SkillManager (manage installed skills, quick chips)
                     | "Browse Marketplace" button
                     v
                   Marketplace (browse & install skills)

Settings -> Appearance -> ThemeMarketplace (browse & install themes, separate modal)
```

---

## Architecture Decisions

### 1. Scatter-gather install — no intermediate package directory

**Decision:** Install artifacts where the runtime expects them. Track everything in the existing `youcoded-skills.json` manifest.

- Plugins install to `~/.claude/plugins/<id>/` (where Claude Code discovers them)
- Themes install to `~/.claude/wecoded-themes/<slug>/` (where the theme system expects them)
- The existing `~/.claude/youcoded-skills.json` is extended with a `packages` field to track what the marketplace installed, with version, source, and component paths

**Multi-type bundles** (e.g., a plugin + matching theme) install each component to its native location and group them under one package ID:

```jsonc
// ~/.claude/youcoded-skills.json (extended)
{
  "version": 2,
  "favorites": [...],
  "chips": [...],
  "overrides": {...},
  "privateSkills": [...],
  "packages": {
    "study-timer": {
      "version": "1.2.0",
      "installedAt": "2026-04-08T...",
      "source": "marketplace",
      "components": [
        { "type": "plugin", "path": "~/.claude/plugins/study-timer/" },
        { "type": "theme",  "path": "~/.claude/wecoded-themes/study-timer/" }
      ]
    }
  }
}
```

**Three install sources are tracked, each with different behavior:**

| Source | Update | Uninstall | Edit | Publish | Badge |
|--------|--------|-----------|------|---------|-------|
| `"marketplace"` | Yes | Yes | No | No | YouCoded / Anthropic / Community |
| `"user"` | No | Yes (with warning) | Yes | Yes | "My creation" |
| External (not in packages) | No | No (manage via CLI) | No | No | "External" |

**Rationale:** Avoids two-directory sync problem, avoids Windows symlink fragility (Developer Mode requirement, MSYS configuration, junction vs symlink ambiguity). Extends the existing config file rather than creating a new one — reuses atomic write patterns, keeps cascade cleanup (favorites, chips, overrides) in one place. The old `installed_plugins` field is migrated into `packages` when the version bumps from 1 to 2.

**Reconciliation:** On marketplace open, the app verifies that tracked component paths exist on disk. Missing paths are marked broken. Untracked directories in `~/.claude/plugins/` and `~/.claude/wecoded-themes/` are surfaced as "External" items. This prevents manifest/filesystem drift.

### 2. The marketplace repo becomes a plugin host

**Decision:** `itsdestin/wecoded-marketplace` gains a `marketplace.json` and `plugins/` directory, mirroring Anthropic's repo structure. The theme registry moves here from `wecoded-themes`.

Two sources populate the published indexes:
- **Your `marketplace.json`** — YouCoded plugins (bundled locally in `plugins/`), community plugins (bundled locally or `url` pointing to external repos)
- **Anthropic's `marketplace.json`** — imported via `sync.js`

Three badges, explicitly set per entry:
- **YouCoded** — `sourceMarketplace: "youcoded"` — the toolkit and things Destin builds
- **Anthropic Marketplace** — `sourceMarketplace: "anthropic"` — auto-stamped by `sync.js` on import
- **Community** — `sourceMarketplace: "community"` — everything else

The badge reflects who made/curated it, not where the files live. A community plugin can be hosted locally in the repo's `plugins/` directory.

**Life and Productivity are regular plugins.** They are hosted in the marketplace repo under `plugins/youcoded-core-life/` and `plugins/youcoded-core-productivity/`. They install, update, and uninstall like any other plugin. Templates and seed files live inside the relevant skill folders, not in a separate layer-level directory. The setup wizard can still exist as a guided first-run experience that installs these plugins through the marketplace.

**New repo structure:**

```
wecoded-marketplace/
+-- marketplace.json              <- YouCoded/community catalog (Anthropic format)
+-- plugins/                      <- Bundled local plugins (any badge)
|   +-- youcoded-core-life/
|   +-- youcoded-core-productivity/
|   +-- some-community-plugin/
|   +-- ...
+-- skills/
|   +-- index.json                <- Generated: all skills + plugins from both sources
+-- themes/
|   +-- index.json                <- Generated: all themes (moved from wecoded-themes)
+-- curated-defaults.json
+-- featured.json
+-- stats.json
+-- overrides/                    <- Per-entry metadata patches
+-- scripts/
    +-- sync.js                   <- Reads BOTH catalogs, writes indexes
```

**Two-repo cache for `local` source plugins:** The installer needs to know which repo to clone based on `sourceMarketplace` (or a `sourceRepo` field in the index entry). Anthropic `local` plugins clone from `anthropics/claude-plugins-official`. YouCoded `local` plugins clone from `itsdestin/wecoded-marketplace`.

**Index version field:** Each generated index includes a top-level `version` timestamp. The app stores the last-seen version and can skip re-parsing when the index hasn't changed.

### 3. Config lives outside plugin directories

**Decision:** User configuration stored at `~/.claude/youcoded-config/<id>.json`, separate from plugin files.

- Plugins discover config via environment variable `YOUCODED_CONFIG_DIR` (set to `~/.claude/youcoded-config/`) — plugins read `$YOUCODED_CONFIG_DIR/<their-own-id>.json`
- Config schema declared in the marketplace entry's `configSchema` field — the app renders a settings form from it
- Updates can safely overwrite plugin directories without touching config
- Uninstall can optionally preserve config for reinstallation
- Backup/sync covers one directory for all package configs
- On update, config is validated against the new schema — if new required fields were added, the config form prompts the user to fill them in

**Exception:** Plugins imported from Anthropic that use Claude Code's native `${CLAUDE_PLUGIN_ROOT}/config.json` pattern keep their config where Claude Code puts it. The YouCoded config system only manages plugins that declare `configSchema` in their marketplace entry.

### 4. Core stays as a plugin

**Decision:** YouCoded Core remains a Claude Code plugin at `~/.claude/plugins/youcoded-core/`. It is not merged into the app.

- Core is tracked in `youcoded-skills.json` `packages` with `"removable": false`
- Core updates via its existing git-based `/update` command, not through the marketplace
- The marketplace shows Core as "Installed" with a "System" badge, no uninstall button
- Core version is read from `$TOOLKIT_ROOT/VERSION` on marketplace open, not from the manifest (stays fresh after `/update`)
- User-facing Core skills (theme-builder, remote-setup) can optionally get marketplace listings marked "Included with YouCoded Core" for discoverability
- The setup wizard checks `packages` in `youcoded-skills.json` and skips layers already installed via the marketplace

**Rationale:** Core's infrastructure (sync hooks, file guards, write protection) works when Claude Code runs from the terminal without the app open. Merging into the app would break that and require rewriting working shell scripts as TypeScript + Kotlin for zero user-visible benefit.

---

## Implementation Plan (ordered by dependency and impact)

### Phase 0: Quick wins (no dependencies, ship immediately)

#### 0a. Desktop `/reload-plugins` after install

Add `/reload-plugins\r` write to the active PTY session after plugin install on desktop, matching what Android already does in `SessionService.kt:450`. One line in the desktop IPC handler. Zero risk, immediate UX improvement.

#### 0b. Sync.js SHA preservation

Preserve Anthropic's SHA for `url`/`git-subdir` entries (currently discarded by `sync.js`). Standalone PR to `sync.js`, no app changes. Enables future update detection.

### Phase 1: Fix the foundations (no UI changes)

#### 1a. Improve `sync.js`

The sync script needs to detect changes between runs instead of treating every run as a fresh import. Today it rebuilds all non-YouCoded entries from scratch, silently removing any entries that Anthropic has delisted.

- Read both `marketplace.json` (local, YouCoded/community entries) and Anthropic's `marketplace.json` (fetched from GitHub)
- **Diff against previous output:** load the previous `skills/index.json`, identify entries present before but absent now
- For existing entries: compare metadata/SHA against previous import. If changed, bump patch version (`1.0.0` -> `1.0.1`), update `publishedAt`
- For new entries: add at `1.0.0`
- For removed upstream entries: keep the entry but flag with `"deprecated": true` and `"deprecatedAt"` timestamp — users may have them installed
- Preserve Anthropic's SHA for `url`/`git-subdir` entries (Phase 0b may already cover this)
- For `local` entries (with `--local` flag): compute content hash of plugin directory
- Auto-stamp `sourceMarketplace: "anthropic"` on all upstream imports
- Output to `skills/index.json` instead of `index.json`
- Don't re-stamp `publishedAt` when nothing changed — a sync run with no upstream changes should produce identical output
- Add top-level `version` timestamp field to generated index

#### 1b. Create `marketplace.json` for YouCoded entries

Move the 29 existing YouCoded entries from hand-edited `index.json` into a proper `marketplace.json` using Anthropic's catalog format. The 13 YouCoded plugins that are actual plugins (not prompts) get `source` fields pointing to their install locations. The 16 prompts stay as prompt-type entries.

#### 1c. Restructure the registry repo

- `index.json` -> `skills/index.json` (generated by `sync.js`)
- Move theme registry from `wecoded-themes/registry/theme-registry.json` to `themes/index.json`
- Move theme CI (PR validation, registry rebuild, preview generation) to the marketplace repo
- Update `curated-defaults.json` and `featured.json` to reference both sections

#### 1d. Extend `youcoded-skills.json` with `packages` field

Bump version from 1 to 2. Add `packages` field alongside existing fields. Define the schema:

```jsonc
{
  "version": 2,
  "favorites": [...],
  "chips": [...],
  "overrides": {...},
  "privateSkills": [...],
  "packages": {
    "<id>": {
      "version": "1.0.0",
      "source": "marketplace" | "user",
      "installedAt": "ISO8601",
      "removable": true,  // false only for Core
      "components": [
        { "type": "plugin" | "theme", "path": "absolute path" }
      ]
    }
  }
}
```

Write migration logic: on first load with version 1, convert any `installed_plugins` entries to `packages` entries with a single plugin component each, then set version to 2.

#### 1e. Consolidate Android plugin install into LocalSkillProvider

Move plugin install routing from `SessionService.kt:436-471` into `LocalSkillProvider.install()`. Remove the source-specific check (`sourceMarketplace != "youcoded-core"`) so all plugin types route through `PluginInstaller`. `SessionService` becomes a thin dispatcher: `skillProvider.install(id)` for everything. Include `/reload-plugins` and cache invalidation in `LocalSkillProvider` so they can't be forgotten if another install path is added later.

### Phase 2: Unify the UI

#### 2a. Build MarketplaceContext

Create a single `MarketplaceContext` that replaces the split between `useSkills()` (context-based) and direct `window.claude.theme.marketplace.list()` (direct IPC) patterns.

The context:
- Fetches both `skills/index.json` and `themes/index.json` on mount (parallel requests)
- Loads `packages` from `youcoded-skills.json`
- Runs filesystem reconciliation (verify component paths exist, discover external/untracked items)
- Exposes `install(id, type)`, `uninstall(id)`, `update(id)` that work for any type
- Exposes filtered views: `skillEntries`, `themeEntries`, `installedEntries` (all types)
- Exposes `privateSkills` for user-created content
- When any install/uninstall happens, refreshes relevant state so all tabs re-render

The existing `SkillContext` remains for the command drawer (quick-launch skill search). `ThemeContext` remains for applying themes to the DOM. `MarketplaceContext` is specifically for the unified marketplace modal.

#### 2b. Build unified marketplace modal

Replace `Marketplace.tsx` + `ThemeMarketplace.tsx` + `SkillManager.tsx` with a single `Marketplace.tsx` with three tabs:

**Installed tab:**
- Shows all installed content: marketplace packages, user-created items, and external items
- Type indicators on each item (skill, theme, bundle)
- Actions per item based on source:
  - Marketplace: update (if available), uninstall, favorite
  - User-created: edit, publish, uninstall (with warning), favorite
  - External: visible but not manageable, "External" badge
- Quick Chips management as a collapsible section or sub-area
- "Update available" badges where index version > installed version

**Skills tab:**
- Type pills: All / Prompts / Plugins
- Category pills: Personal / Work / Development / Admin / Other
- Source pills: YouCoded / Anthropic / Community
- Sort: Popular / Newest / Rating / Name
- 2-column card grid with `SkillCard` components
- Search bar filters results

**Themes tab:**
- Source pills: Official / Community
- Mode pills: Dark / Light
- Feature pills: wallpaper, particles, glassmorphism, custom-font, custom-icons, mascot, custom-css
- Sort: Newest / Name
- 2-column card grid with `ThemeCard` components (with token-based previews)
- Search bar filters results

Keep `SkillCard` and `ThemeCard` as separate components — they render fundamentally different content. Keep `SkillDetail` and `ThemeDetail` as separate detail views (theme detail has try-before-install preview, which has no skill equivalent).

Shared modal shell: fixed full-screen overlay, header with back button, search bar, tab bar. Each tab manages its own filter state.

#### 2c. Update entry points

All paths lead to the same modal, different default tabs:

```
Command drawer -> pencil icon -> Marketplace (Installed tab)
Command drawer -> "Browse Marketplace" -> Marketplace (Skills tab)
Settings -> Appearance -> "Browse Themes" -> Marketplace (Themes tab)
```

Remove separate `marketplaceOpen`, `themeMarketplaceOpen`, and `managerOpen` state from `App.tsx`. Replace with a single `marketplaceTab: 'installed' | 'skills' | 'themes' | null`.

### Phase 3: Complete the install/update/uninstall lifecycle

#### 3a. Update the install flow

- Install to native locations (not an intermediate directory)
- Record in `youcoded-skills.json` `packages` with version, source, component paths
- For multi-type bundles: install each component to its native location, track all under one package ID
- Handle partial install failure: if plugin installs but theme fails, record what succeeded and surface the error
- Desktop: send `/reload-plugins` after plugin install (Phase 0a may already cover this)
- Update installer to be source-aware for local plugins: clone `anthropics/claude-plugins-official` for Anthropic locals, clone `itsdestin/wecoded-marketplace` for YouCoded locals

#### 3b. Build update flow

- On marketplace open, compare installed versions against index (version field in `packages` vs version field in index entry)
- "Update" button re-downloads from source, overwrites plugin/theme files
- Config is preserved (lives in `~/.claude/youcoded-config/`, outside the blast radius)
- Update the version in `youcoded-skills.json` `packages`
- Handle bundle updates: update all components atomically

#### 3c. Build config form

- Read `configSchema` from marketplace entry
- Render a form in the detail view after install
- Write values to `~/.claude/youcoded-config/<id>.json`
- On update: validate existing config against new schema, prompt for new required fields
- Add IPC handler for both desktop and Android

### Phase 4: Publish and community

#### 4a. Build skill publish flow

Mirror the theme publish pattern:
- Fork `itsdestin/wecoded-marketplace` via `gh` CLI
- Create branch `plugin/<id>`
- Upload plugin directory to `plugins/<id>/`
- Open PR
- Only user-created items show a "Publish" action
- Works on both desktop and Android (both have `gh`)

#### 4b. Add CI validation for skill PRs

- `plugins/<id>/.claude-plugin/plugin.json` must exist with required fields
- No `.env` files, no hardcoded secret patterns
- Size limit
- ID uniqueness across both YouCoded and Anthropic sources
- On merge: auto-add entry to `marketplace.json`, rebuild `skills/index.json`

### Phase 5: Android theme marketplace

This is a multi-step project, not a single task. Each step is independently shippable.

#### 5a. Theme browsing

Add `theme:marketplace:list` and `theme:marketplace:detail` bridge messages to `SessionService.kt`. Users can browse the theme store and see token-based previews (which work in any WebView). No install capability yet. Ships value immediately — Android users can discover themes even if they can't install them.

#### 5b. Token-only theme install

Add `theme:marketplace:install` and `theme:marketplace:uninstall` bridge messages. Download manifest to `~/.claude/wecoded-themes/`. Apply themes that only use color tokens and layout settings — no custom assets. Many themes work with just tokens.

#### 5c. Custom theme assets

Implement `shouldInterceptRequest()` in `WebViewHost.kt`'s `WebViewClient` to intercept `theme-asset://` URLs. Read the file from `~/.claude/wecoded-themes/<slug>/<path>` and return a `WebResourceResponse` with the bytes and correct MIME type. This is the direct Kotlin equivalent of Electron's `protocol.handle()` in `theme-protocol.ts`. Unlocks background images, particle SVGs, mascots, custom CSS.

#### 5d. Theme hot-reload

Add a `FileObserver` on the `~/.claude/wecoded-themes/` directory. On file changes, send reload event via bridge WebSocket. Nice-to-have, not blocking.

### Phase 6: Migration

#### 6a. Migrate existing installs

- Detect existing toolkit layer installs (symlinks in `~/.claude/plugins/` pointing into `youcoded-core/`, or `installed_layers` in toolkit `config.json`) and create entries in `youcoded-skills.json` `packages`
- Convert `youcoded-skills.json` version 1 `installed_plugins` to version 2 `packages` entries (Phase 1d migration logic)
- One-time migration on first launch after update

---

## Known Pitfalls

### Windows symlinks (avoided)

The original plan depended on symlinks from `youcoded-packages/` to `~/.claude/plugins/`. This plan avoids that entirely by installing directly to native locations. However, the existing YouCoded Core install uses symlinks from `~/.claude/plugins/youcoded-core/` into the git repo. This works today because the setup wizard handles it, but it's a fragility point for Core.

### Claude Code native marketplace coexistence

Users can install plugins via Claude Code's `/plugin install` (writes to `installed_plugins.json`) or via YouCoded's marketplace (writes to `youcoded-skills.json`). These can diverge.

**Approach:** On marketplace open, run filesystem reconciliation. Scan `~/.claude/plugins/` and `~/.claude/wecoded-themes/` for all installed items. Show YouCoded-managed ones with full manage actions. Show untracked items as "External" (visible, not manageable). Mark tracked items whose paths no longer exist as "broken" with a cleanup option. This is how VS Code handles extensions installed via CLI vs GUI.

### The 47 `local` Anthropic plugins

These are the only plugins where Anthropic's repo is in the file transfer path. Installing one requires cloning `anthropics/claude-plugins-official` to the cache directory (`~/.claude/wecoded-marketplace-cache/`). With the new repo structure, YouCoded `local` plugins also need a cache clone of `itsdestin/wecoded-marketplace`. The installer must be source-aware — this is explicitly handled in Phase 3a.

### `sync.js` entry removal

When Anthropic delists a plugin, `sync.js` currently silently removes it from the next output (it rebuilds all non-YouCoded entries from scratch). The improved sync (Phase 1a) diffs against the previous output and flags removed entries with `"deprecated": true` rather than deleting them, since users may have them installed.

### Android git dependency

Plugin installation on Android requires git (Termux package). Not all bootstrap tiers may include it. The marketplace should check for git availability before showing install buttons for plugin-type entries on Android. Prompt-type entries don't need git (stored as JSON).

### Hook relay overlap

The YouCoded app's `install-hooks.js` registers relay hooks for 11 event types. If a marketplace plugin also declares hooks for the same events, both fire (additive, not conflicting). The relay system's hardcoded event type list means new Claude Code hook types won't be relayed until `install-hooks.js` is updated.

### No pagination

The marketplace fetches all 151+ entries at once. Not blocking for launch, but the unified marketplace should be designed with lazy loading in mind for future growth. The index version field enables cache-aware fetching to reduce unnecessary network requests.

### `overrides/` system

The directory exists, `sync.js` reads override files, but none currently exist. The intent is per-entry metadata patches (change descriptions, add tags, recategorize). Works as designed — just unused. Available for curating imported entries.

### Bundle uninstall atomicity

With scatter-gather install, a bundle's components live in different directories. If uninstall succeeds for one component but fails for another (permissions, file lock), the package is partially removed. The manifest should support a "partially removed" state, and the Installed tab should surface this with a "retry cleanup" option.

---

## What This Plan Does NOT Cover

- **Monetization / paid plugins.** Everything is free. No payment flow, no licensing.
- **Ratings / reviews.** `stats.json` exists but is empty. The sort-by-popular option has no backing data. Left for future work.
- **Plugin sandboxing / security.** Plugins run with full Claude Code permissions. CI validation catches obvious issues (secrets, size) but doesn't sandbox execution. Same as Anthropic's model.
- **Auto-updates.** Users see "update available" and click a button. No background auto-update. Intentional — users should know when their plugins change.
- **Dependency resolution.** The manifest schema supports `dependencies` (external tools like rclone) and `requires` (other packages), but there's no resolver. Install-time checks only.

---

## Implementation Priority

Ordered by dependency chain and user impact:

1. **Quick wins** — Desktop `/reload-plugins` (one line), sync.js SHA preservation. Zero risk, ship immediately.
2. **Fix `sync.js`** — Two-source model, deprecation flags, idempotent runs. Foundation for everything.
3. **Extend `youcoded-skills.json`** — Add `packages` field, write migration from v1. The tracking manifest, needed before UI work.
4. **Unified marketplace modal** — Three-tab modal (Installed / Skills / Themes) with `MarketplaceContext`, replaces three separate UIs. Immediate UX win.
5. **Install/update/uninstall lifecycle** — Full Phase 3. Source-aware installer, version comparison, bundle support.
6. **Config form** — Schema-driven settings UI, config preserved across updates.
7. **Skill publish flow + CI** — Fork-and-PR model mirroring themes. Unlocks Social AI pillar.
8. **Android theme marketplace** — Four incremental steps: browsing -> token install -> custom assets -> hot-reload.

Each phase is independently shippable. You don't need to build the whole thing to get value from the first few steps.
