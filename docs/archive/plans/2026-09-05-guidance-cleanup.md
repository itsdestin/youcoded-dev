---
status: shipped
---
# Workspace guidance cleanup implementation plan

**Goal:** Remove the workspace's retired code-search integration and reduce always-loaded guidance without changing app behavior.

**Architecture:** Keep collaboration, safety, isolation, verification gates and routing in `CLAUDE.md`. Keep detailed development procedures in an on-demand workspace reference and retain existing specialist rules. Record native runtime improvements in the roadmap rather than implementing them.

**Tech stack:** Markdown, JSON, existing Node.js workspace validators.

## Constraints

- Work only in session `guidance-serena-cleanup` worktrees.
- Preserve historical records, shared checkouts, global caches and the running app.
- No native runtime implementation. Destin authorized merge and push after verification on 2026-09-05.
- Preserve live-app safety, isolated workspaces, UI approval gates, paid-eval consent and explicit merge authorization.

## Tasks

- [x] Remove project MCP registration and app project index configuration; replace active search guidance with worktree-local search and verification tools. Preserve historical references.
- [x] Shorten `CLAUDE.md`; relocate detailed development recipes to `docs/workspace-workflows.md`. Correct claims that startup hooks necessarily ran, distinguish native rule injection from command hooks, and retain existing heading routes.
- [x] File deferred hook execution/safety, first-write instruction timing, capability summary, instruction traceability and workflow-route consolidation in the roadmap after deduplication.
- [x] Run roadmap validation, context-injection tests, audit checks and whitespace checks. Classify missing-component audit failures without claiming a full audit pass.
- [x] Complete independent review. Corrected the workflow reference to distinguish daily mechanical checks from assistant-led semantic audits.

## Verification and handoff

Use `node scripts/roadmap-check.mjs --fix`, `node --test scripts/roadmap-check.test.mjs .claude/hooks/context-inject.test.mjs`, `node scripts/audit-anchors.mjs`, and `git diff --check` from the isolated workspace. Search tracked active operational guidance for remaining retired-tool references. Inspect both repo diffs. Do not claim a global uninstall: live/shared registration remains untouched until an authorized safe rollout.

## Landed

Repository cleanup merged in youcoded#431 and youcoded-dev#46. Runtime follow-ups remain open in the roadmap. Shared/live configuration and caches were not modified.
