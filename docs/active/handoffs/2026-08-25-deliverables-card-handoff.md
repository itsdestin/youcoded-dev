---
title: Deliverables card — implementation handoff
status: active
date: 2026-08-25
plan: docs/active/plans/2026-08-25-deliverables-card.md
spec: docs/active/specs/2026-08-25-deliverables-card-design.md
---

# Handoff prompt (paste into a new session)

Implement `docs/active/plans/2026-08-25-deliverables-card.md` using superpowers:subagent-driven-development (fall back to superpowers:executing-plans if subagents are unavailable). Read the plan in full first; its spec is `docs/active/specs/2026-08-25-deliverables-card-design.md`.

Context you need:

- The work is on the existing branch `feat/send-user-file-card` in `worktrees/send-user-file` (youcoded). The card UI is already there and **approved — do not restyle it**; the plan's Task 1 is three small hunks, not a rewrite.
- The plan was reviewed and corrected on 2026-08-25 (see its "Self-review" section). Trust the plan over your own reading of the spec where they differ — the spec's §12 decisions are vetoable, the plan's Global Constraints are not.
- Run Task groups 1–3, 4–5 and 6–7 in parallel (they touch disjoint files). **Stop before Task 8** and hand me Checkpoint 2.5 (dev instance, Claude Code session). I sign off on checkpoints 1, 2, 2.5 and 3 myself — describe what to look at, don't script it.
- Task 4 includes a one-line Kotlin change in `ArtifactStore.kt` plus a Kotlin test; run it with `./gradlew test -x bundleWebUi --tests '*ArtifactStoreTest*'`. If Gradle can't run, say so — never report a test as run when it wasn't.
- Before claiming any task done: `bash scripts/verify.sh worktrees/send-user-file` from `/home/destin/youcoded-dev` exits 0. Commit after every task. Do not push to master and do not merge — finishing (Task 10) is a separate step with me.
- Task 9 commits workspace docs: stage only this feature's hunks. The workspace has unrelated uncommitted edits to `.claude/rules/artifacts.md`, `.claude/rules/ipc-bridge.md` and `CLAUDE.md` — leave those out.
- Both rule files you touch in Task 9 are at the 600-word budget: add `verify:` anchors only, no prose.

When you hit a blocker or a test that won't pass, stop and tell me — don't work around it.
