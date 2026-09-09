---
status: shipped
date: 2026-09-09
---

# Session naming backend boundaries

Read-only feasibility notes during UI refinement. No selected architecture or implementation approval is implied. App paths below are relative to `youcoded/`.

## Ownership must survive older conversation record writers

`desktop/src/main/conversations/store-core.ts:88–130` parses a fixed record shape. Adding optional manual/automatic fields in that shape would be lost when an older client parses and rewrites it. A distinct naming metadata directory is a candidate, rather than sibling `<id>.naming.json` files inside the existing provider record folder.

Candidate: `Personal/ConversationNames/<provider>/<id>.json`. Desktop generic sync stages the worktree (`sync-spaces/git-transport.ts:347–351`); default exclusions in `sync-spaces/guards.ts:20–49` do not blanket-exclude JSON. Conversation-store scans are rooted under `Personal/Conversations`, while desktop and Android legacy transcript scans operate under `~/.claude/projects`. This provides separation from those inspected scanners, not a universal guarantee against older clients deleting unknown files. Android legacy sync selection and pruning need explicit verification before selecting the path.

A future sidecar parser/merge must independently retain the user's override and its clear operation; automatic metadata can never outrank user intent via conversation activity. Existing `ConversationRecord.title` would be a compatibility projection, not another authority. Cross-device stale-generation protection and clear-vs-rename conflicts must be specified. A locally cached recovery record alone cannot promise cross-device preservation.

## Models and platform scope

- Native desktop has configured provider/model binding validation and execution.
- Desktop CC one-shot precedent: `desktop/src/main/dev-tools.ts:387–435`; stdin-fed `claude -p` is not yet a restricted naming adapter.
- Android CC one-shot precedent: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3257–3283`, using `DevTools.runStreamed`. Its output drain precedes timeout waiting, so do not copy the helper as a bounded naming implementation without fixing cancellation structure.
- Android `provider:list`, `provider:catalog` and native channels are explicitly refused (`SessionService.kt:4204–4244`). Specialist default channels are also refused (`4271–4283`). Local Android cannot honestly offer desktop external-provider choices without additional runtime work.
- Narrow remote-web layout is shared with desktop and can use desktop execution; it is not a substitute for Android-local model support.

Use existing local preference storage patterns for the chosen binding. Sync session name ownership separately. Do not sync device-local provider IDs as portable model identities.

## Preconditions for implementation

1. Finish approved visual changes and contract.
2. Specify ownership storage, schema/clear/merge semantics, compatibility and retention; verify actual sync discovery on both platforms.
3. Define root completed-reply identities, replay deduplication and enable-later schedule. Normal fresh sequence: 1, 3, 28, 53.
4. Isolate native and CC generation with bounded context/output, selected model only, cancellation, and commit-time ownership/mode checks.
5. Replace legacy CC reminders rather than letting Off/Basic continue to cause model work. Route projections only after successful persistence.

No model evaluation has run. If a new naming prompt or hook instruction is implemented, offer the user the existing harness evaluation option before any paid run.
