# youcoded-core Plugin (stub)

`youcoded-core/` is a Claude Code plugin bundled with the YouCoded app (contributes hooks + two first-run setup skills: `setup-wizard`, `remote-setup`). It is **actively being deprecated** — `write-guard.sh` is moving into the app natively, new installs no longer clone `~/.claude/plugins/youcoded-core/`, and the repo will be archived after release N+1. New functionality belongs in the app or a dedicated marketplace plugin, not here.

The full layout / hooks / commands / conventions invariants now live in the path-scoped rule `.claude/rules/youcoded-toolkit.md` (injected automatically when you touch `youcoded-core/`). For the deprecation sequence and timeline see `docs/active/plans/2026-04-21-deprecate-youcoded-core.md`.

The former full text of this doc (three-layer decomposition history, per-skill/hook/command reference) is in git history.
