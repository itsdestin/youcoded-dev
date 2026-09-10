---
status: active
---

# How we cut things to fit a small model, and how the field does it

Investigated 2026-09-09 while building the "What the assistant was given" panel. Destin asked
whether a truncated skill gives the model the path to the full file, or whether the model gets
the whole skill when it invokes it. Answering that from the code turned up a wider problem, so
the investigation widened with it. **Parked the same day: we finish the panel first.** The open
decisions are written up as a ready-to-serve deck — see "The decisions" below.

## The question that started it

**Do truncated skills carry a path back to the file? Does invoking one get the full text?**

No, and it depends which way you invoke it.

## What we do today (verified in code, not from docs)

Three kinds of file, three different treatments. Only the first was ever designed on purpose.

| What | How it is fitted | Does the model learn where it came from? |
|---|---|---|
| Root project rules (CLAUDE.md / AGENTS.md) | `fitProjectInstructions` — **outlined**: every heading survives at every budget, body text fills from the top, outlined sections marked `…` | **Yes** — the notice names the file: "Read `<file>` for the full text of any section you need." |
| A skill invoked with `/name` | `fitInjection` — **head cut**, now on a line boundary rather than mid-word ✅ | **Yes, as of 2026-09-10** ✅ — was "Ask for the rest if you need it", naming no file and no one to ask |
| A path-triggered rule | `fitInjection`, same cut | Yes ✅ — the wrapper already carried `<project-rule source="…">`, and the notice now names it too |
| A skill the model chooses itself (the `Skill` tool) | **Was not window-aware at all** — a flat 30,000-char cap for every model. Now takes the session's injection budget ✅ | No — it is the model's own tool call, so it already knows the skill id it asked for |
| MCP add-on tools | Whole servers dropped **from the end** of the registry order until the schema budget fits | n/a |
| Oversized command output | **Spilled to disk**, and the model may read it back (`internalReadRoots`) | Yes — this is the good pattern, and it is already ours |
| The conversation itself | Two-stage compaction, fails safe, never drops a message, cuts on a user boundary | n/a |

Key files: `desktop/src/main/harness/injection/injection-budget.ts` (both fitters),
`harness-session.ts` (`injectPathTriggers`, the conditional `Skill` tool),
`native-session-host.ts` (`invokeSkill`), `tools/skill.ts` (the model-facing tool),
`capability-profile.ts` (the sizing), `skills/skill-invocation.ts` (`frameSkillInvocation`).

### It is window size, not local versus cloud

`capability-profile.ts` sizes everything from the **measured** window, with one shortcut:
frontier providers are assumed roomy even when the window was never discovered. Boundaries are
100k and `SMALL_LOCAL_CONTEXT` (32,768):

- **Injected content** (skill bodies, rule text): 20,000 / 6,000 / 2,000 tokens.
- **MCP tool schemas**: 20,000 / 4,000 / 750 — deliberately without the frontier shortcut, because
  a schema costs request bytes on every turn regardless of provider.
- **`exposeSkillCatalog`** (may the model choose skills itself): needs a `full` presentation tier
  AND a window ≥ 32,768. Below that, skills are reachable only by `/name` — which is the truncating
  path. So on exactly the models where cutting happens, the non-cutting route does not exist.
- Also lost below the line: delegation to specialists, parallel tool calls, full tool descriptions;
  doom-loop threshold drops to 2.

### The consequence, and what is left of it

As found, a cut skill on a small model was **lost, not deferred**: half a procedure, "ask for the
rest", no file named, no route to it. The ✅ rows above fixed that on 2026-09-10 — the notice now
names the file.

What remains is that the cut is still a **head cut**, so the model is handed the first N lines and
told to read the file for whatever followed. It knows where the rest is; it does not know what
shape the rest is, the way an outlined project-rules file tells it. That is the parked rework, not
a defect.

## What the field does

| Tool | Instruction files | Skills | Tool output | Small models |
|---|---|---|---|---|
| **opencode** | Injected **whole, every turn, no size guard**. A 331KB AGENTS.md consumed 81% of a 128k window before any work; the request for a configurable cap was **closed as not planned** | Progressive disclosure: name + description up front (~100 tokens each), body fetched on demand by a tool. Hands the model **the skill's base directory and up to ten supporting file paths**, plus `read_skill_file`, a reading tool scoped to skill folders. No documented size cap on the body | — | Needs ≥64k for orchestration |
| **Hermes** (Nous) | Context files cut **70% head / 20% tail with a marker between**; cap scales with the window (floor 20,000 chars, ceiling 500,000) | — | **Spilled to disk**, not cut (100,000 chars, 50,000 for MCP), scaled down for small models | **Refuses below 64k.** Open bug: switching to a lower-context local model sends oversized prompts, its counting undercounts, and compression can *increase* prompt size |
| **Pi** | AGENTS.md injected at startup; APPEND_SYSTEM.md for global rules | — | Extraction around matching terms rather than truncation (context-mode plugin) | On overflow: drop the failed message, compact, retry once |
| **Cline** | — | — | Truncated at fixed, non-configurable limits (open issue) | Auto Compact summarises the conversation; falls back to rule-based truncation |
| **Roo Code** | — | — | — | Condensing + sliding window, originals preserved internally. Open bug: **condensing silently fails when the model's window is smaller than the current context** |
| **Goose** | `.goosehints` injected as-is | — | — | Session-level compaction and truncation |
| **Aider** | Not truncated | — | — | Budget-aware **repo map**: PageRank over the symbol graph, binary search to fit `max_map_tokens`, adaptive (grows when few files are open) |

**The failure that actually bites everyone** is not clever trimming — it is the server silently
truncating. Ollama's default window is 4096 and it cuts without an error; the system prompt and
rules sit at the front, so they vanish and the model "forgets" its instructions. Every guide's
advice is to set the window manually. **We already avoid this**: the real window is read from the
server and clamped, never guessed.

## Where that leaves us

**Ahead:** outlining a rules file so every heading survives and the file is named. I found no other
tool that preserves instruction structure at all. Also: reading the real window rather than
guessing, and budgeting tool schemas.

**Behind:** skills. We now hand over the location as well as the fragment (2026-09-10), which closes
the worst of the gap with opencode — but opencode also gives the model the skill's whole folder and
a reading tool scoped to it, while ours points at a file the model may not be allowed to open
without asking you. Hermes keeps both ends of a file; we keep only the front. Hermes spills
oversized tool output to disk and lets the model read it back — and so do we, for command output,
which makes the skill case an inconsistency rather than a missing capability.

**Nobody, as far as I could find, tells the USER what was cut.** That is what the panel does, and
it appears to be the part no one else has. Reported as a negative from a few hours of searching,
not an audit.

## The decisions, when we pick this up

Seven questions are written up with options, pros/cons, and — for each option — who else ships it
and how it went for them:
`docs/active/design/2026-09-09-small-model-context/small-model-context.questions.json`

Serve it with `review-cards.py serve --no-build`; it needs no workbench.

1. The shape of a cut: outline and name the file / keep both ends like Hermes / leave it out entirely.
2. Should following a pointer cost a permission prompt? (Skills live outside the project folder, so
   today it would.)
3. Should the two routes into a skill behave the same?
4. Half a skill or none, when you asked for it by name?
5. What is sacrificed first — today it is add-on tools, from the end of the list, undecided by anyone.
6. Should we have a floor below which we refuse, as Hermes and opencode do at 64k?
7. Re-fit when the model changes mid-chat, or state plainly that the figures are from the start?

**Nothing is decided.** The deck was opened and Q-1 leaned toward outlining, but it was never
submitted, so it is not an answer.

### Done 2026-09-10 — the correctness fixes, at Destin's call

Three things that were plainly wrong rather than merely unfinished were fixed on this branch
(`aa6091f1`), leaving the design rework parked:

- **The notice names the file.** `fitInjection` takes the source path, like
  `fitProjectInstructions` always has. With no path to give it now says only that the cut
  happened, rather than "ask for the rest" with nobody to ask.
- **The cut lands on a line boundary**, with a 50% floor — the rule `headCut` already used.
- **The model-invoked `Skill` tool takes the session's budget** instead of a flat 30,000
  characters, so one skill is one size however it was reached.

Pinned by five tests in `tests/injection-budget.test.ts`. `verify.sh` green.

### Still to decide, when this resumes

Smallest first, largest last:

1. **Outline skills instead of head-cutting them.** A SKILL.md is markdown with headings, the same
   shape as a rules file. Reuses code we already trust; generalise `fitProjectInstructions` rather
   than writing a second fitter.
2. **One vocabulary for "this was cut."** Three different notices exist today for the same event
   (`fitInjection`, `outlineNotice`, `composeNotice`). The panel should quote the same words the
   model was given.
3. **A skill-scoped reading door**, so following a pointer does not cost a permission prompt — the
   pattern opencode uses and that our own command-output spillover already establishes.
4. **Re-fit on model switch, or say plainly the figures are from session start.** `setBinding` does
   not re-apply sizing today, and the panel must not imply that it does.

Do **not** copy Aider's ranking for prose: dropping low-ranked items suits a generated code map, not
a procedure where step 4 matters even when it is dull. Do not treat conversation compaction as the
answer to instruction size, which is what Cline, Roo and Goose do.

## Sources

- opencode skills: https://opencode.ai/docs/skills/ · https://opencode.school/lessons/skills/
- opencode AGENTS.md size: https://github.com/anomalyco/opencode/issues/18037
- Hermes context files + spillover: https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files
- Hermes model-switch bug: https://github.com/NousResearch/hermes-agent/issues/23767
- Pi: https://pi.dev/packages/context-mode · https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md
- Cline auto compact: https://docs.cline.bot/features/auto-compact · truncation issue: https://github.com/cline/cline/issues/13263
- Roo condensing bug: https://github.com/RooCodeInc/Roo-Code/issues/10781
- Goose hints: https://github.com/PreResearch-Labs/goose-agent-os/blob/main/documentation/docs/guides/context-engineering/using-goosehints.md
- Aider repo map: https://aider.chat/docs/repomap.html · https://aider.chat/2023/10/22/repomap.html
- Ollama's silent default window: https://localaimaster.com/blog/goose-ollama-local-agent
