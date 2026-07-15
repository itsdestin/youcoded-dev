---
paths:
  - "youcoded/desktop/src/main/engine/**"
  - "youcoded/desktop/src/main/models/**"
  - "youcoded/desktop/test-engine/**"
last_verified: 2026-07-15
verify:
  - path: youcoded/desktop/src/main/engine/engine-supervisor.ts
    contains: "models-dir"
  - path: youcoded/desktop/src/main/engine/engine-pin.ts
  - path: youcoded/desktop/src/main/models/model-downloader.ts
  - path: youcoded/docs/engine-dependencies.md
  - test: youcoded/desktop/tests/engine-supervisor.test.ts
  - test: youcoded/desktop/tests/engine-acquisition.test.ts
  - test: youcoded/desktop/tests/engine-manager.test.ts
  - test: youcoded/desktop/tests/model-downloader.test.ts
  - test: youcoded/desktop/test-engine/probe-models.mjs
  - test: youcoded/desktop/test-engine/probe-download.mjs
---

# Local llama.cpp engine + model manager (Plans B + C)

A downloaded, SHA-256-verified `llama-server` spawned in router mode + supervised, plus the in-app model manager (curated catalog, HF search, resumable downloads, GPU-aware fit). Dormant behind `YOUCODED_NATIVE=1`. **READ `youcoded/docs/engine-dependencies.md` before touching the engine — every fact below is verified there against `llama-server` b9992. Re-run the `test-engine/probe-*.mjs` probes on every engine bump (any new probe MUST pass `--models-dir`).**

## Engine (Plan B, `src/main/engine/`) — guards: `engine-supervisor.test.ts`, `engine-acquisition.test.ts`, `test-engine/probe-{health,models,chat}.mjs`
- **`--models-dir <cacheDir>` is what discovers GGUFs — NOT `LLAMA_CACHE`** (vestigial; only tracks `-hf` auto-downloads). Covers BOTH bring-your-own GGUFs AND Plan C's flat downloads. Without it, `GET /models` is empty and every completion is HTTP 400 `model not found`. The router-served id = filename minus `.gguf` (== `cache-scan.ts`).
- **`GET /models` `status` is an OBJECT `{value:...}`, not a bare string** — `listModels` reads `row.status.value`. Rows carry no `size` (the cache scan provides it).
- **Engine version is pinned in CODE (`engine-pin.ts`), never in `config.json`** (syncable config can't dictate a per-machine binary to trust). A bump re-runs the probes + re-verifies engine-dependencies.md.
- **Archive layout is per-family AND version-dependent** — Windows `.zip` FLAT, macOS/Linux `.tar.gz` nested under `llama-<tag>/`. `engine-acquisition`'s post-unpack existence check fails loudly. Windows unpack MUST use System32 **bsdtar** (`systemTar()`) — Git's GNU tar can't read `.zip`.
- **Atomic install: `.complete` marker written LAST inside a `.unpacking` sibling, then renamed in.** `installed(preferBackend)` steers past a leftover non-booting Vulkan dir after a Vulkan→CPU fallback. **Config is written ONLY after a successful verify-boot.** Install falls back to CPU when the backend ships no asset (Windows arm64 has no Vulkan).
- **`EngineSupervisor.baseUrl()` returns the `/v1`-suffixed URL.** `stop()` is SINGLE-FLIGHT; `ensureRunning()` awaits an in-flight stop (no stale URL / no second server on the port). Idle shutdown NEVER fires mid-stream (`trackedFetch` holds an `inFlight` count). Crash strike-out = 3 crashes / 5 min → `error` until Restart. `ENGINE_PORT` rides the shifted-port scheme (9920 built / 9970 dev). App-quit → `engineManager.stopAll()`.

## Model manager (Plan C, `src/main/models/`) — guards: `model-downloader.test.ts`, `test-engine/probe-download.mjs`
- **Flat-basename cache naming is a probe-pinned contract for single-file AND multi-part models** — `model-downloader.ts` writes each HF file under its BASENAME. `probe-download.mjs` downloads a real GGUF, splits it, and asserts the router lists + serves both ids. NEVER rename downloaded files or change split-part naming without re-running it.
- **Curated list carries NO baked sizes** — a `CuratedModel` is `{id,label,hfRepo,quantDefault,...}`; the panel computes size + fit LIVE from `models.quants(hfRepo)` (lazy per tier, per-card `loading|ready|unavailable`). Remote list is `schemaVersion`-gated with a shipped-copy fallback. Don't re-add baked sizes.
- **Fit is GPU-AWARE with a safety bias** — VRAM only UPGRADES a verdict, and only for a confidently-probed DEDICATED GPU; integrated GPUs fall back to RAM-only. Windows uses registry `qwMemorySize` / `nvidia-smi`, NEVER `Win32_VideoController.AdapterRAM` (caps at 4 GB).
- **The quant parser DENYLISTS `mmproj*` + `mtp-*` aux files and recognizes `MXFP4(_MOE)`.** Multi-part sets must be COMPLETE before download. Unrecognized tokens drop silently (re-admitting re-admits aux pollution).
- **Delete unloads best-effort, then removes every part + `.partial`.** CUDA opt-in is Windows-x64-only. `engine:set-context` restart nulls `supervisorBinary` (else `rebuildSupervisor` dedups on `binaryPath` and keeps the old `-c`).

**Known open items (deferred, tracked in ROADMAP):** router hot-reload of `--models-dir` after boot is unverified (Amendment K2) — a model downloaded after boot may need an engine restart to appear in `catalogModels()`; and `.partial` files orphaned by an app restart aren't surfaced (needs a cache-scan IPC).
