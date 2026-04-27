# Background Task Tracking — Investigation

**Date:** 2026-04-26
**Status:** Investigation complete; design pending; no production code changed
**Scope:** Cross-platform (Desktop + Android share the same React UI and the same transcript parser is the proposed source of truth)

## Problem statement

Claude Code can run tasks that outlive the assistant turn that started them: `Bash` invoked with `run_in_background: true`, and the `Monitor` tool that streams stdout from a long-running process. CC surfaces counts of these in its native terminal UI ("# monitors / # shells"-style indicator painted into the PTY).

YouCoded today has no visibility into either the counts or the lifecycle. We want to:

1. Add a StatusBar widget showing live monitor / background-shell counts.
2. Reflect "turn ended but background tasks still running" in the chat view, instead of marking the turn cleanly complete.

Before designing either, we needed to ground the work in real data — what does CC actually emit when a background task starts, runs, and finishes, and how does the transcript represent a turn that ends while a task is still alive?

## Background — three plausible data sources

Three sources of truth were considered:

| Source | Mechanism | What we'd parse |
|--------|-----------|-----------------|
| Statusline hook JSON | CC pipes JSON to `youcoded-core/hooks/statusline.sh` via stdin | A `monitors` / `shells` field on the payload, if it exists |
| PTY buffer scrape | xterm buffer already read by `useAttentionClassifier` for spinner detection | Regex against CC's bottom-row UI for "Bash (N)" / "Monitors (N)" |
| Transcript JSONL | `desktop/src/main/transcript-watcher.ts` already parses every line | Whatever shape CC writes for tool_use / tool_result / queue-operation |

Round 1 (skill-less codebase reading) ruled out the statusline hook — `statusline.sh:16-28` extracts only `session_name`, `session_id`, `model`, `context_window`. No background-task fields. That left PTY scrape vs. transcript. Round 2 (transcript mining) showed the transcript carries everything we need.

## What's in the transcript

Mined `C:/Users/desti/.claude/projects/` (1,639 session files). 159 sessions contain `"run_in_background": true`; 36 contain `Monitor` tool uses; **0 contain `BashOutput` or `KillShell`** — these tools exist but in practice CC almost never invokes them. Backgrounded bashes run to completion and the result drops in via `queue-operation`, not via a polled `BashOutput`.

### Backgrounded Bash lifecycle

From `C--Users-desti/03960b44-a19c-4828-86c0-7fd9a669ce95.jsonl`:

**1. tool_use** (line 98, 12:17:44.781Z) — assistant fires the bash:

```json
{
  "type": "message", "role": "assistant",
  "content": [{
    "type": "tool_use",
    "id": "toolu_01RbsLSw14s9GUkjtcsjB1bx",
    "name": "Bash",
    "input": {
      "command": "npm run dev 2>&1 &",
      "description": "Start dev server in background",
      "timeout": 120000,
      "run_in_background": true
    }
  }],
  "stop_reason": "tool_use"
}
```

**2. Synchronous tool_result** (line 99, 12:17:45.136Z) — CC immediately returns a shell ID:

```json
{
  "type": "user", "message": { "role": "user", "content": [{
    "tool_use_id": "toolu_01RbsLSw14s9GUkjtcsjB1bx",
    "type": "tool_result",
    "content": "Command running in background with ID: b6lazmyhu. Output is being written to: …\\tasks\\b6lazmyhu.output",
    "is_error": false
  }]},
  "toolUseResult": {
    "stdout": "", "stderr": "", "interrupted": false,
    "backgroundTaskId": "b6lazmyhu"
  }
}
```

The `backgroundTaskId` field on `toolUseResult` is the durable key. The `tool_use_id` (`toolu_…`) ties it back to the originating tool call.

**3. Completion via queue-operation** (line 101, 12:17:49.500Z) — when the bash exits, CC writes a system-level entry:

```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "content": "<task-notification>\n<task-id>b6lazmyhu</task-id>\n<tool-use-id>toolu_01RbsLSw14s9GUkjtcsjB1bx</tool-use-id>\n<output-file>…\\b6lazmyhu.output</output-file>\n<status>completed</status>\n<summary>Background command \"Start dev server in background\" completed (exit code 0)</summary>\n</task-notification>"
}
```

This is **not** a `tool_result`. It's a separate transcript line type (`queue-operation`) carrying XML-wrapped notification text. The transcript-watcher's current filter ("only process user / assistant message lines") drops these on the floor today.

### Monitor lifecycle

Monitor follows the same pattern but with persistent event delivery. From the same session family, around 20:02:38Z:

- `tool_use` for `Monitor` with input `{ description, command, timeout_ms, persistent }` → returns `{ taskId: "b8hrhggum", timeoutMs, persistent }` synchronously.
- Each event arrives as `type: "attachment"`, `attachment.type: "queued_command"`, with the same `<task-notification>` XML envelope and an `<event>…</event>` payload.
- After consumption, queue-operations record dequeue/completion.

Monitor task IDs share the bash format: ~8-char lowercase alphanumeric (e.g. `b6lazmyhu`, `b8hrhggum`).

### Turn completion while a task is alive

This was the load-bearing question. Confirmed in the same session at 20:02:51Z: the assistant emits `stop_reason: "end_turn"` while Monitor `b8hrhggum` is still listening, and a *fresh Monitor event arrives at 20:03:02Z* — 11 seconds after end_turn.

Across 950+ stop_reasons sampled, **`stop_reason: "pause_turn"` appears zero times**. The PITFALLS reference to `pause_turn` (in `cc-dependencies.md`) reflects a documented-but-unused stop_reason in the wild data. Turns ending with active background tasks just emit `end_turn` like any other turn; nothing in the assistant message itself signals "background work still pending."

## Design implications

These are facts the data forces, not design choices yet.

1. **Transcript is the right source.** PTY scrape would duplicate signal already present in the JSONL, with the added cost of CLI-version-sensitive regex (the same caveat that makes `attention-classifier.ts` fragile across CC bumps). The transcript carries stable structured fields.

2. **Two new transcript event types are needed.** The current `'user-message' | 'assistant-text' | 'tool-use' | 'tool-result' | 'turn-complete'` set doesn't carry `backgroundTaskId` or `queue-operation` payloads. Proposed additions:
   - `background-task-started` — emitted when a `tool-use` for `Bash` (with `run_in_background: true`) or `Monitor` produces a `tool_result` with a `backgroundTaskId`/`taskId`. Carries `{ taskId, toolUseId, kind: 'bash' | 'monitor', command, description, originatingTurnId }`.
   - `background-task-completed` — emitted when a `queue-operation` enqueues a `<task-notification>` with `<status>completed</status>` (or future failure statuses). Carries `{ taskId, exitCode, summary }`.

3. **State must outlive the turn.** Today's `activeTurnToolIds` Set is wiped by `endTurn()` (chat-reducer.ts:145-167). A new session-lifetime `backgroundTasks: Map<taskId, BackgroundTask>` is required, with `originatingTurnId` captured at start so chat view can render "turn 5 complete · 2 background tasks still running" by joining the Map against the turn list.

4. **Chat view doesn't need a new turn flag.** `AssistantTurn` does not need a `hasOpenBackgroundTasks` field. The render layer can derive it: `backgroundTasks.values().some(t => t.originatingTurnId === turn.id && !t.completedAt)`. Keeping it derived avoids stale flags when a task completes after the turn already rendered.

5. **StatusBar widget reads the same Map.** Add a `'background-tasks'` `WidgetId` (StatusBar.tsx:155-159), a Tasks-category `WidgetDef`, and a `backgroundTasks` field on `StatusData`. Split by `kind` for the "monitors / shells" labels. `buildStatusData()` in `ipc-handlers.ts:1499-1562` populates from a per-session counter the renderer pushes back via the existing `remote:*` IPC pattern, mirroring how `attentionMap` flows.

6. **Parity contract applies.** `youcoded/shared-fixtures/transcript-parity/` is the gate. Every new transcript event shape needs a fixture pair (input JSONL + `.expected.json`). The Kotlin `TranscriptWatcher` fallback on Android must mirror once the Node CLI handles them, per the rule in PITFALLS. Without fixtures, the desktop and Android parsers will silently drift on this surface.

7. **`BashOutput`/`KillShell` are not hot paths.** Zero hits across 1,639 sessions. They can be supported (transitioning a tracked task to `completed` early on `KillShell`, surfacing partial output on `BashOutput`) but are not on the critical path for v1.

## Open questions for the design phase

The data is settled; the UX isn't. Things to brainstorm before writing a plan:

1. **Per-turn UI for "complete + background work outstanding."** Subtle pill below the assistant turn ("⏳ 2 background tasks running")? Inline list of task descriptions with live status? Nothing per-turn at all, only the StatusBar widget? This is the highest-impact open question because it shapes whether `originatingTurnId` even needs to be tracked.

2. **Completion notification.** When a background task completes minutes later, does it animate into the originating turn, fire a toast, just silently decrement the StatusBar count, or some combination? Especially relevant for non-zero-exit completions where the user probably wants to know.

3. **Cross-session scope.** Background tasks belong to one CC session. If the user switches the active session in the SessionStrip, should the StatusBar widget show counts for the active session only, or aggregate across all sessions? (The `attentionMap` precedent is per-session and the StatusBar reads the active one — likely the right pattern here too.)

4. **Persistence across YouCoded restarts.** CC writes the task notifications to disk under `…\AppData\Local\Temp\claude\…\tasks\<taskId>.output`. If YouCoded restarts mid-task, do we re-derive open-task state from the transcript on session resume, or accept the gap? The transcript-watcher already replays from offset 0 on session-list load, so this may be free — needs verification.

5. **Failed / errored tasks.** The mined data only contained `<status>completed</status>` with `exit code 0`. The `<status>` field is presumably enumerable (e.g. `failed`, `killed`, `timeout`). Need to either find a real failure example or accept that we'll handle the enum defensively (treat anything not-`completed` as a generic "ended" state).

## Methodology

- Round 1 (skill-less): static codebase reading across `youcoded-core/hooks/`, `desktop/src/main/transcript-watcher.ts`, `desktop/src/renderer/state/chat-reducer.ts`, `desktop/src/renderer/components/StatusBar.tsx`, `app/src/main/kotlin/.../runtime/SessionService.kt`. Identified that CC's statusline hook JSON contains no background-task fields and the transcript-watcher filters out non-message lines.
- Round 2 (transcript mining): grep across `C:/Users/desti/.claude/projects/**/*.jsonl` (1,639 files) for `"run_in_background": true`, `"name":"BashOutput"`, `"name":"KillShell"`, `"name":"Monitor"`. Pulled lifecycle excerpts from two representative sessions. Inventoried `stop_reason` values to confirm/refute the documented-but-unused `pause_turn`.

No production code was modified. No fixtures were added.
