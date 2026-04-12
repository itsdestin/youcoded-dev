# Chat Reducer Architecture

Chat state lives in `destincode/desktop/src/renderer/state/chat-reducer.ts` with types in `chat-types.ts`. A few non-obvious invariants govern how tool activity and turns are scoped.

## Tool activity scoping

`toolCalls` is a **session-lifetime Map** — never cleared. ToolCards need old results for display, so entries persist. Individual entries are updated in-place (status flipped to `failed`), but the Map never resets.

To prevent stale `running` / `awaiting-approval` entries from old turns affecting status indicators, `activeTurnToolIds` (a Set) tracks which tools belong to the current turn. All status checks — StatusDot color, ThinkingIndicator visibility, thinking timeout — scan this Set only, not the full Map.

## endTurn() helper

`endTurn()` in chat-reducer.ts:52-69 is the shared path for ending a turn. It:

- Iterates `activeTurnToolIds` and marks any `running` or `awaiting-approval` tool as `failed` with error `'Turn ended'`
- Returns a fresh empty `activeTurnToolIds: new Set()`
- Clears `isThinking`, `streamingText`, `currentGroupId`, `currentTurnId`, `thinkingTimedOut`

**Always use this helper when adding a new turn-ending code path.** Don't manually clear these fields.

## Thinking timeout

A 30-second watchdog fires only when `state.isThinking && !hasAwaitingApproval && !hasRunningTools` — true silence, not just absence of visible output. Computed via `useMemo` over the toolCalls Map inside `ChatView.tsx`.

Sets an ephemeral `thinkingTimedOut: true` flag rather than injecting permanent text. The flag auto-clears on `TRANSCRIPT_TURN_COMPLETE` via `endTurn()`.

## Deduplication

Both `USER_PROMPT` (chat-reducer.ts:101-141) and `TRANSCRIPT_USER_MESSAGE` (chat-reducer.ts:209-248) dedup via **content matching** against the last 10 timeline entries. There is **no `optimistic` flag** — dedup compares strings and entry kinds directly.

### Known limitation
Identical messages sent legitimately in quick succession can be suppressed. If this becomes a real problem, the fix requires source tagging (e.g., a flag distinguishing optimistic-from-local vs confirmed-from-transcript entries), not content comparison.
