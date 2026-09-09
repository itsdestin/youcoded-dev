---
status: draft
created: 2026-08-31
reviews: docs/active/plans/2026-08-31-workspace-retrieval-repair.md
---

# Review — Workspace Retrieval Repair plan

**Verdict.** The diagnosis is right and the shape of the fix is right. Task 1 is
the real prize and should ship. But the plan as written **cannot reach its own
stated end state**; four of its code blocks would break things that currently
work; every headline number in it is wrong; and its most important task (7) rests
on a claim the document it cites directly refutes.

Everything below was measured, not inferred; the command is given beside each
claim.

**Shortest path to a shippable plan:** reorder to 3 → 1 → 4 → 6 → 7, fix the
numbers, cut Task 5, replace Task 2, and add an `InstructionsLoaded` hook so the
central hypothesis stops being a belief.

---

## 1. Blocking: the plan makes CI permanently red, by its own design

The plan adds a new gate: any worktree-blind glob fails the whole audit run
(Task 1, Step 5 — `&& !result.worktreeGlobs.blind.length`).

The migration script then **deliberately does not fix four globs** — the
`youcoded/docs/…` ones in `landing-page.md` — and says so in its own comment
("NOT swapped, on purpose"). Those four stay blind forever.

So Step 9's expected output — `0 blind` — is unreachable, and
`node scripts/audit-anchors.mjs` exits 1 for good.

```
# the four the SWAPS table cannot reach:
landing-page.md -> youcoded/docs/index.html
landing-page.md -> youcoded/docs/media/**
landing-page.md -> youcoded/docs/site/**
landing-page.md -> youcoded/docs/gallery/**
```

**Fix:** the check needs a third bucket. A glob that is *intentionally*
repo-pinned is `exempt`, not `blind` — mark those four with an inline YAML
comment (`# repo-pinned: the workspace has its own docs/`) and have
`worktreeBlindGlobs` read it. Exempt-with-a-reason is the convention the plan
itself declares in its Global Constraints; it just doesn't apply it here.

---

## 2. Blocking: this is more urgent than the plan says — CI is already red

The plan frames Task 3 as "a check that says *fix now* and is not fixed teaches
sessions to skip it." True, but understated. The auditor **exits 1**, and CI
runs it:

```
$ node scripts/audit-anchors.mjs --no-diff >/dev/null 2>&1; echo $?
1

$ gh run list --repo itsdestin/youcoded-dev --workflow=workspace-ci.yml --limit 5
completed  failure  ...  2026-08-31T23:06:41Z
completed  failure  ...  2026-08-31T22:54:14Z
completed  failure  ...  2026-08-31T22:46:04Z
completed  failure  ...  2026-08-31T13:45:34Z  (the daily cron)
completed  failure  ...  2026-08-31T11:50:40Z
```

Every run is red, including the cron the workflow's own comment calls "the one
that matters." Nobody is reading it. That belongs in the plan's Task 3 rationale
— and it reorders the work: **Task 3 should be Task 1.** Fixing four word
budgets is a two-hour edit that turns the workspace's only automated verdict
green. Task 1 is the more valuable change, but it is also the one that risks
re-reddening a signal that has only just started being believed.

---

## 3. Blocking: the numbers are wrong, and Step 6 is a hard stop on them

Measured with the auditor's own `parseRuleFrontmatter`, so parser differences
are not the cause:

| | Plan says | Actually |
|---|---|---|
| glob entries total | 134 | **133** |
| worktree-blind | 112 | **115** |
| rule files affected | 20 | **22** |
| named exemptions | 7 | **5** |
| already `**/`-safe | (14, via source) | **13** |

The source investigation's table is also off by one across the board — it counts
`README.md`'s schema *example* glob as a live rule glob. The plan then
transcribed a different wrong number (112) that appears in neither.

**Where 112 actually comes from.** It *is* in the source investigation — as the
cost of the option that was **rejected**:

> "Rejected: adding a second `worktrees/*/…` twin per glob (**112 new lines**,
> misses root-level worktrees…)"  — `…workspace-friction.md:134`

The plan lifted a line-count out of a rejection parenthetical and re-labelled it
as the blind-glob count. It then repeats it in the WHY comment (`:171`), the
Step 6 gate (`:265`), the Step 8 expected output (`:327`) and the commit message
(`:376`).

"20 of 25 rules were silent" is a similar splice: 20 is
`rg -l '^\s*- "youcoded/desktop' .claude/rules/*.md | wc -l` — files containing a
*desktop* glob. Rules blind only via `youcoded/app/`, `wecoded-marketplace/` or
`youcoded/terminal-emulator-vendored/` aren't in it. The real figure is 22.

This matters because Step 6 says: *"If the blind count is not 112, stop and
reconcile against the source investigation's table before editing any rule."*
That gate fires immediately and stalls the task at its second step.

**Fix:** state 115/133/22/5, and drop the hard stop — the check is the
measurement; a plan-time constant that must match it is a second source of truth
that can only ever go stale.

---

## 4. Task 2's premise is wrong — it's a duplicate, not an audit gap

The plan says `youcoded/.claude/rules/android-runtime.md` is "the one rule living
in a sub-repo… it has never had its anchors or its glob checked by anything" and
"it already travels into worktrees for free, which makes it the model for a
future migration."

There are **two** android-runtime rules, and they have diverged:

```
$ diff .claude/rules/android-runtime.md youcoded/.claude/rules/android-runtime.md
```

- Workspace copy: `last_verified: 2026-07-15`, glob `youcoded/app/**`, 4 verify
  anchors, and content the sub-repo copy lacks (R8 / build-type parity, exec
  permissions, git auth via `~/.netrc`).
- Sub-repo copy: `last_verified: 2026-04-29`, glob `app/**`, **no verify block
  at all**, and content the workspace copy lacks (per-turn transcript metadata,
  terminal rendering Tier 2, the deliberate PTY-write asymmetry between bridges).

Each fork holds knowledge the other lost. Auditing the sub-repo copy would
pin a stale duplicate in place — the opposite of what the workspace's knowledge
doctrine asks for.

Also, the "travels into worktrees for free" claim doesn't hold. Claude Code
discovers `.claude/rules/` at the **project root** and recurses *within* that
directory. A session rooted at `youcoded-dev` never loads
`worktrees/<name>/.claude/rules/`. The sub-repo copy fires only for a session
rooted inside `youcoded/` — which is exactly why it drifted unnoticed since
April.

**Fix:** replace Task 2 with a reconciliation: merge the sub-repo copy's unique
content into the workspace rule, delete the fork, and add the auditor check that
**fails on any `.claude/rules/` directory found below the workspace root** — so
a second fork can't reappear silently. That is a smaller change than the plan's
`collectRules` refactor and closes the hole permanently instead of monitoring it.

---

## 5. Four code defects in the plan's own snippets

**(a) `collectRules` crashes on any rule with no frontmatter.**
`parseRuleFrontmatter` returns **`null`**, not an object with empty `paths`
(`scripts/audit-anchors.mjs:46`). Task 2 Step 3 does `fm.paths = fm.paths.map(…)`
on it. The paragraph that follows compounds it — it reasons that "an unparsed
file yields zero paths, which the budget code reads as eager." It doesn't; it
returns null and the process throws.

**(b) Task 2 Step 4 deletes every `result.anchors.total++`.**
Compare with the existing loop at `scripts/audit-anchors.mjs:363-392`. The
replacement never increments the total, so the summary line becomes
`anchors: 0/0 ok` while failures pile up underneath — the exact "green while
broken" shape the plan is written against.

**(c) Task 2 Step 4 regresses a deliberate fail-loud behavior.**
The current loop `continue`s when `fm.errors.length` is non-empty, with the
comment *"don't trust the partial parse (no paths would misclassify the rule as
eager)."* The replacement drops that skip, so an off-schema rule gets
glob-checked on half-parsed paths.

**(d) The `worktreeBlindGlobs` blind-test is vacuous.**
It builds `probe = worktrees/probe/<rest>` and asks whether the glob matches it.
For a repo-prefixed glob the answer is *always* no — the glob starts with
`youcoded/`, the probe starts with `worktrees/`. The `globToRegex` call is
theater; `blind.push(...)` unconditionally is identical behaviour in fewer
lines. Worth noting the irony: the plan excludes Theme B ("a new guard must be
shown failing") and then ships a guard that has never been shown to fail.

---

## 6. Task 5 (dead branch names) should be cut

Simulated the plan's exact regex and live-ref logic against the real tree:

```
DEAD mentions: 78   unique dead branches: 40
  perf/optimization-pass         in 5 files
  feat/full-auto-read-bypass     in 3 files
  ... 38 more
```

Three problems, each verified:

1. **78 warnings on the first run.** Task 4 exists because a 607-row unread
   number is worthless. Task 5 immediately creates a 78-row one. Most are
   specs and investigations legitimately naming the branch that produced them —
   which the plan anticipates ("a doc may legitimately name a historical
   branch") without giving the check any way to tell them apart.

2. **It flags a live, in-progress branch as dead.** `feat/session-strip-motion`
   has a worktree and uncommitted work right now, but has never been pushed —
   so it has no remote ref and the check calls it dead. The plan's own unit test
   asserts the opposite (`liveBranches: new Set(['feat/session-strip-motion'])`).
   The test passes; reality disagrees.
   ```
   $ git -C youcoded ls-remote --heads origin feat/session-strip-motion | wc -l
   0
   $ git -C youcoded show-ref --verify -q refs/heads/feat/session-strip-motion && echo local-yes
   local-yes
   ```

3. **A confirmed false positive on a file path.** `docs/test-blocking-relay.js`
   is flagged as a branch — `docs/` is in `BRANCH_TOKEN`, and the
   `fs.existsSync` guard misses it because the path is relative to a sub-repo,
   not the workspace root.

Task 6's `close-out.sh` already covers the actionable case: it checks branch
names **scoped to the branch being closed**, at the moment it matters, with no
background noise. That is the right home for this idea.

---

## 6b. Task 7 rests on a claim the document it cites refutes

This is the most consequential factual error in the plan, because Task 7 is the
task the plan calls "the finding that reframes all the others."

The plan (and its source) say both prior retrospectives are *"still `status:
active` with shipped and unshipped items intermixed"*, and Task 7 Step 1
pre-supplies a state: *"Proposal 2 (every guard must prove it is not vacuous) —
**not shipped**… Carry it to ROADMAP."*

The 2026-07-28 document's own first two lines:

```
status: partly applied 2026-07-28 — Proposals 1 and 2 done; 3, 4 and 5 STILL OPEN
        and untracked (re-verified 2026-08-26)
```
> **Applied 2026-07-28.** Proposal 2 (shared guard scope + non-vacuity helpers)
> shipped as `desktop/tests/helpers/guard-scope.ts` — PR #267.

```
$ ls youcoded/desktop/tests/helpers/guard-scope.ts
youcoded/desktop/tests/helpers/guard-scope.ts        ← exists
```

So: it is not `status: active`, its items are **not** indistinguishable (the
frontmatter names exactly which are open — 3, 4 and 5), and Proposal 2 shipped as
**code**, not as an unwritten paragraph.

That knocks out the plan's headline rationale for excluding Theme B: *"the fix
proposed for it on 2026-07-28, ranked #2 of 5, was a paragraph — and a month
later the paragraph does not exist. Writing it a fourth time is the exact failure
this plan is about."* The fix was a test helper and it shipped. The narrower
claim that survives — no red-before-green *prose* exists in `CLAUDE.md`,
`PITFALLS.md` or the rules — is true and worth stating, but it is a much weaker
argument for deferral.

Two smaller number problems in the same paragraph: the plan's Task 7 commit
message says *"Two studies (n=46 and n=55 sessions)"*. The 2026-08-28 study is
n=46 (stated in its `method:` line). The 2026-07-28 study's own scope line reads
*"the menu-internals session, 2026-07-26 → 2026-07-28"* — **one** session. There
is no 55-session study in that folder; the source investigation asserts it at
`:25` and the plan inherits it.

**Also — Task 7 Step 2's table uses a numbering the plan never names.** The
2026-08-28 document numbers things twice: sections `## 1 … ## 9`, and a closing
"in order of payoff" table that renumbers. The plan's table is *payoff*
numbering. Under section numbering, #8 is "`verify.sh` cries wolf" and the
worktree-location item is **#7**. A worker executing Step 2 literally will mark
the wrong items — especially the "#2, #7, #9 — verify each before marking" row,
which points at three different findings depending on which list you open.

And the plan re-classifies #8 (worktree location) as *"superseded — Task 1 of
this plan fixes the mechanism the rule was a workaround for."* It doesn't. That
item is about worktrees physically living in three places on disk (`worktrees/`,
plus root-level `beta/`, `flappy-bird/`, `youcoded.wt/`) — a filesystem
convention. Task 1 edits rule frontmatter and touches none of it. The source
investigation classified it correctly as **not done**; the plan silently upgraded
that to "superseded", which is how an open item disappears.

---

## 6c. Three of the source's findings are dropped without being declined

The plan's "What this plan deliberately does not do" section is a good habit, and
it is incomplete. These are in the source and appear in neither the tasks nor the
exclusions:

1. **Theme A's other half** — the mirror image. The source records
   `harness-tools.md` and `native-permissions.md` (~1,400 words) loading at turn
   zero of two sessions with no matching file touched, and concludes *"rule
   injection is currently unreliable in **both** directions — silent when it
   should fire, and firing when it should be silent."* Cause: unexplained. This
   is the more alarming half — the plan's entire premise is that fixing globs
   makes rules fire correctly, while the source says the matcher is also firing
   when it shouldn't and nobody knows why. **It reproduced a third time at the
   start of this review session**: both rules were in context at turn zero,
   before any file was read.

2. **The MAP-row-absence detector.** The source: *"The auditor still never checks
   that a shipped subsystem *has* a MAP row, only that the rows it has point at
   real files."* Task 4 fixes the other half (the 607-row noise); Task 6
   downgrades this half to a human `note`. That is a legitimate choice — but it
   should be stated as one.

3. **Working-directory drift** (commands failing because the session's cwd moved
   after a backgrounded command). Filed as minor in the source, absent here.

Borderline fourth: **C2 (ROADMAP entry size)**. The plan's exclusions decline
"`scripts/roadmap-find.sh`" — a script the source **never proposed** (zero
occurrences). What the source actually recommended is that entry `:615`, ten
paragraphs long, be split. The plan states that idea *as its reason for
excluding* something else, and so declines the real recommendation without ever
naming it.

---

## 7. If I could add one thing: the `InstructionsLoaded` hook

The whole plan rests on one belief — *rules don't fire on worktree paths* — and
that belief is currently **inferred, never observed.** The plan admits it in
Final Verification: *"Read that file in a session and check whether the rule
appears in context. This is the one check the auditor cannot make for you."*

Claude Code ships a hook for exactly this. `InstructionsLoaded` logs which
instruction files loaded, when, and why. One hook + one log file gives:

- **A before/after proof** for Task 1 that costs one session instead of a manual
  eyeball, and turns the Final Verification checkbox from a judgement call into
  a diff.
- **Evidence for the still-unexplained second half of Theme A** — the
  investigation records `harness-tools.md` and `native-permissions.md` appearing
  at turn zero of two sessions with no matching file touched (it happened again
  at the start of this review session, a third sighting). Cause listed as
  "unexplained." The hook is the instrument that would explain it.
- **The workspace's first actual measurement of retrieval**, which is the thesis
  the entire plan is built on and the one thing it never measures.

This is small — a hook entry in `.claude/settings.json` and an append-to-file
script — and it is the difference between "we changed 115 globs and believe it
helped" and "we changed 115 globs and here is the log showing the rule now
loads."

---

## 8. If I could subtract one thing: Task 5

Per §6. It adds a noisy signal to a plan whose central complaint is noisy
signals, and its one crisp use case is already inside Task 6.

Runner-up for the cut: the one-shot `migrate-rule-globs.mjs` script (§9).

---

## 9. Simplifications

**Derive the migration from the check, don't hand-maintain a parallel table.**
The plan writes the rule twice — once as `worktreeBlindGlobs` (which decides
what is blind) and once as a six-entry `SWAPS` array (which decides what to
rewrite). They already disagree: `SWAPS` provably misses 4 blind globs (§1). One
source: for every glob `worktreeBlindGlobs` reports blind, rewrite `<repo>/` to
`**/` unless it carries a repo-pinned comment. That removes the second table,
removes the drift between them, and removes the need for Step 6's constant.

**Consider brace expansion instead of `**/` — but only with eyes open.**
Claude Code supports `{a,b}` in rule globs, so `{youcoded,worktrees/*}/desktop/**`
is *more precise* than `**/desktop/**` — it cannot reach
`wecoded-marketplace/worker/src/app/routes.ts`, the one over-match the plan
already found and shrugs at. **But** the auditor's own `globToRegex`
(`scripts/audit-anchors.mjs:155`) escapes `{` and `}` as literals, so braces
would silently break its "every glob matches ≥1 tracked file" check. Either
teach `globToRegex` braces first, or stay with `**/` and keep the over-match
report. `**/` is the defensible default — it has 2026-08-05 precedent in
`code-search.md` — but the plan should say it *chose* it, not assume it.

**Task 4's real lever is Step 5, not the regex list.** Writing a fresh
`verified_shas` baseline alone collapses 3,190 changed files to a few days'
worth. The `NO_RULE_EXPECTED` filter is worth keeping, but it's polish on top,
and one of its entries (`/\.claude\/hooks\//`) filters out real, tested code —
`context-inject.sh` and `glob-guard.py` both have suites that CI runs. Drop that
entry.

---

## 10. Smaller corrections

- **Task 3 Step 2 assumes each over-budget rule "ends with a pointer to a depth
  doc."** Two do (`chat-reducer.md:44`, `sync-spaces.md:63`). **`artifacts.md`
  has none** — though `youcoded/docs/artifacts.md` exists. Add the pointer as
  part of the trim; don't let the biggest offender (769 words, 169 over) stall
  on a missing overflow path.

- **Task 3's `PITFALLS.md` word trim doesn't fix the finding it cites.** The
  CI-triage entry at `:30` went unread because the file has **7 headings for
  3,118 words**, not because it's 618 words over budget. The plan's own
  suggestion — a scannable `## A CI leg is red — is it yours?` heading — is the
  part that does the work. Say that explicitly, or the next session trims to
  2,499 words and calls it done.

- **Task 6's `close-out.sh` reports 5 permanent TODOs for every branch.** The
  `status: shipped` check isn't branch-scoped:
  ```
  $ rg -l '^status: shipped' docs/active | wc -l
  5
  ```
  So `FAILED` is never 0 and the "Close-out clean" line never prints, for
  anybody, ever. Either scope the check to docs mentioning the branch, or
  print it as a `--` note rather than a `TODO`.

- **`close-out.sh` always `exit 0`.** Fine for an advisory tool, but say so in
  the header so nobody wires it into a gate.

- **Task 7's *individual* states check out** where I spot-verified them (the
  numbering problem in §6b is separate): #1 glob-guard hook exists; #3 the Serena
  paragraph is still in `CLAUDE.md:86`; #4 `.claude/commands/` holds only
  `audit.md`; #6 `docs/MAP.md:44` has the hot-paths table. And Step 4 fits:
  `code-search.md` is at **404/600 words**, the Serena paragraph is ~130, so the
  move lands with room to spare.

- **The source investigation's own matching-semantics claim carries no
  evidence.** It says *"The draft flagged the matching semantics as unverified.
  They are now confirmed: patterns match relative to the project root"* — the one
  claim in a document that otherwise pastes a re-runnable command beside every
  number. Its Confidence section then says "every command above is re-runnable as
  written," which is true of the counts and not of this. It *is* correct — the
  official docs confirm project-root-relative matching, lazy path-scoped loading,
  and that `**/` behaves as expected — but the plan should cite that rather than
  inherit an unbacked assertion. (Same source also confirms `{a,b}` brace
  expansion, per §9.)

- **State the assumption Task 1 depends on.** The `**/` fix works because
  sessions are rooted at `/home/destin/youcoded-dev`. A session rooted *inside* a
  worktree would load none of these 25 rules at all — a different failure the
  plan neither fixes nor mentions. One sentence is enough.

- **The auditor can only ever prove this syntactically.** `listTrackedFiles`
  (`scripts/audit-anchors.mjs:200`) lists the workspace repo and the five
  sub-repos; `worktrees/` is gitignored and never enumerated. So the new check
  proves a glob *could* match a worktree-shaped string — never that a real
  worktree file matched. That's the gap §7's hook closes.
