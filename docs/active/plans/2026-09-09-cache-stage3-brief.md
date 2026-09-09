---
status: active
date: 2026-09-09
---
# Stage 3 implementer brief: SDK-native in-memory continuation

Authority: approved `../specs/2026-09-08-chatgpt-cache-efficiency-design.md` section 3 in-memory and sizing; umbrella plan `2026-09-09-chatgpt-cache-efficiency.md`. Read `../investigations/2026-09-09-cache-integration-seams.md` for verified SDK paths. No renewed brainstorming.

Work only in session worktree. Preserve diagnostics and status changes. No commits, paid/synthetic real model calls, live app/config access, IPC/renderer/event additions. Write failing tests, observe red, implement, observe green; WHY comments. Read native-runtime/test rules.

## Implementation seam

HarnessSession.runStreamOnce finishes iteration then awaits usage/providerMetadata/finishReason. Obtain the completed SDK `response.messages` here, after interrupt guard. Add internal StepResult assistant response messages and reasoning count. In beginTurn successful acceptance currently calls assistantMessage(step.text, step.toolCalls). Prefer a typed allowlisted adapter of completed SDK assistant messages for compatible OpenAI Responses binding, preserving ordered reasoning/text/tool-call parts. Do not copy SDK tool messages: existing local loop owns tool results.

Only nonempty accepted completed steps commit continuation. Existing reasoning-only/whitespace empty response recovery remains unchanged. Interrupted partials use visible text only; abandoned retries never commit private reasoning or dangling calls. Completed earlier steps survive later interruption.

## SDK evidence and test contract

Installed privately: ai 7.0.89 and @ai-sdk/openai 4.0.55 (check again). `ai/src/generate-text/to-response-messages.ts` preserves providerMetadata as providerOptions. OpenAI Responses converter supports text itemId/phase and reasoning itemId/reasoningEncryptedContent. Inspect concrete stream event schemas for fixtures; do not use speculative event names. `phase` is commentary/final_answer/null, not analysis.

Create fake SSE via actual SDK/provider middleware with injected fetch, capture next outgoing serialized body. Pin encrypted reasoning, phase, IDs, order, multiple text parts and parallel local tool calls/results. Tests must drive HarnessSession, not just a detached adapter. No new stream assembler. Allowlist only validated fields required by converter; account for validated parallel-call metadata when that actual SDK shape arises. Unknown provider fields are not propagated.

## Compatibility and sizing

Private binding includes provider/model/non-secret account identity; model/account changes must strip incompatible continuation before next wire request, even if no host setBinding call happened (account refreshed/switched). Never forward ciphertext to another backend. Do not persist or emit credentials/account identifiers into diagnostics.

Exclude provider metadata/ciphertext/IDs from recursive chars/4 sizing. Track reported reasoning tokens per accepted step outside provider metadata, counting retained step once conservatively rather than both summary text and same reasoning estimate. Unknown reasoning count means explicit incomplete estimate, not known zero; use measured context pressure where available. Ensure spreading/pruning/fitting history preserves or explicitly updates this private sizing association. Test large ciphertext with small reported count, unknown usage fallback and compaction decisions.

## Files/test outcome

Create `harness/openai-continuation.ts` and `tests/openai-continuation.test.ts`; modify harness acceptance/StepResult, provider binding seams, message-size and necessary compaction integration only. Stage 4 owns sidecar/manifest persistence (required next, not abandoned).

Run next-body contract, harness loop/empty/retry/interrupt/compaction/wire and size tests plus tsc. Record exact failing/passing commands/results and file list in `../investigations/2026-09-09-cache-stage3-report.md`. Report blockers rather than silently omit SDK-unsupported continuation fields.
