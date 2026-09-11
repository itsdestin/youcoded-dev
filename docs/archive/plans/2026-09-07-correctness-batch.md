---
status: shipped
date: 2026-09-07
---

# Correctness batch implementation plan

**Goal:** Autonomously verify and repair small roadmap correctness defects without redesigning the interface. User authorized this batch in chat; no commits, push, merge, live configuration changes or paid evaluations are authorized.

**Architecture:** Preserve current UI and bridge shapes. Repair data parsing or state identity at its source, with a failing regression before each production change. Keep each fix independently reviewable; one app writer at a time. No new dependencies.

**Workspace:** `/home/destin/youcoded-dev/worktrees/sessions/correctness-batch-sep07`; component `youcoded/`. Baseline app `d0653d1e`. Dependencies copied with `cp -al`, never patch their shared inodes.

## 1. Git filenames (confirmed)

Files: `youcoded/desktop/src/main/git/porcelain.ts`, its callers in `git-service.ts`/`git-watcher.ts`, tests under `youcoded/desktop/tests/git/`.

- [x] Read current parsers and linked roadmap investigation: line-based parsing retains C quotes; human-readable numstat guesses renames from arrows.
- [x] Add real temporary-repository regressions for non-ASCII, quotes, backslashes where supported, tabs/newlines, literal arrows, true renames and historical paths/counts. Run with `npx vitest run tests/git/` from desktop; observe expected failures.
- [x] Request NUL-delimited status/numstat output and parse it without guessing from path content. Inspect every caller and output trimming. Preserve public return shapes and path access gates.
- [x] Run all Git tests. Independent read-only review tracked below.

## 2. Additional candidates, admission gate

Read-only specialists inspect chat metadata, remote hydration, resumed files, marketplace and sync. Admit only an existing, reproducible correctness bug whose intended behavior needs no new product decision. For each admitted issue: record exact scope here, add/run a failing regression, apply the minimal fix, rerun focused tests, then fresh review. Already-shipped items are reported separately, not counted as new fixes. Unreproduced symptoms and security/retention/UX choices stay open.

Remote identity candidate: `chat-reducer.ts` still creates `turn-N` and `group-N` without the per-boot prefix already used by `msg-*`. Regression must hydrate a host snapshot into a fresh reducer instance and prove subsequent live text/tool events cannot overwrite earlier turns/groups; do not merely assert ID string format.

## 3. Verification and bookkeeping

- [x] Run `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/correctness-batch-sep07/youcoded` after app writers finish; read full failure output if any and separate baseline/environment problems.
- [x] Fresh reviewer inspected the eight scoped source/test files and related data paths: no demonstrated blockers. Static read-only review only; did not independently run tests or inspect a HEAD diff.
- [x] Update relevant roadmap investigations with branch-local evidence, retaining open status (now landed). Run `node scripts/roadmap-check.mjs --fix` and inspect its diff.
- [x] Report actual fixes, obsolete list entries, deferred candidates and verification limits. Desktop checks are not Android build verification. Do not mark landed 2026-09-08 work shipped.

## Implementation evidence

Admitted additional fixes: local model-only `conversation-store.ts` upsert (real native/Claude store tests fail with old model before fix), and remote turn/group identity in `chat-reducer.ts` (fresh-module hydration regression fails with overwritten history before fix). No UI layout/copy or IPC changes. Focused chat/store suite: 249 passed. Original Git scratch fixture: 14/18 new cases fail, including public status failures for quotes/control names; direct NUL-parser assertions also account for some failures. Patched Git suite passes. The initial combined gate caught missing required fields in the new hydration test's turn-complete event; corrected the fixture rather than bypassing types. Final desktop gate passes all six checks; 57 historical test files remain excluded by existing test-tsconfig policy. Roadmap structure/index clean; nine unrelated stale claims remain reported. Full doc audit blocked by absent unrelated component checkouts and baseline duplicate active/archive documents. No commit/merge or live-app actions.


## Landing

App fixes landed on origin/master as `03faf5e4` on 2026-09-08. Roadmap closures are in shipped.md; historical branch-local descriptions above record pre-landing evidence. No release tag was created.
