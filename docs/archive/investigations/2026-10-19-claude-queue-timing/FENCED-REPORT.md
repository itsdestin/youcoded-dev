---
status: shipped
work_item: 169
---
# Follow-up: retain editable head until an actual tool-batch boundary

> Historical experiment checkpoint, superseded by [FINAL.md](FINAL.md). Original observations below are preserved, not current blockers or implementation instructions. Reproduction commands refer to private archived probes/captures that are **not present in this repository directory**; see FINAL.md for their retained location. For maintained transport tests, start at `youcoded/desktop/test-conpty/test-claude-queue-transport.mjs`.

## Historical verdict

**Feasible in this isolated CLI 2.1.303 experiment for short single-line ASCII messages.** A real `classic.PostToolBatch` hook can remain awaiting a bounded local HTTP response while the terminal accepts a native short text + Enter. An independent observer module sees `prompt.submit` finish `next(e)` successfully **before the fence is released**. The next API request then includes the incoming message in the **same original turn**, before original-task completion. Two successive fenced batches also preserve FIFO with exactly one head handed off at each boundary.

This preserves the approved target: a genuine human `queued_command` projected once as user is acceptable. **The user did not require an ordinary `type:"user"` JSONL row.** The earlier report's literal-row distinction was a format qualification, not a product requirement or reason to block this path.

This is feasibility evidence, **not a production mechanism recommendation**. There is no queue service/UI implementation, no engine change, no fabricated history, no system-context substitute, and no call to `$.prompt.submit` inside any hook.

## Exact flow tested

Separate plugin modules isolate the fence from the observer:

- `batch-fence`: only `classic.PostToolBatch`; calls local `$.http.fetch('/held')`, awaits the response, then returns `next(e)` unchanged. The local server releases automatically at **12 seconds** if the controller fails to answer.
- `batch-observer`: observes session/turn/append events. Its `prompt.submit` hook calls **`await next(e)`**, then posts `{input,result}` to `/accepted`. This is acceptance after native dispatch/queueing, not simply an input-hook entry signal.

The controller waits for `/held`, verifies both actual completion files and that no next API request has escaped, then sends the short head over the owned PTY. It waits up to **7 seconds** for the matching `/accepted`, verifies the fence is still held and API request count is unchanged, and only then releases the HTTP response. No timing sleep decides success. Marker checks, hook signals, acceptance signals, request records and turn identity do.

The first fake API reply contains two real Bash calls, each writing start/completion markers and printing a completion token. For the FIFO case request 2 schedules a second two-tool batch; request 3 writes `original-done`. The short case writes `original-done` from request 2. A final scripted answer completes the original turn. Assertions check receipt before those Writes run, not answer quality.

## Actual results

| Case | API requests | Native acceptance while held | Fence duration | Durable representation |
|---|---:|---|---|---|
| Short baseline | 3 | Head 1 accepted 44 ms after `/held` | Released at 51 ms | One genuine human queued attachment, user-role API text |
| FIFO: first boundary | 4 total | Head 1 accepted at 38 ms | Released at 49 ms | One genuine human queued attachment; head 2 absent from request 2 |
| FIFO: second boundary | same turn | Head 2 accepted at 37 ms | Released at 47 ms | One genuine human queued attachment; request 3 includes heads 1 and 2 |

Measured durations describe these runs only, **not guaranteed deadlines**.

**Short:** original/complete turn `b3b1f0fa-ce5a-47d6-88c5-825817f7ea02`; incoming attachment `536d48ba-4b24-4272-961c-a66666999bde`.

**FIFO:** original/complete turn `60237d96-0b32-4839-aef2-d6245988c723`; head 1 attachment `ac7105d9-c1c4-45e2-8d15-042af7ebb4fc`, head 2 attachment `9b96585c-7a3e-4c15-9954-a5fb0e326a74`. Transcript ordering is head 1 then head 2. Each has `origin.kind:"human"`, `humanTurn:true`, `commandMode:"prompt"`, one corresponding `absorbed_mid_turn` removal. The API retains prior text as history; that is not duplicate delivery.

At short request 2: first pair completed, `originalDone:false`. At FIFO request 2: first pair completed, `originalDone:false`; request 3: both pairs completed, `originalDone:false`. Each case has exactly one original turn start and one answer completion. Incoming `prompt.submit` acceptance events carry that same original turn ID and composer provenance.

Recorded event sequence proves `held < handoff < accepted < released < next API request`: short `[20,21,23,25,29]`, FIFO first `[20,21,23,25,29]`, FIFO second `[34,35,37,39,43]`.

## Isolation and evidence

Same unmodified `/home/destin/.local/share/claude/versions/2.1.303`, helper fake API and authorized sibling-11 read-only node-pty dependency as the original investigation. `fenced/launch.json` retains the exact bwrap command: network/PID namespaces, clear environment, read-only host, only the new `fenced/` directory writable, private `/tmp`, fresh HOME/config/project per case, dummy auth and local API URL. No production app, account credentials, paid inference, SDK or dependency installation was used. CLI debug logs show the two modules loaded into different worker environments; acceptance while the first worker is held demonstrates cross-module reentrancy for these cases.

New evidence is separate from all original results:

- `fenced-probe.mjs`: reproducible narrow harness; plugin bodies embedded for provenance.
- `fenced-check.mjs`: independent assertions over captured requests/events/transcripts.
- `fenced/short/result.json`, `fenced/fifo/result.json`: raw event sequences, full main API messages and captured JSONL contents.
- `fenced/{short,fifo}/{debug.log,terminal.raw,fence/,observer/}`: CLI diagnostics, raw terminal bytes, actual emitted plugin source/types.
- `fenced/tmp/{short,fifo}/`: actual fresh profiles, projects, markers and transcript files from the bind-mounted private `/tmp`.
- `fenced/checked-results.json`: checked identities, order and measured durations.
- `fenced-output.txt`, `fenced/launch.json`: command output and sandbox exit.

One startup-only attempt used the wrong session.start readiness predicate (`source` instead of the actual `isInteractive`). It timed out before any original task was submitted. Preserved separately in `fenced-ready-signal-attempt/` and `fenced-ready-signal-output.txt`; fixed after inspecting the previously captured session-start contract. Then the two requested meaningful cases ran successfully. No long/Unicode third case was attempted: there is no newly verified echo-safe arbitrary-input path to justify it. In total: one readiness-only failed startup plus two real cases.

## Remaining risks / limits

- **Hook deadline/fail-open:** the server's 12-second cap bounds this experiment, not the engine hook's own dispatch budget. Runtime budget exhaustion, cancellation, HTTP failure or module failure can let the engine continue without the fence. This run measured ~47–51 ms holds, not long holds, and did not exercise expiry. Never infer an indefinite queue lock from this evidence.
- **Reentrancy:** separate-module observer/PTY/native dispatch demonstrably works while fence module awaits HTTP. Same-module reentrancy was deliberately not relied on or proved. Different hook chains, settings hooks, reloads, transport contention and future CLI releases are unverified.
- **Acceptance/ownership:** the real queued submission is accepted before fence release. After that point the app no longer exclusively owns an editable unsent head. Crash/disconnect between native acceptance and host acknowledgment requires reconciliation with genuine queue/attachment IDs; this experiment implements no crash protocol or retry logic. A blind retry can duplicate delivery.
- **Composer/input safety:** only short synthetic ASCII lines in a known fresh busy terminal were tested, with atomic text + Enter. This does not validate unguarded CR for production arbitrary text, long/Unicode/multiline/paste input, media, user drafts, permission dialogs, or focus changes. No general echo confirmation mechanism was added or implied.
- **Boundary authority:** a held boundary is safe only until the real hook completes/aborts/expires. An external “held” signal alone cannot authorize late delivery after timeout; stale fences, session/turn identity and Stop races need explicit handling. No concurrent Stop/Clear was tested.
- **FIFO scope:** two heads at two consecutive tool batches worked; this proves neither arbitrary backlog pacing nor boundaries without tools, nested agent calls, or concurrent subagents. Fence currently counts all observed batches in a fresh main-only synthetic run; this is not a robust production classifier.
- App-restart paused restore, Clear keeping app-owned entries paused, and Stop-only-current remain approved requirements, not proven by this experiment.

## Commands and actual output

```text
node --check docs/archive/investigations/2026-10-19-claude-queue-timing/fenced-probe.mjs
(no output; exit 0)

node docs/archive/investigations/2026-10-19-claude-queue-timing/fenced-probe.mjs
sandbox exit=0
```

The corrected run's wrapper printed `exit=0` (`fenced-output.txt`). Both case `error` fields are null. After answer completion the harness terminates only its owned CLI; each exits 143, expected SIGTERM cleanup, not an API/task error.

```text
node docs/archive/investigations/2026-10-19-claude-queue-timing/fenced-check.mjs
```

Actual output includes:

```text
"result": "PASS: fenced same-turn native delivery and two-boundary FIFO verified"
```

Exit 0; full output data persisted in `fenced/checked-results.json`. `git diff --check` returned exit 0 with no output; app checkout `git -C youcoded status --short` returned no output. Existing original result files were not rewritten. No source edits, commits or dependency operations were performed for this follow-up.
