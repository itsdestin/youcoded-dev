---
status: complete
---
# Welcome back: real dev-runtime measurements

**Historical measurements, completed 2026-10-18:** the tools-readiness follow-up was implemented and verified at the snapshots recorded below. The 16.73-second stalled-connector result is a before-fix measurement. Subsequent safety fixes, integration with newer master and verified publication are recorded in `docs/archive/plans/welcome-back-tools-readiness.md`; these historical timings do not certify that later combined tree. App PR #662 subsequently merged on 2026-10-20.

## Scope and safety

Requested: measure actual multi-session recovery, including background dev servers, and identify waits above a comfortable five-second ceiling.

All runtime tests use `bash scripts/run-dev.sh`, offset 300, profile `recovery-lab`, private HOME below this session's `scratch/recovery-lab/`. No production app attachment, mutation, restart, or process signal. Saved real conversations are read-only sources: copies get new session IDs, private cwd/store paths, and a local-only model binding. Real conversation contents are not printed in this report. Native test turns use a deterministic loopback endpoint; the final hands-on profile uses only a non-secret fixture key for that endpoint. The actual Claude CLI tests receive no prompt and request no model response. No paid model evaluation was run, and test auth snapshots contain no refresh token and are removed after shutdown.

## Clocks

- **Welcome back dismissal:** captured click timestamp to the DOM mutation removing the Welcome back heading.
- **First visible history:** captured click to the first timeline entry in the visible chat. This is not proof every hidden chat has rendered.
- **Session announcements:** actual `session:created` pushes, not synthetic callbacks; these precede completion of native initialization.
- Renderer long tasks and actual main/renderer CPU profiles bracket the click and its resulting work. Profiling and the screenshot at the end are not included in the dismissal clock, but can extend the sampler's total duration.

The initial sampler counted any `.chat-scroll .timeline-entry`, not explicitly the active pane. Its history clock is therefore a **first-DOM-history signal**, not a guaranteed first-visible-history clock in the older all-views-mounted baseline. It also read `document.body.innerText` after dismissal for diagnostic text, which can force layout; total post-dismiss profile work is consequently not an uncontaminated app-only measurement. Dismissal timestamps were recorded before that diagnostic read. The sampler has been corrected to require Welcome back gone and a timeline outside `[aria-hidden="true"]`, wait for that condition explicitly, and avoid `body.innerText` entirely. Corrected repeat measurements are recorded below. No app source changed between those corrected repeats and final verification.

## Measurements observed so far

Each row below is one measured run, not a median or a universal guarantee. Files are private local scratch output.

| Run | Configuration | Welcome back dismissed | First history | Raw result |
|---|---|---:|---:|---|
| First valid baseline | 16 native saved chats, 4 × 400 turns + 12 × 20 turns, full conversation-store records; parallel-start fix only | 7,438.9 ms | 10,142.5 ms | `result-1792296958414.json` |
| Repeated baseline with CPU profiles | Same histories, new process, warmer code/filesystem caches | 1,744.0 ms | 2,572.5 ms | `result-1792297085677.json` |
| Stable-focus fix only | Same saved histories | 1,643.6 ms | 2,661.5 ms | `result-1792297335347.json` |
| Stable focus + deferred unvisited views | Same saved histories | 1,207.5 ms | 2,083.6 ms | `result-1792297484461.json` |
| Actual background-server crash recovery | 16 saved chats; 4 real HTTP servers launched through native Bash, then abrupt isolated-app termination and server death | 1,183.9 ms | 2,025.5 ms | `result-1792297811216.json` |
| Copies of real root conversations | 16 actual saved histories, 61.61 MiB total, 31,040 events, largest 11.18 MiB | 1,652.5 ms | 1,652.5 ms | `result-1792338036371.json` |

Do not attribute the entire 7.44 → 1.21 second difference to code: cache state and first-use dev compilation differ. The repeat baseline versus fixed runs is the closer comparison.

### Final corrected user-visible repeat samples

These samples filter the active pane and exclude the former whole-body text-read probe. All 16 sessions opened in each run.

| Configuration | Repeat | Welcome back dismissed | First actually visible history | Raw result |
|---|---:|---:|---:|---|
| 16 copied real root histories, 61.61 MiB | 1 | 1,512.9 ms | 1,669.6 ms | `result-1792338935485.json` |
| Same real-history snapshot | 2 | 1,525.3 ms | 1,525.5 ms | `result-1792338964820.json` |
| 16 saved chats including the 4 actual background-server histories | 1 | 1,226.3 ms | 2,065.3 ms | `result-1792339032783.json` |
| Same server-history snapshot | 2 | 1,232.8 ms | 2,099.8 ms | `result-1792339062832.json` |
| Same 16 real histories + a stalled enabled local MCP connector | 1 | **16,730.2 ms** | **16,730.4 ms** | `result-1792338864483.json` |
| Mixed: 13 copied native histories + 3 actual Claude Code CLI resumes | 1 | 2,360.1 ms | 2,360.2 ms | `result-1792341245108.json` |
| Same mixed snapshot | 2 | 1,939.5 ms | 2,386.4 ms | `result-1792341367775.json` |
| Same mixed snapshot; explicit read-only sandbox probe | 3 | 1,875.9 ms | 2,522.8 ms | `result-1792349024660.json` |

The copied real histories retained their original event/user/assistant counts across recovery (`real-integrity.json`). The server snapshot again passed the full pre-crash UUID/count check after both repeats (`integrity-final.json`). This is a small sample on this machine, not a statistical p95 or an unconditional five-second bound.

### Actual Claude Code coverage

The installed recovery snapshot was inspected for provider counts only: six native and three Claude Code entries. The mixed test therefore covers the actual Claude CLI as well as the native host: 13 native root-history copies plus three copies of those Claude Code transcripts, **164.37 MiB total**. The three Claude histories alone total 104.94 MiB and contain 73 historical background Bash calls and 99 command-text matches for common dev-server launchers; these are historical call/mention counts, not 99 running servers.

The real installed Claude Code binary (2.1.302) ran in a private profile through `bwrap`: the filesystem is read-only except the disposable HOME, with an explicit owned outside-HOME write canary refused before execution. Only an unexpired access token was copied, with the refresh token deliberately omitted so the test cannot rotate the live account's token; temporary auth was removed after shutdown. No prompt was sent and no inference/evaluation was requested.

Actual `SessionStart` hooks with `source: resume` arrived for all three CLI processes in every run:
- Run 1: 1,245.8 / 1,321.4 / 1,453.5 ms after click.
- Run 2: 1,356.8 / 1,357.7 / 1,358.2 ms.
- Run 3: 1,229.3 / 1,232.9 / 1,233.0 ms.

These are CLI initialization hooks, not measured first-model-response latency. In the third run, SHA-256 checks confirmed all three pre-existing transcript byte prefixes were unchanged and no new rows were appended. An earlier run added five metadata-only rows to one copy (title/mode/permission/ATIS/PR-link), not user/assistant messages; size equality alone was not treated as content-integrity proof. Isolation/integrity evidence: `claude-integrity-verified.json`; all three outside-write probes were refused, with no canary file created. No original history or credential file was written.

### Concrete renderer costs

In the repeated baseline's 7.65-second main-process profile, approximately 7.11 seconds were idle. The window profile, over the same interval, spent approximately 6.39 seconds in React synchronous root work. App-local inclusive samples included AppInner (~805 ms), scroll-stick callbacks (~478 ms), ChatView work, session-strip rebuilding, Markdown/filepath tokens and controls. The first valid baseline accumulated 17.1 seconds of renderer long tasks over its longer observation; the warmed baseline accumulated 6.03 seconds.

Two proven behavior defects were fixed with red/green tests:

1. Every `session:created` automatically selected the new chat during bulk restore. The App regression observed `wb-new-1` replaced by `wb-new-2`; recovery now keeps one selected chat while independent sessions arrive.
2. Every unseen ChatView mounted its subscriptions, hooks and controls, and eventually rendered the history loaded into its store. An outer deferred wrapper now constructs the inner view only on first visibility, then retains visited views so local state/drafts survive switching away.

Backend admission, per-conversation writer locks, transcript persistence, and first-page loading remain unchanged.

### Actual background-server evidence

The local deterministic provider issued four real Bash calls with `run_in_background: true`. The app emitted running shell records; all four HTTP health checks succeeded (PIDs 1618230, 1618240, 1618247, 1618253; private ports recorded in `server-launch.json`). The guarded crash script checked the Electron executable path, HOME and profile before signalling only the isolated main process. Private test-launch cleanup subsequently terminated the servers, modeling power loss rather than an orphan surviving a crash.

After reopening, all 16 sessions recovered. The integrity check compared all pre-crash UUIDs and user/assistant event counts: no missing UUIDs, no duplicated UUIDs, unchanged message counts. Historical commands were not re-executed to resume the chats. This does not prove an actual OS power cut or disk-write durability.

The server processes also inherited the dev app's Chromium-debugger listener. That was observed with `ss`, not inferred from source. The bounded investigation reproduced ordinary POSIX inheritance when a test descriptor's CLOEXEC flag was deliberately cleared; the negative control with CLOEXEC set did not leak. A generic `spawn` override is not a justified fix: it would change launch/error/stdio/Android semantics, and there is no established pre-exec hook in the current synchronous API. No production spawn code was changed. The diagnostic patch and controls are retained under `scratch/descriptor-inheritance-diagnostic/`, not as an intentionally failing suite test. All 307 original scoped shell/tool tests passed (3 platform skips). Inheritance of any particular packaged-app lock has not been established, and the dev-only listener finding is not proven to explain Destin's original slowdown. Owner-side descriptor flags or an explicit close-fds policy are a separate design question, not an unverified recovery patch.

## Former blocking wait above five seconds (before the readiness follow-up)

A deliberately enabled local MCP connector accepted stdio but never completed its handshake. Resuming one real copied conversation through the actual backend took **15,062.6 ms** (`stalled-connector.json`). At this before-fix snapshot, the native host awaited MCP acquisition before wiring the session; the client had a 15-second connection timeout. Since Welcome back still awaits every selected startup result, this path can exceed the requested ceiling even after renderer fixes. The corrected full Welcome back test measured **16,730.2 ms** to dismissal and **16,730.4 ms** to visible history with the stalled connector enabled. The installed native runtime's registry file was absent when inspected read-only, so this is a deliberately configured failure case, not evidence that Destin currently has such a native connector enabled.

This is separate from a native background Bash dev server: those are not automatically restarted or awaited during cold recovery. A hard guarantee that the welcome screen never waits five seconds on external dependencies requires separating history/tab availability from optional tool-connection readiness, without pretending an uninitialized tool set is ready or weakening admission. The measurements in this section preceded that behavioral change; its implementation and new measurements are below.

## Invalid setup trials (not performance results)

- Initial runs were blocked by an incorrectly seeded first-run profile path.
- Native JSONL-only fixtures lacked the portable model reference in the conversation-store record, so Resume all correctly left rows needing a model rather than launching them. The sampler's timeout on those trials is not a measured startup delay.
- The first real-history selection accidentally included specialist child sessions, which the root resume path correctly rejects. That trial is excluded. The valid selection filters `sessionKind`/`parentSessionId` before choosing root histories.
- Tool-launch preparation first encountered isolated keychain unavailability, then a context-window mismatch on a custom model. The successful server test used keyless local turns with a clear boundary in the disposable fixture; these setup failures are not recovery timings.

## Limits and remaining checks

- Real backend/renderer and actual Claude Code CLI resumes were measured. Native provider metadata/tool turns used a local deterministic endpoint; no cloud inference or first-response latency was measured.
- No drop-caches operation against Destin's working machine: no claim of OS-cold disk performance.
- Stock dev appearance, not every community theme, GPU configuration, or heavily loaded machine.
- Fresh renderer review found an active-terminal Preview-routing regression in the first lazy wrapper; a red/green event-routing test pinned it. The wrapper now activates on `visible || sessionActive`, preserving terminal routing and retaining visited views. Re-review found no outstanding actionable issues.
- Final `bash scripts/verify.sh <app-worktree>` exited 0: **2,491 tests passed, 36 skipped**, types/test types, knip, lint, design lint, ast-grep, all **391** named screen checks and journeys passed. Logs: `/tmp/recovery-runtime-verified.log`, `scratch/verify-20261018-090037-1773101/`.
- The two test dev instances, all test server processes and the local deterministic provider were stopped. No app code was committed, installed or shipped.

## Tools-readiness follow-up: implementation and current measurements

Destin authorized the conservative follow-up: history and editable drafts become available without awaiting optional MCP handshakes; sending remains blocked until connections settle or the user explicitly continues without the failed tools. There is no early-message queue, silent tool omission, or automatic draft submission. Destin separately approved the same exact-attempt Retry/Continue choices on paired phones and remote browsers.

### Current samples

All samples below use the final verified app source. They measure the actual Welcome back button and visible history, not a backend-only proxy. The first-switch clock starts at the session pill's pointer-down and ends when its newly visible chat contains history.

| Configuration | Welcome back dismissed | First visible history | First switch | Raw result |
|---|---:|---:|---:|---|
| 16 real-history copies + stalled connector; repeat 2 | 1,680.6 ms | 1,680.7 ms | 279.7 ms | `result-1792360163530.json` |
| Same snapshot; repeat 3 | 1,585.1 ms | 1,585.2 ms | 275.0 ms | `result-1792360209687.json` |
| 16 copies + first-attempt-stalled retryable fixture; full corrected safety check | 1,563.5 ms | 1,563.5 ms | 260.3 ms | `result-1792361500535.json` |
| 13 native copies + 3 actual confined Claude CLI resumes; repeat 1 | 2,247.9 ms | 2,248.1 ms | 428.4 ms | `result-1792360309763.json` |
| Same mixed snapshot; repeat 2 | 1,822.7 ms | 2,391.2 ms | 413.4 ms | `result-1792360370090.json` |

These small samples meet the requested five-second threshold, including the deliberately stalled connector; they are not a p95, OS-cold-disk result, or universal bound. The connector itself can still take its 15-second timeout; that no longer holds history behind Welcome back. The previous 16,730.2 ms blocking sample is retained above as the before-fix failure case.

### Runtime safety checks

The corrected full check verified all 16 failed startup facts, disabled Send while connecting, retained draft text after Enter and explicit Continue, rejected stale Continue consent, and observed zero model-endpoint requests without an explicit send. A pending Retry closed in **52.6 ms** and the same chat reopened in **180.3 ms**, leaving 16 live sessions and a working renderer. The final demo connector intentionally stalls its first connection, then completes a real local MCP handshake on explicit Retry.

All three actual Claude CLI `SessionStart(source: resume)` hooks arrived in both mixed runs, by **1,166.1 ms** and **1,142.4 ms** respectively. Their filesystem remained read-only outside the private HOME; the outside-write canary is absent. Only an access token was copied, no refresh token; the temporary auth file is absent after testing.

SHA-256 prefix checks passed for **35 copied transcript files / 240,214,447 original bytes**. The timing runs appended no user, assistant, tool, compaction, metadata, or torn-tail records to those original copies. A separate fresh scratch chat then successfully sent one explicit composer message and displayed the scripted loopback reply; it was closed afterward, leaving the 16 copied sessions. This is functional transport testing, not real model-quality evaluation.

### Review and verification

- Fresh backend review findings were reproduced and fixed: report delivery after close/replacement, preserving healthy MCP leases during Retry, and both deferred-registry retry-generation orderings.
- Fresh renderer review findings were fixed: retaining a refusal preserves error/park/prefill status, keeps text/files recoverable, and does not let older identical history consume a directly refused draft. Pending Send-again requests are deduplicated. No actionable findings remain within the reviewed scope.
- **Final `verify.sh` passed:** 7,954 selected tests passed, 36 skipped; source/test types, protected line budgets, knip, lint, design lint, ast-grep, screen checks and all 7 journeys passed. Logs: `/tmp/startup-final-verified.log`, `scratch/verify-20261018-143859-3350331/`. No ceilings were raised.
- **Android:** the final shared backend compiled and packaged successfully; rerun shell test XML totals **108 tests, zero failures/errors/skips**. Full native-runtime/APK packaging remains unverified here because its redistribution gate requires an unavailable `apk version -t` equivalent. Log: `/tmp/startup-android-final-backend-unit.log`.
- **UI:** 24 actual renderer captures across four themes at desktop/390px passed their capture checks; fresh visual review found no concrete layout blocker. Desktop Retry/Continue probes preserved drafts and sent zero messages. Physical phone/coarse-pointer operation is not claimed.

### Invalid follow-up setup trials

One window already had its 16 sessions open before the timing probe attached; that trial has no valid Welcome back clock and is excluded. A test-only dummy-key preloader initially required Electron before its module shim was available; it now uses Electron's documented `process` `loaded` event. A post-retry probe omitted the required session `name` on reopen, causing an undefined tooltip label in the private renderer; the probe now preserves the original name and asserts the renderer remains healthy. Earlier post-reopen checks from that malformed request are superseded by `result-1792361500535.json`. These were test setup defects, not app-source fixes or recovery performance regressions.

### Historical hands-on profile

This records the profile supplied for the 2026-10-18 hand-test; it is not an instruction to use a currently running window. The later integration pass observed no test services listening. The isolated dev window contained 16 copied histories. Replies went only to the scripted loopback endpoint, not a cloud model. The first connection of the demo tool intentionally stalls, making Connecting, failure, Retry and Continue available to test. The private profile is not signed into real sync. Its non-secret fixture key uses a test-only basic-storage configuration: **do not add real provider keys to this test profile**. No production app, original transcript, live account configuration, or installed hook/plugin was changed. At that hand-test checkpoint, source was uncommitted/unshipped and acceptance was pending. The subsequent authorized publication is recorded in the archived readiness plan linked above.
