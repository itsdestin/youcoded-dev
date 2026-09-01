---
status: draft
created: 2026-09-01
revised: 2026-09-01 — re-measured against origin/master 602f6e9 (PR #3 merged); contract defined; evidence sections trimmed to pointers
type: plan
topic: Idea → mergeable PR. The UI deck is the one review surface; a contract, negotiated from Destin's own words, is what "done" means.
source: Frontier-AI-Lab-Assistant session 2026-08-31/09-01 (research pass + 3 review agents + code reads); review pass 2026-09-01
measured_at:
  youcoded-dev: 602f6e9 (origin/master — the local checkout was 9 commits behind when the first draft measured; see §2)
  youcoded: ddac2f14
---

# Feature flow redesign

Destin's target: **"here's my idea" → (autonomous plan/build/verify) → UI review deck → (autonomous feedback processing) → approve.** A second goal, "review the roadmap, pick 10 things, fix them," is scoped in §7 and is not built by this plan.

## 1. The flow, as Destin stated it

1. "I want feature X"
2. Model churns, then asks questions to establish what we're building and how the user should experience it — **this stays at the front; you cannot draw UI without it**
3. Short loop: draft UI → visual review → update → until consistent with intent and existing theming
4. UI deck to approve or give feedback
5. Iterate, re-review
6. Build the verification contract — what "successful/complete" means
7. Draft implementation plan → adversarial reviewers tuned to minimize complexity, improve phasing/grouping, find errors/omissions, fold in related roadmap items → goal: interventionless one-shot to a mergeable PR
8. Implement
9. Close out

**Where Destin sits (assumption — see §8 Q1).** Twice, on one surface. Step 2 is a *questions deck* answered before anything is drawn. Steps 4–6 are the *review deck*, in rounds until approve, whose final step shows the contract for sign-off. Steps 7–9 run without him. That is what "one human review point" means here: one surface, not one moment.

## 2. State of the pipeline

Three states, because "the tool exists" and "the step happens" are different facts: the deck was *built* on 2026-08-27 and *skipped* on 2026-08-31 (§4).

| Step | Exists | Used | Enforced | Mechanism |
|---|---|---|---|---|
| 2 questions | partial | yes | no | `superpowers:brainstorming` — generic, not YouCoded-aware; answers live only in chat |
| 3 draft UI loop | yes | yes | no | Workbench (`run-workbench.sh`), `ui-mockup` skill, `compare/registry.tsx` candidate sets, `MOCK_ONLY` |
| 4–5 deck + rounds | yes | usually | **no** | `review-cards.py` (approve/choice/decide/clip) → `<spec>.answers.json`; marketplace ran 3 rounds in 48 min |
| 6 contract | **no** | — | — | this plan, §3 |
| 7 plan + review | partial | yes | no | `writing-plans`; ad-hoc reviews in `docs/active/reviews/`; roadmap taxonomy draft (258 open items) |
| 8 implement + verify | yes | yes | yes | `verify.sh` — one exit code (tsc, affected tests + source-scanning guards, knip, eslint, ast-grep) |
| 9 close out | **yes** | new | advisory | `scripts/close-out.sh <branch>` — landed in PR #3 (2026-09-01 02:52 UTC); read-only, always exits 0 |

**Prerequisites that already landed (PR #3, youcoded-dev, merged 2026-09-01):** rule globs rewritten to the `**/desktop/...` form so they fire inside worktrees (131 of 134 globs now start with `**/`; commit `fd7e824`); an `InstructionsLoaded` hook that logs every rule load to `~/.claude/instructions-loaded.log`, which also solved the turn-zero mystery from the 2026-08-31 retro; the mechanical audit green (`anchors 388/388`, no budget violations, `docs/audits/2026-08-31-retrieval-repair.md`); `close-out.sh`. The first draft of this plan listed all of these as missing because the workspace checkout was behind — the retro's own Theme C, happening to the document that cites it.

**Still open from that work:** the local `youcoded-dev` checkout cannot `git pull` while `CLAUDE.md`, `ROADMAP.md`, `.claude/rules/ipc-bridge.md` and `.claude/rules/landing-page.md` carry uncommitted edits from other sessions. Five sibling documents from 2026-08-31 are untracked and uncommitted: the retrieval-repair plan, the live-review-panes spec and plan, the roadmap taxonomy draft, and `docs/active/reviews/`.

**Conclusion unchanged:** this is a pipeline to connect, plus one missing piece (the contract) and one gate to make real (the deck).

## 3. The contract

This is the piece §1 step 6 names and nothing defines. Definition first; the inputs question (§5) only makes sense against it.

**What it is.** One markdown file beside the deck: `docs/active/design/<date>-<feature>/<feature>.contract.md`. One row per criterion:

| Field | Meaning |
|---|---|
| Statement | one sentence, in the user's experience ("a second player's board is tellable from mine at a glance") |
| Checked by | `mechanical` (a test or `verify.sh` guard, named) · `deck` (an answered step, named) · `live-app` (needs the real app running) · `human` (Destin, at close-out) |
| Threshold | pass/fail; a number where one applies (the criterion fails the feature if it fails — Anthropic's "any one below it, the sprint failed") |
| Source | the Destin message, deck answer, or questions-deck row it came from, quoted |

**Who reads it.** The implementing session, at start, as the definition of done. `close-out.sh`, at the end, which prints the rows for the human to tick (a follow-up to the script, not in it yet). Adversarial plan reviewers (§1 step 7), as the thing the plan must satisfy.

**Who writes it.** A fresh subagent given only Destin-authored or Destin-approved material — the questions-deck answers, the review-deck answers and their notes, and transcript quotes (§5). **Not** the spec, the plan, or the drafting session's reasoning. *Approval counts as authorship:* the approved mockup is AI-drawn, but Destin approved it, and it is the strongest evidence the agent has. Without this line the agent would discard the one artifact CLAUDE.md calls final.

**Why a separate agent.** Anthropic's harness-design writeup: *"tuning a standalone evaluator to be skeptical turns out to be far more tractable than making a generator critical of its own work."* Self-graded agents *"confidently praise the work — even when, to a human observer, the quality is obviously mediocre."*

**The evaluator gap the "checked by" column exposes.** Anthropic's shape is planner → generator → evaluator, where the evaluator drives the running app end-to-end. Mapped here: planner = questions deck + brainstorm; generator = implementing session; evaluator = the column. `mechanical` has `verify.sh`. `deck` has the answers file. **`live-app` has nothing today** — `run-review.sh` photographs the workbench, whose fakes can stand in for an *answer* rather than a *source* (the arcade's "Jake is online" came from a fixture, so the workbench showed the healthy state forever while the shipped app could only say "No friends online"). `shot.mjs` can attach to a running Electron via `ATTACH_PORT`, and the **live-review-panes plan** (`docs/archive/plans/2026-08-31-live-review-panes-plan.md`, draft) is the rig that wires it into the deck. Until it ships, `live-app` rows are graded by Destin at close-out. This plan does not block on it.

**Correction kept from the first draft:** `MOCK_ONLY` is empty and lists only channels with *no backend*; nothing marks which fakes are answers vs sources. That marking must be built before the shim can generate `live-app` rows automatically. Out of scope here; noted for the live-panes plan.

## 4. The gate is prose today

Zero hits for `checkpoint` in `.claude/settings.json`, `.claude/hooks/`, `scripts/audit-anchors.mjs`. Enforcement is CLAUDE.md plus unticked boxes. Observed:

- `session-motion.answers.json`: `"submitted": null`, four steps `"skip"`, dwell 38 s / 5 s / 3 s / 1 s. The plan's done-criteria said "every step answered"; nothing failed. **Cause is known:** four clip steps Destin could not judge — the live-panes spec re-authors them as live pick-one steps. So this is one deck-format failure *and* one missing gate, not two gates.
- Deliverables-card plan, line 12: the boxes *"were never ticked"*; ten user-facing decisions *"vetoable until Task 6 starts"* — an expiry nothing watched.
- Marketplace's final plan sends a copy decision *"to the deck at Task 23"*; Task 23 (*Verify end-to-end, merge, close out*) has no deck step.

**Decision:** the gate is the contract file's existence plus a submitted answers file for the last round. `close-out.sh` gets a `Contract` section that reports both (advisory, like the rest of the script). A hook that blocks is not proposed — Temporal's point stands (*"you don't route 'stop' through a model"*), but a blocking hook on a design-doc workflow would be worked around the first time it fired.

## 5. Contract inputs — decided

**Rejected:** one criterion per deck "yes." A yes routinely carries the next round's work (R1 `type-switch: yes` + *"collapse the other filter toggles into dropdowns"* → became R2-1; R2 `likely-safe: yes` + *"show a download icon next to 412"* → R3-1; `card-bottom: other` + *"see prior response"* — answers are not independent).

**Rejected (Destin, 2026-09-01):** the hand-written decision ledger as source of truth — AI-generated, provenance unclear.

**Decided:**

1. **Questions deck first (Destin's proposal).** Step 2 becomes a deck, not a chat: the model's questions rendered as `decide` steps with a free-text field, answers saved to `<feature>.questions.answers.json`. Primary input to the contract agent. Built on `review-cards.py`, not a new tool. *Design not done — §8 Q2.*
2. **Note tag on deck answers.** A note on any answer carries one of *fix now / fix later / just noting*. ~2 hours to add; inference is where the agent would be wrong. **This revives the rejected "yes → criterion" idea in the form that works:** a yes with no note, or a *just noting* note, is a criterion; *fix now* is next-round work; *fix later* is a ROADMAP line the contract agent files.
3. **Transcript quotes as supplement.** User messages only, this feature's sessions only, quoted verbatim with session id and timestamp. Cheap: one sampled Claude Code session had 318 `role=user` records of which 16 were typed; native transcripts have a `user-message` record type. Phrase queries (*"do not"*, *"never"*, *"the user should"*, *"we should"*) rather than a dump.

Answers files stay the record of decisions; all three arcade decks have submitted answers on disk (`step1-sizing` 07:25Z, `board-contrast`, `head-to-head`). The first draft's claim that deck 1's file was never written was wrong.

## 6. Plan tier and the reopen path

**Plan tier is conditional.** Write an implementation plan when the work crosses repos, touches a migration or protocol, or has ordering constraints. Otherwise the contract plus the approved UI *is* the plan. Evidence: the arcade shipped four games, two services and Android parity with no plan document; the marketplace wrote ~3,300 plan lines that were rewritten. Detail in `docs/active/handoffs/` if anyone needs the nine-feature table again.

**Reopen path.** When implementation disproves approved UI (arcade contrast, marketplace's dead Update `<span>`), the implementing session builds a **one-step deck** of kind `decide` stating the contradiction and the options, serves it, and waits. The answer amends the contract row's Source; nothing upstream is rewound. This is the single route back; a chat question is not.

## 7. "Pick 10 roadmap things" — scoped out

The shape already exists and was run three times: `docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md` Tasks 13/16 — an approved list, a deterministic verdict, named stop conditions, a spend budget, a ledger. Applied to the roadmap: list = a taxonomy area's items; verdict = `verify.sh` + `close-out.sh`; ledger = the ROADMAP entry. It depends on the taxonomy draft landing and on this plan's contract (each fix needs a done-condition). Its own plan, after this one. *§8 Q3.*

## 8. Questions for Destin

1. **Where you sit.** §1 assumes two appearances on one surface: the questions deck up front, and the review deck in rounds with the contract as its last step. Is that right, or do you want the contract as a separate sign-off?
2. **Questions-deck format.** A `decide` step per question with free text, or something closer to a form? Mock it in `review-cards.py` before deciding.
3. **Roadmap loop.** Its own plan after this one (recommended), or folded in?

## 9. Tasks

Ordered. Each has a done-condition; none needs a dev instance.

1. **Contract file format + agent prompt.** Done: `<feature>.contract.md` template in `scripts/ui-review/`; a fresh-context agent prompt that takes the three §5 inputs and writes rows with Source quotes; a dry run against the arcade's three answers files produces a contract a reader recognises as the arcade.
2. **Note tag on deck answers.** Done: `review-cards.py` writes `"note_kind": "now" | "later" | "noting"` when a note is present; a test pins it.
3. **Questions deck.** Done: a `questions` spec type in `review-cards.py`; answers file; used once on a real feature. Blocked on Q2.
4. **Close-out `Contract` section.** Done: `close-out.sh <branch>` prints each contract row with its checked-by and, for `mechanical`, whether the named guard exists; TODO for `human` rows.
5. **Reopen deck.** Done: a documented one-step `decide` spec shape and one sentence in `.claude/rules/` that names it as the only route back. Verify the rule's glob fires in a worktree (`~/.claude/instructions-loaded.log`).
6. **Run it once end to end** on the next small feature; record what was skipped, in the handoff.

## 10. Sources (pointers only)

- Anthropic, *harness-design-long-running-apps* (2026-03-24): contract negotiation before code, generator/evaluator split, evaluator calibration; solo agent $9 / 20 min shipped broken vs harness $200 / 6 hr worked. Anthropic's human is *not* in the negotiation; Destin's is — deliberate.
- Anthropic, *building-c-compiler*, *building-agents-with-the-claude-agent-sdk* (verification ladder: rules/linters > visual > LLM-as-judge), *multi-agent-research-system* (fails where agents share context — most coding tasks).
- Temporal (Warrick, 2026-08-06): gates belong in orchestration code, not model judgment. LangChain HITL: `reject` ≠ `respond`. OpenAI agent guide: per-tool risk as the origin of gates.
- In repo: `docs/active/investigations/2026-08-31-session-retrospective-workspace-friction.md` (Themes A–D; A, C, D shipped in PR #3); `docs/archive/specs/2026-08-31-live-review-panes-design.md`; `docs/active/specs/2026-08-31-roadmap-area-taxonomy-draft.md`; `docs/audits/2026-08-31-retrieval-repair.md`.
- Distilled positions: `knowledge/engineering/agent-architecture.md`, `knowledge/engineering/tool-design.md` in the Frontier-AI-Lab-Assistant workspace (ADR-013).
