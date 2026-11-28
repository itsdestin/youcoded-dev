---
date: 2026-10-24
status: draft
type: design-proposal
topic: workflow builder — phased proposal, every phase is the real product
card: 74
---

# Workflow builder — phased proposal (2026-10-24, rev 3)

Rev 3 replaces rev 2 (commit a500b637b). Destin: rev 2's phase 1 spent effort testing the old
chat-only plans product, *"a product that won't be the thing we're actually trying to build."*
Rule now: **every phase ships a slice of the workflow builder itself**; the old plans code is
mined for parts inside whichever phase needs them, never tested or shipped on its own.
Inputs: `docs/active/design/2026-10-24-workflow-builder/decisions.md`, review
`docs/active/reviews/2026-10-24-workflow-builder-proposal-review.md`.

## What it is

A **workflow** is a saved file: rows of **cards**, each card one specialist with its own
instructions and model. Cards in one row run at the same time; rows run one after another. You
press **Run** and watch it work, with live spending against one optional whole-run limit.

## Settled so far

One file is the workflow, you and the assistant edit the same file · one editor, in a Workflows
screen · rows of cards, no wires · different cards side by side is core · no per-card dollar
limits · dropped for now: folder-of-files splits, starter workflows.

## How the old plans code is used

Taken as parts, as each phase needs them: the part that runs specialists in waves and tracks
their spending (phase 1), the saved-progress / pause / continue machinery (phase 2), the estimate
(phase 4). **Not carried over:** the chat plan card, the assistant's "propose a plan" tool, the
plan settings sheet, and their tests — phase 3 replaces them. Bringing the old branch up to date
as a whole is skipped; the parts are copied onto today's app and adapted.

## Phase 1 — Build a workflow and run it

**You can:** open Workflows, make a workflow, add rows and cards, run it, watch each card work,
see what it spent, stop it, read every card's result.

| Included | Why in this phase | Cost of leaving it out |
|---|---|---|
| Workflows screen: list, editor, Run | It is the product | — |
| Rows; several different cards in a row | The core shape (Destin: keep) | Would just be a list of chat helpers |
| Card: name, instructions, model, "Starts from" specialist | Minimum a card needs; "Starts from" also sets what it may do, so no permissions panel | — |
| Each row gets the row above's results | Without it cards can't build on each other | Workflow would be useless |
| Live status per card, Spent $X, Stop, final results | You must see it working and be able to stop it | Unsafe to run |
| One optional whole-run spending limit (stops at the limit) | Protects against a runaway bill from day one | Risky to try on real jobs |

| Left out | Why not yet | What you see instead |
|---|---|---|
| Surviving an app restart | Needs the save/continue machinery, which phase 2 brings anyway for checkpoints | After a restart the run shows "Stopped when YouCoded closed" with Run again |
| Continue past the limit | Same machinery | At the limit the run stops; run again with a higher limit |
| Cost estimate before Run | Needs past-run history matched to cards; nice, not needed to judge the core | Live spending only |
| Checkpoints, loops, reading earlier rows | Phase 2 | — |
| Assistant making/editing workflows | Phase 3, once the file shape has settled | You build by hand |

Risk: the biggest phase, because it carries the engine move. Upside: the first thing you try is
the actual product. **Checkpoint:** you build three different reviewers side by side plus a card
that combines them, on a real folder, and decide if the shape feels right before anything else
is built on it.

## Phase 2 — Long jobs that check in with you

**You can:** leave a long job running, have it stop and ask you, loop until good, and pick up
after a restart.

| Included | Why together |
|---|---|
| "Ask me first" checkpoint row: results so far, optional choices, a note, Continue / Stop | All four need the same "pause, save, continue later" machinery; building it once covers all of them |
| "Repeat until good" around rows, with a maximum | |
| Survive an app restart (waits with Continue) | |
| Continue past the spending limit (asks a new total) | |
| A card reads chosen earlier rows ("← from rows 1 and 3") | Loops and checkpoints are where cards need more than the row above |

Left out: if/then branches, folder splits (Destin: out). **Checkpoint:** the "build a feature"
example runs with a plan-approval checkpoint and a review loop, across an app restart.

## Phase 3 — The assistant builds and edits workflows

**You can:** say "make me a workflow that…" in chat and get one to open and run; ask the
assistant to change a workflow from inside the editor.

| Included | Why |
|---|---|
| Chat → assistant writes the workflow file → a card with Open / Run | The fastest way to a first workflow; every strong competitor drafts for you |
| "Ask the assistant" box in the editor, changed cards highlighted | Round-trip editing, the decision of Q-4 |
| The old "propose a plan" ability retired in favour of this | One way to do it, not two |

Why third, not first: the assistant has to write the file's exact format; doing it after
phases 1–2 means that format (rows, checkpoints, loops) is finished and the assistant is taught
it once. Cost: until then you build by hand. **Checkpoint:** describe a job in chat, change one
card, run it.

## Phase 4 and later — polish, decided when we get there

Cost estimate before Run · inputs for reruns · per-card permission choices · Files-panel summary
· phone (watch, answer checkpoints) · save result to a file · re-run a failed card · per-card
cost · "save this chat as a workflow" · folder-of-files splits · starter workflows · sharing ·
schedules (with Autonomous Assistants).

## Plumbing note (invisible to users)

Every specialist takes its folder, permissions and approval prompts from a conversation. A run
started from the Workflows screen gets its own conversation for that, not shown in the chat
list; closing any chat never stops a run.

## Engine limits inherited (revisit per phase)

6 top-level steps, 8 items per split, 4 specialists at once, local models one at a time, one
file-editing specialist at a time. Run specialists do not count toward the 30-per-chat cap
(checked 2026-10-24: only the assistant's own `Task` tool spends it).
