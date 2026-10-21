---
status: active
---

# Custom providers that know their models, and a manual catalog refresh

Built on session/custom-providers-catalog (plan docs/active/plans/2026-10-21-custom-providers-backend.md).

Destin, 2026-10-20: Mercury 3 (Inception, released 2026-10-19) was live on OpenRouter but
absent from the model picker; an Anthropic key added through "Add provider" showed a model
list and prices with no visible source. Goal: a user who adds any API provider or custom
endpoint gets a correct model list, context size and price without knowing how the app finds
them, and can pull new releases on demand.

## What exists today (verified 2026-10-20)

**Where model data comes from** — `desktop/src/main/providers/model-catalog.ts`:

| Provider type | Model list source | Context / price / tools |
|---|---|---|
| OpenRouter | `openrouter.ai/api/v1/models` | yes / yes / yes |
| Anthropic, OpenAI, Google (direct key) | `models.dev/api.json`, keyed by TYPE (`MODELSDEV_KEY`) | yes / yes / yes |
| ChatGPT plan | the plan's own manifest (`chatgpt-auth.ts`, hourly) | own data |
| Local engine | llama.cpp `GET /models` | read from `/props` |
| Custom endpoint (`openai-compatible`) | **none** — line 295 | **none** |

- Both web catalogs share one cache: `<userData>/provider-catalog-cache.json`, 24 h TTL
  (`TTL_MS`), plus an in-memory memo with the same TTL. Nothing can force a refetch; a restart
  doesn't either (the disk cache is still fresh).
- The user's key is never used to list models for direct-key providers; it is used by
  **Test** only (`testConnection`, which already calls each provider's `/models`).
- Custom endpoints: `contextLengthFor` returns `null` → the harness assumes **32,768**
  (`harness/compaction.ts:41`, `harness-session.ts:1881`). Mercury 3 has 1,000,000.
- The picker shows a custom endpoint's models only as a "Type a model name… · <label>" row,
  and only while searching (`ModelPicker.tsx` `freeformProviders`, ~1089).
- Empty search reads "No models match." with no action (`ModelPicker.tsx` ~1128).

**Coverage of the free sources** (measured 2026-10-20):
- models.dev: 231 providers, 9,075 models; all carry context and `tool_call`, 8,621 carry
  cost; **206 providers publish their API base URL** (e.g. `inception` →
  `https://api.inceptionlabs.ai/v1/`). It listed `mercury-3` (1M, $0.10/$0.35) within a day.
- Endpoint `/models` without a key: Inception answers with context and pricing
  (OpenRouter-shaped rows); Ollama cloud answers ids only; OpenAI, Mistral, Groq, Together,
  xAI, DeepSeek, Fireworks refuse (401) — their keyed shapes were not inspected.
- Anthropic `/v1/models` (docs): the key's own models with `max_input_tokens` and
  `capabilities`, no price. Google `/v1beta/models` (docs): `inputTokenLimit`, no price.

## Design — two sources, nothing per-vendor

A model's facts come from the first source that has them:

1. **models.dev**, matched for a custom endpoint by its **normalized base URL** (lowercase
   host + path, trailing `/` and a trailing `/v1` stripped on both sides). Direct-key types
   keep matching by type, as today.
2. **The endpoint's own `GET <base>/models`** with the saved key — for endpoints models.dev
   doesn't know (a home server, Ollama, a company proxy). Read `id` always; read
   `context_length` / `pricing` only when present (OpenRouter-shaped servers such as
   Inception send them). Cached beside the web catalogs under the same TTL and refresh.

**Unknown context window** (decided `custom-providers-questions#Q-2`, Destin: "make the default
for unknown context windows more reasonable (like 250k or 500k)… skip allowing custom
per-provider context setting for now"): no user-set field. The 32,768 fallback in
`compaction.ts:41` / `harness-session.ts:1881` is replaced by one shared constant —
**250,000 for a cloud address, 32,768 kept for an address on this computer**
(`isLocalEndpoint`) — confirmed by Destin in chat 2026-10-20 ("okay, sounds good!"). Why the split: a too-large guess on a
small server sends more than it can read, and a home Ollama/LM Studio default is often
4k–32k; cloud models are rarely under 128k. Paired with **overflow recovery for custom
endpoints**: `context-overflow.ts` recognises only Anthropic, OpenRouter, local engine and
ChatGPT today, so extend it to the OpenAI-style `error.code === "context_length_exceeded"`
envelope for `openai-compatible` providers — then an overestimate costs one automatic
summary-and-retry instead of a failed turn. The catalog's own value always wins when known.

**Out of scope** (decided 2026-10-20, "simplest solution"; Q-2): per-vendor adapters for
Anthropic/Google model lists, any user-set context size (per provider or per model), per-fact source tracking, local-engine
rescan from the refresh button (its `?reload=1` is a write that unloads models —
`engine-local-models.md`).

### Manual refresh

- **Where:** the picker's empty-search state ("No models match.") gains a **Refresh model
  list** button — the only entry point (`custom-providers-questions#Q-3`: picker only).
- **What it does:** bypasses memo and disk TTL; refetches OpenRouter + models.dev in
  parallel, each custom endpoint's `/models`, and kicks the ChatGPT manifest refresh. Then
  the picker re-reads the catalog and re-runs the same search.
- **Result line:** "Up to date — N new models" / "Up to date — no new models" / per-source
  failure through `<ErrorState>` with Try again, naming the source that failed
  (`docs/error-message-standards.md`). A failed source keeps its previous data (existing
  `allSettled` behaviour).
- **Cooldown:** one refresh in flight at a time (single-flight); a second click while
  running joins it. No timed lockout needed — two small GETs.
- **Plumbing:** new `providers:refresh-catalog` channel in `backend-contract.ts`, served by
  the one channel table (desktop + phone doors). Phone policy: allowed (read-only, no
  secrets returned).

## Saved connection checks for every provider (from ux-review-1#U1)

Today only OpenRouter stores the result of a key check (`openrouter-health.ts` →
`provider-health.json`, `ProviderStatus.health`). Every other row forgot a failed Test the
moment Settings closed and read "Connected" again. Build: `testConnection` records the
same verdict shape for `anthropic`, `openai`, `google` and `openai-compatible`
(401/403 → rejected, network failure → unchecked, 2xx → verified), keyed to the key's
fingerprint so a replaced key clears it; the row reads it (`ProvidersSection.tsx`
`savedRefusal`).

## Prompt-cache reuse for direct keys and custom endpoints (proposed, Destin asked 2026-10-20)

Today (`providers/prompt-cache.ts`, `chatgpt-model.ts`, `harness/cache-usage.ts`):
- Request shaping exists for **Anthropic direct** (`cache_control` markers, 1h), **OpenRouter**
  (`session_id` pin + Claude markers) and **ChatGPT plan** (`prompt_cache_key`). The direct
  **OpenAI**, **Google** and **custom-endpoint** branches send nothing.
- Most OpenAI-compatible services cache by prefix automatically (DeepSeek documents this:
  api-docs.deepseek.com/guides/kv_cache) — there is no marker to send; what earns hits is a
  stable prefix, which the harness already keeps (env snapshot last, warm-prefix summaries).
- Reads are counted from `usage.prompt_tokens_details.cached_tokens` only
  (`@ai-sdk/openai-compatible` 3.0.42). **DeepSeek reports `prompt_cache_hit_tokens`
  instead**, so its hits count as 0 and the cost estimate charges them at full input price.
- Cached prices: 4,394 of 6,438 priced OpenAI-compatible models on models.dev carry a
  `cache_read` price, which custom endpoints receive once matched by base URL.

Proposed (small, no UI):
1. A `metadataExtractor` on the `openai-compatible` branch reading DeepSeek-style
   `prompt_cache_hit_tokens`, read by `cacheTokensForStep` as a fallback (same pattern as
   OpenRouter's cache writes). Pin with a recorded response shape.
2. Direct **OpenAI** key: pass `promptCacheKey: cacheKey` (the session key ChatGPT already uses).
3. No markers for generic endpoints — nothing standard exists to send.
4. Google implicit caching: unverified here; out of scope until checked.

## UX review of "Add provider" and provider rows (today, pictured 2026-10-20)

Surfaces: Assistant settings → Cloud providers (`ModelProvidersPopup.tsx` `OpenRouterBlock`
→ `ProvidersSection embedded="cloud"`), Local models (`embedded="local"`), the model picker.
Reference surfaces for the redesign: the OpenRouter card (status line + one action), the
ChatGPT card (detail line), Local models' model rows (Settings button per row).

| # | Problem today | Proposed |
|---|---|---|
| U1 | **Type defaults to Anthropic; Name is required and blank** ("e.g. My OpenAI"). The user must invent a name before anything works. | Name pre-fills from the type ("Anthropic") or the matched service ("Inception"); editable. |
| U2 | **"Custom endpoint (OpenAI-compatible)"** — jargon; user must already know the base URL. | Add a **Service** search (from models.dev's 206 providers with URLs) that fills the URL and name; "Other address…" keeps the free URL field. (Q-1: search by name) |
| U3 | **"API key (optional)"** for Anthropic/OpenAI/Google, where it is required. | "API key" (required) for direct types; "(optional)" only for custom/local addresses. |
| U4 | **Adding never tests.** The Test happens only on Add key / Test; a bad key or URL surfaces later as a chat error. | Add = save + test; the row shows the result immediately. A failed test still saves (user may fix the key), shown in the row's notice. (Q-5: save with notice) |
| U5 | **Rows say only "Connected" / "Needs API key"** — nothing about what you get. | Detail line: "17 models" / "3 models, listed by your endpoint" / nothing extra when unknown (no Set action — Q-2). |
| U6 | **Nothing is editable after adding** — wrong URL means Remove and re-add. | A **Settings** button per row (Local models' pattern): name, address, key. No context size (Q-2). |
| U7 | **A local address added on Cloud providers silently moves** to Local models. | After saving, a one-line note: "Saved under Local models — it runs on this computer." (Q-4: move with a note) |
| U8 | **Custom endpoint models are invisible in the picker** until you search and pick "Type a model name…". | Its `/models` (layer 2) or models.dev rows (layer 1) appear like any catalog rows; the typed-name row stays only when both are empty. |
| U9 | **Picker empty search is a dead end.** | Refresh model list (above). |

## Decisions (`custom-providers-questions`, submitted 2026-10-20)

- **Q-1** Add provider searches services by name (`service-search`).
- **Q-2** No user-set context size; raise the unknown-window default instead (Other — see
  "Unknown context window"). 250k cloud / 32k local, confirmed in chat 2026-10-20.
- **Q-3** Refresh only in the picker's empty search (`picker-only`).
- **Q-4** A local address moves to Local models with a note (`move-with-note`).
- **Q-5** A failed check on Add still saves, with the problem on the row (`save-with-notice`).

## Tests (planned)

- `model-catalog.test.ts`: base-URL normalization matches (`/v1`, `/v1/`, host case); a
  custom endpoint gets models.dev rows; the endpoint list parses id-only and OpenRouter-shaped rows;
  force refresh bypasses memo + disk; a failed source keeps stale data.
- `contextLengthFor`: models.dev by base URL, then endpoint `/models`, then null; the
  harness default is the shared unknown-window constant (cloud vs local address).
- `context-overflow.test.ts`: OpenAI-style `context_length_exceeded` recognised for a
  custom endpoint; other 400s are not.
- Channel parity: `ipc-channels.test.ts`, `channel-table-*` for `providers:refresh-catalog`.
- `ModelPicker.test.tsx`: empty search shows Refresh; result line; error state; re-runs search.
- Shoot screens: picker empty-search (+ refreshing, + failed), add-provider form states, row
  detail states.
