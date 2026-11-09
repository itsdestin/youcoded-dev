# Question, plan and pending-request investigation

Actual installed, unmodified Claude Code **2.1.302**, scripted localhost model and explicitly synthetic user responses. No subscription/model calls, SDK, installs, rollout overrides or product implementation.

## Results

- **AskUserQuestion permission allow is not an answer.** Core returned ask; external allow was delivered; the actual native question menu remained pending for the bounded observation, with no tool result or completed turn.
- **Replacing the interaction works.** A documented `tool.call` interceptor returned the current built-in result shape only after receiving an explicit synthetic localhost answer. Single-select `Blue`, multi-select `Red, Blue`, and custom Unicode/multiline text were mapped into exact model-facing answer text and persisted in the JSONL tool record. This replaces the interaction; it does **not** exercise native dialog submission. A separate `response` test maps to exactly `The user responded: SYNTHETIC explicit freeform response`. When both `answers` and `response` are returned, the record retains both but model text uses `response`, so the initial combined test did not establish model-visible structured answers; the follow-up separated them. Input declarations have no `kind:text`, so custom typed text uses the documented answer-string shape, not an invented native textbox argument. External deny produced the actual AskUserQuestion error result.
- **ExitPlanMode allow does not finish approval.** Actual EnterPlanMode ran; the fake model used the engine-advertised plan path, wrote and read the tiny plan with actual built-in tools. External allow reached ExitPlanMode, but the native “Ready to code?” approval menu remained pending. No terminal keys were sent.
- **ExitPlanMode deny works after actual entry**, retaining plan-mode restrictions. The first batch mistakenly denied EnterPlanMode itself; this is retained, not counted as exit-denial coverage. The follow-up allowed entry and denied ExitPlanMode.
- **Replacement is not engine plan approval.** Returning a valid ExitPlanMode result without `next` made the built-in mapper tell the model “User has approved your plan. You can now start coding.” Nevertheless, the subsequent ordinary Write check said it could not write “while in plan mode.” A safety veto prevented any post-plan write. The minimal shape omitted optional `filePath`, so its mapper also printed `undefined`; no guessed private fields were added. The engine runtime mode is evidenced by its plan-mode indicator, actual entry result, plan-path policy and subsequent Write policy. `$.config.list` reports the **default** mode (`default`) and is not a runtime-mode getter. Session identity stayed unchanged.
- **Addressed cancellation rejects stale approval.** While an ordinary core-ask Write awaited the service, `turn.abort` addressed its actual `turn.start` ID. A new turn began with its own pending Write. The old service attempted late allow while the new request was pending; the old HTTP response was already disconnected. New request received its own deny. Neither file exists; both model-facing tool results are errors, including the interruption result.
- **Reload is deferred, not verified unload.** Documented `reload-plugins` was requested while Write awaited approval, but returned only after the original allowed Write and turn completed. Original harmless file bytes and model success were verified. This does not demonstrate removing a live pending interceptor, fail-closed unload, hot-swap safety or a production bridge; mid-flight unload/removal remains **unverified**. No crash/loop was induced.

## Commands and evidence

From the session work root:

```sh
node --check docs/active/investigations/2026-10-18-claude-mods-tests/probe/interaction-probe.mjs
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/interaction-probe.mjs --launch
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/interaction-probe.mjs --launch interaction-batch2
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/interaction-probe.mjs --launch interaction-followup
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/interaction-check.mjs
```

Initial launch exited 1 on contract validation: helpers accepting `$` must be top-level; corrected without weakening validation. Main and follow-up launches exited 0. **11 actual sessions, 32 dummy-auth localhost model requests.** Checker output: `PASS 3699 read-only assertions; 11 actual CLI sessions; 32 localhost dummy-auth model requests.` Assertion count includes process/preservation scans and may vary with unrelated process count. It validates expected blocked/unsupported outcomes, not just successful method returns.

`evidence/interaction-batch/launch.json` retains initial refusal. `interaction-batch2/{launch.json,*.json,*-debug.log}` holds eight original cases; `interaction-followup/` holds three focused follow-ups. Per-case JSON contains commands, allowlisted environment, binary hash, request bodies/counts, explicit synthetic service responses/timing, exact mapped model results, saved JSONL records, plan/file bytes, runtime output, identity and child/server exits.

All CLI/services ran inside `bwrap --clearenv --unshare-net --unshare-pid`, host read-only, only each new `/tmp/cc-interaction-*` sandbox and dedicated evidence writable. Fresh HOME/config/XDG, dummy localhost auth only. Prior probe/evidence hashes matched before/after each launch; older immutable evidence still matches. Exact children stopped (CLI exit 129 after deliberate cleanup), servers closed, PID namespace exited, **no owned sandbox processes remain**. No app code, parent lifecycle docs, cards, real profile or installed plugin changed by this investigation.
