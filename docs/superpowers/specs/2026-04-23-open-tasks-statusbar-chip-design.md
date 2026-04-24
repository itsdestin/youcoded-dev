# Open Tasks — StatusBar Chip & Popup

**Date:** 2026-04-23
**Scope:** Desktop + Android (shared React UI)
**Repo:** `youcoded/` (renderer-only changes)

## Purpose

Consolidate all Task* tool activity from the current Claude Code session into a single StatusBar chip + popup, so users can see what Claude is working on at a glance without scrolling the chat to piece together scattered TaskCreate/TaskUpdate cards.

## Problem

Claude Code's Task* tool family (`TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskStop`) is how Claude tracks its own working checklist. Each call currently renders as its own tool card inside the chat timeline. For long sessions the cards pile up — the user screenshot that prompted this work showed 10 tool calls in a single collapsed group with six `TaskCreate` entries buried inside. Reading the current state of the checklist means expanding the group, scanning each card, and mentally reconciling later `TaskUpdate` cards with their originating `TaskCreate`.

A consolidated session-lifetime view solves that.

## Scope — what's in and what's out

**In scope:**
- Todo-style Task* tools (`TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet`). Numeric IDs.
- Current session only. Switching sessions switches the chip contents.
- Renderer-only. No IPC, main-process, or Kotlin changes.

**Out of scope (deferred):**
- Background-bash `TaskStop({ task_id })` — this tool shares the "Task" name but tracks real background shell processes (hash-like IDs like `b9hd3djdu`, result shape `{ task_type: "local_bash", command: ... }`). Different mental model; different feature.
- Cross-session aggregation.
- Writing back to Claude Code (the UI never fires a TaskUpdate from its buttons).
- Cross-device sync of the `markedInactive` flag.
- Keyboard navigation inside the popup (matches whatever ModelPickerPopup does; no new pattern introduced).

## Data the tools actually carry

Verified against 30 real transcripts in `~/.claude/projects/C--Users-desti-youcoded-dev/`. Field availability in practice:

**`TaskCreate` input** — three fields used:
```json
{ "subject": "...", "description": "...", "activeForm": "Working on X" }
```
Schema allows `metadata`, `addBlocks`, `addBlockedBy`, `owner` — unused in sampled transcripts, but the tracker should tolerate them (ignore unknown keys).

**`TaskCreate` result** — plain string:
```
Task #1 created successfully: Subject here
```
**This is the only place the numeric ID appears** when a task is created. The ID is not in the input.

**`TaskUpdate` input:**
```json
{ "taskId": "1", "status": "in_progress" }
{ "taskId": "5", "status": "completed", "description": "Verified: ..." }
```

**`TaskUpdate` result** — plain string: `Updated task #1 status`.

**`TaskList` input** — `{}` (empty, no args).

**`TaskList` result** — formatted text block:
```
#1 [completed] Task 1: Create worktree and branch
#12 [pending]  Task 12: Manual browser verification
```
Authoritative snapshot of every task's `id`, `status`, and `subject` in one call.

**`TaskGet` / `TaskOutput`** — did not appear in sampled transcripts. Not relied on.

## Design

### Data layer

Extend the existing `youcoded/desktop/src/renderer/state/task-state.ts`:

**New parsers (pure, unit-tested):**
- `parseTaskCreateResult(text: string): { id: string; subject: string } | null` — regex `^Task #(\d+) created successfully: (.+)$`, `null` on malformed input.
- `parseTaskListResult(text: string): Array<{ id: string; status: TaskStatus; subject: string }>` — line-by-line regex `^#(\d+) \[(pending|in_progress|completed)\] (?:Task \d+: )?(.+)$`, malformed lines skipped silently.

**Extended `TaskState`:**
```ts
interface TaskState {
  id: string;
  subject?: string;
  description?: string;
  activeForm?: string;       // NEW — for "Working on…" label when in_progress
  priority?: string;
  status?: TaskStatus;
  createdAt?: number;        // NEW — index within toolCalls insertion order
  events: TaskEvent[];
  markedInactive?: boolean;  // NEW — view-model flag from localStorage, not derived
}
```

**Extended `buildTasksById(toolCalls)`:**
- Iterate `toolCalls.values()` in insertion order.
- For each `TaskCreate` tool call: if its `response` parses via `parseTaskCreateResult`, use the extracted id; merge `input.subject` / `input.description` / `input.activeForm`.
- For each `TaskList` tool call: parse the response and **overwrite** each task's `status` and `subject` with the snapshot values. Authoritative.
- For each `TaskUpdate` tool call: existing behavior (last-writer-wins by scalar).
- `createdAt` = the first index at which this `taskId` was seen in the Map.

**New hook `useSessionTasks(sessionId)`:**
- Reads the session's `toolCalls: Map` from `ChatContext`.
- Memoizes `buildTasksById(toolCalls)` on Map reference (safe per chat-reducer streaming invariants).
- Layers in `markedInactive` from localStorage (see "Persistence" below).
- Returns `{ tasks: TaskState[], openCount: { running: number, pending: number } }` — `tasks` sorted by status-group-then-createdAt for consumer ergonomics.

### Pill component

**File:** `youcoded/desktop/src/renderer/components/OpenTasksChip.tsx`

**Mount point:** `StatusBar.tsx` — rendered immediately after the permission chip (currently `StatusBar.tsx:649`).

**Visibility:** hidden when `openCount.running + openCount.pending === 0` (matching the announcement-pill pattern).

**Label:**
- Wide: `TASKS 1◐ 2○` — "TASKS" in neutral `var(--fg-muted)`, running count in blue (`#60a5fa`, matching the in_progress dot in TodoWrite), pending count in amber (`#fbbf24`). Zero counts omitted (e.g., only pending: `TASKS 2○`).
- Narrow (`sm:hidden` threshold): drop the "TASKS" word, show only the counts — `1◐ 2○`.

**Chip surface:** neutral background matching the "NORMAL" permission chip style — `var(--inset)` bg, `var(--edge-dim)` border. The numbers themselves carry color; the chip surface stays quiet.

**Tooltip:** `"N in progress, M pending — click to view"`.

**Interaction:** click toggles `tasksPopupOpen` state owned by `StatusBar`. Popup anchored below the chip (mirror the ModelPickerPopup positioning pattern).

### Popup component

**File:** `youcoded/desktop/src/renderer/components/OpenTasksPopup.tsx`

**Layer:** L2 (Popup), using shared primitives per PITFALLS § Overlays:
```tsx
<Scrim layer={2} onClick={onClose} />
<OverlayPanel layer={2} className="...">
  ...
</OverlayPanel>
```

**Header row:**
- Left: `Open Tasks`
- Right: `N open` count hint (mirrors the pill's running+pending total)

**Body — grouped sections in order:**
1. **IN PROGRESS (N)** — blue-accented rows. Each row:
   - Status dot (filled blue with glow)
   - `#id` (muted, monospace)
   - Title line: `activeForm` if present, else `subject`
   - Dim description below (if any)
2. **PENDING (N)** — neutral rows.
   - Empty-circle status dot
   - `#id`, `subject`, dim description
3. **COMPLETED (N)** — dimmed section (50% opacity on rows).
   - Filled-muted status dot
   - `#id`, `subject` with strikethrough
   - Description hidden (would be noisy for done work)
   - Collapsed by default if count > 5; expanded otherwise.
4. **MARKED INACTIVE (N)** — collapsed expander at bottom, shown only when non-empty.
   - Rows look like their pre-marking state but with an "Unhide" button always visible.

**Within each section:** sort by `createdAt` ascending (task `#3` before `#5`).

**Row interactions:**
- A subtle **Mark Inactive** button sits on the right of each row (or **Unhide** in the inactive section). Visible at reduced opacity by default so it works the same on desktop and Android (no hover on touch). Brighter on hover/focus/press.
- No Jump-to-Chat. Clicking the row does nothing else.

**Deleted status:** tasks with `status: "deleted"` render in the Completed section with a `[Deleted]` chip — matches the "show full session history" preference while clearly distinguishing them.

**Empty-state guard:** if the popup somehow opens with 0 open tasks (race at completion), render `"No open tasks"` in the body with the Completed section still visible.

**Close:** scrim click, ESC key (via the existing `useEscClose` stack), or clicking the chip again.

### Persistence — `markedInactive`

**Storage:** localStorage key `youcoded-tasks-inactive-v1`, shape:
```ts
Record<sessionId, string[]>  // sessionId -> list of marked-inactive task IDs
```

**Reads:** at mount of `useSessionTasks(sessionId)`. Applied as a view-model overlay on the derived `tasks`.

**Writes:** synchronous on every Mark Inactive / Unhide toggle.

**Auto-prune:** on `SessionManager`'s session-list refresh, remove entries for session IDs that no longer exist. Prevents unbounded growth.

**Auto-clear on completion:** when a task transitions to `completed` (observed via a subsequent TaskList snapshot or TaskUpdate), its `markedInactive` flag is cleared automatically and the task moves to the Completed section. Rationale — "inactive" means "I'm tired of seeing this stale open task," not "I never want to see this task."

**Not synced:** local-device UI state only. Not included in chat state serialization, not written to `~/.claude/youcoded-skills.json`, not pushed by `SyncService`.

### Cross-platform behavior

**No IPC changes.** Everything derives from `toolCalls`, which is already populated identically on desktop (transcript watcher via IPC) and Android (transcript watcher via WebSocket).

**Remote browsers** receive `toolCalls` via `chat:hydrate` on connect (per PITFALLS § Remote Access State Sync). The tracker works unchanged. Each remote client has its own per-device `markedInactive` state (probably correct — different viewing device, different tolerance for seeing the stale task).

**`preload.ts` / `remote-shim.ts` / `SessionService.kt`** — untouched.

### Session resume / replay

On session resume, the transcript watcher re-reads the JSONL from disk and replays `TRANSCRIPT_TOOL_USE` actions. Because `buildTasksById` is a pure function of `toolCalls`, the tracker reconstructs from scratch automatically. `markedInactive` persists via localStorage. No special code path needed.

### Claude Code coupling

The parsers in the data layer depend on Claude Code's exact result-string wording. Per workspace rule, add an entry to `youcoded/docs/cc-dependencies.md`:

> **Open Tasks chip result parsing** — `youcoded/desktop/src/renderer/state/task-state.ts` parses `Task #N created successfully: <subject>` from TaskCreate responses and `#N [status] Task N: <subject>` from TaskList responses. If CC changes this wording, the tracker degrades gracefully (task appears without a pretty subject, or appears only after TaskUpdate) but never crashes.

## Testing

**Unit tests** (Vitest, no DOM):
- `parseTaskCreateResult` — canonical case, subjects with colons, malformed strings → `null`.
- `parseTaskListResult` — all three statuses parsed, blank and unexpected lines skipped.
- `buildTasksById` — extended cases:
  - TaskCreate without TaskUpdate now indexed (via result parsing).
  - TaskList overwrites stale status.
  - `createdAt` derived from insertion order.
  - Unknown input keys ignored.
- `useSessionTasks` — localStorage read/write, auto-prune, completion-clears-inactive.

**Component tests** (Testing Library, no main-process):
- `OpenTasksChip` — hidden at 0 open; renders correct counts/colors; narrow label collapse.
- `OpenTasksPopup` — section order, row grouping, Mark Inactive moves a task, ESC closes, 0-open edge case.

**Manual cross-platform:**
- Desktop dev (`bash scripts/run-dev.sh`): start a session, have Claude create/update/list tasks, verify chip and popup.
- Android: `bash scripts/build-web-ui.sh && ./gradlew assembleDebug`, install, verify chip works in WebView.

No IPC tests needed (no new IPC).

## Files touched

**New:**
- `youcoded/desktop/src/renderer/components/OpenTasksChip.tsx`
- `youcoded/desktop/src/renderer/components/OpenTasksPopup.tsx`
- `youcoded/desktop/src/renderer/hooks/useSessionTasks.ts`
- `youcoded/desktop/src/renderer/state/task-state.test.ts` (colocated with source per existing convention)

**Extended:**
- `youcoded/desktop/src/renderer/state/task-state.ts` — add parsers, extend `TaskState`, extend `buildTasksById`.
- `youcoded/desktop/src/renderer/components/StatusBar.tsx` — mount the chip after the permission chip; manage popup open state.

**Documentation:**
- `youcoded/docs/cc-dependencies.md` — add result-string coupling entry.

**Untouched (parity preserved by design):**
- `preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`, `SessionService.kt`, `chat-reducer.ts`, `chat-types.ts`.

## Success criteria

1. A session with Claude creating and updating tasks shows the chip within 1 render cycle of the first `TaskCreate` response arriving.
2. The chip count matches `TaskList` output at all times when TaskList has been called at least once in the session.
3. A `TaskCreate` with no subsequent `TaskUpdate` still appears in the popup (closes the current `task-state.ts` known-limitation gap).
4. Marking a task inactive hides it from the open count and open sections within the same render; it reappears in Completed if the task later completes.
5. Switching sessions swaps the chip contents within 1 render cycle; `markedInactive` per-session state is preserved.
6. No chip renders when there are no open tasks.
7. Verified working on desktop and Android via manual smoke test.

## Open risks

- **Result-string drift.** Claude Code could change the TaskCreate/TaskList wording in a release. Mitigated by tolerant parsing (never throws) and the cc-dependencies.md entry flagging it at release-review time.
- **Popup height on very busy sessions.** A session with 50+ completed tasks could make the popup unwieldy. Mitigated by the collapsed-by-default completed expander for >5 entries. If it's still a problem in practice, add a `max-height` with inner scroll — easy follow-up.
