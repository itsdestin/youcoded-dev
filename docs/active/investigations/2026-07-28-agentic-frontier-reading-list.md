---
title: "Agentic frontier reading list — July 2026"
date: 2026-07-28
status: active
type: investigation
tags: [agents, reading-list, research, harness]
---

# Agentic frontier reading list

> **REVIEW 2026-08-26 — reference material; RECOMMEND ARCHIVE to `docs/archive/investigations/`.**
> A curated reading list, not a findings document — it carries no recommendation that could be
> consumed or left open. **Zero documents in the workspace reference it**
> (`rg -l 2026-07-28-agentic-frontier-reading-list --glob '*.md'` → only itself), including its own
> companion. Archiving costs nothing and removes it from the live-doc count.

Curated, ranked, with an honest note on what each one is actually worth. Companion to
`2026-07-28-agent-harness-frontier-research.md`.

The field has a bad signal-to-noise ratio right now — a large fraction of "AI agents 2026"
content is SEO listicles restating the same three vendor blog posts. Everything below is either
a primary source, a paper with real methodology, or a practitioner writing from production
experience.

---

## Tier 1 — read these first (practitioner, high density, ~4 hours total)

### 1. [Context Engineering for AI Agents: Lessons from Building Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) — Yichao "Peak" Ji

**Start here.** Published July 2025 and still the most concrete thing written on the subject —
it's *the* post the Anthropic guidance and everything since is in conversation with. Six lessons,
all from production, all counterintuitive:

1. **Design around the KV-cache** — *"KV-cache hit rate is the single most important metric for
   a production-stage AI agent."* Cached vs uncached input is a ~10x cost difference. Keep prompt
   prefixes stable, make context append-only. A timestamp at the top of a system prompt
   invalidates the entire cache on every call — a single token does it.
2. **Mask, don't remove** — never delete tools mid-session; mask their logits instead. Removing
   them breaks the cache and confuses the model with dangling references.
3. **Use the file system as context** — unlimited, persistent, directly operable. Externalize
   large observations, keep restorable references.
4. **Manipulate attention through recitation** — have the agent rewrite its todo list repeatedly
   so the objective stays in recent context. A deliberate fix for lost-in-the-middle.
5. **Keep the wrong stuff in** — don't scrub failed actions and error traces. They're how the
   model learns not to repeat the mistake within the session.
6. **Don't get few-shotted** — uniform context makes agents rigid and drift-prone. Introduce
   controlled variation.

Lesson 4 is the one most people miss, and it's the mechanism behind why progress files work.

### 2. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic

The canonical framework. Context rot, system-prompt altitude, tool curation, just-in-time
retrieval, compaction, structured note-taking, sub-agent architectures. The organizing principle
— *the smallest set of high-signal tokens that maximizes the likelihood of the desired outcome* —
is the sentence to remember.

### 3. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Anthropic

The practical sequel. Multi-session autonomous work: JSON feature lists (models won't
inappropriately edit JSON, but will happily rewrite Markdown), one feature at a time, git commits
as state reconstruction, session-startup protocols, and the finding that agents skip end-to-end
verification unless explicitly required. Read for the failure→fix table alone.

### 4. [Agentic Engineering Patterns](https://simonw.substack.com/p/agentic-engineering-patterns) — Simon Willison

Five patterns from someone who's been unusually rigorous and unusually honest about this for
three years. **Writing code is cheap now** (so the economics of exploration changed);
**red/green TDD** (tests first produces cleaner agent output with less prompting);
**first run the tests** (unexecuted code is unreliable — tests moved from optional to
mandatory); **linear walkthroughs** (ask for a structured end-to-end explanation to understand a
vibe-coded project); **hoard things you know how to do** (your domain expertise is what lets you
direct agents and recognize what's possible).

Also worth having his [definition of "agent"](https://simonw.substack.com/p/i-think-agent-may-finally-have-a):
*LLMs calling tools in a loop to achieve a goal.* It clears a lot of fog.

### 5. [Boris Cherny's Claude Code workflow](https://blog.enkr1.com/boris-cherny-claude-code-workflow/)

The person who built the tool, describing how he uses it. Parallel worktrees, plan-first,
verification loops (*"2–3x the quality of the final result"*), hooks, subagents, mistake logging.
Skim the tips list; the three principles are the substance.

### 6. Cognition, read as a pair — [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents) then [Multi-Agents: What's Actually Working](https://cognition.com/blog/multi-agents-working)

The most intellectually honest sequence in the space: a strong public position, then a public
revision when their own evidence contradicted it. The revision's key finding — multi-agent works
best when **coder and reviewer share no context beforehand** — is the single most actionable
result of 2026.

### 7. [AGENTS.md outperforms skills in our agent evals](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) — Vercel

Short, and it will change what you build. 53% (no docs) → 79% (skills with explicit instructions)
→ **100% (inline 8KB docs index)**. Skills lost because **the agent never invoked them 56% of the
time.** The generalizable lesson: retrieval that depends on the agent *choosing* to retrieve is a
reliability liability.

---

## Tier 2 — papers worth the time

Ordered by how much they'd change your thinking, not by prestige.

### [Agentic Harness Engineering: Observability-Driven Automatic Evolution of Coding-Agent Harnesses](https://arxiv.org/abs/2604.25850) — arXiv 2604.25850

The most useful paper on this list. A harness that improves itself: Terminal-Bench 2 from
**69.7% → 77.0% pass@1** over 10 unattended iterations, beating human-designed baselines. Three
observability pillars (component / experience / decision), and the idea worth stealing wholesale:
**every harness edit ships with a self-declared prediction, verified next round, reverted if
wrong.** Falsifiable contracts instead of accumulating instructions.

The ablation is the part to remember: tools **+3.3pp**, middleware **+2.2pp**, memory **+5.6pp**,
system-prompt-only **−2.3pp**. Prose was the only lever that measured negative.

### [Where Does Agent Reliability Come From?](https://arxiv.org/html/2607.17044) — arXiv 2607.17044

Cross-benchmark decomposition of a production agent. Scaffolding is ~86% of the uplift;
verification adds little in isolation but converts the hardest tasks. The specialist-swap
ablation — replacing an independent verifier with the generator model drops rescued tasks
**6→2** — is the cleanest causal evidence for reviewer independence anywhere.

### [The Long-Horizon Task Mirage? Diagnosing Where and Why Agentic Systems Break](https://arxiv.org/html/2604.11978v1) — arXiv 2604.11978

3,100+ trajectories across four domains. **72.5% of failures are process-level**, dominated by
subplanning errors and **catastrophic forgetting — losing a constraint still present in the
context window.** Seven-category taxonomy that's genuinely useful for diagnosing your own
failures. Read the taxonomy even if you skip the rest.

### [Agentic Context Engineering (ACE)](https://arxiv.org/abs/2510.04618) — ICLR 2026, arXiv 2510.04618

Names two failure modes precisely: **brevity bias** (summarization drops domain insight) and
**context collapse** (iterative rewriting erodes detail). Fix is incremental delta updates to an
itemized playbook, never wholesale rewrite. +10.6% agents, +8.6% finance. Short and the idea
transfers immediately to how you maintain rule files.

### [Harness Engineering for Agentic AI Coding Tools: An Exploratory Study](https://arxiv.org/abs/2602.14690) — arXiv 2602.14690

Empirical, 2,853 repos, AIware '26. What people *actually* configure: context files 61.5–100%,
skills 5.5%, subagents 4.6%, and **85.5% of skills contain no executable resources.** Its own
honest caveat is the valuable part — **no evidence that deeper configuration produces measurable
gains** beyond context files. Read it as the antidote to everything else on this list.

### [The Landscape of Agentic Reinforcement Learning for LLMs: A Survey](https://arxiv.org/html/2509.02547v5) — arXiv 2509.02547

The best map of the training side. Even if you never train anything, it explains *why* agents
behave the way they do: cascading failures where an early tool error makes the rest of the
trajectory incoherent while those tokens still pollute the gradient; credit assignment across
100+ turn horizons (100K–1M tokens). Skim the taxonomy sections.

### [Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers](https://arxiv.org/pdf/2603.07670) — arXiv 2603.07670

Current best survey of agent memory. Organizes by substrate (internal/external) and cognitive
mechanism (episodic, semantic, working, procedural). Read if you want to reason about memory
architecture rather than adopt a vendor's.

### [Zep: A Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/abs/2501.13956) — arXiv 2501.13956

The reference implementation for graph-shaped memory, and the origin of Graphiti. The idea worth
taking regardless of tooling: **every fact gets a validity window, so stale facts are superseded
rather than left to confuse retrieval.** 94.8% vs MemGPT's 93.4% on DMR; up to +18.5% on
LongMemEval with 90% lower latency.

### [Code as Agent Harness](https://arxiv.org/abs/2605.18747) — arXiv 2605.18747

Directly relevant if you're going to write workflow scripts: the case for expressing agent
orchestration as executable code rather than configuration. Short.

### [SWE-Explore: Benchmarking How Coding Agents Explore Repositories](https://arxiv.org/html/2606.07297v1) — arXiv 2606.07297

848 instances, 10 languages, 203 repos. The paper to read if you want to reason about whether a
semantic index would help you — it isolates *exploration* as a measurable skill separate from
patch generation.

---

## Tier 3 — ongoing feeds and reference

- **[VoltAgent/awesome-ai-agent-papers](https://github.com/VoltAgent/awesome-ai-agent-papers)** —
  363+ 2026 papers across five categories (multi-agent 53, memory & RAG 57, eval &
  observability 80, tooling 95, security 82). The best single tracking resource. Standouts it
  surfaces: *CORAL* (self-evolving agents via shared persistent memory, 3–10× improvement rate
  over fixed baselines), *Corpus2Skill: Don't Retrieve, Navigate* (hierarchical skill-tree
  navigation replacing retrieval), *ClawBench* (browser agents on 283 tasks across 163 live
  production sites).
- **[Sebastian Raschka — LLM Research Papers: The 2026 List](https://magazine.sebastianraschka.com/p/llm-research-papers-2026-part1)** —
  reliably curated, well-summarized, no hype.
- **[Hugging Face Daily Papers](https://huggingface.co/papers)** — filter by `agentic RL`,
  `agent memory`, `agent harness`.
- **[OWASP Top 10 for Agentic Applications 2026](https://www.trydeepteam.com/docs/frameworks-owasp-top-10-for-agentic-applications)** —
  the security baseline. Memory poisoning is ASI06; worth knowing the whole list before wiring
  agents to anything that writes.
- **[Anthropic engineering blog](https://www.anthropic.com/engineering)** — the highest-signal
  vendor blog in the space by a distance.
- **[How AI Is Transforming Work at Anthropic](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic)** —
  internal usage data. Claude now chains **21.2 tool calls without human intervention, up from
  9.8** six months prior; human turns down 33%.

---

## What to skip

- **"Top N agentic AI trends 2026" listicles.** Almost all restate the same three vendor posts
  with an affiliate link. If it doesn't cite a benchmark or a production system, close it.
- **Tool-comparison roundups** ("Claude Code vs Cursor vs Codex, ranked"). Stale within weeks and
  usually measuring preference, not capability.
- **Vendor benchmark claims without an independent replication.** The code-indexing space is
  especially bad — the widely-cited "10x fewer tokens" figure is **one unreplicated study**, and
  most other numbers are self-reported.
- **Anything leaning on the Gartner "50% of agents will use graph context by 2028, +30%
  accuracy" line** as if it were a finding. It's an analyst forecast.

---

## Suggested order

If you read four things: **Manus → Anthropic context engineering → Cognition pair → the AHE
ablation.** That's roughly two hours and covers the mechanism, the framework, the best
counterintuitive result, and the evidence that structure beats prose.

Then `2602.14690` (the 2,853-repo study) last, deliberately — it's the one that tells you how
little of this is actually proven, which is the right note to end on before changing your setup.
