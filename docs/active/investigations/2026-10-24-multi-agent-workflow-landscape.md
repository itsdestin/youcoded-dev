---
date: 2026-10-24
status: active
type: investigation
topic: how other AI products let people build multi-agent workflows, what our built plans engine can and can't do, and where YouCoded could lead
---

# Multi-agent workflows — the landscape and where we stand (2026-10-24)

Written for Destin, plain words. Card #74. Sources: web research on official docs and blogs
(links at the end), and a read of the unmerged plans branch and of YouCoded Pages on master.

## 1. What the others offer

**Claude Code "dynamic workflows"** (the thing you named). You ask for a big job, Claude writes a
small program describing it (run these 12 agents side by side, then a reviewer, then repeat until
the checks pass), shows you a plan card, and runs it in the background. Each agent can have its own
instructions, model, and a fixed answer format so the next step can rely on it. Up to 16 at once
(256 if raised), 1,000 per run. You can watch every agent, pause, stop, restart one, and save the
workflow as a reusable command.
- Weak spots: **no visual editor** — the editable form is code; **no dollar limit**, only a
  "this is large" warning; it **can't ask you anything mid-run**; it resumes only inside the same
  session; Claude models only; uses up plan limits fast.

**OpenAI.** Codex has helper agents (explorer, worker) set up in text files, no canvas, no dollar
cap. OpenAI's visual canvas, **Agent Builder, is being shut down on 30 Nov 2026** after ~14 months.

**Google.** Gemini CLI has helper agents in text files. **Gemini Enterprise's Workflow Builder is
the closest to your idea**: describe the job, it draws a first version on a canvas, then you edit
by chat or by dragging; it has loops, conditions and "ask the user" steps, schedules, and requires
approval before changing outside data. Enterprise-only, cloud-only, Gemini models only, no cost
controls documented. **Opal** is Google's free consumer version (Labs experiment).

**Microsoft Copilot Studio**: describe it, then edit on a canvas; aimed at business users; billed
by "capacity", runs are blocked when it runs out.

**Visual builders (n8n, Zapier, Make, CrewAI, Dify, Flowise, Langflow)**: drag-and-drop canvases,
each box has its own prompt and model. Mostly automation tools with AI steps added. Zapier pauses a
run after 75 actions by default — the only real per-run limit found anywhere.

### What the best ones share
1. **The AI drafts it, you edit it.** Nobody makes people start from a blank canvas.
2. **A card to approve before anything runs.**
3. **A fixed skeleton with AI inside each box.** The order and routes are fixed; the model only
   decides inside a step. Routes chosen by the model on the fly are the most fragile part.
4. **Fixed answer formats between steps**, so step 3 can rely on what step 2 hands it.
5. **A live view you can drill into**: each box's instructions, actions and result; stop one box.
6. **Hard caps** on loops and size.
7. **Save and reuse** as a template.
8. **Cheap models for easy steps.**

### What nobody does well (YouCoded's openings)
- **Real dollar limits, per box and per run, with live spending.** Nobody ships this. Our built
  plans already show live dollars and a whole-plan limit.
- **An estimate before you press play.** Nobody does. Ours exists.
- **A canvas a non-developer edits AND the AI edits**, round trip. Only cloud/enterprise products
  come close.
- **Mixing local and cloud models in one workflow** (cheap steps on your computer, hard steps in
  the cloud). Cloud vendors lock you to their own models.
- **Working on your own files, on your desktop**, without a terminal.
- **Surviving an app restart.** Claude's resumes only inside the same session; ours survives restarts.
- **Honest failures**: "this box failed, here's why, retry just this one".

### Pitfalls to avoid
- Canvases scare non-developers when they become spaghetti (wires everywhere).
- Costs blow up with many agents in parallel.
- Branches decided by the model on the fly break easily.
- Several agents writing the same files at once collide.
- Two editable versions (picture and code) drift apart — there must be one.
- Separate "agent products" keep getting folded back into the main product (OpenAI, Zapier).

## 2. What our built plans engine can do today

(Unmerged branch `feat/specialists-plans-ui`; about 7,200 lines of engine, 2,000 of card, 16,000 of tests.)

**Can:** up to 6 steps in a straight line; a "split" step sends up to 8 specialists at once (4 run at
the same time); "combine" and "check" steps read named earlier steps; "repeat until" (up to 5
rounds); per-step model; one whole-plan dollar limit; live spending; estimate; pause, resume, and
survive a restart; safe automatic retries.

**Can't (yet):**
- **Only the assistant can create a plan.** There is no way for the app or a page to hand it one;
  you can change only the limit and each step's model, and "Comment" asks the assistant to rewrite it.
- **A plan belongs to an open chat.** It can't run on its own.
- **Straight line only**: no two different steps side by side, no if/else, no "ask me before
  continuing" step.
- **No per-step limit**, no per-step tools, permissions or folder.
- A split step can't take its list from an earlier step's result.

**Good news:** the part that actually runs the work (waves, saving progress, spending, recovery)
only talks to the rest of the app through a narrow doorway, so it can be reused for a builder. The
format of a plan and the ways in would change.

## 3. What YouCoded Pages can do today

A Page is a small app (one HTML file) shown inside YouCoded, built by the assistant, with its own
saved data (up to 1 MB). A drag-and-drop editor **can** live in a Page. But a Page **cannot run
agents** today: it can only open a new-chat window with a message filled in. Running a workflow
from a Page needs Pages "phase 3: assistant tasks", which is planned but not built. Pages also
can't use outside libraries without bundling them in, and run fenced off from the app.

## 4. Sources

Claude workflows: code.claude.com/docs/en/workflows; claude.com/blog/introducing-dynamic-workflows-in-claude-code;
subagents: code.claude.com/docs/en/sub-agents. OpenAI: openai.com/index/introducing-agentkit;
developers.openai.com/docs/deprecations; learn.chatgpt.com/docs/agent-configuration/subagents.
Google: developers.googleblog.com/subagents-have-arrived-in-gemini-cli;
docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows. Microsoft:
learn.microsoft.com/en-us/microsoft-copilot-studio/flows-overview. Zapier:
help.zapier.com/hc/en-us/articles/47402591569805. CrewAI: docs-platform.crewai.com/platform/en/features/studio-flows.
Not verified: local-model support in n8n/Flowise/Langflow/Dify/CrewAI; Opal's current state;
Copilot Studio's exact rates.
