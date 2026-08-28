---
title: Review — Background execution for the native Bash tool (G-1 spec)
date: 2026-08-28
status: applied — every finding folded into the spec 2026-08-28 (B: cap on explicit starts only; C: handed-off runs apply neither cwd nor env, registry unlinks the env file; readCursor kept as lastReadBytes — the same number, named plainly)
reviews: docs/active/specs/2026-08-28-bash-background-execution-design.md
---

# Review of the G-1 background-execution spec

Claims were checked against `youcoded/desktop` at `master` (29658c5b) and the
`feat/bash-background-ui` branch (69d066a3).

## Verdict

The design is sound and the UI is settled. Nothing here calls for re-opening a
decision. What follows is **six inaccuracies**, **eight omissions**, and one
add / one subtract. The two that would bite in production are **stdin** (A) and
**takeover kills the runs** (D).

---

## 1. What checked out

- `DEFAULT_TIMEOUT_MS`/`MAX_TIMEOUT_MS` = 120s/600s (`tools/bash.ts:20-21`); timer
  does `child.kill('SIGKILL')` + exit 124 (`:929-937`); abort does the same (`:942-948`).
- `spawn()` passes **no** `detached` and no `stdio` (`:560-565`) — so the kill really
  does reach only the outer shell. §1 is correct.
- No registry exists; `destroy` (`native-session-host.ts:4003`) and `destroyAll`
  (`:4066`) genuinely never touch a Bash child.
- `queueHostNotice` / `kickIdleDeliveryPass` / `drainDeliveries` / `runNotice` all exist
  and work as described (offsets below).
- Doom-loop signature window is `${toolName}:${JSON.stringify(args)}` with a
  per-profile threshold (`harness-session.ts:2744-2759`) — an exemption is genuinely needed.
- Spill root/naming and the 7-day sweep are real (`spill-paths.ts`, `bash.ts:436`).
- `ShellRunView`, `SHELL_RUN_CHANGED`, the five fixtures and `MOCK_ONLY` are on the
  branch exactly as §6 says.

---

## 2. Inaccuracies and contradictions

**I1 — §3.6 "the existing spill mechanism" is not what §5.3 asks for.**
Today the log stream opens **lazily**, only once the 4,000-char head buffer fills
(`bash.ts:594`, `:653`, `:657`). "From the first byte" is a *change* to that
mechanism, not a reuse of it. §5.3 states it correctly ("open the log stream at
spawn"); §3.6 should not imply it comes free.

**I2 — §5.6's "five surfaces, `ipc-channels.test.ts` parity" over-claims.**
`native:shell-event` is a *push*. The `native:* channel parity` describe block
(`tests/ipc-channels.test.ts:1092-1127`) asserts three files (preload, remote-shim,
SessionService.kt) and lists **request channels only** — it will not cover the push at
all. The comparable push, `specialists:event`, rides four surfaces (ipc-handlers →
preload + `remoteServer.broadcast` → remote-shim); Android only answers requests.
So: `native:kill-shell` = the existing request parity list; `native:shell-event` = the
`specialists:event` push shape, pinned by a `remote-server.test.ts` replay test, not by
`ipc-channels.test.ts`.

**I3 — `injectedMeta` is not a free-form bag, and two files are missing from §9.**
`shared/types.ts:314-322` types it as a **required specialist shape**
(`childId`, `title`, `agentType`, `status`, …). `{ shellId, toolUseId, exitCode,
elapsedMs }` does not fit; the field has to become a union. Separately,
`drainDeliveries` calls `entry.session.runNotice(notices[0])` with **no meta**
(`native-session-host.ts:3364`), so `pendingHostNotices` must change from
`string[]` to `{ text, meta }[]`. Neither `shared/types.ts` nor that queue shape
appears in §9's file list.

**I4 — §5.4's `queueHostNotice(…) + kickIdleDeliveryPass(…)` is a double call.**
`queueHostNotice` already calls `kickIdleDeliveryPass` on its last line
(`native-session-host.ts:1489`). Harmless (it is `isIdle`-guarded) but the plan
should not read as two steps.

**I5 — reusing `queueHostNotice` makes an existing log line false.**
Its liveness guard logs *"a late permission answer arrived after its parent session
was already destroyed"* (`:1482`). Feeding shell completions through it prints that
sentence about a finished build. Either parameterise the message or give shell notices
their own queue. (Workspace rule: never write a misleading message.)

**I6 — §5.5 cannot filter the sentinel "out of the log".**
The log is streamed to disk from spawn. The cwd sentinel prints when the command
*finally* exits — minutes after adoption — by which point it is already appended and
flushed. Filtering is possible on **read** (BashOutput, tail ring, the finished
notice) but not retroactively in the file. Say "filtered on read; the raw log keeps it".

**I7 — line references have drifted 5-10 lines.**
`:1487-1497` → 1480-1489; `:1470-1479` → 1465-1472; `:938-941` → 938-948.
Consider citing symbol names instead — these rot between the spec and the plan.

---

## 3. Omissions

**A — Stdin is never mentioned. This is the important one.**
`spawn` uses default `stdio: 'pipe'`, and nothing ever writes to or ends
`child.stdin`. A command that blocks on input — `git push` hitting a passphrase
prompt, `apt` asking Y/n, `npm login`, a migration asking "are you sure" — blocks
forever. **Today the 10-minute SIGKILL is what ends it.** This design removes that
kill and replaces it with an auto-detach, so the same command now hangs *indefinitely*
in the background, holds one of five slots, produces no finished notice, and cannot be
answered — because D1 put `write_stdin` out of scope. Removing the timeout without
addressing stdin turns a bounded failure into an unbounded one.
Claude Code exempts `sleep` and `git` from auto-background for exactly this reason
(investigation line 174).
*Recommendation:* spawn background/adopted runs with `stdio: ['ignore','pipe','pipe']`
so a stdin read gets EOF and the command fails fast with its own real error, and say so
in one sentence in §5.2. Optionally also exempt `sleep` from auto-detach — backgrounding
a sleep is pure churn.

**B — What happens when auto-detach hits the cap.**
§3.6 covers a sixth *start*. It does not say what happens when five are already running
and a foreground command reaches its time limit: adopt cannot succeed. Fall back to
today's SIGKILL + exit 124? Say so, and say what the model is told.

**C — `persistent_env` + auto-detach.**
§4.1 refuses `persistent_env` *with* `run_in_background`, but says nothing about a
`persistent_env` foreground call that auto-detaches. Node reads and `unlinkSync`s the
env temp file inside `finish()` (`bash.ts:764`); on adopt `finish()` never runs, so the
temp file leaks into `/tmp` permanently and the `__YC_ENVFILE__` line lands in the log.
Either refuse to adopt such calls (keep today's kill) or hand the unlink to the registry.

**D — `destroyNative` fires on more than "the user closed the conversation".**
It is also wired to remote-access **holder takeover** (`ipc-handlers.ts:2218`) and to the
session-exit backstop for crashed workers/takeovers (`:3177`). So picking the same
conversation up on the phone would kill the running build and label it
*"Stopped when the conversation closed"* — which is not what happened. Either add a
`'takeover'` stop reason, or (better) leave the registry alone on the takeover path,
since the conversation is still open, just somewhere else.

**E — The model has no way to list running shells.**
Ids come back only in the start result. After a compaction they are out of context and
unrecoverable; §4.2's "error naming the ids that exist" only helps if the model guesses
an id first. Gemini ships `list_background_processes` for this. Cheap fix in §5 below.

**F — §4.4 dismisses batching on the wrong axis.**
"Notices are short" is not the cost. `drainDeliveries` loops
`await entry.session.runNotice(notices[0])` **once per notice**
(`native-session-host.ts:3360-3372`), and `runNotice` → `beginTurn` is a **full model
turn over the whole conversation**. Three commands finishing while the assistant is busy
is three full turns, not three short strings. Notices ready in the same drain should be
concatenated into one turn.

**G — Wire volume of the tail.**
`ShellRunView.tail` is the whole tail string, and §5.3 resends the view every ~250 ms.
At 200 lines × 4/s × 5 runs that is a real load — and it goes out over the remote-access
WebSocket to a phone on cellular. Recommend the wire tail be only what the card renders
(~20-40 lines) with the 200-line ring kept main-side for the finished notice.

**H — Nothing says what a resumed conversation shows.**
Background runs die at app quit, but the transcript still holds the Bash card, and
`SHELL_RUN_CHANGED` is a live event. After a restart, a card whose last known state was
`running` has no event to correct it. Needs one rule: on history rebuild, any `shellRun`
with no live registry entry renders `stopped / app-quit`.

**I (minor) — compaction.** Worth one sentence that runs survive a compact and their
notices arrive afterward, since the harness clears other per-session state on compaction.

**J (minor) — no ROADMAP ids.** §8 promises follow-ups (write_stdin, a running-commands
list, `watch_patterns`) but names no entries. Workspace convention is to file them the
same session.

---

## 4. Add one, subtract one

**Add: the stdin decision (A).** One line in §4.1 and one in §5.2. It is the only
omission that converts a today-bounded failure into a permanent, unanswerable hang,
and D1 deliberately removed the escape hatch that would have covered it.

**Subtract: §4.2's 3-strike counter *and* keep the doom-loop exemption.**
The counter is a second, bespoke anti-loop mechanism layered on top of an exemption
from the first one, tuned by a magic number — and it fires **only when output is
empty**. The realistic runaway is the opposite case: polling a chatty build returns new
output on every call, so the counter never trips and the doom loop no longer applies.
It costs a test, a per-turn per-id counter, and a paragraph, and misses the case it
exists for.
*Replace with:* a flat cap of N `BashOutput` calls per turn regardless of result.
One number, one test, strictly more coverage, and it reads naturally in the pushback
text ("you have read this log N times this turn; the finished notice will arrive").

---

## 5. Simplifications

1. **Make `shell_id` optional on `BashOutput`.** Omitted = list every run in this
   conversation with status and elapsed time. This closes omission E without a third
   tool, and it is the natural place a model already looks.
2. **Drop `readCursor` from the registry.** The log file's byte length at last read
   *is* the cursor, and the path is already tracked — one less field to keep consistent
   with a stream that is writing underneath it.
3. **§4.5 (small-model tier) can be one sentence.** "Both tools ship on every tier;
   a model that never calls them still gets the finished notice." The rest restates
   the existing `shortDescription` mechanism.
4. **§5.2's foreground change deserves its own line in §7's test list as a
   *behaviour* change, not a fix.** Switching foreground abort from immediate
   `SIGKILL` to `SIGTERM → SIGKILL after 2s` slows the actual kill; the spec should
   state that `execute` still resolves immediately (the existing comment at
   `bash.ts:938-941` explains why it must).

---

## 6. Positioning

The doc references the investigation correctly and reuses the right prior art
(specialists' background delivery, the spill contract, the bounds/moreHint vocabulary).
Two positioning gaps: it never says which parts are **new mechanism** vs **reuse**
(I1 is the symptom), and it never names the ROADMAP entries for the deferred items (J).
