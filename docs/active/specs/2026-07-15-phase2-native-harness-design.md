---
status: draft
---

# Phase 2 — Native Harness v1: Tools + Permissions: Design

**Date:** 2026-07-15
**Status:** DRAFT — design approved section-by-section in session (Destin, 2026-07-15); written spec pending his review.
**Parent:** `2026-07-09-platform-vision-roadmap.md` (Phase 2, §3.3). Builds on the shipped Phase 1 spec (`docs/archive/specs/2026-07-10-phase1-engine-providers-design.md`) and the Phase 0 research report `docs/active/investigations/2026-07-10-harness-design-ideas.md`, which supplies the design vocabulary used throughout (cited as "R§n").
**Repo:** all code lands in `youcoded/desktop/` (main process + renderer + shared). Android gets inert IPC stubs only.

**Goal:** real agentic sessions on the native runtime — the Assistant and Coder presets work end-to-end with the full existing chat UI (tool cards, diffs, approvals, artifacts, projects), on cloud frontier models AND on local models through the supervised engine.

---

## 0. Settled decisions (do not relitigate)

1. **We own the loop.** The turn driver is our own thin loop over AI SDK `streamText` — NOT `ToolLoopAgent` as a framework black box (amends the roadmap's §3.3 wording; adopted from R§1's explicit verdict). Reasons: per-step persistence, permission interception, compaction hooks, and doom-loop injection are all loop-internal concerns we need to own; also insulates against AI SDK v6→v7 loop-API churn (the roadmap's own listed risk). AI SDK remains the model-access layer (streaming, tool schemas, provider factories).
2. **The transcript-event emit surface is frozen.** v0's `harness-session.ts` header comment is the contract: Phase 2 replaces the *inner loop*; the 8 event types + payload shapes (incl. `partId` delta merge) do not move. All new behavior expresses itself through existing event types (`tool-use`, `tool-result`, `compact-summary`, `user-interrupt`, `session-error`, …).
3. **Exit = capability complete, still dev-gated.** `native.supported` stays false in production through Phase 2. A **Phase 2.1** pass (minor UI/functionality reviews + fixes) follows, and the formal production flip happens there (Destin, 2026-07-15).
4. **Tool set is ten tools:** Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, **AskUserQuestion**. CC-compatible names/input shapes throughout (ADR 009 "cheat code") so existing ToolCard/ToolBody views, the Artifact Tracker, and diff rendering light up with zero renderer rework — which is exactly why the ask-a-question tool takes CC's name `AskUserQuestion` (referred to as "AskUser" informally): the existing question card keys off that name.
5. **Task/subagents are DEFERRED but core/vital** (Destin, 2026-07-15). They are the bridge to Phase 4 agents. The loop and session store must be designed so child sessions (parent-session pointer, subagent-as-session) fit without schema change — a stated design constraint, verified in review, not built. ROADMAP item added.
6. **WebSearch default is the Exa keyless endpoint**, with DDG HTML-scrape fallback and keyed upgrades (Tavily; Exa key lifts limits on the same endpoint). Chain order ships as data, trivially patchable — the research's core warning is that free search endpoints keep vanishing (Brave free tier dead Feb 2026, Bing API dead Aug 2025). Full comparison + citations: `docs/active/investigations/2026-07-15-web-search-backends.md`. Brave is deliberately NOT in v1.
7. **StatusBar usage bridge lands in Phase 2** (closes Phase 1's `native-statusbar-usage` deferral; existing ROADMAP item absorbed). The per-turn metadata strip is OFF by default (`showTurnMetadata` default false) — for most users the StatusBar chips are the ONLY visible usage surface, and compaction needs the same context accounting anyway.
8. **Presets are personality profiles, not capability tiers** (Destin, 2026-07-15). Every shipped preset gets the full ten-tool suite in v1; presets differ in system-prompt personality, permission posture, and default steering. **Two presets ship: Assistant (default) and Coder.** The Chat preset is cut (superseded; legacy `harnessId:'chat'` sessions resume via a mapping to Assistant). The manifest's `tools[]` stays in the schema for Phase 3 custom harnesses.
9. **Capability profiles never remove tools from a preset** (Destin, 2026-07-15 — small local models are used precisely for "check the news"-style web tasks). Profiles simplify *presentation*: flattened schemas, compact descriptions, serial-only calls.
10. **The permission-mode UI is the StatusBar permission chip** (`StatusBar.tsx` `PERMISSION_DISPLAY`; stale HeaderBar claim in `desktop/CLAUDE.md` fixed on sight, youcoded `d2e3a740`). For native sessions it becomes real IPC state — no keystroke send, no screen-scrape confirmation.
11. Standing decisions inherited: llama-server router mode + `--jinja` (already spawned with it since Plan B, specifically for this phase); `~/.youcoded/` writes only via NativeHome; secrets only via safeStorage SecretsStore; every external coupling gets a `provider-dependencies.md`/`engine-dependencies.md` row + probe; IPC parity discipline for every new channel.

## 1. Decomposition: one spec, three plans

Executed in order; each independently mergeable behind the same dormant gate. Cloud-first again: Plan A proves the loop on the most reliable models so every later local-model failure is unambiguously a reliability problem, not a loop bug.

| Plan | Delivers | Exit test (dev build, `YOUCODED_NATIVE=1`) |
|---|---|---|
| **A — Agent loop + core tools + permissions** | Turn driver; `defineTool()`; Read/Write/Edit/Bash/Glob/Grep/TodoWrite; permission engine + existing-UI wiring; doom-loop guard; tool-event persistence + resume rebuild; ToolCard fixtures | "Fix this bug in my project" end-to-end on a frontier model via OpenRouter — tool cards, diffs, approvals indistinguishable from a CC session |
| **B — Web tools + AskUser + presets** | WebFetch; WebSearch chain (Exa keyless → DDG → keyed); AskUser card; Assistant + Coder preset manifests + prompt assets; preset picker in new-session form; legacy `chat` mapping | An Assistant session answers a freshness-dependent question via search and asks a clarifying question mid-task |
| **C — Local reliability + compaction + status** | Capability profiles; grammar-constrained tool args (llama-server `json_schema`); `local-small` + per-provider prompt variants; two-stage compaction; StatusBar usage bridge; interrupt/model-swap hardening; `probe-tools.mjs` | The Plan A exit test passes on local Qwen3-Coder 30B; StatusBar chips live throughout; session survives a compaction and keeps working |

## 2. Plan A — the loop, core tools, permissions

### 2.1 Turn driver (replaces v0's inner loop)

One turn = a loop of **steps**; one step = one `streamText` call. Stream parts are consumed through the existing abort-race iterator (kept verbatim — it exists because providers can ignore abort signals).

- Text/reasoning deltas emit exactly as today; **each step allocates fresh `partId`s** so text between tool calls renders as its own bubble (CC's intermediate-message behavior).
- A streamed tool call → emit `tool-use` (id, name, input) → permission decision (§2.4) → execute (with the turn's AbortSignal) → emit `tool-result` → append the call/result message pair to history.
- **Turn end:** step produced no tool calls (normal), `limits.maxSteps` reached (default 25, per-preset), interrupt, or error. `turn-complete` carries usage summed across the turn's steps + `tokensPerSecond`.
- **Tool errors are results, not crashes:** validation failures, timeouts, and execution errors return as tool results with a corrective hint (R§3's actionable-error rule) so the model self-repairs on the next step.
- **Doom-loop guard (R§1):** 3 identical consecutive `(name, normalized args)` tool calls → synthetic `doom_loop` permission ask ("The model seems stuck repeating itself — continue?"). Threshold 2 for small models (via Plan C profiles).
- **Retry:** transient provider errors (429/5xx/network) retry with exponential backoff honoring `retry-after`; exhaustion → existing `session-error` → error attention state.
- **Truncated tool calls** (`finishReason: length` mid-JSON) are a distinct error class → fail that call cleanly ("response was cut off"), never re-parse or loop.
- **Interrupt mid-tool:** ESC aborts the stream AND running tools (Bash kills its child, fetches abort). Partial history kept; `user-interrupt` emits; same reducer path as today.
- **Subagent readiness (decision 5):** the driver takes its emit sink + session identity as constructor inputs (already true in v0) and nothing in it assumes "the one user-facing session" — a child session is just another driver instance with a parent pointer in its store header. Verified as a review checklist item in each plan.

### 2.2 System prompt assembly

Fixed order (R§2): identity line → preset prompt body → `<env>` block (cwd, platform, OS, date, git branch/status, YouCoded version) → project instructions (AGENTS.md walk-up, CLAUDE.md fallback — reuse `context-discovery.ts`) → tool guidance. **Byte-stable across turns within a session** (local KV-cache reuse; R§7). Prompt bodies are asset files under `desktop/src/main/harness/prompts/`, not string literals. Plan A ships one body (Coder-shaped default); the variant family arrives with Plans B/C.

### 2.3 `defineTool()` + the core tools

One wrapper centralizes: schema validation (invalid → corrective error result) → permission check → execute(signal) → truncation (shared service, per-tool caps, `[truncated — use offset=N]` trailers) → result formatting. Non-negotiable guards live here, below the permission config, not overridable by any mode: **secret-path denial** (`.env`, `~/.ssh`, key/credential files — extend the `read-binary-access.ts` pattern) and the **workspace jail** (`external_directory` synthetic permission: any path outside session cwd → ask, regardless of mode).

| Tool | Load-bearing details |
|---|---|
| Read | `cat -n` line numbers; offset/limit; ~2000-line cap; binary sniff; long-line truncation |
| Edit | exact-string replace + uniqueness; **read-before-edit gate** (fails if not Read this session or changed since); line-ending + BOM preservation; `structuredPatch` via jsdiff on the result (diff card renders as with CC) |
| Write | create/overwrite; read-before-overwrite for existing files; `structuredPatch`; Artifact Tracker compatibility (`file_path` input name) |
| Bash | PTY-less `child_process` spawn — none of the ConPTY 56-byte machinery applies; timeout (default 2 min, capped); output cap; kill-on-interrupt. **Windows shell: prefer Git Bash when present, else PowerShell — the live shell is stated in the tool description, never silently pretended** |
| Glob | pure-JS globbing; mtime-sorted results |
| Grep | bundled ripgrep (`@vscode/ripgrep`); structured, pre-truncated output — dedicated tool because small models butcher shell quoting (R§3) |
| TodoWrite | per-session todo state; renders in the existing todo card |

Every tool: unit tests + a ToolCard sandbox fixture (`run-sandbox.sh`) validating the rendered card before any live loop exists.

### 2.4 Permission engine

- **One pure function:** `decide(tool, args, session) → allow | ask | deny`, evaluated inside `defineTool()` before execute. No I/O; a rule table in, a decision out.
- **Rule schema is opencode's, near-verbatim (R§4):** per-tool allow/ask/deny; Bash rules glob the *command string* (`"git *": "allow"`, `"git push *": "ask"`, `"rm *": "deny"`); file tools glob paths; **last matching rule wins**. Synthetic permissions `doom_loop` and `external_directory` ride the same rail.
- **Three layers merge (most specific wins):** preset baseline (manifest `permissionPolicy`) → session mode (Ask / Auto-edit / Full-auto, switched via the StatusBar chip over a new IPC — real state, instant) → remembered decisions ("Always allow" persists a (tool, pattern) rule per project in `~/.youcoded/` via NativeHome; management UI is Phase 3, Phase 2 writes + honors).
- **Full-auto still keeps** the non-negotiable guards and the destructive deny-list (`rm *`, `git push *`, …).
- **Ask flow reuses the existing UI end-to-end:** loop pauses → emit the same `PERMISSION_REQUEST` shape the hook relay produces → same Yes/No/Always card → response resumes or converts the call to a refusal result ("The user declined this action") the model can adapt to. Born in-process, so the CC permission race (hook faster than file watcher → synthetic entries) structurally cannot happen.

### 2.5 Persistence + resume

History becomes structured (`ModelMessage` with tool-call parts + tool-result messages). The session store keeps persisting raw transcript events (same JSONL, same coalescing); **resume gains a rebuild step** reconstructing tool-call/result pairs from stored events into driver history. Pinning test: resumed history deep-equals the live session's. Store header unchanged (subagent parent pointer would be an *additive* header field — decision 5).

### 2.6 New IPC (Plan A, provisional names)

`native:permission-respond`, `native:set-permission-mode`, plus renderer plumbing for the chip. Full parity discipline per channel (preload + remote-shim + `ipc-channels.test.ts` + SessionService.kt stubs). Remote browsers get tool cards/approvals for free — events are ordinary chat state (approval *responses* from remote ride the same channel semantics; verify in Plan A's live pass).

## 3. Plan B — web tools, AskUser, presets

### 3.1 WebFetch

Fetch (redirects, size cap, timeout, AbortSignal) → Readability-style extraction → Markdown → truncation trailer. Plain text passes through; binaries refuse honestly. **Private/localhost/RFC-1918 addresses blocked by default** (no LAN probing) — same guard family as secret paths.

### 3.2 WebSearch (decision 6)

Chain: **Exa keyless** (documented free JSON-RPC endpoint, `mcp.exa.ai` — called as a plain HTTPS client, no MCP framework; per-IP limits suit desktop distribution) → **DDG HTML fallback** (single attempt; `202 Ratelimit` detected → honest error per error-message standards, never retry-hammered) → **"add a key" prompt**. Keyed upgrades: Tavily, Exa key (same endpoint/code path) — provider entries in Settings → Providers on the existing safeStorage machinery. Chain order is data (curated-models remote-tweakable pattern is the reference). One stable tool interface regardless of backend; the existing WebSearch card renders results. Couplings: `provider-dependencies.md` rows + probe scripts for the Exa request shape and the DDG endpoint.

### 3.3 AskUserQuestion

Pauses the loop like a permission ask; **named `AskUserQuestion` with CC's input shape** so the existing question card renders it unchanged (same interaction language as CC); the answer returns as the tool result. IPC: `native:ask-user-respond` (or folded into the permission-respond channel if the shapes unify cleanly — plan decides).

### 3.4 Presets (decision 8)

| Preset | Personality | Permission baseline |
|---|---|---|
| **Assistant** (default) | helpful generalist — researches, writes/edits documents, leads with search when freshness matters, asks before consequential actions | edits/bash ask; reads + web free |
| **Coder** | agentic coding — plans with todos, edits confidently, runs and verifies | reads/edits allow; bash ask; destructive deny-list |

Both carry all ten tools. Picker: a preset row (two cards, name + one-liner) in the new-session form when the YouCoded runtime is selected; default Coder when a project folder is set, else Assistant. Preset stamped in the store header (`harnessId`, already there); small label in session strip/resume rows next to the runtime badge. Legacy `harnessId:'chat'` → Assistant mapping on resume. Mid-session preset switching: out (Phase 3 question). Presets are plain data (manifest + prompt assets) — the Phase 3 builder authors this same data.

## 4. Plan C — local reliability, compaction, status

### 4.1 Capability profiles (decisions 9, R§7)

`{ maxToolPresentation: full|simplified, promptVariant, doomLoopThreshold, supportsParallelToolCalls }`, resolved from catalog metadata (cloud) or tier (local GGUFs). **The harness reads the profile; nothing branches on model name.** Simplified presentation = flattened schemas (WebSearch→`{query}`, WebFetch→`{url}`, AskUser→single question + string options; server-side defaults fill the rest), compact tool descriptions, serial-only calls. Tools are never removed from the preset.

### 4.2 Constrained decoding

Local tool-call arguments enforced via llama-server `json_schema` constrained decoding (the single biggest reliability lever — R§7; `--jinja` already in the spawn args). Applied "reason freely, then emit the structured call" — **never force a tool call**; plain-text answers always remain legal. Coupling row + `test-engine/probe-tools.mjs` (real constrained round-trip against the pinned binary; engine-bump gated, joins the existing probe suite).

### 4.3 Prompt variants

`prompts/anthropic.txt`, `gpt.txt`, `default.txt`, `local-small.txt` (short, 1–2 worked tool-call examples), selected by profile. Assets, not literals. Honest-UX stance in `local-small`: steer toward plan-then-execute with the todo list; small models are expected to be degraded-but-useful.

### 4.4 Two-stage compaction (R§5)

1. **Prune:** near the limit, erase old tool *outputs* outside a protected recent window (~40k tokens protected; prune only if it saves ≥20k; outputs truncated to 2k chars) — nearly lossless, usually buys more rounds.
2. **Summarize:** only if pruning insufficient — model-generated summary, last 2 turns preserved verbatim, prior summaries feed continuity → emit `compact-summary` → existing expandable SystemMarker.

Triggers mid-turn (between steps — an agentic turn can exhaust context alone) and between turns. Trigger math: catalog `contextLength` + real per-turn usage (replaces chars÷4 as primary signal).

### 4.5 StatusBar bridge + hardening

Renderer→main IPC (`native:usage-report`, mirroring `remote:attention-changed`'s cache-in-main pattern) folds the reducer's per-turn usage for the active native session into `buildStatusData()` → context/tokens/speed chips live, incl. native-only tokens/sec. Same accounting feeds the compaction trigger — gauge and threshold cannot disagree. Hardening: pinning tests for interrupt-during-Bash and model-swap-mid-turn (next step uses the new binding); retry layer in front of the Phase 1 error path.

## 5. Testing

- **Unit:** every tool through `defineTool()` (validation, truncation, guards); permission decision function (rule-table torture suite incl. last-match-wins, bash command globs, layer merging); doom-loop; compaction stage selection; profile resolution; history rebuild (resume ≡ live).
- **Protocol:** emitter fixtures for tool-use→ask→tool-result, compaction, AskUser round-trip — validated against frozen `TranscriptEventType` shapes (native-emitter contract discipline).
- **ToolCard sandbox:** fixture per tool view, rendering verified pre-loop.
- **Engine probes:** `probe-tools.mjs` (constrained tool-call round-trip, dev-run, engine-bump gated).
- **IPC parity:** every new channel in `ipc-channels.test.ts` + preload + remote-shim + SessionService.kt stubs.
- **Live acceptance:** A — bug-fix exit test on OpenRouter; B — web-research task with mid-flight AskUser; C — bug-fix exit test on local Qwen3-Coder 30B with chips live + a survived compaction. Android releaseTest pass at phase end (bridge-delivered tool cards/approvals render identically).

## 6. Explicitly out of scope

Task/subagents (deferred, designed-for — decision 5); MCP + skills in native sessions (Phase 3); custom harness builder (Phase 3); plan mode; native slash commands beyond existing; Brave backend; mid-session preset switching; production flip (Phase 2.1); Android native runtime (Phase 5); `~/.claude` migration (Phase 3); sync of native sessions (sync scope).

## 7. Documentation obligations (ship with code)

`provider-dependencies.md` rows (Exa, DDG, AI SDK tool-call + toolApproval surfaces) and `engine-dependencies.md` (`json_schema` decoding) as built; `.claude/rules/native-runtime.md` updated per plan merge; PITFALLS entries as invariants ship (read-before-edit gate, permission layering, frozen emit surface already implied); roadmap Progress line per plan merge; ROADMAP items flipped/absorbed (`StatusBar usage chips`, new `subagents` item) at the appropriate merges.
