---
status: shipped
---

# Phase 1 Plan B — Local llama.cpp Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native sessions chat with a locally supervised llama.cpp engine, fully offline — engine downloaded on first use (SHA-256-verified), spawned as a router-mode `llama-server` subprocess with health/crash/idle supervision, and wired into the existing ProviderRegistry as the `local` provider.

**Architecture:** A new `desktop/src/main/engine/` module tree: `engine-pin.ts` (the ONE pinned version + per-platform asset table with checksums), `engine-acquisition.ts` (download → verify → unpack to `userData/engine/<version>-<backend>/`), `engine-supervisor.ts` (spawn `llama-server` router mode on a shifted port, health-poll, bounded crash-restart, idle shutdown with in-flight request tracking), and `engine-manager.ts` (composes the three + `~/.youcoded/config.json` engine section, and exposes the `LocalEngineHook` that `ProviderRegistry`'s `local-engine` branch calls). Everything stays dormant behind `YOUCODED_NATIVE=1` (production `native.supported` is false until Phase 2).

**Tech Stack:** TypeScript (Electron main + React renderer), llama.cpp `llama-server` (pinned GitHub release build, router mode), AI SDK v7 `@ai-sdk/openai-compatible` (already installed by Plan A), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-10-phase1-engine-providers-design.md` §3 (+ §0 decisions 5–6, §5 testing). ADR: `docs/decisions/007-llamacpp-direct-local-engine.md`. Phase 0 interface contract: `2026-07-10-phase0-foundations-design.md` §1–2.

---

## Context primer (read once before any task)

Repo: the `youcoded` sub-repo (`youcoded-dev/youcoded`). Desktop app lives in `desktop/`. **Work in a worktree:**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded.wt/local-engine -b feat/native-local-engine
cd ../youcoded.wt/local-engine/desktop
cmd //c "mklink /J node_modules ..\\..\\..\\youcoded\\desktop\\node_modules"   # share deps; REMOVE junction (cmd //c "rmdir node_modules") BEFORE any git worktree remove
```

Run tests from `desktop/`: `npx vitest run tests/<file>.test.ts` (single file), `npm test -- --run` (all). Electron is aliased to a mock at `tests/__mocks__/electron.ts` via `vitest.config.ts`.

**Codebase facts every task relies on** (verified 2026-07-13 against master):

1. **Plan A is merged and is the substrate.** `src/main/providers/provider-registry.ts` — its constructor's third param is `localBaseUrl: () => string | null = () => null` (line 37) with a `local-engine` case in `languageModel()` (~line 184) and `testConnection()` (~line 252) that error out while the callback returns null. **Plan B replaces that callback with a `LocalEngineHook` interface** (Task 7). `src/main/providers/model-catalog.ts` — `get(providers)` at line 169 skips `local-engine` with a comment saying Plan B adds it. `src/shared/provider-types.ts` — `CatalogModel` has no `local` field yet; Phase 0 §2 defines it; Plan B adds it.
2. **Wiring point:** `src/main/ipc-handlers.ts:1776-1805` constructs `NativeHome`, `SecretsStore`, `ProviderRegistry`, `ModelCatalog`, `NativeSessionHost`, and calls `remoteServer?.setNativeRuntime({...})` at 1805. Provider IPC handlers are at 1824-1838. App-quit teardown for the native stack (`void nativeHost.destroyAll().catch(() => {})`) is at ipc-handlers.ts:2901 — engine shutdown registers next to it.
3. `HarnessSession` calls `await this.modelFactory(this.binding)` **per send** (`src/main/harness/harness-session.ts:108`) — so an `await ensureRunning()` inside the registry's `local-engine` branch both lazily boots the engine and touches its idle timer on every message. `contextLengthFor(binding, providers)` (model-catalog.ts:187) feeds context-window sizing; local models must report the **configured `-c` value**, not the model's trained max (the engine truncates at `-c`; reporting more would let HarnessSession send an overflowing history).
4. **IPC constants live in TWO places with identical values:** `src/shared/types.ts` (`IPC` object, ~line 615-904 — Plan A's `native:*`/`provider:*` block ends at 903) and `src/main/preload.ts`'s inlined copy (~line 284-293 for the native block). `tests/ipc-channels.test.ts` regex-extracts both and asserts equality. Preload namespace convention: see `native:`/`providers:` at preload.ts:978-997; push subscriptions return an unsubscribe (see `onInstallProgress` at preload.ts:688-691).
5. `src/renderer/remote-shim.ts` mirrors the namespaces at 1347-1366 (`invoke('chan', {objectPayload})` / `fire(...)`); push events are dispatched by channel name (see `dev:install-progress` handling at remote-shim.ts:270 + 1188). `src/main/remote-server.ts` has per-channel `case` rows at ~581-640 delegating to `this.nativeRuntime` (injected via `setNativeRuntime`, line 86); throw-prone calls wrap in try/catch and respond `{ok:false,error}`.
6. Android stub template: the combined `when` case in `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (search `not-implemented-on-mobile`; Plan A's native/provider channels are already in one case) — add new channel strings to that same case.
7. Shifted ports: `src/shared/ports.ts` exports `PORT_OFFSET` (`YOUCODED_PORT_OFFSET`, 50 in dev). The engine port must come from here so dev + built instances never collide (spec §3.2).
8. Broadcast helpers in ipc-handlers.ts: `send(channel, ...args)` (~line 84, all windows) and `sendForSession` (~103). Renderer-bound push events also need `remoteServer?.broadcast({ type: 'chan', payload })` for remote browsers.
9. `~/.youcoded/config.json` does not exist yet — no reader anywhere. Plan B creates the `engine` section via `NativeHome.mutateJson` (`src/main/native-home.ts` — `readJson` returns null on missing/corrupt, `mutateJson` is locked read-modify-write that THROWS on lock exhaustion).
10. Settings UI: `src/renderer/components/ProvidersSection.tsx` renders the provider list (imported by `SettingsPanel.tsx:22`, rendered at :2298, gated on `window.claude.native?.supported` internally). Plan B adds a minimal engine card under the `local` provider row; Plan C relocates/expands it into the full Local Models panel.
11. Every non-trivial edit gets a WHY comment (Destin is a non-developer). Commit messages: conventional prefixes, end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
12. Status-language rule: plain words, never `●◐○` glyphs.

**Verified llama.cpp facts** (2026-07-13, release `b9986`; re-verify at pin time — Task 2's generate script + Task 11's probes do this):

- Release assets: `llama-<tag>-bin-win-vulkan-x64.zip`, `llama-<tag>-bin-win-cpu-x64.zip`, `llama-<tag>-bin-win-cpu-arm64.zip`, `llama-<tag>-bin-win-cuda-12.4-x64.zip`, `llama-<tag>-bin-macos-arm64.tar.gz`, `llama-<tag>-bin-macos-x64.tar.gz`, `llama-<tag>-bin-ubuntu-x64.tar.gz`, `llama-<tag>-bin-ubuntu-arm64.tar.gz`, `llama-<tag>-bin-ubuntu-vulkan-x64.tar.gz`, `llama-<tag>-bin-ubuntu-vulkan-arm64.tar.gz`. **There is NO upstream Linux CUDA asset** — CUDA opt-in (Plan C) is Windows-only. The GitHub release API (`/repos/ggml-org/llama.cpp/releases/tags/<tag>`) publishes a SHA-256 `digest` per asset.
- Router mode = start `llama-server` **without `-m`**. It auto-discovers GGUFs from `LLAMA_CACHE` (default `~/.cache/llama.cpp`) or `--models-dir PATH`. `--models-max N` (default 4) bounds concurrently loaded models with LRU eviction; each model runs in its own child process. A `/v1/chat/completions` request naming an unloaded model auto-loads it.
- Endpoints: `GET /health` → 200 `{"status":"ok"}` when ready (503 while loading); `GET /models` lists discovered models with status (`loaded`/`loading`/`unloaded`); `POST /models/load` / `POST /models/unload` take `{"model":"<name>"}`.
- `--no-webui` disables the bundled web UI; `--jinja` enables the Jinja chat-template engine (required later for tool calling — spawn with it from day one so Phase 2 doesn't change the process shape).
- Model instances inherit the router's CLI args and env — `-c N` (context) applies to every loaded model.

**File map (created →/modified ✎):**

| File | Role |
|---|---|
| → `desktop/src/shared/engine-types.ts` | EngineBackend/EngineStatus/EngineInstallProgress/EngineModel (shared main + renderer) |
| → `desktop/src/main/engine/engine-pin.ts` | pinned version + asset table + checksums + `pickAsset`/`assetUrl`/`defaultBackend` |
| → `desktop/scripts/generate-engine-pin.mjs` | regenerates the asset table from the GitHub release API |
| → `desktop/src/main/engine/engine-config.ts` | `engine` section of `~/.youcoded/config.json` (cacheDir/backend/contextSize) |
| → `desktop/src/main/engine/engine-acquisition.ts` | download+resume, SHA-256 verify, unpack, `.complete` marker, `installed()` |
| → `desktop/src/main/engine/cache-scan.ts` | GGUF cache scan → model ids without booting the engine |
| → `desktop/src/main/engine/engine-supervisor.ts` | spawn/health/crash/strike-out/idle + trackedFetch + listModels |
| → `desktop/src/main/engine/engine-manager.ts` | composition root: status/install/restart, `LocalEngineHook`, catalog source |
| → `desktop/src/renderer/components/EngineCard.tsx` | minimal install/status card (Plan C absorbs it into Local Models) |
| → `desktop/test-engine/{README.md,probe-health.mjs,probe-models.mjs,probe-chat.mjs}` | dev-run smoke probes against the real pinned binary |
| ✎ `desktop/src/shared/ports.ts` | `ENGINE_PORT` |
| ✎ `desktop/src/shared/types.ts` + `desktop/src/main/preload.ts` | `engine:*` IPC constants (both copies) + `engine` namespace |
| ✎ `desktop/src/shared/provider-types.ts` | `CatalogModel.local` field (Phase 0 §2 shape) |
| ✎ `desktop/src/main/providers/provider-registry.ts` | `LocalEngineHook` replaces the `localBaseUrl` callback |
| ✎ `desktop/src/main/providers/model-catalog.ts` | `localModels` source merged into `get()` |
| ✎ `desktop/src/main/ipc-handlers.ts` | EngineManager wiring + handlers + quit teardown |
| ✎ `desktop/src/renderer/remote-shim.ts`, `desktop/src/main/remote-server.ts` | shim namespace + WS case rows |
| ✎ `desktop/src/renderer/components/ProvidersSection.tsx` | render EngineCard under the local provider row |
| ✎ `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` | add `engine:*` strings to the not-implemented stub case |
| ✎ `desktop/tests/ipc-channels.test.ts` | `engine:*` parity describe |
| ✎ `youcoded/docs/engine-dependencies.md` | populate touchpoints (Task 11) |
| ✎ (workspace repo) `docs/PITFALLS.md`, roadmap spec Progress line | Task 12 |

---

### Task 1: Shared types, engine port, IPC constants

**Files:**
- Create: `desktop/src/shared/engine-types.ts`
- Modify: `desktop/src/shared/ports.ts`
- Modify: `desktop/src/shared/types.ts` (IPC block, after `PROVIDER_CATALOG` at ~line 903)
- Modify: `desktop/src/main/preload.ts` (inlined IPC copy, after its `PROVIDER_CATALOG` at ~line 293)
- Test: `desktop/tests/ipc-channels.test.ts` (existing cross-check must stay green)

- [ ] **Step 1: Create `desktop/src/shared/engine-types.ts`**

```ts
// Engine-layer shapes — Phase 1 Plan B (spec 2026-07-10-phase1-engine-providers-design.md §3).
// Shared between main and renderer; keep free of Node/Electron imports.

export type EngineBackend = 'vulkan' | 'cpu' | 'metal' | 'cuda';

export type EngineRunState = 'not-installed' | 'stopped' | 'starting' | 'running' | 'error';

export interface EngineStatus {
  installed: boolean;
  installedVersion: string | null;   // e.g. 'b9986' once installed
  pinnedVersion: string;             // what engine-pin.ts currently wants (differs after a pin bump)
  backend: EngineBackend | null;     // backend of the installed build
  state: EngineRunState;
  errorMessage?: string;             // plain language; present when state === 'error'
  cacheDir: string;                  // where GGUF models live (LLAMA_CACHE)
  port: number;
}

export type EngineInstallProgress =
  | { kind: 'download'; receivedBytes: number; totalBytes: number | null }
  | { kind: 'verify' }
  | { kind: 'unpack' }
  | { kind: 'done'; version: string; backend: EngineBackend }
  | { kind: 'error'; message: string };

/** One GGUF the engine can serve — from GET /models when running, else a cache scan. */
export interface EngineModel {
  id: string;              // what /v1/chat/completions expects in its "model" field
  sizeBytes: number | null;
  loaded: boolean;         // always false when derived from a cache scan (engine not running)
}
```

- [ ] **Step 2: Add the engine port to `desktop/src/shared/ports.ts`** (append after `REMOTE_SERVER_DEFAULT_PORT`)

```ts
// llama-server (native local engine, Plan B). 9920 built / 9970 dev — clear of
// the remote server (9900/9950) and the Android releaseTest bridge (9961).
export const ENGINE_PORT = 9920 + PORT_OFFSET;
```

- [ ] **Step 3: Add IPC constants to `desktop/src/shared/types.ts`** (immediately after `PROVIDER_CATALOG: 'provider:catalog',`)

```ts
  // ---- Native runtime Plan B (Phase 1): local llama.cpp engine ----
  ENGINE_STATUS: 'engine:status',
  ENGINE_INSTALL: 'engine:install',
  ENGINE_RESTART: 'engine:restart',
  // Push events (no id): install progress + run-state transitions.
  ENGINE_INSTALL_PROGRESS: 'engine:install-progress',
  ENGINE_STATUS_CHANGED: 'engine:status-changed',
```

- [ ] **Step 4: Add the SAME five constants, identical values, to preload.ts's inlined `IPC` object** (after its `PROVIDER_CATALOG` row).

- [ ] **Step 5: Run the existing parity cross-check**

Run: `npx vitest run tests/ipc-channels.test.ts`
Expected: PASS (the constant-equality describe sees both copies match; the per-channel parity describe for `engine:*` comes in Task 9).

- [ ] **Step 6: Commit**

```bash
git add src/shared/engine-types.ts src/shared/ports.ts src/shared/types.ts src/main/preload.ts
git commit -m "feat(engine): shared engine types, ENGINE_PORT, engine:* IPC constants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Engine pin (`engine-pin.ts`) + generator script

The ONE module a version bump touches (spec §3.1). The asset table is generated from the GitHub release API (which publishes a SHA-256 `digest` per asset) and hand-annotated with each archive's internal binary path.

**Files:**
- Create: `desktop/src/main/engine/engine-pin.ts`
- Create: `desktop/scripts/generate-engine-pin.mjs`
- Test: `desktop/tests/engine-pin.test.ts`

- [ ] **Step 1: Write the failing test** — `desktop/tests/engine-pin.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  ENGINE_VERSION, ENGINE_ASSETS, pickAsset, assetUrl, defaultBackend,
} from '../src/main/engine/engine-pin';

describe('engine-pin', () => {
  it('every asset row is fully populated (no placeholder checksums or paths)', () => {
    expect(ENGINE_ASSETS.length).toBeGreaterThan(0);
    for (const a of ENGINE_ASSETS) {
      expect(a.assetName).toContain(ENGINE_VERSION);
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.binaryRelPath.length).toBeGreaterThan(0);
    }
  });

  it('picks the Vulkan build on Windows x64 and the Metal (default) build on macOS arm64', () => {
    const win = pickAsset('win32', 'x64', 'vulkan');
    expect(win?.assetName).toBe(`llama-${ENGINE_VERSION}-bin-win-vulkan-x64.zip`);
    const mac = pickAsset('darwin', 'arm64', 'metal');
    expect(mac?.assetName).toBe(`llama-${ENGINE_VERSION}-bin-macos-arm64.tar.gz`);
  });

  it('returns null for combinations upstream does not ship (Linux CUDA)', () => {
    expect(pickAsset('linux', 'x64', 'cuda')).toBeNull();
  });

  it('defaultBackend: metal on darwin, vulkan elsewhere', () => {
    expect(defaultBackend('darwin')).toBe('metal');
    expect(defaultBackend('win32')).toBe('vulkan');
    expect(defaultBackend('linux')).toBe('vulkan');
  });

  it('assetUrl points at the pinned ggml-org release', () => {
    const a = pickAsset('win32', 'x64', 'cpu')!;
    expect(assetUrl(a)).toBe(
      `https://github.com/ggml-org/llama.cpp/releases/download/${ENGINE_VERSION}/${a.assetName}`
    );
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/engine-pin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `desktop/scripts/generate-engine-pin.mjs`**

```js
#!/usr/bin/env node
// Regenerates the ENGINE_ASSETS table for src/main/engine/engine-pin.ts from
// the GitHub release API (assets carry a sha256 `digest`). Usage:
//   node scripts/generate-engine-pin.mjs b9986
// Paste the printed rows into engine-pin.ts, keep/adjust binaryRelPath per
// archive family (verified by the unpack test + test-engine probes), bump
// ENGINE_VERSION, and re-run the test-engine/ probes (engine-dependencies.md).
const tag = process.argv[2];
if (!tag) { console.error('usage: generate-engine-pin.mjs <release-tag>'); process.exit(1); }

// Only the variants YouCoded ships (spec §3.1): Vulkan default on win/linux,
// CPU fallback, Metal-by-default macOS builds, CUDA opt-in (Windows only —
// upstream publishes no Linux CUDA asset).
const WANTED = [
  { platform: 'win32',  arch: 'x64',   backend: 'vulkan', suffix: 'bin-win-vulkan-x64.zip',        binaryRelPath: 'llama-server.exe' },
  { platform: 'win32',  arch: 'x64',   backend: 'cpu',    suffix: 'bin-win-cpu-x64.zip',           binaryRelPath: 'llama-server.exe' },
  { platform: 'win32',  arch: 'arm64', backend: 'cpu',    suffix: 'bin-win-cpu-arm64.zip',         binaryRelPath: 'llama-server.exe' },
  { platform: 'win32',  arch: 'x64',   backend: 'cuda',   suffix: 'bin-win-cuda-12.4-x64.zip',     binaryRelPath: 'llama-server.exe' },
  { platform: 'darwin', arch: 'arm64', backend: 'metal',  suffix: 'bin-macos-arm64.tar.gz',        binaryRelPath: 'build/bin/llama-server' },
  { platform: 'darwin', arch: 'x64',   backend: 'metal',  suffix: 'bin-macos-x64.tar.gz',          binaryRelPath: 'build/bin/llama-server' },
  { platform: 'linux',  arch: 'x64',   backend: 'vulkan', suffix: 'bin-ubuntu-vulkan-x64.tar.gz',  binaryRelPath: 'build/bin/llama-server' },
  { platform: 'linux',  arch: 'x64',   backend: 'cpu',    suffix: 'bin-ubuntu-x64.tar.gz',         binaryRelPath: 'build/bin/llama-server' },
  { platform: 'linux',  arch: 'arm64', backend: 'vulkan', suffix: 'bin-ubuntu-vulkan-arm64.tar.gz',binaryRelPath: 'build/bin/llama-server' },
  { platform: 'linux',  arch: 'arm64', backend: 'cpu',    suffix: 'bin-ubuntu-arm64.tar.gz',       binaryRelPath: 'build/bin/llama-server' },
];

const res = await fetch(`https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${tag}`);
if (!res.ok) { console.error(`GitHub API ${res.status}`); process.exit(1); }
const release = await res.json();

for (const w of WANTED) {
  const name = `llama-${tag}-${w.suffix}`;
  const asset = (release.assets ?? []).find((a) => a.name === name);
  if (!asset) { console.error(`// MISSING upstream asset: ${name} — upstream naming changed? Update WANTED.`); continue; }
  const digest = String(asset.digest ?? '').replace(/^sha256:/, '');
  if (!/^[0-9a-f]{64}$/.test(digest)) { console.error(`// NO sha256 digest for ${name} — compute manually and paste.`); continue; }
  console.log(`  { platform: '${w.platform}', arch: '${w.arch}', backend: '${w.backend}', assetName: '${name}', sha256: '${digest}', binaryRelPath: '${w.binaryRelPath}' },`);
}
console.log(`\n// ENGINE_VERSION = '${tag}'`);
```

- [ ] **Step 4: Run the generator against the latest release and create `desktop/src/main/engine/engine-pin.ts`**

Run: `node scripts/generate-engine-pin.mjs $(curl -s https://api.github.com/repos/ggml-org/llama.cpp/releases/latest | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4)`

Then create the module with the generated rows pasted into `ENGINE_ASSETS`:

```ts
// The ONE place the llama.cpp engine version is pinned (spec §3.1). Bumping
// ENGINE_VERSION is a PR that MUST re-run the test-engine/ probes and re-verify
// docs/engine-dependencies.md — the same discipline as a Claude Code bump.
// Regenerate the table: node scripts/generate-engine-pin.mjs <tag>
// binaryRelPath (path of llama-server inside each archive) is pinned per
// archive family and enforced by engine-acquisition's post-unpack existence
// check — a layout change upstream fails loudly, never installs a broken dir.
import type { EngineBackend } from '../../shared/engine-types';

export const ENGINE_VERSION = '<PASTE TAG FROM GENERATOR>';

export interface EngineAsset {
  platform: 'win32' | 'darwin' | 'linux';
  arch: 'x64' | 'arm64';
  backend: EngineBackend;
  assetName: string;      // exact GitHub release asset filename
  sha256: string;         // from the release API's asset digest
  binaryRelPath: string;  // path of llama-server inside the unpacked archive
}

export const ENGINE_ASSETS: EngineAsset[] = [
  // <PASTE GENERATED ROWS>
];

export function pickAsset(
  platform: NodeJS.Platform | string, arch: string, backend: EngineBackend
): EngineAsset | null {
  return ENGINE_ASSETS.find(
    (a) => a.platform === platform && a.arch === arch && a.backend === backend
  ) ?? null;
}

export function assetUrl(a: EngineAsset): string {
  return `https://github.com/ggml-org/llama.cpp/releases/download/${ENGINE_VERSION}/${a.assetName}`;
}

/** Spec §3.1 defaults: Metal on macOS; Vulkan on Windows/Linux (CPU is the
 *  automatic fallback when the Vulkan build fails to boot — engine-manager). */
export function defaultBackend(platform: NodeJS.Platform | string): EngineBackend {
  return platform === 'darwin' ? 'metal' : 'vulkan';
}
```

**IMPORTANT — verify `binaryRelPath` empirically before committing:** download the Windows Vulkan zip and one ubuntu/macos tar.gz from the pinned release, list contents (`tar -tf <file> | head -30`), and correct the `binaryRelPath` values if the archive layout differs from the defaults above (win zips have historically kept binaries at the archive root; ubuntu/macos tarballs under `build/bin/`). Record what you found in `docs/engine-dependencies.md` (Task 11 formalizes this).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/engine-pin.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/engine/engine-pin.ts scripts/generate-engine-pin.mjs tests/engine-pin.test.ts
git commit -m "feat(engine): pin llama.cpp engine version + per-platform asset table with checksums

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Engine config (`~/.youcoded/config.json` engine section)

**Files:**
- Create: `desktop/src/main/engine/engine-config.ts`
- Test: `desktop/tests/engine-config.test.ts`

- [ ] **Step 1: Write the failing test** — `desktop/tests/engine-config.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NativeHome } from '../src/main/native-home';
import {
  readEngineConfig, updateEngineConfig, defaultCacheDir, DEFAULT_CONTEXT_SIZE,
} from '../src/main/engine/engine-config';

let root: string;
let home: NativeHome;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-config-'));
  home = new NativeHome(root);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('engine-config', () => {
  it('returns platform defaults when config.json is absent', () => {
    const cfg = readEngineConfig(home);
    expect(cfg.cacheDir).toBe(defaultCacheDir());
    expect(cfg.backend).toBeNull();
    expect(cfg.contextSize).toBe(DEFAULT_CONTEXT_SIZE);
  });

  it('round-trips a partial update without touching other config.json keys', async () => {
    await home.writeJson('config.json', { v: 1, somethingElse: { keep: true } });
    await updateEngineConfig(home, { backend: 'cpu' });
    const cfg = readEngineConfig(home);
    expect(cfg.backend).toBe('cpu');
    expect(cfg.cacheDir).toBe(defaultCacheDir()); // untouched fields stay default
    const raw = home.readJson('config.json') as any;
    expect(raw.somethingElse).toEqual({ keep: true }); // sibling keys survive
  });

  it('ignores malformed engine values (wrong types) and falls back to defaults', async () => {
    await home.writeJson('config.json', { v: 1, engine: { cacheDir: 42, backend: 'quantum', contextSize: -5 } });
    const cfg = readEngineConfig(home);
    expect(cfg.cacheDir).toBe(defaultCacheDir());
    expect(cfg.backend).toBeNull();
    expect(cfg.contextSize).toBe(DEFAULT_CONTEXT_SIZE);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engine-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `desktop/src/main/engine/engine-config.ts`**

```ts
// Engine section of ~/.youcoded/config.json (Phase 0 §1: the GGUF cache path is
// recorded in config.json). The engine VERSION pin deliberately lives in CODE
// (engine-pin.ts), not here: config.json is a syncable per-user file while
// engine binaries are per-machine — a synced pin would tell machine B to trust
// a binary it never verified. All writes go through NativeHome's locked
// mutateJson (dev instance + built app share ~/.youcoded).
import * as path from 'path';
import * as os from 'os';
import { NativeHome } from '../native-home';
import type { EngineBackend } from '../../shared/engine-types';

const FILE = 'config.json';

export interface EngineConfig {
  cacheDir: string;              // LLAMA_CACHE — where GGUFs live
  backend: EngineBackend | null; // null = platform default (engine-pin defaultBackend)
  contextSize: number;           // -c for llama-server; inherited by every model instance
}

// 32768 sits well above llama-server's 4096 default (the silent-truncation trap
// ADR 007 calls out in Ollama) without allocating the monster KV cache a
// 128k+ default would. User-tunable in Plan C's Local Models panel.
export const DEFAULT_CONTEXT_SIZE = 32768;

export function defaultCacheDir(homedir: string = os.homedir()): string {
  // llama.cpp's own default when LLAMA_CACHE is unset — sharing it means models
  // the user already pulled with llama-cli/-hf appear in YouCoded and vice versa
  // (spec §4.4 / Phase 0 §1 "GGUF models" note).
  return path.join(homedir, '.cache', 'llama.cpp');
}

const BACKENDS: ReadonlySet<string> = new Set(['vulkan', 'cpu', 'metal', 'cuda']);

export function readEngineConfig(home: NativeHome): EngineConfig {
  const cfg = home.readJson(FILE) as any;
  const e = cfg && typeof cfg === 'object' ? (cfg as any).engine : null;
  return {
    cacheDir: typeof e?.cacheDir === 'string' && e.cacheDir ? e.cacheDir : defaultCacheDir(),
    backend: typeof e?.backend === 'string' && BACKENDS.has(e.backend) ? (e.backend as EngineBackend) : null,
    contextSize: typeof e?.contextSize === 'number' && Number.isFinite(e.contextSize) && e.contextSize > 0
      ? Math.floor(e.contextSize) : DEFAULT_CONTEXT_SIZE,
  };
}

export async function updateEngineConfig(home: NativeHome, patch: Partial<EngineConfig>): Promise<void> {
  await home.mutateJson(FILE, (cur) => {
    // Preserve sibling top-level keys — config.json will grow other sections
    // (Plan C model stats, later phases). Only the engine object is merged.
    const file = (cur && typeof cur === 'object' ? cur : { v: 1 }) as any;
    if (typeof file.v !== 'number') file.v = 1;
    file.engine = { ...(file.engine ?? {}), ...patch };
    return file;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/engine-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/engine-config.ts tests/engine-config.test.ts
git commit -m "feat(engine): engine section of ~/.youcoded/config.json (cacheDir/backend/contextSize)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Engine acquisition (download → verify → unpack)

**Files:**
- Create: `desktop/src/main/engine/engine-acquisition.ts`
- Test: `desktop/tests/engine-acquisition.test.ts`

- [ ] **Step 1: Write the failing test** — `desktop/tests/engine-acquisition.test.ts`

The test builds a real tiny `.tar.gz` fixture at runtime (system `tar` is a hard dependency of the implementation, so the test exercising it is honest), serves it through a mocked fetch, and asserts the install contract.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import { EngineAcquisition } from '../src/main/engine/engine-acquisition';
import { ENGINE_VERSION } from '../src/main/engine/engine-pin';
import type { EngineAsset } from '../src/main/engine/engine-pin';
import type { EngineInstallProgress } from '../src/shared/engine-types';

let tmp: string;
let engineRoot: string;
let archivePath: string;
let asset: EngineAsset;

/** Build a real tar.gz containing build/bin/llama-server so the system-tar
 *  unpack path is exercised end to end. */
function makeFixtureArchive(dir: string): string {
  const stage = path.join(dir, 'stage');
  fs.mkdirSync(path.join(stage, 'build', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(stage, 'build', 'bin', 'llama-server'), '#!/bin/sh\necho fake\n');
  const out = path.join(dir, 'fixture.tar.gz');
  execFileSync('tar', ['-czf', out, '-C', stage, 'build']);
  return out;
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** fetch mock streaming the fixture file, honoring Range requests. */
function fetchServing(file: string): typeof fetch {
  return (async (_url: any, init?: any) => {
    const buf = fs.readFileSync(file);
    const range = init?.headers?.Range as string | undefined;
    let start = 0;
    if (range) start = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
    if (start >= buf.length) return new Response(null, { status: 416 });
    const body = buf.subarray(start);
    return new Response(new Blob([body]).stream(), {
      status: start > 0 ? 206 : 200,
      headers: { 'content-length': String(body.length) },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-acq-'));
  engineRoot = path.join(tmp, 'engine');
  archivePath = makeFixtureArchive(tmp);
  asset = {
    platform: 'linux', arch: 'x64', backend: 'cpu',
    assetName: `llama-${ENGINE_VERSION}-bin-test-x64.tar.gz`,
    sha256: sha256(archivePath),
    binaryRelPath: path.join('build', 'bin', 'llama-server'),
  };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('EngineAcquisition', () => {
  it('installs: downloads, verifies, unpacks, writes .complete LAST, reports progress', async () => {
    const acq = new EngineAcquisition(engineRoot, fetchServing(archivePath));
    const events: EngineInstallProgress[] = [];
    const installed = await acq.install(asset, (p) => events.push(p));

    expect(fs.existsSync(installed.binaryPath)).toBe(true);
    expect(installed.version).toBe(ENGINE_VERSION);
    expect(installed.backend).toBe('cpu');
    // .complete marker present and points at the binary
    const marker = JSON.parse(fs.readFileSync(path.join(installed.dir, '.complete'), 'utf8'));
    expect(marker.binaryRelPath).toBe(asset.binaryRelPath);
    // progress: at least one download event, then verify, unpack, done
    expect(events.some((e) => e.kind === 'download')).toBe(true);
    expect(events.map((e) => e.kind)).toContain('verify');
    expect(events[events.length - 1]).toEqual({ kind: 'done', version: ENGINE_VERSION, backend: 'cpu' });
    // the downloaded archive is cleaned up
    expect(fs.readdirSync(engineRoot).filter((f) => f.endsWith('.download'))).toEqual([]);
  });

  it('installed() finds the usable install and returns null when the binary vanished', async () => {
    const acq = new EngineAcquisition(engineRoot, fetchServing(archivePath));
    const installed = await acq.install(asset, () => {});
    expect(acq.installed()?.dir).toBe(installed.dir);
    fs.rmSync(installed.binaryPath); // marker present but binary gone → not usable
    expect(acq.installed()).toBeNull();
  });

  it('REFUSES a checksum mismatch and deletes the bad download', async () => {
    const acq = new EngineAcquisition(engineRoot, fetchServing(archivePath));
    const bad = { ...asset, sha256: '0'.repeat(64) };
    await expect(acq.install(bad, () => {})).rejects.toThrow(/integrity check/);
    expect(acq.installed()).toBeNull();
    expect(fs.existsSync(path.join(engineRoot, `${asset.assetName}.download`))).toBe(false);
  });

  it('resumes a partial download via a Range request', async () => {
    fs.mkdirSync(engineRoot, { recursive: true });
    // Pre-seed the first 10 bytes as an interrupted download.
    const full = fs.readFileSync(archivePath);
    fs.writeFileSync(path.join(engineRoot, `${asset.assetName}.download`), full.subarray(0, 10));
    const fetchImpl = fetchServing(archivePath);
    const acq = new EngineAcquisition(engineRoot, fetchImpl);
    const installed = await acq.install(asset, () => {});
    expect(fs.existsSync(installed.binaryPath)).toBe(true); // resumed bytes hash-verified whole
  });

  it('never leaves a half-unpacked dir marked usable when the archive lacks the binary', async () => {
    // Archive missing build/bin/llama-server → post-unpack existence check throws.
    const stage = path.join(tmp, 'empty-stage'); fs.mkdirSync(path.join(stage, 'build'), { recursive: true });
    fs.writeFileSync(path.join(stage, 'build', 'README'), 'nope');
    const emptyArchive = path.join(tmp, 'empty.tar.gz');
    execFileSync('tar', ['-czf', emptyArchive, '-C', stage, 'build']);
    const badAsset = { ...asset, sha256: sha256(emptyArchive) };
    const acq = new EngineAcquisition(engineRoot, fetchServing(emptyArchive));
    await expect(acq.install(badAsset, () => {})).rejects.toThrow(/did not contain/);
    expect(acq.installed()).toBeNull(); // no .complete anywhere
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engine-acquisition.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `desktop/src/main/engine/engine-acquisition.ts`**

```ts
// Engine acquisition (spec §3.1): download the pinned llama.cpp release asset,
// SHA-256-verify against engine-pin.ts, unpack into userData/engine/
// <version>-<backend>/. The invariant: NEVER leave a half-unpacked dir marked
// usable — unpack goes into a `.unpacking` sibling, the `.complete` marker is
// written INSIDE it last, and only then is it renamed into place.
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { EngineAsset } from './engine-pin';
import { ENGINE_VERSION, assetUrl } from './engine-pin';
import type { EngineBackend, EngineInstallProgress } from '../../shared/engine-types';

const execFileAsync = promisify(execFile);
// Progress events throttled so a fast download doesn't flood IPC.
const PROGRESS_INTERVAL_MS = 250;

export interface InstalledEngine {
  version: string;
  backend: EngineBackend;
  binaryPath: string;   // absolute path to llama-server(.exe)
  dir: string;
}

interface CompleteMarker { version: string; backend: EngineBackend; binaryRelPath: string; }

export class EngineAcquisition {
  /** engineRoot = <userData>/engine — per-machine, never synced (Phase 0 §1). */
  constructor(private engineRoot: string, private fetchImpl: typeof fetch = fetch) {}

  installDir(version: string, backend: EngineBackend): string {
    return path.join(this.engineRoot, `${version}-${backend}`);
  }

  /** Newest USABLE install: a dir with a .complete marker whose binary exists.
   *  Prefers the pinned version so an old engine keeps serving while a pin
   *  bump downloads the new one. */
  installed(): InstalledEngine | null {
    let entries: string[] = [];
    try { entries = fs.readdirSync(this.engineRoot); } catch { return null; }
    const found: InstalledEngine[] = [];
    for (const name of entries) {
      const dir = path.join(this.engineRoot, name);
      try {
        const marker = JSON.parse(fs.readFileSync(path.join(dir, '.complete'), 'utf8')) as CompleteMarker;
        const binaryPath = path.join(dir, marker.binaryRelPath);
        if (fs.existsSync(binaryPath)) {
          found.push({ version: marker.version, backend: marker.backend, binaryPath, dir });
        }
      } catch { /* no marker / unreadable → not a usable install; skip */ }
    }
    return found.find((f) => f.version === ENGINE_VERSION) ?? found[0] ?? null;
  }

  async install(asset: EngineAsset, onProgress: (p: EngineInstallProgress) => void): Promise<InstalledEngine> {
    const finalDir = this.installDir(ENGINE_VERSION, asset.backend);
    // Idempotent: an already-usable install of this exact version+backend is
    // returned as-is (the panel's Install button can be pressed twice).
    const existingMarker = path.join(finalDir, '.complete');
    if (fs.existsSync(existingMarker)) {
      try {
        const m = JSON.parse(fs.readFileSync(existingMarker, 'utf8')) as CompleteMarker;
        const bin = path.join(finalDir, m.binaryRelPath);
        if (fs.existsSync(bin)) {
          onProgress({ kind: 'done', version: ENGINE_VERSION, backend: asset.backend });
          return { version: ENGINE_VERSION, backend: asset.backend, binaryPath: bin, dir: finalDir };
        }
      } catch { /* corrupt marker → reinstall below */ }
    }

    fs.mkdirSync(this.engineRoot, { recursive: true });
    const archivePath = path.join(this.engineRoot, `${asset.assetName}.download`);
    try {
      await this.download(assetUrl(asset), archivePath, onProgress);

      onProgress({ kind: 'verify' });
      const hash = await sha256File(archivePath);
      if (hash !== asset.sha256) {
        // A corrupted OR tampered download — never unpack it. The .download is
        // deleted so the next attempt starts clean (a resume would re-verify
        // the same bad bytes forever).
        fs.rmSync(archivePath, { force: true });
        throw new Error('The downloaded engine failed its integrity check — please try installing again.');
      }

      onProgress({ kind: 'unpack' });
      const partialDir = `${finalDir}.unpacking`;
      fs.rmSync(partialDir, { recursive: true, force: true });
      fs.mkdirSync(partialDir, { recursive: true });
      // System tar handles BOTH shapes: bsdtar on Windows 10+ reads .zip, and
      // tar everywhere reads .tar.gz — no unzip dependency to bundle.
      await execFileAsync('tar', ['-xf', archivePath, '-C', partialDir]);

      const binaryPath = path.join(partialDir, asset.binaryRelPath);
      if (!fs.existsSync(binaryPath)) {
        // Upstream changed the archive layout — engine-pin.ts's binaryRelPath
        // is stale. Fail loudly; the partial dir carries no .complete marker
        // so nothing ever treats it as an install.
        throw new Error(
          `The engine archive did not contain ${asset.binaryRelPath} — the pinned layout in engine-pin.ts is stale.`
        );
      }
      if (process.platform !== 'win32') fs.chmodSync(binaryPath, 0o755);

      // Marker LAST, then atomic rename into place — the only two orders that
      // can crash mid-way both leave either no finalDir or a fully-usable one.
      const marker: CompleteMarker = { version: ENGINE_VERSION, backend: asset.backend, binaryRelPath: asset.binaryRelPath };
      fs.writeFileSync(path.join(partialDir, '.complete'), JSON.stringify(marker));
      fs.rmSync(finalDir, { recursive: true, force: true });
      fs.renameSync(partialDir, finalDir);
      fs.rmSync(archivePath, { force: true });

      onProgress({ kind: 'done', version: ENGINE_VERSION, backend: asset.backend });
      return {
        version: ENGINE_VERSION, backend: asset.backend,
        binaryPath: path.join(finalDir, asset.binaryRelPath), dir: finalDir,
      };
    } catch (e: any) {
      onProgress({ kind: 'error', message: e?.message ?? String(e) });
      throw e;
    } finally {
      // Half-unpacked temp dir never survives an attempt (the .download DOES —
      // that's the resume file).
      fs.rmSync(`${finalDir}.unpacking`, { recursive: true, force: true });
    }
  }

  /** Streaming download with Range-based resume. GitHub release assets are
   *  redirect-served (Node fetch follows) and support Range requests. */
  private async download(url: string, dest: string, onProgress: (p: EngineInstallProgress) => void): Promise<void> {
    let start = 0;
    try { start = fs.statSync(dest).size; } catch { /* no partial */ }

    const res = await this.fetchImpl(url, {
      headers: start > 0 ? { Range: `bytes=${start}-` } : undefined,
    });
    if (res.status === 416) {
      // Partial is larger than the asset (stale leftovers from another pin) —
      // start over clean.
      fs.rmSync(dest, { force: true });
      return this.download(url, dest, onProgress);
    }
    if (!res.ok && res.status !== 206) {
      throw new Error(`Engine download failed: the server responded with HTTP ${res.status}.`);
    }
    if (start > 0 && res.status !== 206) {
      // Server ignored the Range header — the body is the WHOLE file, so the
      // partial must be discarded or we'd concatenate two copies.
      fs.rmSync(dest, { force: true });
      start = 0;
    }
    if (!res.body) throw new Error('Engine download failed: empty response.');

    const lenHeader = res.headers.get('content-length');
    const totalBytes = lenHeader ? Number(lenHeader) + start : null;
    const ws = fs.createWriteStream(dest, { flags: start > 0 ? 'a' : 'w' });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    let received = start;
    let lastEmit = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        await new Promise<void>((resolve, reject) => {
          ws.write(value, (err) => (err ? reject(err) : resolve()));
        });
        const now = Date.now();
        if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
          lastEmit = now;
          onProgress({ kind: 'download', receivedBytes: received, totalBytes });
        }
      }
      onProgress({ kind: 'download', receivedBytes: received, totalBytes });
    } finally {
      await new Promise<void>((resolve) => ws.end(() => resolve()));
    }
  }
}

/** Streaming SHA-256 — engine archives are tens of MB; never buffer whole. */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/engine-acquisition.test.ts`
Expected: PASS (on Windows too — the fixture uses `tar -czf`, which bsdtar provides).

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/engine-acquisition.ts tests/engine-acquisition.test.ts
git commit -m "feat(engine): engine acquisition — resumable download, sha256 verify, atomic unpack

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: GGUF cache scan (`cache-scan.ts`)

Lists local models WITHOUT booting the engine — the model picker and Settings must never spawn llama-server just to render a list.

**Files:**
- Create: `desktop/src/main/engine/cache-scan.ts`
- Test: `desktop/tests/cache-scan.test.ts`

- [ ] **Step 1: Write the failing test** — `desktop/tests/cache-scan.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanGgufCache, ggufIdFromFileName } from '../src/main/engine/cache-scan';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gguf-cache-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function touch(name: string, bytes = 8) {
  fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes));
}

describe('scanGgufCache', () => {
  it('lists .gguf files with ids derived from filenames', () => {
    touch('Qwen3-4B-Instruct-2507-UD-Q4_K_XL.gguf', 16);
    touch('notes.txt');
    const models = scanGgufCache(dir);
    expect(models).toEqual([
      { id: 'Qwen3-4B-Instruct-2507-UD-Q4_K_XL', sizeBytes: 16, loaded: false },
    ]);
  });

  it('collapses multi-part sets to ONE entry keyed by the first part, summing sizes', () => {
    touch('Big-Model-UD-Q4_K_XL-00001-of-00002.gguf', 10);
    touch('Big-Model-UD-Q4_K_XL-00002-of-00002.gguf', 20);
    const models = scanGgufCache(dir);
    expect(models).toEqual([
      { id: 'Big-Model-UD-Q4_K_XL-00001-of-00002', sizeBytes: 30, loaded: false },
    ]);
  });

  it('returns [] for a missing directory', () => {
    expect(scanGgufCache(path.join(dir, 'nope'))).toEqual([]);
  });

  it('ggufIdFromFileName strips the extension only (router ids are filename-based)', () => {
    expect(ggufIdFromFileName('foo-Q4_K_M.gguf')).toBe('foo-Q4_K_M');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/cache-scan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `desktop/src/main/engine/cache-scan.ts`**

```ts
// GGUF cache scan — the engine-off view of "what local models exist".
// Router-mode llama-server auto-discovers the same directory (LLAMA_CACHE), so
// the ids derived here MUST match what GET /models reports once the engine is
// running. That equivalence is an EMPIRICAL contract, pinned by
// test-engine/probe-models.mjs and recorded in docs/engine-dependencies.md —
// if a probe run shows the router naming models differently, fix
// ggufIdFromFileName (one function) and update the probe assertion together.
import * as fs from 'fs';
import * as path from 'path';
import type { EngineModel } from '../../shared/engine-types';

// llama.cpp split-GGUF convention: <name>-00001-of-000NN.gguf. The model is
// addressed through its FIRST part; other parts are the same model's payload.
const PART_RE = /-(\d{5})-of-(\d{5})\.gguf$/i;

export function ggufIdFromFileName(fileName: string): string {
  return fileName.replace(/\.gguf$/i, '');
}

export function scanGgufCache(cacheDir: string): EngineModel[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(cacheDir, { withFileTypes: true });
  } catch {
    return []; // cache dir not created yet — no local models, not an error
  }
  const out = new Map<string, EngineModel>();
  const partSizes = new Map<string, number>(); // first-part id → summed extra bytes
  for (const ent of entries) {
    if (!ent.isFile() || !/\.gguf$/i.test(ent.name)) continue;
    let sizeBytes: number | null = null;
    try { sizeBytes = fs.statSync(path.join(cacheDir, ent.name)).size; } catch { /* raced delete */ }
    const part = PART_RE.exec(ent.name);
    if (part && part[1] !== '00001') {
      // Non-first parts fold their size into the first part's entry.
      const firstName = ent.name.replace(PART_RE, `-00001-of-${part[2]}.gguf`);
      const firstId = ggufIdFromFileName(firstName);
      partSizes.set(firstId, (partSizes.get(firstId) ?? 0) + (sizeBytes ?? 0));
      continue;
    }
    out.set(ggufIdFromFileName(ent.name), {
      id: ggufIdFromFileName(ent.name),
      sizeBytes,
      loaded: false,
    });
  }
  for (const [firstId, extra] of partSizes) {
    const first = out.get(firstId);
    if (first && first.sizeBytes !== null) first.sizeBytes += extra;
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/cache-scan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/cache-scan.ts tests/cache-scan.test.ts
git commit -m "feat(engine): GGUF cache scan — local model list without booting the engine

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: EngineSupervisor

The heart of Plan B. Mirrors the archived `opencode-service.ts` supervision pattern (its test suite is the template — spec §3.2 says so explicitly), extended with: single-flight `ensureRunning`, crash strike-out (3 crashes in 5 minutes → error state until the user acts), idle shutdown with in-flight request tracking, and `trackedFetch` (the fetch the AI SDK uses, so the idle timer sees every request AND never fires mid-stream).

**Files:**
- Create: `desktop/src/main/engine/engine-supervisor.ts`
- Test: `desktop/tests/engine-supervisor.test.ts`

- [ ] **Step 1: Write the failing test** — `desktop/tests/engine-supervisor.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { EngineSupervisor } from '../src/main/engine/engine-supervisor';

const mockSpawn = vi.fn();
vi.mock('child_process', async (orig) => ({
  ...(await orig() as any),
  spawn: (...args: any[]) => mockSpawn(...args),
}));

function makeFakeChild(): ChildProcess {
  const ee = new EventEmitter() as any;
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  ee.kill = vi.fn(() => { setImmediate(() => ee.emit('exit', 0)); return true; });
  ee.pid = 4242;
  return ee;
}

/** fetch that starts refusing, then answers /health ok after delayMs. */
function healthAfter(delayMs: number): ReturnType<typeof vi.fn> {
  const start = Date.now();
  return vi.fn(async (url: string) => {
    if (Date.now() - start < delayMs) throw new Error('ECONNREFUSED');
    if (String(url).endsWith('/health')) {
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) } as any;
    }
    return { ok: true, status: 200, json: async () => ({}) } as any;
  });
}

function makeSupervisor(fetchImpl: any, extra: Record<string, any> = {}) {
  return new EngineSupervisor({
    binaryPath: 'C:/fake/llama-server.exe',
    port: 9999,
    cacheDir: 'C:/fake/cache',
    contextSize: 32768,
    fetchImpl,
    readyDeadlineMs: 2_000,
    readyPollMs: 10,
    idleMs: 10 * 60_000,
    idleCheckMs: 60_000,
    ...extra,
  });
}

let sup: EngineSupervisor;
beforeEach(() => { mockSpawn.mockReset(); });
afterEach(async () => { await sup?.stop(); });

describe('EngineSupervisor', () => {
  it('ensureRunning spawns router-mode llama-server (no -m) with the pinned flag set and LLAMA_CACHE', async () => {
    mockSpawn.mockReturnValue(makeFakeChild());
    sup = makeSupervisor(healthAfter(20));
    const base = await sup.ensureRunning();
    expect(base).toBe('http://127.0.0.1:9999/v1');
    expect(sup.status()).toBe('running');
    const [bin, args, opts] = mockSpawn.mock.calls[0];
    expect(bin).toBe('C:/fake/llama-server.exe');
    expect(args).toEqual([
      '--host', '127.0.0.1', '--port', '9999',
      '--no-webui', '--jinja',
      '--models-max', '2',
      '-c', '32768',
    ]);
    expect(args).not.toContain('-m'); // router mode = no model arg
    expect(opts.env.LLAMA_CACHE).toBe('C:/fake/cache');
  });

  it('ensureRunning is single-flight: two concurrent calls spawn once', async () => {
    mockSpawn.mockReturnValue(makeFakeChild());
    sup = makeSupervisor(healthAfter(30));
    const [a, b] = await Promise.all([sup.ensureRunning(), sup.ensureRunning()]);
    expect(a).toBe(b);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('rejects with a plain-language error when /health never comes up, and kills the child', async () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    sup = makeSupervisor(vi.fn(async () => { throw new Error('ECONNREFUSED'); }), { readyDeadlineMs: 100 });
    await expect(sup.ensureRunning()).rejects.toThrow(/did not start/i);
    expect(child.kill).toHaveBeenCalled();
    expect(sup.status()).toBe('stopped');
  });

  it('rejects when the child exits during startup', async () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    sup = makeSupervisor(vi.fn(async () => { throw new Error('ECONNREFUSED'); }), { readyDeadlineMs: 5_000 });
    const p = sup.ensureRunning();
    setImmediate(() => child.emit('exit', 1));
    await expect(p).rejects.toThrow(/exited/i);
    expect(sup.status()).toBe('stopped');
  });

  it('emits "crashed" on unexpected exit; the NEXT ensureRunning respawns', async () => {
    const first = makeFakeChild();
    const second = makeFakeChild();
    mockSpawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
    sup = makeSupervisor(healthAfter(0));
    await sup.ensureRunning();
    const crashSpy = vi.fn();
    sup.on('crashed', crashSpy);
    first.emit('exit', 137);
    expect(crashSpy).toHaveBeenCalledWith({ exitCode: 137 });
    expect(sup.status()).toBe('stopped');
    await sup.ensureRunning();
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('strikes out after 3 crashes in 5 minutes: ensureRunning refuses until resetStrikes()', async () => {
    mockSpawn.mockImplementation(() => makeFakeChild());
    sup = makeSupervisor(healthAfter(0));
    for (let i = 0; i < 3; i++) {
      await sup.ensureRunning();
      (mockSpawn.mock.results[mockSpawn.mock.calls.length - 1].value as any).emit('exit', 1);
    }
    expect(sup.status()).toBe('error');
    await expect(sup.ensureRunning()).rejects.toThrow(/keeps crashing/i);
    sup.resetStrikes();
    await sup.ensureRunning();
    expect(sup.status()).toBe('running');
  });

  it('idle shutdown: stops after idleMs with no requests, but NEVER mid-stream', async () => {
    vi.useFakeTimers();
    try {
      mockSpawn.mockImplementation(() => makeFakeChild());
      // trackedFetch target returns a body stream we can hold open.
      let releaseStream!: () => void;
      const held = new Promise<void>((r) => { releaseStream = r; });
      const fetchImpl = vi.fn(async (url: string) => {
        if (String(url).endsWith('/health')) return { ok: true, status: 200 } as any;
        const body = new ReadableStream<Uint8Array>({
          async pull(c) { await held; c.enqueue(new TextEncoder().encode('x')); c.close(); },
        });
        return new Response(body, { status: 200 });
      });
      sup = makeSupervisor(fetchImpl, { idleMs: 1_000, idleCheckMs: 100, readyPollMs: 1 });
      await sup.ensureRunning();

      // A tracked request with an UNREAD body holds the engine open past idleMs.
      const res = await sup.trackedFetch('http://127.0.0.1:9999/v1/chat/completions', {});
      await vi.advanceTimersByTimeAsync(3_000);
      expect(sup.status()).toBe('running');

      // Finish the stream → inFlight drops to 0 → idle clock runs down → stop.
      releaseStream();
      await res.body!.getReader().read(); // drain
      await vi.advanceTimersByTimeAsync(3_000);
      expect(sup.status()).toBe('stopped');
    } finally {
      vi.useRealTimers();
    }
  });

  it('listModels: GET /models when running; cache scan shape when stopped', async () => {
    mockSpawn.mockReturnValue(makeFakeChild());
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith('/health')) return { ok: true, status: 200 } as any;
      if (String(url).endsWith('/models')) {
        // Defensive-parse target; exact upstream shape pinned by probe-models.mjs.
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'foo-Q4_K_M', status: 'loaded' }] }) } as any;
      }
      return { ok: false, status: 404 } as any;
    });
    sup = makeSupervisor(fetchImpl);
    await sup.ensureRunning();
    const models = await sup.listModels();
    expect(models).toEqual([{ id: 'foo-Q4_K_M', sizeBytes: null, loaded: true }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engine-supervisor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `desktop/src/main/engine/engine-supervisor.ts`**

```ts
// EngineSupervisor — llama-server lifecycle (spec §3.2, ADR 007). Direct heir
// of the archived feat/opencode-mvp OpenCodeService supervision pattern.
//
// Router mode: spawned WITHOUT -m; the server auto-discovers GGUFs in
// LLAMA_CACHE, hot-loads on first request, LRU-evicts (--models-max), and
// isolates each model in its own child process. We only ever talk HTTP to it.
//
// Idle shutdown: the AI SDK is handed trackedFetch, so every chat request
// passes through here — each call bumps lastActivity and holds an inFlight
// count until its response BODY is fully read (streams count as active for
// their whole duration; a 10-minute generation must not be killed mid-stream).
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type { EngineModel, EngineRunState } from '../../shared/engine-types';
import { scanGgufCache } from './cache-scan';

export interface EngineSupervisorOpts {
  binaryPath: string;
  port: number;
  cacheDir: string;          // exported to the child as LLAMA_CACHE
  contextSize: number;       // -c; inherited by every model instance the router spawns
  env?: NodeJS.ProcessEnv;   // test override
  fetchImpl?: typeof fetch;  // test override
  readyDeadlineMs?: number;  // default 30_000 — first Vulkan init can be slow
  readyPollMs?: number;      // default 250
  idleMs?: number;           // default 10 min (spec §3.2)
  idleCheckMs?: number;      // default 60s
}

// Keep at most 2 models resident: the router's LRU default (4) can overcommit
// RAM on consumer machines (two 8GB models already hurt); 2 still makes
// switching between a chat and a utility model free. Recorded in
// docs/engine-dependencies.md.
const MODELS_MAX = 2;
// Crash strike-out (spec §3.2): 3 crashes within 5 minutes → error state,
// stop retrying until the user acts (EngineCard's Restart button).
const STRIKE_LIMIT = 3;
const STRIKE_WINDOW_MS = 5 * 60_000;

export class EngineSupervisor extends EventEmitter {
  private child: ChildProcess | null = null;
  private state: EngineRunState = 'stopped';
  private startPromise: Promise<string> | null = null; // single-flight ensureRunning
  private crashTimes: number[] = [];
  private inFlight = 0;
  private lastActivity = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;
  private intentionalShutdown = false;

  constructor(private readonly opts: EngineSupervisorOpts) { super(); }

  status(): EngineRunState { return this.state; }

  /** OpenAI-compatible base URL (…/v1) while running, else null. The /v1
   *  suffix is deliberate: createOpenAICompatible appends /chat/completions,
   *  and llama-server serves both /v1/models and /v1/chat/completions there. */
  baseUrl(): string | null {
    return this.state === 'running' ? `http://127.0.0.1:${this.opts.port}/v1` : null;
  }

  /** Root URL for llama-server management endpoints (/health, /models). */
  private rootUrl(): string { return `http://127.0.0.1:${this.opts.port}`; }

  resetStrikes(): void {
    this.crashTimes = [];
    if (this.state === 'error') this.state = 'stopped';
    this.emit('status-changed');
  }

  /** Start if needed; resolve with the OpenAI-compatible base URL. Single-
   *  flight: concurrent callers share one spawn. Throws plain language — the
   *  messages surface in the chat error banner via the registry. */
  ensureRunning(): Promise<string> {
    if (this.state === 'running') {
      this.touch();
      return Promise.resolve(this.baseUrl()!);
    }
    if (this.state === 'error') {
      return Promise.reject(new Error(
        'The local engine keeps crashing — open Settings → Providers and press "Restart engine".'
      ));
    }
    if (!this.startPromise) {
      this.startPromise = this.start().finally(() => { this.startPromise = null; });
    }
    return this.startPromise;
  }

  private async start(): Promise<string> {
    this.intentionalShutdown = false;
    this.state = 'starting';
    this.emit('status-changed');
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const readyDeadlineMs = this.opts.readyDeadlineMs ?? 30_000;
    const readyPollMs = this.opts.readyPollMs ?? 250;

    const child = spawn(
      this.opts.binaryPath,
      [
        '--host', '127.0.0.1', '--port', String(this.opts.port),
        '--no-webui',
        // --jinja from day one: Phase 2 tool calling requires it, and keeping
        // the spawn shape constant means Phase 2 changes no process contract.
        '--jinja',
        '--models-max', String(MODELS_MAX),
        '-c', String(this.opts.contextSize),
      ],
      {
        env: { ...process.env, ...(this.opts.env ?? {}), LLAMA_CACHE: this.opts.cacheDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    this.child = child;

    let exitedDuringStartup = false;
    const startupExitListener = () => { exitedDuringStartup = true; };
    child.once('exit', startupExitListener);

    const deadline = Date.now() + readyDeadlineMs;
    while (Date.now() < deadline && !exitedDuringStartup) {
      try {
        const res = await fetchImpl(`${this.rootUrl()}/health`, { method: 'GET' });
        if (res.ok) {
          this.state = 'running';
          this.touch();
          child.off('exit', startupExitListener);
          child.on('exit', (code) => this.onExit(code));
          this.armIdleTimer();
          this.emit('status-changed');
          return this.baseUrl()!;
        }
      } catch { /* not reachable yet — keep polling */ }
      await new Promise((r) => setTimeout(r, readyPollMs));
    }

    child.kill();
    this.child = null;
    this.state = 'stopped';
    this.emit('status-changed');
    if (exitedDuringStartup) {
      throw new Error('The local engine exited while starting up — its build may not run on this machine.');
    }
    throw new Error(`The local engine did not start within ${Math.round(readyDeadlineMs / 1000)} seconds.`);
  }

  private onExit(code: number | null): void {
    const wasRunning = this.state === 'running';
    this.child = null;
    this.disarmIdleTimer();
    if (this.intentionalShutdown) { this.state = 'stopped'; this.emit('status-changed'); return; }
    if (!wasRunning) return;
    const now = Date.now();
    this.crashTimes = this.crashTimes.filter((t) => now - t < STRIKE_WINDOW_MS);
    this.crashTimes.push(now);
    // Strike-out guards against a crash-respawn loop (bad build, broken GGUF):
    // past the limit the state is 'error' and ensureRunning refuses until the
    // user presses Restart. Below the limit, restart is LAZY — the next send's
    // ensureRunning respawns (no eager respawn: nothing may need the engine).
    this.state = this.crashTimes.length >= STRIKE_LIMIT ? 'error' : 'stopped';
    this.emit('status-changed');
    this.emit('crashed', { exitCode: code });
  }

  async stop(): Promise<void> {
    this.disarmIdleTimer();
    if (!this.child) {
      if (this.state !== 'error') this.state = 'stopped';
      return;
    }
    this.intentionalShutdown = true;
    const child = this.child;
    child.kill();
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      setTimeout(resolve, 2_000); // best-effort — don't hang app quit
    });
    this.child = null;
    this.state = 'stopped';
    this.emit('status-changed');
  }

  // ---- idle accounting -------------------------------------------------

  private touch(): void { this.lastActivity = Date.now(); }

  private armIdleTimer(): void {
    this.disarmIdleTimer();
    const idleMs = this.opts.idleMs ?? 10 * 60_000;
    const checkMs = this.opts.idleCheckMs ?? 60_000;
    this.idleTimer = setInterval(() => {
      if (this.state !== 'running') return;
      if (this.inFlight > 0) return; // a stream is still being read — never stop mid-turn
      if (Date.now() - this.lastActivity < idleMs) return;
      // Idle shutdown is transparent: the next send's ensureRunning restarts
      // the engine (first token just arrives slower) — spec §3.2.
      void this.stop();
    }, checkMs);
    this.idleTimer.unref?.();
  }

  private disarmIdleTimer(): void {
    if (this.idleTimer) { clearInterval(this.idleTimer); this.idleTimer = null; }
  }

  /** The fetch handed to createOpenAICompatible for the local provider. Holds
   *  inFlight until the response body is FULLY read (or errored/cancelled) and
   *  touches lastActivity per chunk, so idle shutdown can never cut a stream. */
  trackedFetch: typeof fetch = async (input: any, init?: any) => {
    this.touch();
    this.inFlight++;
    let res: Response;
    try {
      res = await (this.opts.fetchImpl ?? fetch)(input, init);
    } catch (e) {
      this.inFlight--; this.touch();
      throw e;
    }
    if (!res.body) { this.inFlight--; this.touch(); return res; }
    let released = false;
    const release = () => {
      if (!released) { released = true; this.inFlight--; this.touch(); }
    };
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const self = this;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { release(); controller.close(); return; }
          self.touch(); // streaming progress counts as activity
          controller.enqueue(value);
        } catch (e) {
          release();
          controller.error(e);
        }
      },
      cancel(reason) {
        release(); // interrupt/abort paths must not leak the inFlight hold
        return reader.cancel(reason);
      },
    });
    return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
  };

  // ---- model listing ----------------------------------------------------

  /** Running → GET /models (live status); stopped → cache scan (loaded:false).
   *  Upstream /models schema is a tracked coupling — parse DEFENSIVELY, and
   *  keep the exact observed shape pinned in test-engine/probe-models.mjs +
   *  docs/engine-dependencies.md. */
  async listModels(): Promise<EngineModel[]> {
    if (this.state !== 'running') return scanGgufCache(this.opts.cacheDir);
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(`${this.rootUrl()}/models`, { method: 'GET' });
      if (!res.ok) return scanGgufCache(this.opts.cacheDir);
      const payload: any = await res.json();
      const rows: any[] = Array.isArray(payload?.data) ? payload.data
        : Array.isArray(payload?.models) ? payload.models
        : Array.isArray(payload) ? payload : [];
      const out: EngineModel[] = [];
      for (const row of rows) {
        const id = typeof row?.id === 'string' ? row.id : typeof row?.name === 'string' ? row.name : null;
        if (!id) continue; // skip malformed
        out.push({
          id,
          sizeBytes: typeof row?.size === 'number' ? row.size : null,
          loaded: row?.status === 'loaded',
        });
      }
      return out;
    } catch {
      return scanGgufCache(this.opts.cacheDir); // engine died mid-call — degrade to scan
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/engine-supervisor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/engine-supervisor.ts tests/engine-supervisor.test.ts
git commit -m "feat(engine): EngineSupervisor — router-mode spawn, health poll, crash strike-out, idle stop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: EngineManager (composition root) + registry hook types

**Files:**
- Create: `desktop/src/main/engine/engine-manager.ts`
- Modify: `desktop/src/shared/provider-types.ts` (add `CatalogModel.local`)
- Test: `desktop/tests/engine-manager.test.ts`

- [ ] **Step 1: Add the Phase-0 `local` field to `CatalogModel`** in `desktop/src/shared/provider-types.ts` (inside the interface, after `pricing`):

```ts
  // Local-engine models only (Plan B/C). fit is Plan C's estimator; Plan B
  // fills sizeBytes/quant('unknown')/installed(true) from the cache scan.
  local?: { sizeBytes: number; quant: string; installed: boolean; fit?: 'fits' | 'tight' | 'too-large' };
```

- [ ] **Step 2: Write the failing test** — `desktop/tests/engine-manager.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NativeHome } from '../src/main/native-home';
import { EngineManager } from '../src/main/engine/engine-manager';
import { ENGINE_VERSION } from '../src/main/engine/engine-pin';

let root: string;
let userData: string;
let home: NativeHome;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-mgr-'));
  userData = path.join(root, 'userData');
  home = new NativeHome(root);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** Plant a fake usable install so status()/hook tests need no download. */
function plantInstall(backend = 'cpu') {
  const dir = path.join(userData, 'engine', `${ENGINE_VERSION}-${backend}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'llama-server.exe'), 'fake');
  fs.writeFileSync(path.join(dir, '.complete'),
    JSON.stringify({ version: ENGINE_VERSION, backend, binaryRelPath: 'llama-server.exe' }));
}

describe('EngineManager', () => {
  it('status(): not-installed before any install; installed afterwards', () => {
    const mgr = new EngineManager(home, userData, 9999);
    expect(mgr.status().state).toBe('not-installed');
    expect(mgr.status().installed).toBe(false);
    plantInstall();
    const s = mgr.status();
    expect(s.installed).toBe(true);
    expect(s.installedVersion).toBe(ENGINE_VERSION);
    expect(s.backend).toBe('cpu');
    expect(s.state).toBe('stopped');
    expect(s.pinnedVersion).toBe(ENGINE_VERSION);
  });

  it('registryHook(): installed() false → ensureRunning throws install guidance', async () => {
    const mgr = new EngineManager(home, userData, 9999);
    const hook = mgr.registryHook();
    expect(hook.installed()).toBe(false);
    await expect(hook.ensureRunning()).rejects.toThrow(/Settings/);
  });

  it('catalogModels(): cache-scan models become providerId "local" CatalogModel rows carrying the CONFIGURED context size', async () => {
    plantInstall();
    const cacheDir = path.join(root, 'gguf-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'tiny-Q4_K_M.gguf'), Buffer.alloc(4));
    await home.mutateJson('config.json', () => ({ v: 1, engine: { cacheDir, contextSize: 8192 } }));
    const mgr = new EngineManager(home, userData, 9999);
    const models = await mgr.catalogModels();
    expect(models).toEqual([{
      id: 'tiny-Q4_K_M',
      providerId: 'local',
      label: 'tiny-Q4_K_M',
      contextLength: 8192, // the -c we spawn with, NOT the model's trained max
      local: { sizeBytes: 4, quant: 'unknown', installed: true },
    }]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/engine-manager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Create `desktop/src/main/engine/engine-manager.ts`**

```ts
// EngineManager — the composition root ipc-handlers talks to. Owns one
// EngineAcquisition + (lazily) one EngineSupervisor, reads engine config from
// ~/.youcoded/config.json, and exposes:
//   - status()/install()/restart() for the engine:* IPC surface
//   - registryHook() — the LocalEngineHook ProviderRegistry's local-engine
//     branch calls (installed / ensureRunning / trackedFetch)
//   - catalogModels() — ModelCatalog's local source for the model picker
import { EventEmitter } from 'events';
import * as path from 'path';
import { NativeHome } from '../native-home';
import { EngineAcquisition, InstalledEngine } from './engine-acquisition';
import { EngineSupervisor } from './engine-supervisor';
import { ENGINE_VERSION, pickAsset, defaultBackend } from './engine-pin';
import { readEngineConfig, updateEngineConfig } from './engine-config';
import type {
  EngineBackend, EngineInstallProgress, EngineStatus,
} from '../../shared/engine-types';
import type { CatalogModel } from '../../shared/provider-types';

/** What ProviderRegistry's local-engine branch consumes (replaces Plan A's
 *  bare localBaseUrl callback). Defined here, imported by provider-registry. */
export interface LocalEngineHook {
  installed(): boolean;
  ensureRunning(): Promise<string>;   // OpenAI-compatible base URL (…/v1)
  fetchImpl(): typeof fetch;          // supervisor.trackedFetch — idle accounting sees every request
}

export class EngineManager extends EventEmitter {
  private acquisition: EngineAcquisition;
  private supervisor: EngineSupervisor | null = null;
  private supervisorBinary: string | null = null;
  private installing = false;

  constructor(
    private home: NativeHome,
    private userDataDir: string,
    private port: number,
    /** Test seams (spec §5: mocked subprocess + fetch). */
    private opts: { fetchImpl?: typeof fetch; supervisorOpts?: Record<string, unknown> } = {}
  ) {
    super();
    this.acquisition = new EngineAcquisition(path.join(userDataDir, 'engine'), opts.fetchImpl);
  }

  status(): EngineStatus {
    const cfg = readEngineConfig(this.home);
    const inst = this.acquisition.installed();
    const supState = this.supervisor?.status() ?? 'stopped';
    return {
      installed: inst !== null,
      installedVersion: inst?.version ?? null,
      pinnedVersion: ENGINE_VERSION,
      backend: inst?.backend ?? null,
      state: inst === null ? 'not-installed' : supState,
      errorMessage: supState === 'error'
        ? 'The engine crashed repeatedly and was stopped. Press "Restart engine" to try again.'
        : undefined,
      cacheDir: cfg.cacheDir,
      port: this.port,
    };
  }

  /** Install the pinned engine for this machine. Vulkan-first on win/linux
   *  with an automatic CPU fallback when the Vulkan build won't BOOT (spec
   *  §3.1) — the fallback is decided by a real verify-boot, not GPU sniffing,
   *  because "has a Vulkan driver that llama.cpp accepts" is only provable by
   *  running it. Progress rides the 'install-progress' event. */
  async install(): Promise<void> {
    if (this.installing) throw new Error('An engine install is already running.');
    this.installing = true;
    const onProgress = (p: EngineInstallProgress) => this.emit('install-progress', p);
    try {
      const cfg = readEngineConfig(this.home);
      const backend = cfg.backend ?? defaultBackend(process.platform);
      const asset = pickAsset(process.platform, process.arch, backend);
      if (!asset) {
        throw new Error(`Local models are not available for this platform yet (${process.platform}/${process.arch}).`);
      }
      const installed = await this.acquisition.install(asset, onProgress);
      try {
        await this.verifyBoot(installed);
      } catch (bootErr) {
        // Vulkan build won't start (no/old driver, headless box) → one CPU
        // retry on the platforms that have a CPU asset. cfg.backend is only
        // flipped AFTER the CPU build verifies, so a failed fallback leaves
        // config untouched.
        const cpuAsset = backend === 'vulkan' ? pickAsset(process.platform, process.arch, 'cpu') : null;
        if (!cpuAsset) throw bootErr;
        const cpuInstalled = await this.acquisition.install(cpuAsset, onProgress);
        await this.verifyBoot(cpuInstalled);
        await updateEngineConfig(this.home, { backend: 'cpu' });
      }
      this.emit('status-changed');
    } catch (e: any) {
      onProgress({ kind: 'error', message: e?.message ?? String(e) });
      this.emit('status-changed');
      throw e;
    } finally {
      this.installing = false;
    }
  }

  /** Boot the engine once and wait for /health — proves the build runs on
   *  this machine. The engine is LEFT RUNNING (the user installed it in order
   *  to use it; idle shutdown reaps it if not). */
  private async verifyBoot(installed: InstalledEngine): Promise<void> {
    await this.rebuildSupervisor(installed);
    await this.supervisor!.ensureRunning();
  }

  private async rebuildSupervisor(installed: InstalledEngine): Promise<void> {
    if (this.supervisor && this.supervisorBinary === installed.binaryPath) return;
    if (this.supervisor) await this.supervisor.stop();
    const cfg = readEngineConfig(this.home);
    this.supervisor = new EngineSupervisor({
      binaryPath: installed.binaryPath,
      port: this.port,
      cacheDir: cfg.cacheDir,
      contextSize: cfg.contextSize,
      fetchImpl: this.opts.fetchImpl,
      ...(this.opts.supervisorOpts ?? {}),
    });
    this.supervisorBinary = installed.binaryPath;
    // Fan out supervisor transitions so the EngineCard tracks crash/idle live.
    this.supervisor.on('status-changed', () => this.emit('status-changed'));
    this.supervisor.on('crashed', (info) => this.emit('crashed', info));
  }

  /** User-initiated recovery: clear the strike-out and boot fresh. */
  async restart(): Promise<void> {
    const inst = this.acquisition.installed();
    if (!inst) throw new Error('The local engine is not installed yet.');
    await this.rebuildSupervisor(inst);
    this.supervisor!.resetStrikes();
    await this.supervisor!.stop();
    await this.supervisor!.ensureRunning();
  }

  registryHook(): LocalEngineHook {
    return {
      installed: () => this.acquisition.installed() !== null,
      ensureRunning: async () => {
        const inst = this.acquisition.installed();
        if (!inst) {
          throw new Error('Local models need a one-time engine install — open Settings → Providers and press Install.');
        }
        await this.rebuildSupervisor(inst);
        return this.supervisor!.ensureRunning();
      },
      // Bound lazily: the supervisor may not exist yet when the registry is
      // constructed; by the time the AI SDK fetches, ensureRunning built it.
      fetchImpl: () => (input: any, init?: any) => {
        if (!this.supervisor) return (this.opts.fetchImpl ?? fetch)(input, init);
        return this.supervisor.trackedFetch(input, init);
      },
    };
  }

  /** Local rows for ModelCatalog.get(). contextLength is the CONFIGURED -c —
   *  the engine truncates there regardless of the model's trained max, and
   *  HarnessSession sizes its history window from this number. */
  async catalogModels(): Promise<CatalogModel[]> {
    if (this.acquisition.installed() === null) return [];
    const cfg = readEngineConfig(this.home);
    const inst = this.acquisition.installed()!;
    await this.rebuildSupervisor(inst);
    const models = await this.supervisor!.listModels();
    return models.map((m) => ({
      id: m.id,
      providerId: 'local',
      label: m.id,
      contextLength: cfg.contextSize,
      local: { sizeBytes: m.sizeBytes ?? 0, quant: 'unknown', installed: true },
    }));
  }

  /** App-quit teardown — registered next to nativeHost.destroyAll(). */
  async stopAll(): Promise<void> {
    if (this.supervisor) await this.supervisor.stop();
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/engine-manager.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/engine/engine-manager.ts src/shared/provider-types.ts tests/engine-manager.test.ts
git commit -m "feat(engine): EngineManager composition root + LocalEngineHook + CatalogModel.local

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Wire the hook into ProviderRegistry + local models into ModelCatalog

**Files:**
- Modify: `desktop/src/main/providers/provider-registry.ts`
- Modify: `desktop/src/main/providers/model-catalog.ts`
- Test: `desktop/tests/provider-registry.test.ts` (extend), `desktop/tests/model-catalog.test.ts` (extend)

- [ ] **Step 1: Write the failing tests.** Append to `desktop/tests/provider-registry.test.ts`:

```ts
import type { LocalEngineHook } from '../src/main/engine/engine-manager';

describe('local-engine hook (Plan B)', () => {
  function makeHook(overrides: Partial<LocalEngineHook> = {}): LocalEngineHook {
    return {
      installed: () => true,
      ensureRunning: async () => 'http://127.0.0.1:9999/v1',
      fetchImpl: () => fetch,
      ...overrides,
    };
  }

  it('list(): local provider ready tracks hook.installed()', async () => {
    const withEngine = new ProviderRegistry(new NativeHome(root), secrets, makeHook());
    await withEngine.init();
    expect((await withEngine.list()).find((p) => p.id === 'local')?.ready).toBe(true);

    const without = new ProviderRegistry(new NativeHome(root), secrets, makeHook({ installed: () => false }));
    expect((await without.list()).find((p) => p.id === 'local')?.ready).toBe(false);
  });

  it('languageModel(local): awaits ensureRunning before returning a handle', async () => {
    const ensure = vi.fn(async () => 'http://127.0.0.1:9999/v1');
    const reg = new ProviderRegistry(new NativeHome(root), secrets, makeHook({ ensureRunning: ensure }));
    await reg.init();
    await reg.languageModel({ providerId: 'local', modelId: 'tiny-Q4_K_M' });
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it('languageModel(local): surfaces the hook install-guidance error verbatim', async () => {
    const reg = new ProviderRegistry(new NativeHome(root), secrets, makeHook({
      ensureRunning: async () => { throw new Error('Local models need a one-time engine install — open Settings → Providers and press Install.'); },
    }));
    await reg.init();
    await expect(reg.languageModel({ providerId: 'local', modelId: 'x' }))
      .rejects.toThrow(/one-time engine install/);
  });

  it('languageModel(local): with NO hook, keeps Plan A behavior (not-available error)', async () => {
    const reg = new ProviderRegistry(new NativeHome(root), secrets);
    await reg.init();
    await expect(reg.languageModel({ providerId: 'local', modelId: 'x' }))
      .rejects.toThrow(/not available yet/);
  });
});
```

Append to `desktop/tests/model-catalog.test.ts` (its existing setup constructs `new ModelCatalog(dir, fetchMock)`):

```ts
describe('local models source (Plan B)', () => {
  it('get(): merges injected local models for an enabled local-engine provider', async () => {
    const localRows = [{ id: 'tiny-Q4_K_M', providerId: 'local', label: 'tiny-Q4_K_M', contextLength: 8192 }];
    const cat = new ModelCatalog(dir, fetchMock, { localModels: async () => localRows });
    const models = await cat.get([
      { id: 'local', type: 'local-engine', label: 'Local', enabled: true, builtIn: true, hasKey: false, ready: true } as any,
    ]);
    expect(models).toEqual(localRows);
  });

  it('get(): a throwing local source degrades to no local rows (never rejects)', async () => {
    const cat = new ModelCatalog(dir, fetchMock, { localModels: async () => { throw new Error('boom'); } });
    const models = await cat.get([
      { id: 'local', type: 'local-engine', label: 'Local', enabled: true, builtIn: true, hasKey: false, ready: true } as any,
    ]);
    expect(models).toEqual([]);
  });
});
```

- [ ] **Step 2: Run both to verify they fail**

Run: `npx vitest run tests/provider-registry.test.ts tests/model-catalog.test.ts`
Expected: FAIL (constructor signatures don't accept the new args yet).

- [ ] **Step 3: Modify `provider-registry.ts`.** Replace the constructor's third parameter and the two `local-engine` branches:

Constructor (line ~35):

```ts
import type { LocalEngineHook } from '../engine/engine-manager';
// …
  constructor(private home: NativeHome, private secrets: SecretsStore,
              /** Plan B injects the EngineManager hook; null keeps the Plan A
               *  "coming in a later update" behavior (also what unit tests
               *  without an engine use). */
              private localEngine: LocalEngineHook | null = null) {}
```

`list()` readiness (the `ready` computation):

```ts
      const ready =
        p.enabled &&
        (p.type === 'local-engine'
          ? (this.localEngine?.installed() ?? false) // ready = engine installed (running is lazy)
          : keyless || hasKey);
```

`languageModel()` `local-engine` case:

```ts
      case 'local-engine': {
        if (!this.localEngine) {
          throw new Error('Local models are not available yet — the local engine ships in a later update.');
        }
        // ensureRunning boots the engine on demand (idle-stopped or first use)
        // and its trackedFetch keeps the idle timer honest for every request.
        const base = await this.localEngine.ensureRunning();
        return createOpenAICompatible({
          name: 'local',
          baseURL: base,
          fetch: this.localEngine.fetchImpl(),
        })(binding.modelId);
      }
```

`testConnection()` `local-engine` case:

```ts
        case 'local-engine': {
          if (!this.localEngine?.installed()) {
            return { ok: false, message: 'The local engine is not installed yet.' };
          }
          // Boots the engine if needed — a connection test SHOULD prove the
          // whole path, and idle shutdown reaps it afterwards.
          const base = await this.localEngine.ensureRunning();
          res = await fetch(`${stripSlash(base)}/models`, { signal });
          break;
        }
```

(The `ensureRunning` throw is caught by `testConnection`'s existing outer try/catch → `{ok:false, message}` — the never-throws contract holds.)

- [ ] **Step 4: Modify `model-catalog.ts`.** Extend the constructor opts and the `get()` loop:

```ts
  constructor(cacheDir: string, private fetchImpl: FetchLike = fetch as any,
              opts?: { ttlMs?: number; localModels?: () => Promise<CatalogModel[]> }) {
    this.cachePath = path.join(cacheDir, CACHE_FILE);
    this.ttlMs = opts?.ttlMs ?? TTL_MS;
    this.localModels = opts?.localModels ?? null;
  }
  private readonly localModels: (() => Promise<CatalogModel[]>) | null;
```

In `get()`, replace the trailing comment branch:

```ts
      } else if (p.type === 'local-engine' && this.localModels) {
        // Plan B: rows come from the engine manager (GET /models when the
        // engine runs, cache scan when stopped). Failure degrades to "no
        // local rows" — get() keeps its never-throws contract.
        try { out.push(...await this.localModels()); } catch { /* engine unavailable */ }
      }
      // openai-compatible custom endpoints still have no catalog (user types a model id).
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/provider-registry.test.ts tests/model-catalog.test.ts`
Expected: PASS (including all pre-existing cases — Plan A behavior with no hook is pinned by the new no-hook test).

- [ ] **Step 6: Commit**

```bash
git add src/main/providers/provider-registry.ts src/main/providers/model-catalog.ts tests/provider-registry.test.ts tests/model-catalog.test.ts
git commit -m "feat(engine): wire LocalEngineHook into ProviderRegistry + local rows into ModelCatalog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: IPC surface (handlers, preload, remote-shim, remote-server, Android stub, parity test)

**Files:**
- Modify: `desktop/src/main/ipc-handlers.ts` (~lines 1776-1838 + quit hook at ~2901)
- Modify: `desktop/src/main/preload.ts` (engine namespace)
- Modify: `desktop/src/renderer/remote-shim.ts` (engine namespace + push dispatch)
- Modify: `desktop/src/main/remote-server.ts` (case rows + push broadcast)
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (stub case)
- Test: `desktop/tests/ipc-channels.test.ts`

- [ ] **Step 1: Write the failing parity test.** Append to `tests/ipc-channels.test.ts`, mirroring the existing `project:* channel parity` describe (lines ~494-525) — same file-read + assertion style:

```ts
describe('engine:* channel parity (Plan B)', () => {
  const channels = ['engine:status', 'engine:install', 'engine:restart'];
  const pushChannels = ['engine:install-progress', 'engine:status-changed'];

  it('preload exposes every engine channel', () => {
    for (const ch of [...channels, ...pushChannels]) expect(preloadSrc).toContain(`'${ch}'`);
  });
  it('remote-shim exposes every engine channel', () => {
    for (const ch of [...channels, ...pushChannels]) expect(shimSrc).toContain(`'${ch}'`);
  });
  it('ipc-handlers registers every request-response engine channel', () => {
    for (const ch of channels) expect(handlersSrc).toContain(ch);
  });
  it('SessionService.kt stubs every engine channel', () => {
    for (const ch of channels) expect(kotlinSrc).toContain(`"${ch}"`);
  });
});
```

(Use the same `preloadSrc`/`shimSrc`/`handlersSrc`/`kotlinSrc` file-read constants the existing describes use — they're defined at the top of the test file.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ipc-channels.test.ts`
Expected: FAIL — the new describe's assertions.

- [ ] **Step 3: Wire ipc-handlers.ts.** In the native-stack block (after `const modelCatalog = …`, line ~1786), replace the two constructions and add the manager:

```ts
  // Plan B: the local engine. EngineManager owns acquisition + supervision;
  // its hook makes the 'local' provider real and its listModels feeds the
  // model picker. ENGINE_PORT rides the shifted-port scheme so the dev
  // instance and the built app never fight over one llama-server.
  const engineManager = new EngineManager(nativeHome, app.getPath('userData'), ENGINE_PORT);
  const providerRegistry = new ProviderRegistry(nativeHome, secretsStore, engineManager.registryHook());
  void providerRegistry.init();
  const modelCatalog = new ModelCatalog(app.getPath('userData'), undefined, {
    localModels: () => engineManager.catalogModels(),
  });
```

Imports at the top of the file: `import { EngineManager } from './engine/engine-manager';` and `import { ENGINE_PORT } from '../shared/ports';`.

After the provider handlers (line ~1838), add:

```ts
  // --- Local engine IPC (Plan B) ---
  ipcMain.handle(IPC.ENGINE_STATUS, async () => engineManager.status());
  ipcMain.handle(IPC.ENGINE_INSTALL, async () => { await engineManager.install(); return engineManager.status(); });
  ipcMain.handle(IPC.ENGINE_RESTART, async () => { await engineManager.restart(); return engineManager.status(); });
  // Push: install progress + run-state transitions → every window + remotes.
  engineManager.on('install-progress', (p) => {
    send(IPC.ENGINE_INSTALL_PROGRESS, p);
    remoteServer?.broadcast({ type: 'engine:install-progress', payload: p });
  });
  engineManager.on('status-changed', () => {
    const s = engineManager.status();
    send(IPC.ENGINE_STATUS_CHANGED, s);
    remoteServer?.broadcast({ type: 'engine:status-changed', payload: s });
  });
```

Extend the `setNativeRuntime` call (line ~1805) with `engineManager`, and next to `void nativeHost.destroyAll().catch(() => {})` (~2901) add:

```ts
    void engineManager.stopAll().catch(() => {}); // never leave an orphaned llama-server on quit
```

- [ ] **Step 4: preload.ts.** After the `providers:` namespace (line ~997):

```ts
  // Local llama.cpp engine (Plan B). Progress/status pushes return an
  // unsubscribe, matching every other on* subscription in this file.
  engine: {
    status: (): Promise<unknown> => ipcRenderer.invoke(IPC.ENGINE_STATUS),
    install: (): Promise<unknown> => ipcRenderer.invoke(IPC.ENGINE_INSTALL),
    restart: (): Promise<unknown> => ipcRenderer.invoke(IPC.ENGINE_RESTART),
    onInstallProgress: (cb: (p: unknown) => void) => {
      const listener = (_e: unknown, p: unknown) => cb(p);
      ipcRenderer.on(IPC.ENGINE_INSTALL_PROGRESS, listener);
      return () => ipcRenderer.removeListener(IPC.ENGINE_INSTALL_PROGRESS, listener);
    },
    onStatusChanged: (cb: (s: unknown) => void) => {
      const listener = (_e: unknown, s: unknown) => cb(s);
      ipcRenderer.on(IPC.ENGINE_STATUS_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.ENGINE_STATUS_CHANGED, listener);
    },
  },
```

- [ ] **Step 5: remote-shim.ts.** After the `providers` namespace (line ~1366), add the mirror (WS push events dispatch by channel name — register the two push channels the same way `dev:install-progress` is handled at ~270/1188):

```ts
    engine: {
      status: () => invoke('engine:status'),
      install: () => invoke('engine:install'),
      restart: () => invoke('engine:restart'),
      onInstallProgress: (cb: (p: unknown) => void) => subscribePush('engine:install-progress', cb),
      onStatusChanged: (cb: (s: unknown) => void) => subscribePush('engine:status-changed', cb),
    },
```

(If the shim has no generic `subscribePush` helper, replicate the exact listener-map pattern `dev.onInstallProgress` uses — a channel-keyed callback set fed by the WS message dispatcher.)

- [ ] **Step 6: remote-server.ts.** In `setNativeRuntime` (line 86), widen the type to include `engineManager: EngineManager`. Add case rows next to the `provider:*` cases (~640), following the try/catch-respond pattern:

```ts
      case 'engine:status': {
        this.respond(client.ws, type, id, this.nativeRuntime ? this.nativeRuntime.engineManager.status() : null);
        break;
      }
      case 'engine:install': {
        try {
          if (this.nativeRuntime) await this.nativeRuntime.engineManager.install();
          this.respond(client.ws, type, id, this.nativeRuntime?.engineManager.status() ?? null);
        } catch (err: any) {
          this.respond(client.ws, type, id, { ok: false, error: err?.message ?? String(err) });
        }
        break;
      }
      case 'engine:restart': {
        try {
          if (this.nativeRuntime) await this.nativeRuntime.engineManager.restart();
          this.respond(client.ws, type, id, this.nativeRuntime?.engineManager.status() ?? null);
        } catch (err: any) {
          this.respond(client.ws, type, id, { ok: false, error: err?.message ?? String(err) });
        }
        break;
      }
```

- [ ] **Step 7: SessionService.kt.** Add `"engine:status", "engine:install", "engine:restart"` to the existing combined not-implemented-on-mobile `when` case (the one carrying Plan A's `native:*`/`provider:*` channels).

- [ ] **Step 8: Run the parity test + full suite**

Run: `npx vitest run tests/ipc-channels.test.ts` → PASS.
Run: `npm test -- --run` → all green.

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/preload.ts src/renderer/remote-shim.ts src/main/remote-server.ts ../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt tests/ipc-channels.test.ts
git commit -m "feat(engine): engine:* IPC surface across all four parity files + Android stub

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: EngineCard in Settings → Providers

Minimal Plan B UI: status line, Install with live progress, Restart on error. Plan C relocates this component into the full Local Models panel — build it as a standalone component so the move is an import change.

**Files:**
- Create: `desktop/src/renderer/components/EngineCard.tsx`
- Modify: `desktop/src/renderer/components/ProvidersSection.tsx`

- [ ] **Step 1: Create `desktop/src/renderer/components/EngineCard.tsx`**

```tsx
// Local engine install/status card (Plan B). Lives under the 'local' provider
// row in ProvidersSection; Plan C moves it into the Local Models panel.
// Status language is plain words — never status glyphs (standing UX rule).
import React, { useEffect, useState } from 'react';

interface EngineStatusView {
  installed: boolean;
  installedVersion: string | null;
  pinnedVersion: string;
  backend: string | null;
  state: 'not-installed' | 'stopped' | 'starting' | 'running' | 'error';
  errorMessage?: string;
  cacheDir: string;
}

type Progress =
  | { kind: 'download'; receivedBytes: number; totalBytes: number | null }
  | { kind: 'verify' } | { kind: 'unpack' }
  | { kind: 'done' } | { kind: 'error'; message: string };

const mb = (n: number) => `${Math.round(n / 1048576)} MB`;

export default function EngineCard() {
  const [status, setStatus] = useState<EngineStatusView | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void window.claude.engine.status().then((s: any) => { if (alive) setStatus(s); });
    const offP = window.claude.engine.onInstallProgress((p: any) => setProgress(p));
    const offS = window.claude.engine.onStatusChanged((s: any) => setStatus(s));
    return () => { alive = false; offP(); offS(); };
  }, []);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setError(null);
    try { setStatus(await fn()); }
    catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); setProgress(null); }
  };

  if (!status) return null;

  const stateLabel =
    status.state === 'not-installed' ? 'Not installed'
    : status.state === 'running' ? `Running · ${status.installedVersion} · ${status.backend}`
    : status.state === 'starting' ? 'Starting…'
    : status.state === 'error' ? (status.errorMessage ?? 'Stopped after repeated crashes')
    : `Installed ${status.installedVersion} · ${status.backend} · stopped (starts on first message)`;

  return (
    <div className="mt-2 rounded-lg border border-edge-dim bg-well p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-fg">Local engine (llama.cpp)</div>
          <div className="text-fg-dim">{stateLabel}</div>
        </div>
        {status.state === 'not-installed' && (
          <button
            className="rounded-md bg-accent px-3 py-1.5 text-on-accent disabled:opacity-50"
            disabled={busy}
            onClick={() => run(() => window.claude.engine.install())}
          >
            {busy ? 'Installing…' : 'Install'}
          </button>
        )}
        {status.state === 'error' && (
          <button
            className="rounded-md bg-accent px-3 py-1.5 text-on-accent disabled:opacity-50"
            disabled={busy}
            onClick={() => run(() => window.claude.engine.restart())}
          >
            Restart engine
          </button>
        )}
      </div>
      {busy && progress?.kind === 'download' && (
        <div className="mt-2 text-fg-dim">
          Downloading… {mb(progress.receivedBytes)}{progress.totalBytes ? ` of ${mb(progress.totalBytes)}` : ''}
        </div>
      )}
      {busy && (progress?.kind === 'verify' || progress?.kind === 'unpack') && (
        <div className="mt-2 text-fg-dim">{progress.kind === 'verify' ? 'Verifying download…' : 'Unpacking…'}</div>
      )}
      {error && <div className="mt-2 text-red-500">{error}</div>}
    </div>
  );
}
```

(Match the surrounding ProvidersSection styling idioms when integrating — reuse its button/border classes if they differ from the above.)

- [ ] **Step 2: Render it in `ProvidersSection.tsx`** — find the provider-row render loop; under the row whose `p.id === 'local'`, render `<EngineCard />`. Import at the top. Also update the local row's status text: with the hook wired, `ready` is now true once installed (no code change needed here if the row already derives from `ready`; verify the "coming with the local engine" copy, if hardcoded, is replaced by the ready-derived label).

- [ ] **Step 3: Typecheck + manual render check**

Run: `npm run build` (tsc + vite must pass).
Then `YOUCODED_NATIVE=1 bash ../../scripts/run-dev.sh` (from the worktree root — see repo run-dev caveats) → Settings → Providers shows the engine card with "Not installed" + Install.

If the renderer `window.claude` type surface is declared (e.g. in `hooks/useIpc.ts` or a global .d.ts), add the `engine` namespace there in the same commit — `npm run build` will tell you.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/EngineCard.tsx src/renderer/components/ProvidersSection.tsx
git commit -m "feat(engine): EngineCard — install/status/restart UI under the local provider row

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: `test-engine/` probes + engine-dependencies.md population

The empirical layer (spec §3.3): every llama.cpp behavior we depend on gets a probe run against the REAL pinned binary and an entry naming the consuming file. These are dev-run (not CI) — the `test-conpty/` discipline.

**Files:**
- Create: `desktop/test-engine/README.md`
- Create: `desktop/test-engine/probe-health.mjs`
- Create: `desktop/test-engine/probe-models.mjs`
- Create: `desktop/test-engine/probe-chat.mjs`
- Create: `desktop/test-engine/.gitignore` (ignore downloaded GGUFs/binaries: `cache/`, `engine/`)
- Modify: `youcoded/docs/engine-dependencies.md`

- [ ] **Step 1: Create `desktop/test-engine/README.md`**

```markdown
# test-engine — llama.cpp smoke probes

Dev-run probes against the REAL pinned llama-server binary (never CI). Run all
three on every engine pin bump and record outcomes in
`../../docs/engine-dependencies.md` — the same discipline as `test-conpty/`
on a Claude Code bump.

## Setup (once)

1. Install the engine through the app (Settings → Providers → Install), or
   point `--binary` at any local llama-server of the pinned version.
2. Drop a small GGUF into `test-engine/cache/` (any single-file model works;
   ~0.5 GB keeps runs fast), e.g. download `Qwen3-0.6B-Q4_K_M.gguf` from
   `unsloth/Qwen3-0.6B-GGUF` on Hugging Face into that folder.

## Probes

- `node probe-health.mjs --binary <path>` — spawn shape: router mode boots
  with our exact flag set; `/health` returns `{"status":"ok"}`.
- `node probe-models.mjs --binary <path>` — GET `/models` schema; asserts the
  router's model ids match `cache-scan.ts` derivation for the same directory.
  PRINTS both lists — on mismatch, fix `ggufIdFromFileName` and this probe
  together, and update engine-dependencies.md.
- `node probe-chat.mjs --binary <path>` — streamed `/v1/chat/completions`
  round-trip: auto-load on first request, delta frames, final usage/timings.

Each probe exits 0 on pass and prints the raw JSON it saw (that output is what
goes into engine-dependencies.md entries).
```

- [ ] **Step 2: Create `desktop/test-engine/probe-health.mjs`**

```js
#!/usr/bin/env node
// Probe: router-mode spawn + /health readiness (engine-supervisor coupling).
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const argv = process.argv.slice(2);
const binary = argv[argv.indexOf('--binary') + 1];
if (!binary) { console.error('usage: probe-health.mjs --binary <llama-server>'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9971;

const child = spawn(binary, [
  '--host', '127.0.0.1', '--port', String(PORT),
  '--no-webui', '--jinja', '--models-max', '2', '-c', '4096',
], { env: { ...process.env, LLAMA_CACHE: path.join(here, 'cache') }, stdio: ['ignore', 'inherit', 'inherit'] });

const deadline = Date.now() + 30_000;
let ok = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    if (res.ok) {
      console.log('HEALTH:', res.status, JSON.stringify(await res.json()));
      ok = true;
      break;
    }
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}
child.kill();
if (!ok) { console.error('FAIL: /health never became ready'); process.exit(1); }
console.log('PASS: router mode boots with our flag set and reports healthy');
```

- [ ] **Step 3: Create `desktop/test-engine/probe-models.mjs`**

```js
#!/usr/bin/env node
// Probe: GET /models schema + id parity with cache-scan.ts (the engine-off
// list MUST match the engine-on list — model-catalog/engine-manager coupling).
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const argv = process.argv.slice(2);
const binary = argv[argv.indexOf('--binary') + 1];
if (!binary) { console.error('usage: probe-models.mjs --binary <llama-server>'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(here, 'cache');
const PORT = 9972;

// The compiled cache-scan (run `npm run build` first, or ts-node equivalent):
const require_ = createRequire(import.meta.url);
const { scanGgufCache } = require_('../dist/main/main/engine/cache-scan.js'); // adjust to the actual build output path

const child = spawn(binary, ['--host', '127.0.0.1', '--port', String(PORT), '--no-webui', '--jinja'],
  { env: { ...process.env, LLAMA_CACHE: cacheDir }, stdio: ['ignore', 'inherit', 'inherit'] });
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const raw = await (await fetch(`http://127.0.0.1:${PORT}/models`)).json();
console.log('RAW /models:', JSON.stringify(raw, null, 2));
child.kill();

const routerIds = (raw.data ?? raw.models ?? raw ?? []).map((m) => m.id ?? m.name).sort();
const scanIds = scanGgufCache(cacheDir).map((m) => m.id).sort();
console.log('router ids:', routerIds);
console.log('scan   ids:', scanIds);
if (JSON.stringify(routerIds) !== JSON.stringify(scanIds)) {
  console.error('FAIL: cache-scan id derivation does not match router discovery — fix ggufIdFromFileName + engine-dependencies.md');
  process.exit(1);
}
console.log('PASS: /models parsed; scan ids match router ids');
```

- [ ] **Step 4: Create `desktop/test-engine/probe-chat.mjs`**

```js
#!/usr/bin/env node
// Probe: streamed /v1/chat/completions with auto-load (harness-session +
// provider-registry coupling — the exact call path @ai-sdk/openai-compatible
// makes, minus the SDK).
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const argv = process.argv.slice(2);
const binary = argv[argv.indexOf('--binary') + 1];
if (!binary) { console.error('usage: probe-chat.mjs --binary <llama-server>'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(here, 'cache');
const PORT = 9973;

const gguf = fs.readdirSync(cacheDir).find((f) => f.endsWith('.gguf'));
if (!gguf) { console.error('FAIL: put a small .gguf in test-engine/cache/ first'); process.exit(1); }
const modelId = gguf.replace(/\.gguf$/i, '');

const child = spawn(binary, ['--host', '127.0.0.1', '--port', String(PORT), '--no-webui', '--jinja', '-c', '4096'],
  { env: { ...process.env, LLAMA_CACHE: cacheDir }, stdio: ['ignore', 'inherit', 'inherit'] });
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: modelId, // names an UNLOADED model — this request must auto-load it
    stream: true,
    messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
  }),
});
console.log('HTTP', res.status);
let text = '';
let sawUsage = false;
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') continue;
    const obj = JSON.parse(payload);
    text += obj.choices?.[0]?.delta?.content ?? '';
    if (obj.usage || obj.timings) { sawUsage = true; console.log('FINAL FRAME:', JSON.stringify(obj)); }
  }
}
child.kill();
if (res.status !== 200 || text.length === 0) { console.error('FAIL: no streamed content'); process.exit(1); }
console.log('PASS: auto-load + streamed completion. text =', JSON.stringify(text), 'usage/timings seen =', sawUsage);
```

- [ ] **Step 5: Run all three probes against the real pinned binary** (install via the app first, or download the asset manually).

Run: `node test-engine/probe-health.mjs --binary <path>` → PASS; same for `probe-models.mjs`, `probe-chat.mjs`.
**If probe-models fails on id parity: fix `ggufIdFromFileName` in `cache-scan.ts` to match observed router naming, re-run `tests/cache-scan.test.ts` (update its expectations), and note the observed convention in engine-dependencies.md.**

- [ ] **Step 6: Populate `youcoded/docs/engine-dependencies.md`.** Replace the skeleton's "Pinned version" and each touchpoint with what the probes actually showed. Required entries (each names its consuming file):

- Pinned version: `<tag>` + the date + "bump procedure: scripts/generate-engine-pin.mjs, re-run test-engine/, update this file".
- `llama-server` CLI flags: the exact spawn arg list (engine-supervisor.ts) + `--models-max 2` rationale.
- `/health` shape: observed status/body (engine-supervisor readiness poll).
- `/models` shape: paste the probe's RAW output skeleton; note the id convention and the scan-parity contract (engine-supervisor.listModels, cache-scan.ts, probe-models.mjs).
- `/v1/chat/completions`: streaming delta + final usage/timings frame shape (harness via @ai-sdk/openai-compatible; probe-chat.mjs).
- GGUF cache layout: LLAMA_CACHE env, flat `.gguf` discovery, multi-part `-00001-of-000NN` convention (cache-scan.ts, Plan C downloader).
- Release asset naming + GitHub digest field (engine-pin.ts, generate-engine-pin.mjs); archive-internal binary paths per family (engine-acquisition.ts).
- Inheritance note: model instances inherit router args (`-c`, env), auto-load on request (engine-manager catalogModels contextLength decision).

- [ ] **Step 7: Commit**

```bash
git add test-engine/ ../docs/engine-dependencies.md
git commit -m "test(engine): test-engine smoke probes + engine-dependencies.md population

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Live acceptance, docs, merge

- [ ] **Step 1: Full suite + build**

Run from `desktop/`: `npm test -- --run && npm run build`
Expected: all green.

- [ ] **Step 2: Live acceptance (spec §1 Plan B exit test)** — in the worktree:

1. `YOUCODED_NATIVE=1 bash scripts/run-dev.sh` (workspace `run-dev.sh` against the worktree — or the worktree's own run path; the env var must be in the shell).
2. Settings → Providers → Local engine card → Install; watch download progress → "Installed … stopped (starts on first message)".
3. Hand-place a small GGUF (the probe model) into the cache dir shown on the card.
4. New session → runtime "YouCoded" → model picker shows the local model under Local → send a message. First send boots the engine (slower first token), reply streams into chat, per-turn metadata strip shows tokens + tokens/sec.
5. **Disconnect the network entirely and send again** — reply still streams. That is the Plan B exit test.
6. ESC mid-generation → stream aborts, turn ends cleanly (no stuck isThinking).
7. Kill the llama-server process in Task Manager mid-idle → next send transparently reboots it. Kill it 3× within 5 minutes mid-run → card shows the crash-loop message; Restart engine recovers.
8. Shut the dev instance down when done.

- [ ] **Step 3: Workspace docs (youcoded-dev repo, committed there — not the app repo):**

- `docs/PITFALLS.md` → new "Local Engine (Plan B)" bullets under the Multi-Model section: engine pin discipline (bump = probes + engine-dependencies), `baseUrl()` returns `/v1`-suffixed, idle stop never fires with an unread stream (trackedFetch contract), cache-scan/router id parity is probe-pinned, `.complete`-marker-last install invariant, config.json backend flip only after CPU verify-boot.
- Roadmap spec (`docs/superpowers/specs/2026-07-09-platform-vision-roadmap.md`) Progress line: Plan B merged.

- [ ] **Step 4: Merge** — use superpowers:finishing-a-development-branch (PR to `youcoded` master, per-task spec+quality review already done). After merge lands: remove the worktree (delete the node_modules junction FIRST: `cmd //c "rmdir node_modules"` inside `desktop/`, then `git worktree remove`), delete the branch, close the dev server.

---

## Self-review notes (already applied)

- Spec §3.1 acquisition: download-on-first-use ✓ (Task 4 + card), SHA-256 vs pin ✓, `userData/engine/<version>/` ✓ (with `-<backend>` suffix — two backends can coexist during fallback), CUDA opt-in deferred to Plan C's backend picker (spec places the picker in §4.5), resume/clean-restart ✓, no half-unpacked usable dir ✓.
- Spec §3.2 supervisor: router flags ✓, shifted port ✓, health poll ✓, bounded crash-restart + strike-out ✓, idle shutdown + transparent restart ✓, `/models` enumeration ✓, registry transport ✓, tests mirror opencode-service.test ✓.
- Spec §3.3: engine-dependencies entries + probes ✓ (Task 11).
- Known simplification: `EngineManager.install()` runs verify-boot with the engine left running — spec-silent, chosen so "Install" ends in a provably working state.
