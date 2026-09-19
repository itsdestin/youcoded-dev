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
    contains: "No timeout options"
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
# Native specialists (plans 1a/1b/1c + stage two)

Depth: `youcoded/docs/native-runtime.md` → its "Specialists" sections. Primer: `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md`.
Sibling rule: `native-permissions.md` (permission-store quad/v2).

## Specialists (plan 1a) — guards: `specialist-run`/`specialist-registry` tests
- **Depth-by-omission**: no `SpecialistDefinition.allowedTools` lists `'Task'`; `isSpecialistChild: true` is a second gate — no recursion path exists to bound.
- **`tool-use`/`tool-result`/`assistant-text` always re-emit as stamped copies; `assistant-thinking` only when it carries text** — a payload-less heartbeat stays child-only; none persist under the parent. `isSubagentDisplayEvent`, never the raw type set, decides re-emission.
- **Children are hidden from every list by construction**: `SessionStore.list()` defaults `includeChildren: false`; `createChild` mints no Conversation Store record and has no IPC route.

## Specialists (plan 1c) — files, chat UI backend, Settings — guards: `specialist-catalog`/`specialist-definition-files`/`chat-reducer-specialists`/`native-permission-broker`/`specialists-section` tests
- **Catalog reads three sources per cwd before the Task tool is built; never watches a directory** — per-file fingerprint re-read. Ids reserve on collision, never shadow; ≤20 non-built-ins.
- **A running child keeps its spawn-time definition (R12)** — a mid-run roster change never reaches it.
- **CC `.claude/agents/*.md` mapping lives in `definition-files.ts`'s `loadClaudeCodeDefinition`** — Task/Agent stripped, omitted `tools:` → read-only, unmappable → warning, never silent.
- **Hire subject = grant width (D1/D2)**: built-in `${charter}:${workDir}`; file-defined subjects add `file:${id}@${fp}` (edits re-ask). A `task_id` resume is gated by the spawn-time `definitionFingerprint`. Guards: `task-tool`/`permission-engine`/`native-session-host` tests.
- **One emitter feeds the run card** — `delegation-ledger.ts`'s private `mutate()` is the only caller of `home.mutateJson`. Notes live only on `run.notes`; the card appends by index-id, never rebuilds.
- **Open asks replay on reconnect via `pendingEventsFor`, paired with a `PermissionResolved` purge** — a reconnecting phone never sees live buttons on an answered ask.
- **The Specialists popup is a management surface** — every button routes through `PermissionButtons` → `respondToPermission`, like a top-level ask.

## Specialists (plan 1b) — background, durability, steering — guards: `specialist-delegation-ledger`/`specialist-child-ask-router`/`native-session-host` tests
- **Specialists have no per-child step cap.** `SPECIALIST_SPAWN_BUDGET_PER_SESSION = 30` remains the per-parent lifetime runaway backstop; concurrency/single-writer limits, doom-loop, permissions and lifecycle controls remain.
- **A child's ask DOES reach a real user — on the PARENT's card, waiting with NO timeout**, exactly like the parent's own asks: `childAskRouter` re-registers it under the parent's sessionId (`raisedBy` = child) with no options, settling only on an answer or a cancel. The 5-minute hold, redirect, `PermissionHeld` and late-answer route were removed 2026-09-16 — never reintroduce them.
- **The per-parent delegation ledger (`sessions/<slug>/<parentId>.delegations.json`) is the durable spawn record, and a claim is a LEASE** — `claimUndelivered` stamps owner/time but leaves `delivered: false`; only `confirmDelivered`, after the injected turn ran, flips it. A dead owner's lease is reclaimable, so a crash re-delivers exactly once.
- **Background completions, the per-turn status block and steers are history-only — never a new transcript event** (`runNotice`, `<specialists-status>`, `postSteer`'s `<steer>`); `TranscriptEventType` did not grow.
- **Permission-store rule identity is a quad, and the store is versioned** — `specialist?: string` joined `(tool, pattern, action)` everywhere; depth in `native-permissions.md`.

## Specialists plans (stage two) — guards: `plans-lifecycle.integration`/`plan-*`/`plans-transport` tests
- **The journal (`plan-journal.ts`) is the only plan state**; damage is quarantined, never read as empty. Running writes are lease-fenced; takeover needs expiry AND a dead pid.
- **Budgets are hard stops**: reserve before every send, send once, unknowns charged in full. Ceiling = work + per-attempt setup. ChatGPT alone is soft (pauses after one overshoot).
- **Settle before visible**: a paused/interrupted/stopped plan owns no specialist, slot, reservation, lease or timer. Continue never re-runs a committed attempt.
- **Plan specialists skip the 30-spawn budget**, keep the 4-slot/single-writer limits, and are unreachable by `task_id`.
- **Only the Comment's own turn links a revision** (host turn id). **One handler** (`handlePlanRequest`) serves IPC and remote.
- **Every step carries a plain `summary`, and a whole plan may not be ONE specialist run** (decision 33, 2026-09-19): `summary` is required in both halves of the grammar from the one `KIND_FIELDS` table; `validatePlanDocument` refuses `maximumAttempts < 2` and tells the model to hire a specialist instead. A one-item split stays legal — it is how a single worker joins a larger plan. **Why:** the row's words ARE the summary, so optional meant a machine prompt reached the person approving real spending. **Guard:** `plan-schema`/`plan-tool` tests.
- **A repeat is ONE projected row carrying its `body`**, not several flattened rows (the loop, round cap and stop condition had nowhere to appear). The wrapper sums its body's fan-out and ceiling, so **the approved ceiling must not move by a token**; anything asking "which specialists does this plan have" must descend one level (`planLeafSteps`). **Guard:** `plan-journal.test.ts` compares both totals against the old projection.
