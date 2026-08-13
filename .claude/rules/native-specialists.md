---
paths:
  # Split 2026-08-12 from native-runtime.md (rule-body budget): native
  # subagents (specialists) — content moved, glob moved with it, no duplication.
  # 2026-08-13: extended for plan 1b (background/durability/steering).
  - "youcoded/desktop/src/main/harness/specialists/**"
last_verified: 2026-08-13
verify:
  - path: youcoded/desktop/src/main/harness/specialists/registry.ts
  - path: youcoded/desktop/src/main/harness/specialists/child-ask-router.ts
  - path: youcoded/desktop/src/main/harness/specialists/delegation-ledger.ts
    contains: "A CLAIM IS A LEASE"
  - path: youcoded/desktop/src/main/harness/specialists/child-ask-router.ts
    contains: "ASK_REDIRECT_MESSAGE"
  - test: youcoded/desktop/tests/specialist-run.test.ts
  - test: youcoded/desktop/tests/specialist-delegation-ledger.test.ts
  - test: youcoded/desktop/tests/specialist-child-ask-router.test.ts
---
# Native specialists (plan 1a + 1b)

Depth: `youcoded/docs/native-runtime.md` → "Specialists (plan 1a)" and "Specialists (plan
1b — background, durability, steering)". Sibling: `native-runtime.md` (session lifecycle);
`native-permissions.md` (the permission-store quad/v2 half of 1b).

## Specialists (plan 1a) — guards: `specialist-run`/`specialist-registry` tests
- **Depth-by-omission**: no `SpecialistDefinition.allowedTools` lists `'Task'`; `isSpecialistChild: true` is a second gate — no recursion path exists to bound.
- **Only `tool-use`/`tool-result`/`assistant-text` re-emit as stamped copies, NEVER persisted under the parent** — a stamped `turn-complete` would fire the parent's record listener/title feeder off a child turn.
- **Children are hidden from every list by construction**: `SessionStore.list()` defaults `includeChildren: false`; `createChild` mints no Conversation Store record, has no IPC route.

## Specialists (plan 1b) — background, durability, steering — guards: `specialist-delegation-ledger`/`specialist-child-ask-router`/`native-session-host` (quiesce-cascade) tests
- **A child's ask now DOES reach a real user — routed to the PARENT's card, held, then redirected.** 1a's synchronous `childAskPolicy()` refusal above is GONE (the file no longer exists). `childAskRouter` (`specialists/child-ask-router.ts`) re-registers the ask on the broker under the parent's own sessionId — the existing permission card renders it exactly like the parent's own asks — and waits up to `SPECIALIST_ASK_HOLD_MS` (5 minutes). Only if nobody answers by then does it resolve with `ASK_REDIRECT_MESSAGE` (a scripted "keep working on anything that doesn't depend on this, never route around it" deny); the entry stays answerable after that timeout, not canceled. A real answer that lands late either steers the still-live child or, if it already ended, queues a parent delivery naming its `task_id`.
- **A per-parent delegation ledger is the durable record of every spawn** (`specialists/delegation-ledger.ts`, one sidecar JSON file per parent under `NativeHome`, `sessions/<slug>/<parentId>.delegations.json`). A claim is a LEASE, not a delivery: `claimUndelivered` stamps an owner/timestamp but leaves `delivered: false`; only `confirmDelivered` — called AFTER the injected turn actually ran — flips it. A lease held by a dead process (`isOwnerAlive` false) is reclaimable, so a crash between claim and injection re-delivers the report exactly once instead of losing it.
- **Background completions, the per-turn status block, and steers are all history-only — never a new transcript event.** `runNotice` (completion delivery), the `<specialists-status>` MOIM block, and `postSteer`'s `<steer>` messages all ride ordinary history messages; the frozen `TranscriptEventType` surface did not grow for this plan.
- **Permission-store rule identity is now a quad, and the store is versioned** (depth: `native-permissions.md`) — `specialist?: string` joined `(tool, pattern, action)` at every comparison site.
