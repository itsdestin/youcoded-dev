---
status: draft
date: 2026-09-05
type: spec
topic: how the backend serves the approved local-engine screens — chip-gated faster engines with a ROCm set-up path, per-model settings via the router's preset file, a real memory model from GGUF headers, vision downloads in a folder per model, a live hardware line, and the two speed switches
contract: docs/active/design/2026-09-04-local-engine-upgrades/local-engine-upgrades.contract.json
branch: feat/local-engine-upgrades (youcoded)
reviews: docs/active/reviews/2026-09-05-local-engine-upgrades-design-review-1.md
---

# Local engine upgrades — technical design (build stage 8a, after review round 1)

The UI is decided: 32 contract rows, signed 2026-09-05, mocked on `feat/local-engine-upgrades`
against the fakes in `mock-shim.ts` / `mock-only.ts`. This document says what main must do so
those screens stop being fakes. It re-litigates nothing about the *what*. Round 1 of review
(28 findings accepted) reshaped §B–§D materially; each change cites its finding.

Investigation with the measurements behind every number:
`docs/active/investigations/2026-09-04-local-model-runner-audit.md`.

## 0. Ground the branch first — done

`feat/engine-speed-flags` (`--spec-default --cache-type-k q8_0` + `probe-speed.mjs`) was
merged into `feat/local-engine-upgrades` on 2026-09-05. Master gets both when this merges.

## Storage: two files, one rule (R1-20, R1-21, R1-23)

- `~/.youcoded/config.json` `engine.*` stays what it is (cacheDir, backend, contextSize) — a
  per-user file that may sync one day.
- **New `~/.youcoded/engine-local.json`** (NativeHome, never synced) holds everything that
  describes THIS machine or this machine's copies of models:
  ```
  { v: 1,
    speed: { speculative: true, compressCache: true },
    models: { [modelId]: { contextLength: number|null, keepLoaded: boolean,
                          gpuLayers: number|'auto', extraFlags: string,
                          memoryWarningDismissedAt: number|null } } }
  ```
  Missing file / missing key = the defaults above = today's behaviour. Read through
  `readEngineLocal(home)` / `updateEngineLocal(home, patch)` (same locked `mutateJson` as
  `engine-config.ts`).
- The download **manifest stays after completion** (`completedAt` added, plus
  `visionFile?: { path, size, sha256 }`); `cache-scan.ts` reads `completedAt` instead of
  treating presence as "unfinished". No `origin.json`. Manifests written before this
  feature have no `completedAt` and no `visionFile`: an existing complete set with such a
  manifest is complete (the file count is still the authority) and `vision: 'none'` (R11).
- On-disk additions go into `docs/MAP.md` → "On-disk state": `engine-local.json`,
  `~/.youcoded/engine/models.ini`, `<cacheDir>/<id>/` folders, the header cache (§D1).

## A. Faster engines: chip-gated options, ROCm set-up, CUDA runtime, device check

Rows: R1, R5, R6, R13, R14, R15, R16.

### A1. Assets (`engine-pin.ts`, `scripts/generate-engine-pin.mjs`)
- Rows for `linux/x64/rocm` (`…-bin-ubuntu-rocm-7.14-x64.tar.gz`, nests under `llama-<tag>/`)
  and `win32/x64/rocm` (`…-bin-win-rocm-7.14-x64.zip`, flat; **contains `llama-server.exe`
  plus `amdhip64_7.dll` — verified by listing the b10665 zip, 55 entries**). Both need
  `binaryRelPath` like their Vulkan siblings.
- `EngineAsset.runtime?: { assetName; sha256 }` — the CUDA rows point at
  `cudart-llama-bin-win-cuda-12.4-x64.zip` (373 MB, flat DLLs). The generator emits it from
  the release's asset list (`cudart-…-<same cuda tag>-x64.zip`).
- `EngineAsset.gfxTargets?: string[]` for ROCm rows — the build's compiled AMD targets, taken
  from upstream's release workflow at bump time and pasted by the generator (b10665 Linux:
  gfx908, 90a, 942, 950, 1010–1036, 1100–1102, 1150–1152, 1200, 1201). The bump procedure in
  `engine-dependencies.md` gains "re-check the ROCm target list". (R1-2)
- `engine-config.ts`: `BACKENDS` gains `'rocm'` with a pinning test — without it a saved
  `rocm` reads back as null. (R1-29)

### A2. Acquisition (`engine-acquisition.ts`)
- `install()`: when `asset.runtime` is set, download + sha256-verify + unpack it into the SAME
  `.unpacking` directory before `.complete` is written — one install, one marker, one atomic
  rename. Progress: one `download` event stream with `totalBytes` summed over both archives.
- The `.complete` marker gains `devices: string[]` — the parsed `--list-devices` lines
  (see A4) — so `status()` never spawns a process to learn the device name. (R1-22)
- Linux ROCm needs the HOST's ROCm libraries (verified with `ldd`: `libamdhip64.so.7`,
  `libhipblas.so.3`, `librocblas.so.5` from `/opt/rocm/lib`); Windows ROCm bundles its runtime.

### A3. Chip, target and prerequisite detection — in `gpu-detector.ts` (R1-22)
`detectGpu()` grows: `{ name, totalVramBytes, vendor: 'nvidia'|'amd'|'apple'|'intel'|null,
gfxTarget: string|null }`.
- Linux: vendor from `/sys/class/drm/card*/device/vendor` (`0x10de`, `0x1002`, `0x8086`);
  `gfxTarget` from `/sys/class/kfd/kfd/topology/nodes/*/properties` `gfx_target_version`
  (110501 → `gfx1151`; the node with `0` is the CPU) — the Z13 reads exactly that.
- Windows: NVIDIA via `nvidia-smi`; AMD via the display-class registry key's `DriverDesc` /
  `ProviderName` containing "AMD" / "Advanced Micro Devices"; `gfxTarget` null.
- macOS: `'apple'` on arm64.
New pure module `src/main/engine/rocm-prereqs.ts` (Linux only):
`rocmPrereqs(): EnginePrereqs` — `satisfied` when `ldconfig -p` lists `libamdhip64.so.7`,
`libhipblas.so`, `librocblas.so` (or all three exist under `/opt/rocm/lib`). Distro from
`/etc/os-release` `ID` / `ID_LIKE`:
| family | command |
|---|---|
| arch, cachyos, manjaro, endeavouros (`ID_LIKE` arch) | `sudo pacman -S --needed rocm-hip-runtime hipblas rocblas` |
| fedora, rhel, nobara (`ID_LIKE` fedora/rhel) | `sudo dnf install rocm-hip hipblas rocblas` |
| ubuntu, debian, mint, pop | null — AMD's packages need AMD's repository first; `docsUrl` = AMD's Ubuntu quick-start (R16) |
| anything else | null + `docsUrl` = the ROCm install landing page |
On Windows `satisfied: true`. `explainer` is the mockup's sentence.

`backendOptions(platform, arch, gpu, prereqs, current, pin): BackendOption[]`:
- NVIDIA + win32/x64 → `cuda` `ready` (no upstream Linux CUDA asset).
- AMD + linux/x64 → `rocm` only when `gfxTarget` is in the pin's `gfxTargets` (R1-2);
  `ready` if prereqs satisfied else `needs-prereqs`.
- AMD + win32/x64 → `rocm` `ready` (no target readable; A4's checks are the gate).
- Never the installed backend; never Apple or Intel.
`EngineManager.status()` carries `backendOptions` and `deviceName` (A4).

### A4. The device check after install — `EngineManager.setBackend`
After `acquisition.install()`, before `verifyBoot`: run the new binary with `--list-devices`
(exits at once, serves nothing — verified on b10665) and parse the `Available devices:` block.
For `cuda` / `rocm` require a line whose prefix matches (`CUDA0:` / `ROCm0:`); otherwise
`acquisition.discard()` the fresh install and throw `Kept the current engine: the <BACKEND>
build found no graphics chip it can use — "<the engine's last stderr line>". Nothing was
changed.` Then `verifyBoot`. **Then a real load:** the smallest complete model in the cache is
loaded once (`/v1/chat/completions`, `max_tokens: 1`); a load error (an unsupported kernel
image on a mismatched target — R1-2's Windows case) discards the install with the same
sentence and the router's own error text. No model on disk → the load step is skipped and the
Faster-engine row's description says "Checked when your first model loads". Config is
written only after every check passes. `install()` (Vulkan default) is untouched — its CPU
fallback is by design. `deviceName` = first non-CPU device's name from the parsed list,
parenthetical stripped (`AMD Radeon 8060S Graphics (RADV STRIX_HALO)` → `AMD Radeon 8060S
Graphics`); each device's `(total MiB, free MiB)` is kept too — §D2 uses the total as the
memory pool.

### A5. Set-up flow channels
- `engine:prereqs` (backend) → `EnginePrereqs`.
- `engine:run-in-terminal` (command) → `{ sessionId }` (§F); the renderer (desktop or remote
  shim) selects that session itself — a remote client cannot see a desktop window switch
  (R1-34).
- "Check again" = renderer calls `engine:prereqs` again, then `engine:set-backend`.

Guards: `gpu-detector.test.ts` (vendor ids, kfd properties → gfx target), `rocm-prereqs.test.ts`
(os-release → command/docsUrl, ldconfig → satisfied), `engine-manager.test.ts` (set-backend
discards + throws on no matching device; on a failed test load; runtime archive unpacked into
the same dir; `.complete` carries devices), `engine-pin` generator test (runtime row, gfx list).

## B. Speed switches and one engine-config channel (R1-3, R1-33)

Rows: R4, R17, R18, R19.
- `speed` lives in `engine-local.json` (above).
- The supervisor **reads its config at every spawn** (a `readConfig()` callback passed at
  construction instead of frozen values) — that is what makes any restart pick up new flags
  (R1-3). Spawn adds `--spec-default` when `speculative`, `--cache-type-k q8_0` when
  `compressCache`; `engine-supervisor.test.ts` pins both branches, and pins that the
  engine-wide `-c` / `--sleep-idle-seconds` are NO LONGER on the command line (see C2).
- **One channel `engine:set-config(patch)`** replaces the planned `set-speed`; it accepts
  `{ contextSize?, speed? }`, writes the right file, restarts through the existing
  `setContext` path (stop + `supervisorBinary = null`), returns `status()`. `engine:set-context`
  stays as a thin alias for its existing callers (Android stub included).

## C. Per-model settings via the router's preset file

Rows: R2, R24, R25, R26.

### C1. Storage — `engine-local.json` `models[modelId]` (above).

### C2. The preset file the router reads (R1-1, R1-12, R1-26, R1-32, R1-13)
Path: `~/.youcoded/engine/models.ini`, passed as `--models-preset <abs path>`; written by the
supervisor before every spawn and by `models:set-settings`.

**The command line outranks the preset** (verified in b10665 `server-models.cpp`: the CLI
preset is merged over the per-model one; README: "Command-line arguments … highest priority").
So the engine-wide values that a model may override MOVE OFF the command line into the
preset's global section:
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
Long key forms only (the spelling the router writes into its own presets). The CLI keeps
router-only flags: `--host --port --no-webui --jinja --models-dir --models-max
--models-preset` and the two speed flags (engine-wide by design). If `[*]` turns out not to
be honoured by b10665, the fallback is to emit every setting into every model's section and
omit the CLI value — `probe-presets.mjs` decides on day one.

Per-model keys: `ctx-size` when set; `n-gpu-layers` when not `'auto'` (`999` = all);
`sleep-idle-seconds = -1` when `keepLoaded`; extra flags tokenised `--key value` →
`key = value`, bare `--key` → `key = 1`. Save-time rejections with a plain message: anything
not shaped `--word`, and the **reserved keys** `host port model models-dir models-preset
mmproj alias ctx-size n-gpu-layers sleep-idle-seconds` (the ones the app writes itself or
that would repoint the router). (R1-13)

**Applying a change** (R1-8): `models:set-settings` writes the file, then waits until the
model has no in-flight request (supervisor `inFlight` + the session ref-count) before
`GET /models?reload=1` (re-reads presets; measured to unload a model whose preset changed) and
`POST /models/unload`. While waiting, `ModelSettings.pendingApply: true` and the dialog's
footer line reads "Applies after the current reply." `lastLoadError: string|null` on
`ModelSettings` = the router row's failure text when the model's last load failed (R26).

**Keep loaded vs the app's own timers** (R1-4): the engine idle stop (`idleMs`) is skipped
while any resident model is keep-loaded; `--models-max 2` LRU eviction still applies when a
third model loads — the (i) and the row hint say so ("stays until two other models push it
out").

Guards: `model-presets.test.ts` (INI writer: `[*]` values, omitted defaults, escaping, flag
tokeniser accept/reject incl. reserved keys), `engine-supervisor.test.ts` (spawn carries
`--models-preset`, not `-c`, not `--sleep-idle-seconds`; idle stop skipped with a keep-loaded
model), `probe-presets.mjs` on every bump: global `ctx-size` reaches `/props`; a per-model
`ctx-size` differs from it; a bad flag section surfaces its error in `GET /models`.

### C3. Where the per-model context is honoured
`effectiveContextWindow(modelId)` reads `/props` — the per-model value flows through the
router, no harness change. `contextLengthFor(modelId)` = per-model setting ?? engine
`contextSize` (§D3).

## D. Memory: the real model, one number with a breakdown, the remembered warning

Rows: R7, R8, R9, R20, R21, R27–R32.

### D1. GGUF header reader — new `src/main/models/gguf-header.ts` (R1-10, R1-24, R1-25)
Pure parser over a `Buffer` (magic, version 3, KV table; stops after the last KV) + two
loaders: local file (up to 32 MB) and HTTP Range (`bytes=0-<N>`, 32 → 64 MB when the table
runs longer; Hugging Face honours Range — all Qwen3.5-9B metadata sat in the first 11 MB).
Returns `{ arch, layers, kvHeads, headDimK, headDimV, trainCtx, slidingWindow?,
slidingWindowPattern?, fullAttentionInterval? }` from `<arch>.block_count`,
`.attention.head_count_kv`, `.attention.key_length` / `.value_length` (fallback
`embedding_length / head_count`), `.context_length`, `.attention.sliding_window`,
`.attention.sliding_window_pattern`, `.full_attention_interval` (present on Gemma 3/4 and
Qwen3.5-family files; absent = every layer is full attention).
**One header per repo** — layers and heads do not vary across quants — fetched for the
default quant's first file and **persisted** at `~/.youcoded/engine/gguf-headers.json`
keyed by `repo` (HF) or `path + mtime` (local), so a repo costs one fetch ever (R1-24).

### D2. Estimator (`fit-estimator.ts`) (R1-6, R1-7, R1-10, R1-25)
- `kvBytes(header, contextLength, kType, vType)`: for each layer, tokens kept =
  `contextLength` for a full-attention layer, `min(contextLength, slidingWindow)` for a
  sliding one (which layers slide comes from the pattern/interval); per token
  `kvHeads × (dK×bytes(kType) + dV×bytes(vType))`, `f16 = 2`, `q8_0 = 1` (+6 % block
  overhead). Hybrid families whose linear layers the header does not mark (Qwen3.5) are
  counted as full attention and flagged `contextBytesIsUpperBound: true`; the bubble then says
  "up to" (R1-25).
- `estimateFit(modelBytes, pool, { contextBytes, visionBytes })`: need = model + vision +
  context + 512 MB engine overhead. **The KV term can raise a verdict to `tight`, never to
  `too-large`** (R1-10): `too-large` is decided on model + vision alone, exactly as today.
  Returns the `breakdown` the UI renders (`modelBytes, contextBytes, contextLength,
  visionBytes?, contextBytesIsUpperBound`), plus `advice` when tight/too-large: "Lower this
  model's context length in its Settings to shrink this." (R8/S-6 — the bubble's last line).
- **The memory pool is what the engine reports** (R1-7, R1-6, R1-30): the first non-CPU
  device's `(total MiB)` from the `.complete` marker's devices — 86016 MiB on the Z13's Vulkan
  build, the Metal device total on a Mac, the card's VRAM on a discrete GPU. No sysfs GTT
  heuristic, no `0.7 × RAM` guess. RAM-only machines (CPU backend) use total RAM as today.
- `checkMemoryForLoad` (R7): capacity = min(pool, available memory) where available =
  `MemAvailable` from `/proc/meminfo` (Linux — reclaimable cache counts as free, Destin's
  condition), `vm_stat` free + inactive + purgeable pages (macOS), `os.freemem()` (Windows,
  documented as "free only"). `loadedBytes` = Σ over resident (`loaded` only, not `sleeping`
  — R1-14) models of `sizeBytes + kvBytes(at their context)`. Headline is the one numbers
  line (R28): `"<model> GB model + <kv> GB for <ctx>k context, with <loaded> GB already
  loaded."`; `detail` is one sentence.
- `gpu-detector.ts` keeps its VRAM probe for the fit LABEL's "fits on your GPU" wording, but
  the unified-memory misclassification (the Z13's 4 GiB carve-out passing the 2 GiB
  "dedicated" floor) is closed by preferring the device total above whenever an engine is
  installed.

### D3. Where the context length comes from
`contextLengthFor(modelId)` = per-model setting ?? engine `contextSize`. `quants()` uses the
engine's context (a not-yet-downloaded model has no setting); `memoryCheck` and
`installedModels` use the model's own.

### D4. The remembered warning (R9, R29, R31) — in `ModelSettings` (R1-23)
`memoryWarningDismissedAt: number | null` = the context length the user answered at.
`models:set-settings({ memoryWarningDismissedAt })` is the write (the mockup's
`dismissMemoryWarning` fake becomes a `setSettings` call — a two-line renderer change).
`memoryCheck` returns `ok` for a `tight` verdict when the stored length equals the current
one; a changed context asks again; `too-large` is never dismissible.

## E. Vision: the projector downloads with the model, into a folder

Rows: R3, R10, R11, R22, R23, R32.

### E1. Listing (`quant-parser.ts`, `hf-client.ts`)
`groupQuantOptions` keeps its denylist for the quant list but also returns the repo's
projector: prefer `mmproj-F16.gguf`, then `BF16`, then the first `mmproj*`. Every
`QuantOption` of that repo carries `visionBytes` and `visionFile: { path, size, sha256 }`.

### E2. Layout (the probe-pinned contract, extended)
- Text-only models: flat, exactly as today.
- A model with a projector: `<cacheDir>/<id>/<id>.gguf` (split parts likewise) +
  `<cacheDir>/<id>/mmproj-F16.gguf`. The router names it by the folder and pairs the projector
  itself (verified live on b10665: `input_modalities: ["text","image","audio"]`, the child
  gets `--mmproj`, an image round-trip answered "Red"). The manifest and `.partial` files for
  a folder download live INSIDE the folder (the downloader's `cacheDir` becomes
  `<cacheDir>/<id>` for that set). `probe-download.mjs` gains the folder case; new
  `probe-vision.mjs` asserts the modalities and the image answer.
- `cache-scan.ts` scans one level of folders: a folder holding `<name>.gguf` (or
  `-00001-of-`) is one download; `vision: 'ready'` when an `mmproj*` file is present;
  `'available'` when the folder's or flat manifest carries `visionFile` but no `mmproj` is
  present (this is also the crash-recovery state — R1-11); else `'none'`.
- `deleteModel` removes the folder.

### E3. `models:add-vision` (R10; R1-8, R1-9, R1-11)
For an `'available'` model: wait until it has no in-flight request → `POST /models/unload` →
**poll `GET /models` until its row reads `unloaded`** (bounded 15 s; a timeout aborts with
"The model is still busy — try again in a moment") → create `<cacheDir>/<id>/` → move the
**manifest first**, then every part (`fs.renameSync`, same volume; a rename failure moves
whatever moved back and reports the OS error) → download `visionFile` into the folder through
the normal downloader (progress on the usual stream, `repo` + `quant` match so the row shows
it) → `GET /models?reload=1` → `refreshModels()`.

### E4. Vision reaches the harness
`EngineSupervisor.listModels()` keeps `architecture.input_modalities` from router rows;
`CatalogModel.supportsVision` for local rows = includes `'image'`; the vision resolver in
`ipc-handlers.ts` reads the catalog for `local-engine` as it does for OpenRouter. The known
"trimmed image still counted as visible" bug (`docs/roadmap/native-harness.md`) becomes
reachable for real — its fix (`fitToContext` reconciles `shownImages`) is a task here.

## F. "Run in terminal" — a plain-shell session (R1-15, R1-28, R1-34)

Row: R1 (statement corrected to the deck's words: the command is typed in; you press Enter).
Every session today launches `claude` (`pty-worker.js` spawns `msg.command`;
`SessionManager.create` hard-codes `'claude'`). `SessionProvider` gains `'shell'`: spawns
`$SHELL` (Windows: `powershell.exe`) with no args, no hook pipe, no transcript watcher,
terminal view only, **not offered in the new-session form** (the picker entry is the roadmap
idea, `docs/roadmap/other-features.md`, which becomes in-flight: its floor ships here).
`engine:run-in-terminal(command)` creates one in the current project folder and returns its
id; the command is written **after the PTY's first output** (the prompt), never on spawn —
fish and zsh discard startup input (R1-15) — and without `\r`. Probe on fish, zsh, bash and
PowerShell before the task closes.
Sizing (R1-28): 54 `provider === 'claude' | 'native'` comparisons across 24 non-test
renderer/main files; the task carries that list as its checklist, and hiding the provider
from the form means a missed site cannot be reached by a user.

## G. The live hardware line (R12; R1-14, R1-31)

`status()` adds `loadedModelsBytes` (Σ `sizeBytes` of rows in state `loaded` only) and
`lastReply`. The streaming completion's final frame carries `timings.prompt_per_second` /
`predicted_per_second` (verified on b10665 by `probe-chat.mjs` this session); nothing parses
it yet — `provider-registry.ts`'s local fetch wrapper (where `withPrefillProgress` already
taps the stream) reads the final frame and calls `engineManager.recordReply(...)`, which emits
`status-changed`.

## H. Surfaces, parity, and the fakes

New channels — `engine:prereqs`, `engine:run-in-terminal`, `engine:set-config`,
`models:settings`, `models:set-settings`, `models:add-vision` — land on all five surfaces:
`ipc-handlers.ts`, `preload.ts`, `remote-shim.ts`, `remote-server.ts`, `SessionService.kt`
(desktop-only stubs like `engine:set-backend`), with `ipc-channels.test.ts` extended; then
each comes OFF `mock-only.ts` (`workbench-mock-contract.test.ts` forces this). The fakes stay
for the workbench; `engine.setSpeed` and `models.dismissMemoryWarning` in the mockup are
renamed to the real calls.

## I. Docs, probes, roadmap

- `youcoded/docs/engine-dependencies.md`: spawn shape (preset file replaces `-c` and
  `--sleep-idle-seconds`; conditional speed flags), the `[*]` section, folder layout,
  `--list-devices`, the CUDA runtime asset, the ROCm assets and their gfx target list.
- `.claude/rules/engine-local-models.md`: "flat for text-only, folder for vision"; new probes
  in `verify:`; `docs/MAP.md` on-disk rows.
- Probes on every engine bump: the existing five + `probe-speed` + `probe-presets` +
  `probe-vision`.
- Roadmap (R1-27), all in `docs/roadmap/local-models.md` unless noted: **closed** — spec
  decoding (in-flight item), KV compression (in-flight item), flat 2 GB memory warning,
  per-model context, Windows CUDA runtime, vision projector, backends upstream ships (ROCm
  half; SYCL/Android stay as a new residue item). **Partly closed, rewritten to residue** —
  the dual-model OOM item (residue: hard-block vs auto-unload when two models will not fit
  even with the real numbers) and the LM-Studio-parity item (residue: manual load/unload,
  embeddings, draft-model picker, hardware page beyond the fact line). `native-harness.md`'s
  cache-efficiency item gains a line: Keep loaded removes the idle-shutdown cache loss.
  `other-features.md` Terminal-session item → in-flight (floor ships, picker entry does not).

## J. Every task (R1-35)

A WHY comment at every non-trivial edit; `bash scripts/verify.sh <worktree>` green before a
task is reported done; every new user-facing failure through `<ErrorState>` /
`FieldError` with the REAL cause, never a guess. The three new failure texts:
- Add vision could not move the model: "Could not move <id> into its own folder: <OS
  error>. Nothing was changed." (moved parts are moved back first).
- Preset file could not be written: "Could not save this model's settings: <OS error>."
  (the engine keeps running with the previous file).
- Runtime archive failed its check: "The <BACKEND> engine's runtime files failed their
  integrity check — the download was corrupted. Nothing was changed." (existing sha path).

## K. Simpler than the obvious?

- Per-model settings are a file the router already reads; engine-wide values move into the
  same file, so one writer covers both.
- One header reader serves fit, memory check and the vision flag; one on-disk cache.
- The memory pool is a number the engine already prints; no platform heuristics.
- One `engine:set-config` channel for every engine-wide knob; one `models:set-settings` for
  every per-model one, the warning's memory included.
- The shell session is the only genuinely new subsystem.
