---
status: shipped
---

# Workspace Startup Reorientation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explain incoming and local workspace changes on every startup, automatically fast-forward only when preservation is established, and prepare ambiguous changes for review without publishing or discarding work.

**Architecture:** Add one Node module for workspace inspection, reports, isolated candidates and guarded fast-forwards. Both `workspace-start.mjs` and the existing `workspace-sync.sh` entry point use it; session ownership and component provisioning stay in the existing startup code. Use Git's own merge machinery in a disposable private sandbox, not a new reconciliation engine.

**Tech Stack:** Existing Node ESM, built-in fs/child_process/crypto, Git, bash compatibility wrapper, node:test. No new packages or model calls.

## Global Constraints

- Approved specification: `docs/archive/specs/2026-09-08-workspace-start-reorientation.md`.
- Only youcoded-dev gets synchronization and reorientation.
- Never auto-commit or push.
- A resumed workspace branch, index, and files are never integrated or rewritten automatically.
- Remote means fetched published commits, not another machine's uncommitted files.
- Uncommitted local proposals do not automatically override current instructions.
- No service, model call, dashboard, or general-purpose reconciliation framework.
- No harness evaluation: Destin explicitly declined it.
- No commits, pushes or merges during this implementation without further permission. Use diff checkpoints in place of the generic skill's commit steps.
- Do not run the modified startup/sync entry points against the real shared checkout to test them. Test in disposable repositories only.
- Preserve existing component dependency provisioning (`cp -al`), source validation, manifests, per-session locks and ownership checks.
- WHY comments explain non-obvious preservation/authority decisions, not historical narratives.

---

## Workspace and file map

Resume using session key `2026-09-08-workspace-sync`. Current absolute workspace:
`/home/destin/youcoded-dev/worktrees/sessions/2026-09-08-workspace-sync`.
Use absolute paths with file tools; shell cwd does not retarget them. Read its CLAUDE.md, MAP startup row, PITFALLS worktree safety, and approved spec before implementation. Recheck upstream changes before relying on this plan's line locations.

| File | Responsibility |
|---|---|
| Create `scripts/workspace-sync.mjs` | Shared public sync API, report schema, snapshot/candidate preparation, standalone CLI |
| Create `scripts/workspace-sync.test.mjs` | New policy tests using disposable remotes |
| Create `scripts/fixtures/workspace-sync.mjs` | Small test-only repository builder and byte/state capture helper |
| Modify `scripts/workspace-start.mjs` | Call sync API, expose report, preserve provisioning logic |
| Modify `scripts/workspace-sync.sh` | Replace competing recovery implementation with Node wrapper |
| Modify `scripts/workspace-start.test.mjs` | Startup integration and component preservation |
| Modify `scripts/workspace-drift-guards.test.mjs` | Replace unsafe historical-residue expectations; retain commit guard tests |
| Modify `.claude/hooks/context-inject.sh` and `.test.mjs` | Read-only reminder to inspect startup report |
| Modify `docs/workspace-start.md`, `docs/workspace-workflows.md`, `CLAUDE.md`, `docs/MAP.md` | Accurate contract, authority and recovery instructions |

Do not preemptively extract further modules. If the shared module becomes hard to review, split reporting from operations only at that point; retain the API below.

## Public contract and disk layout

```js
// scripts/workspace-sync.mjs
// Public API signatures (implementation steps below):
// syncWorkspace({ root, branch = 'master', sessionPath = null,
//   fetchTimeoutMs = 15000, beforeApply = null }) -> { reportPath, report }
// formatBriefing(report) -> string
```

`root` must be the verified primary workspace repository. `sessionPath` is an already ownership-validated current workspace, or null before creation. `beforeApply` is a narrowly scoped test seam, never a CLI option; production passes null.

Return `{ reportPath, report }`. `report` is JSON-serializable:

```js
{
  version: 1, root, branch, capturedAt,
  freshness: { status: 'fetched' /* or 'unknown' */, remoteOid: null, error: null },
  shared: { head: '', branch: '', incoming: [], localOnly: [], changes: [], changedPaths: [] },
  session: null, // same inspection shape plus absolute path when resuming
  action: { status: 'unchanged', reason: '', beforeHead: '', afterHead: '' },
  guidance: [], // { scope, path, authority: 'committed' | 'uncommitted-proposal' }
  evidence: { directory: '', diffs: [], snapshot: null, candidate: null },
  warnings: []
}
```

Action statuses: `unchanged`, `fast-forwarded`, `review-required`, `offline`, `busy`, `failed`. Each commit entry is `{ oid, subject, patchEquivalent }` (equivalence null when not applicable/unknown). Each local change is `{ path, originalPath, indexStatus, worktreeStatus, kind, size }`; NUL-safe parsing, not line splitting. Session inspection uses its own HEAD as the comparison base, never shared HEAD.

Store each invocation under `<git-common-dir>/youcoded-sync/<unique-run-id>/`: `report.json`, `report.md`, full diff files, and optional `snapshot/` and `candidate/`. Directories mode 0700, files 0600. Use unique directories, no mutable latest-report link. The report is outside versioned files and survives failed reconciliation. Markdown escapes unusual paths; JSON retains exact path strings. Never interpolate filenames into a shell command. Preserve complete logs/diffs on disk using child-process output directed to files, avoiding execFileSync's default output cap.

The report is a factual inventory, not an AI semantic summary. It tells the agent to inspect changed guidance and explain important meaning before continuing. Untracked content is metadata-only in the general report; raw recovery/candidate data remains private on disk.

### Task 1: Complete read-only inspection and report

**Files:** new module, fixture and test files listed above.
**Consumes:** Git repository, optional session path.
**Produces:** `syncWorkspace(options)` report-only behavior and `formatBriefing(report)`; later tasks extend action handling without changing report fields.

- [x] Build a fixture with `makeWorkspace(t)` returning `{ root, seed, remote, git, publish, capture }`. `publish(relativePath, contents)` writes in seed, stages that explicit path, commits and pushes to its local bare remote. `git(cwd, ...args)` uses a fixed fixture identity and disables global/system Git config. `capture(root)` records HEAD, raw index bytes, NUL status, binary staged/unstaged patches, and path/type/mode/bytes for nonignored files. `t.after` removes only its temporary fixture root.
- [x] Write the first failing inventory test:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace } from './fixtures/workspace-sync.mjs';
import { syncWorkspace } from './workspace-sync.mjs';

test('report separates incoming, staged, unstaged and untracked work', t => {
  const f = makeWorkspace(t);
  f.publish('CLAUDE.md', 'new committed guidance\n');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'staged\n');
  f.git(f.root, 'add', 'source.txt');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'unstaged\n');
  fs.writeFileSync(path.join(f.root, 'new\nnotes.md'), 'proposal\n');
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.freshness.status, 'fetched');
  assert.ok(out.report.shared.incoming.length > 0);
  const edited = out.report.shared.changes.find(x => x.path === 'source.txt');
  assert.equal(edited.indexStatus, 'M');
  assert.equal(edited.worktreeStatus, 'M');
  assert.ok(out.report.shared.changes.some(x => x.path === 'new\nnotes.md'));
  assert.ok(fs.existsSync(out.reportPath));
});
```

- [x] Run `node --test scripts/workspace-sync.test.mjs`; establish the missing-module/export failure before implementation.
- [x] Implement a bounded, noninteractive fetch (`GIT_TERMINAL_PROMPT=0`, timeout 15000 ms). Resolve fetched OID once, then use that immutable OID throughout. On failure retain cached refs only as explicitly stale evidence; status stays unknown. Reject unsupported branch arguments before mutation; this version supports workspace master only.
- [x] Collect commit lists with NUL-delimited formatting; use `git cherry` for patch equivalence with unknown fallback for unsupported history. Use `git status --porcelain=v1 -z --untracked-files=all` with correct rename two-path parsing. Compare incoming/local histories from merge-base, retaining separate commit lists; represent unrelated histories explicitly instead of crashing.
- [x] Write full committed and binary staged/unstaged diffs to private files with `--no-ext-diff --no-textconv`. Disable optional Git index refresh for observational commands. Inventory untracked files with lstat; never follow symlinks. Flag unsupported pathname encodings rather than mutate them.
- [x] Prioritize CLAUDE/AGENTS guidance, `.claude/`, scripts and docs in briefing; include deleted/renamed guidance. Show category counts and a bounded path list with “more in report,” not a claim the short list is complete. Full report covers every inventoried path, commit and diff location. Include scopes and authority labels.
- [x] Add tests for local-only and patch-equivalent commits, session differences, offline unknown freshness, missing remote, unrelated history, renamed/deleted/binary files, tabs/newlines/spaces, untracked metadata, owner-only permissions, symlinks, and a diff exceeding 1 MiB. Assert the full diff/inventory was persisted and the briefing remains bounded.
- [x] Run the suite and inspect one fixture's report through Read before fixture cleanup (use a dedicated test fixture retained only for this inspection, then remove it). No report content from real workspace files is needed.

### Task 2: Guarded fast-forwards and recoverable snapshots

**Files:** `scripts/workspace-sync.mjs`, `scripts/workspace-sync.test.mjs`.
**Consumes:** Task 1 report and immutable fetched OID.
**Produces:** automatic safe action with persisted evidence, or precise refusal; `beforeApply` supports deterministic race testing.

- [x] Add clean-behind, unrelated staged+unstaged edits, wrong branch and active-merge tests. Before implementation, new clean-behind assertion must fail:

```js
test('clean behind workspace fast-forwards', t => {
  const f = makeWorkspace(t);
  f.publish('incoming.txt', 'remote\n');
  const out = syncWorkspace({ root: f.root });
  assert.equal(out.report.action.status, 'fast-forwarded');
  assert.equal(f.git(f.root, 'rev-parse', 'HEAD'), out.report.freshness.remoteOid);
  assert.ok(fs.existsSync(out.report.evidence.snapshot));
});
```

- [x] Acquire `<git-common-dir>/youcoded-sync.lock` using exclusive mkdir before fetch/inspection/mutation; release only a lock this invocation acquired, in finally. Record owner PID/time for diagnosis, never steal a stale lock. On contention create a private report with `busy`/unknown freshness and do not fetch or mutate shared state. Current-session resume can continue with that warning; a new workspace needs a successful fetch and must stop if none occurred.
- [x] Verify symbolic shared branch is master, HEAD is ancestor of fetched OID, no unmerged index or merge/rebase/cherry-pick/revert/bisect operation is active. Reject sparse checkout, submodule/gitlink transitions, and unsupported tracked types for automatic application. Do not reset duplicate commits or infer residue from historical bytes.
- [x] Preflight BOTH endpoints of renamed paths and all incoming ancestors/descendants. Protect ignored files, untracked files, symlinks, directory/file collisions, and inventory component roots (including slashless paths). Use lstat on incoming path ancestors rather than recursively inventorying ignored component contents. Never allow Git's ignored-file overwrite default.
- [x] Capture original HEAD, raw index copy, staged/unstaged binary patches and affected path bytes/types/modes privately; record absent paths explicitly. No hardlinks for snapshots. Retain the old commit using a dedicated recovery ref under `refs/youcoded-sync/<run-id>`; this creates no commit or published ref. Store recovery instructions, not an automatically executed rollback. If snapshot creation or verification fails, do not update.
- [x] Permit only clean or non-overlapping dirty-path fast-forwards. Treat exact-incoming overlapping copies as review candidates when staging or concurrent replacement cannot be proven safe; do not add a special destructive cleanup path. Git may accept safe exact matches itself, but never normalize them beforehand.
- [x] Fingerprint HEAD, index bytes and affected paths before preparation, then recheck immediately before applying. Call `beforeApply?.()` before that final check. On differences, emit review-required and leave the new bytes untouched.
- [x] Apply using `git -c core.hooksPath=<empty-private-directory> merge --ff-only --no-overwrite-ignore <remoteOid>` after preflight. Disabling hooks prevents arbitrary post-merge side effects; no user hook is modified. Verify HEAD and preserved dirty-path bytes/modes/staging after success. If Git fails or postconditions fail, report actual HEAD/state as failed, retain snapshot, and never restore over possible concurrent edits.
- [x] Add race test:

```js
test('a concurrent edit is preserved, not rolled back', t => {
  const f = makeWorkspace(t);
  f.publish('source.txt', 'incoming\n');
  const out = syncWorkspace({ root: f.root, beforeApply() {
    fs.writeFileSync(path.join(f.root, 'source.txt'), 'concurrent edit\n');
  } });
  assert.notEqual(out.report.action.status, 'fast-forwarded');
  assert.equal(fs.readFileSync(path.join(f.root, 'source.txt'), 'utf8'), 'concurrent edit\n');
});
```

- [x] Test lock contention, snapshot write failure, hooks not executed, Git failure, same-content changed mode, staged deletion, ignored collision, tracked symlink transition and nested component path collision. For every refusal compare HEAD/index/file capture before and after; for safe unrelated edits compare their exact staged and unstaged patches and bytes.
- [x] Run `node --test scripts/workspace-sync.test.mjs`. State clearly in code/docs: the cooperative lock and recheck are not protection from arbitrary non-cooperating writers during Git's filesystem update; complicated dirty replacements remain isolated.

### Task 3: Isolated review candidates, not automatic semantic merges

**Files:** `scripts/workspace-sync.mjs`, `scripts/workspace-sync.test.mjs`.
**Consumes:** snapshots/report from tasks 1–2.
**Produces:** `evidence.candidate` path containing materialized candidate and explicit per-layer outcome; shared checkout remains untouched for overlaps/divergence.

- [x] Write tests for nonoverlapping textual hunks in the same file, conflicting hunks, exact-current local copy and matching-historical local copy. Assert candidate evidence exists but shared HEAD/index/bytes stay identical.
- [x] Build the candidate using a private standalone Git repository under the run directory, not a registered session worktree. Import only required original and fetched commits via a local fetch; detach at fetched OID. Disable hooks, signing, remote pushes, external merge drivers and global/system config. All imports are local; never add an origin pointing to the real remote. No synthetic commits are needed.
- [x] Export binary `base..local HEAD`, staged, and unstaged patches. For linear ancestry choose merge-base as base. Apply in order with `git apply --3way --index` in the sandbox; first local committed delta, then staged delta, then unstaged delta. Do not claim the candidate's index reproduces original staging: original layer boundaries remain in snapshot/patch evidence. Stop later application after the first conflict, retain unapplied patches and clearly label partial candidate. Unsupported/no-base cases retain inputs and blocker rather than invent a merge.
- [x] Keep untracked local files out of candidate tracked paths; store collision metadata and any necessary local bytes in a separate private inputs location. Large binaries and unsafe types remain evidence-only. Conflicts may appear in the isolated candidate; never in shared files. Label all clean candidates “requires semantic review; not applied.”
- [x] Report an agent recovery checklist: inspect full report and original layers, review candidate, resolve technical conflicts in isolation, ask Destin only about ambiguous intent; do not transplant whole candidate files over live changes. Recheck current state before any later deliberate application. No automatic candidate-apply command in this build.
- [x] Add tests for unique local commits plus staged/unstaged work, patch-equivalent commits, binary conflicts, deleted/renamed paths, no common ancestor and partial-layer conflict. Assert no refs/commits are created in the shared repo except the named recovery ref, and no remote refs change. Verify candidate failure does not destroy report or prevent a fresh session from using the fetched OID.
- [x] Run `node --test scripts/workspace-sync.test.mjs` and inspect a clean and conflicted candidate report in disposable fixtures.

### Task 4: Integrate both entry points without changing component behavior

**Files:** `scripts/workspace-start.mjs` (startup loop around lines 117–175 and CLI around 178–209), `scripts/workspace-sync.sh`, both existing startup/drift test files.
**Consumes:** `syncWorkspace` and `formatBriefing`.
**Produces:** startup JSON `reorientation: { reportPath, report }`; human briefing; compatible maintenance CLI.

- [x] Add failing integration assertions: new clean workspace shared master advances; overlapping edits leave shared checkout unchanged but session starts from fetched remote; offline resume reports unknown; new offline workspace fails; all requested ownership checks finish before any workspace mutation.
- [x] Move existing recorded-worktree validation into the all-repositories preflight, before sync. Validate destination/branch collisions for new entries before sync too. Keep per-session lock/manifest behavior. Call `syncWorkspace` once with validated resumed workspace path or null, then use its immutable fetched OID to create new workspace without a second fetch. Keep component fetch code and dependency provisioning unchanged.
- [x] Implement new-workspace freshness gate and report propagation:

```js
const reorientation = syncWorkspace({ root, sessionPath: state.repositories.workspace?.path ?? null });
result.reorientation = reorientation;
if (!state.repositories.workspace && reorientation.report.freshness.status !== 'fetched') {
  throw new Error(`Cannot start a fresh workspace without fetched guidance. Report: ${reorientation.reportPath}`);
}
```

Place `result` initialization before this block. New component fetch failure must still preserve/report successful workspace work; CLI errors include report path even when later provisioning fails. A blocked sync with fetched freshness does not block creation. An offline existing workspace plus newly requested component still requires that component's successful fetch.
- [x] After new workspace creation add its absolute path to the human reorientation instructions; no need for a second session inventory because its initial state is the fetched commit. For resume the report already inventories its branch. Keep JSON stdout pure JSON; Git diagnostics go into structured report/stderr as appropriate. Print `formatBriefing(result.reorientation.report)` plus reportPath in human mode.
- [x] Replace shell implementation with the compatibility wrapper:

```bash
#!/usr/bin/env bash
# WHY: startup and maintenance must share one preservation policy.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/workspace-sync.mjs" "${1:?usage: workspace-sync.sh <repo-dir> [branch]}" "${2:-master}"
```

Node CLI validates root/branch, invokes sync and prints briefing/report location. Exit 0 only for unchanged/fetched or fast-forwarded; review-required/offline/busy/failed return 1. Require `scripts/workspace-repos.json` to be a tracked regular file at the supplied repository root and to contain the `workspace` inventory entry with branch `master`; fixture tests create that same minimal marker. Resolve the Git primary worktree and require it to equal root before any shared mutation. This is an accidental-component-use guard, not an authentication boundary. Do not silently grant workspace sync behavior to component repos. Keep CLI guard using `pathToFileURL` as existing startup does.
- [x] Revise old drift tests that expect reset-hard or historical residue deletion: they must now expect preserved local history/files with review-required report. Keep commit-hook tests intact. Keep unrelated edit fast-forward expectation. Test shared lock coordination between shell entry point and startup.
- [x] Run `node --test scripts/workspace-sync.test.mjs scripts/workspace-start.test.mjs scripts/workspace-drift-guards.test.mjs`. Re-run all existing component/dependency/startup ownership tests, not a filtered subset.

### Task 5: Reorientation instructions and precise documentation

**Files:** `.claude/hooks/context-inject.sh` startup reminder; its tests; docs listed in file map; approved specification status.
**Consumes:** final report/CLI contract.
**Produces:** accurate guidance without claims that old context has been erased or every dirty state was repaired.

- [x] Add hook test asserting startup instructions mention the complete reorientation report and committed-versus-uncommitted authority. Assert hook itself performs no fetch/sync and retains “as of last fetch” warnings. Run `node --test .claude/hooks/context-inject.test.mjs` and observe the new assertion fail.
- [x] Replace reminder copy with:

```text
Development edits: start/resume with node scripts/workspace-start.mjs --session <stable-key> [repo…]. Read its reorientation report and changed guidance before proceeding; use returned absolute paths. Uncommitted guidance is a proposal, not automatically authoritative. Do not manually repair shared checkouts to start work.
```

- [x] Update docs with exact implemented automatic cases, report layout/permissions, offline distinction, deliberate recovery, retained backups, lock diagnosis, session/component preservation, and agent responsibility for meaning. Remove claims of historical-byte deletion and patch-equivalent reset healing from workspace-workflows. Correct its stale “never installs dependencies” statement to describe existing hardlink provisioning, without expanding this task into dependency changes.
- [x] Update CLAUDE's existing startup/Git bullet rather than add a long new always-loaded section: permit the script's guarded workspace fast-forward, prohibit manual shared repairs and auto-publishing, require reading its report and authoritative returned guidance. Keep current component safety and dependency text.
- [x] Add the new module and suite to the existing MAP startup row. Mark the approved specification active. Record “harness evaluation declined by Destin” in the verification section; do not repeatedly offer it.
- [x] Run all four targeted suites, `bash -n scripts/workspace-sync.sh .claude/hooks/context-inject.sh`, and `node scripts/audit-anchors.mjs`. Missing component checkouts may produce unrelated anchor failures; record them distinctly rather than silently treating audit as passing. Inspect changed docs for contradictory “never fetches on resume” and “clears residue” claims.

### Task 6: Fresh review and acceptance evidence

**Files:** only corrections required by review, same scope as tasks 1–5.
**Consumes:** completed implementation and tests.
**Produces:** reviewed diff and accurate completion summary; no publishing.

- [x] Run `git diff --check` and inspect `git diff --stat` plus `git status --short`. Ensure only planned files and approved lifecycle documents changed.
- [x] Run final combined verification:

```bash
node --test scripts/workspace-sync.test.mjs scripts/workspace-start.test.mjs scripts/workspace-drift-guards.test.mjs .claude/hooks/context-inject.test.mjs
bash -n scripts/workspace-sync.sh .claude/hooks/context-inject.sh
node --check scripts/workspace-sync.mjs
node --check scripts/workspace-start.mjs
node scripts/audit-anchors.mjs
git diff --check
```

Run separately or chain with `&&`; never allow a last-command success to hide earlier failure. Save actual test totals/errors. Desktop verify.sh is not applicable unless scope unexpectedly includes desktop code; do not add desktop edits.
- [x] Request a fresh read-only reviewer for this isolated workspace. Brief: prioritize lost work, staging loss, ignored/component overwrite, hook side effects, races, false freshness, report completeness, output limits, candidate authority and preserved component behavior. Reviewer must not run mutation tests concurrently with a builder in the same worktree.
- [x] Fix verified in-scope findings with a failing regression test first, rerun relevant suites and final combined verification. Escalate any design-changing safety issue rather than silently weaken the contract.
- [x] Exercise both human and JSON CLI output against disposable repos for clean sync, blocked conflict and offline resume. Open resulting report files and confirm absolute paths resolve, complete evidence exists, and partial candidates cannot be mistaken for applied results. Record no runtime/live-app interaction.
- [x] Deliver concise summary: implemented automatic cases, review-only cases, verification evidence, remaining limitations and isolated branch/path. State no auto-commit/push, no harness eval, no deployment. Do not suggest merging or automatically apply the tool to the real shared checkout.

## Coverage and implementation decisions

| Approved requirement | Tasks |
|---|---|
| All incoming/local commits and nonignored dirty inventories | 1 |
| Staged/unstaged separation, full evidence, binary/untracked limits | 1–3 |
| Committed guidance versus local proposals, stale-context mitigation | 1, 5 |
| Bounded fetch, offline resume, fresh creation failure | 1, 4 |
| Guarded clean/unrelated fast-forward, exact matches conservatively handled | 2 |
| Historical matches and patch duplicates not discarded | 2–4 |
| Recoverable snapshots, lock, recheck, no destructive rollback | 2 |
| Isolated clean/conflicting/divergent candidates | 3 |
| Shared report even when blocked, precise failure state | 1–4 |
| Session preservation, component fetch/dependency behavior retained | 4 |
| One maintenance/startup policy | 4 |
| Updated docs/hook; fresh review and disposable tests | 5–6 |

The simplest safe interpretation of “exactly matches incoming” is to let Git accept it when its own fast-forward preserves state, otherwise prepare it for review. Do not add a separate dirty-file replacement transaction to automate that one case. Likewise candidate review happens through existing agent/file tools, not a new apply/rebase interface. These choices preserve every approved safety boundary while limiting implementation size.
