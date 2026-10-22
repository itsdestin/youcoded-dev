---
status: active
date: 2026-10-22
---
# Background helpers and background commands — status accuracy audit + fix plan

Destin (2026-10-22): "ensure that card and the status bar chip always reflect accurate
complete/failed/working/etc statuses even after pause/resume/etc of the main session or the
sub-session" · "trace tracking for background commands/shells/watchers/etc, and include all of
these in their own separate status bar chip" · "lets fix all of these" · "checking the status of
subagents or sending additional notes often still reports as 'hiring specialist', which makes it
seem like were adding a new subagent when we arent".

Four read-only audits ran 2026-10-22 against origin/master 063ea7c7 (youcoded d0a7211ad). All
1,077 existing tests in the touched areas passed — none of the defects below is pinned. Paths are
relative to `youcoded/desktop/`.

## A. Claude Code helpers (Agent / SendMessage resume)

- **A1 (high, proved).** The Subagents chip ignores `ccBackground`. `hooks/useSpecialists.ts:138`
  `ccRunFromCard` maps `tool.status` (the launch receipt = `complete`) → `completed`, so a helper
  reads "Finished" ~1 s after launch, never Working/Failed/Stopped. The change-detection key
  (`:218`) also omits `ccBackground`. Cards read `ccBackground` and are mostly right.
- **A2 (med-high, proved).** SendMessage resume while the Agent launch card is on an unloaded
  older page: `cc-background.ts reopenResumedHelper` finds no card; when the page loads,
  `ccBackgroundOnLaunch` settles on the stored FIRST-run outcome → "completed" while working.
- **A3 (high).** Group headers count failures from `tool.status` only
  (`AssistantTurnBubble.tsx:177,181`, `tool-group-summary.ts:208`) — a helper that failed after
  launch shows a plain check. 170 real failed Agent notices on this machine.
- **A4 (gap).** "Needs you" never shows for CC helpers (`useSpecialists.ts:197-207`, decision
  2026-09-05: CC did not say which helper asked). Re-check whether the PermissionRequest hook
  payload now carries `agent_id`/`agent_type` (newer CC versions stamp hook inputs from a
  subagent); if it does, attribute the ask.
- **A5.** Workflow launches (`async_launched`, `taskId`, `taskType: local_workflow`, no `agentId`)
  never start as running (`transcript-watcher.ts:402 backgroundLaunchId`).
- **A6.** ~2% of Bash background ends exist only as a `queue-operation` enqueue line, which the
  parser ignores (`transcript-watcher.ts:94-96,203`). Example: task `b61arikpe` in
  `~/.claude/projects/-home-destin/36f89fb3-…jsonl` line 371.
- **A7.** Stale `running` is reaped only on `SESSION_PROCESS_EXITED` and app-spawned resume pages
  (`chat-reducer.ts:1128,3108`, `ipc-handlers.ts:1736 resumeOffset`). A conversation viewed
  without a live process (preview, opened elsewhere) can spin forever.
- **A8 (low).** Esc before the receipt: `endTurn` fails the card, receipt flips it back — flicker.

## B. Native specialists

- **B1 (high, real data).** Parent Stop (`native-session-host.ts interrupt()` ~4762/4774) aborts a
  foreground child without writing the ledger; the child's throw lands in `runDelegation`'s catch
  (~1304) → `failed` "stopped before it could report". Should be `interrupted`. Seen in ledgers
  `a7c57781`, `1cc2d623`, `178a3874`.
- **B2 (high).** Resume: `specialistReport` is written once (`chat-reducer.ts:1525`) and never
  cleared; the resume ledger patch (~1028) keeps the ORIGINAL `parentToolCallId`. A failed child
  resumed to success still shows Failed + the old report on its original card.
- **B3 (med-high).** A resumed child's live activity and asks nest under the NEW resume-call card
  (`wireChildLive`, ~1009), which has no `specialistRun` — chip never turns amber for its asks.
- **B4 (high).** Chip groups every non-running status as "N finished" with a check
  (`SpecialistsChip.tsx` label/icon) — two failures read "2 finished ✓".
- **B5 (high, real data).** `specialistRunsFor` `.slice(0, 30)` (~5044) keeps the OLDEST 30; the
  budget resets per process while the ledger grows (real ledgers 31–82 records). Newer runs —
  including running ones — get no status on reopen/phone/second window. The test at
  `native-session-host.test.ts:5562` pins the bug.
- **B6 (med-high).** Chip/popup count only loaded cards; a run parked for an unloaded card
  (`parkedSpecialistRuns`) is invisible.
- **B7 (med).** A failed completion ledger write (~1263) only logs → card spins until restart.
  Same for the fire-and-forget `interrupted` write on destroy.
- **B8 (med).** After parent Stop, `holdDeliveries` keeps the report, but the run already says
  Finished with no report and nothing says the assistant hasn't read it.
- **B9 (minor).** Popup Stop flips back to "Stop" before the ledger event lands; a stopped
  foreground Task counts under the group's "N failed" while its icon says stopped; `seq` resets to 0
  on host restart and the reducer drops `seq <=` updates (unverified for a kept remote window).

## C. Claude Code background commands and watchers

Real shapes (1,223 transcripts, CC 2.1.113–2.1.306) are in the audit: Bash receipt
`toolUseResult.backgroundTaskId` (+ `timedOutAfterMs` auto-background); Monitor receipt
`toolUseResult {taskId, timeoutMs, persistent}`; notices `<task-notification>` with status
completed/failed/killed/stopped, exit code only inside the summary text; Monitor events = notices
with no status; TaskStop result `toolUseResult {message, task_id, task_type: local_bash|local_agent|local_workflow, command}`;
TaskOutput `{retrieval_status, task:{status, exitCode,…}}`; `task_status` attachments (sparse,
2.1.273+).

- **C1 (high).** TaskStop writes no notice for `local_bash` (264/264) → the card spins until the
  session exits. Nothing reads TaskStop (`state/task-state.ts:82` deliberately).
- **C2 (high).** Monitor receipts have `taskId`, no `backgroundTaskId` → never "running".
- **C3 (med).** Unreported ends (see A7).
- **C4 (med).** A helper's own background commands are dropped (`cc-background.ts:65`).
- **C5.** Persistent monitors only end on stop/exit.

## D. Native background commands (`shell-registry.ts`)

Healthy while the app runs: `native:shell-event` through `publish` reaches windows and phones;
`session:open` re-sends runs; Stop on the card works from a phone.

- **D1 (med-high).** `SHELL_RUN_CHANGED` drops a record whose card is not loaded
  (`chat-reducer.ts:2935`) — no parking like specialists.
- **D2 (high).** Nothing per run is persisted; after a restart every un-noticed card reads
  "Stopped when the app quit" (`markOrphanedShellRuns`, `chat-reducer.ts:713`), losing real
  exit codes and the real stop reason.
- **D3 (high).** After a crash (not a clean quit) the process groups survive; the UI says
  stopped while e.g. a dev server still holds its port.
- **D4 (high).** `shellRunsFor` is `[]` unless the session is live on this host.
- **D5 (high).** `ShellRunView` has no `command`/`signal`; a signal kill shows "Exit ?" and counts
  as failed.
- **D8.** `docs/native-runtime.md` claims `bufferShellRun` / Android not-implemented — stale.

## E. Card wording

- Native `Task` with `list: true` reads "Hiring a specialist" (`ToolCard.tsx taskDisplay`: only
  `task_id` is treated as management). Group summaries likely count it as a hire.
- Claude Code `SendMessage`, `TaskOutput`, `TaskStop`, `Monitor`, `Workflow`, `ScheduleWakeup`
  have no plain-language label.

## Work split

1. **Native engine** (session `bg-tracking-native`): B1, B2 (ledger side: resume points the run
   at the card that shows it, report freshness), B3 (host side), B5, B7, B8 (a `reportPending`/
   "not yet read" fact), B9 seq; D2/D3 (a per-session shell sidecar written at start/exit/stop;
   on restart, a record whose process group is still alive is reported as still running and
   stoppable, or as "may still be running"), D4, D5 (`command`, `signal`, `description` on
   `ShellRunView`), D8 docs.
2. **Screen + Claude Code parsing** (session `bg-tracking-renderer`): A1–A8, B2/B3/B4/B6/B9
   renderer side, C1–C5, D1, plus the session-level background-command list the new chip reads
   (one record per command independent of loaded cards, from `SHELL_RUN_CHANGED` and CC
   launches/notices/TaskStop).
3. **New chip + card wording** (this session): Before/After deck first (short route), then built on
   top of 1 + 2.
