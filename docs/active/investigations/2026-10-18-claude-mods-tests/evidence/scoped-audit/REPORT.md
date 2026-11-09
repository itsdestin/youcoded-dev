# Scoped extensions sweep — actual CLI evidence

status: active

Investigation only. CLI **2.1.302**, Linux; **10 actual interactive sessions, 11 localhost scripted API requests**. No SDK, real credentials, paid requests, dependency changes, app implementation, rollout or managed-policy override.

## Result matrix

| Selected item | Classification | Evidence established here | Remaining boundary |
|---|---|---|---|
| **#5 Structured status/usage** | **Partially covered** | Addressed turn.start/complete for answered and pre-response-aborted turns; session.measure agrees with session.usage without any configured statusline. Exact scripted token counts verified, including two-request tool-loop totals. | No custom-statusline run, comprehensive waiting-state classification, agent/background runs, real account limits or billing validation. |
| **#8 Effective extension discovery** | **Partially covered** | Official installed listing plus actual startup handshake/capability distinguish registration from loaded code. Session MCP discovery agrees with the tools sent to the fake model. | This batch does not establish complete skill/command discovery, project-change handling, disabled-plugin behavior or unusual install locations. |
| **#9 Session-only tools** | **Proven only in this environment** | --mcp-config adds a real stdio echo tool alongside a distinct temporary user-global server; actual tools/call reply reaches the model. Existing global server config remains identical. Missing server is absent from model tools; chat still completes. | Missing-server failure is logged, not proved as an obvious app/user-facing warning. No product connection/secret lifecycle or cross-platform claim. |
| **#10 Session-only instructions** | **Proven only in this environment** | Both documented prompt.context and a second plugin's prompt.submit interceptor transport unique synthetic markers while the submitted text, turn.start text and session history text remain unchanged; control request lacks markers. | Context caching is significant; this tests synthetic context, not new naming behavior or dynamic context updates. |
| **Installed versus inline mod** | **Proven only for local marketplace** | Official validate/add/install/list succeed in a temporary user profile; actual launch **without --plugin-dir** loads the worker, submits a turn and injects context. | Not GitHub distribution, enterprise policy, subscription entitlement, update interruption or another build/platform. |

## Important negatives and measurements

**Same-plugin submit caveat explicitly reproduced:** the driver's own prompt.submit hook was not called for its $.prompt.submit; its context marker never appeared. The generated PromptSubmitArgs also omits context. A separately loaded observer's submit hook worked and the API received `SCOPED_OBSERVER_CONTEXT_73`.

**Eager context caching:** the first context/installed attempts read mode from session.start's delayed callback. The hook fired earlier with empty mode, so no app marker was transported. Those failures remain in scoped-batch. One bounded correction loads immutable per-session metadata inside prompt.context; both followups delivered `SCOPED_APP_CONTEXT_73`. Exact runtime source revisions, original user text and model-context excerpts are saved in `inputs-context.json`.

**Usage:** each completed fake response reports input=37, output=11, cache-read=7, cache-create=3. The MCP loop's complete event sums two requests: 74/22/14/6. Latest context is **47** (=37+7+3), not total output or a cumulative turn count. session.measure and session.usage agree on context and cost. Aborting before the delayed response produces reason=aborted, isAborted=true, no turn usage, no measured context-token count, and unchanged zero fake ledger. Empty rateLimits means **unavailable**, not zero utilization. Fake ledger dollars are not subscription cost evidence.

**Broken MCP:** debug records `Connection failed (ENOENT)` and `1 setup issue: MCP (run /mcp for details)`; captured terminal text does not establish a prominent visible failure. No session server is added to global configuration. The global server is discovered, not independently invoked; the session server has initialize/list/**call** and actual model-facing result proof.

## Commands and verification

From the session workspace, with prefix `docs/active/investigations/2026-10-18-claude-mods-tests/`:

- `node <prefix>probe/scoped-probe.mjs --launch scoped-batch` → exit 0.
- `node <prefix>probe/scoped-probe.mjs --launch scoped-context-followup context installed` → exit 0.
- `node <prefix>probe/scoped-record.mjs` → `Recorded runtime source/config and synthetic context excerpts for 10 sessions; no existing output rewritten.`
- `node <prefix>probe/scoped-check.mjs` → **`PASS 494 saved-evidence assertions; 10 actual CLI sessions; 11 local scripted API requests; no evidence rewritten.`**

The checker is read-only: no CLI launches, services or output rewrites. Syntax checks for scoped-probe.mjs and scoped-mcp.mjs exited 0. App repository status was empty; no desktop source changed, so desktop verification was not applicable.

## Evidence and cleanup

Sibling directories `../scoped-batch/` and `../scoped-context-followup/` contain exact commands, allowlisted environments, binary hashes/version, namespace IDs, synthetic API bodies, actual events/transcripts, config before/after, stdio exchanges and errors. Both launches used bwrap --clearenv --unshare-net --unshare-pid, read-only host mounts and only their own temporary root/new evidence writable. Actual CLI profiles have fresh HOME/config/XDG paths; fake API uses dummy localhost authentication.

Owned interactive children were stopped after checkpoints (exit 129); fake API servers closed. Namespace exit killed remaining owned stdio children; both launch records found **no remaining sandbox processes**. Earlier investigation files/evidence hashes still match; the checker excludes only this batch's intentionally revised new scoped source from historical hash comparisons. No original parent docs, cards, app source, real profile/hooks or global CLAUDE.md were edited.
