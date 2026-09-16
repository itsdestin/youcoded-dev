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
  # 2026-09-16: specialists plans (stage two).
  - "**/desktop/src/main/harness/plans/**"
  - "**/desktop/src/main/harness/tools/propose-plan.ts"
  - "**/desktop/src/renderer/components/plans/**"
last_verified: 2026-09-16
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
  - path: youcoded/desktop/src/main/harness/plans/plan-journal.ts
    contains: "mutateFenced"
  - path: youcoded/desktop/src/main/harness/plans/plan-requests.ts
    contains: "handlePlanRequest"
  - test: youcoded/desktop/tests/plans-lifecycle.integration.test.ts
  - test: youcoded/desktop/tests/plan-executor.test.ts
  - test: youcoded/desktop/tests/plan-budget.test.ts
  - test: youcoded/desktop/tests/plans-transport.test.ts
---
# Native specialists (plan 1a + 1b + 1c + plans)

Depth: `youcoded/docs/native-runtime.md` → "Specialists (plan 1a/1b/1c)". Primer: `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md`.
Sibling rule: `native-permissions.md` (the permission-store quad/v2 half of 1b).

## Specialists (plan 1a) — guards: `specialist-run`/`specialist-registry` tests
- **Depth-by-omission**: no `SpecialistDefinition.allowedTools` lists `'Task'`; `isSpecialistChild: true` is a second gate — no recursion path exists to bound.
- **`tool-use`/`tool-result`/`assistant-text` always re-emit as stamped copies; `assistant-thinking` only when it carries text (plan 1c)** — a payload-less heartbeat stays child-only, none are persisted under the parent. Guard: `isSubagentDisplayEvent` (`native-session-host.ts`), never the raw type set, decides re-emission.
- **Children are hidden from every list by construction**: `SessionStore.list()` defaults `includeChildren: false`; `createChild` mints no Conversation Store record and has no IPC route.

## Specialists (plan 1c) — files, chat UI backend, Settings — depth: `native-runtime.md` → "Specialists (plan 1c)" — guards: `specialist-catalog`/`specialist-definition-files`/`chat-reducer-specialists`/`native-permission-broker`/`specialists-section` tests
- **Catalog reads three sources per cwd before the Task tool is built; never watches a directory** — per-file fingerprint re-read. Ids reserve on collision, never shadow; ≤20 non-built-ins.
- **A running child keeps its spawn-time definition (R12)** — a mid-run roster change never reaches it.
- **CC `.claude/agents/*.md` mapping (spec §3.2) lives in `definition-files.ts`'s `loadClaudeCodeDefinition`** — Task/Agent stripped, omitted `tools:` → read-only, unmappable → warning, never silent.
- **Hire subject = grant width (D1/D2)**: built-in `${charter}:${workDir}`; file-defined subjects add `file:${id}@${fp}` (edits re-ask). A `task_id` resume is gated by the spawn-time `definitionFingerprint`. Guards: `task-tool`/`permission-engine`/`native-session-host` tests.
- **One emitter feeds the run card** — a private `mutate()` wrapper around `home.mutateJson` in `delegation-ledger.ts`; no other call site touches `mutateJson`. Notes live only on `run.notes`; the card appends by index-id, never rebuilds.
- **`PermissionHeld` fires on the hold flip and replays on reconnect via `pendingEventsFor`, paired with a `PermissionResolved` purge** — a reconnecting phone never sees live buttons on an answered ask.
- **The Specialists popup is a management surface** — every button routes through `PermissionButtons` → `respondToPermission`, like a top-level ask.

## Specialists (plan 1b) — background, durability, steering — guards: `specialist-delegation-ledger`/`specialist-child-ask-router`/`native-session-host` (quiesce-cascade) tests
- **Specialists have no per-child step cap.** `SPECIALIST_SPAWN_BUDGET_PER_SESSION = 30` remains the per-parent lifetime runaway-delegation backstop; concurrency/single-writer limits, doom-loop, permissions and lifecycle controls remain.
- **A child's ask routes to the PARENT's card** (`childAskRouter`, parent's sessionId), held `SPECIALIST_ASK_HOLD_MS`, then answered with `ASK_REDIRECT_MESSAGE` but left answerable; a late answer steers or queues a delivery.
- **The per-parent delegation ledger is the durable spawn record; a claim is a LEASE** — only `confirmDelivered`, after the injected turn ran, flips `delivered`; a dead owner's claim is reclaimable (exactly-once).
- **Background completions, the per-turn status block and steers are history-only — never a new transcript event** (`runNotice`, `<specialists-status>`, `postSteer`'s `<steer>`); the frozen `TranscriptEventType` surface did not grow.
- **Permission-store rule identity is a quad, and the store is versioned** (depth: `native-permissions.md`) — `specialist?: string` joined `(tool, pattern, action)` at every comparison site.

## Specialists plans (stage two) — depth: same doc, "Specialists plans" — guards: `plans-lifecycle.integration`/`plan-*`/`plans-transport` tests
- **The journal (`plan-journal.ts`) is the only plan state**; damage is quarantined, never read as empty. Running writes are lease-fenced; takeover needs expiry AND a dead pid.
- **Budgets are hard stops**: reserve before every send, send once, unknown outcomes charged in full. Ceiling = work + per-attempt setup. ChatGPT alone is soft (no reply cap; pauses after one overshoot).
- **Settle before visible**: a paused/interrupted/stopped plan owns no specialist, slot, reservation, lease or timer. Continue never re-runs a committed attempt.
- **Plan specialists skip the 30-spawn budget**, keep the 4-slot/single-writer limits, and are unreachable by `task_id`.
- **Only the Comment's own turn links a revision** (host turn id). **One handler** (`handlePlanRequest`) serves IPC and remote.
