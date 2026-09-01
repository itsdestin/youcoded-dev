---
paths:
  # Split 2026-08-12: harness/{tools,injection,mcp,skills,search}/** moved to
  # harness-tools.md. `*` does not cross slashes, so `harness/*` = top-level
  # harness files only (harness-session, native-session-host, capability-profile, …).
  # Split 2026-08-12: harness/specialists/** moved to native-specialists.md
  # (rule-body budget) — content moved, glob moved with it, no duplication.
  - "**/desktop/src/main/harness/*"
  - "**/desktop/src/main/harness/prompts/**"
  - "**/desktop/src/main/providers/**"
  - "**/desktop/src/main/native-home.ts"
  - "**/desktop/src/renderer/components/native-send.ts"
last_verified: 2026-08-16
verify:
  - path: youcoded/desktop/src/main/harness/harness-session.ts
  - path: youcoded/desktop/src/main/harness/harness-session.ts
    contains: "sawFirstChunk .. this.turnEverParked. && !willRetry"
  - path: youcoded/desktop/src/main/harness/harness-session.ts
    contains: "const willRetry = !emittedAny && isFirstAttempt"
  - path: youcoded/desktop/src/main/harness/session-store.ts
    contains: "dropPart"
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
    contains: "quiesce"
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
    contains: "SUBAGENT_DISPLAY_TYPES"
  - path: youcoded/desktop/src/main/native-title-feeder.ts
  - path: youcoded/desktop/src/main/conversations/portable-model.ts
  - path: youcoded/desktop/src/renderer/components/model/ModelPicker.tsx
  - path: youcoded/desktop/src/main/providers/provider-registry.ts
  - path: youcoded/desktop/src/main/native-home.ts
    contains: "mutateFileUnderLock"
  - path: youcoded/desktop/src/main/harness/wire-adapter.ts
    contains: "adaptForWire"
  - path: youcoded/desktop/src/main/harness/image-support.ts
  - path: youcoded/desktop/src/main/harness/message-size.ts
  - path: youcoded/desktop/src/main/harness/capability-profile.ts
    contains: "exposeSkillCatalog"
  - test: youcoded/desktop/tests/wire-adapter.test.ts
  - test: youcoded/desktop/tests/harness-session.test.ts
  - test: youcoded/desktop/tests/native-session-host.test.ts
  - test: youcoded/desktop/tests/native-send.test.ts
  - test: youcoded/desktop/tests/native-home.test.ts
  - test: youcoded/desktop/tests/native-title-feeder.test.ts
  - test: youcoded/desktop/tests/provider-registry.test.ts
  - test: youcoded/desktop/tests/ipc-channels.test.ts
  - test: youcoded/desktop/tests/permission-engine.test.ts
  - test: youcoded/desktop/tests/harness-session-loop.test.ts
  - test: youcoded/desktop/tests/harness-history-rebuild.test.ts
  - test: youcoded/desktop/tests/harness-sdk-toolcall-contract.test.ts
  - test: youcoded/desktop/tests/prefill-lifecycle.test.ts
  - test: youcoded/desktop/tests/prefill-watchdog.test.ts
  - test: youcoded/desktop/tests/harness-stall-watchdog.test.ts
  - test: youcoded/desktop/tests/archive-boundary.test.ts
---
# Multi-model native runtime (provider seam + sessions + local reliability)

`SessionProvider` is `'claude' | 'native'`. **Depth for every bullet: `youcoded/docs/native-runtime.md` + `provider-dependencies.md`. Siblings: `harness-tools.md` (tools/skills/MCP), `native-permissions.md` (Always-allow rules).**

## Provider seam (Phase 0) — guard: `ipc-channels.test.ts`
- **`'gemini'` is GONE** — never reintroduce it.
- **`native.supported` is the ONLY gate** — a boolean, not IPC; ON by default, kill switch `YOUCODED_NATIVE=0`; remote-shim hardcodes `false`.
- **`createSession` throws for non-claude providers**; the native branch builds NO PTY worker (guard every `session.worker.X`); needs a `binding` unless resuming.

## Native sessions (Plan A) — guards: `harness-session`/`native-session-host`/`native-send`/`native-home` tests
- **API keys: `safeStorage`-encrypted in `userData/native-secrets.json`, NEVER `~/.youcoded/`** (only a `secretRef`; no plaintext fallback); `~/.youcoded/` writes ride `NativeHome.mutateFileUnderLock` (THROWS on lock exhaustion).
- **`SessionStore` coalesces same-`partId` deltas; display-only (`session-error`, payload-less `assistant-thinking`) is NEVER persisted.** Callers serialize per session; re-entrant `send()` throws.
- **`send()` never throws — synchronous `NativeSendResult`** (`'sent'|'queued'` FIFO-10 `|'failed'`, real reason); the queue drains ONLY on `send()` settle; **interrupt aborts the current turn only — the queue still drains**; `destroy()` order is load-bearing (destroy → append-chain → dispose → delete).
- **Queued messages are renderer list state, NEVER timeline**; `native:*` calls are invokes with ONE result shape on ALL transports.
- **The renderer native send path skips ALL PTY machinery** (`native-send.ts`); the send string MUST equal `buildOutgoingMessage(...).content`; ESC → `native.interrupt`.

## Tool loop (`harness-session.ts`) — guards: `harness-session-loop`/`harness-history-rebuild`/`harness-sdk-toolcall-contract`/`permission-engine` tests
- **The emit surface is FROZEN** — new loop states map onto existing `TranscriptEventType`s only.
- **Tool-call/result pairing holds EVERYWHERE** (driver, `rebuildHistory`, `fitToContext`) — a dangling tool_call bricks sessions.
- **An ask PAUSES the turn, not ends it** — no re-`send()` while open. **Carve-out: a HUMAN dismissal (broker `dismissed`) ENDS it.**
- **Permission precedence is two-tier:** tool-layer guards never yield; the destructive deny-list is CONFIG — a remembered Always-allow beats it.

## M2 conversations/sync — guards: `session-meta-parity`/`holder-takeover` tests
- **Native sessions are real Conversation Store rows** — invariants: rule `conversations.md`.
- **`quiesce(id)` is a SEPARATE, STRONGER teardown than `interrupt()`** — cross-device takeover only, never the Stop button.

## Local reliability (Plan C) — guards: `capability-profile`/`known-models`/`compaction`/`harness-compaction` tests
- **CapabilityProfile NEVER branches on a model name** (`known-models.ts` is the ONLY modelId inspection); `supportsTools:false` → plain chat.
- **A local model's REAL context window is read (`/props`) + clamped, never guessed** — ONE number feeds tiering, compaction trigger, StatusBar chip.
- **Two-stage compaction FAILS SAFE** — never drops a message, cuts on a USER boundary.

## Stall watchdog & the park — guard: `harness-stall-watchdog.test.ts`
- **The park is a `return` that does NOT resolve the stall race** — stage 2 emits `{stalled:true}` and returns; nothing is torn down, so a chunk arriving minutes later still lands in the loop and continues the turn. That `return` IS the feature.
- **Check the park guard against the EXPRESSION, never prose — it has been mis-stated five times.** `!isSpecialistChild && (sawFirstChunk || turnEverParked) && !willRetry`, `willRetry = !emittedAny && isFirstAttempt`. `willRetry` tests `emittedAny`, NOT `sawFirstChunk` — tool-argument fragments set only the latter, so a first-attempt tool-args stall still auto-retries silently.
- **Clock 1 stays OUT OF SCOPE** — nothing streamed this attempt and the turn never parked → still ends in the prefill `StreamStallError`. `turnEverParked` is per-TURN (cleared only at `send()` entry), so a post-park retry can never die on Clock 1.
- **A specialist child must NEVER park** — `SUBAGENT_DISPLAY_TYPES` excludes `assistant-thinking`, so a parked child shows no card, its `send()` never settles, and the parent's `Task` waits forever.
- **Retry erases in THREE places** — screen (`NATIVE_PARTS_DROPPED`, rule `chat-reducer.md`), disk (`SessionStore` discards the open part — the one path that doesn't flush it), model memory (`reportPartial('')`).
