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
  - test: youcoded/desktop/tests/permission-engine.test.ts
  - test: youcoded/desktop/tests/harness-session-loop.test.ts
  - test: youcoded/desktop/tests/harness-history-rebuild.test.ts
  - test: youcoded/desktop/tests/harness-sdk-toolcall-contract.test.ts
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

## Native tools (Plan A) — guards: `harness-session-loop.test.ts`, `harness-history-rebuild.test.ts`, `harness-sdk-toolcall-contract.test.ts`, `permission-engine.test.ts`
- **HarnessSession's emit surface is FROZEN** — the tool loop only emits existing `TranscriptEventType` values; new loop states MUST map onto existing events (max_steps/doom_loop are permission asks, NOT new event types). *Why:* the chat reducer/UI render native and CC through one pipe — a new event type is dead on arrival. Guard: `harness-session-loop.test.ts` + `harness-sdk-toolcall-contract.test.ts`.
- **Permission precedence is two-tier:** tool-layer guards (secret paths, `external_directory`) sit BELOW all configuration and never yield; the destructive deny-list is CONFIG — an explicit remembered Always-allow beats it (by design, consequence-gated in UI, surfaced via the `denyListed` flag on the ask). Guard: `permission-engine.test.ts`.
- **`PERMISSION_RESPOND` routes by `native-` id prefix** — native ask ids are `native-`-prefixed so the handler tries `nativeHost.respondPermission(requestId, …)` FIRST, then falls through to `hookRelay.respond` (which may be absent in native-only sessions). Don't collapse the two brokers into one. Verify: `src/main/ipc-handlers.ts` (`respondPermission` before `hookRelay`).
- **The serialization contract now also covers ask-pauses** — `HarnessSession.send()` still hard-throws when a turn is in flight, but an ask PAUSES the turn, it does NOT end it: the same in-flight turn resumes on `respondPermission`. Callers must not re-`send()` while an ask is open. Guard: `harness-session-loop.test.ts` (canceled-ask regression).
- **Tool-call/result pairing is an invariant EVERYWHERE** — the driver back-fills canceled/interrupted calls, `rebuildHistory` back-fills crash-truncated ones, and `fitToContext` trims pair-aware. *Why:* a dangling tool_call 400s on real providers and bricks the session. Guards: `harness-session-loop.test.ts` + `harness-history-rebuild.test.ts` (truncated-tail).
- **The driver emits ALL of a step's tool-use events BEFORE executing** (not interleaved) — `rebuildHistory` groups by event adjacency and relies on this ordering; don't "fix" it back to interleaved. Guard: `harness-session-loop.test.ts`.
- **The read-before-edit registry RESETS on resume** — files change while a session is closed, so a stored Read can't stand in for a fresh one. Don't "optimize" the registry back from persisted Read events. Guard: `harness-session-loop.test.ts`.

## Native web tools + presets (Plan B) — guards: `net-guard.test.ts`, `web-fetch-tool.test.ts`, `search-backends.test.ts`, `search-service.test.ts`, `ask-user-question-tool.test.ts`, `native-session-host.test.ts`, `tool-registry-manifest.test.ts`
- **WebFetch/WebSearch follow redirects MANUALLY and re-validate every hop** (scheme + literal IP + DNS answer) — a public URL 302ing to a private/loopback/metadata address (incl. the hex-form `[::ffff:127.0.0.1]` that `new URL` normalizes to `::ffff:7f00:1`) is the SSRF bypass class. Honest friction, not a boundary (TOCTOU rebind possible). Never `redirect:'follow'`. Guard: `net-guard.test.ts`.
- **WebFetch has a pre-parse complexity guard** (`MAX_TAGS`/`MAX_DEPTH`) — Readability runs synchronously on the Electron main loop and is ~quadratic in DOM depth; the 5MB byte cap is not a cost bound and a synchronous hang can't be caught by `defineTool`. Don't drop the guard. Guard: `web-fetch-tool.test.ts`.
- **WebSearch walks a data-driven backend chain** (tavily-keyed → exa-keyless → ddg) that ships in-app AND refreshes from `raw.githubusercontent.com/itsdestin/youcoded/master/search-chain.json` (curated-catalog pattern; versioned cache, memoized hot-path). DDG `202` = rate-limited → honest error, NEVER retried. Backend ids from untrusted IPC are whitelisted before indexing. Guards: `search-chain.test.ts`, `search-backends.test.ts`, `search-service.test.ts`.
- **Search API keys are `safeStorage`-encrypted; `~/.youcoded/search-providers.json` holds only `secretRef` pointers** (same split as `providers.json`). New IPC family `search:*` (list/set-key/remove-key/test) has full 5-surface parity; `search:test` is never-throws `{ok,message}`. Guards: `search-key-store.test.ts`, `ipc-channels.test.ts`.
- **AskUserQuestion rides the existing permission-ask rail** — the broker threads `decision.updatedInput` (the answers) through, and `formatAnswers` is TOTAL (never throws on untrusted answer shapes) or a throw bricks the session via a dangling tool_call. Interactive tools are driver-routed (skip guards/decide). Guards: `native-permission-broker.test.ts`, `ask-user-question-tool.test.ts`, `harness-session-loop.test.ts`.
- **Presets (Assistant/Coder) express permission posture as the `modeFor` SEED, not presetRules** — mode rules outrank preset rules, so Coder = starting mode `auto-edit`. Seeded once at create/resume, never overwritten; explicit `setPermissionMode` wins. Legacy `harnessId:'chat'` → Assistant read-side (header never rewritten). `CORE_TOOLS` ≡ manifest `NATIVE_TOOL_NAMES`. Guards: `preset-registry.test.ts`, `native-session-host.test.ts`, `tool-registry-manifest.test.ts`.
