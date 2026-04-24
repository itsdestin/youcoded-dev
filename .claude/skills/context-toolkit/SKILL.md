---
name: context-toolkit
description: Load deep context for the youcoded-core bundled plugin — plugin structure, hooks, setup skills. Invoke before making non-trivial changes to youcoded-core/ code, especially hooks. Note this plugin is being deprecated; new work usually belongs in the app or a marketplace plugin.
---

# youcoded-core Plugin Context

You are working on `youcoded-core`, a bundled Claude Code plugin shipped with the YouCoded app. It is **being deprecated** — see `docs/superpowers/plans/2026-04-21-deprecate-youcoded-core.md`. `write-guard.sh` is moving into the app natively and the repo will eventually be archived.

Before making changes, orient with:

- `docs/toolkit-structure.md` — current flat plugin layout
- `youcoded-core/docs/system-architecture.md` — architecture reference (may be partially stale post-flatten; cross-check with current layout)
- `docs/superpowers/plans/2026-04-21-deprecate-youcoded-core.md` — the deprecation plan (absorb write-guard into the app, remove the clone path, archive the repo)

## Hard rules

1. **Never edit `~/.claude/settings.json` hooks directly.** Update `youcoded-core/hooks/hooks-manifest.json`. The desktop app's `HookReconciler` merges the manifest into settings.json on launch and after install/update, with additive reconciliation and `MAX(user, manifest)` timeouts.

2. **`.sh` files MUST have execute bit set.** On Windows Git: `git update-index --chmod=+x path/to/file.sh`. The #1 cause of "hook does nothing."

3. **`config.json` is portable, `config.local.json` is machine-specific.** Never commit or sync `config.local.json`. `session-start.sh` rebuilds it every session.

4. **Feature work uses `git worktree add`** in the plugin dir. `worktree-guard.sh` blocks branch switches there.

5. **Bump `plugin.json` version** to trigger a release. `.github/workflows/auto-tag.yml` detects the change vs HEAD~1 and creates a `vX.Y.Z` tag.

6. **Prefer fixing bugs over adding features.** If a new capability is needed, evaluate whether it belongs in the app (always-on, cross-platform) or in a dedicated marketplace plugin (opt-in, community-visible) instead of extending `youcoded-core`.

## Structure

Single plugin. One `plugin.json` at the repo root (currently v1.2.1). No `core/`, `life/`, or `productivity/` subdirectories — Phase 3 flattened the former three-layer decomposition.

In-plugin skills (only these two remain):
- `skills/setup-wizard/` — conversational first-run experience
- `skills/remote-setup/` — remote-access pairing flow

Everything else (journal, encyclopedia, inbox, theme-builder, skill-creator, google services) migrated to independent marketplace plugins.

## Skill conventions

- Directories with `SKILL.md` + YAML frontmatter (`name`, `description`)
- Description is how Claude discovers the skill — always in context. Be specific.

## Hook lifecycle

5 hooks declared across 3 types in `hooks-manifest.json`:
- **SessionStart:** `session-start.sh` — runs at the top of each Claude Code session for encyclopedia context injection and version migration
- **PreToolUse:** `write-guard.sh` (same-machine concurrency, being absorbed into the app natively), `worktree-guard.sh` (enforces single-branch policy in the plugin dir), `tool-router.sh`
- **Notification:** `statusline.sh`
