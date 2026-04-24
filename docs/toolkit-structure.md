# youcoded-core Plugin

`youcoded-core/` is a Claude Code plugin that ships bundled with the YouCoded app. It's one of a handful of first-party plugins alongside `wecoded-themes-plugin` and `wecoded-marketplace-publisher` — not a separate "toolkit layer" or framework.

**Status:** Actively being deprecated. See `docs/superpowers/plans/2026-04-21-deprecate-youcoded-core.md`. Release N (in flight) absorbs `write-guard.sh` into the app natively and stops cloning `~/.claude/plugins/youcoded-core/` on new installs; release N+1 removes all `youcoded-core`-aware branches from the app; then the repo is archived. New features should land in the app or in a dedicated marketplace plugin, not here.

## Layout

A single plugin with one `plugin.json` at the repo root:

| Path | Purpose |
|------|---------|
| `youcoded-core/plugin.json` | Plugin manifest (currently v1.2.1) — what drives releases |
| `youcoded-core/hooks/` | Hook scripts + `hooks-manifest.json` (desired-state declaration) |
| `youcoded-core/skills/` | `setup-wizard/` and `remote-setup/` — first-launch helpers |
| `youcoded-core/commands/` | Slash commands (`/update`, `/health`, `/diagnose`) |
| `youcoded-core/bootstrap/` | `install.sh` used by historical manual-install path |
| `youcoded-core/scripts/` | `post-update.sh`, migrations, security sweep |
| `youcoded-core/specs/`, `youcoded-core/docs/` | Living docs for the plugin itself |

Phase 3 (commits `d54bbf9` / `0d5ca0a`) flattened the former three-layer decomposition (`core/`, `life/`, `productivity/`) into this single plugin. All other skills that used to live under the layers (journal, encyclopedia, task inbox, theme-builder, skill-creator, google services) moved to the marketplace as independent plugins. See `docs/decisions/002-three-layer-toolkit.md` (superseded) for the historical rationale.

## Skills

Skills are directories containing a `SKILL.md` file. YAML frontmatter `description` is how Claude discovers when to invoke them. Only two ship here:

- `setup-wizard/` — conversational first-run experience for Claude Pro/Max sign-in and environment bootstrap
- `remote-setup/` — pairing flow for remote-access clients

Marketplace-installed plugins expose their own skills under `~/.claude/plugins/marketplaces/youcoded/plugins/<id>/`.

## Hooks

Declared in `youcoded-core/hooks/hooks-manifest.json` — **desired-state format**. The desktop app's `HookReconciler` merges this into the user's `~/.claude/settings.json` on launch and after install/update. **Never edit hooks in settings.json directly — update the manifest.**

Current manifest declares 5 hooks across 3 types:
- **SessionStart:** `session-start.sh`
- **PreToolUse:** `write-guard.sh`, `worktree-guard.sh`, `tool-router.sh`
- **Notification:** `statusline.sh`

Sync hooks were removed when the desktop app became the single source of backup/sync (see `youcoded/desktop/src/main/sync-service.ts`). `session-start.sh` runs at the top of each Claude Code session for encyclopedia context injection and version migration, but no longer touches sync.

## Hook guards

- **`write-guard.sh`** — same-machine concurrency guard. Blocks writes to tracked files (memory, CLAUDE.md, settings.json, etc.) when another active Claude session last modified the file. Uses `.write-registry.json`. Being absorbed into the app as a native-bundled hook per the deprecation plan.
- **`worktree-guard.sh`** — single-branch policy. Blocks `git checkout`/`switch` in the plugin directory itself. Feature work must use `git worktree add`.

## Commands

Markdown files in `commands/` become slash commands:
- `/update` — reconciles hooks-manifest.json into settings.json and runs migrations
- `/health` — diagnostic summary
- `/diagnose` — deeper diagnostic output

Restore is handled by the desktop app's Restore Wizard UI (`youcoded/desktop/src/renderer/components/restore/RestoreWizard.tsx`), not a slash command.

## Important conventions

- `.sh` files MUST have execute bit set. On Windows: `git update-index --chmod=+x path/to/file.sh`.
- `config.json` is portable (synced across devices). `config.local.json` is machine-specific and rebuilt every session by `session-start.sh`.
- Release flow: bump `youcoded-core/plugin.json` `version` on master → `.github/workflows/auto-tag.yml` detects the change and creates a `vX.Y.Z` tag automatically.
