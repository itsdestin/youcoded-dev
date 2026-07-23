---
status: active
---

# StatusBar Git Branch Popup — Design

**Date:** 2026-07-23
**Status:** Approved design, pre-implementation (revised 2026-07-23 after code + live-API verification)
**Scope:** Desktop (Electron + React renderer) **and Android** — the StatusBar is the shared renderer

## Summary

Turn the StatusBar's static git branch chip into a clickable popup, matching the existing chip→popup pattern (`ContextPopup.tsx`, `OpenTasksPopup.tsx`). The popup shows a richer, live git picture — ahead/behind vs. upstream, ahead/behind vs. the default branch, dirty file count — plus GitHub PR status (number, draft/review state) fetched on open, with link-out actions to open the PR and the repo on GitHub. Modeled on the PR-status contract Claude Code's own CLI statusline exposes (`pr.number`, `pr.url`, `pr.review_state`).

## Goals

- Replace the branch chip's current data source (a 10s-polled bash hook) with the app's existing event-driven git subsystem, so branch/dirty/ahead-behind state is live.
- Surface ahead/behind vs. both the upstream tracking branch and the repo's default branch — two different, useful "how stale am I" signals.
- Surface GitHub PR status (number, draft flag, aggregate review decision) for the current branch, when GitHub auth is configured and a PR exists.
- Give the user one-click access to the PR and the repo on GitHub.
- Reuse every existing primitive (popup shell, git exec/watcher, GitHub auth) — no new UI framework, no new auth flow.
- **Ship both platforms in v1.** Verification (below) showed Android parity is one handler, not a port.

## Non-goals (v1)

- No git mutation actions in the popup (no pull/push/fetch buttons) — link-out only. Note this is a *policy* choice, not a plumbing gap: `gitStage`/`gitUnstage`/`gitCommit`/`gitDiscard` and their `GIT_IPC` channels already exist and are already routed on both platforms.
- No background polling for PR/review state while the popup is closed — fetched fresh only when opened (plus on window focus while open).
- No copy-branch-name action (explicitly not useful per user).
- No `git fetch` from the popup — every remote-relative number is computed against already-fetched refs (see §6).

## Current state (as of this design)

- **Chip:** `StatusBar.tsx:982-995` — static `<span>`, octicon branch glyph + raw `"repo/branch"` string. No click handler, no popup.
- **Data path:** `hook-scripts/statusline.sh:88-103` runs `git rev-parse --abbrev-ref HEAD` + repo basename on every Claude Code turn, writes to `~/.claude/.gitbranch-{sessionId}`. Main process reads that file verbatim in `buildStatusData()` (`ipc-handlers.ts:1839-1849`) on a 10s `setInterval` (line 1879), pushes over `IPC.STATUS_DATA`. Flows to renderer via `App.tsx:1250` → `App.tsx:2799` → `StatusBar` prop. Only branch name is available on this path — no ahead/behind, no dirty status, no PR data.
- **This chip already ships on Android.** `SessionService.kt:507-509` builds the same gitBranch map from `~/.claude/.gitbranch-$claudeId` (Android deploys its own `statusline.sh` via `Bootstrap.kt:1121-1145`), and `StatusBar.tsx` is the shared renderer bundled into the WebView by `build-web-ui.sh`. **Any change to the chip is a change on both platforms** — there is no platform gate on `show('git-branch')`.
- **Existing, unused-by-StatusBar git subsystem** (`youcoded/desktop/src/main/git/`):
  - `git-exec.ts` — `execGit()`, `resolveRepoRoot()` (cached, with `invalidateRepoRootCache()`).
  - `git-service.ts` — `gitFileStatus`/`gitFileReview` call `git status --porcelain=v2 --branch --untracked-files=all` (lines 96, 139). Also has `gitCommitFileDiff`, `gitStage`, `gitUnstage`, `gitCommit`, `gitDiscard`.
  - `porcelain.ts` — `parsePorcelainV2()` parses `# branch.head` (line 24) but **discards** `# branch.upstream <remote/branch>` and `# branch.ab +N -M`, which the same call already returns.
  - `git-watcher.ts` — event-driven `fs.watch` on `.git/HEAD`, `.git/index`, `.git/refs/heads` (worktree-aware via `gitdir:`/`commondir` resolution), 300ms debounce, refcounted per (repoRoot, subscriberId), emits `git:changed`. Currently wired only to the ProjectView diff UI.
  - IPC (`git/ipc-channels.ts`): `git:file-status`, `git:file-review`, `git:commit-file-diff`, `git:stage`, `git:unstage`, `git:commit`, `git:discard`, `git:watch`/`git:unwatch`, `git:changed` push. **All of these are already routed on Android** (`SessionService.kt:3647-3648`).
- **GitHub plumbing differs sharply by platform:**
  - *Desktop:* `github-client.ts` — `api(method, apiPath, body?, opts?)` (line 280) already POSTs JSON to any `api.github.com` path. Token acquisition order is stored app token → `gh auth token` → null (line 190). Only 401 is special-cased into a typed error.
  - *Android:* there is **no HTTP GitHub client at all**. Every `github:*` invoke returns `{ok:false, error:"not-implemented-on-mobile"}` (`SessionService.kt:3739-3746`). Android's only GitHub access is the bundled `gh` CLI, shelled through `/system/bin/linker64` for SELinux, via the `runGh` helper pattern inside `forkPublishViaGh` (`SessionService.kt:~3790`).
- **Popup pattern to reuse:** every chip→popup StatusBar element (`ContextPopup.tsx`, `SessionTagsChip.tsx`, `OpenTasksPopup.tsx`, `UpdatePanel.tsx`) follows: local `useState<boolean>` open flag in `StatusBar.tsx` → `<button onClick>` trigger → popup component does `createPortal(..., document.body)` rendering `<Scrim layer={2}/>` + `<OverlayPanel layer={2}>` as a **centered modal dialog** (not an anchored popover — no floating-ui/Popper primitive exists in this codebase) → `useEscClose(open, onClose)`. Styling via theme CSS custom properties (`var(--fg)`, `var(--edge)`, etc.) + Tailwind, no CSS Modules/styled-components.

## Verification performed (2026-07-23)

Live checks against `api.github.com` with a classic PAT, before locking this design:

| Question | Result |
|---|---|
| Does GraphQL accept `Authorization: token` (what `github-client.ts:259` sends)? | **Yes** — `token` and `bearer` both return 200. No header change needed. |
| Does the hardcoded `Accept: application/vnd.github+json` break GraphQL? | **No** — query succeeds with it. `api()` is usable as-is. |
| Inaccessible/nonexistent repo → what shape? | **HTTP 200**, `{"data":{"repository":null},"errors":[{"type":"NOT_FOUND",...}]}`. Confirms the false-negative hazard in §4. |
| Real repo, branch with no open PR? | **HTTP 200**, `{"data":{"repository":{"pullRequests":{"nodes":[]}}}}` — `repository` non-null. The three-way discrimination in §4 is clean. |
| `gh api graphql` exit code on GraphQL errors (the Android path)? | **Exit 1**, message on stderr. Errors surface as process failure — Android gets the error discrimination for free, desktop must hand-write it. |

## Design

### 1. Trigger & popup shell

`StatusBar.tsx:982-995`'s `<span>` becomes a `<button onClick={() => setGitPopupOpen(true)}>`, keeping the existing octicon + "repo/branch" label as the closed-state chip (unchanged visually). New `GitBranchPopup.tsx`, built structurally identical to `ContextPopup.tsx`: portal → `Scrim layer={2}` + centered `OverlayPanel layer={2}` → `useEscClose`.

**Decided: centered modal, no new positioning primitive** (2026-07-23). An anchored popover was considered and rejected for v1. The trigger sits on the bottom-pinned StatusBar and never scrolls, so a bottom-anchored panel would have been cheap (~40 lines, no library) — but two things outweighed it: it would make this the only StatusBar popup that isn't a centered modal, and on Android the same renderer draws that panel hugging the bottom edge of a phone, inside the system-nav gesture zone, where a centered modal is the better mobile shape. Matching the existing four popups keeps one presentation across both platforms. Revisit only if the popup's content grows enough that a full-screen scrim starts to feel disproportionate.

### 2. Data shown

| Field | Source |
|---|---|
| Repo name, branch name | From the resolved repo root (§3a), not the hook string |
| Ahead/behind vs. upstream | `porcelain.ts` stops discarding `# branch.ab` / `# branch.upstream` from the existing `git status --porcelain=v2 --branch` call |
| Ahead/behind vs. default branch | New: `git rev-list --left-right --count refs/remotes/origin/<default>...HEAD` via existing `execGit()` |
| Dirty file count | From the same status call — see §3d for what "dirty" means |
| PR number, draft flag, review decision | Single GraphQL query, fetched on popup open only (§3e) |

### 3. Backend changes

**a. Resolve the repo per session, not per project.** The current chip is implicitly per-session: `statusline.sh` runs in the Claude session's cwd. The git subsystem is keyed by an explicit `repoRoot` the *renderer* passes (ProjectView passes the open project root). **These diverge whenever a session's cwd is a subdirectory of, or a different repo than, the open project** — the normal case in this workspace, which holds five sub-repos plus worktrees. The popup must resolve `resolveRepoRoot(sessionInfo.cwd)` for the **active** session, re-resolve on session/tab switch, and pair every `git:watch` with a `git:unwatch` on switch and on unmount so the refcount in `git-watcher.ts` doesn't leak watchers across tab churn. If `resolveRepoRoot` returns null (session cwd isn't in a repo), the chip doesn't render — matching today's behavior.

**b. Wire `git-watcher.ts` to StatusBar.** It already emits `git:changed` on `.git/HEAD`/`.git/index`/`.git/refs/heads` changes; today only ProjectView listens. Add a light `git:branch-status` channel returning branch + upstream + ab-vs-upstream + ab-vs-default + dirty count for a repo root, re-invoked on `git:changed`. **Add it to Android's routed-channel list** (`SessionService.kt:3647-3648`) in the same change — the existing git channels are all there, and an unrouted channel falls to the `else` branch and returns `Unknown: ...`.

**c. The bash hook stays.** `statusline.sh:88-103` also renders `GIT_INFO` into the *terminal* statusline, and Android deploys its own copy. This change replaces the renderer's *consumption* of `.gitbranch-{sessionId}`; it does not delete the hook's git section on either platform.

**d. Stop discarding upstream/ab in `porcelain.ts`**, and pick a cheaper status mode. Parsing `# branch.ab`/`# branch.upstream` needs no new git invocation. But the branch-status call must **not** reuse `--untracked-files=all` (`git-service.ts:96,139`) — that's a full-tree walk, and this fires on every `git:changed` (300ms debounce, and `.git/index` churns constantly during an agent turn). Use `--untracked-files=normal`. Define the count explicitly: **dirty = tracked files with staged or unstaged modifications, plus untracked files at `normal` granularity (untracked directories count as one).** Label it in the UI as a file count, not "changes".

**e. Reuse `api()` for GraphQL on desktop — there is no new client to build.** Verification confirmed `api('POST', '/graphql', { query, variables })` works with the existing headers and token plumbing. Single query per popup-open:
```graphql
query($owner: String!, $repo: String!, $branch: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(headRefName: $branch, states: OPEN, first: 1) {
      nodes { number url isDraft reviewDecision }
    }
  }
}
```
`reviewDecision` (`APPROVED` / `CHANGES_REQUESTED` / `REVIEW_REQUIRED` / null) is computed server-side by GitHub — no client-side reimplementation of review-aggregation logic (branch protection, CODEOWNERS, dismissed reviews all handled for free).

**What must be hand-written is GraphQL error handling, and it is the load-bearing part of this feature.** GitHub returns **HTTP 200 with an `errors[]` array and `data.repository === null`** for NOT_FOUND, insufficient scope, and rate limiting (verified above). `api()` only special-cases 401, so a token lacking `repo` scope on a private repo yields 200 + `repository: null` — which collapses onto "no open PR" unless discriminated. Required three-way mapping:

| Response | State |
|---|---|
| `errors[]` present, **or** `data.repository == null` | **"Couldn't check PR status"** (§4) |
| `repository != null`, `nodes.length === 0` | No PR — section hidden |
| `repository != null`, `nodes[0]` | Render PR row |

**f. Android implements the same query via `gh api graphql`.** Android has no HTTP client, but it has an authenticated `gh` and the `runGh` shell helper. `gh api graphql -f query=... -F owner=... -F repo=... -F branch=...` returns the identical JSON, and **exits 1 with the message on stderr when GraphQL reports errors** — so `runGh`'s existing throw-on-nonzero behavior produces the "couldn't check" state automatically. Auth state must be probed separately (`gh auth status`) rather than via `github:status`, which is one of the hardcoded `not-implemented-on-mobile` stubs (`SessionService.kt:3739-3746`) and would wrongly report "not connected" even with `gh` authenticated.

**g. Default branch resolution.** Resolve locally via `git symbolic-ref refs/remotes/origin/HEAD` (no network, no API call). If unset (never fetched, or a bare clone), fall back to probing **`refs/remotes/origin/main` then `refs/remotes/origin/master`** — remote-tracking refs, not local branches, since the comparison target is the remote's default. If neither exists, omit the vs-default row entirely rather than substituting a guess.

**h. New IPC channel** `github:pr-for-branch` — `(owner, repo, branch) → { number, url, isDraft, reviewDecision } | { unavailable: 'not-connected' } | { error: string }`, called only when the popup opens (and again on window focus while it stays open). No interval, no background poll. Routed on both platforms.

### 4. Empty & error states

The governing rule (this workspace's error-message standard): **an absence must never silently imply a false negative.** "No PR exists" and "I couldn't find out" are different states and must look different.

- No GitHub auth configured (desktop: no token; Android: `gh auth status` non-zero) → PR section doesn't render.
- Auth configured, `repository` resolved, no open PR for this branch → PR section doesn't render (matches Claude Code's "absent until found / after merge-close" contract — a merged/closed PR won't match `states: OPEN`).
- Auth configured, query fails **or returns `errors[]`/null repository** (network, rate limit, missing `repo` scope on a private repo) → render a small inline "Couldn't check PR status" line. This is the case the §3e mapping exists to protect.
- Not a git repo (session cwd doesn't resolve to a repo root) → branch chip doesn't render at all (existing behavior).

### 5. Actions

- "Open PR in browser" — only shown when a PR exists; opens `pr.url` via `shell.openExternal` (desktop) / the equivalent Android intent.
- "Open repo in browser" — always available (derives the GitHub URL from the existing remote-origin lookup already used by `github-fork-publish.ts`).

### 6. Freshness labeling

Every remote-relative number here — ahead/behind vs. upstream, ahead/behind vs. default — is computed against **already-fetched** remote-tracking refs, which may be arbitrarily stale, and this design deliberately never fetches. The UI must say so (e.g. "3 behind `origin/master` — as of last fetch") rather than presenting bare counts. An unqualified "0 behind" on a week-old ref is precisely the kind of confidently-wrong signal that erodes trust in the whole chip.

## Testing

- Unit: `porcelain.ts` parsing of `branch.ab`/`branch.upstream`, including the no-upstream case (line absent entirely).
- Unit: **the §3e three-way GraphQL mapping** — 200-with-`errors[]`, 200-with-null-repository, 200-with-empty-nodes, and 200-with-a-PR must produce three distinct outcomes. This is the highest-value test in the change; the `errors[]` case is the one that silently breaks §4.
- Unit: default-branch resolution fallback chain, including "neither `origin/main` nor `origin/master` exists → row omitted".
- Unit/integration: repo root re-resolves on session switch, and `git:watch` refcounts return to zero after tab churn (no leaked watchers).
- Manual (desktop): popup with no upstream set, with upstream ahead/behind, with dirty files, with an open PR in each review state (approved / changes-requested / review-required / draft), with no GitHub auth, and with a simulated GraphQL failure.
- Manual (Android): chip opens, git rows populate, PR row populates with `gh` authenticated, PR section hides cleanly with `gh` unauthenticated.

## Future extensions (explicitly out of v1)

- Git mutation actions (pull/push/fetch) from the popup — plumbing already exists (see non-goals).
- A "fetch now" affordance to refresh the stale remote-tracking refs §6 warns about.
- Background polling so the closed-state chip itself can badge PR/review state without opening the popup.
