# Claude Code reliability experiments — first batch

status: active

## Authorization and boundaries

The submitted `claude-reliability.questions.answers.json` selects experiments 1–3, 5–10, 12–13, not app implementation. Prioritize `/model`, `/clear`, `/compact`, and discover other supported controls. Item 4 (live event replacement) is held for consequence analysis. Item 11 is separate exploration #164: one conversation across Claude Code and the native engine, without duplicate history rows. Item 14 (Agent SDK) is rejected.

No production integration edits, installed hooks/plugins, personal credentials, paid model requests, or SDK integration. Experimental fixtures and evidence live under this investigation directory; disposable runtime state lives under a newly allocated temporary HOME and CLAUDE_CONFIG_DIR. Use an allowlisted child environment; do not copy credentials. Only exact child processes created by a probe may be stopped.

## Goal

Determine which capabilities the installed unmodified CLI actually supplies, before proposing a replacement architecture. Separate (a) static declaration/validation evidence, (b) stubbed mod tests, (c) real CLI against a local scripted API, and (d) real subscription/model behavior, which is not authorized in this batch.

## First batch

1. **Current-build contract and availability**
   - Read existing isolation and fake-API helpers under the isolated app checkout's `desktop/test-conpty/`.
   - Validate a minimal disposable plugin and try loading it in an isolated interactive CLI to obtain this build's generated declarations.
   - Record CLI version, refusals, actual loaded-state evidence and declaration paths. Do not force feature rollout switches or managed policies on.
   - Inventory exact command, prompt, interruption, configuration and lifecycle signatures. A type declaration is not a runtime success.
2. **Commands and direct send**
   - If loading succeeds, use a local scripted API and a minimal mod fixture to observe direct prompt submission and command execution.
   - Test `/model`, `/clear`, `/compact` first. Record discoverable alternatives without claiming they work until exercised.
   - Observe actual model selection, session identity and on-disk transcript boundaries. Do not change the app's watcher or history storage.
   - Test repeated text, multiline Unicode, busy sends and interruptions where the available API supports them. Explicitly leave images/unexercised modes unverified.
3. **Failure and recovery**
   - Exercise ordinary hook failure and unloading only in the disposable process. Record whether the CLI continues and which observation/control capabilities disappear.
   - Do not claim fail-closed security or exactly-once delivery from a passing happy-path test.
4. **Held item 4: consequence analysis**
   - Trace observation-only mod events versus retained engine transcripts, initial history loading, reconnect catch-up, compaction/clear/resume and background work.
   - Produce a narrow boundary: what can change without changing storage; what requires additional continuity and deduplication machinery.

## Next isolated batch after the completed failure/image tests

- Test `tool.check` calling a localhost approval service: hold a harmless temporary-file Write for more than the 10-second own-execution budget, then allow or deny. Separately disconnect/refuse the service with explicit error-denial handling. Verify actual files and the fake model's tool results, not just method returns. This tests an external-wait mechanism, not a complete user approval UI or two-hour wait.
- Explore `$.config.list`/`set` for permission mode and supported command execution for effort/rename if the generated contract permits them. Record persisted versus session-only effects. Do not execute billing/account commands or change real profile state.
- Extend the independent official plugin check to local upgrade and project/local scope if feasible. No network, production installation or app source changes.

## Question/plan and pending-request failure batch

After the verified external allow/deny and 12-second-wait results, test actual AskUserQuestion/ExitPlanMode behavior rather than assuming normal tool permissions cover them. Use a scripted local responder as a synthetic user; report it as such, not as an actual app approval UI. Cover structured single/multiple/free-text answers and denial/cancel where supported. For plans, verify actual mode/identity and subsequent tool policy; returning a tool-shaped success without running the engine transition does not count as plan approval.

For a pending request, test explicit cancellation with a late approval reply and a bounded graceful mod reload/removal if the documented loading path supports it. Never crash the shared real app or induce an unbounded loop. The required result is whether the temporary file was written and whether a stale answer can affect a later call. Use only disposable files and keep denied work from being retried by the scripted model.

If the native question/plan dialog still owns the interaction, report that as a coverage limit. Do not fall back to simulated keystrokes merely to call the structured path successful. Use generated APIs only; no SDK, undocumented state edits, policy overrides, real account or paid requests.

## Remaining free-test sweep (user: power through without pauses)

Run bounded batches to completion rather than asking between them:

1. **Lifecycle/failure:** HTTP approval ceiling, malformed approval reply, explicit fail-closed recovery after service restart, a bounded approval wait exceeding one HTTP request through repeated pending responses, process stop/resume using only synthetic history, and absent-mod detection. Verify effects rather than equating a request return with success. If native in-flight worker unload has no safe supported trigger, retain it as unverified rather than inventing one.
2. **Scoped extensions:** real CLI local MCP tool configured per session with no global residue; inactive/missing MCP detection; session-only context actually reaching the local model and absent in a control session; mod turn/usage reports compared with known scripted usage; agent/background coverage only if the existing fake API can generate meaningful independent evidence.
3. **Offline deployment/compatibility:** official plugin validation of mods, installed versus inline mod load, relevant existing hook-installation tests in isolated temp state, and readiness to run those probes on other supported builds/platforms. Do not install SDKs, repair shared dependencies, fake an unavailable platform, or run paid/subscription cases.

Preserve all previous evidence. Each batch gets new file names and a repeatable read-only checker. Result summary must classify each selected deck item as proven only in this environment, partially covered, blocked by a measured limitation, or unverified. App implementation remains unapproved.

## Independent no-cost check — item 7

Use `plugin-management/check.py` to create a disposable local marketplace with one inert Markdown skill. Run official marketplace add, install, list, disable, enable, uninstall and an unknown-plugin failure through the installed CLI. Each CLI process runs inside bubblewrap with networking disabled, the host filesystem read-only and only its allocated temp directory writable. Child environment is allowlisted and contains no real credentials. Save JSON command outcomes under `plugin-management/results.json`; inspect installed/enabled/removed states, not only exit codes. This checks the ordinary user-scope lifecycle, not interrupted installation, upgrade, multi-scope or concurrent writers.

## Files and responsibilities

- `PLAN.md`: this scope and test order.
- `probe/`: minimal throwaway mod and CLI probe scripts, if needed; no app source changes.
- `evidence/`: bounded logs, test reports and declaration excerpts; never credentials or personal transcript data.
- `RESULTS.md`: actual commands, versions, outcomes, limitations, links to evidence and next gates.

Existing reusable test infrastructure: `youcoded/desktop/test-conpty/cc-capture-lib.mjs`, `fake-anthropic.mjs`, `capture-popup-corpus.mjs`. The older README examples that write a home config are not permission to use the real home. Inspect effects before reusing helpers. `cleanEnv` strips only some credential variables, so a stricter child environment is needed.

## Stop conditions

A feature gate, missing supported contract, unavailable dependency, or inability to keep state isolated is a result to report, not something to bypass. If any live-model behavior is necessary, specify the question and request quota/spending approval first. No global installation, package refresh or dependency patching merely to make a probe run.

## Acceptance of this investigation batch

Every result states whether it came from documentation, types, a stubbed test or an actual isolated CLI run. Preserve failing and unsupported cases. App adoption remains a separate user decision after evidence review.
