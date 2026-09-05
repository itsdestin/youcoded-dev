---
status: draft
date: 2026-09-05
feature: docs/active/design/2026-09-04-chatgpt-signin/
round: 2
design: docs/active/specs/2026-09-05-chatgpt-signin-backend-design.md
reviewer: adversarial technical review, round 2 (round-1 verdicts taken as settled; judged against worktrees/chatgpt-signin-build/desktop at 8a72839a)
---

# Sign in with ChatGPT — backend design review, round 2

Line numbers are in `youcoded/desktop` at `8a72839a` and its `node_modules` (`@ai-sdk/openai@4.0.51`,
`ai@7.0.84`, `@ai-sdk/provider-utils@5.0.33`, `electron@41.10.7`). Nothing from round 1 is restated
unless the revision reopened it.

## R2-1 — The credential-owning fetch will send TWO bearers; every request 401s and the account signs itself out

**Where** design §4.1 ("`ChatGptAuth.fetch()` returns a `fetch` that sets `Authorization: Bearer …` on
every request"), §4.6, §8 (the pin "the second captured request carries the second token");
`node_modules/@ai-sdk/provider-utils/dist/index.js:1372-1380, 3305-3318`; `@ai-sdk/openai/dist/index.js:10629-10640`.

**Claim** The SDK hands the wrapper a plain object whose keys are already **lower-cased** — `withUserAgentSuffix`
round-trips them through `new Headers()`:

```
provider-utils:1372  function withUserAgentSuffix(headers, ...) {
provider-utils:1373    const normalizedHeaders = new Headers(normalizeHeaders(headers));
provider-utils:1379    return Object.fromEntries(normalizedHeaders.entries());
provider-utils:3305    const response = await fetch(url, { method: "POST", headers: withUserAgentSuffix(headers, …), body: body.content, signal })
```
so `init.headers.authorization === 'Bearer chatgpt'` (the placeholder). A wrapper written as the design reads —
"sets `Authorization`" — adds a second key; undici merges same-name headers:

```
$ node -e "const h=new Headers({authorization:'Bearer chatgpt', Authorization:'Bearer real'}); console.log(JSON.stringify(h.get('authorization')))"
"Bearer chatgpt, Bearer real"
```
The §8 pin as worded passes on this bug: the captured request *does* carry the second token — beside the placeholder.

**Consequence** OpenAI sees a malformed bearer → 401 → §4.6 refreshes and re-sends (same bug) → second 401 → the
account is signed out with "Your ChatGPT sign-in has expired" on the first turn after every sign-in. The feature
does not work, and the symptom blames the user's account.

**Proposed fix** Say it: the wrapper replaces the header **case-insensitively** — `const h = new Headers(init.headers);
h.set('authorization', \`Bearer ${await accessToken()}\`); fetch(url, { ...init, headers: h })`. Pin: the captured
request has exactly one `authorization` value and it equals the token (assert on `new Headers(captured.headers).get('authorization')`,
and that the placeholder string appears nowhere in the request).

verdict: (pending)

## R2-2 — One production call on the ChatGPT model does not stream; the design's own `stream: true` invariant is violated and native sessions never get titles

**Where** design §4.2 (`stream` | `true` | "the SDK always streams for `streamText`; asserted by the fetch wrapper
in dev"); `src/main/ipc-handlers.ts:2482-2499`; `@ai-sdk/openai/dist/index.js:6836-6860` (`doGenerate` body has no
`stream`), `:7427-7433` (`doStream` adds `stream: true`).

**Claim** The native auto-title feeder calls the registry's model through `generateText`, not `streamText`:

```
ipc-handlers.ts:2496  const model = await providerRegistry.languageModel(binding);
ipc-handlers.ts:2497  const { text } = await generateText({ model, prompt, abortSignal: AbortSignal.timeout(15_000) });
```
`generateText` → `doGenerate` → `postJsonToApi5({ body })` with no `stream` field (`:6850`; only `doStream` spreads
`stream: true`, `:7431`). The handoff and §4.2 both state the endpoint requires `stream: true` (pi forces it). The
harness itself is fine — `generateSummary` uses `streamText` (`harness-session.ts:1571`) — so this is the one
non-streaming path, and `rg -n "generateText\(" src/main` finds only this site and the eval judge.

**Consequence** Every native session bound to a ChatGPT model stays "New Session" forever: the feeder's contract is
"unresolvable = skip silently" (comment at `:2489-2494`), so nothing is logged. In dev, the §4.2 assertion throws
inside the feeder instead. Either way R3's models are usable but the session list looks broken for them only.

**Proposed fix** Add `wrapGenerate` to `chatGptMiddleware`: call `doStream()`, fold the parts into a generate result
(text, finishReason, usage, response metadata). Pin in `provider-registry.test.ts`: `generateText` on the chatgpt
model produces a captured body with `stream: true`. Cheap P0 addition: one non-streaming `/codex/responses` call, to
record the exact refusal (if it turns out to be accepted, the middleware half is dropped and only the title path is
pinned).

verdict: (pending)

## R2-3 — The ChatGPT-only default lasts exactly one session: both forms reset the runtime to Claude Code after every create

**Where** design §5 ("a new `youcoded-runtime-default = 'native'`, which the two forms read for their **initial**
runtime only"), §9.6; `src/renderer/components/SessionStrip.tsx:354, 737-742`; `src/renderer/App.tsx:419, 3361`.

**Claim** The initial state is `'claude'` in both forms (SessionStrip `:354`, App `:419`), and both **reset to
`'claude'` after a create**, not to the initial value:

```
SessionStrip.tsx:738  setShowNewForm(false);
SessionStrip.tsx:742  setRuntime('claude');
App.tsx:3361          setWelcomeRuntime('claude');
```
An "initial only" read fixes the first New Session; the second one — the one the user opens after their first
conversation — is Claude Code again.

**Consequence** On a ChatGPT-only install (the case R1-1 was accepted for) the second New Session starts a Claude
Code session with no Claude login. The user hits the exact failure R1-1 described, one session later.

**Proposed fix** One `defaultRuntime(): Runtime` in `RuntimeBinding.tsx` (reads the key, falls back to `'claude'`),
used by both `useState` initialisers **and** both post-create resets. `runtime-default.test.tsx` asserts the
post-create reset lands on the default, not `'claude'`.

verdict: (pending)

## R2-4 — Seeding the row into the shared `~/.youcoded/providers.json` puts a stray "ChatGPT Plan" key card into Destin's live app (and any older build)

**Where** design §2 ("`~/.youcoded/providers.json` gains one built-in row, seeded by `ProviderRegistry.init()` …
that file IS shared across instances"), §6 ("the built-in row is still seeded"); `src/main/native-home.ts:31-32`
(root is `os.homedir()/.youcoded`, no profile suffix); master's `desktop/src/renderer/components/ProvidersSection.tsx:149`,
`ModelProvidersPopup.tsx:309`, `provider-registry.ts` `list()`.

**Claim** The dev instance and the built app share the file (the design says so; `NativeHome` takes no profile).
Master's code reads every row regardless of type — `list()` maps all of `readAll()`; the popup embeds the section
(`ModelProvidersPopup.tsx:309  <ProvidersSection embedded />`), whose embedded filter is

```
master ProvidersSection.tsx:149  rows.filter((p) => p.type !== 'local-engine' && p.type !== 'openrouter')
```
and the card treats every non-`local-engine` type as an API-key provider (`isLocal = provider.type === 'local-engine'`,
key box + Remove). Master's `BUILT_INS` lacks `chatgpt`, so Remove succeeds there — and the dev instance re-seeds on
its next launch. Bound by accident, master's `languageModel` falls to `default:` → "ChatGPT Plan has an unknown type
and cannot be used."

**Consequence** After one launch of the dev instance on this branch, Destin's **working** app shows a "ChatGPT Plan"
card with an API-key box under Cloud Models. Same for anyone who downgrades after this ships. The live-app rule is
about not touching that app; this touches it through a shared file.

**Proposed fix** Do not persist the row. Make `chatgpt` a **virtual built-in**: `readAll()` (or `list()` +
`languageModel()`'s lookup) appends `{ id:'chatgpt', type:'chatgpt', label:'ChatGPT Plan', enabled:true }` when
`this.chatgpt` is non-null. Nothing on disk means nothing for an older build to misread, the kill switch needs no
migration either way, and `remove()`/`upsert()` already refuse built-ins. If persisting is kept for a reason, say
the reason and accept the stray card in the design.

verdict: (pending)

## R2-5 — Phase 0's "our version" manifest leg sends Electron's version, not the app's

**Where** design §0 P0-3 ("`/codex/models` fetched twice — with the app's version and with a Codex-shaped one");
`test-engine/chatgpt-phase0.mjs:120` (`client_version=${encodeURIComponent(app.getVersion())}`);
`node_modules/electron/dist/resources/default_app.asar` `loadApplicationPackage` lines 551-570.

**Claim** Under `npx electron test-engine/chatgpt-phase0.mjs` the default app only calls `app.setVersion` when
`<path>/package.json` exists — and the path is a file:

```
default_app:551  const packageJsonPath = path.join(packagePath, 'package.json');
default_app:553  if (fs.existsSync(packageJsonPath)) { … app.setVersion(packageJson.version); … }
```
`test-engine/chatgpt-phase0.mjs/package.json` never exists, so `app.getVersion()` is the bundle's — `41.10.7`
(`node -p "require('electron/package.json').version"`), not `1.2.4` (`package.json:3`). (The direct run I tried
hangs in this sandboxed shell; the asar is the authority.)

**Consequence** `models-app-version.json` is the manifest for `client_version=41.10.7`. If the manifest gates on the
caller's version, the P0-3 decision ("send our own if the manifest lists rows for it") is made on a string the app
will never send — the exact failure R1-14 was accepted to prevent.

**Proposed fix** Read the version from `desktop/package.json` in the probe (`JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version`),
print which string each leg used, and have the design quote both strings in the P0-3 record.

verdict: (pending)

## R2-6 — `signIn()` while `waiting` contradicts the generation counter, and `waiting` has no defined end

**Where** design §3 (verbs: "if already `waiting`, re-opens the browser on the same listener and returns true";
generation: "`signIn()`, `cancelSignIn()` and `signOut()` each bump `generation`; the timeout … capture[s] the
generation when [it] start[s] and no-op[s] when it has moved"); §3 states ("`waiting` — the loopback listener is up
and the browser has been opened").

**Claim** (a) Read literally, a second click on Sign in bumps the generation without re-arming a timer: the first
timer fires, sees a moved generation, no-ops — the round has **no timeout** and the listener holds port 1455 until
Cancel or quit. Read the other way (re-entry does not bump), the callback's post-exchange write is still on the same
generation and everything works — the design must say which. (b) `waiting` is defined by "listener up"; the callback
branch 4 does exchange → secret write → file write → reply, and the design never says when the listener closes
relative to those. `status()` is polled every second (`ModelProvidersPopup.tsx:321`); if the listener closes on
callback receipt, `status()` reads `signed-out` (no file yet) for the exchange's duration before flipping to
`signed-in`.

**Consequence** (a) a stuck sign-in that never times out, or a timer that fires for the wrong round. (b) the card
flashes "Not signed in" between the browser's "you can close this tab" and "Signed in as …" — a visible glitch on
the approved card's happy path.

**Proposed fix** (a) Re-entry in `waiting` does **not** bump the generation (it is the same round: same `state`,
same verifier, same timer); pin "second signIn while waiting: timer count stays 1, generation unchanged". (b)
`waiting` is an explicit phase flag set by `signIn()` and cleared only by the four terminal transitions (post-write
success, callback error, cancel, timeout) — `status()` checks it before the file; the listener may close whenever.
Pin: `status()` returns `waiting` with the exchange promise pending.

verdict: (pending)

## R2-7 — Three plumbing statements in §1/§5 do not match main.ts; one of them is a live-app safety hazard

**Where** design §1 ("`main.ts` constructs `ChatGptAuth` once (it needs `app.getPath('userData')`, … and the
`SecretsStore`)"), §5 ("`detectAuth().installed || chatgptAuth.isSignedIn() || <an OpenRouter key exists>`");
`src/main/main.ts:260, 278-286, 891`; `src/main/ipc-handlers.ts:2295-2315`; `src/main/mcp-reconciler.ts:344`.

**Claim**
- **No `SecretsStore` exists in main.ts** — `rg -n "SecretsStore|ProviderRegistry" src/main/main.ts` → 0 hits; it is
  constructed inside `registerIpcHandlers` (`ipc-handlers.ts:2302`) along with `nativeHome` (`:2295`) and the
  registry (`:2315`), and `registerIpcHandlers` returns only a cleanup (`main.ts:891`). main.ts must construct its
  own (precedent: `mcp-reconciler.ts:344` does exactly that) — say so, and say the two instances share one file
  under one lock.
- **Placement.** The dev profile re-points userData at `main.ts:286` (`app.setPath('userData', …youcoded-${DEV_PROFILE})`),
  *after* the `remoteServer` precedent the design cites is constructed (`:260`). A `ChatGptAuth` built beside
  `remoteServer` captures **the built app's** userData — the dev instance would then read and write Destin's live
  `native-secrets.json` and `chatgpt-account.json` (the file the live app decrypts).
- **"An OpenRouter key exists"** has no reader in main.ts: the registry, the secrets store and `NativeHome` are all
  local to `registerIpcHandlers`. The clause cannot be written as designed.

**Consequence** Two builders, two plumbings; one of the plausible ones violates `live-app-safety.md` silently
(nothing crashes — the built app just becomes "signed in" one day).

**Proposed fix** State: `ChatGptAuth` is constructed inside `createWindow()` before `registerIpcHandlers` (or at
module level **below** line 286, with a comment naming the override), with `new SecretsStore(app.getPath('userData'))`
of its own. For the OpenRouter clause either return `{ cleanup, hasUsableProvider: () => Promise<boolean> }` from
`registerIpcHandlers` (backed by `providerRegistry.list()` → any `ready` row) and use it in the late check, or drop
the clause and file the pre-existing gap (Claude logged out + OpenRouter key → wizard every launch) on the roadmap.
Pin the late check with whichever shape is chosen.

verdict: (pending)

## R2-8 — The weekly limit card names a clock time for a reset days away, while the chip beside it names the day

**Where** design §4.5 (window `weekly` otherwise → `chatGptLimitMessage('weekly', resetsAt)`);
`src/shared/chatgpt-types.ts:46-53`; `src/renderer/components/StatusBar.tsx:265-268`; contract R5 ("a card naming
the reset time").

**Claim** `chatGptLimitMessage` renders `toLocaleTimeString` only — "You have reached ChatGPT's weekly session
limit (Resets @ 6:43pm)." — for a window that resets up to seven days out. The 7-day chip in the same status bar
formats the same instant as `Resets ${DAYS[d.getDay()]} @ …` (`StatusBar.tsx:268`). The approved deck showed the
5-hour case only (R19); the backend design is what makes the weekly text reachable.

**Consequence** A user hitting the weekly cap reads "Resets @ 6:43pm", waits until 6:43pm, and it does not reset.

**Proposed fix** For `'weekly'`, include the day exactly as `format7dReset` does ("Resets Mon @ 6:43pm"); the
5-hour string is untouched. It is Destin's wording, so show him the one changed line rather than deciding it in
the build.

verdict: (pending)

## R2-9 — The 5-minute poll and the account-file writer have no stated lifecycle

**Where** design §4.4 ("Poll … at sign-in, every 5 minutes while signed in, and after a `/codex/responses` response
completes … debounced to at most once per 60 s"), §2 (`mutate(fn)` under `mutateFileUnderLock`);
`src/main/artifacts/cas-write.ts:165-171`; `src/main/providers/secrets-store.ts:17-20, 79-93`.

**Claim** (a) Nothing starts the poll for an account that is already signed in at launch (§4.4 starts it "at
sign-in"; the callback is the only kick named), nothing stops it on `signOut()`/`blocked` (a blocked account would
403 `/wham/usage` every 5 minutes forever), and nothing `unref()`s it (a live interval keeps vitest workers alive).
(b) "after a response completes" — the wrapper returns at headers; stream end is only observable by tee-ing the
body. Say "at response headers" (the debounce makes the difference moot) or name the tee. (c) `mutateFileUnderLock`
returns `false` when the lock is held (`cas-write.ts:171`); `SecretsStore.mutate` retries five times and then
throws (`secrets-store.ts:79-93`). `ChatGptAuth.mutate(fn)` needs the same loop or a contended usage write is
silently dropped / an unexpected `false` is treated as success.

**Consequence** (a) stale bars until the first turn after launch; a polling loop that never ends for a blocked
account. (c) a dropped write is the torn-file class R1-12 was accepted to prevent.

**Proposed fix** One paragraph: the timer is started by the constructor when `isSignedIn()`, by the callback on
success, stopped by `signOut()` and by the `blocked` transition, `unref()`'d; the per-response refresh fires at
response headers; `mutate(fn)` retries like `SecretsStore.mutate` and throws the same shape. Pin start/stop in
`chatgpt-auth.test.ts` with an injected `setInterval`.

verdict: (pending)

## R2-10 — Classifying a 429 consumes the body the SDK still needs

**Where** design §4.5 ("The fetch turns a **429** whose body carries `error.code` matching … into a thrown
`Error` … Any other 429 (a burst rate limit) stays an `APICallError`"); `@ai-sdk/provider-utils/dist/index.js:3320-3340`
(`failedResponseHandler` reads the body; a throw there becomes "Failed to process error response").

**Claim** To read `error.code` the wrapper must consume the response body. Returning the same `Response` for the
non-limit case hands the SDK a used body: `openaiFailedResponseHandler` → `readResponseBodyAsText` throws →
`APICallError("Failed to process error response")` with `statusCode: 429` — still retried (fine) but the surfaced
message after retries is the SDK's generic one, not OpenAI's.

**Consequence** A burst 429's real message ("Rate limit reached …") is replaced with "Failed to process error
response (provider error 429)" — a misleading error by the house standard.

**Proposed fix** Classify on `response.clone()` (or re-wrap: `new Response(text, { status, statusText, headers })`)
and say so in §4.5; pin that a non-limit 429 reaches `describeProviderError` with OpenAI's message.

verdict: (pending)

## R2-11 — The wizard's 2-minute window ends in a browser error page for a slow first sign-in

**Where** design §5, §9.1 (wizard timeout 2 minutes, "Claude's own flow uses 2"); `src/main/first-run.ts:349`;
§3 ("closing the listener calls `server.closeAllConnections()`").

**Claim** Claude's 2 minutes covers a user who already has a Claude login in the browser. A first ChatGPT sign-in
on a fresh machine is an email code or 2FA away, and the wizard has no Cancel and no "still waiting" — on expiry the
listener closes, so when the user does finish, OpenAI redirects to `localhost:1455` and the browser shows a
connection-refused page while the wizard already says "Sign-in timed out. Try again?".

**Consequence** The very first thing a ChatGPT-only user sees after signing in is a browser error. Recoverable
(Try Again works), but it is the first impression the first-run screen exists to make.

**Proposed fix** This is a §9 default, so the fix is a decision, not code: 5 minutes for the wizard (the card keeps
10), or keep 2 and have the design say the browser error page is expected. Either way, on timeout leave the listener
up for one extra minute answering a fixed "This sign-in timed out — go back to YouCoded and try again." page instead
of closing the port, so the tab never shows a connection error.

verdict: (pending)

## R2-12 — Small undecided points a builder would otherwise guess

**Where** §5 (first-run binding seed), §5 (the late check), `src/main/preload.ts:1072`, `src/renderer/remote-shim.ts:1428`.

**Claim** One line each:
- `youcoded-last-binding = { providerId:'chatgpt', modelId: <first catalog row> }` is written in FirstRunView's
  completion effect, ~0-1.5 s after the callback kicked `refreshModels()`; the catalog is usually not back yet.
  `useNativeBinding` already falls back to the first ready provider's first model (`RuntimeBinding.tsx:150-166`),
  so say: write `youcoded-runtime-default` unconditionally and the binding only if a chatgpt catalog row exists
  (or have `waitForSignIn` resolve after the model refresh, bounded).
- The late check spawns `claude auth status` on every launch before consulting the sync `isSignedIn()`; order the
  cheap check first.
- `startAuth: (mode: 'oauth' | 'apikey')` in preload (`:1072`) and `(_mode: string)` in remote-shim (`:1428`) must
  widen to the `FirstRunState['authMode']` union; `tsc` will say so, but the design's channel table should.

**Consequence** None user-visible on its own.

**Proposed fix** One line each in the design.

verdict: (pending)

---

## Checked and fine

- **§4.2 middleware is buildable in v4.** `wrapLanguageModel` (`ai/dist/index.js:15817-15870`) passes `params`
  (prompt + `providerOptions`) to `transformParams` and uses the result for `doStream`/`doGenerate`; the openai
  Responses model reads `providerOptions.openai.instructions` (`@ai-sdk/openai:6714`), `systemMessageMode`
  (`:6632`, `'remove'` drops system messages with a warning, `:4835-4838`), `store`, `include`, `promptCacheKey`
  (`:6712-6717`). The harness passes `system: this.systemText` (`harness-session.ts:2296`), so the prompt's head
  is the system message the middleware moves.
- **§4.1 how the SDK invokes `fetch`.** `fetch(url, { method: 'POST', headers: <plain object>, body: <JSON string>,
  signal })` (`provider-utils:3273-3279, 3305-3318`) — `init.body` is a string, so the 401 re-send can reuse it
  verbatim (R2-1 is about the header, not the body).
- **§4.6 the SDK's retry layer does not fight the wrapper.** 401 and 403 are not retryable (`@ai-sdk/provider:52`,
  `ai:448-450`; `shouldRetry` at `ai:2825` needs `isRetryable === true`); the wrapper is the fetch, so it holds the
  Response before any handler runs; a 5xx retry re-enters the wrapper and fetches a fresh token; a plain thrown
  `Error` passes `handleFetchError` untouched (`provider-utils:1283-1328`).
- **§5 FirstRunView's completion path does observe `authMode: 'chatgpt'` with `COMPLETE`.** `authMode` is only reset
  by `run()` when resuming at AUTHENTICATE (`first-run.ts:112-114`); `handleOAuthLogin`'s success path leaves it
  (`:352-358`), so the mirrored method will too; the completion effect (`FirstRunView.tsx:299-305`) fires on
  `currentStep` with that state in scope; the main app — and both forms' `useState` initialisers — mount only after
  `onComplete` (`App.tsx:409, 2884-2888`).
- **§5 the late manager can reach a main.ts `ChatGptAuth`**; the early (`main.ts:403-409`) and late (`:937-938`)
  `FIRST_RUN_START_AUTH` handlers are separate closures, as the design says (both need the arm).
- **§6 `list()` is the only enumeration of `providers.json`** — `readAll()` is private and every other reader goes
  through `list()` (`rg -n "providers\.json|readAll\(|\.list\(\)" src/main src/renderer src/shared` → only
  `provider-registry.ts` and `remote-server.ts:975/1022/1150/1430` via `providerRegistry.list()`). The stray-row
  problem (R2-4) is in *older* code, not this branch.
- **§5 `chatgpt.supported` from preload env** has the precedent it cites (`preload.ts:1222  supported:
  process.env.YOUCODED_NATIVE !== '0'`).
- **§4.3 catalog shape** — `CatalogModel` has `contextLength`, `supportsTools`, `supportsReasoning`, optional pricing
  (`provider-types.ts:41-55`); the `local-engine` injection pattern is at `model-catalog.ts:243` with the injected
  `localModels` at `ipc-handlers.ts:2317-2319`.
- **§4.5 `chatGptLimitMessage` matches R19 for the 5-hour case** ("Resets @ 6:43pm", `chatgpt-types.ts:46-53`).
- **The wizard checklist reads right for ChatGPT** — the `auth` prerequisite is displayed as "Sign in"
  (`first-run-types.ts:41`), not "Claude login"; `describeStep` already names all three plans.
- **Probe hygiene still holds after the P0-3/P0-4 additions** — no `save()` receives a token; encrypted content is
  masked in every saved SSE (`chatgpt-phase0.mjs:154, 173, 181`); claims are redacted before print. Only R2-5's
  version string is wrong.
- **`useNativeBinding` covers a missing/stale seeded binding** — provider and model both fall back to the first
  ready row (`RuntimeBinding.tsx:150-166`), so R2-12's race degrades gracefully.
