# ADR 004: Hooks Declared in Manifest, Merged Into Settings.json

**Status:** Accepted
**Date:** Pre-2026

## Context

Claude Code reads hook configuration from `~/.claude/settings.json`. The toolkit ships with hooks users need, but users may also customize their settings.json for other tools or personal preferences. Direct writes to settings.json during toolkit updates would clobber user edits.

## Decision

Declare the plugin's hooks in `youcoded-core/hooks/hooks-manifest.json` in a **desired-state format**. The desktop app's `HookReconciler` performs an additive reconciliation into settings.json at launch and after install/update:

- New hooks from manifest → added to settings.json
- Missing properties (matcher, timeout) → added
- For timeouts, use `MAX(user_value, manifest_value)` (user can extend, not shorten)
- Existing third-party hooks in settings.json → untouched

## Alternatives Considered

- **Direct write to settings.json** — simplest, but destroys user customizations
- **Separate hooks config file** — would require Claude Code to read our config, which it doesn't
- **Hook registration via a CLI command** — adds complexity and another path for state drift

## Consequences

**Good:**
- Users can safely customize settings.json for third-party hooks
- Reconciliation is idempotent and non-destructive
- Timeout reconciliation respects user intent (they can only increase timeouts, not decrease)
- Single source of truth for the plugin's hooks (the manifest)

**Bad:**
- Reconciliation logic historically lived in `session-start.sh` / `post-update.sh`; it has since moved into the app's `HookReconciler` (desktop) and Kotlin `HookReconciler` (Android) for centralized control
- Users who want to temporarily disable a plugin hook can't — editing settings.json directly gets overwritten on next reconciliation

Related: `docs/superpowers/plans/2026-04-21-deprecate-youcoded-core.md` plans to absorb `write-guard.sh` into the app natively, which will further reduce what this manifest declares.
