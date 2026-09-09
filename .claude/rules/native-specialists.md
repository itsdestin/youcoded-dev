---
paths:
  # Split 2026-08-12 from native-runtime.md (rule-body budget): native
  # subagents (specialists) — content moved, glob moved with it, no duplication.
  # 2026-08-13: extended for plan 1b (background/durability/steering).
  # 2026-08-16: extended for plan 1c (files, chat UI backend, Settings) — glob
  # widened to the renderer specialist components plan 1c added.
  - "**/desktop/src/main/harness/specialists/**"
  - "**/desktop/src/renderer/components/Specialists*.tsx"
  - "**/desktop/src/renderer/components/specialists/**"
  - "**/desktop/src/renderer/hooks/useSpecialists.ts"
last_verified: 2026-08-16
verify:
  - path: youcoded/desktop/src/main/harness/specialists/registry.ts
  - path: youcoded/desktop/src/main/harness/specialists/child-ask-router.ts
  - path: youcoded/desktop/src/main/harness/specialists/delegation-ledger.ts
    contains: "A CLAIM IS A LEASE"
  - path: youcoded/desktop/src/main/harness/specialists/child-ask-router.ts
    contains: "ASK_REDIRECT_MESSAGE"
  - path: youcoded/desktop/src/main/harness/specialists/delegation-ledger.ts
    contains: "private async mutate"
  - path: youcoded/desktop/src/main/harness/specialists/catalog.ts
  - path: youcoded/desktop/src/main/harness/specialists/definition-files.ts
    contains: "loadClaudeCodeDefinition"
  - path: youcoded/desktop/src/main/harness/specialists/frontmatter.ts
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
    contains: "isSubagentDisplayEvent"
  - test: youcoded/desktop/tests/specialist-run.test.ts
  - test: youcoded/desktop/tests/specialist-delegation-ledger.test.ts
  - test: youcoded/desktop/tests/specialist-child-ask-router.test.ts
  - test: youcoded/desktop/tests/specialist-catalog.test.ts
  - test: youcoded/desktop/tests/specialist-definition-files.test.ts
  - test: youcoded/desktop/tests/specialist-frontmatter.test.ts
  - test: youcoded/desktop/tests/chat-reducer-specialists.test.ts
  - test: youcoded/desktop/tests/specialists-section.test.tsx
  - test: youcoded/desktop/tests/specialist-envelope.test.tsx
  - test: youcoded/desktop/tests/native-permission-broker.test.ts
  - test: youcoded/desktop/tests/task-tool.test.ts
---
# Native specialists (plan 1a + 1b + 1c)

Depth: `youcoded/docs/native-runtime.md` → "Specialists (plan 1a/1b/1c)". Primer: `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md`.
Sibling rule: `native-permissions.md` (the permission-store quad/v2 half of 1b).

## Specialists (plan 1a) — guards: `specialist-run`/`specialist-registry` tests
- **Depth-by-omission**: no `SpecialistDefinition.allowedTools` lists `'Task'`; `isSpecialistChild: true` is a second gate — no recursion path exists to bound.
- **`tool-use`/`tool-result`/`assistant-text` always re-emit as stamped copies; `assistant-thinking` re-emits too, but only when it carries text (plan 1c)** — a payload-less heartbeat stays child-only, and none are ever persisted under the parent. Guard: `isSubagentDisplayEvent` (`native-session-host.ts`), never the raw type set, decides re-emission.
- **Children are hidden from every list by construction**: `SessionStore.list()` defaults `includeChildren: false`; `createChild` mints no Conversation Store record, has no IPC route.

## Specialists (plan 1c) — files, chat UI backend, Settings — depth: `native-runtime.md` → "Specialists (plan 1c)" — guards: `specialist-catalog`/`specialist-definition-files`/`chat-reducer-specialists`/`native-permission-broker`/`specialists-section` tests
- **Catalog reads three sources per cwd before the Task tool is built; never watches a directory** — re-read is a per-file fingerprint, at conversation open, turn start on change, and Settings Refresh. Ids reserve on collision (built-in > personal > CC-user > CC-project), never shadow; ≤20 non-built-ins offered, each description ≤300 chars.
- **A running child keeps its spawn-time definition (R12)** — a roster change mid-run never reaches it.
- **CC `.claude/agents/*.md` mapping (spec §3.2) lives in `definition-files.ts`'s `loadClaudeCodeDefinition`** — Task/Agent stripped, omitted `tools:` → read-only, unmappable → warning, never silent.
- **Hire subject = grant width (D1/D2)**: built-in `${charter}:${workDir}`; `user` folders `${charter}:file:${id}@${fp}`; `project` folder `${charter}:${workDir}:file:${id}@${fp}` (`fp` = file sha256; edits re-ask). Auto-edit appends `{Task,'*:file:*',ask}`; a `task_id` resume is gated by the ledger's spawn-time `definitionFingerprint`. Guards: `task-tool`/`permission-engine`/`native-session-host`/`describe-rule` tests.
- **One emitter feeds the run card** — a private `mutate()` wrapper around `home.mutateJson` in `delegation-ledger.ts`; no other call site touches `mutateJson`. Notes live only on `run.notes`; the card appends by index-id, never rebuilds wholesale.
- **`PermissionHeld` fires on the hold flip and replays on reconnect via `pendingEventsFor`, paired with a `PermissionResolved` purge** — a reconnecting phone never sees live buttons on an already-answered ask.
- **The Specialists popup is a management surface** — every button routes through `PermissionButtons` → `respondToPermission`, same as a top-level ask.

## Specialists (plan 1b) — background, durability, steering — guards: `specialist-delegation-ledger`/`specialist-child-ask-router`/`native-session-host` (quiesce-cascade) tests
- **Specialists have no per-child step cap.** `SPECIALIST_SPAWN_BUDGET_PER_SESSION = 30` remains the per-parent lifetime runaway-delegation backstop; concurrency/single-writer limits, doom-loop, permissions, and lifecycle controls remain.
- **A child's ask reaches the user through the PARENT's card.** `childAskRouter` re-registers it under the parent session and waits up to `SPECIALIST_ASK_HOLD_MS` (5 minutes). An unanswered ask receives `ASK_REDIRECT_MESSAGE` but stays answerable; a late answer steers the live child or queues delivery for its `task_id`.
- **A per-parent delegation ledger is the durable record of every spawn** (one sidecar JSON file per parent, `sessions/<slug>/<parentId>.delegations.json`). A claim is a LEASE, not a delivery: `claimUndelivered` stamps an owner/timestamp but leaves `delivered: false`; only `confirmDelivered`, called AFTER the injected turn ran, flips it. A lease held by a dead process (`isOwnerAlive` false) is reclaimable, so a crash between claim and injection re-delivers exactly once instead of losing it.
- **Background completions, the per-turn status block, and steers are all history-only — never a new transcript event** (`runNotice`, `<specialists-status>`, `postSteer`'s `<steer>`); the frozen `TranscriptEventType` surface did not grow for this plan.
- **Permission-store rule identity is now a quad, and the store is versioned** (depth: `native-permissions.md`) — `specialist?: string` joined `(tool, pattern, action)` at every comparison site.
