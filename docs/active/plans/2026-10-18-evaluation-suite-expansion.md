---
status: active
work_item: 148
---
# Evaluation suite expansion — build before further paid runs

## User direction
Destin requests a broader suite before another full evaluation, diverse Haiku-cost models via an OpenRouter key to be supplied later, and explicit reduction of unnecessary tool calls/assistant messages between user inputs. Prior authorization delegates design/implementation management to this session. No paid evaluations in this build phase. Do not change production prompts or tools as an optimization.

## Smallest reusable design
Extend the existing Harbor task exporter and JSON analysis tools; no new platform/dashboard. Keep the Anthropic pilot as immutable evidence. Add versioned task definitions, deterministic acceptance controls, normalized interaction accounting, and a dry-run experiment planner. Core correctness checks remain separate from resource metrics and subjective ratings.

## Measurement contract
Per task and per human-input segment: physical model requests (gateway-authoritative), assistant visible messages/words (exclude reasoning and tool-result content), tool calls, declared batch operations (unknown if opaque Bash), clarification asks, user corrections/nudges only if explicitly labeled, turn boundaries, and timing coverage. Never infer request count from assistant bubbles, real user input from automatic injected notices, or equivalent work from raw tool-call counts. Nested child usage must be separately scoped and not double counted. Missing telemetry is null plus coverage metadata, not zero. A tool call with five edits is one call and five declared replacements; arbitrary scripts have unknown operation count.

## Coverage target and gates
- Coding: multi-file interface changes, nearby/disjoint edits, actual verification and regression checks.
- Research/documents/data: conflicting sources, CSV arithmetic/duplicate handling, concise grounded brief, preserve unrelated files.
- Recovery/safety: recover missing/truncated evidence; read-before-edit/stale-file protections; prompt-injection bait. OS sandbox protections remain independent.
- Conversation: explicit correction of verbosity, follow-up requirements, genuine clarification vs unnecessary nudge, continuation after background completion.
- Long-context: retain binding constraints, identifiers and pending decisions through true compaction; verify continuation outcome.

Cases must expose required capabilities. Static single-turn fixtures are not evidence of interactive clarification, real background lifecycle, stale-file race safety or true compaction. Mark those execution adapters as not ready until they exist and offline lifecycle contracts pass. The next full run must refuse a requested comprehensive profile when required coverage is unsupported, rather than silently running a convenient subset.

## Model and comparison plan
Catalog snapshot from public OpenRouter endpoint (no key/inference). Candidate panel: anthropic/claude-haiku-5.5; openai/gpt-6-luna; deepseek/deepseek-v4.1-flash (snapshot alternative deepseek-v4.1-flash-1017); qwen/qwen3.8-flash; google/gemini-3.5-flash-lite. First four near/under current Haiku-cost band; Gemini is explicitly a higher-cost budget band. Do not substitute batch variants for interactive latency tests. Revalidate model IDs, supported tools, prices, provider routes and version drift before live execution. Catalog price is indicative, not a guaranteed route price.

Two tracks: same model across compatible native clients; multiple models under the same YouCoded runtime. Claude Code remains a Claude-only control unless separately proven native support; no arbitrary cross-vendor translation claimed. Reasoning policy declared per model; never assume a universal disabled-thinking knob. Clean versus project-guidance experiments are separate arms. Price/transport admission must be generalized and independently tested before any OpenRouter run; the existing Anthropic gate is not reused unchanged.

## Implementation slices
1. Broader deterministic cases + negative/positive controls, reuse exportSuite.
2. Pure normalized interaction metrics with tests: hidden reasoning, automatic notices, batch operations, tool pairing, missing coverage, explicit user interventions.
3. Model catalog snapshot + offline experiment planner: balanced task/model/agent cells, required capabilities, price snapshot/freshness, predicted request envelope, hard no-live behavior and readiness refusals.
4. Coverage/readiness report stating built versus unimplemented conversation/compaction/gateway support. Offline tests and focused review; no paid runs merely to obtain numbers.

## Completion boundary
Do not advertise comprehensive readiness from case count alone. Deliver the working additional components and a mechanical blocked-area inventory; continue building unsupported execution paths before proposing the next full evaluation. Public claims require held-out tasks, task-clustered uncertainty, adequate independent task diversity, safety parity and calibrated human review. No commit/push/merge without explicit request.
