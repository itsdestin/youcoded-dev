---
status: active
date: 2026-09-23
type: investigation
tags: [native-harness, chatgpt, prompt-cache, opencode, pi, hermes, codex]
---

# ChatGPT-plan cache affinity: why YouCoded missed, and what's next

## Measurement

`scripts/luna/live-repeat-comparison.mjs`: the same 3-message no-tool conversation, 10 rounds per
client, alternating order, 10 s gaps, no restart, `gpt-5.6-luna` on the ChatGPT plan. Raw rows:
`2026-09-23-luna-repeat-results.jsonl` (baseline) and `…-session-id-fix.jsonl` (fix).

| Run | Client | Turns 2–3 hit | Turn 1 hit | Full-price input (30 requests) |
|---|---|---|---|---|
| baseline | YouCoded | 13/20 | 3/10 | 92,519 |
| baseline | OpenCode 1.18.31 | 18/20 | 0/10 | 84,965 |
| fix | YouCoded + `session-id` | 18/20 | 9/10 | 44,910 |
| fix | OpenCode (control) | 16/20 | 0/10 | 96,300 |

YouCoded's own diagnostics showed every missed turn was a pure append (instructions, tools,
settings, cache key unchanged), so the misses were routing, not prefix churn.

## Cause

The Codex backend derives cache affinity from the `session-id` **header**, not only the body
`prompt_cache_key` (codex-rs `core/src/client.rs`: "ChatGPT derives cache affinity from the
Responses session-id header"). Codex, OpenCode, pi and Hermes all send it; YouCoded sent none.
Fix: `transformParams` in `desktop/src/main/providers/chatgpt-model.ts` adds `session-id` and
`x-client-request-id` = the session id. Branch `fix/chatgpt-session-id-cache` (youcoded), verify.sh green.

Why turn-1 hits rose to 9/10 is unexplained (new session ⇒ new key); do not claim a mechanism.

## Client comparison (2026-09-23, source-read)

| | YouCoded | OpenCode | pi | Hermes | codex-rs |
|---|---|---|---|---|---|
| `session-id` header | fix adds | yes (+`X-Session-Id`, `x-session-affinity`) | yes | `session_id` | yes |
| `prompt_cache_key` | session id | session id | session id | **hash(scope+instructions+tools)** | session id |
| echo `x-codex-turn-state` within a turn | no | no | no | no | **yes** |
| WebSocket + `previous_response_id` deltas | no | experimental | yes (auto) | no | yes (default) |
| item ids on replay | kept | stripped | kept | reasoning ids stripped | non-server ids stripped |

## Next candidates (ranked)

1. Move volatile `<env>` lines (date, git branch/dirty count — `harness/prompt-assembly.ts:163-173`)
   below the stable instructions/CLAUDE.md/skills, so same-project conversations share a longer
   prefix. Helps every provider; Anthropic (direct or OpenRouter) needs no routing for it.
2. Keep the tool list fixed for a session's life (Skill added lazily, MCP re-adds, Task/ModelSearch
   toggles — `harness-session.ts:1290-1406`); any change breaks the cache on every provider.
3. Echo `x-codex-turn-state` on requests within one turn (tool loops); `chatgpt-auth.ts` already
   reads `x-codex-*` response headers.
4. Hermes-style content-hash cache key for cross-conversation sharing — test with concurrent
   sessions first (a hot key may spill across servers).
5. WebSocket transport with deltas — large; only if 1–4 leave a gap.

OpenRouter already sends `session_id` (`providers/prompt-cache.ts`); whether it forwards
`prompt_cache_key` to OpenAI models is unverified. Items 1–2 apply to it.
