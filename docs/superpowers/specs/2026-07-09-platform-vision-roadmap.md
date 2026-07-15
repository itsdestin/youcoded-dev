# YouCoded Platform Vision — Multi-Model Backends, Custom Harnesses, Agents & Automations

**Date:** 2026-07-09
**Status:** Vision roadmap — reviewed and approved by Destin 2026-07-09 (revisions: engine hybrid framing, conventions inversion §3.4a, leaked-source ideas-only policy; phase ordering confirmed as written). Each phase gets its own spec → plan → implementation cycle.
**Progress:** **Phase 0 COMPLETE 2026-07-10** (youcoded PR #115, master `29ca27a0`). **Phase 1 Plan A (provider layer + native chat sessions) COMPLETE, in review 2026-07-13** — youcoded PR #119 (`feat/native-sessions`, 27 commits, 1551 tests green, boot-verified, dormant behind `native.supported`). Delivers `~/.youcoded/` home + safeStorage keys, ProviderRegistry + `languageModel(binding)` + ModelCatalog, HarnessSession v0 (AI SDK v7 streamText, no tools) → transcript-events, NativeSessionHost + SessionManager native branch + 10 IPC channels, reducer partId-merge + error banner, provider-aware send routing, runtime selector + binding picker, Providers settings panel, Resume Browser native rows. Known follow-up: StatusBar usage *chips* aren't fed for native (per-turn metadata strip is) — small renderer-usage→statusData bridge, candidate for Phase 2. **Phase 1 Plan B (local engine — EngineSupervisor + llama-server) COMPLETE, merged 2026-07-13** — youcoded master `b5c30d01` (13 commits, 1771 tests green, empirically verified end-to-end against `llama-server` b9992: `--models-dir` discovery, `/models` schema, streamed chat). Delivers `desktop/src/main/engine/` (pin+acquisition+supervisor+manager), the `LocalEngineHook` wired into ProviderRegistry/ModelCatalog, the `engine:*` IPC surface (+ Android stubs), a minimal EngineCard in Settings → Providers, and `desktop/test-engine/` smoke probes + `engine-dependencies.md`. Bring-your-own-GGUF only (the `-hf` downloader is Plan C). Deferred robustness follow-ups (all flag-gated): non-atomic Windows finalDir swap, config-write-failure-after-fallback window, `trackedFetch` leak if a body is never read — see the branch's final-review notes. **Phase 1 Plan C (model manager — download UI + Local Models panel) COMPLETE, merged 2026-07-14** — youcoded master `6cbf1ee8` (11 commits, model+parity + full suite green, code-reviewed READY-TO-MERGE with the one important finding fixed). Delivers `desktop/src/main/models/` (quant-parser, GPU-aware fit-estimator + gpu-detector, curated-catalog + raw-GitHub refresh, hf-client, resumable multi-part downloader, endpoint-detectors, model-manager), the `models:*`/`engine:set-backend`/`engine:set-context` IPC surface (+ Android stubs + remote wiring), `EngineManager.setBackend/installedModels/deleteModel/setContext`, and the Settings → Local Models panel (curated recommendations, installed models, HF search, Ollama/LM Studio detectors, backend + context controls). Multi-part router-id contract empirically verified via `probe-download.mjs` on b9992. Curated list CONFIRMED (11 unsloth models, 3 tiers). Live-acceptance pass (real download → offline chat, K2 router hot-reload) still owed on a dev machine. **Phase 1 backend is now complete.** Next before user-facing: **native-harness tools** (tool-calling on the native runtime), **flip `native.supported`**, and the **Android native runtime** — all out of Plan C scope.
**Inputs:** repo audit of master + `feat/opencode-mvp`, `cc-dependencies.md` coupling inventory, mid-2026 market research (web, cited), llama.cpp/provider-layer technical research (web, cited).

---

## 0. The vision, restated

YouCoded becomes a **comprehensive AI-agent management platform** that can run on any model backend:

- **Local-first default:** llama.cpp integrated directly into YouCoded (no Ollama dependency). Ollama, LM Studio, etc. remain *optional* endpoints.
- **Cloud providers:** OpenRouter + direct API keys (Anthropic, OpenAI, Google) behind one provider layer.
- **Claude Code becomes one integration among several** — the polished "premium backend," not the app's identity.
- **A first-party agent harness** (actually a family of harnesses: default presets + user-built custom ones) that drives the existing chat UI: bubbles, streaming, tool cards, permissions, artifacts, projects.
- **A new "Agents & Automations" view** — sibling to the Projects view — where users create agents that run on schedules/triggers and report back through an inbox.
- Long-term feature envelope: the union of Claude Code, Cursor, Claude web/Cowork, Claude Tag, OpenClaw/Hermes, opencode, LM Studio — natively built in, accessible to non-developers.

---

## 1. Where YouCoded stands today (July 2026)

### 1.1 Shipped feature surface

Provider-agnostic already (these carry over to any backend for free):
terminal view (xterm), session strip/multi-session, themes + effects + wallpapers + theme marketplace, multiplayer games, sync/backup (+ in-flight sync spaces #107), remote access (same React app over WS), accounts/friends/presence (Phase 1 shipped, Phase 2 in flight), announcements, updates/in-app installer, analytics, buddy window, status bar framework, Linux/Windows/macOS/Android.

Claude-coupled today:
chat view + tool cards (fed by CC transcript JSONL), resume browser, Projects view + artifact viewer (CC project-slug + tool events), skills/marketplace install (CC plugin registries), command drawer (CC built-ins), model picker/permission modes, attention classifier, first-run installer, dev issue reporting (`claude -p`).

### 1.2 The load-bearing seam

The internal contract is already clean: **any backend that emits the 8 `transcript-event` types** (`user-message`, `assistant-text`, `tool-use`, `tool-result`, `assistant-thinking`, `turn-complete`, `user-interrupt`, `compact-summary`) with the documented payload fields gets the entire chat experience — streaming bubbles, tool cards, turn metadata, usage, dedup — **with zero reducer/UI changes**. This was proven twice: by the CC transcript watcher and by the opencode adapter.

### 1.3 The `feat/opencode-mvp` branch — what exists, what to keep

The MVP was fully built (25 commits, unmerged, mid-May 2026): `OpenCodeService` daemon, a 30 KB SSE→transcript-event adapter, `OllamaDetector`, config writer, `LocalSetupModal`, three-way Runtime selector in SessionStrip, runtime-aware gating (HeaderBar chat-toggle/permission-badge, ModelPickerPopup scoping, attention-classifier short-circuit), local ResumeBrowser tab, reasoning UI, model compare tab, `oc-dependencies.md`.

**Verdict: mine it, don't merge it.** What was disliked — the OpenCode daemon dependency and the Ollama coupling — is exactly the part to discard. What's directly reusable, largely independent of OpenCode:

| Salvage | Why |
|---|---|
| Runtime-aware UI commits (`338e6189` etc.): SessionStrip runtime selector, HeaderBar gates, classifier gating, ModelPicker scoping | Needed identically for the native harness; UI-only |
| `SessionProvider = 'local'` type extension + IPC channel reservations | Same seam |
| Adapter's event-translation patterns (streaming deltas → assistant-text, tool state machine → tool-use/result, reasoning routing, resume hydration fetch-then-subscribe, seen-uuid dedup) | The translation problems recur 1:1 in a native harness; the solutions are provider-independent |
| Collapsible reasoning UI, thinking-effort dropdown, model info/compare popups | Pure renderer features |
| The deferred sibling plan `2026-05-04-vercel-ai-sdk-harness-roadmap.md` (LocalSessionStore, harness skeleton, SessionManager delegation) | It IS the native-harness starting point — written for AI SDK v4; update to v6/v7 |
| `oc-dependencies.md` discipline | Becomes `engine-dependencies.md` for llama.cpp coupling |

Discard: `OpenCodeService`, `opencode-config-writer`, `@opencode-ai/sdk` dep, Ollama-as-required. Keep `OllamaDetector` only as a later *optional-endpoint* detector.

### 1.4 The 33 Claude couplings, clustered

`cc-dependencies.md` documents 33 touchpoints. They cluster into six groups, and the crucial observation is that **most exist only because Claude Code is an external TUI process**:

1. **Transcript JSONL parsing** — native harness emits events directly; not applicable.
2. **PTY/TUI behaviors** (spinner regex, 64-byte paste threshold, echo-driven submit, permission banner strings, Ink menus) — no PTY, not applicable.
3. **Hooks/permission relay** — native harness dispatches `PERMISSION_REQUEST` in-process; simpler.
4. **Plugin/skill/MCP registries** — *shareable conventions*: the native harness should READ the same `~/.claude`-adjacent skill/MCP formats so the marketplace works across backends (see §3.4).
5. **Installer/CLI flags** — replaced by engine download/manage flows.
6. **Project-layout conventions** (CLAUDE.md, project slugs, memory) — *shareable*: the existing `context-discovery.ts` already parses them; the harness consumes it.

So "de-Claude-ing" the app is not 33 refactors — it's one native backend that skips clusters 1–2, simplifies 3 and 5, and deliberately shares 4 and 6.

### 1.5 Open/recent work to sequence around

- `feat/sync-spaces` (#107, open) and `feat/sync-import` — cross-device sync foundation.
- `feat/accounts-phase2` (client) — social layer; worker side merged (wecoded-marketplace #20).
- Artifact viewer / Project View redesign — merged; Android compile fixed (#108).
- youcoded-core deprecation in progress.

The multi-model work is largely orthogonal (main-process services + renderer session components), but Phase 4's Agents view will want accounts (sharing automations) and sync (agent configs across devices) to be settled.

---

## 2. Market position (mid-2026)

### 2.1 What the market now considers table stakes

From the landscape research (Claude Code/Cowork/Tag, Cursor 3, Codex/ChatGPT Work, Antigravity, opencode, OpenClaw/Hermes, LM Studio/Ollama/Jan/Open WebUI):

- **Commoditized in coding tools:** agent mode, multi-file edits, MCP, checkpoints, background/cloud agents delivering PRs, AGENTS.md-style rules, subagents.
- **Commoditized in assistant apps:** memory, project containers, artifacts/deliverables, connectors (MCP), scheduled/recurring tasks, approval controls.
- **Agent-platform table stakes** (OpenClaw/Hermes/Routines/Cowork consensus): scheduled + triggered agents, an approval/needs-input inbox, persistent memory, skills-as-extension-unit with a marketplace (now with security scanning), multi-agent orchestration, multi-channel reach.
- **Local-frontend table stakes:** model download with VRAM-fit guidance, quant selection, OpenAI-compat server, MCP/tools on local models, hybrid local/cloud routing.
- **The mid-2026 battlegrounds:** orchestration scale, scheduling/triggers, trust/approval UX, compounding memory, skill security.

### 2.2 Feature matrix — YouCoded vs the field

| Capability | YouCoded today | Market leaders | Gap for the vision |
|---|---|---|---|
| Agentic coding chat UI | ✅ (via CC) | CC, Cursor, opencode | Make backend-agnostic |
| Multi-model / provider freedom | ❌ (CC + bare-PTY Gemini) | opencode (75+), Cline, OpenRouter apps | **Core gap — Phases 1–2** |
| Local models | ❌ (unmerged branch) | LM Studio, Ollama, Jan, opencode | **Core gap — Phase 1** |
| Scheduled/triggered agents | ❌ | CC Routines, OpenClaw cron, ChatGPT Work, Antigravity | **Core gap — Phase 4** |
| Approval inbox / agent mission control | Partial (attention states, open-tasks chip) | Cursor Agents Window, Antigravity, Cowork | Phase 4 |
| Skills marketplace | ✅ (WeCoded — a real differentiator) | CC plugins, ClawHub | Extend to non-CC backends (Phase 3) |
| Themes/personalization | ✅ best-in-class | nobody close | Keep investing |
| Social (friends, sharing, games, presence) | ✅ unique | Claude Tag (teams angle) | Keep investing |
| Projects/artifacts | ✅ | Claude Projects, Cowork deliverables | Backend-agnostic wiring (Phase 3) |
| Cross-device (desktop+Android+remote) | ✅ rare | LM Link, Ollama cloud | LAN model serving (Phase 5) |
| Memory | Partial (encyclopedia plugin) | Hermes compounding memory, Tag org memory | Later differentiator |
| Non-developer accessibility | ✅ core identity | Cowork/ChatGPT Work are the rivals | The niche: **open, personal Cowork** |

**Strategic read:** nobody currently combines (a) local-first multi-model, (b) a friendly non-developer UI, (c) a social/marketplace layer, and (d) agent automations in one consumer app. Cowork/ChatGPT Work own "agentic assistant for normal people" but are closed + cloud-only + single-vendor. OpenClaw/Hermes own "own your agent" but are developer-hostile to set up. That intersection is YouCoded's lane.

---

## 3. Target architecture

Three new layers, stacked under the existing UI:

```
┌────────────────────────────────────────────────────────────┐
│  Existing React UI (chat, tool cards, projects, artifacts) │
│  + NEW Agents & Automations view                           │
├────────────────────────────────────────────────────────────┤
│  transcript-event protocol (unchanged, already proven)     │
├──────────────┬─────────────────────────┬───────────────────┤
│ CC session   │  NATIVE HARNESS LAYER   │ (future: other    │
│ (PTY+watcher │  presets + custom       │  CLI adapters)    │
│  — as today) │  harnesses, tools,      │                   │
│              │  permissions, skills    │                   │
├──────────────┴─────────────────────────┴───────────────────┤
│  PROVIDER LAYER (Vercel AI SDK v6/v7)                      │
│  local llama.cpp │ OpenRouter │ Anthropic │ OpenAI │ Google│
│  │ Ollama/LM Studio (optional endpoints)                   │
├────────────────────────────────────────────────────────────┤
│  LOCAL ENGINE: supervised llama-server (router mode)       │
│  GGUF model manager (HF downloads, quant/VRAM-fit UX)      │
└────────────────────────────────────────────────────────────┘
```

### 3.1 Local Engine — llama.cpp direct, exactly as you want it

The technical research strongly validates skipping Ollama:

- **llama-server "router mode"** (Dec 2025+) is Ollama's whole value prop, natively: spawn one server with no model; it auto-discovers GGUFs in the llama.cpp cache, hot-loads on first request, keeps N loaded with LRU eviction, and runs each model in its own subprocess (crash isolation). Endpoints: `/models`, `/models/load`, `/models/unload`.
- **Built-in HF downloading** (`-hf user/repo:Q4_K_M`) into a standard cache the router auto-discovers.
- **OpenAI-compatible tool calling** with native chat-template handling (`--jinja`) for Qwen/Llama/Hermes/DeepSeek/etc., plus **grammar-constrained JSON** (`json_schema`) — measured to lift small-model tool-call accuracy from ~50% to ~78%. This is what makes local *agentic* use viable.
- Also free: parallel slots, speculative decoding, multimodal (libmtmd), embeddings.

**Decision (confirmed 2026-07-09): subprocess `llama-server` is the backbone; `node-llama-cpp` is reserved for narrow in-process niches.** Rationale for the server: crash isolation (a segfaulting native module in Electron main kills the whole app — and router mode further isolates each model in its own subprocess), engine updates decoupled from app releases (Jan's pattern), the API is OpenAI-compat so the provider layer treats local exactly like cloud, and — decisive — **the same binary + protocol runs on Android and over LAN** under the existing Termux runtime. `node-llama-cpp` (v3.19, excellent) keeps the nicer in-process function-calling API and memory-fit estimation code (a reference for the download UX regardless); if we later want token-level UX or instant tiny-model utility features (local title generation, autocomplete-class features, embeddings without a server round-trip), adopt it for those narrow uses. The provider layer hides which engine is underneath, so this is reversible and additive — the default agentic path stays on the server.

Packaging: ship CPU + Vulkan (+ Metal on macOS) engine binaries (~100 MB), offer the CUDA backend as an opt-in post-install download (~373 MB cudart on Windows) — the LM Studio/Jan pattern. Supervise the server the same way `pty-worker`/OpenCodeService were supervised: free-port spawn, health polling, crash restart, `engine-dependencies.md` coupling registry.

Model UX ladder (defaults, revisit quarterly):

| Tier | Default | Role |
|---|---|---|
| Phone on-device | Qwen3 1.7B–4B Q4 | chat/summarize/offline mode |
| 8 GB laptop | Qwen3 4B–8B Q4_K_M | assistant harnesses |
| 16 GB / 12 GB VRAM | Qwen3 14B / Gemma 12B-class Q4 | general + basic tools |
| 24 GB+ GPU | Qwen3-Coder 30B MoE Q4 (~19 GB, 256K ctx) | credible local agentic coding |

Download UI shows disk + RAM/VRAM fit before pulling; Q4_K_M is the quality floor for tool-calling; local context defaults 16–32K (honest UX), cloud gets full context.

**Ollama / LM Studio as optional backends:** they're just alternate OpenAI-compat baseURLs in the provider layer + a detector. ~1 week of work total, mostly settings UI. Never required — and deliberately not the default: Ollama has drifted from "neutral llama.cpp wrapper" toward a product with its own gravity (engine fork, `:cloud`-routed models, VC-shaped incentives), and its per-model defaults are agent-hostile (the silent small-context truncation footgun). Building the default path on it would recreate the exact dependency shape this roadmap removes with OpenCode. Users who already run Ollama or LM Studio lose nothing.

### 3.2 Provider layer — Vercel AI SDK

- `@ai-sdk/openai-compatible` → local llama-server, Ollama, LM Studio, any custom endpoint.
- `@ai-sdk/openai-compatible` (or `@openrouter/ai-sdk-provider`) → OpenRouter, with `HTTP-Referer`/`X-OpenRouter-Title` app-attribution headers (free leaderboard presence for YouCoded). BYOK supported.
- First-party `@ai-sdk/anthropic|openai|google` → direct keys (needed for reasoning blocks, prompt caching, provider options).
- **Model catalog** fed by models.dev `api.json` (the registry opencode uses; capabilities, context, pricing) + llama-server `/models` (local) + OpenRouter `/api/v1/models` (`?supported_parameters=tools` filter). No hardcoded model lists.
- Everything downstream consumes one typed stream: text / reasoning / tool-call / tool-result parts. AI SDK 6 is stable with `ToolLoopAgent` + human-in-the-loop tool approval; v7 adds durable `WorkflowAgent` (directly relevant to Phase 4). Start on v6, migrate via codemod when v7 settles.

Key storage: OS keychain via Electron `safeStorage` (never plaintext in settings.json); per-provider entries in a new Settings → Providers panel.

### 3.3 Harness layer — the agent loops

A **harness** = system prompt + tool set + loop policy (permission rules, max steps, compaction strategy) + model binding + UI affordances. Built on AI SDK `ToolLoopAgent`, with **opencode (MIT) as the design reference** — its `SessionPrompt.loop()` → processor → permission → compaction architecture is itself AI-SDK-based, so patterns transfer 1:1 *without embedding opencode*.

**Default harness presets (v1 set):**

| Preset | Tools | Loop | Analog |
|---|---|---|---|
| **Chat** | none (or web search only) | single-turn | Claude web basic |
| **Assistant** | files (scoped), web fetch/search, MCP connectors | tool loop, approval-first | Cowork-lite |
| **Coder** | Read/Write/Edit/Bash/Glob/Grep + git awareness | full agentic loop, permission modes | Claude Code / opencode |
| **Researcher** | web search/fetch, note-taking artifact output | fan-out-ish loop, report deliverable | deep research |
| **Automation** | user-selected subset | headless, budgeted steps, notification output | OpenClaw cron job |

**Custom harnesses:** a user-facing builder (pick base preset → edit system prompt → toggle tools → set permission policy → bind default model/provider) persisted as a shareable JSON manifest — which makes harnesses a **marketplace item** later, alongside skills and themes. This is the "users create their own" requirement, and it's also the differentiation opportunity: nobody ships a consumer-friendly harness builder today.

**Tool naming is a cheat code:** name the native tools exactly `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebFetch`, `TodoWrite`… — the same names Claude Code uses. The existing `ToolCard`/`ToolBody` views key off tool name + input shape, so **every polished tool view (diff rendering, structuredPatch, todo lists) lights up for free**, and the Artifact Tracker (which watches `TRANSCRIPT_TOOL_USE` for `Write`/`Edit` with `file_path`) keeps working without modification. The ToolCard sandbox (`run-sandbox.sh`) validates this cheaply with fixtures before any live loop exists.

**On the leaked Claude Code source (policy settled 2026-07-09): ideas-only, never code.** No leaked code, prompts, or tool-description text enters the repo — non-literal copying (distinctive structure, and especially the copyrighted system-prompt/tool-description strings embedded in that source) is a real liability for a publicly distributed app, and YouCoded's headline sign-in depends on Anthropic goodwill. Destin may review it personally for feature/design ideas expressed in his own words; Claude-side design work draws exclusively on legitimate sources, which cover nearly the same ground: opencode (MIT, battle-tested), Anthropic's published Agent SDK docs and engineering blog, public CC prompt/loop teardowns, the CC changelog, and the clean-room behavioral knowledge already in `cc-dependencies.md`. A dedicated "harness design ideas" research pass over those public sources is a Phase 0 step.

### 3.4 Making non-Claude sessions first-class in the existing UI

Feature-by-feature wiring plan (the part you asked for emphasis on):

| UI feature | How the native harness drives it |
|---|---|
| Chat bubbles + streaming | Harness emits `assistant-text` deltas → existing `TRANSCRIPT_ASSISTANT_TEXT`. Proven by both existing adapters. |
| Reasoning/thinking | AI SDK reasoning parts → `assistant-thinking` heartbeats + the opencode branch's collapsible reasoning UI (salvage). |
| Tool cards | Same tool names + input shapes as CC (§3.3) → existing views render unchanged. `structuredPatch` computed with jsdiff on Edit, as the watcher does today. |
| Permissions | Harness pauses at tool boundary (AI SDK approval hook) → dispatch existing `PERMISSION_REQUEST` → user's choice resumes/denies the loop. *Better* than CC's banner-string scraping. Permission modes (ask/edits-auto/full-auto) map to per-harness policy. |
| Turn metadata / usage | AI SDK usage + finishReason → `turn-complete` `{stopReason, model, usage}` → existing per-turn strip and UsageCard. |
| Interrupt (ESC) | AbortController → emit `user-interrupt` → existing `TRANSCRIPT_INTERRUPT` endTurn path. |
| Compaction | Harness-owned summarization when context nears limit → `compact-summary` event → existing SystemMarker with expandable summary. |
| Resume browser | Native sessions persist as JSONL in `~/.youcoded/sessions/<cwd-slug>/` (native home, §3.4a) mirroring the transcript-event shape → the conversation index, topic files, and Resume Browser treat them like CC sessions with a `provider` tag. One index, two stores. |
| Projects view / conversations | Same conversation-index integration → project conversation lists include native sessions automatically. |
| Artifacts | Artifact Tracker already keys off transcript tool events — zero work beyond tool naming. |
| Skills | **SKILL.md stays as the content format** (simple, portable, already what the marketplace catalog contains) but the harness scans the YouCoded-native skill store (§3.4a): frontmatter descriptions in the system prompt, full SKILL.md loaded on trigger. The WeCoded marketplace serves every backend — a real moat. |
| MCP | AI SDK 6 stable MCP client reading **YouCoded's own MCP config as source of truth**; the existing mcp-reconciler demotes to an export adapter that projects entries into CC's config for CC sessions (§3.4a). |
| Slash commands | Command drawer already scans command dirs; harness implements `/model`, `/compact`, `/clear` natively (no PTY writes — just function calls). |
| Model picker | Provider-scoped lists (salvaged ModelPickerPopup work) + models.dev metadata; mid-session model swap is trivial natively (next `streamText` call uses the new model — no process restart). |
| Attention states | Mostly unnecessary: the harness has *real* state (streaming/tool-running/awaiting-approval/errored) — no buffer-scraping classifier. Map error states to the existing AttentionBanner. |
| Memory/context | Reuse `context-discovery.ts` with **AGENTS.md as the primary instruction file** (the genuine cross-tool standard — Codex, Cursor, opencode, Copilot, Antigravity all read it) and CLAUDE.md as fallback for existing projects. Same discovery code, either backend. |
| Android/remote | Events already flow over the bridge (`transcript:event` shape is transport-agnostic). Harness runs in desktop main; Android Phase 5 decides local-vs-LAN. |

### 3.4a Conventions inversion — YouCoded-native home, CC as export target

Decision (2026-07-09, replacing the earlier "adopt Claude's conventions as ours" position): the jank Destin has experienced is almost entirely Claude Code's **packaging/registry layer** — the four-file plugin registry that must be written atomically, `enabledPlugins` in settings.json, marketplace cache dirs, hooks-in-settings.json, `.claude.json` MCP quirks — not the content formats. So:

- **A YouCoded-native home** (working name `~/.youcoded/`; final layout is a Phase 0 spec) becomes the **source of truth** for installed skills, MCP server configs, harness manifests, and agent manifests — one clean manifest/lockfile instead of CC's four-file dance.
- **Content formats stay standard:** SKILL.md as the skill format, MCP as the tool protocol, **AGENTS.md as the primary project-instructions file** (CLAUDE.md read as fallback).
- **`ClaudeCodeRegistry` demotes from "the system" to an export adapter:** it projects installed items *into* `~/.claude` (plugin registry, MCP config) only so CC sessions can see them. Single-writer discipline; CC's quirks quarantined behind one adapter. The mcp-reconciler follows the same demotion.
- **Marketplace implications** (Phase 3): registry schema gains item types (skill / harness / agent) and a backend-compatibility field (`claude-code` / `any-backend`, validated in the plugin-PR CI); install paths move to the native home; a one-time migration in an app release moves existing installs and leaves CC-visible exports in place.

The app stops *wrapping* Claude Code's ecosystem and starts owning a standards-based one that Claude Code plugs into like any other backend.

### 3.5 Agents & Automations view

A third top-level view alongside Chat and Projects:

- **Agent = named automation**: harness (preset or custom) + model binding + instructions + workspace scope + trigger.
- **Triggers v1:** manual "Run now," cron schedule (reuse the proven scheduling patterns from CC Routines/OpenClaw research: cron + one-time). **v2:** file-watch, webhook (needs port/tunnel decisions), app events (session ended, sync completed), inter-agent chaining.
- **Runner:** main-process scheduler (persisted job store, survives restart, catches up on missed runs with a policy) spawning headless harness sessions with step/token budgets. Local models make 24/7 scheduled agents **free** — a genuine advantage over every cloud-metered competitor, and the reason llama.cpp-default and this view are synergistic.
- **Run inbox:** per-agent run history (transcript = a normal session, viewable in chat UI read-only), states `scheduled / running / needs-approval / completed / failed`, surfaced via StatusBar chip + notifications (+ push via remote channel later). Approval requests from headless runs land here instead of blocking.
- **Deliverables:** runs produce artifacts (files, reports) that flow into the existing artifact viewer/Project View.
- **Sharing:** agent manifests are JSON → shareable to friends via the existing social layer, publishable to WeCoded later (with the skill-security scanning lesson from ClawHub applied from day one).

---

## 4. Roadmap

Phases are sequential but 1/2 overlap internally; each phase = its own brainstorm→spec→plan cycle per workspace convention. Estimates are focused-effort approximations, not calendar promises.

**Ordering decision (Destin, 2026-07-09): phases stay as laid out.** The alternative — shipping Agents & Automations first on the CC backend — was considered and rejected: automations don't make sense until other backends exist, since the headline value is 24/7 agents running free on local models, and building the runner against CC's PTY quirks first would bake the wrong constraints into the design.

### Phase 0 — Foundations & salvage (~1–2 weeks) — DONE 2026-07-10

Delivered: ADRs 006–010; foundations spec (`2026-07-10-phase0-foundations-design.md`); harness-design-ideas research (`investigations/2026-07-10-harness-design-ideas.md`); seam PR merged (youcoded #115 — `SessionProvider = 'claude' | 'native'`, Gemini removed, `native.supported` gate, runtime selector, runtime-aware gating, reasoning UI salvage, coupling-registry skeletons); `feat/opencode-mvp` archived in place. Phase 1 follow-ups recorded in the PR body.

**Goal:** lock decisions, extract value from `feat/opencode-mvp`, land the shared seam on master.

1. **Decision records** (`docs/decisions/`): llama-server backbone + node-llama-cpp-for-in-process-niches hybrid; AI SDK v6 now/v7 later; native harness over embedded CLI; leaked-source ideas-only policy; tool-name compatibility policy; conventions inversion + native home layout (§3.4a); phase ordering as laid out (Agents view after backends — decided 2026-07-09).
2. **Salvage pass on `feat/opencode-mvp`:**
   a. Cherry-pick/rebase the provider-seam + runtime-aware UI commits (types, SessionStrip runtime selector, HeaderBar gates, classifier gating, ModelPicker scoping, reasoning UI) onto a fresh branch; strip OpenCode/Ollama specifics.
   b. Rename `'local'` provider concept to `'native'` (the harness) with a `providerEndpoint` concept underneath; reserve `IPC` channels.
   c. Archive the branch with a README pointing here (don't delete — the adapter is reference material).
   d. **Remove the Gemini provider entirely** (Destin, 2026-07-10): Google discontinued the Gemini CLI in June 2026; Gemini models are reachable through the native runtime via OpenRouter/direct key instead. Runtime selector labels become `Claude Code | YouCoded`.
3. **Spec the provider-layer interfaces** (`ProviderRegistry`, `ModelCatalog`, `EngineSupervisor`, `HarnessSession`), the native session store format (JSONL mirroring transcript-event shape), and the **native home layout** (`~/.youcoded/` manifest + the CC export-adapter design, §3.4a).
4. Create `engine-dependencies.md` + `provider-dependencies.md` coupling registries (the `cc-dependencies.md` discipline, applied forward).
5. **Harness-design-ideas research pass** over legitimate public sources (opencode internals, Agent SDK docs, published CC prompt/loop teardowns, the CC changelog) — the sanctioned substitute for mining the leaked source (§3.3 policy).

**Exit criteria:** master has the `SessionProvider` extension + dormant runtime selector behind the `native.supported` capability gate (no settings flag — decided 2026-07-10); specs approved.

### Phase 1 — Local Engine + Provider Layer (~4–6 weeks)

**Goal:** YouCoded runs models. Chat-preset sessions (no tools yet) work against local llama.cpp, OpenRouter, and direct keys.

1. **EngineSupervisor** (`desktop/src/main/engine/`):
   a. Per-platform engine acquisition: bundle CPU+Vulkan(+Metal); CUDA as opt-in download; engine version pinned + updatable independent of app releases.
   b. Spawn `llama-server` router mode on a shifted free port (`--host 127.0.0.1 --no-webui --jinja`), health-poll, crash-restart, idle shutdown policy.
   c. Tests mirroring `opencode-service.test.ts` (mock subprocess + fetch).
2. **Model Manager:**
   a. Curated catalog (tiered defaults ladder) + HF search (`?filter=gguf`); per-quant file sizes; RAM/VRAM fit estimate vs detected hardware; disk-space guard.
   b. Download via `-hf`/HF API into the llama.cpp cache with progress events (reuse the pull-progress IPC patterns from the MVP).
   c. Settings → Local Models panel: installed models, delete, default per tier, context-length knob, GPU backend picker (Jan-style) with detection.
   d. **Unsloth GGUF compatibility is a first-class requirement (Destin, 2026-07-10):** he prefers downloading unsloth's quants. Curated catalog entries should point at `unsloth/*-GGUF` repos where available; HF search + downloader must handle unsloth's dynamic-quant naming (`UD-Q4_K_XL` etc.), multi-part GGUF splits, and their fixed chat templates. Verify a real unsloth download end-to-end as part of Phase 1 acceptance.
3. **ProviderRegistry + key management:** Providers settings panel (local / OpenRouter / Anthropic / OpenAI / Google / custom-endpoint); `safeStorage` keychain; connection test per provider; models.dev + OpenRouter catalog fetch with cache; OpenRouter attribution headers.
4. **Chat-preset sessions end-to-end:** `HarnessSession` v0 = plain `streamText` loop (no tools) emitting transcript-events; SessionManager `provider === 'native'` branch (adapted from the Vercel-roadmap plan's Task 5); runtime selector enabled; model picker provider-scoped; session persistence + Resume Browser tab.
5. **Optional endpoints:** Ollama/LM Studio detectors → they appear as endpoint choices, never requirements.

**Exit criteria:** a non-developer can install a recommended model in-app and chat with it offline; an OpenRouter key holder can chat with any catalog model; sessions persist and resume.

**Gating decision (Destin, 2026-07-10):** `native.supported` stays OFF in production builds until **Phase 2 is complete** — users first meet the YouCoded runtime when it can already do agentic work, not chat-only. Phase 1 verification happens in dev builds via `YOUCODED_NATIVE=1`. Build order within Phase 1 is **cloud-first vertical slice**: provider registry + keys + HarnessSession v0 + session store against OpenRouter/direct keys first, then the local engine + model manager as additional providers.

### Phase 2 — Native Harness v1: tools + permissions (~6–8 weeks)

**Goal:** the Coder and Assistant presets work — real agentic sessions with the full existing chat UI.

1. **Tool suite** (`desktop/src/main/harness/tools/`): Read, Write, Edit (with structuredPatch), Bash (reuse PTY-less exec with timeout/output caps), Glob, Grep, WebFetch, WebSearch (pluggable backend), TodoWrite. CC-compatible names/shapes; unit tests per tool; ToolCard sandbox fixtures for every tool view.
2. **Loop policy:** AI SDK `ToolLoopAgent` with stopWhen/step budget; permission engine (allow/ask/deny rules per tool + path scoping, opencode's read-only-default posture) wired to the existing `PERMISSION_REQUEST` UI; workspace scoping (cwd jail by default, escape requires approval).
3. **Reliability for local models:** grammar-constrained tool arguments (`json_schema`), native chat templates, flat schemas + reduced tool set for <14B models (capability-probe on model install — salvage the MVP's probe harness), plain-text escape hatch (never force a tool call).
4. **Session features:** interrupt, mid-session model swap, compaction (summarize + `compact-summary` event), error→AttentionBanner mapping, usage accounting per turn.
5. **Harness presets** shipped: Chat, Assistant, Coder; preset picker in the new-session form.
6. **Verification:** transcript-parity-style fixtures for harness event emission; end-to-end `/verify` flows on dev instance; releaseTest on Android for the shared-UI surface (events over the bridge render identically).

**Exit criteria:** "fix this bug in my project" works end-to-end on Qwen3-Coder 30B locally and on any OpenRouter frontier model, with tool cards, diffs, approvals, artifacts, and projects integration indistinguishable from a CC session.

### Phase 3 — Ecosystem parity: skills, MCP, custom harnesses (~4–6 weeks)

**Goal:** the WeCoded ecosystem and user extensibility work on every backend.

1. **Skills in the harness + conventions migration:** scan the native skill store (§3.4a); frontmatter descriptions in system prompt; on-trigger SKILL.md loading; per-harness skill toggles; CC export adapter keeps CC sessions seeing the same installs. Marketplace registry + UI gain backend-compat metadata (validated in the plugin-PR CI); one-time migration moves existing installs to the native home.
2. **MCP client:** AI SDK MCP integration reading YouCoded's own MCP config (source of truth; mcp-reconciler demoted to CC exporter); per-harness MCP server toggles; connection status UI.
3. **Custom harness builder:** create/edit/duplicate harnesses (prompt, tools, permissions, model binding, skills/MCP selection); JSON manifest store; import/export; share-to-friend via existing social layer.
4. **Slash commands native:** `/model`, `/compact`, `/clear`, custom command-dir commands executed harness-side.
5. **Projects view integration polish:** provider badges on conversations; per-project default harness/model.

**Exit criteria:** a marketplace skill installs once and triggers correctly in both a CC session and a native Qwen session; a user builds and shares a custom harness without editing files.

### Phase 4 — Agents & Automations view (~6–8 weeks)

**Goal:** the headline new surface.

1. **Agent model + store:** manifest (name, harness ref, model binding, instructions, workspace, trigger, budgets, notification prefs); CRUD UI following the Projects-view hub pattern (hero, list, detail overlay).
2. **Scheduler:** persisted cron/one-time job store in main; missed-run policy; concurrency caps; battery/AC awareness on laptops.
3. **Headless runner:** harness sessions without a mounted chat view; step/token/time budgets; run transcript persisted as a session (viewable read-only in chat UI); artifacts flow to Project View.
4. **Inbox & notifications:** run states (`scheduled/running/needs-approval/completed/failed`); approval requests from headless runs queue in the inbox; StatusBar chip + native notifications; remote/Android push via existing channels.
5. **Trigger expansion (4b):** file-watch, app events, webhook (behind explicit opt-in), agent-chaining.
6. **Claude backend for agents too:** an automation can bind to Claude Code headless (`claude -p` / Agent SDK path) — the Agents view is backend-agnostic from day one, so Pro/Max users get frontier-model automations and local users get free 24/7 ones.
7. **Sharing/marketplace (4c):** publish agent templates to WeCoded with security review gates (ClawHub SkillSpector lesson: scan shared skills/agents from day one).

**Exit criteria:** "Every morning at 8, summarize my project's new GitHub issues into a note and ping me if any look urgent" is creatable in-app by a non-developer, runs on a local model for free, and its runs appear in an inbox.

### Phase 5 — Android & cross-device (~4–6 weeks, parallelizable after Phase 2)

1. **LAN engine access (headline):** desktop llama-server exposed on LAN (`--api-key`, QR pairing reusing remote-access machinery); Android sessions use the desktop's models — zero new inference code, since Android is just another OpenAI-compat client.
2. **On-device offline mode:** ARM64 `llama-server` under the existing Termux runtime (same linker64/bootstrap machinery as Node today); curated ≤4B Q4 list; CPU first, Vulkan experiment behind a flag.
3. **Cloud providers on Android:** provider layer runs in the Kotlin bridge or (preferable) reuse desktop main-process logic patterns — spec decides; key storage via Android keystore.
4. **Agents on Android:** inbox + approvals are just UI (shared React); scheduled *execution* stays desktop-side v1 (Android as a viewer/approver), on-device scheduled agents later (Doze/WorkManager constraints).

### Phase 6 — Differentiators & compounding (ongoing after 4)

- **Memory that compounds:** promote the encyclopedia/journal plugin patterns into a first-class, backend-agnostic memory layer (Hermes's self-improving-skill loop is the reference to study).
- **Multi-channel reach:** notifications → Telegram/Discord/email bridges for agent results (OpenClaw's lesson: the agent comes to you). Scoped carefully; each channel is a plugin.
- **Deliverable quality:** lean on the artifact viewer (xlsx/docx/pdf already render) to make agent outputs feel like Cowork deliverables.
- **Fine-tuning bridge (exploratory):** Unsloth Studio integration/hand-off for "make the model better at *my* stuff" — differentiating but heavy; investigate only.
- **Harness/agent marketplace growth, agent teams/orchestration** (CC workflows as the reference), **browser-use tool** for harnesses (embedded-browser tool à la Cursor 2.0) — sequence by demand.

### Effort summary

| Phase | Estimate | Unlocks |
|---|---|---|
| 0 Foundations — DONE 2026-07-10 | 1–2 wk | decisions, salvage, seam on master (PR #115) |
| 1 Engine+Providers | 4–6 wk | local + cloud chat |
| 2 Harness v1 | 6–8 wk | agentic sessions, full UI parity |
| 3 Ecosystem | 4–6 wk | skills/MCP/custom harnesses everywhere |
| 4 Agents & Automations | 6–8 wk | the new headline view |
| 5 Android/cross-device | 4–6 wk | LAN + on-device |
| **Total to full vision** | **~6–9 months** of focused effort | |

---

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Small-model quality disappoints users ("local mode feels dumb") | Honest tiering UX; capability probe on install; default hybrid guidance (local for automations/chat, cloud for hard coding); Q4_K_M floor; grammar-constrained tools |
| Scope creep — this plan is a product line, not a feature | Phase gates with their own specs; ship Phase 1 as a user-visible release ("YouCoded runs local models") before Phase 2 exists |
| llama.cpp API/flag drift | `engine-dependencies.md` + pinned engine version + smoke probes, exactly like `cc-dependencies.md` |
| AI SDK v6→v7 churn | Wrap SDK usage behind `HarnessSession`; codemod migration exists |
| Anthropic policy/goodwill (Pro/Max sign-in) | No leaked source; keep CC integration first-class; watch the Agent-SDK-credits policy space |
| Two agent stacks to maintain (CC + native) | The transcript-event seam already isolates them; shared conventions (skills/MCP/context) prevent ecosystem forking |
| Windows GPU support matrix pain (CUDA/Vulkan/driver zoo) | Vulkan default (covers NVIDIA/AMD/Intel), CUDA opt-in, CPU always works; Jan's backend-variant switcher as the model |
| Security of user-shared harnesses/agents | Manifest-level review + scanning at marketplace submission from day one |
| Conventions migration breaks existing installs | One-time migration leaves CC-visible exports in place; export adapter tested against the existing four-file-registry fixtures; staged behind an app release |

---

## 6. Immediate next steps

1. Done — reviewed and approved by Destin 2026-07-09; revisions folded in; phase ordering confirmed as written.
2. Done — Phase 0 executed and merged 2026-07-10 (spec `2026-07-10-phase0-foundations-design.md`, plan `2026-07-10-provider-seam.md`, youcoded PR #115).
3. **Next: Phase 1 brainstorm → spec** — EngineSupervisor (llama-server download/spawn/supervision + GPU backend variants), Model Manager (catalog, HF downloads, RAM/VRAM-fit UX), ProviderRegistry + keychain key storage + Providers settings panel, chat-preset native sessions end-to-end (`HarnessSession` v0, session store, Resume Browser tab), optional Ollama/LM Studio endpoint detectors. Phase 1 must also route the chat-view PTY send paths through the harness for native sessions (list in PR #115 body).

### Sources

Market and technical claims above are from July 2026 web research; key sources: llama.cpp model-management blog (HF/ggml-org), llama.cpp function-calling docs, node-llama-cpp docs/releases, Jan local-engine docs, Vercel AI SDK 6/7 announcements, models.dev, OpenRouter docs (app attribution, BYOK, models API), opencode/DeepWiki architecture pages, Claude Code changelog + Routines docs, Anthropic Claude Tag/Cowork announcements, OpenClaw/Hermes coverage, LM Studio/Ollama changelogs, grammar-constrained-generation studies (JSONSchemaBench, arXiv 2510.07248 / 2606.25605), local tool-calling model roundups. Full citations preserved in the session research reports.
