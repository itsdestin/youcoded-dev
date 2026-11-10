---
date: 2026-10-24
status: active
type: design-decisions
topic: workflow builder — Destin's answers to the opening questions deck
---

# Workflow builder — opening decisions (2026-10-24)

Source: `workflow-builder.questions.answers.json` (submitted 2026-10-24 23:17). Card #74.

| Q | Decision | Destin's note |
|---|---|---|
| 1 | First jobs to be great at: **build**, **research**, **work on my files** (recurring jobs not first) | |
| 2 | Where it lives: **a workflow is a file**. It opens in its own editor inside the Files panel next to documents, **and** in a built-in YouCoded page | "depends on how we actually build the backend" |
| 3 | Layout: **rows of cards** (lanes), not a free canvas with wires | |
| 4 | **You and the assistant edit the same workflow** | |
| 5 | Each card sets: **instructions, model, what it may do**. Folder and "what it hands on" left open (maybe later). **No per-card dollar limits** | Per-specialist limits made every plan fail before; only the whole run gets a limit |
| 6 | Connections: **one after another, several at once, combine/check, repeat until good, ask me first**. Not: if/then, split by a card's result | "Ask me first" should be real checkpoints, e.g. after steps 1–3, come back with 3 options to pick from before 4–6 (note cut off after "or") |
| 7 | **Runs on its own**, not tied to a chat | |
| 8 | **No per-card limits** (only the whole-run limit) | |
| 9 | Saved workflows **take inputs** | |
| 10 | Schedules **later**, with Autonomous Assistants | |
| 11 | **Fold the built plans work into the builder** rather than ship the chat-only version first | "will need to iterate probably" |

## What this settles for the design

- One workflow file is the single source of truth. The visual editor, the assistant and the
  run all read and write that file, so the picture and the plan can never drift apart.
- A checkpoint card pauses the run and shows you the results so far, optionally as a few
  options to choose from; your choice (or a typed note) goes to the cards after it.
- Spending: one optional limit for the whole run, plus the pre-run estimate and live spending
  the plans engine already has.
- Card #74's group A (finish the chat-only plans first) is replaced by: reuse the plans engine
  under the builder. The engine's step types map onto the chosen connections; new work is the
  file format, the standalone owner (no chat needed), parallel lanes, checkpoints, per-card
  tools, and inputs.
