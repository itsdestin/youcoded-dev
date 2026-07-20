---
status: draft
date: 2026-07-19
tags: [native-runtime, orchestration, subagents, local-models, competitive-research]
repos: [youcoded]
supersedes: docs/active/investigations/2026-07-19-agent-orchestration-landscape.md
---

# Native workflow orchestration — competitive research + design direction

**Date:** 2026-07-19
**Status:** DRAFT — research complete, design direction proposed, **no decision taken**.
Phase 4+ / gated on the native harness Task tool landing first.

Two halves: (§1–§4) what the three competing agent-orchestration designs actually
are, verified against primary sources; (§5–§8) what building an equivalent for
YouCoded's native harness would require, where copying Anthropic would be wrong
for our stack, and the one axis where we can ship something better.

Research method: 6 search angles → 25 sources → 120 claims extracted → top 25
adversarially verified (3 independent refute-attempts each, 2/3 refutes kills a
claim); 21 confirmed, 4 refuted. Plus a targeted second pass for Codex. Every
performance number below is vendor-self-reported — see §4.

---

## 1. Claude Code dynamic workflows

**A JavaScript script that Claude writes, executed by a background runtime while
the session stays responsive.** Primitives:

| Primitive | Behavior |
|---|---|
| `agent(prompt, opts)` | Spawns one subagent, returns its result |
| `pipeline(items, ...stages)` | Each item through all stages independently — **no barrier** between stages |
| `parallel(thunks)` | Concurrent, **awaits all** before returning (a barrier) |

The load-bearing design choice is where state lives. From the docs' comparison
table — "Where intermediate results live": **script variables** for workflows vs.
**Claude's context window** for subagents and skills. That's what lets a run fan
over hundreds of items when a normal subagent fan-out would exhaust context.

**Determinism is scoped to the orchestration layer only.** The script is itself
model-generated per task and every subagent is non-deterministic, so identical
prompts do not produce identical runs. What *is* deterministic is the shape —
fan-out width, stage order, branching, accumulation. That's the part you can
read, edit, and re-run. Do not oversell this as end-to-end determinism.

**Enforced runtime constraints:**

| Constraint | Stated reason |
|---|---|
| **16 concurrent agents** (fewer on low-core machines) | Bounds local resource use |
| **1,000 agents total per run** | Prevents runaway loops |
| **No filesystem/shell access from the script** | Agents act; the script only coordinates |

⚠️ **Anthropic's own marketing is wrong if read literally.** The launch blog says
"tens to hundreds of parallel subagents" — hundreds is the **per-run total**;
concurrency is hard-capped at 16. Off by ~6x. (Corroborated by feature request
anthropics/claude-code#63938 asking for the cap to be configurable.) Subagents
always run in `acceptEdits` mode regardless of session permission mode.

**Resumption is per-agent and session-scoped** — the weakest part of the design,
and the one we can beat (§7):

> If you stop a run, you can resume it: agents that already completed return
> their cached results, and the rest run live. An agent that was still running
> when you stopped isn't saved and starts over on resume.

> Resume works within the same Claude Code session. If you exit Claude Code
> while a workflow is running, the next session starts the workflow fresh.

A plausible claim that runs "checkpoint progress" was **refuted** (1-2) — it's
per-agent result caching, not checkpointing. Design consequence: **many small
agents preserve more progress than one long agent**, because the unit of
preserved work is one completed agent. What survives session exit is the script
(written to `~/.claude/projects/`), not the results.

**Cost:** normal plan usage, no separate meter. **Advisory, non-blocking** "Large
workflow" warning above **25 agents or 1.5M projected tokens**. Requires
v2.1.154+ (warning itself v2.1.203+); on Pro must be enabled in `/config`.
Anthropic's caution, against its own commercial interest:

> Dynamic workflows can consume substantially more tokens than a typical Claude
> Code session — we recommend starting on a scoped task.

**There is no published token multiplier for workflows.** The widely-quoted
**~15x** (multi-agent vs. chat; agents alone ~4x) measures Anthropic's *consumer
Research feature*, is ~13 months old on superseded models, and does **not**
transfer to workflows. Don't cite it as if it does.

### Don't confuse the four Claude Code surfaces

The single biggest source of confusion in secondary coverage:

| Surface | Status | Who orchestrates | Cost shape | Resumption |
|---|---|---|---|---|
| **Dynamic workflows** | GA, v2.1.154+ | The script | Advisory warn at 25 agents / 1.5M tok | Per-agent, same session only |
| **Subagents** | GA | Claude, turn by turn | Lower — results summarized back | n/a |
| **Agent teams** | **Experimental, off by default** | Lead agent, turn by turn | **Linear in teammate count** | **Not supported** in-process |
| **Worktrees** | GA | — (isolation only) | — | Worktree-aware from v2.1.212 |

Agent teams need `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; coordination is
natural language with no DSL, and the former imperative surface was *removed*
(`TeamCreate`/`TeamDelete` no longer exist). Team state is plain files —
JSON mailboxes at `~/.claude/teams/{team}/inboxes/{agent}.json`, shared task list
at `~/.claude/tasks/{team}/`, **file locking on task claiming**. Never uploaded.

## 2. Kimi Agent Swarm — orchestration inside the weights

The mirror image of Claude Code. From the K2.5 technical report (arXiv
2602.02276, first-party):

> Agent Swarm, a self-directed parallel agent orchestration framework that
> dynamically decomposes complex tasks into heterogeneous sub-problems and
> executes them concurrently.

Shipped product: **up to ~300 sub-agents**, ~4,000 tool calls per task, "no
predefined roles or hand-crafted workflows required." Trained via **PARL**
(Parallel-Agent RL) under a three-dimensional reward — result quality, *genuine
parallelism*, sub-task completion — which **penalizes the orchestrator for
collapsing work onto one agent**. Sub-agents keep independent notebooks (context
sharding) and report only conclusions upward. Only the orchestrator is
RL-improved. ~15 orchestrator steps fan out to up to 300 sub-agents.

Timeline: shipped **2026-01-27** with K2.5, upgraded K2.6 (**2026-04-20**),
extended with **K3 Swarm Max 2026-07-16**. ⚠️ The repeated "100 sub-agents /
1,500+ tool calls" figure was **refuted** (0-3) — superseded K2.5-era numbers.

**The architectural divide.** A verifier specifically hunted for user-facing
configuration and **found none** — no controls over hierarchy, sub-agent count,
roles, or delegation. The docs say "Describe your task and send it."

- **Claude Code:** orchestration **outside the weights**, as inspectable,
  editable, re-runnable code at the harness level.
- **Kimi:** orchestration **inside the weights**, as an RL-learned policy.

Both defensible. Anthropic bets on auditability and reuse; Moonshot bets that
decomposition is better learned than specified — which pays exactly when you
*can't* enumerate the work in advance. Two caveats: Moonshot's roadmap names
"dynamic control of parallel width" as forthcoming, so the distinction is
explicitly temporary; and no source compares the two — the contrast is assembled
from each vendor describing itself.

**The "4.5x faster" claim is marketing.** No task set, no baseline, no sample
size, no variance. Third-party writeups repeat rather than corroborate. It's a
*wall-clock* claim, not efficiency — running 100–300 agents concurrently makes
cost materially worse even where time improves. Originates with K2.5; do not
attach it to K3.

## 3. OpenAI Codex — declarative roles, no scripted orchestrator

A **third** position: neither scripted DAG nor learned swarm, but *declarative
role definition* plus model-driven delegation.

**Fidelity caveat:** this pass fetched through a summarizing tool, and
`openai.com/index/introducing-the-codex-app/` returned **HTTP 403** — all
app-announcement quotes are second-hand. Confirm anything load-bearing.

Built-in roles `default` / `worker` / `explorer`; custom agents as one TOML file
each in `~/.codex/agents/` or `.codex/agents/`. Required: `name`, `description`,
`developer_instructions`. Optional: `model`, `model_reasoning_effort`,
`sandbox_mode`, `mcp_servers`, `skills.config` — omitted fields inherit from the
parent session.

**Fan-out exists:** experimental `spawn_agents_on_csv` reads a CSV, spawns one
worker per row, exports combined results to SQLite. Hard contract — each worker
**must call `report_agent_job_result` exactly once** or its row errors. Landed in
openai/codex PR #10935, **2026-02-24**. It's a map-reduce over a CSV: narrower
than `pipeline()`, same fundamental idea.

**The key negative finding — no first-party scripted orchestrator.** Three layers
get conflated:

| Layer | Deterministic? | Multi-agent? |
|---|---|---|
| In-session subagents | No — model decides | Yes |
| `spawn_agents_on_csv` | Fan-out shape yes; invocation is a model tool call | Yes |
| **Codex SDK** (TS/Python) | **Yes — you write it** | **No** |

The Codex SDK is single-thread control; its docs never mention subagents or
delegation. For scripted multi-agent the docs point *outward*:

> If Codex is one specialist inside a broader orchestrated workflow, run Codex
> CLI as an MCP server and orchestrate it with the Agents SDK.

**That's the open seam** relative to Claude Code — OpenAI's deterministic
orchestration lives in a *separate* product treating Codex as an MCP tool.

**Concurrency:** `agents.max_threads` defaults **6**; `agents.max_depth` defaults
**1** — root spawns children, children cannot spawn deeper. **No recursive
fan-out**, unlike Kimi or a nested workflow script. ⚠️ openai/codex issue #33447
(2026-07-15, open): Desktop's MultiAgentV2 enforces a 4-thread cap regardless,
superseding key `features.multi_agent_v2.max_concurrent_threads_per_session` —
**`agents.max_threads` may be inert**. Codex Cloud parallel tasks are a different
axis (isolated containers, no documented cap; ceiling is the 5-hour rate limit).

**Isolation, three mechanisms:** subagents *"inherit your current sandbox
policy"* with per-agent `sandbox_mode` narrowing and **no separation between
siblings**; app threads use **git worktrees** (macOS app, 2026-02-02) but
**opt-in per thread** — threads on "Local" share the main checkout; Cloud uses
isolated containers where secrets are *"removed before the agent phase starts."*

**Resumption is weakest exactly at the multi-agent layer.** Single threads resume
(`resumeThread`); cloud containers cache 12h; `spawn_agents_on_csv` persists
per-row status to SQLite but PR #10935 *"remov[ed] older, more complex job
control mechanisms"* — **no documented way to resume a partially-failed batch**.

**Cost:** no separate metering. *"Subagent workflows consume more tokens than
comparable single-agent runs."* Token-based credits since **2026-04-02**, limits
per **5-hour rolling window** shared between local and cloud. CLI **0.144.0
(2026-07-09)** added a warning when "high multi-agent concurrency could increase
usage quickly" — structurally the same move as Anthropic's advisory warning.
⚠️ Proactive delegation is **ChatGPT-only**; local Codex spawns only on request.

## 4. Trust the architecture, not the numbers

Every quantitative figure in §1–§3 is first-party and non-reproducible.

- **Anthropic's 90.2% / 90% / 15x / 4x** — unpublished internal eval,
  LLM-as-judge, ~20-query test sets, **not compute-matched** (the same post
  attributes 80% of BrowseComp variance to token usage, so much of the 90.2% may
  be bought with 15x tokens rather than architecture). ~13 months old on
  superseded models, and it measures the Research feature, **not workflows**.
- **Moonshot's 4.5x** — no published methodology at all.
- **The Kimi-vs-Claude comparison is assembled, not sourced.** No neutral third
  party validated it.
- **Version volatility is high** — behaviors span v2.1.154 → v2.1.212; K3 Swarm
  Max launched three days before this research.

The *architectural* claims — where control flow lives, where state lives, what's
enforced vs. advisory — are well-sourced and stable. The *performance* claims are
marketing until someone runs a head-to-head. **No head-to-head exists**; each
vendor benchmarks only against its own sequential baseline, which makes 4.5x and
90.2% mutually incomparable.

---

## 5. Legal — the short version

Not legal advice. The general shape:

**Copyright doesn't protect what we'd be reimplementing.** 17 U.S.C. § 102(b)
excludes ideas, procedures, processes, and methods of operation. *Google v.
Oracle* (SCOTUS 2021) held that reimplementing ~11,500 lines of Java's declaring
code was fair use. Naming a function `agent()` or `pipeline()` is not
infringement; architecture and API shape are fair game.

**The one bright line: never decompile Claude Code.** It ships as minified JS in
an npm package. Deobfuscating and lifting implementation would be copyright
infringement *and* a probable ToS violation. **This document and all design work
derive from public documentation only** — keep it that way.

**Prior art is enormous**, which also defuses patent concern: Make, Airflow
(2014), Luigi, Prefect, Dagster, Temporal, Ray, Celery; for LLM agents LangGraph,
CrewAI, AutoGen, OpenAI Swarm. Anthropic's contribution is packaging the pattern
into a coding harness with model-authored scripts. Note: many OSS developers
deliberately **don't** run patent searches, because knowing infringement can
trigger treble damages (35 U.S.C. § 284). Don't go looking.

**Trademark:** trivial — don't use "Claude", Anthropic branding, or imply
endorsement. Pick our own name.

**ToS is the only clause with teeth, and it likely doesn't reach us.** If the
orchestrator drives **native/local models**, Anthropic's terms don't apply at
all. Only fanning out against users' Claude subscriptions would warrant reading
the consumer terms closely — and that's a pre-existing question about YouCoded
generally, not something this feature introduces.

## 6. What building it requires

**Prerequisite, already on the board:** ROADMAP "Native harness Task tool /
subagents" (`#native-runtime`, added 2026-07-15) — deferred from Phase 2 by
settled decision 5 but *core/vital*, with Phase 3 item 8 scoping the design and
Phase 4 assuming it exists. **Workflows are subagents plus an orchestration layer;
the second cannot precede the first.** Phase 2's loop + session store were
designed so subagents land without a schema change.

Three decisions where **copying Anthropic would be wrong for our stack**:

### 6.1 Model-authored JS vs. a declarative DAG — the pivotal choice

Anthropic can afford model-authored JavaScript because Opus writes it. We ship
*four unpredictable models* (ROADMAP cwd-contract entry, 2026-07-18) plus local
ones. **A 7B local model will not reliably emit correct orchestration JS.**

| | Model-authored JS | Declarative DAG (JSON) |
|---|---|---|
| Expressiveness | Full — arbitrary loops, `while (bugs.length < 10)` | Limited to built-in constructs |
| Weak-model viability | Poor — must write valid JS *and* know when to fan out | Good — constrained/structured generation against a schema |
| Validation before execution | Hard (halting problem) | Easy — schema-validate the graph |
| Sandbox required | **Yes — critical security surface** | **No** |
| Effort | High | Moderate |

**Recommendation: declarative DAG** with a small set of built-in control
structures (map, filter, bounded loop-until-condition), for three reasons — it
works on the models we actually ship, it is schema-validatable before execution,
and it eliminates the sandbox problem entirely. We lose loop-until-dry
expressiveness. That is the trade, and it should be taken deliberately.

### 6.2 If we take the JS route, the sandbox is the hard part

Model-generated code executing on a user's machine is a critical-severity
surface. Options:

- **Node `vm`** — explicitly *not* a security boundary per Node's own docs. Ruled out.
- **`isolated-vm`** — real V8 isolate boundary, but a native module: Electron ABI
  pain, nothing for Android.
- **QuickJS via WASM (`quickjs-emscripten`)** — ✅ **the standout for our
  constraints.** One implementation for Electron *and* Android, no native ABI
  headaches, and the sandbox property falls out for free: WASM has no ambient
  capabilities, so "no filesystem or shell access from the script itself" is
  enforced by the runtime rather than by our code remembering to be careful.
  Note this is exactly the constraint Anthropic enforces (§1) — we'd get it
  structurally instead of by policy.
- **Electron `utilityProcess`** with node integration off — viable for desktop,
  no Android story.

### 6.3 Concurrency is not 16 — the biggest stack-specific difference

Anthropic caps at 16 because each subagent is a call to a remote GPU fleet. On a
Strix Halo, every "parallel" agent shares **one** llama-server with unified
memory. Implications:

- The ceiling derives from the engine's `--parallel` slot count, **not a fixed
  constant**. Realistically ~4 slots on a 30B, not 16.
- N slots **split the KV cache budget**. Parallelism buys throughput via
  continuous batching, not an N× speedup.
- **Two different governors:** hosted models = metered tokens, elastic compute.
  Local models = free tokens, scarce VRAM. A single `maxConcurrent` constant is
  wrong for both; derive it per-provider.

**The KV-cache cliff.** Phase 3 item 6 keeps the native system prompt
*byte-stable per session* specifically for KV-cache reuse on local models. Fresh
subagent contexts destroy that — fanning out 16 cold subagents means paying
prompt processing 16 times with no cache benefit. **Design subagent prompts
around a deliberately identical prefix** so prefix caching can still do work.
Verify against the actual llama.cpp build's caching behavior before relying on it.

## 7. Where we can beat them

**Resumption.** All three competitors are weakest here:

- Claude Code: per-agent caching, **same session only**; exiting loses the run.
- Codex: no documented way to resume a partially-failed CSV batch.
- Kimi: not addressed.

We already have a session store with a parent-session-pointer design for
subagents. **Persist subagent results as child sessions and resumption across app
restarts falls out for free.** That is not copying — it is shipping the thing
none of them have. It also composes with Phase 4's headless runner, which needs
durable run state regardless.

Secondary opportunity: **cost/budget enforcement**. Anthropic's 25-agent warning
is *advisory and non-blocking*; Codex's is a warning too. Phase 4 item 1 already
calls for real budgets (step/token/time/cost) with item 3's cost accounting as
the prerequisite. A workflow that **hard-stops** at a budget would be
straightforwardly better than an advisory warning, and the plumbing is already
planned.

## 8. Open decisions

1. **DAG vs. JS (§6.1)** — blocks everything downstream. Decide first.
2. If JS: confirm `quickjs-emscripten` works under both Electron and the Android
   WebView/Kotlin bridge before committing.
3. How does `maxConcurrent` derive per-provider (§6.3)? Needs the Plan C
   capability registry / engine slot introspection.
4. Does prefix caching actually survive subagent fan-out on our llama.cpp build?
   Live-probe; don't assume.
5. Scope relative to Phase 4 — is this part of the Agents & Automations view, or
   a separate surface layered on it?

## Sources

**Primary:** `code.claude.com/docs/en/workflows`, `/agent-teams`, `/worktrees`;
`claude.com/blog/introducing-dynamic-workflows-in-claude-code` (2026-05-28);
`anthropic.com/engineering/multi-agent-research-system` (2025-06-13);
`kimi.com/blog/agent-swarm`, `/help/agent/agent-swarm`, `/blog/kimi-k2-5`,
`/blog/kimi-k3`; `arxiv.org/html/2602.02276v1`;
`learn.chatgpt.com/docs/agent-configuration/subagents`, `/docs/changelog`,
`/docs/mcp-server`, `/docs/environments/cloud-environment`; openai/codex PR
#10935 and issue #33447. (`developers.openai.com/codex/*` 308-redirects to
`learn.chatgpt.com`; `openai.com/index/introducing-the-codex-app/` returns 403.)

**Secondary/blog:** InfoQ, alexop.dev, therouter.ai, extraheadroom.com,
youcanbuildthings.com, aiagentsfirst.com, moclaw.ai, developersdigest.tech.

**Internal:** `docs/active/specs/2026-07-09-platform-vision-roadmap.md` (Phases
3–4), `2026-07-15-phase2-native-harness-design.md` (settled decision 5),
`2026-07-16-phase2-plan-c-local-reliability.md` (capability registry).

### Claims that failed verification

- ~~Workflow runs checkpoint progress and resume from last saved state~~ (1-2) —
  per-agent result caching, not checkpointing
- ~~The core primitive is fan-out/fan-in with dynamic planning~~ (1-2)
- ~~Control flow is model-driven and non-deterministic~~ (0-3)
- ~~Kimi swarm deploys up to 100 sub-agents / 1,500+ tool calls~~ (0-3) —
  superseded K2.5 figures

### Known gaps

- Codex subagents GA date (~2026-03-14) — third-party blogs only, not in the
  official changelog.
- Whether Codex multi-agent is feature-gated (`[features] multi_agent`) or
  generally available — sources contradict; likely a CLI/Desktop/ChatGPT surface
  difference.
- No measured token multiplier exists for Claude Code workflows specifically.
