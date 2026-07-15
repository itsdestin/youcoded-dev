---
status: shipped
origin: wecoded-marketplace@eecc843:docs/phase-4-implementation-prompt.md
---

## Task: Unified Marketplace — Phase 4: Publish and Community

### Context

We're unifying YouCoded's three separate content systems into a single marketplace. The full plan is at `wecoded-marketplace/docs/unified-marketplace-plan.md`. Read it before starting.

Phases 0-3 should already be completed. The marketplace is now a unified three-tab modal with full install/update/uninstall lifecycle and config forms. This phase adds the ability for users to publish their own skills and plugins to the community.

### What you need to do

**Step 1: Familiarize with the codebase.** Read these files:

Existing publish flow (themes — fully implemented):
- `youcoded/desktop/src/main/theme-marketplace-provider.ts` — lines 210-405. The complete fork → branch → upload → PR flow for themes. Uses `gh` CLI.
- Check the CI workflows in `wecoded-themes/.github/workflows/` — theme PR validation (token requirements, CSS safety, size limits, slug uniqueness) and auto-rebuild on merge

Skill provider:
- `youcoded/desktop/src/main/skill-provider.ts` — has a `publish()` method that throws "not yet implemented"

Marketplace repo structure (updated in Phase 1):
- `wecoded-marketplace/marketplace.json` — the YouCoded/community catalog
- `wecoded-marketplace/plugins/` — where bundled plugin source lives
- `wecoded-marketplace/scripts/sync.js` — needs to auto-add entries from merged PRs

**Step 2: Implement Phase 4.** Two sub-tasks:

#### 4a. Build skill publish flow

Mirror the theme publish pattern:
- Verify `gh` CLI is authenticated
- Fork `itsdestin/wecoded-marketplace` (idempotent)
- Create branch `plugin/<id>` on the fork
- Upload plugin directory contents to `plugins/<id>/` via GitHub Contents API
- Strip sensitive fields before upload
- Create PR with title `[Plugin] <name>` and auto-populated description
- Return PR URL to user
- Only allow publishing user-created items (`source: "user"` in packages)
- Add to the unified marketplace UI: "Publish" button appears in Installed tab for user-created items only
- Add IPC handler: `marketplace:publish` on desktop
- Android support: Android has `gh` available in Termux, so add the bridge message in SessionService.kt too

#### 4b. Add CI validation for skill PRs

Create a GitHub Actions workflow in the marketplace repo (`.github/workflows/validate-plugin-pr.yml`):
- Triggers on PRs that modify `plugins/**`
- Validates:
  - `plugins/<id>/.claude-plugin/plugin.json` exists with required fields (name, description)
  - No `.env` files, no files matching secret patterns (API keys, tokens)
  - Total size under reasonable limit (e.g., 50MB)
  - Plugin ID is unique — not already in `marketplace.json` or in Anthropic's imported entries
- On merge to master:
  - Auto-add entry to `marketplace.json` with `sourceMarketplace: "community"`, `sourceType: "local"`, `sourceRef` pointing to the plugins directory
  - Rebuild `skills/index.json` by running sync.js

### Important rules

- Sync every repo before starting: `git fetch origin && git pull origin master`
- Use a worktree for the work
- Annotate code edits with brief inline comments
- The publish flow should closely follow the existing theme publish pattern for consistency
- Make sure the PR template includes enough info for Destin to review (plugin name, description, what it does)
- Commit each sub-task separately
- Do NOT push — report what you did and what branch it's on
