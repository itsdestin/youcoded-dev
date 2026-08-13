---
status: draft
date: 2026-08-12
spec: docs/active/specs/2026-08-11-native-specialists-design.md
repos: [youcoded]
sequence: plan 1b of 3 for spec stage one (1a = core foreground, SHIPPED 8db46236; 1c = definitions folder/CC mapping/chat UI)
---

# Native Specialists Plan 1b — Background, Durability, Steering, Timeout Redirect

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Specialists become background-capable and durable: the parent keeps working while a child runs, completions arrive as self-contained injected turns at idle boundaries, the model and user can steer a running child, blocked permission asks route to the parent's surface with a 5-minute redirect, and everything — undelivered reports, interrupted children, the subagent card — survives an app restart.

**Architecture:** A per-parent **delegation ledger** (sidecar JSON under `NativeHome`, written via `mutateFileUnderLock`) becomes the durable record of every spawn: status, owner `{pid, processStartedAt}`, raw report body, delivery claim/release. Background runs detach from the Task call (which resolves immediately with a `task_id`); the host's `runTurns` drain loop gains a delivery phase that injects completed reports as user-role turns only when the queue is empty. Steering is a `HarnessSession` primitive (`postSteer`) drained at the top of each turn-loop iteration — a tool call is never cut. Child asks re-register on the broker under the **parent's** session id (so the existing permission card renders them) with a 5-minute timer that resolves the child's blocked call with the scripted redirect while the ask stays answerable. Replay merges the child's own JSONL back into the parent's `getHistory()` stream, re-stamped exactly like the live path — the CC `subagent-watcher` precedent, applied natively.

**Tech Stack:** TypeScript (Electron main + shared), vitest, existing seams only: `defineTool`, `PermissionBroker`, `SessionStore`/`NativeHome`, `CapabilityProfile`, the 1a specialists modules.

## Global Constraints

- **Worktree:** all work in the `youcoded` repo on branch `feat/native-specialists-background` in a dedicated worktree. Desktop only; Android untouched.
- **⚠ In-flight branch watch:** `feat/permission-ask-timeout` (worktree `worktrees/perm-timeout`) is **still unmerged** and owns the CC hook-relay timeout path plus renderer `PERMISSION_EXPIRED` reasons and `ToolCard` expiry UI. This plan's Task 8 touches only the native `PermissionBroker` and harness ask sites — zero file overlap with that branch's 39 files **except** `chat-reducer.ts`/`chat-types.ts` comments. Before starting Task 8, run `git log origin/master --oneline -20`; if perm-timeout has landed, rebase and reuse its `reason` vocabulary on `PERMISSION_EXPIRED` instead of inventing one.
- **Frozen emit surface:** child/display events use ONLY existing `TranscriptEventType` values. New semantics ride `data` fields (the `parentAgentToolUseId` precedent). `SUBAGENT_DISPLAY_TYPES` stays exactly `{tool-use, tool-result, assistant-text}` — the WHY at `native-session-host.ts:90-102` (stamped `turn-complete` reaches `noteModelUsed`; `session-error` fails the parent; `user-message` fakes a user turn) still binds.
- **No new IPC channels in this plan.** User-facing steer/promote/interrupt buttons and the status-bar badge are plan 1c; 1b ships host methods and model-facing tool surface only. Child asks reuse the existing `hook-event` → permission-card rail by re-registering under the parent's id.
- **The stored session header is NEVER rewritten** (`native-session-host.ts:1084-1086`, rule `native-runtime.md`). All mutable durable state lives in the delegation ledger sidecar; the header gains no new fields in this plan.
- **Injection is messages, never a prompt edit.** Completion deliveries, MOIM status blocks, and steers are history messages (the `<project-rule>` precedent at `harness-session.ts:575-595`); `prompt-assembly.ts` stays byte-stable per session.
- **Tool-call/result pairing everywhere:** a background Task call resolves its tool result immediately (the launch acknowledgment). A child that dies detached must still produce a ledger record — never a dangling anything.
- **Every non-trivial edit carries a WHY comment** (Destin is a non-developer).
- **Error copy:** specific-and-accurate or general-non-committal per `docs/error-message-standards.md`. The redirect and refusal strings in this plan are **model-facing** copy (like `PermissionDecision.message`) — they state facts, never guessed causes.
- **Verification:** `bash scripts/verify.sh <worktree>` green before any "done" claim.
- **Spec values (verbatim):** away-timeout **5 minutes** (configurable); hosted concurrency 4 per parent (now via profile); heartbeat-based liveness — **staleness flags, never wall-clock kills**; report overflow spills to a file with a pointer footer; per-conversation spawn budget as runaway backstop; `task_id` resume is **own-children-only**; user copy says "specialists".
- **Read before you edit:** each task names anchor symbols with line numbers verified 2026-08-12 against master `8db46236`. Re-locate by symbol name if a range looks wrong (`mcp__serena__find_symbol` works on master's copy only — branch truth is the worktree).

## Deferred-item ledger (NOT in this plan)

| Item | Home |
|---|---|
| Status-bar badge ("2 specialists working" / queued-ask badge), card actions (send-a-note, promote, interrupt buttons), launch card with charter, name badge on the running card | 1c — 1b exposes the state (hook events, ledger, host methods); 1c renders it |
| Definitions folder, CC `.claude/agents` mapping, hot reload | 1c |
| Subagent `assistant-thinking` routing | 1c (renderer) |
| Child-transcript GC / deletion lifecycle | ROADMAP (`#specialists`) — children accumulate in the sessions dir; deleting a parent conversation should sweep its children |
| Foreground→background *automatic* promotion on timeout | Ruled out by spec §3 ("no automatic timeout promotion in v1"); manual promotion buttons are 1c |
| Settings menu UI for the **budget**/**frontier** delegated-model pickers (two model pickers + their get/set IPC channels), launch-card display of the resolved model, cost preview | 1c — Task 14 ships the storage file, resolver, per-hire `model` input, and ModelSearch tool it consumes |

---

### Task 1: Atomic specialist reservation (slot + writer in one synchronous step)

The 1a writer lock is a check-then-set across an await — `tools/task.ts:109` checks `isWriterBusy`, the set happens at `native-session-host.ts:287` after `await createChild(...)`. Safe under 1a's serial foreground flow; broken the moment two background Tasks run in one parallel-tool-call step. The fix the code comment (`native-session-host.ts:280-286`) already prescribes: fold check and set into one synchronous reserve-or-refuse.

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` (`tryReserveSpecialistSlot` :239-244, `releaseSpecialistSlot` :249-253, `isSpecialistWriterBusy` :258-260, `spawnSpecialist` :262-322, services wiring :754-759)
- Modify: `desktop/src/main/harness/tools/types.ts:31-45` (`ToolServices.specialists`)
- Modify: `desktop/src/main/harness/tools/task.ts:98-144` (execute flow)
- Test: `desktop/tests/native-session-host.test.ts` (extend the `specialist slot + writer-lock bookkeeping (Task 6)` describe at :458), `desktop/tests/task-tool.test.ts`

**Interfaces:**
- Consumes: 1a's `specialistSlots` / `activeWriterChild` maps.
- Produces: `reserveSpecialist(parentId: string, opts: { writer: boolean }): { ok: true; token: SpecialistReservation } | { ok: false; reason: 'at-capacity' | 'writer-busy' }` and `releaseReservation(token)`, replacing `tryReserveSlot`/`releaseSlot`/`isWriterBusy` on `ToolServices.specialists`. `SpecialistReservation = { parentId: string; writer: boolean; childId?: string }`. Tasks 4 and 6 spawn using a reservation.

- [ ] **Step 1: Write the failing tests** in `native-session-host.test.ts` (inside the existing slot/writer describe):

```ts
it('reserves slot and writer atomically — two synchronous writer reservations, second refused', () => {
  const a = host.reserveSpecialist('parent-1', { writer: true });
  const b = host.reserveSpecialist('parent-1', { writer: true });
  expect(a.ok).toBe(true);
  expect(b).toEqual({ ok: false, reason: 'writer-busy' });
});
it('a released writer reservation frees the writer lock even when no child was ever bound', () => {
  const a = host.reserveSpecialist('parent-1', { writer: true });
  if (!a.ok) throw new Error('unexpected');
  host.releaseReservation(a.token);
  expect(host.reserveSpecialist('parent-1', { writer: true }).ok).toBe(true);
});
it('readers do not consume the writer lock and cap at the profile max', () => {
  for (let i = 0; i < 4; i++) expect(host.reserveSpecialist('parent-1', { writer: false }).ok).toBe(true);
  expect(host.reserveSpecialist('parent-1', { writer: false })).toEqual({ ok: false, reason: 'at-capacity' });
});
```

- [ ] **Step 2: Run to verify failure** — `cd <worktree>/desktop && npx vitest run tests/native-session-host.test.ts -t 'atomically'` → FAIL (`reserveSpecialist` not a function).
- [ ] **Step 3: Implement.** In `native-session-host.ts`, replace the three 1a methods with:

```ts
// WHY: 1a checked writer-busy in task.ts and set the lock after an await in
// spawnSpecialist — a check-then-set race the 1a comment explicitly deferred to
// this plan. Reserve slot AND writer in one synchronous step; the token is the
// only way to release, so a throw between reserve and spawn can't leak either.
reserveSpecialist(parentId: string, opts: { writer: boolean }):
  { ok: true; token: SpecialistReservation } | { ok: false; reason: 'at-capacity' | 'writer-busy' } {
  if (opts.writer && this.activeWriterChild.has(parentId)) return { ok: false, reason: 'writer-busy' };
  const current = this.specialistSlots.get(parentId) ?? 0;
  if (current >= this.maxSpecialistsFor(parentId)) return { ok: false, reason: 'at-capacity' };
  this.specialistSlots.set(parentId, current + 1);
  const token: SpecialistReservation = { parentId, writer: opts.writer };
  if (opts.writer) this.activeWriterChild.set(parentId, RESERVED_WRITER); // placeholder until a childId binds
  return { ok: true, token };
}
```

with `const RESERVED_WRITER = '__reserved__';`, `bindReservation(token, childId)` (swaps the placeholder for the real childId so `destroy(childId)`'s existing owner-checked cleanup at :1532-1533 keeps working), and `releaseReservation(token)` (decrements the slot; deletes the writer entry only if it equals the token's bound childId or the placeholder). `maxSpecialistsFor(parentId)` returns `HOSTED_MAX_CONCURRENT_SPECIALISTS` for now — Task 13 makes it profile-derived. Update `ToolServices.specialists` in `tools/types.ts` to `{ reserve, release, spawn }`; rewrite `task.ts` steps 4-5 (:109-126) to call `services.reserve(...)` once and map `reason` to the existing verbatim refusal strings; `finally` calls `services.release(token)` only when the spawn path did not already transfer ownership (spawn's own `finally` keeps releasing on completion — pick ONE owner: the tool reserves, the spawn binds, the tool releases in `finally`; delete the release from `spawnSpecialist`).
- [ ] **Step 4: Update the 1a tests that call the old seam** (`task-tool.test.ts` fakes expose `tryReserveSlot`/`isWriterBusy` — reshape the fake to `reserve`/`release`), run both files → PASS, plus `npx vitest run tests/specialist-run.test.ts`.
- [ ] **Step 5: Commit** — `git commit -m "refactor(specialists): atomic slot+writer reservation ahead of parallel delegation"`

### Task 2: Delegation ledger — the durable record

**Files:**
- Create: `desktop/src/main/harness/specialists/delegation-ledger.ts`
- Modify: `desktop/src/main/native-home.ts` (verify `listSessionFiles` :225-269 filters to `.jsonl` — if it doesn't, make it, with a WHY comment; the ledger sidecar must never be listed as a session)
- Modify: `desktop/src/main/harness/native-session-host.ts` (construct ledger; record on spawn/completion/failure/interrupt in `spawnSpecialist` :262-322 and `runSpecialist` :324-446)
- Test: Create `desktop/tests/specialist-delegation-ledger.test.ts`; extend `desktop/tests/native-home.test.ts`

**Interfaces:**
- Consumes: `NativeHome.mutateJson(rel, fn)` (:84 — lock-guarded, throws on lock exhaustion) and `readJson(rel)` (:44).
- Produces (Tasks 4, 5, 6, 7, 9 all consume this):

```ts
export type OwnerStamp = { pid: number; instanceId: string };
export interface DelegationRecord {
  childId: string; parentToolCallId: string;
  agentType: string; title: string; workDir: string; description: string;
  background: boolean;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  startedAt: number; endedAt?: number; steps?: number;
  rawReport?: string;      // UNFORMATTED body, capped at RAW_REPORT_CAP_CHARS (full body lives in the child JSONL + reportPath)
  reportPath?: string;     // spill file — written at COMPLETION when the body exceeds the ledger cap (Task 4), or at delivery on budget truncation (Task 10)
  failureText?: string;    // status 'failed'
  delivered: boolean;      // flipped ONLY after the injected turn has run — see the claim lease below
  claimedBy?: OwnerStamp;  // delivery LEASE — a claim is not a delivery
  claimedAt?: number;
  owner: OwnerStamp;
  missedSteers: string[];
  stale?: boolean;
}
export const RAW_REPORT_CAP_CHARS = 64_000;
export class DelegationLedger {
  constructor(private home: NativeHome) {}
  async recordStart(parentCwd: string, parentId: string, rec: DelegationRecord): Promise<void>;
  async update(parentCwd: string, parentId: string, childId: string, patch: Partial<DelegationRecord>): Promise<void>;
  listFor(parentCwd: string, parentId: string): DelegationRecord[];   // sync read, [] when no file
  async claimUndelivered(parentCwd: string, parentId: string): Promise<DelegationRecord | null>;
    // oldest record with status completed && !delivered && no live-owner lease;
    // stamps claimedBy/claimedAt under the lock — delivered stays FALSE
  async confirmDelivered(parentCwd: string, parentId: string, childId: string): Promise<void>;   // the injected turn ran — NOW flip delivered
  async releaseClaim(parentCwd: string, parentId: string, childId: string): Promise<void>;       // delivery failed — clear the lease for retry
}
export const OWNER: OwnerStamp = { pid: process.pid, instanceId: randomUUID() }; // captured once at module load
export function isOwnerAlive(owner: OwnerStamp): boolean;
```

File path: `sessions/<cwdToProjectSlug(parentCwd)>/<parentId>.delegations.json`, shape `{ v: 1, delegations: DelegationRecord[] }`. **A claim is a lease, not a delivery** (external review 2026-08-12): the earlier eager-`delivered: true` shape lost the report forever if the app died between the claim and the injected turn reaching the parent — the exact failure mode this ledger exists to close. `isOwnerAlive`: `owner.instanceId === OWNER.instanceId` → true (it is this very process); otherwise `process.kill(pid, 0)` in try/catch (the `sync-service.ts:441-454` precedent). Deliberately NO `/proc/<pid>/stat` start-time comparison — field 22 is jiffies-since-boot while our stamp would be epoch ms, and the conversion is fiddly, platform-specific, and prone to never firing or false-firing (external review). The residual PID-reuse risk (a dead owner's pid reused by some long-lived process) leaves a stale `running` record that remains visible in the status block and interruptible via `task_id` — annoying, never lossy. The WHY comment states exactly this.

- [ ] **Step 1: Write the failing tests** in `specialist-delegation-ledger.test.ts` (temp-dir `NativeHome`, same fixture style as `permission-store.test.ts`):

```ts
it('recordStart + listFor round-trips a record', async () => { /* record, list, expect one match */ });
it('update patches one record by childId and leaves siblings alone', async () => { /* two records, patch one */ });
it('claimUndelivered LEASES the oldest completed+undelivered record — delivered stays false', async () => {
  // three records: running / completed-undelivered(old) / completed-undelivered(new)
  const first = await ledger.claimUndelivered(CWD, 'p1');
  expect(first?.childId).toBe('old');
  const rec = ledger.listFor(CWD, 'p1').find(r => r.childId === 'old');
  expect(rec?.delivered).toBe(false);
  expect(rec?.claimedBy).toEqual(OWNER);
});
it('confirmDelivered flips delivered; a confirmed record is never claimable again', async () => { /* claim, confirm, claim → next record */ });
it('releaseClaim clears the lease so a failed injection retries', async () => { /* claim, release, claim again returns same record */ });
it('a record leased by a DEAD owner is claimable again — crash between claim and injection re-delivers', async () => {
  // write a record with claimedBy: { pid: 999999, instanceId: 'gone' }, delivered: false
  const rec = await ledger.claimUndelivered(CWD, 'p1');
  expect(rec?.childId).toBe('the-orphaned-one');
});
it('isOwnerAlive: our own pid+start is alive; an absurd pid is not', () => {
  expect(isOwnerAlive(OWNER)).toBe(true);
  expect(isOwnerAlive({ pid: 999999, processStartedAt: 1 })).toBe(false);
});
```

Plus in `native-home.test.ts`: `it('listSessionFiles ignores .delegations.json sidecars', ...)`.
- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/specialist-delegation-ledger.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement the module** exactly per the interface above; every write goes through `home.mutateJson` (read-modify-write under the lock); `rawReport` is sliced to `RAW_REPORT_CAP_CHARS` in `update` with a WHY comment (the full body survives in the child JSONL and, from Task 10, the spill file).
- [ ] **Step 4: Wire recording into the host.** In `spawnSpecialist`: `recordStart` right after `createChild` returns (childId + title now known; `parentToolCallId` from `opts.parentToolCallId`; `owner: OWNER`; `background: false` here). In the success path: `update(..., { status: 'completed', endedAt: Date.now(), steps: run.steps, rawReport: run.report, delivered: true })` — foreground delivery IS the tool result, so it is born delivered. In the catch: `update(..., { status: 'failed', failureText: <the thrown message>, endedAt: Date.now() })`. In `destroyChildrenOf` (:1471-1483): children still `running` get `{ status: 'interrupted', endedAt: Date.now() }` — fire-and-forget with `.catch(log)` since callers can be sync. **`interrupt(parentId)`'s cascade (:1355) becomes FOREGROUND-only** (external review 2026-08-12, deliberate 1b decision): the Stop button aborts the parent's turn and any foreground child blocking that turn, but a background specialist keeps working — stopping a *turn* is not firing the researcher. `destroy`/`quiesce` teardown still takes every child down (spec §1 cascade-cancel applies in full there). Foreground/background is read synchronously from `ledger.listFor`. Test: parent interrupt mid-background-run leaves the child live and its record `running`.
- [ ] **Step 5: Run** `npx vitest run tests/specialist-delegation-ledger.test.ts tests/specialist-run.test.ts tests/native-home.test.ts` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(specialists): durable delegation ledger with owner liveness and delivery claims"`

### Task 3: Steering primitive — `postSteer` drained at iteration boundaries

**Files:**
- Modify: `desktop/src/main/harness/harness-session.ts` (turn loop `turnLoop:` at :1386; `beginTurn` :1322)
- Modify: `desktop/tests/helpers/scripted-model.ts` (if needed: a scripted step that asserts on history contents mid-turn)
- Test: `desktop/tests/harness-session-loop.test.ts`

**Interfaces:**
- Produces: `HarnessSession.postSteer(text: string): boolean` — queues a steer; returns `false` when no turn is in flight (the caller records a missed steer). Steers drain at the **top of each turn-loop iteration** (before `maybeCompact` at :1390) as user-role history messages — a tool call is never cut. Also `drainUnappliedSteers(): string[]` — leftover steers that were posted too late to drain (the turn ended first); `runDelegation` folds these into the ledger's `missedSteers` at completion, so a `postSteer` that returned `true` during the child's final step is still honestly reported as un-applied (gap surfaced by the external review's invariant question). The in-flight test `this.abort !== null` is the real invariant: `this.abort = new AbortController()` at :1338 and `finally { this.abort = null; }` at :1550-1552 bracket the turn exactly (verified 2026-08-12). Tasks 6, 8, 12 consume this.

- [ ] **Step 1: Write the failing test** in `harness-session-loop.test.ts`:

```ts
it('postSteer lands as a user-role message before the NEXT model step, never mid-step', async () => {
  // scripted model: step 1 emits a tool call; during tool execution, test calls session.postSteer('focus on X');
  // step 2's request history must contain a user message including '<steer>' and 'focus on X'
  // AFTER step 1's tool result — assert via the scripted model's captured request messages.
});
it('postSteer with no turn in flight returns false and injects nothing', () => {
  expect(session.postSteer('late note')).toBe(false);
});
it('a steer posted during the FINAL step never lands — drainUnappliedSteers returns it after the turn', async () => {
  // scripted model whose last step is a plain text end; postSteer during that step;
  // after the turn resolves, expect session.drainUnappliedSteers() to equal ['the steer']
  // and the request history to never have contained it.
});
```

- [ ] **Step 2: Run to verify failure** → FAIL (`postSteer` not a function).
- [ ] **Step 3: Implement.** `private pendingSteers: string[] = [];` — `postSteer` pushes and returns `this.abort !== null` (push only when true). At the top of the `turnLoop` iteration:

```ts
// WHY: steering (spec §3) applies at the child's next iteration boundary — a
// tool call is never cut. History-only, like injectPathTriggers: not a
// transcript event, so it costs nothing on the frozen emit surface.
if (this.pendingSteers.length > 0) {
  for (const s of this.pendingSteers.splice(0)) {
    this.history.push({ role: 'user', content: `<steer>\n${s}\n</steer>` });
  }
}
```

- [ ] **Step 4: Run the file** → PASS; also `npx vitest run tests/harness-history-rebuild.test.ts` (steers are history-only and must not break rebuild — rebuild reads events, steers aren't events, nothing to do, but prove it).
- [ ] **Step 5: Commit** — `git commit -m "feat(harness): postSteer primitive — mid-run course corrections at iteration boundaries"`

### Task 4: Background execution + completion delivery at the idle boundary

**Files:**
- Modify: `desktop/src/main/harness/tools/task.ts` (schema + execute), `desktop/src/main/harness/tools/types.ts`
- Modify: `desktop/src/main/harness/native-session-host.ts` (`spawnSpecialist` split, `runTurns` :1245-1261, `formatSpecialistReport` :448-483)
- Modify: `desktop/src/main/harness/harness-session.ts` (notice-turn entry)
- Test: `desktop/tests/specialist-run.test.ts`, `desktop/tests/task-tool.test.ts`

**Interfaces:**
- Consumes: Task 1's reservation, Task 2's ledger.
- Produces:
  - Task input gains `background?: boolean` (zod `.optional()`, described: "Set true for anything long — you keep working and the report is delivered to you automatically when the specialist finishes.").
  - `ToolServices.specialists.spawnBackground(parentId, opts): Promise<{ childId: string; title: string }>` — resolves at LAUNCH.
  - `HarnessSession.runNotice(text: string): Promise<void>` — a full turn whose opening event is `user-message` with `data.injected: 'specialist-report'` (data-field extension, not a new type; renders as a plain message until 1c styles it).
  - Host: `private pendingDeliveryParents = new Set<string>()` + a delivery phase in `runTurns`.

- [ ] **Step 1: Write the failing tests** in `specialist-run.test.ts`:

```ts
it('background Task resolves immediately with a task_id while the child is still running', async () => {
  // scripted child model with a gated (manually-resolved) tool step; call the Task tool with background: true;
  // expect the tool result text to match /working in the background/ and /task_id: /
  // and host.isIdle(parentId) to be reachable while the child is mid-run.
});
it('a background completion is injected as a user-role turn when the parent goes idle — never mid-turn', async () => {
  // parent busy on its own scripted turn; child finishes meanwhile;
  // assert nothing was injected before the parent turn completed, then the next
  // emitted user-message has data.injected === 'specialist-report' and contains "## Report from".
});
it('the injected report is formatted at DELIVERY time with concurrentReporters = number of pending deliveries', async () => {
  // two finished background children pending; assert each formatted body respects
  // computeReportBudget with concurrentReporters 2 (headroom split — the 1a arithmetic pin).
});
it('a background child that dies mid-run delivers a typed failure notice, not silence', async () => {
  // provider-error child; expect an injected notice matching /failed/ and the child id.
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Split `spawnSpecialist`.** Extract the body into `private async runDelegation(parentId, childId, title, opts, reservation): Promise<SpecialistRunResult>` (run → ledger updates → teardown in `finally`, per Task 2). Foreground `spawnSpecialist` awaits it and formats immediately (today's behavior, `delivered: true`). New:

```ts
async spawnSpecialistBackground(parentId: string, opts: SpecialistSpawnOpts & { reservation: SpecialistReservation }):
  Promise<{ childId: string; title: string }> {
  const { childId, title } = await this.createChild(parentId, opts);
  this.ledger.recordStart(/* background: true, delivered: false */);
  // WHY: deliberately un-awaited — the Task call returns at launch. The chain
  // NEVER rejects (every outcome becomes a ledger status), so no unhandled
  // rejection can escape; lint's floating-promise rule is satisfied by void+catch.
  void this.runDelegation(parentId, childId, title, opts)
    .then(run => this.ledger.update(..., { status: 'completed', rawReport: run.report, steps: run.steps, endedAt: Date.now() }))
    .catch(err => this.ledger.update(..., { status: 'failed', failureText: String(err?.message ?? err), endedAt: Date.now() }))
    .finally(() => { this.releaseReservation(opts.reservation); this.queueDelivery(parentId); });
  return { childId, title };
}
```

- [ ] **Step 4: Delivery at the idle boundary.** `queueDelivery(parentId)` adds to `pendingDeliveryParents`; if `isIdle(parentId)`, kick a drain. In `runTurns`, after the queue-drain `while` and **before** `entry.inFlight = false` (:1260):

```ts
// WHY (spec §3): background completions inject as a synthetic user-role turn at
// an idle boundary — never spliced mid-turn (role alternation + local prompt cache).
// A claim is a LEASE: delivered flips only after the injected turn has run. A crash
// between claim and injection leaves a dead-owner lease that Task 9's reconcile
// releases — the report is re-delivered after restart, never lost.
while (this.pendingDeliveryParents.has(sessionId)) {
  const rec = await this.ledger.claimUndelivered(entry.cwd, sessionId);   // lease, not delivery
  if (!rec) { this.pendingDeliveryParents.delete(sessionId); break; }
  try {
    await entry.session.runNotice(this.formatDelivery(sessionId, rec));
    await this.ledger.confirmDelivered(entry.cwd, sessionId, rec.childId); // only now is it delivered
  } catch (err) { await this.ledger.releaseClaim(entry.cwd, sessionId, rec.childId); log.warn(...); break; }
}
```

**Completion-time spill for oversized bodies:** when `run.report` exceeds `RAW_REPORT_CAP_CHARS`, the completion handler writes the FULL body to the Task 10 spill file *before* the ledger update and stores `reportPath` alongside the capped `rawReport` — delivery re-reads the full body from `reportPath`, so the background path never produces a pre-truncated file whose footer claims "full report" (external review 2026-08-12; the foreground path formats from the in-memory body and was never affected). `formatDelivery` wraps `formatSpecialistReport` (now parameterized with `concurrentReporters = pending undelivered count`) with a self-contained preamble: `[Background specialist finished] ${title} (${agentType}) completed the task you delegated ("${description}", started <n>m ago, ${steps} steps).` — failure records instead produce `[Background specialist failed] ${title} (${agentType}): ${failureText}. Partial transcript: specialist session ${childId}.` `runNotice` in `harness-session.ts` is `beginTurn(text, () => this.emitEvent('user-message', { text, injected: 'specialist-report' }))` — the same shape `runSkill` uses (:1207-1209).
- [ ] **Step 5: Task tool branch.** In `task.ts`, when `args.background`: reserve (Task 1), `const { childId, title } = await services.spawnBackground(...)`, return `{ text: \`${title} (${args.agent}) is now working in the background (task_id: ${childId}). Their report will be delivered to you automatically when they finish — do not wait or poll. Keep working; a status block at the start of your turns tracks running specialists.\` }` — and do NOT release in `finally` on this path (ownership transferred to the detached chain; a thrown launch still releases).
- [ ] **Step 6: Run** the two test files plus `npx vitest run tests/native-session-host.test.ts` → PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(specialists): background execution with idle-boundary report delivery"`

### Task 5: MOIM turn-context ledger block

**Files:**
- Modify: `desktop/src/main/harness/harness-session.ts` (`beginTurn` :1322-1337, `HarnessSessionOpts`)
- Modify: `desktop/src/main/harness/native-session-host.ts` (`wire()` :805-845 — build the status string)
- Test: `desktop/tests/harness-session-loop.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Consumes: Task 2's `listFor`, the host's live maps.
- Produces: `HarnessSessionOpts.specialistStatus?: () => string | null` — evaluated at each `beginTurn`; non-null returns are pushed as a user-role `<specialists-status>` history message **before** the real user message. Host wires it for root sessions only.

- [ ] **Step 1: Write the failing tests:**

```ts
// harness-session-loop.test.ts
it('a non-null specialistStatus is injected before the user message, and a null one REMOVES the stale block', async () => {
  // opts.specialistStatus returns 'Nadia (researcher): running — step 3' on turn 1, null on turn 2;
  // assert turn 1's request history has a user message containing '<specialists-status>' BEFORE the typed text,
  // and turn 2's contains NO status block at all (turn 1's was removed).
});
it('exactly ONE status block ever lives in history — turn N replaces turn N-1', async () => {
  // statuses 'step 1' then 'step 3' across two turns; turn 2's request history contains
  // one <specialists-status> block, containing 'step 3', not two.
});
// native-session-host.test.ts
it('the host status block lists running and undelivered-finished specialists and omits delivered ones', async () => { ... });
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement.** In `beginTurn`, after `emit()` (:1330) and before the history push (:1335):

```ts
// WHY (spec §3, MOIM pattern): the model never polls and never forgets a child
// exists — a compact status block rides every turn while specialists are live.
// History-only (no transcript event), so replay and the emit surface are untouched.
// Exactly ONE block lives in history: the previous turn's is removed first
// (external review 2026-08-12 — appending accumulates stale, contradictory
// blocks over a long child run). Accepted cost: removing a mid-history message
// invalidates local KV prefix cache from that point while specialists run.
const statusIdx = this.history.findIndex(
  (m) => typeof m.content === 'string' && m.content.startsWith('<specialists-status>'),
);
if (statusIdx >= 0) this.history.splice(statusIdx, 1);
const status = this.opts.specialistStatus?.();
if (status) this.history.push({ role: 'user', content: `<specialists-status>\n${status}\n</specialists-status>` });
```

Host side, in `wire()`: `specialistStatus: () => this.buildSpecialistStatus(sessionId, cwd)` — one line per non-delivered record from `ledger.listFor` merged with live-map state: `"{title} ({agentType}): running — step {n}, {elapsed}s{, may be stuck — no activity for {m}m when stale}"` / `"{title} ({agentType}): finished — report delivery pending"`; returns `null` when there are no lines (zero cost for non-delegating sessions).
- [ ] **Step 4: Run both files** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): per-turn status block so the parent never polls or forgets"`

### Task 6: Task management surface — `task_id` steer / resume / interrupt

**Files:**
- Modify: `desktop/src/main/harness/tools/task.ts`, `desktop/src/main/harness/tools/types.ts`
- Modify: `desktop/src/main/harness/native-session-host.ts` (new `steerSpecialist`, `interruptSpecialist`, `resumeSpecialist`; `resume()` guard at :1092)
- Test: `desktop/tests/task-tool.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: Task input gains `task_id?: string` and `interrupt?: boolean`. Semantics (documented in the tool description verbatim):
  - `task_id` + child **running** → `prompt` is delivered as a steer at the child's next natural pause; immediate result `Steer delivered to ${title}.`
  - `task_id` + child **finished/interrupted** → the child session resumes (cold state rebuilt from its own JSONL) with `prompt` as its next brief; foreground/background per `background`.
  - `task_id` + `interrupt: true` → child canceled; typed result naming what it was doing.
  - Any `task_id` not belonging to this parent → `Refused: that task_id does not belong to a specialist of this session.` (own-children-only, spec §5).
  - Host methods: `steerSpecialist(parentId, childId, text): 'ok' | 'not-yours' | 'not-running'` (a live-but-between-iterations miss records to `missedSteers` on the ledger and returns `'ok'` — the steer drains into the next boundary or the completion record); `interruptSpecialist(parentId, childId): same-union`; `resumeSpecialist(parentId, opts: { childId; prompt; background; reservation })` reusing `runDelegation` against a re-built child (header read → registry re-resolve of `agentType`, unknown id → typed error naming it → cold wiring identical to `createChild` minus the header create, `seedHistory(rebuildHistory(store.readEvents(childId, workDir)))`).
  - `NativeSessionHost.resume()` (:1092) gains the guard: headers with `sessionKind === 'specialist'` return `false` — a specialist child can never be resumed as a root session (it would get the preset's prompt, no `isSpecialistChild`, and could re-acquire the Task tool). `resumeSpecialist` is the only door back in.

- [ ] **Step 1: Write the failing tests** — `task-tool.test.ts`: steer-running happy path; resume-finished happy path (report from the resumed run returns as the tool result); interrupt typed result; foreign `task_id` refused; `task_id` refers to a child of a DIFFERENT parent → refused (build two parents). `native-session-host.test.ts`: `it('resume() refuses a specialist header — children re-enter only through resumeSpecialist', ...)` and `it('a steer posted between child iterations lands in missedSteers and is prepended to the resumed brief', ...)`.
- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** host methods + the `task.ts` dispatch (order: `task_id` branch before the spawn path; `interrupt` before steer/resume; resume path requires a fresh reservation exactly like a new spawn — a resumed Worker re-takes the writer lock). `steerSpecialist` calls `entry.session.postSteer(text)`; `false` → ledger `missedSteers` push. `resumeSpecialist` prepends drained `missedSteers` to the brief as `<steer>` lines and clears them.
- [ ] **Step 4: Run** both files → PASS, plus `npx vitest run tests/specialist-run.test.ts`.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): task_id management — steer running children, resume finished ones, typed interrupt"`

### Task 7: Heartbeat staleness — flags, never kills

**Files:**
- Modify: `desktop/src/main/harness/specialists/limits.ts` (constants), `desktop/src/main/harness/native-session-host.ts` (`runSpecialist` listener :355-384)
- Test: `desktop/tests/specialist-run.test.ts`

**Interfaces:**
- Consumes: the child's transcript-event stream (the harness watchdog's text-less `assistant-thinking` heartbeats flow through it — `session-store.ts:93-95` drops them from disk but the emitter still fires, so an open model request refreshes activity for free; slow local prefill is never flagged, per spec).
- Produces: `SPECIALIST_IDLE_STALE_MS = 120_000` and `SPECIALIST_IN_TOOL_STALE_MS = 300_000` in `limits.ts`; a per-child `lastActivityAt` + unresolved-tool tracking in the `runSpecialist` listener; a periodic check (one `setInterval` per running child, cleared in the listener's `finally`) that sets `stale: true` on the ledger and flips it back on the next event. **No kill path exists** — staleness surfaces in the Task 5 status block ("may be stuck — no activity for {m}m") and the ledger; the user's interrupt (1c) and the model's `interrupt: true` (Task 6) are the only actions.

- [ ] **Step 1: Write the failing test** (vitest fake timers):

```ts
it('a silent child is flagged stale after the idle threshold and unflagged by its next event', async () => { ... });
it('watchdog heartbeat events (text-less assistant-thinking) count as activity — an open model request is never stale', async () => { ... });
it('an unresolved tool call uses the longer in-tool threshold', async () => { ... });
it('staleness never interrupts, kills, or fails the child', async () => { /* child completes normally after being stale */ });
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** in the `runSpecialist` listener: every event updates `lastActivityAt`; `tool-use` pushes to an `openTools` set, `tool-result` clears it; the interval picks the threshold by `openTools.size > 0` and writes the ledger flag only on transitions (not every tick). WHY comment: "spec §3 — liveness is heartbeat-based, not wall-clock; no default child timeout; flags inform the status block and the card, never the abort controller."
- [ ] **Step 4: Run the file** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): heartbeat staleness flags (idle + in-tool), never wall-clock kills"`

### Task 8: Child asks route to the parent — with the 5-minute redirect

**Files:**
- Modify: `desktop/src/main/harness/permission-broker.ts` (`AskRequest` :14-28, `AskDecision` :29-37, `ask` :42-63, `respond` :66-90, `cancelSession` :92-97)
- Modify: `desktop/src/main/harness/specialists/child-permissions.ts` (branch 5, :85-100)
- Delete: `desktop/src/main/harness/specialists/child-ask-policy.ts` → Replace with: `desktop/src/main/harness/specialists/child-ask-router.ts`
- Modify: `desktop/src/main/harness/harness-session.ts` (:1940 ask-deny copy honors `d.message`)
- Modify: `desktop/src/main/harness/native-session-host.ts` (`createChild` :999 wires the router; late-answer handling)
- Test: Replace `desktop/tests/specialist-child-ask-policy.test.ts` with `desktop/tests/specialist-child-ask-router.test.ts`; extend `desktop/tests/native-permission-broker.test.ts`, `desktop/tests/specialist-child-permissions.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Consumes: Task 3's `postSteer` (late-approval steer), Task 4's delivery queue (late approval when the child already ended).
- Produces:
  - `AskDecision` gains `message?: string` — model-facing copy carried through ask-path denials; `harness-session.ts:1940` becomes `return { text: d.message ?? 'The user declined this action. …', isError: true }` (the 1a handoff item: the auto-deny no longer blames the user — real declines keep the old copy, timeouts carry the redirect).
  - `AskRequest` gains `raisedBy?: string` (the child session id) and `specialist?: { childId: string; agentType: string; title: string }` (rides the hook-event payload so the existing permission card can label it and 1c can nest it). `PermissionBroker.ask` gains `opts?: { timeoutMs?: number; onTimeout?: () => AskDecision }` — on timeout the promise resolves with `onTimeout()` but the entry **stays pending** (`timedOut: true`); a later `respond()` on a timed-out entry invokes the broker's new `onLateResponse` callback instead of resolving. `cancelSession(id)` matches `entry.sessionId === id || entry.raisedBy === id` (parent interrupt cancels the routed ask; child destroy cancels it too).
  - `childAskRouter(deps): HarnessSessionOpts['askUser']` — routes `max_steps`, `doom_loop`, and decide-originated asks to the broker **under the parent's sessionId** with the specialist payload and the 5-minute timeout; `interactive` and `external`-forced asks keep the instant deny (neither should reach a specialist; the deny message says so factually).
  - `buildChildDecide` branch 5 (deny-listed ask, :85-100) returns the parent's `ask` unchanged instead of hard-denying — the router now carries it to a real user. The 1a pinned test flips accordingly ("deny-listed ask inside a granted envelope ROUTES to the parent and is denied only by timeout").
  - `SPECIALIST_ASK_HOLD_MS = 300_000` in `limits.ts`, overridable via the host constructor for tests.
  - **The redirect message (pinned verbatim — both load-bearing clauses):**

```ts
export const ASK_REDIRECT_MESSAGE =
  'This action needs the user\'s direct approval, and the user has not responded yet — ' +
  'the request is still pending on their screen. Continue any assigned work that does NOT ' +
  'depend on the blocked action. Do NOT attempt the blocked action by any other means or ' +
  'work around it. Do NOT build further work on the assumption it will be approved. ' +
  'If everything left depends on it, write up your progress so far and finish with your report.';
```

  - Late answers: `onLateResponse(entry, decision)` in the host — child still live → `postSteer('The user has now responded to your earlier blocked request (' + toolName + '): ' + (allowed ? 'APPROVED — you may do it now.' : 'DENIED — do not attempt it.'))`; child ended → a Task-4 delivery notice to the parent (`[Specialist follow-up] The user ${allowed ? 'approved' : 'denied'} ${title}'s blocked ${toolName} request after the specialist finished. Use task_id ${childId} to continue that work if needed.`) plus, on approval, the decision recorded into the child's session-scoped grants so a `task_id` resume does not re-ask.

- [ ] **Step 1: Write the failing tests** in `specialist-child-ask-router.test.ts`:

```ts
it('a routed ask reaches the broker under the PARENT sessionId with the specialist payload', ...);
it('after SPECIALIST_ASK_HOLD_MS the child receives the redirect deny and the entry stays answerable', ...);
it('the redirect wording contains both load-bearing clauses', () => {
  expect(ASK_REDIRECT_MESSAGE).toMatch(/Do NOT attempt the blocked action by any other means/);
  expect(ASK_REDIRECT_MESSAGE).toMatch(/Do NOT build further work on the assumption/);
});
it('a real user deny inside the window carries no redirect — the plain declined copy stands', ...);
it('a late APPROVE while the child runs arrives as a steer naming the tool', ...);
it('a late APPROVE after the child ended queues a parent delivery naming task_id', ...);
it('interactive asks still deny instantly with factual copy', ...);
it('destroy(childId) cancels a routed ask registered under the parent id (raisedBy match)', ...);
```

Plus the flipped branch-5 case in `specialist-child-permissions.test.ts` and broker timeout/late-respond cases in `native-permission-broker.test.ts` (fake timers).
- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement broker changes** (timer per entry, cleared on respond/cancel; `timedOut` flag; `onLateResponse` setter). **Step 4: Implement the router + wire it** in `createChild` (:999) with parent id, specialist meta, and the host's late-answer deps. **Step 5: Flip branch 5** in `child-permissions.ts` with the WHY comment updated to name the router. **Step 6: `harness-session.ts:1940`** honors `d.message`.
- [ ] **Step 7: Run** all five touched test files → PASS; run `npx vitest run tests/permission-engine.test.ts tests/harness-session-loop.test.ts` (regression on the decide path).
- [ ] **Step 8: Commit** — `git commit -m "feat(specialists): child asks route to the parent's card with the 5-minute away redirect"`

### Task 9: Restart recovery + subagent-card replay

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` (`resume()` :1092-1163, `getHistory` :1435-1439)
- Test: `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Consumes: Task 2's ledger (`owner`, `delivered`, `parentToolCallId`), Task 4's delivery queue.
- Produces:
  - **Reconcile on parent resume:** inside `resume()`, after the store read succeeds: `reconcileDelegations(sessionId, cwd)` — for each ledger record: `status === 'running' && !isOwnerAlive(owner)` → `update({ status: 'interrupted', endedAt: Date.now() })` (marked **honestly**, per spec — the child is an ordinary resumable session via `task_id`); records holding a `claimedBy` lease whose owner fails `isOwnerAlive` → `releaseClaim` first (the crash-between-claim-and-injection gap — external review 2026-08-12); then `status === 'completed' && !delivered` → `queueDelivery(sessionId)` so the report lands at the first idle boundary after resume.
  - **Card replay:** `getHistory(sessionId)` merges children: for each ledger record, read `store.readEvents(childId, workDir)`, filter to `SUBAGENT_DISPLAY_TYPES`, stamp each with `sessionId: parentId, data: { ...data, parentAgentToolUseId, agentId: childId }` (identical to the live stamp at :1072-1076), and splice the block **immediately after** the parent event whose `data.toolUseId === parentToolCallId` (the reducer bails if the parent Task card hasn't been seen yet — ordering is load-bearing, `chat-reducer.ts:222-223`). A record whose Task tool-use isn't found in the parent stream is skipped defensively (WHY comment: a crash between child-create and parent-append).

- [ ] **Step 1: Write the failing tests:**

```ts
it('resuming a parent marks dead-owner running children as interrupted, honestly', async () => { ... });
it('an undelivered background report from before the restart is delivered at the first idle boundary', async () => { ... });
it('a report CLAIMED by a dead instance but never confirmed is re-delivered after restart', async () => {
  // ledger record: completed, delivered: false, claimedBy: { pid: 999999, instanceId: 'gone' };
  // resume the parent → expect the injected user-message to arrive once, and the record to end confirmed.
});
it('getHistory splices stamped child events immediately after the parent Task tool-use', async () => {
  // run a foreground specialist to completion; destroy and resume the parent;
  // const events = host.getHistory(parentId)!;
  // const taskIdx = events.findIndex(e => e.type === 'tool-use' && e.data.toolName === 'Task');
  // expect(events[taskIdx + 1].data.parentAgentToolUseId).toBe(events[taskIdx].data.toolUseId);
  // expect(events.filter(e => e.data.agentId).every(e => SUBAGENT_DISPLAY_TYPES-only)).toBe(true);
});
it('replayed stamped events preserve partId so the reducer coalesces deltas identically', async () => { ... });
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `reconcileDelegations` + the `getHistory` merge (pure function `mergeChildEvents(parentEvents, children: Array<{record, events}>)` exported for direct testing). The child's original `uuid`s are kept — `sa-text-${uuid}` / `sa-tool-${toolUseId}` segment ids dedupe naturally on re-replay.
- [ ] **Step 4: Run** `npx vitest run tests/native-session-host.test.ts tests/transcript-reducer.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): restart recovery — honest interrupted marks, report re-delivery, card replay"`

### Task 10: Report overflow spills to a file

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` (`formatSpecialistReport` :448-483), `desktop/src/main/native-home.ts` (spill write helper), `desktop/src/main/harness/harness-session.ts` (path-guard exemption)
- Test: `desktop/tests/specialist-run.test.ts`, `desktop/tests/native-home.test.ts`

**Interfaces:**
- Produces: when `truncateOutput` cuts the body, the FULL body is written to `sessions/<slug>/<childId>.report.md` (`NativeHome.writeSessionArtifact(slug, name, text): string` — plain overwrite write, returns the absolute path; not lock-guarded, single-writer like session JSONLs) and the footer becomes:
  `[Truncated to fit. Full report saved to: <absolute path> — Read it if you need the rest.]`
  replacing 1a's unopenable `[full transcript: specialist session <id>]` pointer on the truncated path (the untruncated footer keeps a shortened `[specialist session <id>]` tag for 1c's card linking).
- **Path-guard exemption:** the parent session's `checkPathGuard` treats its own spill directory as internal — `HarnessSessionOpts.internalReadRoots?: string[]`, consulted before the external-directory branch (`harness-session.ts:1913-1917`), wired by the host to the session's spill dir only. WHY: the spec's telephone-game mitigation ("summary + paths, not compressed prose") only works if the parent can actually Read the path without an external-dir ask in ask-mode.

- [ ] **Step 1: Write the failing tests** — spill file written with full body on truncation + footer names the real path; no spill file when the report fits; `internalReadRoots` lets the parent Read the spill path without an ask while a sibling external path still asks.
- [ ] **Step 2: Run to verify failure** → FAIL. **Step 3: Implement** (spill in `formatSpecialistReport` at delivery time; when Task 4's completion handler already spilled an oversized background body, delivery re-reads the FULL body from `reportPath` and does not re-write the file; ledger records `reportPath` either way). **Step 4: Run** the three touched files → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): oversized reports spill to a readable file with a pointer footer"`

### Task 11: Permission store v2 — specialist-keyed grants + consent-key canonicalization

**Files:**
- Modify: `desktop/src/shared/permission-types.ts` (`StoredRule` :20-23), `desktop/src/main/harness/permission-store.ts` (whole file — first-ever version branch), `desktop/src/main/harness/native-session-host.ts` (`buildDecide` :677-692, remember listener :815-830, in-memory filter :653-655), `desktop/src/main/harness/specialists/child-ask-router.ts` (Always-allow persistence), `desktop/src/renderer/components/permissions/describe-rule.ts`, `desktop/src/renderer/components/PermissionsSection.tsx` (`ruleKey` :284, `toPermissionRule` :291), `desktop/src/main/harness/tools/task.ts` (`permissionSubject` :78-81)
- Test: `desktop/tests/permission-store.test.ts`, `desktop/tests/describe-rule.test.ts`, `desktop/tests/permissions-section.test.tsx`, `desktop/tests/task-tool.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Produces:
  - `StoredRule` gains `specialist?: string` (the agentType; absent = the root session's own grant). Rule identity becomes the quad `(tool, pattern, action, specialist)` at ALL four sites the rule `native-permissions.md` names: store dedupe (`permission-store.ts:59-61`), store `remove` matcher, host in-memory `rememberedFor` filter, UI `ruleKey`. `toPermissionRule` keeps `specialist` (the remove matcher needs it).
  - `PermFile` becomes `{ v: 2, projects: ... }`; the reader accepts BOTH (`v:1` entries are valid v2 — `specialist` is simply absent), every write emits `v: 2`. A test pins that a v1 file on disk round-trips unchanged except the version stamp.
  - **Scoping:** `buildDecide` gains `opts?: { specialistScope?: string }` — remembered rules are filtered to `r.specialist === undefined` for root sessions and `r.specialist === undefined || r.specialist === scope` for a child's parent-decide (parent denials still flow; a specialist-keyed allow never leaks to the root session or a different specialist). `createChild` (:989-994) passes `specialistScope: opts.specialist.id`.
  - **Source of the grants:** an "Always allow" on a routed child ask (Task 8) persists `{ tool, pattern: subject, action: 'allow', specialist: agentType }` via the router (children are not `wire()`d, so the router — not the remember-rule listener — writes it, against the PARENT's cwd).
  - `describe-rule.ts`: rules with `specialist` render `verb: 'Let the ${specialist} specialist ${...}'` reusing the existing tool verbs; `PermissionsSection` shows them in the existing kind groups (revocation renders the specialist key, per spec §5).
  - **Consent-key canonicalization** (ROADMAP fold-in): `permissionSubject` in `task.ts` canonicalizes `work_dir` (`path.resolve` + separator normalization, mirroring `createChild`'s own canonicalize at :933-936) so `.`, `./x`, and the absolute form produce ONE remembered key instead of three.

- [ ] **Step 1: Write the failing tests** (per site: quad-identity dedupe; v1 read-compat; scope filtering — a specialist-keyed allow is invisible to the root and to other agentTypes; router persistence on always-allow; describe-rule verb; `ruleKey` uniqueness; canonicalized Task subject: `permissionSubject({work_dir: '.'})` === `permissionSubject({work_dir: process.cwd()})`).
- [ ] **Step 2: Run to verify failure** → FAIL. **Step 3-4: Implement store + engine scoping. Step 5: Implement UI + router persistence.**
- [ ] **Step 6: Run** all five test files plus `npx vitest run tests/permission-engine.test.ts tests/ipc-channels.test.ts` → PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(permissions): store v2 — specialist-keyed grants, both-version reader, canonical Task consent keys"`

### Task 12: Weak-model hardening, spawn budget, compaction-finalize

**Files:**
- Modify: `desktop/src/main/harness/harness-session.ts` (tool-arg validation seam — locate with `rg -n 'safeParse' desktop/src/main/harness/harness-session.ts`), `desktop/src/main/harness/tools/task.ts`, `desktop/src/main/harness/specialists/limits.ts`, `desktop/src/main/harness/native-session-host.ts` (`runSpecialist` listener)
- Test: `desktop/tests/harness-sdk-toolcall-contract.test.ts`, `desktop/tests/task-tool.test.ts`, `desktop/tests/specialist-run.test.ts`

**Interfaces:**
- Produces three independent behaviors:
  1. **JSON-string arg recovery** (all tools, at the validation seam): when raw tool input is a single string that `JSON.parse`s to an object, re-validate the parsed object before failing — one attempt, then the normal arg error. WHY: weak local models emit `"{\"prompt\": ...}"` as a string; spec §3 hardening.
  2. **Placeholder prompt rejection** in `task.ts` (after the 40-char floor): `const PLACEHOLDER_RE = /^(?:todo|tbd|task ?\d*|fixme|<[^>]*>|\{\{[^}]*\}\}|\.{3}|xxx+)[.!]?$/i;` tested against the **whole trimmed prompt only** — no per-line scanning (external review 2026-08-12 flagged the false-positive risk of the per-line variant; the whole-prompt narrow form is exactly what spec §3 mandates: *"reject placeholder prompts (TODO, 'task 1', unexpanded template markers — narrow regex)"* — this is an observed weak-model failure in the platform research, not speculation, and the 40-char floor alone misses padded markers like `{{TASK_DESCRIPTION_GOES_HERE_PLEASE_FILL}}`). Refusal copy: `That prompt looks like an unexpanded placeholder. Write the actual self-contained brief: what to do, relevant paths, what "done" looks like.` Test with a 45-char real sentence to pin the false-positive boundary.
  3. **Per-conversation spawn budget:** `SPECIALIST_SPAWN_BUDGET_PER_SESSION = 30` in `limits.ts`; a per-parent lifetime counter (in-memory, host) checked in the Task execute path → `Refused: this conversation has reached its specialist budget (${n}). This is a runaway guard — the user can start a fresh conversation to continue delegating.`
  4. **Compaction-finalize:** in the `runSpecialist` listener, count `compact-summary` events with `data.autoCompaction`; on the second, `postSteer('You are running low on room even after summarizing. Stop new exploration — write up what you have and finish with your report now.')` — once per child. (Spec §3: a designed path for small local windows, not an edge case.)
- [ ] **Step 1: Write the failing tests** (string-arg recovery round-trip; placeholder rejects + 45-char real prompt passes; 31st spawn refused with the budget copy; second auto-compaction posts exactly one finalize steer).
- [ ] **Step 2: Run to verify failure** → FAIL. **Step 3: Implement all four.** **Step 4: Run** the three files → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): weak-model hardening, spawn budget backstop, compaction-finalize steer"`

### Task 13: Local concurrency from the engine, hosted from the profile

**Files:**
- Modify: `desktop/src/main/harness/capability-profile.ts` (three sites: `CLOUD_DEFAULT` :82-ish, `localFallback` :229, known-model overlay :287-307), `desktop/src/main/harness/native-session-host.ts` (`maxSpecialistsFor` from Task 1), `desktop/src/main/harness/tools/task.ts` (at-capacity copy reads the live max)
- Test: `desktop/tests/capability-profile.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Produces: `CapabilityProfile.maxConcurrentSpecialists: number` — `CLOUD_DEFAULT: 4` (the spec's hosted constant), `localFallback: 1` (conservative: unknown local model, unknown slot behavior), known-local overlay: `Math.max(1, Math.min(4, totalSlots))` where `totalSlots` comes from the same `/props` read that already supplies the real context window (the 2026-08-12 probe measured n_slots=4 batching at ~1.7-1.85× single-request latency on the dev build — `youcoded/docs/engine-dependencies.md` § Parallel slots; the value is READ from the engine at runtime, never copied, per spec §3). If `/props` lacks a slot count on some build, the overlay falls back to 1 with a WHY comment. `maxSpecialistsFor(parentId)` resolves the parent's live profile snapshot; the at-capacity refusal interpolates the resolved number. **No engine-supervisor arg change** — the probe found the build already serves 4 slots by default; record-don't-edit stands (re-verify the recorded finding in `engine-dependencies.md` before implementing; if that doc says `--parallel` IS needed, add it to the inline arg array at `engine-supervisor.ts:287-305` with the probe citation instead).
- [ ] **Step 1: Write the failing tests** (three-layer derivation incl. the clamp and the missing-slot-count fallback; host cap follows the profile; refusal copy shows the profile number).
- [ ] **Step 2: Run to verify failure** → FAIL. **Step 3: Implement** (tsc will point at exactly the three profile sites). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): concurrency cap from the capability profile — engine-measured locally, 4 hosted"`

### Task 14: Delegated model tiers — budget & frontier + user-directed override (Destin's ruling, 2026-08-12)

**Ruling (replaces the spec's original 'cheap/strongest' vocabulary):** two user-designated tiers, **budget** and **frontier**, each set to a concrete model in a Settings menu (the menu itself is 1c; this task ships the storage and resolution). **No automatic price-based selection anywhere.** The orchestrating model gets a catalog-search tool and may name a specific model per hire — but only at the user's direction.

**Files:**
- Create: `desktop/src/main/harness/specialists/delegated-models.ts`
- Create: `desktop/src/main/harness/tools/model-search.ts`
- Modify: `desktop/src/main/harness/specialists/registry.ts:15` (`modelPreference?: 'parent' | 'budget' | 'frontier'` — the field is declared-but-never-read on master, so the union rename is free), `desktop/src/main/harness/native-session-host.ts` (`createChild` :941-943 binding selection), `desktop/src/main/harness/tools/task.ts` (new `model` input + resolution + fallback note in the ack text), `desktop/src/main/harness/harness-session.ts` (`syncTaskTool` :649 attaches ModelSearch under the same `canDelegate && !isSpecialistChild` gate), `desktop/src/shared/harness-manifest.ts` (`CONDITIONAL_TOOL_NAMES` gains `'ModelSearch'`), `desktop/src/shared/permission-types.ts` (ModelSearch joins the always-allowed baseline — it reads public catalog metadata, nothing else)
- Test: Create `desktop/tests/specialist-delegated-models.test.ts` and `desktop/tests/model-search-tool.test.ts`; extend `desktop/tests/task-tool.test.ts`, `desktop/tests/harness-session-loop.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Produces:

```ts
// delegated-models.ts
export type DelegatedTier = 'budget' | 'frontier';
// File: ~/.youcoded/delegated-models.json — { v: 1, budget?: ModelBinding, frontier?: ModelBinding }
export class DelegatedModels {
  constructor(private home: NativeHome) {}
  get(tier: DelegatedTier): ModelBinding | null;                          // readJson, null when unset
  async set(tier: DelegatedTier, binding: ModelBinding | null): Promise<void>; // mutateJson; 1c's Settings UI calls this via its own IPC
}
export function resolveDelegatedBinding(i: {
  requested: 'parent' | DelegatedTier | { modelId: string };  // Task-call arg wins over the definition's modelPreference, which wins over 'parent'
  parent: ModelBinding;
  designated: DelegatedModels;
  catalog: CatalogModel[] | null;                             // for specific-id validation only
}): { binding: ModelBinding; fellBack: boolean; reason?: string }
```

  - Tier semantics: `budget`/`frontier` → the user's designated binding, else **parent + `fellBack: true`** with `reason: 'no budget model is set in Settings'` (or frontier). `parent` → parent. A specific `{ modelId }` that isn't in the live catalog for a cloud provider **refuses the Task call** (typed: `Refused: "${id}" is not an available model. Use ModelSearch to find the exact id, or use "budget"/"frontier".`) — a user-directed override is never silently substituted, unlike tiers, which degrade gracefully. Never provider-specific params across families (spec §2 Goose hygiene). `createChild` retains the RESOLVED model via the existing `modelRefs` ref-counting; the child header records the resolved binding.
  - Task input gains `model?: string`, described verbatim: `Optional: "budget" or "frontier" to use the models the user designated in Settings, or a specific model id — only name a specific model when the user asked for it. Omit to run the specialist on this conversation's model.` When a tier fell back, the launch/ack text appends one honest line: `(No ${tier} model is set in Settings — using this conversation's model.)`
  - **ModelSearch tool** (`model-search.ts`, `defineTool`): input `{ query: string }` (min 2 chars); case-insensitive substring match on catalog id + display name; returns up to 20 lines `id — name · in $X/M tok · out $Y/M tok · ctx N`, sorted by prompt price ascending, with a `+N more — narrow the query` footer when capped; no catalog loaded → `Model list is unavailable right now (catalog not loaded). Delegate with "budget"/"frontier" or the conversation's model instead.` Description tells the model this exists to find ids **when the user asks for a specific model**. Read-only, `permissionSubject: undefined`, attached only alongside Task.
  - **Built-ins keep `modelPreference` unset** — the four shipped specialists run on the parent's model until Destin designates tiers and/or flips a definition.

- [ ] **Step 1: Write the failing tests** — `specialist-delegated-models.test.ts`: tier resolves to the designated binding; unset tier → parent + fellBack + reason; `parent` passthrough; unknown specific id → the typed refusal shape; known specific id resolves; set/get round-trip through a temp `NativeHome`; Task-arg beats definition preference beats parent. `model-search-tool.test.ts`: substring match, price sort, 20-cap footer, no-catalog copy, min-query refusal. `task-tool.test.ts`: `model: 'budget'` spawn uses the designated binding; fallback note appears in the ack; refusal on a fake id. `harness-session-loop.test.ts`: ModelSearch attaches and detaches with the same gate as Task.
- [ ] **Step 2: Run to verify failure** → FAIL (modules not found).
- [ ] **Step 3: Implement** `delegated-models.ts` (storage + pure resolver) and `model-search.ts`; **Step 4: wire** `createChild` + `task.ts` + `syncTaskTool` + manifest + baseline.
- [ ] **Step 5: Run** the five test files plus `npx vitest run tests/tool-registry-manifest.test.ts tests/ipc-channels.test.ts` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(specialists): budget/frontier delegated tiers, ModelSearch, per-hire override at user direction"`

### Task 15: Docs, rules, and the remaining 1a handoff pins

**Files:**
- Modify: `.claude/rules/native-specialists.md` (workspace repo — the "A child never reaches a real user ask" bullet is now false; add the ledger, the redirect, store v2; keep ≤600 words, overflow to the depth doc)
- Modify: `youcoded/docs/native-runtime.md` (Specialists section: background/durability/steering paragraphs + anchors)
- Modify: `docs/MAP.md` (workspace — specialists row gains the new files), `ROADMAP.md` (flip the two 1b lines; add the child-GC roadmap item with `#specialists`)
- Modify: `.claude/rules/native-permissions.md` (rule identity is now the quad; store is v2 both-version)
- Test: `desktop/tests/tool-registry-manifest.test.ts` (or wherever `CONDITIONAL_TOOL_NAMES` is pinned), `desktop/tests/specialist-report-budget.test.ts`

**Interfaces:** none — documentation + two leftover pins from the 1a handoff:
- [ ] **Step 1: Manifest pin** — a test asserting `'Task'` in `CONDITIONAL_TOOL_NAMES` (`desktop/src/shared/harness-manifest.ts`) has a real registered implementation (the "manifest says conditional, registry actually builds it" direction the 1a review flagged as unpinned).
- [ ] **Step 2: Arithmetic pin** — `specialist-report-budget.test.ts` gains the window−used case with `concurrentReporters > 1` against the REAL call shape `formatSpecialistReport` now uses at delivery (guards the `window - used` subtraction feeding `parentRemainingTokens`).
- [ ] **Step 3: Quiesce-cascade pin** — `native-session-host.test.ts`: `quiesce(parentId)` destroys running children and their ledger records read `interrupted` (1b reworked the teardown paths; the 1a handoff asked for exactly this test).
- [ ] **Step 4: Update the four docs** (rule bodies stay under budget; every new claim carries a `verify:` anchor per `.claude/rules/README.md`).
- [ ] **Step 5: Run** `bash scripts/verify.sh <worktree>` AND the full suite `npx vitest run` → green.
- [ ] **Step 6: Commit** — `git commit -m "docs(specialists): 1b rules/docs + the three deferred 1a pins"`

---

## Task ordering and parallelization

Dependencies: T4 needs T1+T2; T5 needs T2+T4; T6 needs T1-T4; T7 needs T2; T8 needs T3 (+T4 for late-answer delivery); T9 needs T2+T4; **T10 needs T4** (spill runs in the delivery-time formatter); T11 needs T8; T12 needs T3; **T13 needs T1** (`maxSpecialistsFor`) and lands after T4 (both edit `task.ts`); T14 edits `task.ts` + the host after everything settles (severable if Destin reassigns it); T15 last.
**Wave 1 (parallel):** T1, T2, T3. **Wave 2:** T4, T8 (T8's late-delivery case can stub until T4 merges). **Wave 3 (parallel):** T5, T6, T7, T9, T10, T11, T12, T13. **Wave 4:** T14. **Wave 5:** T15.
(The original wave 1 listed T10/T13/T14 as parallel with T1 — the external review caught T13's undeclared dependency on T1; the same pass here caught T10's on T4. Both moved.)

## Self-review notes (writing-plans checklist, run 2026-08-12)

- Spec coverage: §3 background/injection (T4), MOIM (T5), steering+management (T3/T6), report caps+spill (T10), weak-model hardening (T12), heartbeat (T7), single-writer precise (T1), child failure typed (T2/T4), compaction-finalize (T12), concurrency per provider (T13), spawn budget (T12), restart survival (T9); §5 timeout redirect + routed asks (T8), grant keying v2 (T11); §2 model preference (T14 — per Destin's 2026-08-12 ruling: budget/frontier user-designated tiers, ModelSearch, per-hire override at user direction; replaces the spec's original cheap/strongest auto-resolution, spec amended same day). §6 UX items and §2 definition files are 1c per the sequence line; §4/stage two untouched.
- Interpretation flagged for Destin's review: spec §5 says a late approval on a FINISHED child is "delivered as a resume" — T8 delivers it as a parent notice naming `task_id` (parent-in-the-loop) rather than auto-resuming the child, because an auto-resume spends tokens with no model or user in the loop. Overrule at review if the literal reading is preferred.
- Type consistency pass done: `SpecialistReservation` (T1) is the shape T4/T6 consume; `DelegationRecord` fields referenced by T5/T7/T9 all exist in T2's interface; `postSteer` signature identical in T3/T6/T8/T12.

## External review responses (2026-08-12, second-session review)

**Accepted and folded in:** delivery claims are now LEASES — claim ≠ delivered, `confirmDelivered` runs only after the injected turn, and Task 9's reconcile releases dead-owner leases, closing the crash-between-claim-and-injection report loss (T2/T4/T9). Parent Stop no longer kills background children — the `interrupt` cascade is foreground-only; `destroy`/`quiesce` still take everything down (T2). Oversized background reports spill their FULL body at completion, so the spill file's "full report" footer is true (T4/T10). The MOIM block replaces its predecessor instead of accumulating — the local KV prefix-cache invalidation this causes while specialists run is a stated, accepted cost (T5). `isOwnerAlive` drops the `/proc` start-time comparison (jiffies-vs-epoch conversion is fiddly and would false-fire or never fire) for an instance-UUID fast path + pid probe; the residual PID-reuse risk is visible-and-interruptible, never lossy (T2). Waves reordered — T13 after T1/T4, T14 isolated in its own wave; the same pass caught T10's undeclared dependency on T4. `drainUnappliedSteers` added — the reviewer's `abort !== null` verification question surfaced a real gap (a steer posted during the child's final step returned `true` but never landed); the invariant itself checks out (:1338 / :1550-1552 bracket the turn exactly) (T3).

**Pushed back:** **Task 14 stays in 1b.** The reviewer read it as bolted-on scope, but it is Destin's explicit 2026-08-12 ruling from this session, and it is not inert without 1c — the per-hire `model` override and ModelSearch work immediately in conversation; only the tier *pickers* wait for 1c's Settings menu. The severability and merge-collision points were valid: it now runs as its own wave and remains cleanly cuttable if Destin reassigns it. **Placeholder rejection stays** — spec §3 mandates it verbatim and it is an observed weak-model failure in the platform research, not speculation; the implementation is simplified to a whole-prompt-only narrow regex per the reviewer's legitimate false-positive concern (T12).

**Stated explicitly (previously implied):** steers and status blocks are history-only. A steer the child ACTED on is not recorded in the child's JSONL, so `resumeSpecialist`'s rebuilt history omits it and 1c's card cannot show a steer trail; `missedSteers` covers un-applied steers only. Accepted for 1b. If 1c wants a visible steer trail, persist steers as `user-message` events in the child's JSONL then — they are already excluded from `SUBAGENT_DISPLAY_TYPES`, so nothing would leak to the parent card.
