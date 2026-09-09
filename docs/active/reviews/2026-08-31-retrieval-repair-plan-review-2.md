---
status: draft
created: 2026-08-31
scope: Second review of docs/active/plans/2026-08-31-workspace-retrieval-repair.md
reviewer: fresh session, every number re-measured against the live tree
---

# Second review — Workspace Retrieval Repair plan

Every claim below was re-run against the tree today. Where I say "measured", the
command was executed in this session and the output is quoted.

---

## What holds up

I checked the plan's numbers rather than trusting them. They are unusually
clean:

| Plan claims | I measured | Verdict |
|---|---|---|
| 133 glob entries, 115 blind across 22 files | `total 133 · blind 115 across 22 files` | exact |
| 26 rule files, 25 with `paths:` | 26 | exact |
| audit exits 1 on 4 budget violations | exit=1, 4 violations | exact |
| PITFALLS 3,118 words / 7 headings | 3,118 / 7 | exact |
| `code-search.md` has 196 words of headroom | 404/600 | exact |
| exempt = 9, blind after pinning = 111 | 1+1+3+4 = 9; 115−4 = 111 | arithmetic checks out |
| after migration, exactly 1 glob reaches outside its repo | I relaxed all 115 and re-matched: 1 | exact |
| eager load ≈6,738 tokens | 6,738 | exact |
| ROADMAP 99,825 words / 407 entries | 99,825 / 407 | exact |
| `globToRegex` escapes `{`/`}` at :155 | confirmed at :155 | exact |
| the two corrections to the source investigation (134→133; "112" is a line count; no 55-session study) | all three confirmed in the source's own text | correct |

Two things the plan understates rather than overstates: CI is red on the **last
eight** runs, not five, and diff scope is **3,191** changed files, not 3,190.

Every insertion point named in Tasks 3–5 exists and has the shape the plan
assumes: `rules.push({name, file, fm, text})` at `:384`, the glob check at
`:420`, `result.ok` at `:473`. Every glob in every rule file is quoted, so the
migration script's `includes('"' + glob + '"')` cannot silently skip one.

---

## Errors

### 1. Four commit steps stage whole directories — in a workspace where other sessions are mid-edit

Task 1 Step 6 and Task 3 Step 14 both run `git add .claude/rules/`. Task 7 Step 7
runs `git add docs/active docs/archive`.

As of right now:

```
 M .claude/rules/ipc-bridge.md                              ← another session's uncommitted edit
?? .claude/rules/artifacts.md.recovered-trim.partial.patch  ← another session's scratch file
 M docs/active/investigations/2026-08-31-…-workspace-friction.md
?? docs/active/specs/2026-08-31-landing-page-message-strategy.md
```

A directory add sweeps all four into this plan's commits. This is the exact
incident recorded on 2026-08-27 (81 foreign files in one commit) and the reason
the standing instruction is to stage by explicit path only.

**Fix:** replace every directory add with the named files the task actually
touched.

### 2. The justification for the `# repo-pinned` machinery is measurably false

The plan says the four `youcoded/docs/**` globs must stay pinned because *"the
workspace has its own `docs/` holding 1,332 tracked files; `**/docs/**` would
fire on all of them."*

None of the four globs is `**/docs/**`. They are:

```
**/docs/index.html   **/docs/media/**   **/docs/site/**   **/docs/gallery/**
```

and the workspace has **no `docs/media`, no `docs/site`, no `docs/gallery`
directory at all**. I relaxed all four and counted what they reach across the
workspace and all five sub-repos:

```
docs/media    -> 19 files;  all under youcoded/
docs/site     -> 158 files; all under youcoded/
docs/gallery  -> 48 files;  all under youcoded/
docs/index.html -> 2 files; youcoded/ and youcoded-core/
```

Relaxing all four picks up **one extra file in the entire workspace**:
`youcoded-core/docs/index.html`, in the repo that is being archived.

So the exemption mechanism — a regex that re-parses each rule's source text
looking for a trailing comment, a fourth exemption category, a dedicated unit
test billed as "THE REGRESSION TEST FOR THIS PLAN'S OWN FIRST-DRAFT DEFECT",
schema prose in `README.md`, Step 2's annotation pass, and Step 8's hard gate
("if the exempt count is not 9, stop and fix it") — exists to protect one file in
a dying repo.

This is the plan's single biggest piece of overthinking, and it is self-inflicted:
the first draft's defect was real, and the fix over-corrected into ceremony.

### 3. Task 2's logger cannot answer Task 2's own question

The plan registers **one script** under **two matchers**
(`path_glob_match` and `session_start`), then says in Step 4: *"The two matchers
separate the answer for you."*

They do not. The script writes a timestamp, the project dir, and raw stdin — and
the plan states two paragraphs earlier that **the stdin payload schema is not
publicly documented**. If the payload does not happen to carry the load reason,
both matchers produce indistinguishable lines and Step 4's entire analysis is
impossible.

**Fix (one line):** pass the matcher name as an argument and print it.

```bash
"command": "bash \"${CLAUDE_PROJECT_DIR}/.claude/hooks/instructions-log.sh\" path_glob_match"
```
```bash
printf '%s\t%s\t%s\t%s\n' "$(date -Is)" "${1:-?}" "${CLAUDE_PROJECT_DIR:-?}" "$(cat … )"
```

### 4. The `.gitignore` edit is dead code

The log is written to `${HOME}/.claude/instructions-loaded.log` — outside the
repository entirely. `echo 'instructions-loaded.log' >> .gitignore` ignores
nothing that git would ever have seen. Drop the line, or move the log inside the
repo if you want it ignorable.

### 5. Two test snippets are missing their imports

`scripts/audit-anchors.test.mjs` currently imports exactly five names. Task 3's
snippet correctly adds `import { worktreeBlindGlobs }`. Task 4's snippet uses
`strayRuleDirs` and Task 5's uses `affectedSubsystems`, and **neither adds an
import** — both fail with a ReferenceError, and CI gates the whole run on this
file (`Test the anchor checker` runs first and fail-fast).

### 6. Task 4 turns CI red on purpose, in a plan whose thesis is that a permanently-red check is worthless

CI does clone `youcoded` fresh from master (I read the workflow). So the moment
`strayRuleDirs` joins `result.ok`, every CI run fails until the separate
`youcoded` PR merges. Step 2 gets the ordering right; Step 5 then softens it to
*"Until then this check is correctly red"* — which is precisely the state Task 1
exists to end, and which the Global Constraints forbid.

**Fix:** state it as a hard sequence, not a tolerance. Land the `youcoded`
deletion PR first; only then merge the workspace commit that adds the check.

### 7. Task 7 Step 5 contradicts the Global Constraints

Global Constraints: *"one branch, one PR."* Step 5: archive this plan and its
reviews, *"only after Tasks 1–6 have merged."* You cannot archive, inside a PR,
documents whose archival depends on that PR having merged. It is a second commit
after merge — say so, or the executing session will stall here.

---

## The one thing I would add

**Establish where the session is actually rooted, before rewriting 111 globs.**

The plan has exactly one theory for why `test-suite-hygiene.md` did not fire, and
Task 3 spends its whole budget on that theory. There are two rival explanations
it never names, and both are cheap to rule out with the instrument Task 2 already
builds:

1. **The session was rooted inside the worktree.** If a session launches with its
   working directory at `worktrees/session-motion/`, then `.claude/rules/` does
   not exist there at all — *zero* rules load, and no `**/` prefix anywhere fixes
   it. The fix would be getting `.claude` into each worktree, not rewriting
   globs.
2. **`worktrees/` is gitignored.** I confirmed it: `.gitignore:55` ignores
   `worktrees/`. If the harness's path matcher skips ignored paths — which many
   file-scanning tools do by default — then *no glob of any shape* will ever fire
   on a file under `worktrees/`, and the migration is wasted work that also
   passes its own audit check.

Task 2 Step 3's gate is written as a binary ("appears for both → stop"). It
should be a three-way discrimination, and Step 3 should additionally record the
session's project root in the log line. That is a second one-line change to the
hook and it converts the gate from "confirm my hypothesis" into "find out which
of three things is true" — which is what the plan's own "prefer measuring over
asserting" constraint asks for.

**Bonus evidence, free:** this session is a **fourth** sighting of the turn-zero
mystery — `harness-tools.md` and `native-permissions.md` loaded with no matching
file touched. I tested the most obvious cause: that the SessionStart hook's
output names file paths matching those rules. It is **falsified**. 22 of the 25
rules have a glob matching a path string in the always-loaded context, and only
those two loaded. Not file modification time either (`harness-tools.md` is the
4th-newest rule, and the newest two did not load). Record this in Task 2 so the
executing session does not re-derive it.

---

## The one thing I would subtract

**The `# repo-pinned` pinning of the four `youcoded/docs` globs, and everything
downstream of it** (finding 2 above): Step 2's annotation pass, Step 8's hard
gate on the number 9, the "first-draft defect" regression test framing, and the
README schema paragraph about it.

Relax all 115. Keep the four-line `# repo-pinned` branch inside
`worktreeBlindGlobs` and its one unit test, so a future rule that genuinely needs
a repo prefix has a documented escape hatch — but pin nothing today, and stop
gating the migration on a count.

Expected numbers become `0 blind · 5 exempt (named) · 2 reaching outside their
repo`, and the second over-match is one file in a repo scheduled for archival.

---

## Simplifications that keep the stated goal

- **Split the PR at the Task 4 boundary.** Tasks 1–3 are the retrieval thesis and
  its proof. Tasks 4–7 are unrelated housekeeping that happen to touch
  `CLAUDE.md`, `ROADMAP.md`, `.claude/rules/`, and `docs/` — the four things
  other concurrent sessions are editing right now. Two PRs cut the conflict
  surface roughly in half and let Tasks 1–3 land while the cross-repo
  `android-runtime` deletion is still in flight.
- **Task 5's filter is admitted polish.** The plan says so itself: *"The bigger
  lever is Step 4, not the filter."* Ship Step 4 (the fresh baseline) and drop
  the `NO_RULE_EXPECTED` list to a follow-up. A fresh baseline alone collapses
  3,191 files to a few days' worth, which is the entire readability problem.
- **Task 6's script is 150 lines to replace an eleven-item checklist.** Half of
  its output is `note` lines that a human must act on anyway. The git half is
  genuinely mechanical and worth scripting; the docs half is three greps. If it
  needs trimming later, trim there.

---

## Contradictions and soft spots

**Two different glob engines, never reconciled.** Every "measured" number in
Task 3 comes from `globToRegex`, which its own comment calls *"just enough
glob"*: `**` becomes `.*` with no awareness of directory boundaries, and
`**/foo` cannot match `foo` at the root because the regex requires a leading
slash. Claude Code's real matcher is a different implementation with different
edge cases. The consequence is not that the numbers are wrong — I re-derived them
and they are right for this tree — but that **the auditor measures the shape of a
glob and Task 2's log measures the harness's behaviour, and the plan sometimes
lets the first stand in for the second.** Task 3 Step 12 gets this exactly right
("only the log proves the harness loaded it"); Step 8 and Step 11 read as if the
auditor's verdict were the outcome. Worth one sentence at the top of Task 3.

**`close-out.sh` ships a green line the plan already knows is wrong.** Step 3's
own note: `feat/session-strip-motion` is alive with uncommitted work, has never
been pushed, and the script prints `OK remote branch deleted`. The plan notices
the asymmetry, explains it, and ships it. Against the workspace's own
"never write a misleading message" standard, that line should read
`-- no remote ref — never pushed, or pushed and deleted` when there is no
ancestry proof. The first check does catch the branch (`TODO … NOT on
origin/master`), so this is a wording fix, not a design one.

**"Do not proceed until this run is green" (Task 1 Step 6) is not enforceable as
written.** CI takes ~20 seconds and the plan gives no wait command, so an
executing agent will either poll blindly or skip it. `gh run watch` would make it
real.

**Task 3 Step 1 says "if your numbers differ, use yours" — and Step 8 then hard-
gates on the constant 9.** These are the same mistake the plan says it is
correcting ("the first draft hard-gated on a constant and stalled here"). If
finding 2 is accepted, Step 8's gate disappears with it.

**Minor:** `mkdir -p docs/archive/reviews` is genuinely needed (it does not
exist); `docs/archive/plans` already exists, so the comment "does not exist yet"
is only half true.

---

## Bottom line

The plan is unusually well-evidenced — I tried hard to break its numbers and
could not. The problems are all at the edges: four commits that will sweep other
sessions' work, one instrument that cannot read its own output, one exemption
mechanism defending against a single file, two missing imports, and one theory
being tested where three are live.

Fix findings 1, 3 and 5 before running anything. Decide finding 2 before Task 3
Step 2. Everything else is polish.
