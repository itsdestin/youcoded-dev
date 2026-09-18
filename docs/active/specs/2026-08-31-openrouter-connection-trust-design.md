---
status: draft
date: 2026-08-31
updated: 2026-09-18
tags: [openrouter, providers, native-runtime, settings, error-messages, oauth, status-bar]
origin: Destin hit `User not found. (provider error 401)` in a live session while
  Settings → Model Providers read "Connected".
---

# OpenRouter connection trust

Make the app's claim that OpenRouter is "Connected" mean something, give every
OpenRouter failure a way out, and let a user connect by signing in instead of
hand-copying a secret.

**Re-based 2026-09-18 against `youcoded@master` `e5f8b2d8`.** The first draft
(2026-08-31, `ddac2f14`) predated ~600 commits: the Model Providers popup became
**Settings → Assistant settings → Cloud providers**, Sign in with ChatGPT shipped
(the precedent for most of this spec), first-run gained an OpenRouter button and a
"Use an API key" path, and the status bar gained provider-gated usage chips. Every
file:line below was re-checked on that commit; paths are relative to
`youcoded/desktop/src/` unless marked. OpenRouter's HTTP behaviour was re-checked
live the same day (§2). §9 lists what changed from the first draft and why.

**Scope: desktop.** Android refuses every `provider:*` and `chatgpt:*` channel as
`not-implemented-on-mobile` (`app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:4194-4199`,
`:4207-4210`). That holds today, but the Android rebuild
(`docs/active/handoffs/2026-09-10-android-rebuild-START-HERE.md`, step 4) plans to
run this same `ProviderRegistry` in a Node child on the phone. So: no Kotlin work
here beyond refusal entries for new channels, **and** the verdict/refresh logic
(§3.1, §3.4) stays free of Electron imports — plain modules with injected `fetch`,
clock and file paths — so step 4 can run it unchanged.

---

## 1. The bug that started this

A live session failed with `User not found. (provider error 401)` while Settings
showed **OpenRouter — Connected** and a **Test** button that passed. `User not
found.` is OpenRouter's own wording for a key it does not recognise, forwarded by
`describeProviderError` (`main/harness/harness-session.ts:474-501`).

### Five defects (all present on `e5f8b2d8`)

**D1 — "Connected" means "a key exists on disk."** The Cloud providers card
`OpenRouterBlock` (`renderer/components/ModelProvidersPopup.tsx:417-511` — the file
keeps its old name but now only exports cards) computes
`connected = openrouter?.hasKey === true` (`:434`) and prints Connected / Not
connected (`:472`). It is weaker than the registry's own `ready`
(`main/providers/provider-registry.ts:118-141`), ignoring even `enabled`. Nothing is
ever asked of OpenRouter.

**D2 — the Test button cannot fail.** `testConnection`'s OpenRouter branch
(`provider-registry.ts:534-546`) fetches the public `GET /api/v1/models`, which
answers `200` with no key or a fabricated one (§2). `res.ok` → "Connected."
(`:610`). The shared 401/403 handler below it (`:611-613`) is correct and never
runs. The `CAVEAT` comment at `:537-540` says not to present this as validation;
the card does. Anthropic (`:563-573`), OpenAI (`:574-582`) and Google (`:583-592`)
all probe endpoints that require the credential; OpenRouter is the only hollow one.

**D3 — a bad key is congratulated at every entry point.** Three places run that
hollow test and report success:
- the paste-a-key modal `ConnectOpenRouterModal` (`ModelProvidersPopup.tsx:517-612`;
  `save()` at `:530-547` saves, tests, flashes "Connected.", closes after 700 ms);
- the card's **Test** button (`runTest`, `:437-445`);
- **first-run "Use an API key"** — `FirstRunManager.handleNativeApiKey`
  (`main/first-run.ts:559-583`) calls `setKey` then `testConnection`. `recognise-key.ts`
  only matches the `sk-or-` prefix. **A made-up `sk-or-` key completes setup today.**

The model menu fills with OpenRouter's public catalog regardless
(`main/providers/model-catalog.ts:17`, fetched with no headers at `:107-108`);
whether a model is pickable follows `ready`
(`renderer/components/model/availability.ts:47-52,87-89`), i.e. "a key exists".

**D4 — the error is a dead end.** `AttentionBanner` shows **Open Settings** only
when the message matches `/Settings → Providers/`
(`renderer/components/AttentionBanner.tsx:53-55`, gate `:136-137`). Only the
registry's pre-flight "no key" messages contain it. A rejection *from* OpenRouter
never does, so the user gets raw text and no action. Two siblings share the defect
today: ChatGPT's expired-sign-in sentence says "Settings → Model Providers"
(`main/providers/chatgpt-oauth.ts:61-62`), and so does the key-decrypt failure
(`main/providers/secret-storage-errors.ts`) — neither matches, neither gets a button.
The phrase itself names a screen that no longer exists; the destination is now
Assistant settings → Cloud providers.

**D5 — nothing connects the chat failure to Settings.** A 401 in chat changes
nothing the Settings screen reads. `AssistantSettings.tsx:65-69` says so in a
comment: "A key OpenRouter rejects is not known until a send fails; that error lands
in the chat, not here."

---

## 2. What the OpenRouter API provides

Re-checked live 2026-09-18 with no key and with a fabricated key (no real key was
used; nothing was created):

| Request | No key | Fabricated key |
|---|---|---|
| `GET /api/v1/models` | `200` | `200` |
| `GET /api/v1/key` | `401` | `401 User not found.` |
| `GET /api/v1/credits` | `401` | `401 User not found.` |

`GET /api/v1/key` validates the key and returns `limit`, `limit_remaining` (`null`
when the key has no cap — the common case), `usage*`, `is_free_tier`,
**`expires_at`**, `is_management_key`, `is_provisioning_key`, `label`.

`GET /api/v1/credits` returns account-wide `total_credits` and `total_usage`;
balance = the difference.

**Open risk — must be settled first in the build (§8 step 1).** OpenRouter's API
reference still states (2026-09-18) that `/credits` requires a *management* key. On
2026-08-31 it returned `200` with full data for a plain inference key. That cannot be
re-checked without a real key. The design must work either way:
- `/credits` works → balance from `/credits`.
- `/credits` refuses → balance from `/key`'s `limit_remaining` **when the key has a
  cap**; otherwise the balance is *unknown* and no number is shown (never `$0.00`).
  Validity, expiry and every error path are unaffected — they come from `/key` and
  from chat turns.

**No purchase API.** Adding credit is a link (`https://openrouter.ai/settings/credits`,
already on the card's My Account button, `ModelProvidersPopup.tsx:473`).

**OAuth (PKCE), from OpenRouter's current docs**
(`openrouter.ai/docs/guides/overview/auth/oauth`, fetched 2026-09-18):
- No app registration. Authorize at `https://openrouter.ai/auth` with
  `callback_url`, `code_challenge`, `code_challenge_method=S256` (or `plain`), and
  optional `key_label`. "Localhost callbacks are supported on any port."
- Exchange: `POST https://openrouter.ai/api/v1/auth/keys`, **JSON** body
  `{ code, code_verifier, code_challenge_method }` → `{ key, user_id }`. Documented
  errors: `400 Invalid code_challenge_method`, `403 Invalid code or code_verifier`,
  `403 Authorization code expired`.
- Codes are single-use and **expire after 10 minutes**.
- **No `state` parameter** exists (unlike ChatGPT's flow).
- Localhost apps get a key titled after host:port unless a label is given — so always
  send `key_label=YouCoded`.
- A headless variant (no `callback_url`; the page shows a code to copy back) exists.
  This spec does not use it (§3.5).

---

## 3. Design

### 3.1 A remembered verdict about the key this copy actually holds

A new main-process module, `main/providers/openrouter-health.ts`, owns a persisted
**verdict** about OpenRouter's key. It is built as
`new OpenRouterHealth({ dir: app.getPath('userData'), fetch, now, onChange })` beside
`secretsStore` (`ipc-handlers.ts:2589`) — that runs after the profile override
(`main.ts:342-350`), so the path is per-profile — and passed to `ProviderRegistry` as a
new constructor parameter (`provider-registry.ts:70-78`, built once at
`ipc-handlers.ts:2609`). `setKey`'s clear and the fetch wrapper both use it.

**Change signals.** The registry emits none today; it gains an `onChange` hook fired
by `upsert`, `setKey` and `remove`. Health uses it to start or stop its poll (§3.4)
and to schedule a check after a new key. `setKey` itself does **not** run the check
synchronously; it clears the record and asks for a check on the §3.4 debounce, so a
caller that runs Test straight after (the modal, first-run, sign-in) doesn't cause a
second request, and a key set over remote (`remote-server.ts:1954`) is still checked
within a minute.

**Custom base URL.** `/key` and `/credits` are requested against `p.baseUrl`, as
`testConnection` does today. A proxy that doesn't serve `/key` (404, non-JSON) is
`unchecked`, never `rejected`.

**Where it lives: a per-profile file, `userData/provider-health.json`, next to
`native-secrets.json`.** Not a field on the `providers.json` entry. Reasons, each
verified:
- `providers.json` is shared by every app copy on the machine
  (`~/.youcoded/`, `main/native-home.ts:56-57`), while the key is per-profile
  (`SecretsStore(app.getPath('userData'))`, `ipc-handlers.ts:2589`; profile-suffixed
  `userData` at `main.ts:342-350`). A verdict belongs with the key it describes, or
  one copy's check describes another copy's key.
- A field on the entry would be erased: `upsert` rebuilds entries from an explicit
  field list (`provider-registry.ts:168-175`), and the enable toggle round-trips the
  whole row from the renderer (`ProvidersSection.tsx:276`). It would also let the
  renderer or a remote client *write* `verified`.
- A dev profile never writes anything Destin's live app reads.

Record (one per `secretRef`):

```
{ ref, keyFingerprint, verdict, reason?, balanceUsd?, limitRemainingUsd?,
  expiresAt?, checkedAt }
```

`keyFingerprint` is the first 16 hex chars of SHA-256 of the key. It is computed and
compared **only when a check runs** (the check decrypts the key anyway); a record
whose fingerprint doesn't match is discarded and rewritten. It is **never** compared
on read: `list()` today calls only the synchronous `secrets.has()`, and adding a
decrypt to every `provider:list`, catalog read and launch check could throw, and on
Linux could prompt the keychain. Within one profile the key only changes through
`setKey`, which clears the record synchronously, so reads stay correct without the
comparison.

| Verdict | Meaning | Carries |
|---|---|---|
| `verified` | `/key` answered 200 | balance (if known), expiry, checked-at |
| `rejected` | OpenRouter refused the key | a typed reason |
| `unchecked` | OpenRouter could not be reached, or never asked | nothing |

`unchecked` is deliberate: a user pasting a key offline must not be told it is bad.
A key that cannot be *decrypted* (`SecretsStore.get` now throws,
`secrets-store.ts:127-149`) is none of the three. The existing decrypt message is
shown and the verdict is left untouched. Today `testConnection`'s catch
(`provider-registry.ts:615-618`) words that as "Could not reach OpenRouter", which is
wrong and is fixed in the same edit.

**Typed reasons** (the `errorCode` values of §3.3):

| Reason | From | Where it can be produced |
|---|---|---|
| `openrouter-key-rejected` | `401` | check and turn |
| `openrouter-key-expired` | `401` and a stored `expiresAt` in the past | check and turn |
| `openrouter-forbidden` | `403` from `/key` | check only |
| `openrouter-wrong-key-type` | `is_management_key` or `is_provisioning_key` | check only |

Two **per-request** codes are produced by chat turns but **never change the verdict**,
because they say nothing about the key:

| Code | From |
|---|---|
| `openrouter-credit-short` | `402` on a chat request (see §3.3 — can happen with money in the account) |
| `openrouter-request-refused` | `403` on a chat request — OpenRouter's documented 403 there is a moderation flag on the input, not a key problem |

**Four write points:**
1. Key saved (paste, first-run, or sign-in — §3.5).
2. **Test** pressed.
3. Background refresh (§3.4).
4. **A chat turn is refused.** This one fixes D5. The mechanism is a `fetch` wrapper
   handed to `createOpenAICompatible` in the OpenRouter branch
   (`provider-registry.ts:354-388`). It copies two precedents: the local engine's
   `withPrefillProgress` wrapper (`:305-313`), and `ChatGptAuth.fetch`, which already
   classifies ChatGPT auth failures at the request layer
   (`chatgpt-auth.ts:1018-1064`, wired at `provider-registry.ts:439`). The wrapper
   knows `p.secretRef` at the moment of the request, sees the real status, and covers
   specialist (helper) sessions for free. Their `session-error` is never forwarded to
   the parent (`main/harness/native-session-host.ts:130-145`), so a hook at the emit site would
   miss them. On a **401** it writes `rejected` (reason `key-rejected` or
   `key-expired`); on a **402 or 403** it writes nothing. In all three cases it reads
   OpenRouter's sentence from `res.clone()` and throws a typed
   `ProviderAccountError { errorCode, message, providerMessage }` (the ChatGPT
   `expiredError()` pattern). §3.3 reads it.

   Verified path (`ai@7.0.84`): the SDK passes a non-`TypeError` thrown from `fetch`
   through unchanged, `consumeStep` rethrows it (`harness-session.ts:3371-3393`), and it
   lands at the emit (`:2913`). If an earlier attempt in the same step hit a retryable
   5xx/429, the SDK wraps it in `RetryError` with the typed error in `lastError` —
   hence `classifyProviderError` unwraps `lastError`. **`ProviderAccountError` must not
   carry `statusCode`, `status` or `code`**: `describeProviderError` would append
   "(provider error N)" and `withRetry` would inspect it (same reasoning as
   `chatgpt-oauth.ts:570-578`).

**`ready` does not change.** `ready` (`provider-registry.ts:129-138`) still means
"enabled and a key is stored". It feeds the app-launch gate (`hasUsableProvider`,
`ipc-handlers.ts:5242-5245` → `setupIsUsable`, `first-run.ts:131-144` →
`main.ts:1130-1150`), the model-menu lock (`availability.ts:87-89`), the new-session
provider list (`RuntimeBinding.tsx:211`) and the first-run download banner
(`ipc-handlers.ts:3538`). If a `rejected` verdict made `ready` false, one bad refresh
would lock a user out at launch. The verdict changes **words and badges**, not
access. The model menu keeps OpenRouter models pickable, and the error on send is
the actionable one from §3.3.

**How the renderer sees it:** `provider:list` rows gain a read-only `health` field.
`list()` merges the record in, and `upsert` ignores any `health` it is sent. The
enable toggle (`ProvidersSection.tsx:276`) strips `health` along with `builtIn`,
`hasKey` and `ready` before calling `upsert`. The remote server serves
`provider:list` itself (`remote-server.ts:1919-1972`), so the field reaches it for
free. No new channel is needed for reading.

**Two readers, one fact.** The card and the Assistant settings attention dot read
`health` from `provider:list`; the gear dot and the status-bar chip read
`status:data.openrouterAccount` (§3.4). Both come from the same record, but they may
disagree for up to 10 s after a change. That is accepted.

### 3.2 Real validation

`testConnection`'s OpenRouter branch moves from `/models` to `GET /api/v1/key`, with
`GET /api/v1/credits` fetched in parallel for the balance (§2). A `/credits` failure
never fails the test; the balance falls back as §2 describes. Management or
provisioning keys yield `openrouter-wrong-key-type` ("That's an account-management
key — it can't run models. Create a regular API key on OpenRouter."). The result
writes the verdict (write points 1-2) and returns the balance, so Test can say
"Connected — $9.21 left" rather than "Connected." The `CAVEAT` comment is deleted in
the same edit.

**Return shape widens, additively:** `{ ok, message, verdict?, balanceUsd? }`. Only
the OpenRouter branch fills the new fields. `ok` keeps its meaning (true only for
`verified`), so every existing caller keeps working unchanged: `ipc-handlers.ts:3383`,
`remote-server.ts:1947`, first-run (`first-run.ts:572,599`), the card
(`ModelProvidersPopup.tsx:440,538`), `ProvidersSection.tsx:89`. The card reads
`balanceUsd` to say "Connected — $9.21 left".

**First-run (fixes D3's worst case).** `handleNativeApiKey` already stays on the key
page when `ok` is false (`first-run.ts:572-576`); a fake key only passes today because
`/models` answers 200. Switching the probe to `/key` alone fixes it. There is no
first-run change for a rejected key. One behaviour is deliberately new: for OpenRouter,
`verdict: 'unchecked'` (unreachable) continues setup instead of blocking, and the card
then reads "Not checked yet". Anthropic, OpenAI and Google keep today's behaviour of
blocking when offline (out of scope). The same rule applies after an OpenRouter
sign-in (§3.5): `rejected` stays on the sign-in card with the reason; `unchecked`
continues.

The Anthropic/OpenAI/Google branches are unchanged.

**The card's words (D1):** `OpenRouterBlock` reads `health` instead of `hasKey`.
- `verified` → Connected, with the balance when known.
- `rejected` → the reason.
- `unchecked` → Not checked yet.
- No key → Not connected.
- Disabled → Turned off.

Exact wording and layout are review-deck items (§5).

### 3.3 Errors become exits

**A typed code rides the session-error event, optional and additive.** The field
name follows the precedent already in the codebase: sync's optional `errorCode`
(`main/sync-spaces/types.ts:105-110`, read at
`renderer/components/sync-space-error-summary.ts:36-65`). That precedent's comment
gives the same reasoning this spec needs: "Optional + additive… without
string-matching prose." The `AttentionBanner.tsx:46-52` comment, which rejected a
structured field in favour of phrase-matching, is rewritten to say why the trade-off
flipped: an optional field breaks nothing when it is absent, and phrase-matching
stays as the fallback.

A new `classifyProviderError(err) → errorCode | undefined` sits beside
`describeProviderError`. It unwraps `lastError` as `describeProviderError` does
(`:481-482`) and reads `ProviderAccountError.errorCode`.

**The path, hop by hop** (all verified; the field must be carried or cleared at each):

0. Type — the `session-error` data type in `shared/types.ts` (`TranscriptEvent.data`,
   `:242+`) gains `errorCode?: string`.
1. Emit — `harness-session.ts:2913` (turn failures) and `ipc-handlers.ts:846-858`
   (`emitNativeSessionError(text)` at `:850` gains an optional `errorCode` parameter —
   start/resume failures).
2. Host forward — `main/harness/native-session-host.ts:3022-3024`. The session store drops
   session-errors, so nothing is persisted (`harness/session-store.ts:150-153`).
3. Hub — `ipc-handlers.ts:2969-2973` sends to the window and broadcasts to remote.
4. Remote — `renderer/remote-shim.ts:1009-1010,1997` pass the payload through.
5. Renderer dispatch, in **two mirrored places** — `renderer/App.tsx:1572-1583` and
   `renderer/components/buddy/BubbleFeed.tsx:272-279`.
6. Action — `renderer/state/chat-types.ts:538-552` (`NATIVE_SESSION_ERROR`).
7. Reducer — `renderer/state/chat-reducer.ts:1113-1134` sets it. It is cleared
   wherever `errorMessage` is cleared: `:441`, `:991`, `:1994`, `:2246-2254`.
8. State field — `chat-types.ts:274-279`, with its initial value at `:435`. The
   workbench fixture dispatcher named at `chat-types.ts:545-547` passes it too.
9. Serialization for a reconnecting phone — `chat-types.ts:967,1038,1077-1079`.
10. View — `ChatView.tsx:1342-1352` → `AttentionBanner`. The Open Settings deep link
    is `App.tsx:3705`, which opens Assistant settings on the Cloud providers page
    (`SettingsPanel.tsx:3042-3044`, `AssistantSettings.tsx:149`). **Add credit** is a
    new callback, plumbed App → ChatView → AttentionBanner beside `onUpgradePlan`, that
    opens `https://openrouter.ai/settings/credits` externally.

**Copy and actions** (checked against `docs/error-message-standards.md`):

| errorCode | Message | Actions |
|---|---|---|
| `openrouter-key-rejected` | "OpenRouter didn't accept your API key." | Open Settings |
| `openrouter-key-expired` | "Your OpenRouter key has expired." | Open Settings |
| `openrouter-credit-short` | "OpenRouter doesn't have enough credit for this request." + OpenRouter's own sentence as detail | Add credit (opens openrouter.ai) |
| `openrouter-request-refused` | "OpenRouter refused this request." + OpenRouter's own sentence (e.g. its moderation reason) | none beyond today's — it is not a settings problem |
| `chatgpt-signin-expired` | existing ChatGPT sentence, reworded to name Cloud providers | Open Settings |
| none | **unchanged from today** | unchanged |

Why each row reads the way it does:
- **No "Try again" on the 402 row.** The banner's `onRetry` is only wired for a
  stalled turn (`ChatView.tsx:1359-1361`) and a general retry is error-inventory row
  #29's job. The user resends after adding credit.
- **The 403 row has no Open Settings.** On chat requests OpenRouter's 403 means the
  input was flagged, and sending the user to their key would invent a cause.
- **The 402 row says "for this request," not "you're out of credit."** OpenRouter
  also answers 402 when the account has money but the reply size it reserves up front
  exceeds it. Commit `a4a3c1e7` capped reply length at 16,000 tokens for exactly this
  (the incident is recorded in the comment at `harness-session.ts:3379`); the cap makes
  it rarer, not impossible, since a low balance can still fall under the reservation. Claiming an empty wallet would be an invented
  cause. For the same reason a 402 does not flip the verdict to `rejected`.
- **"Expired" is used only when a stored `expiresAt` has passed.** A 401 alone cannot
  tell expired from deleted. Without a stored date the same 401 reads as "didn't
  accept".
- **The "none" row is deliberately unchanged.** The first draft sent every unknown
  error to Open Settings, which the standards forbid (it implies a settings cause
  nobody established). The general raw-text banner problem is error-inventory row #29
  (`docs/active/investigations/2026-09-10-error-inventory/inventory-1-chat.md:40`).
  It stays out of scope here.
- **The ChatGPT row is folded in** because it is the identical dead end (D4) and costs
  one `errorCode` on an error that is already typed (`chatgpt-oauth.ts:61-62`).
- `AttentionBanner` stays hand-built. `<ErrorState>` has no slot for a custom action
  (`renderer/components/ui/states.tsx:91-121`), and migrating the banner is row #29's
  job.

**Phrase fallback repaired.** The registry's cloud pre-flight messages
(`provider-registry.ts:272,356,402,407,412,519`), the decrypt message
(`secret-storage-errors.ts`) and both ChatGPT sentences — `CHATGPT_SIGN_IN_REQUIRED_MESSAGE`
and the expired one (`chatgpt-oauth.ts:57-62`) — change "Settings → Providers" /
"Settings → Model Providers" to "Assistant settings → Cloud providers". The
local-model message at `provider-registry.ts:293` is **not** reworded to Cloud
providers — its destination is the Local models page; it becomes "Assistant settings →
Local models" and stays outside the Open Settings match (which deep-links to `'cloud'`,
`SettingsPanel.tsx:3043`). `isProviderConfigError` matches the new phrase and both old ones, so an
event from an older main process still gets its button.

`withRetry` (`harness-session.ts:3704-3717`) already retries only 429/5xx/network, so
the typed errors are never retried. Nothing changes there.

### 3.4 Keeping the verdict fresh, and showing it

**Owner and cadence: copy the ChatGPT usage poll** (`chatgpt-auth.ts`: poll
`USAGE_POLL_MS` 5 min `:92`, per-reply refresh debounced to `USAGE_DEBOUNCE_MS` 60 s
`:94`, `startPoll`/`stopPoll` `:1146-1160`, `schedulePollSoon` `:1162`). The
first draft's 30-minute timer is dropped in favour of the shipped pattern:
- It runs only while OpenRouter is enabled and a key is stored, started and stopped by
  the registry's `onChange` (§3.1). It checks once at launch, then every 5 minutes.
- After each OpenRouter reply it asks for a refresh, debounced to at most one a
  minute, so the balance follows real use ("a ten-step turn costs one poll").
- Each refresh is two small GETs (`/key`, `/credits`) and writes the verdict.

**Delivery to the renderer: a sibling of `chatgptUsage` on `status:data`.** Main
builds the status payload at `ipc-handlers.ts:2389-2395` and pushes it through
`main/status-push-gate.ts`. The push runs every 10 s only while someone is looking,
drops unchanged payloads, and `statusPush.push()` sends immediately.
`openrouterHealth.forStatus()` adds `openrouterAccount: { verdict, reason?,
balanceUsd?, expiresAt?, checkedAt }`. The status build only *reads* the saved
record; it never calls OpenRouter. Every write point calls `statusPush.push()`.
Because `push()` joins an in-flight build (`buildStatusDataShared`,
`ipc-handlers.ts:2402-2407`), a push that lands mid-build can deliver the old record;
the change then arrives on the next 10 s tick. That lag is accepted (ChatGPT usage
never pushes at all and rides the tick). Only the gear dot and chip wait on it — the
card reads `provider:list` directly.
Renderer plumbing, one hop each: the App handler (`App.tsx:1722-1750`),
`StatusDataState` (`App.tsx:170`) and its default (`App.tsx:290`), and the `StatusFeed`
interface field plus `useStatusBarData` (`renderer/hooks/useStatusBarProps.ts:17-38`). Remote browsers get it through
`broadcastStatusData` (`remote-server.ts:734`). Android sends no such field;
absent means "draw nothing", the same as `chatgptUsage` today.

**Surfaces:**

1. **The Cloud providers card** (`OpenRouterBlock`) — the verdict word and the
   balance, in the `ProviderRow` status/detail lines and the slot below the row, the
   same way the ChatGPT card shows plan usage (`ModelProvidersPopup.tsx:409`). The
   Test result currently borrows the detail line; which wins is a deck item.
2. **The Assistant settings attention dot** — `useAttention`
   (`renderer/components/assistant-settings/AssistantSettings.tsx:64-110`) already
   marks the Cloud providers page for a blocked ChatGPT plan (a failed local engine
   marks the separate Local models page, `:106`). `rejected` becomes a second cause for
   Cloud providers, and the comment at `:65-69` is replaced. It reads `health` from
   `provider:list` on its existing 4 s poll. Test:
   `tests/assistant-settings-attention.test.tsx`.
3. **The gear's red dot** — `settingsDangerBadge` (`App.tsx:2452-2455`) is already an
   OR of two sources (GitHub sync `spacesFailing`, `:2433-2448`, and danger-level
   `syncWarnings`). OpenRouter `rejected` is the third input, OR'd at the same call
   site. Rendering is unchanged: `SettingsGearButton`
   (`renderer/components/HeaderBar.tsx:346-373`, badges `:364-368`) is shared by the
   chat and welcome headers, red outranks blue, and both hide while Settings is open.
4. **The gear's blue dot** — still means "no phone connected"
   (`setSettingsBadge(count === 0)`, `App.tsx:2400-2405`), which is on for everyone
   who never set up remote access. Routing low-balance or expiring-soon into it would
   be invisible. Proposal: `verified` but low or expiring soon lights the blue dot as
   a second OR'd input anyway, *and* the card shows why. Whether one dot may mean
   either thing is §5 question 7.

**The status-bar balance chip.** One more entry in the widget registry
(`renderer/components/StatusBar.tsx:486-662`; `WidgetDef` `:473-481`; persisted under
`youcoded-statusbar-widgets`, `:665`), in the **Rate Limits** category (`:488`) beside
`usage-5h`/`usage-7d`, which already serve both Claude and ChatGPT plans. New id
`'openrouter-balance'` must also join the `WidgetId` union
(`renderer/state/status-widgets.ts:13-19`).

```
{ id: 'openrouter-balance', label: 'OpenRouter Credit', defaultVisible: true,
  description: 'How much credit is left on your OpenRouter account.',
  bestFor: 'Anyone running models through OpenRouter — credit is prepaid, so this is the number that stops your work.' }
```

**Gating: one rule, written once.** Today "which widgets does this session get" is
written twice:
- The bar calls `widgetApplies(id, runtime)` plus a hand-written ChatGPT exception
  (`StatusBar.tsx:990-991`).
- The menu calls `widgetUnavailableReason(w.id, relevance)` (`:779`, context built at
  `:1718`), with the same exception written separately (`status-widgets.ts:79`).

`SessionRuntime` is `'claude' | 'native'`, "NOT its provider type"
(`status-widgets.ts:23`), so `native` includes local models. An inverse-set rule
would draw an OpenRouter balance on a local-model session. The change:
- Add `providerType` to `RelevanceContext` (`status-widgets.ts:25-51`), beside
  `chatgptWindows` and `runsLocally`. The value is already at the call site as the
  `modelProviderType` prop (`StatusBar.tsx:406-410`, from `App.tsx:3837`).
- Make `widgetApplies` take `RelevanceContext`, and fold the existing ChatGPT
  exception into it, so the bar and menu share one input.
- The unavailable reason reads **"OpenRouter sessions only."**
- **Order matters.** `widgetUnavailableReason` returns `null` for
  `runtime === 'claude'` before any other check (`status-widgets.ts:69`), and
  `widgetApplies` returns true for every id on a Claude Code session. The
  provider-gated rule must run **before** those shortcuts, or a Claude Code session
  will offer and draw the balance chip.

**What the chip shows:**
- The number whenever the widget is on (`$9.21`).
- `warnStyles` tones (`StatusBar.tsx:463-466`): warn below the low threshold, danger
  at zero.
- The number is account-wide (`/credits`). In the §2 fallback it is the key's own
  remaining cap, and the tooltip says "left on this key's limit".
- Nothing at all when the balance is unknown. That covers `unchecked` with no
  previous reading, and the §2 fallback case of an uncapped key when `/credits`
  refuses.

---

### 3.5 Signing in instead of pasting

**Loopback PKCE only, modelled on Sign in with ChatGPT; paste-a-key stays as the
second route.** The first draft also required OpenRouter's copy-a-code headless
variant, because the phone/remote surface "cannot use a loopback." That reason is
gone. Over remote access, the Cloud providers page is not shown (`native.supported`
is hard-coded `false`, `remote-shim.ts:2896-2897`; the page requires it,
`pages.tsx:332`, `AssistantSettings.tsx:141-143`). First-run always reports complete
over remote (`remote-shim.ts:2678-2683`). ChatGPT shipped with no paste fallback on
the same terms. A second flow would add a code-entry UI and its tests to serve nobody
who can reach the button.

**Backend.** A new `main/providers/openrouter-oauth.ts`, split pure/stateful like
ChatGPT's:
- **Pure:** the authorize-URL builder (`callback_url=http://127.0.0.1:<port>/or-callback/<nonce>`,
  `code_challenge`, `code_challenge_method=S256`, `key_label=YouCoded`); the JSON
  exchange with a 30 s cap (copy `TOKEN_REQUEST_TIMEOUT_MS`, `chatgpt-auth.ts:103`);
  documented errors mapped to plain sentences with no invented cause.
- **Stateful:** one waiting round at a time, on **port 0** (the OS picks a free port;
  OpenRouter allows any, so ChatGPT's fixed-port "port busy" failure cannot happen).
  - It uses `127.0.0.1`, not `localhost`, matching ChatGPT's listener and avoiding
    browsers trying IPv6 first.
  - The random `<nonce>` in the callback path stands in for the missing `state`
    parameter. Any other path gets a 404 and does not end the round, so a stray local
    page cannot cancel a sign-in. (PKCE already makes a stolen code useless.)
  - The timeout is 5 minutes, under the 10-minute code life.
  - On success: `providerRegistry.setKey('openrouter', key)` (`provider-registry.ts:210`),
    then the §3.2 check (write point 1). The key never leaves main.
  - Public status: `{ state: 'idle' | 'waiting' | 'connected' | 'failed', message? }`.

**Shared code is extracted, not copied.** `generatePkce` (`chatgpt-oauth.ts:80-84`)
already produces the base64url S256 pair OpenRouter expects. The loopback lifecycle
is private to `ChatGptAuth`, about 200 lines of race handling:
- listen (`chatgpt-auth.ts:216-228`);
- join a double-click (`:519-533`);
- bind, then timer, then open browser (`:535-595`);
- wait/cancel (`:599-615`);
- the "you can close this tab" pages (`:117-119,248-268`);
- timeout plus the 60 s linger (`:789-807`);
- finish and dispose (`:811-825,1286-1296`).

These move into a shared `main/providers/loopback-oauth.ts` that both flows use, with
ChatGPT keeping its fixed port, path and `state` check as parameters.
`tests/chatgpt-auth.test.ts` and `tests/chatgpt-oauth.test.ts` must stay green,
unchanged, through the extraction.

**Channels.** `openrouter:sign-in`, `openrouter:cancel-sign-in`,
`openrouter:sign-in-status`, each on every surface the `chatgpt:*` parity block in
`tests/ipc-channels.test.ts:1857-1935` enforces:
- `shared/types.ts` constants;
- `preload.ts` (wrapped in `unwrapInvokeError`, `:466-476`);
- handlers in `ipc-handlers.ts` beside `:3393-3396`;
- `remote-server.ts` cases like `:1986-2015`: sign-in answers `false` (as ChatGPT's
  does at `:1995-1997`); status and cancel read from the OpenRouter sign-in object
  exposed on `nativeRuntime`, the way ChatGPT's use `nativeRuntime.chatgptAuth`;
- `remote-shim.ts` with `supported: false`;
- a refusal entry in `SessionService.kt` near `:4207`, not a real branch.

Add a matching parity block.

**Entry point 1 — Settings.** `OpenRouterBlock` gains a primary sign-in button with
the ChatGPT card's anatomy (`ModelProvidersPopup.tsx:267-412`):
- one main button;
- "Waiting for the browser…" with **Cancel** (`:343-364`);
- 1 s status polling while waiting (`:307-311`);
- `invalidateProviderTypeCache()` when the state changes.

`ConnectOpenRouterModal`'s paste box stays as the secondary route. Placement and
prominence are deck items.

**Entry point 2 — first-run.** The stub `handleOpenRouterNotBuilt`
(`first-run.ts:700-709`, "OpenRouter sign-in is coming in a later update.") becomes
`handleOpenRouterLogin`, modelled on `handleChatGptLogin` (`:645-698`):
1. `authMode: 'openrouter'`, the waiting line, and the auth step in progress.
2. `signIn` with the 5-minute timeout.
3. On success, the §3.2 check, then `finishNativeSetup({ authMode: 'openrouter',
   setupProvider: 'openrouter' })` (`:545-552`). `setupProvider` is what makes
   OpenRouter the new-session default (`FirstRunView.tsx:320`).
4. Otherwise, the same timed-out / cancelled / error lines ChatGPT uses.

Wiring:
- `main.ts:524-527` and `:1172` pass the OpenRouter sign-in object, e.g. via
  `firstRunDeps` (`ipc-handlers.ts:5275-5279`).
- `FirstRunView.tsx` already renders the waiting card for `'openrouter'`
  (`:146-147`) and calls `startAuth('openrouter')` (`:192`, `:360-362`). Only stale
  comments change (`:103-105`, `:443-452`), plus the `describe-step.ts:21-28` comment.

The first-run waiting card has no Cancel for ChatGPT either (only a timeout,
`first-run.ts:68`). Adding one for both is a deck item.

**One user-visible consequence to state in the UI.** Each sign-in *creates a new key*
in the user's OpenRouter account, labelled "YouCoded". Signing in again (or from
another app copy) leaves the old key listed on openrouter.ai. It still works until
the user deletes it, and the app cannot delete it: that needs a management key, which
§4 excludes. The card's signed-in state links to the keys page. Wording is a deck
item.

### 3.6 Key replacement — first-draft proposal withdrawn

The first draft had `setKey` mint a new `secretRef` so a replaced key would orphan
other app copies' stale keys. Re-checked against current code, that change is
**withdrawn**, because it breaks two things:
- **It locks people out.** A new ref in the shared `providers.json` makes every other
  copy's `ready` false. For someone whose only provider is OpenRouter, that copy's
  next launch opens on the **sign-in screen** (`main.ts:1130-1150`), not a "Needs API
  key" row, and every OpenRouter model greys out.
- **A dev copy could knock Destin's live app off its key** by writing a new pointer
  into the shared file. The codebase already treats that pattern as a live-app-safety
  hazard (`main.ts:1070-1073`).

The harm it aimed at is already removed by §3.1. The verdict is per-profile and tied
to the key's fingerprint, so a copy still holding an old, dead key checks *its own*
key and says "OpenRouter didn't accept your key". It no longer says "Connected". That
is loud and accurate, with no lockout. `setKey` keeps reusing the ref
(`provider-registry.ts:208-238`), and the existing pin
`tests/provider-registry.test.ts:127-133` stays.

**Recorded, not fixed here:** a *first* key saved in a dev profile already writes a
pointer the live app has no blob for. That is a pre-existing sharing hazard in
`providers.json`, independent of OpenRouter, and it is filed on the roadmap (§8).

---

## 4. Deliberately out of scope

- **In-app credit purchase.** There is no API; a link is the honest surface.
- **Management/provisioning keys.** Detected and refused (§3.2). If §2's open risk
  resolves the wrong way, the answer is the capped-key fallback, not asking users for
  a management key.
- **A chat-surface warning banner.** Rejected in favour of the gear, the card and the
  chip; it adds noise in the surface the app keeps cleanest.
- **Android UI.** Refusals only (see Scope); logic stays portable for rebuild step 4.
- **The general raw-error banner** (error-inventory row #29) and other providers'
  error wording.
- **Search-provider keys** (`harness/search/search-key-store.ts`). Unaffected now
  that §3.6 is withdrawn.
- **Deleting old OpenRouter keys** after re-sign-in (needs a management key).
- **Blocking the model menu on `rejected`.** `ready` is unchanged (§3.1).

---

## 5. UI review gate

Everything above is behaviour. Per `.claude/rules/feature-flow.md`, the visible
parts are built in the UI workbench (`bash scripts/run-workbench.sh`, with a fake
`openrouter` backend in `renderer/dev/workbench/mock-shim.ts` beside the ChatGPT one
at `:1005-1030`, forced states via a `?openrouter=` param, rows in `MOCK_ONLY`
(`renderer/dev/workbench/mock-only.ts:96`) until the backend lands; the mock also needs
`health` on its provider rows (`mock-shim.ts:1075`), an `openrouterAccount` on its
`on.statusData` (`:2691`), and a `NATIVE_SESSION_ERROR` fixture carrying each
`errorCode`) and shown to
Destin as Before/After review decks before any of it is final. The visible parts are:
the card, the sign-in and waiting states, the chat error cards, the badges, and the
chip. Standard: `docs/active/design/2026-08-25-ui-design-guide.md`.

Questions reserved for Destin:

1. **Low-balance threshold** in dollars. One number drives the chip's warn tone and
   the blue dot. The expiry warning window (days) is a second, rarer number (§6).
2. **Chip on by default?** Proposed yes: prepaid credit running out stops work, and
   the Rate Limits chips beside it are on by default and already serve two plans.
3. **Chip shows the number always, or only when low?** Proposed always. A user who
   doesn't want it turns the widget off.
4. **Card wording** for every state (Connected with balance, Not checked yet, each
   rejected reason, Turned off, a stale "checked 6 days ago"), and whether the Test
   result or the balance owns the detail line.
5. **Sign-in vs paste** — relative prominence on the card and in the modal, and the
   waiting state.
6. **Cancel on the first-run waiting card** — for OpenRouter only, or ChatGPT too
   (it has none today).
7. **One blue dot for two meanings** ("no phone connected" and "OpenRouter running
   low") — acceptable, or does the badge need to say which?
8. **"Sign-in makes a new key"** — how, and whether, the card tells the user.
9. **Chat error cards** — the §3.3 copy table in place.

---

## 6. Why the reported key most likely died

An expired OpenRouter key returns the same `401 User not found.` as a deleted one.
The reported key was created 2026-07-15 and failed on 2026-08-31. Expiry is the
leading suspect, but it is unprovable after the fact. OpenRouter sets `expires_at`
only when the user asks for one (Destin, 2026-08-31, against his own account), so
the expiry warning serves a minority. It ships anyway (Destin's call): it is a date
comparison on data already fetched for validity, and it serves exactly the users who
can otherwise never tell an expired key from a deleted one. Nothing in §3.3 depends
on the theory: without a stored date, a 401 reads "didn't accept".

---

## 7. Guards

- `tests/provider-registry.test.ts` — OpenRouter `testConnection` calls `/api/v1/key`
  (never `/models`); management and provisioning keys each give
  `openrouter-wrong-key-type`; a `/credits` refusal leaves the test passing with a
  capped-key or unknown balance; a decrypt failure is not reported as "could not
  reach"; the fetch wrapper writes `rejected` on 401 and nothing on 402/403, and its
  thrown error carries no `status`/`statusCode`/`code`; a custom base URL without
  `/key` is `unchecked`; `upsert` ignores a `health` field sent to it; the widened
  return keeps `ok` false for everything but `verified`. (No
  `testConnection` coverage exists for key-based providers today.)
- New `tests/openrouter-health.test.ts` — the three verdicts; a check that finds a
  mismatched fingerprint discards the record; `setKey` clears the record; `list()`
  never decrypts;
  401 with a past `expiresAt` → expired, without → rejected; the refresh runs only
  while enabled with a key; the status payload reads without calling OpenRouter.
- New `tests/openrouter-oauth.test.ts` — S256 over the verifier actually sent; JSON
  exchange body; `key_label=YouCoded`; a wrong-nonce path doesn't end the round;
  timeout and Cancel close the listener; the key never appears in the public status.
  Precedent: the injectable listener in `chatgpt-auth.ts:173-176`.
- `tests/chatgpt-auth.test.ts`, `tests/chatgpt-oauth.test.ts` — green, unmodified,
  after the loopback extraction.
- First-run — rewrite the stub pins in `tests/first-run-chatgpt.test.ts:12,131-132,200-205,494-503`
  and `tests/describe-step.test.ts:109-115`
  (or move them to a new `first-run-openrouter.test.ts`); add `handleNativeApiKey`
  cases (rejected stays, unchecked continues) — none exist today.
- `tests/attention-banner.test.tsx` — each `errorCode` renders its action; no code
  falls back to phrase-matching; all three phrases match; the reducer clears
  `errorCode` with `errorMessage`; serialization round-trips it.
- `tests/assistant-settings-attention.test.tsx` — `rejected` marks Cloud providers.
- `tests/status-widgets.test.ts`, `tests/statusbar-widget-menu.test.tsx` —
  `widgetApplies` takes `RelevanceContext`; a provider-gating agreement table (not
  only the Cost one at `:220`) proves bar and menu agree for Claude, ChatGPT,
  OpenRouter and local sessions; the ChatGPT chips still pass after the fold-in; an
  unknown balance draws no chip; a Claude Code session neither offers nor draws the
  balance chip.
- `tests/ipc-channels.test.ts` — an `openrouter:*` parity block copied from
  `:1857-1935`.
- Workbench — `tests/workbench-mock-contract.test.ts` and
  `node scripts/workbench-boot-check.mjs` pass.
- `bash scripts/verify.sh --full` before calling it done.

---

## 8. Build order

1. **Settle §2's open risk** — with a real, low-limit key Destin provides for the
   test (never committed, never in the environment of a paid run): does `/credits`
   answer an inference key, and an OAuth-minted one? And does `/auth` accept
   `http://127.0.0.1:<port>/or-callback/<nonce>` — an IP and a path, where the docs
   only promise "localhost … any port"? (If not: `localhost` with the nonce in a query
   parameter.) This picks the balance source and callback form before any UI is drawn.
2. **UI first** (§5): workbench mockups → UX tester → review deck(s) → contract, per
   feature-flow. Destin chooses the full or short route.
3. Health module + real `testConnection` + first-run key check (§3.1-3.2).
4. Typed errors end to end (§3.3).
5. Refresh + status payload + badges + chip (§3.4).
6. Loopback extraction (ChatGPT tests green), then OpenRouter sign-in in Settings and
   first-run (§3.5).
7. Reviews, grader, acceptance deck, then Destin's merge call.

Also file on the roadmap: the pre-existing dev-profile pointer hazard (§3.6). This
work also closes the "OpenRouter card has no refresh" half of the 2026-09-07 roadmap
item: the verdict refresh and Test re-read the key.

---

## 9. What changed from the 2026-08-31 draft

- Every file:line re-pinned. The popup is now Cloud providers cards; D1's source is
  `OpenRouterBlock`, not `stateWord`.
- **Added D3's first-run case and D5.** A fake key finishes setup; chat failures never
  reach Settings.
- **Verdict moved from a `providers.json` field to a per-profile file with a key
  fingerprint.** A field would be erased by `upsert` and forgeable from the renderer.
- **§3.6 withdrawn.** Minting refs would lock single-provider users out at launch and
  let a dev copy break the live app. The per-profile verdict covers the original harm.
- **Write point 4 is a `fetch` wrapper** in the registry, not a hook at the emit site,
  which would miss specialists and lacks the key's ref.
- **402 copy corrected.** "For this request," not "out of credit".
- **Only a 401 changes the verdict.** A chat 402 or 403 is about that request (low
  reservation headroom, moderation flag) and never marks a good key rejected.
- **The "anything else → Open Settings" row was dropped.** It violated the error
  standards.
- **The ChatGPT expired dead end is folded in.** The "Settings → Providers" phrase is
  repaired.
- **Refresh copies ChatGPT's 5 min poll + per-reply debounce.** It replaces the
  invented 30-min timer; data rides `status:data` like `chatgptUsage`.
- **Gear red dot is a third OR'd input.** The 10 s remote poll cited as contrast no
  longer exists.
- **`widgetApplies` takes `RelevanceContext`** and absorbs the ChatGPT exception
  written twice today.
- **OAuth is loopback-only.** The remote surface can't reach the button, and ChatGPT
  shipped the same way. It uses port 0, 127.0.0.1, a path nonce in place of `state`,
  `key_label=YouCoded`, and a 5-min timeout under the 10-min code life. The loopback
  code is extracted and shared with ChatGPT.
- **First-run stub is a named second entry point.**
- **§2 `/credits` claim demoted to an open risk** with a fallback. OpenRouter's docs
  still say it needs a management key.
- **Android.** Refusal today; logic kept portable for the rebuild's step 4.
