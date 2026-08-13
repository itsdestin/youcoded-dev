---
status: draft
created: 2026-08-12
type: plan
spec: docs/active/specs/2026-08-12-tool-arg-streaming-visibility.md
---

# Preparing Tool Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A normal `ToolCard` appears the moment a native model starts generating
a tool call's arguments, showing a live character count, and transitions in place
to the real card when the arguments finish — replacing minutes of generic
spinner.

**Architecture:** The harness surfaces the AI SDK's already-arriving
`tool-input-start` / `tool-input-delta` stream parts as a display-only
`toolPreparing` payload on `assistant-thinking` (a shape `SessionStore.append`
already drops, so nothing partial is persisted). The renderer grafts a real tool
entry into the reducer keyed by the provider's tool call id — which is
byte-identical to the completed `tool-call`'s id — so the existing idempotent
`TRANSCRIPT_TOOL_USE` path supersedes it in place with no new merge machinery.

**Tech Stack:** TypeScript, Electron main + React renderer, `ai` 7.0.36 /
`@ai-sdk/openai-compatible` 3.0.14 / `@ai-sdk/provider-utils` 5.0.12, Vitest.

## Global Constraints

- **The emit surface is FROZEN** (`.claude/rules/native-runtime.md`): no new
  `TranscriptEventType`. All progress rides `assistant-thinking`.
- **Nothing partial may be persisted.** The payload must keep `assistant-thinking`
  free of `text` and `partId`, which is what `session-store.ts:93` filters on.
- **`preparing` is a boolean on a `status: 'running'` entry — never a fifth
  `ToolCallStatus`.** The union stays `'running' | 'complete' | 'failed' | 'awaiting-approval'`
  (`shared/types.ts:275`).
- **Tool-call/result pairing holds everywhere** — a preparing entry is display-only
  and is *deleted*, never failed, never given a result.
- **Native runtime only.** No CC branch, no Kotlin change, no new IPC channel.
- **Every non-trivial edit carries a WHY comment** (workspace `CLAUDE.md`).
- **Two transcript switches, not one:** `App.tsx` and `components/buddy/BubbleFeed.tsx`.
- Exact copy strings: collapsed detail `preparing… {N} chars`; expanded body
  `Still preparing tool call… {N} characters so far`. `N` is
  `Number.toLocaleString()`.
- Throttle constant: `TOOL_PREPARING_EMIT_MS = 300`.

---

## Worktree setup

Do this before Task 1. Non-trivial work must not happen in the main checkout
(workspace `CLAUDE.md`), and Serena silently answers from `master` while you work
in a worktree — use `bash scripts/verify.sh <worktree>` for branch truth.

```bash
cd /home/destin/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../worktrees/preparing-cards -b feat/preparing-tool-cards origin/master
cd ../worktrees/preparing-cards/desktop && npm ci
```

`npm ci` is required per worktree — `allowScripts` only approves `electron`, and
a worktree without it has no Electron binary (`desktop/CLAUDE.md`).

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `desktop/src/shared/types.ts` | Wire + state types | Add `toolPreparing` to `TranscriptEvent.data`; add `preparing` / `preparingChars` to `ToolCallState` |
| `desktop/src/main/harness/harness-session.ts` | Native turn driver | Two new stream-part cases, a per-step progress map, the retry-clear |
| `desktop/tests/helpers/scripted-model.ts` | Shared mock builders | Add `toolInputChunks()` |
| `desktop/tests/harness-session-loop.test.ts` | Emit contract | New describe block |
| `desktop/tests/session-store.test.ts` | Persistence contract | Non-persistence pin |
| `desktop/src/renderer/state/chat-types.ts` | Action union | Add `NATIVE_TOOL_PREPARING` |
| `desktop/src/renderer/state/chat-reducer.ts` | Chat state | Placement helper extraction, new case, `removePreparingTool`, `endTurn` reaping |
| `desktop/src/renderer/state/__tests__/chat-reducer.test.ts` | Reducer contract | New describe block |
| `desktop/src/renderer/App.tsx` | Main-window transcript switch | Dispatch |
| `desktop/src/renderer/components/buddy/BubbleFeed.tsx` | Buddy-window transcript switch | Dispatch |
| `desktop/tests/transcript-event-surface-parity.test.ts` | Two-switch parity | Textual pin |
| `desktop/src/renderer/components/ToolCard.tsx` | Card header | Preparing detail line |
| `desktop/src/renderer/components/tool-views/ToolBody.tsx` | Card body | Preparing body |
| `desktop/tests/tool-card-preparing.test.tsx` | Render contract | New file |

---

## Task 1: Emit `toolPreparing` from the harness

**Files:**
- Modify: `desktop/src/shared/types.ts` (inside `TranscriptEvent['data']`, after the `promptProcessing` field at :223)
- Modify: `desktop/src/main/harness/harness-session.ts` (constant near the other timing constants; per-step map before the consume loop's `try` at ~:1710; two cases in the part switch at ~:1789; clear before `return STALL_RETRY` at :1733)
- Modify: `desktop/tests/helpers/scripted-model.ts`
- Test: `desktop/tests/harness-session-loop.test.ts`
- Test: `desktop/tests/session-store.test.ts`

**Interfaces:**
- Produces: `TranscriptEvent.data.toolPreparing?: { toolCallId: string; toolName: string; chars: number; cleared?: boolean }` — consumed by Task 3 (reducer) and Task 4 (dispatch).
- Produces: `toolInputChunks(toolCallId: string, toolName: string, ...deltas: string[]): any[]` in `tests/helpers/scripted-model.ts`.
- Consumes: existing `HarnessSession.emitEvent`, `stream()`, `scriptedModel()`, `finishChunk()`, `toolCallChunk()`.

**Background the implementer needs.** The fullStream part shapes are **not** the
same as the UI-message-stream shapes with similar names. Verified in
`node_modules/ai/dist/index.d.ts`:

```
type TextStreamToolInputStartPart = { type: 'tool-input-start'; id: string; toolName: string; ... }   // :2845
type TextStreamToolInputDeltaPart = { type: 'tool-input-delta'; id: string; delta: string; ... }      // :2859
```

So the fields are **`part.id` and `part.delta`** — the `toolCallId` /
`inputTextDelta` variants at :2352/:2361 belong to `UIMessageChunk` and are the
wrong ones. `part.id` here is the same string the completed `tool-call` part
carries as `toolCallId` (`provider-utils/dist/index.js:3633` vs `:3683`).

- [ ] **Step 1: Add the wire field**

In `desktop/src/shared/types.ts`, immediately after the `promptProcessing` field
(:223):

```ts
    /**
     * Native runtime only. The model is GENERATING a tool call's arguments —
     * nothing has executed yet. This is what makes a "preparing" ToolCard
     * appear instead of minutes of bare thinking spinner on a big Write.
     *
     * Rides `assistant-thinking` with NO text and NO partId so
     * SessionStore.append drops it (session-store.ts): partial arguments must
     * never reach the JSONL, or a resume would replay a half-written file.
     *
     * `toolCallId` is the provider's REAL id — identical to the one the
     * completed `tool-call` stream part carries — which is what lets the card
     * transition in place instead of being swapped.
     *
     * `cleared: true` means "remove this preparing card": the stall auto-retry
     * re-runs a step WITHOUT ending the turn, so its cards must be withdrawn
     * explicitly (every other death path ends the turn, where endTurn reaps).
     */
    toolPreparing?: { toolCallId: string; toolName: string; chars: number; cleared?: boolean };
```

- [ ] **Step 2: Add the scripted-model helper**

Append to `desktop/tests/helpers/scripted-model.ts`:

```ts
/** tool-input-start / delta(s) / end framing for ONE tool call's argument
 *  stream, using the RAW provider part shape (`id` + `delta`, NOT the
 *  UIMessageChunk `toolCallId` + `inputTextDelta`). streamText forwards these
 *  onto fullStream unchanged. Pair with toolCallChunk() for the completed call:
 *  a real provider emits both, and the driver needs the completed part to
 *  actually run the tool. */
export function toolInputChunks(toolCallId: string, toolName: string, ...deltas: string[]) {
  return [
    { type: 'tool-input-start', id: toolCallId, toolName },
    ...deltas.map((delta) => ({ type: 'tool-input-delta', id: toolCallId, delta })),
    { type: 'tool-input-end', id: toolCallId },
  ];
}
```

- [ ] **Step 3: Write the failing harness tests**

Append to `desktop/tests/harness-session-loop.test.ts`, inside the existing
top-level `describe('HarnessSession — multi-step turn driver', ...)`:

```ts
  it('emits a toolPreparing heartbeat at tool-input-start, before the tool-call completes', async () => {
    const read = fakeTool('Read');
    const model = scriptedModel([
      stream(
        ...toolInputChunks('c1', 'Read', '{"file_path":', '"x.ts"}'),
        toolCallChunk('c1', 'Read', { file_path: 'x.ts' }),
        finishChunk('tool-calls'),
      ),
      stream(...textChunks('b', 'Done.'), finishChunk('stop')),
    ]);
    const session = makeSession({ model, tools: [read], decide: async () => ALLOW });
    const events = collect(session);
    await drainTurn(session, 'go');

    const prep = events.filter((e) => e.data?.toolPreparing);
    // The FIRST preparing event must precede the tool-use card entirely.
    expect(prep.length).toBeGreaterThan(0);
    expect(prep[0].type).toBe('assistant-thinking');
    expect(prep[0].data.toolPreparing).toMatchObject({ toolCallId: 'c1', toolName: 'Read', chars: 0 });
    expect(events.indexOf(prep[0])).toBeLessThan(events.findIndex((e) => e.type === 'tool-use'));
  });

  it('preparing heartbeats carry no text and no partId, so SessionStore drops them', async () => {
    const read = fakeTool('Read');
    const model = scriptedModel([
      stream(
        ...toolInputChunks('c1', 'Read', '{"file_path":"x.ts"}'),
        toolCallChunk('c1', 'Read', { file_path: 'x.ts' }),
        finishChunk('tool-calls'),
      ),
      stream(...textChunks('b', 'Done.'), finishChunk('stop')),
    ]);
    const session = makeSession({ model, tools: [read], decide: async () => ALLOW });
    const events = collect(session);
    await drainTurn(session, 'go');

    for (const e of events.filter((ev) => ev.data?.toolPreparing)) {
      expect(e.data.text).toBeUndefined();
      expect(e.data.partId).toBeUndefined();
    }
  });

  it('throttles argument-progress emits to one per TOOL_PREPARING_EMIT_MS per call', async () => {
    // 40 deltas arrive back-to-back within one tick. Unthrottled that is 41
    // events; throttled it is the unconditional start plus at most a couple of
    // window crossings. Asserting "far fewer than the delta count" pins the
    // throttle without pinning wall-clock timing, which is flaky in CI.
    const read = fakeTool('Read');
    const deltas = Array.from({ length: 40 }, (_, i) => `chunk${i}`);
    const model = scriptedModel([
      stream(
        ...toolInputChunks('c1', 'Read', ...deltas),
        toolCallChunk('c1', 'Read', { file_path: 'x.ts' }),
        finishChunk('tool-calls'),
      ),
      stream(...textChunks('b', 'Done.'), finishChunk('stop')),
    ]);
    const session = makeSession({ model, tools: [read], decide: async () => ALLOW });
    const events = collect(session);
    await drainTurn(session, 'go');

    const prep = events.filter((e) => e.data?.toolPreparing);
    expect(prep.length).toBeLessThan(10);
    expect(prep.length).toBeGreaterThan(0);
  });

  it('tool-input-end emits nothing on its own', async () => {
    // The completed tool-call part follows immediately and supersedes the card;
    // an event here would be pure noise on every single tool call.
    const read = fakeTool('Read');
    const model = scriptedModel([
      stream(
        { type: 'tool-input-start', id: 'c1', toolName: 'Read' },
        { type: 'tool-input-end', id: 'c1' },
        toolCallChunk('c1', 'Read', { file_path: 'x.ts' }),
        finishChunk('tool-calls'),
      ),
      stream(...textChunks('b', 'Done.'), finishChunk('stop')),
    ]);
    const session = makeSession({ model, tools: [read], decide: async () => ALLOW });
    const events = collect(session);
    await drainTurn(session, 'go');

    expect(events.filter((e) => e.data?.toolPreparing).length).toBe(1);
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd desktop && npx vitest run tests/harness-session-loop.test.ts -t "toolPreparing"
```

Expected: FAIL. The first test fails on `expect(prep.length).toBeGreaterThan(0)`
(received 0) — the part switch currently drops these parts into `default:`-nothing.

- [ ] **Step 5: Add the throttle constant**

In `desktop/src/main/harness/harness-session.ts`, beside the other timing
constants (near `STALL_WARNING_MS` / `STALL_RETRY_COUNTDOWN_MS`):

```ts
/** Min gap between argument-progress emits, PER tool call. The preparing card
 *  only has to prove the stream is alive; a per-chunk emit would spam desktop
 *  IPC, the remote WebSocket, and the Android bridge for no extra information.
 *  Same reasoning as the promptProcessing throttle (lastPrefillEmitAt). */
const TOOL_PREPARING_EMIT_MS = 300;
```

- [ ] **Step 6: Add the per-step progress map**

In the same file, immediately before the `try {` that opens the consume loop
(~:1710, just after `armWatchdog();`):

```ts
    // Argument-generation progress, keyed by the provider's tool call id. Per
    // STEP, not per session: a retry re-enters this function with a fresh map.
    // Display-only — the card the renderer draws from this never reaches disk.
    const preparing = new Map<string, { toolName: string; chars: number; lastEmitAt: number }>();
```

- [ ] **Step 7: Add the two stream-part cases**

In the part switch, immediately before `case 'tool-call':` (:1789):

```ts
          case 'tool-input-start': {
            // The model has begun COMPOSING a tool call — nothing has executed.
            // Emitted unthrottled on purpose: this is the event that makes the
            // card appear, and every ms of delay here is visible generic-spinner
            // time, which is the entire problem this exists to fix.
            //
            // NOTE the field names: on fullStream this part is
            // { id, toolName } (TextStreamToolInputStartPart) — NOT the
            // { toolCallId, ... } UIMessageChunk variant of the same name.
            // `id` is the same string the completed 'tool-call' below carries as
            // toolCallId, which is what lets the card transition IN PLACE.
            const prepId = typeof part.id === 'string' ? part.id : '';
            const prepName = typeof part.toolName === 'string' ? part.toolName : '';
            if (!prepId || !prepName) break;
            preparing.set(prepId, { toolName: prepName, chars: 0, lastEmitAt: Date.now() });
            this.emitEvent('assistant-thinking', {
              toolPreparing: { toolCallId: prepId, toolName: prepName, chars: 0 },
            });
            break;
          }
          case 'tool-input-delta': {
            // Argument fragments. Counted for the card's liveness counter and
            // otherwise DISCARDED — the completed 'tool-call' part carries the
            // real parsed input, and buffering a second copy of a whole file
            // here would double the turn's peak memory for no gain.
            //
            // Deliberately does NOT set emittedAny: that flag gates whether a
            // stall may auto-retry, and flipping it here would disable the retry
            // for every turn whose stall lands mid-arguments. Nothing has
            // executed at that point, so re-running the step is exactly the safe
            // case the retry exists for.
            const deltaId = typeof part.id === 'string' ? part.id : '';
            const entry = preparing.get(deltaId);
            if (!entry) break;
            entry.chars += typeof part.delta === 'string' ? part.delta.length : 0;
            const nowMs = Date.now();
            if (nowMs - entry.lastEmitAt < TOOL_PREPARING_EMIT_MS) break;
            entry.lastEmitAt = nowMs;
            this.emitEvent('assistant-thinking', {
              toolPreparing: { toolCallId: deltaId, toolName: entry.toolName, chars: entry.chars },
            });
            break;
          }
```

- [ ] **Step 8: Withdraw preparing cards on the stall auto-retry**

In the `if (chunk === 'stall')` block, replace the existing line

```ts
          if (!emittedAny && isFirstAttempt) return STALL_RETRY;
```

with:

```ts
          if (!emittedAny && isFirstAttempt) {
            // The step re-runs INSIDE the same turn, so endTurn's reaping never
            // fires. Withdraw any preparing card explicitly or it spins for the
            // rest of the turn while the retry mints a second card beside it.
            for (const [prepId, entry] of preparing) {
              this.emitEvent('assistant-thinking', {
                toolPreparing: { toolCallId: prepId, toolName: entry.toolName, chars: entry.chars, cleared: true },
              });
            }
            return STALL_RETRY;
          }
```

- [ ] **Step 9: Run the harness tests to verify they pass**

```bash
cd desktop && npx vitest run tests/harness-session-loop.test.ts
```

Expected: PASS, whole file (the four new tests plus every pre-existing one — the
emit-ORDER assertions in this suite are the guard that the new cases did not
disturb the existing sequence).

- [ ] **Step 10: Write the persistence pin**

Append inside `describe('SessionStore', ...)` in `desktop/tests/session-store.test.ts`:

```ts
  it('never persists a toolPreparing heartbeat, and does not flush the open part', async () => {
    // Partial tool arguments must not reach the JSONL — a resume would replay a
    // half-written file. The filter this relies on keys off "assistant-thinking
    // with no text and no partId", so ADDING A FIELD to that event is exactly
    // how it would silently regress.
    await store.create(HEADER);
    await store.append(HEADER.cwd, ev('assistant-text', { text: 'Writing', partId: 'p1' }, 'u-1') as any);
    await store.append(HEADER.cwd, ev('assistant-thinking', {
      toolPreparing: { toolCallId: 'c1', toolName: 'Write', chars: 512 },
    }, 'u-2') as any);
    await store.append(HEADER.cwd, ev('assistant-text', { text: ' a file', partId: 'p1' }, 'u-3') as any);
    await store.append(HEADER.cwd, ev('turn-complete', {}, 'u-4') as any);

    const events = store.readEvents('s-1', HEADER.cwd);
    expect(events.some((e) => (e.data as any)?.toolPreparing)).toBe(false);
    // The open p1 part was NOT flushed by the heartbeat: both halves coalesced
    // into ONE persisted assistant-text.
    const texts = events.filter((e) => e.type === 'assistant-text');
    expect(texts).toHaveLength(1);
    expect(texts[0].data.text).toBe('Writing a file');
  });
```

- [ ] **Step 11: Run the persistence pin**

```bash
cd desktop && npx vitest run tests/session-store.test.ts
```

Expected: PASS with no source change — this pins behavior that already holds
(`session-store.ts:93`). If it FAILS, stop: the filter has drifted and the whole
design's persistence assumption is void.

- [ ] **Step 12: Commit**

```bash
git add src/shared/types.ts src/main/harness/harness-session.ts \
        tests/helpers/scripted-model.ts tests/harness-session-loop.test.ts \
        tests/session-store.test.ts
git commit -m "feat(native): emit tool-argument progress as a display-only heartbeat

tool-input-start/-delta already reached the consume loop and fell into
default:-nothing. Surface them as assistant-thinking.toolPreparing so the
renderer can draw a preparing tool card instead of a bare spinner.

Non-persisted by construction: no text, no partId, so session-store's
existing filter drops it. Throttled to 300ms per call. The stall
auto-retry withdraws its cards explicitly, since it re-runs a step
without ending the turn.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Reducer state types

**Files:**
- Modify: `desktop/src/shared/types.ts` (`ToolCallState`, :321–347)
- Modify: `desktop/src/renderer/state/chat-types.ts` (`ChatAction` union, beside `TRANSCRIPT_THINKING_HEARTBEAT` at :427)

**Interfaces:**
- Consumes: `toolPreparing` payload from Task 1.
- Produces: `ToolCallState.preparing?: boolean`, `ToolCallState.preparingChars?: number`, and the `NATIVE_TOOL_PREPARING` action — consumed by Tasks 3, 4, 5.

This task is types only; it has no test of its own because it has no behavior.
Its verification is `tsc`, and Task 3 exercises it.

- [ ] **Step 1: Extend `ToolCallState`**

In `desktop/src/shared/types.ts`, inside `interface ToolCallState`, after
`external?: boolean;`:

```ts
  /**
   * Native runtime only. The model is still GENERATING this call's arguments —
   * nothing has executed, and `input` is an empty object until the real
   * tool-use event supersedes this entry in place.
   *
   * A FLAG on a 'running' entry rather than a fifth ToolCallStatus, so every
   * existing status consumer (endTurn, ChatView's hasRunningTools, ToolCard's
   * spinner, AssistantTurnBubble's awaiting-approval hiding) keeps working
   * untouched. Exactly two places opt in: ToolCard's body and reaping.
   *
   * Display-only and NEVER persisted — a preparing entry is DELETED on turn
   * end, never failed and never given a result, so the tool-call/result pairing
   * invariant is not involved.
   */
  preparing?: boolean;
  /** Argument characters generated so far — the preparing card's liveness
   *  counter. Meaningless once `preparing` is gone. */
  preparingChars?: number;
```

- [ ] **Step 2: Add the action variant**

In `desktop/src/renderer/state/chat-types.ts`, immediately after the
`TRANSCRIPT_THINKING_HEARTBEAT` variant (ends :435):

```ts
  | {
      // Native runtime only. The model is generating a tool call's arguments.
      // Creates (or updates) a display-only "preparing" tool card keyed by the
      // provider's REAL tool call id, so the later TRANSCRIPT_TOOL_USE — which
      // is already idempotent by toolUseId — supersedes it in place rather than
      // adding a second card.
      type: 'NATIVE_TOOL_PREPARING';
      sessionId: string;
      toolCallId: string;
      toolName: string;
      chars: number;
      // The step is being retried; withdraw this card. No-op if the id already
      // became a real tool.
      cleared?: boolean;
    }
```

- [ ] **Step 3: Verify it compiles**

```bash
cd desktop && npx tsc --noEmit
```

Expected: PASS (no new errors — the reducer's switch is not exhaustive-checked
on `ChatAction`, so an unhandled variant is not yet an error).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/renderer/state/chat-types.ts
git commit -m "feat(chat): add preparing tool-call state and NATIVE_TOOL_PREPARING action

preparing is a flag on a running entry, deliberately NOT a fifth
ToolCallStatus: every existing status consumer then keeps working
untouched, and no dead branch is created.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Reducer — create, supersede, and reap preparing cards

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts` (extract placement helper from `TRANSCRIPT_TOOL_USE` :939–991; add `removePreparingTool`; add `NATIVE_TOOL_PREPARING` case; extend `endTurn` :171–203)
- Test: `desktop/src/renderer/state/__tests__/chat-reducer.test.ts`

**Interfaces:**
- Consumes: `NATIVE_TOOL_PREPARING` (Task 2), `ToolCallState.preparing` / `preparingChars` (Task 2).
- Produces: reducer behavior consumed by Tasks 4 and 5. No exported symbols beyond the existing `chatReducer`.

- [ ] **Step 1: Write the failing reducer tests**

Append to `desktop/src/renderer/state/__tests__/chat-reducer.test.ts`:

```ts
describe('chatReducer NATIVE_TOOL_PREPARING', () => {
  const SESSION = 'sess-1';
  function initState(): ChatState {
    return new Map([[SESSION, createSessionChatState()]]);
  }
  const prep = (chars: number, extra: Record<string, unknown> = {}) => ({
    type: 'NATIVE_TOOL_PREPARING' as const,
    sessionId: SESSION,
    toolCallId: 'c1',
    toolName: 'Write',
    chars,
    ...extra,
  });
  const groupsOf = (s: ChatState) => [...s.get(SESSION)!.toolGroups.values()];
  const idCount = (s: ChatState, id: string) =>
    groupsOf(s).flatMap((g) => g.toolIds).filter((t) => t === id).length;

  it('creates a running+preparing card with empty input, placed in a group', () => {
    const next = chatReducer(initState(), prep(0));
    const session = next.get(SESSION)!;
    const card = session.toolCalls.get('c1')!;
    expect(card).toMatchObject({
      toolUseId: 'c1', toolName: 'Write', status: 'running', preparing: true, preparingChars: 0,
    });
    expect(card.input).toEqual({});
    expect(idCount(next, 'c1')).toBe(1);
    expect(session.activeTurnToolIds.has('c1')).toBe(true);
  });

  it('a later progress update changes only the count — no second card, no re-placement', () => {
    let state = chatReducer(initState(), prep(0));
    const groupIdBefore = groupsOf(state)[0].id;
    state = chatReducer(state, prep(512));
    state = chatReducer(state, prep(2048));
    expect(state.get(SESSION)!.toolCalls.size).toBe(1);
    expect(state.get(SESSION)!.toolCalls.get('c1')!.preparingChars).toBe(2048);
    expect(idCount(state, 'c1')).toBe(1);
    expect(groupsOf(state)[0].id).toBe(groupIdBefore);
  });

  it('TRANSCRIPT_TOOL_USE with the same id supersedes it IN PLACE', () => {
    // This is the load-bearing behavior: the completed tool-call carries the
    // SAME provider id as tool-input-start, and TRANSCRIPT_TOOL_USE is already
    // idempotent by toolUseId, so no merge machinery is needed. If the
    // idempotent group placement ever regresses, this test is what catches it.
    let state = chatReducer(initState(), prep(2048));
    const groupIdBefore = groupsOf(state)[0].id;
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE', sessionId: SESSION, uuid: 'u-1',
      toolUseId: 'c1', toolName: 'Write', toolInput: { file_path: 'a.ts', content: 'x' },
    } as any);

    const card = state.get(SESSION)!.toolCalls.get('c1')!;
    expect(card.preparing).toBeUndefined();
    expect(card.status).toBe('running');
    expect(card.input).toEqual({ file_path: 'a.ts', content: 'x' });
    expect(idCount(state, 'c1')).toBe(1);
    expect(groupsOf(state)[0].id).toBe(groupIdBefore);
  });

  it('cleared removes the card and prunes the emptied group and its turn segment', () => {
    let state = chatReducer(initState(), prep(2048));
    const turnId = state.get(SESSION)!.currentTurnId!;
    state = chatReducer(state, prep(2048, { cleared: true }));

    const session = state.get(SESSION)!;
    expect(session.toolCalls.has('c1')).toBe(false);
    expect(session.activeTurnToolIds.has('c1')).toBe(false);
    expect(session.toolGroups.size).toBe(0);
    expect(session.assistantTurns.get(turnId)!.segments).toEqual([]);
  });

  it('cleared is a NO-OP once the id became a real tool card', () => {
    // A retry-clear must never delete a real card. The clear can only race a
    // tool-use that already landed, and deleting THAT would drop a tool whose
    // result is still coming — the dangling-pair failure the runtime forbids.
    let state = chatReducer(initState(), prep(2048));
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE', sessionId: SESSION, uuid: 'u-1',
      toolUseId: 'c1', toolName: 'Write', toolInput: { file_path: 'a.ts' },
    } as any);
    state = chatReducer(state, prep(2048, { cleared: true }));

    expect(state.get(SESSION)!.toolCalls.get('c1')).toBeDefined();
    expect(state.get(SESSION)!.toolCalls.get('c1')!.input).toEqual({ file_path: 'a.ts' });
  });

  it('endTurn DELETES preparing cards but still FAILS real running ones', () => {
    // No tool was ever invoked for a preparing card, so "Write · failed" would
    // describe an event that did not happen (Destin, 2026-08-12).
    let state = chatReducer(initState(), prep(2048));
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TOOL_USE', sessionId: SESSION, uuid: 'u-1',
      toolUseId: 'real-1', toolName: 'Bash', toolInput: { command: 'ls' },
    } as any);
    state = chatReducer(state, {
      type: 'TRANSCRIPT_TURN_COMPLETE', sessionId: SESSION, uuid: 'u-2', timestamp: 2000,
    } as any);

    const session = state.get(SESSION)!;
    expect(session.toolCalls.has('c1')).toBe(false);
    expect(session.toolCalls.get('real-1')!.status).toBe('failed');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd desktop && npx vitest run src/renderer/state/__tests__/chat-reducer.test.ts -t "NATIVE_TOOL_PREPARING"
```

Expected: FAIL on the first test — `session.toolCalls.get('c1')` is `undefined`
because the reducer has no case for the action and returns state unchanged.

- [ ] **Step 3: Extract the shared group-placement helper**

In `desktop/src/renderer/state/chat-reducer.ts`, add after `getOrCreateTurn`
(ends :84):

```ts
/**
 * Place a tool id in the session's current tool group, creating the turn and/or
 * group if needed. IDEMPOTENT by tool id: an id already in a group leaves both
 * the group and currentGroupId untouched, so a re-emit can never render a
 * duplicate card or retarget where subsequent tools land.
 *
 * Shared by TRANSCRIPT_TOOL_USE and NATIVE_TOOL_PREPARING. It MUST stay one
 * function: the whole preparing-card design rests on the two paths placing a
 * card identically, so the real tool-use supersedes the preparing entry in
 * place instead of adding a second card beside it.
 */
function placeToolInCurrentGroup(
  session: SessionChatState,
  toolUseId: string,
): {
  assistantTurns: Map<string, AssistantTurn>;
  timeline: TimelineEntry[];
  toolGroups: Map<string, ToolGroupState>;
  currentGroupId: string | null;
  currentTurnId: string;
} {
  const { assistantTurns, timeline, currentTurnId } = getOrCreateTurn(session);
  const toolGroups = new Map(session.toolGroups);
  let currentGroupId = session.currentGroupId;

  let existingGroupId: string | null = null;
  for (const [gid, group] of toolGroups) {
    if (group.toolIds.includes(toolUseId)) { existingGroupId = gid; break; }
  }

  if (existingGroupId) {
    // Already placed by an earlier emit of this same tool.
  } else if (currentGroupId && toolGroups.has(currentGroupId)) {
    const group = toolGroups.get(currentGroupId)!;
    toolGroups.set(currentGroupId, { ...group, toolIds: [...group.toolIds, toolUseId] });
  } else {
    currentGroupId = nextGroupId();
    toolGroups.set(currentGroupId, { id: currentGroupId, toolIds: [toolUseId] });
    const turn = assistantTurns.get(currentTurnId)!;
    assistantTurns.set(currentTurnId, {
      ...turn,
      segments: [...turn.segments, { type: 'tool-group', groupId: currentGroupId }],
    });
  }

  return { assistantTurns, timeline, toolGroups, currentGroupId, currentTurnId };
}

/**
 * Remove a PREPARING tool card: no tool was ever invoked, so it is deleted
 * rather than failed. Prunes an emptied group and that group's turn segment —
 * an empty group otherwise renders as a stray bar.
 *
 * Refuses to touch an entry that is not `preparing`, so a stall-retry clear can
 * never delete a real tool card whose result is still coming (that would be the
 * dangling tool_call the native runtime forbids).
 *
 * Shared by the `cleared` path and endTurn so the two removals cannot drift.
 */
function removePreparingTool(
  toolCalls: Map<string, ToolCallState>,
  toolGroups: Map<string, ToolGroupState>,
  assistantTurns: Map<string, AssistantTurn>,
  toolUseId: string,
): boolean {
  const entry = toolCalls.get(toolUseId);
  if (!entry?.preparing) return false;
  toolCalls.delete(toolUseId);

  for (const [gid, group] of toolGroups) {
    if (!group.toolIds.includes(toolUseId)) continue;
    const toolIds = group.toolIds.filter((id) => id !== toolUseId);
    if (toolIds.length > 0) {
      toolGroups.set(gid, { ...group, toolIds });
    } else {
      toolGroups.delete(gid);
      for (const [tid, turn] of assistantTurns) {
        const segments = turn.segments.filter(
          (s) => !(s.type === 'tool-group' && s.groupId === gid),
        );
        if (segments.length !== turn.segments.length) {
          assistantTurns.set(tid, { ...turn, segments });
        }
      }
    }
    break;
  }
  return true;
}
```

If `AssistantTurn`, `TimelineEntry`, `ToolGroupState`, or `SessionChatState` are
not already imported in this file, add them to the existing type imports from
`./chat-types` / `../../shared/types`.

- [ ] **Step 4: Rewrite `TRANSCRIPT_TOOL_USE` to use the helper**

In `chat-reducer.ts`, replace lines :939–991 (from
`let { assistantTurns, timeline, currentTurnId } = getOrCreateTurn(session);`
through the closing brace of the final `else` block) with:

```ts
      // ExitPlanMode: inject plan markdown as its own bubble BEFORE the
      // tool-group, so the full plan is visible in chat view (not just the
      // approval buttons). Runs before placement so the segment order is
      // plan-then-group; injectPlanSegment is idempotent by toolUseId.
      const placed = placeToolInCurrentGroup(session, action.toolUseId);
      let { assistantTurns } = placed;
      const { timeline, toolGroups, currentGroupId, currentTurnId } = placed;
      if (action.toolName === 'ExitPlanMode') {
        assistantTurns = injectPlanSegment(
          assistantTurns,
          currentTurnId,
          action.toolUseId,
          action.toolInput,
        );
      }
```

The ExitPlanMode injection moves *after* placement here; it targets the turn by
id and is idempotent by `toolUseId`, so the only observable difference is
segment order within the turn — which the existing ExitPlanMode tests in this
suite pin. If they fail, restore the original order by calling
`injectPlanSegment` on `session.assistantTurns` before `placeToolInCurrentGroup`
and passing the result through.

- [ ] **Step 5: Add the `NATIVE_TOOL_PREPARING` case**

In `chat-reducer.ts`, immediately before `case 'TRANSCRIPT_TOOL_USE': {` (:826):

```ts
    case 'NATIVE_TOOL_PREPARING': {
      const session = next.get(action.sessionId);
      if (!session) return state;
      const toolCalls = new Map(session.toolCalls);
      const existing = toolCalls.get(action.toolCallId);

      if (action.cleared) {
        // Withdraw a card the stall retry abandoned. No-op unless the entry is
        // still preparing — a real tool card must never be removed here.
        const toolGroups = new Map(session.toolGroups);
        const assistantTurns = new Map(session.assistantTurns);
        if (!removePreparingTool(toolCalls, toolGroups, assistantTurns, action.toolCallId)) {
          return state;
        }
        const activeTurnToolIds = new Set(session.activeTurnToolIds);
        activeTurnToolIds.delete(action.toolCallId);
        next.set(action.sessionId, {
          ...session, toolCalls, toolGroups, assistantTurns, activeTurnToolIds,
          lastActivityAt: Date.now(),
        });
        return next;
      }

      if (existing) {
        // Progress update only. Never touch status, group, or position — the
        // card's identity and slot must survive until the real tool-use lands.
        if (!existing.preparing) return state;
        toolCalls.set(action.toolCallId, { ...existing, preparingChars: action.chars });
        next.set(action.sessionId, { ...session, toolCalls, lastActivityAt: Date.now(), attentionState: 'ok' });
        return next;
      }

      // input:{} because ToolCallState.input is non-optional; the real input
      // arrives with TRANSCRIPT_TOOL_USE, which overwrites this entry wholesale.
      toolCalls.set(action.toolCallId, {
        toolUseId: action.toolCallId,
        toolName: action.toolName,
        input: {},
        status: 'running',
        preparing: true,
        preparingChars: action.chars,
      });
      const { assistantTurns, timeline, toolGroups, currentGroupId, currentTurnId } =
        placeToolInCurrentGroup(session, action.toolCallId);
      const activeTurnToolIds = new Set(session.activeTurnToolIds);
      activeTurnToolIds.add(action.toolCallId);
      next.set(action.sessionId, {
        ...session, toolCalls, toolGroups, assistantTurns, timeline,
        currentGroupId, currentTurnId, activeTurnToolIds,
        lastActivityAt: Date.now(),
        attentionState: 'ok',
      });
      return next;
    }
```

- [ ] **Step 6: Teach `endTurn` to delete rather than fail**

In `endTurn` (:171), replace the loop body:

```ts
  const toolCalls = new Map(session.toolCalls);
  const toolGroups = new Map(session.toolGroups);
  const assistantTurns = new Map(session.assistantTurns);
  for (const id of session.activeTurnToolIds) {
    const tool = toolCalls.get(id);
    if (!tool) continue;
    // A PREPARING card is deleted, not failed: the model was still composing
    // the request, so no tool was ever invoked and "failed" would describe an
    // event that did not happen (Destin, 2026-08-12).
    if (tool.preparing) {
      removePreparingTool(toolCalls, toolGroups, assistantTurns, id);
      continue;
    }
    if (tool.status === 'running' || tool.status === 'awaiting-approval') {
      toolCalls.set(id, { ...tool, status: 'failed', error: errorMessage });
    }
  }
  return {
    toolCalls,
    toolGroups,
    assistantTurns,
```

…leaving the rest of the returned object (`isThinking: false` onward) unchanged.

- [ ] **Step 7: Run the reducer suite**

```bash
cd desktop && npx vitest run src/renderer/state/__tests__/chat-reducer.test.ts
```

Expected: PASS, whole file. The pre-existing `TRANSCRIPT_TOOL_USE` idempotence
and ExitPlanMode tests are the guard on the Step 4 refactor — if any fails, fix
the refactor rather than the test.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/state/chat-reducer.ts src/renderer/state/__tests__/chat-reducer.test.ts
git commit -m "feat(chat): preparing tool cards in the reducer

NATIVE_TOOL_PREPARING creates a running+preparing card keyed by the
provider's real tool call id, so the existing idempotent
TRANSCRIPT_TOOL_USE supersedes it in place. Group placement is now one
shared helper — the two paths MUST place identically or the real
tool-use would add a second card.

endTurn deletes preparing cards rather than failing them: no tool was
ever invoked. Same removal helper backs the stall-retry withdrawal, and
it refuses any entry that is not preparing so a real card can never be
dropped.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Dispatch from both transcript switches

**Files:**
- Modify: `desktop/src/renderer/App.tsx` (:1218–1242, the `assistant-thinking` case)
- Modify: `desktop/src/renderer/components/buddy/BubbleFeed.tsx` (:182–205, the same case)
- Test: `desktop/tests/transcript-event-surface-parity.test.ts`

**Interfaces:**
- Consumes: `event.data.toolPreparing` (Task 1), `NATIVE_TOOL_PREPARING` (Task 2).
- Produces: nothing further consumes this task.

**Why two files.** The buddy window is a separate `BrowserWindow` and cannot
share the main window's `ChatProvider`, so each owns its own transcript switch
feeding the same reducer. Both already handle `assistant-thinking` and
`tool-use`. A dispatch in only one makes the buddy feed draw the card late while
the main window draws it early — the exact class of drift that shipped in PR #287.

- [ ] **Step 1: Write the failing parity pin**

Append inside `describe('transcript event surface parity: App.tsx vs BubbleFeed.tsx', ...)`
in `desktop/tests/transcript-event-surface-parity.test.ts`:

```ts
  it('both switches dispatch the preparing-tool-card payload', () => {
    // Case-label parity (the test above) cannot see this: both files already
    // handle 'assistant-thinking', so a toolPreparing branch missing from one
    // of them is invisible to a label comparison.
    const app = readFileSync(join(RENDERER, 'App.tsx'), 'utf8');
    const buddy = readFileSync(join(RENDERER, 'components', 'buddy', 'BubbleFeed.tsx'), 'utf8');
    expect(app).toContain('toolPreparing');
    expect(buddy).toContain('toolPreparing');
    expect(app).toContain('NATIVE_TOOL_PREPARING');
    expect(buddy).toContain('NATIVE_TOOL_PREPARING');
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd desktop && npx vitest run tests/transcript-event-surface-parity.test.ts
```

Expected: FAIL — `expect(app).toContain('toolPreparing')` finds nothing.

- [ ] **Step 3: Dispatch from App.tsx**

In `desktop/src/renderer/App.tsx`, replace the `else` branch of the
`assistant-thinking` case (:1231–1240) with:

```ts
          } else {
            // Argument-generation progress: draw/update the preparing tool card.
            // Dispatched IN ADDITION to the heartbeat, not instead of it — the
            // heartbeat's promptProcessing:null is the right outcome here (prefill
            // is over once arguments are streaming), and suppressing it would
            // strand the previous phase's progress line on screen.
            // MUST mirror BubbleFeed.tsx.
            if (event.data?.toolPreparing) {
              batchTranscriptDispatch({
                type: 'NATIVE_TOOL_PREPARING',
                sessionId: event.sessionId,
                toolCallId: event.data.toolPreparing.toolCallId,
                toolName: event.data.toolPreparing.toolName,
                chars: event.data.toolPreparing.chars,
                cleared: event.data.toolPreparing.cleared,
              });
            }
            batchTranscriptDispatch({
              type: 'TRANSCRIPT_THINKING_HEARTBEAT',
              sessionId: event.sessionId,
              // Native watchdog: a stall-warning payload drives the countdown; a
              // plain heartbeat (no payload) clears it. MUST mirror BubbleFeed.tsx.
              stallWarning: event.data?.stallWarning,
              promptProcessing: event.data?.promptProcessing,
            });
          }
```

- [ ] **Step 4: Dispatch from BubbleFeed.tsx**

In `desktop/src/renderer/components/buddy/BubbleFeed.tsx`, replace the `else`
branch of the `assistant-thinking` case (:196–204) with:

```ts
          } else {
            // Preparing tool card — the buddy feed renders tool cards too, so
            // omitting this would make it draw the card only once arguments
            // finish while the main window draws it immediately. MUST mirror
            // App.tsx or the two windows diverge.
            if (event.data?.toolPreparing) {
              batchDispatch({
                type: 'NATIVE_TOOL_PREPARING',
                sessionId: event.sessionId,
                toolCallId: event.data.toolPreparing.toolCallId,
                toolName: event.data.toolPreparing.toolName,
                chars: event.data.toolPreparing.chars,
                cleared: event.data.toolPreparing.cleared,
              });
            }
            batchDispatch({
              type: 'TRANSCRIPT_THINKING_HEARTBEAT',
              sessionId: event.sessionId,
              // Native watchdog stall countdown — payload sets it, absence clears
              // it. MUST mirror App.tsx or the two windows diverge.
              stallWarning: event.data?.stallWarning,
            });
          }
```

- [ ] **Step 5: Run the parity test and tsc**

```bash
cd desktop && npx vitest run tests/transcript-event-surface-parity.test.ts && npx tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/buddy/BubbleFeed.tsx \
        tests/transcript-event-surface-parity.test.ts
git commit -m "feat(chat): dispatch preparing-card progress from both transcript switches

The buddy window owns a second transcript switch feeding the same
reducer. Both already handled assistant-thinking, so case-label parity
could not catch a branch missing from one — pinned textually instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Render the preparing card

**Files:**
- Modify: `desktop/src/renderer/components/ToolCard.tsx` (`friendlyToolDisplay`, :37)
- Modify: `desktop/src/renderer/components/tool-views/ToolBody.tsx` (`ToolBody`, :911, before the `switch` at :924)
- Test: `desktop/tests/tool-card-preparing.test.tsx` (create)

**Interfaces:**
- Consumes: `ToolCallState.preparing` / `preparingChars` (Task 2).
- Produces: nothing further consumes this task.

The card needs **no new visual state**: `status: 'running'` already renders the
`BrailleSpinner` (`ToolCard.tsx:805`) and suppresses the generic
`ThinkingIndicator` (`ChatView.tsx:901`, `!hasRunningTools`). Only the two text
surfaces change.

- [ ] **Step 1: Write the failing render tests**

Create `desktop/tests/tool-card-preparing.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * A preparing card is an ORDINARY running card — spinner, header, chevron — with
 * two text surfaces swapped. If it ever needs a bespoke visual state, the
 * "preparing is a flag, not a status" decision needs revisiting first.
 *
 * Drives the real ToolCard inside ChatProvider and expands by clicking, the same
 * way tool-body-malformed-input.test.tsx does — ToolBody calls useChatState and
 * cannot be rendered bare.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import ToolCard, { friendlyToolDisplay } from '../src/renderer/components/ToolCard';
import { ChatProvider } from '../src/renderer/state/chat-context';
import type { ToolCallState } from '../src/shared/types';

// This suite mounts several cards; auto-cleanup isn't configured globally, so
// clean up explicitly or queries match prior tests' leftover DOM.
afterEach(cleanup);

const preparingWrite: ToolCallState = {
  toolUseId: 'c1',
  toolName: 'Write',
  input: {},
  status: 'running',
  preparing: true,
  preparingChars: 1240,
} as ToolCallState;

function renderExpanded(t: ToolCallState): HTMLElement {
  const { container } = render(<ChatProvider><ToolCard tool={t} sessionId="s1" /></ChatProvider>);
  fireEvent.click(screen.getByTestId('tool-card-chevron').closest('button')!);
  expect(screen.getByTestId('tool-card-body')).toBeTruthy();
  return container;
}

describe('preparing tool card', () => {
  it('shows a thousands-separated character count in the collapsed detail line', () => {
    expect(friendlyToolDisplay(preparingWrite).detail).toBe('preparing… 1,240 chars');
  });

  it('keeps the tool name as the label so you can tell what is being composed', () => {
    expect(friendlyToolDisplay(preparingWrite).label).toContain('Write');
  });

  it('handles a card that has not counted anything yet', () => {
    const display = friendlyToolDisplay({ ...preparingWrite, preparingChars: 0 } as ToolCallState);
    expect(display.detail).toBe('preparing… 0 chars');
  });

  it('renders the preparing body instead of the argument view', () => {
    const container = renderExpanded(preparingWrite);
    expect(container.textContent).toContain('Still preparing tool call… 1,240 characters so far');
  });

  it('renders the normal argument view once preparing is gone', () => {
    // The real tool-use overwrites the entry wholesale, dropping the flag.
    const container = renderExpanded({
      toolUseId: 'c1', toolName: 'Write', status: 'running',
      input: { file_path: '/tmp/a.ts', content: 'hello' },
    } as ToolCallState);
    expect(container.textContent).not.toContain('Still preparing');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd desktop && npx vitest run tests/tool-card-preparing.test.tsx
```

Expected: FAIL — the first assertion gets `Write`'s normal detail line (empty,
since `input` is `{}`) rather than `preparing… 1,240 chars`.

- [ ] **Step 3: Add the preparing branch to `friendlyToolDisplay`**

In `desktop/src/renderer/components/ToolCard.tsx`, at the very top of
`friendlyToolDisplay` (:37), before `const { toolName, input } = tool;`:

```ts
  // The model is still GENERATING this call's arguments, so `input` is empty and
  // every per-tool detail line below would render blank. Show the argument
  // character count instead: it is the only thing on a preparing card that
  // CHANGES, and for Read/Write/Edit the preparing state is effectively the
  // card's whole visible life (execution is a synchronous fs call), so a static
  // card would sit unchanged for minutes and read as stuck.
  if (tool.preparing) {
    return {
      label: tool.toolName,
      detail: `preparing… ${(tool.preparingChars ?? 0).toLocaleString()} chars`,
    };
  }
```

- [ ] **Step 4: Add the preparing branch to `ToolBody`**

In `desktop/src/renderer/components/tool-views/ToolBody.tsx`, inside
`ToolBody` (:911), replace `const inner = (() => {` with:

```tsx
  const inner = (() => {
    // No arguments exist yet — every view below would render an empty shell.
    if (tool.preparing) {
      return (
        <div className="px-3 py-2 text-xs text-fg-muted">
          {`Still preparing tool call… ${(tool.preparingChars ?? 0).toLocaleString()} characters so far`}
        </div>
      );
    }
```

- [ ] **Step 5: Run the render tests**

```bash
cd desktop && npx vitest run tests/tool-card-preparing.test.tsx
```

Expected: PASS, all five.

- [ ] **Step 6: Check the malformed-input suite still passes**

```bash
cd desktop && npx vitest run tests/tool-body-malformed-input.test.tsx tests/tool-card-budget-gate.test.ts tests/tool-card-external-ask.test.tsx
```

Expected: PASS. These pin `friendlyToolDisplay` / `ToolBody` against
hostile inputs; the new early return must not shadow any of them (it cannot —
`preparing` is only ever set by the reducer's own path).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/ToolCard.tsx \
        src/renderer/components/tool-views/ToolBody.tsx \
        tests/tool-card-preparing.test.tsx
git commit -m "feat(chat): render preparing tool cards

An ordinary running card with two text surfaces swapped: the collapsed
detail line becomes a live argument character count, the expanded body
says the call is still being composed. No new visual state — 'running'
already gives the spinner and already suppresses the generic indicator.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full verification and document lifecycle

**Files:**
- Modify: `docs/active/specs/2026-08-12-tool-arg-streaming-visibility.md` (workspace repo — `status: draft` → `status: shipped`)
- Modify: `ROADMAP.md` (workspace repo — flip the item to `[x]`)
- Move: spec and this plan to `docs/archive/` (workspace repo)

- [ ] **Step 1: Run the full desktop verification**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/preparing-cards
```

Expected: PASS — `tsc --noEmit`, `vitest related`, `knip`, `eslint`, ast-grep,
one exit code. This is branch truth; Serena would have answered from `master`.

- [ ] **Step 2: Run the full test suite**

```bash
cd /home/destin/youcoded-dev/worktrees/preparing-cards/desktop && npx vitest run
```

Expected: PASS. The affected-test mapping in `verify.sh` will not have picked up
every consumer of `endTurn` or `friendlyToolDisplay`, and both are widely used.

- [ ] **Step 3: Hand the visual check to Destin**

Do **not** script an interactive verification rig (workspace `CLAUDE.md`). Ask
Destin to look at it:

```bash
cd /home/destin/youcoded-dev && bash scripts/run-dev.sh preparing-cards --label "Preparing Cards"
```

What to ask him to confirm: on a native session with a slow model, a card appears
as soon as the model starts a Write, its character count climbs, and it becomes
the real card without flicker or a change of position. Then ESC mid-arguments and
confirm the card disappears rather than going red.

- [ ] **Step 4: Merge, push, and clean up**

```bash
cd /home/destin/youcoded-dev/worktrees/preparing-cards
git fetch origin && git rebase origin/master
cd /home/destin/youcoded-dev/youcoded
git checkout master && git pull origin master
git merge --no-ff feat/preparing-tool-cards -m "Merge feat/preparing-tool-cards: preparing tool cards for native turns"
git push origin master
git branch --contains "$(git rev-parse feat/preparing-tool-cards)" | grep master   # verify it landed
git worktree remove ../worktrees/preparing-cards
git push origin --delete feat/preparing-tool-cards
git branch -D feat/preparing-tool-cards
```

- [ ] **Step 5: Close the documents out in the same session**

In `/home/destin/youcoded-dev`: flip the spec's frontmatter to `status: shipped`
and this plan's to `status: shipped`, `git mv` both to `docs/archive/specs/` and
`docs/archive/plans/`, flip the `ROADMAP.md` item at :564 from `- [ ]` to `- [x]`,
then:

```bash
node scripts/audit-anchors.mjs   # expect: MECHANICAL PASS: OK
git add -A && git commit -m "docs: archive preparing-tool-cards spec + plan, close roadmap item" && git push origin master
```

- [ ] **Step 6: Shut the dev server down**

Pushing to master green-lights closing it (workspace `CLAUDE.md`). Kill the
`run-dev.sh` Electron and Vite processes so port 5223 is free for the next
session.

---

## Open item carried from the spec

Whether llama.cpp's `--jinja` grammar-constrained path emits a first tool-call
delta carrying the function name. Not a blocker — a provider that never emits
`tool-input-start` falls through to today's behavior. Worth one check with a
local model before anyone writes "works on local engines" in a doc.
