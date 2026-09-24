---
status: implemented 2026-08-31 — PR #3 open, not merged; archive after merge
created: 2026-08-31
revised: 2026-08-31
source: docs/active/investigations/2026-08-31-session-retrospective-workspace-friction.md
reviews:
  - docs/active/reviews/2026-08-31-retrieval-repair-plan-review.md
  - docs/active/reviews/2026-08-31-retrieval-repair-plan-review-2.md
scope: Workspace repo (youcoded-dev) only — no sub-repo code changes
---

# Workspace Retrieval Repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workspace's existing guidance actually reach the session that
needs it — by getting the one automated check green so its verdict means
something again, by *measuring* which rules load instead of assuming, by fixing
the rule globs that cannot match inside a worktree, and by turning branch
close-out from a remembered sequence into a script.

**Architecture:** Almost nothing new is written down. Every change is a
mechanical edit to existing rule frontmatter, a new *executable* check inside
`scripts/audit-anchors.mjs` (which CI already runs daily), one observability
hook, or one script. Four documents get smaller; two get created. This is
deliberate: the source investigation's central finding is that this workspace's
problem is retrieval, not content — and that its own retrospectives are the
least-retrieved layer of all.

**Tech stack:** Node 20+ (`node:test`, no dependencies — `audit-anchors.mjs` is
dependency-free by design), bash, git.

---

## Measured baseline — 2026-08-31

Every number this plan acts on, in one place, with the command that produced it.
**Re-measure before Task 3; do not trust these as constants.** They were taken
with the auditor's own `parseRuleFrontmatter`, so a parser difference is not a
possible explanation for a mismatch.

| Quantity | Value | How |
|---|---|---|
| Rule files in `.claude/rules/` | 26 (25 with `paths:`; `README.md` is the schema doc) | `ls .claude/rules/*.md \| wc -l` |
| Glob entries across all rules | **133** | census script, Task 3 Step 1 |
| — already worktree-safe (`**/`, all in `code-search.md`) | 13 | same |
| — deliberately eager (`**`, `live-app-safety.md`) | 1 | same |
| — whole-repo (relaxing would make the rule eager) | 3 | same |
| — workspace-root (`scripts/ui-review/**`) | 1 | same |
| — **worktree-blind** | **115, across 22 files** | same |
| Of the blind: `youcoded/desktop/` | 99 | same |
| Of the blind: `youcoded/app/` | 6 | same |
| Of the blind: `youcoded/docs/` | 4 | same |
| Of the blind: everything else | 6 | same |
| Tracked files, workspace + 5 sub-repos | 4,363 | `listTrackedFiles()` |
| Files a full relaxation reaches outside their own repo | **2** | Task 3 Step 2 |
| Audit budget violations | 4 | `node scripts/audit-anchors.mjs --json` |
| Audit exit code today | **1** | `node scripts/audit-anchors.mjs; echo $?` |
| Consecutive red CI runs | 8 of last 8, incl. the daily cron | `gh run list --workflow=workspace-ci.yml` |
| Diff-scope baseline age | 47 days, 3,191 files, 607 "no rule" rows | `node scripts/audit-anchors.mjs` |

**Two numbers in the source investigation are wrong and are corrected here.** It
reports 134 glob entries (it counts `README.md`'s schema *example* as a live
glob) and its prefix table sums to 119 blind without ever subtracting the 4
exemptions. The figure "112" that circulated is the source's estimate of the
*line cost of a rejected alternative* ("112 new lines"), not a defect count.

**One number this plan's own first two drafts got wrong, corrected here.** They
claimed the four `youcoded/docs/**` globs had to keep their repo prefix because
relaxing them would fire the landing-page rule on the workspace's own 1,332
`docs/` files. That was never measured and is false. The four globs are
`docs/index.html`, `docs/media/**`, `docs/site/**` and `docs/gallery/**` — and
the workspace has **no `docs/media`, no `docs/site` and no `docs/gallery`
directory at all**. Relaxing all four reaches exactly **one** extra tracked file
in the entire workspace: `youcoded-core/docs/index.html`, in the repo scheduled
for archival. So nothing is pinned; see Task 3's design decisions.

---

## Global Constraints

- **Workspace repo only.** All edits land in `/home/destin/youcoded-dev`. No
  changes to `youcoded/`, `wecoded-marketplace/`, `wecoded-themes/`,
  `youcoded-core/`, or `youcoded-admin/` source. Task 4 *deletes* one stale rule
  file inside `youcoded/` — the single, explicitly-scoped exception, and it is a
  rule file, not source.
- **`scripts/audit-anchors.mjs` must stay dependency-free and offline.** No npm
  packages, no network calls. It runs in `.github/workflows/workspace-ci.yml` on
  a daily cron.
- **Every new check must be unit-tested in `scripts/audit-anchors.test.mjs`**,
  which CI runs via `node --test`.
- **Named exemptions with counts, never silent skips.** Every check that skips
  something reports what it skipped and why, as a number.
- **No new gate may leave the audit permanently red.** If a check can flag
  something the plan does not intend to fix, that thing needs an *exemption
  mechanism* before the check becomes a failure condition. This is the defect
  that made the first draft of this plan unshippable.
- **Prefer measuring over asserting.** Where a claim about tool behaviour can be
  observed, observe it (Task 2) rather than reasoning about it.
- **WHY comments at every non-obvious edit site.** Destin is a non-developer and
  relies on them.
- **Stage by explicit file path. Never `git add <directory>`.** Concurrent
  sessions keep uncommitted and untracked work in this repo, *including inside
  `.claude/rules/` and `docs/active/`* — as this plan was being written the tree
  held another session's edit to `.claude/rules/ipc-bridge.md` and its scratch
  file `.claude/rules/artifacts.md.recovered-trim.partial.patch`. A directory add
  sweeps those into your commit; that exact accident took 81 foreign files on
  2026-08-27. Every commit block below names its files, and **`git status` before
  each commit is part of the step, not an optional check.**
- **Branch:** do this work in a worktree of the workspace repo. All seven tasks
  are in one repo; **one branch, one PR**, committed task by task so the history
  stays readable.
  - **One exception, and it is in a different repo:** Task 4 also needs a small PR
    in `youcoded` deleting the duplicate rule file, and **that PR must merge
    before** this branch's Task 4 commit lands (Task 4 Step 2 explains why — CI
    clones `youcoded` fresh, so the new guard is red until the fork is gone). If
    that PR stalls, ship Task 4's merge-and-delete without the guard rather than
    holding up the rest.
  - **Task 7 Step 5 is the last commit on the branch**, because it archives this
    plan and its reviews. Everything else must be done and verified first.

---

## Task order, and why

1. **Task 1 — get the audit green.** CI has failed on every run for weeks,
   including the daily cron the workflow's own comments call "the one that
   matters." Nothing downstream is trustworthy until a green run exists to
   regress *from*.
2. **Task 2 — measure what loads.** Task 3 changes 115 globs on a hypothesis, and
   there are **three** live explanations for the observed miss, not one. Establish
   which is true first, or the after-state proves nothing.
3. **Task 3 — the glob migration.** The main event.
4. **Tasks 4–6** — independent of each other; any order.
5. **Task 7 last**, always: its final step archives this plan, so nothing that
   reads the plan can come after it.

---

## File Structure

| File | Change | Responsibility after the change |
|---|---|---|
| `.claude/rules/artifacts.md`, `chat-reducer.md`, `sync-spaces.md` | modify body | Back under the 600-word budget; depth moves to the lazy doc each points at |
| `docs/PITFALLS.md` | modify | Under the 2,500-word budget, and its CI-triage entry findable by heading |
| `.claude/hooks/instructions-log.sh` | **create** | Appends one line per instruction-load event to a log — the workspace's first measurement of retrieval |
| `.claude/settings.json` | modify | Wires that hook, twice, each call tagged with its own matcher |
| `.claude/rules/*.md` (22 files) | modify frontmatter `paths:` only | Globs that match the same file under `youcoded/` and under `worktrees/<name>/` |
| `scripts/audit-anchors.mjs` | modify | Three new checks: worktree-blind globs, stray sub-repo rule dirs, diff-scope noise filter |
| `scripts/audit-anchors.test.mjs` | modify | Unit tests for all three |
| `youcoded/.claude/rules/android-runtime.md` | **delete** (after merging its unique content) | — |
| `scripts/close-out.sh` | **create** | Per-branch close-out: reports what is and is not finished, mechanically |
| `docs/audits/2026-08-31-retrieval-repair.md` | **create** | Fresh `verified_shas` baseline so diff scope stops reporting 47 days of churn |
| `CLAUDE.md` | modify | Two pointers added, one Serena paragraph moved out — net fewer always-loaded words |
| `docs/archive/investigations/2026-07-28-…`, `2026-08-28-…`, `2026-08-31-…` | move + annotate | The three retrospectives, each item marked shipped, dropped, or carried |

---

## Task 1: Get the mechanical audit green

**Why this is first:** `node scripts/audit-anchors.mjs` exits 1 today, and
`.github/workflows/workspace-ci.yml` runs it on push and on a daily cron. The
last eight runs — including the cron — are all red. This is worse than the source
investigation's framing ("a check that says *fix now* and is not fixed teaches
sessions to skip it"): the workspace's only automated verdict has been failing
unattended, so nobody can tell a new regression from the standing four.

`PITFALLS.md` being over budget is also the direct cause of finding C1 — the
CI-triage advice was in there and nobody read it.

**Files:**
- Modify: `.claude/rules/artifacts.md` (769 → ≤600 words)
- Modify: `.claude/rules/chat-reducer.md` (734 → ≤600)
- Modify: `.claude/rules/sync-spaces.md` (651 → ≤600)
- Modify: `docs/PITFALLS.md` (3,118 → ≤2,500)

- [ ] **Step 1: Confirm the violations and the exact overage**

```bash
cd /home/destin/youcoded-dev && node scripts/audit-anchors.mjs --json 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.table(JSON.parse(s).budgets.violations))"
```

Expected: four rows matching the counts above.

- [ ] **Step 2: Give `artifacts.md` the depth-doc pointer it never had**

`chat-reducer.md:44` and `sync-spaces.md:63` each carry a **Depth + why per
bullet: `youcoded/docs/<name>.md`** line, which is where their overflow goes.
`artifacts.md` has no such line — though `youcoded/docs/artifacts.md` exists.
Add the pointer *before* trimming, or the trim has nowhere to put anything.

```bash
ls youcoded/docs/artifacts.md   # must exist before you rely on it
```

- [ ] **Step 3: Trim each rule by moving depth to its lazy doc — not by deleting invariants**

For each of the three rules, move the *explanatory* half of the longest bullets
into its depth doc and leave the invariant, the one-sentence why, and the guard.
`.claude/rules/README.md` is explicit that this is the intended overflow path:
*"Overflow migrates to the lazy doc the rule points to, or becomes a pinning
test."*

Do not delete any bullet outright. If a bullet has no depth doc to move to,
convert it to an ast-grep rule under `scripts/ast-grep/` instead — the knowledge
ladder ranks an executable check above prose.

After each file:

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('.claude/rules/artifacts.md','utf8');
console.log((t.replace(/^---\n[\s\S]*?\n---\n?/,'').match(/\S+/g)||[]).length)"
```

Expected: ≤600. Repeat for `chat-reducer.md` and `sync-spaces.md`.

- [ ] **Step 4: Trim `docs/PITFALLS.md` — and fix the reason it went unread**

Two separate jobs; the word count is the lesser one.

*Word count:* `PITFALLS.md` is scoped by `CLAUDE.md` to **cross-repo items
only**; anything single-repo belongs in `youcoded/docs/` or in a path-scoped
rule. Move single-repo entries out on that basis.

*Findability — the part that actually addresses finding C1:* the file has **7
headings for 3,118 words**, so its content is one long scan. The CI-triage entry
at `:30` was correct and unread because nothing led a triaging session to it.
**Keep that entry** and give it a heading a session in that situation will scan
for, e.g. `## A CI leg is red — is it yours?`. Trimming to 2,499 words without
this change satisfies the budget and fixes nothing.

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('docs/PITFALLS.md','utf8');
console.log((t.replace(/^---\n[\s\S]*?\n---\n?/,'').match(/\S+/g)||[]).length)"
rg -c '^#{2,3} ' docs/PITFALLS.md
```

Expected: ≤2500 words, and more headings than the 7 it has today.

- [ ] **Step 5: Confirm the mechanical pass is green, and that CI agrees**

```bash
cd /home/destin/youcoded-dev && node scripts/audit-anchors.mjs; echo "exit=$?"
node scripts/audit-anchors.mjs --no-diff; echo "ci-mode exit=$?"
```

Expected: no `FAIL budget violations` block, and `exit=0` on **both**. CI runs
the `--no-diff` form; a green run in one mode and red in the other is the failure
this step exists to catch.

- [ ] **Step 6: Commit — and watch the CI run go green**

```bash
# Look first. Another session's uncommitted work lives in .claude/rules/ more
# often than not, and a directory add would take it with you.
git status --porcelain .claude/rules/ docs/

# Explicit paths only — never `git add .claude/rules/`.
git add .claude/rules/artifacts.md .claude/rules/chat-reducer.md \
        .claude/rules/sync-spaces.md docs/PITFALLS.md
git commit -m "docs: get the mechanical audit green — CI has been red on every run for weeks

audit-anchors.mjs exits 1 on four standing budget violations, and workspace-ci
runs it on push and on a daily cron. The last eight runs, cron included, all
failed — so a real regression was indistinguishable from the standing four.
PITFALLS.md at 3,118/2,500 words, with 7 headings, is also why its correct
CI-triage entry went unread during the 2026-08-31 arcade merge."
```

Then actually wait for the run, rather than eyeballing a list once:

```bash
gh run watch --repo itsdestin/youcoded-dev \
  "$(gh run list --repo itsdestin/youcoded-dev --workflow=workspace-ci.yml \
       --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
echo "ci exit=$?"
```

`--exit-status` makes a red run a non-zero exit, so this is a gate and not a
glance. A run takes ~20 s. Do not proceed until it is green. **This is the
baseline every later task must not break.**

(On a PR branch the push event is `pull_request`, so the newest run is yours;
if the list shows a run for someone else's commit, re-run the query after your
push has registered.)

---

## Task 2: Measure which rules actually load

**Why:** this plan's central hypothesis is that path-scoped rules do not fire on
files inside a worktree. That hypothesis is currently supported by one negative
observation (a session edited four test files in a worktree and
`test-suite-hygiene.md` "never appeared", with no method given for how that was
determined) plus a reading of the docs. Task 3 rewrites 115 globs on it.

### Three explanations, not one

The observed miss has **three** live causes, and the glob migration only fixes
the first. Task 3 is worth doing only if Step 3 below shows it is cause (a):

- **(a) The glob is repo-prefixed.** `youcoded/desktop/**` cannot match
  `worktrees/session-motion/desktop/**` when globs are resolved from the project
  root. This is Task 3's premise, and the leading `**/` fixes it.
- **(b) The session was rooted INSIDE the worktree.** If a session launches with
  its working directory at `worktrees/session-motion/`, there is no
  `.claude/rules/` directory there at all — **zero** rules load, eager ones
  included, and no glob of any shape changes that. The fix would be getting a
  `.claude` into each worktree, which is a different plan.
- **(c) `worktrees/` is gitignored** (`.gitignore:55`). If the harness's path
  matcher skips ignored paths — many file-scanning tools do by default — then no
  glob of any shape will ever fire on a file under `worktrees/`, the migration is
  wasted, and it would still pass its own audit check, because the auditor tests
  glob *shape* against tracked files and never asks the harness anything.

Distinguishing (a) from (b) is one field in the log line: the session's project
root. Distinguishing (a) from (c) is Step 3's second reading.

### The second mystery, and one cause already ruled out

`harness-tools.md` and `native-permissions.md` (~1,400 words combined) load at
turn zero of sessions that touch none of their paths. The source recorded two
sightings, this plan's first review a third, and its second review a **fourth**.
The source's conclusion: *"rule injection is currently unreliable in both
directions — silent when it should fire, and firing when it should be silent."*

Two candidate causes have already been tested and **falsified** — do not re-derive
them:

- **Not "the SessionStart hook output names their files."** It does name
  `harness/permission-store.ts` and `harness/native-session-host.ts`. But 22 of
  the 25 rules have a glob matching some path string in the always-loaded
  context, and only those two loaded. Measured 2026-08-31.
- **Not file modification time.** `harness-tools.md` is the fourth-newest rule
  file; the two newest (`catalog.md`, `registries.md`) did not load.

Both halves of this task are questions about what the harness actually did, and
both are answerable by logging it rather than reasoning about it. This is the
cheapest task in the plan and the only one that produces evidence rather than
change.

**Files:**
- Create: `.claude/hooks/instructions-log.sh`
- Modify: `.claude/settings.json`

*(No `.gitignore` change: the log is written to `~/.claude/`, outside this
repository, so there is nothing for git to ignore. An earlier draft added a
`.gitignore` line that would have matched nothing.)*

### What is and is not known about the mechanism

Verified against the official hooks docs on 2026-08-31, so the next reader does
not have to re-derive it:

- **`InstructionsLoaded` is a real hook event**, spelled exactly that way, used
  as a key under `"hooks"` in `.claude/settings.json`.
- **It supports a `matcher` that filters by *load reason*** — and one of the
  values is **`path_glob_match`**, which is precisely the mechanism this plan is
  about (a `.claude/rules/*.md` file whose `paths:` glob matched). The other
  values are `session_start`, `nested_traversal`, `include`, and `compact`.
  Matching on `path_glob_match` isolates the exact signal; matching on
  `session_start` answers the turn-zero question in Step 4.
- **It appears to be observational** — no blocking or decision-control structure
  is documented for it.
- **Its stdin payload schema is NOT publicly documented.** The hooks guide lists
  the event and its matcher values but not the fields delivered on stdin. So
  **discover the shape, do not assume it** — Step 1 exists for that, and the
  logger in Step 2 writes raw stdin verbatim rather than reaching for field names
  that may not exist.
- `--include-hook-events` **does** exist in the installed 2.1.252 (`claude --help`
  lists it) though it is absent from the published docs. `claude --debug` /
  `--debug-file <path>` is the documented route, and the guide says the debug log
  carries "which hooks matched, their exit codes, stdout, and stderr."
- `/context` lists loaded memory files, but **its output format is not
  documented**, so do not script against it — use it to eyeball, not to assert.

- [ ] **Step 1: Discover the payload shape before depending on it**

```bash
claude --version    # expect 2.1.252 or later
```

Wire the logger from Step 2 first with `matcher: "path_glob_match"`, run one
session that reads a file under `youcoded/desktop/src/main/`, then look at what
actually arrived:

```bash
tail -3 ~/.claude/instructions-loaded.log
```

Record the field names you see in a comment at the top of the hook script. If
nothing is written at all, the event does not fire in this version — fall back to
`claude --debug-file /tmp/cc-debug.log` plus `rg -i 'rule|instruction' /tmp/cc-debug.log`,
and note in the commit which route you used.

**Do not skip the task because the first option is unavailable.** The measurement
is the point, not the mechanism.

- [ ] **Step 2: Write the logger**

```bash
cat > .claude/hooks/instructions-log.sh <<'EOF'
#!/usr/bin/env bash
# Appends one line per instruction-load event to ~/.claude/instructions-loaded.log.
#
# Usage: instructions-log.sh <matcher-label>
#
# WHY: this workspace's guidance is retrieval-limited, not content-limited, and
# until 2026-08-31 nothing here had ever OBSERVED which rules reach a session.
# Two open questions both need this: (a) do path-scoped rules fire on files
# inside worktrees/<name>/ (the premise of the glob migration), and (b) why do
# harness-tools.md and native-permissions.md load at turn zero of sessions that
# touch none of their paths — seen four times, cause unexplained.
#
# Purely observational: reads stdin, writes a line, exits 0 always. A hook that
# can fail is a hook that can break a session, and this one is worth nothing if
# it costs anything.
#
# FOUR FIELDS, and each is load-bearing:
#   1  timestamp
#   2  the MATCHER LABEL, passed as $1 by settings.json. It is NOT read from the
#      payload: the InstructionsLoaded stdin schema is undocumented, so a payload
#      field named "reason" may or may not exist. Without this argument the two
#      registrations write indistinguishable lines and Step 4 cannot be answered
#      at all — which is the bug this comment exists to prevent recurring.
#   3  the session's PROJECT ROOT. This is what separates cause (a) from cause
#      (b) in the task header: a root ending in /worktrees/<name> means the
#      session never had access to .claude/rules/ in the first place, and no
#      glob rewrite would have helped.
#   4  stdin, VERBATIM and newline-flattened. Deliberately reaches for no field
#      names. Record what the fields actually are here once you have seen one:
#        observed fields: <fill in after the first run>
set -uo pipefail
LABEL="${1:-unlabelled}"
LOG="${HOME}/.claude/instructions-loaded.log"
mkdir -p "$(dirname "$LOG")" 2>/dev/null
PAYLOAD="$(cat 2>/dev/null | tr '\n\t' '  ')"   # drained even if the write fails
printf '%s\t%s\t%s\t%s\n' \
  "$(date -Is)" "$LABEL" "${CLAUDE_PROJECT_DIR:-?}" "$PAYLOAD" \
  >> "$LOG" 2>/dev/null
exit 0
EOF
chmod +x .claude/hooks/instructions-log.sh
```

Wire it in `.claude/settings.json` alongside the existing `SessionStart` and
`PreToolUse` entries. Register it **twice**, on the two matchers this plan needs
— they answer two different questions, and each registration passes its own
label so the single log file stays readable:

```json
"InstructionsLoaded": [
  { "matcher": "path_glob_match",
    "hooks": [{ "type": "command",
      "command": "bash \"${CLAUDE_PROJECT_DIR}/.claude/hooks/instructions-log.sh\" path_glob_match",
      "timeout": 5 }] },
  { "matcher": "session_start",
    "hooks": [{ "type": "command",
      "command": "bash \"${CLAUDE_PROJECT_DIR}/.claude/hooks/instructions-log.sh\" session_start",
      "timeout": 5 }] }
]
```

`path_glob_match` is the Task 3 question (does a rule fire on a worktree file);
`session_start` is the turn-zero question in Step 4. Confirm the file still
parses before relying on it — a broken `settings.json` fails silently:

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('settings.json parses')"
```

- [ ] **Step 3: Capture the BEFORE state — the whole point of doing this first**

Open a session, read a test file **inside a worktree**, and read the same file's
counterpart under `youcoded/`:

```bash
ls worktrees/*/desktop/tests/*.test.ts | head -1     # the worktree spelling
ls youcoded/desktop/tests/*.test.ts | head -1        # the workspace spelling
```

Then check what loaded, and read **field 3** (the project root) on every line as
carefully as you read the rule name:

```bash
rg 'test-suite-hygiene' ~/.claude/instructions-loaded.log | tail -5
awk -F'\t' '{print $2, $3}' ~/.claude/instructions-loaded.log | sort -u | tail -10
```

This is a genuine gate with **four** possible readings, not a formality. Take the
one that matches, and do not proceed to Task 3 out of momentum:

| What the log shows | What it means | What to do |
|---|---|---|
| Loads for the `youcoded/` path, **not** for the `worktrees/` path; project root is the workspace | **Cause (a).** Task 3's premise is confirmed | Proceed to Task 3 |
| Loads for **both** paths | Task 3's premise is wrong; the glob shape was never the problem | Stop. Record the finding, re-scope |
| Loads for **neither**, and field 3 ends in `/worktrees/<name>` | **Cause (b)** — the session was rooted inside the worktree and no rules were reachable at all | Stop. Task 3 fixes nothing here; the real work is getting a `.claude` into worktrees. File it and re-scope |
| Loads for **neither**, and field 3 is the workspace root | **Cause (c) or an undocumented mechanism** — the matcher may be skipping gitignored paths (`worktrees/` is ignored at `.gitignore:55`) | Stop. Test it: copy one test file to a *tracked* path with the same shape and see whether the rule fires there. If it does, the migration cannot help and the answer is a worktree layout change |

Whichever it is, **write it down before doing anything else**. A measured
negative is a better outcome for this plan than an unmeasured migration.

- [ ] **Step 4: Look at the turn-zero question while you have the instrument**

```bash
rg 'harness-tools|native-permissions' ~/.claude/instructions-loaded.log | head -20
```

Field 2 (the matcher label) separates the answer for you. If those rules appear
under `session_start`, they are being loaded as session-launch instructions and
the "eager rule" classification is wrong somewhere — check whether their `paths:`
blocks parse (`parseRuleFrontmatter` treats an off-schema block as an error, and
a rule with zero parsed paths reads as eager). Note that `harness-tools.md` is
the only rule with **comment lines inside its `paths:` block**, which makes it
the obvious suspect for a parser difference — but `native-permissions.md` has a
completely clean block and loads too, so a comment cannot be the whole story.

If they appear under `path_glob_match` with no file touched, the matcher itself
is doing something undocumented.

Two causes are already ruled out (see this task's header): it is not the
SessionStart hook naming their files, and it is not modification time. Do not
spend the session re-testing those.

Either way, record the log excerpt. A four-month-old "cause unexplained" becomes
either a fixable rule-frontmatter bug or a `ROADMAP.md` `bug` entry tagged
`#docs` with evidence attached — both strictly better than the prose speculation
they replace.

- [ ] **Step 5: Commit**

```bash
git status --porcelain .claude/          # look before you stage
git add .claude/hooks/instructions-log.sh .claude/settings.json
git commit -m "feat(hooks): log which instruction files actually load

This workspace's stated problem is retrieval, and nothing in it had ever
measured retrieval. Two open questions need the same instrument: whether
path-scoped rules fire inside worktrees/<name>/, and why two rules load at
turn zero of sessions that touch none of their paths (four sightings, cause
unexplained). The line records the matcher label and the session's project
root as well as the payload — without those two fields the log cannot tell a
repo-prefixed glob from a session that had no rules directory at all.
Observational only — exits 0 unconditionally."
```

---

## Task 3: Rule globs match inside worktrees

**Why:** `CLAUDE.md` directs all non-trivial work into `worktrees/<name>/`. Rule
globs are matched relative to the project root, so `youcoded/desktop/**` cannot
match `worktrees/session-motion/desktop/**`. 115 of 133 glob entries are blind
inside a worktree — for exactly the work the workspace mandates.
`.claude/rules/code-search.md` already solved this on 2026-08-05 with a leading
`**/`; this finishes that migration and adds the guard that stops it regressing.

**Do not start this task until Task 2 Step 3 has confirmed the premise** — and it
must be cause (a) specifically, not merely "something is wrong".

**The auditor measures glob SHAPE; only Task 2's log measures harness BEHAVIOUR.
Never let one stand in for the other.** `globToRegex` is, by its own comment,
*"just enough glob"*: `**` becomes `.*` with no directory-boundary awareness, and
`**/foo` cannot match a bare `foo` at the root because the regex demands a
leading slash. Claude Code's matcher is a different implementation with different
edge cases. Every number in Steps 1, 8 and 11 is therefore a statement about what
the glob *can* address; Step 12 is the only step that shows the harness *did*
load it. Both are needed and neither substitutes.

**Files:**
- Modify: `scripts/audit-anchors.mjs` (new export `worktreeBlindGlobs`, wired into `main()`)
- Modify: `scripts/audit-anchors.test.mjs`
- Modify: 22 files under `.claude/rules/`, plus `.claude/rules/README.md`

**Interfaces:**
- Produces: `worktreeBlindGlobs(rules, trackedFiles) → { blind, exempt, overmatch }`
  where `rules` is the array `main()` already builds (`{name, file, fm, text}`)
  and `trackedFiles` is the output of the existing `listTrackedFiles(root)`.

### Design decisions, settled

**Why `**/` and not `{youcoded,worktrees/*}/`.** Claude Code supports brace
expansion, and `{youcoded,worktrees/*}/desktop/**` would be *more* precise — it
cannot reach either of the two cross-repo files the relaxation picks up
(`wecoded-marketplace/worker/src/app/routes.ts`, `youcoded-core/docs/index.html`).
It is rejected anyway, for two reasons: the
auditor's own `globToRegex` (`scripts/audit-anchors.mjs:155`) escapes `{` and
`}` as literal characters, so braces would silently break the existing "every
glob matches ≥1 tracked file" check; and `**/` has in-repo precedent from
2026-08-05. **If the over-match ever costs something real, the brace form is the
upgrade path — but `globToRegex` must learn braces first.**

**Nothing is pinned. All 115 blind globs relax.** The first two drafts held back
the four `youcoded/docs/**` globs, on the belief that `**/docs/**` would fire the
landing-page rule on the workspace's own 1,332 `docs/` files. That belief was
never measured and is false: the four globs are `docs/index.html`,
`docs/media/**`, `docs/site/**` and `docs/gallery/**`, and the workspace has no
`docs/media`, no `docs/site` and no `docs/gallery` directory. Measured, relaxing
all four reaches **one** extra tracked file in the whole workspace —
`youcoded-core/docs/index.html`, in the repo scheduled for archival. Step 2
re-measures this; do not take it on faith.

**The `# repo-pinned` escape hatch is still built, and deliberately used by
nothing.** `blind` becomes a *failure condition*, so a future rule that genuinely
must keep a repo prefix needs a documented way to say so or the audit goes
permanently red — which is the class of defect that made the first draft
unshippable. It is four lines in `worktreeBlindGlobs` plus one unit test, and it
stays. What does **not** stay is the ceremony the second draft built around it: a
pinning pass, a hard gate on the exempt count, and a README paragraph teaching a
marker no rule uses. Build the hatch, document it in one clause, pin nothing.

- [ ] **Step 1: Re-measure the baseline before changing anything**

```bash
cd /home/destin/youcoded-dev && cat > /tmp/census.mjs <<'EOF'
import fs from 'node:fs';
// Absolute: the script lives in /tmp, so a './scripts/...' import would resolve
// against /tmp, not the repo. cwd-relative fs paths below are fine — you run
// this from the repo root.
import { parseRuleFrontmatter } from '/home/destin/youcoded-dev/scripts/audit-anchors.mjs';
const REPOS=['youcoded','youcoded-core','youcoded-admin','wecoded-themes','wecoded-marketplace'];
let total=0, blind=0; const files=new Set(), buckets={};
for (const f of fs.readdirSync('.claude/rules').filter(f=>f.endsWith('.md')&&f!=='README.md')) {
  const fm = parseRuleFrontmatter(fs.readFileSync('.claude/rules/'+f,'utf8'));
  if (!fm) { console.log('NO FRONTMATTER:', f); continue; }
  total += fm.paths.length;
  for (const g of fm.paths) {
    const k = g==='**' ? '** (eager)' : g.startsWith('**/') ? '**/ (safe)' : g.split('/').slice(0,2).join('/');
    buckets[k] = (buckets[k]||0)+1;
    const [head,...rest] = g.split('/');
    if (g==='**' || head==='**' || !REPOS.includes(head)) continue;
    if (rest.length===1 && rest[0]==='**') continue;
    blind++; files.add(f);
  }
}
console.log('total', total, '· blind', blind, 'across', files.size, 'files');
Object.entries(buckets).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  '+String(v).padStart(4)+'  '+k));
EOF
node /tmp/census.mjs
```

Recorded 2026-08-31: `total 133 · blind 115 across 22 files`, with 99
`youcoded/desktop`, 13 `**/ (safe)`, 6 `youcoded/app`, 4 `youcoded/docs`, and 11
others.

**If your numbers differ, use yours.** They are the truth; the table above is a
dated snapshot. Do not stop to reconcile against it — the first draft of this
plan hard-gated on a constant and stalled here.

- [ ] **Step 2: Measure the blast radius BEFORE relaxing anything**

The one thing that could make this migration a bad trade is a relaxed glob
reaching files it should not. Measure it rather than arguing about it — this is
the step whose absence let two drafts pin four globs for no reason.

```bash
cd /home/destin/youcoded-dev && cat > /tmp/blast.mjs <<'EOF'
// For every blind glob, apply the "**/" relaxation and report (1) any glob that
// would then match NOTHING, and (2) any glob that would reach outside its own
// sub-repo. Absolute import: the script lives in /tmp.
import fs from 'node:fs';
import { parseRuleFrontmatter, globToRegex, listTrackedFiles, REPOS }
  from '/home/destin/youcoded-dev/scripts/audit-anchors.mjs';
const tracked = listTrackedFiles('.');
let n = 0; const zero = [], over = [];
for (const f of fs.readdirSync('.claude/rules').filter(f => f.endsWith('.md') && f !== 'README.md')) {
  for (const g of parseRuleFrontmatter(fs.readFileSync('.claude/rules/' + f, 'utf8')).paths) {
    const [head, ...rest] = g.split('/');
    if (g === '**' || head === '**' || !REPOS.includes(head)) continue;
    if (rest.length === 1 && rest[0] === '**') continue;
    const fix = ['**', ...rest].join('/'); n++;
    const hits = tracked.filter(x => globToRegex(fix).test(x));
    if (!hits.length) { zero.push(`${f}: ${g} -> ${fix}`); continue; }
    const outside = hits.filter(x => !x.startsWith(head + '/'));
    if (outside.length) over.push(`${f}: ${g} -> ${fix}  (+${outside.length}: ${outside.slice(0, 3).join(', ')})`);
  }
}
console.log(`relaxed globs checked: ${n}`);
console.log(`\nwould match NOTHING after relaxing (${zero.length}):`); zero.forEach(s => console.log('  ' + s));
console.log(`\nwould reach OUTSIDE their own repo (${over.length}):`); over.forEach(s => console.log('  ' + s));
EOF
node /tmp/blast.mjs
```

Recorded 2026-08-31: **115 checked, 0 match nothing, 2 reach outside their repo** —

```
android-runtime.md: youcoded/app/**        -> **/app/**         (+1: wecoded-marketplace/worker/src/app/routes.ts)
landing-page.md:    youcoded/docs/index.html -> **/docs/index.html (+1: youcoded-core/docs/index.html)
```

Two files, out of 4,363. Both cost is that editing that one file loads one extra
rule. **If your run shows a glob matching nothing, or an over-match into the
hundreds, stop and pin that glob** with a trailing `# repo-pinned` comment (the
mechanism exists precisely for this) — but do not pin pre-emptively. The whole
point of this step is that "it might over-match" was asserted twice and measured
never.

`parseRuleFrontmatter` tolerates a trailing comment on a quoted glob
(`scripts/audit-anchors.mjs:71`), so a `# repo-pinned` marker parses cleanly —
confirmed by the census script above, which reads the same parser.

- [ ] **Step 3: Write the failing tests**

Append to `scripts/audit-anchors.test.mjs`:

```javascript
import { worktreeBlindGlobs } from './audit-anchors.mjs';

const RULE = (name, paths, text = '') => ({ name, file: `.claude/rules/${name}.md`, fm: { paths }, text });

test('worktreeBlindGlobs: a repo-prefixed glob cannot match the worktree spelling', () => {
  const r = worktreeBlindGlobs(
    [RULE('test-suite-hygiene', ['youcoded/desktop/tests/**/*.test.ts'])],
    ['youcoded/desktop/tests/game-reducer.test.ts'],
  );
  assert.equal(r.blind.length, 1);
  assert.equal(r.blind[0].rule, 'test-suite-hygiene');
  assert.equal(r.blind[0].fix, '**/desktop/tests/**/*.test.ts');
  assert.deepEqual(r.exempt, []);
});

test('worktreeBlindGlobs: a "**/" glob matches both spellings and is not blind', () => {
  const r = worktreeBlindGlobs(
    [RULE('code-search', ['**/desktop/src/main/ipc-handlers.ts'])],
    ['youcoded/desktop/src/main/ipc-handlers.ts'],
  );
  assert.deepEqual(r.blind, []);
  assert.deepEqual(r.exempt, []);
});

test('worktreeBlindGlobs: the deliberate eager glob is exempt, with a reason', () => {
  const r = worktreeBlindGlobs([RULE('live-app-safety', ['**'])], ['anything.ts']);
  assert.deepEqual(r.blind, []);
  assert.equal(r.exempt.length, 1);
  assert.match(r.exempt[0].reason, /eager/);
});

test('worktreeBlindGlobs: a whole-repo glob is exempt — relaxing it would make it eager', () => {
  const r = worktreeBlindGlobs([RULE('registries', ['wecoded-themes/**'])], ['wecoded-themes/a.json']);
  assert.equal(r.exempt.length, 1);
  assert.match(r.exempt[0].reason, /whole-repo/);
});

test('worktreeBlindGlobs: a workspace-root glob is exempt — worktrees are of the SUB-repos', () => {
  const r = worktreeBlindGlobs([RULE('landing-page', ['scripts/ui-review/**'])], ['scripts/ui-review/run.sh']);
  assert.equal(r.exempt.length, 1);
  assert.match(r.exempt[0].reason, /workspace-root/);
});

// The escape hatch. NO RULE USES IT TODAY — it exists because `blind` fails the
// run, so a future glob that must keep its repo prefix needs a way to say so or
// the audit goes permanently red. This test is what keeps the hatch working
// while nothing exercises it in the tree.
test('worktreeBlindGlobs: a "# repo-pinned" glob is exempt, not blind', () => {
  // A synthetic rule, not one in the tree: no rule pins anything today, and this
  // test is what keeps the unused hatch working.
  const rule = RULE('some-future-rule', ['youcoded/desktop/only-here/**'],
    '---\npaths:\n  - "youcoded/desktop/only-here/**"   # repo-pinned\n---\n');
  const r = worktreeBlindGlobs([rule], ['youcoded/desktop/only-here/a.ts']);
  assert.deepEqual(r.blind, []);
  assert.equal(r.exempt.length, 1);
  assert.match(r.exempt[0].reason, /repo-pinned/);
});

test('worktreeBlindGlobs: reports what a relaxed glob picks up outside its own repo', () => {
  const r = worktreeBlindGlobs(
    [RULE('android-runtime', ['**/app/**'])],
    ['youcoded/app/src/Main.kt', 'wecoded-marketplace/worker/src/app/routes.ts'],
  );
  assert.deepEqual(r.blind, []);
  assert.equal(r.overmatch.length, 1);
  assert.deepEqual(r.overmatch[0].files, ['wecoded-marketplace/worker/src/app/routes.ts']);
});
```

- [ ] **Step 4: Run the tests and confirm they fail**

```bash
cd /home/destin/youcoded-dev && node --test scripts/audit-anchors.test.mjs
```

Expected: 7 failures, all `does not provide an export named 'worktreeBlindGlobs'`.

- [ ] **Step 5: Implement `worktreeBlindGlobs`**

Add to `scripts/audit-anchors.mjs`, immediately after the existing
`affectedSubsystems` export:

```javascript
// A rule glob is "worktree-blind" when it names a sub-repo by its workspace path
// (`youcoded/desktop/...`) and therefore cannot match the same file inside a
// worktree (`worktrees/<name>/desktop/...`).
//
// WHY this exists: CLAUDE.md sends all non-trivial work into worktrees/<name>/,
// and Claude Code matches rule globs relative to the PROJECT ROOT. So on
// 2026-08-31, 115 of 133 glob entries were silently dead for exactly the work
// the workspace mandates. `.claude/rules/code-search.md` had already found the
// fix (a leading `**/`) on 2026-08-05 and nobody generalised it.
//
// SCOPE, so a later reader does not over-trust this: it checks the SHAPE of a
// glob against tracked files, using this file's deliberately-simple globToRegex.
// It cannot tell you what Claude Code's matcher actually loaded — that is the
// instruction-load hook in .claude/hooks/instructions-log.sh.
//
// Exemptions are NAMED AND COUNTED, never silent, and there are four kinds. The
// last one — an explicit `# repo-pinned` comment — is an ESCAPE HATCH THAT NO
// RULE CURRENTLY USES: `blind` FAILS THE RUN, so a glob that must keep its repo
// prefix needs a way to say so or the audit stays red forever. It is here for
// the first rule that needs it, not for any that exist. (Two drafts of the plan
// pinned four globs believing they needed it; measured, relaxing all four
// reached one extra file in the whole workspace.)
//
// `fix` is the exact replacement string, so the migration below has no second
// table of prefixes to drift out of sync with this function.
export function worktreeBlindGlobs(rules, trackedFiles) {
  const blind = [], exempt = [], overmatch = [];
  for (const rule of rules) {
    for (const glob of rule.fm.paths) {
      if (glob === '**') {
        exempt.push({ rule: rule.name, glob, reason: 'the deliberate eager glob' });
        continue;
      }
      const [head, ...rest] = glob.split('/');
      if (head === '**') {
        // Already worktree-safe. Report anything it reaches outside its own repo
        // so a relaxation's blast radius is a visible number, not a surprise.
        const re = globToRegex(glob);
        const hits = trackedFiles.filter(f => re.test(f));
        const repos = new Set(hits.map(f => f.split('/')[0]));
        if (repos.size > 1) {
          const count = r => hits.filter(f => f.startsWith(r + '/')).length;
          const main = [...repos].sort((a, b) => count(b) - count(a))[0];
          overmatch.push({ rule: rule.name, glob, files: hits.filter(f => !f.startsWith(main + '/')) });
        }
        continue;
      }
      if (!REPOS.includes(head)) {
        exempt.push({ rule: rule.name, glob, reason: 'workspace-root path — worktrees are of the sub-repos' });
        continue;
      }
      if (rest.length === 1 && rest[0] === '**') {
        exempt.push({ rule: rule.name, glob, reason: 'whole-repo glob — relaxing it would make the rule eager' });
        continue;
      }
      // An explicit opt-out, read from the rule's own source line.
      const pinned = new RegExp(`^\\s*-\\s*"${glob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*#.*repo-pinned`, 'm');
      if (rule.text && pinned.test(rule.text)) {
        exempt.push({ rule: rule.name, glob, reason: 'repo-pinned by an explicit comment in the rule' });
        continue;
      }
      blind.push({ rule: rule.name, glob, fix: ['**', ...rest].join('/') });
    }
  }
  return { blind, exempt, overmatch };
}
```

Note what is *not* here: the first draft built a `worktrees/probe/...` string and
asked whether the glob matched it. For a repo-prefixed glob that answer is always
no — the glob starts with `youcoded/`, the probe with `worktrees/` — so the test
could never fail and proved nothing. A guard that cannot fail is the defect
Theme B of the source investigation is about; do not reintroduce it.

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
cd /home/destin/youcoded-dev && node --test scripts/audit-anchors.test.mjs
```

- [ ] **Step 7: Wire the check into the report**

In `main()`, immediately after the existing block `// 4. every rule glob must
still match >=1 tracked file`:

```javascript
  // 4b. every rule glob must ALSO match its file inside a worktree — see
  // worktreeBlindGlobs above for why that is not optional in this workspace.
  result.worktreeGlobs = worktreeBlindGlobs(rules, tracked);
```

In `printHuman(r)`, after `dump('rule globs matching nothing', r.ruleGlobs.failed);`:

```javascript
  dump('worktree-blind rule globs (these never fire on work done in worktrees/)',
       r.worktreeGlobs.blind.map(b => `${b.rule}: ${b.glob}  →  ${b.fix}`));
  console.log(`worktree-safe globs: ${r.worktreeGlobs.blind.length} blind · `
    + `${r.worktreeGlobs.exempt.length} exempt (named) · `
    + `${r.worktreeGlobs.overmatch.length} reaching outside their repo`);
```

And extend `result.ok`:

```javascript
  result.ok = !result.anchors.failed.length && !result.mapPaths.missing.length
    && !result.ruleGlobs.failed.length && !result.budgets.violations.length
    && !result.worktreeGlobs.blind.length;
```

- [ ] **Step 8: Run the auditor and read the real number**

```bash
cd /home/destin/youcoded-dev && node scripts/audit-anchors.mjs 2>&1 | rg 'worktree'
```

Expected: a blind count matching Step 1's census exactly — **115** on 2026-08-31
— and `5 exempt (named)` (1 eager, 1 workspace-root, 3 whole-repo). Nothing is
pinned, so the two numbers agree with the census with no arithmetic in between.
If they disagree, the check and the census are reading the tree differently and
that must be understood before anything is rewritten.

- [ ] **Step 9: Migrate, using the check's own `fix` field**

There is no separate table of prefixes. The function that decides what is broken
also states the repair, so the two cannot disagree.

```bash
cd /home/destin/youcoded-dev && cat > /tmp/migrate.mjs <<'EOF'
// One-shot: rewrite ONLY the paths: block of each rule, using the `fix` string
// worktreeBlindGlobs already computed. verify: anchors are deliberately
// untouched — the auditor resolves those from the workspace root, where the
// repo prefix is correct.
import fs from 'node:fs';
import path from 'node:path';
// Absolute — see the census script above for why.
import { parseRuleFrontmatter, listTrackedFiles, worktreeBlindGlobs }
  from '/home/destin/youcoded-dev/scripts/audit-anchors.mjs';

const DIR = '.claude/rules';
const rules = fs.readdirSync(DIR).filter(f => f.endsWith('.md') && f !== 'README.md').map(f => {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  return { name: f.replace(/\.md$/, ''), file: f, fm: parseRuleFrontmatter(text), text };
}).filter(r => r.fm);

const { blind } = worktreeBlindGlobs(rules, listTrackedFiles('.'));
const byRule = new Map();
for (const b of blind) {
  if (!byRule.has(b.rule)) byRule.set(b.rule, []);
  byRule.get(b.rule).push(b);
}

let changed = 0; const written = [];
for (const rule of rules) {
  const fixes = byRule.get(rule.name);
  if (!fixes) continue;
  const lines = rule.text.split('\n');
  let inPaths = false, touched = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^paths:\s*(#.*)?$/.test(lines[i])) { inPaths = true; continue; }
    if (inPaths && /^\S/.test(lines[i])) inPaths = false;   // next top-level key ends the block
    if (!inPaths) continue;
    for (const { glob, fix } of fixes) {
      if (lines[i].includes(`"${glob}"`)) {
        lines[i] = lines[i].replace(`"${glob}"`, `"${fix}"`);
        changed++; touched = true;
        break;
      }
    }
  }
  if (touched) {
    fs.writeFileSync(path.join(DIR, rule.file), lines.join('\n'));
    written.push(path.join(DIR, rule.file));
  }
}
// The exact staging list for Step 14. .claude/rules/ holds other sessions'
// in-flight work, so the commit must stage what THIS script wrote and nothing
// else — never the directory, never "everything that differs".
fs.writeFileSync('/tmp/migrated-files.txt', written.join('\n') + '\n');
console.log(`rewrote ${changed} globs across ${written.length} rule files`);
console.log('staging list -> /tmp/migrated-files.txt');
EOF
node /tmp/migrate.mjs
```

Expected: `rewrote 115 globs across 22 rule files` — matching Step 8's blind
count exactly. **A mismatch means a glob is listed as blind but was not found in
its own paths block; investigate before continuing.** (Verified 2026-08-31 that
every glob in every rule file is double-quoted, which is what the
`includes('"' + glob + '"')` match depends on. If a future rule adds an unquoted
entry, this script skips it silently and the count is how you find out.)

- [ ] **Step 10: Verify nothing outside the `paths:` blocks moved**

```bash
xargs -a /tmp/migrated-files.txt git diff --stat --
xargs -a /tmp/migrated-files.txt git diff -- | rg '^[-+].*verify:|^[-+]\s+- (path|test):' | wc -l
```

Expected: 22 files changed; the second command prints `0`. The strings
`youcoded/desktop/…` also appear in each rule's `verify:` block, where they are
resolved from the workspace root and **must not change**.

If it is not 0, revert **only your own files** and fix the script — never
`git checkout .claude/rules/`, which would also discard another session's
uncommitted work in that directory:

```bash
xargs -a /tmp/migrated-files.txt git checkout --
```

- [ ] **Step 11: Confirm green, then clean up**

```bash
cd /home/destin/youcoded-dev
node scripts/audit-anchors.mjs > /tmp/after.txt 2>&1; echo "exit=$?"
rg 'worktree|anchors:|MAP paths' /tmp/after.txt
rm -f /tmp/migrate.mjs /tmp/census.mjs /tmp/blast.mjs /tmp/after.txt
```

Expected: `worktree-safe globs: 0 blind · 5 exempt (named) · 2 reaching outside
their repo`, `anchors: 366/366 ok`, `MAP paths: 340/340 ok`, `exit=0`.

*(`echo "exit=$?"` must come immediately after the node call — an intervening
`rg` overwrites `$?`, which is why the output is captured to a file first.)*

The two over-matches are the ones Step 2 predicted, and both are one file:

| Relaxed glob | Reaches | Consequence |
|---|---|---|
| `**/app/**` (android-runtime) | `wecoded-marketplace/worker/src/app/routes.ts` | editing that one worker file also loads the Android rule |
| `**/docs/index.html` (landing-page) | `youcoded-core/docs/index.html` | editing that one file in a repo being archived also loads the landing-page rule |

Two files out of 4,363. Leave both; they are now reported numbers rather than
hidden ones. (Every other relaxed shape was measured clean: `**/desktop/**` →
1,566 files, all under `youcoded/`; `**/worker/**` → 101, all under
`wecoded-marketplace/`; `**/docs/media|site|gallery/**` → 225, all under
`youcoded/`.)

- [ ] **Step 12: Prove the fix with the instrument from Task 2**

```bash
rg 'test-suite-hygiene' ~/.claude/instructions-loaded.log | tail -5
```

Open a session, read a test file under `worktrees/*/desktop/tests/`, and confirm
the rule now loads where Task 2 Step 3 recorded that it did not. **This is the
only step that proves the change did what it was for** — the auditor proves a
glob *can* match a worktree-shaped string; only the log proves the harness
*loaded* it.

If it still does not load, the mechanism differs from what the docs describe.
Task 3's guard is still correct but insufficient: record that as a new finding
rather than weakening the guard.

- [ ] **Step 13: Teach the schema, where the next editor will see it**

In `.claude/rules/README.md`, in the frontmatter example:

```
    paths:                       # REQUIRED — omitting it makes the rule EAGER (never do this
      - "**/desktop/src/main/sync-spaces/**"   #  except live-app-safety.md). Start the glob at
                                 #  "**/" not "youcoded/": rules are matched from the PROJECT
                                 #  root, so a "youcoded/..." glob never fires on the same file
                                 #  inside worktrees/<name>/ — which is where CLAUDE.md sends
                                 #  all non-trivial work. Guarded by audit-anchors.mjs; if a
                                 #  glob genuinely must keep its repo prefix, a trailing
                                 #  "# repo-pinned" comment exempts it (no rule needs this today).
```

- [ ] **Step 14: Commit**

The migration touched 22 rule files. Stage **exactly those 22** — not the folder,
and not "everything that differs": `.claude/rules/` routinely holds another
session's uncommitted edits, and `git diff --name-only` would sweep those in just
as surely as `git add <dir>` would. The migration script wrote the authoritative
list in Step 9; use it.

```bash
cd /home/destin/youcoded-dev
cat /tmp/migrated-files.txt                     # the 22 the script itself rewrote
git status --porcelain .claude/rules/           # anything else in here is NOT yours
xargs -a /tmp/migrated-files.txt git add
git add scripts/audit-anchors.mjs scripts/audit-anchors.test.mjs .claude/rules/README.md
git status --short                              # last look: 25 files, all yours
git commit -m "fix(rules): 115 globs never fired inside a worktree — and nothing checked

Rule paths are matched from the project root, so youcoded/desktop/** cannot
match worktrees/<name>/desktop/**. CLAUDE.md sends all non-trivial work into
worktrees, so 22 of 25 rules were silent for exactly the sessions they were
written for. code-search.md found the fix (a leading **/) on 2026-08-05; this
generalises it to all 115 and adds the guard that keeps it true.

Nothing is pinned. Measured before relaxing: 0 of the 115 stop matching, and 2
reach one file outside their own repo (**/app/** -> a worker route,
**/docs/index.html -> youcoded-core). The audit now reports both as numbers.
The '# repo-pinned' escape hatch is built and unused, so the first glob that
genuinely needs it has a way out that is not a permanently red audit.

Verified against the instruction-load log, not inferred."
```

*(As this plan was written, `.claude/rules/` held another session's modified
`ipc-bridge.md` and its untracked `artifacts.md.recovered-trim.partial.patch`.
Staging from the script's own output list is the only form that cannot take
either one.)*

```bash
rm -f /tmp/migrated-files.txt    # last user of it
```

---

## Task 4: One `android-runtime` rule, and a guard against forks

**Why:** there are **two** `android-runtime.md` rules, and they have diverged.

```bash
diff .claude/rules/android-runtime.md youcoded/.claude/rules/android-runtime.md
```

| | Workspace copy | Sub-repo copy |
|---|---|---|
| `last_verified` | 2026-07-15 | **2026-04-29** |
| glob | `youcoded/app/**` | `app/**` |
| `verify:` anchors | 4 | **none** |
| Audited by anything | yes | **never** |

Each fork holds content the other lost. The workspace copy has the R8 /
build-type parity section and the exec-permissions + `~/.netrc` git-auth
section. The sub-repo copy has the deliberate PTY-write asymmetry between
`PtyBridge` and `DirectShellBridge` (`PASTE_TIMEOUT` appears **nowhere else** in
the workspace) and the per-turn transcript metadata contract.

The sub-repo copy also does not do what it looks like it does. Claude Code
discovers `.claude/rules/` at the **project root** and recurses *within* that
directory — a session rooted at `youcoded-dev` never loads
`worktrees/<name>/.claude/rules/` or `youcoded/.claude/rules/`. That copy fires
only for a session rooted inside `youcoded/`, which is precisely why it drifted
unnoticed since April.

So this is not an audit-coverage gap to monitor; it is a duplicate to remove.
Auditing the fork would pin a stale copy in place and commit the workspace to
keeping two versions of the same knowledge in sync forever.

**Files:**
- Modify: `.claude/rules/android-runtime.md`
- Delete: `youcoded/.claude/rules/android-runtime.md` (a rule file, not source —
  the one declared exception to this plan's workspace-only scope)
- Modify: `scripts/audit-anchors.mjs`, `scripts/audit-anchors.test.mjs`

- [ ] **Step 1: Diff the two and merge what only the fork has**

Go bullet by bullet. For each item present only in the sub-repo copy, decide:

- **Still true and not recorded elsewhere** → merge into the workspace rule, or
  into `youcoded/docs/android-runtime.md` if it is depth rather than invariant.
  Verify "not recorded elsewhere" with a tree-wide search before believing it —
  e.g. the 600 ms Android split *is* already in `youcoded/docs/pty-io.md:19-21`,
  so only the "do not parity-fix `DirectShellBridge`" framing is new.
- **Superseded** → drop it, and say so in the commit message.

Watch the workspace rule's word budget while merging:

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('.claude/rules/android-runtime.md','utf8');
console.log((t.replace(/^---\n[\s\S]*?\n---\n?/,'').match(/\S+/g)||[]).length)"
```

Must stay ≤600. Depth goes to `youcoded/docs/android-runtime.md`.

- [ ] **Step 2: Delete the fork**

```bash
cd /home/destin/youcoded-dev/youcoded
git rm .claude/rules/android-runtime.md
```

**This is a `youcoded` repo change, it needs its own PR there, and that PR must
MERGE FIRST.** Not "should" — the CI workflow clones `youcoded` fresh from master
on every run (`.github/workflows/workspace-ci.yml` → *Clone public sub-repos*),
so the moment Step 4 adds `strayRuleDirs` to `result.ok`, every workspace CI run
goes red until that file is gone from `youcoded`'s master.

That directly violates this plan's own Global Constraint — *no new gate may leave
the audit permanently red* — and undoes Task 1. So the order is fixed:

1. Open and merge the `youcoded` PR deleting the fork.
2. `bash setup.sh` (or `git -C youcoded pull`) so the local clone agrees.
3. Confirm it is gone: `ls youcoded/.claude/rules/ 2>&1` should report no such
   directory.
4. Only then commit Steps 3–4 in the workspace PR.

If the `youcoded` PR stalls, ship Task 4's merge-and-delete (Step 1) and **hold
back the `strayRuleDirs` guard** for a follow-up. A merged fork with no guard is
fine; a guard with no merge is a red CI.

- [ ] **Step 3: Write the failing test**

Append to `scripts/audit-anchors.test.mjs`. **The import line is required** — the
file's existing import block names only five functions, and CI runs this suite
first and fail-fast, so a missing import takes the whole run down:

```javascript
import { strayRuleDirs } from './audit-anchors.mjs';   // fs, os, path already imported at the top

test('strayRuleDirs: a .claude/rules directory inside a sub-repo is reported', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-stray-'));
  fs.mkdirSync(path.join(tmp, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'youcoded', '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'youcoded', '.claude', 'rules', 'x.md'), '---\npaths:\n  - "app/**"\n---\n');
  const stray = strayRuleDirs(tmp);
  assert.deepEqual(stray, [{ repo: 'youcoded', files: ['x.md'] }]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('strayRuleDirs: no sub-repo rule dirs is the clean case', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-stray-'));
  fs.mkdirSync(path.join(tmp, '.claude', 'rules'), { recursive: true });
  assert.deepEqual(strayRuleDirs(tmp), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 4: Implement `strayRuleDirs` and fail the run on it**

```javascript
// A .claude/rules/ directory inside a sub-repo is never loaded by a session
// rooted at the workspace, so it cannot be reached, cannot be audited from here,
// and silently forks whatever it duplicates.
//
// WHY: youcoded/.claude/rules/android-runtime.md sat at last_verified 2026-04-29
// with no verify: block for four months, diverging in both directions from the
// workspace copy of the same rule. Nothing could have noticed.
export function strayRuleDirs(root) {
  const out = [];
  for (const repo of REPOS) {
    const dir = path.join(root, repo, '.claude', 'rules');
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    if (files.length) out.push({ repo, files });
  }
  return out;
}
```

Wire into `main()` and `result.ok`, and report it in `printHuman`:

```javascript
  result.strayRules = strayRuleDirs(root);
```
```javascript
  dump('rule files in a sub-repo (never loaded from the workspace — a silent fork)',
       r.strayRules.flatMap(s => s.files.map(f => `${s.repo}/.claude/rules/${f}`)));
```

- [ ] **Step 5: Verify**

```bash
cd /home/destin/youcoded-dev && node --test scripts/audit-anchors.test.mjs && node scripts/audit-anchors.mjs; echo "exit=$?"
```

Expected: tests pass and `exit=0`. If it is red on `strayRuleDirs`, the `youcoded`
PR from Step 2 has not merged and pulled yet — **go back and finish that before
committing**, per the ordering there. Do not commit a check you know is red.

- [ ] **Step 6: Commit**

```bash
git status --porcelain scripts/ .claude/rules/     # look before you stage
git add scripts/audit-anchors.mjs scripts/audit-anchors.test.mjs .claude/rules/android-runtime.md
git commit -m "fix(rules): two android-runtime rules had been diverging since April

youcoded/.claude/rules/android-runtime.md (last_verified 2026-04-29, no verify:
block) is never loaded by a workspace-rooted session, so nothing could audit it
and nothing did. Each copy held content the other had lost. Merged the unique
half, deleted the fork, and added a check that fails on any .claude/rules/
directory below the workspace root so a second one cannot appear silently."
```

---

## Task 5: Make the diff-scope signal readable

**Why:** the auditor already answers Theme D's "does anything detect a subsystem
with no rule?" — it prints `changed code files matching NO rule (607, first 20)`.
It is useless because it diffs against the only report carrying `verified_shas`,
dated 2026-07-15 (47 days of churn, 3,191 files), and because it counts archived
prototypes and test fixtures as uncovered code. 607 is a number nobody reads.

**The bigger lever is Step 4, not the filter.** A fresh baseline alone collapses
3,191 changed files to a few days' worth; the filter is polish on top.

**Files:**
- Modify: `scripts/audit-anchors.mjs`, `scripts/audit-anchors.test.mjs`
- Create: `docs/audits/2026-08-31-retrieval-repair.md`

- [ ] **Step 1: Write the failing test**

**The import line is required** for the same reason as Task 4's —
`affectedSubsystems` is not in the test file's existing import block, and CI gates
everything on this suite:

```javascript
import { affectedSubsystems } from './audit-anchors.mjs';   // globToRegex is already imported

test('affectedSubsystems: archives, prototypes and fixtures are counted as expected-uncovered', () => {
  const rules = [{ name: 'r', globs: [globToRegex('**/desktop/src/**')] }];
  const r = affectedSubsystems(rules, [
    'youcoded/desktop/src/main/x.ts',
    'docs/archive/prototypes/2026-07-22-buddy/main.js',
    'scripts/ast-grep/fixtures/atomic-write.ts',
    'flappy-bird/game.js',
    'youcoded/desktop/src/main/brand-new-subsystem.ts',
  ]);
  assert.deepEqual(r.affected, ['r']);
  assert.equal(r.uncoveredExpected, 3);
  assert.deepEqual(r.uncovered, []);
});
```

- [ ] **Step 2: Implement the filter**

Above `affectedSubsystems`:

```javascript
// Paths that legitimately match no rule. Counted and reported, never silently
// dropped — the whole point of the "files matching NO rule" signal is that a
// shipped subsystem with no rule shows up in it, and 607 rows of archived
// prototypes is how that signal got ignored.
//
// NOT listed here on purpose: .claude/hooks/**. Those are real, tested code
// (context-inject.test.mjs, glob-guard.test.mjs, both run by CI) and belong in
// the signal.
export const NO_RULE_EXPECTED = [
  /^docs\/archive\//,
  /^docs\/active\/prototypes\//,
  /^scripts\/ast-grep\/fixtures\//,
  /^flappy-bird\//,
];
```

and in `affectedSubsystems`, replace the return:

```javascript
  const uncoveredAll = changedFiles.filter(f => !covered.has(f));
  const uncovered = uncoveredAll.filter(f => !NO_RULE_EXPECTED.some(re => re.test(f)));
  return {
    affected: [...affected].sort(),
    uncovered,
    uncoveredExpected: uncoveredAll.length - uncovered.length,
  };
```

In `main()`:

```javascript
      const { affected, uncovered, uncoveredExpected } = affectedSubsystems(compiled, changed);
      result.diffScope = {
        baseReport: path.relative(root, report.file).replaceAll('\\', '/'),
        changedCount: changed.length,
        affected,
        uncoveredCode: uncovered.filter(f => CODE_EXT.test(f)),
        uncoveredExpected,
        notes,
      };
```

and in `printHuman(r)`:

```javascript
      console.log(`  changed code files matching NO rule (${r.diffScope.uncoveredCode.length}`
        + `, plus ${r.diffScope.uncoveredExpected} in archives/prototypes/fixtures — expected):`);
```

- [ ] **Step 3: Run and confirm the tests pass**

```bash
cd /home/destin/youcoded-dev && node --test scripts/audit-anchors.test.mjs
```

- [ ] **Step 4: Write a fresh baseline so the diff window is days, not months**

```bash
cd /home/destin/youcoded-dev
for r in workspace youcoded youcoded-core youcoded-admin wecoded-themes wecoded-marketplace; do
  d=$([ "$r" = workspace ] && echo . || echo "$r")
  printf '  %s: %s\n' "$r" "$(git -C "$d" rev-parse HEAD)"
done
```

Create `docs/audits/2026-08-31-retrieval-repair.md`:

```markdown
---
date: 2026-08-31
scope: Workspace retrieval repair — audit budgets, rule globs, load measurement, close-out
residue: 0
verified_shas:
  <paste the six lines printed above>
---

# Audit baseline — 2026-08-31

This report exists to reset the diff window. The previous and only baseline was
2026-07-15, so every `/audit` run since had been re-scoping 47 days and 3,191
changed files, and reporting 607 files as "matching no rule" — a number large
enough that nobody read it.

## Residue

None. The four budget violations that stood on 2026-08-31 were fixed in the same
change (see `docs/active/plans/2026-08-31-workspace-retrieval-repair.md`).
```

- [ ] **Step 5: Read what the signal now says**

```bash
cd /home/destin/youcoded-dev && node scripts/audit-anchors.mjs 2>&1 | rg -A10 'matching NO rule'
```

Expected: a single- or low-double-digit count. Every file it lists is a real
"shipped code with no rule covering it" candidate — **read them**, and either add
the path to an existing rule or note why none applies. A short list you skim is
the deliverable here; the count going down is not.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-anchors.mjs scripts/audit-anchors.test.mjs docs/audits/2026-08-31-retrieval-repair.md
git commit -m "fix(audit): the 'no rule covers this' signal was 607 rows of archived prototypes

The detector for 'a subsystem shipped without a rule' already existed and was
unreadable: it diffed against the only SHA baseline in the repo (2026-07-15) and
counted archives and fixtures as uncovered code."
```

---

## Task 6: `scripts/close-out.sh` — the sequence, executed

**Why:** closing out the arcade required eleven steps across two repos and the
workspace, several of which were nearly missed and recovered only by re-reading
`CLAUDE.md` mid-task. `superpowers:finishing-a-development-branch` covers the
generic git half and none of the workspace half: that `wecoded-marketplace`
auto-deploys its Worker on merge, that lifecycle docs move `docs/active/` →
`docs/archive/`, or that the ROADMAP item and the `docs/MAP.md` row are part of
"done".

**Design notes:**

- **It reports; it does not mutate.** Half the sequence needs judgement (which
  docs to archive, what the MAP row should say), and a script that guesses at
  those would be worse than none.
- **Every check is scoped to the branch being closed.** An earlier draft of this
  plan proposed a workspace-wide "dead branch names in `docs/active/**`" check in
  the auditor. Measured against the real tree it produced **78 warnings across 40
  branches** on its first run — including `feat/session-strip-motion`, which is
  live right now with a worktree and uncommitted work but has never been pushed,
  and `docs/test-blocking-relay.js`, a file path that matched the branch-name
  pattern. A plan whose central complaint is unread numbers must not ship a new
  one. Scoped to one branch, at the moment you are closing it, the same idea is
  useful and quiet — which is why it lives here.
- **It always exits 0.** It is advisory; nothing should gate on it.

**Files:**
- Create: `scripts/close-out.sh`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the script**

```bash
cat > scripts/close-out.sh <<'EOF'
#!/usr/bin/env bash
# Close-out report for a merged branch. READ-ONLY — it changes nothing, and it
# ALWAYS EXITS 0. It is advisory; do not gate anything on its exit code.
#
# Usage: bash scripts/close-out.sh <branch> [<repo-dir>]
#   e.g. bash scripts/close-out.sh feat/games-arcade-shell youcoded
#
# WHY: closing out the games arcade on 2026-08-31 took eleven steps across two
# repos and the workspace, and several were nearly missed. The generic
# finishing-a-development-branch skill covers the git half and none of the
# workspace half. This prints the whole checklist with an answer beside each line.
#
# Every check is scoped to the branch you name. A workspace-wide version of the
# docs checks was tried and rejected: it produced 78 warnings on its first run,
# including a live-but-never-pushed branch and a file path that looked like one.
set -uo pipefail

BRANCH="${1:-}"
REPO="${2:-youcoded}"
WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -z "$BRANCH" ]] && { echo "usage: bash scripts/close-out.sh <branch> [<repo-dir>]"; exit 0; }
REPO_DIR="$WORKSPACE/$REPO"
[[ -d "$REPO_DIR/.git" ]] || { echo "close-out: no git repo at $REPO_DIR"; exit 0; }

pass() { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
fail() { printf '  \033[31mTODO\033[0m %s\n' "$1"; FAILED=$((FAILED+1)); }
note() { printf '  --   %s\n' "$1"; }
FAILED=0

echo "Close-out: $BRANCH in $REPO"
echo
echo "Git"

git -C "$REPO_DIR" fetch origin --quiet 2>/dev/null

SHA=$(git -C "$REPO_DIR" rev-parse --verify -q "origin/$BRANCH" 2>/dev/null \
   || git -C "$REPO_DIR" rev-parse --verify -q "$BRANCH" 2>/dev/null || true)
BASE=$(git -C "$REPO_DIR" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/master)

if [[ -n "$SHA" ]]; then
  if git -C "$REPO_DIR" merge-base --is-ancestor "$SHA" "$BASE" 2>/dev/null; then
    pass "the branch tip is an ancestor of $BASE — the work landed"
  else
    fail "the branch tip is NOT on $BASE — nothing below matters until it is"
  fi
else
  note "no ref for $BRANCH anywhere; assuming it merged and was deleted"
fi

# "no remote ref" has TWO causes and they are opposite: pushed-and-deleted (done)
# or never-pushed (very much not done). The script cannot tell them apart, so it
# must not print a green "deleted" for both — that is exactly the misleading
# message the workspace's error standard forbids. feat/session-strip-motion is
# the live example: alive, unmerged, never pushed, and an earlier draft of this
# script called it "deleted".
if git -C "$REPO_DIR" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  fail "remote branch still exists — git push origin --delete $BRANCH"
elif [[ -n "$SHA" ]] && git -C "$REPO_DIR" merge-base --is-ancestor "$SHA" "$BASE" 2>/dev/null; then
  pass "remote branch deleted (the tip is on $BASE, so it was pushed and cleaned up)"
else
  note "no remote ref — either never pushed, or pushed and deleted; the merge check above is the real answer"
fi

git -C "$REPO_DIR" show-ref --verify -q "refs/heads/$BRANCH" \
  && fail "local branch still exists — git branch -D $BRANCH  (-D, not -d: --no-ff merges leave the tip non-ancestral)" \
  || pass "local branch deleted"

WT=$(git -C "$REPO_DIR" worktree list --porcelain | sed -n 's/^worktree //p' \
     | while read -r p; do
         [[ "$(git -C "$p" branch --show-current 2>/dev/null)" == "$BRANCH" ]] && echo "$p"
       done)
if [[ -n "$WT" ]]; then
  fail "worktree still registered at $WT — git worktree remove '$WT'"
else
  pass "no worktree left on this branch"
fi

for d in "$WORKSPACE"/worktrees/*/; do
  [[ -d "$d" && ! -e "${d%/}/.git" ]] && fail "unregistered leftover directory: ${d%/}"
done

echo
echo "Docs"

# Scoped to THIS branch. A doc naming a branch that no longer exists holds
# commands that error instead of answering, and claims that read as current.
DEAD=$(rg -l --glob '!docs/archive/**' -F "$BRANCH" "$WORKSPACE/docs/active" "$WORKSPACE/ROADMAP.md" 2>/dev/null || true)
if [[ -n "$DEAD" ]]; then
  fail "these still name the branch — commands in them will error, not answer:"
  echo "$DEAD" | sed "s|^$WORKSPACE/|       |"
else
  pass "no live doc names the branch"
fi

# Also scoped: only docs that mention the branch AND are marked shipped. The
# unscoped version of this check reports the same handful of unrelated files on
# every run, for every branch, forever.
if [[ -n "$DEAD" ]]; then
  SHIPPED=$(echo "$DEAD" | xargs rg -l '^status: shipped' 2>/dev/null || true)
  if [[ -n "$SHIPPED" ]]; then
    fail "marked shipped, names this branch, still under docs/active/ — move to docs/archive/:"
    echo "$SHIPPED" | sed "s|^$WORKSPACE/|       |"
  fi
fi

ALL_SHIPPED=$(rg -l '^status: shipped' "$WORKSPACE/docs/active" 2>/dev/null | wc -l)
[[ "$ALL_SHIPPED" -gt 0 ]] && note "($ALL_SHIPPED doc(s) marked shipped are still in docs/active/ overall — not necessarily yours)"

note "ROADMAP: flip the item for this work to [x] in the SAME session (CLAUDE.md)"
note "docs/MAP.md: does the merged subsystem have a row and a hot path? 'no rule' is an answer; 'no row' is not"
note "archived docs: repoint cross-links that still point at docs/active/"

echo
echo "Deploy"
if [[ "$REPO" == "wecoded-marketplace" ]]; then
  note "merging to master AUTO-DEPLOYS the Cloudflare Worker via .github/workflows/worker-deploy.yml"
  note "never run wrangler deploy by hand"
else
  note "no auto-deploy on merge for $REPO"
fi

echo
echo "Verify"
note "bash scripts/verify.sh              (desktop only — Android and worker need their own commands)"
note "node scripts/audit-anchors.mjs      (docs, rules, MAP, budgets)"

echo
if [[ $FAILED -eq 0 ]]; then
  echo "Nothing mechanical outstanding. The '--' lines still need a human."
else
  echo "$FAILED mechanical item(s) outstanding. The '--' lines still need a human."
fi
exit 0
EOF
chmod +x scripts/close-out.sh
```

- [ ] **Step 2: Run it against a branch known to be fully closed out**

```bash
cd /home/destin/youcoded-dev && bash scripts/close-out.sh feat/games-arcade-shell youcoded
```

Expected: every Git check `OK` (the arcade was fully closed out on 2026-08-31),
and the Docs section either clean or naming the exact files still to fix. Read
the output — if a check reports `OK` where you know the answer is no, the check
is wrong and must be fixed before the script is committed.

- [ ] **Step 3: Run it against a branch that is still open, to prove it can say no**

```bash
cd /home/destin/youcoded-dev && bash scripts/close-out.sh feat/session-strip-motion youcoded
```

Expected: `TODO` on the merge check, the local branch and the worktree, and a
non-zero outstanding count. A close-out script that cannot distinguish an open
branch from a closed one is worthless — this step is the guard, and it is the
reason Step 2 alone is not enough.

Verified 2026-08-31: this branch has a live worktree, uncommitted work, a local
ref, **no remote ref**, and is not an ancestor of master. The remote line must
read `-- no remote ref — either never pushed, or pushed and deleted`, **not**
`OK remote branch deleted`. If you see the `OK`, the conditional from Step 1 was
transcribed wrong — fix it before committing. A green line on an open branch is
the precise failure this whole plan is about: a check that says "fine" when it
does not know.

- [ ] **Step 4: Add the pointer to `CLAUDE.md`**

Under **Clean up worktrees and branches after merging to master**, after the
existing three-command block:

```markdown
`bash scripts/close-out.sh <branch> [<repo>]` reports all of the above plus the
docs half — live docs still naming the branch, shipped docs still under
`docs/active/`, and the ROADMAP/MAP items. Read-only, always exits 0: it tells
you what is left, it does not do it.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/close-out.sh CLAUDE.md
git commit -m "feat(scripts): close-out.sh — the eleven-step merge sequence, reported

Closing out the games arcade needed eleven steps across two repos and the
workspace; several were nearly missed and recovered only by re-reading CLAUDE.md
mid-task. Read-only on purpose: half the sequence needs judgement. Every check is
scoped to the named branch — the unscoped version was measured at 78 warnings on
its first run and rejected."
```

---

## Task 7: Close out the three retrospectives

**Why:** this is the finding that reframes the others. Each new session that
opens a retrospective cannot tell which recommendations are live, so the
unshipped half gets rediscovered instead of finished — one item in the 2026-08-28
study is the same subject as Task 3 of this plan.

**Read this before starting — the source investigation is wrong about the first
document, and this plan's own first draft repeated the error.** Verify every
state against the tree; do not carry forward any state asserted here or in the
source without checking it. The two corrections below are already verified:

**Correction 1 — the 2026-07-28 document is not `status: active`.** Its
frontmatter reads:

```
status: partly applied 2026-07-28 — Proposals 1 and 2 done; 3, 4 and 5 STILL OPEN
        and untracked (re-verified 2026-08-26)
```

and its header says Proposal 2 (guard non-vacuity) **shipped as
`desktop/tests/helpers/guard-scope.ts`, PR #267** — a file that exists. So its
items are *not* indistinguishable, and Proposal 2 was code, not an unwritten
paragraph. The open items are **3, 4 and 5**.

**Correction 2 — sample sizes.** The source says "the two prior retrospectives
sampled 46 and 55 sessions". The 2026-08-28 study is n=46 (stated in its
`method:` line). The 2026-07-28 study's scope line reads *"the menu-internals
session, 2026-07-26 → 2026-07-28 (26 commits, PR #264)"* — **one** session. There
is no 55-session study.

**Files:**
- Modify then move: `docs/active/investigations/2026-07-28-session-retrospective-guardrails.md` → `docs/archive/investigations/`
- Modify then move: `docs/active/investigations/2026-08-28-session-opening-friction.md` → `docs/archive/investigations/`
- Modify then move: `docs/active/investigations/2026-08-31-session-retrospective-workspace-friction.md` → `docs/archive/investigations/`
- Modify: `ROADMAP.md`, `CLAUDE.md`, `.claude/rules/code-search.md`

- [ ] **Step 1: Mark every proposal in the 2026-07-28 retrospective**

Add a table at the top, one row per proposal, marked `shipped` (with the commit
or file that proves it), `dropped` (with the reason), or `carried` (with a
ROADMAP line number). Verified as of 2026-08-31:

| Proposal | State | Evidence |
|---|---|---|
| 1 (search discipline) | shipped | folded into the existing `CLAUDE.md` rule — see the doc's own header |
| 2 (guard scope + non-vacuity helpers) | **shipped** | `youcoded/desktop/tests/helpers/guard-scope.ts`, PR #267 |
| 3, 4, 5 | **open** | the doc's own frontmatter, re-verified 2026-08-26 — verify each against the tree before carrying |

- [ ] **Step 2: Mark every item in the 2026-08-28 study — using SECTION numbers**

**This document numbers things twice.** Sections `## 1 … ## 9` are the findings;
a closing "in order of payoff" table renumbers them. They do not line up. Use the
**section** numbers and say so in the table you add, or the next reader marks the
wrong items.

| § | Item | State | Evidence |
|---|---|---|---|
| 1 | Unquoted globs abort the command | shipped | `.claude/hooks/glob-guard.py`, `CLAUDE.md` → Investigation discipline |
| 2 | Auto-title hook fires ~6×/session | verify before marking | — |
| 3 | Serena guidance is dead text (0 uses / 46) | not shipped — **resolved by Step 4 below** | still in `CLAUDE.md:86`, and longer |
| 4 | "Review the attached document" has no procedure | not shipped | `.claude/commands/` holds only `audit.md` |
| 5 | Plans too long to read in one piece | verify before marking | — |
| 6 | Workspace not in the state `CLAUDE.md` promises | shipped (partly) | `CLAUDE.md` → "branch off `origin/master`"; session-start hook prints the behind-count |
| 7 | **Worktrees live in three different places** | **not done — NOT superseded** | root still holds `beta/`, `flappy-bird/`, `youcoded.wt/`; Task 3 edits rule frontmatter and touches none of this |
| 8 | `verify.sh` cries wolf | verify before marking | the desktop suite went green 2026-08-28 (youcoded#362) — this may now be moot |
| 9 | The same files get rediscovered — MAP stops one level too high | shipped | `docs/MAP.md:44`, hot-paths table |

§7 is the one to get right. An earlier draft of this plan marked it
*superseded — Task 3 fixes the mechanism the rule was a workaround for*. It does
not: §7 is about worktrees physically living in three places on disk, a
filesystem convention. It is still open, and marking it superseded is how an open
item disappears.

- [ ] **Step 3: Carry the unshipped items to `ROADMAP.md`**

`CLAUDE.md` is explicit that planned work lives in `ROADMAP.md`, not in an
investigation doc. Add one entry per carried item, typed and tagged, deduping
against existing entries **by file or symbol name, not by symptom** — the
2026-08-31 session filed a duplicate because it searched `flaky` instead of
`sync-spaces-engine`.

- [ ] **Step 4: Resolve the Serena paragraph (§3)**

Measured at 0 uses across 46 sessions and recommended for deletion; it has since
grown instead. Do not delete it — move it. `.claude/rules/code-search.md` already
covers Serena in depth and, after Task 3, actually fires on the files where it
matters. Cut the `CLAUDE.md` paragraph to one sentence pointing at that rule and
move the detail into it.

Headroom is confirmed: `code-search.md` is at **404/600 words** and the paragraph
is ~130, so it fits without a further trim.

```bash
cd /home/destin/youcoded-dev && node scripts/audit-anchors.mjs 2>&1 | rg 'eager'
```

Expected: an `eager ≈NNNN tokens` figure below the **6,738** recorded on
2026-08-31.

- [ ] **Step 5: Archive all three documents**

**Do this last, after Tasks 1–6 are complete and `bash scripts/verify.sh`-style
verification has passed** — it moves the file you are reading. Once these run,
this plan lives at `docs/archive/plans/2026-08-31-workspace-retrieval-repair.md`;
any later step that needs it must use that path.

```bash
cd /home/destin/youcoded-dev
mkdir -p docs/archive/reviews        # does not exist yet; git mv fails without it
                                     # (docs/archive/plans DOES already exist)

# The two prior retrospectives this plan finishes.
git mv docs/active/investigations/2026-07-28-session-retrospective-guardrails.md docs/archive/investigations/
git mv docs/active/investigations/2026-08-28-session-opening-friction.md docs/archive/investigations/

# This work's own paper trail.
git mv docs/active/investigations/2026-08-31-session-retrospective-workspace-friction.md docs/archive/investigations/
git mv docs/active/reviews/2026-08-31-retrieval-repair-plan-review.md docs/archive/reviews/
git mv docs/active/reviews/2026-08-31-retrieval-repair-plan-review-2.md docs/archive/reviews/
git mv docs/active/plans/2026-08-31-workspace-retrieval-repair.md docs/archive/plans/
```

Set `status:` in each — `superseded` for the two prior retrospectives (naming
this plan), `shipped` for the other four — and repoint any cross-link still
pointing at `docs/active/`.

**`shipped` here means "this PR ships it", written before the merge.** That is
the workspace's own convention (`CLAUDE.md`: docs move and the ROADMAP item flips
*in the same session*), and it is only wrong if the PR is abandoned — in which
case reverting the branch reverts this too. Do not let it become a reason to
leave the documents open, which is the exact failure this task exists to end.

- [ ] **Step 6: Set the precedent in `CLAUDE.md`**

Add one line under **Where Knowledge Lives**:

```markdown
**A retrospective is closed in the session that acts on it.** Every finding ends
as shipped, dropped, or a dated `ROADMAP.md` entry — then the document moves to
`docs/archive/`. Two retrospectives sat unclosed for weeks, and their unshipped
half was independently rediscovered twice.
```

- [ ] **Step 7: Commit**

`git mv` already stages both sides of each move, so the only things left to add
are the three files you edited. **Not `git add docs/active docs/archive`** —
`docs/active/` currently holds three other sessions' in-flight documents.

```bash
git status --short                       # every line here should be yours
git add ROADMAP.md CLAUDE.md .claude/rules/code-search.md
git commit -m "docs: close out three retrospectives — shipped, dropped, or on the ROADMAP

Their unshipped recommendations were independently rediscovered on 2026-08-31,
which is the finding that reframes that session's others. Two states carried in
the source were wrong and are corrected here: the 2026-07-28 study is 'partly
applied' with Proposals 3-5 open (Proposal 2 shipped as guard-scope.ts, PR #267),
and the worktree-location item is still open, not superseded."
```

---

## Final verification

- [ ] **Everything green, in one command**

```bash
cd /home/destin/youcoded-dev
node --test scripts/*.test.mjs .claude/hooks/*.test.mjs; echo "tests exit=$?"
node scripts/audit-anchors.mjs;      echo "audit exit=$?"
node scripts/audit-anchors.mjs --no-diff >/dev/null; echo "ci-mode exit=$?"
```

Expected: all unit tests pass; all three exits are 0; the summary reads
`worktree-safe globs: 0 blind · 5 exempt (named) · 2 reaching outside their repo`
with no `FAIL` block.

*(Run the three as separate lines. Chaining with `&&` means a red test suite
skips the audit entirely and you read `exit=0` from the wrong command — the same
shape as the `!cancelled()` guards the CI workflow already carries for this
reason.)*

*(Name the test files; `node --test <dir>` is rejected by the Node on this machine
(v26) — it tries to load the directory as a module and reports two phantom failures.
Verified 2026-08-31: the explicit form runs 91 tests, all passing.)*

- [ ] **The change did what it was for — from the log, not from reasoning**

```bash
rg 'test-suite-hygiene' ~/.claude/instructions-loaded.log | tail -10
```

The BEFORE lines from Task 2 Step 3 and the AFTER lines from Task 3 Step 12
should differ on exactly the worktree path. **This is the deliverable of the
whole plan.** If the log does not show the change, the glob migration was
correct-but-insufficient — say so in a new finding rather than declaring success.

- [ ] **CI agrees**

```bash
gh run list --repo itsdestin/youcoded-dev --workflow=workspace-ci.yml --limit 3
```

- [ ] **Open the PR**

```bash
cd /home/destin/youcoded-dev && gh pr create --fill
```

One PR for all seven tasks, opened after Task 7. The only separate PR is the
`youcoded` one from Task 4 Step 2, which must already have merged.

---

## What this plan deliberately does not do

- **Pin the four `youcoded/docs/**` globs.** Cut in the third draft, after
  measuring. Two earlier drafts held them back on the belief that relaxing them
  would fire the landing-page rule on the workspace's 1,332 `docs/` files; the
  measured answer is **one** extra file, in a repo scheduled for archival. What
  survives is the `# repo-pinned` escape hatch and its unit test, deliberately
  used by nothing — because `blind` fails the run and the first glob that
  genuinely needs a repo prefix must have an exit that is not a permanently red
  audit. What was cut is the ceremony: a pinning pass, a hard gate on an exempt
  count, and a README paragraph teaching a marker no rule uses.
- **Explain why `harness-tools.md` and `native-permissions.md` load at turn
  zero.** Task 2 Step 4 *observes* it and rules two causes in or out; it does not
  promise a fix. Four sightings, cause still unexplained. If Step 4 does not
  settle it, that is a `ROADMAP.md` `bug` tagged `#docs` **with the log excerpt
  attached** — which is still strictly better than the prose speculation it
  replaces.
- **Get `.claude/rules/` into the worktrees.** If Task 2 Step 3 returns cause (b)
  or (c), that — not this — is the real fix, and it is a different plan. Task 3
  is written to be abandoned in that case, not adapted.
- **A workspace-wide dead-branch-name check.** Cut, not deferred. Measured
  against the real tree it emits **78 warnings across 40 branches** on its first
  run, misclassifies a live-but-unpushed branch as dead, and false-positives on a
  file path that matches the branch-name shape. A plan whose complaint is unread
  numbers cannot ship a new one. The useful core survives, branch-scoped, in
  Task 6.
- **Theme B — "a new guard must be shown failing."** The gap is real: zero
  red-before-green *prose* exists across `CLAUDE.md`, `PITFALLS.md` and the 26
  rule files. It is deferred, not because "the paragraph was never written" — the
  2026-07-28 fix was `guard-scope.ts` and it shipped — but because the remaining
  gap is a convention, and conventions are the tier this workspace is worst at
  retrieving. When it is taken up it should be `scripts/prove-red.sh <test>
  <source…>` — stash the fix, run, restore, report both states — because a
  command executes and a paragraph asks to be honored. Task 3 Step 5 applies the
  principle in miniature by deleting a guard that could not fail.
- **A "does this subsystem have a MAP row?" detector.** The source names it as
  still-missing: *"The auditor still never checks that a shipped subsystem has a
  MAP row, only that the rows it has point at real files."* Task 5 fixes the
  other half of that signal; Task 6 keeps this half as a human `note`. Deferred
  because deciding a subsystem "shipped" is a judgement the auditor has no way to
  make. **ROADMAP it.**
- **ROADMAP entry size (C2).** 99,825 words across 407 entries is a real problem
  and the source's recommendation is to split the ten-paragraph entry at `:615`,
  not to build a search helper. Out of scope here; **ROADMAP it** rather than
  leaving it in an archived investigation.
- **Working-directory drift.** Filed as minor in the source (commands failing
  because the session cwd moved after a backgrounded command); n=1; **ROADMAP
  it**.
- **A `/close-out` skill.** Task 6 ships a script instead — a command executes.
- **`scripts/ci-wait.sh`.** n=1, filed as minor in the source.
- **Any change to sub-repo source.** The single exception is Task 4's deletion of
  `youcoded/.claude/rules/android-runtime.md`, which is a rule file, is explicitly
  scoped, and gets its own PR in that repo.
