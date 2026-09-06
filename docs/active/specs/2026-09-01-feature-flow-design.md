---
status: draft
created: 2026-09-01
type: spec
topic: Idea → mergeable PR. The review deck is the one surface Destin uses; a contract built from his own deck answers is what "done" means.
plan: docs/active/plans/2026-09-01-feature-flow-plan.md
measured_at:
  youcoded-dev: 5dacdf7 (origin/master)
  youcoded: ddac2f14
---

# Feature flow — design

Destin's target: **"here's my idea" → (autonomous plan/build/verify) → UI review deck → (autonomous feedback processing) → approve.** A second goal, "review the roadmap, pick 10 things, fix them," is scoped in §8 and is not built by this design.

Four assumptions are made here so the plan can be written; each is a one-line veto in §9.

## 1. The flow

1. "I want feature X"
2. Model churns, then asks questions to establish what we're building and how the user should experience it — **this stays at the front; you cannot draw UI without it**
3. Short loop: draft UI → visual review → update → until consistent with intent and existing theming
4. **UX tester, first run** (§8e): a context-free beta-tester agent drives the mockups, reports
   confusion and over-long copy; fixes applied — so the first deck Destin sees is already clean
5. UI deck to approve or give feedback; iterate, re-review
6. Build the verification contract — what "successful/complete" means
7. Technical design (backend, data shape, reuse) → adversarial reviewers, instrumented and capped → work breakdown → §8
8. Build: one implementer subagent per task, one reviewer per task — §8d
9. **Two reviews in parallel** (§8e): a code reviewer on the whole branch, the UX tester's
   second run on the built branch; the implementing session triages and fixes; accepted
   findings become contract rows tagged *found in review*
10. **Grader** (§7): a fresh agent writes the verdicts; acceptance deck
11. Destin's merge call; close out

(Decided with Destin 2026-09-04. Before that, step 4 did not exist, the whole-branch review was
one agent with no UX pass, and the grader was the implementing session.)

**Where Destin sits.** Four appearances, all on the review deck, none in a terminal:

| Appearance | Deck | What he does |
|---|---|---|
| Questions (step 2) | `<feature>.questions.json` — words-only `decide` steps | picks one of 1–3 written options, or Other with a note |
| Review rounds (steps 4–5) | `<feature>-r<N>.json` — the existing deck, as many rounds as it takes | yes / no / pick / other, notes tagged *fix now / fix later / just noting* |
| Contract (step 6) | `<feature>.contract.json` — one step, the rows | yes ("that is done") / no / other |
| Acceptance (step 10) | `<feature>.contract.acceptance.json` — the rows graded, plus one yes/no per `human` row; rows *found in review* are tagged so he can veto them | ticks the human rows, sees every machine verdict |
| Merge (step 11) | — | says "merge"; nothing merges without it |

A rare extra one is the reopen deck (§6). Steps 7–10 run without him — the whole build stage (§8) is agents reviewing agents, and he never opens a review session himself. "One human review point" means one surface, not one moment.

## 2. State of the pipeline

Three states, because "the tool exists" and "the step happens" are different facts: the deck was built on 2026-08-27 and skipped on 2026-08-31 (§4).

| Step | Exists | Used | Enforced | Mechanism |
|---|---|---|---|---|
| 2 questions | partial | yes | no | `superpowers:brainstorming` — generic, not YouCoded-aware; answers live only in chat |
| 3 draft UI loop | yes | yes | no | Workbench (`run-workbench.sh`), `ui-mockup` skill, `compare/registry.tsx` candidate sets, `MOCK_ONLY` |
| 4–5 deck + rounds | yes | usually | **no** | `review-cards.py` (approve/choice/decide/clip/live) → `<spec>.answers.json`; the marketplace ran 3 rounds in 48 min |
| 6 contract | **no** | — | — | §3 |
| 7 plan + review | partial | yes | no | `writing-plans`; ad-hoc reviews in `docs/active/reviews/` |
| 8 implement + verify | yes | yes | yes | `verify.sh` — one exit code (tsc, affected tests + source-scanning guards, knip, eslint, ast-grep) |
| 9 close out | yes | new | advisory | `scripts/close-out.sh <branch>` — read-only, always exits 0; `/wrap-up` for the retrospective |

**Already landed (youcoded-dev #3–#8):** rule globs in the `**/` form so rules fire inside worktrees (115 of the 120 `paths:` entries; the other five are workspace-root paths); the `InstructionsLoaded` hook logging every rule load to `~/.claude/instructions-loaded.log`; the mechanical audit green (`anchors 388/388`); `close-out.sh`; live review panes (the workbench in a deck step); the `/wrap-up` skill; `ui-probe.mjs` (a headless page probe — a screenshot driver, not the real-app rig §3 wants); the roadmap restructure design (`docs/archive/specs/2026-09-01-roadmap-restructure-design.md`), which §8 now depends on.

**One defect this design must fix first:** every `*.answers.json` is gitignored (the two `*.answers*.json` lines in `.gitignore`, directly above `*.serve.json`; added with deck v2 and never revisited). The record of Destin's decisions exists on one disk, with no history, and vanishes on a clean checkout; the arcade's hand-written ledger is committed while its three answers files are not. Everything below reads answers files, so they go into git (plan Task 0).

**Conclusion:** a pipeline to connect, one missing piece (the contract), one gate to make real (the deck), one file class to start tracking.

## 3. The contract

The piece step 6 names and nothing defines.

**What it is.** A deck spec, `docs/active/design/<date>-<feature>/<feature>.contract.json`, whose one step is of the new `contract` kind: a `rows` list, rendered as a table, answered yes / no / other. The same file is later the input to the acceptance deck (§7), so there is one format, not a markdown table plus a deck. Fields per row:

| Field | Meaning |
|---|---|
| `id` | `R1`, `R2`, … |
| `statement` | one sentence, in the user's experience ("a second player's board is tellable from mine at a glance") — the deck's banned-word rule applies |
| `checkedBy` | `mechanical` (a test or `verify.sh` guard, named in `guard` as a workspace-relative path) · `deck` (an answered step) · `live-app` (needs the real app running) · `human` (Destin, on the acceptance deck) |
| `threshold` | pass/fail, or a number where one applies. Any one row failing fails the feature |
| `source` | `<deck key>#<step id>` — the answered step it came from. Must resolve to a real, answered step in a submitted answers file; nothing else is a source |
| `note` | the note Destin wrote on that step, verbatim, if any |

The spec's top level carries `sources` (`{deck key: spec path}`) and `branch` (the feature branch, so `close-out.sh` can find the contract for a branch with one search).

**Who reads it.** The implementing session, at start, as the definition of done. The grader at the end (§7). `close-out.sh`, which reports it (§4). Adversarial plan reviewers (§1 step 7), as the thing the plan must satisfy.

**Who writes it.** A fresh subagent (`scripts/ui-review/contract-agent.md`) given only the answers files — questions deck and every review round, with notes and tags — **and the deck specs those answers refer to**: a `yes` is meaningless without the step it answered, and the step's headline and *What changed* card are the approved text. *Approval counts as authorship:* the mockup is AI-drawn, but Destin approved it, and it is the strongest evidence the agent has. **Not** the design spec, the implementation plan, or the drafting session's reasoning — a separate agent because a standalone evaluator can be tuned to be skeptical in a way a generator grading its own work cannot.

**What the `checkedBy` column exposes.** The evaluator shape is planner → generator → evaluator. Here: planner = questions deck + brainstorm; generator = implementing session; evaluator = the column. `mechanical` has `verify.sh`. `deck` has the answers file. **`live-app` has nothing.** Live panes embed the *workbench* — the real renderer over a fake backend — so they make `deck` rows interactive; they do not produce a `live-app` row. A workbench fake can stand in for an *answer* rather than a *source* (the arcade's "Jake is online" came from a fixture, so the workbench showed the healthy state forever while the shipped app could only say "No friends online"). `shot.mjs` and `ui-probe.mjs` can drive a page, but nothing wires either into a deck. Until a real-app rig exists, `live-app` rows are `human` rows on the acceptance deck. This design does not block on it. `MOCK_ONLY` is empty and lists only channels with *no backend*; nothing marks which fakes are answers versus sources, and that marking is what a real-app rig would need first.

**A named guard is not a checked criterion.** `contract-check` verifies a `mechanical` guard *exists*. A test that exists but tests something else passes. Closing that gap is the grader's job (§7) — a fresh agent since 2026-09-04, told to read the guard and fail the row when the test covers something else.

## 4. The gate

Enforcement today is CLAUDE.md plus unticked boxes: zero hits for `checkpoint` in `.claude/settings.json`, `.claude/hooks/` or `scripts/audit-anchors.mjs`. Observed:

- `session-motion.answers.json`: `"submitted": null`, four steps `"skip"`, dwell 38 s / 5 s / 3 s / 1 s. The plan's done-criteria said "every step answered"; nothing failed. Cause is known — four clip steps Destin could not judge; the re-author as live pick-one steps is a ROADMAP item. One deck-format failure *and* one missing gate.
- Deliverables-card plan, line 12: the boxes *"were never ticked"*; ten user-facing decisions *"vetoable until Task 6 starts"* — an expiry nothing watched.
- Marketplace's final plan sends a copy decision *"to the deck at Task 23"*; Task 23 (*Verify end-to-end, merge, close out*) has no deck step.

**The gate is three facts a script can read:** the contract holds (every `source` resolves to an answered step in a submitted answers file, and every `mechanical` guard exists — on disk, or committed on the contract's `branch`, since from a worktree the workspace root is the main checkout and a test the feature adds is not there until merge); the contract deck itself was answered `yes` (`<feature>.contract.answers.json`, submitted); the acceptance deck was submitted. `review-cards.py contract-check <contract>` is the one reader of all three — the first is its exit code, the other two are `ok:` / `todo:` lines — and `close-out.sh` relays them in a `Contract` section (advisory, like the rest of the script). **Re-serving a deck rotates a submitted answers file aside** (`<stem>.answers.<stamp>.json`), so the check reads the plain file if it is submitted, else the newest rotated one that is. A hook that blocks is not proposed — a blocking hook on a design-doc workflow would be worked around the first time it fired.

## 5. Contract inputs

**Rejected:** one criterion per deck "yes" (a yes routinely carries the next round's work in its note); the hand-written decision ledger (AI-generated, provenance unclear); transcript quotes (the *selection* is AI-made — the same provenance problem).

**Decided:**

1. **Questions deck first.** Step 2 is a deck, not a chat. Each question is a `decide` step with **one to three written options plus Other**, no picture. A note may accompany a pick; under Other the note *is* the answer. This is what `decide` already does; what it needs is permission to run with **no picture** and to offer **one** option (the two-option minimum stays for picture decks, where one option plus Other is a yes/no step in disguise). Answers save to `<feature>.questions.answers.json`. The recommended option is listed first with its one-line why in `summary`. Authoring rules: a question with an obvious answer is not asked, it is stated as a criterion the review deck will show; a question the design guide or the code already answers is not asked; more than three options means the question is really two questions.
2. **Note tag on deck answers.** A note carries one of *fix now / fix later / just noting* (`note_kind`: `now` | `later` | `noting`; *just noting* is preselected when a note is typed, so nothing is inferred). A yes with no note, or a *just noting* note, is a criterion; *fix now* is next-round work; *fix later* is a ROADMAP line the contract agent files.

Answers files are the record of decisions, and from Task 0 on they are committed.

## 6. The reopen path

When implementation disproves approved UI (arcade contrast, marketplace's dead Update `<span>`), the implementing session builds a **one-step words-only `decide` deck** stating the contradiction and the options, serves it, and waits. The answer amends the contract row's `source`; nothing upstream is rewound. This is the single route back; a chat question is not.

**Assumption (§9 Q2):** the reopen deck may name a `default` option. If nobody answers before `serve --timeout` expires, the session proceeds on the default and the acceptance deck carries a row *"decided without you: X, because Y"* for veto. This is what makes "interventionless" literal; without it every reopen is a hard stop.

## 7. Acceptance

**The grader is a fresh agent, not the implementing session** (`scripts/ui-review/grader.md`;
was §10 P3, adopted 2026-09-04). It runs after the §8e reviews are triaged and fixed, because
grading code that is about to change is wasted. It does one narrow job — a verdict with
evidence per graded row — and is told to read each `mechanical` guard and fail a row whose
test exists but tests something else, which closes §3's "a named guard is not a checked
criterion" gap. It hunts for nothing; hunting is §8e.

The grader writes `<feature>.contract.verdicts.json` beside the contract (every file of the flow shares the contract's stem) — `{rowId: {verdict: pass|fail, evidence}}` for every `mechanical` and `deck` row (for `deck` rows: the step re-shot from the built branch, or the live pane). `review-cards.py acceptance <contract>` merges the two into `<feature>.contract.acceptance.json`: step 1 is the contract table with verdicts beside every graded row (yes / no / other — "do you accept these verdicts"), then one words-only yes/no step per `human` and `live-app` row, buttons *Holds / Fails*. It refuses to build if any `mechanical` or `deck` row has no verdict: an ungraded row is not a pass.

## 8. Build stage — from signed contract to branch

Steps 1–6 settle the UI, because a feature cannot be judged any other way and the approved screens define what the backend must serve. Nothing in them designs the backend, divides the work, or checks the instructions the builders receive — the 2026-09-02 discussion found this section was one line ("draft a plan, reviewers attack it") contradicted by an assumption that said "skip the plan". This section is that middle. All four sub-steps run without Destin; the only route back to him is the reopen deck (§6).

**8a. Technical design.** A session reads the contract, the approved deck specs, and the existing code, and writes a short design under `docs/active/specs/`: what the backend must do, what data is stored and in what shape, what existing code is reused versus new, and whether there is a simpler organisation than the obvious one. If the approved screens imply a data layout that cannot be built as drawn, that is a reopen (§6), not a silent UI change. This is `superpowers:brainstorming` with the UI already decided — its output is the "how", never a re-litigation of the "what".

**8b. Design review — instrumented, not open-ended.** Adversarial reviewer agents attack the technical design for approach, correctness, robustness, complexity, omissions, and roadmap items to fold in. There is no data on whether this loop improves a document or just churns it (as of 2026-09-02: two review files in `docs/active/reviews/`, seventeen plans mentioning rounds, none measured), so the loop records itself:

- Each round writes `docs/active/reviews/<date>-<feature>-design-review-<n>.md`, one finding per line, with an id `R<n>-<k>`.
- The fix marks every finding `accepted`, `rejected`, or `already handled`, and a finding that reverses an earlier accepted one carries `reverses: R<m>-<j>` — the flip-flop signal.
- **Stop rule:** a round with zero accepted findings ends the loop; cap three rounds until the numbers say otherwise.
- After three features have run through, count accepted findings, reversals, and defect-versus-taste per round; the default round count is set from that, not from habit.

This is prose and a file convention, not tooling; tooling waits for the data.

**8c. Work breakdown.** The design becomes tasks. Each task is small enough for one subagent, names the contract rows it satisfies, names its own check, and states what it depends on. One review pass. **Plan tier (§9 Q3) lives here and only here:** by default a task carries a description the subagent codes from; a task carries pre-written code only when the work crosses repos, changes data already saved on users' machines, or has steps that must land in strict order. The evidence for the default: this feature's plan was 1,770 lines with pre-written code, half corrected after review and its line numbers stale the day it was written; the marketplace wrote ~3,300 plan lines that were rewritten; the arcade shipped four games, two services and Android parity from a contract-shaped ledger. The cost of the default: a vague task lets two subagents build the same thing two ways, so the breakdown review checks for vagueness, not only mistakes.

**8d. Build.** `superpowers:subagent-driven-development`, unchanged: one implementer subagent per task, parallel where tasks are independent, each given only its task, the contract rows it satisfies, and the rules for the files it touches; a reviewer subagent per task checking the diff against the task and the workspace rules; the coordinating session fixes; `verify.sh` after each task; a ledger (`.superpowers/sdd/progress.md`). Then §8e, the grader (§7), the acceptance deck, and close-out (§4).

**8e. Two reviewers, then triage.** Decided with Destin 2026-09-04, replacing the single
whole-branch review. Both are fresh subagents the implementing session dispatches; Destin
opens nothing.

- **Code reviewer** (`scripts/ui-review/code-reviewer.md`): the branch, the contract's rows, and
  the rules for the files touched — not the spec, plan, decks or transcript. Hunts bugs,
  broken promises (a `mechanical` row whose guard does not test it), dead or duplicated code,
  and things that work but should have been built differently. Every finding names file and
  line and how it was confirmed; unconfirmed ones are marked `PLAUSIBLE`.
- **UX tester** (`scripts/ui-review/ux-tester.md`, kit `scripts/ui-review/tester-kit.md`): gets
  ONLY a short briefing and the kit — no CLAUDE.md, rules, spec or plan — and drives the app
  as a beta tester with a task. Reports errors and dead ends, expected-one-thing-got-another,
  **every piece of copy that uses more words than it needs** (with the shorter wording), and
  visual inconsistencies. Runs twice: on the mockups before the first review deck (step 4),
  and on the built branch here; the files are `…-ux-review-1.md` and `…-ux-review-2.md`. Told
  when the backend is simulated, so fixtures are not bugs.
- **Triage** is the implementing session's: every finding line is marked `accepted`,
  `rejected` or `already handled` in the review file (same convention as §8b). Accepted
  findings from this pass become contract rows with `source: review:<file>#<id>`;
  `contract-check` reads the line and refuses a non-accepted source; the acceptance deck tags
  the row *found in review*. A copy proposal that changes meaning rather than length is not
  applied — it goes to Destin on the review deck.
- **Caps:** each reviewer gets a budget and stops when it is spent, writing where it stopped.
  A review is not a second build.
- **Measured like §8b:** findings, accepted, rejected, and rows failed at acceptance are all
  on disk. After three features, decide from those numbers whether each reviewer earns its
  cost and whether the first UX run cut Destin's review-deck rounds. Nothing is tooled until
  then.
- **Known gap:** the drivers (`shot.mjs`, `ui-probe.mjs`) emulate neither touch nor a 1.5×
  screen, which is how Destin actually uses the app; the kit says so and the tester must not
  claim to have tested either. Roadmap: dev-workspace.

**"Pick 10 roadmap things"** is its own plan, after this one. The shape exists and was run three times (`docs/archive/plans/2026-08-23-perf-lab-and-optimization-loop.md` Tasks 13/16: an approved list, a deterministic verdict, named stop conditions, a spend budget, a ledger). Applied to the roadmap: list = one area file from the restructure design; verdict = `verify.sh` + `close-out.sh`; ledger = the entry. It depends on the restructure landing and on this contract (each fix needs a done-condition). The restructure's per-area files also make "every open item in the feature's area was folded in or excluded with a reason" a mechanical check, which is where §10 P6 goes.

## 9. Questions for Destin — the assumptions to veto

These four are asked on the first questions deck (`docs/active/design/2026-09-01-feature-flow/feature-flow.questions.json`, plan Task 8), not in chat; the build proceeds on the assumptions and a veto is the first reopen (§6).

**Answered 2026-09-02** (`feature-flow.questions.answers.json`): all four picked as recommended — acceptance deck kept, reopen proceeds on a marked default, tasks carry descriptions by default, answers files committed. The first pass (kept as the `202609020452` rotation) had Q-2/3/4 as questions; the discussion that answered them rewrote §8.

1. **Four appearances** (questions, rounds, contract, acceptance) on one surface — or is the acceptance deck one too many? The contract can carry its human rows instead, at the cost of Destin ticking them before the work exists.
2. **Reopen with a default** (§6) — proceed on a marked default when nobody answers, or always stop?
3. **Plan tier** (§8c) — tasks carry a description by default, pre-written code only for cross-repo / stored-data / strict-ordering work? (Reworded 2026-09-02: the first wording, "skip the plan document", conflated the review loop with the document it reviews; the loop stays on every feature.)
4. **Commit answers files** (Task 0) — they hold your words verbatim. The alternative is copying them beside each contract at sign-off, which keeps the folder self-contained but leaves the rounds' history untracked.

## 10. Deferred — not built by this plan

- **P5 — Show the interpretation before the work.** Round N+1's first step quotes each round-N note beside the one line of what will change because of it, as a yes/no.
- **P6 — Roadmap fold-in as a check.** Waits for the restructure's area files (§8).
- **"You pick" option** on a question, recording a delegated decision the contract marks AI-decided and vetoable at acceptance.

The flow measures itself from data already on disk (rounds, Destin-seconds from the answers files' `seconds`, reopen count, rows failed at acceptance); the plan's last task reports those numbers for the first feature that runs through it. The design-review loop measures itself the same way (§8b) once three features have run.

## 11. Sources

- In repo: `docs/active/investigations/2026-08-31-session-retrospective-workspace-friction.md`; `docs/archive/specs/2026-08-31-live-review-panes-design.md`; `docs/archive/specs/2026-09-01-roadmap-restructure-design.md`; `docs/audits/2026-08-31-retrieval-repair.md`; `docs/archive/specs/2026-08-27-review-deck-v2-design.md` (the deck's spec format and writing rules).
- Anthropic's harness-design write-up (2026-03-24) is where the contract-before-code and generator/evaluator split come from; the quotes are not verified against the source here.
