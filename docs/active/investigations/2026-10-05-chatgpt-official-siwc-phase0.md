---
status: active
date: 2026-10-05
probe: youcoded/desktop/test-engine/chatgpt-siwc-phase0.mjs (three runs 2026-10-05, Node, Destin's own account)
replaces: the Codex-client-id route measured in docs/archive/investigations/2026-09-05-chatgpt-phase0-findings.md
tags: [chatgpt, openai, siwc, phase0, findings]
---

# Official Sign in with ChatGPT (SIWC): phase 0 findings

OpenAI launched SIWC on 2026-09-29. Locally run, open-source apps get self-serve access
(docs: developers.openai.com/siwc/token-sharing-open-source/*). Today's feature borrows the Codex
CLI's client id (`app_EMoamEEZ73f0CkXaXp7hrann`) and the private `chatgpt.com/backend-api/codex`
route. OpenAI's SIWC docs never mention that route.

**Licence:** the probe was written from the public docs, not from OpenAI's `@siwc/local` SDK. The
SDK's licence is "Sign-in with ChatGPT DevKit Noncommercial License v1.0", so app code must not
copy it. Nobody has read the SIWC terms page (openai.com/policies/sign-in-with-chatgpt-terms/). It
returned 403 to our fetcher and needs to be read by a person.

## Wire facts, measured

| | Official route | Today's Codex route |
|---|---|---|
| Discovery | `https://auth.openai.com/.well-known/openid-configuration` | — |
| Authorize | `https://auth.openai.com/api/accounts/authorize` | `/oauth/authorize` |
| Token | `https://auth.openai.com/api/accounts/oauth/token` | `/oauth/token` |
| Revoke | `https://auth.openai.com/api/accounts/oauth/revoke` (200; refresh afterwards → 400 `invalid_grant` / `error_reason: refresh_token_invalidated`) | none |
| Client id | first sign-in sends `client_id=dynamic_agent_client` + `agent_name_hint=YouCoded` + `ext_agent_host_id=urn:uuid:…`; the callback returns `code, scope, state, client_id` (`oaiapp_…`, 31 chars). It is **new per sign-in** unless the issued id is reused | fixed Codex id |
| Consent screen | says "YouCoded" (seen by Destin) | says Codex |
| Redirect | `http://127.0.0.1:<any port>/auth/callback`; ephemeral port 42775 worked, so **no port 1455 clash with Codex** | fixed `localhost:1455` |
| Extra authorize params | `resource=https://api.openai.com/v1`, `nonce`, scope `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct` | — |
| Access token | **1 h** (`expires_in: 3600`), JWT whose `auth` claim is opaque (`per_user_salt`, `encrypted_auth_metadata`); **no account id, no plan type** | 10 days, carries account id + plan |
| id_token | `sub`, `email`, `email_verified`, `name`, `nonce` (matched) | email, plan, orgs |
| Refresh | 200, **rotates** the refresh token, `resource` in the body | not rotating |
| Inference | `POST https://api.openai.com/v1/responses`, `Authorization: Bearer` only, no account header | `chatgpt.com/backend-api/codex/responses` + `chatgpt-account-id` |
| Models | `GET https://api.openai.com/v1/models` → `{models:[…]}`, **the same manifest row shape as `/codex/models`** (`slug, display_name, visibility, priority, context_window 272000, supported_reasoning_levels, input_modalities…`). Listed: gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna (7 rows) | `/codex/models?client_version=` |
| Usage windows | **none.** `/wham/usage` → 401 `rejected_by_access_enforcement`; no `x-codex-primary-*` headers on replies (header names: `x-codex-safety-buffering-*`, `x-codex-turn-state`, `x-models-etag`, `x-oai-request-id`) | `/wham/usage` + reply headers |

## Behaviour, measured (model gpt-6-astra unless noted)

- **Tools work:** step 1 returned a `function_call`. Step 2 sent back the call and its output with no
  reasoning item, and got a normal message.
- **Accepted, despite the docs' "preview limitations" list:** `reasoning.effort`,
  `reasoning.summary`, `include: ['reasoning.encrypted_content']`, `prompt_cache_key`,
  `max_output_tokens`, `parallel_tool_calls`, and image input.
- **Non-streaming refused:** 400 `{"detail":"Stream must be set to true"}`. Same as today, so the
  existing `wrapGenerate` collapse still applies.
- **Caching needs the affinity header, as on the Codex route:** without it, 0 of 5 repeats were
  cached (2.4k and 5.4k-token prefixes, with and without `prompt_cache_key`). With
  `session-id` + `x-client-request-id` (what `chatgpt-model.ts` sends today), the third of three
  repeats read 5,248 of 5,413 tokens from cache. One run is not a hit rate. Measure real sessions
  with the Luna rig after the switch.
- **Plan eligibility:** Destin's account was granted `chatgpt.tokens.use.direct` and every call
  succeeded. The docs say plan usage needs Plus or Pro. Destin's plan was free on 2026-09-05; his
  current plan is not recorded here.
- **Revocation** kills the refresh token. The 1 h access token keeps working until it expires.

## Usage hunt (run 4, `--usage-hunt`; Destin asked for another way to read usage)

The answer is no: the official route exposes no source of plan usage.
- **GET with the SIWC token:**
  - `v1/me`, `chatgpt.com/backend-api/wham/usage` → 401 `rejected_by_access_enforcement`.
  - `v1/usage` → 401 "Incorrect API key".
  - `v1/rate_limits`, `v1/chatgpt/usage`, `v1/subscription_sharing/usage`, `v1/organization/usage` → 404.
  - `backend-api/codex/usage`, `backend-api/me` → 403 Cloudflare page.
  - `auth.openai.com/userinfo` → an HTML page.
- **Codex dress:** `originator: codex_cli_rs` + `version` → **400**, refused outright. `OpenAI-Beta: responses=experimental` changes nothing.
- **Responses WebSocket** (`wss://api.openai.com/v1/responses`, `{type:'response.create', …}`) works, with or without `OpenAI-Beta: responses_websockets=…`.
  - Events: `codex.response.metadata` (the same headers as HTTP: turn-state, safety buffering, models etag), `responsesapi.websocket_timing` (latency plus `engine_cached_prompt_tokens_total`), and the normal stream.
  - **No `codex.rate_limits` event.**
  - `response.completed` shows `prompt_cache_retention: "24h"` applied by default.

## What changes for the app

1. `chatgpt-oauth.ts` / `chatgpt-auth.ts`: discovery endpoints, dynamic client id persisted in
   `chatgpt-account.json` and reused on the next sign-in, `resource` + `nonce`, an ephemeral
   127.0.0.1 port (drop the port-1455 error), rotating refresh written before use, revoke on sign-out.
2. `chatgpt-model.ts`: base URL `https://api.openai.com/v1`, no `chatgpt-account-id`. Keep the
   `session-id` headers.
3. Models: same parser, new URL.
4. **Usage bars, the usage card's ChatGPT windows, the status bar chips and the plan name have no
   source**: a UI decision (questions deck `2026-10-05-chatgpt-official-siwc`).
5. Account identity is the id_token `sub`, not `chatgpt_account_id`. The continuation identity
   (`provider-registry.ts` `continuationIdentity`) changes, so old continuations must not be reused
   across the switch.
6. Error codes to map: `subscription_sharing_usage_limit_exceeded` (429, or a mid-stream
   `response.failed`), `subscription_sharing_user_not_eligible` (403), `subscription_sharing_invalid_user`
   (401 → sign in again), and refresh failures `invalid_grant` / `refresh_token_*`.
