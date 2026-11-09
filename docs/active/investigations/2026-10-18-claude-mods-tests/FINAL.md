# Claude Code reliability — free-test sweep verdict

status: active

**Later real-subscription update:** after a quota-blocked first attempt and the user's credit top-up, the two remaining authorized Haiku prompts succeeded through an authenticated inline mod, including same-ID resume and saved-history checks. See `SUBSCRIPTION-CREDITS.md`. The signed-in test profile was removed. This document below is the free-test sweep verdict; broader real-subscription/platform/app-integration gates remain, and no app changes are approved.

This is the consolidated investigation verdict after the user-approved free-test sweep. `RESULTS.md` preserves the earlier running log; this file adds the lifecycle, scoped-extension, deployment and compatibility batches without rewriting their evidence.

**Bottom line:** a targeted, subscription-preserving CLI integration is worth pursuing. The evidence does **not** justify replacing every Claude integration with mods or claiming universal reliability. No app implementation has been approved or made.

## What was exercised

Actual unmodified Linux x64 Claude Code **2.1.302**, plus a narrower sample on the locally available **2.1.300** binary. All model replies came from a local scripted API using dummy authentication. Runtime probes used fresh HOME/config/XDG directories, disconnected bubblewrap network/PID namespaces and a read-only host filesystem with only their own temporary/evidence directories writable. No SDK, real credentials, subscription requests or package installation.

2.1.300 matches the Android version pin, **not the Android runtime/platform**. These runs establish CLI behavior under controlled replies, not model quality, subscription entitlements, billing or production-app integration.

Nine captured-evidence checkers returned exit 0 in the final verification pass. Those checks validate successes, negative results and preserved failed attempts; a passing checker does not mean every candidate feature works. See `evidence/final-verification/checks.log`. Assertion counts include preservation/process checks and are not independent test-scenario counts.

## Numbered decisions from the deck

| # | Candidate | Verdict from this sweep |
|---|---|---|
| 1 | Direct message sending | **Text viable; images blocked on the tested path.** Repeated/multiline Unicode, queued sends and interruption worked. Image metadata was accepted but transported zero image blocks. No documented user-tier pixel-import path established. |
| 2 | Direct conversation controls | **Partially viable.** `/model`, `/clear`, `/compact`, `/effort low`, `/rename` and addressed abort worked. Some settings persist as defaults. Changing `permissionMode` default is not proof of active-session mode enforcement. |
| 3 | Structured approvals/questions | **Ordinary approvals and replacement questions viable; plans not equivalent.** Actual ask→allow/deny worked. Single/multiple/custom/freeform question answers reached the model and saved records. ExitPlanMode allow left the native menu pending; a synthetic success could tell the model “approved” while the engine remained in plan mode. |
| 4 | Replace live file-watching | **Held, not implemented.** Observation-only analysis is in `LIVE-HISTORY.md`. Current history/parser compatibility still matters even if control calls work. |
| 5 | Direct status/usage | **Partially covered.** Real turn start/end/abort and known scripted usage totals matched without any app statusline. Account rate limits were unavailable, not zero. Full waiting/background/agent and custom-statusline behavior remain open. |
| 6 | Detect failure/recover safely | **Mechanisms partially proven.** Explicit errors/timeout/malformed replies denied; 36-second bounded polling worked; cancellation rejected a late approval; a service restart accepted a distinct new request. Loaded/empty/absent mods proved handshake readiness must be separate. Worker-thread loss is not proven safe. |
| 7 | Official plugin management | **Strong candidate.** Actual install/list/disable/enable/remove/update and project/local scope handling worked offline. Scoped uninstall preserved another install's cache. Concurrent/interrupted installation and hot update remain unverified. |
| 8 | Effective discovery | **Partial.** Actual command/config lists, official scoped records, MCP discovery and installed-mod handshake worked. Lists include internal commands and are not automatically a safe app menu. Complete skills/project-change coverage remains open. |
| 9 | Session-scoped tools/config | **Strong candidate in this environment.** Actual session MCP echo call worked alongside an existing global server, with no global session-server residue. A missing server was absent from tools while chat continued, but an obvious user-facing warning was not established. |
| 10 | Session-only app instructions | **Viable with important sequencing rules.** Context reached the model without changing original user/history text or global instructions. Same-mod prompt.submit interception was skipped; documented prompt.context or a separate observer worked. Eager context caching defeated the initial fixture and required loading context at the right time. |
| 11 | Conversation records/cross-engine continuity | **Separate exploration #164.** No cross-engine conversion or shared-identity implementation performed. |
| 12 | Version/platform compatibility checks | **Small two-build sample, not certification.** Key controls/ordinary approvals worked on Linux 2.1.300 and 2.1.302. Ten inspected API signatures matched, but other generated declarations differed. Other operating systems and actual Android remain untested. |
| 13 | Hook deployment hardening | **Three problems reproduced in unchanged installer functions.** See below. No fixes made. |
| 14 | Agent SDK | **Rejected by user; excluded throughout.** |

## Concrete risks caught by testing

### Working controls are not drop-in app replacements

Replaying the actual synthetic transcripts through the unchanged app parser preserved repeated and Unicode text, but the mod-issued `/model` row emitted no command event because it lacked `promptId`. The mod-issued `/compact` initially became ordinary user text rather than a slash-command event. Its summary was recognized. This is parser-level evidence, not a claimed production UI reproduction.

### Accepted is not necessarily durable

An exact test CLI was killed while its first Write awaited approval. The first attempt had persisted only metadata; supported resume failed with **“No conversation found.”** A follow-up waited for the actual tool row to reach disk, then crashed during the wait. Same-ID resume succeeded, old late allow could not affect the new request, and user prompts were not duplicated. Claude explicitly marked the old tool interrupted with unknown outcome.

A bridge must distinguish accepted/queued/started from durably resumable; otherwise it can promise recovery it cannot deliver.

### Failure handling is not an unconditional safety boundary

The actual HTTP approval ceiling was **30 seconds**. Explicit catch-deny prevented writes on timeout/disconnect; three bounded 12-second pending replies followed by explicit allow kept an approval open for **36 seconds** without consuming the hook's own execution budget. This is not two-hour or indefinite-wait proof.

If both the gate and its catch throw, normal Claude policy resumes: a pre-approved Write ran, while an ordinary ask stayed pending. That is not a global permission bypass, but neither is it a fail-closed mod guarantee. Documented reload waited until the turn finished, so it did not test live worker removal.

### Current installer defects, not upstream speculation

Using the unchanged exported installer functions against disposable copies:

1. **Write-guard command used the volatile source directory.** Moving that directory broke the referenced path even though the stable staged script existed.
2. **A missing statusline script was not repaired** when the version stamp and relay.js still existed.
3. **Unrelated user hooks named relay.js/statusline.sh were overwritten** by basename matching. A differently named notify.sh was preserved.

These are reproduction findings against app source `bc9e43752`, not fixes and not claims about newer unrelated branches. No hook command was executed by this deployment check.

## Recommended implementation order — not approval

1. Official plugin management and narrowly scoped hook-deployment fixes.
2. Direct controls/text submission, preserving explicit image/plan fallback and normalizing command/history effects.
3. Structured usage, session-only context and per-session app tools, with explicit readiness/failure reporting.
4. Ordinary approvals and custom question UI only after production-bridge request identity, cancellation, policy and multi-client handling are designed/tested.

Do not replace history storage or engine plan approval as collateral work. Keep #164 separate. Do not make a disappearing mod the only enforcement mechanism for mandatory approval.

## Genuine remaining gates

- **User authorization for a small real-subscription smoke test** through Anthropic's own sign-in flow, with an explicit request/quota limit and isolated profile. No credential extraction or copying is assumed.
- **Target-platform validation** on Windows, macOS and the Android runtime; testing their version number on Linux is insufficient.
- **Implementation/design approval** for a narrow first change. Tests alone authorize neither app edits nor shipping.
- Image-byte transport, genuine external plan-mode transition, worker-thread-loss guarantees and complex/multi-client recovery remain unresolved. They must be retained as limitations or receive focused follow-up work—not silently treated as passing.

## Evidence map

- Core controls: `evidence/REPORT.md`, `controls.json`, generated declarations.
- Failure/images: `evidence/failure-attachment-report.md`.
- Approval waits: `evidence/approval-report.md`.
- Effort/rename/core ask: `evidence/control-followup/REPORT.md`.
- Questions/plans/late replies: `evidence/interaction-followup/REPORT.md`.
- Timeout/polling/service recovery/resume/readiness: `evidence/lifecycle-batch/REPORT.md`.
- Tools/context/usage/installed mod: `evidence/scoped-audit/REPORT.md`.
- Two versions/pending crash/catch failure: `evidence/compat-crash-followup/REPORT.md`.
- Hook deployment: `evidence/deployment/results.json`, `probe/deployment-check.mjs`.
- Official plugin lifecycle/update/scopes: `plugin-management/results.json`, `extended-results.json`.
- Final checker output: `evidence/final-verification/checks.log`.

Runtime probes stopped their exact children and servers. Temporary synthetic profiles are retained as evidence, not active services. No app source, installed personal plugin, real-profile setting or credential was changed by the experiments.
