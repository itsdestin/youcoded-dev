---
date: 2026-09-05
status: active
type: investigation
topic: whether switching the model mid-conversation invalidates the prompt cache on cloud and local, and what the first post-switch message costs
tags: [native-runtime, cost, cache, model-picker]
---

# Switching models invalidates the prompt cache — what the first post-switch message costs

Asked by Destin: does switching OpenRouter / local models on a conversation invalidate the
cache, and is the first message after a switch particularly expensive?

Short answer: **yes on both runtimes, for the same root reason — the cache is keyed per
model.** The cost shapes differ sharply, though: OpenRouter fades (~5 min) and costs money;
a local model re-prefills from scratch and costs time.

## How a mid-session model switch works

- `ModelPickerPopup` picks a row → `window.claude.native.setBinding(sessionId, binding)`
  (`desktop/src/renderer/components/model/ModelPicker.tsx`).
- `native:set-binding` → `NativeSessionHost.setBinding(sessionId, binding)` (`desktop/src/main/ipc-handlers.ts:2893`),
  which on a changed `modelId` re-resolves context/profile/pricing (a cloud → small-local
  swap crosses capability tiers) and calls `HarnessSession.setBinding` (`desktop/src/main/harness/native-session-host.ts:3909`).
- `HarnessSession.setBinding` mutates `this.binding` in place; the **next turn** uses the new
  binding. It deliberately does NOT touch `this.history`, so the full conversation history is
  re-sent to the new model (`desktop/src/main/harness/harness-session.ts:836-846`).

So a switch is a same-conversation rebind with the whole history intact — the cache-covered
prefix is exactly what gets re-sent.

## Why the cache dies on each runtime

- **OpenRouter (automatic provider-side prompt caching):** the cache key includes the model
  id. A different model ⇒ a different key ⇒ zero cache reads; the first request after the
  switch is billed at the new model's full input rate and writes a fresh cache entry. The
  prior session's cache is not reused. Additionally the OpenRouter cache has a TTL of
  roughly five minutes, so even an idle conversation cannot rely on it.
- **Local llama.cpp (KV cache):** the KV cache lives inside the loaded model's context and is
  keyed to that model file. Switching models unloads the old model's KV entirely; the first
  prompt after the switch is a full prefill of the whole conversation — on a long session
  that is minutes of compute at full input length. Compaction is the only thing that shrinks
  that re-prefill bill.

Consequences visible in existing code:

- `lastStepPromptTokens` (how much context is genuinely NEW) is reset to 0 at the start of
  every turn, and prefill progress reporting treats a full history replay as a full prefill
  (`desktop/src/main/harness/harness-session.ts:629-634, 2393-2400`). A switch makes the next
  turn exactly that case.
- The stall watchdog already knows prefill on a local model legitimately takes minutes
  (`stallWarnMs` scaling in `harness-session.ts`, around `:2383`). So the *wait* is expected;
  what is missing is telling the user the wait (and the cost) is coming.

## What a warning could use (all signals exist)

- The session's real context window (`contextLength`), the model's published input price via
  `ModelPricing` (cached), and the harness pricing arithmetic (`costForUsage` in
  `desktop/src/main/harness/pricing.ts`) could produce a per-turn cost estimate.
- Prefill progress is already surfaced (the `assistant-thinking` notice with percentage and
  countdown, driven by `return_progress` on the local engine branch).
- The one-sided cost nudge: `native-session-host.ts` already knows `oldModelId` vs
  `binding.modelId` in `setBinding` (`:3918`), so the "switch vs. compact" moment is a single
  place to hook.

## Relation to existing backlog

- The Cache efficiency item (`native-harness.md` → `## cost`, 2026-08-17) is about leaving
  cache hits on the table; this is its inverse — cache invalidation that is *certain*, not a
  missed opportunity. Related but distinct.
- The mid-turn-model-swap repricing item is about a turn already streaming when the switch
  lands; this is about the *first turn after* a completed switch.

## Suggested UX direction (not approved)

`native-harness.md` → `## cost`: on switching models mid-conversation, show a warning in the
model picker estimating the first post-switch message's cost (cloud: re-prefill at the new
input rate; local: full re-prefill time), with an offer to compact first — or at minimum a
"this switch re-prefills the whole conversation" notice when the conversation is long.

<!-- claim: {"path":"youcoded/desktop/src/main/harness/harness-session.ts","contains":"setBinding\\(binding: ModelBinding, contextLength"} -->
<!-- claim: {"path":"youcoded/desktop/src/main/harness/native-session-host.ts","contains":"entry\\.session\\.setBinding\\(binding, contextLength, profile, pricing, free\\)"} -->
<!-- claim: {"path":"youcoded/desktop/src/main/providers/provider-registry.ts","contains":"case 'openrouter':\\s*\\{[\\s\\S]*?apiKey"} -->