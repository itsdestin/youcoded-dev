---
title: "Subagent platform research — landscape, practices, interop, and source digs"
date: 2026-08-11
status: active
type: investigation
tags: [native-runtime, subagents, orchestration, competitive-research, m7]
repos: [youcoded]
feeds: the M7 subagents + orchestration design (spec forthcoming)
---

# Subagent platform research — August 2026

> **REVIEW 2026-08-26 — KEEP ACTIVE until specialists plan 1c merges, then archive with it.**
> It did its job: `docs/active/specs/2026-08-11-native-specialists-design.md` cites it as its
> research base, and specialist plans 1a (`8db46236`) and 1b (`e5ec5b3c`) are both on
> `origin/master`. The one part still un-consumed is the **orchestration** half — stage two /
> declarative plans — which has a spec but no design decision taken. Plan 1c is built on branch
> `feat/specialists-1c-ui` (head `d269c576`) and NOT merged
> (`git branch -a --contains d269c576` lists that branch only). No unconsumed recommendation that
> is not already reachable from the specialists ROADMAP items.

Six parallel research tracks run 2026-08-11 to feed the M7 native subagents design:
(1) landscape survey of which platforms are even relevant now, (2) platform-independent
orchestration practices/evidence, (3) closed-platform UX + durability deep dive,
(4) ACP/interop + cross-agent communication + the CC→native bridge, (5) source dig of
Hermes/opencode/Kilo Code, (6) source dig of Cline/Codex CLI/Goose. Every claim came
from a 2026 source fetched live or from reading the actual repos; training-data priors
were treated as stale throughout. Complements (does not supersede):
`docs/active/specs/2026-07-19-native-workflow-orchestration-design.md` (CC workflows /
Kimi swarm / Codex verified claims + legal analysis — still current) and
`docs/active/investigations/2026-07-10-harness-design-ideas.md` (opencode subagent
survey — confirmed by the source dig).

Shallow clones read during the dig (session-temp, will vanish):
`/tmp/claude-1000/.../scratchpad/{hermes,opencode,kilocode,cline,codex,goose}`.
File paths below are repo-relative and were verified at HEAD on 2026-08-11.

---

## §1 Landscape — who matters in August 2026

**Tier 1 (deep-dived):** Claude Code (dominant; subagents GA + experimental Agent
Teams with peer mailboxes), Hermes Agent (Nous Research, MIT — the 2026 breakout,
~219k stars; self-improving runtime), Google Antigravity 2.0 (replaced Gemini CLI,
closed; best-regarded parallel-agent "Manager" UX), Kimi K3 Swarm Max (learned swarm,
up to 300 sub-agents, RL-trained coordinator), Meta Muse Code (beta 2026-08-05,
Muse Spark model; write-ahead event log, replay-exact runs), OpenAI Codex (multi-agent
April 2026; CLI Apache-2.0), Cursor 3.x (Agents Window, ~8 parallel, /multitask),
Factory Droid (Missions: orchestrator/worker/validator fleet), Devin Desktop
(ex-Windsurf; agent Kanban, hosts third-party agents via ACP).

**Tier 2:** opencode (~160k stars, closest architectural cousin), Amp (subagents,
explicitly no inter-agent comms), Goose (Linux Foundation), OpenHands, Cline (native
subagents + open SDK), Kilo Code (absorbed Roo users; deprecated its Orchestrator
mode), Zed (ACP's home), Copilot CLI, Warp, OpenClaw (declining, not dead — 3.2M MAU;
gutted by Anthropic's April OAuth block + 138 CVEs/63 days + ~12% marketplace malware
rate — **required reading for WeCoded regardless**).

**Dead/skip:** Gemini CLI (shut down 2026-06-18 → Antigravity), Roo Code (archived
2026-05-15), Windsurf (→ Devin Desktop), Aider/Crush/Qwen Code/Trae (alive-ish, no
subagent story).

**Corrections to session priors:** "Muse Spark" is the model; the product is Muse
Code. OpenClaw "largely irrelevant" overstates. Hermes is a fresh Nous codebase, not
an OpenClaw fork — the two are framed as complements (control plane vs runtime).

**Novel work flagged:** learned orchestration (Kimi), write-ahead durable runs (Muse
Code), ACP interop standard (Zed lineage; JetBrains/Google/GitHub adopted, registry
live Jan 2026, TS + Kotlin SDKs), self-improving skills (Hermes), agent-multiplexer
middleware (amux, Claude Squad, Microsoft Agent Framework 1.0).

## §2 Practices and evidence (platform-independent)

The strongest-evidenced findings, each of which should constrain the design:

1. **Orchestrator-worker with one-shot summary return is the converged topology.**
   Cognition's "Multi-Agents: What's Actually Working" (2026-04-22) names the three
   production-proven patterns: code-review loop (reviewer denied the coder's context),
   smart-friend (weak primary consults a frontier model), map-reduce-and-manage.
   Parallel writers condemned everywhere → **single-writer invariant**.
2. **Peer-to-peer subagent messaging is demo-ware.** No benchmark or post-mortem shows
   peer chatter rescuing a task hub-and-spoke couldn't. Its demonstrated niche is
   adversarial debate/review only. Even Anthropic's agent-teams docs steer
   result-shaped work to plain subagents. The one bidirectional pattern with traction:
   **parent→child steering/resume**, which doubles as the resumption mechanism.
3. **Verifier ≠ generator** — swapping an independent verifier for the generating
   model dropped rescued tasks 6→2 (arXiv 2607.17044). Small models punch above weight
   at verification. Judge panels of similar models ≈ 2 effective votes (Apple, May
   2026); one verifier from a different model family beats three clones.
4. **The orchestrator seat is the binding constraint.** Frontier orchestrator + cheap
   workers kept 96% quality at 46% cost; weak orchestrator halved delegation quality
   (0.85→0.45). Stock 7B-30B orchestrators serial-collapse by default (Kimi PARL had
   to reward-shape against it). → **Gate delegation on the orchestrator's model
   class**, not the workers'.
5. **Runaway fan-out is a documented incident class** — Anthropic's own July 2026
   incidents (5 planned → 361 spawned agents; response: concurrency cap 20,
   depth-limited nesting). → hard caps + per-run budget from day one.
6. **MAST taxonomy** (reference taxonomy for multi-agent failures): specification/
   design 41.8%, inter-agent misalignment 36.9%, verification 21.3%. → structured
   task briefs + structured result contracts attack the biggest bucket for free.
7. **Durability consensus:** journal-based replay at the harness layer, persist at
   completed-step boundaries, idempotency keys on mutating tools, never re-run
   completed children. Nobody has productized resumable multi-agent runs — persisted
   child sessions remain YouCoded's genuine differentiator.
8. **Counter-evidence to respect:** at equal token budgets, single agents beat
   multi-agent on sequential reasoning (arXiv 2604.02460); multi-agent ≈ ~15x chat
   tokens; compaction stays first in the cost ladder. Subagents pay on parallel
   read-heavy work (research, search, review) and as context firewalls.
9. **Context strategy:** isolation by default, sharing by exception; filesystem as
   shared artifact store (summary passes paths + claims, parent re-reads files on
   demand) is the standard telephone-game mitigation. Context poisoning propagates
   silently and trace shape doesn't reveal it — prefer re-derivable artifacts over
   trusting summaries.
10. **Harness > model for cost:** orchestration design moved cost/task more than the
    entire model menu (−41% cost, arXiv 2607.06906). Constrained decoding for every
    delegation call from local models; tiny per-role tool menus (small-model function
    selection degrades with tool count).

## §3 Closed-platform UX and durability

- **Antigravity 2.0 (Manager/"Mission Control"):** agents emit **artifacts** (task
  list, implementation plan, walkthrough w/ screenshots); users steer via
  **Google-Docs-style comments on the artifacts**, not prompts; an **Inbox**
  aggregates cross-agent "needs attention" events; three-tier Allow/Ask/Deny;
  cron-scheduled agent runs; a browser subagent closes the verification loop. The
  most non-developer-friendly steering model found — maps onto YouCoded's artifact
  panel.
- **Muse Code:** two-layer durability — (1) append-only local event log, every
  action **logged before execution**, "replay-exact, restart-safe" (format
  unpublished); (2) **persistent background agents maintain a shared context file**
  workers consult to re-orient. Also: per-agent worktrees, `/grill` adversarial plan
  stress-test, agent-initiated upward messaging.
- **Cursor 3.x:** Agents Window (local/worktree/cloud/SSH in one sidebar), human-
  driven per-agent review/merge, community settled on **2-3 parallel agents, not 8**
  (conflict pain scales non-linearly); attention re-summoning is an unsolved gap
  (users hand-roll refocus hooks).
- **Factory Missions:** orchestrator writes a **validation contract** (user-approved
  completion checklist, before work starts); separate scrutiny + user-testing
  validator roles; **different models per role**; shared state via re-hydratable
  artifacts. Benchmark honesty: 37% of time on validation, 34% rework.
- **Devin Desktop:** Kanban command center, agent-brand-neutral via ACP hosting.
- **Amp:** subagents deliberately cannot communicate — "the point isn't just
  parallelism, it's **compression**"; predictable information flow; Oracle (stronger
  consulted model) = the smart-friend pattern.
- **Claude Code agent teams (Aug 2026):** still flag-gated; TeamCreate/Delete removed
  (implicit team per session); file-locked shared task list; mailboxes; inter-agent
  messages treated as **untrusted input** (copy this); teammate session resumption
  still broken (= our opening).

## §4 Interop, communication, and the CC→native bridge

- **ACP (Agent Client Protocol, Zed lineage)** — JSON-RPC 2.0, agent-as-subprocess
  over stdio; standardizes session lifecycle, streamed updates, permission requests
  routed to the client, client-provided fs/terminal, MCP config passing. v2. Official
  TS + Kotlin (+ Rust/Java/Python) SDKs; registry live Jan 2026, consumed by Zed +
  JetBrains; ~30 agents. **No subagent/delegation semantics in core** (proxy-chains
  RFD is draft — don't design against it). IBM/BeeAI's same-named protocol merged
  into A2A (LF); A2A is cross-org web-service interop — wrong layer for us.
  **Recommendation: agent-side ACP soon** (stdio CLI wrapping the native harness —
  mostly an adapter; distribution into Zed/JetBrains), client-side ACP later as its
  own feature (generalizes the CC embedding into "host any registry agent").
- **CC→native-subagent bridge: skill + CLI over Bash, not MCP.** CC Bash mechanics
  (Aug 2026): 120s default/600s max timeout, auto-background on over-timeout
  (v2.1.212+), `run_in_background` + task notifications, Monitor streams output
  mid-run, ~30k-char inline cap then spill. MCP calls never auto-background inside CC
  subagents; MCP sampling deprecated 2026-07-28. Prior art proven (codex-delegate /
  gemini-delegate skills, Claude Code Delegate, local-LLM MCP wrappers). Gotcha:
  redirect stdin (`</dev/null`) when invoking agent CLIs non-interactively. No
  official per-subagent provider routing exists in CC (open FR #38698) — the bridge
  fills a real gap. **The same CLI doubles as the ACP agent entrypoint: one binary,
  two protocols.**

## §5 Source digs — what to lift, file by file

### opencode (anomalyco/opencode, TS/Effect) — the blueprint

- `packages/opencode/src/tool/task.ts` (360 L): the whole mechanism. Depth check →
  permission ask → resolve agent def → create child session with `parentID` +
  permission overlay → prompt → result = last text part of the child's final
  assistant message, wrapped in `<task…><task_result>` XML. Foreground waits via
  race(wait, waitForPromotion) — user can **promote a foreground task to background
  mid-run**. Abort listener cascades parent cancel → child. **LIFT.**
- `packages/opencode/src/agent/agent.ts`: agent schema `{name, description, mode:
  subagent|primary|all, hidden, temperature, topP, color, permission ruleset, model,
  prompt, steps}`; built-ins build/plan/general/explore; **compaction/title/summary
  modeled as hidden utility agents** (one mechanism for everything); `Agent.generate`
  = LLM writes a new agent config from a one-line description. **LIFT.**
- `packages/opencode/src/agent/subagent-permissions.ts` (27 L): child = parent's
  **deny rules + external-directory rules only** (allows don't leak); `task` +
  `todowrite` auto-denied unless the agent def grants them. Cleanest child-permission
  model found. **LIFT.**
- Background completion **injected as a synthetic user-role prompt** into the parent
  at a turn boundary (task.ts:216) — never spliced mid-turn. `@mention` of an agent
  becomes a synthetic "call the task tool" text part with permission bypass
  (`session/prompt.ts:160-185, 974-990`). Depth: `parentID` chain walk,
  `subagent_depth ?? 1`. **No concurrency cap (their gap — add one).** BackgroundJob
  registry is in-memory, explicitly not durable (their gap — Hermes has the answer).
  Cascade-cancel via `session/run-state.ts:111`. Child session view = ordinary
  session view + parent breadcrumb; task part links via `metadata.sessionId`.

### Hermes (NousResearch/hermes-agent, Python) — the best ideas (ADAPT)

- `tools/delegate_tool.py` (4,356 L): `delegate_task` single or batch
  `{goal, context, role, output_schema}`; role = `leaf|orchestrator` (leaf can't
  delegate); child toolsets = **intersection with parent's** ("subagent must not gain
  tools the parent lacks"); spawn-pause kill switch.
- **Headroom-aware summary budget** (`_apply_summary_budget` :2021): per-child
  result cap = min(static cap, parent's remaining context × fraction ÷ batch size);
  overflow **spilled to file with a pointer footer**. Fixed their real fan-out →
  parent-context-blowout death spiral. **Top-priority steal.**
- `tools/delegation_output_schema.py`: optional per-task JSON Schema result contract,
  validated, exactly **one** bounded retry carrying errors verbatim (more retries
  make models drop correct fields).
- **Weak-model hardening:** recover `tasks` emitted as a JSON string; reject
  placeholder goals (TODO/"task 1"/unexpanded templates, narrow regex);
  **heartbeat-based staleness, no wall-clock child timeout** (idle 450s vs in-tool
  1200s; an open model request refreshes the heartbeat so slow local prefill is
  never killed); `delegation.provider` routes children to a cheaper provider:model.
- `tools/async_delegation.py` (1,603 L): top-level delegations **always background —
  the model doesn't choose**; completions queue and re-enter as a fresh turn when the
  parent is idle (preserves role alternation + prompt cache); **SQLite durable
  records** with PID+start-time liveness recovery (`recover_abandoned_delegations`,
  `restore_undelivered_completions`); completion payload carries a self-contained
  task-source block ("the parent won't remember why the subagent existed").
- `tools/delegation_live_log.py`: per-child tail-able transcript pre-created at
  dispatch. `steer_subagent` (:236): queue text into a running child, applied at the
  next iteration boundary, never cutting a tool call; missed steers drain into the
  completion record.

### Kilo Code (Kilo-Org/kilocode) — the cautionary fork

- Architecture: **an opencode fork** (vendored `packages/opencode/` with
  `kilocode_change` markers). Their orchestrator-mode deprecation
  (`packages/kilo-docs/...orchestrator-mode.md`) is explicit: "no longer needed —
  agents with full tool access can delegate to subagents natively." **Don't build an
  orchestrator mode; put the task tool in every capable agent.**
- Three guards added over upstream (`src/tool/task.ts` ~:149-185): reject `primary`
  agents as subagent targets; reject `task_id` resume when the session isn't a child
  of the current session; children inherit the **calling agent's** edit/bash/MCP
  restrictions. **LIFT all three.**
- `SubAgentViewerProvider.ts`: one read-only webview per child id — confirms
  "subagent viewer = session viewer pointed at the child."
- `agent-manager/` (~90 files): the *other* parallelism axis — user-facing top-level
  agents in per-agent git worktrees. `prune-subagents.ts`: any session with a
  `parentID` must never appear as a managed top-level agent. **LIFT the prune
  invariant; the worktree axis is future roadmap, not subagents v1.**

### Cline (cline/cline, TS) — most directly liftable overall

- `sdk/packages/core/src/extensions/tools/team/spawn-agent-tool.ts`: `spawn_agent` =
  a `createTool()` tool whose execute builds a child SessionRuntime
  (`createDelegatedAgent()`), awaits `run(task)`, returns `{text, iterations,
  finishReason, usage}`. Child inherits parent AbortSignal. Observer callbacks
  try/catch-swallowed. **LIFT — fits defineTool() directly.**
- Agent defs: `~/Documents/Cline/Agents/*.yaml` frontmatter `{name, description,
  modelId?, tools?, skills?}` + body = system prompt; **chokidar-watched,
  hot-reloaded**; each becomes a dynamic tool `use_subagent_<name>` (64-char cap,
  FNV hash suffix on collision). **LIFT, incl. reading `.claude/agents` format
  (Goose does too).**
- **Depth by toolset, not counters:** child's tool list simply omits the spawn tool
  unless `enableSpawnAgent` (Goose identical: children never see `delegate`). LIFT.
- Children are **first-class persisted sessions**: derived ids
  (`<rootId>__<agentId>`), `is_subagent` column, hidden from the main session list
  with a badge (`session-graph.ts`, `sqlite-session-store.ts`, `discovery.ts`). LIFT.
- UI: `message-translator.ts` (~L1370-1470) aggregated spawn message that replaces
  itself + per-child `say:"subagent"` status JSON `{toolCalls, contextTokens,
  totalCost, latestToolCall, status}` → `SubagentStatusRow.tsx`. Maps 1:1 onto the
  chat-reducer event stream. LIFT.
- `requestToolApproval` callback forwarded into the child — children share the
  parent's approval surface (Goose punts: forces auto-mode, documented hang risk).
  `DelegatedAgentConfigProvider`: children fetch live connection config → survive
  OAuth token rotation. `agents-squad` example proves the whole thing builds as a
  plugin.

### Codex CLI (openai/codex, Rust) — contracts to copy, one grave to respect

- **Removed from HEAD:** `spawn_agents_on_csv`, `report_agent_job_result`, SQLite job
  rows (fossil: a no-op config key). The CSV map-reduce jobs subsystem was tried and
  pulled → **batch orchestration belongs in the parent's hands, not a bespoke jobs
  subsystem.** (Also: no `~/.codex/agents/` dir scan at HEAD — roles are declared in
  config.toml pointing at role files. The July research doc's description was of an
  older generation.)
- **Role-as-config-overlay** (`core/src/agent/role.rs`): an agent role file is a full
  config layer merged over the parent's stack — any key settable, omitted fields
  inherit, sticky carve-outs preserve caller's model/provider unless the role
  overrides. **ADAPT: express agent defs as partial session config.**
- v2 tool surface: `spawn_agent, send_message, wait, interrupt_agent, list_agents,
  followup_task`; status derived purely from the child's event stream
  (`status.rs`). `wait` default 30s / max 1h; interrupts record a model-visible note.
- **Reserve-slot concurrency with typed, model-visible `AgentLimitReached{max}`**
  (`registry.rs`, `residency.rs`, RAII slot release); default 4 concurrent, depth 1.
- **Full-history fork filter** (`spawn.rs` `keep_forked_rollout_item`): fork-mode
  child inherits parent transcript filtered to system/developer/user messages +
  assistant **final answers**, dropping reasoning/tool noise. **LIFT as the
  "inherit context" spawn mode.**
- Humane touches: child **nicknames** (`agent_names.txt` / role candidates);
  role descriptions double as orchestration doctrine in the spawn tool spec
  ("trust results, don't re-verify"; "assign file ownership"); "model locked" notes
  so the model doesn't fight fixed settings. Parent/child topology persisted in a
  separate `agent-graph-store` crate.

### Goose (block/goose, Rust)

- Two tools: `delegate` + `load`. Child = fully separate Agent with own session row
  (`SessionType::SubAgent`, `parent_session_id`), `max_turns` bound (default 25),
  CancellationToken kill. Depth hard-capped at 1 (children never see `delegate`).
  Recipes (YAML: instructions/prompt/settings/`response.json_schema`) **plus reads
  `.claude/agents` `.md` frontmatter**.
- **Structured-output children:** a recipe `response.json_schema` installs a
  `final_output_tool` whose structured output short-circuits the return. LIFT.
- **MOIM** (`moim.rs`): extensions inject a per-turn `<turn-context>` block; used as
  a live background-task ledger ("id: desc — running 40s, 3 turns; use load(id)") so
  async children stay visible **without polling tools**. LIFT concept.
- `load()` overloaded: read an agent's instructions into the parent instead of
  spawning, or join/peek/cancel by id. Children forced to auto-approve because the
  approval bridge doesn't exist ("would hang" — the anti-pattern Cline solves).
  Scheduler: tokio-cron over copied recipes; every scheduled run a real resumable
  session. `working_dir` must canonicalize inside the parent's dir. Model-override
  hygiene: provider-specific params dropped across model families.

## §6 Converged defaults and the synthesis

**Converged industry values:** depth **1** by default (config-raisable; enforce
structurally by omitting the spawn tool from children); concurrency default **3-4**
with a reserve-slot counter and a typed model-visible limit error; **one** retry for
schema-validated child results; child result = final message text (+ optional JSON
schema contract); background completion re-enters as a fresh parent turn at an idle
boundary; children are real persisted sessions hidden from the main list.

**What the design takes from whom (one line each):**
- opencode: the task-tool/child-session blueprint, permission overlay, hidden utility
  agents, @mention, promotion, cascade-cancel.
- Hermes: headroom-aware result budgets w/ spill, steering, durable background
  delegation w/ liveness recovery, weak-model hardening, heartbeat staleness,
  per-role cheap-model routing.
- Kilo: the three guards; the orchestrator-mode grave marker; the prune invariant.
- Cline: persisted-child-session store shape, watched agent-file dir → dynamic
  tools, forwarded approval callback, live per-child status rows.
- Codex: role-as-config-overlay, reserve-slot limits, fork-context filter,
  nicknames, wait/interrupt contract; the CSV-jobs grave marker.
- Goose: MOIM turn-context ledger, structured-output children, load-don't-spawn.
- Muse Code: write-ahead intent logging; background context-maintainer agents (idea).
- Antigravity: artifact-comment steering + Inbox (UI phase).
- Factory: validation contracts, per-role model routing, validator roles.
- Anthropic/Cognition/Amp/academia: single-writer, verifier-independence, orchestrator
  model-class gating, hard caps + budgets, untrusted inter-agent messages, structured
  briefs/contracts, compaction-before-subagents.

**Design decisions this research settles (for the spec to ratify):** orchestrator-
worker one-shot topology, no peer messaging in v1 (envelope kept generic for a later
adversarial-review feature); CC bridge = skill + `youcoded agent run` CLI over Bash
with run_in_background; ACP agent-side via the same CLI, client-side deferred;
delegation gated on orchestrator model class; child permissions = parent denies ∩
agent-def capabilities with approval forwarded to the parent's surface.
