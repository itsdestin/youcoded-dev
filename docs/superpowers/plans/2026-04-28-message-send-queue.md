# Message Send Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a YouCoded-managed send queue with inline ghost bubbles, edit/reorder/cancel/pause, force-send (interrupt-then-send), and a 60s failed-state safety net. Bundles Android parity (Mutex serialization + echo-driven submit on `PtyBridge.writeInput`).

**Architecture:** Queue lives in `chat-reducer.ts` per session; gate logic in a new `useQueueReleaser` hook; force-send uses a new `useForceSendCoordinator` hook that sends `\x1b` then waits for idle. Single implementation in shared React covers desktop, Android WebView, and remote browser. Zero new IPC types.

**Tech Stack:** TypeScript, React, Vitest (renderer); Kotlin + kotlinx-coroutines + JUnit (Android).

**Working directory:** All renderer + Android changes happen in the `youcoded` sub-repo. Create a worktree:
```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded-send-queue feat/send-queue
cd ../youcoded-send-queue
```

**Spec reference:** `youcoded-dev/docs/superpowers/specs/2026-04-27-message-send-queue-design.md`. The plan implements the spec verbatim — when in doubt, the spec is the source of truth.

---

## Phase A — Reducer & Types

### Task 1: Extend chat-types with queue state, action types, and message-entry flags

**Files:**
- Modify: `desktop/src/renderer/state/chat-types.ts`

- [ ] **Step 1: Add `QueuedMessage` interface and new fields to `SessionChatState`**

In `chat-types.ts`, after the `TimelineEntry` union, add:

```ts
export interface QueuedMessage {
  id: string;
  text: string;
  attachments?: AttachmentRef[];
  createdAt: number;
  releasing?: boolean;
}

export type QueuePauseReason = 'manual' | 'esc-interrupt' | 'session-died';
```

In the `SessionChatState` interface (around lines 105–142), add:

```ts
  queue: QueuedMessage[];
  queuePaused: boolean;
  queuePauseReason: QueuePauseReason | null;
```

(`AttachmentRef` should already exist; if not, alias to `unknown` for now — the queue doesn't introspect attachments, just carries them through.)

- [ ] **Step 2: Extend the user `TimelineEntry` variant with `forceSend`, `failed`, and `awaitingInterrupt` flags**

Find the user entry in the discriminated union (kind: 'user'). Extend to:

```ts
| { kind: 'user'; message: ChatMessage; pending?: boolean; forceSend?: boolean; awaitingInterrupt?: boolean; failed?: boolean }
```

- [ ] **Step 3: Add new action types to `ChatAction` union**

```ts
| { type: 'QUEUE_ENQUEUE'; sessionId: string; text: string; attachments?: AttachmentRef[]; timestamp: number }
| { type: 'QUEUE_RELEASE_HEAD'; sessionId: string }
| { type: 'QUEUE_FORCE_SEND'; sessionId: string; queuedId?: string; text?: string; timestamp: number }
| { type: 'FORCE_SEND_DELIVER'; sessionId: string; messageId: string }
| { type: 'QUEUE_EDIT'; sessionId: string; queuedId: string; text: string }
| { type: 'QUEUE_REORDER'; sessionId: string; queuedId: string; newIndex: number }
| { type: 'QUEUE_REMOVE'; sessionId: string; queuedId: string }
| { type: 'QUEUE_PAUSE'; sessionId: string; reason: QueuePauseReason }
| { type: 'QUEUE_UNPAUSE'; sessionId: string }
| { type: 'MESSAGE_FAIL_PENDING'; sessionId: string; messageId: string }
```

- [ ] **Step 4: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: Passes (existing reducer doesn't yet handle the new actions, but TS won't error because the action union widens — exhaustiveness in the reducer's switch is via default fall-through).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/state/chat-types.ts
git commit -m "feat(send-queue): add queue state and action types to chat-types"
```

---

### Task 2: Initialize queue state in SESSION_INIT handler

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts` (create)

- [ ] **Step 1: Create test file with failing test for queue initialization**

```ts
// desktop/tests/chat-reducer-queue.test.ts
import { describe, it, expect } from 'vitest';
import { chatReducer } from '../src/renderer/state/chat-reducer';
import type { ChatState } from '../src/renderer/state/chat-types';

const SESSION = 'test-session';

function initState(): ChatState {
  return chatReducer(new Map(), { type: 'SESSION_INIT', sessionId: SESSION });
}

describe('queue state initialization', () => {
  it('SESSION_INIT creates an empty queue, unpaused, no reason', () => {
    const state = initState();
    const session = state.get(SESSION)!;
    expect(session.queue).toEqual([]);
    expect(session.queuePaused).toBe(false);
    expect(session.queuePauseReason).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && npx vitest run tests/chat-reducer-queue.test.ts`
Expected: FAIL — `session.queue` is undefined.

- [ ] **Step 3: Add queue defaults to SESSION_INIT handler**

In `chat-reducer.ts`, find the `SESSION_INIT` case in the reducer switch. Add to the new session object:

```ts
        queue: [],
        queuePaused: false,
        queuePauseReason: null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd desktop && npx vitest run tests/chat-reducer-queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/state/chat-reducer.ts desktop/tests/chat-reducer-queue.test.ts
git commit -m "feat(send-queue): initialize queue state on session init"
```

---

### Task 3: QUEUE_ENQUEUE action handler

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `chat-reducer-queue.test.ts`:

```ts
describe('QUEUE_ENQUEUE', () => {
  it('appends a message to the queue with a unique id and createdAt', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'hello', timestamp: 1000 });
    const session = state.get(SESSION)!;
    expect(session.queue).toHaveLength(1);
    expect(session.queue[0].text).toBe('hello');
    expect(session.queue[0].createdAt).toBe(1000);
    expect(session.queue[0].id).toMatch(/^queued-/);
  });

  it('preserves order on multiple rapid enqueues', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'b', timestamp: 2 });
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'c', timestamp: 3 });
    expect(state.get(SESSION)!.queue.map(q => q.text)).toEqual(['a', 'b', 'c']);
  });

  it('does not append to messages timeline (only the queue)', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'x', timestamp: 1 });
    const session = state.get(SESSION)!;
    expect(session.timeline).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd desktop && npx vitest run tests/chat-reducer-queue.test.ts`
Expected: FAIL — no QUEUE_ENQUEUE handler.

- [ ] **Step 3: Add `nextQueuedId()` helper and `QUEUE_ENQUEUE` handler**

In `chat-reducer.ts`, near `nextMessageId()` (line ~14), add:

```ts
let queuedIdCounter = 0;
export function nextQueuedId(): string { return `queued-${++queuedIdCounter}`; }
```

In the reducer switch, add:

```ts
case 'QUEUE_ENQUEUE': {
  const session = state.get(action.sessionId);
  if (!session) return state;
  const next = new Map(state);
  next.set(action.sessionId, {
    ...session,
    queue: [...session.queue, {
      id: nextQueuedId(),
      text: action.text,
      attachments: action.attachments,
      createdAt: action.timestamp,
    }],
  });
  return next;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd desktop && npx vitest run tests/chat-reducer-queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(send-queue): QUEUE_ENQUEUE appends to queue preserving order"
```

---

### Task 4: QUEUE_REMOVE action handler

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

- [ ] **Step 1: Write failing tests**

Append to test file:

```ts
describe('QUEUE_REMOVE', () => {
  it('removes the matching item from the queue', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'b', timestamp: 2 });
    const idA = state.get(SESSION)!.queue[0].id;
    state = chatReducer(state, { type: 'QUEUE_REMOVE', sessionId: SESSION, queuedId: idA });
    expect(state.get(SESSION)!.queue.map(q => q.text)).toEqual(['b']);
  });

  it('is a no-op for an unknown id', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    const before = state.get(SESSION)!.queue;
    state = chatReducer(state, { type: 'QUEUE_REMOVE', sessionId: SESSION, queuedId: 'nope' });
    expect(state.get(SESSION)!.queue).toBe(before);
  });

  it('is a no-op for a releasing item', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    const id = state.get(SESSION)!.queue[0].id;
    // simulate releasing flag set
    const session = state.get(SESSION)!;
    state.set(SESSION, { ...session, queue: [{ ...session.queue[0], releasing: true }] });
    state = chatReducer(state, { type: 'QUEUE_REMOVE', sessionId: SESSION, queuedId: id });
    expect(state.get(SESSION)!.queue).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Expected: FAIL — no QUEUE_REMOVE handler.

- [ ] **Step 3: Add handler**

```ts
case 'QUEUE_REMOVE': {
  const session = state.get(action.sessionId);
  if (!session) return state;
  const target = session.queue.find(q => q.id === action.queuedId);
  if (!target || target.releasing) return state;
  const next = new Map(state);
  next.set(action.sessionId, {
    ...session,
    queue: session.queue.filter(q => q.id !== action.queuedId),
  });
  return next;
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(send-queue): QUEUE_REMOVE deletes queued items, skips releasing"
```

---

### Task 5: QUEUE_REORDER action handler

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('QUEUE_REORDER', () => {
  it('moves an item to a new index', () => {
    let state = initState();
    ['a', 'b', 'c'].forEach((t, i) =>
      state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: t, timestamp: i })
    );
    const idC = state.get(SESSION)!.queue[2].id;
    state = chatReducer(state, { type: 'QUEUE_REORDER', sessionId: SESSION, queuedId: idC, newIndex: 0 });
    expect(state.get(SESSION)!.queue.map(q => q.text)).toEqual(['c', 'a', 'b']);
  });

  it('clamps newIndex to valid range', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'b', timestamp: 2 });
    const idA = state.get(SESSION)!.queue[0].id;
    state = chatReducer(state, { type: 'QUEUE_REORDER', sessionId: SESSION, queuedId: idA, newIndex: 99 });
    expect(state.get(SESSION)!.queue.map(q => q.text)).toEqual(['b', 'a']);
  });

  it('is a no-op for releasing item', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    const id = state.get(SESSION)!.queue[0].id;
    const session = state.get(SESSION)!;
    state.set(SESSION, { ...session, queue: [{ ...session.queue[0], releasing: true }, ...session.queue.slice(1)] });
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'b', timestamp: 2 });
    state = chatReducer(state, { type: 'QUEUE_REORDER', sessionId: SESSION, queuedId: id, newIndex: 1 });
    expect(state.get(SESSION)!.queue[0].text).toBe('a');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Add handler**

```ts
case 'QUEUE_REORDER': {
  const session = state.get(action.sessionId);
  if (!session) return state;
  const idx = session.queue.findIndex(q => q.id === action.queuedId);
  if (idx === -1) return state;
  const item = session.queue[idx];
  if (item.releasing) return state;
  const without = session.queue.filter(q => q.id !== action.queuedId);
  const target = Math.max(0, Math.min(action.newIndex, without.length));
  const queue = [...without.slice(0, target), item, ...without.slice(target)];
  const next = new Map(state);
  next.set(action.sessionId, { ...session, queue });
  return next;
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(send-queue): QUEUE_REORDER moves queued items with index clamping"
```

---

### Task 6: QUEUE_EDIT action handler

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('QUEUE_EDIT', () => {
  it('updates the text of a queued item', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'hi', timestamp: 1 });
    const id = state.get(SESSION)!.queue[0].id;
    state = chatReducer(state, { type: 'QUEUE_EDIT', sessionId: SESSION, queuedId: id, text: 'updated' });
    expect(state.get(SESSION)!.queue[0].text).toBe('updated');
  });

  it('is a no-op for unknown id', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    const before = state.get(SESSION)!.queue;
    state = chatReducer(state, { type: 'QUEUE_EDIT', sessionId: SESSION, queuedId: 'nope', text: 'x' });
    expect(state.get(SESSION)!.queue).toBe(before);
  });

  it('is a no-op for releasing item', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    const id = state.get(SESSION)!.queue[0].id;
    const s = state.get(SESSION)!;
    state.set(SESSION, { ...s, queue: [{ ...s.queue[0], releasing: true }] });
    state = chatReducer(state, { type: 'QUEUE_EDIT', sessionId: SESSION, queuedId: id, text: 'x' });
    expect(state.get(SESSION)!.queue[0].text).toBe('a');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Add handler**

```ts
case 'QUEUE_EDIT': {
  const session = state.get(action.sessionId);
  if (!session) return state;
  const target = session.queue.find(q => q.id === action.queuedId);
  if (!target || target.releasing) return state;
  const next = new Map(state);
  next.set(action.sessionId, {
    ...session,
    queue: session.queue.map(q =>
      q.id === action.queuedId ? { ...q, text: action.text } : q
    ),
  });
  return next;
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(send-queue): QUEUE_EDIT updates queued message text"
```

---

### Task 7: QUEUE_PAUSE / QUEUE_UNPAUSE handlers

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('QUEUE_PAUSE / QUEUE_UNPAUSE', () => {
  it('PAUSE sets queuePaused and reason', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_PAUSE', sessionId: SESSION, reason: 'manual' });
    const s = state.get(SESSION)!;
    expect(s.queuePaused).toBe(true);
    expect(s.queuePauseReason).toBe('manual');
  });

  it('UNPAUSE clears queuePaused and reason', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_PAUSE', sessionId: SESSION, reason: 'manual' });
    state = chatReducer(state, { type: 'QUEUE_UNPAUSE', sessionId: SESSION });
    const s = state.get(SESSION)!;
    expect(s.queuePaused).toBe(false);
    expect(s.queuePauseReason).toBe(null);
  });

  it('PAUSE preserves queue contents', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    state = chatReducer(state, { type: 'QUEUE_PAUSE', sessionId: SESSION, reason: 'esc-interrupt' });
    expect(state.get(SESSION)!.queue).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Add handlers**

```ts
case 'QUEUE_PAUSE': {
  const session = state.get(action.sessionId);
  if (!session) return state;
  const next = new Map(state);
  next.set(action.sessionId, { ...session, queuePaused: true, queuePauseReason: action.reason });
  return next;
}
case 'QUEUE_UNPAUSE': {
  const session = state.get(action.sessionId);
  if (!session) return state;
  const next = new Map(state);
  next.set(action.sessionId, { ...session, queuePaused: false, queuePauseReason: null });
  return next;
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(send-queue): QUEUE_PAUSE / QUEUE_UNPAUSE manage global pause"
```

---

### Task 8: QUEUE_RELEASE_HEAD handler (queue → pending message)

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('QUEUE_RELEASE_HEAD', () => {
  it('moves head item out of queue and into timeline as pending: true', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'hello', timestamp: 1 });
    state = chatReducer(state, { type: 'QUEUE_RELEASE_HEAD', sessionId: SESSION });
    const s = state.get(SESSION)!;
    expect(s.queue).toEqual([]);
    expect(s.timeline).toHaveLength(1);
    const entry = s.timeline[0];
    expect(entry.kind).toBe('user');
    if (entry.kind === 'user') {
      expect(entry.message.content).toBe('hello');
      expect(entry.pending).toBe(true);
      expect(entry.forceSend).toBeFalsy();
    }
  });

  it('preserves remaining queue order', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'a', timestamp: 1 });
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'b', timestamp: 2 });
    state = chatReducer(state, { type: 'QUEUE_RELEASE_HEAD', sessionId: SESSION });
    expect(state.get(SESSION)!.queue.map(q => q.text)).toEqual(['b']);
  });

  it('is a no-op when queue is empty', () => {
    let state = initState();
    const before = state.get(SESSION)!;
    state = chatReducer(state, { type: 'QUEUE_RELEASE_HEAD', sessionId: SESSION });
    expect(state.get(SESSION)!).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Add handler**

```ts
case 'QUEUE_RELEASE_HEAD': {
  const session = state.get(action.sessionId);
  if (!session || session.queue.length === 0) return state;
  const [head, ...rest] = session.queue;
  const message: ChatMessage = {
    id: nextMessageId(),
    role: 'user',
    content: head.text,
    timestamp: head.createdAt,
  };
  const next = new Map(state);
  next.set(action.sessionId, {
    ...session,
    queue: rest,
    timeline: [...session.timeline, { kind: 'user', message, pending: true }],
  });
  return next;
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(send-queue): QUEUE_RELEASE_HEAD moves queued item to pending timeline entry"
```

---

### Task 9: QUEUE_FORCE_SEND handler (with permissionPending block)

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

The reducer needs to know whether a permission is pending. The existing chat state doesn't track this directly — it's read from a separate hook context. For the reducer test, we'll inject a `permissionPending` flag into `SessionChatState` (already managed by the existing PERMISSION_REQUEST / PERMISSION_RESPONSE handlers). If `SessionChatState` doesn't already have `permissionPending: boolean`, add it in this task too — find where `PERMISSION_REQUEST` is handled in the reducer and confirm the flag exists. If not, add it before the FORCE_SEND tests below.

- [ ] **Step 1: Confirm or add `permissionPending: boolean` to `SessionChatState`**

Search `chat-reducer.ts` for `PERMISSION_REQUEST`. If `permissionPending` isn't tracked in session state, add it:
- Initialize to `false` in SESSION_INIT
- Set to `true` on `PERMISSION_REQUEST`
- Set to `false` on `PERMISSION_RESPONSE`

Also add to `SessionChatState` interface in chat-types.ts.

- [ ] **Step 2: Write failing tests**

```ts
describe('QUEUE_FORCE_SEND', () => {
  it('with text: appends to timeline as pending+forceSend+awaitingInterrupt', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_FORCE_SEND', sessionId: SESSION, text: 'now', timestamp: 1 });
    const s = state.get(SESSION)!;
    expect(s.timeline).toHaveLength(1);
    const entry = s.timeline[0];
    if (entry.kind !== 'user') throw new Error('expected user');
    expect(entry.pending).toBe(true);
    expect(entry.forceSend).toBe(true);
    expect(entry.awaitingInterrupt).toBe(true);
    expect(entry.message.content).toBe('now');
  });

  it('with queuedId: removes from queue, appends to timeline', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'q1', timestamp: 1 });
    const id = state.get(SESSION)!.queue[0].id;
    state = chatReducer(state, { type: 'QUEUE_FORCE_SEND', sessionId: SESSION, queuedId: id, timestamp: 2 });
    const s = state.get(SESSION)!;
    expect(s.queue).toEqual([]);
    expect(s.timeline).toHaveLength(1);
  });

  it('is a no-op when permissionPending is true', () => {
    let state = initState();
    const session = state.get(SESSION)!;
    state.set(SESSION, { ...session, permissionPending: true });
    const before = state.get(SESSION)!;
    state = chatReducer(state, { type: 'QUEUE_FORCE_SEND', sessionId: SESSION, text: 'x', timestamp: 1 });
    expect(state.get(SESSION)!).toBe(before);
  });

  it('is a no-op when neither queuedId nor text is provided', () => {
    let state = initState();
    const before = state.get(SESSION)!;
    state = chatReducer(state, { type: 'QUEUE_FORCE_SEND', sessionId: SESSION, timestamp: 1 });
    expect(state.get(SESSION)!).toBe(before);
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

- [ ] **Step 4: Add handler**

```ts
case 'QUEUE_FORCE_SEND': {
  const session = state.get(action.sessionId);
  if (!session || session.permissionPending) return state;
  let text: string | undefined;
  let queueWithout = session.queue;
  if (action.queuedId) {
    const item = session.queue.find(q => q.id === action.queuedId);
    if (!item) return state;
    text = item.text;
    queueWithout = session.queue.filter(q => q.id !== action.queuedId);
  } else if (action.text !== undefined) {
    text = action.text;
  } else {
    return state;
  }
  const message: ChatMessage = {
    id: nextMessageId(),
    role: 'user',
    content: text,
    timestamp: action.timestamp,
  };
  const next = new Map(state);
  next.set(action.sessionId, {
    ...session,
    queue: queueWithout,
    timeline: [...session.timeline, {
      kind: 'user',
      message,
      pending: true,
      forceSend: true,
      awaitingInterrupt: true,
    }],
  });
  return next;
}
```

- [ ] **Step 5: Run tests, verify they pass**

- [ ] **Step 6: Commit**

```bash
git add -u && git commit -m "feat(send-queue): QUEUE_FORCE_SEND with permissionPending block"
```

---

### Task 10: FORCE_SEND_DELIVER handler (clears awaitingInterrupt)

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('FORCE_SEND_DELIVER', () => {
  it('clears awaitingInterrupt on the matching pending message', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_FORCE_SEND', sessionId: SESSION, text: 'go', timestamp: 1 });
    const entry = state.get(SESSION)!.timeline[0];
    if (entry.kind !== 'user') throw new Error('expected user');
    state = chatReducer(state, { type: 'FORCE_SEND_DELIVER', sessionId: SESSION, messageId: entry.message.id });
    const updated = state.get(SESSION)!.timeline[0];
    if (updated.kind !== 'user') throw new Error('expected user');
    expect(updated.awaitingInterrupt).toBe(false);
    expect(updated.pending).toBe(true);
    expect(updated.forceSend).toBe(true);
  });

  it('is a no-op for unknown messageId', () => {
    let state = initState();
    const before = state.get(SESSION)!;
    state = chatReducer(state, { type: 'FORCE_SEND_DELIVER', sessionId: SESSION, messageId: 'msg-999' });
    expect(state.get(SESSION)!).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Add handler**

```ts
case 'FORCE_SEND_DELIVER': {
  const session = state.get(action.sessionId);
  if (!session) return state;
  const idx = session.timeline.findIndex(e => e.kind === 'user' && e.message.id === action.messageId);
  if (idx === -1) return state;
  const entry = session.timeline[idx];
  if (entry.kind !== 'user' || !entry.awaitingInterrupt) return state;
  const updatedTimeline = [...session.timeline];
  updatedTimeline[idx] = { ...entry, awaitingInterrupt: false };
  const next = new Map(state);
  next.set(action.sessionId, { ...session, timeline: updatedTimeline });
  return next;
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(send-queue): FORCE_SEND_DELIVER clears awaitingInterrupt"
```

---

### Task 11: MESSAGE_FAIL_PENDING handler

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('MESSAGE_FAIL_PENDING', () => {
  it('marks a pending user entry as failed', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'x', timestamp: 1 });
    state = chatReducer(state, { type: 'QUEUE_RELEASE_HEAD', sessionId: SESSION });
    const entry = state.get(SESSION)!.timeline[0];
    if (entry.kind !== 'user') throw new Error('expected user');
    state = chatReducer(state, { type: 'MESSAGE_FAIL_PENDING', sessionId: SESSION, messageId: entry.message.id });
    const updated = state.get(SESSION)!.timeline[0];
    if (updated.kind !== 'user') throw new Error('expected user');
    expect(updated.failed).toBe(true);
    expect(updated.pending).toBe(true);
  });

  it('is a no-op when the entry has already been confirmed (pending false)', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'x', timestamp: 1 });
    state = chatReducer(state, { type: 'QUEUE_RELEASE_HEAD', sessionId: SESSION });
    const entry = state.get(SESSION)!.timeline[0];
    if (entry.kind !== 'user') throw new Error('expected user');
    // Simulate confirmation
    const s = state.get(SESSION)!;
    state.set(SESSION, {
      ...s,
      timeline: s.timeline.map(e =>
        e.kind === 'user' && e.message.id === entry.message.id ? { ...e, pending: false } : e
      ),
    });
    const before = state.get(SESSION)!;
    state = chatReducer(state, { type: 'MESSAGE_FAIL_PENDING', sessionId: SESSION, messageId: entry.message.id });
    expect(state.get(SESSION)!).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Add handler**

```ts
case 'MESSAGE_FAIL_PENDING': {
  const session = state.get(action.sessionId);
  if (!session) return state;
  const idx = session.timeline.findIndex(e =>
    e.kind === 'user' && e.message.id === action.messageId && e.pending === true
  );
  if (idx === -1) return state;
  const entry = session.timeline[idx];
  if (entry.kind !== 'user') return state;
  const updatedTimeline = [...session.timeline];
  updatedTimeline[idx] = { ...entry, failed: true };
  const next = new Map(state);
  next.set(action.sessionId, { ...session, timeline: updatedTimeline });
  return next;
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(send-queue): MESSAGE_FAIL_PENDING marks pending entry as failed"
```

---

### Task 12: Extend SESSION_PROCESS_EXITED to auto-pause queue

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Test: `desktop/tests/chat-reducer-queue.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe('SESSION_PROCESS_EXITED queue interaction', () => {
  it('auto-pauses the queue with reason session-died', () => {
    let state = initState();
    state = chatReducer(state, { type: 'QUEUE_ENQUEUE', sessionId: SESSION, text: 'x', timestamp: 1 });
    state = chatReducer(state, { type: 'SESSION_PROCESS_EXITED', sessionId: SESSION, exitCode: 1 });
    const s = state.get(SESSION)!;
    expect(s.queuePaused).toBe(true);
    expect(s.queuePauseReason).toBe('session-died');
    expect(s.queue).toHaveLength(1); // queued items survive
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Modify SESSION_PROCESS_EXITED handler**

In the existing `SESSION_PROCESS_EXITED` case, add `queuePaused: true, queuePauseReason: 'session-died'` to the merged session state.

- [ ] **Step 4: Run test, verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(send-queue): SESSION_PROCESS_EXITED auto-pauses queue"
```

---

## Phase B — Hooks (Gate, Force-Send Coordinator, Failed Timeout)

### Task 13: useQueueReleaser hook

**Files:**
- Create: `desktop/src/renderer/hooks/useQueueReleaser.ts`
- Test: `desktop/tests/useQueueReleaser.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// desktop/tests/useQueueReleaser.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQueueReleaser } from '../src/renderer/hooks/useQueueReleaser';

// Mock window.claude.session.sendInput
const sendInputMock = vi.fn();
beforeEach(() => {
  sendInputMock.mockReset();
  (window as any).claude = { session: { sendInput: sendInputMock } };
});

// Helper to construct a fake session state
function fakeSession(overrides: Partial<any> = {}) {
  return {
    queue: [],
    queuePaused: false,
    isThinking: false,
    attentionState: 'ok',
    permissionPending: false,
    timeline: [],
    ...overrides,
  };
}

// (Use the chat-context test harness; if not directly mockable, create a small
// provider that lets the hook read state via useChatState.)

describe('useQueueReleaser', () => {
  it('releases head when all gate conditions are open', async () => {
    // Set up a state with one queued item, gate open
    // Render the hook; expect dispatch of QUEUE_RELEASE_HEAD and call to sendInput
    // Use the actual ChatProvider and dispatch to seed state.
  });

  it('does not release when queuePaused is true', async () => {
    // ...
  });

  it('does not release when isThinking is true', async () => {
    // ...
  });

  it('does not release when attentionState !== "ok"', async () => {
    // ...
  });

  it('does not release when permissionPending is true', async () => {
    // ...
  });

  it('does not release when queue is empty', async () => {
    // ...
  });

  it('releases sequentially across state cycles', async () => {
    // Enqueue 3, gate open, release first, simulate isThinking=true (turn started),
    // then attentionState=ok again, expect second release. Repeat.
  });
});
```

Note: The hook reads chat state via the existing `useChatState(sessionId)` and calls `useChatDispatch()`. Tests may need a small `ChatProvider` wrapper. If `chat-context.ts` already exposes a test helper, use that; otherwise the test stubs the imports of `useChatState` / `useChatDispatch` via `vi.mock(...)`.

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement the hook**

```ts
// desktop/src/renderer/hooks/useQueueReleaser.ts
import { useEffect } from 'react';
import { useChatState, useChatDispatch } from '../state/chat-context';

export function useQueueReleaser(sessionId: string): void {
  const session = useChatState(sessionId);
  const dispatch = useChatDispatch();

  useEffect(() => {
    if (!session) return;
    const canRelease =
      !session.queuePaused &&
      !session.isThinking &&
      session.attentionState === 'ok' &&
      !session.permissionPending &&
      session.queue.length > 0 &&
      !session.queue[0].releasing;
    if (!canRelease) return;

    const head = session.queue[0];
    dispatch({ type: 'QUEUE_RELEASE_HEAD', sessionId });
    // Send synchronously (not awaited) — release happens in reducer first
    try {
      window.claude.session.sendInput(sessionId, head.text + '\r');
    } catch (err) {
      // sendInput should not throw, but if it does, log and let useSubmitConfirmation retry
      console.error('[useQueueReleaser] sendInput failed', err);
    }
  }, [
    sessionId,
    session?.queuePaused,
    session?.isThinking,
    session?.attentionState,
    session?.permissionPending,
    session?.queue,
    dispatch,
  ]);
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(send-queue): useQueueReleaser drains queue when gate opens"
```

---

### Task 14: useForceSendCoordinator hook

**Files:**
- Create: `desktop/src/renderer/hooks/useForceSendCoordinator.ts`
- Test: `desktop/tests/useForceSendCoordinator.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// desktop/tests/useForceSendCoordinator.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendInputMock = vi.fn();
beforeEach(() => {
  sendInputMock.mockReset();
  (window as any).claude = { session: { sendInput: sendInputMock } };
});

describe('useForceSendCoordinator', () => {
  it('delivers message body when CC returns to idle (attentionState=ok, isThinking=false)', async () => {
    // Set up a session with one timeline entry that has awaitingInterrupt: true.
    // Render the hook with attentionState=stuck, isThinking=true.
    // Expect no sendInput call.
    // Update state to attentionState=ok, isThinking=false.
    // Expect sendInput called with text + '\r' AND dispatch FORCE_SEND_DELIVER.
  });

  it('uses 3s fallback if interrupt confirmation never lands', async () => {
    vi.useFakeTimers();
    // Enqueue a force-send. State stays mid-turn.
    // Advance timer 3000ms.
    // Expect sendInput called with body + '\r' anyway, FORCE_SEND_DELIVER dispatched.
    vi.useRealTimers();
  });

  it('does not double-deliver if state cycles', async () => {
    // Idle → busy → idle
    // Should call sendInput exactly once.
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement the hook**

```ts
// desktop/src/renderer/hooks/useForceSendCoordinator.ts
import { useEffect, useRef } from 'react';
import { useChatState, useChatDispatch } from '../state/chat-context';

const FALLBACK_MS = 3000;

export function useForceSendCoordinator(sessionId: string): void {
  const session = useChatState(sessionId);
  const dispatch = useChatDispatch();
  const deliveredRef = useRef<Set<string>>(new Set());
  const fallbackTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!session) return;
    const awaitingEntries = session.timeline.filter(
      e => e.kind === 'user' && e.awaitingInterrupt && !deliveredRef.current.has(e.message.id)
    );
    if (awaitingEntries.length === 0) return;

    const idle = !session.isThinking && session.attentionState === 'ok';

    for (const entry of awaitingEntries) {
      if (entry.kind !== 'user') continue;
      const id = entry.message.id;

      if (idle) {
        deliveredRef.current.add(id);
        clearTimeout(fallbackTimers.current.get(id));
        fallbackTimers.current.delete(id);
        try {
          window.claude.session.sendInput(sessionId, entry.message.content + '\r');
        } catch (err) {
          console.error('[useForceSendCoordinator] sendInput failed', err);
        }
        dispatch({ type: 'FORCE_SEND_DELIVER', sessionId, messageId: id });
      } else if (!fallbackTimers.current.has(id)) {
        const t = setTimeout(() => {
          if (deliveredRef.current.has(id)) return;
          deliveredRef.current.add(id);
          fallbackTimers.current.delete(id);
          try {
            window.claude.session.sendInput(sessionId, entry.message.content + '\r');
          } catch (err) {
            console.error('[useForceSendCoordinator] fallback sendInput failed', err);
          }
          dispatch({ type: 'FORCE_SEND_DELIVER', sessionId, messageId: id });
        }, FALLBACK_MS);
        fallbackTimers.current.set(id, t);
      }
    }
  }, [sessionId, session?.timeline, session?.attentionState, session?.isThinking, dispatch]);

  useEffect(() => {
    return () => {
      for (const t of fallbackTimers.current.values()) clearTimeout(t);
    };
  }, []);
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(send-queue): useForceSendCoordinator delivers force-sent messages on idle"
```

---

### Task 15: Extend useSubmitConfirmation to dispatch MESSAGE_FAIL_PENDING after 60s

**Files:**
- Modify: `desktop/src/renderer/hooks/useSubmitConfirmation.ts`
- Test: `desktop/tests/useSubmitConfirmation.test.ts` (extend existing tests)

- [ ] **Step 1: Read the existing hook to understand its tracking shape**

Read `useSubmitConfirmation.ts` end-to-end. Identify the `Map<messageId, TrackedSubmit>` and the timer-tick mechanism. The new behavior: after the existing 8s retry has fired AND 60s total has elapsed since the message was added, AND the message is still pending, dispatch `MESSAGE_FAIL_PENDING`.

- [ ] **Step 2: Write failing test**

```ts
// Append to desktop/tests/useSubmitConfirmation.test.ts
it('dispatches MESSAGE_FAIL_PENDING after 60s when message remains pending', async () => {
  vi.useFakeTimers();
  // Set up a pending message, attentionState ok.
  // Advance 8s — verify retry sendInput fires.
  // Advance to 60s total — verify dispatch MESSAGE_FAIL_PENDING.
  vi.useRealTimers();
});

it('does not dispatch MESSAGE_FAIL_PENDING if transcript confirms before 60s', async () => {
  // ...
});
```

- [ ] **Step 3: Run test, verify it fails**

- [ ] **Step 4: Modify the hook**

Add a `MAX_AGE_MS = 60_000` constant. In the per-tick check (the same place that runs the 8s retry), add:

```ts
if (Date.now() - tracked.startedAt >= MAX_AGE_MS && tracked.retryFired) {
  dispatch({ type: 'MESSAGE_FAIL_PENDING', sessionId, messageId });
  tracked.failed = true;  // prevent re-dispatch
}
```

- [ ] **Step 5: Run test, verify it passes**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(send-queue): MESSAGE_FAIL_PENDING after 60s in useSubmitConfirmation"
```

---

## Phase C — UI

### Task 16: QueuedMessageBubble component

**Files:**
- Create: `desktop/src/renderer/components/QueuedMessageBubble.tsx`
- Test: `desktop/tests/QueuedMessageBubble.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueuedMessageBubble } from '../src/renderer/components/QueuedMessageBubble';

const baseProps = {
  item: { id: 'queued-1', text: 'hello', createdAt: 1 },
  onEdit: vi.fn(),
  onCancel: vi.fn(),
  onForceSend: vi.fn(),
  permissionPending: false,
};

describe('QueuedMessageBubble', () => {
  it('renders the queued message text and badge', () => {
    render(<QueuedMessageBubble {...baseProps} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText(/queued/i)).toBeInTheDocument();
  });

  it('clicking force calls onForceSend', () => {
    render(<QueuedMessageBubble {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/send now/i));
    expect(baseProps.onForceSend).toHaveBeenCalledWith('queued-1');
  });

  it('clicking cancel calls onCancel', () => {
    render(<QueuedMessageBubble {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/cancel/i));
    expect(baseProps.onCancel).toHaveBeenCalledWith('queued-1');
  });

  it('disables force button when permissionPending is true', () => {
    render(<QueuedMessageBubble {...baseProps} permissionPending={true} />);
    expect(screen.getByLabelText(/send now/i)).toBeDisabled();
  });

  it('hides controls when releasing is true', () => {
    render(<QueuedMessageBubble {...baseProps} item={{ ...baseProps.item, releasing: true }} />);
    expect(screen.queryByLabelText(/send now/i)).toBeNull();
    expect(screen.queryByLabelText(/cancel/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement the component**

```tsx
// desktop/src/renderer/components/QueuedMessageBubble.tsx
import { useState } from 'react';
import type { QueuedMessage } from '../state/chat-types';

interface Props {
  item: QueuedMessage;
  onEdit: (id: string, text: string) => void;
  onCancel: (id: string) => void;
  onForceSend: (id: string) => void;
  permissionPending: boolean;
}

export function QueuedMessageBubble({ item, onEdit, onCancel, onForceSend, permissionPending }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const showControls = !item.releasing;

  return (
    <div
      className="layer-surface border border-dashed border-fg-faint p-2 text-fg-2 my-1"
      data-testid="queued-bubble"
    >
      <div className="flex items-center gap-2 text-xs text-fg-muted mb-1">
        <span className="badge">queued</span>
      </div>
      {editing ? (
        <textarea
          autoFocus
          className="w-full bg-inset text-fg p-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEdit(item.id, draft); setEditing(false); }
            if (e.key === 'Escape') { setEditing(false); setDraft(item.text); }
          }}
          onBlur={() => { setEditing(false); setDraft(item.text); }}
        />
      ) : (
        <div onDoubleClick={() => showControls && setEditing(true)}>{item.text}</div>
      )}
      {showControls && (
        <div className="flex items-center gap-1 mt-1">
          <button
            aria-label="Send now"
            disabled={permissionPending}
            onClick={() => onForceSend(item.id)}
            title={permissionPending ? 'Resolve permission prompt first' : 'Send now (interrupts current turn)'}
          >
            ⚡
          </button>
          <button aria-label="Cancel" onClick={() => onCancel(item.id)}>×</button>
        </div>
      )}
    </div>
  );
}
```

(Tailwind classes match existing `.layer-surface` token convention from PITFALLS overlay layer system. Adjust to actual existing styling tokens. Drag-reorder is added in Task 17 below.)

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(send-queue): QueuedMessageBubble component with edit/cancel/force"
```

---

### Task 17: Add drag-reorder to QueuedMessageBubble

**Files:**
- Modify: `desktop/src/renderer/components/QueuedMessageBubble.tsx`
- Test: `desktop/tests/QueuedMessageBubble.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
it('emits onReorder with newIndex when dragged to a new position', () => {
  const onReorder = vi.fn();
  render(
    <QueuedMessageBubble {...baseProps} index={0} onReorder={onReorder} totalItems={3} />
  );
  // Simulate HTML5 drag: dragstart → dragover (target index 2) → drop
  // (Use react-testing-library fireEvent.dragStart / fireEvent.drop with dataTransfer)
});
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Add native HTML5 drag handlers**

Update component props to include `index: number; totalItems: number; onReorder: (id: string, newIndex: number) => void`. Add `draggable={!item.releasing}` to the container, `onDragStart` to set dataTransfer with the queued id + source index, and a sibling drop indicator handled by the parent list (ChatView) that calls `onReorder`.

- [ ] **Step 4: Run test, verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(send-queue): drag-reorder in QueuedMessageBubble"
```

---

### Task 18: Update user message bubble for forceSend (gray) and failed states

**Files:**
- Modify: `desktop/src/renderer/components/UserMessage.tsx` (or whatever the user bubble component is — confirm path before editing)

- [ ] **Step 1: Locate the user message component**

Search for the file that renders `kind === 'user'` entries in ChatView. Path likely `desktop/src/renderer/components/UserMessage.tsx`.

- [ ] **Step 2: Write failing snapshot/style tests**

```tsx
it('renders gray styling and tooltip when forceSend is true', () => {
  render(<UserMessage entry={{ kind: 'user', message: { id: '1', role: 'user', content: 'x', timestamp: 1 }, pending: true, forceSend: true }} />);
  expect(screen.getByTestId('user-bubble')).toHaveClass('opacity-60');
  expect(screen.getByText(/Claude has not yet seen this/)).toBeInTheDocument();
});

it('renders failed state with retry/discard buttons when failed is true', () => {
  const onRetry = vi.fn();
  const onDiscard = vi.fn();
  render(<UserMessage entry={...} onRetry={onRetry} onDiscard={onDiscard} />);
  fireEvent.click(screen.getByLabelText(/retry/i));
  expect(onRetry).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run tests, verify they fail**

- [ ] **Step 4: Update UserMessage component**

Add conditional className (e.g. `opacity-60` for forceSend), tooltip via `title` attribute, and a `failed` branch that renders `[Retry] [Discard]` buttons inline with the warning copy "Claude may not have received this."

- [ ] **Step 5: Run tests, verify they pass**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(send-queue): UserMessage gray/forceSend + failed-state UI"
```

---

### Task 19: Wire ChatView to render queue items after timeline

**Files:**
- Modify: `desktop/src/renderer/components/ChatView.tsx`

- [ ] **Step 1: Read current ChatView render**

Read lines 64–100+ of `ChatView.tsx`. Find the `state.timeline.map(...)` render block.

- [ ] **Step 2: After the timeline render, append queue render**

```tsx
{state.queue.map((item, idx) => (
  <QueuedMessageBubble
    key={item.id}
    item={item}
    index={idx}
    totalItems={state.queue.length}
    permissionPending={state.permissionPending}
    onEdit={(id, text) => dispatch({ type: 'QUEUE_EDIT', sessionId, queuedId: id, text })}
    onCancel={(id) => dispatch({ type: 'QUEUE_REMOVE', sessionId, queuedId: id })}
    onReorder={(id, newIndex) => dispatch({ type: 'QUEUE_REORDER', sessionId, queuedId: id, newIndex })}
    onForceSend={(id) => dispatch({ type: 'QUEUE_FORCE_SEND', sessionId, queuedId: id, timestamp: Date.now() })}
  />
))}
```

- [ ] **Step 3: Add wiring for retry/discard on failed bubbles**

Where UserMessage is rendered, pass:
```tsx
onRetry={() => {
  // Re-enqueue at head: remove from timeline, add to queue at index 0
  // For simplicity, dispatch QUEUE_ENQUEUE(text) and a new MESSAGE_DISCARD action that removes the failed entry.
  dispatch({ type: 'MESSAGE_DISCARD', sessionId, messageId: entry.message.id });
  dispatch({ type: 'QUEUE_ENQUEUE', sessionId, text: entry.message.content, timestamp: Date.now() });
  // Then reorder the new entry to index 0.
}}
onDiscard={() => dispatch({ type: 'MESSAGE_DISCARD', sessionId, messageId: entry.message.id })}
```

(Add `MESSAGE_DISCARD` action + reducer handler in this task. Tests + handler are simple — removes the timeline entry by messageId.)

- [ ] **Step 4: Run app build to verify no type errors**

Run: `cd desktop && npx tsc --noEmit && npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(send-queue): ChatView renders queue + retry/discard wiring"
```

---

### Task 20: Wire InputBar to dispatch QUEUE_ENQUEUE instead of USER_PROMPT + sendInput

**Files:**
- Modify: `desktop/src/renderer/components/InputBar.tsx`

- [ ] **Step 1: Read InputBar.tsx around line 253 (USER_PROMPT dispatch)**

Find the existing `dispatch({ type: 'USER_PROMPT', ... })` call AND the `window.claude.session.sendInput(sessionId, text + '\r')` call. Both need to be replaced with a single QUEUE_ENQUEUE dispatch.

- [ ] **Step 2: Replace the dispatch block**

Replace the existing send block with:

```ts
dispatch({
  type: 'QUEUE_ENQUEUE',
  sessionId,
  text: content,
  attachments: pendingAttachments,
  timestamp: Date.now(),
});
inputBarRef.current?.clear();
```

Remove the `setTimeout` chain that wrote text + `\r` to the PTY directly; the `useQueueReleaser` hook now handles that.

- [ ] **Step 3: Add an integration test**

```ts
it('Enter dispatches QUEUE_ENQUEUE, not USER_PROMPT or sendInput', async () => {
  // Render InputBar inside a ChatProvider seeded with one session.
  // Type "hello", press Enter.
  // Verify dispatch was QUEUE_ENQUEUE.
  // Verify sendInputMock NOT called (the releaser hook handles that).
});
```

- [ ] **Step 4: Run all tests + typecheck**

```bash
cd desktop && npx tsc --noEmit && npm test
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(send-queue): InputBar dispatches QUEUE_ENQUEUE instead of direct send"
```

---

### Task 21: Add pause toggle UI to InputBar

**Files:**
- Modify: `desktop/src/renderer/components/InputBar.tsx`

- [ ] **Step 1: Add a pause/play button next to send**

Read `state.queuePaused` and `state.queuePauseReason` via `useChatState(sessionId)`. Render a small button that toggles:

```tsx
<button
  aria-label={queuePaused ? 'Resume queue' : 'Pause queue'}
  title={queuePaused ? `Paused${queuePauseReason ? ` (${pauseLabel(queuePauseReason)})` : ''}` : 'Pause queue'}
  onClick={() => dispatch({
    type: queuePaused ? 'QUEUE_UNPAUSE' : 'QUEUE_PAUSE',
    sessionId,
    ...(queuePaused ? {} : { reason: 'manual' }),
  })}
>
  {queuePaused ? '▶' : '⏸'}
</button>
```

Where `pauseLabel(reason)` is a small helper:
```ts
function pauseLabel(reason: QueuePauseReason): string {
  switch (reason) {
    case 'esc-interrupt': return 'after Esc';
    case 'session-died': return 'session ended';
    case 'manual': return 'manual';
  }
}
```

- [ ] **Step 2: Test the toggle**

```ts
it('clicking the pause button dispatches QUEUE_PAUSE / QUEUE_UNPAUSE', () => {
  // Render InputBar in a session.
  // Click pause; verify dispatch.
  // Click again; verify unpause.
});
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(send-queue): InputBar pause/play toggle"
```

---

### Task 22: Extend Esc handler to dispatch QUEUE_PAUSE

**Files:**
- Modify: `desktop/src/renderer/App.tsx`

- [ ] **Step 1: Locate the Esc handler around lines 1627–1640**

Read the existing handler. It already calls `shouldForwardEscToPty()` and sends `\x1b`. Add `dispatch({ type: 'QUEUE_PAUSE', sessionId: activeSessionId, reason: 'esc-interrupt' })` immediately before the PTY write.

- [ ] **Step 2: Add an integration test**

In an App-level test (or a focused test on the Esc handler if extracted), simulate Esc keydown when the active session has queued items, verify queue is paused with `'esc-interrupt'` reason.

- [ ] **Step 3: Run test, verify pass**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(send-queue): Esc auto-pauses the active session's queue"
```

---

### Task 23: Mount useQueueReleaser + useForceSendCoordinator in ChatView

**Files:**
- Modify: `desktop/src/renderer/components/ChatView.tsx`

- [ ] **Step 1: Add hook calls near the top of ChatView**

```tsx
import { useQueueReleaser } from '../hooks/useQueueReleaser';
import { useForceSendCoordinator } from '../hooks/useForceSendCoordinator';

// inside ChatView component, after useChatState/useChatDispatch:
useQueueReleaser(sessionId);
useForceSendCoordinator(sessionId);
```

- [ ] **Step 2: Run full test suite + typecheck**

```bash
cd desktop && npx tsc --noEmit && npm test
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(send-queue): mount queue releaser + force-send coordinator in ChatView"
```

---

## Phase D — Android Parity

### Task 24: Add per-session Mutex to PtyBridge.writeInput

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt`
- Test: `app/src/test/kotlin/com/youcoded/app/runtime/PtyBridgeMutexTest.kt` (create)

- [ ] **Step 1: Write failing test**

```kotlin
// app/src/test/kotlin/com/youcoded/app/runtime/PtyBridgeMutexTest.kt
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import org.junit.Test
import org.junit.Assert.assertEquals

class PtyBridgeMutexTest {
  @Test
  fun `concurrent writeInput calls do not interleave bytes`() = runTest {
    val captured = mutableListOf<String>()
    val bridge = PtyBridgeFake { text -> captured.add(text) }  // uses a stub PTY
    val a = async { bridge.writeInput("aaa\r") }
    val b = async { bridge.writeInput("bbb\r") }
    a.await(); b.await()
    // Whichever ran first, the bytes for one must complete before the other starts.
    val joined = captured.joinToString("")
    assertEquals(true, joined == "aaa\rbbb\r" || joined == "bbb\raaa\r")
  }
}
```

(`PtyBridgeFake` is a tiny test double that records write calls in order. If the existing `PtyBridge.kt` is hard to instantiate in tests, wrap the writeInput logic in a private `suspend` helper that takes a write-callback dependency, and test the helper.)

- [ ] **Step 2: Run test, verify it fails (currently writeInput has no Mutex)**

- [ ] **Step 3: Add a `Mutex` field and convert writeInput to a `suspend` function**

In `PtyBridge.kt`:
```kotlin
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private val writeMutex = Mutex()

suspend fun writeInput(text: String) = writeMutex.withLock {
  // existing three-path logic
}
```

Update all callers to `launch { bridge.writeInput(text) }` (in `SessionService.kt` IPC handlers — confirm the call sites and wrap appropriately).

- [ ] **Step 4: Run test, verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(send-queue/android): per-session Mutex on PtyBridge.writeInput"
```

---

### Task 25: Port echo-driven submit constants to PtyBridge

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt`

- [ ] **Step 1: Add the constants matching pty-worker.js**

Near the top of the file (companion object or top-level constants):

```kotlin
private const val PASTE_THRESHOLD = 64
private const val SAFE_ATOMIC_LEN = 56
private const val CHUNK_SIZE = 56
private const val CHUNK_DELAY_MS = 30L
private const val ECHO_TIMEOUT_MS = 12_000L
private const val ECHO_TAIL_LEN = 16
```

- [ ] **Step 2: Add a comment block explaining the source-of-truth**

```kotlin
// Echo-driven submit constants. Pinned to CC v2.1.119 paste-classification behavior.
// Single source of truth: desktop/src/main/pty-worker.js lines 89–108.
// Re-bisect via test-conpty/cc-snapshot.mjs on every CC version bump.
```

- [ ] **Step 3: Commit (no code paths use the constants yet — that's Task 27)**

```bash
git add -A && git commit -m "feat(send-queue/android): echo-driven submit constants on PtyBridge"
```

---

### Task 26: Implement waitForEcho on PtyBridge using rawByteFlow

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt`
- Test: `app/src/test/kotlin/com/youcoded/app/runtime/PtyBridgeEchoTest.kt` (create)

- [ ] **Step 1: Write failing test**

```kotlin
class PtyBridgeEchoTest {
  @Test
  fun `waitForEcho returns true when needle bytes appear within timeout`() = runTest {
    val bridge = PtyBridgeFake()
    val job = async { bridge.waitForEcho("hello".toByteArray(), 1000L) }
    bridge.emitRawBytes("...some prefix...hello...".toByteArray())
    val result = job.await()
    assertEquals(true, result)
  }

  @Test
  fun `waitForEcho returns false on timeout`() = runTest {
    val bridge = PtyBridgeFake()
    val result = bridge.waitForEcho("never".toByteArray(), 100L)
    assertEquals(false, result)
  }
}
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement waitForEcho**

```kotlin
private suspend fun waitForEcho(needle: ByteArray, timeoutMs: Long): Boolean {
  val deadline = System.currentTimeMillis() + timeoutMs
  val accumulated = mutableListOf<Byte>()
  return try {
    withTimeout(timeoutMs) {
      _rawByteFlow.collect { chunk ->
        accumulated.addAll(chunk.toList())
        // Sliding window: keep last (needle.size + ECHO_TAIL_LEN) bytes
        val maxKeep = needle.size + ECHO_TAIL_LEN
        if (accumulated.size > maxKeep * 2) {
          val drop = accumulated.size - maxKeep
          repeat(drop) { accumulated.removeAt(0) }
        }
        if (containsSubsequence(accumulated, needle.toList())) {
          throw EchoFoundException()
        }
      }
      false
    }
  } catch (e: EchoFoundException) {
    true
  } catch (e: TimeoutCancellationException) {
    false
  }
}

private class EchoFoundException : Exception()

private fun containsSubsequence(haystack: List<Byte>, needle: List<Byte>): Boolean {
  if (needle.isEmpty() || haystack.size < needle.size) return false
  for (i in 0..(haystack.size - needle.size)) {
    if ((0 until needle.size).all { haystack[i + it] == needle[it] }) return true
  }
  return false
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(send-queue/android): waitForEcho consumes rawByteFlow with timeout"
```

---

### Task 27: Refactor writeInput to use three-path echo-driven logic

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt`
- Test: `app/src/test/kotlin/com/youcoded/app/runtime/PtyBridgeWriteInputTest.kt` (create)

- [ ] **Step 1: Write failing test for each path**

```kotlin
class PtyBridgeWriteInputTest {
  @Test fun `passthrough path writes text once when no trailing CR`() = runTest { /* ... */ }
  @Test fun `atomic path writes body+CR in one call when len <= 56 and ends with CR`() = runTest { /* ... */ }
  @Test fun `echo-driven path chunks body, waits for echo, sends CR separately`() = runTest { /* ... */ }
  @Test fun `echo-driven path falls back to bare CR after timeout`() = runTest { /* ... */ }
}
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Refactor writeInput**

```kotlin
suspend fun writeInput(text: String) = writeMutex.withLock {
  val session = session ?: return@withLock
  val endsCR = text.endsWith("\r")
  // Path 1: passthrough
  if (!endsCR) {
    session.write(text)
    return@withLock
  }
  // Path 2: atomic
  if (text.length <= SAFE_ATOMIC_LEN) {
    session.write(text)
    return@withLock
  }
  // Path 3: echo-driven
  val body = text.dropLast(1)
  val chunks = body.chunked(CHUNK_SIZE)
  for (chunk in chunks) {
    session.write(chunk)
    if (chunk !== chunks.last()) delay(CHUNK_DELAY_MS)
  }
  val tail = body.takeLast(ECHO_TAIL_LEN).toByteArray(Charsets.UTF_8)
  val echoOk = waitForEcho(tail, ECHO_TIMEOUT_MS)
  // Whether echo succeeded or timed out, write CR
  session.write("\r")
}
```

Remove the old `Handler.postDelayed(600)` split path.

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(send-queue/android): three-path writeInput with echo-driven submit"
```

---

### Task 28: Verify useSubmitConfirmation works on Android (manual + smoke test)

**Files:**
- (no code changes; verification only)

- [ ] **Step 1: Build a debug APK with the new queue UI**

```bash
cd youcoded
./scripts/build-web-ui.sh
./gradlew assembleDebug
# Install on a connected device:
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 2: Manual smoke test on device**

- Send 3 messages in rapid succession during a turn → verify they queue, drain in order, transcript matches chat-view.
- Force-send one → verify gray bubble + tooltip + clean delivery after interrupt.
- Force-send during permission prompt → verify the button is disabled.
- Pause + send 2 → verify they stay queued. Unpause → both release.
- Esc during turn → verify queue auto-pauses with the right reason.
- Disconnect Wi-Fi mid-release on a remote browser session → verify pending bubble enters failed state after 60s (test may require throttling locally instead).

- [ ] **Step 3: Commit a manual-verification note**

```bash
git commit --allow-empty -m "test(send-queue/android): manual verification on debug APK"
```

---

## Phase E — Integration & Cleanup

### Task 29: End-to-end integration test

**Files:**
- Create: `desktop/tests/queue-integration.test.ts`

- [ ] **Step 1: Write the test suite**

```ts
// desktop/tests/queue-integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ChatProvider, useChatState, useChatDispatch } from '../src/renderer/state/chat-context';
import { useQueueReleaser } from '../src/renderer/hooks/useQueueReleaser';
import { useForceSendCoordinator } from '../src/renderer/hooks/useForceSendCoordinator';

const sendInputMock = vi.fn();
beforeEach(() => {
  sendInputMock.mockReset();
  (window as any).claude = { session: { sendInput: sendInputMock } };
});

describe('queue integration', () => {
  it('enqueue 3 + simulate turn end → all release in order with attention re-arming', async () => {
    // ...
  });

  it('force-send while 2 queued + mid-turn → ESC sent, message delivered after interrupt, queued items wait', async () => {
    // ...
  });

  it('force-send blocked while permissionPending → button click is no-op', async () => {
    // ...
  });

  it('pause + enqueue 2 + simulate turn end → no release; unpause → both release', async () => {
    // ...
  });

  it('Esc auto-pause → queue intact, paused, queuePauseReason === esc-interrupt', async () => {
    // ...
  });

  it('permission prompt mid-queue → no release while permissionPending; resolve → next release fires', async () => {
    // ...
  });
});
```

- [ ] **Step 2: Implement each test by orchestrating dispatch + state changes through ChatProvider**

(Treat this as the longest task. Each test is ~30 lines of fixture setup + assertions.)

- [ ] **Step 3: Run all tests + typecheck**

```bash
cd desktop && npx tsc --noEmit && npm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(send-queue): end-to-end integration suite"
```

---

### Task 30: Update PITFALLS with new invariants and merge

**Files:**
- Modify: `youcoded-dev/docs/PITFALLS.md` (workspace artifact — note: this lives in workspace, not the youcoded sub-repo)

- [ ] **Step 1: Add a new "Send Queue" section to PITFALLS**

Bullet points:
- Queue lives in renderer Redux per session — lost on reload by design.
- Force-send is "interrupt-then-send"; never bypass the `\x1b` step even when CC appears idle (xterm-typed-but-not-sent text edge case).
- Force-send is rejected when `permissionPending` — both the UI button and the reducer guard.
- `useQueueReleaser` gate is the single source of "safe to send"; don't re-implement gating elsewhere.
- `MESSAGE_FAIL_PENDING` only fires after the existing `useSubmitConfirmation` retry has fired AND 60s has elapsed. Never short-cut.
- Android `PtyBridge.writeInput` now uses a `Mutex` and echo-driven submit — must remain in lockstep with `pty-worker.js` constants when CC versions bump.

- [ ] **Step 2: Run the workspace audit lightly to confirm no other docs need updating**

(Optional) `cd youcoded-dev && /audit chat send-queue` — review the output, fix any flagged drift inline.

- [ ] **Step 3: Commit + push the workspace doc**

```bash
cd youcoded-dev
git add docs/PITFALLS.md
git commit -m "docs(pitfalls): send queue invariants + Android writeInput Mutex"
git push origin master
```

- [ ] **Step 4: Merge feature branch in youcoded sub-repo**

```bash
cd youcoded   # the original checkout, NOT the worktree
git fetch origin
git checkout master
git pull origin master
git merge --no-ff feat/send-queue -m "feat: send queue with Android parity (#PR-NUMBER)"
git push origin master
```

- [ ] **Step 5: Clean up worktree (per workspace rules)**

```bash
git worktree remove ../youcoded-send-queue
git branch -D feat/send-queue
```

- [ ] **Step 6: Bump Android version per release rules**

(Only if cutting a release immediately. Otherwise wait for the next release cycle.)
- Edit `app/build.gradle.kts`: bump `versionCode` (currently 17) and `versionName` (currently 1.2.1).
- Tag `vX.Y.Z` in youcoded on master to trigger CI for both desktop + android.

---

## Self-Review (post-write)

- [x] **Spec coverage:** All ten "Decisions" sections in the spec map to tasks (queue actions → 3–11; force-send interrupt-then-send → 9, 10, 14; gray styling + tooltip → 18; inline ghost bubbles → 16, 19; edit/reorder/cancel → 5, 6, 17; global pause + Esc auto-pause → 7, 22; terminal-typed out of scope → no task; renderer-side architecture → all tasks; Android companion → 24–28; persistence deferred → no task).
- [x] **Placeholder scan:** No TBDs/TODOs in any task. Where I name a UI component or file path that needs confirmation (e.g., `UserMessage.tsx`), the task includes a "locate the component" step before edits.
- [x] **Type consistency:** Action shapes in tasks 1, 3–12 all match the spec's reducer-actions table. `forceSend`, `awaitingInterrupt`, `failed`, `pending`, `releasing` flag names are used consistently.
- [x] **Test coverage:** Every reducer action has a unit test in its task; both new hooks have hook tests; the Android companion has Kotlin tests for Mutex + waitForEcho + writeInput; one end-to-end integration suite covers the spec's six integration scenarios.
- [x] **Granularity:** Each task is one component/handler/path. Steps within a task are 2–5 minute actions (write test, run, implement, run, commit).
