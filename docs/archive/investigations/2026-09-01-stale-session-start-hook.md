---
date: 2026-09-01
status: shipped
type: investigation
topic: Shared settings still register the deleted youcoded-core SessionStart hook
---

# Every new Claude Code session logs "No such file or directory"

**Symptom.** Each new Claude Code session opens with a hook error — the shell cannot find
`~/.claude/plugins/youcoded-core/hooks/session-start.sh`. Seen in the UI-review dev instance
(`docs/active/design/2026-08-25-ui-audit/images/live-terminal-view.jpg`).

**Reproduced on disk 2026-09-01.** Destin's `~/.claude/settings.json` still registers
`bash ~/.claude/plugins/youcoded-core/hooks/session-start.sh` (and `worktree-guard.sh` from
the same folder), and the folder is gone — `legacy-cleanup.ts` removed it, as the
deprecation plan says.

**Why the app does not clean it up.** `hook-reconciler.ts` has a prune pass for exactly this
(`pruneDeadPluginHooks`, `youcoded/desktop/src/main/hook-reconciler.ts` ~:138–170), but it
only prunes entries whose script lives under a *currently installed* plugin root
(`listInstalledPluginDirs()` in `claude-code-registry.ts` walks the directories that exist).
Once the clone is deleted, `~/.claude/plugins/youcoded-core/` is no longer a plugin root, so
its dead entries look like user-added hooks and are deliberately left alone.
<!-- claim: {"path": "youcoded/desktop/src/main/hook-reconciler.ts", "contains": "if \\(!ownedByPlugin\\) return true;"} -->

Android's `HookReconciler.kt` shares the design; verify it has the same gap.

**Fix shape.** Treat the legacy clone path as an owned root for prune purposes (or have
`legacy-cleanup.ts` strip the registrations it orphans), and let the bundled write-guard
registration replace it. See `docs/active/plans/2026-04-21-deprecate-youcoded-core.md`.

**History.** Added 2026-08-25. Re-checked 2026-09-01 against Destin's settings and today's
reconciler.
