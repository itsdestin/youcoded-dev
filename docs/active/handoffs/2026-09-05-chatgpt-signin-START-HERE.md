---
status: active
date: 2026-09-05
tags: [chatgpt, openai, providers, native-runtime, handoff, feature-flow]
feature: docs/active/design/2026-09-04-chatgpt-signin/
branches:
  youcoded: feat/chatgpt-signin
  youcoded-dev: design/chatgpt-subscription
---

# Sign in with ChatGPT — start here

**Where this stands.** The screens are designed, approved by Destin across five review
decks (2026-09-04/05), and built in the workbench on `youcoded` `feat/chatgpt-signin`
against **mock-only** channels. Nothing talks to OpenAI yet. The next stage is the build
stage of `.claude/rules/feature-flow.md`: contract → technical design → capped review →
task breakdown → subagent build → acceptance deck.

**Why this path and not Codex.** `docs/active/investigations/2026-09-04-chatgpt-subscription-paths.md`.
Short version: OpenAI's leadership publicly welcomed ChatGPT plans inside third-party
apps (July 2026), which is the path the 2026-08-31 Codex spec had ruled out; the plan's
models now reach YouCoded's own assistant directly, every existing feature works
unchanged, and the Codex agent stays a separate, parked idea.

## What the approved screens are (the decks are the record)

`docs/active/design/2026-09-04-chatgpt-signin/` — `chatgpt-signin.questions.json` (six
decisions, all the recommended option), then `review.json` … `review-5.json`, each with its
`.answers.json`. The contract (`chatgpt-signin.contract.json`) is written from those answers
by a fresh agent; its rows are the definition of done.

In one paragraph: Settings → Model Providers has two groups, **Cloud Models** (Claude Code,
ChatGPT, OpenRouter, then any API-key providers) and **Local Models** (the engine, then any
custom endpoint whose address is this computer). Every provider is one card shape: name with
an (i), one grey status line, one button top-right, plan bars underneath when signed in.
The ChatGPT card has four states: signed out (Sign in with ChatGPT), waiting (spinner +
Cancel), signed in (email, plan name, 5-hour and 7-day bars, Sign out), and blocked (OpenAI's
refusal reason in the destructive colour). First run offers Log in with Claude / ChatGPT /
OpenRouter and "Use an API key or local model"; the Skip-setup link is gone. In a
conversation on a ChatGPT model the status bar shows the plan's 5h/7d chips (click → Model
Providers), the /usage card names the ChatGPT plan, and a used-up window shows "You have
reached ChatGPT's 5-hour session limit (Resets @ 6:43pm)." with one **Switch Providers**
button that opens the model picker. The picker labels the provider **ChatGPT Plan**.

## What is real and what is mock on `feat/chatgpt-signin`

Real (renderer, ships as-is): the components and their copy; `shared/chatgpt-types.ts`
(account state machine, `chatGptLimitMessage`/`isChatGptLimitMessage`, plan label);
`shared/provider-types.ts` (`'chatgpt'` provider type, `isLocalEndpoint`);
`components/plan-windows.tsx` (the shared 5h/7d bars, now also used by UsageCard);
`hooks/use-provider-type.ts` (model id → provider type, via the catalog);
`state/usage-snapshot.ts` (`subscriptionPlan`); StatusBar's `usagePlan` prop; App's
`chatgptUsage` on status data; AttentionBanner's `onSwitchProviders`.

Mock (the backend to-do list, `dev/workbench/mock-only.ts`):

| Channel | What main must do |
|---|---|
| `chatgpt.status` | Read the stored account: signed-out / waiting / signed-in {email, plan, usage} / blocked {reason} |
| `chatgpt.signIn` | Start the OAuth round-trip and open the browser; flip to waiting; flip to signed-in on callback |
| `chatgpt.cancelSignIn` | Stop the loopback listener; back to signed-out |
| `chatgpt.signOut` | Delete the tokens from the secrets store; provider row `ready` → false |
| `firstRun.startAuth('chatgpt')` | Same round-trip from the wizard; `authMode: 'chatgpt'` while waiting |
| `firstRun.startAuth('openrouter')` | **Separate feature** — OpenRouter's own sign-in per `docs/active/specs/2026-08-31-openrouter-connection-trust-design.md`, unbuilt; the button exists, the backend does not |
| `status:data.chatgptUsage` | The plan's two windows, pushed beside Claude's; pruned by `pruneExpiredUsage` like Claude's |
| `providers.list` row `type: 'chatgpt'` | `ready` = signed in; `providers.catalog` rows for the plan's models |

Not built anywhere yet: the **request path** (the provider-registry case that turns a bound
`chatgpt` model into an AI SDK model), the **model list** (which models the plan exposes),
the **usage read**, and the **limit error** (the `usage_limit_reached` 429 → a
`session-error` carrying `chatGptLimitMessage`).

## The mechanism to build (verified 2026-09-04 against pi's source)

- **Sign-in:** browser OAuth against `https://auth.openai.com/oauth/authorize` with PKCE,
  scope `openid profile email offline_access`, callback `http://localhost:1455/auth/callback`,
  the Codex CLI's public client id (`app_EMoamEEZ73f0CkXaXp7hrann`), token endpoint
  `https://auth.openai.com/oauth/token`; refresh tokens; the ChatGPT account id and plan
  come out of the token's `https://api.openai.com/auth` claim. A device-code variant exists
  (`/api/accounts/deviceauth/usercode`) for machines without a browser — not in the approved
  screens; later.
- **Requests:** `https://chatgpt.com/backend-api/codex/responses`, the Responses API shape,
  headers `Authorization: Bearer`, `chatgpt-account-id`, `originator` (identify as
  YouCoded, honestly — pi sends `pi`), `OpenAI-Beta: responses=experimental`; body must have
  `store: false`, `stream: true`, a non-empty `instructions`; `include:
  ["reasoning.encrypted_content"]`; `prompt_cache_key` per session for caching.
  `@ai-sdk/openai@4.0.51`'s Responses path already accepts `store`, `promptCacheKey` and
  that `include`, plus a custom `baseURL`/`headers` — so the provider-registry case is
  `createOpenAI({...}).responses(modelId)` with those options, not a new client.
- **Limits:** a 429 / `usage_limit_reached` code with a reset time → `chatGptLimitMessage`.
  Usage windows: the app-server exposes `account/rateLimits/read`; the direct endpoint's
  usage read is what pi/OpenClaw poll — confirm the URL in Phase 0 of the technical design
  before writing the chip code.
- **Policy footing:** publicly welcomed, not contractual. Ship behind a kill switch
  (`YOUCODED_CHATGPT=0`, mirroring `YOUCODED_NATIVE`), and the blocked state carries OpenAI's
  own words.

## Decisions Destin made that a builder must not undo

- Name: **ChatGPT** (card), **ChatGPT Plan** (picker/chip). Not "OpenAI".
- The honesty (i): OpenAI welcomes this but has not written it into its terms; if it stops,
  the card says so and the app keeps working.
- Every plan's models, grouped under the provider; no curated short list.
- Plan usage is always visible (bars on the card, chips, usage card), not only near the limit.
- The limit card is his wording exactly, with **Switch Providers** → model picker. No
  auto-switch, no guessed alternative, no billing sentence.
- No green "connected" text; one card shape for every provider; buttons top-right; no
  per-provider eyebrow headings; Web Search keeps its heading.
- First run: three sign-ins stacked full width, Claude filled; "Use an API key or local
  model"; **the Skip-setup link is removed on every wizard step** — a terminal install now
  signs in like everyone else.
- A custom endpoint on this computer files under Local Models; elsewhere under Cloud.

## Open items (not blocking the build)

- The first-run link says "or local model" but opens the Anthropic key box; a local-model
  route on that screen is its own step later (deck round 2, P-5 notice).
- OpenRouter sign-in backend — the 2026-08-31 spec; the button is on the first-run card.
- Android: the native runtime does not exist there yet (M8); the screens are shared React
  and will render, the sign-in cannot run. Gate the ChatGPT card on `native.supported`
  exactly as the popup already is.
- Team/Enterprise accounts where an admin has disabled Codex: sign-in succeeds, requests
  fail → the blocked state; the reason text must be OpenAI's.
- The workbench's wb-3 session is now bound to the ChatGPT catalog (`gpt-5.6-sol`) and
  carries the `chatgpt.jsonl` conversation; `?planLimit=1` shows the limit card,
  `?chatgpt=signed-out|waiting|signed-in|blocked` pins the card state, `?planUsage=1`
  adds the Claude plan's windows, `?authMode=chatgpt|openrouter` pins the wizard.

## Tooling that came out of this session

- `review-cards.py record <spec> '<paste>'` — a deck answered as a plain file (no server)
  pastes its copy box back and this writes the submitted answers file. Born because the
  first deck's browser-open failed silently and the file path was pasted instead of the URL.
- The `ui-mockup` skill now says: hand Destin the `[deck] http://…` line, never the `.html` path.
- `scripts/ui-review/plans/chatgpt-signin.json` — eleven shots covering every approved surface.
