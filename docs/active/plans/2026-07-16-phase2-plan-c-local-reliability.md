---
status: draft
---

# Phase 2 Plan C — Local Reliability + Compaction + Status: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make native sessions reliable on locally-hosted small/medium models — capability profiles that are *robust for known models and safe for unknown ones*, real (not guessed) context-window enforcement, grammar-constrained tool arguments on llama-server, per-model prompt variants, two-stage compaction that survives context overflow AND fails safe, and a live StatusBar usage bridge — completing spec §4 behind the same dormant `YOUCODED_NATIVE` gate.

**Architecture:** A `CapabilityProfile` is resolved in **three layers**: (1) **discovered truth** read from the runtime — the model's *real* effective context window (min of GGUF-trained max and what llama-server actually loaded) and empirically-probed tool-calling support, never guessed; (2) a **curated known-model registry** keyed by model family (Qwen 3.5 dense vs 3.6 MoE, Gemma 3n vs Gemma 4, …) carrying the behavioral tuning metadata can't tell us — prompt variant, doom-loop threshold, parallel-call safety, presentation tier; (3) a **conservative fallback** for unknown local models (safe defaults + their real discovered window). The harness *reads* the resolved profile; nothing branches on a model-name string except the registry's family matcher. The same real context number drives the profile, the compaction trigger, AND the StatusBar context chip — one accounting, so gauge and threshold can never disagree. Constrained decoding is llama.cpp's `--jinja` native tool grammar (already spawned) plus `parallel_tool_calls:false` via a `transformRequestBody` hook; `probe-tools.mjs` is the verification gate. Two-stage compaction (prune tool outputs → model summary) runs between steps/turns off real usage and **fails safe** — a summary that can't fit or comes back empty degrades to the hard-truncation floor, never bricking the turn. The StatusBar bridge mirrors `remote:attention-changed`: a renderer→main `native:usage-report` caches per-session usage in main so `buildStatusData()` feeds context/tokens/speed chips to the local StatusBar and remote browsers alike.

**Tech Stack:** TypeScript (Electron main + React renderer), zod, vitest, ai@7.0.22 + @ai-sdk/openai-compatible@3.0.7 (both unchanged — no new deps). llama-server (bundled engine, already spawned with `--jinja`).

**Spec:** `youcoded-dev/docs/active/specs/2026-07-15-phase2-native-harness-design.md` §4 (binding; §0 settled decisions apply, esp. decisions 7/9). Builds on Plans A (PR #149) and B (PR #156, merge `2fd316e1`).

---

## Plan-level decisions (made here, per spec "plan decides")

1. **Acceptance target is NOT Qwen3-Coder 30B (Destin, 2026-07-16 — "qwen 3 is outdated").** The exit test is written **model-agnostic**, parameterized on whichever local server/model it points at. Final acceptance runs on Destin's Linux device across the model range on hand — **gemma e2b** (tiny), **qwen 9b** (small), **3.6 35b moe** (medium), **3.5 122b** (large). Spec §1/§5's "Qwen3-Coder 30B" is superseded by "the designated local acceptance model."

2. **Capability profiles are resolved in three layers, NOT from context-window size alone (Destin, 2026-07-16).** Window-size-only can't tell a Qwen 3.6 35B MoE from a Qwen 3.5 9B at the same loaded window. So: **Layer 1 discovered truth** (real context window + probed tool support), **Layer 2 curated known-model registry** (family-keyed behavioral tuning), **Layer 3 conservative fallback** (unknown local models). The profile object: `{ maxToolPresentation, promptVariant, doomLoopThreshold, supportsParallelToolCalls, constrainToolArgs, supportsTools }`. Tools are NEVER removed for a tools-capable model (spec decision 9); a model the registry marks `supportsTools:false` runs as plain chat.

3. **Real context window is READ and ENFORCED, never guessed.** Effective window = `min(GGUF-trained max, what llama-server actually loaded via /props)`. Today the engine loads a fixed 32k default and the harness trusts a catalog number; Task 4 replaces that for local models. This one number feeds profile tiering, the compaction trigger, and the StatusBar context chip — a single accounting (spec §4.5: "gauge and threshold cannot disagree").

4. **The known-model registry ships in-app as data, seeded now and populated by a Sonnet web-search pass (Task 3).** It does not need to be exhaustive to start (Destin) — Qwen 3.5/3.6 + Gemma 3n/Gemma 4 families at minimum, everything else falls to the fallback. Model *facts* (context windows, tool-calling support) come from verified sources (published model cards + each model's GGUF metadata), never from the model's memory of me. Remote-refresh of this registry folds into the roadmapped "Richer model metadata + selection UX" feature — Plan C ships the in-app data module + fallback only.

5. **Constrained decoding = `--jinja` native tool grammar (automatic arg constraint, already spawned) + simplified schemas + `parallel_tool_calls:false` for serial-only models — NOT a top-level `json_schema`.** A top-level `json_schema`/`response_format` would force JSON on EVERY response, violating spec §4.2's "never force a tool call." The lever we own is (a) flattened schemas + (b) a `transformRequestBody` hook on the local-engine model. `probe-tools.mjs` proves the round-trip on the real binary.

6. **Two-stage compaction runs BEFORE `fitToContext` (which stays as the hard floor) and FAILS SAFE.** `compaction.ts` owns the pure decision + prune transform; the driver owns the async summarize call + `compact-summary` emit. Trigger signal is the **real last-step `inputTokens`**. Fail-safe (decision made here): the span handed to the summarize model is itself pruned/bounded first, and if the summary call throws or returns empty, the driver falls through to `fitToContext` truncation rather than erroring the turn.

7. **`native:usage-report` is renderer→main fire-and-forget, cached per session in main, mirroring `remote:attention-changed`.** Chips update on `turn-complete` (v1: turn-end, not mid-turn — a long agentic turn's context chip lags until the turn ends; accepted, noted). No new transcript event *types* — this is a status channel.

8. **`compact-summary` is an EXISTING frozen `TranscriptEventType`** (spec §2). Compaction emits it through the existing surface → the existing expandable SystemMarker. No renderer change for the summary card; only the StatusBar chips (Task 12) touch the renderer.

9. **Profile re-resolves on model swap** (spec decision 9). `setBinding` recomputes discovered facts + registry lookup so a swap from a 122B cloud model to a 9B local one tightens presentation on the NEXT turn. An in-flight turn keeps the model it started with (the driver creates the model once per turn) — the swap takes effect on the following turn.

10. **Prompt variants keep a four-way type as a hook, but only `local-small` carries content in v1 (Destin approved).** `default`/`anthropic`/`gpt` are no-op overlays — we have no evidence cloud frontier models need model-specific steering, and inventing it would be guessing. The four-way distinction stays so per-family steering can be added later without restructuring.

## File structure

```
youcoded/desktop/
  src/main/harness/capability-profile.ts        NEW  CapabilityProfile + 3-layer resolveProfile() (pure)
  src/main/harness/known-models.ts               NEW  curated family-keyed registry (data + matcher)
  src/main/harness/compaction.ts                 NEW  planCompaction() + prune() (pure) + summarize prompt
  src/main/harness/prompts/variants.ts           NEW  steering overlays (only local-small has content)
  src/main/harness/harness-session.ts            MOD  profile threading; simplified schemas; constraint hook;
                                                      two-stage compaction + fail-safe; usage-report signal
  src/main/harness/native-session-host.ts        MOD  resolve+thread profile; re-resolve on setBinding
  src/main/harness/prompt-assembly.ts            MOD  promptVariant param → appended steering overlay
  src/main/providers/provider-registry.ts        MOD  languageModel(binding, opts?) → transformRequestBody
  src/main/engine/engine-manager.ts              MOD  effectiveContextWindow(modelId) — read /props, clamp to GGUF
  src/shared/types.ts                            MOD  NATIVE_USAGE_REPORT IPC const
  src/main/ipc-handlers.ts                        MOD  usage-report listener; buildStatusData fold; real-ctx + profile wiring
  src/main/preload.ts                            MOD  window.claude.native.reportUsage
  src/renderer/remote-shim.ts                    MOD  parity
  app/src/main/kotlin/.../runtime/SessionService.kt  MOD  inert stub for native:usage-report
  src/renderer/components/StatusBar.tsx          MOD  native context/tokens/speed chips
  src/renderer/state/…(usage source)             MOD  emit reportUsage on native turn-complete
  test-engine/probe-tools.mjs                    NEW  constrained round-trip + real-ctx/tool report (dev-run)
  tests/  (new + extended vitest files per task)
youcoded/docs/provider-dependencies.md           MOD  AI SDK tool-call constraint row
youcoded/docs/engine-dependencies.md             MOD  --jinja tool grammar + /props context read row
```

Working conventions carried from Plans A/B (binding): worktree `youcoded-worktrees/feat-native-local-reliability`, branch `feat/native-local-reliability`; every task commits with explicit `git add <own files>`; **frozen emit surface**; **tool-call/result pairing invariant** (compaction must never split a pair); IPC parity ×5 for every new channel; error messages per `docs/error-message-standards.md`; prompt/registry prose must be ORIGINAL. Reviews per task: spec-compliance + adversarial quality before the next dependent task builds on it.

**Parallelization map:** after Task 1, **Track A (profile spine): Tasks 2 → 3 → 4 → 5** lands first — most others read the profile or the real-ctx number. Task 3 (registry population) is a research task that can run alongside 4/5. **Track P (prompt): Task 6** depends only on Task 2's `promptVariant` type. **Track K (compaction): Tasks 7 → 8** touch `compaction.ts` + `harness-session.ts`. **Track C (constrain): Task 9 (probe, standalone) → 10** touch `harness-session.ts` + `provider-registry.ts`. **Track S (status): Tasks 11 → 12** touch IPC + renderer. `harness-session.ts` is the contention point (Tasks 5, 8, 10) — land 5 first, then serialize 8 and 10 or rebase. Tasks 13 (hardening) depends on 5/10. Task 15 (docs) after code; Task 16 (acceptance) last, on the Linux box.

---

### Task 1: Worktree + baseline

**Files:** none in-repo yet (worktree setup only).

- [ ] **Step 1: Create the worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded-worktrees/feat-native-local-reliability -b feat/native-local-reliability
cd ../youcoded-worktrees/feat-native-local-reliability/desktop
npm ci
```

Do NOT junction `node_modules` (the `git worktree remove` junction hazard — workspace CLAUDE.md). No new dependencies in Plan C.

- [ ] **Step 2: Baseline suite green**

Run: `npm test 2>&1 | tail -5` — Expected: the Plan B-era pass count (2298 passed / 35 skipped baseline). Then `npx tsc --noEmit` → exit 0.

---

### Task 2: `CapabilityProfile` + known-model registry types + three-layer `resolveProfile` (pure)

The pure spine every later task reads. **Layer 1** facts arrive as inputs (discovered by Task 4 at runtime); **Layer 2** is a registry lookup; **Layer 3** is the fallback. No model-name branching except the registry's family matcher.

**Files:**
- Create: `src/main/harness/capability-profile.ts`
- Create: `src/main/harness/known-models.ts`
- Test: `tests/capability-profile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/capability-profile.test.ts
import { describe, it, expect } from 'vitest';
import { resolveProfile, CLOUD_DEFAULT, type DiscoveredModel } from '../src/main/harness/capability-profile';
import type { KnownModelEntry } from '../src/main/harness/known-models';

const local = (modelId: string, contextLength: number | null): DiscoveredModel => ({ providerType: 'local-engine', modelId, contextLength });

describe('resolveProfile — Layer selection', () => {
  it('cloud provider → full presentation, variant by type, no local constraint', () => {
    const a = resolveProfile({ providerType: 'anthropic', modelId: 'x', contextLength: 200_000 });
    expect(a.maxToolPresentation).toBe('full');
    expect(a.promptVariant).toBe('anthropic');
    expect(a.constrainToolArgs).toBe(false);
    expect(a.supportsTools).toBe(true);
    expect(resolveProfile({ providerType: 'openai', modelId: 'x', contextLength: 128_000 }).promptVariant).toBe('gpt');
    expect(resolveProfile({ providerType: 'openrouter', modelId: 'x', contextLength: 128_000 }).promptVariant).toBe('default');
  });

  it('unknown local model → conservative fallback tiered by REAL context window', () => {
    const small = resolveProfile(local('mystery-3b', 8_192));
    expect(small.maxToolPresentation).toBe('simplified');
    expect(small.promptVariant).toBe('local-small');
    expect(small.doomLoopThreshold).toBe(2);
    expect(small.supportsParallelToolCalls).toBe(false);
    expect(small.constrainToolArgs).toBe(true);

    const large = resolveProfile(local('mystery-120b', 131_072));
    expect(large.maxToolPresentation).toBe('full');
    expect(large.promptVariant).toBe('default');
    expect(large.doomLoopThreshold).toBe(3);
  });

  it('a KNOWN local model overlays registry tuning on the fallback (MoE ≠ dense at the same window)', () => {
    const registry: KnownModelEntry[] = [
      { match: 'qwen3\\.6.*35b.*moe', label: 'Qwen 3.6 35B MoE', maxToolPresentation: 'full', doomLoopThreshold: 3, supportsTools: true },
      { match: 'qwen3\\.5.*9b',       label: 'Qwen 3.5 9B',      maxToolPresentation: 'simplified', doomLoopThreshold: 2, supportsTools: true },
    ];
    // Same 32k window; registry distinguishes them.
    const moe = resolveProfile(local('qwen3.6-35b-moe-q4', 32_768), registry);
    const dense = resolveProfile(local('qwen3.5-9b-q4', 32_768), registry);
    expect(moe.maxToolPresentation).toBe('full');
    expect(dense.maxToolPresentation).toBe('simplified');
    // registry silence on a field → fallback value (constrainToolArgs always true for local)
    expect(moe.constrainToolArgs).toBe(true);
  });

  it('a registry entry marking supportsTools:false runs the model as plain chat', () => {
    const registry: KnownModelEntry[] = [{ match: 'no-tools-model', label: 'X', supportsTools: false }];
    expect(resolveProfile(local('no-tools-model', 8_192), registry).supportsTools).toBe(false);
  });

  it('null/unknown context is treated as small (conservative)', () => {
    expect(resolveProfile(local('x', null)).maxToolPresentation).toBe('simplified');
  });
});
```

- [ ] **Step 2: Run — Expected: FAIL** (modules missing).

- [ ] **Step 3: Implement `capability-profile.ts`**

```ts
// Capability profiles (spec §4.1, decisions 2/9). Resolved in THREE layers so a
// known model gets curated tuning, an unknown one gets a safe fallback, and the
// harness NEVER branches on a model-name string (only the registry matcher does).
import { KNOWN_MODELS, matchKnownModel, type KnownModelEntry } from './known-models';

export type ToolPresentation = 'full' | 'simplified';
export type PromptVariant = 'anthropic' | 'gpt' | 'default' | 'local-small';

export interface CapabilityProfile {
  maxToolPresentation: ToolPresentation;   // simplified = compact descriptions + serial calls
  promptVariant: PromptVariant;            // which steering overlay to append
  doomLoopThreshold: number;               // identical-call repeats that trip the ask (2 for small)
  supportsParallelToolCalls: boolean;      // may the model emit >1 tool call per step?
  constrainToolArgs: boolean;              // inject the llama.cpp serial/grammar hook (local only)
  supportsTools: boolean;                  // false → run as plain chat (no tools attached)
}

export type ProfileProviderType =
  | 'local-engine' | 'openrouter' | 'openai-compatible'
  | 'anthropic' | 'openai' | 'google';

// LAYER 1 — discovered truth (Task 4 fills contextLength from the real engine).
export interface DiscoveredModel { providerType: ProfileProviderType; modelId: string; contextLength: number | null }

const SMALL_LOCAL_CONTEXT = 32_768;

export const CLOUD_DEFAULT: CapabilityProfile = {
  maxToolPresentation: 'full', promptVariant: 'default',
  doomLoopThreshold: 3, supportsParallelToolCalls: true,
  constrainToolArgs: false, supportsTools: true,
};

function cloudVariant(t: ProfileProviderType): PromptVariant {
  if (t === 'anthropic') return 'anthropic';
  if (t === 'openai') return 'gpt';
  return 'default';
}

// LAYER 3 — conservative fallback for an UNKNOWN local model, tiered by the REAL
// context window. Constrained args + serial-only are the safe llama-server default
// at every size; presentation/variant/doom-loop tighten for a small window.
function localFallback(ctx: number | null): CapabilityProfile {
  const small = ctx == null || ctx <= SMALL_LOCAL_CONTEXT;
  return {
    maxToolPresentation: small ? 'simplified' : 'full',
    promptVariant: small ? 'local-small' : 'default',
    doomLoopThreshold: small ? 2 : 3,
    supportsParallelToolCalls: false,
    constrainToolArgs: true,
    supportsTools: true,   // assume yes; the registry marks known tool-less models false
  };
}

export function resolveProfile(d: DiscoveredModel, registry: KnownModelEntry[] = KNOWN_MODELS): CapabilityProfile {
  if (d.providerType !== 'local-engine') {
    return { ...CLOUD_DEFAULT, promptVariant: cloudVariant(d.providerType) };
  }
  const base = localFallback(d.contextLength);
  const known = matchKnownModel(d.modelId, registry);   // LAYER 2 overlay
  if (!known) return base;
  return {
    maxToolPresentation: known.maxToolPresentation ?? base.maxToolPresentation,
    promptVariant: known.promptVariant ?? base.promptVariant,
    doomLoopThreshold: known.doomLoopThreshold ?? base.doomLoopThreshold,
    supportsParallelToolCalls: known.supportsParallelToolCalls ?? base.supportsParallelToolCalls,
    constrainToolArgs: base.constrainToolArgs,           // always true for local
    supportsTools: known.supportsTools ?? base.supportsTools,
  };
}
```

- [ ] **Step 4: Implement `known-models.ts` (structure + a conservative seed; real facts land in Task 3)**

```ts
// Curated known-model capability registry (spec §4.1, decision 4). Keyed by model
// FAMILY via a case-insensitive regex on the modelId — this is the ONLY place a
// model name influences behavior. Carries the BEHAVIORAL tuning that GGUF metadata
// can't (prompt variant, doom-loop, parallel safety, presentation, tool support).
// Context windows are NOT the source of truth here — Task 4 reads the real window
// from the engine; maxContextWindow below is only a documented sanity ceiling.
//
// NOT exhaustive by design (Destin, 2026-07-16): the families people actually run,
// everything else falls to the fallback. The FACTUAL fields (maxContextWindow,
// supportsTools) are VERIFIED in Task 3 from model cards + GGUF metadata — the
// seed values here are the conservative behavioral tuning we can reason about now.
export interface KnownModelEntry {
  match: string;                         // case-insensitive regex tested against modelId
  label: string;                         // human name (logs/UI)
  maxToolPresentation?: import('./capability-profile').ToolPresentation;
  promptVariant?: import('./capability-profile').PromptVariant;
  doomLoopThreshold?: number;
  supportsParallelToolCalls?: boolean;
  supportsTools?: boolean;               // verified in Task 3
  maxContextWindow?: number;             // documented trained max (sanity ceiling; discovery wins)
}

// Seed entries — behavioral tuning only; Task 3 verifies/fills the factual fields.
export const KNOWN_MODELS: KnownModelEntry[] = [
  // Qwen 3.6 MoE (35B-class): capable — full presentation, standard doom-loop.
  { match: 'qwen\\W?3\\.6.*(35b|moe|a\\d+b)', label: 'Qwen 3.6 MoE', maxToolPresentation: 'full', doomLoopThreshold: 3 },
  // Qwen 3.5 dense small (≈9B): simplified presentation, tighter doom-loop.
  { match: 'qwen\\W?3\\.5.*9b', label: 'Qwen 3.5 9B', maxToolPresentation: 'simplified', doomLoopThreshold: 2 },
  // Qwen 3.5 dense large (≈122B): full presentation.
  { match: 'qwen\\W?3\\.5.*(70b|122b)', label: 'Qwen 3.5 (large)', maxToolPresentation: 'full', doomLoopThreshold: 3 },
  // Gemma 4 line: full presentation (verify tool support in Task 3).
  { match: 'gemma\\W?4', label: 'Gemma 4', maxToolPresentation: 'full', doomLoopThreshold: 3 },
  // Gemma 3n small (E2B/E4B effective): tiny — simplified, tightest doom-loop.
  { match: 'gemma\\W?3n|gemma.*e[24]b', label: 'Gemma 3n (E2B/E4B)', maxToolPresentation: 'simplified', doomLoopThreshold: 2 },
];

export function matchKnownModel(modelId: string, registry: KnownModelEntry[] = KNOWN_MODELS): KnownModelEntry | undefined {
  return registry.find((e) => { try { return new RegExp(e.match, 'i').test(modelId); } catch { return false; } });
}
```

- [ ] **Step 5: Run — Expected: PASS** (`npx vitest run tests/capability-profile.test.ts`). Then `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/main/harness/capability-profile.ts src/main/harness/known-models.ts tests/capability-profile.test.ts
git commit -m "feat(native): three-layer CapabilityProfile + curated known-model registry (spec §4.1)"
```

---

### Task 3: Populate the known-model registry (Sonnet web-search + verify)

Fill the FACTUAL fields of `known-models.ts` from trusted sources — this is the "web-search for model info (using Sonnet)" pass Destin called for. Deliverable: verified `maxContextWindow` + `supportsTools` (and any behavioral corrections) for the Qwen 3.5/3.6 and Gemma 3n/Gemma 4 families, each with a source note.

**Files:**
- Modify: `src/main/harness/known-models.ts`
- Test: `tests/known-models.test.ts`

- [ ] **Step 1: Dispatch the research**

Use the Agent tool with `subagent_type: general-purpose`, **model: sonnet**, WebSearch/WebFetch enabled. Prompt it to find, for each family (Qwen 3.5 dense small/large, Qwen 3.6 MoE, Gemma 4, Gemma 3n E2B/E4B): (a) does it support tool/function calling under llama.cpp `--jinja`? (b) trained/native context window and any extended (YaRN) window; (c) dense-vs-MoE active-parameter distinction. Require a source URL per fact. Return structured JSON: `[{ family, match, supportsTools, maxContextWindow, notes, sources[] }]`.

- [ ] **Step 2: Write the failing test (locks the shape + that facts are present, not the exact numbers)**

```ts
// tests/known-models.test.ts
import { describe, it, expect } from 'vitest';
import { KNOWN_MODELS, matchKnownModel } from '../src/main/harness/known-models';

describe('known-models registry', () => {
  it('every entry has a valid regex and a label', () => {
    for (const e of KNOWN_MODELS) {
      expect(() => new RegExp(e.match, 'i')).not.toThrow();
      expect(e.label.length).toBeGreaterThan(0);
    }
  });
  it('the named families each resolve (Qwen 3.5/3.6, Gemma 3n/4)', () => {
    expect(matchKnownModel('qwen3.6-35b-a3b-instruct-q4')?.label).toMatch(/Qwen 3\.6/);
    expect(matchKnownModel('qwen3.5-9b-instruct-q5')?.label).toMatch(/Qwen 3\.5/);
    expect(matchKnownModel('gemma-3n-e4b-it-q4')?.label).toMatch(/Gemma 3n/);
    expect(matchKnownModel('gemma-4-12b-it-q4')?.label).toMatch(/Gemma 4/);
  });
  it('every entry carries a verified supportsTools boolean and a context ceiling', () => {
    for (const e of KNOWN_MODELS) {
      expect(typeof e.supportsTools).toBe('boolean');
      expect(e.maxContextWindow).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Fold verified facts into `known-models.ts`** — set `supportsTools` + `maxContextWindow` per entry from the research, add a `// source:` comment per fact. If a family turns out NOT to support tool calling, set `supportsTools:false` (it runs as plain chat). Adjust the `match` regexes if the research shows the real model-id conventions differ.

- [ ] **Step 4: Run — Expected: PASS** (`npx vitest run tests/known-models.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/known-models.ts tests/known-models.test.ts
git commit -m "feat(native): populate known-model registry from verified model cards (Qwen 3.5/3.6, Gemma 3n/4)"
```

> The registry entries are re-verified against Destin's ACTUAL GGUF quants during Task 16 acceptance — the regexes must match his real model ids, and `maxContextWindow` is a ceiling only (the real loaded window from Task 4 is the operative number).

---

### Task 4: Real context-window discovery + enforcement

Replace the guessed context length for local models with the real one: read what llama-server actually loaded (its `/props` endpoint) and clamp to the model's GGUF-trained max. This one number feeds the profile, the compaction trigger, and the StatusBar chip.

**Files:**
- Modify: `src/main/engine/engine-manager.ts` (add `effectiveContextWindow(modelId)`)
- Modify: `src/main/ipc-handlers.ts` (local branch of the `contextLengthFor` closure)
- Test: `tests/engine-context-window.test.ts`

- [ ] **Step 1: Read `engine-manager.ts` + `engine-supervisor.ts`** to find the running server's base URL / fetch handle (the supervisor already spawns with `-c`/context size and exposes a base URL via `ensureRunning()`). Confirm the `/props` response field for the loaded context (commonly `default_generation_settings.n_ctx` or a top-level `n_ctx` — **verify against the pinned llama.cpp build**, it has drifted across versions).

- [ ] **Step 2: Write the failing test**

```ts
// tests/engine-context-window.test.ts
import { describe, it, expect } from 'vitest';
import { clampContextWindow } from '../src/main/engine/engine-manager';

describe('clampContextWindow', () => {
  it('uses the min of loaded and trained max', () => {
    expect(clampContextWindow(32_768, 131_072)).toBe(32_768); // server loaded less than trained
    expect(clampContextWindow(131_072, 32_768)).toBe(32_768); // trained is the ceiling
  });
  it('falls back to loaded when trained is unknown, and to a conservative default when both unknown', () => {
    expect(clampContextWindow(16_384, null)).toBe(16_384);
    expect(clampContextWindow(null, null)).toBe(32_768);
  });
});
```

- [ ] **Step 3: Implement `clampContextWindow` + `effectiveContextWindow`**

In `engine-manager.ts`:
```ts
// The REAL effective context window for a local model = min(what llama-server
// actually loaded, the GGUF-trained max). Guessing this overflows small models.
export function clampContextWindow(loaded: number | null, trainedMax: number | null): number {
  const vals = [loaded, trainedMax].filter((n): n is number => typeof n === 'number' && n > 0);
  return vals.length ? Math.min(...vals) : 32_768;   // conservative default
}
```
Add an async method that queries the running server's `/props` (booting it if needed via `ensureRunning`) and reads the GGUF-trained max from the model's cached metadata (the engine already scans GGUFs — `cache-scan.ts`; reuse its context-length field if present):
```ts
  async effectiveContextWindow(modelId: string): Promise<number> {
    try {
      const base = await this.supervisor.ensureRunning();
      const props = await (await fetch(`${base}/props`)).json();
      // NOTE: confirm the field name against the pinned llama.cpp build (Step 1).
      const loaded = props?.default_generation_settings?.n_ctx ?? props?.n_ctx ?? null;
      const trained = this.trainedContextFor(modelId);   // from cache-scan GGUF metadata, null if unknown
      return clampContextWindow(loaded, trained);
    } catch { return 32_768; }   // never throw — a status read must not break session create
  }
```

- [ ] **Step 4: Wire it into the local branch of `contextLengthFor`**

In `ipc-handlers.ts`, the host is constructed with `async (binding) => modelCatalog.contextLengthFor(binding, await providerRegistry.list())`. Change it to prefer the real engine window for local providers:
```ts
    async (binding) => {
      const providers = await providerRegistry.list();
      const p = providers.find((x) => x.id === binding.providerId);
      if (p?.type === 'local-engine') return engineManager.effectiveContextWindow(binding.modelId);
      return modelCatalog.contextLengthFor(binding, providers);
    },
```

- [ ] **Step 5: Run — Expected: PASS** (`npx vitest run tests/engine-context-window.test.ts`) then `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/main/engine/engine-manager.ts src/main/ipc-handlers.ts tests/engine-context-window.test.ts
git commit -m "feat(native): read + enforce the REAL local context window (min of loaded /props and GGUF max)"
```

---

### Task 5: Thread the profile into `HarnessSession` + host

Wire the resolved profile through so the driver uses `doomLoopThreshold` + `supportsTools` (Task 10 uses presentation/parallel). The host resolves it from discovered facts + registry and re-resolves on `setBinding`.

**Files:**
- Modify: `src/main/harness/harness-session.ts` (profile opt; doom-loop threshold; supportsTools gates the tool set)
- Modify: `src/main/harness/native-session-host.ts` (resolve + thread; re-resolve on setBinding)
- Test: `tests/harness-session-profile.test.ts`, extend `tests/native-session-host.test.ts`

- [ ] **Step 1: Write the failing driver test**

```ts
// tests/harness-session-profile.test.ts
import { describe, it, expect } from 'vitest';
import { CLOUD_DEFAULT } from '../src/main/harness/capability-profile';
import { makeSession, scriptModel, drainTurn } from './helpers/harness-fakes';

describe('profile-driven driver behavior', () => {
  it('a doomLoopThreshold of 2 trips after 2 identical calls (not 3)', async () => {
    let asks = 0;
    const session = makeSession({
      profile: { ...CLOUD_DEFAULT, doomLoopThreshold: 2 },
      askUser: async () => { asks++; return { behavior: 'deny' } as any; },
      model: scriptModel([
        { toolCalls: [{ name: 'Glob', input: { pattern: '*.ts' } }] },
        { toolCalls: [{ name: 'Glob', input: { pattern: '*.ts' } }] },
      ]),
    });
    await drainTurn(session, 'go');
    expect(asks).toBe(1);
  });

  it('supportsTools:false attaches NO tools to the model', () => {
    const session = makeSession({ profile: { ...CLOUD_DEFAULT, supportsTools: false } });
    expect(Object.keys((session as any).buildAiTools())).toHaveLength(0);
  });
});
```

> If `tests/helpers/harness-fakes.ts` doesn't exist, factor the fake-model + `makeSession` helpers out of `tests/harness-session-loop.test.ts` into it first (pure refactor; re-run that suite after).

- [ ] **Step 2: Run — Expected: FAIL**.

- [ ] **Step 3: Add the profile opt + use it in the driver**

In `harness-session.ts`:
```ts
import { CLOUD_DEFAULT, type CapabilityProfile } from './capability-profile';
```
`HarnessSessionOpts`: `profile?: CapabilityProfile;`. Field: `private profile: CapabilityProfile;`. Constructor: `this.profile = opts.profile ?? CLOUD_DEFAULT;`.
Extend `setBinding` to accept a fresh profile:
```ts
  setBinding(binding: ModelBinding, contextLength?: number | null, profile?: CapabilityProfile): void {
    this.binding = binding;
    if (contextLength !== undefined) this.opts.contextLength = contextLength;
    if (profile) this.profile = profile;
  }
```
Doom-loop threshold from the profile (replace the hardcoded `3`):
```ts
    const threshold = this.profile.doomLoopThreshold;
    const sig = `${call.toolName}:${JSON.stringify(args)}`;
    recentCalls.push(sig);
    if (recentCalls.length > threshold) recentCalls.shift();
    if (recentCalls.length === threshold && recentCalls.every((s) => s === sig)) {
      const d = await this.opts.askUser?.({ sessionId: this.opts.sessionId, toolName: 'doom_loop', toolInput: { repeated: call.toolName }, denyListed: false });
      if (d?.behavior === 'canceled') return 'interrupted';
      if (d?.behavior !== 'allow') return { text: 'Stopped: this exact call has been repeated. Try a different approach.', isError: true };
      recentCalls.length = 0;
    }
```
`buildAiTools` returns `{}` when `!this.profile.supportsTools` (plain-chat model):
```ts
  private buildAiTools(): Record<string, any> {
    if (!this.profile.supportsTools) return {};
    const out: Record<string, any> = {};
    for (const t of this.toolByName.values()) out[t.name] = tool({ description: t.description, inputSchema: zodSchema(t.inputSchema) });
    return out;
  }
```

- [ ] **Step 4: Run — Expected: PASS**. Also `npx vitest run tests/harness-session-loop.test.ts` (default profile → threshold 3, tools attached — unchanged).

- [ ] **Step 5: Resolve + thread the profile in the host**

In `native-session-host.ts`:
```ts
import { resolveProfile, type CapabilityProfile, type ProfileProviderType } from './capability-profile';
```
Add a constructor-injected provider-type resolver after `contextLengthFor`:
```ts
    private providerTypeFor: (binding: ModelBinding) => Promise<ProfileProviderType | null>,
```
Helper:
```ts
  private async profileFor(binding: ModelBinding, contextLength: number | null): Promise<CapabilityProfile> {
    const type = (await this.providerTypeFor(binding)) ?? 'openrouter';   // unknown → cloud-safe default
    return resolveProfile({ providerType: type, modelId: binding.modelId, contextLength });
  }
```
In `create()`/`resume()`, resolve after `contextLength` and pass `profile` into the `HarnessSession` opts (and into `toolWiring` for the prompt variant — Task 6). In `setBinding()`, re-resolve and pass through:
```ts
    const contextLength = await this.contextLengthFor(binding);
    const profile = await this.profileFor(binding, contextLength);
    entry.session.setBinding(binding, contextLength, profile);
```

- [ ] **Step 6: Wire `providerTypeFor` in ipc-handlers**

At the `new NativeSessionHost(...)` call, insert directly after the `contextLengthFor` arg:
```ts
    async (binding) => {
      const p = (await providerRegistry.list()).find((x) => x.id === binding.providerId);
      return (p?.type as ProfileProviderType) ?? null;
    },
```
Update every `new NativeSessionHost(...)` in tests to pass the extra arg (it is NOT last — add explicitly; a `async () => null` default is fine in tests).

- [ ] **Step 7: Extend the host test + run** — assert a `local-engine` binding yields a `simplified` session profile and a swap to a cloud binding re-resolves to `full`. Run: `npx vitest run tests/native-session-host.test.ts tests/harness-session-profile.test.ts` then `npx tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add src/main/harness/harness-session.ts src/main/harness/native-session-host.ts src/main/ipc-handlers.ts tests/harness-session-profile.test.ts tests/native-session-host.test.ts tests/helpers/harness-fakes.ts
git commit -m "feat(native): resolve + thread CapabilityProfile; profile-driven doom-loop + tool gating; re-resolve on swap"
```

---

### Task 6: Prompt variants (steering overlays selected by profile)

`promptVariant` appends a model-capability steering block after tool guidance (decision 10). Only `local-small` carries content; `default`/`anthropic`/`gpt` are no-ops.

**Files:**
- Create: `src/main/harness/prompts/variants.ts`
- Modify: `src/main/harness/prompt-assembly.ts`, `src/main/harness/native-session-host.ts`
- Test: `tests/prompt-assembly.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/prompt-assembly.test.ts
import { describe, it, expect } from 'vitest';
import { assembleSystemPrompt } from '../src/main/harness/prompt-assembly';
const base = { presetBody: 'PRESET_BODY', cwd: process.cwd(), appVersion: '9.9.9' };

describe('prompt variant overlay', () => {
  it('default/anthropic/gpt append nothing (byte-identical to no variant)', () => {
    const none = assembleSystemPrompt({ ...base });
    expect(assembleSystemPrompt({ ...base, promptVariant: 'default' })).toBe(none);
    expect(assembleSystemPrompt({ ...base, promptVariant: 'anthropic' })).toBe(none);
    expect(assembleSystemPrompt({ ...base, promptVariant: 'gpt' })).toBe(none);
  });
  it('local-small appends the plan-then-execute overlay AFTER the preset body', () => {
    const p = assembleSystemPrompt({ ...base, promptVariant: 'local-small' });
    expect(p).toContain('PRESET_BODY');
    expect(p.indexOf('PRESET_BODY')).toBeLessThan(p.indexOf('one tool at a time'));
    expect(p).toMatch(/TodoWrite/);
  });
});
```

- [ ] **Step 2: Run — Expected: FAIL**.

- [ ] **Step 3: Create `prompts/variants.ts`**

```ts
// Prompt STEERING OVERLAYS by capability profile (spec §4.3). Appended AFTER the
// preset body + tool guidance; they steer HOW a model tier calls tools, orthogonal
// to the preset's personality. Only local-small carries content in v1 (decision
// 10) — cloud frontier models need no extra steering; the four-way type is kept as
// a hook so per-family steering can be added later. POLICY: original prose.
import type { PromptVariant } from '../capability-profile';

const LOCAL_SMALL = `You are running on a smaller local model. Work in small, deliberate steps:
- Make a short plan with TodoWrite before multi-step work, and update it as you finish each item.
- Call one tool at a time and read its result before deciding the next call. Do not batch calls.
- Prefer the dedicated tools (Read, Glob, Grep) over shell commands.
- When you have enough to answer, stop and answer in plain text — you do not have to call a tool.

Example — read a file:
Read {"file_path": "src/index.ts"}
Example — find where something is defined:
Grep {"pattern": "function handleClick", "output_mode": "files_with_matches"}`;

const OVERLAYS: Record<PromptVariant, string> = { 'default': '', 'anthropic': '', 'gpt': '', 'local-small': LOCAL_SMALL };
export function variantOverlay(v: PromptVariant | undefined): string { return v ? (OVERLAYS[v] ?? '') : ''; }
```

- [ ] **Step 4: Wire into `prompt-assembly.ts`** — add `promptVariant?: PromptVariant` to `PromptInputs`, import `variantOverlay`, and add `variantOverlay(i.promptVariant)` as the LAST section (the existing `.filter(s => s !== '')` drops the empty no-op cases).

- [ ] **Step 5: Pass the variant from the host** — `toolWiring(sessionId, cwd, preset, profile)` passes `promptVariant: profile.promptVariant` into `assembleSystemPrompt`. Update both call sites in `create()`/`resume()`.

- [ ] **Step 6: Run — Expected: PASS** then `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/main/harness/prompts/variants.ts src/main/harness/prompt-assembly.ts src/main/harness/native-session-host.ts tests/prompt-assembly.test.ts
git commit -m "feat(native): prompt-variant steering overlays selected by profile (local-small only in v1)"
```

---

### Task 7: `compaction.ts` — pure prune + plan

The pure core: decide `none | prune | summarize` from real usage, and the lossless-ish prune transform.

**Files:**
- Create: `src/main/harness/compaction.ts`
- Test: `tests/compaction.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/compaction.test.ts
import { describe, it, expect } from 'vitest';
import { planCompaction, pruneToolOutputs, estimateTokens, type CompactionConfig } from '../src/main/harness/compaction';
import type { ModelMessage } from 'ai';

const cfg: CompactionConfig = { contextLength: 8192, triggerRatio: 0.75, protectedTokens: 4000, minPruneSavings: 1000, pruneToChars: 2000 };
const toolMsg = (id: string, chars: number): ModelMessage => ({ role: 'tool', content: [{ type: 'tool-result', toolCallId: id, toolName: 'Read', output: { type: 'text', value: 'x'.repeat(chars) } }] } as any);
const userMsg = (t: string): ModelMessage => ({ role: 'user', content: t } as any);

describe('planCompaction', () => {
  it('none when last-step input is under the trigger', () => {
    expect(planCompaction([userMsg('hi')], cfg, 100).action).toBe('none');
  });
  it('prune when over trigger and pruning frees enough', () => {
    expect(planCompaction([toolMsg('a', 40_000), toolMsg('b', 40_000), userMsg('r')], cfg, 7000).action).toBe('prune');
  });
  it('summarize when even pruning cannot get under budget', () => {
    const history = Array.from({ length: 20 }, (_, i) => userMsg('y'.repeat(3000) + i));
    expect(planCompaction(history, cfg, 8000).action).toBe('summarize');
  });
});

describe('pruneToolOutputs', () => {
  it('truncates tool outputs OUTSIDE the protected window; protected ones untouched', () => {
    const pruned = pruneToolOutputs([toolMsg('old', 40_000), userMsg('mid'), toolMsg('recent', 40_000)], cfg);
    expect((pruned[0] as any).content[0].output.value.length).toBeLessThanOrEqual(cfg.pruneToChars + 128);
    expect((pruned[0] as any).content[0].output.value).toContain('[pruned');
    expect((pruned[2] as any).content[0].output.value.length).toBe(40_000);
  });
  it('never truncates a non-tool message', () => {
    expect((pruneToolOutputs([userMsg('u'.repeat(40_000))], cfg)[0] as any).content).toBe('u'.repeat(40_000));
  });
});
```

- [ ] **Step 2: Run — Expected: FAIL**.

- [ ] **Step 3: Implement `compaction.ts`**

```ts
// Two-stage compaction (spec §4.4). Stage 1 PRUNE erases old tool OUTPUTS outside a
// protected recent window (nearly lossless). Stage 2 SUMMARIZE (driver-owned) runs
// only if pruning can't get under budget. PURE here: the decision + the prune
// transform. Trigger is REAL last-step input tokens, not chars/4.
import type { ModelMessage } from 'ai';

export interface CompactionConfig {
  contextLength: number; triggerRatio: number; protectedTokens: number; minPruneSavings: number; pruneToChars: number;
}
const APPROX_CHARS_PER_TOKEN = 4;
const PRUNE_TRAILER = (n: number) => `\n\n[pruned — ${n} chars of tool output elided to fit context; re-run the tool if you need it again]`;

export function estimateTokens(messages: ModelMessage[]): number {
  let chars = 0; for (const m of messages) chars += JSON.stringify((m as any).content).length;
  return Math.ceil(chars / APPROX_CHARS_PER_TOKEN);
}
function protectedFrom(messages: ModelMessage[], protectedTokens: number): number {
  let acc = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    acc += Math.ceil(JSON.stringify((messages[i] as any).content).length / APPROX_CHARS_PER_TOKEN);
    if (acc > protectedTokens) return i + 1;
  }
  return 0;
}
// Only shrinks tool-result TEXT — never drops a message, so no tool-call loses its
// paired result (pairing invariant).
export function pruneToolOutputs(messages: ModelMessage[], cfg: CompactionConfig): ModelMessage[] {
  const cutoff = protectedFrom(messages, cfg.protectedTokens);
  return messages.map((m, i) => {
    if (i >= cutoff || (m as any).role !== 'tool' || !Array.isArray((m as any).content)) return m;
    const content = (m as any).content.map((part: any) => {
      if (part?.type !== 'tool-result') return part;
      const value = part.output?.value;
      if (typeof value !== 'string' || value.length <= cfg.pruneToChars) return part;
      return { ...part, output: { ...part.output, value: value.slice(0, cfg.pruneToChars) + PRUNE_TRAILER(value.length - cfg.pruneToChars) } };
    });
    return { ...(m as any), content };
  });
}
export type CompactionAction = 'none' | 'prune' | 'summarize';
export function planCompaction(messages: ModelMessage[], cfg: CompactionConfig, lastInputTokens: number): { action: CompactionAction } {
  const used = lastInputTokens > 0 ? lastInputTokens : estimateTokens(messages);
  if (used <= cfg.contextLength * cfg.triggerRatio) return { action: 'none' };
  const before = estimateTokens(messages);
  const after = estimateTokens(pruneToolOutputs(messages, cfg));
  return before - after >= cfg.minPruneSavings ? { action: 'prune' } : { action: 'summarize' };
}
export function summarizePrompt(): string {
  return 'Summarize the conversation so far into a compact briefing that preserves: the user\'s goal, key decisions and constraints, files/commands touched and their outcomes, and any open questions. Write it as notes for yourself to continue. Do not include verbatim tool output.';
}
```

- [ ] **Step 4: Run — Expected: PASS**.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/compaction.ts tests/compaction.test.ts
git commit -m "feat(native): two-stage compaction core — pure prune + plan (spec §4.4)"
```

---

### Task 8: Integrate two-stage compaction into the driver (with fail-safe)

Run compaction between steps and at turn start, off real usage. Prune in place; if insufficient, summarize — but **fail safe**: prune the span before summarizing, and if the summary call throws/returns empty, fall through to the hard-truncation floor (`fitToContext`) rather than erroring the turn (decision 6).

**Files:**
- Modify: `src/main/harness/harness-session.ts`
- Test: `tests/harness-compaction.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness-compaction.test.ts
import { describe, it, expect } from 'vitest';
import { makeSession, scriptModel, drainTurn } from './helpers/harness-fakes';

describe('driver compaction', () => {
  it('prunes when last step reports high input tokens — no compact-summary', async () => {
    const events: any[] = [];
    const session = makeSession({
      contextLength: 8192, onEvent: (e) => events.push(e),
      model: scriptModel([
        { toolCalls: [{ name: 'Read', input: { file_path: 'big.txt' } }], usage: { inputTokens: 7000 } },
        { text: 'done' },
      ]),
    });
    await drainTurn(session, 'read the big file');
    expect(events.some((e) => e.type === 'compact-summary')).toBe(false);
    expect(events.some((e) => e.type === 'turn-complete')).toBe(true);
  });

  it('emits compact-summary and keeps working when pruning is insufficient', async () => {
    const events: any[] = [];
    const session = makeSession({
      contextLength: 4096, seedBulkHistoryTokens: 6000, onEvent: (e) => events.push(e),
      model: scriptModel([{ text: 'SUMMARY: user wants X; did Y.' }, { text: 'here is the answer' }]),
    });
    await drainTurn(session, 'continue');
    expect(events.filter((e) => e.type === 'compact-summary')).toHaveLength(1);
    expect(events.some((e) => e.type === 'turn-complete')).toBe(true);
  });

  it('FAIL-SAFE: a summary call that throws does not error the turn (falls through to truncation)', async () => {
    const events: any[] = [];
    const session = makeSession({
      contextLength: 4096, seedBulkHistoryTokens: 6000, onEvent: (e) => events.push(e),
      model: scriptModel([{ throwError: 'summary model exploded' }, { text: 'answer anyway' }]),
    });
    await drainTurn(session, 'continue');
    expect(events.some((e) => e.type === 'session-error')).toBe(false);   // turn survived
    expect(events.some((e) => e.type === 'turn-complete')).toBe(true);
  });
});
```

> Extend `harness-fakes.ts` with `onEvent`, `seedBulkHistoryTokens`, per-step `usage`, and a `throwError` step kind (Step 1a).

- [ ] **Step 2: Run — Expected: FAIL**.

- [ ] **Step 3: Add the compaction step + fail-safe to the driver**

In `harness-session.ts`:
```ts
import { planCompaction, pruneToolOutputs, summarizePrompt, estimateTokens, type CompactionConfig } from './compaction';
```
Config scaled to the model:
```ts
  private compactionConfig(): CompactionConfig {
    const ctx = this.opts.contextLength ?? 32_768;
    const big = ctx >= 100_000;
    return { contextLength: ctx, triggerRatio: 0.75, protectedTokens: big ? 40_000 : Math.floor(ctx * 0.4), minPruneSavings: big ? 20_000 : Math.floor(ctx * 0.1), pruneToChars: 2000 };
  }
```
The compaction step, fail-safe throughout:
```ts
  private async maybeCompact(model: LanguageModel, lastInputTokens: number): Promise<void> {
    const cfg = this.compactionConfig();
    const decision = planCompaction(this.history, cfg, lastInputTokens);
    if (decision.action === 'none') return;
    // Always prune first — it's nearly lossless and shrinks the summarize span too.
    this.history = pruneToolOutputs(this.history, cfg);
    if (decision.action === 'prune') return;
    // Summarize the condensed span, keeping the last 2 user-delimited turns verbatim.
    const cut = this.summarizeCutIndex();
    if (cut <= 0) return;                       // nothing safely condensable → prune already applied
    const keep = this.history.slice(cut);
    const span = this.history.slice(0, cut);    // already pruned above
    let summary = '';
    try { summary = await this.generateSummary(model, span); } catch { summary = ''; }
    if (!summary.trim()) return;                // FAIL-SAFE: no summary → leave pruned history; fitToContext is the floor
    this.emitEvent('compact-summary', { text: summary });   // existing frozen event → expandable SystemMarker
    this.history = [{ role: 'user', content: `[Earlier conversation summary]\n${summary}` } as ModelMessage, ...keep];
  }

  private summarizeCutIndex(): number {
    const userIdx: number[] = [];
    this.history.forEach((m, i) => { if ((m as any).role === 'user') userIdx.push(i); });
    return userIdx.length < 2 ? 0 : userIdx[userIdx.length - 2];
  }

  private async generateSummary(model: LanguageModel, span: ModelMessage[]): Promise<string> {
    // Bound the span so the summary call itself can't overflow: if the pruned span
    // is still huge, hard-trim its OLDEST messages before summarizing.
    const cfg = this.compactionConfig();
    let bounded = span;
    while (estimateTokens(bounded) > cfg.contextLength * 0.6 && bounded.length > 1) bounded = bounded.slice(1);
    const result = streamText({ model, system: 'You compress conversation history. Be faithful and concise.', messages: [...bounded, { role: 'user', content: summarizePrompt() } as ModelMessage], abortSignal: this.abort!.signal });
    let text = ''; for await (const part of result.textStream) text += part;
    return text.trim();
  }
```
Call at the top of the turn loop, feeding the prior step's real input tokens:
```ts
      let lastInputTokens = 0;
      turnLoop: while (true) {
        await this.maybeCompact(model, lastInputTokens);
        partialAssistantText = '';
        const step = await this.withRetry(() => this.consumeStep(model, aiTools, (t) => { partialAssistantText = t; }));
        lastInputTokens = step.usage.inputTokens;
        // …existing accumulation + interrupt + tool handling…
```

- [ ] **Step 4: Run — Expected: PASS**. Then `npx vitest run tests/harness-session-loop.test.ts` (compaction inert below trigger — unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/harness-session.ts tests/harness-compaction.test.ts tests/helpers/harness-fakes.ts
git commit -m "feat(native): two-stage compaction in the driver — prune then summarize, fail-safe (spec §4.4)"
```

---

### Task 9: `probe-tools.mjs` — constrained round-trip + real-ctx/tool report

A standalone probe (like Plan B's `probe-exa.mjs`) that fires a real tool-call at the local llama-server, verifies args are valid JSON, confirms a plain prompt is NOT force-called, AND reports the real context window + tool support per model (feeds Task 3 verification during acceptance). Dev-run, engine-bump gated.

**Files:**
- Create: `test-engine/probe-tools.mjs`
- Modify: `youcoded/docs/engine-dependencies.md`

- [ ] **Step 1: Write the probe**

```js
// test-engine/probe-tools.mjs — constrained tool-call round-trip + capability
// report against a live llama-server (spec §4.2/§4.1). NOT a unit test: run against
// a running engine to (a) confirm --jinja tool-calling emits schema-valid JSON args,
// (b) confirm a plain prompt still answers WITHOUT a forced tool call, and (c) report
// the real loaded context window (/props) — the ground truth Task 3's registry is
// checked against.  Usage: node test-engine/probe-tools.mjs http://127.0.0.1:<port> <model-id>
const [base, model] = process.argv.slice(2);
if (!base || !model) { console.error('usage: probe-tools.mjs <baseURL> <modelId>'); process.exit(2); }
const READ_TOOL = { type: 'function', function: { name: 'Read', description: 'Read a file from disk.', parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] } } };
async function chat(body) {
  const res = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, ...body }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
(async () => {
  try { const props = await (await fetch(`${base}/props`)).json(); console.log('ctx  loaded n_ctx =', props?.default_generation_settings?.n_ctx ?? props?.n_ctx ?? '(field not found — check the pinned build)'); } catch { console.log('ctx  /props unavailable'); }
  const toolResp = await chat({ messages: [{ role: 'user', content: 'Read the file at src/index.ts using the Read tool.' }], tools: [READ_TOOL], tool_choice: 'auto', parallel_tool_calls: false });
  const call = toolResp.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('FAIL: no tool_call emitted for a tool-y prompt (this model may not support tool calling)');
  let args; try { args = JSON.parse(call.function.arguments); } catch { throw new Error(`FAIL: tool args not valid JSON: ${call.function.arguments}`); }
  if (typeof args.file_path !== 'string') throw new Error(`FAIL: args missing file_path: ${JSON.stringify(args)}`);
  console.log('OK   tool-call args are schema-valid JSON:', JSON.stringify(args));
  const textResp = await chat({ messages: [{ role: 'user', content: 'In one sentence, what is 2+2?' }], tools: [READ_TOOL], tool_choice: 'auto', parallel_tool_calls: false });
  if (textResp.choices?.[0]?.message?.tool_calls?.length) throw new Error('FAIL: forced a tool call on a plain-text prompt (never-force invariant)');
  console.log('OK   plain prompt answered without a tool call');
  console.log(`\nPASS  ${model} @ ${base} — constrained tool-calling verified.`);
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
```

- [ ] **Step 2: engine-dependencies row** — document the coupling: llama-server `--jinja` native tool-calling + `parallel_tool_calls:false`; the `/props` context read (confirm the field per pinned build); verified by `test-engine/probe-tools.mjs`; engine-bump gated.

- [ ] **Step 3: Smoke-check** — `node --check test-engine/probe-tools.mjs` → exit 0. Live run is Task 16.

- [ ] **Step 4: Commit**

```bash
git add test-engine/probe-tools.mjs docs/engine-dependencies.md
git commit -m "test(engine): probe-tools.mjs — constrained round-trip + real-ctx/tool report (spec §4.2)"
```

---

### Task 10: Simplified schema presentation + serial-only constraint

Apply the profile's presentation levers: compact tool descriptions for `simplified` models, and `parallel_tool_calls:false` via `transformRequestBody` on the local-engine model when serial-only.

**Files:**
- Modify: `src/main/harness/harness-session.ts` (`buildAiTools` reads presentation), `src/main/harness/tools/types.ts` (+`shortDescription`), the three rich tools (WebSearch/WebFetch/AskUserQuestion — add `shortDescription`)
- Modify: `src/main/providers/provider-registry.ts` (`languageModel(binding, opts?)`)
- Modify: `src/main/harness/native-session-host.ts` / factory threading, `src/main/ipc-handlers.ts`
- Test: `tests/harness-tool-presentation.test.ts`, extend `tests/provider-registry.test.ts`

- [ ] **Step 1: Write the failing presentation test**

```ts
// tests/harness-tool-presentation.test.ts
import { describe, it, expect } from 'vitest';
import { makeSession } from './helpers/harness-fakes';
import { CLOUD_DEFAULT } from '../src/main/harness/capability-profile';

describe('simplified tool presentation', () => {
  it('simplified profile hands the model compact descriptions; all ten tools stay present', () => {
    const s = makeSession({ profile: { ...CLOUD_DEFAULT, maxToolPresentation: 'simplified' } });
    const t = (s as any).buildAiTools();
    expect(Object.keys(t)).toContain('WebSearch');
    expect((t.WebSearch.description as string).length).toBeLessThan(200);
  });
  it('full profile keeps rich descriptions and all ten tools', () => {
    expect(Object.keys((makeSession({ profile: CLOUD_DEFAULT }) as any).buildAiTools())).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run — Expected: FAIL**.

- [ ] **Step 3: `shortDescription` on `NativeTool` + profile-aware `buildAiTools`**

`tools/types.ts`: add `shortDescription?: string;` to `NativeTool`. Populate it on WebSearch/WebFetch/AskUserQuestion (a one-line version of each). Then:
```ts
  private buildAiTools(): Record<string, any> {
    if (!this.profile.supportsTools) return {};
    const simplified = this.profile.maxToolPresentation === 'simplified';
    const out: Record<string, any> = {};
    for (const t of this.toolByName.values()) {
      out[t.name] = tool({ description: simplified ? (t.shortDescription ?? t.description) : t.description, inputSchema: zodSchema(t.inputSchema) });
    }
    return out;
  }
```
> Schema FLATTENING beyond descriptions (AskUser → single `{question, options}`) is deferred pending the probe showing small models still fail on the full input schema — `shortDescription` + `--jinja` grammar is the v1 delivery. Record in the task review.

- [ ] **Step 4: Write the failing constraint test + implement**

Extend `tests/provider-registry.test.ts`:
```ts
it('local-engine languageModel injects parallel_tool_calls:false when serial-only', async () => {
  const reg = makeRegistryWithFakeEngine();
  const model = await reg.languageModel({ providerId: 'local', modelId: 'm' }, { serialToolCalls: true });
  expect((model as any).config.transformRequestBody({ messages: [] }).parallel_tool_calls).toBe(false);
});
```
In `provider-registry.ts`:
```ts
  async languageModel(binding: ModelBinding, opts?: { serialToolCalls?: boolean }): Promise<LanguageModel> {
    // …local-engine branch:
        return createOpenAICompatible({
          name: 'local', baseURL: base, fetch: this.localEngine.fetchImpl(),
          // Serial-only for small local models (spec §4.2): llama-server honors
          // parallel_tool_calls:false; --jinja already grammar-constrains the args.
          // NEVER a top-level json_schema — that would force JSON on every reply.
          ...(opts?.serialToolCalls ? { transformRequestBody: (b: Record<string, any>) => ({ ...b, parallel_tool_calls: false }) } : {}),
        })(binding.modelId);
    // …cloud branches ignore opts…
  }
```

- [ ] **Step 5: Thread the opt from the factory** — widen `ModelFactory` to `(binding, opts?: { serialToolCalls?: boolean })`, call it in the driver with `{ serialToolCalls: this.profile.constrainToolArgs && !this.profile.supportsParallelToolCalls }`, and widen the injected factory in ipc-handlers to `(binding, opts) => providerRegistry.languageModel(binding, opts)`.

- [ ] **Step 6: Run — Expected: PASS** (`npx vitest run tests/harness-tool-presentation.test.ts tests/provider-registry.test.ts`) then `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/main/harness/harness-session.ts src/main/harness/tools/types.ts src/main/harness/tools/web-search.ts src/main/harness/tools/web-fetch.ts src/main/harness/tools/ask-user-question.ts src/main/providers/provider-registry.ts src/main/ipc-handlers.ts tests/harness-tool-presentation.test.ts tests/provider-registry.test.ts
git commit -m "feat(native): profile-driven simplified presentation + serial-only constraint on local models (spec §4.2)"
```

---

### Task 11: `native:usage-report` IPC channel (5-surface parity)

Renderer→main fire-and-forget that caches per-session native usage in main, mirroring `remote:attention-changed` (decision 7).

**Files:**
- Modify: `src/shared/types.ts`, `src/main/preload.ts`, `src/renderer/remote-shim.ts`, `app/.../SessionService.kt`, `src/main/ipc-handlers.ts`
- Test: extend `tests/ipc-channels.test.ts`

- [ ] **Step 1: Extend the failing parity test**

```ts
it('native:usage-report has full surface parity', () => {
  expect(preloadChannels).toContain('native:usage-report');
  expect(remoteShimShape).toContain('reportUsage');
  expect(sessionServiceTypes).toContain('native:usage-report');
});
```

- [ ] **Step 2: Run — Expected: FAIL**.

- [ ] **Step 3: Add the const + surfaces** — `src/shared/types.ts`: `export const NATIVE_USAGE_REPORT = 'native:usage-report';`. `preload.ts` under `window.claude.native`: `reportUsage: (payload) => ipcRenderer.send('native:usage-report', payload),`. `remote-shim.ts`: `reportUsage: (payload) => fire('native:usage-report', payload),`. `SessionService.kt`: inert `when` case (Android native runtime is Phase 5).

- [ ] **Step 4: Main-side cache + listener + buildStatusData fold**

Beside `lastAttentionBySession`:
```ts
  const lastNativeUsageBySession = new Map<string, any>();
```
Listener beside `remote:attention-changed`:
```ts
  ipcMain.on('native:usage-report', (_e, payload: { sessionId: string; usage: any }) => {
    if (!payload?.sessionId) return;
    lastNativeUsageBySession.set(payload.sessionId, payload.usage);
    if (remoteServer) remoteServer.broadcastStatusData(buildStatusData());
  });
```
Fold into `buildStatusData`'s return: build `nativeUsageMap` from the map, add it to the returned object. Delete the entry in the session-destroy cleanup (~line 2263): `lastNativeUsageBySession.delete(sessionId);`.

- [ ] **Step 5: Run — Expected: PASS** then `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/preload.ts src/renderer/remote-shim.ts app/src/main/kotlin/*/runtime/SessionService.kt src/main/ipc-handlers.ts tests/ipc-channels.test.ts
git commit -m "feat(native): native:usage-report IPC (5-surface parity) — per-session usage cached in main (spec §4.5)"
```

---

### Task 12: StatusBar chips from native usage (turn-end, real-ctx-driven)

Fire `reportUsage` on native `turn-complete` and render context/tokens/speed chips (incl. native tokens/sec) from the same data. Context % uses the **real** context window (Task 4).

**Files:**
- Modify: the native turn-complete reducer/effect, `src/renderer/components/StatusBar.tsx`
- Test: `tests/statusbar-native-usage.test.ts`

- [ ] **Step 1: Locate the usage source** — read `StatusBar.tsx` + the chat reducer to find the existing context/tokens/speed chip path (`usage` in `status:data` today = CC `.usage-cache.json`). Native per-turn usage arrives via `turn-complete` `data.usage` (`inputTokens`/`outputTokens`/`tokensPerSecond`).

- [ ] **Step 2: Write the failing test**

```ts
// tests/statusbar-native-usage.test.ts
import { describe, it, expect } from 'vitest';
import { selectNativeStatusChips } from '../src/renderer/components/StatusBar';

describe('native StatusBar chips', () => {
  it('derives context %, total tokens, tokens/sec from a native turn-complete usage payload', () => {
    const chips = selectNativeStatusChips({ inputTokens: 6000, outputTokens: 400, tokensPerSecond: 42 }, 8192);
    expect(chips.contextPct).toBe(22);
    expect(chips.tokensPerSecond).toBe(42);
    expect(chips.totalTokens).toBe(6400);
  });
  it('null when there is no native usage yet (CC/idle sessions unaffected)', () => {
    expect(selectNativeStatusChips(undefined, 8192)).toBeNull();
  });
});
```

- [ ] **Step 3: Run — Expected: FAIL**.

- [ ] **Step 4: Implement the selector + wire the emit + render** — add exported pure `selectNativeStatusChips(usage, contextLength)` to `StatusBar.tsx`; render its chips when the active session is native and it returns non-null. In the native `turn-complete` handler: `window.claude.native?.reportUsage?.({ sessionId, usage });`. Context length comes from the same real number Task 4 exposes (thread the session's `contextLength` to the renderer if not already present, or read it from the native session info).

> v1 limitation (decision 7): chips update at turn END. During a long agentic turn the context chip lags until the turn completes. Note in the task review; mid-turn liveness is a follow-up.

- [ ] **Step 5: Run — Expected: PASS** then `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/state/*.ts src/renderer/App.tsx tests/statusbar-native-usage.test.ts
git commit -m "feat(native): StatusBar context/tokens/speed chips from native turn-complete usage (spec §4.5)"
```

---

### Task 13: Hardening pins — interrupt-during-Bash + model-swap-mid-turn

Pin the two invariants spec §4.5 calls out. Regression guards, not new behavior.

**Files:** `tests/harness-hardening.test.ts` (+ `src/main/harness/tools/bash.ts` only if a fix is needed)

- [ ] **Step 1: Write the pinning tests**

```ts
// tests/harness-hardening.test.ts
import { describe, it, expect } from 'vitest';
import { makeSession, scriptModel, drainTurn } from './helpers/harness-fakes';
import { CLOUD_DEFAULT } from '../src/main/harness/capability-profile';

describe('interrupt during a running Bash tool', () => {
  it('ESC mid-Bash back-fills a canceled tool-result (no dangling call) + emits user-interrupt', async () => {
    const session = makeSession({ model: scriptModel([{ toolCalls: [{ name: 'Bash', input: { command: 'sleep 30' } }] }]) });
    const turn = drainTurn(session, 'run it');
    setTimeout(() => session.interrupt(), 10);
    await turn;
    const lastTool = [...(session as any).history].reverse().find((m: any) => m.role === 'tool');
    expect(lastTool.content.every((p: any) => p.type === 'tool-result')).toBe(true);
  });
});

describe('model swap re-resolves the profile for the NEXT turn', () => {
  it('a swap to a small local binding tightens the doom-loop threshold', () => {
    const session = makeSession({});
    session.setBinding({ providerId: 'local', modelId: 'small' }, 8192, { ...CLOUD_DEFAULT, maxToolPresentation: 'simplified', promptVariant: 'local-small', doomLoopThreshold: 2, supportsParallelToolCalls: false, constrainToolArgs: true });
    expect((session as any).profile.doomLoopThreshold).toBe(2);
  });
});
```

- [ ] **Step 2: Run — Expected: PASS**. If interrupt-during-Bash reveals the child isn't killed on abort, fix `bash.ts` to kill on `ctx.signal` abort (WHY comment) and re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/harness-hardening.test.ts src/main/harness/tools/bash.ts
git commit -m "test(native): pin interrupt-during-Bash + model-swap profile re-resolution (spec §4.5)"
```

---

### Task 14: Full-suite green + tsc + self-review gate

- [ ] **Step 1: Full suite + tsc** — `npm test 2>&1 | tail -8` (all pass, count = Plan B baseline + new Plan C tests, 0 failed) then `npx tsc --noEmit` (exit 0).
- [ ] **Step 2: Spec §4 coverage self-check** — 4.1→T2/T3/T4/T5, 4.2→T9/T10, 4.3→T6, 4.4→T7/T8, 4.5→T11/T12/T13. Note any gap; open a task before proceeding.
- [ ] **Step 3:** `git commit -am "test(native): Plan C suite green — spec §4 coverage verified" || echo "nothing to commit"`

---

### Task 15: Documentation obligations (spec §7)

**Files:** `youcoded/docs/provider-dependencies.md`, `youcoded/docs/engine-dependencies.md` (confirm T9 row complete), `youcoded-dev/.claude/rules/native-runtime.md`, `youcoded-dev/docs/PITFALLS.md`, `youcoded-dev/ROADMAP.md`

- [ ] **Step 1: provider-dependencies row** — `@ai-sdk/openai-compatible@3.0.7` `transformRequestBody` used to inject `parallel_tool_calls:false`; coupling breaks if the openai-compatible config API changes.
- [ ] **Step 2: native-runtime rule — add a "Native local reliability (Plan C)" section** with the load-bearing invariants + guards:
  - CapabilityProfile is resolved in THREE layers (discovered ctx + probed tools → curated registry → fallback); NEVER branches on model name except the registry matcher; tools removed only when `supportsTools:false`. Guards: `capability-profile.test.ts`, `known-models.test.ts`.
  - Real context window = `min(GGUF trained, llama-server /props loaded)`; the SAME number drives profile + compaction + StatusBar. Guard: `engine-context-window.test.ts`.
  - Constrained decoding = `--jinja` grammar + `parallel_tool_calls:false`; NEVER a top-level `json_schema`. Guards: `probe-tools.mjs`, `provider-registry.test.ts`.
  - Compaction prunes tool OUTPUTS (never drops a message → pairing intact), summarizes only when prune is insufficient, FAILS SAFE (empty/thrown summary → truncation floor), emits the EXISTING `compact-summary`. Guards: `compaction.test.ts`, `harness-compaction.test.ts`.
  - `native:usage-report` is a STATUS channel cached in main, NOT a transcript event type. Guard: `ipc-channels.test.ts`.
- [ ] **Step 3: PITFALLS** — compaction must never split a tool-call/result pair; profile resolution must not branch on model name; local context window is read+enforced, never the catalog guess.
- [ ] **Step 4: ROADMAP** — flip `StatusBar usage chips` (line 53) to done; add the Plan C progress line. (Workspace repo — commit to `youcoded-dev`.)
- [ ] **Step 5: Commit (two repos)**

```bash
# youcoded worktree:
git add docs/provider-dependencies.md docs/engine-dependencies.md
git commit -m "docs(native): Plan C provider/engine coupling rows"
# youcoded-dev workspace (separate checkout — cd out of the worktree):
cd /c/Users/desti/youcoded-dev
git add .claude/rules/native-runtime.md docs/PITFALLS.md ROADMAP.md
git commit -m "docs(native): Plan C invariants + rule section; flip StatusBar usage-chips roadmap item"
```

---

### Task 16: Live acceptance on the Linux device (model-agnostic exit test)

Spec §5 Plan C acceptance, retargeted per decision 1. Runs on Destin's Linux machine against its local llama-server, across the model range on hand.

**Environment:** YouCoded dev build on Linux, `YOUCODED_NATIVE=1`, pointed at the local llama-server. Models: gemma e2b, qwen 9b, 3.6 35b moe, 3.5 122b (confirm exact IDs + windows first).

- [ ] **Step 1: Confirm model IDs + windows; run the probe per model** — `node test-engine/probe-tools.mjs http://127.0.0.1:<port> <model-id>` for each → Expected: `PASS` + a real `n_ctx` line. **Cross-check against `known-models.ts`:** the registry regexes must match Destin's actual model ids, and the probed `n_ctx`/tool result must agree with the registry's `maxContextWindow`/`supportsTools`. Fix any mismatch in `known-models.ts` (commit as a Task 3 follow-up).
- [ ] **Step 2: Exit test — the Plan A bug-fix task on the designated local model** — in a native Coder session, run "fix this bug" against `scratch-native-accept/` (kept from Plan B). Verify tool cards, diffs, approvals render and the model completes the fix.
- [ ] **Step 3: StatusBar chips live** — context %, tokens, tokens/sec update at turn end.
- [ ] **Step 4: Survives a compaction** — drive the session past the trigger (or use a small-context model); confirm a `compact-summary` SystemMarker appears AND the session keeps working (next turn gives a coherent reply). Also exercise the fail-safe: if a small model's summary is garbage, the turn must still complete.
- [ ] **Step 5: Android releaseTest render check** — `assembleReleaseTest`; confirm bridge-delivered tool cards/approvals render identically (native runtime inert on Android — this checks the shared UI).
- [ ] **Step 6: Record results** — update the plan's SHIPPED note with pass/fail per model + any registry corrections + any tier needing the deferred schema-flattening follow-up.

---

## Self-review (run after drafting, before execution)

**Spec §4 coverage:** 4.1 (profiles) → T2 (three-layer resolver) + T3 (registry data) + T4 (real ctx) + T5 (threading); 4.2 (constrained decoding + probe) → T9/T10; 4.3 (prompt variants) → T6; 4.4 (two-stage compaction) → T7/T8; 4.5 (StatusBar bridge + hardening) → T11/T12/T13. §5 testing → per-task vitest + T9 probe + T16 live. §7 docs → T15. ✓

**Destin's design asks (2026-07-16) covered:** robust profiles for known models (T2 registry overlay + T3 population), fallback for unknown (T2 Layer 3), "do they support tool calling?" (probed T9 + registry `supportsTools` T3), "true max context + enforce it" (T4 min-of-loaded-and-trained), MoE-vs-dense distinction the window heuristic missed (T2 registry, tested). ✓

**Deferrals recorded (not gaps):** (a) schema FLATTENING beyond `shortDescription` deferred pending probe evidence (T10); (b) remote-refresh of the known-model registry folds into the roadmapped "Richer model metadata + selection UX" feature (decision 4), not Plan C; (c) mid-turn StatusBar liveness deferred (decision 7); (d) cloud prompt-variant content deferred — four-way hook kept, only local-small filled (decision 10); (e) exact local model IDs confirmed in T16 (decision 1); (f) Android native runtime stays Phase 5 — T11 ships an inert Kotlin stub only.

**Cross-task type consistency:** `CapabilityProfile` fields (incl. `supportsTools`) used identically in T5/T6/T10/T13; `DiscoveredModel`/`KnownModelEntry` shapes match T2↔T3↔T5; `ModelFactory`'s new `opts?: {serialToolCalls?}` matches `languageModel`'s second arg (T10); the real-ctx number from T4 is the single input to profile tiering, compaction config, and the StatusBar selector (T8/T12); `native:usage-report` string identical across T11's five surfaces + T12's emit.
