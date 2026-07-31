---
paths:
  - "youcoded/desktop/src/main/harness/**"
  - "youcoded/desktop/src/main/providers/**"
  - "youcoded/desktop/src/main/native-home.ts"
  - "youcoded/desktop/src/renderer/components/native-send.ts"
last_verified: 2026-07-29
verify:
  - path: youcoded/desktop/src/main/harness/harness-session.ts
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
    contains: "quiesce"
  - path: youcoded/desktop/src/main/native-title-feeder.ts
  - path: youcoded/desktop/src/main/conversations/portable-model.ts
  - path: youcoded/desktop/src/renderer/components/NativeModelSelect.tsx
  - path: youcoded/desktop/src/main/providers/provider-registry.ts
  - path: youcoded/desktop/src/main/native-home.ts
    contains: "mutateFileUnderLock"
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
  - test: youcoded/desktop/tests/harness-tools-core.test.ts
  - path: youcoded/desktop/src/main/harness/skills/skill-catalog.ts
  - path: youcoded/desktop/src/main/harness/tools/skill.ts
  - path: youcoded/desktop/src/main/harness/injection/path-triggers.ts
    contains: "paths:"
  - path: youcoded/desktop/src/main/harness/injection/injection-budget.ts
    contains: "truncated"
  - path: youcoded/desktop/src/main/harness/capability-profile.ts
    contains: "exposeSkillCatalog"
  - test: youcoded/desktop/tests/skill-catalog.test.ts
  - test: youcoded/desktop/tests/skill-tool-gating.test.ts
  - test: youcoded/desktop/tests/injection-budget.test.ts
  - test: youcoded/desktop/tests/path-triggers.test.ts
  - test: youcoded/desktop/tests/rule-injection.test.ts
  - test: youcoded/desktop/tests/prefill-lifecycle.test.ts
  - test: youcoded/desktop/tests/archive-boundary.test.ts
  - path: youcoded/desktop/src/main/harness/mcp/mcp-registry.ts
    contains: "secretRef"
  - path: youcoded/desktop/src/main/harness/mcp/mcp-client.ts
    contains: "stderr: 'pipe'"
  - path: youcoded/desktop/src/main/harness/mcp/mcp-manager.ts
  - path: youcoded/desktop/src/main/harness/mcp/mcp-tools.ts
    contains: "permissionSubject"
  - path: youcoded/desktop/src/main/mcp-reconciler.ts
    contains: "_youcodedOwnedMcpServers"
  - test: youcoded/desktop/tests/mcp-registry.test.ts
  - test: youcoded/desktop/tests/mcp-client.test.ts
  - test: youcoded/desktop/tests/mcp-manager.test.ts
  - test: youcoded/desktop/tests/mcp-tools.test.ts
  - test: youcoded/desktop/tests/mcp-gating.test.ts
  - test: youcoded/desktop/tests/mcp-projection.test.ts
  - test: youcoded/desktop/tests/mcp-startup-wiring.test.ts
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
- **`NativeSessionHost.send()` never throws; it returns `NativeSendResult` synchronously** — `'sent'` = turn dispatched (deferred one `setImmediate` so the invoke ack beats the `user-message` event to the renderer), `'queued'` = FIFO'd (cap 10, `queueId`) behind the in-flight turn, `'failed'` = refused with the real reason; turn failures surface as `session-error` events, not the return. The queue drains ONLY on `send()` settle; **interrupt aborts the current turn only — the queue still drains** (pinned: `native-session-host.test.ts` M1 block). `destroy()` order is load-bearing: `session.destroy()` (abort+removeAllListeners — this stops re-enqueue, NOT the map delete) → await append chain → `store.dispose()` (flush) → `live.delete`. App-quit → `destroyAll()`.
- **`native:send`/`native:queue-remove` are invokes on ALL transports** (same result shape desktop + remote WS — no throw-vs-`{ok:false}` divergence) riding the SAME transcript-event pipe CC uses — exact `TranscriptEventType` shapes, reducer/UI unchanged. Queued messages are renderer list state (`queuedMessages` → docked strip), NEVER timeline entries; the timeline entry appears only via the drain's `user-message` event at its true position. `TRANSCRIPT_REPLAY` falls through `nativeHost.getHistory(id) ?? transcriptWatcher.getHistory(id)`.
- **The renderer send path branches on `provider === 'native'` and MUST skip ALL PTY machinery** (`native-send.ts`): no `\r`, no 56-byte chunking, no echo wait, no `hasPendingInteraction` gate. **The native send string MUST equal `buildOutgoingMessage(...).content`** or the optimistic bubble never dedups. ESC → `native.interrupt`, not a PTY `\x1b`.
- **Provider IPC error semantics differ by transport** (latent parity gap): desktop `ipcMain.handle` THROWS → renderer rejects; remote WS resolves `{ok:false}`. `safeProviders` normalizes both to a throw — EXCEPT `test()`, where `ok:false` is a real result.
- **AI SDK is v7**; `fullStream` parts carry the chunk in `part.text` (NOT `part.delta`); `HarnessSession` maps usage → the fixed transcript `usage` shape (native adds `tokensPerSecond`). **`ModelCatalog` re-stamps `fetchedAt` ONLY when BOTH sources succeed** (else a dead source freezes the picker 24h).

## M2 — conversations & sync participation (`conversations/service.ts`, `native-title-feeder.ts`, `NativeModelSelect.tsx`) — guards: `session-meta-parity.test.ts`, `native-title-feeder.test.ts`, `holder-takeover.test.ts` (native flows)
- **Native sessions are real Conversation Store rows** (`native/<id>.json`) — store participation, lane assertion, and meta-write buffering are provider-generic invariants; full detail lives in `.claude/rules/conversations.md` → "Native provider participation."
- **`lastUsedModel` is portable (`{modelId, providerType, providerLabel}`), never `binding.providerId`** (a device-local per-device ULID in never-synced `providers.json`) — a synced record can't carry a usable binding across devices by construction.
- **Resume ALWAYS offers the model selector (`NativeModelSelect`), pre-filled from `lastUsedModel`, and NEVER auto-launches a binding** — true from every native-resume entry point (inline ResumeBrowser, MovedGate's `onResume`, ProjectView's `onResumeConversation`, all via App.tsx's `pendingNativeResume` modal). The selection becomes `resume(id, cwd, bindingOverride?)`'s `bindingOverride`, applied BEFORE the eager transcript load — the resumed session must never briefly render under the stale stored binding — and the session header is NEVER rewritten, only the live binding.
- **`quiesce(id)` is a SEPARATE, STRONGER teardown than `interrupt()` — cross-device takeover only, never the Stop button.** The M1 interrupt-aborts-current-turn-only / queue-still-drains semantics pinned above are UNCHANGED for `interrupt()`. `quiesce()` additionally: clears the send queue synchronously → awaits one macrotask (lets a same-tick `send()` finish its deferred dispatch before the abort) → cancels any paused permission ask + aborts the stream → awaits turn settling → drains the append chain. Postcondition: no further appends until a new `send()`. `createHolderTakeover` branches to it for a native holder instead of the ESC byte; the native lease acquire is re-enabled behind `isSyncSpacesEnabled()` (warn-on-denied, mirrors CC).
- **`native-title-feeder.ts` fires once, at the session's first `turn-complete`, and NEVER touches the session's own JSONL** — bound-model `generateText`, 15s abort, max 3 attempts, a synchronous in-flight guard (closes a takeover/resume double-title race). Titles are store-only metadata, written through the same path a CC auto-title uses.
- **Android has none of this** — no Kotlin code reads the Conversation Store, `~/.youcoded/`, or `lastUsedModel`; `SessionService.kt`'s `session:browse`/`get-meta` still answer from the legacy `~/.claude/conversation-index.json` + local scan only (M8).

## Native tools (Plan A) — guards: `harness-session-loop.test.ts`, `harness-history-rebuild.test.ts`, `harness-sdk-toolcall-contract.test.ts`, `permission-engine.test.ts`
- **HarnessSession's emit surface is FROZEN** — the tool loop only emits existing `TranscriptEventType` values; new loop states MUST map onto existing events (max_steps/doom_loop are permission asks, NOT new event types). *Why:* the chat reducer/UI render native and CC through one pipe — a new event type is dead on arrival. Guard: `harness-session-loop.test.ts` + `harness-sdk-toolcall-contract.test.ts`.
- **Permission precedence is two-tier:** tool-layer guards (secret paths, `external_directory`) sit BELOW all configuration and never yield; the destructive deny-list is CONFIG — an explicit remembered Always-allow beats it (by design, consequence-gated in UI, surfaced via the `denyListed` flag on the ask). Guard: `permission-engine.test.ts`.
- **`PERMISSION_RESPOND` routes by `native-` id prefix** — native ask ids are `native-`-prefixed so the handler tries `nativeHost.respondPermission(requestId, …)` FIRST, then falls through to `hookRelay.respond` (which may be absent in native-only sessions). Don't collapse the two brokers into one. Verify: `src/main/ipc-handlers.ts` (`respondPermission` before `hookRelay`).
- **The serialization contract now also covers ask-pauses** — `HarnessSession.send()` still hard-throws when a turn is in flight, but an ask PAUSES the turn, it does NOT end it: the same in-flight turn resumes on `respondPermission`. Callers must not re-`send()` while an ask is open. Guard: `harness-session-loop.test.ts` (canceled-ask regression).
- **Tool-call/result pairing is an invariant EVERYWHERE** — the driver back-fills canceled/interrupted calls, `rebuildHistory` back-fills crash-truncated ones, and `fitToContext` trims pair-aware. *Why:* a dangling tool_call 400s on real providers and bricks the session. Guards: `harness-session-loop.test.ts` + `harness-history-rebuild.test.ts` (truncated-tail).
- **The driver emits ALL of a step's tool-use events BEFORE executing** (not interleaved) — `rebuildHistory` groups by event adjacency and relies on this ordering; don't "fix" it back to interleaved. Guard: `harness-session-loop.test.ts`.
- **The read-before-edit registry RESETS on resume** — files change while a session is closed, so a stored Read can't stand in for a fresh one. Don't "optimize" the registry back from persisted Read events. Guard: `harness-session-loop.test.ts`.
- **Bash cwd is SCOPED-PERSISTENT; the file tools are not** — `HarnessSession.shellCwd` tracks the shell dir across calls (read back via a `__YC_CWD__` sentinel `printf`ed on its own **newline-terminated** line, with `exit $__yc_rc` preserving the exit code); a `cd` outside `ctx.cwd` is reverted AND announced. Only cwd persists — env/aliases don't — and it resets on resume like readRegistry. Read/Edit/Write/Glob/Grep still resolve relative paths against `ctx.cwd`, so `cd sub` does NOT move them. *Why:* stateless-and-silent cost ~6 wasted tool calls in one session (the upstream complaint in CC #35058/#42837); the sentinel's trailing newline and the uncapped tail buffer are both load-bearing — without them a background writer corrupts the path and a chatty command drops the `cd`. PowerShell (Windows sans Git Bash) stays stateless by design. Guard: `harness-tools-core.test.ts` ("scoped cwd persistence").

## Native web tools + presets (Plan B) — guards: `net-guard.test.ts`, `web-fetch-tool.test.ts`, `search-backends.test.ts`, `search-service.test.ts`, `ask-user-question-tool.test.ts`, `native-session-host.test.ts`, `tool-registry-manifest.test.ts`
- **WebFetch/WebSearch follow redirects MANUALLY and re-validate every hop** (scheme + literal IP + DNS answer) — a public URL 302ing to a private/loopback/metadata address (incl. the hex-form `[::ffff:127.0.0.1]` that `new URL` normalizes to `::ffff:7f00:1`) is the SSRF bypass class. Honest friction, not a boundary (TOCTOU rebind possible). Never `redirect:'follow'`. Guard: `net-guard.test.ts`.
- **WebFetch has a pre-parse complexity guard** (`MAX_TAGS`/`MAX_DEPTH`) — Readability runs synchronously on the Electron main loop and is ~quadratic in DOM depth; the 5MB byte cap is not a cost bound and a synchronous hang can't be caught by `defineTool`. Don't drop the guard. Guard: `web-fetch-tool.test.ts`.
- **WebSearch walks a data-driven backend chain** (tavily-keyed → exa-keyless → ddg) that ships in-app AND refreshes from `raw.githubusercontent.com/itsdestin/youcoded/master/search-chain.json` (curated-catalog pattern; versioned cache, memoized hot-path). DDG `202` = rate-limited → honest error, NEVER retried. Backend ids from untrusted IPC are whitelisted before indexing. Guards: `search-chain.test.ts`, `search-backends.test.ts`, `search-service.test.ts`.
- **Search API keys are `safeStorage`-encrypted; `~/.youcoded/search-providers.json` holds only `secretRef` pointers** (same split as `providers.json`). New IPC family `search:*` (list/set-key/remove-key/test) has full 5-surface parity; `search:test` is never-throws `{ok,message}`. Guards: `search-key-store.test.ts`, `ipc-channels.test.ts`.
- **AskUserQuestion rides the existing permission-ask rail** — the broker threads `decision.updatedInput` (the answers) through, and `formatAnswers` is TOTAL (never throws on untrusted answer shapes) or a throw bricks the session via a dangling tool_call. Interactive tools are driver-routed (skip guards/decide). Guards: `native-permission-broker.test.ts`, `ask-user-question-tool.test.ts`, `harness-session-loop.test.ts`.
- **Presets (Assistant/Coder) express permission posture as the `modeFor` SEED, not presetRules** — mode rules outrank preset rules, so Coder = starting mode `auto-edit`. Seeded once at create/resume, never overwritten; explicit `setPermissionMode` wins. Legacy `harnessId:'chat'` → Assistant read-side (header never rewritten). `CORE_TOOLS` ≡ manifest `NATIVE_TOOL_NAMES`. Guards: `preset-registry.test.ts`, `native-session-host.test.ts`, `tool-registry-manifest.test.ts`.

## Native local reliability (Plan C) + M3 items 1/2/3/5 — **ON MASTER since 2026-07-29**

**Merged to master 2026-07-29 — youcoded PR #268, merge `12f71d07`.** This section described the unmerged branch `feat/native-local-reliability-rebase` until then; it is now master truth and the verify: anchors below cover it. M3 item 4 (MCP) is NOT here — it is greenfield and gets its own design pass.

Branch guards: `capability-profile.test.ts`, `known-models.test.ts`, `engine-context-window.test.ts`, `compaction.test.ts`, `harness-compaction.test.ts`, `harness-tool-presentation.test.ts`, `harness-hardening.test.ts`, `provider-registry.test.ts`, `statusbar-native-usage.test.ts`, `ipc-channels.test.ts`
- **CapabilityProfile resolves in THREE layers and NEVER branches on a model name** — discovered facts (provider type + real context window) → a family-keyed regex registry (`known-models.ts`, the ONLY place a modelId is inspected) → conservative fallback. `resolveProfile` is pure. Tools are attached unless the registry marks `supportsTools:false` (then the model runs as plain chat; `buildAiTools` returns `{}`). The registry's factual fields (context windows, tool-calling) are web-sourced + `// UNVERIFIED`-flagged and re-checked against real GGUF quants at acceptance — treat them as provisional. Guards: `capability-profile.test.ts`, `known-models.test.ts`.
- **A local model's REAL context window is read + enforced, never guessed** — `EngineManager.effectiveContextWindow` reads llama-server `/props` (field drifts: `default_generation_settings.n_ctx` → top-level `n_ctx`), `clampContextWindow` takes `min(loaded, GGUF-trained)`, and `effectiveContextForModel` further clamps to the registry's `maxContextWindow` ceiling. GGUF-trained is null today (no header parser) — the registry ceiling is the pragmatic stand-in. This ONE number feeds profile tiering + the compaction trigger + the StatusBar chip. `contextLengthFor`'s local branch calls it; it never throws. Guard: `engine-context-window.test.ts`.
- **Constrained decoding = `--jinja` tool grammar + `parallel_tool_calls:false`, NEVER a top-level `json_schema`** — a top-level schema/`response_format` would force JSON on EVERY reply and break the "plain-text answers always legal" invariant. The serial-only flag is injected via `@ai-sdk/openai-compatible`'s `transformRequestBody` on the LOCAL model only, gated on `profile.constrainToolArgs && !supportsParallelToolCalls`. Verified by `test-engine/probe-tools.mjs` (dev-run, engine-bump gated). Guard: `provider-registry.test.ts`.
- **Two-stage compaction prunes tool OUTPUT text then summarizes, and FAILS SAFE** — prune never drops a message (pairing intact); summarize cuts on a USER-message boundary and replaces the span with one summary message. The summary model call is abort-raced + 30s-timeout-bounded (a bare `for await` reintroduces the un-interruptible hang `consumeStep` guards against); a thrown/empty summary leaves the pruned history (`fitToContext` is the floor — never `session-error`). Trigger is the real last-step `inputTokens`; a thrash guard skips summarize when the condensable span is trivial. Guards: `compaction.test.ts`, `harness-compaction.test.ts`.
- **Native auto-compaction surfaces via `data.autoCompaction`, not the manual `/compact` gate** — the driver emits the existing `compact-summary` event with `{ summary, autoCompaction: true }`; the reducer's `COMPACTION_COMPLETE` bypasses the `compactionPending` guard only when `action.auto` (set ONLY by the native harness, so CC resume-from-summary still inserts no marker). The event is persisted + replayed, so each spontaneous compaction leaves one inline marker.
- **Simplified presentation swaps DESCRIPTIONS, not the tool set** — `maxToolPresentation:'simplified'` hands each tool its `shortDescription ?? description`; all ten tools remain. Schema flattening beyond descriptions is deferred pending probe evidence. Guard: `harness-tool-presentation.test.ts`.
- **`native:usage-report` is a STATUS channel, not a transcript type** — renderer→main fire-and-forget cached in `lastNativeUsageBySession` (mirrors `remote:attention-changed`), folded into `buildStatusData().nativeUsageMap`. The StatusBar chips (context %/tokens/tokens-per-sec) read a session's `turn-complete` usage; `contextLength` rides the usage payload (a session constant on a per-turn event, like `tokensPerSecond`). Chips update at turn END (mid-turn lag accepted). Guards: `ipc-channels.test.ts`, `statusbar-native-usage.test.ts`.


### M3 items 1 / 3 / 5 (same branch)

Branch guards: `skill-catalog.test.ts`, `skill-tool.test.ts`, `skill-tool-gating.test.ts`, `injection-budget.test.ts`, `path-triggers.test.ts`, `rule-injection.test.ts`, `slash-routing.test.ts`, `tool-registry-manifest.test.ts`, `ipc-channels.test.ts`. Depth: `youcoded/docs/native-runtime.md` → "Skills, rules and injection (M3)".

- **Injection is MESSAGES, never a prompt edit** — skills, path-scoped rules and nested project instructions all arrive as messages; `prompt-assembly.ts` stays byte-stable. · A mid-session prompt change discards the KV cache prefix every local model reuses. · Guard: `rule-injection.test.ts`.
- **Injected content is bounded by the profile, and truncation announces itself** — `injectionBudgetTokens` / `exposeSkillCatalog` come from the REAL window; an unmeasured one is small, except for frontier providers whose window we never discover. · A 600-word rule can blow a small window; a silently cut procedure is worse than none. · Guards: `injection-budget.test.ts`, `capability-profile.test.ts`.
- **`Skill` is CONDITIONAL and deliberately absent from `NATIVE_TOOL_NAMES`** — attached per session only when the profile affords its catalog and skills exist; re-synced on `setBinding`. `/skill-name` works on every model. · Advertising it statically tells the model about a tool it may not have. · Guards: `tool-registry-manifest.test.ts`, `skill-tool-gating.test.ts`.
- **A rule with no `paths:` is SKIPPED, never global** — an eager rule rides every turn, the exact cost item 5 exists to control. · Guard: `path-triggers.test.ts`.
- **`native:*` four-surface parity is only NOW pinned** — `ipc-channels.test.ts` covers shim/Android per-PREFIX and had no `native:*` block until 2026-07-28, so a channel missing from `remote-shim.ts` or `SessionService.kt` passed silently. · Guard: `ipc-channels.test.ts` → "native:* channel parity".

## MCP in native sessions (M3 item 4, phase 1) — guards: `mcp-registry.test.ts`, `mcp-client.test.ts`, `mcp-manager.test.ts`, `mcp-tools.test.ts`, `mcp-gating.test.ts`, `mcp-projection.test.ts`, `mcp-startup-wiring.test.ts`. Depth: `youcoded/docs/native-runtime.md` → "MCP in native sessions".
- **MCP secret plaintext NEVER enters `~/.youcoded/mcp.json`** — only a `secretRef` pointer does; plaintext lives in `SecretsStore` (safeStorage, machine-bound), same split as `providers.json`. · Why: a synced ciphertext is unrecoverable on a second device. · Guard: `mcp-registry.test.ts`.
- **Attachment is WHOLE-SERVER, in registry order, dropping from the END** — never a partial tool set for one server. · Why: a model can't reason about tools it can't see all of. · Guard: `mcp-gating.test.ts`.
- **Grants are PER-TOOL (`mcp__{server}__{tool}`), not per-server** — `permissionSubject` returns `undefined` so "always allow" grants exactly one namespaced tool. · Why: a server update can add a destructive tool with no revocation UI until M5 item 3; a per-server grant would silently cover it too. · Guard: `mcp-tools.test.ts`.
- **`stderr: 'pipe'` on the stdio transport is LOAD-BEARING** — the SDK defaults to `'inherit'`, which would route a failing server's only explanation into the app's own stderr, unreachable by the user. · Guard: `mcp-client.test.ts`.
- **A server's own tool annotations (`readOnlyHint`, `destructiveHint`) are IGNORED** — a server is not a trusted authority about its own danger. · Guard: `mcp-tools.test.ts`.
- **Projection into `~/.claude.json` NEVER overwrites an entry it doesn't own** — ownership is a TOP-LEVEL `_youcodedOwnedMcpServers: string[]` key, not a per-entry marker (CC's tolerance for unknown per-entry keys is unverified). A colliding unowned id is SKIPPED and named in `skippedCollisions`, never adopted. · Guard: `mcp-projection.test.ts`.
