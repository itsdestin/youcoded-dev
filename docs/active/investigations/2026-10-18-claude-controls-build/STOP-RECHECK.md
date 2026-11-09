# Controlled recheck of running-tool Stop

status: active

**Subsequent owner decision:** “we'll just keep esc-stop for now.” Implemented: current chat/keyboard/phone callers send one raw Escape; the shared channel declines old clients' mods-Stop requests before dispatch so they use their existing Escape fallback. Direct text and model/clear/compact remain enabled; `@` messages retain PTY expansion. Structured Stop improvements are deferred, not a current app behavior.

## Question

Could the real Haiku result have been a measurement/timing/model-choice error? User requested a double-check, not an unapproved change to Stop behavior.

## Result

**The difference reproduced deterministically.** Two fresh runs, each with a 2×2 cross-over of prompt transport and cancellation method:

| Submit | Cancel | Actual subprocess finished | Follow-on Write executed | Repeats |
|---|---|---|---|---|
| Mods | `$.turn.abort` via production bridge | yes | yes | 2/2 |
| Mods | literal terminal Escape | no | no | 2/2 |
| PTY | `$.turn.abort` via production bridge | yes | yes | 2/2 |
| PTY | literal terminal Escape | no | no | 2/2 |

Across the eight cases: **4/4 direct aborts allowed continuation; 0/4 Escapes did.** This isolates the cancellation method rather than how the prompt was submitted. It does not establish behavior for every tool or CLI version.

## Why this is not the original measurement ambiguity

- Real unmodified **Claude Code 2.1.303** and actual compiled production bridge, not a mocked abort implementation.
- A local scripted API emits the exact same Bash tool call. No real model variability, credentials, account calls or paid usage. Bubblewrap creates a new network namespace with only the local API.
- The subprocess first creates a `started` file, then sleeps eight seconds, then writes `finished`.
- The controller waits for the **actual started file** and a main-turn identity before cancelling. Measured start-to-cancel gaps were **2.8–16.1 ms**, well before the eight-second work completes or a normal background timeout.
- After cancellation, the harness observes for fourteen seconds, longer than the subprocess deadline. It checks physical `finished` and `followup` files and API request history, not just spinners or textual acknowledgements.
- The scripted model issues the follow-on Write only when `finished` actually exists. Direct-abort cases made three main API requests; Escape cases made one.
- The control plugin is loaded in every arm so turn observation is consistent; raw-submit/raw-Escape arms leave its control route idle. Unlike the earlier real A/B, this cross-over is specifically about cancellation method, not entire mod attachment.
- Both arms use explicit default permission mode and allow the harmless Bash/Write fixture tools. Original real Haiku run used Auto. The first automatic-permission fixture failed to start its command and is excluded as an invalid fixture—not counted as evidence for either cancellation outcome.

## Evidence

Harness: `recheck-tool-stop.mjs`.

Successful raw outputs: `/tmp/cc-stop-recheck-VsSjMF` and `/tmp/cc-stop-recheck-bF4kYk`; their summaries/events and logs are retained under this investigation's `stop-recheck/`. Every arm records exact command, start/cancel timestamps, API requests, bridge states and receipt results. Owned PTYs and API servers are closed; sandbox process teardown removes any surviving child processes. No production instance was touched.

## Consequence

The user-facing Stop semantics are genuinely different on the tested CLI. A resolved direct abort and an idle UI do not prove running shell work was cancelled. The evidence supports keeping this as a merge blocker. It does **not** justify guessing the upstream implementation cause or adding a blind fallback after ambiguous dispatch.

The smallest likely mitigation is to retain the existing deliberate Escape Stop path while investigating safe structured cancellation; that production behavior change has not been made in this recheck.

## Separate requested fix: @file

`sendToClaudeCode` now conservatively sends text containing any `@` through the existing PTY/composer route **before direct dispatch**, so Claude retains its native mention expansion. Quoted/Unicode/multiple mentions are covered; email addresses safely take the same route instead of duplicating upstream grammar. No automatic retry of an uncertain direct send was added.

Four regression cases failed before the fix; the full sixteen-case renderer control suite passed after. Fresh static review found no Important issues. Full `verify.sh --full` and Linux build `1.3.1-cc-controls.3` passed. The user's already-running `.2` test copy was not overwritten or restarted.

Other follow-ups remain on remote-master work items #11 and #12 (verified there, not merely in the older shared checkout): first-run cards, initial Auto-mode display, bounded closed-session retention, structured live facts, media/interaction parity, recovery and platform testing.
