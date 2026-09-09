---
status: shipped
---
# Workspace startup: reorientation and preservation-safe sync

## Approved direction

Startup must expose incoming guidance/tooling and all relevant local workspace changes, even when the shared checkout cannot safely sync. Automatically apply only preservation-safe updates; prepare overlapping resolutions outside the shared checkout for agent review. Never auto-commit or push. Keep the build small: one Node sync/report module shared by workspace-start and the existing workspace-sync shell entry point, existing session manifests, and disposable-repository tests. No service, model call, dashboard, or general-purpose reconciliation framework.

## Scope and authority

Only youcoded-dev gets synchronization and reorientation. Component repository fetch, worktree, resume, and dependency provisioning behavior stays unchanged. A resumed workspace branch, index, and files are never integrated or rewritten automatically. Fetch workspace origin/master on every invocation, with bounded network waiting. Offline resume succeeds with freshness explicitly unknown; new workspaces still require successful fetch.

Remote means fetched published commits, not another machine's uncommitted files. Inspect the shared workspace and current session workspace, not every session worktree. Exclude ignored files from general inventory, but protect ignored paths against incoming overwrite. Committed upstream guidance and uncommitted local proposals must be separately labeled; local proposals do not automatically override current instructions.

## Reorientation output

Before any shared mutation, collect the original shared HEAD, fetched remote commit, local-only and incoming commit lists, changed paths, and separate staged/unstaged/untracked inventories. Classify local patch equivalents without treating equivalence as deletion permission. On resume also compare the preserved session HEAD and local changes with fetched remote.

Produce a concise terminal briefing and a complete private report under the Git common directory, with an absolute path returned in human and JSON output. Include full inventories, commit IDs/subjects, accessible committed/staged/unstaged diffs, untracked path/type/size metadata, freshness, action taken, blockers, and recovery/candidate locations. Do not dump untracked contents into the conversation or imply binary contents were summarized. Large reports remain on disk rather than silently truncating the inventory. Report files and snapshots use owner-only permissions and are not committed.

Prioritize changed instructions, rules, hooks, scripts and subsystem documentation in the briefing. The script provides factual path/commit summaries, not invented semantic descriptions. It instructs the agent to read the complete report, inspect relevant diffs, explain major changes, and reread authoritative guidance from the returned workspace. On resume explicitly identify guidance newer than that branch and require inspection without silently integrating it. Reorientation mitigates previously loaded stale context; it cannot erase it.

## Automatic actions

- Clean shared master behind remote: guarded fast-forward.
- Unrelated dirty paths: fast-forward only when contents, file modes, and staged/unstaged state can be preserved. No stash/pop cycle.
- Local changes exactly matching the incoming version: reconcile only if recoverably captured and preservation checks pass; otherwise prepare for review.
- Overlapping changes: prepare a three-way candidate outside the shared checkout. Clean textual merges are candidates, not semantic approval. Conflicts stay outside shared files.
- Unique local commits, divergent history, intentional-looking historical matches, unsupported file types, active Git operations, wrong branch, and uncertain state: preserve and report. Where feasible, prepare an isolated candidate; otherwise explain the blocker and provide exact references/diffs for agent resolution.

An old file version existing somewhere upstream is not proof a local edit is residue. Patch-equivalent local commits do not authorize resetting shared history. Never reset --hard, clean, auto-commit, push, or replace a resumed branch.

## Preservation and concurrency

Use one workspace-wide lock shared by startup and explicit maintenance; retain existing per-session ownership checks. Do not automatically remove stale locks. Before a shared update, retain original HEAD and affected index/worktree state in recoverable private storage; include affected untracked files if any would be touched. Keep backups after successful operations and report their location; cleanup is deliberate.

Preflight incoming path collisions, including ignored paths, symlinks, directories, and component roots. Recheck captured state before applying. Abort on observed changes. A cooperative lock is not exclusive access against arbitrary editors: complicated replacement of dirty paths must remain isolated when exclusivity cannot be established. Do not promise transactional protection against arbitrary concurrent filesystem writers. Never automatically roll back over newly observed edits after a failure; preserve recovery evidence and report exact resulting state.

Sync refusal does not block provisioning a fresh session from a successfully fetched commit. Reports must remain available on blocked reconciliation; provisioning errors must not be mislabeled success. Lock contention must be explicit, never reported as fresh. No live-app configuration or runtime interaction.

## Integration

workspace-start orchestrates validated session provisioning and calls the shared module. workspace-sync.sh becomes a compatibility entry point to the same policy, avoiding two competing recovery implementations. Preserve its positional root/branch interface or explicitly reject unsupported branches before mutation. context-inject remains read-only and directs agents to the startup report; it must not claim it fetched current state. Update workspace-start.md, relevant workspace-workflows sections, CLAUDE.md and MAP.md with the precise automation boundary and report-reading requirement.

## Verification

Use disposable local bare remotes only, never the real shared checkout as a mutation test target. Test incoming/local commit and dirty inventories; large reports and unusual filenames; instruction prioritization and authority labeling; offline resume/new-session failure; clean/unrelated-edit fast-forwards; staging preservation; exact-current versus historical matches; unique and patch-equivalent local commits; overlapping clean/conflicting candidates; ignored/untracked/directory/symlink collisions; binary/deleted/renamed files; locks, changed-during-preparation state and failures; wrong branch/active Git operation; resumed branch preservation; unchanged component behavior and dependency provisioning; human/JSON report paths and blocked-sync reporting.

Run all four targeted suites (`workspace-sync`, `workspace-start`, `workspace-drift-guards`, and `context-inject`), shell syntax checks, and the anchor audit; distinguish unrelated missing-component anchor failures from failures in this work. Obtain a fresh read-only code review. Harness evaluation was offered and declined by Destin; do not run it for this work. No commit, push or merge without explicit user instruction.

## Acceptance

Every startup either reports fetched freshness or explicitly states why it is unknown. Its report accounts for incoming commits, local commits and all nonignored local changes in the defined scope. Clearly safe updates occur automatically; ambiguous resolutions have isolated evidence/candidates and actionable next steps. No local work is discarded as presumed residue, no session branch is rewritten, and no workspace changes are automatically published.
