---
status: active
card: 236
branch: session/236-working-offline-sign-in-expiry (youcoded + youcoded-dev)
---

# Card #236: backend for sign-in expiry and no internet

The UI is built and approved: decks under `docs/active/design/2026-11-17-claude-sign-in-expiry/`
(questions rounds 1–2, review rounds 1–2, all answered). This plan wires the real backend under
it. The approved UI is the contract. A change to what the user sees means a reopen deck, never a
silent edit.

## What already exists on the branch (renderer, approved)
- `renderer/state/provider-sign-in-store.ts`: one sign-in flow per provider. It calls
  `network.check()` and then `claudeCode.signIn()` / `chatgpt.signIn()` / `openrouter.signIn()`
  (each resolves `true` once the browser opened). It polls each provider's `status()` until done.
- `renderer/components/SignInNotices.tsx`, `ChatNoticeBubble.tsx`: the chat cards.
- `ModelProvidersPopup.tsx`: the Settings cards (Claude `expiresAt` / `expired`, ChatGPT
  `signed-out` + `expired`, OpenRouter offline check).
- `FirstRunView.tsx` + `first-run/SignInChoices.tsx`: reads `FirstRunState.lastErrorOffline`.
- `hooks/useExpiredSignIns.ts`: the Settings gear's red dot.
- `main/transcript-watcher.ts`: passes CC's `error` label as `assistant-text.data.apiError`.
- Workbench-only channels (`renderer/dev/workbench/mock-only.ts`): `claudeCode.signIn`,
  `claudeCode.cancelSignIn`, `network.check`. **Their rows are deleted when the real channels land.**

## Tasks
1. **`network:check`**: one channel, answer `{ online: boolean }`. Move `SyncService.probeInternet`
   into `main/network-check.ts` (a DNS lookup with a 5 s timeout), reused by sync-service. Online
   means at least one of two probes succeeded; offline means both failed (Destin 2026-09-14
   S-honest: "check fails twice"). It never throws. It must be async and non-blocking
   (`performance.md` rule 1). Phone policy: allowed (it reports the host's network).
2. **`claude-code:sign-in` / `claude-code:cancel-sign-in`**: reuse `startOAuthLogin()`
   (`prerequisite-installer.ts`), the same path first launch uses. Resolve `true` once the URL is
   captured (`claude auth login` opens the browser itself, so do not double-open; follow what
   `first-run.ts handleOAuthLogin` does, including Android's `returnToApp` on success). Keep the
   process until `claude auth status` says signed in (poll as first-run does, 10 min cap), then
   kill it and `invalidate()` the ClaudeAccount cache. Throw a screen sentence if no URL appears.
   Cancel kills it and resolves `true`. Phone policy: `desktopOnly` (a visiting phone is refused;
   the card already says "Sign in again from your host computer").
3. **ClaudeAccount `expiresAt` / `expired`** (`main/providers/claude-account.ts`): parse
   `loginExpiresAt` into `expiresAt`. `expired` is true when `expiresAt` is in the past, OR after
   `noteAuthFailure()` while the login has not changed. Implement the second part by remembering
   the `loginExpiresAt` value seen at the failure, and clearing it once `status()` reads a
   different value or the sign-in in task 2 completes. `noteAuthFailure()` is called (and the
   cache invalidated) when the transcript watcher emits an `assistant-text` with
   `apiError === 'authentication_failed'`, live events only, never on history replay.
   `availability.ts` keeps Claude models switched ON regardless (the decision in
   `claude-account-types.ts`).
4. **ChatGPT `expired`** (`main/providers/chatgpt-auth.ts`): when a refused renewal (400/401 at
   refresh, or the second 401 on a turn) runs `clearAccount()`, remember it so that `status()`
   answers `{ state: 'signed-out', expired: true }` until the next successful sign-in. Persist it
   beside the account's own stored state if a store exists, so a restart keeps saying "expired".
   Otherwise in memory is acceptable; say which in the commit.
5. **OpenRouter "how you connected"**: record `connectedVia: 'key' | 'browser'` when a key is
   saved by the key window or by the browser sign-in, and expose it on `providers.list()` rows.
   Renderer: when it is known, `ProviderSignInCard` and the Settings broken-key notice offer only
   that way (key → Paste a new key / API Key; browser → Sign in with OpenRouter). When unknown
   (older connections), offer both, as built. Pin with a test.
6. **Native no-internet** (`harness-session.ts` / `provider-failure.ts`): when a turn fails as
   `temporary`/network, run `network.check` before the retry ladder. If offline, end the turn at
   once with `errorCode: 'no-internet'` (the renderer already draws the red No internet card;
   Try again is the existing `native.continueTurn`). If online, keep today's behaviour exactly.
   Keep the tool-call pairing and frozen emit surface (`native-runtime.md`).
7. **First-run offline** (`main/first-run.ts`): `handleOAuthLogin`, `handleChatGptLogin` and
   `handleOpenRouterLogin` run the check first. If offline: `lastError = 'No internet connection.
   Connect, then try again.'`, `lastErrorOffline = true`, `authMode = 'none'`, auth prerequisite
   back to waiting, and return without spawning or opening anything. Clear `lastErrorOffline`
   whenever `lastError` is set or cleared by anything else.
8. **Parity and records**: `IPC` names + `ChannelTypes` rows in `shared/backend-contract.ts`,
   `defineChannel` entries in `main/ipc/<family>.ts` listed in `channel-table.ts`, the generated
   preload block (`node scripts/generate-preload-channels.mjs`), `remote-shim.ts` methods,
   `Window['claude']` typing, and delete the three `mock-only.ts` rows (keep the mock-shim fakes).
   Add a `youcoded/docs/cc-dependencies.md` entry for (a) CC's `isApiErrorMessage` + `error` label
   on its own replies and (b) `claude auth status`'s `loginExpiresAt`.

## Done when
`bash scripts/verify.sh youcoded` passes. Each task has a behavioural test, and each test was seen
red with its fix removed. A fresh code reviewer (`scripts/ui-review/code-reviewer.md`) has
reported, and its accepted findings are fixed.
