---
id: 212
title: Worker worktrees start without working dependencies
stage: explore
tags: dev-workspace
branch: 212-worker-worktrees-start-without-working
finish: workspace-start provisions wecoded-marketplace/worker the same way as desktop (fresh install when the shared copy is outdated), so tsc and vitest work in a new worker worktree with no manual step
created: 2026-11-01
why: Analytics session 2026-11-01: workspace-start provisions node_modules only for youcoded/desktop. The shared wecoded-marketplace/worker/node_modules was stale (vitest-pool-workers 0.5.41 against a lockfile wanting ^0.22, so tsc failed), and the glob-guard hook blocks npm ci inside a worktree even when there is no hardlink farm to damage. Workaround that cost ~6 calls: npm ci in a scratch folder, then move node_modules in.
---
Progress
Done: Fifth hit on 2026-11-09 (analytics day view). The one-line fix is written and proven on a throwaway server workspace: session start now links the server folder's tools and replaces them when outdated (61 packages replaced, type check clean, 54 tests pass).
Next: Merge the pull request once Destin says so, then close this card.
Blocked: Waiting for Destin's word to merge.

Chats
