# Phase 0 Foundations — Design

**Date:** 2026-07-10
**Status:** Draft — pending Destin's review
**Parent:** `2026-07-09-platform-vision-roadmap.md` (approved). ADRs 006–010 record the settled decisions this spec builds on.
**Scope:** the native home layout, provider-layer interfaces, native session store, the `feat/opencode-mvp` salvage plan, and coupling-registry skeletons. Phase 0 ships **no user-visible behavior** — everything lands dormant behind a developer settings flag.

---

## 1. The native home: `~/.youcoded/`

Source of truth for YouCoded's ecosystem state (ADR 008). Same dotdir-in-home pattern as `~/.claude` — cross-platform (`%USERPROFILE%\.youcoded` on Windows), human-inspectable, and a clean sync/backup target.

```
~/.youcoded/
  config.json          # app-level native config (schema-versioned)
  providers.json       # provider entries (id, type, label, baseUrl, secretRef, enabled)
  mcp.json             # MCP server configs — SOURCE OF TRUTH (reconciler exports to CC)
  installed.json       # install lockfile: every marketplace-installed item
                       #   { items: [{ id, kind: 'skill'|'harness'|'agent', version,
                       #     source, installedAt, backends: 'any'|'claude-code' }] }
  skills/<id>/         # installed skill content (SKILL.md + assets)
  harnesses/<id>.json  # harness manifests (presets ship in-app; user/custom ones here)
  agents/<id>.json     # agent manifests (Phase 4)
  sessions/<cwd-slug>/<sessionId>.jsonl   # native session transcripts (§3)
  logs/                # engine + harness logs (rotated)
```

**Deliberately NOT in `~/.youcoded/`:**

- **Secrets (API keys).** Stored as `safeStorage`-encrypted blobs in Electron `userData` (`secrets.json` keyed by `secretRef`). Machine-bound by construction — OS-keychain-backed encryption doesn't survive a sync to another device, so putting ciphertext in a syncable home would only create confusing restore failures. `providers.json` carries only the `secretRef` pointer.
- **Engine binaries.** Per-machine, large, backend-variant-specific (CUDA vs Vulkan) → `userData/engine/<version>/`. Never synced.
- **GGUF models.** The standard llama.cpp cache (default location, overridable), so router-mode auto-discovery works and models are shared with any other llama.cpp tooling on the machine. Path recorded in `config.json`.

**Write discipline:** all writers go through one `NativeHome` module (TS; Kotlin mirror later) with the atomic-write + lock patterns from `cas-write.ts`. The CC export adapters (`ClaudeCodeRegistry`, mcp-reconciler — ADR 008) are *consumers* of this state, never co-owners.

**Migration note (Phase 3, not Phase 0):** existing marketplace installs under `~/.claude/plugins/marketplaces/youcoded/` migrate into `skills/` + `installed.json`; the CC export adapter keeps `~/.claude` registrations in place so CC sessions never notice.

## 2. Provider-layer interfaces

New directory `desktop/src/main/providers/`. TypeScript sketches — final signatures at implementation; the shapes are the contract.

```ts
// providers/types.ts
export type ProviderType =
  | 'local-engine'        // our supervised llama-server
  | 'openai-compatible'   // Ollama, LM Studio, custom endpoints
  | 'openrouter'
  | 'anthropic' | 'openai' | 'google';

export interface ProviderConfig {
  id: string;             // 'local', 'openrouter', user-created ids for custom endpoints
  type: ProviderType;
  label: string;
  baseUrl?: string;       // openai-compatible + overrides
  secretRef?: string;     // pointer into userData secrets store; absent for local
  enabled: boolean;
}

export interface ModelBinding { providerId: string; modelId: string; }

export interface CatalogModel {
  id: string; providerId: string; label: string;
  contextLength?: number; supportsTools?: boolean; supportsReasoning?: boolean;
  pricing?: { in: number; out: number };          // cloud
  local?: { sizeBytes: number; quant: string; installed: boolean; fit: 'fits'|'tight'|'too-large' };
}
```

```ts
// providers/provider-registry.ts — CRUD over providers.json + key mgmt + connection tests.
// The one factory the harness calls:
//   languageModel(binding: ModelBinding): LanguageModel   // AI SDK model handle
// Internally: createOpenAICompatible for local/ollama/lmstudio/openrouter (+ attribution
// headers for openrouter), first-party @ai-sdk/* for direct keys.

// providers/model-catalog.ts — merged, cached catalog:
//   models.dev api.json (cloud metadata) + OpenRouter /api/v1/models (pricing, tool filter)
//   + llama-server /models + local cache scan (installed GGUFs, fit estimate vs detected HW).

// engine/engine-supervisor.ts — llama-server lifecycle (ADR 007):
//   ensureRunning() / stop() / status() / baseUrl()
//   downloadModel(hfRef, quant, onProgress) / deleteModel(id) / installedModels()
//   'crashed' events; health-poll ready detection; port from the shifted-port scheme.
//   (Direct heir of the OpenCodeService supervision pattern + its tests.)

// harness/harness-session.ts — Phase 2 builds the loop; Phase 0 pins the seam:
//   start(opts: { sessionId, cwd, harness: HarnessManifest, binding: ModelBinding, resume?: boolean })
//   send(text) / interrupt() / destroy()
//   emits 'transcript-event' — the EXACT TranscriptEventType shapes from shared/types.ts.
```

```ts
// shared/harness-manifest.ts — the shareable unit (marketplace item kind 'harness'):
export interface HarnessManifest {
  schema: 1;
  id: string; name: string; description?: string;
  systemPrompt: string;
  tools: string[];                       // CC-compatible names (ADR 009)
  permissionPolicy: 'ask' | 'auto-edit' | 'full-auto'
    | Record<string, 'allow'|'ask'|'deny'>;
  defaultBinding?: ModelBinding;
  skills?: string[]; mcp?: string[];     // opt-in subsets; empty = none
  limits?: { maxSteps?: number; maxTokens?: number };
}
```

`SessionProvider` becomes `'claude' | 'gemini' | 'native'`. A native session = `provider: 'native'` + a `ModelBinding` + a `HarnessManifest` ref. **UI label for the native runtime: "YouCoded"** (runtime selector reads `Claude | YouCoded | Gemini`) — it's the app's own runtime, and "Local" would be wrong the moment an OpenRouter binding is selected. (Flagged for Destin's veto — cosmetic, easily changed.)

## 3. Native session store

`~/.youcoded/sessions/<cwd-slug>/<sessionId>.jsonl`:

- **Line 1 header:** `{ v: 1, sessionId, harnessId, binding, cwd, createdAt, title? }`
- **Lines 2+:** persisted `transcript-event` objects, exactly as emitted (same `TranscriptEventType` union, `uuid`-deduped).

Resume = read header, replay events into the reducer (the hydration path both existing adapters proved), then continue appending live. Title generation reuses the topic-file convention so the conversation index and Resume Browser integrate with a `provider` tag rather than a parallel store. The `<cwd-slug>` encoding reuses `canonicalize()` + the existing slug helper — not CC's own encoding — since this store is ours.

Storing reducer-ready events (rather than a vendor message format) means the store is backend-portable by construction: any future harness change replays cleanly as long as it emits the same protocol.

## 4. Salvage plan — `feat/opencode-mvp` → `feat/provider-seam`

Drift check (2026-07-10, merge-base `b8035469`, 2026-05-04): heavily drifted on master since the branch — `App.tsx`/`preload.ts`/`remote-shim.ts` (24 commits each); lightly drifted — `SessionStrip.tsx` (3), `SettingsPanel.tsx` (3), `chat-reducer.ts`/`chat-types.ts` (2), `ResumeBrowser.tsx` (2), `ModelPickerPopup.tsx` (1), `session-manager.ts` (1). **Therefore: no mechanical cherry-picks.** Re-apply from the branch diff as fresh commits, file-by-file, adapting to current master.

**Re-apply now (Phase 0 PR, dormant behind `settings → Development → "Native runtime (experimental)"`, default off):**

| Piece | Source commits | Adaptation |
|---|---|---|
| `SessionProvider` + `'native'`, IPC constant reservations | `88ad7f43` | rename `local:*` → `native:*` / `engine:*`; drop Ollama/OpenCode channels |
| Three-way runtime selector in SessionStrip | `fe98709b` | gate on the new flag + `window.claude.native.supported`; label "YouCoded" |
| Runtime-aware gating: HeaderBar chat-toggle/permission-badge, `useAttentionClassifier(provider)`, ChatView pass-through, ModelPickerPopup scoping | `338e6189` | provider check `!== 'claude'` where the branch said `=== 'local'` |
| Collapsible reasoning UI + reducer/chat-types reasoning state + BubbleFeed | `eb3ac2ea` (renderer/reducer parts) | keep; CC extended-thinking display benefits too; port the branch's `chat-reducer.test.ts` additions |
| `remote-shim.ts` `window.claude.native.*` no-op stubs + `preload.ts` parity | `65d72637` | re-derive against current files (heavy drift — write fresh, satisfy `ipc-channels.test.ts`) |

**Rebuild in Phase 1 (reference only, do not port):** `model-catalog.ts` (branch version is a hardcoded Ollama catalog; Phase 1 is models.dev-backed), `LocalSetupModal` (Phase 1 builds an engine/model setup flow instead), Settings "Local Models" section (`07435156` — becomes Providers + Local Engine panels), ResumeBrowser local tab (`a5e87e49` — needs the §3 store to exist), capability-probe harness (`8c635887` — great idea, retarget llama-server), `local-effort-capability.ts` (Ollama-specific).

**Discard:** `opencode-service.ts`, `opencode-session-adapter.ts` (its *translation patterns* inform Phase 2 but the code is SSE/OpenCode-specific), `opencode-config-writer.ts`, `@opencode-ai/sdk` dep + type shim, Ollama/OpenCode prerequisite-installers, `oc-dependencies.md`. `OllamaDetector` is kept in the reference branch for the Phase 1 optional-endpoint detector.

**Branch disposition:** `feat/opencode-mvp` stays on origin as reference material; its tip gains one commit adding `OPENCODE-MVP-ARCHIVED.md` (pointer to the roadmap + this spec, "do not merge").

**The seam PR also carries:** `docs/engine-dependencies.md` + `docs/provider-dependencies.md` skeletons (§5), and a `cc-dependencies.md` note that the provider seam exists.

## 5. Coupling registries (skeletons)

Same discipline as `cc-dependencies.md`, created now so Phase 1+ has somewhere to record touchpoints as they're built:

- **`youcoded/docs/engine-dependencies.md`** — llama.cpp couplings: pinned engine version; router-mode flags; `/models`, `/models/load`, `/v1/chat/completions` shapes; `--jinja` tool-format behavior; cache-dir layout; `-hf` download semantics; health endpoint. Each entry names the consuming file. Re-verified on every engine bump (smoke probes to be added in Phase 1, analogous to `test-conpty/`).
- **`youcoded/docs/provider-dependencies.md`** — external API couplings: AI SDK major-version surface we use; models.dev `api.json` schema; OpenRouter `/api/v1/models` + attribution headers + BYOK; per-vendor quirks as adopted.

## 6. Explicitly out of Phase 0 scope

No engine binary, no model downloads, no working native session (Phase 1). No tools/permissions/loop (Phase 2). No home migration of existing installs (Phase 3). No Kotlin/Android changes — the seam is desktop-shaped; Android sees only inert `native.supported: false` stubs via the bridge. The `~/.youcoded/` dir is created lazily by the first real writer (Phase 1), not by the seam PR.

## 7. Verification & exit criteria

- `ipc-channels.test.ts` parity green across preload/remote-shim (+ SessionService stub row for `native:*` if the harness requires the three-file rule).
- Branch-ported reducer tests green; `npm test && npm run build` green; flag OFF → zero behavior change (manual dev-instance pass); flag ON → runtime selector renders, "YouCoded" option present but disabled with a "coming in Phase 1" note.
- ADRs 006–010 committed (done); this spec approved; harness-design-ideas research report saved under `docs/superpowers/investigations/`.

## 8. Open items for Destin

1. **UI label** for the native runtime in the selector: recommendation "YouCoded"; alternatives "Models", "Universal", "Local+".
2. **Flag placement:** Settings → Development section (recommendation) vs a hidden config-file-only flag.
3. Anything to add to the harness preset list before Phase 2 specs (current: Chat, Assistant, Coder, Researcher, Automation)?
