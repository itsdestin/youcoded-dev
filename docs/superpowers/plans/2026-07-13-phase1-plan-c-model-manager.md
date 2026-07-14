# Phase 1 Plan C — Model Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-developer can install a local model entirely in-app: a curated unsloth-first catalog with honest fit estimates, Hugging Face search with quant parsing (incl. unsloth dynamic quants and multi-part splits), resumable downloads with progress into the llama.cpp cache, a Settings → Local Models panel, and Ollama/LM Studio one-click endpoint detectors. Exit test: pick a recommended unsloth model in-app, watch it download, chat offline.

**Architecture:** A new `desktop/src/main/models/` module tree of mostly-pure units: `quant-parser.ts` (GGUF filename → quant + plain-language quality + multi-part grouping), `fit-estimator.ts` (RAM heuristic → fits/tight/too-large labels), `curated-catalog.ts` (shipped list + raw-GitHub refresh, announcements pattern), `hf-client.ts` (HF search + repo file tree, defensive parse), `model-downloader.ts` (resumable multi-part downloads into the GGUF cache with progress push events), `endpoint-detectors.ts` (Ollama/LM Studio probes → openai-compatible provider entries). The renderer gets `LocalModelsSection.tsx`, which absorbs Plan B's `EngineCard` and adds backend picker + context knob. Everything dormant behind `YOUCODED_NATIVE=1`.

**Tech Stack:** TypeScript (Electron main + React renderer), Hugging Face Hub HTTP API, llama.cpp GGUF cache conventions (established by Plan B), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-10-phase1-engine-providers-design.md` §4 (+ §0 decision 3, §5). **Depends on Plan B merged** (`2026-07-13-phase1-plan-b-local-engine.md`): EngineManager, cache-scan, `engine:*` IPC, EngineCard.

---

## Amendments (post-planning decisions — Destin, 2026-07-13)

**Read this first — it modifies Task 4.**

1. **No coder tier.** Drop the placeholder `coder`-tier entries (`qwen3-coder-30b`, `devstral-small`) from Task 4's catalog. Decision: the general Qwen 27B/35B-class models outperform Qwen3-Coder on most metrics, so coding is covered by the everyday/large tiers — there is no dedicated `coder` tier. (The curated model LIST is still pending Destin's final confirmation, now informed by a 2026-07-13 research pass: Qwen3.5 [0.8B–397B], Qwen3.6 [27B, 35B-A3B, incl. MTP speed variants], and Gemma 4 [E2B/E4B/12B/26B-A4B/31B] all have real unsloth GGUFs; don't hardcode sizes — Task 5's hf-client fetches real per-quant sizes.)

2. **DiffusionGemma is OUT of v1 — do NOT list it, and do NOT add any "supported/unsupported" concept to the catalog or browser.** Keep it dead simple: everything the catalog lists is runnable on the bundled `llama-server`. DiffusionGemma is a block-diffusion model `llama-server` can't run (needs the unmerged llama.cpp PR #24427 + a separate `llama-diffusion-cli` runner); listing it with a "not yet supported" badge was considered and rejected as over-complicated for v1. It's deferred as a follow-up (tracked in `docs/knowledge-debt.md`) — revisit only once llama.cpp merges diffusion support into mainline AND `llama-server` (not just the diffusion-cli) serves it.

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
| → `desktop/src/shared/model-manager-types.ts` | CuratedModel/QuantOption/FitEstimate/DownloadProgress/InstalledLocalModel/DetectedEndpoint |
| → `desktop/src/main/models/quant-parser.ts` | GGUF filename → quant + description + multi-part grouping (pure) |
| → `desktop/src/main/models/fit-estimator.ts` | RAM heuristic + disk guard (pure, mem/disk injected) |
| → `desktop/src/main/models/curated-catalog.ts` + `curated-models.ts` | shipped seed + raw-GitHub refresh |
| → `desktop/src/main/models/hf-client.ts` | HF search + tree + resolve URLs (defensive) |
| → `desktop/src/main/models/model-downloader.ts` | resumable multi-part downloads + progress + cancel + sha256 |
| → `desktop/src/main/models/endpoint-detectors.ts` | Ollama/LM Studio localhost probes |
| → `desktop/src/main/models/model-manager.ts` | composition root for the models:* IPC surface |
| → `desktop/src/renderer/components/LocalModelsSection.tsx` | the Settings → Local Models panel |
| → `youcoded/curated-models.json` (repo root) | remote-refreshable curated list (announcements pattern) |
| ✎ `desktop/src/shared/types.ts` + `desktop/src/main/preload.ts` | `models:*`/`endpoints:detect`/`engine:set-backend` constants + namespaces |
| ✎ `desktop/src/main/engine/engine-manager.ts` | `setBackend()`, `deleteModel()`, `installedModels()`, `noteModelUsed()` |
| ✎ `desktop/src/main/providers/provider-registry.ts` | one line: `noteModelUsed` callback on local sends |
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

// No 'coder' tier (Amendment 2026-07-13 — coding is covered by everyday/larger
// general models). A future 'large' tier may be added when Destin confirms the
// curated list; add it to this union AND the Task 4 validator + panel headers
// together.
export type ModelTier = 'small' | 'everyday';

/** Spec §4.1 entry shape. sizeBytes is per quant (quants[] carries both). */
export interface CuratedQuant { quant: string; sizeBytes: number; }
export interface CuratedModel {
  id: string;             // stable curated id, e.g. 'qwen3-4b'
  label: string;          // display name, e.g. 'Qwen3 4B Instruct'
  hfRepo: string;         // 'unsloth/Qwen3-4B-Instruct-2507-GGUF'
  quantDefault: string;   // e.g. 'UD-Q4_K_XL'
  quants: CuratedQuant[];
  contextLength: number;  // model's trained context (informational; engine -c governs)
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
  label: string; // 'Should run well on this machine' | 'Will be tight — close other apps first' | 'Too large for this machine'
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

export interface InstalledLocalModel {
  id: string;                 // the router-served model id (filename minus .gguf)
  sizeBytes: number;
  quant: string | null;       // parsed from filename; null when unrecognized
  quantDescription: string | null;
  lastUsedAt: number | null;  // ms epoch; null = never used
  defaultForTier: ModelTier | null;
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

(`models:quants` and `models:download-cancel` extend the spec §4.6 list: search returns repos, a second call lists a repo's quant variants; §4.4 requires cancel. The spec's channel list is a floor, not a ceiling — same parity discipline applies.)

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

  it('returns null for non-quant GGUF names (mmproj, unrecognized)', () => {
    expect(parseGgufName('mmproj-model-f16.gguf')).toBeNull(); // lowercase f16 in mmproj naming — not a chat model file
    expect(parseGgufName('README.md')).toBeNull();
  });
});

describe('groupQuantOptions', () => {
  // Real unsloth tree shapes: some quants at root, dynamic quants in subfolders.
  const files = [
    { path: 'Qwen3-14B-Q4_K_M.gguf', size: 9_000, sha256: 'a'.repeat(64) },
    { path: 'Qwen3-14B-Q8_0.gguf', size: 15_000, sha256: 'b'.repeat(64) },
    { path: 'UD-Q4_K_XL/Qwen3-14B-UD-Q4_K_XL-00001-of-00002.gguf', size: 5_000, sha256: 'c'.repeat(64) },
    { path: 'UD-Q4_K_XL/Qwen3-14B-UD-Q4_K_XL-00002-of-00002.gguf', size: 4_000, sha256: null },
    { path: 'README.md', size: 10, sha256: null },
  ];

  it('groups by quant, orders multi-part sets, sums sizes', () => {
    const opts = groupQuantOptions(files);
    const ud = opts.find((o) => o.quant === 'UD-Q4_K_XL')!;
    expect(ud.files).toEqual([
      'UD-Q4_K_XL/Qwen3-14B-UD-Q4_K_XL-00001-of-00002.gguf',
      'UD-Q4_K_XL/Qwen3-14B-UD-Q4_K_XL-00002-of-00002.gguf',
    ]);
    expect(ud.totalSizeBytes).toBe(9_000);
    expect(ud.sha256ByFile['UD-Q4_K_XL/Qwen3-14B-UD-Q4_K_XL-00002-of-00002.gguf']).toBeNull();
    expect(opts.find((o) => o.quant === 'Q4_K_M')!.totalSizeBytes).toBe(9_000);
    expect(opts.some((o) => o.quant === 'README')).toBe(false);
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
//   splits    …-00001-of-000NN.gguf (downloaded as a set, addressed via part 1)
import type { QuantOption } from '../../shared/model-manager-types';

export interface ParsedGgufName {
  base: string;
  quant: string;               // includes the UD- prefix for dynamic quants
  dynamic: boolean;            // unsloth dynamic (UD-) quant
  part: { index: number; of: number } | null;
}

// Quant token grammar: optional UD- prefix, then (I)Q<digit>_SUFFIX or a raw
// float type. Anchored to a '-' separator and the .gguf extension so model
// names containing 'q4' mid-word can't false-match. Case-sensitive on purpose:
// lowercase 'f16' appears in mmproj/aux files we must NOT list as chat models.
const NAME_RE = /^(.+?)-(UD-)?((?:I?Q\d+_[A-Z0-9_]+)|Q\d+|F16|F32|BF16)(?:-(\d{5})-of-(\d{5}))?\.gguf$/;

export function parseGgufName(fileName: string): ParsedGgufName | null {
  const base = fileName.split('/').pop() ?? fileName; // callers may pass repo-relative paths
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

### Task 3: Fit estimator + disk guard (pure)

**Files:**
- Create: `desktop/src/main/models/fit-estimator.ts`
- Test: `desktop/tests/fit-estimator.test.ts`

- [ ] **Step 1: Write the failing test** — `desktop/tests/fit-estimator.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { estimateFit, checkDiskSpace } from '../src/main/models/fit-estimator';

const GB = 1024 ** 3;

describe('estimateFit', () => {
  it('a 4GB model on a 16GB machine should run well', () => {
    expect(estimateFit(4 * GB, 16 * GB)).toEqual({
      fit: 'fits', label: 'Should run well on this machine',
    });
  });
  it('a 9GB model on a 16GB machine is tight', () => {
    expect(estimateFit(9 * GB, 16 * GB)).toEqual({
      fit: 'tight', label: 'Will be tight — close other apps first',
    });
  });
  it('a 20GB model on a 16GB machine is too large', () => {
    expect(estimateFit(20 * GB, 16 * GB)).toEqual({
      fit: 'too-large', label: 'Too large for this machine',
    });
  });
  it('boundaries: need ≤ 70% RAM = fits; ≤ 90% = tight', () => {
    // need = size + 2GB overhead. On 10GB RAM: fits ≤ 5GB size, tight ≤ 7GB.
    expect(estimateFit(5 * GB, 10 * GB).fit).toBe('fits');
    expect(estimateFit(5.1 * GB, 10 * GB).fit).toBe('tight');
    expect(estimateFit(7 * GB, 10 * GB).fit).toBe('tight');
    expect(estimateFit(7.1 * GB, 10 * GB).fit).toBe('too-large');
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
// Honest fit estimation (spec §4.3): RAM-only heuristic, every label an
// EXPLICIT estimate. VRAM detection is vendor-messy, so v1 deliberately does
// not attempt it — the engine offloads what it can and the label promises
// nothing finer than run-well / tight / too-large. PURE: callers inject the
// machine numbers (os.totalmem(), fs.statfsSync) so tests pin the thresholds.
import type { FitEstimate } from '../../shared/model-manager-types';

const GB = 1024 ** 3;
// Runtime overhead on top of the weights: KV cache at our default -c plus
// engine/OS headroom. Deliberately a blunt constant — precision here would be
// fake (spec: "No fake precision").
const OVERHEAD_BYTES = 2 * GB;

export function estimateFit(modelSizeBytes: number, totalMemBytes: number): FitEstimate {
  const need = modelSizeBytes + OVERHEAD_BYTES;
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/fit-estimator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/models/fit-estimator.ts tests/fit-estimator.test.ts
git commit -m "feat(models): honest RAM-based fit estimator + disk-space guard

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

> **PLACEHOLDER LIST — Destin must confirm the actual models/tiers/quants before release** (flagged in the plan summary). The structure and unsloth-first sourcing are settled (spec §0 decision 3 + §4.1); the specific entries below are a draft. Sizes are per-quant and must be filled from the REAL HF tree sizes when the list is confirmed (Task 5's hf-client can fetch them; do not guess).

```ts
// The shipped curated model list (spec §4.1). A same-shaped copy lives at the
// youcoded repo root as curated-models.json and is fetched at runtime
// (announcements pattern) so recommendations can update WITHOUT an app
// release; this in-app copy is the offline/fetch-failure fallback.
// unsloth-first: every entry points at an unsloth GGUF repo where one exists
// (spec §0 decision 3 — dynamic quants preferred).
import type { CuratedModel } from '../../shared/model-manager-types';

export const CURATED_SCHEMA_VERSION = 1;

export const SHIPPED_CURATED: CuratedModel[] = [
  // ---- small (runs on ~8GB machines) ----
  {
    id: 'qwen3-4b', label: 'Qwen3 4B Instruct', tier: 'small',
    hfRepo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF',
    quantDefault: 'UD-Q4_K_XL',
    quants: [{ quant: 'UD-Q4_K_XL', sizeBytes: 0 /* FILL FROM HF TREE */ }, { quant: 'Q8_0', sizeBytes: 0 }],
    contextLength: 262144,
    notes: 'Fast all-rounder for chat and quick questions.',
  },
  {
    id: 'gemma3-4b', label: 'Gemma 3 4B Instruct', tier: 'small',
    hfRepo: 'unsloth/gemma-3-4b-it-GGUF',
    quantDefault: 'UD-Q4_K_XL',
    quants: [{ quant: 'UD-Q4_K_XL', sizeBytes: 0 }, { quant: 'Q8_0', sizeBytes: 0 }],
    contextLength: 131072,
    notes: 'Strong small model from Google.',
  },
  // ---- everyday (runs on ~16-32GB machines) ----
  {
    id: 'gpt-oss-20b', label: 'GPT-OSS 20B', tier: 'everyday',
    hfRepo: 'unsloth/gpt-oss-20b-GGUF',
    quantDefault: 'UD-Q4_K_XL',
    quants: [{ quant: 'UD-Q4_K_XL', sizeBytes: 0 }],
    contextLength: 131072,
    notes: 'OpenAI's open-weights model — great general assistant.',
  },
  {
    id: 'qwen3-14b', label: 'Qwen3 14B', tier: 'everyday',
    hfRepo: 'unsloth/Qwen3-14B-GGUF',
    quantDefault: 'UD-Q4_K_XL',
    quants: [{ quant: 'UD-Q4_K_XL', sizeBytes: 0 }, { quant: 'Q4_K_M', sizeBytes: 0 }],
    contextLength: 40960,
    notes: 'Noticeably smarter than the small tier; still fine on 16GB.',
  },
  // NOTE: the placeholder 'coder'-tier entries (qwen3-coder-30b, devstral-small)
  // were removed per the 2026-07-13 amendment — no dedicated coder tier. Larger
  // general models (27B/35B-class), if added, get their own tier when Destin
  // confirms the curated list; do NOT reintroduce a 'coder' tier.
];
```

(Note the two `'` inside `'OpenAI's…'`/`'Mistral's…'` strings — use double quotes or escape when writing the real file.)

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
  id: 'remote-model', label: 'Remote Model', tier: 'small', hfRepo: 'unsloth/Remote-GGUF',
  quantDefault: 'Q4_K_M', quants: [{ quant: 'Q4_K_M', sizeBytes: 123 }],
  contextLength: 8192,
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
    if (!['small', 'everyday'].includes(m?.tier)) continue;
    if (typeof m?.quantDefault !== 'string' || !Array.isArray(m?.quants)) continue;
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
- Modify: `desktop/src/main/engine/engine-manager.ts` (`setBackend`, `deleteModel`, `installedModels`, `noteModelUsed`)
- Modify: `desktop/src/main/providers/provider-registry.ts` (call `noteModelUsed` on local sends)
- Test: `desktop/tests/endpoint-detectors.test.ts`, extend `desktop/tests/engine-manager.test.ts`

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

- [ ] **Step 3: Extend EngineManager** (`src/main/engine/engine-manager.ts`). Add four methods (full code):

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

  /** Plan C: installed models with quant metadata + usage stamps. */
  async installedModels(): Promise<InstalledLocalModel[]> {
    const cfg = readEngineConfig(this.home);
    const stats = ((this.home.readJson('config.json') as any)?.modelStats ?? {}) as Record<string, { lastUsedAt?: number }>;
    const defaults = ((this.home.readJson('config.json') as any)?.engine?.defaultModelByTier ?? {}) as Record<string, string>;
    return scanGgufCache(cfg.cacheDir).map((m) => {
      const parsed = parseGgufName(`${m.id}.gguf`);
      const tierEntry = Object.entries(defaults).find(([, id]) => id === m.id);
      return {
        id: m.id,
        sizeBytes: m.sizeBytes ?? 0,
        quant: parsed?.quant ?? null,
        quantDescription: parsed ? quantDescription(parsed.quant) : null,
        lastUsedAt: typeof stats[m.id]?.lastUsedAt === 'number' ? stats[m.id].lastUsedAt : null,
        defaultForTier: (tierEntry?.[0] as ModelTier | undefined) ?? null,
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

  /** Plan C: usage stamp for the installed-models list. Debounced write-behind
   *  (a stamp per send would hammer the config lock). Fire-and-forget caller. */
  private pendingUsed = new Map<string, number>();
  private usedFlushTimer: NodeJS.Timeout | null = null;
  noteModelUsed(modelId: string): void {
    this.pendingUsed.set(modelId, Date.now());
    if (this.usedFlushTimer) return;
    this.usedFlushTimer = setTimeout(() => {
      this.usedFlushTimer = null;
      const batch = new Map(this.pendingUsed);
      this.pendingUsed.clear();
      void this.home.mutateJson('config.json', (cur) => {
        const file = (cur && typeof cur === 'object' ? cur : { v: 1 }) as any;
        file.modelStats = file.modelStats ?? {};
        for (const [id, at] of batch) file.modelStats[id] = { ...(file.modelStats[id] ?? {}), lastUsedAt: at };
        return file;
      }).catch(() => { /* usage stamps are best-effort */ });
    }, 10_000);
    this.usedFlushTimer.unref?.();
  }

  /** Plan C: default model per tier (spec §4.5 set-default-per-tier). */
  async setDefaultForTier(tier: ModelTier, modelId: string | null): Promise<void> {
    await this.home.mutateJson('config.json', (cur) => {
      const file = (cur && typeof cur === 'object' ? cur : { v: 1 }) as any;
      file.engine = file.engine ?? {};
      file.engine.defaultModelByTier = file.engine.defaultModelByTier ?? {};
      if (modelId === null) delete file.engine.defaultModelByTier[tier];
      else file.engine.defaultModelByTier[tier] = modelId;
      return file;
    });
  }
```

New imports at the top of engine-manager.ts: `parseGgufName, quantDescription` from `../models/quant-parser`; `scanGgufCache` from `./cache-scan`; `InstalledLocalModel, ModelTier` from `../../shared/model-manager-types`; `fs`/`path` if not present.

In `registryHook()`, stamp usage on local sends — inside `ensureRunning` (it runs per send, see primer fact 3 of Plan B): the hook's `ensureRunning` doesn't know the modelId, so instead add the stamp where the binding IS known: in `provider-registry.ts`'s `local-engine` case, after `ensureRunning()` resolves, call an optional hook method:

```ts
        this.localEngine.noteModelUsed?.(binding.modelId);
```

and add to the `LocalEngineHook` interface: `noteModelUsed?(modelId: string): void;` (EngineManager's `registryHook()` returns it bound: `noteModelUsed: (id) => this.noteModelUsed(id)`).

- [ ] **Step 4: Extend `tests/engine-manager.test.ts`** with the new surface:

```ts
  it('installedModels(): quant parsing + defaults + parts', async () => {
    plantInstall();
    const cacheDir = path.join(root, 'cache'); fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'M-UD-Q4_K_XL-00001-of-00002.gguf'), Buffer.alloc(2));
    fs.writeFileSync(path.join(cacheDir, 'M-UD-Q4_K_XL-00002-of-00002.gguf'), Buffer.alloc(3));
    await home.mutateJson('config.json', () => ({
      v: 1,
      engine: { cacheDir, defaultModelByTier: { everyday: 'M-UD-Q4_K_XL-00001-of-00002' } },
      modelStats: { 'M-UD-Q4_K_XL-00001-of-00002': { lastUsedAt: 1234 } },
    }));
    const mgr = new EngineManager(home, userData, 9999);
    const models = await mgr.installedModels();
    expect(models).toEqual([{
      id: 'M-UD-Q4_K_XL-00001-of-00002', sizeBytes: 5,
      quant: 'UD-Q4_K_XL', quantDescription: expect.stringMatching(/unsloth/i),
      lastUsedAt: 1234, defaultForTier: 'everyday', parts: 2,
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

Run: `npx vitest run tests/endpoint-detectors.test.ts tests/engine-manager.test.ts tests/provider-registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/models/endpoint-detectors.ts src/main/engine/engine-manager.ts src/main/providers/provider-registry.ts tests/endpoint-detectors.test.ts tests/engine-manager.test.ts
git commit -m "feat(models): endpoint detectors + EngineManager model ops (delete/installed/usage/defaults/backend)

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
import { NativeHome } from '../native-home';
import { EngineManager } from '../engine/engine-manager';
import { readEngineConfig } from '../engine/engine-config';
import { CuratedCatalog } from './curated-catalog';
import { HfClient } from './hf-client';
import { ModelDownloader } from './model-downloader';
import { estimateFit, checkDiskSpace } from './fit-estimator';
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
    private opts: { fetchImpl?: typeof fetch; totalMemBytes?: number } = {}
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

  fitFor(sizeBytes: number): FitEstimate {
    return estimateFit(sizeBytes, this.opts.totalMemBytes ?? os.totalmem());
  }

  /** Curated rows decorated with fit labels (per default quant). */
  async curatedList(): Promise<Array<CuratedModel & { fit: FitEstimate }>> {
    const list = await this.curated.get();
    return list.map((m) => {
      const size = m.quants.find((q) => q.quant === m.quantDefault)?.sizeBytes ?? m.quants[0]?.sizeBytes ?? 0;
      return { ...m, fit: this.fitFor(size) };
    });
  }

  search(query: string): Promise<HFSearchHit[]> { return this.hf.search(query); }

  async quants(repo: string): Promise<Array<QuantOption & { fit: FitEstimate }>> {
    const opts = await this.hf.quantOptions(repo);
    return opts.map((o) => ({ ...o, fit: this.fitFor(o.totalSizeBytes) }));
  }

  /** Disk guard, then start; progress fans out on 'download-progress'. */
  async download(repo: string, quant: QuantOption): Promise<{ downloadId: string }> {
    let free = Number.POSITIVE_INFINITY;
    try { free = fs.statfsSync(this.cacheDir()).bavail * fs.statfsSync(this.cacheDir()).bsize; }
    catch { /* cache dir may not exist yet — created by the downloader */ }
    const refusal = Number.isFinite(free) ? checkDiskSpace(quant.totalSizeBytes, free) : null;
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
describe('models:* channel parity (Plan C)', () => {
  const channels = [
    'engine:set-backend', 'models:curated', 'models:search', 'models:quants',
    'models:download', 'models:download-cancel', 'models:delete',
    'models:installed', 'endpoints:detect',
  ];
  const pushChannels = ['models:download-progress'];

  it('preload exposes every channel', () => {
    for (const ch of [...channels, ...pushChannels]) expect(preloadSrc).toContain(`'${ch}'`);
  });
  it('remote-shim exposes every channel', () => {
    for (const ch of [...channels, ...pushChannels]) expect(shimSrc).toContain(`'${ch}'`);
  });
  it('ipc-handlers registers every request-response channel', () => {
    for (const ch of channels) expect(handlersSrc).toContain(ch);
  });
  it('SessionService.kt stubs every channel', () => {
    for (const ch of channels) expect(kotlinSrc).toContain(`"${ch}"`);
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
// Settings → Local Models (spec §4.5). Sections top to bottom:
//   1. Engine card — Plan B's EngineCard, EXTENDED here with: backend line
//      ("Using: Vulkan" + "Switch to CUDA (faster on NVIDIA)" button shown only
//      when navigator.platform is Windows AND engine:status says a cuda asset
//      exists for this platform — expose via a `cudaAvailable` field if needed),
//      context-length knob (number input, writes engine:set via a new small
//      handler OR rides setBackend's config path — see step 2), and the cache
//      location line (read-only path from EngineStatus.cacheDir).
//   2. Recommended models — models.curated() rows grouped by tier
//      (small/everyday tier headers), each card: label, notes, default-quant
//      size in GB, fit label (plain words from fit.label — color ONLY via
//      existing semantic tokens, no glyphs), and a Download button →
//      models.quants(hfRepo) → pick the entry matching quantDefault (fall back
//      to the first) → models.download(). While downloading: progress bar
//      (receivedBytes/totalBytes + part x of y) fed by onDownloadProgress,
//      plus a Cancel button → downloadCancel(downloadId).
//   3. Installed models — models.installed() rows: id, size, quant +
//      quantDescription, "Last used <relative>" or "Never used",
//      "Default for <tier>" badge. Delete button is CONSEQUENCE-GATED
//      (standing UX rule): clicking flips the row into a confirm strip —
//      "This removes the model file (N GB) from this computer. Re-downloading
//      it later will take a while." [Delete model] [Keep]. After delete,
//      refresh the list.
//   4. Add from Hugging Face — search input → models.search() hits
//      (repo + downloads count); expanding a hit calls models.quants(repo) and
//      lists QuantOptions (quant, description, size, fit label) each with a
//      Download button. GGUF-only is implicit (the search is gguf-filtered).
//   5. Other local apps — a Detect button → models.detectEndpoints(); each hit
//      renders "Ollama is running on this computer (12 models)" + an
//      "Add as endpoint" button (hidden when alreadyAdded) that calls
//      window.claude.providers.upsert({ type: 'openai-compatible',
//      label: hit.label, baseUrl: hit.baseUrl, enabled: true }) and then
//      points the user at the Providers section above.
// The whole section returns null unless window.claude.native?.supported.
```

Implement the component fully per the comment above; every IPC call already exists. Reuse `EngineCard` by importing it (extend its props: `showDetails?: boolean` for the backend/context/cache lines rather than forking it).

- [ ] **Step 2: Context-length knob plumbing.** Smallest honest path: add the knob's write to the EXISTING `engine:set-backend` handler? No — different concern. Add one small handler in the same commit instead: `ENGINE_SET_CONTEXT: 'engine:set-context'` (constants in both files + preload/shim rows + Kotlin stub + parity list in the Task 8 describe — extend that array), handled by `updateEngineConfig(home, { contextSize })` + a supervisor restart if running (`engineManager.restart()` when status is `running`, else nothing — next boot reads config). Add `setContext(contextSize: number)` to EngineManager:

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
// Probe: our downloader's flat-basename cache naming is served by the router.
// Downloads a REAL tiny unsloth GGUF (~0.4GB) once into test-engine/cache/,
// then asserts llama-server lists + serves it. Re-run on engine pin bumps.
// usage: node probe-download.mjs --binary <llama-server>
import { spawn } from 'child_process';
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

const PORT = 9974;
// The spawn MUST mirror engine-supervisor.ts — crucially `--models-dir <cacheDir>`.
// Plan B verified (b9992) that the router discovers flat GGUFs from --models-dir,
// NOT from LLAMA_CACHE (which only tracks -hf auto-downloads). WITHOUT it, /models
// returns [] and this probe would FALSELY fail — do not "fix" the downloader in
// response; the missing flag is the bug. See docs/engine-dependencies.md.
const child = spawn(binary, ['--host', '127.0.0.1', '--port', String(PORT), '--no-webui', '--jinja', '--models-dir', cacheDir, '--models-max', '2', '-c', '4096'],
  { env: { ...process.env, LLAMA_CACHE: cacheDir }, stdio: ['ignore', 'inherit', 'inherit'] });
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const models = await (await fetch(`http://127.0.0.1:${PORT}/models`)).json();
const ids = (models.data ?? models.models ?? models ?? []).map((m) => m.id ?? m.name);
console.log('router ids:', ids);
const expectedId = FILE.replace(/\.gguf$/i, '');
if (!ids.includes(expectedId)) {
  child.kill();
  console.error(`FAIL: router does not serve '${expectedId}' — flat-basename naming drifted; fix model-downloader + engine-dependencies.md`);
  process.exit(1);
}
const chat = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: expectedId, messages: [{ role: 'user', content: 'Say: pong' }] }),
});
const out = await chat.json();
child.kill();
console.log('reply:', JSON.stringify(out.choices?.[0]?.message?.content ?? null));
if (chat.status !== 200) { console.error('FAIL: chat round-trip'); process.exit(1); }
console.log('PASS: downloaded unsloth GGUF is discovered and served under its filename id');
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

- `docs/PITFALLS.md` → Plan C bullets: downloader flat-basename contract is probe-pinned (never rename downloaded files without probe-download re-run); curated remote list is schema-gated with shipped fallback (an empty/invalid remote NEVER blanks recommendations); fit labels are deliberately RAM-only estimates (don't add fake VRAM precision); multi-part sets must be complete before download (quant-parser drops partial sets); model delete unloads best-effort first; CUDA opt-in is Windows-only (no upstream Linux CUDA asset).
- Roadmap Progress line: Plan C merged (Phase 1 complete pending Destin's curated-list confirmation).

- [ ] **Step 5: Merge** — superpowers:finishing-a-development-branch (PR to youcoded master). After merge: junction removal → worktree removal → branch delete → dev server down.

---

## Self-review notes (already applied)

- Spec §4.1: tiered ladder ✓ (tier field + grouped panel), RAM-sized ✓ (fit labels per tier card), unsloth repos ✓, shipped + raw-GitHub refresh with fallback ✓, entry shape verbatim ✓. **Seed list is a flagged placeholder for Destin.**
- Spec §4.2: HF search URL ✓, per-repo file listing ✓ (recursive — unsloth subfolders), UD- quant parsing ✓, multi-part recognized + downloaded as a set ✓, pure parser with real unsloth fixtures ✓.
- Spec §4.3: `os.totalmem()` ✓, explicit estimate labels ✓, disk guard before download ✓, no fake precision ✓.
- Spec §4.4: HF resolve URLs into the standard llama.cpp cache ✓, progress over IPC ✓, resume ✓, multi-part ✓, checksum where HF provides one (lfs.oid) ✓, cancel + cleanup ✓ (partial kept for resume; delete cleans).
- Spec §4.5: engine card status/version/backend ✓, backend picker ✓ (CUDA opt-in, "faster on NVIDIA", Windows-only per upstream assets), context knob ✓, cache location ✓, installed list size/quant/last-used ✓, consequence-gated delete ✓, set-default-per-tier ✓ (stored in config.json; consumed as a panel badge — deeper picker preselection intentionally deferred), Ollama/LM Studio detectors ✓ (never required, never auto-added).
- Spec §4.6: all listed channels ✓ + justified additions (`models:quants`, `models:download-cancel`, `engine:set-context`); parity + Android stubs ✓.
- Type-consistency check: `QuantOption`/`DownloadProgress`/`InstalledLocalModel` names match across quant-parser → hf-client → downloader → manager → panel; `LocalEngineHook.noteModelUsed` optional-method shape matches registry call site.
