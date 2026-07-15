---
paths:
  - "youcoded/desktop/src/main/harness/**"
  - "youcoded/desktop/src/main/providers/**"
  - "youcoded/desktop/src/main/native-home.ts"
  - "youcoded/desktop/src/renderer/components/native-send.ts"
last_verified: 2026-07-15
verify:
  - path: youcoded/desktop/src/main/harness/harness-session.ts
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
  - path: youcoded/desktop/src/main/providers/provider-registry.ts
  - path: youcoded/desktop/src/main/native-home.ts
    contains: "mutateFileUnderLock"
  - test: youcoded/desktop/tests/harness-session.test.ts
  - test: youcoded/desktop/tests/native-session-host.test.ts
  - test: youcoded/desktop/tests/native-send.test.ts
  - test: youcoded/desktop/tests/native-home.test.ts
  - test: youcoded/desktop/tests/provider-registry.test.ts
  - test: youcoded/desktop/tests/ipc-channels.test.ts
---

# Multi-model native runtime (provider seam + native chat sessions)

`SessionProvider` is `'claude' | 'native'`. The whole native UI is DORMANT behind `native.supported=false` in production. **Full depth + couplings: staged `youcoded/docs/native-runtime.md` and `youcoded/docs/provider-dependencies.md`.**

## Provider seam (Phase 0) — guard: `ipc-channels.test.ts` ("native runtime capability parity")
- **`'gemini'` is GONE** (Gemini CLI discontinued June 2026; Gemini returns via native runtime). Don't reintroduce a gemini branch/toggle/PTY command.
- **`window.claude.native.supported` is the ONLY gate** — computed from `YOUCODED_NATIVE=1` (run-dev.sh does NOT set it); remote-shim hardcodes `false`. It is a plain boolean, NOT an IPC channel (no ipc-handlers/SessionService.kt row on purpose).
- **`SessionManager.createSession` throws loudly for any non-claude provider** — deliberate guard so a stray native create (remote payload) fails instead of spawning a broken PTY. The native branch builds NO PTY worker (`ManagedSession.worker` is optional — guard every `session.worker.X`); it needs a `binding` unless `resumeSessionId` is set.
- **Reasoning segments are dormant on the CC path** — `assistant-thinking` WITH `data.text` → `TRANSCRIPT_ASSISTANT_REASONING` (per-token deltas merged by `partId`); CC emits `data:{}` so no CC user sees it. **App.tsx and BubbleFeed.tsx MUST use the identical predicate** (`event.data?.text`) or main/buddy windows desync.

## Native sessions (Plan A) — guards: `harness-session.test.ts`, `native-session-host.test.ts`, `native-send.test.ts`, `native-home.test.ts`
- **API keys are `safeStorage`-encrypted in `userData/native-secrets.json`, NEVER in `~/.youcoded/`** (`providers.json` holds only a `secretRef`). `SecretsStore` encrypts BEFORE the write and refuses to store when `safeStorage.isEncryptionAvailable()` is false — no plaintext fallback. Machine-bound ciphertext must not enter a syncable home.
- **All `~/.youcoded/` JSON writes go through `NativeHome` (`mutateFileUnderLock`); it THROWS on lock exhaustion, never silently drops** (dev + built app share the home). `readJson` absorbs ENOENT only and rethrows other I/O errors.
- **`SessionStore` coalesces same-`partId` `assistant-text`/`assistant-thinking` deltas into ONE persisted event** (~50× smaller). `session-error` events are display-only + NEVER persisted, but DO flush the open part first. **`SessionStore.append()` and `HarnessSession.send()` require the CALLER to serialize per session** — `NativeSessionHost` enforces a per-session append chain; HarnessSession hard-throws on re-entrant `send()`.
- **`NativeSessionHost.send()` never throws** (fire-and-forget IPC callers). `destroy()` order is load-bearing: `session.destroy()` (abort+removeAllListeners — this stops re-enqueue, NOT the map delete) → await append chain → `store.dispose()` (flush) → `live.delete`. App-quit → `destroyAll()`.
- **`native:send` rides the SAME transcript-event pipe CC uses** — emits the exact `TranscriptEventType` shapes so the chat reducer/UI render it unchanged. `TRANSCRIPT_REPLAY` falls through `nativeHost.getHistory(id) ?? transcriptWatcher.getHistory(id)`.
- **The renderer send path branches on `provider === 'native'` and MUST skip ALL PTY machinery** (`native-send.ts`): no `\r`, no 56-byte chunking, no echo wait, no `hasPendingInteraction` gate. **The native send string MUST equal `buildOutgoingMessage(...).content`** or the optimistic bubble never dedups. ESC → `native.interrupt`, not a PTY `\x1b`.
- **Provider IPC error semantics differ by transport** (latent parity gap): desktop `ipcMain.handle` THROWS → renderer rejects; remote WS resolves `{ok:false}`. `safeProviders` normalizes both to a throw — EXCEPT `test()`, where `ok:false` is a real result.
- **AI SDK is v7**; `fullStream` parts carry the chunk in `part.text` (NOT `part.delta`); `HarnessSession` maps usage → the fixed transcript `usage` shape (native adds `tokensPerSecond`). **`ModelCatalog` re-stamps `fetchedAt` ONLY when BOTH sources succeed** (else a dead source freezes the picker 24h).
