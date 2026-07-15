---
status: shipped
origin: wecoded-marketplace@eecc843:docs/phase-3-implementation-prompt.md
---

## Task: Unified Marketplace — Phase 3: Install/Update/Uninstall Lifecycle

### Context

We're unifying YouCoded's three separate content systems into a single marketplace. The full plan is at `wecoded-marketplace/docs/unified-marketplace-plan.md`. Read it before starting.

Phases 0-2 should already be completed. Phase 2 built the unified three-tab marketplace modal with MarketplaceContext. This phase completes the install/update/uninstall lifecycle so the marketplace is fully functional.

### What you need to do

**Step 1: Familiarize with the codebase.** Read these files:

Install pipeline:
- `youcoded/desktop/src/main/plugin-installer.ts` — current install strategies (local, url, git-subdir), conflict detection, plugin.json creation
- `youcoded/desktop/src/main/skill-provider.ts` — desktop install orchestration
- `youcoded/app/src/main/kotlin/com/destin/code/skills/PluginInstaller.kt` — Android install strategies
- `youcoded/app/src/main/kotlin/com/destin/code/skills/LocalSkillProvider.kt` — Android install orchestration (consolidated in Phase 1e)

Theme install:
- `youcoded/desktop/src/main/theme-marketplace-provider.ts` — theme download, validation, install, uninstall

Config stores (updated in Phase 1d):
- `youcoded/desktop/src/main/skill-config-store.ts` — now has `packages` field
- `youcoded/app/src/main/kotlin/com/destin/code/skills/SkillConfigStore.kt` — Android equivalent

MarketplaceContext (built in Phase 2a):
- Whatever file the MarketplaceContext was built in — this is where install/uninstall methods are called from

**Step 2: Implement Phase 3.** Three sub-tasks:

#### 3a. Update the install flow

Modify the install pipeline on both platforms:
- After installing a plugin or theme, record the install in youcoded-skills.json `packages` with version, source ("marketplace"), installedAt, and component paths
- For themes: the existing filesystem-based install stays, but now also writes a packages entry for version tracking
- Make the installer source-aware for `local` plugins: check `sourceMarketplace` (or a `sourceRepo` field) to decide which repo to clone to cache. Anthropic locals clone from `anthropics/claude-plugins-official`. YouCoded locals clone from `itsdestin/wecoded-marketplace`
- Handle partial install failure for bundles: if plugin installs but theme fails, record what succeeded and surface the error to the user
- Ensure /reload-plugins is sent on desktop after plugin install (Phase 0a may have done this already)
- Update MarketplaceContext's install method to call the appropriate IPC and refresh state

#### 3b. Build update flow

- On marketplace open (in MarketplaceContext), compare installed version in `packages` against version in the index for each installed package
- Surface "update available" in the Installed tab and on cards in browse tabs
- "Update" button re-downloads from source, overwrites plugin/theme files at the same paths
- Config is preserved — it lives in `~/.claude/youcoded-config/`, outside the install directories
- Update the version in `packages` after successful update
- For bundles: update all components
- Add IPC handlers on both desktop and Android

#### 3c. Build config form

- Define a `configSchema` format in marketplace entries: array of fields with name, type (string/boolean/number/select), label, default, required, and options (for select)
- In the detail view (SkillDetail/ThemeDetail), after a package is installed, render a settings form based on `configSchema`
- Write values to `~/.claude/youcoded-config/<id>.json`
- On update: validate existing config against new schema. If new required fields exist, prompt user to fill them in
- Add IPC handlers: `marketplace:get-config`, `marketplace:set-config` on both platforms
- Only render config form for packages that declare `configSchema` — Anthropic plugins using native config.json are left alone

### Important rules

- Sync every repo before starting: `git fetch origin && git pull origin master`
- Use a worktree for the work
- Annotate code edits with brief inline comments
- Test both the happy path and edge cases: install a prompt (no files), install a plugin (files), install when already installed, uninstall with cascade cleanup
- Commit each sub-task separately
- Do NOT push — report what you did and what branch it's on
