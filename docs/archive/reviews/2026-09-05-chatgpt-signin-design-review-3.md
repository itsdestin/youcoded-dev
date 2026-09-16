---
status: closed
date: 2026-09-05
feature: docs/active/design/2026-09-04-chatgpt-signin/
round: 3
design: docs/active/specs/2026-09-05-chatgpt-signin-backend-design.md
reviewer: adversarial technical review, round 3 of 3 (rounds 1–2 taken as settled; judged against worktrees/chatgpt-signin-build/desktop at f2b4bc46)
---

# Sign in with ChatGPT — backend design review, round 3

Line numbers are in `youcoded/desktop` at `f2b4bc46` and its `node_modules`
(`@ai-sdk/provider-utils@5.0.33`, `ai@7.0.84`). Master comparisons use `git show origin/master:…`
from the same worktree. Every negative below was checked with `rg`; the command is quoted where
it carries the claim. Nothing from rounds 1–2 is restated unless a round-2 fix reopened it.

Three findings rise to accept-worthy (R3-1, R3-2, R3-3); two are medium (R3-4, R3-5); the rest
are builder-guess points and probe notes.

## R3-1 — The harness's capability profile has never heard of `'chatgpt'`: plan models are sized like an unmeasured local model, get the wrong prompt variant, and lose vision

**Where** design §4 (nothing about capability resolution); `src/main/harness/capability-profile.ts:87-89`
(`ProfileProviderType`), `:157-161` (`cloudVariant`), `:170` (`FRONTIER_PROVIDERS`), `:187-215`
(`injectionSizing`), `:233-236` (`mcpBudgetSizing`), `:350-362` (`VISION_PROVIDERS`, `visionFor`);
`src/main/harness/native-session-host.ts:2408, 2423-2424`; `src/main/ipc-handlers.ts:2388-2391`.

**Claim** `'chatgpt'` was added to `ProviderType` (`src/shared/provider-types.ts:12`) but not to the
harness's own union:

```
capability-profile.ts:87  export type ProfileProviderType =
capability-profile.ts:88    | 'local-engine' | 'openrouter' | 'openai-compatible'
capability-profile.ts:89    | 'anthropic' | 'openai' | 'google';
```
`rg -c "chatgpt" src/main/harness/capability-profile.ts src/main/harness/known-models.ts` → 0 hits in
both. The host's type resolver returns the registry row's type as-is (`ipc-handlers.ts:2389-2390`,
`p?.type as ProfileProviderType`), and the host substitutes a cloud default only for **null**
(`native-session-host.ts:2408  const type = (await this.providerTypeFor(binding)) ?? 'openrouter'`) —
`'chatgpt'` is a string, so it flows into `resolveProfile` unchanged and misses every set keyed on
the union:

- `FRONTIER_PROVIDERS` (`:170`, `anthropic/openai/google/openrouter`) → `injectionSizing` takes the
  non-frontier path (`:191-215`): `window = effectiveContextForModel(contextLength, modelId)`; no
  `KNOWN_MODELS` entry matches a `gpt-*` id (0 hits above), so when the manifest gives no context
  length (§4.3: "`contextLength` when given") the window is `null` → `exposeSkillCatalog: false`,
  `injectionBudgetTokens: 2_000`; `mcpBudgetSizing` (`:233-236`) likewise skips the frontier
  shortcut and clamps to the small tier.
- `cloudVariant('chatgpt')` (`:157-161`) → `'default'`, not `'gpt'` — the one prompt variant written
  for GPT models is not used for the GPT models this feature exists to add.
- `VISION_PROVIDERS` (`:350`) → `visionFor` falls to `false`: no registry entry, the host's vision
  resolver returns null for every non-openrouter binding (`ipc-handlers.ts:2409-2411`), and the
  provider-type default excludes `'chatgpt'`. Images cannot be sent to a GPT-5.x model on the plan.

**Consequence** The user picks GPT-5.6 from the plan and gets a session that hides the skill
catalog, injects 2k tokens where OpenRouter's GPT-5.6 gets 20k, runs the generic prompt instead of
the GPT one, and refuses images. Nothing errors; it just behaves like a small local model. R3's
"every model the plan allows" is true on the picker and false in the session.

**Proposed fix** One paragraph in §4 (a new §4.8 "Capability profile"): add `'chatgpt'` to
`ProfileProviderType`, `FRONTIER_PROVIDERS` and `VISION_PROVIDERS`; `cloudVariant('chatgpt')` →
`'gpt'`; the resolver comment at `ipc-handlers.ts:2385-2387` ("ProviderType and ProfileProviderType
are the same union today") becomes true again. Pin in `tests/capability-profile*.test.ts`:
`resolveProfile({ providerType: 'chatgpt', contextLength: null, modelId: 'gpt-5.6' })` yields
`exposeSkillCatalog: true`, `injectionBudgetTokens: 20_000`, `promptVariant: 'gpt'`,
`supportsVision: true`. Add a type-level guard so the two unions cannot drift again
(`const _check: ProfileProviderType = null as unknown as ProviderType` or an ast-grep rule).

verdict: accepted — §4.8: 'chatgpt' joins ProfileProviderType, FRONTIER_PROVIDERS and VISION_PROVIDERS; cloudVariant → 'gpt'; a union guard; pinned

## R3-2 — The "filed" launch-check gap is not pre-existing in effect: this branch removes the Skip link, so a lapsed or absent Claude login now locks the app for everyone without a ChatGPT account

reverses: R2-7 (the "drop the OpenRouter clause and file it" half)

**Where** design §5 ("The same gap exists today for an install with only an OpenRouter key … **filed on
the roadmap** rather than fixed here"), §6 (kill switch); `src/main/main.ts:918-925` (branch) and
`origin/master` `main.ts:926-933`; `src/main/prerequisite-installer.ts:457-471`;
`src/renderer/components/FirstRunView.tsx:398-400` (branch) vs `origin/master` `:362-367`.

**Claim** The late check itself is pre-existing — master runs the same `detectAuth()` →
`forceStep('AUTHENTICATE')` (`git show origin/master:desktop/src/main/main.ts | rg -n "detectAuth|forceStep"`
→ 926, 927, 933). What is **not** pre-existing is the way out. On master the forced wizard carries
"Skip setup (I installed via terminal)" (`master FirstRunView.tsx:362-367`, `handleSkip` → `firstRun.skip()`
→ `advanceTo('COMPLETE')`, `first-run.ts:425-426`). On this branch the link is gone from every step
(`FirstRunView.tsx:398-400`, contract R15) — approved on a deck that showed the *first* run, not the
forced re-run. `detectAuth` reports `installed: false` not only for "not logged in" but for any
failure: `resolveCommand('claude')` throwing (CLI uninstalled, moved, or off PATH) and a JSON parse
failure on a CLI whose `auth status` output changed (`prerequisite-installer.ts:468-470`,
`catch (err) { return { installed: false, error: String(err) } }`).

Three populations reach the forced AUTHENTICATE with no exit on this branch and had one on master:
(1) an install that completed setup via Skip on an older build and runs on an OpenRouter key; (2)
any install whose `claude` CLI breaks or disappears — and the wizard's own "Log in with Claude" then
fails too, because it spawns that same CLI (`first-run.ts:334`); (3) a ChatGPT-only install under
`YOUCODED_CHATGPT=0`: §6 constructs the registry with `chatgpt: null`, so `isSignedIn()` is not
consulted, the ChatGPT button is hidden, and the row is not listed. The OpenRouter first-run button
answers "coming in a later update" (§5), and the API-key box takes an Anthropic key (R1-6's verdict).

**Consequence** A working install becomes a sign-in screen that cannot be passed without a Claude
login or an Anthropic key, on the first launch after upgrading. For population (2) the screen's own
button fails. The design calls this "filed"; a filed item does not stop a lock-out from shipping.

**Proposed fix** Take R2-7's other option: `registerIpcHandlers` returns
`{ cleanup, hasUsableProvider: () => Promise<boolean> }` (any `ready` row from
`providerRegistry.list()`), and the late check becomes, in this order,
`chatgptAuth?.isSignedIn() || (await hasUsableProvider()) || (await detectAuth()).installed` — the two
local reads before the spawn. For the kill switch, keep a `ChatGptAuth` constructed (it is the file
reader) and pass `chatgpt: null` only to the registry/catalog/preload, so `isSignedIn()` still answers
the launch check; §6 says so explicitly. Pin in `first-run-chatgpt.test.ts`: `detectAuth` stubbed to
`installed: false` + one ready OpenRouter row → `COMPLETE`; and the kill-switch variant → `COMPLETE`.
If the design would rather keep "file it", it must say in §5 that the Skip removal turns the gap into
a lock-out and that this is accepted — the current sentence says the opposite.

verdict: accepted, reversing R2-7's 'file it' half — the late check accepts any ready provider through hasUsableProvider(), ChatGptAuth stays constructed under the kill switch (§5, §6, §9.9)

## R3-3 — The one-minute timed-out listener makes the immediate retry throw "Port 1455 is already in use … close the Codex CLI", and in the wizard the throw is swallowed

**Where** design §3 (`signIn()` step 2: "bind `127.0.0.1:1455`; on `EADDRINUSE` **throw** 'Port 1455 is
already in use on this computer … Close the other program using it (often the Codex CLI)'"), §3
("**On timeout the listener stays up for one more minute** answering every request with a fixed …
page"), §5 (`timed-out` → `lastError: 'Sign-in timed out. Try again?'`), §9.1; `src/main/main.ts:403-410`
and `:937-938`.

**Claim** After the timeout the state is `signed-out` and the flag is cleared (§3, the four terminal
transitions), so the next `signIn()` is a **new round** and runs step 2 — `bind 127.0.0.1:1455` —
while the design's own lingering server still holds the port for up to 60 s. `EADDRINUSE` → the
thrown sentence names another program. The card's post-timeout copy is "Not signed in" with no
message (§9.1), so the natural next click is Sign in; the wizard's is literally "Try again?". Both
retries inside the minute produce a false accusation of the Codex CLI. Round 2 introduced the
lingering listener (R2-11) and round 1 the sentence (R1-4); neither round put them side by side.

In the wizard it is worse: both `FIRST_RUN_START_AUTH` handlers wrap the call in
`try { … } catch (e) { log('ERROR', …) }` (`main.ts:403-410`) / `catch {}` (`:937-938`), and the
design's `handleChatGptLogin` lists outcomes only for `waitForSignIn` (`signed-in` / `timed-out` /
`cancelled` / `{ error }`) — a **throw from `signIn()`** (EADDRINUSE, unavailable keychain) is not
folded into `lastError`. R1-4's verdict says the card renders the thrown sentence; the wizard never
sees it. "Try again?" would do nothing visible for a minute, then work.

**Consequence** A misleading error by the house standard on the most likely retry path, and a
first-run button that silently does nothing after a timeout — the two R1 fixes cancelling each
other on the R2 fix.

**Proposed fix** (a) `signIn()` owns the port: before binding, if `this.server` is the post-timeout
lingering listener, close it (`closeAllConnections()` + `close()`) and bind fresh — or re-arm the
same server for the new round (swap the handler's `state`/verifier, re-arm the timer) and skip the
bind. `EADDRINUSE` is then genuinely another process, and the sentence is true. (b)
`handleChatGptLogin` wraps `signIn()` in its own try/catch and writes `authMode: 'none',
lastError: <the thrown message>` — mirror of `handleOAuthLogin`'s `'Could not get login URL…'` at
`first-run.ts:342-344`. Pins in `chatgpt-auth.test.ts`: "signIn 5 s after a timeout succeeds and the
lingering server is closed"; in `first-run-chatgpt.test.ts`: "signIn throws → lastError is the thrown
text".

verdict: accepted — signIn() closes the lingering listener before binding; handleChatGptLogin folds a throw into lastError (§3, §5, §8)

## R3-4 — `use-provider-type.ts` caches the catalog once per page and never invalidates, so a session started after signing in has no chips and no plan on `/usage` until the app reloads; and it resolves by model id alone, which collides with the OpenAI-key provider's ids

**Where** design §4.4 ("App already reads it, prunes it, and routes it to a session bound to a ChatGPT
model"); `src/renderer/hooks/use-provider-type.ts:17-33` (module-level `cache`, `if (cache) return cache`),
`:38-43` (`resolveProviderType`: `cache.catalog.find((m) => m.id === modelId)`); `src/renderer/App.tsx:2260,
2723`; `src/main/providers/model-catalog.ts:232-247` (`get()` iterates providers in `readAll()` order);
design §2 (the virtual row is **appended**).

**Claim** (a) The hook's comment says "a sign-in/out is rare enough that the next session open refreshes
this", but nothing clears `cache` — `rg -n "cache = null|inflight = null" src/renderer/hooks/use-provider-type.ts`
→ 0 hits. On a normal path the app opens on a Claude session, `useModelProviderType(null)` still calls
`load()` (`:57-60`, the effect runs regardless of `modelId`), and the catalog is captured **before** the
user signs in — with no chatgpt rows. Every later `resolveProviderType('gpt-5.6')` → `null` →
`activeProviderType` null → StatusBar draws no plan chips, `App.tsx:2260`'s `onChatGpt` is false so
`chatgptUsage` is never routed, and `/usage` names no plan. The backend does everything §4.4 says and
the approved surfaces stay blank until a reload. R4 and R9 are live-app rows on the acceptance deck;
this is the path the deck will walk.

(b) The lookup is `catalog.find(m => m.id === modelId)` — first row wins across providers. models.dev's
`openai` list already carries the ids the plan uses (`node -e` over a real
`provider-catalog-cache.json` → `gpt-5.6-sol, gpt-5.5, gpt-5, gpt-5.4, …`; the workbench fixtures use
`gpt-5.6-sol`/`gpt-5.5` for the plan). A user with an OpenAI API-key provider **and** the plan gets
the file row's type (`'openai'`) for a plan session because `get()` emits providers in `readAll()`
order and §2 appends the virtual row last. `SessionInfo` carries only the model id; the provider
id is deliberately not persisted (`src/shared/types.ts:40-47`), so the collision cannot be resolved
from the session alone — but `PortableModelRef.providerType` (`:53-57`) *is* the portable identity
and is already computed main-side (`bindingToPortableModel`, `ipc-handlers.ts:2480`).

**Consequence** (a) Blank chips and a plan-less `/usage` in exactly the demo the acceptance deck
records. (b) With both providers configured, the plan session shows no chips and the OpenAI-key
session shows the plan's — the wrong account's bars.

**Proposed fix** (a) Export `invalidateProviderTypeCache()` from the hook and call it from the
card on every `chatgpt.status` transition it observes (it polls `status()` already), and from
`ProvidersSection` after any upsert/remove — or reload on a miss (a `null` result for a non-null id
triggers one refetch). (b) Prefer the session's `providerType` when the session record carries a
`PortableModelRef` (expose it on `SessionInfo` for native sessions; main already has it), and fall
back to the catalog only when it does not. Pin both in a small `use-provider-type.test.tsx`. This is
renderer code that ships "as-is" per the handoff, but §4.4's routing claim depends on it, so the
design should own the fix or name it as a task.

verdict: accepted — §4.9: cache invalidation on status transitions plus refetch on a miss; the session's own providerType wins over the id lookup; the virtual row is appended first

## R3-5 — "refuse the id like the other built-ins" has one shape that re-introduces R2-4 and another that leaves `remove`/`setKey`/`testConnection` answering wrongly; the design does not say which

**Where** design §2 ("`upsert`/`remove` refuse the id like the other built-ins"), §8 (the pin "never lands
in providers.json"); `src/main/providers/provider-registry.ts:22-28` (`BUILT_INS`, `BUILT_IN_IDS`),
`:47-57` (`init()` seeds **every** `BUILT_INS` entry to disk), `:66-83` (`list()` derives `builtIn`
from `BUILT_IN_IDS`), `:118-131` (`remove` refuses only `BUILT_INS.find`), `:135-161` (`setKey`),
`:255-341` (`testConnection`).

**Claim** The natural reading of "like the other built-ins" is "add it to `BUILT_INS`" — and `init()`
would then seed `{ id: 'chatgpt', … }` into the shared `~/.youcoded/providers.json` on the next launch,
which is exactly the stray-card bug R2-4 was accepted to prevent. The other reading (not in
`BUILT_INS`, appended only in `readAll()`) leaves today's code answering:

- `remove('chatgpt')` → `BUILT_INS.find` misses → `readAll().find` returns the virtual row (no
  `secretRef`) → the `mutateJson` filter is a no-op → **resolves as success** (`:118-131`). The WS
  `provider:remove` case then responds `true` (`remote-server.ts:990-993`).
- `setKey('chatgpt', key)` → finds the virtual row → **writes a new secret** (`:141`) → the live-file
  lookup fails → deletes the secret and throws "Provider 'chatgpt' is not configured." (`:154-160`)
  — false; it is configured, it just takes no key.
- `testConnection('chatgpt')` → `default:` "ChatGPT Plan has an unknown type and cannot be tested."
  (`:322-323`).
- `list()` reports `builtIn: false` for a row nothing may remove.

None is reachable from the approved card today (`ProvidersSection.tsx:159` excludes `chatgpt` from
the generic cards, so no toggle/Remove/Test renders for it), but all four are IPC/WS channels
(`ipc-handlers.ts:2826-2829`, `remote-server.ts:978-1015`) and the parity test exercises them.

**Consequence** Either the R2-4 regression, or three channels that lie about the row — and a
builder cannot tell which the design wants.

**Proposed fix** State it: the virtual row is **never** in `BUILT_INS` (a separate `VIRTUAL_IDS` set,
with a WHY naming `init()`); `list()` reports `builtIn: true` for it; `upsert`/`remove`/`setKey`
refuse with one sentence ("ChatGPT is signed in through OpenAI, not with a key — use Sign out on its
card."); `testConnection('chatgpt')` returns `{ ok: isSignedIn(), message }` without a network call.
Make the §8 pin call `init()` after constructing with a `ChatGptAuth` and assert the file has no
`chatgpt` row — the wording "never lands in providers.json" passes today without exercising the seed.

verdict: accepted — VIRTUAL_IDS, never BUILT_INS; builtIn: true; one refusal sentence for upsert/remove/setKey; testConnection answers from isSignedIn; the pin exercises init() (§2, §8)

## R3-6 — Remaining points a builder would guess

**Where** §3, §4.3, §5.

**Claim** One line each:
- **`defaultRuntime()` when native is not supported.** `isNativeSupported()` (`RuntimeBinding.tsx:100-102`)
  is false under `YOUCODED_NATIVE=0`; a stored `'native'` then opens both forms with
  `nativeCreateBlocked` true (`:199`, no providers are loaded when `!nativeSupported`, `:141`) and a
  disabled Create. Remote and Android have their own `localStorage`, so only the desktop kill switch
  hits this. Say: `defaultRuntime()` returns `'claude'` unless `isNativeSupported()`.
- **`signOut()` during `waiting`.** §3 lists four flag-clearing transitions; `signOut()` is not one,
  though it "closes any listener". Say it clears the flag and resolves `waitForSignIn` as
  `'cancelled'`.
- **`signIn()` from `blocked`.** Unreachable from the card (R13 offers Sign out only) but reachable
  by IPC; say the callback's fresh account write carries no `blocked` (it replaces the file).
- **The injected `chatgptModels` source runs on every `modelCatalog.get()`**, not only on
  `providers.catalog`: six call sites (`ipc-handlers.ts:2383, 2412, 2429, 2449, 2830`;
  `remote-server.ts:1022`), including the per-session context and price resolvers for sessions on
  **any** provider (the virtual row is always `enabled`). §4.3's "at most hourly" must therefore live
  inside `ChatGptAuth.refreshModels()` and the injected function must return the cache without
  awaiting the network — otherwise an expired hourly stamp puts an OpenAI round-trip (up to the
  fetch timeout) in front of an OpenRouter session's first turn.
- **Order of `readAll()`'s append vs the R3-4(b) collision.** If the catalog lookup stays id-based,
  say which provider wins a shared id; today it is "whichever is earlier in `providers.json`".

**Consequence** None user-visible alone; each is a fork two builders would take differently.

**Proposed fix** One sentence each in the design.

verdict: accepted — one line each: defaultRuntime() honours isNativeSupported; signOut during waiting resolves cancelled; signIn from blocked replaces the file; the models source is cache-first; the plan's row wins a shared id (§2, §3, §4.3, §5)

## R3-7 — Probe notes (`test-engine/chatgpt-phase0.mjs` at f2b4bc46)

**Where** `:124` (`u.replace(/\?.*$/, (q) => q)`), `:159-167` (P0-5 body), `:113-121` (P0-3 legs).

**Claim** (a) `.replace(/\?.*$/, (q) => q)` replaces the query string with itself — a no-op that
reads like an unfinished redaction. The full URL printing is what P0-3 wants ("each leg prints the
string it sent"), so the intent is met by accident; delete the call or make it the intended
redaction of everything but `client_version`. (b) P0-5 sends `stream: false`; the SDK's
`doGenerate` body has **no** `stream` key at all (`@ai-sdk/openai/dist/index.js:6836-6860`, as R2-2
recorded). A schema that requires the field would refuse the SDK's body and accept the probe's, and
the decision rule would drop `wrapGenerate` on a false "accepted". Send the SDK's exact shape
(omit the key). (c) No leak found: no `save()` receives a token; `encrypted_content` is masked on
every saved SSE and on the non-streaming body (`:165`); the callback's `error_description` goes to
the terminal only; the authorize URL printed at `:100` carries the public challenge and state, not
the verifier. (d) The 10-minute timer at `:103` is never cleared after a successful callback;
harmless because `app.exit(0)` ends the process, but a run that spends >10 min in the later legs
would see "timeout: no callback" in the log after success — `clearTimeout` on resolve.

**Consequence** (b) is the only one that can mislead a decision rule.

**Proposed fix** As above; three lines in the probe.

verdict: accepted — the no-op replace goes, P0-5 sends the SDK's exact body (no stream key), the timer is cleared on callback

---

## Checked and fine

- **(b) The `Headers.set` wrapper.** provider-utils calls `fetch(url, { method: 'POST', headers:
  withUserAgentSuffix(headers, …), body: body.content, signal: abortSignal })` (`:3316-3324`) — a fresh
  literal with no `duplex` (a string body needs none) and nothing reads `init` after the call
  (`responseHeaders = extractResponseHeaders(response)`, `:3325`). `{ ...init, headers: h }` keeps
  `method`, `body`, `signal`. The `ai` retry re-enters `model.doStream`/`doGenerate` (`ai/dist/index.js:14907`,
  `retry(() => model.doGenerate(callOptions))`), so a retried request rebuilds its headers and passes
  through the wrapper again. `init.body` is `body.content`, the JSON string — the 401 re-send can reuse
  it verbatim.
- **(c) `createWindow()` is the right hook.** `registerIpcHandlers` is called inside it (`main.ts:891`),
  `registerFirstRunIpc` right after (`:895-896`), and the late `FIRST_RUN_STATE` closure is the `else`
  branch of the same function (`:897-956`) — a `const chatgptAuth` declared before `:891` is in scope
  for both. `createWindow` runs once (`:826` comment; the single call at `:1610`);
  `rg -n "app\.on\('activate'" src/main/main.ts` → 0 hits, so nothing constructs it twice. The
  precedent for "constructed inside createWindow before registerIpcHandlers" is `leaseClient`
  (`:162-167`).
- **Two `SecretsStore` instances share one file safely.** `read()` hits disk on every call
  (`secrets-store.ts:55-58`); there is no in-memory memo to go stale between the registry's instance
  and `ChatGptAuth`'s.
- **(d) The runtime resets.** `rg -n "setRuntime\(|setWelcomeRuntime\("` finds SessionStrip `:374/:377`
  and App `:440/:443` besides the two the design names — those are `applyModelChoice`'s picker-driven
  setters, not resets. The initial states (`:354`, `:419`) and the two post-create resets (`:742`,
  `:3361`) are the complete set. Remote and Android never see the key (separate `localStorage`).
- **(f) `ready` during the exchange.** `isSignedIn()` is file-present + secret-present; neither exists
  until the post-exchange write, so `providers.list` reports `ready: false` while the card is `waiting`,
  and flips with the write. No window in which the picker lists the plan before the account exists.
- **(g) The weekly words-deck item cannot break the card.** `isChatGptLimitMessage` is
  `/ChatGPT's .* session limit/` (`chatgpt-types.ts:54-56`) — it ignores everything after "limit", and
  `AttentionBanner.tsx:127` is its only consumer (`rg -n "isChatGptLimitMessage" src` → 2 hits, the
  definition and that line). Adding a day to the weekly sentence changes nothing it matches on.
- **(h) Non-streaming callers.** `rg -n "generateText\(|generateObject\(|streamObject\(|embed\(|embedMany\(" src/main src/shared`
  → exactly two: the title feeder (`ipc-handlers.ts:2497`) and the eval judge (`judge.ts:532`). The judge
  uses its own model-pinned OpenRouter factory (`judge.ts:525-531`), never the registry. Specialists
  and compaction go through `modelFactory` → `streamText` (`harness-session.ts:1468, 1865, 1571, 2326`).
  P0-5 and the title-path pin cover the whole set.
- **(i) The late check is on master** (`origin/master` `main.ts:926-933`) — R3-2 is about the exit
  from it, not the check.
- **`detectEndpoints` and `bindingToPortableModel` tolerate the virtual row.** The former filters
  `type === 'openai-compatible' && baseUrl` (`endpoint-detectors.ts:18-22`); the latter reads `type`
  and `label` off whatever row matches (`portable-model.ts:21-23`) — `'chatgpt'` / "ChatGPT Plan".
- **The WS provider cases catch throws** (`remote-server.ts:978-996`, each `try/catch` → `{ ok: false,
  error }`), so R3-5's refusals will not hang a remote request id.
- **Workbench fixture ids match the design's virtual row** (`fixtures/providers.ts:14  { id: 'chatgpt',
  type: 'chatgpt', label: 'ChatGPT Plan', ready: true }`); the mock derives `ready` from the account
  state (`mock-shim.ts:818`) exactly as §2 says the registry will.
- **The generic provider cards never render the chatgpt row** (`ProvidersSection.tsx:159` excludes
  `local-engine`, `openrouter`, `chatgpt`), so no enable toggle, Remove or Test reaches it from the
  approved screens — R3-5 is about the channels, not the card.
- **`nativeHost`'s delegated tiers and `youcoded-last-binding`** store `providerId` and resolve it
  through `list()`/`languageModel()` (`ipc-handlers.ts:2862`, `RuntimeBinding.tsx:150-166`) — both go
  through `readAll()`, so the appended row satisfies them; under the kill switch `useNativeBinding`
  falls back to the first ready provider and `languageModel` throws the §6 sentence.
