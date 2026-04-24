# Transcript Metadata Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the transcript → reducer → UI pipeline with four pieces of metadata that already exist in Claude Code JSONL but are dropped today: non-`end_turn` stop reason, per-turn model ID, per-turn token usage, and Anthropic `requestId`. Surface each at the right UX density.

**Architecture:** Extend `transcript-watcher.ts` to extract the extra fields from assistant messages, widen `TranscriptEvent` types + the corresponding reducer actions, store the data on `AssistantTurn`, and render in three places — an inline footer on truncated turns (stopReason), auto-update of the session model pill (model), an opt-in metadata strip on turn bubbles (usage + model), and the session-died banner (requestId).

**Tech Stack:** TypeScript, React, Vitest, Electron IPC (JSON passthrough). No new dependencies.

**Out of scope:** Subagent (sidechain) transcript threading — tracked in a separate plan. Android parity — the Kotlin-side transcript parser (`SessionService.kt`) also reads JSONL and will need matching field extraction; called out as follow-up at plan end. The desktop Electron flow is this plan's scope.

---

## File Map

**Modify:**
- `youcoded/desktop/src/main/transcript-watcher.ts` — extract `stop_reason`, `model`, `usage`, `requestId` from assistant messages and enrich emitted events
- `youcoded/desktop/src/renderer/state/chat-types.ts` — widen `TranscriptEvent`, `TRANSCRIPT_TURN_COMPLETE` action, `AssistantTurn` interface
- `youcoded/desktop/src/renderer/state/chat-reducer.ts` — store new fields on turns; handle stopReason and usage through `TRANSCRIPT_TURN_COMPLETE` and `TRANSCRIPT_ASSISTANT_TEXT`
- `youcoded/desktop/src/renderer/state/theme-context.tsx` — add `showTurnMetadata` preference with localStorage + disk persistence
- `youcoded/desktop/src/renderer/components/AssistantTurnBubble.tsx` — stopReason footer; optional metadata strip
- `youcoded/desktop/src/renderer/components/AttentionBanner.tsx` — accept `anthropicRequestId` and render it in session-died / error copy
- `youcoded/desktop/src/renderer/components/ChatView.tsx` — pass `anthropicRequestId` through to AttentionBanner
- `youcoded/desktop/src/renderer/components/PreferencesPopup.tsx` — new "Show per-turn metadata" toggle
- `youcoded/desktop/src/renderer/App.tsx` — detect model drift from transcript events; call `window.claude.model.setPreference` to reconcile session pill

**Test:**
- `youcoded/desktop/tests/transcript-watcher.test.ts` — field extraction fixtures
- `youcoded/desktop/tests/chat-reducer.test.ts` (create if absent; follow existing test style from `transcript-watcher.test.ts`) — turn-metadata persistence
- `youcoded/desktop/tests/attention-classifier.test.ts` is unrelated — don't touch

**No changes:**
- `preload.ts` / `remote-shim.ts` — `transcript:event` already forwards the full event payload as JSON; new fields ride through without schema changes on the IPC wire.

---

## Naming Decisions (lock these in)

- `stopReason: string | null` — new field on `AssistantTurn`; only stored when `stop_reason !== 'end_turn' && stop_reason !== 'tool_use'`
- `model: string | null` on `AssistantTurn` — **distinct from** the session-level `sessionDefaults.model` in App.tsx; names don't collide because they live in different shapes
- `usage: TurnUsage | null` on `AssistantTurn` — shape: `{ inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }`
- `anthropicRequestId: string | null` on `AssistantTurn` — **not** `requestId`; that name is already used by the permission flow (`chat-types.ts:208`, `chat-reducer.ts:548`) and reusing it will cause silent type collisions
- `showTurnMetadata: boolean` in theme-context, localStorage key `youcoded-show-turn-metadata`, default `false` (matches the "default hidden" precedent set by `da18ee7` for StatusBar derived widgets)

---

## Phase 1 — Transcript watcher enrichment

### Task 1.1: Extract metadata fields from assistant messages

**Files:**
- Modify: `youcoded/desktop/src/main/transcript-watcher.ts` (the `parseLine` function around line 131–210)
- Test: `youcoded/desktop/tests/transcript-watcher.test.ts`

- [ ] **Step 1: Write failing test — stopReason passes through**

Add to `transcript-watcher.test.ts`:

```ts
it('emits stopReason on turn-complete for max_tokens stops', () => {
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 's1',
    uuid: 'u1',
    timestamp: '2026-04-17T00:00:00.000Z',
    requestId: 'req_abc',
    message: {
      model: 'claude-opus-4-7',
      role: 'assistant',
      content: [{ type: 'text', text: 'truncated...' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 10, output_tokens: 4096, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 },
    },
  });
  const events = parseLine(line, 's1');
  const turnComplete = events.find((e) => e.type === 'turn-complete');
  expect(turnComplete).toBeDefined();
  expect(turnComplete!.data).toEqual({
    stopReason: 'max_tokens',
    model: 'claude-opus-4-7',
    anthropicRequestId: 'req_abc',
    usage: { inputTokens: 10, outputTokens: 4096, cacheReadTokens: 5, cacheCreationTokens: 2 },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/transcript-watcher.test.ts -t "emits stopReason"
```

Expected: FAIL — `turnComplete.data` currently only has `{ stopReason }`.

- [ ] **Step 3: Extend turn-complete emission in transcript-watcher.ts**

Replace lines 196–206 (the turn-complete block):

```ts
  // Emit turn-complete for any definitive stop reason except tool_use
  // (tool_use means Claude is waiting for tool results, not actually done).
  // Enrich with model + usage + anthropicRequestId so the reducer can attach
  // them to the completing AssistantTurn for UI surfacing.
  if (message.stop_reason && message.stop_reason !== 'tool_use') {
    const usage = message.usage && {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    events.push({
      type: 'turn-complete',
      sessionId,
      uuid,
      timestamp,
      data: {
        stopReason: message.stop_reason,
        ...(messageModel ? { model: messageModel } : {}),
        ...(parsed.requestId ? { anthropicRequestId: parsed.requestId } : {}),
        ...(usage ? { usage } : {}),
      },
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/transcript-watcher.test.ts -t "emits stopReason"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/main/transcript-watcher.ts youcoded/desktop/tests/transcript-watcher.test.ts
git commit -m "feat(transcript): enrich turn-complete with model, usage, requestId"
```

### Task 1.2: Update TranscriptEvent type definition

**Files:**
- Modify: `youcoded/desktop/src/main/transcript-watcher.ts` — `TranscriptEvent` union at top of file

- [ ] **Step 1: Update the turn-complete variant of the TranscriptEvent type**

In `transcript-watcher.ts`, find the `TranscriptEvent` union type (grep for `type: 'turn-complete'`) and replace the turn-complete variant with:

```ts
  | {
      type: 'turn-complete';
      sessionId: string;
      uuid: string;
      timestamp: number;
      data: {
        stopReason: string;
        model?: string;
        anthropicRequestId?: string;
        usage?: {
          inputTokens: number;
          outputTokens: number;
          cacheReadTokens: number;
          cacheCreationTokens: number;
        };
      };
    }
```

- [ ] **Step 2: Run typecheck**

```bash
cd youcoded/desktop && npx tsc --noEmit
```

Expected: PASS (or only pre-existing errors, no new ones from this change).

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/main/transcript-watcher.ts
git commit -m "feat(transcript): widen turn-complete event type for new fields"
```

---

## Phase 2 — Reducer + AssistantTurn state

### Task 2.1: Extend AssistantTurn interface

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/chat-types.ts:21-26`

- [ ] **Step 1: Extend AssistantTurn interface**

Replace lines 21–26:

```ts
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface AssistantTurn {
  id: string;
  segments: AssistantTurnSegment[];
  /** Epoch ms — captured from the first segment's transcript event */
  timestamp?: number;
  /** Only set when stop_reason is non-end_turn (max_tokens, refusal, etc.). Null for normal completions. */
  stopReason: string | null;
  /** Model ID from the transcript (e.g. 'claude-opus-4-7'). Drives per-turn model chip + drift detection. */
  model: string | null;
  /** Token + cache usage from message.usage. Rendered in the opt-in metadata strip. */
  usage: TurnUsage | null;
  /** Anthropic API request ID (req_…). Surfaced in error banners for support correlation. */
  anthropicRequestId: string | null;
}
```

- [ ] **Step 2: Update the TRANSCRIPT_TURN_COMPLETE action type**

In `chat-types.ts` around line 253, replace:

```ts
  | {
      type: 'TRANSCRIPT_TURN_COMPLETE';
      sessionId: string;
      uuid: string;
      timestamp: number;
      stopReason: string | null;
      model: string | null;
      anthropicRequestId: string | null;
      usage: TurnUsage | null;
    }
```

- [ ] **Step 3: Run typecheck to find the call sites that construct AssistantTurn**

```bash
cd youcoded/desktop && npx tsc --noEmit 2>&1 | grep -E "AssistantTurn|TRANSCRIPT_TURN_COMPLETE" | head -20
```

Expected: Several errors in `chat-reducer.ts` where `AssistantTurn` is constructed without the new fields, and where `TRANSCRIPT_TURN_COMPLETE` is dispatched.

- [ ] **Step 4: Update every AssistantTurn construction site in chat-reducer.ts**

For each site flagged by tsc, add the four new fields defaulting to `null`. Example pattern:

```ts
// OLD
const newTurn: AssistantTurn = { id: turnId, segments: [], timestamp };

// NEW
const newTurn: AssistantTurn = {
  id: turnId,
  segments: [],
  timestamp,
  stopReason: null,
  model: null,
  usage: null,
  anthropicRequestId: null,
};
```

- [ ] **Step 5: Run typecheck to confirm construction sites are fixed**

```bash
cd youcoded/desktop && npx tsc --noEmit 2>&1 | grep "AssistantTurn"
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer/state/chat-types.ts youcoded/desktop/src/renderer/state/chat-reducer.ts
git commit -m "feat(chat): add stopReason/model/usage/anthropicRequestId to AssistantTurn"
```

### Task 2.2: Dispatch site — translate transcript event → action

**Files:**
- Modify: the renderer's transcript-event handler (find via `grep -rn "TRANSCRIPT_TURN_COMPLETE" youcoded/desktop/src/renderer/` — it's the place that listens on `window.claude.transcript.onEvent` and dispatches to the reducer)

- [ ] **Step 1: Locate the dispatch site**

```bash
grep -rn "TRANSCRIPT_TURN_COMPLETE\|'turn-complete'" /c/Users/desti/youcoded-dev/youcoded/desktop/src/renderer/ | grep -v chat-types | grep -v chat-reducer
```

Expected: a hook or a section inside App.tsx that subscribes to transcript events.

- [ ] **Step 2: Extend the dispatcher to forward all new fields**

Replace the existing dispatch for `turn-complete`:

```ts
case 'turn-complete':
  dispatch({
    type: 'TRANSCRIPT_TURN_COMPLETE',
    sessionId: event.sessionId,
    uuid: event.uuid,
    timestamp: event.timestamp,
    stopReason: event.data.stopReason ?? null,
    model: event.data.model ?? null,
    anthropicRequestId: event.data.anthropicRequestId ?? null,
    usage: event.data.usage ?? null,
  });
  break;
```

- [ ] **Step 3: Run typecheck**

```bash
cd youcoded/desktop && npx tsc --noEmit
```

Expected: zero new errors.

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/
git commit -m "feat(chat): forward turn-complete metadata to reducer"
```

### Task 2.3: Reducer handler stores metadata on the turn

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/chat-reducer.ts:526-531` (the `TRANSCRIPT_TURN_COMPLETE` handler)
- Test: `youcoded/desktop/tests/chat-reducer.test.ts` (create file)

- [ ] **Step 1: Create the test file with a failing test**

Create `youcoded/desktop/tests/chat-reducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chatReducer, initialChatState } from '../src/renderer/state/chat-reducer';

describe('TRANSCRIPT_TURN_COMPLETE', () => {
  it('stores stopReason/model/usage/anthropicRequestId on the completing turn', () => {
    // Build a state with an in-flight turn
    let state = chatReducer(initialChatState(), {
      type: 'TRANSCRIPT_ASSISTANT_TEXT',
      sessionId: 's1',
      uuid: 'u1',
      timestamp: 1000,
      text: 'hello',
      model: 'claude-opus-4-7',
    });
    const session = state.sessions.get('s1')!;
    const turnId = session.currentTurnId!;

    state = chatReducer(state, {
      type: 'TRANSCRIPT_TURN_COMPLETE',
      sessionId: 's1',
      uuid: 'u2',
      timestamp: 1100,
      stopReason: 'max_tokens',
      model: 'claude-opus-4-7',
      anthropicRequestId: 'req_abc',
      usage: { inputTokens: 10, outputTokens: 4096, cacheReadTokens: 5, cacheCreationTokens: 2 },
    });

    const turn = state.sessions.get('s1')!.assistantTurns.get(turnId)!;
    expect(turn.stopReason).toBe('max_tokens');
    expect(turn.model).toBe('claude-opus-4-7');
    expect(turn.anthropicRequestId).toBe('req_abc');
    expect(turn.usage).toEqual({ inputTokens: 10, outputTokens: 4096, cacheReadTokens: 5, cacheCreationTokens: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/chat-reducer.test.ts
```

Expected: FAIL — turn fields are still null.

- [ ] **Step 3: Update the reducer handler at chat-reducer.ts:526**

Replace the `case 'TRANSCRIPT_TURN_COMPLETE'` block:

```ts
    case 'TRANSCRIPT_TURN_COMPLETE': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      // Attach completion metadata to the completing turn before clearing
      // turn-scoped state via endTurn(). currentTurnId is the in-flight turn;
      // if it's already null (edge case: turn-complete arrived before any
      // assistant text), skip metadata attachment but still call endTurn.
      const completingTurnId = session.currentTurnId;
      const assistantTurns = new Map(session.assistantTurns);
      if (completingTurnId) {
        const turn = assistantTurns.get(completingTurnId);
        if (turn) {
          assistantTurns.set(completingTurnId, {
            ...turn,
            stopReason: action.stopReason,
            model: action.model ?? turn.model,
            anthropicRequestId: action.anthropicRequestId,
            usage: action.usage,
          });
        }
      }

      next.set(action.sessionId, { ...session, assistantTurns, ...endTurn(session) });
      return next;
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/chat-reducer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/state/chat-reducer.ts youcoded/desktop/tests/chat-reducer.test.ts
git commit -m "feat(chat): reducer stores turn-complete metadata on assistant turn"
```

### Task 2.4: Capture per-turn model on first assistant text

The `model` field rides on every `assistant-text` transcript event (transcript-watcher.ts:145), but it currently has no reducer path. We want the turn's `model` set as soon as the first assistant text arrives — before `turn-complete`, so in-flight turns display the right model in the metadata strip.

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/chat-types.ts` — add `model?: string` to the `TRANSCRIPT_ASSISTANT_TEXT` action
- Modify: `youcoded/desktop/src/renderer/state/chat-reducer.ts` — in the `TRANSCRIPT_ASSISTANT_TEXT` handler, set `turn.model = action.model ?? turn.model` when creating or updating the turn
- Test: `youcoded/desktop/tests/chat-reducer.test.ts`

- [ ] **Step 1: Write failing test**

Add to `chat-reducer.test.ts`:

```ts
it('sets turn.model on first assistant-text when transcript carries model', () => {
  const state = chatReducer(initialChatState(), {
    type: 'TRANSCRIPT_ASSISTANT_TEXT',
    sessionId: 's1',
    uuid: 'u1',
    timestamp: 1000,
    text: 'hi',
    model: 'claude-sonnet-4-6',
  });
  const session = state.sessions.get('s1')!;
  const turn = session.assistantTurns.get(session.currentTurnId!)!;
  expect(turn.model).toBe('claude-sonnet-4-6');
});
```

- [ ] **Step 2: Verify test fails**

```bash
cd youcoded/desktop && npx vitest run tests/chat-reducer.test.ts -t "sets turn.model"
```

Expected: FAIL — `turn.model` is `null`.

- [ ] **Step 3: Add optional model field to TRANSCRIPT_ASSISTANT_TEXT action type**

In `chat-types.ts`, find the `TRANSCRIPT_ASSISTANT_TEXT` action variant and add:

```ts
  | {
      type: 'TRANSCRIPT_ASSISTANT_TEXT';
      sessionId: string;
      uuid: string;
      timestamp: number;
      text: string;
      model?: string;  // NEW — from message.model in transcript
    }
```

- [ ] **Step 4: Update reducer handler to persist model**

In `chat-reducer.ts`, find the `TRANSCRIPT_ASSISTANT_TEXT` case. When constructing a new turn or updating an existing one, include `model: action.model ?? existingTurn?.model ?? null`. Example for the new-turn branch:

```ts
const newTurn: AssistantTurn = {
  id: turnId,
  segments: [{ type: 'text', content: action.text, messageId: action.uuid }],
  timestamp: action.timestamp,
  stopReason: null,
  model: action.model ?? null,
  usage: null,
  anthropicRequestId: null,
};
```

For the update-existing-turn branch:

```ts
assistantTurns.set(existingTurnId, {
  ...existingTurn,
  segments: [...existingTurn.segments, ...],
  model: action.model ?? existingTurn.model,
});
```

- [ ] **Step 5: Update dispatch site to forward model**

Find the transcript-event dispatcher (from Task 2.2 Step 1). In the `assistant-text` case, forward `event.data.model`:

```ts
case 'assistant-text':
  dispatch({
    type: 'TRANSCRIPT_ASSISTANT_TEXT',
    sessionId: event.sessionId,
    uuid: event.uuid,
    timestamp: event.timestamp,
    text: event.data.text,
    model: event.data.model,
  });
  break;
```

- [ ] **Step 6: Verify test passes**

```bash
cd youcoded/desktop && npx vitest run tests/chat-reducer.test.ts
```

Expected: PASS on both turn-complete and model-capture tests.

- [ ] **Step 7: Commit**

```bash
git add youcoded/desktop/src/renderer/
git commit -m "feat(chat): capture per-turn model from transcript assistant-text"
```

---

## Phase 3 — stopReason footer UI

### Task 3.1: Render stopReason footer in AssistantTurnBubble

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/AssistantTurnBubble.tsx`

- [ ] **Step 1: Add a helper at top of file for stopReason copy**

Insert above the `CollapsedToolGroup` function:

```tsx
// Non-end_turn stop reasons rendered inline under the affected turn.
// `end_turn` and `tool_use` never reach the UI (filtered at transcript-watcher.ts:198),
// so the only values we see here are the ones worth explaining.
const STOP_REASON_COPY: Record<string, string> = {
  max_tokens: 'Response truncated — Claude hit the output token limit.',
  stop_sequence: 'Response stopped at a configured stop sequence.',
  refusal: 'Claude declined to respond.',
  pause_turn: 'Extended thinking paused mid-turn.',
};

function StopReasonFooter({ reason }: { reason: string }) {
  const copy = STOP_REASON_COPY[reason] ?? `Response ended: ${reason}.`;
  return (
    <div className="text-xs text-fg-muted italic mt-1 pl-1 border-l-2 border-edge-dim" role="status">
      {copy}
    </div>
  );
}
```

- [ ] **Step 2: Render the footer at the end of the turn's content**

Find the main return statement of `AssistantTurnBubble` (the component that wraps the turn's segments). Just before the closing tag of the bubble's content container, insert:

```tsx
{turn.stopReason && <StopReasonFooter reason={turn.stopReason} />}
```

- [ ] **Step 3: Manual smoke test in dev mode**

```bash
cd youcoded/desktop && npm run dev
```

Then run something that hits max_tokens (e.g., "Write me a 20,000-word essay about bread" on a low-token-limit model) and confirm the footer appears under the truncated response.

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/components/AssistantTurnBubble.tsx
git commit -m "feat(chat): inline footer explaining non-end_turn stop reasons"
```

---

## Phase 4 — Per-turn model tracking + session pill sync

### Task 4.1: Detect mid-session model switches and reconcile the session pill

Background: App.tsx already has a per-session model state (`sessionDefaults.model` at line 200) and a "verify model switch via transcript events" mechanism (comment at line 964–976). We extend that to additionally reconcile when the transcript reveals the user invoked `/model` directly in the terminal view (outside the chat UI's model picker), or when Claude Code auto-downshifts on rate limit.

**Files:**
- Modify: `youcoded/desktop/src/renderer/App.tsx` around the existing model-verification logic

- [ ] **Step 1: Read the existing verification logic**

```bash
grep -n "verify model switch\|model.setPreference\|sessionDefaults.model" /c/Users/desti/youcoded-dev/youcoded/desktop/src/renderer/App.tsx | head -20
```

Read 50 lines of context around the hit at line 964.

- [ ] **Step 2: Add a useEffect that watches assistant-turn model changes**

In App.tsx, below the existing model-verification effect, add:

```tsx
// Reconcile the session model pill when the transcript reveals a drift between
// the user's last-selected model and what Claude Code actually used. Drift can
// happen when: (a) the user typed `/model X` in the terminal directly,
// (b) Claude Code auto-downshifted on rate limit, or (c) a session resume
// picked up a different model. We trust the transcript as authoritative.
useEffect(() => {
  if (!activeSessionId) return;
  const session = chatState.sessions.get(activeSessionId);
  if (!session) return;

  // Find the most recent completed assistant turn with a known model
  let latestModel: string | null = null;
  for (let i = session.timeline.length - 1; i >= 0; i--) {
    const entry = session.timeline[i];
    if (entry.kind === 'assistant-turn') {
      const turn = session.assistantTurns.get(entry.turnId);
      if (turn?.model) {
        latestModel = turn.model;
        break;
      }
    }
  }
  if (!latestModel) return;

  // Resolve to a ModelAlias using the same pattern as App.tsx:371
  const alias = MODELS.find((m) => latestModel!.includes(m.replace(/\[.*\]/, '')));
  if (!alias) return;

  const currentAlias = sessionModels[activeSessionId];
  if (currentAlias && currentAlias !== alias) {
    // Drift detected — reconcile silently. setPreference persists and updates the pill.
    (window.claude as any).model?.setPreference(alias);
    setSessionModels((prev) => ({ ...prev, [activeSessionId]: alias }));
  }
}, [activeSessionId, chatState, sessionModels]);
```

(Adapt variable names — `sessionModels`, `setSessionModels`, `MODELS` — to whatever the existing App.tsx uses; these are illustrative. Read lines ~180–200 of App.tsx for the exact names.)

- [ ] **Step 3: Run typecheck + tests**

```bash
cd youcoded/desktop && npx tsc --noEmit && npm test
```

Expected: all pass.

- [ ] **Step 4: Manual smoke test**

Start dev mode, open a session, type `/model sonnet` directly in the terminal view, send a prompt, confirm the status-bar pill updates to Sonnet within a second of the reply.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/App.tsx
git commit -m "feat(chat): reconcile session model pill when transcript shows drift"
```

---

## Phase 5 — Per-turn metadata strip (opt-in)

### Task 5.1: Add showTurnMetadata preference to theme-context

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/theme-context.tsx`

- [ ] **Step 1: Add the storage key constant**

Near the other `_KEY` constants in theme-context.tsx, add:

```ts
const SHOW_TURN_METADATA_KEY = 'youcoded-show-turn-metadata';
```

- [ ] **Step 2: Add to the context interface**

Find the interface that includes `showTimestamps: boolean; setShowTimestamps: (v: boolean) => void;` and add below it:

```ts
  showTurnMetadata: boolean;
  setShowTurnMetadata: (v: boolean) => void;
```

- [ ] **Step 3: Add to the default context value**

Find `showTimestamps: true, setShowTimestamps: () => {}` and add:

```ts
  showTurnMetadata: false, setShowTurnMetadata: () => {},
```

- [ ] **Step 4: Add state + setter in the provider**

Below the `showTimestamps` state declaration (~line 119):

```ts
const [showTurnMetadata, setShowTurnMetadataState] = useState(() => getStored(SHOW_TURN_METADATA_KEY, '') === '1');

const setShowTurnMetadata = useCallback((v: boolean) => {
  setShowTurnMetadataState(v);
  try { localStorage.setItem(SHOW_TURN_METADATA_KEY, v ? '1' : '0'); } catch {}
  persistAppearance({ showTurnMetadata: v });
}, []);
```

- [ ] **Step 5: Add to the disk-prefs hydration block**

In the `useEffect` that reads prefs from disk (~line 204), after the `showTimestamps` hydration:

```ts
if (typeof prefs.showTurnMetadata === 'boolean') {
  setShowTurnMetadataState(prefs.showTurnMetadata);
}
```

- [ ] **Step 6: Add to the provider's value object**

At the bottom of the provider component, ensure the context value includes `showTurnMetadata, setShowTurnMetadata`.

- [ ] **Step 7: Typecheck**

```bash
cd youcoded/desktop && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add youcoded/desktop/src/renderer/state/theme-context.tsx
git commit -m "feat(prefs): add showTurnMetadata preference (default hidden)"
```

### Task 5.2: Add toggle to PreferencesPopup

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/PreferencesPopup.tsx`

- [ ] **Step 1: Find the showTimestamps toggle**

```bash
grep -n "showTimestamps\|setShowTimestamps" /c/Users/desti/youcoded-dev/youcoded/desktop/src/renderer/components/PreferencesPopup.tsx
```

- [ ] **Step 2: Add a parallel toggle immediately below**

Replicate the existing `showTimestamps` toggle block (label, description, checkbox) for `showTurnMetadata`. Description copy:

```
Show per-turn metadata

Display model, token usage, and cache hits below each assistant response. Helpful for
debugging long sessions or comparing model efficiency. Off by default.
```

- [ ] **Step 3: Verify typecheck + open the popup in dev mode**

```bash
cd youcoded/desktop && npx tsc --noEmit && npm run dev
```

Open Preferences (the gear menu), confirm the new toggle appears, toggle it, restart the app, confirm it persists.

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/components/PreferencesPopup.tsx
git commit -m "feat(prefs): UI toggle for per-turn metadata"
```

### Task 5.3: Render metadata strip in AssistantTurnBubble

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/AssistantTurnBubble.tsx`

- [ ] **Step 1: Import the theme hook**

At the top of AssistantTurnBubble.tsx, add:

```tsx
import { useTheme } from '../state/theme-context';
```

- [ ] **Step 2: Add the strip component above the main export**

```tsx
function TurnMetadataStrip({ turn }: { turn: AssistantTurn }) {
  if (!turn.usage && !turn.model) return null;
  const u = turn.usage;
  const total = u ? u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens : 0;
  const cacheHitPct = u && total > 0
    ? Math.round((u.cacheReadTokens / total) * 100)
    : null;

  return (
    <div
      className="text-[10.5px] text-fg-muted mt-1 pl-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono select-text"
      title="Per-turn metadata from transcript"
    >
      {turn.model && <span>{turn.model}</span>}
      {u && (
        <>
          <span>in {u.inputTokens.toLocaleString()}</span>
          <span>out {u.outputTokens.toLocaleString()}</span>
          {cacheHitPct !== null && <span>cache {cacheHitPct}%</span>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render in the bubble — gated by the preference**

In the component body of `AssistantTurnBubble`, add:

```tsx
const { showTurnMetadata } = useTheme();
```

And at the end of the turn's content (just above the stopReason footer from Task 3.1), insert:

```tsx
{showTurnMetadata && <TurnMetadataStrip turn={turn} />}
```

- [ ] **Step 4: Manual smoke test**

```bash
cd youcoded/desktop && npm run dev
```

Open Preferences → toggle "Show per-turn metadata" on → confirm strip appears under completed turns with model + in/out/cache. Toggle off → strip disappears.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/components/AssistantTurnBubble.tsx
git commit -m "feat(chat): opt-in per-turn metadata strip under assistant bubbles"
```

---

## Phase 6 — requestId in error banners

### Task 6.1: Plumb anthropicRequestId through AttentionBanner

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/AttentionBanner.tsx`
- Modify: `youcoded/desktop/src/renderer/components/ChatView.tsx` — pass the prop down

- [ ] **Step 1: Extend AttentionBanner props**

In AttentionBanner.tsx, add to the `Props` type:

```ts
interface Props {
  state: AttentionState;
  /** Anthropic API request ID for the last assistant turn, if any. Rendered only when state indicates an error for support correlation. */
  anthropicRequestId?: string | null;
}
```

- [ ] **Step 2: Render the request ID for error + session-died states**

Inside the component body, after the main message, add:

```tsx
{(state === 'session-died' || state === 'error') && anthropicRequestId && (
  <div className="text-[10.5px] text-fg-muted font-mono mt-1 select-text">
    Request ID: {anthropicRequestId}
  </div>
)}
```

- [ ] **Step 3: Wire it from ChatView**

In ChatView.tsx, find where `<AttentionBanner state={...} />` is rendered. Pass the last assistant turn's `anthropicRequestId`:

```tsx
const lastTurnRequestId = useMemo(() => {
  for (let i = session.timeline.length - 1; i >= 0; i--) {
    const entry = session.timeline[i];
    if (entry.kind === 'assistant-turn') {
      return session.assistantTurns.get(entry.turnId)?.anthropicRequestId ?? null;
    }
  }
  return null;
}, [session.timeline, session.assistantTurns]);

// ...

<AttentionBanner state={session.attentionState} anthropicRequestId={lastTurnRequestId} />
```

- [ ] **Step 4: Typecheck + smoke**

```bash
cd youcoded/desktop && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/components/AttentionBanner.tsx youcoded/desktop/src/renderer/components/ChatView.tsx
git commit -m "feat(attention): show Anthropic request ID on session-died / error banner"
```

---

## Phase 7 — Full-suite verification + docs

### Task 7.1: Run the full test suite

- [ ] **Step 1: Run all tests**

```bash
cd youcoded/desktop && npm test
```

Expected: all 16 pre-existing test files PASS, plus the new chat-reducer.test.ts PASS.

- [ ] **Step 2: Run the build to confirm production bundle compiles**

```bash
cd youcoded/desktop && npm run build
```

Expected: build succeeds with no new warnings/errors.

### Task 7.2: Update chat-reducer docs

**Files:**
- Modify: `docs/chat-reducer.md`

- [ ] **Step 1: Append a new section documenting the turn metadata fields**

Add to `docs/chat-reducer.md`:

```markdown
## Per-turn metadata

`AssistantTurn` carries four fields populated from the JSONL transcript:

- `stopReason: string | null` — set only for non-`end_turn` completions (`max_tokens`, `refusal`, `stop_sequence`, `pause_turn`). Rendered inline as a footer under the affected turn; `null` means the turn completed normally.
- `model: string | null` — Anthropic model ID (e.g. `claude-opus-4-7`). Captured on the first `TRANSCRIPT_ASSISTANT_TEXT` action. Drives (a) the opt-in per-turn metadata strip and (b) session-pill drift detection in App.tsx.
- `usage: TurnUsage | null` — `{ inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }` from `message.usage`. Populated on `TRANSCRIPT_TURN_COMPLETE`. Displayed only when `showTurnMetadata` preference is on (default off).
- `anthropicRequestId: string | null` — `req_…` from the transcript's outer `requestId`. Surfaced in `AttentionBanner` when state is `session-died` or `error` so the user can reference it when reporting issues.

**Distinct from the permission-flow `requestId`** (`chat-types.ts:208`, used by `PERMISSION_REQUEST` / `PERMISSION_RESPONSE`). Don't conflate.
```

- [ ] **Step 2: Commit**

```bash
git add docs/chat-reducer.md
git commit -m "docs(chat-reducer): document per-turn metadata fields"
```

---

## Android parity — known follow-up

The Kotlin-side transcript parser in `youcoded/app/src/main/.../runtime/` (search for the class that reads `.jsonl` files and dispatches events over the WebSocket bridge) needs the same field extraction to give Android users parity:

- Extract `message.stop_reason`, `message.model`, `message.usage.*`, and top-level `requestId` from each assistant line
- Emit them in the `turn-complete` WebSocket message payload shape identical to desktop's IPC `turn-complete` event
- Emit `model` in the `assistant-text` message payload

The renderer (shared between platforms) will consume them identically once Android emits them. **This is a separate plan** — create a `2026-04-XX-transcript-metadata-android-parity.md` plan that mirrors Phase 1 in Kotlin.

---

## Self-Review

**Spec coverage:**
- #1 stopReason (non-end_turn inline footer): Phase 1 + 2 + 3 ✓
- #4 model tracking + pill sync: Phase 1 + 2 + 4 ✓
- #2 per-turn metadata strip, settings-gated: Phase 5 ✓
- #5 requestId in error surfaces: Phase 6 ✓
- #3 subagent threading: **intentionally excluded** — separate plan

**Placeholder scan:** No TBDs, no "implement later", no "similar to task N" without code. Every step has either an exact command or a complete code block.

**Type consistency:**
- `stopReason: string | null` — consistent across AssistantTurn (types.ts), reducer handler, StopReasonFooter props
- `model: string | null` on AssistantTurn — consistent
- `TurnUsage` shape — `{inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens}` — consistent across transcript-watcher emission, action types, reducer storage, UI render
- `anthropicRequestId` — distinct from existing `requestId` (permission flow); consistent across all sites
- `showTurnMetadata` — localStorage key `youcoded-show-turn-metadata`, context field + setter both named consistently

**Known fragility:**
- Task 2.2 relies on grep to find the dispatch site — if the renderer's transcript-event subscriber was refactored to a different pattern, the step's Step 1 grep discovers it. Worst case: the step becomes "find and adapt" rather than "copy-paste", but the code change is small.
- Task 4.1 uses `sessionModels` / `setSessionModels` as illustrative names — the executor must read App.tsx around line 200 for the real variable names before dropping in the effect.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-17-transcript-metadata-polish.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review between. Keeps main context clean and lets you eyeball each commit.

2. **Inline Execution** — execute tasks in this session with checkpoints. Faster but harder to course-correct if a phase goes sideways.

Which approach?
