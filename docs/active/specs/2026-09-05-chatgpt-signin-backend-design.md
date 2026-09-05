---
status: active
date: 2026-09-05
type: technical-design
feature: docs/active/design/2026-09-04-chatgpt-signin/
contract: docs/active/design/2026-09-04-chatgpt-signin/chatgpt-signin.contract.json
handoff: docs/active/handoffs/2026-09-05-chatgpt-signin-START-HERE.md
branches:
  youcoded: feat/chatgpt-signin
  youcoded-dev: design/chatgpt-subscription
tags: [chatgpt, openai, providers, native-runtime, oauth, technical-design]
---

# Sign in with ChatGPT — backend technical design

**What this is.** The build-stage design for the backend behind the approved screens. The
screens, their copy and the contract are settled (21 rows); this document says what main
does when each of them is used, what it stores, what it reuses, and what it must never do.
It is written to be handed to a builder who has not read the decks.

**What is fixed by the contract and not reopened here:** the names (ChatGPT / ChatGPT
Plan), the four card states, the plan's models grouped under the provider with no curated
list, plan usage always visible, the limit card's exact wording with **Switch Providers**,
the first-run card, and a kill switch.

---

## 0. Phase 0 — two facts a real account must confirm before production code

Both are checked by one throwaway probe, `youcoded/desktop/test-engine/chatgpt-phase0.mjs`,
run under the Electron binary so it lives in the same process environment the app's main
process has (`npx electron test-engine/chatgpt-phase0.mjs`). It opens the browser once,
takes the callback on `localhost:1455`, and prints redacted findings to the terminal. It
never writes a token to disk and never prints one.

| # | Question | Why it gates the build | What the probe prints |
|---|---|---|---|
| P0-1 | Does the sign-in survive Electron's child environment? The loopback listener on `127.0.0.1:1455`, `shell.openExternal` of the authorize URL, and the callback landing back in main. | If Electron's sandbox, a firewall prompt, or a port collision breaks any leg, the whole card is a spinner that never ends. The design has no second route. | `callback: received state=ok code=present`, the token exchange status, and the decoded claims with values redacted to their shape (`email: d***@***`, `chatgpt_plan_type: plus`, `chatgpt_account_id: 8 chars…`). |
| P0-2 | Which URL do the 5-hour and 7-day windows come from, and in what shape? | The chips, the card bars, the `/usage` card and the limit card all read one snapshot. Codex CLI polls `GET https://chatgpt.com/backend-api/wham/usage`; the app-server calls it `account/rateLimits/read`. Field names are not documented anywhere public; two sources agree on `rate_limit.primary_window` / `secondary_window` and a `plan_type`, nothing more. | The raw JSON of `/wham/usage` (no secrets in it), the raw JSON of `/codex/models?client_version=…`, the raw JSON of `/wham/accounts/check`, and every `x-codex-*` header on one tiny `/codex/responses` call. |

**Decision rule.** P0-1 fails → stop; the fallback is the device-code variant
(`/api/accounts/deviceauth/usercode`), which is not on an approved screen, so that would go
back to a deck. P0-2 answers which of three usage sources is real: (a) `/wham/usage` polled,
(b) `x-codex-*` response headers on every turn, (c) both — the parser in §4.4 is written for
(c) and drops whichever leg the probe shows empty. If the models manifest has no listable
rows, §4.3 falls back to the ids the responses endpoint accepts (probed one by one), and R3's
"a new model appears when OpenAI ships it" is downgraded to a manual list — which would be
a contract change and go to a deck.

---

## 1. Shape of the whole thing

```
renderer (approved, shipped as-is)
   chatgpt.status / signIn / cancelSignIn / signOut        firstRun.startAuth('chatgpt')
   providers.list (row type 'chatgpt', ready = signed in)  providers.catalog (the plan's models)
   status:data.chatgptUsage                                session-error text = chatGptLimitMessage
          │
preload.ts ── remote-shim.ts ── remote-server.ts (WS) ── SessionService.kt (not-implemented)
          │
main
   providers/chatgpt-auth.ts   the account: state machine, OAuth round-trip, tokens, usage, models
   providers/chatgpt-oauth.ts  pure helpers: PKCE, authorize URL, token exchange/refresh, JWT claims, parsers
   providers/provider-registry.ts   case 'chatgpt' → @ai-sdk/openai Responses model + middleware + fetch wrapper
   providers/model-catalog.ts       'chatgpt' branch → the plan's models from the manifest
   providers/secrets-store.ts       (unchanged) the encrypted token blob
   first-run.ts                     handleChatGptLogin()
   ipc-handlers.ts                  four handlers, the usage field on status:data, the runtime bundle
```

One new stateful class (`ChatGptAuth`), one new pure module, one case each in two existing
classes, four IPC channels, one first-run method. No new process, no new dependency.

---

## 2. Data on disk

All of it in Electron's **userData** directory — never in `~/.youcoded`, which syncs across
devices. A signed-in card on a second machine that holds no tokens would be a lie, and the
encrypted blob cannot be decrypted elsewhere anyway (the SecretsStore rule).

| File | Holds | Written by |
|---|---|---|
| `native-secrets.json` (exists) | one more ref → `safeStorage`-encrypted blob; the blob is JSON `{ access_token, refresh_token, id_token, expires_at }` | `SecretsStore.set` |
| `chatgpt-account.json` (new) | `{ v: 1, secretRef, accountId, email, plan, blocked?: { reason, at }, usage?: ChatGptUsage & { at }, models?: { rows: CatalogModel[], at } }` | `ChatGptAuth` under `mutateFileUnderLock` (the SecretsStore's lock helper), so the dev instance and the built app cannot tear it |

`plan` is OpenAI's own string (`plus`, `pro`, `team`, `free`, …), title-cased only in the
renderer. `email` comes from the id token. `usage` and `models` are caches so the card, the
picker and the chips draw instantly on launch and keep working offline; both carry `at` and
are refreshed per §4.4 / §4.3.

**Sign-out deletes the secret first, then the account file** — the same order
`ProviderRegistry.remove` uses, for the same reason (an orphaned ciphertext blob is
unreachable forever; an orphaned account row is just re-deletable).

`~/.youcoded/providers.json` gains one built-in row, seeded by `ProviderRegistry.init()`
exactly like `local` and `openrouter`:

```
{ id: 'chatgpt', type: 'chatgpt', label: 'ChatGPT Plan', enabled: true }
```

`label` is what the model picker and the status chip show (contract R11/R16). The Settings
card's title is the literal "ChatGPT" in `ModelProvidersPopup.tsx`, already built.

---

## 3. The account state machine — `ChatGptAuth`

```
signed-out ──signIn()──▶ waiting ──callback ok──▶ signed-in
    ▲                      │  │                       │
    │     cancelSignIn() ◀─┘  └─ callback error /     │ 401 that a refresh cannot fix
    │        or 10 min          state mismatch        │ (signOut() from any state)
    └───────────────────────────────────────────────◀─┘
signed-in ──403 / accounts-check says no──▶ blocked ──signOut()──▶ signed-out
```

`status()` returns the `ChatGptAccountStatus` union in `shared/chatgpt-types.ts`, untouched:

- `signed-out` — no account file, or the file's secret is missing/undecryptable (a copied
  userData from another machine reads as signed-out, never as signed-in-but-broken).
- `waiting` — the loopback listener is up and the browser has been opened. In-memory only;
  a relaunch during a sign-in is signed-out (the listener died with the process).
- `signed-in { email, plan, usage }` — the file exists and its secret decrypts. `usage` is
  the cache, already pruned of windows whose reset time has passed (the renderer prunes
  again; both sides prune so neither can show last night's bar).
- `blocked { email, reason }` — the file carries `blocked`. `reason` is **OpenAI's text
  verbatim** from the response that refused us; never a guess (error-message standard).

**Verbs** (all four return `boolean` — the renderer's contract, from the mock):

- `signIn()` — if already `waiting`, returns true (the browser is re-opened, the same
  listener is kept). Otherwise: generate PKCE verifier + challenge and a 16-byte `state`;
  bind `127.0.0.1:1455`; on `EADDRINUSE` return false and log the port (the renderer shows
  "Could not open the sign-in page." — specific enough; the log has the port); build the
  authorize URL; `shell.openExternal`; state → `waiting`; arm a 10-minute timer that closes
  the listener and returns to `signed-out`. Returns true as soon as the browser is asked to
  open, not when the sign-in finishes — the card polls `status()` every second while
  `waiting`.
- `cancelSignIn()` — close the listener, clear the timer, `signed-out`. True.
- `signOut()` — close any listener, delete the secret, delete the account file, drop caches,
  `signed-out`. True. Never contacts OpenAI (no revoke endpoint is documented; the refresh
  token simply stops being used).
- `accessToken()` (main-internal) — returns a live access token, refreshing through
  `grant_type=refresh_token` when fewer than 5 minutes remain, under a single in-flight
  promise so two concurrent turns cannot double-refresh. A refresh that fails with 400/401
  → the account is signed-out (secret deleted) and the caller gets a plain-language error:
  "Your ChatGPT sign-in has expired — sign in again in Settings → Model Providers." Any
  other failure (network) → the caller's request fails with that reason and the account is
  left as it was.

**The callback.** A single `http.createServer` on `127.0.0.1:1455` serving exactly
`GET /auth/callback`: state must equal the one we generated (else 400, no exchange), `code`
present (else the page shows OpenAI's `error_description` verbatim and the state goes
`signed-out`). On success it exchanges the code (`POST /oauth/token`,
`application/x-www-form-urlencoded`, `grant_type=authorization_code`, `client_id`, `code`,
`code_verifier`, `redirect_uri`), decodes the claims, writes the secret and the account
file, replies with a small "You can close this tab and return to YouCoded." page, closes the
listener, and — in the same tick — kicks `refreshUsage()` and `refreshModels()` so the
card's bars and the picker are filled by the time the renderer's next 1-second poll lands.

Constants (verified against pi's source on 2026-09-04, re-read 2026-09-05):

```
CLIENT_ID     app_EMoamEEZ73f0CkXaXp7hrann       (the Codex CLI's public client id)
AUTHORIZE     https://auth.openai.com/oauth/authorize
TOKEN         https://auth.openai.com/oauth/token
REDIRECT      http://localhost:1455/auth/callback  (registered for this client; not ours to change)
SCOPE         openid profile email offline_access
CLAIMS        access token payload["https://api.openai.com/auth"] → chatgpt_account_id, chatgpt_plan_type
              id token payload → email
```

`chatgpt_plan_type` is the plan shown on the card and in `/usage`; `/wham/usage` also
reports a `plan_type` and, when both exist, the usage one wins (it is the live one).

---

## 4. The request path

### 4.1 The registry case

```ts
case 'chatgpt': {
  if (!this.chatgpt) throw new Error('ChatGPT sign-in is turned off in this build.');
  const acct = await this.chatgpt.signedInAccount();   // throws the plain-language "sign in" error
  const token = await this.chatgpt.accessToken();
  const provider = createOpenAI({
    apiKey: token,
    baseURL: 'https://chatgpt.com/backend-api/codex',
    headers: { 'chatgpt-account-id': acct.accountId, originator: 'youcoded', 'OpenAI-Beta': 'responses=experimental' },
    fetch: this.chatgpt.fetchFor(binding.modelId),
  });
  return wrapLanguageModel({ model: provider.responses(binding.modelId), middleware: chatGptMiddleware(opts?.cacheKey, acct) });
}
```

Not a new client: `@ai-sdk/openai@4.0.51`'s Responses path already sends `store`,
`include`, `instructions`, `prompt_cache_key` and `stream: true` from its provider options
(`node_modules/@ai-sdk/openai/dist/index.js` lines 6636–6717). The `apiKey` is the access
token — the SDK turns it into `Authorization: Bearer`. `originator` is `youcoded`: the
investigation's rule is to identify honestly, never as the Codex CLI.

### 4.2 The middleware — what every request must carry

`wrapLanguageModel` with one `transformParams` middleware (from `ai`), so the harness stays
untouched apart from one optional field:

| Body field | Value | Why |
|---|---|---|
| `store` | `false` | the endpoint refuses `true`; we keep the transcript ourselves |
| `stream` | `true` | the SDK always streams for `streamText`; asserted by the fetch wrapper in dev |
| `instructions` | the harness's system text, or `"You are YouCoded's assistant."` when empty | the endpoint refuses an empty `instructions`; a system-role input item is not accepted in its place, so the middleware moves the prompt's system message here and sets `systemMessageMode: 'remove'` |
| `include` | `["reasoning.encrypted_content"]` | reasoning comes back encrypted and must ride the transcript verbatim on the next turn; the SDK does the carrying once asked |
| `prompt_cache_key` | the session id | caching; `ModelFactory`'s opts gain `cacheKey?: string` and both `modelFactory(...)` calls in `harness-session.ts` pass `this.opts.sessionId` |

`temperature` is left alone (the SDK omits it when unset; the reasoning models reject it).

### 4.3 The model list

`GET https://chatgpt.com/backend-api/codex/models?client_version=<our app version>` with
the bearer token and `chatgpt-account-id` (the manifest the Codex CLI and the headroom proxy
read; Phase 0 dumps its shape). `ChatGptAuth.refreshModels()` parses it into `CatalogModel`
rows — `id` = the manifest `slug`, `label` = its display name (or the slug title-cased),
`providerId: 'chatgpt'`, `contextLength` when given, `supportsTools: true`,
`supportsReasoning` when the row lists reasoning levels — dropping rows the manifest marks
hidden, and caches them in the account file. `ModelCatalog.get` gains an
`else if (p.type === 'chatgpt' && this.chatgptModels)` branch mirroring the `local-engine`
one: rows come from an injected `() => Promise<CatalogModel[]>`, failure degrades to the
cached rows, then to none. Refreshed at sign-in and at most hourly on `providers.catalog`.
No pricing rows — the plan is not per-token, and pricing.ts is emphatic that absent means
absent, never `$0`.

That is what makes contract R3 true: every plan's models, and a new model on OpenAI's next
manifest, with no list in our code.

### 4.4 Usage — the two windows

`ChatGptUsage` (`shared/chatgpt-types.ts`, same shape as Claude's `SubscriptionUsage`):
`five_hour` / `seven_day` each `{ utilization, resets_at }`.

Two legs, per the Phase 0 decision rule:

- **Poll** `GET /wham/usage` (bearer + `chatgpt-account-id`) at sign-in, every 5 minutes
  while signed in, and once right after any turn on a ChatGPT model ends. The Codex CLI
  polls it every 60 s from an idle terminal; five minutes plus the per-turn refresh keeps the
  bars honest with a tenth of the traffic.
- **Headers** on every `/codex/responses` reply (`x-codex-primary-*`,
  `x-codex-secondary-*`, if the probe shows them) read by the fetch wrapper — free, and
  the freshest possible number right after the turn that spent it.

Whichever arrives later wins. `primary_window` → `five_hour`, `secondary_window` →
`seven_day`, `used_percent` → `utilization`, and the reset time — whether it arrives as
seconds-from-now or an epoch — is normalised to an ISO `resets_at`. The snapshot rides
`status:data` as `chatgptUsage` (App already reads it, prunes it, and routes it to a
session bound to a ChatGPT model). `buildStatusData` adds one line.

### 4.5 The limit — `usage_limit_reached`

The fetch wrapper turns a **429** whose body carries `error.code` matching
`usage_limit_reached` / `usage_not_included` into a thrown `Error` whose message is exactly
`chatGptLimitMessage(window, resetsAt)`:

- window: `5-hour` when the reply's reset is under 5 h away or the body names the primary
  window; `weekly` otherwise — and the usage snapshot is set to 100 % on that window at the
  same reset time, so the bars and the card agree.
- `resetsAt`: `error.resets_at` (pi reads it as epoch-ms), else `retry-after`, else the
  window's own reset from the last usage snapshot.

A thrown plain `Error` is **not retried** by the SDK (it retries only `APICallError`s
marked retryable) and `describeProviderError` returns a usable message verbatim, so the
turn ends with a `session-error` whose text is the limit sentence, which
`isChatGptLimitMessage` recognises and the approved plan-limit card renders with **Switch
Providers**. No auto-switch, no guessed alternative, no billing sentence (Destin's
decisions). Any other 429 (a burst rate limit) stays an `APICallError` and keeps the SDK's
own backoff.

### 4.6 Refusals — the blocked state

- **401** from `/codex/responses` → one refresh, one retry; a second 401 → signed-out with
  the expired-sign-in message above.
- **403** (or a 4xx whose body says the workspace/plan has no Codex access) → the account is
  marked `blocked` with `error.message` verbatim, and the turn fails with that same text.
  The card shows it on the red line beneath "Signed in as …" with Sign out (R13).
  `/wham/accounts/check` at sign-in is used for the same purpose when Phase 0 shows it
  carries a refusal; otherwise the first request is the check.
- A blocked account **stays listed** in `providers.list` with `ready: false`, so the plan's
  models leave the picker but the card keeps its Sign out.

---

## 5. Surfaces

| Channel | preload (`chatgpt` ns) | remote-shim | remote-server WS | Android | main |
|---|---|---|---|---|---|
| `chatgpt:status` | `status()` | `invoke('chatgpt:status')` | `nativeRuntime.chatgptAuth.status()` | not-implemented list (no native runtime until M8; the card is already gated on `native.supported`) | `ipcMain.handle` |
| `chatgpt:sign-in` | `signIn()` | same | same, **but returns false** on a remote client — the browser must open on the desktop that holds the listener, and a phone cannot finish a `localhost:1455` round-trip | same | same |
| `chatgpt:cancel-sign-in` | `cancelSignIn()` | same | same | same | same |
| `chatgpt:sign-out` | `signOut()` | same | same | same | same |

Plus `chatgpt.supported: process.env.YOUCODED_CHATGPT !== '0'` on the preload namespace,
mirroring `native.supported`. Guarded by a new `chatgpt:* channel parity` block in
`tests/ipc-channels.test.ts` shaped like the `arcade:*` one, with the Android assertion
being "listed in the not-implemented fall-through" (the permissions/specialists precedent),
and the shim sending an object payload or nothing. The four rows then come off `MOCK_ONLY`
(`workbench-mock-contract.test.ts` forces it).

`firstRun.startAuth('chatgpt')` needs no new channel: `first-run:start-auth` already
carries a mode; main.ts's two handlers (early and late first-run) gain the `'chatgpt'` arm
calling `firstRunManager.handleChatGptLogin(chatgptAuth)`, which sets `authMode:
'chatgpt'` and the "Waiting for you to sign in…" line, awaits the round-trip's completion
promise, and on success marks auth installed and advances to `LAUNCH_WIZARD` → `COMPLETE`
exactly like `handleOAuthLogin`. Cancel/timeout → `authMode: 'none'` with `lastError`
"Sign-in was cancelled." / "Sign-in timed out. Try again?". `'openrouter'` is refused with a
logged "not built" — the separate feature.

**`status:data`** gains `chatgptUsage` (§4.4). **`providers.list`**: the registry's `ready`
for `type === 'chatgpt'` is `enabled && chatgpt.isSignedIn()` (not blocked, secret
present). **`providers.catalog`**: §4.3.

**Remote** clients see the card (shared React) and can sign out; sign-in returns false
there, so the card says "Could not open the sign-in page." — accurate, if terse. A better
line for the phone is a later step; noted in §9.

---

## 6. The kill switch — `YOUCODED_CHATGPT=0`

Mirrors `YOUCODED_NATIVE`. When set:

- preload's `chatgpt.supported` is false → the renderer hides the ChatGPT card and the
  first-run button (two one-line gates on the approved screens; nothing else changes).
- `ProviderRegistry` is constructed with `chatgpt: null`: the built-in row is **still
  seeded** (so turning the flag back on needs no migration) but `list()` omits it,
  `languageModel` refuses it with "ChatGPT sign-in is turned off in this build.", and the
  catalog contributes nothing.
- The four handlers still exist (parity) and answer `signed-out` / `false`.

Tokens already stored are left alone; the flag is a fast revert, not a sign-out.

---

## 7. Reuse — what is not written

- `SecretsStore` for the tokens (encrypted at rest, machine-bound, never in `~/.youcoded`).
- `mutateFileUnderLock` for the account file.
- `@ai-sdk/openai`'s Responses path, `wrapLanguageModel` from `ai`.
- `describeProviderError` → `session-error` → the approved card; `pruneExpiredUsage`;
  `buildStatusData`'s 10-second push; `isChatGptLimitMessage`.
- `FirstRunManager`'s state machine and its `handleOAuthLogin` shape.
- The pure-core / IO-shell pattern from `github-auth.ts`: `ChatGptAuth` takes `fetch`,
  `openExternal`, `listen` and `now` as injected functions with real defaults, so every state
  transition is unit-tested with no network, no browser and no port.

---

## 8. Tests that pin it

| Test | Pins |
|---|---|
| `tests/chatgpt-oauth.test.ts` | PKCE challenge is S256 of the verifier; authorize URL carries client id, scope, redirect, state, challenge; JWT claim decoding; usage and manifest parsers against the Phase 0 fixtures (recorded JSON, secrets stripped); the 429 → limit-sentence mapping including window choice and reset normalisation |
| `tests/chatgpt-auth.test.ts` | every arrow in §3 with injected I/O: state mismatch never exchanges; cancel closes the listener; 10-minute expiry; sign-out deletes the secret before the file; refresh under one in-flight promise; a 401 refresh failure signs out; a 403 blocks with the verbatim reason; a copied userData reads signed-out; `EADDRINUSE` returns false |
| `tests/provider-registry.test.ts` (extended) | the built-in row seeds; `ready` follows sign-in; the chatgpt case sends `store:false`, `include`, non-empty `instructions`, `prompt_cache_key`, the three headers and `originator: youcoded`; no `system` input item; the kill-switch refusal |
| `tests/model-catalog.test.ts` (extended) | chatgpt rows come from the injected source, degrade to the cache, then to none; hidden rows dropped; no pricing |
| `tests/ipc-channels.test.ts` | the five-surface parity block |
| `tests/workbench-mock-contract.test.ts` | forces the four rows off `MOCK_ONLY` |
| `tests/first-run-chatgpt.test.ts` | `handleChatGptLogin` state transitions: waiting line, success → COMPLETE, cancel/timeout → `authMode: 'none'` with the error line |
| `tests/status-data-chatgpt.test.ts` (or an extension of the existing buildStatusData test if one exists) | `chatgptUsage` rides the push and is `null` when signed out |

`bash scripts/verify.sh` green before any claim of done.

---

## 9. Decisions made here (assumptions), and what stays open

Made here, as technical defaults — each is visible to the user, so each is named:

1. **A waiting state expires after 10 minutes** on both surfaces (the card and the wizard):
   the listener closes and the card returns to "Not signed in" with no message; the wizard
   shows "Sign-in timed out. Try again?". Claude's own wizard flow gives 2 minutes; ten is
   generous for a phone-based 2FA. The handoff lists the timeout as never decided on a deck;
   this is the default until a deck says otherwise.
2. **Usage polling at 5 minutes** plus per-turn refresh (§4.4).
3. **Model list refresh** at sign-in and hourly (§4.3), cached for offline.
4. **A remote client cannot start the sign-in** (§5).
5. **`originator: youcoded`** and the app version as `client_version`.

Open, not blocking, unchanged from the handoff: the pay-per-use warning (dropped by the
approved round-3 wording — nothing here reintroduces it), the first-run "or local model"
route, the OpenRouter sign-in backend, Android's native runtime (M8), and a friendlier
remote line for "sign in on your computer".

---

## 10. Sources

- pi: `badlogic/pi-mono` `packages/ai/src/auth/oauth/openai-codex.ts` (constants, PKCE,
  callback, exchange, refresh, claims) and `packages/ai/src/api/openai-codex-responses.ts`
  (endpoint, headers, forced body fields, 429 codes, `resets_at`) — re-read 2026-09-05.
- Codex CLI: `openai/codex` issue #10869 (the 60-second `/wham/usage` poll);
  `steipete/CodexBar` `docs/codex.md` (`rate_limit.primary_window` / `secondary_window`,
  `additional_rate_limits[]`); `johnknott` gist (bearer + `ChatGPT-Account-ID` on `/wham`).
- Models manifest: `chopratejas/headroom` PR #519 (`/backend-api/codex/models?client_version=`,
  bearer + `chatgpt-account-id`, `slug` / `visibility`).
- In-repo: `desktop/node_modules/@ai-sdk/openai/dist/index.js` 6636–6717 (body assembly),
  `node_modules/ai/dist/index.d.ts` (`wrapLanguageModel`), `src/main/github-auth.ts`
  (the injected-I/O pattern), `src/main/first-run.ts` (`handleOAuthLogin`),
  `src/main/ipc-handlers.ts` `buildStatusData`, `tests/ipc-channels.test.ts` (`arcade:*`).
