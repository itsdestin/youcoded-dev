---
status: draft
created: 2026-08-31
topic: Nine workspace-friction findings observed while reviewing, fixing, merging and closing out the games arcade
scope: Observations and options only — nothing here has been implemented, and no decision has been taken
---

# Workspace friction observed during one PR-review session

## What this is

A record of what got in the way during a single end-to-end session on 2026-08-31:
reviewing `wecoded-marketplace#78` and `youcoded#369`, fixing three bugs, merging
both, and closing out the docs.

It is an observation log, not a plan. Each finding states what was seen, the
evidence, and the options that appear open. Costs are estimates. No option here
has been chosen, and several may not be worth acting on.

## What the session did, for context

Read both PR diffs; verified negative claims programmatically; wrote throwaway
tests to reproduce two bugs before fixing them; ran `verify.sh --full` twice,
Android Gradle tests, and the worker suite; spent roughly an hour on CI
archaeology; then swept the docs for claims the merge had invalidated.

Three bugs were found and fixed (two in the feature, one in the branch's own test
guard). Both PRs merged. Six documents carried stale claims afterwards and were
corrected.

---

## F1 — Path-scoped rules do not match worktree paths

**Observed.** 20 of the 25 path-scoped rules anchor their globs at
`youcoded/desktop/...`. `CLAUDE.md` directs non-trivial work into
`worktrees/<name>/`, so the files actually edited sit at
`worktrees/games-arcade/desktop/...`. No rule's path list contains `worktrees`.

**Evidence.**

```
rg -l "^paths:" .claude/rules/*.md | wc -l                    → 25
rg -l '^\s*- "youcoded/desktop' .claude/rules/*.md | wc -l    → 20
rg -l '^\s*- ".*worktrees' .claude/rules/*.md | wc -l         → 0
fnmatch('worktrees/games-arcade/desktop/tests/game-reducer.test.ts',
        'youcoded/desktop/tests/**/*.test.ts')                → False
```

**What it looked like in practice.** Four test files were edited in the worktree
during this session. `.claude/rules/test-suite-hygiene.md` was not seen at any
point. Its section *"Before calling a failure a flake"* prescribes running the
test in isolation **and** in a pristine `origin/master` worktree. That is
approximately the experiment eventually run about an hour later, arrived at
independently rather than from the rule.

**Uncertainty worth noting.** The exact matching implementation was not read.
Standard glob semantics cannot match these paths, but whether the harness applies
suffix matching or some normalisation was not established. Worth confirming
before treating the number as settled.

**Options.**

- Add a worktree alternate to each rule's `paths` (e.g. a second glob per entry).
  Mechanical; touches 20 files; `scripts/audit-anchors.mjs` would confirm nothing
  breaks.
- Normalise the path a rule is matched against before matching, so one pattern
  covers both locations. Fewer edits, but changes harness-adjacent behaviour.
- Leave as-is and rely on `docs/MAP.md` plus explicit rule reads.

---

## F2 — "Confirm the guard fails without the fix" is not written down anywhere

**Observed.** Each of the three guards added this session was checked by
reverting the fix (`git stash push -- <file>`), re-running, confirming red, then
restoring. This caught a first-draft regression test that was a tautology: it
reproduced the *fixed* effect structure rather than exercising the real
component, and passed identically with and without the fix.

**Evidence.** With the fix stashed: pane-width guard 3 failed / 3 total;
reducer guard 3 failed; source-text guard 2 failed. The tautological version
passed 3/3 in both states.

**Current state.** A search of `CLAUDE.md`, `docs/PITFALLS.md` and
`.claude/rules/` did not surface this practice. The knowledge ladder in
`CLAUDE.md` ranks a pinning test as the top tier but does not describe verifying
that the pin can fail.

**Options.**

- One line in the `CLAUDE.md` knowledge ladder.
- An entry in `.claude/rules/test-suite-hygiene.md`, subject to F1.
- A helper (e.g. `scripts/prove-red.sh <test> <source…>`) that stashes, runs,
  restores, and reports both states.
- No change; treat it as tacit practice.

---

## F3 — No workspace-specific close-out sequence exists

**Observed.** Closing out required: merge, confirm the commit reached master,
delete branch remote and local, remove the worktree, archive lifecycle docs,
repoint cross-links inside the archived docs, flip `status:` frontmatter, flip
the ROADMAP item, add a `docs/MAP.md` row, and sweep other docs for claims the
merge invalidated. Several of these were nearly missed and were recovered only
by re-reading `CLAUDE.md` mid-task.

**Current state.** `superpowers:finishing-a-development-branch` exists but is
generic. It does not encode workspace specifics: that `wecoded-marketplace`
auto-deploys on merge to master, that lifecycle docs move `docs/active/` →
`docs/archive/`, or that the ROADMAP item and MAP row are part of "done".

**Options.**

- A workspace skill covering the sequence.
- A checklist section in `CLAUDE.md` under the existing lifecycle paragraph.
- A script that performs the mechanical parts and prints the judgement-dependent
  ones.

---

## F4 — CI triage has no entry point, and the control-run technique is unrecorded

**Observed.** A red macOS leg took roughly an hour to characterise. The sequence
used: read the failing job, identify the test, check whether the PR touched that
subsystem, re-run the failed job, then dispatch the workflow against untouched
`master` as a control.

The control run produced the most decisive evidence of the session: Desktop CI on
master at `2af35eff` passed on all three platforms (run 33391871531) while the
**same commit** had failed two hours earlier (run 33380550181).

**Evidence.**

```
gh workflow run desktop-ci.yml --ref master
gh run list --workflow "Desktop CI" --limit 12 --json headSha,conclusion
  → 2af35eff appears twice: once success, once failure
```

**Current state.** The relevant guidance exists in
`.claude/rules/test-suite-hygiene.md` but is scoped to test-file paths, so it
does not surface while triaging a red CI leg on a PR. The
`gh workflow run --ref master` control technique is not documented.

**Related.** ROADMAP `:619` has tracked this specific macOS failure since
2026-07-22 across at least four sessions. That entry already contained the
diagnosis; it was not found early because the initial search used the symptom
word rather than the test filename (see F5).

**Options.**

- Extend `test-suite-hygiene.md` to cover CI triage, subject to F1.
- A short `docs/ci-triage.md` with the control-run recipe.
- A `/triage-ci <run-id>` skill.
- Record the control-run command only, as a one-liner wherever CI is discussed.

---

## F5 — ROADMAP dedup is an instruction without a search step

**Observed.** A new ROADMAP entry was filed for the macOS failure. It duplicated
the existing `:619` entry, and the fix it proposed ("make the assertions wait")
is the one `:622` explicitly records as already applied and ineffective. The
entry was removed and today's evidence appended to `:619` instead.

**Cause, as far as it could be determined.** The initial search used the symptom
(`flaky`, `macOS flake`). The existing entry is findable by the test filename
(`sync-spaces-engine`), which was not searched until later.

**Current state.** `CLAUDE.md` says ROADMAP capture should "dedup first" but does
not say what to search on. `ROADMAP.md` is large enough that the wrong query
returns nothing useful.

**Options.**

- Amend the instruction to specify searching by file, symbol or test name rather
  than by symptom.
- A `scripts/roadmap-find.sh <terms>` helper printing matching entries with line
  numbers.
- No change.

---

## F6 — A tightened invariant can hollow out existing tests silently

**Observed.** Adding the `MATCH_RECORDED` guard changed the reducer so a record
is only stored for the match on screen. Three existing tests in
`match-report.test.ts` dispatched that action against a lobby state. One asserted
the record *was* stored and failed loudly. The other two asserted it was cleared —
and would have continued passing while no longer testing anything, because the
record was never stored in the first place. All three were repointed at a real
in-progress match.

**Note on how it was caught.** The loud failure led to the other two. Had the
first test not existed, nothing would have gone red.

**Options.**

- Add a step to the verification habit: after tightening an invariant, re-read
  the tests that exercise it and confirm each still reaches its assertion.
- Explore whether coverage or mutation tooling could surface this class.
- Accept it as inherent.

---

## F7 — `docs/MAP.md` had no games entry at all

**Observed.** Before this session, `docs/MAP.md` contained no subsystem row and
no hot path for games — searching it for `game` or `arcade` returned nothing.
`CLAUDE.md` directs every non-trivial task to start at MAP. The subsystem spans
15+ renderer files, a main-process handler across five surfaces, three Worker
modules, a D1 migration and nine guard suites.

**Action already taken this session.** One subsystem row and five hot paths were
added, with every path verified against `origin/master` first.
`scripts/audit-anchors.mjs` went from 334/336 to 340/340 (the two misses were
brace-expansion shorthand the auditor cannot resolve, since written out).

**Residual question.** Games is unlikely to be the only subsystem absent. Nothing
currently detects a MAP omission — the auditor validates that listed paths exist,
not that shipped subsystems are listed.

**Options.**

- Add "MAP row added or refreshed" to the definition of done for a feature.
- A heuristic check flagging source directories with no MAP mention.
- Audit MAP for other gaps as a one-off.

---

## F8 — Stale "unmerged" status claims are mechanically detectable

**Observed.** After the merge, six live documents still asserted the arcade was
unmerged or unpushed, including `youcoded-feature-fact-sheet.md` ("NOT merged to
master… anything shipping today is Connect Four alone") and
`docs/active/handoffs/2026-08-31-open-work-inventory.md` ("NEVER PUSHED"). Two
handoffs named branches deleted during this session, and three ROADMAP commands
cited a deleted branch, so re-running them would error rather than answer.

One knock-on effect: a landing-page doc listed a demo clip as blocked pending the
merge, which would have caused a later session to skip work that was by then
unblocked.

**Observation.** Every one of these named a branch. Branch existence is
checkable: `git ls-remote --heads origin <name>`.

**Options.**

- Extend the session-start hook to cross-reference branch names appearing in
  `docs/active/**` against live branches and print any that no longer exist.
- Add it to `scripts/audit-anchors.mjs` as a new anchor class.
- Handle it as part of a close-out sequence (F3) rather than detection.

---

## F9 — Minor friction items

- **Waiting on CI.** Several attempts to poll a run were awkward; one chained
  `sleep` was blocked by a harness guard. A `scripts/ci-wait.sh <run-id>` helper
  would cover it.
- **Working directory drift.** Several commands failed because the session cwd
  had moved after a backgrounded command; absolute paths avoided it.
- **Unverified: rules loading when not obviously applicable.**
  `harness-tools.md` and `native-permissions.md` (~1,400 words combined) were
  present in context at session start, before any file was touched, and were not
  relevant to this session. Both are correctly path-scoped, so the mechanism was
  not explained. Recorded only as something to check — no conclusion drawn. If
  examined, it pairs naturally with F1, since the two describe opposite halves of
  the same question (rules appearing when not expected, and not appearing when
  expected).

---

## Cross-cutting observation

F1, F4 and F5 all describe the same shape: **the workspace already contained the
right answer, and it was not reached in time.** `test-suite-hygiene.md` had the
flake procedure; ROADMAP `:619` had the diagnosis and an explicit warning against
the fix that was drafted. Neither surfaced when relevant.

That suggests the gap in these three cases is retrieval rather than content —
worth weighing before adding new documents, since more prose that does not
surface at the right moment would not address it.

## Status of the findings themselves

- F1, F2, F5, F7, F8 — measured this session; commands and outputs are quoted
  above and are re-runnable.
- F3, F4, F6 — descriptions of what the session did; no measurement beyond the
  narrative.
- F9's third item — unverified; explicitly flagged as such.

Nothing in this document has been implemented, and no option above has been
selected.
