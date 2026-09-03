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
`youcoded@master` (`ddac2f14`) and the live OpenRouter API on 2026-08-31.

**Scope: desktop only.** Android answers every `provider:*` channel with
`not-implemented-on-mobile` (`SessionService.kt:4015-4021`) — the provider
registry is desktop-only until M8. Nothing here needs a Kotlin counterpart, and
the surface-parity rule is satisfied by the existing refusal.

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
leading suspect.

### Four defects let the app claim otherwise

**D1 — "Connected" means "a key exists on disk."**
`ready` is `enabled && (keyless || hasKey)` (`provider-registry.ts:69-79`); for
OpenRouter — which is never keyless — that reduces to `enabled && hasKey`.
`stateWord` renders it as the word "Connected" (`ProvidersSection.tsx:89-96`).
Nothing is ever asked of OpenRouter.

**D2 — the Test button cannot fail.**
`testConnection`'s `openrouter` branch probes `GET /api/v1/models`
(`provider-registry.ts:362-373`), which is **public**. Verified:

| Request | Result |
|---|---|
| `GET /api/v1/models`, no auth header | `200` |
| `GET /api/v1/models`, fabricated key | `200` |
| `GET /api/v1/key`, fabricated key | `401 User not found.` |

`res.ok` → `{ ok: true, message: 'Connected.' }` (`provider-registry.ts:424`). The
shared 401/403 handler one line below it is correct and already says "The API key
was rejected" — it simply never runs, because a public endpoint never 401s. The
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
| `limit`, `limit_remaining` | Per-key spending cap and what's left — **`null` when no cap is set** |
| `usage`, `usage_daily/weekly/monthly` | Spend on this key |
| `is_free_tier` | Whether the account has ever purchased credit |
| **`expires_at`** | **Keys can carry an expiry date** |
| `is_management_key`, `is_provisioning_key` | Key *type* — detectable at paste time |
| `label` | Masked key name, safe to display |

`GET /api/v1/credits` — returns account-wide `total_credits` and `total_usage`;
balance is the difference.

**Both endpoints are needed, and that is not redundancy.** `limit_remaining` is
`null` for an uncapped key, which is the common case — so it cannot be the balance
source. `/credits` is the only account-balance read. `/key` is the only validity
and expiry read. §3.2 calls both, in parallel, on one Test.

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
passing `key_label` yields a code the user copies back.

---

## 3. Design

### 3.1 A remembered verdict, keyed to the key

The registry gains a persisted **verdict**. `ready` stays (it still answers "is
this provider usable at all"), but the verdict — not `ready` — is what the UI puts
into words.

**The verdict is keyed by `secretRef`, not by provider id.** This single decision
is what makes the rest of the section safe, and it is the correction that closes
the same hole D1 left open:

- `providers.json` lives in the **shared** `~/.youcoded/`, while the encrypted key
  lives in **per-profile** `userData/native-secrets.json` (`secrets-store.ts:1-5`).
  A verdict keyed by `"openrouter"` would be written by one app copy and read by
  another copy holding a *different* key — replacing "Connected means a key exists"
  with "Connected means *someone's* key worked once." Keyed by ref, a verdict can
  only ever describe the key it was measured against.
- Replacing a key mints a new ref (§3.6), which **automatically** orphans the old
  verdict. No separate invalidation step exists to forget.
- It gives `expires_at` a home, which §3.3 needs.

Record shape, one per ref:

```
{ ref, verdict, reason?, balanceUsd?, expiresAt?, checkedAt }
```

It is a field on the existing provider entry keyed by ref — **not a new store**.
No new file, no new lock, no new IPC channel.

| Verdict | Meaning | Carries |
|---|---|---|
| `verified` | A real check passed | balance, expiry, checked-at |
| `rejected` | OpenRouter refused it | a typed reason (below) |
| `unchecked` | Could not reach OpenRouter | nothing |

`unchecked` is a distinct third state on purpose: a user who pastes a key while
offline must not be told the key is bad. Absence of proof is not proof of absence.

**Typed rejection reasons**, split by where each can actually be produced —
conflating the two is what made an earlier draft promise wording the app could
never emit:

| Reason | Produced at | From |
|---|---|---|
| `invalid-key` | check **and** turn | `401` |
| `expired` | check **and** turn | `401` **plus** a stored `expiresAt` in the past |
| `no-credit` | check **and** turn | `402` |
| `forbidden` | check **and** turn | `403` |
| `wrong-key-type` | check only | `is_management_key` / `is_provisioning_key` |

`wrong-key-type` is check-only because a management key never reaches a chat turn
— §3.2 refuses it at paste time.

**Four write points.** The first three are checks; the fourth is the one that was
missing and is the direct cause of the reported bug:

1. On key entry / replace.
2. On **Test**.
3. On a background refresh (§3.4).
4. **On a live turn failure** — a `401/402/403` from a chat turn writes `rejected`
   with its reason. Today the chat error and the Settings screen share no state,
   which is precisely how Settings kept reading "Connected" while every turn failed.

Verdicts persist across restarts; a stale `verified` is still shown (with its
checked-at time) rather than reverting to `unchecked`, so an offline launch does
not look broken.

### 3.2 Real validation

`testConnection`'s `openrouter` branch moves from `GET /api/v1/models` to
`GET /api/v1/key`, and fetches `GET /api/v1/credits` alongside it for the balance
(§2 explains why both). Both use the key under test. A `/credits` failure
downgrades the balance to "unknown" and never fails the test — validity is what
Test is for. Non-OpenRouter branches are unchanged; they already validate.

Wrong key type is caught here: `is_management_key === true` **or**
`is_provisioning_key === true` yields `wrong-key-type` ("that's an
account-management key — it can't run models"), which is otherwise discovered as a
confusing failure much later.

`Test` reports the balance ("Connected — $9.21 remaining") rather than an
unconditional "Connected."

The existing `CAVEAT` comment at `provider-registry.ts:365` is deleted in the same
edit — it exists to warn about behavior this change removes, and leaving it would
make the next reader distrust a test that is now honest.

### 3.3 Errors become exits

`isProviderConfigError`'s phrase-matching is replaced by the typed reason,
carried as an **optional** sibling field on the event the path already emits:
`emitEvent('session-error', { text })` (`harness-session.ts:2212`) becomes
`{ text, reason? }`.

**This overrides a deliberate earlier decision, and the reason it is safe to
override is that the decision's premise no longer holds.** The comment at
`AttentionBanner.tsx:36-38` rejected threading a structured field through
~8 files, choosing phrase-matching because "the message has a single origin and
is stable." That reasoning was sound for a *required* field, which every hop must
construct. An optional field is additive: every intermediate hop passes it through
or drops it, nothing downstream breaks when it is absent, and the phrase-matching
fallback stays in place for messages that carry no reason. The comment is rewritten
to record why the tradeoff flipped rather than deleted.

`describeProviderError` already reads the status (`api?.statusCode ?? api?.status`,
`harness-session.ts:436`), so no new error parsing is needed — the reason is a
switch on a value the function holds today.

| Reason | Copy | Action |
|---|---|---|
| `invalid-key` | "OpenRouter rejected your API key." | Open Settings |
| `expired` | "Your OpenRouter key has expired." | Open Settings |
| `no-credit` | "You're out of OpenRouter credit." | Add credit (opens openrouter.ai) |
| `forbidden` | "OpenRouter refused this request." | Open Settings |
| anything else | provider's own message | Open Settings |

`expired` is reachable **only** because §3.1 stores `expiresAt` from the last
successful check. On its own a `401` cannot tell an expired key from a deleted one
(§6) — the app words it "expired" when it has independently recorded that the date
has passed, and "rejected" otherwise. Without the stored date this row would be
dead copy.

Every branch ends with an action; no provider failure is a dead end. Rate-limited
(429) is untouched — `withRetry` (`harness-session.ts:2942`) already retries it,
and correctly does not retry 401/402/403.

This must satisfy `docs/error-message-standards.md`: each message above is
*specific and accurate* because the status code is known, never a guess.

### 3.4 Warnings the user can actually see

A background refresh re-checks the verdict on a schedule, **only when OpenRouter
is configured and enabled**, and surfaces in two places: the Settings gear (for
trouble) and the status bar (for the running number).

**Owner and cadence.** The refresh lives in the **main process** — that is forced,
not chosen: the check needs the decrypted key, and the key never reaches the
renderer. It runs once at launch and every **30 minutes** thereafter, and only
while an enabled OpenRouter provider exists. Thirty minutes is deliberately slow:
the number it maintains is a standing figure, not a live meter, and the case that
actually matters — credit hitting zero mid-turn — is caught immediately by write
point 4 (§3.1) rather than by polling. For contrast, the remote-client check next
door polls every 10 s (`App.tsx:2030`); a wallet balance does not need that, and
waking the main process on that cadence to ask OpenRouter a question nobody is
reading would be the same waste that poll was already trimmed once for.

#### The gear badge

**The existing badges cannot be reused as-is — this is a correction to an earlier
draft that assumed they mirrored sync.** Verified:

- `settingsDangerBadge` (red) is `syncWarnings.some(level === 'danger')`
  (`App.tsx:2054-2056`) — a sync-only derivation, fed by sync's own push channel.
- `settingsBadge` (blue) is **not** sync at all. It is `clientCount === 0`
  (`App.tsx:2018-2032`) — lit whenever no remote client is connected, which is the
  standing state for every user who never set up phone access. It is on right now.

So a low-balance signal routed into the blue dot would be **invisible**: the user
would see the dot they have been ignoring for months. And routing OpenRouter into
the red dot by injecting a synthetic sync warning would be a category error — a
provider problem is not a sync problem, and the next sync change would trip over it.

The fix, and the smallest one that works: **both booleans gain a second input,
OR'd at the call site** (`App.tsx`), leaving each subsystem's own derivation alone.

- **Red** — verdict is `rejected`. The app is broken now.
- **Blue** — `verified` but expiring soon, or balance low.

Both stay suppressed while Settings is open, matching the existing component
(`HeaderBar.tsx:288-318`), and red keeps precedence over blue.

**Known limitation, accepted:** one dot cannot say *which* subsystem needs
attention. A user with an unconnected phone and a healthy OpenRouter key sees the
same blue dot either way. Opening Settings resolves it in one click, and splitting
the badge per-subsystem is a bigger UI change than this spec should make. Flagged
for the review deck (§5).

#### The status-bar balance chip

The balance also gets a chip in the status bar. It is not a bespoke chip: the
status bar already has a **widget registry** (`StatusBar.tsx:479-666`,
`state/status-widgets.ts`) where every element is a registered `WidgetDef` with a
`label`, a `defaultVisible`, a `description` and a `bestFor` line shown in the
Customize menu's (i) tooltip, persisted per-user under
`youcoded-statusbar-widgets`. The balance chip is one more entry in it.

It belongs in the existing **Rate Limits** category, which already answers exactly
this question for Claude subscriptions ("how much of your allowance is left"). An
OpenRouter balance is the same question asked of a different wallet, and grouping
it there means a user looking for "am I about to run out" finds both in one place.

```
{ id: 'openrouter-balance', label: 'OpenRouter Credit', defaultVisible: true,
  description: 'How much OpenRouter credit is left on the key this session is using.',
  bestFor: 'Anyone running models through OpenRouter — it is prepaid, so this is the number that stops your work.' }
```

**Relevance gating already exists and must be used — but it cannot express this
rule today.** `widgetApplies(id, runtime)` plus `widgetUnavailableReason`
(`state/status-widgets.ts:54-70`) keeps Claude-only widgets out of native
sessions, with a one-line explanation in the Customize menu. The balance chip is
the mirror case — relevant only when the session is actually running on OpenRouter
— and it needs the reason line **"OpenRouter sessions only."**

**It is not an inverse set, and treating it as one would ship the exact defect
this module exists to prevent.** `widgetApplies` takes `SessionRuntime`, which is
`'claude' | 'native'` and, in that file's own words, "the session's runtime — NOT
its provider type." `native` covers the local engine, direct Anthropic, OpenAI,
Google and custom endpoints. So `!CLAUDE_ONLY.has(id)` would draw an **OpenRouter
credit balance on a session running a local model** — a false chip, which is
precisely why `git-branch` was left out of `widgetUnavailableReason` ("Claude Code
sessions only" would have been a false sentence).

The work, stated so it is not discovered mid-build:

- Add the session's provider type to `RelevanceContext`. The value already exists
  at the call site — `modelProviderType?: string | null` is a StatusBar prop
  (`StatusBar.tsx:426`), passed from `App.tsx` and used today for chip styling
  (`StatusBar.tsx:1045`). Nothing new is threaded from main; this follows the
  `runsLocally` precedent, which exists for the same reason.
- Widen `widgetApplies` past bare `runtime`. It has two call sites that currently
  disagree in what they hold: the menu passes the full `relevance` context
  (`StatusBar.tsx:786`), the bar passes bare `runtime` (`StatusBar.tsx:991`).
  Both must end up on the same input.
- `statusbar-widget-menu.test.tsx` asserts the bar and the menu agree. It must be
  extended, not merely kept passing — the new gate is a new way for them to
  diverge.

A Claude Code session must never draw the chip, a native non-OpenRouter session
must never draw it, and the menu must say why rather than hiding the row silently.

**Data path.** Not `selectNativeStatusChips` (`StatusBar.tsx:201`) — that derives
from a single turn's token usage and has no route for account state. The chip reads
the verdict's `balanceUsd` off the same pushed `statusData` object that already
carries `syncWarnings` into `StatusBar`, refreshed on the §3.1 write points. No new
feed.

**What it shows.** Always the number when the widget is on (`$9.21`), switching to
the `warn` chip styling (`StatusBar.tsx:472`) below the low threshold and `danger`
at zero — the bar's existing three-tone vocabulary, not a new one. It renders
nothing at all when the verdict is `unchecked` and no balance was ever read;
fabricating `$0.00` from an unknown is exactly the class of lie this spec exists to
remove.

`defaultVisible: true` is proposed rather than settled — see §5.

### 3.5 Connecting without copying a secret

The Connect modal gains a primary **Connect with OpenRouter** route and keeps
**paste an API key** as an explicit secondary route. Manual key entry is never
removed.

**Desktop gets the automatic browser round-trip; the copy-a-code variant exists
for the surfaces that cannot have it.** The round-trip is the flow worth having —
the user clicks one button, approves in the browser they are already signed into,
and lands back in the app with a working key having typed nothing. That is the
whole point of doing OAuth instead of shipping a better paste box.

**Primary — desktop, loopback:**

1. Generate a PKCE verifier + `S256` challenge; bind a loopback listener on an
   ephemeral port.
2. `shell.openExternal` → `https://openrouter.ai/auth?callback_url=…&code_challenge=…`.
3. The browser returns the `code` to the loopback; exchange it at
   `POST /api/v1/auth/keys`; store the key; run a real verification (§3.2).
4. The modal shows a waiting state with a **Cancel** that tears down the listener,
   so a user who closes the browser tab is never stuck.

**Fallback — remote/phone, or when the loopback cannot complete:** switch to the
headless variant (`key_label`, no `callback_url`), which yields a code the user
pastes into the modal; exchange and verify identically from step 3.

It triggers on three conditions, all of which must be handled or the primary path
becomes a trap: the app is being driven over the remote/WebSocket surface (no
usable loopback exists at all), the port bind fails, or the listener does not
receive a redirect within a timeout. The third is the one that matters in practice
— a user who completes sign-in in a browser profile that cannot reach `localhost`,
or who takes long enough that they assume it failed.

**The fallback is not optional polish.** The remote/phone surface cannot use a
loopback under any circumstances, and dropping those users back to raw-key entry
would preserve the exact failure class this spec exists to remove. Both paths ship
together.

The existing GitHub device-code flow (`ConnectGithubModal.tsx`) is the precedent
for the fallback's anatomy — a `{ userCode, verificationUri, expiresAt }`-shaped
public status object, an open-in-browser button, and a visible copy of the URL for
the remote case, where the one platform difference is how the URL gets opened
(`ConnectGithubModal.tsx:187`). Reuse that shape rather than inventing a second
one.

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
`hasKey === false` and says so, instead of decrypting a stale secret. Combined with
§3.1's ref-keyed verdicts, the stale *verdict* is orphaned by the same act.

**This changes behavior for every provider, not just OpenRouter, and it has a
user-visible cost worth stating plainly:** after replacing a key in one app copy,
every other copy flips from "Connected" to "Needs API key" — including copies that
were working fine a moment earlier. That is the intended trade (a loud, accurate
"re-enter your key" beats a silent, wrong one), but it is a real change for users
who were not broken, and the Settings row should word it as an invitation to
re-enter rather than an error. Review-deck item.

Verified as a mechanism, not as an incident: 9 profiles on Destin's machine hold a
blob under the shared ref `01KXJAB4FS…`. Whether they differ is unknowable from
disk — `safeStorage` randomises the IV, so identical plaintext yields different
ciphertext.

---

## 4. What this deliberately does not do

- **No in-app credit purchase.** No API exists; a link is the honest surface.
- **No Management/provisioning key support.** §2 established it is unnecessary.
  They are detected and refused (§3.2), never accommodated.
- **No chat-surface warning banner.** Rejected in favour of the gear badge — the
  extra value applies only to a user who ignored the badge *and* was about to run
  dry, at the price of noise in the surface the app works hardest to keep clean.
- **No Android work.** Provider channels already refuse honestly on mobile; parity
  belongs to M8 with the rest of the native runtime.
- **No audit of other providers' error messages.** Anthropic/OpenAI/Google already
  validate honestly; their message quality is the separate v1.3.1 followup.

---

## 5. UI review gate

Everything above is **behavior**. No visual decision is final here.

Per `CLAUDE.md` → *New Features & UI/UX Changes*, the Settings row, the error
cards, the badge behaviour, the status-bar chip and the Connect modal are built in
the **UI workbench**
(`bash scripts/run-workbench.sh`) and brought to Destin as a **review deck**
(`scripts/ui-review/review-cards.py`) — Before | After per point, with the changed
region boxed — before any of it is treated as settled. The standard is
`docs/active/design/2026-08-25-ui-design-guide.md`.

Open questions explicitly reserved for that review:

1. The low-balance threshold in dollars — one number drives both the chip's `warn`
   tone and the gear's blue dot, so it is decided once. The expiry threshold (in
   days) is a second, separate number, and the rarer trigger of the two (§6).
2. The balance chip's `defaultVisible`. On for everyone who uses OpenRouter is the
   proposal, on the reasoning that prepaid credit running out stops work outright
   — unlike the opt-in cost/duration widgets, which are curiosities. Off-by-default
   is the defensible alternative if the bar is judged already full.
3. Whether the chip shows the number always, or only once it is low. The widget
   toggle makes this less load-bearing than it looks — a user who does not want a
   standing number turns the widget off — which is the argument for always-on.
4. Wording of the Settings row across all three verdicts, and of the stale
   `verified` ("checked 6 days ago").
5. Wording when §3.6 flips a working copy to "Needs API key" — an invitation, not
   an error.
6. Relative prominence of the two Connect routes, and what the loopback wait state
   looks like while the browser is open.
7. Whether one gear dot serving both sync and providers is acceptable, or whether
   the badge needs to say which (§3.4's accepted limitation).

---

## 6. Why the reported key most likely died — and the one fact that gates §3.4

`expires_at` (§2) is the newly-discovered mechanism. An expired OpenRouter key
returns `User not found.` with `401` — indistinguishable, *from a single response*,
from a deleted one. The reported key was created 2026-07-15 and failed on
2026-08-31.

This is not proven for that specific key — it was already dead when investigated,
and a dead key reports nothing about *why*. It is the leading explanation because
the mechanism is verified to exist and the timeline fits.

**Nothing in §3.3 depends on it being true.** The `expired` wording fires off a
recorded `expiresAt` (§3.1), not off a theory about this key; when no date was
recorded, the same 401 words itself `invalid-key`. Both paths end in an action.

**That question is now answered. OpenRouter sets `expires_at` only when the user
asks for it** — confirmed by Destin, 2026-08-31, against his own account. So an
expiry warning fires only for the minority who deliberately date-limit a key.

**The warning ships anyway — Destin's call, and the cost is near zero.** The
reasoning: everything expensive about it is already being built for other reasons.
`expires_at` is read on the same `/api/v1/key` call that establishes validity
(§3.2), stored in the same verdict record that already holds the balance (§3.1),
and rendered through the same blue dot the low-balance case needs (§3.4). The
incremental work is a date comparison. Against that, the population it serves is
exactly the population that hit this bug: a user who sets an expiry has no other
way to find out it passed, because an expired key and a deleted one are the same
401. Dropping it would have removed the warning best matched to the incident that
started the spec.

**What this does change:** the blue dot's *usual* job is low balance. Expiry is the
rarer trigger, not the headline. §5's threshold question is therefore mostly a
low-balance question.

---

## 7. Guards

New behavior gets pinned, per `CLAUDE.md` → *Where Knowledge Lives*:

- `provider-registry.test.ts` — the OpenRouter test hits `/api/v1/key`, not
  `/models`; `is_management_key` **and** `is_provisioning_key` each yield
  `wrong-key-type`; a `/credits` failure leaves the test passing with an unknown
  balance; `setKey` mints a new ref and deletes the old blob.
- Verdict cases in the same suite — the three states; a verdict written under ref A
  is never read for ref B (the profile-crossing case §3.1 exists to prevent); a
  turn failure writing `rejected`; a `401` with a past `expiresAt` yielding
  `expired` and without one yielding `invalid-key`.
- `AttentionBanner` tests — each typed reason renders its action; an event with no
  `reason` still falls back to phrase-matching; no reason renders without an action.
- `status-widgets` / `StatusBar` tests — the balance widget is registered with a
  description and a `bestFor`; `widgetApplies` returns false for a Claude Code
  session and the Customize menu shows "OpenRouter sessions only"; an `unchecked`
  verdict with no recorded balance draws no chip at all rather than `$0.00`.
- OAuth tests — the PKCE challenge is `S256` over the verifier actually sent; a
  loopback bind failure and a listener timeout each fall through to the code-paste
  path rather than erroring; Cancel tears the listener down; the exchanged key
  never appears in anything the renderer receives.
- `ipc-channels.test.ts` — any new channel meets the existing surface-parity rule,
  including Android's `not-implemented-on-mobile` refusal.
- Workbench: any new channel with no backend goes in `MOCK_ONLY`, and
  `node scripts/workbench-boot-check.mjs` must pass.
