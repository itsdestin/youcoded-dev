# Background Tasks Tracking (StatusBar chip + AttentionState)

**Date:** 2026-04-26
**Status:** Design — pending implementation plan
**Scope:** YouCoded app (Desktop + Android). No changes to `youcoded-core`, `wecoded-themes`, `wecoded-marketplace`, or `youcoded-admin`.
**Investigation:** [`docs/superpowers/investigations/2026-04-26-background-task-tracking.md`](../investigations/2026-04-26-background-task-tracking.md)

## Summary

Claude Code can run tasks that outlive the assistant turn that started them — `Bash` invoked with `run_in_background: true` and the `Monitor` tool that streams stdout from a long-running process. CC tracks these internally and surfaces counts in its native PTY UI; YouCoded today ignores them entirely. Backgrounded tool cards sit forever showing the initial "Command running in background with ID: …" message even after the process exits, and a turn that ends with a `tail -F` monitor still listening shows as "complete" with no live indicator.

This design adds three coordinated pieces:

1. A new StatusBar chip showing live counts of background tasks for the active session, with a popup listing each task.
2. The originating Bash/Monitor tool card auto-completes at launch with a simplified label ("Launched a background task") instead of trying to track ongoing state inline.
3. A new `AttentionState` value `'background-active'` that keeps the session status dot green and the chat-area "active" indicator visible until all background tasks for that session have resolved.

The data model is fed entirely from the JSONL transcript — no PTY scraping, no new CC API. Two new transcript event types are added.

## Goals & non-goals

**Goals:**
- Make it visually obvious when a session has background work outstanding, both at the session level (status dot, chat indicator) and across the workspace (StatusBar chip).
- Stop the originating tool card from being a confusing dead-end ("running in background with ID: b6lazmyhu" with no follow-up).
- Survive YouCoded restarts via transcript replay — no separate persistence file.
- Keep the data layer cross-platform — both Desktop and Android share the same chat-reducer and ingest the same transcript events (per the shared-React-UI invariant).

**Non-goals:**
- Per-turn UI for "this turn's background tasks." The chip is the source of truth; the originating tool card is the entry point. No turn-anchored badges, footers, or expansions.
- Lingering of completed/failed tasks in the popup. Tasks disappear immediately on completion. The user accepts the trade-off — failure visibility is sacrificed for popup simplicity. (Failures are still parseable from the transcript if the user wants to dig.)
- Cross-session aggregation in the chip. Per-active-session only, matching the existing context %, git-branch, and session-cost widget pattern.
- Click-to-jump from chip rows to the originating tool card. Rows are inert (read-only).
- KillShell / BashOutput integration. Both are essentially unused in real CC sessions (0 hits across 1,639 mined transcripts) — out of scope for v1.
- Toast notifications, sound, badge counts on the app icon, or any other interrupt-style surfacing.

## Data sources

The transcript carries everything we need. From the investigation:

**Backgrounded Bash:** `tool_use` for `Bash` with `input.run_in_background: true` produces a `tool_result` whose `toolUseResult.backgroundTaskId` carries the shell ID (e.g. `"b6lazmyhu"` — ~8-char lowercase alphanumeric). When the process exits, CC writes a `queue-operation` line:

```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "content": "<task-notification>\n<task-id>b6lazmyhu</task-id>\n<tool-use-id>toolu_…</tool-use-id>\n<status>completed</status>\n<summary>Background command \"Start dev server in background\" completed (exit code 0)</summary>\n</task-notification>"
}
```

**Monitor:** `tool_use` for `Monitor` produces a `tool_result` whose `toolUseResult.taskId` carries the monitor ID. Each event arrives as `type: "attachment"`, `attachment.type: "queued_command"` with the same `<task-notification>` envelope and an `<event>…</event>` payload.

**Critical confirmed behavior:** `stop_reason: "end_turn"` is emitted on assistant messages even while a Monitor task is still listening — verified in real data (turn ends at 20:02:51Z, fresh Monitor event arrives at 20:03:02Z). `stop_reason: "pause_turn"` does not appear in the wild (0 hits across 950+ stop_reasons sampled). The "pause" semantics we want must be a YouCoded-side derivation, not a CC signal.

## Architecture

```
JSONL line
  ↓
transcript-watcher.ts (parseTranscriptLine)
  ↓
   ├─ background-task-started   ─┐
   ├─ background-task-completed ─┤
   └─ background-task-event     ─┤   (Monitor stdout event, increments counter)
                                 ↓
                         chat-reducer
                                 ↓
            session.backgroundTasks: Map<taskId, BackgroundTask>
                                 ↓
       ┌─────────────────────────┼─────────────────────────┐
       ↓                         ↓                         ↓
   ChatView                  AttentionState         remote:background-
   (in-chat indicator        ('background-active'   tasks-changed IPC
   widens render gate)       per session)                  ↓
                                 ↓                main: lastBackgroundTasksBySession
                            session dot color             ↓
                            stays green             buildStatusData()
                                                          ↓
                                                    status:data push
                                                          ↓
                                                  StatusBar chip
                                                  + popup
```

## Transcript event additions

`desktop/src/main/transcript-watcher.ts` (canonical) gains two new event types in the parsed event union:

```typescript
type BackgroundTaskKind = 'bash' | 'monitor';

interface BackgroundTaskStarted {
  type: 'background-task-started';
  sessionId: string;
  timestamp: string;
  taskId: string;          // e.g. "b6lazmyhu"
  toolUseId: string;       // e.g. "toolu_01RbsLSw14s9GUkjtcsjB1bx"
  kind: BackgroundTaskKind;
  description: string;     // input.description for Bash, input.description for Monitor
  command: string;         // input.command (full bash command or monitor pipeline)
  timeoutMs?: number;      // monitor-only: input.timeout_ms
  persistent?: boolean;    // monitor-only: input.persistent
}

interface BackgroundTaskCompleted {
  type: 'background-task-completed';
  sessionId: string;
  timestamp: string;
  taskId: string;
  exitCode?: number;       // parsed from the <summary> "(exit code N)" suffix when present
  status: string;          // raw <status> value, typically "completed"
  summary: string;         // raw <summary> text
}

interface BackgroundTaskEvent {
  type: 'background-task-event';
  sessionId: string;
  timestamp: string;
  taskId: string;          // matches a Monitor task
  // Event payload is intentionally NOT carried — the reducer only counts events,
  // does not display them. If we later want to surface event text in the popup,
  // add an `event: string` field here.
}
```

**Detection rules:**
- `background-task-started` fires when the parser sees a `tool_result` whose `toolUseResult.backgroundTaskId` (Bash) or `toolUseResult.taskId` (Monitor) is set. The matching `tool_use` is found by `tool_use_id` in the same parse pass (the parser already pairs these for `tool-use` and `tool-result` events). `kind` is `'monitor'` if the `tool_use.name === 'Monitor'`, else `'bash'`.
- `background-task-completed` fires when the parser sees a `queue-operation` line containing `<task-notification>` XML with both a `<task-id>` and a `<status>` element. Parse `<task-id>` for the ID, `<status>` for the status string, `<summary>` for the human-readable text. Extract `exitCode` from the trailing `(exit code N)` pattern in the summary if present.
- `background-task-event` fires when the parser sees `type: "attachment"` with `attachment.type: "queued_command"` AND the `attachment.prompt` contains `<task-notification>` XML with a `<task-id>` AND an `<event>` element (distinguishing from completion notifications, which have `<status>` instead). Carries only the `taskId`.

The parser today filters non-message lines per the spec ("Only process user / assistant message lines"). Two filters must be relaxed:
1. `queue-operation` lines whose `content` contains `<task-notification>` XML — for `background-task-completed` (and any future status variants).
2. `attachment` lines whose `attachment.type === 'queued_command'` AND prompt contains `<task-notification>` with `<event>` — for `background-task-event`.

Other `queue-operation` and `attachment` shapes continue to be skipped.

**Tool result filtering:** when `tool_result.toolUseResult.backgroundTaskId` is set, the parser still emits the existing `tool-use` and `tool-result` events as today (the originating tool card needs them). The new `background-task-started` event is in addition, not a replacement.

## State model

`chat-reducer.ts` adds one Map and one AttentionState value.

### Per-session field

```typescript
interface BackgroundTask {
  taskId: string;
  toolUseId: string;
  kind: 'bash' | 'monitor';
  description: string;
  command: string;
  startedAt: number;        // ms epoch from event timestamp
  timeoutMs?: number;
  persistent?: boolean;
  // Monitor-only counters maintained by the reducer:
  monitorEventCount?: number;
}

// On SessionState:
backgroundTasks: Map<string, BackgroundTask>;  // keyed by taskId
```

The Map is **never wiped by `endTurn()`**. It's session-lifetime by design.

### Reducer action handlers

| Action | Handler |
|--------|---------|
| `TRANSCRIPT_BACKGROUND_TASK_STARTED` | Add entry to `backgroundTasks` keyed by `taskId`. If the post-add count was 0 → 1, emit no separate action — the AttentionState update is computed in `endTurn()` only, not on every change (see below). |
| `TRANSCRIPT_BACKGROUND_TASK_COMPLETED` | Delete entry by `taskId`. If post-delete count is 0 AND `attentionState === 'background-active'`, transition `attentionState` back to `'ok'`. |
| `TRANSCRIPT_BACKGROUND_TASK_EVENT` | If the event's `taskId` matches a tracked Monitor task, increment its `monitorEventCount`. No-op if no matching task (event for a stale or already-completed Monitor). |
| `SESSION_PROCESS_EXITED` | Clear `backgroundTasks` for the session entirely (handles the "CC died with its background processes" leak). |

### AttentionState extension

Current union: `'ok' | 'stuck' | 'session-died'`.

New union: `'ok' | 'stuck' | 'session-died' | 'background-active'`.

**`endTurn()` logic change:** today, `endTurn()` always resets `attentionState` to `'ok'`. New rule: if `backgroundTasks.size > 0` after the turn ends, set `attentionState` to `'background-active'` instead. The existing `SESSION_PROCESS_EXITED` override (forces `'session-died'`) takes precedence as it does today.

**`useAttentionClassifier` gate change:** today the classifier ticks while `isThinking && !hasRunningTools && !hasAwaitingApproval && visible`. Add `&& attentionState !== 'background-active'` — when we know the session is alive because of a background task, don't run the spinner-rotation classifier (it would inevitably classify as `'stuck'` after 30s of unchanged spinner glyphs, which would be wrong).

**Recovery to `'ok'`:** the transition `'background-active' → 'ok'` happens in the `TRANSCRIPT_BACKGROUND_TASK_COMPLETED` handler when the count reaches 0. No timer, no classifier reset needed.

## UI surfaces

### Originating Bash/Monitor tool card

Today, the originating Bash card shows the synchronous tool_result body in full ("Command running in background with ID: b6lazmyhu. Output is being written to: …"). This is misleading — it implies "look here for updates" when in fact no updates ever land in this card.

New behavior: when the parser emits `background-task-started` for a tool, the corresponding `ToolCallState` in the reducer is marked `status: 'completed'` immediately on the same parse pass, and the rendered ToolBody for that tool card swaps to a simplified one-line label:

> **Launched a background task** · `<description>`

The card has no spinner, no expansion arrow, no live state. The chip in the StatusBar is the place where ongoing state lives.

`ToolBody.tsx` adds a detection branch: if `toolCall.toolUseResult?.backgroundTaskId` (Bash) or `toolCall.toolUseResult?.taskId && toolCall.name === 'Monitor'` (Monitor), render the simplified label. Otherwise unchanged.

### In-chat indicator

`ChatView` renders `<ThinkingIndicator />` today only when `attentionState === 'ok' && isThinking`. Widen the gate to:

```typescript
(attentionState === 'ok' && isThinking) || attentionState === 'background-active'
```

The component receives a new `mode: 'thinking' | 'background'` prop:
- `'thinking'` (default): existing copy, e.g. "Claude is thinking…"
- `'background'`: new copy "Background tasks running"

Same animated spinner glyph in both cases.

### Session status dot

The dot color mapping is computed in `StatusDot.tsx` (or the equivalent helper that translates `AttentionState` → CSS color token). Add a case mapping `'background-active'` to the same `--accent-ok` (green) token used by `'ok'`. `'stuck'` and `'session-died'` keep their existing color tokens.

If audit-time the `AttentionState` → color mapping turns out to live in multiple places (e.g. `SessionStrip.tsx` for the per-session dot AND a separate computation for the StatusBar session pill), update both. The grep target is `attentionState ===` across the renderer.

### StatusBar chip

A new widget in the **Tasks** category, alongside `open-tasks`:

```typescript
{
  id: 'background-tasks',
  label: 'Background Tasks',
  defaultVisible: true,
  description: 'Live count of backgrounded Bash processes and Monitor watchers in the active session.',
  bestFor: 'Knowing when a dev server, build, or log tail is still running after the chat turn ended.',
}
```

`StatusData` gains a field:

```typescript
backgroundTasks: BackgroundTaskSummary[] | null;

interface BackgroundTaskSummary {
  taskId: string;
  kind: 'bash' | 'monitor';
  description: string;
  startedAt: number;
  timeoutMs?: number;          // monitor-only
  monitorEventCount?: number;  // monitor-only
}
```

For the **active session only**. Empty array (or `null`) → chip hidden.

**Chip rendering:** when `backgroundTasks.length > 0`, render a chip showing the count split by kind: e.g. `⚙ 1 · 👁 2` (or just `⚙ 1` / `👁 2` if only one kind is present). Click → popup.

**Popup container:** uses `<OverlayPanel layer={2}>` per the overlay layer system (`docs/shared-ui-architecture.md`) — same primitive used by `PreferencesPopup`, `ModelPickerPopup`, and the existing StatusBar `WidgetConfigPopup`. No scrim (anchored popover, like ModelPickerPopup). Theme tokens drive surface and shadow; do not hardcode `bg-canvas/60` or similar.

**Popup contents:** one row per task. Layout per row:

- Bash row: `⚙` icon + `<description>` + elapsed time (e.g. `⚙ Start dev server · 2m 14s`)
- Monitor row: `👁` icon + `<description>` + elapsed time + event count + timeout countdown (e.g. `👁 Dev server errors · 45s · 3 events · 1m 15s remaining`)

Elapsed time and timeout countdown update live (1s tick is fine — same cadence as the existing classifier loop). Rows are inert — no click action, no buttons.

When a task ends, the row disappears immediately on the next render. No fade, no checkmark, no exit-code display.

### Cross-platform data flow

Mirroring the existing `attentionMap` plumbing:

1. The renderer holds the live `backgroundTasks` Map per session in chat state.
2. A new `useRemoteBackgroundTasksSync` hook (parallel to `useRemoteAttentionSync`) diffs the active-session Map and fires `remote:background-tasks-changed` IPC on change, with payload `{ sessionId, tasks: BackgroundTaskSummary[] }`.
3. Main process caches in a new `lastBackgroundTasksBySession: Map<sessionId, BackgroundTaskSummary[]>`.
4. `buildStatusData()` in `ipc-handlers.ts` reads the active session's entry and includes it in the next `status:data` broadcast.
5. Remote browsers and the StatusBar widget consume from `statusData.backgroundTasks`.

`AttentionState === 'background-active'` flows through the existing `remote:attention-changed` IPC and `attentionMap` in `status:data` — no new transport for the attention value.

### Android parity

Android `SessionService.kt`:
1. Mirror the new transcript events in the Kotlin `TranscriptWatcher` fallback (per the PITFALLS rule about parser parity, even though the Node CLI path is the source of truth).
2. Extend `buildStatusData` to include `backgroundTasks` for the active session.
3. The shared React renderer (loaded into the Android WebView) handles the rest with no Android-specific code.

## Persistence

No separate state file. Restart behavior:

- On YouCoded restart (or session resume), the transcript-watcher replays from offset 0 for the loaded sessions. Replay re-emits `background-task-started` for every backgrounded launch in the transcript, and `background-task-completed` for every matching `queue-operation`. The end state of the Map reflects "started but not yet completed" → exactly the open set.
- On `SESSION_PROCESS_EXITED` (CC process died), clear the session's Map. This handles the leak case where CC was killed and its child processes died with it without ever emitting completion events.
- The accepted limitation: a CC session that runs for days with backgrounded processes that die silently (without CC noticing and emitting a completion event) will leave stale entries in the Map. No GC is implemented in v1. If this becomes a problem in practice, a time-based GC (drop entries older than 24h) is the fallback.

## Testing

**Parity fixtures** (per the PITFALLS rule for transcript-watcher changes):
- `youcoded/shared-fixtures/transcript-parity/background-task-bash-started.jsonl` + `.expected.json` — `tool_use` for backgrounded Bash + matching `tool_result` with `backgroundTaskId`. Asserts `background-task-started` event with correct fields.
- `youcoded/shared-fixtures/transcript-parity/background-task-bash-completed.jsonl` + `.expected.json` — `queue-operation` with `<status>completed</status><summary>… (exit code 0)</summary>`. Asserts `background-task-completed` event with `exitCode: 0`.
- `youcoded/shared-fixtures/transcript-parity/background-task-monitor-lifecycle.jsonl` + `.expected.json` — `tool_use` for Monitor + `tool_result` + sequence of attachment events + completion `queue-operation`. Asserts the full event stream.

**Reducer unit tests** (`youcoded/desktop/src/renderer/state/__tests__/`):
- `TRANSCRIPT_BACKGROUND_TASK_STARTED` adds to Map, doesn't touch `attentionState`.
- `TRANSCRIPT_BACKGROUND_TASK_COMPLETED` removes from Map, transitions `'background-active' → 'ok'` when count hits 0.
- `TRANSCRIPT_BACKGROUND_TASK_EVENT` increments `monitorEventCount` for matching task; no-op for unmatched taskId.
- `endTurn()` with `backgroundTasks.size > 0` sets `attentionState: 'background-active'` instead of `'ok'`.
- `endTurn()` with empty Map sets `attentionState: 'ok'` as before.
- `SESSION_PROCESS_EXITED` clears the Map and forces `attentionState: 'session-died'` (existing behavior preserved).
- `TRANSCRIPT_BACKGROUND_TASK_STARTED` for a backgrounded tool also flips that tool's `ToolCallState.status` to `'completed'` in the same step.

**Classifier integration test:** `useAttentionClassifier` does not tick when `attentionState === 'background-active'`.

**No PTY snapshot test needed** — this design avoids PTY scraping entirely.

## Open questions / followups

These are deliberate v1 omissions, not unresolved design questions:

1. **Failed/killed/timed-out task surfacing.** The `<status>` field in CC's `<task-notification>` is presumably enumerable beyond `completed`. The reducer treats anything that triggers a `queue-operation` with a `<task-id>` and a `<status>` element as "ended" and removes it from the Map regardless of the status value. If/when we want to differentiate failures (red dot on the chip, lingering rows), that's a follow-on design.
2. **Cross-session aggregation.** Per-active-session for v1. If the user routinely runs background work in multiple sessions and forgets which, an aggregate count + grouped popup is a small extension on top of the existing wire format.
3. **Click-to-jump from chip rows to originating tool card.** Trivial to add later — would just need the chat scroll API and the `toolUseId` (already on the row data structure).
4. **GC for stale entries.** Time-based fallback if the leak case becomes a real problem.
5. **KillShell / BashOutput integration.** Not used in real CC sessions, so deferred indefinitely. Would naturally fold into the existing tracking if added.
