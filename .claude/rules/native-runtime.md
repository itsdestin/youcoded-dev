---
paths:
  # Split 2026-08-12: harness/{tools,injection,mcp,skills,search}/** moved to
  # harness-tools.md. `*` does not cross slashes, so `harness/*` = top-level
  # harness files only (harness-session, native-session-host, capability-profile, …).
  # Split 2026-08-12: harness/specialists/** moved to native-specialists.md
  # (rule-body budget) — content moved, glob moved with it, no duplication.
  - "youcoded/desktop/src/main/harness/*"
  - "youcoded/desktop/src/main/harness/prompts/**"
  - "youcoded/desktop/src/main/providers/**"
  - "youcoded/desktop/src/main/native-home.ts"
  - "youcoded/desktop/src/renderer/components/native-send.ts"
last_verified: 2026-08-12
verify:
  - path: youcoded/desktop/src/main/harness/harness-session.ts
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
    contains: "quiesce"
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
  - test: youcoded/desktop/tests/archive-boundary.test.ts
---
# Multi-model native runtime (provider seam + sessions + local reliability)

`SessionProvider` is `'claude' | 'native'`. **Depth for every bullet: `youcoded/docs/native-runtime.md` + `provider-dependencies.md`. Siblings: `harness-tools.md` (tools/skills/injection/MCP), `native-permissions.md` (remembered Always-allow rules).**

## Provider seam (Phase 0) — guard: `ipc-channels.test.ts`
- **`'gemini'` is GONE** — don't reintroduce it anywhere.
- **`native.supported` is the ONLY gate** — a plain boolean, not IPC; ON by default, kill switch `YOUCODED_NATIVE=0`; remote-shim hardcodes `false`.
- **`createSession` throws for non-claude providers**; the native branch builds NO PTY worker (guard every `session.worker.X`); needs a `binding` unless resuming.
- **Reasoning segments are dormant on the CC path** (`data:{}`); App.tsx + BubbleFeed.tsx MUST share predicate `event.data?.text`.

## Native sessions (Plan A) — guards: `harness-session`/`native-session-host`/`native-send`/`native-home` tests
- **API keys: `safeStorage`-encrypted in `userData/native-secrets.json`, NEVER `~/.youcoded/`** (only a `secretRef`; no plaintext fallback); `~/.youcoded/` writes ride `NativeHome.mutateFileUnderLock` (THROWS on lock exhaustion).
- **`SessionStore` coalesces same-`partId` deltas; `session-error` is display-only, NEVER persisted.** Callers serialize per session; re-entrant `send()` throws.
- **`send()` never throws — synchronous `NativeSendResult`** (`'sent'|'queued'` FIFO-10 `|'failed'`, real reason); the queue drains ONLY on `send()` settle; **interrupt aborts the current turn only — the queue still drains**; `destroy()` order is load-bearing (destroy → append-chain → dispose → delete).
- **`native:*` calls are invokes with ONE result shape on ALL transports.** Queued messages are renderer list state, NEVER timeline; `TRANSCRIPT_REPLAY`: `nativeHost.getHistory ?? transcriptWatcher.getHistory`.
- **The renderer native send path skips ALL PTY machinery** (`native-send.ts`); the send string MUST equal `buildOutgoingMessage(...).content`; ESC → `native.interrupt`.
- **AI SDK v7: chunks ride `part.text`; `ModelCatalog` re-stamps `fetchedAt` ONLY when BOTH sources succeed.**

## Tool loop (`harness-session.ts`) — guards: `harness-session-loop`/`harness-history-rebuild`/`harness-sdk-toolcall-contract`/`permission-engine` tests
- **The emit surface is FROZEN** — new loop states map onto existing `TranscriptEventType`s only.
- **Tool-call/result pairing holds EVERYWHERE** (driver, `rebuildHistory`, `fitToContext`) — a dangling tool_call bricks sessions.
- **An ask PAUSES the turn, not ends it** — no re-`send()` while open; **`PERMISSION_RESPOND` tries the `native-`-prefixed broker first**, then hookRelay.
- **Permission precedence is two-tier:** tool-layer guards never yield; the destructive deny-list is CONFIG — a remembered Always-allow beats it.
- **Images travel canonically in the tool result; `adaptForWire` splits per wire at request-build time** — a mid-session model swap can't leak pixels.

## M2 — conversations & sync — guards: `session-meta-parity`/`native-title-feeder`/`holder-takeover` tests
- **Native sessions are real Conversation Store rows** (`native/<id>.json`) — invariants: rule `conversations.md` → "Native provider participation". **Android has none of this** (M8).
- **`lastUsedModel` is portable (`{modelId, providerType, providerLabel}`), never the device-local `binding.providerId`.**
- **Resume ALWAYS offers `ModelPicker`, NEVER auto-launches a binding**; `bindingOverride` applies BEFORE the eager transcript load; the header is never rewritten.
- **`quiesce(id)` is a SEPARATE, STRONGER teardown than `interrupt()`** — cross-device takeover only, never the Stop button.
- **`native-title-feeder.ts` fires once (first `turn-complete`); NEVER touches the session's JSONL.**
- **Presets express posture as the `modeFor` SEED, not presetRules** — seeded once; explicit `setPermissionMode` wins; `CORE_TOOLS` ≡ `NATIVE_TOOL_NAMES` (guards: `preset-registry`/`tool-registry-manifest`).

## Local reliability (Plan C, master 2026-07-29 PR #268) — guards: `capability-profile`/`known-models`/`engine-context-window`/`compaction`/`harness-compaction`/`harness-tool-presentation`/`statusbar-native-usage` tests
- **CapabilityProfile resolves in THREE layers and NEVER branches on a model name** (`known-models.ts` is the ONLY modelId inspection); `supportsTools:false` → plain chat.
- **A local model's REAL context window is read (`/props`) + clamped, never guessed** — ONE number feeds tiering, compaction trigger, StatusBar chip.
- **Constrained decoding = `--jinja` grammar + `parallel_tool_calls:false`, NEVER a top-level `json_schema`** (local branch only).
- **Two-stage compaction prunes then summarizes, and FAILS SAFE** — never drops a message, cuts on a USER boundary; the summary is abort-raced, 30s-bounded; failure leaves the pruned history.
- **Native auto-compaction rides `data.autoCompaction`** (only `action.auto` bypasses `compactionPending`; native-only).
- **`native:usage-report` is a STATUS channel, not a transcript type**; chips read `turn-complete` usage (turn END).
