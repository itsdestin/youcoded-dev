---
status: draft
created: 2026-08-31
revised: 2026-08-31 (fact-checked; four claims corrected, nine findings collapsed to four themes)
topic: Workspace friction observed while reviewing, fixing, merging and closing out the games arcade
scope: Observations, corrected and ranked. The plan built from this is docs/active/plans/2026-08-31-workspace-retrieval-repair.md
sample: n=1 session — see "How much weight this carries"
---

# Workspace friction observed during one PR-review session

## What this is

A record of what got in the way during a single end-to-end session on 2026-08-31:
reviewing `wecoded-marketplace#78` and `youcoded#369`, fixing three bugs, merging
both, and closing out the docs.

Every finding below was re-verified against the code on 2026-08-31 after the
first draft. **Four of the original nine claims were wrong** and are corrected
in place, with the correction called out. Findings are grouped into four themes
and ranked; the original nine are cross-referenced so earlier notes stay findable.

## How much weight this carries

**n = 1 session.** The two prior retrospectives in this folder sampled 46 and 55
sessions and could weight a finding by how often it bit. This one cannot. A
friction seen once should buy a one-line fix or a mechanical check, never a new
subsystem — and nothing here should outrank an item the 46-session study already
ranked.

---

## The finding that reframes the rest

**This workspace's own retrospectives are the layer that does not get
retrieved.** Two of this session's nine findings were already written down, in
this same directory, weeks earlier:

- **F2** (a new guard must be shown failing) is
  `docs/active/investigations/2026-07-28-session-retrospective-guardrails.md`
  → *"Proposal 2 — every guard must prove it is not vacuous"*, ranked #2 of 5 by
  leverage. Still `status: active`. Never implemented.
- **F1** (rules do not reach worktrees) was solved once already, for one rule,
  on 2026-08-05 — see Theme A.

Both prior retrospectives remain `status: active` with shipped and unshipped
items intermixed and nothing distinguishing them. Verified as of 2026-08-31, of
the 2026-08-28 study's nine ranked items:

| Item | State |
|---|---|
| #1 glob-guard hook + "never type grep" | shipped (`.claude/hooks/glob-guard.py`, `CLAUDE.md`) |
| #5 "branch off `origin/master`" line | shipped (`CLAUDE.md`) |
| #6 hot-paths table in MAP | shipped (`docs/MAP.md`, 39 rows) |
| #3 delete the Serena paragraph (0 uses / 46 sessions) | **not done — the paragraph has since grown** |
| #4 `/review-doc` command | **not done — `.claude/commands/` holds only `audit.md`** |
| #8 worktree-location rule | **not done — the workspace root still holds `beta/`, `flappy-bird/`, `youcoded.wt/`, `wecoded-marketplace.wt/`** |
| #2, #7, #9 | not re-checked |

So the honest framing of this session's own conclusion is not "the workspace
contained the right answer and it was not reached." It is: **the answers are
written down, in ranked lists, and the lists themselves are what nobody
re-opens.** Adding a tenth document is the one response guaranteed not to work.

---

## Theme A — Path-scoped rules cannot match worktree paths

*(was F1; F9's third item is the mirror image)*

**Observed.** `CLAUDE.md` directs all non-trivial work into `worktrees/<name>/`,
so the files actually edited sit at `worktrees/<name>/desktop/...`. Rule globs
are matched relative to the project root. `youcoded/desktop/**` cannot match
`worktrees/session-motion/desktop/**`. During this session four test files were
edited in a worktree and `.claude/rules/test-suite-hygiene.md` never appeared —
including its section *"Before calling a failure a flake"* (`:91`), which
prescribes running the test in isolation **and** in a pristine `origin/master`
worktree. That is approximately the experiment arrived at independently, about
an hour later.

**Correction to the first draft.** The draft flagged the matching semantics as
unverified. They are now confirmed: patterns match relative to the project root,
so the finding holds. The draft also cited `worktrees/games-arcade/...` as its
example — that worktree no longer exists, since the branch was deleted at
merge. Use a live one.

**Correction to the first draft (second).** The draft listed three options and
missed the one already in the repo. **`.claude/rules/code-search.md` solved
this on 2026-08-05** by writing its paths as `**/desktop/src/main/ipc-handlers.ts`
— the leading `**/` matches the file under `youcoded/` and under any worktree.
It is the only rule that does this, and the only rule whose prose mentions
worktrees at all. This is a half-finished migration, not an open design question.

**Measured 2026-08-31.**

```
ls .claude/rules/*.md | wc -l                            → 26
rg -l "^paths:" .claude/rules/*.md | wc -l               → 25   (README.md is the schema doc)
rg -l '^\s*- "youcoded/desktop' .claude/rules/*.md | wc -l → 20
```

134 glob entries in total:

| Prefix | Entries | Reaches a worktree? |
|---|---|---|
| `**/...` (all in `code-search.md`) | 14 | yes |
| `**` (`live-app-safety.md`, deliberately eager) | 1 | yes |
| `youcoded/desktop/...` | 100 | no |
| `youcoded/app/...` | 6 | no |
| `youcoded/docs/...` | 4 | no |
| `wecoded-marketplace/...` | 5 | no |
| everything else | 4 | no |

**The prefix swap is safe.** Across all 4,363 tracked files in the workspace and
its five sub-repos, every path containing a `desktop/` segment (1,566) is under
`youcoded/desktop/`, and every path containing a `worker/` segment (101) is
under `wecoded-marketplace/worker/`. So `**/desktop/**` and `**/worker/**`
over-match nothing. `docs/` is the exception — 1,332 tracked paths sit under the
workspace's own `docs/`, so the four `youcoded/docs/**` globs must not be
relaxed.

**The mirror image (was F9c), now reproducible.** `harness-tools.md` and
`native-permissions.md` (~1,400 words combined) were present in context at turn
zero of this session, before any file was touched, and were irrelevant to it.
They did the same at turn zero of the 2026-08-31 follow-up session. Two
independent sightings, cause unexplained. Net effect of the two halves together:
rule injection is currently unreliable in both directions — silent when it should
fire, and firing when it should be silent.

**Recommendation.** Relax the 100 `youcoded/desktop/` and 5
`wecoded-marketplace/` globs to the `**/` form `code-search.md` already uses;
leave `youcoded/docs/**` alone with a note saying why; add a check to
`scripts/audit-anchors.mjs` that fails when a rule glob stops matching its own
file under a `worktrees/<name>/` prefix. Rejected: adding a second
`worktrees/*/…` twin per glob (112 new lines, misses root-level worktrees, and
the auditor's "every glob matches ≥1 tracked file" check would fail on globs
pointing at untracked worktree paths).

---

## Theme B — Green tests that test nothing

*(was F2 and F6; identical to the 2026-07-28 Proposal 2)*

**Observed.** Each of the three guards added this session was checked by
reverting the fix (`git stash push -- <file>`), re-running, confirming red, then
restoring. This caught a first-draft regression test that was a tautology: it
reproduced the *fixed* effect structure rather than exercising the real
component, and passed identically with and without the fix. With the fix
stashed: pane-width guard 3 failed / 3 total; reducer guard 3 failed;
source-text guard 2 failed. The tautological version passed 3/3 in both states.

Separately, tightening the reducer's `MATCH_RECORDED` invariant hollowed out two
existing tests in `match-report.test.ts`: they asserted a record was *cleared*,
and after the change the record was never stored in the first place, so they
would have kept passing while testing nothing. They were only found because a
third test in the same file asserted the opposite and failed loudly.

**Confirmed gap.** A search of `CLAUDE.md`, `docs/PITFALLS.md` and all 26 rule
files for any red-before-green phrasing returns zero hits. `CLAUDE.md` ranks a
pinning test as the top tier of the knowledge ladder and says nothing about
verifying the pin can fail. `test-suite-hygiene.md` has eight sections and none
of them is this — and three of its eight carry `Guard: none — candidate`.

**This is the third sighting of one pattern**, and the 2026-07-28 proposal for it
has been sitting unimplemented for a month. That history is the argument against
fixing it with another paragraph.

**Recommendation.** Deferred — not selected for the first plan. If taken up, it
should be a command (`scripts/prove-red.sh <test> <source…>` — stash, run,
restore, report both states), not prose, precisely because the prose version was
already written once and ignored.

---

## Theme C — The answer existed and was not retrieved

*(was F4, F5, F8, plus the retrospective backlog above)*

### C1. CI triage — the advice existed; the doc holding it is the least-read one

A red macOS leg took roughly an hour to characterise. The decisive move was
dispatching Desktop CI against untouched `master` as a control: `2af35eff`
passed on all three platforms (run 33391871531) while the **same commit** had
failed two hours earlier (run 33380550181). One commit, two runs, opposite
results.

**Correction to the first draft.** The draft said this technique "is not
documented." It is. `docs/PITFALLS.md:30`, added 2026-08-27 — four days before
this session — reads: *"Check the macOS job specifically — compare against
master's own run before assuming a failure is yours (master here fails Windows
permanently and macOS intermittently)."* The exact `gh workflow run --ref master`
invocation is not written down; the principle is. The 2026-08-28 study measured
`PITFALLS.md` as consulted in 9 of 46 sessions — the lowest of any tracked doc.
That, not a documentation gap, is the cause.

### C2. ROADMAP dedup failed on entry size, not on a missing instruction

A new ROADMAP entry was filed for the macOS failure. It duplicated the existing
one and proposed a fix that entry explicitly records as already applied and
ineffective. It was removed and today's evidence appended instead.

**Corrections to the first draft.** The line numbers were off and the quotation
was wrong. The entry header is `ROADMAP.md:615`, not `:619`. The
already-applied-and-ineffective note is at `:618`, not `:622`, and it concerns
the **timeout knobs** (`WAIT_MS = 60_000`, `testTimeout: 120_000`), not "make
the assertions wait"; `:622` is a separate partial walk-back.

**Cause.** The draft blamed a missing search step. The measurable cause is size:
`ROADMAP.md` is 99,825 words across 407 entries, and entry `:615` alone runs ten
dense paragraphs. Symptom-searching fails because entries are essays. Searching
by test filename (`sync-spaces-engine`) works; searching by symptom (`flaky`)
does not.

### C3. Stale "unmerged" claims are mechanically detectable

After the merge, six live documents still asserted the arcade was unmerged,
including `youcoded-feature-fact-sheet.md` ("NOT merged to master… anything
shipping today is Connect Four alone") and
`docs/active/handoffs/2026-08-31-open-work-inventory.md` ("NEVER PUSHED"). Two
handoffs named branches deleted during this session, and three ROADMAP commands
cited a deleted branch, so re-running them errors rather than answers. One
knock-on: a landing-page doc listed a demo clip as blocked pending the merge,
which would have caused a later session to skip work that was by then unblocked.

Every one of these named a branch, and branch existence is checkable:
`git ls-remote --heads origin <name>`.

### C4. The mechanical audit is red, and has been left red

`node scripts/audit-anchors.mjs` today:

```
anchors: 366/366 ok · MAP paths: 340/340 ok · eager ≈6738 tokens (limit 10000)
FAIL budget violations:
  .claude/rules/artifacts.md      769 words (limit 600)
  .claude/rules/chat-reducer.md   734 words (limit 600)
  .claude/rules/sync-spaces.md    651 words (limit 600)
  docs/PITFALLS.md               3118 words (limit 2500)
MECHANICAL PASS: FAILURES — every failure above is confirmed drift; fix now.
```

A check that says "fix now" and is not fixed teaches sessions to skip it — the
same failure the 2026-08-28 study recorded for `verify.sh` ("cries wolf — 8
sessions chased its baseline failures"). It is also the reason C1 happened:
`PITFALLS.md` is 25% over the budget that exists to keep it readable, and it is
the least-read doc in the workspace.

### C5. Sub-repo rules are entirely unaudited

`scripts/audit-anchors.mjs` reads only `<workspace>/.claude/rules/`. The one
rule living in a sub-repo — `youcoded/.claude/rules/android-runtime.md`,
`last_verified: 2026-04-29` — has never had its anchors or its `paths:` glob
checked by anything.

**Recommendation for Theme C.** Nothing here is fixed by writing. Get the audit
green, cut the noise so its signals are readable, extend it to sub-repo rules
and to dead branch names in `docs/active/**`, and close out the two stalled
retrospectives by marking every item shipped or dropped and archiving them.

---

## Theme D — "Done" has no checklist

*(was F3 and F7)*

**Observed.** Closing out required: merge, confirm the commit reached master,
delete the branch remote and local, remove the worktree, archive lifecycle docs,
repoint cross-links inside the archived docs, flip `status:` frontmatter, flip
the ROADMAP item, add a `docs/MAP.md` row, and sweep other docs for claims the
merge invalidated. Several were nearly missed and recovered only by re-reading
`CLAUDE.md` mid-task.

`superpowers:finishing-a-development-branch` exists but is generic — it verifies
the suite, detects worktree vs. repo, and offers merge/PR/keep/discard. It
encodes none of the workspace specifics: that `wecoded-marketplace` auto-deploys
its Worker on merge to master, that lifecycle docs move `docs/active/` →
`docs/archive/`, or that the ROADMAP item and the MAP row are part of "done".

**MAP had no games entry at all.** Before this session `docs/MAP.md` contained no
subsystem row and no hot path for games, while `CLAUDE.md` directs every
non-trivial task to start there. The subsystem spans 15 source files across
three repos, a five-surface IPC handler, a D1 migration and 12 guard suites. One
subsystem row and six hot paths were added this session, every path verified
against `origin/master` first.

**Correction to the first draft.** The draft reported the auditor going "334/336
→ 340/340" and asked whether anything detects a MAP omission. Two errors. The
tool prints two independent counters (`anchors: 366/366`, `MAP paths: 340/340`),
which the draft merged into one. And a detector does exist and already runs: the
same command prints `changed code files matching NO rule (607, first 20)`. It is
useless as written because it diffs against a 2026-07-15 baseline and does not
exclude archives, prototypes or fixtures — 607 is a number nobody reads. The
auditor still never checks that a shipped subsystem *has* a MAP row, only that
the rows it has point at real files.

**Recommendation.** One `scripts/close-out.sh <branch>` that runs the mechanical
checks and prints the judgement calls, plus moving the two recurring checks
(dead branch names in `docs/active/**`; the worktree-glob check from Theme A)
into `audit-anchors.mjs`, where CI already runs them daily.

---

## Minor items, unchanged

- **Waiting on CI.** Several attempts to poll a run were awkward; one chained
  `sleep` was blocked by a harness guard. A `scripts/ci-wait.sh <run-id>` would
  cover it. Not in `scripts/` today.
- **Working directory drift.** Several commands failed because the session cwd
  had moved after a backgrounded command; absolute paths avoided it.

---

## Ranked

Frequency is how many sessions the friction is *known* to have affected — this
one unless a prior study measured it. "Words" is the effect on always-loaded
context.

| # | Theme | Frequency | Words | Prior art | Cost |
|---|---|---|---|---|---|
| 1 | **A** — rules reach worktrees | every worktree session (all non-trivial work, by `CLAUDE.md`) | 0 | `code-search.md`, 2026-08-05 — solved for 1 of 21 rules | ~1h, mechanical + one guard |
| 2 | **C4/C5** — audit green, sub-repo rules covered | every session that runs `/audit` | **−700** | none | ~2h |
| 3 | **D** — close-out script + the two recurring checks | every merge | +2 | 2026-08-28 #8 (unshipped) | ~3h |
| 4 | **C1/C2/C3** — unbury signals, close the stalled retros | 9/46 sessions read PITFALLS (measured) | −400 | 2026-07-28 and 2026-08-28, both stalled | ~2h |
| 5 | **B** — guards must prove they can fail | 3 sightings / 2 retros | +40 | 2026-07-28 Proposal 2 — **written, ranked #2, never built** | ~1h |

Themes A, C and D are carried into
`docs/active/plans/2026-08-31-workspace-retrieval-repair.md`. Theme B is
deferred, deliberately: it is the third restatement of an unimplemented
proposal, and restating it a fourth time is the failure mode this document is
about.

## Confidence

- Theme A, C4, C5, D — measured 2026-08-31; every command above is re-runnable
  as written.
- C1, C2, C3 — measured, with the four corrections applied.
- Theme B — the gap is measured (zero hits); the frequency is narrative.
- The mirror-image item in Theme A — reproducible, cause unexplained.
