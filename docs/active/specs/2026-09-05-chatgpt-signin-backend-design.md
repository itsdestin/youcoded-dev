---
status: active
date: 2026-09-05
type: technical-design
feature: docs/active/design/2026-09-04-chatgpt-signin/
contract: docs/active/design/2026-09-04-chatgpt-signin/chatgpt-signin.contract.json
handoff: docs/active/handoffs/2026-09-05-chatgpt-signin-START-HERE.md
reviews:
  - docs/active/reviews/2026-09-05-chatgpt-signin-design-review-1.md
  - docs/active/reviews/2026-09-05-chatgpt-signin-design-review-2.md
branches:
  youcoded: feat/chatgpt-signin
  youcoded-dev: design/chatgpt-subscription
tags: [chatgpt, openai, providers, native-runtime, oauth, technical-design]
---

# Sign in with ChatGPT — backend technical design

**What this is.** The build-stage design for the backend behind the approved screens. The
screens, their copy and the contract are settled (21 rows); this document says what main
does when each of them is used, what it stores, what it reuses, and what it must never do.
It is written to be handed to a builder who has not read the decks. Revised after review
rounds 1 and 2 (every accepted finding is folded in; the review files record which).

**What is fixed by the contract and not reopened here:** the names (ChatGPT / ChatGPT
Plan), the four card states, the plan's models grouped under the provider with no curated
list, plan usage always visible, the limit card's exact wording with **Switch Providers**,
the first-run card, and a kill switch.

---

## 0. Phase 0 — what a real account must confirm before production code

One throwaway probe, `youcoded/desktop/test-engine/chatgpt-phase0.mjs`, run under the
Electron binary so it lives in the same process environment the app's main process has
(`npx electron test-engine/chatgpt-phase0.mjs`). It opens the browser once, takes the
callback on `localhost:1455`, and prints redacted findings. It never writes a token to disk
and never prints one. The listener leg was already run under Electron on 2026-09-05 with
the browser skipped: it bound `127.0.0.1:1455` and rejected a forged callback (state
mismatch → 400). The rest needs a real sign-in.

| # | Question | Why it gates the build | What the probe prints |
|---|---|---|---|
| P0-1 | Does the sign-in survive Electron's environment end to end? `shell.openExternal` of the authorize URL, the callback landing back in main, the code exchange. | If any leg breaks, the whole card is a spinner that never ends. The design has no second route. | `browser: openExternal resolved`, `callback: received state=ok code=present`, the exchange status, the claims with values redacted to their shape (`email: d***@***`, `chatgpt_plan_type: plus`, `chatgpt_account_id: 8 chars…`). |
| P0-2 | Which URL do the 5-hour and 7-day windows come from, and in what shape? | The chips, the card bars, `/usage` and the limit card all read one snapshot. Codex CLI polls `GET https://chatgpt.com/backend-api/wham/usage`; field names are not documented anywhere public. | The raw JSON of `/wham/usage`, `/wham/accounts/check`, `/wham/profiles/me`, and every `x-codex-*` / rate-limit header on one tiny `/codex/responses` call. |
| P0-3 | Does the models manifest list rows for **our** `client_version`? | The app sends YouCoded's version, not the Codex CLI's; if the manifest gates on the caller's version, R3 would be graded against a list obtained with someone else's string. | `/codex/models` fetched twice — with the version read from `desktop/package.json` (under `npx electron <script>`, `app.getVersion()` is Electron's own number, not the app's) and with a Codex-shaped one — both bodies saved, and each leg prints the string it sent. |
| P0-5 | Is a **non-streaming** call refused? | The native auto-title feeder calls `generateText` on the registry model (`ipc-handlers.ts` 2497), which sends no `stream: true`. If the endpoint refuses it, the middleware must fold a stream into a generate result; if it accepts, only the title path is pinned. | One `/codex/responses` call with `stream: false`; its status and body. |
| P0-4 | Does a tool turn work without an encrypted reasoning item on the follow-up? | The harness keeps text and tool calls in history, not reasoning. With `store: false` nothing about the model's reasoning survives to the next step unless we carry it. If the endpoint refuses a `function_call_output` step whose `function_call` has no reasoning beside it, carrying is required, not an optimisation. | A two-step call: one function tool, the model's `function_call`, then the same input plus a `function_call_output` **without** the reasoning item; the HTTP status and first SSE events of step 2. |

**Decision rules.** P0-1 fails → stop; the fallback is the device-code variant, which is not
on an approved screen, so that goes back to a deck. P0-2 decides which of the two usage legs
in §4.4 is real (poll, headers, or both); the parser is written for both and the build drops
whichever the probe shows empty. P0-3: the app sends its own version if the manifest lists
rows for it, else the Codex-shaped string the probe used, recorded in the design. P0-4:
step 2 succeeds → the reasoning carry is filed as a later improvement (§9); step 2 is
refused → the carry in §4.7 is built in this feature and the task breakdown grows by one
task. P0-5: refused → `wrapGenerate` in §4.2 is built; accepted → dropped, the title path
is still pinned to a body with `stream: true` either way.

---

## 1. Shape of the whole thing

```
renderer (approved, shipped as-is, plus two one-line gates on chatgpt.supported)
   chatgpt.status / signIn / cancelSignIn / signOut        firstRun.startAuth('chatgpt')
   providers.list (row type 'chatgpt', ready = signed in)  providers.catalog (the plan's models)
   status:data.chatgptUsage                                session-error text = chatGptLimitMessage
          │
preload.ts ── remote-shim.ts ── remote-server.ts (WS) ── SessionService.kt (not-implemented)
          │
main
   main.ts                          constructs ChatGptAuth, passes it to the IPC layer and both first-run managers
   providers/chatgpt-auth.ts        the account: state machine, OAuth round-trip, tokens, usage, models
   providers/chatgpt-oauth.ts       pure helpers: PKCE, authorize URL, exchange/refresh bodies, JWT claims, parsers, error mapping
   providers/provider-registry.ts   case 'chatgpt' → @ai-sdk/openai Responses model + middleware + the credential-owning fetch
   providers/model-catalog.ts       'chatgpt' branch → the plan's models from the manifest
   providers/secrets-store.ts       (unchanged) the encrypted token blob
   first-run.ts                     handleChatGptLogin(); the late auth check made provider-aware
   ipc-handlers.ts                  four handlers, the usage field on status:data, the runtime bundle
```

One new stateful class (`ChatGptAuth`), one new pure module, one case each in two existing
classes, four IPC channels, one first-run method. No new process, no new dependency.

**Plumbing.** `main.ts` constructs `ChatGptAuth` once, **inside `createWindow()` immediately
before `registerIpcHandlers`** — i.e. after the dev-profile override at `main.ts` 286
(`app.setPath('userData', …youcoded-${DEV_PROFILE})`). Not beside `remoteServer` at line 260:
that runs before the override, and a `ChatGptAuth` built there would read and write the
**built app's** `native-secrets.json` — the live-app rule broken through a file. It builds its
own `new SecretsStore(app.getPath('userData'))` (the precedent is `mcp-reconciler.ts` 344; the
two instances share one file under one lock) and takes `app.getVersion()` and
`shell.openExternal`. main.ts passes it **in** to `registerIpcHandlers` (a new optional argument
beside `remoteServer`) and to `registerFirstRunIpc` / the late first-run manager.
`registerIpcHandlers` hands it to the `ProviderRegistry` constructor, the `ModelCatalog` (as
the injected model source), the `remoteServer.setNativeRuntime` bundle, and `buildStatusData`.

---

## 2. Data on disk

All of it in Electron's **userData** directory — never in `~/.youcoded`, which syncs across
devices. A signed-in card on a second machine that holds no tokens would be a lie, and the
encrypted blob cannot be decrypted elsewhere anyway (the SecretsStore rule).

| File | Holds | Written by |
|---|---|---|
| `native-secrets.json` (exists) | one more ref → `safeStorage`-encrypted blob; the blob is JSON `{ access_token, refresh_token, id_token, expires_at }` | `SecretsStore.set` |
| `chatgpt-account.json` (new) | `{ v: 1, secretRef, accountId, email, plan, blocked?: { reason, at }, usage?: ChatGptUsage & { at }, models?: { rows: CatalogModel[], at } }` | `ChatGptAuth.mutate(fn)` — the ONE place the file is read-modified-written, under `mutateFileUnderLock` |

**Why the lock.** userData is per instance (the dev instance and the built app never share
this file), so the lock is not about two processes. It is about three writers **inside one
process** — the token refresh, the usage poll and the models refresh — each read-modify-writing
the same JSON. Every write goes through `mutate(fn)`; a torn file would read as signed-out
and sign the user out for no reason.

`plan` is OpenAI's own string (`plus`, `pro`, `team`, `free`, …), title-cased only in the
renderer; it is **overwritten by every usage poll** that reports a `plan_type`, so the card and
`/usage` agree after a plan change. `email` comes from the id token. `usage` and `models` are
caches so the card, the picker and the chips draw instantly on launch and keep working
offline; both carry `at`.

**Sign-out deletes the secret first, then the account file** — the same order
`ProviderRegistry.remove` uses, for the same reason (an orphaned ciphertext blob is
unreachable forever; an orphaned account row is just re-deletable).

**The provider row is virtual — nothing is written to `~/.youcoded/providers.json`.** That
file is shared by every instance on the machine, including Destin's built app and any older
build, and older code renders every non-local type as an API-key card with a Remove button: a
persisted `chatgpt` row would put a stray "ChatGPT Plan" key card into the live app after one
dev launch. Instead `ProviderRegistry` appends

```
{ id: 'chatgpt', type: 'chatgpt', label: 'ChatGPT Plan', enabled: true }
```

to what `readAll()` returns whenever it was constructed with a `ChatGptAuth` (`list()`,
`languageModel()` and `testConnection()` all go through it), and `upsert`/`remove` refuse the
id like the other built-ins. Nothing on disk, so nothing for an older build to misread and
nothing for the kill switch to migrate.

`label` is what the model picker and the status chip show (contract R11/R16). The Settings
card's title is the literal "ChatGPT" in `ModelProvidersPopup.tsx`, already built.

---

## 3. The account state machine — `ChatGptAuth`

```
signed-out ──signIn()──▶ waiting ──callback ok──▶ signed-in
    ▲                      │  │                       │
    │     cancelSignIn() ◀─┘  └─ callback error /     │ 401 that a refresh cannot fix
    │        or timeout         state mismatch        │ (signOut() from any state)
    └───────────────────────────────────────────────◀─┘
signed-in ──403 / accounts-check says no──▶ blocked ──signOut()──▶ signed-out
```

`status()` returns the `ChatGptAccountStatus` union in `shared/chatgpt-types.ts`, untouched:

- `signed-out` — no account file, or the file's secret is absent from the store. A copied
  userData from another machine reads as signed-out, never as signed-in-but-broken.
- `waiting` — an explicit in-memory phase flag, set by `signIn()` and cleared only by the
  four terminal transitions (the post-write success, a callback error, cancel, timeout).
  `status()` checks the flag **before** the file, so the card never flashes "Not signed in"
  during the code exchange; the listener may close whenever. A relaunch during a sign-in is
  signed-out (the flag died with the process).
- `signed-in { email, plan, usage }` — the file exists and `secrets.has(secretRef)`. This is a
  **presence check, no decrypt**: the card polls `status()` every second while waiting, and
  the keychain is touched only by `accessToken()`. `usage` is the cache, pruned of windows
  whose reset time has passed (the renderer prunes again; both sides prune so neither can
  show last night's bar).
- `blocked { email, reason }` — the file carries `blocked`. `reason` is **OpenAI's text
  verbatim** from the response that refused us; never a guess (error-message standard).

`isSignedIn()` (sync, no decrypt) = account file present, secret present, not blocked. It is
what `ProviderRegistry.list()` reads for `ready`, and what the late first-run check reads.

**A generation counter** guards every arrow. `signIn()` **starting a new round**,
`cancelSignIn()` and `signOut()` each bump `generation`; a `signIn()` while already `waiting`
is the same round (same `state`, same verifier, same timer) and bumps nothing; the timeout, the callback's post-exchange write, and the refresh's
post-response write capture the generation when they start and **no-op** (discarding a fresh
token pair) when it has moved. This is what makes a sign-out stick against an in-flight
refresh, a cancel stick against an in-flight exchange, and a stale timer unable to flip a
completed sign-in.

**Verbs** (the four the renderer calls return `boolean` — the mock's contract — and
**throw** only for the verified causes below, which the card already renders verbatim):

- `signIn(opts?: { timeoutMs })` — if already `waiting`, re-opens the browser on the same
  listener, leaves the timer and the generation alone, and returns true. Otherwise, in order: (1) pre-flight
  `safeStorage.isEncryptionAvailable()`; if false, **throw** the SecretsStore's own sentence
  ("Secure key storage is not available on this system…") before any browser opens.
  (2) generate the PKCE verifier + S256 challenge and a 16-byte `state`; bind
  `127.0.0.1:1455`; on `EADDRINUSE` **throw** "Port 1455 is already in use on this computer,
  so YouCoded cannot receive the sign-in. Close the other program using it (often the Codex
  CLI) and try again." (3) build the authorize URL, `shell.openExternal`, state → `waiting`,
  arm the timeout (default 10 minutes; the wizard passes 5). Returns true as soon as the
  browser is asked to open, not when the sign-in finishes.
- `waitForSignIn(): Promise<'signed-in' | 'cancelled' | 'timed-out' | { error: string }>` —
  resolved by the callback, `cancelSignIn()` or the timer; the wizard awaits it. The card
  never calls it (it polls `status()`).
- `cancelSignIn()` — bump generation, close the listener, clear the timer, `signed-out`. True.
- `signOut()` — bump generation, close any listener, stop the usage poll, delete the secret,
  delete the account file, drop caches, `signed-out`. True. Never contacts OpenAI (no revoke endpoint is
  documented; the refresh token simply stops being used).
- `accessToken()` (main-internal) — returns a live access token, refreshing through
  `grant_type=refresh_token` when fewer than 5 minutes remain, under a single in-flight
  promise so two concurrent steps cannot double-refresh. A refresh that fails with 400/401 →
  the account is signed out (secret deleted) and the caller gets "Your ChatGPT sign-in has
  expired — sign in again in Settings → Model Providers." Any other failure (network) → the
  caller's request fails with that reason and the account is left as it was.

**The callback listener.** A single `http.createServer` on `127.0.0.1:1455`. Branches, in
this order, and nothing else:

1. Not `GET /auth/callback` → `404`, no state change.
2. `state` missing or ≠ ours → `400`, **no state change** (a local page must not be able to
   cancel a waiting sign-in without knowing `state`; pinned).
3. `error` present → the page shows a fixed sentence ("Sign-in did not complete. You can close
   this tab and try again in YouCoded."); OpenAI's `error_description` goes to the log and to
   `waitForSignIn`'s `{ error }`, **never into the HTML** (it is attacker-influenced text on a
   localhost origin). State → `signed-out`.
4. `code` present → exchange (`POST /oauth/token`, `application/x-www-form-urlencoded`,
   `grant_type=authorization_code`, `client_id`, `code`, `code_verifier`, `redirect_uri`),
   decode the claims, write the secret and the account file (generation-checked), reply
   "You can close this tab and return to YouCoded.", and kick `refreshUsage()` and
   `refreshModels()` so the bars and the picker are filled by the next 1-second poll. If the
   store throws after the exchange (the keychain vanished mid-flow) → state `signed-out`, the
   page says "YouCoded could not save the sign-in: <the store's message>", and the wizard's
   `waitForSignIn` resolves `{ error }`; the pre-flight in `signIn()` makes this unreachable in
   practice.

Every response carries `Connection: close`; closing the listener calls
`server.closeAllConnections()` so a stray keep-alive cannot hold port 1455 into the next
sign-in. **On timeout the listener stays up for one more minute** answering every request
with a fixed "This sign-in timed out — go back to YouCoded and try again." page, so a user who
finishes in the browser just after the deadline sees that sentence instead of a
connection-refused error; the state is already `signed-out` and the late callback is ignored.

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

---

## 4. The request path

### 4.1 The registry case

```ts
case 'chatgpt': {
  if (!this.chatgpt) throw new Error('ChatGPT sign-in is turned off in this build.');
  const acct = this.chatgpt.signedInAccount();   // throws the plain-language "sign in" / blocked error
  const provider = createOpenAI({
    apiKey: 'chatgpt',                             // placeholder: the fetch below owns the credential
    baseURL: 'https://chatgpt.com/backend-api/codex',
    headers: { 'chatgpt-account-id': acct.accountId, originator: 'youcoded', 'OpenAI-Beta': 'responses=experimental' },
    fetch: this.chatgpt.fetch(),
  });
  return wrapLanguageModel({ model: provider.responses(binding.modelId), middleware: chatGptMiddleware(opts?.cacheKey) });
}
```

Not a new client: `@ai-sdk/openai@4.0.51`'s Responses path already sends `store`,
`include`, `instructions`, `prompt_cache_key` and `stream: true` from its provider options
(`node_modules/@ai-sdk/openai/dist/index.js` 6636–6717). `originator` is `youcoded`: the
investigation's rule is to identify honestly, never as the Codex CLI.

**The fetch owns the credential.** `modelFactory` runs once per *turn*, and a turn is many
steps; the SDK freezes `apiKey` into its header closure at construction. So the bearer is
never given to the SDK: `ChatGptAuth.fetch()` returns a `fetch` that **replaces** the
authorization header on **every** request. The SDK hands the wrapper a plain object whose keys
are already lower-cased (`authorization: 'Bearer chatgpt'`), so the wrapper must not *add* a
`Authorization` key — undici would merge the two into `"Bearer chatgpt, Bearer <real>"` and
every request would 401. It does `const h = new Headers(init.headers);
h.set('authorization', `Bearer ${await accessToken()}`)` and calls the real fetch with
`{ ...init, headers: h }`. `init.body` is a JSON string, so the 401 re-send (§4.6) reuses it
verbatim. Pinned: the captured request has **exactly one** `authorization` value, it equals
the token, the placeholder string appears nowhere in the request, and with an injected
`accessToken` that changes between two calls on one model the second request carries the
second token.

### 4.2 The middleware — what every request must carry

`wrapLanguageModel` (from `ai`, spec v4 — the middleware type is `LanguageModelMiddleware`
from `ai`, not the v3 type in `@ai-sdk/provider`) with one `transformParams`, so the harness
stays untouched apart from one optional field:

| Body field | Value | Why |
|---|---|---|
| `store` | `false` | the endpoint refuses `true`; we keep the transcript ourselves |
| `stream` | `true` | the SDK sends it for `streamText`; the native auto-title feeder calls `generateText` (`ipc-handlers.ts` 2497), which does not — so, if P0-5 shows the endpoint refuses a non-streaming call, the middleware also carries a `wrapGenerate` that runs `doStream()` and folds the parts into a generate result (text, finish reason, usage). Without it every ChatGPT-bound session would stay "New Session" forever, silently (the feeder skips unresolvable models). Pinned: `generateText` on the chatgpt model produces a captured body with `stream: true` |
| `instructions` | the harness's system text, or `"You are YouCoded's assistant."` when empty | the endpoint refuses an empty `instructions`; a system-role input item is not accepted in its place, so the middleware moves the prompt's system message here and sets `systemMessageMode: 'remove'` |
| `include` | `["reasoning.encrypted_content"]` | reasoning comes back encrypted; the SDK adds this itself for `store:false` on a gpt-5 id, so it is redundant on those ids and load-bearing on any other |
| `prompt_cache_key` | the session id | caching; `ModelFactory`'s opts gain `cacheKey?: string` and both `modelFactory(...)` calls in `harness-session.ts` (1468, 1865) pass `this.opts.sessionId` |

`temperature` is left alone (the harness never sets it; the reasoning models reject it).

### 4.3 The model list

`GET https://chatgpt.com/backend-api/codex/models?client_version=<see P0-3>` with the bearer
and `chatgpt-account-id`. `ChatGptAuth.refreshModels()` parses the manifest into
`CatalogModel` rows — `id` = the manifest `slug`, `label` = its display name (or the slug
title-cased), `providerId: 'chatgpt'`, `contextLength` when given, `supportsTools: true`,
`supportsReasoning` when the row lists reasoning levels — drops rows the manifest marks
hidden, and caches them in the account file. A 401/403 on this call is **silent**: the cached
rows stand, and the account transitions (§4.6) happen only on a turn. `ModelCatalog.get`
gains an `else if (p.type === 'chatgpt' && this.chatgptModels)` branch mirroring the
`local-engine` one: rows come from an injected `() => Promise<CatalogModel[]>`, failure
degrades to the cached rows, then to none. Refreshed at sign-in and at most hourly on
`providers.catalog`. **Zero visible rows and no cache** → the picker lists nothing for the
plan and the card stays signed-in; nothing is probed request-by-request (that would spend the
user's plan). No pricing rows — the plan is not per-token, and pricing.ts is emphatic that
absent means absent, never `$0`.

That is what makes contract R3 true: every plan's models, and a new model on OpenAI's next
manifest, with no list in our code.

### 4.4 Usage — the two windows

`ChatGptUsage` (`shared/chatgpt-types.ts`, same shape as Claude's `SubscriptionUsage`):
`five_hour` / `seven_day` each `{ utilization, resets_at }`.

Two legs, per the P0-2 decision rule:

- **Poll** `GET /wham/usage` (bearer + `chatgpt-account-id`) at sign-in, every 5 minutes
  while signed in, and when a `/codex/responses` reply's **headers** arrive (the wrapper
  returns at headers, not at stream end) — **debounced to at most once per 60 s** so a
  ten-step turn costs one poll. The Codex CLI polls every 60 s from an idle terminal.
  **Lifecycle:** the interval is started by the constructor when `isSignedIn()` and by the
  callback on success, stopped by `signOut()` and by the `blocked` transition (a blocked
  account would otherwise 403 every five minutes forever), and `unref()`'d so it never keeps
  a process or a test worker alive. Pinned with an injected timer.
- **Headers** on every `/codex/responses` reply (`x-codex-primary-*`, `x-codex-secondary-*`,
  if the probe shows them) read by the fetch — free, and the freshest number right after
  the step that spent it.

Whichever arrives later wins. `primary_window` → `five_hour`, `secondary_window` →
`seven_day`, `used_percent` → `utilization`, and the reset time — seconds-from-now or an
epoch — is normalised to an ISO `resets_at`. `ChatGptAuth.usageForStatus()` returns the
cached snapshot pruned (pure, unit-tested); `buildStatusData` adds the one line
`chatgptUsage: chatgptAuth?.usageForStatus() ?? null`. `ChatGptAuth.mutate(fn)` retries the
lock exactly as `SecretsStore.mutate` does (five attempts, then a thrown, user-showable error)
— `mutateFileUnderLock` returns `false` when the lock is held, and a `false` treated as success
is the torn-file class §2 exists to prevent. App already reads it, prunes it, and
routes it to a session bound to a ChatGPT model.

### 4.5 The limit — `usage_limit_reached`

The fetch turns a **429** whose body carries `error.code` matching `usage_limit_reached` /
`usage_not_included` into a thrown `Error` whose message is exactly
`chatGptLimitMessage(window, resetsAt)`. It classifies on **`response.clone()`** — the SDK's
own error handler still has to read the body of a 429 that is *not* a plan limit, and a
consumed body would turn OpenAI's real message into the SDK's generic "Failed to process error
response" (pinned: a burst 429 reaches `describeProviderError` with OpenAI's message):

- window: `5-hour` when the reply's reset is under 5 h away or the body names the primary
  window; `weekly` otherwise — and the usage snapshot is set to 100 % on that window at the
  same reset time, so the bars and the card agree. **The weekly sentence needs one wording
  decision** (§9.8): today `chatGptLimitMessage('weekly', …)` renders a clock time only
  ("Resets @ 6:43pm") for a reset up to seven days away, while the 7-day chip beside it says
  "Resets Mon @ 6:43pm". The 5-hour sentence is Destin's exact approved wording and is not
  touched.
- `resetsAt`: `error.resets_at` (pi reads it as epoch-ms), else `retry-after`, else the
  window's own reset from the last usage snapshot.

**The thrown error carries no `statusCode`, `status` or `code` property.** Two retry layers
key on exactly those — the SDK retries `APICallError`s, and the harness's own `withRetry`
(`harness-session.ts` 2965) retries anything with `statusCode === 429` — and
`describeProviderError` appends "(provider error 429)" when a status is present, which would
break R19's exact wording. Pinned: the thrown object has no own `statusCode`/`status`/`code`,
and `describeProviderError(err)` returns `chatGptLimitMessage(...)` byte for byte. The same
rule binds the 401 "expired" and the 403 "blocked" errors (R13 needs OpenAI's own reason
with no suffix).

So the turn ends with a `session-error` whose text is the limit sentence, which
`isChatGptLimitMessage` recognises and the approved plan-limit card renders with **Switch
Providers**. No auto-switch, no guessed alternative, no billing sentence. Any other 429 (a
burst rate limit) stays an `APICallError` and keeps the SDK's own backoff.

### 4.6 Refusals — the blocked state

- **401** from `/codex/responses` → the fetch refreshes once and re-sends the same body with
  the new bearer; a second 401 → signed-out with the expired-sign-in message.
- **403** (or a 4xx whose body says the workspace/plan has no Codex access) → the account is
  marked `blocked` with `error.message` verbatim, and the turn fails with that same text (no
  suffix). The card shows it on the red line beneath "Signed in as …" with Sign out (R13).
  `/wham/accounts/check` at sign-in is used for the same purpose when P0-2 shows it carries a
  refusal; otherwise the first request is the check.
- A blocked account **stays listed** in `providers.list` with `ready: false`, so the plan's
  models leave the picker but the card keeps its Sign out.

### 4.7 Encrypted reasoning across steps (built only if P0-4 says it must be)

The SDK re-sends a reasoning item only when the prompt holds an assistant `reasoning` part
carrying `providerOptions.openai.reasoningEncryptedContent`; the harness's
`assistantMessage()` builds text + tool-call parts only, and `reasoning-delta` parts go to the
UI and are dropped. If P0-4 shows the endpoint refuses a follow-up step without the item:
keep the step's final `reasoning` part (with its `providerMetadata`, which the SDK exposes on
the stream part) in the in-memory history before the tool calls, persist it on the
`assistant-thinking` event so `rebuildHistory` can restore it on resume, and pin both.
Otherwise this is §9's improvement item, not part of this build.

---

## 5. Surfaces

| Channel | preload (`chatgpt` ns) | remote-shim | remote-server WS | Android | main |
|---|---|---|---|---|---|
| `chatgpt:status` | `status()` | `invoke('chatgpt:status')` | `nativeRuntime.chatgptAuth.status()` | not-implemented list (no native runtime until M8) | `ipcMain.handle` |
| `chatgpt:sign-in` | `signIn()` | same | answers `false` — the browser and the listener live on the desktop | same | same |
| `chatgpt:cancel-sign-in` | `cancelSignIn()` | same | real | same | same |
| `chatgpt:sign-out` | `signOut()` | same | real | same | same |

Plus **`chatgpt.supported: process.env.YOUCODED_CHATGPT !== '0'`** on the preload namespace,
read by the renderer as `=== true` (the `native.supported` pattern). The workbench mock's
`chatgpt` object gains `supported: true`; remote-shim gains a `chatgpt` namespace with
`supported: false` and the four invokes. The task that adds the gate runs
`node scripts/workbench-boot-check.mjs` and the 11-shot `scripts/ui-review/plans/chatgpt-signin.json`
so the acceptance deck cannot come back cardless for a tooling reason.

**Remote clients never see the card**: the whole Model Providers section returns `null` when
`native.supported` is false, and remote-shim sets it false. The four WS cases exist for the
five-surface parity test and answer honestly. The only remote-visible ChatGPT surfaces are the
status-bar chips and `/usage`, which read the broadcast `status:data.chatgptUsage` and hold.

Guarded by a new `chatgpt:* channel parity` block in `tests/ipc-channels.test.ts` shaped like
the `arcade:*` one, with the Android assertion being "listed in the not-implemented
fall-through" (the permissions/specialists precedent), and the shim sending an object payload
or nothing. The four rows then come off `MOCK_ONLY` (`workbench-mock-contract.test.ts` forces
it).

**First run.** `first-run:start-auth` already carries a mode (preload's and remote-shim's
`startAuth` signatures widen from `'oauth' | 'apikey'` to `FirstRunState['authMode']`);
main.ts's two handlers (early
and late) gain the `'chatgpt'` arm → `firstRunManager.handleChatGptLogin(chatgptAuth)`:
`authMode: 'chatgpt'`, "Waiting for you to sign in…", `chatgptAuth.signIn({ timeoutMs:
300_000 })` (the wizard has no Cancel — contract R15; a first ChatGPT sign-in on a fresh
machine is an email code or 2FA away, so it gets 5 minutes, not Claude's 2 and not the
card's 10), then `await waitForSignIn()`: `signed-in` → auth installed,
`LAUNCH_WIZARD` → `COMPLETE` exactly like `handleOAuthLogin`; `timed-out` → `authMode:
'none'`, `lastError: 'Sign-in timed out. Try again?'`; `cancelled` → "Sign-in was cancelled.";
`{ error }` → that text. `'openrouter'` → `lastError: 'OpenRouter sign-in is coming in a later
update.'` — the button on the approved card must not be silent.

**The launch-time auth check is made provider-aware.** Today every launch after first run
asks `claude auth status` and forces the wizard back to AUTHENTICATE when Claude is not
logged in (`main.ts` 915–925) — a ChatGPT-only install would be asked to sign in on every
launch. The check becomes `chatgptAuth.isSignedIn() || (await detectAuth()).installed` — the sync
file read first, the `claude auth status` spawn only when it is false; pinned with a test that
stubs `detectAuth` to not-installed, seeds a signed-in account, and asserts `COMPLETE`. The
same gap exists today for an install with only an OpenRouter key and no Claude login; main.ts
has no reader for that, so it is **filed on the roadmap** (native-harness) rather than fixed
here.

**A ChatGPT-only install's first session.** The two new-session forms default their Runtime
toggle to Claude Code and seed the native picker from `localStorage['youcoded-last-binding']`.
On a first run completed through ChatGPT, the renderer (FirstRunView's completion path, which
sees `authMode: 'chatgpt'` and `currentStep: 'COMPLETE'`) writes a new
`youcoded-runtime-default = 'native'` unconditionally, and `youcoded-last-binding` =
`{ providerId: 'chatgpt', modelId: <the first catalog row> }` **only if a ChatGPT catalog row
is already back** (the models refresh was kicked by the callback a second earlier and may
still be in flight; `useNativeBinding` already falls back to the first ready provider's first
model, so a missing seed degrades to the right thing). Both forms read the key through one
`defaultRuntime()` in `RuntimeBinding.tsx` for their `useState` initialiser **and** for the
reset they do after every create (today both reset to the literal `'claude'` — SessionStrip
742, App 3361 — which would make the default last exactly one session). Nobody else writes
the key, so users who never did a ChatGPT first run see no change.

---

## 6. The kill switch — `YOUCODED_CHATGPT=0`

Mirrors `YOUCODED_NATIVE`. When set:

- preload's `chatgpt.supported` is false → the renderer hides the ChatGPT card and the
  first-run button (two one-line gates on the approved screens; nothing else changes).
- `ProviderRegistry` is constructed with `chatgpt: null`: the virtual row is not appended, so
  `list()` omits it, `languageModel` refuses it with "ChatGPT sign-in is turned off in this
  build.", and the catalog contributes nothing. A session already bound to a ChatGPT model shows whatever the chip shows today for
  a provider that is not listed (the bare model id); its next turn fails with that sentence.
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
  `openExternal`, `listen`, `isEncryptionAvailable` and `now` as injected functions with real
  defaults, so every state transition is unit-tested with no network, no browser and no port.

---

## 8. Tests that pin it

| Test | Pins |
|---|---|
| `tests/chatgpt-oauth.test.ts` | PKCE challenge is S256 of the verifier; authorize URL carries client id, scope, redirect, state, challenge; JWT claim decoding; usage and manifest parsers against the Phase 0 fixtures (recorded JSON, secrets stripped); the 429 → limit-sentence mapping (window choice, reset normalisation); **the thrown limit / expired / blocked errors have no own `statusCode`, `status` or `code`, and `describeProviderError` returns each message byte for byte** |
| `tests/chatgpt-auth.test.ts` | every arrow in §3 with injected I/O: state mismatch never exchanges **and leaves the state `waiting`**; `error` never reaches the HTML; cancel closes the listener; timeout at the passed duration; sign-out deletes the secret before the file; refresh under one in-flight promise; a 401 refresh failure signs out; a 403 blocks with the verbatim reason; a copied userData reads signed-out; `EADDRINUSE` and an unavailable keychain **throw** their sentences; **timer-after-success is a no-op; refresh-after-signOut leaves no secret; cancel-during-exchange leaves no account file**; `usageForStatus()` prunes; `plan` follows the poll; **a second `signIn()` while waiting adds no timer and bumps nothing; `status()` is `waiting` while the exchange is pending; the poll starts on construction when signed in and on callback, stops on sign-out and on blocked, and is unref'd; `mutate` retries then throws; the timed-out listener answers the fixed page for one minute** |
| `tests/provider-registry.test.ts` (extended) | the virtual row appears in `list()` only when a `ChatGptAuth` is given and never lands in providers.json; `upsert`/`remove` refuse it; `ready` follows `isSignedIn`; the chatgpt case sends `store:false`, `include`, non-empty `instructions`, `prompt_cache_key`, the three headers and `originator: youcoded`; no `system` input item; **exactly one `authorization` value per request, equal to the token, placeholder absent** (second call, second token); the 401 → refresh → re-send; `generateText` on the model sends `stream: true`; a burst 429 keeps OpenAI's message; the kill-switch refusal |
| `tests/model-catalog.test.ts` (extended) | chatgpt rows come from the injected source, degrade to the cache, then to none; hidden rows dropped; no pricing |
| `tests/ipc-channels.test.ts` | the five-surface parity block |
| `tests/workbench-mock-contract.test.ts` | forces the four rows off `MOCK_ONLY` |
| `tests/first-run-chatgpt.test.ts` | `handleChatGptLogin` transitions: waiting line, success → COMPLETE, timeout/cancel/error → `authMode: 'none'` with the right line; `'openrouter'` → its line; **the late auth check passes on a signed-in ChatGPT account with Claude not logged in** |
| `tests/runtime-default.test.tsx` (small) | `defaultRuntime()` reads `youcoded-runtime-default`; both forms use it for the initial runtime **and** the post-create reset; nothing writes the key outside the first-run completion path |

`bash scripts/verify.sh` green before any claim of done.

---

## 9. Decisions made here (assumptions), and what stays open

Made here, as technical defaults — each is visible to the user, so each is named:

1. **Waiting-state timeouts:** the card's is 10 minutes (it has Cancel); the wizard's is
   5 minutes (it has none, and a first sign-in may need an email code). On expiry the card
   returns to "Not signed in" with no message; the wizard shows "Sign-in timed out. Try
   again?"; the browser tab, if it arrives late, sees a fixed timed-out page for one minute
   rather than a connection error. The handoff lists the timeout as never decided on a deck;
   these are the defaults until a deck says otherwise.
2. **Usage polling at 5 minutes** plus the debounced per-response refresh (§4.4).
3. **Model list refresh** at sign-in and hourly (§4.3), cached for offline.
4. **`originator: youcoded`**; `client_version` per P0-3.
5. **The OpenRouter first-run button** answers with "OpenRouter sign-in is coming in a later
   update." until that feature ships.
6. **A ChatGPT-only first run** makes every later new session default to the native runtime
   on the plan's first model (§5), through one new localStorage key that nothing else writes.
7. **The provider row is virtual** (§2) — never persisted — so no other build on the machine
   can misread it.
8. **The weekly limit sentence's reset format** goes to Destin on a one-step words deck
   before the build touches `chatGptLimitMessage`: keep the clock time only, or add the day
   the way the 7-day chip already does ("Resets Mon @ 6:43pm"). The 5-hour sentence is
   approved and untouched either way.

Open, not blocking, unchanged from the handoff: the pay-per-use warning (dropped by the
approved round-3 wording — nothing here reintroduces it), the first-run "or local model"
route, the OpenRouter sign-in backend, Android's native runtime (M8). Added by this design as
roadmap items, not built here: carrying encrypted reasoning across steps (§4.7) if P0-4 shows
it is optional; the launch-time auth check for an OpenRouter-only install (§5).

---

## 10. Sources

- pi: `badlogic/pi-mono` `packages/ai/src/auth/oauth/openai-codex.ts` (constants, PKCE,
  callback, exchange, refresh, claims) and `packages/ai/src/api/openai-codex-responses.ts`
  (endpoint, headers, forced body fields, 429 codes, `resets_at`) — re-read 2026-09-05.
- Codex CLI: `openai/codex` issue #10869 (the 60-second `/wham/usage` poll);
  `steipete/CodexBar` `docs/codex.md` (`rate_limit.primary_window` / `secondary_window`,
  `additional_rate_limits[]`); `johnknott` gist (bearer + `ChatGPT-Account-ID` on `/wham`);
  `codex-rs/backend-client/src/client.rs` (`/wham/accounts/check`, `/wham/profiles/me`).
- Models manifest: `chopratejas/headroom` PR #519 (`/backend-api/codex/models?client_version=`,
  bearer + `chatgpt-account-id`, `slug` / `visibility`).
- In-repo: `desktop/node_modules/@ai-sdk/openai/dist/index.js` 6636–6717 (body assembly),
  5296–5340 (reasoning item re-send), 10629 (the frozen `Authorization` closure);
  `node_modules/ai/dist/index.d.ts` (`wrapLanguageModel`, v4); `src/main/github-auth.ts`
  (the injected-I/O pattern); `src/main/first-run.ts` (`handleOAuthLogin`); `src/main/main.ts`
  260/286 (`remoteServer` before the dev-profile userData override), 895–925 (the late auth
  check); `@ai-sdk/provider-utils/dist/index.js` 1372–1380 (headers lower-cased before `fetch`),
  3305–3318 (how `fetch` is called); `src/renderer/components/SessionStrip.tsx` 742 and
  `App.tsx` 3361 (the post-create runtime reset); `src/main/harness/harness-session.ts` 428 (`describeProviderError`),
  1146 (`assistantMessage`), 2965 (`withRetry`); `src/main/ipc-handlers.ts` `buildStatusData`;
  `src/renderer/components/RuntimeBinding.tsx` (`youcoded-last-binding`);
  `tests/ipc-channels.test.ts` (`arcade:*`).
