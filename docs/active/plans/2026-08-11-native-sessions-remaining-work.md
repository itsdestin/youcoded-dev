---
status: active
created: 2026-08-11
type: program
supersedes:
  - docs/archive/plans/2026-07-22-native-runtime-parity-program.md
---

# Native Sessions — Current State and Remaining Work

**North star (Destin, 2026-07-22):** a user should not feel any obvious distinction between a native session and a Claude Code session, beyond model choice.

**Standing rule:** build the real feature, never an interim "not available yet" shim.

This document replaces the 2026-07-22 program doc, which had accumulated enough history, superseded decisions, and stale item descriptions that five of its seven M4 items turned out wrong when checked. Read this one. The old doc is kept only for archaeology.

---

## §1 What exists today

Everything in this section is on `master` and working. It is a description of the end state, not a change log.

### Sessions and chat mechanics

A native session is a real session everywhere the app has a concept of one. It has a send queue (FIFO, capped at 10, each entry cancellable before it sends), a stop affordance, and a send call that answers synchronously with `sent` / `queued` / `failed` and a real reason — never a phantom bubble for a message that did not go. Interrupt aborts the current turn only; the queue still drains. Native sessions ride the same transcript-event pipe Claude Code sessions do, so the chat reducer and every UI surface treat them identically.

### Conversations, sync, and resume

Native sessions are rows in the Conversation Store. Tags, flags, notes, transcript browse, and cross-device takeover all work. Takeover uses a stronger teardown than the Stop button — it clears the queue, cancels any open permission ask, aborts the stream, and waits for the turn to settle. Resume always offers the model picker, pre-filled from a portable record of the last model used, and never auto-launches a binding; the session header is never rewritten, only the live binding. Titles are generated once, at the first completed turn, by the session's own model.

### Tools and permissions

Ten native tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, AskUserQuestion. Plus Skill, attached conditionally. Bash keeps its working directory across calls within the session's root and announces any escape attempt. Every tool declares what it omitted rather than hand-writing truncation prose, and each supplies advice in its own vocabulary. Tool-call/result pairing is preserved everywhere, including after a crash or interrupt, because a dangling call breaks real providers.

Three additions landed 2026-08-11, all from harness-review findings. Bash takes an opt-in `persistent_env` so an `export` can carry to the next call, filtered against the spawn baseline so an ambient credential never persists. Both halves of the cwd asymmetry now explain themselves rather than failing blankly: a file tool that misses names the Bash cwd if the file is really there, and Bash names the workspace root in the same situation — each confirms the alternative exists on disk first, never guessing. And every tool emits one path vocabulary on every platform: forward slashes for file and target paths, with Bash reporting its cwd in the workspace root's own spelling. That last one had `master` red on Windows and macOS for two days; `verify.sh` is Linux-only and could not see it.

Permissions run on a two-tier engine: tool-layer guards (secret paths, external directories) sit below all configuration and never yield; a destructive deny-list sits above them as configuration, which an explicit remembered grant can beat. Presets (Assistant, Coder) set the starting permission posture. Web tools re-validate every redirect hop against a private-address guard.

### Skills, rules, and context

Skills work three ways: a model-invoked `Skill` tool (attached only when the model's window can afford its catalog), the user-invoked `/skill-name` path (always available), and the UI surfaces. `/clear` and `/compact` work. Path-scoped project rules and nested `AGENTS.md`/`CLAUDE.md` files inject automatically when a session touches a matching path.

Everything injected arrives as a **message**, never as a prompt edit — the system prompt is assembled once and stays byte-stable so local models keep their cached prefix. Injected content is bounded by a per-model token budget and announces its own truncation. The root project-instruction file is **outlined** rather than cut: every heading survives at every budget, and the budget buys body text underneath.

### Model intelligence

A capability profile resolves in three layers — discovered facts, then a family-keyed registry, then a conservative fallback — and never branches on a model name outside that registry. A local model's real context window is read from the engine and clamped, and that one number drives tiering, the compaction trigger, and the status chip. Local models get constrained decoding via a tool grammar, never a top-level JSON schema. Two-stage compaction prunes tool output then summarizes on a user-message boundary, and fails safe.

### MCP

MCP servers attach to native sessions. Secrets are stored encrypted and machine-bound, never in the syncable home. Attachment is whole-server in registry order, dropping from the end. Grants are per-tool, not per-server. A server's own claims about its danger level are ignored.

### Status, reliability, and images

The status bar shows context remaining, tokens in and out, throughput, and cache efficiency for native sessions. A stall watchdog bounds provider silence — a warning heartbeat drives a visible countdown, then a retry or an honest typed error — and it is prefill-aware, so a local model reading a long prompt is never called dead. A loading bar shows local model residency, including an unloaded state with a reload action. Attached images reach vision-capable models as real image content in the message; models that cannot see images are never sent one and are told why.

### What is deliberately absent

- **Android has none of this.** No Kotlin code reads the Conversation Store, the native home, or model bindings. Android sessions are Claude Code only.
- **No subagents.** The Task tool does not exist natively.
- **No cost estimate**, because per-model pricing is not sourced anywhere.
- ~~**The model cannot fetch an image by path** — only the user can attach one.~~ **SHIPPED 2026-08-11** (youcoded#293, `f65fed18`).

---

## §2 Remaining work, in order

Each step says what it is, why it sits here, where the detail lives, and what finishing it means. A session picking this up starts at the first unfinished step and does not need to read anything above except §1.

### Step 1 — ~~Land the two built-and-green PRs~~ ✅ DONE 2026-08-11

**youcoded #289** (project instructions outlined instead of cut) and **youcoded #290** (native cache chips + images in the user message). Both pass `verify.sh --full`; neither has been reviewed.

Do this first for one reason: everything below stacks on the same files, and reviewing a branch that has three more branches piled on it is how review stops happening.

**Done when:** both are merged and their worktrees and branches are cleaned up. — **Both merged 2026-08-11 (#289 `4bb760ff`, #290 `9a2d8af7`); worktrees removed, branches deleted local and remote.**

**Read this before trusting a green tick again:** they were merged with **Windows and macOS CI failing**, after verifying the identical failures on master first — they were inherited, not caused. That break (four distinct tests, six platform/case combinations) was diagnosed and **fixed the same day — PR #291, merge `71c4014a`**; see "one path vocabulary" in §1 and the archived spec. macOS is green again.

**`master` is still red on Windows, for unrelated reasons.** Two PRs merged onto the already-red matrix on 2026-08-11 and each added failures: `43a9c43a` (six `wrap-up turn` cases in `harness-review-runner.test.ts`) and `a2b0e35f` (one `persistent_env` case). Measured: master had 11 Windows / 4 macOS failures; #291 cut that to 7 Windows / 0 macOS. Tracked in `ROADMAP.md` → Bugs. The standing lesson is unchanged and now has three instances in two days: **`scripts/verify.sh` runs on Linux and cannot see this class of break**, so a green local run is not evidence about Windows or macOS.

**Not part of this step:** youcoded #278 is a permissions PR, but it is the *Claude Code* hook-relay path (relay scripts, Ink parser, both platforms), stale since 2026-07-31. It is not native work and does not gate anything here. Judge it on its own.

### Step 2 — M5 permissions maturity

The largest genuine gap in the product, and the only one with a live safety argument. Do the three items in this order; the order is load-bearing.

**2a. Permissions management UI. ✅ SHIPPED 2026-08-12** (youcoded #311, with the follow-up #312 that stops the card promising an Always-allow the engine would never honor). Settings → Permissions lists every grant grouped by project and revokes it, and revocation reaches live sessions rather than only disk. Spec archived: `docs/archive/specs/2026-08-11-native-permissions-management-ui.md`. Original framing: There was no way to undo an "Always allow." The permission store has `rulesFor` and `remember` and nothing else — no list, no remove, no IPC, no renderer reader. Its own header documents unbounded growth pending exactly this UI. A user who approves the wrong thing, or grants "always" to something they misread, currently cannot take it back. The 2026-08-10 dogfood produced a consent bug on this exact surface — a permission card that named one tool while its buttons approved another — which makes the missing revocation path worse than a nicety.

Scope: `list()` / `remove(cwd, rule)`, an IPC pair with four-surface parity, and a Settings surface grouped by project (worktrees are separate projects). Note that PR #173 already removed the false "you can undo this in Settings" copy, so the app is currently honest about the gap rather than lying about it.

**2b. Full-auto prompt coherence. ✅ SHIPPED 2026-08-12** (youcoded #313, merge `cfb3124d`). The design went a third way after four compare-view rounds: the deny-list stop KEEPS asking (the shipped Permissions-screen promise binds), but renders as a mode-branded safety stop — amber band, per-family copy ("Stopped before pushing code" / "YouCoded limits this action, even in Full Auto — …"), Run it / Skip it | Always Allow (status orange, behind the same consequence confirm). `permissionMode` rides the broker ask payload; condition is exactly `full-auto && denyListed`, everything else pixel-identical. Spec + plan archived: `docs/archive/{specs,plans}/2026-08-12-full-auto-prompt-coherence.md`.

**2c. Bash always-allow rule shape. ✅ SHIPPED 2026-08-13** (youcoded #314, merge `542b7e23`). The framing above was half the problem: grant width was not narrow, it was *unspecified*, and in the cases that mattered far too wide. What shipped —

- **"This exact command" is now exact.** Rules carry `match: 'exact' | 'glob'`; every stored rule is re-read as byte-exact, so a command containing `*` or `?` is no longer a wildcard rule sitting above the deny-list.
- **One matcher owns rule meaning.** `ruleMatches` (`shared/subject-glob.ts`) is the only decision-path matcher, and it carries two narrowings that apply to wildcard Bash grants only — never cross a shell operator, never admit a destructive flag when the pattern has text after its wildcard. In the matcher rather than on each rule, so a future rule-builder cannot forget them.
- **Widening is named, not inferred.** `bashGrantOptions` derives what may be offered and owns the sentence the user reads. `git push` scopes to one branch (master included — it is an ordinary branch, asked about once and revocable on its own); everything else gets "this exact command" or "any `npm run` command". A shape-produced grant REPLACES its exact rung — two options that mean the same thing is not a choice (compare round 1).
- **Two postconditions.** An option must cover the command in hand, and a wide option must admit nothing from a corpus of destructive commands — the check that stops `git --no-pager log` being offered "Any git command".
- **Nothing at all for a target that moves.** Bare `git push`, `git push origin`, `git push origin HEAD` lose the button and say why.
- Rule identity is the `(tool, pattern, action, match)` quad; Settings tells exact / scoped / tool-wide apart and never renders a glob.

Confirm shape and copy settled in the workbench (surface `bash-grant-width`, R1–R3). Spec + plan archived: `docs/archive/{specs,plans}/2026-08-13-bash-always-allow-rule-shape.md`. Deferred by design: telling a user when a grant *almost* covered a command (ROADMAP, `#permissions`).

**Done when:** a user can see every rule they have granted, remove any of them, and Full Auto no longer asks questions it has already answered. **✅ MET 2026-08-13** — for pushes. The other four destructive families (`rm`, `sudo`, `format`, `git reset --hard`) keep asking unless the exact command repeats, which is the posture 2c's §5.2 chose deliberately, not a gap discovered later.

### Step 3 — Make context truncation visible to the user

Small, self-contained, and closes a silent-failure class. Every truncation the harness performs currently announces itself **to the model and nowhere else**: outlined project instructions, cut skill bodies and rules, and whole MCP servers dropped for budget. That last one is tracked in `HarnessSession.droppedMcpServers`, which has no reader outside the file that sets it.

So a session on a small local model can be running with most of a project's rules outlined, several skills cut, and entire MCP servers unattached, with nothing on screen saying so.

Needs no new machinery — the signals all exist and are discarded by their callers. Full entry, including the four open design questions and one trap (the budget is fixed at session start; switching models mid-session does not re-truncate), is in `ROADMAP.md` under Features, added 2026-08-11.

**Done when:** a session that truncated anything says so, once, in a place the user will see.

### Step 4 — M6 item 2, ground-truth model metadata

Do this before the rest of M6, because it unblocks two other things: the cost chip (Step 6) and capability tiering (Step 5) both need it.

Per-model provider, context window, pricing, benchmarks, and tool support. Sourcing is already decided: local and open models from Hugging Face Hub server-parsed GGUF headers; hosted models from OpenRouter's models API cross-checked against models.dev, both of which are already parsed in `model-catalog.ts`; benchmarks from Artificial Analysis and BFCL. The goal is that facts are **discovered, not curated** — the hand-maintained registry shrinks to behavioral tuning only.

Live-probe the API shapes before building against them. The UI surface is deliberately deferred — Destin: "figure out the UI separately."

**Done when:** the registry no longer carries facts a lookup could supply.

### Step 5 — M6 items 3 and 4, tiering and step budgets

**Capability tiering rework.** Capability and context are orthogonal axes, but today every cloud model resolves to one default — a small, cheap model gets frontier treatment — and local fallback tiers by context window, which is a poor proxy. The four tiers Destin wants: small-context local, big-context local, small cloud, frontier cloud. Signals are parameter count for local and cost plus benchmarks for cloud, which is why this waits on Step 4.

**Step budget into the profile.** A separate module maps model-name regexes to a step allowance and is the last place outside the registry that inspects a raw model id. Fold it into the profile's normal layers and delete the module.

**Done when:** a Haiku-class model and a frontier model no longer resolve to the same profile, and no code outside the registry pattern-matches a model name.

### Step 6 — M4 leftovers

Three small independent pieces, in whatever order suits.

**Cost estimate chip.** Cumulative usage times per-model pricing, for hosted models only. Blocked until Step 4 lands; trivial afterwards.

**Folderless sessions.** The Assistant-preset heuristic already works — it is only the new-session form that requires a folder. Low priority per Destin.

**Model fetching an image by path.** ~~Undecided.~~ ~~Decided and IN FLIGHT.~~ **SHIPPED 2026-08-11** — youcoded#293, merge `f65fed18`. Spec `docs/archive/specs/2026-08-11-native-image-handling.md`, plan `docs/archive/plans/2026-08-11-native-image-delivery-plan.md`. The hard constraint held: resume, compaction, budgets, and dedupe all landed in the same pass, so the model never holds a reference to a picture that is not there. Read delivers the image; it lives canonically in the tool result; `wire-adapter.ts` adapts per provider at request-build time (native on Anthropic, split elsewhere, stripped for non-vision, re-checked every request so a mid-session model swap cannot leak pixels).

Two carried-forward items, both deliberate and documented at the code:
- `fitToContext` trims for the wire only, so an image can scroll out of the model's view while the dedupe cache still says "already visible earlier". Bounded to registry-declared local vision models under ~8.5k context; the obvious fixes are worse (clearing there runs every request and defeats dedupe entirely). Intended fix is `toolCallId`-keyed reconciliation against the fitted window.
- OpenRouter session start now touches the model catalog twice (once via `contextLengthFor`, once via `visionSupportFor`), each re-reading the cache file with no in-memory memoization. Only a latency cost, only on OpenRouter, disclosed in the closures' comments.

### Step 7 — M6 item 5, the multi-model cwd contract

Has its own plan doc: `docs/active/plans/2026-07-18-multi-model-cwd-contract.md`. A Bash `workdir` parameter, file tools that reject relative paths loudly, an imperative per-tool description contract, and one canonical rules block that stays byte-stable rather than being branched per provider.

Independent of everything above; slot it wherever it fits.

### Step 8 — MCP phase 2

Phase 1 works but has no management surface. Phase 2 is the adopt flow, the settings UI, migrating plugin manifests into the registry, and full `mcp:*` IPC parity across all four surfaces. Roadmap-owned rather than milestone-owned.

### Step 9 — M7 subagents, then orchestration

**DESIGNED 2026-08-11 — spec approved by Destin:** `docs/active/specs/2026-08-11-native-specialists-design.md` (user-facing name "specialists"; stage one = Task tool as child sessions, stage two = declarative plans; ratifies the 2026-07-19 orchestration spec's DAG-over-JS decision). Research base: `docs/active/investigations/2026-08-11-subagent-platform-research.md`. **SHIPPED 2026-08-12 (stage one, plan 1a):** foreground specialists end-to-end merged to youcoded master (8db46236) — Task tool, child sessions, envelope consent with deny-list cut-through, subagent-card rendering, headroom-capped reports, engine probes measured. Plan archived: `docs/archive/plans/2026-08-12-native-specialists-plan-1a-core.md`. **SHIPPED 2026-08-16 (plan 1b):** background execution, restart durability, mid-run steering, the 5-minute permission redirect, permission-store v2 (specialist+match rule identity), and delegated model tiers — merged to youcoded master (e5ec5b3c) after Destin's hands-on verification (Tests 1-9 incl. the security-critical specialist-scoped grant not leaking to the parent). Plan archived: `docs/archive/plans/2026-08-12-native-specialists-plan-1b-background-durability.md`; checklist: `docs/archive/handoffs/2026-08-20-specialists-1b-testing-checklist.md`. Remaining: plan 1c (definitions folder/CC mapping/chat UI — incl. Destin's directive that a background hire's routed ask + report render under the launching Task card), not yet written.

**Subagents first.** The Task tool as child sessions, with a parent-session pointer and a condensed result travelling back up. The session store was deliberately designed so this lands without a schema change. Deferred once already, but core.

**Orchestration strictly after.** Spec exists (`docs/active/specs/2026-07-19-native-workflow-orchestration-design.md`) with research done but **no design decision taken**. The pivotal choice is model-authored JavaScript versus a declarative graph, and the graph is favored — four unpredictable models plus sandbox elimination via schema validation. Two constraints to respect when it is picked up: concurrency must derive from the local engine's actual parallel slots rather than a copied constant, and prefix-cache stability must be measured rather than assumed.

### Step 10 — M8 Android native runtime

The largest single piece remaining, roughly the size of the original desktop work, and correctly last among the feature milestones. Follow this internal order:

1. **LAN engine access** — expose the desktop's local model server on the network behind an API key and QR pairing, reusing the existing remote-access machinery. Zero new inference code; Android becomes just another client.
2. **On-device inference** under Termux, with a curated list of small quantized models.
3. **Cloud providers on Android**, with keys in the platform keystore.
4. **Agents as viewer.**

M8 also owns Android parity for M2's session metadata and M5's permissions UI.

### Step 11 — M9 onboarding equality

Remove the Claude Code gate from first run. The installer fetches prerequisites, lands on the default theme, then offers three genuinely equal choices: Claude Code, an OpenRouter key, or a local runner. No default provider — the open-platform stance applied to first run.

Check the older standalone onboarding roadmap entry first; it predates this direction and may still name Claude Code as primary.

---

## §3 Rules that apply to every step

- **Verify before you plan.** Five of the previous program doc's seven M4 items were stale when checked against the code. Assume the same of anything here you have not personally confirmed today. A single search returning nothing is not proof of absence.
- **Each milestone gets its own plan doc** under `docs/active/plans/` before implementation — tasks, real code, test-first. This document is the spec, not the plan.
- **Each milestone updates its subsystem rule, its depth doc, and `docs/MAP.md` in the same PR** as the code.
- **Each milestone is exercised on both clients** — the desktop renderer and the remote web client. The remote client shares every surface in this program and is not a milestone of its own.
- **Fakes must be able to express failure**, or the test suite certifies the bug.
- **Program done means:** a side-by-side session where Destin cannot name a behavioral difference beyond model choice.
