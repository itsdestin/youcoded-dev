---
title: Background execution for the native Bash tool (ledger G-1)
date: 2026-08-28
status: active
review: Reviewed 2026-08-28 — docs/active/investigations/2026-08-28-bash-background-spec-review.md (16 findings, all applied or decided here; the two open judgment calls decided by Claude, approved by Destin "update as you see fit"). UI approved 5/5 on deck docs/active/design/2026-08-28-bash-background/. Plan: docs/active/plans/2026-08-28-bash-background-execution.md (10 tasks, 47 steps; its five deviations folded back here 2026-08-28).
tags: [native-runtime, harness, harness-tools, renderer, ipc-bridge]
related:
  - docs/active/investigations/2026-08-26-native-tools-vs-other-harnesses.md (§5 Bash, ledger G-1)
  - youcoded branch feat/bash-background-ui (worktree worktrees/bash-bg — the approved card, workbench-only, MOCK_ONLY 'native.killShell')
  - youcoded/docs/native-runtime.md → "Specialists (plan 1b — background, durability, steering)" (the delivery path this reuses)
---

# Background execution for the native Bash tool

## 1. The problem

A command the assistant runs is one call: pipes, no process group, SIGKILLed at its timeout
(`DEFAULT_TIMEOUT_MS` 2 min / `MAX_TIMEOUT_MS` 10 min in `tools/bash.ts`), and the kill reaches
only the outer shell — a `node` the shell started survives. Nothing can outlive a call, so
`npm run dev`, a 12-minute Android build, or "start the tests and keep working" are impossible.
No list of running commands exists: `NativeSessionHost.destroy` / `destroyAll` never touch a
Bash child. Every mainstream harness except Pi can background a command (investigation §5.3).

## 2. Decisions

| # | Decision (Destin, 2026-08-28) |
|---|---|
| D1 | **Size B.** The model can ask (`run_in_background`), AND a foreground command that reaches its time limit is handed off to the background instead of killed. Typing into a running command is out of scope — ROADMAP follow-up. |
| D2 | **Survives a conversation switch and a remote takeover; killed when the conversation is closed and when the app quits.** The card names the reason. |
| D3 | **Two companion tools with Claude Code's names:** `BashOutput` (new output since the last look; with no id, the list of runs) and `KillShell`. The finished result always arrives on its own. |
| D4 | **Stdin is closed** for background and handed-off runs, so a command waiting for input fails fast with its own error instead of hanging forever (review A). |
| D5 | **The cap (5) applies to explicit starts only.** A hand-off always succeeds — a working build is never killed over a bookkeeping number (review B). |
| D6 | **A handed-off run applies neither working directory nor `persistent_env`;** the registry cleans up the env temp file on exit (review C). |
| D7 | **Flat cap of `BashOutput` reads per turn (8), regardless of result** — replaces the three-empty-checks rule; covers the chatty-build case (review §4). |
| D8 | **Notices ready in the same drain go out as one turn** (review F). |
| UI | Card approved 5/5: running strip + Stop + live tail + log path; hand-off wording; green/red exit chip; amber stop-reason chip. |

## 3. What the user experiences (approved)

1. **Starting.** The assistant runs a command in the background; the call returns at once with
   a short id and the assistant carries on. A foreground command that reaches its time limit
   is handed off with a note to the assistant — there is no hard cap any more.
2. **While it runs.** Header "… · in the background" + spinner. Strip "Running in the
   background · 2m 18s" (ticking) with one action, **Stop**; "Live output" (last lines,
   growing); "Full log: <path>". Stop ends the command and everything it launched.
3. **When it finishes.** Header ✓/✗; chips "Background" + "Exit N · 11m 42s" (green for 0).
   The assistant is told at its next pause — exit code, last ~50 lines, log path — and
   continues. Nothing lands mid-sentence.
4. **When it is stopped.** Amber chip "Stopped by you / by the assistant / when the
   conversation closed / when the app quit · after 40m"; header stopped mark + STOPPED tag.
5. **Escape** leaves background commands alone, same as background helpers. **Picking the
   conversation up on another device** leaves them alone too.
6. **Limits.** 5 explicit background starts running at once (a 6th is refused naming the
   running ids); handed-off commands are not counted. Output goes to the on-disk log from the
   first byte. A server that never finishes stays on the card until stopped. **After the app
   restarts,** a card whose last state was "running" reads "Stopped when the app quit".
7. **A command that prints nothing** looks still; the ticking timer is the sign of life.

## 4. Model-facing contract

### 4.1 Bash
- New param `run_in_background?: boolean` — "Start the command and return at once with a
  shell id; you are told when it finishes. For servers, long builds, anything over a couple of
  minutes." Result (`isError:false`): `Started in the background (shell id sh-4f2a). You'll be
  told when it finishes. BashOutput reads new output (or lists runs); KillShell stops it.
  Running now: 2 of 5.`
- `timeout` keeps its default (2 min) and max (10 min) but now means **how long to wait before
  handing off**, never when to kill. On expiry: `Still running after 2m — handed off to the
  background (shell id sh-9c10). You'll be told when it finishes.` plus output so far under the
  usual bounds. Exit 124 and the SIGKILL sentence leave the description.
- Background starts and handed-off runs: **stdin closed** (D4); **no cwd probe, no
  `shellCwd`/`shellEnv` update** (D6) — the description says "only a foreground command
  changes your working directory". `persistent_env` + `run_in_background` is refused in one
  sentence; `persistent_env` on a foreground call that hands off simply does not apply.
- `sleep` as the leading command is never handed off (backgrounding a sleep is churn); it runs
  to its timeout and reports as today.
- Cap refusal: `5 background commands are already running (sh-…, …). Stop one with KillShell
  before starting another.`

### 4.2 BashOutput
- `{ shell_id?: string }` (strict). **With an id:** the output since the last BashOutput for
  that id (first call: everything so far), under the `bounds` contract (unit `lines`,
  moreHint names the log path); header `sh-4f2a · running · 3m 02s` / `· exited 0 · 3m 02s` /
  `· stopped (by you)`. Nothing new: `No new output from sh-4f2a since your last look (still
  running · 3m 10s). You'll be told when it finishes.` **Without an id:** one line per run in
  this conversation — id, state, elapsed, first 60 chars of the command — or "No background
  commands in this conversation."
- **Per-turn cap (D7):** the 9th BashOutput in one turn returns `isError:true`: `You have read
  background output 8 times this turn. Do other work; the finished notice will arrive.`
- **Exempt from the doom-loop signature window** (`runOneTool`'s `recentCalls`): a poll is
  supposed to repeat; the per-turn cap is the guard instead.
- Unknown id → `No background command sh-xyz. Running: sh-4f2a, sh-9c10.` (or "none").
- `permissionSubject: () => undefined` — never asks.

### 4.3 KillShell
- `{ shell_id: string }` (strict). Kills the process family, waits up to 5 s, returns `Stopped
  sh-4f2a after 3m 12s (was: npm run dev:renderer). Last lines:` + tail. Never asks.
- Unknown / already ended → the current state in one sentence. A killed run sends **no**
  finished notice (this result is the notice).

### 4.4 The finished notice
Injected user-role turn at the next idle boundary:
```
[Background command sh-9c10 finished · exit 0 · 11m 42s]
$ ./gradlew assembleDebug
… last 50 lines …
Full log: /tmp/youcoded-harness-bash-output/<session>/bash-….txt
```
Several finishing while the assistant is busy → **one** turn carrying each block in
completion order (D8).

### 4.5 Tiers
Both companion tools ship on every tier with one-clause short descriptions; a model that never
calls them still gets the finished notice.

## 5. Runtime design (main process; desktop only — Android has no native harness)

Marked **NEW** or **REUSE** per the review's positioning note.

### 5.1 `ShellRegistry` — NEW, one per `HarnessSession` (`harness/shell-registry.ts`)
```ts
interface ShellRun {
  shellId: string; toolUseId: string; command: string; cwd: string;
  child: ChildProcess;                       // spawned detached (POSIX group) — see 5.2
  logPath: string; logStream: fs.WriteStream; // open at spawn, first byte onward (NEW vs today's lazy spill)
  tail: string[];                            // last 200 lines, main-side (notice + BashOutput)
  lastReadBytes: number;                     // where the previous BashOutput ended
  envFile?: string;                          // persistent_env temp file to unlink on exit (D6)
  startedAt: number; endedAt?: number;
  status: 'running' | 'exited' | 'stopped'; exitCode?: number; stopReason?: ShellStopReason;
  detached: boolean;                         // handed off at its time limit
  explicit: boolean;                         // counts toward the cap (D5)
  reported: boolean;                         // finished notice queued
}
```
`start(spec)`, `adopt(child, …)` (hand-off: same process, no restart), `read(id)`,
`list()`, `kill(id, reason)`, `killAll(reason)`; emits `'change'` with a `ShellRunView`
whose `tail` is the **last 40 lines** (wire), not the 200-line ring (review G), debounced to
≤4 events/s per run. **Lifetime owned by `NativeSessionHost`** (a map keyed by session id);
`HarnessSession` holds only the reference — a taken-over session's runs must still be
reachable at app quit (D2), which session-owned state could not guarantee. `list()` keeps
at most 50 ended runs so a long conversation cannot grow it without bound. `NativeSessionHost.destroy`
→ `killAll('conversation-closed')` **except on the holder-takeover and session-exit paths**
(`createHolderTakeover`'s `destroyNative`, the exit backstop), which pass a flag so the
registry is left alone (D2; review D). `destroyAll` → `killAll('app-quit')`.
`HarnessSession.interrupt` never touches it. Runs survive compaction; their notices arrive
after it.

### 5.2 Process family, honestly killed — NEW
- POSIX: `spawn(…, { detached: true, stdio: ['ignore','pipe','pipe'] })`; kill =
  `process.kill(-pid, 'SIGTERM')`, `SIGKILL` after 2 s. Windows: `taskkill /PID <pid> /T /F`,
  falling back to `child.kill()`.
- **Foreground calls change too** (a behaviour change, not a fix): detached spawn and group
  kill on abort/interrupt — today's Escape kill orphans grandchildren. `execute` still resolves
  **immediately** on abort (the existing comment above the abort handler explains why); only
  the escalation runs on. Foreground stdin stays as today (open pipe) — the timeout still
  bounds a foreground prompt, and after hand-off stdin is closed (D4).
- Pinned by a test spawning `bash -c 'sleep 30 & wait'` and asserting the grandchild is gone
  (POSIX; Windows path unit-mocked).

### 5.3 Output — REUSE `spill-paths.ts` naming + 7-day sweep; NEW open-at-spawn
stdout+stderr interleave (ANSI-stripped like today) into the log and the tail ring. On adopt,
the head buffer already captured seeds the log. The cwd/env sentinels print when the command
finally exits — **filtered on read** (tail, BashOutput, notice); the raw log keeps them.

### 5.4 Delivery — REUSE the specialists' idle-boundary path
`pendingHostNotices` becomes `{ text, meta? }[]`; `queueHostNotice` takes an optional meta
and a caller-supplied liveness message (its current "late permission answer" warning must not
print about a finished build — review I5). `drainDeliveries` concatenates every queued shell
notice into **one** `runNotice` call (D8). `runNotice(text, meta)` gains the `injected`
discriminant `'shell-complete'`; `injectedMeta` in `shared/types.ts` becomes a union of the
specialist shape and `{ kind: 'shell'; runs: Array<{ shellId; toolUseId; exitCode?; stopReason?;
elapsedMs; logPath }> }` — a list, because D8 puts several finishes in one turn, and `logPath`
so a resumed card can still name its log. **A Stop from the card also sends a notice**
("stopped by you"), so the model learns its server is gone; a `KillShell` sends none. The renderer
folds the bubble into the launching card (fixture `bash-background-finished` is that state).

### 5.5 Hand-off — NEW
`bash.ts`'s timeout timer no longer kills; it calls `registry.adopt(child, …)` with the head
buffer, the open-or-new log stream, and `envFile` if any, and `execute` resolves with the §4.1
text. Never at the cap (D5). Never for a leading `sleep`.

### 5.6 IPC
- **Request** `native:kill-shell` `{ sessionId, shellId }` → `{ ok, reason? }` — the card's
  Stop (`stopReason: 'user'`). Rides the existing `native:*` request parity (preload,
  remote-shim, SessionService.kt → `not-implemented-on-mobile`), pinned by
  `ipc-channels.test.ts`. Not gated on `native.supported` in the shim (the phone must Stop a
  desktop command over remote access).
- **Push** `native:shell-event` `{ sessionId, run: ShellRunView }` — the `specialists:event`
  shape: nativeHost listener → `sendForSession` + `remoteServer.broadcast`, buffered for
  connect-time replay (`bufferSpecialistRun` pattern), pinned by a `remote-server.test.ts`
  replay test. Pushes are not in the request parity list.

### 5.7 Resume — NEW rule
On history rebuild, any card whose `shellRun` was `running` and has no live registry entry
renders `stopped / app-quit`. The final state is never persisted, so a run that was stopped
shortly before the quit — or one still running on another device after a takeover — also
reads "Stopped when the app quit" after a restart. Accepted (§8).

## 6. Renderer
On `feat/bash-background-ui` already: `ShellRunView` + `shellRun`, `SHELL_RUN_CHANGED`,
`ShellView` strip/chips/tail/log, header suffix + icon, five fixtures, `MOCK_ONLY:
native.killShell`. Remaining: the `native:shell-event` subscription → `SHELL_RUN_CHANGED`;
hide the `'shell-complete'` bubble and fold it into the card; §5.7 on rebuild; drop the
MOCK_ONLY row; tests.

## 7. Tests
- `shell-registry.test.ts`: start / read-since-last / list / kill / killAll / cap on explicit
  only / adopt / env-file unlink / log from first byte / debounce / wire tail 40 / `reported` once.
- `bash.ts`: background start text; hand-off (no SIGKILL, no 124, cwd+env not applied,
  sentinel filtered on read); `sleep` not handed off; `persistent_env`+background refused;
  **foreground interrupt kills the grandchild and still resolves immediately**.
- `BashOutput`/`KillShell`: strict schemas; since-last-look; list mode; per-turn cap (8);
  doom-loop exemption (identical polls raise no ask); unknown-id text; manifest rows (bounds,
  moreHint vocabulary).
- Host: destroy → `conversation-closed`; takeover/exit paths leave runs; destroyAll →
  `app-quit`; interrupt leaves runs; one notice per run; several ready → one turn; dropped for a
  dead parent with the right log message.
- Renderer: reducer; five ShellView states (jsdom, from fixtures); header; parity for the
  request channel; replay test for the push; `workbench-mock-contract` after the MOCK_ONLY
  removal; `workbench-boot-check`.
- Descriptions: `native-tools-polish.test.ts` gains the Bash wording pins.

## 8. Accepted limitations
- **App crash (not quit)** leaves commands running with no owner. Documented in
  native-runtime.md and the card's risk text.
- **Concurrent writes** by a background command to files the assistant is editing are not
  detected.
- **Windows tree kill** relies on `taskkill /T`; verified by the grandchild test on
  windows-latest.
- **Resume wording** (§5.7): after a restart the card cannot tell "stopped just before the
  quit" from "killed by the quit"; both read "Stopped when the app quit".

## 9. Follow-ups (ROADMAP, filed 2026-08-28 under "Background Bash follow-ups")
Typing into a running command (D1 → Codex's shape); a "Running commands" list outside the chat
(status bar or Settings); notify-on-pattern for servers (Hermes' `watch_patterns`).

## 10. Files to change (youcoded/desktop unless noted)
`src/main/harness/shell-registry.ts` (new) · `tools/bash.ts` · `tools/bash-output.ts`,
`tools/kill-shell.ts` (new) · `tools/index.ts`, `shared/harness-manifest.ts` · `shared/types.ts`
(`injectedMeta` union) · `harness-session.ts` (registry, `runNotice` discriminant, doom-loop
exemption, per-turn BashOutput cap) · `native-session-host.ts` (notice queue shape, killAll
paths, shell-event emit) · `ipc-handlers.ts`, `preload.ts`, `renderer/remote-shim.ts`,
`remote-server.ts`, `app/…/SessionService.kt` (two channels) · renderer subscription +
`chat-reducer.ts` fold + `history-rebuild` rule · `mock-only.ts` (row removed) · docs:
`youcoded/docs/native-runtime.md` section, `.claude/rules/harness-tools.md` bullet, ROADMAP.
