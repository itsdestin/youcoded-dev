# Subagent Transcript Threading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream the Task-tool subagent's internal work (tool calls, narration) into the parent AgentView card live, replacing today's blank-spinner-until-final-reply UX.

**Architecture:** New `SubagentWatcher` (per parent session) watches `<project>/<parent-session-id>/subagents/` on both platforms, reads `meta.json` + streams each `agent-<id>.jsonl` through the existing `parseTranscriptLine` parser, stamping `parentAgentToolUseId` + `agentId` on the emitted `TranscriptEvent`s. Reducer branches on those fields and routes events into a new `subagentSegments` array on the parent Agent `ToolCallState`. `AgentView` renders the segments in a collapsible nested timeline. No new IPC event types — only two optional fields added to `TranscriptEvent.data`, preserving desktop/Android parity.

**Tech Stack:** TypeScript (Electron main + React renderer), Vitest, Kotlin (Android), JUnit 4.

**Spec:** `docs/superpowers/specs/2026-04-17-subagent-threading-design.md` (master, commit `b570739`).

---

## File structure

**New desktop files:**
- `youcoded/desktop/src/main/subagent-index.ts` — pure correlation logic
- `youcoded/desktop/src/main/subagent-watcher.ts` — per-session watcher
- `youcoded/desktop/src/renderer/components/tool-views/SubagentTimeline.tsx` — nested UI component
- `youcoded/desktop/tests/subagent-index.test.ts`
- `youcoded/desktop/tests/subagent-watcher.test.ts`
- `youcoded/desktop/tests/subagent-view.test.tsx`

**Modified desktop files:**
- `youcoded/desktop/src/shared/types.ts` — `TranscriptEvent.data` + `ToolCallState` additions, new `SubagentSegment` union
- `youcoded/desktop/src/main/transcript-watcher.ts` — instantiate `SubagentIndex` + `SubagentWatcher`; record Agent tool_uses; extend `getHistory`
- `youcoded/desktop/src/renderer/state/chat-types.ts` — new `ChatAction` fields
- `youcoded/desktop/src/renderer/state/chat-reducer.ts` — branch existing `TRANSCRIPT_*` handlers to `applySubagentEvent`
- `youcoded/desktop/src/renderer/App.tsx` — transcriptHandler passes new fields through
- `youcoded/desktop/src/renderer/components/tool-views/ToolBody.tsx` — `AgentView` renders the nested timeline
- `youcoded/desktop/tests/transcript-watcher.test.ts` — regression + Agent-tool-use correlation
- `youcoded/desktop/tests/transcript-reducer.test.ts` — subagent-branch cases

**New Android files:**
- `youcoded/app/src/main/kotlin/com/youcoded/app/parser/SubagentIndex.kt`
- `youcoded/app/src/main/kotlin/com/youcoded/app/parser/SubagentWatcher.kt`
- `youcoded/app/src/test/kotlin/com/youcoded/app/parser/SubagentIndexTest.kt`
- `youcoded/app/src/test/kotlin/com/youcoded/app/parser/SubagentWatcherTest.kt`

**Modified Android files:**
- `youcoded/app/src/main/kotlin/com/youcoded/app/parser/TranscriptEvent.kt` — new optional fields
- `youcoded/app/src/main/kotlin/com/youcoded/app/bridge/TranscriptSerializer.kt` — emit new fields
- `youcoded/app/src/main/kotlin/com/youcoded/app/parser/TranscriptWatcher.kt` — instantiate Index + Watcher; record Agent tool_uses
- `youcoded/app/src/test/kotlin/com/youcoded/app/bridge/TranscriptSerializerTest.kt` — new-field round-trip

**Intentionally NOT extracted:** The spec mentioned a `ByteOffsetJsonlReader` helper reused by both parent and subagent watchers. We're deferring that extraction on both TypeScript and Kotlin sides — `SubagentWatcher` duplicates the ~40-line byte-offset read loop rather than refactoring working Windows fs.watch+poll code during a feature ship. If the duplication becomes a maintenance problem after landing, a follow-up PR can extract it.

---

## Task 0: Worktree setup

**Files:** None — working-directory setup.

- [ ] **Step 1: Create the worktree in youcoded**

Run from `C:\Users\desti\youcoded-dev`:

```bash
cd youcoded && git fetch origin && git worktree add .worktrees/subagent-threading -b feat/subagent-threading origin/master
```

Expected: `Preparing worktree (new branch 'feat/subagent-threading')` followed by `HEAD is now at <sha> <commit msg>`.

- [ ] **Step 2: Install deps in the worktree's desktop/**

```bash
cd .worktrees/subagent-threading/desktop && npm ci
```

Expected: completes without errors; `node_modules/` populated.

- [ ] **Step 3: Verify baseline tests pass**

```bash
npm test -- --run
```

Expected: all existing test files pass (no behavior changes yet). Record the baseline pass/fail count so regressions are visible after later tasks.

- [ ] **Step 4: All subsequent tasks execute inside this worktree**

For every following task, the working directory is `C:\Users\desti\youcoded-dev\youcoded\.worktrees\subagent-threading`. Use absolute paths in `Bash` commands; paths shown as `youcoded/...` in later tasks are implicitly relative to that worktree root.

---

## Task 1: Type additions (TranscriptEvent, ToolCallState, SubagentSegment)

**Files:**
- Modify: `youcoded/desktop/src/shared/types.ts`
- Modify: `youcoded/desktop/src/renderer/state/chat-types.ts`

These are type-only changes. No logic, no tests — the TypeScript compiler is the test. We add them first so later tasks can import stable shapes.

- [ ] **Step 1: Add parentAgentToolUseId + agentId to TranscriptEvent.data**

Open `youcoded/desktop/src/shared/types.ts`. Find the `TranscriptEvent` interface around line 65. Add two optional fields at the end of the `data` object:

```ts
export interface TranscriptEvent {
  type: TranscriptEventType;
  sessionId: string;
  uuid: string;
  timestamp: number;
  data: {
    text?: string;
    toolUseId?: string;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    toolResult?: string;
    isError?: boolean;
    stopReason?: string;
    structuredPatch?: StructuredPatchHunk[];
    // Populated only on events emitted from a subagent JSONL — identify
    // the parent Agent tool_use that this subagent's work threads into.
    parentAgentToolUseId?: string;
    agentId?: string;
  };
}
```

- [ ] **Step 2: Add SubagentSegment type and extend ToolCallState**

In the same file, just after the `ToolCallState` interface, add:

```ts
/**
 * One entry in a subagent's nested timeline rendered inside AgentView.
 * Narrower than ToolCallState — no awaiting-approval, no tool groups,
 * no turn tracking (subagents don't hit the permission hook flow and
 * don't have user-typed messages).
 */
export type SubagentSegment =
  | { type: 'text'; id: string; content: string }
  | {
      type: 'tool';
      id: string;
      toolUseId: string;
      toolName: string;
      input: Record<string, unknown>;
      status: 'running' | 'complete' | 'failed';
      response?: string;
      error?: string;
      structuredPatch?: StructuredPatchHunk[];
    };
```

Then edit the `ToolCallState` interface to add three optional fields:

```ts
export interface ToolCallState {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
  requestId?: string;
  permissionSuggestions?: string[];
  response?: string;
  error?: string;
  structuredPatch?: StructuredPatchHunk[];
  // Populated for tools where toolName === 'Agent'. Appended to as the
  // subagent's JSONL streams in. Drives the nested timeline in AgentView.
  subagentSegments?: SubagentSegment[];
  agentType?: string;
  agentId?: string;
}
```

- [ ] **Step 3: Add parentAgentToolUseId + agentId to transcript ChatActions**

Open `youcoded/desktop/src/renderer/state/chat-types.ts`. Find the `TRANSCRIPT_TOOL_USE`, `TRANSCRIPT_TOOL_RESULT`, and `TRANSCRIPT_ASSISTANT_TEXT` action variants in the `ChatAction` union (around lines 220-260). Add `parentAgentToolUseId?: string` and `agentId?: string` to each:

```ts
  | {
      type: 'TRANSCRIPT_ASSISTANT_TEXT';
      sessionId: string;
      uuid: string;
      text: string;
      timestamp: number;
      parentAgentToolUseId?: string;
      agentId?: string;
    }
  | {
      type: 'TRANSCRIPT_TOOL_USE';
      sessionId: string;
      uuid: string;
      toolUseId: string;
      toolName: string;
      toolInput: Record<string, unknown>;
      parentAgentToolUseId?: string;
      agentId?: string;
    }
  | {
      type: 'TRANSCRIPT_TOOL_RESULT';
      sessionId: string;
      uuid: string;
      toolUseId: string;
      result: string;
      isError: boolean;
      structuredPatch?: import('../../shared/types').StructuredPatchHunk[];
      parentAgentToolUseId?: string;
      agentId?: string;
    }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd desktop && npx tsc --noEmit
```

Expected: no errors. Existing call sites that don't set the new fields still type-check because the fields are optional.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/shared/types.ts desktop/src/renderer/state/chat-types.ts
git commit -m "feat(subagent-threading): type additions for nested timeline"
```

---

## Task 2: SubagentIndex — core logic (TDD)

**Files:**
- Create: `youcoded/desktop/src/main/subagent-index.ts`
- Test: `youcoded/desktop/tests/subagent-index.test.ts`

`SubagentIndex` is a pure per-parent-session correlation map. It's the highest-value unit to unit-test because correlation is where the subtle bugs live.

- [ ] **Step 1: Write the failing test file**

Create `youcoded/desktop/tests/subagent-index.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SubagentIndex } from '../src/main/subagent-index';

describe('SubagentIndex', () => {
  let idx: SubagentIndex;

  beforeEach(() => {
    idx = new SubagentIndex({ nowMs: () => 1000 });
  });

  it('binds a subagent to the most recent matching parent', () => {
    idx.recordParentAgentToolUse('toolu_A', 'Find bug', 'Explore');
    const bound = idx.bindSubagent('agent1', { description: 'Find bug', agentType: 'Explore' });
    expect(bound).toBe('toolu_A');
    expect(idx.lookup('agent1')).toBe('toolu_A');
  });

  it('returns null when no parent matches', () => {
    const bound = idx.bindSubagent('agent1', { description: 'Find bug', agentType: 'Explore' });
    expect(bound).toBeNull();
    expect(idx.lookup('agent1')).toBeNull();
  });

  it('FIFO: two parallel parents with identical description bind in emit order', () => {
    idx.recordParentAgentToolUse('toolu_A', 'Review diff', 'general-purpose');
    idx.recordParentAgentToolUse('toolu_B', 'Review diff', 'general-purpose');

    const bound1 = idx.bindSubagent('agent1', { description: 'Review diff', agentType: 'general-purpose' });
    const bound2 = idx.bindSubagent('agent2', { description: 'Review diff', agentType: 'general-purpose' });

    expect(bound1).toBe('toolu_A');
    expect(bound2).toBe('toolu_B');
  });

  it('does not match parents with different subagent_type', () => {
    idx.recordParentAgentToolUse('toolu_A', 'Do stuff', 'Explore');
    const bound = idx.bindSubagent('agent1', { description: 'Do stuff', agentType: 'Plan' });
    expect(bound).toBeNull();
  });

  it('binding consumes the parent so it is not reused', () => {
    idx.recordParentAgentToolUse('toolu_A', 'Find bug', 'Explore');
    idx.bindSubagent('agent1', { description: 'Find bug', agentType: 'Explore' });
    const second = idx.bindSubagent('agent2', { description: 'Find bug', agentType: 'Explore' });
    expect(second).toBeNull();
  });

  it('unbind removes a binding so lookup returns null', () => {
    idx.recordParentAgentToolUse('toolu_A', 'Find bug', 'Explore');
    idx.bindSubagent('agent1', { description: 'Find bug', agentType: 'Explore' });
    idx.unbind('agent1');
    expect(idx.lookup('agent1')).toBeNull();
  });

  it('pending subagent events buffer then flush when parent arrives later', () => {
    // Subagent file appeared before parent JSONL parsed the Agent tool_use.
    idx.bufferPendingEvent('agent1', { description: 'Find bug', agentType: 'Explore' }, { fakeEvent: 1 });
    idx.bufferPendingEvent('agent1', { description: 'Find bug', agentType: 'Explore' }, { fakeEvent: 2 });

    idx.recordParentAgentToolUse('toolu_A', 'Find bug', 'Explore');

    const flushed = idx.tryFlushPending('agent1');
    expect(flushed?.parentToolUseId).toBe('toolu_A');
    expect(flushed?.events).toEqual([{ fakeEvent: 1 }, { fakeEvent: 2 }]);
    // Flushed agent is now registered as a normal binding
    expect(idx.lookup('agent1')).toBe('toolu_A');
  });

  it('pending events age out after 30s with no matching parent', () => {
    const clock = { t: 1000 };
    const aged = new SubagentIndex({ nowMs: () => clock.t });

    aged.bufferPendingEvent('agent1', { description: 'Find bug', agentType: 'Explore' }, { fakeEvent: 1 });
    clock.t = 1000 + 30_001;
    aged.pruneExpired();

    expect(aged.tryFlushPending('agent1')).toBeNull();
  });

  it('pruneExpired keeps entries younger than 30s', () => {
    const clock = { t: 1000 };
    const aged = new SubagentIndex({ nowMs: () => clock.t });
    aged.bufferPendingEvent('agent1', { description: 'Find bug', agentType: 'Explore' }, { fakeEvent: 1 });
    clock.t = 1000 + 15_000;
    aged.pruneExpired();

    // Should still be bindable
    aged.recordParentAgentToolUse('toolu_A', 'Find bug', 'Explore');
    expect(aged.tryFlushPending('agent1')?.parentToolUseId).toBe('toolu_A');
  });
});
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
cd desktop && npx vitest run tests/subagent-index.test.ts
```

Expected: all tests fail with `Cannot find module '../src/main/subagent-index'`.

- [ ] **Step 3: Implement SubagentIndex**

Create `youcoded/desktop/src/main/subagent-index.ts`:

```ts
/**
 * Correlates subagent JSONL files to their parent Agent tool_use.
 *
 * Each session has its own instance. Tracks:
 *   - A FIFO queue of parent Agent tool_uses (description + subagent_type)
 *     recorded as the parent JSONL streams in, consumed as subagent files
 *     appear and call bindSubagent().
 *   - Resolved bindings (agentId -> parentToolUseId) for lookup during
 *     per-line event stamping.
 *   - A pending buffer for subagent events that arrived before their
 *     parent Agent tool_use was parsed (rare but possible — subagent JSONL
 *     can hit disk before the parent JSONL flush). Entries age out after
 *     30 seconds.
 *
 * Pure logic, no I/O. Timing is injected via `nowMs` so tests can drive
 * the clock deterministically.
 */

const PENDING_TTL_MS = 30_000;

interface ParentRecord {
  toolUseId: string;
  description: string;
  subagentType: string;
}

interface PendingEntry {
  description: string;
  agentType: string;
  events: unknown[];
  firstSeenAt: number;
}

export interface SubagentMeta {
  description: string;
  agentType: string;
}

export interface FlushResult {
  parentToolUseId: string;
  events: unknown[];
}

export interface SubagentIndexOptions {
  nowMs?: () => number;
}

export class SubagentIndex {
  private unmatchedParents: ParentRecord[] = [];
  private bindings = new Map<string, string>();
  private pending = new Map<string, PendingEntry>();
  private nowMs: () => number;

  constructor(opts: SubagentIndexOptions = {}) {
    this.nowMs = opts.nowMs ?? Date.now;
  }

  recordParentAgentToolUse(toolUseId: string, description: string, subagentType: string): void {
    this.unmatchedParents.push({ toolUseId, description, subagentType });
  }

  bindSubagent(agentId: string, meta: SubagentMeta): string | null {
    const i = this.unmatchedParents.findIndex(
      p => p.description === meta.description && p.subagentType === meta.agentType,
    );
    if (i < 0) return null;
    const [parent] = this.unmatchedParents.splice(i, 1);
    this.bindings.set(agentId, parent.toolUseId);
    return parent.toolUseId;
  }

  lookup(agentId: string): string | null {
    return this.bindings.get(agentId) ?? null;
  }

  unbind(agentId: string): void {
    this.bindings.delete(agentId);
  }

  /**
   * Subagent event arrived before its parent Agent tool_use was parsed —
   * buffer it. Subsequent events for the same agentId append to the buffer.
   */
  bufferPendingEvent(agentId: string, meta: SubagentMeta, event: unknown): void {
    const existing = this.pending.get(agentId);
    if (existing) {
      existing.events.push(event);
      return;
    }
    this.pending.set(agentId, {
      description: meta.description,
      agentType: meta.agentType,
      events: [event],
      firstSeenAt: this.nowMs(),
    });
  }

  /**
   * If `agentId` has buffered events and a matching parent is now available,
   * bind + flush. Caller is responsible for re-emitting the returned events
   * through the normal stamping path.
   */
  tryFlushPending(agentId: string): FlushResult | null {
    const entry = this.pending.get(agentId);
    if (!entry) return null;
    const parentToolUseId = this.bindSubagent(agentId, {
      description: entry.description,
      agentType: entry.agentType,
    });
    if (!parentToolUseId) return null;
    this.pending.delete(agentId);
    return { parentToolUseId, events: entry.events };
  }

  /** Drop pending entries older than 30s. Caller invokes periodically. */
  pruneExpired(): void {
    const cutoff = this.nowMs() - PENDING_TTL_MS;
    for (const [agentId, entry] of this.pending) {
      if (entry.firstSeenAt < cutoff) this.pending.delete(agentId);
    }
  }
}
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
cd desktop && npx vitest run tests/subagent-index.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/subagent-index.ts desktop/tests/subagent-index.test.ts
git commit -m "feat(subagent-threading): SubagentIndex correlation logic"
```

---

## Task 3: SubagentWatcher — core (TDD)

**Files:**
- Create: `youcoded/desktop/src/main/subagent-watcher.ts`
- Test: `youcoded/desktop/tests/subagent-watcher.test.ts`

`SubagentWatcher` watches one parent session's `subagents/` directory, reads `meta.json` files, and streams each `agent-*.jsonl` file through `parseTranscriptLine` with events stamped.

- [ ] **Step 1: Write the failing test file**

Create `youcoded/desktop/tests/subagent-watcher.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SubagentIndex } from '../src/main/subagent-index';
import { SubagentWatcher } from '../src/main/subagent-watcher';
import type { TranscriptEvent } from '../src/shared/types';

function writeMeta(dir: string, agentId: string, description: string, agentType: string) {
  fs.writeFileSync(
    path.join(dir, `agent-${agentId}.meta.json`),
    JSON.stringify({ description, agentType }),
  );
}

function appendLine(dir: string, agentId: string, obj: any) {
  fs.appendFileSync(
    path.join(dir, `agent-${agentId}.jsonl`),
    JSON.stringify(obj) + '\n',
  );
}

function toolUseLine(uuid: string, toolUseId: string, toolName: string, input: any) {
  return {
    type: 'assistant',
    uuid,
    isSidechain: true,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: toolUseId, name: toolName, input }],
      stop_reason: null,
    },
  };
}

function wait(ms = 50): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

describe('SubagentWatcher', () => {
  let tmpRoot: string;
  let subagentsDir: string;
  let index: SubagentIndex;
  let emitted: TranscriptEvent[];
  let watcher: SubagentWatcher;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-watcher-'));
    subagentsDir = path.join(tmpRoot, 'subagents');
    fs.mkdirSync(subagentsDir, { recursive: true });
    index = new SubagentIndex();
    emitted = [];
    watcher = new SubagentWatcher({
      sessionId: 'sess-1',
      subagentsDir,
      index,
      emit: e => emitted.push(e),
    });
  });

  afterEach(() => {
    watcher.stop();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('replays an existing subagent file on start', async () => {
    writeMeta(subagentsDir, 'abc', 'Find bug', 'Explore');
    appendLine(subagentsDir, 'abc', toolUseLine('u1', 'toolu_X', 'Read', { file_path: '/a' }));

    index.recordParentAgentToolUse('toolu_parent', 'Find bug', 'Explore');
    watcher.start();
    await wait(100);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('tool-use');
    expect(emitted[0].data.parentAgentToolUseId).toBe('toolu_parent');
    expect(emitted[0].data.agentId).toBe('abc');
    expect(emitted[0].data.toolUseId).toBe('toolu_X');
  });

  it('picks up a subagent file that appears after start', async () => {
    watcher.start();
    index.recordParentAgentToolUse('toolu_parent', 'Find bug', 'Explore');

    writeMeta(subagentsDir, 'abc', 'Find bug', 'Explore');
    appendLine(subagentsDir, 'abc', toolUseLine('u1', 'toolu_X', 'Read', { file_path: '/a' }));
    await wait(1500); // allow fs.watch/poll to fire

    const stamped = emitted.find(e => e.type === 'tool-use');
    expect(stamped?.data.parentAgentToolUseId).toBe('toolu_parent');
  });

  it('streams new lines appended to an existing subagent file', async () => {
    writeMeta(subagentsDir, 'abc', 'Find bug', 'Explore');
    appendLine(subagentsDir, 'abc', toolUseLine('u1', 'toolu_X', 'Read', { file_path: '/a' }));

    index.recordParentAgentToolUse('toolu_parent', 'Find bug', 'Explore');
    watcher.start();
    await wait(100);
    expect(emitted).toHaveLength(1);

    appendLine(subagentsDir, 'abc', toolUseLine('u2', 'toolu_Y', 'Grep', { pattern: 'foo' }));
    await wait(1500);

    expect(emitted.length).toBeGreaterThanOrEqual(2);
    const grep = emitted.find(e => e.data.toolName === 'Grep');
    expect(grep?.data.parentAgentToolUseId).toBe('toolu_parent');
    expect(grep?.data.agentId).toBe('abc');
  });

  it('buffers events when no parent binding exists, flushes when parent arrives', async () => {
    writeMeta(subagentsDir, 'abc', 'Find bug', 'Explore');
    appendLine(subagentsDir, 'abc', toolUseLine('u1', 'toolu_X', 'Read', { file_path: '/a' }));

    watcher.start();
    await wait(100);
    expect(emitted).toHaveLength(0); // buffered

    index.recordParentAgentToolUse('toolu_parent', 'Find bug', 'Explore');
    watcher.flushPendingFor('abc');
    await wait(50);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].data.parentAgentToolUseId).toBe('toolu_parent');
  });

  it('dedups on re-reading the same lines (seen-uuid window)', async () => {
    writeMeta(subagentsDir, 'abc', 'Find bug', 'Explore');
    appendLine(subagentsDir, 'abc', toolUseLine('u1', 'toolu_X', 'Read', { file_path: '/a' }));

    index.recordParentAgentToolUse('toolu_parent', 'Find bug', 'Explore');
    watcher.start();
    await wait(100);
    expect(emitted).toHaveLength(1);

    // Simulate file-size shrink then re-growth (e.g. poll triggers redundant read).
    watcher.forceRereadFor('abc');
    await wait(50);
    expect(emitted).toHaveLength(1); // no duplicate emit
  });

  it('getHistory yields all events from all subagent files for replay', () => {
    writeMeta(subagentsDir, 'abc', 'Find bug', 'Explore');
    appendLine(subagentsDir, 'abc', toolUseLine('u1', 'toolu_X', 'Read', { file_path: '/a' }));
    writeMeta(subagentsDir, 'def', 'Other', 'Plan');
    appendLine(subagentsDir, 'def', toolUseLine('u2', 'toolu_Y', 'Grep', { pattern: 'foo' }));

    index.recordParentAgentToolUse('toolu_P1', 'Find bug', 'Explore');
    index.recordParentAgentToolUse('toolu_P2', 'Other', 'Plan');

    const events = watcher.getHistory();
    expect(events.length).toBe(2);
    const byTool: Record<string, TranscriptEvent> = {};
    for (const e of events) byTool[e.data.toolName!] = e;
    expect(byTool['Read'].data.parentAgentToolUseId).toBe('toolu_P1');
    expect(byTool['Read'].data.agentId).toBe('abc');
    expect(byTool['Grep'].data.parentAgentToolUseId).toBe('toolu_P2');
    expect(byTool['Grep'].data.agentId).toBe('def');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd desktop && npx vitest run tests/subagent-watcher.test.ts
```

Expected: all tests fail with module-not-found.

- [ ] **Step 3: Implement SubagentWatcher**

Create `youcoded/desktop/src/main/subagent-watcher.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { parseTranscriptLine } from './transcript-watcher';
import { SubagentIndex } from './subagent-index';
import { TranscriptEvent } from '../shared/types';

interface PerFileState {
  agentId: string;
  jsonlPath: string;
  metaPath: string;
  offset: number;
  partialLine: string;
  seenUuids: Set<string>;
  watcher: fs.FSWatcher | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  bound: boolean; // true once SubagentIndex has a parent for this agent
}

export interface SubagentWatcherOptions {
  sessionId: string;
  subagentsDir: string;
  index: SubagentIndex;
  emit: (event: TranscriptEvent) => void;
}

/**
 * Watches one parent session's `<parent>/subagents/` directory. For each
 * `agent-<id>.jsonl` that appears, reads the sibling .meta.json, binds to
 * a parent Agent tool_use via SubagentIndex, then streams the JSONL
 * through parseTranscriptLine with parentAgentToolUseId + agentId stamped
 * on each emitted event.
 *
 * Windows fs.watch on a directory is flaky — we combine fs.watch with a
 * 1s poll that lists the directory and picks up new .jsonl files. On each
 * JSONL we combine fs.watch-on-file with a 2s poll for the same reason,
 * matching the strategy in TranscriptWatcher.
 */
export class SubagentWatcher {
  private readonly sessionId: string;
  private readonly subagentsDir: string;
  private readonly index: SubagentIndex;
  private readonly emitFn: (event: TranscriptEvent) => void;
  private perFile = new Map<string, PerFileState>();
  private dirWatcher: fs.FSWatcher | null = null;
  private dirPollTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(opts: SubagentWatcherOptions) {
    this.sessionId = opts.sessionId;
    this.subagentsDir = opts.subagentsDir;
    this.index = opts.index;
    this.emitFn = opts.emit;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.scanDirectory(); // synchronous replay of any existing files
    this.attachDirWatcher();
    // Age out pending buffered events every 5s so a lingering unbound
    // subagent doesn't leak memory.
    this.pruneTimer = setInterval(() => this.index.pruneExpired(), 5000);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.dirWatcher) { this.dirWatcher.close(); this.dirWatcher = null; }
    if (this.dirPollTimer) { clearInterval(this.dirPollTimer); this.dirPollTimer = null; }
    if (this.pruneTimer) { clearInterval(this.pruneTimer); this.pruneTimer = null; }
    for (const state of this.perFile.values()) {
      if (state.watcher) state.watcher.close();
      if (state.pollTimer) clearInterval(state.pollTimer);
    }
    this.perFile.clear();
  }

  /**
   * Full-history replay. Called by TranscriptWatcher.getHistory() so a
   * detach/re-dock or remote-access replay can rebuild nested state.
   * Does NOT mutate live watcher state — safe alongside an active start().
   */
  getHistory(): TranscriptEvent[] {
    if (!fs.existsSync(this.subagentsDir)) return [];
    const events: TranscriptEvent[] = [];
    for (const name of fs.readdirSync(this.subagentsDir)) {
      if (!name.endsWith('.jsonl') || !name.startsWith('agent-')) continue;
      const agentId = name.slice('agent-'.length, -'.jsonl'.length);
      const meta = this.readMeta(agentId);
      if (!meta) continue;
      const parentToolUseId = this.index.bindSubagent(agentId, meta);
      if (!parentToolUseId) continue;
      const jsonlPath = path.join(this.subagentsDir, name);
      let raw: string;
      try { raw = fs.readFileSync(jsonlPath, 'utf8'); } catch { continue; }
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = parseTranscriptLine(trimmed, this.sessionId);
        for (const ev of parsed) {
          events.push(this.stamp(ev, parentToolUseId, agentId));
        }
      }
    }
    return events;
  }

  /**
   * Called by TranscriptWatcher when it records a new parent Agent
   * tool_use. Attempts to flush any pending (buffered) events for any
   * agentId whose meta matches.
   */
  flushPendingFor(agentId: string): void {
    const res = this.index.tryFlushPending(agentId);
    if (!res) return;
    for (const ev of res.events as TranscriptEvent[]) {
      this.emitFn(this.stamp(ev, res.parentToolUseId, agentId));
    }
    const state = this.perFile.get(agentId);
    if (state) state.bound = true;
  }

  /** Test-only hook: force a re-read of a single subagent file. */
  forceRereadFor(agentId: string): void {
    const state = this.perFile.get(agentId);
    if (state) this.readNewLines(state).catch(() => undefined);
  }

  // ---- internals ----

  private readMeta(agentId: string): { description: string; agentType: string } | null {
    const metaPath = path.join(this.subagentsDir, `agent-${agentId}.meta.json`);
    if (!fs.existsSync(metaPath)) return null;
    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      const obj = JSON.parse(raw);
      if (typeof obj?.description !== 'string' || typeof obj?.agentType !== 'string') return null;
      return { description: obj.description, agentType: obj.agentType };
    } catch { return null; }
  }

  private scanDirectory(): void {
    if (!fs.existsSync(this.subagentsDir)) return;
    for (const name of fs.readdirSync(this.subagentsDir)) {
      if (!name.endsWith('.jsonl') || !name.startsWith('agent-')) continue;
      const agentId = name.slice('agent-'.length, -'.jsonl'.length);
      this.trackSubagent(agentId);
    }
  }

  private attachDirWatcher(): void {
    if (!fs.existsSync(this.subagentsDir)) {
      // The directory is created by Claude Code only once a subagent runs.
      // Poll the parent until it exists; upgrade to fs.watch once it does.
      this.dirPollTimer = setInterval(() => {
        if (fs.existsSync(this.subagentsDir)) {
          if (this.dirPollTimer) { clearInterval(this.dirPollTimer); this.dirPollTimer = null; }
          this.scanDirectory();
          this.attachDirWatcher();
        }
      }, 1000);
      return;
    }
    try {
      this.dirWatcher = fs.watch(this.subagentsDir, () => this.scanDirectory());
      this.dirWatcher.on('error', () => {
        if (this.dirWatcher) { this.dirWatcher.close(); this.dirWatcher = null; }
        this.startDirPoll();
      });
      this.startDirPoll(); // 1s safety-net poll alongside watch
    } catch {
      this.startDirPoll();
    }
  }

  private startDirPoll(): void {
    if (this.dirPollTimer) return;
    this.dirPollTimer = setInterval(() => this.scanDirectory(), 1000);
  }

  private trackSubagent(agentId: string): void {
    if (this.perFile.has(agentId)) return;
    const meta = this.readMeta(agentId);
    if (!meta) return;
    const jsonlPath = path.join(this.subagentsDir, `agent-${agentId}.jsonl`);
    const metaPath = path.join(this.subagentsDir, `agent-${agentId}.meta.json`);
    const state: PerFileState = {
      agentId,
      jsonlPath,
      metaPath,
      offset: 0,
      partialLine: '',
      seenUuids: new Set(),
      watcher: null,
      pollTimer: null,
      bound: false,
    };
    this.perFile.set(agentId, state);

    // Try to bind immediately. If no parent yet, events read from the file
    // will be buffered until flushPendingFor() is called by TranscriptWatcher.
    const parentToolUseId = this.index.bindSubagent(agentId, meta);
    state.bound = !!parentToolUseId;

    this.attachFileWatch(state);
    // Initial read — catches all existing bytes.
    this.readNewLines(state).catch(() => undefined);
  }

  private attachFileWatch(state: PerFileState): void {
    try {
      state.watcher = fs.watch(state.jsonlPath, () => {
        this.readNewLines(state).catch(() => undefined);
      });
      state.watcher.on('error', () => {
        if (state.watcher) { state.watcher.close(); state.watcher = null; }
        this.startFilePoll(state);
      });
      this.startFilePoll(state); // 2s safety-net poll alongside watch
    } catch {
      this.startFilePoll(state);
    }
  }

  private startFilePoll(state: PerFileState): void {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(() => {
      this.readNewLines(state).catch(() => undefined);
    }, state.watcher ? 2000 : 1000);
  }

  private async readNewLines(state: PerFileState): Promise<void> {
    let stat: fs.Stats;
    try { stat = await fs.promises.stat(state.jsonlPath); } catch { return; }
    const fileSize = stat.size;
    if (fileSize < state.offset) {
      state.offset = 0;
      state.partialLine = '';
    }
    if (fileSize <= state.offset) return;

    const buffer = Buffer.alloc(fileSize - state.offset);
    let handle: fs.promises.FileHandle;
    try { handle = await fs.promises.open(state.jsonlPath, 'r'); } catch { return; }
    try { await handle.read(buffer, 0, buffer.length, state.offset); }
    finally { await handle.close(); }
    state.offset = fileSize;

    const text = buffer.toString('utf8');
    const chunks = text.split('\n');
    chunks[0] = state.partialLine + chunks[0];
    state.partialLine = chunks.pop() || '';

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      const events = parseTranscriptLine(trimmed, this.sessionId);
      if (events.length === 0) continue;
      const lineUuid = events[0].uuid;
      if (lineUuid) {
        if (state.seenUuids.has(lineUuid)) continue;
        state.seenUuids.add(lineUuid);
        if (state.seenUuids.size > 500) {
          state.seenUuids = new Set([...state.seenUuids].slice(-500));
        }
      }
      for (const ev of events) this.deliver(state, ev);
    }
  }

  private deliver(state: PerFileState, ev: TranscriptEvent): void {
    if (state.bound) {
      const parentToolUseId = this.index.lookup(state.agentId);
      if (parentToolUseId) {
        this.emitFn(this.stamp(ev, parentToolUseId, state.agentId));
        return;
      }
    }
    // Not bound yet — buffer for eventual flush.
    const meta = this.readMeta(state.agentId);
    if (meta) this.index.bufferPendingEvent(state.agentId, meta, ev);
  }

  private stamp(ev: TranscriptEvent, parentAgentToolUseId: string, agentId: string): TranscriptEvent {
    return { ...ev, data: { ...ev.data, parentAgentToolUseId, agentId } };
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd desktop && npx vitest run tests/subagent-watcher.test.ts
```

Expected: all 6 tests pass. If a timing test is flaky, bump its `wait()` to 2000ms and re-run; do not reduce below 1500ms on Windows.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/subagent-watcher.ts desktop/tests/subagent-watcher.test.ts
git commit -m "feat(subagent-threading): SubagentWatcher with directory + file watching"
```

---

## Task 4: Wire SubagentWatcher into TranscriptWatcher

**Files:**
- Modify: `youcoded/desktop/src/main/transcript-watcher.ts`
- Modify: `youcoded/desktop/tests/transcript-watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `youcoded/desktop/tests/transcript-watcher.test.ts` (inside the top-level describe for TranscriptWatcher):

```ts
  it('records Agent tool_use in SubagentIndex for correlation', async () => {
    // Setup: create a temp ~/.claude/projects dir with a parent JSONL
    // containing an Agent tool_use, verify getHistory returns a tool-use
    // event with no parentAgentToolUseId (parent events stay top-level)
    // and that the matching subagent file's events ARE stamped.
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-agent-'));
    const slug = 'C--tmp-project';
    const projectDir = path.join(tmpRoot, slug);
    fs.mkdirSync(projectDir, { recursive: true });
    const sessionId = 'sess-abc';
    const parentJsonl = path.join(projectDir, `${sessionId}.jsonl`);
    const subagentsDir = path.join(projectDir, sessionId, 'subagents');
    fs.mkdirSync(subagentsDir, { recursive: true });

    // Parent emits an Agent tool_use
    fs.writeFileSync(parentJsonl, JSON.stringify({
      type: 'assistant',
      uuid: 'uuid-1',
      message: {
        role: 'assistant',
        content: [{
          type: 'tool_use', id: 'toolu_P1', name: 'Agent',
          input: { description: 'Find bug', subagent_type: 'Explore', prompt: 'go' },
        }],
        stop_reason: null,
      },
    }) + '\n');

    // Subagent file
    fs.writeFileSync(
      path.join(subagentsDir, 'agent-abc.meta.json'),
      JSON.stringify({ description: 'Find bug', agentType: 'Explore' }),
    );
    fs.writeFileSync(
      path.join(subagentsDir, 'agent-abc.jsonl'),
      JSON.stringify({
        type: 'assistant', uuid: 'uuid-s1', isSidechain: true,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_S1', name: 'Read', input: { file_path: '/a' } }],
          stop_reason: null,
        },
      }) + '\n',
    );

    const watcher = new TranscriptWatcher(tmpRoot);
    watcher.startWatching('desktop-sess-1', sessionId, 'C:/tmp/project');

    const history = watcher.getHistory('desktop-sess-1');
    watcher.stopWatching('desktop-sess-1');
    fs.rmSync(tmpRoot, { recursive: true, force: true });

    const parentToolUse = history.find(e => e.type === 'tool-use' && e.data.toolName === 'Agent');
    const subagentToolUse = history.find(e => e.type === 'tool-use' && e.data.toolName === 'Read');
    expect(parentToolUse).toBeDefined();
    expect(parentToolUse!.data.parentAgentToolUseId).toBeUndefined();
    expect(subagentToolUse).toBeDefined();
    expect(subagentToolUse!.data.parentAgentToolUseId).toBe('toolu_P1');
    expect(subagentToolUse!.data.agentId).toBe('abc');
  });
```

Also confirm `import os from 'os'` and `import path from 'path'` and `import fs from 'fs'` are at the top of the file (they are — `transcript-watcher.test.ts` already imports them).

- [ ] **Step 2: Run tests — expect failure**

```bash
cd desktop && npx vitest run tests/transcript-watcher.test.ts -t "records Agent tool_use"
```

Expected: the new test fails — TranscriptWatcher isn't recording Agent tool_uses yet; subagent events aren't threaded.

- [ ] **Step 3: Modify TranscriptWatcher**

In `youcoded/desktop/src/main/transcript-watcher.ts`:

Add imports near the top:

```ts
import { SubagentIndex } from './subagent-index';
import { SubagentWatcher } from './subagent-watcher';
```

Add two fields to the `WatchedSession` interface:

```ts
interface WatchedSession {
  desktopSessionId: string;
  claudeSessionId: string;
  cwd: string;
  jsonlPath: string;
  offset: number;
  partialLine: string;
  seenUuids: Set<string>;
  watcher: fs.FSWatcher | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  subagentIndex: SubagentIndex;
  subagentWatcher: SubagentWatcher;
}
```

In `startWatching`, compute the subagents dir, instantiate the index + watcher, and store them on the session. Replace the existing body with (preserving the existing flow):

```ts
  startWatching(desktopSessionId: string, claudeSessionId: string, cwd: string): void {
    if (this.sessions.has(desktopSessionId)) {
      this.stopWatching(desktopSessionId);
    }

    const slug = cwdToProjectSlug(cwd);
    const jsonlPath = path.join(this.claudeConfigDir, slug, `${claudeSessionId}.jsonl`);
    const subagentsDir = path.join(this.claudeConfigDir, slug, claudeSessionId, 'subagents');

    const subagentIndex = new SubagentIndex();
    const subagentWatcher = new SubagentWatcher({
      sessionId: desktopSessionId,
      subagentsDir,
      index: subagentIndex,
      emit: (event) => this.emit('transcript-event', event),
    });

    const session: WatchedSession = {
      desktopSessionId, claudeSessionId, cwd, jsonlPath,
      offset: 0,
      partialLine: '',
      seenUuids: new Set(),
      watcher: null,
      pollTimer: null,
      subagentIndex,
      subagentWatcher,
    };
    this.sessions.set(desktopSessionId, session);

    // Start subagent watcher immediately — directory may not exist yet
    // but the watcher polls for it.
    subagentWatcher.start();

    if (fs.existsSync(jsonlPath)) {
      this.readNewLines(session);
      this.attachFsWatch(session);
    } else {
      this.startPolling(session);
    }
  }
```

In `cleanupSession`, stop the subagent watcher:

```ts
  private cleanupSession(session: WatchedSession): void {
    if (session.watcher) { session.watcher.close(); session.watcher = null; }
    this.stopPolling(session);
    session.subagentWatcher.stop();
  }
```

In `readNewLines`, after calling `parseTranscriptLine` and before emitting, if the event is an Agent tool_use, record it in the index and flush any pending subagent events:

Find the emit loop near the end of `readNewLines`:

```ts
      for (const event of events) {
        if (isRepeat && event.type === 'assistant-text') continue;
        this.emit('transcript-event', event);
      }
```

Replace with:

```ts
      for (const event of events) {
        if (isRepeat && event.type === 'assistant-text') continue;
        // When a parent Agent tool_use appears, register it for subagent
        // correlation and flush any subagent events that arrived before
        // the parent JSONL line was parsed.
        if (event.type === 'tool-use' && event.data.toolName === 'Agent') {
          const description = (event.data.toolInput?.description as string) || '';
          const subagentType = (event.data.toolInput?.subagent_type as string) || '';
          session.subagentIndex.recordParentAgentToolUse(
            event.data.toolUseId!, description, subagentType,
          );
          // Try every currently-buffered agentId — a file may have appeared
          // with events waiting on this specific parent.
          this.flushAllPending(session);
        }
        this.emit('transcript-event', event);
      }
```

Add the helper method on the class:

```ts
  private flushAllPending(session: WatchedSession): void {
    // SubagentWatcher tracks per-file state but only it knows agentIds.
    // Expose a directory scan that attempts flush for each known id.
    session.subagentWatcher.flushAllPending();
  }
```

In `SubagentWatcher` (the file from Task 3), add the public method:

```ts
  flushAllPending(): void {
    for (const agentId of this.perFile.keys()) {
      this.flushPendingFor(agentId);
    }
  }
```

Extend `getHistory`:

```ts
  getHistory(desktopSessionId: string): TranscriptEvent[] {
    const session = this.sessions.get(desktopSessionId);
    if (!session) return [];
    const events: TranscriptEvent[] = [];
    // Parent first: populates SubagentIndex.unmatchedParents so subagent
    // replay can bind.
    if (fs.existsSync(session.jsonlPath)) {
      let raw: string;
      try { raw = fs.readFileSync(session.jsonlPath, 'utf8'); }
      catch { raw = ''; }
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const parsed = parseTranscriptLine(line, desktopSessionId);
        for (const ev of parsed) {
          if (ev.type === 'tool-use' && ev.data.toolName === 'Agent') {
            session.subagentIndex.recordParentAgentToolUse(
              ev.data.toolUseId!,
              (ev.data.toolInput?.description as string) || '',
              (ev.data.toolInput?.subagent_type as string) || '',
            );
          }
          events.push(ev);
        }
      }
    }
    // Subagents second: bind + append.
    for (const ev of session.subagentWatcher.getHistory()) events.push(ev);
    return events;
  }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd desktop && npx vitest run tests/transcript-watcher.test.ts
```

Expected: all existing tests still pass AND the new Agent-correlation test passes.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/transcript-watcher.ts desktop/src/main/subagent-watcher.ts desktop/tests/transcript-watcher.test.ts
git commit -m "feat(subagent-threading): wire SubagentWatcher into TranscriptWatcher"
```

---

## Task 5: Reducer branch — applySubagentEvent (TDD)

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/chat-reducer.ts`
- Modify: `youcoded/desktop/tests/transcript-reducer.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `youcoded/desktop/tests/transcript-reducer.test.ts`:

```ts
describe('Subagent threading', () => {
  let state: ChatState;

  beforeEach(() => {
    state = chatReducer(new Map(), { type: 'SESSION_INIT', sessionId: SESSION });
  });

  function emitParentAgentToolUse(): ChatState {
    return chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE',
      sessionId: SESSION,
      uuid: 'uuid-parent',
      toolUseId: 'toolu_parent',
      toolName: 'Agent',
      toolInput: { description: 'Find bug', subagent_type: 'Explore', prompt: 'go' },
    });
  }

  it('subagent tool_use appends a subagent segment to the parent Agent tool', () => {
    state = emitParentAgentToolUse();
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE',
      sessionId: SESSION,
      uuid: 'uuid-s1',
      toolUseId: 'toolu_child',
      toolName: 'Read',
      toolInput: { file_path: '/a' },
      parentAgentToolUseId: 'toolu_parent',
      agentId: 'abc',
    });

    const session = state.get(SESSION)!;
    const parent = session.toolCalls.get('toolu_parent')!;
    expect(parent.subagentSegments).toBeDefined();
    expect(parent.subagentSegments!.length).toBe(1);
    const seg = parent.subagentSegments![0];
    expect(seg.type).toBe('tool');
    if (seg.type === 'tool') {
      expect(seg.toolUseId).toBe('toolu_child');
      expect(seg.toolName).toBe('Read');
      expect(seg.status).toBe('running');
    }
    // Top-level toolCalls must NOT have the subagent tool entry.
    expect(session.toolCalls.has('toolu_child')).toBe(false);
    // activeTurnToolIds must NOT include the subagent tool.
    expect(session.activeTurnToolIds.has('toolu_child')).toBe(false);
  });

  it('subagent tool_result flips the matching segment to complete', () => {
    state = emitParentAgentToolUse();
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE', sessionId: SESSION, uuid: 'uuid-s1',
      toolUseId: 'toolu_child', toolName: 'Read', toolInput: {},
      parentAgentToolUseId: 'toolu_parent', agentId: 'abc',
    });
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_RESULT', sessionId: SESSION, uuid: 'uuid-s2',
      toolUseId: 'toolu_child', result: 'file contents', isError: false,
      parentAgentToolUseId: 'toolu_parent', agentId: 'abc',
    });

    const parent = state.get(SESSION)!.toolCalls.get('toolu_parent')!;
    const seg = parent.subagentSegments![0];
    expect(seg.type).toBe('tool');
    if (seg.type === 'tool') {
      expect(seg.status).toBe('complete');
      expect(seg.response).toBe('file contents');
    }
  });

  it('subagent assistant text appends a text segment', () => {
    state = emitParentAgentToolUse();
    state = chatReducer(state, {
      type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SESSION, uuid: 'uuid-s1',
      text: "I'll check the Android side.",
      timestamp: 1000,
      parentAgentToolUseId: 'toolu_parent', agentId: 'abc',
    });
    const parent = state.get(SESSION)!.toolCalls.get('toolu_parent')!;
    expect(parent.subagentSegments!.length).toBe(1);
    const seg = parent.subagentSegments![0];
    expect(seg.type).toBe('text');
    if (seg.type === 'text') expect(seg.content).toBe("I'll check the Android side.");
  });

  it('subagent event for unknown parent is a no-op', () => {
    const before = state;
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE', sessionId: SESSION, uuid: 'uuid-s1',
      toolUseId: 'toolu_child', toolName: 'Read', toolInput: {},
      parentAgentToolUseId: 'toolu_nonexistent', agentId: 'abc',
    });
    expect(state).toBe(before);
  });

  it('subagent events do not touch activeTurnToolIds or toolGroups', () => {
    state = emitParentAgentToolUse();
    const beforeSession = state.get(SESSION)!;
    const activeIdsBefore = new Set(beforeSession.activeTurnToolIds);
    const groupsBefore = new Map(beforeSession.toolGroups);

    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE', sessionId: SESSION, uuid: 'uuid-s1',
      toolUseId: 'toolu_child', toolName: 'Read', toolInput: {},
      parentAgentToolUseId: 'toolu_parent', agentId: 'abc',
    });

    const afterSession = state.get(SESSION)!;
    expect(afterSession.activeTurnToolIds).toEqual(activeIdsBefore);
    expect(afterSession.toolGroups.size).toBe(groupsBefore.size);
  });

  it('duplicate subagent tool_use for same toolUseId updates in place (no duplicate segment)', () => {
    state = emitParentAgentToolUse();
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE', sessionId: SESSION, uuid: 'uuid-s1',
      toolUseId: 'toolu_child', toolName: 'Read', toolInput: {},
      parentAgentToolUseId: 'toolu_parent', agentId: 'abc',
    });
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE', sessionId: SESSION, uuid: 'uuid-s1',
      toolUseId: 'toolu_child', toolName: 'Read', toolInput: { file_path: '/updated' },
      parentAgentToolUseId: 'toolu_parent', agentId: 'abc',
    });
    const parent = state.get(SESSION)!.toolCalls.get('toolu_parent')!;
    expect(parent.subagentSegments!.length).toBe(1);
  });

  it('CLEAR_TIMELINE preserves subagentSegments on toolCalls entries', () => {
    state = emitParentAgentToolUse();
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE', sessionId: SESSION, uuid: 'uuid-s1',
      toolUseId: 'toolu_child', toolName: 'Read', toolInput: {},
      parentAgentToolUseId: 'toolu_parent', agentId: 'abc',
    });
    state = chatReducer(state, {
      type: 'CLEAR_TIMELINE', sessionId: SESSION, markerId: 'm1', timestamp: 1000,
    });
    const session = state.get(SESSION)!;
    const parent = session.toolCalls.get('toolu_parent')!;
    expect(parent.subagentSegments!.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd desktop && npx vitest run tests/transcript-reducer.test.ts -t "Subagent threading"
```

Expected: all 7 new tests fail.

- [ ] **Step 3: Implement the reducer branch**

In `youcoded/desktop/src/renderer/state/chat-reducer.ts`:

Add the import at the top (if not already present):

```ts
import { ToolCallState, SubagentSegment } from '../../shared/types';
```

Add the `applySubagentEvent` helper just before the `chatReducer` function:

```ts
/**
 * Route a subagent-originated transcript event into the parent Agent
 * tool's `subagentSegments`. Returns the original state when the parent
 * tool is missing (the subagent event arrived before the parent tool_use
 * was dispatched — reducer bails; next event will succeed).
 */
function applySubagentEvent(state: ChatState, action: ChatAction): ChatState {
  if (action.type !== 'TRANSCRIPT_TOOL_USE'
      && action.type !== 'TRANSCRIPT_TOOL_RESULT'
      && action.type !== 'TRANSCRIPT_ASSISTANT_TEXT') {
    return state;
  }
  const parentId = (action as any).parentAgentToolUseId as string | undefined;
  if (!parentId) return state;

  const session = state.get(action.sessionId);
  if (!session) return state;
  const parent = session.toolCalls.get(parentId);
  if (!parent) return state;

  const segments: SubagentSegment[] = parent.subagentSegments ? [...parent.subagentSegments] : [];

  if (action.type === 'TRANSCRIPT_ASSISTANT_TEXT') {
    segments.push({
      type: 'text',
      id: `sa-text-${action.uuid}`,
      content: action.text,
    });
  } else if (action.type === 'TRANSCRIPT_TOOL_USE') {
    const existingIdx = segments.findIndex(
      s => s.type === 'tool' && s.toolUseId === action.toolUseId,
    );
    const next: SubagentSegment = {
      type: 'tool',
      id: `sa-tool-${action.toolUseId}`,
      toolUseId: action.toolUseId,
      toolName: action.toolName,
      input: action.toolInput,
      status: 'running',
    };
    if (existingIdx >= 0) segments[existingIdx] = next;
    else segments.push(next);
  } else if (action.type === 'TRANSCRIPT_TOOL_RESULT') {
    const idx = segments.findIndex(
      s => s.type === 'tool' && s.toolUseId === action.toolUseId,
    );
    if (idx >= 0 && segments[idx].type === 'tool') {
      const existing = segments[idx] as Extract<SubagentSegment, { type: 'tool' }>;
      segments[idx] = action.isError
        ? { ...existing, status: 'failed', error: action.result }
        : {
            ...existing,
            status: 'complete',
            response: action.result,
            ...(action.structuredPatch ? { structuredPatch: action.structuredPatch } : {}),
          };
    }
    // If no matching tool segment exists, drop — tool_result arrived before
    // its tool_use (shouldn't happen given FIFO ordering in a single JSONL).
  }

  const toolCalls = new Map(session.toolCalls);
  const updated: ToolCallState = { ...parent, subagentSegments: segments };
  toolCalls.set(parentId, updated);
  const next = new Map(state);
  next.set(action.sessionId, { ...session, toolCalls });
  return next;
}
```

In the three reducer case bodies (`TRANSCRIPT_TOOL_USE`, `TRANSCRIPT_TOOL_RESULT`, `TRANSCRIPT_ASSISTANT_TEXT`), add the branch as the **first line** of each case:

```ts
    case 'TRANSCRIPT_TOOL_USE': {
      if (action.parentAgentToolUseId) return applySubagentEvent(state, action);
      // ...existing logic unchanged
    }

    case 'TRANSCRIPT_TOOL_RESULT': {
      if (action.parentAgentToolUseId) return applySubagentEvent(state, action);
      // ...existing logic unchanged
    }

    case 'TRANSCRIPT_ASSISTANT_TEXT': {
      if (action.parentAgentToolUseId) return applySubagentEvent(state, action);
      // ...existing logic unchanged
    }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd desktop && npx vitest run tests/transcript-reducer.test.ts
```

Expected: all existing reducer tests still pass, plus the 7 new subagent tests pass.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/state/chat-reducer.ts desktop/tests/transcript-reducer.test.ts
git commit -m "feat(subagent-threading): reducer routes subagent events to nested segments"
```

---

## Task 6: App.tsx transcriptHandler passes new fields through

**Files:**
- Modify: `youcoded/desktop/src/renderer/App.tsx`

The action types gained optional fields in Task 1; now the main transcript event handler needs to forward them when present. No new tests — dispatch changes are covered by the reducer tests (Task 5) and end-to-end by the manual verification (Task 14).

- [ ] **Step 1: Update the three dispatch branches in App.tsx**

In `youcoded/desktop/src/renderer/App.tsx`, find the transcript handler around line 466. Update three case blocks:

```ts
        case 'assistant-text':
          batchTranscriptDispatch({
            type: 'TRANSCRIPT_ASSISTANT_TEXT',
            sessionId: event.sessionId,
            uuid: event.uuid,
            text: event.data.text,
            timestamp: event.timestamp,
            parentAgentToolUseId: event.data.parentAgentToolUseId,
            agentId: event.data.agentId,
          });
          break;
        case 'tool-use':
          batchTranscriptDispatch({
            type: 'TRANSCRIPT_TOOL_USE',
            sessionId: event.sessionId,
            uuid: event.uuid,
            toolUseId: event.data.toolUseId,
            toolName: event.data.toolName,
            toolInput: event.data.toolInput || {},
            parentAgentToolUseId: event.data.parentAgentToolUseId,
            agentId: event.data.agentId,
          });
          break;
        case 'tool-result':
          batchTranscriptDispatch({
            type: 'TRANSCRIPT_TOOL_RESULT',
            sessionId: event.sessionId,
            uuid: event.uuid,
            toolUseId: event.data.toolUseId,
            result: event.data.toolResult || '',
            isError: event.data.isError || false,
            structuredPatch: event.data.structuredPatch,
            parentAgentToolUseId: event.data.parentAgentToolUseId,
            agentId: event.data.agentId,
          });
          break;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd desktop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/App.tsx
git commit -m "feat(subagent-threading): forward new fields through App.tsx dispatch"
```

---

## Task 7: SubagentTimeline component (TDD)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/tool-views/SubagentTimeline.tsx`
- Test: `youcoded/desktop/tests/subagent-view.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `youcoded/desktop/tests/subagent-view.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubagentTimeline } from '../src/renderer/components/tool-views/SubagentTimeline';
import type { SubagentSegment } from '../src/shared/types';

describe('SubagentTimeline', () => {
  it('renders nothing for empty segments', () => {
    const { container } = render(<SubagentTimeline segments={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a text segment as prose', () => {
    const segments: SubagentSegment[] = [
      { type: 'text', id: 't1', content: 'I will check the Android side.' },
    ];
    render(<SubagentTimeline segments={segments} />);
    expect(screen.getByText(/Android side/)).toBeInTheDocument();
  });

  it('renders a tool segment with tool name visible', () => {
    const segments: SubagentSegment[] = [
      {
        type: 'tool', id: 't1', toolUseId: 'toolu_X', toolName: 'Read',
        input: { file_path: '/a' }, status: 'running',
      },
    ];
    render(<SubagentTimeline segments={segments} />);
    expect(screen.getByText(/Read/)).toBeInTheDocument();
  });

  it('renders multiple segments in order', () => {
    const segments: SubagentSegment[] = [
      { type: 'text', id: 't1', content: 'First thought' },
      { type: 'tool', id: 't2', toolUseId: 'toolu_X', toolName: 'Read', input: {}, status: 'complete', response: 'done' },
      { type: 'text', id: 't3', content: 'Second thought' },
    ];
    const { container } = render(<SubagentTimeline segments={segments} />);
    expect(container.textContent).toMatch(/First thought[\s\S]*Read[\s\S]*Second thought/);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd desktop && npx vitest run tests/subagent-view.test.tsx
```

Expected: all tests fail with module-not-found.

- [ ] **Step 3: Implement SubagentTimeline**

Create `youcoded/desktop/src/renderer/components/tool-views/SubagentTimeline.tsx`:

```tsx
import React from 'react';
import type { SubagentSegment, ToolCallState } from '../../../shared/types';
import { MarkdownContent } from '../MarkdownContent';
import { ToolBody } from './ToolBody';

/**
 * Renders a subagent's inline timeline inside the parent AgentView card.
 * The vertical left border visually frames the nested work so 20+ rows
 * remain scannable rather than dominating the card.
 *
 * Tool rows reuse ToolBody — all per-tool views read from input/response/
 * status/error/structuredPatch, so a SubagentSegment of type:'tool' shaped
 * as a lightweight ToolCallState works without changes to those views.
 */
export function SubagentTimeline({ segments }: { segments: SubagentSegment[] }) {
  if (!segments || segments.length === 0) return null;
  return (
    <div className="subagent-timeline border-l border-edge-dim pl-3 ml-1 mt-1 space-y-1.5 text-xs">
      {segments.map(seg =>
        seg.type === 'text'
          ? (
              <div key={seg.id} className="text-fg-dim">
                <MarkdownContent content={seg.content} />
              </div>
            )
          : <SubagentToolRow key={seg.id} segment={seg} />
      )}
    </div>
  );
}

function SubagentToolRow({ segment }: { segment: Extract<SubagentSegment, { type: 'tool' }> }) {
  // Shape the segment into an ad-hoc ToolCallState so ToolBody's dispatch
  // can pick the right per-tool view (ReadView, GrepView, BashView, etc.).
  const tool: ToolCallState = {
    toolUseId: segment.toolUseId,
    toolName: segment.toolName,
    input: segment.input,
    status: segment.status,
    response: segment.response,
    error: segment.error,
    structuredPatch: segment.structuredPatch,
  };
  return (
    <div className="subagent-tool-row" style={{ contentVisibility: 'auto' }}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-fg-muted">
        <span>{segment.toolName}</span>
        {segment.status === 'running' && <span>·</span>}
        {segment.status === 'running' && <span className="animate-pulse">running</span>}
      </div>
      <ToolBody tool={tool} />
    </div>
  );
}
```

Note: `ToolBody` is the main dispatcher at the top of `tool-views/ToolBody.tsx` (the file containing `AgentView`). If it's not already exported, export it in the next task.

- [ ] **Step 4: Export ToolBody if needed**

Check `youcoded/desktop/src/renderer/components/tool-views/ToolBody.tsx`:

```bash
grep -n "^export function ToolBody\|^export { ToolBody\|^export default" desktop/src/renderer/components/tool-views/ToolBody.tsx
```

If `ToolBody` isn't already exported as a named export, add `export` to the function declaration.

- [ ] **Step 5: Run tests — expect pass**

```bash
cd desktop && npx vitest run tests/subagent-view.test.tsx
```

Expected: all 4 tests pass. If `ToolBody` import fails, check whether it needs a different import path or is a default export.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/components/tool-views/SubagentTimeline.tsx desktop/tests/subagent-view.test.tsx
# also commit ToolBody if its export was changed
git commit -m "feat(subagent-threading): SubagentTimeline component"
```

---

## Task 8: AgentView renders the nested timeline

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/tool-views/ToolBody.tsx` (AgentView function around line 647)

No new tests — visual integration is covered by manual verification.

- [ ] **Step 1: Update AgentView**

In `ToolBody.tsx`, add the import at the top of the file (next to the other `./` imports):

```ts
import { SubagentTimeline } from './SubagentTimeline';
```

Rewrite the `AgentView` function (replacing the body):

```tsx
function AgentView({ tool }: { tool: ToolCallState }) {
  const desc = (tool.input.description as string) || '';
  const subagent = (tool.input.subagent_type as string) || 'general-purpose';
  const prompt = (tool.input.prompt as string) || '';
  const segments = tool.subagentSegments || [];
  const [showPrompt, setShowPrompt] = useState(false);

  // Auto-expand while the subagent is running; auto-collapse once the
  // parent Agent tool has a response (i.e., subagent completed). The user
  // can override either direction and their choice sticks for the rest of
  // the session.
  const [showTimeline, setShowTimeline] = useState(() => !tool.response);
  const [userToggled, setUserToggled] = useState(false);
  const prevHadResponse = React.useRef(!!tool.response);
  React.useEffect(() => {
    if (userToggled) return;
    const hasResponse = !!tool.response;
    if (!prevHadResponse.current && hasResponse) setShowTimeline(false);
    prevHadResponse.current = hasResponse;
  }, [tool.response, userToggled]);

  const tone = SUBAGENT_TONE[subagent] || 'neutral';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone={tone}>{subagent}</Chip>
        {desc && <span className="text-xs font-medium text-fg-2">{desc}</span>}
      </div>
      {prompt && (
        <div>
          <button
            onClick={() => setShowPrompt(s => !s)}
            className="text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg-2"
          >
            {showPrompt ? 'Hide briefing' : 'Show briefing'}
          </button>
          {showPrompt && (
            <pre className="mt-1 text-xs text-fg-dim bg-panel rounded-sm p-2 overflow-auto max-h-64 whitespace-pre-wrap font-mono">
              {prompt}
            </pre>
          )}
        </div>
      )}
      {segments.length > 0 && (
        <div>
          <button
            onClick={() => { setShowTimeline(s => !s); setUserToggled(true); }}
            className="text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg-2"
          >
            {showTimeline ? 'Hide agent activity' : `Show agent activity (${segments.length})`}
          </button>
          {showTimeline && <SubagentTimeline segments={segments} />}
        </div>
      )}
      {tool.response && (
        <div className="pt-1 border-t border-edge/60">
          <div className="text-[10px] uppercase tracking-wider text-fg-muted mb-1">Agent reply</div>
          <div className="text-sm text-fg-dim">
            <MarkdownContent content={tool.response} />
          </div>
        </div>
      )}
      {tool.error && <ErrorBlock error={tool.error} />}
    </div>
  );
}
```

If `React` isn't already imported (check near the top), add `import React from 'react';` or extend the existing import to include `useRef` if `useState` is already there.

- [ ] **Step 2: Verify tests still pass**

```bash
cd desktop && npx vitest run
```

Expected: no regressions across all suites.

- [ ] **Step 3: Verify typecheck + build**

```bash
cd desktop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/tool-views/ToolBody.tsx
git commit -m "feat(subagent-threading): AgentView renders nested timeline"
```

---

## Task 9: Android — add optional fields to TranscriptEvent and Serializer

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/parser/TranscriptEvent.kt`
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/bridge/TranscriptSerializer.kt`
- Modify: `youcoded/app/src/test/kotlin/com/youcoded/app/bridge/TranscriptSerializerTest.kt`

- [ ] **Step 1: Write the failing serializer test**

Append to `youcoded/app/src/test/kotlin/com/youcoded/app/bridge/TranscriptSerializerTest.kt` (inside the class):

```kotlin
    // ── subagent fields ──────────────────────────────────────────────────────

    @Test
    fun `assistantText serializes parentAgentToolUseId and agentId when present`() {
        val result = TranscriptSerializer.assistantText(
            sessionId = "s1", uuid = "u1", timestamp = 1000L,
            text = "hi", model = null,
            parentAgentToolUseId = "toolu_parent", agentId = "abc",
        )
        val data = result.getJSONObject("data")
        assertEquals("toolu_parent", data.getString("parentAgentToolUseId"))
        assertEquals("abc", data.getString("agentId"))
    }

    @Test
    fun `toolUse serializes parentAgentToolUseId and agentId when present`() {
        val result = TranscriptSerializer.toolUse(
            sessionId = "s1", uuid = "u1", timestamp = 1000L,
            toolUseId = "toolu_X", toolName = "Read", toolInput = JSONObject(),
            parentAgentToolUseId = "toolu_parent", agentId = "abc",
        )
        val data = result.getJSONObject("data")
        assertEquals("toolu_parent", data.getString("parentAgentToolUseId"))
        assertEquals("abc", data.getString("agentId"))
    }

    @Test
    fun `toolResult serializes parentAgentToolUseId and agentId when present`() {
        val result = TranscriptSerializer.toolResult(
            sessionId = "s1", uuid = "u1", timestamp = 1000L,
            toolUseId = "toolu_X", result = "done", isError = false,
            parentAgentToolUseId = "toolu_parent", agentId = "abc",
        )
        val data = result.getJSONObject("data")
        assertEquals("toolu_parent", data.getString("parentAgentToolUseId"))
        assertEquals("abc", data.getString("agentId"))
    }

    @Test
    fun `subagent fields are omitted when null`() {
        val result = TranscriptSerializer.toolUse(
            sessionId = "s1", uuid = "u1", timestamp = 1000L,
            toolUseId = "toolu_X", toolName = "Read", toolInput = JSONObject(),
        )
        val data = result.getJSONObject("data")
        assertFalse(data.has("parentAgentToolUseId"))
        assertFalse(data.has("agentId"))
    }
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.bridge.TranscriptSerializerTest"
```

Expected: compilation failure — the new parameters don't exist.

- [ ] **Step 3: Extend TranscriptEvent.kt**

In `youcoded/app/src/main/kotlin/com/youcoded/app/parser/TranscriptEvent.kt`, add three new optional parameters to `AssistantText`, `ToolUse`, and `ToolResult`:

```kotlin
    data class AssistantText(
        override val sessionId: String,
        override val uuid: String,
        override val timestamp: Long,
        val text: String,
        val model: String? = null,
        val parentAgentToolUseId: String? = null,
        val agentId: String? = null,
    ) : TranscriptEvent()

    data class ToolUse(
        override val sessionId: String,
        override val uuid: String,
        override val timestamp: Long,
        val toolUseId: String,
        val toolName: String,
        val toolInput: JSONObject,
        val parentAgentToolUseId: String? = null,
        val agentId: String? = null,
    ) : TranscriptEvent()

    data class ToolResult(
        override val sessionId: String,
        override val uuid: String,
        override val timestamp: Long,
        val toolUseId: String,
        val result: String,
        val isError: Boolean,
        val parentAgentToolUseId: String? = null,
        val agentId: String? = null,
    ) : TranscriptEvent()
```

- [ ] **Step 4: Extend TranscriptSerializer.kt**

Open the file and update each of the three serializer methods. For each, accept the two new optional params and attach them to the `data` JSONObject only when non-null. Example for `assistantText`:

```kotlin
    fun assistantText(
        sessionId: String,
        uuid: String,
        timestamp: Long,
        text: String,
        model: String?,
        parentAgentToolUseId: String? = null,
        agentId: String? = null,
    ): JSONObject {
        val data = JSONObject().apply {
            put("text", text)
            if (model != null) put("model", model)
            if (parentAgentToolUseId != null) put("parentAgentToolUseId", parentAgentToolUseId)
            if (agentId != null) put("agentId", agentId)
        }
        return JSONObject().apply {
            put("type", "assistant-text")
            put("sessionId", sessionId)
            put("uuid", uuid)
            put("timestamp", timestamp)
            put("data", data)
        }
    }
```

Apply the same pattern to `toolUse(...)` and `toolResult(...)`.

- [ ] **Step 5: Update the place that calls the serializer**

In `TranscriptWatcher.kt`, find the sites that call `TranscriptSerializer.assistantText`, `TranscriptSerializer.toolUse`, `TranscriptSerializer.toolResult`. These will be inside `parseAssistantLine` / `parseUserLine`. Leave them unchanged for now — the two new params default to `null`, so existing call sites keep working.

- [ ] **Step 6: Run tests — expect pass**

```bash
cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.bridge.TranscriptSerializerTest"
```

Expected: all existing Serializer tests still pass, new subagent-field tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/parser/TranscriptEvent.kt app/src/main/kotlin/com/youcoded/app/bridge/TranscriptSerializer.kt app/src/test/kotlin/com/youcoded/app/bridge/TranscriptSerializerTest.kt
git commit -m "feat(subagent-threading): Android TranscriptEvent/Serializer gain subagent fields"
```

---

## Task 10: Android — SubagentIndex (TDD)

**Files:**
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/parser/SubagentIndex.kt`
- Test: `youcoded/app/src/test/kotlin/com/youcoded/app/parser/SubagentIndexTest.kt`

- [ ] **Step 1: Write the failing test**

Create `youcoded/app/src/test/kotlin/com/youcoded/app/parser/SubagentIndexTest.kt`:

```kotlin
package com.youcoded.app.parser

import org.junit.Assert.*
import org.junit.Test

class SubagentIndexTest {

    @Test
    fun `binds subagent to matching parent`() {
        val idx = SubagentIndex(nowMs = { 1000L })
        idx.recordParentAgentToolUse("toolu_A", "Find bug", "Explore")
        val bound = idx.bindSubagent("agent1", description = "Find bug", agentType = "Explore")
        assertEquals("toolu_A", bound)
        assertEquals("toolu_A", idx.lookup("agent1"))
    }

    @Test
    fun `returns null when no parent matches`() {
        val idx = SubagentIndex()
        val bound = idx.bindSubagent("agent1", description = "Find bug", agentType = "Explore")
        assertNull(bound)
    }

    @Test
    fun `FIFO pairing for parallel parents with identical description`() {
        val idx = SubagentIndex()
        idx.recordParentAgentToolUse("toolu_A", "Review", "general-purpose")
        idx.recordParentAgentToolUse("toolu_B", "Review", "general-purpose")
        assertEquals("toolu_A", idx.bindSubagent("a1", "Review", "general-purpose"))
        assertEquals("toolu_B", idx.bindSubagent("a2", "Review", "general-purpose"))
    }

    @Test
    fun `subagent_type mismatch means no binding`() {
        val idx = SubagentIndex()
        idx.recordParentAgentToolUse("toolu_A", "Do stuff", "Explore")
        assertNull(idx.bindSubagent("agent1", "Do stuff", "Plan"))
    }

    @Test
    fun `unbind clears binding`() {
        val idx = SubagentIndex()
        idx.recordParentAgentToolUse("toolu_A", "Find bug", "Explore")
        idx.bindSubagent("agent1", "Find bug", "Explore")
        idx.unbind("agent1")
        assertNull(idx.lookup("agent1"))
    }

    @Test
    fun `pending events flush when parent arrives`() {
        val idx = SubagentIndex()
        idx.bufferPendingEvent("agent1", "Find bug", "Explore", "event1")
        idx.bufferPendingEvent("agent1", "Find bug", "Explore", "event2")
        idx.recordParentAgentToolUse("toolu_A", "Find bug", "Explore")
        val flushed = idx.tryFlushPending("agent1")
        assertNotNull(flushed)
        assertEquals("toolu_A", flushed!!.parentToolUseId)
        assertEquals(listOf<Any>("event1", "event2"), flushed.events)
    }

    @Test
    fun `pending events age out after 30s`() {
        var clock = 1000L
        val idx = SubagentIndex(nowMs = { clock })
        idx.bufferPendingEvent("agent1", "Find bug", "Explore", "event1")
        clock += 30_001L
        idx.pruneExpired()
        assertNull(idx.tryFlushPending("agent1"))
    }
}
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.parser.SubagentIndexTest"
```

Expected: compilation failure.

- [ ] **Step 3: Implement SubagentIndex.kt**

Create `youcoded/app/src/main/kotlin/com/youcoded/app/parser/SubagentIndex.kt`:

```kotlin
package com.youcoded.app.parser

/**
 * Correlates subagent JSONL files to their parent Agent tool_use.
 * Mirrors the desktop's subagent-index.ts. One instance per parent session.
 */
class SubagentIndex(
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    companion object {
        private const val PENDING_TTL_MS = 30_000L
    }

    data class FlushResult(val parentToolUseId: String, val events: List<Any>)

    private data class ParentRecord(
        val toolUseId: String,
        val description: String,
        val subagentType: String,
    )

    private data class PendingEntry(
        val description: String,
        val agentType: String,
        val events: MutableList<Any>,
        val firstSeenAt: Long,
    )

    private val unmatchedParents = mutableListOf<ParentRecord>()
    private val bindings = mutableMapOf<String, String>()
    private val pending = mutableMapOf<String, PendingEntry>()

    @Synchronized
    fun recordParentAgentToolUse(toolUseId: String, description: String, subagentType: String) {
        unmatchedParents.add(ParentRecord(toolUseId, description, subagentType))
    }

    @Synchronized
    fun bindSubagent(agentId: String, description: String, agentType: String): String? {
        val i = unmatchedParents.indexOfFirst {
            it.description == description && it.subagentType == agentType
        }
        if (i < 0) return null
        val parent = unmatchedParents.removeAt(i)
        bindings[agentId] = parent.toolUseId
        return parent.toolUseId
    }

    @Synchronized
    fun lookup(agentId: String): String? = bindings[agentId]

    @Synchronized
    fun unbind(agentId: String) {
        bindings.remove(agentId)
    }

    @Synchronized
    fun bufferPendingEvent(agentId: String, description: String, agentType: String, event: Any) {
        val existing = pending[agentId]
        if (existing != null) {
            existing.events.add(event)
            return
        }
        pending[agentId] = PendingEntry(description, agentType, mutableListOf(event), nowMs())
    }

    @Synchronized
    fun tryFlushPending(agentId: String): FlushResult? {
        val entry = pending[agentId] ?: return null
        val parentToolUseId = bindSubagent(agentId, entry.description, entry.agentType)
            ?: return null
        pending.remove(agentId)
        return FlushResult(parentToolUseId, entry.events.toList())
    }

    @Synchronized
    fun pruneExpired() {
        val cutoff = nowMs() - PENDING_TTL_MS
        val expired = pending.filterValues { it.firstSeenAt < cutoff }.keys
        for (k in expired) pending.remove(k)
    }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.parser.SubagentIndexTest"
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/parser/SubagentIndex.kt app/src/test/kotlin/com/youcoded/app/parser/SubagentIndexTest.kt
git commit -m "feat(subagent-threading): Android SubagentIndex with correlation logic"
```

---

## Task 11: Android — SubagentWatcher (TDD)

**Files:**
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/parser/SubagentWatcher.kt`
- Test: `youcoded/app/src/test/kotlin/com/youcoded/app/parser/SubagentWatcherTest.kt`

This task parallels Task 3 but on Android. Because Android `FileObserver` requires a running Looper which is awkward in unit tests, `SubagentWatcher` exposes public `scanDirectory()` and `readNewLines(agentId)` methods so tests can drive them directly without relying on FileObserver callbacks.

- [ ] **Step 1: Write the failing tests**

Create `youcoded/app/src/test/kotlin/com/youcoded/app/parser/SubagentWatcherTest.kt`:

```kotlin
package com.youcoded.app.parser

import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.File

class SubagentWatcherTest {
    private lateinit var tmpRoot: File
    private lateinit var subagentsDir: File
    private lateinit var index: SubagentIndex
    private lateinit var emitted: MutableList<TranscriptEvent>
    private lateinit var watcher: SubagentWatcher

    @Before
    fun setUp() {
        tmpRoot = File.createTempFile("subagent-watcher", "").apply { delete(); mkdirs() }
        subagentsDir = File(tmpRoot, "subagents").apply { mkdirs() }
        index = SubagentIndex()
        emitted = mutableListOf()
        watcher = SubagentWatcher(
            sessionId = "sess-1",
            subagentsDir = subagentsDir,
            index = index,
            emit = { emitted.add(it) },
        )
    }

    @After
    fun tearDown() {
        watcher.stop()
        tmpRoot.deleteRecursively()
    }

    private fun writeMeta(agentId: String, description: String, agentType: String) {
        File(subagentsDir, "agent-$agentId.meta.json").writeText(
            JSONObject().apply {
                put("description", description); put("agentType", agentType)
            }.toString()
        )
    }

    private fun appendToolUse(agentId: String, uuid: String, toolUseId: String, toolName: String) {
        val line = JSONObject().apply {
            put("type", "assistant")
            put("uuid", uuid)
            put("isSidechain", true)
            put("message", JSONObject().apply {
                put("role", "assistant")
                put("content", org.json.JSONArray().apply {
                    put(JSONObject().apply {
                        put("type", "tool_use")
                        put("id", toolUseId)
                        put("name", toolName)
                        put("input", JSONObject())
                    })
                })
            })
        }
        File(subagentsDir, "agent-$agentId.jsonl").appendText(line.toString() + "\n")
    }

    @Test
    fun replays_existing_subagent_on_start() = runTest {
        writeMeta("abc", "Find bug", "Explore")
        appendToolUse("abc", "u1", "toolu_X", "Read")
        index.recordParentAgentToolUse("toolu_parent", "Find bug", "Explore")

        watcher.scanDirectoryForTest()

        val ev = emitted.single()
        assertTrue(ev is TranscriptEvent.ToolUse)
        val toolUse = ev as TranscriptEvent.ToolUse
        assertEquals("toolu_parent", toolUse.parentAgentToolUseId)
        assertEquals("abc", toolUse.agentId)
        assertEquals("toolu_X", toolUse.toolUseId)
    }

    @Test
    fun buffers_events_when_parent_not_yet_recorded_then_flushes() = runTest {
        writeMeta("abc", "Find bug", "Explore")
        appendToolUse("abc", "u1", "toolu_X", "Read")

        watcher.scanDirectoryForTest()
        assertEquals(0, emitted.size)

        index.recordParentAgentToolUse("toolu_parent", "Find bug", "Explore")
        watcher.flushAllPending()

        val ev = emitted.single() as TranscriptEvent.ToolUse
        assertEquals("toolu_parent", ev.parentAgentToolUseId)
    }

    @Test
    fun appends_are_picked_up_on_rescan() = runTest {
        writeMeta("abc", "Find bug", "Explore")
        appendToolUse("abc", "u1", "toolu_X", "Read")
        index.recordParentAgentToolUse("toolu_parent", "Find bug", "Explore")

        watcher.scanDirectoryForTest()
        assertEquals(1, emitted.size)

        appendToolUse("abc", "u2", "toolu_Y", "Grep")
        watcher.readNewLinesForTest("abc")
        assertEquals(2, emitted.size)
    }

    @Test
    fun dedups_reads_using_seen_uuids() = runTest {
        writeMeta("abc", "Find bug", "Explore")
        appendToolUse("abc", "u1", "toolu_X", "Read")
        index.recordParentAgentToolUse("toolu_parent", "Find bug", "Explore")

        watcher.scanDirectoryForTest()
        assertEquals(1, emitted.size)

        watcher.forceRereadForTest("abc")
        assertEquals(1, emitted.size) // no duplicate
    }

    @Test
    fun getHistory_returns_events_for_all_subagents() = runTest {
        writeMeta("abc", "Find bug", "Explore")
        appendToolUse("abc", "u1", "toolu_X", "Read")
        writeMeta("def", "Other", "Plan")
        appendToolUse("def", "u2", "toolu_Y", "Grep")
        index.recordParentAgentToolUse("toolu_P1", "Find bug", "Explore")
        index.recordParentAgentToolUse("toolu_P2", "Other", "Plan")

        val events = watcher.getHistory()
        assertEquals(2, events.size)
    }
}
```

- [ ] **Step 2: Run tests — expect compilation failure**

```bash
cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.parser.SubagentWatcherTest"
```

Expected: compilation fails — SubagentWatcher doesn't exist.

- [ ] **Step 3: Implement SubagentWatcher.kt**

Create `youcoded/app/src/main/kotlin/com/youcoded/app/parser/SubagentWatcher.kt`:

```kotlin
package com.youcoded.app.parser

import android.os.FileObserver
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile

/**
 * Per-parent-session watcher for `<parent>/subagents/`. When an
 * agent-<id>.jsonl appears, reads the sibling .meta.json, binds via
 * SubagentIndex, then streams the file — stamping parentAgentToolUseId
 * and agentId on each emitted TranscriptEvent.
 *
 * Uses FileObserver on the directory (when a Looper is available) plus a
 * polling coroutine. Tests drive scanDirectoryForTest() / readNewLinesForTest()
 * directly so they don't depend on FileObserver delivery.
 */
class SubagentWatcher(
    private val sessionId: String,
    private val subagentsDir: File,
    private val index: SubagentIndex,
    private val emit: (TranscriptEvent) -> Unit,
    private val scope: CoroutineScope? = null,
) {
    companion object { private const val TAG = "SubagentWatcher" }

    private data class PerFileState(
        val agentId: String,
        val jsonlFile: File,
        var offset: Long = 0L,
        val seenUuids: MutableSet<String> = mutableSetOf(),
        var bound: Boolean = false,
    )

    private val perFile = mutableMapOf<String, PerFileState>()
    private var dirObserver: FileObserver? = null
    private var pollJob: Job? = null
    private var pruneJob: Job? = null

    fun start() {
        scanDirectoryForTest() // initial replay
        if (scope != null) {
            pollJob = scope.launch(Dispatchers.IO) {
                while (isActive) {
                    delay(1000)
                    scanDirectoryForTest()
                    for (agentId in perFile.keys.toList()) readNewLinesForTest(agentId)
                }
            }
            pruneJob = scope.launch(Dispatchers.IO) {
                while (isActive) { delay(5000); index.pruneExpired() }
            }
        }
    }

    fun stop() {
        pollJob?.cancel(); pollJob = null
        pruneJob?.cancel(); pruneJob = null
        dirObserver?.stopWatching(); dirObserver = null
        perFile.clear()
    }

    /** Public for tests: scan subagents dir, pick up new files. */
    fun scanDirectoryForTest() {
        if (!subagentsDir.exists()) return
        for (name in subagentsDir.list().orEmpty()) {
            if (!name.endsWith(".jsonl") || !name.startsWith("agent-")) continue
            val agentId = name.substring("agent-".length, name.length - ".jsonl".length)
            trackSubagent(agentId)
        }
    }

    /** Public for tests: force a re-read of one file. */
    fun readNewLinesForTest(agentId: String) {
        val state = perFile[agentId] ?: return
        readNewLines(state)
    }

    /** Public for tests: re-read from offset 0, exercising the dedup. */
    fun forceRereadForTest(agentId: String) {
        val state = perFile[agentId] ?: return
        state.offset = 0L
        readNewLines(state)
    }

    fun flushAllPending() {
        for (agentId in perFile.keys.toList()) {
            val res = index.tryFlushPending(agentId) ?: continue
            for (ev in res.events) if (ev is TranscriptEvent) emit(stamp(ev, res.parentToolUseId, agentId))
            perFile[agentId]?.bound = true
        }
    }

    fun getHistory(): List<TranscriptEvent> {
        if (!subagentsDir.exists()) return emptyList()
        val out = mutableListOf<TranscriptEvent>()
        for (name in subagentsDir.list().orEmpty().sorted()) {
            if (!name.endsWith(".jsonl") || !name.startsWith("agent-")) continue
            val agentId = name.substring("agent-".length, name.length - ".jsonl".length)
            val meta = readMeta(agentId) ?: continue
            val parentToolUseId = index.bindSubagent(agentId, meta.first, meta.second) ?: continue
            val jsonlFile = File(subagentsDir, name)
            if (!jsonlFile.exists()) continue
            for (line in jsonlFile.readLines()) {
                if (line.isBlank()) continue
                parseLine(line)?.let { out.add(stamp(it, parentToolUseId, agentId)) }
            }
        }
        return out
    }

    // ---- internals ----

    private fun readMeta(agentId: String): Pair<String, String>? {
        val metaFile = File(subagentsDir, "agent-$agentId.meta.json")
        if (!metaFile.exists()) return null
        return try {
            val obj = JSONObject(metaFile.readText())
            val description = obj.optString("description", "")
            val agentType = obj.optString("agentType", "")
            if (description.isEmpty() || agentType.isEmpty()) null else description to agentType
        } catch (_: Exception) { null }
    }

    private fun trackSubagent(agentId: String) {
        if (perFile.containsKey(agentId)) return
        val meta = readMeta(agentId) ?: return
        val jsonlFile = File(subagentsDir, "agent-$agentId.jsonl")
        val state = PerFileState(agentId = agentId, jsonlFile = jsonlFile)
        perFile[agentId] = state
        val parentToolUseId = index.bindSubagent(agentId, meta.first, meta.second)
        state.bound = parentToolUseId != null
        readNewLines(state)
    }

    private fun readNewLines(state: PerFileState) {
        val file = state.jsonlFile
        if (!file.exists()) return
        val fileLength = file.length()
        if (fileLength < state.offset) { state.offset = 0L }
        if (fileLength <= state.offset) return
        try {
            RandomAccessFile(file, "r").use { raf ->
                raf.seek(state.offset)
                val newBytes = ByteArray((fileLength - state.offset).toInt())
                raf.readFully(newBytes)
                val lastNewline = newBytes.lastIndexOf(0x0A.toByte())
                if (lastNewline < 0) return
                state.offset += lastNewline + 1
                val text = String(newBytes, 0, lastNewline + 1, Charsets.UTF_8)
                for (line in text.lineSequence()) {
                    if (line.isBlank()) continue
                    val ev = parseLine(line) ?: continue
                    if (state.seenUuids.contains(ev.uuid)) continue
                    state.seenUuids.add(ev.uuid)
                    if (state.seenUuids.size > 500) {
                        val trimmed = state.seenUuids.toList().takeLast(500)
                        state.seenUuids.clear(); state.seenUuids.addAll(trimmed)
                    }
                    deliver(state, ev)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error reading subagent", e)
        }
    }

    private fun deliver(state: PerFileState, ev: TranscriptEvent) {
        if (state.bound) {
            val parentToolUseId = index.lookup(state.agentId)
            if (parentToolUseId != null) { emit(stamp(ev, parentToolUseId, state.agentId)); return }
        }
        val meta = readMeta(state.agentId) ?: return
        index.bufferPendingEvent(state.agentId, meta.first, meta.second, ev)
    }

    private fun stamp(ev: TranscriptEvent, parentToolUseId: String, agentId: String): TranscriptEvent = when (ev) {
        is TranscriptEvent.ToolUse -> ev.copy(parentAgentToolUseId = parentToolUseId, agentId = agentId)
        is TranscriptEvent.ToolResult -> ev.copy(parentAgentToolUseId = parentToolUseId, agentId = agentId)
        is TranscriptEvent.AssistantText -> ev.copy(parentAgentToolUseId = parentToolUseId, agentId = agentId)
        else -> ev
    }

    /**
     * Minimal line parser: subagent JSONL lines reuse Claude Code's
     * on-disk format, but the existing Android parser is per-session and
     * tightly coupled to TranscriptWatcher internals. For now we parse
     * only tool_use, tool_result, and assistant-text blocks here — the
     * surface we actually surface in subagent timelines.
     */
    private fun parseLine(line: String): TranscriptEvent? {
        val obj = try { JSONObject(line) } catch (_: Exception) { return null }
        val uuid = obj.optString("uuid", "").ifBlank { return null }
        val type = obj.optString("type", "")
        val timestamp = 0L // subagent timeline doesn't depend on absolute timestamps
        val message = obj.optJSONObject("message") ?: return null

        if (type == "assistant") {
            val content = message.optJSONArray("content") ?: return null
            for (i in 0 until content.length()) {
                val block = content.optJSONObject(i) ?: continue
                when (block.optString("type", "")) {
                    "text" -> {
                        val text = TranscriptWatcher.stripSystemTags(block.optString("text", ""))
                        if (text.isNotEmpty()) return TranscriptEvent.AssistantText(
                            sessionId = sessionId, uuid = uuid, timestamp = timestamp,
                            text = text, model = message.optString("model", null),
                        )
                    }
                    "tool_use" -> {
                        return TranscriptEvent.ToolUse(
                            sessionId = sessionId, uuid = uuid, timestamp = timestamp,
                            toolUseId = block.optString("id", ""),
                            toolName = block.optString("name", ""),
                            toolInput = block.optJSONObject("input") ?: JSONObject(),
                        )
                    }
                }
            }
        } else if (type == "user") {
            val content = message.optJSONArray("content") ?: return null
            for (i in 0 until content.length()) {
                val block = content.optJSONObject(i) ?: continue
                if (block.optString("type", "") == "tool_result") {
                    val resultContent = block.opt("content")
                    val text = when (resultContent) {
                        is String -> resultContent
                        is JSONArray -> {
                            val sb = StringBuilder()
                            for (j in 0 until resultContent.length()) {
                                val b = resultContent.optJSONObject(j) ?: continue
                                if (b.optString("type", "") == "text") sb.appendLine(b.optString("text", ""))
                            }
                            sb.toString().trim()
                        }
                        else -> ""
                    }
                    return TranscriptEvent.ToolResult(
                        sessionId = sessionId, uuid = uuid, timestamp = timestamp,
                        toolUseId = block.optString("tool_use_id", ""),
                        result = text,
                        isError = block.optBoolean("is_error", false),
                    )
                }
            }
        }
        return null
    }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.parser.SubagentWatcherTest"
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/parser/SubagentWatcher.kt app/src/test/kotlin/com/youcoded/app/parser/SubagentWatcherTest.kt
git commit -m "feat(subagent-threading): Android SubagentWatcher"
```

---

## Task 12: Wire SubagentWatcher into Android TranscriptWatcher

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/parser/TranscriptWatcher.kt`
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/bridge/TranscriptSerializer.kt` (call sites for new fields)

- [ ] **Step 1: Add fields to WatcherState**

In `TranscriptWatcher.kt`, extend `WatcherState`:

```kotlin
    private class WatcherState(
        val jsonlFile: File,
        val mobileSessionId: String,
        var fileOffset: Long = 0L,
        val seenUuids: MutableSet<String> = mutableSetOf(),
        var job: Job? = null,
        var fileObserver: FileObserver? = null,
        val mutex: Mutex = Mutex(),
        var accumulatedStreamingText: String = "",
        val subagentIndex: SubagentIndex = SubagentIndex(),
        var subagentWatcher: SubagentWatcher? = null,
    )
```

- [ ] **Step 2: Construct and start the SubagentWatcher in startWatching**

In `startWatching`, after `state.fileObserver?.startWatching()` (inside the scope.launch block after the initial read), add:

```kotlin
            // Derive subagents/ dir: <parent>.jsonl lives in the same
            // projects dir; the sub-session dir is <parentSessionId>/ without
            // the `.jsonl` suffix, and subagents/ lives inside that.
            val parentSessionId = jsonlFile.nameWithoutExtension
            val projectDir = jsonlFile.parentFile
            val subagentsDir = File(File(projectDir, parentSessionId), "subagents")
            val sw = SubagentWatcher(
                sessionId = mobileSessionId,
                subagentsDir = subagentsDir,
                index = state.subagentIndex,
                emit = { event -> scope.launch { _events.emit(event) } },
                scope = scope,
            )
            state.subagentWatcher = sw
            sw.start()
```

- [ ] **Step 3: Record Agent tool_uses as they parse**

In `parseAssistantLine` (or wherever tool_use events are constructed), after building a ToolUse event, check if it's an Agent call and record it. Find the section that creates `TranscriptEvent.ToolUse` and add immediately before emitting:

```kotlin
                            if (toolName == "Agent") {
                                val desc = toolInput.optString("description", "")
                                val subagentType = toolInput.optString("subagent_type", "")
                                state.subagentIndex.recordParentAgentToolUse(
                                    toolUseId, desc, subagentType,
                                )
                                state.subagentWatcher?.flushAllPending()
                            }
```

- [ ] **Step 4: Cleanup in stopWatching**

Find `stopWatching` (or the cleanup helper). Add:

```kotlin
        state.subagentWatcher?.stop()
```

- [ ] **Step 5: Verify the app compiles**

```bash
cd youcoded && ./gradlew :app:compileDebugKotlin
```

Expected: no compilation errors.

- [ ] **Step 6: Run existing tests to confirm no regressions**

```bash
cd youcoded && ./gradlew :app:testDebugUnitTest
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/parser/TranscriptWatcher.kt
git commit -m "feat(subagent-threading): wire SubagentWatcher into Android TranscriptWatcher"
```

---

## Task 13: Full desktop + Android regression + build

- [ ] **Step 1: Run full desktop test suite**

```bash
cd desktop && npm test -- --run
```

Expected: all pass. Record any test names that failed that passed before Task 0 — these are regressions.

- [ ] **Step 2: Build desktop**

```bash
cd desktop && npm run build
```

Expected: `tsc` clean, `vite build` clean, electron-builder packaging succeeds.

- [ ] **Step 3: Run Android unit tests**

```bash
cd youcoded && ./gradlew :app:testDebugUnitTest
```

Expected: all pass.

- [ ] **Step 4: Build Android web UI + debug APK**

```bash
cd youcoded && bash scripts/build-web-ui.sh && ./gradlew assembleDebug
```

Expected: both succeed. (This step requires Node + Gradle + Android SDK set up.)

- [ ] **Step 5: If any step fails, fix and commit**

Re-run the failed step. If fixes are needed, commit them as separate `fix(subagent-threading): ...` commits — don't amend earlier commits.

---

## Task 14: Manual verification on desktop dev build

No code changes — a checklist run against the dev build.

- [ ] **Step 1: Launch dev app**

```bash
cd youcoded && bash scripts/run-dev.sh
```

Expected: second Electron window labeled "YouCoded Dev" appears with shifted ports.

- [ ] **Step 2: Single-subagent live streaming**

In the dev app, start a chat and prompt: *"Use the Plan agent to design a simple counter feature."*

Expected:
- AgentView card appears with "Plan" chip and description.
- Within 1–2s, "Show agent activity (N)" button appears with N growing as the Plan agent runs tools.
- Clicking the button reveals the nested timeline with Read/Grep/Write rows streaming in.
- When the Plan agent finishes, the "Agent reply" section appears at the bottom and the timeline auto-collapses.
- Clicking "Show agent activity" re-expands the full timeline.

- [ ] **Step 3: Parallel subagents**

Prompt: *"Use the dispatching-parallel-agents skill to run two Explore agents in parallel — one finds all TypeScript files, the other finds all Kotlin files."*

Expected: two separate AgentView cards each stream their own timeline independently. Descriptions differ so no FIFO collision is tested here.

- [ ] **Step 4: Session resume replay**

Close and relaunch the dev app. Open the resumed session.

Expected: completed AgentView cards from the prior session show their full nested timelines on expand (replayed from disk).

- [ ] **Step 5: If any check fails, file a bug**

Copy the exact reproduction steps, observed behavior, and any console output into a bug description. Do NOT mark the plan complete until all 4 checks pass.

---

## Task 15: Manual verification on Android + docs

- [ ] **Step 1: Install the debug APK on a test device**

Follow the existing Android install path (`adb install app/build/outputs/apk/debug/app-debug.apk` from `youcoded/`).

- [ ] **Step 2: Confirm subagent files appear on disk**

In Android, start a chat, trigger a subagent (e.g., ask Claude to use the Plan agent). Using adb:

```bash
adb shell run-as com.youcoded.app ls -la files/usr/home/.claude/projects/
```

Navigate to the latest project slug, then into the active session's directory. Confirm a `subagents/` dir exists with `agent-<id>.jsonl` and `agent-<id>.meta.json` files.

**If subagents/ exists:** continue to Step 3.

**If subagents/ does NOT exist:** Claude Code on Android is not writing subagent files. Go to Step 5 (documentation fallback).

- [ ] **Step 3: Visually verify nested timeline on Android**

Repeat desktop manual checks 2–4 on Android.

Expected: same behavior as desktop — live streaming, auto-collapse on completion, replay on resume.

- [ ] **Step 4: If Android behavior matches desktop, merge is ready**

Proceed to Task 16.

- [ ] **Step 5: Fallback if Android doesn't write subagent files**

Append to `docs/PITFALLS.md` (in the `youcoded-dev` repo, not the worktree — this is workspace-level docs), under the "Cross-Platform (Desktop + Android)" section:

```markdown
- **Subagent transcript threading is desktop-only.** Claude Code on Android (v<observed version>) does not write `<parent-session-id>/subagents/` files, so nested AgentView timelines show empty until the final reply arrives. Revisit when Claude Code on Android starts writing subagent transcripts.
```

Also add an entry to `docs/knowledge-debt.md`:

```markdown
- **[2026-04-17] Subagent threading: Android gap.** Android parity for subagent transcript threading is blocked on Claude Code's CLI emitting `<parent>/subagents/` files on Android. Desktop-only feature until CLI behavior changes. Owner: backlog.
```

Commit these two doc changes back on master (not inside the worktree):

```bash
cd <youcoded-dev>
git add docs/PITFALLS.md docs/knowledge-debt.md
git commit -m "docs: note Android gap for subagent threading"
```

---

## Task 16: Finish — merge to master

- [ ] **Step 1: Rebase + push the feature branch**

```bash
cd youcoded/.worktrees/subagent-threading
git fetch origin
git rebase origin/master
# Resolve any conflicts; re-run tests after resolving
cd desktop && npm test -- --run
cd ../../../
git push -u origin feat/subagent-threading
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --base master --head feat/subagent-threading \
  --title "feat: subagent transcript threading" \
  --body "$(cat <<'EOF'
## Summary
- Threads Task-tool subagent work (tool calls, narration) into the parent AgentView card in real time, replacing today's blank-spinner-until-final-reply UX.
- New SubagentWatcher per parent session watches `<parent>/subagents/` on both desktop (Node) and Android (Kotlin).
- Event shape extended with two optional fields (`parentAgentToolUseId`, `agentId`) — no new IPC types, parity preserved.

Spec: `docs/superpowers/specs/2026-04-17-subagent-threading-design.md`

## Test plan
- [ ] Desktop `npm test` passes
- [ ] Android `./gradlew :app:testDebugUnitTest` passes
- [ ] Manual: single-subagent live streaming on desktop
- [ ] Manual: parallel subagents on desktop
- [ ] Manual: session-resume replay on desktop
- [ ] Manual: same checks on Android (or Android-gap doc committed)
EOF
)"
```

- [ ] **Step 3: Merge after review**

Per CLAUDE.md: "merge" means merge AND push. Use `gh pr merge --merge` after approval, confirm the commit is on `origin/master`, then clean up:

```bash
cd youcoded
git worktree remove .worktrees/subagent-threading
git branch -D feat/subagent-threading  # -D because merge commit is not ancestral
```

- [ ] **Step 4: Close the loop**

Verify `git branch --contains <merge-sha>` includes `master` and `git log --oneline origin/master -n 5` shows the merge. Done.

---

## Self-review checklist

- [x] Every spec section has at least one task implementing it:
  - Architecture/data flow — Tasks 2, 3, 4 (index, watcher, wire)
  - Event/state shape — Task 1 (types)
  - Reducer changes — Task 5
  - UI — Tasks 7, 8
  - Android parity — Tasks 9, 10, 11, 12
  - Error handling & edge cases — covered by tests in Task 2 (pending TTL), Task 3 (dedup, unbound), Task 5 (no-op on unknown parent, CLEAR_TIMELINE preserves)
  - Testing — every TDD task has Write-test → Fail → Implement → Pass → Commit
- [x] No placeholders — no "TBD", "TODO", "add appropriate error handling" etc.
- [x] Type consistency — `SubagentSegment`, `applySubagentEvent`, `SubagentIndex`, `SubagentWatcher` used with matching signatures across tasks.
- [x] No "similar to Task N" — each task shows its complete code.
- [x] Bite-sized steps — each step is 1 action with a command or code block.
- [x] Frequent commits — every task ends with a commit step.
