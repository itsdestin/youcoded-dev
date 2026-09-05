---
status: shipped
date: 2026-09-05
---
# Session workspace startup

## Approved scope

Implement step 1 from the session's proposal: one development workspace-start command, fetching without updating shared working files, creating session-owned worktrees from published defaults, reusing them on resume, and preserving unfinished work. Consolidate existing startup tooling where useful. No sandbox, application UI, write guard, automatic merge, or cleanup.

## Design

A Node CLI (`scripts/workspace-start.mjs`) takes `--session <stable-key>` and optional component repository names, with `--root` for an explicit shared workspace and `--json` for callers. It always provisions the workspace repository first, with selected component worktrees nested at their familiar paths. A deterministic branch/path plus a small manifest in Git's common directory records session ownership, so future calls can resume or add a component. A per-session exclusive lock prevents competing creates. Existing entries are verified against Git, never silently replaced. New worktrees start from freshly fetched origin defaults; resumed worktrees are neither pulled nor reset. A failed fetch stops new provisioning; existing session work remains available offline. No automatic branch/worktree deletion, copying shared source files, dependency installation, or Git pushes.

Move the component repository inventory out of setup.sh so both installation and session startup share it. Keep setup.sh as explicit installation/maintenance; replace its mandatory per-session invocation in the live startup guidance. Startup prints paths plus the instruction to read/edit/run scripts from the isolated workspace; it cannot retarget the native file-tool root or shell from a subprocess.

## Implementation tasks

- [x] Add disposable local-Git regression fixtures and failing tests for fresh start from remote rather than dirty local HEAD, independent sessions, resume preserving dirty files/commits, adding a component including main-vs-master, path/branch collision refusal, invalid keys, missing repositories, failure recovery, and CLI output.
- [x] Implement the CLI and shared repository inventory; adapt setup.sh without changing its explicit maintenance behavior. Run `node --test scripts/workspace-start.test.mjs`.
- [x] Replace routine setup/pull/copy-whole-file advice in CLAUDE.md, startup injection, and commit-guard guidance; add a short lazy reference and MAP row. Preserve unrelated upstream instructions.
- [x] Run relevant workspace tests, shell syntax checks, audit anchors, and inspect the complete diff. Review once for safety/collision mistakes. Keep the feature unmerged pending Destin's decision.

## Acceptance

Tests must prove shared source/index/HEAD/untracked contents remain unchanged; origin refs and new Git worktree metadata may change. No claim of write confinement: agents can still explicitly target shared paths. Instructions copied into an older worktree remain that branch's instructions until deliberately updated. Missing/deleted/foreign worktrees stop with accurate recovery guidance rather than resurrecting or overwriting work.
