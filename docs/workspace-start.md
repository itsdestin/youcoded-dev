# Isolated development sessions

Use `node scripts/workspace-start.mjs --session <stable-key> [component-repo…]` instead of
running setup/pull in the shared checkout before every task. The workspace worktree is always
created implicitly; pass names such as `youcoded`, never `youcoded-dev`. This is developer
tooling, not a requirement for ordinary chats or non-Git document work.

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

- Requires a tracked regular `scripts/workspace-repos.json` at the requested workspace root,
  with `workspace` configured for `master`, then resolves and validates the primary workspace
  through Git's worktree registry before creating directories, locks, fetching or changing refs.
- Fetches the workspace's published `origin/master` on every invocation with bounded waiting,
  then inventories incoming/local commits and staged, unstaged and nonignored untracked work.
- Creates `worktrees/sessions/<key>` for workspace docs and tooling, on `session/<key>`, from
  the immutable fetched commit. A fresh session stops if current workspace guidance could not
  be fetched, even if a cached remote ref exists.
- Nests selected component worktrees at their familiar names inside that workspace. A newly
  requested component is fetched and created from its configured default; a recorded component
  resumes on its own branch, untouched.
- Refreshes each requested component's **shared** checkout (`~/youcoded-dev/<name>`), on both
  creation and resume. The shared clone is fetched, and its checked-out branch is fast-forwarded
  only when it is on the configured branch, clean, free of an in-progress Git operation, and a
  strict ancestor of the fetched remote. Anything else — local commits, a dirty tree, a detached
  or foreign branch — is reported and left alone. This never touches session worktrees, which sit
  on their own branches.
- Uses `scripts/workspace-repos.json` for names/defaults, shared with `setup.sh`.
- Records each successful worktree in `<git-common-dir>/youcoded-sessions/<key>.json` and reuses
  it without pulling, resetting or changing its branch, index or files. Workspace reorientation
  still fetches on resume, but it only reports how the preserved session differs from fetched
  authority; it never integrates into the session branch. An existing session can therefore
  resume offline with freshness explicitly `unknown`. Adding a component still requires that
  component's fetch to succeed.

Read the complete reorientation report, changed guidance and instructions **from the returned
workspace** before proceeding. Published committed guidance is the current authority;
uncommitted guidance is separately labeled as a proposal and does not automatically override
it. The report supplies factual paths, commits and diffs—the agent remains responsible for
reading them and explaining their meaning rather than treating the briefing as a semantic
summary. Use absolute paths in Read/Edit/Write and give helpers those paths. A subprocess cannot
retarget the current conversation's file-tool root or change its parent shell's directory.
Existing manual worktrees remain valid; do not copy their entire files into a new session to
adopt this tool.

## Automatic and review-only actions

The shared `youcoded-dev` checkout is eligible for the full reorientation update described
below; resumed session worktrees are never touched. Shared **component** checkouts get the
narrower refresh above — a strict fast-forward or nothing, with no candidate, snapshot or
conflict machinery.

A component's shared checkout is not merely a cache. Its working tree is read as data (the
analytics skill reads built-in themes and `analytics-salt.ts` straight off it) and it is the
hardlink source for every new `node_modules`, so letting it sit stale silently serves old files.
On 2026-09-20 the shared `youcoded` clone was found 511 commits behind for exactly this reason. When shared `master` is behind fetched `origin/master`,
startup automatically fast-forwards only if preflight, private snapshot and final recheck prove
that the checkout is clean or that unrelated dirty contents, modes and staged/unstaged state
remain preserved. Repository hooks are disabled through a private hooks directory for workspace
and component fetches, recovery-ref creation, and worktree/fast-forward ref updates; user Git
configuration is not rewritten. It never stashes, cleans, resets, commits or pushes.

Overlaps, divergence or unique local commits, patch-equivalent commits, exact incoming copies,
wrong branches, active Git operations, ignored/untracked collisions, symlink/gitlink or other
unsupported types, component-root collisions, and state changed during preparation are
review-only. The shared checkout is left in place. Where supported, the report points to an
isolated standalone candidate; even a clean textual candidate requires semantic review and is
not applied. Conflicts stay in that private candidate. A failed Git update is reported with the
actual resulting state and is never automatically rolled back over possible concurrent edits.

### Dependencies

Configured npm projects (currently `youcoded/desktop`) use a reusable source under the component repository's common Git directory, `youcoded-dependencies/<fingerprint>/`. Startup does **not** copy the shared checkout's potentially stale `node_modules`.

The fingerprint uses the destination's `package.json`, exact lockfile, local `.npmrc`, scripts tree, Node/npm versions, ABI, OS/architecture/libc, install flags and relevant configuration/build-environment hashes. Credentials participate only as hashes, never readable completion metadata. Different branches/toolchains keep different generations. Local/file/workspace dependencies currently fail with an explicit unsupported-input error rather than being reused without a complete input snapshot.

A missing generation is installed once with `npm ci` in private staging, including development/platform-optional packages and approved install scripts. A per-fingerprint lock coordinates sessions; a bounded lock wait reports contention without deleting another owner's lock. Required package versions, command links and Electron runtime presence are checked. Completion metadata and a dependency-tree hash are written before publication. Failed or partial installs are not published and startup exits nonzero, retaining the worktree and its ownership manifest for retry.

Each session receives an independent copy-on-write/full copy, **not mutable hardlinks or a symlink to the source**. An exact source hit works without downloading packages again, including offline; an offline miss must install successfully from existing npm/download caches or fail. Matching managed resumes verify their contents. Changed inputs prepare another generation before replacing an unchanged managed installation. Unmanaged installs, older hardlink farms and locally patched dependencies are left untouched and reported: inspect and move them aside before retrying, never overwrite their contents in place.

The source cache is outside tracked files; no shared source files, staged edits, local commits or untracked files are cleaned up. Older worktrees can still have hardlinked dependencies and remain subject to `docs/PITFALLS.md` → Worktrees. Git's remote refs and worktree metadata do change.

## Reports, recovery and cleanup

Every invocation writes a unique run directory under `<git-common-dir>/youcoded-sync/` containing
a complete machine-readable `report.json`, a concise `report.md` briefing, complete diff evidence
and, when relevant, `snapshot/` and `candidate/`. The private parent and evidence directories are
owner-only mode 0700; report, diff, snapshot and candidate evidence files are mode 0600. The
intentional exceptions are the candidate's owner-executable `git-safe.mjs` wrapper and files
whose modes Git manages inside its standalone private repository. These private files are outside
the checkout and remain after success or refusal; there is no mutable “latest” link and cleanup
is deliberate. `report.guidance` directly lists every guidance path from shared/session incoming
and local commits plus working changes, with scope, rename origin where applicable, reversible
unusual-path encoding fields, and authority exactly `committed` or `uncommitted-proposal`.
General untracked inventory records metadata, not file contents. A
snapshot retains the original HEAD through `refs/youcoded-sync/<run-id>`, the raw index, patches,
and affected path bytes/types/modes. Its recovery instructions are for inspected, deliberate
recovery only—never an automatic rollback or permission to overwrite newer edits.

Two different cooperative locks have different scope:

- `<git-common-dir>/youcoded-sync.lock` coordinates workspace fetch/report/update between
  startup and `workspace-sync.sh`. It does not stop arbitrary editors. Contention reports
  `busy` with freshness `unknown`; inspect `owner.json` and whether that process is still active.
- `<git-common-dir>/youcoded-sessions/<key>.lock` prevents simultaneous provisioning for one
  session key. It does not lock that session's files after startup.

Neither stale-looking lock is automatically removed: diagnose ownership before deliberate
removal. Missing/foreign paths, changed branches, malformed manifests and branch collisions
stop rather than overwrite or silently adopt work. A failure after one repository succeeds
preserves and records it; retry the same key after fixing the reported problem. A crash between
Git creation and recording the entry can leave an unrecorded worktree: inspect it manually;
the next call refuses the collision.

Missing source repositories require explicit installation through `setup.sh`.
`workspace-sync.sh` is the maintenance compatibility entry point to the same preservation and
report policy used automatically by startup, not a second repair implementation.

Cleanup stays deliberate and follows the existing merged-branch rules. Remove nested component
worktrees before their containing workspace. Never force-remove unfinished work. The manifest
remains an ownership record; a cleaned-up session key is retired, not reused.

## Limits

This is isolation of working copies, **not a sandbox or write barrier**. Agents can still
explicitly write to shared paths, and Git worktrees share repository metadata. Native and
Claude Code sessions are not automatically relaunched here. OS restrictions, app integration,
write guards and a new merge command are separate work.

## Verification

`node --test scripts/workspace-sync.test.mjs scripts/workspace-start.test.mjs scripts/workspace-drift-guards.test.mjs .claude/hooks/context-inject.test.mjs`
uses disposable local bare remotes, not live project repositories or network services. It
exercises reports and permissions, safe/review-only actions, recovery/candidates, fresh and
offline starts, dirty shared state, resume, multiple sessions, components, locks, collisions
and failure paths. Harness evaluation was offered and declined by Destin; it is not part of
this verification.
