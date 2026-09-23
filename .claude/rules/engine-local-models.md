---
paths:
  - "**/desktop/src/main/engine/**"
  - "**/desktop/src/main/models/**"
  - "**/desktop/test-engine/**"
  - "**/desktop/scripts/generate-engine-pin.mjs"
  - "**/desktop/src/shared/engine-types.ts"
  - "**/desktop/src/main/providers/provider-registry.ts"
last_verified: 2026-09-06
verify:
  - path: youcoded/desktop/src/main/engine/engine-supervisor.ts
    contains: "models-dir"
  - path: youcoded/desktop/src/main/engine/engine-pin.ts
    contains: "ARG_ALIASES"
  - path: youcoded/desktop/scripts/generate-engine-pin.mjs
  - path: youcoded/desktop/src/shared/engine-types.ts
  - path: youcoded/desktop/src/main/engine/model-presets.ts
    contains: "models.ini"
  - path: youcoded/desktop/src/main/models/model-downloader.ts
  - path: youcoded/desktop/src/main/models/gguf-header.ts
  - path: youcoded/desktop/src/main/engine/rocm-prereqs.ts
  - path: youcoded/docs/engine-dependencies.md
  - test: youcoded/desktop/tests/engine-supervisor.test.ts
  - test: youcoded/desktop/tests/engine-acquisition.test.ts
  - test: youcoded/desktop/tests/engine-manager.test.ts
  - test: youcoded/desktop/tests/model-downloader.test.ts
  - test: youcoded/desktop/tests/cache-scan.test.ts
  - test: youcoded/desktop/tests/model-presets.test.ts
  - test: youcoded/desktop/test-engine/probe-models.mjs
  - test: youcoded/desktop/test-engine/probe-download.mjs
  - test: youcoded/desktop/test-engine/probe-presets.mjs
  - test: youcoded/desktop/test-engine/probe-vision.mjs
---

# Local llama.cpp engine + model manager (Plans B + C)

A supervised, SHA-256-verified `llama-server` in router mode, plus the model manager. Guards: the `verify:` list. **READ `youcoded/docs/engine-dependencies.md` first — every fact below is verified there against b10665. On a bump re-run the NINE bump-gate probes `test-engine/README.md` names (not all twelve); a new one MUST pass `--models-dir`.**

## Engine (Plan B, `src/main/engine/`)
- **`--models-dir <cacheDir>` discovers GGUFs — NOT `LLAMA_CACHE`** (vestigial). Without it `GET /models` is empty and every completion 400s. Router id = filename minus `.gguf` (== `cache-scan.ts`) — **except a vision model, named by its FOLDER**.
- **`models.ini` (`--models-preset`) is the most dangerous file the app writes** — one bad key or unparsable line is FATAL at startup, killing EVERY local model at the next spawn with nothing on screen. Write it ONLY through `model-presets.ts` (key grammar, reserved denylist, `#`/`;` refusal, sections only for scanned ids); the supervisor retries without the bad section, then without the file.
- **Context length and auto-sleep live in the preset's `[*]`, never on the command line** — the router's args merge OVER every preset, so a returning `-c` silently defeats every per-model value.
- **The engine version is pinned in CODE (`engine-pin.ts`), never `config.json`** — a synced pin would tell another machine to trust a binary it never verified. `config.json`'s `engine` section is PER-MACHINE (cache dir, backend, speed switches, per-model settings, dismissed warnings); nothing syncs it.
- **Atomic install: `.complete` written LAST inside a `.unpacking` sibling, then renamed in**; it freezes this build's `--list-devices` output, which the estimator and the card read. **Config is written only after a successful verify-boot.**
- **`baseUrl()` is `/v1`-suffixed.** `stop()` is SINGLE-FLIGHT. **Idle shutdown never fires mid-stream** (`trackedFetch` holds `inFlight`) — `stop()` does NOT check it. Strike-out = 3 crashes / 5 min. Port 9920 built / 9970 dev.

## Model manager (Plan C, `src/main/models/`)
- **Flat-basename cache naming is a probe-pinned contract, single- AND multi-part — except a vision model**, which downloads into `<cacheDir>/<id>/` beside its `mmproj*.gguf`: the router pairs `--mmproj` only inside ONE subdirectory. Two levels deep is invisible; a flat-file/folder collision has NO predictable winner. Never rename downloads or restructure split parts without re-running both probes.
- **The memory pool is the ENGINE's own first GPU device** (`poolFromDevices`, off the marker), so an integrated GPU scores against its real pool; `gpu-detector`'s VRAM probe is only the FALLBACK, biased to null (→ RAM-only). Working memory comes from the GGUF header, never a flat allowance.
- **The quant parser keeps `mmproj*` + `mtp-*` off the quant LIST but RETURNS the projector**, so every quant carries it.
- **Faster-engine opt-in:** CUDA on Windows x64 / NVIDIA (a SECOND `cudart-` archive unpacks into the same directory); ROCm on Windows x64 and Linux x64 / AMD, with the chip's gfx target checked against THAT ROW's list on LINUX ONLY. **`rocm-prereqs.ts` does not gate the offer** — it picks the BUTTON: "Set up" when AMD's software is missing, "Switch" when it is there.
- **`engine:set-context` no longer restarts anything** — context is a preset value applied with `?reload=1`. Only a SPEED switch respawns, and it still nulls `supervisorBinary` (else `rebuildSupervisor` dedups on `binaryPath`, keeping the old flags).
- **`listModels()`'s K2 union is LISTING ONLY** — a disk-only row is selectable but unservable. Serveability is `ensureServable` (rescan once, re-check, **fail OPEN**) at the local-send chokepoint in `provider-registry.ts`, plus `refreshModels()` after every download and delete. A cancelled download keeps its `.partial`.
- **The router re-scans `--models-dir` only on `GET /models?reload=1`** — a post-boot file 400s until then. **A WRITE, never a poll**: it unloads models whose source changed or vanished.
