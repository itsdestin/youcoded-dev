# What "caching" means for AI models — and what YouCoded should show

**Date:** 2026-08-16
**Status:** explainer + recommendation, no code changed yet
**Why this exists:** the status bar's "Hit: 100%" chip is structurally incapable of showing anything else on the providers you use. Before picking a replacement, here's what the underlying thing actually is.

---

## Part 1: What caching actually is

### The problem it solves

Every time you send a message, the model does **not** just read your new message. It re-reads the *entire conversation from the beginning* — your system prompt, every tool description, every previous message, every file you've pasted, every tool result. All of it. Every single turn.

That's not a design flaw, it's how these models work. They have no memory between requests. The only thing that makes turn 40 aware of turn 1 is that you literally re-send turn 1 every time.

So a long conversation gets expensive in a specific, lopsided way:

| Turn | You typed | Model actually read |
|---|---|---|
| 1 | 20 words | ~5,000 tokens (system prompt + tools) |
| 20 | 20 words | ~180,000 tokens |
| 40 | 20 words | ~400,000 tokens |

Your 20 words cost nothing. The 400,000 tokens of *re-reading* cost everything. In your own sessions, one turn re-read **2.28 million tokens** and produced 1,151 tokens of reply.

### What caching does about it

The provider notices: "I already processed the first 400,000 tokens of this exact conversation two minutes ago. I still have the result sitting in memory." So instead of re-doing that work, it reuses it.

Two things happen as a result:

- **It's much cheaper.** Reading from cache costs roughly **one-tenth to one-half** of the normal price, depending on the provider.
- **It's much faster.** The model isn't chewing through 400,000 tokens before it starts answering. This is the *entire* benefit for local models, where there's no bill at all — it's the difference between waiting 30 seconds for a reply and waiting 2.

### The one rule that governs everything

**Caching only works from the front, and only if nothing changed.**

The provider stores the result for a *prefix* — a run of text starting from the very first character. If anything in that prefix changes by even one character, everything from that point onward has to be re-processed from scratch.

Think of it like a bookmark. The provider bookmarks "I've read up to here." If you go back and edit page 3, the bookmark on page 300 is worthless — it has to re-read from page 3 forward.

The order the model sees things is fixed: **tool definitions → system prompt → conversation history**. Stable stuff has to come first, changing stuff last. That's why the following quietly destroy caching:

| Doing this | Breaks caching because |
|---|---|
| Putting the current time in the system prompt | It's different every single request, so the "prefix" is never the same twice |
| Adding or removing a tool mid-conversation | Tools are read *first*, so changing them invalidates literally everything |
| Switching models mid-conversation | Caches belong to one specific model; the new one has never seen any of it |
| Editing the system prompt | Same as above — it sits near the front |

This is worth internalizing because it explains a class of "why is this suddenly slow and expensive" that has no visible cause.

### Two other things worth knowing

**Caches expire.** Typically after about 5 minutes of not being used (some providers offer a 1-hour option at higher cost). Walk away for lunch, come back, and your next message pays full price to rebuild the cache.

**Small prompts don't cache at all.** There's a minimum — usually around 1,000 tokens, varying by model from 512 up to 4,096. Below that the provider silently doesn't bother. No error, it just doesn't happen.

---

## Part 2: Two different ways providers do it

This is the split that causes all the confusion, and it's the direct cause of your 100% chip.

### Family A: "Automatic" caching

**Who:** OpenAI, DeepSeek, Google Gemini, Grok, Moonshot (Kimi), Z.AI (GLM), Groq — and every local model.

The provider handles it invisibly. You don't ask for it, you don't configure it, you can't turn it off. Send the same prefix twice and the second one is cheaper. Done.

Because there's no separate "write" step to bill for, **most of these providers only report one number: how many tokens were read from cache.** There's nothing else to report — the write was free or near-free and happened as a side effect.

### Family B: "Explicit" caching

**Who:** Anthropic (Claude), Alibaba Qwen, and Gemini in its fine-grained mode.

You have to actively mark where the cache should stop — literally place a bookmark in the request saying "cache everything up to here." Nothing is cached unless you ask.

And critically: **writing the cache costs extra.** Anthropic charges 1.25× normal price to write a 5-minute cache, or 2× for a 1-hour cache. Reads then cost 0.1×.

That premium is why this family reports *two* numbers — tokens written (expensive) and tokens read (cheap) — and why the classic "hit rate" metric exists at all. It's answering "did I get my money back on those expensive writes?" You need at least 2 reads to break even on a 5-minute cache, or 3 on a 1-hour one.

### And this is exactly why your chip says 100%

Your two providers are **OpenRouter** and **local llama.cpp**. Every model you've actually run — Kimi K3, DeepSeek V4, GPT-5.6, GLM-5.2, Grok 4.5, Qwen, Gemma — is in **Family A**. Automatic caching, one number reported.

So the app receives "reads: 2,275,712" and nothing at all for writes. It fills the blank with zero. Then it computes `reads ÷ (reads + writes)` = `reads ÷ reads` = **100%, forever, by arithmetic**.

The chip isn't measuring your caching. It's measuring a number that doesn't exist on the providers you use.

---

## Part 3: What YouCoded currently receives

I checked every recorded turn across all your native sessions. 507 turns. Cache-write tokens: **zero, every single time.**

Two separate reasons, stacked:

1. **Most of your models genuinely don't have the concept.** Family A. Nothing to report.
2. **Even where the number exists, the app throws it away.** OpenRouter *does* publish a `cache_write_tokens` field. But YouCoded talks to OpenRouter through a generic OpenAI-compatible translation layer, and that layer hardcodes the cache-write slot to "unknown" — it was built to the OpenAI format, which has no such field. The number arrives and is discarded before the app ever sees it.

The **read** side is real and working. Your caching is genuinely excellent — most turns are reusing 95–99% of the conversation. You just can't see that, because the chip is showing you a different question's answer.

### A second, smaller bug found along the way

The per-message "cached %" inside a chat bubble uses a different formula: `reads ÷ (input + output + reads + writes)`. But on your providers, the `input` number **already includes** the cached reads — so they get counted twice in the denominator.

Real example from your sessions: a turn with 331,432 input tokens of which 327,168 came from cache. True reuse: **98.7%**. What the bubble displays: **49%**. It roughly halves the real figure. Understated, not overstated — so it's been quietly making your caching look mediocre when it's near-perfect.

---

## Part 4: What metrics would actually be useful

Ranked by how much they'd tell you, given what you actually run.

### 1. Context reuse — "how much of what I sent was recycled" ⭐ recommended

> **reads ÷ total input tokens**

Every provider on earth reports both numbers, including local models. No translation-layer problem, no missing fields, works today with zero new plumbing.

It answers the question you actually have: *is my long conversation costing me full price, or is it mostly being reused?* On your real data this ranges from 0% to 99.9% — genuine variation, genuine signal.

And it's *diagnostic*. When it drops, something broke the cache — you switched models, a tool changed, you were idle too long. That's the moment you'd want to know, and right now nothing tells you.

Displayed as `Reuse: 99%` it means something on every model you own.

### 2. Money saved this session

> **cached tokens × (full price − cache price)**

The most legible number possible for a non-technical read: "you saved $0.42." Directly meaningful.

Caveats: the app currently stores only regular input/output prices per model, not the discounted cache-read rate — that's one more field to pull from OpenRouter. And it's meaningless for local models, which cost nothing regardless. Would need to show as "—" there, or be replaced by a time figure.

### 3. Time saved / prefill avoided

The only benefit that exists for local models, and the one you feel most physically. Harder to measure honestly — you'd be estimating "how long would this have taken uncached," which is a guess, not a measurement. Possible but weaker footing.

### 4. Cache breaks — "your cache was invalidated N times"

Purely diagnostic, and arguably the most *actionable* thing on this list, since every break has a cause you could avoid. But it needs inference (a big drop in reuse rate = probably a break) rather than a reported number, so it risks being wrong. Better as a future refinement than a first move.

### 5. The current "hit rate" — retire it

Only means anything on Anthropic-style explicit caching, which you don't use and can't easily use through the current provider setup. Even if the missing number were recovered from OpenRouter, it would still be answering "was the write premium worth it?" — a question that doesn't apply when writes are free.

---

## Recommendation

**Replace "Hit %" with "Reuse %"** (reads ÷ total input), and fix the double-counted denominator in the message bubble so the two agree.

Why this over the alternatives:

- It's **honest on every provider you use**, including local — no chip that only works for hardware you don't own.
- It **needs no new data**. Both numbers are already recorded on all 507 turns. It's a formula change, not a plumbing change.
- It **turns a decorative chip into a diagnostic one**. 100% forever tells you nothing. A number that drops when caching breaks tells you something is wrong at the moment it goes wrong.
- The `Cached: 13.0M` chip beside it already carries the raw volume, so the pair reads naturally: *how much was reused, and what fraction that was.*

**Money saved is the natural follow-on**, once cache-read pricing is pulled from the catalog — but it's a genuinely separate piece of work, and it degrades to a blank on local models, so it shouldn't be the only thing on the bar.

### What you'd experience

- The status bar chip stops being a permanent green 100% and starts moving — typically 90–99% mid-conversation, dropping to 0% on the first message of a new session or after a model switch.
- The color coding becomes meaningful for the first time (green = reusing well, red = paying full price).
- Per-message percentages roughly double, because they stop being halved by the double-count. Nothing changed about your actual caching — the old number was just wrong.
- **The one risk:** a chip that used to be reassuringly perfect will now sometimes show a low number. That's correct behavior, but it will *look* like a regression the first time you see 0% after starting a fresh session. Worth knowing to expect it.

---

## Sources

- [Anthropic prompt caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md) — prefix-match mechanics, write/read pricing multipliers, TTLs, minimum cacheable sizes, silent invalidators
- [OpenRouter prompt caching guide](https://openrouter.ai/docs/features/prompt-caching) — per-provider automatic vs explicit split, `cached_tokens` / `cache_write_tokens` / `cache_discount` reporting fields
- [OpenRouter: What cached tokens cost](https://openrouter.ai/blog/tutorials/prompt-caching-sticky-routing/) — cache discount semantics, negative discount on paid writes
- Local evidence: 507 turn records across `~/.youcoded/sessions/`; `@ai-sdk/openai-compatible` usage conversion (`dist/index.js:89`); `harness-session.ts:2185`; `StatusBar.tsx:1114-1133`; `AssistantTurnBubble.tsx:91`
