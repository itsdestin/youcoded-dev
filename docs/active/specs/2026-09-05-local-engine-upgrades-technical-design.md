---
status: draft
date: 2026-09-05
type: spec
topic: how the backend serves the approved local-engine screens — chip-gated faster engines with a ROCm set-up path, per-model settings via the router's preset file, a real memory model from GGUF headers, vision downloads in a folder per model, a live hardware line, and the two speed switches
contract: docs/active/design/2026-09-04-local-engine-upgrades/local-engine-upgrades.contract.json
branch: feat/local-engine-upgrades (youcoded)
reviews:
  - docs/active/reviews/2026-09-05-local-engine-upgrades-design-review-1.md
  - docs/active/reviews/2026-09-05-local-engine-upgrades-design-review-2.md
---

# Local engine upgrades — technical design (build stage 8a, after review round 2)

The UI is decided: 32 contract rows, signed 2026-09-05, mocked on `feat/local-engine-upgrades`
against the fakes in `mock-shim.ts` / `mock-only.ts`. This document says what main must do so
those screens stop being fakes. It re-litigates nothing about the *what*. Two review rounds
(50 findings accepted, 1 reversal) reshaped it; each change cites its finding. Everything
marked **probed** was checked against the installed b10665 on 2026-09-05.

Investigation with the measurements behind every number:
`docs/active/investigations/2026-09-04-local-model-runner-audit.md`.

## 0. Ground the branch first — done

`feat/engine-speed-flags` (`--spec-default --cache-type-k q8_0` + `probe-speed.mjs`) was
merged into `feat/local-engine-upgrades` on 2026-09-05.

## Storage: one file, one honest comment (R2-21 reverses R1-20; R1-21, R1-23, R2-4, R2-20)

- `~/.youcoded/config.json` `engine.*` grows. Its header comment currently calls the file
  "syncable"; nothing syncs it today and `backend` / `cacheDir` are already per-machine, so the
  comment is corrected to "the `engine` section is per-machine" and the new keys join it:
  ```
  engine: {
    cacheDir, backend, contextSize,                       // as today
    speed: { speculative: true, compressCache: true },
    models: { [modelId]: { contextLength: number|null, keepLoaded: boolean,
                          gpuLayers: number|'auto', extraFlags: string,
                          memoryWarningDismissedAt: number|null,
                          pendingApply?: true } } }
  ```
  Missing keys = the defaults above = today's behaviour. Written through the existing locked
  `mutateJson`.
- **The download manifest stays after completion**, gaining `completedAt` and
  `visionFile?: { path, size, sha256 }`. Three code paths that read presence as "unfinished"
  or delete it are changed to read `completedAt` (R2-4): `installedModels()`'s cleanup,
  the downloader's completion step (writes `completedAt` instead of removing), and `resume()`
  plus the prior-repo guard in `ModelDownloader.start` (a complete manifest is neither
  resumable nor "partly downloaded"; a re-download keeps `visionFile`). Pre-feature downloads
  have no manifest at all — see the backfill in E3 (R2-20).
- On-disk additions for `docs/MAP.md` → "On-disk state": `~/.youcoded/engine/models.ini`,
  `<cacheDir>/<id>/` folders, the header cache beside `curated-models-cache.json` in userData.

## A. Faster engines: chip-gated options, ROCm set-up, CUDA runtime, device check

Rows: R1, R5, R6, R13, R14, R15, R16.

### A1. Assets (`engine-pin.ts`, `scripts/generate-engine-pin.mjs`)
- Rows for `linux/x64/rocm` (`…-bin-ubuntu-rocm-7.14-x64.tar.gz`, nests under `llama-<tag>/`)
  and `win32/x64/rocm` (`…-bin-win-rocm-7.14-x64.zip`, flat; contains `llama-server.exe` and
  `amdhip64_7.dll` — verified by listing the b10665 zip).
- `EngineAsset.runtime?: { assetName; sha256 }` — the CUDA rows point at
  `cudart-llama-bin-win-cuda-12.4-x64.zip`. The generator emits it from the release's assets.
- `EngineAsset.gfxTargets?: string[]` on ROCm rows — the build's compiled AMD targets from
  upstream's release workflow, pasted by the generator (b10665 Linux: gfx908, 90a, 942, 950,
  1010–1036, 1100–1102, 1150–1152, 1200, 1201). The bump procedure gains "re-check the ROCm
  target list". (R1-2)
- `EnginePin.argAliases: Record<string, string>` — the binary's CLI alias table (`c` →
  `ctx-size`, `ngl`/`gpu-layers` → `n-gpu-layers`, `LLAMA_ARG_N_GPU_LAYERS` → …), generated
  from `--help` at bump time; §C2 normalises preset keys through it. (R2-8)
- `engine-config.ts`: `BACKENDS` gains `'rocm'` with a pinning test. (R1-29)

### A2. Acquisition (`engine-acquisition.ts`) (R2-5)
- `install()`: when `asset.runtime` is set, download + sha256-verify + unpack it into the
  SAME `.unpacking` directory. Then, **for every backend**, run the unpacked binary with
  `--list-devices`, parse the `Available devices:` block, and write the result into the
  `.complete` marker as `devices: [{ backend, name, totalMiB, freeMiB }]` — all before the
  atomic rename. Progress: one `download` stream with `totalBytes` summed over both archives.
- `installed()` backfills a marker lacking `devices` once, lazily, the first time `status()`
  reads it (spawning `--list-devices` on that binary), so existing installs get a pool too.
- `llvmpipe` / `SwiftShader` device names are classified CPU (R2-12).

### A3. Chip, target and prerequisite detection — in `gpu-detector.ts` (R1-22)
`detectGpu()` grows `vendor: 'nvidia'|'amd'|'apple'|'intel'|null` and `gfxTarget: string|null`.
- Linux: vendor from `/sys/class/drm/card*/device/vendor`; `gfxTarget` from
  `/sys/class/kfd/kfd/topology/nodes/*/properties` `gfx_target_version` (110501 → `gfx1151`,
  which is what the Z13 reads; the node reading `0` is the CPU).
- Windows: NVIDIA via `nvidia-smi`; AMD via the display-class registry key's `DriverDesc` /
  `ProviderName`; `gfxTarget` null.
- macOS: `'apple'` on arm64.
New pure module `src/main/engine/rocm-prereqs.ts` (Linux only): `satisfied` when `ldconfig -p`
lists `libamdhip64.so.7`, `libhipblas.so`, `librocblas.so` (or all three under `/opt/rocm/lib`).
Distro from `/etc/os-release` `ID` / `ID_LIKE`:
| family | command |
|---|---|
| arch, cachyos, manjaro, endeavouros (`ID_LIKE` arch) | `sudo pacman -S --needed rocm-hip-runtime hipblas rocblas` |
| fedora, rhel, nobara (`ID_LIKE` fedora/rhel) | `sudo dnf install rocm-hip hipblas rocblas` |
| ubuntu, debian, mint, pop | null — AMD's packages need AMD's repository first; `docsUrl` = AMD's Ubuntu quick-start (R16) |
| anything else | null + `docsUrl` = the ROCm install landing page |
On Windows `satisfied: true`.

`backendOptions(...)`: NVIDIA + win32/x64 → `cuda` `ready`. AMD + linux/x64 → `rocm` only when
`gfxTarget` ∈ the pin's `gfxTargets` (R1-2), `ready` if prereqs satisfied else
`needs-prereqs`. AMD + win32/x64 → `rocm` `ready`. Never the installed backend; never Apple or
Intel. `status()` carries `backendOptions` and `deviceName` (the first GPU device's name from
the marker, parenthetical stripped; null → "Processor only").

### A4. The device check after install — `EngineManager.setBackend` (R2-7, R2-12)
`acquisition.install()` (which now records devices). Then: for `cuda` / `rocm`, the marker must
list a device with the matching prefix (`CUDA0:` / `ROCm0:`), or the install is discarded —
**only if this call created it** (the `preexisting` guard `installAndVerify` already has) —
with `Kept the current engine: the <BACKEND> build found no graphics chip it can use —
"<the engine's last stderr line>". Nothing was changed.` A binary that fails to START
(missing `libamdhip64.so.7`, a linker error) gets its own sentence quoting the real stderr,
not the "no graphics chip" one. Then `verifyBoot`. **Then a real load** of the smallest
complete model in the cache (`max_tokens: 1`): a failure whose text names a device or kernel
image (`no kernel image`, `invalid device function`, `hipErrorNoBinaryForGpu`, `CUDA error`)
discards a this-call install with the same sentence and the router's error text; any other
load error (corrupt GGUF, unsupported arch, OOM) is reported and nothing is discarded. No
model on disk → the load step is skipped and the Faster-engine row's description says
"Checked when your first model loads". Config is written only after every check passes.
`install()` (Vulkan default) is untouched — its CPU fallback is by design.

### A5. Set-up flow channels
- `engine:prereqs` (backend) → `EnginePrereqs`.
- `engine:run-in-terminal` (command) → `{ sessionId }` (§F); the renderer, desktop or remote,
  selects that session itself (R1-34).
- "Check again" = renderer calls `engine:prereqs` again, then `engine:set-backend`.

Guards: `gpu-detector.test.ts` (vendor ids, kfd → gfx target), `rocm-prereqs.test.ts`,
`engine-acquisition.test.ts` (runtime archive into the same dir; devices in the marker;
llvmpipe classified CPU), `engine-manager.test.ts` (set-backend: no matching device → discard
+ sentence; device-class load error → discard; model-class load error → report only;
preexisting install never discarded; lazy marker backfill), generator test (runtime row,
gfx list, alias table).

## B. Speed switches and one engine-config channel (R1-3, R1-33, R2-24)

Rows: R4, R17, R18, R19.
- `speed` lives in `config.json` `engine.speed`.
- The supervisor **reads config at every spawn** (a `readConfig()` callback replaces frozen
  constructor values) — that is what makes a restart pick up new flags (R1-3). Spawn adds
  `--spec-default` when `speculative`, `--cache-type-k q8_0` when `compressCache`.
  `engine-supervisor.test.ts` pins both branches, and pins that `-c` and
  `--sleep-idle-seconds` are NO LONGER on the command line (they moved into the preset, §C2).
- **One channel `engine:set-config(patch)`** with `{ contextSize?, speed? }`. `speed` →
  write + restart (stop, `supervisorBinary = null`, respawn). `contextSize` → write + rewrite
  `[*]` + `?reload=1` under the idle rule of §C2 — no process restart (R2-24).
  `engine:set-context` stays as a thin alias for existing callers (Android stub included).

## C. Per-model settings via the router's preset file

Rows: R2, R24, R25, R26.

### C1. Storage — `config.json` `engine.models[modelId]` (above).

### C2. The preset file (R1-1, R1-12, R1-26, R1-32, R1-13, R2-6, R2-8, R2-23 — **probed**)
Path `~/.youcoded/engine/models.ini`, passed as `--models-preset <abs path>`.

**Verified on b10665, 2026-09-05:** the `[*]` global section is honoured (its `ctx-size 4096`
and `sleep-idle-seconds 77` reached the model child), a per-model section overrides it
(`ctx-size 2048` beat the global 4096) while still inheriting the other global keys, and a
model with its own section reports `source: preset` in `GET /models` (no section → `models_dir`).
The command line outranks the preset (source: `server-models.cpp` merges the CLI preset over
the per-model one), so the engine-wide values a model may override MOVE OFF the command line:
```
[*]
ctx-size = 32768
sleep-idle-seconds = 300

[gemma-4-E2B-it-Q8_0]
ctx-size = 16384
sleep-idle-seconds = -1
n-gpu-layers = 24
temp = 0.6
```
Long key forms only. The CLI keeps router-only flags: `--host --port --no-webui --jinja
--models-dir --models-max --models-preset` plus the two speed flags.

Per-model keys: `ctx-size` when set; `n-gpu-layers` when not `'auto'` (`999` = all);
`sleep-idle-seconds = -1` when `keepLoaded`; extra flags tokenised `--key value` → `key =
value`, bare `--key` → `key = 1`. Every key is first normalised through the pin's
`argAliases` (R2-8), then rejected at save time with a plain message if it is not shaped
`--word` or is **reserved**: `host port model models-dir models-preset models-max mmproj alias
ctx-size n-gpu-layers sleep-idle-seconds` (R1-13). Sections are emitted **only for ids present
in the cache scan** (a stale section would resurrect a deleted model as a ghost row — probed,
`source: preset`), and `deleteModel` prunes `engine.models[id]` (R2-6).

**Writing and applying (R1-8, R2-2, R2-3):** a settings save writes `engine.models[id]` with
`pendingApply: true` and does NOT touch `models.ini` yet — every `?reload=1` (downloads,
deletes, `refreshModels()`) diffs presets and unloads a changed model mid-reply. The apply
step runs when that model has **no in-flight request**: `trackedFetch` counts requests per
model by reading `model` from the request body (the engine-wide `inFlight` and the session
ref-count are NOT the signal — a model with an open chat never releases its ref). Apply =
write `models.ini` from config (pending included, flag cleared) → `GET /models?reload=1` →
`POST /models/unload` for the changed model(s). Bounded: at the next idle moment, or after
10 minutes regardless; the dialog's footer says "Applies after the current reply" while
pending. The supervisor also writes `models.ini` before every spawn.
`ModelSettings.lastLoadError: string|null` = the router row's failure text when the model's
last load failed (R26).

**Keep loaded vs the app's own timers** (R1-4, R2-11): the engine idle stop (`idleMs`) is
skipped while any resident model is keep-loaded; the last-session release handler
(`setModelReleasedHandler → unloadModel`) skips keep-loaded models; `--models-max 2` LRU
eviction still applies when a third model loads — the (i) and the row hint say so.

Guards: `model-presets.test.ts` (writer: `[*]` values, omitted defaults, only present ids,
escaping; tokeniser + alias normalisation + reserved keys), `engine-supervisor.test.ts`
(`--models-preset` on the spawn, no `-c`, no `--sleep-idle-seconds`; idle stop skipped with
a keep-loaded model; per-model in-flight counting), `engine-manager.test.ts` (release handler
skips keep-loaded; delete prunes the section; pending apply waits and is bounded),
`probe-presets.mjs` on every bump (the three probed facts above, plus a bad-flag section
surfacing its error in `GET /models`).

### C3. Where the per-model context is honoured (R2-1 — **probed**)
`effectiveContextWindow(modelId)` fetches **`/props?model=<id>`** (the child's real `n_ctx`;
the bare `/props` is the router's dummy and answers `0` even with a model loaded). Unloaded
model → no child → fall back to `contextLengthFor(modelId)` = per-model setting ??
`engine.contextSize`, never the bare `contextSize`.

## D. Memory: the real model, one number with a breakdown, the remembered warning

Rows: R7, R8, R9, R20, R21, R27–R32.

### D1. GGUF header reader — new `src/main/models/gguf-header.ts` (R1-10, R1-24, R1-25, R2-9, R2-22)
Pure parser over a `Buffer` (magic, version 3, KV table) + two loaders: local file, and HTTP
Range in **1 MB steps, stopping as soon as the keys below are parsed** (the architecture keys
precede the tokenizer arrays in convert-emitted files; `probe-headers.mjs` pins that on the
curated repos). Keys: `<arch>.block_count`, `.attention.head_count_kv`, `.attention.key_length`
/ `.value_length` (fallback `embedding_length / head_count`), `.context_length`,
`.attention.sliding_window`, `.attention.sliding_window_pattern`, `.full_attention_interval`.
**One header per repo** (default quant's first file), persisted beside
`curated-models-cache.json` in userData as `gguf-headers-cache.json`, keyed by repo +
default-quant sha (HF) or path + mtime (local).

### D2. Estimator (`fit-estimator.ts`) (R1-6, R1-7, R1-10, R1-25, R2-9, R2-10)
- Layer map: `full_attention_interval = n` → layers with `il % n != n-1` are recurrent/linear
  and contribute **0 KV** (Qwen3.5 family); `sliding_window_pattern` → sliding layers keep
  `min(context, slidingWindow)` tokens, with the `dense_first` rule pinned per arch against
  llama.cpp's `llama-hparams.cpp` in `gguf-header.test.ts` (Gemma 3/4); no key → every layer
  full. A family the reader does not recognise counts every layer full and sets
  `contextBytesIsUpperBound: true`; the bubble then says "up to" (R1-25).
- `kvBytes` per kept token = `kvHeads × (dK×bytes(kType) + dV×bytes(vType))`, `f16 = 2`,
  `q8_0 = 1`, +6 % block overhead.
- **The verdict formula (R2-10):** `need = model + vision + kv + 512 MB`. Pool side: `need ≤
  (pool − loadedBytes) × 0.9` fits, `≤ pool − loadedBytes` tight, else too large **for the
  model + vision part only** — the KV term may raise a verdict to `tight`, never to `too-large`
  (R1-10). Available side (`checkMemoryForLoad`): `need ≤ MemAvailable` (Linux
  `/proc/meminfo`; macOS `vm_stat` free + inactive + purgeable; Windows `os.freemem()`,
  documented as "free only") — `loadedBytes` is NOT added here because resident models are
  already excluded from available memory. `loadedBytes` = Σ over `loaded` rows (not
  `sleeping`, R1-14) of `sizeBytes + kvBytes(at their context)`.
- **The pool is what the engine reports** (R1-7, R1-6, R1-30, R2-5): the first GPU device's
  `totalMiB` from the `.complete` marker (86016 MiB on the Z13's Vulkan build — Vulkan's view
  of the unified pool; the Metal device total on a Mac; the card's VRAM on a discrete GPU).
  CPU-only installs use total RAM. `gpu-detector.ts`'s VRAM probe stays only for the label
  wording ("fits on your GPU").
- Headline is the one numbers line (R28): `"<model> GB model + <kv> GB for <ctx>k context,
  with <loaded> GB already loaded."`; `detail` one sentence; `breakdown.advice` = "Lower this
  model's context length in its Settings to shrink this." when tight/too-large (R8/S-6).

### D3. `contextLengthFor(modelId)` = per-model setting ?? engine `contextSize`. `quants()`
uses the engine's; `memoryCheck` and `installedModels` use the model's own.

### D4. The remembered warning (R9, R29, R31) — `ModelSettings.memoryWarningDismissedAt`
Written through `models:set-settings`; `memoryCheck` returns `ok` for a `tight` verdict when
the stored length equals the current one; a changed context asks again; `too-large` never
dismissible.

## E. Vision: the projector downloads with the model, into a folder

Rows: R3, R10, R11, R22, R23, R32.

### E1. Listing (`quant-parser.ts`, `hf-client.ts`)
`groupQuantOptions` keeps its denylist for the quant list but returns the repo's projector too
(prefer `mmproj-F16.gguf`, then `BF16`, then the first `mmproj*`); every `QuantOption` of that
repo carries `visionBytes` and `visionFile: { path, size, sha256 }`.

### E2. Layout
- Text-only models: flat, as today.
- A model with a projector: `<cacheDir>/<id>/<id>.gguf` (split parts likewise) +
  `<cacheDir>/<id>/mmproj-F16.gguf`; manifest and `.partial` files inside the folder. The
  router names it by the folder and pairs the projector (verified live: `input_modalities:
  ["text","image","audio"]`, child gets `--mmproj`, image round-trip answered "Red").
  `probe-download.mjs` gains the folder case; new `probe-vision.mjs` asserts modalities and
  the image answer.
- `cache-scan.ts` scans one level of folders; `vision: 'ready'` when `mmproj*` is present;
  `'available'` when the folder's or flat manifest carries `visionFile` but no `mmproj` is
  present (also the crash-recovery state, R1-11); else `'none'`.
- `deleteModel` removes the folder and prunes `engine.models[id]`.

### E3. Backfill for pre-feature downloads (R2-20)
A complete set with no manifest (every download made before this feature) resolves its repo
once: the curated list's `hfRepo` whose default quant's filename matches, else one HF search
on the filename stem; a hit writes a manifest with `completedAt`, `repo`, `quant` and
`visionFile` (when the repo has one); a miss is recorded in the manifest as `repo: null` so
it costs one lookup per model, ever. Runs lazily from `installedModels()`, off the main
render path, one model at a time. This is what gives Destin's existing Gemma 4 12B its eye
and its Add-vision link.

### E4. `models:add-vision` (R10; R1-8, R1-9, R1-11, R2-2)
For an `'available'` model: wait for no in-flight request on it (per-model count, bounded as
in §C2) → `POST /models/unload` → **poll `GET /models` until its row reads `unloaded`**
(bounded 15 s; timeout aborts with "The model is still busy — try again in a moment") →
create `<cacheDir>/<id>/` → move the **manifest first**, then every part (`fs.renameSync`;
a failure moves back what moved and reports the OS error) → download `visionFile` into the
folder through the normal downloader (progress on the usual stream) → `GET /models?reload=1`
→ `refreshModels()`.

### E5. Vision reaches the harness
`EngineSupervisor.listModels()` keeps `architecture.input_modalities`; `CatalogModel.
supportsVision` for local rows = includes `'image'`; the vision resolver in `ipc-handlers.ts`
reads the catalog for `local-engine` as it does for OpenRouter. The "trimmed image still
counted as visible" bug (`docs/roadmap/native-harness.md`) becomes reachable for real; its fix
is **its own PR** (R2-26) — §I only notes it.

## F. "Run in terminal" — a plain-shell session (R1-15, R1-28, R1-34, R2-25)

Row: R1 ("types it into its own terminal for you to run"). `SessionProvider` gains `'shell'`:
spawns `$SHELL` (Windows: `powershell.exe`) with no args, no hook pipe, no transcript watcher,
terminal view only, **not offered in the new-session form** (the picker entry is the roadmap
idea, which becomes in-flight: its floor ships here). `engine:run-in-terminal(command)` creates
one in the current project folder and returns its id; the command is written **after the
PTY's first output**, never on spawn (fish and zsh discard startup input), without `\r`.
Probe on fish, zsh, bash and PowerShell before the task closes. Sizing: 54 `provider ===
'claude' | 'native'` comparisons across 24 non-test files — the task carries the list; hiding
the provider from the form means a missed site cannot be reached by a user. Docs asserting
the two-member union (`native-runtime.md` rule and depth doc, `shared/types.ts` comment) are
in the docs task.

## G. The live hardware line (R12; R1-14, R1-31)

`status()` adds `loadedModelsBytes` (Σ `sizeBytes` of `loaded` rows) and `lastReply`. The
streaming completion's final frame carries `timings.prompt_per_second` / `predicted_per_second`
(verified by `probe-chat.mjs` on b10665); `provider-registry.ts`'s local fetch wrapper (where
`withPrefillProgress` taps the stream) reads it and calls `engineManager.recordReply(...)`,
which emits `status-changed`.

## H. Surfaces, parity, and the fakes (R2-29)

New channels — `engine:prereqs`, `engine:run-in-terminal`, `engine:set-config`,
`models:settings`, `models:set-settings`, `models:add-vision` — land on all five surfaces:
`ipc-handlers.ts`, `preload.ts`, `remote-shim.ts`, `remote-server.ts`, `SessionService.kt`
(desktop-only stubs like `engine:set-backend`), with `ipc-channels.test.ts` extended; then
each comes OFF `mock-only.ts`. The mockup's `engine.setSpeed` → `engine.setConfig({speed})`
and `models.dismissMemoryWarning` → `models.setSettings({memoryWarningDismissedAt})` are
renamed in `useIpc.ts`, `EngineCard.tsx`, `RuntimeBinding.tsx` (drop the `as any` gate) and
`mock-shim.ts`; `mock-only.ts` loses the two dropped channels. The fakes stay for the
workbench; `node scripts/workbench-boot-check.mjs` runs after the shim change (R2-28).

## I. Docs, probes, roadmap (R1-27, R2-25, R2-30, R2-31)

- `youcoded/docs/engine-dependencies.md`: spawn shape (preset replaces `-c` and
  `--sleep-idle-seconds`; conditional speed flags), the probed `[*]` / override / `source:
  preset` / `/props?model=` facts, folder layout, `--list-devices` in the marker, the CUDA
  runtime asset, the ROCm assets and gfx list, the alias table.
- `.claude/rules/engine-local-models.md` — rewrite these bullets: flat-basename "NEVER rename
  downloads" (now: flat for text-only, folder for vision, the move is `add-vision`'s job);
  "quant parser denylists mmproj" (now: denylisted from the quant list, returned as the
  projector); "integrated GPUs fall back to RAM-only" (now: the engine's device total is the
  pool); "CUDA opt-in is Windows-x64-only" (now: CUDA Windows, ROCm Linux+Windows, gated);
  the `set-context` null trick (gone — context is a preset reload). `native-runtime.md` (rule
  and `youcoded/docs/native-runtime.md`): `SessionProvider` has three members.
- `docs/MAP.md`: engine row gains `gguf-header.ts`, `rocm-prereqs.ts`, `model-presets.ts`
  (writer), the new tests and probes; the sessions/native-runtime row gains the shell
  provider; "On-disk state" gains the rows listed under Storage.
- Probes on every bump: the existing five + `probe-speed` + `probe-presets` + `probe-vision`
  + `probe-headers`.
- Roadmap, `docs/roadmap/local-models.md` unless noted — **closed:** spec decoding and KV
  compression (in-flight items), flat 2 GB warning, per-model context, Windows CUDA runtime,
  vision projector, backends upstream ships (ROCm; a new residue item keeps SYCL/Android).
  **Partly closed, rewritten to residue:** the dual-model OOM item (residue: hard-block vs
  auto-unload when two models cannot fit even with real numbers) and the LM-Studio-parity item
  (residue: manual load/unload, embeddings, draft-model picker, hardware page beyond the fact
  line). `native-harness.md`: cache-efficiency item gains "Keep loaded removes the
  idle-shutdown cache loss"; the trimmed-image item gains "now reachable — local vision works".
  `other-features.md` Terminal-session item → in-flight. `user-interface.md` G-22 item shrinks
  to two places (the recommended card was fixed in the mockup's round 2).

## J. Every task (R1-35, R2-27, R2-28)

A WHY comment at every non-trivial edit; `bash scripts/verify.sh <worktree>` green before a
task is reported done; every new user-facing failure through `<ErrorState>` / `FieldError`
with the REAL cause, never a guess. The three new failure texts:
- Add vision could not move the model: "Could not move <id> into its own folder: <OS error>.
  Nothing was changed."
- Preset file could not be written: "Could not save this model's settings: <OS error>." (the
  engine keeps running with the previous file).
- Runtime archive failed its check: reuse the existing sentence — "The <BACKEND> runtime
  files failed their integrity check — please try installing again."
Closing tasks: `node scripts/workbench-boot-check.mjs` after the shim rename; the acceptance
stage — a fresh grader writes `local-engine-upgrades.contract.verdicts.json` for all 32 rows,
re-shooting the `deck` rows from the built branch against the real backend, then
`review-cards.py acceptance` builds the deck Destin answers.

## K. Simpler than the obvious?

- Per-model settings are a file the router already reads; engine-wide values move into the
  same file, so one writer covers both and a context change is a reload, not a restart.
- One header reader serves fit, memory check and the vision flag; one on-disk cache.
- The memory pool is a number the engine already prints; no platform heuristics.
- One `engine:set-config` for every engine-wide knob; one `models:set-settings` for every
  per-model one, the warning's memory included; one storage file.
- The shell session is the only genuinely new subsystem.
