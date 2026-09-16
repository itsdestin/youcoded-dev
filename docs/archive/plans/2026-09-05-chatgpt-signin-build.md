---
status: shipped
date: 2026-09-05
type: task-breakdown
feature: docs/active/design/2026-09-04-chatgpt-signin/
design: docs/active/specs/2026-09-05-chatgpt-signin-backend-design.md
contract: docs/active/design/2026-09-04-chatgpt-signin/chatgpt-signin.contract.json
branches:
  youcoded: feat/chatgpt-signin (build commits on feat/chatgpt-signin-backend, fast-forwarded in)
  youcoded-dev: design/chatgpt-subscription (build commits on build/chatgpt-signin, fast-forwarded in)
tags: [chatgpt, openai, providers, native-runtime, build]
---

# Sign in with ChatGPT — task breakdown

The design (three review rounds, all findings folded in) is the authority; this file only
cuts it into tasks a subagent can take one at a time, with the reviewer each gets. Descriptions,
not pre-written code — none of these is cross-repo, stored-data-migrating or strict-order enough
to need it. Every task ends with `bash scripts/verify.sh <worktree>` green and a reviewer's
sign-off before the next dependent one starts.

**Worktree:** `worktrees/chatgpt-signin-build` (branch `feat/chatgpt-signin-backend`, off
`feat/chatgpt-signin`). `node_modules` is a hardlink copy — nothing here patches a dependency.

## T0 — Phase 0 (gate; needs Destin once)

Run `npx electron test-engine/chatgpt-phase0.mjs --out <scratch>` from `desktop/`; Destin signs
in once in the browser it opens. Record the answers to P0-1…P0-5 in
`docs/active/investigations/2026-09-05-chatgpt-phase0-findings.md` (design §0's decision rules
applied, one line each), and copy the **redacted** `usage.json`, `models-*.json`,
`accounts-check.json` and `responses-headers.json` into `desktop/tests/fixtures/chatgpt/` — the
parsers in T1 are written against those files, not against guesses. Nothing else starts before
this is done. Reviewer: none (the findings file is the artifact; T1's reviewer reads it).

## T1 — `chatgpt-oauth.ts`: the pure helpers

`src/main/providers/chatgpt-oauth.ts` + `tests/chatgpt-oauth.test.ts`. PKCE (S256), the
authorize URL (client id, scope, redirect, state, challenge), the exchange and refresh request
bodies, JWT claim decoding (account id, plan type, email), `parseUsage` and `parseModels` over
the T0 fixtures (seconds-or-epoch reset → ISO `resets_at`; hidden manifest rows dropped; no
pricing), and `classifyResponseError` (429 limit → the exact `chatGptLimitMessage`; 401 →
expired; 403 → blocked with OpenAI's text) — pinned that none of the three thrown errors owns
`statusCode`, `status` or `code`, and that `describeProviderError` returns each byte for byte.
Design §3 constants, §4.3, §4.4, §4.5, §4.6. No I/O in this file. Reviewer: checks every parser
against the fixture bytes and every message against the error-message standard.

## T2 — `ChatGptAuth`: the account

`src/main/providers/chatgpt-auth.ts` + `tests/chatgpt-auth.test.ts`. The state machine and all
of §3 (phase flag, generation counter, the listener with its four ordered branches and the
one-minute lingering page, `signIn`/`waitForSignIn`/`cancelSignIn`/`signOut`/`accessToken`,
the throws for port-held and no-keychain, the account file under `mutate(fn)` with the
SecretsStore-style retry), §4.4's poll lifecycle (start on construction when signed in and on
callback, stop on sign-out/blocked, unref, 60 s debounce on response headers), §4.3's
cache-first `models()` with the hourly stamp inside `refreshModels()`, `usageForStatus()`,
`isSignedIn()`, `signedInAccount()`, and `fetch()` — the header-replacing wrapper with the
401-refresh-resend, the 403 → blocked, the 429 classified on a clone, and the usage headers
read. All I/O injected (`fetch`, `openExternal`, `listen`, `isEncryptionAvailable`, `now`,
timers). Every §8 row for this file. Depends on T1. Reviewer: walks every arrow in §3's diagram
and every race in R1-8 / R2-6 / R3-3 against the tests, and greps the file for anything that
could log or throw a token.

## T3 — The request path in the registry, the catalog and the harness profile

`provider-registry.ts`: the virtual row (`VIRTUAL_IDS`, appended first, `builtIn: true`, the
one refusal sentence on `upsert`/`remove`/`setKey`, `testConnection` from `isSignedIn`), the
`case 'chatgpt'` (§4.1 placeholder key, headers, `originator: youcoded`, the middleware from
§4.2 with `wrapGenerate` if P0-5 said so), the kill-switch refusal; `ModelFactory` opts gain
`cacheKey` and both `modelFactory(...)` calls in `harness-session.ts` pass the session id;
`model-catalog.ts` gains the injected `chatgptModels` branch; `capability-profile.ts` per
§4.8 with the union guard. Tests: `provider-registry.test.ts` (the §8 row, including the
captured-request assertions: one `authorization`, placeholder absent, `store:false`,
non-empty `instructions`, no system input item, `include`, `prompt_cache_key`, the three
headers, `generateText` → `stream: true`, a burst 429 keeps OpenAI's message, `init()` leaves
no row on disk), `model-catalog.test.ts`, `capability-profile*.test.ts`. Depends on T2 (may
start against T2's interface once T2's file exists). Reviewer: diffs the captured request body
against pi's forced fields and the handoff's header list; confirms the two retry layers cannot
see a status on the limit error.

## T4 — The surfaces and the wiring

`preload.ts` (`chatgpt` namespace: `supported`, the four invokes; `startAuth` widened),
`shared/types.ts` IPC constants, `ipc-handlers.ts` (four handlers, `chatgptUsage` on
`buildStatusData`, the `ChatGptAuth` in the registry/catalog/`setNativeRuntime` bundle, the
`{ cleanup, hasUsableProvider }` return), `remote-server.ts` (four WS cases, `sign-in` answers
false), `remote-shim.ts` (`chatgpt` namespace with `supported: false`; `startAuth` widened),
`SessionService.kt` (the four ids in the not-implemented fall-through), `main.ts` (construct
`ChatGptAuth` inside `createWindow()` after the userData override, pass it in; both
`FIRST_RUN_START_AUTH` arms; the late check per §5 with the two local reads first),
`mock-only.ts` (the four rows come off), `mock-shim.ts` (`supported: true`). Tests: the
`chatgpt:*` parity block in `ipc-channels.test.ts`, `workbench-mock-contract.test.ts` green,
`node scripts/workbench-boot-check.mjs`. Depends on T2. Reviewer: the five-surface table in
design §5 row by row, plus a `rg` for any path that could construct `ChatGptAuth` before line
286.

## T5 — First run and the runtime default

`first-run.ts` `handleChatGptLogin` (§5: waiting line, 5-minute `signIn`, `waitForSignIn`
outcomes, a thrown `signIn` folded into `lastError`, the OpenRouter line),
`FirstRunView.tsx` completion path (writes `youcoded-runtime-default`, and the binding only
when a plan row is back), `RuntimeBinding.tsx` `defaultRuntime()` (honours
`isNativeSupported()`) used by both forms' initialisers **and** both post-create resets
(SessionStrip 742, App 3361). Tests: `first-run-chatgpt.test.ts` (every outcome; the late
check's three COMPLETE cases), `runtime-default.test.tsx`. Depends on T2 and T4. Reviewer:
runs the first-run flow in the dev instance with a fresh profile (`--profile`) against the
real account from T0 and confirms the second New Session still defaults to the plan.

## T6 — Renderer gates, the provider-type cache, the weekly sentence

The two `chatgpt.supported === true` gates (card, first-run button);
`use-provider-type.ts` per §4.9 (`invalidateProviderTypeCache()` called from the card on
every status transition and from `ProvidersSection` after upsert/remove, refetch on a miss,
`SessionInfo.providerType` for native sessions preferred over the id lookup);
`chatGptLimitMessage('weekly', …)` per the answer to words deck W-1 (untouched if the answer
is b). Tests: `use-provider-type.test.tsx`; the existing `chatgpt-types` tests updated only
if W-1 = a. Then the 11-shot plan `scripts/ui-review/plans/chatgpt-signin.json` re-run: every
shot `covered`. Depends on T4. Reviewer: the acceptance walk for R4/R9 (sign in, start a
session, chips and `/usage` without a reload) in the dev instance.

## T7 — Acceptance and close-out

With T0–T6 merged into `feat/chatgpt-signin` (fast-forward), `bash scripts/verify.sh` green:
grade the 21 rows into `chatgpt-signin.contract.verdicts.json` (mechanical and deck rows with
evidence; human rows left for the deck), `review-cards.py acceptance`, serve it with
`--no-open` and hand Destin the `[deck] http://…` line; `bash scripts/close-out.sh
feat/chatgpt-signin youcoded` and `… design/chatgpt-subscription`. Roadmap: the P0-4 carry
item if optional (§4.7). Do not merge; the closing question is "ready to merge?".

## Order and parallelism

```
T0 ──▶ T1 ──▶ T2 ──┬──▶ T3 ──┐
                   ├──▶ T4 ──┼──▶ T5 ──▶ T7
                   │         └──▶ T6 ──┘
```

T3 and T4 run in parallel once T2's interface exists; T5 and T6 in parallel once T4 lands.
