---
status: draft
created: 2026-09-01
revised: 2026-09-01 — review pass 2, measured against origin/master bc6884b. Live panes shipped (youcoded-dev #4, closed out in #5) and embed the workbench, not the running app; contract sign-off moved onto the deck; transcript mining dropped; plan tier moved to §8; glob numbers taken from the audit report; §11 added (proposals, not decisions). Questions-deck format decided by Destin (1–3 written options + Other, note beside any answer) — it is the existing `decide` step without a picture
type: plan
topic: Idea → mergeable PR. The UI deck is the one review surface; a contract, built from Destin's own deck answers, is what "done" means.
source: Frontier-AI-Lab-Assistant session 2026-08-31/09-01 (research pass + 3 review agents + code reads); review passes 2026-09-01
measured_at:
  youcoded-dev: bc6884b (origin/master — measure against origin only; the local checkout was 23 commits behind at review time and this file's local copy was itself stale)
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

**Where Destin sits (assumption — see §8 Q1).** Three times, on one surface. Step 2 is a *questions deck* answered before anything is drawn — each question a `decide` step with one to three written options plus Other, a note allowed beside any pick, the note *being* the answer under Other (Destin, 2026-09-01; §5). Steps 4–6 are the *review deck*, in rounds until approve; the last step of the last round is the contract, for sign-off. Step 9 ends with an *acceptance deck*: the contract rows, graded, with the `human` rows for him to tick. Steps 7–8 run without him. "One human review point" means one surface, not one moment. Nothing he must do happens in a terminal.

## 2. State of the pipeline

Three states, because "the tool exists" and "the step happens" are different facts: the deck was *built* on 2026-08-27 and *skipped* on 2026-08-31 (§4).

| Step | Exists | Used | Enforced | Mechanism |
|---|---|---|---|---|
| 2 questions | partial | yes | no | `superpowers:brainstorming` — generic, not YouCoded-aware; answers live only in chat |
| 3 draft UI loop | yes | yes | no | Workbench (`run-workbench.sh`), `ui-mockup` skill, `compare/registry.tsx` candidate sets, `MOCK_ONLY` |
| 4–5 deck + rounds | yes | usually | **no** | `review-cards.py` (approve/choice/decide/clip/**live**) → `<spec>.answers.json`; marketplace ran 3 rounds in 48 min; live panes shipped 2026-09-01 (youcoded-dev #4) |
| 6 contract | **no** | — | — | this plan, §3 |
| 7 plan + review | partial | yes | no | `writing-plans`; ad-hoc reviews in `docs/active/reviews/`; roadmap taxonomy draft (258 open items) |
| 8 implement + verify | yes | yes | yes | `verify.sh` — one exit code (tsc, affected tests + source-scanning guards, knip, eslint, ast-grep) |
| 9 close out | yes | new | advisory | `scripts/close-out.sh <branch>` — read-only, always exits 0 |

**Prerequisites that already landed (youcoded-dev #3 and #4, 2026-09-01):** rule globs rewritten to the `**/` form so they fire inside worktrees (the audit report counts 115 of 138 relaxed; on origin/master today 115 of the 120 `paths:` entries start with `**/`, the rest being workspace-root paths that never needed it); an `InstructionsLoaded` hook that logs every rule load to `~/.claude/instructions-loaded.log`; the mechanical audit green (`anchors 388/388`, `docs/audits/2026-08-31-retrieval-repair.md`); `close-out.sh`; live review panes.

**Still open from that work:** the local `youcoded-dev` checkout cannot `git pull` while `CLAUDE.md`, `ROADMAP.md`, `.claude/rules/ipc-bridge.md` and `.claude/rules/landing-page.md` carry uncommitted edits from other sessions. Three 2026-08-31 documents are still untracked: the retrieval-repair plan, the roadmap taxonomy draft, and `docs/active/reviews/`.

**Conclusion unchanged:** this is a pipeline to connect, plus one missing piece (the contract) and one gate to make real (the deck).

## 3. The contract

This is the piece §1 step 6 names and nothing defines. Definition first; the inputs question (§5) only makes sense against it.

**What it is.** One markdown file beside the deck: `docs/active/design/<date>-<feature>/<feature>.contract.md`. Frontmatter lists the answers files it was built from. One row per criterion:

| Field | Meaning |
|---|---|
| Statement | one sentence, in the user's experience ("a second player's board is tellable from mine at a glance") |
| Checked by | `mechanical` (a test or `verify.sh` guard, named) · `deck` (an answered step, named) · `live-app` (needs the real app running) · `human` (Destin, on the acceptance deck) |
| Threshold | pass/fail; a number where one applies (the criterion fails the feature if it fails — Anthropic's "any one below it, the sprint failed") |
| Source | `<deck>#<step>` — the answered step it came from, plus the note text if any. Must resolve to a real answered step; nothing else is a source |

**Who reads it.** The implementing session, at start, as the definition of done. Whoever grades it at the end (the implementing session today; a separate evaluator under §11 P3), producing the acceptance deck. `close-out.sh`, which reports it (§4). Adversarial plan reviewers (§1 step 7), as the thing the plan must satisfy.

**Who writes it.** A fresh subagent given only the answers files (questions deck and every review round, with notes and tags) **and the deck specs those answers refer to** — a `yes` is meaningless without the step it answered, and the step's headline and *What changed* card are the approved text. *Approval counts as authorship:* the mockup is AI-drawn, but Destin approved it, and it is the strongest evidence the agent has. **Not** the design spec, the implementation plan, or the drafting session's reasoning.

**Why a separate agent.** Anthropic's harness-design writeup: *"tuning a standalone evaluator to be skeptical turns out to be far more tractable than making a generator critical of its own work."* Self-graded agents *"confidently praise the work — even when, to a human observer, the quality is obviously mediocre."*

**The evaluator gap the "checked by" column exposes.** Anthropic's shape is planner → generator → evaluator, where the evaluator drives the running app end-to-end. Mapped here: planner = questions deck + brainstorm; generator = implementing session; evaluator = the column. `mechanical` has `verify.sh`. `deck` has the answers file. **`live-app` has nothing.** Live panes (shipped 2026-09-01) embed the *workbench* — the real renderer over a fake backend — so they make `deck` rows interactive; they do not produce a `live-app` row. The workbench's fakes can stand in for an *answer* rather than a *source* (the arcade's "Jake is online" came from a fixture, so the workbench showed the healthy state forever while the shipped app could only say "No friends online"). `shot.mjs` can attach to a running Electron via `ATTACH_PORT`, but only as a screenshot driver; nothing wires it into a deck. Until a real-app rig exists, `live-app` rows are `human` rows on the acceptance deck. This plan does not block on it. `MOCK_ONLY` is empty and lists only channels with *no backend*; nothing marks which fakes are answers vs sources, and that marking is what a real-app rig would need first.

## 4. The gate is prose today

Zero hits for `checkpoint` in `.claude/settings.json`, `.claude/hooks/`, `scripts/audit-anchors.mjs`. Enforcement is CLAUDE.md plus unticked boxes. Observed:

- `session-motion.answers.json`: `"submitted": null`, four steps `"skip"`, dwell 38 s / 5 s / 3 s / 1 s. The plan's done-criteria said "every step answered"; nothing failed. **Cause is known:** four clip steps Destin could not judge — the re-author as live pick-one steps is a ROADMAP item. So this is one deck-format failure *and* one missing gate, not two gates.
- Deliverables-card plan, line 12: the boxes *"were never ticked"*; ten user-facing decisions *"vetoable until Task 6 starts"* — an expiry nothing watched.
- Marketplace's final plan sends a copy decision *"to the deck at Task 23"*; Task 23 (*Verify end-to-end, merge, close out*) has no deck step.

**Decision:** the gate is three facts a script can read: the contract file exists; every answers file its frontmatter names has a non-null `submitted`; the contract step itself was answered. `close-out.sh` gets a `Contract` section that reports them (advisory, like the rest of the script). "Last round" is whatever the contract names — nothing else on disk defines it. A hook that blocks is not proposed — Temporal's point stands (*"you don't route 'stop' through a model"*), but a blocking hook on a design-doc workflow would be worked around the first time it fired.

## 5. Contract inputs — decided

**Rejected:** one criterion per deck "yes." A yes routinely carries the next round's work (R1 `type-switch: yes` + *"collapse the other filter toggles into dropdowns"* → became R2-1; R2 `likely-safe: yes` + *"show a download icon next to 412"* → R3-1; `card-bottom: other` + *"see prior response"* — answers are not independent).

**Rejected (Destin, 2026-09-01):** the hand-written decision ledger as source of truth — AI-generated, provenance unclear.

**Rejected (review pass 2):** transcript quotes as a supplement. The *selection* of quotes is AI-made — the same provenance problem that sank the ledger — and phrase queries (*"never"*, *"we should"*) are noisy. If the deck answers miss something, the fix is a better question next round; Task 7 records what was missed.

**Decided:**

1. **Questions deck first (Destin's proposal; format decided 2026-09-01).** Step 2 becomes a deck, not a chat. Each question is a `decide` step: **one to three written options plus Other.** It works like every existing deck — a note may accompany a pick, and under Other the note *is* the answer. This is what `decide` already does today (options → answer `v` = the option id or `other`; the note box reads "Add a note (optional)" beside a pick and "Explain what you'd like instead…" under Other), so the deck needs no new answer mechanics. What it needs: permission to run with **no picture** (`decide` today demands a crop and a highlight) and to offer **one** option (today's minimum is two). Answers save to `<feature>.questions.answers.json`, primary input to the contract agent. Authoring rules for the model: a question with an obvious answer is not asked, it is stated as a criterion the review deck will show; a question whose answer the design guide or the code already fixes is not asked; more than three options means the question is really two questions.
2. **Note tag on deck answers.** A note on any answer carries one of *fix now / fix later / just noting*. ~2 hours to add; inference is where the agent would be wrong. **This revives the rejected "yes → criterion" idea in the form that works:** a yes with no note, or a *just noting* note, is a criterion; *fix now* is next-round work; *fix later* is a ROADMAP line the contract agent files.

Answers files stay the record of decisions; all three arcade decks have submitted answers on disk (`step1-sizing` 07:25Z, `board-contrast` 09:52Z, `head-to-head` 10:31Z).

## 6. The reopen path

When implementation disproves approved UI (arcade contrast, marketplace's dead Update `<span>`), the implementing session builds a **one-step deck** of kind `decide` stating the contradiction and the options, serves it, and waits. The answer amends the contract row's Source; nothing upstream is rewound. This is the single route back; a chat question is not. (Whether it may proceed on a marked default when nobody answers: §11 P4.)

## 7. "Pick 10 roadmap things" — scoped out

The shape already exists and was run three times: `docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md` Tasks 13/16 — an approved list, a deterministic verdict, named stop conditions, a spend budget, a ledger. Applied to the roadmap: list = a taxonomy area's items; verdict = `verify.sh` + `close-out.sh`; ledger = the ROADMAP entry. It depends on the taxonomy draft landing and on this plan's contract (each fix needs a done-condition). Its own plan, after this one. *§8 Q3.*

## 8. Questions for Destin

1. **Where you sit.** §1 now assumes three appearances on one surface: questions deck up front, the review deck in rounds with the contract as its last step, and an acceptance deck at the end. Is that right, or is the acceptance deck one appearance too many?
2. **Plan tier.** Your step 7 names a plan plus adversarial reviewers as the mechanism for a one-shot PR. The evidence cuts the other way for small work: the arcade shipped four games, two services and Android parity with no plan document; the marketplace wrote ~3,300 plan lines that were rewritten. Options: (a) always write the plan; (b) write one only when the work crosses repos, touches a migration or protocol, or has ordering constraints — otherwise the contract plus the approved UI *is* the plan, and the adversarial reviewers attack *those* instead. Recommended: (b).
3. **Roadmap loop.** Its own plan after this one (recommended), or folded in?

## 9. Tasks

Ordered. Each has a done-condition; none needs a dev instance.

1. **Contract file format + agent prompt.** Done: `<feature>.contract.md` template in `scripts/ui-review/`; a fresh-context agent prompt that takes the §5 inputs and writes rows with resolvable Sources; a dry run against the arcade's three answers files produces a contract a reader recognises as the arcade.
2. **Note tag on deck answers.** Done: `review-cards.py` writes `"note_kind": "now" | "later" | "noting"` when a note is present; a test pins it.
3. **Questions deck.** Done: a `decide`-only deck with no `images` builds and serves (extend the no-images allowance live decks already have in `deck/spec.py`; `_validate_decide` accepts no crop/highlight and a one-option list when the deck has no pictures — the two-option minimum stays for picture decks, where one option plus Other is a yes/no step in disguise); the page renders a question step with the options column full-width; a test pins one-option-plus-Other and the no-picture build; used once on a real feature. Unblocked.
4. **Contract on the deck + `contract-check`.** Done: a contract step (the rows, rendered, answered approve/other) as the last step of a review deck; `review-cards.py contract-check <contract>` verifies every Source resolves to an answered step, every `mechanical` guard exists, and every named answers file is submitted; `close-out.sh` calls it in a `Contract` section.
5. **Reopen deck.** Done: a documented one-step `decide` spec shape and one sentence in `.claude/rules/` that names it as the only route back. Verify the rule's glob fires in a worktree (`~/.claude/instructions-loaded.log`).
6. **Wire the steps into the skill that runs the flow.** Done: the `ui-mockup` skill's checklist gains the questions deck (before drawing) and the contract step (before build); without this, §4's complaint applies to this plan's own steps.
7. **Run it once end to end** on the next small feature; record what was skipped and what the answers missed, in the handoff.

## 10. Sources (pointers only)

- Anthropic, *harness-design-long-running-apps* (2026-03-24): contract negotiation before code, generator/evaluator split, evaluator calibration; solo agent $9 / 20 min shipped broken vs harness $200 / 6 hr worked. Anthropic's human is *not* in the negotiation; Destin's is — deliberate.
- Anthropic, *building-c-compiler*, *building-agents-with-the-claude-agent-sdk* (verification ladder: rules/linters > visual > LLM-as-judge), *multi-agent-research-system* (fails where agents share context — most coding tasks).
- Temporal (Warrick, 2026-08-06): gates belong in orchestration code, not model judgment. LangChain HITL: `reject` ≠ `respond`. OpenAI agent guide: per-tool risk as the origin of gates.
- In repo: `docs/active/investigations/2026-08-31-session-retrospective-workspace-friction.md` (Themes A–D; A, C, D shipped in youcoded-dev #3); `docs/archive/specs/2026-08-31-live-review-panes-design.md` (shipped, #4); `docs/active/specs/2026-08-31-roadmap-area-taxonomy-draft.md`; `docs/audits/2026-08-31-retrieval-repair.md`.
- Distilled positions: `knowledge/engineering/agent-architecture.md`, `knowledge/engineering/tool-design.md` in the Frontier-AI-Lab-Assistant workspace (ADR-013).

## 11. Proposals — not decided (review pass 2)

Each would make the flow smarter or cheaper for Destin; none is in §9 until he picks.

- **P1 — One file, one format.** Make the contract *be* the acceptance-deck spec (`<feature>.acceptance.json`): rows written at sign-off with empty verdicts, read by the implementer as done-conditions, filled by the grader, served to Destin as the last deck. Replaces the markdown table in §3 and removes a format from Task 1.
- **P2 — Questions arrive pre-answered.** Within the decided format: the model's recommended option is listed first and labelled *(recommended)* with its one-line why in the option's `summary`; a *"you pick"* option, where offered, counts toward the three and records a delegated decision the contract marks AI-decided and vetoable at acceptance. Most questions become one click.
- **P3 — Grade with a stranger.** The acceptance deck is built by a fresh evaluator agent, not the implementer: it runs `verify.sh`, re-shoots the `deck` rows from the built branch with the rig, and writes a verdict plus evidence per row. Same principle as "who writes it" in §3, applied to grading.
- **P4 — Reopen with a default.** The reopen deck names a default option; if unanswered within a set time, the session proceeds on it and the acceptance deck shows *"decided without you: X, because Y"* as a vetoable row. Makes "interventionless" literal.
- **P5 — Show the interpretation before the work.** Round N+1's first step quotes each round-N note beside the one line of what will change because of it, as a yes/no. Misreadings are caught before a round is drawn.
- **P6 — Roadmap fold-in is a check, not a hope.** The plan reviewer (or the contract agent, under §8 Q2 option b) lists every open ROADMAP item in the feature's taxonomy area and marks each folded-in or excluded-with-reason; an item in neither list fails the review.
- **P7 — Measure the flow.** Per feature, from data already on disk: rounds, Destin-seconds (answers files carry `seconds`), reopen count, rows failed at acceptance. Written to the handoff by Task 7's run. Without it there is no way to know whether the flow is getting better.
