---
status: shipped
created: 2026-09-20
scope: context gathered, decision taken, implemented and shipped 2026-09-20 (youcoded-dev#165, youcoded-admin#11)
---

# Shared component checkout sync — context for a future decision

## Purpose of this document

This document records the reported confusion, verified repository state, current workspace behavior, relevant files, and possible directions for discussion.

It is **not** an implementation plan, recommendation, or instruction to change the workspace. A future session should review this context with Destin before deciding whether anything should change.

## Reported issue

Destin expected the YouCoded workspace to keep itself synchronized. During an analytics merge, the long-lived app checkout at `~/youcoded-dev/youcoded` was reported as having:

- one local-only commit; and
- initially 507, later 511, commits present on GitHub but not in that local branch's ancestry.

This was described as the shared checkout being “divergent.” That wording caused understandable concern that the workspace had failed to update the app for hundreds of commits or that current development had been based on stale code.

The practical state was narrower:

- New task worktrees were still created from freshly fetched GitHub `master`.
- The long-lived shared app checkout's local `master` pointer was stale.
- Its one local-only commit contained an announcement change already present on GitHub under a different commit ID.

## Terminology and repository layout

The workspace contains several independent Git repositories:

| Path | Repository | Current role |
|---|---|---|
| `~/youcoded-dev` | `itsdestin/youcoded-dev` | Workspace guidance, scripts, plans, roadmap |
| `~/youcoded-dev/youcoded` | `itsdestin/youcoded` | Long-lived shared app checkout; Git/worktree source and dependency source |
| `~/youcoded-dev/wecoded-marketplace` | `itsdestin/wecoded-marketplace` | Long-lived shared marketplace/Worker checkout |
| `~/youcoded-dev/worktrees/sessions/<key>/` | workspace session branch | Isolated workspace documents/tooling for one task |
| `~/youcoded-dev/worktrees/sessions/<key>/youcoded` | app session branch | Isolated app checkout for one task |

Three states are easy to conflate:

1. **Remote authority** — GitHub's current `origin/master`.
2. **Session base** — the fetched commit used to create a new isolated task worktree.
3. **Shared checkout branch** — the branch currently checked out at a long-lived path such as `~/youcoded-dev/youcoded`.

A session can be based on current GitHub code while the long-lived shared checkout's checked-out `master` remains stale.

## Current `workspace-start` behavior

Entry point:

- `scripts/workspace-start.mjs`

Shared workspace synchronization and reporting:

- `scripts/workspace-sync.mjs`
- `scripts/workspace-sync.sh`
- `docs/workspace-start.md`
- `docs/workspace-workflows.md` → Git, worktrees, and shipping
- `scripts/workspace-start.test.mjs`
- `scripts/workspace-sync.test.mjs`
- `scripts/workspace-drift-guards.test.mjs`

Relevant behavior verified from the current code and documentation:

### Top-level workspace repository (`youcoded-dev`)

`workspace-start` fetches `youcoded-dev/origin/master` on every invocation. It may fast-forward the long-lived shared `youcoded-dev/master` after preservation checks.

The fast-forward preflight in `scripts/workspace-sync.mjs` refuses automatic application when the shared local HEAD is not an ancestor of fetched `origin/master`:

- `preflight(...)` around lines 441–491
- ancestor gate around line 444
- guarded `git merge --ff-only` around lines 994–1008

It does not automatically reset, rebase, drop local commits, or decide that a patch-equivalent commit is disposable.

### Component repositories (`youcoded`, marketplace, themes, and others)

For a newly requested component, `workspace-start`:

1. fetches that component's configured remote branch;
2. resolves the fetched remote commit; and
3. creates the new session worktree directly from that commit.

Relevant code:

- `scripts/workspace-start.mjs` around lines 369–385

However, it does **not** move the checked-out branch in the long-lived shared component checkout. The behavior is stated explicitly in `docs/workspace-start.md`:

- lines 33–35: newly requested components are fetched and created from their configured default;
- lines 56–67: only the shared `youcoded-dev` checkout is eligible for automatic reorientation updates; component checkouts are not.

A recorded/resumed component worktree is also preserved without pulling or resetting it.

### Dependency relationship

A new app worktree receives a hardlinked `desktop/node_modules` copy from the shared app checkout, followed by targeted dependency top-up. The shared component checkout therefore still acts as a local dependency/cache source even when its checked-out branch is not the session's source commit.

Relevant paths:

- `scripts/workspace-start.mjs` → `provisionNodeModules`, `fillMissingPackages`
- `docs/PITFALLS.md` → Worktrees

## Verified announcement timeline

The divergence originated in the announcement flow on 2026-09-14.

### Local shared-checkout commit

The long-lived shared app checkout committed directly on local `master`:

```text
d87b3657ec26644973da44d72a325a94dd37fdbc
chore: set announcement — update to 1.3.0
```

It changed only `announcements.txt`:

```diff
-2026-05-22: Local Models Coming Soon :)
+2026-09-17: If using version 1.2.4, please download version 1.3.0 from youcoded.ai. This will also enable in-app updates.
```

### Published commit

Seven minutes later, the same patch was cherry-picked onto a branch based on newer remote code and pushed as:

```text
1e839c70292290825f55c1c7e6173f0dd52da0a4
chore: set announcement — update to 1.3.0
```

Verified facts:

- `d87b3657` and `1e839c70` have the same stable Git patch ID: `76f63996ee3307fbdd24d518992d86c34149fff0`.
- GitHub `master` contains `1e839c70` and the intended current announcement.
- Local shared `master` contains `d87b3657`, not `1e839c70`.
- The two commits have different parents, so they are distinct commits despite applying the same file change.
- `git cherry origin/master master` marks local `d87b3657` with `-`, meaning Git recognizes an equivalent patch upstream.

### Why the shared branch stopped fast-forwarding

Before the local announcement commit, shared local `master` and remote history could be fast-forwarded normally. Once `d87b3657` was committed locally while the equivalent remote change lived under another commit ID, the histories had this shape:

```text
                    d87b3657  (shared local master)
                   /
common older commit
                   \
                    newer remote history — 1e839c70 — hundreds of later commits
```

A strict fast-forward cannot move from `d87b3657` to remote `master`, because `d87b3657` is not an ancestor of remote `master`.

The remote count then accumulated as normal development continued. At the time of investigation on 2026-09-20, `git rev-list --left-right --count master...origin/master` returned:

```text
1  511
```

This means one commit unique to local ancestry and 511 commits unique to remote ancestry. It does not mean isolated task worktrees omitted those 511 commits.

## Announcement tooling involved

Current owner-only announcement skill:

- `youcoded-admin/skills/announce/SKILL.md`

The skill currently names the long-lived shared checkout directly:

```text
$HOME/youcoded-dev/youcoded
```

Its create and clear recipes edit `announcements.txt`, commit on shared `master`, and push `origin master` directly. Relevant sections:

- Repo details around lines 10–16
- Create flow around lines 51–98
- Clear flow around lines 104–136

This workflow predates or bypasses the current general rule that development edits occur in isolated worktrees.

The recorded announcement session also has an isolated worktree manifest:

- `~/youcoded-dev/.git/youcoded-sessions/announce-20260914.json`

That session's app worktree was based on current remote commit `5f29a9d0...`, and the announcement patch was cherry-picked there as `1e839c70`. The original direct shared-checkout commit remained behind afterward.

## What currently works as designed

- New component worktrees fetch current remote code before creation.
- The analytics work in the reporting session started from current fetched app code, not from stale shared local `master`.
- Existing session worktrees are preserved rather than silently updated.
- Automatic synchronization refuses to discard or rewrite local commits.
- The announcement's intended content is published on GitHub.
- The shared local-only commit is patch-equivalent to a published commit; it is not unpublished product functionality.

## Sources of confusion or risk

### “Workspace sync” has narrower scope than its name suggests

The top-level workspace checkout may be updated automatically. Shared component checkouts are fetched for worktree creation but their checked-out branches are not reconciled.

### Status counts omit practical impact

“1 local-only, 511 incoming” accurately describes Git ancestry but does not say:

- new sessions start from current remote code;
- the one local commit is patch-equivalent upstream; or
- the stale checkout mainly serves as a Git/dependency source.

### Older admin tooling writes to a shared checkout

The announcement skill's direct shared-master workflow can create the exact divergence the broader workspace model is designed to avoid.

### Shared component paths remain easy to mistake for current source

Humans and tools can read `~/youcoded-dev/youcoded` directly. Unless they fetch and inspect refs or start a session worktree, they may answer questions from stale checked-out files.

### Patch equivalence is evidence, not an automatic disposition decision

In this case the local commit is safely recognizable as duplicated upstream. General automatic removal of patch-equivalent commits still requires a policy decision because commit metadata, ordering, merge context, or side effects may matter in other cases.

## Possible directions for future discussion

These are alternatives for review, not decisions or instructions.

### A. Improve reporting without changing reconciliation behavior

Possible elements:

- Report remote authority, new-session base, and shared component branch as separate states.
- For shared component divergence, report patch-equivalence results for local-only commits.
- Explain practical impact, for example: “new sessions start current; the shared cache branch is stale.”
- Elevate unique unpublished local commits differently from patch-equivalent local commits.

Potential advantages:

- Small behavioral change.
- Preserves the current conservative safety boundary.
- Reduces misleading “hundreds behind” interpretations.

Potential limitations:

- Shared component branches can remain stale indefinitely.
- Tools that read shared paths can still see old code.

### B. Add explicit shared-component reconciliation

Possible elements:

- Inspect each long-lived component checkout after fetch.
- Fast-forward a clean component branch when it is a direct ancestor of remote.
- For patch-equivalent-only divergence, create a recovery ref/snapshot and offer or perform a defined reconciliation action under an explicit policy.
- Refuse reconciliation when any local commit is unique, patch equivalence is unknown, the worktree is dirty, or another Git operation is active.
- Report every component action independently.

Potential advantages:

- Shared component branches remain current more often.
- Patch-equivalent residue such as `d87b3657` can be resolved systematically.

Potential limitations or decisions needed:

- Whether patch-equivalent commits may ever be removed automatically.
- Whether reconciliation belongs in every `workspace-start`, an explicit maintenance command, or close-out.
- Recovery retention and user-visible approval policy.
- Interaction with long-lived component worktrees and dependency hardlinks.

### C. Stop treating shared component checkouts as editable branches

Possible elements:

- Require every modifying tool, including announcements, to use an isolated temporary/session worktree.
- Treat long-lived component checkouts as Git object/dependency sources only.
- Consider detached, mirror, or bare-repository structures if compatible with dependency provisioning and existing tooling.
- Guard or refuse commits from shared component checkouts.

Potential advantages:

- Prevents this divergence class structurally.
- Makes the session worktree the consistent source for edits and commits.

Potential limitations or decisions needed:

- Migration of scripts with hardcoded shared paths.
- Dependency-cache design if long-lived working trees are removed or detached.
- Maintenance and recovery ergonomics for non-development admin operations.

### D. Narrow fix for announcement tooling only

Possible elements:

- Change the announcement skill to create/use an isolated current worktree, publish from it, and clean it up after verified push.
- Leave general component reconciliation unchanged.

Potential advantages:

- Addresses the verified trigger with limited scope.
- Lower risk than changing all component synchronization.

Potential limitations:

- Other old tools could still edit shared component checkouts.
- Existing stale/divergent component branches still require separate handling.

## Questions for a future decision

- Should a shared component checkout be expected to have a current checked-out `master`, or is it only a cache/source whose branch freshness is informational?
- Is patch equivalence sufficient authority to reconcile automatically, or should it only produce a proposed action?
- Should reconciliation happen on session startup, explicit maintenance, session close-out, or some combination?
- Should commits from shared component checkouts be mechanically refused?
- Does announcement publishing need the same branch/PR controls as product code, or a smaller purpose-built current-worktree flow?
- What recovery evidence and retention are required before moving a divergent shared branch?
- How should status be worded so “remote commits not in this shared branch” is not confused with “the current task is using stale code”?

## Current unresolved local state

As of the investigation:

- Shared app checkout: `~/youcoded-dev/youcoded`
- Checked-out branch: `master`
- Local-only commit: `d87b3657`
- Published equivalent commit: `1e839c70`
- Current remote app master observed during investigation: `ad9274ff` (this naturally changes as work merges)
- Working tree: clean at the time of the Git status check
- No reconciliation was performed as part of this investigation.

Any future session should re-check current refs and worktree state before drawing conclusions from these recorded commit counts.

## Decision taken — 2026-09-20

Destin chose option **C, kept as a working tree**, staged, with the safe parts of A and D
folded in and B's risky half explicitly rejected. The framing that settled it: a shared
component checkout should be **a current, read-only mirror of `origin/master`** — never a
branch anyone commits on. Nothing local is ever written there, so no conflict-resolution
policy is needed and the question "may patch-equivalent commits be removed automatically?"
never has to be answered.

Answering this document's open questions:

- *Should a shared component checkout have a current `master`?* **Yes.** It is not only a
  cache: analytics reads built-in themes and `analytics-salt.ts` off its working tree, and it
  is the `node_modules` hardlink source. A stale tree silently serves old files.
- *Is patch equivalence authority to reconcile automatically?* **No.** `d87b3657` was
  reconciled once, by hand, on verified evidence. Automation only ever fast-forwards a
  strict ancestor; divergence is reported and left alone.
- *Where does reconciliation happen?* **Both** `workspace-start` (per requested component)
  and `setup.sh` (all components), because each is an entry point that can leave a tree stale.
- *Should commits from shared component checkouts be mechanically refused?* **Yes**, with a
  named override for skills that commit and push in the same breath.
- *Does announcement publishing need branch/PR controls?* **No** — it needs a current
  worktree, which is what it now gets.

### What shipped

1. **Reconciled** the shared app checkout. `d87b3657` was verified duplicate three ways
   (identical patch-id to `1e839c70`, identical `announcements.txt` content, present on no
   other ref), preserved at `refs/recovery/shared-master-pre-reconcile-20260920`, then
   `master` was reset to `origin/master`.
2. **announce** publishes from a throwaway detached worktree
   (`youcoded-admin/skills/announce/scripts/publish-announcement.sh`); its read paths use
   `FETCH_HEAD` rather than the possibly-stale tree.
3. **release** keeps its commit-and-push-together shape but gains `--ff-only` preflight
   pulls, the `YOUCODED_ALLOW_MAIN_COMMIT=1` override, and a rollback path for a "no" at the
   go/no-go gate, which previously stranded a release commit *and* an annotated tag.
4. **The commit guard** (`scripts/git-hooks/pre-commit`) now protects every shared clone and
   names which one refused; `setup.sh` installs it per repo.
5. **`workspace-start`** fast-forwards a requested component's shared checkout when it is
   on-branch, clean, not mid-operation and a strict ancestor — and reports anything else.

### Residue, not fixed here

- `release/SKILL.md` still drives `~/youcoded-dev/youcoded-core`, archived read-only on
  GitHub 2026-09-20. Its push and release steps will fail. Out of scope for this change;
  governed by `docs/active/plans/2026-04-21-deprecate-youcoded-core.md`.
- `docs/PITFALLS.md` sits exactly at its 2500-word cap, so the "a shared component checkout
  is read as data" invariant could not be added without evicting another entry. It lives in
  `docs/workspace-start.md`, the WHY headers, and the pinning tests instead.
