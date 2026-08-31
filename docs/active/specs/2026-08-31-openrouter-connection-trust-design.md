---
status: draft
date: 2026-08-31
updated: 2026-08-31
tags: [openrouter, providers, native-runtime, settings, error-messages, oauth, status-bar]
origin: Destin hit `User not found. (provider error 401)` in a live session while
  Settings → Model Providers read "Connected".
---

# OpenRouter connection trust

Make the app's claim that OpenRouter is "Connected" mean something, give every
OpenRouter failure a way out, and let a user connect without hand-copying a secret.

All file paths, line numbers and API responses below were verified against
`youcoded@master` and the live OpenRouter API on 2026-08-31.

---

## 1. The bug that started this

A live session failed with `User not found. (provider error 401)` while
Settings → Model Providers showed **OpenRouter — Connected** and offered a **Test**
button that passed.

`User not found.` is OpenRouter's own wording, forwarded verbatim by
`describeProviderError` (`harness-session.ts:449`). Verified — a fabricated key
returns byte-identical text:

```
$ curl -H "Authorization: Bearer sk-or-v1-totally-fake-key-0000" \
       https://openrouter.ai/api/v1/chat/completions ...
{"error":{"message":"User not found.","code":401}}
```

It means OpenRouter does not recognise the key being sent. The user's key was
created 2026-07-15 and last written 2026-07-19; §6 explains why expiry is the
most likely cause.

### Four defects let the app claim otherwise

**D1 — "Connected" means "a key exists on disk."**
`ready = enabled && hasKey` (`provider-registry.ts:69-79`), rendered as the word
"Connected" by `stateWord` (`ProvidersSection.tsx:89-96`). Nothing is ever asked
of OpenRouter.

**D2 — the Test button cannot fail.**
`testConnection`'s `openrouter` branch probes `GET /api/v1/models`
(`provider-registry.ts:362-373`), which is **public**. Verified:

| Request | Result |
|---|---|
| `GET /api/v1/models`, no auth header | `200` |
| `GET /api/v1/models`, fabricated key | `200` |
| `GET /api/v1/key`, fabricated key | `401 User not found.` |

`res.ok` → `{ ok: true, message: 'Connected.' }` (`provider-registry.ts:424`). The
code already carries a `CAVEAT` comment at line 365 saying a 200 here "proves
reachability, NOT that the key is valid… Don't present the green check as key
validation in the UI." The UI does exactly that.

**OpenRouter is the only provider with a hollow test.** Verified against the live
APIs: Anthropic (`x-api-key` → 401), OpenAI (`Bearer` → 401) and Google
(`?key=` → 400) all probe endpoints that genuinely require the credential. The
one built-in, first-listed, flagship provider is the one that does not.

**D3 — a bad key is congratulated at entry.**
The Connect modal saves the key, runs that same hollow test, flashes green
"Connected." and auto-closes after 700 ms (`ModelProvidersPopup.tsx:340-352`).

Reinforcing the illusion: the model picker fills with hundreds of OpenRouter
models regardless, because `model-catalog.ts:15` fetches the same public
`/api/v1/models` with no auth header.

**D4 — the error is a dead end.**
`AttentionBanner` shows an **Open Settings** button only when the message matches
`/Settings → Providers/` (`AttentionBanner.tsx:40-41,117-118`). That phrase is
emitted only by the registry's *pre-flight* errors (no key configured at all). A
rejection *from* OpenRouter never contains it, so the user gets raw provider
jargon in a red pill with no action — exactly the reported screenshot.

---

## 2. What the OpenRouter API actually provides

Verified live on 2026-08-31 with a real funded key (since revoked). This section
is load-bearing: two documented claims turned out to be wrong.

`GET /api/v1/key` — validates, and returns:

| Field | Meaning |
|---|---|
| `limit`, `limit_remaining` | Per-key spending cap and what's left, when one is set |
| `usage`, `usage_daily/weekly/monthly` | Spend on this key |
| `is_free_tier` | Whether the account has ever purchased credit |
| **`expires_at`** | **Keys can carry an expiry date** |
| `is_management_key`, `is_provisioning_key` | Key *type* — detectable at paste time |
| `label` | Masked key name, safe to display |

`GET /api/v1/credits` — returns account-wide `total_credits` and `total_usage`;
balance is the difference.

**Correction to OpenRouter's own docs:** the API reference states `/api/v1/credits`
requires a Management key. It does not — a plain inference key returned `200` with
full data. No second key, and no optional-upgrade path, is needed.

**No purchase API exists.** Card, AliPay and USDC all go through OpenRouter's web
checkout. Adding credit is therefore a *link*, never an in-app storefront. Do not
design one.

**OAuth needs no app registration.** `https://openrouter.ai/auth` accepts an
arbitrary `callback_url` (including `http://localhost:PORT/...` — verified: it is
carried intact through OpenRouter's sign-in redirect) plus a PKCE `code_challenge`.
The code is exchanged at `POST /api/v1/auth/keys`. Omitting `callback_url` and
passing `key_label` yields a code the user copies back — the headless fallback.

---

## 3. Design

### 3.1 A remembered verdict, not a derived boolean

The registry gains a persisted **verdict** per provider. `ready` stays (it still
answers "is this provider usable at all"), but the verdict — not `ready` — is what
the UI puts into words:

| Verdict | Meaning | Carries |
|---|---|---|
| `verified` | A real check passed | balance, cap, expiry, checked-at |
| `rejected` | OpenRouter refused it | a typed reason (below) |
| `unchecked` | Could not reach OpenRouter | nothing |

`unchecked` is a distinct third state on purpose: a user who pastes a key while
offline must not be told the key is bad. Absence of proof is not proof of absence.

Typed rejection reasons, so §3.3 can word each one: `invalid-key`, `expired`,
`no-credit`, `wrong-key-type`, `forbidden`.

**Four write points.** The first three are checks; the fourth is the one that was
missing and is the direct cause of the reported bug:

1. On key entry / replace.
2. On **Test**.
3. On a background refresh (§3.4).
4. **On a live turn failure** — a `401/403/402` from a chat turn writes `rejected`
   with its reason. Today the chat error and the Settings screen share no state,
   which is precisely how Settings kept reading "Connected" while every turn failed.

Verdicts persist across restarts; a stale `verified` is still shown (with its
checked-at time) rather than reverting to `unchecked`, so an offline launch does
not look broken.

### 3.2 Real validation

`testConnection`'s `openrouter` branch moves from `GET /api/v1/models` to
`GET /api/v1/key`, and additionally fetches `GET /api/v1/credits` for the balance.
Both use the key under test. Non-OpenRouter branches are unchanged — they already
validate.

Wrong-key-type is caught here: `is_management_key === true` yields
`wrong-key-type` ("that's an account-management key — it can't run models"),
which is otherwise discovered as a confusing failure much later.

`Test` reports the balance ("Connected — $9.21 remaining") rather than an
unconditional "Connected."

### 3.3 Errors become exits

`isProviderConfigError`'s phrase-matching is replaced by the typed reason from the
provider layer, threaded onto the existing `session-error` path.

| Reason | Copy | Action |
|---|---|---|
| `invalid-key` | "OpenRouter rejected your API key." | Open Settings |
| `expired` | "Your OpenRouter key has expired." | Open Settings |
| `no-credit` | "You're out of OpenRouter credit." | Add credit (opens openrouter.ai) |
| `forbidden` | "OpenRouter refused this request." | Open Settings |
| anything else | provider's own message | Open Settings |

Every branch ends with an action; no provider failure is a dead end. Rate-limited
(429) is untouched — `withRetry` (`harness-session.ts:2942`) already retries it
and 401 correctly is not retried.

This must satisfy `docs/error-message-standards.md`: each message above is
*specific and accurate* because the status code is known, never a guess.

### 3.4 Warnings, quiet by default

A background refresh re-checks the verdict on a schedule, **only when OpenRouter
is configured and enabled**. It surfaces through the gear badges that already
exist (`HeaderBar.tsx:288-318`), reusing sync's semantics exactly:

- **Red dot** (`settingsDangerBadge`) — verdict is `rejected`. The app is broken now.
- **Blue dot** (`settingsBadge`) — `verified` but expiring soon, or balance low.

Both are suppressed while Settings is open, matching the existing component. The
red dot already takes precedence over the blue remote badge; OpenRouter's red
joins sync's on the same input.

**Status-bar chip** — a balance chip alongside the native session chips
(`StatusBar.tsx`, `selectNativeStatusChips`). Whether it is always visible or only
when low is **deferred to the workbench review** (§5); both are defensible and it
is a looking-at-it decision.

Thresholds are a review-deck question, not a spec decision.

### 3.5 Connecting without copying a secret

The Connect modal gains a primary **Connect with OpenRouter** route and keeps
**paste an API key** as an explicit secondary route. Manual key entry is never
removed.

The OAuth route is loopback-first with a code fallback:

1. Generate a PKCE verifier + `S256` challenge; bind a loopback listener on an
   ephemeral port.
2. `shell.openExternal` → `https://openrouter.ai/auth?callback_url=…&code_challenge=…`.
3. Browser returns the `code` to the loopback; exchange it at
   `POST /api/v1/auth/keys`; store the key; run a real verification (§3.2).
4. **Fallback** — when the app is reached over the remote/WebSocket surface (no
   usable loopback), or the loopback does not return within a timeout, switch to
   the headless variant (`key_label`, no `callback_url`) and show a paste-the-code
   field.

The fallback is not optional polish. The remote/phone surface cannot use a
loopback at all, and dropping those users back to raw-key entry would preserve the
exact failure class this spec exists to remove. The existing GitHub device-code
flow (`ConnectGithubModal.tsx`) is the precedent for a connect flow built to work
identically over the WebSocket transport — follow its shape.

The exchanged key never reaches the renderer; only public status fields do, as
with GitHub.

### 3.6 Key replacement gets a new pointer

`setKey` reuses the existing `secretRef` (`provider-registry.ts:151`). Because
`providers.json` (holding the pointer) lives in the **shared** `~/.youcoded/` while
the encrypted key lives in **per-profile** `userData/native-secrets.json`,
replacing a key in one app copy leaves every other copy silently using its own
older key under the same name — still reading "Connected."

Fix: `setKey` mints a **new** `secretRef` and deletes the old blob in the profile
performing the write. A profile whose store lacks the current ref then resolves to
`hasKey === false` and says so, instead of decrypting a stale secret.

Verified as a mechanism, not as an incident: 9 profiles on Destin's machine hold a
blob under the shared ref `01KXJAB4FS…`. Whether they differ is unknowable from
disk — `safeStorage` randomises the IV, so identical plaintext yields different
ciphertext.

---

## 4. What this deliberately does not do

- **No in-app credit purchase.** No API exists; a link is the honest surface.
- **No Management/provisioning key support.** §2 established it is unnecessary.
- **No chat-surface warning banner.** Rejected in favour of the gear badge — the
  extra value applies only to a user who ignored the badge *and* was about to run
  dry, at the price of noise in the surface the app works hardest to keep clean.
- **No audit of other providers' error messages.** Anthropic/OpenAI/Google already
  validate honestly; their message quality is the separate v1.3.1 followup.

---

## 5. UI review gate

Everything above is **behavior**. No visual decision is final here.

Per `CLAUDE.md` → *New Features & UI/UX Changes*, the Settings row, the error
cards, the badge behaviour, the status-bar chip and the Connect modal are built in
the **UI workbench** (`bash scripts/run-workbench.sh`) and brought to Destin as a
**review deck** (`scripts/ui-review/review-cards.py`) — Before | After per point,
with the changed region boxed — before any of it is treated as settled. The
standard is `docs/active/design/2026-08-25-ui-design-guide.md`.

Open questions explicitly reserved for that review:

1. Status-bar balance chip — always visible, or only when low?
2. Low-balance and expiry thresholds.
3. Wording of the Settings row across all three verdicts.
4. Relative prominence of the two Connect routes.

---

## 6. Why the reported key most likely died

`expires_at` (§2) is the newly-discovered mechanism. An expired OpenRouter key
returns `User not found.` with `401` — indistinguishable, from inside the app,
from a deleted one. The reported key was created 2026-07-15 and failed on
2026-08-31.

This is not proven for that specific key — it was already dead when investigated,
and a dead key reports nothing about *why*. It is stated as the leading
explanation because the mechanism is now verified to exist and the timeline fits.
The design does not depend on it being true: §3.4 warns ahead of expiry either
way, and §3.3 words `expired` distinctly from `invalid-key` using the status the
provider actually returns.

---

## 7. Guards

New behavior gets pinned, per `CLAUDE.md` → *Where Knowledge Lives*:

- `provider-registry.test.ts` — the OpenRouter test hits `/api/v1/key`, not
  `/models`; a `is_management_key` response yields `wrong-key-type`; `setKey`
  mints a new ref and deletes the old blob.
- A new verdict-store suite — three states, persistence, and a turn failure
  writing `rejected`.
- `AttentionBanner` tests — each typed reason renders its action; no reason
  renders without one.
- `ipc-channels.test.ts` — any new channel meets the existing surface-parity rule.
- Workbench: any new channel with no backend goes in `MOCK_ONLY`, and
  `node scripts/workbench-boot-check.mjs` must pass.
