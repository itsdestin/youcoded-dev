# Phase 1 — Local Engine + Provider Layer: Design

**Date:** 2026-07-10
**Status:** APPROVED (Destin, 2026-07-10) — section-by-section in session; ready for implementation planning.
**Parent:** `2026-07-09-platform-vision-roadmap.md` (Phase 1). Builds directly on `2026-07-10-phase0-foundations-design.md` §1–3 (native home, provider interfaces, session store) — those sections remain the interface contract; this spec turns them into buildable subsystems.
**Repo:** all code lands in `youcoded/desktop/` (main process + renderer). No Android/Kotlin work beyond inert IPC stubs.

**Goal:** YouCoded runs models. Chat-preset native sessions (no tools yet) work end-to-end against OpenRouter/direct keys and against a locally supervised llama.cpp engine, with in-app model install a non-developer can complete.

---

## 0. Settled decisions (do not relitigate)

1. **Build order is a cloud-first vertical slice** — Plan A (providers + keys + native sessions against OpenRouter) proves the session seam on the simplest provider; Plan B (engine) and Plan C (model manager) then slot in as "just another provider." Rationale: the riskiest integration is the session seam itself; isolating it from engine machinery makes every later engine bug unambiguously an engine bug.
2. **Production stays gated until Phase 2 is complete.** `native.supported` remains false in production builds through all of Phase 1; verification happens in dev builds via `YOUCODED_NATIVE=1`. Users first meet the YouCoded runtime when it can do agentic work, not chat-only.
3. **Unsloth GGUF compatibility is a first-class requirement.** Destin prefers unsloth quants. Curated catalog points at `unsloth/*-GGUF` repos where available; search/downloader must handle dynamic-quant naming (`UD-Q4_K_XL` etc.), multi-part splits, and unsloth's fixed chat templates. Phase 1 acceptance includes a real unsloth download → chat.
4. **Status-bar parity.** Native sessions must feed the existing StatusBar/per-turn-metadata elements (tokens in/out, context, model) via `usage` on `turn-complete` events — plus a native-only tokens/sec stat CC can't provide.
   - **CORRECTION (2026-07-13, Plan A whole-branch review):** the original assumption that this "lights up with zero widget changes" was WRONG. The per-turn **metadata strip** (`AssistantTurnBubble`, `showTurnMetadata`) *does* render native `usage` correctly — that half works. But the **StatusBar chips** (the context / tokens / speed pills) are fed by the main process's `buildStatusData()` from **CC-hook files** (`~/.claude/.session-stats-<id>.json`, `.usage-cache.json`) that native sessions never write — there is no reducer→statusData path for native usage. So the StatusBar chips stay empty for native sessions. **Outstanding work (`native-statusbar-usage`, deferred to Phase 2 / a small dedicated follow-up):** bridge the reducer's per-turn `usage` for the active native session into `status:data` so the StatusBar chips populate the same as CC — likely a renderer→main IPC (mirroring `remote:attention-changed`'s cache-in-main pattern) that folds native usage into `buildStatusData()`. Tracked in `docs/knowledge-debt.md`.
5. **Engine is downloaded on first use, not bundled** (refines the roadmap's "bundle CPU+Vulkan" line — approved in session). Installer stays slim; engine version updates independently of app releases.
6. Standing decisions from the roadmap/ADRs: llama-server router-mode subprocess (ADR 007); AI SDK as the model-access layer (ADR 006); `~/.youcoded/` source of truth (ADR 008); secrets in safeStorage `userData`, never synced; Ollama/LM Studio are optional endpoints, never requirements.

## 1. Decomposition: one spec, three plans

Executed in order; each independently mergeable, each behind the same dormant gate.

| Plan | Delivers | Exit test (dev build, `YOUCODED_NATIVE=1`) |
|---|---|---|
| **A — Providers + native sessions** | NativeHome, secrets store, ProviderRegistry, Providers panel, HarnessSession v0, session store + resume, send-path routing, model picker scoping, Resume Browser | Create a YouCoded-runtime session, chat with an OpenRouter model, restart the app, resume the conversation |
| **B — Local engine** | Engine acquisition (download + verify), EngineSupervisor (spawn/health/crash/idle), `local` provider wired into the registry, `engine-dependencies.md` + `test-engine/` probes | Chat with a hand-placed GGUF through the supervised engine, fully offline |
| **C — Model manager** | Curated catalog + HF search, fit estimates, downloads with progress, Settings → Local Models panel, Ollama/LM Studio detectors | Pick a recommended (unsloth) model in-app, watch it download, chat offline |

## 2. Plan A — providers, keys, native session lifecycle

### 2.1 NativeHome + secrets

- `desktop/src/main/native-home.ts` — the ONE writer module for `~/.youcoded/` (Phase 0 §1 layout). Atomic write + lock patterns from `cas-write.ts` (`mutateFileUnderLock` for read-modify-write; dev instance + built app share the home). Creates the dir lazily on first real write.
- Secrets: `userData/secrets.json`, values encrypted with Electron `safeStorage` at rest, keyed by `secretRef` (ULID). `providers.json` carries only `secretRef` pointers. Machine-bound by construction; never synced. If `safeStorage.isEncryptionAvailable()` is false (rare Linux setups), refuse to store keys with a plain-language message rather than falling back to plaintext.

### 2.2 ProviderRegistry

`desktop/src/main/providers/provider-registry.ts` + `providers/types.ts` (shapes from Phase 0 §2 verbatim).

- **Built-ins (undeletable):** `local` (type `local-engine`; shown "not ready" until Plan B registers the supervisor) and `openrouter`. User-added: `anthropic`, `openai`, `google` (direct keys via first-party `@ai-sdk/*`), and any number of `openai-compatible` custom endpoints (baseUrl + optional key).
- **The one factory:** `languageModel(binding: ModelBinding): LanguageModel`. Internally `createOpenAICompatible` for local/openrouter/custom (+ OpenRouter attribution headers `HTTP-Referer`/`X-Title`), first-party SDK packages for direct keys.
- **Connection test per provider:** a models-list fetch where free, else a 1-token completion; plain-language pass/fail surfaced in the panel.
- **Catalog** (`providers/model-catalog.ts`): models.dev `api.json` + OpenRouter `/api/v1/models`, merged and cached 24h on disk (marketplace-cache pattern), carrying `contextLength`, `supportsTools`, pricing. Local models merge in from Plan B/C. Every external schema we consume gets a `docs/provider-dependencies.md` entry.

### 2.3 HarnessSession v0

`desktop/src/main/harness/harness-session.ts` — Phase 0 §2 interface (`start/send/interrupt/destroy`, emits `transcript-event`).

- v0 loop: AI SDK `streamText`, no tools. System prompt from the built-in **Chat preset** manifest (the only preset shipped in Phase 1; preset picker UI waits for Phase 2 when there's more than one).
- Emits, in order per turn: `user-message` (confirms the optimistic bubble via the existing pending-flag dedup), streaming `assistant-text` deltas (§2.4), optional `assistant-thinking` deltas with `data.text` + `partId` (lights up the dormant reasoning disclosure from PR #115 — both windows already share the predicate), `turn-complete` with `{ model, usage: { inputTokens, outputTokens }, stopReason }`.
- Context assembly v0: full conversation history each call, truncating oldest turns when past the model's context length (from catalog metadata). Real compaction is Phase 2.
- **Status bar (settled decision 4):** `usage` on every `turn-complete` feeds the per-turn metadata strip; the exact `contextLength` from the catalog makes the context gauge a true percentage; tokens/sec computed from stream timing rides a new optional `usage.tokensPerSecond` field. **Plan A reality (see decision 4 correction):** the per-turn metadata strip renders this; the StatusBar *chips* do NOT yet (they read CC-hook files native sessions don't write) — the reducer-usage→`buildStatusData` bridge is the deferred `native-statusbar-usage` follow-up.

### 2.4 Protocol extension: streaming text deltas

CC's transcript path appends whole `assistant-text` blocks. Native streams per-token. Extension: `assistant-text` events MAY carry `data.partId`; the reducer merges same-`partId` deltas into one growing block — the exact semantics `TRANSCRIPT_ASSISTANT_REASONING` already has (PR #115). Events without `partId` keep whole-block append, so the CC path and its parity fixtures are untouched. Rules:

- App.tsx and BubbleFeed.tsx gain the branch in the same commit (documented predicate-parity requirement).
- Reducer tests pin: deltas in → one merged block; interleaved partIds merge independently; no-partId events unchanged.
- New shared fixtures for the delta shape (native-emitter contract, not CC-parser contract).

### 2.5 Send-path routing (the PR #115 catalog)

For `provider === 'native'` sessions:

- **InputBar send → `native:send` IPC** (plain string; none of the PTY 56-byte/echo machinery applies). The one sanitized outgoing string still drives both the optimistic bubble and the send.
- **ESC → `interrupt()`**: aborts the in-flight stream (AbortController through the AI SDK call), emits `user-interrupt` → existing `TRANSCRIPT_INTERRUPT` reducer path ends the turn.
- **Not applicable, and must not fire:** `guardedPtySend`, `useSubmitConfirmation` retry (no PTY echo to time out on — gate it on provider), ChatView Ink-menu keys, ToolCard permission keys, TrustGate, Shift+Tab permission cycle, terminal view (HeaderBar toggle already hidden per PR #115). Each gate is `provider !== 'claude'`-shaped and unit-covered.
- `useAttentionClassifier` already skips native sessions (PR #115); liveness comes from the stream itself (§2.7).

### 2.6 Session store + resume

Phase 0 §3 verbatim: `~/.youcoded/sessions/<cwd-slug>/<id>.jsonl`, header line `{ v:1, sessionId, harnessId, binding, cwd, createdAt, title? }`, then events exactly as emitted, uuid-deduped. Written write-behind via NativeHome's atomic append. `<cwd-slug>` uses `canonicalize()` + our slug helper, not CC's encoding.

- **Resume:** read header → replay events into the reducer (the hydration path both existing adapters proved) → reattach a live HarnessSession with the stored binding. If the stored binding's provider is gone/disabled, open read-only with a "pick a model to continue" affordance.
- **Resume Browser:** native sessions listed alongside CC sessions with a runtime badge; name precedence and topic-file conventions reused so auto-title and the conversation index work unchanged (index entries gain a `provider` tag, not a parallel store).

### 2.7 Error handling

Stream/API failures (bad key, 401/402/429, model removed, network drop, engine crash mid-turn) must never strand `isThinking`:

- HarnessSession catches, emits a turn-ending error event; the reducer path calls `endTurn()` and sets a **new `error` attention state** — reintroduced WITH a dispatcher (the PITFALLS rule that killed the old union member was "no writer"; native sessions are the writer). `AttentionBanner` gains the `error` row: the provider's human-readable message + a retry affordance (re-sends the last user message).
- Update the PITFALLS "three reachable states" bullet in the same commit that adds the state.

### 2.8 Providers settings panel + model picker

- **Settings → Providers:** list with status dot-free plain-language state ("Connected", "Key invalid", "Not configured"); add/edit/remove key flows (consequence-gated removal per Destin's standing UX preference); test-connection button; custom endpoint form (label + baseUrl + optional key).
- **Model picker:** for native sessions, `ModelPickerPopup` un-stubs (PR #115 returns null for native) and scopes to enabled providers' catalogs, grouped by provider, search across all. New-session form: runtime selector's YouCoded option enables (dev-gated); picking YouCoded requires choosing a binding (default: last used).

### 2.9 New IPC surface (Plan A)

`native:send`, `native:interrupt`, `provider:list`, `provider:upsert`, `provider:remove`, `provider:test`, `provider:set-key`, `provider:catalog`, `native:sessions-list` (Resume Browser). Every channel: preload + remote-shim rows, `ipc-channels.test.ts` parity entries, SessionService.kt stub rows returning `{ok:false, error:'not-implemented-on-mobile'}` (established pattern). Remote clients get native chat for free over the existing WS bridge — the events are ordinary chat state.

## 3. Plan B — local engine

### 3.1 Acquisition

`desktop/src/main/engine/engine-acquisition.ts`:

- First enable of local models → download the **pinned** llama.cpp release build for the platform from the official `ggml-org/llama.cpp` GitHub release assets, SHA-256-verified against checksums recorded next to the pin, unpacked to `userData/engine/<version>/`. Progress UI identical in shape to a model download.
- Variants: Windows/Linux → Vulkan build with CPU fallback; macOS → Metal (arm64/x64 per arch); **CUDA opt-in** (a "faster on NVIDIA" offer when `nvidia-smi` is present, never automatic — it's a much larger download).
- Engine version pin + checksums live in one module (`engine/engine-pin.ts`); bumping is a PR that must re-run the `test-engine/` probes. If a download fails mid-way, resume or clean-restart; never leave a half-unpacked dir marked usable.

### 3.2 EngineSupervisor

`desktop/src/main/engine/engine-supervisor.ts` — Phase 0 §2 interface (`ensureRunning/stop/status/baseUrl`, model ops, `crashed` events).

- Spawn `llama-server` router mode: `--host 127.0.0.1 --port <shifted> --no-webui --jinja`, cache dir from `config.json`. Port comes from the existing shifted-port scheme so dev + built instances never collide.
- Health-poll `/health` until ready; bounded crash-restart with backoff (3 crashes within 5 minutes → surface an error state in the Local Models panel, stop retrying until the user acts); **idle shutdown** after ~10 min without requests, transparent auto-restart on next send (first token just arrives slower).
- Router mode owns GGUF discovery/hot-load/LRU-eviction — model switching is free at our layer; we call `/models` to enumerate.
- Registers as the `local` provider's transport in the registry: `languageModel({providerId:'local', modelId})` → `createOpenAICompatible({ baseURL: supervisor.baseUrl() })`, with `ensureRunning()` awaited on first use.
- Tests mirror the archived `opencode-service.test.ts` (mocked subprocess + fetch: ready path, crash/restart, strike-out, idle stop, port conflict).

### 3.3 Coupling registry + probes

Every llama.cpp behavior we depend on — router-mode flags, `/health`, `/models`, `/v1/chat/completions` shapes, cache layout, multi-part naming, `--jinja` template behavior — gets a `docs/engine-dependencies.md` entry naming the consuming file, plus a `test-engine/` smoke probe (sibling of `test-conpty/`, dev-run against the real pinned binary, not CI). Engine bumps re-run the suite — same discipline as CC bumps.

## 4. Plan C — model manager

### 4.1 Curated catalog

- Tiered ladder (small/everyday/coder), each tier sized against detected RAM, pointing at **unsloth GGUF repos** where available. Shipped in-app AND fetched from a raw GitHub URL in the youcoded repo (announcements pattern) so recommendations update without an app release; fetch failure falls back to the shipped copy.
- Entry shape: `{ id, label, hfRepo, quantDefault, quants[], sizeBytes per quant, contextLength, tier, notes }`.

### 4.2 Search + unsloth handling

- HF search: `https://huggingface.co/api/models?filter=gguf&search=…`, then per-repo file listing for quant variants + sizes.
- Quant-name parser handles standard (`Q4_K_M`) and unsloth dynamic (`UD-Q4_K_XL`) names, mapping to plain-language quality/size descriptions; multi-part splits (`-00001-of-000NN.gguf`) recognized and downloaded as a set. Parser is pure + unit-tested with real unsloth filename fixtures.

### 4.3 Fit estimation (honestly scoped)

- RAM via `os.totalmem()`; VRAM detection is vendor-messy → v1 is RAM + GPU-offload heuristic, every label an explicit estimate: "should run well / tight / too large for this machine." Disk-space guard before download. No fake precision; refine in later phases if it matters.

### 4.4 Downloads

- We fetch GGUFs ourselves via HF resolve URLs into the standard llama.cpp cache (router discovery + shared with other tooling): progress events over IPC (MVP pull-progress pattern), resume-on-interrupt, multi-part sets, checksum where HF provides one, cancel + cleanup.

### 4.5 Settings → Local Models panel

- Engine card: status, version, backend ("detected: Vulkan"), GPU backend picker, context-length knob, cache location display.
- Installed models: size/quant/last-used, delete (consequence-gated), set-default-per-tier.
- **Ollama/LM Studio detectors:** probe default localhost ports (11434 `/api/tags`, 1234 `/v1/models`); if found, a one-click "add as endpoint" creates a plain `openai-compatible` provider entry. Never required, never auto-added.

### 4.6 New IPC surface (Plans B+C)

`engine:status`, `engine:install`, `engine:set-backend`, `models:curated` (the §4.1 recommended list — distinct from §2.9's `provider:catalog`, which is the merged cloud catalog), `models:search`, `models:download`, `models:download-progress` (push), `models:delete`, `models:installed`, `endpoints:detect`. Same parity + Android-stub discipline as §2.9.

## 5. Testing

- **Unit:** ProviderRegistry (CRUD, secretRef indirection, a never-plaintext assertion over the written files), NativeHome atomic writes/locks, session-store round-trip (write → replay → deep-equal reducer state), catalog merge/cache, fit estimator, quant parser (unsloth fixtures), send-path gates.
- **Supervision:** EngineSupervisor with mocked subprocess + fetch (ready/crash/restart/strike-out/idle/port-conflict).
- **Protocol:** native emitter validated against the `TranscriptEventType` shapes; new fixtures pin the `partId` delta merge; reducer tests for merge semantics + the `error` attention state + endTurn integration.
- **IPC parity:** every new channel in `ipc-channels.test.ts` (preload/remote-shim/SessionService stub).
- **Live acceptance (dev build):** Plan A — OpenRouter chat + restart + resume; Plan B — offline chat with a hand-placed GGUF; Plan C — in-app **unsloth** download → offline chat; per-turn metadata strip shows tokens/context/speed throughout (StatusBar *chips* land with the `native-statusbar-usage` follow-up — see decision 4).

## 6. Explicitly out of scope

No tools, permissions, skills, or MCP in native sessions (Phase 2). No preset picker UI (one preset ships; picker comes with Phase 2's preset family). No Android/Kotlin beyond inert stubs (Phase 5). No `~/.claude` → `~/.youcoded` migration (Phase 3). No sync of native sessions (joins sync scope later). No CUDA auto-install. No custom harness authoring UI (Phase 3). Production `native.supported` stays false until Phase 2 completes.

## 7. Documentation obligations (ship with the code, not after)

- `docs/engine-dependencies.md` + `docs/provider-dependencies.md` populated as couplings are built (skeletons exist from Phase 0).
- PITFALLS: update the `AttentionState` "three reachable states" bullet when `error` lands; new invariants (secrets never plaintext, partId merge semantics, engine pin discipline) get entries as they ship.
- Roadmap Progress line updated at each plan merge.
