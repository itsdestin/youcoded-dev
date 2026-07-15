---
status: active
---

# Harness Design Ideas for the YouCoded Native Harness

**Date:** 2026-07-10
**Status:** Research report — Phase 0 deliverable (roadmap §Phase 0 step 5; ADR 010's sanctioned substitute for the leaked source). Feeds the Phase 2 harness spec.
**Provenance:** Web + open-source research over legitimate sources only — opencode (anomalyco/opencode, MIT: repo, DeepWiki, official docs), Vercel AI SDK v6 docs, Anthropic's published engineering blog and Agent SDK documentation, and llama.cpp/local-model community reports. No proprietary source accessed; prompt discussion is structural only.

---

## 1. Agent Loop Structure

**How opencode does it** ([DeepWiki: Session & Agent System](https://deepwiki.com/anomalyco/opencode/2.3-session-and-agent-system), `packages/opencode/src/session/prompt.ts`, `processor.ts`, `retry.ts`):

- **Entry:** `SessionPrompt.loop` orchestrates a turn. It hands off to a `SessionProcessor`, which calls `LLM.stream` — a thin wrapper over AI SDK `streamText`. One "step" = one model call; the step ends when the stream finishes.
- **Persistence during streaming:** intermediate assistant message state (partial text, in-flight tool parts) is saved to storage *as it streams*, so the UI renders partials and a crash mid-turn loses nothing. Messages are composed of typed **parts** (`text`, `tool`, `reasoning`, `compaction`) rather than flat strings — tool parts carry their own status lifecycle (pending → running → completed/error).
- **Text + tool calls in one response:** not split artificially. The assistant message keeps the model's actual structure — text parts and tool parts interleaved in order. Tool results update the tool part in place.
- **Stop condition:** the loop continues while the last step produced tool calls; it ends the turn when the model finishes with no pending tool calls (AI SDK `finishReason`/stop signal). Per-agent `maxSteps`/step limits cap runaway loops.
- **Retry:** `retry.ts` wraps the model call in exponential backoff, honoring `retry-after` headers; exhausted retries surface as a user-facing session error, not a crash.
- **Doom-loop detection:** after each tool call completes, compare the last 3 `(toolName, args)` tuples; if identical, fire a `doom_loop` **permission request** (default `ask`) so the user can break or approve continuation ([sst/opencode PR #3445](https://github.com/sst/opencode/pull/3445), [permissions docs](https://opencode.ai/docs/permissions/)). Known refinement territory: cross-message repetitions and truncated tool calls (`finishReason: length`) interacting badly with repair ([issue #25254](https://github.com/anomalyco/opencode/issues/25254), [#18108](https://github.com/anomalyco/opencode/issues/18108)).
- **Queued messages & aborts:** user input arriving mid-turn is queued and drained at turn end; abort closes the stream, persists partial state, and marks in-flight tools as ended.

**AI SDK v6 primitives** ([Loop Control docs](https://ai-sdk.dev/docs/agents/loop-control), [ToolLoopAgent reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent), [AI SDK 6 announcement](https://vercel.com/blog/ai-sdk-6)):

- `ToolLoopAgent` runs the whole loop: call model → execute tools → append results → repeat, default `stopWhen: stepCountIs(20)`.
- `stopWhen` accepts built-ins (`stepCountIs`, `hasToolCall`) or custom predicates over the full `steps` array (inspect token usage, look for a sentinel in text, etc.); arrays of conditions OR together.
- `prepareStep` runs before every step and can swap `model`, `tools`/`activeTools`, `toolChoice`, `system`, and — critically — return a `messages` override that becomes the base for subsequent steps. This is the official hook for mid-loop compaction; `pruneMessages()` helps (drop reasoning, tool calls before last N messages).
- Tool approval pauses are modeled as content parts, not blocking callbacks (see §4).

**Claude Agent SDK documented concepts** ([Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk), [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)): the loop is framed as **gather context → take action → verify work → repeat**; verification (linters, tests, screenshots, LLM-judge) is a first-class loop phase, not an afterthought. For long-running work: sessions start with a stereotyped ritual (check cwd, read progress files, review git log, run baseline tests), do **one increment**, then commit + update progress notes.

**Consensus lessons → recommendations for YouCoded:**

1. Build the loop as **our own thin driver over `streamText`** (what opencode does) rather than using `ToolLoopAgent` as a black box — we need per-step persistence, permission interception, and compaction hooks that are easier to own explicitly. Use `prepareStep`/`stopWhen` semantics as the design vocabulary either way.
2. Model turns as **typed message parts persisted incrementally** — this maps perfectly onto the existing chat-reducer part model (ToolCallState, streaming text) and makes crash recovery and remote hydration free.
3. Ship **doom-loop detection from day one**: last-3-identical-calls → surface as a permission ask. It's ~10 lines and catches the most common small-model failure. Consider hashing normalized args and also checking identical *assistant text* repetitions (opencode PR #12623 extended the guard to repeated reasoning/output).
4. Retry with exponential backoff + `retry-after`, and treat **truncated tool-call JSON (`finishReason: length`) as a distinct error class** — feed it to repair or fail the tool call cleanly; don't let it loop.
5. Cap steps per turn (20–50), and expose the cap per agent/mode.

---

## 2. System Prompt & Context Assembly

**opencode's structure** (`packages/opencode/src/session/prompt/` + `system.ts` in the [repo](https://github.com/anomalyco/opencode/tree/dev/packages/opencode/src/session/prompt), [rules docs](https://opencode.ai/docs/rules/)):

- **Per-provider prompt variants** as plain `.txt` files selected by model ID: `anthropic.txt` for Claude, `gpt.txt`/`beast.txt`/`codex.txt` for OpenAI families, `gemini.txt`, `kimi.txt`, `meta.txt`, `trinity.txt`, and a `default.txt` fallback; plus mode prompts (`plan.txt`, `plan-mode.txt`) and an Anthropic-specific plan reminder. This is the key multi-model insight: **one harness, N provider-tuned prompt bodies** — different model families need different verbosity, tool-nudging, and formatting instructions.
- **Assembly order:** identity header ("You are powered by model X…") → provider prompt body → **environment block** (cwd, workspace root, git repo status, platform, date) → project references → available skills (verbose descriptions so the model knows when to invoke) → MCP server instructions wrapped in XML tags, filtered by permissions.
- **Project instructions:** discovers `AGENTS.md` (or `CLAUDE.md`) walking up from cwd, plus global `~/.config/opencode/AGENTS.md`, plus a config `instructions` array supporting globs and remote URLs (5s fetch timeout). All concatenated into the system prompt.

**Published principles** ([Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)):

- Write at the **"right altitude"** — strong heuristics, not brittle hardcoded rules and not vague vibes. Start minimal on the best model; add instructions only in response to observed failure modes.
- Organize into **distinct labeled sections** (XML tags or Markdown headers): background/identity, instructions, tool guidance, output/tone rules.
- Prefer **just-in-time retrieval** (agent loads files via tools) over pre-stuffing context; pre-load only small, stable, high-value data (env info, project instructions).
- A few **canonical few-shot examples** beat exhaustive edge-case lists.

**Recommendations for YouCoded:**

1. Adopt opencode's file layout literally: `prompts/anthropic.txt`, `prompts/gpt.txt`, `prompts/gemini.txt`, `prompts/local-small.txt`, `prompts/default.txt`, selected by a `provider(modelId)` switch. Keep them as assets, not string literals — easy to iterate and diff.
2. Assemble in fixed order: **identity → provider body → `<env>` block (cwd, platform, OS version, date, git branch/status, YouCoded version) → project instructions (AGENTS.md/CLAUDE.md walk-up + user-global) → tool-usage guidance → tone/verbosity rules**. Read `CLAUDE.md` as a compatibility fallback, like opencode does — users already have these files.
3. Keep the base prompt short (a few KB); push tool-specific guidance into tool descriptions (§3) rather than the system prompt.
4. Put a **date + environment freshness line** in every session; multi-model apps get burned by models assuming their training cutoff.

---

## 3. Tool Design

**Consensus core set** (opencode's 13 tools per [DeepWiki: Tool System](https://deepwiki.com/anomalyco/opencode/2.5-tool-system-and-permissions); mirrors Claude Code's public tool surface): `read`, `edit` (string-replace), `write`, `apply_patch`, `bash`, `glob`, `grep`, `webfetch`, `task` (subagents), `question` (ask user), `skill`, `lsp`, plus todo/planning.

Design subtleties worth copying:

- **Read:** returns `cat -n`-style line numbers, supports offset/limit, caps default lines (~2000), detects binary via signature sniffing, truncates long lines. Line numbers exist so Edit anchors are unambiguous and the model can cite locations.
- **Edit:** exact string-replace with uniqueness requirement; opencode adds **line-ending detection/preservation (`\n` vs `\r\n`), BOM preservation, per-file semaphores** against concurrent edits, and LSP re-index after write. Read-before-edit is enforced (edit fails if the file wasn't read this session / changed since) — this single rule prevents most blind-overwrite bugs. `apply_patch` (unified diff) exists as an alternate for models trained on patch formats (GPT/Codex family) — worth offering per-provider.
- **Bash:** timeouts (default ~2min, capped max), output caps, background execution mode, and description fields for permission UX.
- **Glob/Grep as dedicated tools, not shell:** deterministic cross-platform behavior (ripgrep bundled), results integrate with permission UI, output is pre-truncated/structured, and no quoting/escaping failure modes — small models especially fail at shell quoting.
- **TodoWrite/planning:** exists because explicit externalized plans measurably improve multi-step reliability — the model re-reads its plan instead of relying on attention over a long context; also powers UI progress display. Anthropic's long-running-harness post generalizes this to **progress files + feature lists with pass/fail state** that agents may only flip, never delete ([effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)).
- **Tool results back to the model:** truncate with sensible defaults and *tell the model it was truncated + how to get more* (offsets, pagination); return **actionable error strings** (what was wrong + example of correct input), not codes; images as structured image parts. opencode validates args against the schema before execution and returns `ToolInvalidArgumentsError` with correction guidance — the model self-repairs on the next step.

**Anthropic's published tool guidance** ([Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), [advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)): fewer, consolidated, workflow-shaped tools beat many API-shaped ones; namespace related tools (`spotify_*`); unambiguous param names (`user_id` not `user`); write descriptions "as if for a new hire"; offer `response_format: concise|detailed` (concise ≈ ⅓ tokens); Claude Code caps tool responses around 25k tokens; build evals and iterate from transcripts.

**Recommendations for YouCoded:**

1. Ship exactly this v1 set: Read, Edit (string-replace + read-before-edit gate), Write, Bash (timeout/cap/background), Glob, Grep, TodoWrite, WebFetch, WebSearch, Task, AskUser. Resist adding more until evals demand it.
2. Implement a shared `defineTool()` wrapper (schema validation → permission check → execute → truncate → format) like opencode's `Tool.define()`, so truncation and error formatting are uniform, not per-tool.
3. Centralize a `Truncate` service: per-tool char/token caps, head+tail preservation, and an explicit `[truncated — use offset=N]` trailer.
4. Keep tool descriptions rich and load-bearing; they're cheaper than system-prompt guidance because providers cache them and models attend to them at call time.

---

## 4. Permissions & Safety

**opencode's model** ([permissions docs](https://opencode.ai/docs/permissions/)) — the most complete open design:

```json
{
  "permission": {
    "*": "ask",
    "bash": { "*": "ask", "git *": "allow", "git push *": "deny", "rm *": "deny" },
    "edit": { "*": "deny", "docs/**/*.md": "allow" }
  },
  "agent": { "plan": { "permission": { "edit": "deny" } } }
}
```

- Three outcomes: `allow` / `ask` / `deny`. **Last matching rule wins**; wildcards `*`/`?`; `~`/`$HOME` expansion. Bash rules match against the *command string* with glob patterns. Per-agent overrides merge over globals. Runtime "approve once / always" decisions cache into session state. Two synthetic permissions: `external_directory` (any fs tool touching paths outside the worktree → `ask`) and `doom_loop` (§1). `read` denies `*.env` by default.
- Mode pattern: **plan mode = same harness, restrictive permission overlay** (edits denied or scoped to a plans dir), not a different loop.

**AI SDK v6 tool approval** ([tool calling docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)): v6 shipped `needsApproval` on `tool()`; current docs steer new code to the `toolApproval` setting (per-tool static values, or an async function of `({ toolCall })` returning `'user-approval' | 'approved' | 'denied' | undefined` — so approval can depend on args). The loop doesn't block: it emits `tool-approval-request` parts; the app collects the decision, appends a `tool-approval-response`, and re-invokes. **Flag:** verify which of `needsApproval` vs `toolApproval` the pinned AI SDK v6 minor supports — docs mark `needsApproval` deprecated-but-working.

**Recommendations for YouCoded:**

1. Adopt opencode's config schema nearly verbatim (allow/ask/deny, nested bash globs, last-match-wins) — it's proven, user-legible JSON, and users already understand Claude Code's similar model.
2. Implement approval as a **pure decision function** in the harness (`decide(tool, args, agent, session) → allow|ask|deny`) that runs *before* the AI SDK tool `execute`, and bridge `ask` to the existing IPC permission-request flow (`PERMISSION_REQUEST` / `PERMISSION_RESPONSE` in the chat reducer). The AI SDK approval-parts mechanism maps cleanly onto this: request part → IPC → response part → continue loop.
3. Ship four presets mapping to permission overlays: **Plan** (read-only + plans dir), **Ask** (default: edits/bash ask), **Auto-edit** (edits allow, bash ask), **Full-auto** (allow, with `rm`/`git push`/network-mutation deny-list retained).
4. Keep `external_directory` and secret-path denial (`.env`, `.ssh`, credentials) as **non-configurable-by-model** guards in the tool layer — the `read-binary-access.ts` pattern; reuse it.
5. Cache "always allow" per (tool, pattern) per project, persisted like Claude Code's `settings.local.json`.

---

## 5. Compaction & Memory

**opencode's implementation** (`session/compaction.ts` via [GitHub](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/compaction.ts), [DeepWiki](https://deepwiki.com/anomalyco/opencode/2.3-session-and-agent-system)) — concrete numbers:

- **Trigger:** `isOverflow` — current tokens vs (context window − reserved output tokens).
- **Two-stage strategy:** first **prune** (cheap): erase old tool *outputs* beyond a protected recent budget (`PRUNE_PROTECT` = 40k tokens protected; prune only if it saves ≥ `PRUNE_MINIMUM` = 20k; individual outputs truncated to 2,000 chars). Only if pruning isn't enough, **summarize**: an assistant message with `mode: compaction` is generated through the normal pipeline, preserving the last 2 turns (`DEFAULT_TAIL_TURNS`) and a 2k–8k token recent-message budget; prior compaction summaries feed the new one for continuity; media is stripped and replaced with `[Attached image/png: …]` placeholders; "protected" tool calls (e.g. skill loads) survive. After compaction, the last uncompacted user message is replayed so the turn continues seamlessly.
- The compaction summary lives as a typed `compaction` part in the message list — UI can render "Compacted" markers (exactly like the existing SystemMarker).

**Published guidance** ([context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [cookbook: memory/compaction/tool clearing](https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools)): keep architectural decisions, unresolved bugs, implementation state, recent messages; drop redundant tool outputs first ("tool clearing" is the light-touch first resort); tune the summarization prompt for recall first, then precision. For long-horizon work, compaction alone is insufficient — pair it with **structured note-taking** (progress files, memory files outside the context window) ([effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)).

**Recommendations for YouCoded:**

1. Copy the **prune-before-summarize** two-stage design with opencode's constants as starting values; tool-output erasure is cheap, lossless-ish, and usually buys 1–2 more compactions before a real summary is needed.
2. Implement compaction inside `prepareStep` (return a `messages` override) for mid-turn overflow, plus an explicit between-turn compaction path — AI SDK v6's documented pattern.
3. Session persistence: **append-only JSONL of typed message parts** per session (matches the Phase 0 spec's session store). Resume = replay parts into the reducer; compaction parts mark replay boundaries.
4. Give compaction a **user-visible expandable marker** (already built for CC's `/compact`).
5. Add a per-project memory/progress file the agent maintains via TodoWrite/notes — compaction-survivable state per Anthropic's guidance.

---

## 6. Subagents & Parallelism

**opencode** ([agents docs](https://opencode.ai/docs/agents/), DeepWiki): primary agents (Build, Plan) vs subagents (general/explore/scout). Subagents run as **child sessions** — separate context windows, own message history, navigable in the UI. Invoked automatically via the `task` tool (parent passes a description + prompt) or manually via `@mention`. Each agent is a config record: own model, temperature, system prompt, **tool restrictions and permission overlay**, and `maxSteps`. Results return to the parent as the subagent's final message (a condensed report, not the transcript). Background execution via a `BackgroundJob.Service`; noisy tools like `todowrite` are restricted in subagents to avoid session noise.

**Published patterns** ([context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [Agent SDK blog](https://claude.com/blog/building-agents-with-the-claude-agent-sdk)): subagents are primarily a **context-isolation** device — deep exploration happens in the child; only a 1,000–2,000-token condensed summary returns. Orchestrator plans; subagents execute focused reads/research in parallel. Anthropic explicitly marks specialized-role subagent architectures (tester/QA/cleanup) as promising-but-unproven territory.

**Recommendations for YouCoded:**

1. Model subagents as **child sessions of the same session type** (same loop, same persistence, parent-session pointer) — UI navigation, resume, and remote hydration come free, and it matches the existing multi-session registry.
2. The `task` tool schema: `{ description, prompt, agentType?, model? }`; return only the final message text + summary stats (steps, tokens) to the parent. Cap subagent output injected into parent context (~2k tokens).
3. Agent definitions as data (JSON/MD with frontmatter): model, prompt, allowed tools, permission overlay, maxSteps — mirroring both opencode's config and the `.claude/agents/*.md` convention users know.
4. Restrict subagent toolsets by default (read-only explorer agent as the workhorse); permission `ask` events from subagents bubble to the parent's UI.
5. Background tasks: run the child loop detached, notify the parent loop via an injected system/tool-result part on completion — don't block the parent step.

---

## 7. Small-Model Adaptations (4B–32B local)

What community experiments actually report ([llama.cpp discussion #14758](https://github.com/ggml-org/llama.cpp/discussions/14758), [Docker's local tool-calling eval](https://www.docker.com/blog/local-llm-tool-calling-a-practical-evaluation/), [local tool-calling evals](https://www.jdhodges.com/blog/local-llms-on-tool-calling-2026-pt1-local-lm/), [structured-output guide](https://llmconfigurator.com/en/guides/llm-json-structured-output), [vLLM tool calling docs](https://docs.vllm.ai/en/latest/features/tool_calling/)):

- **Model floor:** reliable tool calling starts around **7–8B with explicit tool-call training** (Qwen3 7/8/14B family repeatedly cited as best-in-class; Devstral-Small 24B and Qwen3-30B-A3B for serious coding). Below 7B, and for models without tool-call training, malformed calls are a *model* failure the harness can't fully fix — except via grammar constraints.
- **Grammar/structured-output constraints are the single biggest reliability lever:** llama.cpp GBNF / JSON-schema-constrained decoding makes even small models emit syntactically perfect tool calls — failures move from syntax to semantics. Caveat from the same sources: hard constraints can hurt reasoning quality; the fix is "reason freely, then emit the structured call" (two-phase or reasoning-prefix-allowed grammars).
- **Harness adaptations that work:** fewer tools (5–8 max), flatter schemas (no nested objects/unions, few optional params), much shorter system prompts, explicit few-shot tool-call examples in the prompt, and stable prompt prefixes (KV-cache reuse breaks when env blocks fluctuate per request — a real perf issue reported in the llama.cpp thread). Chat-template (Jinja) correctness matters enormously — many "model won't call tools" reports trace to template polyfills, not the model.
- **Format:** whether XML-ish or JSON tool syntax works better is **model-specific** (matches Anthropic's "no universal best format — eval it" position in [writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)). Use each model's native trained format via its chat template; don't invent a new one.

**Recommendations for YouCoded:**

1. Add a **capability profile per model** in the provider layer: `{ toolFormat, maxTools, supportsParallelToolCalls, promptVariant, contextBudget, needsFewShot }`. The harness reads the profile; nothing else branches on model name.
2. For local models: serve a **reduced tool set** (Read, Edit, Write, Bash, Grep, TodoWrite — drop Task/WebFetch/WebSearch by default), simplified single-level schemas, and the `local-small.txt` prompt variant with 1–2 worked tool-call examples.
3. Route local inference through llama-server's **OpenAI-compatible endpoint with JSON-schema/grammar enforcement enabled**; keep the system prompt byte-stable across turns for KV-cache hits.
4. Lean harder on harness-side guards for small models: doom-loop threshold lower (2 repeats), arg-validation errors with corrective examples, tighter step caps, and tool-call repair (`repairToolCall`) wired to a stronger cloud model when the user has one configured.
5. Expect and design for **degraded-but-useful**: small models do single-file edits and simple commands well; multi-file refactors should be steered toward plan-then-execute with the todo list as scaffolding.

---

## Where sources disagree (flags)

- **Tool response format (XML vs JSON vs Markdown):** Anthropic says no universal answer — eval per model; local-model community echoes this. Don't standardize on one.
- **needsApproval vs toolApproval:** AI SDK v6 launched `needsApproval`; current ai-sdk.dev docs deprecate it in favor of `toolApproval`. Pin the minor version and check which is canonical for it.
- **Doom-loop threshold:** opencode uses last-3-identical; its own issue tracker documents false negatives (cross-message repetition) and community concern about false positives (legitimate polling). Treat the threshold as tunable and route through the permission system rather than hard-blocking.
- **Edit mechanism:** string-replace (Claude-family training) vs unified-diff `apply_patch` (GPT/Codex-family training) — opencode ships both and selects per provider. A single mechanism will underperform on the other family.
- **Specialized subagent roles:** Anthropic explicitly labels tester/QA/cleanup subagents as unproven; opencode ships only generic explore/general subagents. Don't over-invest in a role taxonomy early.
- **Compaction sufficiency:** AI SDK docs present `prepareStep` pruning as the mechanism; Anthropic's long-running-harness post argues compaction alone is insufficient and file-based memory is required. Do both.

---

## Top 10 Design Decisions for the YouCoded Harness

1. **Own the loop:** a thin `streamText`-based driver (opencode's SessionPrompt/SessionProcessor shape) with `prepareStep`/`stopWhen` semantics — not a framework black box — persisting typed message parts incrementally to feed the existing chat reducer and remote hydration.
2. **Per-provider prompt files** (`anthropic.txt`, `gpt.txt`, `gemini.txt`, `local-small.txt`, `default.txt`) assembled in fixed order: identity → provider body → env block → AGENTS.md/CLAUDE.md walk-up → tool guidance → tone rules.
3. **The consensus 11-tool core** (Read/Edit/Write/Bash/Glob/Grep/TodoWrite/WebFetch/WebSearch/Task/AskUser) behind one `defineTool()` wrapper that centralizes schema validation, permission checks, truncation, and actionable error strings.
4. **Read-before-edit enforcement + exact-string Edit with uniqueness**, line-ending/BOM preservation, per-file locks — plus `apply_patch` offered to GPT-family models.
5. **opencode's permission schema** (allow/ask/deny, nested bash globs, last-match-wins, per-agent overlays) bridged to the existing IPC permission flow, with non-configurable guards for external directories and secret paths, and four preset modes (Plan/Ask/Auto-edit/Full-auto).
6. **Doom-loop detection as a permission event** (last-3 identical tool calls → `ask`), with a lower threshold for local models.
7. **Two-stage compaction:** prune old tool outputs first (protect ~40k recent tokens, 2k-char output truncation), summarize only when pruning isn't enough; preserve last 2 turns; render a compaction marker part; pair with a persistent per-project progress/memory file.
8. **Subagents as child sessions** of the same session type — data-defined agents (model, prompt, tool subset, permission overlay, maxSteps), condensed ~2k-token result returned to the parent, background-capable.
9. **Model capability profiles** driving tool count, schema complexity, prompt variant, and format — with grammar/JSON-schema-constrained decoding enabled for local models and byte-stable prompts for KV-cache reuse.
10. **Verification as a loop phase:** wire lint/test/screenshot feedback tools in from the start, per-session startup ritual for long tasks (read progress file, check git, baseline test), and eval harness + transcript review as the iteration mechanism for prompts and tools.
