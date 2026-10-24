---
date: 2026-10-24
status: draft
type: design-proposal
topic: workflow builder — the full current proposal, before mockups
card: 74
---

# Workflow builder — current proposal (2026-10-24)

Draft for review before anything is drawn. Built from Destin's answers
(`docs/active/design/2026-10-24-workflow-builder/decisions.md`, answers file beside it), the
landscape study (`docs/active/investigations/2026-10-24-multi-agent-workflow-landscape.md`) and
the unmerged plans engine (youcoded branch `feat/specialists-plans-ui`, see
`docs/active/handoffs/2026-10-24-specialists-and-plans-START-HERE.md`).

## 1. What it is, in one paragraph

A **workflow** is a saved recipe for a multi-agent job: rows of **cards**, each card one
specialist with its own instructions, model and allowed actions. You (or the assistant) build
it, press **Run**, and the app works through it by itself — cards in the same row at the same
time, rows one after another — pausing at **checkpoints** to ask you, and showing live spending
against one optional limit for the whole run. The same file can be run again with new inputs.

## 2. Who it is for, first jobs (Q-1)

1. **Build** — "add a feature": explore the code → plan → build → three different reviewers in
   parallel → combine their findings → fix → repeat until the reviewers pass.
2. **Research** — "compare 6 laptop options": one researcher per option in parallel → combine
   into a table → checker verifies sources → report.
3. **Work on my files** — "summarise every PDF in this folder into one brief", "clean these 4
   spreadsheets and merge them".

Recurring/scheduled jobs come later with Autonomous Assistants (Q-10).

## 3. Where it lives (Q-2, Q-7)

- **A workflow is a file** (`<name>.workflow`, JSON inside), saved in a project folder or in
  `~/YouCoded/Personal/Workflows/`. One file is the only source of truth: the editor, the
  assistant and the runner all read and write it, so the picture and the plan cannot drift.
- **In the Files panel** it opens in its own viewer, registered like the existing ones
  (`artifact-views/RendererRegistry.ts`: Markdown, CSV, DOCX, XLSX, PDF …). Opening a workflow
  shows the editor; a **Run** button sits in the viewer's header.
- **A built-in "Workflows" screen** lists every workflow the app knows about and every run
  (running, paused, finished), with the same editor when you open one. (Destin asked for both
  places; the screen is the home base, the Files panel is where you meet one next to your work.)
- **A run does not need a chat.** It has its own owner in the app's main process and its own
  run record. A chat may *start* one (the assistant hands it to you as a card), but closing the
  chat does not stop it.

## 4. The editor (Q-3)

**Rows of cards, top to bottom.** No free canvas, no wires.

```
 ┌ Inputs ───────────────────────────────────────┐
 │ Feature to build: [__________]  Folder: [repo] │
 └────────────────────────────────────────────────┘
 Row 1   [ Explore the code ]
 Row 2   [ Write a plan ]
 Row 3   ◆ Checkpoint: "Approve the plan"
 Row 4   [ Build it ]
 Row 5   [ Review: bugs ] [ Review: UX ] [ Review: speed ]     ← side by side = at once
 Row 6   [ Combine findings ]  ← reads rows 5
 Row 7   ⟲ Repeat rows 4–6 until "no blocking findings" (max 3)
 Row 8   [ Final report ]
```

- **Add a card**: a "+" at the end of a row (runs alongside) or between rows (runs after).
- **Drag** to reorder rows or move a card to another row.
- A card shows its name, model chip, and a one-line summary of its instructions.
- Each later card automatically receives the results of the row right above it. A card can
  additionally pick earlier rows to read ("← from rows 1 and 5"), the same "from steps" line
  the plans card already shows.
- **Repeat** is a bracket around a range of rows with a stop condition and a maximum (cap 5).
- **Estimate** sits in the header: "Usually $0.80–$3 · about 6 minutes", from your own past
  specialist runs (the plans estimate, already built).

## 5. A card (Q-5)

Opening a card shows a side panel:

| Setting | What you see | Notes |
|---|---|---|
| Name | "Review: bugs" | |
| Starts from | Explorer / Researcher / Reviewer / Worker / one of *your* specialists | Reuses the existing specialist definitions; picks sensible defaults for the rest |
| Instructions | A text box. `{input name}` inserts a workflow input | |
| Model | The existing model picker (`ModelPicker.tsx`) | Local and cloud models can mix in one workflow |
| What it may do | Read only · Edit files · Run commands · Use the web (checkboxes) | Defaults from "Starts from"; never more than the app's permission mode allows |

Not in v1 (Destin: maybe later): per-card folder, per-card fixed answer format, **per-card
dollar limits** (they made earlier plans fail constantly; only the whole run has a limit).

## 6. Connections (Q-6)

| Kind | How it looks | Engine today |
|---|---|---|
| One after another | Next row | Steps run in order ✔ |
| Several at once | Cards in one row | "Split" runs one brief over a list; **different cards side by side is new** |
| Combine / check | A card that reads earlier rows | `combine` / `verify` with `of` ✔ |
| Repeat until good | Bracket over rows | `repeat` (max 5, until) ✔ |
| Ask me first | ◆ Checkpoint row | **New** |

Not in v1: if/then branches, "split by a card's result".

## 7. Checkpoints

A checkpoint row pauses the run. The run's card (in the Workflows screen, and in a chat if it
was started from one) shows:

- the results so far (each finished card's report, collapsed),
- **either** a few options to choose from — written by a card just before it ("Give me 3 plan
  options") — **or** just Continue,
- a note box ("Use option 2 but skip the database change"),
- **Continue** · **Stop**.

Your choice and note are handed to every card after the checkpoint. A paused run waits
indefinitely; the app shows the red attention dot like specialist approval requests today.

## 8. Running and watching

- **Run** → if the workflow has inputs, a small form → the estimate again → Start.
- The run view is the editor in read-only mode with live state on every card: waiting /
  running (with a live activity line) / done / failed / paused. Open a card to read its live
  transcript and report.
- Header: **Spent $1.20 of $5** (or "Spent $1.20" with no limit), Stop.
- **Limit reached** → pause: "Reached your $5 limit" with Stop · Continue (asks a new total) —
  the plans engine's built behaviour.
- **A card failed** → that card shows the real error; small hiccups retry once by themselves;
  otherwise the run pauses with **Retry this card** · Skip · Stop.
- **App restart** → the run waits with Continue (built).
- Concurrency: 4 specialists at once, local models one at a time (built rule).
- **Finish** → a final report (the last card's output) shown in the run, and in the starting
  chat if there was one. Files the cards changed are listed with links.

## 9. The assistant and you edit the same workflow (Q-4)

- In chat, "build me a workflow that…" → the assistant writes a `.workflow` file and shows it
  as a card with **Open** and **Run**.
- In the editor, an **Ask the assistant** box ("add a security reviewer to row 5") sends the
  request plus the file; the assistant edits the file; the editor reloads it, highlighting what
  changed.
- The assistant's current "propose a plan" ability becomes "propose a workflow": same card,
  but the plan is now a file you can open, edit and save.

## 10. Inputs and reuse (Q-9)

- A workflow declares inputs (text, a file, a folder). Instructions use `{input name}`.
- Run with different inputs any number of times. Each run keeps its own record next to the
  workflow (`.youcoded/runs/`), listed in the Workflows screen.

## 11. Spending (Q-5, Q-8)

One optional limit per run (off by default), live spending, pre-run estimate, the same number
as the cost chip. No per-card limits. Subscription and local models show tokens instead of
dollars, as plans already do.

## 12. What gets reused vs built

**Reused from the plans branch:** the runner (waves, saved progress, restart survival, safe
retries), spending tracker and limit pause, estimate from past runs, per-step model, the plan
card's look, the "from steps" line, the brief preview.

**Reused from master:** file viewers registry, model picker, specialist definitions and launch
(`Task` tool), specialist status chip/popup, approval-at-bottom and red dot, ScreenBand (screen
header), ErrorState.

**New:**
1. The `.workflow` file format (rows, cards, checkpoints, repeat, inputs) and its validator.
2. A standalone run owner (today a plan must belong to a live chat).
3. Different cards side by side in one row.
4. Checkpoint rows with options and a note.
5. Per-card allowed actions.
6. The editor (Files-panel viewer + Workflows screen) and the run view.
7. The assistant's write/edit path for `.workflow` files.

**Catch-up needed:** the plans branch is ~1,430 commits behind master with 40 conflicting files;
bringing its engine over is the first technical task.

## 13. Proposed order of work

1. Mockups in the workbench → UX tester → review deck (editor, card panel, checkpoint, run view,
   chat card).
2. Contract from the answered decks.
3. Bring the plans engine onto master (engine only, no chat card yet).
4. File format + standalone runner + rows + checkpoints.
5. Editor and run view.
6. Assistant authoring.
7. Reviews, grader, acceptance.

## 14. Known open questions

- Is the Workflows screen a new top-level view, or a section of an existing one?
- Do several cards that edit files in the same row collide? (v1 idea: only one "edit files"
  card per row; parallel builders in separate copies of the project is plans stage 3.)
- Phone: the phone runs the desktop engine now, so runs could be watched there; editing on a
  phone is probably view-only in v1.
