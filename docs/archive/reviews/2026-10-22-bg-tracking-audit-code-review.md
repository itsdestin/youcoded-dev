# Code review: bg-tracking-audit (branch `session/bg-tracking-audit`)

Reviewer: fresh agent, read the code only (no decks, designs, investigations or transcripts). No contract file exists for this branch, so promises were taken from the three owner statements in the brief.

## Verify summary

`bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/bg-tracking-audit/youcoded` (base origin/master): tests related to 63 changed files + 82 source-scanning guards + 2 data-file guards.

```
PASS  types (tsgo --noEmit)
PASS  types in tests/
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)
PASS  screens open (shoot --check)
PASS  journeys (click paths)
OK — all checks passed.   Not covered: Android (./gradlew test), marketplace worker.
```

Desktop only. I did not run the full suite and did not run anything against a dev instance. Findings below were confirmed by reading the call chains unless marked PLAUSIBLE (I could not execute them).

Android parity: `rg` finds no Kotlin reference to `backgroundTaskId` / `task-notification` / `reconcileInterrupted`; the phone runs the desktop backend (rule `android-runtime.md`), so the changed channels need no Kotlin mirror. No new IPC channel name was added, only fields on existing payloads.

## Findings (most severe first)

- F1 — desktop/src/main/harness/shell-registry.ts:186-192 (`persistedRunViews`) with desktop/src/renderer/components/BackgroundCommandsChip.tsx:161 (`canStop`) — A native conversation that is NOT live on this host, whose saved record still says "running" and whose process group is verified alive, is sent to screens as a plain running command (no `maybeStillRunning`), so the Background chip and the Bash card draw a Stop button; pressing it calls `killShell`, which refuses with `not-live` (native-session-host.ts:1790-1793), and the chip's handler just resets to "Stop" with no message. The code comment in `persistedShellRunsFor` itself says "Read-only: Stop needs the conversation open". Trigger: app crashed or quit uncleanly with a dev server running, then the conversation is opened from a phone/second window without being resumed. Confirmed by reading `persistedToView` (no restored-readonly flag) → `canStop` → `killShell` return path. A button that silently does nothing is exactly what the `canStop` comment says it avoids.
- F2 — desktop/src/renderer/state/cc-background.ts:22-26 (`ccBackgroundOnLaunch`) vs :169-186 (`applyTaskStop`) — For a helper that was resumed by SendMessage and later stopped with TaskStop, a launch card that loads afterwards (older history page; pages arrive newest first) reads "running" forever. The reopen branch looks up only `ccBackgroundOutcomes[viaToolUseId]`; `applyTaskStop` records the stop only under `ccBackgroundOutcomes[taskId]`, and never clears or finishes the `reopen:<taskId>` marker, so the lookup misses and returns `{status:'running'}`. Spinner stays until the session process exits. Not run; chain read end to end (PLAUSIBLE only in that no test exercises the order: newest page holds SendMessage + TaskStop, older page holds the Agent launch).
- F3 — desktop/src/main/ipc-handlers.ts:1705 (`viewOnly`) — Rule "no watcher and no resume boundary means view-only" also holds for a Claude Code session whose process is live but whose watcher is not registered yet or was dropped (the comment on the next lines lists "no watcher yet" as a normal state). Any page fetched in that window is flagged `reconcileBackground`, and the reducer (chat-reducer.ts:3268-3277) then marks every background helper/command on that page "stopped", which is permanent (first end wins in `settleCommands`, and `ccBackgroundOutcomes` is merged in). Only new, non-resume sessions skip the boundary, and those have nothing to stop, so the realistic exposure is a resumed session whose boundary was cleared (`resumePageBoundaries.delete` at ipc-handlers.ts:920 runs on close, but `snapshotResumeBoundary` can also return null → no boundary on a real resume, line 634-635). PLAUSIBLE: needs a resume where the transcript snapshot fails; I did not reproduce it.
- F4 — desktop/src/main/harness/shell-registry.ts:789-792 (`killRestored` stub) — The stub child has `exitCode: null, signalCode: null` forever, so `killTree`'s escalation timer (shell-registry.ts:232-235) fires SIGKILL at `-pid` two seconds later even when the group already exited from SIGTERM. If the OS reuses that number as a process-group id in the 2 s window, an unrelated group is killed. The ordinary (live) path guards the same timer with the child's real exit state. Low likelihood, high cost. PLAUSIBLE (pid reuse not reproduced).
- F5 — desktop/src/renderer/hooks/useBackgroundTarget.ts:21-36 — The index cache is keyed on the `toolCalls` Map identity, and that Map is replaced for many per-event updates (every subagent event copies it in `applySubagentEvent`, chat-reducer.ts ~709). While any management card (SendMessage/TaskOutput/TaskStop/BashOutput/KillShell) is mounted and subscribed, each such event runs `buildIndex`, a scan of ALL tool calls in the session, from the first card's `getSnapshot`. Cost grows with history and with helper traffic (performance.md rule 4). Not measured. PLAUSIBLE.
- F6 — desktop/src/renderer/state/chat-reducer.ts:455 (`launchesBackgroundWork` skip) — Every `Agent` call, foreground included, is now left "running" after Esc, on the stated assumption that Claude Code always writes a result. If a foreground Agent interrupted mid-flight gets no result line, its card spins until the process exits (before this branch it flashed "failed" and stayed failed). The comment only measured background launches. PLAUSIBLE (assumption unverified for foreground Agent).
- F7 — desktop/src/main/harness/specialists/delegation-ledger.ts:718-720 (`reportPending`) — "report not read by the assistant yet" / "held until you continue" is derived only from `!delivered`. A held-after-stop label is computed once at Stop time (native-session-host.ts:4896-4903); when the user next writes and the hold lifts, no event re-pushes the card, so it keeps saying "held until you continue" until the report is actually delivered. A completed background row whose delivery was attempted (`injectionAttempted`) but never confirmed shows "not read yet" permanently. PLAUSIBLE (display staleness, read from code only).
- F8 — desktop/src/renderer/utils/tool-group-summary.ts:171-180 (`callKindKey`) vs ToolCard.tsx:333-336 — A running `task_id` call has no response yet, so the group headline files it under "sending a note to a specialist", while the card itself (using the target's running state) says "Resuming X". On completion the call moves bucket (note → resume). The headline can name the wrong action for a resume in flight, which is the very confusion the branch is meant to remove. Confirmed by reading both branches; not run.
- F9 — desktop/line-budgets.json — Six budgets were raised (native-session-host 5383→5513, chat-reducer 3370→3504, shared/types 1554→1616, ToolCard 1642→1674, ipc-handlers 2493→2498) with no entry in `notes` explaining why. The file's own header says a raise is "a reviewed decision" that must say why. Confirmed by `git diff` of the file (budgets changed, `notes` untouched).
- F10 — desktop/src/main/transcript-watcher.ts:395 and :448 — Both comments still say the parser is "Mirrored in TranscriptWatcher.kt". There is no such Kotlin file or mention anymore (`rg -g '*.kt'` finds nothing), and this branch changed the parser (queue-operation, Monitor/Workflow launch, TaskStop, exit code) in the same place; the comment tells the next reader to update a mirror that does not exist. Confirmed by `rg`.
- F11 — desktop/src/main/harness/native-session-host.ts:1366 (`unwrittenOutcomes`) — Entries are removed only when the disk later shows a final status or a new run starts. If all three retries fail and the conversation is later destroyed, the entry stays for the life of the process (and, if the same childId's row stays "running" on disk until next start, `runViewFor` keeps overlaying the in-memory outcome, which is intended). Small leak only; and `shellSidecars` (native-session-host.ts ~1739) likewise keeps a sidecar per closed conversation until app quit. Low. Confirmed by reading.

## Checked and found fine (so you do not re-check)

- Sidecar file name `<id>.shells.json` is not picked up as a conversation (`native-home.ts` lists only `.jsonl`).
- `runViewSeq = Date.now() * 1000` stays inside the safe-integer range and strictly increases (`nextRunViewSeq`).
- `processStartStamp` field index (19 after the state field) is right for `/proc/<pid>/stat` field 22.
- `restoreFrom` skips records written by this process (`OWNER.instanceId` is a fresh UUID per process), and `mintId` avoids restored ids.
- Background chip list: stable arrays per record (`backgroundCommandList` WeakMap), `putCommand` returns the same object when only the tail changed, finished list is chunked and has a 1,000-item pin in `BackgroundCommandsChip.test.tsx`; `CommandRow` is memoised with stable props.
- Quit path: kills and sidecar flush are bounded by 3 s timers; no sync fs call added in `src/main` (verify's blocking-call ratchet passed).

## Not covered

- Android Gradle tests (SDK not checked; the changed channels have no Kotlin side).
- Running any of F1-F8 (read only; no dev instance launched, per safety rule).
- The workbench fixtures (`fixtures/bubbles/*.jsonl`, `screens/chat.ts`) and the docs diffs (`native-runtime.md`, `cc-dependencies.md`) were only skimmed.
- `SpecialistsChip` popup rendering of parked stand-in cards beyond the data path (no look at the popup's "show in chat" handling for `parked: true`).
- A full read of the 14 new test files for whether each really pins the statement it names.
- Design disagreement (one line): none.

## Triage (implementing session)

- F1 accepted — saved records of a conversation not live here carry `viewOnly`; the chip and the Bash card offer no Stop for them. Pinned: `BackgroundCommandsChip.test.tsx` "offers no Stop on a command shown from disk…" (seen red with the gate removed).
- F2 accepted — `applyTaskStop` also records the stop under the resume's SendMessage id. Pinned: `cc-background-reducer.test.ts` "shows stopped when the resumed run was stopped before the older page loaded" (red before the fix).
- F3 accepted — a page is view-only only when no live Claude Code process of ours holds the id either. Pinned: `transcript-page-locator.test.ts` "a page for a live Claude Code session whose watcher is not attached yet does not" (red before the fix).
- F4 accepted — the restored-run stub's `exitCode` reads the group's real state, so SIGKILL escalation stops once the group is gone. No new test (needs real process groups and pid reuse).
- F5 rejected (accepted limit) — the rescan is the same O(cards) order as the reducer's own Map copy for that event, runs once per change however many cards read it, and only while a management card is mounted. Recorded in the hook's comment.
- F6 rejected — measured: 0 of the Agent calls in the 400 newest local transcripts lacked a tool result, Esc'd ones included; 1,139 of 1,139 earlier-measured Agent calls were background launches. Evidence added to the WHY comment.
- F7 accepted — lifting the post-Stop hold re-pushes still-unread reports' cards. Pinned: `specialist-run-status.test.ts` "writing again lifts the hold…" (seen red with the re-push removed).
- F8 accepted — an in-flight `task_id` call is headlined "following up with a specialist" until its result says note or resume. Pinned: `tool-card-management-labels.test.ts`.
- F9 accepted — `notes` entries added for every raised budget.
- F10 accepted — the two stale "Mirrored in TranscriptWatcher.kt" remarks removed.
- F11 accepted in part — a closed conversation's saved-commands sidecar is flushed and released after its kills settle. `unwrittenOutcomes` kept: dropping an entry while its row still says running on disk would bring back the spinning card it exists to prevent; one small object per helper whose three retries all failed.
