---
title: "What the best agent operators actually do — and what to change here"
date: 2026-07-28
status: active
type: investigation
tags: [agents, harness, workflow, productivity, practices]
---

# What the best agent operators actually do

Practitioner-focused sweep: Anthropic's own engineers, Karpathy, Moonshot/Kimi, Microsoft's
field study, Every's compounding-engineering crowd. Ends with a concrete change list for this
workspace, based on what's actually configured here today.

---

## Part 1 — Who's doing what

### Anthropic (Boris Cherny + the Claude Code team)

Cherny created Claude Code and runs it harder than almost anyone. His workflow is public and
unusually specific. Three principles, in his own ranking:

**1. Parallelism.** Five terminal tabs, each on its own **git worktree** of the same repo, plus
5–10 browser sessions on claude.ai/code, plus the iOS app for capturing prompts in transit.
~15 concurrent instances. He ships 10–30 PRs/day; personal record ~150 in a day. Shell aliases
(`za`, `zb`, `zc`) for one-keystroke worktree switching. `/rename <label>` to tell sessions
apart. He calls parallelism *"the single biggest productivity unlock, and the top tip from the
team."*

Worktree isolation is described as **"the one structural issue"** that eliminates multi-agent
horror stories — agents on separate branches in separate directories can't clobber each other.

**2. Plan first.** Every complex task starts in Plan Mode (`shift+tab` twice). Iterate on the
plan until satisfied, *then* switch to auto-accept and Claude typically one-shots it. Sometimes
a second Claude reviews the plan as a "Staff Engineer" before execution. Key discipline: **if
implementation goes sideways, restart planning from scratch rather than patching.**

**3. Verification loops — he calls this the most important tip.** *"Give Claude a way to verify
its work… 2–3x the quality of the final result."* Chrome extension for UI, test/bash scripts for
backend, Docker logs for distributed systems. The point is to build a **domain-specific feedback
loop for your codebase**, not to use a generic one.

Supporting habits: a single version-controlled `CLAUDE.md` that records **every mistake Claude
makes** so it isn't repeated, ruthlessly edited for concision; anything done more than once a day
becomes a slash command or skill in `.claude/commands/`; custom subagents in `.claude/agents/`
(his examples: `code-simplifier`, `verify-app` for end-to-end testing); hooks for auto-format on
`PostToolUse`, checks on `Stop`, and **re-injecting critical instructions on `PostCompact`**;
`/permissions` pre-authorization with wildcards instead of `--dangerously-skip-permissions`
(which he says never to use).

**The measured internal trend** (Anthropic's own study, Feb→Aug 2025 and onward): Claude now
chains **21.2 independent tool calls without human intervention, up from 9.8** six months
earlier; **human turns dropped 33%**; task complexity rose 3.2 → 3.8 on a 5-point scale; feature
implementation went 14.3% → 36.9% of usage. Every team delegates *iteratively* — start with
easily-verifiable work, expand as trust builds. **No team fully automates.**

Their orchestration patterns are now named, in the six Dynamic Workflows shapes:
**fan-out-and-synthesize, classify-and-act, adversarial verification, generate-and-filter,
tournament, loop-until-done.** House slogan: **"the harness is the moat."**

### Karpathy

His framing shift is the one worth internalizing: **"vibe coding" → "agentic engineering."**
Vibe coding raises the floor; agentic engineering raises the ceiling. In December 2025 his own
ratio flipped from **80/20 writing-vs-delegating to 20/80.**

The five skills he says now matter: **spec design** (detailed requirements before prompting),
**diff review** (reading generated code for architectural correctness), **eval design** (building
feedback loops with verifiable signals), **security oversight**, and **taste**. Notably absent:
knowing APIs. *"Agents can remember whether a tensor library uses dim, axis, keepdim, reshape, or
permute."* You need the concepts — storage, views, invariants, security boundaries, system shape.

His line on parallelism is the sharpest: **finishing one agent task then starting the next is
"working serially in a parallel world." The operators who win parallelize their judgment, not
just their code.**

The "Karpathy guidelines" circulating as an agent preamble are a five-step contract, and they're
directly stealable:

1. **Surface assumptions** — list them, separate explicit from inferred, present ambiguity as
   numbered options rather than silently picking, push back on unnecessary complexity.
2. **Simplicity constraint** — no unrequested features, no abstractions for single use, no error
   handling for impossible states. Would a senior engineer call this overcomplicated?
3. **Surgical change constraint** — touch only the lines the request requires. Don't reformat
   adjacent code. Don't refactor what isn't broken. *Mention* unrelated dead code, don't delete
   it.
4. **Verifiable success criteria** — tests first; if you can't define success, go back to step 1.
5. **Execute and verify with evidence** — if verification fails, investigate; never claim
   completion.

### Moonshot / Kimi (the training-side view)

Worth reading even though you're not training models, because it names a failure mode you'll
recognize. For K2.5's Agent Swarm they built **PARL (Parallel Agent RL)**, and had to
**reward parallel execution early in training to prevent "serial collapse"** — the orchestrator's
natural drift back to doing everything itself in one agent. The final reward is **80% completion
quality / 20% critical-path efficiency.**

Two transferable ideas: (a) orchestrators default to serial unless something actively pushes
them to fan out — the same reason you have to *tell* Claude "use subagents"; (b) a good objective
is mostly quality with a **minority weight on wall-clock**, not a 50/50 split. K2.6's gains came
from post-training specifically on **long-horizon stability, instruction following, and swarm
coordination** — the same three things practitioners patch with harness scaffolding.

### Microsoft (the only large-N field study)

Rolled Claude Code + Copilot CLI to **tens of thousands of engineers** in early 2026 and measured
it. Findings that generalize:

- **Adoption is social.** Whether peers, skip-level peers, and direct managers used it predicted
  whether an engineer tried it — more than any rollout comms. Visible working demos beat training
  decks.
- **Retention ≠ trial.** They defined retention as use on **5 of 14 days** after first try, and
  active coding participation predicted it better than any demographic.
- **Adopters merged ~24% more PRs over four months** — with the researchers' own caveat that
  merged PRs are a proxy, and more PRs can also mean churn, shallow tests, and reviewer fatigue.
  Track PR size, review cycles, revert rate, and post-merge defects alongside volume.
- **Require receipts.** Every agent-assisted PR documents: the task, files changed, tests run,
  failed commands, and where the reviewer should focus.
- Start with 2–3 high-trust teams under real backlog pressure. Instrument before scaling.

### Every / the compounding-engineering crowd

Coined by Dan Shipper and Kieran Klaassen: **"each feature should make the next feature easier
to build."** The loop is four steps — **plan → build → review → codify.** The fourth step is the
one everybody skips.

The mechanism: when an agent makes a mistake, record the lesson; next time it plans, it reads
that lesson and **writes the guard automatically — making the error structurally impossible to
repeat.** Every PR review teaches the system; every bug becomes a prevention system. This is the
same instinct as Cherny's "log every mistake in CLAUDE.md," but with the important upgrade that
the codified output should be a **guard**, not a paragraph.

### Eval-driven development (the discipline underneath all of it)

The consensus recipe for a same-day harness: **20–50 real tasks, automated grading, and a
baseline to diff against** — not hundreds of hand-labels. Build the eval harness *before* the
prompt. The framing that stuck: **"if you are not the model, you are the harness."**

---

## Part 2 — The five practices every one of them shares

Stripping the personalities away, the overlap is small and consistent:

1. **Parallelize with isolation.** Multiple agents, each in its own worktree/branch/sandbox.
   Isolation is what makes parallelism safe; without it you get the horror stories.
2. **Plan before execution, and treat a broken plan as a signal to re-plan, not to patch.**
3. **Give the agent a way to verify itself — domain-specific, and ideally judged by something
   other than the agent that did the work.** Cherny's 2–3x. The research-side ablation says the
   verifier's *independence* is where the value lives.
4. **Codify every mistake into a structural guard.** Not a note. A test, a hook, a lint rule.
5. **Automate anything you do twice.** Slash command, skill, subagent, hook.

And one meta-practice: **measure your own loop.** Microsoft instrumented; Anthropic tracked tool
calls per human turn; EDD people build the eval before the prompt. Nobody good is running on
vibes about whether their setup works.

---

## Part 3 — Where this workspace actually stands

What's configured here today:

| | Here | Best-in-field |
|---|---|---|
| Path-scoped rules | **16** | rare — most repos have zero |
| `CLAUDE.md` | 2,830 words, well-structured | comparable |
| Slash commands | **1** (`/audit`) | "anything you do twice" |
| Subagents (`.claude/agents/`) | **0** | `code-simplifier`, `verify-app`, reviewers |
| Hooks | **1** (SessionStart context-inject) | PostToolUse, Stop, PostCompact, permissions |
| Skills | 1 (`ui-mockup`) + plugins | — |
| Active worktrees | **6** (in `youcoded/`) | 5 concurrent |
| Automated verification gate | **none** | the #1 ranked practice |

**You are roughly 90th percentile on context engineering and roughly 5th percentile on
structural harness.** The rules directory, the `verify:` anchors, `/audit`, the knowledge-home
ordering, PITFALLS — that's genuinely better than most professional teams. But the entire system
is *documents telling an agent what to do*, with almost nothing that *makes* it do the thing.

That's the gap, and it's the same gap Anthropic's own guidance points at: instructions are the
weakest lever available.

Parallelism is the one structural practice already in place: **six live worktrees** under
`youcoded/worktrees/` (`plan-c`, `sync-health`, `menu-tranche1`, `ask-reference`,
`session-switch-animation`, `xwayland-floater`), which is Cherny's setup at roughly his scale.

But the *reporting* on it is broken, and the breakage is itself the best illustration of the gap.
`.claude/hooks/context-inject.sh` has an "Active worktrees" block that searches `-maxdepth 1`
for names matching `*-worktree*`, `*-phase*`, or `*-decoupling`. Real worktrees live at
`worktrees/<name>` — depth 2, names like `plan-c`. **The find matches nothing and always has**,
and because the section is only printed when something is found, it fails silently rather than
printing an empty list. A whole class of state has been invisible at session start with no
symptom. Stale husk `worktrees/narrow-ui/` (no `.git`) is unregistered and unnoticed for the same
reason.

That is what an unverified harness looks like: not broken loudly, just quietly not doing its job.

---

## Part 4 — What to change, in order

### 1. Two subagents, today. This is the highest-value hour you can spend.

You have zero. Create `.claude/agents/`:

**`verify-app.md`** — Cherny's own example, and directly applicable: launch `run-dev.sh`, drive
the change, report evidence. Encodes the live-app-safety rule structurally instead of hoping it's
read. (Keep the existing carve-out: hand *interactive* visual checks to you.)

**`independent-reviewer.md`** — receives **only the diff plus the relevant rule files, never the
conversation that produced the code.** Cognition reversed their own anti-multi-agent position on
exactly this, and the enterprise ablation showed swapping an independent verifier for the
generating model dropped rescued tasks 6→2. A reviewer who watched you write the code inherits
your wrong assumptions.

Both are single markdown files. This is the cheapest change on the list and the best-evidenced.

### 2. Turn the mandates into hooks

Three hooks would enforce what `CLAUDE.md` currently asks for politely:

- **`Stop`** — refuse to finish a session with uncommitted sub-repo changes, or with a dev server
  still holding port 5223. That's two existing rules that currently depend on my memory.
- **`PostToolUse`** on Write/Edit in `youcoded/desktop/` — run `tsc --noEmit` or `vitest related`.
  Verification you don't have to remember to ask for.
- **`PostCompact`** — re-inject live-app-safety and the never-assert-a-negative rule. Cherny
  specifically calls this out, and it's precisely the "catastrophic forgetting" failure mode:
  losing a constraint across a context boundary.

The `PostToolUse` one deserves emphasis — Cherny ranks verification as *the* top tip, and
`npm test` (vitest) and `npm run knip` already exist in `youcoded/desktop`. You have the feedback
loop; it just isn't wired to fire automatically.

### 3. Fix the worktree reporting, then test the hook

Parallelism is already in place (six worktrees). What's missing is that the harness can't *see*
it: the `find` in `context-inject.sh` should walk `worktrees/` and read `git -C youcoded worktree
list` instead of pattern-matching directory names at depth 1. It should also print an explicit
"none" rather than omitting the section, so absence is distinguishable from failure.

The deeper fix is the general one: **hooks are code and nothing tests them.** `audit-anchors.mjs`
has `audit-anchors.test.mjs` next to it; `context-inject.sh` has nothing. A hook that emits an
empty section for six live worktrees is the same failure class as a stale doc, and `/audit`
doesn't cover it because it audits documents, not the harness.

While in there: `worktrees/narrow-ui/` is an unregistered husk (no `.git`) — exactly the cruft
the "clean up worktrees and branches after merging" rule exists to prevent, surviving because
nothing checks.

### 4. Close the compounding loop — `/codify`

You have step 1 (`writing-plans`), step 2 (build), step 3 (`/audit`, `/code-review`). Step 4 —
codify — happens only when I remember to do it mid-conversation.

A `/codify` command that takes "here's what went wrong" and produces **a pinning test first, a
hook second, a rule third, and prose last** would mechanize the knowledge-home ordering that
`CLAUDE.md` already specifies. The AHE ablation is blunt about why the ordering matters: tools
+3.3pp, middleware +2.2pp, memory +5.6pp, **system-prompt prose −2.3pp.** Prose was the only
harness edit that measured *negative*.

### 5. Adopt the "receipts" convention for agent PRs

Microsoft's most portable finding. A PR template requiring: task, files changed, **tests actually
run**, **commands that failed**, and where the reviewer should focus. This directly attacks the
premature-completion-claim failure mode, and it makes your review pass cheap because you know
where to look.

### 6. Add the Karpathy assumption-surfacing step to planning

Your `writing-plans` skill produces good plans. What's missing is step 1: **list assumptions,
separate explicit from inferred, present ambiguity as numbered options instead of silently
choosing.** For a non-developer reviewing an agent's plan this is the single highest-leverage
addition — silent inference is where plans go wrong invisibly.

### 7. A small eval set for your own harness

20–30 real tasks from your git history — "add an IPC handler with Android parity," "fix a chat
reducer bug," "add a theme registry field." Run them when you change `CLAUDE.md`, a rule, or a
hook. Right now every harness change ships unmeasured, which is how instruction files grow
forever and never shrink.

Pair it with **decision observability**: when you add a rule, write down what failure it should
prevent. Then `/audit` can ask whether that failure recurred — and delete rules that never
earned their tokens.

### 8. A semantic index, eventually

TypeScript + Kotlin across five repos, with cross-platform parity checks currently done by
tree-wide `rg`. Your `never assert a negative from a single search` rule exists *because*
grep-based completeness is unreliable. An LSP-to-MCP bridge (Serena-style) makes "find all
callers," "is there an Android mirror," and "is this dead" answerable rather than inferable.
Lower priority than 1–5, but it attacks a failure mode you've already been bitten by twice.

---

### The one-line version

> Your documents are excellent. Your structure is nearly empty. Add subagents, hooks, and
> worktrees — the three things every top operator has and you don't — and stop growing
> `CLAUDE.md`.

---

## Sources

**Practitioners**
- [Boris Cherny's Claude Code workflow — full tip list](https://blog.enkr1.com/boris-cherny-claude-code-workflow/) · [Playbook](https://skzl-ai.github.io/boris-cherny-claude-code-playbook/) · [parallelism thread](https://x.com/bcherny/status/2017742743125299476)
- [Multi-Claude: how Anthropic engineers run 5+ agents in parallel](https://blog.vibecoder.me/multi-claude-parallel-agents-anthropic-workflow)
- [How AI Is Transforming Work at Anthropic](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic)
- [Claude Code Dynamic Workflows — the six patterns](https://www.the-ai-corner.com/p/claude-code-dynamic-workflows-6-patterns-14-steps-anthropic-engineers-2026) · [InfoQ coverage](https://www.infoq.com/news/2026/06/dynamic-workflows-claude-code/)
- [The Karpathy Guidelines](https://jonbeckett.com/2026/05/19/karpathy-guidelines-taming-ai-coding-agents/) · [Agentic engineering framing](https://www.aibuilderclub.com/blog/karpathy-agentic-engineering) · [Sequoia Ascent 2026 notes](https://karpathy.bearblog.dev/sequoia-ascent-2026/)
- [Microsoft's CLI coding agent rollout study](https://www.developersdigest.tech/blog/microsoft-cli-coding-agent-rollout-study)
- [Compound Engineering — Every](https://every.to/source-code/compound-engineering-camp-every-step-from-scratch) · [Klaassen's Claude Code tutorial](https://rogerwong.me/2026/02/how-to-make-claude-code-better-every-time-you-use-it)
- [Kimi K2 technical report — arXiv 2507.20534](https://arxiv.org/pdf/2507.20534) · [K2.5 Agent Swarm / PARL](https://www.infoq.com/news/2026/02/kimi-k25-swarm/)
- [Don't Build Multi-Agents — Cognition](https://cognition.com/blog/dont-build-multi-agents) · [What's Actually Working](https://cognition.com/blog/multi-agents-working)
- [Eval-driven development](https://deepeval.com/blog/eval-driven-development) · [Eval harness](https://deepeval.com/blog/what-is-an-eval-harness)

**Supporting research** (detail in the evidence appendix below)
- [Anthropic — effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Agentic Harness Engineering — arXiv 2604.25850](https://arxiv.org/abs/2604.25850) (the ablation: tools +3.3, middleware +2.2, memory +5.6, prompt −2.3)
- [Where Does Agent Reliability Come From — arXiv 2607.17044](https://arxiv.org/html/2607.17044) (independent-verifier ablation, 6→2)
- [HORIZON: long-horizon failure taxonomy — arXiv 2604.11978](https://arxiv.org/html/2604.11978v1) (72.5% process-level failures)
- [ACE: Agentic Context Engineering, ICLR 2026 — arXiv 2510.04618](https://arxiv.org/abs/2510.04618) (patch, don't rewrite)
- [Harness Engineering empirical study — arXiv 2602.14690](https://arxiv.org/abs/2602.14690) (2,853 repos; skills 5.5%, subagents 4.6%)
- [Vercel — AGENTS.md outperforms skills in our evals](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) (53% → 79% → 100%)
- [OWASP Top 10 for Agentic Applications 2026](https://www.trydeepteam.com/docs/frameworks-owasp-top-10-for-agentic-applications) (memory poisoning = ASI06)

---

## Appendix — evidence notes

Kept short; the practices above are the deliverable.

- **Independence of the verifier is the strongest causal result in the literature.** Production
  agent decomposition: +11.0pp total uplift on SpreadsheetBench, of which scaffolding is +9.5pp
  (~86%) and the verification loop only +1.5pp in isolation — but swapping the specialist verifier
  for the generator model itself dropped rescued tasks 6→2 and rejection accuracy 4–5pp.
  *"The loop's value comes from the independence and specialization of the observer."*
- **Long-horizon failure is structural, not gradual.** HORIZON (3,100+ trajectories): 72.5% of
  failures are process-level, dominated by subplanning errors and catastrophic forgetting —
  losing a constraint *still present in the context window*. Separately: success declines past
  ~35 min human-equivalent, doubling duration quadruples failure rate, and `pass@1` overstates
  real reliability by 20–40%.
- **Structural harness edits beat prose.** AHE moved Terminal-Bench 2 from 69.7% → 77.0% pass@1
  in 10 unattended iterations, beating human-designed baselines (Codex 71.9%). Component
  ablation: tools +3.3pp, middleware +2.2pp, memory +5.6pp, **system-prompt-only −2.3pp.**
- **Retrieval that depends on the agent choosing to retrieve is a liability.** Vercel: no docs
  53% → skills-with-explicit-instructions 79% → inline 8KB docs index in `AGENTS.md` **100%**.
  Skills lost because the agent never invoked them in **56% of cases**. Implication: passive
  context for what's needed on most tasks; lazy loading only where the routing key is reliable
  (which is why *path-scoped* rules are a stronger pattern than model-invoked skills).
- **Don't rewrite knowledge files, patch them.** ACE names brevity bias and context collapse as
  what kills summarize-and-rewrite memory; itemized incremental updates gained +10.6% on agents,
  +8.6% on finance.
- **Almost nobody has structure.** Across 2,853 repos: context files 61.5–100%, but skills 5.5%,
  subagents 4.6%, and **85.5% of skills contain no executable resources.** The authors'
  conclusion — *"harness engineering in open source today is mostly context engineering"* — and
  their caveat that there's **no evidence deeper configuration helps** beyond context files. So
  treat the change list above as well-motivated but not yet proven at population scale; that's
  what item 7 (your own eval set) is for.
- **"Graph engineering" is two unrelated things.** Graph-shaped *knowledge* (Zep/Graphiti
  temporal KGs — 94.8% vs MemGPT 93.4% on DMR, +18.5% on LongMemEval with 90% lower latency; the
  Gartner ">50% by 2028, +30% accuracy" line is an analyst forecast, not a finding) versus
  graph-shaped *orchestration* (LangGraph; the org-graph / work-graph split). The `Workflow` tool
  you already have is the second kind. LangGraph's three-year retrospective adds a caution:
  production agents are not DAGs (cycles are essential), and the one pattern that *failed* was
  over-constraining open-ended investigation into a fixed graph.
- **Memory writes are a persistence channel.** Memory poisoning is OWASP ASI06:2026 — persists
  across sessions, fires later on an unrelated trigger, >95% injection success in MINJA research.
  Mitigation is provenance, not filtering. The timestamped, falsifiable style already used in
  `MEMORY.md` is the right shape.
