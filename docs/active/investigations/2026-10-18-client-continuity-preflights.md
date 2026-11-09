---
status: active
work_item: 148
---
# Client continuity preflights after estimate-based budget migration

## Scope

Bounded two-user-turn file editing with an independent final-state verifier, not a performance ranking or full paid evaluation. Existing YouCoded and Pi Qwen canaries passed. Further checks use the same scenario and prepared competitor image. Credentials stay in the gateway; clients receive scoped opaque tokens. The shared USD15 estimate-based ledger remains authoritative.

## OpenCode: diagnosed, then passed

`router-opencode-estimated1` completed turn one but not turn two. Its private diagnostic record established the HTTP400 cause: `max_completion_tokens [2048] must be greater than thinking_budget [16000]`. Repeated HTTP429 responses explicitly reported upstream Alibaba/Qwen rate limiting. This is not evidence that OpenCode cannot perform the task. Errors without billed cost retain request-sized estimates, not whole-context holds.

The next preflight pinned `anthropic/claude-haiku-5.5` to first-party `anthropic`, with a 32768 gateway output ceiling and 20 total provider requests allowed for the trial. Public endpoint metadata reported context 1000000 and output maximum 128000. Configured price ceilings cover the advertised >100000-input-token tier: USD0.50/M prompt, USD1/M cache write, USD2.50/M completion. These ceiling settings are not an assertion that every request is billed at the high tier.

`router-opencode-haiku1` passed both turns and the final verifier. Seven provider requests settled successfully; reported costs total USD0.002496985. The model/route/output settings differ from the Qwen checks, so timings and efficiency must not be ranked across these canaries.

## Claude Code protocol

The gateway now accepts scoped Anthropic Messages requests and forwards the native content to OpenRouter's fixed `/api/v1/messages` endpoint. It accepts only text, custom tools and native reasoning blocks; server-paid tools, fallback models and premium tiers remain blocked. The native shorthand is mapped only to its exact approved canonical Anthropic model. This does not establish arbitrary-model Claude Code compatibility.

The first Claude Code check made zero upstream calls and failed with a local HTTP404. Offline inspection of the installed Claude Code executable confirmed `/v1/messages?beta=true`; the gateway now accepts that exact SDK path, still rejects arbitrary query parameters, and sends requests only to the fixed upstream URL. A regression test failed before the correction and passed afterward.

Official references: https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration and https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message . First-party Anthropic is the compatibility target, not a silent substitution for the earlier Google Vertex route.

## Evidence and review

Jobs live under `scratch/harness-lab/router-conversation-canary/jobs/`. Python adapters for these runs are frozen at `scratch/harness-lab/haiku-preflight-source/`, avoiding concurrent source edits during execution. Its router/conversation unit tests passed before the remaining client runs.

Opt-in upstream error diagnostics store only bounded selected fields in the private ledger, with configured credentials, bearer tokens and named API-key/token values redacted; raw bodies are not forwarded to clients. Error detail may include task excerpts and is not for public reports. Review prompted additional redaction and final-SSE-line tests. Anthropic cache counts deliberately remain additive: `input_tokens` excludes cache reads/writes, unlike OpenAI's `prompt_tokens`; treating them as subsets would corrupt the observed accounting. Missing billing remains unknown even when token counts are retained.

The Claude Code retry (`router-claude-code-haiku2`) was rejected locally by request policy (HTTP400), and Hermes (`router-hermes-haiku2`) received a local route HTTP404. Both recorded zero upstream requests. These were lab integration failures, not provider or model-quality failures; the subsequent diagnosis and successful retries are below.

The paid gateway and its dedicated network were stopped/removed. The ledger at this checkpoint charges USD0.4246016375 including estimates; its last provider-usage reading was USD0.008181975. No reserved request rows remain. A floating-point residual in the aggregate reserved amount was found and pinned with a regression test; settlements now recompute outstanding reservations from request rows, and restart normalizes the no-in-flight state to exact zero. No confirmed charges or historical holds were erased.

`continuity-preflight-freeze.json` freezes the preflight configuration and source hashes only. The full benchmark is NOT frozen or approved to run: held-out workload breadth, equivalent fault/state evidence, real-model long-context retention, and human calibration remain open. No full-suite readiness claim follows from these preflights.

## Completed remaining-client checks

Hermes' offline wire probe established that its OpenAI-native route selected `/v1/responses`. The wrapper now uses its custom provider with `api_mode: chat_completions`. A subsequent pre-execution failure exposed Harbor's controller-side credential lookup before task environment injection; a serialized, restored noncredential controller marker now selects the generic dispatch path, while only the opaque gateway token reaches the task. The CLI model is the canonical `anthropic/claude-haiku-5.5`, not an extra `custom/` prefix. The configured output cap is supplied when clients omit their own limit; invalid explicit limits are still rejected.

`router-hermes-haiku4` passed both native turns, complete per-step capture, and the final file verifier. Seven requests were admitted: six returned billed costs (USD0.0069178 in total) and one retained its request-sized estimate because billed cost was missing. Do not describe that subtotal as the complete Hermes bill.

Claude Code's exact HTTP400 cause was subsequently captured using type-only diagnostics: a message with role `system` and text content in the conversation history. The policy now permits that text-only native shape while preserving role, content and order; no instruction is demoted or moved. `router-claude-code-haiku5` passed both turns, complete per-step capture and the final verifier. All five requests returned billed costs, totaling USD0.00640733.

Thus all five clients have passed the tiny two-turn canary. This is not live parity for every model, feature or workload. Final adapter source snapshot: `haiku-preflight-source-v3/`; earlier snapshots and failed jobs remain preserved. Latest code verification: **155 Node tests and 40 Python tests passed**, plus `git diff --check`. No fresh full desktop verification is claimed; these changes are workspace lab tooling.

Final accounting: USD0.5696592675 including estimates, USD14.4303407325 estimated headroom under USD15. The dedicated OpenRouter key reports cumulative usage USD0.023264605. There are exactly zero reserved/pending requests; the paid gateway container and dedicated network were removed. No full paid evaluation was run.
