---
status: active
date: 2026-09-05
feature: docs/active/design/2026-09-04-chatgpt-signin/
---

# ChatGPT sign-in — per-task build reviews

One section per build task. Each finding: severity (blocker / should-fix / nit), where, claim with evidence, fix.

## T5b — runtime default

Reviewed: uncommitted diff to `desktop/src/renderer/components/RuntimeBinding.tsx`, `desktop/src/renderer/components/SessionStrip.tsx`, `desktop/src/renderer/App.tsx` plus new `desktop/tests/runtime-default.test.tsx` on branch `feat/chatgpt-signin-backend` (worktree `chatgpt-signin-build`). Against design §5 "A ChatGPT-only install's first session", §8 `tests/runtime-default.test.tsx` row, review findings R2-3 and R3-6 (first bullet).

Checks run by the reviewer:

- `npx vitest run tests/runtime-default.test.tsx` → 1 file, 6 tests passed (442 ms).
- `npx tsc --noEmit -p .` → clean.
- `npx eslint` on the three source files + the test → clean.
- `rg -n "youcoded-runtime-default|persistRuntimeDefault|defaultRuntime" desktop/src` → the key string appears in exactly one source file (`RuntimeBinding.tsx:127,136`); `defaultRuntime` is called at SessionStrip `:356` (initialiser) and `:746` (post-create reset), App `:421` (initialiser) and `:3366` (post-create reset). `persistRuntimeDefault` has **no caller yet** — the FirstRunView completion path is a separate in-flight task.
- `rg -n "setRuntime\('claude'\)|setWelcomeRuntime\('claude'\)"` → exactly two remain: SessionStrip `:376` (inside `applyModelChoice`) and App `:442` (inside `applyWelcomeModelChoice`).

### Verified correct (no finding)

1. **Existing users, key absent — byte-identical.** `defaultRuntime()` does `localStorage.getItem(KEY) === 'native' && isNativeSupported()`; with no key the comparison is false and `isNativeSupported()` is never evaluated (`window.claude` is not even touched), so both forms get `'claude'` exactly as before. A blocked/throwing `localStorage` also lands on `'claude'`. The initialiser went from `useState<Runtime>('claude')` to `useState<Runtime>(() => defaultRuntime())` — same hook, same position, lazy form; no hook added, removed or reordered in either file (diff shows one changed line per initialiser, one per reset, one import each). The SessionStrip reset lives inside `handleCreate`'s `useCallback`; `defaultRuntime` is a module import so the dependency array is correctly unchanged (eslint's exhaustive-deps agrees — clean).
2. **`applyModelChoice` / `applyWelcomeModelChoice` untouched.** The diff does not touch either. Their `set…Runtime('claude')` literals are the user's explicit pick of a Claude model from the picker (`if (c.runtime === 'claude')`), where the literal is the only correct value — resetting to the install default there would ignore what the user just clicked. Keeping them is right, and the test's `≤ 1 literal per file` bound encodes exactly that.
3. **`isNativeSupported()` gate, all three paths.** `!isAndroid() && !isRemoteMode() && window.claude?.native?.supported === true` (`RuntimeBinding.tsx:100-102`). Desktop kill switch: `preload.ts:1219-1222` sets `supported: process.env.YOUCODED_NATIVE !== '0'`, so `YOUCODED_NATIVE=0` yields `'claude'` (test c). Android: `__PLATFORM__ === 'android'` is set by the WebView before the bundle runs (test c, second half). Remote browser: double-gated — `isRemoteMode()` AND the shim's own `native: { supported: false }` (`remote-shim.ts:1607-1608`), so the asynchronous `import('./platform').then(setConnectionMode('remote'))` at `remote-shim.ts:785` cannot open a first-paint window where the gate passes. `useNativeBinding` derives its `nativeSupported` from the same function (`RuntimeBinding.tsx:171`), so the default and the form's Create gate cannot disagree. The stored key is deliberately left untouched under the kill switch, matching R3-6's "say: returns 'claude' unless isNativeSupported()".
4. **Tests pin the behaviour.** Reverting either reset to the literal makes (f) fail on the tail after the create-path close (`setShowNewForm(false)` at `:740` / `setWelcomeFormOpen(false)` at `:3362`) AND on the literal count (2 > 1). Reverting either initialiser fails the `useState<Runtime>(() => defaultRuntime())` regex. A legitimate second reset — e.g. Cancel also calling `setRuntime(defaultRuntime())` — passes (only the literal is forbidden in a close-tail; `.some()` for the default). Comments are stripped via the shared `tests/helpers/guard-scope.ts` so the WHY comments mentioning `'claude'` cannot trip the scan. The other close sites (SessionStrip `:552` outside-click, `:718` menu toggle, App `:3334` Cancel) have no runtime write in their 600-char tails.
5. **WHY comments are accurate.** `YOUCODED_NATIVE=0` is a real kill switch (`preload.ts:1219-1222`); "no native providers are loaded" when unsupported matches the load effect being keyed on `nativeSupported`; "the second New Session was Claude Code again" is exactly R2-3. Plain-language, no jargon beyond "kill switch"/"native harness", both of which the file already uses.

### Findings

**F1 — should-fix — `tests/runtime-default.test.tsx` (e): the one-writer guard matches one spelling only.**
Claim: (e) filters on the exact substring `localStorage.setItem('youcoded-runtime-default'`. Any of `localStorage.setItem(KEY, …)` (a const — the pattern this very test file uses), `setItem("youcoded-runtime-default", …)`, `window.localStorage.setItem(…)`, or `localStorage['youcoded-runtime-default'] = …` passes the guard while writing the key. The spec row it implements says "nothing writes the key outside the first-run completion path"; the guard as written proves only that nobody wrote it in the one obvious way.
Fix: assert the *key string* `youcoded-runtime-default` (with or without quotes) appears in exactly one file under `src/` — `renderer/components/RuntimeBinding.tsx`. That pins writers and readers in one line, which is what §5 actually wants ("both forms read the key through one `defaultRuntime()`"), and it passes today (`rg` above shows only that file). Keep the existing message text.

**F2 — nit — (f): the fixed 600-char tail can produce a loud false failure.**
Claim: the create-path reset sits ~200 chars after the close in both files today. If a future edit inserts more than ~600 chars of non-comment code between `setShowNewForm(false)` / `setWelcomeFormOpen(false)` and the reset, (f) fails with "must reset to defaultRuntime() after a create" even though the reset is present. Loud, not silent — a builder would find it in a minute — so a nit.
Fix (optional): slice each create tail from the create call (`onCreateSession(` / `createSession(` with `welcomeRuntime`) to the end of its enclosing arrow instead of a fixed count, or raise the window and say why in the comment.

**F3 — nit — (f): the `≤ 1 literal` bound rides on `applyModelChoice`'s literal still existing.**
Claim: if someone later rewrites `applyModelChoice` as `setRuntime(c.runtime)` (removing the literal), one stray `setRuntime('claude')` anywhere outside a close-tail would be under the bound and pass. The close-tail check still catches the realistic regression (the reset), so this is marginal.
Fix (optional): assert the surviving literal, when present, is inside `applyModelChoice`/`applyWelcomeModelChoice` (e.g. slice from `const applyModelChoice` to the next blank line and require the literal there or nowhere).

**F4 — nit — `defaultRuntime()`'s WHY comment describes a writer that does not exist in this worktree yet.**
Claim: "the first-run completion path stores 'native' under this key once" — `persistRuntimeDefault` has zero callers on this branch (`rg` above). True once the FirstRunView task lands; misleading if this diff were merged alone.
Fix: none needed if the FirstRunView task merges in the same PR; otherwise add "(wired by the first-run task)" or land them together. Flagging so the parent tracks the dependency.

verdict: approve — the behaviour matches §5/R2-3/R3-6 exactly and existing users are provably untouched; F1 is a test-strength improvement worth making before merge but does not change shipped behaviour.

## T3a — capability profile

Reviewed: `git diff -- desktop/src/main/harness/capability-profile.ts desktop/tests/capability-profile.test.ts` in `worktrees/chatgpt-signin-build` (uncommitted), against design §4.8 and review R3-1.

### What was verified (evidence)

- **Every union-keyed site was visited.** `rg -n "providerType|ProfileProviderType|'anthropic'|'openai'|…" capability-profile.ts` lists nine branches keyed on the provider type: `cloudVariant` (:185–191), `FRONTIER_PROVIDERS` (:207, read by `injectionSizing` :225 and `mcpBudgetSizing` :271), `presentationFor`'s `!== 'local-engine'` (:219), `VISION_PROVIDERS` (:393, read by `visionFor` :404), `nativeImageToolResults` (:424), `announcePrefill` (:432) and `resolveProfile`'s cloud/local split (:433). The diff touches or comments on all but the two `!== 'local-engine'` branches, and those need nothing: `'chatgpt'` is not `'local-engine'`, so a plan model takes the cloud path (full tool presentation, `CLOUD_DEFAULT` base), exactly what "treated like the direct 'openai' provider" promises. `known-models.ts` has zero `gpt` patterns (`rg -n -i gpt` → exit 1), so no registry row can override the window or vision answer for a plan id — the VISION comment's "there is no registry row for these ids" is true.
- **No behaviour change for existing types.** The source diff only ADDS `'chatgpt'` to two sets and one `||`; nothing else moves. `npx vitest run tests/capability-profile.test.ts` → 52 passed / 0 failed (the 47 pre-existing tests plus 5 new).
- **The guard fails tsc on either side.** Baseline `npx tsc --noEmit -p .` is clean. Removing `'chatgpt'` from `ProfileProviderType` → `capability-profile.ts(116,47): error TS2344: Type '"chatgpt"' does not satisfy the constraint 'never'` (plus two follow-on errors). Removing it from the shared `ProviderType` instead → `capability-profile.ts(117,53): error TS2344: Type '"chatgpt"' does not satisfy the constraint 'never'`. Both files restored from a backup copy; `md5sum` before and after identical (`06149af1…` / `cbc3c29b…`). The comment's quoted error text is verbatim what tsc prints.
- **eslint** on both files: clean (the `_`-prefixed unused type aliases are not flagged).
- **Host / IPC (check 5).** `rg -n "openrouter'|'openai'|'anthropic'" native-session-host.ts ipc-handlers.ts` → the only type-keyed logic in either file is `'local-engine'` (context/slots resolver, `ipc-handlers.ts:2383`; registry clamp, `native-session-host.ts:2417`) and `'openrouter'` (vision resolver, `ipc-handlers.ts:2411`; null-type fallback, `native-session-host.ts:2408`). A `'chatgpt'` binding therefore gets its window from the catalog, no local clamp, a `null` vision fact that falls to `VISION_PROVIDERS` → `true`, and its own type passed to `resolveProfile` unchanged. Nothing mis-handles it, and the `ipc-handlers.ts:2387` comment "ProviderType and ProfileProviderType are the same union today" is true again — and now enforced.
- **Test pins match §4.8** (`exposeSkillCatalog: true`, `injectionBudgetTokens: 20_000`, `promptVariant: 'gpt'`, `supportsVision: true` for `{ providerType: 'chatgpt', modelId: 'gpt-5.6', contextLength: null }`), and the `Record<ProviderType, true>` test genuinely fails to compile on either drift, as its comment says.

### Findings

**nit — where:** `capability-profile.ts` cloudVariant comment (:187–189), FRONTIER comment (:202–203), VISION comment (:389–391).
**Claim:** each cites "design §4.8" (twice with ", Phase 0") as the source for the four model ids, the 272k window and the text+image modality. §4.8 contains none of those facts (`rg -n "272|terra|luna|gpt-5\.4-mini" …backend-design.md` → no hits). They come from `docs/active/investigations/2026-09-05-chatgpt-phase0-findings.md` (P0-3 row: the four `visibility: 'list'` ids; §"manifest fields": `context_window` 272000 on every listed row, `input_modalities: ['text','image']`, `supports_parallel_tool_calls`), which is what the fixture `tests/fixtures/chatgpt/models.json` also shows. A reader following the citation lands on a paragraph that does not say 272k.
**Fix:** change those three citations to "(Phase 0 findings, `docs/active/investigations/2026-09-05-chatgpt-phase0-findings.md`)" and keep "§4.8" only where the comment is about the harness decision itself (the `ProfileProviderType` member comment, which is correct as written).

**nit — where:** FRONTIER comment (:203–204), "The plan's manifest may or may not report that number".
**Claim:** Phase 0 shows the manifest reports `context_window` on every listed row today, so "may or may not" understates what is known. The conservative reasoning that follows (null must mean "not measured") is still right, and the new test covers both `null` and `272_000`, so nothing is wrong in behaviour.
**Fix:** optional wording — "The manifest reports it today; if a row ever omits it, null here must still mean 'not measured' …". Can be folded into the citation fix above.

No blocker or should-fix findings. Plain-language summary for Destin: the harness now recognises "signed in with ChatGPT" as a real, roomy, image-capable cloud provider instead of mistaking it for a small local model; nothing changes for any provider that already worked; and the compiler now refuses to build the app if anyone adds a provider to the settings screen's list without also telling the harness about it.

verdict: approve — implements §4.8/R3-1 exactly, no behaviour change for existing providers (52/52 green), the drift guard verified to fail tsc in both directions; only two citation nits.

## T1 — chatgpt-oauth helpers

Reviewed: new `desktop/src/main/providers/chatgpt-oauth.ts`, new `desktop/tests/chatgpt-oauth.test.ts`, and `git diff -- desktop/src/shared/chatgpt-types.ts` in `worktrees/chatgpt-signin-build` (uncommitted). Against design §3 (constants block, lines 266–274), §4.3–4.6, §8 row 1; the Phase 0 findings; the five fixtures in `tests/fixtures/chatgpt/`; words deck W-1 = a; `docs/error-message-standards.md`.

Checks run by the reviewer:

- `npx vitest run tests/chatgpt-oauth.test.ts` → 1 file, 28 passed (287 ms). `npx tsc --noEmit -p .` → clean. `npx eslint` on the two sources + the test → clean.
- A throwaway probe test (written, run, deleted — `ls` confirms it is gone) exercised the edges the suite does not: malformed tokens, a 429 with `resets_at` in seconds, a body naming `secondary`, `retry-after` as an HTTP date, a 403 with a nested `detail` object / whitespace / `null`, `windowLabel` under 12 h, `chatGptLimitMessage` at midnight/noon and with a 1-day/7-day/'' label. Results quoted where they matter below.
- `rg -n "chatgpt-oauth" desktop/src` → two hits: the module itself and a doc comment in `shared/chatgpt-types.ts:59`. Nothing in `src/renderer` or `src/shared` imports it. `rg -n "^import" desktop/src/shared/chatgpt-types.ts` → no imports at all, so the shared file stays free of Node/Electron.
- `rg -n "from 'node:crypto'|from 'crypto'" desktop/src/main` → the module imports `'crypto'` (not `node:crypto`), which is the convention in 8 other main files (`device-identity.ts`, `session-manager.ts`, …). Fine.
- Locale check (see F1): `LANG=en_GB.UTF-8 node -e "...toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})..."` → `"18:43"`; `de_DE` → `"18:43"`; `en_US`/`C` → `"6:43pm"`. This machine is `en_US.UTF-8`.

### Verified correct (no finding)

1. **PKCE (check 1).** `generatePkce`: verifier = base64url of 32 random bytes → 43 chars of `[A-Za-z0-9_-]`, no padding (probe: an all-`0xff` input gives `__…_8`, length 43, alphabet regex true); challenge = base64url(SHA-256 of the verifier **string**), which the test recomputes independently with `createHash('sha256').update(verifier).digest('base64url')` and asserts free of `+/=`. `generateState` = 16 random bytes → 32 hex chars. Byte-identical to the probe's lines 61–63 (`b64url(crypto.randomBytes(32))`, `sha256(verifier)`, `randomBytes(16).toString('hex')`).
2. **Authorize URL (check 2).** Nine params — `response_type=code`, `client_id`, `redirect_uri`, `scope`, `code_challenge`, `code_challenge_method=S256`, `state`, `id_token_add_organizations=true`, `codex_cli_simplified_flow=true` — the same nine the probe's lines 65–70 sent, same values, same base `https://auth.openai.com/oauth/authorize`. `exchangeBody` matches probe line 100 field for field. Constants match §3's block exactly (client id, token URL, redirect, scope).
3. **Claims (check 3).** `accountFromTokens` reads `payload["https://api.openai.com/auth"].chatgpt_account_id` / `.chatgpt_plan_type` from the access token (id token as fallback) and email from the access token's `https://api.openai.com/profile.email`, else the id token's top-level `email` — exactly the Phase 0 "Claims" paragraph. Malformed input never throws: `decodeJwtClaims('a.!!!.c')`, `'a..c'`, `''`, `null` → `null`; `accountFromTokens({accessToken:'junk', idToken:'x.y'})` → `null`; an `auth` claim that is a string → `null`. The signature is not checked, and the comment says so and why.
4. **Usage (check 4).** `parseUsageBody(usage.free.json)` → one window `{ minutes: 43200, usedPercent: 0, resetsAt: '2026-10-05T08:33:51.000Z' }` — `reset_at: 1791189231` is treated as seconds and lands in 2026, not 1970 (`epochToMs` threshold 1e11: 1e11 s is year 5138, 1e11 ms is 1973 — both correct). The Plus-shaped case yields 300 + 10080 min windows, `reset_after_seconds` added to `now`. `parseUsageHeaders(responses-headers.free.json)` → one 30-day window from `x-codex-primary-window-minutes: 43200`; the secondary group (`window-minutes: "0"`, `reset-at: ""`, `reset-after-seconds: "0"`) is dropped. `toChatGptUsage` files 300 → `five_hour`, 10080 → `seven_day`, else `other`; `Object.keys(toChatGptUsage(free))` is exactly `['other']`, so `five_hour`/`seven_day` are absent, not null.
5. **Manifest (check 5).** `parseModelsManifest(models.json)` → `['gpt-5.6-terra','gpt-5.6-luna','gpt-5.5','gpt-5.4-mini']` (priorities 7, 8, 12, 23), the two `visibility: 'hide'` rows dropped, `'pricing' in r` false for all four, `contextLength` 272000, `supportsReasoning` true, `supportsVision` true because `input_modalities` contains `'image'`, and `undefined` when the row has no `input_modalities` — matching `CatalogModel`'s doc ("`undefined` means this source does not know … a caller must NOT read that as `false`"). A row with `visibility` missing is not listed (probe: 0 rows), which is the conservative side.
6. **classifyErrorBody (check 6).** pi's shape `{ error: { code: 'usage_limit_reached', resets_at } }` → `limit`; `resets_at` in seconds (1791189231) and in ms both normalise to the same ISO; `usage_not_included` counts; a 429 with `code: 'rate_limit_exceeded'` or a plain-text body → `{ kind: 'other' }`; 401 → `expired`; 403 → `blocked` with `error.message` verbatim, trimmed. **The thrown errors:** `plainError` builds `new Error(message)` and sets only `name`. `Object.prototype.hasOwnProperty` is false for `statusCode`/`status`/`code` (pinned). `describeProviderError` (`harness-session.ts:428`): `api = err.lastError ?? err` → the error itself; `status = undefined`; no `data`/`responseBody` → `detail` undefined → falls to `sdkMessage = err.message` → returns `message.trim()`. Every message built here has no leading/trailing whitespace (the 403 reason is trimmed by the classifier), so it is byte for byte (pinned for all three). `withRetry` (`harness-session.ts:2965–2977`): `status = err?.statusCode ?? err?.status` → `undefined`; `undefined === 429` false, `undefined >= 500` false, `err.code === 'ECONNRESET'` false → `retryable` false → rethrown on attempt 0. Nothing in `harness-session.ts` keys on `err.name` except `'AbortError'` (`:2239`), so the custom names are inert as the comment claims.
7. **The sentence (check 7).** `chatGptLimitMessage('5-hour', <Tue 18:43 local>)` → `You have reached ChatGPT's 5-hour session limit (Resets @ 6:43pm).` — byte-identical (pinned). Weekly → `(Resets Tue @ 6:43pm)`, 30-day → `(Resets Sep 8 @ 6:43pm)` / `(Resets Oct 3 @ 6:43pm)`, 1-day and 7-day labels get the weekday, an unparsable reset → `(Resets @ later)` with no day. `isChatGptLimitMessage` (`/ChatGPT's .* session limit/`) matches every one of them. The `'5-hour' | 'weekly'` → `string` widening is the right call: a new OpenAI window fails to compile otherwise.
8. **WHY comments (check 9).** Plain language throughout; the load-bearing ones (why the errors are bare, why the verifier is hashed as a string, why windows are identified by length, why no `pricing`) each say what would go wrong otherwise. The `chatgpt-types.ts` comment on `other` explains the free-plan discovery in Destin's terms.

### Findings

**F1 — should-fix — `shared/chatgpt-types.ts:81–83` (`const when = … toLocaleTimeString([], …)`), and the test that pins it.**
Claim: the approved 5-hour sentence is only byte-identical on a US-locale machine. `toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })` follows the process's default locale, and in `en-GB`, `de-DE`, `fr-FR`, `ja-JP` it returns `"18:43"` (verified with `LANG=en_GB.UTF-8 node -e …` → `"18:43"`), so the card would read `(Resets @ 18:43)` — not Destin's wording, and different from the chip beside it, whose `formatTime12` (`StatusBar.tsx:248–254`) is hand-rolled and always says `6:43pm`. This line predates the diff ("literally the old code"), but this task is the one asserting "byte-identical" and pinning it, and the pin only proves it for `en-US` — CI (`LANG=C` → `en-US`) and this machine both pass while a UK user's card is wrong. `classifyErrorBody` runs in **main**, whose locale is the OS's, so this is a real path, not a renderer edge.
Fix: replace the `toLocaleTimeString` line with the same 12-hour formatter StatusBar uses (`h % 12 || 12`, zero-padded minutes, `am`/`pm`) — move `formatTime12` into `shared/chatgpt-types.ts` (or a tiny `shared/time-format.ts`) and have `StatusBar.tsx` import it so the card and the chip cannot drift. The existing test then pins the sentence in every locale.

**F2 — should-fix — `chatgpt-oauth.ts` `chooseWindow`, rule 4 ("the snapshot's longest window").**
Claim: when the 429 carries no `resets_at` and no `retry-after` and the body does not name a window, the fallback picks the **longest** snapshot window. On a Plus plan that is always `weekly`, yet the window that actually just ran out is far more often the 5-hour one. Probe: snapshot `{300 min @ 100 %, 10080 min @ 50 %}`, body `{ code: 'usage_limit_reached' }` → `weekly … (Resets Sun …)`, telling the user they are locked out for days when the bar beside it shows the 5-hour window at 100 % resetting in an hour. The snapshot already holds the evidence: the exhausted window is the one with the highest `usedPercent`. Design §4.5's "weekly otherwise" was written before the snapshot-match rule existed and is about the *no-snapshot* case; it does not require ignoring the snapshot's percentages. Rare (pi's shape always carries `resets_at`), but cheap and strictly better.
Fix: in rule 4, choose the snapshot window with the greatest `usedPercent` (ties → longest); keep `'weekly'` as the no-snapshot default. One test case: the snapshot above → `5-hour`, `windowMinutes: 300`, `resetsAt` = that window's reset.

**F3 — nit — `windowLabel` under 12 hours.**
Claim: `windowLabel(60)` → `'1-day'` (the test even pins it): `Math.max(1, Math.round(60/1440))`. A 1-hour or 3-hour window OpenAI might add would be announced as a "1-day session limit". Unseen shape; no user hits it today.
Fix (optional): below 1440 min return `${Math.max(1, Math.round(minutes/60))}-hour`, and change the pinned expectation.

**F4 — nit — `chatGptLimitMessage('', iso)`.**
Claim: an empty label renders `ChatGPT's  session limit` (double space) and still passes `isChatGptLimitMessage`. Unreachable from this module (`windowLabel` never returns `''`, and `classifyErrorBody` always passes one), so nothing to fix; noting it because the parameter is now `string`.

**F5 — nit — `renderer/state/usage-snapshot.ts:57` (`pruneExpiredUsage`) drops `other` on the floor.**
Claim: the shared type gains `other?`, but the renderer's pruner rebuilds the object from `['five_hour','seven_day']` only, so `chatgptUsage.other` never reaches any component — a free-plan user sees no bar regardless of what W-2 decides. Not a T1 defect (T1 is asked to file the window and leave drawing to W-2), but whoever lands W-2 = a must extend the pruner or the work is invisible.
Fix: none in T1; a one-line note in the W-2 task.

**F6 — nit — design §4.4 says `primary_window → five_hour`, `secondary_window → seven_day`; the code (correctly, per Phase 0) files by length.**
Claim: the builder followed the Phase 0 findings over the design text. Right call; the design paragraph is now stale.
Fix: one sentence in §4.4 pointing at the length rule, when the design is next touched.

**F7 — nit — `models.json` row `gpt-5.4-mini` carries `upgrade.retirement_at: 2026-08-31T19:00:00Z`, already past on 2026-09-05, yet `visibility: 'list'`.**
Claim: the parser lists it, which is what contract R3 ("every plan's models, no list in our code") asks for, and dropping rows by a date we are guessing the meaning of would be a made-up rule. Observation only: the first real "model retired" refusal a user sees on this row should be saved as a fixture like the 429.
Fix: none.

### The builder's four flagged decisions

1. **Window choice order on a 429** (snapshot reset-match → body naming → reset < 5 h → longest/weekly) — **accept**, with F2 on the last rung. Reset-match first is the only rule that can name a free plan's 30-day window, and when a body name and a matching snapshot both exist they agree, so the order costs nothing.
2. **Dropping body windows with no reset** — **accept.** Both pruners (main's `usageForStatus`, renderer's `pruneExpiredUsage`) key on the reset; a window without one would either never expire (last night's bar forever) or show "resets @ later", and it could never satisfy the 429 reset-match. The free fixture at 0 % still carries `reset_at`, so the drop is not on the observed path.
3. **403 reason order** (`error.message` → `detail` → `message` → raw text → `HTTP 403`) — **accept.** `error.message` is the shape pi and §4.6 name; `detail` is second because it is the shape actually observed on this backend (`responses-nonstream.http400.json` is `{"detail": …}`); the bare status is the last, still-true fallback per the error standard. Probe: `{detail:{message:'nested'}}` → `HTTP 403` (an object is not text — correct to not stringify it).
4. **"Tue" vs StatusBar's "Tuesday"** — **accept "Tue".** W-1 option a's literal text is `'Resets Tue @ 6:43pm'` and that is what Destin approved; the card is width-bound and the sentence already runs long. The deck's premise was wrong, though: it said the chip *already* says "Resets Tue @ 6:43pm", while `StatusBar.tsx:246` spells `Tuesday`. So the two will not be byte-identical as the deck promised — same day, different abbreviation. Not T1's file to change; flag it to whoever owns the chip (abbreviating `DAYS` there is a three-word edit) or accept the mismatch knowingly.

verdict: changes requested — F1 (the approved 5-hour sentence is locale-dependent and reads "Resets @ 18:43" outside the US; use the chip's own 12-hour formatter) and F2 (a 429 with no reset information should name the snapshot's most-used window, not its longest); everything else verified against the probe, the fixtures and the harness's retry/describe paths.

## T2 — ChatGptAuth

Reviewed `desktop/src/main/providers/chatgpt-auth.ts` (1,107 lines, untracked) and
`desktop/tests/chatgpt-auth.test.ts` (41 tests) in `worktrees/chatgpt-signin-build` against §2, §3,
§4.1/4.3–4.6, §7, §8 and R1-4/8/11/12, R2-1/6/9/10/11, R3-3/6. `npx vitest run tests/chatgpt-auth.test.ts`
→ 41/41 in 693 ms; `npx tsc --noEmit -p .` → exit 0. Mutation checks: (A) deleting the
`await this.closeLingering()` before the bind (L486) fails exactly "a signIn 5 s after a timeout succeeds
on the same port" (40/41); (B) deleting the generation check on the post-refresh write (L798–800) fails
exactly "refresh-after-signOut leaves no secret" (40/41). Source restored both times, md5
`89ad5a7ad3292f9d3b6b99d30c955941` before and after; the temporary probe test was deleted
(`git status` shows only the two files under review as untracked in the reviewed paths).

### The seven deviations

| # | Deviation | Verdict | Reason |
|---|---|---|---|
| 1 | 30 s `AbortSignal.timeout` on the exchange and the refresh (L102, L599, L769) | **accept** | §3 names no cap; without one a stalled TLS socket parks the card on "waiting" until the 10-minute round timer and hangs a turn with no message on a refresh. The error that reaches the wizard is Node's own TimeoutError text, not a guess. |
| 2 | The round timer defers while the exchange is on the wire (L682) | **accept** | R2-6's accepted rule: `waiting` ends only at the four terminal transitions, and the exchange's own result is one of them. The deferral is bounded — 30 s fetch + `SecretsStore.set` + ≤5×3 s lock retries — so a round always ends. No re-arm is needed. |
| 3 | One immediate poll at construction (L410–413, through the debounce) | **accept** | R2-9's consequence ("stale bars until the first turn after launch") is exactly what this fixes; the 60 s debounce means a reply within the minute costs no second poll. A launch offline logs one `warn` and keeps the cache — §4.4's "silent on failure". |
| 4 | 5-minute in-memory backoff after a failed models refresh (L98, L999) | **accept the backoff, request one reset** | Six `modelCatalog.get()` call sites (R3-6) would otherwise turn a dead network into a request per call. But the stamp survives sign-out and the post-callback kick — F3 below. |
| 5 | `dispose()` awaits in-flight writes; `mutate` refuses after dispose (L1061, L1093–1100) | **accept, request the generation bump** | The design has no dispose contract; a poll's read-modify-write cut off at quit is §2's torn file. But `dispose()` does not bump the generation, so an exchange on the wire still writes the secrets store after it — F2 below. |
| 6 | Blocked only on 403 (L857, `classifyErrorBody` in chatgpt-oauth.ts:558–561) | **accept** | §4.6's "or a 4xx whose body says the workspace/plan has no Codex access" has no observed body (Phase 0: "A 403 / blocked account — not observed"); a pattern guessed from nothing is the misleading-error class. The rule lives in T1's classifier; extend it when the first real refusal body is saved to `tests/fixtures/chatgpt/`, as the Phase 0 doc already prescribes. |
| 7 | `mutate` retry pinned by mocking `mutateFileUnderLock` to return false (test L47–52, L742–756) | **accept** | The real alternative is a held lock at 5 × ~3 s = 15 s per test (what secrets-store.test.ts avoids with its `maxRetries` override). The mock wraps the actual implementation, is scoped to one test, counts five calls and asserts the exact sentence, and is re-pointed at the real function in `finally`. Nothing else in the suite sees a fake lock. |

### Verified, with evidence

- **Token hygiene.** Every `log(` (L573, 606, 617, 625, 632, 656, 664, 774, 780, 787, 848, 895, 900, 905, 1014, 1024, 1035, 1039) carries a fixed sentence, a status code, OpenAI's `error_description`, the callback's `error`/`error_description`, or `errorMessage(e)` of a fetch/store/fs error — none of which can hold a token (undici's `fetch failed` and `TimeoutError` messages are fixed; `SecretsStore` throws its two sentences; `mutateFileUnderLock` throws fs errors with a path). Every `throw`/`new Error` (L475, 495, 509, 607, 618, 633, 663, 738, 740, 762, 782, 788, 799, 850, 870, 874, 1080) is the same set. `JSON.stringify` appears at L641 and L801 (tokens → `secrets.set`, encrypted before the lock) and L1073 (the account file, whose type has no token field and whose exchange write at L646–652 lists its fields explicitly). `Bearer ${token}` occurs only at L837, 892, 1011 — headers. The HTML page takes only the three constants or the store's message (L663); `escapeHtml` covers it. `status()` / `signedInAccount()` / `waitForSignIn()` return email, plan, usage, reason, accountId and sentences — no blob. Test L380 and L812 assert the marker is absent from the logs on the happy path and the refresh-failure path.
- **Callback listener (L545–586).** Order: timed-out page → unparsable URL 404 → not `GET /auth/callback` 404 → `state` mismatch (or a foreign round) 400 with no state change → `error` → fixed page, description to log + `{ error }` only → `code` (400 when missing or already exchanging) → exchange. `Connection: close` on every reply (L250); `closeAllConnections()` + `close()` in `closeServer` (L709–714); the 60 s linger (L690–693) with a fresh `signIn()` closing it at L486 **before** the bind at L493 (mutation A proves the pin bites); re-entry while waiting (L469–472) opens the URL and touches neither generation nor timer (test L477); `status()` checks the phase flag at L423 before the file at L425. `Headers.set` on a plain object with lower-cased `authorization` yields exactly one value — checked in node: `[["authorization","Bearer REAL"],["content-type",…]]`, and the same for `Authorization` and for a two-entry list.
- **Generation counter.** Bumped at L477 (new round), L527 (cancel), L537 (sign-out). Captured and checked by the exchange at L624/645/654, the refresh at L760→781/798/807, and every cache writer (L919, 932, 952, 1018). The timer no-ops on `this.round !== round` (L679), which `finishRound` (L702) and a new round (L501) both make true. Sequences walked by hand: sign-out during refresh (200 → discarded at L798; 400/401 → `clearAccount` skipped at L781, expired thrown), cancel then a late callback (server closed with `closeAllConnections`, and L564 400s anything for a foreign round), two sign-ins separated by a cancel (round A's exchange discards at L624; round B binds fresh), sign-out while the exchange is inside `mutate` (fn returns null, `written` is the old file, L654 deletes the ref `clearAccount` already deleted — double delete, harmless, end state signed-out with no secret and no file). The one sequence that breaks is two `signIn()` calls in flight before the first has bound — F1.
- **accessToken (L730–812).** One in-flight promise (L752–757, test L772 asserts one refresh for two callers); 400/401 → `clearAccount` then `expiredError()` (L777–783); other non-OK → a sentence with OpenAI's `error_description` or `HTTP n` (L788); network → the original error rethrown (L775). `tokenAfter401` (L746) reuses a token another step already refreshed, else refreshes.
- **fetch (L834–878).** `{ ...init, headers }` keeps `body` and `signal` on the 401 re-send (test L876–877 asserts the same body string twice); second 401 → sign-out + expired (L847–851); 403 → `markBlocked` (stops the poll first, L951) + `blockedError(reason)` verbatim (test L894 checks the message, the file, and no `statusCode`/`status`/`code`); 429 classified on `res.clone()` (L860) and the non-limit case returned with `bodyUsed === false` (test L944); `noteUsageHeaders` on every non-401 reply (L855) and the debounce at L970–977 (test L949: three replies → one poll at exactly 60 s).
- **Poll lifecycle.** Started at L411 (construction, when signed in) and L671 (callback); stopped by `clearAccount` (L816) and `markBlocked` (L951); every timer through `unref` (L1103); `dispose` clears both timers, closes the round and the lingering server, and awaits the write chain, the refresh and the models refresh (L1093–1100).
- **mutate (L1053–1085).** The only file writers in the module are `mutateFileUnderLock` (L1069) and the `rm` for sign-out (L1063), both inside `mutate`'s serialised chain (`rg -n 'fs\.' chatgpt-auth.ts` → readFileSync at L1033, `promises.rm` at L1063, nothing else). Five attempts then `CHATGPT_LOCK_HELD_MESSAGE` (L1068–1080). Sign-out order at L815–821: `stopPoll`, `secrets.delete`, then the file (test L698 records `file-still-there=true` at the moment of the delete).
- **models (L984–991).** Returns `Promise.resolve(rows)` from the cache and only `void`s the refresh; test L995 races it against a 500 ms timer with the manifest route hung forever.
- **WHY comments.** Present at every non-obvious branch, in plain words (the header's TOKEN HYGIENE block, the lock's real reason from R1-12, the `Headers.set` note from R2-1, the linger and the "state before error" order). Nothing to add.

### Findings

**F1 — should-fix — L466–503.** Two `signIn()` calls in flight before the first has bound throw the R3-3 sentence and sabotage the live round. The re-entry check at L469 reads `this.round`, which is assigned only at L501, after two awaits (`closeLingering` at L486, `listen` at L493). A second call arriving inside that window passes the check, bumps the generation at L477, and binds the same port. Probe (temporary test, deleted): `Promise.allSettled([auth.signIn(), auth.signIn()])` → `[true, "Port 1455 is already in use on this computer, so YouCoded cannot receive the sign-in. Close the other program using it (often the Codex CLI) and try again."]`, one browser open, status `waiting`. Two consequences: the user reads a false accusation of the Codex CLI (the exact misleading error R3-3 was accepted to remove), and — worse — the first round is still live with its browser tab open, but its generation is now stale, so when the user finishes in the browser the exchange lands on L624 and is discarded: the tab says "Sign-in did not complete" after a successful sign-in, and nothing in the log names why. A double-tap on the card's button or the wizard's Try again is enough; the card polls `status()` every second but the button is not disabled by this module. Fix: keep a `private starting: Promise<boolean> | null`; `signIn()` returns `this.starting` when it is set (after re-opening the browser once the round exists), and clears it in `finally`. Move `this.generation += 1` to after the bind succeeds, so a bind that throws does not discard a refresh in flight for an account that is still signed in. Pin: "two concurrent signIn() calls share one round: one bind, one timer, no port sentence".

**F2 — should-fix — L1093–1100 (and L585, L641–659).** `dispose()` does not bump the generation, so an exchange that is on the wire when the app quits still runs its write path afterwards: `secrets.set` at L641, then — because the disposed `mutate` returns the old `this.account` (null for a fresh sign-in) — `secrets.delete` at L655. Probe: with the exchange gated, `dispose()` then release → secrets-store writes `["set","delete"]` after dispose, `native-secrets.json` created after the tmp dir was meant to be dead. For a re-sign-in the in-place `set` on the existing ref replaces the live blob with the new pair while the file keeps the old email/plan (consistent, but not "discarded"). The method's own contract says "Nothing writes after this", and in the suite the afterEach `rmSync` can race this into a recreated tmp dir. Fix: `this.generation += 1` as the first line of `dispose()` (the exchange then takes the L624 discard path, which touches nothing), and hold the exchange promise (`private exchangeInFlight: Promise<void> | null`, set at L585) so the `allSettled` at L1098 waits for it too. Pin: "dispose during the exchange: the store is not written after dispose resolves".

**F3 — should-fix — L389, L999–1000, L675, L815–821.** The models backoff outlives the account. `lastModelsAttemptAt` is set on every attempt and never reset, so: (a) a failed refresh followed by sign-out and sign-in within five minutes makes the callback's kick at L675 a no-op, and (b) every `models()` call in that window returns the (possibly empty) cache without kicking. A user who signs in right after a network blip sees no models for the plan for up to five minutes with no message, on the one screen the sign-in exists to fill. Fix: `this.lastModelsAttemptAt = 0` in `clearAccount()` and immediately before the L675 kick (a fresh sign-in is a fresh start). Keep the backoff for the steady state. Pin: "a failed models refresh does not block the refresh kicked by the next sign-in".

**N1 — nit — L641, L654–659.** For a re-sign-in (IPC only; the card offers Sign out from `signed-in`/`blocked`), `secrets.set(…, this.account?.secretRef)` overwrites the live blob in place before the generation check, so a cancel that lands during the file write deletes that ref and the previous sign-in is gone too — the user ends signed-out rather than where they started. From `blocked` that is arguably right; from `signed-in` it is a surprise. If it matters: fresh ref → file write → delete the old ref on success (no orphan, and cancel restores the old state). Not a card path; recording it so the ordering is a decision, not an accident.

**N2 — nit — L836–838.** When `input` is a `Request` with a body and `init.body` is absent, the 401 re-send reuses a consumed body. R3's "Checked and fine" confirms the SDK always sends `url + init`, so this is unreachable today; a one-line comment saying so is enough.

**N3 — nit — L961, L970–977.** The 5-minute interval and the 60 s debounce do not share a gate: an interval tick seconds after a debounced poll fires a second poll. Harmless (two cheap GETs); routing the interval through `schedulePollSoon` would make "at most once a minute" literally true.

**N4 — nit — L204–213.** `defaultListen` removes its only `'error'` listener once listening; Node's `http.Server` does not emit `'error'` after a successful bind in practice, but an unhandled one would take main down. `server.on('error', …)` to the log is one line.

**N5 — nit — size.** 1,107 lines with three clean seams (the round + listener L330–722, tokens + fetch L724–878, the two caches L880–1026). No defect behind it and the header explains the layout; split only if T3/T4 add to it.

**N6 — nit — L387, L972.** `lastUsagePollAt = 0` makes the construction-time debounce wait `60 s − now()`, which is 0 with a real clock but non-zero for any fake clock that starts under 60,000 ms (the suite's starts in 2026, so it passes). `-Infinity`, or `USAGE_DEBOUNCE_MS` subtracted only when a poll has run, removes the dependence.

**N7 — cross-reference to T1 — chatgpt-oauth.ts:559.** A 403 whose body is not JSON lands its raw text on the card and in the account file as `blocked.reason` — a Cloudflare HTML page would be rendered verbatim. T1's classifier owns this; noting it here because `markBlocked` (L949) is what persists it.

verdict: changes requested — F1 (two `signIn()` calls in flight throw the "Codex CLI" port sentence and silently discard the live round's tokens), F2 (an exchange on the wire still writes the secrets store after `dispose()`), F3 (a failed models refresh blocks the sign-in's own refresh for five minutes); each is a few lines plus a pin, and everything else — hygiene, the listener, the generation guards, the fetch, the poll, `mutate`, `models()`, all seven deviations — is verified against the design and the review rulings.

**Applied 2026-09-05:** F1 (a re-entrant `signIn()` awaits the first through a `starting`
promise; the generation bump moved after a successful bind), F2 (`dispose()` bumps the
generation first and awaits the exchange), F3 (`lastModelsAttemptAt` reset in `clearAccount()`
and before the post-callback kick) and N1 (a fresh secret ref on re-sign-in, old ref deleted
only after the file has switched). N2–N7 remain open as nits; N4 and N7 are carried into the
final sweep below.

## T5 — first run

Reviewed `desktop/src/main/first-run.ts`, `desktop/src/renderer/components/FirstRunView.tsx`
and `desktop/tests/first-run-chatgpt.test.ts` (commit `25f6b334`) against §5, §6 and the
lock-out property. `tsc --noEmit` clean; 15/15 tests pass. The review's question was the one
that matters on this branch: **the Skip-setup link is gone, so can any user reach a state with
no way forward?** Two answers were yes.

1. **must-fix — the provider-aware launch check has no test, and the test file says it does.**
   `first-run-chatgpt.test.ts:20` claims the check is "pinned elsewhere"; `rg -n 'hasUsableProvider'
   desktop/tests` returns nothing, and no test imports `main.ts`. Reverting `main.ts:974-976`
   to the Claude-only check keeps all 15 green while throwing a ChatGPT-only install at a
   Skip-less sign-in screen on every launch.
2. **must-fix — `forceStep('AUTHENTICATE')` demotes an established install to first-run for good.**
   `setup_completed` is written only by the FIRST_RUN_SKIP handler, which no UI reaches on this
   branch (`rg -n 'skip\(\)' desktop/src/renderer` → nothing), so `isFirstRun()` rests on the
   state file alone. Close the window without signing in and the NEXT launch takes the early
   branch, never consults the provider-aware check, and re-runs the Node/Git/Claude installers
   against a working install — with only "Try Again" on screen if one fails.
3. **should-fix — a ChatGPT-only user is told in Settings they are signed in to Claude.**
   `authComplete: true` on the ChatGPT path + `ModelProvidersPopup.tsx:243` → the Claude Code
   row reads "Signed in with your Claude account" and draws Claude plan bars for no account.
4. **should-fix — every first-run error still offers a Skip that no longer exists**
   (`describe-step.ts:22`, reachable in one click via the OpenRouter button).
5. **should-fix — that same OpenRouter line arms a Try Again that re-runs the whole prerequisite
   installer** (`lastError` is the renderer's only retry gate).
6. **should-fix — LIVE-APP HAZARD.** `STATE_DIR` is `~/.claude/toolkit-state`, module-level and
   unaffected by the dev profile; `run-dev.sh` shifts Electron's userData but not HOME. Running
   the first-run flow in a dev instance overwrites the setup state Destin's INSTALLED app reads,
   and leaving it at `AUTHENTICATE` shows him the setup wizard on his real app's next launch.
7. **nit** — the ChatGPT success path never clears a prior `lastError`.
8. **nit (declined)** — the seeding effect also fires on the late path, replacing an established
   user's remembered model. Deliberate; left as is.
9. **nit** — no test renders `authMode: 'chatgpt'` at `AUTHENTICATE`, so deleting the `done`
   guard in `FirstRunView.tsx:308` would default a user to the native runtime the moment a
   sign-in *starts* — including one who then finishes with Claude instead.

Checked and correct: quit / closed tab / timeout mid-wait cannot dead-end (`run()` resets
`authMode`, `forceStep` rebuilds from `defaultState()`); `YOUCODED_CHATGPT=0` after a ChatGPT
completion degrades to the first ready provider rather than locking out; `hasUsableProvider` is
a real signal, not a rubber stamp (local-engine ready means a user-triggered install exists).

verdict: changes requested — the branch's highest-stakes property has zero coverage while the
suite claims otherwise; `forceStep('AUTHENTICATE')` strands an established install on a screen
whose only control re-runs a failing installer; Settings claims a Claude sign-in that never
happened; and a dev run of the wizard writes over the installed app's setup state.

## T3 — the model path

Reviewed `chatgpt-model.ts`, the registry's `'chatgpt'` case, the catalog rows and the harness
edits (commit `2eb0c004`) against §4.1–§4.6 and §8. 65 tests pass; `tsc --noEmit` clean.

**No must-fix.** Token hygiene traced clean: the two new files contain zero log calls
(`rg -n "console\.|log\(" src/main/providers/chatgpt-model.ts src/main/providers/provider-registry.ts`
→ no output); the only credential-shaped value handed to the SDK is the literal placeholder
`apiKey: 'chatgpt'`, which `withUserAgentSuffix` normalises to a lower-cased `authorization`
key — exactly the key `ChatGptAuth.fetch()` overwrites, so the doubled-bearer hazard is
genuinely avoided; `foldStream` rethrows the stream's own error unchanged and builds no message
of its own; and the wrapped model does not expose `config`, so nothing can surface the request.
Both mechanisms the design leans on were verified in the SDK's own source: `transformParams`
runs on `doGenerate` AND `doStream` and `wrapGenerate` sees the transformed params, so
store / instructions / include / cache-key are forced on titles, retries and tool follow-ups
alike; and a plain Error with no `statusCode` survives `handleFetchError` intact, so §4.5's
reason for the bare error still holds.

1. **should-fix — a fresh sign-in can leave the user unable to start a session at all.** The
   virtual row sorts FIRST while `models()` is cache-first and returns `[]` until the manifest
   lands. The new-session form takes `readyProviders[0]`, finds no models, is not a freeform
   type — Create is blocked with no explanation, with the user's OpenRouter row one dropdown
   away. Persists indefinitely while the fetch keeps failing (offline, or a 401, retried only
   every 5 minutes).
2. **should-fix — a blocked account's models stay in the shared catalog.** `model-catalog.ts:259`
   gates on `enabled`, never `ready`. The two shipping pickers filter on `ready`, but
   `ipc-handlers.ts:2477` feeds the unfiltered catalog to the **ModelSearch** tool, so the app's
   own agent is offered ids it cannot use and delegates a task that fails.
3. **should-fix (test) — the session cache key is unpinned.** Deleting both `harness-session.ts`
   lines leaves the suite green; every step of every ChatGPT session would then lose
   `prompt_cache_key` and re-bill the shared prefix against the plan window. Silent.
4. **should-fix (test) — the `include` assertion is vacuous for the id it uses.** The SDK adds
   `reasoning.encrypted_content` itself for reasoning models, and `gpt-5.5` is one — so deleting
   the middleware's own line stays green, while that line is load-bearing exactly for the ids
   the SDK does not recognise (which is what the manifest names first).
5. **nit** — a mid-stream error releases the reader but never cancels the body: one leaked
   socket per failed fold.
6. **nit** — `foldStream`'s error and no-finish paths are unpinned.
7. **nit** — `2eb0c004`'s message claims a fixed fallback model list that does not exist;
   §4.3 specifies the opposite. Correct the record.
8. **nit** — with the kill switch on, `testConnection` says "not configured" while
   `languageModel` says "turned off in this build"; the vaguer one is the reachable one.

verdict: changes requested — a signed-in row that sorts first with an empty model cache blocks
native session creation; the catalog branch ignores `ready`, so a blocked account's models stay
in the shared catalog; and three behaviours the design calls load-bearing are not pinned.

## T4 — the surfaces

Reviewed the four channels across main, preload, remote-server, remote-shim and
`SessionService.kt` (commit `96edd6a2`) against §3, §5 and §6. `verify.sh` green;
`ipc-channels.test.ts` + `workbench-mock-contract.test.ts` = 259 passed.

**Token leakage: clean.** `ChatGptAccountStatus` carries only `state`, `email`, `plan`, `usage`,
`reason`; `status()` reads the in-memory account, which holds a `secretRef` pointer and never
decrypts; the three verbs return booleans; the only strings that can cross are the fixed
sentences and `error_description`. The one unbounded field is finding 4, and it is body text.

**Live-app hazard: clean, verified by execution order rather than by the comment.**
`app.setPath('userData', …)` is module-level at `main.ts:297`; `createWindow()` has exactly one
call site inside `app.whenReady()`, and `rg -n "new ChatGptAuth" src` returns one hit at
`main.ts:926` — unambiguously after the override. `chatgpt-auth.ts` has no module-level
`app.getPath` and no import-time I/O. `providers.json` is untouched (the row is virtual).
Port 1455 is claimed only inside a user-initiated `signIn()`; it is necessarily shared with the
installed app, so a dev sign-in during a live sign-in makes one of them show the port sentence —
unavoidable, not introduced here.

1. **must-fix — the kill switch does not make the feature inert, and can silently sign the user
   out.** `ChatGptAuth`'s constructor starts the usage poll whenever an account exists, and
   nothing in the wiring reaches that: with `YOUCODED_CHATGPT=0` a signed-in user's app still
   calls OpenAI at launch and every 5 minutes forever. Worse, that poll refreshes the token, and
   a 400/401 there runs `clearAccount()` — **deleting the stored secret and the account file**.
   §6 promises "a fast revert, not a sign-out"; as built the switch can perform a sign-out, and
   it does not stop the traffic you flipped it to stop.
2. **should-fix — the preload leg of the parity test is vacuous.** This namespace invokes
   through `IPC.*` constants, so the four literals appear in `preload.ts` only in the constants
   table. Mutation run: deleting all four methods from the exposed object passes. Every desktop
   user would then get "window.claude.chatgpt.status is not a function" on the Settings card.
   The usual second net is gone too — `chatgpt.*` is not in `HAND_WRITTEN`, so the workbench
   fake and the real namespace can now drift with nothing complaining.
3. **should-fix — the first-run ChatGPT arm bypasses the kill switch** (`main.ts:429`, `:1000`
   pass the raw handle), so an invoke with mode `'chatgpt'` still opens the browser and binds
   1455. Only the renderer gate keeps the button off screen.
4. **should-fix — `blocked.reason` can be an entire HTML error page**, persisted to the account
   file and returned in every status payload. A 403 from a proxy in front of chatgpt.com is not
   JSON.
5. **nit** — `dispose()` is fire-and-forget at quit, contradicting its own contract.
6. **nit** — `ModelProvidersPopup.tsx:303` still calls the namespace MOCK_ONLY.

Also confirmed: parity has no exemption list and three of the four legs bite on deletion;
Android's four ids sit in the not-implemented fall-through and reply with a fast honest refusal
rather than hanging; two windows both pressing Sign in get two browser tabs and a card that lags
up to a second, and an authenticated remote browser can sign the desktop out (§5, deliberate).
Nothing anywhere tests the kill switch: `rg -n "YOUCODED_CHATGPT" tests` finds only a source
regex, so dropping the env check from `chatgptForUi` passes the whole suite.

verdict: changes requested — the kill switch leaves the usage poll running, so a disabled
feature still calls OpenAI every five minutes and can delete the user's stored tokens; the
preload parity assertion is satisfied by the constants table alone; the first-run arm ignores
the switch; and a blocked reason can carry an untruncated HTML body to the card.
