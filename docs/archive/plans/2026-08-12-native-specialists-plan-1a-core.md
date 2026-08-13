---
status: shipped
date: 2026-08-12
revised: 2026-08-12 (external review 2 — child ask policy, real permission types, Agent-card rendering, Skill/MCP suppression, fixture corrections, scope decisions)
spec: docs/active/specs/2026-08-11-native-specialists-design.md
repos: [youcoded]
sequence: plan 1a of 3 for spec stage one (1b = background/durability/steering/timeout-redirect; 1c = definitions folder/CC mapping/chat UI)
---

# Native Specialists Plan 1a — Core (foreground specialist end-to-end)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native session's model can call a `Task` tool that spawns a child session ("specialist") with cold-start context and charter-capped permissions, runs it in the foreground, streams its activity into the existing subagent chat UI, and receives a headroom-capped report — with the two local-engine probes measured first so concurrency and KV defaults are facts, not guesses.

**Architecture:** A specialist is an ordinary `HarnessSession` child: additive header fields mark parentage; `NativeSessionHost.createChild` builds its own wiring (it deliberately does NOT reuse `wire()` — see Task 5) with a specialist-resolved system prompt and a restricted tool/permission set; child transcript events persist under the child's own id but display copies of exactly the three subagent-consumed event types are re-emitted under the **parent's** id stamped with `parentAgentToolUseId`/`agentId`, landing in the existing `applySubagentEvent` renderer path (frozen emit surface honored — no new event types).

**Tech Stack:** TypeScript (Electron main), vitest, existing harness seams (`defineTool`, `PermissionBroker`, `CapabilityProfile`, `SessionStore`), llama-server for probes.

## Global Constraints

- **Worktree:** all work in the `youcoded` repo on branch `feat/native-specialists-core` in a dedicated worktree (superpowers:using-git-worktrees). Desktop only; Android untouched.
- **⚠ Permission-seam sequencing:** four in-flight worktrees touch the decide/ask seams this plan modifies — `perm-timeout` (feat/permission-ask-timeout), `perm-backend` (feat/native-permissions-backend), `native-permissions` (feat/native-permissions-ui), `perm-external` (fix/native-external-always-allow). **Before starting Tasks 5–6, check which have merged (`git log origin/master --oneline -20`) and rebase this worktree after each lands.** The `message?` field added to `PermissionDecision` (Task 5) and the ask-path behavior (Task 5.5) are exactly where those branches operate; a blind merge here will conflict on the most delicate part of the design. Note also: the spec §5 timeout-redirect mechanism ("deny messages land verbatim in the tool result") ships with `perm-timeout`, not this plan — nothing in 1a depends on it.
- **Frozen emit surface** (`.claude/rules/native-runtime.md`): child/display events use ONLY existing `TranscriptEventType` values; parent linkage rides `data.parentAgentToolUseId` + `data.agentId` (already typed at `src/shared/types.ts:200,202`). No new event types, no new IPC channels in this plan.
- **Injection is messages, never a prompt edit** — the child's system prompt is assembled ONCE at spawn; anything later arrives as messages. `prompt-assembly.ts` stays byte-stable per session.
- **Tool-call/result pairing everywhere:** a Task call that fails, is refused, or is interrupted MUST still resolve its tool result (typed error text), or the parent session bricks on real providers.
- **Children get NO Skill catalog and NO MCP tools** (spec §1 cold-start contract). Both attach dynamically inside `HarnessSession` (`syncSkillTool` falls back to `createSkillCatalog()` when no catalog is passed; MCP tools sync per-turn from the lease), so `createChild` must actively suppress both — see Task 5 step 7.
- **Scope decisions (pinned here, not accidental):** the specialist slot cap and the single-writer lock are both **per-parent-session**, not host-global — a Worker in conversation A must not block a Worker in conversation B. Local-engine capacity is a separate global constraint that arrives with background fan-out in plan 1b (1a's foreground flow runs one child at a time anyway).
- **Every non-trivial edit carries a WHY comment** (Destin is a non-developer).
- **Error copy:** specific-and-accurate or general-non-committal per `docs/error-message-standards.md`; never a guessed cause.
- **Verification:** `bash scripts/verify.sh <worktree>` green before any "done" claim. Report truncation is **text-only in 1a**; overflow-to-file spill is plan 1b (so no spill-path platform concerns exist in this plan).
- **Spec values (verbatim):** hosted concurrency default **4** (per parent); local concurrency derived from probe 1; depth 1 by toolset omission; report retry budget **1** (implemented in Task 7 step 5); children never in top-level lists; the model-facing tool is named **`Task`**; user copy says **"specialists"**.
- **Read before you edit:** each task names its anchor symbols. `harness-session.ts` is ~1,900 lines and `ipc-handlers.ts` ~4,100 — read ONLY the named symbol ranges (Serena `find_symbol` or the line anchors given), never the whole file. Line anchors were verified 2026-08-12 but the four permission worktrees may shift them — re-locate by symbol name if a range looks wrong.

## Deferred-item ledger (spec items deliberately NOT in this plan)

| Spec item | Home |
|---|---|
| Report overflow → file spill with pointer | 1b (1a truncates text-only with a notice) |
| Weak-model hardening beyond trivial-prompt rejection (JSON-string arg recovery, placeholder detection) | 1b — moot in 1a because `canDelegate: false` excludes the simplified tier entirely |
| Per-conversation spawn budget | 1b |
| Child compaction-finalize | 1b |
| Background execution, MOIM ledger, steering, heartbeat staleness, durable restart recovery, timeout redirect, grant-keying store v2 | 1b |
| Subagent card replay after app restart (card is EMPTY on reload in 1a — child events live only in the child's file; the report text survives in the parent's Task tool result) | 1b durability owns the fix; Task 8 documents the tradeoff |
| Charter text on a dedicated launch card | 1c — in 1a the envelope ask is the generic permission card showing the raw Task input (which includes `agent` and `work_dir`); Task 6 puts the charter into the tool result copy but the pretty card is 1c |
| Subagent assistant-thinking routing | 1c (renderer work, rides the cards task) |
| Definitions-as-files folder + CC mapping table | 1c |

---

### Task 1: Probe — llama-server parallel capacity

**Files:**
- Create: `desktop/test-engine/probe-parallel.mjs`
- Modify: `youcoded/docs/engine-dependencies.md` (append a "Parallel slots (specialists)" section with measured results)

**Interfaces:**
- Produces: a recorded decision — `LOCAL_MAX_CONCURRENT_SPECIALISTS` value and the `--parallel`/`-np` flag choice — consumed by plan 1b's local fan-out defaults (1a hosted default stays 4 per parent).

This is a dev-run probe following the `desktop/test-engine/probe-tools.mjs` convention: **probe-tools does NOT spawn a server — it runs against a live llama-server and takes a base URL argv** (read its header). Two acceptable shapes; pick one:
- (a) Same convention: `node desktop/test-engine/probe-parallel.mjs <baseURL> <modelId>` against a manually-launched server, documenting the launch command (including the `--parallel N` variant) in the script header.
- (b) Self-spawning: copy the spawn invocation from `src/main/engine/engine-supervisor.ts:285-306` (the real binary + arg list) and add `--parallel N`. More setup, fully reproducible.

No unit tests; the deliverable is measured numbers in the doc.

- [ ] **Step 1: Write the probe script.** For N in {1, 2, 4}: fire N simultaneous short chat completions at one small model, record wall-clock per request and total, and classify: serialized (total ≈ N×single) vs batched (total ≈ single + margin). Print a table. ~120 lines.
- [ ] **Step 2: Run it on the dev machine's default small model** — once with the server's default args, once with `--parallel 4`. If `--parallel > 1` errors with the supervisor's arg set, THAT is a finding — record it verbatim.
- [ ] **Step 3: Record results in `engine-dependencies.md`** under `## Parallel slots (specialists, plan 1a probe)`: the table, the chosen `LOCAL_MAX_CONCURRENT_SPECIALISTS` (largest N whose per-request latency ≤ 2× single-request), and whether the supervisor args need `--parallel` added (that supervisor change belongs to plan 1b — record, don't edit it here).
- [ ] **Step 4: Commit** — `git commit -m "probe(engine): measure llama-server parallel capacity for specialists"`

### Task 2: Probe — KV prefix reuse across child spawns

**Files:**
- Create: `desktop/test-engine/probe-prefix-cache.mjs`
- Modify: `youcoded/docs/engine-dependencies.md` (append results to the same section)

**Interfaces:**
- Produces: a recorded yes/no — does a shared system-prompt prefix avoid re-processing across sequential/parallel child-style requests — consumed by Task 4's prompt-assembly ordering decision.

Same convention as Task 1 (base URL argv, live server).

- [ ] **Step 1: Write the probe.** Two runs against one model: (a) two requests sharing an identical 2,000-token system prefix but different user turns, sequential; (b) same with fully distinct prefixes. Read prefill timing from the llama-server response (`timings.prompt_ms` in the completion payload; if absent, wall-clock the time-to-first-token). Reuse is proven if run (a)'s second request prefills materially faster (<50% of (b)'s).
- [ ] **Step 2: Run both cases; print the four prefill timings.**
- [ ] **Step 3: Record verdict in `engine-dependencies.md`:** "prefix reuse survives / does not survive child-style fan-out on build <version>", plus the timings. If it does NOT survive, add the sentence: "specialist prompt-prefix sharing is cosmetic on this build; local fan-out defaults stay conservative (see spec §4 KV-cache discipline)."
- [ ] **Step 4: Commit** — `git commit -m "probe(engine): measure KV prefix reuse for specialist fan-out"`

### Task 3: Store — child-session header fields and list filtering

**Files:**
- Modify: `desktop/src/main/harness/session-store.ts` (interface at :21-35; `list()` — find via `find_symbol SessionStore/list`)
- Test: `desktop/tests/session-store.test.ts` (extend the existing file)

**Interfaces:**
- Produces: `NativeSessionHeader` gains `parentSessionId?: string; sessionKind?: 'root' | 'specialist'; agentType?: string`. `SessionStore.list()` gains an options arg `{ includeChildren?: boolean }` defaulting to false. Task 5 consumes `create()` with these fields; nothing else changes.

The suite's existing fixture style is a `const HEADER: NativeSessionHeader` literal plus an `ev()` event factory (read the top ~45 lines first and match it — there is no `makeHeader` helper; do not invent one). `readHeader`'s signature is `readHeader(sessionId, cwd)` — session id FIRST.

- [ ] **Step 1: Write the failing tests** in `session-store.test.ts`:

```ts
describe('specialist child headers (plan 1a)', () => {
  const CHILD: NativeSessionHeader = {
    ...HEADER, sessionId: 'child-1',
    parentSessionId: 'root-1', sessionKind: 'specialist', agentType: 'explorer',
  };
  it('round-trips the additive child fields through create() and readHeader', async () => {
    await store.create(CHILD);
    const back = store.readHeader('child-1', HEADER.cwd);
    expect(back?.parentSessionId).toBe('root-1');
    expect(back?.agentType).toBe('explorer');
  });
  it('list() hides specialist children by default and includes them on request', async () => {
    await store.create({ ...HEADER, sessionId: 'root-1' });
    await store.create(CHILD);
    const defaults = await store.list();
    expect(defaults.map(e => e.sessionId)).toEqual(['root-1']);
    const all = await store.list({ includeChildren: true });
    expect(all.map(e => e.sessionId).sort()).toEqual(['child-1', 'root-1']);
  });
  it('a v1 header WITHOUT the new fields still validates (no migration)', async () => {
    await store.create({ ...HEADER, sessionId: 'old-1' });   // exactly the pre-plan-1a field set
    const back = store.readHeader('old-1', HEADER.cwd);
    expect(back?.sessionId).toBe('old-1');
    expect(back?.parentSessionId).toBeUndefined();
    expect(back?.sessionKind).toBeUndefined();
  });
});
```

(Adjust `list()`'s real call shape to the suite's existing list tests — read them first; if `list` takes a cwd/slug argument, thread the options arg after it.)

- [ ] **Step 2: Run to verify failure** — `cd desktop && npx vitest run tests/session-store.test.ts` → the list-filter case FAILS (the round-trip cases may pass already since unknown fields serialize fine — that's expected; keep them as pins).
- [ ] **Step 3: Implement.** Add the three optional fields to `NativeSessionHeader` with a WHY comment ("// Specialists (spec 2026-08-11 §1): children are ordinary sessions marked by parentage; additive so v1 files need no migration"). In `list()`, filter `entry.sessionKind === 'specialist' || entry.parentSessionId` unless `includeChildren` (guard on BOTH fields — a future writer setting only one must not leak a child into the list). Do NOT touch `validateHeader` (it checks only `v` and `sessionId` — that tolerance is the design).
- [ ] **Step 4: Run tests → PASS.** Also run the full store suite: `npx vitest run tests/session-store.test.ts`.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): additive child-session header fields + list filtering"`

### Task 4: Built-in specialist registry (definitions as data, no files yet)

**Files:**
- Create: `desktop/src/main/harness/specialists/registry.ts`
- Create: `desktop/src/main/harness/specialists/builtins.ts`
- Test: `desktop/tests/specialist-registry.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SpecialistDefinition {
  id: string;                       // 'explorer' | 'worker' | 'reviewer' | 'researcher' | future file-based ids
  displayName: string;              // "Explorer"
  description: string;              // one-line, model-facing (Task tool enum docs)
  systemPrompt: string;             // definition body
  allowedTools: string[];           // native tool names; NEVER includes 'Task' (depth-by-omission)
  charter: 'read-only' | 'read-write';  // renders on the launch card; drives permission cap
  modelPreference?: 'parent' | 'cheap' | 'strongest';  // resolution in plan 1b; 1a always uses 'parent'
  stepCap: number;                  // wired to the child's harness.limits.maxSteps (Task 5)
  reportBudgetTokens: number;       // static half of the headroom-aware cap (Task 7)
}
export function resolveSpecialist(id: string): SpecialistDefinition | undefined;
export function listSpecialists(): SpecialistDefinition[];
```

Task 5 consumes `resolveSpecialist`; Task 6 consumes `listSpecialists` for the Task tool's enum.

- [ ] **Step 1: Write the failing tests:**

```ts
it('resolves the four built-ins with coherent charters', () => {
  for (const id of ['explorer', 'worker', 'reviewer', 'researcher']) {
    const d = resolveSpecialist(id);
    expect(d).toBeDefined();
    expect(d!.allowedTools).not.toContain('Task');            // depth-by-omission, spec §1
    expect(d!.allowedTools).not.toContain('TodoWrite');       // noise tool, denied by default
    expect(d!.allowedTools).not.toContain('AskUserQuestion'); // children have no user; an interactive
                                                              // ask from a child would hang (Task 5.5)
  }
  expect(resolveSpecialist('explorer')!.charter).toBe('read-only');
  expect(resolveSpecialist('explorer')!.allowedTools).not.toContain('Write');
  expect(resolveSpecialist('worker')!.charter).toBe('read-write');
  expect(resolveSpecialist('reviewer')!.charter).toBe('read-only');
});
it('returns undefined for unknown ids (caller renders the typed error)', () => {
  expect(resolveSpecialist('nonexistent')).toBeUndefined();
});
```

- [ ] **Step 2: Run → FAIL (module not found).**
- [ ] **Step 3: Implement `builtins.ts`** with the four definitions. Tool lists (names must match `NATIVE_TOOL_NAMES` — import it and add a test asserting every `allowedTools` entry is a member):
  - explorer: `['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']`, stepCap 25, reportBudgetTokens 2000
  - researcher: `['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']`, stepCap 25, reportBudgetTokens 2500 — system prompt differs (sourced summaries, cite URLs)
  - reviewer: `['Read', 'Glob', 'Grep']`, stepCap 20, reportBudgetTokens 2000
  - worker: `['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']`, stepCap 40, reportBudgetTokens 1500
  System prompts: 15-25 lines each; every one ends with the same final-report instruction paragraph ("Your last message is your report to the requester — make it self-contained; include file paths for anything you produced or found") and **starts with an identical first paragraph across all four** (the shared KV prefix, per probe 2's finding — include a WHY comment naming the probe).
- [ ] **Step 4: Run tests → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): built-in definitions registry (explorer/worker/reviewer/researcher)"`

### Task 5: Child permissions + `createChild` on the host

**Files:**
- Create: `desktop/src/main/harness/specialists/child-permissions.ts`
- Modify: `desktop/src/shared/permission-types.ts` (additive `message?: string` on `PermissionDecision`)
- Modify: `desktop/src/main/harness/harness-session.ts` (one line at the deny return, currently :1840 — surface `decision.message`)
- Modify: `desktop/src/main/harness/native-session-host.ts` (read symbols: `buildDecide` :289, `toolWiring` :341, `create` :446, `wire` :403, `modeFor`/`rememberedFor` fields :132-142)
- Test: `desktop/tests/specialist-child-permissions.test.ts`, extend `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Consumes: the REAL permission types — read `src/shared/permission-types.ts` first. `PermissionDecision` is `{ action: 'allow' | 'ask' | 'deny'; denyListed: boolean }` (**`action`, not `behavior`** — `behavior` belongs to the broker's `AskDecision`, a different type; do not conflate them).
- Produces:

```ts
// permission-types.ts — additive field:
export interface PermissionDecision {
  action: PermissionAction;
  denyListed: boolean;
  /** Optional model-facing refusal detail. When absent, harness-session renders its
   *  generic "blocked by a permission rule" copy. Added for specialists (plan 1a):
   *  a child refused a tool needs to know WHY ("not available to this specialist")
   *  or a weak model will just retry. */
  message?: string;
}

// child-permissions.ts — pure, mirrors permission-engine's style
export interface ChildPermissionInputs {
  parentDecide: (tool: string, subject: string | undefined) => Promise<PermissionDecision>;
  charter: 'read-only' | 'read-write';
  allowedTools: string[];
  envelopeGranted: boolean;   // Task 6 sets true when the launch was approved (1a: always true in foreground flow after the Task ask)
}
export function buildChildDecide(i: ChildPermissionInputs): typeof i.parentDecide;

// native-session-host.ts
async createChild(parentId: string, opts: {
  specialist: SpecialistDefinition; prompt: string; workDir: string;
  parentToolCallId: string;
}): Promise<{ childId: string }>;
```

Task 6 consumes `createChild`; Task 7 consumes the child's `HarnessSession` handle via the host's live map.

- [ ] **Step 1: Write the failing permission tests** (pure function first — no host needed):

```ts
const allow: PermissionDecision = { action: 'allow', denyListed: false };
const deny: PermissionDecision = { action: 'deny', denyListed: false, message: 'parent said no' };
const ask: PermissionDecision = { action: 'ask', denyListed: false };
it('a tool outside allowedTools is refused outright, not asked', async () => {
  const decide = buildChildDecide({ parentDecide: async () => allow,
    charter: 'read-only', allowedTools: ['Read'], envelopeGranted: true });
  const d = await decide('Write', '/w/x.ts');
  expect(d.action).toBe('deny');
  expect(d.message).toMatch(/not available to this specialist/i);
});
it('a write tool under a read-only charter is refused even if listed', async () => {
  const decide = buildChildDecide({ parentDecide: async () => allow,
    charter: 'read-only', allowedTools: ['Write'], envelopeGranted: true });
  const d = await decide('Write', '/w/x.ts');
  expect(d.action).toBe('deny');
  expect(d.message).toMatch(/read-only/i);
});
it('parent DENY always wins over the envelope, message passed through', async () => {
  const decide = buildChildDecide({ parentDecide: async () => deny,
    charter: 'read-write', allowedTools: ['Write'], envelopeGranted: true });
  const d = await decide('Write', '/w/x.ts');
  expect(d.action).toBe('deny');
  expect(d.message).toBe('parent said no');
});
it('inside the envelope, an in-charter tool the parent would ASK about is allowed', async () => {
  const decide = buildChildDecide({ parentDecide: async () => ask,
    charter: 'read-write', allowedTools: ['Write'], envelopeGranted: true });
  expect((await decide('Write', '/w/x.ts')).action).toBe('allow');  // envelope consent, spec §5
});
```

The write-tool classification for the charter check: hardcode `const WRITE_TOOLS = new Set(['Write', 'Edit', 'Bash'])` with a WHY comment (Bash is write-capable by nature; MCP tools are out of scope until plan 1b).

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `buildChildDecide` + the `message` plumbing.** Decide order (strictest wins, spec §5): unknown/out-of-list tool → deny with the "not available" message · charter violation → deny naming the charter · `parentDecide` says deny → pass that deny through unchanged (its message, if any, is the real reason) · parent allow → allow · parent ask + `envelopeGranted` → allow · parent ask + no envelope → pass the ask through. **Tool-layer guards are untouched** — they run below this in `runOneTool` and this function must not attempt to replicate them (WHY comment). Then the plumbing: add `message?` to `PermissionDecision` (shared types) and change the deny return in `harness-session.ts` (currently :1840) to `return { text: decision.message ?? \`The ${call.toolName} call was blocked by a permission rule.\`, isError: true }` — additive; the generic copy stays the default for every existing caller. Extend one deny case in the existing `permission-engine` or `harness-session-loop` suite to pin that a `message`-carrying deny surfaces its message in the tool result.
- [ ] **Step 4: Run permission tests + the loop suite → PASS.**
- [ ] **Step 5: Write the failing `createChild` test** in `native-session-host.test.ts`. **Read the suite's top ~80 lines first and reuse its ACTUAL setup** — hosts are constructed inline with positional args and the shared helpers live in `tests/helpers/harness-fakes.ts` (`makeSession`, `drainTurn`, …) and `tests/helpers/scripted-model.ts` (`scriptedModel`, `stream`, `toolCallChunk`, …). There is no `bootHostWithFakes` helper — mirror how the suite's existing `create()` tests boot a host, verbatim.

```ts
it('createChild mints a child session with parent header fields and restricted tools', async () => {
  // Boot host + root session exactly the way the suite's create() tests do.
  const { childId } = await host.createChild('root-1', {
    specialist: resolveSpecialist('explorer')!, prompt: 'find the config loader',
    workDir: rootCwd, parentToolCallId: 'tc-1' });
  const header = store.readHeader(childId, rootCwd);
  expect(header?.parentSessionId).toBe('root-1');
  expect(header?.sessionKind).toBe('specialist');
  expect(header?.agentType).toBe('explorer');
});
it('createChild rejects a workDir outside the parent cwd', async () => {
  await expect(host.createChild('root-1', { ...opts, workDir: '/etc' }))
    .rejects.toThrow(/inside the parent/i);
});
it('a child session has no Skill tool and no MCP lease (cold-start contract)', async () => {
  const { childId } = await host.createChild('root-1', { ...opts });
  // Assert via the child's tool surface: drive one scripted turn and inspect the
  // tools the fake model was offered (scripted-model records the request), OR
  // expose a test-only accessor — match how the Skill-attachment tests already
  // inspect tool presence in harness-session tests.
  expect(offeredToolNames).not.toContain('Skill');
  expect(offeredToolNames).not.toContain('Task');
});
```

- [ ] **Step 6: Run → FAIL.**
- [ ] **Step 7: Implement `createChild`.** Read `create()` (:446) and `wire()` (:403) fully first — then note: **`createChild` must NOT call `wire()`.** `wire()` re-emits the session's original events on the host emitter, where the ipc listener mints conversation records and feeds the title feeder; a child passing through it would appear as a conversation. Child event handling is custom and lands in Task 7 (WHY comment at the call site). Structure:
  - Validate parent exists in `this.live`; canonicalize + containment-check `workDir` against the parent's cwd (reuse `isUnderRoot` from `tools/guards.ts` — note the guards canonicalize separators to `/` first; match that convention, not a raw `path.sep` check).
  - `const childId = randomUUID()`.
  - Header via `store.create({ v: 1, sessionId: childId, harnessId: parent's, binding: parent's, cwd: workDir, createdAt: Date.now(), parentSessionId: parentId, sessionKind: 'specialist', agentType: specialist.id })`. Note: a `workDir` that differs from the parent cwd lands the child's JSONL under a NEW project slug (`cwdToProjectSlug(workDir)`) — accepted for 1a; the recommended default `work_dir` is the parent's cwd (Task 6 documents this in the tool schema).
  - System prompt: call `assembleSystemPrompt` with the specialist's `systemPrompt` as the preset body and the standard env inputs for `workDir` (the `PromptInputs` interface is at `prompt-assembly.ts:28`, the assemble function at :69 — fill it the way `create()` does, substituting body + cwd). Cold start — nothing from the parent conversation (spec §1, WHY comment).
  - **Step cap:** pass `harness: { ...parentHarness, limits: { ...limits, maxSteps: specialist.stepCap } }` — `harness-session.ts:1276` reads `this.opts.harness.limits?.maxSteps` and falls back to `stepBudgetFor(modelId)`; without this line the definition's `stepCap` field is decorative.
  - **Skill suppression:** pass an explicit empty catalog — `skillCatalog: { list: () => [], load: (id) => { throw new SkillNotFound(id, []); } }` — because `syncSkillTool` (harness-session.ts:558) falls back to `createSkillCatalog()` (the FULL installed catalog) when `opts.skillCatalog` is undefined, and it re-syncs from `buildAiTools()` every turn. WHY comment citing the cold-start contract.
  - **MCP suppression:** do not acquire an `McpLease` for the child (pass none) — `create()` acquires one; children skip that call entirely.
  - Tools: filter the parent's tool set to `specialist.allowedTools` (the `NativeTool[]` array `toolWiring()` produces — filter by `.name`). The Task tool is structurally absent because it is never in `allowedTools`.
  - `decide`: `buildChildDecide({ parentDecide: this.buildDecide(parentId, parentCwd, presetRules), charter, allowedTools, envelopeGranted: true })` — **built against the parent's id AND the parent's cwd**, not `workDir`: `buildDecide` keys remembered rules by cwd (`permissionStore.rulesFor(cwd)`), and grants follow the project, not the subtree (WHY comment).
  - `askUser`: `childAskPolicy(...)` from Task 5.5 — **never the parent's broker.** The broker emits asks under the child's sessionId, no window owns that id, the reducer drops asks for unknown sessions (`chat-reducer.ts` PERMISSION_REQUEST: `if (!session) return state`), and `broker.ask()`'s promise never resolves — the child would hang silently. (In 1a Task 5.5 is a stub policy landed in the same commit sequence; wire it from the start.)
  - Register a `LiveEntry` for the child (own `appendChain`); `retainModel(childId, modelId)`.
  - **Cascade-cancel:** in `destroy()`/`interrupt()`/`quiesce()` for a parent id, look up `this.live` entries whose header parent is the id being torn down and interrupt+destroy them first (keep a host-level `childrenOf: Map<string, Set<string>>` maintained by `createChild`/child-destroy; a map, not a header re-read — WHY: teardown must not do disk I/O to find its children). Extend the existing destroy test to pin: destroying the parent destroys the child and releases its model ref.
- [ ] **Step 8: Run all host tests → PASS** (`npx vitest run tests/native-session-host.test.ts tests/specialist-child-permissions.test.ts`).
- [ ] **Step 9: Commit** — `git commit -m "feat(specialists): child permissions (charter + envelope + typed refusals) and NativeSessionHost.createChild"`

### Task 5.5: Child ask policy — no ask path may hang a specialist

**Files:**
- Create: `desktop/src/main/harness/specialists/child-ask-policy.ts`
- Test: `desktop/tests/specialist-child-permissions.test.ts` (extend), `desktop/tests/specialist-run.test.ts` (Task 7 extends with the end-to-end cap case)

**Why this task exists:** `decide()` is NOT the only route to a user ask. Four paths in `harness-session.ts` call `opts.askUser` directly, bypassing `decide` entirely: the step-cap gate (`:1424`, `toolName: 'max_steps'`), the doom-loop gate (`:1800`, `toolName: 'doom_loop'`), interactive tools (`:1817`, AskUserQuestion), and the external-directory forced ask (`:1837-1846` — an `external` path verdict forces `action: 'ask'` regardless of what `decide` would say). A child wired to the parent's broker would emit those asks under the child's sessionId, which no window owns → the reducer drops them → the promise never resolves → the child wedges until teardown. Children therefore get a **policy function**, not a broker.

**Interfaces:**
- Produces:

```ts
// Auto-answers every ask a child session raises. Children have no user;
// every ask must resolve immediately with a deterministic, finalize-clean answer.
export function childAskPolicy(): NonNullable<HarnessSessionOpts['askUser']>;
```

- [ ] **Step 1: Write the failing tests** (drive the policy directly — it's a pure async function):

```ts
const policy = childAskPolicy();
it('denies a max_steps ask (turn finalizes with stopReason max_steps — a clean end, not a hang)', async () => {
  const d = await policy({ sessionId: 'c1', toolName: 'max_steps', toolInput: { steps: 25 }, denyListed: false });
  expect(d.behavior).toBe('deny');
});
it('denies a doom_loop ask (the loop returns its corrective retry text to the model)', async () => {
  const d = await policy({ sessionId: 'c1', toolName: 'doom_loop', toolInput: { repeated: 'Grep' }, denyListed: false });
  expect(d.behavior).toBe('deny');
});
it('denies any other ask (external-directory, unexpected interactive) — never resolves late, never hangs', async () => {
  const d = await policy({ sessionId: 'c1', toolName: 'Read', toolInput: { file_path: '/outside' }, denyListed: false });
  expect(d.behavior).toBe('deny');
});
```

(The return type is the broker's `AskDecision` — `{ behavior: 'allow' | 'deny' | 'canceled', ... }` from `permission-broker.ts:22`. `behavior` is correct HERE; it was wrong for `PermissionDecision` in Task 5.)

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** A ~15-line function: always `{ behavior: 'deny' }`, with a WHY comment block naming each of the four bypass paths and what a deny means on each (max_steps → turn ends `stopReason: 'max_steps'`; doom_loop → corrective "try a different approach" text; external-dir → the child stays inside `work_dir` in 1a; interactive → belt-and-suspenders, AskUserQuestion is never in `allowedTools`). Plan 1b's timeout-redirect replaces this policy for the asks worth routing to the parent — note that in the comment.
- [ ] **Step 4: Behavioral pin.** Extend the host suite: boot a child whose `stepCap` is 2 with a scripted model that keeps issuing tool calls; assert the child's turn ENDS (turn-complete with `stopReason: 'max_steps'`) rather than hanging, and that no `PERMISSION_REQUEST`-bearing event for the child's sessionId ever reaches the host emitter. Use vitest fake timers if the drain needs them — but the deny path is synchronous, so a plain `drainTurn` should settle.
- [ ] **Step 5: Run → PASS. Commit** — `git commit -m "feat(specialists): child ask policy — every bypass ask auto-denies, specialists can never hang on a user prompt"`

### Task 6: The Task tool + capability-profile gate + reserve slots

**Files:**
- Create: `desktop/src/main/harness/tools/task.ts`
- Modify: `desktop/src/main/harness/capability-profile.ts` (add `canDelegate: boolean`)
- Modify: `desktop/src/shared/harness-manifest.ts` (`CONDITIONAL_TOOL_NAMES` — Task joins Skill; `tests/tool-registry-manifest.test.ts` enforces registry/manifest lockstep in BOTH directions and fails otherwise)
- Modify: `desktop/src/main/harness/harness-session.ts` (dynamic attachment beside `syncSkillTool` :558 — read :540-670 first; re-sync happens from `buildAiTools()` every turn, NOT on `setBinding`)
- Modify: `desktop/src/main/harness/native-session-host.ts` (per-parent slot/writer state + wiring the tool's spawn callback in `toolWiring` :341)
- Modify: `rulesForMode`'s baseline (in `src/shared/permission-types.ts` — read it first) **as a pinned decision, not an accident:** Task is NOT in any always-allow baseline for `ask` mode (so the Task call asks — that ask IS the envelope consent moment), and IS auto-allowed in `auto-edit`/`full-auto` (delegating grants nothing those modes don't already grant directly; walk-away autonomy per spec §5).
- Test: `desktop/tests/task-tool.test.ts`, extend `desktop/tests/capability-profile.test.ts`, `desktop/tests/tool-registry-manifest.test.ts`

**Interfaces:**
- Consumes: `createChild` (Task 5), `listSpecialists` (Task 4).
- Produces: `TaskTool` with input `{ description: string; prompt: string; agent: string; work_dir: string }`; a `ToolServices.spawnSpecialist` callback the host injects; `profile.canDelegate`; host methods `tryReserveSpecialistSlot(parentId): boolean` / `releaseSpecialistSlot(parentId)` — **per-parent** counters (Global Constraints scope decision). Task 7 fills in the tool's `execute` result path.

- [ ] **Step 1: Failing profile tests:** frontier/cloud default profile has `canDelegate: true`; the conservative fallback and any profile with `maxToolPresentation: 'simplified'` (the small-local tier) has `canDelegate: false`. Read `capability-profile.ts:9-80` first; add the field to the interface, `CLOUD_DEFAULT`, and the fallback with a WHY comment citing spec decision 4 (weak orchestrators serial-collapse; gate the tool, never `createChild`).
- [ ] **Step 2: Implement + run → PASS.**
- [ ] **Step 3: Failing Task-tool tests** (drive `execute` directly with a fake `ToolContext` the way `harness-tools-core.test.ts` does — read its fixture setup first):

```ts
it('refuses an unknown specialist with the available list', async () => {
  const r = await runTaskTool({ agent: 'wizard', ... });
  expect(r.isError).toBe(true);
  expect(r.text).toMatch(/unknown specialist/i);
  expect(r.text).toMatch(/explorer/);   // names what IS available
});
it('refuses a trivial or placeholder prompt with a typed error', async () => {
  const r = await runTaskTool({ agent: 'explorer', prompt: 'do the thing', ... });
  expect(r.isError).toBe(true);
  expect(r.text).toMatch(/self-contained brief/i);   // minimal weak-model hardening; full pass is plan 1b
});
it('returns a typed at-capacity result when this parent has no slot free', async () => {
  const r = await runTaskTool({ agent: 'explorer', ... }, { slotFree: false });
  expect(r.isError).toBe(true);
  expect(r.text).toMatch(/at capacity \(max \d+\)/i);
  expect(r.text).toMatch(/wait/i);      // tells the model what it CAN do
});
it('returns a typed writer-busy result for a second concurrent write-capable specialist under the same parent', async () => {
  const r = await runTaskTool({ agent: 'worker', ... }, { writerBusy: true });
  expect(r.isError).toBe(true);
  expect(r.text).toMatch(/another specialist with write access is running/i);
});
```

- [ ] **Step 4: Run → FAIL.**
- [ ] **Step 5: Implement `task.ts`** via `defineTool` (mirror `tools/grep.ts:215-270` structure): `name: 'Task'`; `description` enumerates specialists from `listSpecialists()` (id + description + **charter — "read-only" / "can edit files"** — this line doubles as the 1a consent copy, since the pretty launch card is plan 1c) plus one orchestration-doctrine line per the Codex pattern ("Specialists work independently and report back once; give each a complete, self-contained brief"); `inputSchema` zod with `.describe()` on every field — `work_dir`'s describe says "usually the project root you are working in" (the recommended default; a subdirectory narrows what the specialist can read, see Task 5 containment). Prompt floor: reject `prompt.trim().length < 40` with the typed "self-contained brief" error. `permissionSubject` — **ruling during execution (2026-08-12, review round):** the subject is the charter-scoped consent key `` `${charter}:${work_dir}` `` (bare `work_dir` for unknown agents), and Task joins `NON_PATH_SUBJECT_TOOLS`, so an "Always allow" on a read-only explorer can never pre-approve a read-write worker in the same directory. (The original `(a) => a.work_dir` shape was charter-blind.) `execute` (1a, foreground-only): resolve specialist (typed refusal if unknown) → prompt floor → per-parent slot + single-writer checks via `ToolServices` callbacks (typed refusals) → `spawnSpecialist(...)` → await completion → return the report (Task 7 shape). On child throw/interrupt: return `isError` text naming what happened + the child id — never a dangling result.
- [ ] **Step 6: Attachment + manifest + mode baseline.** In `harness-session.ts`, add `syncTaskTool()` beside `syncSkillTool()` (:558): attach when `profile.canDelegate && !opts.isSpecialistChild`; call it from `buildAiTools()` exactly where `syncSkillTool()` is called (per-turn re-sync — that's the real re-sync site; `setBinding` only swaps fields). `isSpecialistChild` is a new boolean on `HarnessSessionOpts` set by `createChild` (belt-and-suspenders with allowedTools omission — WHY comment). Add `'Task'` to `CONDITIONAL_TOOL_NAMES` in `src/shared/harness-manifest.ts` (run `npx vitest run tests/tool-registry-manifest.test.ts` — it fails in both directions if either side is missing). Make the `rulesForMode` decision from the Files list explicit with a test: ask-mode → Task asks; full-auto → Task allowed. In the host, implement per-parent state: `specialistSlots: Map<parentId, number>` against `HOSTED_MAX_CONCURRENT_SPECIALISTS = 4` (local value arrives via profile in 1b, from Task 1's recorded number) and `activeWriterChild: Map<parentId, string>`.
- [ ] **Step 7: Run all new tests + `npx vitest run tests/harness-session-loop.test.ts tests/tool-registry-manifest.test.ts`** (the frozen-surface suite must stay green — attaching a tool must not have changed any event shapes). Expected: PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat(specialists): Task tool with capability gate, per-parent slots, and typed refusals"`

### Task 7: Foreground run — re-stamped events, the subagent card, and the headroom-capped report

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` (child event wiring inside `createChild`; a `runSpecialist` helper the Task tool's `spawnSpecialist` callback calls)
- Modify: `desktop/src/main/harness/harness-session.ts` (small additive accessor: `get contextUsedTokens(): number | null`)
- Modify: `desktop/src/renderer/components/tool-views/ToolBody.tsx` (**one line**: add `case 'Task':` falling through to the existing `case 'Agent':` at :937 — without it, stamped child events accumulate in reducer state but the timeline never shows the subagent card, because the card is selected by `toolName`)
- Create: `desktop/src/main/harness/specialists/report-budget.ts`
- Test: `desktop/tests/specialist-run.test.ts` (new — end-to-end with the host's existing fakes), `desktop/tests/specialist-report-budget.test.ts`, plus the renderer pin for the `Task` card case (extend the existing tool-view/chat-reducer test that covers the `Agent` card — find it with `rg -l "applySubagentEvent\|case 'Agent'" desktop/src desktop/tests`; if only reducer-level tests exist, pin there and note the render case is also covered by `node scripts/workbench-boot-check.mjs`)

**Interfaces:**
- Consumes: everything above.
- Produces: `runSpecialist(childId, prompt): Promise<{ report: string; steps: number; usage: {...} }>` and `computeReportBudget(i: { staticCapTokens: number; parentRemainingTokens: number; concurrentReporters: number }): number`.

- [ ] **Step 1: Failing budget tests** (pure):

```ts
it('caps at the static budget when the parent has room', () =>
  expect(computeReportBudget({ staticCapTokens: 2000, parentRemainingTokens: 50_000, concurrentReporters: 1 })).toBe(2000));
it('shrinks with parent headroom divided across reporters', () =>
  expect(computeReportBudget({ staticCapTokens: 2000, parentRemainingTokens: 8_000, concurrentReporters: 4 }))
    .toBe(Math.floor((8_000 * 0.5) / 4)));   // fraction 0.5, spec §3 (Hermes)
it('never returns below a floor of 200 tokens', () =>
  expect(computeReportBudget({ staticCapTokens: 2000, parentRemainingTokens: 400, concurrentReporters: 4 })).toBe(200));
```

- [ ] **Step 2: Implement `report-budget.ts`** (`min(staticCap, floor(remaining × 0.5 / reporters))`, floor 200; constants named + WHY comment citing the Hermes fan-out blowout) **→ PASS.**
- [ ] **Step 3: Failing end-to-end test** in `specialist-run.test.ts`. Boot a host using the suite's existing inline construction plus `tests/helpers/scripted-model.ts` (`scriptedModel`, `stream`, `toolCallChunk`) and `tests/helpers/harness-fakes.ts` (`makeSession`, `drainTurn`) — script the child model to emit two tool calls (against a fake in `allowedTools`) then a final text "REPORT: found it at src/x.ts". Collect every `transcript-event` the host emits. Assert:

```ts
// (a) display re-stamping: child events arrive under the PARENT's sessionId
const childStamped = events.filter(e => e.data?.agentId === childId);
expect(childStamped.length).toBeGreaterThan(0);
for (const e of childStamped) {
  expect(e.sessionId).toBe('root-1');
  expect(e.data.parentAgentToolUseId).toBe('tc-1');
  // ONLY the three types applySubagentEvent consumes (chat-reducer.ts:212-215):
  expect(['tool-use', 'tool-result', 'assistant-text']).toContain(e.type);
}
// (b) NO stamped turn-complete/session-error ever reaches the host emitter — a
// stamped turn-complete would hit the conversation-record ipc listener
// (noteModelUsed) and the title feeder under the PARENT's id.
expect(childStamped.find(e => e.type === 'turn-complete')).toBeUndefined();
// (c) persistence separation: the child's own JSONL holds its transcript under childId
const childLines = await readSessionLines(workDir, childId);
expect(childLines.length).toBeGreaterThan(1);
// (d) the parent's file contains NO child-stamped events (display-only re-emission)
const parentLines = await readSessionLines(tmpDir, 'root-1');
expect(parentLines.filter(l => l.data?.agentId)).toHaveLength(0);
// (e) the report comes back capped
expect(result.report).toContain('REPORT: found it');
```

Map the string type names in (a) to the suite's real `TranscriptEventType` values — read the constants, don't guess. The scripted model must also be able to FAIL mid-run (throw on step 2) — add the case: `runSpecialist` rejects, and the Task tool test from Task 6 already pins that this surfaces as an `isError` result, not a dangling call. Also add the empty-report retry case: script a child whose final message is empty; assert exactly ONE nudge turn runs and the second answer becomes the report (retry budget 1, spec §3).

- [ ] **Step 4: Run → FAIL.**
- [ ] **Step 5: Implement.**
  - **Child event wiring** (in `createChild`, replacing what `wire()` would have done): subscribe to the child session's `transcript-event`; for each event, (a) enqueue the ORIGINAL (child sessionId) onto the child's own `appendChain` → `store.append` (persistence), and (b) IF the type is one of the three `applySubagentEvent` consumes (tool-use / tool-result / assistant-text), emit a display copy `{ ...event, sessionId: parentId, data: { ...event.data, parentAgentToolUseId, agentId: childId } }` on the host — all other types (turn-complete, usage) are persisted but NEVER re-emitted stamped (WHY comment naming the noteModelUsed/title-feeder hazard); `session-error` is display-only by the store's pre-existing contract (`session-store.ts` drops it before write) and is neither persisted nor re-emitted stamped.
  - **Headroom accessor:** add `get contextUsedTokens(): number | null` on `HarnessSession` returning the same tracked how-full-is-the-window number that rides `turn-complete` usage (`src/shared/types.ts:194` — use the `contextUsedTokens` semantics, NOT `inputTokens`, which re-counts history per step; the shared-types comment warns exactly this). Mid-turn it reflects the last completed step — stale by at most one step, which is fine for a budget heuristic (WHY comment). This exists because main has no per-session usage cache (the old one was deliberately deleted — see the comment near `ipc-handlers.ts:1958`) and the StatusBar flow is renderer-side.
  - **`runSpecialist`:** send the prompt via the child session's existing send path; **do NOT detect failure by awaiting the `running` promise alone** — it covers the whole queue drain and never rejects (`native-session-host.ts:107`: "runTurns try/catches its send() so this never rejects"). Instead: listen for the child's `session-error` display event and read the child's final `turn-complete` `stopReason`; after the drain settles, error event or missing final text ⇒ reject with the captured reason (the Task tool renders it as `isError`). A `stopReason: 'max_steps'` end (Task 5.5's cap path) is NOT a failure: return the last assistant text with a "(stopped at its step limit)" suffix. Empty final text → ONE nudge message ("Your final message is your report — reply with your findings now."), await one more drain, then accept whatever came (or fail typed). Then: `computeReportBudget({ staticCapTokens: specialist.reportBudgetTokens, parentRemainingTokens: parentSession.contextUsedTokens != null ? contextWindow - used : Infinity, concurrentReporters: 1 /* 1a foreground */ })`, truncate-with-notice via the existing `truncate.ts` helpers (text-only — spill is 1b), wrap as `## Report from {title} ({specialist.id})\n...\n[full transcript: specialist session {childId}]`, release slot/writer, return.
  - **Renderer:** the one-line `case 'Task':` fallthrough in `ToolBody.tsx` (:937) + its pin.
- [ ] **Step 6: Run the new suite + the full harness set** — `npx vitest run tests/specialist-run.test.ts tests/native-session-host.test.ts tests/harness-session-loop.test.ts tests/session-store.test.ts` and `node scripts/workbench-boot-check.mjs` (renderer touched). Expected: PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(specialists): foreground run — re-stamped display events, Task card rendering, own-file persistence, headroom-capped report"`

### Task 8: Names, exclusion sweep, and verification

**Files:**
- Create: `desktop/src/main/harness/specialists/names.ts` + `desktop/src/main/harness/specialists/name-pools.json`
- Test: `desktop/tests/specialist-names.test.ts`; extend `desktop/tests/specialist-run.test.ts`
- Modify: `youcoded/docs/native-runtime.md` (new "Specialists (plan 1a)" section — MUST include the reload tradeoff: after app restart the subagent card is empty because child events persist only in the child's file; the report text survives in the parent's Task tool result; 1b durability owns replay), `docs/MAP.md` (workspace — add the specialists subsystem row), `.claude/rules/native-runtime.md` (invariant addendum: depth-by-omission · display-events-not-persisted-under-parent · children-hidden-from-lists · children-never-reach-a-broker-ask)

**Interfaces:**
- Produces: `assignSpecialistName(agentType: string, taken: Set<string>): { name: string; title: string }` — title shape `"{Name} the {Descriptor} {Role}"`, descriptor alliterates with the role, draw without replacement per conversation.

- [ ] **Step 1: Failing name tests:**

```ts
it('titles alliterate with the role and draw without replacement', () => {
  const taken = new Set<string>();
  const a = assignSpecialistName('explorer', taken); taken.add(a.name);
  const b = assignSpecialistName('explorer', taken);
  expect(a.title).toMatch(/^\w+ the E\w+ Explorer$/);
  expect(b.name).not.toBe(a.name);
});
it('falls back gracefully when a pool is exhausted (numbered, never a crash)', () => {
  const taken = new Set<string>();
  // Drain the whole pool, then one more: expect "Explorer 13"-style fallback.
  for (let i = 0; i < POOL_SIZE; i++) taken.add(assignSpecialistName('explorer', taken).name);
  const overflow = assignSpecialistName('explorer', taken);
  expect(overflow.title).toMatch(/^Explorer \d+$/);
});
```

- [ ] **Step 2: Implement** (`name-pools.json`: ≥12 first names shared across roles, ≥6 descriptors per role: E-words for Explorer, R-words for Researcher and Reviewer, W-words for Worker). `createChild` calls it (taken-set held per parent on the host, cleared with the parent entry) and stores the title in the child header's existing `title` field — the transcript header renders it for free. **→ PASS.**
- [ ] **Step 3: Programmatic exclusion sweep.** Per the investigation-discipline rule, claiming "children appear in no list" needs a command that covers ALL the surfaces — several reach native sessions through `NativeHome.listSessionFiles()` and raw path conventions, NOT through `SessionStore`. Sweep:
  ```
  rg -n "store\.list\(|SessionStore|listSessionFiles|cwdToProjectSlug|\.youcoded.*sessions" desktop/src/main --type ts
  ```
  Walk every hit: `SessionStore.list` call sites get the default (children hidden); the `listSessionFiles`/path-convention consumers (conversation store, chat search, session browser) must each be checked for whether a child JSONL appearing on disk leaks into their output — record the per-site verdict in the PR body with the command output. Then the `sessionIdMap` decision (spec §1): `createChild` is host-internal with no IPC route, so children never enter `ipc-handlers.ts`'s create path — verify with `rg -n "createChild" desktop/src/main/ipc-handlers.ts` returning nothing, and record it. Extend `specialist-run.test.ts`: after a run, `store.list()` still returns only the root.
- [ ] **Step 4: Docs + rule addendum** (the four invariants, ≤3 lines each, per rules README format; `verify:` anchors pointing at `specialists/registry.ts`, `specialists/child-ask-policy.ts`, and `tests/specialist-run.test.ts`).
- [ ] **Step 5: Full verification** — `bash scripts/verify.sh <worktree>` → green.
- [ ] **Step 6: Commit** — `git commit -m "feat(specialists): alliterative names, list-exclusion sweep, docs + rule anchors"`

---

## Self-review checklist (run after Task 8)

- Spec §1 coverage: header fields ✅(T3) · Task tool ✅(T6) · createChild ✅(T5) · re-stamping + card rendering ✅(T7 — the `Task` case in ToolBody is what makes the card actually render; the reducer alone was never sufficient) · depth-by-omission ✅(T4/T6) · per-parent single-writer ✅(T6) · cascade-cancel ✅(T5) · cold-start context incl. Skill/MCP suppression ✅(T5) · containment ✅(T5) · child ask policy + stepCap wiring ✅(T5.5).
- Spec §2: four built-ins ✅(T4) · hidden utilities ❌ deferred (optional cleanup, spec allows) · files/CC-compat → plan 1c.
- Spec §3: foreground ✅(T7) · report caps + empty-report one-retry ✅(T7) · typed at-capacity/writer-busy ✅(T6) · child-failure typed result ✅(T6/T7) · background/steering/ledger/heartbeat/durability → plan 1b (see Deferred-item ledger).
- Spec §5: charter+envelope+typed refusal messages ✅(T5) · guards-below untouched ✅(T5) · mode-baseline decision pinned ✅(T6) · timeout redirect → plan 1b · grant keying v2 → plan 1b (with the M5 UI dependency noted).
- Spec §6: names ✅(T8) · charter copy rides the tool description in 1a ✅(T6) · pretty cards/badge/launch card → plan 1c.
- Spec §8: probes 1–2 ✅(T1/T2) · probe 3 → stage-two plan.
- Sequencing: rebase state vs the four permission worktrees checked at T5 start and re-checked before the final merge.
