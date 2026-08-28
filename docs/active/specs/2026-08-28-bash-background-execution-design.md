---
title: Background execution for the native Bash tool (ledger G-1)
date: 2026-08-28
status: draft
review: UI approved 2026-08-28 on deck docs/active/design/2026-08-28-bash-background/ (5/5 yes); design decisions approved in chat the same day. Awaiting Destin's read of this document, then superpowers:writing-plans.
tags: [native-runtime, harness, harness-tools, renderer, ipc-bridge]
related:
  - docs/active/investigations/2026-08-26-native-tools-vs-other-harnesses.md (§5 Bash, ledger G-1)
  - youcoded branch feat/bash-background-ui (worktree worktrees/bash-bg — the approved card, workbench-only, MOCK_ONLY 'native.killShell')
  - youcoded/docs/native-runtime.md → "Specialists (plan 1b — background, durability, steering)" (the delivery mechanism this reuses)
---

# Background execution for the native Bash tool

## 1. The problem

A command the assistant runs today is a single call: pipes, no process group, killed with
SIGKILL at its timeout (default 2 min, max 10 — `tools/bash.ts:20-21`, `:929-937`), and the
kill reaches only the outer shell — a `node` the shell started survives (`bash.ts:938-941`).
Nothing can outlive a call, so `npm run dev`, a 12-minute Android build, or "start the tests
and keep working" are impossible. There is no list of running commands anywhere: session
destroy and app quit (`native-session-host.ts:4003`, `:4066`) never touch a Bash child.
Every mainstream harness except Pi can background a command (investigation §5.3).

## 2. Decisions (Destin, 2026-08-28)

| # | Question | Decision |
|---|---|---|
| D1 | How much background? | **B** — the model can ask (`run_in_background`), AND a command that hits its time limit is moved to the background instead of killed. Typing into a running command (Codex's `write_stdin`) is **out of scope**, recorded as a follow-up. |
| D2 | Lifetime | **Survives a conversation switch; killed when its conversation is closed and when the app quits.** The card names the reason. |
| D3 | Checking / stopping from the model | **A** — two companion tools with Claude Code's names: `BashOutput` (read what is new since the last look) and `KillShell` (stop). The finished result is always delivered on its own; these are for before that. |
| UI | The card | Approved 5/5: running strip + Stop + live tail + log path; "moved to background at its time limit" wording; green/red exit chip; amber stop-reason chip. |

## 3. What the user experiences (approved)

1. **Starting.** The assistant runs a command in the background; the call returns at once with
   a short id and the assistant carries on. A foreground command that reaches its time limit
   is moved to the background with a note to the assistant — the 10-minute hard cap is gone.
2. **While it runs.** The card header reads "… · in the background" with a spinner. A status
   strip says "Running in the background · 2m 18s" (ticking) with one action, **Stop**; below
   it "Live output" (the last lines, growing) and "Full log: <path>". Stop ends the command
   and everything it launched.
3. **When it finishes.** Header drops the suffix and shows ✓/✗; chips "Background" + "Exit N ·
   11m 42s" (green for 0, red otherwise). The assistant is told at its next pause — exit code,
   last ~50 lines, log path — and continues. Nothing lands mid-sentence.
4. **When it is stopped.** Amber chip: "Stopped by you" / "Stopped by the assistant" /
   "Stopped when the conversation closed" / "Stopped when the app quit" · "after 40m". Header
   shows the stopped mark and the STOPPED tag, same as a stopped helper.
5. **Escape** (interrupt) leaves background commands alone — same as background helpers.
6. **Limits.** At most **5** running background commands per conversation (a 6th start is
   refused, naming the limit and the running ids). Output always goes to the on-disk log from
   the first byte (the existing spill mechanism, 7-day sweep). A server that never finishes
   never produces a finished notice — it stays on the card until stopped.

## 4. Model-facing contract

### 4.1 Bash gains `run_in_background`
- `run_in_background?: boolean` (strict schema, described in one line: "Start the command and
  return immediately with a shell id; you are told when it finishes. For servers, long builds,
  anything over a couple of minutes.").
- Result of a background start, `isError:false`:
  `Started in the background (shell id sh-4f2a). You'll be told when it finishes. BashOutput
  reads new output; KillShell stops it. Running now: 2 of 5.`
- Result of a foreground command that hit its limit (replaces exit 124 + SIGKILL):
  `Still running after 2m — moved to the background (shell id sh-9c10). You'll be told when it
  finishes.` plus whatever output was captured so far under the usual bounds. `timeout` stays
  as the *foreground wait* (default 2 min, max 10) — it now means "how long to wait before
  handing it off", never "when to kill".
- A background start never runs the cwd probe (`withCwdProbe`, `bash.ts:177-205`) and never
  updates `shellCwd`/`shellEnv` — only foreground calls do; the description says so. (Today's
  hazard at `bash.ts:196-198` — a trailing `&` writer flushing after the sentinel — is why.)
- `persistent_env` with `run_in_background` → refused as incompatible, one sentence.
- Description text (Linux/macOS + Windows renderings) drops "a timeout force-kills the process
  (SIGKILL) and is reported as exit 124" and gains the two sentences above.

### 4.2 `BashOutput`
- Input `{ shell_id: string }` (strict). Returns the output produced **since the last
  BashOutput for that id** (first call: everything so far), under the standard `bounds`
  contract (unit `lines`, moreHint names the log path). Header line: `sh-4f2a · running · 3m
  02s` or `· exited 0 · 3m 02s` / `· stopped (by you)`.
- Nothing new → `No new output from sh-4f2a since your last look (still running · 3m 10s).
  You'll be told when it finishes — do other work or wait.` After **3** consecutive
  no-new-output calls on the same id in one turn the result becomes `isError:true` with the
  same sentence plus "Stop asking; the finished notice will arrive." — a bored model cannot
  spend a turn polling.
- **Exempt from the doom-loop signature window** (`harness-session.ts:2743-2758`): a poll is
  supposed to repeat. (The evaluator rule already records why repeat-counting terminators were
  removed — `.claude/rules/harness-evaluator.md`.) The 3-strike rule above is the guard instead.
- Unknown/finished-and-already-reported id → specific error naming the ids that exist.
- `permissionSubject: () => undefined`, never asks — reading the assistant's own log is harmless.

### 4.3 `KillShell`
- Input `{ shell_id: string }` (strict). Kills the process family, waits up to 5 s for exit,
  returns `Stopped sh-4f2a after 3m 12s (was running: npm run dev:renderer). Last lines:` +
  tail. Never asks: stopping something the assistant started is its own mess to clean up.
- Unknown id / already ended → specific message with the current state.
- A killed run delivers **no** finished notice (the KillShell result *is* the notice).

### 4.4 The finished notice
Delivered at the next idle boundary as an injected user-role turn (see §5.4):
```
[Background command sh-9c10 finished · exit 0 · 11m 42s]
$ ./gradlew assembleDebug
… last 50 lines …
Full log: /tmp/youcoded-harness-bash-output/<session>/bash-….txt
```
Non-zero exit says `· exit 1` and the same shape; the model decides what it means. If several
finish while the assistant is busy, each gets its own notice in completion order (the
specialists' `concurrentReporters` pattern is not needed — notices are short).

### 4.5 Small-model tier
Both companion tools ship on every tier with one-clause `shortDescription`s. Small models
that never call them still get the finished notice, which is the whole experience they need.
`run_in_background` is described on every tier.

## 5. Runtime design (main process, desktop only — Android has no native harness)

### 5.1 `ShellRegistry` — one per session (`harness/shell-registry.ts`, new)
```ts
interface ShellRun {
  shellId: string; toolUseId: string; command: string; cwd: string;
  child: ChildProcess; pgid?: number;             // POSIX: detached, killed as -pgid
  logPath: string; logStream: fs.WriteStream;     // spill from the first byte
  tail: RingBuffer<string>;                        // last 200 lines, for the card + notices
  readCursor: number;                              // BashOutput's "since last look" (bytes)
  startedAt: number; endedAt?: number;
  status: 'running' | 'exited' | 'stopped'; exitCode?: number; stopReason?: ShellStopReason;
  detached: boolean;                               // moved at its time limit
  reported: boolean;                               // finished notice delivered
}
```
- `start(spec)`, `adopt(runningForegroundChild)` (the time-limit hand-off — the same child, no
  restart), `read(shellId)`, `kill(shellId, reason)`, `killAll(reason)`, `list()`; emits
  `'change'` with a `ShellRunView` (the renderer shape already on `feat/bash-background-ui`).
- Cap: 5 running. `start` beyond the cap throws the refusal text (§3.6).
- Owned by `HarnessSession` (it already owns `shellCwd`, the tool ctx, and the turn loop);
  `NativeSessionHost.destroy()` calls `killAll('conversation-closed')`, `destroyAll()` calls
  `killAll('app-quit')` — the two hook points the survey found (`native-session-host.ts:4003`,
  `:4066`). `HarnessSession.interrupt()` does **not** touch it.

### 5.2 Process family, honestly killed
- POSIX: `spawn(shell, ['-c', cmd], { detached: true, … })` → own process group; kill =
  `process.kill(-pid, 'SIGTERM')`, then `SIGKILL` after 2 s. Windows: `taskkill /PID <pid> /T
  /F` (tree), falling back to `child.kill()`.
- **Foreground calls get the same treatment** (spawn detached, kill the group on abort and on
  interrupt) — the Escape-key kill that today orphans grandchildren (`bash.ts:942-948`) is
  fixed by the same change. Pinned by a test that spawns `bash -c 'sleep 30 & wait'` and
  asserts the grandchild is gone.

### 5.3 Output
- Background runs open the log stream at spawn (reuse `spill-paths.ts` naming and the 7-day
  sweep). stdout+stderr interleave into the log and the tail ring; every ~250 ms of new
  output, or on exit, the registry emits `'change'` (debounced so a chatty build does not
  flood IPC).
- ANSI-stripped like today (`bash.ts:619-639`).

### 5.4 Delivery
- On exit of a run that was not killed via KillShell: `queueHostNotice(parentId, text)` +
  `kickIdleDeliveryPass(parentId)` (`native-session-host.ts:1487-1497`, `:1470-1479`), drained
  by `drainDeliveries` → `HarnessSession.runNotice(text, meta)` (`harness-session.ts:1621`).
- `runNotice` gains an `injected` discriminant: `'shell-complete'` (today hardcoded
  `'specialist-report'`), with `injectedMeta: { shellId, toolUseId, exitCode, elapsedMs }` so
  the renderer folds the notice into the launching card (the fixture `bash-background-finished`
  is that folded state — the notice bubble itself is hidden the way `specialist_report` is).
- Liveness guard mirrors `:1488`: a parent destroyed before drain drops the notice (the
  registry is already dead by then).

### 5.5 Time-limit hand-off (auto-detach)
- In `bash.ts` the timeout timer no longer kills. It calls `registry.adopt(child, …)` — the
  registry takes over the child, the log stream (already open if the head filled; opened now
  otherwise, seeded with the head buffer), and the tail — and `execute` resolves with the
  §4.1 hand-off text. `detached: true` on the run drives the card's wording.
- The cwd probe was appended to the command line at spawn; on adopt its sentinel line is
  filtered out of the log/tail when it eventually prints and is **not** applied to `shellCwd`.

### 5.6 IPC (five surfaces, `ipc-channels.test.ts` parity)
- Push `native:shell-event` `{ sessionId, run: ShellRunView }` — same routing as
  `specialists:event` (`ipc-handlers.ts` nativeHost listener → `sendForSession` +
  `remoteServer.broadcast`), buffered for connect-time replay (`bufferSpecialistRun` pattern).
- Request `native:kill-shell` `{ sessionId, shellId }` → `{ ok, reason? }` — the card's Stop
  (stopReason `'user'`). Android: `not-implemented-on-mobile` like every `native:*`.
- Neither is gated on `native.supported` in the shim (the phone must be able to Stop a desktop
  command through remote access).

## 6. Renderer (already built on `feat/bash-background-ui`, workbench-only)
`ShellRunView` + `shellRun` on `ToolCallState`; `SHELL_RUN_CHANGED` reducer case; `ShellView`
strip/chips/tail/log; `ToolCard` header suffix + status icon; `MOCK_ONLY: native.killShell`.
Remaining renderer work: the `native:shell-event` subscription → `SHELL_RUN_CHANGED`
dispatch (hook-dispatcher / useIpc, like `specialists:event`), hiding the injected
`'shell-complete'` user bubble and folding it into the card, replay on attach, drop the
MOCK_ONLY row, tests.

## 7. Tests (pinning, not exhaustive)
- `shell-registry.test.ts`: start/read cursor/kill/killAll/cap/adopt; tree kill (POSIX group,
  Windows path unit-mocked); log from first byte; debounce; `reported` once.
- `bash.ts`: background start text; time-limit hand-off (no SIGKILL, no exit 124, cwd probe
  not applied); `persistent_env` + background refused; foreground interrupt kills grandchild.
- `BashOutput`/`KillShell`: strict schemas; since-last-look cursor; 3-strike pushback; doom-loop
  exemption (three identical BashOutput calls raise no ask); unknown id message; manifest test
  rows (bounds contract, moreHint vocabulary).
- Host: destroy → `conversation-closed`; destroyAll → `app-quit`; interrupt leaves runs; notice
  queued once per run, `injected:'shell-complete'`, dropped for a dead parent.
- Renderer: reducer case; ShellView five states (jsdom, from the fixtures); header suffix;
  `ipc-channels.test.ts` parity for both channels; `workbench-mock-contract` once MOCK_ONLY
  row is removed; `workbench-boot-check`.
- Descriptions: `native-tools-polish.test.ts` gains the Bash wording pins.

## 8. Risks and accepted limitations
- **App crash (not quit)** leaves background commands running with no owner; on next launch
  nothing knows about them. Accepted; documented in the card's risk text and native-runtime.md.
- **Concurrent writes**: a background command writing files the assistant is editing can
  collide. Not detected. Accepted.
- **Windows tree kill** relies on `taskkill /T`; Git-Bash-spawned trees are killed by PID tree,
  verified in CI by the grandchild test on windows-latest.
- **Silent commands look frozen** — the ticking timer is the sign of life (deck BG.1 risk).
- **Out of scope (follow-ups, ROADMAP):** typing into a running command (D1 → C); a
  "Running commands" list outside the chat (Settings or status bar); notify-on-pattern
  (Hermes' `watch_patterns`).

## 9. Files to change (youcoded/desktop)
`src/main/harness/shell-registry.ts` (new) · `tools/bash.ts` · `tools/bash-output.ts` (new) ·
`tools/kill-shell.ts` (new) · `tools/index.ts` + `shared/harness-manifest.ts` (tool names) ·
`harness-session.ts` (registry ownership, `runNotice` discriminant, doom-loop exemption) ·
`native-session-host.ts` (killAll on destroy/destroyAll, shell-event emit, notice on exit) ·
`ipc-handlers.ts` / `preload.ts` / `renderer/remote-shim.ts` / `remote-server.ts` /
`app/…/SessionService.kt` (two channels) · renderer: `hook-dispatcher` or `useIpc` subscription,
`chat-reducer.ts` (fold shell-complete), `ToolBody.tsx`/`ToolCard.tsx` (already on the branch),
`mock-only.ts` (row removed) · docs: `youcoded/docs/native-runtime.md` section,
`.claude/rules/harness-tools.md` one bullet, ROADMAP flip.
