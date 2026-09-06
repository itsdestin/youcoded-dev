# Isolated development sessions

Use `node scripts/workspace-start.mjs --session <stable-key> [repo…]` instead of running
setup/pull in the shared checkout before every task. This is developer tooling, not a
requirement for ordinary chats or non-Git document work.

```bash
node scripts/workspace-start.mjs --session 2026-09-05-example youcoded
# Resume, including previously added components:
node scripts/workspace-start.mjs --session 2026-09-05-example
# Add another component without disturbing existing work:
node scripts/workspace-start.mjs --session 2026-09-05-example wecoded-marketplace
```

The assistant runs these commands, not Destin. Pick a unique lowercase key once per
session/task (letters, digits, hyphens; maximum 64 characters); retain it in the handoff.
Keys are identifiers, not authentication: two callers using the same key request the same
work. Independent sessions must use different keys. `--json` returns paths, branches and
created/resumed status. `--root <path>` accepts the primary workspace or one of its linked
worktrees. Default root is the workspace containing the script, not the shell's cwd.

## What it does

- Resolves the primary workspace through Git's worktree registry.
- Creates `worktrees/sessions/<key>` for workspace docs and tooling, on `session/<key>`.
- Nests selected component worktrees at their familiar names inside that workspace.
- Uses `scripts/workspace-repos.json` for names/defaults, shared with `setup.sh`.
- Fetches each newly requested repository's default branch; starts from its fetched commit,
  never the shared checkout's potentially dirty/behind HEAD.
- Records each successful worktree in `<git-common-dir>/youcoded-sessions/<key>.json`.
- Reuses recorded worktrees without pulling, resetting, fetching or changing their files.
  Existing sessions can resume offline. Adding a new repository requires its fetch to succeed.

Read instructions and run scripts **from the returned workspace**. Use absolute paths in
Read/Edit/Write and give helpers those paths. A subprocess cannot retarget the current
conversation's file-tool root or change its parent shell's directory. Existing manual
worktrees remain valid; do not copy their entire files into a new session to adopt this tool.

No dependencies are installed or linked. Follow the existing dependency safety rules when
preparing a build. No shared source files, staged edits, local commits or untracked files
are cleaned up. Git's remote refs and worktree metadata do change.

## Recovery and cleanup

A startup lock prevents simultaneous provisioning for one key; it does not lock the files
against two writers after startup. A leftover lock is not automatically deleted: inspect
whether startup is still running before removing it. Missing/foreign paths, changed branches,
malformed manifests and branch collisions stop rather than overwrite or silently adopt work.
A failure after one repository succeeds preserves and records it; retry the same key after
fixing the reported problem. A crash between Git creation and recording the entry can leave
an unrecorded worktree: inspect it manually; the next call refuses the collision.

Missing source repositories require explicit installation through `setup.sh`. That script
and `workspace-sync.sh` remain **maintenance** tools, not routine session startup.

Cleanup stays deliberate and follows the existing merged-branch rules. Remove nested
component worktrees before their containing workspace. Never force-remove unfinished work.
The manifest remains an ownership record; a cleaned-up session key is retired, not reused.

## Limits

This is isolation of working copies, **not a sandbox or write barrier**. Agents can still
explicitly write to shared paths, and Git worktrees share repository metadata. Native and
Claude Code sessions are not automatically relaunched here. OS restrictions, app integration,
write guards and a new merge command are separate work.

## Verification

`node --test scripts/workspace-start.test.mjs` uses disposable local bare remotes, not live
project repositories or network services. It exercises fresh starts, dirty shared state,
resume, multiple sessions, components, collisions and failure paths.
