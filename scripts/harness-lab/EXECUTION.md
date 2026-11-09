# Execution layer: shared budget transport and stateful scenarios

This documents the existing lab. Current status: the90-trial held-out harness comparison is complete, the model panel is partial/stopped, and the small serial targeted A/A calibration passed. No comprehensive570-trial study completed. See [current workstream state](../../docs/active/plans/148-current-state.md). Historical transport receipts below retain their original scope; offline tests are not model-quality evidence.

## OpenRouter gateway

`openrouter-gateway.mjs` is a working standard-library HTTP proxy using `openrouter-policy.mjs` and `budget-ledger.mjs`. It accepts scoped POST chat-completions or native Messages routes and always forwards to their fixed OpenRouter endpoints. Native Messages grants require `protocol: "anthropic-messages"` and accept `/v1/messages` or `/api/v1/messages`, including the exact Claude SDK `?beta=true` variant; arbitrary query parameters remain refused. Native text-only system messages retain their role and position. An omitted client output limit is replaced by the configured output cap, never a provider's unbounded default. The provider key is read only in the gateway process. Clients receive per-trial opaque tokens.

CLI:

```bash
node scripts/harness-lab/openrouter-gateway.mjs --config /private/gateway.json --key-file /private/openrouter.key
```

Private config fields:

| Field | Requirement |
|---|---|
| `host`, `port` | Loopback by default. Container-network binding requires explicit `allowNetworkBind: true`; do not publish the port to the host/LAN. |
| `ledgerPath` | Ledger in a private directory (0700). |
| `limitUsd`, `priorUpperUsd` | Explicit approved cumulative cap and already-consumed conservative charge. Do not reset prior spending when switching providers. |
| `tokens` | Map opaque tokens to `{trialId, maxRequests, policy}`. |
| `policy.model`, `policy.provider` | Exact model ID and pinned provider/endpoint; no silent fallback. |
| `policy.maxOutputTokens`, `policy.maxContextTokens` | Explicit output cap and independently verified maximum context for the model/route. |
| `policy.maxPromptUsdPerMillion`, `policy.maxCacheWriteUsdPerMillion`, `policy.maxCompletionUsdPerMillion` | Conservative rates covering the configured route and context tiers, not merely the cheapest catalog headline. |
| `policy.reservationUsd` | At least 1.1 × `(context × promptRate + context × cacheWriteRate + outputCap × outputRate) / 1e6`. |

In default **legacy** mode, admission reserves the whole upper amount durably before a provider call. Complete JSON or terminal SSE with actual provider-reported cost replaces the reservation with that cost. Errors, disconnects or missing cost retain the full upper amount. A bill exceeding its reservation closes the ledger to further admissions. Model/provider attribution is stored; prompts and the actual credential are not stored in the budget ledger.

### Approved estimate-based mode

Set `accountingMode: "estimated"`, `externalPriorUsd` to the estimated non-OpenRouter prior, and `priorUpperUsd` to that prior plus the dedicated key's initial reported usage. Use a new ledger with migration evidence; never silently reinterpret an existing legacy ledger. The approved cap is USD15, not the key's USD20 limit.

Admission estimates the actual normalized request's UTF-8 bytes / 3 plus message overhead, effective output ceiling and configured prices, with a 25% buffer. These are estimates, not token counts or guaranteed maxima. Returned actual charges replace estimates; missing costs retain only that request-sized estimate. A bill above its estimate does not freeze an otherwise solvent ledger. Request-count limits still apply.

A startup check and checks before admission when the last reading is 30 seconds old fetch cumulative usage from the fixed OpenRouter key-metadata endpoint. Billing requests are bounded and single-flight; failed verification returns HTTP503 without generation. Admission uses the greater of local charges/estimates and external prior plus reported provider usage, then adds in-flight estimates. Billing snapshots are retained and the usage floor cannot decrease. Reports separate confirmed request charges, unresolved estimates, in-flight estimates and cumulative provider usage; these categories must not be blindly summed. Billing latency and estimation error can cause a small overrun, explicitly accepted by the user.

Current private configuration: `router-estimated-gate.json`; ledger: `router-estimated-ledger.json`; migration evidence: `router-estimated-migration.json`, all under the private lab directory. The older ledger is preserved unchanged. Baseline at migration: USD0.3775013005 estimated/confirmed combined, leaving USD14.6224986995. No paid generation was run during activation.

Persistence uses a synced temporary file, atomic rename and directory sync. Only one process may own a ledger. **Stale lock files require explicit recovery after proving the old owner stopped**; automatic PID-based lock stealing was removed because concurrent restarts could otherwise admit two owners. Reopening a valid ledger charges unresolved reservations conservatively; it never resets them to free.

The gateway restricts this first execution profile to text content and custom function tools, rejects plugins/transforms/fallback models, and refuses upstream redirects. Byte caps are input hygiene, not a tokenizer guarantee. It streams with backpressure and timeout cancellation. Local HTTP-stub tests cover financial admission, streaming completion, interrupted usage, credentials, redirects and policy refusal.

**Preflight requirements for each new live route/configuration:** refresh provider/model endpoint metadata, verify the configured maximum rates/context/output, supply the previously consumed budget, validate account cap, and execute a deliberately tiny separately bounded transport/client canary. None of these is waived by passing the offline suite. The USD20 account cap does not enlarge the separately approved USD15 spending ceiling (originally USD10).

### First bounded transport checks

A short request through each configured route was attempted after offline verification: Haiku, Luna, DeepSeek and Qwen returned valid responses with provider cost; Gemini returned HTTP 404. An overbroad image-price filter was corrected; a subsequent bounded Gemini retry passed. Later two-turn YouCoded and Pi checks passed independent verification; OpenCode did not complete after upstream errors and legacy budget denial. The four reported costs totaled USD 0.000034946, matching the subsequent key-usage reading. The failed request retains its conservative reservation; this is not a charge claim or permission to reset the budget. See `docs/active/investigations/2026-10-18-openrouter-transport-preflight.md` in the workspace for full route/quantization caveats. No full paid suite ran.

## Future-request failure diagnostics

New retained requests can record allowlisted `failureReason` (`upstream-deadline`, `upstream-read-error`, `missing-terminal-marker`, `missing-usage`, `downstream-disconnect`, `unknown`), `responseStarted` (local headers committed, not delivery proof), and monotonic `durationMs` from upstream dispatch to retention. Classification uses observed control flow; it does not save raw exception messages, causes, headers or request content. The first observed reason wins abort races. Missing cost, generic transport errors and parser-bound failures can remain unknown. Ledger schema1 and retained accounting are unchanged.

Native failed-run summaries prefer the main-session terminal error, then the worker error, then stderr. The summary is bounded to8000characters, stderr remains separately available with key redaction, and original events remain intact. Warnings on successful runs do not imply failure.

The offline SDK reproduction established that the120-second total request deadline can cut an active stream, but multiple other failures produce the same SDK wrapper. Historical Qwen evidence cannot be reclassified from these new fields. Timeout limits and past/frozen trials are unchanged. Independent focused safety review found no important blockers. Parent verification passed197combined workspace/native-lab Node tests; the worker also verified94Python tests and the desktop verification command. These results qualify the diagnostic implementation, not the historical provider failure.

## Bounded parallel execution — future batches only

**Offline implementation and focused safety review complete.** The reviewer closed both findings with no new important blockers: interruption is deferred until process ownership is registered, and resource pressure drains active work before rechecking the next candidate. Parent verification passed94Python tests, including real-child interruption regressions. A later two-worker held-out cohort ran4attempts and stopped safely after a Qwen stream failure plus collateral cancellation; this is limited live evidence, not comprehensive provider-contention qualification. Future paid batches still require their own configuration and spending authorization.

`run_parallel_comparison.py` coordinates independent child processes through the existing serial runner. It must not be substituted into a running serial cohort. Keep a new manifest, journal and timing cohort; all workers still use **one existing shared gateway ledger**, not separate spending allowances.

Add this top-level object to a future schemaVersion1 manifest:

```json
"parallel": {
  "workers": 2,
  "timingMode": "contention-affected",
  "timingCohort": "future-batch-two-workers",
  "reserveMemoryBytes": 2147483648
}
```

Workers must be an explicit integer1–8; two is the initial recommendation, not a measured provider-concurrency optimum. The launcher refuses insufficient CPU affinity/cgroup capacity, available memory or disk for the prepared tasks' declared resource caps. It does not silently autotune worker count. Reserve memory is additional headroom, and disk admission preserves the normal minimum free space plus concurrent declared task storage. Initial validation requires the aggregate worker envelope. During execution, if the conservative active-plus-next-task resource bound fails, the coordinator pauses new admissions, lets owned trials finish, then remeasures the next task alone. This can temporarily reduce overlap; it is not a trial retry or silent worker-limit change. Insufficient capacity after draining fails closed. Budget, hard free-disk-floor and infrastructure failures still stop immediately.

Free validation (no provider calls):

```bash
python3 -B scripts/harness-lab/run_parallel_comparison.py --manifest /absolute/path/to/future-manifest.json --dry-run
```

`--execute` additionally requires explicit spending authorization and `executionAuthorized:true`. This implementation's verification does not authorize a new paid batch. The future source snapshot must include the exact reviewed serial runner and cover it with file hashes. The parent journal uses `config.eventsPath`; stable child manifests/journals live in `<eventsPath>.trials/`.

Completion is tracked by trial identity, so out-of-order successes and quality failures remain durable and are not rerun. A changed fingerprint, interrupted admission, infrastructure failure or stopped-batch marker requires inspection; this is not automatic retry or seamless recovery from an arbitrary crash. On failure or stop, new admissions cease and every owned active child receives a stop signal so its scoped process/container cleanup can finish. Cleanup uncertainty is recorded and fails closed.

Parallel elapsed times are **contention-affected**, not uncontended serial latency. Keep serial/parallel cohorts separate in timing reports. Provider contention/rate-limit behavior is not comprehensively characterized. Original objective-comparison-v3 serial evidence remains unchanged; it and the separate parallel cohort are stopped, not active.

## Multi-model clients

`router_agents.py` adds guarded OpenRouter configuration for all five clients using existing Harbor/client implementations. Models must belong to `model-panel.json`. Native YouCoded retains its production OpenRouter provider implementation; only its endpoint changes to the gate.

- `router_agents:RouterYouCoded` takes the plain OpenRouter ID, e.g. `qwen/qwen3.8-flash`.
- `router_agents:RouterPi` and `router_agents:RouterOpenCode` take `openrouter/<model ID>` as required by their Harbor adapters.
- All take `gate_url` and `gate_token_file`; YouCoded also takes `desktop_dir`.
- `RouterClaudeCode` and `RouterHermes` currently accept only `openrouter/anthropic/claude-haiku-5.5`. Claude Code uses a scoped native Messages route; Hermes uses its custom chat-completions provider. Use the explicitly pinned first-party Anthropic grant; arbitrary-model compatibility is not claimed.
- Live two-turn execution and final file verification passed for all five clients: YouCoded/Pi on Qwen, the other three on first-party Haiku. Settings differ; these are integration receipts, not efficiency rankings. Other model/feature combinations still need qualification. Existing direct-Haiku wrappers remain separate controls.

## Stateful conversation adapter

`conversation_agents:ConversationAgent` composes existing native clients rather than implementing another agent loop. Parameters are `client`, `scenario_file`, `gate_url`, `gate_token_file`, model, and `desktop_dir` for YouCoded. Supported client identifiers: `youcoded`, `pi`, `claude-code`, `hermes`, `opencode`, `router-youcoded`, `router-pi`, `router-opencode`, `router-claude-code`, `router-hermes`.

The first scripted user step calls the delegate's `run`; later steps call its actual `resume` on the same instance and environment. Competitor explicit compaction is refused before the first model call rather than faked by restarting a session. Native YouCoded executes its scenario steps in one production NativeSessionHost.

Each step snapshots native evidence and output. Partial results survive failure/cancellation; missing capture stops the scenario as an infrastructure failure, not successful completion. Snapshots are copied outside the agent-writable log subtree; agent-created symlinks are not dereferenced. Cumulative adapter usage is **not** summed across steps; the shared physical-request ledger is the accounting authority.

Offline tests verify sequencing, no fake restart, cancellation, capture refusal and file safety. They do not establish live correctness of every competitor's resume implementation. This is declared readiness, not an assumed capability.

## Real native-runtime scenario tests, no real model

The launcher now has explicit scripted smoke profiles. These run the production host/tools with a fake provider and no network:

- **`stale-write`**: successful Read → deliberate external fixture change → actual Edit rejection. The external content remains intact. The injector uses Linux descriptor-relative, no-follow access and a pinned inode; it refuses unexpected contents, hardlinks and escaping paths.
- **`background-followthrough`**: actual background Task → child report injection → parent continues to Write, with only one scripted root input. This verifies orchestration, not whether an arbitrary model chooses to keep working.
- **`clarification`**: actual AskUserQuestion → root-session-scoped declared answer oracle → continued turn. Other permissions, other sessions and specialists cannot consume the root answer. Unmapped questions are denied and recorded, never answered by invention.
- **`context-pressure`** with a scenario: growing scripted occupancy triggers actual automatic production compaction, without an explicit compact step. Usage is synthetic; this proves threshold/continuation plumbing, not real-model retention or tokenizer accuracy.

The fixture mechanisms are also available through explicit run configuration: `faultInjection` specifies a top-level relative fixture file plus exact expected/replacement text; `clarificationOracle` specifies exact questions, answers and fixture classifications. Never inject fixture mutations into a real working directory. Manual `compact` and scripted follow-up steps remain supported by `--scenario-file`.

## Readiness distinction

Native lifecycle/safety/compaction paths are executable and tested. All five harnesses have passing long-history retention qualification, and actual six-task held-out harness results are reported separately. Cross-client within-turn fault parity, complete lifecycle equivalence, broad generalization and calibrated human judgments remain gaps. `suite-readiness.mjs` is a conservative capability inventory, not a complete importer of historical receipts. It must not be used to erase measured outcomes or declare comprehensive readiness. The no-nudge detector now automatically flags runtime negative controls; see [CONTINUATION.md](CONTINUATION.md). Do not relabel deterministic infrastructure tests as model benchmark wins.
