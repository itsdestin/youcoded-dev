---
paths:
  - "youcoded-core/**"
last_verified: 2026-04-23
---

# youcoded-core Plugin Rules

You are editing the `youcoded-core` Claude Code plugin. Read `docs/toolkit-structure.md` for full context.

## Status

**Being deprecated.** `docs/superpowers/plans/2026-04-21-deprecate-youcoded-core.md` is the active deprecation plan — `write-guard.sh` is moving into the app natively, and the repo will eventually be archived. Prefer fixing bugs over adding features here. New functionality belongs in the app or in a separate marketplace plugin.

## Structure

Single plugin with one manifest at the root: `youcoded-core/plugin.json` (currently v1.2.1). Phase 3 flattened the former three-layer decomposition — there is no `core/`, `life/`, or `productivity/` subdirectory.

Top-level directories:
- `hooks/` — `hooks-manifest.json` + hook shell scripts
- `skills/` — only `setup-wizard/` and `remote-setup/` remain in-plugin
- `commands/` — `/update`, `/health`, `/diagnose`
- `bootstrap/` — historical manual-install script
- `scripts/` — post-update, migrations, security sweep

Other skills (journal, encyclopedia, task inbox, theme-builder, skill-creator, google services) moved out during Phase 3 and now ship as independent marketplace plugins.

## Hard rules

- **Never edit hooks in `~/.claude/settings.json` directly.** Update `youcoded-core/hooks/hooks-manifest.json` — the desktop app's `HookReconciler` merges it in on launch. Direct edits get overwritten.
- **`.sh` files MUST have execute bit set.** Git on Windows doesn't set this automatically. After creating or renaming a script: `git update-index --chmod=+x path/to/file.sh`. Missing execute bit is the #1 cause of "hook does nothing" bugs.
- **`config.json` is portable; `config.local.json` is machine-specific.** `config.local.json` is rebuilt every session by `session-start.sh` — don't commit or sync it.
- **Feature work uses `git worktree add`**, not branch creation in the main plugin dir. `worktree-guard.sh` blocks branch switches here.

## Skills

Directories with `SKILL.md` files. YAML frontmatter `description` is how Claude discovers them. Be specific and concrete in descriptions — they're always in context.

Currently in-plugin:
- `skills/setup-wizard/` — conversational first-run helper
- `skills/remote-setup/` — remote-access pairing flow

## Hooks

Declared in `youcoded-core/hooks/hooks-manifest.json`. Five hooks across three types. Guards to know about:
- `write-guard.sh` — PreToolUse, blocks writes when another session recently modified the file (being absorbed into the app natively per the deprecation plan)
- `worktree-guard.sh` — PreToolUse for Bash, blocks branch switches in the plugin dir
- `session-start.sh` — runs at session start, injects encyclopedia context, runs version migrations

## Version bumping

Bump `plugin.json` `version` on master. `.github/workflows/auto-tag.yml` detects the change vs `HEAD~1` and creates a `vX.Y.Z` tag automatically.
