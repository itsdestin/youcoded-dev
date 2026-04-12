---
paths:
  - "destincode/desktop/src/renderer/state/chat-reducer.ts"
  - "destincode/desktop/src/renderer/state/chat-types.ts"
  - "destincode/desktop/src/renderer/components/ChatView.tsx"
last_verified: 2026-04-11
---

# Chat Reducer Rules

You are editing chat state or the ChatView component. Read `docs/chat-reducer.md` for full context.

## Hard invariants

1. **`toolCalls` Map is NEVER cleared.** ToolCards need old results for display. Don't "optimize" this away.

2. **Use `activeTurnToolIds` for current-turn status checks** (StatusDot color, ThinkingIndicator, thinking timeout). NOT the full toolCalls Map — that would reflect stale state from prior turns.

3. **Always use `endTurn()` helper** when adding turn-ending code paths. It marks orphaned `running`/`awaiting-approval` tools as failed, clears the Set, and resets isThinking/streamingText/currentTurnId/thinkingTimedOut atomically. Don't manually clear these.

4. **Dedup is content-based, NOT flag-based.** Both USER_PROMPT and TRANSCRIPT_USER_MESSAGE compare message content against the last 10 timeline entries. Don't try to add an `optimistic` flag without a full redesign — content matching is the current working solution, with the known limitation that rapid-fire identical messages can be suppressed.

5. **Thinking timeout fires only on true silence** — `isThinking && !hasRunningTools && !hasAwaitingApproval`. The flag `thinkingTimedOut` is ephemeral and auto-clears on `TRANSCRIPT_TURN_COMPLETE` via `endTurn()`. Don't inject permanent timeout text.

## Adding a new turn-ending action

Call `endTurn(session)` inside the handler. It returns the updated toolCalls Map plus reset fields. Do NOT duplicate the clearing logic inline.
