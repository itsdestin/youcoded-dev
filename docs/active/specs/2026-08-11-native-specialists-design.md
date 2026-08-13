---
status: draft
date: 2026-08-11
type: spec
repos: [youcoded]
tags: [native-runtime, subagents, specialists, orchestration, m7]
research: docs/active/investigations/2026-08-11-subagent-platform-research.md
relates:
  - docs/active/specs/2026-07-19-native-workflow-orchestration-design.md  # §Decisions ratifies its open decision 1, moots 2
  - docs/active/plans/2026-08-11-native-sessions-remaining-work.md        # this is Step 9 (M7)
  - docs/active/specs/2026-07-30-permission-ask-timeout-design.md        # §5 timeout-redirect builds on its deny-message mechanism
---

# Native specialists — subagents and plans for the native harness

**Approved by Destin 2026-08-11, section by section.** This spec settles all of M7:
stage one (specialists — the Task tool as child sessions) and stage two (plans — the
declarative orchestration layer). Stage one ships and stabilizes before stage two
starts. Evidence citations live in the research doc named in the frontmatter; this
spec states the decisions.

**User-facing name: "specialists"** (working name; may be workshopped). UI copy never
says subagent, orchestrator, spawn, or Task. The model-facing tool is named `Task`
(the convention every model class already knows from training).

## Decisions taken (and what was ruled out)

1. **Topology: orchestrator-worker with one-shot summary returns.** The parent
   session delegates; specialists report back once (steerable mid-run); no
   peer-to-peer messaging between specialists. The result-message envelope stays
   generic (from/to/body) so a future adversarial-review feature could add a mailbox
   without a schema change — but v1 ships none.
2. **Orchestration layer: model-authored declarative plans, not model-authored
   code.** This ratifies open decision 1 of the 2026-07-19 orchestration spec (DAG
   over JS) and moots its decision 2 (no sandbox exists because no model-authored
   code executes). Model-authored JS orchestration is ruled out **permanently** for
   the native harness — power users wanting scripted workflows have Claude Code
   sessions in the same app.
3. **No orchestrator mode.** The Task tool attaches to any capable primary agent;
   there is no dedicated coordinator persona (Kilo deprecated theirs for exactly
   this; Codex removed its bespoke batch-jobs subsystem — batch shape lives in the
   plan data, execution lives in the parent's ordinary machinery).
4. **Delegation is gated on the ORCHESTRATOR'S model class.** The Task tool
   attaches conditionally the way Skill and MCP tools do (the only conditional
   attachments today — core tools are static), but the *criterion* is net-new:
   `CapabilityProfile` currently derives from provider type + context window and
   has no model-class concept, so this decision adds one (it dovetails with the
   Step 5 tiering rework, which needs the same axis). Weak local models don't get
   the Task tool (evidence: weak orchestrators halve delegation quality and
   serial-collapse; weak *workers* under a strong orchestrator are fine). **The
   gate applies to Task-tool attachment only, never to `createChild` itself** —
   app-initiated hidden utility specialists (titling, compaction) must keep
   working on every model class.
5. **Agent definitions: design for marketplace, ship files.** v1 = built-ins + a
   watched user folder + Claude Code `.claude/agents` format compatibility. The
   in-app "create a helper" editor and WeCoded distribution arrive with the later
   Agents & Automations work; the schema is distribution-ready from day one.
6. **CC bridge = skill + CLI over Bash** (`youcoded agent run`), not MCP (MCP calls
   never auto-background inside CC subagents; MCP sampling is deprecated). The same
   CLI is the future ACP agent entrypoint. ACP client-side (hosting third-party
   agents) is explicitly deferred to its own feature.

## §1 Architecture — a specialist is a session

A specialist is a **native session with a parent** — same `HarnessSession` driver,
same JSONL persistence, same tools, same permission machinery. No new runtime kind.

**Store changes (additive only, no migration):** `NativeSessionHeader` gains
`parentSessionId?: string`, `sessionKind?: 'root' | 'specialist'`, and
`agentType?: string` (the specialist definition id). `validateHeader` already
tolerates additive fields. Sessions with `parentSessionId` are excluded from every
top-level session/conversation list (the Kilo prune invariant) and from
conversation-store sync (the CC-subagent-id poisoning hazard documented in
`youcoded/docs/conversations.md` under "sessionIdMap"). **But note the carve-out
shape:** native sessions are deliberately identity-mapped into `sessionIdMap`
(`ipc-handlers.ts`, the "NO CC SessionStart hook" block) so lease release and
holder teardown pick them up — children must be excluded from *listing and sync*
while still getting teardown/lease handling, either through their parent's
lifecycle (preferred: cascade-cancel already ties child fate to the parent) or
their own map entries. The implementation plan must decide this explicitly rather
than skipping the branch wholesale.

**The Task tool** is a `defineTool()` tool, attached dynamically like Skill/MCP,
gated on the capability profile (decision 4). Schema:
`{ description, prompt, agent, work_dir, background?, task_id? }` — `task_id`
resumes a prior child (own children only), `work_dir` is the explicit
cwd-contract parameter, validated by the app to canonicalize inside the parent's
workspace.

**Spawn path:** `NativeSessionHost.createChild(parentId, opts)` mints a child
sessionId, reuses the existing `create()` wiring (own `LiveEntry`, own
`appendChain`, own JSONL file), resolves the specialist definition into the child's
preset body and tool list, and retains its model via the existing `modelRefs`
ref-counting.

**Event flow:** the child persists under its own sessionId; for display its events
are **re-stamped** with `parentAgentToolUseId` (the Task call's toolCallId) and
`agentId` (child sessionId) and re-emitted under the **parent's** sessionId —
landing in the existing `applySubagentEvent` → `AgentView` → `SubagentTimeline`
renderer path with zero renderer changes. The native tool emits `toolName:
'Agent'`-shaped events for exactly this reason. Known pre-existing gap to close
while there: subagent `assistant-thinking` routing (`youcoded/docs/native-runtime.md`
line 14).

**Structural invariants:**
- **Children never receive the Task tool.** Depth control is by toolset omission
  (Cline/Goose pattern), not a counter. Default depth is therefore 1 by
  construction; any future depth increase is a deliberate config, not a bug.
- **Single-writer:** at most one write-capable specialist runs at a time; readers
  parallelize freely.
- **Cascade-cancel:** parent interrupt/stop cancels children (and their pending
  permission asks — explicitly wired; the broker's `cancelSession` is per-session
  and will not do this by accident).
- Specialists resolve from the parent's binding by default; a definition's model
  preference overrides with graceful fallback (see §2).

**Child context (decided, not by omission): cold start.** A child's context is
built fresh from: the specialist definition body (system prompt) + the standard
env block + budget-fitted project instructions for its `work_dir` + the Task
prompt. **No parent conversation history, no parent skills catalog, no MCP tools**
in v1 (each is attachable later via definition fields; MCP grants are per-tool
already). The Reviewer's isolation is therefore **structural at spawn** — its
context simply never contains the producing conversation, only the work-product
references in its prompt; this is construction, not convention. Codex's
fork-context filter (inherit parent transcript filtered to user messages +
assistant final answers) is a **deliberately deferred** second spawn mode — the
research LIFT verdict stands, but it ships after cold-start proves out, not in
stage one.

## §2 Specialist definitions

**Built-ins (four visible + hidden utilities):**
- **Explorer** — read-only (files, search, web). Parallel-safe workhorse.
- **Worker** — general-purpose with edit access. Runs solo (single-writer).
- **Reviewer** — read-only; receives ONLY the work product, never the producing
  conversation (structural: §1 cold-start context construction, not a prompt
  convention); prefers a *different model* than the producer when available
  (verifier-independence evidence).
- **Researcher** — Explorer tuned for the Assistant preset: web-heavy, sourced
  summaries.
- **Hidden utility specialists** (opencode pattern): session titling and
  compaction-summarization become hidden agents on this same machinery over time —
  one mechanism, fewer bespoke paths. (Migration of the existing title/compaction
  paths is optional cleanup, not a v1 gate.)

**Definition = file:** frontmatter (name, description, model preference, allowed
tools, permission ruleset, step cap) + body = system-prompt instructions. Sources in
precedence order: bundled built-ins → project folder (including **`.claude/agents`
`.md` frontmatter** for CC compatibility) → personal folder, watched and
hot-reloaded (chokidar; Cline pattern).

**CC-format compatibility is safety-relevant, not just convenience:** a CC agent
file's `tools:` list uses CC tool names and CC semantics, and §5's consent model
depends on charters being *accurate* — a mis-mapped definition could render
"read-only" on the launch card while actually holding write access. The
implementation carries an explicit CC→native tool mapping table, and **narrows on
any ambiguity**: unmappable or unrecognized tool grants are stripped (with a
visible warning on the definition, not silently), and the launch-card charter is
always rendered from the *mapped* result, never from the source file's claims.

**Marketplace-shaped from day one:** the schema reserves `id`, `version`, `author`,
and a **declared permission summary** so a future WeCoded surface can render "this
specialist can edit files and browse the web" before install (the OpenClaw ~12%
marketplace-malware audit makes pre-install permission display non-negotiable).
Nothing else marketplace-related is built now.

**Model preference, not lock:** definitions may prefer a class ("cheap/local",
"strongest available") or a model; resolution goes through the capability registry
and falls back to the parent's binding when unavailable. Provider-specific params
never carry across model families (Goose hygiene rule).

> **Amended 2026-08-12 (Destin's ruling, plan 1b Task 14):** the classes are two
> **user-designated tiers — `budget` and `frontier` —** each set to a concrete
> model in a Settings menu (pickers ship in plan 1c). **No automatic price-based
> selection anywhere**; an unset tier degrades gracefully to the parent's binding,
> stated honestly. The Task call may additionally name a specific model — only at
> the user's direction — validated against the live catalog and **refused, never
> substituted,** when unknown; a read-only ModelSearch tool (attached only
> alongside Task) lets the orchestrator browse the catalog to find exact ids.

## §3 Execution lifecycle and durability (stage one)

- **Foreground and background.** Foreground waits; anything long runs in
  background. A foreground run can be **promoted** to background mid-run — by the
  user (card action) or by the model on a later turn; no automatic timeout
  promotion in v1 (opencode's race(wait, promotion)). Background completions are **injected as a
  synthetic user-role turn at an idle boundary** — never spliced mid-turn
  (preserves role alternation and the local prompt cache). The completion payload
  is self-contained (task, specialist, timing) because the parent may not remember
  why the child existed.
- **Turn-context ledger (MOIM pattern):** every parent turn includes a compact
  block listing running/finished specialists ("Nadia (Researcher): step 3, 40s")
  so the model never polls and never forgets a child exists.
- **Steering:** the parent (or the user, via the parent) can send a mid-course
  correction to a running child, applied at the child's next iteration boundary —
  a tool call is never cut (Hermes). Missed steers drain into the completion
  record. `interrupt` and `list` complete the management surface.
- **Result caps that cannot blow up the parent:** per-child report budget =
  min(static cap, parent's remaining context headroom × fraction ÷ concurrent
  reporters). Overflow spills to a file with a pointer footer; the parent re-reads
  on demand ("summary + paths, not compressed prose" — the telephone-game
  mitigation). **Structured reports:** a definition or Task call may declare a JSON
  schema for the report; validated with exactly **one** retry carrying the errors
  verbatim.
- **Weak-model hardening:** recover `tasks`/args emitted as JSON strings; reject
  placeholder prompts (`TODO`, "task 1", unexpanded template markers — narrow
  regex); constrained decoding for the Task call itself on local models (existing
  tool-grammar machinery).
- **Liveness is heartbeat-based, not wall-clock:** no default child timeout; idle
  and in-tool staleness thresholds, and an open model request always refreshes the
  heartbeat (slow local prefill is never killed). Composes with the existing stall
  watchdog.
- **Single-writer, precisely:** among specialists, a second write-capable spawn
  while one runs gets a typed `writer-busy` result (queue or wait — same shape as
  `at-capacity`). **The parent is not blocked** from its own edits in v1 —
  enforcement there would be invasive and no shipped harness does it — but the
  Task tool's description instructs the model not to edit files while a Worker
  runs, and the turn-context ledger keeps the running Worker visible. Stage two is
  stricter: the plan validator **rejects** fan-out (`map`) over write-capable
  specialists structurally.
- **Child failure is a typed result, not silence:** a child that dies mid-run
  (provider error, engine crash) resolves the parent's Task call with an error
  result naming what happened plus a pointer to the partial transcript — the
  parent model decides retry/respawn/report. (The §8 fakes exercise exactly this.)
- **Child context exhaustion:** children run the same two-stage compaction as any
  session; if a child overflows again after compacting, it is told to finalize —
  write up what it has and return. Expected week-one behavior for small local
  windows, so it is a designed path, not an edge case.
- **Concurrency: reserve-slot counter** with a typed, model-visible
  `at-capacity{max}` result the model can react to (queue or wait). Derived **per
  provider**: hosted defaults to **4** (config constant); local derives from the
  engine's measured parallel capacity (live probe, §8 — never a copied constant).
  Plus a per-conversation spawn budget as the runaway backstop.
- **Restart survival:** background delegation state rides the session store, not
  memory. On relaunch: completed-but-undelivered reports are delivered (claim/
  release semantics); mid-flight children are marked **interrupted** honestly, with
  their partial transcript and one-tap resume (they are ordinary resumable
  sessions). Owner-liveness is checked PID+start-time (Hermes) so a crashed
  instance's children are recovered, not orphaned.

## §4 Plans (stage two)

**A plan is data, never code:** a schema-validated JSON document composed of
building blocks — `map` (fan out one specialist per item), `verify` (checker per
result), `combine` (synthesis step), `repeat` (bounded loop-until, explicit cap).
Every node executes as an ordinary §1 child session. Local models author plans via
the same constrained-decoding path as tool calls.

- **Plans are authored as a tool call** (`propose_plan`, args = the plan
  document), so local models produce them through the *same* `--jinja` tool-arg
  grammar path as every other tool call — the repo has no top-level-JSON
  constrained mode and must not gain one (`provider-registry.ts`: "NEVER a
  top-level json_schema"). Whether that grammar holds up on a large nested schema
  is **live probe 3** (§8); if fidelity is poor on small models, plan authoring
  falls under the same model-class gate as the Task tool.
- **Pre-flight, with honest arithmetic:** every plan node carries an enforced
  per-child token budget (defaulted from the specialist definition); the card's
  worst-case = Σ(node budgets × fan-out) priced per model. The ceiling is honest
  *because the budgets are enforced caps, not estimates*. Dollar figures appear
  only for models with pricing data (a Step 4 / model-metadata dependency —
  **not yet landed**); token ceilings always appear. The plan renders as a
  reviewable card: **Approve / Comment** — Comment enters the annotation/markup
  mode (the ask-reference evolution), and the assistant revises. Plans under a
  user-configurable threshold auto-approve.
- **Execution journal:** each completed node's result is recorded in the plan's
  journal at completion. **Budgets are hard stops** — token/spend caps pause the
  plan and ask, never warn-and-continue.
- **Re-planning, not clever plans:** when a result invalidates the remainder (or a
  `repeat` cap hits), the executor stops and returns control to the assistant,
  which writes the next plan. Cycles and judgment live between plans, in the
  model — never inside plan logic. This is the design answer to the
  "agents aren't DAGs" critique.
- **Resume is the headline:** journal + child sessions ⇒ an interrupted plan
  resumes across app restarts — completed steps return cached results instantly,
  unfinished work runs live. Editing a plan replays the unchanged prefix from the
  journal for free.
- **KV-cache discipline:** specialist system prompts share a deliberately identical
  prefix so local-engine prefix reuse can survive fan-out — contingent on the §8
  live probe; if reuse doesn't survive, local fan-out defaults get more
  conservative and the plan card's cost preview says why.

## §5 Permissions and safety

**Inheritance (strictest wins):**
1. Parent **denials** (and external-directory rules) always flow down; parent
   **allowances do not** (opencode).
2. The specialist's charter (its definition's ruleset) caps further; nothing
   widens a running specialist beyond its charter.
3. The **calling agent's restrictions stick** — no privilege escalation by
   delegation. Kilo's other two guards also apply: primary agents are invalid
   Task targets; `task_id` resume is own-children-only.

**Consent at the delegation boundary (Destin, 2026-08-11 — replaces per-action
prompts):** the launch card states the envelope ("3 Explorers · read-only; 1 Worker
· can edit files and run commands in this project"); approving the launch (or the
plan, in stage two) **is** the permission grant. Inside the envelope, specialists
do not prompt. This is deliberately *not* CC's silent acceptEdits upgrade — the
elevation is visible, scoped to the declaration, and refusable at launch. Full Auto
skips launch consent (already approve-everything); a strict per-action toggle
exists in settings. Remembered "always allow" grants are keyed **specialist +
rule** — which is a **permission-store schema evolution, not a drop-in**: the
persisted file is `v:1`, keyed by project slug only (with documented slug-collision
caveats), so the specialist dimension arrives as a `v:2` migration designed
alongside the M5 permissions UI (revocation must render the specialist key too).

**Always cuts through the envelope:** the destructive deny-list, the bottom-tier
tool guards (secrets, external dirs) — no charter or envelope overrides them — and
anything outside the stated envelope (a read-only specialist's write attempt is
refused outright, not prompted). `work_dir` must canonicalize inside the parent's
workspace, verified by the app.

**Away-timeout redirect (Destin's design, 2026-08-11 — novel; no shipped harness
does this):** when a hard-gate ask goes unanswered for **5 minutes** (configurable;
deliberately different from the 2h interactive-session hold in the 2026-07-30
timeout spec), the specialist receives a scripted redirect in the tool result:
the action requires user permission and remains **pending** — continue only
assigned work that does **not** depend on the blocked action; if everything
depends on it, write up progress and stop; do **NOT** attempt the blocked action
by other means. The ask stays queued with a status-bar badge; on the user's
return, approval is delivered as a steer (child running) or a resume (child
finished). Builds on the timeout spec's verified mechanism (deny messages land
verbatim in the model-visible tool result). Two guardrails are load-bearing in the
wording: the no-workaround clause and the no-building-on-sand clause.

**Approvals route to the parent's surface:** child asks render as the standard
permission card, labeled with the asking specialist, routed via the parent session
(closes the "no window owns the child" gap; Cline's forwarded-approval pattern —
Goose's forced-auto punt is the documented anti-pattern).

**Reports are information, never authority:** nothing a child emits can approve,
deny, or trigger a privileged parent action (agent-teams' untrusted-messages rule).
This doubles as the memory/context-poisoning stance: specialist output gets web-
content-grade skepticism, and load-bearing claims prefer re-readable file artifacts
over summarized prose.

## §6 UX

- **Launch card = consent envelope:** lists each specialist with charter; collapses
  to one line on completion. **Live rows** per child: status, current action, tools
  used, tokens/cost (fed by the existing transcript-event pipe; Cline's shape).
- **Rendering reuses the existing CC Agent tool cards** (nested `SubagentTimeline`)
  — native children emit the same parent-linked events, so the cards work
  unchanged. Tapping opens the child's transcript in the ordinary session viewer
  with a parent breadcrumb. Children never appear in the conversations list.
- **Names:** every spawned specialist is titled **"{Name} the {Descriptor}
  {Role}"** — descriptor alliterates with the role, drawn randomly from per-role
  pools in a plain word-list file (John the Exuberant Explorer, Nadia the Rambling
  Researcher, Priya the Ruthless Reviewer, Marcus the Whistling Worker). Full title
  on launch card and transcript header; first name in compact rows. Names draw
  **without replacement per conversation** (no "John and John" in one fan-out).
  Pools are trivially extensible (future theme/marketplace flavor hook).
- **User steering path:** the child's card and its transcript view carry a
  "send a note" action — text goes through the same steering channel the model
  uses (§3), applied at the child's next natural pause. The model's path and the
  user's path are one mechanism.
- **Attention, not vigilance:** a quiet status-bar indicator while specialists run
  ("2 specialists working") that becomes a badge when something needs the user
  (queued ask, finished report, paused plan); click-through jumps to the card.
  Deliberately a single indicator in v1 — the full cross-conversation Inbox
  belongs to Agents & Automations later.
- **Plan cards** (stage two): readable checklist + worst-case cost, Approve /
  Comment (markup mode), progress view while running, honest budget pauses, and a
  resume card after restart showing surviving steps.
- **Copy:** "specialists", "reports", "helpers' work" — never subagent/spawn/
  orchestrator. First-run (i) explainer, two sentences, per app convention.
- **Both clients:** shared React renderer ⇒ desktop and remote web get identical
  treatment (standing program rule). Android is out of scope until M8.

## §7 The Claude Code bridge (and ACP posture)

- **`youcoded agent run <specialist> --task <text> --dir <path>`** runs a native
  child session headlessly and prints the report (full output to a file, bounded
  summary to stdout). It is the same child-session machinery — a bridge-spawned
  specialist is persisted, inspectable, and resumable like any other. **CLI
  packaging is its own workstream:** the app currently ships no `bin` entry at
  all, so the executable, its packaging on three platforms, and its path onto
  users' PATHs are net-new and budgeted separately in the plan.
- **A bundled CC skill** teaches Claude Code sessions to delegate through it:
  `run_in_background` for long jobs (CC's task notifications deliver the result),
  stdin redirected (`</dev/null` — the known agent-CLI gotcha), results treated as
  untrusted input. Ships as a bundled plugin like wecoded-themes-plugin.
- **Why not MCP:** MCP calls never auto-background inside CC subagents; sampling
  deprecated 2026-07-28. An MCP wrapper may be added later if typed schemas prove
  valuable; it is not v1.
- **ACP:** the CLI is shaped to become the ACP agent entrypoint (stdio JSON-RPC
  adapter over the same harness) — agent-side ACP is a fast-follow candidate,
  client-side ACP (hosting registry agents in YouCoded) is deferred to its own
  design. Nothing in v1 may block either.

## §8 Testing and verification

- **Pinning tests** (fakes must be able to express failure — dead child mid-run,
  garbage model output): denies flow down / allows don't · children lack the Task
  tool · charter refusals (read-only write attempt) · caller-restriction stickiness
  · own-children-only resume · reserve-slot cap + typed at-capacity result ·
  cascade-cancel including pending asks · headroom result caps + spill · one-retry
  schema validation · timeout-redirect wording contains both load-bearing clauses ·
  restart recovery delivers undelivered reports and never re-runs completed work ·
  plan journal replay · budget hard-stop.
- **Harness review battery:** add delegation tasks to the roster (over-delegation
  of trivial work, serial collapse, placeholder prompts). Offered per its standing
  rule; paid runs only when Destin says so.
- **Live probes BEFORE implementation locks defaults**: (1) the local engine's
  real parallel capacity and the right `--parallel`/slot configuration for the
  router setup (nothing introspects this today — net-new); (2) whether KV prefix
  reuse survives specialist fan-out on our llama.cpp build (both flagged
  "measure, don't assume" since July); (3) **grammar fidelity of the `--jinja`
  tool-arg constraint on the large nested `propose_plan` schema** across the
  local model roster — added after review; plan authoring depends on it (§4).
  Results recorded in `youcoded/docs/engine-dependencies.md`.
- **Workbench-first UI:** all cards/rows/badges built against mocked events in the
  UI Workbench (`MOCK_ONLY` channels become the backend to-do list);
  `workbench-boot-check.mjs` after shim changes. Interactive/visual sign-off is
  Destin's, per the standing handoff rule.
- **Per the program's §3 rules:** milestone plan doc before implementation; rule +
  depth doc + `docs/MAP.md` updated in the same PR as code; exercised on desktop
  renderer and remote web client.

## Phasing

1. **Stage one — specialists** (usable alone): store fields, Task tool, spawn/
   lifecycle, definitions incl. CC-compat folder, permissions + envelope consent +
   timeout redirect, durability, chat UI. Ships before stage two starts.
2. **Stage two — plans:** plan schema + validator + executor + journal + plan
   cards + markup review. Depends on stage one and on live-probe results.
3. **Bridge** (parallel-friendly): CLI + bundled CC skill; can land alongside
   stage one's tail.
4. **Later, elsewhere:** in-app specialist editor + WeCoded distribution (Agents &
   Automations), ACP agent-side fast-follow, ACP client-side design, full Inbox,
   Android (M8).
