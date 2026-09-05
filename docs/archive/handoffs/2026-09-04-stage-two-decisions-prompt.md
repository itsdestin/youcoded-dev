---
date: 2026-09-04
status: superseded
type: handoff
topic: the prompt Destin pastes into a fresh session to settle what gates specialists stage two (plans), then start the stage-two design
---

# Prompt: settle what gates plans, then start designing them

Paste everything below the line into a new session. It is written for a session
with no context. It leads with a question deck because five decisions are owed,
and four or more questions never go in chat.

---

I want to start building **specialists stage two — plans** (the model proposes a
multi-step fan-out of helper sessions as a document, I approve it as a card with an
enforced worst-case cost, and it resumes across a restart). Before any design work,
settle the decisions that gate it, then start the stage-two design under the feature
flow. Do it in this order.

**1. Read, in this order, nothing else first:**
- `docs/active/handoffs/2026-09-04-specialists-stage-two-START-HERE.md` (the map)
- `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md` §2, §5.3, §6.1, §8, §9
- `docs/active/specs/2026-08-11-native-specialists-design.md` §4, §7, §8
- `youcoded/docs/engine-dependencies.md` → "Parallel slots" and the sections after it.
  The three live probes the spec required were run on 2026-09-04 against the pinned
  engine build; the numbers there are the ground truth for local-model fan-out and
  plan authoring. Do not re-run them.

**2. Put these decisions on a question deck** (`python3 scripts/questions/serve.py
<spec.json>`, run in the background; every question in the four-part format the
script's header describes: today / the problem / the proposal / options with pros and
cons about what I will experience). One question each:

1. **What the user organizes.** The 2026-07-09 design has one object: an agent is one
   automation. On 2026-09-01 I proposed two nested ones: an *assistant* is what I name
   and think in ("my Office assistant"); a *duty* is one recurring job it owns. An
   assistant may be a coordinator that dispatches its duties, the sole agent that does
   every duty itself, or no agent at all (a folder of duties that run on their own).
   Options: the one-object design; the assistant/duty design with the agentless folder
   as the v1 shape; the assistant/duty design with the coordinator as v1. Say which is
   cheapest to build and what each means for what I see in the Agents view.
2. **The word "assistant".** It currently names a shipped harness preset, an unmerged
   Settings panel mockup, and the container in question 1. Options: keep it for the
   container and rename the preset and panel; keep it for the preset and pick a new word
   for the container; something else. Show the copy each option leaves on screen.
3. **What plans are called on screen, given question 1.** Under the assistant/duty
   framing a helper becomes an implementation detail. Options: keep "plan" and
   "helper"; fold plans into "duties"; decide later and build stage two with today's
   words. Recommend one; do not rename anything in code before this lands.
4. **Order of work.** Stage two now, or the parity items first (the session context
   panel whose design I approved on 2026-08-17, ground-truth model metadata, model
   tiering). Model metadata is what puts a dollar figure on a plan card; without it the
   card shows a token ceiling only. Options: plans now with token-only ceilings, then
   metadata; metadata first, then plans with dollars from day one; the context panel
   first. Give the honest cost of each in weeks of sessions, not in code words.
5. **Local models and plan authoring.** Use the probe-3 result from the engine doc: if
   small local models could not produce a valid plan, say so and ask whether stage two
   ships gated to the model classes that can (the same gate the hire tool uses today),
   or waits for a local model that can. If they could, say that and skip the question.

Wait for the deck to be submitted. Then:

**3. Record every answer** in `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md`
§9 (strike the row, add the decision and the date to §8) and in the matching
`docs/roadmap/native-harness.md` entries (the "Assistants made of Duties" item and the
"Specialists stage two" item). Run `node scripts/roadmap-check.mjs --fix`. Commit from a
worktree, never the main checkout.

**4. Start stage two under `.claude/rules/feature-flow.md`.** Its opening questions go
on a second deck (the `ui-mockup` skill → "Before drawing anything"): what the plan card
shows, what approving and commenting on a plan looks like, what a paused-for-budget plan
looks like, what resume-after-restart looks like. Then mock the plan card and its states
in the workbench and show me a review deck. The settled decisions from the spec §4 are
not up for re-derivation: plans are data, never code; budgets are hard stops; re-plan
instead of clever plans; resume is the headline.

Rules that bind the whole session: no chat walls of questions, files handed over as
plain paths, WHY comments on every non-trivial edit, and `bash scripts/verify.sh` before
any claim that desktop code works.
