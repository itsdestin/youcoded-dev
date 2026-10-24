---
date: 2026-10-24
status: draft
type: design-proposal
topic: workflow builder — phased proposal, foundations first
card: 74
---

# Workflow builder — phased proposal (2026-10-24, rev 2)

Rev 2 replaces the all-at-once proposal (rev 1, commit f558808c2) after the independent review
(`docs/active/reviews/2026-10-24-workflow-builder-proposal-review.md`) and Destin's reply:
*"we need clearer phasing/functionality checkpoints for this work instead of trying to build
everything all at once. some of the details can be fleshed out as we build the foundations."*
Answers it rests on: `docs/active/design/2026-10-24-workflow-builder/decisions.md`.

## What it is

A **workflow** is a saved file: rows of **cards**, each card one specialist with its own
instructions and model. Cards in one row run at the same time; rows run one after another. You
press **Run**; the app works through it, shows live spending against one optional limit for the
whole run, and survives an app restart.

## Settled (Destin, 2026-10-24)

- One file is the workflow; the assistant and you edit the same file.
- **One editor**, in a Workflows screen (edit, run and finished states in one place). The Files
  panel shows a summary with "Open in Workflows" — later phase.
- Rows of cards, no wires. **Different cards side by side** is core.
- No per-card dollar limits; one optional whole-run limit.
- Built on the existing plans engine and its plan format (extended, not replaced).
- Dropped for now: "one card per file in a folder", starter workflows.

## How a run works without a chat (plumbing, invisible to you)

Every specialist in the app gets its folder, its permissions and its approval prompts from the
conversation it belongs to. A workflow run started from the Workflows screen has no conversation,
so when you press Run the app quietly creates one just for that run, holding those settings. It
is not shown in your chat list. Effect for you: the run behaves exactly like one started from a
chat, and closing any chat never stops it.

## Phases — each ends with something Destin can try

Each phase: mockup → review deck (only for that phase's screens) → build → Destin tries it in a
dev copy → go / change / stop before the next phase. Details of later phases are decided when we
get there.

### Phase 1 — The engine on today's app (no new screens)
Bring the plans engine from the unmerged branch onto the current app (~1,430 commits behind, 40
conflicting files). Keep only the engine and its current chat card; nothing ships to users.
**Checkpoint:** in a dev copy, the assistant proposes a plan in chat, it runs, pauses at a limit,
continues, survives a restart and finishes. Go/no-go: if the catch-up costs more than rebuilding,
we say so here.

### Phase 2 — Build and run your own workflow
- Workflows screen: list of workflows, the rows-of-cards editor, Run.
- A card: name, instructions, model, and **"Starts from"** (explorer / researcher / reviewer /
  worker / your own specialists) — which also decides what it may do, so no separate permissions
  panel yet.
- Rows: one after another, several at once (different cards side by side). Each row receives the
  row above's results.
- Run view = the same screen with live status per card, Spent $X (of $Y), Stop; restart → Continue.
- The run's own hidden conversation (above).
**Checkpoint:** you build a 3–4 row workflow yourself (e.g. three different reviewers side by
side, then a combine card), run it, and watch it finish.

### Phase 3 — Checkpoints and loops
- "Ask me first" row: pause, show results so far, optional choices, a note, Continue / Stop.
- A card reads chosen earlier rows ("← from rows 1 and 3").
- "Repeat until good" around a range of rows, with a maximum.
**Checkpoint:** the build-feature example runs with a plan-approval checkpoint and a review loop.

### Phase 4 — The assistant joins in
- In chat: "make me a workflow that…" → the assistant writes the file → a card with Open / Run.
- In the editor: "Ask the assistant to change this".
- The assistant's existing "propose a plan" becomes "propose a workflow".
**Checkpoint:** you describe a job in chat, open what it made, change one card, run it.

### Later (decided when we get there)
Inputs for reruns · per-card permission choices · Files-panel summary · phone watching and
answering checkpoints · save result to a file · re-run a failed card / re-run from here ·
per-card cost · "save this chat as a workflow" · folder-of-files splits · starter workflows ·
sharing · schedules (with Autonomous Assistants).

## Known limits carried in from the engine (revisit per phase)

6 top-level steps, 8 items per split, 4 specialists at once, local models one at a time, only one
file-editing specialist at a time. Plan-run specialists do not count toward the 30-per-chat cap
(checked 2026-10-24: only the assistant's own `Task` tool spends that budget).
