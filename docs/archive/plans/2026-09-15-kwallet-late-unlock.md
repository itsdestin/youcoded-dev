---
status: shipped
---
# KWallet late-unlock recovery implementation plan

**Goal:** Allow existing encrypted credentials and ChatGPT sign-in to work after the OS keychain becomes accessible, without restarting conversations; never report a decryption failure as a missing sign-in.

**Approved direction:** Destin approved a restartable credential helper and accurate errors, emphasizing the simplest robust implementation. No new UI, plaintext fallback, credential migration, dependency upgrade, or live-app manipulation.

**Architecture:** Keep the existing ciphertext file and store locking. Preserve the normal Electron safeStorage path where it works. On Linux, a failed process-local keychain initialization needs a fresh Electron process rather than more checks in the same failed process. A minimal helper must run before normal app initialization, use the same encryption identity/backend, isolate browser storage, exchange values only over private child IPC, and terminate on failure/disconnection/timeout. Failed requests must leave subsequent retries able to start fresh. Verify identity compatibility before wiring this into production.

## Constraints
- Work only in session `kwallet-late-unlock`; Destin explicitly authorized merge/close after reviewing the results and verification limits.
- Do not attach to, signal, or edit the live app or its credential storage.
- Do not exercise the user's KWallet while the app is running; isolated fake backend tests cannot establish real KWallet recovery.
- Missing secret returns null; inaccessible or undecryptable existing secret throws a safe actionable error, never includes its contents.
- No API/renderer bridge changes. Existing error presentation and Retry actions remain the interface.
- Linux-only recovery; normal Windows/macOS safeStorage behavior remains.

## Tasks
- [x] Pin misleading-error regressions in `desktop/tests/secrets-store.test.ts` and `chatgpt-auth.test.ts`: decrypt failure preserves account and ciphertext; a later read on the same auth instance succeeds; malformed tokens are not signed-out; sign-out needs no decrypt.
- [x] Implement accurate shared credential errors; have ChatGPT preflight await the store's recoverable availability check instead of directly checking safeStorage.
- [x] Confirm helper startup and Linux key identity against Electron 41.10.7 / Chromium 146.0.7680.216, including packaged and dev entry, app name, backend selection and isolated userData. Source review confirms an early package-main dispatcher is needed; preserve `app.getName()` and map selected `gnome_libsecret` to CLI `gnome-libsecret`; refuse unknown/basic backends. Scratch browser files do NOT isolate the wallet, so no real-wallet smoke test was run.
- [x] Add helper lifecycle/transport tests before implementation: a failed request retires its child; next request starts fresh; concurrent requests serialize/join safely; timeout/crash/disconnect settle every waiter; no secret in argv/env/logs; unsupported/plaintext backend refused.
- [x] Implement minimal Electron helper entry and parent adapter; reuse existing build pipeline; inject adapter into SecretsStore without changing ciphertext format or file mutation ownership.
- [x] Run focused tests, build/type checks and `bash scripts/verify.sh <app-worktree>`. Get fresh code review; address findings and rerun relevant verification.
  - Helper review: force-stop only the disposable owned Linux helper on retirement; regression shown red then green.
  - Integration review: fence account identity across async token read/refresh and serialize refresh persistence against sign-out (implemented; deferred-read/write and late-401 tests pass).
  - Integration review: isolate search credential-read errors per backend; isolate MCP errors per server, preserve existing projection ownership, retry resource-free placeholders after unlock. Focused regression suite passes.
  - Initial full suite caught eager adapter resolution against partial Electron mocks. Made construction crypto-free/lazy; subsequent full desktop verification passed before later review fixes.
  - Workspace anchor audit reports stale shared component resolution (app 294 commits behind) plus untouched renderer/worker rule budgets; not addressed by this credential fix.
- [x] Document verified results and explicitly distinguish unit/build verification from a real locked-to-unlocked KWallet exercise.

## Verification at final integration
- `bash scripts/verify.sh <session>/youcoded`: earlier final-integration run passed every check. Last repeat passed application/test types, knip, lint and ast-grep but failed one `remote-download.test.ts:804` assertion (`ended` remained false). That exact test also failed in isolation on this branch and untouched `origin/master` (`1e839c70`), so it is not introduced by this fix. Existing dev-workspace roadmap entry updated. 57 existing test-type exclusions reported.
- `npm run build:main`: passes.
- 13 affected suites: 156 tests pass.
- No real KWallet, packaged/AppImage helper IPC, or locked-to-unlocked wallet exercise was performed. Unit tests exercise helper startup in a VM and inject child-process/crypto fakes; they do not prove OS integration.
- No renderer/Android/Worker code changed; Android/Worker builds were not run.
- App merged and pushed as `de2c1b5d` (fix commit `5e576d7d`) on 2026-09-15. Full desktop verification passed after integrating current master; gitleaks found no secrets. No live app state mutations or paid evaluations. Final static review confirms both P1 account-race findings are closed; the MCP/search follow-up review reports no actionable issues.

## Original evidence (before the fix)
- App `SecretsStore.get` caught all decrypt errors and returned null; `ChatGptAuth.readTokens` turned null into sign-in-required.
- App sign-in checks availability on each attempt already.
- Electron v41.10.7 safeStorage delegates availability to sync OSCrypt and exposes no cache reset API.
- Chromium 146.0.7680.216 `OSCryptImpl::DeriveV11Key` consumes/reset its config and can set `try_v11_ = false`; repeating that process's check cannot reconnect the keychain.
- Upstream sources: https://raw.githubusercontent.com/electron/electron/v41.10.7/shell/browser/api/electron_api_safe_storage.cc and https://raw.githubusercontent.com/chromium/chromium/146.0.7680.216/components/os_crypt/sync/os_crypt_linux.cc .
