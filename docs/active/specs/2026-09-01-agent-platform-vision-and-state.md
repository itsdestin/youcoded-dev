---
status: active
date: 2026-09-01
type: vision
supersedes:
  - docs/archive/specs/2026-07-09-platform-vision-roadmap.md
  - docs/archive/plans/2026-08-11-native-sessions-remaining-work.md
  - docs/archive/plans/2026-08-11-super-agent-roadmap.md
tags: [native-runtime, specialists, agents, automations, vision]
---

# Native sessions, specialists, and assistants — the vision and where it stands

**What this is.** One document for the whole "YouCoded runs its own agents" family: native
(non-Claude-Code) sessions, the harness and its tools, permissions, specialists, and the
Agents & Automations surface that has not been built yet. It replaces three documents that
each called themselves a roadmap (the 2026-07-09 platform vision, the 2026-08-11 parity
program, the 2026-08-11 super-agent sequence) and were drifting apart.

**What this is not.** It is not the tracker. `ROADMAP.md` stays the only list of open items;
every open item named here exists there under the same title. Per-feature specs stay
authoritative for their feature (§11 lists the live ones). This document is the WHY, the
shipped end state, the long-term shape, the recorded order of work, and the decisions —
settled and owed.

**How to keep it honest.** No progress log. Each state claim below carries the date it was
verified against `origin/master`; a session that finds one false fixes the claim in place and
re-dates it. The 2026-07-09 vision rotted precisely because corrections went into a log
instead of the body.

---

## 1. The vision in one page

YouCoded becomes a **comprehensive AI-agent management platform that runs on any model**:
Claude via a Claude subscription, any cloud model via OpenRouter or a direct key, or a small
model running on the user's own machine. Claude Code stays the polished premium backend, but
it is one integration among several, not the app's identity.

The product bet, unchanged since 2026-07-09 and still true of the market: nobody combines
**(a)** local-first multi-model, **(b)** a non-developer-friendly UI, **(c)** a social and
marketplace layer, and **(d)** agents that run on their own, in one consumer app. Cowork and
ChatGPT Work own "agentic assistant for normal people" but are closed, cloud-only and
single-vendor. OpenClaw and Hermes own "own your agent" but are developer-hostile. That
intersection — **the open, personal Cowork** — is YouCoded's lane.

Three layers make it real, and they are being built in that order:

1. **A native runtime** — YouCoded's own agent loop with the same tool set, permission model,
   skills, MCP and chat UI a Claude Code session gets. *Largely shipped (§4).* The standing
   north star: a user should not feel any obvious difference between a native session and a
   Claude Code session beyond model choice.
2. **Specialists** — the runtime delegating to child sessions, so one conversation can fan
   work out, run it in the background, and get reports back. *Stage one shipped; stage two
   (declarative multi-step plans) unbuilt (§5.3).*
3. **Agents & Automations** — a third top-level view beside Chat and Projects where a
   non-developer sets up work that runs on a schedule or a trigger without them, gets asked
   when the run needs a human, and finds the results in an inbox. Local models make 24/7
   automations free, which is the reason layers 1 and 3 belong in the same product. *Nothing
   built; the unit of organization is under live question (§6.1).*

Underneath all three: the WeCoded marketplace serves every backend (skills are SKILL.md,
tools are MCP, instructions are AGENTS.md with CLAUDE.md as fallback), and `~/.youcoded/` is
the source of truth that Claude Code's config is *exported* from, not the other way round.

---

## 2. Vocabulary

The family has accumulated five overlapping nouns. This table is the current meaning of each;
§9 lists the conflicts that still need Destin's ruling.

| Word | Means today | Where it is fixed |
|---|---|---|
| **Native session** | A conversation driven by YouCoded's own loop instead of the Claude Code process. Same chat UI, same transcript events. Runtime selector reads `Claude Code \| YouCoded`. | shipped, `native.supported` on since 2026-07-16 |
| **Harness / preset** | System prompt + tool set + loop policy + permission posture. Two presets ship: **Assistant** (files scoped, web, approval-first) and **Coder** (full agentic loop). A **custom harness builder** is planned, not built. | `preset-registry.ts`; builder = Phase 3 item 3 |
| **Tool** | One of the sixteen native tools (Read, Write, Edit, Bash, BashOutput, KillShell, Glob, Grep, WebFetch, WebSearch, TodoWrite, AskUserQuestion, SendUserFile, Skill, Task, ModelSearch). Named exactly as Claude Code names them so every tool card renders unchanged. | ADR 009 |
| **Specialist** | A native session with a parent. The model-facing tool is `Task`; the user-facing word is *specialist* (or *helper*); UI copy never says subagent, orchestrator, spawn or Task. Four built-ins (explorer, researcher, reviewer, worker) plus user files in `~/.youcoded/specialists/` and Claude Code's `.claude/agents` format. | specialists spec, shipped 1a/1b/1c |
| **Plan** | Stage two of specialists: a schema-validated document (map / verify / combine / repeat) the model proposes as a tool call and the user approves as a card. Data, never code. | specialists spec §4, unbuilt |
| **Agent** (2026-07-09 sense) | "A named automation": harness + model + instructions + workspace + trigger. The single object the Agents & Automations view was designed around. | vision §3.5, unbuilt |
| **Assistant / Duty** (2026-09-01 sense) | Destin's proposed replacement for the object above: an **assistant** is the named container ("my Office assistant"); a **duty** is one recurring job it is responsible for, implemented as a specialist or a skill. See §6.1. | captured, not designed |
| **Inbox** | Where runs that need a human (a permission ask *or* a content question) wait, and where finished runs report. | unbuilt |

Two collisions to keep in view: **"Assistant" already names a shipped preset and an unmerged
Settings panel mockup**, and the specialists spec's headline noun becomes "an implementation
detail" under the assistant/duty framing. Neither is resolved here (§9, items 1–2).

---

## 3. The layers

```
┌────────────────────────────────────────────────────────────────┐
│  React UI: chat, tool cards, projects, artifacts, settings      │
│  + Agents & Automations view (unbuilt)                          │
├────────────────────────────────────────────────────────────────┤
│  transcript-event protocol — unchanged, proven by three feeds   │
├──────────────┬──────────────────────────────┬──────────────────┤
│ Claude Code  │  NATIVE RUNTIME              │ (future: other   │
│ session      │  HarnessSession loop         │  CLI providers — │
│ (PTY +       │  16 tools · permissions ·    │  Codex etc.,     │
│  watcher)    │  skills · MCP · specialists  │  under question) │
├──────────────┴──────────────────────────────┴──────────────────┤
│  PROVIDER LAYER (Vercel AI SDK) — local llama-server ·          │
│  OpenRouter · Anthropic · OpenAI · Google · Ollama/LM Studio    │
├────────────────────────────────────────────────────────────────┤
│  LOCAL ENGINE — supervised llama-server (router mode),          │
│  GGUF model manager with VRAM-fit guidance                       │
└────────────────────────────────────────────────────────────────┘
```

The load-bearing seam is the transcript-event protocol: any backend that emits the eight
event types gets the whole chat experience with zero reducer or UI changes. The native
runtime lives in the desktop main process (`youcoded/desktop/src/main/harness/`); Android
today has none of it and answers every `native:*`, `specialists:*`, `engine:*` and `models:*`
channel with `not-implemented-on-mobile` (verified 2026-09-01, `SessionService.kt`). Depth for
everything shipped: `youcoded/docs/native-runtime.md`.

---

## 4. Shipped — the timeline (verified against `origin/master` 2026-09-01)

| Date | Milestone | What a user got |
|---|---|---|
| 2026-07-10 | Phase 0 — provider seam (youcoded #115) | `Claude Code \| YouCoded` runtime selector; Gemini CLI removed |
| 2026-07-13 | Phase 1 A — providers + chat sessions (#119) | `~/.youcoded/` home, encrypted keys, OpenRouter/direct-key chat with no tools |
| 2026-07-13/14 | Phase 1 B/C — local engine + model manager | llama-server supervised in-app, curated GGUF downloads with RAM/VRAM fit, Local Models settings |
| 2026-07-16 | Phase 2 A — agent loop, 7 core tools, permissions (#149) | Real agentic native sessions; `native.supported` flipped on in production the same day (#160) |
| 2026-07-17 | Phase 2 B — web tools, AskUserQuestion, presets (#156) | Ten-tool suite; Assistant + Coder presets |
| 2026-07-22 | M1 session control (#204) | Send queue, honest send results, stop button |
| 2026-07-23 | M2 conversations & sync (#212) | Native sessions in the conversation store: tags, notes, transcript browse, cross-device takeover, auto-titles. Closed the v1.3.0 sync gate |
| 2026-07-29 | Phase 2 C + M3 items 1/2/3/5 (#268) | Local-model reliability, compaction, Skill tool, `/clear` `/compact`, path-scoped rules and nested instructions injected as messages |
| 2026-08-05 | M3 item 4 — MCP phase 1 (#280) | MCP servers attach to native sessions from a hand-edited `~/.youcoded/mcp.json`; per-tool grants; projection into Claude Code's config |
| 2026-08-10 | Tool honesty + review battery (`eba51705`) | Every tool declares what it omitted; a multi-model review runner |
| 2026-08-11 | M4 reliability + images (#289–#293) | Outlined project instructions, cache chips, images in messages, the model reading an image by path |
| 2026-08-12/13 | M5 permissions maturity (#311–#314) | Settings → Permissions lists and revokes every grant; Full Auto safety stops; exact-vs-scoped Bash grants |
| 2026-08-13 | Harness evaluator | `harness-eval.mjs`: any case × code version × instruction file × model, graded, spend-capped |
| 2026-08-12 | Specialists 1a (`8db46236`) | The `Task` tool; foreground child sessions with a consent envelope and a report card |
| 2026-08-16 | Specialists 1b (`e5ec5b3c`) | Background specialists that outlive the turn, restart-durable delivery, mid-run steering, asks routed to the parent's card, budget/frontier model tiers |
| 2026-08-26 | Specialists 1c (`62c1f182`) | File-defined specialists (personal + Claude Code agent files), one card per helper, Settings roster, scoped Always-allow |
| 2026-08-26→28 | Native tools ledger batches A/B/C (#352–#357) | Ten-harness comparison fixes: strict params, Grep flags, PDF reading, Glob honesty |
| 2026-08-28 | Background Bash (G-1) | `run_in_background`, `BashOutput`, `KillShell`; time limits hand off instead of killing |
| 2026-08-27→31 | Cost/pricing for native and specialists | Session cost chip fed by real per-model pricing (three known accounting bugs remain, §5.5) |

What is **deliberately absent** as of 2026-09-01: any scheduling, trigger, routine, webhook or
automation code; any DAG or pipeline orchestration; a native "bypass" permission mode; MCP
management UI; Android native runtime; the words *assistant*, *duty* or *coordinator* as
concepts in code.

---

## 5. Where each workstream stands

Every item below is an open `ROADMAP.md` entry unless marked otherwise; titles match.

### 5.1 Parity — "no obvious difference beyond model choice"

Recorded order from the 2026-08-11 program, re-verified 2026-08-26 and unchanged since:

| # | Step | State |
|---|---|---|
| 3 | **Session context transparency panel** (broadened from "tell the user what was truncated") | Design approved 2026-08-17, tabbed mockup on `feat/context-truncation-notice`; **backend unbuilt** (`native.onSessionContext` does not exist). Handoff: `docs/active/handoffs/2026-08-17-session-context-panel-handoff.md` |
| 4 | **Ground-truth model metadata** — pricing incl. `input_cache_read`, context, tool support, discovered not curated | Unbuilt. Blocks 5 and the cost chip's correctness |
| 5 | **Capability tiering rework** (four tiers: small/big local, small/frontier cloud) + fold `model-step-budget.ts` into the profile | Unbuilt. The specialists `Task` gate (`canDelegate`) already needs this model-class axis |
| 6 | **M4 leftovers** — folderless sessions | Unbuilt, low priority. (Image-by-path shipped; cost chip shipped but see §5.5) |
| 7 | **Multi-model cwd contract** — Bash `workdir`, file-tool relative-path policy, one canonical cwd-rules block | Items 1 and 4 unbuilt; item 2 shipped differently (miss hints). **Blocked on a decision, not code** (§9 item 6) |
| 8 | **MCP phase 2** — settings UI, adopt flow, `mcp:*` IPC parity | Unbuilt; phase 1 is developer-operable only |
| 9 | **Specialists then orchestration** | Specialists done. Orchestration = stage two, §5.3 |
| 10 | **M8 Android native runtime** — LAN engine access → on-device Termux inference → cloud keys in keystore → agents as viewer | Untouched. Largest remaining piece; also owns Android parity for session metadata and the permissions screen |
| 11 | **M9 onboarding equality** — three equal first-run choices, no default provider | Untouched |

Also live in this bucket: **Git Branch chip missing in native sessions**; **Project-scoped
skills** (`<cwd>/.claude/skills/` never discovered; spec + plan exist); a dozen native-session
turn/stream/resume bugs (resumed sessions showing tools "running", the whitespace-step
history divergence, the orphaned "Preparing…" card).

### 5.2 Permissions

Shipped: the engine, three modes, the deny-list, remembered grants keyed
`(tool, pattern, action, match, specialist)`, the Settings screen, live revocation, the
cross-project bucket for specialist charters. Open:

- **Permission asks expire after 5 min and wedge the session** — *built* on
  `feat/permission-ask-timeout` (PR #278, 2026-07-31) but 1,100+ commits behind and
  conflicting; the 09-01 inventory's verdict is "rewrite the plan, not a rebase". Native
  *specialist* asks already hold for 5 min then redirect; the root/Claude Code path does not.
- **Full Auto still interrupts for reading files outside the project** — spec
  `2026-08-18-full-auto-external-directory-permissions-design.md` + plan approved, **0/37
  steps**; its worktree is empty.
- **Native sessions have no bypass mode** (toggle hidden, hardcoded off) — never wired.
  Investigation `2026-08-09-native-skip-permissions.md` argues the shape.
- **Bash containment** (super-agent step 7) gated on **Sandboxing vs. scratch workspace —
  pick one** (§9 item 7). Port Claude Code's `rm`-target analyzer as the floor.
- **"Almost covered" notice** — deferred by design from M5 2c.

### 5.3 Specialists — stage one done, stage two not started

Shipped (§4). Open, in the roadmap (re-verified 2026-09-04): child-transcript GC (blocked
on a general delete-conversation feature), Activity notes appending rather than interleaving
(fix on an unmerged branch), and six named follow-on ideas — the stale-resend and
unclamped-missed-steers bugs were fixed on 2026-09-02 (promote a foreground hire to background
mid-run, open a helper's own transcript, …).

**Stage two — plans** (`docs/active/specs/2026-08-11-native-specialists-design.md` §4): the
`propose_plan` tool, schema + validator + executor + journal, plan cards with worst-case
token/dollar ceilings that are enforced caps, hard-stop budgets, re-planning instead of
clever plans, resume across restarts. Not started. The three **live probes the spec requires
before design is final were run 2026-09-04** on the pinned engine build
(`youcoded/docs/engine-dependencies.md` → "Stage-two probes"): four helpers at once is the
ceiling and the shipped launch shape shares one context pool across them; prefix reuse only
partly survives the first simultaneous fan-out, so the card must charge a full prefill per
child; plan authoring through the tool grammar is reliable from the 9B model class up and
absent below it, so `propose_plan` is a model-class gate, not cloud-only. Design can proceed
once §9 items 1–3 are ruled (`docs/active/handoffs/2026-09-04-stage-two-decisions-prompt.md`). The Claude Code bridge (`youcoded agent run` CLI + bundled skill) is also unbuilt and
needs a `bin` entry the app has never shipped.

**Verification debt:** the 1c hands-on checklist
(`docs/active/handoffs/2026-08-16-specialists-1c-testing-checklist.md`) has **fifteen empty
result tables**. Check 9b — a permission grant leaking between helpers — is the one to run
first, and it needs a real model.

### 5.4 Capability — the super-agent track

Things Claude Code does not do either, sequenced 2026-08-11 under the rule **measurement
before mutation, durability before memory, containment before autonomy**. All still unbuilt
(verified 2026-08-26, no relevant commits since):

1. **Error analysis on stored conversations** → a failure taxonomy that drives eval cases.
   Its accelerator `conversation-triage.mjs` was destroyed by a `git clean` and now survives
   only as a commit on `feat/assistant-settings-mockup`.
2. **Harness eval CI gate** + case selection from that taxonomy.
3. **Anthropic `cache_control` breakpoints** on the cloud path (tracked under the cache-efficiency bug).
4. **Finish the harness event log** — per-step wire record, fsync at turn boundaries. Prerequisite for faithful resume and for memory.
5. **Agent memory** — chatsearch as a native tool + a bounded agent-maintained index + pre-compaction flush. The centerpiece.
6. **Bash containment** (also §5.2).
7. **Goal layer** — checkable goals on the existing step/doom-loop machinery. Deliberately last.
8. **Formalize the remote protocol** — version the WS API, add a lifecycle event bus, eventually reconcile Android's Kotlin runtime.

### 5.5 Cost and model intelligence

The cost chip shipped but three faces of one defect remain: the accumulator does not
partition by model across a mid-turn swap, compaction's own `streamText` call is invisible to
it, and the self-check dilutes per-model error. Cache efficiency on both cloud and local is
below what the byte-stable prompt should allow. All wait on §5.1 step 4.

### 5.6 Evaluator and rigs

Shipped as a dev tool; run four times, found nine real defects tests did not. Open: the
orchestrator test red on a clean checkout; `review-harness.mjs` still leaks the API key via
the environment; the perf rig cannot see native per-token streaming.

### 5.7 New surfaces no plan has picked up

- **Custom harness builder** (Phase 3 item 3): pick a preset → edit prompt → toggle tools →
  set permission policy → bind a model, saved as a shareable JSON manifest and eventually a
  marketplace item. Nothing designed. Prerequisite: `HarnessManifest.tools` today has no
  consumer — preset tool lists are decorative.
- **"Assistant settings" panel** — Defaults + Permissions + Model Providers as one
  provider-first popup. React mockup on `feat/assistant-settings-mockup`, waiting on Destin's
  sign-off since 2026-08-26. Adjacent to the builder, not the same thing.
- **Codex as a third session provider** — spec 2026-08-31 with nine open questions. Cuts
  against the standing "no wrapped vendor CLIs" decision (§8 item 4); Destin to rule (§9 item 8).
- **Agents & Automations** — §6.

---

## 6. The long-term shape

### 6.1 Agents & Automations (Phase 4) — the headline surface

A third top-level view alongside Chat and Projects. What was designed 2026-07-09:

- **Triggers:** v1 = manual "Run now" and cron/one-time schedules; v2 = file-watch, webhook
  (explicit opt-in), app events, agent-to-agent chaining.
- **Runner:** a main-process scheduler with a persisted job store that survives restart and
  has a missed-run policy, spawning headless harness sessions with step/token/time **and
  cost** budgets. Budgets are **hard stops** — pause and ask, never warn-and-continue.
- **Inbox:** per-agent run history, states `scheduled / running / needs-approval / completed /
  failed`, a status-bar chip, native notifications, push to Android/remote later. A run's
  transcript is an ordinary session viewable read-only in the chat UI; its files land in the
  artifact viewer and Project View.
- **Backend-agnostic from day one:** an automation can bind to a local model (free, 24/7),
  an OpenRouter model, or Claude Code headless. The ordering decision of 2026-07-09 — build
  backends first, automations after — was made so the runner would not inherit Claude Code's
  PTY constraints.
- **Sharing:** agent manifests are JSON → share to friends, publish to WeCoded with security
  scanning from day one.

**The unit of organization is under live question.** The 2026-07-09 design has one object:
*an agent is one automation*. On 2026-09-01 Destin proposed two nested ones:

> An **assistant** is the thing the user names and thinks in — "my Office assistant". It
> groups the **duties** it is responsible for. An assistant may be (a) a **coordinator** agent
> that dispatches its duties, (b) the **sole** agent that performs every duty itself, or
> (c) **no agent at all** — an organizational folder of duties that each run independently.
> Shape (c) is the one that keeps this cheap: grouping must never force a coordinator into
> existence. A **duty** is one recurring job and carries its own context, instructions and
> tools; it is a *specialist* in the coordinator case or a *skill* in the sole-agent case, and
> that split is an implementation detail, not something the user is asked about.
>
> Worked example — the "Office" assistant: (1) **check email** daily, pull calendar events and
> deadlines out of it, draft deliverables for supervisors using the user's own skills;
> (2) **weekly finance report** from specific sites and local files, in a format a skill
> defines; (3) **reorder the shopping list** — review it, **ping the user to confirm it is
> right**, and only then place the order.

**"Ping the user" is a core competency of the whole system, not a per-duty extra.** A run
stops mid-task, asks a question in plain words, waits minutes or days, and resumes with the
answer. This is a *content* check-in and is **not** the `needs-approval` permission ask
already in scope; both need a durable suspend that survives restart and reaches the user on
any device, so they probably share one mechanism, but the UI must keep them distinct.
Specialists' 5-minute ask hold and delegation ledger are the shipped half of that mechanism
and nothing yet connects them to this.

Phase 4 items 1 (agent model + store) and 4 (inbox) explicitly wait on this being settled.
Open questions, none answered: does a trigger belong to the assistant or to each duty (the
example implies per-duty)? Do budgets sit on the assistant or the duty? Does a coordinator get
its own conversation the user can talk to, or is it only ever scheduled? How do duties share
context, if at all? Which shape is the v1 default — the agentless grouping is cheapest and is
probably where this starts.

**Exit criterion (unchanged):** "Every morning at 8, summarize my project's new GitHub issues
into a note and ping me if any look urgent" is creatable in-app by a non-developer, runs on a
local model for free, and its runs appear in an inbox.

**Prerequisites that already exist as tracked work:** cost accounting (§5.5), specialists
stage two's durable journal and hard budgets (§5.3), and the remote-client gap that stops a
browser user from publishing or installing a shared agent (Accounts Phase 2 follow-up).

### 6.2 Android and cross-device (Phase 5 / M8)

LAN engine access first (the desktop's llama-server exposed behind an API key and QR pairing
— Android becomes just another OpenAI-compatible client, zero new inference code); then
on-device inference under Termux with a curated ≤4B list; then cloud keys in the Android
keystore; then the Agents inbox and approvals on Android as pure UI while execution stays
desktop-side. Parallelizable after Phase 2, which is done; nobody has started it.

### 6.3 Differentiators (Phase 6)

Memory that compounds (the super-agent memory system is its first slice); multi-channel reach
(Telegram/Discord/email bridges for automation results, each a plugin); Cowork-grade
deliverables through the existing artifact viewer; an exploratory fine-tuning bridge; a
browser-use tool for harnesses; harness and agent templates as marketplace items. Only memory
has a roadmap entry today.

---

## 7. The recorded order of work

Two tracks, each internally ordered, and **no ruling yet on how they interleave** (§9 item 3):

**Parity track** (§5.1): context panel → model metadata → tiering → cwd contract decision →
MCP phase 2 → Android M8 → onboarding M9. Small permissions items slot anywhere.

**Capability track** (§5.4): taxonomy → eval CI gate → cache breakpoints → event log →
memory → containment → goals → remote protocol.

**Specialists stage two** has its three live probes (2026-09-04) and waits on §9 items 1–3 and
on model metadata (plan-card dollar figures — token ceilings can ship first). **Agents & Automations** waits for the §6.1 ruling, cost accounting, and
stage two's journal. The custom harness builder has no dependency and no owner.

---

## 8. Decisions register — settled, do not re-derive

| Date | Decision |
|---|---|
| 2026-07-09 | Build our own loop over the Vercel AI SDK; opencode is design reference, never a dependency (ADR 006). llama-server subprocess is the local backbone; Ollama/LM Studio are optional endpoints, never the default (ADR 007). `~/.youcoded/` is the source of truth; Claude Code's config is an export target (ADR 008). Native tools use Claude Code's exact tool names (ADR 009). Leaked Claude Code source is ideas-only, never code (ADR 010). |
| 2026-07-09 | Phase order stays backends → ecosystem → automations; automations on the Claude Code backend first was considered and rejected. |
| 2026-07-10 | Gemini CLI removed; **no wrapped vendor CLIs** — other vendors' models are reached through the native runtime. (Under challenge by the Codex spec, §9 item 8.) |
| 2026-07-16 | `native.supported` on in production mid-Phase-2, Destin's call; kill switch `YOUCODED_NATIVE=0`. |
| 2026-07-22 | Resume ALWAYS offers the model selector, pre-filled from a synced `lastUsedModel`; never auto-launches a device-local binding. Build the real feature, never a "not available yet" shim. |
| 2026-07-29 | The system prompt is byte-stable per session; rules, skills and instructions arrive as **messages** so local models keep their cached prefix. |
| 2026-08-11 | Specialists: orchestrator-worker with one-shot reports; **declarative plans over model-authored code, permanently**; no orchestrator persona; `Task` gated on the parent model's class; definitions are files now, marketplace later; Claude Code bridge is a CLI over Bash, not MCP. User-facing word is *specialist*. |
| 2026-08-13 | Bash grants are exact by default; widening is named, never inferred; a moving target (`git push` with no branch) gets no Always-allow button. |
| 2026-08-16 | Cost = `(input − cacheRead) × prompt + cacheRead × input_cache_read + output × completion`; the naive formula is ~10× high. |
| 2026-08-26 | Third-party CLIs, `/goal`, CC-style agent view, sandboxing-vs-scratch: filed as ideas with no design; the skip-permissions investigation's argument *against* OS sandboxing is not to be re-derived. |

---

## 9. Decisions owed by Destin

1. **The unit of organization for Agents & Automations** — the 2026-07-09 "agent = one
   automation" or the 2026-09-01 assistant/duty split, and which of the three assistant
   shapes is v1. Everything in §6.1 waits on this.
2. **The word "assistant"** — it now means a preset, a settings panel, and the proposed
   container. Pick which survives; rename the others.
3. **Interleaving the two tracks** — parity (§5.1) versus capability (§5.4). Both are ordered
   internally; nobody has said which goes first or how they alternate.
4. **Assistant settings panel mockup** — sign-off pending since 2026-08-26.
5. **Session context panel** — approved by eye; green-light the backend.
6. **cwd contract item 2** — reject relative paths outright (loud) or keep the miss hints
   (silent divergence when the same name exists in both places).
7. **Sandboxing vs. scratch workspace** — one design pass; containment and bypass mode both
   wait on it.
8. **Codex as a session provider** — nine questions in its spec; answering them reverses a
   standing decision, which is allowed but should be explicit.
9. **Permission-ask timeout PR #278** — rewrite the plan against current master, or drop it
   and accept the 5-minute expiry on the Claude Code path.
10. **Specialists 1c hands-on checklist** — run it, or accept the fifteen blanks.

---

## 10. Verification debt (shipped code nobody has exercised by hand)

- Specialists 1c: fifteen empty result tables; 9b first.
- MCP phase 1 dogfood: steps 1–5 and 7 never recorded; only the projection step was verified.
- The 40 multi-model harness reviews of 2026-08-01: no record of which were triaged.
- Master was red on Windows after 2026-08-11 for reasons `verify.sh` (Linux-only) cannot see;
  a green local run is not evidence about Windows or macOS.

---

## 11. Where the documents are now

**Live (authoritative for their feature):**
- `docs/active/specs/2026-08-11-native-specialists-design.md` — specialists, both stages.
- `docs/active/plans/2026-07-18-multi-model-cwd-contract.md` — awaiting §9 item 6.
- `docs/active/specs/2026-07-30-permission-ask-timeout-design.md` + plan — PR #278.
- `docs/active/specs/2026-08-18-full-auto-external-directory-permissions-design.md` + plan `2026-08-21-full-auto-external-read-bypass.md` — 0/37.
- `docs/active/specs/2026-08-05-project-scoped-skills-design.md` + plan.
- `docs/active/specs/2026-08-17-search-scope-and-timeout-design.md`.
- `docs/active/handoffs/2026-08-17-session-context-panel-handoff.md`.
- `docs/active/handoffs/2026-08-16-specialists-1c-testing-checklist.md`.
- `docs/archive/design/2026-08-17-assistant-settings-panel-design.md` (the React mockup supersedes its HTML prototype).
- `docs/active/specs/2026-08-31-codex-session-provider-design.md`.
- `docs/active/investigations/2026-08-09-native-skip-permissions.md`, `2026-07-28-agent-harness-frontier-research.md` — still carry open findings.
- `docs/archive/investigations/2026-08-26-native-tools-vs-other-harnesses.md` — **closed and archived 2026-09-04**; its ledger shipped or moved to `docs/roadmap/native-harness.md`. Still the reference for how YouCoded's tools compare with the other harnesses (§2–§7).
- Depth: `youcoded/docs/native-runtime.md`; rules: `.claude/rules/native-runtime.md`, `native-specialists.md`, `native-permissions.md`, `harness-tools.md`, `harness-evaluator.md`.

**Archived 2026-09-01 by this consolidation** (history and research only):
- `docs/archive/specs/2026-07-09-platform-vision-roadmap.md` — the original vision; §1–§3 remain the market and llama.cpp research record.
- `docs/archive/plans/2026-08-11-native-sessions-remaining-work.md` — the parity program (its §1 and §2 are §4 and §5.1 here).
- `docs/archive/plans/2026-08-11-super-agent-roadmap.md` — the capability sequence (§5.4 here).
- `docs/archive/specs/2026-07-15-phase2-native-harness-design.md` — shipped; its §0 decisions are in §8.
- `docs/archive/specs/2026-07-19-native-workflow-orchestration-design.md` — superseded by the specialists spec; §1–§5 are citable research.
- `docs/archive/specs/2026-07-28-context-knowledge-app-features-outline.md` — mirrored in the roadmap.
- `docs/archive/investigations/`: `2026-07-10-harness-design-ideas`, `2026-07-28-agentic-frontier-reading-list`, `2026-08-01-native-agent-harness-reviews`, `2026-08-11-subagent-platform-research`, `2026-08-10-harness-mutation-safety-prior-art`.
