---
status: shipped
origin: wecoded-marketplace@eecc843:docs/phase-1-implementation-prompt.md
---

## Task: Unified Marketplace — Phase 1: Fix the Foundations

### Context

We're unifying YouCoded's three separate content systems into a single marketplace. The full plan is at `wecoded-marketplace/docs/unified-marketplace-plan.md`. The raw research is at `wecoded-marketplace/docs/unified-marketplace-research-report.md`. Read both before starting.

Phase 0 (quick wins) should already be completed on a prior branch. This phase builds the data-layer foundations that the UI work in Phase 2 depends on. No UI changes in this phase.

### What you need to do

**Step 1: Familiarize with the codebase.** Read these files to understand the current state:

Registry & sync:
- `wecoded-marketplace/scripts/sync.js` — current sync logic, how it imports from Anthropic, what it discards
- `wecoded-marketplace/index.json` — current schema, sample entries of each type (youcoded-core prompt, youcoded-core plugin, anthropic local, anthropic url, anthropic git-subdir)
- `wecoded-themes/registry/theme-registry.json` — theme registry schema and entries
- `wecoded-themes/themes/*/manifest.json` — sample theme manifests

Config stores:
- `youcoded/desktop/src/main/skill-config-store.ts` — how youcoded-skills.json is read/written, the atomic write pattern, cascade cleanup on uninstall
- `youcoded/app/src/main/kotlin/com/destin/code/skills/SkillConfigStore.kt` — Android equivalent

Android install routing:
- `youcoded/app/src/main/kotlin/com/destin/code/runtime/SessionService.kt` — lines 436-491, the current plugin install routing that splits on sourceMarketplace
- `youcoded/app/src/main/kotlin/com/destin/code/skills/LocalSkillProvider.kt` — the install() method that throws for plugins
- `youcoded/app/src/main/kotlin/com/destin/code/skills/PluginInstaller.kt` — fully implemented, just never called for YouCoded-sourced plugins

**Step 2: Implement Phase 1.** Five sub-tasks, each committed separately:

#### 1a. Improve sync.js

Rewrite the sync script to:
- Read both a local `marketplace.json` (YouCoded/community entries) and Anthropic's `marketplace.json` (fetched from GitHub)
- Diff against previous `skills/index.json` output to detect changes, additions, and removals
- For existing entries: compare metadata/SHA. If changed, bump patch version (1.0.0 → 1.0.1), update publishedAt
- For new entries: add at 1.0.0
- For removed upstream entries: keep the entry but add `"deprecated": true` and `"deprecatedAt"` timestamp (today sync silently deletes them)
- Preserve Anthropic's SHA for url/git-subdir entries (Phase 0b may have started this)
- For local entries: compute content hash of plugin directory when `--local` flag is passed
- Auto-stamp `sourceMarketplace: "anthropic"` on all upstream imports
- Output to `skills/index.json` instead of `index.json`
- Idempotent: a sync run with no upstream changes should produce identical output
- Add top-level `version` timestamp field to generated index
- Don't re-stamp `publishedAt` when nothing changed

#### 1b. Create marketplace.json for YouCoded entries

Move the 29 existing YouCoded entries from hand-edited `index.json` into a proper `marketplace.json` at the repo root, using Anthropic's catalog format. The 13 plugins get `source` fields pointing to their install locations. The 16 prompts stay as prompt-type entries. All get `sourceMarketplace: "youcoded"`.

#### 1c. Restructure the registry repo

- Create `skills/` directory, sync.js now outputs to `skills/index.json`
- Create `themes/` directory, move theme registry from `wecoded-themes/registry/theme-registry.json` to `themes/index.json`
- Update `curated-defaults.json` and `featured.json` to reference both sections
- Keep old `index.json` at root for now (can be removed later since no users depend on it)

#### 1d. Extend youcoded-skills.json with packages field

Update both desktop (`skill-config-store.ts`) and Android (`SkillConfigStore.kt`) to:
- Bump config version from 1 to 2
- Add `packages` field to the schema
- Write migration logic: on load, if version is 1, convert any `installed_plugins` entries to `packages` entries (each becomes a package with a single plugin component), set version to 2
- Keep existing favorites/chips/overrides/privateSkills fields unchanged
- Package schema: `{ version, source ("marketplace"|"user"), installedAt, removable (default true), components: [{ type, path }] }`

#### 1e. Consolidate Android plugin install into LocalSkillProvider

- Move the plugin install logic from `SessionService.kt:436-471` into `LocalSkillProvider.install()`
- Remove the `sourceMarketplace != "youcoded-core"` check so all plugin types route through PluginInstaller
- Include `/reload-plugins` write and cache invalidation inside LocalSkillProvider so they're always executed regardless of call site
- SessionService becomes a thin dispatcher: just calls `skillProvider.install(id)` for all install requests
- Same for uninstall: move logic from SessionService:473-491 into LocalSkillProvider

### Important rules

- Sync every repo before starting: `git fetch origin && git pull origin master`
- Use a worktree for the work
- Annotate code edits with brief inline comments explaining purpose
- Don't change any UI components — this phase is data layer only
- Commit each sub-task (1a through 1e) separately
- If Phase 0 changes are on a separate branch, base your work on master (Phase 0 changes are independent)
- Do NOT push — report what you did and what branch it's on
