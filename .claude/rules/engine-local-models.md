---
paths:
  - "**/desktop/src/main/engine/**"
  - "**/desktop/src/main/models/**"
  - "**/desktop/test-engine/**"
last_verified: 2026-08-16
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
  - test: youcoded/desktop/tests/cache-scan.test.ts
  - test: youcoded/desktop/test-engine/probe-models.mjs
  - test: youcoded/desktop/test-engine/probe-download.mjs
---

# Local llama.cpp engine + model manager (Plans B + C)

A downloaded, SHA-256-verified `llama-server` in router mode + supervised, plus the in-app model manager (curated catalog, HF search, resumable downloads, GPU-aware fit). **READ `youcoded/docs/engine-dependencies.md` first — every fact below is verified there against b9992. Re-run `test-engine/probe-*.mjs` on every engine bump (any new probe MUST pass `--models-dir`).**

## Engine (Plan B, `src/main/engine/`) — guards: `engine-supervisor.test.ts`, `engine-acquisition.test.ts`, `test-engine/probe-{health,models,chat}.mjs`
- **`--models-dir <cacheDir>` discovers GGUFs — NOT `LLAMA_CACHE`** (vestigial; only `-hf` auto-downloads). Covers bring-your-own GGUFs AND Plan C downloads. Without it, `GET /models` is empty and every completion is 400 `model not found`. Router id = filename minus `.gguf` (== `cache-scan.ts`).
- **`GET /models` `status` is an OBJECT `{value:...}`, not a bare string** — `listModels` reads `row.status.value`. Rows carry no `size` (the cache scan provides it).
- **Engine version is pinned in CODE (`engine-pin.ts`), never in `config.json`** (syncable config can't dictate a per-machine binary to trust). A bump re-runs the probes + re-verifies engine-dependencies.md.
- **Archive layout is per-family AND version-dependent** — Windows `.zip` FLAT, macOS/Linux `.tar.gz` nested under `llama-<tag>/`. Windows unpack MUST use System32 **bsdtar** (`systemTar()`) — Git's GNU tar can't read `.zip`.
- **Atomic install: `.complete` marker written LAST inside a `.unpacking` sibling, then renamed in.** `installed(preferBackend)` steers past a leftover non-booting Vulkan dir after a Vulkan→CPU fallback. **Config is written ONLY after a successful verify-boot.** Falls back to CPU when the backend ships no asset (Windows arm64).
- **`baseUrl()` returns the `/v1`-suffixed URL.** `stop()` is SINGLE-FLIGHT; `ensureRunning()` awaits an in-flight stop. **Idle shutdown never fires mid-stream** (`trackedFetch` holds `inFlight`) — but `stop()` itself does NOT check it, so no other caller may stop a busy engine. Strike-out = 3 crashes / 5 min. Port 9920 built / 9970 dev. App-quit → `stopAll()`.

## Model manager (Plan C, `src/main/models/`) — guards: `model-downloader.test.ts`, `test-engine/probe-download.mjs`
- **Flat-basename cache naming is a probe-pinned contract, single-file AND multi-part** — `model-downloader.ts` writes each HF file under its BASENAME; `probe-download.mjs` asserts the router lists + serves both ids. NEVER rename downloads or change split-part naming without re-running it.
- **Curated list carries NO baked sizes** — the panel computes size + fit LIVE from `models.quants(hfRepo)` (lazy per tier, per-card `loading|ready|unavailable`). Remote list is `schemaVersion`-gated with a shipped-copy fallback. Don't re-add baked sizes.
- **Fit is GPU-AWARE with a safety bias** — VRAM only UPGRADES a verdict, and only for a confidently-probed DEDICATED GPU; integrated GPUs fall back to RAM-only. Windows uses registry `qwMemorySize` / `nvidia-smi`, NEVER `Win32_VideoController.AdapterRAM` (caps at 4 GB).
- **The quant parser DENYLISTS `mmproj*` + `mtp-*` aux files and recognizes `MXFP4(_MOE)`.** Multi-part sets must be COMPLETE before download. Unrecognized tokens drop silently.
- **Delete unloads best-effort, then removes every part + `.partial`.** CUDA opt-in is Windows-x64-only. `engine:set-context` restart nulls `supervisorBinary` (else `rebuildSupervisor` dedups on `binaryPath` and keeps the old `-c`).

- **`listModels()`'s K2 union is LISTING ONLY** — it merges a disk scan into the router's `GET /models` (router rows win), so a disk-only row is a selectable model the router CANNOT serve. Serveability is separate: `ensureServable` (rescan once, re-check, **fail OPEN**) at the local-send chokepoint in `provider-registry.ts`, plus `refreshModels()` after every download and delete.
- **The router re-scans `--models-dir` only when asked: `GET /models?reload=1`** — a post-boot file 400s `model 'X' not found` until then (measured 2026-08-16). **A WRITE, never a poll** — `load_models()` unloads models whose source changed or vanished. Guards: `engine-supervisor.test.ts` → "router rescan" describe, esp. "the background model poll NEVER sends reload=1".
- **A cancelled download keeps its `.partial`** — resume continues it with a Range request (`models:resume`), `models:delete` cleans it up, and the Local Models panel lists it as a partial row with Resume / Delete (shipped 2026-08-27, `7f4d8fd5` + `6d4adf16`; the old `models:orphaned-partials` channel is gone). Guards: `cache-scan.test.ts`, `model-downloader.test.ts`.
