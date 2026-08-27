---
title: "Context & knowledge as product surfaces — preliminary outline"
date: 2026-07-28
status: draft
type: idea-source
tags: [product, context, knowledge, sync, marketplace, memory]
---

# Context & knowledge as product surfaces

> ## Status 2026-08-26 — an IDEA SOURCE, not a buildable spec; nothing built; recommend archive
>
> `type:` corrected `spec` → `idea-source`. This file has no design, no interfaces, no
> decisions and no acceptance criteria — it says so itself in its first line ("Preliminary
> outline, not a spec") and every one of its five items ends in "needs its own spec before
> build". Leaving it in `docs/active/specs/` makes it read as approved design work in flight.
>
> Verified 2026-08-26 against `youcoded` `origin/master` (`dbbb9139`) — none of the five ideas
> has been built:
> - `git grep -rn -i 'provenance' origin/master -- desktop/src` returns 9 hits, **none about
>   memory**: artifact watching, eval estimates, permission-rule `grantedAt`, image counts,
>   sync `addedBy`. There is no memory-entry provenance field anywhere (idea #5).
> - `ContextPopup.tsx` still renders only the aggregate gauge (`:147` "N tokens remaining",
>   `:164` a percent/tokens toggle) — no per-item token cost, no "loaded because you touched X"
>   attribution, no per-turn capture, no session mutes (idea #1).
> - `git -C wecoded-marketplace grep -rn -i 'knowledge.pack' origin/master` → no output
>   (idea #4).
>
> **Its content is already fully mirrored into `ROADMAP.md` line 945**, which reproduces the
> five ideas, the `1 → 2 → 5 → 3 → 4` sequencing, the OWASP ASI06 gate on #4, and the
> explicit no-knowledge-graph decision — and cites this file by path.
>
> **Recommended: move to `docs/archive/specs/`** (or `docs/archive/investigations/`, beside its
> research backing `docs/active/investigations/2026-07-28-agent-harness-frontier-research.md`).
> The ROADMAP entry stays the live pointer; this stays the long-form source it points at.
> Nothing here is stale — it is simply not in flight. (Not moved here; Destin's call.)

**Preliminary outline, not a spec.** Five ideas from the 2026-07-28 agent-frontier research
session, sized and sequenced but not designed. Each needs its own spec before build. Research
backing: `docs/active/investigations/2026-07-28-agent-harness-frontier-research.md`.

The through-line: mainstream assistants treat context and knowledge as invisible machinery.
YouCoded already computes both (`project-context.ts`, `ContextPopup.tsx`, the memory dir
resolver) but presents them as a status readout rather than a product surface. Every idea below
is "make the invisible legible, and the wrong parts deletable."

Ordered by (user value × distance from what already exists).

---

## 1. Context transparency — grow `ContextPopup` into a first-class surface

**What exists:** `main/project-context.ts` discovers recognized instruction files, parses rule
frontmatter to classify eager vs. path-scoped (`parseRulePaths`), and resolves
`~/.claude/projects/<slug>/memory`. `ContextPopup.tsx` renders it.

**What's missing:**

- **Token cost per item.** "CLAUDE.md — 2,800 words, ~3,700 tokens, loaded on every message."
  Users have no intuition for a context budget because nothing has ever shown them one.
- **Attribution.** "`chat-reducer` rule loaded because you touched `chat-reducer.ts`." Makes the
  lazy-loading mechanism learnable instead of magic.
- **Post-hoc "why did it do that?"** After a response, show which context items were live for
  that turn. Requires capturing the context set per turn, not just per session.
- **Toggles.** Mute a rule for this session without editing files.

**Why it matters:** this is the accessibility pillar with something concrete behind it — not
"we made it simpler" but "we made it legible." No mainstream assistant does this.

**Unknowns:** where per-turn context capture hooks in (reducer? transcript watcher?); whether
token counts can be computed cheaply enough to show live; whether Android parity holds (it
should — same React bundle).

**Size:** medium. Highest value-to-effort on this list.

---

## 2. Correction capture — knowledge for people who don't know what to capture

**Problem:** "write it in CLAUDE.md" works for developers who know what an invariant is. A
student never will. The compounding-engineering loop (plan → build → review → **codify**) breaks
at the codify step for non-technical users, which is most of the target audience.

**Idea:** detect the correction moment — the user says "no, don't do that," reverts an edit, or
repeats a correction they've made before — and offer a one-tap **"remember this?"** that writes
to the right scope (session / project / global) with the right shape.

**What exists:** the transcript watcher sees the turn structure; the reducer already classifies
turns; `project-context.ts` knows where memory lives. The missing piece is detection + the offer.

**The failure mode to design against:** an assistant that asks "remember this?" too often is
worse than one that never asks. This has to fire rarely and precisely — it's a detection
problem, not a UI problem. Prototype detection against real transcripts before designing UI.

**Size:** medium-large, detection-dominated. Highest *ceiling* on this list.

---

## 3. Work state as a first-class object

**What exists:** conversations with tags, flags, notes; `OpenTasksChip`/`OpenTasksPopup`;
session browser; artifact tracker.

**What's missing:** a **project state** distinct from a conversation list — what's in flight,
what's blocked on the user, what was tried and rejected. Today "where did I leave off" is
answered by scrolling a transcript.

**Why it's the differentiator:** cross-device *conversation* sync is table stakes now.
Cross-device *work state* — resume the task, not the chat log — isn't. Sync spaces already
carry the transport.

**Design notes:**
- Store as JSON, not Markdown — models rewrite Markdown freely and leave JSON alone
  (Anthropic's long-running-agent finding), and this is a file agents should append to rather
  than editorialize.
- Should be *agent-writable*, so state accrues without the user maintaining it.
- Relationship to the existing tasks surface needs resolving before design — this may be a
  promotion of `OpenTasks` rather than a new object.

**Size:** large. Depends on a store decision (new object vs. extension of conversations).

---

## 4. Sync knowledge, not just conversations — and share it

**Idea:** sync spaces currently move conversations. Extend to **knowledge**: memory, learned
corrections, project rules. The assistant that knows you on desktop knows you on Android because
the knowledge synced, not because it re-derived it.

**Then the social pillar:** share a knowledge pack the way themes are already shared. A study
group shares "how our professor wants lab reports formatted." A team shares its house style.

**What exists:** the marketplace already handles discovery, install, ratings, reporting, and
publishing (`marketplace-api-handlers.ts`, the publisher plugin, the worker backend). Themes
prove the distribution model end to end.

**New object type:** a knowledge pack is neither a theme nor a skill. Registry schema, install
semantics, and update behavior all need definition. Closest prior art is the theme registry.

**Size:** large. Gated on #5.

---

## 5. Provenance and revocation — the prerequisite for #4

**This is a blocker, not a feature.** Shared knowledge that writes into an assistant's memory is
**memory poisoning as a product surface** — OWASP ASI06:2026. Unlike prompt injection, poisoned
memory persists across sessions and fires later on an unrelated trigger; MINJA reports >95%
injection success against production agents. A shared pack saying "always run this first"
survives every restart.

**Requirements before any shared-knowledge feature ships:**

- Every memory entry carries **provenance** — user-authored, agent-inferred, or installed-from-X.
- Installed knowledge is **visibly namespaced** and **separately revocable**; uninstalling a pack
  removes everything it wrote.
- Nothing installed can silently amend **user-authored** memory.
- Surfacing in `ContextPopup` (#1) so provenance is visible where context is visible.

**Note:** the mitigation is provenance, not filtering. Attempting to detect malicious knowledge
by content is a losing game; making its origin visible and its removal complete is not.

**Size:** medium, but must precede #4.

---

## Sequencing

**1 → 2 → 5 → 3 → 4.**

#1 is the smallest, most visible, and closest to shipped code — and it's the surface every later
idea needs (provenance, work state, and shared-pack attribution all want to render somewhere).
#5 gates #4 absolutely. #3 is the largest and can move independently.

## Explicitly not doing

**A knowledge graph.** Files, JSONL, and the existing sync layer carry all of the above. The
graph-database framing is where a lot of teams are currently spending a year for benchmark gains
that don't transfer to this product's shape.
