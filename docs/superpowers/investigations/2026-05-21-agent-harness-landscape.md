# Session Summary — Agent Harness Landscape & YouCoded Direction

**Date:** 2026-05-21
**Topic:** Understanding agent harnesses, where YouCoded sits in the landscape, and the case for building a custom YouCoded harness alongside Claude Code.

---

## Why this conversation happened

You wanted to understand the broader landscape — Gemini CLI, Antigravity, OpenCode, OpenClaw, Ollama, LM Studio, llama.cpp — and how those differ from Claude Code (which you use exclusively). You also wanted to know whether you're "doing things wrong" by working in terminal Claude Code instead of an IDE-based agent, and whether YouCoded should be running on top of more than just Claude Code.

The conversation moved through: landscape orientation → YouCoded's position → an audit of YouCoded's current state vs. features in competing systems → a decision to build a custom YC harness in parallel to Claude Code → an explanation of what "the agent loop" actually is and where it lives.

---

## Foundational concepts (read this first in 6 months)

**Harness** = the orchestration layer. Takes your message, builds a prompt, calls a model API, parses tool calls, executes tools, manages context, loops. The harness is "what the AI does." Examples: Claude Code, Gemini CLI, OpenCode, Aider, Cursor's agent, Cline, Antigravity, OpenClaw.

**Runner / inference engine** = where the model's math actually happens. Either remote (Anthropic API, Google API, OpenAI API) or local (llama.cpp on your GPU). The runner doesn't know about agency — it turns tokens in into tokens out. Examples: llama.cpp (C++ engine), Ollama (wrapper around llama.cpp with model registry and HTTP API), LM Studio (GUI for the same).

A harness needs *some* runner to talk to. Most harnesses talk to remote APIs; a few (OpenCode) can also talk to local runners via OpenAI-compatible HTTP endpoints.

**The agent loop** = the heart of any harness. Literal pseudocode:

```
messages = [system_prompt, user_message]
while True:
    response = model.complete(messages, tools=registered_tools)
    if response.stop_reason == "end_turn": break
    if response.stop_reason == "tool_use":
        for tool_call in response.tool_calls:
            if needs_approval(tool_call): wait_for_user_approval()
            result = execute_tool(tool_call)
            messages.append(tool_result(tool_call.id, result))
```

About 40 lines of real code. But the loop hides ~12 hard problems (see "What the loop has to handle" below). Most of a harness's quality and differentiation lives in how it solves those problems.

---

## Harness landscape (snapshot, May 2026)

| Harness | Vendor | Models | UI shape | Notable |
|---------|--------|--------|----------|---------|
| **Claude Code** | Anthropic | Claude only | Terminal-first | Mature plugin/skill/hook/MCP ecosystem. What you use. |
| **Gemini CLI** | Google | Gemini only | Terminal-first | CC-equivalent for Gemini |
| **Antigravity (IDE)** | Google | Curated list via Vertex (incl. Claude) | VS Code-style IDE | "Missions + Artifacts" model — long-running autonomous runs with first-class document panels. No local/BYOK support. |
| **Antigravity (CLI)** | Google | Same | Terminal | CLI variant of the same |
| **OpenCode** | Open source | Model-agnostic (Anthropic, OpenAI, Gemini, local via OpenAI-compatible) | Terminal | The fork-friendly option. MIT-licensed. |
| **OpenClaw** | Open source | Model-agnostic + can wrap other harnesses | Chat / SDK | **Meta-harness** — uses ACP (Agent Client Protocol) to spawn and control other coding harnesses (Claude Code, Codex) as sub-agents. Sits one layer above. |
| Aider, Cline, Cursor, Continue, Goose | Various | Various | Various | Variations on the same agent loop with different UX bets. Not central to your decision. |

## Runner landscape

| Runner | What it is |
|--------|-----------|
| **llama.cpp** | C++ inference engine. Low-level. GGUF format. CPU/GPU/Metal. |
| **Ollama** | Friendly wrapper around llama.cpp. Model registry, auto-pull, OpenAI-compatible HTTP API at `localhost:11434`. |
| **LM Studio** | GUI for the same. Browse/download models, chat UI, OpenAI-compatible server. |

These don't do agentic loops. A harness like OpenCode points at them via the OpenAI-compatible endpoint to get local agency.

---

## Where YouCoded sits

YouCoded is **a shell around a harness**, not a harness itself and not a runner. The actual agent loop is Claude Code running as a PTY session inside the app (PtyBridge on desktop and Android). YouCoded adds:

- Shared chat UI across desktop + Android (rare — most coding agents are desktop-only)
- Theme + skill marketplaces
- Multiplayer games during long turns
- Cross-device sync
- Bundled plugins
- Designed for **non-developers** — students, professionals, AI power users without terminal fluency

Closest analogs:
- **Antigravity (app) / Cursor** — also "shell around a harness," but editor-primitive instead of chat-primitive
- **Claude.ai desktop / ChatGPT desktop** — closer UX shape but no real coding tools
- **OpenClaw** — one layer higher (orchestrates harnesses)

Distinctive positioning: chat-first + mobile-included + non-developer audience. None of the others target that combination.

---

## YouCoded current-state audit (2026-05-21)

This was the ground-truth check before making recommendations. Results from a code audit, not assumptions:

### 1. Artifacts panel
**Has:** Nothing. `docs/superpowers/plans/` and `docs/superpowers/investigations/` are on-disk markdown only. Existing overlays (Settings, Command, Resume, Preferences, ModelPicker) are chat/config focused.
**Gap:** Real. No in-app surface for documents the agent produces.

### 2. Per-hunk diff accept/reject
**Has:** Visual hunk rendering in `ToolCard`/`ToolBody` via `rowsFromHunk()`. But the *permission state model* is whole-file approve/deny. Two approval modes ("bypass" / "manually approve edits") are session-scoped toggles.
**Gap:** Per-hunk granularity would require intercepting tool calls before CC writes the file (PreToolUse hook), surfacing hunk-selection UI, and writing back a modified file. Diverges from CC's transcript truth.

### 3. Multi-harness orchestration
**Has:** Plan only (`docs/superpowers/plans/2026-05-04-opencode-provider-mvp.md`). Plan treats OpenCode as a *parallel backend you can swap to*, not a replacement. `SessionProvider` type is currently `'claude' | 'gemini'`; plan adds `'local'`.
**Gap:** Zero implementation code. Plan-stage TDD scaffolds only.

### 4. Long-running missions with checkpoints
**Has:** Nothing. Sessions are fully ephemeral. App close = worker kill. `ResumeBrowser` provides *historical resume* (re-open past session by recorded ID), not mid-execution checkpoint. No background mode.
**Gap:** Real and large. This is the biggest missing feature relative to Antigravity.

### 5. Local-model fallback
**Has:** No code. Covered by the same OpenCode plan as #3. Plan treats it as opt-in user selection, not silent fallback.
**Gap:** Same as #3.

### 6. Sub-agent dispatch visualization
**Has:** `SubagentTimeline` already renders sub-agent's tool calls and text segments as a nested timeline with the same friendly labels and status icons as the main chat. Click-expand for full output. Better than most agents do.
**Gap:** Minor. A parallel-execution view for simultaneously-dispatched sub-agents would be nice but is polish.

---

## Antigravity specifics

**Billing structure** (relevant if we ever consider it as a competitor reference or platform):
- **Antigravity's built-in models** (including Claude Opus 4.6 / Sonnet 4.6) bill through Google under Google AI Pro / Ultra subscriptions. Free tier exists with quota limits. No Anthropic account, no API key.
- **Claude Code launched from inside Antigravity** uses *your* Claude Pro/Max plan or Anthropic API key — same as Claude Code anywhere else.
- A lot of recent posts frame Antigravity as "the cheaper way into Claude" because of the free-tier Opus access. This is preview pricing and will tighten.

**Model support:** No custom models, no local endpoints, no BYOK. Curated list via Vertex Model Garden only. Some blogs claim Ollama workarounds — those are unofficial reverse-engineered paths, not supported.

**Notable concepts to potentially steal:**
- **Artifacts panel** — first-class side panel for plans, walkthroughs, screenshots, decision logs
- **Missions** — durable autonomous runs that persist across app closes
- **Parallel sub-agent execution view**

---

## OpenClaw specifics

**What makes it a "meta-harness":** ACP (Agent Client Protocol) — a wire protocol that lets OpenClaw spawn and control other coding harnesses (Claude Code, Codex, Aider) as sub-processes from inside a chat thread.

**Flow:** Top-level OpenClaw agent receives a task → opens ACP session with Claude Code → hands off the coding work → CC does file edits + tool calls → results come back to OpenClaw → OpenClaw integrates with memory/triggers/channels and replies to the user.

**Architectural shape:** Similar to YouCoded *embedding* Claude Code as the engine and adding chat/social/marketplace on top — but OpenClaw stays in the agent-orchestration space, while YouCoded stays in the consumer-product space.

**Relevance to YouCoded:** Not a direct competitor. The ACP idea (one shell, multiple swappable harnesses behind it) is what your OpenCode plan already implicitly proposes at a smaller scale.

---

## The architectural decision (this session)

**Direction chosen:** Two backends — Claude Code (native) and a custom YouCoded harness ("YC harness") frankensteined from OpenCode, the leaked Claude Code source, and lessons from Antigravity.

**Rejected:** Three backends (CC + OpenCode + YC harness). Maintenance math is bad; OpenCode is more valuable as a *codebase to fork* than as a *runtime to manage alongside CC*.

**Why a second backend at all:**
- **Decoupling from CC's release cadence.** PITFALLS.md has 20+ entries that are essentially "Claude Code v2.1.X changed Y and broke us." Every CC bump is a tax. A harness you control doesn't get rev'd from under you.
- **Tools tailored to YouCoded's audience.** A `SkillInstall`, `ThemeApply`, `JournalAppend`, `TaskAdd` tool as first-class instead of agents shelling out to bash.
- **System prompt tuned for non-developers.** CC's defaults are opinionated about software engineering. YC harness can be opinionated about plain-language explanation, artifact-first workflows, etc.
- **First-class hooks for app state.** SessionService.handleBridgeMessage handles ~136 IPC types because CC doesn't know about announcements, sync, multiplayer. YC harness can read app state directly.
- **Loop flexibility.** A/B test planning loops, context-compaction strategies, tool-use formats. Can't in CC (opaque + closed source). Can in YC harness.

**What's accepted as the cost:**
- Model post-training alignment — Anthropic post-trains Claude to use *CC's* tool format and prompts. YC harness will get less out of the same model. Real gap, not closeable by clever harness work.
- Tool maturity — CC's Edit/Write tools have years of edge cases handled (UTF-8, BOM, indentation, line endings). YC will rediscover them.
- Ecosystem — MCP servers, skills, plugins expect CC's surface. YC either reimplements or starts at zero.
- Quality ceiling for *coding tasks* — solo-built harness with Sonnet 4.6 will not beat CC with Sonnet 4.6.

**The framing that makes the project sane:** YC harness is **not** "a Claude Code replacement." It's positioned for *non-coding agentic work* — journaling, encyclopedia, theme tweaks, marketplace interactions, life-admin tasks. CC stays the coding backend. Don't try to win the benchmark you'll lose.

---

## What "the loop" has to handle (the 12 hard problems)

These are the design decisions where any harness implementation actually lives:

1. **Message assembly** — system prompt, project context (CLAUDE.md, AGENTS.md), file tree, git diff, memory, skills available. CC injects multiple thousand tokens before user types anything.
2. **Tool call format** — Anthropic's structured `tool_use` blocks vs OpenAI's `function_call` vs Aider's SEARCH/REPLACE blocks in plain text.
3. **Parallel vs serial tool execution** — three tool calls in one response: parallel (faster) or serial (safer)? CC parallel by default with carve-outs.
4. **Permission gating** — when to pause for user approval. Loop has to suspend, surface UI, resume, handle cancellation-while-paused.
5. **Context compaction** — at what token threshold? What to keep, what to discard, what to summarize?
6. **Cancellation / interrupt** — ESC mid-turn. Mid-stream? Mid-tool? After current tool? You already deal with this — `endTurn` exists for exactly this reason.
7. **Error handling** — rate limits, network errors, tool timeouts, malformed tool args. Retry, surface, or fail?
8. **Streaming vs blocking** — process tool calls as they stream in (faster, harder) or wait for full response (simpler, slower)?
9. **Sub-agent dispatch** — parent loop spawns child loop, pipes calls/results back, manages lifecycle. Loop running another loop.
10. **Stop conditions** — `end_turn`, `max_tokens` (continuation), `pause_turn` (extended thinking), `stop_sequence`, refusals. Which mean done, which mean continue, which mean fail.
11. **Tool result formatting** — 200 KB of grep output. Stuff into context (bloats compaction)? Truncate (lossy)? Summarize (slow)? Store outside with reference (clever, breaks)?
12. **Memory / persistent state** — when does loop write to disk? CLAUDE.md, memory files, transcript JSONL — write order, atomicity, what next iteration sees.

---

## Where the loop lives in YouCoded today

You don't have a loop. Claude Code does. Your stack:

- **PtyBridge / pty-worker.js** spawns the `claude` CLI as a subprocess and pipes stdin/stdout. CC's binary contains the loop.
- **TranscriptWatcher** tails the JSONL transcript file CC writes, parses events, feeds them to the chat reducer.
- **Chat reducer** is *not* a loop — it's a UI state machine reacting to transcript events.
- **Tool execution** happens inside CC. YouCoded only sees the *results* via transcript events.
- **Permission flow** is the one bidirectional channel — CC blocks waiting for permission, surfaces a request via structured events, user's approval goes back through the same channel.

**Critical implication for the YC harness project:** The whole rest of YouCoded — chat UI, themes, multiplayer, sync, marketplace, ToolCards, attention classifier, subagent rendering — is **harness-agnostic** because it all reads from transcript events, not from CC directly. That's load-bearing architecture you already have. The entire YouCoded investment survives a backend swap.

---

## The proposed YC harness scope

**The shape:** A CLI binary (working name `yc-agent`) that:

1. Takes a prompt as input
2. Calls a model API (Anthropic or local via OpenAI-compatible)
3. Executes tools (Bash, Edit, Write, Grep + YouCoded-specific tools)
4. Emits transcript events **in the same JSONL shape CC writes**
5. Exits when the loop terminates

PtyBridge spawns `yc-agent` instead of `claude`. The rest of the app doesn't know the difference.

**What needs to change in YouCoded:**
- Add `'yc'` to the SessionProvider type union
- Wire a backend selector in session creation UI
- Build `yc-agent` itself (the loop + tool registry + system prompt)
- Possibly some IPC for YC-specific tools (SkillInstall, ThemeApply, etc.) that call back into the app

**What does NOT need to change:** PtyBridge, TranscriptWatcher, chat reducer, ToolCards, attention classifier, subagent rendering, themes, marketplace, multiplayer. Free UI parity.

**Where to steal from:**
- **OpenCode** — loop scaffold, provider abstraction, tool registration pattern, streaming handling. The body of the donor codebase. MIT-licensed.
- **Leaked CC source** — system prompt patterns, tool descriptions (heavily prompt-engineered), context compaction strategy, `<thinking>` interleaving pattern. Pattern-level borrowing only — copyright/license risk on verbatim, plus alignment-with-post-train issue.
- **Antigravity (from public writeups, since it's closed)** — the *mission* concept (durable turn state, checkpoint-on-pause, resumable after app close). Architectural inspiration.
- **YouCoded's own stack** — transcript event shape, permission flow protocol, IPC patterns. Already production-tested.

---

## Feature ROI ranking (for stealing into YouCoded)

After the audit, refined ranking:

1. **Long-running missions** — biggest gap in YouCoded, biggest differentiation potential because *no consumer chat agent does this*. Quarter-of-work scope. Aligns with non-developer audience ("kick off overnight, see result in morning"). Worth pursuing.
2. **Artifacts panel** — real gap, moderate build (~week). Aligns with non-developer pitch (work becomes legible without file-tree navigation). Worth pursuing.
3. **Multi-harness orchestration via YC harness** — already on plan. Execute it. The decision this session sharpened the scope.
4. **Better whole-file review UX before commit** — modal diff with Apply/Discard/Edit-and-retry. Replaces the per-hunk fantasy (which was bigger than I implied and not the right battle).
5. **Parallel-execution sub-agent view** — polish; SubagentTimeline already does the basics well.
6. **Per-hunk diff accept/reject** — skip. Architecturally invasive (requires intercepting CC's writes), and it's a developer-tool affordance your audience usually doesn't want.

---

## Open questions / decisions still pending

These weren't resolved this session:

- **Timeline.** Spike `yc-agent` first (one week, hidden behind feature flag) before committing to fuller buildout? Or commit to a quarter-of-work scope upfront?
- **License posture on leaked CC source.** How much can be borrowed pattern-wise without legal exposure? Pattern-level is generally fine; verbatim is not. Need to think about what counts as which.
- **Model choice for YC harness initial build.** Default to Sonnet 4.6 via Anthropic API (highest quality, same as CC) or default to local model (validates the local-model story end-to-end but lower quality)?
- **Where YC harness sits in user-facing model picker.** Same dropdown as Claude Code? Separate "experimental" toggle? How to surface "this is the non-coding-focused harness"?
- **Eventual fate of OpenCode plan.** Now that OpenCode is "code we adopt, not a runtime we run," does `docs/superpowers/plans/2026-05-04-opencode-provider-mvp.md` get rewritten or retired? Probably rewritten as "YC harness plan" with OpenCode as one of the donor codebases.

---

## Recommended next steps

1. **Read this doc + the OpenCode plan back-to-back** to refresh context.
2. **Decide on the timeline question above.** Spike or commit.
3. **Audit OpenCode's repo** (license, structure, fork-friendliness, code quality). Confirm it's a viable donor.
4. **Acquire / locate the leaked CC source** if you don't have it already, and skim for the high-value patterns (system prompt structure, tool descriptions, compaction strategy).
5. **Sketch the `yc-agent` interface contract:** what transcript events it must emit to match CC's JSONL shape. This is the spec that makes UI parity free.
6. **One-week spike:** `yc-agent` that spawns Anthropic Messages API with one tool (Bash), emits CC-shaped transcript events, exits. Plug into existing PtyBridge behind a feature flag. Run through existing UI. See what breaks.
7. **Decide whether to continue or rethink** based on what the spike reveals.

---

## Sources consulted this session

- [What Is an AI Agent Harness? How OpenClaw Works as an Agent Runtime](https://openclawlaunch.com/guides/openclaw-agent-harness)
- [Agent harness plugins — OpenClaw docs](https://docs.openclaw.ai/plugins/sdk-agent-harness)
- [OpenClaw ACP Harness Explained — How to Run Coding Agents](https://www.openclawplaybook.ai/guides/openclaw-acp-harness-explained/)
- [Integrate External Coding Harnesses with OpenClaw ACP](https://open-claw.bot/docs/tools/acp-agents/)
- [How AI agent harnesses like OpenClaw are changing LLMs, inference, and CPUs (The Register)](https://www.theregister.com/ai-ml/2026/05/17/how-ai-agent-harnesses-like-openclaw-are-changing-llms-inference-and-cpus/5241530)
- [Can You Use Local Models (Ollama) with Antigravity? Here's the Truth (2026)](https://agentpedia.codes/blog/antigravity-local-models-ollama-setup)
- [Running agents locally — Google Antigravity (Google AI Developers Forum)](https://discuss.ai.google.dev/t/running-agents-locally/142333)
- [Antigravity + Claude Code Integration: Overview & Setup (Scuti AI)](https://scuti.asia/antigravity-claude-code-integration-overview-setup-and-sample-app/)
- [There's a cheaper way into Claude, and it starts with Google (MakeUseOf)](https://www.makeuseof.com/claude-google-ai-pro-antigravity/)
- [Google Antigravity Pricing 2026 (Vibecoding)](https://vibecoding.app/blog/google-antigravity-pricing-2026)
