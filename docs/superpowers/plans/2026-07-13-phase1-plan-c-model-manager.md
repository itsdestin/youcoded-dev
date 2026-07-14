# Phase 1 Plan C — Model Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-developer can install a local model entirely in-app: a curated unsloth-first catalog with honest fit estimates, Hugging Face search with quant parsing (incl. unsloth dynamic quants and multi-part splits), resumable downloads with progress into the llama.cpp cache, a Settings → Local Models panel, and Ollama/LM Studio one-click endpoint detectors. Exit test: pick a recommended unsloth model in-app, watch it download, chat offline.

**Architecture:** A new `desktop/src/main/models/` module tree of mostly-pure units: `quant-parser.ts` (GGUF filename → quant + plain-language quality + multi-part grouping + mmproj/mtp denylist), `fit-estimator.ts` (GPU-aware fits/tight/too-large labels, pure) + `gpu-detector.ts` (best-effort dedicated-VRAM probe, impure), `curated-catalog.ts` (shipped list + raw-GitHub refresh, announcements pattern), `hf-client.ts` (HF search + repo file tree, defensive parse), `model-downloader.ts` (resumable multi-part downloads into the GGUF cache with progress push events), `endpoint-detectors.ts` (Ollama/LM Studio probes → openai-compatible provider entries). The renderer gets `LocalModelsSection.tsx`, which absorbs Plan B's `EngineCard` and adds backend picker + context knob. Everything dormant behind `YOUCODED_NATIVE=1`.

**Tech Stack:** TypeScript (Electron main + React renderer), Hugging Face Hub HTTP API, llama.cpp GGUF cache conventions (established by Plan B), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-10-phase1-engine-providers-design.md` §4 (+ §0 decision 3, §5). **Depends on Plan B merged** (`2026-07-13-phase1-plan-b-local-engine.md`): EngineManager, cache-scan, `engine:*` IPC, EngineCard.

---

## Amendments (post-planning decisions — Destin, 2026-07-13)

**Read this first — it modifies Task 4.**

1. **No coder tier.** Drop the placeholder `coder`-tier entries (`qwen3-coder-30b`, `devstral-small`) from Task 4's catalog. Decision: the general Qwen 27B/35B-class models outperform Qwen3-Coder on most metrics, so coding is covered by the everyday/large tiers — there is no dedicated `coder` tier. (The curated model LIST is still pending Destin's final confirmation, now informed by a 2026-07-13 research pass: Qwen3.5 [0.8B–397B], Qwen3.6 [27B, 35B-A3B, incl. MTP speed variants], and Gemma 4 [E2B/E4B/12B/26B-A4B/31B] all have real unsloth GGUFs; don't hardcode sizes — Task 5's hf-client fetches real per-quant sizes.)

2. **DiffusionGemma is OUT of v1 — do NOT list it, and do NOT add any "supported/unsupported" concept to the catalog or browser.** Keep it dead simple: everything the catalog lists is runnable on the bundled `llama-server`. DiffusionGemma is a block-diffusion model `llama-server` can't run (needs the unmerged llama.cpp PR #24427 + a separate `llama-diffusion-cli` runner); listing it with a "not yet supported" badge was considered and rejected as over-complicated for v1. It's deferred as a follow-up (tracked in `docs/knowledge-debt.md`) — revisit only once llama.cpp merges diffusion support into mainline AND `llama-server` (not just the diffusion-cli) serves it.

## Amendments (finalization pass — Destin, 2026-07-14)

**Read this SECOND — it is authoritative and supersedes any conflicting code block below. Every task section has been updated to match; where a snippet still disagrees, THIS list wins.** Rationale for each decision is in the session review that produced it.

**A. Three tiers, confirmed.** `ModelTier = 'small' | 'everyday' | 'large'`. The union, the `validList` allowlist in `curated-catalog.ts`, and the panel's tier headers are the THREE coupled spots — change them together.

**B. The curated list is CONFIRMED (11 models, real unsloth repos, live per-quant sizes).** Default quant is `UD-Q4_K_XL` for every entry (unsloth's recommended dynamic quant; for gpt-oss every quant is within a GB so it's a fine default there too). Seeded in Task 4. The list is *recommendations only* — see decision C.

| Tier | id | label | hfRepo |
|---|---|---|---|
| small | `qwen35-2b` | Qwen3.5 2B | `unsloth/Qwen3.5-2B-GGUF` |
| small | `qwen35-4b` | Qwen3.5 4B | `unsloth/Qwen3.5-4B-GGUF` |
| small | `gemma4-e4b` | Gemma 4 E4B | `unsloth/gemma-4-E4B-it-GGUF` |
| everyday | `qwen35-9b` | Qwen3.5 9B | `unsloth/Qwen3.5-9B-GGUF` |
| everyday | `gemma4-12b` | Gemma 4 12B | `unsloth/gemma-4-12b-it-GGUF` |
| everyday | `gpt-oss-20b` | GPT-OSS 20B | `unsloth/gpt-oss-20b-GGUF` |
| everyday | `gemma4-26b-a4b` | Gemma 4 26B-A4B | `unsloth/gemma-4-26B-A4B-it-GGUF` |
| everyday | `qwen36-27b` | Qwen3.6 27B | `unsloth/Qwen3.6-27B-GGUF` |
| large | `qwen35-35b-a3b` | Qwen3.5 35B-A3B | `unsloth/Qwen3.5-35B-A3B-GGUF` |
| large | `gpt-oss-120b` | GPT-OSS 120B | `unsloth/gpt-oss-120b-GGUF` |
| large | `qwen35-122b-a10b` | Qwen3.5 122B-A10B | `unsloth/Qwen3.5-122B-A10B-GGUF` |

**C. The system RUNS ANY unsloth/HF GGUF — MTP, QAT, everything.** The curated list is recommendations, NOT the set of runnable models. The "Add from Hugging Face" search flow (Task 9 §4) is the arbitrary-model path and MUST survive messy real repos. This raises the bar on the quant parser (decision E).

**D. NO baked curated sizes. Compute fit from LIVE quant sizes.** Drop `CuratedQuant`/`quants[]`/`sizeBytes` from the curated seed entirely — it was a drift-prone maintenance tax and made every card falsely read "fits" until hand-filled. A `CuratedModel` is now `{ id, label, hfRepo, quantDefault, contextLength?, tier, notes? }`. The panel fetches `models.quants(hfRepo)` for the ≤11 curated repos on open (the same call it already makes; cached 24h), reads the default-quant size, and computes the fit label from that. Always accurate, zero maintenance.

**E. Quant-parser hardening (Task 2 rewritten with REAL fixtures).** Verified against live trees:
- Add `MXFP4`/`MXFP4_MOE` to the quant grammar + a `quantDescription` branch (gpt-oss / MoE native format).
- **Aux-file denylist:** drop any file whose BASENAME starts (case-insensitively) with `mmproj` or `mtp-`. Real repos ship uppercase `mmproj-BF16.gguf` vision projectors (which the old regex wrongly parsed as a "BF16" chat quant AND collided with the real `…-BF16.gguf`, dropping BOTH), and speculative-decode draft models in an `MTP/` subfolder / `mtp-*.gguf` (basename check catches both). These are NOT chat models.
- **Unrecognized quant token → drop silently** (chosen over a permissive "offer as other" fallback, which would re-admit the mmproj/mtp pollution). The recognized families — standard `Q*`/`IQ*`, unsloth `UD-*`, floats `F16/F32/BF16`, and `MXFP4(_MOE)` — cover essentially every unsloth/HF GGUF.

**F. Fit estimator is GPU-AWARE (Task 3 expanded: new `gpu-detector.ts`).** RAM-only under-promised on discrete-GPU machines (llama.cpp offloads to VRAM). New model:
- `estimateFit(modelBytes, totalMemBytes, totalVramBytes | null)` — layered: `model+kv ≤ ~90% VRAM` → **fits** ("Runs fast — fits on your GPU"); else `≤ VRAM + ~70% RAM` → **fits/tight** ("Runs well — uses your GPU plus memory"); else RAM-only labels; else **too-large**.
- **Safety bias:** VRAM can only ever UPGRADE a verdict, and only when a real DEDICATED GPU's VRAM was confidently probed. Anything uncertain → `totalVram = null` → today's RAM-only path. Never worse than RAM-only, never over-promises on an unconfirmed GPU.
- `gpu-detector.ts` (main, cached, all try/catch → null): **Win** = registry `HardwareInformation.qwMemorySize` and/or `nvidia-smi` (NOT `Win32_VideoController.AdapterRAM` — 32-bit, caps at 4 GB, lies); **macOS** = Apple-Silicon unified memory → `totalVram ≈ 0.7 × totalMem`, Intel → `system_profiler`; **Linux** = `nvidia-smi` / AMD `/sys/class/drm/card*/device/mem_info_vram_total` / else null. **Integrated GPUs (Intel iGPU / AMD APU) → treated as no dedicated VRAM → RAM-only** (their memory is shared RAM; counting it double-counts). The estimator stays PURE (vram injected); the detector is the impure, best-effort part. (Displaying the detected GPU NAME in the engine card was dropped — it would force an `EngineStatus`/`status()` change for a cosmetic label; the fit labels already convey the GPU benefit. `GpuInfo.name` is still captured for future use/diagnostics.)

**G. CUT from v1: set-default-per-tier AND last-used stamps.** Remove `setDefaultForTier`/`defaultModelByTier` (a stored default the picker never consumed — a knob that does nothing is worse than none) and `noteModelUsed`/`lastUsedAt` (a debounced config-lock write-behind + provider-registry hook, all for a cosmetic "Last used" label). Both leave `InstalledLocalModel` (drop `lastUsedAt` + `defaultForTier`), EngineManager (no `noteModelUsed`/`setDefaultForTier`), provider-registry (no `noteModelUsed` hook), and the panel (no default badge / last-used line). Re-add when the picker actually uses a default.

**H. Multi-part router-id is VERIFIED, not assumed (Task 10 probe expanded).** `probe-download.mjs` splits the tiny 0.4 GB test model with `llama-gguf-split` (ships in the same archive as `llama-server`), drops both parts flat in the cache, and asserts the router serves the model under the `-00001-of-00002` id `cache-scan.ts` derives. The large tier's defaults (gpt-oss-120b, Qwen3.5-122B) are multi-part, and can't be validated on a 32 GB machine, so this deterministic split-probe is the ONLY verification of that path.

**I. Plan-defect fixes (from the substrate-verification pass).**
- `engine:set-context` is a real channel, declared in the Task 1 constants block. It is wired end-to-end (preload / remote-shim / ipc-handler / Kotlin stub + `EngineManager.setContext` + the panel knob) ENTIRELY in Task 9, which ALSO extends Task 8's parity `channels` array with `['engine:set-context','ENGINE_SET_CONTEXT']`. Keeping the wiring and its parity entry in the same task keeps each task's tests self-consistent (Task 8 must stay green before Task 9 starts).
- Task 8's parity `describe` must be self-contained (own `read` helper, like the `engine:*` describe) and assert the ipc-handlers side via `IPC.MODELS_*` CONSTANT identifiers — the handlers use constants, so checking literal `'models:*'` strings there would always fail.
- `engine-manager.ts` currently imports only `path`; `deleteModel` needs `import * as fs`.
- Curated `notes` and hf-client error strings with apostrophes (`"OpenAI's…"`, `"…this model's files…"`) must use double quotes / escapes — the single-quoted snippets as written are TS syntax errors.

**J. Smaller UX/robustness (Task 9 / Task 6).**
- "Add from Hugging Face" shows the RECOMMENDED few quants (UD-Q4_K_XL, Q4_K_M, Q8_0) with an "Show all N" expander — a raw 15–24-row quant list per repo is hostile to a non-technical user.
- Orphaned `.partial` files (cancel a 55 GB download → invisible lost disk, since `scanGgufCache` only counts `.gguf`) get a cleanup affordance: the panel surfaces in-progress/partial downloads with "Resume / Discard".
- Disk guard: when `cacheDir` doesn't exist yet, `statfs` the nearest EXISTING ancestor instead of skipping the check.

## Context primer (read once before any task)

Repo: the `youcoded` sub-repo (`youcoded-dev/youcoded`). Desktop app lives in `desktop/`. **Work in a worktree, branched from master AFTER Plan B has merged:**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded.wt/model-manager -b feat/native-model-manager
cd ../youcoded.wt/model-manager/desktop
cmd //c "mklink /J node_modules ..\\..\\..\\youcoded\\desktop\\node_modules"   # share deps; REMOVE junction (cmd //c "rmdir node_modules") BEFORE any git worktree remove
```

Run tests from `desktop/`: `npx vitest run tests/<file>.test.ts` (single file), `npm test -- --run` (all).

**Codebase facts every task relies on** (verify each against post-Plan-B master before starting — Plan B may have drifted details):

1. **Plan B substrate:** `src/main/engine/engine-manager.ts` (EngineManager: `status()`, `install()`, `restart()`, `registryHook()`, `catalogModels()`, events `install-progress`/`status-changed`; constructed in `ipc-handlers.ts` next to the Plan A native stack). `src/main/engine/engine-config.ts` (`readEngineConfig`/`updateEngineConfig` — `cacheDir`, `backend`, `contextSize` in `~/.youcoded/config.json`). `src/main/engine/cache-scan.ts` (`scanGgufCache`, `ggufIdFromFileName`, the `-00001-of-000NN` multi-part convention). `src/main/engine/engine-pin.ts` (`pickAsset`, `defaultBackend`; **CUDA assets exist for Windows only** — upstream ships no Linux CUDA build). `src/shared/engine-types.ts` (EngineBackend/EngineStatus/EngineModel). `src/renderer/components/EngineCard.tsx` rendered inside `ProvidersSection.tsx`.
2. **Model ids are GGUF filenames minus `.gguf`** (cache-scan convention, probe-pinned by `test-engine/probe-models.mjs` and recorded in `docs/engine-dependencies.md`). The downloader MUST write files whose names produce the ids the router serves — download destination filename = the HF file's basename (flat, into the cache dir root). If Plan B's probe recorded a different router-discovery convention, follow engine-dependencies.md, not this sentence.
3. IPC constants live in TWO places with identical values (`src/shared/types.ts` `IPC` object + preload's inlined copy); `tests/ipc-channels.test.ts` cross-checks them and hosts the per-channel parity describes (mirror the `engine:*` describe Plan B added). Android stub = add channel strings to the combined `not-implemented-on-mobile` case in `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`. `remote-server.ts` gets a case row per channel (try/catch → `{ok:false,error}` for throw-prone calls); push events also `remoteServer?.broadcast(...)`.
4. Broadcast helper in ipc-handlers.ts: `send(channel, ...args)` (all windows). Push-subscription pattern: preload `ipcRenderer.on` + returned unsubscribe; remote-shim channel-name dispatch (Plan B's `engine:install-progress` is the closest template).
5. `ProviderRegistry.upsert()` (`src/main/providers/provider-registry.ts`) creates `openai-compatible` provider entries — the endpoint detectors reuse it via the EXISTING `provider:upsert` IPC; no new write path.
6. External-schema discipline: every consumed HF API field gets a `docs/provider-dependencies.md` entry; parse defensively — absent fields omitted, never guessed (model-catalog.ts is the style reference).
7. Every non-trivial edit gets a WHY comment. Commit messages: conventional prefixes + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Plain words in UI, never `●◐○` glyphs. Destructive actions (model delete) are consequence-gated (explicit confirm with plain-language consequence).
8. Curated remote refresh follows the announcements pattern (`src/main/announcement-service.ts` is the reference: raw.githubusercontent.com fetch, cache file, fetch-failure falls back silently).

**Hugging Face API facts** (2026-07-13; record in provider-dependencies.md in Task 5):

- Search: `GET https://huggingface.co/api/models?search=<q>&filter=gguf&sort=downloads&limit=30` → JSON array; per row we consume `id` (string, `"owner/repo"`), `downloads` (number), `likes` (number). Rows without a string `id` are skipped.
- File tree: `GET https://huggingface.co/api/models/<owner>/<repo>/tree/main?recursive=true` → JSON array of `{ type: 'file'|'directory', path, size, lfs?: { oid, size } }`. `lfs.oid` is the file's SHA-256 (GGUFs are LFS objects). **`recursive=true` is required** — unsloth repos put dynamic quants in subfolders (e.g. `UD-Q4_K_XL/Model-UD-Q4_K_XL-00001-of-00002.gguf`).
- Download: `GET https://huggingface.co/<owner>/<repo>/resolve/main/<path>` → 302 to CDN (Node fetch follows); supports `Range` (resume).

**File map (created →/modified ✎):**

| File | Role |
|---|---|
| → `desktop/src/shared/model-manager-types.ts` | CuratedModel/QuantOption/FitEstimate/GpuInfo/DownloadProgress/InstalledLocalModel/DetectedEndpoint |
| → `desktop/src/main/models/quant-parser.ts` | GGUF filename → quant + description + multi-part grouping (pure) |
| → `desktop/src/main/models/fit-estimator.ts` | GPU-aware fit heuristic + disk guard (pure; mem/vram/disk injected) |
| → `desktop/src/main/models/gpu-detector.ts` | best-effort dedicated-VRAM probe (impure, per-platform, cached) |
| → `desktop/src/main/models/curated-catalog.ts` + `curated-models.ts` | shipped seed + raw-GitHub refresh |
| → `desktop/src/main/models/hf-client.ts` | HF search + tree + resolve URLs (defensive) |
| → `desktop/src/main/models/model-downloader.ts` | resumable multi-part downloads + progress + cancel + sha256 |
| → `desktop/src/main/models/endpoint-detectors.ts` | Ollama/LM Studio localhost probes |
| → `desktop/src/main/models/model-manager.ts` | composition root for the models:* IPC surface |
| → `desktop/src/renderer/components/LocalModelsSection.tsx` | the Settings → Local Models panel |
| → `youcoded/curated-models.json` (repo root) | remote-refreshable curated list (announcements pattern) |
| ✎ `desktop/src/shared/types.ts` + `desktop/src/main/preload.ts` | `models:*`/`endpoints:detect`/`engine:set-backend` constants + namespaces |
| ✎ `desktop/src/main/engine/engine-manager.ts` | `setBackend()`, `deleteModel()`, `installedModels()`, `setContext()` (+ `import * as fs`) |
| ✎ `desktop/src/main/ipc-handlers.ts`, `remote-shim.ts`, `remote-server.ts`, `SessionService.kt` | IPC wiring + stubs |
| ✎ `desktop/src/renderer/components/{ProvidersSection,SettingsPanel}.tsx` | move EngineCard, mount the new panel |
| ✎ `desktop/tests/ipc-channels.test.ts` | `models:*` parity describe |
| ✎ `desktop/test-engine/` | probe-download.mjs (downloader naming vs router discovery) |
| ✎ `youcoded/docs/{engine-dependencies,provider-dependencies}.md` | new couplings |
| ✎ (workspace repo) `docs/PITFALLS.md`, roadmap Progress line | final task |

---

### Task 1: Shared types + IPC constants

**Files:**
- Create: `desktop/src/shared/model-manager-types.ts`
- Modify: `desktop/src/shared/types.ts` (after Plan B's `ENGINE_STATUS_CHANGED`)
- Modify: `desktop/src/main/preload.ts` (inlined IPC copy — same rows)

- [ ] **Step 1: Create `desktop/src/shared/model-manager-types.ts`**

```ts
// Model-manager shapes — Phase 1 Plan C (spec 2026-07-10-phase1-engine-providers-design.md §4).
// Shared between main and renderer; keep free of Node/Electron imports.

// Three tiers (Amendment 2026-07-14 A). No 'coder' tier. This union, the
// validList allowlist in curated-catalog.ts, and the panel's tier headers are
// the THREE coupled spots — change them together.
export type ModelTier = 'small' | 'everyday' | 'large';

/** Spec §4.1 entry shape. NO baked sizes (Amendment 2026-07-14 D): fit is
 *  computed from LIVE models.quants(hfRepo) sizes, so the seed carries only
 *  what can't be derived. quantDefault names the quant the card downloads and
 *  sizes/fits against. */
export interface CuratedModel {
  id: string;             // stable curated id, e.g. 'qwen35-4b'
  label: string;          // display name, e.g. 'Qwen3.5 4B'
  hfRepo: string;         // 'unsloth/Qwen3.5-4B-GGUF'
  quantDefault: string;   // e.g. 'UD-Q4_K_XL'
  contextLength?: number; // model's trained context (informational; engine -c governs)
  tier: ModelTier;
  notes?: string;         // one plain-language line shown on the card
}

/** One downloadable quant variant of an HF repo, after filename parsing. */
export interface QuantOption {
  quant: string;              // 'Q4_K_M', 'UD-Q4_K_XL', 'F16', …
  description: string;        // plain language: 'Recommended balance of quality and size'
  files: string[];            // repo-relative paths, multi-part sets in order
  totalSizeBytes: number;
  sha256ByFile: Record<string, string | null>; // from lfs.oid; null when HF omits it
}

export type FitLabel = 'fits' | 'tight' | 'too-large';
export interface FitEstimate {
  fit: FitLabel;
  // Every label is an EXPLICIT estimate (spec §4.3 — no fake precision).
  // GPU-aware (Amendment 2026-07-14 F): the label wording differs for a
  // fully-GPU-offloaded fit ("Runs fast — fits on your GPU") vs a GPU+RAM split
  // vs a RAM-only machine. See fit-estimator.ts for the exact strings.
  label: string;
}

/** Best-effort dedicated-GPU probe result (gpu-detector.ts). Both null when no
 *  dedicated GPU is confidently detected — the estimator then falls back to
 *  RAM-only. Integrated GPUs report null vram on purpose (shared system RAM). */
export interface GpuInfo {
  name: string | null;             // e.g. 'NVIDIA GeForce RTX 4090' — captured for diagnostics/future display (not shown in v1)
  totalVramBytes: number | null;   // dedicated VRAM; null = unknown/none → RAM-only fit
}

export interface HFSearchHit { repo: string; downloads: number; likes: number; }

export type DownloadState = 'downloading' | 'verifying' | 'done' | 'error' | 'cancelled';
export interface DownloadProgress {
  downloadId: string;
  repo: string;
  quant: string;
  state: DownloadState;
  receivedBytes: number;      // across ALL parts
  totalBytes: number;
  currentPart: number;        // 1-based
  parts: number;
  message?: string;           // plain language, present for state 'error'
}

// lastUsedAt + defaultForTier were CUT from v1 (Amendment 2026-07-14 G).
export interface InstalledLocalModel {
  id: string;                 // the router-served model id (filename minus .gguf)
  sizeBytes: number;          // summed across all parts for a split model
  quant: string | null;       // parsed from filename; null when unrecognized
  quantDescription: string | null;
  parts: number;              // 1 for single-file models
}

export interface DetectedEndpoint {
  kind: 'ollama' | 'lmstudio';
  label: string;              // 'Ollama (local)' / 'LM Studio (local)'
  baseUrl: string;            // the /v1 URL to store on the provider entry
  modelCount: number | null;
  alreadyAdded: boolean;      // an enabled openai-compatible provider with this baseUrl exists
}
```

- [ ] **Step 2: Add IPC constants** to `desktop/src/shared/types.ts` after `ENGINE_STATUS_CHANGED`, and the SAME rows to preload's inlined copy:

```ts
  // ---- Native runtime Plan C (Phase 1): model manager ----
  ENGINE_SET_BACKEND: 'engine:set-backend',
  ENGINE_SET_CONTEXT: 'engine:set-context',   // context-length knob (Task 9)
  MODELS_CURATED: 'models:curated',
  MODELS_SEARCH: 'models:search',
  MODELS_QUANTS: 'models:quants',
  MODELS_DOWNLOAD: 'models:download',
  MODELS_DOWNLOAD_CANCEL: 'models:download-cancel',
  MODELS_DOWNLOAD_PROGRESS: 'models:download-progress',  // push
  MODELS_DELETE: 'models:delete',
  MODELS_INSTALLED: 'models:installed',
  ENDPOINTS_DETECT: 'endpoints:detect',
```

(`models:quants`, `models:download-cancel`, and `engine:set-context` extend the spec §4.6 list: search returns repos, a second call lists a repo's quant variants; §4.4 requires cancel; §4.5 requires the context knob. The spec's channel list is a floor, not a ceiling — same parity discipline applies. `engine:set-context` is declared here so all Plan C channels live in one block; its handler lands in Task 9 but it MUST be in the Task 8 parity array — Amendment 2026-07-14 I.)

- [ ] **Step 3: Run the constant cross-check**

Run: `npx vitest run tests/ipc-channels.test.ts`
Expected: PASS (per-channel parity describe comes in Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/shared/model-manager-types.ts src/shared/types.ts src/main/preload.ts
git commit -m "feat(models): shared model-manager types + models:* IPC constants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Quant parser (pure, unsloth-fixture-tested)

**Files:**
- Create: `desktop/src/main/models/quant-parser.ts`
- Test: `desktop/tests/quant-parser.test.ts`

- [ ] **Step 1: Write the failing test** — `desktop/tests/quant-parser.test.ts`. The fixtures are REAL filename shapes from unsloth + standard GGUF repos (spec §4.2 requires real unsloth fixtures):

```ts
import { describe, it, expect } from 'vitest';
import { parseGgufName, groupQuantOptions, quantDescription } from '../src/main/models/quant-parser';

describe('parseGgufName', () => {
  it('parses standard quants', () => {
    expect(parseGgufName('Qwen3-4B-Instruct-2507-Q4_K_M.gguf')).toEqual({
      base: 'Qwen3-4B-Instruct-2507', quant: 'Q4_K_M', dynamic: false, part: null,
    });
    expect(parseGgufName('gemma-3-12b-it-Q8_0.gguf')?.quant).toBe('Q8_0');
    expect(parseGgufName('model-IQ2_XXS.gguf')?.quant).toBe('IQ2_XXS');
    expect(parseGgufName('model-F16.gguf')?.quant).toBe('F16');
    expect(parseGgufName('model-BF16.gguf')?.quant).toBe('BF16');
    // MXFP4 / MXFP4_MOE — gpt-oss / MoE native format (Amendment 2026-07-14 E).
    expect(parseGgufName('gpt-oss-20b-MXFP4.gguf')?.quant).toBe('MXFP4');
    expect(parseGgufName('gemma-4-26B-A4B-it-MXFP4_MOE.gguf')?.quant).toBe('MXFP4_MOE');
  });

  it('parses unsloth dynamic quants (UD- prefix)', () => {
    expect(parseGgufName('Qwen3-14B-UD-Q4_K_XL.gguf')).toEqual({
      base: 'Qwen3-14B', quant: 'UD-Q4_K_XL', dynamic: true, part: null,
    });
    expect(parseGgufName('gemma-3-27b-it-UD-IQ2_XXS.gguf')?.quant).toBe('UD-IQ2_XXS');
  });

  it('parses multi-part split suffixes', () => {
    expect(parseGgufName('Llama-4-Scout-17B-16E-Instruct-UD-Q4_K_XL-00001-of-00002.gguf')).toEqual({
      base: 'Llama-4-Scout-17B-16E-Instruct', quant: 'UD-Q4_K_XL', dynamic: true,
      part: { index: 1, of: 2 },
    });
  });

  it('DENYLISTS aux files — vision projectors + MTP draft models (real shapes)', () => {
    // Real repos ship UPPERCASE mmproj projectors next to the chat model. The
    // old regex parsed 'mmproj-BF16.gguf' as a "BF16" quant AND collided with
    // the real '<model>-BF16.gguf', dropping BOTH. Denylist by basename prefix.
    expect(parseGgufName('mmproj-BF16.gguf')).toBeNull();
    expect(parseGgufName('mmproj-F16.gguf')).toBeNull();
    expect(parseGgufName('mmproj-F32.gguf')).toBeNull();
    // MTP speculative-decode draft models — in an 'MTP/' subfolder and/or an
    // 'mtp-' basename. Not chat models. Basename check catches both.
    expect(parseGgufName('MTP/mtp-gemma-4-12B-it-Q4_0.gguf')).toBeNull();
    expect(parseGgufName('mtp-gemma-4-12B-it.gguf')).toBeNull();
    // Unrecognized / non-gguf → null (drop silently — Amendment 2026-07-14 E).
    expect(parseGgufName('README.md')).toBeNull();
  });
});

describe('groupQuantOptions', () => {
  // Real tree shape for ONE model: single quants at root, a multi-part set
  // under a per-quant subfolder (gpt-oss convention), an mmproj projector
  // (uppercase — must be excluded), and a README.
  const files = [
    { path: 'M-Q4_K_M.gguf', size: 9_000, sha256: 'a'.repeat(64) },
    { path: 'M-BF16.gguf', size: 30_000, sha256: 'd'.repeat(64) },
    { path: 'Q8_0/M-Q8_0-00001-of-00002.gguf', size: 5_000, sha256: 'c'.repeat(64) },
    { path: 'Q8_0/M-Q8_0-00002-of-00002.gguf', size: 4_000, sha256: null },
    { path: 'mmproj-BF16.gguf', size: 500, sha256: 'e'.repeat(64) },   // aux — must be excluded
    { path: 'README.md', size: 10, sha256: null },
  ];

  it('groups by quant, orders multi-part sets, sums sizes, excludes aux', () => {
    const opts = groupQuantOptions(files);
    // Multi-part set grouped in order, sizes summed.
    const q8 = opts.find((o) => o.quant === 'Q8_0')!;
    expect(q8.files).toEqual([
      'Q8_0/M-Q8_0-00001-of-00002.gguf',
      'Q8_0/M-Q8_0-00002-of-00002.gguf',
    ]);
    expect(q8.totalSizeBytes).toBe(9_000);
    expect(q8.sha256ByFile['Q8_0/M-Q8_0-00002-of-00002.gguf']).toBeNull();
    expect(opts.find((o) => o.quant === 'Q4_K_M')!.totalSizeBytes).toBe(9_000);
    // The REAL BF16 survives — mmproj-BF16 was denylisted, NOT merged into it
    // (the collision that dropped both in the pre-hardening parser).
    const bf16 = opts.find((o) => o.quant === 'BF16')!;
    expect(bf16.files).toEqual(['M-BF16.gguf']);
    expect(bf16.totalSizeBytes).toBe(30_000);
    expect(opts.some((o) => o.quant === 'README')).toBe(false);
    expect(opts.every((o) => !o.files.some((f) => f.includes('mmproj')))).toBe(true);
  });

  it('drops INCOMPLETE multi-part sets (a missing part = undownloadable)', () => {
    const partial = [{ path: 'M-UD-Q4_K_XL-00002-of-00002.gguf', size: 1, sha256: null }];
    expect(groupQuantOptions(partial)).toEqual([]);
  });
});

describe('quantDescription', () => {
  it('maps quant families to plain language', () => {
    expect(quantDescription('Q8_0')).toMatch(/highest quality/i);
    expect(quantDescription('UD-Q4_K_XL')).toMatch(/recommended/i);
    expect(quantDescription('IQ2_XXS')).toMatch(/smallest/i);
    expect(quantDescription('F16')).toMatch(/original/i);
    expect(quantDescription('MXFP4')).toMatch(/native/i);
    expect(quantDescription('MXFP4_MOE')).toMatch(/native/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/quant-parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `desktop/src/main/models/quant-parser.ts`**

```ts
// GGUF filename → quant metadata (spec §4.2). PURE — no fs/network — so the
// unsloth fixture tests pin every naming family we claim to support:
//   standard  …-Q4_K_M.gguf / …-Q8_0.gguf / …-IQ2_XXS.gguf / …-F16.gguf
//   unsloth   …-UD-Q4_K_XL.gguf (dynamic quants, often in a subfolder)
//   mxfp4     …-MXFP4.gguf / …-MXFP4_MOE.gguf (gpt-oss / MoE native 4-bit)
//   splits    …-00001-of-000NN.gguf (downloaded as a set, addressed via part 1)
// Aux files (mmproj* vision projectors, mtp-* draft models) are DENYLISTED —
// they are not chat models (Amendment 2026-07-14 E).
import type { QuantOption } from '../../shared/model-manager-types';

export interface ParsedGgufName {
  base: string;
  quant: string;               // includes the UD- prefix for dynamic quants
  dynamic: boolean;            // unsloth dynamic (UD-) quant
  part: { index: number; of: number } | null;
}

// Quant token grammar: optional UD- prefix, then (I)Q<digit>_SUFFIX, a raw
// float type, or MXFP4(_MOE) (gpt-oss / MoE native 4-bit). Anchored to a '-'
// separator and the .gguf extension so model names containing 'q4' mid-word
// can't false-match. Case-sensitive on purpose (lowercase float tokens never
// appear in real chat-model filenames).
const NAME_RE = /^(.+?)-(UD-)?((?:I?Q\d+_[A-Z0-9_]+)|Q\d+|F16|F32|BF16|MXFP4_MOE|MXFP4)(?:-(\d{5})-of-(\d{5}))?\.gguf$/;

// Aux-file denylist (Amendment 2026-07-14 E): vision projectors ('mmproj*',
// UPPERCASE in real repos) and MTP speculative-decode draft models ('mtp-*',
// often in an 'MTP/' subfolder — the basename check catches both). These are
// NOT chat models and must never appear as downloadable quants. Matched on the
// BASENAME, case-insensitively.
const AUX_BASENAME_RE = /^(mmproj|mtp-)/i;

export function parseGgufName(fileName: string): ParsedGgufName | null {
  const base = fileName.split('/').pop() ?? fileName; // callers may pass repo-relative paths
  if (AUX_BASENAME_RE.test(base)) return null;        // projector / draft model — skip
  const m = NAME_RE.exec(base);
  if (!m) return null;
  return {
    base: m[1],
    quant: `${m[2] ?? ''}${m[3]}`,
    dynamic: m[2] === 'UD-',
    part: m[4] ? { index: Number(m[4]), of: Number(m[5]) } : null,
  };
}

/** Plain-language quality/size description per quant family (spec §4.2). */
export function quantDescription(quant: string): string {
  const q = quant.replace(/^UD-/, '');
  if (/^MXFP4/.test(q)) return 'Native 4-bit — the format this model ships in, recommended';
  if (/^(F16|F32|BF16)$/.test(q)) return 'Original precision — largest download, no quality loss';
  if (/^Q8/.test(q)) return 'Highest quality quantization — near-original output';
  if (/^Q6/.test(q)) return 'Very high quality — slightly smaller than Q8';
  if (/^Q5/.test(q)) return 'High quality — a good step down in size';
  if (/^Q4/.test(q)) return quant.startsWith('UD-')
    ? 'Recommended — unsloth dynamic quant, best quality for the size'
    : 'Recommended balance of quality and size';
  if (/^(I?Q3)/.test(q)) return 'Compact — noticeable quality loss on hard tasks';
  return 'Smallest — significant quality loss, fits tight machines';
}

interface TreeFile { path: string; size: number; sha256: string | null; }

/** Group a repo's GGUF files into downloadable quant options. Multi-part sets
 *  are ordered by part index and must be COMPLETE — a set missing any part is
 *  dropped (downloading it would produce an unloadable model). */
export function groupQuantOptions(files: TreeFile[]): QuantOption[] {
  const byQuant = new Map<string, { files: { path: string; size: number; sha256: string | null; part: number }[]; of: number }>();
  for (const f of files) {
    const parsed = parseGgufName(f.path);
    if (!parsed) continue;
    const entry = byQuant.get(parsed.quant) ?? { files: [], of: parsed.part?.of ?? 1 };
    entry.of = Math.max(entry.of, parsed.part?.of ?? 1);
    entry.files.push({ path: f.path, size: f.size, sha256: f.sha256, part: parsed.part?.index ?? 1 });
    byQuant.set(parsed.quant, entry);
  }
  const out: QuantOption[] = [];
  for (const [quant, entry] of byQuant) {
    entry.files.sort((a, b) => a.part - b.part);
    const indices = entry.files.map((f) => f.part);
    const complete = indices.length === entry.of && indices.every((idx, i) => idx === i + 1);
    if (!complete) continue; // incomplete split set — undownloadable, skip
    out.push({
      quant,
      description: quantDescription(quant),
      files: entry.files.map((f) => f.path),
      totalSizeBytes: entry.files.reduce((s, f) => s + f.size, 0),
      sha256ByFile: Object.fromEntries(entry.files.map((f) => [f.path, f.sha256])),
    });
  }
  // Small-to-large reads naturally in the picker UI.
  return out.sort((a, b) => a.totalSizeBytes - b.totalSizeBytes);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/quant-parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/models/quant-parser.ts tests/quant-parser.test.ts
git commit -m "feat(models): quant parser — standard + unsloth dynamic quants + multi-part sets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: GPU-aware fit estimator + disk guard + GPU detector

**Files:**
- Create: `desktop/src/main/models/fit-estimator.ts` (pure)
- Create: `desktop/src/main/models/gpu-detector.ts` (impure, best-effort)
- Test: `desktop/tests/fit-estimator.test.ts`, `desktop/tests/gpu-detector.test.ts` (pure helpers only)

- [ ] **Step 1: Write the failing test** — `desktop/tests/fit-estimator.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { estimateFit, checkDiskSpace } from '../src/main/models/fit-estimator';

const GB = 1024 ** 3;

describe('estimateFit', () => {
  // ---- RAM-only path (no confident GPU → totalVram null) ----
  it('RAM-only: 4GB model on 16GB should run well', () => {
    expect(estimateFit(4 * GB, 16 * GB, null)).toEqual({
      fit: 'fits', label: 'Should run well on this machine',
    });
  });
  it('RAM-only: 9GB on 16GB is tight', () => {
    expect(estimateFit(9 * GB, 16 * GB, null)).toEqual({
      fit: 'tight', label: 'Will be tight — close other apps first',
    });
  });
  it('RAM-only: 20GB on 16GB is too large', () => {
    expect(estimateFit(20 * GB, 16 * GB, null).fit).toBe('too-large');
  });
  it('RAM-only boundaries: need ≤ 70% = fits; ≤ 90% = tight (need = size + 2GB)', () => {
    expect(estimateFit(5 * GB, 10 * GB, null).fit).toBe('fits');
    expect(estimateFit(5.1 * GB, 10 * GB, null).fit).toBe('tight');
    expect(estimateFit(7 * GB, 10 * GB, null).fit).toBe('tight');
    expect(estimateFit(7.1 * GB, 10 * GB, null).fit).toBe('too-large');
  });

  // ---- GPU-aware path (Amendment 2026-07-14 F) ----
  it('GPU fully offloaded: 16GB model on a 24GB GPU runs fast — even though RAM-only would reject it', () => {
    // RAM-only (16GB RAM) would say too-large; the GPU upgrades the verdict.
    expect(estimateFit(16 * GB, 16 * GB, null).fit).toBe('too-large');
    expect(estimateFit(16 * GB, 16 * GB, 24 * GB)).toEqual({
      fit: 'fits', label: 'Runs fast — fits on your GPU',
    });
  });
  it('GPU split: 20GB model, 8GB VRAM, 32GB RAM → runs across GPU + memory', () => {
    const r = estimateFit(20 * GB, 32 * GB, 8 * GB);
    expect(r.fit).toBe('fits');
    expect(r.label).toMatch(/gpu/i);
  });
  it('GPU present but model dwarfs VRAM + RAM → still too large', () => {
    expect(estimateFit(60 * GB, 16 * GB, 8 * GB).fit).toBe('too-large');
  });
  it('SAFETY BIAS: null VRAM never upgrades — identical to RAM-only', () => {
    expect(estimateFit(16 * GB, 16 * GB, null).fit).toBe('too-large');
  });
});

describe('checkDiskSpace', () => {
  it('passes when free space exceeds size + 5% margin, fails below', () => {
    expect(checkDiskSpace(10 * GB, 20 * GB)).toBeNull();
    expect(checkDiskSpace(10 * GB, 10.4 * GB)).toMatch(/free space/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/fit-estimator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `desktop/src/main/models/fit-estimator.ts`**

```ts
// Honest fit estimation (spec §4.3 + Amendment 2026-07-14 F): GPU-AWARE.
// llama.cpp offloads layers to VRAM, so a RAM-only estimate under-promises on
// discrete-GPU machines. Model of how memory is actually used:
//   - Will it RUN?  weights + KV must fit in VRAM + system RAM combined (a layer
//     lives in exactly one pool; CPU can run whatever the GPU can't hold).
//   - Will it run WELL?  how much fits in VRAM (all → fast; split → decent).
// SAFETY BIAS: VRAM only ever UPGRADES a verdict, and only when a real
// dedicated GPU's VRAM was confidently probed. totalVramBytes null/0 → the
// original RAM-only path, so we're never worse than before and never
// over-promise on an unconfirmed GPU. PURE: callers inject os.totalmem() and
// gpu-detector's totalVramBytes so tests pin every threshold.
import type { FitEstimate } from '../../shared/model-manager-types';

const GB = 1024 ** 3;
// Runtime overhead on top of the weights: KV cache at our default -c plus
// engine/OS headroom. Deliberately a blunt constant — precision here would be
// fake (spec: "No fake precision").
const OVERHEAD_BYTES = 2 * GB;

export function estimateFit(
  modelSizeBytes: number, totalMemBytes: number, totalVramBytes: number | null = null
): FitEstimate {
  const need = modelSizeBytes + OVERHEAD_BYTES;
  if (totalVramBytes != null && totalVramBytes > 0) {
    // Fits entirely in VRAM → fully offloaded → fast.
    if (need <= totalVramBytes * 0.9) {
      return { fit: 'fits', label: 'Runs fast — fits on your GPU' };
    }
    // Splits across GPU + system RAM → runs at decent speed.
    if (need <= totalVramBytes + totalMemBytes * 0.7) {
      return { fit: 'fits', label: 'Runs well — uses your GPU plus memory' };
    }
    if (need <= totalVramBytes + totalMemBytes * 0.9) {
      return { fit: 'tight', label: 'Will be tight — close other apps first' };
    }
    return { fit: 'too-large', label: 'Too large for this machine' };
  }
  // RAM-only path (no confident dedicated GPU).
  if (need <= totalMemBytes * 0.7) return { fit: 'fits', label: 'Should run well on this machine' };
  if (need <= totalMemBytes * 0.9) return { fit: 'tight', label: 'Will be tight — close other apps first' };
  return { fit: 'too-large', label: 'Too large for this machine' };
}

/** Pre-download disk guard (spec §4.3). Returns null when OK, else a
 *  plain-language refusal. 5% margin covers the in-flight .partial file. */
export function checkDiskSpace(downloadBytes: number, freeBytes: number): string | null {
  if (freeBytes >= downloadBytes * 1.05) return null;
  const needGb = (downloadBytes / GB).toFixed(1);
  const freeGb = (freeBytes / GB).toFixed(1);
  return `Not enough free space: this download needs about ${needGb} GB but only ${freeGb} GB is free.`;
}
```

- [ ] **Step 4: Run the fit test to verify it passes**

Run: `npx vitest run tests/fit-estimator.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `desktop/src/main/models/gpu-detector.ts`** (best-effort, per-platform)

Impure and platform-specific. **Contract: it MAY only return a non-null `totalVramBytes` when a real DEDICATED GPU's VRAM was confidently probed; every failure/uncertainty → `{ name: null, totalVramBytes: null }`** so `estimateFit` falls back to RAM-only. Cached module-level (VRAM is fixed at runtime). Integrated GPUs (Intel iGPU / AMD APU) return null VRAM on purpose — their memory is shared system RAM and counting it would double-count. Platform probes:

- **Windows:** PowerShell reading the reliable registry value — `Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\*' -Name HardwareInformation.qwMemorySize` (a QWORD of true VRAM), taking the max; and/or `nvidia-smi`. Do NOT use `Win32_VideoController.AdapterRAM` (32-bit, caps at 4 GB, lies on every modern card).
- **macOS:** Apple Silicon is unified memory → `totalVramBytes ≈ Math.floor(os.totalmem() * 0.7)` (Metal's usable working set). Intel Macs → parse `system_profiler SPDisplaysDataType` ("VRAM (Total): N GB").
- **Linux:** `nvidia-smi`, else AMD `/sys/class/drm/card*/device/mem_info_vram_total` (bytes), else null.

Only the PURE parse helpers get unit tests (the platform probing is verified manually on each OS in Task 10's live pass). Export at minimum `parseNvidiaSmiMemory(stdout: string): number | null` and `parseRegistryQwMemorySize(stdout: string): number | null`, and the async `detectGpu(): Promise<GpuInfo>` dispatcher. `gpu-detector.test.ts` pins the parse helpers against real captured CLI output (nvidia-smi CSV, the PowerShell registry dump, a `system_profiler` snippet) and asserts a garbage/empty string → null.

```ts
// One representative pure helper (the rest follow the same shape):
export function parseNvidiaSmiMemory(stdout: string): number | null {
  // `nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits` → MiB
  // lines, one per GPU. Take the largest. Returns BYTES, or null if unparseable.
  const mibs = stdout.split('\n').map((l) => Number(l.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return mibs.length ? Math.max(...mibs) * 1024 * 1024 : null;
}
```

Run: `npx vitest run tests/gpu-detector.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/models/fit-estimator.ts src/main/models/gpu-detector.ts tests/fit-estimator.test.ts tests/gpu-detector.test.ts
git commit -m "feat(models): GPU-aware fit estimator + best-effort VRAM detector + disk guard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Curated catalog (shipped seed + raw-GitHub refresh)

**Files:**
- Create: `desktop/src/main/models/curated-models.ts` (shipped seed)
- Create: `desktop/src/main/models/curated-catalog.ts`
- Create: `curated-models.json` at the **youcoded repo root** (same content as the seed — the remote copy)
- Test: `desktop/tests/curated-catalog.test.ts`

- [ ] **Step 1: Create the shipped seed `desktop/src/main/models/curated-models.ts`**

> **CONFIRMED LIST (Amendment 2026-07-14 B).** 11 models, 3 tiers, all real unsloth GGUF repos (verified live 2026-07-14), default quant `UD-Q4_K_XL` for every entry. **No baked sizes** (Amendment D) — the panel computes fit from live `models.quants(hfRepo)`. `notes` use no apostrophes (single-quoted TS strings); keep it that way or switch to double quotes.

```ts
// The shipped curated model list (spec §4.1). A same-shaped copy lives at the
// youcoded repo root as curated-models.json and is fetched at runtime
// (announcements pattern) so recommendations can update WITHOUT an app
// release; this in-app copy is the offline/fetch-failure fallback. unsloth-first
// (spec §0 decision 3). The list is RECOMMENDATIONS only — any HF GGUF is
// runnable via the "Add from Hugging Face" flow (Amendment C).
import type { CuratedModel } from '../../shared/model-manager-types';

export const CURATED_SCHEMA_VERSION = 1;

export const SHIPPED_CURATED: CuratedModel[] = [
  // ---- small (runs on ~8GB machines) ----
  { id: 'qwen35-2b', label: 'Qwen3.5 2B', tier: 'small', hfRepo: 'unsloth/Qwen3.5-2B-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'Tiny and fast — great on low-memory machines.' },
  { id: 'qwen35-4b', label: 'Qwen3.5 4B', tier: 'small', hfRepo: 'unsloth/Qwen3.5-4B-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'Fast all-rounder for chat and quick questions.' },
  { id: 'gemma4-e4b', label: 'Gemma 4 E4B', tier: 'small', hfRepo: 'unsloth/gemma-4-E4B-it-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'Strong small model from Google.' },
  // ---- everyday (runs on ~16-32GB machines) ----
  { id: 'qwen35-9b', label: 'Qwen3.5 9B', tier: 'everyday', hfRepo: 'unsloth/Qwen3.5-9B-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'Noticeably smarter than the small tier; still light.' },
  { id: 'gemma4-12b', label: 'Gemma 4 12B', tier: 'everyday', hfRepo: 'unsloth/gemma-4-12b-it-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'Capable Google model with vision.' },
  { id: 'gpt-oss-20b', label: 'GPT-OSS 20B', tier: 'everyday', hfRepo: 'unsloth/gpt-oss-20b-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'OpenAI open-weights model — great general assistant.' },
  { id: 'gemma4-26b-a4b', label: 'Gemma 4 26B-A4B', tier: 'everyday', hfRepo: 'unsloth/gemma-4-26B-A4B-it-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'Mixture-of-experts — 26B quality at roughly 4B speed.' },
  { id: 'qwen36-27b', label: 'Qwen3.6 27B', tier: 'everyday', hfRepo: 'unsloth/Qwen3.6-27B-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'Newest Qwen — top everyday pick if it fits.' },
  // ---- large (runs on 32GB+ / workstations) ----
  { id: 'qwen35-35b-a3b', label: 'Qwen3.5 35B-A3B', tier: 'large', hfRepo: 'unsloth/Qwen3.5-35B-A3B-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'Mixture-of-experts — big-model quality on a strong machine.' },
  { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', tier: 'large', hfRepo: 'unsloth/gpt-oss-120b-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'OpenAI open-weights flagship — needs a workstation.' },
  { id: 'qwen35-122b-a10b', label: 'Qwen3.5 122B-A10B', tier: 'large', hfRepo: 'unsloth/Qwen3.5-122B-A10B-GGUF', quantDefault: 'UD-Q4_K_XL', notes: 'Frontier open model — for high-memory machines.' },
];
```

The large-tier defaults (gpt-oss-120b ~59 GB, Qwen3.5-122B ~72 GB at UD-Q4_K_XL) are **multi-part** downloads — see Task 10's split-probe (Amendment H).

- [ ] **Step 2: Write the failing test** — `desktop/tests/curated-catalog.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CuratedCatalog } from '../src/main/models/curated-catalog';
import { SHIPPED_CURATED } from '../src/main/models/curated-models';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curated-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const remoteList = [{
  id: 'remote-model', label: 'Remote Model', tier: 'large', hfRepo: 'unsloth/Remote-GGUF',
  quantDefault: 'Q4_K_M',
}];
const okFetch = (async () => ({
  ok: true, json: async () => ({ schemaVersion: 1, models: remoteList }),
})) as any;
const deadFetch = (async () => { throw new Error('offline'); }) as any;

describe('CuratedCatalog', () => {
  it('serves the remote list when the fetch succeeds, and caches it', async () => {
    const cat = new CuratedCatalog(dir, okFetch);
    expect(await cat.get()).toEqual(remoteList);
    // Second instance with a dead network serves the disk cache.
    const offline = new CuratedCatalog(dir, deadFetch);
    expect(await offline.get()).toEqual(remoteList);
  });

  it('falls back to the SHIPPED copy when fetch fails and no cache exists', async () => {
    const cat = new CuratedCatalog(dir, deadFetch);
    expect(await cat.get()).toEqual(SHIPPED_CURATED);
  });

  it('rejects malformed remote payloads (wrong schemaVersion / non-array) → shipped copy', async () => {
    const badFetch = (async () => ({ ok: true, json: async () => ({ schemaVersion: 99, models: 'nope' }) })) as any;
    const cat = new CuratedCatalog(dir, badFetch);
    expect(await cat.get()).toEqual(SHIPPED_CURATED);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/curated-catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Create `desktop/src/main/models/curated-catalog.ts`**

```ts
// Curated model list (spec §4.1): shipped in-app AND refreshed from a raw
// GitHub URL in the youcoded repo (the announcements pattern) so
// recommendations update without an app release. Remote failure falls back to
// the freshest thing we have: disk cache first, shipped copy last.
import * as fs from 'fs';
import * as path from 'path';
import type { CuratedModel } from '../../shared/model-manager-types';
import { SHIPPED_CURATED, CURATED_SCHEMA_VERSION } from './curated-models';

const REMOTE_URL = 'https://raw.githubusercontent.com/itsdestin/youcoded/master/curated-models.json';
const CACHE_FILE = 'curated-models-cache.json';
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; json: () => Promise<any> }>;

function validList(payload: any): CuratedModel[] | null {
  if (!payload || payload.schemaVersion !== CURATED_SCHEMA_VERSION || !Array.isArray(payload.models)) return null;
  const out: CuratedModel[] = [];
  for (const m of payload.models) {
    // Defensive parse: a malformed row is dropped, never guessed at.
    if (typeof m?.id !== 'string' || typeof m?.hfRepo !== 'string' || typeof m?.label !== 'string') continue;
    if (!['small', 'everyday', 'large'].includes(m?.tier)) continue; // 3 tiers (Amendment A)
    if (typeof m?.quantDefault !== 'string') continue;               // no quants[] in the shape (Amendment D)
    out.push(m as CuratedModel);
  }
  return out.length > 0 ? out : null;
}

export class CuratedCatalog {
  private cachePath: string;
  constructor(cacheDir: string, private fetchImpl: FetchLike = fetch as any) {
    this.cachePath = path.join(cacheDir, CACHE_FILE);
  }

  private readCache(): { fetchedAt: number; models: CuratedModel[] } | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      const models = validList({ schemaVersion: CURATED_SCHEMA_VERSION, models: parsed.models });
      if (typeof parsed.fetchedAt !== 'number' || !models) return null;
      return { fetchedAt: parsed.fetchedAt, models };
    } catch { return null; }
  }

  /** Never throws: remote → cache → shipped, in freshness order. */
  async get(): Promise<CuratedModel[]> {
    const cached = this.readCache();
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.models;
    try {
      const res = await this.fetchImpl(REMOTE_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) {
        const models = validList(await res.json());
        if (models) {
          try {
            fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
            fs.writeFileSync(this.cachePath, JSON.stringify({ fetchedAt: Date.now(), models }));
          } catch { /* cache write is best-effort */ }
          return models;
        }
      }
    } catch { /* offline / timeout — fall through */ }
    return cached?.models ?? SHIPPED_CURATED;
  }
}
```

- [ ] **Step 5: Create `curated-models.json` at the youcoded repo root** (sibling of `announcements.txt`):

```json
{
  "schemaVersion": 1,
  "models": []
}
```

Populate `models` with the same entries as `SHIPPED_CURATED` once Destin confirms the list (an empty remote array is invalid by design — `validList` returns null and clients keep their shipped copy, so committing this stub is safe).

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/curated-catalog.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/models/curated-models.ts src/main/models/curated-catalog.ts tests/curated-catalog.test.ts ../curated-models.json
git commit -m "feat(models): curated catalog — shipped unsloth-first seed + raw-GitHub refresh

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Hugging Face client

**Files:**
- Create: `desktop/src/main/models/hf-client.ts`
- Test: `desktop/tests/hf-client.test.ts`
- Modify: `youcoded/docs/provider-dependencies.md` (HF API entries)

- [ ] **Step 1: Write the failing test** — `desktop/tests/hf-client.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { HfClient, hfResolveUrl } from '../src/main/models/hf-client';

describe('HfClient', () => {
  it('search: builds the gguf-filtered query and defensively parses hits', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ([
        { id: 'unsloth/Qwen3-14B-GGUF', downloads: 5000, likes: 100 },
        { downloads: 1 },                 // no id → skipped
        { id: 42 },                       // non-string id → skipped
      ]),
    })) as any;
    const hf = new HfClient(fetchMock);
    const hits = await hf.search('qwen3');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://huggingface.co/api/models?search=qwen3&filter=gguf&sort=downloads&limit=30'
    );
    expect(hits).toEqual([{ repo: 'unsloth/Qwen3-14B-GGUF', downloads: 5000, likes: 100 }]);
  });

  it('quantOptions: recursive tree → grouped quant options with lfs sha256', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ([
        { type: 'file', path: 'M-Q4_K_M.gguf', size: 100, lfs: { oid: 'a'.repeat(64), size: 100 } },
        { type: 'file', path: 'sub/M-UD-Q4_K_XL-00001-of-00002.gguf', size: 50, lfs: { oid: 'b'.repeat(64) } },
        { type: 'file', path: 'sub/M-UD-Q4_K_XL-00002-of-00002.gguf', size: 40 }, // no lfs → sha null
        { type: 'directory', path: 'sub' },
        { type: 'file', path: 'README.md', size: 5 },
      ]),
    })) as any;
    const hf = new HfClient(fetchMock);
    const opts = await hf.quantOptions('unsloth/M-GGUF');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://huggingface.co/api/models/unsloth/M-GGUF/tree/main?recursive=true'
    );
    expect(opts.map((o) => o.quant).sort()).toEqual(['Q4_K_M', 'UD-Q4_K_XL']);
    const ud = opts.find((o) => o.quant === 'UD-Q4_K_XL')!;
    expect(ud.totalSizeBytes).toBe(90);
    expect(ud.sha256ByFile['sub/M-UD-Q4_K_XL-00001-of-00002.gguf']).toBe('b'.repeat(64));
    expect(ud.sha256ByFile['sub/M-UD-Q4_K_XL-00002-of-00002.gguf']).toBeNull();
  });

  it('search/quantOptions surface plain-language errors on HTTP failure', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as any;
    const hf = new HfClient(fetchMock);
    await expect(hf.search('x')).rejects.toThrow(/Hugging Face/);
  });
});

describe('hfResolveUrl', () => {
  it('builds resolve URLs with encoded path segments', () => {
    expect(hfResolveUrl('unsloth/M-GGUF', 'sub dir/M-Q4_K_M.gguf')).toBe(
      'https://huggingface.co/unsloth/M-GGUF/resolve/main/sub%20dir/M-Q4_K_M.gguf'
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/hf-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `desktop/src/main/models/hf-client.ts`**

```ts
// Hugging Face Hub client (spec §4.2). Every consumed field is recorded in
// docs/provider-dependencies.md; parse DEFENSIVELY — rows missing required
// fields are skipped, absent optional fields become null (never guessed).
import type { HFSearchHit, QuantOption } from '../../shared/model-manager-types';
import { groupQuantOptions } from './quant-parser';

const API = 'https://huggingface.co/api';
const FETCH_TIMEOUT_MS = 15_000;

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status?: number; json: () => Promise<any> }>;

export function hfResolveUrl(repo: string, filePath: string): string {
  // repo is 'owner/name' — the slash is a real URL separator; file path
  // segments are encoded individually (subfolders stay subfolders).
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  return `https://huggingface.co/${repo}/resolve/main/${encodedPath}`;
}

export class HfClient {
  constructor(private fetchImpl: FetchLike = fetch as any) {}

  async search(query: string): Promise<HFSearchHit[]> {
    const url = `${API}/models?search=${encodeURIComponent(query)}&filter=gguf&sort=downloads&limit=30`;
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error('Hugging Face search is not reachable right now — try again in a moment.');
    const rows = await res.json();
    const out: HFSearchHit[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (typeof row?.id !== 'string') continue; // skip malformed
      out.push({
        repo: row.id,
        downloads: typeof row.downloads === 'number' ? row.downloads : 0,
        likes: typeof row.likes === 'number' ? row.likes : 0,
      });
    }
    return out;
  }

  /** List a repo's downloadable quant variants. recursive=true is REQUIRED:
   *  unsloth keeps dynamic quants in subfolders. */
  async quantOptions(repo: string): Promise<QuantOption[]> {
    const url = `${API}/models/${repo}/tree/main?recursive=true`;
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error('Could not list this model's files on Hugging Face — try again in a moment.');
    const rows = await res.json();
    const files = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.type !== 'file' || typeof row?.path !== 'string' || typeof row?.size !== 'number') continue;
      files.push({
        path: row.path,
        size: row.size,
        // lfs.oid is the blob's sha256 for LFS files (all real GGUFs); absent
        // for small non-LFS files — downloader skips verification then.
        sha256: typeof row?.lfs?.oid === 'string' && /^[0-9a-f]{64}$/.test(row.lfs.oid) ? row.lfs.oid : null,
      });
    }
    return groupQuantOptions(files);
  }
}
```

(Escape the apostrophe in `model's` — use double quotes for that string in the real file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/hf-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Add provider-dependencies.md entries** (`youcoded/docs/provider-dependencies.md`, new touchpoints):

- **HF model search** — URL + params, consumed fields `id`/`downloads`/`likes`, skip-malformed policy. (hf-client.ts)
- **HF repo tree** — URL + `recursive=true` requirement (unsloth subfolders), consumed fields `type`/`path`/`size`/`lfs.oid` (sha256). (hf-client.ts, model-downloader.ts)
- **HF resolve URLs** — 302-to-CDN, Range support relied on for resume. (model-downloader.ts)
- **Curated remote list** — raw GitHub URL, schemaVersion gate, shipped-copy fallback. (curated-catalog.ts)

- [ ] **Step 6: Commit**

```bash
git add src/main/models/hf-client.ts tests/hf-client.test.ts ../docs/provider-dependencies.md
git commit -m "feat(models): Hugging Face client — gguf search + recursive tree + resolve URLs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Model downloader (resumable, multi-part, cancellable)

**Files:**
- Create: `desktop/src/main/models/model-downloader.ts`
- Test: `desktop/tests/model-downloader.test.ts`

- [ ] **Step 1: Write the failing test** — `desktop/tests/model-downloader.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { ModelDownloader } from '../src/main/models/model-downloader';
import type { DownloadProgress, QuantOption } from '../src/shared/model-manager-types';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const PART1 = Buffer.from('part-one-bytes');
const PART2 = Buffer.from('part-two-bytes!!');
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

/** Serves resolve URLs by trailing filename, honoring Range. */
function fetchServing(bodies: Record<string, Buffer>): typeof fetch {
  return (async (url: any, init?: any) => {
    const name = decodeURIComponent(String(url).split('/').pop()!);
    const buf = bodies[name];
    if (!buf) return new Response(null, { status: 404 });
    let start = 0;
    const range = init?.headers?.Range as string | undefined;
    if (range) start = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
    const body = buf.subarray(start);
    return new Response(new Blob([body]).stream(), {
      status: start > 0 ? 206 : 200,
      headers: { 'content-length': String(body.length) },
    });
  }) as typeof fetch;
}

function quantOpt(withSha = true): QuantOption {
  return {
    quant: 'UD-Q4_K_XL', description: 'x',
    files: ['sub/M-UD-Q4_K_XL-00001-of-00002.gguf', 'sub/M-UD-Q4_K_XL-00002-of-00002.gguf'],
    totalSizeBytes: PART1.length + PART2.length,
    sha256ByFile: {
      'sub/M-UD-Q4_K_XL-00001-of-00002.gguf': withSha ? sha(PART1) : null,
      'sub/M-UD-Q4_K_XL-00002-of-00002.gguf': withSha ? sha(PART2) : null,
    },
  };
}
const bodies = {
  'M-UD-Q4_K_XL-00001-of-00002.gguf': PART1,
  'M-UD-Q4_K_XL-00002-of-00002.gguf': PART2,
};

describe('ModelDownloader', () => {
  it('downloads all parts FLAT into the cache dir (basenames), verifies sha256, reports done', async () => {
    const dl = new ModelDownloader(dir, fetchServing(bodies));
    const events: DownloadProgress[] = [];
    const id = dl.start('unsloth/M-GGUF', quantOpt(), (p) => events.push(p));
    await dl.wait(id);
    // Flat basenames → cache-scan/router discovery sees them (Plan B convention).
    expect(fs.readFileSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf'))).toEqual(PART1);
    expect(fs.readFileSync(path.join(dir, 'M-UD-Q4_K_XL-00002-of-00002.gguf'))).toEqual(PART2);
    const last = events[events.length - 1];
    expect(last.state).toBe('done');
    expect(last.receivedBytes).toBe(PART1.length + PART2.length);
    expect(events.some((e) => e.state === 'verifying')).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.partial'))).toEqual([]);
  });

  it('resumes a part from its .partial file via Range', async () => {
    fs.writeFileSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf.partial'), PART1.subarray(0, 5));
    const fetchImpl = vi.fn(fetchServing(bodies));
    const dl = new ModelDownloader(dir, fetchImpl as any);
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    await dl.wait(id);
    expect(fs.readFileSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf'))).toEqual(PART1);
    const firstCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes('00001'));
    expect((firstCall![1] as any).headers.Range).toBe('bytes=5-');
  });

  it('sha256 mismatch → error state, bad file deleted, nothing published', async () => {
    const bad = quantOpt();
    bad.sha256ByFile['sub/M-UD-Q4_K_XL-00001-of-00002.gguf'] = '0'.repeat(64);
    const dl = new ModelDownloader(dir, fetchServing(bodies));
    const events: DownloadProgress[] = [];
    const id = dl.start('unsloth/M-GGUF', bad, (p) => events.push(p));
    await expect(dl.wait(id)).rejects.toThrow(/integrity/);
    expect(events[events.length - 1].state).toBe('error');
    expect(fs.existsSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf'))).toBe(false);
  });

  it('cancel: stops the stream, emits cancelled, KEEPS the .partial for resume', async () => {
    // A fetch whose body stalls until cancelled.
    const fetchImpl = (async () => new Response(new ReadableStream({
      async pull(c) { c.enqueue(new Uint8Array(4)); await new Promise((r) => setTimeout(r, 20)); },
    }), { status: 200, headers: { 'content-length': '99999' } })) as any;
    const dl = new ModelDownloader(dir, fetchImpl);
    const events: DownloadProgress[] = [];
    const id = dl.start('unsloth/M-GGUF', quantOpt(false), (p) => events.push(p));
    await new Promise((r) => setTimeout(r, 60));
    dl.cancel(id);
    await expect(dl.wait(id)).rejects.toThrow(/cancel/i);
    expect(events[events.length - 1].state).toBe('cancelled');
    expect(fs.existsSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf.partial'))).toBe(true);
  });

  it('refuses a second concurrent download of the same repo+quant', async () => {
    const dl = new ModelDownloader(dir, fetchServing(bodies));
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    expect(() => dl.start('unsloth/M-GGUF', quantOpt(), () => {})).toThrow(/already/i);
    await dl.wait(id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/model-downloader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `desktop/src/main/models/model-downloader.ts`**

```ts
// GGUF downloader (spec §4.4): fetches quant file sets from HF resolve URLs
// into the llama.cpp cache dir. Contracts:
//   - files land FLAT under cacheDir with their BASENAME (subfolder paths in
//     the repo are collapsed) — that is what Plan B's cache-scan/router
//     discovery reads; probe-download.mjs pins the equivalence.
//   - in-flight bytes live in <name>.partial; publish is an atomic rename, so
//     a crash/cancel never leaves a half-file the router could try to load.
//   - resume: an existing .partial continues via a Range request.
//   - sha256 (from HF lfs.oid) verifies each part when available; a mismatch
//     deletes the bad bytes and errors — never publishes.
//   - cancel keeps .partial files (resume later); a later delete cleans up.
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ulid } from 'ulid';
import { hfResolveUrl } from './hf-client';
import type { DownloadProgress, QuantOption } from '../../shared/model-manager-types';

const PROGRESS_INTERVAL_MS = 250;

interface ActiveDownload {
  key: string;                       // repo::quant — concurrency guard
  abort: AbortController;
  promise: Promise<void>;
  cancelled: boolean;
}

export class ModelDownloader {
  private active = new Map<string, ActiveDownload>(); // by downloadId

  constructor(private cacheDir: string, private fetchImpl: typeof fetch = fetch) {}

  /** Kick off a download; progress arrives via onProgress; await wait(id) for
   *  the outcome. Throws synchronously if this repo+quant is already running. */
  start(repo: string, quant: QuantOption, onProgress: (p: DownloadProgress) => void): string {
    const key = `${repo}::${quant.quant}`;
    for (const d of this.active.values()) {
      if (d.key === key) throw new Error('That model is already downloading.');
    }
    const downloadId = ulid();
    const abort = new AbortController();
    const entry: ActiveDownload = { key, abort, cancelled: false, promise: Promise.resolve() };
    entry.promise = this.run(downloadId, repo, quant, entry, onProgress)
      .finally(() => { /* keep the entry until wait() consumers observe it */ });
    this.active.set(downloadId, entry);
    return downloadId;
  }

  async wait(downloadId: string): Promise<void> {
    const entry = this.active.get(downloadId);
    if (!entry) return;
    try { await entry.promise; } finally { this.active.delete(downloadId); }
  }

  cancel(downloadId: string): void {
    const entry = this.active.get(downloadId);
    if (!entry) return;
    entry.cancelled = true;
    entry.abort.abort();
  }

  private async run(
    downloadId: string, repo: string, quant: QuantOption,
    entry: ActiveDownload, onProgress: (p: DownloadProgress) => void
  ): Promise<void> {
    const parts = quant.files.length;
    const base: Omit<DownloadProgress, 'state' | 'receivedBytes' | 'currentPart'> = {
      downloadId, repo, quant: quant.quant, totalBytes: quant.totalSizeBytes, parts,
    };
    let doneBytes = 0; // completed parts
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      for (let i = 0; i < quant.files.length; i++) {
        const filePath = quant.files[i];
        const fileName = path.basename(filePath);
        const finalPath = path.join(this.cacheDir, fileName);
        const partialPath = `${finalPath}.partial`;
        if (fs.existsSync(finalPath)) { // already installed (re-download after partial delete)
          doneBytes += fs.statSync(finalPath).size;
          continue;
        }
        const emit = (received: number, state: DownloadProgress['state'] = 'downloading') =>
          onProgress({ ...base, state, receivedBytes: doneBytes + received, currentPart: i + 1 });

        const received = await this.downloadFile(
          hfResolveUrl(repo, filePath), partialPath, entry.abort.signal, emit
        );

        const expected = quant.sha256ByFile[filePath];
        if (expected) {
          emit(received, 'verifying');
          const actual = await sha256File(partialPath);
          if (actual !== expected) {
            fs.rmSync(partialPath, { force: true });
            throw new Error(`${fileName} failed its integrity check — the download was corrupted. Please try again.`);
          }
        }
        // Publish atomically — the router only ever sees whole files.
        fs.renameSync(partialPath, finalPath);
        doneBytes += received;
      }
      onProgress({ ...base, state: 'done', receivedBytes: doneBytes, currentPart: parts });
    } catch (e: any) {
      if (entry.cancelled) {
        onProgress({ ...base, state: 'cancelled', receivedBytes: doneBytes, currentPart: parts });
        throw new Error('Download cancelled.');
      }
      onProgress({ ...base, state: 'error', receivedBytes: doneBytes, currentPart: parts, message: e?.message ?? String(e) });
      throw e;
    }
  }

  /** One file → .partial with Range resume. Returns total bytes of the file. */
  private async downloadFile(
    url: string, partialPath: string, signal: AbortSignal,
    emit: (receivedInFile: number) => void
  ): Promise<number> {
    let start = 0;
    try { start = fs.statSync(partialPath).size; } catch { /* fresh */ }
    const res = await this.fetchImpl(url, {
      signal,
      headers: start > 0 ? { Range: `bytes=${start}-` } : undefined,
    });
    if (res.status === 416) { fs.rmSync(partialPath, { force: true }); return this.downloadFile(url, partialPath, signal, emit); }
    if (!res.ok && res.status !== 206) throw new Error(`Hugging Face responded with HTTP ${res.status}.`);
    if (start > 0 && res.status !== 206) { fs.rmSync(partialPath, { force: true }); start = 0; } // Range ignored → restart
    if (!res.body) throw new Error('Empty download response.');
    const ws = fs.createWriteStream(partialPath, { flags: start > 0 ? 'a' : 'w' });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    let received = start;
    let lastEmit = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        await new Promise<void>((resolve, reject) => ws.write(value, (err) => (err ? reject(err) : resolve())));
        const now = Date.now();
        if (now - lastEmit >= PROGRESS_INTERVAL_MS) { lastEmit = now; emit(received); }
      }
      emit(received);
      return received;
    } finally {
      await new Promise<void>((resolve) => ws.end(() => resolve()));
    }
  }
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (c) => hash.update(c))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/model-downloader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/models/model-downloader.ts tests/model-downloader.test.ts
git commit -m "feat(models): resumable multi-part GGUF downloader with sha256 verify + cancel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Endpoint detectors + EngineManager extensions

**Files:**
- Create: `desktop/src/main/models/endpoint-detectors.ts`
- Modify: `desktop/src/main/engine/engine-manager.ts` (`setBackend`, `deleteModel`, `installedModels` — three methods; `noteModelUsed`/`setDefaultForTier` CUT per Amendment G)
- Test: `desktop/tests/endpoint-detectors.test.ts`, extend `desktop/tests/engine-manager.test.ts`

(No `provider-registry.ts` change — the `noteModelUsed` hook is gone.)

- [ ] **Step 1: Write the failing detector test** — `desktop/tests/endpoint-detectors.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { detectEndpoints } from '../src/main/models/endpoint-detectors';

describe('detectEndpoints', () => {
  it('reports a reachable Ollama with model count and the /v1 baseUrl to add', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url) === 'http://localhost:11434/api/tags') {
        return { ok: true, json: async () => ({ models: [{ name: 'a' }, { name: 'b' }] }) } as any;
      }
      throw new Error('ECONNREFUSED'); // LM Studio not running
    });
    const found = await detectEndpoints(fetchMock as any, []);
    expect(found).toEqual([{
      kind: 'ollama', label: 'Ollama (local)',
      baseUrl: 'http://localhost:11434/v1', modelCount: 2, alreadyAdded: false,
    }]);
  });

  it('reports LM Studio via /v1/models', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url) === 'http://localhost:1234/v1/models') {
        return { ok: true, json: async () => ({ data: [{ id: 'x' }] }) } as any;
      }
      throw new Error('ECONNREFUSED');
    });
    const found = await detectEndpoints(fetchMock as any, []);
    expect(found).toEqual([{
      kind: 'lmstudio', label: 'LM Studio (local)',
      baseUrl: 'http://localhost:1234/v1', modelCount: 1, alreadyAdded: false,
    }]);
  });

  it('marks alreadyAdded when an openai-compatible provider has that baseUrl', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('11434')) return { ok: true, json: async () => ({ models: [] }) } as any;
      throw new Error('ECONNREFUSED');
    });
    const found = await detectEndpoints(fetchMock as any, [
      { type: 'openai-compatible', baseUrl: 'http://localhost:11434/v1' } as any,
    ]);
    expect(found[0].alreadyAdded).toBe(true);
  });

  it('nothing running → empty list (never throws)', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    expect(await detectEndpoints(fetchMock as any, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Create `desktop/src/main/models/endpoint-detectors.ts`**

```ts
// Ollama / LM Studio detectors (spec §4.5): probe the default localhost ports;
// a hit becomes a one-click "add as endpoint" that creates a plain
// openai-compatible provider entry via the EXISTING provider:upsert IPC.
// Never required, never auto-added (ADR 007) — this module only DETECTS.
// Detector URLs are salvaged from the archived feat/opencode-mvp
// OllamaDetector (probe pattern only; the pull/streaming code is not needed —
// our downloader owns model installs).
import type { DetectedEndpoint } from '../../shared/model-manager-types';
import type { ProviderConfig } from '../../shared/provider-types';

const PROBE_TIMEOUT_MS = 1_500; // localhost — anything slower is "not running"

export async function detectEndpoints(
  fetchImpl: typeof fetch,
  existingProviders: ProviderConfig[]
): Promise<DetectedEndpoint[]> {
  const stripSlash = (u: string) => u.replace(/\/+$/, '');
  const added = new Set(
    existingProviders
      .filter((p) => p.type === 'openai-compatible' && typeof p.baseUrl === 'string')
      .map((p) => stripSlash(p.baseUrl!))
  );
  const out: DetectedEndpoint[] = [];

  // Ollama: /api/tags lists installed models — { models: [...] }.
  try {
    const res = await fetchImpl('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (res.ok) {
      const json: any = await res.json();
      out.push({
        kind: 'ollama', label: 'Ollama (local)',
        baseUrl: 'http://localhost:11434/v1', // Ollama's OpenAI-compatible surface
        modelCount: Array.isArray(json?.models) ? json.models.length : null,
        alreadyAdded: added.has('http://localhost:11434/v1'),
      });
    }
  } catch { /* not running */ }

  // LM Studio: native OpenAI-compatible /v1/models — { data: [...] }.
  try {
    const res = await fetchImpl('http://localhost:1234/v1/models', {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (res.ok) {
      const json: any = await res.json();
      out.push({
        kind: 'lmstudio', label: 'LM Studio (local)',
        baseUrl: 'http://localhost:1234/v1',
        modelCount: Array.isArray(json?.data) ? json.data.length : null,
        alreadyAdded: added.has('http://localhost:1234/v1'),
      });
    }
  } catch { /* not running */ }

  return out;
}
```

- [ ] **Step 3: Extend EngineManager** (`src/main/engine/engine-manager.ts`). Add three methods (full code):

```ts
  /** Plan C: switch GPU backend. Downloads that backend's build if missing
   *  (progress rides the same install-progress event), verifies it boots,
   *  THEN records the choice — a failed switch leaves config untouched. */
  async setBackend(backend: EngineBackend): Promise<void> {
    const asset = pickAsset(process.platform, process.arch, backend);
    if (!asset) {
      throw new Error(`That backend is not available for this platform (${process.platform}/${process.arch}).`);
    }
    const onProgress = (p: EngineInstallProgress) => this.emit('install-progress', p);
    const installed = await this.acquisition.install(asset, onProgress);
    await this.verifyBoot(installed);
    await updateEngineConfig(this.home, { backend });
    this.emit('status-changed');
  }

  /** Plan C: installed models with quant metadata (spec §4.5). lastUsedAt +
   *  defaultForTier were CUT from v1 (Amendment 2026-07-14 G). */
  async installedModels(): Promise<InstalledLocalModel[]> {
    const cfg = readEngineConfig(this.home);
    return scanGgufCache(cfg.cacheDir).map((m) => {
      const parsed = parseGgufName(`${m.id}.gguf`);
      return {
        id: m.id,
        sizeBytes: m.sizeBytes ?? 0,   // scanGgufCache sums all parts for a split model
        quant: parsed?.quant ?? null,
        quantDescription: parsed ? quantDescription(parsed.quant) : null,
        parts: parsed?.part?.of ?? 1,
      };
    });
  }

  /** Plan C: delete a model (all parts). Best-effort /models/unload first so
   *  the router isn't serving a file we're removing; file deletion proceeds
   *  regardless (the router tolerates a vanished file on next request). */
  async deleteModel(id: string): Promise<void> {
    const cfg = readEngineConfig(this.home);
    if (this.supervisor?.status() === 'running') {
      try {
        await (this.opts.fetchImpl ?? fetch)(`http://127.0.0.1:${this.port}/models/unload`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: id }),
        });
      } catch { /* best-effort */ }
    }
    // A multi-part id points at part 00001 — delete every sibling part.
    const partMatch = /-(\d{5})-of-(\d{5})$/.exec(id);
    const names = partMatch
      ? Array.from({ length: Number(partMatch[2]) }, (_, i) =>
          `${id.replace(/-\d{5}-of-\d{5}$/, '')}-${String(i + 1).padStart(5, '0')}-of-${partMatch[2]}.gguf`)
      : [`${id}.gguf`];
    for (const name of names) {
      fs.rmSync(path.join(cfg.cacheDir, name), { force: true });
      fs.rmSync(path.join(cfg.cacheDir, `${name}.partial`), { force: true });
    }
    this.emit('status-changed');
  }

  // CUT from v1 (Amendment 2026-07-14 G): noteModelUsed (debounced last-used
  // stamp) and setDefaultForTier (default-model-per-tier). Both stored state the
  // picker never consumed / a cosmetic label. Do NOT add them back until the
  // picker actually uses a per-tier default.
```

Imports at the top of engine-manager.ts: `parseGgufName, quantDescription` from `../models/quant-parser`; `scanGgufCache` from `./cache-scan`; `InstalledLocalModel` from `../../shared/model-manager-types`; and **`import * as fs from 'fs'`** — the file currently imports only `path`, and `deleteModel` needs `fs.rmSync` (Amendment I). No `ModelTier` import (only the cut code used it), and no provider-registry `noteModelUsed` wiring / `LocalEngineHook` change — the whole usage-stamp path is gone.

- [ ] **Step 4: Extend `tests/engine-manager.test.ts`** with the new surface:

```ts
  it('installedModels(): quant parsing + summed multi-part size + parts', async () => {
    plantInstall();
    const cacheDir = path.join(root, 'cache'); fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'M-UD-Q4_K_XL-00001-of-00002.gguf'), Buffer.alloc(2));
    fs.writeFileSync(path.join(cacheDir, 'M-UD-Q4_K_XL-00002-of-00002.gguf'), Buffer.alloc(3));
    await home.mutateJson('config.json', () => ({ v: 1, engine: { cacheDir } }));
    const mgr = new EngineManager(home, userData, 9999);
    const models = await mgr.installedModels();
    // sizeBytes is summed across parts (scanGgufCache folds part 2 into part 1).
    expect(models).toEqual([{
      id: 'M-UD-Q4_K_XL-00001-of-00002', sizeBytes: 5,
      quant: 'UD-Q4_K_XL', quantDescription: expect.stringMatching(/unsloth/i),
      parts: 2,
    }]);
  });

  it('deleteModel(): removes every part + partials', async () => {
    plantInstall();
    const cacheDir = path.join(root, 'cache'); fs.mkdirSync(cacheDir, { recursive: true });
    for (const n of ['M-UD-Q4_K_XL-00001-of-00002.gguf', 'M-UD-Q4_K_XL-00002-of-00002.gguf']) {
      fs.writeFileSync(path.join(cacheDir, n), Buffer.alloc(1));
    }
    await home.mutateJson('config.json', () => ({ v: 1, engine: { cacheDir } }));
    const mgr = new EngineManager(home, userData, 9999);
    await mgr.deleteModel('M-UD-Q4_K_XL-00001-of-00002');
    expect(fs.readdirSync(cacheDir)).toEqual([]);
  });
```

- [ ] **Step 5: Run all affected tests**

Run: `npx vitest run tests/endpoint-detectors.test.ts tests/engine-manager.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/models/endpoint-detectors.ts src/main/engine/engine-manager.ts tests/endpoint-detectors.test.ts tests/engine-manager.test.ts
git commit -m "feat(models): endpoint detectors + EngineManager model ops (setBackend/installed/delete)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: ModelManager composition + IPC surface

**Files:**
- Create: `desktop/src/main/models/model-manager.ts`
- Modify: `desktop/src/main/ipc-handlers.ts`, `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/main/remote-server.ts`, `app/.../SessionService.kt`
- Test: `desktop/tests/ipc-channels.test.ts`

- [ ] **Step 1: Create `desktop/src/main/models/model-manager.ts`**

```ts
// ModelManager — composition root for the models:* IPC surface. Thin: real
// logic lives in the pure/unit-tested modules; this class only wires them to
// the EngineManager's cache dir and fans progress out as events.
import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { NativeHome } from '../native-home';
import { EngineManager } from '../engine/engine-manager';
import { readEngineConfig } from '../engine/engine-config';
import { CuratedCatalog } from './curated-catalog';
import { HfClient } from './hf-client';
import { ModelDownloader } from './model-downloader';
import { estimateFit, checkDiskSpace } from './fit-estimator';
import { detectGpu } from './gpu-detector';
import type {
  CuratedModel, DownloadProgress, FitEstimate, HFSearchHit, QuantOption,
} from '../../shared/model-manager-types';

export class ModelManager extends EventEmitter {
  private curated: CuratedCatalog;
  private hf: HfClient;
  private downloader: ModelDownloader | null = null; // rebuilt if cacheDir changes

  constructor(
    private home: NativeHome,
    private engine: EngineManager,
    userDataDir: string,
    // totalVramBytes lets tests pin GPU-aware fit; undefined = detect at runtime,
    // null = force RAM-only (Amendment 2026-07-14 F).
    private opts: { fetchImpl?: typeof fetch; totalMemBytes?: number; totalVramBytes?: number | null } = {}
  ) {
    super();
    this.curated = new CuratedCatalog(userDataDir, opts.fetchImpl as any);
    this.hf = new HfClient(opts.fetchImpl as any);
  }

  private cacheDir(): string { return readEngineConfig(this.home).cacheDir; }

  private getDownloader(): ModelDownloader {
    // cacheDir can change (Plan C panel shows it; later phases may make it
    // editable) — cheap to rebuild per call chain when it does.
    if (!this.downloader || (this.downloader as any).cacheDir !== this.cacheDir()) {
      this.downloader = new ModelDownloader(this.cacheDir(), this.opts.fetchImpl);
    }
    return this.downloader;
  }

  // Detected VRAM, cached once (undefined = not yet probed). Injected value in
  // opts wins so tests are deterministic. GPU-aware fit — Amendment 2026-07-14 F.
  private vramCache: number | null | undefined = undefined;
  private async vram(): Promise<number | null> {
    if (this.opts.totalVramBytes !== undefined) return this.opts.totalVramBytes;
    if (this.vramCache === undefined) this.vramCache = (await detectGpu()).totalVramBytes;
    return this.vramCache;
  }
  private fitFor(sizeBytes: number, vram: number | null): FitEstimate {
    return estimateFit(sizeBytes, this.opts.totalMemBytes ?? os.totalmem(), vram);
  }

  /** Curated RECOMMENDATIONS — plain list, no baked sizes (Amendment D). The
   *  panel fetches each card's default-quant size + fit via quants(hfRepo). */
  curatedList(): Promise<CuratedModel[]> { return this.curated.get(); }

  search(query: string): Promise<HFSearchHit[]> { return this.hf.search(query); }

  /** Each quant variant decorated with a GPU-aware fit label. This is also the
   *  call the panel uses to size + fit a curated card (find the quantDefault). */
  async quants(repo: string): Promise<Array<QuantOption & { fit: FitEstimate }>> {
    const [opts, vram] = await Promise.all([this.hf.quantOptions(repo), this.vram()]);
    return opts.map((o) => ({ ...o, fit: this.fitFor(o.totalSizeBytes, vram) }));
  }

  /** Free bytes on the volume holding `dir`, walking UP to the nearest EXISTING
   *  ancestor when the cache dir doesn't exist yet (Amendment 2026-07-14 J — the
   *  old code skipped the guard entirely on a fresh cache dir). null = couldn't
   *  determine (guard skipped). */
  private freeBytesNear(dir: string): number | null {
    let d = dir;
    for (let i = 0; i < 40; i++) {
      try { const s = fs.statfsSync(d); return s.bavail * s.bsize; } catch { /* try parent */ }
      const parent = path.dirname(d);
      if (parent === d) break;
      d = parent;
    }
    return null;
  }

  /** Disk guard, then start; progress fans out on 'download-progress'. */
  async download(repo: string, quant: QuantOption): Promise<{ downloadId: string }> {
    const free = this.freeBytesNear(this.cacheDir());
    const refusal = free != null ? checkDiskSpace(quant.totalSizeBytes, free) : null;
    if (refusal) throw new Error(refusal);
    const dl = this.getDownloader();
    const downloadId = dl.start(repo, quant, (p: DownloadProgress) => this.emit('download-progress', p));
    // Outcome is delivered via progress events; swallow the rejection here so
    // an error can't become an unhandled rejection in main (the UI reads the
    // 'error' progress event).
    void dl.wait(downloadId).catch(() => {});
    return { downloadId };
  }

  cancel(downloadId: string): void { this.getDownloader().cancel(downloadId); }
}
```

- [ ] **Step 2: Write the failing parity test.** Append to `tests/ipc-channels.test.ts` (mirror Plan B's `engine:*` describe):

```ts
// Self-contained like the engine:* describe (Amendment 2026-07-14 I): each test
// reads its own source. ipc-handlers uses the IPC.* CONSTANTS, so its check
// asserts the constant identifier — NOT the literal 'models:*' string, which
// never appears there and would always fail. Task 9 EXTENDS this `channels`
// array with ['engine:set-context','ENGINE_SET_CONTEXT'] when it wires the knob.
describe('models:* + engine:set-* channel parity (Plan C)', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const channels: Array<[string, string]> = [
    ['engine:set-backend', 'ENGINE_SET_BACKEND'],
    ['models:curated', 'MODELS_CURATED'],
    ['models:search', 'MODELS_SEARCH'],
    ['models:quants', 'MODELS_QUANTS'],
    ['models:download', 'MODELS_DOWNLOAD'],
    ['models:download-cancel', 'MODELS_DOWNLOAD_CANCEL'],
    ['models:delete', 'MODELS_DELETE'],
    ['models:installed', 'MODELS_INSTALLED'],
    ['endpoints:detect', 'ENDPOINTS_DETECT'],
  ];
  const pushChannels = ['models:download-progress'];

  it('preload exposes every channel (request + push)', () => {
    const src = read('src', 'main', 'preload.ts');
    for (const [ch] of channels) expect(src).toContain(`'${ch}'`);
    for (const ch of pushChannels) expect(src).toContain(`'${ch}'`);
  });
  it('remote-shim exposes every channel (request + push)', () => {
    const src = read('src', 'renderer', 'remote-shim.ts');
    for (const [ch] of channels) expect(src).toContain(`'${ch}'`);
    for (const ch of pushChannels) expect(src).toContain(`'${ch}'`);
  });
  it('ipc-handlers registers every request-response channel via its IPC.* constant', () => {
    const src = read('src', 'main', 'ipc-handlers.ts');
    for (const [, konst] of channels) expect(src).toContain(`IPC.${konst}`);
  });
  it('SessionService.kt stubs every request-response channel', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'main', 'kotlin', 'com', 'youcoded', 'app', 'runtime', 'SessionService.kt'), 'utf8');
    for (const [ch] of channels) expect(src).toContain(`"${ch}"`);
  });
});
```

Run: `npx vitest run tests/ipc-channels.test.ts` → FAIL (new describe).

- [ ] **Step 3: Wire ipc-handlers.ts.** After the Plan B engine block:

```ts
  // Plan C: model manager (curated catalog, HF search, downloads, detectors).
  const modelManager = new ModelManager(nativeHome, engineManager, app.getPath('userData'));
  modelManager.on('download-progress', (p) => {
    send(IPC.MODELS_DOWNLOAD_PROGRESS, p);
    remoteServer?.broadcast({ type: 'models:download-progress', payload: p });
  });
  ipcMain.handle(IPC.ENGINE_SET_BACKEND, async (_e, backend: string) => { await engineManager.setBackend(backend as any); return engineManager.status(); });
  ipcMain.handle(IPC.MODELS_CURATED, async () => modelManager.curatedList());
  ipcMain.handle(IPC.MODELS_SEARCH, async (_e, query: string) => modelManager.search(query));
  ipcMain.handle(IPC.MODELS_QUANTS, async (_e, repo: string) => modelManager.quants(repo));
  ipcMain.handle(IPC.MODELS_DOWNLOAD, async (_e, repo: string, quant: any) => modelManager.download(repo, quant));
  ipcMain.handle(IPC.MODELS_DOWNLOAD_CANCEL, async (_e, downloadId: string) => { modelManager.cancel(downloadId); return true; });
  ipcMain.handle(IPC.MODELS_DELETE, async (_e, id: string) => { await engineManager.deleteModel(id); return true; });
  ipcMain.handle(IPC.MODELS_INSTALLED, async () => engineManager.installedModels());
  ipcMain.handle(IPC.ENDPOINTS_DETECT, async () =>
    detectEndpoints(fetch, ((await providerRegistry.list()) as any[])));
```

Imports: `ModelManager`, `detectEndpoints`. Extend `setNativeRuntime` with `modelManager` and add remote-server case rows for every channel (same try/catch-respond pattern as `engine:*`; `models:download-progress` broadcast is already wired above).

- [ ] **Step 4: preload.ts namespace** (after `engine:`; identical shape in remote-shim with `invoke`/object payloads):

```ts
  models: {
    curated: () => ipcRenderer.invoke(IPC.MODELS_CURATED),
    search: (query: string) => ipcRenderer.invoke(IPC.MODELS_SEARCH, query),
    quants: (repo: string) => ipcRenderer.invoke(IPC.MODELS_QUANTS, repo),
    download: (repo: string, quant: unknown) => ipcRenderer.invoke(IPC.MODELS_DOWNLOAD, repo, quant),
    downloadCancel: (downloadId: string) => ipcRenderer.invoke(IPC.MODELS_DOWNLOAD_CANCEL, downloadId),
    delete: (id: string) => ipcRenderer.invoke(IPC.MODELS_DELETE, id),
    installed: () => ipcRenderer.invoke(IPC.MODELS_INSTALLED),
    detectEndpoints: () => ipcRenderer.invoke(IPC.ENDPOINTS_DETECT),
    setBackend: (backend: string) => ipcRenderer.invoke(IPC.ENGINE_SET_BACKEND, backend),
    onDownloadProgress: (cb: (p: unknown) => void) => {
      const listener = (_e: unknown, p: unknown) => cb(p);
      ipcRenderer.on(IPC.MODELS_DOWNLOAD_PROGRESS, listener);
      return () => ipcRenderer.removeListener(IPC.MODELS_DOWNLOAD_PROGRESS, listener);
    },
  },
```

- [ ] **Step 5: SessionService.kt** — add all nine request-response channel strings to the combined stub case.

- [ ] **Step 6: Run parity + full suite**

Run: `npx vitest run tests/ipc-channels.test.ts` → PASS. `npm test -- --run` → green.

- [ ] **Step 7: Commit**

```bash
git add src/main/models/model-manager.ts src/main/ipc-handlers.ts src/main/preload.ts src/renderer/remote-shim.ts src/main/remote-server.ts ../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt tests/ipc-channels.test.ts
git commit -m "feat(models): ModelManager + models:* IPC surface across all parity files

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Settings → Local Models panel

**Files:**
- Create: `desktop/src/renderer/components/LocalModelsSection.tsx`
- Modify: `desktop/src/renderer/components/ProvidersSection.tsx` (remove the EngineCard render — the local row keeps a "Managed in Local Models below" note)
- Modify: `desktop/src/renderer/components/SettingsPanel.tsx` (mount `<LocalModelsSection />` directly below `<ProvidersSection />`, same `native.supported` gating)

- [ ] **Step 1: Create `desktop/src/renderer/components/LocalModelsSection.tsx`.** Structure (follow ProvidersSection's styling idioms — bg-well cards, border-edge-dim, plain-word status text; all copy below is the contract):

```tsx
// Settings → Local Models (spec §4.5 + Amendments 2026-07-14). Sections:
//   1. Engine card — Plan B's EngineCard, EXTENDED with: backend line
//      ("Using: Vulkan" + "Switch to CUDA (faster on NVIDIA)" button shown only
//      when navigator.platform is Windows AND a cuda asset exists for this
//      platform), the context-length knob (number input → engine:set-context,
//      step 2), and the cache location line (read-only EngineStatus.cacheDir).
//      (No GPU-name line — GPU detection stays internal to fit; surfacing the
//      name would force an EngineStatus/status() change for a cosmetic label.
//      The fit labels already convey the GPU benefit.)
//   2. Recommended models — models.curated() rows grouped under small /
//      everyday / LARGE tier headers (Amendment A). NO baked sizes (Amendment
//      D): for each card call models.quants(hfRepo), find the quantDefault entry
//      (fall back to first), and show ITS size in GB + fit label (plain words
//      from fit.label — color ONLY via existing semantic tokens, no glyphs;
//      fit is GPU-aware). Cache the quants() result per repo. Download button →
//      models.download(repo, defaultQuant). While downloading: progress bar
//      (receivedBytes/totalBytes + "part x of y") from onDownloadProgress + a
//      Cancel button → downloadCancel(downloadId).
//   3. Installed models — models.installed() rows: id, size, quant +
//      quantDescription. (NO "Last used" / "Default for tier" — CUT, Amendment
//      G.) Delete is CONSEQUENCE-GATED (standing UX rule): clicking flips the
//      row into a confirm strip — "This removes the model file (N GB) from this
//      computer. Re-downloading it later will take a while." [Delete model]
//      [Keep]. After delete, refresh. Any in-progress/partial download (from
//      onDownloadProgress state, or a cancelled one) shows here with Resume /
//      Discard so a big cancelled .partial isn't invisible lost disk (Amend. J).
//      Resume = models.download(repo, quant) again (the downloader resumes from
//      the .partial via Range). Discard = models.delete(id) where id is the
//      part-1 basename minus .gguf — deleteModel already rm's every part's
//      .gguf AND .gguf.partial, so no new IPC is needed.
//   4. Add from Hugging Face — search input → models.search() hits (repo +
//      downloads count); expanding a hit calls models.quants(repo). Show the
//      RECOMMENDED few quants first (UD-Q4_K_XL, Q4_K_M, Q8_0 when present) with
//      a "Show all N" expander (Amendment J) — a raw 15-24-row list is hostile
//      to a non-technical user. Each row: quant, description, size, fit label,
//      Download. GGUF-only is implicit (search is gguf-filtered); MTP/QAT and
//      any other real repo work here (Amendment C).
//   5. Other local apps — a Detect button → models.detectEndpoints(); each hit
//      renders "Ollama is running on this computer (12 models)" + an
//      "Add as endpoint" button (hidden when alreadyAdded) that calls
//      window.claude.providers.upsert({ type: 'openai-compatible',
//      label: hit.label, baseUrl: hit.baseUrl, enabled: true }) and then
//      points the user at the Providers section above.
// The whole section returns null unless window.claude.native?.supported.
```

Implement the component fully per the comment above; every IPC call already exists. Reuse `EngineCard` by importing it (extend its props: `showDetails?: boolean` for the backend/context/cache lines rather than forking it).

- [ ] **Step 2: Context-length knob plumbing (self-contained here — Amendment I).** The `ENGINE_SET_CONTEXT: 'engine:set-context'` constant is already declared in Task 1's block. Wire it end-to-end in THIS task: preload namespace row (`setContext`) + remote-shim row + `ipcMain.handle(IPC.ENGINE_SET_CONTEXT, …)` + Kotlin stub, AND extend Task 8's parity `channels` array with `['engine:set-context','ENGINE_SET_CONTEXT']` so the parity test covers it. The handler calls `engineManager.setContext(contextSize)`. Add `setContext(contextSize: number)` to EngineManager:

```ts
  async setContext(contextSize: number): Promise<void> {
    if (!Number.isFinite(contextSize) || contextSize < 1024) {
      throw new Error('Context length must be at least 1024 tokens.');
    }
    await updateEngineConfig(this.home, { contextSize: Math.floor(contextSize) });
    // A running engine keeps its old -c until rebooted; restart now so the
    // knob does what it says. supervisorBinary reset forces a rebuild with
    // the fresh config on the next ensureRunning.
    if (this.supervisor) { await this.supervisor.stop(); this.supervisorBinary = null; }
    this.emit('status-changed');
  }
```

- [ ] **Step 3: Typecheck + manual pass**

Run: `npm run build` → green. Then `YOUCODED_NATIVE=1 bash scripts/run-dev.sh` → Settings shows Local Models with all five sections; curated cards show fit labels; detector section reports nothing when Ollama/LM Studio are absent.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/LocalModelsSection.tsx src/renderer/components/ProvidersSection.tsx src/renderer/components/SettingsPanel.tsx src/main/engine/engine-manager.ts src/shared/types.ts src/main/preload.ts src/renderer/remote-shim.ts src/main/remote-server.ts src/main/ipc-handlers.ts ../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt tests/ipc-channels.test.ts
git commit -m "feat(models): Settings → Local Models panel (curated, installed, search, detectors, engine controls)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Download probe + live acceptance + docs + merge

- [ ] **Step 1: Add `desktop/test-engine/probe-download.mjs`** — pins the downloader-naming ↔ router-discovery equivalence with a REAL small unsloth download (the spec's acceptance requires a real unsloth model at least once):

```js
#!/usr/bin/env node
// Probe: our downloader's flat-basename cache naming is served by the router,
// for BOTH single-file AND MULTI-PART models (Amendment 2026-07-14 H). Downloads
// a REAL tiny unsloth GGUF (~0.4GB) once, ALSO splits it with llama-gguf-split,
// and asserts llama-server lists + serves both under the filename-derived ids
// cache-scan.ts computes. The large-tier defaults (gpt-oss-120b, Qwen3.5-122B)
// are multi-part and can't be validated on a 32GB machine — this deterministic
// split is the ONLY cheap verification of that path. Re-run on engine pin bumps.
// usage: node probe-download.mjs --binary <llama-server>
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const argv = process.argv.slice(2);
const binary = argv[argv.indexOf('--binary') + 1];
if (!binary) { console.error('usage: probe-download.mjs --binary <llama-server>'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(here, 'cache');
fs.mkdirSync(cacheDir, { recursive: true });

const REPO = 'unsloth/Qwen3-0.6B-GGUF';
const FILE = 'Qwen3-0.6B-Q4_K_M.gguf';
const dest = path.join(cacheDir, FILE);
if (!fs.existsSync(dest)) {
  console.log(`downloading ${REPO}/${FILE} (~0.4GB, one-time)…`);
  const res = await fetch(`https://huggingface.co/${REPO}/resolve/main/${FILE}`);
  if (!res.ok) { console.error(`FAIL: HF download HTTP ${res.status}`); process.exit(1); }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// Split the single gguf into a flat multi-part set with the SIBLING
// llama-gguf-split binary (same archive as llama-server). of-count can vary by
// build/size, so we discover the actual 00001 part rather than hardcoding it.
const splitBin = binary.replace(/llama-server(\.exe)?$/i, (_m, ext) => `llama-gguf-split${ext ?? ''}`);
if (!fs.readdirSync(cacheDir).some((f) => /SPLIT-00001-of-\d{5}\.gguf$/.test(f))) {
  for (const f of fs.readdirSync(cacheDir)) if (/SPLIT-\d{5}-of-\d{5}\.gguf$/.test(f)) fs.rmSync(path.join(cacheDir, f));
  console.log('splitting into parts with llama-gguf-split…');
  const sp = spawnSync(splitBin, ['--split', '--split-max-size', '250M', dest, path.join(cacheDir, 'Qwen3-0.6B-SPLIT')], { stdio: 'inherit' });
  if (sp.status !== 0) { console.error('FAIL: llama-gguf-split exited nonzero'); process.exit(1); }
}
const firstPart = fs.readdirSync(cacheDir).find((f) => /SPLIT-00001-of-\d{5}\.gguf$/.test(f));
if (!firstPart) { console.error('FAIL: split produced no 00001 part'); process.exit(1); }
const expectedSingleId = FILE.replace(/\.gguf$/i, '');
const expectedSplitId = firstPart.replace(/\.gguf$/i, '');  // == cache-scan's id for a split model

const PORT = 9974;
// The spawn MUST mirror engine-supervisor.ts — crucially `--models-dir <cacheDir>`.
// Plan B verified (b9992) that the router discovers flat GGUFs from --models-dir,
// NOT from LLAMA_CACHE (which only tracks -hf auto-downloads). WITHOUT it, /models
// returns [] and this probe would FALSELY fail — do not "fix" the downloader in
// response; the missing flag is the bug. See docs/engine-dependencies.md.
const child = spawn(binary, ['--host', '127.0.0.1', '--port', String(PORT), '--no-webui', '--jinja', '--models-dir', cacheDir, '--models-max', '4', '-c', '4096'],
  { env: { ...process.env, LLAMA_CACHE: cacheDir }, stdio: ['ignore', 'inherit', 'inherit'] });
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const models = await (await fetch(`http://127.0.0.1:${PORT}/models`)).json();
const ids = (models.data ?? models.models ?? models ?? []).map((m) => m.id ?? m.name);
console.log('router ids:', ids);
for (const [label, id] of [['single-file', expectedSingleId], ['multi-part', expectedSplitId]]) {
  if (!ids.includes(id)) {
    child.kill();
    console.error(`FAIL: router does not serve the ${label} id '${id}' — flat-basename naming drifted; fix model-downloader/cache-scan + engine-dependencies.md`);
    process.exit(1);
  }
}
// Chat round-trip against the MULTI-PART model — proves a split model actually
// LOADS + serves under its part-1 id, not merely lists.
const chat = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: expectedSplitId, messages: [{ role: 'user', content: 'Say: pong' }] }),
});
const out = await chat.json();
child.kill();
console.log('multi-part reply:', JSON.stringify(out.choices?.[0]?.message?.content ?? null));
if (chat.status !== 200) { console.error('FAIL: multi-part chat round-trip'); process.exit(1); }
console.log(`PASS: single-file ('${expectedSingleId}') AND multi-part ('${expectedSplitId}') GGUFs are discovered and served under their filename ids`);
```

Run it against the pinned binary → PASS. Add its facts to `docs/engine-dependencies.md` (downloader naming contract entry, naming `model-downloader.ts` + `cache-scan.ts` as consumers) and the unsloth repo layout note (dynamic quants in subfolders, flat-basename collapse) to `docs/provider-dependencies.md`.

- [ ] **Step 2: Full suite + build**

Run: `npm test -- --run && npm run build` → all green.

- [ ] **Step 3: Live acceptance (spec §1 Plan C exit test + §5)** — dev build, `YOUCODED_NATIVE=1`:

1. Settings → Local Models → Recommended → pick a **small-tier unsloth model** → Download. Progress bar shows bytes + parts; Cancel and re-Download once to prove resume (progress restarts past zero).
2. When done, the model appears under Installed with quant + size, and in the model picker's Local group.
3. New YouCoded session with it → chat streams; per-turn metadata strip shows tokens/sec.
4. **Disconnect the network → chat again** — still works. This is the Plan C exit test (real unsloth download → offline chat).
5. Delete flow: confirm strip appears, delete removes the file(s), installed list refreshes, picker loses the entry.
6. With Ollama running (if available on the dev machine): Detect finds it, Add as endpoint creates the provider entry, its models are usable by typing a model id in the picker's custom-endpoint flow.
7. Backend switch (NVIDIA machine only): Switch to CUDA downloads the CUDA build, engine restarts, chat still works. Context knob: set 8192, engine restarts, catalog rows report contextLength 8192.
8. Shut the dev instance down.

- [ ] **Step 4: Workspace docs (youcoded-dev repo):**

- `docs/PITFALLS.md` → Plan C bullets:
  - Downloader flat-basename contract is probe-pinned for BOTH single-file AND multi-part (`probe-download.mjs` splits a tiny model with `llama-gguf-split`) — never rename downloaded files or change how split parts are named without re-running the probe.
  - Curated list carries NO baked sizes (Amendment D) — fit is computed from live `models.quants()`; the remote list is schema-gated with shipped fallback (an empty/invalid remote NEVER blanks recommendations).
  - Fit is GPU-AWARE with a safety bias: VRAM only ever UPGRADES a verdict and only when a dedicated GPU is confidently probed; anything uncertain (incl. integrated GPUs → shared RAM) falls back to RAM-only. Don't add fake VRAM precision; don't count integrated-GPU memory (double-count).
  - Quant-parser DENYLISTS `mmproj*` + `mtp-*` aux files (real repos ship uppercase `mmproj-BF16.gguf` that would otherwise collide with the real `…-BF16.gguf`) and recognizes `MXFP4(_MOE)`. Multi-part sets must be COMPLETE before download (partial sets dropped).
  - Model delete unloads best-effort first; a cancelled `.partial` is surfaced in the panel (Resume/Discard) so big cancelled downloads aren't invisible lost disk.
  - CUDA opt-in is Windows-x64-only (no upstream Linux/arm CUDA asset).
  - CUT from v1: default-model-per-tier and last-used stamps (Amendment G) — don't reintroduce until the picker consumes a default.
- Roadmap Progress line: Plan C merged (Phase 1 complete pending Destin's curated-list confirmation).

- [ ] **Step 5: Merge** — superpowers:finishing-a-development-branch (PR to youcoded master). After merge: junction removal → worktree removal → branch delete → dev server down.

---

## Self-review notes (already applied)

- Spec §4.1: tiered ladder ✓ (small/everyday/large), unsloth repos ✓, shipped + raw-GitHub refresh with fallback ✓, entry shape ✓ (no baked sizes — Amendment D). **Curated list CONFIRMED (Amendment B).**
- Spec §4.2: HF search URL ✓, per-repo file listing ✓ (recursive — unsloth subfolders), UD-/MXFP4 quant parsing ✓, mmproj/mtp aux denylist ✓, multi-part recognized + downloaded as a set ✓, pure parser with REAL unsloth fixtures ✓.
- Spec §4.3: `os.totalmem()` ✓, GPU-aware fit with best-effort VRAM + safety bias ✓ (Amendment F), explicit estimate labels ✓, disk guard before download (nearest-existing-ancestor) ✓, no fake precision ✓.
- Spec §4.4: HF resolve URLs into the standard llama.cpp cache ✓, progress over IPC ✓, resume ✓, multi-part ✓ (router-id probe-verified — Amendment H), checksum where HF provides one (lfs.oid) ✓, cancel + cleanup ✓ (partial kept for resume + surfaced in panel; delete cleans).
- Spec §4.5: engine card status/version/backend ✓, backend picker ✓ (CUDA opt-in, "faster on NVIDIA", Windows-x64-only per upstream assets), context knob ✓, cache location ✓, installed list size/quant ✓, consequence-gated delete ✓, Ollama/LM Studio detectors ✓ (never required, never auto-added). **CUT: set-default-per-tier + last-used (Amendment G).**
- Spec §4.6: all listed channels ✓ + justified additions (`models:quants`, `models:download-cancel`, `engine:set-context`); parity (self-contained describe, IPC.* constant checks) + Android stubs ✓.
- Type-consistency check: `QuantOption`/`DownloadProgress`/`InstalledLocalModel`/`GpuInfo` names match across quant-parser → hf-client → downloader → gpu-detector → manager → panel; no `noteModelUsed`/`LocalEngineHook` change (usage-stamp path cut).
