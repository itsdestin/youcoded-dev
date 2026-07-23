---
status: active
---

# StatusBar Git Branch Popup — Design

**Date:** 2026-07-23
**Status:** Approved design, pre-implementation
**Scope:** Desktop (Electron + React renderer) only — `youcoded/desktop/`

## Summary

Turn the StatusBar's static git branch chip into a clickable popup, matching the existing chip→popup pattern (`ContextPopup.tsx`, `OpenTasksPopup.tsx`). The popup shows a richer, live git picture — ahead/behind vs. upstream, ahead/behind vs. the default branch, dirty file count — plus GitHub PR status (number, draft/review state) fetched on open, with link-out actions to open the PR and the repo on GitHub. Modeled on the PR-status contract Claude Code's own CLI statusline exposes (`pr.number`, `pr.url`, `pr.review_state`).

## Goals

- Replace the branch chip's current data source (a 10s-polled bash hook) with the app's existing event-driven git subsystem, so branch/dirty/ahead-behind state is live.
- Surface ahead/behind vs. both the upstream tracking branch and the repo's default branch — two different, useful "how stale am I" signals.
- Surface GitHub PR status (number, draft flag, aggregate review decision) for the current branch, when GitHub auth is configured and a PR exists.
- Give the user one-click access to the PR and the repo on GitHub.
- Reuse every existing primitive (popup shell, git exec/watcher, GitHub auth) — no new UI framework, no new auth flow.

## Non-goals (v1)

- No git mutation actions in the popup (no pull/push/fetch buttons) — link-out only.
- No background polling for PR/review state while the popup is closed — fetched fresh only when opened (plus on window focus while open).
- No copy-branch-name action (explicitly not useful per user).
- No Android UI — StatusBar git chip is desktop-only today; this stays desktop-only.

## Current state (as of this design)

- **Chip:** `StatusBar.tsx:982-995` — static `<span>`, octicon branch glyph + raw `"repo/branch"` string. No click handler, no popup.
- **Data path:** `hook-scripts/statusline.sh:88-103` runs `git rev-parse --abbrev-ref HEAD` + repo basename on every Claude Code turn, writes to `~/.claude/.gitbranch-{sessionId}`. Main process reads that file verbatim in `buildStatusData()` (`ipc-handlers.ts:1839-1849`) on a 10s `setInterval` (line 1879), pushes over `IPC.STATUS_DATA`. Flows to renderer via `App.tsx:1250` → `App.tsx:2799` → `StatusBar` prop. Only branch name is available on this path — no ahead/behind, no dirty status, no PR data.
- **Existing, unused-by-StatusBar git subsystem** (`youcoded/desktop/src/main/git/`):
  - `git-exec.ts` — `execGit()`, `resolveRepoRoot()` (cached).
  - `git-service.ts` — `gitFileStatus`/`gitFileReview` call `git status --porcelain=v2 --branch`.
  - `porcelain.ts` — `parsePorcelainV2()` parses `# branch.head` but **discards** `# branch.upstream <remote/branch>` and `# branch.ab +N -M`, which the same call already returns.
  - `git-watcher.ts` — event-driven `fs.watch` on `.git/HEAD`, `.git/index`, `.git/refs/heads` (worktree-aware), 300ms debounce, emits `git:changed`. Currently wired only to the ProjectView diff UI.
  - IPC: `git:file-status`, `git:file-review`, `git:watch`/`git:unwatch`, `git:changed` push (`preload.ts:1331-1354`).
- **GitHub auth/API plumbing:** `github-client.ts` + `GITHUB_STATUS`/`github:*` IPC namespace (`preload.ts:196-201`), currently only consumed by the fork-publish flow (`github-fork-publish.ts:147-158`, REST `pulls?head=...`, scoped narrowly). No generic "PR for current branch" helper exists yet, and no GraphQL client exists in the codebase — this design adds the first one.
- **Popup pattern to reuse:** every chip→popup StatusBar element (`ContextPopup.tsx`, `SessionTagsChip.tsx`, `OpenTasksPopup.tsx`, `UpdatePanel.tsx`) follows: local `useState<boolean>` open flag in `StatusBar.tsx` → `<button onClick>` trigger → popup component does `createPortal(..., document.body)` rendering `<Scrim layer={2}/>` + `<OverlayPanel layer={2}>` as a **centered modal dialog** (not an anchored popover — no floating-ui/Popper primitive exists in this codebase) → `useEscClose(open, onClose)`. Styling via theme CSS custom properties (`var(--fg)`, `var(--edge)`, etc.) + Tailwind, no CSS Modules/styled-components.

## Design

### 1. Trigger & popup shell

`StatusBar.tsx:982-995`'s `<span>` becomes a `<button onClick={() => setGitPopupOpen(true)}>`, keeping the existing octicon + "repo/branch" label as the closed-state chip (unchanged visually). New `GitBranchPopup.tsx`, built structurally identical to `ContextPopup.tsx`: portal → `Scrim layer={2}` + centered `OverlayPanel layer={2}` → `useEscClose`. No new positioning primitive.

### 2. Data shown

| Field | Source |
|---|---|
| Repo name, branch name | Already available (existing `gitBranch` string, or re-derived from `resolveRepoRoot()` + `git-watcher`) |
| Ahead/behind vs. upstream | `porcelain.ts` stops discarding `# branch.ab` / `# branch.upstream` from the existing `git status --porcelain=v2 --branch` call |
| Ahead/behind vs. default branch | New: `git rev-list --left-right --count origin/<default>...HEAD` via existing `execGit()` |
| Dirty file count | Already free: `parsed.files.length` from the same status call |
| PR number, draft flag, review decision | New: single GraphQL query (see below), fetched on popup open only |

### 3. Backend changes

- **Wire `git-watcher.ts` to StatusBar.** It already emits `git:changed` on `.git/HEAD`/`.git/index`/`.git/refs/heads` changes; today only ProjectView listens. Add a StatusBar-facing push (reusing `git:file-status` or a light new `git:branch-status` channel) so branch/dirty/ahead-behind-vs-upstream/ahead-behind-vs-default update live, replacing the 10s bash-hook poll entirely for this data.
- **Stop discarding upstream/ab in `porcelain.ts`** — parse the two lines it already receives, no new git invocation.
- **Add the default-branch diff call** — one more `execGit()` invocation, same infra as everything else in `git-service.ts`. Default branch is resolved locally via `git symbolic-ref refs/remotes/origin/HEAD` (no extra network/API call); if that ref is unset (e.g. never fetched), fall back to checking `main` then `master` for existence and skip the comparison entirely if neither exists.
- **Add a GraphQL client.** First one in the codebase. Single query per popup-open:
  ```graphql
  query($owner: String!, $repo: String!, $branch: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(headRefName: $branch, states: OPEN, first: 1) {
        nodes { number url isDraft reviewDecision }
      }
    }
  }
  ```
  `reviewDecision` (`APPROVED` / `CHANGES_REQUESTED` / `REVIEW_REQUIRED` / null) is computed server-side by GitHub — no client-side reimplementation of review-aggregation logic (branch protection, CODEOWNERS, dismissed reviews all handled for free). Reuses the existing token/auth plumbing from `github-client.ts`; only the query mechanism (GraphQL endpoint vs. REST) is new.
- **New IPC channel**, e.g. `github:pr-for-branch` — `(owner, repo, branch) → { number, url, isDraft, reviewDecision } | null`, called only when the popup opens (and again on window focus while it stays open). No interval, no background poll.

### 4. Empty & error states

- No GitHub auth configured → PR section doesn't render.
- Auth configured, no open PR for this branch → PR section doesn't render (matches Claude Code's "absent until found / after merge-close" contract — a merged/closed PR simply won't match `states: OPEN` anymore).
- Auth configured, query fails (network/rate-limit) → **distinct from "no PR"**: render a small inline "Couldn't check PR status" line rather than hiding, so a transient failure is never mistaken for "no PR exists" (this workspace's error-message standard: never let an absence silently imply a false negative).
- Not a git repo → branch chip doesn't render at all (existing behavior — `gitBranch` is only set when in a repo).

### 5. Actions

- "Open PR in browser" — only shown when a PR exists; opens `pr.url` via `shell.openExternal`.
- "Open repo in browser" — always available (derives the GitHub URL from the existing remote-origin lookup already used by `github-fork-publish.ts`).

## Testing

- Unit: `porcelain.ts` parsing of `branch.ab`/`branch.upstream` (existing test file pattern for this module).
- Unit: GraphQL response → `{ number, url, isDraft, reviewDecision }` mapping, including the null/no-PR case.
- Manual: open popup with no upstream set, with upstream ahead/behind, with dirty files, with an open PR in each review state (approved/changes-requested/review-required/draft), with no GitHub auth configured, and with a simulated GraphQL failure (verify the "couldn't check" state renders instead of silently omitting the PR section).

## Future extensions (explicitly out of v1)

- Git mutation actions (pull/push/fetch) from the popup.
- Background polling so the closed-state chip itself can badge PR/review state without opening the popup.
- Android parity.
