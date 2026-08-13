---
status: draft
created: 2026-08-12
type: spec
related:
  - docs/active/handoffs/2026-08-12-tool-streaming-visibility.md
  - ROADMAP.md → "Show progress while a tool call's arguments stream"
---

# Preparing tool cards — liveness while a tool call's arguments stream

## Problem

In a native turn, a tool card does not exist until the model has finished
generating the tool call's **arguments**. The generic `ThinkingIndicator` owns
that entire window. For a `Write`, the arguments *are* the file — every
character of it is model output — so on a slow local model this is minutes of a
pulsing bubble that is indistinguishable from a hang.

Destin's directive: **the generic indicator should be on screen as little as
possible; prefer visible tool liveness or streaming text.**

This spec covers the native runtime only. CC sessions are transcript-based and
expose nothing mid-generation; they are out of scope and unchanged.

## What ships

A normal `ToolCard` appears in the timeline the moment the model starts
composing a tool call, in its ordinary running state (spinner, tool name, its
usual slot in the current tool group).

- **Collapsed detail line:** `preparing… 1,240 chars` — the argument character
  count so far, replacing the detail line the card would normally show.
- **Expanded body:** `Still preparing tool call… 1,240 characters so far` in
  place of the usual argument display.
- When the arguments finish, the **same card** gains its real input and detail
  line and continues into approval or execution. There is no swap and no
  re-mount: the card's identity is stable across the transition.

The card's `toolUseId` is the provider's real tool-call id from the first
moment, which is what makes the in-place transition work (see Verified facts).

### Why a character count and not a parsed file path

An earlier option was to prefix-parse the streaming argument JSON and show
`Write · src/renderer/ChatView.tsx` as soon as `file_path` arrived (it is the
first key in the schema — `write.ts:19`). Rejected: it costs a streaming-JSON
parser and raises a "the partial path was truncated or wrong" failure class,
for information the completed card shows moments later anyway.

The character count was kept because it is the only thing on the card that
*changes*. For `Read`/`Write`/`Edit` the preparing state is not a brief
pre-phase — it is effectively the card's entire visible life (see Phases
below), so a static preparing card would sit unchanged for the whole wait and
read as stuck. A climbing count is unambiguous proof the stream is alive.

### Phases, and what the model is doing in each

| Phase | Who is working | Duration |
|---|---|---|
| **Preparing** | The model, generating argument tokens. Nothing has touched the disk. | Seconds to minutes; proportional to argument size |
| **Running** | The harness, executing the tool. The model is idle, waiting on the result. | `Read`/`Write`/`Edit` are synchronous `fs` calls (`write.ts:65`, `read.ts:146`, `edit.ts:134`) — milliseconds. `Bash`/`WebFetch`/`WebSearch`/`Agent` can be long |

## Verified facts this design rests on

Re-verified 2026-08-12 against the installed tree
(`@ai-sdk/openai-compatible` 3.0.14, `ai` 7.0.36, `@ai-sdk/provider-utils`
5.0.12). Re-check on any version bump — the handoff's warning about trusting
types over dist still applies.

1. **The id is the same across `tool-input-start` and the completed
   `tool-call`.** `StreamingToolCallTracker`
   (`provider-utils/dist/index.js:3567`) enqueues `tool-input-start` with
   `id: toolCallDelta.id` (:3633) and the completed `tool-call` with
   `toolCallId: toolCall.id` (:3683) — the same value, not a fresh mint.
   Reached from `openai-compatible/dist/index.js:876`. (Not anchored — the
   path is under `node_modules/`, which a fresh checkout does not have.)
2. **`tool-input-start` fires as soon as the delta carrying the function NAME
   arrives**, and requires both an `id` and a `function.name` (:3619–3630) — so
   a preparing card always knows which tool it is.
3. **The parts already reach the harness's consume loop and are dropped.** The
   part switch is `harness-session.ts:1766`; `tool-call` is the only tool case
   (:1789). `armWatchdog()` runs per yielded chunk of any type (:1764), so the
   stall watchdog is already fed by these parts — surfacing them adds no
   liveness machinery.
4. **`assistant-thinking` with no `text` and no `partId` is already
   non-persisted.** `session-store.ts:93` returns early, and deliberately does
   *not* flush the open streaming part. A payload smuggled through that shape
   needs no new persistence exclusion.
   <!-- verify: {"path": "youcoded/desktop/src/main/harness/session-store.ts", "contains": "event\\.type === 'assistant-thinking' && !event\\.data\\?\\.text && !event\\.data\\?\\.partId"} -->
5. **`TRANSCRIPT_TOOL_USE` is already idempotent by `toolUseId`.**
   `chat-reducer.ts:932` overwrites the `toolCalls` entry, and the group
   placement at :964–991 skips re-appending an id that is already in a group.
   This exists for CC's re-emit contract; it means the real event supersedes a
   preparing entry in place, keeping its group slot and position, with **no
   reclaim scan** like the `perm-` synthetic path needs (:834–866).
6. **A running tool suppresses the generic indicator.** `ChatView.tsx:901` —
   `thinkingArea = state.isThinking && !hasAwaitingApproval && !hasRunningTools`.
   A preparing card that is `status: 'running'` therefore removes the pulsing
   bubble for free.
7. **`ToolCard` spins on `status === 'running'`** (`ToolCard.tsx:805`).

## Design

### Wire — one new display-only payload

`TranscriptEvent.data` gains:

```ts
/**
 * Native runtime only. The model is GENERATING a tool call's arguments —
 * nothing has executed yet. Rides `assistant-thinking` with no text and no
 * partId so `SessionStore.append` drops it (session-store.ts:93): partial
 * arguments must never reach the JSONL, or replay would render them.
 * `toolCallId` is the provider's real id, identical to the one the completed
 * `tool-call` part carries — that is what lets the card transition in place.
 */
toolPreparing?: { toolCallId: string; toolName: string; chars: number };
```

The emit surface stays **frozen** as `.claude/rules/native-runtime.md` requires
— no new `TranscriptEventType`. This is the same smuggling `promptProcessing`
already does (`shared/types.ts:223`).

### Harness — `harness-session.ts` consume loop

Two new cases in the part switch (~:1766):

- **`tool-input-start`** — record `{ id, toolName, chars: 0 }` in a per-step
  `Map`, emit immediately (unthrottled: this is the event that makes the card
  appear, and any delay is visible spinner time).
- **`tool-input-delta`** — add `delta.length` to that id's running count; emit
  at most every `TOOL_PREPARING_EMIT_MS` (300) per tool call, following
  `promptProcessing`'s `lastPrefillEmitAt` throttle pattern. Per-chunk emit
  would spam desktop IPC, the remote WS, and the Android bridge.

`tool-input-end` needs no case: the completed `tool-call` part follows
immediately and the real `tool-use` event supersedes the card.

The `Map` is per-step and cleared when the step ends. Parallel tool calls each
get their own entry and their own card — the local branch pins
`parallel_tool_calls: false`, but cloud models can emit several.

No change to `native-session-host.ts`: it forwards and appends every event
(:831–844), and the store's existing filter drops these.

### Renderer — reducer

**`ToolCallState` gains `preparing?: boolean` and `preparingChars?: number`** —
a flag on a `running` entry, **not** a fifth `ToolCallStatus`.

The union is four values (`shared/types.ts:275`) and consumers branch on it in
several places (`endTurn`, `hasRunningTools`, `ToolCard`'s spinner,
`AssistantTurnBubble`'s awaiting-approval hiding). A fifth value means auditing
every branch and risks the dead-state problem `.claude/rules/chat-reducer.md`
already calls out for `AttentionState`. As a flag on `running`, every existing
consumer does the right thing untouched. Exactly two places opt in: `ToolCard`'s
body, and reaping.

**New action `NATIVE_TOOL_PREPARING`**, dispatched from `App.tsx`'s
`assistant-thinking` handler when `event.data?.toolPreparing` is present. It is
dispatched **in addition to** the existing heartbeat action, not instead of it —
the heartbeat's `promptProcessing: null` (`chat-reducer.ts:576`) is the correct
outcome here anyway, since prefill is over once arguments are streaming, and
suppressing it would strand the previous phase's progress line on screen.

- If `toolCalls` has no entry for `toolCallId`, create
  `{ toolUseId, toolName, input: {}, status: 'running', preparing: true,
  preparingChars: chars }` and place it in the current group using the **same**
  `getOrCreateTurn` / group logic as `TRANSCRIPT_TOOL_USE` (:939–991). Factor
  that placement into a shared helper rather than duplicating it — a second
  copy is how the two paths drift.
- If an entry exists, update `preparingChars` only. Never touch status, group,
  or position.
- Sets `lastActivityAt` and `attentionState: 'ok'` like every other transcript
  path.

`input: {}` because `ToolCallState.input` is non-optional
(`shared/types.ts:324`), and `preparingChars?: number` carries the count.

**No change to `TRANSCRIPT_TOOL_USE`.** Fact 5 means the real event already
supersedes the preparing entry correctly — it overwrites with the real input
and `status: 'running'`, and the `preparing` flag is dropped because the entry
is rebuilt rather than spread. Pin this with a test rather than restating it in
code; it is load-bearing and invisible.

### Renderer — reaping

`endTurn()` (`chat-reducer.ts:171`) currently marks orphaned `running` and
`awaiting-approval` tools **failed** (:178). A preparing entry must instead be
**deleted**, because no tool was ever invoked — a card reading "Write · failed"
would describe an event that did not happen (Destin's call, 2026-08-12).

For each id in `activeTurnToolIds` whose entry has `preparing === true`:

1. delete it from `toolCalls`,
2. remove the id from its group's `toolIds`,
3. if that leaves the group empty, delete the group **and** remove its
   `tool-group` segment from the turn — an empty group otherwise renders,
4. drop it from `activeTurnToolIds` (the existing wholesale reset covers this).

This covers every death path at once, since `turn-complete`, `user-interrupt`,
`session-error`, and process exit all route through `endTurn`
(`.claude/rules/chat-reducer.md` — "Always use the `endTurn()` helper").

Replay never sees a preparing card: the event is not persisted, so
`TRANSCRIPT_REPLAY_COMPLETE`'s orphan reaper is not involved.

### Renderer — `ToolCard`

- Collapsed detail line, when `tool.preparing`: `preparing… N chars`
  (`N.toLocaleString()`), replacing the normal per-tool detail line.
- Expanded body, when `tool.preparing`: `Still preparing tool call… N
  characters so far`, replacing the argument display.
- Everything else — spinner, header, chevron, layout — is the ordinary running
  card. No new visual state.

## Scope and degradation

- **A provider that never emits `tool-input-start` gets today's behavior** — no
  preparing card, no breakage. This is the graceful path for any adapter that
  delivers a complete `tool-call` in one part.
- **CC sessions are untouched.** No branch, no special copy.
- **Android** inherits the reducer and `ToolCard` changes through the shared
  React bundle and never fires the events (no native runtime there — M8). No
  Kotlin change.
- **No new IPC channel**, so nothing for `ipc-channels.test.ts` to gain.

## Open verification (not a blocker)

Whether llama.cpp's `--jinja` grammar-constrained path emits a first tool-call
delta carrying the function name. If it does not, local models fall into the
graceful path above and simply get no preparing card. Check with one local
model before claiming per-provider behavior in docs.

## Tests

**Reducer** (`chat-reducer.test.ts`):
- `NATIVE_TOOL_PREPARING` creates a `running` + `preparing` entry, placed in the
  current group inside the current turn.
- A second `NATIVE_TOOL_PREPARING` for the same id updates the count only — no
  duplicate group entry, no position change.
- A real `TRANSCRIPT_TOOL_USE` with the same id supersedes it in place: real
  input present, `preparing` gone, group `toolIds` unchanged (fact 5 — this is
  the test that catches a regression in the idempotent placement).
- `endTurn` **deletes** preparing entries rather than failing them, and prunes a
  group and its turn segment when the last preparing tool leaves it.
- A turn ending with both a preparing tool and a real running tool fails the
  real one and deletes the preparing one.

**Session store** (`session-store` tests): an `assistant-thinking` carrying only
`toolPreparing` is not persisted and does **not** flush the open streaming part.
Worth pinning explicitly — adding a field to that event type is exactly how the
`session-store.ts:93` filter would silently regress.

**Harness** (`harness-session-loop` tests): `tool-input-start` emits one event
carrying the SDK's id and tool name; `tool-input-delta` accumulates and is
throttled to at most one emit per 300ms per tool call; `tool-input-end` emits
nothing.

## Deliberately out of scope

- Parsing partial argument JSON for a file path or any other field.
- Any CC-session equivalent.
- Streaming the argument *content* into the card (a live preview of the file
  being written). Much larger, and the character count already answers "is it
  alive".
