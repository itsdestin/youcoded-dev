---
status: active
---

# Investigation: Timestamp-only assistant bubble in chat

**Reported:** 2026-08-17
**Status:** ✅ CONFIRMED (2026-08-17, code-verified); no code change made — fix planned, see [Fix plan](#fix-plan)

## Reported symptom

The user occasionally sees a small, bare rounded box in the chat view containing only a timestamp, such as `4:21 PM`. The user clarified that the box is an **assistant bubble**, not a user bubble. In the screenshot, a permission card with **Yes**, **Always Allow**, and **No** appears immediately below it.

The user's suspicion that the bare box relates to the permission card is **confirmed** — see below.

## Confirmed root cause: awaiting-approval tool filtered from its group, leaving a bare wrapper

**Confidence: confirmed by code reading (2026-08-17).** The exact chain:

1. **An assistant turn gets a tools-only visual bubble.** `splitIntoBubbles()` (`AssistantTurnBubble.tsx:194-271`) creates a visual bubble with no `text`/`plan`/`reasoning` when a turn's first segment is a `tool-group`, or when a tool-group opens a NEW bubble after interleaved reasoning (the BUG A fix at 248-256). The bubble carries only `toolGroupIds`.
2. **The tool enters `awaiting-approval`.** `PERMISSION_REQUEST` (hook relay → `chat-reducer.ts:1557-1589`, or synthetic at 1595-1634) flips the tool's status but **leaves it in its group** — the group segment stays on the turn.
3. **The group renders `null` inside the bubble.** `ToolGroupInline` (`AssistantTurnBubble.tsx:506-521`) returns `null` when every remaining tool is `awaiting-approval` (line 520-521: `restTools.length === 0 → null`). Skills are filtered the same way (509-515).
4. **The bubble wrapper is still rendered.** The render loop (`AssistantTurnBubble.tsx:374-411`) gates only on `bubble.toolGroupIds.length > 0` (`hasTools`), **never on whether any group actually rendered content** — it has no visibility into `ToolGroupInline` returning `null`.
5. **The timestamp renders on the empty wrapper.** The timestamp renders on the turn's *last* bubble (`AssistantTurnBubble.tsx:431-435`), and an awaiting-approval tool is the last thing in its turn — so the bare wrapper is the last bubble and receives the timestamp.
6. **The permission card renders right below it.** `ChatView.tsx:890-904` renders `awaitingTools` (derived at `ChatView.tsx:174-189` from `activeTurnToolIds`) as standalone assistant-style bubbles at the bottom of the timeline — the Yes / Always Allow / No card in the screenshot.

This exactly matches the reported symptom: a bare assistant-bubble shell with only a timestamp, immediately above the permission card. Both the bubble and the card are real; the bubble just lost its only child.

### Why this is a rendering bug, not a state bug

The reducer state is correct: the tool IS in the group, it IS `awaiting-approval`, the standalone card IS the same tool rendered by `ToolGroupInline` (which deliberately defers to the pop-out). The defect is purely in the view layer: **the wrapper renders without checking that its tool group actually produced content.** The invariant violated: *a rendered bubble must always have at least one visible child* — never a bare wrapper with just a timestamp.

## Other causes considered

### 1. Transient tool/group state mismatch during event ordering

**Confidence: possible, unconfirmed — same shape, different trigger.** The memo comparator (`AssistantTurnBubble.tsx:334-353`) and the view derivation are decoupled: `splitIntoBubbles()` is memoized on `turn` alone (359-363), while the actual tool content is looked up from the session-lifetime Maps. A group segment can therefore exist while its group/tool entries are missing (e.g. replay/hydration), which `ToolGroupInline` renders as `null` — same bare wrapper. **The view-level fix below covers this case too**, because it checks the rendered-content predicate rather than the raw segment list.

### 2. Skill-only tool group with no visible Skill card

**Confidence: possible, unconfirmed.** `collectTurnSkills` (`AssistantTurnBubble.tsx:278-294`) renders Skills as a trailing row, but the row is gated on `turnSkills.length > 0` (416-422); a group referencing a Skill ID whose `ToolCallState` is unavailable renders neither the inline group (Skills filtered at 509-515) nor the trailing row. Same bare-wrapper shape. **Covered by the same view-level fix.**

### 3. Missing or empty tool group

**Confidence: possible, unconfirmed (reducer cleanup makes it unlikely in the live path).** `ToolGroupInline` returns `null` for a missing/empty group (506-507); the turn can still carry the segment. `removePreparingTool` (`chat-reducer.ts:161-199`) prunes emptied groups, so this is unlikely live but possible on replay/hydration. Covered by the view fix.

### 4. Empty assistant text or reasoning segment

**Confidence: possible, unconfirmed — low likelihood.** The reducer appends `TRANSCRIPT_ASSISTANT_TEXT` / `TRANSCRIPT_ASSISTANT_REASONING` segments without a non-whitespace check (`chat-reducer.ts:981-1079`). Verified:
- The CC transcript path strips empty/system-tag content before emitting (`transcript-watcher.ts:156-165` — `if (!cleaned) break;`, `202-213`), so empty text does not come from CC transcripts.
- The native harness path guards each delta with `if (!t) break` (`harness-session.ts:2199`, `2213`), so an empty `""` delta never dispatches.

An empty segment could still in principle be dispatched (a future emitter or a replay path), which would produce a bare wrapper via the *text* branch — hence the reducer guard in the fix plan as defense-in-depth. It does not explain this screenshot (no evidence of an empty text event; the permission-card adjacency is fully explained by the primary cause).

### 5. Normal assistant turn with only a stop reason

**Confidence: ruled out.** `ChatView.tsx:791-794` skips turns with no segments; a stop reason alone creates no bubble.

### 6. User-message bubble

**Confidence: ruled out by user clarification** (the box was an assistant bubble).

## Fix plan

Two complementary changes (scope chosen by Destin: view fix + reducer guard).
**The canonical design doc is the spec: `docs/active/specs/2026-08-17-timestamp-only-assistant-bubble-design.md`** — this section is the summary.

### 1. View layer (primary, covers all unconfirmed triggers too) — `AssistantTurnBubble.tsx`

Never render a bubble wrapper that has no visible content. Replace the `hasTools` boolean (currently `bubble.toolGroupIds.length > 0`, line 375) with a predicate over the actual rendered content — extract the group/tool filtering logic from `ToolGroupInline` (lines 506-521) into an exported pure function (e.g. `bubbleHasRenderedTool(groups, toolGroups, toolCalls)` returning whether any group would produce non-null content: group exists, has tool IDs, has ≥1 non-Skill tool that is not `awaiting-approval`), so the render loop and the test can share it:

- `hasTools` = the predicate over `bubble.toolGroupIds`.
- `const hasContent = !!(bubble.text || bubble.plan); const hasReasoning = !!bubble.reasoning;`
- **`if (!hasContent && !hasReasoning && !hasTools) return null;`** — skip the empty wrapper entirely. A tools-only bubble with a *running* tool still renders (the spinner card is real content).

`ToolGroupInline` can then keep its own `null` early-returns as a safety net, or consume the shared predicate — same behavior either way.

### 2. Reducer guard (defense-in-depth) — `chat-reducer.ts`

Skip appending empty (whitespace-only) text/reasoning segments in `TRANSCRIPT_ASSISTANT_TEXT` (981-1038) and `TRANSCRIPT_ASSISTANT_REASONING` (1044-1080) — matching the `if (!t) break` guard already in the native harness. Do **not** touch the partId-merge branch (a `""` delta appended to an existing non-empty segment is a no-op content-wise, but guard for consistency). This closes the "future emitter sends empty text" class permanently.

### 3. Tests — `AssistantTurnBubble.test.tsx` (+ reducer test if the guard changes behavior)

- **Pin the bug:** a turn with a single tool-group segment whose tool is `awaiting-approval` renders **no `.assistant-bubble`** (no bare timestamp).
- Text + awaiting-approval group → text still renders (group filtered, wrapper kept — it has content).
- Tools-only bubble with a `running` tool → still renders (spinner).
- Tools-only bubble with only Skills and no resolvable Skill state → no bare wrapper.
- Reducer: a `TRANSCRIPT_ASSISTANT_TEXT` with whitespace-only content appends no segment.

### 4. Buddy mirror — no separate change

`buddy/BubbleFeed.tsx:396` renders the same `<AssistantTurnBubble>`, so the view fix covers both surfaces.

### Verification

`cd youcoded/desktop && bash scripts/verify.sh <worktree>` (tsc, vitest, knip, eslint, ast-grep), then a visual check in a dev instance (`bash scripts/run-dev.sh`) with a fixture that drives a tool to `awaiting-approval` (the workbench `fixture-loader.ts:168-197` already synthesizes the exact `PERMISSION_REQUEST` action).

## Evidence trail

- `AssistantTurnBubble.tsx:194-271` — `splitIntoBubbles()` creates tools-only bubbles.
- `AssistantTurnBubble.tsx:374-411` — wrapper renders unconditionally per bubble; `hasTools` = raw segment count.
- `AssistantTurnBubble.tsx:506-521` — `ToolGroupInline` returns `null` for awaiting-approval-only groups.
- `AssistantTurnBubble.tsx:431-435` — timestamp on last bubble.
- `ChatView.tsx:174-189` — `awaitingTools` from `activeTurnToolIds`.
- `ChatView.tsx:890-904` — standalone approval-card bubbles at the bottom.
- `chat-reducer.ts:1557-1634` — `PERMISSION_REQUEST` flips status in place, tool stays in group.
- `chat-reducer.ts:981-1079` — text/reasoning segments appended without non-whitespace check.
- `transcript-watcher.ts:156-165, 202-213` — CC path strips empty content.
- `harness-session.ts:2197-2219` — native path guards empty deltas.
- `buddy/BubbleFeed.tsx:391-396` — buddy mirror renders the same component.

No production/live-app inspection was performed; no source files were modified during the investigation.
