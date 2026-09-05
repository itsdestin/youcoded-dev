---
status: draft
date: 2026-09-05
type: spec
topic: how the backend serves the approved local-engine screens — chip-gated faster engines with a ROCm set-up path, per-model settings via the router's preset file, a real memory model from GGUF headers, vision downloads in a folder per model, a live hardware line, and the two speed switches
contract: docs/active/design/2026-09-04-local-engine-upgrades/local-engine-upgrades.contract.json
branch: feat/local-engine-upgrades (youcoded)
---

# Local engine upgrades — technical design (build stage 8a)

The UI is decided: 32 contract rows, signed 2026-09-05, mocked on `feat/local-engine-upgrades`
against the fakes in `mock-shim.ts` / `mock-only.ts`. This document says what main must do so
those screens stop being fakes. It re-litigates nothing about the *what*.

Investigation with the measurements behind every number:
`docs/active/investigations/2026-09-04-local-model-runner-audit.md`.

## 0. Ground the branch first

`feat/engine-speed-flags` (unmerged) adds `--spec-default --cache-type-k q8_0` to the spawn
shape and `probe-speed.mjs`. The speed switches here (§B) gate exactly those two flags, so the
build starts by merging that branch INTO `feat/local-engine-upgrades` (both ours, no conflict —
it touches only the supervisor arg list, its test and docs). Master gets both when this one
merges.

## A. Faster engines: chip-gated options, ROCm set-up, CUDA runtime, device check

Rows: R1, R5, R6, R13, R14, R15, R16.

### A1. Assets (`engine-pin.ts`, `scripts/generate-engine-pin.mjs`)
- Add rows for `linux/x64/rocm` (`llama-<tag>-bin-ubuntu-rocm-7.14-x64.tar.gz`, nests under
  `llama-<tag>/`) and `win32/x64/rocm` (`…-bin-win-rocm-7.14-x64.zip`, flat). Both verified to
  exist for b10665 via the release API on 2026-09-04.
- `EngineAsset` gains optional `runtime?: { assetName; sha256; }` — the CUDA rows point at
  `cudart-llama-bin-win-cuda-12.4-x64.zip` (373 MB, flat DLLs). The generator emits it from the
  release's asset list (any asset named `cudart-…-<same cuda tag>-x64.zip`).
- `EngineBackend` already carries `'rocm'` (added for the mockup).

### A2. Acquisition (`engine-acquisition.ts`)
- `install()`: when `asset.runtime` is set, download + sha256-verify + unpack it into the SAME
  `.unpacking` directory before `.complete` is written. One install, one marker; a failure in
  either archive leaves nothing behind (existing atomic path). Progress: the two downloads
  report as one `download` progress with `totalBytes` summed.
- Windows ROCm needs no runtime: the zip bundles `amdhip64_7.dll` and friends (verified by
  listing the b10665 zip). Linux ROCm needs the HOST's ROCm libraries (verified with `ldd`: it
  loads `libamdhip64.so.7`, `libhipblas.so.3`, `librocblas.so.5` from `/opt/rocm/lib`).

### A3. Chip and prerequisite detection — new `src/main/engine/backend-detect.ts`
Pure parsers (unit-tested) + impure probes (never throw, cached per process):
- `detectChip(): { vendor: 'nvidia'|'amd'|'apple'|'intel'|null; name: string|null }`
  - Linux: `/sys/class/drm/card*/device/vendor` (`0x10de` NVIDIA, `0x1002` AMD, `0x8086`
    Intel); name from `nvidia-smi --query-gpu=name` or, for AMD, the first Vulkan device line
    of `llama-server --list-devices` once an engine is installed (see A5).
  - Windows: NVIDIA via `nvidia-smi` (already in `gpu-detector.ts`); AMD via the same
    registry class key's `DriverDesc`/`ProviderName` containing "AMD"/"Advanced Micro Devices".
  - macOS: `'apple'` on arm64 (Metal is already the default; no option offered).
- `rocmPrereqs(): EnginePrereqs` (Linux only): `satisfied` when `ldconfig -p` lists
  `libamdhip64.so.7`, `libhipblas.so`, `librocblas.so` (or all three exist under `/opt/rocm/lib`).
  Distro from `/etc/os-release` `ID`/`ID_LIKE`:
  | family | command |
  |---|---|
  | arch, cachyos, manjaro, endeavouros (`ID_LIKE=arch`) | `sudo pacman -S --needed rocm-hip-runtime hipblas rocblas` |
  | fedora, rhel, nobara (`ID_LIKE` contains fedora/rhel) | `sudo dnf install rocm-hip hipblas rocblas` |
  | ubuntu, debian, mint, pop | **null** — AMD's packages need AMD's repository first (a multi-step install); return `docsUrl` = AMD's "Install ROCm on Ubuntu" quick-start (R16). |
  | anything else | null + `docsUrl` = ROCm install landing page |
  `explainer` is the one sentence the mockup shows. On Windows `rocmPrereqs` returns
  `satisfied: true` (bundled runtime).
- `backendOptions(platform, arch, chip, prereqs, current): BackendOption[]`:
  - NVIDIA + win32/x64 → `cuda` `ready`. (No Linux CUDA asset upstream; nothing offered.)
  - AMD + linux/x64 → `rocm`, `ready` if prereqs satisfied else `needs-prereqs`.
  - AMD + win32/x64 → `rocm` `ready`.
  - Never the backend already installed; never on Apple; never for Intel (SYCL is a later
    roadmap item).
  This is R5/R15: the button exists only when the chip AND (where needed) its software are
  present. `EngineManager.status()` carries `backendOptions` and `deviceName`.

### A4. The device check after install — `EngineManager.setBackend`
After `acquisition.install()` and BEFORE `verifyBoot`, run the new binary with
`--list-devices` (exits immediately, serves nothing; verified on b10665) and parse the
`Available devices:` block. For `cuda`/`rocm` require at least one line whose backend prefix
matches (`CUDA0:` / `ROCm0:`); otherwise `acquisition.discard()` the fresh install and throw
`Kept the current engine: the <BACKEND> build found no graphics chip it can use — "<engine's
own last stderr line>". Nothing was changed.` (R15 wording from the deck). Then `verifyBoot`
as today; config is written only after both pass. `install()` (Vulkan default) is untouched —
its CPU fallback is by design.

### A5. `deviceName`
Parsed from the same `--list-devices` output (first non-CPU device's name, e.g.
`AMD Radeon 8060S Graphics (RADV STRIX_HALO)` → strip the parenthetical). Cached in a sidecar
`<installDir>/devices.json` written at install/switch time so `status()` never spawns a
process. Null → the fact line says "Processor only".

### A6. Set-up flow channels
- `engine:prereqs` (backend) → `EnginePrereqs` (A3).
- `engine:run-in-terminal` (command) → §F (a plain-shell session, the command typed in,
  Enter NOT pressed).
- "Check again" is the renderer calling `engine:prereqs` again, then `engine:set-backend`
  when satisfied (already how the mockup behaves).

Guards: `backend-detect.test.ts` (parsers: vendor ids, os-release → command, `--list-devices`
output → device list, ldconfig → satisfied), `engine-manager.test.ts` (setBackend discards and
throws when the device list has no matching device; runtime asset unpacked into the same
dir), `engine-pin` generator test for the runtime row.

## B. Speed switches

Rows: R4, R17, R18, R19.

- `EngineConfig` gains `speed: { speculative: boolean; compressCache: boolean }`, both
  default `true`; missing keys read as true (a config written before this feature keeps the
  measured defaults).
- Supervisor spawn: `--spec-default` when `speculative`, `--cache-type-k q8_0` when
  `compressCache` (the flags §0 brings in). `engine-supervisor.test.ts` pins both branches.
- `engine:set-speed` (patch) → write config → `restart()` (same path as `setContext`, which
  already nulls `supervisorBinary` so the rebuild picks up new args) → return `status()`.
  R19's "a model in use reloads on its next message" is what a restart already means.

## C. Per-model settings via the router's preset file

Rows: R2, R24, R25, R26.

### C1. Storage
`config.json` → `engine.models: Record<modelId, ModelSettings>` (`contextLength|null`,
`keepLoaded`, `gpuLayers: number|'auto'`, `extraFlags: string`). Absent = defaults = exactly
today's behaviour.

### C2. The preset file the router reads
`--models-preset <cacheDir>/../youcoded-models.ini` (written under `~/.youcoded/`, not in the
GGUF cache — the cache is shared with other llama.cpp tools). INI: one `[<model id>]` section
per model with any non-default setting:
- `c = <contextLength>` when set;
- `n-gpu-layers = <n>` when not `'auto'` (`999` = all, as the Select encodes it);
- `sleep-idle-seconds = -1` when `keepLoaded` (per-model override of the router's default,
  which is what "never put this model to sleep" means);
- extra flags: tokenised `--key value` → `key = value`, bare `--key` → `key = 1`; anything
  that is not `--word` is rejected at save time with a plain message ("Flags look like
  `--name value`"). The router's README (b10665) documents keys as "command-line arguments
  without leading dashes; short forms and env names also accepted".
- The supervisor writes the file before every spawn from the current config, and
  `models:set-settings` rewrites it and then `GET /models?reload=1` + `POST /models/unload`
  for that model, so its next load uses the new values. **Probe-pinned** (`probe-presets.mjs`,
  new): write a section with `c = 4096` for the test model → `/props` for that model reports
  `n_ctx 4096`; a bad flag section → the model's load fails and `GET /models` shows the
  failure text (this is what R26 surfaces: `models:settings` returns
  `lastLoadError: string|null` read from the router row's status).

### C3. Where the per-model context is honoured
`EngineManager.effectiveContextWindow(modelId)` already reads `/props`; the per-model `c`
flows through the router, so no harness change. `contextLengthFor` in the fit path (§D)
reads the setting directly.

Guards: `model-settings.test.ts` (INI writer: escaping, defaults omitted, flag tokeniser
accept/reject), `engine-supervisor.test.ts` (spawn carries `--models-preset` and the file
exists), `probe-presets.mjs` on every engine bump.

## D. Memory: the real model, one number with a breakdown, the remembered warning

Rows: R7, R8, R9, R20, R21, R27–R32.

### D1. GGUF header reader — new `src/main/models/gguf-header.ts`
Pure parser over a `Buffer` (magic, version 3, KV table; stops after the last KV, never reads
tensors) + two loaders: local file (read up to 32 MB) and HTTP Range (`bytes=0-<N>`, growing
32 → 64 MB if the KV table is longer; Hugging Face honours Range — verified, all Qwen3.5-9B
metadata sits inside the first 11 MB). Returns
`{ arch, layers, kvHeads, headDimK, headDimV, trainCtx, sizeBytes? }` from
`<arch>.block_count`, `<arch>.attention.head_count_kv`, `.key_length`/`.value_length`
(fallback `embedding_length / head_count`), `<arch>.context_length`. Hybrid architectures
(Qwen3.5 mixes full-attention and linear layers; Gemma sliding-window layers) make this an
upper bound; the label says "up to" nowhere — the bubble shows the number, the row's verdict
already carries the safety margin.

Cache: per repo (HF) and per file path + mtime (local), in memory for the process.

### D2. Estimator (`fit-estimator.ts`)
- `kvBytes(header, contextLength, kType, vType)` = `layers × kvHeads × (dK×bytes(kType) +
  dV×bytes(vType)) × contextLength` with `f16 = 2`, `q8_0 = 1` (+ ~6% block overhead).
- `estimateFit(modelBytes, totalMem, vram, { contextBytes, visionBytes })` replaces the flat
  `OVERHEAD_BYTES`: need = model + vision + context + 512 MB engine overhead. Returns the
  `breakdown` the UI already renders. The verdict thresholds stay.
- When the verdict is `tight`/`too-large`, `breakdown.advice` = "Lower this model's context
  length in its Settings to shrink this." (R8/S-6; the UI appends it as the bubble's last
  line — a two-line UI change).
- `checkMemoryForLoad` (R7): capacity on Linux = `MemAvailable` from `/proc/meminfo`
  (reclaimable cache counts as free — Destin's condition) capped by the GPU pool on a
  unified-memory machine (`/sys/class/drm/card*/device/mem_info_gtt_total` when the device is
  integrated, see D3); Windows/macOS: `os.freemem()` + a documented note. `loadedBytes` is
  the sum of resident models' `sizeBytes + kvBytes(at their context)`. Headline becomes the
  ONE numbers line (R28): `"<model> GB model + <kv> GB for <ctx>k context, with <loaded> GB
  already loaded."`; `detail` = one sentence.
- `gpu-detector.ts` (Linux): a device whose `mem_info_vram_total` < 8 GiB while
  `mem_info_gtt_total` ≥ 4× that is INTEGRATED (unified memory) → `totalVramBytes: null`,
  new `sharedPoolBytes: gtt_total`. Today the Z13's 4 GiB carve-out passes the 2 GiB
  "dedicated" floor and the fit runs on the wrong path (found 2026-09-04).

### D3. Where the context length comes from
`contextLengthFor(modelId)` = per-model setting (§C) ?? engine `contextSize`. `quants()`
computes each option's breakdown at the engine's context (a not-yet-downloaded model has no
per-model setting); `memoryCheck` and `installedModels` use the model's own.

### D4. The remembered warning (R9, R29)
`config.json` → `engine.memoryWarningsDismissed: Record<modelId, contextLength>`.
`models:dismiss-memory-warning` (modelId, dismissed: boolean) writes/removes the entry at the
model's current context length; `memoryCheck` returns `verdict: 'ok'` for a `tight` verdict
whose entry matches the current context (a changed context asks again — the deck's words).
`too-large` is never dismissible (R31). Guard: `model-manager.test.ts`.

## E. Vision: the projector downloads with the model, into a folder

Rows: R3, R10, R11, R22, R23, R32.

### E1. Listing (`quant-parser.ts`, `hf-client.ts`)
`groupQuantOptions` keeps its denylist for the quant list but ALSO returns the repo's
projector: prefer `mmproj-F16.gguf`, then `BF16`, then the first `mmproj*`. Every
`QuantOption` of that repo carries `visionBytes` and a new `visionFile: { path, size,
sha256 }`. `models:quants` therefore already tells the panel (R32).

### E2. Layout (the probe-pinned contract, extended)
- Text-only models: flat, exactly as today (`probe-download.mjs` unchanged for them).
- A model with a projector: `<cacheDir>/<id>/<id>.gguf` (split parts likewise) +
  `<cacheDir>/<id>/mmproj-F16.gguf`. The router names it by the folder = `<id>` and pairs the
  projector itself (verified live on b10665, 2026-09-04: `/models` reports
  `input_modalities: ["text","image","audio"]`, the child gets `--mmproj`, and an image
  round-trip answered "Red"). `probe-download.mjs` gains the folder case; a new
  `probe-vision.mjs` asserts the modalities and the image answer.
- `cache-scan.ts` scans one level of folders: a folder whose name has a matching
  `<name>.gguf` (or `-00001-of-`) inside is one download; `vision: 'ready'` when an
  `mmproj*` file is present. Manifests and `.partial` files for a folder download live
  INSIDE the folder (the downloader's `cacheDir` becomes `<cacheDir>/<id>` for that set).
- `deleteModel` removes the folder (R10's inverse; the row's Delete copy already says so).

### E3. Knowing a flat model COULD see (`vision: 'available'`)
The completion path today deletes the manifest, so the repo is lost. Write a permanent
`<cacheDir>/<id>.origin.json` `{ repo, quant, visionFile? }` when a download completes (and
for folder downloads inside the folder). `installedModels` reads it: `vision` = folder with
mmproj → `'ready'`; origin has `visionFile` → `'available'`; else `'none'`. Older downloads
with no origin file → `'none'` (R11: nothing new on their row).

### E4. `models:add-vision` (R10)
For an `'available'` model: unload it if resident → create `<cacheDir>/<id>/` → move every
part (`fs.renameSync`, same volume) → download `visionFile` into the folder via the normal
downloader (progress on the same stream, `repo`+`quant` match so the row shows it) →
`GET /models?reload=1` → `refreshModels()`. On failure move the parts back.

### E5. Vision reaches the harness
`EngineSupervisor.listModels()` keeps `architecture.input_modalities` from the router rows;
`CatalogModel.supportsVision` for local rows = includes `'image'`; the vision resolver in
`ipc-handlers.ts` stops returning `null` for `local-engine` and reads the catalog like it
does for OpenRouter. The known "trimmed image still counted as visible" bug
(`docs/roadmap/native-harness.md`) becomes reachable for real — fold its fix in
(`fitToContext` reconciles `shownImages`) as its own task.

## F. "Run in terminal" — a plain-shell session

Row: R1. Every session today launches `claude` (`pty-worker.js` spawns `msg.command`,
`SessionManager.create` hard-codes `'claude'`). Add `SessionProvider = 'claude' | 'native' |
'shell'`: a `shell` session spawns `$SHELL` (Windows: `powershell.exe`) with no args, no hook
pipe, no transcript watcher, terminal view only. `engine:run-in-terminal(command)` creates
one in the current project folder, switches the window to it in terminal view, and writes
the command WITHOUT `\r` — the user reads it and presses Enter; sudo asks for the password
in that terminal. This is also the floor of Destin's "bare Terminal session" roadmap idea
(`docs/roadmap/other-features.md`); the provider-list entry stays roadmap.

Riskiest task in the design: the session strip, the status bar and the hook relay all have
`provider === 'claude'` assumptions to walk. Reviewer attention here.

## G. The live hardware line (R12)

`status()` adds `loadedModelsBytes` (Σ `sizeBytes` of rows in state `loaded`/`sleeping` from
the supervisor's model poll) and `lastReply`: the local-engine fetch in
`provider-registry.ts` already parses the final `timings` frame for prefill progress; it
calls a new `engineManager.recordReply({ promptPerSecond, generatePerSecond })`, which emits
`status-changed`. The card re-renders live through the existing push.

## H. Surfaces, parity, and the fakes

Every new channel — `engine:prereqs`, `engine:run-in-terminal`, `engine:set-speed`,
`models:settings`, `models:set-settings`, `models:add-vision`,
`models:dismiss-memory-warning` — lands on all five surfaces: `ipc-handlers.ts`,
`preload.ts`, `remote-shim.ts`, `remote-server.ts`, `SessionService.kt` (desktop-only stubs,
like `engine:set-backend`), with `ipc-channels.test.ts` extended; then each comes OFF
`mock-only.ts` (`workbench-mock-contract.test.ts` forces this). The fakes stay for the
workbench.

## I. Docs and probes that must move with the code

- `youcoded/docs/engine-dependencies.md`: spawn shape (preset file, conditional speed flags),
  the folder layout, `--list-devices`, the CUDA runtime asset, the ROCm assets.
- `.claude/rules/engine-local-models.md`: the flat-basename contract becomes "flat for
  text-only, folder for vision"; new probes in `verify:`.
- Probes on every engine bump: existing five + `probe-speed` + `probe-presets` +
  `probe-vision`.
- Roadmap: close the seven local-models items this ships; keep the Terminal-session idea.

## J. Simpler than the obvious?

- One preset file, written from config, instead of per-model spawn args — the router already
  does the per-model work.
- One header reader serves fit, memory check and the vision flag; no new HF endpoint.
- No new "device" IPC: `deviceName` rides on `engine:status`, where the card already listens.
- The shell session is the only genuinely new subsystem; everything else extends a file that
  exists.
