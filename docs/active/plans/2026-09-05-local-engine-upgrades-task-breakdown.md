---
status: active
date: 2026-09-05
type: plan
topic: the build order for the local-engine upgrades — 23 tasks in 6 waves, each with its files, its guard test and its acceptance condition
design: docs/active/specs/2026-09-05-local-engine-upgrades-technical-design.md
contract: docs/active/design/2026-09-04-local-engine-upgrades/local-engine-upgrades.contract.json
branch: feat/local-engine-upgrades (youcoded)
---

# Local engine upgrades — task breakdown (build stage 8c)

Design: `docs/active/specs/2026-09-05-local-engine-upgrades-technical-design.md`, final after
three review rounds (63 accepted, 2 rejected, 1 reversal, 1 narrowing).
Worktree: `/home/destin/youcoded-dev/worktrees/local-engine-upgrades`, branch
`feat/local-engine-upgrades`, verified green on 2026-09-05 before any of this started.

**Every task, no exceptions (design §J).** A WHY comment at each non-trivial edit. Every new
user-facing failure through `<ErrorState>` / `FieldError` carrying the REAL cause — never a
guessed one. `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/local-engine-upgrades`
green before the task is reported done. A reviewer subagent reads the diff against this
task's acceptance line before it is accepted. Nothing touches the live app: dev instances and
free high ports only, and a pid to kill is derived from its port in the same command.

## Waves

A wave is what can be built at the same time without two builders editing one file.

| wave | tasks | why they can share it |
|---|---|---|
| 1 | T1, T5, T10, T13 | four separate areas, no shared file |
| 2 | T2, T3, T6, T11, T14 | each builds on exactly one wave-1 task |
| 3 | T4, T7, T8, T15, T19 | consume wave-2 output |
| 4 | T9, T12, T16, T17, T18 | consume wave-3 output |
| 5 | T20, T23 | need every channel and every field to exist |
| 6 | T21, T22 | paperwork, then acceptance |

---

## Wave 1

### T1 — Pin, assets, alias table (§A1)
Files: `desktop/src/main/engine/engine-pin.ts`, `scripts/generate-engine-pin.mjs`,
`desktop/src/main/engine/engine-config.ts`.
- ROCm asset rows: `linux/x64` (tar.gz, nests under `llama-<tag>/`) and `win32/x64` (flat zip,
  contains `llama-server.exe` + `amdhip64_7.dll`).
- `EngineAsset.runtime?: { assetName; sha256 }`; the CUDA rows point at the cudart zip.
- `EngineAsset.gfxTargets?: string[]` on ROCm rows, read by the generator from upstream's
  release workflow at the pinned tag. **The two ROCm rows carry DIFFERENT lists** (found
  building T1, verified at b10665): Windows adds gfx1103 and gfx1153 and drops the four CDNA
  parts Linux has. One shared list would either refuse ROCm to a Windows user whose chip is
  supported, or offer it to a Linux user whose chip has no kernels in the archive — so **T3's
  gating must read the row for the running platform**, not "the pin's gfx list".
- `EnginePin.argAliases` — the binary's CLI alias table, generated from `--help` at bump time.
  It must cover short (`c`), long (`ctx-size`) and env (`LLAMA_ARG_CTX_SIZE`) spellings, all of
  which the preset accepts and resolves to the same option (probed).
  **A `--no-…` flag keeps its own canonical name and does NOT fold into the positive one**
  (found building T1): folding `--no-mmap` → `mmap` would silently invert what the user asked
  for, and llama-server's OFF short forms do not look negative (`-nkvo`, `-nocb`, `-ndio`,
  `-nr`), so the inversion would pass review. `nkvo` → `no-kv-offload`, `kvo` → `kv-offload`.
- `BACKENDS` gains `'rocm'`. The bump procedure gains "re-check the ROCm target list".
**Accepted when:** the generator test asserts the runtime row, the gfx list and the alias
table; `engine-config`'s allowlist test round-trips a saved `rocm`.

### T5 — Shell session provider and `engine:run-in-terminal` (§F)
- `SessionProvider` gains `'shell'`. The task carries the checklist of 54 `provider ===`
  comparisons across 24 non-test files (46 of them in the renderer) — every one is visited.
- Spawns `$SHELL` (Windows `powershell.exe`), no args, no hook pipe, no transcript watcher.
  Not offered in the new-session form.
- `engine:run-in-terminal(command)` creates one in the current project folder and returns
  `{ sessionId }`; the renderer, desktop or remote, selects it.
- The command is written **after the PTY's first output**, never on spawn (fish and zsh discard
  startup input), with no `\r`.
- **A selected shell session must show (R3-25):** the terminal view forced, no chat/terminal
  toggle, no composer, no model picker, no stop button, and the session strip and header
  labelling it by the shell's name. Hiding it from the new-session form does NOT make these
  branches unreachable — this feature's own button lands the user inside one.
**Accepted when:** a renderer test covers the branches `App.tsx` takes for
`provider === 'shell'`, and the command is probed to arrive intact on fish, zsh, bash and
PowerShell.

### T10 — GGUF header reader and its cache (§D1)
New `desktop/src/main/models/gguf-header.ts`: a pure KV-table parser (magic, version 3, no
tensors) plus two loaders — a local file, and HTTP Range in **1 MB steps that stop as soon as
the needed keys are parsed** (probed: every architecture key sits in the first 0.01 MB of all
three local GGUFs; tokenizer arrays start past 4 MB).
Keys: `block_count`, `head_count_kv`, `key_length` / `value_length` (fallback
`embedding_length / head_count`), `context_length`, `sliding_window`,
`sliding_window_pattern`, `full_attention_interval`, **`key_length_swa` / `value_length_swa`,
`shared_kv_layers`** (R3-6).
**`sliding_window_pattern` has two shapes and both must parse (R3-6):** a scalar (Gemma 3) and
a 35-element bool ARRAY, GGUF type 9 (Gemma 4 — read out of Destin's own file). Any **key type
the reader does not handle** — not only an unknown architecture — sets
`contextBytesIsUpperBound: true`.
Cache: `gguf-headers-cache.json` beside `curated-models-cache.json` in userData, one header per
repo, keyed by repo + default-quant sha (HF) or path + mtime (local).
**Accepted when:** `gguf-header.test.ts` pins both pattern shapes, the `_swa` lengths,
`shared_kv_layers`, the `dense_first` rule per arch against llama.cpp's `llama-hparams.cpp`,
and that an unhandled key type sets the upper-bound flag; `probe-headers.mjs` pins the 1 MB
stop against the curated repos.

### T13 — Manifest lifecycle (§Storage)
The download manifest **survives completion**, gaining `completedAt` and
`visionFile?: { path, size, sha256 }`. The three paths that read its presence as "unfinished"
change to read `completedAt`: `installedModels()`'s cleanup, the downloader's completion step
(writes `completedAt` instead of deleting), and `resume()` plus the prior-repo guard in
`ModelDownloader.start`. A re-download preserves `visionFile`.
**Accepted when:** a test proves a complete manifest is neither resumable nor treated as a
partial download, and that a re-download keeps `visionFile`.

---

## Wave 2

### T2 — Acquisition: runtime archive and the device list (§A2) — after T1
File: `desktop/src/main/engine/engine-acquisition.ts`.
- `install()` downloads, sha256-verifies and unpacks `asset.runtime` into the SAME `.unpacking`
  directory; one `download` progress stream with `totalBytes` summed over both archives.
- **For every backend**, run the unpacked binary with `--list-devices`, parse the
  `Available devices:` block, and write `devices: [{ backend, name, totalMiB, freeMiB }]` into
  the `.complete` marker — all before the atomic rename.
- `installed()` backfills a marker lacking `devices` once, lazily, the first time `status()`
  reads it, so existing installs get a pool too.
- `llvmpipe` and `SwiftShader` are classified CPU, not GPU.
**Handoffs from T2, measured while building it:**
- **`probeDownloadSize(asset)` answers the size question BEFORE any bytes move** (HEAD per
  archive), so the switch confirmation can say "Switching to CUDA downloads 611 MB (238 MB
  engine + 373 MB CUDA runtime)" against the 32 MB Vulkan default, and the progress bar's
  denominator never changes mid-download. `totalBytes` is `null` when ANY part is unreadable —
  a half-sum shown as a whole would understate what the user agreed to.
- **`totalMiB`/`freeMiB` are `number | null`, never `0` for an unparsed line** — T11 must treat
  a null pool as "no pool" and fall back to RAM. A null silently read as 0 makes every model
  `too-large`, which is the hard block.
- **`isGpu` is recorded per device**; do not re-derive it. `device.backend` is the printed id
  (`Vulkan0`, `CUDA0`), so §A4's check is `startsWith('CUDA')`.
- **A new `devicesError` field on the marker.** Without it, "the binary failed to start" and
  "no matching device" look identical to T4. **T4 reads `devicesError` first and quotes it**,
  and says "found no graphics chip" only when `devices` is empty AND there is no error.
- **`onMarkerUpdated` is an optional constructor arg nothing passes yet.** T4's `EngineManager`
  wires it to `emit('status-changed')`, or a lazily backfilled device list sits unseen until
  the next unrelated engine event.

**Accepted when:** `engine-acquisition.test.ts` pins the runtime archive landing in the same
directory, the devices in the marker, the lazy backfill, and the llvmpipe classification.

### T3 — Chip, gfx target, ROCm prerequisites (§A3) — after T1
Files: `desktop/src/main/gpu-detector.ts`, new `desktop/src/main/engine/rocm-prereqs.ts`.
- `detectGpu()` gains `vendor: 'nvidia'|'amd'|'apple'|'intel'|null` and `gfxTarget: string|null`
  — Linux from `/sys/class/drm/card*/device/vendor` and the kfd topology's
  `gfx_target_version` (110501 → `gfx1151`, what this Z13 reads; the node reading `0` is the
  CPU); Windows from `nvidia-smi` or the display-class registry key; macOS arm64 → `apple`.
- `rocm-prereqs.ts` (Linux only): satisfied when `ldconfig -p` lists `libamdhip64.so.7`,
  `libhipblas.so` and `librocblas.so` (or all three under `/opt/rocm/lib`); the distro table
  from `/etc/os-release` maps to an install command or, where AMD's repository is needed first,
  to `docsUrl`. Windows always satisfied.
- `backendOptions(...)` exactly as §A3: never the installed backend, never Apple or Intel, and
  Linux ROCm only when `gfxTarget` is in **that platform's own** `gfxTargets` row — Linux and
  Windows ROCm are compiled for different chip sets (T1).
**Accepted when:** `gpu-detector.test.ts` and `rocm-prereqs.test.ts` cover the vendor ids, the
kfd → gfx mapping, each distro family, and every `backendOptions` gate.

### T6 — Preset writer (§C2) — after T1's alias table
New `desktop/src/main/engine/model-presets.ts`.
- `[*]` global (`ctx-size`, `sleep-idle-seconds`) plus one section per model id **present in
  the cache scan** — a stale section resurrects a deleted model as a ghost row (probed).
- Per-model keys; long forms only; the extra-flag tokeniser (`--key value` → `key = value`,
  bare `--key` → `key = 1`); alias normalisation through the pin's table before the
  reserved-key denylist — **and the denylist must strip a leading `no-` after normalising**,
  because a negative spelling normalises to its own canonical key and would otherwise walk
  straight past it (T1).
- **Written temp-file + rename, the way `download-manifest.ts` writes (R3-2)** — `~/.youcoded/`
  is shared between the dev instance and the built app, so two supervisors can rewrite this
  file at once, and a half-written one is fatal to engine startup.
- **A saved flag is validated by running the binary, not by its shape (R3-1).** Write the flag
  into a throwaway preset holding only that section and run the binary against it with an empty
  `--models-dir`; a non-zero exit rejects the save and shows the binary's own stderr line
  verbatim. Shape plus a denylist accepts any plausible typo, and an unrecognised key in ANY
  section makes llama-server exit 1 at startup — probed.
**Accepted when:** `model-presets.test.ts` pins the `[*]` values, omitted defaults, only-present
ids, escaping, the tokeniser, alias normalisation and reserved-key rejection; `probe-presets.mjs`
re-proves on the pinned binary that `[*]` is honoured, that a per-model section overrides it,
that a sectioned model reports `source: preset`, and that a bad key is rejected before it can
be saved.

### T11 — Estimator (§D2, §D3) — after T10
File: `desktop/src/main/model-manager/fit-estimator.ts`.
- Layer map: **consume `header.slidingLayers` from T10** — the resolved per-layer mask lives in
  `gguf-header.ts`, not here, so its rule and its test stay together. Sliding layers keep
  `min(context, slidingWindow)` tokens **at `key_length_swa` / `value_length_swa` when present**
  (half-width in Gemma 4); `full_attention_interval` layers that are recurrent contribute 0 KV;
  `shared_kv_layers = n` subtracts the **trailing** n layers (on Gemma 4 E2B only the first 15
  of 35 store their own KV).
- **Head counts come from `header.headCountKvLayers`, per layer — NEVER the scalar** (found
  building T10). Gemma 4's larger models write `head_count_kv` as a per-layer array (12B: 48
  entries, 8 on sliding layers and 1 on full-attention ones), and a flat 8 over-sizes the
  full-attention layers eightfold. The scalar `headCountKv` is the array's maximum, so reading
  it over-counts rather than under-counts — but it is still wrong.
- `kvBytes` per kept token = `kvHeads × (dK×bytes(kType) + dV×bytes(vType))`, `f16 = 2`,
  `q8_0 = 1`, + 6 % block overhead.
- **The verdict tiers (R2-10, corrected by R3-3):** `need = model + vision + kv + 512 MB`.
  `≤ (pool − loadedBytes) × 0.9` → fits; `≤ pool − loadedBytes` → tight; **above the pool but
  `≤ pool − loadedBytes + MemAvailable` → tight**, because that model splits across GPU and
  system RAM and runs (`-ngl` defaults to `auto`); only above that → too large. The KV term may
  raise a verdict to tight, never to too-large.
  **This is the difference between a warning and a hard block** — `RuntimeBinding.tsx` refuses
  to create a session on `too-large`, and §D4 makes it non-dismissible.
- Pool = the first GPU device's `totalMiB` from the `.complete` marker (T2); CPU-only installs
  use total RAM. Available = Linux `/proc/meminfo` MemAvailable, macOS `vm_stat` free +
  inactive + purgeable, Windows `os.freemem()` documented as "free only". `loadedBytes` sums
  **`loaded` rows only** — a sleeping model's memory is freed.
- Headline is the one numbers line; `breakdown.advice` = "Lower this model's context length in
  its Settings to shrink this." when tight or too large.
- `contextLengthFor(modelId)` = per-model setting ?? engine `contextSize`; `quants()` uses the
  engine's, `memoryCheck` and `installedModels` the model's own.
**Accepted when:** `fit-estimator.test.ts` pins the formula, all four tiers including the
split-offload one, "KV may reach tight, never too-large", and loaded-not-sleeping.

### T14 — Vision in the listing (§E1) — after T13
`groupQuantOptions` keeps its mmproj denylist for the quant list but also returns the repo's
projector (prefer `mmproj-F16.gguf`, then `BF16`, then the first `mmproj*`); every
`QuantOption` of that repo carries `visionBytes` and `visionFile`.

---

## Wave 3

### T4 — setBackend: device check, real load, discard rules (§A4) — after T2, T3
File: `desktop/src/main/engine/engine-manager.ts`.
- After `install()`: for `cuda` / `rocm` the marker must list a device with the matching prefix,
  or the install is discarded — **only if this call created it** (the existing `preexisting`
  guard) — with the "found no graphics chip it can use" sentence quoting the engine's real last
  stderr line.
- A binary that fails to START gets its own sentence quoting the real stderr, not that one.
- Then `verifyBoot`, then **a real 1-token load** of the smallest complete model: a failure
  naming a device or kernel image discards a this-call install; any other load error (corrupt
  GGUF, unsupported arch, OOM) is reported and nothing is discarded. No model on disk → the
  load step is skipped and the row says "Checked when your first model loads".
- Config is written only after every check passes. `install()` for the Vulkan default is
  untouched — its CPU fallback is by design.
**Accepted when:** `engine-manager.test.ts` covers all five cases named above.

### T7 — Supervisor: config at every spawn, preset on the command line (§B, §C2) — after T6
File: `desktop/src/main/engine/engine-supervisor.ts`.
- A `readConfig()` callback replaces frozen constructor values, so a restart picks up new flags.
- Conditional `--spec-default` and `--cache-type-k q8_0`; `--models-preset <abs path>`; `-c` and
  `--sleep-idle-seconds` come OFF the command line (they now live in `[*]`).
- **The spawn must boot without the preset (R3-2).** A missing or unreadable preset is itself a
  startup error (probed: `preset file does not exist` → exit 1), so when the file cannot be
  written or read back, `--models-preset` is omitted and the engine falls back to today's `-c` /
  `--sleep-idle-seconds` command line — the one case where they return. The card says per-model
  settings are not in force for that run.
- **A preset that fails to initialise is retried once with the offending model's section
  omitted (R3-1)**, so one bad model cannot take the engine down; that model gets
  `lastLoadError`.
- Per-model in-flight counting in `trackedFetch`, read from the request body's `model` — the
  engine-wide `inFlight` and the session ref-count are NOT the signal, because a model with an
  open chat never releases its ref.
- The idle stop is skipped while any resident model is keep-loaded.
**Accepted when:** `engine-supervisor.test.ts` pins both speed branches, the preset on the
spawn, the absence of `-c` / `--sleep-idle-seconds` in the normal case AND their return in the
fallback case, the section-omitting retry, the per-model counting, the keep-loaded idle skip,
and `loadedModelsBytes` over loaded-not-sleeping rows.

### T8 — Storage, `engine:set-config`, context resolution (§Storage, §B, §C1, §C3) — after T6
- `config.json` `engine.speed` and `engine.models`; the header comment corrected from "syncable"
  to "the `engine` section is per-machine". Written through the existing locked `mutateJson`.
- One channel `engine:set-config(patch)` with `{ contextSize?, speed? }`.
  **`speed` restarts behind the same bounded idle wait as §C2's pending apply (R3-5)** —
  `stop()` has no in-flight guard, so an immediate restart kills a streaming reply, which is the
  opposite of what contract R19 promises. `contextSize` rewrites `[*]` and reloads; no restart.
  `engine:set-context` stays as a thin alias for existing callers, Android stub included.
- `effectiveContextWindow(modelId)` fetches **`/props?model=<id>`** — the bare `/props` is the
  router's dummy and answers `n_ctx: 0` even with a model loaded (probed). Unloaded → fall back
  to `contextLengthFor(modelId)`.

### T15 — Folder layout, the two-file download, cache scan, delete (§E2) — after T13, T14
- A model with a projector lives at `<cacheDir>/<id>/<id>.gguf` (split parts likewise) +
  `<cacheDir>/<id>/mmproj-F16.gguf`, manifest and `.partial` files inside the folder. Text-only
  models stay flat.
- **A fresh download of such a repo fetches BOTH files in one job (R3-22)** — one `downloadId`,
  `totalBytes` summed so the percentage covers both. This, not Add vision, is what contract R3
  ("always downloads its vision file; there is no switch to skip it") asks for. A failed
  projector leg leaves the model **complete**, in `'available'`, with its Add-vision link.
- **Two handoffs from T14, both required or vision stays invisible:**
  1. **Nothing yet WRITES `quant.visionFile` into the manifest.** T13's `writeManifest` only
     carries a projector forward from a prior manifest of the same publisher, so a first-ever
     download of a vision repo still produces a manifest with no `visionFile` — and §E2's
     `vision: 'available'` state can never be reached. T15 adds
     `...(quant.visionFile ? { visionFile: quant.visionFile } : {})` to `writeManifest`.
  2. **`QuantOption.totalSizeBytes` deliberately excludes the projector**, so `model-manager`'s
     free-disk guard currently under-reserves a vision download by the projector's size — about
     850 MB for gemma-3-12b. The summing belongs in the download job, not the quant option, so
     T15 is where it is fixed. Left unfixed, a user with just enough free space passes the check
     and then runs out mid-download.
  3. **The size the user READS and the fit label beside it now disagree** (found reviewing T14).
     `LocalModelsSection.tsx:51-53` already computes `download = totalSizeBytes + visionBytes`,
     but `fitFor` is still called with `totalSizeBytes` alone (`model-manager.ts:72`). So the
     moment T14 lands, gemma-3-12b's row grows ~0.85 GB and Qwen2.5-Omni's ~2.6 GB with no
     visible explanation, and the fit label can read "fits" on a machine where the real download
     is tight. T15 passes `totalSizeBytes + (visionBytes ?? 0)` to `fitFor`.
- **The projector must NOT go into any quant's `files` list.** T14 kept it a separate field on
  purpose: `files` being a complete `1..N` split of one quant is what makes "the files on disk
  are complete" safe to judge from filenames alone, and a projector in there would let a
  concurrent render stamp `completedAt` while the projector is still downloading.
- `cache-scan.ts` scans one level of folders: `vision: 'ready'` when an `mmproj*` is present,
  `'available'` when the manifest carries `visionFile` but no `mmproj` is (also the
  crash-recovery state), else `'none'`.
- `deleteModel` removes the folder and prunes `engine.models[id]`.
**Accepted when:** `cache-scan.test.ts` pins the folder scan and all three vision states;
`probe-download.mjs` gains the folder case and `probe-vision.mjs` asserts the router reports
image modality and answers an image round-trip.

### T19 — The live hardware line (§G) — after T2
`status()` gains `loadedModelsBytes` (loaded rows only) and `lastReply`. The streaming
completion's final frame carries `timings.prompt_per_second` / `predicted_per_second` (verified
on b10665); `provider-registry.ts`'s local fetch wrapper, where `withPrefillProgress` taps the
stream, reads it and calls `engineManager.recordReply(...)`, which emits `status-changed`.

---

## Wave 4

### T9 — Pending apply, keep-loaded, delete, load errors (§C2) — after T6, T7, T8
- A settings save writes `engine.models[id]` with `pendingApply: true` and does NOT touch
  `models.ini` — every `?reload=1` diffs presets and would unload a changed model mid-reply.
- Apply runs when that model has no in-flight request: write `models.ini` → `?reload=1` →
  unload the changed models. Bounded — at the next idle moment or after 10 minutes regardless;
  the dialog footer says "Applies after the current reply" while pending.
- `refreshModels()` merges pending changes only for idle models.
- The last-session release handler skips keep-loaded models; `deleteModel` prunes the entry.
- `ModelSettings.lastLoadError` has **two** sources: the router row's failure text, and T7's
  startup rejection for a model that never got a row.

### T12 — The remembered memory warning (§D4) — after T8, T11
`ModelSettings.memoryWarningDismissed: { at, contextLength } | null`, where `contextLength` is
the **resolved effective** length (`contextLengthFor(id)`) at dismissal — **not a bare
timestamp (R3-4)**, which cannot answer "same length?", and not the sibling `contextLength`,
which is `null` for a model on the engine-wide default and would keep a stale dismissal alive
when the engine-wide context is raised. `memoryCheck` returns `ok` for a `tight` verdict when
the stored length equals the current one; any change on either side asks again; `too-large` is
never dismissible.

### T16 — Backfill for pre-feature downloads (§E3) — after T13, T15
A complete set with no manifest resolves its repo once — the curated list's `hfRepo` whose
default quant's filename matches, else one HF search on the filename stem. A hit writes a
manifest with `completedAt`, `repo`, `quant` and `visionFile`; a miss is recorded as
`repo: null` so it costs one lookup per model, ever. Runs lazily from `installedModels()`, off
the main render path, one model at a time. This is what gives Destin's existing Gemma 4 12B its
eye and its Add-vision link.

### T17 — `models:add-vision` (§E4) — after T15
Wait for no in-flight request on that model (bounded, as T9) → `POST /models/unload` → **poll
`GET /models` until the row reads `unloaded`** (bounded 15 s; a timeout aborts with "The model
is still busy — try again in a moment") → create the folder → move the **manifest first**, then
every part, moving back what moved if any rename fails and reporting the OS error → download the
projector through the normal downloader on the usual progress stream → `?reload=1` →
`refreshModels()`.

### T18 — Vision reaches the harness (§E5) — after T15
`EngineSupervisor.listModels()` keeps `architecture.input_modalities`; `CatalogModel.
supportsVision` for local rows = includes `'image'`; the vision resolver in `ipc-handlers.ts`
reads the catalog for `local-engine` as it already does for OpenRouter.
**Not in this task:** the "trimmed image still counted as visible" harness bug, which this makes
reachable for real. It is its own PR.

---

## Wave 5

### T20 — Five-surface parity and the mockup renames (§H)
The six new channels — `engine:prereqs`, `engine:run-in-terminal`, `engine:set-config`,
`models:settings`, `models:set-settings`, `models:add-vision` — land on `ipc-handlers.ts`,
`preload.ts`, `remote-shim.ts`, `remote-server.ts` and `SessionService.kt` (desktop-only stubs
where appropriate), with `ipc-channels.test.ts` extended; then each comes OFF `mock-only.ts`.
Renames: `engine.setSpeed` → `engine.setConfig({speed})` and `models.dismissMemoryWarning` →
`models.setSettings({memoryWarningDismissed})`, in `useIpc.ts`, `EngineCard.tsx`,
`RuntimeBinding.tsx` (dropping the `as any` gate) and `mock-shim.ts`.
**Then `node scripts/workbench-boot-check.mjs`** — the unit suite has passed while the app
crashed at boot three times running.

### T23 — The three fields nothing draws (§H, R3-24)
Three signed rows describe text a user reads, and the mockup renders none of them:
- `breakdown.advice` (R8) — the size bubble in `LocalModelsSection.tsx` ends today in a
  hardcoded "includes X for an Nk context"; it gains the advice line when the estimator sets one.
- `breakdown.contextBytesIsUpperBound` (R1-25) — the same bubble says "up to" for the context
  share when the flag is set, because an upper bound stated as a precise number is fake precision.
- `ModelSettings.lastLoadError` (R26) — the settings dialog's only error line today is its own
  save failure; it gains a line for the model's last load error.
Without this task all three ship invisible and the acceptance grader fails three rows with no
code to point at.

---

## Wave 6

### T21 — Docs, rules, MAP, roadmap (§I)
- `youcoded/docs/engine-dependencies.md`: the spawn shape, the probed preset facts, the folder
  layout, `--list-devices` in the marker, the CUDA runtime asset, the ROCm assets and gfx list,
  the alias table.
- `.claude/rules/engine-local-models.md`: rewrite the five bullets §I names (flat-basename
  "never rename downloads", the mmproj denylist, "integrated GPUs fall back to RAM-only",
  "CUDA opt-in is Windows-x64-only", the `set-context` null trick).
- `native-runtime.md` rule and depth doc plus the `shared/types.ts` comment: `SessionProvider`
  has three members.
- `desktop/src/shared/engine-types.ts`: the `loadedModelsBytes` comment says "loaded **or
  sleeping**", the opposite of what ships — corrected to loaded rows only (R3-27).
- `docs/MAP.md`: the engine row gains the new modules, tests and probes **and `EngineCard.tsx`
  + `LocalModelsSection.tsx`, in no MAP or rule row today** (R3-28); the sessions row gains the
  shell provider; "On-disk state" gains `models.ini`, the `<id>/` folders and the header cache,
  **and its `config.json` row is amended** — it still says "native-runtime settings (engine
  cache dir, pins)" and the file now also holds the speed switches, the per-model settings and
  the dismissed warnings.
- Probes on every bump: the existing five + `probe-speed` + `probe-presets` + `probe-vision`
  + `probe-headers`.
- Roadmap: the nine items §I lists, with the residue each keeps. **Closing an item is three
  mechanical steps (R3-21)** — delete it from its area file, append one line to
  `docs/roadmap/shipped.md`, archive its report — then `node scripts/roadmap-check.mjs --fix`
  before committing.

### T22 — Acceptance (§J)
A fresh grader with no build context writes `local-engine-upgrades.contract.verdicts.json` for
all 32 rows, re-shooting the `deck` rows from the built branch against the real backend; then
`review-cards.py acceptance` builds the deck Destin answers.

**At merge (not before):** the five lifecycle documents move to `docs/archive/` — this plan,
the design, the contract folder, and the three review records. The one that **stays live** is
`docs/active/investigations/2026-09-04-local-model-runner-audit.md`, because the two rewritten
residue items still link it.
