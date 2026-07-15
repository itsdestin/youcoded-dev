---
status: shipped
origin: wecoded-marketplace@eecc843:docs/phase-6-implementation-prompt.md
---

## Task: Unified Marketplace — Phase 6: Migration

### Context

We're unifying YouCoded's three separate content systems into a single marketplace. The full plan is at `wecoded-marketplace/docs/unified-marketplace-plan.md`. Read it before starting.

Phases 0-5 should already be completed. The unified marketplace is fully functional on both desktop and Android. This phase handles migrating users from the old system to the new one so that existing installs are recognized by the marketplace.

### Background: What needs migrating

Users may have content installed through three different old systems:

1. **Toolkit layers (Life/Productivity)** — installed via the setup wizard. These are symlinks in `~/.claude/plugins/` and `~/.claude/skills/` pointing into the youcoded-core git clone. The config at `~/.claude/toolkit-state/config.json` has an `installed_layers` array listing which layers are active.

2. **Marketplace plugins** — installed via the old skill marketplace. Tracked in `youcoded-skills.json` under the old `installed_plugins` field (version 1 format). Files live in `~/.claude/plugins/<id>/`.

3. **Community themes** — installed via the old theme marketplace. Files live in `~/.claude/wecoded-themes/<slug>/`. No central tracking — discovered by directory scan only.

The version 1 → 2 migration of `youcoded-skills.json` (converting `installed_plugins` to `packages`) was already built in Phase 1d. This phase handles the other two cases.

### What you need to do

**Step 1: Familiarize with the codebase.** Read these files:

Toolkit config:
- `youcoded-core/core/skills/setup-wizard/SKILL.md` — how layers are installed (symlink creation, config writing). Look at Phase 5 (lines ~1081-1299) for the symlink patterns.
- Check if `~/.claude/toolkit-state/config.json` exists and what `installed_layers` contains

Theme discovery:
- `youcoded/desktop/src/main/theme-watcher.ts` — how themes are discovered today (directory scan for manifest.json)
- `youcoded/desktop/src/main/theme-marketplace-provider.ts` — how community themes are identified (source field in manifest)

Config stores (updated in Phase 1d):
- `youcoded/desktop/src/main/skill-config-store.ts` — the `packages` field and migration logic
- `youcoded/app/src/main/kotlin/com/destin/code/skills/SkillConfigStore.kt` — Android equivalent

**Step 2: Implement Phase 6.** One main task with sub-parts:

#### 6a. Migrate existing installs

Build a one-time migration that runs on first app launch after the update. Add it to the config store's load/migration path (where the version 1 → 2 migration already runs).

**Toolkit layers:**
- Check for `~/.claude/toolkit-state/config.json` (or youcoded-core's `config.json`)
- Read `installed_layers` array
- For each layer (life, productivity): if the layer's symlinks exist in `~/.claude/plugins/` or `~/.claude/skills/`, create a packages entry:
  ```jsonc
  {
    "youcoded-core-life": {
      "version": "0.1.0",  // read from layer's plugin.json if accessible
      "source": "marketplace",
      "installedAt": "<migration timestamp>",
      "components": [
        { "type": "plugin", "path": "~/.claude/plugins/youcoded-core-life/" }
      ]
    }
  }
  ```
- Don't convert Core — it gets a static entry with `"removable": false` (may already be handled)

**Community themes:**
- Scan `~/.claude/wecoded-themes/` for directories with `manifest.json`
- For each theme not already tracked in `packages`:
  - Read the manifest to get version and source
  - Create a packages entry with `source: "marketplace"` for community themes, `source: "user"` for user-created themes
- Use the manifest's `source` field to distinguish: `"community"` → marketplace, `"user"` → user, `"youcoded-core"` → skip (built-in)

**Guard against re-running:**
- Set a flag in youcoded-skills.json (e.g., `"migrated": true`) after migration completes
- Skip migration if flag is already set
- The migration should be idempotent — running it twice produces the same result

**Platform parity:**
- Implement on both desktop (skill-config-store.ts) and Android (SkillConfigStore.kt)
- Same logic, same output format

### Important rules

- Sync every repo before starting: `git fetch origin && git pull origin master`
- Use a worktree for the work
- Annotate code edits with brief inline comments
- Migration must be non-destructive — it only ADDS packages entries, never deletes files or modifies existing installs
- Handle missing/corrupt files gracefully — if a manifest is unreadable or a symlink is broken, skip that item and log a warning
- Commit separately from any other changes
- Do NOT push — report what you did and what branch it's on
