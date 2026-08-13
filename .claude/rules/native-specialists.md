---
paths:
  # Split 2026-08-12 from native-runtime.md (rule-body budget): native
  # subagents (specialists) — content moved, glob moved with it, no duplication.
  - "youcoded/desktop/src/main/harness/specialists/**"
last_verified: 2026-08-12
verify:
  - path: youcoded/desktop/src/main/harness/specialists/registry.ts
  - path: youcoded/desktop/src/main/harness/specialists/child-ask-policy.ts
  - test: youcoded/desktop/tests/specialist-run.test.ts
---
# Native specialists (plan 1a)

Depth: `youcoded/docs/native-runtime.md` → "Specialists (plan 1a)". Sibling: `native-runtime.md` (session lifecycle).

## Specialists (plan 1a) — guards: `specialist-run`/`specialist-registry`/`specialist-child-ask-policy` tests
- **Depth-by-omission**: no `SpecialistDefinition.allowedTools` lists `'Task'`; `isSpecialistChild: true` is a second gate — no recursion path exists to bound.
- **Only `tool-use`/`tool-result`/`assistant-text` re-emit as stamped copies, NEVER persisted under the parent** — a stamped `turn-complete` would fire the parent's record listener/title feeder off a child turn.
- **Children are hidden from every list by construction**: `SessionStore.list()` defaults `includeChildren: false`; `createChild` mints no Conversation Store record, has no IPC route.
- **A child never reaches a real user ask**: `askUser: childAskPolicy()` replaces the `PermissionBroker` — a broker ask under a child's id has no owning window and would hang forever.
