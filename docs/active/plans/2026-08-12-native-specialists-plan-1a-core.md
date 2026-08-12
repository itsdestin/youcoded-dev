---
status: active
date: 2026-08-12
spec: docs/active/specs/2026-08-11-native-specialists-design.md
repos: [youcoded]
sequence: plan 1a of 3 for spec stage one (1b = background/durability/steering/timeout-redirect; 1c = definitions folder/CC mapping/chat UI)
---

# Native Specialists Plan 1a — Core (foreground specialist end-to-end)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native session's model can call a `Task` tool that spawns a child session ("specialist") with cold-start context and charter-capped permissions, runs it in the foreground, streams its activity into the existing subagent chat UI, and receives a headroom-capped report — with the two local-engine probes measured first so concurrency and KV defaults are facts, not guesses.

**Architecture:** A specialist is an ordinary `HarnessSession` child: additive header fields mark parentage; `NativeSessionHost.createChild` reuses `create()`'s wiring with a specialist-resolved system prompt and a restricted tool/permission set; child transcript events persist under the child's own id but are re-emitted for display under the **parent's** id stamped with `parentAgentToolUseId`/`agentId`, landing in the existing `applySubagentEvent` renderer path unchanged (frozen emit surface honored — no new event types).

**Tech Stack:** TypeScript (Electron main), vitest, existing harness seams (`defineTool`, `PermissionBroker`, `CapabilityProfile`, `SessionStore`), llama-server for probes.

## Global Constraints

- **Worktree:** all work in the `youcoded` repo on branch `feat/native-specialists-core` in a dedicated worktree (superpowers:using-git-worktrees). Desktop only; Android untouched.
- **Frozen emit surface** (`.claude/rules/native-runtime.md`): child/display events use ONLY existing `TranscriptEventType` values; parent linkage rides `data.parentAgentToolUseId` + `data.agentId` (already typed at `src/shared/types.ts:200,202`). No new event types, no new IPC channels in this plan.
- **Injection is messages, never a prompt edit** — the child's system prompt is assembled ONCE at spawn; anything later arrives as messages. `prompt-assembly.ts` stays byte-stable per session.
- **Tool-call/result pairing everywhere:** a Task call that fails, is refused, or is interrupted MUST still resolve its tool result (typed error text), or the parent session bricks on real providers.
- **Every non-trivial edit carries a WHY comment** (Destin is a non-developer).
- **Error copy:** specific-and-accurate or general-non-committal per `docs/error-message-standards.md`; never a guessed cause.
- **Verification:** `bash scripts/verify.sh <worktree>` green before any "done" claim; it is Linux-only, so path-vocabulary-sensitive code (spill paths) must follow `toPosix()` conventions per the native-runtime rule.
- **Spec values (verbatim):** hosted concurrency default **4**; local concurrency derived from probe 1; depth 1 by toolset omission; report retry budget **1**; children never in top-level lists; the model-facing tool is named **`Task`**; user copy says **"specialists"**.
- **Read before you edit:** each task names its anchor symbols. `harness-session.ts` is 1,899 lines and `ipc-handlers.ts` 3,906 — read ONLY the named symbol ranges (Serena `find_symbol` or the line anchors given), never the whole file.

---

### Task 1: Probe — llama-server parallel capacity

**Files:**
- Create: `desktop/test-engine/probe-parallel.mjs`
- Modify: `youcoded/docs/engine-dependencies.md` (append a "Parallel slots (specialists)" section with measured results)

**Interfaces:**
- Produces: a recorded decision — `LOCAL_MAX_CONCURRENT_SPECIALISTS` value and the `--parallel`/`-np` flag choice — consumed by Task 6's reserve-slot defaults.

This is a dev-run probe like the existing `desktop/test-engine/probe-tools.mjs` (read its header for the launch/teardown conventions — it spawns a scratch llama-server; reuse its helper style). No unit tests; the deliverable is measured numbers in the doc.

- [ ] **Step 1: Write the probe script.** It must: (a) start llama-server via the same binary/args `EngineSupervisor` uses (read `src/main/engine/engine-supervisor.ts:285-306` and copy the arg list, adding `--parallel N` variants), (b) for N in {1, 2, 4}, fire N simultaneous short chat completions against one small model, (c) record wall-clock per request and total, plus whether requests serialized (total ≈ N×single) or batched (total ≈ single + margin), (d) print a table. ~120 lines; `node desktop/test-engine/probe-parallel.mjs --model <gguf>`.
- [ ] **Step 2: Run it on the dev machine's default small model.** Expected output: a table of N vs latency. If `--parallel > 1` with the router-mode args errors out, THAT is a finding — record it verbatim.
- [ ] **Step 3: Record results in `engine-dependencies.md`** under a new `## Parallel slots (specialists, plan 1a probe)` heading: the table, the chosen `LOCAL_MAX_CONCURRENT_SPECIALISTS` (the largest N whose per-request latency ≤ 2× single-request), and whether the supervisor args need `--parallel` added (that change itself belongs to plan 1b when background fan-out lands — record, don't edit the supervisor here).
- [ ] **Step 4: Commit** — `git commit -m "probe(engine): measure llama-server parallel capacity for specialists"`

### Task 2: Probe — KV prefix reuse across child spawns

**Files:**
- Create: `desktop/test-engine/probe-prefix-cache.mjs`
- Modify: `youcoded/docs/engine-dependencies.md` (append results to the same section)

**Interfaces:**
- Produces: a recorded yes/no — does a shared system-prompt prefix avoid re-processing across sequential/parallel child-style requests — consumed by Task 4's prompt-assembly ordering decision.

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

- [ ] **Step 1: Write the failing tests** in `session-store.test.ts`:

```ts
describe('specialist child headers (plan 1a)', () => {
  it('round-trips the additive child fields through create() and readHeader', async () => {
    const header = makeHeader({ sessionId: 'child-1', parentSessionId: 'root-1',
      sessionKind: 'specialist', agentType: 'explorer' });
    await store.create(header);
    const back = await store.readHeader(header.cwd, 'child-1');
    expect(back?.parentSessionId).toBe('root-1');
    expect(back?.agentType).toBe('explorer');
  });
  it('list() hides specialist children by default and includes them on request', async () => {
    await store.create(makeHeader({ sessionId: 'root-1' }));
    await store.create(makeHeader({ sessionId: 'child-1', parentSessionId: 'root-1', sessionKind: 'specialist' }));
    const defaults = await store.list();
    expect(defaults.map(e => e.sessionId)).toEqual(['root-1']);
    const all = await store.list({ includeChildren: true });
    expect(all.map(e => e.sessionId).sort()).toEqual(['child-1', 'root-1']);
  });
  it('a v1 header WITHOUT the new fields still validates (no migration)', async () => {
    // Legacy shape: exactly the pre-plan-1a field set, written directly.
    const legacy = { v: 1, sessionId: 'old-1', harnessId: 'chat',
      binding: fakeBinding, cwd: tmpDir, createdAt: 1 };
    await home.appendSessionLine(cwdToProjectSlug(tmpDir), 'old-1', legacy);
    const back = await store.readHeader(tmpDir, 'old-1');
    expect(back?.sessionId).toBe('old-1');
    expect(back?.parentSessionId).toBeUndefined();
    expect(back?.sessionKind).toBeUndefined();
  });
});
```

Use the file's existing `makeHeader`/fixture helpers (read the top of `session-store.test.ts` first and match its setup — do NOT invent a parallel fixture style). If `readHeader` has a different name, use the real one (the Explore map calls it `readSessionHead` on `NativeHome`; the store-level reader is what `resume()` uses — read `native-session-host.ts:507` to find it).

- [ ] **Step 2: Run to verify failure** — `cd desktop && npx vitest run tests/session-store.test.ts` → new cases FAIL (unknown fields are fine; the list-filter case fails).
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
  stepCap: number;                  // hard turn/step ceiling for the child
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
    expect(d!.allowedTools).not.toContain('Task');       // depth-by-omission, spec §1
    expect(d!.allowedTools).not.toContain('TodoWrite');  // noise tool, denied by default
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
- [ ] **Step 3: Implement `builtins.ts`** with the four definitions. Tool lists (names must match `NATIVE_TOOL_NAMES` — import it and add a test asserting every `allowedTools` entry is a member, plus 'Skill'):
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
- Modify: `desktop/src/main/harness/native-session-host.ts` (read symbols: `buildDecide` :289, `toolWiring` :341, `create` :446, `modeFor`/`rememberedFor` fields :132-142)
- Test: `desktop/tests/specialist-child-permissions.test.ts`, extend `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Produces:

```ts
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
const deny = { behavior: 'deny' as const, message: 'no' };
const allow = { behavior: 'allow' as const };
it('a tool outside allowedTools is refused outright, not asked', async () => {
  const decide = buildChildDecide({ parentDecide: async () => allow,
    charter: 'read-only', allowedTools: ['Read'], envelopeGranted: true });
  const d = await decide('Write', '/w/x.ts');
  expect(d.behavior).toBe('deny');
  expect(d.message).toMatch(/not available to this specialist/i);
});
it('a write tool under a read-only charter is refused even if listed', async () => {
  const decide = buildChildDecide({ parentDecide: async () => allow,
    charter: 'read-only', allowedTools: ['Write'], envelopeGranted: true });
  expect((await decide('Write', '/w/x.ts')).behavior).toBe('deny');
});
it('parent DENY always wins over the envelope', async () => {
  const decide = buildChildDecide({ parentDecide: async () => deny,
    charter: 'read-write', allowedTools: ['Write'], envelopeGranted: true });
  expect((await decide('Write', '/w/x.ts')).behavior).toBe('deny');
});
it('inside the envelope, an in-charter tool the parent would ASK about is allowed', async () => {
  const decide = buildChildDecide({ parentDecide: async () => ({ behavior: 'ask' as const }),
    charter: 'read-write', allowedTools: ['Write'], envelopeGranted: true });
  expect((await decide('Write', '/w/x.ts')).behavior).toBe('allow');  // envelope consent, spec §5
});
```

Read `src/shared/permission-types.ts` first for the real `PermissionDecision` shape and use it exactly (the `ask` passthrough shape matters). The write-tool classification for the charter check: hardcode `const WRITE_TOOLS = new Set(['Write', 'Edit', 'Bash'])` with a WHY comment (Bash is write-capable by nature; MCP tools are out of scope until plan 1b).

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `buildChildDecide`.** Order (strictest wins, spec §5): unknown/out-of-list tool → deny with the "not available" message · charter violation → deny naming the charter · `parentDecide` says deny → pass that deny through unchanged (its message is the real reason) · parent allow → allow · parent ask + `envelopeGranted` → allow · parent ask + no envelope → pass the ask through. **Tool-layer guards are untouched** — they run below this in `runOneTool` and this function must not attempt to replicate them (WHY comment).
- [ ] **Step 4: Run permission tests → PASS.**
- [ ] **Step 5: Write the failing `createChild` test** in `native-session-host.test.ts`, using the file's existing fake ModelFactory/store fixtures (read its top ~80 lines and reuse — the suite already boots hosts with fakes):

```ts
it('createChild mints a child session with parent header fields and restricted tools', async () => {
  const { host, store } = await bootHostWithFakes();
  await host.create({ sessionId: 'root-1', cwd: tmpDir, binding: fakeBinding, presetId: 'assistant' });
  const { childId } = await host.createChild('root-1', {
    specialist: resolveSpecialist('explorer')!, prompt: 'find the config loader',
    workDir: tmpDir, parentToolCallId: 'tc-1' });
  const header = await store.readHeader(tmpDir, childId);   // real reader name from Task 3
  expect(header?.parentSessionId).toBe('root-1');
  expect(header?.sessionKind).toBe('specialist');
  expect(header?.agentType).toBe('explorer');
});
it('createChild rejects a workDir outside the parent cwd', async () => {
  await expect(host.createChild('root-1', { ...opts, workDir: '/etc' }))
    .rejects.toThrow(/inside the parent/i);
});
```

- [ ] **Step 6: Run → FAIL.**
- [ ] **Step 7: Implement `createChild`.** Structure (mirror `create()` at :446 — read it fully first):
  - Validate parent exists in `this.live`; canonicalize + containment-check `workDir` against the parent's cwd (reuse the containment helper the tool guards use — `checkPathGuard`'s sibling in `tools/guards.ts`; the `+ path.sep` prefix trap from the native-runtime rule applies).
  - `const childId = randomUUID()`.
  - Header via `store.create({ v: 1, sessionId: childId, harnessId: parent's, binding: parent's, cwd: workDir, createdAt: Date.now(), parentSessionId: parentId, sessionKind: 'specialist', agentType: specialist.id })`.
  - System prompt: call `assembleSystemPrompt` with the specialist's `systemPrompt` as the preset body and the standard env inputs for `workDir` (read `prompt-assembly.ts:68`'s `PromptInputs` and fill it the way `create()` does, substituting body + cwd). Cold start — nothing from the parent conversation (spec §1, WHY comment).
  - Tools: filter the parent's tool set to `specialist.allowedTools` (the `NativeTool[]` array `toolWiring()` produces — filter by `.name`). The Task tool is structurally absent because it is never in `allowedTools`.
  - `decide`: `buildChildDecide({ parentDecide: this.buildDecide(parentId, workDir, presetRules), charter, allowedTools, envelopeGranted: true })` — parent's decide is built against the PARENT id (mode + remembered rules stay the parent's, live).
  - `askUser`: the parent's broker ask, unchanged (asks that do surface carry the child's context in plan 1b; in 1a the envelope means in-charter asks don't reach it).
  - Register a `LiveEntry` for the child (own `appendChain`); `retainModel(childId, modelId)`.
  - **Cascade-cancel:** in `destroy()`/`interrupt()`/`quiesce()` for a parent id, look up `this.live` entries whose header parent is the id being torn down and interrupt+destroy them first (keep a host-level `childrenOf: Map<string, Set<string>>` maintained by `createChild`/child-destroy; a map, not a header re-read — WHY: teardown must not do disk I/O to find its children). Extend the existing destroy test to pin: destroying the parent destroys the child and releases its model ref.
- [ ] **Step 8: Run all host tests → PASS** (`npx vitest run tests/native-session-host.test.ts tests/specialist-child-permissions.test.ts`).
- [ ] **Step 9: Commit** — `git commit -m "feat(specialists): child permissions (charter + envelope) and NativeSessionHost.createChild"`

### Task 6: The Task tool + capability-profile gate + reserve slots

**Files:**
- Create: `desktop/src/main/harness/tools/task.ts`
- Modify: `desktop/src/main/harness/capability-profile.ts` (add `canDelegate: boolean`)
- Modify: `desktop/src/main/harness/harness-session.ts` (dynamic attachment beside `syncSkillTool` :558 — read :540-660 first)
- Modify: `desktop/src/main/harness/native-session-host.ts` (slot counter + wiring the tool's spawn callback in `toolWiring` :341)
- Test: `desktop/tests/task-tool.test.ts`, extend `desktop/tests/capability-profile.test.ts`

**Interfaces:**
- Consumes: `createChild` (Task 5), `listSpecialists` (Task 4).
- Produces: `TaskTool` with input `{ description: string; prompt: string; agent: string; work_dir: string }`; a `ToolServices.spawnSpecialist` callback the host injects; `profile.canDelegate`; host methods `tryReserveSpecialistSlot(): boolean` / `releaseSpecialistSlot()`. Task 7 fills in the tool's `execute` result path.

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
it('returns a typed at-capacity result when no slot is free', async () => {
  const r = await runTaskTool({ agent: 'explorer', ... }, { slotFree: false });
  expect(r.isError).toBe(true);
  expect(r.text).toMatch(/at capacity \(max \d+\)/i);
  expect(r.text).toMatch(/wait/i);      // tells the model what it CAN do
});
it('returns a typed writer-busy result for a second concurrent write-capable specialist', async () => {
  const r = await runTaskTool({ agent: 'worker', ... }, { writerBusy: true });
  expect(r.isError).toBe(true);
  expect(r.text).toMatch(/another specialist with write access is running/i);
});
```

- [ ] **Step 4: Run → FAIL.**
- [ ] **Step 5: Implement `task.ts`** via `defineTool` (mirror `tools/grep.ts:215-270` structure): `name: 'Task'`; `description` enumerates specialists from `listSpecialists()` (id + description + charter) plus one orchestration-doctrine line per the Codex pattern ("Specialists work independently and report back once; give each a complete, self-contained brief"); `shortDescription` exists but the tool is never attached to simplified-tier models anyway; `inputSchema` zod with `.describe()` on every field; `permissionSubject: (a) => a.work_dir` (the envelope ask subject); `caps` generous (the report is already budget-capped upstream in Task 7). `execute` (1a, foreground-only): resolve specialist (typed refusal if unknown) → slot + single-writer checks via `ToolServices` callbacks (typed refusals) → `spawnSpecialist(...)` → await completion → return the report (Task 7 shape). On child throw/interrupt: return `isError` text naming what happened + the child id — never a dangling result.
- [ ] **Step 6: Attachment.** In `harness-session.ts`, add `syncTaskTool()` beside `syncSkillTool()` (:558): attach when `profile.canDelegate && !opts.isSpecialistChild`; re-sync on `setBinding` exactly as Skill does. `isSpecialistChild` is a new boolean on `HarnessSessionOpts` set by `createChild` (belt-and-suspenders with allowedTools omission — WHY comment). In the host, implement the slot counter: `specialistSlots = { max: hostedDefault(4) /* local: Task 1's recorded value via profile in 1b */, used: 0 }` with `tryReserve/release`; single-writer = a host-level `activeWriterChild?: string`.
- [ ] **Step 7: Run all new tests + `npx vitest run tests/harness-session-loop.test.ts`** (the frozen-surface suite must stay green — attaching a tool must not have changed any event shapes). Expected: PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat(specialists): Task tool with capability gate, reserve slots, and typed refusals"`

### Task 7: Foreground run — re-stamped events and the headroom-capped report

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` (child wire-up inside `createChild`; a `runSpecialist` helper the Task tool's `spawnSpecialist` callback calls)
- Create: `desktop/src/main/harness/specialists/report-budget.ts`
- Test: `desktop/tests/specialist-run.test.ts` (new — end-to-end with the host's existing fakes), `desktop/tests/specialist-report-budget.test.ts`

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
- [ ] **Step 3: Failing end-to-end test** in `specialist-run.test.ts`. Boot a host with the fake ModelFactory scripted so the child model emits two tool calls (against a fake in `allowedTools`) then a final text "REPORT: found it at src/x.ts". Collect every `transcript-event` the host emits. Assert:

```ts
// (a) display re-stamping: child events arrive under the PARENT's sessionId
const childStamped = events.filter(e => e.data?.agentId === childId);
expect(childStamped.length).toBeGreaterThan(0);
for (const e of childStamped) {
  expect(e.sessionId).toBe('root-1');
  expect(e.data.parentAgentToolUseId).toBe('tc-1');
  expect(KNOWN_EVENT_TYPES).toContain(e.type);          // frozen emit surface
}
// (b) persistence separation: the child's own JSONL holds its transcript under childId
const childLines = await readSessionLines(workDir, childId);
expect(childLines.length).toBeGreaterThan(1);
// (c) the parent's file contains NO child-stamped events (display-only re-emission)
const parentLines = await readSessionLines(tmpDir, 'root-1');
expect(parentLines.filter(l => l.data?.agentId)).toHaveLength(0);
// (d) the report comes back capped
expect(result.report).toContain('REPORT: found it');
```

Read the fake-model scripting helpers at the top of `native-session-host.test.ts` and `harness-session-loop.test.ts` first; reuse, don't reinvent. The fake must also be able to FAIL mid-run (throw on step 2) — add the case: `runSpecialist` rejects, and the Task tool test from Task 6 already pins that this surfaces as an `isError` result, not a dangling call.

- [ ] **Step 4: Run → FAIL.**
- [ ] **Step 5: Implement.** In `createChild`'s wiring: subscribe to the child session's `transcript-event`; for each event, (a) enqueue the ORIGINAL (child sessionId) onto the child's own `appendChain` → `store.append` (persistence), and (b) emit a display copy `{ ...event, sessionId: parentId, data: { ...event.data, parentAgentToolUseId, agentId: childId } }` on the host (NOT persisted — matches how `session-error` is display-only; the parent-file assertion (c) pins this). `runSpecialist`: send the prompt via the child session's existing send path, await turn settle (the `running` promise), extract the final assistant text from the child's history, apply `computeReportBudget` (parent remaining tokens: read the parent session's last `turn-complete` usage the way the StatusBar chip does — see `statusbar-native-usage` flow; reporters = 1 in 1a), truncate-with-notice via the existing `truncate.ts` helpers, wrap as `## Report from {title} ({specialist.id})\n...\n[full transcript: specialist session {childId}]`, release slot/writer, return.
- [ ] **Step 6: Run the new suite + the full harness set** — `npx vitest run tests/specialist-run.test.ts tests/native-session-host.test.ts tests/harness-session-loop.test.ts tests/session-store.test.ts`. Expected: PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(specialists): foreground specialist run — re-stamped display events, own-file persistence, headroom-capped report"`

### Task 8: Names, IPC exclusion sweep, and verification

**Files:**
- Create: `desktop/src/main/harness/specialists/names.ts` + `desktop/src/main/harness/specialists/name-pools.json`
- Modify: `desktop/src/main/ipc-handlers.ts` (native session-list surfaces only — grep for `SessionStore` list call sites; the Explore map places the native create/list block at :593-700)
- Test: `desktop/tests/specialist-names.test.ts`; extend `desktop/tests/specialist-run.test.ts`
- Modify: `youcoded/docs/native-runtime.md` (new "Specialists (plan 1a)" section), `docs/MAP.md` (workspace — add the specialists subsystem row), `.claude/rules/native-runtime.md` (three-line invariant addendum: depth-by-omission, display-events-not-persisted-under-parent, children-hidden-from-lists)

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
- [ ] **Step 3: Programmatic exclusion sweep.** Per the investigation-discipline rule, claiming "children appear in no list" needs a command: `rg -n "store\.list\(|SessionStore" desktop/src/main --type ts` and walk every call site; each either passes `includeChildren: true` deliberately (none should in 1a) or gets the default. Then the `sessionIdMap` decision (spec §1): in the native create path (`ipc-handlers.ts` :671-700 region), children never arrive (createChild is host-internal, not an IPC create), so **no `ipc-handlers` change is needed for 1a** — verify that by confirming `createChild` has no IPC route, and record the finding in the PR body. Extend `specialist-run.test.ts`: after a run, `store.list()` still returns only the root.
- [ ] **Step 4: Docs + rule addendum** (the three invariants, ≤3 lines each, per rules README format; `verify:` anchors pointing at `specialists/registry.ts` and `tests/specialist-run.test.ts`).
- [ ] **Step 5: Full verification** — `bash scripts/verify.sh <worktree>` → green. Note in the PR body that verify.sh is Linux-only and this plan touched no platform-sensitive path handling beyond `toPosix`-conventional spill-free code (report truncation is text-only in 1a).
- [ ] **Step 6: Commit** — `git commit -m "feat(specialists): alliterative names, list-exclusion sweep, docs + rule anchors"`

---

## Self-review checklist (run after Task 8)

- Spec §1 coverage: header fields ✅(T3) · Task tool ✅(T6) · createChild ✅(T5) · re-stamping ✅(T7) · depth-by-omission ✅(T4/T6) · single-writer ✅(T6) · cascade-cancel ✅(T5) · cold-start context ✅(T5) · containment ✅(T5).
- Spec §2: four built-ins ✅(T4) · hidden utilities ❌ deferred (optional cleanup, spec allows) · files/CC-compat → plan 1c.
- Spec §3: foreground ✅(T7) · report caps ✅(T7) · typed at-capacity/writer-busy ✅(T6) · child-failure typed result ✅(T6/T7) · background/steering/ledger/heartbeat/durability → plan 1b.
- Spec §5: charter+envelope ✅(T5) · guards-below untouched ✅(T5) · timeout redirect → plan 1b · grant keying v2 → plan 1b (with the M5 UI dependency noted).
- Spec §6: names ✅(T8) · cards/badge → plan 1c (existing CC subagent cards already render T7's stamped events — verify manually in the dev harness at 1a's end).
- Spec §8: probes 1–2 ✅(T1/T2) · probe 3 → stage-two plan.
