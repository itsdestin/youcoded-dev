---
status: closed
date: 2026-09-05
feature: docs/active/design/2026-09-04-chatgpt-signin/
round: 1
design: docs/active/specs/2026-09-05-chatgpt-signin-backend-design.md
reviewer: adversarial technical review (no deck context; judged against the code in worktrees/chatgpt-signin-build/desktop)
---

# Sign in with ChatGPT — backend design review, round 1

Line numbers below are in `youcoded/desktop` on `feat/chatgpt-signin` (worktree
`chatgpt-signin-build`, HEAD `1d17ae06`) and in its `node_modules` (`@ai-sdk/openai@4.0.51`,
`ai@7.0.84`, `@ai-sdk/provider-utils` as installed). Every "no X" claim was checked with `rg`;
the command is quoted where it matters.

## R1-1 — A ChatGPT-only first run puts the sign-in wizard back on screen at every launch

**Where** design §5 ("advances to `LAUNCH_WIZARD` → `COMPLETE` exactly like `handleOAuthLogin`");
`src/main/main.ts:895-925`; `src/main/prerequisite-installer.ts:457-471`.

**Claim** After first run the app does not trust the COMPLETE state — on every launch the
`FIRST_RUN_STATE` handler runs a "late auth check" that asks Claude Code whether it is logged in:

```
main.ts:918  const { detectAuth } = require('./prerequisite-installer');
main.ts:919  const result = await detectAuth();
main.ts:920  if (result.installed) return { currentStep: 'COMPLETE' };
main.ts:922  log('WARN', 'Main', 'Setup complete but auth missing — showing auth screen');
main.ts:924  lateFirstRunManager = new FirstRunManager();
main.ts:925  lateFirstRunManager.forceStep('AUTHENTICATE');
```
and `detectAuth` is `claude auth status` → `parsed.loggedIn === true` (prerequisite-installer.ts:460-467).
A user who chose **ChatGPT** on the first-run card and never signed in to Claude passes the
wizard once (the design marks auth installed and advances), then on the next launch
`detectAuth` says "Not logged in" and the wizard is forced back to AUTHENTICATE. Nothing in the
design touches this check. The same gap exists for the OpenRouter button, and the design also
never says what the first **New Session** is bound to after a ChatGPT-only first run — App's
session state defaults to `provider: 'claude'` (`src/renderer/App.tsx:2654`), i.e. a Claude Code
session on a machine with no Claude login.

**Consequence** The one flow the first-run button exists for is broken on the second launch:
the user signs in with ChatGPT, restarts, and is asked to sign in again — every time. If they
push through, "New Session" starts Claude Code, which has no login.

**Proposed fix** (1) Make the late check provider-aware: `detectAuth()` OR "a ChatGPT account is
signed in" (read `ChatGptAuth.isSignedIn()` — it is a sync file read, cheap enough for a launch
check) OR an OpenRouter key exists. Pin it with a test that constructs the late path with
`detectAuth` stubbed to `installed:false` and a signed-in ChatGPT account, and asserts
`currentStep: 'COMPLETE'`. (2) Decide, in the design, what a ChatGPT-only install's first
session is — the smallest honest answer is: on `handleChatGptLogin` success, persist a default
native binding to the plan's first model so "New Session" opens on it. Both belong in this
design, not the OpenRouter one, because this is the feature that makes a Claude-less install
possible.

verdict: accepted — the late auth check becomes provider-aware (§5) and a ChatGPT-only first run seeds the next session (§5, §9.6)

## R1-2 — "The SDK does the carrying" of encrypted reasoning is false for this harness

**Where** design §4.2 (`include: ["reasoning.encrypted_content"]` … "the SDK does the carrying
once asked"); `src/main/harness/harness-session.ts:1146-1150`, `:1942`, `:2601-2609`;
`node_modules/@ai-sdk/openai/dist/index.js:5296-5340`.

**Claim** The SDK re-sends a reasoning item only when the prompt contains an assistant
`reasoning` part carrying `providerOptions.openai.reasoningEncryptedContent` (index.js:5311,
5325-5334; a part without it is skipped with a warning at 5340). The harness never builds such a
part. Its assistant history message is text + tool-call parts only:

```
harness-session.ts:1146  private assistantMessage(text: string, toolCalls: ToolCall[]): ModelMessage {
harness-session.ts:1148    if (text) content.push({ type: 'text', text });
harness-session.ts:1149    for (const c of toolCalls) content.push({ type: 'tool-call', toolCallId: …, toolName: …, input: … });
```
and `reasoning-delta` parts are emitted to the UI and dropped (2601-2609). `rg -n
"providerMetadata|providerOptions" src/main/harness/harness-session.ts` returns one hit (2723,
the cost extractor). So with `store: false` nothing about the model's reasoning survives to the
next request: the `include` costs bytes on every reply and buys nothing.

**Consequence** Best case: every tool step re-reasons from scratch (slower, more of the plan's
window spent per turn). Worst case, and Phase 0 does not test it: the codex backend refuses a
follow-up whose `function_call` has no reasoning item alongside it — the probe sends one
message with no tools (`test-engine/chatgpt-phase0.mjs:139-146`), so a multi-step tool turn is
unexercised before "production code".

**Proposed fix** Keep the final `reasoning` part of each step in history with its
`providerMetadata` (the SDK exposes `reasoningEncryptedContent` + item id on the stream part,
index.js:7692-7701) — a `reasoning` part in `assistantMessage` before the tool calls — and add a
two-step tool-call case to the Phase 0 probe (one function tool, one `function_call_output`)
so P0 answers "does the endpoint accept a tool turn without a reasoning item, and with one".
Persisting reasoning parts also changes `pruneToolOutputs`/JSONL replay; call that out in the task
breakdown rather than discovering it mid-build.

verdict: accepted in part — P0-4 added to the probe; the reasoning carry (§4.7) is built only if the endpoint refuses a follow-up without it, else filed (§9)

## R1-3 — The access token is frozen into the model at turn start; the 401 retry has no way to replace it

**Where** design §4.1 (`apiKey: token`), §3 `accessToken()` ("refreshing when fewer than 5
minutes remain"), §4.6 ("401 → one refresh, one retry"); `harness-session.ts:1865`;
`node_modules/@ai-sdk/openai/dist/index.js:10629-10631`.

**Claim** `modelFactory` runs once per **turn** (harness-session.ts:1865), and the SDK builds the
header from the string it was given at construction:

```
index.js:10629  const getHeaders = () => withUserAgentSuffix(
index.js:10631      Authorization: `Bearer ${loadApiKey({ apiKey: options.apiKey, …
```
A turn is many steps; an agentic turn can run longer than the token's remaining lifetime
(accessToken refreshes only when <5 min remain *at turn start*, so a turn that starts with 6
minutes left will 401 mid-turn). The design's "one refresh, one retry" lives in the fetch
wrapper — which can only do that if it **rewrites `init.headers.Authorization` itself**. The
design does not say so; a builder who follows §4.1 literally will retry with the same expired
bearer.

**Consequence** Long turns near expiry fail with "Your ChatGPT sign-in has expired" while the
account is fine — and the refresh path that would have saved it never ran.

**Proposed fix** Make the wrapper the single owner of the credential: pass a placeholder
`apiKey: 'chatgpt'` to `createOpenAI` and have `fetchFor()` set `Authorization: Bearer
${await accessToken()}` on every request (this is also what makes the 401 retry trivial: refresh,
rewrite, re-send the same `init.body` string). Pin it in `provider-registry.test.ts`: the captured
request's bearer equals the *second* token when the injected `accessToken` changes between two
calls on one model.

verdict: accepted — the fetch owns the credential; the SDK gets a placeholder apiKey (§4.1)

## R1-4 — Two sign-in failures are reported with a guessed message; the card can already show the real one

**Where** design §3 `signIn()` ("on `EADDRINUSE` return false and log the port … the renderer
shows 'Could not open the sign-in page.' — specific enough"); §3 callback ("writes the secret
and the account file"); `src/renderer/components/ModelProvidersPopup.tsx` `ChatGptBlock.run()`;
`src/main/providers/secrets-store.ts:30-37`.

**Claim** (a) "Could not open the sign-in page." is a guess by the house standard
(`docs/error-message-standards.md`): the page opens fine — port 1455 is held by another program
(usually the Codex CLI, or the other YouCoded instance mid-sign-in). The card's own code
distinguishes the two shapes already:

```
ModelProvidersPopup.tsx  const ok = await verb();  if (!ok) setNote(failText);
                         } catch (e) { setNote(e instanceof Error ? e.message : failText); }
```
A **thrown** error is shown verbatim; `false` shows the canned line. (b) The callback path writes
the secret after the code exchange; `SecretsStore.set` throws when the OS keychain is unavailable
(secrets-store.ts:33-35, the "rare Linux setups" case) — at that point the browser tab already
says "You can close this tab", the card is `waiting`, and the design does not say what happens.

**Consequence** (a) A user with the Codex CLI's login open sees "Could not open the sign-in
page" and re-tries forever. (b) On a keychain-less Linux box the tab says success and the card
sits on the spinner until the 10-minute timer flips it to "Not signed in" with no message.

**Proposed fix** `signIn()` keeps returning `boolean` for the *generic* case but **throws** for
the two verified causes, with the real detail: EADDRINUSE → "Port 1455 is already in use on this
computer, so YouCoded cannot receive the sign-in. Close the other program using it (often the
Codex CLI) and try again."; and pre-flight `safeStorage.isEncryptionAvailable()` *before*
opening the browser, throwing the SecretsStore's existing sentence. A failure after the exchange
(store throws) → state `signed-out`, callback page says "YouCoded could not save the sign-in:
<reason>", and `status()` carries a one-shot `lastError` the card shows on its red line — or, if
the type must stay untouched, the thrown-from-`signIn()` pre-flight makes the post-exchange case
unreachable in practice. Add both to `chatgpt-auth.test.ts`.

verdict: accepted — signIn throws the two verified causes; keychain pre-flight before the browser; post-exchange store failure named (§3)

## R1-5 — The wizard's waiting state has no way out for ten minutes, and its completion API is undefined

**Where** design §3 (verbs "all four return `boolean`"), §5 ("awaits the round-trip's completion
promise"), §9.1 (10-minute timeout "on both surfaces"); `src/renderer/components/FirstRunView.tsx`;
`src/main/main.ts:403-408` and `:937-938`.

**Claim** `rg -n -i "cancel" src/renderer/components/FirstRunView.tsx` returns nothing: the
approved first-run card holds the waiting line (contract R15) with no Cancel, and the Settings
card — the only Cancel in the design — is unreachable during first run. Combined with §9.1 that
is a ten-minute dead screen after a mis-click or a closed tab. Separately, §5 has
`handleChatGptLogin` await "the round-trip's completion promise", but §3 gives `signIn()` a
`boolean` return and nothing else — no promise, no event, no `onChange`. And the design says
main.ts's two handlers call `firstRunManager.handleChatGptLogin(chatgptAuth)` without saying where
`chatgptAuth` comes from: `SecretsStore`/`ProviderRegistry` are constructed inside
`registerIpcHandlers` (ipc-handlers.ts:2302, 2315), which returns only a cleanup function
(main.ts:891); `registerFirstRunIpc` runs right after (main.ts:895), and the late handler is
created lazily inside another handler (main.ts:916-937).

**Consequence** A builder must invent the completion contract and the plumbing; two builders
would invent two. A user who clicks ChatGPT by mistake on first run waits ten minutes.

**Proposed fix** (1) Add to `ChatGptAuth` one more method the design names:
`waitForSignIn(): Promise<'signed-in' | 'cancelled' | 'timed-out' | { error: string }>`, resolved
by the callback / `cancelSignIn` / the timer, so `handleChatGptLogin` is `signIn()` then `await
waitForSignIn()`. (2) Give the wizard a shorter timeout than the card (Claude's own flow polls
2 minutes, first-run.ts:349) or a Cancel that calls `cancelSignIn()` — the latter is a UI change
and goes through a deck; the former is a §9 default the design can set now. (3) Have
`registerIpcHandlers` return `{ cleanup, chatgptAuth }` (or construct `ChatGptAuth` in main.ts
and pass it *in*, the way `remoteServer` is), and say which.

verdict: accepted — waitForSignIn(); the wizard passes a 2-minute timeout; ChatGptAuth is constructed in main.ts and passed in (§1, §3, §5)

## R1-6 — The OpenRouter button on the approved first-run card does nothing

**Where** design §5 ("`'openrouter'` is refused with a logged 'not built'"); contract R14;
`src/renderer/components/FirstRunView.tsx:305-307`.

**Claim** The button is real on the screen (`handleOpenRouter` → `startAuth('openrouter')`); the
design answers it with a log line only. No `lastError`, no state change, no `authMode` — the
user sees nothing happen.

**Consequence** A dead button on the first screen a new user sees, with no explanation — the
opposite of the accessibility pillar, and it will be graded on the acceptance deck against R14.

**Proposed fix** Until the OpenRouter sign-in ships: set `lastError: 'OpenRouter sign-in is
coming in a later update — use an API key below for now.'` (specific and true), or gate the
button off `firstRun` state until the backend exists. Either is a one-line design decision;
pick one and pin it in `first-run-chatgpt.test.ts`.

verdict: accepted — "OpenRouter sign-in is coming in a later update." (§5, §9.5); the "use an API key below" half was dropped because that box takes an Anthropic key

## R1-7 — Remote clients do not see the card at all; §5's remote story is written for a screen that never renders

**Where** design §5 ("Remote clients see the card (shared React) and can sign out; sign-in returns
false there…"), §9.4; `src/renderer/remote-shim.ts:1605-1607`;
`src/renderer/components/ModelProvidersPopup.tsx:15,27`.

**Claim**
```
remote-shim.ts:1607        supported: false,          // native: { supported: false, …
ModelProvidersPopup.tsx:15 const supported = window.claude?.native?.supported === true;
ModelProvidersPopup.tsx:27 if (!supported) return null;
```
The whole Model Providers section returns `null` on every remote client, and the handoff's own
instruction is "gate the ChatGPT card on `native.supported` exactly as the popup already is". So
no remote client can reach Sign in *or* Sign out, and "Could not open the sign-in page" is never
shown on a phone. (The chips and `/usage` card DO render remotely — StatusBar is not gated — and
they read `status:data.chatgptUsage`, which is broadcast; that part holds.)

**Consequence** Harmless to users; misleading to the builder, who would write and test a
remote-only `false` branch and a "friendlier remote line" (§9) for a surface that cannot appear.

**Proposed fix** Rewrite §5's remote paragraph: the four WS cases exist for the five-surface
parity test and answer honestly (`status` real, `sign-in` false, `cancel`/`sign-out` real), the
card is hidden by the existing `native.supported` gate, and the only remote-visible ChatGPT
surfaces are the chips and `/usage`. Drop §9.4/§9's "friendlier remote line" item.

verdict: accepted — §5 remote paragraph rewritten; the "friendlier remote line" item dropped

## R1-8 — Three lifecycle races the state machine does not guard

**Where** design §3 (`signIn()` timer, `signOut()`, `accessToken()` refresh, callback).

**Claim** (a) The 10-minute timer "closes the listener and returns to `signed-out`". The
callback success path "closes the listener" but the design never says it clears the timer; a
timer that fires after a successful sign-in flips the state it finds. (b) `accessToken()` holds a
single in-flight refresh promise; `signOut()` deletes the secret; a refresh that completes after
the delete writes the new token pair back with `SecretsStore.set(…, existingRef)` — the user
signed out and is signed in again. (c) `cancelSignIn()` during the code exchange (the callback
has fired, `POST /oauth/token` is in flight): the exchange returns and writes an account the user
just cancelled. None of the three has a test in §8.

**Consequence** (a) A signed-in card that flips to "Not signed in" ten minutes after signing in,
with no message. (b)/(c) "Sign out" that does not stick — a token-hygiene failure on a shared
computer.

**Proposed fix** One `generation` counter on `ChatGptAuth`, bumped by `signIn()` (new round),
`cancelSignIn()` and `signOut()`. The timer, the callback's post-exchange write, and the refresh's
post-response write each capture the generation when they start and no-op (discarding the fresh
token pair) when it has moved. Add three rows to `chatgpt-auth.test.ts`: timer-after-success is a
no-op; refresh-after-signOut leaves no secret; cancel-during-exchange leaves no account file.

verdict: accepted — a generation counter guards the timer, the post-exchange write and the post-refresh write (§3), three test rows added (§8)

## R1-9 — The `chatgpt.supported` gate the design adds would hide the card in the workbench and break the review rig

**Where** design §5 (`chatgpt.supported` on the preload namespace), §6 ("the renderer hides the
ChatGPT card"); `src/renderer/dev/workbench/mock-shim.ts:789-810`; `src/renderer/remote-shim.ts`
(no `chatgpt` namespace: `rg -n "chatgpt" src/renderer/remote-shim.ts` → 0 hits);
`scripts/ui-review/plans/chatgpt-signin.json` (11 shots, per the handoff).

**Claim** The mock's `chatgpt` object has `status/signIn/cancelSignIn/signOut` and no
`supported`; `window.claude.chatgpt.supported` reads `undefined` there and in remote-shim. A
renderer gate written as `supported !== false` passes by accident; written as `=== true` (the
pattern the popup uses, ModelProvidersPopup.tsx:15) it hides the card in every workbench shot and
on the acceptance deck. The design does not say which, and `workbench-mock-contract.test.ts`
cannot catch it (it checks channels, not flags).

**Consequence** Either the kill switch is a no-op in the workbench (fine) or the acceptance deck's
eleven shots come back with no card and R7/R12/R13 grade as failures for a tooling reason.

**Proposed fix** State the gate shape (`=== true`, matching `native.supported`), add `supported:
true` to the mock's `chatgpt` object and a `chatgpt` namespace to remote-shim with
`supported: false` (the card is hidden there anyway — R1-7), and run
`node scripts/workbench-boot-check.mjs` plus the 11-shot plan as part of the task that adds the
gate.

verdict: accepted — gate is `=== true`; mock gains supported:true; remote-shim gains the namespace with supported:false; boot-check + the 11-shot plan run in the gate task (§5)

## R1-10 — The limit error must carry NO `statusCode`; nothing pins that

**Where** design §4.5 ("A thrown plain `Error` is not retried"); `harness-session.ts:2965-2977`
(`withRetry`), `:428-460` (`describeProviderError`); contract R19 (exact wording).

**Claim** The claim itself holds (see "Checked and fine" for the chain). But it holds *only*
because the thrown object has no `statusCode`/`status`/`code` — a natural thing for a builder to
add ("it was a 429, keep the status for logs"). The harness has its own retry layer keyed on
exactly that:

```
harness-session.ts:2969  const status = err?.statusCode ?? err?.status;
harness-session.ts:2970  const retryable = status === 429 || (status >= 500 && status < 600) || err?.code === 'ECONNRESET';
```
and `describeProviderError` appends the suffix when a status is present
(`harness-session.ts:453  return status ? `${detail.trim()} (provider error ${status})` : …`).

**Consequence** With a `statusCode` on the error: three extra retries with delays after the plan
is exhausted, then a card reading "You have reached ChatGPT's 5-hour session limit (Resets @
6:43pm). (provider error 429)" — `isChatGptLimitMessage` still matches, R19's exact wording does
not.

**Proposed fix** Say the must-not in §4.5 and pin it: `chatgpt-oauth.test.ts` asserts the thrown
limit error has no own `statusCode`, `status` or `code` property and that
`describeProviderError(err)` returns `chatGptLimitMessage(...)` byte-for-byte. Same for the 401
"expired" and 403 "blocked" errors — the 403 text is OpenAI's verbatim, and a suffix would break
R13's "OpenAI's own reason".

verdict: accepted — the must-not is in §4.5 and pinned for the limit, expired and blocked errors (§8)

## R1-11 — Callback listener: escape the echoed text, check `state` first, answer nothing else

**Where** design §3 ("The callback … the page shows OpenAI's `error_description` verbatim …").

**Claim** Three small hardening rules the design leaves implicit. (a) `error_description` is
attacker-influenced text (any page in the user's browser can navigate to
`http://localhost:1455/auth/callback?error=x&error_description=<script>…`); rendering it into
an HTML page verbatim is a reflected XSS on a localhost origin. (b) The order in §3 lists the
`state` check first, then the `code`/`error` check that sets `signed-out`; if a builder checks
`error` first, any local page can cancel a waiting sign-in without knowing `state`. (c) The
server should answer `404` to every other path/method and send `Connection: close`, so a stray
keep-alive does not hold the listener open past `server.close()`.

**Consequence** (a) is the only one with a security shape; (b) is a nuisance; (c) is the
"listener never quite closes, next sign-in gets EADDRINUSE" bug.

**Proposed fix** HTML-escape the description (or show a fixed sentence and keep OpenAI's text for
the card only); make "state mismatch → 400, no state change" the first branch and pin it (the
design's test row "state mismatch never exchanges" should also assert the state stays `waiting`);
`404` for anything but `GET /auth/callback`; `res.setHeader('Connection', 'close')` and
`server.closeAllConnections()` on close.

verdict: accepted — branch order fixed, error_description never in the HTML, 404 elsewhere, Connection: close + closeAllConnections (§3)

## R1-12 — The lock's stated reason is wrong; keep the lock, fix the WHY

**Where** design §2 (`chatgpt-account.json` "under `mutateFileUnderLock` … so the dev instance
and the built app cannot tear it").

**Claim** The file lives in Electron's `userData`, which the dev instance does not share with the
built app (`run-dev.sh` gives the dev instance its own profile; `secrets-store.ts:1-4, 17-19`
say the same about `native-secrets.json`). The two processes never touch the same
`chatgpt-account.json`. The lock is still needed — for three writers **inside one process**
(token refresh, the 5-minute usage poll, the hourly models refresh) that each read-modify-write
the same JSON — but that is not what the design says, and a builder who notices the premise is
false may drop the lock.

**Consequence** A dropped lock → a torn account file after a refresh races a usage poll → the
next `status()` reads it as `signed-out` and the user is signed out for no reason.

**Proposed fix** Replace the sentence with the real reason and require that every write goes
through one `mutate(fn)` on `ChatGptAuth` whose callback is the only place the file is merged.
`~/.youcoded/providers.json` *is* shared across instances, and `ProviderRegistry.init()` already
seeds under `mutateJson` — that part of §2 is right.

verdict: accepted — the WHY is now the three in-process writers; every write goes through one mutate(fn) (§2)

## R1-13 — `buildStatusData` has no test, and cannot be unit-tested where it is

**Where** design §8 ("`tests/status-data-chatgpt.test.ts` (or an extension of the existing
buildStatusData test if one exists)"); `src/main/ipc-handlers.ts:2051-2130`.

**Claim** `rg -l "buildStatusData" tests/` matches three files, all of which only *mention* it in
comments (e.g. `tests/statusline-rate-limits.test.ts:19`). The function is a closure inside the
3,900-line `registerIpcHandlers`; nothing can import it.

**Consequence** The builder discovers this at test-writing time and either skips the test or
refactors `ipc-handlers.ts` mid-task.

**Proposed fix** Name the seam now: `ChatGptAuth.usageForStatus(): ChatGptUsage | null` (pure
over the cached snapshot, pruned), tested in `chatgpt-auth.test.ts`; `buildStatusData` adds the
one line `chatgptUsage: chatgptAuth?.usageForStatus() ?? null`, and the design drops the
"status-data test" row.

verdict: accepted — usageForStatus() is the seam; the status-data test row is dropped (§4.4, §8)

## R1-14 — The Phase 0 probe does not answer the `client_version` question the design relies on

**Where** design §4.3 (`GET …/codex/models?client_version=<our app version>`), §9.5;
`test-engine/chatgpt-phase0.mjs:115` (`client_version=${process.env.CLIENT_VERSION ?? '0.130.0'}`).

**Claim** The probe sends a Codex-CLI-shaped version by default; the design will send YouCoded's
(`1.x`). If the manifest gates rows on the *caller's* version — the parameter's whole reason to
exist — P0-2's answer ("the manifest lists rows") may not transfer to the value the app sends,
and R3 ("every model the plan allows") would be graded against a list obtained with someone
else's version string.

**Consequence** A models list that is empty or shorter in the app than in the probe, found only
at the acceptance deck.

**Proposed fix** Run the probe twice for the models leg — `CLIENT_VERSION=<app version>` and the
default — and record both; the design then states which value ships and what the app does when
the manifest answers with zero visible rows (today: "falls back to the ids the responses
endpoint accepts (probed one by one)" — a probe that does not exist and would spend the user's
plan; say instead: cached rows, else the card's red line with OpenAI's text).

verdict: accepted — P0-3 fetches the manifest with both version strings; the request-by-request fallback is gone; zero rows → cached rows, else nothing listed (§0, §4.3)

## R1-15 — Small undecided points a builder would otherwise guess

**Where** design §3, §4.3, §4.4.

**Claim** Each is one sentence in the design:
- §4.4 "once right after any turn on a ChatGPT model ends" — the harness has no turn-end hook the
  registry can see; the fetch wrapper sees *responses*, not turns. Say "after every
  `/codex/responses` response completes" (per step), or add the hook.
- §4.1 `fetchFor(binding.modelId)` — nothing in the design uses the model id inside the wrapper.
  Drop the argument or say what it is for.
- §3 `status()` "the file exists and its secret decrypts" — decrypting hits the OS keychain; the
  card calls `status()` every second while `waiting` and on every refresh. Say `isSignedIn()`
  is `secrets.has(ref)` (no decrypt, secrets-store.ts:142-144) and decrypt only in `accessToken()`.
- §3 `plan`: "`/wham/usage`'s `plan_type` wins" — say the account file's `plan` is overwritten on
  each usage poll (so the card and `/usage` agree after a plan change) rather than only the
  in-memory copy.
- §4.3 `refreshModels()` on a 401/403: does it trigger the same refresh/blocked transitions as a
  turn, or is it silent? (Silent, with the cached rows, is the right answer; say it.)
- §6 kill switch: `list()` omits the row but `nativeHost`'s persisted delegated-tier bindings and
  sessions bound to a ChatGPT model still exist — the languageModel refusal covers the turn; say
  the picker shows those sessions' chip as the bare model id (whatever it does today for a
  removed provider) so nobody files it as a bug.

**Consequence** Six places where two builders would diverge; none user-visible on its own.

**Proposed fix** One line each in the design.

verdict: accepted — one line each: per-response refresh debounced to 60 s (§4.4); fetchFor(modelId) dropped (§4.1); isSignedIn is a presence check, decrypt only in accessToken (§3); plan overwritten by the poll (§2); refreshModels 401/403 silent (§4.3); kill-switch chip behaviour named (§6)

---

## Checked and fine

- **SDK body assembly (§4.1/§4.2).** `@ai-sdk/openai@4.0.51` `index.js:6685-6700` emits `store`,
  `instructions`, `include`, `prompt_cache_key` from `providerOptions.openai`;
  `systemMessageMode: 'remove'` is a legal enum value (`:5910`); `gpt-5.x` ids classify as
  reasoning models (`:53`, `gptVersion.major >= 5`), so the SDK would auto-add
  `reasoning.encrypted_content` for `store:false` anyway (`:6680-6682`) — the explicit include is
  redundant but harmless; a `name: 'chatgpt'` on `createOpenAI` still reads
  `providerOptions.openai` as a fallback (`:6581-6586`).
- **`createOpenAI` accepts `baseURL`, `apiKey`, `headers`, `fetch`** (`index.d.ts:1508-1543`) and
  exposes `provider.responses(modelId)` (`index.js:10746`).
- **`wrapLanguageModel` in `ai@7.0.84` is spec v4** (`asLanguageModelV4`, `index.js:15823`,
  `specificationVersion: "v4"` at `:15849`; every openai model class is `"v4"`). The middleware
  must use the `LanguageModelMiddleware` type from `ai` (v4), not the `LanguageModelV3Middleware`
  in `@ai-sdk/provider`'s d.ts that the design's source list points at.
- **A plain thrown `Error` from the custom fetch reaches `session-error` verbatim.** Chain:
  `provider-utils handleFetchError` (`:1283-1328`) wraps only a `TypeError('fetch failed')` or an
  error whose `.code` is a retryable network code — a plain Error passes through; `ai`'s
  `shouldRetry` (`:2825`) accepts only `APICallError`/`GatewayError`; provider-utils throws the
  original error on attempt 1 (`:3589-3590`); `streamText` emits it as a fullStream `error` part;
  the harness rethrows an `Error` instance (`harness-session.ts:2682-2687`) and `send()` emits
  `describeProviderError(err)` (`:2242`), which for an Error with no status/body returns
  `err.message` trimmed (`:456-458`). `withRetry` (`:2965-2977`) does not retry it (no status).
- **A passthrough 429** (burst limit) is an `APICallError` with `isRetryable` true (`ai
  index.js:448-450`), retried twice with backoff honouring `retry-after` under 60 s
  (`:2786-2813`), then `RetryError`; `describeProviderError` unwraps `.lastError` and renders
  "<OpenAI message> (provider error 429)" — the "keeps the SDK's own backoff" sentence holds.
- **Harness passes no `temperature` and no `providerOptions`** (`rg -n "temperature|providerOptions"
  src/main/harness/harness-session.ts` → 0 hits on either); system text rides as `system:`
  (`:2296`) and becomes the prompt's `system` message the middleware moves.
- **Blocked accounts leave the picker**: `ModelPicker.tsx:341,355` filter `providers.filter(p =>
  p.ready)`; `ProvidersSection.tsx:92` already words the chatgpt row "Signed in / Not signed in".
- **App already prunes and routes `chatgptUsage`** (`App.tsx:1461`, `:2260-2267`, `:2724`,
  `:3154-3176`); `FirstRunState.authMode` already includes `'chatgpt' | 'openrouter'`
  (`first-run-types.ts:29`); FirstRunView renders the waiting line for `authMode === 'chatgpt'`
  (`:100-101`).
- **Parity tests** — the arcade block shape (`ipc-channels.test.ts:1389-1440`) and the Android
  "listed in SessionService.kt" precedent (`:1185-1187`, `toContain('"${t}"')`) exist as the design
  describes; `workbench-mock-contract.test.ts` requires preload's namespace at indent 2 (`  chatgpt:
  {`) with members at indent 4, and its "no MOCK_ONLY entry has since gained a real channel" test
  will force the four rows off `MOCK_ONLY`.
- **Ordering for first run**: `registerIpcHandlers` (main.ts:891, constructs `SecretsStore` and
  `ProviderRegistry` at ipc-handlers.ts:2302/2315) runs before `registerFirstRunIpc` (main.ts:895),
  so a `ChatGptAuth` built there exists when the wizard's handler is registered (plumbing is
  R1-5).
- **SecretsStore semantics the design leans on hold**: encrypt-before-lock (`:114-118`), `get`
  returns `null` for missing/undecryptable (`:124-133`) so a copied `userData` reads signed-out;
  `ProviderRegistry.remove` refuses built-ins (`:118-122`) and `init` is idempotent (`:44-56`);
  existing tests asserting two built-ins (`provider-registry.test.ts:26,29`) survive if `list()`
  omits the row when constructed with `chatgpt: null`.
- **Phase 0 probe hygiene**: claims are redacted before print/save (`chatgpt-phase0.mjs:41-51,
  104-109`), `encrypted_content` is stripped from the saved SSE (`:154`), and no `save()` call
  receives a token (`:100, 109, 128, 150, 153-154` reviewed).
- **PKCE/state**: 16-byte state, S256 challenge, `state` compared before exchange — as designed
  (ordering caveat in R1-11). Binding `127.0.0.1` for a `localhost` redirect is what the Codex
  CLI does and is what P0-1 tests.
