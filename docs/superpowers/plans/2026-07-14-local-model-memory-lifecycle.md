# Local-Model Memory Lifecycle & Load-State UX

**Status:** Planned 2026-07-14. Ships as a SINGLE "fixes" PR against `youcoded` master (per Destin). Native runtime is dormant behind `YOUCODED_NATIVE=1`, so this is safe to land incrementally-but-together.

**Goal:** Make local (llama.cpp) models memory-polite and legible:
1. Unload a model when **no session is using it**.
2. **Block/warn** when creating a session whose model won't fit alongside what's already loaded.
3. **Sleep** idle models after **5 minutes**.
4. A per-session banner when a session's model was unloaded: *"Model unloaded to save memory · [Reload Model]"*.
5. A loading/processing indicator in loading/reloading sessions: model **size**, **load status**, and **token/prompt-processing** rate when available.

**Decisions (Destin, 2026-07-14):**
- **#2:** Hard-block ONLY when the model is *clearly* too large (won't fit even alone). Otherwise **warn** and allow, with an **(i)/"show more"** disclosure explaining memory overflow + LRU eviction.
- **#1 + #3:** Do **both** — immediate unload when the last session using a model closes/switches away, AND a 5-minute idle sleep for still-open-but-idle models.
- **Delivery:** this plan doc, then one combined PR.

---

## Key findings (verified 2026-07-14 on Strix Halo)

**llama-server (b9992) does most of the work natively — we read real state, never guess** (aligns with `docs/error-message-standards.md`):

- **`--sleep-idle-seconds N`** — router auto-sleeps an idle model after N seconds and frees its memory; model reports `status.value: "sleeping"`; next request wakes it. → **#3 is a spawn flag.**
- **`GET /v1/models` → per-model `status.value`** ∈ `unloaded | loading | loaded | sleeping`. → real per-model state for #4/#5.
- **Response `timings`** (`prompt_per_second`, `predicted_per_second`, `prompt_n/ms`, `predicted_n/ms`) + load transition `unloaded→loading→loaded`. → #5 processing status. **No load %** — only the state enum, so loading UI = size + spinner + elapsed, not a progress bar.
- **`POST /models/unload {model}`** → per-model unload lever for #1 (already used once at `engine-manager.ts:272` for delete).
- Benchmark that motivated this: on this box the CPU backend was 2.5–8.6× slower than Vulkan; separately, 128k context + two big models loaded on `--models-max 2` held ~100 GB with nothing freeing it until the 10-min engine-wide idle. This feature makes residency proportional to actual use.

**Architecture gaps to close (from the 2026-07-14 subsystem maps):**
- Engine is **process-global**, one `EngineSupervisor` fronting router-mode `llama-server`. All idle accounting is engine-wide (`engine-supervisor.ts:252-269`, default **10 min**). Only per-model state anywhere is `EngineModel.loaded:boolean` (`engine-types.ts:28-32`), a lossy read of `/models` status that **drops `loading`/`sleeping`**.
- **No session→model tracking of any kind.** A live native session holds its binding on `HarnessSession.binding` (looked up via `NativeSessionHost.getBinding`, `native-session-host.ts:165`), but there is no reverse index and no ref-count. Router LRU (`--models-max 2`) is the only per-model eviction and it is **usage-blind** — it can evict a model another open session still needs.
- **No memory awareness at all.** `estimateFit()` exists (`models/fit-estimator.ts:20`) and `EngineModel.sizeBytes` is available, but nothing reads `os.freemem()` or sums loaded footprint; the create gate (`SessionStrip.tsx:235 nativeCreateBlocked`) checks only provider readiness.
- **No per-model push channel.** Engine-global status is pushed (`engine:status-changed`); per-download is pushed (`models:download-progress`); per-model load state is pushed nowhere.

---

## Design

### Shared infra (built once; powers #1, #3, #4, #5)

**A. Per-model live state.**
- `src/shared/engine-types.ts`: add `export type EngineModelState = 'unloaded'|'loading'|'loaded'|'sleeping';`. Change `EngineModel` from `loaded: boolean` → `state: EngineModelState` (+ keep a derived `loaded` getter only if needed by existing callers; prefer migrating callers). Update `cache-scan.ts` (state `'unloaded'`), `engine-supervisor.ts:337` (map `status.value` → `EngineModelState`, no longer collapse to boolean), and `catalogModels()` (`engine-manager.ts:221`) to carry `state`.
- `EngineSupervisor`: add a lightweight **poller** (~1.5 s while `running`) that `GET /models`, diffs each model's state, and emits `models-changed(EngineModel[])` only on change. Cheap localhost GET; `.unref()` the timer; stop with the engine.
- `EngineManager`: fan out `models-changed`; add `unloadModel(id)` (→ supervisor `POST /models/unload`) and `loadModel(id)` (→ supervisor sends a 1-token warm-up request via `trackedFetch` so the router loads it).
- New IPC: push `engine:models-changed` (`EngineModel[]`) + invoke `engine:models` (initial fetch). 4-surface parity (`ipc-handlers`, `preload`, `remote-shim`, `SessionService.kt` stub) per `.claude/rules/ipc-bridge.md`; add to `ipc-channels.test.ts` parity describe.

**B. Session→model ref-count.**
- `NativeSessionHost`: add `modelRefs: Map<modelId, Set<sessionId>>`. Increment in `wire()` (`native-session-host.ts:54` — the single create/resume choke point), decrement in `destroy()` (before `live.delete`, `:205`), and on `setBinding()` (`:158`) decrement old + increment new.
- Inject an `onModelReleased(modelId)` callback (wired in `ipc-handlers.ts` to `engineManager.unloadModel`). Fire when a model's ref-set becomes empty → **#1**.
- Expose `sessionsForModel(id)` / `modelForSession(id)` so the coordinator can join session ↔ model ↔ state.

**Coordinator (in `ipc-handlers.ts`, near the native host wiring ~`:1866`):** on supervisor `models-changed` OR host ref changes, for each live native session compute its bound model's `EngineModelState` and push `native:model-state {sessionId, state, modelId, sizeBytes}` when it changes. Renderer dispatches to the owning session only — main owns the join, renderer stays dumb.

### #3 — Sleep after 5 minutes
- `engine-supervisor.ts` spawn args: add `'--sleep-idle-seconds', String(SLEEP_IDLE_SECONDS)` with `SLEEP_IDLE_SECONDS = 300` (constant near `MODELS_MAX`, overridable via opts for tests). Verified: router sleeps → `status:"sleeping"` → memory freed → next request wakes.
- Keep the engine-wide 10-min idle stop (fully releases the process); per-model 5-min sleep now frees memory earlier. Document the interplay in `engine-dependencies.md`.

### #1 — Unload when no session uses it
- Driven by infra B's `onModelReleased`. On last session for model X closing OR swapping away, `engineManager.unloadModel(X)` immediately (don't wait for the 5-min sleep). Guard: only unload if the ref-set is truly empty (recount under the same tick). Best-effort; swallow router errors (surface nothing — an unload failure is invisible and harmless, the model just lingers to the 5-min sleep).

### #2 — Memory guard at create (and mid-session swap)
- Pure fn `src/main/models/fit-estimator.ts`: `checkMemoryForLoad({ chosenBytes, freeBytes, vramBytes, loadedBytes }): { verdict: 'ok'|'tight'|'too-large'; headline: string; detail: string }`.
  - `too-large` ("clearly too large") = model can't fit even alone (`estimateFit(chosenBytes, totalMem, vram) === 'too-large'`) → **block**.
  - `tight` = fits alone but `chosenBytes + loadedBytes` exceeds the safe envelope → **warn + (i)**.
  - `ok` otherwise.
  - `detail` is the "show more" copy: plain-language explanation that other loaded models get unloaded (LRU) to make room, and that exceeding physical memory spills to swap and slows generation. No jargon (Destin is non-technical).
- Compute in main: `os.freemem()` for available (NOT `totalmem()`), `detectGpu().totalVramBytes` for VRAM (cached in `ModelManager.vram()`), `loadedBytes` = Σ `sizeBytes` over `supervisor.listModels()` where `state ∈ {loaded, loading}` (sleeping/unloaded already freed).
- New IPC `models:memory-check {modelId}` → the verdict object. Called by `SessionStrip.tsx` on model selection and `ModelPickerPopup.tsx` on swap.
- UI: `SessionStrip` shows a warning row by the native binding picker; extend `nativeCreateBlocked` (`:235`) to also block on `verdict==='too-large'`. The warning row has an **(i)/"Show more"** toggle rendering `detail`. `ModelPickerPopup` reuses its existing inline `nativeError` slot (`:166`).

### #4 — "Model unloaded to save memory · [Reload Model]" banner
- `SessionChatState` (`chat-types.ts:~147`, beside `errorMessage`): add `modelState: EngineModelState | null` (null for non-native). Default null in `createSessionChatState()`; add to `SerializedSessionChatState` (`~:471/495`).
- New action `NATIVE_MODEL_STATE_CHANGED {sessionId, state}` (`chat-types.ts:~232`); reducer sets `modelState` (do NOT route through `AttentionState` — separate concern, like `compactionPending`). `App.tsx` + `BubbleFeed.tsx` subscribe to `native:model-state` and dispatch (identical predicate, per the buddy-window parity rule).
- New `ModelStateBanner.tsx` mounted at the **top of `<div ref={contentRef}>` in `ChatView.tsx` (line 500, before the empty-timeline check)** — session-scoped, scrolls above the first entry. Renders when `modelState ∈ {sleeping, unloaded}`: *"Model unloaded to save memory"* + **[Reload Model]** → `window.claude.models.load(modelId)` (new IPC → `engineManager.loadModel`). Copy is honest for both sleeping (auto, memory saved) and unloaded (evicted).

### #5 — Loading / processing indicator
- Same `ModelStateBanner`: when `modelState==='loading'`, show *"Loading {label} · {sizeGB} GB…"* + spinner + elapsed seconds (no %; llama exposes none). Size from the session's bound `EngineModel.sizeBytes` (carried in the `native:model-state` push).
- Processing rate: HarnessSession already computes `tokensPerSecond` from stream timing (per `provider-dependencies.md`); surface a *"Processing prompt…"* → *"{n} tok/s"* line during the first turn after a (re)load. Keep it lightweight — reuse the per-turn metadata value; do not build a new metrics pipeline.

### Cross-cutting
- **Android parity:** every new channel (`engine:models`, `engine:models-changed`, `native:model-state`, `models:memory-check`, `models:load`) gets a `SessionService.kt` stub in the engine allowlist (`~:3566-3581`) returning `not-implemented-on-mobile` / no-op push. Pin in `ipc-channels.test.ts`.
- **Error messages:** any new failure path follows `docs/error-message-standards.md` (specific, or general + report/diagnose). Unload/load best-effort failures stay silent (harmless).
- **cc/engine dependencies:** add the `--sleep-idle-seconds` flag, the `/models` `status.value` enum, and `/models/unload` + `timings` to `docs/engine-dependencies.md` (version-coupled to b9992).

---

## File-by-file change list (single PR)

**Main / engine**
- `src/shared/engine-types.ts` — `EngineModelState`; `EngineModel.state`.
- `src/main/engine/cache-scan.ts` — `state:'unloaded'`.
- `src/main/engine/engine-supervisor.ts` — `--sleep-idle-seconds 300`; `/models` poller + `models-changed`; map status→state; `unloadModel`/`loadModel` helpers (or expose fetch).
- `src/main/engine/engine-manager.ts` — fan out `models-changed`; `unloadModel(id)`, `loadModel(id)`; `catalogModels()` carries `state`.
- `src/main/harness/native-session-host.ts` — `modelRefs` ref-count in `wire`/`destroy`/`setBinding`; `onModelReleased` callback; `sessionsForModel`/`modelForSession`.
- `src/main/models/fit-estimator.ts` — `checkMemoryForLoad`.
- `src/main/models/model-manager.ts` — expose `memoryCheck(modelId)` joining freemem/vram/loaded footprint.
- `src/main/ipc-handlers.ts` — coordinator (join session↔model↔state → `native:model-state`); new channels `engine:models`, `engine:models-changed`, `native:model-state`, `models:memory-check`, `models:load`; wire `onModelReleased`→`unloadModel`.

**IPC parity**
- `src/main/preload.ts`, `src/renderer/remote-shim.ts`, `src/shared/types.ts` (constants), `app/.../SessionService.kt` (stubs), `desktop/tests/ipc-channels.test.ts` (parity).

**Renderer**
- `src/renderer/state/chat-types.ts` — `modelState` field + `NATIVE_MODEL_STATE_CHANGED` action + serialize.
- `src/renderer/state/chat-reducer.ts` — handler.
- `src/renderer/App.tsx` + `components/BubbleFeed.tsx` — subscribe `native:model-state`, dispatch.
- `src/renderer/components/ModelStateBanner.tsx` — NEW (#4 + #5).
- `src/renderer/components/ChatView.tsx` — mount banner at contentRef top (line 500).
- `src/renderer/components/SessionStrip.tsx` — memory-check on select; block on `too-large`; warning row + (i)/show-more.
- `src/renderer/components/ModelPickerPopup.tsx` — memory-check on swap (reuse `nativeError`).

**Docs / tests**
- `docs/engine-dependencies.md` — sleep flag, status enum, unload, timings.
- Tests: `engine-supervisor.test.ts` (sleep flag arg; status→state mapping; poller diff/emit), `native-session-host.test.ts` (ref-count increment/decrement/swap; `onModelReleased` fires only at zero), `fit-estimator.test.ts` (`checkMemoryForLoad` verdicts), `chat-reducer` (`NATIVE_MODEL_STATE_CHANGED`), `ipc-channels.test.ts` (parity for the 5 new channels).

## Verification
- Unit tests above.
- Live dogfood in a `YOUCODED_NATIVE=1` dev instance on this box: (a) open two native sessions on different models → both load; close one → its model unloads immediately (`/models` shows `unloaded`); (b) leave a session idle 5 min → model `sleeping`, banner shows, [Reload Model] brings it back; (c) select the 122B while the 35B is loaded → warning with (i); select something that can't fit alone → Create blocked; (d) loading a cold model shows size + spinner, then tok/s.

## Out of scope (note, don't build)
- Router LRU is usage-blind; we mitigate via #1 (proactive unload) + #2 (warn before over-committing) but cannot stop the router evicting an in-use model if the user forces a 3rd concurrent model. A session-aware `--models-max` bump or pinning is a possible follow-up.
- No load-progress % (llama-server doesn't expose it).
- Android runtime for native models (Phase 3) — stubs only.
