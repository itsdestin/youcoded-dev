---
status: shipped
date: 2026-09-05
feature: docs/active/design/2026-09-04-chatgpt-signin/
design: docs/active/specs/2026-09-05-chatgpt-signin-backend-design.md
probe: youcoded/desktop/test-engine/chatgpt-phase0.mjs (run 2026-09-05 01:31–01:34, under Electron 41.10.7 / Node 24.18, Destin's own account)
fixtures: youcoded/desktop/tests/fixtures/chatgpt/ (redacted copies of the bodies below)
tags: [chatgpt, openai, phase0, findings]
---

# Sign in with ChatGPT — Phase 0 findings

One real sign-in, on Destin's ChatGPT account (**free plan**, Google login). Every leg
succeeded. The design's decision rules (§0) applied, one line each, then the shapes the
parsers are written against.

## The five questions

| # | Question | Answer | Decision |
|---|---|---|---|
| P0-1 | Sign-in survives Electron end to end? | **Yes.** `openExternal` resolved, the callback landed with the right `state`, the exchange returned 200. `expires_in` is **864000 s (10 days)**; the reply also carries `earliest_refresh_at` and `oai_is`. | Build as designed. The 5-minute-before-expiry refresh rule stands; 10-day tokens make a refresh rare. |
| P0-2 | Where do the windows come from, in what shape? | **Both legs are real.** `GET /wham/usage` → `rate_limit.primary_window { used_percent, limit_window_seconds, reset_after_seconds, reset_at (epoch SECONDS) }`, `secondary_window` (null on free), `plan_type`, `rate_limit.limit_reached`, `rate_limit_reached_type`. Every `/codex/responses` reply carries `x-codex-primary-used-percent`, `-reset-at` (epoch seconds), `-reset-after-seconds`, `-window-minutes`, the same four for `secondary`, and `x-codex-plan-type`. | Parser handles both; `reset_at` × 1000 → ISO. **Windows are identified by length, not position** — see "the free plan" below. |
| P0-3 | Manifest rows for our `client_version`? | **Yes, more than for the Codex string.** `client_version=1.2.4` → 6 rows (4 `visibility: 'list'`: gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.4-mini; 2 `hide`: gpt-reserve, codex-auto-review). `0.130.0` → 3 rows (rows carry `minimal_client_version`, and 1.2.4 clears every one). | The app sends its own version. Listed = `visibility === 'list'`. |
| P0-4 | Tool follow-up without a reasoning item? | **Accepted (200).** Step 1 returned a `function_call` and **no reasoning item at all** on this plan/model; step 2 with just `function_call` + `function_call_output` streamed a normal answer. | The encrypted-reasoning carry (§4.7) is **not built**; filed on the roadmap. |
| P0-5 | Non-streaming call refused? | **Yes: HTTP 400 `{"detail":"Stream must be set to true"}`** for the SDK's exact `generateText` body. | `wrapGenerate` in the middleware **is built** (§4.2), and the title path is pinned to `stream: true`. |

## The free plan changes one thing the screens assumed

The approved bars, chips and `/usage` rows are labelled **5h** and **7d** because a Plus/Pro
plan has exactly those windows. Destin's free account reports **one window, 30 days long**
(`limit_window_seconds: 2592000`, `x-codex-primary-window-minutes: 43200`) and **no secondary
window**. Drawn as approved it would show two empty bars. Put to Destin on words deck W-2
(`chatgpt-signin.words-2.json`): label bars by the real window length (Plus keeps 5h/7d,
free shows one 30d bar) or show nothing for windows that are not 5h/7d. The parser therefore
reports each window with its **length in minutes**; the mapping to the shared
`ChatGptUsage` keys is `300 → five_hour`, `10080 → seven_day`, and anything else goes to an
`other` list the renderer labels by length (if W-2 = a) or drops (if W-2 = b).

## Shapes (from the fixtures)

- **Claims.** Access token: `payload["https://api.openai.com/auth"]` → `chatgpt_account_id`,
  `chatgpt_plan_type`, `chatgpt_user_id`, `poid`; `payload["https://api.openai.com/profile"]`
  → `email`, `email_verified`, `name`. ID token: `email`, `name`, `auth_provider`, and the same
  `auth` object with `organizations[]` (`id`, `is_default`, `role`, `title`) and
  `chatgpt_subscription_active_until` (null on free). **Email comes from either token**; the
  access token's `profile` claim is enough, so the id token is stored but not required.
- **`/wham/accounts/check`.** `accounts[] { id, plan_type, structure, is_deactivated,
  can_access_with_session, account_user_role, … }`, `default_account_id`. No refusal text
  here — `is_deactivated` / `can_access_with_session: false` are booleans. The blocked state's
  reason still comes from a refused request's `error.message`; these two booleans can make the
  card blocked at sign-in with a fixed sentence only if OpenAI's own text is absent — the
  design keeps "OpenAI's words verbatim", so they are logged, not shown.
- **`/wham/profiles/me`.** `profile { username, display_name, profile_picture_url }` and usage
  stats. Not used by the feature (the card shows the email).
- **Manifest row** (kept fields): `slug`, `display_name`, `description`, `visibility`,
  `context_window` (272000 on every listed row), `max_context_window`, `input_modalities`
  (`['text','image']`), `supported_reasoning_levels[] { effort, description }`,
  `default_reasoning_level`, `supports_parallel_tool_calls`, `available_in_plans[]`,
  `minimal_client_version`, `priority` (lower = earlier), `supported_in_api`. Dropped from the
  fixture: `model_messages` / `base_instructions` (OpenAI's own Codex prompt, ~200 KB; not
  ours to send). Sort listed rows by `priority` ascending.
- **Streamed function call item** (`response.output_item.done`): `{ type: 'function_call', id,
  call_id, name, arguments, status }` — the AI SDK's Responses path already parses this.
- **`response.completed` usage**: `input_tokens`, `output_tokens`, `total_tokens`,
  `input_tokens_details.cached_tokens`, `output_tokens_details.reasoning_tokens` — the SDK
  maps these; nothing to add.
- **Other headers on a reply**: `x-codex-turn-state` (opaque, ~340 chars; the Codex CLI echoes
  it back — we do not, and P0-4's second step worked without it), `x-models-etag`,
  `x-codex-active-limit`, `x-codex-credits-*`. Ignored.

## What was NOT observed

- A 429 body (the account is at 0 %). The limit parser is written from pi's source
  (`error.code` in `usage_limit_reached | usage_not_included`, `error.resets_at`, `error.plan_type`)
  and pinned against a hand-written fixture in that shape; the first real 429 anyone sees
  should be saved into `tests/fixtures/chatgpt/` and the fixture replaced.
- A 403 / blocked account. Same treatment.
- A refresh (`grant_type=refresh_token`). Written from pi's source; pinned with a fake.
