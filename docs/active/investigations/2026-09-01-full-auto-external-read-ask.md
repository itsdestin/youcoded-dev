---
date: 2026-09-01
status: active
type: investigation
topic: Full Auto still asks before READING a file outside the project, and WebSearch/WebFetch can trip the file-permission card
---

# Full Auto asks before reading outside the project; a web search can raise the file card

**Symptom.** In Full Auto the assistant is supposed to run without interruption. It still
stops with a permission card when it merely *reads* a file outside the project folder, and
a web search or fetch can raise the same *file* card even though no file is involved.

**Mechanism.** `harness-session.ts` decides whether a tool call's subject is a *path* that
must sit inside the session cwd. Every tool not in `NON_PATH_SUBJECT_TOOLS` is treated as
path-subject and gets the external-directory check; the set is still `Bash`, `Skill`, `Task`
only, so `WebSearch`/`WebFetch` (whose subject is a query/URL) are path-guarded, and
`Read`/`Glob`/`Grep` outside the cwd raise the external ask regardless of mode.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/harness-session.ts", "contains": "const NON_PATH_SUBJECT_TOOLS = new Set\\(\\['Bash', 'Skill', 'Task'\\]\\)"} -->

The ratified design (spec `docs/active/specs/2026-08-18-full-auto-external-directory-permissions-design.md`,
plan `docs/active/plans/2026-08-21-full-auto-external-read-bypass.md`, final review
2026-08-23) lifts the external ask for the three read-only tools inside `full-auto` only
(`isWalkAwayRead`), and takes the web tools out of the path-subject set. Writes and Bash
outside the project still ask. Distinct from the native bypass-mode feature
(`2026-09-01-native-no-bypass-mode.md`), which is a fourth mode, not a narrowing of this one.

**State 2026-09-01.** Unbuilt — `rg isWalkAwayRead desktop/src` → nothing; plan 0/37 steps.
The `worktrees/full-auto-reads` worktree and `feat/full-auto-read-bypass` branch noted on
2026-08-26 no longer exist (`git worktree list` / `git branch -a` show neither). Blocker
unchanged: plan Task 2 is a human gate — Destin approves the surviving approval-card copy in
the workbench before merge, and that session has not been held. Tasks 3–4 (code) can start
in parallel.

History: filed 2026-08-26 (backfilled; design ratified 2026-08-21).
