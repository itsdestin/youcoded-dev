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
YouCoded sent the session id only as the body key:
<!-- claim: {"path": "youcoded/desktop/src/main/providers/chatgpt-model.ts", "contains": "promptCacheKey: cacheKey"} -->
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

## Next candidates (as ranked at first; outcomes below)

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

## Follow-up measurements (same day, YouCoded with the `session-id` fix)

**Retention.** GPT-5.6+ (incl. Luna) has a fixed 30-minute sliding cache TTL
(`prompt_cache_options.ttl` accepts only `30m`); `prompt_cache_retention` is rejected with a 400 on
the ChatGPT backend (openai/codex#39397, #39392). No client sends a retention field there. Nothing to build.

**Tool loop** (`live-tool-comparison.mjs`, `2026-09-23-luna-tool-loop-results.jsonl`, 5 rounds):
YouCoded steps inside a reply hit 32/35. `x-codex-turn-state` echo would target only the 3 misses —
dropped. (OpenCode rows there hold only each reply's last step; fixed in the lifecycle runner.)

**Lifecycle** (`live-lifecycle-comparison.mjs`, `2026-09-23-luna-lifecycle-results.jsonl`, 3 rounds:
t1,t2 tools → full process restart + resume → t3 → forced compaction → t4,t5):

| | YouCoded | OpenCode 1.18.31 |
|---|---|---|
| Requests with any cache hit | 45/45 | 27/38 |
| Input served from cache | 85% | 67% |
| First request after restart | 3/3 hit | 2/3 |
| Compaction summary request | 3/3 hit (shares the chat prefix) | 0/3 (separate ~1.4k-token prompt) |
| First request after compaction | 3/3 hit (static prefix) | 3/3 |

Caveat: conversations stayed ~7k tokens, so cached history beyond the ~5.6k static prefix shows
only as the 6,656-token reads; a real threshold compaction on a long history was not exercised.

## Outcomes of the candidate list

1. `<env>` last — done, branch `fix/native-prompt-cache-order` (Anthropic splits the system prompt
   at `ENV_OPEN`). Not measurable on the rig (fixture is not a git repo). It does NOT fix the
   roadmap item "reopening a compacted conversation the next day restores the whole history" —
   the checkpoint still sees a changed date.
2. Tool-list stability — dropped: the list only changes on a model swap (which resets the cache
   anyway) or a first skill appearing; zero changes across 30 measured requests.
3. `x-codex-turn-state` — dropped (32/35 within-reply hits already).
4. Content-hash cache key — not pursued; first-turn hits rose to 9/10 with the header alone.
5. WebSocket deltas — not needed.
6. Longer retention — impossible on GPT-5.6+ (see Follow-up measurements).
7. llama.cpp `--cache-reuse` — dropped. Probed on b10665 with Qwen3.5-2B and Gemma-4-E2B: both
   log "cache_reuse is not supported by this context, it will be disabled"; answers identical.
   Qwen 3.5/3.6 (hybrid) and Gemma 4 (SWA) are 10 of the 11 curated local models; gpt-oss is SWA
   too (not probed). Revisit only if a plain-attention model is added.
8. Helpers forking from the parent's cached opening — filed under native-harness → specialists,
   likely to be dropped.
