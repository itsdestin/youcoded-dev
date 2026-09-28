---
paths:
  # WHY **/ (2026-09-23): a plain "youcoded-core/**" only matches at the workspace
  # root, never inside a session worktree — same bug as registries.md. See
  # .claude/rules/README.md.
  - "**/youcoded-core/**"
last_verified: 2026-09-27
verify:
  - path: youcoded-core/plugin.json
  - path: youcoded-core/hooks/hooks-manifest.json
  - path: youcoded-core/hooks/write-guard.sh
  - path: youcoded-core/hooks/worktree-guard.sh
---

# Archived youcoded-core — read-only historical reference

**The GitHub repository was archived 2026-09-20.** Do not edit, version, tag, release, or push this repository. Its clone is retained for historical inspection and for older v1.2.4 installations; it is not a release target. A release or hook fix belongs in the app's bundled copies (`youcoded/desktop/hook-scripts/` and `youcoded/app/src/main/assets/`), which the app's tests pin to each other. Never change the running app's installed hooks or `~/.claude/settings.json` as a workaround.

Why this rule is still path-scoped here: opening archived files for reference should not turn an old instruction into authorization to write them. See `docs/active/plans/2026-04-21-deprecate-youcoded-core.md` for remaining app-side retirement and `youcoded-admin/skills/release/SKILL.md` for the current app-only release.
