---
status: active
date: 2026-08-17
type: investigation
tags: [cache, prompt-caching, kv-cache, deepseek, openrouter, llm, cost]
---

# Cache efficiency across cloud and local sessions (DeepSeek 50% reuse, and beyond)

> **Re-verified 2026-09-01 (roadmap migration) — still a live input.** All four defects this
> doc found are now the single `native-harness` → `cost` roadmap entry "Cache efficiency —
> cloud + local sessions are leaving cache hits on the table" (`docs/roadmap/native-harness.md`),
> and all four are still open on `origin/master`: `cache_control` → 0 hits in
> `desktop/src/main/harness/` and `desktop/src/main/providers/`; `provider-registry.ts:30`
> still sends only `{'HTTP-Referer','X-Title'}` with no stable session id; the
> `<specialists-status>` splice-and-re-append runs every turn at `harness-session.ts:1762/1783`
> (line refs below are from 2026-08-17 and have drifted; the mechanisms have not).
> The claim anchor pins the splice — the one defect the original review called a genuine bug:
<!-- claim: {"path": "youcoded/desktop/src/main/harness/harness-session.ts", "contains": "if \\(statusIdx >= 0\\) this\\.history\\.splice\\(statusIdx, 1\\)"} -->
> Archive this doc together with that roadmap entry when it ships.
>
> Earlier re-verification 2026-08-26 reached the same conclusion (splice then at
> `harness-session.ts:1596/1617`).

**Trigger:** A live DeepSeek session (via OpenRouter) in the dev window showed ~50%
cache reuse on the StatusBar chip while debugging hung Gemini sessions. Destin asked
(a) why the number is what it is, and (b) how the app can push cache efficiency
further for both cloud and local sessions.

**Method:** Three parallel background investigations — (1) cloud prompt-cache handling,
(2) local llama.cpp KV-cache handling, (3) provider pricing rules research — plus
first-hand source verification of the load-bearing paths. File:line cites throughout.

**Short answer to the trigger:** 50% is a measurement artifact of an agentic tool
loop, not a config miss. DeepSeek caching is automatic and server-side; the number is
`cached_tokens / prompt_tokens`, which structurally can't be high early in a session
because every step appends uncacheable new tokens. Nothing the app does in the current
shape will move it much. See "Why the 50%".

---

## Why the 50% (the DeepSeek reading)

The StatusBar "Reuse:" chip computes `readTokens / promptTokens` where the numerator
and denominator come from the *same* source (`selectCacheReuse` + `selectReuseDisplay`, which
moved to `youcoded/desktop/src/renderer/state/cache-reuse.ts` on 2026-09-03 — youcoded#405 —
when the *Claude Code* branch of that same function turned out to be double-counting its cache
reads and pinning the chip under 50%. **That fix does not touch the reading described here**:
the native branch was already correct, and old and new agree on every well-formed native input.
The two-branch source logic below is now one branch — `max(inputTokens, read + create)` — which
reduces to exactly the native rule stated here whenever `prompt_tokens` includes the reads).
For native/OpenAI-compatible sessions:

- `promptTokens = inputTokens` = the provider's whole `prompt_tokens`, which already
  *includes* cached reads (`StatusBar.tsx:238-255` — the two-branch source logic;
  native providers never report writes, so reads/reads is invalid and reads/prompt is
  used instead).
- `readTokens = cacheReadTokens`, sourced from `usage.inputTokenDetails.cacheReadTokens`
  (`harness-session.ts:2329-2344`), which the `ai` SDK maps from OpenAI-format
  `prompt_tokens_details.cached_tokens` (`@ai-sdk/openai-compatible`).

That is exactly DeepSeek's own definition of hit rate:
`prompt_cache_hit_tokens / prompt_tokens` (api-docs.deepseek.com/guides/kv_cache/).
So `ratio = cached reads / total prompt` is a **structurally low-early** figure for an
agentic loop:

- Every step appends new tokens (the next user message, tool results, the assistant's
  own turns). Those new tokens are always uncacheable.
- Only the *prefix* (system prompt + earlier turns) is reusable. Early in a session the
  prefix is a small share of each request; the ratio climbs as the session ages and the
  prefix dominates.
- DeepSeek caches at request boundaries and requires an **exact prefix match from token
  0 against a persisted cache unit** (api-docs.deepseek.com/news/news0802/). The first
  request of a suffix-variance pattern typically only hits on the 2nd (exact extension)
  or even 3rd (varying tail) request.

**Conclusion:** ~50% mid-debugging is normal and near the realistic ceiling for that
conversation shape — it should trend upward within a long, stable session. It is not a
sign of a broken or disabled cache, and it will never read 100% because the newest
tokens are unreusable by definition.

---

## What the app already does right (verified)

- **System prompt is frozen per session.** `assembleSystemPrompt` is "byte-stable by
  construction" and assembled once (`prompt-assembly.ts:1-3`); `systemText` is a
  session-fixed string (`harness-session.ts:715`), with an explicit comment that it is
  never reassembled, even on a mid-session model swap, to keep the cache prefix stable
  (`native-session-host.ts:2171-2174`). Date/git-snapshot are frozen at assembly time,
  not regenerated per turn.
- **History is append-only in the common case.** New content (user turns, steers, tool
  results) is pushed to the end of `this.history`; no front-prepends. The image-free
  fast path returns the same array by reference, byte-identical (`wire-adapter.ts:105-112`).
- **Path-triggered project rules are appended as messages, never edited into the
  system prompt** specifically "to avoid discarding the KV cache prefix" (`harness-session.ts:730-745`).

These are exactly the cross-provider prerequisites (stable head, append-only growth) —
all three provider reports confirm this is the load-bearing design.

---

## Gaps and levers (the actual improvements)

Ordered roughly by expected value.

### 1. OpenRouter: no `session_id` → cache-holding provider can drift (cloud)
`provider-registry.ts:249-255` builds the OpenRouter client (`createOpenAICompatible`)
with only `HTTP-Referer` + `X-Title` headers. **No `session_id` is sent.**

OpenRouter's own docs list "the request drifted to a different provider endpoint" as a
cache-miss cause — the prompt cache lives only on the server where it was written.
A stable, per-session `session_id` (never regenerated per turn) pins the conversation to
the same provider/model so the prefix cache survives across turns.

**Applicability:** this is the single highest-leverage cloud win, and it applies directly
to Destin's OpenRouter→DeepSeek sessions. It is also needed for Router (Auto/Pareto) mode.
Caveat: explicit `provider.order` overrides sticky routing — worth documenting when a user
pins manually.

### 2. Local: `<specialists-status>` block is spliced out of mid-history every turn
`harness-session.ts:1573-1597` removes the *previous* status block from the **middle** of
`this.history` every turn while specialists are live, then appends a fresh one. The in-code
comment admits this "invalidates local KV prefix cache from that point while specialists
run" (`harness-session.ts:1564-1565`). Any session running specialists pays a full
re-prefill every turn. **Fix idea:** append without removing (or hoist to a stable
location) so the KV prefix stays intact.

### 3. Local: `fitToContext` front-trims the outgoing request once the window is exceeded
`harness-session.ts:989-1035` runs on every request and, past `budgetTokens`, drops the
oldest messages for the outgoing request. Once trimming starts, the leading byte position
changes on every prompt, so reuse is lost for the whole long session (the mechanism the
agent flagged as the "known gap"). **Fix idea:** trim to a fixed/anchor boundary (or
summarize once instead of re-trimming each step) so a stable leading prefix survives.

### 4. Local: idle teardown is aggressive and KV sizing isn't exposed
llama-server runs with `--sleep-idle-seconds 300` (5-min model sleep) plus a 10-min
engine idle stop (`engine-supervisor.ts:303, 472-485`); no `n_cache`, `--no-kv-offload`,
or slot-keep is exposed (`engine-config.ts:14-23` only carries `cacheDir`/`backend`/`contextSize`).
For a long interactive session these timers are the dominant "good cache lost" source.
**Fix idea:** surface `n_cache` and a longer/explicit keep-alive.

### 5. Cloud: no Anthropic `cache_control`
The harness never stamps `cache_control` anywhere — `harness-session.ts:1903-1931` sends
`model/system/messages/maxOutputTokens/abortSignal/onError` (plus `tools`), and no
`providerOptions`/`cacheControl` exists in the tree. Native Claude rides Anthropic's
automatic 5-min cache. **Fix idea (only if native Claude matters):** add a `cache_control`
breakpoint on the system block (render order is `tools→system→messages`, so a system
breakpoint caches tools+system together) while keeping it before the volatile tail. Mind
the min-prefix thresholds (512–4096 tokens depending on model) and the ≤4 breakpoints /
20-block-lookback limits.

### 6. Tools are re-serialized each turn (currently safe, fragile invariant)
`buildAiTools()` runs per turn (`harness-session.ts:1642`) and allocates a fresh
`tool()` object each time, though the output is byte-stable via dirty-checked syncs
(`harness-session.ts:916-940`). Since tools sit at position 0 (Anthropic) and head-stable
(DeepSeek/OpenRouter), this is *today* safe but is a de-facto property, not a guarantee.
**Fix idea:** serialize tool definitions deterministically once per session (sorted keys,
stable order) and reuse the serialized form.

---

## Provider cache rules (condensed, cited)

### Anthropic Claude
- **Opt-in** via `cache_control: {type:"ephemeral"}` (top-level "automatic" mode advances
  the breakpoint forward itself) or explicit block breakpoints; **max 4 breakpoints**;
  **min cacheable prefix** 512–4096 tokens depending on model (non-monotonic across
  generations); **20-block lookback** for finding a prior cache hit.
- **Exact byte prefix match** from position 0 — one changed byte invalidates everything
  after it. Render order fixed as `tools → system → messages`.
- **TTL:** 5 min default (refreshed on each hit), 1-hour via `"ttl":"1h"` at 2x write.
- **Pricing:** 5-min write 1.25x, 1-hr write 2x, read 0.1x. Break-even = ≥2 requests of the
  same prefix (5-min) or ≥3 (1-hr); a single unreused write costs *more* than no caching.
- `tool_choice`/images/`thinking` only invalidate messages cache; tool-definition changes
  and model switches force a full rebuild.
- Sources: platform.claude.com/docs/en/build-with-claude/prompt-caching,
  skills/claude-api/shared/prompt-caching.md, openrouter.ai/docs/guides/best-practices/prompt-caching

### DeepSeek
- **Automatic**, server-side, on by default — no code/config needed ("each request will
  trigger the construction of a hard disk cache"). Fields: `prompt_cache_hit_tokens` /
  `prompt_cache_miss_tokens`; `prompt_tokens = hit + miss`.
- **Exact prefix match from token 0** against a persisted cache unit (Sliding Window
  Attention units; first hit often on 2nd–3rd request). Best-effort — no 100% guarantee.
- Cache entries auto-clear after hours–days (no configurable TTL, per-user isolation).
- **Pricing:** V4 flash off-peak — hit $0.007/M vs miss $0.22/M (~97% off); V4 pro
  off-peak — $0.022 vs $0.66. Peak/off-peak billing (peak 01:00–04:00, 06:00–10:00 UTC).
- Sources: api-docs.deepseek.com/guides/kv_cache/, /news/news0802/, /quick_start/pricing/

### OpenRouter
- **Automatic per provider** (inherits upstream rules — Anthropic 5-min/1-hr, Gemini
  ~3–5 min, OpenAI ≥30 min). Its own four cache-miss causes: below min tokens; expired;
  **start of prompt keeps changing** (timestamps in first system message); **request
  drifted to a different provider endpoint**.
- **Sticky routing:** stable `session_id` pins the conversation (model+provider best-effort);
  `provider.order` overrides it. The `:online` variant is deprecated (injects web results
  and breaks prefix stability) — use the `openrouter:web_search` server tool instead.
- Usage in `prompt_tokens_details.cached_tokens` / `cache_write_tokens`; `cache_discount`
  can be negative on write turns, positive on read turns.
- Sources: openrouter.ai/docs/guides/best-practices/prompt-caching,
  /blog/tutorials/prompt-caching-sticky-routing/, /docs/faq

---

## Cross-provider design rules (the stable-prefix playbook)

1. Order requests by stability: `tools → system → stable shared context → history → new
   turn → timestamps`. Volatile content goes after the cache breakpoint / at the end.
2. Never interpolate per-request values (timestamps, UUIDs, request/session IDs) into the
   prefix — match is from byte 0.
3. Freeze tool definitions; serialize deterministically; never reorder/regenerate per turn.
4. Append, never rewrite. Compaction/summarization should fork (copy system/tools/model
   verbatim) rather than editing history in place.
5. Keep the same model (and Anthropic effort level) for the whole session — caches are
   model-scoped.
6. Batch by prefix; for batch APIs warm the prefix once with a 1-hr write first.
7. Mind TTL cadence — gaps >5 min on a 5-min TTL force rewrites; consider 1-hr TTL or
   `max_tokens:0` pre-warm when pauses are likely.
8. Instrument hit rate and, when reads stay at zero, diff the rendered prompt bytes
   between requests to find the silent invalidator.
9. Respect provider minimums before paying write premiums; compute break-even per provider.
10. On aggregators, pin the endpoint (`session_id` / stable opening messages).

---

## Recommended priorities (for later planning, not implemented this session)

1. **OpenRouter `session_id`** — small, direct win for the exact DeepSeek path; highest
   leverage. (Gap #1)
2. **Local specialists-status prefix fix** — stops a full re-prefill every specialist turn.
   (Gap #2)
3. **Local KV keep-alive / `n_cache`** — extends the reuse window for long local sessions.
   (Gap #4)
4. **Anthropic `cache_control`** — only if/when native Claude sessions are a priority.
   (Gap #5)

Destin's decision this session: **document only** — no code changes. This doc is the
record; priorities translated into plans/ROADMAP when he wants to proceed.

## Verification note
All file:line cites reflect the `youcoded/desktop` checkout on `master` at 2026-08-17.
Reports backing this summary are archived under
`~/.youcoded/sessions/-home-destin-youcoded-dev/specialist-reports/` (Briar = cloud,
Juniper = local, Quinn = pricing).
